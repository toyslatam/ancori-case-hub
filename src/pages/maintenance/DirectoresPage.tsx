import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { Director, TIPOS_DOCUMENTO_DIRECTOR, TipoDocumentoDirector } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2, Search, Filter, Info } from 'lucide-react';
import { toast } from 'sonner';

const FILTER_ALL = '__all__';

function toDMY(iso: string): string {
  const d = iso.slice(0, 10).split('-');
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function normDate(iso: string): string {
  return iso.slice(0, 10);
}

function directorTextBlob(d: Director): string {
  const parts = [
    d.nombre,
    d.comentarios,
    d.tipo_documento,
    d.fecha_vencimiento_documento ?? '',
    d.created_at,
  ];
  return parts.join(' ').toLowerCase();
}

function matchesSearch(d: Director, q: string): boolean {
  if (!q.trim()) return true;
  return directorTextBlob(d).includes(q.trim().toLowerCase());
}

type PanelFilters = {
  buscar: string;
  activo: '' | 'activo' | 'inactivo';
  directorId: string;
  tipoDocumento: '' | TipoDocumentoDirector;
  vencDesde: string;
  vencHasta: string;
  fechaCreadoDesde: string;
  fechaCreadoHasta: string;
};

const defaultPanelFilters = (): PanelFilters => ({
  buscar: '',
  activo: '',
  directorId: '',
  tipoDocumento: '',
  vencDesde: '',
  vencHasta: '',
  fechaCreadoDesde: '',
  fechaCreadoHasta: '',
});

export default function DirectoresPage() {
  const { directores, saveDirector, deleteDirector } = useApp();
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFilters, setPanelFilters] = useState<PanelFilters>(defaultPanelFilters);

  const [editItem, setEditItem] = useState<Director | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Director>>({});
  const [deleteTarget, setDeleteTarget] = useState<Director | null>(null);

  const filtered = useMemo(() => {
    return directores.filter(d => {
      if (!matchesSearch(d, search)) return false;
      if (!matchesSearch(d, panelFilters.buscar)) return false;
      if (panelFilters.activo === 'activo' && !d.activo) return false;
      if (panelFilters.activo === 'inactivo' && d.activo) return false;
      if (panelFilters.directorId && d.id !== panelFilters.directorId) return false;
      if (panelFilters.tipoDocumento && d.tipo_documento !== panelFilters.tipoDocumento) return false;

      const fv = d.fecha_vencimiento_documento ? normDate(d.fecha_vencimiento_documento) : '';
      if (panelFilters.vencDesde || panelFilters.vencHasta) {
        if (!fv) return false;
        if (panelFilters.vencDesde && fv < panelFilters.vencDesde) return false;
        if (panelFilters.vencHasta && fv > panelFilters.vencHasta) return false;
      }

      const cr = normDate(d.created_at);
      if (panelFilters.fechaCreadoDesde && cr < panelFilters.fechaCreadoDesde) return false;
      if (panelFilters.fechaCreadoHasta && cr > panelFilters.fechaCreadoHasta) return false;

      return true;
    });
  }, [directores, search, panelFilters]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filtered],
  );

  const openNew = () => {
    setForm({
      activo: true,
      nombre: '',
      comentarios: '',
      tipo_documento: 'Cedula',
      fecha_vencimiento_documento: '',
    });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (d: Director) => {
    setForm({
      ...d,
      fecha_vencimiento_documento: d.fecha_vencimiento_documento ?? '',
    });
    setEditItem(d);
    setShowForm(true);
  };

  const handleRowClick = (d: Director, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(d);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) {
      toast.error('Nombre es obligatorio');
      return;
    }
    const tipoDoc = form.tipo_documento;
    if (!tipoDoc || !TIPOS_DOCUMENTO_DIRECTOR.includes(tipoDoc)) {
      toast.error('Seleccione un tipo de documento válido');
      return;
    }
    const fv = form.fecha_vencimiento_documento?.trim();
    const base = {
      ...form,
      nombre: form.nombre.trim(),
      comentarios: form.comentarios?.trim() ?? '',
      activo: form.activo ?? true,
      tipo_documento: tipoDoc,
      fecha_vencimiento_documento: fv || undefined,
    };
    const row = editItem
      ? { ...editItem, ...base } as Director
      : {
          ...base,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString().split('T')[0],
        } as Director;
    const ok = await saveDirector(row, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Director actualizado' : 'Director creado');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteDirector(id);
    if (ok) toast.success('Director eliminado');
  };

  const clearPanel = () => setPanelFilters(defaultPanelFilters());

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">DIRECTORES</h1>
        <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Nuevo director
        </Button>
      </div>

      <div className="relative w-full max-w-2xl">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 h-11 rounded-lg bg-card border-border"
        />
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Listado de directores</h2>
          <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setPanelOpen(true)}>
            <Filter className="h-4 w-4" /> Filtro
          </Button>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Comentarios</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    Fecha vencimiento documento
                    <Info className="h-3.5 w-3.5 text-muted-foreground" aria-label="Vencimiento del documento de identidad" />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tipo documento</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Creado</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[100px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(d => (
                <tr
                  key={d.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={e => handleRowClick(d, e)}
                >
                  <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                  <td className="px-4 py-3 font-medium uppercase text-foreground max-w-[220px] truncate" title={d.nombre}>
                    {d.nombre}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-foreground/90" title={d.comentarios}>
                    {d.comentarios || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {d.activo ? (
                      <Badge variant="success" className="border-green-600 bg-green-50 text-green-800 font-medium">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactivo
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {d.fecha_vencimiento_documento ? toDMY(d.fecha_vencimiento_documento) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.tipo_documento}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{toDMY(d.created_at)}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Eliminar director"
                      onClick={() => setDeleteTarget(d)}
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

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border p-4 space-y-1 text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>Filtros</SheetTitle>
              <Button type="button" variant="link" className="h-auto p-0 text-primary" onClick={clearPanel}>
                Borrar todo
              </Button>
            </div>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Buscar</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, buscar: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-9"
                  value={panelFilters.buscar}
                  onChange={e => setPanelFilters(f => ({ ...f, buscar: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Activo</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, activo: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.activo || FILTER_ALL}
                onValueChange={v =>
                  setPanelFilters(f => ({ ...f, activo: v === FILTER_ALL ? '' : (v as PanelFilters['activo']) }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Activo / Inactivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Director</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, directorId: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.directorId || FILTER_ALL}
                onValueChange={v => setPanelFilters(f => ({ ...f, directorId: v === FILTER_ALL ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar director" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos</SelectItem>
                  {directores.map(dr => (
                    <SelectItem key={dr.id} value={dr.id}>
                      {dr.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Tipo documento</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, tipoDocumento: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.tipoDocumento || FILTER_ALL}
                onValueChange={v =>
                  setPanelFilters(f => ({
                    ...f,
                    tipoDocumento: v === FILTER_ALL ? '' : (v as TipoDocumentoDirector),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo documento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos</SelectItem>
                  {TIPOS_DOCUMENTO_DIRECTOR.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Vencimiento documento</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, vencDesde: '', vencHasta: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="date"
                    value={panelFilters.vencDesde}
                    onChange={e => setPanelFilters(f => ({ ...f, vencDesde: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Desde</span>
                </div>
                <div>
                  <Input
                    type="date"
                    value={panelFilters.vencHasta}
                    onChange={e => setPanelFilters(f => ({ ...f, vencHasta: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Hasta</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fecha creado</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, fechaCreadoDesde: '', fechaCreadoHasta: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaCreadoDesde}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaCreadoDesde: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Desde</span>
                </div>
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaCreadoHasta}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaCreadoHasta: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Hasta</span>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar director' : 'Nuevo director'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.nombre || ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="uppercase"
              />
            </div>
            <div>
              <Label>Comentarios</Label>
              <Textarea
                value={form.comentarios || ''}
                onChange={e => setForm(f => ({ ...f, comentarios: e.target.value }))}
                rows={3}
                className="resize-y min-h-[80px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              <Label>Activo</Label>
            </div>
            <div>
              <Label>Fecha vencimiento documento</Label>
              <Input
                type="date"
                value={form.fecha_vencimiento_documento?.slice(0, 10) || ''}
                onChange={e => setForm(f => ({ ...f, fecha_vencimiento_documento: e.target.value }))}
                className="bg-background"
              />
            </div>
            <div>
              <Label>Tipo documento *</Label>
              <Select
                value={form.tipo_documento ?? 'Cedula'}
                onValueChange={v => setForm(f => ({ ...f, tipo_documento: v as TipoDocumentoDirector }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO_DIRECTOR.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editItem && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Creado</span>
                <p className="font-medium">{toDMY(editItem.created_at)}</p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => void handleSave()}>Guardar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este director?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El registro se eliminará de la lista de directores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
            >
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
