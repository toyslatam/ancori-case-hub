import { getSupabase } from '@/lib/supabaseClient';

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET as string;

async function callProxy<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/sharepoint-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ancori-secret': FUNCTION_SECRET,
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type SPItem = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime: string;
  lastModifiedBy?: { user?: { displayName?: string } };
  file?: { mimeType: string };
  folder?: { childCount: number };
  webUrl?: string;
};

export type ListFilesResult = {
  items: SPItem[];
  drive_id: string;
  folder_not_found?: boolean;
};

export function listSharePointFiles(
  folderName: string,
  driveId?: string,
  subfolder?: string,
): Promise<ListFilesResult> {
  return callProxy('list_files', { society_name: folderName, drive_id: driveId, subfolder });
}

export function getSharePointEditLink(itemId: string, driveId: string): Promise<{ url: string }> {
  return callProxy('get_edit_link', { item_id: itemId, drive_id: driveId });
}

export function getSharePointViewLink(itemId: string, driveId: string): Promise<{ url: string }> {
  return callProxy('get_view_link', { item_id: itemId, drive_id: driveId });
}

export async function uploadSharePointFile(
  folderName: string,
  file: File,
  driveId?: string,
): Promise<{ id: string; name: string; webUrl: string }> {
  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return callProxy('upload_file', {
    society_name: folderName,
    filename: file.name,
    file_base64: base64,
    mime_type: file.type || 'application/octet-stream',
    drive_id: driveId,
  });
}

export function listSharePointSocietyFolders(
  driveId?: string,
): Promise<{ folders: string[]; drive_id: string }> {
  return callProxy('list_society_folders', { drive_id: driveId });
}

// ── Mapeos persistidos en Supabase ────────────────────────────────────────────

export type SpFolderMapping = {
  entity_id: string;
  entity_type: string;
  entity_name: string;
  sp_folder_name: string;
};

export async function getSpMapping(entityId: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from('sp_folder_mappings')
      .select('sp_folder_name')
      .eq('entity_id', entityId)
      .maybeSingle();
    return (data as { sp_folder_name: string } | null)?.sp_folder_name ?? null;
  } catch {
    return null;
  }
}

export async function saveSpMapping(
  entityId: string,
  entityType: string,
  entityName: string,
  spFolderName: string,
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from('sp_folder_mappings').upsert(
    { entity_id: entityId, entity_type: entityType, entity_name: entityName, sp_folder_name: spFolderName, updated_at: new Date().toISOString() },
    { onConflict: 'entity_id' },
  );
}
