/**
 * Sincroniza sociedades (tabla public.societies) con Customer de QuickBooks Online.
 *
 * POST + Authorization: Bearer <QBO_CRON_SECRET> (mismo que qbo-oauth-refresh)
 * Body JSON opcional: { "mode": "from_qb" | "to_qb" | "both" }  (default: "from_qb")
 *
 * - from_qb: trae Customer desde QBO y rellena societies.quickbooks_customer_id (coincidencia por Id, id_qb o nombre/razón social).
 * - to_qb: crea Customer en QBO para sociedades activas sin quickbooks_customer_id.
 *
 * Sandbox: secret opcional QBO_API_BASE=https://sandbox-quickbooks.api.intuit.com
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import {
  normalizeQboName,
  qboCreateCustomer,
  qboCustomerIdToIdQb,
  qboGetCustomer,
  qboQueryAllCustomers,
  type QboCustomer,
} from '../_shared/qbo-customers.ts';
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
    headers: {
      ...JSON_HDR,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-qbo-cron-secret',
    },
  });
}

type SocietyRow = {
  id: string;
  nombre: string;
  razon_social: string;
  correo: string | null;
  id_qb: number | null;
  quickbooks_customer_id: string | null;
  activo: boolean;
};

function buildCustomerIndexes(customers: QboCustomer[]) {
  const byId = new Map<string, QboCustomer>();
  const byDisplay = new Map<string, QboCustomer>();
  for (const c of customers) {
    const id = c.Id != null ? String(c.Id) : '';
    if (!id) continue;
    byId.set(id, c);
    const dn = c.DisplayName ? normalizeQboName(c.DisplayName) : '';
    if (dn && !byDisplay.has(dn)) byDisplay.set(dn, c);
    const cn = c.CompanyName ? normalizeQboName(c.CompanyName) : '';
    if (cn && !byDisplay.has(cn)) byDisplay.set(cn, c);
  }
  return { byId, byDisplay };
}

function matchCustomerId(s: SocietyRow, byId: Map<string, QboCustomer>, byDisplay: Map<string, QboCustomer>): string | null {
  const existing = s.quickbooks_customer_id?.trim();
  if (existing && byId.has(existing)) return existing;

  if (s.id_qb != null && byId.has(String(s.id_qb))) return String(s.id_qb);

  for (const label of [s.nombre, s.razon_social]) {
    const key = normalizeQboName(label || '');
    if (!key) continue;
    const hit = byDisplay.get(key);
    if (hit?.Id) return String(hit.Id);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-qbo-cron-secret',
      },
    });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const headerSecret = req.headers.get('x-qbo-cron-secret') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!cronSecret || (bearer !== cronSecret && headerSecret !== cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  let mode: 'from_qb' | 'to_qb' | 'both' = 'from_qb';
  try {
    const t = await req.text();
    if (t.trim()) {
      const b = JSON.parse(t) as { mode?: string };
      if (b.mode === 'to_qb' || b.mode === 'both' || b.mode === 'from_qb') mode = b.mode;
    }
  } catch {
    return json(400, { error: 'invalid_json_body' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let accessToken: string;
  let realmId: string;
  try {
    const tok = await getValidQboAccessToken(supabase, clientId, clientSecret);
    accessToken = tok.accessToken;
    realmId = tok.realmId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(503, { error: 'qbo_token', detail: msg });
  }

  const result: Record<string, unknown> = { mode, realm_id: realmId };

  if (mode === 'from_qb' || mode === 'both') {
    let customers: QboCustomer[];
    try {
      customers = await qboQueryAllCustomers(realmId, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(502, { error: 'qbo_fetch_customers', detail: msg });
    }

    const { byId, byDisplay } = buildCustomerIndexes(customers);
    const { data: societies, error: socErr } = await supabase
      .from('societies')
      .select('id, nombre, razon_social, correo, id_qb, quickbooks_customer_id, activo');

    if (socErr) {
      return json(500, { error: 'db_societies', detail: socErr.message });
    }

    const rows = (societies ?? []) as SocietyRow[];
    let matched = 0;
    let updated = 0;
    const updates: { id: string; qbId: string }[] = [];
    let idQbRepaired = 0;

    for (const s of rows) {
      if (!s.activo) continue;
      const qbId = matchCustomerId(s, byId, byDisplay);
      if (!qbId) continue;
      matched++;
      const idQb = qboCustomerIdToIdQb(qbId);
      if (s.quickbooks_customer_id === qbId) {
        if (idQb != null && s.id_qb !== idQb) {
          const { error: repErr } = await supabase
            .from('societies')
            .update({ id_qb: idQb })
            .eq('id', s.id);
          if (!repErr) idQbRepaired++;
        }
        continue;
      }
      updates.push({ id: s.id, qbId });
    }

    for (const u of updates) {
      const idQb = qboCustomerIdToIdQb(u.qbId);
      const patch: Record<string, unknown> = { quickbooks_customer_id: u.qbId };
      if (idQb != null) patch.id_qb = idQb;
      const { error: upErr } = await supabase.from('societies').update(patch).eq('id', u.id);
      if (!upErr) updated++;
    }

    // ── Detección de conflictos por Custom Fields ──────────────────
    let conflictsDetected = 0;
    for (const s of rows) {
      if (!s.activo) continue;
      const qbId = s.quickbooks_customer_id?.trim();
      if (!qbId) continue;
      try {
        const cFull = await qboGetCustomer(realmId, accessToken, qbId);
        const qbCF = extractQboCustomFields(cFull as unknown as Record<string, unknown>);
        // Solo comparar custom fields si hay alguno
        if (Object.keys(qbCF).length === 0) continue;

        const { data: fullSoc } = await supabase
          .from('societies').select('*').eq('id', s.id).maybeSingle();
        if (!fullSoc) continue;

        const dirNames = await resolveDirectorNames(supabase, fullSoc);
        const flat: SocietyFlat = {
          ruc: fullSoc.ruc ?? '', dv: fullSoc.dv ?? '', nit: fullSoc.nit ?? '',
          tipo_sociedad: fullSoc.tipo_sociedad ?? '',
          nombre: fullSoc.nombre ?? '', razon_social: fullSoc.razon_social ?? '',
          correo: fullSoc.correo ?? '', ...dirNames,
        };
        const comparisons = compareFields(flat, qbCF);

        // Auto-fill Supabase
        const toSb: Record<string, unknown> = {};
        for (const cmp of comparisons) {
          if (cmp.action === 'auto_fill_supabase' &&
              ['ruc', 'dv', 'nit', 'tipo_sociedad', 'direccion'].includes(cmp.field)) {
            toSb[cmp.field] = cmp.quickbooksValue;
          }
        }
        if (Object.keys(toSb).length > 0) {
          await supabase.from('societies').update(toSb).eq('id', s.id);
        }

        conflictsDetected += await insertConflicts(supabase, s.id, comparisons);
      } catch (cfErr) {
        console.error(`[qbo-sync-societies] CF check ${s.id}:`, cfErr);
      }
    }

    result.from_qb = {
      qbo_customers_loaded: customers.length,
      societies_considered: rows.filter((r) => r.activo).length,
      matched,
      updated,
      id_qb_repaired: idQbRepaired,
      conflicts_detected: conflictsDetected,
    };
  }

  if (mode === 'to_qb' || mode === 'both') {
    const { data: allActive, error: aErr } = await supabase
      .from('societies')
      .select('id, nombre, razon_social, correo, activo, quickbooks_customer_id')
      .eq('activo', true);

    if (aErr) {
      return json(500, { error: 'db_societies_to_qb', detail: aErr.message });
    }

    const toCreate = (allActive ?? []).filter(
      (r: { quickbooks_customer_id?: string | null }) =>
        !r.quickbooks_customer_id || String(r.quickbooks_customer_id).trim() === ''
    );

    let created = 0;
    const createErrors: string[] = [];

    for (const s of toCreate) {
      const display = (s.nombre || s.razon_social || '').trim();
      if (!display) continue;
      try {
        const { id: qbId } = await qboCreateCustomer(realmId, accessToken, {
          DisplayName: display.slice(0, 500),
          CompanyName: s.razon_social?.trim() ? s.razon_social.trim().slice(0, 500) : undefined,
          PrimaryEmailAddr: s.correo?.trim() || undefined,
        });
        const idQb = qboCustomerIdToIdQb(qbId);
        const patch: Record<string, unknown> = { quickbooks_customer_id: qbId };
        if (idQb != null) patch.id_qb = idQb;
        const { error: upErr } = await supabase.from('societies').update(patch).eq('id', s.id);
        if (upErr) {
          createErrors.push(`${s.id}: ${upErr.message}`);
        } else {
          created++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        createErrors.push(`${s.id}: ${msg.slice(0, 200)}`);
      }
    }

    result.to_qb = { candidates: toCreate.length, created, errors: createErrors.slice(0, 50) };
  }

  return json(200, result);
});
