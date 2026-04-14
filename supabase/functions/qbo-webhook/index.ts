/**
 * Webhook de Intuit (QuickBooks Online) → sincroniza hacia la app:
 * - **Customer** → public.societies
 * - **Item** con Type **Category** → public.categories (resto de tipos de Item se ignoran)
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
 *
 * Item: GET Item por Id → si Type es Category, upsert en categories (nombre, id_qb, activo).
 *
 * Soporta cuerpo **clásico** (`eventNotifications`) y **CloudEvents** (array JSON con `type: qbo.item.created.v1`, etc.).
 * @see https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import {
  qboCustomerIdToIdQb,
  qboGetCustomer,
  type QboCustomerFull,
} from '../_shared/qbo-customers.ts';
import { qboGetItem } from '../_shared/qbo-items.ts';
import { extractQboCustomFields } from '../_shared/qbo-custom-fields.ts';
import {
  compareFields,
  resolveDirectorNames,
  insertConflicts,
  type SocietyFlat,
} from '../_shared/sync-conflict-detector.ts';

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

type QboDataChangeNotification = {
  realmId?: string;
  dataChangeEvent?: {
    entities?: Array<{ name?: string; id?: string; operation?: string }>;
  };
};

function extractLegacyNotifications(payload: Record<string, unknown>): QboDataChangeNotification[] {
  const n = payload.eventNotifications;
  return Array.isArray(n) ? (n as QboDataChangeNotification[]) : [];
}

/** Mapea verbo CloudEvents → operation del formato clásico (Create, Update, …). */
function cloudVerbToOperation(verb: string): string {
  const v = verb.toLowerCase();
  const map: Record<string, string> = {
    created: 'Create',
    updated: 'Update',
    deleted: 'Delete',
    voided: 'Void',
    merged: 'Merge',
    restored: 'Update',
  };
  return map[v] ?? verb;
}

/**
 * Intuit CloudEvents: array de objetos con type `qbo.item.created.v1`, intuitentityid, intuitaccountid (realm).
 */
function extractCloudEventsNotifications(payload: unknown): QboDataChangeNotification[] {
  if (!Array.isArray(payload) || payload.length === 0) return [];
  const first = payload[0];
  if (!first || typeof first !== 'object') return [];
  const t0 = String((first as Record<string, unknown>).type ?? '');
  if (!/^qbo\./i.test(t0)) return [];

  const out: QboDataChangeNotification[] = [];
  for (const ev of payload) {
    if (!ev || typeof ev !== 'object') continue;
    const row = ev as Record<string, unknown>;
    const type = String(row.type ?? '');
    const m = type.match(/^qbo\.([a-z]+)\.(created|updated|deleted|voided|merged|restored)\.v\d+$/i);
    if (!m) continue;
    const entityLower = m[1].toLowerCase();
    const verb = m[2].toLowerCase();
    const entityName = entityLower.charAt(0).toUpperCase() + entityLower.slice(1);
    const operation = cloudVerbToOperation(verb);
    const id = String(
      row.intuitentityid ?? row.intuitEntityId ?? (row.data as Record<string, unknown> | undefined)?.id ?? ''
    ).trim();
    const realmId = String(row.intuitaccountid ?? row.intuitAccountId ?? '').trim();
    if (!id || !realmId) continue;
    out.push({
      realmId,
      dataChangeEvent: {
        entities: [{ name: entityName, id, operation }],
      },
    });
  }
  return out;
}

function normalizeNotifications(payload: unknown): QboDataChangeNotification[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) return extractCloudEventsNotifications(payload);
  if (typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const legacy = extractLegacyNotifications(obj);
  if (legacy.length > 0) return legacy;
  return [];
}

/** GET en QBO (Customer/Item) solo en create/update/merge; delete/void va solo a Supabase. */
function notificationsNeedQboAccessToken(list: QboDataChangeNotification[]): boolean {
  for (const n of list) {
    for (const ent of n.dataChangeEvent?.entities ?? []) {
      const entityName = (ent.name ?? '').toLowerCase();
      const op = (ent.operation ?? '').toLowerCase();
      if (op === 'delete' || op === 'void') continue;
      if (entityName === 'item' || entityName === 'customer') return true;
    }
  }
  return false;
}

function inferEffectiveRealm(
  list: QboDataChangeNotification[],
  dbRealm: string | null | undefined,
  envRealm: string
): string {
  const fromDb = (dbRealm ?? '').trim();
  if (fromDb) return fromDb;
  const fromEnv = (envRealm ?? '').trim();
  if (fromEnv) return fromEnv;
  for (const n of list) {
    const r = (n.realmId ?? '').trim();
    if (r) return r;
  }
  return '';
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

async function processItemCategoryFromWebhook(
  supabase: SupabaseClient,
  realmId: string,
  accessToken: string,
  ent: { id?: string; operation?: string },
  processed: string[],
  errors: string[]
): Promise<void> {
  const id = ent.id;
  const op = (ent.operation ?? '').toLowerCase();
  if (!id) return;

  try {
    if (op === 'delete' || op === 'void') {
      const idStr = String(id);
      const idNum = qboCustomerIdToIdQb(idStr);
      if (idNum == null) {
        processed.push(`category_deactivate_skip_non_numeric_id:${id}`);
        return;
      }
      const { error } = await supabase.from('categories').update({ activo: false }).eq('id_qb', idNum);
      if (error) errors.push(`item:${id}: ${error.message}`);
      else processed.push(`category_deactivate:${id}`);
      return;
    }

    if (op === 'create' || op === 'update' || op === 'merge' || op === '') {
      const item = await qboGetItem(realmId, accessToken, String(id));
      const type = (item.Type ?? '').trim();
      if (type !== 'Category') {
        processed.push(`skip_item_not_category:${id}:${type || 'empty'}`);
        return;
      }

      const qbId = String(item.Id!);
      const idNum = qboCustomerIdToIdQb(qbId);
      if (idNum == null) {
        errors.push(`item:${id}: id_qb_no_entero_${qbId}`);
        return;
      }

      const nombre = (item.Name ?? item.FullyQualifiedName ?? '').trim() || 'Sin nombre';
      const activo = item.Active !== false;

      const { data: rows } = await supabase.from('categories').select('id').eq('id_qb', idNum).limit(2);

      const patch: Record<string, unknown> = {
        nombre: nombre.slice(0, 2000),
        id_qb: idNum,
        activo,
      };

      if (rows && rows.length === 1) {
        const { error } = await supabase.from('categories').update(patch).eq('id', rows[0].id);
        if (error) errors.push(`item:${id}: ${error.message}`);
        else processed.push(`category_update:${id}`);
      } else if (rows && rows.length === 0) {
        const newRow = {
          id: crypto.randomUUID(),
          nombre: patch.nombre,
          id_qb: idNum,
          activo,
        };
        const { error } = await supabase.from('categories').insert(newRow);
        if (error) errors.push(`item:${id}: insert_${error.message}`);
        else processed.push(`category_create:${id}`);
      } else if (rows && rows.length > 1) {
        errors.push(`item:${id}: multiple_categories_for_id_qb`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`item:${id}: ${msg.slice(0, 120)}`);
  }
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
    console.error('[qbo-webhook] missing_INTUIT_WEBHOOK_VERIFIER_TOKEN');
    return json(503, { error: 'missing_INTUIT_WEBHOOK_VERIFIER_TOKEN' });
  }

  const rawBody = await req.text();
  const sig =
    req.headers.get('intuit-signature') ??
    req.headers.get('Intuit-Signature') ??
    req.headers.get('INTUIT-SIGNATURE');

  console.info('[qbo-webhook] POST', {
    bodyBytes: rawBody.length,
    hasIntuitSignature: Boolean(sig?.trim()),
  });

  if (!(await verifyIntuitSignature(rawBody, sig, verifier))) {
    console.warn('[qbo-webhook] invalid_signature');
    return json(401, { error: 'invalid_signature' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
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

  const list = normalizeNotifications(payload);
  console.info('[qbo-webhook] parsed', { notificationCount: list.length });
  if (list.length === 0) {
    console.info('[qbo-webhook] no_events_after_normalize');
    return json(200, {
      ok: true,
      processed: [
        'hint:no_events: revisa formato Intuit (legacy eventNotifications vs CloudEvents array); suscripción Item; URL con ?apikey=',
      ],
      errors: [],
      notification_count: 0,
    });
  }

  const { data: tokRealmRow } = await supabase
    .from('qbo_oauth_tokens')
    .select('realm_id')
    .eq('id', 'default')
    .maybeSingle();

  let effectiveRealm = inferEffectiveRealm(
    list,
    tokRealmRow?.realm_id as string | undefined,
    Deno.env.get('QBO_DEFAULT_REALM_ID') ?? ''
  );
  const needsToken = notificationsNeedQboAccessToken(list);

  let accessToken = '';
  if (needsToken) {
    try {
      const t = await getValidQboAccessToken(supabase, clientId, clientSecret);
      accessToken = t.accessToken;
      const tr = (t.realmId ?? '').trim();
      if (tr) effectiveRealm = tr;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[qbo-webhook] qbo_token', { detail: msg });
      return json(503, { error: 'qbo_token', detail: msg });
    }
  }

  const processed: string[] = [];
  const errors: string[] = [];

  for (const n of list.slice(0, 20)) {
    const realmId = ((n.realmId ?? effectiveRealm) as string).trim();
    if (effectiveRealm && realmId && realmId !== effectiveRealm) {
      errors.push(`skip_realm_${realmId}`);
      continue;
    }

    const entities = n.dataChangeEvent?.entities ?? [];
    for (const ent of entities.slice(0, 50)) {
      const entityName = (ent.name ?? '').toLowerCase();

      if (entityName === 'item') {
        await processItemCategoryFromWebhook(
          supabase,
          realmId || effectiveRealm,
          accessToken,
          ent,
          processed,
          errors
        );
        continue;
      }

      if (entityName !== 'customer') continue;

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
            const societyUuid = rows[0].id;
            const { error } = await supabase.from('societies').update(patch).eq('id', societyUuid);
            if (error) {
              errors.push(`${id}: ${error.message}`);
            } else {
              processed.push(`update:${id}`);
              // ── Detección de conflictos (sync bidireccional) ──
              try {
                const { data: fullSoc } = await supabase
                  .from('societies').select('*').eq('id', societyUuid).maybeSingle();
                if (fullSoc) {
                  const dirNames = await resolveDirectorNames(supabase, fullSoc);
                  const qbCF = extractQboCustomFields(c as unknown as Record<string, unknown>);
                  const flat: SocietyFlat = {
                    ruc: fullSoc.ruc ?? '', dv: fullSoc.dv ?? '', nit: fullSoc.nit ?? '',
                    tipo_sociedad: fullSoc.tipo_sociedad ?? '',
                    fecha_inscripcion: fullSoc.fecha_inscripcion ?? '',
                    nombre: fullSoc.nombre ?? '', razon_social: fullSoc.razon_social ?? '',
                    correo: fullSoc.correo ?? '', ...dirNames,
                  };
                  const comparisons = compareFields(flat, qbCF);
                  // Auto-fill Supabase (campos que QB tiene y Supabase no)
                  const toSb: Record<string, unknown> = {};
                  for (const cmp of comparisons) {
                    if (cmp.action === 'auto_fill_supabase' &&
                        ['ruc', 'dv', 'nit', 'tipo_sociedad', 'fecha_inscripcion'].includes(cmp.field)) {
                      toSb[cmp.field] = cmp.quickbooksValue;
                    }
                  }
                  if (Object.keys(toSb).length > 0) {
                    await supabase.from('societies').update(toSb).eq('id', societyUuid);
                  }
                  const cnt = await insertConflicts(supabase, societyUuid, comparisons);
                  if (cnt > 0) processed.push(`conflicts:${id}:${cnt}`);
                }
              } catch (cfErr) {
                console.error('[qbo-webhook] conflict detection error:', cfErr);
              }
            }
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

  console.info('[qbo-webhook] ok', {
    notification_count: list.length,
    processedCount: processed.length,
    errorsCount: errors.length,
  });
  return json(200, {
    ok: true,
    processed,
    errors,
    notification_count: list.length,
  });
});
