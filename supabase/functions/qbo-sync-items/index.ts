/**
 * Sincroniza Items de QuickBooks Online (tipo Service / Inventory / NonInventory)
 * hacia la tabla public.service_items.
 *
 * POST + Authorization: Bearer <QBO_CRON_SECRET>
 *        (o cabecera x-qbo-cron-secret: <QBO_CRON_SECRET>)
 *
 * Lógica:
 *  - Descarga todos los Items de QBO donde Type != 'Category'.
 *  - Hace upsert en service_items usando id_qb como clave de coincidencia.
 *  - Si el ítem ya existe: actualiza nombre, service_id, sku, descripcion, activo.
 *  - Si no existe: lo inserta con tipo_item = 'N/A' (editable después en la UI).
 *  - service_id se resuelve buscando el ParentRef.name del ítem QB en public.services.
 *
 * Devuelve: { inserted, updated, skipped, total_qbo }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { getValidQboAccessToken } from '../_shared/qbo-tokens.ts';
import { qboQueryAllServiceItems } from '../_shared/qbo-items.ts';

const JSON_HDR = { 'Content-Type': 'application/json; charset=utf-8' };
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-qbo-cron-secret',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HDR, ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  /* ── Autenticación ───────────────────────────────────────────────── */
  const cronSecret = Deno.env.get('QBO_CRON_SECRET') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const headerSecret = req.headers.get('x-qbo-cron-secret') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';

  if (!cronSecret || (bearer !== cronSecret && headerSecret !== cronSecret)) {
    return json(401, { error: 'unauthorized' });
  }

  /* ── Variables de entorno ────────────────────────────────────────── */
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const clientId    = Deno.env.get('QBO_CLIENT_ID');
  const clientSecret = Deno.env.get('QBO_CLIENT_SECRET');

  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret) {
    return json(500, { error: 'missing_env' });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  /* ── Token QBO ───────────────────────────────────────────────────── */
  let accessToken: string;
  let realmId: string;
  try {
    const tok = await getValidQboAccessToken(supabase, clientId, clientSecret);
    accessToken = tok.accessToken;
    realmId     = tok.realmId;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(503, { error: 'qbo_token', detail: msg });
  }

  /* ── Obtener items desde QBO ─────────────────────────────────────── */
  let qboItems;
  try {
    qboItems = await qboQueryAllServiceItems(realmId, accessToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(502, { error: 'qbo_fetch_items', detail: msg });
  }

  /* ── Cargar tablas auxiliares de Supabase ────────────────────────── */
  const [{ data: dbItems }, { data: dbServices }] = await Promise.all([
    supabase.from('service_items').select('id, id_qb, tipo_item'),
    supabase.from('services').select('id, nombre'),
  ]);

  // Índice id_qb → { id, tipo_item }
  const existingByIdQb = new Map<number, { id: string; tipo_item: string }>();
  for (const r of dbItems ?? []) {
    if (r.id_qb != null) {
      existingByIdQb.set(Number(r.id_qb), { id: r.id as string, tipo_item: r.tipo_item as string });
    }
  }

  // Índice nombre normalizado → service.id
  const serviceByName = new Map<string, string>();
  for (const s of dbServices ?? []) {
    const key = String(s.nombre ?? '').trim().toLowerCase();
    if (key) serviceByName.set(key, s.id as string);
  }

  /* ── Procesar cada ítem ──────────────────────────────────────────── */
  let inserted = 0;
  let updated  = 0;
  let skipped  = 0;

  for (const item of qboItems) {
    if (!item.Id) { skipped++; continue; }

    const idQb  = Number(item.Id);
    const nombre = (item.Name ?? '').trim();
    if (!nombre) { skipped++; continue; }

    const parentName = (item.ParentRef?.name ?? '').trim().toLowerCase();
    const serviceId  = parentName ? (serviceByName.get(parentName) ?? null) : null;
    const activo     = item.Active !== false;
    const sku        = item.Sku?.trim() || null;
    const descripcion = item.Description?.trim() || null;

    const existing = existingByIdQb.get(idQb);

    if (existing) {
      /* UPDATE — preserva tipo_item ya asignado por el usuario */
      const { error } = await supabase
        .from('service_items')
        .update({ nombre, service_id: serviceId, sku, descripcion, activo })
        .eq('id', existing.id);
      if (!error) updated++;
      else skipped++;
    } else {
      /* INSERT — tipo_item por defecto N/A */
      const newId = crypto.randomUUID();
      const { error } = await supabase.from('service_items').insert({
        id: newId,
        nombre,
        service_id: serviceId,
        tipo_item: 'N/A',
        id_qb: idQb,
        sku,
        descripcion,
        activo,
      });
      if (!error) inserted++;
      else skipped++;
    }
  }

  return json(200, {
    ok: true,
    realm_id: realmId,
    total_qbo: qboItems.length,
    inserted,
    updated,
    skipped,
  });
});
