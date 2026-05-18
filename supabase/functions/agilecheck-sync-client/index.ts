/**
 * Sincroniza un cliente de Plataforma Ancori hacia AgileCheck (POST/PUT /api/Cliente).
 *
 * POST JSON: { "client_id": "<uuid>" }
 * Auth: x-ancori-secret (FUNCTION_SECRET), mismo patrón que agilecheck-verify.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { syncAncoriClientToAgileCheck } from '../_shared/agilecheck-cliente-sync.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret, x-client-info',
};
const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HDR, ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('FUNCTION_SECRET') ?? '';
  if (secret) {
    const incoming = req.headers.get('x-ancori-secret') ?? '';
    if (incoming !== secret) return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing_env' });

  let body: { client_id?: string };
  try {
    body = (await req.json()) as { client_id?: string };
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const clientId = body.client_id?.trim();
  if (!clientId) return json(400, { error: 'missing_fields', required: ['client_id'] });

  const supabase = createClient(supabaseUrl, serviceKey);
  const result = await syncAncoriClientToAgileCheck(supabase, clientId);

  if (!result.ok) {
    return json(502, {
      ok: false,
      error: result.error,
      detail: result.detail,
      http_status: result.http_status,
    });
  }

  return json(200, {
    ok: true,
    agilecheck_cliente_id: result.agilecheck_cliente_id,
    action: result.action,
  });
});
