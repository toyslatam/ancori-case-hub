import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { Etapa } from '@/data/mockData';
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
import { Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function EtapasPage() {
  const { etapas, saveEtapa, deleteEtapa } = useApp();
  const [search, setSearch] = useState('');
  const [editItem, setEditItem] = useState<Etapa | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Etapa>>({});
  const [deleteTarget, setDeleteTarget] = useState<Etapa | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return etapas;
    return etapas.filter(e =>
      e.nombre.toLowerCase().includes(q) || String(e.n_etapa).includes(q),
    );
  }, [etapas, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.n_etapa - b.n_etapa),
    [filtered],
  );

  const openNew = () => {
    const next = etapas.length > 0 ? Math.max(...etapas.map(e => e.n_etapa)) + 1 : 1;
    setForm({ activo: true, nombre: '', n_etapa: next });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (e: Etapa) => {
    setForm({ ...e });
    setEditItem(e);
    setShowForm(true);
  };

  const handleRowClick = (e: Etapa, ev: MouseEvent<HTMLTableRowElement>) => {
    if ((ev.target as HTMLElement).closest('button')) return;
    openEdit(e);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) { toast.error('Nombre de etapa es obligatorio'); return; }
    const nEtapa = Number(form.n_etapa);
    if (!form.n_etapa || Number.isNaN(nEtapa) || nEtapa < 1) {
      toast.error('N° Etapa debe ser un número positivo');
      return;
    }
    const row: Etapa = editItem
      ? { ...editItem, nombre: form.nombre.trim(), n_etapa: nEtapa, activo: form.activo ?? true }
      : { id: crypto.randomUUID(), nombre: form.nombre.trim(), n_etapa: nEtapa, activo: form.activo ?? true };
    const ok = await saveEtapa(row, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Etapa actualizada' : 'Etapa creada');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteEtapa(id);
    if (ok) toast.success('Etapa eliminada');
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground shrink-0">ETAPAS</h1>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4 min-w-0">
          <div className="relative w-full max-w-2xl lg:max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o número…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-lg bg-card border-border"
            />
          </div>
          <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            <span>Agregar etapa</span>
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Listado de etapas</h2>
          <span className="text-xs text-muted-foreground">{sorted.length} etapa{sorted.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground w-[90px]">N° Etapa</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Etapa</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No hay etapas{search ? ' que coincidan con la búsqueda' : ''}
                  </td>
                </tr>
              )}
              {sorted.map(e => (
                <tr
                  key={e.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={ev => handleRowClick(e, ev)}
                >
                  <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
                      {e.n_etapa}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{e.nombre}</td>
                  <td className="px-4 py-3 text-center" onClick={ev => ev.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Eliminar etapa"
                      onClick={() => setDeleteTarget(e)}
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
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar etapa' : 'Nueva etapa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>N° Etapa *</Label>
              <Input
                type="number"
                min={1}
                value={form.n_etapa != null ? String(form.n_etapa) : ''}
                onChange={e => setForm(f => ({ ...f, n_etapa: e.target.value === '' ? undefined : Number(e.target.value) }))}
                placeholder="Ej. 1"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Nombre Etapa *</Label>
              <Input
                value={form.nombre ?? ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Solicitud"
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
            <AlertDialogTitle>¿Eliminar etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará «{deleteTarget?.nombre}». Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
