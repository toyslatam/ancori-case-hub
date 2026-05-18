/**
 * Sincroniza una sociedad Ancori → AgileCheck como Persona Jurídica.
 * POST/PUT /api/Cliente (EsJuridico: true, esProveedor: false).
 * Guarda el agilecheck_cliente_id resultante en public.societies.
 *
 * POST { society_id: string }
 * Auth: x-ancori-secret
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getAgileCheckToken, apiUrlJoin } from '../_shared/agilecheck-token.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret, x-client-info',
};
const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HDR, ...CORS } });
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

function unwrapAspNetD(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const o = data as Record<string, unknown>;
  const d = o.d;
  if (typeof d === 'string') {
    try { return JSON.parse(d) as Record<string, unknown>; } catch { return o; }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return o;
}

function extractClienteId(root: Record<string, unknown>): number | null {
  const id = root.id ?? root.Id;
  if (typeof id === 'number' && Number.isFinite(id) && id > 0) return Math.floor(id);
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim());
  return null;
}

async function findByDocument(
  token: string,
  apiBase: string,
  tipoIdentificacion: number,
  nroIdentificacion: string,
): Promise<number | null> {
  const q = new URLSearchParams({
    tipoIdentificacion: String(tipoIdentificacion),
    nroIdentificacion,
    esProveedor: 'false',
  });
  const url = `${apiUrlJoin(apiBase, 'api/Cliente/GetClienteByDocIdentidadSimple')}?${q.toString()}`;
  try {
    const res = await fetch(url, { method: 'GET', headers: authHeaders(token) });
    if (res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) return null;
    const root = unwrapAspNetD(JSON.parse(text));
    return extractClienteId(root);
  } catch { return null; }
}

async function getClienteById(
  token: string,
  apiBase: string,
  id: number,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(apiUrlJoin(apiBase, `api/Cliente/GetCliente/${id}`), {
      method: 'GET',
      headers: authHeaders(token),
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return unwrapAspNetD(JSON.parse(await res.text()));
  } catch { return null; }
}

type SocietyRow = {
  id: string;
  nombre: string;
  razon_social: string;
  correo: string | null;
  telefono: string | null;
  identificacion_fiscal: string | null;
  ruc: string | null;
  agilecheck_cliente_id: number | null;
};

function buildJuridicaPayload(row: SocietyRow, productoTomado: number): Record<string, unknown> {
  const tipoDeId = Number(Deno.env.get('AGILECHECK_TIPO_IDENTIFICACION_ID') ?? '1') || 1;
  const paisRes = Number(Deno.env.get('AGILECHECK_CLIENTE_PAIS_RESIDENCIA_ID') ?? '0') || 0;

  // Preferir razon_social como nombre legal; nombre como nombre comercial
  const legal = (row.razon_social?.trim() || row.nombre?.trim() || 'RAZON SOCIAL').trim();
  const comercial = (row.nombre?.trim() || legal).trim();

  // Documento: preferir identificacion_fiscal, luego ruc
  const doc = (row.identificacion_fiscal?.trim() || row.ruc?.trim() || '').trim();

  const payload: Record<string, unknown> = {
    email: row.correo?.trim() || undefined,
    telefonoResidencia: row.telefono?.trim() || undefined,
    tipoDeId,
    ...(doc ? { numeroDeId: doc } : {}),
    ProductoTomadoCliente: [{ productoTomado }],
    PersonaJuridica: [{ nombreLegal: legal, nombreComercial: comercial }],
  };
  if (paisRes > 0) payload.paisResidencia = paisRes;
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('FUNCTION_SECRET') ?? '';
  if (secret && req.headers.get('x-ancori-secret') !== secret) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing_env' });

  const apiBase = Deno.env.get('AGILECHECK_API_BASE')?.trim();
  if (!apiBase) return json(500, { error: 'missing_agilecheck_api_base' });

  const productoTomado = Number(Deno.env.get('AGILECHECK_PRODUCTO_TOMADO_ID') ?? '') || 0;
  if (!productoTomado) {
    return json(500, {
      error: 'missing_agilecheck_producto_tomado',
      detail: 'Defina AGILECHECK_PRODUCTO_TOMADO_ID en los secrets de Supabase.',
    });
  }

  let body: { society_id: string };
  try { body = (await req.json()) as { society_id: string }; } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body.society_id) return json(400, { error: 'missing_society_id' });

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: row, error: loadErr } = await supabase
    .from('societies')
    .select('id, nombre, razon_social, correo, telefono, identificacion_fiscal, ruc, agilecheck_cliente_id')
    .eq('id', body.society_id)
    .maybeSingle();

  if (loadErr || !row) {
    return json(404, { error: 'society_not_found', detail: loadErr?.message });
  }

  const tokenResult = await getAgileCheckToken();
  if (!tokenResult.ok) {
    return json(502, { error: 'agilecheck_token_failed', detail: tokenResult.summary });
  }
  const token = tokenResult.token;
  const tipoId = Number(Deno.env.get('AGILECHECK_TIPO_IDENTIFICACION_ID') ?? '1') || 1;
  const society = row as SocietyRow;

  // Resolver agilecheck_cliente_id: BD → buscar por doc → crear nuevo
  let agileId: number | null =
    typeof society.agilecheck_cliente_id === 'number' && society.agilecheck_cliente_id > 0
      ? society.agilecheck_cliente_id
      : null;

  if (agileId != null) {
    const existing = await getClienteById(token, apiBase, agileId);
    if (!existing) agileId = null;
  }

  const doc = (society.identificacion_fiscal?.trim() || society.ruc?.trim() || '').trim();
  if (agileId == null && doc) {
    agileId = await findByDocument(token, apiBase, tipoId, doc);
  }

  const payload = buildJuridicaPayload(society, productoTomado);
  let action: 'created' | 'updated';
  let responseText: string;
  let res: Response;

  if (agileId != null) {
    action = 'updated';
    const url = `${apiUrlJoin(apiBase, `api/Cliente/PutCliente/${agileId}`)}?esProveedor=false`;
    res = await fetch(url, {
      method: 'PUT',
      headers: authHeaders(token),
      body: JSON.stringify({ ...payload, id: agileId }),
    });
    responseText = await res.text();
  } else {
    action = 'created';
    const url = `${apiUrlJoin(apiBase, 'api/Cliente/PostCliente')}?esProveedor=false`;
    res = await fetch(url, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    responseText = await res.text();
  }

  if (!res.ok) {
    return json(502, {
      ok: false,
      error: 'agilecheck_api_error',
      detail: responseText.slice(0, 500),
      http_status: res.status,
    });
  }

  const outRoot = unwrapAspNetD(JSON.parse(responseText.trim() || '{}'));
  const newId = extractClienteId(outRoot) ?? agileId;

  if (newId == null) {
    return json(502, {
      ok: false,
      error: 'agilecheck_no_id_returned',
      detail: responseText.slice(0, 400),
    });
  }

  const { error: upErr } = await supabase
    .from('societies')
    .update({ agilecheck_cliente_id: newId })
    .eq('id', body.society_id);

  if (upErr) {
    return json(500, { ok: false, error: 'db_update_failed', detail: upErr.message });
  }

  return json(200, { ok: true, agilecheck_cliente_id: newId, action });
});
