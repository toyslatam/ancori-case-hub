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

function envBool(name: string, defaultValue = false): boolean {
  const v = (Deno.env.get(name) ?? '').trim().toLowerCase();
  if (!v) return defaultValue;
  return ['1', 'true', 'yes', 'y', 'si', 'sí'].includes(v);
}

function msFromEnv(name: string, fallbackMs: number): number {
  const raw = (Deno.env.get(name) ?? '').trim();
  if (!raw) return fallbackMs;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  return Math.floor(n);
}

const QBO_FETCH_TIMEOUT_MS = msFromEnv('QBO_FETCH_TIMEOUT_MS', 45_000);

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = QBO_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(tid);
  }
}

/** Fila mínima de TaxCode devuelta por la query QBO. */
interface QboTaxCodeRow {
  Id?: string;
  Name?: string;
  Description?: string;
  Active?: boolean;
  /** Si false, suele ser exento / sin impuesto a las ventas. */
  Taxable?: boolean;
}

async function queryActiveTaxCodes(
  apiBase: string,
  realmId: string,
  accessToken: string,
): Promise<QboTaxCodeRow[]> {
  const sql = 'SELECT * FROM TaxCode WHERE Active = true MAXRESULTS 200';
  const url = `${apiBase}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=73`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!res.ok) {
    logStructured({
      operation: 'tax_code_query',
      ok: false,
      status: res.status,
      snippet: text.slice(0, 400),
    });
    return [];
  }
  const qr = data.QueryResponse as Record<string, unknown> | undefined;
  return (qr?.TaxCode as QboTaxCodeRow[] | undefined) ?? [];
}

/** Fila mínima de TaxRate (tasa) devuelta por la query QBO. */
interface QboTaxRateRow {
  Id?: string;
  Name?: string;
  RateValue?: number | string;
  Active?: boolean;
}

async function queryActiveTaxRates(
  apiBase: string,
  realmId: string,
  accessToken: string,
): Promise<QboTaxRateRow[]> {
  const sql = 'SELECT * FROM TaxRate WHERE Active = true MAXRESULTS 200';
  const url = `${apiBase}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=73`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!res.ok) {
    logStructured({
      operation: 'tax_rate_query',
      ok: false,
      status: res.status,
      snippet: text.slice(0, 400),
    });
    return [];
  }
  const qr = data.QueryResponse as Record<string, unknown> | undefined;
  return (qr?.TaxRate as QboTaxRateRow[] | undefined) ?? [];
}

function parseTaxRateValue(r: QboTaxRateRow): number {
  const raw = r.RateValue;
  if (raw == null) return NaN;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Id de TaxRate en QBO para un % de línea (p. ej. 7 = ITBMS).
 * Opcional: `QBO_TAX_RATE_ITBMS` cuando el % es 7 (o muy cercano).
 */
function resolveTaxRateIdForPercent(
  rates: QboTaxRateRow[],
  percent: number,
): { ok: true; id: string } | { ok: false; message: string } {
  const p = Number(percent);
  const itbmsEnv = Deno.env.get('QBO_TAX_RATE_ITBMS')?.trim();
  if (itbmsEnv && Math.abs(p - 7) < 0.01) {
    return { ok: true, id: itbmsEnv };
  }

  const withId = rates.filter((r) => r.Id && String(r.Id).trim().length > 0);
  const byValue = withId.find((r) => {
    const v = parseTaxRateValue(r);
    return Number.isFinite(v) && Math.abs(v - p) < 0.06;
  });
  if (byValue?.Id) return { ok: true, id: String(byValue.Id) };

  const name = (r: QboTaxRateRow) => String(r.Name ?? '').toLowerCase();
  const byName = withId.find((r) => /\bitbms\b|iva|sales\s*tax/.test(name(r)));
  if (byName?.Id) {
    const v = parseTaxRateValue(byName);
    if (!Number.isFinite(v) || Math.abs(v - p) < 0.51) {
      return { ok: true, id: String(byName.Id) };
    }
  }

  return {
    ok: false,
    message:
      `No hay un TaxRate activo en QBO para el ${p}% usado en una línea. En muchas compañías (modelo global) hace falta un TaxRate además del TaxCode en línea. Consulta en QBO o por API: SELECT * FROM TaxRate WHERE Active = true, o define el secreto QBO_TAX_RATE_ITBMS con el Id del TaxRate de ITBMS.`,
  };
}

function labelOf(c: QboTaxCodeRow): string {
  return `${c.Name ?? ''} ${c.Description ?? ''}`.trim();
}

/** Normaliza para reconocer "I.T.B.M.S." como ITBMS. */
function compactAlnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9%]+/g, '');
}

/**
 * Resuelve los Id de TaxCode de QBO para líneas gravadas vs exentas.
 * - Opcional: `QBO_TAX_CODE_LINE_TAXABLE` y `QBO_TAX_CODE_LINE_EXEMPT` (Ids exactos en QBO).
 * - Si no hay env: infiere desde la query (Taxable, nombre tipo "I.T.B.M.S. (7%)", Exento, etc.).
 * Los literales "TAX"/"NON" solo aplican a algunas compañías EE.UU.; en Panamá suelen fallar (error 6000).
 */
function resolveLineTaxCodeIds(codes: QboTaxCodeRow[]): { ok: true; taxableId: string; exemptId: string } | { ok: false; message: string } {
  const envTax = Deno.env.get('QBO_TAX_CODE_LINE_TAXABLE')?.trim();
  const envExempt = Deno.env.get('QBO_TAX_CODE_LINE_EXEMPT')?.trim();
  if (envTax && envExempt) {
    return { ok: true, taxableId: envTax, exemptId: envExempt };
  }

  const withId = codes.filter((c) => c.Id && String(c.Id).trim().length > 0);
  if (withId.length === 0) {
    return {
      ok: false,
      message:
        'No se obtuvieron TaxCode activos desde QuickBooks. Revisa impuestos en QBO o define los secretos QBO_TAX_CODE_LINE_TAXABLE y QBO_TAX_CODE_LINE_EXEMPT con los Id de TaxCode (Consulta en QBO: Impuestos o API query TaxCode).',
    };
  }

  const name = (c: QboTaxCodeRow) => String(c.Name ?? c.Description ?? '').toLowerCase();

  const scoreTaxable = (c: QboTaxCodeRow): number => {
    const raw = labelOf(c).toLowerCase();
    const compact = compactAlnum(raw);
    let s = 0;
    if (/\bitbms\b/i.test(raw)) s += 60;
    if (compact.includes('itbms')) s += 55;
    if (/i\.?\s*t\.?\s*b\.?\s*m\.?\s*s/i.test(raw)) s += 50;
    if (/7\s*%|7%|\(7/.test(raw)) s += 25;
    if (c.Taxable === true) s += 12;
    if (/grav|taxable|sujet/.test(raw)) s += 8;
    if (/\biva\b/.test(raw) && !/exclu/.test(raw)) s += 5;
    return s;
  };

  const scoreExempt = (c: QboTaxCodeRow): number => {
    const raw = labelOf(c).toLowerCase();
    let s = 0;
    if (c.Taxable === false) s += 40;
    if (/\bexempt\b|exento|exenta|no\s*sujet|0\s*%|sin\s*imp|fuera\s*de\s*alcance|out\s*of\s*scope/.test(raw)) s += 35;
    if (/exclu/.test(raw) && !/inclu/.test(raw)) s += 5;
    return s;
  };

  const byTaxableScore = [...withId].sort((a, b) => scoreTaxable(b) - scoreTaxable(a));
  let taxable: QboTaxCodeRow = byTaxableScore[0] as QboTaxCodeRow;
  const bestTaxable = byTaxableScore.find((c) => scoreTaxable(c) > 0);
  if (bestTaxable) taxable = bestTaxable;
  if (scoreTaxable(taxable) === 0) {
    taxable = withId.find((c) => c.Taxable === true) ?? taxable;
  }
  if (scoreTaxable(taxable) === 0) {
    taxable = withId.find((c) => /\bitbms\b|iva|grav|7\s*%|taxable/.test(name(c))) ?? taxable;
  }

  const candidatesExempt = [...withId]
    .filter((c) => String(c.Id) !== String(taxable.Id))
    .sort((a, b) => scoreExempt(b) - scoreExempt(a));
  let exempt: QboTaxCodeRow | undefined = candidatesExempt.find((c) => scoreExempt(c) > 0) ??
    candidatesExempt[0] ??
    withId.find((c) => c.Taxable === false);
  if (!exempt) {
    exempt = withId.find((c) =>
      /\bexempt\b|exento|exenta|non\b|sin\s*imp|0\s*%|fuera\s*de\s*alcance|out\s*of\s*scope/.test(name(c))
    );
  }

  if (!taxable || scoreTaxable(taxable) === 0) {
    taxable = withId.find((c) => c.Id !== exempt?.Id) ?? taxable;
  }
  if (!exempt || String(exempt.Id) === String(taxable?.Id)) {
    exempt = withId.find((c) => String(c.Id) !== String(taxable?.Id)) ?? exempt;
  }
  if (!taxable && exempt) taxable = exempt;
  if (!exempt && taxable) exempt = taxable;

  if (!exempt || !taxable || String(exempt.Id) === String(taxable.Id)) {
    return {
      ok: false,
      message:
        `No se pudo inferir TaxCode exento vs gravado (ITBMS) entre ${withId.length} códigos en QBO. En la factura, la columna IVA equivale a TaxCode en API: configura QBO_TAX_CODE_LINE_TAXABLE = Id del código "I.T.B.M.S. (7%)" y QBO_TAX_CODE_LINE_EXEMPT = Id del exento. Muestra de códigos: ${
          withId.slice(0, 12).map((c) => `${c.Id}:${c.Name ?? '?'}`).join('; ')
        }`,
    };
  }

  return { ok: true, taxableId: String(taxable.Id), exemptId: String(exempt.Id) };
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

  const taxCodeList = await queryActiveTaxCodes(apiBase, realmId, accessToken);
  const taxResolved = resolveLineTaxCodeIds(taxCodeList);
  if (!taxResolved.ok) {
    await persistInvoiceError(sb, invoice_id, `qbo_tax_codes: ${taxResolved.message}`);
    logStructured({ invoice_id, operation: 'tax_codes', ok: false, tax_codes_found: taxCodeList.length });
    return json(422, {
      ok: false,
      error: 'qbo_tax_config',
      detail: taxResolved.message,
      persisted: true,
    });
  }
  const { taxableId, exemptId } = taxResolved;
  /** Envía el impuesto explícito para que QBO calcule ITBMS 7% en compañías con modelo global. */
  const useTxnTaxDetail = envBool('QBO_INVOICE_TXN_TAX_DETAIL', true);
  /** Si true, NO enviamos DocNumber y QBO asigna el siguiente correlativo. */
  const useQboAutoDocNumber = envBool('QBO_INVOICE_USE_QBO_AUTONUMBER', true);
  logStructured({
    invoice_id,
    operation: 'tax_codes',
    ok: true,
    taxable_id: taxableId,
    exempt_id: exemptId,
    qbo_tax_code_count: taxCodeList.length,
    invoice_tax_mode: useTxnTaxDetail ? 'txn_tax_detail' : 'line_tax_code_only',
    invoice_doc_number_mode: useQboAutoDocNumber ? 'qbo_auto' : 'app_doc_number',
  });

  const qboLines: Record<string, unknown>[] = [];
  /** Solo se usa si QBO_INVOICE_TXN_TAX_DETAIL está activado. */
  const taxBuckets = new Map<number, { base: number; tax: number }>();

  for (const line of linesArr) {
    const row = line as Record<string, unknown>;
    if (!String(row.descripcion ?? '').trim()) continue;

    const qbItem = row.qb_items as { qb_item_id?: string; impuesto_default?: number } | null | undefined;
    const qbItemId = qbItem?.qb_item_id;
    const cantidad = Number(row.cantidad ?? 1);
    const tarifa = Number(row.tarifa ?? 0);
    const importe = cantidad * tarifa;
    const itbms = Number(row.itbms ?? 0);
    if (useTxnTaxDetail) {
      const pctKey = Number.isFinite(itbms) ? Math.round(itbms * 1e6) / 1e6 : 0;
      const bucket = taxBuckets.get(pctKey) ?? { base: 0, tax: 0 };
      bucket.base += importe;
      bucket.tax += (importe * itbms) / 100;
      taxBuckets.set(pctKey, bucket);
    }

    const lineObj: Record<string, unknown> = {
      DetailType: 'SalesItemLineDetail',
      Amount: Number(importe.toFixed(2)),
      Description: String(row.descripcion ?? ''),
      SalesItemLineDetail: {
        Qty: cantidad,
        UnitPrice: tarifa,
        ...(qbItemId ? { ItemRef: { value: qbItemId } } : {}),
        TaxCodeRef: { value: itbms > 0 ? taxableId : exemptId },
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
    /** Misma idea que en QBO: "Impuestos no incluidos" (importe de línea sin ITBMS). */
    GlobalTaxCalculation: 'TaxExcluded',
    Line: qboLines,
    CustomerRef: { value: qbCustomerId },
    TxnDate: inv.fecha_factura,
    DueDate: inv.fecha_vencimiento,
    ...(inv.nota_cliente ? { CustomerMemo: { value: inv.nota_cliente } } : {}),
  };
  if (!useQboAutoDocNumber) {
    const doc = String(inv.numero_factura ?? '').trim();
    if (doc) invoicePayload.DocNumber = doc;
  }

  if (useTxnTaxDetail) {
    let totalTaxRaw = 0;
    for (const [, b] of taxBuckets) totalTaxRaw += b.tax;
    const totalTaxRounded = Number(totalTaxRaw.toFixed(2));

    const taxLinesOut: Record<string, unknown>[] = [];
    if (totalTaxRounded > 0) {
      const taxRateList = await queryActiveTaxRates(apiBase, realmId, accessToken);
      logStructured({
        invoice_id,
        operation: 'tax_rates',
        ok: true,
        qbo_tax_rate_count: taxRateList.length,
      });

      const positiveBuckets = [...taxBuckets.entries()].filter(([pct]) => pct > 0).sort((a, b) => b[0] - a[0]);
      for (const [pct, bucket] of positiveBuckets) {
        const rr = resolveTaxRateIdForPercent(taxRateList, pct);
        if (rr.ok) {
          const amt = Number(bucket.tax.toFixed(2));
          const net = Number(bucket.base.toFixed(2));
          taxLinesOut.push({
            Amount: amt,
            DetailType: 'TaxLineDetail',
            TaxLineDetail: {
              TaxRateRef: { value: rr.id },
              PercentBased: true,
              TaxPercent: pct,
              NetAmountTaxable: net,
            },
          });
        } else {
          await persistInvoiceError(sb, invoice_id, `qbo_tax_rates: ${rr.message}`);
          logStructured({ invoice_id, operation: 'tax_rates', ok: false, percent: pct });
          return json(422, {
            ok: false,
            error: 'qbo_tax_rate_config',
            detail: rr.message,
            persisted: true,
          });
        }
      }
    }

    const taxLineSum = taxLinesOut.reduce((s, tl) => s + Number(tl.Amount ?? 0), 0);
    const txnTaxDetail: Record<string, unknown> = {
      TxnTaxCodeRef: { value: totalTaxRounded > 0 ? taxableId : exemptId },
      TotalTax: taxLinesOut.length > 0 ? Number(taxLineSum.toFixed(2)) : totalTaxRounded,
    };
    if (taxLinesOut.length > 0) txnTaxDetail.TaxLine = taxLinesOut;
    invoicePayload.TxnTaxDetail = txnTaxDetail;
  }

  const url = `${apiBase}/v3/company/${realmId}/invoice?minorversion=73`;
  let qboResp: Record<string, unknown> = {};
  try {
    const res = await fetchWithTimeout(url, {
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
    const isTimeout = e instanceof Error && e.name === 'AbortError';
    const errCode = isTimeout ? 'qbo_timeout' : 'qbo_fetch_error';
    await persistInvoiceError(sb, invoice_id, `${errCode}: ${detail}`);
    logStructured({ invoice_id, operation: 'qbo_fetch', ok: false, timeout: isTimeout });
    return json(isTimeout ? 504 : 502, { ok: false, error: errCode, detail, persisted: true });
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
