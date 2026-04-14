import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { Case, CaseComment, CASE_ESTADOS, CASE_PRIORIDADES, formatNTarea } from '@/data/mockData';
import { DollarSign, FileText, Send, Save } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditCaseModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
  onOpenExpenses?: () => void;
  onOpenInvoice?: () => void;
}

const estadoColor: Record<string, string> = {
  'Pendiente':            'bg-yellow-50 text-yellow-700 border-yellow-300',
  'En Curso':             'bg-blue-50 text-blue-700 border-blue-300',
  'Completado/Facturado': 'bg-green-50 text-green-700 border-green-300',
  'Cancelado':            'bg-gray-50 text-gray-500 border-gray-300',
};

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
const AVATAR_COLORS = ['bg-amber-700','bg-purple-600','bg-blue-600','bg-emerald-600','bg-rose-600','bg-orange-600','bg-teal-600'];
function avatarColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── Edge function URL ────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function EditCaseModal({ caseData, open, onClose, onOpenExpenses, onOpenInvoice }: EditCaseModalProps) {
  const {
    clients, societies, services, serviceItems, etapas, usuarios,
    updateCase, addComment,
    getClientName, getSocietyName,
  } = useApp();

  // ── estado local ────────────────────────────────────────────────────────────
  const [form, setForm]           = useState<Partial<Case> & { gastos_str: string }>({ gastos_str: '' });
  const [commentText, setComment] = useState('');
  const [sending, setSending]     = useState(false);
  const prevUsuarioId             = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (caseData) {
      setForm({ ...caseData, gastos_str: caseData.gastos_cotizados != null ? String(caseData.gastos_cotizados) : '' });
      prevUsuarioId.current = caseData.usuario_asignado_id;
    }
  }, [caseData]);

  // ── memos (SIEMPRE antes de cualquier early return) ──────────────────────
  const clientOptions = useMemo(() =>
    clients.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre })),
    [clients]);

  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo).map(s => ({ value: s.id, label: s.nombre })),
    [societies]);

  const serviceItemOptions = useMemo(() =>
    serviceItems.filter(si => si.activo).map(si => {
      const svcNombre = services.find(s => s.id === si.service_id)?.nombre;
      return { value: si.id, label: si.nombre, sublabel: svcNombre };
    }),
    [serviceItems, services]);

  const etapaOptions = useMemo(() =>
    [...etapas].filter(e => e.activo).sort((a, b) => a.n_etapa - b.n_etapa)
      .map(e => ({ value: e.id, label: `${e.n_etapa}. ${e.nombre}` })),
    [etapas]);

  const usuarioOptions = useMemo(() =>
    usuarios.filter(u => u.activo).map(u => ({ value: u.id, label: u.nombre })),
    [usuarios]);

  // etapa "Asignacion Abogado" (búsqueda flexible)
  const etapaAsignacion = useMemo(() =>
    etapas.find(e => e.nombre.toLowerCase().includes('asignac')),
    [etapas]);

  // ── early return DESPUÉS de todos los hooks ──────────────────────────────
  if (!caseData) return null;

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const isJuridica = !!(form.society_id);
  const entityLabel = isJuridica
    ? getSocietyName(form.society_id) || getClientName(form.client_id)
    : getClientName(form.client_id);

  // Cuando cambia el usuario asignado → auto-cambia etapa a Asignacion Abogado
  const handleUsuarioChange = (id: string) => {
    setForm(f => ({
      ...f,
      usuario_asignado_id: id,
      ...(id && etapaAsignacion ? { etapa_id: etapaAsignacion.id } : {}),
    }));
  };

  const handleServiceItemChange = (id: string) => {
    const item = serviceItems.find(si => si.id === id);
    setForm(f => ({ ...f, service_item_id: id, ...(item?.service_id ? { service_id: item.service_id } : {}) }));
  };

  const handleSocietyChange = (id: string) => {
    const soc = societies.find(s => s.id === id);
    setForm(f => ({ ...f, society_id: id, client_id: soc?.client_id ?? f.client_id }));
  };

  // ── guardar + envío de correo si cambia asignado ─────────────────────────
  const handleSave = async () => {
    const updated: Case = {
      ...caseData,
      ...form,
      gastos_cotizados: form.gastos_str ? parseFloat(form.gastos_str) : (caseData.gastos_cotizados ?? 0),
      prioridad_urgente: form.prioridad === 'Urgente',
    } as Case;
    updateCase(updated);

    // Enviar correo si el usuario asignado cambió
    const nuevoUsuarioId = form.usuario_asignado_id;
    if (nuevoUsuarioId && nuevoUsuarioId !== prevUsuarioId.current) {
      const usuario = usuarios.find(u => u.id === nuevoUsuarioId);
      if (usuario?.correo) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-assignment-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to:          usuario.correo,
              nombre:      usuario.nombre,
              cliente:     entityLabel,
              caso:        caseData.n_tarea ?? caseData.numero_caso,
              estado:      form.estado ?? caseData.estado,
              detalle:     form.notas || caseData.notas || form.descripcion || '',
              creado_por:  caseData.creado_por,
              asignado_a:  usuario.nombre,
              enviado_por: caseData.creado_por,
            }),
          });
          toast.success(`Correo enviado a ${usuario.nombre}`);
        } catch {
          toast.error('No se pudo enviar el correo de asignación');
        }
      }
    }

    toast.success('Caso actualizado');
    onClose();
  };

  // ── agregar comentario ───────────────────────────────────────────────────
  const handleSendComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    setSending(true);
    const comment: CaseComment = {
      id: crypto.randomUUID(),
      case_id: caseData.id,
      user_name: form.responsable || caseData.creado_por || 'Usuario',
      comentario: trimmed,
      created_at: new Date().toISOString(),
    };
    addComment(caseData.id, comment);
    setComment('');
    setSending(false);
  };

  const sortedComments = [...(caseData.comments ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Fecha formateada para el header
  const fechaHeader = caseData.fecha_caso
    ? new Date(caseData.fecha_caso + 'T12:00:00').toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[680px] p-0 overflow-hidden max-h-[92vh] flex flex-col">

        {/* ── Header ────────────────────────────────────────── */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b bg-muted/30 shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
                Tarea N°: <span className="text-primary font-mono">{formatNTarea(caseData.n_tarea) || caseData.numero_caso}</span>
                &nbsp;&nbsp;·&nbsp;&nbsp;Fecha: {fechaHeader}
              </DialogTitle>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', estadoColor[form.estado ?? 'Pendiente'])}>
                  {form.estado ?? 'Pendiente'}
                </span>
                {form.prioridad === 'Urgente' && (
                  <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 text-red-700 px-2 py-0.5 text-xs font-semibold">
                    Urgente
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleSave} className="gap-1.5 h-8">
                <Save className="h-3.5 w-3.5" /> Guardar
              </Button>
            </div>
          </div>
          <DialogDescription className="sr-only">Editar caso {formatNTarea(caseData.n_tarea)}</DialogDescription>
        </DialogHeader>

        {/* ── Cuerpo scrollable ─────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Usuario Asignado */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Usuario Asignado
            </p>
            <SearchableCombo
              options={usuarioOptions}
              value={form.usuario_asignado_id ?? ''}
              onChange={handleUsuarioChange}
              placeholder="Seleccionar usuario…"
            />
            {form.usuario_asignado_id && etapaAsignacion && (
              <p className="mt-1 text-xs text-muted-foreground">
                → Etapa cambiada a <span className="font-semibold text-primary">{etapaAsignacion.nombre}</span>
              </p>
            )}
          </div>

          {/* Etapa | Estado | Prioridad */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Etapa</p>
              <SearchableCombo
                options={etapaOptions}
                value={form.etapa_id ?? ''}
                onChange={v => set('etapa_id', v)}
                placeholder="Etapa…"
              />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Estado</p>
              <Select value={form.estado ?? 'Pendiente'} onValueChange={v => set('estado', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Prioridad</p>
              <Select value={form.prioridad ?? 'Media'} onValueChange={v => set('prioridad', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha Inicio | Fecha Vencimiento | Recurrencia */}
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Fecha de Inicio</p>
              <Input value={caseData.fecha_caso ?? '—'} readOnly className="bg-muted/40 text-muted-foreground cursor-default" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Fecha Vencimiento</p>
              <Input
                type="date"
                value={form.fecha_vencimiento ?? ''}
                onChange={e => set('fecha_vencimiento', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recurrencia</p>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={form.recurrencia ?? false}
                  onCheckedChange={v => set('recurrencia', v)}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-sm text-muted-foreground">{form.recurrencia ? 'Sí' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Cliente / Sociedad */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {isJuridica ? 'Sociedad' : 'Cliente'}
            </p>
            {isJuridica ? (
              <SearchableCombo options={societyOptions} value={form.society_id ?? ''} onChange={handleSocietyChange} placeholder="Buscar sociedad…" />
            ) : (
              <SearchableCombo options={clientOptions} value={form.client_id ?? ''} onChange={v => set('client_id', v)} placeholder="Buscar cliente…" />
            )}
          </div>

          {/* Ítem de Servicio */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Ítem de Servicio</p>
            <SearchableCombo
              options={serviceItemOptions}
              value={form.service_item_id ?? ''}
              onChange={handleServiceItemChange}
              placeholder="Buscar ítem de servicio…"
            />
          </div>

          {/* Descripción */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Descripción</p>
            <Textarea
              value={form.descripcion ?? ''}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción del caso…"
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Notas / Observaciones */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Notas / Observaciones</p>
            <Textarea
              value={form.notas ?? ''}
              onChange={e => set('notas', e.target.value)}
              placeholder="Notas adicionales…"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Gastos Cotizados + Cliente Temporal en fila */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Gastos Cotizados ($)</p>
              <Input
                type="number" min="0" step="0.01"
                value={form.gastos_str ?? ''}
                onChange={e => set('gastos_str', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-4 py-2.5 bg-muted/20 h-10">
              <p className="text-sm font-medium">Cliente Temporal</p>
              <Switch checked={form.cliente_temporal ?? false} onCheckedChange={v => set('cliente_temporal', v)} />
            </div>
          </div>

          {/* Botones Gastos / Facturas */}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              onClick={() => { onOpenExpenses?.(); onClose(); }}>
              <DollarSign className="h-4 w-4" />
              Gastos del Caso
              {(caseData.expenses?.length ?? 0) > 0 && (
                <span className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full px-1.5">{caseData.expenses.length}</span>
              )}
            </Button>
            <Button variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => { onOpenInvoice?.(); onClose(); }}>
              <FileText className="h-4 w-4" />
              Facturas
            </Button>
          </div>

          {/* ── Sección de Comentarios ──────────────────────── */}
          <div className="border-t pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Comentarios {sortedComments.length > 0 && <span className="text-primary">({sortedComments.length})</span>}
            </p>

            {/* Añadir comentario */}
            <div className="flex gap-2 mb-4">
              <Textarea
                placeholder="Añadir comentario…"
                value={commentText}
                onChange={e => setComment(e.target.value)}
                rows={2}
                className="flex-1 resize-none rounded-xl bg-muted/50"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); }}}
              />
              <Button onClick={handleSendComment} size="icon" disabled={!commentText.trim() || sending} className="self-end h-9 w-9 rounded-xl shrink-0">
                <Send className="h-4 w-4" />
              </Button>
            </div>

            {/* Lista de comentarios */}
            <div className="space-y-3 max-h-52 overflow-y-auto pr-1">
              {sortedComments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Sin comentarios aún</p>
              ) : sortedComments.map(c => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className={`shrink-0 w-8 h-8 rounded-full ${avatarColor(c.user_name)} flex items-center justify-center text-white text-xs font-bold`}>
                    {getInitials(c.user_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-bold">{c.user_name}</span>
                      <span className="text-xs text-muted-foreground">{fmtDate(c.created_at)}</span>
                    </div>
                    <div className="bg-amber-800 text-white text-sm rounded-lg px-3 py-2 leading-relaxed break-words">
                      {c.comentario}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Salir</Button>
          <Button onClick={handleSave} className="px-8 gap-2">
            <Save className="h-4 w-4" /> Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
