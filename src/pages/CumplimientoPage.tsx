import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { AgileCheckProfilePanel, type AgUpdatedFields } from '@/components/compliance/AgileCheckProfilePanel';
import { SharePointDocsPanel } from '@/components/sharepoint/SharePointDocsPanel';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  X, AlertTriangle, Clock, Loader2, ShieldCheck, ShieldAlert,
  ShieldX, RefreshCw, Users, Building2, UserCog, CloudUpload, FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  fetchComplianceChecks, verifyEntity, computeStats, syncClientToAgileCheck,
  fetchSyncLogCounts,
  getStatusLabel, getRiskLabel, getEntityLabel,
  type ComplianceCheck, type VerifyEntityHubOptions,
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
  const { clients, directores, societies, refreshClients } = useApp();
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
  const [syncClienteAlVerificar, setSyncClienteAlVerificar] = useState(false);
  const [syncingClientId, setSyncingClientId] = useState<string | null>(null);
  const [searchClientes, setSearchClientes] = useState('');
  const [searchDirectores, setSearchDirectores] = useState('');
  const [searchSociedades, setSearchSociedades] = useState('');
  const [agDetail, setAgDetail] = useState<{
    entityType: 'client' | 'society';
    entityId: string;
    entityName: string;
  } | null>(null);
  const [agOverride, setAgOverride] = useState<Map<string, AgUpdatedFields>>(new Map());
  const [logCounts, setLogCounts] = useState<Map<string, number>>(new Map());
  const [spPanel, setSpPanel] = useState<{ entityId: string; entityType: 'client' | 'society'; entityName: string } | null>(null);

  const userCanVerify = canVerify(user?.rol);

  const handleProfileUpdated = useCallback((entityId: string, fields: AgUpdatedFields) => {
    setAgOverride(m => { const nm = new Map(m); nm.set(entityId, fields); return nm; });
  }, []);

  function getAgFields(entityId: string, entityType: 'client' | 'director' | 'society'): AgUpdatedFields | null {
    const override = agOverride.get(entityId);
    if (override) return override;
    if (entityType === 'client') {
      const c = clients.find(x => x.id === entityId);
      if (c && (c.ag_riesgo_nivel != null || c.ag_riesgo != null)) {
        return {
          ag_riesgo: (c as any).ag_riesgo ?? null,
          ag_riesgo_nivel: (c as any).ag_riesgo_nivel ?? null,
          ag_porcCompletadoDD: (c as any).ag_porcCompletadoDD ?? null,
          ag_verificado_en_listas: (c as any).ag_verificado_en_listas ?? null,
          ag_last_sync_at: (c as any).ag_last_sync_at ?? '',
        };
      }
    } else if (entityType === 'society') {
      const s = societies.find(x => x.id === entityId);
      if (s && (s.ag_riesgo_nivel != null || s.ag_riesgo != null)) {
        return {
          ag_riesgo: (s as any).ag_riesgo ?? null,
          ag_riesgo_nivel: (s as any).ag_riesgo_nivel ?? null,
          ag_porcCompletadoDD: (s as any).ag_porcCompletadoDD ?? null,
          ag_verificado_en_listas: (s as any).ag_verificado_en_listas ?? null,
          ag_last_sync_at: (s as any).ag_last_sync_at ?? '',
        };
      }
    }
    return null;
  }

  useEffect(() => { loadChecks(); }, []);

  async function loadChecks() {
    setLoading(true);
    const data = await fetchComplianceChecks();
    setChecks(data);
    setLoading(false);
    const ids = [...new Set(data.map(c => c.entity_id))];
    fetchSyncLogCounts(ids).then(setLogCounts);
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

    const hub: VerifyEntityHubOptions = { checked_by_correo: user.email };
    if (confirmVerify.entityType === 'client') {
      const c = clients.find(x => x.id === confirmVerify.entityId);
      if (c?.identificacion?.trim()) hub.numero_id = c.identificacion.trim();
    } else if (confirmVerify.entityType === 'society') {
      const s = societies.find(x => x.id === confirmVerify.entityId);
      const doc = [s?.ruc, s?.nit, s?.identificacion_fiscal].find(x => x != null && String(x).trim() !== '');
      if (doc != null) hub.numero_id = String(doc).trim();
    }

    if (confirmVerify.entityType === 'client' && syncClienteAlVerificar) {
      hub.sync_agilecheck_client = true;
    }

    const result = await verifyEntity(
      confirmVerify.entityType,
      confirmVerify.entityId,
      confirmVerify.entityName,
      'PEP',
      user.id,
      hub,
    );

    if (result.ok) {
      toast.success(`Verificacion completada: ${result.summary}`);
      if (result.sync_agilecheck_client && result.sync_agilecheck_client.ok === false) {
        const d = result.sync_agilecheck_client.detail;
        toast.warning(
          d
            ? `La verificación se guardó, pero AgileCheck no actualizó el cliente: ${result.sync_agilecheck_client.error} (${d.slice(0, 120)})`
            : `La verificación se guardó, pero AgileCheck no actualizó el cliente: ${result.sync_agilecheck_client.error ?? 'error'}`,
        );
      } else if (result.sync_agilecheck_client?.ok) {
        toast.message(`AgileCheck: cliente ${result.sync_agilecheck_client.action ?? 'ok'} (id ${result.sync_agilecheck_client.agilecheck_cliente_id})`);
        void refreshClients();
      }
      await loadChecks();
    } else {
      toast.error(result.error ?? 'Error al verificar');
    }

    setVerifying(null);
    setConfirmVerify(null);
    setSyncClienteAlVerificar(false);
  }

  async function handleSyncClientOnly(clientId: string) {
    setSyncingClientId(clientId);
    const r = await syncClientToAgileCheck(clientId);
    if (r.ok) {
      toast.success(`AgileCheck: cliente ${r.action ?? 'ok'} (id ${r.agilecheck_cliente_id})`);
      await refreshClients();
    } else {
      toast.error(r.detail ? `${r.error}: ${r.detail.slice(0, 200)}` : (r.error ?? 'Error AgileCheck'));
    }
    setSyncingClientId(null);
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

  const unverifiedSocieties = useMemo(() => {
    const checkedIds = new Set(checks.filter(c => c.entity_type === 'society').map(c => c.entity_id));
    return societies.filter(s => s.activo && !checkedIds.has(s.id));
  }, [societies, checks]);

  const pendingVerifyCount =
    unverifiedClients.length + unverifiedDirectors.length + unverifiedSocieties.length;

  // Chart data
  const donutData = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of checks) m[c.status] = (m[c.status] || 0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name: getStatusLabel(name), value, key: name }));
  }, [checks]);

  const entityBarData = useMemo(() => [
    { name: 'Clientes', verificados: checks.filter(c => c.entity_type === 'client').length, pendientes: unverifiedClients.length },
    { name: 'Directores', verificados: checks.filter(c => c.entity_type === 'director').length, pendientes: unverifiedDirectors.length },
    { name: 'Sociedades', verificados: checks.filter(c => c.entity_type === 'society').length, pendientes: unverifiedSocieties.length },
  ], [checks, unverifiedClients, unverifiedDirectors, unverifiedSocieties.length]);

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
            Cumplimiento — General
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
      {(unverifiedClients.length > 0 || unverifiedDirectors.length > 0 || unverifiedSocieties.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <span>
            {unverifiedClients.length > 0 && <><strong>{unverifiedClients.length}</strong> clientes sin verificar. </>}
            {unverifiedDirectors.length > 0 && <><strong>{unverifiedDirectors.length}</strong> directores sin verificar. </>}
            {unverifiedSocieties.length > 0 && <><strong>{unverifiedSocieties.length}</strong> sociedades sin verificar.</>}
          </span>
        </div>
      )}

      {userCanVerify && pendingVerifyCount > 0 && (
        <Card className="shadow-sm border-orange-200/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              Ejecutar verificación
            </CardTitle>
            <p className="text-sm text-muted-foreground font-normal">
              Elija una entidad para consultar AgileCheck y registrar el resultado en la tabla inferior.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {unverifiedClients.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Clientes <span className="font-normal">({unverifiedClients.length})</span>
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchClientes}
                    onChange={e => setSearchClientes(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {unverifiedClients
                    .filter(c => !searchClientes.trim() || `${c.nombre} ${c.razon_social ?? ''}`.toLowerCase().includes(searchClientes.trim().toLowerCase()))
                    .map(c => {
                    const label = (c.razon_social?.trim() || c.nombre).trim();
                    return (
                      <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-background">
                        <span className="truncate font-medium min-w-0" title={label}>{label}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 px-2 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                            onClick={() => setAgDetail({ entityType: 'client', entityId: c.id, entityName: label })}
                            title="Ver ficha AgileCheck">
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 px-2 gap-1"
                            disabled={syncingClientId === c.id}
                            onClick={() => void handleSyncClientOnly(c.id)}
                            title="Sincronizar solo ficha en AgileCheck">
                            {syncingClientId === c.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <CloudUpload className="h-3.5 w-3.5" />}
                          </Button>
                          <Button size="sm" variant="secondary" className="h-8 gap-1"
                            onClick={() => setConfirmVerify({ entityType: 'client', entityId: c.id, entityName: label })}>
                            <Shield className="h-3.5 w-3.5" /> Verificar
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {unverifiedDirectors.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Directores <span className="font-normal">({unverifiedDirectors.length})</span>
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar director..."
                    value={searchDirectores}
                    onChange={e => setSearchDirectores(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {unverifiedDirectors
                    .filter(d => !searchDirectores.trim() || d.nombre.toLowerCase().includes(searchDirectores.trim().toLowerCase()))
                    .map(d => (
                    <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-background">
                      <span className="truncate font-medium" title={d.nombre}>{d.nombre}</span>
                      <Button size="sm" variant="secondary" className="shrink-0 h-8 gap-1"
                        onClick={() => setConfirmVerify({ entityType: 'director', entityId: d.id, entityName: d.nombre })}>
                        <Shield className="h-3.5 w-3.5" /> Verificar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unverifiedSocieties.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Sociedades <span className="font-normal">({unverifiedSocieties.length})</span>
                </p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar sociedad..."
                    value={searchSociedades}
                    onChange={e => setSearchSociedades(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <ul className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {unverifiedSocieties
                    .filter(s => !searchSociedades.trim() || `${s.nombre} ${s.razon_social ?? ''}`.toLowerCase().includes(searchSociedades.trim().toLowerCase()))
                    .map(s => {
                    const label = (s.razon_social?.trim() || s.nombre).trim();
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-background">
                        <span className="truncate font-medium min-w-0" title={label}>{label}</span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="outline" className="h-8 px-2 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
                            onClick={() => setAgDetail({ entityType: 'society', entityId: s.id, entityName: label })}
                            title="Ver ficha AgileCheck">
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="secondary" className="shrink-0 h-8 gap-1"
                            onClick={() => setConfirmVerify({ entityType: 'society', entityId: s.id, entityName: label })}>
                            <Shield className="h-3.5 w-3.5" /> Verificar
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
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
                  <th className="px-3 py-2.5 text-left font-semibold text-xs uppercase tracking-wider whitespace-nowrap w-[130px]">AG Riesgo</th>
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider whitespace-nowrap w-[80px]">Bitácora</th>
                  {userCanVerify && <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase w-[80px]">Accion</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-orange-400" /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-12 text-muted-foreground">
                    {checks.length === 0 ? 'No hay verificaciones registradas. Use los botones de verificacion para comenzar.' : 'Sin resultados para los filtros seleccionados'}
                  </td></tr>
                ) : pageRows.map((c, i) => {
                  const expired = isExpired(c.expires_at);
                  const canOpenPanel = c.entity_type === 'client' || c.entity_type === 'society';
                  const handleRowClick = () => {
                    if (canOpenPanel) {
                      setAgDetail({ entityType: c.entity_type as 'client' | 'society', entityId: c.entity_id, entityName: c.entity_name });
                    }
                  };
                  return (
                    <tr
                      key={c.id}
                      onClick={handleRowClick}
                      className={cn(
                        'border-b border-border/50 hover:bg-blue-50/40 transition-colors',
                        i % 2 === 1 && 'bg-muted/20',
                        canOpenPanel && 'cursor-pointer',
                      )}
                    >
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          {c.entity_type === 'client' && <Users className="h-3 w-3 mr-1" />}
                          {c.entity_type === 'director' && <UserCog className="h-3 w-3 mr-1" />}
                          {c.entity_type === 'society' && <Building2 className="h-3 w-3 mr-1" />}
                          {getEntityLabel(c.entity_type)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(canOpenPanel && 'text-blue-700 hover:underline')}>{c.entity_name}</span>
                          {(c.entity_type === 'society' || c.entity_type === 'client') && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); setSpPanel({ entityId: c.entity_id, entityType: c.entity_type as 'client' | 'society', entityName: c.entity_name }); }}
                              title="Ver documentos en SharePoint"
                              className="flex-shrink-0 p-0.5 rounded hover:bg-amber-100 text-amber-500 hover:text-amber-700 transition-colors"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
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
                      <td className="px-3 py-2">
                        {(() => {
                          const ag = getAgFields(c.entity_id, c.entity_type);
                          if (!ag || ag.ag_riesgo_nivel == null) return <span className="text-muted-foreground text-xs">—</span>;
                          const nivelMap: Record<number, { label: string; cls: string }> = {
                            1: { label: 'Bajo', cls: 'bg-green-100 text-green-800' },
                            2: { label: 'Medio', cls: 'bg-yellow-100 text-yellow-800' },
                            3: { label: 'Alto', cls: 'bg-orange-100 text-orange-800' },
                            4: { label: 'Crítico', cls: 'bg-red-100 text-red-800' },
                          };
                          const entry = nivelMap[ag.ag_riesgo_nivel];
                          return (
                            <div className="flex items-center gap-1.5">
                              {entry && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', entry.cls)}>{entry.label}</span>}
                              {ag.ag_riesgo != null && <span className="text-xs text-muted-foreground tabular-nums">{ag.ag_riesgo.toFixed(2)}</span>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const count = logCounts.get(c.entity_id) ?? 0;
                          const canOpen = c.entity_type === 'client' || c.entity_type === 'society';
                          if (count === 0) return <span className="text-muted-foreground text-xs">—</span>;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (canOpen) setAgDetail({ entityType: c.entity_type as 'client' | 'society', entityId: c.entity_id, entityName: c.entity_name });
                              }}
                              title={`${count} entrada${count !== 1 ? 's' : ''} en bitácora`}
                              className={cn(
                                'inline-flex items-center justify-center rounded-full h-5 min-w-[20px] px-1.5 text-[10px] font-semibold transition-colors',
                                canOpen
                                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                                  : 'bg-slate-100 text-slate-600 cursor-default',
                              )}
                            >
                              {count}
                            </button>
                          );
                        })()}
                      </td>
                      {userCanVerify && (
                        <td className="px-3 py-2 text-center" onClick={e => e.stopPropagation()}>
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

      {/* Panel documentos SharePoint */}
      <SharePointDocsPanel
        entityId={spPanel?.entityId ?? ''}
        entityType={spPanel?.entityType ?? 'society'}
        entityName={spPanel?.entityName ?? ''}
        open={spPanel != null}
        onClose={() => setSpPanel(null)}
      />

      {/* Sheet Ficha AgileCheck */}
      <Sheet open={agDetail != null} onOpenChange={open => { if (!open) setAgDetail(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-[720px] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" />
              Ficha AgileCheck — {agDetail?.entityName}
            </SheetTitle>
          </SheetHeader>
          {agDetail && (() => {
            const entity = agDetail.entityType === 'client'
              ? clients.find(c => c.id === agDetail.entityId)
              : societies.find(s => s.id === agDetail.entityId);
            if (!entity) return (
              <p className="text-sm text-muted-foreground">Entidad no encontrada en el contexto local.</p>
            );
            return (
              <AgileCheckProfilePanel
                entityType={agDetail.entityType}
                entity={entity}
                onProfileUpdated={handleProfileUpdated}
              />
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Confirm dialog */}
      <AlertDialog open={!!confirmVerify} onOpenChange={open => {
        if (!open) {
          setConfirmVerify(null);
          setSyncClienteAlVerificar(false);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verificar en AgileCheck</AlertDialogTitle>
            <AlertDialogDescription>
              Se consultara a AgileCheck para verificar si <strong>{confirmVerify?.entityName}</strong> ({confirmVerify?.entityType && getEntityLabel(confirmVerify.entityType)})
              aparece en listas PEP o sanciones internacionales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmVerify?.entityType === 'client' && (
            <div className="flex items-start gap-3 px-1 py-1">
              <Checkbox
                id="sync-agilecheck-cliente"
                checked={syncClienteAlVerificar}
                onCheckedChange={v => setSyncClienteAlVerificar(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="sync-agilecheck-cliente" className="text-sm font-normal leading-snug cursor-pointer text-muted-foreground">
                También crear o actualizar la ficha de este cliente en AgileCheck (mismo token). Requiere el secret{' '}
                <code className="text-xs bg-muted px-1 rounded">AGILECHECK_PRODUCTO_TOMADO_ID</code> en Supabase.
              </Label>
            </div>
          )}
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
