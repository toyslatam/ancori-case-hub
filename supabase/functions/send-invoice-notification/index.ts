import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.4.0/mod.ts';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')     ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT     = 587;
const SMTP_USER     = Deno.env.get('SMTP_USER')     ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';
const MAIL_FROM     = Deno.env.get('MAIL_FROM')     ?? 'ancori@solucionesdetecnologia.com';
// Destinatarios fijos de notificaciones de facturas
const INVOICE_TO    = (Deno.env.get('INVOICE_NOTIFY_TO') ?? 'administracion@ancori.com,finanzas@ancori.com')
  .split(',').map(s => s.trim()).filter(Boolean);
const INVOICE_CC    = (Deno.env.get('INVOICE_NOTIFY_CC') ?? 'soporte@ancoriyasociados.onmicrosoft.com')
  .split(',').map(s => s.trim()).filter(Boolean);

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

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

type InvoiceLine = { descripcion: string; importe: number };

type NotifyPayload = {
  tipo: 'creacion' | 'enviada_qb';
  caso_numero: string;
  client_name: string;
  society_name?: string;
  bill_to_society: boolean;
  numero_factura?: string;
  qb_numero_factura?: string;
  fecha_factura?: string;
  estado: string;
  subtotal: number;
  itbms: number;
  total: number;
  qb_total?: number;
  qb_balance?: number;
  lines: InvoiceLine[];
  creado_por_nombre: string;
  creado_por_email: string;
};

function buildHtml(p: NotifyPayload): string {
  const esQb = p.tipo === 'enviada_qb';
  const entidad = p.bill_to_society && p.society_name ? p.society_name : p.client_name;
  const tipoEntidad = p.bill_to_society && p.society_name ? 'Sociedad' : 'Cliente';
  const numFactura = esQb ? (p.qb_numero_factura ?? p.numero_factura ?? '—') : (p.numero_factura || 'Por asignar');
  const total = esQb ? (p.qb_total ?? p.total) : p.total;

  const headerColor = esQb ? '#0a7c4d' : '#c45f00';
  const headerText  = esQb ? 'FACTURA ENVIADA A QUICKBOOKS ✓' : 'NUEVA FACTURA REGISTRADA EN ANCORI';

  const linesHtml = p.lines.map(l =>
    `<tr>
      <td style="padding:4px 0;font-size:13px;color:#444">${l.descripcion || '—'}</td>
      <td style="padding:4px 0;font-size:13px;color:#444;text-align:right;white-space:nowrap">${fmtMoney(Number(l.importe ?? 0))}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="es">
<body style="font-family:Arial,sans-serif;color:#222;max-width:620px;margin:0 auto;padding:24px;background:#f9f9f9">
  <div style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)">
    <div style="background:${headerColor};padding:18px 24px">
      <p style="margin:0;color:#fff;font-size:16px;font-weight:bold">${headerText}</p>
    </div>
    <div style="padding:24px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:5px 0;font-size:13px;color:#666;width:160px">Número de Caso</td>
            <td style="padding:5px 0;font-size:13px;font-weight:bold">#${p.caso_numero}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#666">${tipoEntidad}</td>
            <td style="padding:5px 0;font-size:13px;font-weight:bold">${entidad}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#666">N° Factura${esQb ? ' QB' : ''}</td>
            <td style="padding:5px 0;font-size:13px">${numFactura}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#666">Fecha Factura</td>
            <td style="padding:5px 0;font-size:13px">${fmtDate(p.fecha_factura)}</td></tr>
        <tr><td style="padding:5px 0;font-size:13px;color:#666">Estado</td>
            <td style="padding:5px 0;font-size:13px">${p.estado}</td></tr>
      </table>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="font-size:12px;font-weight:bold;color:#888;text-transform:uppercase;margin:0 0 8px">Detalle de líneas</p>
      <table style="width:100%;border-collapse:collapse">
        ${linesHtml}
        <tr><td colspan="2"><hr style="border:none;border-top:1px solid #eee;margin:8px 0"/></td></tr>
        <tr>
          <td style="padding:3px 0;font-size:13px;color:#666">Subtotal</td>
          <td style="padding:3px 0;font-size:13px;text-align:right">${fmtMoney(p.subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;font-size:13px;color:#666">ITBMS</td>
          <td style="padding:3px 0;font-size:13px;text-align:right">${fmtMoney(p.itbms)}</td>
        </tr>
        <tr>
          <td style="padding:5px 0;font-size:15px;font-weight:bold">TOTAL</td>
          <td style="padding:5px 0;font-size:15px;font-weight:bold;text-align:right;color:${headerColor}">${fmtMoney(total)}</td>
        </tr>
        ${esQb && p.qb_balance != null ? `<tr>
          <td style="padding:3px 0;font-size:13px;color:#666">Balance Pendiente</td>
          <td style="padding:3px 0;font-size:13px;text-align:right">${fmtMoney(p.qb_balance)}</td>
        </tr>` : ''}
      </table>
      <hr style="border:none;border-top:1px solid #eee;margin:16px 0"/>
      <p style="font-size:12px;color:#888;margin:0">
        ${esQb ? 'Enviado' : 'Creado'} por: <strong>${p.creado_por_nombre}</strong>
        ${p.creado_por_nombre !== p.creado_por_email ? `(${p.creado_por_email})` : ''}
        &nbsp;·&nbsp; ${fmtDate(new Date().toISOString())}
      </p>
      <p style="font-size:11px;color:#bbb;margin:8px 0 0">Sistema Ancori — notificación automática</p>
    </div>
  </div>
</body>
</html>`;
}

function buildText(p: NotifyPayload): string {
  const esQb = p.tipo === 'enviada_qb';
  const entidad = p.bill_to_society && p.society_name ? p.society_name : p.client_name;
  const tipoEntidad = p.bill_to_society && p.society_name ? 'Sociedad' : 'Cliente';
  const numFactura = esQb ? (p.qb_numero_factura ?? p.numero_factura ?? '—') : (p.numero_factura || 'Por asignar');
  const total = esQb ? (p.qb_total ?? p.total) : p.total;
  const lineas = p.lines.map(l => `  ${l.descripcion || '—'}  ${fmtMoney(Number(l.importe ?? 0))}`).join('\n');

  return `${esQb ? 'FACTURA ENVIADA A QUICKBOOKS' : 'NUEVA FACTURA REGISTRADA EN ANCORI'}
${'─'.repeat(56)}
Número de Caso : #${p.caso_numero}
${tipoEntidad}      : ${entidad}
N° Factura     : ${numFactura}
Fecha Factura  : ${fmtDate(p.fecha_factura)}
Estado         : ${p.estado}

DETALLE
${'─'.repeat(56)}
${lineas}
${'─'.repeat(56)}
Subtotal       : ${fmtMoney(p.subtotal)}
ITBMS          : ${fmtMoney(p.itbms)}
TOTAL          : ${fmtMoney(total)}${esQb && p.qb_balance != null ? `\nBalance        : ${fmtMoney(p.qb_balance)}` : ''}

${esQb ? 'Enviado' : 'Creado'} por: ${p.creado_por_nombre} (${p.creado_por_email})
Sistema Ancori — notificación automática`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (FUNCTION_SECRET) {
    if (req.headers.get('x-ancori-secret') !== FUNCTION_SECRET) {
      return json(401, { error: 'unauthorized' });
    }
  }

  let payload: NotifyPayload;
  try {
    payload = await req.json() as NotifyPayload;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  if (!payload.caso_numero || !payload.client_name) {
    return json(400, { error: 'missing_fields', required: ['caso_numero', 'client_name'] });
  }

  const esQb = payload.tipo === 'enviada_qb';
  const entidad = payload.bill_to_society && payload.society_name ? payload.society_name : payload.client_name;
  const total = esQb ? (payload.qb_total ?? payload.total) : payload.total;
  const subject = esQb
    ? `[Ancori] Factura QB — Caso #${payload.caso_numero} | ${entidad} — ${fmtMoney(total)}`
    : `[Ancori] Nueva Factura — Caso #${payload.caso_numero} | ${entidad} — ${fmtMoney(total)}`;

  if (!SMTP_PASSWORD) {
    console.error('SMTP_PASSWORD no configurado');
    return json(500, { error: 'smtp_env_missing' });
  }

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
      to: INVOICE_TO,
      cc: INVOICE_CC,
      subject,
      html: buildHtml(payload),
      content: buildText(payload),
    });

    console.log('Invoice notification sent', { subject, to: INVOICE_TO, cc: INVOICE_CC });
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
