import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Ajustar según necesidad. false = usar el fetch nativo de Supabase sin wrapper.
const CUSTOM_FETCH_ENABLED = true;

const REQUEST_TIMEOUT_MS = 30_000;      // 30s por intento
const HIGH_LATENCY_THRESHOLD_MS = 5_000; // alerta si >5s
const MAX_RETRIES = 2;                   // 1 intento original + 1 reintento

/**
 * Retorna true solo si el AbortError fue disparado por el signal
 * que creamos internamente (timeout propio), no por un signal externo
 * pasado por Supabase (p. ej. al cancelar una suscripción).
 */
function isOwnAbort(e: unknown, controller: AbortController): boolean {
  return (
    e instanceof DOMException &&
    e.name === 'AbortError' &&
    controller.signal.aborted
  );
}

/**
 * Fetch personalizado para el cliente Supabase.
 *
 * Garantías:
 * - Sin keepalive (evita comportamiento raro en APIs REST/POST largas).
 * - Cada intento usa un AbortController NUEVO; nunca se reutiliza un signal abortado.
 * - El timeout propio es de 30s. El signal externo de Supabase se respeta
 *   sin contar como "error reintentable".
 * - Solo reintenta en errores de red reales; AbortError externo (de Supabase)
 *   se relanza inmediatamente sin reintento.
 * - Logs claros: intento N/M, tiempo real, alerta de latencia alta.
 */
async function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;
  const method = (init?.method ?? 'GET').toUpperCase();

  // Si Supabase ya pasó su propio signal (p. ej. para cancelar realtime),
  // lo respetamos sin añadir nuestro timeout encima.
  const hasExternalSignal = Boolean(init?.signal);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Nuevo controller por intento para evitar reutilizar un signal ya abortado.
    const ownController = new AbortController();
    let tid: ReturnType<typeof window.setTimeout> | undefined;

    // Solo añadir timeout propio si Supabase no pasó su signal.
    if (!hasExternalSignal) {
      tid = window.setTimeout(() => {
        ownController.abort();
        console.warn(
          `[supabase] TIMEOUT propio (${REQUEST_TIMEOUT_MS}ms) intento ${attempt}/${MAX_RETRIES} → ${method} ${urlStr.split('?')[0]}`,
        );
      }, REQUEST_TIMEOUT_MS);
    }

    const signal = hasExternalSignal
      ? (init!.signal as AbortSignal)
      : ownController.signal;

    const t0 = performance.now();
    console.debug(`[supabase] intento ${attempt}/${MAX_RETRIES} → ${method} ${urlStr.split('?')[0]}`);

    try {
      // SIN keepalive: evita comportamiento indefinido en POSTs/PATCHes largos.
      const { keepalive: _dropped, signal: _sig, ...safeInit } = (init ?? {}) as RequestInit & { keepalive?: boolean };
      const res = await fetch(input, { ...safeInit, signal });

      const elapsed = Math.round(performance.now() - t0);
      if (tid !== undefined) window.clearTimeout(tid);

      if (elapsed > HIGH_LATENCY_THRESHOLD_MS) {
        console.warn(`[supabase] ⚠ LATENCIA ALTA ${elapsed}ms → ${method} ${urlStr.split('?')[0]}`);
      } else {
        console.debug(`[supabase] ✓ ${elapsed}ms intento ${attempt} → ${method}`);
      }

      return res;
    } catch (e) {
      const elapsed = Math.round(performance.now() - t0);
      if (tid !== undefined) window.clearTimeout(tid);

      const ownAbort = isOwnAbort(e, ownController);
      const externalAbort = !ownAbort && e instanceof DOMException && e.name === 'AbortError';

      if (externalAbort) {
        // Signal externo de Supabase (p. ej. cancelación de auth/realtime).
        // No reintentamos; relanzamos de inmediato para que Supabase lo maneje.
        console.debug(`[supabase] AbortError externo (no reintentable) → ${method}`);
        throw e;
      }

      const label = ownAbort ? `TIMEOUT propio (${REQUEST_TIMEOUT_MS}ms)` : 'ERROR de red';
      console.error(
        `[supabase] ${label} intento ${attempt}/${MAX_RETRIES} (${elapsed}ms) → ${method} ${urlStr.split('?')[0]}`,
        e,
      );

      if (attempt >= MAX_RETRIES) {
        console.error(`[supabase] Todos los reintentos agotados para → ${method} ${urlStr.split('?')[0]}`);
        throw e;
      }

      // Backoff corto antes del reintento.
      const backoff = 1_000 * attempt;
      console.debug(`[supabase] Reintentando en ${backoff}ms…`);
      await new Promise(r => window.setTimeout(r, backoff));
    }
  }

  // TypeScript: nunca se alcanza.
  throw new Error('[supabase] Max retries alcanzados sin respuesta.');
}

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabaseConfig(): { url?: string; anonKey?: string } {
  return { url, anonKey };
}

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      global: {
        // Deshabilitar con CUSTOM_FETCH_ENABLED = false si causa problemas.
        ...(CUSTOM_FETCH_ENABLED ? { fetch: supabaseFetch } : {}),
      },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}
