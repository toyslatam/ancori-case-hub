import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SearchableCombo, type ComboOption } from '@/components/ui/searchable-combo';

interface FiltersModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (filters: Record<string, any>) => void;
  responsableOptions?: ComboOption[];
  clientOptions?: ComboOption[];
  societyOptions?: ComboOption[];
}

const FILTER_ALL = '__all__';

export function FiltersModal({
  open,
  onClose,
  onApply,
  responsableOptions = [],
  clientOptions = [],
  societyOptions = [],
}: FiltersModalProps) {
  const [filters, setFilters] = useState<Record<string, any>>({});

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleClear = () => {
    setFilters({});
    onApply({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Filtros Avanzados</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Número de Caso</Label>
              <Input placeholder="Ej: 00001" value={filters.numero_caso || ''} onChange={e => setFilters(f => ({ ...f, numero_caso: e.target.value }))} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={filters.estado || '__all__'}
                onValueChange={v => setFilters(f => ({ ...f, estado: v === '__all__' ? undefined : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En Curso">En Curso</SelectItem>
                  <SelectItem value="Completado/Facturado">Completado/Facturado</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label>Responsable</Label>
              <SearchableCombo
                options={[{ value: FILTER_ALL, label: 'Todos' }, ...responsableOptions]}
                value={filters.responsable_id || FILTER_ALL}
                onChange={v => setFilters(f => ({ ...f, responsable_id: !v || v === FILTER_ALL ? undefined : v }))}
                placeholder="Seleccionar Responsable"
                emptyLabel="Sin responsables"
              />
            </div>
            <div>
              <Label>Cliente</Label>
              <SearchableCombo
                options={[{ value: FILTER_ALL, label: 'Todos' }, ...clientOptions]}
                value={filters.client_id || FILTER_ALL}
                onChange={v => setFilters(f => ({ ...f, client_id: !v || v === FILTER_ALL ? undefined : v }))}
                placeholder="Seleccionar Cliente"
                emptyLabel="Sin clientes"
              />
            </div>
            <div>
              <Label>Sociedad</Label>
              <SearchableCombo
                options={[{ value: FILTER_ALL, label: 'Todas' }, ...societyOptions]}
                value={filters.society_id || FILTER_ALL}
                onChange={v => setFilters(f => ({ ...f, society_id: !v || v === FILTER_ALL ? undefined : v }))}
                placeholder="Seleccionar Sociedad"
                emptyLabel="Sin sociedades"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Fecha Desde</Label>
              <Input type="date" value={filters.fecha_desde || ''} onChange={e => setFilters(f => ({ ...f, fecha_desde: e.target.value }))} />
            </div>
            <div>
              <Label>Fecha Hasta</Label>
              <Input type="date" value={filters.fecha_hasta || ''} onChange={e => setFilters(f => ({ ...f, fecha_hasta: e.target.value }))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={filters.prioridad_urgente || false} onCheckedChange={v => setFilters(f => ({ ...f, prioridad_urgente: v }))} />
            <Label>Solo Prioridad Urgente</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={filters.con_comentarios || false} onCheckedChange={v => setFilters(f => ({ ...f, con_comentarios: v }))} />
            <Label>Con Comentarios</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={filters.con_gastos || false} onCheckedChange={v => setFilters(f => ({ ...f, con_gastos: v }))} />
            <Label>Con Gastos</Label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClear}>Limpiar</Button>
          <Button onClick={handleApply}>Aplicar Filtros</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
