/**
 * Motor de detección de conflictos para sync bidireccional
 * Supabase ↔ QuickBooks Online.
 */

// deno-lint-ignore no-explicit-any
type SupabaseAdmin = any;

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

export type FieldAction =
  | 'auto_fill_supabase'      // QB tiene valor, Supabase vacío  → copiar a Supabase
  | 'auto_fill_quickbooks'    // Supabase tiene valor, QB vacío  → copiar a QB
  | 'conflict';               // Ambos tienen valores distintos  → requiere conciliación

export type FieldComparison = {
  field: string;              // clave interna (ej: 'ruc', 'presidente_name')
  supabaseValue: string;      // valor en Supabase (o '' si vacío)
  quickbooksValue: string;    // valor en QB (o '' si vacío)
  action: FieldAction;
};

export type SocietyFlat = {
  ruc?: string;
  dv?: string;
  nit?: string;
  tipo_sociedad?: string;
  direccion?: string;
  presidente_name?: string;   // nombre resuelto, no UUID
  tesorero_name?: string;
  secretario_name?: string;
  // campos estándar (no custom fields)
  nombre?: string;
  razon_social?: string;
  correo?: string;
};

/* ------------------------------------------------------------------ */
/*  Normalización para comparación                                     */
/* ------------------------------------------------------------------ */

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')   // quitar acentos
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmpty(s: string | null | undefined): boolean {
  return norm(s) === '';
}

/* ------------------------------------------------------------------ */
/*  Comparador principal                                               */
/* ------------------------------------------------------------------ */

/**
 * Compara los valores de una sociedad en Supabase contra los Custom Fields
 * (y campos estándar) obtenidos de QuickBooks.
 *
 * Solo produce entradas cuando hay algo que hacer:
 *   - auto_fill en una dirección
 *   - conflicto
 *
 * Campos donde ambos están vacíos o ambos son iguales se omiten.
 */
export function compareFields(
  society: SocietyFlat,
  qbCustomFields: Record<string, string>,
  qbStandardFields?: {
    DisplayName?: string;
    CompanyName?: string;
    PrimaryEmailAddr?: string;
  },
): FieldComparison[] {
  const result: FieldComparison[] = [];

  // Custom Fields (RUC, DV, NIT, directores, tipo_sociedad, direccion)
  const customKeys: (keyof SocietyFlat)[] = [
    'ruc', 'dv', 'nit', 'tipo_sociedad', 'direccion',
    'presidente_name', 'tesorero_name', 'secretario_name',
  ];

  for (const key of customKeys) {
    const sbRaw = society[key] as string | undefined;
    const qbRaw = qbCustomFields[key as string];
    compare(result, key, sbRaw, qbRaw);
  }

  // Campos estándar (se comparan también por si QB los cambió desde fuera)
  if (qbStandardFields) {
    compare(result, 'nombre', society.nombre, qbStandardFields.DisplayName);
    compare(result, 'razon_social', society.razon_social, qbStandardFields.CompanyName);
    compare(result, 'correo', society.correo, qbStandardFields.PrimaryEmailAddr);
  }

  return result;
}

function compare(
  out: FieldComparison[],
  field: string,
  sbRaw: string | undefined,
  qbRaw: string | undefined,
): void {
  const sbEmpty = isEmpty(sbRaw);
  const qbEmpty = isEmpty(qbRaw);

  if (sbEmpty && qbEmpty) return;                         // ambos vacíos → nada
  if (!sbEmpty && !qbEmpty && norm(sbRaw) === norm(qbRaw)) return; // iguales → nada

  const sbVal = (sbRaw ?? '').trim();
  const qbVal = (qbRaw ?? '').trim();

  if (!sbEmpty && qbEmpty) {
    out.push({ field, supabaseValue: sbVal, quickbooksValue: '', action: 'auto_fill_quickbooks' });
  } else if (sbEmpty && !qbEmpty) {
    out.push({ field, supabaseValue: '', quickbooksValue: qbVal, action: 'auto_fill_supabase' });
  } else {
    // Ambos tienen valor y son distintos
    out.push({ field, supabaseValue: sbVal, quickbooksValue: qbVal, action: 'conflict' });
  }
}

/* ------------------------------------------------------------------ */
/*  Resolución de nombres de directores                                */
/* ------------------------------------------------------------------ */

export type DirectorNames = {
  presidente_name: string;
  tesorero_name: string;
  secretario_name: string;
};

/**
 * Dado un society con FKs a directores, resuelve los nombres.
 * Hace una sola query con IN(...) para eficiencia.
 */
export async function resolveDirectorNames(
  supabase: SupabaseAdmin,
  society: {
    presidente_id?: string | null;
    tesorero_id?: string | null;
    secretario_id?: string | null;
  },
): Promise<DirectorNames> {
  const ids = [
    society.presidente_id,
    society.tesorero_id,
    society.secretario_id,
  ].filter(Boolean) as string[];

  if (ids.length === 0) {
    return { presidente_name: '', tesorero_name: '', secretario_name: '' };
  }

  const { data: rows } = await supabase
    .from('directores')
    .select('id, nombre')
    .in('id', ids);

  const map = new Map<string, string>();
  if (rows) {
    for (const r of rows) {
      map.set(r.id, r.nombre ?? '');
    }
  }

  return {
    presidente_name: map.get(society.presidente_id ?? '') ?? '',
    tesorero_name:   map.get(society.tesorero_id ?? '') ?? '',
    secretario_name: map.get(society.secretario_id ?? '') ?? '',
  };
}

/* ------------------------------------------------------------------ */
/*  Búsqueda inversa: nombre de director → UUID                       */
/* ------------------------------------------------------------------ */

/**
 * Busca un director por nombre (normalizado). Devuelve el UUID o null.
 */
export async function findDirectorIdByName(
  supabase: SupabaseAdmin,
  nombre: string,
): Promise<string | null> {
  if (isEmpty(nombre)) return null;
  const { data: rows } = await supabase
    .from('directores')
    .select('id, nombre')
    .eq('activo', true);

  if (!rows) return null;

  const target = norm(nombre);
  for (const r of rows) {
    if (norm(r.nombre) === target) return r.id;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Persistencia de conflictos                                         */
/* ------------------------------------------------------------------ */

/**
 * Inserta conflictos en la tabla sync_conflicts.
 * Usa ON CONFLICT DO NOTHING gracias al índice parcial único
 * (society_id, field_name) WHERE status = 'pending'.
 * Devuelve la cantidad insertada.
 */
export async function insertConflicts(
  supabase: SupabaseAdmin,
  societyId: string,
  comparisons: FieldComparison[],
): Promise<number> {
  const conflicts = comparisons.filter((c) => c.action === 'conflict');
  if (conflicts.length === 0) return 0;

  const rows = conflicts.map((c) => ({
    society_id: societyId,
    field_name: c.field,
    supabase_value: c.supabaseValue,
    quickbooks_value: c.quickbooksValue,
    status: 'pending',
  }));

  const { data, error } = await supabase
    .from('sync_conflicts')
    .upsert(rows, {
      onConflict: 'society_id,field_name',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) {
    console.error('[sync-conflict-detector] Error insertando conflictos:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}
