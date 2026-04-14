import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { Category } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function CategoriesPage() {
  const { categories, saveCategory, deleteCategory } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Category>>({});
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(c => {
      const idQb = c.id_qb != null ? String(c.id_qb) : '';
      return c.nombre.toLowerCase().includes(q) || idQb.includes(q);
    });
  }, [categories, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filtered],
  );

  const openNew = () => {
    setForm({ activo: true, nombre: '', id_qb: undefined });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (c: Category) => {
    setForm({ ...c });
    setEditItem(c);
    setShowForm(true);
  };

  const handleRowClick = (c: Category, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(c);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) {
      toast.error('Nombre de categoría es obligatorio');
      return;
    }
    let idQb: number | undefined;
    if (form.id_qb != null && String(form.id_qb).trim() !== '') {
      const n = Number(form.id_qb);
      if (Number.isNaN(n)) {
        toast.error('ID QuickBooks debe ser numérico');
        return;
      }
      idQb = n;
    }
    const row: Category = editItem
      ? {
          ...editItem,
          nombre: form.nombre.trim(),
          id_qb: idQb,
          activo: form.activo ?? true,
        }
      : {
          id: crypto.randomUUID(),
          nombre: form.nombre.trim(),
          id_qb: idQb,
          activo: form.activo ?? true,
          created_at: new Date().toISOString().split('T')[0],
        };
    const ok = await saveCategory(row, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Categoría actualizada' : 'Categoría creada');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteCategory(id);
    if (ok) toast.success('Categoría eliminada');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground shrink-0">CATEGORÍAS</h1>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 min-w-0">
          <div className="relative w-full max-w-2xl lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg bg-card border-border"
            />
          </div>
          <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span className="sm:inline">Agregar categoría</span>
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Listado de categorías</h2>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre categoría</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[120px]">ID QuickBooks</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={e => handleRowClick(c, e)}
                >
                  <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                  <td className="px-4 py-3 font-medium uppercase text-foreground max-w-[min(100vw,640px)]" title={c.nombre}>
                    {c.nombre}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {c.id_qb != null && !Number.isNaN(Number(c.id_qb)) ? c.id_qb : '—'}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Eliminar categoría"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre categoría *</Label>
              <Input
                value={form.nombre ?? ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. CONSTITUCION DE PERSONA JURÍDICA"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>ID QuickBooks</Label>
              <Input
                type="number"
                value={form.id_qb != null && !Number.isNaN(Number(form.id_qb)) ? String(form.id_qb) : ''}
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
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
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
