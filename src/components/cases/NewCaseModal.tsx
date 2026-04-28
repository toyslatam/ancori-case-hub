import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Case, formatNTarea } from '@/data/mockData';
import { Building2, User, CalendarDays, GitBranch, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}

const inputCls = 'bg-white border-gray-200 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-300 transition-all duration-150';

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { clients, societies, services, serviceItems, etapas, cases } = useApp();
  const { user, session } = useAuth();

  const [isJuridica, setIsJuridica] = useState(false);
  const [entityId, setEntityId]     = useState('');
  const [serviceItemId, setServiceItemId] = useState('');

  const etapaSolicitud = useMemo(() =>
    [...etapas].sort((a, b) => a.n_etapa - b.n_etapa).find(e => e.activo), [etapas]);

  const nextNTarea = useMemo(() =>
    Math.max(0, ...cases.map(c => c.n_tarea ?? 0)) + 1, [cases]);

  const today = new Date().toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const clientOptions  = useMemo(() =>
    clients.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre })), [clients]);

  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo).map(s => ({ value: s.id, label: s.nombre })), [societies]);

  const serviceItemOptions = useMemo(() =>
    serviceItems.filter(si => si.activo).map(si => {
      const svcNombre = services.find(s => s.id === si.service_id)?.nombre;
      return { value: si.id, label: si.nombre, sublabel: svcNombre };
    }), [serviceItems, services]);

  const handleToggle = (juridica: boolean) => { setIsJuridica(juridica); setEntityId(''); };

  const handleClose = () => { setIsJuridica(false); setEntityId(''); setServiceItemId(''); onClose(); };

  const handleCreate = () => {
    if (!entityId || !serviceItemId) return;
    const selectedItem    = serviceItems.find(si => si.id === serviceItemId);
    const selectedSociety = isJuridica ? societies.find(s => s.id === entityId) : null;
    const actorName =
      user?.nombre?.trim()
      || session?.user?.email?.split('@')[0]
      || 'Usuario';

    const newCase: Case = {
      id:              crypto.randomUUID(),
      n_tarea:         nextNTarea,
      numero_caso:     formatNTarea(nextNTarea),
      client_id:       isJuridica ? (selectedSociety?.client_id ?? undefined) : entityId,
      society_id:      isJuridica ? entityId : undefined,
      service_id:      selectedItem?.service_id,
      service_item_id: serviceItemId,
      descripcion:     '',
      estado:          'Pendiente',
      etapa_id:        etapaSolicitud?.id,
      etapa:           etapaSolicitud?.nombre ?? '',
      gastos_cotizados: 0,
      cliente_temporal: false,
      prioridad_urgente: false,
      prioridad:       'Media',
      creado_por:      actorName,
      responsable:     '',
      observaciones:   '',
      fecha_caso:      new Date().toISOString().split('T')[0],
      created_at:      new Date().toISOString(),
      comments:  [],
      expenses:  [],
      invoices:  [],
    };

    onCreated(newCase);
    handleClose();
  };

  const canCreate = !!entityId && !!serviceItemId;
  const selectedItem = serviceItemOptions.find(o => o.value === serviceItemId);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px] p-0 overflow-visible rounded-2xl bg-[#F9FAFB] border-0 shadow-xl">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 bg-white border-b border-gray-100 rounded-t-2xl">
          <DialogTitle className="flex items-center gap-2 text-gray-800 text-base font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
              <Plus className="h-4 w-4 text-orange-500" />
            </span>
            Nuevo Caso
          </DialogTitle>
          <DialogDescription className="sr-only">Formulario para crear un nuevo caso</DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-4 pb-5 space-y-5">

          {/* Fecha + Etapa */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-white px-3.5 py-2.5 shadow-sm">
              <CalendarDays className="h-4 w-4 text-gray-300 shrink-0" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-300 mb-0.5">Fecha</p>
                <p className="text-sm font-semibold text-gray-700">{today}</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl border border-orange-100 bg-orange-50 px-3.5 py-2.5">
              <GitBranch className="h-4 w-4 text-orange-400 shrink-0" />
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-orange-300 mb-0.5">Etapa inicial</p>
                <p className="text-sm font-semibold text-orange-500">{etapaSolicitud?.nombre ?? 'Solicitud'}</p>
              </div>
            </div>
          </div>

          {/* Toggle Natural / Jurídica */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Tipo de cliente</p>
            <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden p-1 gap-1">
              <button
                type="button"
                onClick={() => handleToggle(false)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  !isJuridica
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
                )}
              >
                <User className="h-3.5 w-3.5" /> Persona Natural
              </button>
              <button
                type="button"
                onClick={() => handleToggle(true)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                  isJuridica
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50',
                )}
              >
                <Building2 className="h-3.5 w-3.5" /> Persona Jurídica
              </button>
            </div>
          </div>

          {/* Cliente o Sociedad */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              {isJuridica ? 'Sociedad' : 'Cliente'}
            </p>
            <SearchableCombo
              key={isJuridica ? 'soc' : 'cli'}
              options={isJuridica ? societyOptions : clientOptions}
              value={entityId}
              onChange={setEntityId}
              placeholder={isJuridica ? 'Buscar sociedad…' : 'Buscar cliente…'}
              className={inputCls}
            />
          </div>

          {/* Ítem de Servicio */}
          <div className="pt-0.5 border-t border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-4">
              Proceso / Ítem de Servicio
            </p>
            <SearchableCombo
              options={serviceItemOptions}
              value={serviceItemId}
              onChange={setServiceItemId}
              placeholder="Buscar ítem de servicio…"
              emptyLabel="No se encontraron ítems"
              className={inputCls}
            />
            {selectedItem && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
                <span className="text-orange-400 text-xs font-bold shrink-0 mt-0.5">✓</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700 truncate">{selectedItem.label}</p>
                  {selectedItem.sublabel && (
                    <p className="text-[11px] text-gray-400 truncate">— {selectedItem.sublabel}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white border-t border-gray-100 rounded-b-2xl">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors px-2 py-1 rounded-lg hover:bg-gray-50"
          >
            Salir
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-800 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Crear caso
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
