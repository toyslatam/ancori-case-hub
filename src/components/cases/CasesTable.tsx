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

// ── Ancho de columnas fijas ────────────────────────────────────────────────
// Caso: 96px | Cliente: 176px (suma = 272px para el second sticky left)
const PIN_CASO_W    = 96;
const PIN_CLIENTE_W = 176;

export function CasesTable({
  cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase,
}: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceItemName, getUsuarioName } = useApp();
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
  const thBase = 'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap select-none bg-gray-50';

  const SortTh = ({
    field, children, style, className,
  }: { field: string; children: React.ReactNode; style?: React.CSSProperties; className?: string }) => (
    <th
      style={style}
      className={cn(thBase, 'cursor-pointer hover:text-gray-600 transition-colors', className)}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn('h-2.5 w-2.5 transition-opacity', sortField === field ? 'opacity-100 text-gray-500' : 'opacity-30')} />
      </span>
    </th>
  );

  const Th = ({ children, style, className }: { children?: React.ReactNode; style?: React.CSSProperties; className?: string }) => (
    <th style={style} className={cn(thBase, className)}>{children}</th>
  );

  return (
    <div className="w-full min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* ── Título de la tabla ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">Seguimiento de casos</h2>
        <span className="text-xs text-gray-400">{cases.length} caso{cases.length !== 1 ? 's' : ''}</span>
      </div>

      {/*
        ── Contenedor de scroll horizontal ───────────────────────────────
        overflow-x-auto: scroll cuando la tabla es más ancha que el contenedor
        Scrollbar estilizada para que sea discreta
      */}
      <div
        className={cn(
          'overflow-x-auto',
          // scrollbar discreta estilo Linear/Stripe
          '[&::-webkit-scrollbar]:h-1',
          '[&::-webkit-scrollbar-track]:bg-transparent',
          '[&::-webkit-scrollbar-thumb]:bg-gray-200',
          '[&::-webkit-scrollbar-thumb:hover]:bg-gray-300',
        )}
      >
        {/*
          La tabla tiene un min-width que garantiza que todas las columnas
          tengan espacio mínimo. El ancho real se adapta al contenedor.
        */}
        <table className="w-full border-collapse" style={{ minWidth: 1360 }}>

          {/* ── THEAD sticky ──────────────────────────────────────────── */}
          <thead>
            <tr className="border-b border-gray-100">

              {/* Caso — pinned left-0 */}
              <SortTh
                field="n_tarea"
                style={{ width: PIN_CASO_W, minWidth: PIN_CASO_W, position: 'sticky', left: 0, zIndex: 30 }}
                className="bg-gray-50 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-200"
              >
                Caso
              </SortTh>

              {/* Cliente — pinned left=PIN_CASO_W */}
              <Th
                style={{ width: PIN_CLIENTE_W, minWidth: PIN_CLIENTE_W, position: 'sticky', left: PIN_CASO_W, zIndex: 30 }}
                className="bg-gray-50 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-200"
              >
                Cliente
              </Th>

              {/* Columnas normales */}
              <Th style={{ minWidth: 160 }}>Sociedad</Th>
              <Th style={{ minWidth: 130 }}>Creado Por</Th>
              <Th style={{ minWidth: 240 }}>Servicio</Th>
              <SortTh field="estado" style={{ minWidth: 150 }}>Estado</SortTh>
              <Th style={{ minWidth: 130 }}>Responsable</Th>
              <Th style={{ minWidth: 200 }}>Observaciones</Th>
              <Th style={{ minWidth: 110 }} className="text-center">Comentarios</Th>
              <Th style={{ minWidth: 52 }} className="text-center">$</Th>
              <Th style={{ minWidth: 52 }} className="text-center">📄</Th>
              <Th style={{ minWidth: 44 }} />
            </tr>
          </thead>

          {/* ── TBODY ─────────────────────────────────────────────────── */}
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-5 py-16 text-center text-sm text-gray-400">
                  No hay casos que mostrar
                </td>
              </tr>
            ) : paginated.map((c, idx) => {
              const clienteNombre  = c.society_id ? getClientName(c.client_id) || getSocietyName(c.society_id) : getClientName(c.client_id);
              const sociedadNombre = getSocietyName(c.society_id);
              const servicioNombre = getServiceItemName(c.service_item_id);
              const responsable    = getUsuarioName(c.usuario_asignado_id) || c.responsable;
              const observaciones  = c.notas || c.observaciones || '';
              const commentCount   = c.comments?.length ?? 0;
              const rowBg          = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40';

              return (
                <tr
                  key={c.id}
                  className={cn('group cursor-pointer transition-colors duration-100 hover:bg-blue-50/30', rowBg)}
                  onClick={() => onEditCase(c)}
                >

                  {/* ── Caso (pinned) ───────────────────────────── */}
                  <td
                    style={{ position: 'sticky', left: 0, zIndex: 10 }}
                    className={cn(
                      'px-3 py-2.5 whitespace-nowrap font-mono text-xs font-bold text-sky-600',
                      rowBg,
                      'group-hover:bg-blue-50/30',
                      'after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-100',
                    )}
                  >
                    {formatNTarea(c.n_tarea) || c.numero_caso}
                  </td>

                  {/* ── Cliente (pinned) ────────────────────────── */}
                  <td
                    style={{ position: 'sticky', left: PIN_CASO_W, zIndex: 10, maxWidth: PIN_CLIENTE_W }}
                    className={cn(
                      'px-3 py-2.5',
                      rowBg,
                      'group-hover:bg-blue-50/30',
                      'after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-100',
                    )}
                  >
                    <span className="block truncate text-xs font-medium text-gray-800" title={clienteNombre}>
                      {clienteNombre || '—'}
                    </span>
                    {c.cliente_temporal && (
                      <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-wide">Temporal</span>
                    )}
                  </td>

                  {/* ── Sociedad ─────────────────────────────────── */}
                  <td className="px-3 py-2.5" style={{ maxWidth: 160 }}>
                    <span className="block truncate text-xs text-gray-600" title={sociedadNombre}>
                      {sociedadNombre || '—'}
                    </span>
                  </td>

                  {/* ── Creado Por ───────────────────────────────── */}
                  <td className="px-3 py-2.5" style={{ maxWidth: 130 }}>
                    <span className="block truncate text-xs text-gray-500" title={c.creado_por}>
                      {c.creado_por || '—'}
                    </span>
                  </td>

                  {/* ── Servicio ─────────────────────────────────── */}
                  <td className="px-3 py-2.5" style={{ maxWidth: 240 }}>
                    <span
                      className="block truncate text-xs text-gray-700 leading-snug"
                      title={servicioNombre || c.descripcion}
                    >
                      {servicioNombre || c.descripcion || '—'}
                    </span>
                  </td>

                  {/* ── Estado ───────────────────────────────────── */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      estadoBadge[c.estado] ?? 'bg-gray-100 text-gray-400',
                    )}>
                      {c.estado}
                    </span>
                  </td>

                  {/* ── Responsable ──────────────────────────────── */}
                  <td className="px-3 py-2.5" style={{ maxWidth: 130 }}>
                    <span className="block truncate text-xs text-gray-600" title={responsable}>
                      {responsable || '—'}
                    </span>
                  </td>

                  {/* ── Observaciones ────────────────────────────── */}
                  <td className="px-3 py-2.5" style={{ maxWidth: 200 }}>
                    <span className="block truncate text-xs text-gray-400" title={observaciones}>
                      {observaciones || '—'}
                    </span>
                  </td>

                  {/* ── Comentarios ──────────────────────────────── */}
                  <td className="px-2 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenComments(c)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all duration-100',
                        commentCount > 0
                          ? 'bg-violet-50 text-violet-600 ring-1 ring-violet-200 hover:bg-violet-100'
                          : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200 hover:bg-gray-100 hover:text-gray-600',
                      )}
                    >
                      <MessageSquare className="h-3 w-3" />
                      Ver
                      {commentCount > 0 && (
                        <span className="rounded-full bg-violet-500 text-white w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold leading-none">
                          {commentCount}
                        </span>
                      )}
                    </button>
                  </td>

                  {/* ── Gastos ───────────────────────────────────── */}
                  <td className="px-2 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenExpenses(c)}
                      title="Gastos"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-emerald-500 hover:bg-emerald-50 transition-all duration-100"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                    </button>
                  </td>

                  {/* ── Facturas ─────────────────────────────────── */}
                  <td className="px-2 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenInvoice(c)}
                      title="Facturas"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-gray-300 hover:text-sky-500 hover:bg-sky-50 transition-all duration-100"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                  </td>

                  {/* ── Eliminar ─────────────────────────────────── */}
                  <td className="px-2 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onDeleteCase(c.id)}
                      title="Eliminar"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition-all duration-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
