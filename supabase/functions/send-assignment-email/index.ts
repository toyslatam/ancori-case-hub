import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// Secrets configurados en Supabase Dashboard → Edge Functions → Secrets
const SMTP_HOST       = Deno.env.get('SMTP_HOST')       ?? 'smtp.solucionesdetecnologia.com';
const SMTP_PORT_ENV   = Deno.env.get('SMTP_PORT')       ?? '587';
const SMTP_PORT       = 587;
const SMTP_USER       = Deno.env.get('SMTP_USER')       ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD   = Deno.env.get('SMTP_PASSWORD')   ?? '';
// En Supabase Edge (Deno), denomailer es más estable con STARTTLS (587 + tls:false)
// que con SSL implícito (465 + tls:true), que puede fallar con BadResource.
const SMTP_TLS        = false;
const MAIL_FROM       = Deno.env.get('MAIL_FROM')       ?? 'ancori@solucionesdetecnologia.com';
const MAIL_CC         = Deno.env.get('MAIL_CC')         ?? 'soporte@ancoriyasociados.com';
// Secreto propio (no JWT) para proteger la función sin --verify-jwt
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ancori-secret',
};

function smtpErrorKind(err: unknown): 'smtp_auth_error' | 'smtp_connection_error' | 'smtp_error' {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes('auth') ||
    lower.includes('authentication') ||
    lower.includes('credentials') ||
    lower.includes('login') ||
    lower.includes('username') ||
    lower.includes('password')
  ) {
    return 'smtp_auth_error';
  }

  if (
    lower.includes('badresource') ||
    lower.includes('bad resource') ||
    lower.includes('connection') ||
    lower.includes('connect') ||
    lower.includes('starttls') ||
    lower.includes('tls') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('econn') ||
    lower.includes('dns')
  ) {
    return 'smtp_connection_error';
  }

  return 'smtp_error';
}

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

    const configuredPort = Number(SMTP_PORT_ENV);
    if (!SMTP_HOST || Number.isNaN(configuredPort) || !SMTP_USER || !SMTP_PASSWORD) {
      console.error('SMTP ENV ERROR:', {
        hasHost: Boolean(SMTP_HOST),
        configuredPort: SMTP_PORT_ENV,
        hasUser: Boolean(SMTP_USER),
        hasPassword: Boolean(SMTP_PASSWORD),
      });
      return new Response(JSON.stringify({ error: 'smtp_env_missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('SMTP CONFIG:', SMTP_HOST, SMTP_PORT);
    if (configuredPort === 465 || SMTP_TLS) {
      console.warn('SMTP CONFIG WARNING: SMTP_PORT env no debe usar SSL implicito; se fuerza conexion efectiva 587 + tls=false.');
    }

    // ── Conexión SMTP ─────────────────────────────────────────────────────
    let client: SMTPClient | null = null;
    try {
      client = new SMTPClient({
        connection: {
          hostname: SMTP_HOST,
          port:     587,
          tls:      false,
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

      console.log('SMTP SEND OK:', { to, ccCount: cc.length });
    } catch (smtpErr) {
      const kind = smtpErrorKind(smtpErr);
      console.error('SMTP SEND ERROR:', {
        kind,
        message: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
      });
      return new Response(JSON.stringify({
        error: kind,
        detail: smtpErr instanceof Error ? smtpErr.message : String(smtpErr),
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (closeErr) {
          console.warn('SMTP CLOSE WARNING:', closeErr instanceof Error ? closeErr.message : String(closeErr));
        }
      }
    }

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
