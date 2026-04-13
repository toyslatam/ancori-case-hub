/**
 * Webhook de Intuit (QuickBooks Online) → sincroniza cambios de Customer hacia public.societies.
 *
 * POST: cuerpo JSON firmado; cabecera intuit-signature = base64(HMAC-SHA256(verifierToken, rawBody))
 *
 * Secret: INTUIT_WEBHOOK_VERIFIER_TOKEN (copiar desde Developer Portal → tu app → Webhooks → Verifier Token)
 *
 * URL a registrar en Intuit: https://<REF>.supabase.co/functions/v1/qbo-webhook?apikey=<ANON_KEY>
 * (o sin query si el gateway no exige apikey en webhook; en Supabase suele hacer falta apikey en la URL)
 *
 * Customer create/update: GET Customer por Id → upsert en societies. Crear fila nueva requiere
 * QBO_WEBHOOK_DEFAULT_CLIENT_ID (uuid de public.clients).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import {
  qboCustomerIdToIdQb,
  qboGetCustomer,
  type QboCustomerFull,
} from '../_shared/qbo-customers.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HDR, 'Access-Control-Allow-Origin': '*' },
  });
}

async function hmacSha256Base64(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function verifyIntuitSignature(
  rawBody: string,
  signatureHeader: string | null,
  verifierToken: string
): Promise<boolean> {
  if (!signatureHeader?.trim() || !verifierToken) return false;
  const expected = await hmacSha256Base64(verifierToken, rawBody);
  const got = signatureHeader.trim();
  return timingSafeEqual(expected, got);
}

function mapCustomerToSocietyFields(c: QboCustomerFull): {
  nombre: string;
  razon_social: string;
  correo: string | null;
  telefono: string;
} {
  const display = (c.DisplayName ?? '').trim();
  const company = (c.CompanyName ?? '').trim();
  const email = c.PrimaryEmailAddr?.Address?.trim() || null;
  const phoneRaw = c.PrimaryPhone?.FreeFormNumber;
  const telefono = (phoneRaw ?? '').trim().slice(0, 200);
  return {
    nombre: display || company || 'Sin nombre',
    razon_social: company || display,
    correo: email,
    telefono,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, intuit-signature, content-type, apikey',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const verifier = Deno.env.get('INTUIT_WEBHOOK_VERIFIER_TOKEN') ?? '';
  if (!verifier) {
    return json(503, { error: 'missing_INTUIT_WEBHOOK_VERIFIER_TOKEN' });
  }

  const rawBody = await req.text();
  const sig =
    req.headers.get('intuit-signature') ??
    req.headers.get('Intuit-Signature') ??
    req.headers.get('INTUIT-SIGNATURE');

  if (!(await verifyIntuitSignature(rawBody, sig, verifier))) {
    return json(401, { error: 'invalid_signature' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let accessToken: string;
  let defaultRealm: string;
  try {
    const t = await getValidQboAccessToken(supabase, clientId, clientSecret);
    accessToken = t.accessToken;
    defaultRealm = t.realmId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(503, { error: 'qbo_token', detail: msg });
  }

  const notifications = payload.eventNotifications as
    | Array<{
        realmId?: string;
        dataChangeEvent?: {
          entities?: Array<{ name?: string; id?: string; operation?: string }>;
        };
      }>
    | undefined;

  const processed: string[] = [];
  const errors: string[] = [];

  const list = Array.isArray(notifications) ? notifications : [];
  for (const n of list.slice(0, 20)) {
    const realmId = n.realmId ?? defaultRealm;
    if (realmId !== defaultRealm) {
      errors.push(`skip_realm_${realmId}`);
      continue;
    }

    const entities = n.dataChangeEvent?.entities ?? [];
    for (const ent of entities.slice(0, 50)) {
      if ((ent.name ?? '').toLowerCase() !== 'customer') continue;
      const id = ent.id;
      const op = (ent.operation ?? '').toLowerCase();
      if (!id) continue;

      try {
        if (op === 'delete' || op === 'void') {
          const idStr = String(id);
          const idNum = qboCustomerIdToIdQb(idStr);
          let delQ = supabase.from('societies').update({ activo: false });
          if (idNum != null) {
            delQ = delQ.or(`quickbooks_customer_id.eq.${idStr},id_qb.eq.${idNum}`);
          } else {
            delQ = delQ.eq('quickbooks_customer_id', idStr);
          }
          const { error } = await delQ;
          if (error) errors.push(`${id}: ${error.message}`);
          else processed.push(`deactivate:${id}`);
          continue;
        }

        if (op === 'create' || op === 'update' || op === 'merge' || op === '') {
          const c = await qboGetCustomer(realmId, accessToken, String(id));
          const qbId = String(c.Id!);
          const idNum = qboCustomerIdToIdQb(qbId);

          let sel = supabase.from('societies').select('id').limit(2);
          if (idNum != null) {
            sel = sel.or(`quickbooks_customer_id.eq.${qbId},id_qb.eq.${idNum}`);
          } else {
            sel = sel.eq('quickbooks_customer_id', qbId);
          }
          const { data: rows } = await sel;

          const fields = mapCustomerToSocietyFields(c);
          const patch: Record<string, unknown> = {
            nombre: fields.nombre,
            razon_social: fields.razon_social,
            correo: fields.correo,
            telefono: fields.telefono,
            quickbooks_customer_id: qbId,
            activo: c.Active !== false,
          };
          if (idNum != null) patch.id_qb = idNum;

          if (rows && rows.length === 1) {
            const { error } = await supabase.from('societies').update(patch).eq('id', rows[0].id);
            if (error) errors.push(`${id}: ${error.message}`);
            else processed.push(`update:${id}`);
          } else if (rows && rows.length === 0) {
            // Customer en QBO sin fila local: crear sociedad (mismo flujo que create/update manual en QBO).
            const defaultClientId = Deno.env.get('QBO_WEBHOOK_DEFAULT_CLIENT_ID')?.trim();
            if (!defaultClientId) {
              errors.push(
                `${id}: set_QBO_WEBHOOK_DEFAULT_CLIENT_ID_uuid_de_cliente_para_importar_desde_QBO`
              );
              continue;
            }
            const newRow: Record<string, unknown> = {
              id: crypto.randomUUID(),
              client_id: defaultClientId,
              nombre: fields.nombre,
              razon_social: fields.razon_social,
              tipo_sociedad: 'SOCIEDADES',
              correo: fields.correo ?? '',
              telefono: fields.telefono,
              quickbooks_customer_id: qbId,
              activo: c.Active !== false,
            };
            if (idNum != null) newRow.id_qb = idNum;
            const { error } = await supabase.from('societies').insert(newRow);
            if (error) errors.push(`${id}: insert_${error.message}`);
            else processed.push(`create:${id}`);
          } else if (rows && rows.length > 1) {
            errors.push(`${id}: multiple_societies_for_qb_id`);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${id}: ${msg.slice(0, 120)}`);
      }
    }
  }

  return json(200, { ok: true, processed, errors });
});
