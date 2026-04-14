import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { Case, formatNTarea } from '@/data/mockData';
import { Building2, User, CalendarDays, GitBranch } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, cases } = useApp();

  const [isJuridica, setIsJuridica] = useState(false);
  const [entityId, setEntityId] = useState('');
  const [serviceItemId, setServiceItemId] = useState('');

  const etapaSolicitud = useMemo(() =>
    [...etapas].sort((a, b) => a.n_etapa - b.n_etapa).find(e => e.activo),
    [etapas]);

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
      return { value: si.id, label: si.nombre, sublabel: svcNombre };
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

    const newCase: Case = {
      id: crypto.randomUUID(),
      n_tarea: nextNTarea,
      numero_caso: formatNTarea(nextNTarea),
      client_id: isJuridica ? (selectedSociety?.client_id ?? undefined) : entityId,
      society_id: isJuridica ? entityId : undefined,
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
      {/* min-h forzado para que los combos tengan espacio abajo y no flipeen */}
      <DialogContent className="sm:max-w-[480px] p-0 overflow-visible">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-bold tracking-wide uppercase text-foreground/70">
            Creación de Nuevo Caso
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-4 pb-6 space-y-5">

          {/* Fecha + Etapa info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground leading-none mb-0.5">Fecha</p>
                <p className="text-sm font-semibold">{today}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2.5">
              <GitBranch className="h-4 w-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted-foreground leading-none mb-0.5">Etapa inicial</p>
                <p className="text-sm font-semibold text-primary">{etapaSolicitud?.nombre ?? 'Solicitud'}</p>
              </div>
            </div>
          </div>

          {/* Toggle Natural / Jurídica */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Tipo de Cliente
            </p>
            <div className="flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => handleToggle(false)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors',
                  !isJuridica ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
                )}
              >
                <User className="h-4 w-4" /> Persona Natural
              </button>
              <button
                type="button"
                onClick={() => handleToggle(true)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors',
                  isJuridica ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
                )}
              >
                <Building2 className="h-4 w-4" /> Persona Jurídica
              </button>
            </div>
          </div>

          {/* Selector Cliente o Sociedad */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {isJuridica ? 'Sociedad' : 'Cliente'}
            </p>
            <SearchableCombo
              key={isJuridica ? 'soc' : 'cli'}
              options={isJuridica ? societyOptions : clientOptions}
              value={entityId}
              onChange={setEntityId}
              placeholder={isJuridica ? 'Buscar sociedad…' : 'Buscar cliente…'}
            />
          </div>

          {/* Selector Item de Servicio — separado visualmente con línea */}
          <div className="pt-1 border-t">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-4">
              Proceso / Ítem de Servicio
            </p>
            <SearchableCombo
              options={serviceItemOptions}
              value={serviceItemId}
              onChange={setServiceItemId}
              placeholder="Buscar ítem de servicio…"
              emptyLabel="No se encontraron ítems"
            />
            {serviceItemId && (() => {
              const item = serviceItemOptions.find(o => o.value === serviceItemId);
              return item ? (
                <div className="mt-1.5 text-xs text-muted-foreground px-1 flex items-start gap-1">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>
                    <span className="font-semibold text-foreground">{item.label}</span>
                    {item.sublabel && <span className="block text-muted-foreground">— {item.sublabel}</span>}
                  </span>
                </div>
              ) : null;
            })()}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-muted/20">
          <Button variant="outline" onClick={handleClose}>Salir</Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-8"
          >
            CREAR
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
