import { getSupabase } from '@/lib/supabaseClient';

export type ComplianceCheck = {
  id: string;
  entity_type: 'client' | 'director' | 'society';
  entity_id: string;
  entity_name: string;
  check_type: string;
  status: 'pending' | 'clean' | 'match' | 'review' | 'error';
  risk_level: 'bajo' | 'medio' | 'alto' | 'critico' | null;
  agilecheck_id: string | null;
  result_summary: string | null;
  checked_by: string | null;
  checked_at: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ComplianceStats = {
  total: number;
  clean: number;
  match: number;
  review: number;
  pending: number;
  error: number;
  expired: number;
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  clean: 'Limpio',
  match: 'Coincidencia PEP',
  review: 'En Revision',
  error: 'Error',
};

const RISK_LABELS: Record<string, string> = {
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  critico: 'Critico',
};

const ENTITY_LABELS: Record<string, string> = {
  client: 'Cliente',
  director: 'Director',
  society: 'Sociedad',
};

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function getRiskLabel(risk: string | null): string {
  if (!risk) return '—';
  return RISK_LABELS[risk] ?? risk;
}

export function getEntityLabel(type: string): string {
  return ENTITY_LABELS[type] ?? type;
}

/** Cargar todas las verificaciones, opcionalmente filtradas */
export async function fetchComplianceChecks(
  entityType?: string,
  entityId?: string,
): Promise<ComplianceCheck[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let query = sb
    .from('compliance_checks')
    .select('*')
    .order('created_at', { ascending: false });

  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);

  const { data, error } = await query;
  if (error) {
    console.error('[agileCheckApi] Error cargando checks:', error.message);
    return [];
  }
  return (data ?? []) as ComplianceCheck[];
}

/** Obtener estadísticas de cumplimiento */
export function computeStats(checks: ComplianceCheck[]): ComplianceStats {
  const now = new Date();
  let expired = 0;

  const stats: ComplianceStats = {
    total: checks.length,
    clean: 0, match: 0, review: 0, pending: 0, error: 0, expired: 0,
  };

  for (const c of checks) {
    if (c.status in stats) {
      (stats as any)[c.status]++;
    }
    if (c.expires_at && new Date(c.expires_at) < now && c.status !== 'pending') {
      expired++;
    }
  }
  stats.expired = expired;
  return stats;
}

/** Verificar una entidad llamando a la Edge Function */
export async function verifyEntity(
  entityType: 'client' | 'director' | 'society',
  entityId: string,
  entityName: string,
  checkType: string = 'PEP',
  checkedByUsuarioId?: string,
): Promise<{ ok: boolean; error?: string; check_id?: string; status?: string; summary?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase no configurado' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret = (import.meta.env.VITE_AGILECHECK_SECRET as string | undefined)?.trim()
    || (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim()
    || '';

  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/agilecheck-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ancori-secret': secret,
      },
      body: JSON.stringify({
        entity_type: entityType,
        entity_id: entityId,
        entity_name: entityName,
        check_type: checkType,
        checked_by_usuario_id: checkedByUsuarioId,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error ?? data.detail ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      check_id: data.check_id,
      status: data.status,
      summary: data.summary,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Obtener la última verificación de una entidad */
export async function getLatestCheck(
  entityType: string,
  entityId: string,
): Promise<ComplianceCheck | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb
    .from('compliance_checks')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as ComplianceCheck | null;
}
