/**
 * qbo-create-invoice
 * ==================
 * Crea una factura en QuickBooks Online a partir de una factura guardada en Supabase.
 * Tras crearla en QBO, actualiza case_invoices con qb_invoice_id y estado = 'enviada'.
 * En fallos (validación o API), persiste estado = 'error' y error_detalle.
 *
 * POST /functions/v1/qbo-create-invoice
 * Headers: x-ancori-secret: <FUNCTION_SECRET>
 * Body: { invoice_id: string }
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret',
};
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...CORS } });
}

const MAX_ERR = 2000;

async function persistInvoiceError(
  sb: SupabaseClient,
  invoiceId: string,
  detail: string,
  extra?: Record<string, unknown>
): Promise<void> {
  const error_detalle = detail.slice(0, MAX_ERR);
  const { error } = await sb.from('case_invoices').update({
    estado: 'error',
    error_detalle,
    ...extra,
  }).eq('id', invoiceId);
  if (error) {
    console.error('[qbo-create-invoice] persist_error_failed', { invoice_id: invoiceId, message: error.message });
  }
}

function logStructured(payload: Record<string, unknown>) {
  console.info(JSON.stringify({ source: 'qbo-create-invoice', ...payload }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const fnSecret = Deno.env.get('FUNCTION_SECRET') ?? '';
  if (fnSecret && req.headers.get('x-ancori-secret') !== fnSecret) {
    return json(401, { error: 'unauthorized' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');
  const apiBase = (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  let invoice_id: string;
  try {
    const body = await req.json() as { invoice_id?: string };
    invoice_id = body.invoice_id ?? '';
    if (!invoice_id) throw new Error('invoice_id requerido');
  } catch (e) {
    return json(400, { error: 'bad_request', detail: String(e) });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const { data: inv, error: invErr } = await sb
    .from('case_invoices')
    .select('*, case_id, client_id, society_id, fecha_factura, fecha_vencimiento, nota_cliente, numero_factura')
    .eq('id', invoice_id)
    .single();

  if (invErr || !inv) {
    return json(404, { error: 'invoice_not_found', detail: invErr?.message });
  }

  const { data: lines } = await sb
    .from('invoice_lines')
    .select('*, qb_items(qb_item_id, impuesto_default)')
    .eq('invoice_id', invoice_id);

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
    const msg =
      'El cliente o sociedad no tiene un ID de QuickBooks configurado. Configura quickbooks_customer_id en la sociedad o cliente.';
    await persistInvoiceError(sb, invoice_id, `no_qb_customer: ${msg}`);
    logStructured({ invoice_id, operation: 'validate', ok: false, reason: 'no_qb_customer' });
    return json(422, {
      ok: false,
      error: 'no_qb_customer',
      detail: msg,
      persisted: true,
    });
  }

  const linesArr = lines ?? [];
  const describedLines = linesArr.filter((l) => String((l as Record<string, unknown>).descripcion ?? '').trim());
  for (const line of describedLines) {
    const row = line as Record<string, unknown>;
    if (!row.qb_item_id) {
      const msg = 'Todas las líneas con descripción deben tener un producto/servicio QuickBooks (qb_item_id).';
      await persistInvoiceError(sb, invoice_id, `no_qb_item_line: ${msg}`);
      logStructured({ invoice_id, operation: 'validate', ok: false, reason: 'line_missing_qb_item' });
      return json(422, {
        ok: false,
        error: 'no_qb_item_line',
        detail: msg,
        persisted: true,
      });
    }
  }

  let accessToken: string;
  let realmId: string;
  try {
    const tok = await getValidQboAccessToken(sb, clientId, clientSecret);
    accessToken = tok.accessToken;
    realmId = tok.realmId;
  } catch (e) {
    const detail = String(e);
    await persistInvoiceError(sb, invoice_id, `qbo_token: ${detail}`);
    logStructured({ invoice_id, operation: 'token', ok: false });
    return json(503, { ok: false, error: 'qbo_token', detail, persisted: true });
  }

  const qboLines: Record<string, unknown>[] = [];

  for (const line of linesArr) {
    const row = line as Record<string, unknown>;
    const qbItem = row.qb_items as { qb_item_id?: string; impuesto_default?: number } | null | undefined;
    const qbItemId = qbItem?.qb_item_id;
    const cantidad = Number(row.cantidad ?? 1);
    const tarifa = Number(row.tarifa ?? 0);
    const importe = cantidad * tarifa;
    const itbms = Number(row.itbms ?? 0);

    const lineObj: Record<string, unknown> = {
      DetailType: 'SalesItemLineDetail',
      Amount: Number(importe.toFixed(2)),
      Description: String(row.descripcion ?? ''),
      SalesItemLineDetail: {
        Qty: cantidad,
        UnitPrice: tarifa,
        ...(qbItemId ? { ItemRef: { value: qbItemId } } : {}),
        TaxCodeRef: { value: itbms > 0 ? 'TAX' : 'NON' },
      },
    };
    qboLines.push(lineObj);
  }

  if (qboLines.length === 0) {
    const msg = 'La factura no tiene líneas con productos/servicios';
    await persistInvoiceError(sb, invoice_id, `no_lines: ${msg}`);
    return json(422, { ok: false, error: 'no_lines', detail: msg, persisted: true });
  }

  const invoicePayload: Record<string, unknown> = {
    Line: qboLines,
    CustomerRef: { value: qbCustomerId },
    TxnDate: inv.fecha_factura,
    DueDate: inv.fecha_vencimiento,
    ...(inv.nota_cliente ? { CustomerMemo: { value: inv.nota_cliente } } : {}),
  };

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
    try {
      qboResp = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* empty */
    }
    if (!res.ok) {
      const fault = qboResp.Fault as Record<string, unknown> | undefined;
      const detail = JSON.stringify(fault ?? qboResp).slice(0, 600);
      await persistInvoiceError(sb, invoice_id, `qbo_api_error: ${detail}`);
      logStructured({
        invoice_id,
        operation: 'qbo_post',
        ok: false,
        status: res.status,
        qb_invoice_id: null,
      });
      return json(502, {
        ok: false,
        error: 'qbo_api_error',
        detail,
        persisted: true,
      });
    }
  } catch (e) {
    const detail = String(e);
    await persistInvoiceError(sb, invoice_id, `qbo_fetch_error: ${detail}`);
    logStructured({ invoice_id, operation: 'qbo_fetch', ok: false });
    return json(502, { ok: false, error: 'qbo_fetch_error', detail, persisted: true });
  }

  const qboInvoice = (qboResp as Record<string, unknown>).Invoice as Record<string, unknown> | undefined;
  const qbInvoiceId = String(qboInvoice?.Id ?? '');
  const docNumber = String(qboInvoice?.DocNumber ?? '');
  const txnDate = String(qboInvoice?.TxnDate ?? inv.fecha_factura ?? '');
  const dueDate = String(qboInvoice?.DueDate ?? inv.fecha_vencimiento ?? '');
  const totalAmt = qboInvoice?.TotalAmt != null ? Number(qboInvoice.TotalAmt) : null;
  const balance = qboInvoice?.Balance != null ? Number(qboInvoice.Balance) : null;

  const nowIso = new Date().toISOString();
  const { error: upErr } = await sb
    .from('case_invoices')
    .update({
      qb_invoice_id: qbInvoiceId,
      estado: 'enviada',
      numero_factura: docNumber || inv.numero_factura,
      error_detalle: null,
      qb_total: totalAmt,
      qb_balance: balance,
      qb_last_sync_at: nowIso,
    })
    .eq('id', invoice_id);

  if (upErr) {
    const detail = `db_update_after_qbo: ${upErr.message}`;
    await persistInvoiceError(sb, invoice_id, detail, {
      qb_invoice_id: qbInvoiceId,
      numero_factura: docNumber || inv.numero_factura,
    });
    logStructured({ invoice_id, operation: 'db_update', ok: false, qb_invoice_id: qbInvoiceId });
    return json(500, { ok: false, error: 'db_update_failed', detail, persisted: true });
  }

  logStructured({
    invoice_id,
    operation: 'create_invoice',
    ok: true,
    qb_invoice_id: qbInvoiceId,
    doc_number: docNumber,
  });

  return json(200, {
    ok: true,
    qb_invoice_id: qbInvoiceId,
    doc_number: docNumber,
    txn_date: txnDate,
    due_date: dueDate,
    total_amt: totalAmt,
    balance,
  });
});
