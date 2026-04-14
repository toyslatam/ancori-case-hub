/**
 * Obtiene access_token válido para la API de QBO; renueva con refresh_token si hace falta.
 */
// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

const LEEWAY_MS = 120_000;

function defaultRealmFromEnv(): string {
  return (Deno.env.get('QBO_DEFAULT_REALM_ID') ?? '').trim();
}

/** `realm_id` en BD tiene prioridad; si falta, se usa el secret `QBO_DEFAULT_REALM_ID` (sin commitear el valor real). */
function resolveRealmId(rowRealm: string | null | undefined): string {
  const fromDb = (rowRealm ?? '').trim();
  if (fromDb) return fromDb;
  return defaultRealmFromEnv();
}

export async function getValidQboAccessToken(
  supabase: SupabaseAdmin,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; realmId: string }> {
  const { data: row, error: readErr } = await supabase
    .from('qbo_oauth_tokens')
    .select('realm_id, access_token, refresh_token, access_expires_at')
    .eq('id', 'default')
    .maybeSingle();

  if (readErr) throw new Error(`db_read: ${readErr.message}`);
  if (!row?.refresh_token) throw new Error('qbo_not_configured');
  const realmId = resolveRealmId(row.realm_id);
  if (!realmId) throw new Error('qbo_missing_realm');

  const now = Date.now();
  const exp = row.access_expires_at ? new Date(row.access_expires_at).getTime() : 0;
  if (row.access_token && exp - LEEWAY_MS > now) {
    return { accessToken: row.access_token, realmId };
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
    throw new Error(`intuit_token_parse: ${rawText.slice(0, 200)}`);
  }

  if (!tokenRes.ok) {
    throw new Error(
      `intuit_refresh_failed: ${(tokenJson.error_description as string) || (tokenJson.error as string) || tokenRes.status}`
    );
  }

  const accessToken = tokenJson.access_token as string | undefined;
  const refreshToken = (tokenJson.refresh_token as string | undefined) ?? row.refresh_token;
  const expiresIn = Number(tokenJson.expires_in ?? 3600);
  if (!accessToken) throw new Error('intuit_missing_access_token');

  const accessExpiresAt = new Date(now + expiresIn * 1000).toISOString();

  const { error: writeErr } = await supabase.from('qbo_oauth_tokens').upsert(
    {
      id: 'default',
      realm_id: realmId,
      access_token: accessToken,
      refresh_token: refreshToken,
      access_expires_at: accessExpiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );

  if (writeErr) throw new Error(`db_write: ${writeErr.message}`);

  return { accessToken, realmId };
}
