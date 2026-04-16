/**
 * Facturas QuickBooks Online API v3.
 */
const MINOR = '73';

function apiBase(): string {
  return (Deno.env.get('QBO_API_BASE') ?? 'https://quickbooks.api.intuit.com').replace(/\/+$/, '');
}

export type QboInvoiceFull = {
  Id?: string;
  SyncToken?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { value?: string; name?: string };
  EmailStatus?: string;
  PrivateNote?: string;
};

/**
 * GET /v3/company/{realmId}/invoice/{id}
 */
export async function qboGetInvoice(
  realmId: string,
  accessToken: string,
  invoiceId: string
): Promise<QboInvoiceFull> {
  const base = apiBase();
  const url = `${base}/v3/company/${realmId}/invoice/${encodeURIComponent(invoiceId)}?minorversion=${MINOR}`;
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
    throw new Error(`qbo_get_invoice_parse: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    const fault = data.Fault as Record<string, unknown> | undefined;
    throw new Error(`qbo_get_invoice_${res.status}: ${JSON.stringify(fault ?? data).slice(0, 400)}`);
  }
  const inv = data.Invoice as QboInvoiceFull | undefined;
  if (!inv?.Id) throw new Error('qbo_get_invoice_missing');
  return inv;
}

/**
 * GET /v3/company/{realmId}/invoice/{id}/pdf
 */
export async function qboGetInvoicePdf(
  realmId: string,
  accessToken: string,
  invoiceId: string
): Promise<ArrayBuffer> {
  const base = apiBase();
  const url = `${base}/v3/company/${realmId}/invoice/${encodeURIComponent(invoiceId)}/pdf?minorversion=${MINOR}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/pdf',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`qbo_get_invoice_pdf_${res.status}: ${text.slice(0, 400)}`);
  }
  return await res.arrayBuffer();
}
