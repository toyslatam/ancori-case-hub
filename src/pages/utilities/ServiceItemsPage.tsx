import { useMemo, useState, useRef, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { ServiceItem, TIPOS_ITEM } from '@/data/mockData';
import { syncServiceItemsFromQbo } from '@/lib/qboIntegration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Plus, Trash2, Search, ChevronsUpDown, Check, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ─── Combobox buscable genérico (implementación controlada) ─────────── */
interface ComboOption { value: string; label: string }

interface SearchableComboProps {
  options: ComboOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

function SearchableCombo({ options, value, onChange, placeholder = 'Seleccionar…', emptyLabel = 'Sin resultados', className }: SearchableComboProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(o => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal h-10', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onOpenAutoFocus={e => { e.preventDefault(); setTimeout(() => inputRef.current?.focus(), 0); }}
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar…"
            className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto overflow-x-hidden p-1">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          )}
          {filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={cn(
                'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                value === opt.value && 'bg-accent text-accent-foreground font-medium',
              )}
              onClick={() => { onChange(opt.value); handleOpenChange(false); }}
            >
              <Check className={cn('mr-2 h-4 w-4 shrink-0', value === opt.value ? 'opacity-100' : 'opacity-0')} />
              {opt.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Constantes ─────────────────────────────────────────────────────── */
const NONE = '__none__';

const TIPO_COLORS: Record<string, string> = {
  'N/A':                                   'bg-muted text-muted-foreground',
  'Reformas al Pacto':                     'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Reformas al Acta Fundacional':          'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'Emision de Poder General o Especial':   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Bien Inmueble':                         'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Acciones':                              'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

/* ─── Página principal ───────────────────────────────────────────────── */
export default function ServiceItemsPage() {
  const { serviceItems, services, saveServiceItem, deleteServiceItem } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<ServiceItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<ServiceItem>>({});
  const [deleteTarget, setDeleteTarget] = useState<ServiceItem | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleQbSync = async () => {
    setSyncing(true);
    try {
      const r = await syncServiceItemsFromQbo();
      toast.success(
        `Sync QB completado — ${r.inserted} nuevos · ${r.updated} actualizados · ${r.skipped} omitidos`,
        { duration: 7000 },
      );
      window.location.reload();
    } catch (e) {
      toast.error(`Error sincronizando QB: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  /* opciones para comboboxes */
  const serviceOptions = useMemo<ComboOption[]>(() => [
    { value: NONE, label: 'Sin servicio' },
    ...[...services]
      .filter(s => s.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(s => ({ value: s.id, label: s.nombre })),
  ], [services]);

  const tipoOptions = useMemo<ComboOption[]>(() => TIPOS_ITEM.map(t => ({ value: t, label: t })), []);

  const serviceMap = useMemo(() => new Map(services.map(s => [s.id, s.nombre])), [services]);

  /* filtrado + orden */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return serviceItems;
    return serviceItems.filter(si => {
      const svcName = si.service_id ? (serviceMap.get(si.service_id) ?? '') : '';
      return (
        si.nombre.toLowerCase().includes(q) ||
        svcName.toLowerCase().includes(q) ||
        si.tipo_item.toLowerCase().includes(q) ||
        (si.sku ? si.sku.toLowerCase().includes(q) : false) ||
        (si.id_qb != null ? String(si.id_qb).includes(q) : false)
      );
    });
  }, [serviceItems, search, serviceMap]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filtered],
  );

  /* handlers */
  const openNew = () => {
    setForm({ activo: true, nombre: '', tipo_item: 'N/A', service_id: undefined });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (si: ServiceItem) => {
    setForm({ ...si });
    setEditItem(si);
    setShowForm(true);
  };

  const handleRowClick = (si: ServiceItem, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(si);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) { toast.error('Nombre del ítem es obligatorio'); return; }
    if (!form.tipo_item) { toast.error('Tipo de ítem es obligatorio'); return; }

    let idQb: number | undefined;
    if (form.id_qb != null && String(form.id_qb).trim() !== '') {
      const n = Number(form.id_qb);
      if (Number.isNaN(n)) { toast.error('ID QB debe ser numérico'); return; }
      idQb = n;
    }

    const row: ServiceItem = editItem
      ? { ...editItem, nombre: form.nombre.trim(), service_id: form.service_id, tipo_item: form.tipo_item, id_qb: idQb, sku: form.sku?.trim() || undefined, descripcion: form.descripcion?.trim() || undefined, activo: form.activo ?? true }
      : { id: crypto.randomUUID(), nombre: form.nombre.trim(), service_id: form.service_id, tipo_item: form.tipo_item, id_qb: idQb, sku: form.sku?.trim() || undefined, descripcion: form.descripcion?.trim() || undefined, activo: form.activo ?? true };

    const ok = await saveServiceItem(row, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Ítem actualizado' : 'Ítem creado');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteServiceItem(id);
    if (ok) toast.success('Ítem eliminado');
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground shrink-0">ITEMS DE SERVICIO</h1>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 min-w-0">
          <div className="relative w-full max-w-2xl lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, servicio, tipo, SKU o ID QB…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg bg-card border-border"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleQbSync}
            disabled={syncing}
            className="gap-1 shrink-0 w-full sm:w-auto border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            <span>{syncing ? 'Sincronizando…' : 'Sync desde QB'}</span>
          </Button>
          <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span>Agregar ítem</span>
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Listado de ítems</h2>
          <span className="text-xs text-muted-foreground">{sorted.length} registro{sorted.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Ítem</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Servicios</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tipo Ítem</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[100px]">ID QB</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[120px]">SKU</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No hay ítems{search ? ' que coincidan con la búsqueda' : ''}
                  </td>
                </tr>
              )}
              {sorted.map(si => {
                const svcName = si.service_id ? (serviceMap.get(si.service_id) ?? '—') : '—';
                const tipoCls = TIPO_COLORS[si.tipo_item] ?? 'bg-muted text-muted-foreground';
                return (
                  <tr
                    key={si.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={e => handleRowClick(si, e)}
                  >
                    <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                    <td className="px-4 py-3 font-medium uppercase text-foreground">{si.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground uppercase text-xs">{svcName}</td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tipoCls)}>
                        {si.tipo_item}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{si.id_qb ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{si.sku ?? '—'}</td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label="Eliminar ítem"
                        onClick={() => setDeleteTarget(si)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulario */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar ítem de servicio' : 'Nuevo ítem de servicio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            <div>
              <Label>Nombre Ítem *</Label>
              <Input
                value={form.nombre ?? ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Cambio de Junta Directiva"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label>Servicios</Label>
              <div className="mt-1.5">
                <SearchableCombo
                  options={serviceOptions}
                  value={form.service_id ?? NONE}
                  onChange={v => setForm(f => ({ ...f, service_id: v === NONE ? undefined : v }))}
                  placeholder="Sin servicio"
                  emptyLabel="No se encontró el servicio"
                />
              </div>
            </div>

            <div>
              <Label>Tipo Ítem *</Label>
              <div className="mt-1.5">
                <SearchableCombo
                  options={tipoOptions}
                  value={form.tipo_item ?? 'N/A'}
                  onChange={v => setForm(f => ({ ...f, tipo_item: v }))}
                  placeholder="Seleccionar tipo…"
                  emptyLabel="Tipo no encontrado"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ID QB</Label>
                <Input
                  type="number"
                  value={form.id_qb != null ? String(form.id_qb) : ''}
                  onChange={e => setForm(f => ({ ...f, id_qb: e.target.value === '' ? undefined : Number(e.target.value) }))}
                  placeholder="Opcional"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>SKU</Label>
                <Input
                  value={form.sku ?? ''}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  placeholder="Ej. 400001-1"
                  className="mt-1.5 font-mono"
                />
              </div>
            </div>

            <div>
              <Label>Descripción</Label>
              <Input
                value={form.descripcion ?? ''}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Opcional"
                className="mt-1.5"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.activo ?? true}
                onCheckedChange={v => setForm(f => ({ ...f, activo: v }))}
              />
              <Label>Activo</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ítem?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.nombre}». Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete}>
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
