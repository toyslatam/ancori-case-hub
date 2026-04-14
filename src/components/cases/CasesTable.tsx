import { useState } from 'react';
import { Case, formatNTarea } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { Button } from '@/components/ui/button';
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

const estadoBadge: Record<string, string> = {
  'Pendiente':             'bg-yellow-50 text-yellow-700 border border-yellow-300',
  'En Curso':              'bg-blue-50 text-blue-700 border border-blue-300',
  'Completado/Facturado':  'bg-green-50 text-green-700 border border-green-300',
  'Cancelado':             'bg-gray-100 text-gray-500 border border-gray-200',
};

export function CasesTable({ cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase }: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceItemName, getUsuarioName } = useApp();
  const [sortField, setSortField] = useState<string>('n_tarea');
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('desc');
  const [page, setPage]         = useState(0);
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

  const SortTh = ({ field, children, className }: { field: string; children: React.ReactNode; className?: string }) => (
    <th
      className={cn('px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap', className)}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">{children}<ArrowUpDown className="h-3 w-3 opacity-40" /></span>
    </th>
  );

  const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap', className)}>
      {children}
    </th>
  );

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Seguimiento de casos</h2>
        <span className="text-xs text-muted-foreground">{cases.length} caso{cases.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <SortTh field="n_tarea"   className="w-24">Caso</SortTh>
              <Th>Cliente</Th>
              <Th>Sociedad</Th>
              <Th>Creado Por</Th>
              <Th>Servicio</Th>
              <SortTh field="estado">Estado</SortTh>
              <Th>Responsable</Th>
              <Th>Observaciones</Th>
              <Th className="text-center">Comentarios</Th>
              <Th className="text-center">Gastos</Th>
              <Th className="text-center">Facturas</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-5 py-12 text-center text-muted-foreground text-sm">
                  No hay casos que mostrar
                </td>
              </tr>
            ) : paginated.map(c => {
              const clienteNombre   = c.society_id ? getClientName(c.client_id) || getSocietyName(c.society_id) : getClientName(c.client_id);
              const sociedadNombre  = getSocietyName(c.society_id);
              const servicioNombre  = getServiceItemName(c.service_item_id);
              const responsable     = getUsuarioName(c.usuario_asignado_id) || c.responsable;
              const observaciones   = c.notas || c.observaciones || '';
              const commentCount    = c.comments?.length ?? 0;

              return (
                <tr
                  key={c.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => onEditCase(c)}
                >
                  {/* Caso */}
                  <td className="px-3 py-3 font-mono text-xs font-bold text-primary whitespace-nowrap">
                    {formatNTarea(c.n_tarea) || c.numero_caso}
                  </td>

                  {/* Cliente */}
                  <td className="px-3 py-3 max-w-[150px]">
                    <span className="truncate block text-xs font-medium" title={clienteNombre}>{clienteNombre || '—'}</span>
                    {c.cliente_temporal && <span className="text-[10px] text-amber-600 font-semibold">Temporal</span>}
                  </td>

                  {/* Sociedad */}
                  <td className="px-3 py-3 max-w-[160px]">
                    <span className="truncate block text-xs" title={sociedadNombre}>{sociedadNombre || '—'}</span>
                  </td>

                  {/* Creado Por */}
                  <td className="px-3 py-3 max-w-[120px]">
                    <span className="truncate block text-xs" title={c.creado_por}>{c.creado_por || '—'}</span>
                  </td>

                  {/* Servicio */}
                  <td className="px-3 py-3 max-w-[220px]">
                    <span className="truncate block text-xs leading-snug" title={servicioNombre || c.descripcion}>
                      {servicioNombre || c.descripcion || '—'}
                    </span>
                  </td>

                  {/* Estado */}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', estadoBadge[c.estado] ?? 'bg-gray-100 text-gray-500')}>
                      {c.estado}
                    </span>
                  </td>

                  {/* Responsable */}
                  <td className="px-3 py-3 max-w-[130px]">
                    <span className="truncate block text-xs" title={responsable}>{responsable || '—'}</span>
                  </td>

                  {/* Observaciones */}
                  <td className="px-3 py-3 max-w-[200px]">
                    <span className="truncate block text-xs text-muted-foreground" title={observaciones}>{observaciones || '—'}</span>
                  </td>

                  {/* Comentarios */}
                  <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onOpenComments(c)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-border"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Ver
                      {commentCount > 0 && (
                        <span className="bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold leading-none">
                          {commentCount}
                        </span>
                      )}
                    </button>
                  </td>

                  {/* Gastos */}
                  <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                      title="Gastos"
                      onClick={() => onOpenExpenses(c)}
                    >
                      <DollarSign className="h-4 w-4" />
                    </Button>
                  </td>

                  {/* Facturas */}
                  <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                      title="Facturas"
                      onClick={() => onOpenInvoice(c)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  </td>

                  {/* Eliminar */}
                  <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Eliminar"
                      onClick={() => onDeleteCase(c.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages} &nbsp;·&nbsp; {cases.length} casos
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
