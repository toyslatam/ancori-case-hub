import { useState } from 'react';
import { Loader2, Maximize2, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PBIReportRow } from '@/lib/pbiReportsDb';

interface PowerBIAreaPanelProps {
  areaLabel: string;
  reports: PBIReportRow[];
}

function PowerBIFrame({ embedUrl, title }: { embedUrl: string; title: string }) {
  const [loading, setLoading] = useState(true);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border bg-white shadow-sm">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      )}
      <iframe
        title={title}
        src={embedUrl}
        style={{ width: '100%', height: '600px', border: 'none' }}
        allowFullScreen
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}

export function PowerBIAreaPanel({ areaLabel, reports }: PowerBIAreaPanelProps) {
  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <div className="rounded-full bg-muted p-5">
          <BarChart2 className="h-8 w-8 text-orange-400" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-base font-semibold text-foreground">Sin reportes configurados</p>
          <p className="text-sm max-w-sm">
            Usa el botón <strong>Configurar reportes</strong> para agregar informes de Power BI
            al área <strong>{areaLabel}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {reports.map(report => (
        <div key={report.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{report.title}</h3>
              {report.description && (
                <p className="text-xs text-muted-foreground">{report.description}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-7"
              onClick={() => window.open(report.embed_url, '_blank', 'noopener')}
            >
              <Maximize2 className="h-3 w-3" />
              Abrir en Power BI
            </Button>
          </div>
          <PowerBIFrame embedUrl={report.embed_url} title={report.title} />
        </div>
      ))}
    </div>
  );
}
