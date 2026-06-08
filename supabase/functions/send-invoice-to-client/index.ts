import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.4.0/mod.ts';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')     ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT     = 587;
const SMTP_USER     = Deno.env.get('SMTP_USER')     ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';
const MAIL_FROM     = Deno.env.get('MAIL_FROM')     ?? 'ancori@solucionesdetecnologia.com';
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ancori-secret',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type SendInvoicePayload = {
  to_email: string;
  subject?: string;
  body?: string;
  pdf_url?: string;
  invoice_number?: string;
  client_name?: string;
  total?: number;
  fecha_factura?: string;
  sent_by_nombre?: string;
};

/** Descarga el PDF desde la URL firmada y lo devuelve en base64. */
async function fetchPdfBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let b64 = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      b64 += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(b64);
  } catch {
    return null;
  }
}

function nl2br(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
}

function buildHtml(p: SendInvoicePayload): string {
  const total    = p.total != null ? fmtMoney(p.total) : null;
  const greeting = p.client_name
    ? `Estimado(a) <strong>${p.client_name}</strong>,`
    : 'Estimado(a) cliente,';

  const rows = [
    p.invoice_number ? `<tr><td style="color:#666;padding:3px 16px 3px 0;font-size:13px;vertical-align:top">N. Factura</td><td style="font-weight:600;font-size:13px">${p.invoice_number}</td></tr>` : '',
    total            ? `<tr><td style="color:#666;padding:3px 16px 3px 0;font-size:13px;vertical-align:top">Total</td><td style="font-weight:700;font-size:14px">${total}</td></tr>` : '',
    p.fecha_factura  ? `<tr><td style="color:#666;padding:3px 16px 3px 0;font-size:13px;vertical-align:top">Fecha</td><td style="font-size:13px">${p.fecha_factura}</td></tr>` : '',
  ].filter(Boolean).join('');

  const bodyHtml = p.body
    ? `<p style="font-size:13px;color:#333;margin:18px 0 0;line-height:1.6">${nl2br(p.body)}</p>`
    : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="es"><head><meta charset="utf-8"/></head>',
    '<body style="font-family:Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:28px 20px;background:#f5f5f5">',
    '<div style="background:#fff;border-radius:8px;padding:28px;border:1px solid #e5e7eb">',
    `<p style="margin:0 0 14px;font-size:14px">${greeting}</p>`,
    rows ? `<table style="border-collapse:collapse;margin:0 0 8px">${rows}</table>` : '',
    bodyHtml,
    '<hr style="border:none;border-top:1px solid #eee;margin:22px 0 12px"/>',
    `<p style="font-size:11px;color:#bbb;margin:0">Ancori y Asociados${p.sent_by_nombre ? ` &mdash; Enviado por: ${p.sent_by_nombre}` : ''}</p>`,
    '</div></body></html>',
  ].join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (FUNCTION_SECRET && req.headers.get('x-ancori-secret') !== FUNCTION_SECRET) {
    return json(401, { error: 'unauthorized' });
  }

  let payload: SendInvoicePayload;
  try {
    payload = await req.json() as SendInvoicePayload;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (!payload.to_email?.trim()) {
    return json(400, { error: 'missing_fields', required: ['to_email'] });
  }

  if (!SMTP_PASSWORD) {
    console.error('SMTP_PASSWORD no configurado');
    return json(500, { error: 'smtp_env_missing' });
  }

  // Descargar PDF para adjuntar
  const pdfBase64 = payload.pdf_url ? await fetchPdfBase64(payload.pdf_url) : null;
  const hasPdf    = pdfBase64 !== null;

  const subject = payload.subject?.trim()
    || `Factura${payload.invoice_number ? ` No. ${payload.invoice_number}` : ''}${payload.client_name ? ` - ${payload.client_name}` : ''}`;

  const pdfFilename = `Factura${payload.invoice_number ? `-${payload.invoice_number}` : ''}.pdf`;

  let client: SMTPClient | null = null;
  try {
    client = new SMTPClient({
      debug: { noStartTLS: false, allowUnsecure: false },
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: false,
        auth: { username: SMTP_USER, password: SMTP_PASSWORD },
      },
    });

    const sendOpts: Record<string, unknown> = {
      from: `Ancori y Asociados <${MAIL_FROM}>`,
      to: [payload.to_email.trim()],
      subject,
      html: buildHtml(payload),
    };

    if (hasPdf) {
      sendOpts.attachments = [
        {
          filename: pdfFilename,
          contentType: 'application/pdf',
          encoding: 'base64',
          content: pdfBase64,
        },
      ];
    }

    await client.send(sendOpts as Parameters<typeof client.send>[0]);
    console.log('Invoice sent to client', { to: payload.to_email, subject, hasPdf });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('SMTP error:', msg);
    return json(500, { error: 'smtp_error', detail: msg });
  } finally {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  return json(200, { ok: true, pdf_attached: hasPdf });
});
