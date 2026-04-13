/**
 * Supabase Edge Function: refresca access_token de QuickBooks Online.
 * Invocación: POST + Authorization: Bearer <QBO_CRON_SECRET>
 *
 * Secrets (Dashboard → Edge Functions): QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_CRON_SECRET
 * Auto: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };
const LEEWAY_SEC = 120;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HDR });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qbo-cron-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const headerSecret = req.headers.get('x-qbo-cron-secret') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!cronSecret || (bearer !== cronSecret && headerSecret !== cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'missing_supabase_env' });
  }

  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return json(500, { error: 'missing_qbo_client_credentials' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: row, error: readErr } = await supabase
    .from('qbo_oauth_tokens')
    .select('id, realm_id, access_token, refresh_token, access_expires_at')
    .eq('id', 'default')
    .maybeSingle();

  if (readErr) {
    return json(500, { error: 'db_read', detail: readErr.message });
  }

  if (!row?.refresh_token) {
    return json(503, { error: 'not_configured', hint: 'Inserta tokens tras OAuth o despliega qbo-oauth-callback' });
  }

  const now = Date.now();
  const expiresAt = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (row.access_token && expiresAt - LEEWAY_SEC * 1000 > now) {
    return json(200, {
      skipped: true,
      access_expires_at: row.access_expires_at,
      realm_id: row.realm_id,
    });
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
  });

  const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const rawText = await tokenRes.text();
  let tokenJson: Record<string, unknown> = {};
  try {
    tokenJson = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return json(502, { error: 'intuit_invalid_json', status: tokenRes.status, body: rawText.slice(0, 500) });
  }

  if (!tokenRes.ok) {
    return json(502, {
      error: 'intuit_token_error',
      status: tokenRes.status,
      intuit: tokenJson,
    });
  }

  const accessToken = tokenJson.access_token as string | undefined;
  const refreshToken = (tokenJson.refresh_token as string | undefined) ?? row.refresh_token;
  const expiresIn = Number(tokenJson.expires_in ?? 3600);
  if (!accessToken) {
    return json(502, { error: 'intuit_missing_access_token', intuit: tokenJson });
  }

  const accessExpiresAt = new Date(now + expiresIn * 1000).toISOString();

  const { error: writeErr } = await supabase
    .from('qbo_oauth_tokens')
    .upsert(
      {
        id: 'default',
        access_token: accessToken,
        refresh_token: refreshToken,
        access_expires_at: accessExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (writeErr) {
    return json(500, { error: 'db_write', detail: writeErr.message });
  }

  return json(200, {
    refreshed: true,
    access_expires_at: accessExpiresAt,
    realm_id: row.realm_id,
  });
});
