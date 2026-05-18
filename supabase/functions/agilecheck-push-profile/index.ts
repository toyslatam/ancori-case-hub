/**
 * Envía campos editados de un cliente o sociedad → AgileCheck (PUT /api/Cliente/PutCliente/{id}).
 * Solo se llama cuando el usuario confirma el cambio desde la UI (botón de aprobación).
 *
 * POST {
 *   entity_type: 'client' | 'society',
 *   entity_id: string,
 *   fields: Record<string, unknown>   // solo los campos que cambiaron
 * }
 * Auth: x-ancori-secret
 *
 * Flujo:
 *   1. Obtener agilecheck_cliente_id de la BD
 *   2. GET /api/Cliente/GetCliente/{id} para tener el payload actual completo
 *   3. Merge: payload_actual + fields (los del usuario ganan)
 *   4. PUT /api/Cliente/PutCliente/{id}
 *   5. Actualizar ag_last_sync_at en BD
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
type PushRequest = {
  entity_type: EntityType;
  entity_id: string;
  fields: Record<string, unknown>;
};

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

  let body: PushRequest;
  try { body = (await req.json()) as PushRequest; } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { entity_type, entity_id, fields } = body;
  if (!entity_type || !entity_id || !fields || typeof fields !== 'object') {
    return json(400, { error: 'missing_fields', required: ['entity_type', 'entity_id', 'fields'] });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const table = entity_type === 'client' ? 'clients' : 'societies';

  const { data: entityRow, error: loadErr } = await supabase
    .from(table)
    .select('id, agilecheck_cliente_id')
    .eq('id', entity_id)
    .maybeSingle();

  if (loadErr || !entityRow) {
    return json(404, { error: 'entity_not_found', detail: loadErr?.message });
  }

  const agileId: number | null =
    typeof entityRow.agilecheck_cliente_id === 'number' && entityRow.agilecheck_cliente_id > 0
      ? entityRow.agilecheck_cliente_id
      : null;

  if (agileId == null) {
    return json(400, {
      error: 'no_agilecheck_link',
      detail: 'Registre primero la entidad en AgileCheck antes de editar.',
    });
  }

  const tokenResult = await getAgileCheckToken();
  if (!tokenResult.ok) {
    return json(502, { error: 'agilecheck_token_failed', detail: tokenResult.summary });
  }
  const token = tokenResult.token;

  // Obtener perfil actual de AgileCheck para hacer merge seguro
  const getRes = await fetch(apiUrlJoin(apiBase, `api/Cliente/GetCliente/${agileId}`), {
    method: 'GET',
    headers: authHeaders(token),
  });

  if (!getRes.ok) {
    return json(502, {
      error: 'agilecheck_get_failed',
      http_status: getRes.status,
      detail: (await getRes.text()).slice(0, 300),
    });
  }

  const currentProfile = unwrapAspNetD(JSON.parse(await getRes.text()));

  // Merge: perfil actual + campos enviados por el usuario
  const mergedPayload: Record<string, unknown> = {
    ...currentProfile,
    ...fields,
    id: agileId,
  };

  const putUrl = `${apiUrlJoin(apiBase, `api/Cliente/PutCliente/${agileId}`)}?esProveedor=false`;
  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(mergedPayload),
  });

  const putText = await putRes.text();
  if (!putRes.ok) {
    return json(502, {
      ok: false,
      error: 'agilecheck_put_failed',
      http_status: putRes.status,
      detail: putText.slice(0, 500),
    });
  }

  // Actualizar ag_last_sync_at en BD para reflejar que se sincronizó
  await supabase
    .from(table)
    .update({ ag_last_sync_at: new Date().toISOString() })
    .eq('id', entity_id);

  return json(200, {
    ok: true,
    agilecheck_cliente_id: agileId,
    fields_pushed: Object.keys(fields),
  });
});
