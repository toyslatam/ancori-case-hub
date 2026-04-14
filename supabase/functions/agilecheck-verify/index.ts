/**
 * Verificación PEP/AML vía AgileCheck (agilecheck.io).
 *
 * POST JSON:
 *   {
 *     "entity_type": "client" | "director" | "society",
 *     "entity_id": "uuid",
 *     "entity_name": "NOMBRE COMPLETO",
 *     "check_type": "PEP" | "sanctions" | "negative_news" | "full"
 *   }
 *
 * Auth: x-ancori-secret header.
 *
 * Secrets requeridos en Supabase Dashboard:
 *   AGILECHECK_API_URL   — URL base del API de AgileCheck (ej: https://app.agilecheck.io/api/v1)
 *   AGILECHECK_API_KEY   — API Key o token de autenticación
 *   AGILECHECK_DB        — Nombre de la base de datos en AgileCheck (Odoo)
 *   FUNCTION_SECRET      — Secreto compartido para auth de la función
 *
 * NOTA: Esta función está preparada como proxy. El colega debe ajustar
 * el endpoint y payload según la documentación real de AgileCheck.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret, x-client-info',
};
const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HDR, ...CORS } });
}

type CheckRequest = {
  entity_type: 'client' | 'director' | 'society';
  entity_id: string;
  entity_name: string;
  check_type?: 'PEP' | 'sanctions' | 'negative_news' | 'full';
  checked_by_usuario_id?: string;
};

/**
 * Llama al API de AgileCheck.
 *
 * TODO (colega): Ajustar endpoint, headers y payload según la documentación
 * real del API de AgileCheck que les hayan proporcionado.
 * La estructura actual es un esquema base que funciona con APIs REST de Odoo.
 */
async function callAgileCheckAPI(
  name: string,
  checkType: string,
): Promise<{
  status: 'clean' | 'match' | 'review' | 'error';
  risk_level: 'bajo' | 'medio' | 'alto' | 'critico' | null;
  agilecheck_id: string | null;
  summary: string;
  raw_data: Record<string, unknown>;
}> {
  const apiUrl = Deno.env.get('AGILECHECK_API_URL')?.trim();
  const apiKey = Deno.env.get('AGILECHECK_API_KEY')?.trim();
  const dbName = Deno.env.get('AGILECHECK_DB')?.trim();

  if (!apiUrl || !apiKey) {
    return {
      status: 'error',
      risk_level: null,
      agilecheck_id: null,
      summary: 'AgileCheck no configurado: faltan AGILECHECK_API_URL o AGILECHECK_API_KEY',
      raw_data: { error: 'missing_config' },
    };
  }

  try {
    // ── Endpoint de verificación AgileCheck ──
    // Ajustar según documentación real del API.
    // Odoo REST típico: POST /api/method/check con JSON-RPC o REST puro.
    const endpoint = `${apiUrl.replace(/\/+$/, '')}/check`;

    const payload = {
      jsonrpc: '2.0',
      method: 'call',
      params: {
        db: dbName || undefined,
        name: name,
        check_type: checkType,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        ...(dbName ? { 'X-Agilecheck-DB': dbName } : {}),
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        status: 'error',
        risk_level: null,
        agilecheck_id: null,
        summary: `AgileCheck respuesta no-JSON: ${text.slice(0, 200)}`,
        raw_data: { raw: text.slice(0, 500), http_status: res.status },
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        risk_level: null,
        agilecheck_id: null,
        summary: `AgileCheck HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`,
        raw_data: data,
      };
    }

    // ── Parsear resultado ──
    // TODO (colega): Ajustar la extracción de campos según la respuesta real
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: 'error',
      risk_level: null,
      agilecheck_id: null,
      summary: `Error de conexion: ${msg.slice(0, 200)}`,
      raw_data: { error: msg },
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Auth
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

  const { entity_type, entity_id, entity_name, check_type = 'PEP', checked_by_usuario_id } = body;
  if (!entity_type || !entity_id || !entity_name) {
    return json(400, { error: 'missing_fields', required: ['entity_type', 'entity_id', 'entity_name'] });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Llamar a AgileCheck
  const result = await callAgileCheckAPI(entity_name, check_type);

  // Calcular expiración (6 meses por defecto para PEP)
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);

  // Guardar en BD
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
    checked_by: checked_by_usuario_id || null,
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

  return json(200, {
    ok: true,
    check_id: inserted?.id,
    entity_name,
    status: result.status,
    risk_level: result.risk_level,
    summary: result.summary,
    agilecheck_id: result.agilecheck_id,
    expires_at: expiresAt.toISOString(),
  });
});
