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
    <div className="px-6 py-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Clientes</h1>
            <p className="text-sm text-gray-500 mt-1">Administración de clientes y datos de contacto.</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <div className="relative w-full sm:w-[360px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por nombre, correo o razón social…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={cn(
                  'pl-9 h-11 rounded-lg border border-gray-200 bg-white shadow-sm',
                  'focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-0',
                )}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-lg border-gray-200 bg-white shadow-sm hover:bg-gray-50 gap-2"
                onClick={() => setPanelOpen(true)}
              >
                <Filter className="h-4 w-4" />
                Filtro
              </Button>
              <Button
                onClick={openNew}
                className="h-11 rounded-lg bg-orange-500 hover:bg-orange-600 text-white shadow-sm gap-2"
              >
                <Plus className="h-4 w-4" />
                Nueva cliente
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Lista de clientes</h2>
            <p className="text-xs text-gray-500">{sorted.length} resultado(s)</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Cliente
                  </th>
                  <th className="hidden sm:table-cell px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Estado
                  </th>
                  <th className="hidden md:table-cell px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Creado
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-[84px]">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map(c => (
                  <tr
                    key={c.id}
                    className="hover:bg-gray-50/70 cursor-pointer"
                    onClick={e => handleRowClick(c, e)}
                  >
                    <td className="px-5 py-5">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate" title={c.nombre}>
                          {c.nombre}
                        </p>
                        <p className="mt-1 text-sm text-gray-500 truncate" title={c.email || c.razon_social}>
                          {c.email?.trim() ? c.email : (c.razon_social?.trim() ? c.razon_social : '—')}
                        </p>
                      </div>
                    </td>

                    <td className="hidden sm:table-cell px-5 py-5 text-center">
                      {c.activo ? (
                        <Badge variant="success" className="border-green-600 bg-green-50 text-green-800 font-medium">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-600 border-gray-200">
                          Inactivo
                        </Badge>
                      )}
                    </td>

                    <td className="hidden md:table-cell px-5 py-5 whitespace-nowrap text-gray-500">
                      {toDMY(c.created_at)}
                    </td>

                    <td className="px-5 py-5 text-right" onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-red-50"
                        aria-label="Eliminar cliente"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}

                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">
                      No hay clientes que coincidan con tu búsqueda.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
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
