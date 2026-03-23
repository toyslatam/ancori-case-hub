import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/context/AppContext';
import { Case } from '@/data/mockData';

interface NewCaseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Case) => void;
}

export function NewCaseModal({ open, onClose, onCreated }: NewCaseModalProps) {
  const { clients, societies, services, cases } = useApp();
  const [clientId, setClientId] = useState('');
  const [societyId, setSocietyId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [isClientOnly, setIsClientOnly] = useState(false);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  const filteredSocieties = societies.filter(s => s.client_id === clientId);

  const handleCreate = () => {
    if (!serviceId || (!clientId && !societyId)) return;
    const nextNum = String(cases.length + 1).padStart(5, '0');
    const newCase: Case = {
      id: crypto.randomUUID(),
      numero_caso: nextNum,
      client_id: clientId || undefined,
      society_id: isClientOnly ? undefined : (societyId || undefined),
      service_id: serviceId,
      descripcion: services.find(s => s.id === serviceId)?.nombre || '',
      estado: 'Pendiente',
      etapa: 'Cotización',
      gastos_cotizados: 0,
      cliente_temporal: isClientOnly,
      prioridad_urgente: false,
      creado_por: 'Usuario Actual',
      responsable: 'Usuario Actual',
      observaciones: '',
      fecha_caso: fecha,
      created_at: new Date().toISOString(),
      comments: [],
      expenses: [],
      invoices: [],
    };
    onCreated(newCase);
    setClientId(''); setSocietyId(''); setServiceId(''); setIsClientOnly(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Nuevo Caso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isClientOnly} onCheckedChange={setIsClientOnly} />
            <Label>Cliente Temporal (sin sociedad)</Label>
          </div>
          <div>
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={v => { setClientId(v); setSocietyId(''); }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
              <SelectContent>
                {clients.filter(c => c.activo).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isClientOnly && clientId && (
            <div>
              <Label>Sociedad</Label>
              <Select value={societyId} onValueChange={setSocietyId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar sociedad" /></SelectTrigger>
                <SelectContent>
                  {filteredSocieties.filter(s => s.activo).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Proceso / Servicio</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar servicio" /></SelectTrigger>
              <SelectContent>
                {services.filter(s => s.activo).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Salir</Button>
          <Button onClick={handleCreate} disabled={!serviceId || !clientId}>Crear</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
