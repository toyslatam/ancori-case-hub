/**
 * Items QuickBooks Online API v3 (incl. Type = Category).
 * Las categorías de productos/servicios en QBO son Items con Type "Category".
 */
const MINOR = '73';

function apiBase(): string {
  return (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');
}

export type QboItem = {
  Id?: string;
  Name?: string;
  FullyQualifiedName?: string;
  Type?: string;
  Active?: boolean;
  SyncToken?: string;
};

/**
 * GET /v3/company/{realmId}/item/{id}
 */
export async function qboGetItem(
  realmId: string,
  accessToken: string,
  itemId: string
): Promise<QboItem> {
  const base = apiBase();
  const url = `${base}/v3/company/${realmId}/item/${encodeURIComponent(itemId)}?minorversion=${MINOR}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`qbo_get_item_parse: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const fault = data.Fault as Record<string, unknown> | undefined;
    throw new Error(`qbo_get_item_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 400)}`);
  }
  const item = data.Item as QboItem | undefined;
  if (!item?.Id) throw new Error('qbo_get_item_missing');
  return item;
}
