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
  /** Respuesta cruda del Hub + metadatos (p. ej. `identity_alignment`). */
  result_data?: Record<string, unknown> | null;
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
    // Tabla puede no existir aún — no crashear
    if (!error.message.includes('compliance_checks')) {
      console.error('[agileCheckApi] Error cargando checks:', error.message);
    }
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

/** Opciones extra para HubQueryEngine / Consulta/Buscar (persona natural vs jurídica, documento). */
export type VerifyEntityHubOptions = {
  es_juridico?: boolean;
  nombres?: string;
  apellidos?: string;
  numero_id?: string;
  /** Correo del usuario en sesión; la Edge Function resuelve `public.usuarios.id` para `checked_by` (el id de Auth no coincide con `usuarios.id`). */
  checked_by_correo?: string;
  /** Solo `entity_type === 'client'`: tras la verificación PEP intenta POST/PUT en AgileCheck `/api/Cliente`. Requiere `AGILECHECK_PRODUCTO_TOMADO_ID` en Supabase. */
  sync_agilecheck_client?: boolean;
};

/** Verificar una entidad llamando a la Edge Function */
export async function verifyEntity(
  entityType: 'client' | 'director' | 'society',
  entityId: string,
  entityName: string,
  checkType: string = 'PEP',
  checkedByUsuarioId?: string,
  hubOptions?: VerifyEntityHubOptions,
): Promise<{
  ok: boolean;
  error?: string;
  check_id?: string;
  status?: string;
  summary?: string;
  sync_agilecheck_client?: { ok: boolean; agilecheck_cliente_id?: number; action?: string; error?: string; detail?: string };
}> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase no configurado' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  /** Mismo valor que `FUNCTION_SECRET` en Supabase (agilecheck-verify). Orden: dedicado AgileCheck → secreto general de funciones → legado QBO. */
  const secret =
    (import.meta.env.VITE_AGILECHECK_SECRET as string | undefined)?.trim()
    || (import.meta.env.VITE_FUNCTION_SECRET as string | undefined)?.trim()
    || (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim()
    || '';

  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };
  if (!secret) {
    return {
      ok: false,
      error:
        'Falta secreto para la función: defina VITE_AGILECHECK_SECRET o VITE_FUNCTION_SECRET (debe coincidir con FUNCTION_SECRET en Supabase).',
    };
  }

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
        ...(hubOptions?.es_juridico !== undefined ? { es_juridico: hubOptions.es_juridico } : {}),
        ...(hubOptions?.nombres ? { nombres: hubOptions.nombres } : {}),
        ...(hubOptions?.apellidos ? { apellidos: hubOptions.apellidos } : {}),
        ...(hubOptions?.numero_id ? { numero_id: hubOptions.numero_id } : {}),
        ...(hubOptions?.checked_by_correo?.trim()
          ? { checked_by_correo: hubOptions.checked_by_correo.trim() }
          : {}),
        ...(hubOptions?.sync_agilecheck_client === true ? { sync_agilecheck_client: true } : {}),
      }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {
          ok: false,
          error:
            text.length > 400
              ? `${text.slice(0, 400)}… (HTTP ${res.status})`
              : `${text || `HTTP ${res.status}`}`,
        };
      }
    }
    if (!res.ok) {
      const rawErr =
        (typeof data.error === 'string' && data.error) ||
        (typeof data.detail === 'string' && data.detail) ||
        (typeof data.message === 'string' && data.message) ||
        `HTTP ${res.status}`;
      const err =
        res.status === 401 && String(rawErr).toLowerCase() === 'unauthorized'
          ? 'No autorizado: x-ancori-secret no coincide con FUNCTION_SECRET en Supabase (o falta en el deploy). Use el mismo valor en VITE_AGILECHECK_SECRET o VITE_FUNCTION_SECRET.'
          : rawErr;
      const detail =
        typeof data.detail === 'string' && data.detail.trim() && data.detail !== rawErr
          ? data.detail.trim()
          : '';
      const composed =
        String(rawErr) === 'db_insert_failed' && detail
          ? `${err}: ${detail}`
          : detail && !err.includes(detail)
            ? `${err} (${detail})`
            : err;
      return { ok: false, error: composed };
    }
    const syncRaw = data.sync_agilecheck_client;
    const sync_agilecheck_client =
      syncRaw && typeof syncRaw === 'object' && !Array.isArray(syncRaw)
        ? (syncRaw as {
          ok?: boolean;
          agilecheck_cliente_id?: number;
          action?: string;
          error?: string;
          detail?: string;
        })
        : undefined;

    return {
      ok: true,
      check_id: typeof data.check_id === 'string' ? data.check_id : undefined,
      status: typeof data.status === 'string' ? data.status : undefined,
      summary: typeof data.summary === 'string' ? data.summary : undefined,
      ...(sync_agilecheck_client !== undefined ? { sync_agilecheck_client } : {}),
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

// ─── Perfil completo AgileCheck ────────────────────────────────────────────

export type AgileCheckProfile = {
  agilecheck_cliente_id: number;
  profile: Record<string, unknown>;
  es_alto_riesgo: unknown;
  detalle_riesgo: unknown;
  risk_label: string;
  updated_fields: {
    ag_riesgo: number | null;
    ag_riesgo_nivel: number | null;
    ag_porcCompletadoDD: number | null;
    ag_verificado_en_listas: boolean | null;
    ag_last_sync_at: string;
  };
};

function getSecret(): string {
  return (
    (import.meta.env.VITE_AGILECHECK_SECRET as string | undefined)?.trim() ||
    (import.meta.env.VITE_FUNCTION_SECRET as string | undefined)?.trim() ||
    (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim() ||
    ''
  );
}

/**
 * Obtiene el perfil completo de un cliente o sociedad desde AgileCheck y actualiza los campos ag_* en BD.
 * Si la entidad no tiene agilecheck_cliente_id guardado, intenta encontrarla por documento primero.
 * Devuelve `error: 'no_agilecheck_link'` si no está registrada en AgileCheck aún.
 */
export async function fetchAgileCheckProfile(
  entityType: 'client' | 'society',
  entityId: string,
): Promise<{ ok: true } & AgileCheckProfile | { ok: false; error: string; detail?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret = getSecret();
  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };
  if (!secret) return { ok: false, error: 'Falta secreto de función (VITE_AGILECHECK_SECRET o VITE_FUNCTION_SECRET)' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/agilecheck-fetch-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ancori-secret': secret },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) { try { data = JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 300) }; } }

    if (!res.ok) {
      return {
        ok: false,
        error: String(data.error ?? `HTTP ${res.status}`),
        detail: typeof data.detail === 'string' ? data.detail : undefined,
      };
    }
    if (data.ok === false) {
      return {
        ok: false,
        error: String(data.error ?? 'unknown'),
        detail: typeof data.detail === 'string' ? data.detail : undefined,
      };
    }
    return { ok: true, ...(data as unknown as AgileCheckProfile) };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Sincroniza una sociedad Ancori → AgileCheck como Persona Jurídica. */
export async function syncSocietyToAgileCheck(
  societyId: string,
): Promise<{ ok: boolean; agilecheck_cliente_id?: number; action?: string; error?: string; detail?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret = getSecret();
  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };
  if (!secret) return { ok: false, error: 'Falta secreto de función' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/agilecheck-sync-society`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ancori-secret': secret },
      body: JSON.stringify({ society_id: societyId }),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) { try { data = JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 300) }; } }
    if (!res.ok) {
      return { ok: false, error: String(data.error ?? `HTTP ${res.status}`), detail: typeof data.detail === 'string' ? data.detail : undefined };
    }
    return {
      ok: true,
      agilecheck_cliente_id: typeof data.agilecheck_cliente_id === 'number' ? data.agilecheck_cliente_id : undefined,
      action: typeof data.action === 'string' ? data.action : undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Envía campos editados por el usuario → AgileCheck (PUT).
 * Solo se llama tras confirmación explícita del usuario.
 */
export async function pushAgileCheckField(
  entityType: 'client' | 'society',
  entityId: string,
  fields: Record<string, unknown>,
): Promise<{ ok: boolean; fields_pushed?: string[]; error?: string; detail?: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret = getSecret();
  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };
  if (!secret) return { ok: false, error: 'Falta secreto de función' };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/agilecheck-push-profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ancori-secret': secret },
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId, fields }),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) { try { data = JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 300) }; } }
    if (!res.ok) {
      return { ok: false, error: String(data.error ?? `HTTP ${res.status}`), detail: typeof data.detail === 'string' ? data.detail : undefined };
    }
    return {
      ok: true,
      fields_pushed: Array.isArray(data.fields_pushed) ? (data.fields_pushed as string[]) : undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Sincroniza un cliente Ancori → AgileCheck (`POST/PUT /api/Cliente`) vía Edge Function `agilecheck-sync-client`. */
export async function syncClientToAgileCheck(
  clientId: string,
): Promise<{ ok: boolean; error?: string; agilecheck_cliente_id?: number; action?: string; detail?: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: 'Supabase no configurado' };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const secret =
    (import.meta.env.VITE_AGILECHECK_SECRET as string | undefined)?.trim()
    || (import.meta.env.VITE_FUNCTION_SECRET as string | undefined)?.trim()
    || (import.meta.env.VITE_QBO_SOCIETY_PUSH_SECRET as string | undefined)?.trim()
    || '';

  if (!supabaseUrl) return { ok: false, error: 'Falta VITE_SUPABASE_URL' };
  if (!secret) {
    return {
      ok: false,
      error:
        'Falta secreto: defina VITE_AGILECHECK_SECRET o VITE_FUNCTION_SECRET (coincide con FUNCTION_SECRET en Supabase).',
    };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/agilecheck-sync-client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ancori-secret': secret,
      },
      body: JSON.stringify({ client_id: clientId }),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { ok: false, error: text.slice(0, 300) || `HTTP ${res.status}` };
      }
    }

    if (!res.ok) {
      const err =
        (typeof data.error === 'string' && data.error) ||
        (typeof data.detail === 'string' && data.detail) ||
        `HTTP ${res.status}`;
      const detail = typeof data.detail === 'string' ? data.detail : undefined;
      return { ok: false, error: err, detail };
    }

    return {
      ok: true,
      agilecheck_cliente_id: typeof data.agilecheck_cliente_id === 'number' ? data.agilecheck_cliente_id : undefined,
      action: typeof data.action === 'string' ? data.action : undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
