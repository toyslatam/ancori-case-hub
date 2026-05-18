/**
 * Sincroniza un registro `public.clients` con AgileCheck (POST/PUT /api/Cliente/*).
 * Requiere el mismo token y AGILECHECK_API_BASE que la consulta PEP.
 *
 * Secrets obligatorios para crear/actualizar:
 *   AGILECHECK_PRODUCTO_TOMADO_ID — id del producto/servicio (catálogo empresa; ver Swagger ProductoOfrecidoPorEmpresa).
 * Opcionales:
 *   AGILECHECK_TIPO_IDENTIFICACION_ID (default 1), AGILECHECK_GENERO_PERSONA_NATURAL_ID (default 1),
 *   AGILECHECK_CLIENTE_PAIS_RESIDENCIA_ID — entero paisResidencia en modelo Cliente.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { apiUrlJoin, getAgileCheckToken } from './agilecheck-token.ts';

export type SyncClienteResult =
  | { ok: true; agilecheck_cliente_id: number; action: 'created' | 'updated' }
  | { ok: false; error: string; detail?: string; http_status?: number };

type ClientRow = {
  id: string;
  nombre: string;
  razon_social: string | null;
  email: string | null;
  telefono: string | null;
  identificacion: string | null;
  direccion: string | null;
  tipo_cliente: string | null;
  agilecheck_cliente_id: number | null;
};

function unwrapAspNetD(data: Record<string, unknown>): Record<string, unknown> {
  const d = data.d;
  if (typeof d === 'string') {
    try {
      return JSON.parse(d) as Record<string, unknown>;
    } catch {
      return data;
    }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return data;
}

function parseJsonRoot(text: string): Record<string, unknown> {
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    return unwrapAspNetD(o);
  } catch {
    return {};
  }
}

function extractClienteId(root: Record<string, unknown>): number | null {
  const id = root.id ?? root.Id;
  if (typeof id === 'number' && Number.isFinite(id)) return Math.floor(id);
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim());
  return null;
}

function splitNombresApellidos(display: string): { nombres: string; apellidos: string } {
  const parts = display.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombres: 'SIN', apellidos: 'NOMBRE' };
  if (parts.length === 1) return { nombres: parts[0], apellidos: parts[0] };
  return { nombres: parts[0], apellidos: parts.slice(1).join(' ') };
}

function isPersonaJuridica(row: ClientRow): boolean {
  const t = (row.tipo_cliente ?? '').trim();
  return t === 'Persona Juridica' || t === 'Persona Jurídica';
}

function buildClientePayload(row: ClientRow, productoTomado: number): Record<string, unknown> {
  const tipoDeId = Number(Deno.env.get('AGILECHECK_TIPO_IDENTIFICACION_ID') ?? '1') || 1;
  const generoId = Number(Deno.env.get('AGILECHECK_GENERO_PERSONA_NATURAL_ID') ?? '1') || 1;
  const paisRes = Number(Deno.env.get('AGILECHECK_CLIENTE_PAIS_RESIDENCIA_ID') ?? '0') || 0;

  const base: Record<string, unknown> = {
    email: row.email?.trim() || undefined,
    direccionResidencia: row.direccion?.trim() || undefined,
    telefonoResidencia: row.telefono?.trim() || undefined,
    tipoDeId,
    numeroDeId: row.identificacion?.trim() || undefined,
    ProductoTomadoCliente: [{ productoTomado: productoTomado }],
  };
  if (paisRes > 0) base.paisResidencia = paisRes;

  if (isPersonaJuridica(row)) {
    const legal = (row.razon_social?.trim() || row.nombre?.trim() || 'RAZON SOCIAL').trim();
    const comercial = (row.nombre?.trim() || legal).trim();
    base.PersonaJuridica = [{ nombreLegal: legal, nombreComercial: comercial }];
  } else {
    const display = (row.nombre?.trim() || row.razon_social?.trim() || '').trim() || 'SIN NOMBRE';
    const { nombres, apellidos } = splitNombresApellidos(display);
    base.PersonaNatural = [{ nombres, apellidos, genero: generoId }];
  }

  return base;
}

function authHeaders(token: string): Record<string, string> {
  const dbName = Deno.env.get('AGILECHECK_DB')?.trim();
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(dbName ? { 'X-Agilecheck-DB': dbName } : {}),
  };
}

/** GET api/Cliente/GetClienteByDocIdentidadSimple */
async function findIdByDocument(
  token: string,
  apiBase: string,
  tipoIdentificacion: number,
  nroIdentificacion: string,
): Promise<number | null> {
  const q = new URLSearchParams();
  q.set('tipoIdentificacion', String(tipoIdentificacion));
  q.set('nroIdentificacion', nroIdentificacion);
  q.set('esProveedor', 'false');
  const url = `${apiUrlJoin(apiBase, 'api/Cliente/GetClienteByDocIdentidadSimple')}?${q.toString()}`;
  const res = await fetch(url, { method: 'GET', headers: authHeaders(token) });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) return null;
  const root = parseJsonRoot(text);
  return extractClienteId(root);
}

/** GET api/Cliente/GetCliente/{id} */
async function getClienteById(token: string, apiBase: string, id: number): Promise<Record<string, unknown> | null> {
  const url = apiUrlJoin(apiBase, `api/Cliente/GetCliente/${id}`);
  const res = await fetch(url, { method: 'GET', headers: authHeaders(token) });
  if (res.status === 404) return null;
  const text = await res.text();
  if (!res.ok) return null;
  return parseJsonRoot(text);
}

export async function syncAncoriClientToAgileCheck(
  supabase: SupabaseClient,
  clientId: string,
): Promise<SyncClienteResult> {
  const apiBase = Deno.env.get('AGILECHECK_API_BASE')?.trim();
  const productoTomado = Number(Deno.env.get('AGILECHECK_PRODUCTO_TOMADO_ID') ?? '') || 0;
  const tipoIdentificacion = Number(Deno.env.get('AGILECHECK_TIPO_IDENTIFICACION_ID') ?? '1') || 1;

  if (!apiBase) {
    return { ok: false, error: 'missing_agilecheck_api_base', detail: 'Defina AGILECHECK_API_BASE' };
  }
  if (!productoTomado) {
    return {
      ok: false,
      error: 'missing_agilecheck_producto_tomado',
      detail:
        'Defina AGILECHECK_PRODUCTO_TOMADO_ID (id de producto/servicio de la empresa en AgileCheck; ver Swagger ProductoOfrecidoPorEmpresa / GetProductoOfrecidoPorEmpresa).',
    };
  }

  const { data: row, error: loadErr } = await supabase
    .from('clients')
    .select('id, nombre, razon_social, email, telefono, identificacion, direccion, tipo_cliente, agilecheck_cliente_id')
    .eq('id', clientId)
    .maybeSingle();

  if (loadErr || !row) {
    return { ok: false, error: 'client_not_found', detail: loadErr?.message ?? String(clientId) };
  }

  const client = row as ClientRow;

  const tokenResult = await getAgileCheckToken();
  if (!tokenResult.ok) {
    return { ok: false, error: 'agilecheck_token_failed', detail: tokenResult.summary };
  }
  const token = tokenResult.token;

  const payload = buildClientePayload(client, productoTomado);

  let agileId: number | null =
    typeof client.agilecheck_cliente_id === 'number' && Number.isFinite(client.agilecheck_cliente_id)
      ? Math.floor(client.agilecheck_cliente_id)
      : null;

  if (agileId != null) {
    const existing = await getClienteById(token, apiBase, agileId);
    if (!existing) agileId = null;
  }

  if (agileId == null && client.identificacion?.trim()) {
    agileId = await findIdByDocument(token, apiBase, tipoIdentificacion, client.identificacion.trim());
  }

  let action: 'created' | 'updated';
  let responseText: string;
  let res: Response;

  if (agileId != null) {
    action = 'updated';
    const putBody = { ...payload, id: agileId };
    const url = apiUrlJoin(apiBase, `api/Cliente/PutCliente/${agileId}`) + '?esProveedor=false';
    res = await fetch(url, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify(putBody),
    });
    responseText = await res.text();
  } else {
    action = 'created';
    const url = apiUrlJoin(apiBase, 'api/Cliente/PostCliente') + '?esProveedor=false';
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    responseText = await res.text();
  }

  if (!res.ok) {
    return {
      ok: false,
      error: 'agilecheck_cliente_api_error',
      detail: responseText.slice(0, 500),
      http_status: res.status,
    };
  }

  const outRoot = parseJsonRoot(responseText);
  const newId = extractClienteId(outRoot);
  if (newId == null) {
    return {
      ok: false,
      error: 'agilecheck_cliente_no_id',
      detail: responseText.slice(0, 400),
      http_status: res.status,
    };
  }

  const { error: upErr } = await supabase
    .from('clients')
    .update({ agilecheck_cliente_id: newId })
    .eq('id', clientId);

  if (upErr) {
    return {
      ok: false,
      error: 'db_update_failed',
      detail: upErr.message,
    };
  }

  return { ok: true, agilecheck_cliente_id: newId, action };
}
