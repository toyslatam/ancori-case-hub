/**
 * Obtiene el perfil completo de un cliente o sociedad desde AgileCheck.
 * Llama a GetCliente, EsAltoRiesgoCliente y DetalleCalculoRiesgo.
 * Actualiza los campos ag_* y agilecheck_data en la tabla correspondiente.
 *
 * POST { entity_type: 'client' | 'society', entity_id: string }
 * Auth: x-ancori-secret
 *
 * Respuestas:
 *   ok: true  → { agilecheck_cliente_id, profile, es_alto_riesgo, detalle_riesgo, updated_fields }
 *   ok: false, error: 'no_agilecheck_link' → sin ID en AgileCheck; buscó por doc y no encontró
 *   ok: false, error: <otro> → fallo de API o DB
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

type EntityType = 'client' | 'society';
type FetchRequest = { entity_type: EntityType; entity_id: string };

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

async function safeGet(
  url: string,
  headers: Record<string, string>,
): Promise<{ ok: boolean; data: unknown; status: number }> {
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    let data: unknown = {};
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, data, status: res.status };
  } catch (err) {
    return { ok: false, data: { error: String(err) }, status: 0 };
  }
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
  const r = await safeGet(url, authHeaders(token));
  if (!r.ok || r.status === 404) return null;
  const root = unwrapAspNetD(r.data);
  const id = root.id ?? root.Id;
  if (typeof id === 'number' && id > 0) return Math.floor(id);
  if (typeof id === 'string' && /^\d+$/.test(id.trim())) return Number(id.trim());
  return null;
}

function nivelRiesgoLabel(nivel: number | null): string {
  const map: Record<number, string> = { 1: 'bajo', 2: 'medio', 3: 'alto', 4: 'critico' };
  return nivel != null ? (map[nivel] ?? 'desconocido') : 'desconocido';
}

function extractAgFields(profile: Record<string, unknown>) {
  return {
    ag_riesgo: profile.riesgo != null ? Number(profile.riesgo) : null,
    ag_riesgo_nivel: profile.riesgoNivel != null ? Number(profile.riesgoNivel) : null,
    ag_porcCompletadoDD: profile.porcCompletadoDD != null ? Number(profile.porcCompletadoDD) : null,
    ag_verificado_en_listas: profile.verificadoEnListas != null ? Boolean(profile.verificadoEnListas) : null,
    ag_last_sync_at: new Date().toISOString(),
  };
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

  let body: FetchRequest;
  try { body = (await req.json()) as FetchRequest; } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { entity_type, entity_id } = body;
  if (!entity_type || !entity_id) {
    return json(400, { error: 'missing_fields', required: ['entity_type', 'entity_id'] });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const table = entity_type === 'client' ? 'clients' : 'societies';
  const docField = entity_type === 'client' ? 'identificacion' : 'identificacion_fiscal';

  const { data: entityRow, error: loadErr } = await supabase
    .from(table)
    .select(`id, nombre, agilecheck_cliente_id, ${docField}`)
    .eq('id', entity_id)
    .maybeSingle();

  if (loadErr || !entityRow) {
    return json(404, { error: 'entity_not_found', detail: loadErr?.message });
  }

  const tokenResult = await getAgileCheckToken();
  if (!tokenResult.ok) {
    return json(502, { error: 'agilecheck_token_failed', detail: tokenResult.summary });
  }
  const token = tokenResult.token;
  const tipoId = Number(Deno.env.get('AGILECHECK_TIPO_IDENTIFICACION_ID') ?? '1') || 1;

  let agileId: number | null =
    typeof entityRow.agilecheck_cliente_id === 'number' && entityRow.agilecheck_cliente_id > 0
      ? entityRow.agilecheck_cliente_id
      : null;

  const docValue = String((entityRow as Record<string, unknown>)[docField] ?? '').trim();

  if (agileId == null && docValue) {
    agileId = await findByDocument(token, apiBase, tipoId, docValue);
    if (agileId != null) {
      await supabase.from(table).update({ agilecheck_cliente_id: agileId }).eq('id', entity_id);
    }
  }

  if (agileId == null) {
    return json(200, {
      ok: false,
      error: 'no_agilecheck_link',
      detail: 'No se encontró registro en AgileCheck. Sincronice primero con el botón "Registrar en AgileCheck".',
      entity_id,
      entity_type,
    });
  }

  const [profileResult, altoRiesgoResult, detalleResult] = await Promise.all([
    safeGet(apiUrlJoin(apiBase, `api/Cliente/GetCliente/${agileId}`), authHeaders(token)),
    safeGet(`${apiUrlJoin(apiBase, 'api/Cliente/EsAltoRiesgoCliente')}?idCliente=${agileId}`, authHeaders(token)),
    safeGet(
      `${apiUrlJoin(apiBase, 'api/DetalleCalculoRiesgo/GetDetalleCalculoRiesgoByCliente')}?idCliente=${agileId}`,
      authHeaders(token),
    ),
  ]);

  if (!profileResult.ok) {
    const detailStr = JSON.stringify(profileResult.data);
    if (detailStr.includes('no pertenece a la empresa')) {
      return json(200, {
        ok: false,
        error: 'agilecheck_wrong_company',
        detail: 'El ID almacenado no pertenece a esta empresa en AgileCheck. Ingresa el ID correcto.',
        entity_id,
      });
    }
    return json(502, {
      ok: false,
      error: 'agilecheck_get_cliente_failed',
      http_status: profileResult.status,
      detail: detailStr.slice(0, 300),
    });
  }

  const profile = unwrapAspNetD(profileResult.data);
  const esAltoRiesgo = altoRiesgoResult.ok ? altoRiesgoResult.data : null;
  const detalleRiesgo = detalleResult.ok ? detalleResult.data : null;

  const agFields = extractAgFields(profile);
  const agilecheck_data = {
    profile,
    es_alto_riesgo: esAltoRiesgo,
    detalle_riesgo: detalleRiesgo,
    fetched_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from(table)
    .update({ agilecheck_cliente_id: agileId, ...agFields, agilecheck_data })
    .eq('id', entity_id);

  if (updateErr) {
    // Si el error es de caché de esquema (columnas ag_* aún no visibles en PostgREST),
    // intentar guardar solo agilecheck_cliente_id y continuar devolviendo los datos.
    if (updateErr.message.includes('schema cache') || updateErr.message.includes('column')) {
      await supabase
        .from(table)
        .update({ agilecheck_cliente_id: agileId })
        .eq('id', entity_id);
      // Continuar — los datos del perfil se devuelven igual al frontend.
    } else {
      return json(500, { ok: false, error: 'db_update_failed', detail: updateErr.message });
    }
  }

  return json(200, {
    ok: true,
    entity_id,
    entity_type,
    agilecheck_cliente_id: agileId,
    profile,
    es_alto_riesgo: esAltoRiesgo,
    detalle_riesgo: detalleRiesgo,
    risk_label: nivelRiesgoLabel(agFields.ag_riesgo_nivel),
    updated_fields: agFields,
  });
});
