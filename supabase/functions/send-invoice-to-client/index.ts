import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SMTP_HOST       = Deno.env.get('SMTP_HOST')       ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT       = 587;
const SMTP_USER       = Deno.env.get('SMTP_USER')       ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD   = Deno.env.get('SMTP_PASSWORD')   ?? '';
const MAIL_FROM       = Deno.env.get('MAIL_FROM')       ?? 'ancori@solucionesdetecnologia.com';
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';
// Sube la imagen de firma a Supabase Storage (bucket público) y configura esta variable
// en Supabase Secrets → FIRMA_IMG_URL = https://xxx.supabase.co/storage/v1/object/public/...
const FIRMA_IMG_URL   = Deno.env.get('FIRMA_IMG_URL')   ?? '';

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

/** Descarga el PDF y devuelve base64. Loga errores para diagnóstico. */
async function fetchPdfBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`fetchPdfBase64: HTTP ${res.status} ${res.statusText}`);
      return null;
    }
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    console.log(`fetchPdfBase64: descargados ${bytes.length} bytes`);
    if (bytes.length === 0) return null;

    // Codificar en base64 por chunks para no desbordar el stack
    let b64 = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      b64 += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    return btoa(b64);
  } catch (e) {
    console.error('fetchPdfBase64 exception:', String(e));
    return null;
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nl2br(text: string): string {
  return escHtml(text).replace(/\n/g, '<br/>');
}

function buildHtml(p: SendInvoicePayload): string {
  const total    = p.total != null ? fmtMoney(p.total) : null;
  const greeting = p.client_name
    ? `Estimado(a) <strong>${escHtml(p.client_name)}</strong>,`
    : 'Estimado(a) cliente,';

  const detalles = [
    p.invoice_number ? `<strong>N. Factura:</strong> ${escHtml(p.invoice_number)}` : '',
    total            ? `<strong>Total:</strong> ${total}` : '',
    p.fecha_factura  ? `<strong>Fecha:</strong> ${escHtml(p.fecha_factura)}` : '',
  ].filter(Boolean).join('&nbsp;&nbsp;|&nbsp;&nbsp;');

  const detallesHtml = detalles
    ? `<p style="margin:10px 0 16px;font-size:14px;color:#333">${detalles}</p>`
    : '';

  const bodyHtml = p.body
    ? `<p style="margin:0;font-size:14px;color:#333;line-height:1.8">${nl2br(p.body)}</p>`
    : '';

  const firmaHtml = FIRMA_IMG_URL
    ? `<img src="${FIRMA_IMG_URL}" alt="Ancori y Asociados - Vanessa Suarez" style="max-width:440px;width:100%;display:block;margin-top:4px"/>`
    : `<p style="margin:4px 0;font-size:13px;color:#333">
         <strong>Vanessa Su&#225;rez</strong><br/>
         Asistente Administrativa | Ancori y Asociados
       </p>`;

  return [
    '<!DOCTYPE html>',
    '<html lang="es"><head><meta charset="utf-8"/>',
    '<style>body,p,td{font-family:Arial,Helvetica,sans-serif;color:#333}a{color:#333}</style>',
    '</head>',
    '<body style="margin:0;padding:24px;background:#ffffff;max-width:600px">',
    `<p style="margin:0 0 10px;font-size:14px;color:#333">${greeting}</p>`,
    detallesHtml,
    bodyHtml,
    '<br/>',
    '<hr style="border:none;border-top:1px solid #ddd;margin:20px 0 16px"/>',
    firmaHtml,
    '</body></html>',
  ].join('\n');
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
  let pdfBase64: string | null = null;
  if (payload.pdf_url) {
    console.log('Descargando PDF:', payload.pdf_url.slice(0, 120));
    pdfBase64 = await fetchPdfBase64(payload.pdf_url);
    console.log('PDF base64:', pdfBase64 ? `${pdfBase64.length} chars` : 'null');
  } else {
    console.log('pdf_url no enviado — correo sin adjunto');
  }
  const hasPdf = pdfBase64 !== null;

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

    // denomailer v1.6.0 soporta attachments nativamente.
    // Usamos cast para evitar error TS si los tipos de esta versión aún no incluyen el campo.
    // deno-lint-ignore no-explicit-any
    const sendOpts: any = {
      from: `Ancori y Asociados <${MAIL_FROM}>`,
      to:   [payload.to_email.trim()],
      subject,
      html: buildHtml(payload),
    };

    if (hasPdf) {
      sendOpts.attachments = [
        {
          filename:    pdfFilename,
          content:     pdfBase64,
          contentType: 'application/pdf',
          encoding:    'base64',
        },
      ];
    }

    await client.send(sendOpts);
    console.log('Correo enviado', { to: payload.to_email, subject, hasPdf });
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
