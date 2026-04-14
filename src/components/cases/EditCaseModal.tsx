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
import { Case, CASE_ESTADOS, CASE_PRIORIDADES, formatNTarea } from '@/data/mockData';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface EditCaseModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

export function EditCaseModal({ caseData, open, onClose }: EditCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, usuarios, updateCase } = useApp();
  const [form, setForm] = useState<Partial<Case & { gastos_cliente_str: string; gastos_pendiente_str: string }>>({});

  useEffect(() => {
    if (caseData) {
      setForm({
        ...caseData,
        gastos_cliente_str: caseData.gastos_cliente != null ? String(caseData.gastos_cliente) : '',
        gastos_pendiente_str: caseData.gastos_pendiente != null ? String(caseData.gastos_pendiente) : '',
      });
    }
  }, [caseData]);

  if (!caseData) return null;

  const selectedItem = serviceItems.find(si => si.id === form.service_item_id);
  const derivedServiceId = selectedItem?.service_id ?? form.service_id;
  const derivedServiceName = services.find(s => s.id === derivedServiceId)?.nombre ?? '';

  const handleSocietyChange = (sid: string) => {
    const soc = societies.find(s => s.id === sid);
    setForm(f => ({ ...f, society_id: sid, client_id: soc?.client_id ?? f.client_id }));
  };

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo).map(s => ({ value: s.id, label: s.nombre })),
    [societies]);

  const clientOptions = useMemo(() =>
    clients.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre })),
    [clients]);

  const serviceItemOptions = useMemo(() =>
    serviceItems.filter(si => si.activo).map(si => ({ value: si.id, label: si.nombre })),
    [serviceItems]);

  const etapaOptions = useMemo(() =>
    [...etapas].filter(e => e.activo).sort((a, b) => a.n_etapa - b.n_etapa)
      .map(e => ({ value: e.id, label: `${e.n_etapa}. ${e.nombre}` })),
    [etapas]);

  const usuarioOptions = useMemo(() =>
    usuarios.filter(u => u.activo).map(u => ({ value: u.id, label: u.nombre })),
    [usuarios]);

  const handleSave = () => {
    const updated: Case = {
      ...caseData,
      ...form,
      service_id: derivedServiceId ?? caseData.service_id,
      gastos_cliente: form.gastos_cliente_str ? parseFloat(form.gastos_cliente_str as string) : undefined,
      gastos_pendiente: form.gastos_pendiente_str ? parseFloat(form.gastos_pendiente_str as string) : undefined,
      prioridad_urgente: form.prioridad === 'Urgente',
      responsable: usuarios.find(u => u.id === form.usuario_asignado_id)?.nombre ?? caseData.responsable,
    } as Case;
    updateCase(updated);
    toast.success('Caso actualizado');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-lg font-bold">Editar Caso</span>
            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              #{formatNTarea(caseData.n_tarea) || caseData.numero_caso}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Cliente / Sociedad ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Cliente y Sociedad
            </h3>

            <div className="flex items-center gap-3">
              <Switch
                id="edit-cli-temp"
                checked={form.cliente_temporal ?? false}
                onCheckedChange={v => set('cliente_temporal', v)}
              />
              <Label htmlFor="edit-cli-temp" className="cursor-pointer">Cliente Temporal</Label>
            </div>

            {!form.cliente_temporal && (
              <div>
                <Label>Sociedad</Label>
                <SearchableCombo
                  options={societyOptions}
                  value={form.society_id ?? ''}
                  onChange={handleSocietyChange}
                  placeholder="Buscar sociedad…"
                />
              </div>
            )}

            <div>
              <Label>Cliente</Label>
              <SearchableCombo
                options={clientOptions}
                value={form.client_id ?? ''}
                onChange={v => set('client_id', v)}
                placeholder="Buscar cliente…"
              />
            </div>
          </section>

          {/* ── Servicio ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Servicio
            </h3>

            <div>
              <Label>Ítem de Servicio</Label>
              <SearchableCombo
                options={serviceItemOptions}
                value={form.service_item_id ?? ''}
                onChange={v => set('service_item_id', v)}
                placeholder="Buscar ítem…"
              />
            </div>

            {derivedServiceName && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Servicio: <strong className="text-foreground">{derivedServiceName}</strong></span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Etapa</Label>
                <SearchableCombo
                  options={etapaOptions}
                  value={form.etapa_id ?? ''}
                  onChange={v => set('etapa_id', v)}
                  placeholder="Seleccionar etapa…"
                />
              </div>
              <div>
                <Label>Usuario Asignado</Label>
                <SearchableCombo
                  options={usuarioOptions}
                  value={form.usuario_asignado_id ?? ''}
                  onChange={v => set('usuario_asignado_id', v)}
                  placeholder="Seleccionar usuario…"
                />
              </div>
            </div>
          </section>

          {/* ── Estado / Prioridad ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Estado y Prioridad
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={form.estado ?? 'Pendiente'} onValueChange={v => set('estado', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridad</Label>
                <Select value={form.prioridad ?? ''} onValueChange={v => set('prioridad', v)}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {CASE_PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha Vencimiento</Label>
                <Input
                  type="date"
                  value={form.fecha_vencimiento ?? ''}
                  onChange={e => set('fecha_vencimiento', e.target.value || undefined)}
                />
              </div>
            </div>
          </section>

          {/* ── Detalle ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Detalle
            </h3>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.descripcion ?? ''}
                onChange={e => set('descripcion', e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notas ?? ''}
                onChange={e => set('notas', e.target.value || undefined)}
                placeholder="Notas internas…"
                rows={2}
              />
            </div>

            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={form.observaciones ?? ''}
                onChange={e => set('observaciones', e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gastos del Cliente ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(form as any).gastos_cliente_str ?? ''}
                  onChange={e => set('gastos_cliente_str', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Gastos Pendientes ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={(form as any).gastos_pendiente_str ?? ''}
                  onChange={e => set('gastos_pendiente_str', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-recurrencia"
                  checked={form.recurrencia ?? false}
                  onCheckedChange={v => set('recurrencia', v)}
                />
                <Label htmlFor="edit-recurrencia" className="cursor-pointer">Recurrencia</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="edit-envio-correo"
                  checked={form.envio_correo ?? false}
                  onCheckedChange={v => set('envio_correo', v)}
                />
                <Label htmlFor="edit-envio-correo" className="cursor-pointer">Envío de Correo</Label>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Cambios</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
