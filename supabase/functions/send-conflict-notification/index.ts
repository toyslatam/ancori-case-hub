/**
 * Envía notificación por email cuando se detectan conflictos de sync.
 *
 * POST JSON:
 *   {
 *     "to": "email@example.com",
 *     "society_name": "2M Investment Traden Corp.",
 *     "conflicts": [
 *       { "field": "ruc", "supabase_value": "155786406-2-2025", "quickbooks_value": "" },
 *       ...
 *     ]
 *   }
 */
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SMTP_HOST     = Deno.env.get('SMTP_HOST')     ?? 'mail.solucionesdetecnologia.com';
const SMTP_PORT     = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USER     = Deno.env.get('SMTP_USER')     ?? 'ancori@solucionesdetecnologia.com';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';
const SMTP_TLS      = Deno.env.get('SMTP_TLS')      !== 'false';
const MAIL_FROM     = Deno.env.get('MAIL_FROM')     ?? 'ancori@solucionesdetecnologia.com';
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET') ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-ancori-secret, x-client-info',
};

// Nombres legibles para cada campo
const FIELD_LABELS: Record<string, string> = {
  ruc: 'RUC',
  dv: 'DV',
  nit: 'NIT',
  tipo_sociedad: 'Tipo de Sociedad',
  direccion: 'Direccion',
  presidente_name: 'Presidente',
  tesorero_name: 'Tesorero',
  secretario_name: 'Secretario',
  nombre: 'Nombre',
  razon_social: 'Razon Social',
  correo: 'Correo',
};

type ConflictItem = {
  field: string;
  supabase_value: string;
  quickbooks_value: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  if (FUNCTION_SECRET) {
    const incoming = req.headers.get('x-ancori-secret') ?? '';
    if (incoming !== FUNCTION_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const { to, society_name, conflicts } = (await req.json()) as {
      to: string;
      society_name: string;
      conflicts: ConflictItem[];
    };

    if (!to || !conflicts?.length) {
      return new Response(JSON.stringify({ error: 'Campos to y conflicts requeridos' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const rows = conflicts.map((c) => {
      const label = FIELD_LABELS[c.field] ?? c.field;
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd">${label}</td>
        <td style="padding:8px;border:1px solid #ddd">${c.supabase_value || '<em>vacio</em>'}</td>
        <td style="padding:8px;border:1px solid #ddd">${c.quickbooks_value || '<em>vacio</em>'}</td>
      </tr>`;
    }).join('\n');

    const htmlBody = `
<!DOCTYPE html>
<html lang="es">
<body style="font-family:Arial,sans-serif;color:#222;max-width:700px;margin:0 auto;padding:24px">
  <h2 style="color:#ea580c;font-size:18px">Conflictos de Sincronizacion Detectados</h2>
  <p style="font-size:14px">
    Se han detectado <strong>${conflicts.length}</strong> diferencias entre
    <strong>Plataforma Ancori</strong> y <strong>QuickBooks</strong>
    para la sociedad <strong>${society_name}</strong>.
  </p>
  <p style="font-size:14px">
    Por favor ingrese a la seccion <strong>Conciliacion</strong> en la plataforma
    para decidir cual valor prevalece.
  </p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
    <thead>
      <tr style="background:#f8f9fa">
        <th style="padding:8px;border:1px solid #ddd;text-align:left">Campo</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left">Valor Ancori</th>
        <th style="padding:8px;border:1px solid #ddd;text-align:left">Valor QuickBooks</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:12px;color:#666;margin-top:24px">
    Este correo fue generado automaticamente por Plataforma Ancori.
  </p>
</body>
</html>`;

    const textBody = `Conflictos de Sincronizacion - ${society_name}

Se detectaron ${conflicts.length} diferencias entre Ancori y QuickBooks.

${conflicts.map((c) => `${FIELD_LABELS[c.field] ?? c.field}: Ancori="${c.supabase_value || '(vacio)'}" vs QB="${c.quickbooks_value || '(vacio)'}"`).join('\n')}

Ingrese a la seccion Conciliacion en la plataforma para resolver.`;

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST,
        port: SMTP_PORT,
        tls: SMTP_TLS,
        auth: { username: SMTP_USER, password: SMTP_PASSWORD },
      },
    });

    await client.send({
      from: `Ancori Plataforma <${MAIL_FROM}>`,
      to,
      subject: `Conflictos de Sync: ${society_name} (${conflicts.length})`,
      html: htmlBody,
      content: textBody,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true, sent_to: to }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('SMTP conflict notification error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
