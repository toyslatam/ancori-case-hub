/**
 * qbo-sync-qbitems
 * ================
 * Sincroniza todos los Items de QuickBooks Online hacia la tabla public.qb_items.
 *
 * POST /functions/v1/qbo-sync-qbitems ejecutar
 * Headers: x-qbo-cron-secret: <QBO_CRON_SECRET>
 *
 * Devuelve: { inserted, updated, skipped, total_qbo }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-qbo-cron-secret',
};
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...CORS } });
}

// ── Tipos QBO ────────────────────────────────────────────────────────────────

interface QboItem {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  Type?: string;
  Active?: boolean;
  SalesTaxCodeRef?: { value?: string };
  PurchaseTaxCodeRef?: { value?: string };
  Sku?: string;
  Description?: string;
  UnitPrice?: number;
}

// ── Consulta paginada de items ────────────────────────────────────────────────

async function fetchAllItems(realmId: string, accessToken: string): Promise<QboItem[]> {
  const base = (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');
  const results: QboItem[] = [];
  const PAGE = 1000;
  let start = 1;

  while (true) {
    // QBO no soporta != en su SQL, traemos todo y filtramos después en código
    const sql = `SELECT * FROM Item STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=73`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* empty */ }
    if (!res.ok) {
      throw new Error(`qbo_items_${res.status}: ${JSON.stringify((data.Fault ?? data) as unknown).slice(0, 400)}`);
    }
    const qr = data.QueryResponse as Record<string, unknown> | undefined;
    const page = (qr?.Item as QboItem[] | undefined) ?? [];
    results.push(...page);
    if (page.length < PAGE) break;
    start += PAGE;
  }
  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  /* Auth */
  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const incoming = req.headers.get('x-qbo-cron-secret') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  if (!cronSecret || (incoming !== cronSecret && bearer !== cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }

  /* Env */
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId    = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  /* Token QBO */
  let accessToken: string;
  let realmId: string;
  try {
    const tok = await getValidQboAccessToken(sb, clientId, clientSecret);
    accessToken = tok.accessToken;
    realmId     = tok.realmId;
  } catch (e) {
    return json(503, { error: 'qbo_token', detail: String(e) });
  }

  /* Obtener items de QBO */
  let qboItems: QboItem[];
  try {
    qboItems = await fetchAllItems(realmId, accessToken);
  } catch (e) {
    return json(502, { error: 'qbo_fetch', detail: String(e) });
  }

  /* Cargar items existentes en BD */
  const { data: existing } = await sb.from('qb_items').select('id, qb_item_id');
  const existingByQbId = new Map<string, string>(); // qb_item_id (texto) -> uuid
  for (const r of existing ?? []) {
    if (r.qb_item_id) existingByQbId.set(String(r.qb_item_id), r.id as string);
  }

  /* Procesar */
  let inserted = 0, updated = 0, skipped = 0;

  for (const item of qboItems) {
    if (!item.Id || !item.Name) { skipped++; continue; }
    // Excluir categorías (solo queremos productos/servicios)
    if (item.Type === 'Category') { skipped++; continue; }

    const qbId       = item.Id;                // QBO string ID ("1", "23", etc.)
    const nombreInterno = item.Name.trim();
    const nombreQb   = (item.FullyQualifiedName ?? item.Name).trim();
    const tipo       = item.Type ?? 'Service';
    const activo     = item.Active !== false;
    // ITBMS: 7% si el item tiene código de impuesto "TAX", 0% si "NON" o sin código
    const taxCode    = item.SalesTaxCodeRef?.value ?? '';
    const impuesto   = taxCode === 'TAX' ? 7 : 0;

    const existing_uuid = existingByQbId.get(qbId);

    if (existing_uuid) {
      const { error } = await sb.from('qb_items').update({
        nombre_interno: nombreInterno,
        nombre_qb: nombreQb,
        tipo,
        activo,
        impuesto_default: impuesto,
      }).eq('id', existing_uuid);
      if (error) skipped++; else updated++;
    } else {
      const { error } = await sb.from('qb_items').insert({
        id: crypto.randomUUID(),
        nombre_interno: nombreInterno,
        nombre_qb: nombreQb,
        qb_item_id: qbId,
        tipo,
        activo,
        impuesto_default: impuesto,
      });
      if (error) skipped++; else inserted++;
    }
  }

  return json(200, {
    ok: true,
    realm_id: realmId,
    total_qbo: qboItems.length,
    inserted,
    updated,
    skipped,
  });
});
