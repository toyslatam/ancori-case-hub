/**
 * Estado de la integración QBO (sin tokens). Invocación pública con apikey (como otras Edge Functions públicas).
 * Cuando la app tenga login, se puede endurecer con verify_jwt + comprobación de rol.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  const headers: Record<string, string> = {
    ...JSON_HDR,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info',
  };
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info',
      },
    });
  }

  if (req.method !== 'GET') {
    return json(405, { error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'missing_supabase_env' });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data, error } = await admin
    .from('qbo_oauth_tokens')
    .select('realm_id, access_expires_at, refresh_token')
    .eq('id', 'default')
    .maybeSingle();

  if (error) {
    return json(500, { error: 'db_read', detail: error.message });
  }

  const envRealm = (Deno.env.get('QBO_DEFAULT_REALM_ID') ?? '').trim();
  const dbRealm = (data?.realm_id ?? '').trim();
  return json(200, {
    connected: Boolean(data?.refresh_token),
    realm_id: dbRealm || envRealm || null,
    access_expires_at: data?.access_expires_at ?? null,
  });
});
