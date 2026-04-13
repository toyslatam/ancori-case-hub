/**
 * Estado firmado para OAuth QBO (CSRF + redirect seguro).
 */
export async function hmacSha256Base64Url(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function buildOAuthState(
  redirectTo: string,
  secret: string,
  ttlSec: number
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const payload = JSON.stringify({ exp, rd: redirectTo });
  const b64 = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sig = await hmacSha256Base64Url(b64, secret);
  return `${b64}.${sig}`;
}

export async function verifyOAuthState(
  state: string,
  secret: string
): Promise<{ redirectTo: string } | null> {
  const lastDot = state.lastIndexOf('.');
  if (lastDot < 0) return null;
  const b64 = state.slice(0, lastDot);
  const sig = state.slice(lastDot + 1);
  const expected = await hmacSha256Base64Url(b64, secret);
  if (sig !== expected) return null;
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const json = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const parsed = JSON.parse(json) as { exp?: number; rd?: string };
  if (typeof parsed.exp !== 'number' || typeof parsed.rd !== 'string') return null;
  if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
  return { redirectTo: parsed.rd };
}

export function parseAllowedRedirectPrefixes(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function isRedirectAllowed(redirectTo: string, prefixes: string[]): boolean {
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const origin = url.origin;
  return prefixes.some((p) => origin === p || redirectTo.startsWith(p + '/'));
}

export function appendQueryParams(
  baseUrl: string,
  params: Record<string, string | undefined>
): string {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) u.searchParams.set(k, v);
  }
  return u.toString();
}
