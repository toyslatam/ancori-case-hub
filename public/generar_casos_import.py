"""
Genera casos_import.csv listo para importar en Supabase.
Resuelve service_item_id, society_id, client_id y etapa_id por nombre.
"""
import csv, uuid, re
from datetime import datetime

# ─── Cargar lookups ────────────────────────────────────────────────────────────

def load_csv(path, sep=','):
    for enc in ('utf-8-sig', 'utf-8', 'latin-1', 'cp1252'):
        try:
            with open(path, encoding=enc) as f:
                return list(csv.DictReader(f, delimiter=sep))
        except UnicodeDecodeError:
            continue
    raise ValueError(f'No se pudo leer {path}')

service_items = load_csv('service_items_rows.csv')
societies      = load_csv('societies_rows.csv')
etapas         = load_csv('etapas_rows.csv')

# Index por nombre (lower, strip)
si_by_name  = { r['nombre'].strip().lower(): r for r in service_items }
soc_by_name = { r['nombre'].strip().lower(): r for r in societies }
etapa_by_name = { r['nombre'].strip().lower(): r for r in etapas }

# Usuarios → UUIDs reales de Supabase
usuarios_by_nombre = {
    'yolimar gordón':        '02294436-1cc6-4831-9a33-5ba0591ba19c',
    'maría isabel palma':    '17065b4e-a37e-435c-a971-a7c7751c4eea',
    'leydis valdés':         '4c673c1a-6532-4159-8d58-ccf7cd924ae8',
    'jean richa':            '90719f58-0420-4874-9606-6e8d91bce520',
    'milagros flores':       'a267a2be-0903-4883-88ad-12d0e2d604f5',
    'soporte ct auditores':  'a22562ea-ed59-4bca-907f-971fb55d1f5e',
    'soporte':               'b2ec00f7-4b83-4c91-b56a-ce5e685e085c',
    # aliases por login name
    'ygordon':               '02294436-1cc6-4831-9a33-5ba0591ba19c',
    'jricha':                '90719f58-0420-4874-9606-6e8d91bce520',
    'santiago aviles':       'a22562ea-ed59-4bca-907f-971fb55d1f5e',
}

# ─── Helpers ───────────────────────────────────────────────────────────────────

def norm(s):
    return (s or '').strip().lower()

def bool_es(s):
    return str(s).strip().upper() in ('VERDADERO', 'TRUE', '1', 'SI', 'SÍ')

def parse_date(s):
    """Convierte MM/DD/YYYY HH:MM o similar a YYYY-MM-DD."""
    s = (s or '').strip()
    if not s:
        return ''
    # Ignore invalid years
    for fmt in ('%m/%d/%Y %H:%M', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S%z', '%Y-%m-%d'):
        try:
            d = datetime.strptime(s[:len(fmt.replace('%Y','0000').replace('%m','00').replace('%d','00').replace('%H','00').replace('%M','00'))], fmt)
            if d.year < 1950:
                return ''
            return d.strftime('%Y-%m-%d')
        except:
            pass
    # Try splitting by space
    parts = s.split(' ')
    if parts:
        for fmt in ('%m/%d/%Y', '%Y-%m-%d'):
            try:
                d = datetime.strptime(parts[0], fmt)
                if d.year < 1950:
                    return ''
                return d.strftime('%Y-%m-%d')
            except:
                pass
    return ''

def resolve_service_item(nombre):
    key = norm(nombre)
    r = si_by_name.get(key)
    if r:
        return r['id'], r.get('service_id', '')
    # Partial match
    for k, v in si_by_name.items():
        if key and key in k:
            return v['id'], v.get('service_id', '')
    return '', ''

def resolve_society(nombre):
    key = norm(nombre)
    if not key:
        return '', ''
    r = soc_by_name.get(key)
    if r:
        return r['id'], r.get('client_id', '')
    # Partial match
    for k, v in soc_by_name.items():
        if key and (key in k or k in key):
            return v['id'], v.get('client_id', '')
    return '', ''

def resolve_etapa(nombre):
    key = norm(nombre)
    r = etapa_by_name.get(key)
    return r['id'] if r else ''

def resolve_estado(s):
    s = (s or '').strip()
    mapa = {
        'en curso': 'En Curso',
        'completado/facturado': 'Completado/Facturado',
        'pendiente': 'Pendiente',
        'cancelado': 'Cancelado',
    }
    return mapa.get(s.lower(), 'Pendiente')

def resolve_prioridad(s):
    s = (s or '').strip()
    mapa = {'urgente': 'Urgente', 'media': 'Media', 'baja': 'Baja'}
    return mapa.get(s.lower(), 'Media') if s else 'Media'

def safe_num(s):
    s = str(s or '').strip().replace(',', '')
    if not s:
        return ''
    try:
        v = float(s)
        # Detect data errors: value like 41633 that should be 416.33
        # If value > 99999 and ends in pattern of cents, divide by 100
        # We leave as-is and let the user review
        return f'{v:.2f}'
    except:
        return ''

def lpad7(n):
    try:
        return str(int(n)).zfill(7)
    except:
        return str(n).zfill(7)

# ─── Procesar casos_raw.csv ────────────────────────────────────────────────────

casos = load_csv('casos_raw.csv', sep=';')

out_fields = [
    'n_tarea', 'numero_caso', 'descripcion', 'estado', 'prioridad',
    'fecha_caso', 'fecha_vencimiento',
    'society_id', 'client_id',
    'service_item_id', 'service_id',
    'etapa', 'etapa_id',
    'usuario_asignado_id',
    'gastos_cotizados', 'gastos_cliente', 'gastos_pendiente',
    'notas', 'observaciones',
    'cliente_temporal', 'recurrencia', 'envio_correo',
    'creado_por', 'responsable',
    'prioridad_urgente',
]

unmatched_items = set()
unmatched_socs  = set()

rows_out = []
for row in casos:
    nt_raw  = row.get('n_tarea ', row.get('n_tarea', '')).strip()
    if not nt_raw:
        continue

    item_nombre = row.get('Item de Servicio', '').strip()
    soc_nombre  = row.get('Sociedad1', '').strip()
    etapa_nom   = row.get('Anc_Etapa', '').strip()
    usuario_nom = row.get('Usuario Asignado', '').strip()

    si_id, svc_id = resolve_service_item(item_nombre)
    soc_id, cli_id = resolve_society(soc_nombre)
    etapa_id = resolve_etapa(etapa_nom)

    if item_nombre and not si_id:
        unmatched_items.add(item_nombre)
    if soc_nombre and not soc_id:
        unmatched_socs.add(soc_nombre)

    fecha_caso = parse_date(row.get('fecha_caso', ''))
    fecha_venc = parse_date(row.get('fecha_vencimiento', ''))

    prio = resolve_prioridad(row.get('Prioridad', ''))
    etapa_nombre_raw = row.get('Anc_Etapa', row.get('etapa', '')).strip()
    rows_out.append({
        'n_tarea':               nt_raw,
        'numero_caso':           lpad7(nt_raw),
        'descripcion':           row.get('descripcion', '').replace('\n', ' ').replace('\r', ' ').strip(),
        'estado':                resolve_estado(row.get('estado ', row.get('estado', ''))),
        'prioridad':             prio,
        'fecha_caso':            fecha_caso,
        'fecha_vencimiento':     fecha_venc,
        'society_id':            soc_id,
        'client_id':             cli_id,
        'service_item_id':       si_id,
        'service_id':            svc_id,
        'etapa':                 etapa_nombre_raw,
        'etapa_id':              etapa_id,
        'usuario_asignado_id':   usuarios_by_nombre.get(norm(usuario_nom), ''),
        'gastos_cotizados':      '0',
        'gastos_cliente':        safe_num(row.get('Gastos Del Cliente', '')),
        'gastos_pendiente':      safe_num(row.get('GastosPendiente', '')),
        'notas':                 row.get('Notas', '').replace('\n', ' ').replace('\r', ' ').strip(),
        'observaciones':         '',
        'cliente_temporal':      'true' if bool_es(row.get('ClienteTemporal', '')) else 'false',
        'recurrencia':           'true' if bool_es(row.get('Recurrencia', '')) else 'false',
        'envio_correo':          'true' if bool_es(row.get('EnvioCorreo', '')) else 'false',
        'creado_por':            row.get('Creado por', '').strip(),
        'responsable':           usuario_nom,
        'prioridad_urgente':     'true' if prio == 'Urgente' else 'false',
    })

# ─── Escribir CSV de salida ────────────────────────────────────────────────────
out_path = 'casos_import.csv'
with open(out_path, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=out_fields)
    w.writeheader()
    w.writerows(rows_out)

print(f'OK - Generado: {out_path}  ({len(rows_out)} filas)')

if unmatched_items:
    print(f'\nAVISO - Items SIN match ({len(unmatched_items)}):')
    for x in sorted(unmatched_items):
        print(f'   - {x}')

if unmatched_socs:
    print(f'\nAVISO - Sociedades SIN match ({len(unmatched_socs)}):')
    for x in sorted(unmatched_socs):
        print(f'   - {x}')
