import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CASE_ESTADOS, CASE_PRIORIDADES, formatNTarea } from '@/data/mockData';
import {
  BarChart3, Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  X, FileText, Users, Building2, Briefcase, TrendingUp, DollarSign,
  AlertTriangle, Clock, PieChart as PieIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area,
} from 'recharts';

/* ================================================================== */
/*  Constantes                                                         */
/* ================================================================== */

const ESTADO_COLORS: Record<string, string> = {
  'Pendiente': '#f59e0b',
  'En Curso': '#3b82f6',
  'Completado/Facturado': '#10b981',
  'Cancelado': '#9ca3af',
};

const ESTADO_BADGE: Record<string, string> = {
  'Pendiente': 'bg-yellow-100 text-yellow-800',
  'En Curso': 'bg-blue-100 text-blue-800',
  'Completado/Facturado': 'bg-green-100 text-green-800',
  'Cancelado': 'bg-gray-100 text-gray-500',
};

const PRIORIDAD_BADGE: Record<string, string> = {
  'Baja': 'bg-slate-100 text-slate-600',
  'Media': 'bg-amber-100 text-amber-700',
  'Urgente': 'bg-red-100 text-red-700',
};

const BAR_COLORS = ['#ea580c', '#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const ALL = '__all__';
const PAGE_SIZE = 20;
const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

function fmtMoney(n?: number | null): string {
  if (n == null) return '—';
  return `B/. ${n.toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function diasVenc(fechaVenc?: string): number | null {
  if (!fechaVenc) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(fechaVenc + 'T00:00:00');
  return Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
}

function exportToCSV(
  rows: Array<Record<string, string | number>>,
  headers: { key: string; label: string }[],
  filename: string,
) {
  const BOM = '\uFEFF';
  const headerLine = headers.map(h => `"${h.label}"`).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => {
      const v = row[h.key] ?? '';
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','),
  );
  const csv = BOM + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label || payload[0]?.name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name ?? 'Valor'}: <strong>{typeof p.value === 'number' ? p.value.toLocaleString('es-PA') : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Componente auxiliar: MiniStat                                       */
/* ================================================================== */

function MiniStat({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className={cn('rounded-lg p-4 text-white shadow-sm', color)}>
      <div className="flex items-center gap-3">
        <div className="opacity-70">{icon}</div>
        <div>
          <p className="text-xs opacity-80">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Componente auxiliar: Tabla con sort + paginacion + export           */
/* ================================================================== */

type ColDef = { key: string; label: string; cls?: string; render?: (v: any, row: any) => React.ReactNode };

function ReportTable({
  data, columns, exportFilename,
}: {
  data: Record<string, any>[];
  columns: ColDef[];
  exportFilename: string;
}) {
  const [sortKey, setSortKey] = useState(columns[0]?.key || '');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const rows = [...data];
    rows.sort((a, b) => {
      let va = a[sortKey] ?? '';
      let vb = b[sortKey] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [data, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when data changes
  useMemo(() => setPage(0), [data.length]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  function handleExport() {
    const headers = columns.map(c => ({ key: c.key, label: c.label }));
    const rows = sorted.map(row => {
      const r: Record<string, string | number> = {};
      for (const c of columns) r[c.key] = row[c.key] ?? '';
      return r;
    });
    exportToCSV(rows, headers, exportFilename);
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <p className="text-xs text-muted-foreground">{sorted.length} registro{sorted.length !== 1 ? 's' : ''}</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" /> Exportar Excel
        </Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={cn('px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap', col.cls)}
                  onClick={() => toggleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr><td colSpan={columns.length} className="text-center py-10 text-muted-foreground">Sin datos para los filtros seleccionados</td></tr>
            ) : pageData.map((row, i) => (
              <tr key={row._id || i} className={cn('border-b border-border/50 hover:bg-blue-50/40', i % 2 === 1 && 'bg-muted/20')}>
                {columns.map(col => (
                  <td key={col.key} className={cn('px-3 py-2 text-muted-foreground', col.cls)}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">Pag. {page + 1} de {totalPages}</p>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Filtros compartidos                                                */
/* ================================================================== */

function SharedFilters({
  filterAnio, setFilterAnio, filterMes, setFilterMes, filterEstado, setFilterEstado,
  filterServicio, setFilterServicio, filterCliente, setFilterCliente,
  anios, servicios, clientes, onLimpiar, hayFiltros,
}: any) {
  return (
    <Card className="shadow-sm mb-5">
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[110px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Ano</label>
            <Select value={filterAnio} onValueChange={setFilterAnio}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {anios.map((a: string) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[130px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Mes</label>
            <Select value={filterMes} onValueChange={setFilterMes}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {MESES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[170px]">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Estado</label>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Proceso</label>
            <Select value={filterServicio} onValueChange={setFilterServicio}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {servicios.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cliente</label>
            <Select value={filterCliente} onValueChange={setFilterCliente}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos</SelectItem>
                {clientes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {hayFiltros && (
            <Button variant="ghost" size="sm" onClick={onLimpiar} className="h-9 text-xs gap-1 text-muted-foreground">
              <X className="h-3.5 w-3.5" /> Limpiar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  ReportesPage                                                       */
/* ================================================================== */

export default function ReportesPage() {
  const {
    cases, clients, services, societies, usuarios,
    getClientName, getSocietyName, getServiceName, getUsuarioName,
  } = useApp();

  // ── Filtros ──────────────────────────────────────────────────
  const [filterAnio, setFilterAnio] = useState(ALL);
  const [filterMes, setFilterMes] = useState(ALL);
  const [filterEstado, setFilterEstado] = useState(ALL);
  const [filterServicio, setFilterServicio] = useState(ALL);
  const [filterCliente, setFilterCliente] = useState(ALL);

  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) { if (c.fecha_caso) set.add(c.fecha_caso.slice(0, 4)); }
    return [...set].sort().reverse();
  }, [cases]);

  const serviciosActivos = useMemo(() => services.filter(s => s.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)), [services]);
  const clientesActivos = useMemo(() => clients.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)), [clients]);
  const hayFiltros = filterAnio !== ALL || filterMes !== ALL || filterEstado !== ALL || filterServicio !== ALL || filterCliente !== ALL;

  function limpiarFiltros() {
    setFilterAnio(ALL); setFilterMes(ALL); setFilterEstado(ALL); setFilterServicio(ALL); setFilterCliente(ALL);
  }

  const filtered = useMemo(() => cases.filter(c => {
    if (filterAnio !== ALL && c.fecha_caso && c.fecha_caso.slice(0, 4) !== filterAnio) return false;
    if (filterMes !== ALL && c.fecha_caso) { const m = parseInt(c.fecha_caso.slice(5, 7), 10); if (String(m) !== filterMes) return false; }
    if (filterEstado !== ALL && c.estado !== filterEstado) return false;
    if (filterServicio !== ALL && c.service_id !== filterServicio) return false;
    if (filterCliente !== ALL && c.client_id !== filterCliente) return false;
    return true;
  }), [cases, filterAnio, filterMes, filterEstado, filterServicio, filterCliente]);

  // ── Invoices (all, filtered later by society/client match)
  const allInvoices = useMemo(() => {
    const invs: any[] = [];
    for (const c of cases) {
      const caseInvoices = Array.isArray(c.invoices) ? c.invoices : [];
      for (const inv of caseInvoices) {
        invs.push({ ...inv, _caseId: c.id, _clientId: c.client_id, _societyId: inv.society_id || c.society_id });
      }
    }
    return invs;
  }, [cases]);

  const filteredInvoices = useMemo(() => {
    if (filterCliente === ALL) return allInvoices;
    return allInvoices.filter(inv => inv._clientId === filterCliente);
  }, [allInvoices, filterCliente]);

  // ── Shared filter props
  const filterProps = {
    filterAnio, setFilterAnio, filterMes, setFilterMes, filterEstado, setFilterEstado,
    filterServicio, setFilterServicio, filterCliente, setFilterCliente,
    anios: aniosDisponibles, servicios: serviciosActivos, clientes: clientesActivos,
    onLimpiar: limpiarFiltros, hayFiltros,
  };

  // ==================================================================
  //  TAB 1: REPORTE OPERATIVO (CASOS)
  // ==================================================================
  const opKpi = useMemo(() => ({
    total: filtered.length,
    pendiente: filtered.filter(c => c.estado === 'Pendiente').length,
    enCurso: filtered.filter(c => c.estado === 'En Curso').length,
    completado: filtered.filter(c => c.estado === 'Completado/Facturado').length,
    cancelado: filtered.filter(c => c.estado === 'Cancelado').length,
    urgente: filtered.filter(c => c.prioridad === 'Urgente' || c.prioridad_urgente).length,
  }), [filtered]);

  const donutEstado = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of filtered) m[c.estado] = (m[c.estado] || 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const barProceso = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of filtered) { const s = c.service_id ? getServiceName(c.service_id) : 'Sin proceso'; m[s] = (m[s] || 0) + 1; }
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered, getServiceName]);

  const barPrioridad = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of filtered) { const p = c.prioridad || 'Sin prioridad'; m[p] = (m[p] || 0) + 1; }
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const tendenciaMensual = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of filtered) {
      if (c.fecha_caso) { const key = c.fecha_caso.slice(0, 7); m[key] = (m[key] || 0) + 1; }
    }
    return Object.entries(m).sort().map(([mes, casos]) => ({
      mes: mes.slice(5) + '/' + mes.slice(2, 4),
      casos,
    }));
  }, [filtered]);

  const opTableData = useMemo(() => filtered.map(c => ({
    _id: c.id,
    caso: formatNTarea(c.n_tarea) || c.numero_caso,
    descripcion: c.descripcion || '',
    proceso: c.service_id ? getServiceName(c.service_id) : '',
    estado: c.estado,
    prioridad: c.prioridad || '',
    usuario: c.usuario_asignado_id ? getUsuarioName(c.usuario_asignado_id) : (c.responsable || ''),
    fecha_ingreso: fmtDate(c.fecha_caso),
    fecha_seguimiento: fmtDate(c.fecha_vencimiento),
    dias: diasVenc(c.fecha_vencimiento),
  })), [filtered, getServiceName, getUsuarioName]);

  // ==================================================================
  //  TAB 2: REPORTE POR USUARIO
  // ==================================================================
  const byUsuario = useMemo(() => {
    const m = new Map<string, { nombre: string; total: number; pendiente: number; enCurso: number; completado: number; urgente: number }>();
    for (const c of filtered) {
      const key = c.usuario_asignado_id || '__none__';
      const nombre = c.usuario_asignado_id ? getUsuarioName(c.usuario_asignado_id) : (c.responsable || 'Sin asignar');
      if (!m.has(key)) m.set(key, { nombre, total: 0, pendiente: 0, enCurso: 0, completado: 0, urgente: 0 });
      const e = m.get(key)!;
      e.total++;
      if (c.estado === 'Pendiente') e.pendiente++;
      if (c.estado === 'En Curso') e.enCurso++;
      if (c.estado === 'Completado/Facturado') e.completado++;
      if (c.prioridad === 'Urgente' || c.prioridad_urgente) e.urgente++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtered, getUsuarioName]);

  const barUsuario = useMemo(() => byUsuario.map(u => ({
    name: u.nombre.length > 18 ? u.nombre.slice(0, 16) + '...' : u.nombre,
    Pendiente: u.pendiente, 'En Curso': u.enCurso, Completado: u.completado,
  })), [byUsuario]);

  // ==================================================================
  //  TAB 3: REPORTE POR CLIENTE
  // ==================================================================
  const byCliente = useMemo(() => {
    const m = new Map<string, { nombre: string; total: number; pendiente: number; completado: number; urgente: number; sociedades: number }>();
    for (const c of filtered) {
      const key = c.client_id || '__none__';
      const nombre = c.client_id ? getClientName(c.client_id) : 'Sin cliente';
      if (!m.has(key)) {
        const numSoc = c.client_id ? societies.filter(s => s.client_id === c.client_id && s.activo).length : 0;
        m.set(key, { nombre, total: 0, pendiente: 0, completado: 0, urgente: 0, sociedades: numSoc });
      }
      const e = m.get(key)!;
      e.total++;
      if (c.estado === 'Pendiente') e.pendiente++;
      if (c.estado === 'Completado/Facturado') e.completado++;
      if (c.prioridad === 'Urgente' || c.prioridad_urgente) e.urgente++;
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [filtered, getClientName, societies]);

  // ==================================================================
  //  TAB 4: REPORTE FINANCIERO
  // ==================================================================
  const finKpi = useMemo(() => {
    let totalFacturado = 0, totalImpuesto = 0, totalPendiente = 0, totalEnviado = 0, countPend = 0, countEnv = 0;
    for (const inv of filteredInvoices) {
      totalFacturado += inv.total || 0;
      totalImpuesto += inv.impuesto || 0;
      if (inv.estado === 'pendiente' || inv.estado === 'borrador') { totalPendiente += inv.total || 0; countPend++; }
      if (inv.estado === 'enviada') { totalEnviado += inv.total || 0; countEnv++; }
    }
    return { totalFacturado, totalImpuesto, totalPendiente, totalEnviado, countPend, countEnv, countTotal: filteredInvoices.length };
  }, [filteredInvoices]);

  const finTableData = useMemo(() => filteredInvoices.map(inv => ({
    _id: inv.id,
    numero: inv.numero_factura || '—',
    sociedad: inv._societyId ? getSocietyName(inv._societyId) : '—',
    fecha: fmtDate(inv.fecha_factura),
    vencimiento: fmtDate(inv.fecha_vencimiento),
    subtotal: fmtMoney(inv.subtotal),
    impuesto: fmtMoney(inv.impuesto),
    total: fmtMoney(inv.total),
    estado: inv.estado,
    qb: inv.qb_invoice_id ? 'Si' : 'No',
    _subtotal: inv.subtotal || 0,
    _total: inv.total || 0,
  })), [filteredInvoices, getSocietyName]);

  const facturacionMensual = useMemo(() => {
    const m: Record<string, number> = {};
    for (const inv of filteredInvoices) {
      if (inv.fecha_factura) { const key = inv.fecha_factura.slice(0, 7); m[key] = (m[key] || 0) + (inv.total || 0); }
    }
    return Object.entries(m).sort().map(([mes, monto]) => ({
      mes: mes.slice(5) + '/' + mes.slice(2, 4),
      monto: Math.round(monto * 100) / 100,
    }));
  }, [filteredInvoices]);

  const facPorEstado = useMemo(() => {
    const m: Record<string, { count: number; total: number }> = {};
    for (const inv of filteredInvoices) {
      const e = inv.estado || 'sin estado';
      if (!m[e]) m[e] = { count: 0, total: 0 };
      m[e].count++; m[e].total += inv.total || 0;
    }
    return Object.entries(m).map(([name, v]) => ({ name, count: v.count, total: Math.round(v.total * 100) / 100 }));
  }, [filteredInvoices]);

  // ==================================================================
  //  RENDER
  // ==================================================================

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-orange-500" />
          Reportes
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Analisis operativo y financiero de casos y facturacion</p>
      </div>

      {/* Filtros compartidos */}
      <SharedFilters {...filterProps} />

      {/* Tabs */}
      <Tabs defaultValue="operativo" className="space-y-5">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="operativo" className="gap-1.5 text-xs">
            <Briefcase className="h-3.5 w-3.5" /> Operativo
          </TabsTrigger>
          <TabsTrigger value="usuario" className="gap-1.5 text-xs">
            <Users className="h-3.5 w-3.5" /> Por Usuario
          </TabsTrigger>
          <TabsTrigger value="cliente" className="gap-1.5 text-xs">
            <Building2 className="h-3.5 w-3.5" /> Por Cliente
          </TabsTrigger>
          <TabsTrigger value="financiero" className="gap-1.5 text-xs">
            <DollarSign className="h-3.5 w-3.5" /> Financiero
          </TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/*  TAB: OPERATIVO                                               */}
        {/* ============================================================ */}
        <TabsContent value="operativo" className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <MiniStat label="Total" value={opKpi.total} icon={<Briefcase className="h-5 w-5" />} color="bg-slate-700" />
            <MiniStat label="Pendientes" value={opKpi.pendiente} icon={<Clock className="h-5 w-5" />} color="bg-amber-500" />
            <MiniStat label="En Curso" value={opKpi.enCurso} icon={<TrendingUp className="h-5 w-5" />} color="bg-blue-500" />
            <MiniStat label="Completados" value={opKpi.completado} icon={<CheckCircle className="h-5 w-5" />} color="bg-emerald-500" />
            <MiniStat label="Cancelados" value={opKpi.cancelado} icon={<X className="h-5 w-5" />} color="bg-gray-400" />
            <MiniStat label="Urgentes" value={opKpi.urgente} icon={<AlertTriangle className="h-5 w-5" />} color="bg-red-500" />
          </div>

          {/* Graficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Proporcion por Estado</CardTitle></CardHeader>
              <CardContent>
                {donutEstado.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={donutEstado} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} stroke="none">
                        {donutEstado.map(e => <Cell key={e.name} fill={ESTADO_COLORS[e.name] || '#d1d5db'} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" iconType="circle" formatter={(v: string) => <span className="text-xs">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Casos por Procesos</CardTitle></CardHeader>
              <CardContent>
                {barProceso.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={barProceso} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + '...' : v} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Casos" fill="#ea580c" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Casos por Prioridad</CardTitle></CardHeader>
              <CardContent>
                {barPrioridad.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={barPrioridad} margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" name="Casos" radius={[4, 4, 0, 0]} barSize={40}>
                        {barPrioridad.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Tendencia Mensual de Casos</CardTitle></CardHeader>
              <CardContent>
                {tendenciaMensual.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={tendenciaMensual} margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="casos" name="Casos" stroke="#ea580c" fill="#fed7aa" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla detalle */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Detalle de Casos</CardTitle></CardHeader>
            <CardContent>
              <ReportTable
                data={opTableData}
                columns={[
                  { key: 'caso', label: '# Caso', cls: 'font-mono text-xs font-semibold text-primary w-[90px]' },
                  { key: 'descripcion', label: 'Descripcion', cls: 'min-w-[180px] max-w-[280px] truncate' },
                  { key: 'proceso', label: 'Proceso', cls: 'min-w-[140px]' },
                  { key: 'estado', label: 'Estado', cls: 'w-[150px]', render: (v: string) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', ESTADO_BADGE[v])}>{v}</span> },
                  { key: 'prioridad', label: 'Prioridad', cls: 'w-[100px]', render: (v: string) => v ? <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', PRIORIDAD_BADGE[v])}>{v}</span> : <span>—</span> },
                  { key: 'usuario', label: 'Asignado', cls: 'min-w-[130px]' },
                  { key: 'fecha_ingreso', label: 'F. Ingreso', cls: 'w-[100px] tabular-nums' },
                  { key: 'fecha_seguimiento', label: 'F. Seguimiento', cls: 'w-[120px] tabular-nums' },
                  { key: 'dias', label: 'Dias Venc.', cls: 'w-[90px] text-center tabular-nums font-medium', render: (v: number | null) => v != null ? <span className={v < 0 ? 'text-red-600' : v <= 7 ? 'text-amber-600' : 'text-green-600'}>{v}</span> : <span>—</span> },
                ]}
                exportFilename={`Reporte_Operativo_${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB: POR USUARIO                                             */}
        {/* ============================================================ */}
        <TabsContent value="usuario" className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Carga de Trabajo por Usuario</CardTitle></CardHeader>
            <CardContent>
              {barUsuario.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                <ResponsiveContainer width="100%" height={Math.max(250, barUsuario.length * 45)}>
                  <BarChart data={barUsuario} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend verticalAlign="top" iconType="circle" />
                    <Bar dataKey="Pendiente" stackId="a" fill="#f59e0b" barSize={22} />
                    <Bar dataKey="En Curso" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="Completado" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Detalle por Usuario</CardTitle></CardHeader>
            <CardContent>
              <ReportTable
                data={byUsuario.map(u => ({ _id: u.nombre, nombre: u.nombre, total: u.total, pendiente: u.pendiente, enCurso: u.enCurso, completado: u.completado, urgente: u.urgente }))}
                columns={[
                  { key: 'nombre', label: 'Usuario', cls: 'min-w-[180px] font-medium' },
                  { key: 'total', label: 'Total', cls: 'w-[80px] text-center font-bold' },
                  { key: 'pendiente', label: 'Pendientes', cls: 'w-[100px] text-center', render: (v: number) => <span className="text-amber-600 font-medium">{v}</span> },
                  { key: 'enCurso', label: 'En Curso', cls: 'w-[90px] text-center', render: (v: number) => <span className="text-blue-600 font-medium">{v}</span> },
                  { key: 'completado', label: 'Completados', cls: 'w-[110px] text-center', render: (v: number) => <span className="text-green-600 font-medium">{v}</span> },
                  { key: 'urgente', label: 'Urgentes', cls: 'w-[90px] text-center', render: (v: number) => v > 0 ? <span className="text-red-600 font-bold">{v}</span> : <span className="text-muted-foreground">0</span> },
                ]}
                exportFilename={`Reporte_Usuarios_${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB: POR CLIENTE                                             */}
        {/* ============================================================ */}
        <TabsContent value="cliente" className="space-y-5">
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Casos por Cliente</CardTitle></CardHeader>
            <CardContent>
              {byCliente.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                <ResponsiveContainer width="100%" height={Math.max(250, byCliente.length * 40)}>
                  <BarChart data={byCliente.map(c => ({ name: c.nombre.length > 25 ? c.nombre.slice(0, 23) + '...' : c.nombre, total: c.total }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="total" name="Casos" fill="#ea580c" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Detalle por Cliente</CardTitle></CardHeader>
            <CardContent>
              <ReportTable
                data={byCliente.map(c => ({ _id: c.nombre, nombre: c.nombre, total: c.total, pendiente: c.pendiente, completado: c.completado, urgente: c.urgente, sociedades: c.sociedades }))}
                columns={[
                  { key: 'nombre', label: 'Cliente', cls: 'min-w-[200px] font-medium' },
                  { key: 'total', label: 'Total Casos', cls: 'w-[100px] text-center font-bold' },
                  { key: 'pendiente', label: 'Pendientes', cls: 'w-[100px] text-center', render: (v: number) => <span className="text-amber-600 font-medium">{v}</span> },
                  { key: 'completado', label: 'Completados', cls: 'w-[110px] text-center', render: (v: number) => <span className="text-green-600 font-medium">{v}</span> },
                  { key: 'urgente', label: 'Urgentes', cls: 'w-[90px] text-center', render: (v: number) => v > 0 ? <span className="text-red-600 font-bold">{v}</span> : <span className="text-muted-foreground">0</span> },
                  { key: 'sociedades', label: 'Sociedades', cls: 'w-[100px] text-center' },
                ]}
                exportFilename={`Reporte_Clientes_${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB: FINANCIERO                                              */}
        {/* ============================================================ */}
        <TabsContent value="financiero" className="space-y-5">
          {/* KPIs financieros */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="Total Facturado" value={fmtMoney(finKpi.totalFacturado)} icon={<DollarSign className="h-5 w-5" />} color="bg-slate-700" />
            <MiniStat label="Pendiente de Cobro" value={fmtMoney(finKpi.totalPendiente)} icon={<Clock className="h-5 w-5" />} color="bg-amber-500" />
            <MiniStat label="Enviado a QB" value={fmtMoney(finKpi.totalEnviado)} icon={<CheckCircle className="h-5 w-5" />} color="bg-emerald-500" />
            <MiniStat label="ITBMS Total" value={fmtMoney(finKpi.totalImpuesto)} icon={<FileText className="h-5 w-5" />} color="bg-blue-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Facturacion Mensual</CardTitle></CardHeader>
              <CardContent>
                {facturacionMensual.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={facturacionMensual} margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `B/.${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="monto" name="Facturado (B/.)" stroke="#10b981" fill="#d1fae5" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Facturas por Estado</CardTitle></CardHeader>
              <CardContent>
                {facPorEstado.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={facPorEstado} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="count" nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} stroke="none">
                        {facPorEstado.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend verticalAlign="bottom" iconType="circle" formatter={(v: string) => <span className="text-xs">{v}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tabla de facturas */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-base">Detalle de Facturas</CardTitle></CardHeader>
            <CardContent>
              <ReportTable
                data={finTableData}
                columns={[
                  { key: 'numero', label: '# Factura', cls: 'font-mono text-xs font-semibold w-[90px]' },
                  { key: 'sociedad', label: 'Sociedad', cls: 'min-w-[180px]' },
                  { key: 'fecha', label: 'Fecha', cls: 'w-[100px] tabular-nums' },
                  { key: 'vencimiento', label: 'Vencimiento', cls: 'w-[110px] tabular-nums' },
                  { key: 'subtotal', label: 'Subtotal', cls: 'w-[110px] text-right tabular-nums' },
                  { key: 'impuesto', label: 'ITBMS', cls: 'w-[90px] text-right tabular-nums' },
                  { key: 'total', label: 'Total', cls: 'w-[110px] text-right tabular-nums font-semibold' },
                  { key: 'estado', label: 'Estado', cls: 'w-[100px]', render: (v: string) => {
                    const colors: Record<string, string> = { borrador: 'bg-gray-100 text-gray-600', pendiente: 'bg-amber-100 text-amber-700', enviada: 'bg-green-100 text-green-700', error: 'bg-red-100 text-red-700', anulada: 'bg-gray-100 text-gray-400' };
                    return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', colors[v] || '')}>{v}</span>;
                  }},
                  { key: 'qb', label: 'QB', cls: 'w-[50px] text-center' },
                ]}
                exportFilename={`Reporte_Financiero_${new Date().toISOString().slice(0, 10)}.csv`}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
