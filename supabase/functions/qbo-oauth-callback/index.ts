/**
 * Callback OAuth de Intuit: intercambia code por tokens y guarda en qbo_oauth_tokens.
 *
 * GET (redirect desde Intuit) con code, realmId, state — o error de OAuth.
 *
 * Secrets: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_CRON_SECRET, QBO_REDIRECT_URI
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendQueryParams, verifyOAuthState } from '../_shared/intuit-oauth.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function redirect(url: string, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: url, 'Access-Control-Allow-Origin': '*' },
  });
}

/** Intuit redirige con `realmId` (camelCase); aceptamos `realm_id` por si un proxy normaliza la query. */
function realmIdFromCallbackUrl(url: URL): string | null {
  const raw =
    url.searchParams.get('realmId') ??
    url.searchParams.get('realm_id') ??
    url.searchParams.get('realmID');
  const t = raw?.trim() ?? '';
  return t.length > 0 ? t : null;
}

Deno.serve(async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  const redirectUri = Deno.env.get('QBO_REDIRECT_URI');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  const oauthDesc = url.searchParams.get('error_description') ?? '';
  const state = url.searchParams.get('state') ?? '';

  const parsedState =
    state && cronSecret ? await verifyOAuthState(state, cronSecret) : null;

  const failRedirect = (code: string, message?: string) => {
    if (!parsedState?.redirectTo) {
      return new Response(JSON.stringify({ error: code, message: message ?? null }), {
        status: 400,
        headers: JSON_HDR,
      });
    }
    const target = appendQueryParams(parsedState.redirectTo, {
      qb: code,
      msg: message?.slice(0, 200),
    });
    return redirect(target);
  };

  if (oauthError) {
    return failRedirect('denied', oauthDesc || oauthError);
  }

  if (!clientId || !clientSecret || !redirectUri || !supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing_env' }), {
      status: 500,
      headers: JSON_HDR,
    });
  }

  if (!parsedState) {
    return new Response(JSON.stringify({ error: 'invalid_state' }), {
      status: 400,
      headers: JSON_HDR,
    });
  }

  const code = url.searchParams.get('code')?.trim();
  const realmIdVal = realmIdFromCallbackUrl(url);
  if (!code || !realmIdVal) {
    return failRedirect('incomplete', 'Falta code o realmId en la URL de callback');
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
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
    return failRedirect('token_parse', rawText.slice(0, 120));
  }

  if (!tokenRes.ok) {
    const msg =
      (tokenJson.error_description as string) ||
      (tokenJson.error as string) ||
      `http_${tokenRes.status}`;
    return failRedirect('token_exchange', msg);
  }

  const accessToken = tokenJson.access_token as string | undefined;
  const refreshToken = tokenJson.refresh_token as string | undefined;
  const expiresIn = Number(tokenJson.expires_in ?? 3600);
  if (!accessToken || !refreshToken) {
    return failRedirect('token_missing', 'Sin access_token o refresh_token');
  }

  const accessExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const supabase = createClient(supabaseUrl, serviceKey);

  const { error: writeErr } = await supabase.from('qbo_oauth_tokens').upsert(
    {
      id: 'default',
      realm_id: realmIdVal,
      access_token: accessToken,
      refresh_token: refreshToken,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (writeErr) {
    return failRedirect('db', writeErr.message);
  }

  const okUrl = appendQueryParams(parsedState.redirectTo, { qb: 'connected' });
  return redirect(okUrl);
});
