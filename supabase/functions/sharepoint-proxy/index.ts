import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const TENANT_ID      = Deno.env.get('MSGRAPH_TENANT_ID')      ?? '';
const CLIENT_ID      = Deno.env.get('MSGRAPH_CLIENT_ID')       ?? '';
const CLIENT_SECRET  = Deno.env.get('MSGRAPH_CLIENT_SECRET')   ?? '';
const FUNCTION_SECRET = Deno.env.get('FUNCTION_SECRET')        ?? '';

const SP_HOST          = 'ancoriyasociados.sharepoint.com';
const SP_SITE_PATH     = 'sites/Corporativo';
const DOCS_LIBRARY     = 'Documentos';
const SOCIETIES_FOLDER = 'SOCIEDADES Y FUNDACIONES';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ancori-secret',
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Token cache ───────────────────────────────────────────────────────────────
let tokenCache: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.value;

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`token_error HTTP ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  tokenCache = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.value;
}

// ── Site + Drive cache ────────────────────────────────────────────────────────
let cachedSiteId:  string | null = null;
let cachedDriveId: string | null = null;

async function getSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${SP_HOST}:/${SP_SITE_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`site_lookup HTTP ${res.status}`);
  const data = await res.json();
  cachedSiteId = data.id as string;
  return cachedSiteId;
}

async function getDriveId(token: string, siteId: string): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`drives_lookup HTTP ${res.status}`);
  const data = await res.json();
  const drives = data.value as { id: string; name: string }[];
  const drive = drives.find(d => d.name === DOCS_LIBRARY || d.name === 'Documents') ?? drives[0];
  if (!drive) throw new Error('drive_not_found');
  cachedDriveId = drive.id;
  return cachedDriveId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const enc = (s: string) => encodeURIComponent(s);
const encodePath = (parts: string[]) => parts.map(enc).join('/');

async function graphGet(token: string, url: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`graph_get HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function listFiles(token: string, driveId: string, societyName: string, subfolder?: string) {
  const pathParts = subfolder
    ? [SOCIETIES_FOLDER, societyName, subfolder]
    : [SOCIETIES_FOLDER, societyName];

  const path = encodePath(pathParts);
  const select = 'id,name,size,lastModifiedDateTime,lastModifiedBy,file,folder,webUrl';
  const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/children?$select=${select}&$orderby=name&$top=200`;

  const data = await graphGet(token, url);
  if (!data) return { items: [], folder_not_found: true, drive_id: driveId };
  return { items: data.value ?? [], drive_id: driveId };
}

async function createLink(token: string, driveId: string, itemId: string, type: 'view' | 'edit') {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/createLink`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, scope: 'organization' }),
    },
  );
  if (!res.ok) throw new Error(`create_link HTTP ${res.status}`);
  const data = await res.json();
  return { url: data.link?.webUrl as string };
}

async function uploadFile(
  token: string, driveId: string,
  societyName: string, filename: string,
  fileBase64: string, mimeType: string,
) {
  const pathParts = [SOCIETIES_FOLDER, societyName, filename];
  const path = encodePath(pathParts);
  const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/content`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      body: bytes,
    },
  );
  if (!res.ok) throw new Error(`upload HTTP ${res.status} — ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return { id: data.id as string, name: data.name as string, webUrl: data.webUrl as string };
}

// ── Serve ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (FUNCTION_SECRET && req.headers.get('x-ancori-secret') !== FUNCTION_SECRET) {
    return json(401, { error: 'unauthorized' });
  }

  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    return json(500, { error: 'graph_credentials_missing' });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: 'invalid_json' }); }

  const { action, society_name, item_id, drive_id, filename, file_base64, mime_type, subfolder } = body as Record<string, string | undefined>;

  try {
    const token   = await getToken();
    const siteId  = await getSiteId(token);
    const driveId = drive_id ?? await getDriveId(token, siteId);

    switch (action) {
      case 'list_files': {
        if (!society_name) return json(400, { error: 'society_name_required' });
        const result = await listFiles(token, driveId, society_name, subfolder);
        return json(200, result);
      }
      case 'get_edit_link': {
        if (!item_id) return json(400, { error: 'item_id_required' });
        const result = await createLink(token, driveId, item_id, 'edit');
        return json(200, result);
      }
      case 'get_view_link': {
        if (!item_id) return json(400, { error: 'item_id_required' });
        const result = await createLink(token, driveId, item_id, 'view');
        return json(200, result);
      }
      case 'upload_file': {
        if (!society_name || !filename || !file_base64) {
          return json(400, { error: 'missing_fields', required: ['society_name', 'filename', 'file_base64'] });
        }
        const result = await uploadFile(token, driveId, society_name, filename, file_base64, mime_type ?? 'application/octet-stream');
        return json(200, result);
      }
      case 'list_society_folders': {
        const path = encodePath([SOCIETIES_FOLDER]);
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${path}:/children?$select=id,name,folder&$orderby=name&$top=500`;
        const data = await graphGet(token, url);
        if (!data) return json(200, { folders: [] });
        const folders = (data.value as { name: string; folder?: unknown }[])
          .filter(i => i.folder)
          .map(i => i.name);
        return json(200, { folders, drive_id: driveId });
      }
      default:
        return json(400, { error: 'unknown_action', action });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sharepoint-proxy]', msg);
    return json(500, { error: 'graph_error', detail: msg });
  }
});
