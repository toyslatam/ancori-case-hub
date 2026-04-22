import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import { Client } from '@/data/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SearchableCombo, type ComboOption } from '@/components/ui/searchable-combo';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, Search, Filter, ChevronDown, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FILTER_ALL = '__all__';

function toDMY(iso: string): string {
  const d = iso.slice(0, 10).split('-');
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function normDate(iso: string): string {
  return iso.slice(0, 10);
}

function clientTextBlob(c: Client): string {
  const parts = [
    c.nombre,
    c.razon_social,
    c.email,
    c.telefono,
    c.identificacion,
    c.direccion,
    c.observaciones ?? '',
    String(c.numero ?? ''),
  ];
  return parts.join(' ').toLowerCase();
}

function matchesSearch(c: Client, q: string): boolean {
  if (!q.trim()) return true;
  return clientTextBlob(c).includes(q.trim().toLowerCase());
}

type PanelFilters = {
  buscar: string;
  activo: '' | 'activo' | 'inactivo';
  clienteId: string;
  fechaDesde: string;
  fechaHasta: string;
};

const defaultPanelFilters = (): PanelFilters => ({
  buscar: '',
  activo: '',
  clienteId: '',
  fechaDesde: '',
  fechaHasta: '',
});

export default function ClientsPage() {
  const { clients, societies, saveClient, deleteClient } = useApp();
  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFilters, setPanelFilters] = useState<PanelFilters>(defaultPanelFilters);

  const [editItem, setEditItem] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const activoOptions: ComboOption[] = useMemo(
    () => [
      { value: FILTER_ALL, label: 'Todos' },
      { value: 'activo', label: 'Activo' },
      { value: 'inactivo', label: 'Inactivo' },
    ],
    [],
  );
  const clientOptions = useMemo<ComboOption[]>(
    () => [{ value: FILTER_ALL, label: 'Todos' }, ...clients.map(cl => ({ value: cl.id, label: cl.nombre }))],
    [clients],
  );

  const filtered = useMemo(() => {
    return clients.filter(c => {
      if (!matchesSearch(c, search)) return false;
      if (!matchesSearch(c, panelFilters.buscar)) return false;
      if (panelFilters.activo === 'activo' && !c.activo) return false;
      if (panelFilters.activo === 'inactivo' && c.activo) return false;
      if (panelFilters.clienteId && c.id !== panelFilters.clienteId) return false;
      const d = normDate(c.created_at);
      if (panelFilters.fechaDesde && d < panelFilters.fechaDesde) return false;
      if (panelFilters.fechaHasta && d > panelFilters.fechaHasta) return false;
      return true;
    });
  }, [clients, search, panelFilters]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0)),
    [filtered],
  );

  const openNew = () => {
    setForm({ activo: true, nombre: '', razon_social: '', email: '', telefono: '', identificacion: '', direccion: '' });
    setEditItem(null);
    setAdvOpen(false);
    setShowForm(true);
  };

  const openEdit = (c: Client) => {
    setForm({ ...c });
    setEditItem(c);
    setAdvOpen(false);
    setShowForm(true);
  };

  const handleRowClick = (c: Client, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(c);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) {
      toast.error('Nombre cliente es obligatorio');
      return;
    }
    if (saving) return;
    setSaving(true);
    const razon = form.razon_social?.trim() || form.nombre.trim();
    const base = {
      ...form,
      nombre: form.nombre.trim(),
      razon_social: razon,
      email: form.email?.trim() ?? '',
      telefono: form.telefono?.trim() ?? '',
      identificacion: form.identificacion?.trim() ?? '',
      direccion: form.direccion?.trim() ?? '',
      activo: form.activo ?? true,
    };
    const client = editItem
      ? { ...editItem, ...base } as Client
      : {
          ...base,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString().split('T')[0],
          // Dejar que Postgres asigne el correlativo (clients.numero tiene default sequence).
          // Evita colisiones cuando el estado local no está al día o hay varios usuarios creando a la vez.
          numero: undefined,
        } as Client;
    try {
      const ok = await saveClient(client, !!editItem);
      if (!ok) return;
      toast.success(editItem ? 'Cliente actualizado' : 'Cliente creado');
      setShowForm(false);
    } catch (e) {
      console.error(e);
      toast.error(`No se pudo guardar el cliente: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteClient(id);
    if (ok) toast.success('Cliente eliminado');
  };

  const societiesForClient = deleteTarget
    ? societies.filter(s => s.client_id === deleteTarget.id).length
    : 0;

  const clearPanel = () => setPanelFilters(defaultPanelFilters());

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">CLIENTES</h1>
        <Button onClick={openNew} className="gap-1 shrink-0 w-full sm:w-auto">
          <Plus className="h-4 w-4" /> Nueva Cliente
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
          <h2 className="text-lg font-semibold text-foreground">Seguimiento de clientes</h2>
          <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setPanelOpen(true)}>
            <Filter className="h-4 w-4" /> Filtro
          </Button>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Cliente</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Razón Social</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Correo</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Teléfono</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground">Activo</th>
                <th className="px-4 py-3 text-right font-semibold text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    ID
                    <Info className="h-3.5 w-3.5 text-muted-foreground" aria-label="Identificador interno" />
                  </span>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Creado</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[100px]">Acciones</th>
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
                  <td className="px-4 py-3 font-medium uppercase text-foreground max-w-[220px] truncate" title={c.nombre}>
                    {c.nombre}
                  </td>
                  <td className="px-4 py-3 max-w-[220px] truncate text-foreground/90" title={c.razon_social}>
                    {c.razon_social}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate" title={c.email}>{c.email || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.telefono || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {c.activo ? (
                      <Badge variant="success" className="border-green-600 bg-green-50 text-green-800 font-medium">
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactivo
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{c.numero ?? '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{toDMY(c.created_at)}</td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Eliminar cliente"
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
              <SearchableCombo
                options={activoOptions}
                value={panelFilters.activo || FILTER_ALL}
                onChange={v =>
                  setPanelFilters(f => ({
                    ...f,
                    activo: v === FILTER_ALL || !v ? '' : (v as PanelFilters['activo']),
                  }))
                }
                placeholder="Seleccionar activo/inactivo"
                emptyLabel="Sin resultados"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, clienteId: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <SearchableCombo
                options={clientOptions}
                value={panelFilters.clienteId || FILTER_ALL}
                onChange={v =>
                  setPanelFilters(f => ({
                    ...f,
                    clienteId: v === FILTER_ALL || !v ? '' : v,
                  }))
                }
                placeholder="Seleccionar cliente"
                emptyLabel="Sin clientes"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fechas</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs text-muted-foreground"
                  onClick={() => setPanelFilters(f => ({ ...f, fechaDesde: '', fechaHasta: '' }))}
                >
                  Borrar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaDesde}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaDesde: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Desde</span>
                </div>
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaHasta}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaHasta: e.target.value }))}
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
            <DialogTitle>{editItem ? 'Editar Cliente' : 'Nueva Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre Cliente *</Label>
              <Input
                value={form.nombre || ''}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="uppercase"
              />
            </div>
            <div>
              <Label>Razón Social</Label>
              <Input
                value={form.razon_social || ''}
                onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={form.email || ''}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.telefono || ''}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              <Label>Activo</Label>
            </div>
            {editItem && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">ID</span>
                  <p className="font-medium tabular-nums">{editItem.numero ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Creado</span>
                  <p className="font-medium">{toDMY(editItem.created_at)}</p>
                </div>
              </div>
            )}
            <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-1 px-0 text-muted-foreground">
                  <ChevronDown className={cn('h-4 w-4 transition-transform', advOpen && 'rotate-180')} />
                  Datos adicionales (identificación, dirección, QuickBooks)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Identificación</Label>
                    <Input
                      value={form.identificacion || ''}
                      onChange={e => setForm(f => ({ ...f, identificacion: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>QB Customer ID</Label>
                    <Input
                      value={form.quickbooks_customer_id || ''}
                      onChange={e => setForm(f => ({ ...f, quickbooks_customer_id: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input
                    value={form.direccion || ''}
                    onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cliente?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Si eliminas este registro, puede afectar a <strong>sociedades</strong> y otros datos vinculados a este cliente.
                {societiesForClient > 0 && (
                  <span className="block mt-2 text-amber-700 dark:text-amber-500 font-medium">
                    Este cliente tiene {societiesForClient} sociedad(es) asociada(s). La base de datos puede impedir el borrado hasta que las quites o reasignes.
                  </span>
                )}
              </span>
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
