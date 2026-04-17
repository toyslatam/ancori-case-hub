import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { Case, CaseInvoice, InvoiceLine, Service, formatNTarea } from '@/data/mockData';
import { Plus, Trash2, Send, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableCombo, type ComboOption } from '@/components/ui/searchable-combo';
import {
  classifyServiceLineType,
  resolveHonorariosAndGastosServices,
} from '@/lib/invoiceLineProduct';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET as string;

interface InvoiceModalProps {
  caseData: Case | null;
  /** Si viene de Facturas (edición), se salta la lista y se abre el formulario. */
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

function newLine(services: Service[]): InvoiceLine {
  const { honorarios } = resolveHonorariosAndGastosServices(services);
  return {
    id: crypto.randomUUID(),
    descripcion: '',
    cantidad: 1,
    tarifa: 0,
    importe: 0,
    itbms: 7,
    categoria: 'honorarios',
    servicio_id: honorarios?.id,
  };
}

/** Evita crash si la API o un patch dejan `lines` ausente o líneas incompletas. */
function normalizeInvoiceLines(raw: InvoiceLine[] | undefined | null, services: Service[]): InvoiceLine[] {
  if (!Array.isArray(raw) || raw.length === 0) return [newLine(services)];
  const { honorarios, gastos } = resolveHonorariosAndGastosServices(services);
  return raw.map(l => {
    const cantidad = Number(l.cantidad ?? 0);
    const tarifa = Number(l.tarifa ?? 0);
    const importe = Number.isFinite(Number(l.importe)) ? Number(l.importe) : cantidad * tarifa;

    let categoria: 'honorarios' | 'gastos' = 'honorarios';
    if (l.categoria === 'gastos' || l.categoria === 'honorarios') {
      categoria = l.categoria;
    } else if (l.servicio_id) {
      const svc = services.find(s => s.id === l.servicio_id);
      if (svc) {
        categoria = classifyServiceLineType(svc.nombre) === 'gastos' ? 'gastos' : 'honorarios';
      }
    }

    const itbms = categoria === 'gastos' ? 0 : 7;
    let servicio_id: string | undefined = l.servicio_id;
    if (categoria === 'honorarios') servicio_id = honorarios?.id ?? l.servicio_id;
    else servicio_id = gastos?.id ?? l.servicio_id;

    return {
      ...l,
      id: l.id || crypto.randomUUID(),
      descripcion: String(l.descripcion ?? ''),
      cantidad,
      tarifa,
      importe,
      itbms,
      categoria,
      servicio_id,
    };
  });
}

export function InvoiceModal({ caseData, invoice, open, onClose }: InvoiceModalProps) {
  const {
    services, invoiceTerms, qbItems, getClientName, getSocietyName,
    saveInvoice, patchInvoice, allInvoices,
  } = useApp();

  /** Facturas ya guardadas con `case_id` = este caso (lista al abrir desde Casos). */
  const invoicesForCase = useMemo(() => {
    if (!caseData?.id) return [];
    return allInvoices
      .filter(i => i.case_id === caseData.id)
      .sort((a, b) => (b.fecha_factura ?? '').localeCompare(a.fecha_factura ?? ''));
  }, [allInvoices, caseData?.id]);

  /** Elección interna al abrir desde Casos (sin prop `invoice`). */
  const [editingInvoiceLocal, setEditingInvoiceLocal] = useState<CaseInvoice | null>(null);
  /** `pick` = elegir factura o nueva; `form` = formulario crear/editar. */
  const [invoiceListStep, setInvoiceListStep] = useState<'pick' | 'form'>('form');

  const effectiveInvoice = invoice ?? editingInvoiceLocal;
  const isEdit = !!effectiveInvoice;

  const [billToSociety, setBillToSociety] = useState(false);
  const [termId, setTermId] = useState('');
  const [fechaFactura, setFechaFactura] = useState(new Date().toISOString().split('T')[0]);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [estado, setEstado] = useState<CaseInvoice['estado']>('borrador');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [notaCliente, setNotaCliente] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([newLine([])]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Al abrir: desde Facturas → formulario directo; desde Casos → lista si ya hay facturas vinculadas.
  useEffect(() => {
    if (!open || !caseData) return;
    if (invoice) {
      setInvoiceListStep('form');
      setEditingInvoiceLocal(null);
      return;
    }
    const list = allInvoices.filter(i => i.case_id === caseData.id);
    setInvoiceListStep(list.length > 0 ? 'pick' : 'form');
    setEditingInvoiceLocal(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir/cambiar caso; no reaccionar a cada cambio en allInvoices
  }, [open, caseData?.id, invoice?.id]);

  // Rellenar formulario (crear / editar)
  useEffect(() => {
    if (!open || !caseData || invoiceListStep === 'pick') return;

    if (isEdit && effectiveInvoice) {
      setBillToSociety(!!effectiveInvoice.society_id);
      setTermId(effectiveInvoice.term_id ?? '');
      setFechaFactura(effectiveInvoice.fecha_factura);
      setFechaVencimiento(effectiveInvoice.fecha_vencimiento);
      setEstado(effectiveInvoice.estado);
      setNumeroFactura(effectiveInvoice.numero_factura ?? '');
      setNotaCliente(effectiveInvoice.nota_cliente ?? '');
      setLines(normalizeInvoiceLines(effectiveInvoice.lines, services));
    } else {
      setBillToSociety(!!caseData.society_id);
      setTermId('');
      setFechaFactura(new Date().toISOString().split('T')[0]);
      setFechaVencimiento('');
      setEstado('borrador');
      setNumeroFactura('');
      setNotaCliente('');
      setLines([{
        ...newLine(services),
        descripcion: services.find(s => s.id === caseData.service_id)?.nombre || '',
      }]);
    }
  }, [open, caseData?.id, caseData?.service_id, effectiveInvoice?.id, invoiceListStep, invoice?.id, services]);

  useEffect(() => {
    if (termId && fechaFactura) {
      const term = invoiceTerms.find(t => t.id === termId);
      if (term) {
        const d = new Date(fechaFactura);
        d.setDate(d.getDate() + term.dias_vencimiento);
        setFechaVencimiento(d.toISOString().split('T')[0]);
      }
    }
  }, [termId, fechaFactura, invoiceTerms]);

  /** Siempre antes de cualquier return: evita violar el orden de Hooks (p. ej. vista "pick" vs formulario). */
  const qbComboOptions: ComboOption[] = useMemo(() => {
    const raw: ComboOption[] = [
      { value: '', label: '— Ninguno —' },
      ...qbItems.filter(q => q.activo).map(q => ({ value: q.id, label: q.nombre_qb })),
    ];
    const seen = new Set<string>();
    return raw.filter(o => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, [qbItems]);

  if (!caseData) return null;

  const caseNumLabel = caseData.n_tarea != null ? formatNTarea(caseData.n_tarea) : caseData.numero_caso;

  const openNewInvoice = () => {
    setEditingInvoiceLocal(null);
    setInvoiceListStep('form');
  };

  const openEditInvoice = (inv: CaseInvoice) => {
    setEditingInvoiceLocal(inv);
    setInvoiceListStep('form');
  };

  const backToPick = () => {
    setEditingInvoiceLocal(null);
    setInvoiceListStep('pick');
  };

  // ── Pantalla lista (solo desde Casos, sin prop invoice) ──
  if (invoiceListStep === 'pick' && !invoice) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg p-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
            <DialogTitle className="text-base font-semibold text-gray-800">
              Facturas del caso #{caseNumLabel}
            </DialogTitle>
            <p className="text-xs text-gray-500 font-normal pt-1">
              Elige una factura para revisar o añade una nueva. Quien trabaje en Facturas podrá asignar ítems QuickBooks y enviar a QBO.
            </p>
          </DialogHeader>
          <div className="px-6 py-4 space-y-4">
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">N°</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-500 text-xs">Fecha</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500 text-xs">Total</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-500 text-xs">Estado</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {invoicesForCase.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-sky-50/40">
                      <td className="py-2.5 px-3 font-mono text-xs font-semibold">{inv.numero_factura || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-gray-600">{inv.fecha_factura}</td>
                      <td className="py-2.5 px-3 text-right text-xs font-medium">${inv.total.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[inv.estado]}`}>
                          {ESTADO_LABELS[inv.estado]}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => openEditInvoice(inv)}>
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 justify-between items-center">
              <Button variant="ghost" onClick={onClose} className="text-gray-500 text-sm">
                Cerrar
              </Button>
              <Button onClick={openNewInvoice} className="bg-orange-500 hover:bg-orange-600 text-white text-sm gap-1.5">
                <Plus className="h-4 w-4" />
                Nueva factura
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const updateLine = (idx: number, field: string, value: unknown) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated: InvoiceLine = { ...l };

      if (field === 'categoria') {
        const cat = value === 'gastos' ? 'gastos' : 'honorarios';
        updated.categoria = cat;
        updated.itbms = cat === 'gastos' ? 0 : 7;
        const { honorarios, gastos } = resolveHonorariosAndGastosServices(services);
        updated.servicio_id = cat === 'gastos' ? gastos?.id : honorarios?.id;
      } else if (field === 'qb_item_id') {
        const qid = typeof value === 'string' && value ? value : undefined;
        updated.qb_item_id = qid;
        if (qid) {
          const qbItem = qbItems.find(q => q.id === qid);
          if (qbItem?.impuesto_default != null) updated.itbms = qbItem.impuesto_default;
        }
      } else {
        (updated as Record<string, unknown>)[field] = value;
      }

      updated.importe = Number(updated.cantidad) * Number(updated.tarifa);
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, newLine(services)]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + Number(l.importe ?? 0), 0);
  const totalItbms = lines.reduce(
    (s, l) => s + (Number(l.importe ?? 0) * Number(l.itbms ?? 0)) / 100,
    0,
  );
  const total = subtotal + totalItbms;

  const buildInvoice = (): CaseInvoice => ({
    id: effectiveInvoice?.id ?? crypto.randomUUID(),
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
    qb_invoice_id: effectiveInvoice?.qb_invoice_id,
    numero_factura: numeroFactura || undefined,
    nota_cliente: notaCliente || undefined,
    error_detalle: effectiveInvoice?.error_detalle,
    qb_total: effectiveInvoice?.qb_total,
    qb_balance: effectiveInvoice?.qb_balance,
    qb_last_sync_at: effectiveInvoice?.qb_last_sync_at,
    pdf_path: effectiveInvoice?.pdf_path,
    pdf_status: effectiveInvoice?.pdf_status,
    lines: lines.filter(l => String(l.descripcion ?? '').trim()),
  });

  const handleSave = async () => {
    if (!fechaFactura || !fechaVencimiento) { toast.error('Completa las fechas'); return; }
    if (lines.every(l => !String(l.descripcion ?? '').trim())) { toast.error('Agrega al menos una línea'); return; }
    setSaving(true);
    try {
      let inv: CaseInvoice;
      try {
        inv = buildInvoice();
      } catch (e) {
        toast.error(`No se pudo armar la factura: ${String(e)}`);
        return;
      }
      const ok = await saveInvoice(caseData.id, inv, isEdit);
      if (ok) {
        toast.success(isEdit ? 'Factura actualizada' : 'Factura guardada');
        onClose();
      }
    } catch (e) {
      console.error(e);
      toast.error(`Error al guardar: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSendToQB = async () => {
    if (!fechaFactura || !fechaVencimiento) { toast.error('Completa las fechas'); return; }
    if (lines.every(l => !String(l.descripcion ?? '').trim())) { toast.error('Agrega al menos una línea'); return; }
    if (lines.some(l => String(l.descripcion ?? '').trim() && !l.qb_item_id)) {
      const confirm = window.confirm('Algunas líneas no tienen un item de QuickBooks asignado. ¿Continuar de todas formas?');
      if (!confirm) return;
    }

    setSending(true);
    try {
      let inv: CaseInvoice;
      try {
        inv = { ...buildInvoice(), estado: 'pendiente' as CaseInvoice['estado'] };
      } catch (e) {
        toast.error(`No se pudo armar la factura: ${String(e)}`);
        return;
      }
      const saved = await saveInvoice(caseData.id, inv, isEdit);
      if (!saved) return;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-create-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ancori-secret': FUNCTION_SECRET },
          body: JSON.stringify({ invoice_id: inv.id }),
        });
        const data = await res.json() as {
          ok?: boolean;
          qb_invoice_id?: string;
          doc_number?: string;
          total_amt?: number;
          balance?: number;
          error?: string;
          detail?: string;
        };

        if (!res.ok || !data.ok) {
          const errText = typeof data.detail === 'string'
            ? data.detail
            : JSON.stringify(data.detail ?? data.error ?? res.status);
          patchInvoice(inv.id, { estado: 'error', error_detalle: errText.slice(0, 2000) });
          toast.warning(`Factura guardada, pero no se pudo enviar a QB: ${errText.slice(0, 200)}`);
        } else {
          patchInvoice(inv.id, {
            estado: 'enviada',
            qb_invoice_id: data.qb_invoice_id,
            numero_factura: data.doc_number ?? inv.numero_factura,
            error_detalle: undefined,
            qb_total: typeof data.total_amt === 'number' ? data.total_amt : undefined,
            qb_balance: typeof data.balance === 'number' ? data.balance : undefined,
            qb_last_sync_at: new Date().toISOString(),
          });
          toast.success(`¡Enviada a QuickBooks! Factura QB #${data.doc_number ?? data.qb_invoice_id}`);
        }
      } catch (e) {
        toast.warning(`Factura guardada. Error de red al enviar a QB: ${String(e)}`);
      }
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(`Error al guardar o enviar: ${String(e)}`);
    } finally {
      setSending(false);
    }
  };

  const clientName = getClientName(caseData.client_id);
  const societyName = getSocietyName(caseData.society_id);

  const showBackToList = !invoice && invoicesForCase.length > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[1100px] max-h-[92vh] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {showBackToList && (
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2 shrink-0" onClick={backToPick} title="Volver al listado">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DialogTitle className="text-base font-semibold text-gray-800 truncate">
                {isEdit ? `Factura ${effectiveInvoice?.numero_factura ?? ''} — Caso #${caseNumLabel}` : `Nueva Factura — Caso #${caseNumLabel}`}
              </DialogTitle>
            </div>
            <Badge className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 shrink-0 ${ESTADO_COLORS[estado]}`}>
              {ESTADO_LABELS[estado]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
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

          <div>
            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1 block">Nota para el cliente</label>
            <Input
              value={notaCliente}
              onChange={e => setNotaCliente(e.target.value)}
              placeholder="Opcional"
              className="h-9 rounded-lg border-gray-200 text-sm"
            />
          </div>

          {effectiveInvoice?.error_detalle && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 whitespace-pre-wrap break-words">
              {effectiveInvoice.error_detalle}
            </div>
          )}

          <div className="rounded-xl border border-gray-200/80 bg-gradient-to-b from-gray-50/80 to-white shadow-sm p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Líneas de factura</h3>
            <div className="rounded-lg border border-gray-100 bg-white overflow-x-auto shadow-inner">
              <table className="w-full min-w-[920px] text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="bg-gray-50/90 border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide min-w-[200px]">Producto/Servicio</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide min-w-[200px]">Prod/Serv QB</th>
                    <th className="text-left py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide min-w-[220px]">Descripción</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide w-[88px]">Cant.</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide w-[104px]">Tarifa</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide w-[100px]">Importe</th>
                    <th className="text-right py-3 px-3 font-semibold text-gray-600 text-[11px] uppercase tracking-wide w-[88px]">ITBMS %</th>
                    <th className="w-11" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-orange-50/20 transition-colors">
                      <td className="py-3 px-3 align-middle min-w-[160px]">
                        <Select
                          value={l.categoria === 'gastos' ? 'gastos' : 'honorarios'}
                          onValueChange={v => updateLine(i, 'categoria', v)}
                        >
                          <SelectTrigger className="h-9 text-xs rounded-lg border-gray-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="honorarios">Honorario</SelectItem>
                            <SelectItem value="gastos">Gastos</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-3 px-3 align-middle">
                        <SearchableCombo
                          options={qbComboOptions}
                          value={l.qb_item_id ?? ''}
                          onChange={v => updateLine(i, 'qb_item_id', v)}
                          placeholder="Buscar en QB…"
                          className="h-9 min-h-9 text-xs rounded-lg border-gray-200"
                          contentClassName="!min-w-[300px] sm:!min-w-[340px] max-w-[min(440px,calc(100vw-2rem))]"
                        />
                      </td>
                      <td className="py-3 px-3 align-middle">
                        <Input
                          value={l.descripcion}
                          onChange={e => updateLine(i, 'descripcion', e.target.value)}
                          className="h-9 text-xs rounded-lg border-gray-200 min-w-[12rem]"
                        />
                      </td>
                      <td className="py-3 px-3 align-middle">
                        <Input
                          type="number"
                          min={0}
                          value={l.cantidad}
                          onChange={e => updateLine(i, 'cantidad', Number(e.target.value))}
                          className="h-9 text-xs text-right rounded-lg border-gray-200 w-full min-w-[4.25rem]"
                        />
                      </td>
                      <td className="py-3 px-3 align-middle">
                        <Input
                          type="number"
                          step="0.01"
                          value={l.tarifa}
                          onChange={e => updateLine(i, 'tarifa', Number(e.target.value))}
                          className="h-9 text-xs text-right rounded-lg border-gray-200 w-full min-w-[5rem]"
                        />
                      </td>
                      <td className="py-3 px-3 text-right font-medium text-gray-800 text-xs tabular-nums align-middle">${Number(l.importe ?? 0).toFixed(2)}</td>
                      <td className="py-3 px-3 align-middle">
                        <Input
                          type="number"
                          step="0.01"
                          value={l.itbms}
                          onChange={e => updateLine(i, 'itbms', Number(e.target.value))}
                          className="h-9 text-xs text-right rounded-lg border-gray-200 w-full min-w-[4.25rem]"
                        />
                      </td>
                      <td className="py-3 px-2 align-middle">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="h-9 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Quitar línea"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addLine}
              className="mt-1 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium px-3 py-2 rounded-lg hover:bg-orange-50/80 transition-colors"
            >
              <Plus className="h-4 w-4 shrink-0" /> Agregar línea
            </button>
          </div>

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
