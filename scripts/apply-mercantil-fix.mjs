/**
 * apply-mercantil-fix.mjs
 *
 * Lee public/mercantil_para_llenar.xlsx (con la columna "CLIENTE CORRECTO" ya
 * completada por el usuario), busca cada sociedad en la BD y actualiza su
 * client_id al cliente correcto.
 *
 * Seguridad:
 *   - Solo actualiza si la sociedad existe en la BD.
 *   - Solo actualiza si el client_id actual es el de MERCANTIL BANCO.
 *   - Nunca toca el client_id de casos — solo el de la sociedad.
 *   - Registra un log detallado antes de tocar nada (usa --dry para solo ver).
 *
 * Uso:
 *   node scripts/apply-mercantil-fix.mjs --dry    → solo muestra qué haría
 *   node scripts/apply-mercantil-fix.mjs          → aplica los cambios
 */

import pkg from 'pg';
import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const { Client } = pkg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres.jyqdfjonikorlwmjepgd:Ctauditores2026**@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const DRY = process.argv.includes('--dry');

function norm(s) {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[,\.;:]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bS\.?A\.?\b/g, 'SA')
    .replace(/\bINC\.?\b/g, 'INC')
    .replace(/\bCORP\.?\b/g, 'CORP')
    .replace(/\bLTDA\.?\b/g, 'LTDA')
    .trim();
}

function findClient(clientMap, name) {
  if (!name?.trim()) return null;
  const n = norm(name);
  if (clientMap[n]) return clientMap[n];
  // partial match
  for (const [key, val] of Object.entries(clientMap)) {
    if (n.length >= 5 && (key.includes(n) || n.includes(key))) return val;
  }
  return null;
}

async function main() {
  const filePath = path.join(ROOT, 'public/mercantil_para_llenar.xlsx');
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });

  // Filtrar solo filas con "CLIENTE CORRECTO (llenar)" completado
  const toProcess = rows.filter(r => {
    const v = String(r['CLIENTE CORRECTO (llenar)'] ?? '').trim();
    return v && !v.toUpperCase().includes('MERCANTIL');
  });

  console.log(`Filas en Excel: ${rows.length} | Con cliente correcto: ${toProcess.length}`);

  if (toProcess.length === 0) {
    console.log('No hay filas con cliente correcto completado. Llena la columna "CLIENTE CORRECTO (llenar)" en el Excel y vuelve a ejecutar.');
    return;
  }

  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  console.log('✓ Conectado a Supabase');

  try {
    const [clientsRes, societiesRes] = await Promise.all([
      db.query('SELECT id, nombre FROM clients ORDER BY nombre'),
      db.query('SELECT id, nombre, client_id, id_qb FROM societies'),
    ]);

    const dbClients   = clientsRes.rows;
    const dbSocieties = societiesRes.rows;

    const clientMapNorm = {};
    dbClients.forEach(c => { clientMapNorm[norm(c.nombre)] = c; });

    const socMapNorm = {};
    dbSocieties.forEach(s => { socMapNorm[norm(s.nombre)] = s; });

    // Identificar MERCANTIL client_id
    const mercantilClient = findClient(clientMapNorm, 'MERCANTIL BANCO') ||
      findClient(clientMapNorm, 'MERCANTIL');
    if (!mercantilClient) {
      console.error('No se encontró el cliente MERCANTIL BANCO en la BD.');
      return;
    }
    console.log(`MERCANTIL client_id: ${mercantilClient.id} (${mercantilClient.nombre})\n`);

    let ok = 0, skippedNF = 0, skippedNotMerc = 0, skippedClientNF = 0, errors = 0;

    for (const row of toProcess) {
      const societadQB    = String(row['Sociedad (QB)'] ?? '').trim();
      const correctCName  = String(row['CLIENTE CORRECTO (llenar)'] ?? '').trim();
      const appUUID       = String(row['App UUID'] ?? '').trim();

      // Buscar sociedad: primero por UUID (más preciso), luego por nombre
      let appSoc = appUUID ? dbSocieties.find(s => s.id === appUUID) : null;
      if (!appSoc) appSoc = socMapNorm[norm(societadQB)];

      if (!appSoc) {
        console.log(`  ✗ [No en App]    ${societadQB}`);
        skippedNF++;
        continue;
      }

      if (appSoc.client_id !== mercantilClient.id) {
        console.log(`  ⚠ [Ya cambiado]  ${appSoc.nombre} → actual: ${dbClients.find(c=>c.id===appSoc.client_id)?.nombre}`);
        skippedNotMerc++;
        continue;
      }

      const correctClient = findClient(clientMapNorm, correctCName);
      if (!correctClient) {
        console.log(`  ✗ [Cliente NF]   ${appSoc.nombre} → "${correctCName}" no encontrado en BD`);
        skippedClientNF++;
        continue;
      }

      const hasCases = row['⚠️ Tiene Casos en App'] === 'SÍ';
      const flag     = hasCases ? ' [tiene casos — solo society]' : '';

      if (DRY) {
        console.log(`  ○ [DRY] ${appSoc.nombre} → ${correctClient.nombre}${flag}`);
        ok++;
        continue;
      }

      try {
        const res = await db.query(
          `UPDATE societies
              SET client_id = $1
            WHERE id = $2
              AND client_id = $3`,
          [correctClient.id, appSoc.id, mercantilClient.id]
        );
        if (res.rowCount > 0) {
          console.log(`  ✓ ${appSoc.nombre} → ${correctClient.nombre}${flag}`);
          ok++;
        } else {
          console.log(`  ⚠ [Sin cambio]   ${appSoc.nombre} (¿ya actualizado?)`);
          skippedNotMerc++;
        }
      } catch (e) {
        console.error(`  ✗ ERROR ${appSoc.nombre}: ${e.message}`);
        errors++;
      }
    }

    console.log(`\n── Resultado ──────────────────────────────`);
    if (DRY) console.log('  (modo --dry: no se aplicaron cambios)');
    console.log(`  Actualizadas/OK:      ${ok}`);
    console.log(`  No en App:            ${skippedNF}`);
    console.log(`  Ya tenían otro client: ${skippedNotMerc}`);
    console.log(`  Cliente no en BD:     ${skippedClientNF}`);
    console.log(`  Errores:              ${errors}`);

  } finally {
    await db.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
