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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Case, CASE_ESTADOS, CASE_PRIORIDADES } from '@/data/mockData';
import { Plus, Filter, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Muestra reversible: ampliar un poco el lienzo de Casos sin tocar el layout global.
const WIDE_CASES_LAYOUT_SAMPLE = true;

export default function CasesPage() {
  const { cases, addCase, removeCase, clients, societies, usuarios, getClientName, getSocietyName } = useApp();
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('__all__');
  const [filterPrioridad, setFilterPrioridad] = useState('__all__');
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
        (c.numero_caso ?? '').toLowerCase().includes(s) ||
        c.descripcion.toLowerCase().includes(s) ||
        getClientName(c.client_id).toLowerCase().includes(s) ||
        getSocietyName(c.society_id).toLowerCase().includes(s) ||
        c.responsable.toLowerCase().includes(s) ||
        c.creado_por.toLowerCase().includes(s)
      );
    }
    if (filterEstado && filterEstado !== '__all__') result = result.filter(c => c.estado === filterEstado);
    if (filterPrioridad && filterPrioridad !== '__all__') result = result.filter(c => c.prioridad === filterPrioridad);
    if (filters.estado) result = result.filter(c => c.estado === filters.estado);
    if (filters.numero_caso?.trim()) {
      const q = String(filters.numero_caso).trim().toLowerCase();
      result = result.filter(c =>
        (c.numero_caso ?? '').toLowerCase().includes(q) ||
        String(c.n_tarea ?? '').padStart(7, '0').includes(q.replace(/^0+/, '').padStart(7, '0')) ||
        String(c.n_tarea ?? '').includes(q.replace(/^0+/, ''))
      );
    }
    if (filters.responsable_id) result = result.filter(c => c.usuario_asignado_id === filters.responsable_id);
    if (filters.client_id) result = result.filter(c => c.client_id === filters.client_id);
    if (filters.society_id) result = result.filter(c => c.society_id === filters.society_id);
    if (filters.prioridad_urgente) result = result.filter(c => c.prioridad === 'Urgente');
    if (filters.fecha_desde) result = result.filter(c => c.fecha_caso >= filters.fecha_desde);
    if (filters.fecha_hasta) result = result.filter(c => c.fecha_caso <= filters.fecha_hasta);
    if (filters.con_comentarios) result = result.filter(c => (c.comments?.length ?? 0) > 0);
    if (filters.con_gastos) result = result.filter(c => (c.expenses?.length ?? 0) > 0);
    return result;
  }, [cases, search, filterEstado, filterPrioridad, filters, getClientName, getSocietyName]);

  const responsableOptions = useMemo(
    () => usuarios
      .filter(u => u.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(u => ({ value: u.id, label: u.nombre, sublabel: u.rol || u.puesto || undefined })),
    [usuarios],
  );
  const clientOptions = useMemo(
    () => clients
      .filter(c => c.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => ({ value: c.id, label: c.nombre, sublabel: c.razon_social || undefined })),
    [clients],
  );
  const societyOptions = useMemo(
    () => societies
      .filter(s => s.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(s => ({ value: s.id, label: s.nombre, sublabel: getClientName(s.client_id) || undefined })),
    [societies, getClientName],
  );

  const kpi = useMemo(() => ({
    total: cases.length,
    pending: cases.filter(c => c.estado === 'Pendiente').length,
    completed: cases.filter(c => c.estado === 'Completado/Facturado').length,
    urgent: cases.filter(c => c.prioridad === 'Urgente' || c.prioridad_urgente).length,
  }), [cases]);

  const advancedFilterCount = useMemo(() => {
    return Object.values(filters).filter(v => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v.trim().length > 0;
      return v != null;
    }).length;
  }, [filters]);
  const quickFilterCount =
    (filterEstado && filterEstado !== '__all__' ? 1 : 0) +
    (filterPrioridad && filterPrioridad !== '__all__' ? 1 : 0);
  const activeFilterCount = quickFilterCount + advancedFilterCount;
  const hasActiveFilters = activeFilterCount > 0;

  const clearFilters = () => {
    setFilterEstado('__all__');
    setFilterPrioridad('__all__');
    setFilters({});
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este caso?')) return;
    const ok = await removeCase(id);
    if (ok) toast.success('Caso eliminado');
  };

  const currentCommentsCase = commentsCase ? cases.find(c => c.id === commentsCase.id) || null : null;
  const currentExpensesCase = expensesCase ? cases.find(c => c.id === expensesCase.id) || null : null;
  const currentInvoiceCase = invoiceCase ? cases.find(c => c.id === invoiceCase.id) ?? invoiceCase : null;

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-5 p-4 md:p-5',
        WIDE_CASES_LAYOUT_SAMPLE && 'xl:-mx-4 2xl:-mx-8',
      )}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">CASOS</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descripción, cliente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64 bg-card"
            />
          </div>
          <Button onClick={() => setShowNewCase(true)} className="gap-1">
            <Plus className="h-4 w-4" /> Nuevo Caso
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <KPICards totalCases={kpi.total} pending={kpi.pending} completed={kpi.completed} urgent={kpi.urgent} />

      {/* Quick Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-44 bg-card">
              <SelectValue placeholder="Estado: todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los estados</SelectItem>
              {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filterPrioridad} onValueChange={setFilterPrioridad}>
            <SelectTrigger className="w-44 bg-card">
              <SelectValue placeholder="Prioridad: todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las prioridades</SelectItem>
              {CASE_PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            className={cn(
              'relative gap-1',
              advancedFilterCount > 0 && 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800',
            )}
            onClick={() => setShowFilters(true)}
          >
            <Filter className="h-4 w-4" /> Más Filtros
            {advancedFilterCount > 0 && (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[11px] font-bold text-white">
                {advancedFilterCount}
              </span>
            )}
          </Button>

          {hasActiveFilters && (
            <>
              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                {activeFilterCount} filtro{activeFilterCount !== 1 ? 's' : ''} activo{activeFilterCount !== 1 ? 's' : ''}
              </span>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="h-3 w-3" /> Limpiar
              </Button>
            </>
          )}
        </div>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} de {cases.length} caso{cases.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <CasesTable
        cases={filtered}
        onOpenComments={c => setCommentsCase(c)}
        onOpenExpenses={c => setExpensesCase(c)}
        onOpenInvoice={c => setInvoiceCase(c)}
        onEditCase={c => setEditCase(c)}
        onDeleteCase={handleDelete}
      />

      {/* Modals */}
      <NewCaseModal open={showNewCase} onClose={() => setShowNewCase(false)} onCreated={addCase} />
      <EditCaseModal
        caseData={editCase}
        open={!!editCase}
        onClose={() => setEditCase(null)}
        onOpenExpenses={() => { setExpensesCase(editCase); setEditCase(null); }}
        onOpenInvoice={() => { setInvoiceCase(editCase); setEditCase(null); }}
      />
      <CommentsDrawer caseData={currentCommentsCase} open={!!commentsCase} onClose={() => setCommentsCase(null)} />
      <ExpensesModal caseData={currentExpensesCase} open={!!expensesCase} onClose={() => setExpensesCase(null)} />
      <InvoiceModal
        key={invoiceCase?.id ?? 'closed'}
        caseData={currentInvoiceCase}
        open={!!invoiceCase}
        onClose={() => setInvoiceCase(null)}
      />
      <FiltersModal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        onApply={setFilters}
        responsableOptions={responsableOptions}
        clientOptions={clientOptions}
        societyOptions={societyOptions}
      />
    </div>
  );
}
