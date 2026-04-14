import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Case, CASE_ESTADOS, formatNTarea } from '@/data/mockData';
import {
  Briefcase, Clock, CheckCircle, AlertTriangle,
  Plus, Download, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
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

const PAGE_SIZE = 20;

const MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const ALL = '__all__';

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = iso.slice(0, 10).split('-');
  if (d.length !== 3) return iso;
  return `${d[2]}/${d[1]}/${d[0]}`;
}

function diasVencimiento(fechaVenc?: string): number | null {
  if (!fechaVenc) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
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
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ================================================================== */
/*  StatCard                                                           */
/* ================================================================== */

function StatCard({
  title, value, subtitle, icon, color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={cn('rounded-xl p-5 text-white relative overflow-hidden shadow-md', color)}>
      <div className="absolute right-3 top-3 opacity-20">{icon}</div>
      <div className="relative">
        <p className="text-sm font-medium opacity-90 mb-1">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
        {subtitle && <p className="text-xs opacity-75 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Custom Tooltip para recharts                                       */
/* ================================================================== */

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label || payload[0]?.name}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name ?? 'Casos'}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

/* ================================================================== */
/*  DashboardPage                                                      */
/* ================================================================== */

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    cases, clients, services, getClientName, getServiceName, getUsuarioName,
  } = useApp();

  // ── Filtros ──────────────────────────────────────────────────────
  const [filterAnio, setFilterAnio] = useState(ALL);
  const [filterMes, setFilterMes] = useState(ALL);
  const [filterEstado, setFilterEstado] = useState(ALL);
  const [filterServicio, setFilterServicio] = useState(ALL);
  const [filterCliente, setFilterCliente] = useState(ALL);

  // Opciones dinámicas de año
  const aniosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const c of cases) {
      if (c.fecha_caso) set.add(c.fecha_caso.slice(0, 4));
    }
    return [...set].sort().reverse();
  }, [cases]);

  // Servicios activos para dropdown
  const serviciosActivos = useMemo(
    () => services.filter(s => s.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [services],
  );

  // Clientes activos para dropdown
  const clientesActivos = useMemo(
    () => clients.filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [clients],
  );

  const hayFiltros = filterAnio !== ALL || filterMes !== ALL || filterEstado !== ALL || filterServicio !== ALL || filterCliente !== ALL;

  function limpiarFiltros() {
    setFilterAnio(ALL);
    setFilterMes(ALL);
    setFilterEstado(ALL);
    setFilterServicio(ALL);
    setFilterCliente(ALL);
  }

  // ── Datos filtrados ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    return cases.filter(c => {
      if (filterAnio !== ALL && c.fecha_caso && c.fecha_caso.slice(0, 4) !== filterAnio) return false;
      if (filterMes !== ALL && c.fecha_caso) {
        const m = parseInt(c.fecha_caso.slice(5, 7), 10);
        if (String(m) !== filterMes) return false;
      }
      if (filterEstado !== ALL && c.estado !== filterEstado) return false;
      if (filterServicio !== ALL && c.service_id !== filterServicio) return false;
      if (filterCliente !== ALL && c.client_id !== filterCliente) return false;
      return true;
    });
  }, [cases, filterAnio, filterMes, filterEstado, filterServicio, filterCliente]);

  // ── KPIs (sobre datos filtrados) ────────────────────────────────
  const kpi = useMemo(() => {
    const total = filtered.length;
    const pendiente = filtered.filter(c => c.estado === 'Pendiente').length;
    const enCurso = filtered.filter(c => c.estado === 'En Curso').length;
    const completado = filtered.filter(c => c.estado === 'Completado/Facturado').length;
    const urgente = filtered.filter(c => c.prioridad === 'Urgente' || c.prioridad_urgente).length;
    return { total, pendiente, enCurso, completado, urgente };
  }, [filtered]);

  // ── Tabla: sort + paginación ────────────────────────────────────
  type SortKey = 'n_tarea' | 'descripcion' | 'servicio' | 'estado' | 'prioridad' | 'usuario' | 'fecha_caso' | 'fecha_vencimiento' | 'dias';
  const [sortKey, setSortKey] = useState<SortKey>('n_tarea');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  // Reset page on filter change
  useEffect(() => setPage(0), [filterAnio, filterMes, filterEstado, filterServicio, filterCliente]);

  // Build enriched rows
  const tableRows = useMemo(() => {
    return filtered.map(c => ({
      raw: c,
      n_tarea: c.n_tarea ?? 0,
      descripcion: c.descripcion || '',
      servicio: c.service_id ? getServiceName(c.service_id) : '',
      estado: c.estado,
      prioridad: c.prioridad || '',
      usuario: c.usuario_asignado_id ? getUsuarioName(c.usuario_asignado_id) : (c.responsable || ''),
      fecha_caso: c.fecha_caso || '',
      fecha_vencimiento: c.fecha_vencimiento || '',
      dias: diasVencimiento(c.fecha_vencimiento),
    }));
  }, [filtered, getServiceName, getUsuarioName]);

  const sortedRows = useMemo(() => {
    const rows = [...tableRows];
    rows.sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === 'dias') {
        va = va ?? 99999;
        vb = vb ?? 99999;
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [tableRows, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown className="h-3 w-3 opacity-30" />;
    return sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  }

  // ── Datos para gráficos ─────────────────────────────────────────
  const donutData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filtered) {
      counts[c.estado] = (counts[c.estado] || 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  const barData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of filtered) {
      const svc = c.service_id ? getServiceName(c.service_id) : 'Sin proceso';
      counts[svc] = (counts[svc] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, getServiceName]);

  // ── Export ──────────────────────────────────────────────────────
  function handleExport() {
    const headers = [
      { key: 'caso', label: '# CASOS' },
      { key: 'descripcion', label: 'DESCRIPCION' },
      { key: 'proceso', label: 'PROCESO' },
      { key: 'estado', label: 'ESTADO' },
      { key: 'prioridad', label: 'PRIORIDAD' },
      { key: 'usuario', label: 'USUARIO ASIGNADO' },
      { key: 'fecha_ingreso', label: 'FECHA INGRESO' },
      { key: 'fecha_seguimiento', label: 'FECHA SEGUIMIENTO' },
      { key: 'dias', label: 'DIAS DE VENCIMIENTO' },
    ];
    const rows = sortedRows.map(r => ({
      caso: formatNTarea(r.n_tarea) || String(r.n_tarea),
      descripcion: r.descripcion,
      proceso: r.servicio,
      estado: r.estado,
      prioridad: r.prioridad,
      usuario: r.usuario,
      fecha_ingreso: fmtDate(r.fecha_caso),
      fecha_seguimiento: fmtDate(r.fecha_vencimiento),
      dias: r.dias != null ? String(r.dias) : '',
    }));
    const now = new Date().toISOString().slice(0, 10);
    exportToCSV(rows, headers, `Casos_Ancori_${now}.csv`);
  }

  const today = new Date().toLocaleDateString('es-PA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{today}</p>
        </div>
        <Button onClick={() => navigate('/casos')} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Caso
        </Button>
      </div>

      {/* ── Filtros (estilo PBI slicers) ──────────────────────── */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            {/* Año */}
            <div className="min-w-[120px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Ano</label>
              <Select value={filterAnio} onValueChange={setFilterAnio}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {aniosDisponibles.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Mes */}
            <div className="min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Mes</label>
              <Select value={filterMes} onValueChange={setFilterMes}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {MESES.slice(1).map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Estado */}
            <div className="min-w-[180px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Estado</label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Proceso */}
            <div className="min-w-[200px] flex-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Proceso</label>
              <Select value={filterServicio} onValueChange={setFilterServicio}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {serviciosActivos.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Cliente */}
            <div className="min-w-[200px] flex-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cliente</label>
              <Select value={filterCliente} onValueChange={setFilterCliente}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {clientesActivos.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Limpiar */}
            {hayFiltros && (
              <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="h-9 text-xs gap-1 text-muted-foreground">
                <X className="h-3.5 w-3.5" /> Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Casos"
          value={kpi.total}
          subtitle="registros filtrados"
          icon={<Briefcase className="h-16 w-16" />}
          color="bg-gradient-to-br from-slate-700 to-slate-900"
        />
        <StatCard
          title="Pendientes"
          value={kpi.pendiente}
          subtitle={`${kpi.enCurso} en curso`}
          icon={<Clock className="h-16 w-16" />}
          color="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <StatCard
          title="Completados/Facturados"
          value={kpi.completado}
          subtitle={`${kpi.total > 0 ? Math.round((kpi.completado / kpi.total) * 100) : 0}% del total`}
          icon={<CheckCircle className="h-16 w-16" />}
          color="bg-gradient-to-br from-emerald-500 to-green-700"
        />
        <StatCard
          title="Prioridad Urgente"
          value={kpi.urgente}
          subtitle="requieren atencion"
          icon={<AlertTriangle className="h-16 w-16" />}
          color="bg-gradient-to-br from-red-500 to-rose-700"
        />
      </div>

      {/* ── Tabla Principal ────────────────────────────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Detalle de Casos
            <span className="text-muted-foreground font-normal text-sm ml-2">
              ({sortedRows.length} registro{sortedRows.length !== 1 ? 's' : ''})
            </span>
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Exportar Excel
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-y border-border">
                  {([
                    ['n_tarea', '# CASOS', 'w-[90px]'],
                    ['descripcion', 'DESCRIPCION', 'min-w-[200px]'],
                    ['servicio', 'PROCESO', 'min-w-[160px]'],
                    ['estado', 'ESTADO', 'w-[150px]'],
                    ['prioridad', 'PRIORIDAD', 'w-[110px]'],
                    ['usuario', 'USUARIO ASIGNADO', 'min-w-[150px]'],
                    ['fecha_caso', 'FECHA INGRESO', 'w-[120px]'],
                    ['fecha_vencimiento', 'FECHA SEGUIMIENTO', 'w-[140px]'],
                    ['dias', 'DIAS VENC.', 'w-[100px]'],
                  ] as [SortKey, string, string][]).map(([key, label, cls]) => (
                    <th
                      key={key}
                      className={cn('px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap', cls)}
                      onClick={() => toggleSort(key)}
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        <SortIcon col={key} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      No hay casos que coincidan con los filtros seleccionados
                    </td>
                  </tr>
                ) : pageRows.map((r, i) => (
                  <tr
                    key={r.raw.id}
                    className={cn(
                      'border-b border-border/50 hover:bg-blue-50/40 transition-colors cursor-pointer',
                      i % 2 === 1 && 'bg-muted/20',
                    )}
                    onClick={() => navigate('/casos')}
                  >
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary">
                      {formatNTarea(r.n_tarea) || r.raw.numero_caso}
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px] truncate" title={r.descripcion}>
                      {r.descripcion || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.servicio || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', ESTADO_BADGE[r.estado])}>
                        {r.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {r.prioridad ? (
                        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', PRIORIDAD_BADGE[r.prioridad])}>
                          {r.prioridad}
                        </span>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{r.usuario || '—'}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{fmtDate(r.fecha_caso)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted-foreground">{fmtDate(r.fecha_vencimiento)}</td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-center">
                      {r.dias != null ? (
                        <span className={cn(
                          r.dias < 0 ? 'text-red-600' : r.dias <= 7 ? 'text-amber-600' : 'text-green-600',
                        )}>
                          {r.dias}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedRows.length)} de {sortedRows.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-2 tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Gráficos ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Donut: Proporción de Casos por Estado */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Proporcion de Casos por Estado
            </CardTitle>
          </CardHeader>
          <CardContent>
            {donutData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    stroke="none"
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={ESTADO_COLORS[entry.name] || '#d1d5db'}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(value: string) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Barras: Casos por Procesos */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Casos por Procesos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '...' : v}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="value"
                    name="Casos"
                    fill="#ea580c"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
