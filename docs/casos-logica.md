# Lógica de Casos

Este documento describe cómo está construida la lógica del módulo de **Casos** en la app: qué archivos participan, cómo se cargan los datos, cómo se crean/actualizan/eliminan casos, y cómo se conectan comentarios, gastos, facturas, usuarios, clientes y sociedades.

## Objetivo del módulo

El módulo de casos permite:

- Listar y buscar casos.
- Filtrar por estado, prioridad y fechas.
- Crear casos para persona natural o persona jurídica.
- Asociar cada caso a cliente, sociedad, servicio, ítem de servicio y etapa.
- Editar datos operativos del caso.
- Asignar un usuario responsable.
- Enviar correo cuando cambia el usuario asignado.
- Registrar comentarios.
- Registrar gastos del caso.
- Crear o editar facturas vinculadas al caso.
- Eliminar casos.

## Archivos principales

- `src/pages/CasesPage.tsx`
  - Pantalla principal de casos.
  - Consume `cases` desde `useApp()`.
  - Maneja búsqueda, filtros rápidos, KPIs y apertura de modales.
  - Conecta la tabla con crear, editar, comentarios, gastos, facturas y eliminar.

- `src/components/cases/NewCaseModal.tsx`
  - Modal para crear un caso nuevo.
  - Permite elegir entre persona natural y persona jurídica.
  - Selecciona cliente o sociedad.
  - Selecciona ítem de servicio.
  - Construye el objeto `Case` inicial y llama `addCase`.

- `src/components/cases/EditCaseModal.tsx`
  - Modal principal de edición del caso.
  - Permite modificar usuario asignado, etapa, estado, prioridad, fechas, cliente/sociedad, ítem de servicio, descripción y gastos cotizados.
  - Permite crear una sociedad desde un cliente temporal.
  - Permite agregar comentarios.
  - Dispara correo de asignación cuando cambia `usuario_asignado_id`.

- `src/components/cases/CasesTable.tsx`
  - Tabla/listado de seguimiento de casos.
  - Ordena, pagina y muestra acciones por caso.
  - Usa helpers del contexto para mostrar nombres legibles de cliente, sociedad, ítem de servicio y usuario.

- `src/components/cases/CommentsDrawer.tsx`
  - Vista alterna para comentarios.
  - Crea comentarios y llama `addComment`.

- `src/components/cases/ExpensesModal.tsx`
  - Modal para registrar gastos del caso.
  - Edita líneas de gasto y llama `updateExpenses`.

- `src/components/cases/InvoiceModal.tsx`
  - Modal para crear, editar y enviar facturas vinculadas al caso.
  - Usa `saveInvoice`, `patchInvoice` y datos de QuickBooks/facturación.

- `src/context/AppContext.tsx`
  - Estado global de la app.
  - Contiene `cases`, `allInvoices` y catálogos relacionados.
  - Expone acciones:
    - `addCase`
    - `updateCase`
    - `removeCase`
    - `addComment`
    - `addExpense`
    - `updateExpenses`
    - `saveInvoice`
    - `patchInvoice`
    - `deleteInvoice`
  - Maneja cache local y persistencia en Supabase.

- `src/lib/supabaseDb.ts`
  - Capa de adaptación entre modelos frontend y tablas Supabase.
  - Funciones relevantes:
    - `rowToCase`
    - `caseToRow`
    - `loadAllFromSupabase`
    - `insertCase`
    - `updateCaseRow`
    - `deleteCaseRow`
    - `insertComment`
    - `replaceCaseExpenses`
    - `insertExpense`
    - `insertInvoice`
    - `updateInvoice`
    - `deleteInvoiceRow`

- `src/data/mockData.ts`
  - Define interfaces y constantes:
    - `Case`
    - `CaseComment`
    - `CaseExpense`
    - `CaseInvoice`
    - `InvoiceLine`
    - `CASE_ESTADOS`
    - `CASE_PRIORIDADES`
    - `formatNTarea`

- `supabase/functions/send-assignment-email/index.ts`
  - Edge Function que envía correo cuando se asigna un caso a un usuario.

## Modelo de datos frontend

La interfaz principal es `Case` en `src/data/mockData.ts`.

Campos principales:

- `id`: UUID generado en frontend.
- `n_tarea`: correlativo numérico interno.
- `numero_caso`: versión formateada del correlativo.
- `client_id`: cliente asociado.
- `society_id`: sociedad asociada, si aplica.
- `service_id`: servicio padre.
- `service_item_id`: ítem de servicio específico.
- `descripcion`: descripción del caso.
- `estado`: estado operativo.
- `etapa_id`: etapa actual.
- `etapa`: campo legacy/de compatibilidad.
- `gastos_cotizados`: monto de gastos estimados.
- `gastos_cliente`: gastos del cliente.
- `gastos_pendiente`: gastos pendientes por cobrar.
- `cliente_temporal`: indica si el cliente/sociedad requiere formalización.
- `prioridad`: `Baja`, `Media` o `Urgente`.
- `prioridad_urgente`: derivado/compatibilidad para prioridad urgente.
- `creado_por`: nombre del usuario que creó el caso.
- `responsable`: responsable textual legacy. En casos nuevos queda vacío; el responsable operativo se define con `usuario_asignado_id`.
- `usuario_asignado_id`: FK a `usuarios.id`.
- `observaciones`: campo legacy, actualmente no se muestra en UI.
- `notas`: campo legacy, actualmente no se muestra en UI.
- `fecha_caso`: fecha de creación/inicio del caso.
- `fecha_vencimiento`: vencimiento del caso.
- `recurrencia`: indica si el caso es recurrente.
- `envio_correo`: marca de envío de correo.
- `created_at`: fecha de creación.
- `comments`: comentarios anidados.
- `expenses`: gastos anidados.
- `invoices`: facturas anidadas.

Estados permitidos:

- `Pendiente`
- `En Curso`
- `Completado/Facturado`
- `Cancelado`

Prioridades permitidas:

- `Baja`
- `Media`
- `Urgente`

## Tablas de Supabase

El flujo de casos usa varias tablas:

- `cases`
  - Registro principal del caso.
  - Guarda cliente, sociedad, servicio, etapa, estado, prioridad, usuario asignado y fechas.

- `case_comments`
  - Comentarios asociados por `case_id`.

- `case_expenses`
  - Gastos asociados por `case_id`.

- `case_invoices`
  - Facturas asociadas por `case_id`.

- `invoice_lines`
  - Líneas de cada factura.

También depende de catálogos:

- `clients`
- `societies`
- `services`
- `service_items`
- `etapas`
- `usuarios`
- `invoice_terms`
- `categories`
- `qb_items`

## Carga inicial de datos

La carga ocurre en `AppContext.tsx`.

1. Se crea el cliente Supabase con `getSupabase()`.
2. Si Supabase está configurado, el estado inicia vacío.
3. Se define una cache local por usuario:

```text
ancori_app_cache_v1:<session.user.id>
```

4. Al montar, intenta leer esa cache desde `localStorage`.
5. Luego llama `db.loadAllFromSupabase(sb)` con hasta 3 intentos.
6. Si la carga remota funciona, actualiza estados globales y reescribe la cache.
7. Si una tabla falla, `loadAllFromSupabase` puede devolver el resto de datos y registrar advertencias en `loadWarnings`.

La función `loadAllFromSupabase` trae en paralelo:

- `clients`
- `societies`
- `services`
- `service_items`
- `etapas`
- `usuarios`
- `invoice_terms`
- `categories`
- `qb_items`
- `directores`
- `cases`
- `case_comments`
- `case_expenses`
- `case_invoices`
- `invoice_lines`

Luego arma los casos con datos anidados:

- Agrupa comentarios por `case_id`.
- Agrupa gastos por `case_id`.
- Agrupa líneas por `invoice_id`.
- Agrupa facturas por `case_id`.
- Convierte cada fila de `cases` usando `rowToCase`.

## Flujo de listado

`CasesPage.tsx` obtiene `cases` desde `useApp()`.

La vista calcula:

- Búsqueda por:
  - `numero_caso`
  - `descripcion`
  - nombre de cliente
  - nombre de sociedad
  - `responsable`
  - `creado_por`

- Filtros rápidos:
  - `estado`
  - `prioridad`

- Filtros avanzados:
  - estado
  - prioridad urgente
  - fecha desde
  - fecha hasta

- KPIs:
  - total
  - pendientes
  - completados/facturados
  - urgentes

`CasesTable.tsx` recibe la lista filtrada, ordena localmente y pagina en bloques de 20 registros.

## Flujo de creación

La creación empieza en `NewCaseModal.tsx`.

1. El usuario elige tipo:
   - Persona Natural.
   - Persona Jurídica.

2. Si es persona natural:
   - Se selecciona un `client_id`.
   - No se asigna `society_id`.

3. Si es persona jurídica:
   - Se selecciona una sociedad.
   - El caso toma:
     - `society_id` = sociedad seleccionada.
     - `client_id` = cliente dueño de esa sociedad.

4. El usuario selecciona un ítem de servicio.
   - El caso guarda `service_item_id`.
   - También guarda `service_id` desde el ítem seleccionado.

5. Se calcula la etapa inicial.
   - Toma la primera etapa activa ordenada por `n_etapa`.

6. Se calcula el próximo `n_tarea`.
   - Actualmente se calcula en frontend con:

```text
max(cases.n_tarea) + 1
```

7. Se construye un `Case` con defaults:
   - `estado = Pendiente`
   - `prioridad = Media`
   - `prioridad_urgente = false`
   - `gastos_cotizados = 0`
   - `cliente_temporal = false`
   - `fecha_caso = hoy`
   - `created_at = ahora`
   - `comments = []`
   - `expenses = []`
   - `invoices = []`

8. `creado_por` toma el nombre del usuario autenticado:
   - Primero `user.nombre`.
   - Si no existe, el prefijo del correo.
   - Si no existe, `Usuario`.

9. `responsable` queda vacío. El responsable se define después con `Usuario Asignado`.

10. El modal llama `onCreated(newCase)`.
11. `CasesPage.tsx` pasa `addCase` como `onCreated`.

## Persistencia al crear

La función `addCase` vive en `AppContext.tsx`.

Flujo:

1. Inserta el caso inmediatamente en estado local:

```text
setCases(prev => [c, ...prev])
```

2. Actualiza la cache local para evitar que el caso desaparezca si hay refresh o falla temporal de red.
3. Si Supabase está disponible, ejecuta:

```text
db.insertCase(sb, c)
```

4. La llamada se envuelve en timeout de 30 segundos:

```text
withTimeout(..., 30_000, 'Crear caso (Supabase)')
```

5. Si Supabase devuelve error o timeout:
   - Muestra `toast.error`.
   - Quita el caso del estado local.
   - También lo elimina de la cache.

La función DB final es:

```text
insertCase -> sb.from('cases').insert(caseToRow(c))
```

## Mapeo entre app y Supabase

`caseToRow(c)` transforma el modelo frontend a fila de Supabase.

Puntos importantes:

- Convierte UUIDs vacíos o inválidos a `null` con `uuidOrNull`.
- Envía:
  - `client_id`
  - `society_id`
  - `service_id`
  - `service_item_id`
  - `etapa_id`
  - `usuario_asignado_id`
- Mantiene `etapa` como string, porque existe compatibilidad con una columna legacy no nula.
- Calcula:

```text
prioridad_urgente = prioridad === 'Urgente' || prioridad_urgente
```

- Normaliza `created_at` para que sea fecha ISO si venía como fecha simple.

`rowToCase(row, nest)` hace el camino inverso:

- Convierte números.
- Convierte `null` a `undefined` para campos opcionales.
- Deriva `prioridad_urgente`.
- Inserta `comments`, `expenses` e `invoices` ya agrupados.

## Flujo de edición

La edición ocurre en `EditCaseModal.tsx`.

Cuando se abre:

1. Copia `caseData` a estado local `form`.
2. Guarda el usuario asignado anterior en `prevUsuarioId`.
3. El usuario puede editar:
   - usuario asignado
   - etapa
   - estado
   - prioridad
   - fecha vencimiento
   - recurrencia
   - cliente o sociedad
   - ítem de servicio
   - descripción
   - gastos cotizados
   - cliente temporal

Cuando se guarda:

1. Valida que `usuario_asignado_id`, si existe, tenga formato UUID.
2. Construye un nuevo `Case` mezclando:
   - datos originales de `caseData`
   - cambios del formulario
3. Convierte `gastos_str` a número.
4. Deriva `prioridad_urgente`.
5. Llama `updateCase(updated)`.

## Persistencia al editar

`updateCase` vive en `AppContext.tsx`.

Flujo:

1. Busca el caso anterior para poder revertir si falla Supabase.
2. Actualiza el estado local de forma inmediata.
3. Si Supabase está disponible:

```text
db.updateCaseRow(sb, c)
```

4. Se envuelve en timeout de 30 segundos.
5. Si falla:
   - Muestra `toast.error`.
   - Revierte el caso al valor anterior.

La función DB final es:

```text
updateCaseRow -> sb.from('cases').update(caseToRow(c)).eq('id', c.id)
```

## Asignación de usuario y correo

La asignación de usuario ocurre en `EditCaseModal.tsx`.

Cuando cambia `usuario_asignado_id`:

1. Se guarda el usuario elegido en el formulario.
2. Si existe una etapa cuyo nombre contiene `asignac`, también cambia `etapa_id` a esa etapa.

Al guardar:

1. Se compara el nuevo `usuario_asignado_id` contra `prevUsuarioId`.
2. Si cambió y el usuario tiene `correo`, se hace `fetch` a:

```text
<VITE_SUPABASE_URL>/functions/v1/send-assignment-email
```

3. Se envía el header:

```text
x-ancori-secret: VITE_FUNCTION_SECRET
```

4. Se envía un body con:
   - `to`
   - `nombre`
   - `cliente`
   - `caso`
   - `estado`
   - `detalle`
   - `creado_por`
   - `asignado_a`
   - `enviado_por`

5. Si la llamada no lanza excepción, muestra `Correo enviado a ...`.

La Edge Function `send-assignment-email`:

- Lee secrets SMTP desde Supabase.
- Valida `x-ancori-secret` si `FUNCTION_SECRET` existe.
- Envía correo por SMTP usando `denomailer`.
- Responde `{ ok: true }` si el envío fue exitoso.

Secrets relevantes:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_TLS`
- `MAIL_FROM`
- `MAIL_CC`
- `FUNCTION_SECRET`

## Comentarios

Hay dos formas de agregar comentarios:

- Desde `EditCaseModal.tsx`.
- Desde `CommentsDrawer.tsx`.

Ambas terminan llamando `addComment(caseId, comment)` en `AppContext.tsx`.

Flujo de `addComment`:

1. Agrega el comentario al estado local del caso.
2. Inserta en Supabase:

```text
db.insertComment(sb, comment)
```

3. Si Supabase falla:
   - Muestra `toast.error`.
   - Remueve el comentario del estado local.

Tabla usada:

```text
case_comments
```

Campos:

- `id`
- `case_id`
- `user_name`
- `comentario`
- `created_at`

Nota importante: `CommentsDrawer.tsx` todavía construye comentarios con `user_name = 'Usuario Actual'`. En cambio, `EditCaseModal.tsx` usa `form.responsable || caseData.creado_por || 'Usuario'`. Si se quiere eliminar por completo el texto "Usuario Actual", hay que ajustar `CommentsDrawer.tsx` para leer `useAuth()` o el usuario real desde contexto.

## Gastos

Los gastos se manejan en `ExpensesModal.tsx`.

Cada línea de gasto tiene:

- `id`
- `case_id`
- `descripcion`
- `cantidad`
- `importe`
- `total`
- `fecha`

El total se calcula localmente:

```text
total = cantidad * importe
```

Al guardar:

1. `ExpensesModal` llama `updateExpenses(caseData.id, expenses)`.
2. `AppContext.tsx` actualiza el estado local.
3. Si Supabase está disponible, llama:

```text
db.replaceCaseExpenses(sb, caseId, expenses)
```

4. Esa función:
   - Borra todos los gastos del caso.
   - Inserta la lista completa actualizada.

Si falla:

- Muestra `toast.error`.
- Revierte los gastos anteriores en estado local.

Tabla usada:

```text
case_expenses
```

## Facturas vinculadas a casos

Las facturas se manejan desde `InvoiceModal.tsx`.

Desde un caso se puede:

- Ver facturas existentes del caso.
- Crear una factura nueva.
- Editar una factura existente.
- Enviar una factura a QuickBooks.

Estado global:

- `allInvoices`: lista plana de todas las facturas.
- `case.invoices`: facturas anidadas dentro de cada caso.

Al guardar:

1. `InvoiceModal` llama `saveInvoice(caseId, invoice, isEdit)`.
2. `AppContext.tsx` decide si insertar o actualizar:

```text
isEdit ? db.updateInvoice(sb, invoice) : db.insertInvoice(sb, invoice)
```

3. Usa timeout de 30 segundos.
4. Si Supabase responde bien:
   - Actualiza `allInvoices`.
   - Actualiza `case.invoices`.

Tablas usadas:

- `case_invoices`
- `invoice_lines`

Al insertar factura:

1. Inserta cabecera en `case_invoices`.
2. Inserta líneas en `invoice_lines`.
3. Si fallan las líneas, borra la cabecera para evitar factura incompleta.

Al actualizar factura:

1. Actualiza cabecera en `case_invoices`.
2. Borra líneas anteriores.
3. Inserta líneas nuevas.

## Eliminación de casos

La eliminación empieza en `CasesPage.tsx`.

1. Muestra confirmación nativa:

```text
¿Está seguro de eliminar este caso?
```

2. Si el usuario confirma, llama `removeCase(id)`.

`removeCase` en `AppContext.tsx`:

1. Quita el caso del estado local.
2. Si Supabase está disponible, llama:

```text
db.deleteCaseRow(sb, id)
```

3. Si Supabase falla:
   - Muestra `toast.error`.
   - Restaura el caso eliminado al estado local.

La función DB final es:

```text
deleteCaseRow -> sb.from('cases').delete().eq('id', id)
```

## Dependencias de catálogos

Un caso no vive aislado. Para mostrarse correctamente depende de:

- `clients`
  - Para mostrar nombre del cliente.

- `societies`
  - Para casos de persona jurídica.
  - Una sociedad aporta su `client_id`.

- `services`
  - Servicio padre.
  - También se usa para facturación.

- `service_items`
  - Ítem específico elegido al crear o editar el caso.

- `etapas`
  - Etapa inicial.
  - Etapa de asignación de abogado/usuario.

- `usuarios`
  - Usuarios asignables.
  - Nombre visible del responsable.
  - Correo para notificación.

- `invoice_terms`
  - Términos de vencimiento de facturas.

- `qb_items`
  - Ítems de QuickBooks usados al facturar.

## Reglas de negocio actuales

- Todo caso nuevo inicia como `Pendiente`.
- Todo caso nuevo inicia con prioridad `Media`.
- Si se marca prioridad `Urgente`, también se mantiene `prioridad_urgente = true`.
- Si se crea para sociedad, el `client_id` se toma desde la sociedad.
- Si se cambia la sociedad en edición, también se actualiza `client_id` al cliente de esa sociedad.
- Si se asigna un usuario, puede cambiar automáticamente la etapa a una etapa que contenga `asignac`.
- El correo se envía solo cuando cambia el usuario asignado y el usuario tiene correo.
- Las facturas se guardan separadas del caso pero vinculadas por `case_id`.
- Los comentarios y gastos se guardan en tablas hijas.

## Manejo de errores

El módulo usa una mezcla de actualización optimista y reversión:

- Crear caso:
  - Se agrega local/cache primero.
  - Si falla Supabase, se elimina local/cache.

- Editar caso:
  - Se actualiza local primero.
  - Si falla Supabase, se restaura el valor anterior.

- Comentarios:
  - Se agrega local primero.
  - Si falla Supabase, se remueve el comentario.

- Gastos:
  - Se reemplazan local primero.
  - Si falla Supabase, se restauran los gastos anteriores.

- Eliminar caso:
  - Se elimina local primero.
  - Si falla Supabase, se restaura.

Timeouts actuales:

- Crear caso: 30 segundos.
- Actualizar caso: 30 segundos.
- Guardar factura: 30 segundos.

## Riesgos técnicos actuales

- `n_tarea` se calcula en frontend con `max + 1`. Si dos usuarios crean casos al mismo tiempo, puede haber duplicados o saltos si la base no tiene una protección adecuada.
- `addCase` no espera a que Supabase confirme antes de cerrar el modal. Si Supabase falla, el caso aparece brevemente y luego se revierte.
- La edición usa actualización optimista. Si hay timeout, puede existir ambigüedad: el servidor pudo haber guardado pero la UI revierte por timeout.
- `CommentsDrawer.tsx` aún usa `Usuario Actual` como nombre del comentario.
- El correo de asignación no valida explícitamente `response.ok`; si la función responde 500 pero `fetch` no lanza excepción, la UI podría mostrar éxito aunque el correo haya fallado.
- `removeCase` depende de que la base permita borrar el caso. Si hay FKs restrictivas con comentarios, gastos o facturas, la eliminación puede fallar.
- `replaceCaseExpenses` borra e inserta todo. Si el delete funciona y el insert falla, puede perder gastos en base aunque la UI intente revertir localmente.

## Diagnóstico rápido si algo falla

Si un caso no aparece:

1. Revisar tabla `cases` en Supabase.
2. Confirmar que el usuario puede leer esa fila según RLS.
3. Revisar si la app está mostrando cache vieja por usuario.
4. Revisar `localStorage` con key `ancori_app_cache_v1:<user id>`.
5. Revisar consola por `Timeout (30000 ms): Crear caso (Supabase)` o `Actualizar caso (Supabase)`.

Si el caso aparece para un usuario y para otro no:

1. Revisar RLS de `cases`.
2. Revisar si la app está usando diferentes sesiones.
3. Revisar cache por usuario.
4. Confirmar que `loadAllFromSupabase` no esté devolviendo advertencia en `cases`.

Si no se envía correo:

1. Revisar `usuarios.correo`.
2. Revisar `VITE_FUNCTION_SECRET` en frontend.
3. Revisar `FUNCTION_SECRET` en Supabase.
4. Revisar secrets SMTP en Supabase.
5. Revisar logs de `send-assignment-email`.
6. Validar que el usuario asignado realmente cambió.

Si comentarios salen como "Usuario Actual":

1. Revisar si el comentario se creó desde `CommentsDrawer.tsx`.
2. Cambiar ese componente para usar `useAuth()` y tomar `user.nombre`.

## Resumen del flujo completo

```text
CasesPage
  ├─ NewCaseModal
  │   └─ addCase
  │       └─ insertCase
  │           └─ cases
  │
  ├─ EditCaseModal
  │   ├─ updateCase
  │   │   └─ updateCaseRow
  │   │       └─ cases
  │   ├─ addComment
  │   │   └─ insertComment
  │   │       └─ case_comments
  │   ├─ saveSociety
  │   │   └─ societies
  │   └─ send-assignment-email
  │       └─ SMTP
  │
  ├─ CommentsDrawer
  │   └─ addComment
  │       └─ case_comments
  │
  ├─ ExpensesModal
  │   └─ updateExpenses
  │       └─ replaceCaseExpenses
  │           └─ case_expenses
  │
  ├─ InvoiceModal
  │   ├─ saveInvoice
  │   │   ├─ case_invoices
  │   │   └─ invoice_lines
  │   └─ QuickBooks invoice functions
  │
  └─ removeCase
      └─ deleteCaseRow
          └─ cases
```

