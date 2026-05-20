/**
 * fix-mercantil-client.mjs
 *
 * PARTE 1 — Genera public/mercantil_para_llenar.xlsx
 *   Lista de las 225 sociedades QB asignadas a MERCANTIL BANCO.
 *   La columna "CLIENTE CORRECTO (llenar)" queda vacía para que el usuario
 *   la complete mirando el QB ID en QuickBooks.
 *   Al terminar de llenar, ejecutar el script apply-mercantil-fix.mjs.
 *
 * PARTE 2 — Genera public/sociedades_export_qb.xlsx
 *   Todas las sociedades que tienen id_qb, en el mismo formato que Clientes.xls.
 *
 * Uso:
 *   node scripts/fix-mercantil-client.mjs
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

// ── helpers ──────────────────────────────────────────────────────────────────

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

function fmtDate(v) {
  if (!v) return '';
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${String(d.d).padStart(2,'0')}/${String(d.m).padStart(2,'0')}/${d.y}` : '';
  }
  return String(v);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();
  console.log('✓ Conectado a Supabase');

  try {
    // ── 1. Cargar datos de la BD ──────────────────────────────────────────
    const [clientsRes, societiesRes, directoresRes, casesRes] = await Promise.all([
      db.query('SELECT id, nombre FROM clients ORDER BY nombre'),
      db.query(`SELECT id, nombre, client_id, id_qb, ruc, dv, nit,
                       correo, telefono, tipo_sociedad, fecha_inscripcion,
                       presidente_id, tesorero_id, secretario_id
                FROM societies`),
      db.query('SELECT id, nombre FROM directores'),
      db.query('SELECT DISTINCT society_id FROM cases WHERE society_id IS NOT NULL'),
    ]);

    const dbClients    = clientsRes.rows;
    const dbSocieties  = societiesRes.rows;
    const dbDirectores = directoresRes.rows;
    const socWithCases = new Set(casesRes.rows.map(r => r.society_id));

    const socMapNorm = {};
    dbSocieties.forEach(s => { socMapNorm[norm(s.nombre)] = s; });

    const dirMap = {};
    dbDirectores.forEach(d => { dirMap[d.id] = d.nombre; });

    const clientMapNorm = {};
    dbClients.forEach(c => { clientMapNorm[norm(c.nombre)] = c; });

    // Detectar client_id de MERCANTIL en BD
    const mercantilClient = dbClients.find(c => norm(c.nombre).includes('MERCANTIL'));
    console.log('MERCANTIL client en BD:', mercantilClient?.nombre ?? '(no encontrado)');

    // ── 2. Cargar archivos Excel ──────────────────────────────────────────
    const actWb   = XLSX.readFile(path.join(ROOT, 'public/ACTUALIZACION DATOS CLIENTES (version 1).xlsx'));
    const actData = XLSX.utils.sheet_to_json(actWb.Sheets[actWb.SheetNames[0]], { defval: '' });
    const actMap  = {};
    actData.forEach(r => { const k = norm(r['SOCIEDAD']); if (k) actMap[k] = r; });

    const qbWb  = XLSX.readFile(path.join(ROOT, 'public/Clientes.xls'));
    const qbAll = XLSX.utils.sheet_to_json(qbWb.Sheets[qbWb.SheetNames[0]], { defval: '' });
    const qbMercantil = qbAll.filter(r =>
      String(r['Dirección física']).toUpperCase().includes('MERCANTIL')
    );
    console.log(`QB filas MERCANTIL: ${qbMercantil.length}`);

    // ── PARTE 1: Generar Excel para llenar ───────────────────────────────
    const fillRows = [];

    for (const qbRow of qbMercantil) {
      const qbName  = String(qbRow['Nombre']).trim();
      const qbNorm  = norm(qbName);
      const appSoc  = socMapNorm[qbNorm];
      const actRow  = actMap[qbNorm];
      const hasCases = appSoc ? socWithCases.has(appSoc.id) : false;

      // Pistas para identificar el cliente correcto
      const presidenteHint = actRow?.['PRESIDENTE']
        || (appSoc?.presidente_id ? dirMap[appSoc.presidente_id] : '')
        || String(qbRow['PRESIDENTE'] ?? '');
      const rucHint = actRow?.['R.U.C.'] || appSoc?.ruc || String(qbRow['RUC'] ?? '');
      const emailHint = appSoc?.correo || String(qbRow['Correo electrónico'] ?? '');
      // Cliente sugerido desde ACTUALIZACION (si hay match)
      const sugerido = actRow ? String(actRow['CLIENTE']).trim() : '';

      fillRows.push({
        'Sociedad (QB)':                   qbName,
        'QB ID':                           appSoc?.id_qb ?? String(qbRow['DV'] ?? ''),
        '⚠️ Tiene Casos en App':            hasCases ? 'SÍ' : '',
        'CLIENTE CORRECTO (llenar)':       sugerido, // vacío para que el usuario llene
        '— Pistas —':                      '',
        'Presidente':                      presidenteHint,
        'RUC':                             rucHint,
        'Correo':                          emailHint,
        'Teléfono':                        appSoc?.telefono ?? String(qbRow['Teléfono'] ?? ''),
        'En App':                          appSoc ? '✓' : '✗ No encontrada',
        'App UUID':                        appSoc?.id ?? '',
        'Sugerido por ACTUALIZACION':      sugerido,
      });
    }

    // Ordenar: primero los que tienen QB ID (más fácil de identificar)
    fillRows.sort((a, b) => {
      const aId = Number(a['QB ID']) || 9999999;
      const bId = Number(b['QB ID']) || 9999999;
      return aId - bId;
    });

    const fillWb = XLSX.utils.book_new();
    const fillWs = XLSX.utils.json_to_sheet(fillRows);
    fillWs['!cols'] = [
      {wch:45},{wch:10},{wch:18},{wch:35},{wch:12},
      {wch:30},{wch:22},{wch:32},{wch:18},{wch:16},{wch:38},{wch:30},
    ];
    XLSX.utils.book_append_sheet(fillWb, fillWs, 'MERCANTIL - llenar cliente');
    const fillPath = path.join(ROOT, 'public/mercantil_para_llenar.xlsx');
    XLSX.writeFile(fillWb, fillPath);
    console.log(`\n✓ Excel para llenar → public/mercantil_para_llenar.xlsx  (${fillRows.length} filas)`);
    console.log('  → Llena la columna "CLIENTE CORRECTO (llenar)" usando el QB ID como referencia en QuickBooks.');
    console.log('  → Luego ejecuta: node scripts/apply-mercantil-fix.mjs');

    const sinQbId = fillRows.filter(r => !r['QB ID'] || r['QB ID'] === '').length;
    const conCasos = fillRows.filter(r => r['⚠️ Tiene Casos en App'] === 'SÍ').length;
    console.log(`  → ${fillRows.length - sinQbId} tienen QB ID | ${sinQbId} sin QB ID | ${conCasos} con casos`);

    // ── PARTE 2: Exportar sociedades con id_qb ───────────────────────────
    const socWithQb = dbSocieties.filter(s => s.id_qb && String(s.id_qb).trim());

    const exportRows = socWithQb.map(s => {
      const actRow     = actMap[norm(s.nombre)];
      const client     = dbClients.find(c => c.id === s.client_id);
      const clientName = client?.nombre ?? '';

      const presidente = actRow?.['PRESIDENTE'] || dirMap[s.presidente_id] || '';
      const tesorero   = actRow?.['TESORERO']   || dirMap[s.tesorero_id]   || '';
      const secretario = actRow?.['SECRETARIO'] || dirMap[s.secretario_id] || '';
      const nit        = actRow?.['NIT']     || s.nit || '';
      const ruc        = actRow?.['R.U.C.']  || s.ruc || '';
      const dv         = actRow?.['D.V.']    || s.dv  || '';
      const fechaInsc  = actRow?.['FECHA INSC.']
        ? fmtDate(actRow['FECHA INSC.'])
        : (s.fecha_inscripcion ?? '');

      return {
        'Nombre':                s.nombre,
        'Razón social':          s.nombre,
        'Dirección física':      clientName,
        'Ciudad':                '',
        'Estado':                '',
        'País':                  '',
        'Código postal':         '',
        'Teléfono':              s.telefono || '',
        'Correo electrónico':    s.correo   || '',
        'RUC':                   ruc,
        'DIRECTORES':            '',
        'DV':                    dv,
        'DATOS TRIBUTARIOS':     '',
        'DIRECCION':             '',
        'TIPO DE SOCIEDAD':      s.tipo_sociedad || 'Sociedad',
        'NOMBRE DE CLIENTE':     '',
        'DATOS DEL CLIENTE':     '',
        'PRESIDENTE':            presidente,
        'TESORERO':              tesorero,
        'SECRETARIO':            secretario,
        'NIT.':                  nit,
        'CLIENTE.':              clientName,
        'FECHA DE CONSTITUCION': fechaInsc,
        'Archivos adjuntos':     0,
        'Saldo pendiente':       0,
        '— QB ID':               s.id_qb,
      };
    });

    const expWb = XLSX.utils.book_new();
    const expWs = XLSX.utils.json_to_sheet(exportRows);
    expWs['!cols'] = [
      {wch:45},{wch:45},{wch:30},{wch:12},{wch:12},{wch:12},
      {wch:12},{wch:16},{wch:32},{wch:22},{wch:14},{wch:6},
      {wch:16},{wch:16},{wch:18},{wch:16},{wch:16},
      {wch:30},{wch:30},{wch:30},{wch:16},{wch:30},{wch:22},
      {wch:10},{wch:12},{wch:10},
    ];
    XLSX.utils.book_append_sheet(expWb, expWs, 'Sociedades QB');
    const expPath = path.join(ROOT, 'public/sociedades_export_qb.xlsx');
    XLSX.writeFile(expWb, expPath);
    console.log(`✓ Excel export     → public/sociedades_export_qb.xlsx  (${exportRows.length} filas)`);

  } finally {
    await db.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
