/** Respuesta típica de la función Edge `qbo-create-invoice`. */
export type QboCreateInvoiceJson = {
  ok?: boolean;
  qb_invoice_id?: string;
  doc_number?: string;
  total_amt?: number;
  balance?: number;
  error?: string;
  detail?: string;
};

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * POST a `qbo-create-invoice` con tiempo máximo de espera (evita UI colgada si la Edge Function no responde).
 */
export async function postQboCreateInvoice(
  supabaseUrl: string,
  secret: string,
  invoiceId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ res: Response; data: QboCreateInvoiceJson }> {
  const base = supabaseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/qbo-create-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ancori-secret': secret },
      body: JSON.stringify({ invoice_id: invoiceId }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(tid);
  }

  const text = await res.text();
  let data: QboCreateInvoiceJson = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text) as QboCreateInvoiceJson;
    } catch {
      data = {
        ok: false,
        detail: `Respuesta no JSON (${res.status}): ${text.slice(0, 400)}`,
      };
    }
  }
  return { res, data };
}
