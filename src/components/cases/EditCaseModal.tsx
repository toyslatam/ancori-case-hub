import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useApp } from '@/context/AppContext';
import { Case } from '@/data/mockData';
import { toast } from 'sonner';

interface EditCaseModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
}

const estados: Case['estado'][] = ['Pendiente', 'En Proceso', 'Completado/Facturado', 'Cancelado'];
const etapas = ['Cotización', 'En Proceso', 'Completado', 'Facturado'];

export function EditCaseModal({ caseData, open, onClose }: EditCaseModalProps) {
  const { clients, societies, services, updateCase } = useApp();
  const [form, setForm] = useState<Partial<Case>>({});

  useEffect(() => {
    if (caseData) setForm({ ...caseData });
  }, [caseData]);

  if (!caseData) return null;

  const filteredSocieties = societies.filter(s => s.client_id === form.client_id);

  const handleSave = () => {
    if (!form.client_id || !form.service_id || !form.estado) {
      toast.error('Complete los campos obligatorios');
      return;
    }
    updateCase({ ...caseData, ...form } as Case);
    toast.success('Caso actualizado');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Caso #{caseData.numero_caso}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.client_id || ''} onValueChange={v => setForm(f => ({ ...f, client_id: v, society_id: undefined }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {clients.filter(c => c.activo).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Item de Servicio *</Label>
              <Select value={form.service_id || ''} onValueChange={v => setForm(f => ({ ...f, service_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {services.filter(s => s.activo).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!form.cliente_temporal && form.client_id && (
            <div>
              <Label>Sociedad</Label>
              <Select value={form.society_id || ''} onValueChange={v => setForm(f => ({ ...f, society_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar sociedad" /></SelectTrigger>
                <SelectContent>
                  {filteredSocieties.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Descripción</Label>
            <Textarea value={form.descripcion || ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estado *</Label>
              <Select value={form.estado || ''} onValueChange={v => setForm(f => ({ ...f, estado: v as Case['estado'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {estados.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Etapa *</Label>
              <Select value={form.etapa || ''} onValueChange={v => setForm(f => ({ ...f, etapa: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {etapas.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Gastos Cotizados</Label>
              <Input type="number" value={form.gastos_cotizados || 0} onChange={e => setForm(f => ({ ...f, gastos_cotizados: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Responsable</Label>
              <Input value={form.responsable || ''} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea value={form.observaciones || ''} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} rows={2} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.cliente_temporal || false} onCheckedChange={v => setForm(f => ({ ...f, cliente_temporal: v }))} />
            <Label>Cliente Temporal</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.prioridad_urgente || false} onCheckedChange={v => setForm(f => ({ ...f, prioridad_urgente: v }))} />
            <Label>Prioridad Urgente</Label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Salir</Button>
          <Button onClick={handleSave}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
