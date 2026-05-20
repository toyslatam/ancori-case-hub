import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSupabase } from '@/lib/supabaseClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RefreshCw, Upload, ExternalLink, AlertTriangle, CheckCircle2, Link2Off, ShieldCheck } from 'lucide-react';
import {
  fetchAgileCheckProfile,
  syncClientToAgileCheck,
  syncSocietyToAgileCheck,
  pushAgileCheckField,
  type AgileCheckProfile,
} from '@/lib/agileCheckApi';
import type { Client, Society } from '@/data/mockData';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type EntityType = 'client' | 'society';

type FieldComparison = {
  label: string;
  agLabel: string;
  ancoriValue: string | null;
  agValue: string | null;
  agFieldKey: string;
  match: boolean | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: unknown): string | null {
  if (v == null || v === '' || v === 0) return null;
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v.trim() || null;
  return null;
}

function normalizeForMatch(s: string | null): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function valuesMatch(a: string | null, b: string | null): boolean | null {
  if (a == null && b == null) return null;
  if (a == null || b == null) return false;
  return normalizeForMatch(a) === normalizeForMatch(b);
}

function riskLevelBadge(nivel: number | null | undefined) {
  const map: Record<number, { label: string; className: string }> = {
    1: { label: 'Bajo', className: 'bg-green-100 text-green-800' },
    2: { label: 'Medio', className: 'bg-yellow-100 text-yellow-800' },
    3: { label: 'Alto', className: 'bg-orange-100 text-orange-800' },
    4: { label: 'Crítico', className: 'bg-red-100 text-red-800' },
  };
  if (nivel == null) return null;
  const entry = map[nivel];
  if (!entry) return null;
  return <Badge className={entry.className}>{entry.label}</Badge>;
}

// Extrae campos comparables de un perfil AgileCheck (GetCliente)
function extractAgValues(profile: Record<string, unknown>): Record<string, string | null> {
  const natural = Array.isArray(profile.PersonaNatural) && profile.PersonaNatural.length > 0
    ? (profile.PersonaNatural[0] as Record<string, unknown>)
    : null;
  const juridica = Array.isArray(profile.PersonaJuridica) && profile.PersonaJuridica.length > 0
    ? (profile.PersonaJuridica[0] as Record<string, unknown>)
    : null;

  return {
    nombre: fmt(juridica?.nombreComercial ?? natural?.nombres ?? null),
    razon_social: fmt(juridica?.nombreLegal ?? null),
    email: fmt(profile.email),
    telefono: fmt(profile.telefonoResidencia),
    direccion: fmt(profile.direccionResidencia),
    identificacion: fmt(profile.numeroDeId),
    riesgo: profile.riesgo != null ? `${Number(profile.riesgo).toFixed(2)}` : null,
    porcDD: profile.porcCompletadoDD != null ? `${Number(profile.porcCompletadoDD).toFixed(1)}%` : null,
    verificadoEnListas: profile.verificadoEnListas != null ? (profile.verificadoEnListas ? 'Sí' : 'No') : null,
  };
}

// ─── Componente ─────────────────────────────────────────────────────────────

export type AgUpdatedFields = {
  ag_riesgo: number | null;
  ag_riesgo_nivel: number | null;
  ag_porcCompletadoDD: number | null;
  ag_verificado_en_listas: boolean | null;
  ag_last_sync_at: string;
};

type Props = {
  entityType: EntityType;
  entity: Client | Society;
  onProfileUpdated?: (entityId: string, fields: AgUpdatedFields) => void;
};

export function AgileCheckProfilePanel({ entityType, entity, onProfileUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState<AgileCheckProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noLink, setNoLink] = useState(false);

  // Estado para diálogo de confirmación de push
  const [pendingPush, setPendingPush] = useState<{
    agFieldKey: string;
    label: string;
    ancoriValue: string | null;
    agValue: string | null;
  } | null>(null);
  const [pushing, setPushing] = useState(false);

  // Estado para vinculación manual de ID AgileCheck
  const [manualId, setManualId] = useState('');
  const [savingId, setSavingId] = useState(false);

  const agileId = entity.agilecheck_cliente_id ?? profile?.agilecheck_cliente_id ?? null;

  // ── Cargar perfil desde AgileCheck ──
  const handleFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNoLink(false);
    const result = await fetchAgileCheckProfile(entityType, entity.id);
    setLoading(false);
    if (!result.ok) {
      const r = result as { ok: false; error: string; detail?: string };
      if (r.error === 'no_agilecheck_link' || r.error === 'agilecheck_wrong_company') {
        setNoLink(true);
        if (r.error === 'agilecheck_wrong_company') {
          setError(r.detail ?? 'ID en AgileCheck no pertenece a esta empresa. Ingresa el ID correcto.');
        }
      } else {
        setError(r.detail ? `${r.error}: ${r.detail}` : r.error);
      }
      return;
    }
    setProfile(result);
    onProfileUpdated?.(entity.id, result.updated_fields);
  }, [entityType, entity.id, onProfileUpdated]);

  // ── Vincular ID AgileCheck manualmente (solo escribe en DB, nunca toca AgileCheck) ──
  const handleLinkId = useCallback(async () => {
    const numId = parseInt(manualId.trim(), 10);
    if (!numId || isNaN(numId)) return;
    setSavingId(true);
    setError(null);
    const sb = getSupabase();
    if (!sb) { setError('Supabase no configurado'); setSavingId(false); return; }
    const table = entityType === 'client' ? 'clients' : 'societies';
    const { error: dbError } = await sb.from(table).update({ agilecheck_cliente_id: numId }).eq('id', entity.id);
    setSavingId(false);
    if (dbError) { setError(dbError.message); return; }
    setManualId('');
    setNoLink(false);
    await handleFetch();
  }, [manualId, entityType, entity.id, handleFetch]);

  // ── Registrar en AgileCheck (primera vez) ──
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    const result = entityType === 'client'
      ? await syncClientToAgileCheck(entity.id)
      : await syncSocietyToAgileCheck(entity.id);
    setSyncing(false);
    if (!result.ok) {
      setError(result.error ?? 'Error desconocido');
      return;
    }
    setNoLink(false);
    await handleFetch();
  }, [entityType, entity.id, handleFetch]);

  // ── Push de un campo editado → AgileCheck ──
  const confirmPush = useCallback(async () => {
    if (!pendingPush) return;
    setPushing(true);
    const fieldPayload: Record<string, unknown> = {};

    // Mapear el campo del panel al campo real de AgileCheck
    const fieldMap: Record<string, string> = {
      email: 'email',
      telefono: 'telefonoResidencia',
      direccion: 'direccionResidencia',
      identificacion: 'numeroDeId',
    };
    const agKey = fieldMap[pendingPush.agFieldKey] ?? pendingPush.agFieldKey;
    fieldPayload[agKey] = pendingPush.ancoriValue ?? '';

    const result = await pushAgileCheckField(entityType, entity.id, fieldPayload);
    setPushing(false);
    setPendingPush(null);
    if (!result.ok) {
      setError(result.detail ? `${result.error}: ${result.detail}` : (result.error ?? 'Error'));
      return;
    }
    await handleFetch();
  }, [pendingPush, entityType, entity.id, handleFetch]);

  // ── Construir comparaciones campo a campo ──
  const comparisons: FieldComparison[] = (() => {
    if (!profile) return [];
    const agVals = extractAgValues(profile.profile);

    const fields: Array<{ label: string; agLabel: string; ancoriKey: keyof (Client & Society); agFieldKey: string }> = [
      { label: 'Nombre', agLabel: 'AG. Nombre', ancoriKey: 'nombre', agFieldKey: 'nombre' },
      { label: 'Razón Social', agLabel: 'AG. Razón Social', ancoriKey: 'razon_social', agFieldKey: 'razon_social' },
      { label: 'Email', agLabel: 'AG. Email', ancoriKey: entityType === 'client' ? 'email' : 'correo', agFieldKey: 'email' },
      { label: 'Teléfono', agLabel: 'AG. Teléfono', ancoriKey: 'telefono', agFieldKey: 'telefono' },
      ...(entityType === 'client'
        ? [{ label: 'Dirección', agLabel: 'AG. Dirección', ancoriKey: 'direccion' as keyof (Client & Society), agFieldKey: 'direccion' },
           { label: 'Identificación', agLabel: 'AG. Identificación', ancoriKey: 'identificacion' as keyof (Client & Society), agFieldKey: 'identificacion' }]
        : [{ label: 'Identificación Fiscal', agLabel: 'AG. Identificación', ancoriKey: 'identificacion_fiscal' as keyof (Client & Society), agFieldKey: 'identificacion' }]
      ),
    ];

    return fields.map(({ label, agLabel, ancoriKey, agFieldKey }) => {
      const ancoriValue = fmt((entity as unknown as Record<string, unknown>)[ancoriKey as string]);
      const agValue = agVals[agFieldKey] ?? null;
      return {
        label,
        agLabel,
        ancoriValue,
        agValue,
        agFieldKey,
        match: valuesMatch(ancoriValue, agValue),
      };
    });
  })();

  const mismatchCount = comparisons.filter((c) => c.match === false).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Card className="mt-4 border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Debida Diligencia — AgileCheck
            {agileId != null && (
              <span className="text-xs font-normal text-muted-foreground">ID: {agileId}</span>
            )}
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {agileId == null && !noLink && (
              <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing || loading}>
                <Upload className="h-3 w-3 mr-1" />
                {syncing ? 'Registrando...' : 'Registrar en AgileCheck'}
              </Button>
            )}
            {noLink && (
              <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                <Link2Off className="h-3 w-3 mr-1" />
                {syncing ? 'Registrando...' : 'Registrar en AgileCheck'}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={handleFetch} disabled={loading || syncing}>
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Cargando...' : profile ? 'Actualizar' : 'Consultar AgileCheck'}
            </Button>
          </div>
        </div>
        {mismatchCount > 0 && (
          <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3" />
            {mismatchCount} campo{mismatchCount > 1 ? 's' : ''} sin coincidencia con AgileCheck
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error */}
        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
        )}

        {/* Sin vinculación */}
        {noLink && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-amber-50 rounded p-3 text-sm text-amber-800">
              <Link2Off className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                No se encontró en AgileCheck por documento. Si ya existe en AgileCheck,
                ingresa el ID numérico para vincularlo. Si no existe, usa{' '}
                <strong>Registrar en AgileCheck</strong>.
              </span>
            </div>
            <div className="flex gap-2 items-center">
              <Input
                type="number"
                placeholder="ID numérico en AgileCheck (ej: 12345)"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="h-8 text-xs max-w-xs"
                disabled={savingId}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleLinkId}
                disabled={savingId || !manualId.trim()}
                className="shrink-0"
              >
                {savingId ? 'Vinculando...' : 'Vincular ID'}
              </Button>
            </div>
          </div>
        )}

        {/* Resumen de riesgo */}
        {profile && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-xs text-muted-foreground">Nivel de Riesgo</p>
              <div className="mt-1 flex justify-center">
                {riskLevelBadge(profile.updated_fields.ag_riesgo_nivel) ?? <span className="text-xs">—</span>}
              </div>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-xs text-muted-foreground">AG. Score</p>
              <p className="text-sm font-semibold mt-1">
                {profile.updated_fields.ag_riesgo != null
                  ? profile.updated_fields.ag_riesgo.toFixed(2)
                  : '—'}
              </p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-xs text-muted-foreground">AG. DD Completo</p>
              <p className="text-sm font-semibold mt-1">
                {profile.updated_fields.ag_porcCompletadoDD != null
                  ? `${profile.updated_fields.ag_porcCompletadoDD.toFixed(1)}%`
                  : '—'}
              </p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-xs text-muted-foreground">AG. Verificado Listas</p>
              <p className="text-sm font-semibold mt-1">
                {profile.updated_fields.ag_verificado_en_listas != null
                  ? (profile.updated_fields.ag_verificado_en_listas ? 'Sí' : 'No')
                  : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Tabla comparativa campo a campo */}
        {comparisons.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Comparación de datos
            </p>
            <div className="rounded border divide-y text-xs">
              {comparisons.map((c) => (
                <div
                  key={c.agFieldKey}
                  className={`px-3 py-2.5 space-y-1.5 ${c.match === false ? 'bg-red-50' : ''}`}
                >
                  {/* Cabecera: nombre del campo + ícono match + botón */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {c.match === true && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                      {c.match === false && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                      {c.match === false && c.ancoriValue != null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
                          onClick={() => setPendingPush({
                            agFieldKey: c.agFieldKey,
                            label: c.label,
                            ancoriValue: c.ancoriValue,
                            agValue: c.agValue,
                          })}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Enviar a AG
                        </Button>
                      )}
                    </div>
                  </div>
                  {/* Valores: Ancori | AgileCheck */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground mb-0.5">Ancori</p>
                      <p className="font-medium break-words">
                        {c.ancoriValue ?? <span className="italic text-muted-foreground">vacío</span>}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-blue-600 mb-0.5">AgileCheck</p>
                      <p className="font-medium break-words">
                        {c.agValue ?? <span className="italic text-muted-foreground">vacío</span>}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sincronizado */}
        {profile && (
          <p className="text-[10px] text-muted-foreground text-right">
            Última consulta: {new Date(profile.updated_fields.ag_last_sync_at).toLocaleString('es-PA')}
          </p>
        )}
      </CardContent>

      {/* Diálogo de confirmación de push */}
      <AlertDialog open={pendingPush != null} onOpenChange={(o) => { if (!o) setPendingPush(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envío a AgileCheck</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Está a punto de sobrescribir el valor en AgileCheck:</p>
                <div className="rounded bg-slate-50 p-3 space-y-1 text-xs">
                  <p><span className="font-medium">Campo:</span> {pendingPush?.label}</p>
                  <p><span className="font-medium">Valor actual en AgileCheck:</span>{' '}
                    <span className="text-red-600">{pendingPush?.agValue ?? '(vacío)'}</span>
                  </p>
                  <p><span className="font-medium">Nuevo valor (desde Ancori):</span>{' '}
                    <span className="text-green-700">{pendingPush?.ancoriValue ?? '(vacío)'}</span>
                  </p>
                </div>
                <p className="text-amber-700">Esta acción modifica el registro en AgileCheck. ¿Confirma?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pushing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPush} disabled={pushing}>
              {pushing ? 'Enviando...' : 'Confirmar y enviar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
