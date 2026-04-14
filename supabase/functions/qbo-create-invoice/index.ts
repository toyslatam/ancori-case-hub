/**
 * qbo-create-invoice
 * ==================
 * Crea una factura en QuickBooks Online a partir de una factura guardada en Supabase.
 * Tras crearla en QBO, actualiza case_invoices con qb_invoice_id y estado = 'enviada'.
 *
 * POST /functions/v1/qbo-create-invoice
 * Headers: x-ancori-secret: <FUNCTION_SECRET>
 * Body: { invoice_id: string }
 *
 * Devuelve: { ok, qb_invoice_id, doc_number }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret',
};
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...CORS } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  /* Auth */
  const fnSecret = Deno.env.get('FUNCTION_SECRET') ?? '';
  if (fnSecret && req.headers.get('x-ancori-secret') !== fnSecret) {
    return json(401, { error: 'unauthorized' });
  }

  /* Env */
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId    = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  const apiBase     = (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  /* Body */
  let invoice_id: string;
  try {
    const body = await req.json() as { invoice_id?: string };
    invoice_id = body.invoice_id ?? '';
    if (!invoice_id) throw new Error('invoice_id requerido');
  } catch (e) {
    return json(400, { error: 'bad_request', detail: String(e) });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  /* Cargar factura + líneas + qb_items */
  const { data: inv, error: invErr } = await sb
    .from('case_invoices')
    .select('*, case_id, client_id, society_id, fecha_factura, fecha_vencimiento, nota_cliente')
    .eq('id', invoice_id)
    .single();

  if (invErr || !inv) return json(404, { error: 'invoice_not_found', detail: invErr?.message });

  const { data: lines } = await sb
    .from('invoice_lines')
    .select('*, qb_items(qb_item_id, impuesto_default)')
    .eq('invoice_id', invoice_id);

  /* Obtener ID de cliente QB (de sociedad o cliente) */
  let qbCustomerId: string | null = null;

  if (inv.society_id) {
    const { data: soc } = await sb
      .from('societies')
      .select('quickbooks_customer_id, id_qb')
      .eq('id', inv.society_id)
      .maybeSingle();
    qbCustomerId = soc?.quickbooks_customer_id ?? (soc?.id_qb ? String(soc.id_qb) : null);
  }

  if (!qbCustomerId && inv.client_id) {
    const { data: cli } = await sb
      .from('clients')
      .select('quickbooks_customer_id')
      .eq('id', inv.client_id)
      .maybeSingle();
    qbCustomerId = cli?.quickbooks_customer_id ?? null;
  }

  if (!qbCustomerId) {
    return json(422, {
      error: 'no_qb_customer',
      detail: 'El cliente o sociedad no tiene un ID de QuickBooks configurado. Configura quickbooks_customer_id en la sociedad o cliente.',
    });
  }

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

  /* Construir objeto Invoice para QBO */
  const qboLines: Record<string, unknown>[] = [];

  for (const line of lines ?? []) {
    // deno-lint-ignore no-explicit-any
    const qbItem = (line as any).qb_items as { qb_item_id?: string; impuesto_default?: number } | null;
    const qbItemId = qbItem?.qb_item_id;
    const cantidad = Number(line.cantidad ?? 1);
    const tarifa   = Number(line.tarifa ?? 0);
    const importe  = cantidad * tarifa;
    const itbms    = Number(line.itbms ?? 0);

    const lineObj: Record<string, unknown> = {
      DetailType: 'SalesItemLineDetail',
      Amount: Number(importe.toFixed(2)),
      Description: line.descripcion ?? '',
      SalesItemLineDetail: {
        Qty: cantidad,
        UnitPrice: tarifa,
        ...(qbItemId ? { ItemRef: { value: qbItemId } } : {}),
        // Código de impuesto: TAX si tiene ITBMS, NON si no
        TaxCodeRef: { value: itbms > 0 ? 'TAX' : 'NON' },
      },
    };
    qboLines.push(lineObj);
  }

  if (qboLines.length === 0) {
    return json(422, { error: 'no_lines', detail: 'La factura no tiene líneas con productos/servicios' });
  }

  const invoicePayload: Record<string, unknown> = {
    Line: qboLines,
    CustomerRef: { value: qbCustomerId },
    TxnDate: inv.fecha_factura,
    DueDate: inv.fecha_vencimiento,
    ...(inv.nota_cliente ? { CustomerMemo: { value: inv.nota_cliente } } : {}),
  };

  /* Enviar a QBO */
  const url = `${apiBase}/v3/company/${realmId}/invoice?minorversion=73`;
  let qboResp: Record<string, unknown> = {};
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    });
    const text = await res.text();
    try { qboResp = JSON.parse(text) as Record<string, unknown>; } catch { /* empty */ }
    if (!res.ok) {
      const fault = qboResp.Fault as Record<string, unknown> | undefined;
      return json(502, { error: 'qbo_api_error', detail: JSON.stringify(fault ?? qboResp).slice(0, 600) });
    }
  } catch (e) {
    return json(502, { error: 'qbo_fetch_error', detail: String(e) });
  }

  const qboInvoice = (qboResp as Record<string, unknown>).Invoice as Record<string, unknown> | undefined;
  const qbInvoiceId = String(qboInvoice?.Id ?? '');
  const docNumber   = String(qboInvoice?.DocNumber ?? '');

  /* Actualizar case_invoices */
  await sb.from('case_invoices').update({
    qb_invoice_id: qbInvoiceId,
    estado: 'enviada',
    numero_factura: docNumber || inv.numero_factura,
  }).eq('id', invoice_id);

  return json(200, {
    ok: true,
    qb_invoice_id: qbInvoiceId,
    doc_number: docNumber,
  });
});
