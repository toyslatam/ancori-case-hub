# Lógica de Mantenimiento de Sociedades

Este documento describe cómo está construida la lógica del módulo de **Sociedades**, cómo guarda datos en Supabase, qué depende de qué, y cómo encaja QuickBooks en el diseño actual.

## Objetivo del módulo

El mantenimiento de sociedades permite:

- Listar sociedades.
- Buscar y filtrar por sociedad, cliente, tipo, semestre y fechas.
- Crear sociedades nuevas.
- Editar sociedades existentes.
- Eliminar sociedades.
- Relacionar cada sociedad con un cliente.
- Relacionar directores como presidente, tesorero y secretario.
- Guardar datos fiscales como RUC, DV, NIT, tasa única y fecha de inscripción.
- Mantener campos de QuickBooks en modo pasivo mientras la integración de sociedades está desactivada.

## Archivos principales

- `src/pages/maintenance/SocietiesPage.tsx`
  - Pantalla principal del mantenimiento.
  - Maneja formulario, filtros, tabla, validaciones de UI, guardar y eliminar.

- `src/context/AppContext.tsx`
  - Contiene la función global `saveSociety`.
  - Contiene la función global `deleteSociety`.
  - Actualiza el estado local `societies`.

- `src/lib/supabaseDb.ts`
  - Convierte datos entre la app y Supabase.
  - Funciones relevantes:
    - `rowToSociety`
    - `societyToRow`
    - `insertSociety`
    - `updateSocietyRow`
    - `deleteSocietyRow`

- `src/data/mockData.ts`
  - Define la interfaz `Society`.
  - Define `TIPOS_SOCIEDAD`.
  - Define `semestreFromFechaInscripcion`.

- `src/lib/qboIntegration.ts`
  - Helpers existentes para integración con QuickBooks.
  - Actualmente no se usan en el guardado directo de sociedades.

## Modelo de datos en frontend

La interfaz `Society` contiene:

- `id`
- `client_id`
- `nombre`
- `razon_social`
- `tipo_sociedad`
- `correo`
- `telefono`
- `id_qb`
- `ruc`
- `dv`
- `nit`
- `presidente_id`
- `tesorero_id`
- `secretario_id`
- `pago_tasa_unica`
- `fecha_inscripcion`
- `identificacion_fiscal`
- `quickbooks_customer_id`
- `activo`
- `created_at`

También existen campos opcionales de sync QBO en el tipo:

- `qbo_sync_status`
- `qbo_sync_attempts`
- `qbo_sync_last_error`
- `qbo_sync_last_attempt_at`
- `qbo_sync_last_success_at`

Importante: esos campos pueden existir en TypeScript, pero **no se envían actualmente a Supabase** porque la base real no tiene esas columnas en `societies`.

## Carga de sociedades

La carga inicial ocurre desde `AppContext`.

1. `AppContext` llama `db.loadAllFromSupabase(sb)`.
2. `loadAllFromSupabase` trae datos de varias tablas, incluyendo `societies`.
3. Cada fila de Supabase se transforma con `rowToSociety`.
4. El resultado se guarda en el estado global:

```ts
setSocieties(data.societies);
```

La pantalla `SocietiesPage` consume ese estado con:

```ts
const { societies, clients, directores, cases, saveSociety, deleteSociety } = useApp();
```

## Mapeo Supabase a app

La función `rowToSociety` toma una fila de Supabase y la convierte al formato que usa React.

Ejemplos:

- `row.client_id` pasa a `client_id`.
- `row.nombre` pasa a `nombre`.
- `row.tipo_sociedad` se normaliza con `coerceTipoSociedad`.
- `row.fecha_inscripcion` se convierte a formato fecha corto.
- `row.presidente_id`, `tesorero_id`, `secretario_id` se mantienen como ids opcionales.

También lee campos QBO si existen en la respuesta, pero eso es tolerante:

```ts
qbo_sync_status: row.qbo_sync_status ? ... : undefined
```

Si Supabase no devuelve esas columnas, no rompe.

## Mapeo app a Supabase

La función `societyToRow` prepara el payload que se envía a Supabase.

Actualmente envía:

- `id`
- `client_id`
- `nombre`
- `razon_social`
- `tipo_sociedad`
- `correo`
- `telefono`
- `id_qb`
- `ruc`
- `dv`
- `nit`
- `presidente_id`
- `tesorero_id`
- `secretario_id`
- `pago_tasa_unica`
- `fecha_inscripcion`
- `identificacion_fiscal`
- `quickbooks_customer_id`
- `activo`
- `created_at`

No envía:

- `qbo_sync_status`
- `qbo_sync_attempts`
- `qbo_sync_last_error`
- `qbo_sync_last_attempt_at`
- `qbo_sync_last_success_at`

Motivo: la base real mostró este error:

```txt
Could not find the 'qbo_sync_attempts' column of 'societies' in the schema cache
```

Por eso esas columnas quedaron fuera del payload para que sociedades pueda guardar sin depender de la integración QBO.

## Crear sociedad

El flujo de creación ocurre en `SocietiesPage`.

1. El usuario presiona `Nueva Sociedad`.
2. `openNew()` inicializa el formulario:

```ts
{
  activo: true,
  nombre: '',
  razon_social: '',
  tipo_sociedad: 'SOCIEDADES',
  correo: '',
  telefono: '',
  ruc: '',
  dv: '',
  nit: '',
  pago_tasa_unica: '',
  fecha_inscripcion: '',
  client_id: clients[0]?.id ?? '',
}
```

3. El usuario llena datos.
4. `handleSave()` valida:

- `nombre` obligatorio.
- `client_id` obligatorio.
- `tipo_sociedad` debe existir en `TIPOS_SOCIEDAD`.
- `id_qb`, si viene, debe ser numérico.

5. Si es nueva, crea un objeto:

```ts
{
  ...base,
  id: crypto.randomUUID(),
  created_at: new Date().toISOString().split('T')[0],
}
```

6. Llama:

```ts
saveSociety(society, false)
```

7. `AppContext.saveSociety` llama:

```ts
db.insertSociety(sb, society)
```

8. `insertSociety` hace:

```ts
sb.from('societies').insert(societyToRow(s))
```

9. Si Supabase responde sin error, se actualiza el estado local:

```ts
setSocieties(prev => [...prev, merged])
```

## Editar sociedad

El flujo de edición es similar.

1. El usuario hace click en una fila.
2. `openEdit(s)` carga los datos en el formulario.
3. Al guardar, `handleSave()` construye:

```ts
{ ...editItem, ...base }
```

4. Llama:

```ts
saveSociety(society, true)
```

5. `saveSociety` usa:

```ts
db.updateSocietyRow(sb, society)
```

6. `updateSocietyRow` hace:

```ts
sb.from('societies').update(societyToRow(s)).eq('id', s.id)
```

7. Si no hay error, actualiza el estado local:

```ts
setSocieties(prev => prev.map(s => s.id === merged.id ? merged : s))
```

## Eliminar sociedad

El flujo actual:

1. El usuario presiona el ícono de eliminar.
2. Se abre un `AlertDialog`.
3. `confirmDelete()` toma el `id`.
4. Llama:

```ts
deleteSociety(id)
```

5. `deleteSociety` llama:

```ts
db.deleteSocietyRow(sb, id)
```

6. `deleteSocietyRow` hace:

```ts
sb.from('societies').delete().eq('id', id)
```

7. Si Supabase no devuelve error, se elimina del estado local:

```ts
setSocieties(prev => prev.filter(s => s.id !== id))
```

Nota: si una sociedad está vinculada a casos, el schema indica que `cases.society_id` usa `on delete set null`, por lo que la DB puede permitir borrar la sociedad y dejar esos casos sin sociedad.

## Filtros y búsqueda

La pantalla filtra sociedades con `filtered`.

Campos usados para búsqueda:

- Nombre de sociedad.
- Razón social.
- Tipo de sociedad.
- Correo.
- Cliente relacionado.
- `id_qb`.
- RUC.
- DV.
- NIT.
- Presidente.
- Tesorero.
- Secretario.
- Pago tasa única.
- Fecha inscripción.
- Fecha creación.

Filtros avanzados:

- Tipo de sociedad.
- Cliente.
- Sociedad.
- Fecha inscripción desde/hasta.
- Semestre.

El semestre se calcula con:

```ts
semestreFromFechaInscripcion(fecha_inscripcion)
```

Regla:

- Mes 1 a 6 => semestre 1.
- Mes 7 a 12 => semestre 2.

## Dependencias del módulo

Sociedades depende de:

- `clients`: cada sociedad requiere `client_id`.
- `directores`: para presidente, tesorero y secretario.
- `cases`: para contar casos asociados al eliminar.
- `TIPOS_SOCIEDAD`: para validar tipo.
- Supabase: para persistencia real.
- `localStorage`/cache global: indirectamente desde `AppContext`.

## Integración con QuickBooks

La integración de QuickBooks para sociedades existe en el código, pero está desactivada temporalmente en este módulo.

En `SocietiesPage.tsx`:

```ts
const QBO_SOCIETIES_ENABLED = false;
```

Eso provoca:

- El botón muestra `QuickBooks desactivado`.
- El botón queda deshabilitado.
- `handleSyncNames()` retorna con un mensaje si alguien intenta usarlo.

## QuickBooks: piezas existentes

### 1. Sync de nombres desde QuickBooks

La pantalla tiene `handleSyncNames()`.

Cuando QBO esté activo, llamaría:

```ts
POST /functions/v1/qbo-sync-societies
```

Con:

```ts
body: { mode: 'sync_names' }
```

Requiere:

- `VITE_SUPABASE_URL`
- `VITE_QBO_CRON_SECRET`

El objetivo es traer nombres actualizados desde QuickBooks y refrescar la pantalla.

Actualmente está deshabilitado por:

```ts
QBO_SOCIETIES_ENABLED = false
```

### 2. Push inmediato App -> QuickBooks

Existe en `src/lib/qboIntegration.ts`:

```ts
pushSocietyToQuickbooksUpsert(society)
```

Este helper llama:

```txt
/functions/v1/qbo-society-push
```

Envía:

- `operation: 'upsert'`
- `society.id`
- `society.nombre`
- `society.razon_social`
- `society.correo`
- `society.activo`
- `society.quickbooks_customer_id`

Retorna:

- `quickbooks_customer_id`
- `id_qb`

Pero actualmente `saveSociety()` no lo llama.

### 3. Delete en QuickBooks

Existe:

```ts
pushSocietyToQuickbooksDelete(quickbooksCustomerId)
```

Este helper llama:

```txt
/functions/v1/qbo-society-push
```

Con:

```ts
operation: 'delete'
```

Pero actualmente `deleteSociety()` no lo llama.

### 4. Cola async QBO

El diseño anterior contemplaba:

- Columnas `qbo_sync_*` en `societies`.
- Tabla `qbo_society_sync_jobs`.
- Worker `qbo-society-sync-worker`.

La idea era:

1. Guardar sociedad rápido en Supabase.
2. Marcar `qbo_sync_status = 'pending'`.
3. Insertar un job en `qbo_society_sync_jobs`.
4. Un worker/cron sincroniza con QBO en segundo plano.

Actualmente esa parte está desactivada porque la base real no tiene las columnas `qbo_sync_*`, y eso bloqueaba el guardado de sociedades.

## Estado actual de QuickBooks en sociedades

Actualmente:

- No se llama QBO al crear sociedad.
- No se llama QBO al editar sociedad.
- No se llama QBO al eliminar sociedad.
- No se escriben columnas `qbo_sync_*`.
- No se insertan jobs en `qbo_society_sync_jobs`.
- El botón de sync de nombres QB está deshabilitado.

Esto fue hecho para que el mantenimiento de sociedades funcione sin depender de QuickBooks.

## Cómo reactivar QuickBooks correctamente

Para reactivar QBO sin romper sociedades, hay dos caminos.

### Opción A: Reactivar con cola async

Es la opción recomendada si QuickBooks puede ser lento o fallar.

Requiere aplicar en Supabase:

```sql
alter table public.societies
  add column if not exists qbo_sync_status text,
  add column if not exists qbo_sync_attempts integer default 0,
  add column if not exists qbo_sync_last_error text,
  add column if not exists qbo_sync_last_attempt_at timestamptz,
  add column if not exists qbo_sync_last_success_at timestamptz;
```

También requiere que exista:

```sql
public.qbo_society_sync_jobs
```

Y que esté desplegada/configurada la Edge Function:

```txt
qbo-society-sync-worker
```

Ventajas:

- Guardar sociedad no queda bloqueado por QuickBooks.
- Si QBO falla, la sociedad igual queda guardada.
- Se puede reintentar.
- Se puede mostrar estado `pending/success/error`.

### Opción B: Push inmediato al guardar

Usaría:

```ts
pushSocietyToQuickbooksUpsert(society)
```

No se recomienda como flujo principal porque:

- Si QBO está lento, el botón Guardar se queda esperando.
- Si QBO falla, puede impedir guardar en la app.
- Ya ocurrió anteriormente que QBO bloqueaba crear/editar sociedades.

Si se usa, debe tener timeout y no debe impedir persistir la sociedad en Supabase.

## Reglas importantes

1. Supabase debe ser la fuente principal para sociedades.
2. QuickBooks no debe bloquear crear/editar/eliminar sociedades.
3. `societyToRow()` no debe enviar columnas que no existen en la base real.
4. Si se agregan columnas nuevas al tipo `Society`, hay que confirmar si existen en Supabase antes de mandarlas en el payload.
5. Si se reactiva QBO, preferir cola async sobre push inmediato.
6. La UI puede mostrar campos QBO (`id_qb`, `quickbooks_customer_id`), pero no debe depender de QBO para guardar.

## Problemas recientes y causa

### Error

```txt
Could not find the 'qbo_sync_attempts' column of 'societies' in the schema cache
```

### Causa

El frontend intentaba enviar:

```ts
qbo_sync_attempts
```

pero Supabase no tenía esa columna en la tabla real `societies`.

### Solución aplicada

Se quitaron del payload de `societyToRow()` las columnas:

- `qbo_sync_status`
- `qbo_sync_attempts`
- `qbo_sync_last_error`
- `qbo_sync_last_attempt_at`
- `qbo_sync_last_success_at`

También se desactivó el enqueue QBO desde `saveSociety()`.

## Resumen del flujo actual

```txt
Usuario crea/edita sociedad
  -> SocietiesPage valida campos
  -> construye objeto Society
  -> AppContext.saveSociety()
  -> supabaseDb.insertSociety/updateSocietyRow()
  -> societyToRow() sin columnas qbo_sync_*
  -> Supabase guarda
  -> estado local societies se actualiza
  -> QuickBooks no participa
```

## Resumen ejecutivo

El módulo de sociedades ya está preparado para trabajar con QuickBooks, pero actualmente se mantiene desacoplado para evitar bloqueos. La persistencia de sociedades debe funcionar completamente con Supabase aunque QuickBooks esté caído, lento o sin configurar.

Cuando se quiera reactivar QBO, lo más seguro es hacerlo con una cola async (`qbo_society_sync_jobs`) y columnas de estado (`qbo_sync_*`) aplicadas previamente en Supabase.
