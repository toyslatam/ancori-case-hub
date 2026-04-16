import { useMemo, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { CaseInvoice, Case, Client, Society } from '@/data/mockData';
import { InvoiceModal } from '@/components/cases/InvoiceModal';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Clock, CheckCircle, Search, Trash2, ExternalLink, RefreshCw, Send, Loader2, FileDown, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { findCaseForInvoice } from '@/lib/invoiceCaseLink';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const FUNCTION_SECRET = import.meta.env.VITE_FUNCTION_SECRET as string;

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

function hasQbCustomer(inv: RichInvoice, cases: Case[], clients: Client[], societies: Society[]): boolean {
  if (inv.society_id) {
    const s = societies.find(x => x.id === inv.society_id);
    return Boolean(s?.quickbooks_customer_id ?? (s?.id_qb != null ? String(s.id_qb) : ''));
  }
  if (inv.client_id) {
    const c = clients.find(x => x.id === inv.client_id);
    return Boolean(c?.quickbooks_customer_id);
  }
  const resolved = inv.case_id ? cases.find(c => c.id === inv.case_id) : findCaseForInvoice(inv, cases);
  const cse = inv.case ?? resolved;
  if (cse?.society_id) {
    const s = societies.find(x => x.id === cse.society_id);
    return Boolean(s?.quickbooks_customer_id ?? (s?.id_qb != null ? String(s.id_qb) : ''));
  }
  if (cse?.client_id) {
    const c = clients.find(x => x.id === cse.client_id);
    return Boolean(c?.quickbooks_customer_id);
  }
  return false;
}

function reconciliationHint(inv: RichInvoice): string | null {
  if (!inv.qb_invoice_id) return null;
  if (inv.qb_total != null && Math.abs(inv.qb_total - inv.total) > 0.02) {
    return `Total local $${inv.total.toFixed(2)} vs QBO $${inv.qb_total.toFixed(2)}`;
  }
  if (inv.qb_balance != null && inv.qb_balance === 0 && (inv.estado === 'pendiente' || inv.estado === 'borrador')) {
    return 'Cobrada en QBO; estado local pendiente/borrador';
  }
  return null;
}

export default function FacturasPage() {
  const { cases, allInvoices, clients, societies, getClientName, getSocietyName, deleteInvoice, patchInvoice } = useApp();

  const [tab, setTab] = useState<Tab>('todas');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<RichInvoice | null>(null);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RichInvoice | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);

  // Facturas enriquecidas — derivadas del AppContext (ya cargadas, sin query extra)
  const dbInvoices = useMemo<RichInvoice[]>(() => {
    return allInvoices
      .slice()
      .sort((a, b) => (b.fecha_factura ?? '').localeCompare(a.fecha_factura ?? ''))
      .map(inv => {
        const matchedCase = inv.case_id
          ? cases.find(c => c.id === inv.case_id)
          : findCaseForInvoice(inv, cases);
        const clientId = inv.client_id ?? matchedCase?.client_id;
        const societyId = inv.society_id ?? matchedCase?.society_id;
        return {
          ...inv,
          case: matchedCase,
          _clientName: getClientName(clientId),
          _societyName: getSocietyName(societyId),
          _caseNum: matchedCase
            ? (matchedCase.n_tarea != null ? String(matchedCase.n_tarea).padStart(7, '0') : matchedCase.numero_caso)
            : undefined,
        };
      });
  }, [allInvoices, cases, getClientName, getSocietyName]);

  // Para el botón "Actualizar" — recarga la página completa
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

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
    const resolved = inv.case ?? findCaseForInvoice(inv, cases);
    if (!resolved) {
      toast.error(
        'Esta factura no tiene caso vinculado (case_id vacío) y hay varios casos o ninguno con el mismo cliente/sociedad. Asigna case_id en Supabase o unifica el cliente en la factura.',
      );
      return;
    }
    setSelectedInvoice(inv);
    setSelectedCase(resolved);
    setModalOpen(true);
  };

  const handleSendToQB = async (inv: RichInvoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!FUNCTION_SECRET) { toast.error('VITE_FUNCTION_SECRET no configurado'); return; }
    if (!hasQbCustomer(inv, cases, clients, societies)) {
      toast.error('Configura quickbooks_customer_id en el cliente o en la sociedad antes de enviar.');
      return;
    }
    const linesWithDesc = (inv.lines ?? []).filter(l => String(l.descripcion ?? '').trim());
    if (linesWithDesc.some(l => !l.qb_item_id)) {
      toast.error('Cada línea con descripción debe tener un producto/servicio QuickBooks.');
      return;
    }
    setSendingId(inv.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-create-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ancori-secret': FUNCTION_SECRET,
        },
        body: JSON.stringify({ invoice_id: inv.id }),
      });
      const data = await res.json() as {
        ok?: boolean;
        qb_invoice_id?: string;
        doc_number?: string;
        total_amt?: number;
        balance?: number;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.ok) {
        const errText = typeof data.detail === 'string'
          ? data.detail
          : JSON.stringify(data.detail ?? data.error ?? 'Sin detalle');
        patchInvoice(inv.id, { estado: 'error', error_detalle: errText.slice(0, 2000) });
        toast.error(`Error QB: ${errText.slice(0, 280)}`);
        return;
      }
      toast.success(`Factura enviada a QB${data.doc_number ? ` — N° ${data.doc_number}` : ''}`);
      patchInvoice(inv.id, {
        estado: 'enviada',
        qb_invoice_id: data.qb_invoice_id,
        numero_factura: data.doc_number ?? inv.numero_factura,
        error_detalle: undefined,
        qb_total: typeof data.total_amt === 'number' ? data.total_amt : undefined,
        qb_balance: typeof data.balance === 'number' ? data.balance : undefined,
        qb_last_sync_at: new Date().toISOString(),
      });
    } catch (err) {
      toast.error(`Error de red: ${String(err)}`);
    } finally {
      setSendingId(null);
    }
  };

  const handlePdf = async (inv: RichInvoice, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!FUNCTION_SECRET) { toast.error('VITE_FUNCTION_SECRET no configurado'); return; }
    if (!inv.qb_invoice_id) { toast.error('La factura aún no tiene Id en QuickBooks.'); return; }
    setPdfLoadingId(inv.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/qbo-invoice-pdf-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ancori-secret': FUNCTION_SECRET,
        },
        body: JSON.stringify({ invoice_id: inv.id, force: inv.pdf_status === 'error' }),
      });
      const data = await res.json() as { ok?: boolean; signed_url?: string | null; path?: string; error?: string; detail?: string };
      if (!res.ok || !data.ok) {
        toast.error(`PDF: ${data.detail ?? data.error ?? 'Error'}`);
        patchInvoice(inv.id, { pdf_status: 'error' });
        return;
      }
      if (data.signed_url) {
        window.open(data.signed_url, '_blank', 'noopener,noreferrer');
        patchInvoice(inv.id, {
          pdf_status: 'ok',
          pdf_path: data.path,
          pdf_synced_at: new Date().toISOString(),
        });
      } else {
        toast.message('PDF sincronizado; no se pudo generar URL firmada.');
      }
    } catch (err) {
      toast.error(`Error de red: ${String(err)}`);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteInvoice(deleteTarget.case?.id ?? '', deleteTarget.id);
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
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
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
                <th className="text-left py-2.5 px-4 font-medium text-gray-500 text-xs">Conciliación</th>
                <th className="text-center py-2.5 px-4 font-medium text-gray-500 text-xs">Estado</th>
                <th className="w-28 py-2.5 px-4 font-medium text-gray-500 text-xs text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-gray-400">
                    {search ? 'Sin resultados para tu búsqueda' : 'No hay facturas en esta vista'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv, idx) => {
                  const isOverdue = inv.estado === 'pendiente' && inv.fecha_vencimiento && inv.fecha_vencimiento < today;
                  const recon = reconciliationHint(inv);
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
                      <td className="py-3 px-4 max-w-[200px]">
                        {recon ? (
                          <span
                            className="inline-flex items-start gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1"
                            title={recon}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                            <span className="leading-snug">{recon}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${ESTADO_STYLE[inv.estado]}`}>
                          {ESTADO_LABEL[inv.estado]}
                        </span>
                      </td>
                      <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end flex-wrap">
                          {(inv.estado === 'pendiente' || inv.estado === 'borrador') && (
                            <button
                              onClick={e => handleSendToQB(inv, e)}
                              disabled={sendingId === inv.id}
                              title="Enviar a QuickBooks"
                              className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50"
                            >
                              {sendingId === inv.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Send className="h-3.5 w-3.5" />}
                              <span className="hidden sm:inline">QB</span>
                            </button>
                          )}
                          {inv.qb_invoice_id && inv.estado !== 'borrador' && (
                            <button
                              onClick={e => handlePdf(inv, e)}
                              disabled={pdfLoadingId === inv.id}
                              title={inv.pdf_status === 'error' ? 'Reintentar PDF' : 'Ver PDF'}
                              className="h-7 px-2 flex items-center gap-1 rounded-lg text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 border border-sky-200 transition-colors disabled:opacity-50"
                            >
                              {pdfLoadingId === inv.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <FileDown className="h-3.5 w-3.5" />}
                              <span className="hidden sm:inline">PDF</span>
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(inv)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
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
        open={modalOpen && !!selectedCase && !!selectedInvoice}
        onClose={() => { setModalOpen(false); setSelectedInvoice(null); setSelectedCase(null); }}
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
