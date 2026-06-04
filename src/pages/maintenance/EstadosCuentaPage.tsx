import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Loader2, FileText, BarChart2, RefreshCw, AlertCircle,
  Search, ChevronLeft, Receipt,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
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

export default function EstadosCuentaPage() {
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [allEstimates, setAllEstimates] = useState<QboEstimate[]>([]);
  const [allInvoices, setAllInvoices]   = useState<QboInvoice[]>([]);
  const [customers, setCustomers]       = useState<QboCustomer[]>([]);
  const [selectedId, setSelectedId]     = useState<string>('__all__');
  const [search, setSearch]             = useState('');
  const [cotModal, setCotModal]         = useState<QboEstimate | null>(null);
  const [estadoModal, setEstadoModal]   = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll();
      setAllEstimates(data.estimates);
      setAllInvoices(data.invoices);
      setCustomers(data.customers);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error('Error al cargar datos de QuickBooks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const isAll = selectedId === '__all__';

  // Clientes que tienen cotizaciones pendientes
  const clientsWithEstimates = useMemo(() => {
    const ids = new Set(allEstimates.map(e => e.CustomerRef?.value).filter(Boolean));
    return customers
      .filter(c => ids.has(c.Id))
      .sort((a, b) => (a.DisplayName ?? '').localeCompare(b.DisplayName ?? ''));
  }, [customers, allEstimates]);

  const filteredClients = useMemo(() =>
    !search.trim()
      ? clientsWithEstimates
      : clientsWithEstimates.filter(c =>
          (c.DisplayName ?? c.CompanyName ?? '').toLowerCase().includes(search.trim().toLowerCase()),
        ),
  [clientsWithEstimates, search]);

  // Estimaciones del cliente seleccionado
  const clientEstimates = useMemo(() =>
    isAll ? allEstimates : allEstimates.filter(e => e.CustomerRef?.value === selectedId),
  [allEstimates, selectedId, isAll]);

  // Facturas abiertas del cliente seleccionado
  const clientInvoices = useMemo(() =>
    allInvoices.filter(i =>
      (i.Balance ?? 0) > 0 && (isAll || i.CustomerRef?.value === selectedId),
    ),
  [allInvoices, selectedId, isAll]);

  // Filas del estado de cuenta
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

  // Resumen por cliente (para vista "Todos")
  const clientSummary = useMemo(() => {
    const map = new Map<string, { name: string; estimates: number; invoices: number; total: number }>();
    for (const e of allEstimates) {
      const id   = e.CustomerRef?.value ?? '';
      const name = e.CustomerRef?.name ?? id;
      const cur  = map.get(id) ?? { name, estimates: 0, invoices: 0, total: 0 };
      map.set(id, { ...cur, estimates: cur.estimates + 1, total: cur.total + (e.TotalAmt ?? 0) });
    }
    for (const i of allInvoices) {
      if ((i.Balance ?? 0) <= 0) continue;
      const id   = i.CustomerRef?.value ?? '';
      const name = i.CustomerRef?.name ?? id;
      const cur  = map.get(id) ?? { name, estimates: 0, invoices: 0, total: 0 };
      map.set(id, { ...cur, invoices: cur.invoices + 1, total: cur.total + (i.Balance ?? 0) });
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEstimates, allInvoices]);

  const selectedCustomer = customers.find(c => c.Id === selectedId);
  const customerName = selectedCustomer?.DisplayName ?? selectedCustomer?.CompanyName ?? '';

  return (
    <div className="px-6 py-6 max-w-6xl mx-auto space-y-5">
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

      {/* Selector */}
      <div className="flex flex-col sm:flex-row items-end gap-3">
        <div className="w-full sm:w-[440px] space-y-1">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {loading ? 'Cargando...' : `${clientsWithEstimates.length} clientes con cotizaciones pendientes`}
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-orange-400" />
          <p className="text-sm">Cargando desde QuickBooks...</p>
        </div>
      ) : isAll ? (
        /* ── Vista resumen (todos los clientes) ── */
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">Resumen por cliente</p>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span>{allEstimates.length} cotizaciones pendientes</span>
              <span>·</span>
              <span>{allInvoices.filter(i => (i.Balance ?? 0) > 0).length} facturas abiertas</span>
            </div>
          </div>
          {clientSummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <Receipt className="h-8 w-8" />
              <p className="text-sm">Sin cotizaciones pendientes en QuickBooks</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente / Sociedad</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Cotizaciones</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Facturas abiertas</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total pendiente</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {clientSummary.map((c, i) => (
                  <tr key={c.id} className={cn('hover:bg-orange-50/40 cursor-pointer transition-colors', i % 2 === 1 && 'bg-gray-50/50')}
                    onClick={() => setSelectedId(c.id)}>
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 text-center">
                      {c.estimates > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2.5 py-0.5">
                          {c.estimates}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {c.invoices > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-red-100 text-red-700 text-xs font-semibold px-2.5 py-0.5">
                          {c.invoices}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-orange-600">
                      {fmtMoney(c.total)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                        onClick={e => { e.stopPropagation(); setSelectedId(c.id); }}>
                        Ver detalle →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ── Vista cliente específico ── */
        <div className="space-y-4">
          {/* Cotizaciones pendientes */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-orange-500" />
                <h2 className="text-sm font-semibold">Cotizaciones Pendientes</h2>
              </div>
              <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2.5 py-0.5 rounded-full">
                {clientEstimates.length}
              </span>
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
                </table>
              </div>
            )}
          </div>

          {/* Facturas abiertas */}
          {clientInvoices.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-blue-500" />
                  <h2 className="text-sm font-semibold">Facturas Abiertas / Pago Parcial</h2>
                </div>
                <span className="text-xs bg-red-100 text-red-700 font-semibold px-2.5 py-0.5 rounded-full">
                  {clientInvoices.length}
                </span>
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
                </table>
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
