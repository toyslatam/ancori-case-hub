import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Secrets configurados en Supabase Dashboard → Edge Functions → Secrets
const SMTP_HOST       = Deno.env.get('SMTP_HOST')       ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT       = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USER       = Deno.env.get('SMTP_USER')       ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD   = Deno.env.get('SMTP_PASSWORD')   ?? '';
const SMTP_TLS        = Deno.env.get('SMTP_TLS')        !== 'false';
const MAIL_FROM       = Deno.env.get('MAIL_FROM')       ?? 'ancori@solucionesdetecnologia.com';
const MAIL_CC         = Deno.env.get('MAIL_CC')         ?? 'soporte@ancoriyasociados.com';
// Secreto propio (no JWT) para proteger la función sin --verify-jwt
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ancori-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Validar secreto propio (header x-ancori-secret)
  if (FUNCTION_SECRET) {
    const incoming = req.headers.get('x-ancori-secret') ?? '';
    if (incoming !== FUNCTION_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const {
      to,
      nombre,
      cliente,
      caso,
      estado,
      detalle,
      creado_por,
      asignado_a,
      enviado_por,
    } = await req.json();

    if (!to) {
      return new Response(JSON.stringify({ error: 'Campo "to" requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const casoDisplay = typeof caso === 'number'
      ? String(caso).padStart(7, '0')
      : String(caso ?? '');

    // ── Cuerpo HTML ──────────────────────────────────────────────────────
    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">
  <p style="font-size:15px">Le ha sido asignado un caso</p>
  <hr style="border:none;border-top:1px solid #ccc;margin:16px 0"/>
  <p style="font-size:14px">
    <strong>Cliente:</strong> ${cliente ?? '—'}&nbsp;&nbsp;
    <strong>Caso:</strong> ${casoDisplay}&nbsp;&nbsp;
    <strong>Estado:</strong> ${estado ?? '—'}.
  </p>
  <p style="font-size:14px"><strong>Detalle:</strong> ${detalle ?? '—'}.</p>
  <p style="font-size:14px">
    <strong>Caso Creado por:</strong> ${creado_por ?? '—'}&nbsp;&nbsp;
    <strong>Caso Asignado a:</strong> ${asignado_a ?? nombre ?? '—'}
  </p>
  <br/>
  <p style="font-size:14px"><strong>Enviado Por:</strong> ${enviado_por ?? creado_por ?? '—'}.</p>
</body>
</html>`;

    // ── Cuerpo texto plano ────────────────────────────────────────────────
    const textBody =
`Le ha sido asignado un caso

----------------------------------------------------------------
Cliente: ${cliente ?? '—'}  Caso: ${casoDisplay}  Estado: ${estado ?? '—'}.

Detalle: ${detalle ?? '—'}.

Caso Creado por: ${creado_por ?? '—'}  Caso Asignado a: ${asignado_a ?? nombre ?? '—'}


Enviado Por: ${enviado_por ?? creado_por ?? '—'}.`;

    // ── Conexión SMTP ─────────────────────────────────────────────────────
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port:     SMTP_PORT,
        tls:      SMTP_TLS,          // true → SSL directo (puerto 465)
        auth: {
          username: SMTP_USER,
          password: SMTP_PASSWORD,
        },
      },
    });

    const cc = MAIL_CC ? [MAIL_CC] : [];

    await client.send({
      from:    `Ancori Plataforma <${MAIL_FROM}>`,
      to,
      cc,
      subject: 'Le ha sido asignado un caso',
      html:    htmlBody,
      content: textBody,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('SMTP error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
