import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { Service } from '@/data/mockData';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

const NO_CATEGORY = '__none__';

export default function UtilServicesPage() {
  const { services, categories, saveService, deleteService } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Service>>({});
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const activeCategories = useMemo(
    () => [...categories].filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [categories],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c.nombre])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return services;
    return services.filter(s => {
      const catNombre = s.category_id ? (categoryMap.get(s.category_id) ?? '') : s.categoria;
      return (
        s.nombre.toLowerCase().includes(q) ||
        catNombre.toLowerCase().includes(q) ||
        (s.id_qb != null ? String(s.id_qb).includes(q) : false)
      );
    });
  }, [services, search, categoryMap]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filtered],
  );

  const openNew = () => {
    setForm({ activo: true, nombre: '', category_id: undefined, id_qb: undefined, descripcion: '', categoria: '' });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (s: Service) => {
    setForm({ ...s });
    setEditItem(s);
    setShowForm(true);
  };

  const handleRowClick = (s: Service, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(s);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) {
      toast.error('Nombre del servicio es obligatorio');
      return;
    }
    let idQb: number | undefined;
    if (form.id_qb != null && String(form.id_qb).trim() !== '') {
      const n = Number(form.id_qb);
      if (Number.isNaN(n)) { toast.error('ID QuickBooks debe ser numérico'); return; }
      idQb = n;
    }
    const catId = form.category_id ?? undefined;
    const catNombre = catId ? (categoryMap.get(catId) ?? '') : '';
    const row: Service = editItem
      ? { ...editItem, nombre: form.nombre.trim(), category_id: catId, categoria: catNombre, id_qb: idQb, activo: form.activo ?? true }
      : { id: crypto.randomUUID(), nombre: form.nombre.trim(), category_id: catId, categoria: catNombre, id_qb: idQb, activo: form.activo ?? true };
    const ok = await saveService(row, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Servicio actualizado' : 'Servicio creado');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteService(id);
    if (ok) toast.success('Servicio eliminado');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground shrink-0">SERVICIOS</h1>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 min-w-0">
          <div className="relative w-full max-w-2xl lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, categoría o ID QB..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg bg-card border-border"
            />
          </div>
          <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span>Agregar servicio</span>
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Listado de servicios</h2>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Servicio</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Categorías</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[120px]">ID QB</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No hay servicios{search ? ' que coincidan con la búsqueda' : ''}
                  </td>
                </tr>
              )}
              {sorted.map(s => {
                const catNombre = s.category_id
                  ? (categoryMap.get(s.category_id) ?? s.categoria)
                  : s.categoria;
                return (
                  <tr
                    key={s.id}
                    className="hover:bg-muted/30 cursor-pointer"
                    onClick={e => handleRowClick(s, e)}
                  >
                    <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                    <td className="px-4 py-3 font-medium uppercase text-foreground">{s.nombre}</td>
                    <td className="px-4 py-3 text-muted-foreground uppercase">
                      {catNombre || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {s.id_qb != null ? s.id_qb : '—'}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        aria-label="Eliminar servicio"
                        onClick={() => setDeleteTarget(s)}
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

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre Servicio *</Label>
              <Input
                value={form.nombre ?? ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Sociedad Anónima"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select
                value={form.category_id ?? NO_CATEGORY}
                onValueChange={v => setForm(f => ({ ...f, category_id: v === NO_CATEGORY ? undefined : v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Sin categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Sin categoría</SelectItem>
                  {activeCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID QB</Label>
              <Input
                type="number"
                value={form.id_qb != null ? String(form.id_qb) : ''}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    id_qb: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleSave}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar servicio?</AlertDialogTitle>
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
