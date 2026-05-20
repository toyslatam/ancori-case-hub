import { useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Pencil, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SocietyService } from '@/data/mockData';
import { cn } from '@/lib/utils';

interface SocietyServicesMultiSelectProps {
  services: SocietyService[];
  value: string[];
  onChange: (value: string[]) => void;
  onCreateService?: (name: string) => Promise<SocietyService | null>;
  onEditService?: (id: string, newName: string) => Promise<boolean>;
  placeholder?: string;
  disabled?: boolean;
}

export function SocietyServicesMultiSelect({
  services,
  value,
  onChange,
  onCreateService,
  onEditService,
  placeholder = 'Seleccionar servicios',
  disabled = false,
}: SocietyServicesMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeServices = useMemo(
    () => services.filter(s => s.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [services],
  );
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedServices = useMemo(
    () => activeServices.filter(s => selectedSet.has(s.id)),
    [activeServices, selectedSet],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeServices;
    return activeServices.filter(s => s.nombre.toLowerCase().includes(q));
  }, [activeServices, query]);
  const canCreate = useMemo(() => {
    const q = query.trim();
    if (!q || !onCreateService) return false;
    return !services.some(s => s.nombre.trim().toLowerCase() === q.toLowerCase());
  }, [onCreateService, query, services]);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  };

  const remove = (id: string) => {
    onChange(value.filter(v => v !== id));
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const startEdit = (service: SocietyService, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(service.id);
    setEditValue(service.nombre);
  };

  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const handleSaveEdit = async (service: SocietyService) => {
    const newName = editValue.trim();
    if (!newName || !onEditService || saving) return;
    if (newName === service.nombre) { cancelEdit(); return; }
    setSaving(true);
    try {
      const ok = await onEditService(service.id, newName);
      if (ok) cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name || !onCreateService || creating) return;
    setCreating(true);
    try {
      const created = await onCreateService(name);
      if (created) {
        onChange([...new Set([...value, created.id])]);
        setQuery('');
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'w-full justify-between font-normal',
              selectedServices.length === 0 && 'text-muted-foreground',
            )}
          >
            <span className="truncate">
              {selectedServices.length > 0
                ? `${selectedServices.length} servicio(s) seleccionado(s)`
                : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          className="z-[200] w-[--radix-popover-trigger-width] p-0"
          onOpenAutoFocus={e => {
            e.preventDefault();
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar servicio..."
              className="flex h-9 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin servicios activos</p>
            ) : (
              filtered.map(service => {
                const checked = selectedSet.has(service.id);
                const isEditing = editingId === service.id;

                if (isEditing) {
                  return (
                    <div key={service.id} className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 bg-accent/30">
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        aria-hidden="true"
                        className="shrink-0"
                        onCheckedChange={() => toggle(service.id)}
                      />
                      <input
                        autoFocus
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); void handleSaveEdit(service); }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        onClick={e => e.stopPropagation()}
                        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); void handleSaveEdit(service); }}
                        disabled={saving || !editValue.trim()}
                        className="shrink-0 rounded p-0.5 text-green-600 hover:text-green-700 disabled:opacity-40"
                        title="Guardar"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); cancelEdit(); }}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        title="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggle(service.id)}
                    onKeyDown={e => e.key === 'Enter' && toggle(service.id)}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                      checked && 'bg-accent/50',
                    )}
                  >
                    <Checkbox checked={checked} tabIndex={-1} aria-hidden="true" />
                    <span className={cn('min-w-0 flex-1 truncate', checked && 'font-medium')}>{service.nombre}</span>
                    {onEditService && (
                      <button
                        type="button"
                        onClick={e => startEdit(service, e)}
                        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted/50 hover:text-foreground"
                        title="Editar nombre"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <Check className={cn('h-4 w-4 shrink-0', checked ? 'opacity-100' : 'opacity-0')} />
                  </div>
                );
              })
            )}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="mt-1 flex w-full items-center justify-center rounded-sm border border-dashed border-primary/40 px-2 py-2 text-sm font-medium text-primary hover:bg-primary/5 disabled:opacity-60"
              >
                {creating ? 'Creando...' : `+ Crear "${query.trim()}"`}
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {selectedServices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedServices.map(service => (
            <Badge key={service.id} variant="secondary" className="gap-1 rounded-full px-2 py-1">
              {service.nombre}
              <button
                type="button"
                onClick={() => remove(service.id)}
                className="rounded-full text-muted-foreground hover:text-foreground"
                aria-label={`Quitar ${service.nombre}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
