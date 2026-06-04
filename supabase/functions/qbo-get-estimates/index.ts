/**
 * qbo-get-estimates
 * =================
 * Devuelve estimaciones (cotizaciones) y facturas abiertas de QuickBooks Online.
 *
 * POST body: { customer_id?: string }  (opcional para filtrar por cliente)
 * Auth: x-ancori-secret
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret',
};
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...CORS } });
}

const QBO_BASE = 'https://quickbooks.api.intuit.com';

async function qboQuery(realmId: string, token: string, sql: string) {
  const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=73`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QB query failed ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (FUNCTION_SECRET && req.headers.get('x-ancori-secret') !== FUNCTION_SECRET) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId    = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const sb = createClient(supabaseUrl, serviceKey);
  let customerId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    customerId = body.customer_id ?? undefined;
  } catch { /* no body */ }

  try {
    const { accessToken, realmId } = await getValidQboAccessToken(sb, clientId, clientSecret);

    const custFilter = customerId ? ` AND CustomerRef = '${customerId}'` : '';

    // Traer todas las estimaciones y filtrar pendientes en código (TxnStatus no es queryable en QB)
    const allEst: Record<string, unknown>[] = [];
    for (let start = 1; ; start += 1000) {
      const sql = `SELECT * FROM Estimate${custFilter ? ' WHERE' + custFilter.replace(' AND', '') : ''} ORDERBY TxnDate DESC STARTPOSITION ${start} MAXRESULTS 1000`;
      const data = await qboQuery(realmId, accessToken, sql);
      const page = (data?.QueryResponse?.Estimate ?? []) as Record<string, unknown>[];
      allEst.push(...page);
      if (page.length < 1000) break;
    }
    // Filtrar solo pendientes (excluir Accepted, Closed, Rejected)
    const estimates = allEst.filter(e => {
      const s = e.TxnStatus as string | undefined;
      return !s || s === 'Pending' || s === 'Draft';
    });

    // Facturas abiertas (balance > 0), paginadas
    const invBase = customerId
      ? `WHERE CustomerRef = '${customerId}' AND Balance > '0'`
      : `WHERE Balance > '0'`;
    const invoices: Record<string, unknown>[] = [];
    for (let start = 1; ; start += 1000) {
      const sql = `SELECT * FROM Invoice ${invBase} ORDERBY TxnDate DESC STARTPOSITION ${start} MAXRESULTS 1000`;
      const data = await qboQuery(realmId, accessToken, sql);
      const page = (data?.QueryResponse?.Invoice ?? []) as Record<string, unknown>[];
      invoices.push(...page);
      if (page.length < 1000) break;
    }

    // Traer lista de clientes (para el selector)
    const custSql = 'SELECT * FROM Customer WHERE Active = true MAXRESULTS 500';
    const custData = await qboQuery(realmId, accessToken, custSql);
    const customers = (custData?.QueryResponse?.Customer ?? []) as Record<string, unknown>[];

    return json(200, { estimates, invoices, customers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[qbo-get-estimates]', msg);
    return json(500, { error: 'qbo_error', detail: msg });
  }
});
