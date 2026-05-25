import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getSupabase } from '@/lib/supabaseClient';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  RefreshCw, Upload, ExternalLink, AlertTriangle, CheckCircle2,
  Link2Off, ShieldCheck, List, Loader2, ChevronDown, Save, Users,
} from 'lucide-react';
import {
  fetchAgileCheckProfile, syncClientToAgileCheck, syncSocietyToAgileCheck,
  pushAgileCheckField, fetchComplianceChecks, verifyEntity,
  type AgileCheckProfile, type ComplianceCheck,
} from '@/lib/agileCheckApi';
import type { Client, Society } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';

// ─── Tipos ──────────────────────────────────────────────────────────────────

type EntityType = 'client' | 'society';

type FieldComparison = {
  label: string; agLabel: string; ancoriValue: string | null;
  agValue: string | null; agFieldKey: string; match: boolean | null;
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

function unwrapD(d: unknown): unknown {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
  const o = d as Record<string, unknown>;
  if (typeof o.d === 'string') { try { return JSON.parse(o.d); } catch { return d; } }
  if (o.d && typeof o.d === 'object') return o.d;
  return d;
}

type RiskFactor = { nombre: string; detalles: string | null; calificacion: number | null; riesgo: number | null };

function parseRiskFactors(detalle: unknown): RiskFactor[] {
  const root = unwrapD(detalle);
  const factors: RiskFactor[] = [];
  function traverse(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const nombre = String(o.nombreIndice ?? o.NombreIndice ?? o.nombre ?? o.Nombre ?? o.indice ?? o.Indice ?? '').trim();
        if (nombre) {
          factors.push({
            nombre,
            detalles: typeof (o.detalles ?? o.Detalles ?? o.detalle ?? o.Detalle) === 'string'
              ? String(o.detalles ?? o.Detalles ?? o.detalle ?? o.Detalle).trim() : null,
            calificacion: typeof (o.calificacionLineal ?? o.CalificacionLineal ?? o.calificacion ?? o.Calificacion) === 'number'
              ? Number(o.calificacionLineal ?? o.CalificacionLineal ?? o.calificacion ?? o.Calificacion) : null,
            riesgo: typeof (o.riesgo ?? o.Riesgo) === 'number' ? Number(o.riesgo ?? o.Riesgo) : null,
          });
        } else { for (const v of Object.values(o)) traverse(v); }
      }
    } else { for (const v of Object.values(obj as Record<string, unknown>)) traverse(v); }
  }
  traverse(root);
  return factors;
}

function extractHubRows(resultData: Record<string, unknown> | null | undefined): string[] {
  if (!resultData) return [];
  const hub = (resultData.hub_response ?? resultData.hub_raw ?? resultData) as Record<string, unknown> | null;
  if (!hub) return [];
  const rowsRaw = hub.consultaRows ?? hub.ConsultaRows ?? [];
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return [];
  const textKeys = /nombre|apellido|razon|social|identidad|cedula|document|lista|persona|alias|titular|denominaci/i;
  return rowsRaw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && (r as Record<string, unknown>).esDescartado !== true)
    .map(r => {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(r)) {
        if (textKeys.test(k) && typeof v === 'string' && v.trim()) parts.push(v.trim());
      }
      return parts.length > 0 ? parts.join(' — ') : Object.values(r).filter(v => typeof v === 'string' && v.trim()).slice(0, 3).join(' — ');
    })
    .filter(Boolean).slice(0, 10);
}

function extractAgValues(profile: Record<string, unknown>): Record<string, string | null> {
  const natural = Array.isArray(profile.PersonaNatural) && profile.PersonaNatural.length > 0
    ? (profile.PersonaNatural[0] as Record<string, unknown>) : null;
  const juridica = Array.isArray(profile.PersonaJuridica) && profile.PersonaJuridica.length > 0
    ? (profile.PersonaJuridica[0] as Record<string, unknown>) : null;
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

type Relacionado = { nombre: string; tipoRelacion: string; tipoCliente: string };

function extractRelacionados(profile: Record<string, unknown>): Relacionado[] {
  const candidates = [
    profile.Relacionados, profile.relacionados,
    (profile.PersonaJuridica as Record<string, unknown>[])?.[0]?.Relacionados,
  ];
  for (const c of candidates) {
    if (!Array.isArray(c) || c.length === 0) continue;
    return c
      .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      .map(r => ({
        nombre: String(r.nombre ?? r.Nombre ?? r.nombreCompleto ?? '').trim(),
        tipoRelacion: String(r.tipoRelacion ?? r.TipoRelacion ?? r.relacion ?? '').trim(),
        tipoCliente: String(r.tipoCliente ?? r.TipoCliente ?? r.tipo ?? '').trim(),
      }))
      .filter(r => r.nombre);
  }
  return [];
}

function str(v: unknown): string { return v != null && v !== '' ? String(v) : ''; }

function nivelRiesgoLabel(nivel: number | null | undefined): string {
  const map: Record<number, string> = { 1: 'bajo', 2: 'medio', 3: 'alto', 4: 'critico' };
  return nivel != null ? (map[nivel] ?? 'desconocido') : 'desconocido';
}

// ─── Tipos exportados ────────────────────────────────────────────────────────

export type AgUpdatedFields = {
  ag_riesgo: number | null; ag_riesgo_nivel: number | null;
  ag_porcCompletadoDD: number | null; ag_verificado_en_listas: boolean | null;
  ag_last_sync_at: string;
};

type Props = {
  entityType: EntityType;
  entity: Client | Society;
  onProfileUpdated?: (entityId: string, fields: AgUpdatedFields) => void;
};

// ─── Componente ─────────────────────────────────────────────────────────────

export function AgileCheckProfilePanel({ entityType, entity, onProfileUpdated }: Props) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [profile, setProfile] = useState<AgileCheckProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noLink, setNoLink] = useState(false);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [loadingCache, setLoadingCache] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  // Formulario datos personales
  const [formDatos, setFormDatos] = useState<Record<string, string>>({});
  const [savingDatos, setSavingDatos] = useState(false);
  const [dirtyDatos, setDirtyDatos] = useState(false);

  // Push individual (campo a campo)
  const [pendingPush, setPendingPush] = useState<{
    agFieldKey: string; label: string; ancoriValue: string | null; agValue: string | null;
  } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [manualId, setManualId] = useState('');
  const [savingId, setSavingId] = useState(false);

  const { session } = useAuth();
  const agileId = entity.agilecheck_cliente_id ?? profile?.agilecheck_cliente_id ?? null;

  // ── Init form desde perfil ──
  useEffect(() => {
    if (!profile) return;
    const p = profile.profile;
    const nat = Array.isArray(p.PersonaNatural) && p.PersonaNatural.length > 0
      ? (p.PersonaNatural[0] as Record<string, unknown>) : null;
    const jur = Array.isArray(p.PersonaJuridica) && p.PersonaJuridica.length > 0
      ? (p.PersonaJuridica[0] as Record<string, unknown>) : null;
    setFormDatos({
      email: str(p.email),
      telefonoResidencia: str(p.telefonoResidencia),
      direccionResidencia: str(p.direccionResidencia),
      numeroDeId: str(p.numeroDeId),
      canalVinculacion: str(p.canalVinculacion),
      estatusCliente: str(p.estatusCliente ?? p.estatus),
      // PersonaNatural
      nombres: str(nat?.nombres),
      apellidos: str(nat?.apellidos),
      fechaNacimiento: str(nat?.fechaNacimiento),
      genero: str(nat?.genero),
      profesion: str(nat?.profesion),
      estadoCivil: str(nat?.estadoCivil),
      tipoIdentificacion: str(nat?.tipoIdentificacion ?? p.tipoIdentificacion),
      fechaVencimientoIdentificacion: str(nat?.fechaVencimientoIdentificacion),
      paisNacimiento: str(nat?.paisNacimiento),
      esCiudadanoEstadounidense: str(nat?.esCiudadanoEstadounidense),
      // PersonaJuridica
      nombreComercial: str(jur?.nombreComercial),
      nombreLegal: str(jur?.nombreLegal),
      canalOperacion: str(jur?.canalOperacion ?? p.canalOperacion),
    });
    setDirtyDatos(false);
  }, [profile]);

  // ── Auto-cargar caché desde BD al montar ──
  useEffect(() => {
    let cancelled = false;
    async function loadCache() {
      setLoadingCache(true);
      const sb = getSupabase();
      if (!sb || !entity.agilecheck_cliente_id) { setLoadingCache(false); return; }
      const table = entityType === 'client' ? 'clients' : 'societies';
      const { data } = await sb.from(table)
        .select('agilecheck_data, ag_riesgo, ag_riesgo_nivel, ag_porcCompletadoDD, ag_verificado_en_listas, ag_last_sync_at')
        .eq('id', entity.id).maybeSingle();
      if (cancelled) return;
      const cached = data as Record<string, unknown> | null;
      const agData = cached?.agilecheck_data as Record<string, unknown> | null;
      if (agData?.profile) {
        const updated_fields = {
          ag_riesgo: (cached?.ag_riesgo as number | null) ?? null,
          ag_riesgo_nivel: (cached?.ag_riesgo_nivel as number | null) ?? null,
          ag_porcCompletadoDD: (cached?.ag_porcCompletadoDD as number | null) ?? null,
          ag_verificado_en_listas: (cached?.ag_verificado_en_listas as boolean | null) ?? null,
          ag_last_sync_at: (cached?.ag_last_sync_at as string | null) ?? (agData.fetched_at as string | null) ?? new Date().toISOString(),
        };
        const built: AgileCheckProfile = {
          agilecheck_cliente_id: entity.agilecheck_cliente_id!,
          profile: agData.profile as Record<string, unknown>,
          es_alto_riesgo: agData.es_alto_riesgo ?? null,
          detalle_riesgo: agData.detalle_riesgo ?? null,
          risk_label: nivelRiesgoLabel(updated_fields.ag_riesgo_nivel),
          updated_fields,
        };
        setProfile(built);
        onProfileUpdated?.(entity.id, updated_fields);
      }
      setLoadingCache(false);
    }
    void loadCache();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, entityType]);

  // ── Cargar verificaciones y auto-verificar si no hay ninguna ──
  useEffect(() => {
    let cancelled = false;
    async function loadAndAutoVerify() {
      const existing = await fetchComplianceChecks(entityType, entity.id);
      if (cancelled) return;
      setChecks(existing);
      if (existing.length === 0 && entity.agilecheck_cliente_id) {
        setVerifying(true);
        const userEmail = session?.user?.email ?? undefined;
        await verifyEntity(entityType, entity.id, entity.nombre, 'PEP', undefined, {
          es_juridico: entityType === 'society',
          checked_by_correo: userEmail,
        });
        if (cancelled) return;
        const updated = await fetchComplianceChecks(entityType, entity.id);
        if (!cancelled) { setChecks(updated); setVerifying(false); }
      }
    }
    void loadAndAutoVerify();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.id, entityType]);

  // ── Guardar datos personales → AgileCheck ──
  const handleSaveDatos = useCallback(async () => {
    if (!profile) return;
    setSavingDatos(true);
    setError(null);
    const p = profile.profile;
    const nat = Array.isArray(p.PersonaNatural) && p.PersonaNatural.length > 0
      ? (p.PersonaNatural[0] as Record<string, unknown>) : null;
    const jur = Array.isArray(p.PersonaJuridica) && p.PersonaJuridica.length > 0
      ? (p.PersonaJuridica[0] as Record<string, unknown>) : null;

    const fields: Record<string, unknown> = {
      email: formDatos.email,
      telefonoResidencia: formDatos.telefonoResidencia,
      direccionResidencia: formDatos.direccionResidencia,
      numeroDeId: formDatos.numeroDeId,
      canalVinculacion: formDatos.canalVinculacion,
    };

    if (nat) {
      fields.PersonaNatural = [{
        ...nat,
        nombres: formDatos.nombres,
        apellidos: formDatos.apellidos,
        fechaNacimiento: formDatos.fechaNacimiento || nat.fechaNacimiento,
        genero: formDatos.genero || nat.genero,
        profesion: formDatos.profesion || nat.profesion,
        estadoCivil: formDatos.estadoCivil || nat.estadoCivil,
        tipoIdentificacion: formDatos.tipoIdentificacion || nat.tipoIdentificacion,
        paisNacimiento: formDatos.paisNacimiento || nat.paisNacimiento,
      }];
    }
    if (jur) {
      fields.PersonaJuridica = [{
        ...jur,
        nombreComercial: formDatos.nombreComercial || jur.nombreComercial,
        nombreLegal: formDatos.nombreLegal || jur.nombreLegal,
      }];
    }

    const result = await pushAgileCheckField(entityType, entity.id, fields);
    setSavingDatos(false);
    if (!result.ok) {
      setError(result.detail ? `${result.error}: ${result.detail}` : (result.error ?? 'Error'));
      toast.error('Error al guardar en AgileCheck');
      return;
    }
    toast.success('Datos guardados en AgileCheck');
    setDirtyDatos(false);
    await handleFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, formDatos, entityType, entity.id]);

  // ── Cargar perfil desde AgileCheck (botón Actualizar) ──
  const handleFetch = useCallback(async () => {
    setLoading(true); setError(null); setNoLink(false);
    const result = await fetchAgileCheckProfile(entityType, entity.id);
    setLoading(false);
    if (!result.ok) {
      const r = result as { ok: false; error: string; detail?: string };
      if (r.error === 'no_agilecheck_link' || r.error === 'agilecheck_wrong_company') {
        setNoLink(true);
        if (r.error === 'agilecheck_wrong_company') setError(r.detail ?? 'ID no pertenece a esta empresa.');
      } else { setError(r.detail ? `${r.error}: ${r.detail}` : r.error); }
      return;
    }
    setProfile(result);
    onProfileUpdated?.(entity.id, result.updated_fields);
    fetchComplianceChecks(entityType, entity.id).then(setChecks);
  }, [entityType, entity.id, onProfileUpdated]);

  const handleLinkId = useCallback(async () => {
    const numId = parseInt(manualId.trim(), 10);
    if (!numId || isNaN(numId)) return;
    setSavingId(true); setError(null);
    const sb = getSupabase();
    if (!sb) { setError('Supabase no configurado'); setSavingId(false); return; }
    const table = entityType === 'client' ? 'clients' : 'societies';
    const { error: dbError } = await sb.from(table).update({ agilecheck_cliente_id: numId }).eq('id', entity.id);
    setSavingId(false);
    if (dbError) { setError(dbError.message); return; }
    setManualId(''); setNoLink(false);
    await handleFetch();
  }, [manualId, entityType, entity.id, handleFetch]);

  const handleSync = useCallback(async () => {
    setSyncing(true); setError(null);
    const result = entityType === 'client'
      ? await syncClientToAgileCheck(entity.id) : await syncSocietyToAgileCheck(entity.id);
    setSyncing(false);
    if (!result.ok) { setError(result.error ?? 'Error desconocido'); return; }
    setNoLink(false);
    await handleFetch();
  }, [entityType, entity.id, handleFetch]);

  const confirmPush = useCallback(async () => {
    if (!pendingPush) return;
    setPushing(true);
    const fieldMap: Record<string, string> = {
      email: 'email', telefono: 'telefonoResidencia',
      direccion: 'direccionResidencia', identificacion: 'numeroDeId',
    };
    const agKey = fieldMap[pendingPush.agFieldKey] ?? pendingPush.agFieldKey;
    const result = await pushAgileCheckField(entityType, entity.id, { [agKey]: pendingPush.ancoriValue ?? '' });
    setPushing(false); setPendingPush(null);
    if (!result.ok) { setError(result.detail ? `${result.error}: ${result.detail}` : (result.error ?? 'Error')); return; }
    await handleFetch();
  }, [pendingPush, entityType, entity.id, handleFetch]);

  // ── Comparaciones campo a campo ──
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
      return { label, agLabel, ancoriValue, agValue, agFieldKey, match: valuesMatch(ancoriValue, agValue) };
    });
  })();

  const mismatchCount = comparisons.filter(c => c.match === false).length;

  // ── Datos para tabs ──
  const factors = profile ? parseRiskFactors(profile.detalle_riesgo) : [];
  const sancionesEntry = factors.find(f => /lista|sancion|sanción/i.test(f.nombre));
  const enLista = sancionesEntry
    ? (sancionesEntry.calificacion != null && sancionesEntry.calificacion > 1)
    : (profile?.updated_fields.ag_verificado_en_listas === true);
  const sancionesTexto = sancionesEntry?.detalles
    ?? (profile?.updated_fields.ag_verificado_en_listas != null
      ? (profile.updated_fields.ag_verificado_en_listas ? 'Positivo en listas de sanciones' : 'No está en ninguna lista restrictiva')
      : null);

  const relacionados = profile ? extractRelacionados(profile.profile) : [];

  const nat = profile && Array.isArray(profile.profile.PersonaNatural) && (profile.profile.PersonaNatural as unknown[]).length > 0
    ? (profile.profile.PersonaNatural as Record<string, unknown>[])[0] : null;
  const jur = profile && Array.isArray(profile.profile.PersonaJuridica) && (profile.profile.PersonaJuridica as unknown[]).length > 0
    ? (profile.profile.PersonaJuridica as Record<string, unknown>[])[0] : null;
  const isNatural = !!nat;

  function setField(key: string, val: string) {
    setFormDatos(f => ({ ...f, [key]: val }));
    setDirtyDatos(true);
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Card className="mt-4 border-blue-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            Debida Diligencia — AgileCheck
            {agileId != null && <span className="text-xs font-normal text-muted-foreground">ID: {agileId}</span>}
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

      <CardContent className="space-y-3">
        {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}

        {noLink && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-amber-50 rounded p-3 text-sm text-amber-800">
              <Link2Off className="h-4 w-4 mt-0.5 shrink-0" />
              <span>No se encontró en AgileCheck. Ingresa el ID numérico para vincular o usa <strong>Registrar en AgileCheck</strong>.</span>
            </div>
            <div className="flex gap-2 items-center">
              <Input type="number" placeholder="ID numérico en AgileCheck" value={manualId}
                onChange={e => setManualId(e.target.value)} className="h-8 text-xs max-w-xs" disabled={savingId} />
              <Button size="sm" variant="outline" onClick={handleLinkId} disabled={savingId || !manualId.trim()} className="shrink-0">
                {savingId ? 'Vinculando...' : 'Vincular ID'}
              </Button>
            </div>
          </div>
        )}

        {verifying && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded p-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            Consultando listas PEP/sanciones en AgileCheck…
          </div>
        )}

        {!profile && !loading && !loadingCache && !noLink && !error && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Sin datos de AgileCheck. Presiona «Consultar AgileCheck» para obtener el perfil.
          </p>
        )}

        {profile && (
          <Tabs defaultValue="datos" className="w-full">
            <TabsList className="w-full grid grid-cols-4 h-8 text-xs">
              <TabsTrigger value="datos" className="text-xs">Datos</TabsTrigger>
              <TabsTrigger value="riesgo" className="text-xs">
                Riesgo
                {enLista && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-red-500 inline-block" />}
              </TabsTrigger>
              <TabsTrigger value="relacionados" className="text-xs">
                Relacionados {relacionados.length > 0 && `(${relacionados.length})`}
              </TabsTrigger>
              <TabsTrigger value="verificaciones" className="text-xs">
                Verificaciones {checks.length > 0 && `(${checks.length})`}
              </TabsTrigger>
            </TabsList>

            {/* ── TAB: DATOS PERSONALES ─────────────────────────────── */}
            <TabsContent value="datos" className="space-y-3 pt-3">
              {isNatural ? (
                // Persona Natural
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Nombres</Label>
                      <Input value={formDatos.nombres ?? ''} onChange={e => setField('nombres', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Apellidos</Label>
                      <Input value={formDatos.apellidos ?? ''} onChange={e => setField('apellidos', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Fecha de Nacimiento</Label>
                      <Input value={formDatos.fechaNacimiento ?? ''} onChange={e => setField('fechaNacimiento', e.target.value)} className="h-8 text-xs mt-1" placeholder="YYYY-MM-DD" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Género</Label>
                      <Input value={formDatos.genero ?? ''} onChange={e => setField('genero', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Profesión</Label>
                      <Input value={formDatos.profesion ?? ''} onChange={e => setField('profesion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Estado Civil</Label>
                      <Input value={formDatos.estadoCivil ?? ''} onChange={e => setField('estadoCivil', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Tipo de Identificación</Label>
                      <Input value={formDatos.tipoIdentificacion ?? ''} onChange={e => setField('tipoIdentificacion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Número de Identificación</Label>
                      <Input value={formDatos.numeroDeId ?? ''} onChange={e => setField('numeroDeId', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Fecha Venc. Identificación</Label>
                      <Input value={formDatos.fechaVencimientoIdentificacion ?? ''} onChange={e => setField('fechaVencimientoIdentificacion', e.target.value)} className="h-8 text-xs mt-1" placeholder="YYYY-MM-DD" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Teléfono Principal</Label>
                      <Input value={formDatos.telefonoResidencia ?? ''} onChange={e => setField('telefonoResidencia', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Correo Electrónico</Label>
                      <Input type="email" value={formDatos.email ?? ''} onChange={e => setField('email', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">País de Nacimiento</Label>
                      <Input value={formDatos.paisNacimiento ?? ''} onChange={e => setField('paisNacimiento', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Ciudadano Estadounidense</Label>
                      <Input value={formDatos.esCiudadanoEstadounidense ?? ''} onChange={e => setField('esCiudadanoEstadounidense', e.target.value)} className="h-8 text-xs mt-1" placeholder="Sí / No" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Canal de Vinculación</Label>
                      <Input value={formDatos.canalVinculacion ?? ''} onChange={e => setField('canalVinculacion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Dirección</Label>
                    <Input value={formDatos.direccionResidencia ?? ''} onChange={e => setField('direccionResidencia', e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                </div>
              ) : (
                // Persona Jurídica
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Nombre Comercial</Label>
                      <Input value={formDatos.nombreComercial ?? ''} onChange={e => setField('nombreComercial', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Nombre Legal</Label>
                      <Input value={formDatos.nombreLegal ?? ''} onChange={e => setField('nombreLegal', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Teléfono</Label>
                      <Input value={formDatos.telefonoResidencia ?? ''} onChange={e => setField('telefonoResidencia', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Correo Electrónico</Label>
                      <Input type="email" value={formDatos.email ?? ''} onChange={e => setField('email', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Tipo de Identificación</Label>
                      <Input value={formDatos.tipoIdentificacion ?? ''} onChange={e => setField('tipoIdentificacion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Número de Identificación</Label>
                      <Input value={formDatos.numeroDeId ?? ''} onChange={e => setField('numeroDeId', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Canal de Operación</Label>
                      <Input value={formDatos.canalOperacion ?? str(jur?.canalOperacion)} onChange={e => setField('canalOperacion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Canal de Vinculación</Label>
                      <Input value={formDatos.canalVinculacion ?? ''} onChange={e => setField('canalVinculacion', e.target.value)} className="h-8 text-xs mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Dirección</Label>
                    <Input value={formDatos.direccionResidencia ?? ''} onChange={e => setField('direccionResidencia', e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                </div>
              )}

              {/* Comparación con Ancori */}
              {comparisons.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-muted-foreground cursor-pointer select-none hover:text-foreground">
                    Ver comparación con datos Ancori {mismatchCount > 0 && `(${mismatchCount} diferencia${mismatchCount > 1 ? 's' : ''})`}
                  </summary>
                  <div className="rounded border divide-y text-xs mt-2">
                    {comparisons.map(c => (
                      <div key={c.agFieldKey} className={`px-3 py-2 space-y-1 ${c.match === false ? 'bg-red-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
                          <div className="flex items-center gap-1.5">
                            {c.match === true && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                            {c.match === false && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            {c.match === false && c.ancoriValue != null && (
                              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] text-blue-700 hover:bg-blue-50"
                                onClick={() => setPendingPush({ agFieldKey: c.agFieldKey, label: c.label, ancoriValue: c.ancoriValue, agValue: c.agValue })}>
                                <ExternalLink className="h-2.5 w-2.5 mr-0.5" /> Enviar a AG
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                          <div><p className="text-muted-foreground">Ancori</p><p className="font-medium">{c.ancoriValue ?? <span className="italic text-muted-foreground">vacío</span>}</p></div>
                          <div><p className="text-blue-600">AgileCheck</p><p className="font-medium">{c.agValue ?? <span className="italic text-muted-foreground">vacío</span>}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {agileId != null && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={handleSaveDatos} disabled={savingDatos || !dirtyDatos} className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {savingDatos ? 'Guardando...' : 'Guardar en AgileCheck'}
                  </Button>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground text-right">
                Última consulta: {new Date(profile.updated_fields.ag_last_sync_at).toLocaleString('es-PA')}
              </p>
            </TabsContent>

            {/* ── TAB: RIESGO Y LISTAS ──────────────────────────────── */}
            <TabsContent value="riesgo" className="space-y-3 pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded p-2 text-center">
                  <p className="text-xs text-muted-foreground">Nivel de Riesgo</p>
                  <div className="mt-1 flex justify-center">
                    {riskLevelBadge(profile.updated_fields.ag_riesgo_nivel) ?? <span className="text-xs">—</span>}
                  </div>
                </div>
                <div className="bg-slate-50 rounded p-2 text-center">
                  <p className="text-xs text-muted-foreground">Score</p>
                  <p className="text-sm font-semibold mt-1">
                    {profile.updated_fields.ag_riesgo != null ? profile.updated_fields.ag_riesgo.toFixed(2) : '—'}
                  </p>
                </div>
                <div className="bg-slate-50 rounded p-2 text-center">
                  <p className="text-xs text-muted-foreground">DD Completo</p>
                  <p className="text-sm font-semibold mt-1">
                    {profile.updated_fields.ag_porcCompletadoDD != null ? `${profile.updated_fields.ag_porcCompletadoDD.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className={`rounded p-2 text-center ${enLista ? 'bg-red-50' : 'bg-green-50'}`}>
                  <p className="text-xs text-muted-foreground">Listas Sanciones</p>
                  <p className={`text-sm font-semibold mt-1 ${enLista ? 'text-red-700' : 'text-green-700'}`}>
                    {enLista ? 'Positivo' : 'Limpio'}
                  </p>
                </div>
              </div>

              {sancionesTexto && (
                <div className={`flex items-start gap-2 rounded p-2.5 text-xs ${enLista ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                  {enLista ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <span><span className="font-semibold">Listas de Sanciones:</span> {sancionesTexto}</span>
                </div>
              )}

              {factors.length > 0 && (
                <div className="space-y-1">
                  <button type="button" onClick={() => setShowMatrix(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMatrix ? 'rotate-180' : ''}`} />
                    {showMatrix ? 'Ocultar' : 'Ver'} matriz de riesgo completa ({factors.length} factores)
                  </button>
                  {showMatrix && (
                    <div className="rounded border overflow-hidden text-xs">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Factor</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-muted-foreground uppercase">Detalle</th>
                            <th className="px-3 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase w-14">Calif.</th>
                            <th className="px-3 py-1.5 text-center text-[10px] font-semibold text-muted-foreground uppercase w-16">Riesgo</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {factors.map((f, i) => {
                            const isLista = /lista|sancion|sanción/i.test(f.nombre);
                            const isHigh = (f.calificacion ?? 0) >= 3;
                            return (
                              <tr key={i} className={isLista ? (isHigh ? 'bg-red-50' : 'bg-green-50') : ''}>
                                <td className="px-3 py-1.5 font-medium leading-tight">{f.nombre}</td>
                                <td className="px-3 py-1.5 text-muted-foreground leading-tight">{f.detalles ?? '—'}</td>
                                <td className="px-3 py-1.5 text-center">{f.calificacion ?? '—'}</td>
                                <td className="px-3 py-1.5 text-center">{f.riesgo != null ? f.riesgo.toFixed(3) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* ── TAB: RELACIONADOS ─────────────────────────────────── */}
            <TabsContent value="relacionados" className="pt-3">
              {relacionados.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin relacionados registrados en AgileCheck.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Personas Relacionadas ({relacionados.length})
                  </p>
                  <div className="rounded border divide-y text-xs">
                    {relacionados.map((r, i) => (
                      <div key={i} className="px-3 py-2.5 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{r.nombre || '—'}</p>
                          {r.tipoCliente && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">{r.tipoCliente}</p>
                          )}
                        </div>
                        {r.tipoRelacion && (
                          <Badge variant="outline" className="text-[10px] shrink-0">{r.tipoRelacion}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── TAB: VERIFICACIONES ───────────────────────────────── */}
            <TabsContent value="verificaciones" className="pt-3 space-y-2">
              {checks.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin verificaciones registradas.</p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <List className="h-3.5 w-3.5" />
                    Verificaciones en listas ({checks.length})
                  </p>
                  <div className="rounded border divide-y text-xs">
                    {checks.map(c => {
                      const isExpanded = expandedCheckId === c.id;
                      const rows = extractHubRows(c.result_data);
                      const statusColor: Record<string, string> = {
                        clean: 'bg-green-100 text-green-800', match: 'bg-red-100 text-red-800',
                        review: 'bg-yellow-100 text-yellow-800', error: 'bg-red-50 text-red-600',
                        pending: 'bg-muted text-muted-foreground',
                      };
                      const statusLabel: Record<string, string> = {
                        clean: 'Limpio', match: 'Coincidencia', review: 'Revisar', error: 'Error', pending: 'Pendiente',
                      };
                      return (
                        <div key={c.id}>
                          <button type="button" onClick={() => setExpandedCheckId(isExpanded ? null : c.id)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor[c.status] ?? 'bg-muted text-muted-foreground'}`}>
                                {statusLabel[c.status] ?? c.status}
                              </span>
                              <span className="text-muted-foreground text-[10px]">{c.check_type}</span>
                              {c.result_summary && !isExpanded && (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">{c.result_summary}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] text-muted-foreground">
                                {c.checked_at ? new Date(c.checked_at).toLocaleString('es-PA', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                              </span>
                              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/20 border-t">
                              {c.result_summary && <p className="text-[11px] text-foreground leading-snug">{c.result_summary}</p>}
                              {rows.length > 0 && (
                                <div className="space-y-1">
                                  <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide">Coincidencias encontradas</p>
                                  {rows.map((r, i) => (
                                    <div key={i} className="bg-red-50 rounded px-2 py-1 text-[10px] text-red-800 font-medium leading-snug">{r}</div>
                                  ))}
                                </div>
                              )}
                              {rows.length === 0 && c.status === 'clean' && (
                                <div className="flex items-center gap-1.5 text-[11px] text-green-700">
                                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                  Sin coincidencias en listas restrictivas consultadas
                                </div>
                              )}
                              <p className="text-[10px] text-muted-foreground">
                                Verificado: {c.checked_at ? new Date(c.checked_at).toLocaleString('es-PA') : '—'}
                                {c.expires_at && ` · Expira: ${new Date(c.expires_at).toLocaleDateString('es-PA')}`}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      {/* Diálogo push individual */}
      <AlertDialog open={pendingPush != null} onOpenChange={o => { if (!o) setPendingPush(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envío a AgileCheck</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Sobrescribirá el valor en AgileCheck:</p>
                <div className="rounded bg-slate-50 p-3 space-y-1 text-xs">
                  <p><span className="font-medium">Campo:</span> {pendingPush?.label}</p>
                  <p><span className="font-medium">Valor actual en AgileCheck:</span>{' '}
                    <span className="text-red-600">{pendingPush?.agValue ?? '(vacío)'}</span></p>
                  <p><span className="font-medium">Nuevo valor (desde Ancori):</span>{' '}
                    <span className="text-green-700">{pendingPush?.ancoriValue ?? '(vacío)'}</span></p>
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
