/**
 * Lectura / escritura de Custom Fields en QB Customer.
 * Los Custom Fields se devuelven en customer.CustomField[] cuando
 * se usa minorversion >= 65.
 */

export type QboCustomField = {
  DefinitionId: string;
  Name: string;
  Type: string;           // normalmente "StringType"
  StringValue: string;
};

/**
 * Mapeo: nombre visible del Custom Field en QB → clave interna usada
 * para comparar con columnas de Supabase.
 *
 * Para directores el valor en QB es el nombre del director (texto),
 * mientras que en Supabase es un UUID (FK).  La comparación se hace
 * contra el nombre resuelto, no el UUID.
 */
export const QB_CUSTOM_FIELD_MAP: Record<string, string> = {
  // ── Campos activos (en uso) ──────────────────────────────
  'RUC':                    'ruc',
  'DV':                     'dv',
  'NIT.':                   'nit',           // QB usa "NIT." con punto final
  'PRESIDENTE':             'presidente_name',
  'TESORERO':               'tesorero_name',
  'SECRETARIO':             'secretario_name',
  'FECHA DE CONSTITUCION':  'fecha_inscripcion',
  'TIPO DE SOCIEDAD':       'tipo_sociedad',
  // ── Campos reservados (dropdowns, aún sin uso) ───────────
  // 'DIRECCION':           'direccion',
  // 'CLIENTE.':            'cliente_ref',
  // 'NOMBRE DE CLIENTE':   'nombre_cliente',
  // 'DATOS DEL CLIENTE':   'datos_cliente',
  // 'DIRECTORES':          'directores_ref',
  // 'DATOS TRIBUTARIOS':   'datos_tributarios',
};

/** Claves inversas: clave interna → nombre QB */
export const INTERNAL_TO_QB_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(QB_CUSTOM_FIELD_MAP).map(([qb, internal]) => [internal, qb]),
);

/**
 * Extrae los Custom Fields de un Customer QB en un Record plano.
 * Devuelve solo los campos mapeados (los desconocidos se ignoran).
 */
export function extractQboCustomFields(
  // deno-lint-ignore no-explicit-any
  customer: Record<string, any>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const fields: QboCustomField[] = Array.isArray(customer?.CustomField)
    ? customer.CustomField
    : [];

  for (const f of fields) {
    const name = (f.Name ?? '').trim().toUpperCase();
    const internal = QB_CUSTOM_FIELD_MAP[name];
    if (internal && f.StringValue) {
      result[internal] = f.StringValue.trim();
    }
  }
  return result;
}

/**
 * Construye el array CustomField para un sparse update.
 * Mezcla los valores existentes (para mantener DefinitionId) con
 * las actualizaciones solicitadas.
 */
export function buildCustomFieldPatch(
  existingFields: QboCustomField[],
  updates: Record<string, string>,  // clave interna → nuevo valor
): QboCustomField[] {
  const patched: QboCustomField[] = [];

  for (const f of existingFields) {
    const name = (f.Name ?? '').trim().toUpperCase();
    const internal = QB_CUSTOM_FIELD_MAP[name];
    if (internal && internal in updates) {
      // Actualizar este campo con el valor nuevo
      patched.push({
        DefinitionId: f.DefinitionId,
        Name: f.Name,
        Type: f.Type || 'StringType',
        StringValue: updates[internal],
      });
      delete updates[internal]; // ya procesado
    }
  }

  // Si quedan updates sin DefinitionId conocido, no podemos crearlos
  // (QB requiere DefinitionId).  Se ignoran silenciosamente y se
  // reportan en log para investigación futura.
  const remaining = Object.keys(updates);
  if (remaining.length > 0) {
    console.warn(
      `[qbo-custom-fields] Campos sin DefinitionId, no se pueden enviar a QB: ${remaining.join(', ')}`,
    );
  }

  return patched;
}
