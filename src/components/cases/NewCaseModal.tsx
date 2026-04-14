import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { Case, formatNTarea } from '@/data/mockData';
import { Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, cases } = useApp();

  const [isJuridica, setIsJuridica] = useState(false);
  const [entityId, setEntityId] = useState('');   // client_id o society_id según switch
  const [serviceItemId, setServiceItemId] = useState('');

  // Etapa "Solicitud" por defecto
  const etapaSolicitud = useMemo(() =>
    [...etapas].sort((a, b) => a.n_etapa - b.n_etapa).find(e => e.activo),
    [etapas]);

  // Next n_tarea
  const nextNTarea = useMemo(() =>
    Math.max(0, ...cases.map(c => c.n_tarea ?? 0)) + 1,
    [cases]);

  const today = new Date().toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' });

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

  const handleToggle = (juridica: boolean) => {
    setIsJuridica(juridica);
    setEntityId('');
  };

  const handleClose = () => {
    setIsJuridica(false);
    setEntityId('');
    setServiceItemId('');
    onClose();
  };

  const handleCreate = () => {
    if (!entityId || !serviceItemId) return;

    const selectedItem = serviceItems.find(si => si.id === serviceItemId);
    const selectedSociety = isJuridica ? societies.find(s => s.id === entityId) : null;

    const clientId = isJuridica ? (selectedSociety?.client_id ?? undefined) : entityId;
    const societyId = isJuridica ? entityId : undefined;

    const newCase: Case = {
      id: crypto.randomUUID(),
      n_tarea: nextNTarea,
      numero_caso: formatNTarea(nextNTarea),
      client_id: clientId,
      society_id: societyId,
      service_id: selectedItem?.service_id,
      service_item_id: serviceItemId,
      descripcion: '',
      estado: 'Pendiente',
      etapa_id: etapaSolicitud?.id,
      gastos_cotizados: 0,
      cliente_temporal: false,
      prioridad_urgente: false,
      prioridad: 'Media',
      creado_por: 'Usuario Actual',
      responsable: 'Usuario Actual',
      observaciones: '',
      fecha_caso: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      comments: [],
      expenses: [],
      invoices: [],
    };

    onCreated(newCase);
    handleClose();
  };

  const canCreate = !!entityId && !!serviceItemId;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/30">
          <DialogTitle className="text-base font-bold tracking-wide uppercase text-foreground/80">
            Creación de Nuevo Caso
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">

          {/* Fecha + Etapa */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border bg-muted/40 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Fecha</p>
              <p className="text-sm font-semibold">{today}</p>
            </div>
            <div className="rounded-md border bg-primary/5 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">Etapa</p>
              <p className="text-sm font-semibold text-primary">{etapaSolicitud?.nombre ?? 'Solicitud'}</p>
            </div>
          </div>

          {/* Toggle Persona Natural / Jurídica */}
          <div className="flex items-center rounded-lg border overflow-hidden">
            <button
              type="button"
              onClick={() => handleToggle(false)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
                !isJuridica
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <User className="h-4 w-4" />
              Persona Natural
            </button>
            <button
              type="button"
              onClick={() => handleToggle(true)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors',
                isJuridica
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              <Building2 className="h-4 w-4" />
              Persona Jurídica
            </button>
          </div>

          {/* Cliente o Sociedad */}
          <div>
            <SearchableCombo
              options={isJuridica ? societyOptions : clientOptions}
              value={entityId}
              onChange={setEntityId}
              placeholder={isJuridica ? 'Seleccionar sociedad…' : 'Seleccionar cliente…'}
            />
          </div>

          {/* Item de Servicio */}
          <div>
            <SearchableCombo
              options={serviceItemOptions}
              value={serviceItemId}
              onChange={setServiceItemId}
              placeholder="Seleccionar proceso / ítem de servicio…"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={handleClose}>Salir</Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8"
          >
            CREAR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
