import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Shield, Search, Download, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  X, AlertTriangle, CheckCircle, Clock, Loader2, ShieldCheck, ShieldAlert,
  ShieldX, RefreshCw, Users, Building2, UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  fetchComplianceChecks, verifyEntity, computeStats,
  getStatusLabel, getRiskLabel, getEntityLabel,
  type ComplianceCheck, type ComplianceStats,
} from '@/lib/agileCheckApi';

const ALL = '__all__';
const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  pending: '#9ca3af',
  clean: '#10b981',
  match: '#ef4444',
  review: '#f59e0b',
  error: '#6b7280',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  clean: 'bg-green-100 text-green-700',
  match: 'bg-red-100 text-red-700',
  review: 'bg-amber-100 text-amber-700',
  error: 'bg-gray-100 text-gray-500',
};

const RISK_BADGE: Record<string, string> = {
  bajo: 'bg-green-100 text-green-700',
  medio: 'bg-amber-100 text-amber-700',
  alto: 'bg-orange-100 text-orange-700',
  critico: 'bg-red-100 text-red-700',
};

const ALLOWED_ROLES = ['cumplimiento', 'socio', 'abogada', 'admin', 'administrador'];

function canVerify(rol?: string): boolean {
  if (!rol) return false;
  return ALLOWED_ROLES.includes(rol.toLowerCase());
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function exportToCSV(
  rows: Array<Record<string, string | number>>,
  headers: { key: string; label: string }[],
  filename: string,
) {
  const BOM = '\uFEFF';
  const headerLine = headers.map(h => `"${h.label}"`).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => `"${String(row[h.key] ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const csv = BOM + [headerLine, ...dataLines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold">{payload[0]?.name}</p>
      <p>Cantidad: <strong>{payload[0]?.value}</strong></p>
    </div>
  );
}

function MiniStat({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
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

export default function CumplimientoPage() {
  const { clients, directores, societies } = useApp();
  const { user } = useAuth();

  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterEntity, setFilterEntity] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);
  const [filterRisk, setFilterRisk] = useState(ALL);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState<{
    entityType: 'client' | 'director' | 'society';
    entityId: string;
    entityName: string;
  } | null>(null);

  const userCanVerify = canVerify(user?.rol);

  useEffect(() => { loadChecks(); }, []);

  async function loadChecks() {
    setLoading(true);
    const data = await fetchComplianceChecks();
    setChecks(data);
    setLoading(false);
  }

  // Stats
  const stats = useMemo(() => computeStats(checks), [checks]);

  // Filtered data
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return checks.filter(c => {
      if (filterEntity !== ALL && c.entity_type !== filterEntity) return false;
      if (filterStatus !== ALL && c.status !== filterStatus) return false;
      if (filterRisk !== ALL && c.risk_level !== filterRisk) return false;
      if (q) {
        const blob = `${c.entity_name} ${getEntityLabel(c.entity_type)} ${getStatusLabel(c.status)} ${c.result_summary ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [checks, search, filterEntity, filterStatus, filterRisk]);

  // Sort
  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      let va: any = (a as any)[sortKey] ?? '';
      let vb: any = (b as any)[sortKey] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useMemo(() => setPage(0), [search, filterEntity, filterStatus, filterRisk]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  // Verify entity
  async function handleVerify() {
    if (!confirmVerify || !user) return;
    setVerifying(confirmVerify.entityId);

    const result = await verifyEntity(
      confirmVerify.entityType,
      confirmVerify.entityId,
      confirmVerify.entityName,
      'PEP',
      user.id,
    );

    if (result.ok) {
      toast.success(`Verificacion completada: ${result.summary}`);
      await loadChecks();
    } else {
      toast.error(result.error ?? 'Error al verificar');
    }

    setVerifying(null);
    setConfirmVerify(null);
  }

  // Unverified entities
  const unverifiedClients = useMemo(() => {
    const checkedIds = new Set(checks.filter(c => c.entity_type === 'client').map(c => c.entity_id));
    return clients.filter(c => c.activo && !checkedIds.has(c.id));
  }, [clients, checks]);

  const unverifiedDirectors = useMemo(() => {
    const checkedIds = new Set(checks.filter(c => c.entity_type === 'director').map(c => c.entity_id));
    return directores.filter(d => d.activo && !checkedIds.has(d.id));
  }, [directores, checks]);

  // Chart data
  const donutData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of checks) m[c.status] = (m[c.status] || 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name: getStatusLabel(name), value, key: name }));
  }, [checks]);

  const entityBarData = useMemo(() => [
    { name: 'Clientes', verificados: checks.filter(c => c.entity_type === 'client').length, pendientes: unverifiedClients.length },
    { name: 'Directores', verificados: checks.filter(c => c.entity_type === 'director').length, pendientes: unverifiedDirectors.length },
    { name: 'Sociedades', verificados: checks.filter(c => c.entity_type === 'society').length, pendientes: societies.filter(s => s.activo).length - checks.filter(c => c.entity_type === 'society').length },
  ], [checks, unverifiedClients, unverifiedDirectors, societies]);

  // Export
  function handleExport() {
    const headers = [
      { key: 'tipo', label: 'TIPO ENTIDAD' },
      { key: 'nombre', label: 'NOMBRE' },
      { key: 'verificacion', label: 'TIPO VERIFICACION' },
      { key: 'estado', label: 'ESTADO' },
      { key: 'riesgo', label: 'NIVEL RIESGO' },
      { key: 'resumen', label: 'RESUMEN' },
      { key: 'fecha', label: 'FECHA VERIFICACION' },
      { key: 'expira', label: 'EXPIRA' },
    ];
    const rows = sorted.map(c => ({
      tipo: getEntityLabel(c.entity_type),
      nombre: c.entity_name,
      verificacion: c.check_type,
      estado: getStatusLabel(c.status),
      riesgo: getRiskLabel(c.risk_level),
      resumen: c.result_summary ?? '',
      fecha: fmtDate(c.checked_at),
      expira: fmtDate(c.expires_at),
    }));
    exportToCSV(rows, headers, `Cumplimiento_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const hayFiltros = filterEntity !== ALL || filterStatus !== ALL || filterRisk !== ALL || search !== '';

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-orange-500" />
            Cumplimiento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verificaciones PEP/AML - AgileCheck
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadChecks} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MiniStat label="Total Verificados" value={stats.total} icon={<Shield className="h-5 w-5" />} color="bg-slate-700" />
        <MiniStat label="Limpios" value={stats.clean} icon={<ShieldCheck className="h-5 w-5" />} color="bg-emerald-500" />
        <MiniStat label="Coincidencia PEP" value={stats.match} icon={<ShieldAlert className="h-5 w-5" />} color="bg-red-500" />
        <MiniStat label="En Revision" value={stats.review} icon={<Clock className="h-5 w-5" />} color="bg-amber-500" />
        <MiniStat label="Pendientes" value={stats.pending} icon={<ShieldX className="h-5 w-5" />} color="bg-gray-400" />
        <MiniStat label="Expirados" value={stats.expired} icon={<AlertTriangle className="h-5 w-5" />} color="bg-orange-500" />
      </div>

      {/* Alertas */}
      {stats.match > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500 shrink-0" />
          <span><strong>{stats.match}</strong> entidad(es) con coincidencia en listas PEP/restrictivas. Requieren revision del Oficial de Cumplimiento.</span>
        </div>
      )}

      {/* No verificados */}
      {(unverifiedClients.length > 0 || unverifiedDirectors.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <span>
            {unverifiedClients.length > 0 && <><strong>{unverifiedClients.length}</strong> clientes sin verificar. </>}
            {unverifiedDirectors.length > 0 && <><strong>{unverifiedDirectors.length}</strong> directores sin verificar.</>}
          </span>
        </div>
      )}

      {/* Graficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Estado de Verificaciones</CardTitle></CardHeader>
          <CardContent>
            {donutData.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">Sin datos</p> : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} stroke="none">
                    {donutData.map(e => <Cell key={e.key} fill={STATUS_COLORS[e.key] || '#d1d5db'} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">Cobertura por Tipo de Entidad</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={entityBarData} margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="verificados" name="Verificados" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="pendientes" name="Sin verificar" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="shadow-sm">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Nombre, estado..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 h-9" />
              </div>
            </div>
            <div className="min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Tipo Entidad</label>
              <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="client">Clientes</SelectItem>
                  <SelectItem value="director">Directores</SelectItem>
                  <SelectItem value="society">Sociedades</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[140px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Estado</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="clean">Limpio</SelectItem>
                  <SelectItem value="match">Coincidencia</SelectItem>
                  <SelectItem value="review">En Revision</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Riesgo</label>
              <Select value={filterRisk} onValueChange={setFilterRisk}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="bajo">Bajo</SelectItem>
                  <SelectItem value="medio">Medio</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="critico">Critico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hayFiltros && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setFilterEntity(ALL); setFilterStatus(ALL); setFilterRisk(ALL); }} className="h-9 text-xs gap-1">
                <X className="h-3.5 w-3.5" /> Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Rol warning */}
      {!userCanVerify && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Solo los roles autorizados (Cumplimiento, Socio, Abogada) pueden ejecutar verificaciones.
          Tu rol: <strong>{user?.rol ?? 'no asignado'}</strong>.
        </div>
      )}

      {/* Tabla */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Registro de Verificaciones
            <span className="text-muted-foreground font-normal text-sm ml-2">({sorted.length})</span>
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-y">
                  {[
                    ['entity_type', 'Tipo', 'w-[90px]'],
                    ['entity_name', 'Nombre', 'min-w-[200px]'],
                    ['check_type', 'Verificacion', 'w-[110px]'],
                    ['status', 'Estado', 'w-[130px]'],
                    ['risk_level', 'Riesgo', 'w-[100px]'],
                    ['checked_at', 'Fecha', 'w-[100px]'],
                    ['expires_at', 'Expira', 'w-[100px]'],
                    ['result_summary', 'Resumen', 'min-w-[200px]'],
                  ].map(([key, label, cls]) => (
                    <th key={key} className={cn('px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer select-none hover:bg-muted/80 whitespace-nowrap', cls)}
                      onClick={() => toggleSort(key)}>
                      <div className="flex items-center gap-1">
                        {label}
                        {sortKey === key ? (sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
                      </div>
                    </th>
                  ))}
                  {userCanVerify && <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase w-[80px]">Accion</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-orange-400" /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">
                    {checks.length === 0 ? 'No hay verificaciones registradas. Use los botones de verificacion para comenzar.' : 'Sin resultados para los filtros seleccionados'}
                  </td></tr>
                ) : pageRows.map((c, i) => {
                  const expired = isExpired(c.expires_at);
                  return (
                    <tr key={c.id} className={cn('border-b border-border/50 hover:bg-blue-50/40', i % 2 === 1 && 'bg-muted/20')}>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {c.entity_type === 'client' && <Users className="h-3 w-3 mr-1" />}
                          {c.entity_type === 'director' && <UserCog className="h-3 w-3 mr-1" />}
                          {c.entity_type === 'society' && <Building2 className="h-3 w-3 mr-1" />}
                          {getEntityLabel(c.entity_type)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium">{c.entity_name}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{c.check_type}</td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_BADGE[c.status])}>
                          {getStatusLabel(c.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {c.risk_level ? (
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', RISK_BADGE[c.risk_level])}>
                            {getRiskLabel(c.risk_level)}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground text-xs">{fmtDate(c.checked_at)}</td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        <span className={expired ? 'text-red-600 font-medium' : 'text-muted-foreground'}>
                          {fmtDate(c.expires_at)} {expired && '⚠'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[250px] truncate" title={c.result_summary ?? ''}>
                        {c.result_summary ?? '—'}
                      </td>
                      {userCanVerify && (
                        <td className="px-3 py-2 text-center">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={verifying === c.entity_id}
                            onClick={() => setConfirmVerify({ entityType: c.entity_type, entityId: c.entity_id, entityName: c.entity_name })}
                            title="Re-verificar">
                            <RefreshCw className={cn('h-3.5 w-3.5', verifying === c.entity_id && 'animate-spin')} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
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
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmVerify} onOpenChange={open => !open && setConfirmVerify(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verificar en AgileCheck</AlertDialogTitle>
            <AlertDialogDescription>
              Se consultara a AgileCheck para verificar si <strong>{confirmVerify?.entityName}</strong> ({confirmVerify?.entityType && getEntityLabel(confirmVerify.entityType)})
              aparece en listas PEP o sanciones internacionales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button onClick={handleVerify} disabled={verifying !== null}>
              {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
              Verificar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
