/**
 * Resuelve un conflicto de sincronización Supabase ↔ QuickBooks.
 *
 * POST JSON:
 *   {
 *     "conflict_id": "uuid",
 *     "resolution": "supabase" | "quickbooks",
 *     "resolved_by_usuario_id": "uuid"
 *   }
 *
 * - "supabase"   → el valor de Supabase prevalece, se envía a QB.
 * - "quickbooks"  → el valor de QB prevalece, se escribe en Supabase.
 *
 * Auth: Bearer <QBO_CRON_SECRET> o x-qbo-society-push-secret.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import {
  qboGetCustomer,
  qboSparseUpdateCustomer,
} from '../_shared/qbo-customers.ts';
import {
  extractQboCustomFields,
  buildCustomFieldPatch,
  INTERNAL_TO_QB_NAME,
} from '../_shared/qbo-custom-fields.ts';
import { findDirectorIdByName } from '../_shared/sync-conflict-detector.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-qbo-society-push-secret, x-client-info',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HDR, ...CORS } });
}

function authorize(req: Request): boolean {
  const cron = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const push = Deno.env.get('QBO_SOCIETY_PUSH_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const header = req.headers.get('x-qbo-society-push-secret') ?? '';
  return (cron && (bearer === cron || header === cron)) ||
         (push && (bearer === push || header === push));
}

// Campos que se resuelven como columna directa en societies
const DIRECT_SOCIETY_COLUMNS: Record<string, string> = {
  ruc: 'ruc',
  dv: 'dv',
  nit: 'nit',
  tipo_sociedad: 'tipo_sociedad',
  fecha_inscripcion: 'fecha_inscripcion',
  nombre: 'nombre',
  razon_social: 'razon_social',
  correo: 'correo',
};

// Campos de directores: el valor es un nombre; el destino es un FK UUID
const DIRECTOR_FIELDS: Record<string, string> = {
  presidente_name: 'presidente_id',
  tesorero_name: 'tesorero_id',
  secretario_name: 'secretario_id',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!authorize(req)) return json(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { conflict_id?: string; resolution?: string; resolved_by_usuario_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const { conflict_id, resolution, resolved_by_usuario_id } = body;
  if (!conflict_id || !resolution || !resolved_by_usuario_id) {
    return json(400, { error: 'missing_fields', required: ['conflict_id', 'resolution', 'resolved_by_usuario_id'] });
  }
  if (resolution !== 'supabase' && resolution !== 'quickbooks') {
    return json(400, { error: 'invalid_resolution', allowed: ['supabase', 'quickbooks'] });
  }

  // 1. Cargar el conflicto
  const { data: conflict, error: cErr } = await supabase
    .from('sync_conflicts')
    .select('*')
    .eq('id', conflict_id)
    .eq('status', 'pending')
    .maybeSingle();

  if (cErr) return json(500, { error: 'db_error', detail: cErr.message });
  if (!conflict) return json(404, { error: 'conflict_not_found_or_already_resolved' });

  // 2. Cargar la sociedad
  const { data: society, error: sErr } = await supabase
    .from('societies')
    .select('*')
    .eq('id', conflict.society_id)
    .maybeSingle();

  if (sErr) return json(500, { error: 'db_error', detail: sErr.message });
  if (!society) return json(404, { error: 'society_not_found' });

  const field = conflict.field_name;
  const winningValue = resolution === 'supabase' ? conflict.supabase_value : conflict.quickbooks_value;

  try {
    if (resolution === 'supabase') {
      // ------ SUPABASE GANA → enviar valor a QB ------
      const qbId = society.quickbooks_customer_id || String(society.id_qb ?? '');
      if (!qbId) return json(422, { error: 'society_not_linked_to_qb' });

      const { accessToken, realmId } = await getValidQboAccessToken(supabase, clientId, clientSecret);
      const existing = await qboGetCustomer(realmId, accessToken, qbId);

      // Determinar si es un campo estándar o custom field
      if (field === 'nombre') {
        await qboSparseUpdateCustomer(realmId, accessToken, {
          Id: qbId, SyncToken: existing.SyncToken ?? '0',
          DisplayName: winningValue,
        });
      } else if (field === 'razon_social') {
        await qboSparseUpdateCustomer(realmId, accessToken, {
          Id: qbId, SyncToken: existing.SyncToken ?? '0',
          CompanyName: winningValue,
        });
      } else if (field === 'correo') {
        await qboSparseUpdateCustomer(realmId, accessToken, {
          Id: qbId, SyncToken: existing.SyncToken ?? '0',
          PrimaryEmailAddr: winningValue,
        });
      } else {
        // Custom Field
        const cfPatch = buildCustomFieldPatch(
          existing.CustomField ?? [],
          { [field]: winningValue },
        );
        if (cfPatch.length > 0) {
          await qboSparseUpdateCustomer(realmId, accessToken, {
            Id: qbId, SyncToken: existing.SyncToken ?? '0',
            CustomField: cfPatch,
          });
        }
      }

    } else {
      // ------ QUICKBOOKS GANA → escribir valor en Supabase ------
      if (field in DIRECT_SOCIETY_COLUMNS) {
        const col = DIRECT_SOCIETY_COLUMNS[field];
        await supabase.from('societies').update({ [col]: winningValue }).eq('id', society.id);
      } else if (field in DIRECTOR_FIELDS) {
        const col = DIRECTOR_FIELDS[field];
        const directorId = await findDirectorIdByName(supabase, winningValue);
        if (!directorId) {
          return json(422, {
            error: 'director_not_found',
            detail: `No se encontro un director activo con nombre "${winningValue}". Cree el director primero.`,
            field,
          });
        }
        await supabase.from('societies').update({ [col]: directorId }).eq('id', society.id);
      }
    }

    // 3. Marcar conflicto como resuelto
    const status = resolution === 'supabase' ? 'resolved_supabase' : 'resolved_quickbooks';
    await supabase.from('sync_conflicts').update({
      status,
      resolved_by: resolved_by_usuario_id,
      resolved_at: new Date().toISOString(),
    }).eq('id', conflict_id);

    return json(200, {
      ok: true,
      conflict_id,
      resolution,
      field,
      winning_value: winningValue,
    });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(502, { error: 'reconcile_failed', detail: msg.slice(0, 400) });
  }
});
