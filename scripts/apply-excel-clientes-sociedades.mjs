/**
 * Lee el Excel de actualización y alinea client_id de sociedades con la columna CLIENTE.
 *
 * Uso (prueba primeras 10 filas con datos):
 *   node scripts/apply-excel-clientes-sociedades.mjs
 *   node scripts/apply-excel-clientes-sociedades.mjs --dry-run
 *   node scripts/apply-excel-clientes-sociedades.mjs --limit=10
 *   node scripts/apply-excel-clientes-sociedades.mjs --limit=500
 *
 * Requiere DATABASE_URL (o SUPABASE_DATABASE_URL) en .env.local (mismo patrón que run-seed).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import * as XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env.local') });
dotenv.config({ path: path.join(root, '.env') });

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, parseInt(limitArg.split('=')[1], 10) || 10) : 10;
const sheetArg = args.find((a) => a.startsWith('--sheet='));
const forcedSheet = sheetArg ? sheetArg.slice('--sheet='.length).trim() : '';
const onlyArg = args.find((a) => a.startsWith('--only='));
const onlySociety = onlyArg ? onlyArg.slice('--only='.length).trim() : '';

const EXCEL_NAME = 'ACTUALIZACION DATOS CLIENTES (version 1).xlsx';
const excelPath = path.join(root, 'public', EXCEL_NAME);

function norm(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function mapTipoExcelToDb(t) {
  const u = String(t ?? '').trim().toUpperCase();
  if (u === 'SOCIEDAD' || u === 'SOCIEDADES') return 'SOCIEDADES';
  if (u === 'FUNDACION' || u === 'FUNDACIONES') return 'FUNDACIONES';
  if (u === 'B.V.I' || u === 'BVI' || u.startsWith('B.V.I')) return 'B.V.I';
  return 'SOCIEDADES';
}

async function findSocietyId(client, nombreExcel) {
  const raw = String(nombreExcel ?? '').trim();
  if (!raw) return null;
  const n = norm(raw);
  const k = normKey(raw);

  const exact = await client.query(
    `select id, nombre, client_id
     from public.societies
     where lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = $1
        or lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', '', 'g')) = $2
     limit 1`,
    [n, k],
  );
  if (exact.rows[0]) return exact.rows[0];

  const prefix = await client.query(
    `select id, nombre, client_id
     from public.societies
     where lower(trim(nombre)) like $1 || '%'
     order by length(nombre) asc
     limit 3`,
    [n],
  );
  if (prefix.rows.length === 1) return prefix.rows[0];
  if (prefix.rows.length > 1) {
    const best = prefix.rows.find((r) => norm(r.nombre) === n) ?? prefix.rows[0];
    return best;
  }

  const contains = await client.query(
    `select id, nombre, client_id
     from public.societies
     where lower(nombre) like '%' || $1 || '%'
     order by length(nombre) asc
     limit 5`,
    [n.replace(/\s+/g, '%')],
  );
  if (contains.rows.length === 1) return contains.rows[0];
  if (contains.rows.length > 1) {
    const exact2 = contains.rows.find((r) => norm(r.nombre) === n);
    if (exact2) return exact2;
    return contains.rows[0];
  }

  return null;
}

async function findOrCreateClient(client, nombreCliente) {
  const raw = String(nombreCliente ?? '').trim();
  if (!raw) return { id: null, created: false, reason: 'cliente_vacío' };

  const n = norm(raw);

  const ex = await client.query(
    `select id, nombre from public.clients
     where activo = true
       and lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = $1
     limit 1`,
    [n],
  );
  if (ex.rows[0]) return { id: ex.rows[0].id, created: false, reason: 'encontrado' };

  const like = await client.query(
    `select id, nombre from public.clients
     where activo = true
       and (lower(trim(nombre)) like $1 || '%' or lower(trim(nombre)) like '%' || $1 || '%')
     order by length(nombre) asc
     limit 5`,
    [n],
  );
  if (like.rows.length === 1) return { id: like.rows[0].id, created: false, reason: 'similar' };
  if (like.rows.length > 1) {
    const exact2 = like.rows.find((r) => norm(r.nombre) === n);
    if (exact2) return { id: exact2.id, created: false, reason: 'similar_exacto' };
    return { id: like.rows[0].id, created: false, reason: 'similar_varios' };
  }

  if (dryRun) {
    return { id: null, created: false, reason: 'crearía_cliente (dry-run)' };
  }

  const ins = await client.query(
    `insert into public.clients (nombre, razon_social, email, telefono, identificacion, direccion, activo)
     values ($1, $1, '', '', '', '', true)
     returning id`,
    [raw],
  );
  return { id: ins.rows[0].id, created: true, reason: 'creado' };
}

async function findOrCreateDirector(client, nombre) {
  const raw = String(nombre ?? '').trim();
  if (!raw) return { id: null, created: false, reason: 'director_vacío' };
  const n = norm(raw);
  const k = normKey(raw);

  const ex = await client.query(
    `select id, nombre from public.directores
     where activo = true
       and (lower(regexp_replace(trim(nombre), '\\s+', ' ', 'g')) = $1
            or lower(regexp_replace(nombre, '[^a-zA-Z0-9]+', '', 'g')) = $2)
     limit 1`,
    [n, k],
  );
  if (ex.rows[0]) return { id: ex.rows[0].id, created: false, reason: 'encontrado' };

  if (dryRun) return { id: null, created: false, reason: 'crearía_director (dry-run)' };

  const ins = await client.query(
    `insert into public.directores (nombre, comentarios, activo, tipo_documento)
     values ($1, '', true, 'Otro')
     returning id`,
    [raw],
  );
  return { id: ins.rows[0].id, created: true, reason: 'creado' };
}

function findHeaderRow(matrix) {
  for (let r = 0; r < Math.min(matrix.length, 15); r++) {
    const row = matrix[r] ?? [];
    const lower = row.map((c) => String(c ?? '').trim().toUpperCase());
    const idxSoc = lower.findIndex((h) => h === 'SOCIEDAD' || h.includes('SOCIEDAD'));
    const idxCli = lower.findIndex((h) => h === 'CLIENTE' || h === 'CLIENTE ');
    if (idxSoc >= 0 && idxCli >= 0) return { row: r, colSoc: idxSoc, colCli: idxCli, colTipo: lower.findIndex((h) => h === 'TIPO') };
  }
  return null;
}

function buildHeaderIndex(row) {
  const upper = (row ?? []).map((c) => String(c ?? '').trim().toUpperCase());
  const findOneOf = (names) => {
    for (const n of names) {
      const i = upper.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  return {
    SOCIEDAD: findOneOf(['SOCIEDAD']),
    CLIENTE: findOneOf(['CLIENTE']),
    TIPO: findOneOf(['TIPO']),
    RUC: findOneOf(['R.U.C', 'RUC']),
    DV: findOneOf(['D.V', 'DV']),
    NIT: findOneOf(['NIT']),
    PRESIDENTE: findOneOf(['PRESIDENTE']),
    TESORERO: findOneOf(['TESORERO']),
    SECRETARIO: findOneOf(['SECRETARIO']),
    FECHA_INSC: findOneOf(['FECHA INSC', 'FECHA', 'INSCRIP']),
  };
}

function excelDateToIso(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

async function main() {
  if (!databaseUrl) {
    console.error('Falta DATABASE_URL o SUPABASE_DATABASE_URL en .env.local');
    process.exit(1);
  }
  if (!fs.existsSync(excelPath)) {
    console.error('No existe el archivo:', excelPath);
    process.exit(1);
  }

  const buf = fs.readFileSync(excelPath);
  const wb = XLSX.read(buf, { type: 'buffer' });

  let sheetName = null;
  let matrix = null;
  let hdr = null;
  const candidates = forcedSheet ? [forcedSheet] : wb.SheetNames;
  for (const name of candidates) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const m = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const h = findHeaderRow(m);
    if (h) {
      sheetName = name;
      matrix = m;
      hdr = h;
      break;
    }
  }
  if (!hdr || !matrix) {
    console.error(
      forcedSheet
        ? `No se encontró cabecera SOCIEDAD/CLIENTE en la hoja "${forcedSheet}".`
        : 'No se encontró ninguna hoja con columnas SOCIEDAD y CLIENTE.'
    );
    process.exit(1);
  }

  const headerRow = matrix[hdr.row] ?? [];
  const H = buildHeaderIndex(headerRow);

  const rows = [];
  for (let r = hdr.row + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const soc = String(row[H.SOCIEDAD] ?? '').trim();
    const cli = String(row[H.CLIENTE] ?? '').trim();
    if (!soc && !cli) continue;
    rows.push({
      rowNum: r + 1,
      sociedad: soc,
      cliente: cli,
      tipo: H.TIPO >= 0 ? String(row[H.TIPO] ?? '').trim() : '',
      ruc: H.RUC >= 0 ? String(row[H.RUC] ?? '').trim() : '',
      dv: H.DV >= 0 ? String(row[H.DV] ?? '').trim() : '',
      nit: H.NIT >= 0 ? String(row[H.NIT] ?? '').trim() : '',
      presidente: H.PRESIDENTE >= 0 ? String(row[H.PRESIDENTE] ?? '').trim() : '',
      tesorero: H.TESORERO >= 0 ? String(row[H.TESORERO] ?? '').trim() : '',
      secretario: H.SECRETARIO >= 0 ? String(row[H.SECRETARIO] ?? '').trim() : '',
      fecha_insc_raw: H.FECHA_INSC >= 0 ? row[H.FECHA_INSC] : '',
    });
  }

  const filteredRows = onlySociety
    ? rows.filter((x) => normKey(x.sociedad) === normKey(onlySociety) || norm(x.sociedad) === norm(onlySociety))
    : rows;
  const toProcess = filteredRows.slice(0, limit);
  console.log(
    `Hoja: "${sheetName}" | cabecera fila ${hdr.row + 1} | procesando ${toProcess.length} fila(s) (limit=${limit}) | dry-run=${dryRun}` +
      (onlySociety ? ` | only=${onlySociety}` : ''),
  );

  const useSsl = !/localhost|127\.0\.0\.1/i.test(databaseUrl);
  const pool = new pg.Client({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  await pool.connect();

  try {
    for (const item of toProcess) {
      if (!item.sociedad) {
        console.log(`Fila Excel ${item.rowNum}: omitida (sin SOCIEDAD)`);
        continue;
      }
      if (!item.cliente) {
        console.log(`Fila Excel ${item.rowNum}: omitida (sin CLIENTE): ${item.sociedad}`);
        continue;
      }

      const soc = await findSocietyId(pool, item.sociedad);
      if (!soc) {
        console.warn(`Fila Excel ${item.rowNum}: NO se encontró sociedad en BD: "${item.sociedad}"`);
        continue;
      }

      const cl = await findOrCreateClient(pool, item.cliente);
      if (!cl.id) {
        console.warn(`Fila Excel ${item.rowNum}: sin cliente resuelto: "${item.cliente}" (${cl.reason})`);
        continue;
      }

      const same = String(soc.client_id) === String(cl.id);
      const tipoDb = item.tipo ? mapTipoExcelToDb(item.tipo) : null;
      const fechaInsc = excelDateToIso(item.fecha_insc_raw);

      const pres = item.presidente ? await findOrCreateDirector(pool, item.presidente) : { id: null, created: false, reason: 'sin' };
      const tes = item.tesorero ? await findOrCreateDirector(pool, item.tesorero) : { id: null, created: false, reason: 'sin' };
      const sec = item.secretario ? await findOrCreateDirector(pool, item.secretario) : { id: null, created: false, reason: 'sin' };

      const hasSocUpdates =
        !same ||
        Boolean(tipoDb) ||
        Boolean(item.ruc) ||
        Boolean(item.dv) ||
        Boolean(item.nit) ||
        Boolean(fechaInsc) ||
        Boolean(pres.id) ||
        Boolean(tes.id) ||
        Boolean(sec.id);

      if (!hasSocUpdates) {
        console.log(`Fila ${item.rowNum}: OK ya vinculada — ${soc.nombre} → cliente ${cl.id}${cl.created ? ' (nuevo)' : ''}`);
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] Fila ${item.rowNum}: ${soc.nombre} | client_id actual ${soc.client_id} → ${cl.id} | cliente "${item.cliente}" (${cl.reason})`,
        );
        if (tipoDb) console.log(`  + actualizaría tipo_sociedad a ${tipoDb}`);
        if (item.ruc || item.dv || item.nit) console.log(`  + actualizaría RUC/DV/NIT a ${item.ruc}/${item.dv}/${item.nit}`);
        if (fechaInsc) console.log(`  + actualizaría fecha_inscripcion a ${fechaInsc}`);
        if (item.presidente) console.log(`  + actualizaría presidente a "${item.presidente}" (${pres.reason})`);
        if (item.tesorero) console.log(`  + actualizaría tesorero a "${item.tesorero}" (${tes.reason})`);
        if (item.secretario) console.log(`  + actualizaría secretario a "${item.secretario}" (${sec.reason})`);
        continue;
      }

      await pool.query('begin');
      try {
        await pool.query(
          `update public.societies
           set client_id = $1::uuid,
               ruc = coalesce(nullif($3::text, ''), ruc),
               dv = coalesce(nullif($4::text, ''), dv),
               nit = coalesce(nullif($5::text, ''), nit),
               presidente_id = coalesce($6::uuid, presidente_id),
               tesorero_id = coalesce($7::uuid, tesorero_id),
               secretario_id = coalesce($8::uuid, secretario_id),
               fecha_inscripcion = coalesce($9::date, fecha_inscripcion)
           where id = $2::uuid`,
          [cl.id, soc.id, item.ruc, item.dv, item.nit, pres.id, tes.id, sec.id, fechaInsc],
        );
        if (tipoDb) {
          await pool.query(`update public.societies set tipo_sociedad = $1 where id = $2::uuid and tipo_sociedad is distinct from $1`, [
            tipoDb,
            soc.id,
          ]);
        }
        await pool.query('commit');
        console.log(
          `Fila ${item.rowNum}: actualizado — ${soc.nombre} → client_id ${cl.id} (${item.cliente})` +
            `${cl.created ? ' [cliente creado]' : ''}` +
            `${pres.created || tes.created || sec.created ? ' [director(es) creado(s)]' : ''}`,
        );
      } catch (e) {
        await pool.query('rollback');
        throw e;
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
