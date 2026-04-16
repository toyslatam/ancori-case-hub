import { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableCombo } from '@/components/ui/searchable-combo';
import { useApp } from '@/context/AppContext';
import { Case, CaseComment, Society, TIPOS_SOCIEDAD, CASE_ESTADOS, CASE_PRIORIDADES, formatNTarea } from '@/data/mockData';
import { DollarSign, FileText, Send, Building2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EditCaseModalProps {
  caseData: Case | null;
  open: boolean;
  onClose: () => void;
  onOpenExpenses?: () => void;
  onOpenInvoice?: () => void;
}

// ── Paleta de badges ──────────────────────────────────────────────────────────
const estadoBadge: Record<string, string> = {
  'Pendiente':            'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
  'En Curso':             'bg-sky-50 text-sky-600 ring-1 ring-sky-200/80',
  'Completado/Facturado': 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200/80',
  'Cancelado':            'bg-gray-100 text-gray-400 ring-1 ring-gray-200',
};

// ── Helpers de avatar para comentarios ───────────────────────────────────────
function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
const COLORS = ['bg-violet-400','bg-sky-400','bg-emerald-500','bg-orange-400','bg-rose-400','bg-teal-500','bg-indigo-400'];
function avatarColor(n: string) {
  let h = 0; for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}
function fmtDate(iso: string) {
  const d = new Date(iso);
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ── Label reutilizable ────────────────────────────────────────────────────────
const L = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">{children}</p>
);

// ── Clases comunes de input ───────────────────────────────────────────────────
const inp = 'rounded-lg border border-gray-200 bg-white text-sm focus-visible:ring-2 focus-visible:ring-blue-100 focus-visible:border-blue-300 transition-colors duration-150 placeholder:text-gray-300';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL        as string;
const FUNCTION_SECRET   = import.meta.env.VITE_FUNCTION_SECRET     as string ?? '';

// ─────────────────────────────────────────────────────────────────────────────
export function EditCaseModal({ caseData, open, onClose, onOpenExpenses, onOpenInvoice }: EditCaseModalProps) {
  const {
    clients, societies, services, serviceItems, etapas, usuarios,
    updateCase, addComment, saveSociety, getClientName, getSocietyName,
    allInvoices,
  } = useApp();

  const invoiceCountForCase = useMemo(
    () => (caseData ? allInvoices.filter(i => i.case_id === caseData.id).length : 0),
    [allInvoices, caseData?.id],
  );

  const [form, setForm]                     = useState<Partial<Case> & { gastos_str: string }>({ gastos_str: '' });
  const [commentText, setComment]           = useState('');
  const [sending, setSending]               = useState(false);
  const prevUsuarioId                       = useRef<string | undefined>(undefined);

  // ── Estado para crear sociedad desde cliente temporal ─────────────────
  const [showCreateSociety, setShowCreateSociety] = useState(false);
  const [newSocNombre, setNewSocNombre]            = useState('');
  const [newSocTipo, setNewSocTipo]                = useState<Society['tipo_sociedad']>('SOCIEDADES');
  const [creatingSOC, setCreatingSOC]             = useState(false);

  useEffect(() => {
    if (caseData) {
      setForm({ ...caseData, gastos_str: caseData.gastos_cotizados != null ? String(caseData.gastos_cotizados) : '' });
      prevUsuarioId.current = caseData.usuario_asignado_id;
    }
  }, [caseData]);

  // Todos los useMemo ANTES del early return
  const clientOptions = useMemo(() =>
    clients.filter(c => c.activo).map(c => ({ value: c.id, label: c.nombre })), [clients]);
  const societyOptions = useMemo(() =>
    societies.filter(s => s.activo).map(s => ({ value: s.id, label: s.nombre })), [societies]);
  const serviceItemOptions = useMemo(() =>
    serviceItems.filter(si => si.activo).map(si => {
      const svc = services.find(s => s.id === si.service_id)?.nombre;
      return { value: si.id, label: si.nombre, sublabel: svc };
    }), [serviceItems, services]);
  const etapaOptions = useMemo(() =>
    [...etapas].filter(e => e.activo).sort((a, b) => a.n_etapa - b.n_etapa)
      .map(e => ({ value: e.id, label: `${e.n_etapa}. ${e.nombre}` })), [etapas]);
  const usuarioOptions = useMemo(() =>
    usuarios.filter(u => u.activo).map(u => ({ value: u.id, label: u.nombre })), [usuarios]);
  const etapaAsignacion = useMemo(() =>
    etapas.find(e => e.nombre.toLowerCase().includes('asignac')), [etapas]);

  if (!caseData) return null;

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));
  const isJuridica  = !!(form.society_id);
  const entityLabel = isJuridica
    ? getSocietyName(form.society_id) || getClientName(form.client_id)
    : getClientName(form.client_id);

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

  // ── Abrir/cerrar mini-formulario de sociedad ──────────────────────────
  const handleTemporalSwitch = (checked: boolean) => {
    if (checked && form.client_id && !form.society_id) {
      // Tenemos cliente sin sociedad → abrir formulario para crear
      const clienteNombre = getClientName(form.client_id);
      setNewSocNombre(clienteNombre); // prellenar con nombre del cliente
      setShowCreateSociety(true);
    } else {
      set('cliente_temporal', checked);
    }
  };

  // ── Crear la nueva sociedad y vincularla al caso ──────────────────────
  const handleCreateSociety = async () => {
    if (!newSocNombre.trim() || !form.client_id) return;
    setCreatingSOC(true);
    const newSoc: Society = {
      id:               crypto.randomUUID(),
      client_id:        form.client_id,
      nombre:           newSocNombre.trim(),
      razon_social:     newSocNombre.trim(),
      tipo_sociedad:    newSocTipo,
      correo:           '',
      telefono:         '',
      ruc:              '',
      dv:               '',
      nit:              '',
      pago_tasa_unica:  '',
      fecha_inscripcion: new Date().toISOString().split('T')[0],
      activo:           true,
      created_at:       new Date().toISOString(),
    };
    const ok = await saveSociety(newSoc, false);
    if (ok) {
      setForm(f => ({ ...f, society_id: newSoc.id, cliente_temporal: false }));
      setShowCreateSociety(false);
      setNewSocNombre('');
      toast.success(`Sociedad "${newSoc.nombre}" creada y vinculada al caso`);
    }
    setCreatingSOC(false);
  };

  const handleSave = async () => {
    const updated: Case = {
      ...caseData, ...form,
      gastos_cotizados: form.gastos_str ? parseFloat(form.gastos_str) : (caseData.gastos_cotizados ?? 0),
      prioridad_urgente: form.prioridad === 'Urgente',
    } as Case;
    updateCase(updated);

    const nuevoId = form.usuario_asignado_id;
    if (nuevoId && nuevoId !== prevUsuarioId.current) {
      const u = usuarios.find(x => x.id === nuevoId);
      if (u?.correo) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-assignment-email`, {
            method: 'POST',
            headers: {
              'Content-Type':    'application/json',
              'x-ancori-secret': FUNCTION_SECRET,
            },
            body: JSON.stringify({
              to: u.correo, nombre: u.nombre, cliente: entityLabel,
              caso: caseData.n_tarea ?? caseData.numero_caso,
              estado: form.estado ?? caseData.estado,
              detalle: form.notas || caseData.notas || form.descripcion || '',
              creado_por: caseData.creado_por, asignado_a: u.nombre, enviado_por: caseData.creado_por,
            }),
          });
          toast.success(`Correo enviado a ${u.nombre}`);
        } catch { toast.error('No se pudo enviar el correo'); }
      }
    }
    toast.success('Caso actualizado');
    onClose();
  };

  const handleSendComment = () => {
    const t = commentText.trim();
    if (!t) return;
    setSending(true);
    addComment(caseData.id, {
      id: crypto.randomUUID(), case_id: caseData.id,
      user_name: form.responsable || caseData.creado_por || 'Usuario',
      comentario: t, created_at: new Date().toISOString(),
    } as CaseComment);
    setComment('');
    setSending(false);
  };

  const sortedComments = [...(caseData.comments ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const fechaHeader = caseData.fecha_caso
    ? new Date(caseData.fecha_caso + 'T12:00:00')
        .toLocaleDateString('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden max-h-[92vh] flex flex-col rounded-xl bg-white shadow-lg border border-gray-200">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <DialogTitle className="text-sm font-bold tracking-wide text-gray-500 uppercase">
                Tarea N°:&nbsp;
                <span className="text-orange-500 font-mono">
                  {formatNTarea(caseData.n_tarea) || caseData.numero_caso}
                </span>
                &nbsp;·&nbsp; Fecha: {fechaHeader}
              </DialogTitle>
              {/* Badges en línea con el header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', estadoBadge[form.estado ?? 'Pendiente'])}>
                  {form.estado ?? 'Pendiente'}
                </span>
                {form.prioridad && form.prioridad !== 'Media' && (
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                    form.prioridad === 'Urgente' ? 'bg-rose-50 text-rose-500 ring-1 ring-rose-200/80' : 'bg-gray-50 text-gray-400 ring-1 ring-gray-200',
                  )}>
                    {form.prioridad}
                  </span>
                )}
              </div>
            </div>
          </div>
          <DialogDescription className="sr-only">Editar caso {formatNTarea(caseData.n_tarea)}</DialogDescription>
        </DialogHeader>

        {/* ══ BODY scrollable ═════════════════════════════════════════════════ */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Usuario Asignado */}
          <div>
            <L>Usuario Asignado</L>
            <SearchableCombo
              options={usuarioOptions}
              value={form.usuario_asignado_id ?? ''}
              onChange={handleUsuarioChange}
              placeholder="Seleccionar responsable…"
              className={inp}
            />
            {form.usuario_asignado_id && etapaAsignacion && (
              <p className="mt-1 text-[11px] text-gray-400">
                → Etapa cambiada a{' '}
                <span className="font-medium text-orange-400">{etapaAsignacion.nombre}</span>
              </p>
            )}
          </div>

          {/* Etapa | Estado | Prioridad */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <L>Etapa</L>
              <SearchableCombo
                options={etapaOptions}
                value={form.etapa_id ?? ''}
                onChange={v => set('etapa_id', v)}
                placeholder="Etapa…"
                className={inp}
              />
            </div>
            <div>
              <L>Estado</L>
              <Select value={form.estado ?? 'Pendiente'} onValueChange={v => set('estado', v)}>
                <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_ESTADOS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <L>Prioridad</L>
              <Select value={form.prioridad ?? 'Media'} onValueChange={v => set('prioridad', v)}>
                <SelectTrigger className={inp}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_PRIORIDADES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha Inicio | Fecha Vencimiento | Recurrencia */}
          <div className="grid grid-cols-3 gap-3 items-end">
            <div>
              <L>Fecha de Inicio</L>
              <Input
                value={caseData.fecha_caso ?? '—'}
                readOnly
                className={cn(inp, 'bg-gray-50 text-gray-400 cursor-default')}
              />
            </div>
            <div>
              <L>Fecha Vencimiento</L>
              <Input
                type="date"
                value={form.fecha_vencimiento ?? ''}
                onChange={e => set('fecha_vencimiento', e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <L>Recurrencia</L>
              <div className="flex items-center gap-2.5 h-9">
                <Switch
                  checked={form.recurrencia ?? false}
                  onCheckedChange={v => set('recurrencia', v)}
                  className="data-[state=checked]:bg-orange-400 data-[state=unchecked]:bg-gray-200"
                />
                <span className="text-sm text-gray-500">{form.recurrencia ? 'Sí' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Cliente / Sociedad */}
          <div>
            <L>{isJuridica ? 'Sociedad' : 'Cliente'}</L>
            {isJuridica
              ? <SearchableCombo options={societyOptions} value={form.society_id ?? ''} onChange={handleSocietyChange} placeholder="Buscar sociedad…" className={inp} />
              : <SearchableCombo options={clientOptions} value={form.client_id ?? ''} onChange={v => set('client_id', v)} placeholder="Buscar cliente…" className={inp} />
            }
          </div>

          {/* Ítem de Servicio */}
          <div>
            <L>Ítem de Servicio</L>
            <SearchableCombo
              options={serviceItemOptions}
              value={form.service_item_id ?? ''}
              onChange={handleServiceItemChange}
              placeholder="Buscar ítem de servicio…"
              className={inp}
            />
          </div>

          {/* Descripción */}
          <div>
            <L>Descripción</L>
            <Textarea
              value={form.descripcion ?? ''}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción del caso…"
              rows={3}
              className={cn('resize-none', inp)}
            />
          </div>

          {/* Notas */}
          <div>
            <L>Notas / Observaciones</L>
            <Textarea
              value={form.notas ?? ''}
              onChange={e => set('notas', e.target.value)}
              placeholder="Notas adicionales…"
              rows={2}
              className={cn('resize-none', inp)}
            />
          </div>

          {/* Gastos cotizados | Cliente temporal */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <L>Gastos Cotizados ($)</L>
              <Input
                type="number" min="0" step="0.01"
                value={form.gastos_str ?? ''}
                onChange={e => set('gastos_str', e.target.value)}
                placeholder="0.00"
                className={inp}
              />
            </div>
            <div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 h-10">
                <div>
                  <span className="text-sm text-gray-600">Cliente Temporal</span>
                  {form.cliente_temporal && !form.society_id && (
                    <p className="text-[10px] text-orange-400 leading-none mt-0.5">Sin sociedad · toca para crear</p>
                  )}
                </div>
                <Switch
                  checked={form.cliente_temporal ?? false}
                  onCheckedChange={handleTemporalSwitch}
                  className="data-[state=checked]:bg-orange-400 data-[state=unchecked]:bg-gray-200"
                />
              </div>
            </div>
          </div>

          {/* ── Mini-formulario: Crear Sociedad para cliente ────────────── */}
          {showCreateSociety && (
            <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-semibold text-orange-700">
                    Crear sociedad para {getClientName(form.client_id)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateSociety(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <L>Nombre de la Sociedad</L>
                <Input
                  value={newSocNombre}
                  onChange={e => setNewSocNombre(e.target.value)}
                  placeholder="Ej: INVERSIONES XYZ S.A."
                  className={inp}
                  autoFocus
                />
              </div>

              <div>
                <L>Tipo de Sociedad</L>
                <Select
                  value={newSocTipo}
                  onValueChange={v => setNewSocTipo(v as Society['tipo_sociedad'])}
                >
                  <SelectTrigger className={inp}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_SOCIEDAD.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateSociety(false)}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateSociety}
                  disabled={!newSocNombre.trim() || creatingSOC}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  {creatingSOC ? 'Creando…' : 'Crear Sociedad'}
                </button>
              </div>
            </div>
          )}

          {/* Botones Gastos / Facturas */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => { onOpenExpenses?.(); onClose(); }}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-600 hover:bg-emerald-100 transition-colors duration-150"
            >
              <DollarSign className="h-4 w-4" />
              Gastos del Caso
              {(caseData.expenses?.length ?? 0) > 0 && (
                <span className="ml-auto rounded-full bg-emerald-100 px-1.5 text-[10px] font-bold text-emerald-600">
                  {caseData.expenses.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { onOpenInvoice?.(); onClose(); }}
              className="flex items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-600 hover:bg-sky-100 transition-colors duration-150"
            >
              <FileText className="h-4 w-4" />
              Facturas
              {invoiceCountForCase > 0 && (
                <span className="ml-auto rounded-full bg-sky-100 px-1.5 text-[10px] font-bold text-sky-700">
                  {invoiceCountForCase}
                </span>
              )}
            </button>
          </div>

          {/* ── Comentarios ─────────────────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Comentarios{sortedComments.length > 0 && ` (${sortedComments.length})`}
            </p>

            <div className="flex gap-2">
              <Textarea
                placeholder="Añadir comentario… (Enter para enviar)"
                value={commentText}
                onChange={e => setComment(e.target.value)}
                rows={2}
                className={cn('flex-1 resize-none', inp)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
              />
              <button
                type="button"
                onClick={handleSendComment}
                disabled={!commentText.trim() || sending}
                className="self-end h-9 w-9 flex items-center justify-center rounded-lg bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 max-h-48 overflow-y-auto">
              {sortedComments.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-3">Sin comentarios aún</p>
              ) : sortedComments.map(c => (
                <div key={c.id} className="flex items-start gap-2.5">
                  <div className={`shrink-0 w-7 h-7 rounded-full ${avatarColor(c.user_name)} flex items-center justify-center text-white text-[10px] font-bold`}>
                    {getInitials(c.user_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{c.user_name}</span>
                      <span className="text-[10px] text-gray-400">{fmtDate(c.created_at)}</span>
                    </div>
                    <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 text-sm text-gray-700 leading-relaxed break-words">
                      {c.comentario}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ FOOTER sticky ════════════════════════════════════════════════════ */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-gray-100 bg-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-50 transition-colors duration-150"
          >
            Salir
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors duration-150 shadow-sm"
          >
            Guardar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
