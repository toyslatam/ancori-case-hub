import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { Case, CASE_ESTADOS, formatNTarea } from '@/data/mockData';
import { DollarSign, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditCaseModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
  onOpenExpenses?: () => void;
  onOpenInvoice?: () => void;
}

const estadoColor: Record<string, string> = {
  'Pendiente': 'border-yellow-300 text-yellow-700 bg-yellow-50',
  'En Curso': 'border-blue-300 text-blue-700 bg-blue-50',
  'Completado/Facturado': 'border-green-300 text-green-700 bg-green-50',
  'Cancelado': 'border-gray-300 text-gray-500 bg-gray-50',
};

export function EditCaseModal({ caseData, open, onClose, onOpenExpenses, onOpenInvoice }: EditCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, updateCase, getClientName, getSocietyName } = useApp();

  const [form, setForm] = useState<Partial<Case> & { gastos_str: string }>({
    gastos_str: '',
  });

  useEffect(() => {
    if (caseData) {
      setForm({
        ...caseData,
        gastos_str: caseData.gastos_cotizados != null ? String(caseData.gastos_cotizados) : '',
      });
    }
  }, [caseData]);

  if (!caseData) return null;

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  // Entity display: society or client
  const entityLabel = caseData.society_id
    ? getSocietyName(caseData.society_id) || getClientName(caseData.client_id)
    : getClientName(caseData.client_id);

  // Client/society combo options
  const clientOptions = useMemo(() =>
    clients.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre })),
    [clients]);

  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo).map(s => ({ value: s.id, label: s.nombre })),
    [societies]);

  const serviceItemOptions = useMemo(() =>
    serviceItems.filter(si => si.activo).map(si => {
      const svcNombre = services.find(s => s.id === si.service_id)?.nombre;
      return { value: si.id, label: svcNombre ? `${si.nombre} — ${svcNombre}` : si.nombre };
    }),
    [serviceItems, services]);

  const etapaOptions = useMemo(() =>
    [...etapas].filter(e => e.activo).sort((a, b) => a.n_etapa - b.n_etapa)
      .map(e => ({ value: e.id, label: `${e.n_etapa}. ${e.nombre}` })),
    [etapas]);

  // When service item changes, update service_id
  const handleServiceItemChange = (id: string) => {
    const item = serviceItems.find(si => si.id === id);
    set('service_item_id', id);
    if (item?.service_id) set('service_id', item.service_id);
  };

  // When society changes, auto-fill client
  const handleSocietyChange = (id: string) => {
    const soc = societies.find(s => s.id === id);
    setForm(f => ({ ...f, society_id: id, client_id: soc?.client_id ?? f.client_id }));
  };

  const handleSave = () => {
    const updated: Case = {
      ...caseData,
      ...form,
      gastos_cotizados: form.gastos_str ? parseFloat(form.gastos_str) : caseData.gastos_cotizados,
      prioridad_urgente: form.prioridad === 'Urgente' || caseData.prioridad_urgente,
    } as Case;
    updateCase(updated);
    toast.success('Caso actualizado');
    onClose();
  };

  const isJuridica = !!(form.society_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold tracking-wide uppercase text-foreground/80">
              Editar Caso
            </DialogTitle>
            <span className="font-mono text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
              #{formatNTarea(caseData.n_tarea) || caseData.numero_caso}
            </span>
          </div>
          {/* Estado badge en header */}
          <div className="mt-2">
            <span className={cn(
              'inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold',
              estadoColor[form.estado ?? 'Pendiente'] ?? 'bg-gray-100',
            )}>
              {form.estado ?? 'Pendiente'}
            </span>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4">

          {/* Cliente / Sociedad */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {isJuridica ? 'Sociedad' : 'Cliente'}
            </Label>
            {isJuridica ? (
              <SearchableCombo
                options={societyOptions}
                value={form.society_id ?? ''}
                onChange={handleSocietyChange}
                placeholder="Buscar sociedad…"
              />
            ) : (
              <SearchableCombo
                options={clientOptions}
                value={form.client_id ?? ''}
                onChange={v => set('client_id', v)}
                placeholder="Buscar cliente…"
              />
            )}
          </div>

          {/* Ítem de Servicio */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ítem de Servicio
            </Label>
            <SearchableCombo
              options={serviceItemOptions}
              value={form.service_item_id ?? ''}
              onChange={handleServiceItemChange}
              placeholder="Buscar ítem de servicio…"
            />
          </div>

          {/* Descripción */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Descripción
            </Label>
            <Textarea
              value={form.descripcion ?? ''}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción del caso…"
              rows={3}
              className="resize-none mt-1"
            />
          </div>

          {/* Estado + Etapa en fila */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estado
              </Label>
              <Select value={form.estado ?? 'Pendiente'} onValueChange={v => set('estado', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Etapa
              </Label>
              <SearchableCombo
                options={etapaOptions}
                value={form.etapa_id ?? ''}
                onChange={v => set('etapa_id', v)}
                placeholder="Seleccionar etapa…"
                className="mt-1"
              />
            </div>
          </div>

          {/* Gastos Cotizados */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Gastos Cotizados ($)
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.gastos_str ?? ''}
              onChange={e => set('gastos_str', e.target.value)}
              placeholder="0.00"
              className="mt-1"
            />
          </div>

          {/* Cliente Temporal */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Cliente Temporal</p>
              <p className="text-xs text-muted-foreground">Sin sociedad registrada aún</p>
            </div>
            <Switch
              checked={form.cliente_temporal ?? false}
              onCheckedChange={v => set('cliente_temporal', v)}
            />
          </div>

          {/* Botones de Gastos y Facturas */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
              onClick={() => { onOpenExpenses?.(); onClose(); }}
            >
              <DollarSign className="h-4 w-4" />
              Gastos del Caso
              {caseData.expenses.length > 0 && (
                <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full px-1.5 py-0.5">
                  {caseData.expenses.length}
                </span>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
              onClick={() => { onOpenInvoice?.(); onClose(); }}
            >
              <FileText className="h-4 w-4" />
              Facturas
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={onClose}>Salir</Button>
          <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 px-8">
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
