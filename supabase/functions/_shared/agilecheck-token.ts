/**
 * Token OAuth2 AgileCheck (password grant) + utilidades de URL.
 * Compartido por agilecheck-verify y agilecheck-sync-client.
 */

export type AgileTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export function apiUrlJoin(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

export async function getAgileCheckToken(): Promise<
  { ok: true; token: string; raw: AgileTokenResponse } |
  { ok: false; summary: string; raw: Record<string, unknown> }
> {
  const tokenUrl = Deno.env.get('AGILECHECK_TOKEN_URL')?.trim();
  const username = Deno.env.get('AGILECHECK_USERNAME')?.trim();
  const password = Deno.env.get('AGILECHECK_PASSWORD')?.trim();
  const grantType = Deno.env.get('AGILECHECK_GRANT_TYPE')?.trim() || 'password';

  if (!tokenUrl || !username || !password) {
    return {
      ok: false,
      summary: 'AgileCheck no configurado: faltan AGILECHECK_TOKEN_URL, AGILECHECK_USERNAME o AGILECHECK_PASSWORD',
      raw: {
        error: 'missing_token_config',
        has_token_url: Boolean(tokenUrl),
        has_username: Boolean(username),
        has_password: Boolean(password),
      },
    };
  }

  const body = new URLSearchParams();
  body.set('username', username);
  body.set('password', password);
  body.set('grant_type', grantType);

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    const text = await res.text();
    let data: AgileTokenResponse = {};
    try {
      data = JSON.parse(text) as AgileTokenResponse;
    } catch {
      return {
        ok: false,
        summary: `AgileCheck token respuesta no-JSON: ${text.slice(0, 200)}`,
        raw: { raw: text.slice(0, 500), http_status: res.status },
      };
    }

    if (!res.ok || !data.access_token) {
      return {
        ok: false,
        summary: `AgileCheck token HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`,
        raw: data as Record<string, unknown>,
      };
    }

    return { ok: true, token: data.access_token, raw: data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      summary: `Error obteniendo token AgileCheck: ${msg.slice(0, 200)}`,
      raw: { error: msg },
    };
  }
}
