import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Pencil, Trash2, Loader2, ExternalLink, BarChart2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchAllPBIReports, savePBIReport, deletePBIReport,
  PBI_AREA_LABELS, type PBIReportRow,
} from '@/lib/pbiReportsDb';

const EMPTY_FORM = (): Partial<PBIReportRow> => ({
  area: 'contabilidad',
  title: '',
  embed_url: '',
  description: '',
  sort_order: 0,
  active: true,
});

interface PBIReportsManagerProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PBIReportsManager({ open, onClose, onSaved }: PBIReportsManagerProps) {
  const [reports, setReports]   = useState<PBIReportRow[]>([]);
  const [loading, setLoading]   = useState(false);
  const [form, setForm]         = useState<Partial<PBIReportRow>>(EMPTY_FORM());
  const [editing, setEditing]   = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    setLoading(true);
    setReports(await fetchAllPBIReports());
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  function openNew() {
    setForm(EMPTY_FORM());
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(r: PBIReportRow) {
    setForm({ ...r });
    setEditing(r.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.title?.trim()) { toast.error('El nombre es obligatorio'); return; }
    if (!form.embed_url?.trim()) { toast.error('La URL de embed es obligatoria'); return; }
    if (!form.area) { toast.error('Selecciona un área'); return; }
    setSaving(true);
    const ok = await savePBIReport({
      id: editing ?? undefined,
      area: form.area!,
      title: form.title!.trim(),
      embed_url: form.embed_url!.trim(),
      description: form.description?.trim() || null,
      sort_order: form.sort_order ?? 0,
      active: form.active ?? true,
    });
    setSaving(false);
    if (!ok) { toast.error('No se pudo guardar'); return; }
    toast.success(editing ? 'Reporte actualizado' : 'Reporte agregado');
    setShowForm(false);
    onSaved();
    await load();
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const ok = await deletePBIReport(id);
    setDeleting(null);
    if (!ok) { toast.error('No se pudo eliminar'); return; }
    toast.success('Reporte eliminado');
    onSaved();
    setReports(r => r.filter(x => x.id !== id));
  }

  const areaGroups = Object.keys(PBI_AREA_LABELS).map(area => ({
    area,
    label: PBI_AREA_LABELS[area],
    items: reports.filter(r => r.area === area),
  }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold">Configurar reportes Power BI</DialogTitle>
            <Button size="sm" className="gap-1.5 h-8" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Agregar reporte
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {areaGroups.map(group => (
                <div key={group.area} className="px-6 py-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Sin reportes — haz clic en "Agregar reporte"</p>
                  ) : (
                    <ul className="space-y-1">
                      {group.items.map(r => (
                        <li key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 bg-background">
                          <BarChart2 className={`h-4 w-4 flex-shrink-0 ${r.active ? 'text-orange-500' : 'text-muted-foreground'}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${!r.active ? 'text-muted-foreground line-through' : ''}`}>
                              {r.title}
                            </p>
                            {r.description && (
                              <p className="text-xs text-muted-foreground truncate">{r.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => window.open(r.embed_url, '_blank', 'noopener')}
                              title="Previsualizar">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon"
                              className="h-7 w-7 text-destructive hover:bg-red-50"
                              disabled={deleting === r.id}
                              onClick={() => void handleDelete(r.id)}>
                              {deleting === r.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sub-formulario inline */}
        {showForm && (
          <div className="border-t border-border bg-muted/30 px-6 py-4 space-y-4">
            <p className="text-sm font-semibold">{editing ? 'Editar reporte' : 'Nuevo reporte'}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Área *</Label>
                <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Seleccionar área" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PBI_AREA_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Nombre del informe *</Label>
                <Input
                  value={form.title ?? ''}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Balance General 2025"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">URL de embed (Power BI "Publicar en web") *</Label>
              <Input
                value={form.embed_url ?? ''}
                onChange={e => {
                  // Detecta si pegaron el <iframe> completo y extrae solo el src
                  const val = e.target.value.trim();
                  const match = val.match(/src="([^"]+)"/);
                  setForm(f => ({ ...f, embed_url: match ? match[1] : val }));
                }}
                placeholder='Pega la URL o el <iframe> completo de Power BI'
                className="h-9 text-sm font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Puedes pegar el código &lt;iframe&gt; completo — se extrae la URL automáticamente.
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descripción (opcional)</Label>
              <Input
                value={form.description ?? ''}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Breve descripción del informe"
                className="h-9 text-sm"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active ?? true}
                  onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                />
                <Label className="text-xs">Visible en Reportes</Label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {editing ? 'Guardar cambios' : 'Agregar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
