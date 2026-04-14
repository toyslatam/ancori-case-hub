import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { Case, CaseInvoice, InvoiceLine } from '@/data/mockData';
import { Plus, Trash2, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET  = import.meta.env.VITE_FUNCTION_SECRET as string;

interface InvoiceModalProps {
  caseData: Case | null;
  invoice?: CaseInvoice | null;
  open: boolean;
  onClose: () => void;
}

const ESTADO_LABELS: Record<CaseInvoice['estado'], string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  error: 'Error',
  anulada: 'Anulada',
};

const ESTADO_COLORS: Record<CaseInvoice['estado'], string> = {
  borrador: 'bg-gray-100 text-gray-600',
  pendiente: 'bg-amber-100 text-amber-700',
  enviada: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  anulada: 'bg-slate-100 text-slate-500',
};

function newLine(): InvoiceLine {
  return { id: crypto.randomUUID(), descripcion: '', cantidad: 1, tarifa: 0, importe: 0, itbms: 7 };
}

export function InvoiceModal({ caseData, invoice, open, onClose }: InvoiceModalProps) {
  const { clients, societies, services, invoiceTerms, qbItems, getClientName, getSocietyName, saveInvoice } = useApp();

  const isEdit = !!invoice;

  const [billToSociety, setBillToSociety] = useState(false);
  const [termId, setTermId] = useState('');
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().split('T')[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [estado, setEstado] = useState<CaseInvoice['estado']>('borrador');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [notaCliente, setNotaCliente] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (!open || !caseData) return;

    if (isEdit && invoice) {
      setBillToSociety(!!invoice.society_id);
      setTermId(invoice.term_id ?? '');
      setFechaFactura(invoice.fecha_factura);
      setFechaVencimiento(invoice.fecha_vencimiento);
      setEstado(invoice.estado);
      setNumeroFactura(invoice.numero_factura ?? '');
      setNotaCliente(invoice.nota_cliente ?? '');
      setLines(invoice.lines.length > 0 ? invoice.lines : [newLine()]);
    } else {
      setBillToSociety(!!caseData.society_id);
      setTermId('');
      setFechaFactura(new Date().toISOString().split('T')[0]);
      setFechaVencimiento('');
      setEstado('borrador');
      setNumeroFactura('');
      setNotaCliente('');
      setLines([{
        id: crypto.randomUUID(),
        descripcion: services.find(s => s.id === caseData.service_id)?.nombre || '',
        cantidad: 1,
        tarifa: 0,
        importe: 0,
        itbms: 7,
      }]);
    }
  }, [open, caseData?.id, invoice?.id]);

  // Auto-calculate due date when term changes
  useEffect(() => {
    if (termId && fechaFactura) {
      const term = invoiceTerms.find(t => t.id === termId);
      if (term) {
        const d = new Date(fechaFactura);
        d.setDate(d.getDate() + term.dias_vencimiento);
        setFechaVencimiento(d.toISOString().split('T')[0]);
      }
    }
  }, [termId, fechaFactura]);

  if (!caseData) return null;

  const updateLine = (idx: number, field: string, value: unknown) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      // Al seleccionar item QB, auto-fill ITBMS desde impuesto_default
      if (field === 'qb_item_id' && value && value !== '__none__') {
        const qbItem = qbItems.find(q => q.id === value);
        if (qbItem?.impuesto_default != null) updated.itbms = qbItem.impuesto_default;
      }
      updated.importe = Number(updated.cantidad) * Number(updated.tarifa);
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.importe, 0);
  const totalItbms = lines.reduce((s, l) => s + (l.importe * l.itbms / 100), 0);
  const total = subtotal + totalItbms;

  const buildInvoice = (): CaseInvoice => ({
    id: invoice?.id ?? crypto.randomUUID(),
    case_id: caseData.id,
    client_id: caseData.client_id,
    society_id: billToSociety ? caseData.society_id : undefined,
    term_id: termId || undefined,
    fecha_factura: fechaFactura,
    fecha_vencimiento: fechaVencimiento,
    subtotal,
    impuesto: totalItbms,
    total,
    estado,
    qb_invoice_id: invoice?.qb_invoice_id,
    numero_factura: numeroFactura || undefined,
    nota_cliente: notaCliente || undefined,
    lines: lines.filter(l => l.descripcion.trim()),
  });

  const handleSave = async () => {
    if (!fechaFactura || !fechaVencimiento) { toast.error('Completa las fechas'); return; }
    if (lines.every(l => !l.descripcion.trim())) { toast.error('Agrega al menos una línea'); return; }
    setSaving(true);
    const inv = buildInvoice();
    const ok = await saveInvoice(caseData.id, inv, isEdit);
    setSaving(false);
    if (ok) { toast.success(isEdit ? 'Factura actualizada' : 'Factura guardada'); onClose(); }
  };

  const handleSendToQB = async () => {
    if (!fechaFactura || !fechaVencimiento) { toast.error('Completa las fechas'); return; }
    if (lines.every(l => !l.descripcion.trim())) { toast.error('Agrega al menos una línea'); return; }
    if (lines.some(l => l.descripcion.trim() && !l.qb_item_id)) {
      const confirm = window.confirm('Algunas líneas no tienen un item de QuickBooks asignado. ¿Continuar de todas formas?');
      if (!confirm) return;
    }

    // Primero guardar en Supabase
    setSending(true);
    const inv = { ...buildInvoice(), estado: 'pendiente' as CaseInvoice['estado'] };
    const saved = await saveInvoice(caseData.id, inv, isEdit);
    if (!saved) { setSending(false); return; }

    // Luego enviar a QB
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ancori-secret': FUNCTION_SECRET },
        body: JSON.stringify({ invoice_id: inv.id }),
      });
      const data = await res.json() as { ok?: boolean; qb_invoice_id?: string; doc_number?: string; error?: string; detail?: string };

      if (!res.ok || !data.ok) {
        toast.warning(`Factura guardada, pero no se pudo enviar a QB: ${data.detail ?? data.error ?? res.status}`);
      } else {
        toast.success(`¡Enviada a QuickBooks! Factura QB #${data.doc_number ?? data.qb_invoice_id}`);
      }
    } catch (e) {
      toast.warning(`Factura guardada. Error de red al enviar a QB: ${String(e)}`);
    } finally {
      setSending(false);
      onClose();
    }
  };

  const clientName = getClientName(caseData.client_id);
  const societyName = getSocietyName(caseData.society_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1000px] max-h-[92vh] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-semibold text-gray-800">
              {isEdit ? `Factura ${invoice?.numero_factura ?? ''} — Caso #${caseData.n_tarea?.toString().padStart(7, '0') ?? caseData.numero_caso}` : `Nueva Factura — Caso #${caseData.n_tarea?.toString().padStart(7, '0') ?? caseData.numero_caso}`}
            </DialogTitle>
            <Badge className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 ${ESTADO_COLORS[estado]}`}>
              {ESTADO_LABELS[estado]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">N° Factura</label>
              <Input
                value={numeroFactura}
                onChange={e => setNumeroFactura(e.target.value)}
                placeholder="000001"
                className="h-9 rounded-lg border-gray-200 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Cliente</label>
              <Input value={clientName} readOnly className="h-9 rounded-lg border-gray-200 bg-gray-50 text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Estado</label>
              <Select value={estado} onValueChange={v => setEstado(v as CaseInvoice['estado'])}>
                <SelectTrigger className="h-9 rounded-lg border-gray-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ESTADO_LABELS) as CaseInvoice['estado'][]).map(k => (
                    <SelectItem key={k} value={k}>{ESTADO_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Billing target */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={billToSociety} onCheckedChange={setBillToSociety} disabled={!caseData.society_id} />
              <label className="text-sm text-gray-600">Facturar a Sociedad</label>
            </div>
            {billToSociety && caseData.society_id && (
              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Facturar A</label>
                <Input value={societyName} readOnly className="h-9 rounded-lg border-gray-200 bg-gray-50 text-sm" />
              </div>
            )}
          </div>

          {/* Dates and terms */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Términos</label>
              <Select value={termId} onValueChange={setTermId}>
                <SelectTrigger className="h-9 rounded-lg border-gray-200 text-sm"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {invoiceTerms.filter(t => t.activo).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Fecha Factura</label>
              <Input type="date" value={fechaFactura} onChange={e => setFechaFactura(e.target.value)} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Fecha Vencimiento</label>
              <Input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} className="h-9 rounded-lg border-gray-200 text-sm" />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Nota para el cliente</label>
            <Input
              value={notaCliente}
              onChange={e => setNotaCliente(e.target.value)}
              placeholder="Opcional"
              className="h-9 rounded-lg border-gray-200 text-sm"
            />
          </div>

          {/* Lines table */}
          <div>
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2 block">Líneas de factura</label>
            <div className="rounded-lg border border-gray-100 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">Producto/Servicio</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">Prod/Serv QB</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">Descripción</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 text-xs w-20">Cant.</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 text-xs w-24">Tarifa</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 text-xs w-24">Importe</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 text-xs w-20">ITBMS %</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="py-1.5 px-2">
                        <Select value={l.servicio_id || '__none__'} onValueChange={v => updateLine(i, 'servicio_id', v === '__none__' ? undefined : v)}>
                          <SelectTrigger className="h-8 text-xs rounded-lg border-gray-200"><SelectValue placeholder="Servicio" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Ninguno —</SelectItem>
                            {services.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-2">
                        <Select value={l.qb_item_id || '__none__'} onValueChange={v => updateLine(i, 'qb_item_id', v === '__none__' ? undefined : v)}>
                          <SelectTrigger className="h-8 text-xs rounded-lg border-gray-200"><SelectValue placeholder="QB" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Ninguno —</SelectItem>
                            {qbItems.filter(q => q.activo).map(q => <SelectItem key={q.id} value={q.id}>{q.nombre_qb}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-2">
                        <Input value={l.descripcion} onChange={e => updateLine(i, 'descripcion', e.target.value)} className="h-8 text-xs rounded-lg border-gray-200" />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input type="number" value={l.cantidad} onChange={e => updateLine(i, 'cantidad', Number(e.target.value))} className="h-8 text-xs text-right rounded-lg border-gray-200" />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input type="number" step="0.01" value={l.tarifa} onChange={e => updateLine(i, 'tarifa', Number(e.target.value))} className="h-8 text-xs text-right rounded-lg border-gray-200" />
                      </td>
                      <td className="py-1.5 px-3 text-right font-medium text-gray-700 text-xs">${l.importe.toFixed(2)}</td>
                      <td className="py-1.5 px-2">
                        <Input type="number" value={l.itbms} onChange={e => updateLine(i, 'itbms', Number(e.target.value))} className="h-8 text-xs text-right rounded-lg border-gray-200" />
                      </td>
                      <td className="py-1.5 px-1">
                        <button onClick={() => removeLine(i)} className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addLine} className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 font-medium px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Agregar línea
            </button>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="space-y-1 text-sm text-right min-w-[200px] bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">
              <div className="flex justify-between gap-8 text-gray-500">
                <span>Subtotal</span>
                <span className="font-medium text-gray-700">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-8 text-gray-500">
                <span>ITBMS</span>
                <span className="font-medium text-gray-700">${totalItbms.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-8 font-semibold text-gray-800 border-t border-gray-200 pt-1 mt-1">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
          <Button variant="ghost" onClick={onClose} className="text-gray-500 hover:text-gray-700 text-sm">
            Salir
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving || sending}
              className="h-9 text-sm border-gray-200 text-gray-700 hover:bg-gray-100"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Guardar borrador
            </Button>
            <Button
              onClick={handleSendToQB}
              disabled={saving || sending}
              className="h-9 text-sm bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              {sending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              {sending ? 'Enviando a QB...' : 'Enviar a QB'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
