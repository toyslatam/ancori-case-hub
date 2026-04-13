/**
 * Normaliza public/Sociedades.csv para import en Supabase (UUID, delimitador ;).
 *
 * - Une registros rotos por salto de línea dentro de comillas.
 * - Quita el literal NULL en columnas UUID opcionales (directores) → vacío.
 * - En client_id = NULL: intenta el mismo correo que otra fila con client_id válido;
 *   si hay varios clientes para el mismo correo, elige el UUID menor (determinista);
 *   si no hay correo coincidente, usa el client_id más frecuente en el archivo (moda).
 *
 * No elimina filas. Escribe public/Sociedades.supabase.csv y deja el original intacto.
 *
 * Uso: node scripts/fix-sociedades-csv.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const inPath = path.join(root, 'public', 'Sociedades.csv');
const outPath = path.join(root, 'public', 'Sociedades.supabase.csv');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPTIONAL_UUID = ['presidente_id', 'tesorero_id', 'secretario_id'];

function readSemicolonRecords(text) {
  const records = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQ = false;
        continue;
      }
      if (c === '\r') continue;
      if (c === '\n') {
        field += ' ';
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQ = true;
      continue;
    }
    if (c === ';') {
      row.push(field);
      field = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(field);
      records.push(row);
      row = [];
      field = '';
      continue;
    }
    field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }
  return records;
}

function escapeField(s) {
  const v = String(s ?? '').trim();
  if (/[;"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function normalizeNullUuidCell(v) {
  const t = (v ?? '').trim();
  if (t === '' || t.toUpperCase() === 'NULL') return '';
  return v.trim();
}

const raw = fs.readFileSync(inPath, 'utf8').replace(/^\uFEFF/, '');
const records = readSemicolonRecords(raw);
if (records.length < 2) {
  console.error('CSV vacío o sin datos');
  process.exit(1);
}

const header = records[0].map((h) => h.replace(/^\uFEFF/, '').trim());
const h = Object.fromEntries(header.map((name, i) => [name, i]));

const data = records.slice(1).filter((r) => r.some((c) => (c ?? '').trim() !== ''));

const freq = new Map();
for (const r of data) {
  const cid = (r[h.client_id] ?? '').trim();
  if (UUID_RE.test(cid)) freq.set(cid, (freq.get(cid) ?? 0) + 1);
}
let modeClient = '';
let modeN = 0;
for (const [id, n] of freq) {
  if (n > modeN) {
    modeN = n;
    modeClient = id;
  }
}

const emailTo = new Map();
for (const r of data) {
  const cid = (r[h.client_id] ?? '').trim();
  const em = (r[h.correo] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (UUID_RE.test(cid) && em) {
    if (!emailTo.has(em)) emailTo.set(em, new Set());
    emailTo.get(em).add(cid);
  }
}

let filledEmail = 0;
let filledAmbiguous = 0;
let filledMode = 0;
const ambiguousSamples = [];

for (const r of data) {
  for (const col of OPTIONAL_UUID) {
    const j = h[col];
    if (j === undefined) continue;
    r[j] = normalizeNullUuidCell(r[j]);
  }

  const j = h.client_id;
  let cid = (r[j] ?? '').trim();
  if (cid.toUpperCase() === 'NULL' || cid === '') {
    const em = (r[h.correo] ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const set = emailTo.get(em);
    if (set && set.size === 1) {
      r[j] = [...set][0];
      filledEmail++;
    } else if (set && set.size > 1) {
      const pick = [...set].sort()[0];
      r[j] = pick;
      filledAmbiguous++;
      if (ambiguousSamples.length < 5) {
        ambiguousSamples.push({ nombre: r[h.nombre], correo: em, elegido: pick });
      }
    } else {
      r[j] = modeClient;
      filledMode++;
    }
  } else if (!UUID_RE.test(cid)) {
    console.warn('client_id no UUID (se deja igual):', r[h.nombre]?.slice(0, 40), cid);
  }
}

const outLines = [
  header.map(escapeField).join(';'),
  ...data.map((r) => header.map((_, i) => escapeField(r[i] ?? '')).join(';')),
];
fs.writeFileSync(outPath, outLines.join('\n'), 'utf8');

console.log(
  JSON.stringify(
    {
      salida: path.relative(root, outPath),
      filas: data.length,
      client_id_rellenado_por_correo_unico: filledEmail,
      client_id_correo_ambiguo_eligio_menor_uuid: filledAmbiguous,
      client_id_sin_match_uso_moda: filledMode,
      moda_client_id: modeClient,
      moda_frecuencia: modeN,
      muestra_ambiguos: ambiguousSamples,
    },
    null,
    2
  )
);
