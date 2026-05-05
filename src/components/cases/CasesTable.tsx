import { useState } from 'react';
import { Case, formatNTarea } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { MessageSquare, DollarSign, FileText, Trash2, ArrowUpDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

// Muestra reversible: cambiar a `false` para volver a la tabla anterior.
// Deja filas más altas, textos en 2 líneas y scroll horizontal cuando haga falta.
const READABLE_CASES_TABLE_SAMPLE = true;

function observacionesToArray(texto: unknown): string[] {
  if (Array.isArray(texto)) {
    return texto.map(String).map(v => v.trim()).filter(Boolean);
  }
  if (typeof texto !== 'string') return [];
  return texto
    .split(/\r?\n+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function countObservaciones(texto: unknown): number {
  return observacionesToArray(texto).length;
}

export function CasesTable({
  cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase,
}: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceItemName, getUsuarioName, allInvoices } = useApp();
  const [sortField, setSortField] = useState<string>('n_tarea');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');
  const [page, setPage]           = useState(0);
  const [observacionesModal, setObservacionesModal] = useState<{ caseLabel: string; items: string[] } | null>(null);
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
  const thBase = cn(
    'text-left font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap select-none bg-gray-50',
    READABLE_CASES_TABLE_SAMPLE ? 'px-4 py-3 text-[9px]' : 'px-4 py-3 text-[10px]',
  );
  const tdBase = cn(
    'align-top',
    READABLE_CASES_TABLE_SAMPLE ? 'px-4 py-[18px]' : 'px-4 py-4',
  );

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
    <div className={cn(
      'w-full min-w-0 border border-gray-200 bg-white overflow-hidden',
      READABLE_CASES_TABLE_SAMPLE ? 'rounded-2xl shadow-md' : 'rounded-xl shadow-sm',
    )}>

      {/* ── Título de la tabla ────────────────────────────────────────── */}
      <div className={cn(
        'flex items-center justify-between border-b border-gray-100 bg-white',
        READABLE_CASES_TABLE_SAMPLE ? 'px-6 py-4' : 'px-5 py-3',
      )}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-700">Seguimiento de casos</h2>
        </div>
        <span className="text-xs text-gray-400">{cases.length} caso{cases.length !== 1 ? 's' : ''}</span>
      </div>

      <div
        className={cn(
          'w-full overflow-x-auto overscroll-x-contain',
          '[&::-webkit-scrollbar]:h-1.5',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:rounded-full',
          READABLE_CASES_TABLE_SAMPLE
            ? '[&::-webkit-scrollbar-thumb]:bg-orange-200 [&::-webkit-scrollbar-thumb:hover]:bg-orange-300'
            : '[&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb:hover]:bg-gray-300',
        )}
      >
        <table className={cn('w-full border-collapse', READABLE_CASES_TABLE_SAMPLE ? 'min-w-[1450px]' : 'min-w-[1040px]')}>
          {/* ── THEAD sticky ──────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-gray-100">
              <SortTh field="n_tarea" className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[95px]' : 'min-w-[110px]'}>Caso</SortTh>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[180px]' : 'min-w-[190px]'}>Cliente</Th>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[210px]' : 'min-w-[180px]'}>Sociedad</Th>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[130px]' : 'min-w-[140px]'}>Creado Por</Th>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[210px]' : 'min-w-[260px]'}>Servicio</Th>
              {READABLE_CASES_TABLE_SAMPLE && (
                <Th className="min-w-[240px]">Descripción</Th>
              )}
              <SortTh field="estado" className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[140px]' : 'min-w-[150px]'}>Estado</SortTh>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'min-w-[150px]' : 'min-w-[150px]'}>Responsable</Th>
              <Th className={READABLE_CASES_TABLE_SAMPLE ? 'w-[145px] min-w-[145px] text-right' : 'w-[170px] min-w-[170px] text-right'}>Acciones</Th>
            </tr>
          </thead>

          {/* ── TBODY ─────────────────────────────────────────────────── */}
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={READABLE_CASES_TABLE_SAMPLE ? 9 : 8} className="px-5 py-16 text-center text-sm text-gray-400">
                  No hay casos que mostrar
                </td>
              </tr>
            ) : paginated.map((c, idx) => {
              const clienteNombre  = c.society_id ? getClientName(c.client_id) || getSocietyName(c.society_id) : getClientName(c.client_id);
              const sociedadNombre = getSocietyName(c.society_id);
              const servicioNombre = getServiceItemName(c.service_item_id);
              const responsable    = getUsuarioName(c.usuario_asignado_id) || c.responsable;
              const observacionesText = c.notas || c.observaciones || '';
              const observacionesCount = countObservaciones(observacionesText);
              const commentCount   = c.comments?.length ?? 0;
              const invoiceCount   = allInvoices.filter(i => i.case_id === c.id).length;
              const rowBg          = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40';

              return (
                <tr
                  key={c.id}
                  className={cn('group cursor-pointer transition-colors duration-100 hover:bg-blue-50/30', rowBg)}
                  onClick={() => onEditCase(c)}
                >

                  {/* ── Caso ─────────────────────────────────────── */}
                  <td className={cn(tdBase, 'whitespace-nowrap font-mono font-bold text-sky-600', READABLE_CASES_TABLE_SAMPLE ? 'text-[11px]' : 'text-xs')}>
                    <span className="block truncate">{formatNTarea(c.n_tarea) || c.numero_caso}</span>
                  </td>

                  {/* ── Cliente ──────────────────────────────────── */}
                  <td className={tdBase}>
                    <span className={cn('block font-semibold leading-snug text-gray-800', READABLE_CASES_TABLE_SAMPLE ? 'line-clamp-2 text-xs' : 'truncate text-sm')} title={clienteNombre}>
                      {clienteNombre || '—'}
                    </span>
                    {c.cliente_temporal && (
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-amber-500">Temporal</span>
                    )}
                  </td>

                  {/* ── Sociedad ─────────────────────────────────── */}
                  <td className={tdBase}>
                    <span className={cn('block text-xs leading-snug text-gray-500', READABLE_CASES_TABLE_SAMPLE ? 'line-clamp-2' : 'truncate')} title={sociedadNombre}>
                      {sociedadNombre || '—'}
                    </span>
                  </td>

                  {/* ── Creado Por ───────────────────────────────── */}
                  <td className={tdBase}>
                    <span className={cn('block text-xs leading-snug text-gray-500', READABLE_CASES_TABLE_SAMPLE ? 'line-clamp-2' : 'truncate')} title={c.creado_por}>
                      {c.creado_por || '—'}
                    </span>
                  </td>

                  {/* ── Servicio ─────────────────────────────────── */}
                  <td className={tdBase}>
                    <span
                      className={cn(
                        'line-clamp-2 leading-snug text-gray-700',
                        READABLE_CASES_TABLE_SAMPLE ? 'max-w-[210px] text-xs' : 'max-w-[260px] text-sm',
                      )}
                      title={servicioNombre || c.descripcion}
                    >
                      {READABLE_CASES_TABLE_SAMPLE ? (servicioNombre || '—') : (servicioNombre || c.descripcion || '—')}
                    </span>
                  </td>

                  {READABLE_CASES_TABLE_SAMPLE && (
                    <td className={tdBase}>
                      <span
                        className="line-clamp-2 max-w-[240px] text-xs leading-snug text-gray-500"
                        title={c.descripcion}
                      >
                        {c.descripcion || '—'}
                      </span>
                    </td>
                  )}

                  {/* ── Estado ───────────────────────────────────── */}
                  <td className={cn(tdBase, 'whitespace-nowrap')}>
                    <span className={cn(
                      'inline-flex max-w-full items-center rounded-full font-semibold',
                      READABLE_CASES_TABLE_SAMPLE ? 'px-3 py-1 text-[11px]' : 'px-2.5 py-1 text-[10px]',
                      estadoBadge[c.estado] ?? 'bg-gray-100 text-gray-400',
                    )}>
                      <span className="truncate">{c.estado}</span>
                    </span>
                  </td>

                  {/* ── Responsable ──────────────────────────────── */}
                  <td className={tdBase}>
                    <span className={cn('block text-xs leading-snug text-gray-500', READABLE_CASES_TABLE_SAMPLE ? 'line-clamp-2' : 'truncate')} title={responsable}>
                      {responsable || '—'}
                    </span>
                  </td>

                  {/* ── Acciones ─────────────────────────────────── */}
                  <td className={cn(tdBase, READABLE_CASES_TABLE_SAMPLE ? 'w-[145px]' : 'w-[170px]')} onClick={e => e.stopPropagation()}>
                    <div className={cn('flex items-center justify-end', READABLE_CASES_TABLE_SAMPLE ? 'gap-0.5' : 'gap-0.5')}>
                      <button
                        onClick={() => setObservacionesModal({
                          caseLabel: formatNTarea(c.n_tarea) || c.numero_caso,
                          items: observacionesToArray(observacionesText),
                        })}
                        title="Ver observaciones"
                        className={cn(
                          'relative inline-flex items-center justify-center rounded-lg text-xs transition-all duration-100',
                          READABLE_CASES_TABLE_SAMPLE ? 'h-[26px] w-[26px]' : 'h-7 w-7',
                          observacionesCount > 0
                            ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-200 hover:bg-orange-100'
                            : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-600',
                        )}
                      >
                        <span aria-hidden="true">📝</span>
                        {observacionesCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-orange-500 px-0.5 text-[8px] font-bold leading-none text-white">
                            {observacionesCount > 9 ? '9+' : observacionesCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => onOpenComments(c)}
                        title="Ver comentarios"
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-lg font-semibold transition-all duration-100',
                          READABLE_CASES_TABLE_SAMPLE ? 'h-[26px] px-1 text-[9px]' : 'h-7 px-1.5 text-[10px]',
                          commentCount > 0
                            ? 'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-100'
                            : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-600',
                        )}
                      >
                        <MessageSquare className={READABLE_CASES_TABLE_SAMPLE ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] leading-none text-violet-600 ring-1 ring-violet-100">{commentCount}</span>
                      </button>
                      <button
                        onClick={() => onOpenExpenses(c)}
                        title="Gastos"
                        className={cn(
                          'inline-flex items-center justify-center rounded-lg text-gray-300 transition-all duration-100 hover:bg-emerald-50 hover:text-emerald-500',
                          READABLE_CASES_TABLE_SAMPLE ? 'h-[26px] w-[26px]' : 'h-7 w-7',
                        )}
                      >
                        <DollarSign className={READABLE_CASES_TABLE_SAMPLE ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                      </button>
                      <button
                        onClick={() => onOpenInvoice(c)}
                        title="Facturas"
                        className={cn(
                          'relative inline-flex items-center justify-center rounded-lg text-gray-300 transition-all duration-100 hover:bg-sky-50 hover:text-sky-500',
                          READABLE_CASES_TABLE_SAMPLE ? 'h-[26px] w-[26px]' : 'h-7 w-7',
                        )}
                      >
                        <FileText className={READABLE_CASES_TABLE_SAMPLE ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                        {invoiceCount > 0 && (
                          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-0.5 text-[8px] font-bold leading-none text-white">
                            {invoiceCount > 9 ? '9+' : invoiceCount}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteCase(c.id)}
                        title="Eliminar"
                        className={cn(
                          'inline-flex items-center justify-center rounded-lg text-gray-200 transition-all duration-100 hover:bg-red-50 hover:text-red-400',
                          READABLE_CASES_TABLE_SAMPLE ? 'h-[26px] w-[26px]' : 'h-7 w-7',
                        )}
                      >
                        <Trash2 className={READABLE_CASES_TABLE_SAMPLE ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
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

      <Dialog open={!!observacionesModal} onOpenChange={(open) => { if (!open) setObservacionesModal(null); }}>
        <DialogContent className="sm:max-w-[520px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-800">
              Observaciones del caso {observacionesModal?.caseLabel ?? ''}
            </DialogTitle>
            <DialogDescription>
              Detalles registrados para este caso.
            </DialogDescription>
          </DialogHeader>

          {observacionesModal && observacionesModal.items.length > 0 ? (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {observacionesModal.items.map((item, index) => (
                <div key={`${index}-${item.slice(0, 20)}`} className="rounded-xl border border-orange-100 bg-orange-50/50 px-4 py-3">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-orange-400">
                    Observación {index + 1}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{item}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
              No hay observaciones registradas para este caso.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
