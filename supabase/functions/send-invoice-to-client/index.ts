// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SMTP_HOST       = Deno.env.get('SMTP_HOST')     ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT       = Number(Deno.env.get('SMTP_PORT') ?? '587');
const SMTP_USER       = Deno.env.get('SMTP_USER')     ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD   = Deno.env.get('SMTP_PASSWORD') ?? '';
const MAIL_FROM       = Deno.env.get('MAIL_FROM')     ?? 'ancori@solucionesdetecnologia.com';
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';
const FIRMA_IMG_URL   = Deno.env.get('FIRMA_IMG_URL') ?? '';

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
  pdf_base64?: string;  // PDF ya en base64 (enviado por el browser — preferido)
  pdf_url?: string;     // Fallback: URL firmada para descargar el PDF aquí
  invoice_number?: string;
  client_name?: string;
  total?: number;
  fecha_factura?: string;
};

// ── Descargar PDF ────────────────────────────────────────────────────────────

async function fetchPdfBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`fetchPdfBase64: HTTP ${res.status}`);
      return null;
    }
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length === 0) return null;
    console.log(`PDF: ${bytes.length} bytes`);
    let b64 = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      b64 += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    return btoa(b64);
  } catch (e) {
    console.error('fetchPdfBase64:', String(e));
    return null;
  }
}

// ── HTML del correo ──────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  const bodyHtml = p.body
    ? `<p style="margin:0;font-size:14px;color:#333;line-height:1.8">${escHtml(p.body).replace(/\n/g, '<br/>')}</p>`
    : '';

  const firmaHtml = FIRMA_IMG_URL
    ? `<img src="${FIRMA_IMG_URL}" alt="Ancori" style="max-width:440px;display:block;margin-top:4px"/>`
    : `<p style="margin:4px 0;font-size:13px;color:#333"><strong>Vanessa Su&#225;rez</strong><br/>Asistente Administrativa | Ancori y Asociados</p>`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/>
<style>body,p{font-family:Arial,Helvetica,sans-serif;color:#333}a{color:#333;text-decoration:none}</style>
</head>
<body style="margin:0;padding:24px;background:#ffffff;max-width:600px">
<p style="margin:0 0 10px;font-size:14px;color:#333">${greeting}</p>
${detalles ? `<p style="margin:10px 0 16px;font-size:14px;color:#333">${detalles}</p>` : ''}
${bodyHtml}
<br/>
<hr style="border:none;border-top:1px solid #ddd;margin:20px 0 16px"/>
${firmaHtml}
</body></html>`;
}

// ── Construcción MIME ────────────────────────────────────────────────────────

function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
  }
  return btoa(bin);
}

function splitBase64Lines(b64: string): string {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? b64;
}

function buildMime(opts: {
  from: string; to: string; subject: string; html: string;
  pdfBase64?: string; pdfFilename?: string;
}): string {
  const subj = `=?UTF-8?B?${toBase64Utf8(opts.subject)}?=`;

  if (!opts.pdfBase64) {
    // Mensaje simple (sin adjunto): multipart/alternative HTML
    return [
      `From: ${opts.from}`,
      `To: ${opts.to}`,
      `Subject: ${subj}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      splitBase64Lines(toBase64Utf8(opts.html)),
    ].join('\r\n');
  }

  // Con adjunto: multipart/mixed
  const bnd = `==Boundary_${Date.now().toString(36)}==`;
  const lines: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${bnd}"`,
    '',
    `--${bnd}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    splitBase64Lines(toBase64Utf8(opts.html)),
    '',
    `--${bnd}`,
    'Content-Type: application/pdf',
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${opts.pdfFilename ?? 'factura.pdf'}"`,
    '',
    splitBase64Lines(opts.pdfBase64),
    '',
    `--${bnd}--`,
  ];
  return lines.join('\r\n');
}

// ── Cliente SMTP puro (Deno TCP + STARTTLS) ──────────────────────────────────

function extractEmailAddr(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return m ? m[1].trim() : addr.trim();
}

async function smtpSend(opts: {
  host: string; port: number;
  user: string; pass: string;
  from: string; to: string;
  message: string;
}): Promise<void> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // Buffered line reader — works for both plain and TLS connections
  let leftover = '';
  const tmpBuf = new Uint8Array(8192);

  async function readLine(conn: Deno.TcpConn | Deno.TlsConn): Promise<string> {
    while (true) {
      const idx = leftover.indexOf('\r\n');
      if (idx !== -1) {
        const line = leftover.slice(0, idx);
        leftover = leftover.slice(idx + 2);
        return line;
      }
      const n = await conn.read(tmpBuf);
      if (n === null) throw new Error('SMTP: connection closed unexpectedly');
      leftover += dec.decode(tmpBuf.subarray(0, n));
    }
  }

  // Read a full SMTP response (handles multi-line "NNN-..." responses)
  async function readResponse(conn: Deno.TcpConn | Deno.TlsConn): Promise<{ code: number; text: string }> {
    let fullText = '';
    while (true) {
      const line = await readLine(conn);
      fullText += line + '\n';
      const code = parseInt(line.slice(0, 3), 10);
      const isContinued = line.charAt(3) === '-'; // "250-..." = more lines follow
      if (!isContinued) {
        if (code >= 400) throw new Error(`SMTP ${code}: ${line.slice(4).trim()}`);
        return { code, text: fullText };
      }
    }
  }

  async function sendCmd(
    conn: Deno.TcpConn | Deno.TlsConn, cmd: string
  ): Promise<{ code: number; text: string }> {
    console.log('SMTP →', cmd.slice(0, 80));
    await conn.write(enc.encode(cmd + '\r\n'));
    const resp = await readResponse(conn);
    console.log('SMTP ←', `${resp.code} ${resp.text.split('\n')[0].slice(4).slice(0, 60)}`);
    return resp;
  }

  const plain = await Deno.connect({ hostname: opts.host, port: opts.port });
  let tls: Deno.TlsConn | null = null;

  try {
    await readResponse(plain);                         // 220 banner

    const ehlo1 = await sendCmd(plain, `EHLO ${opts.host}`);
    const supportsStartTls = ehlo1.text.toUpperCase().includes('STARTTLS');

    let active: Deno.TcpConn | Deno.TlsConn = plain;

    if (supportsStartTls) {
      await sendCmd(plain, 'STARTTLS');                // 220 Go ahead
      leftover = '';                                   // discard pre-TLS buffer
      tls = await Deno.startTls(plain, { hostname: opts.host });
      active = tls;
      await sendCmd(active, `EHLO ${opts.host}`);      // re-EHLO over TLS
    }

    // AUTH LOGIN
    await sendCmd(active, 'AUTH LOGIN');               // 334 Username:
    await sendCmd(active, btoa(opts.user));            // 334 Password:
    await sendCmd(active, btoa(opts.pass));            // 235 Authenticated

    // Envelope
    const fromAddr = extractEmailAddr(opts.from);
    const toAddr   = extractEmailAddr(opts.to);
    await sendCmd(active, `MAIL FROM:<${fromAddr}>`);
    await sendCmd(active, `RCPT TO:<${toAddr}>`);
    await sendCmd(active, 'DATA');                     // 354 Start input

    // Message body (SMTP dot-stuffing: lines starting with "." get an extra ".")
    const stuffed = opts.message.replace(/\r\n\./g, '\r\n..');
    await active.write(enc.encode(stuffed + '\r\n.\r\n'));
    await readResponse(active);                        // 250 OK

    await sendCmd(active, 'QUIT');                     // 221 Bye
  } finally {
    if (tls) try { tls.close(); } catch { /* ignore */ }
    else      try { plain.close(); } catch { /* ignore */ }
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

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

  // Obtener PDF: primero desde base64 directo (browser lo descargó), luego desde URL como fallback
  let pdfBase64: string | null = null;
  if (payload.pdf_base64 && payload.pdf_base64.length > 0) {
    pdfBase64 = payload.pdf_base64;
    console.log(`PDF recibido del browser: ${pdfBase64.length} chars base64`);
  } else if (payload.pdf_url) {
    console.log('Descargando PDF desde URL:', payload.pdf_url.slice(0, 100));
    pdfBase64 = await fetchPdfBase64(payload.pdf_url);
  }
  const hasPdf = pdfBase64 !== null;

  const subject = payload.subject?.trim()
    || `Factura${payload.invoice_number ? ` No. ${payload.invoice_number}` : ''}${payload.client_name ? ` - ${payload.client_name}` : ''}`;

  const pdfFilename = `Factura${payload.invoice_number ? `-${payload.invoice_number}` : ''}.pdf`;

  const message = buildMime({
    from:       `Ancori y Asociados <${MAIL_FROM}>`,
    to:          payload.to_email.trim(),
    subject,
    html:        buildHtml(payload),
    pdfBase64:   pdfBase64 ?? undefined,
    pdfFilename,
  });

  try {
    await smtpSend({
      host: SMTP_HOST,
      port: SMTP_PORT,
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
      from: MAIL_FROM,
      to:   payload.to_email.trim(),
      message,
    });
    console.log('OK', { to: payload.to_email, hasPdf });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('SMTP error:', msg);
    return json(500, { error: 'smtp_error', detail: msg });
  }

  return json(200, { ok: true, pdf_attached: hasPdf });
});
