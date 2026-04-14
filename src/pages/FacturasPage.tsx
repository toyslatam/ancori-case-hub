import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { CaseInvoice, InvoiceLine, Case } from '@/data/mockData';
import { InvoiceModal } from '@/components/cases/InvoiceModal';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Clock, CheckCircle, Search, Trash2, ExternalLink, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';

type Tab = 'todas' | 'pendientes' | 'enviadas' | 'anuladas';

interface RichInvoice extends CaseInvoice {
  case?: Case;
  _clientName?: string;
  _societyName?: string;
  _caseNum?: string;
}

const ESTADO_LABEL: Record<CaseInvoice['estado'], string> = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  enviada: 'Enviada',
  error: 'Error',
  anulada: 'Anulada',
};

const ESTADO_STYLE: Record<CaseInvoice['estado'], string> = {
  borrador: 'bg-gray-100 text-gray-600 ring-gray-200',
  pendiente: 'bg-amber-100 text-amber-700 ring-amber-200',
  enviada: 'bg-green-100 text-green-700 ring-green-200',
  error: 'bg-red-100 text-red-700 ring-red-200',
  anulada: 'bg-slate-100 text-slate-500 ring-slate-200',
};

function formatDate(d?: string) {
  if (!d) return '—';
  const p = d.split('-');
  if (p.length !== 3) return d;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function FacturasPage() {
  const { cases, clients, societies, getClientName, getSocietyName, deleteInvoice } = useApp();

  const [tab, setTab] = useState<Tab>('todas');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<RichInvoice | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RichInvoice | null>(null);
  const [loading, setLoading] = useState(false);

  // Facturas directamente de Supabase (independiente del nested en cases)
  const [dbInvoices, setDbInvoices] = useState<RichInvoice[]>([]);

  const loadInvoices = async () => {
    const sb = getSupabase();
    if (!sb) {
      // Fallback: derivar de cases locales
      const local: RichInvoice[] = cases.flatMap(c =>
        (c.invoices ?? []).map(inv => ({
          ...inv,
          case: c,
          _clientName: getClientName(c.client_id),
          _societyName: getSocietyName(c.society_id),
          _caseNum: c.n_tarea != null ? String(c.n_tarea).padStart(7, '0') : c.numero_caso,
        }))
      );
      setDbInvoices(local);
      return;
    }

    setLoading(true);
    try {
      const [invRes, linesRes] = await Promise.all([
        sb.from('case_invoices').select('*').order('fecha_factura', { ascending: false }),
        sb.from('invoice_lines').select('*'),
      ]);

      if (invRes.error) { toast.error(invRes.error.message); return; }

      const linesByInv = new Map<string, InvoiceLine[]>();
      for (const r of (linesRes.data ?? [])) {
        const row = r as Record<string, unknown>;
        const invId = String(row.invoice_id);
        const existing = linesByInv.get(invId) ?? [];
        existing.push({
          id: String(row.id),
          invoice_id: invId,
          servicio_id: row.servicio_id ? String(row.servicio_id) : undefined,
          qb_item_id: row.qb_item_id ? String(row.qb_item_id) : undefined,
          descripcion: String(row.descripcion ?? ''),
          cantidad: Number(row.cantidad ?? 1),
          tarifa: Number(row.tarifa ?? 0),
          importe: Number(row.cantidad ?? 1) * Number(row.tarifa ?? 0),
          itbms: Number(row.itbms ?? 0),
          categoria: row.categoria ? String(row.categoria) : undefined,
        });
        linesByInv.set(invId, existing);
      }

      const rich: RichInvoice[] = (invRes.data ?? []).map(r => {
        const row = r as Record<string, unknown>;
        const caseId = row.case_id ? String(row.case_id) : undefined;
        const matchedCase = caseId ? cases.find(c => c.id === caseId) : undefined;
        const clientId = row.client_id ? String(row.client_id) : matchedCase?.client_id;
        const societyId = row.society_id ? String(row.society_id) : matchedCase?.society_id;
        const id = String(row.id);

        return {
          id,
          case_id: caseId ?? '',
          client_id: clientId,
          society_id: societyId,
          term_id: row.term_id ? String(row.term_id) : undefined,
          fecha_factura: String(row.fecha_factura ?? ''),
          fecha_vencimiento: String(row.fecha_vencimiento ?? ''),
          subtotal: Number(row.subtotal ?? 0),
          impuesto: Number(row.impuesto ?? 0),
          total: Number(row.total ?? 0),
          estado: (row.estado as CaseInvoice['estado']) ?? 'pendiente',
          qb_invoice_id: row.qb_invoice_id ? String(row.qb_invoice_id) : undefined,
          numero_factura: row.numero_factura ? String(row.numero_factura) : undefined,
          nota_cliente: row.nota_cliente ? String(row.nota_cliente) : undefined,
          lines: linesByInv.get(id) ?? [],
          case: matchedCase,
          _clientName: getClientName(clientId),
          _societyName: getSocietyName(societyId),
          _caseNum: matchedCase
            ? (matchedCase.n_tarea != null ? String(matchedCase.n_tarea).padStart(7, '0') : matchedCase.numero_caso)
            : undefined,
        };
      });

      setDbInvoices(rich);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadInvoices(); }, [cases]);

  const counts = useMemo(() => ({
    todas:     dbInvoices.length,
    pendientes: dbInvoices.filter(i => i.estado === 'pendiente').length,
    enviadas:   dbInvoices.filter(i => i.estado === 'enviada').length,
    anuladas:   dbInvoices.filter(i => i.estado === 'anulada').length,
  }), [dbInvoices]);

  const filtered = useMemo(() => {
    let list = dbInvoices;
    if (tab === 'pendientes') list = list.filter(i => i.estado === 'pendiente');
    else if (tab === 'enviadas')  list = list.filter(i => i.estado === 'enviada');
    else if (tab === 'anuladas')  list = list.filter(i => i.estado === 'anulada');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        (i.numero_factura ?? '').toLowerCase().includes(q) ||
        (i._clientName ?? '').toLowerCase().includes(q) ||
        (i._societyName ?? '').toLowerCase().includes(q) ||
        (i._caseNum ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [dbInvoices, tab, search]);

  const openEdit = (inv: RichInvoice) => {
    setSelectedInvoice(inv);
    setSelectedCase(inv.case ?? null);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.case) {
      await deleteInvoice(deleteTarget.case.id, deleteTarget.id);
    } else {
      const sb = getSupabase();
      if (sb) await sb.from('case_invoices').delete().eq('id', deleteTarget.id);
    }
    setDbInvoices(prev => prev.filter(i => i.id !== deleteTarget.id));
    toast.success('Factura eliminada');
    setDeleteTarget(null);
  };

  const TABS: { key: Tab; label: string; icon?: React.ReactNode }[] = [
    { key: 'todas',     label: 'Todas',     icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'pendientes',label: 'Pendientes',icon: <Clock className="h-3.5 w-3.5" /> },
    { key: 'enviadas',  label: 'Enviadas',  icon: <CheckCircle className="h-3.5 w-3.5" /> },
    { key: 'anuladas',  label: 'Anuladas' },
  ];

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="p-5 min-w-0 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Facturas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {dbInvoices.length} factura{dbInvoices.length !== 1 ? 's' : ''} en total
          </p>
        </div>
        <button
          onClick={loadInvoices}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Banner pendientes */}
      {counts.pendientes > 0 && (
        <div
          className="mb-5 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition-colors"
          onClick={() => setTab('pendientes')}
        >
          <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {counts.pendientes} factura{counts.pendientes !== 1 ? 's' : ''} pendiente{counts.pendientes !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-amber-600">Haz clic para ver solo las pendientes</p>
          </div>
          <ExternalLink className="h-4 w-4 text-amber-400 ml-auto" />
        </div>
      )}

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
              <span className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                tab === t.key ? 'bg-orange-100 text-orange-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar factura, cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs rounded-lg border-gray-200 w-60"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 overflow-hidden shadow-sm bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">N° Factura</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">Caso</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">Cliente / Sociedad</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">Fecha Factura</th>
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">Vencimiento</th>
                <th className="text-right py-2.5 px-4 font-medium text-gray-500 text-xs">Total</th>
                <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-xs">Estado</th>
                <th className="w-12 py-2.5 px-4" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                    Cargando facturas...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                    {search ? 'Sin resultados para tu búsqueda' : 'No hay facturas en esta vista'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv, idx) => {
                  const isOverdue = inv.estado === 'pendiente' && inv.fecha_vencimiento && inv.fecha_vencimiento < today;
                  return (
                    <tr
                      key={inv.id}
                      className={`border-b border-gray-50 hover:bg-orange-50/30 cursor-pointer transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                      }`}
                      onClick={() => openEdit(inv)}
                    >
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-gray-700">
                          {inv.numero_factura || <span className="text-gray-400 italic font-normal">Sin N°</span>}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {inv._caseNum
                          ? <span className="font-mono text-xs text-orange-600 font-medium">#{inv._caseNum}</span>
                          : <span className="text-xs text-gray-300 italic">Sin caso</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-xs font-medium text-gray-700 leading-tight">{inv._clientName || '—'}</p>
                          {inv._societyName && (
                            <p className="text-[11px] text-gray-400 leading-tight">{inv._societyName}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">{formatDate(inv.fecha_factura)}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                          {formatDate(inv.fecha_vencimiento)}
                          {isOverdue && (
                            <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Vencida</span>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-xs font-semibold text-gray-800">${inv.total.toFixed(2)}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${ESTADO_STYLE[inv.estado]}`}>
                          {ESTADO_LABEL[inv.estado]}
                        </span>
                      </td>
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setDeleteTarget(inv)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <span className="text-xs text-gray-400">{filtered.length} registro{filtered.length !== 1 ? 's' : ''}</span>
            <span className="text-xs font-semibold text-gray-700">
              Total: ${filtered.reduce((s, i) => s + i.total, 0).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Invoice modal */}
      <InvoiceModal
        caseData={selectedCase}
        invoice={selectedInvoice}
        open={modalOpen && !!selectedCase}
        onClose={() => { setModalOpen(false); setSelectedInvoice(null); setSelectedCase(null); loadInvoices(); }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la factura {deleteTarget?.numero_factura ?? ''} permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
