/**
 * Descarga el PDF de una factura en QuickBooks y lo guarda en Supabase Storage.
 *
 * POST /functions/v1/qbo-invoice-pdf-sync
 * Headers: x-ancori-secret: <FUNCTION_SECRET>
 * Body: { invoice_id: string, force?: boolean }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import { qboGetInvoicePdf } from '../_shared/qbo-invoices.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret',
};
const JSON_H = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_H, ...CORS } });
}

function safeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'factura';
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

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  let invoice_id = '';
  let force = false;
  try {
    const body = await req.json() as { invoice_id?: string; force?: boolean };
    invoice_id = body.invoice_id ?? '';
    force = Boolean(body.force);
    if (!invoice_id) throw new Error('invoice_id requerido');
  } catch (e) {
    return json(400, { error: 'bad_request', detail: String(e) });
  }

  const sb = createClient(supabaseUrl, serviceKey);

  const { data: inv, error: invErr } = await sb
    .from('case_invoices')
    .select('id, qb_invoice_id, numero_factura, pdf_path, pdf_status')
    .eq('id', invoice_id)
    .single();

  if (invErr || !inv) return json(404, { error: 'invoice_not_found', detail: invErr?.message });

  const qbId = inv.qb_invoice_id ? String(inv.qb_invoice_id) : '';
  if (!qbId) {
    return json(422, { error: 'no_qb_invoice_id', detail: 'La factura no tiene qb_invoice_id en base de datos.' });
  }

  const docNum = inv.numero_factura ? String(inv.numero_factura) : qbId;
  const path = `invoices/${invoice_id}/${safeFilePart(docNum)}.pdf`;

  if (!force && inv.pdf_path && inv.pdf_status === 'ok') {
    const { data: signed, error: signErr } = await sb.storage.from('invoices').createSignedUrl(String(inv.pdf_path), 3600);
    if (!signErr && signed?.signedUrl) {
      await sb.from('case_invoices').update({ pdf_url_signed_last: signed.signedUrl }).eq('id', invoice_id);
      return json(200, { ok: true, cached: true, path: inv.pdf_path, signed_url: signed.signedUrl });
    }
  }

  await sb.from('case_invoices').update({ pdf_status: 'pending' }).eq('id', invoice_id);

  let accessToken = '';
  let realmId = '';
  try {
    const tok = await getValidQboAccessToken(sb, clientId, clientSecret);
    accessToken = tok.accessToken;
    realmId = tok.realmId;
  } catch (e) {
    const detail = String(e);
    await sb.from('case_invoices').update({ pdf_status: 'error' }).eq('id', invoice_id);
    return json(503, { error: 'qbo_token', detail });
  }

  let pdfBytes: ArrayBuffer;
  try {
    pdfBytes = await qboGetInvoicePdf(realmId, accessToken, qbId);
  } catch (e) {
    const detail = String(e);
    await sb.from('case_invoices').update({ pdf_status: 'error' }).eq('id', invoice_id);
    return json(502, { error: 'qbo_pdf_error', detail });
  }

  const { error: upErr } = await sb.storage.from('invoices').upload(path, pdfBytes, {
    contentType: 'application/pdf',
    upsert: true,
  });

  if (upErr) {
    await sb.from('case_invoices').update({ pdf_status: 'error' }).eq('id', invoice_id);
    return json(500, { error: 'storage_upload', detail: upErr.message });
  }

  const nowIso = new Date().toISOString();
  const { data: signed, error: signErr } = await sb.storage.from('invoices').createSignedUrl(path, 3600);

  await sb.from('case_invoices').update({
    pdf_path: path,
    pdf_status: 'ok',
    pdf_synced_at: nowIso,
    pdf_url_signed_last: signed?.signedUrl ?? null,
  }).eq('id', invoice_id);

  return json(200, {
    ok: true,
    qb_invoice_id: qbId,
    path,
    signed_url: signErr ? null : signed?.signedUrl ?? null,
    sign_error: signErr?.message,
  });
});
