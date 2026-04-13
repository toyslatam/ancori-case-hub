/**
 * Clientes (Customer) QuickBooks Online API v3.
 */
export type QboCustomer = {
  Id?: string;
  DisplayName?: string;
  CompanyName?: string;
  PrimaryEmailAddr?: { Address?: string };
  Active?: boolean;
};

const MINOR = '73';

function apiBase(): string {
  return (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');
}

export async function qboQueryAllCustomers(
  realmId: string,
  accessToken: string
): Promise<QboCustomer[]> {
  const base = apiBase();
  const out: QboCustomer[] = [];
  let start = 1;
  const page = 1000;

  while (true) {
    const sql = `SELECT * FROM Customer STARTPOSITION ${start} MAXRESULTS ${page}`;
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
      throw new Error(`qbo_query_parse: ${text.slice(0, 300)}`);
    }

    if (!res.ok) {
      const fault = data.Fault as Record<string, unknown> | undefined;
      const err = fault?.Error;
      throw new Error(`qbo_query_http_${res.status}: ${JSON.stringify(err ?? data).slice(0, 400)}`);
    }

    const qr = data.QueryResponse as Record<string, unknown> | undefined;
    const raw = qr?.Customer;
    const batch: QboCustomer[] = Array.isArray(raw) ? (raw as QboCustomer[]) : raw ? [raw as QboCustomer] : [];
    out.push(...batch);
    if (batch.length < page) break;
    start += page;
  }

  return out;
}

export async function qboCreateCustomer(
  realmId: string,
  accessToken: string,
  payload: {
    DisplayName: string;
    CompanyName?: string;
    PrimaryEmailAddr?: string;
  }
): Promise<{ id: string }> {
  const base = apiBase();
  const customer: Record<string, unknown> = {
    DisplayName: payload.DisplayName,
  };
  if (payload.CompanyName) customer.CompanyName = payload.CompanyName;
  if (payload.PrimaryEmailAddr) {
    customer.PrimaryEmailAddr = { Address: payload.PrimaryEmailAddr };
  }

  const url = `${base}/v3/company/${realmId}/customer?minorversion=${MINOR}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Customer: customer }),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`qbo_create_parse: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const fault = data.Fault as Record<string, unknown> | undefined;
    throw new Error(`qbo_create_http_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 500)}`);
  }

  const c = data.Customer as QboCustomer | undefined;
  const id = c?.Id;
  if (!id) throw new Error('qbo_create_missing_id');
  return { id: String(id) };
}

export type QboCustomerFull = QboCustomer & {
  SyncToken?: string;
  PrimaryPhone?: { FreeFormNumber?: string };
};

export async function qboGetCustomer(
  realmId: string,
  accessToken: string,
  customerId: string
): Promise<QboCustomerFull> {
  const base = apiBase();
  const url = `${base}/v3/company/${realmId}/customer/${encodeURIComponent(customerId)}?minorversion=${MINOR}`;
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
    throw new Error(`qbo_get_customer_parse: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const fault = data.Fault as Record<string, unknown> | undefined;
    throw new Error(`qbo_get_customer_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 400)}`);
  }
  const c = data.Customer as QboCustomerFull | undefined;
  if (!c?.Id) throw new Error('qbo_get_customer_missing');
  return c;
}

export async function qboSparseUpdateCustomer(
  realmId: string,
  accessToken: string,
  patch: {
    Id: string;
    SyncToken: string;
    DisplayName?: string;
    CompanyName?: string;
    PrimaryEmailAddr?: string;
    Active?: boolean;
  }
): Promise<QboCustomerFull> {
  const base = apiBase();
  const cust: Record<string, unknown> = {
    Id: patch.Id,
    SyncToken: patch.SyncToken,
    sparse: true,
  };
  if (patch.DisplayName != null) cust.DisplayName = patch.DisplayName;
  if (patch.CompanyName != null) cust.CompanyName = patch.CompanyName;
  if (patch.PrimaryEmailAddr != null) {
    cust.PrimaryEmailAddr = { Address: patch.PrimaryEmailAddr };
  }
  if (patch.Active != null) cust.Active = patch.Active;

  const url = `${base}/v3/company/${realmId}/customer?minorversion=${MINOR}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Customer: cust }),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`qbo_update_parse: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const fault = data.Fault as Record<string, unknown> | undefined;
    throw new Error(`qbo_update_http_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 500)}`);
  }
  const c = data.Customer as QboCustomerFull | undefined;
  if (!c?.Id) throw new Error('qbo_update_missing_customer');
  return c;
}

export function normalizeQboName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Customer.Id de QBO (texto) → columna societies.id_qb (int4).
 * Solo si el Id es un entero que cabe en PostgreSQL integer.
 */
export function qboCustomerIdToIdQb(qbId: string): number | null {
  const t = qbId.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  if (!Number.isFinite(n) || String(n) !== t) return null;
  if (n < -2147483648 || n > 2147483647) return null;
  return n;
}
