import { useState, useMemo } from 'react';
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

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}

const BLANK = {
  client_id: '',
  society_id: '',
  service_item_id: '',
  etapa_id: '',
  usuario_asignado_id: '',
  estado: 'Pendiente' as Case['estado'],
  prioridad: 'Media' as Case['prioridad'],
  descripcion: '',
  notas: '',
  observaciones: '',
  fecha_vencimiento: '',
  gastos_cliente: '',
  recurrencia: false,
  envio_correo: false,
  cliente_temporal: false,
};

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, usuarios, cases } = useApp();
  const [form, setForm] = useState({ ...BLANK });

  // Compute next n_tarea
  const nextNTarea = useMemo(() => Math.max(0, ...cases.map(c => c.n_tarea ?? 0)) + 1, [cases]);

  // Derive service_id from selected service_item
  const selectedItem = serviceItems.find(si => si.id === form.service_item_id);
  const derivedServiceId = selectedItem?.service_id;
  const derivedServiceName = services.find(s => s.id === derivedServiceId)?.nombre ?? '';

  // When society changes, auto-fill client
  const handleSocietyChange = (sid: string) => {
    const soc = societies.find(s => s.id === sid);
    setForm(f => ({ ...f, society_id: sid, client_id: soc?.client_id ?? f.client_id }));
  };

  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo && (!form.client_id || s.client_id === form.client_id))
      .map(s => ({ value: s.id, label: s.nombre })),
    [societies, form.client_id]);

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

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleClose = () => {
    setForm({ ...BLANK });
    onClose();
  };

  const handleCreate = () => {
    const newCase: Case = {
      id: crypto.randomUUID(),
      n_tarea: nextNTarea,
      numero_caso: formatNTarea(nextNTarea),
      client_id: form.client_id || undefined,
      society_id: form.cliente_temporal ? undefined : (form.society_id || undefined),
      service_id: derivedServiceId || undefined,
      service_item_id: form.service_item_id || undefined,
      descripcion: form.descripcion || (selectedItem?.nombre ?? ''),
      estado: form.estado,
      etapa_id: form.etapa_id || undefined,
      gastos_cotizados: 0,
      gastos_cliente: form.gastos_cliente ? parseFloat(form.gastos_cliente) : undefined,
      cliente_temporal: form.cliente_temporal,
      prioridad: form.prioridad,
      prioridad_urgente: form.prioridad === 'Urgente',
      creado_por: 'Usuario Actual',
      responsable: usuarios.find(u => u.id === form.usuario_asignado_id)?.nombre ?? 'Usuario Actual',
      usuario_asignado_id: form.usuario_asignado_id || undefined,
      observaciones: form.observaciones,
      notas: form.notas || undefined,
      fecha_caso: new Date().toISOString().split('T')[0],
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      recurrencia: form.recurrencia,
      envio_correo: form.envio_correo,
      created_at: new Date().toISOString(),
      comments: [],
      expenses: [],
      invoices: [],
    };
    onCreated(newCase);
    handleClose();
  };

  const isValid = !!(form.client_id || form.society_id);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[680px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-lg font-bold">Nuevo Caso</span>
            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
              #{formatNTarea(nextNTarea)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── Sección: Cliente / Sociedad ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Cliente y Sociedad
            </h3>

            <div className="flex items-center gap-3">
              <Switch
                id="cli-temp"
                checked={form.cliente_temporal}
                onCheckedChange={v => set('cliente_temporal', v)}
              />
              <Label htmlFor="cli-temp" className="cursor-pointer">Cliente Temporal (sin sociedad)</Label>
            </div>

            {!form.cliente_temporal && (
              <div>
                <Label>Sociedad</Label>
                <SearchableCombo
                  options={societyOptions}
                  value={form.society_id}
                  onChange={handleSocietyChange}
                  placeholder="Buscar sociedad…"
                />
              </div>
            )}

            <div>
              <Label>{form.cliente_temporal ? 'Cliente *' : 'Cliente (auto desde sociedad)'}</Label>
              <SearchableCombo
                options={clientOptions}
                value={form.client_id}
                onChange={v => set('client_id', v)}
                placeholder="Buscar cliente…"
                disabled={!form.cliente_temporal && !!form.society_id}
              />
            </div>
          </section>

          {/* ── Sección: Servicio ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Servicio
            </h3>

            <div>
              <Label>Ítem de Servicio</Label>
              <SearchableCombo
                options={serviceItemOptions}
                value={form.service_item_id}
                onChange={v => set('service_item_id', v)}
                placeholder="Buscar ítem de servicio…"
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
                  value={form.etapa_id}
                  onChange={v => set('etapa_id', v)}
                  placeholder="Seleccionar etapa…"
                />
              </div>
              <div>
                <Label>Usuario Asignado</Label>
                <SearchableCombo
                  options={usuarioOptions}
                  value={form.usuario_asignado_id}
                  onChange={v => set('usuario_asignado_id', v)}
                  placeholder="Seleccionar usuario…"
                />
              </div>
            </div>
          </section>

          {/* ── Sección: Estado y Prioridad ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Estado y Prioridad
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={v => set('estado', v)}>
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
                  value={form.fecha_vencimiento}
                  onChange={e => set('fecha_vencimiento', e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ── Sección: Detalle ── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-1">
              Detalle
            </h3>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.descripcion}
                onChange={e => set('descripcion', e.target.value)}
                placeholder="Descripción del caso…"
                rows={2}
              />
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={form.notas}
                onChange={e => set('notas', e.target.value)}
                placeholder="Notas internas…"
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
                  value={form.gastos_cliente}
                  onChange={e => set('gastos_cliente', e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="recurrencia"
                  checked={form.recurrencia}
                  onCheckedChange={v => set('recurrencia', v)}
                />
                <Label htmlFor="recurrencia" className="cursor-pointer">Recurrencia</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="envio-correo"
                  checked={form.envio_correo}
                  onCheckedChange={v => set('envio_correo', v)}
                />
                <Label htmlFor="envio-correo" className="cursor-pointer">Envío de Correo</Label>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!isValid}>Crear Caso</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
