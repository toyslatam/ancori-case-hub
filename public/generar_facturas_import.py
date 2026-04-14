"""
generar_facturas_import.py
==========================
Genera los archivos para importar facturas de SharePoint a Supabase via CSV.

PRERREQUISITOS
--------------
Los archivos facturas_enc_raw.csv y facturas_det_raw.csv deben existir.
Si no, convertir los .xlsx con PowerShell:

  $xl = New-Object -ComObject Excel.Application
  $xl.Visible = $false; $xl.DisplayAlerts = $false
  $wb = $xl.Workbooks.Open("$PWD\\Facturas encabezado.xlsx")
  $wb.Sheets(1).SaveAs("$PWD\\facturas_enc_raw.csv", 6); $wb.Close()
  $wb = $xl.Workbooks.Open("$PWD\\Facturas detalle.xlsx")
  $wb.Sheets(1).SaveAs("$PWD\\facturas_det_raw.csv", 6); $wb.Close()
  $xl.Quit()

EJECUTAR
--------
  python generar_facturas_import.py

GENERA
------
  1_preimport.sql          -> Ejecutar PRIMERO en Supabase SQL Editor
  facturas_enc_import.csv  -> Importar en tabla case_invoices
  facturas_det_import.csv  -> Importar en tabla invoice_lines
  2_postimport.sql         -> Ejecutar DESPUES en Supabase SQL Editor
"""

import csv, sys, uuid, re, io
from datetime import datetime, date

# ── Utilidades ─────────────────────────────────────────────────────────────────

def load_csv(path):
    for enc in ['utf-8-sig', 'latin-1', 'cp1252']:
        try:
            with open(path, encoding=enc) as f:
                return list(csv.DictReader(f))
        except (UnicodeDecodeError, FileNotFoundError):
            pass
    raise FileNotFoundError(path)

def parse_date(s):
    if not s or not s.strip():
        return None
    s = s.strip()
    for fmt in ('%m/%d/%Y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%y'):
        try:
            return datetime.strptime(s, fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return None

def n_tarea_int(s):
    if not s or not s.strip():
        return None
    try:
        return int(float(s))
    except ValueError:
        return None

def norm(s):
    return re.sub(r'\s+', ' ', s.strip().lower()) if s else ''

def find_in_dict(d, key, partial=True):
    """Busca key en diccionario, primero exacto luego parcial."""
    k = norm(key)
    if k in d:
        return d[k]
    if partial:
        for dk, v in d.items():
            if dk in k or k in dk:
                return v
    return None

# ── Cargar referencias ─────────────────────────────────────────────────────────

print("Cargando referencias...")

societies_by_name: dict[str, str] = {}
try:
    for r in load_csv('societies_rows.csv'):
        nc = next((k for k in r if 'nombre' in k.lower()), None)
        ic = next((k for k in r if k.strip().lower() == 'id'), None)
        if nc and ic:
            societies_by_name[norm(r[nc])] = r[ic].strip()
    print(f"  Sociedades: {len(societies_by_name)}")
except FileNotFoundError:
    print("  WARN: societies_rows.csv no encontrado")

terms_by_name: dict[str, str] = {}
try:
    for r in load_csv('invoice_terms_rows.csv'):
        nc = next((k for k in r if 'nombre' in k.lower()), None)
        ic = next((k for k in r if k.strip().lower() == 'id'), None)
        if nc and ic:
            terms_by_name[norm(r[nc])] = r[ic].strip()
    print(f"  Terminos:   {len(terms_by_name)}")
except FileNotFoundError:
    print("  WARN: invoice_terms_rows.csv no encontrado (ejecuta en Supabase: SELECT id,nombre FROM public.invoice_terms)")

# ── Leer fuente ────────────────────────────────────────────────────────────────

print("\nLeyendo CSVs de SharePoint...")
try:
    enc_rows = load_csv('facturas_enc_raw.csv')
except FileNotFoundError:
    print("ERROR: facturas_enc_raw.csv no encontrado")
    sys.exit(1)

try:
    det_rows = load_csv('facturas_det_raw.csv')
except FileNotFoundError:
    print("ERROR: facturas_det_raw.csv no encontrado")
    sys.exit(1)

# ── Procesar encabezado ────────────────────────────────────────────────────────

print("Procesando encabezado...")

nfactura_to_uuid: dict[int, str] = {}  # NNFactura int -> invoice uuid
# Mapeo Anc_Tareas: NNFactura int -> n_tarea int (para post-import SQL)
nfactura_to_ntarea: dict[int, int] = {}

enc_out = []

for row in enc_rows:
    titulo     = (row.get('T\xedtulo') or row.get('Titulo') or row.get('Título') or '').strip()
    nn_s       = row.get('NNFactura', '').strip()
    anc        = row.get('Anc_Tareas', '').strip()
    sociedad   = (row.get('Sociedad') or row.get('Sociedades1') or '').strip()
    ff         = parse_date(row.get('Fecha Factura', ''))
    fv         = parse_date(row.get('Fecha Vencimiento', ''))
    termino    = (row.get('Terminos') or row.get('T\xe9rminos') or row.get('Términos') or '').strip()
    nota       = row.get('Nota para el cliente', '').strip()
    total_s    = row.get('Total', '').strip()
    importe_s  = row.get('Importe', '').strip()
    estado_src = (row.get('Estado') or 'Pendiente').strip().lower()

    try:
        nn_int = int(float(nn_s)) if nn_s else None
    except ValueError:
        nn_int = None

    nt = n_tarea_int(anc)

    inv_id = str(uuid.uuid4())
    if nn_int is not None:
        nfactura_to_uuid[nn_int] = inv_id
        if nt is not None:
            nfactura_to_ntarea[nn_int] = nt

    numero_factura = titulo.zfill(6) if titulo else (str(nn_int).zfill(6) if nn_int else None)
    society_id     = find_in_dict(societies_by_name, sociedad) if sociedad else None
    term_id        = find_in_dict(terms_by_name, termino) if termino else None

    try:
        total_val = float(total_s.replace('$', '').replace(',', '')) if total_s else 0.0
    except ValueError:
        total_val = 0.0
    try:
        sub_val = float(importe_s.replace('$', '').replace(',', '')) if importe_s else total_val
    except ValueError:
        sub_val = total_val

    estado_map = {'pendiente': 'pendiente', 'enviada': 'enviada', 'borrador': 'borrador',
                  'anulada': 'anulada', 'error': 'error'}
    estado = estado_map.get(estado_src, 'pendiente')

    if not ff:
        ff = date.today().isoformat()
    if not fv:
        fv = ff

    # NOTA: case_id NO se incluye aqui — se vincula via post-import SQL
    enc_out.append({
        'id':               inv_id,
        # society_id y term_id: None -> celda vacia en CSV (NULL en Supabase)
        'society_id':       society_id,
        'term_id':          term_id,
        'fecha_factura':    ff,
        'fecha_vencimiento': fv,
        'subtotal':         round(sub_val, 2),
        'impuesto':         0.0,
        'total':            round(total_val, 2),
        'estado':           estado,
        'numero_factura':   numero_factura,
        'nota_cliente':     nota or None,
        # campo auxiliar para post-import (no va a la BD, solo para referencia)
        '_n_tarea':         nt,
        '_nn':              nn_int,
    })

# ── Procesar detalle ───────────────────────────────────────────────────────────

print("Procesando detalle...")

det_out = []

for row in det_rows:
    nfactura_s = (row.get('NFactura') or row.get('T\xedtulo') or row.get('Titulo') or '').strip()
    desc       = row.get('Descripcion', '').strip()
    cant_s     = row.get('Cantidad', '1').strip() or '1'
    tarifa_s   = row.get('Tarifa', '0').strip() or '0'
    iva_s      = row.get('Iva', '0').strip() or '0'
    categoria  = (row.get('Categoria') or row.get('Categor\xeda') or '').strip()

    try:
        nf_int = int(float(nfactura_s)) if nfactura_s else None
    except ValueError:
        nf_int = None

    invoice_id = nfactura_to_uuid.get(nf_int) if nf_int is not None else None
    if invoice_id is None:
        print(f"  SKIP: linea '{desc[:30]}' NFactura={nfactura_s} sin invoice_id")
        continue

    try:
        cantidad = float(cant_s.replace(',', '.'))
    except ValueError:
        cantidad = 1.0
    try:
        tarifa = float(tarifa_s.replace(',', '.'))
    except ValueError:
        tarifa = 0.0
    try:
        itbms = float(iva_s.replace(',', '.'))
    except ValueError:
        itbms = 0.0

    # NOTA: importe es columna GENERADA en BD (cantidad*tarifa), NO incluir en CSV
    det_out.append({
        'id':          str(uuid.uuid4()),
        'invoice_id':  invoice_id,
        'descripcion': desc or '(sin descripcion)',
        'cantidad':    round(cantidad, 2),
        'tarifa':      round(tarifa, 2),
        'itbms':       round(itbms, 2),
        'categoria':   categoria or None,
    })

# ── Recalcular totales por factura ─────────────────────────────────────────────

totals: dict[str, dict] = {}
for l in det_out:
    iid = l['invoice_id']
    imp = l['cantidad'] * l['tarifa']
    tax = imp * l['itbms'] / 100
    if iid not in totals:
        totals[iid] = {'sub': 0.0, 'imp': 0.0}
    totals[iid]['sub'] += imp
    totals[iid]['imp'] += tax

for e in enc_out:
    if e['id'] in totals:
        t = totals[e['id']]
        e['subtotal']  = round(t['sub'], 2)
        e['impuesto']  = round(t['imp'], 2)
        if e['total'] == 0:
            e['total'] = round(t['sub'] + t['imp'], 2)

# ── Escribir CSV ───────────────────────────────────────────────────────────────

# Columnas CSV para case_invoices:
# - SIN case_id (NOT NULL — se vincula via post-import SQL)
# - SIN created_at (tiene default)
# - SIN qb_invoice_id (no aplica)
ENC_FIELDS = [
    'id', 'society_id', 'term_id',
    'fecha_factura', 'fecha_vencimiento',
    'subtotal', 'impuesto', 'total',
    'estado', 'numero_factura', 'nota_cliente',
]

# Columnas CSV para invoice_lines:
# - SIN importe (columna GENERATED ALWAYS — no se puede insertar)
DET_FIELDS = [
    'id', 'invoice_id', 'descripcion',
    'cantidad', 'tarifa', 'itbms', 'categoria',
]

def write_csv(path, fieldnames, rows):
    """Escribe CSV con celdas vacías para valores None (Supabase las importa como NULL)."""
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(fieldnames)
        for row in rows:
            writer.writerow([
                '' if row.get(col) is None else row.get(col)
                for col in fieldnames
            ])

write_csv('facturas_enc_import.csv', ENC_FIELDS, enc_out)
write_csv('facturas_det_import.csv', DET_FIELDS, det_out)

# ── Generar SQL pre-import ─────────────────────────────────────────────────────

pre_sql = """\
-- ================================================================
-- 1_preimport.sql  — Ejecutar ANTES de importar los CSV
-- ================================================================

-- Agregar columnas nuevas (si no existen)
ALTER TABLE public.case_invoices
  ADD COLUMN IF NOT EXISTS numero_factura text,
  ADD COLUMN IF NOT EXISTS nota_cliente   text;

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS categoria text;

-- Hacer case_id nullable TEMPORALMENTE para permitir importar sin case_id
-- (Se restaurara en 2_postimport.sql)
ALTER TABLE public.case_invoices
  ALTER COLUMN case_id DROP NOT NULL;

-- Listo. Ahora importa los CSV en Supabase Table Editor:
--   1. case_invoices  <-  facturas_enc_import.csv
--   2. invoice_lines  <-  facturas_det_import.csv
-- Luego ejecuta 2_postimport.sql
"""

# ── Generar SQL post-import ────────────────────────────────────────────────────

post_lines = [
    '-- ================================================================',
    '-- 2_postimport.sql  — Ejecutar DESPUES de importar los CSV',
    '-- ================================================================',
    '',
    '-- Vincular facturas a sus casos por n_tarea',
]

for e in enc_out:
    nn   = e.get('_nn')
    nt   = e.get('_n_tarea')
    nf   = e.get('numero_factura') or str(nn)
    if nt is not None:
        post_lines.append(
            f"UPDATE public.case_invoices SET case_id = "
            f"(SELECT id FROM public.cases WHERE n_tarea = {nt} LIMIT 1) "
            f"WHERE numero_factura = '{nf}' AND case_id IS NULL;"
        )
    else:
        post_lines.append(
            f"-- FACTURA {nf}: sin Anc_Tareas — vincular manualmente:"
        )
        post_lines.append(
            f"-- UPDATE public.case_invoices SET case_id = '<uuid-del-caso>' WHERE numero_factura = '{nf}';"
        )

post_lines += [
    '',
    '-- Eliminar facturas que quedaron sin case_id (opcional, o vincularlas manualmente)',
    '-- DELETE FROM public.case_invoices WHERE case_id IS NULL;',
    '',
    '-- Restaurar NOT NULL en case_id (solo si no quedan filas con case_id IS NULL)',
    '-- Verifica primero:',
    'SELECT numero_factura, case_id FROM public.case_invoices WHERE case_id IS NULL;',
    '',
    '-- Si el resultado anterior esta vacio, restaura la restriccion:',
    '-- ALTER TABLE public.case_invoices ALTER COLUMN case_id SET NOT NULL;',
    '',
    '-- Verificacion final:',
    'SELECT ci.numero_factura, ci.fecha_factura, ci.total, ci.estado,',
    '       c.n_tarea, COUNT(il.id) AS lineas',
    'FROM public.case_invoices ci',
    'LEFT JOIN public.cases c ON c.id = ci.case_id',
    'LEFT JOIN public.invoice_lines il ON il.invoice_id = ci.id',
    'GROUP BY ci.id, c.n_tarea',
    'ORDER BY ci.numero_factura;',
]

# ── Escribir SQL ───────────────────────────────────────────────────────────────

with open('1_preimport.sql', 'w', encoding='utf-8') as f:
    f.write(pre_sql)

with open('2_postimport.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(post_lines))

# ── Resumen ────────────────────────────────────────────────────────────────────

print()
print('=' * 60)
print(f'  Facturas:     {len(enc_out)}')
print(f'  Lineas:       {len(det_out)}')
print()

sin_caso = [e for e in enc_out if e['_n_tarea'] is None]
if sin_caso:
    nfs = [e['numero_factura'] for e in sin_caso]
    print(f'  Sin n_tarea:  {nfs} -> vincular manualmente en 2_postimport.sql')
    print()

print('Archivos generados:')
print('  1_preimport.sql          <- ejecutar PRIMERO en SQL Editor')
print('  facturas_enc_import.csv  <- importar en case_invoices')
print('  facturas_det_import.csv  <- importar en invoice_lines')
print('  2_postimport.sql         <- ejecutar DESPUES en SQL Editor')
print()
print('ORDEN:')
print('  1. Supabase SQL Editor -> pegar y ejecutar 1_preimport.sql')
print('  2. Table Editor -> case_invoices -> Import CSV -> facturas_enc_import.csv')
print('  3. Table Editor -> invoice_lines -> Import CSV -> facturas_det_import.csv')
print('  4. Supabase SQL Editor -> pegar y ejecutar 2_postimport.sql')
print('=' * 60)
