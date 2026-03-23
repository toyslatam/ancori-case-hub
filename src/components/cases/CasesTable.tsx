import { useState } from 'react';
import { Case } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, DollarSign, FileText, Trash2, ArrowUpDown } from 'lucide-react';

interface CasesTableProps {
  cases: Case[];
  onOpenComments: (c: Case) => void;
  onOpenExpenses: (c: Case) => void;
  onOpenInvoice: (c: Case) => void;
  onEditCase: (c: Case) => void;
  onDeleteCase: (id: string) => void;
}

export function CasesTable({ cases, onOpenComments, onOpenExpenses, onOpenInvoice, onEditCase, onDeleteCase }: CasesTableProps) {
  const { getClientName, getSocietyName, getServiceName } = useApp();
  const [sortField, setSortField] = useState<string>('numero_caso');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const perPage = 10;

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sorted = [...cases].sort((a, b) => {
    const av = (a as any)[sortField] || '';
    const bv = (b as any)[sortField] || '';
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const paginated = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(cases.length / perPage);

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">{children} <ArrowUpDown className="h-3 w-3" /></span>
    </th>
  );

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground">Seguimiento de casos</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <SortHeader field="numero_caso">Caso</SortHeader>
              <SortHeader field="client_id">Cliente</SortHeader>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Sociedad</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Creado Por</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Servicio</th>
              <SortHeader field="estado">Estado</SortHeader>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Responsable</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Observaciones</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Comentarios</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Gastos</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase">Facturas</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground uppercase"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map(c => (
              <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onEditCase(c)}>
                <td className="px-3 py-3 font-medium">{c.numero_caso}</td>
                <td className="px-3 py-3">{getClientName(c.client_id)}</td>
                <td className="px-3 py-3">{getSocietyName(c.society_id)}</td>
                <td className="px-3 py-3">{c.creado_por}</td>
                <td className="px-3 py-3 max-w-[200px] truncate">{getServiceName(c.service_id)}</td>
                <td className="px-3 py-3">
                  <Badge variant={c.estado === 'Pendiente' ? 'pending' : c.estado === 'Completado/Facturado' ? 'success' : 'secondary'}>
                    {c.estado}
                  </Badge>
                </td>
                <td className="px-3 py-3">{c.responsable}</td>
                <td className="px-3 py-3 max-w-[180px] truncate text-muted-foreground">{c.observaciones}</td>
                <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); onOpenComments(c); }}>
                  <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-primary">
                    <MessageSquare className="h-4 w-4" />
                    {c.comments.length > 0 && <span className="text-xs">Ver {c.comments.length}</span>}
                  </Button>
                </td>
                <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); onOpenExpenses(c); }}>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                    <DollarSign className="h-4 w-4" />
                  </Button>
                </td>
                <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); onOpenInvoice(c); }}>
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                    <FileText className="h-4 w-4" />
                  </Button>
                </td>
                <td className="px-3 py-3 text-center" onClick={e => { e.stopPropagation(); onDeleteCase(c.id); }}>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border">
          <span className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}
