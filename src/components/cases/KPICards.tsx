import { Briefcase, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
}

// Muestra reversible: tarjetas KPI un poco más amplias para acompañar la tabla.
const SPACIOUS_KPI_CARDS_SAMPLE = true;

function KPICard({ title, value, icon }: KPICardProps) {
  return (
    <div className={`kpi-card relative z-10 min-w-[200px] rounded-xl text-kpi-foreground shadow-md ${SPACIOUS_KPI_CARDS_SAMPLE ? 'p-6 xl:min-w-[220px]' : 'p-5'}`}>
      <div className="flex items-center gap-2 mb-2 opacity-80">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

interface KPICardsProps {
  totalCases: number;
  pending: number;
  completed: number;
  urgent: number;
}

export function KPICards({ totalCases, pending, completed, urgent }: KPICardsProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 ${SPACIOUS_KPI_CARDS_SAMPLE ? 'gap-5' : 'gap-4'}`}>
      <KPICard title="Total N° Casos" value={totalCases} icon={<Briefcase className="h-5 w-5" />} />
      <KPICard title="N° Casos Pendientes" value={pending} icon={<Clock className="h-5 w-5" />} />
      <KPICard title="N° Casos Completados/Facturados" value={completed} icon={<CheckCircle className="h-5 w-5" />} />
      <KPICard title="N° Casos Prioridad Urgente" value={urgent} icon={<AlertTriangle className="h-5 w-5 text-kpi-accent" />} />
    </div>
  );
}
