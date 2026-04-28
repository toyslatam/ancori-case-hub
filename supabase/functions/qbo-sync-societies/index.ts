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
  client_id: string | null;
  nombre: string;
  razon_social: string;
  correo: string | null;
  id_qb: number | null;
  quickbooks_customer_id: string | null;
  activo: boolean;
};

type ClientLookupRow = {
  id: string;
  nombre: string | null;
  razon_social: string | null;
  activo: boolean | null;
};

function normalizeClientLookup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLookupKey(s: string): string {
  return normalizeClientLookup(s).replace(/\s+/g, '');
}

function qboBillingLine1(c: QboCustomer): string {
  return (c.BillAddr?.Line1 ?? '').trim();
}

function buildClientLookup(clients: ClientLookupRow[]) {
  const byNormalized = new Map<string, string>();
  const byCompact = new Map<string, string>();

  for (const c of clients) {
    if (c.activo === false) continue;
    const id = c.id ? String(c.id) : '';
    if (!id) continue;
    for (const name of [c.nombre ?? '', c.razon_social ?? '']) {
      const normalized = normalizeClientLookup(name);
      if (!normalized) continue;
      if (!byNormalized.has(normalized)) byNormalized.set(normalized, id);
      const compact = normalized.replace(/\s+/g, '');
      if (compact && !byCompact.has(compact)) byCompact.set(compact, id);
    }
  }

  return { byNormalized, byCompact };
}

function resolveClientIdForQboCustomer(
  c: QboCustomer,
  lookup: ReturnType<typeof buildClientLookup>,
): { clientId: string; source: string } | null {
  const line1 = qboBillingLine1(c);
  const normalized = normalizeClientLookup(line1);
  if (!normalized) return null;

  const byName = lookup.byNormalized.get(normalized);
  if (byName) return { clientId: byName, source: `billaddr_line1:${line1}` };

  const byCompact = lookup.byCompact.get(compactLookupKey(line1));
  if (byCompact) return { clientId: byCompact, source: `billaddr_line1:${line1}` };

  console.warn('[qbo-sync-societies] no local client matched BillAddr.Line1:', {
    billaddr_line1: line1,
    normalized,
    qb_customer_id: c.Id,
    qb_display_name: c.DisplayName,
  });
  return null;
}

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

  let mode: 'from_qb' | 'to_qb' | 'both' | 'sync_names' = 'from_qb';
  try {
    const t = await req.text();
    if (t.trim()) {
      const b = JSON.parse(t) as { mode?: string };
      if (b.mode === 'to_qb' || b.mode === 'both' || b.mode === 'from_qb' || b.mode === 'sync_names') mode = b.mode;
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
      .select('id, client_id, nombre, razon_social, correo, id_qb, quickbooks_customer_id, activo');

    if (socErr) {
      return json(500, { error: 'db_societies', detail: socErr.message });
    }

    const { data: clients, error: clientErr } = await supabase
      .from('clients')
      .select('id, nombre, razon_social, activo');

    if (clientErr) {
      return json(500, { error: 'db_clients', detail: clientErr.message });
    }

    const clientLookup = buildClientLookup((clients ?? []) as ClientLookupRow[]);

    const rows = (societies ?? []) as SocietyRow[];
    let matched = 0;
    let updated = 0;
    let clientRepaired = 0;
    const updates: { id: string; qbId: string }[] = [];
    let idQbRepaired = 0;

    for (const s of rows) {
      if (!s.activo) continue;
      const qbId = matchCustomerId(s, byId, byDisplay);
      if (!qbId) continue;
      matched++;
      const qboCustomer = byId.get(qbId);
      const resolvedClient = qboCustomer ? resolveClientIdForQboCustomer(qboCustomer, clientLookup) : null;
      const idQb = qboCustomerIdToIdQb(qbId);
      if (s.quickbooks_customer_id === qbId) {
        const repairPatch: Record<string, unknown> = {};
        if (idQb != null && s.id_qb !== idQb) {
          repairPatch.id_qb = idQb;
        }
        if (resolvedClient && s.client_id !== resolvedClient.clientId) {
          repairPatch.client_id = resolvedClient.clientId;
          console.info('[qbo-sync-societies] repairing society client from QBO BillAddr.Line1:', {
            society_id: s.id,
            qb_customer_id: qbId,
            previous_client_id: s.client_id,
            new_client_id: resolvedClient.clientId,
            source: resolvedClient.source,
          });
        }
        if (Object.keys(repairPatch).length > 0) {
          const { error: repErr } = await supabase
            .from('societies')
            .update(repairPatch)
            .eq('id', s.id);
          if (!repErr) {
            if (repairPatch.id_qb != null) idQbRepaired++;
            if (repairPatch.client_id != null) clientRepaired++;
          }
        }
        continue;
      }
      updates.push({ id: s.id, qbId });
    }

    for (const u of updates) {
      const idQb = qboCustomerIdToIdQb(u.qbId);
      const patch: Record<string, unknown> = { quickbooks_customer_id: u.qbId };
      if (idQb != null) patch.id_qb = idQb;
      const qboCustomer = byId.get(u.qbId);
      const currentSociety = rows.find((r) => r.id === u.id);
      const resolvedClient = qboCustomer ? resolveClientIdForQboCustomer(qboCustomer, clientLookup) : null;
      if (resolvedClient && currentSociety?.client_id !== resolvedClient.clientId) {
        patch.client_id = resolvedClient.clientId;
        console.info('[qbo-sync-societies] assigning society client from QBO BillAddr.Line1:', {
          society_id: u.id,
          qb_customer_id: u.qbId,
          previous_client_id: currentSociety?.client_id ?? null,
          new_client_id: resolvedClient.clientId,
          source: resolvedClient.source,
        });
      }
      const { error: upErr } = await supabase.from('societies').update(patch).eq('id', u.id);
      if (!upErr) {
        updated++;
        if (patch.client_id != null) clientRepaired++;
      }
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
          fecha_inscripcion: fullSoc.fecha_inscripcion ?? '',
          nombre: fullSoc.nombre ?? '', razon_social: fullSoc.razon_social ?? '',
          correo: fullSoc.correo ?? '', ...dirNames,
        };
        const comparisons = compareFields(flat, qbCF);

        // Auto-fill Supabase
        const toSb: Record<string, unknown> = {};
        for (const cmp of comparisons) {
          if (cmp.action === 'auto_fill_supabase' &&
              ['ruc', 'dv', 'nit', 'tipo_sociedad', 'fecha_inscripcion'].includes(cmp.field)) {
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
      client_id_repaired: clientRepaired,
      conflicts_detected: conflictsDetected,
    };
  }

  // ── sync_names: actualiza nombre/razon_social en BD desde QB para sociedades ya vinculadas ──
  if (mode === 'sync_names') {
    let customers: QboCustomer[];
    try {
      customers = await qboQueryAllCustomers(realmId, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json(502, { error: 'qbo_fetch_customers', detail: msg });
    }

    const byId = new Map<string, QboCustomer>();
    for (const c of customers) {
      if (c.Id) byId.set(String(c.Id), c);
    }

    const { data: societies, error: socErr } = await supabase
      .from('societies')
      .select('id, nombre, razon_social, quickbooks_customer_id')
      .not('quickbooks_customer_id', 'is', null);

    if (socErr) return json(500, { error: 'db_societies', detail: socErr.message });

    let nameUpdated = 0;
    const changes: { id: string; nombre_anterior: string; nombre_nuevo: string }[] = [];

    for (const s of (societies ?? []) as SocietyRow[]) {
      const qbId = s.quickbooks_customer_id?.trim();
      if (!qbId) continue;
      const cust = byId.get(qbId);
      if (!cust) continue;

      const newNombre = (cust.DisplayName ?? '').trim();
      const newRazon  = (cust.CompanyName ?? cust.DisplayName ?? '').trim();
      if (!newNombre) continue;

      const nameChanged  = newNombre && newNombre !== s.nombre;
      const razonChanged = newRazon  && newRazon  !== s.razon_social;
      if (!nameChanged && !razonChanged) continue;

      const patch: Record<string, string> = {};
      if (nameChanged)  patch.nombre       = newNombre;
      if (razonChanged) patch.razon_social  = newRazon;

      const { error: upErr } = await supabase.from('societies').update(patch).eq('id', s.id);
      if (!upErr) {
        nameUpdated++;
        changes.push({ id: s.id, nombre_anterior: s.nombre, nombre_nuevo: newNombre });
      }
    }

    return json(200, {
      ok: true,
      mode: 'sync_names',
      realm_id: realmId,
      societies_checked: (societies ?? []).length,
      names_updated: nameUpdated,
      changes: changes.slice(0, 100),
    });
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
