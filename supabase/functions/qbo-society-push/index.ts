/**
 * App (Plataforma Ancori) → QuickBooks: crea / actualiza / desactiva Customer al guardar o borrar sociedad.
 *
 * POST JSON:
 *   { "operation": "upsert", "society": { ...campos Society } }
 *   { "operation": "delete", "quickbooks_customer_id": "123" }  (tras leer la sociedad en el cliente antes de borrar fila)
 *
 * Auth (una de):
 *   Authorization: Bearer <QBO_CRON_SECRET>
 *   x-qbo-society-push-secret: <QBO_SOCIETY_PUSH_SECRET>  (opcional; mismo valor en Supabase secrets; puede repetir CRON si no quieres otro)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import {
  qboCreateCustomer,
  qboCustomerIdToIdQb,
  qboGetCustomer,
  qboSparseUpdateCustomer,
} from '../_shared/qbo-customers.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HDR,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'authorization, apikey, content-type, x-qbo-society-push-secret, x-client-info',
    },
  });
}

function authorize(req: Request): boolean {
  const cron = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const push = Deno.env.get('QBO_SOCIETY_PUSH_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const headerSecret = req.headers.get('x-qbo-society-push-secret') ?? '';
  const okCron = cron && (bearer === cron || headerSecret === cron);
  const okPush = push && (bearer === push || headerSecret === push);
  return okCron || okPush;
}

type SocietyPayload = {
  id: string;
  nombre: string;
  razon_social?: string;
  correo?: string;
  activo?: boolean;
  quickbooks_customer_id?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers':
          'authorization, apikey, content-type, x-qbo-society-push-secret, x-client-info',
      },
    });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  if (!authorize(req)) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { operation?: string; society?: SocietyPayload; quickbooks_customer_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  let accessToken: string;
  let realmId: string;
  try {
    const t = await getValidQboAccessToken(supabase, clientId, clientSecret);
    accessToken = t.accessToken;
    realmId = t.realmId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(503, { error: 'qbo_token', detail: msg });
  }

  const op = body.operation ?? 'upsert';

  if (op === 'delete') {
    const qbid = body.quickbooks_customer_id?.trim();
    if (!qbid) {
      return json(200, { skipped: true, reason: 'no_quickbooks_customer_id' });
    }
    try {
      const c = await qboGetCustomer(realmId, accessToken, qbid);
      const st = c.SyncToken ?? '0';
      await qboSparseUpdateCustomer(realmId, accessToken, {
        Id: qbid,
        SyncToken: st,
        Active: false,
      });
      return json(200, { ok: true, operation: 'deactivate_customer', quickbooks_customer_id: qbid });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(502, { error: 'qbo_deactivate_failed', detail: msg.slice(0, 300) });
    }
  }

  if (op !== 'upsert') {
    return json(400, { error: 'unknown_operation' });
  }

  const s = body.society;
  if (!s?.id) {
    return json(400, { error: 'missing_society' });
  }

  const display = (s.nombre || s.razon_social || '').trim().slice(0, 500);
  if (!display) {
    return json(400, { error: 'missing_display_name' });
  }

  const company = s.razon_social?.trim() ? s.razon_social.trim().slice(0, 500) : undefined;
  const email = s.correo?.trim() || undefined;
  const active = s.activo !== false;

  try {
    let qbId = s.quickbooks_customer_id?.trim() ?? '';

    if (!qbId) {
      const { id: newId } = await qboCreateCustomer(realmId, accessToken, {
        DisplayName: display,
        CompanyName: company,
        PrimaryEmailAddr: email,
      });
      qbId = newId;
      const idQb = qboCustomerIdToIdQb(qbId);
      const rowPatch: Record<string, unknown> = { quickbooks_customer_id: qbId };
      if (idQb != null) rowPatch.id_qb = idQb;
      const { error: upErr } = await supabase.from('societies').update(rowPatch).eq('id', s.id);
      if (upErr) {
        return json(200, {
          ok: true,
          quickbooks_customer_id: qbId,
          created_customer_id: qbId,
          ...(idQb != null ? { id_qb: idQb } : {}),
          warning: `db_update_failed: ${upErr.message}`,
        });
      }
      return json(200, {
        ok: true,
        operation: 'created',
        quickbooks_customer_id: qbId,
        ...(idQb != null ? { id_qb: idQb } : {}),
      });
    }

    const existing = await qboGetCustomer(realmId, accessToken, qbId);
    const sync = existing.SyncToken ?? '0';
    await qboSparseUpdateCustomer(realmId, accessToken, {
      Id: qbId,
      SyncToken: sync,
      DisplayName: display,
      CompanyName: company,
      PrimaryEmailAddr: email,
      Active: active,
    });
    const idQbUpd = qboCustomerIdToIdQb(qbId);
    if (idQbUpd != null) {
      await supabase.from('societies').update({ id_qb: idQbUpd }).eq('id', s.id);
    }
    return json(200, {
      ok: true,
      operation: 'updated',
      quickbooks_customer_id: qbId,
      ...(idQbUpd != null ? { id_qb: idQbUpd } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(502, { error: 'qbo_push_failed', detail: msg.slice(0, 400) });
  }
});
