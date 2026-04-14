import { getSupabase } from '@/lib/supabaseClient';

export type SyncConflict = {
  id: string;
  society_id: string;
  field_name: string;
  supabase_value: string | null;
  quickbooks_value: string | null;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

const FIELD_LABELS: Record<string, string> = {
  ruc: 'RUC',
  dv: 'DV',
  nit: 'NIT',
  tipo_sociedad: 'Tipo de Sociedad',
  direccion: 'Direccion',
  presidente_name: 'Presidente',
  tesorero_name: 'Tesorero',
  secretario_name: 'Secretario',
  nombre: 'Nombre',
  razon_social: 'Razon Social',
  correo: 'Correo',
};

export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Carga todos los conflictos pendientes */
export async function fetchPendingConflicts(): Promise<SyncConflict[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('sync_conflicts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[conciliacionApi] Error cargando conflictos:', error.message);
    return [];
  }
  return (data ?? []) as SyncConflict[];
}

/** Resuelve un conflicto llamando a la Edge Function qbo-reconcile */
export async function resolveConflict(
  conflictId: string,
  resolution: 'supabase' | 'quickbooks',
  resolvedByUsuarioId: string,
): Promise<{ ok: boolean; error?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase no configurado' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret =
    import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET ??
    import.meta.env.VITE_QBO_CRON_SECRET ??
    '';

  if (!secret) {
    return { ok: false, error: 'Falta VITE_QBO_SOCIETY_PUSH_SECRET en .env.local' };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/qbo-reconcile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-qbo-society-push-secret': secret,
      },
      body: JSON.stringify({
        conflict_id: conflictId,
        resolution,
        resolved_by_usuario_id: resolvedByUsuarioId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error ?? data.detail ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Descarta un conflicto (sin enviar nada a QB) */
export async function dismissConflict(conflictId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  const { error } = await sb
    .from('sync_conflicts')
    .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', conflictId);

  return !error;
}
