import { useState, useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { KPICards } from '@/components/cases/KPICards';
import { CasesTable } from '@/components/cases/CasesTable';
import { NewCaseModal } from '@/components/cases/NewCaseModal';
import { EditCaseModal } from '@/components/cases/EditCaseModal';
import { CommentsDrawer } from '@/components/cases/CommentsDrawer';
import { ExpensesModal } from '@/components/cases/ExpensesModal';
import { InvoiceModal } from '@/components/cases/InvoiceModal';
import { FiltersModal } from '@/components/cases/FiltersModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Case } from '@/data/mockData';
import { Plus, Filter, Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export default function CasesPage() {
  const { cases, addCase, removeCase, getClientName, getSocietyName } = useApp();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [showNewCase, setShowNewCase] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editCase, setEditCase] = useState<Case | null>(null);
  const [commentsCase, setCommentsCase] = useState<Case | null>(null);
  const [expensesCase, setExpensesCase] = useState<Case | null>(null);
  const [invoiceCase, setInvoiceCase] = useState<Case | null>(null);

  const filtered = useMemo(() => {
    let result = cases;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(c =>
        c.numero_caso.includes(s) ||
        getClientName(c.client_id).toLowerCase().includes(s) ||
        getSocietyName(c.society_id).toLowerCase().includes(s) ||
        c.responsable.toLowerCase().includes(s) ||
        c.creado_por.toLowerCase().includes(s)
      );
    }
    if (filters.numero_caso) result = result.filter(c => c.numero_caso.includes(filters.numero_caso));
    if (filters.estado) result = result.filter(c => c.estado === filters.estado);
    if (filters.prioridad_urgente) result = result.filter(c => c.prioridad_urgente);
    if (filters.con_comentarios) result = result.filter(c => c.comments.length > 0);
    if (filters.con_gastos) result = result.filter(c => c.expenses.length > 0);
    if (filters.fecha_desde) result = result.filter(c => c.fecha_caso >= filters.fecha_desde);
    if (filters.fecha_hasta) result = result.filter(c => c.fecha_caso <= filters.fecha_hasta);
    return result;
  }, [cases, search, filters]);

  const kpi = useMemo(() => ({
    total: cases.length,
    pending: cases.filter(c => c.estado === 'Pendiente').length,
    completed: cases.filter(c => c.estado === 'Completado/Facturado').length,
    urgent: cases.filter(c => c.prioridad_urgente).length,
  }), [cases]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este caso?')) return;
    const ok = await removeCase(id);
    if (ok) toast.success('Caso eliminado');
  };

  const currentCommentsCase = commentsCase ? cases.find(c => c.id === commentsCase.id) || null : null;
  const currentExpensesCase = expensesCase ? cases.find(c => c.id === expensesCase.id) || null : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">CASOS</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64 bg-card" />
          </div>
          <Button variant="outline" className="gap-1" onClick={() => toast.info('Módulo de Mantenimiento → Clientes')}>
            <UserPlus className="h-4 w-4" /> Nuevo Cliente/Sociedad
          </Button>
        </div>
      </div>

      <KPICards totalCases={kpi.total} pending={kpi.pending} completed={kpi.completed} urgent={kpi.urgent} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Seguimiento de casos</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(true)} className="gap-1">
            <Filter className="h-4 w-4" /> Filtro
          </Button>
          <Button onClick={() => setShowNewCase(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Nuevo Caso
          </Button>
        </div>
      </div>

      <CasesTable
        cases={filtered}
        onOpenComments={c => setCommentsCase(c)}
        onOpenExpenses={c => setExpensesCase(c)}
        onOpenInvoice={c => setInvoiceCase(c)}
        onEditCase={c => setEditCase(c)}
        onDeleteCase={handleDelete}
      />

      <NewCaseModal open={showNewCase} onClose={() => setShowNewCase(false)} onCreated={addCase} />
      <EditCaseModal caseData={editCase} open={!!editCase} onClose={() => setEditCase(null)} />
      <CommentsDrawer caseData={currentCommentsCase} open={!!commentsCase} onClose={() => setCommentsCase(null)} />
      <ExpensesModal caseData={currentExpensesCase} open={!!expensesCase} onClose={() => setExpensesCase(null)} />
      <InvoiceModal caseData={invoiceCase} open={!!invoiceCase} onClose={() => setInvoiceCase(null)} />
      <FiltersModal open={showFilters} onClose={() => setShowFilters(false)} onApply={setFilters} />
    </div>
  );
}
