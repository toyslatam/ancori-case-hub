import { useState } from 'react';
import { Case, formatNTarea } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, DollarSign, FileText, Pencil, Trash2, ArrowUpDown, Mail, RefreshCw } from 'lucide-react';
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
  'Pendiente': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'En Curso': 'bg-blue-100 text-blue-800 border-blue-200',
  'Completado/Facturado': 'bg-green-100 text-green-800 border-green-200',
  'Cancelado': 'bg-gray-100 text-gray-600 border-gray-200',
};

const prioridadBadge: Record<string, string> = {
  'Baja': 'bg-slate-100 text-slate-600 border-slate-200',
  'Media': 'bg-amber-100 text-amber-700 border-amber-200',
  'Urgente': 'bg-red-100 text-red-700 border-red-200',
};

export function CasesTable({ cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase }: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceItemName, getEtapaName, getUsuarioName } = useApp();
  const [sortField, setSortField] = useState<string>('n_tarea');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const perPage = 15;

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

  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(cases.length / perPage);

  const SortHeader = ({ field, children, className }: { field: string; children: React.ReactNode; className?: string }) => (
    <th
      className={cn(
        'px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground whitespace-nowrap',
        className,
      )}
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">{children}<ArrowUpDown className="h-3 w-3 opacity-50" /></span>
    </th>
  );

  const Th = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <th className={cn('px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap', className)}>
      {children}
    </th>
  );

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Seguimiento de Casos</h2>
        <span className="text-xs text-muted-foreground">{cases.length} caso{cases.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <SortHeader field="n_tarea" className="w-24">N° Tarea</SortHeader>
              <SortHeader field="descripcion">Descripción</SortHeader>
              <Th>Ítem Servicio</Th>
              <SortHeader field="estado">Estado</SortHeader>
              <Th>Sociedad</Th>
              <Th>Etapa</Th>
              <Th>Asignado</Th>
              <Th>Cliente</Th>
              <SortHeader field="prioridad">Prioridad</SortHeader>
              <SortHeader field="fecha_vencimiento">Vencimiento</SortHeader>
              <Th>Gastos</Th>
              <Th>Flags</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-5 py-10 text-center text-muted-foreground">
                  No hay casos que mostrar
                </td>
              </tr>
            ) : paginated.map(c => {
              const itemNombre = getServiceItemName(c.service_item_id);
              const etapaNombre = getEtapaName(c.etapa_id);
              const usuarioNombre = getUsuarioName(c.usuario_asignado_id);
              const clienteNombre = c.society_id
                ? getSocietyName(c.society_id)
                : getClientName(c.client_id);

              return (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onEditCase(c)}
                >
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-primary whitespace-nowrap">
                    {formatNTarea(c.n_tarea) || c.numero_caso}
                  </td>
                  <td className="px-3 py-3 max-w-[200px]">
                    <p className="truncate text-sm font-medium" title={c.descripcion}>{c.descripcion || '—'}</p>
                    {c.notas && <p className="truncate text-xs text-muted-foreground mt-0.5" title={c.notas}>{c.notas}</p>}
                  </td>
                  <td className="px-3 py-3 max-w-[160px]">
                    <span className="truncate block text-xs" title={itemNombre}>{itemNombre || '—'}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', estadoBadge[c.estado] ?? 'bg-gray-100 text-gray-600')}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-[150px]">
                    <span className="truncate block text-xs" title={getSocietyName(c.society_id)}>{getSocietyName(c.society_id) || '—'}</span>
                  </td>
                  <td className="px-3 py-3 max-w-[140px]">
                    <span className="truncate block text-xs" title={etapaNombre}>{etapaNombre || c.etapa || '—'}</span>
                  </td>
                  <td className="px-3 py-3 max-w-[130px]">
                    <span className="truncate block text-xs" title={usuarioNombre}>{usuarioNombre || c.responsable || '—'}</span>
                  </td>
                  <td className="px-3 py-3 max-w-[150px]">
                    <span className="truncate block text-xs" title={clienteNombre}>{clienteNombre || '—'}</span>
                    {c.cliente_temporal && <span className="text-[10px] text-amber-600 font-medium">Temporal</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {c.prioridad ? (
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', prioridadBadge[c.prioridad] ?? '')}>
                        {c.prioridad}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {c.fecha_vencimiento ?? '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-right">
                    {c.gastos_cliente != null ? (
                      <span className="font-medium">${c.gastos_cliente.toLocaleString()}</span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {c.recurrencia && (
                        <span title="Recurrente"><RefreshCw className="h-3.5 w-3.5 text-blue-500" /></span>
                      )}
                      {c.envio_correo && (
                        <span title="Correo enviado"><Mail className="h-3.5 w-3.5 text-green-500" /></span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Comentarios"
                        onClick={() => onOpenComments(c)}
                      >
                        <MessageSquare className="h-4 w-4" />
                        {c.comments.length > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full w-3.5 h-3.5 flex items-center justify-center">
                            {c.comments.length}
                          </span>
                        )}
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Gastos"
                        onClick={() => onOpenExpenses(c)}
                      >
                        <DollarSign className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Factura"
                        onClick={() => onOpenInvoice(c)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Editar"
                        onClick={() => onEditCase(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Eliminar"
                        onClick={() => onDeleteCase(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
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
