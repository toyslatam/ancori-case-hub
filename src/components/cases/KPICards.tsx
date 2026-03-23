import { Briefcase, Clock, CheckCircle, AlertTriangle } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
}

function KPICard({ title, value, icon }: KPICardProps) {
  return (
    <div className="kpi-card rounded-xl p-5 text-kpi-foreground relative z-10 shadow-md min-w-[200px]">
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPICard title="Total N° Casos" value={totalCases} icon={<Briefcase className="h-5 w-5" />} />
      <KPICard title="N° Casos Pendientes" value={pending} icon={<Clock className="h-5 w-5" />} />
      <KPICard title="N° Casos Completados/Facturados" value={completed} icon={<CheckCircle className="h-5 w-5" />} />
      <KPICard title="N° Casos Prioridad Urgente" value={urgent} icon={<AlertTriangle className="h-5 w-5 text-kpi-accent" />} />
    </div>
  );
}
