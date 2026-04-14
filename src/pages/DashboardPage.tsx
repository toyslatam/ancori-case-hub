import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Case, formatNTarea } from '@/data/mockData';
import {
  Briefcase, Clock, CheckCircle, AlertTriangle, TrendingUp,
  Users, Building2, Plus, ArrowRight, Mail, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const estadoBadge: Record<string, string> = {
  'Pendiente': 'bg-yellow-100 text-yellow-800',
  'En Curso': 'bg-blue-100 text-blue-800',
  'Completado/Facturado': 'bg-green-100 text-green-800',
  'Cancelado': 'bg-gray-100 text-gray-500',
};

const prioridadColor: Record<string, string> = {
  'Baja': 'text-slate-500',
  'Media': 'text-amber-600',
  'Urgente': 'text-red-600',
};

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

export default function DashboardPage() {
  const navigate = useNavigate();
  const { cases, clients, societies, getClientName, getSocietyName, getServiceItemName, getEtapaName, getUsuarioName } = useApp();

  const kpi = useMemo(() => {
    const total = cases.length;
    const pendiente = cases.filter(c => c.estado === 'Pendiente').length;
    const enCurso = cases.filter(c => c.estado === 'En Curso').length;
    const completado = cases.filter(c => c.estado === 'Completado/Facturado').length;
    const urgente = cases.filter(c => c.prioridad === 'Urgente' || c.prioridad_urgente).length;
    const clientesActivos = clients.filter(c => c.activo).length;
    const sociedadesActivas = societies.filter(s => s.activo).length;
    return { total, pendiente, enCurso, completado, urgente, clientesActivos, sociedadesActivas };
  }, [cases, clients, societies]);

  // Last 8 cases ordered by created_at desc
  const recentCases = useMemo(() =>
    [...cases]
      .sort((a, b) => (b.n_tarea ?? 0) - (a.n_tarea ?? 0))
      .slice(0, 8),
    [cases]);

  // Cases by usuario
  const byUsuario = useMemo(() => {
    const map = new Map<string, { nombre: string; count: number; urgente: number }>();
    for (const c of cases) {
      const key = c.usuario_asignado_id ?? '__none__';
      const nombre = c.usuario_asignado_id ? getUsuarioName(c.usuario_asignado_id) : (c.responsable || 'Sin asignar');
      if (!map.has(key)) map.set(key, { nombre, count: 0, urgente: 0 });
      const entry = map.get(key)!;
      entry.count++;
      if (c.prioridad === 'Urgente' || c.prioridad_urgente) entry.urgente++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [cases, getUsuarioName]);

  // Breakdown by estado
  const byEstado = useMemo(() => [
    { label: 'Pendiente', count: kpi.pendiente, color: 'bg-yellow-400' },
    { label: 'En Curso', count: kpi.enCurso, color: 'bg-blue-400' },
    { label: 'Completado/Facturado', count: kpi.completado, color: 'bg-green-400' },
    { label: 'Cancelado', count: cases.filter(c => c.estado === 'Cancelado').length, color: 'bg-gray-300' },
  ], [kpi, cases]);

  const today = new Date().toLocaleDateString('es-PA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground capitalize mt-0.5">{today}</p>
        </div>
        <Button onClick={() => navigate('/casos')} className="gap-2">
          <Plus className="h-4 w-4" /> Nuevo Caso
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Casos"
          value={kpi.total}
          subtitle="todos los registros"
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
          subtitle="requieren atención"
          icon={<AlertTriangle className="h-16 w-16" />}
          color="bg-gradient-to-br from-red-500 to-rose-700"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-card border border-border p-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Clientes Activos</p>
            <p className="text-2xl font-bold">{kpi.clientesActivos}</p>
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Sociedades Activas</p>
            <p className="text-2xl font-bold">{kpi.sociedadesActivas}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Cases */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold">Casos Recientes</h2>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate('/casos')}>
              Ver todos <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {recentCases.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">No hay casos registrados</p>
            ) : recentCases.map(c => {
              const quien = c.usuario_asignado_id ? getUsuarioName(c.usuario_asignado_id) : c.responsable;
              const entidad = c.society_id ? getSocietyName(c.society_id) : getClientName(c.client_id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className="w-full px-5 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => navigate('/casos')}
                >
                  <div className="shrink-0 font-mono text-xs font-semibold text-primary w-20">
                    {formatNTarea(c.n_tarea) || c.numero_caso}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.descripcion || getServiceItemName(c.service_item_id) || '—'}</p>
                    <p className="text-xs text-muted-foreground truncate">{entidad} · {quien}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.prioridad && (
                      <span className={cn('text-xs font-medium', prioridadColor[c.prioridad])}>{c.prioridad}</span>
                    )}
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', estadoBadge[c.estado])}>
                      {c.estado}
                    </span>
                    {c.recurrencia && <RefreshCw className="h-3 w-3 text-blue-400" />}
                    {c.envio_correo && <Mail className="h-3 w-3 text-green-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-5">
          {/* By estado */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-5">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Distribución por Estado
            </h2>
            <div className="space-y-3">
              {byEstado.map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-semibold">{row.count}</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', row.color)}
                      style={{ width: kpi.total > 0 ? `${(row.count / kpi.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By usuario */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-5">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Casos por Asignado
            </h2>
            {byUsuario.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos</p>
            ) : (
              <div className="space-y-2">
                {byUsuario.map(row => (
                  <div key={row.nombre} className="flex items-center justify-between text-sm">
                    <span className="truncate text-muted-foreground max-w-[130px]" title={row.nombre}>{row.nombre}</span>
                    <div className="flex items-center gap-2">
                      {row.urgente > 0 && (
                        <span className="text-xs text-red-500 font-medium">{row.urgente} urg.</span>
                      )}
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
