/**
 * Worker async: procesa jobs pendientes de sincronización de Sociedades → QuickBooks.
 *
 * Auth: Authorization: Bearer <QBO_CRON_SECRET>
 *
 * Flujo:
 * - Lee jobs pending (due) de public.qbo_society_sync_jobs
 * - Carga la sociedad desde public.societies
 * - Llama a la Edge Function qbo-society-push (server-side) para upsert en QBO
 * - Actualiza:
 *    - job.status = success|error (+ attempts, last_error)
 *    - societies.qbo_sync_status = success|error (+ timestamps / last_error)
 *
 * Nota: este worker NO es invocado por el frontend. Se recomienda programarlo con Supabase Cron.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HDR,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    },
  });
}

function authorize(req: Request): boolean {
  const cron = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(cron && bearer === cron);
}

function functionsBaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' } });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!authorize(req)) return json(401, { error: 'unauthorized' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  if (!supabaseUrl || !serviceKey || !cronSecret) return json(500, { error: 'missing_env' });

  const supabase = createClient(supabaseUrl, serviceKey);
  const root = functionsBaseUrl(supabaseUrl);

  let body: { limit?: number } = {};
  try { body = (await req.json().catch(() => ({}))) as typeof body; } catch { /* ignore */ }
  const limit = Math.max(1, Math.min(50, Number(body.limit ?? 10)));

  const nowIso = new Date().toISOString();

  const { data: jobs, error: jobsErr } = await supabase
    .from('qbo_society_sync_jobs')
    .select('*')
    .eq('status', 'pending')
    .lte('next_run_at', nowIso)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (jobsErr) return json(500, { error: 'jobs_read_failed', detail: jobsErr.message });
  if (!jobs?.length) return json(200, { ok: true, processed: 0 });

  let processed = 0;
  const results: Array<{ job_id: string; society_id: string; ok: boolean; detail?: string }> = [];

  for (const j of jobs as any[]) {
    const jobId = String(j.id);
    const societyId = String(j.society_id);

    try {
      const { data: s, error: sErr } = await supabase
        .from('societies')
        .select('id, nombre, razon_social, correo, activo, quickbooks_customer_id')
        .eq('id', societyId)
        .maybeSingle();

      if (sErr || !s) {
        throw new Error(`society_not_found: ${sErr?.message ?? 'missing'}`);
      }

      const res = await fetch(`${root}/qbo-society-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cronSecret}`,
        },
        body: JSON.stringify({
          operation: 'upsert',
          society: {
            id: s.id,
            nombre: s.nombre,
            razon_social: s.razon_social ?? '',
            correo: s.correo ?? '',
            activo: s.activo ?? true,
            quickbooks_customer_id: s.quickbooks_customer_id ?? null,
          },
        }),
      });

      const payload = await res.json().catch(() => ({})) as { error?: string; detail?: string };
      if (!res.ok) {
        throw new Error(payload.detail || payload.error || `qbo_push_http_${res.status}`);
      }

      await supabase
        .from('qbo_society_sync_jobs')
        .update({ status: 'success', updated_at: new Date().toISOString() })
        .eq('id', jobId);

      await supabase
        .from('societies')
        .update({
          qbo_sync_status: 'success',
          qbo_sync_last_error: null,
          qbo_sync_last_success_at: new Date().toISOString(),
        })
        .eq('id', societyId);

      processed++;
      results.push({ job_id: jobId, society_id: societyId, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const attempts = Number(j.attempts ?? 0) + 1;
      const backoffMin = Math.min(60, 2 ** Math.min(attempts, 6)); // 2,4,8,...,64 → cap 60
      const next = new Date(Date.now() + backoffMin * 60_000).toISOString();

      await supabase
        .from('qbo_society_sync_jobs')
        .update({
          status: 'error',
          attempts,
          last_error: msg.slice(0, 500),
          next_run_at: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      await supabase
        .from('societies')
        .update({
          qbo_sync_status: 'error',
          qbo_sync_attempts: attempts,
          qbo_sync_last_error: msg.slice(0, 500),
          qbo_sync_last_attempt_at: new Date().toISOString(),
        })
        .eq('id', societyId);

      processed++;
      results.push({ job_id: jobId, society_id: societyId, ok: false, detail: msg });
    }
  }

  return json(200, { ok: true, processed, results });
});

