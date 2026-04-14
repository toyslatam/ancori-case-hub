import type { Society } from '@/data/mockData';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

const QBO_SESSION_KEY = 'ancori.qbo.connected';

export type QboStatus = {
  connected: boolean;
  realm_id: string | null;
  access_expires_at: string | null;
};

function functionsBaseUrl(): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/functions/v1`;
}

/** URL absoluta de retorno tras OAuth (misma app, ruta configuración). */
export function getQboOAuthRedirectTo(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/configuracion`;
}

/** URL para abrir en el navegador e iniciar consentimiento Intuit. */
export function getQboOAuthStartUrl(): string | null {
  const root = functionsBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!root || !anon || !isSupabaseConfigured()) return null;
  const u = new URL(`${root}/qbo-oauth-start`);
  u.searchParams.set('apikey', anon);
  u.searchParams.set('redirect_to', getQboOAuthRedirectTo());
  return u.toString();
}

/** Estado en servidor (realm + expiración aprox.; no devuelve secretos). */
export async function fetchQboStatus(): Promise<QboStatus> {
  const root = functionsBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!root || !anon) {
    throw new Error('Supabase no configurado');
  }
  const u = new URL(`${root}/qbo-oauth-status`);
  u.searchParams.set('apikey', anon);
  const res = await fetch(u.toString(), { method: 'GET' });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<QboStatus>;
}

export function readQboConnectedHint(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(QBO_SESSION_KEY) === '1';
}

export function setQboConnectedHint(value: boolean) {
  if (typeof window === 'undefined') return;
  if (value) sessionStorage.setItem(QBO_SESSION_KEY, '1');
  else sessionStorage.removeItem(QBO_SESSION_KEY);
}

/**
 * Push inmediato App → QBO al guardar/borrar sociedad.
 * Define en .env.local (no subir a git):
 *   VITE_QBO_SOCIETY_PUSH_SECRET=<mismo valor que QBO_SOCIETY_PUSH_SECRET o QBO_CRON_SECRET en Supabase>
 * Cualquiera con el build puede ver el secreto: solo para entornos cerrados; con Supabase Auth se puede sustituir por JWT.
 */
export function isQboSocietyPushConfigured(): boolean {
  const secret = (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim();
  return Boolean(functionsBaseUrl() && import.meta.env.VITE_SUPABASE_ANON_KEY && secret);
}

export async function pushSocietyToQuickbooksUpsert(
  s: Society
): Promise<{ quickbooks_customer_id?: string; id_qb?: number }> {
  const secret = (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim();
  const root = functionsBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!secret || !root || !anon) return {};

  const res = await fetch(`${root}/qbo-society-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      'x-qbo-society-push-secret': secret,
    },
    body: JSON.stringify({
      operation: 'upsert',
      society: {
        id: s.id,
        nombre: s.nombre,
        razon_social: s.razon_social,
        correo: s.correo,
        activo: s.activo,
        quickbooks_customer_id: s.quickbooks_customer_id ?? null,
      },
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    quickbooks_customer_id?: string;
    created_customer_id?: string;
    id_qb?: number;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(j.detail || j.error || `HTTP ${res.status}`);
  }
  const qbid = j.quickbooks_customer_id ?? j.created_customer_id;
  const idQb = typeof j.id_qb === 'number' && Number.isFinite(j.id_qb) ? j.id_qb : undefined;
  if (!qbid && idQb == null) return {};
  return { ...(qbid ? { quickbooks_customer_id: qbid } : {}), ...(idQb != null ? { id_qb: idQb } : {}) };
}

export type QboSyncItemsResult = {
  total_qbo: number;
  inserted: number;
  updated: number;
  skipped: number;
  realm_id: string;
};

/** Llama a la Edge Function qbo-sync-items para traer Items de QB → service_items.
 *  Requiere VITE_QBO_CRON_SECRET en .env.local (mismo valor que QBO_CRON_SECRET en Supabase). */
export async function syncServiceItemsFromQbo(): Promise<QboSyncItemsResult> {
  const secret = (import.meta.env.VITE_QBO_CRON_SECRET as string | undefined)?.trim();
  const root = functionsBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!secret || !root || !anon) {
    throw new Error('VITE_QBO_CRON_SECRET no configurado en .env.local');
  }
  const res = await fetch(`${root}/qbo-sync-items`, {
    method: 'POST',
    headers: {
      apikey: anon,
      Authorization: `Bearer ${secret}`,
    },
  });
  const j = (await res.json().catch(() => ({}))) as QboSyncItemsResult & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(j.detail || j.error || `HTTP ${res.status}`);
  }
  return j;
}

export async function pushSocietyToQuickbooksDelete(quickbooksCustomerId: string | undefined): Promise<void> {
  const secret = (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim();
  const root = functionsBaseUrl();
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!secret || !root || !anon) return;
  if (!quickbooksCustomerId?.trim()) return;

  const res = await fetch(`${root}/qbo-society-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      'x-qbo-society-push-secret': secret,
    },
    body: JSON.stringify({
      operation: 'delete',
      quickbooks_customer_id: quickbooksCustomerId.trim(),
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { detail?: string; error?: string };
    throw new Error(j.detail || j.error || `HTTP ${res.status}`);
  }
}
