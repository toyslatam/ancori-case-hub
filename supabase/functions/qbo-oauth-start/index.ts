/**
 * Inicia OAuth con Intuit: redirige al usuario a la pantalla de consentimiento.
 *
 * GET ?apikey=<anon>&redirect_to=<url codificada>
 *
 * Secrets: QBO_CLIENT_ID, QBO_CRON_SECRET (firma de state), QBO_REDIRECT_URI (callback exacto en Intuit)
 * Opcional: QBO_ALLOWED_REDIRECT_PREFIXES = lista separada por comas de orígenes permitidos para redirect_to
 */
import {
  buildOAuthState,
  isRedirectAllowed,
  parseAllowedRedirectPrefixes,
} from '../_shared/intuit-oauth.ts';

const INTUIT_AUTH = 'https://appcenter.intuit.com/connect/oauth2';
const SCOPE = 'com.intuit.quickbooks.accounting';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const cronSecret = Deno.env.get('QBO_CRON_SECRET');
  const redirectUri = Deno.env.get('QBO_REDIRECT_URI');
  const prefixes = parseAllowedRedirectPrefixes(Deno.env.get('QBO_ALLOWED_REDIRECT_PREFIXES'));

  if (!clientId || !cronSecret || !redirectUri) {
    return new Response(
      JSON.stringify({ error: 'missing_secrets', hint: 'QBO_CLIENT_ID, QBO_CRON_SECRET, QBO_REDIRECT_URI' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (prefixes.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'missing_qbo_allowed_redirect_prefixes',
        hint: 'Define QBO_ALLOWED_REDIRECT_PREFIXES, ej: http://localhost:5173,https://tu-dominio.com',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(req.url);
  const redirectTo = url.searchParams.get('redirect_to') ?? '';
  if (!redirectTo || !isRedirectAllowed(redirectTo, prefixes)) {
    return new Response(
      JSON.stringify({
        error: 'invalid_redirect_to',
        hint: 'redirect_to debe comenzar por un prefijo de QBO_ALLOWED_REDIRECT_PREFIXES',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const state = await buildOAuthState(redirectTo, cronSecret, 600);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state,
  });

  const location = `${INTUIT_AUTH}?${params.toString()}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Access-Control-Allow-Origin': '*',
    },
  });
});
