/**
 * Verificación PEP/AML vía AgileCheck HubQueryEngine.
 *
 * POST JSON:
 *   {
 *     "entity_type": "client" | "director" | "society",
 *     "entity_id": "uuid",
 *     "entity_name": "texto principal (razón social, nombre completo, etc.)",
 *     "check_type": "PEP" | "sanctions" | "negative_news" | "full",
 *     "checked_by_usuario_id": "uuid opcional (debe existir en public.usuarios)",
 *     "checked_by_correo": "correo opcional; se resuelve a usuarios.id (recomendado: mismo correo que Supabase Auth)",
 *     "es_juridico": true | false   // opcional: si no viene, society=true, client/director=false
 *     "nombres": "string opcional", // si no viene, se deriva de entity_name
 *     "apellidos": "string opcional", // persona natural: apellidos; jurídica: nombre comercial (si no viene, = nombres)
 *     "numero_id": "RUC, cédula, etc. opcional" → campo NumeroId en Consulta/Buscar
 *     "sync_agilecheck_client": true   // opcional: si entity_type es client, tras cumplimiento sincroniza ficha en AgileCheck (POST/PUT Cliente)
 *   }
 *
 * Auth: x-ancori-secret header (FUNCTION_SECRET).
 *
 * Fase 2 — HubQueryEngine:
 *   POST {AGILECHECK_API_BASE}/api/Consulta/Buscar
 *   Body: ConsultaIndividualDTOIN (Nombres, Apellidos, EsJuridico, Listas, Pais, PaisId, queryMode, NumeroId?).
 *
 * Listas (IDs numéricos de listas restrictivas en *tu* tenant AgileCheck):
 *   - Definir secret AGILECHECK_LISTA_IDS="1,2,8" (ejemplo del Swagger; los reales salen de GET /api/List/GetListas).
 *   - Si no está definido, la función intenta GET /api/List/GetListas y extrae ids del JSON.
 *
 * Secrets: ver comentarios al final del archivo y supabase/functions/.env.example
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getAgileCheckToken, apiUrlJoin } from '../_shared/agilecheck-token.ts';
import { syncAncoriClientToAgileCheck } from '../_shared/agilecheck-cliente-sync.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret, x-client-info',
};
const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

const PATH_BUSCAR = 'api/Consulta/Buscar';
const PATH_GET_LISTAS = 'api/List/GetListas';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HDR, ...CORS } });
}

type CheckRequest = {
  entity_type: 'client' | 'director' | 'society';
  entity_id: string;
  entity_name: string;
  check_type?: 'PEP' | 'sanctions' | 'negative_news' | 'full';
  /** UUID en `public.usuarios(id)` (no es el id de Supabase Auth salvo que estén alineados). */
  checked_by_usuario_id?: string;
  /** Correo del usuario en sesión: se resuelve a `usuarios.id` para `checked_by` (recomendado). */
  checked_by_correo?: string;
  /** Si no se envía: `society` → true; `client` y `director` → false (persona natural). Enviar `true` para cliente jurídico. */
  es_juridico?: boolean;
  nombres?: string;
  apellidos?: string;
  numero_id?: string;
  /** Si true y `entity_type === 'client'`, tras insertar `compliance_checks` llama a POST/PUT Cliente en AgileCheck. */
  sync_agilecheck_client?: boolean;
};

type AgileCheckResult = {
  status: 'clean' | 'match' | 'review' | 'error';
  risk_level: 'bajo' | 'medio' | 'alto' | 'critico' | null;
  agilecheck_id: string | null;
  summary: string;
  raw_data: Record<string, unknown>;
};

/** Persona jurídica por defecto solo para `society`. Cliente/director = natural salvo `es_juridico: true`. */
function resolveEsJuridico(entityType: CheckRequest['entity_type'], explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  return entityType === 'society';
}

/** Nombres = razón social o primer nombre; Apellidos = comercial o resto del nombre (Swagger exige ambos). */
function buildNombresApellidos(
  entityName: string,
  esJuridico: boolean,
  nombresIn?: string,
  apellidosIn?: string,
): { nombres: string; apellidos: string } {
  const raw = entityName.trim();
  const nombres = (nombresIn?.trim() || raw) || '';
  let apellidos = apellidosIn?.trim();
  if (!apellidos) {
    if (esJuridico) {
      apellidos = nombres;
    } else {
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) apellidos = parts.slice(1).join(' ');
      else apellidos = nombres;
    }
  }
  return { nombres, apellidos };
}

function parseListaIdsFromEnv(): number[] | null {
  const raw = Deno.env.get('AGILECHECK_LISTA_IDS')?.trim();
  if (!raw) return null;
  const ids = raw.split(/[\s,;]+/).map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return ids.length ? ids : null;
}

function collectNumericIdsFromUnknown(value: unknown, out: Set<number>): void {
  if (value == null) return;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    out.add(Math.floor(value));
    return;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    out.add(Number(value.trim()));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIdsFromListItem(item, out);
    return;
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const key of Object.keys(o)) {
      const v = o[key];
      if (Array.isArray(v)) {
        for (const item of v) collectIdsFromListItem(item, out);
      }
    }
  }
}

function collectIdsFromListItem(item: unknown, out: Set<number>): void {
  if (!item || typeof item !== 'object') return;
  const o = item as Record<string, unknown>;
  const id = o.id ?? o.Id ?? o.listaId ?? o.ListaId;
  if (typeof id === 'number' && id > 0) out.add(Math.floor(id));
  else if (typeof id === 'string' && /^\d+$/.test(id.trim())) out.add(Number(id.trim()));
}

/** Intenta extraer ids de listas del JSON de GET GetListas (forma variable por versión .NET). */
function extractListaIdsFromGetListasBody(data: unknown): number[] | null {
  const out = new Set<number>();
  if (typeof data === 'object' && data !== null) {
    const o = data as Record<string, unknown>;
    if (typeof o.d === 'string') {
      try {
        collectNumericIdsFromUnknown(JSON.parse(o.d) as unknown, out);
      } catch { /* ignore */ }
    } else if (o.d && typeof o.d === 'object') {
      collectNumericIdsFromUnknown(o.d, out);
    }
    for (const k of ['listas', 'Listas', 'data', 'Data', 'result', 'Result', 'items', 'Items']) {
      collectNumericIdsFromUnknown(o[k], out);
    }
  }
  const arr = [...out].sort((a, b) => a - b);
  return arr.length ? arr : null;
}

async function fetchListasIds(token: string, apiBase: string): Promise<number[] | null> {
  const url = apiUrlJoin(apiBase, PATH_GET_LISTAS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) return null;
    let data: unknown;
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      return null;
    }
    return extractListaIdsFromGetListasBody(data);
  } catch {
    return null;
  }
}

function unwrapAspNetD(data: Record<string, unknown>): Record<string, unknown> {
  const d = data.d;
  if (typeof d === 'string') {
    try {
      return JSON.parse(d) as Record<string, unknown>;
    } catch {
      return data;
    }
  }
  if (d && typeof d === 'object' && !Array.isArray(d)) return d as Record<string, unknown>;
  return data;
}

/** Normaliza texto para comparar nombres entre expediente Plataforma y filas del Hub. */
function normForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

/** 0–1: solapamiento de tokens entre dos textos (mismo titular suele dar >0.35). */
function tokenOverlapScore(a: string, b: string): number {
  const ta = normForMatch(a).split(/\s+/).filter((x) => x.length > 1);
  const tb = normForMatch(b).split(/\s+/).filter((x) => x.length > 1);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  let hit = 0;
  for (const x of ta) if (setB.has(x)) hit++;
  return hit / Math.min(ta.length, tb.length);
}

function hubRowToComparableText(row: Record<string, unknown>): string {
  const preferKeys = /nombre|apellido|razon|social|identidad|cedula|document|lista|persona|alias|titular|denominaci/i;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (preferKeys.test(k) && typeof v === 'string' && v.trim()) parts.push(v.trim());
  }
  if (parts.length === 0) {
    for (const v of Object.values(row)) {
      if (typeof v === 'string' && v.trim().length > 2 && v.trim().length < 160) parts.push(v.trim());
    }
  }
  return parts.join(' ');
}

/** Texto de referencia del expediente en BD + lo enviado en la consulta al Hub. */
async function fetchEntityReferenceString(
  supabase: ReturnType<typeof createClient>,
  body: CheckRequest,
): Promise<string> {
  const { entity_type, entity_id } = body;
  try {
    if (entity_type === 'client') {
      const { data } = await supabase.from('clients').select('nombre, razon_social, identificacion').eq('id', entity_id).maybeSingle();
      if (!data) return '';
      return [data.nombre, data.razon_social, data.identificacion].filter(Boolean).join(' ');
    }
    if (entity_type === 'director') {
      const { data } = await supabase.from('directores').select('nombre').eq('id', entity_id).maybeSingle();
      return data?.nombre ? String(data.nombre) : '';
    }
    if (entity_type === 'society') {
      const { data } = await supabase.from('societies').select('nombre, razon_social, identificacion_fiscal').eq('id', entity_id).maybeSingle();
      if (!data) return '';
      return [data.nombre, data.razon_social, data.identificacion_fiscal].filter(Boolean).join(' ');
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * Ajusta resumen/estado según:
 * - Consulta asíncrona del Hub (`terminado === false`): no es “ir a AgileCheck”, sino respuesta parcial.
 * - Coincidencia en listas pero baja alineación nombre/documento vs expediente → `review` + riesgo medio.
 */
async function enrichComplianceInterpretation(
  supabase: ReturnType<typeof createClient>,
  body: CheckRequest,
  result: AgileCheckResult,
): Promise<AgileCheckResult> {
  const hubRaw = result.raw_data?.hub_response ?? result.raw_data?.hub_raw;
  if (!hubRaw || typeof hubRaw !== 'object') return result;
  const root = unwrapAspNetD(hubRaw as Record<string, unknown>);
  const rowsRaw = root.consultaRows ?? root.ConsultaRows ?? [];
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const nonDescartados = rows.filter((r) => {
    if (!r || typeof r !== 'object') return true;
    return (r as Record<string, unknown>).esDescartado !== true;
  }) as Record<string, unknown>[];
  const totalResult = Number(root.totalResult ?? root.TotalResult ?? nonDescartados.length);
  const hasHubHits = nonDescartados.length > 0 || (Number.isFinite(totalResult) && totalResult > 0);
  const terminado = root.terminado ?? root.Terminado;

  if (terminado === false && !hasHubHits) {
    const asyncSummary =
      'La consulta en AgileCheck sigue en curso (respuesta parcial: aún no hay resultado final en listas). Espere unos minutos y pulse «Verificar» de nuevo, o «Actualizar» en esta pantalla. No implica error en el expediente de la app.';
    if (result.status === 'review') {
      return { ...result, summary: asyncSummary, risk_level: result.risk_level ?? 'bajo' };
    }
    return result;
  }

  if (!hasHubHits) return result;

  const fromDb = await fetchEntityReferenceString(supabase, body);
  const envelope = [fromDb, body.entity_name, body.nombres, body.apellidos, body.numero_id]
    .filter((x) => typeof x === 'string' && x.trim())
    .join(' ')
    .trim();

  const identityMeta: Record<string, unknown> = {
    hub_row_count: nonDescartados.length,
    total_result_hint: Number.isFinite(totalResult) ? totalResult : null,
  };

  if (nonDescartados.length === 0) {
    identityMeta.skipped = 'no_detail_rows';
    return { ...result, raw_data: { ...result.raw_data, identity_alignment: identityMeta } };
  }

  if (!envelope) {
    identityMeta.skipped = 'no_entity_reference';
    return { ...result, raw_data: { ...result.raw_data, identity_alignment: identityMeta } };
  }

  let best = 0;
  for (const row of nonDescartados) {
    const t = hubRowToComparableText(row);
    if (t) best = Math.max(best, tokenOverlapScore(envelope, t));
  }

  const id = body.numero_id?.trim();
  if (id) {
    const blob = JSON.stringify(nonDescartados).toUpperCase();
    if (blob.includes(id.toUpperCase())) best = Math.max(best, 0.45);
  }

  identityMeta.overlap_score_max = best;
  identityMeta.mismatch = false;

  if (best < 0.28 && result.status === 'match') {
    identityMeta.mismatch = true;
    return {
      ...result,
      status: 'review',
      risk_level: 'medio',
      summary:
        `Alerta de datos: coincidencia en listas restrictivas, pero el nombre/datos del listado no alinean bien con el expediente en Plataforma Ancori (verificar que sea el mismo titular). ${result.summary}`,
      raw_data: { ...result.raw_data, identity_alignment: identityMeta },
    };
  }

  return {
    ...result,
    raw_data: { ...result.raw_data, identity_alignment: identityMeta },
  };
}

/** Respuesta típica de POST /api/Consulta/Buscar (ConsultaVM o similar). */
function parseConsultaBuscarResult(data: Record<string, unknown>): AgileCheckResult {
  const root = unwrapAspNetD(data);
  const rowsRaw = root.consultaRows ?? root.ConsultaRows ?? [];
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const nonDescartados = rows.filter((r) => {
    if (!r || typeof r !== 'object') return true;
    return (r as Record<string, unknown>).esDescartado !== true;
  });
  const totalResult = Number(root.totalResult ?? root.TotalResult ?? nonDescartados.length);
  const hasMatch = nonDescartados.length > 0 || (Number.isFinite(totalResult) && totalResult > 0);
  const terminado = root.terminado ?? root.Terminado;
  const consultaId = root.consultaId ?? root.ConsultaId;

  let status: AgileCheckResult['status'] = hasMatch ? 'match' : 'clean';
  if (terminado === false && !hasMatch) status = 'review';

  const summary = hasMatch
    ? `Coincidencias en listas: ${nonDescartados.length} resultado(s)${totalResult ? ` (total indicado: ${totalResult})` : ''}`
    : terminado === false
    ? 'Consulta en curso en el motor AgileCheck (resultado aún no finalizado).'
    : 'Sin coincidencias en las listas consultadas';

  return {
    status,
    risk_level: hasMatch ? 'alto' : 'bajo',
    agilecheck_id: consultaId != null ? String(consultaId) : null,
    summary,
    raw_data: { hub_response: root, hub_raw: data },
  };
}

/** `checked_by` referencia `public.usuarios(id)`, no `auth.users.id`. */
async function resolveCheckedByUsuarioRowId(
  supabase: ReturnType<typeof createClient>,
  body: CheckRequest,
): Promise<string | null> {
  const rawId = body.checked_by_usuario_id?.trim();
  if (rawId) {
    const { data } = await supabase.from('usuarios').select('id').eq('id', rawId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const correo = body.checked_by_correo?.trim();
  if (correo) {
    const { data } = await supabase.from('usuarios').select('id').ilike('correo', correo).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

function parseAgileCheckResult(data: Record<string, unknown>): AgileCheckResult {
  const unwrapped = unwrapAspNetD(data);
  if (
    'consultaRows' in unwrapped || 'ConsultaRows' in unwrapped ||
    'consultaId' in unwrapped || 'ConsultaId' in unwrapped
  ) {
    return parseConsultaBuscarResult(data);
  }
  const result = (data.result ?? data) as Record<string, unknown>;
  const matches = result.matches ?? result.results ?? [];
  const hasMatch = Array.isArray(matches) ? matches.length > 0 : Boolean(matches);
  const riskRaw = String(result.risk_level ?? result.risk ?? '').toLowerCase();
  const riskMap: Record<string, 'bajo' | 'medio' | 'alto' | 'critico'> = {
    low: 'bajo', bajo: 'bajo',
    medium: 'medio', medio: 'medio',
    high: 'alto', alto: 'alto',
    critical: 'critico', critico: 'critico',
  };
  return {
    status: hasMatch ? 'match' : 'clean',
    risk_level: riskMap[riskRaw] ?? (hasMatch ? 'alto' : 'bajo'),
    agilecheck_id: result.id ? String(result.id) : null,
    summary: hasMatch
      ? `Coincidencia encontrada: ${Array.isArray(matches) ? matches.length : 1} resultado(s)`
      : 'Sin coincidencias en listas PEP/restrictivas',
    raw_data: data,
  };
}

async function runConsultaBuscar(req: CheckRequest): Promise<AgileCheckResult> {
  const tokenResult = await getAgileCheckToken();
  if (!tokenResult.ok) {
    return {
      status: 'error',
      risk_level: null,
      agilecheck_id: null,
      summary: tokenResult.summary,
      raw_data: tokenResult.raw,
    };
  }

  const apiBase = Deno.env.get('AGILECHECK_API_BASE')?.trim();
  if (!apiBase) {
    return {
      status: 'error',
      risk_level: null,
      agilecheck_id: null,
      summary: 'Falta AGILECHECK_API_BASE (URL base del HubQueryEngine, sin /api/Consulta/...).',
      raw_data: { error: 'missing_api_base' },
    };
  }

  const token = tokenResult.token;
  let listaIds = parseListaIdsFromEnv();
  if (!listaIds) listaIds = await fetchListasIds(token, apiBase) ?? undefined;
  if (!listaIds || listaIds.length === 0) {
    return {
      status: 'error',
      risk_level: null,
      agilecheck_id: null,
      summary:
        'No hay IDs de listas restrictivas. Configure el secret AGILECHECK_LISTA_IDS con números separados por coma (los obtiene su equipo en Swagger: GET /api/List/GetListas, o AgileCheck se los indica). Ejemplo ilustrativo en documentación: 1,2,8 — no usar sin verificar en su entorno.',
      raw_data: {
        error: 'missing_lista_ids',
        hint: 'GET /api/List/GetListas',
      },
    };
  }

  const esJuridico = resolveEsJuridico(req.entity_type, req.es_juridico);
  const { nombres, apellidos } = buildNombresApellidos(
    req.entity_name,
    esJuridico,
    req.nombres,
    req.apellidos,
  );

  const paisId = Number(Deno.env.get('AGILECHECK_PAIS_ID') ?? '0') || 0;
  const pais = (Deno.env.get('AGILECHECK_PAIS')?.trim() ?? '') || '';
  const queryMode = Number(Deno.env.get('AGILECHECK_QUERY_MODE') ?? '0') || 0;

  const payload: Record<string, unknown> = {
    Nombres: nombres,
    Apellidos: apellidos,
    EsJuridico: esJuridico,
    Listas: listaIds,
    Pais: paisId === 0 ? '' : pais,
    PaisId: paisId,
    queryMode,
  };

  const doc = req.numero_id?.trim();
  if (doc) payload.NumeroId = doc;

  const queryPath = Deno.env.get('AGILECHECK_QUERY_PATH')?.trim() || PATH_BUSCAR;
  const endpoint = apiUrlJoin(apiBase, queryPath);
  const dbName = Deno.env.get('AGILECHECK_DB')?.trim();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(dbName ? { 'X-Agilecheck-DB': dbName } : {}),
  };
  const bodyStr = JSON.stringify(payload);

  /** Hace UN intento y devuelve { ok, data } o error. */
  async function doFetch(): Promise<{ ok: true; data: Record<string, unknown> } | AgileCheckResult> {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body: bodyStr });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text) as Record<string, unknown>; } catch {
        return { status: 'error', risk_level: null, agilecheck_id: null,
          summary: `AgileCheck respuesta no-JSON: ${text.slice(0, 200)}`,
          raw_data: { raw: text.slice(0, 500), http_status: res.status } };
      }
      if (!res.ok) {
        return { status: 'error', risk_level: null, agilecheck_id: null,
          summary: `AgileCheck HTTP ${res.status}: ${JSON.stringify(data).slice(0, 280)}`,
          raw_data: { ...data, _http_status: res.status } };
      }
      return { ok: true, data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { status: 'error', risk_level: null, agilecheck_id: null,
        summary: `Error de conexion: ${msg.slice(0, 200)}`, raw_data: { error: msg } };
    }
  }

  /** Devuelve true si la respuesta ya está finalizada (terminado !== false o tiene hits). */
  function isTerminado(data: Record<string, unknown>): boolean {
    const root = unwrapAspNetD(data);
    const terminado = root.terminado ?? root.Terminado;
    if (terminado === false) {
      const rowsRaw = root.consultaRows ?? root.ConsultaRows ?? [];
      const rows = Array.isArray(rowsRaw) ? rowsRaw as Record<string, unknown>[] : [];
      const nonDescartados = rows.filter(r => r && typeof r === 'object' && r.esDescartado !== true);
      const totalResult = Number(root.totalResult ?? root.TotalResult ?? nonDescartados.length);
      const hasHits = nonDescartados.length > 0 || (Number.isFinite(totalResult) && totalResult > 0);
      return hasHits;
    }
    return true;
  }

  // Primer intento
  const first = await doFetch();
  if (!('ok' in first)) return first;

  // Si ya terminó, devolver directamente
  if (isTerminado(first.data)) return parseAgileCheckResult(first.data);

  // Reintentos: AgileCheck procesa async → esperar y volver a consultar (hasta 3 veces, 4 s entre cada uno)
  const MAX_RETRIES = 3;
  const WAIT_MS = 4000;
  let lastData = first.data;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await new Promise(resolve => setTimeout(resolve, WAIT_MS));
    const retry = await doFetch();
    if (!('ok' in retry)) return retry; // error de red → devolver el error
    lastData = retry.data;
    if (isTerminado(lastData)) break;
  }

  return parseAgileCheckResult(lastData);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const secret = Deno.env.get('FUNCTION_SECRET') ?? '';
  if (secret) {
    const incoming = req.headers.get('x-ancori-secret') ?? '';
    if (incoming !== secret) return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing_env' });

  let body: CheckRequest;
  try {
    body = (await req.json()) as CheckRequest;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { entity_type, entity_id, entity_name, check_type = 'PEP' } = body;
  if (!entity_type || !entity_id || !entity_name) {
    return json(400, { error: 'missing_fields', required: ['entity_type', 'entity_id', 'entity_name'] });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let result = await runConsultaBuscar(body);
  result = await enrichComplianceInterpretation(supabase, body, result);

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);

  const checkedByRowId = await resolveCheckedByUsuarioRowId(supabase, body);

  const row = {
    entity_type,
    entity_id,
    entity_name,
    check_type,
    status: result.status,
    risk_level: result.risk_level,
    agilecheck_id: result.agilecheck_id,
    result_summary: result.summary,
    result_data: result.raw_data,
    checked_by: checkedByRowId,
    checked_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
  };

  const { data: inserted, error: dbErr } = await supabase
    .from('compliance_checks')
    .insert(row)
    .select('id')
    .single();

  if (dbErr) {
    return json(500, { error: 'db_insert_failed', detail: dbErr.message, check_result: result });
  }

  // Bitácora — evento de verificación con snapshot del resultado
  await supabase.from('agilecheck_sync_log').insert({
    entity_type,
    entity_id,
    action: 'verify',
    performed_by: body.checked_by_correo ?? null,
    snapshot: { compliance_check_id: inserted?.id, status: result.status, risk_level: result.risk_level, summary: result.summary, raw: result.raw_data },
    notes: `Verificación ${check_type}: ${result.status} — ${result.summary?.slice(0, 120) ?? ''}`,
  });

  let syncPayload: Record<string, unknown> | undefined;
  if (body.sync_agilecheck_client && entity_type === 'client') {
    const sr = await syncAncoriClientToAgileCheck(supabase, entity_id);
    syncPayload = sr.ok
      ? { ok: true, agilecheck_cliente_id: sr.agilecheck_cliente_id, action: sr.action }
      : { ok: false, error: sr.error, detail: sr.detail, http_status: sr.http_status };
  }

  return json(200, {
    ok: true,
    check_id: inserted?.id,
    entity_name,
    status: result.status,
    risk_level: result.risk_level,
    summary: result.summary,
    agilecheck_id: result.agilecheck_id,
    expires_at: expiresAt.toISOString(),
    ...(syncPayload !== undefined ? { sync_agilecheck_client: syncPayload } : {}),
  });
});
