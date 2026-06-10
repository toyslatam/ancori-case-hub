import type { InvoiceLine } from '@/data/mockData';

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET as string;

export type InvoiceNotifyPayload = {
  tipo: 'creacion' | 'enviada_qb';
  caso_numero: string;
  client_name: string;
  society_name?: string;
  bill_to_society: boolean;
  numero_factura?: string;
  qb_numero_factura?: string;
  fecha_factura?: string;
  estado: string;
  subtotal: number;
  itbms: number;
  total: number;
  qb_total?: number;
  qb_balance?: number;
  lines: Array<{ descripcion: string; importe: number }>;
  creado_por_nombre: string;
  creado_por_email: string;
  /** Responsable del caso — recibe la notificación QB aunque no sea quien la envió. */
  responsable_nombre?: string;
  responsable_email?: string;
  /** URL firmada del PDF de la factura (Supabase Storage), válida 7 días. */
  pdf_url?: string;
};

/** Fire-and-forget: no bloquea el flujo principal, solo loguea si falla. */
export function sendInvoiceNotification(payload: InvoiceNotifyPayload): void {
  if (!SUPABASE_URL || !FUNCTION_SECRET) return;
  const url = `${SUPABASE_URL}/functions/v1/send-invoice-notification`;
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-ancori-secret': FUNCTION_SECRET,
    },
    body: JSON.stringify(payload),
  }).catch(err => {
    console.warn('[invoice-notify] Error al enviar notificación:', err);
  });
}

/** Convierte las líneas del modal al formato requerido por la notificación. */
export function linesToNotify(lines: InvoiceLine[]): Array<{ descripcion: string; importe: number }> {
  return lines
    .filter(l => String(l.descripcion ?? '').trim())
    .map(l => ({ descripcion: String(l.descripcion ?? '').trim(), importe: Number(l.importe ?? 0) }));
}
