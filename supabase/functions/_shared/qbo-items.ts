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
  SubItem?: boolean;
  ParentRef?: { value?: string; name?: string };
  Sku?: string;
  Description?: string;
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

/**
 * Descarga todos los Items de QBO que NO son Category, en páginas de 1000.
 * Útil para sincronización masiva hacia service_items.
 */
export async function qboQueryAllServiceItems(
  realmId: string,
  accessToken: string
): Promise<QboItem[]> {
  const base = apiBase();
  const results: QboItem[] = [];
  const PAGE = 1000;
  let start = 1;

  while (true) {
    const sql = `select * from Item where Type != 'Category' STARTPOSITION ${start} MAXRESULTS ${PAGE}`;
    const url = `${base}/v3/company/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=${MINOR}`;
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
      throw new Error(`qbo_query_items_parse: ${text.slice(0, 300)}`);
    }
    if (!res.ok) {
      const fault = data.Fault as Record<string, unknown> | undefined;
      throw new Error(`qbo_query_items_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 400)}`);
    }
    const qr = data.QueryResponse as Record<string, unknown> | undefined;
    const page = (qr?.Item as QboItem[] | undefined) ?? [];
    results.push(...page);
    if (page.length < PAGE) break;
    start += PAGE;
  }

  return results;
}
