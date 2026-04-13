import { useMemo, useState, MouseEvent } from 'react';
import { useApp } from '@/context/AppContext';
import {
  Society,
  TIPOS_SOCIEDAD,
  TipoSociedad,
  semestreFromFechaInscripcion,
} from '@/data/mockData';
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
import { Plus, Trash2, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const FILTER_ALL = '__all__';
const FILTER_NONE = '__none__';

function toDMY(iso: string): string {
  const d = iso.slice(0, 10).split('-');
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function normDate(iso: string): string {
  return iso.slice(0, 10);
}

function societyTextBlob(
  s: Society,
  clientName: string,
  pres: string,
  tes: string,
  sec: string,
): string {
  const parts = [
    s.nombre,
    s.razon_social,
    s.tipo_sociedad,
    s.correo,
    clientName,
    String(s.id_qb ?? ''),
    s.ruc,
    s.dv,
    s.nit,
    pres,
    tes,
    sec,
    s.pago_tasa_unica,
    s.fecha_inscripcion ?? '',
    s.created_at,
  ];
  return parts.join(' ').toLowerCase();
}

function matchesSearch(
  s: Society,
  q: string,
  getClientName: (id?: string) => string,
  getDirectorName: (id?: string) => string,
): boolean {
  if (!q.trim()) return true;
  const blob = societyTextBlob(
    s,
    getClientName(s.client_id),
    getDirectorName(s.presidente_id),
    getDirectorName(s.tesorero_id),
    getDirectorName(s.secretario_id),
  );
  return blob.includes(q.trim().toLowerCase());
}

function tipoSociedadBadgeClass(tipo: TipoSociedad): string {
  switch (tipo) {
    case 'SOCIEDADES':
      return 'border-green-600 bg-green-50 text-green-800';
    case 'FUNDACIONES':
      return 'border-blue-600 bg-blue-50 text-blue-800';
    case 'B.V.I':
      return 'border-violet-600 bg-violet-50 text-violet-800';
    default:
      return 'border-border text-muted-foreground';
  }
}

type PanelFilters = {
  buscar: string;
  tipoSociedad: '' | TipoSociedad;
  clienteId: string;
  societyId: string;
  fechaInscDesde: string;
  fechaInscHasta: string;
  semestre: '' | '1' | '2';
};

const defaultPanelFilters = (): PanelFilters => ({
  buscar: '',
  tipoSociedad: '',
  clienteId: '',
  societyId: '',
  fechaInscDesde: '',
  fechaInscHasta: '',
  semestre: '',
});

export default function SocietiesPage() {
  const {
    societies,
    clients,
    directores,
    cases,
    saveSociety,
    deleteSociety,
    getClientName,
    getDirectorName,
  } = useApp();

  const [search, setSearch] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFilters, setPanelFilters] = useState<PanelFilters>(defaultPanelFilters);

  const [editItem, setEditItem] = useState<Society | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Society>>({});
  const [deleteTarget, setDeleteTarget] = useState<Society | null>(null);

  const filtered = useMemo(() => {
    return societies.filter(s => {
      if (!matchesSearch(s, search, getClientName, getDirectorName)) return false;
      if (!matchesSearch(s, panelFilters.buscar, getClientName, getDirectorName)) return false;
      if (panelFilters.tipoSociedad && s.tipo_sociedad !== panelFilters.tipoSociedad) return false;
      if (panelFilters.clienteId && s.client_id !== panelFilters.clienteId) return false;
      if (panelFilters.societyId && s.id !== panelFilters.societyId) return false;

      const fi = s.fecha_inscripcion ? normDate(s.fecha_inscripcion) : '';
      if (panelFilters.fechaInscDesde || panelFilters.fechaInscHasta) {
        if (!fi) return false;
        if (panelFilters.fechaInscDesde && fi < panelFilters.fechaInscDesde) return false;
        if (panelFilters.fechaInscHasta && fi > panelFilters.fechaInscHasta) return false;
      }

      if (panelFilters.semestre) {
        const sem = semestreFromFechaInscripcion(s.fecha_inscripcion);
        if (sem == null || String(sem) !== panelFilters.semestre) return false;
      }

      return true;
    });
  }, [societies, search, panelFilters, getClientName, getDirectorName]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [filtered],
  );

  const openNew = () => {
    setForm({
      activo: true,
      nombre: '',
      razon_social: '',
      tipo_sociedad: 'SOCIEDADES',
      correo: '',
      telefono: '',
      ruc: '',
      dv: '',
      nit: '',
      pago_tasa_unica: '',
      fecha_inscripcion: '',
      cliente_id: clients[0]?.id ?? '',
    });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (s: Society) => {
    setForm({
      ...s,
      fecha_inscripcion: s.fecha_inscripcion ?? '',
    });
    setEditItem(s);
    setShowForm(true);
  };

  const handleRowClick = (s: Society, e: MouseEvent<HTMLTableRowElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    openEdit(s);
  };

  const handleSave = async () => {
    if (!form.nombre?.trim()) {
      toast.error('Nombre sociedad es obligatorio');
      return;
    }
    if (!form.client_id?.trim()) {
      toast.error('Cliente es obligatorio');
      return;
    }
    const tipo = form.tipo_sociedad;
    if (!tipo || !TIPOS_SOCIEDAD.includes(tipo)) {
      toast.error('Seleccione un tipo de sociedad válido');
      return;
    }
    let idQb: number | undefined;
    if (form.id_qb != null && String(form.id_qb).trim() !== '') {
      const n = Number(form.id_qb);
      if (Number.isNaN(n)) {
        toast.error('ID_QB debe ser numérico');
        return;
      }
      idQb = n;
    }
    const base: Partial<Society> = {
      ...form,
      nombre: form.nombre.trim(),
      razon_social: form.razon_social?.trim() ?? '',
      tipo_sociedad: tipo,
      correo: form.correo?.trim() ?? '',
      telefono: form.telefono?.trim() ?? '',
      id_qb: idQb,
      ruc: form.ruc?.trim() ?? '',
      dv: form.dv?.trim() ?? '',
      nit: form.nit?.trim() ?? '',
      pago_tasa_unica: form.pago_tasa_unica?.trim() ?? '',
      fecha_inscripcion: form.fecha_inscripcion?.trim() || undefined,
      activo: form.activo ?? true,
    };
    const society = editItem
      ? { ...editItem, ...base } as Society
      : {
          ...base,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString().split('T')[0],
        } as Society;
    const ok = await saveSociety(society, !!editItem);
    if (!ok) return;
    toast.success(editItem ? 'Sociedad actualizada' : 'Sociedad creada');
    setShowForm(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    const ok = await deleteSociety(id);
    if (ok) toast.success('Sociedad eliminada');
  };

  const casesForSociety = deleteTarget
    ? cases.filter(c => c.society_id === deleteTarget.id).length
    : 0;

  const semestreForm = semestreFromFechaInscripcion(form.fecha_inscripcion);

  const clearPanel = () => setPanelFilters(defaultPanelFilters());

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-foreground shrink-0">SOCIEDADES</h1>
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
            <Plus className="h-4 w-4" /> Nueva Sociedad
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Seguimiento de sociedades</h2>
          <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={() => setPanelOpen(true)}>
            <Filter className="h-4 w-4" /> Filtro
          </Button>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="bg-muted/50 sticky top-0 z-[1]">
              <tr>
                <th className="w-1 p-0 bg-border" aria-hidden />
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nombre Sociedad</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">RUC</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">DV</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">NIT</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Presidente</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Tesorero</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Secretario</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Fecha Inscripcion</th>
                <th className="px-4 py-3 text-center font-semibold text-muted-foreground w-[88px]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map(s => (
                <tr
                  key={s.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={e => handleRowClick(s, e)}
                >
                  <td className="w-1 p-0 bg-muted-foreground/20" aria-hidden />
                  <td className="px-4 py-3 font-medium uppercase text-foreground max-w-[220px] truncate" title={s.nombre}>
                    {s.nombre}
                  </td>
                  <td className="px-4 py-3 max-w-[180px] truncate" title={getClientName(s.client_id)}>
                    {getClientName(s.client_id) || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={cn('font-semibold', tipoSociedadBadgeClass(s.tipo_sociedad))}>
                      {s.tipo_sociedad}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.ruc || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.dv || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{s.nit || '—'}</td>
                  <td className="px-4 py-3 max-w-[140px] truncate" title={getDirectorName(s.presidente_id)}>
                    {getDirectorName(s.presidente_id) || '—'}
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate" title={getDirectorName(s.tesorero_id)}>
                    {getDirectorName(s.tesorero_id) || '—'}
                  </td>
                  <td className="px-4 py-3 max-w-[140px] truncate" title={getDirectorName(s.secretario_id)}>
                    {getDirectorName(s.secretario_id) || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {s.fecha_inscripcion ? toDMY(s.fecha_inscripcion) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label="Eliminar sociedad"
                      onClick={() => setDeleteTarget(s)}
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
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, buscar: '' }))}>
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
                <Label>Tipo Sociedad</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, tipoSociedad: '' }))}>
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.tipoSociedad || FILTER_ALL}
                onValueChange={v =>
                  setPanelFilters(f => ({
                    ...f,
                    tipoSociedad: v === FILTER_ALL ? '' : (v as TipoSociedad),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Seleccionar Estado</SelectItem>
                  {TIPOS_SOCIEDAD.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cliente</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, clienteId: '' }))}>
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.clienteId || FILTER_ALL}
                onValueChange={v => setPanelFilters(f => ({ ...f, clienteId: v === FILTER_ALL ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar Cliente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Seleccionar Cliente</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sociedad</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, societyId: '' }))}>
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.societyId || FILTER_ALL}
                onValueChange={v => setPanelFilters(f => ({ ...f, societyId: v === FILTER_ALL ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar Sociedad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Seleccionar Sociedad</SelectItem>
                  {societies.map(so => (
                    <SelectItem key={so.id} value={so.id}>{so.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Semestre (según fecha inscripción)</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, semestre: '' }))}>
                  Borrar
                </Button>
              </div>
              <Select
                value={panelFilters.semestre || FILTER_ALL}
                onValueChange={v =>
                  setPanelFilters(f => ({
                    ...f,
                    semestre: v === FILTER_ALL ? '' : (v as '1' | '2'),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Semestre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>Todos</SelectItem>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fechas</Label>
                <Button type="button" variant="link" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setPanelFilters(f => ({ ...f, fechaInscDesde: '', fechaInscHasta: '' }))}>
                  Borrar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaInscDesde}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaInscDesde: e.target.value }))}
                    className="bg-background"
                  />
                  <span className="text-xs text-muted-foreground mt-1 block">Desde</span>
                </div>
                <div>
                  <Input
                    type="date"
                    value={panelFilters.fechaInscHasta}
                    onChange={e => setPanelFilters(f => ({ ...f, fechaInscHasta: e.target.value }))}
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
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Editar Sociedad' : 'Nueva Sociedad'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre Sociedad *</Label>
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
            <div>
              <Label>Tipo de Sociedad *</Label>
              <Select
                value={form.tipo_sociedad ?? 'SOCIEDADES'}
                onValueChange={v => setForm(f => ({ ...f, tipo_sociedad: v as TipoSociedad }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_SOCIEDAD.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Correo</Label>
              <Input
                type="email"
                value={form.correo || ''}
                onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
              />
            </div>
            <div>
              <Label>Cliente *</Label>
              <Select
                value={form.client_id || ''}
                onValueChange={v => setForm(f => ({ ...f, client_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ID_QB</Label>
              <Input
                type="number"
                value={form.id_qb != null && !Number.isNaN(Number(form.id_qb)) ? String(form.id_qb) : ''}
                onChange={e => setForm(f => ({ ...f, id_qb: e.target.value === '' ? undefined : Number(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>RUC</Label>
                <Input value={form.ruc || ''} onChange={e => setForm(f => ({ ...f, ruc: e.target.value }))} />
              </div>
              <div>
                <Label>DV</Label>
                <Input value={form.dv || ''} onChange={e => setForm(f => ({ ...f, dv: e.target.value }))} />
              </div>
              <div>
                <Label>NIT</Label>
                <Input value={form.nit || ''} onChange={e => setForm(f => ({ ...f, nit: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Presidente</Label>
              <Select
                value={form.presidente_id || FILTER_NONE}
                onValueChange={v => setForm(f => ({ ...f, presidente_id: v === FILTER_NONE ? undefined : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar director" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_NONE}>— Sin asignar —</SelectItem>
                  {directores.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tesorero</Label>
              <Select
                value={form.tesorero_id || FILTER_NONE}
                onValueChange={v => setForm(f => ({ ...f, tesorero_id: v === FILTER_NONE ? undefined : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar director" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_NONE}>— Sin asignar —</SelectItem>
                  {directores.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Secretario</Label>
              <Select
                value={form.secretario_id || FILTER_NONE}
                onValueChange={v => setForm(f => ({ ...f, secretario_id: v === FILTER_NONE ? undefined : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar director" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_NONE}>— Sin asignar —</SelectItem>
                  {directores.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pago Tasa Única</Label>
              <Input value={form.pago_tasa_unica || ''} onChange={e => setForm(f => ({ ...f, pago_tasa_unica: e.target.value }))} />
            </div>
            <div>
              <Label>Fecha Inscripción</Label>
              <Input
                type="date"
                value={form.fecha_inscripcion?.slice(0, 10) || ''}
                onChange={e => setForm(f => ({ ...f, fecha_inscripcion: e.target.value }))}
                className="bg-background"
              />
            </div>
            <div>
              <Label>Semestre</Label>
              <Input readOnly className="bg-muted" value={semestreForm != null ? String(semestreForm) : '—'} />
              <p className="text-xs text-muted-foreground mt-1">Calculado según el mes de la fecha de inscripción (1–6 → 1, 7–12 → 2).</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.activo ?? true} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
              <Label>Activo</Label>
            </div>
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
            <AlertDialogTitle>¿Eliminar esta sociedad?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Esta acción no se puede deshacer.</span>
              {casesForSociety > 0 && (
                <span className="block text-amber-700 dark:text-amber-500 font-medium">
                  Hay {casesForSociety} caso(s) vinculado(s) a esta sociedad. La base puede impedir el borrado hasta reasignarlos.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void confirmDelete()}>Eliminar</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
