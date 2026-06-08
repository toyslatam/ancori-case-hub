import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, FileText, BarChart2, RefreshCw, AlertCircle,
  Search, ChevronLeft, Receipt, CalendarDays, X, ChevronDown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApp } from '@/context/AppContext';
import { CotizacionDoc, type QboEstimate } from '@/components/estadoscuenta/CotizacionDoc';
import { EstadoCuentaDoc, type EstadoRow } from '@/components/estadoscuenta/EstadoCuentaDoc';

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET as string;

type QboCustomer = { Id: string; DisplayName?: string; CompanyName?: string };
type QboInvoice  = {
  Id: string; DocNumber?: string; TxnDate?: string;
  CustomerRef?: { name?: string; value?: string };
  CustomerMemo?: { value?: string };
  TotalAmt?: number; Balance?: number;
};
type ViewFilter = 'all' | 'estimates' | 'invoices';

async function fetchAll() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-get-estimates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ancori-secret': FUNCTION_SECRET },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, string>;
    throw new Error(err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ estimates: QboEstimate[]; invoices: QboInvoice[]; customers: QboCustomer[] }>;
}

function fmtMoney(n?: number) {
  return `$${(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso?: string) { return iso?.slice(0, 10) ?? ''; }

type SummaryItem = {
  id: string; name: string;
  estimatesCount: number; estimatesTotal: number;
  invoicesCount: number; invoicesTotal: number;
  total: number;
};

type ClientGroup = {
  clientId: string; clientName: string;
  items: SummaryItem[];
  estimatesCount: number; estimatesTotal: number;
  invoicesCount: number; invoicesTotal: number;
  total: number;
};

export default function EstadosCuentaPage() {
  const { societies, clients } = useApp();

  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [allEstimates, setAllEstimates] = useState<QboEstimate[]>([]);
  const [allInvoices, setAllInvoices]   = useState<QboInvoice[]>([]);
  const [customers, setCustomers]       = useState<QboCustomer[]>([]);
  const [selectedId, setSelectedId]     = useState<string>('__all__');
  const [search, setSearch]             = useState('');
  const [dateFrom, setDateFrom]         = useState('');
  const [dateTo, setDateTo]             = useState('');
  const [viewFilter, setViewFilter]     = useState<ViewFilter>('all');
  const [cotModal, setCotModal]         = useState<QboEstimate | null>(null);
  const [estadoModal, setEstadoModal]   = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['__all__']));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll();
      setAllEstimates(data.estimates);
      setAllInvoices(data.invoices);
      setCustomers(data.customers);
      // Expandir todos los grupos por defecto
      const groupKeys = new Set(['__all__']);
      setExpandedGroups(groupKeys);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error('Error al cargar datos de QuickBooks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const isAll = selectedId === '__all__';
  const hasDateFilter = Boolean(dateFrom || dateTo);

  // ── Filtrado por fecha ─────────────────────────────────────────────────────
  const filteredEstimates = useMemo(() => {
    if (!hasDateFilter) return allEstimates;
    return allEstimates.filter(e => {
      const d = e.TxnDate ?? '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [allEstimates, dateFrom, dateTo, hasDateFilter]);

  const filteredInvoices = useMemo(() => {
    if (!hasDateFilter) return allInvoices;
    return allInvoices.filter(i => {
      const d = i.TxnDate ?? '';
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [allInvoices, dateFrom, dateTo, hasDateFilter]);

  // ── Clientes disponibles en el selector (según viewFilter) ─────────────────
  const clientsInFilter = useMemo(() => {
    const estIds = viewFilter !== 'invoices'
      ? new Set(filteredEstimates.map(e => e.CustomerRef?.value).filter(Boolean) as string[])
      : new Set<string>();
    const invIds = viewFilter !== 'estimates'
      ? new Set(filteredInvoices.filter(i => (i.Balance ?? 0) > 0).map(i => i.CustomerRef?.value).filter(Boolean) as string[])
      : new Set<string>();
    const allIds = new Set([...estIds, ...invIds]);
    return customers
      .filter(c => allIds.has(c.Id))
      .sort((a, b) => (a.DisplayName ?? '').localeCompare(b.DisplayName ?? ''));
  }, [customers, filteredEstimates, filteredInvoices, viewFilter]);

  const filteredClients = useMemo(() =>
    !search.trim()
      ? clientsInFilter
      : clientsInFilter.filter(c =>
          (c.DisplayName ?? c.CompanyName ?? '').toLowerCase().includes(search.trim().toLowerCase()),
        ),
  [clientsInFilter, search]);

  // ── Estimaciones / facturas del cliente seleccionado ──────────────────────
  const clientEstimates = useMemo(() => {
    if (viewFilter === 'invoices') return [];
    return isAll ? filteredEstimates : filteredEstimates.filter(e => e.CustomerRef?.value === selectedId);
  }, [filteredEstimates, selectedId, isAll, viewFilter]);

  const clientInvoices = useMemo(() => {
    if (viewFilter === 'estimates') return [];
    return filteredInvoices.filter(i =>
      (i.Balance ?? 0) > 0 && (isAll || i.CustomerRef?.value === selectedId),
    );
  }, [filteredInvoices, selectedId, isAll, viewFilter]);

  // ── Filas del estado de cuenta ─────────────────────────────────────────────
  const estadoRows = useMemo((): EstadoRow[] => {
    const rows: EstadoRow[] = [
      ...clientEstimates.map(e => ({
        fecha: e.TxnDate ?? '', proforma: e.DocNumber ?? e.Id,
        sociedad: e.CustomerRef?.name ?? '', detalle: e.CustomerMemo?.value ?? '',
        monto: e.TotalAmt ?? 0, abono: 0,
      })),
      ...clientInvoices.map(i => ({
        fecha: i.TxnDate ?? '', proforma: i.DocNumber ?? i.Id,
        sociedad: i.CustomerRef?.name ?? '', detalle: i.CustomerMemo?.value ?? '',
        monto: i.TotalAmt ?? 0, abono: (i.TotalAmt ?? 0) - (i.Balance ?? 0),
      })),
    ];
    return rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [clientEstimates, clientInvoices]);

  // ── Resumen por QB customer con totales separados ─────────────────────────
  const clientSummary = useMemo((): SummaryItem[] => {
    const map = new Map<string, Omit<SummaryItem, 'id' | 'total'>>();

    if (viewFilter !== 'invoices') {
      for (const e of filteredEstimates) {
        const id   = e.CustomerRef?.value ?? '';
        const name = e.CustomerRef?.name ?? id;
        const cur  = map.get(id) ?? { name, estimatesCount: 0, estimatesTotal: 0, invoicesCount: 0, invoicesTotal: 0 };
        map.set(id, { ...cur, estimatesCount: cur.estimatesCount + 1, estimatesTotal: cur.estimatesTotal + (e.TotalAmt ?? 0) });
      }
    }

    if (viewFilter !== 'estimates') {
      for (const i of filteredInvoices) {
        if ((i.Balance ?? 0) <= 0) continue;
        const id   = i.CustomerRef?.value ?? '';
        const name = i.CustomerRef?.name ?? id;
        const cur  = map.get(id) ?? { name, estimatesCount: 0, estimatesTotal: 0, invoicesCount: 0, invoicesTotal: 0 };
        map.set(id, { ...cur, invoicesCount: cur.invoicesCount + 1, invoicesTotal: cur.invoicesTotal + (i.Balance ?? 0) });
      }
    }

    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v, total: v.estimatesTotal + v.invoicesTotal }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredEstimates, filteredInvoices, viewFilter]);

  // ── Agrupación por cliente de la app ──────────────────────────────────────
  const groupedSummary = useMemo((): ClientGroup[] => {
    const groups = new Map<string, ClientGroup>();

    for (const item of clientSummary) {
      // Buscar sociedad por quickbooks_customer_id primero, luego por nombre
      const society =
        societies.find(s => s.quickbooks_customer_id === item.id) ??
        societies.find(s =>
          s.nombre.toLowerCase() === item.name.toLowerCase() ||
          (s.razon_social ?? '').toLowerCase() === item.name.toLowerCase(),
        );
      const client = society?.client_id ? clients.find(c => c.id === society.client_id) : null;

      const groupKey  = client?.id ?? '__unknown__';
      const groupName = client?.nombre ?? 'Sin cliente asignado';

      const g = groups.get(groupKey) ?? {
        clientId: groupKey, clientName: groupName, items: [],
        estimatesCount: 0, estimatesTotal: 0, invoicesCount: 0, invoicesTotal: 0, total: 0,
      };
      g.items.push(item);
      g.estimatesCount  += item.estimatesCount;
      g.estimatesTotal  += item.estimatesTotal;
      g.invoicesCount   += item.invoicesCount;
      g.invoicesTotal   += item.invoicesTotal;
      g.total           += item.total;
      groups.set(groupKey, g);
    }

    return [...groups.values()].sort((a, b) => {
      if (a.clientId === '__unknown__') return 1;
      if (b.clientId === '__unknown__') return -1;
      return a.clientName.localeCompare(b.clientName);
    });
  }, [clientSummary, societies, clients]);

  // ── Totales generales ─────────────────────────────────────────────────────
  const grandTotals = useMemo(() => ({
    estimatesCount: clientSummary.reduce((s, c) => s + c.estimatesCount, 0),
    estimatesTotal: clientSummary.reduce((s, c) => s + c.estimatesTotal, 0),
    invoicesCount:  clientSummary.reduce((s, c) => s + c.invoicesCount,  0),
    invoicesTotal:  clientSummary.reduce((s, c) => s + c.invoicesTotal,  0),
    total:          clientSummary.reduce((s, c) => s + c.total,          0),
  }), [clientSummary]);

  const selectedCustomer = customers.find(c => c.Id === selectedId);
  const customerName = selectedCustomer?.DisplayName ?? selectedCustomer?.CompanyName ?? '';

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 flex items-center gap-2">
            <Receipt className="h-6 w-6 text-orange-500" />
            Estados de Cuenta
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Cotizaciones pendientes y facturas abiertas desde QuickBooks
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Barra de filtros ─────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 space-y-4">
        {/* Fila 1: cliente + botones de acción */}
        <div className="flex flex-col sm:flex-row items-end gap-3">
          <div className="w-full sm:w-[420px] space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {loading ? 'Cargando...' : `${clientsInFilter.length} clientes encontrados`}
            </p>
            <Select value={selectedId} onValueChange={v => { setSelectedId(v); setSearch(''); }}>
              <SelectTrigger className="h-10 text-sm bg-white">
                <SelectValue placeholder="Seleccionar cliente..." />
              </SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1.5 border-b border-border">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    <input
                      className="w-full pl-6 pr-2 py-1.5 text-xs border border-border rounded bg-background outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Buscar cliente..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => e.stopPropagation()}
                    />
                  </div>
                </div>
                <SelectItem value="__all__">
                  <span className="font-medium">Todos los clientes</span>
                </SelectItem>
                {filteredClients.map(c => (
                  <SelectItem key={c.Id} value={c.Id}>
                    {c.DisplayName ?? c.CompanyName}
                  </SelectItem>
                ))}
                {filteredClients.length === 0 && search.trim() && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">Sin resultados</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {!isAll && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 h-10"
                onClick={() => setSelectedId('__all__')}>
                <ChevronLeft className="h-3.5 w-3.5" /> Todos
              </Button>
              {estadoRows.length > 0 && (
                <Button size="sm" className="gap-1.5 h-10 bg-orange-500 hover:bg-orange-600"
                  onClick={() => setEstadoModal(true)}>
                  <BarChart2 className="h-3.5 w-3.5" />
                  Generar Estado de Cuenta
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Fila 2: tipo de registro + rango de fecha */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Filtro tipo */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Mostrar:</span>
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 gap-0.5">
              {([
                { value: 'all',       label: 'Todos'        },
                { value: 'estimates', label: 'Cotizaciones' },
                { value: 'invoices',  label: 'Facturas'     },
              ] as { value: ViewFilter; label: string }[]).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setViewFilter(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    viewFilter === opt.value
                      ? 'bg-white shadow-sm text-gray-900'
                      : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divisor */}
          <div className="h-6 w-px bg-gray-200 hidden sm:block" />

          {/* Rango de fecha */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Fecha:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400 whitespace-nowrap">Desde</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400 whitespace-nowrap">Hasta</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white outline-none focus:ring-1 focus:ring-orange-400 focus:border-orange-400 cursor-pointer"
              />
            </div>
            {hasDateFilter && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Contenido ───────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
          <p className="text-sm">Cargando desde QuickBooks...</p>
        </div>

      ) : isAll ? (
        /* ── Vista resumen agrupada por cliente ── */
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Encabezado de la tabla */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 border-b border-gray-100 bg-gray-50">
            <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Cliente / Sociedad
            </div>
            {viewFilter !== 'invoices' && (
              <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center min-w-[160px]">
                Cotizaciones
              </div>
            )}
            {viewFilter !== 'estimates' && (
              <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center min-w-[160px]">
                Facturas Abiertas
              </div>
            )}
            <div className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right min-w-[140px]">
              Total Pendiente
            </div>
            <div className="px-5 py-3 min-w-[100px]" />
          </div>

          {clientSummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2 text-muted-foreground">
              <Receipt className="h-8 w-8" />
              <p className="text-sm">Sin registros para los filtros seleccionados</p>
            </div>
          ) : (
            <>
              {groupedSummary.map(group => {
                const isExpanded = expandedGroups.has(group.clientId);
                return (
                  <div key={group.clientId}>
                    {/* Fila de cliente (header del grupo) */}
                    <button
                      className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 px-0 py-0
                        bg-orange-50/60 hover:bg-orange-50 border-b border-orange-100/60
                        transition-colors text-left"
                      onClick={() => toggleGroup(group.clientId)}
                    >
                      <div className="px-5 py-3 flex items-center gap-2">
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />}
                        <span className="text-sm font-semibold text-gray-800">{group.clientName}</span>
                        <span className="text-xs text-gray-400">({group.items.length} soc.)</span>
                      </div>
                      {viewFilter !== 'invoices' && (
                        <div className="px-5 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                          <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-bold bg-amber-200 text-amber-800">
                            {group.estimatesCount}
                          </span>
                          <span className="text-xs font-semibold text-amber-700 tabular-nums">
                            {fmtMoney(group.estimatesTotal)}
                          </span>
                        </div>
                      )}
                      {viewFilter !== 'estimates' && (
                        <div className="px-5 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                          {group.invoicesCount > 0 ? (
                            <>
                              <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-bold bg-red-200 text-red-800">
                                {group.invoicesCount}
                              </span>
                              <span className="text-xs font-semibold text-red-700 tabular-nums">
                                {fmtMoney(group.invoicesTotal)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      )}
                      <div className="px-5 py-3 text-right min-w-[140px]">
                        <span className="text-sm font-bold text-orange-600 tabular-nums">
                          {fmtMoney(group.total)}
                        </span>
                      </div>
                      <div className="px-5 py-3 min-w-[100px]" />
                    </button>

                    {/* Filas de sociedades (colapsables) */}
                    {isExpanded && group.items.map((item, idx) => (
                      <div
                        key={item.id}
                        className={cn(
                          'grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 border-b border-gray-100',
                          'hover:bg-blue-50/30 cursor-pointer transition-colors',
                          idx % 2 === 1 && 'bg-gray-50/40',
                        )}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="px-5 py-3 pl-12 text-sm text-gray-700">{item.name}</div>
                        {viewFilter !== 'invoices' && (
                          <div className="px-5 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                            {item.estimatesCount > 0 ? (
                              <>
                                <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-semibold bg-amber-100 text-amber-700">
                                  {item.estimatesCount}
                                </span>
                                <span className="text-xs text-amber-700 tabular-nums">
                                  {fmtMoney(item.estimatesTotal)}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                        )}
                        {viewFilter !== 'estimates' && (
                          <div className="px-5 py-3 flex items-center justify-center gap-2 min-w-[160px]">
                            {item.invoicesCount > 0 ? (
                              <>
                                <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-semibold bg-red-100 text-red-700">
                                  {item.invoicesCount}
                                </span>
                                <span className="text-xs text-red-700 tabular-nums">
                                  {fmtMoney(item.invoicesTotal)}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </div>
                        )}
                        <div className="px-5 py-3 text-right min-w-[140px]">
                          <span className="text-sm font-semibold text-orange-600 tabular-nums">
                            {fmtMoney(item.total)}
                          </span>
                        </div>
                        <div className="px-5 py-3 text-right min-w-[100px]">
                          <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                            onClick={e => { e.stopPropagation(); setSelectedId(item.id); }}>
                            Ver detalle →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}

              {/* Fila de totales generales */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-0 bg-gray-900 text-white">
                <div className="px-5 py-3.5 text-sm font-semibold">
                  Total General — {clientSummary.length} sociedades
                </div>
                {viewFilter !== 'invoices' && (
                  <div className="px-5 py-3.5 flex items-center justify-center gap-2 min-w-[160px]">
                    <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-bold bg-amber-400/30 text-amber-300">
                      {grandTotals.estimatesCount}
                    </span>
                    <span className="text-sm font-semibold text-amber-300 tabular-nums">
                      {fmtMoney(grandTotals.estimatesTotal)}
                    </span>
                  </div>
                )}
                {viewFilter !== 'estimates' && (
                  <div className="px-5 py-3.5 flex items-center justify-center gap-2 min-w-[160px]">
                    <span className="inline-flex items-center justify-center rounded-full w-7 h-7 text-sm font-bold bg-red-400/30 text-red-300">
                      {grandTotals.invoicesCount}
                    </span>
                    <span className="text-sm font-semibold text-red-300 tabular-nums">
                      {fmtMoney(grandTotals.invoicesTotal)}
                    </span>
                  </div>
                )}
                <div className="px-5 py-3.5 text-right min-w-[140px]">
                  <span className="text-base font-bold text-orange-300 tabular-nums">
                    {fmtMoney(grandTotals.total)}
                  </span>
                </div>
                <div className="px-5 py-3.5 min-w-[100px]" />
              </div>
            </>
          )}
        </div>

      ) : (
        /* ── Vista cliente específico ── */
        <div className="space-y-4">
          {/* Cotizaciones pendientes */}
          {viewFilter !== 'invoices' && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <h2 className="text-sm font-semibold">Cotizaciones Pendientes</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums font-medium">
                    Total: {fmtMoney(clientEstimates.reduce((s, e) => s + (e.TotalAmt ?? 0), 0))}
                  </span>
                  <span className="text-xs bg-amber-100 text-amber-700 font-bold px-2.5 py-1 rounded-full">
                    {clientEstimates.length}
                  </span>
                </div>
              </div>
              {clientEstimates.length === 0 ? (
                <p className="text-center py-10 text-sm text-muted-foreground">Sin cotizaciones pendientes</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Proforma</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                        <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Detalle</th>
                        <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                        <th className="px-5 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {clientEstimates.map((e, i) => (
                        <tr key={e.Id} className={cn('hover:bg-gray-50/60', i % 2 === 1 && 'bg-gray-50/30')}>
                          <td className="px-5 py-2.5 font-mono text-xs font-bold text-orange-600">{e.DocNumber ?? e.Id}</td>
                          <td className="px-5 py-2.5 text-xs text-gray-500 tabular-nums">{fmtDate(e.TxnDate)}</td>
                          <td className="px-5 py-2.5 text-xs text-gray-600 max-w-[250px] truncate">{e.CustomerMemo?.value || '—'}</td>
                          <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{fmtMoney(e.TotalAmt)}</td>
                          <td className="px-5 py-2.5 text-right">
                            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1"
                              onClick={() => setCotModal(e)}>
                              <FileText className="h-3 w-3" /> Ver
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-amber-200 bg-amber-50/40">
                      <tr>
                        <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-gray-500">Subtotal cotizaciones</td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-bold text-amber-700">
                          {fmtMoney(clientEstimates.reduce((s, e) => s + (e.TotalAmt ?? 0), 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Facturas abiertas */}
          {viewFilter !== 'estimates' && clientInvoices.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-blue-500" />
                  <h2 className="text-sm font-semibold">Facturas Abiertas / Pago Parcial</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 tabular-nums font-medium">
                    Balance: {fmtMoney(clientInvoices.reduce((s, i) => s + (i.Balance ?? 0), 0))}
                  </span>
                  <span className="text-xs bg-red-100 text-red-700 font-bold px-2.5 py-1 rounded-full">
                    {clientInvoices.length}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">N° Factura</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Detalle</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                      <th className="px-5 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {clientInvoices.map((i, idx) => (
                      <tr key={i.Id} className={cn('hover:bg-gray-50/60', idx % 2 === 1 && 'bg-gray-50/30')}>
                        <td className="px-5 py-2.5 font-mono text-xs font-bold text-blue-600">{i.DocNumber ?? i.Id}</td>
                        <td className="px-5 py-2.5 text-xs text-gray-500 tabular-nums">{fmtDate(i.TxnDate)}</td>
                        <td className="px-5 py-2.5 text-xs text-gray-600 max-w-[250px] truncate">{i.CustomerMemo?.value || '—'}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoney(i.TotalAmt)}</td>
                        <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-red-600">{fmtMoney(i.Balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-blue-200 bg-blue-50/30">
                    <tr>
                      <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-gray-500">Subtotal facturas abiertas</td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-bold text-gray-600">
                        {fmtMoney(clientInvoices.reduce((s, i) => s + (i.TotalAmt ?? 0), 0))}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-bold text-red-700">
                        {fmtMoney(clientInvoices.reduce((s, i) => s + (i.Balance ?? 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Total general del cliente */}
          {(clientEstimates.length > 0 || clientInvoices.length > 0) && (
            <div className="flex justify-end">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-6 py-4 flex items-center gap-8">
                {viewFilter !== 'invoices' && clientEstimates.length > 0 && (
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Cotizaciones</p>
                    <p className="text-base font-bold text-amber-700 tabular-nums">
                      {fmtMoney(clientEstimates.reduce((s, e) => s + (e.TotalAmt ?? 0), 0))}
                    </p>
                  </div>
                )}
                {viewFilter !== 'estimates' && clientInvoices.length > 0 && (
                  <>
                    <div className="h-8 w-px bg-orange-200" />
                    <div className="text-center">
                      <p className="text-xs text-gray-500 mb-0.5">Facturas (balance)</p>
                      <p className="text-base font-bold text-red-600 tabular-nums">
                        {fmtMoney(clientInvoices.reduce((s, i) => s + (i.Balance ?? 0), 0))}
                      </p>
                    </div>
                  </>
                )}
                <div className="h-8 w-px bg-orange-200" />
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-0.5">Total pendiente</p>
                  <p className="text-xl font-extrabold text-orange-600 tabular-nums">
                    {fmtMoney(
                      clientEstimates.reduce((s, e) => s + (e.TotalAmt ?? 0), 0) +
                      clientInvoices.reduce((s, i) => s + (i.Balance ?? 0), 0),
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal cotización */}
      <Dialog open={cotModal != null} onOpenChange={o => { if (!o) setCotModal(null); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cotización {cotModal?.DocNumber ?? cotModal?.Id}</DialogTitle>
          </DialogHeader>
          {cotModal && <CotizacionDoc estimate={cotModal} />}
        </DialogContent>
      </Dialog>

      {/* Modal estado de cuenta */}
      <Dialog open={estadoModal} onOpenChange={setEstadoModal}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Estado de Cuenta — {customerName}</DialogTitle>
          </DialogHeader>
          <EstadoCuentaDoc clientName={customerName} rows={estadoRows} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
