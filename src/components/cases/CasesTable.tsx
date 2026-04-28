import { useState } from 'react';
import { Case, formatNTarea } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { MessageSquare, DollarSign, FileText, Trash2, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CasesTableProps {
  cases: Case[];
  onOpenComments: (c: Case) => void;
  onOpenExpenses: (c: Case) => void;
  onOpenInvoice: (c: Case) => void;
  onEditCase: (c: Case) => void;
  onDeleteCase: (id: string) => void;
}

// ── Badge de estado ────────────────────────────────────────────────────────
const estadoBadge: Record<string, string> = {
  'Pendiente':            'bg-amber-50  text-amber-600  ring-1 ring-amber-200',
  'En Curso':             'bg-sky-50    text-sky-600    ring-1 ring-sky-200',
  'Completado/Facturado': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200',
  'Cancelado':            'bg-gray-100  text-gray-400   ring-1 ring-gray-200',
};

export function CasesTable({
  cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase,
}: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceItemName, getUsuarioName, allInvoices } = useApp();
  const [sortField, setSortField] = useState<string>('n_tarea');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');
  const [page, setPage]           = useState(0);
  const perPage = 20;

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sorted = [...cases].sort((a, b) => {
    const av = (a as any)[sortField] ?? '';
    const bv = (b as any)[sortField] ?? '';
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paginated  = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(cases.length / perPage);

  // ── Helpers de cabecera ────────────────────────────────────────────────
  const thBase = 'px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap select-none bg-gray-50';

  const SortTh = ({
    field, children, className,
  }: { field: string; children: React.ReactNode; className?: string }) => (
    <th
      className={cn(thBase, 'cursor-pointer hover:text-gray-600 transition-colors', className)}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn('h-2.5 w-2.5 transition-opacity', sortField === field ? 'opacity-100 text-gray-500' : 'opacity-30')} />
      </span>
    </th>
  );

  const Th = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <th className={cn(thBase, className)}>{children}</th>
  );

  return (
    <div className="w-full min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* ── Título de la tabla ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">Seguimiento de casos</h2>
        <span className="text-xs text-gray-400">{cases.length} caso{cases.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="w-full overflow-hidden">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[10%]" />
            <col className="w-[28%]" />
            <col className="w-[21%]" />
            <col className="w-[12%]" />
            <col className="w-[11%]" />
            <col className="w-[18%]" />
          </colgroup>

          {/* ── THEAD sticky ──────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-gray-100">
              <SortTh field="n_tarea">Caso</SortTh>
              <Th>Cliente</Th>
              <Th>Servicio</Th>
              <SortTh field="estado">Estado</SortTh>
              <Th>Responsable</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>

          {/* ── TBODY ─────────────────────────────────────────────────── */}
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-sm text-gray-400">
                  No hay casos que mostrar
                </td>
              </tr>
            ) : paginated.map((c, idx) => {
              const clienteNombre  = c.society_id ? getClientName(c.client_id) || getSocietyName(c.society_id) : getClientName(c.client_id);
              const sociedadNombre = getSocietyName(c.society_id);
              const servicioNombre = getServiceItemName(c.service_item_id);
              const responsable    = getUsuarioName(c.usuario_asignado_id) || c.responsable;
              const commentCount   = c.comments?.length ?? 0;
              const invoiceCount   = allInvoices.filter(i => i.case_id === c.id).length;
              const rowBg          = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40';
              const clienteMeta = [
                sociedadNombre ? `Sociedad: ${sociedadNombre}` : null,
                c.creado_por ? `Creado por: ${c.creado_por}` : null,
              ].filter(Boolean).join(' · ');

              return (
                <tr
                  key={c.id}
                  className={cn('group cursor-pointer transition-colors duration-100 hover:bg-blue-50/30', rowBg)}
                  onClick={() => onEditCase(c)}
                >

                  {/* ── Caso ─────────────────────────────────────── */}
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-bold text-sky-600">
                    <span className="block truncate">{formatNTarea(c.n_tarea) || c.numero_caso}</span>
                  </td>

                  {/* ── Cliente compuesto ────────────────────────── */}
                  <td className="px-4 py-3">
                    <span className="block truncate text-sm font-semibold text-gray-800" title={clienteNombre}>
                      {clienteNombre || '—'}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-gray-400" title={clienteMeta || undefined}>
                      {clienteMeta || (c.cliente_temporal ? 'Cliente temporal' : '—')}
                    </span>
                  </td>

                  {/* ── Servicio ─────────────────────────────────── */}
                  <td className="px-4 py-3">
                    <span
                      className="block truncate text-sm text-gray-700 leading-snug"
                      title={servicioNombre || c.descripcion}
                    >
                      {servicioNombre || c.descripcion || '—'}
                    </span>
                  </td>

                  {/* ── Estado ───────────────────────────────────── */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={cn(
                      'inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[10px] font-semibold',
                      estadoBadge[c.estado] ?? 'bg-gray-100 text-gray-400',
                    )}>
                      <span className="truncate">{c.estado}</span>
                    </span>
                  </td>

                  {/* ── Responsable ──────────────────────────────── */}
                  <td className="px-4 py-3">
                    <span className="block truncate text-sm text-gray-600" title={responsable}>
                      {responsable || '—'}
                    </span>
                  </td>

                  {/* ── Acciones ─────────────────────────────────── */}
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        onClick={() => onOpenComments(c)}
                        title="Ver comentarios"
                        className={cn(
                          'inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-semibold transition-all duration-100',
                          commentCount > 0
                            ? 'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-100'
                            : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-600',
                        )}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Ver
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-violet-600 ring-1 ring-violet-100">
                          💬 {commentCount}
                        </span>
                      </button>
                      <button
                        onClick={() => onOpenExpenses(c)}
                        title="Gastos"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-all duration-100 hover:bg-emerald-50 hover:text-emerald-500"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onOpenInvoice(c)}
                        title="Facturas"
                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition-all duration-100 hover:bg-sky-50 hover:text-sky-500"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {invoiceCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
                            {invoiceCount > 9 ? '9+' : invoiceCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteCase(c.id)}
                        title="Eliminar"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-200 transition-all duration-100 hover:bg-red-50 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Paginación ────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-100 bg-gray-50/50">
          <span className="text-[11px] text-gray-400">
            Página <span className="font-semibold text-gray-600">{page + 1}</span> de {totalPages}
            &nbsp;·&nbsp;
            <span className="font-semibold text-gray-600">{cases.length}</span> casos
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-100"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-100"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
