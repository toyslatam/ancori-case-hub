import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'public', 'Sociedades.csv');

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ';') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter(Boolean);
const header = parseLine(lines[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const rows = lines.slice(1).map(parseLine);

const emailTo = new Map();
for (const r of rows) {
  const cid = (r[idx.client_id] ?? '').trim();
  const em = (r[idx.correo] ?? '').trim().toLowerCase();
  if (cid && /^[0-9a-f-]{36}$/i.test(cid) && em) {
    if (!emailTo.has(em)) emailTo.set(em, new Set());
    emailTo.get(em).add(cid);
  }
}

let u = 0,
  a = 0,
  n = 0;
for (const r of rows) {
  const c = (r[idx.client_id] ?? '').trim();
  if (c.toUpperCase() !== 'NULL') continue;
  const em = (r[idx.correo] ?? '').trim().toLowerCase();
  const s = emailTo.get(em);
  if (!s || s.size === 0) n++;
  else if (s.size > 1) a++;
  else u++;
}

const totalNull = rows.filter(
  (r) => (r[idx.client_id] ?? '').trim().toUpperCase() === 'NULL'
).length;
const badCols = rows.filter((r) => r.length !== header.length).length;

const badRows = [];
rows.forEach((r, i) => {
  if (r.length !== header.length) badRows.push({ line: i + 2, cols: r.length, preview: lines[i + 1].slice(0, 100) });
});

console.log(
  JSON.stringify(
    {
      headerCols: header.length,
      rows: rows.length,
      badCols,
      badRows,
      totalNull,
      uniqueEmailMatch: u,
      ambiguous: a,
      nomatch: n,
    },
    null,
    2
  )
);
