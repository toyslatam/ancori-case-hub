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
  subject: string;
  body?: string;
  pdf_url?: string;
  invoice_number?: string;
  client_name?: string;
  total?: number;
  fecha_factura?: string;
  sent_by_nombre?: string;
};

function buildHtml(p: SendInvoicePayload): string {
  const total = p.total != null ? fmtMoney(p.total) : null;

  const pdfSection = p.pdf_url
    ? `<div style="margin:20px 0;text-align:center">
         <a href="${p.pdf_url}" target="_blank"
            style="display:inline-block;background:#0a7c4d;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;font-size:14px">
           Ver / Descargar Factura PDF
         </a>
       </div>`
    : '';

  const bodySection = p.body
    ? `<div style="margin:12px 0;padding:12px 16px;background:#f5f7fa;border-left:3px solid #0a7c4d;border-radius:4px;font-size:13px;color:#444;white-space:pre-wrap">${p.body}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9">
  <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:#0a7c4d;padding:18px 24px">
      <p style="margin:0;color:#fff;font-size:17px;font-weight:bold">
        FACTURA${p.invoice_number ? ` N. ${p.invoice_number}` : ''}
      </p>
    </div>
    <div style="padding:24px">
      ${p.client_name ? `<p style="font-size:14px;color:#333;margin:0 0 12px">Estimado(a) <strong>${p.client_name}</strong>,</p>` : ''}
      <p style="font-size:13px;color:#555;margin:0 0 14px">
        Le remitimos la siguiente factura para su revision y pago correspondiente.
      </p>
      ${bodySection}
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        ${p.invoice_number ? `<tr>
          <td style="padding:5px 0;font-size:13px;color:#666;width:140px">N. Factura</td>
          <td style="padding:5px 0;font-size:13px;font-weight:bold">${p.invoice_number}</td>
        </tr>` : ''}
        ${total ? `<tr>
          <td style="padding:5px 0;font-size:13px;color:#666">Total</td>
          <td style="padding:5px 0;font-size:15px;font-weight:bold;color:#0a7c4d">${total}</td>
        </tr>` : ''}
        ${p.fecha_factura ? `<tr>
          <td style="padding:5px 0;font-size:13px;color:#666">Fecha</td>
          <td style="padding:5px 0;font-size:13px">${p.fecha_factura}</td>
        </tr>` : ''}
      </table>
      ${pdfSection}
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="font-size:11px;color:#bbb;margin:0">
        Sistema Ancori - notificacion automatica${p.sent_by_nombre ? ` | Enviado por: ${p.sent_by_nombre}` : ''}
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildText(p: SendInvoicePayload): string {
  const sep = '-'.repeat(50);
  const lines: string[] = [
    `FACTURA${p.invoice_number ? ` N. ${p.invoice_number}` : ''}`,
    sep,
  ];
  if (p.client_name) lines.push(`Estimado(a) ${p.client_name},`);
  lines.push('Le remitimos la siguiente factura para su revision y pago correspondiente.');
  if (p.body) { lines.push(''); lines.push(p.body); }
  lines.push('');
  if (p.invoice_number) lines.push(`N. Factura : ${p.invoice_number}`);
  if (p.total != null)  lines.push(`Total      : ${fmtMoney(p.total)}`);
  if (p.fecha_factura)  lines.push(`Fecha      : ${p.fecha_factura}`);
  if (p.pdf_url)        { lines.push(''); lines.push(`Ver PDF: ${p.pdf_url}`); }
  lines.push('');
  lines.push(`Sistema Ancori - notificacion automatica${p.sent_by_nombre ? ` | Enviado por: ${p.sent_by_nombre}` : ''}`);
  return lines.join('\n');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (FUNCTION_SECRET) {
    if (req.headers.get('x-ancori-secret') !== FUNCTION_SECRET) {
      return json(401, { error: 'unauthorized' });
    }
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

  const subject = payload.subject?.trim() || `Factura${payload.invoice_number ? ` No. ${payload.invoice_number}` : ''}`;

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

    await client.send({
      from: `Ancori Plataforma <${MAIL_FROM}>`,
      to: [payload.to_email.trim()],
      subject,
      html: buildHtml(payload),
      content: buildText(payload),
    });

    console.log('Invoice sent to client', { to: payload.to_email, subject });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('SMTP error:', msg);
    return json(500, { error: 'smtp_error', detail: msg });
  } finally {
    if (client) {
      try { await client.close(); } catch { /* ignore */ }
    }
  }

  return json(200, { ok: true });
});
