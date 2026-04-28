# Lógica de Facturas Desde Casos

Este documento explica cómo funciona el flujo de **facturas abiertas desde un caso**: qué archivos participan, cómo se construye una factura, cómo se guarda en Supabase, cómo queda vinculada al caso y cómo se envía a QuickBooks.

## Objetivo del flujo

Desde la pantalla de casos, el usuario puede:

- Abrir las facturas asociadas a un caso.
- Ver facturas ya existentes de ese caso.
- Crear una factura nueva vinculada al caso.
- Editar una factura existente.
- Guardar una factura como borrador.
- Enviar una factura a QuickBooks.
- Mantener sincronizados estado, número QuickBooks, saldo y errores.

## Archivos principales

- `src/pages/CasesPage.tsx`
  - Abre el modal de facturas desde la tabla de casos.
  - Mantiene `invoiceCase` como el caso seleccionado.
  - Renderiza `InvoiceModal` con `caseData`.

- `src/components/cases/CasesTable.tsx`
  - Muestra el botón de facturas por cada caso.
  - Al hacer click llama `onOpenInvoice(c)`.

- `src/components/cases/InvoiceModal.tsx`
  - Contiene la UI completa de facturas desde casos.
  - Lista facturas ya vinculadas al caso.
  - Crea/edita facturas.
  - Calcula subtotal, ITBMS y total.
  - Guarda en Supabase mediante `saveInvoice`.
  - Envía a QuickBooks mediante `postQboCreateInvoice`.

- `src/context/AppContext.tsx`
  - Expone:
    - `saveInvoice(caseId, invoice, isEdit)`
    - `patchInvoice(invoiceId, patch)`
    - `deleteInvoice(caseId, invoiceId)`
  - Mantiene `allInvoices`.
  - Mantiene facturas anidadas dentro de cada `case.invoices`.

- `src/lib/supabaseDb.ts`
  - Convierte facturas entre frontend y Supabase.
  - Inserta/actualiza/elimina en:
    - `case_invoices`
    - `invoice_lines`

- `src/lib/qboCreateInvoiceFetch.ts`
  - Hace `POST` a la Edge Function `qbo-create-invoice`.
  - Maneja timeout de 120 segundos.
  - Parseo defensivo de respuesta JSON.

- `supabase/functions/qbo-create-invoice/index.ts`
  - Edge Function que crea la factura en QuickBooks.
  - Lee la factura y sus líneas desde Supabase.
  - Resuelve cliente/sociedad QuickBooks.
  - Resuelve impuestos/TaxCode.
  - Envía la factura a QBO.
  - Actualiza `case_invoices` con estado final.

- `src/pages/FacturasPage.tsx`
  - No es el flujo principal desde casos, pero reutiliza facturas globales.
  - Permite reenviar a QuickBooks, ver PDF, eliminar y revisar facturas desde la vista general.

## Modelo frontend

La interfaz principal es `CaseInvoice` en `src/data/mockData.ts`.

Campos principales:

- `id`: UUID de la factura en la app.
- `case_id`: caso al que pertenece la factura.
- `client_id`: cliente facturado.
- `society_id`: sociedad facturada, si aplica.
- `term_id`: término de factura.
- `fecha_factura`: fecha de emisión.
- `fecha_vencimiento`: fecha de vencimiento.
- `subtotal`: suma de importes sin impuesto.
- `impuesto`: suma de ITBMS.
- `total`: subtotal + impuesto.
- `estado`: `borrador`, `pendiente`, `enviada`, `error` o `anulada`.
- `qb_invoice_id`: ID de factura en QuickBooks.
- `numero_factura`: número visible de factura.
- `nota_cliente`: nota/memo para cliente.
- `error_detalle`: último error al enviar/sincronizar.
- `qb_total`: total reportado por QuickBooks.
- `qb_balance`: saldo reportado por QuickBooks.
- `qb_last_sync_at`: última sincronización con QBO.
- `pdf_path`, `pdf_url_signed_last`, `pdf_synced_at`, `pdf_status`: datos de PDF si se sincroniza desde QBO.
- `lines`: líneas de factura.

Cada línea usa `InvoiceLine`:

- `id`
- `invoice_id`
- `servicio_id`
- `qb_item_id`
- `descripcion`
- `cantidad`
- `tarifa`
- `importe`
- `itbms`
- `categoria`

## Tablas de Supabase

El flujo usa dos tablas principales:

- `case_invoices`
  - Cabecera de factura.
  - Guarda caso, cliente, sociedad, fechas, totales, estado y campos QuickBooks.

- `invoice_lines`
  - Líneas de factura.
  - Guarda descripción, cantidad, tarifa, ITBMS, categoría, servicio y producto QuickBooks.

También depende de:

- `cases`
- `clients`
- `societies`
- `invoice_terms`
- `qb_items`
- `services`

## Apertura desde casos

En `CasesPage.tsx`, cuando el usuario pulsa el botón de facturas en una fila:

```text
onOpenInvoice(c) -> setInvoiceCase(c)
```

Luego se renderiza:

```text
<InvoiceModal caseData={currentInvoiceCase} open={!!invoiceCase} />
```

`currentInvoiceCase` se obtiene desde el estado global actualizado:

```text
cases.find(c => c.id === invoiceCase.id) ?? invoiceCase
```

Esto permite que si una factura se guarda o se actualiza, el modal vea datos recientes del caso.

## Pantalla inicial del modal

`InvoiceModal` tiene dos modos internos:

- `pick`
  - Se muestra cuando el caso ya tiene facturas.
  - Lista las facturas del caso.
  - Permite editar una existente o crear una nueva.

- `form`
  - Formulario de crear/editar factura.

Cuando se abre desde casos:

1. Busca facturas en `allInvoices` con:

```text
invoice.case_id === caseData.id
```

2. Si hay facturas existentes, abre en modo `pick`.
3. Si no hay facturas, abre directo el formulario.

## Crear una factura nueva

Cuando se abre una factura nueva:

- `billToSociety` inicia en `true` si el caso tiene `society_id`.
- `fechaFactura` inicia con la fecha de hoy.
- `fechaVencimiento` inicia vacío.
- `estado` inicia como `borrador`.
- `numeroFactura` inicia vacío.
- `notaCliente` inicia vacío.
- `lines` inicia con una línea base.

La línea base se crea con `newLine(services)`:

- `cantidad = 1`
- `tarifa = 0`
- `importe = 0`
- `itbms = 7`
- `categoria = honorarios`
- `servicio_id` intenta tomar el servicio activo clasificado como honorarios.

Si el caso tiene `service_id`, la primera línea usa el nombre del servicio como descripción inicial.

## Editar una factura existente

Si se edita una factura:

- El modal carga `term_id`, fechas, estado, número, nota y líneas.
- Las líneas pasan por `normalizeInvoiceLines`.

`normalizeInvoiceLines` evita errores si una factura vieja o un patch dejó líneas incompletas:

- Asegura `id`.
- Convierte `cantidad`, `tarifa`, `importe` a números.
- Determina `categoria`.
- Asigna `itbms`:
  - honorarios -> 7
  - gastos -> 0
- Reasigna `servicio_id` a honorarios/gastos cuando corresponde.

## Cálculo de totales

Los totales se calculan en frontend:

```text
subtotal = suma(line.importe)
impuesto = suma(line.importe * line.itbms / 100)
total = subtotal + impuesto
```

Cada línea recalcula `importe` cuando cambia:

```text
importe = cantidad * tarifa
```

## Términos y vencimiento

Cuando se selecciona `term_id`:

1. Busca el término en `invoiceTerms`.
2. Toma `dias_vencimiento`.
3. Calcula:

```text
fecha_vencimiento = fecha_factura + dias_vencimiento
```

## Facturar a cliente o sociedad

La factura siempre tiene `client_id` del caso.

Si `billToSociety` está activo y el caso tiene sociedad:

```text
society_id = caseData.society_id
```

Si no:

```text
society_id = undefined
```

Esto es importante para QuickBooks, porque `qbo-create-invoice` primero intenta usar el Customer de la sociedad y si no existe usa el cliente.

## Construcción de la factura

`buildInvoice()` crea el objeto `CaseInvoice`.

Incluye:

- `id`
- `case_id`
- `client_id`
- `society_id`
- `term_id`
- fechas
- totales
- estado
- campos QuickBooks existentes si es edición
- líneas con descripción no vacía

Las líneas vacías se filtran:

```text
lines.filter(l => descripcion.trim())
```

## Guardar borrador

`handleSave()` hace:

1. Valida fechas.
2. Valida que exista al menos una línea con descripción.
3. Activa `saving`.
4. Construye la factura.
5. Ejecuta:

```text
saveInvoice(caseData.id, inv, isEdit)
```

6. Usa `Promise.race` con 30 segundos.
7. Tiene watchdog visual de 35 segundos.
8. Si guarda bien, muestra toast y cierra modal.

## Persistencia en AppContext

`saveInvoice` en `AppContext.tsx`:

1. Si Supabase está configurado:

```text
isEdit ? db.updateInvoice(sb, invoice) : db.insertInvoice(sb, invoice)
```

2. Envuelve la operación en timeout de 30 segundos.
3. Si Supabase falla, muestra error y devuelve `false`.
4. Si Supabase confirma:
   - Actualiza `allInvoices`.
   - Actualiza `case.invoices`.

Para crear:

```text
allInvoices = [...prev, invoice]
case.invoices = [...case.invoices, invoice]
```

Para editar:

```text
map(invoice.id)
```

## Insert en Supabase

`insertInvoice` en `supabaseDb.ts`:

1. Inserta cabecera:

```text
case_invoices.insert(invoiceToRow(inv))
```

2. Si hay líneas:

```text
invoice_lines.insert(lines.map(lineToRow))
```

3. Si fallan las líneas, borra la cabecera recién creada:

```text
case_invoices.delete().eq('id', inv.id)
```

Esto evita facturas con cabecera sin líneas.

## Update en Supabase

`updateInvoice`:

1. Actualiza cabecera en `case_invoices`.
2. Borra líneas anteriores:

```text
invoice_lines.delete().eq('invoice_id', inv.id)
```

3. Inserta líneas nuevas.

Este modelo reemplaza todas las líneas en cada edición.

## Enviar a QuickBooks

`handleSendToQB()` en `InvoiceModal.tsx`:

1. Valida fechas.
2. Valida que exista al menos una línea.
3. Si alguna línea no tiene `qb_item_id`, pide confirmación.
4. Valida:
   - `VITE_SUPABASE_URL`
   - `VITE_FUNCTION_SECRET`
5. Construye factura con `estado = pendiente`.
6. Guarda primero en Supabase con `saveInvoice`.
7. Si guarda bien, llama:

```text
postQboCreateInvoice(SUPABASE_URL, FUNCTION_SECRET, inv.id)
```

8. Si QuickBooks falla:
   - `patchInvoice(inv.id, { estado: 'error', error_detalle })`
   - muestra warning.

9. Si QuickBooks responde bien:
   - `estado = enviada`
   - guarda `qb_invoice_id`
   - guarda `numero_factura`
   - limpia `error_detalle`
   - guarda `qb_total`
   - guarda `qb_balance`
   - guarda `qb_last_sync_at`

## Cliente fetch para QBO

`postQboCreateInvoice`:

- Hace `POST` a:

```text
<SUPABASE_URL>/functions/v1/qbo-create-invoice
```

- Header:

```text
x-ancori-secret: FUNCTION_SECRET
```

- Body:

```json
{ "invoice_id": "<id>" }
```

- Timeout:

```text
120000 ms
```

- Si la respuesta no es JSON, devuelve `detail` con el texto parcial.

## Edge Function qbo-create-invoice

La función:

1. Valida método `POST`.
2. Valida `x-ancori-secret`.
3. Valida env:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `QBO_CLIENT_ID`
   - `QBO_CLIENT_SECRET`
4. Lee `invoice_id` del body.
5. Carga factura desde `case_invoices`.
6. Carga líneas desde `invoice_lines` con relación a `qb_items`.
7. Resuelve Customer QBO:
   - si hay `society_id`, busca `societies.quickbooks_customer_id` o `id_qb`.
   - si no encuentra, busca `clients.quickbooks_customer_id`.
8. Valida que exista Customer QBO.
9. Valida que líneas con descripción tengan `qb_item_id`.
10. Obtiene token QBO con `getValidQboAccessToken`.
11. Resuelve TaxCodes activos.
12. Construye payload de factura QBO.
13. Envía a QuickBooks.
14. Actualiza `case_invoices`.
15. Devuelve datos QBO a frontend.

## Impuestos QuickBooks

La función usa:

```text
GlobalTaxCalculation = TaxExcluded
```

Cada línea manda:

```text
TaxCodeRef = taxableId si itbms > 0
TaxCodeRef = exemptId si itbms = 0
```

TaxCodes se resuelven así:

- Primero por secrets:
  - `QBO_TAX_CODE_LINE_TAXABLE`
  - `QBO_TAX_CODE_LINE_EXEMPT`

- Si no existen, intenta inferir por:
  - `Taxable`
  - nombre/descripcion
  - ITBMS
  - 7%
  - exento / exempt / 0%

Opcional:

- `QBO_INVOICE_TXN_TAX_DETAIL=true`
  - Activa envío de `TxnTaxDetail`.
  - Requiere resolver `TaxRate`.
  - Puede usar `QBO_TAX_RATE_ITBMS`.

## Número de factura

Por defecto:

```text
QBO_INVOICE_USE_QBO_AUTONUMBER = true
```

Esto significa:

- No se envía `DocNumber`.
- QuickBooks asigna el siguiente correlativo.
- El número devuelto se guarda en `case_invoices.numero_factura`.

Si se configura en `false`:

- La app puede enviar `numero_factura` como `DocNumber`.

## Estados de factura

Estados posibles:

- `borrador`
  - Guardada en Supabase, no enviada a QBO.

- `pendiente`
  - Se está preparando o intentando envío a QBO.

- `enviada`
  - QuickBooks creó la factura correctamente.

- `error`
  - Falló validación, API QBO, token, impuestos o actualización posterior.

- `anulada`
  - Estado disponible en modelo para facturas anuladas.

## Manejo de errores QBO

La Edge Function persiste errores usando `persistInvoiceError`.

Actualiza:

```text
estado = error
error_detalle = detalle del error
```

Errores principales:

- `invoice_not_found`
- `no_qb_customer`
- `no_qb_item_line`
- `qbo_token`
- `qbo_tax_config`
- `qbo_tax_rate_config`
- `no_lines`
- `qbo_api_error`
- `qbo_timeout`
- `qbo_fetch_error`
- `db_update_failed`

El frontend, al recibir error, también hace `patchInvoice` para reflejar estado/error en UI.

## patchInvoice

`patchInvoice(invoiceId, patch)` actualiza solo campos puntuales:

- En `allInvoices`.
- En `case.invoices`.

Se usa después de enviar a QuickBooks para aplicar:

- `estado`
- `qb_invoice_id`
- `numero_factura`
- `error_detalle`
- `qb_total`
- `qb_balance`
- `qb_last_sync_at`

No hace llamada directa a Supabase; se usa para reflejar en frontend lo que ya actualizó la Edge Function o para marcar error localmente.

## Eliminar factura

La eliminación vive en `deleteInvoice`:

1. Si Supabase está configurado:

```text
db.deleteInvoiceRow(sb, invoiceId)
```

2. Si no hay error:
   - remueve de `allInvoices`
   - remueve de `case.invoices`

`deleteInvoiceRow` borra en:

```text
case_invoices.delete().eq('id', invoiceId)
```

La eliminación de líneas depende de la FK/cascade en base de datos.

## PDF de factura

Desde `FacturasPage.tsx`, si la factura ya tiene `qb_invoice_id`, se puede llamar:

```text
qbo-invoice-pdf-sync
```

Esto no ocurre directamente en `InvoiceModal` desde casos, pero usa la misma factura.

Si responde bien:

- abre `signed_url`
- actualiza:
  - `pdf_status = ok`
  - `pdf_path`
  - `pdf_synced_at`

Si falla:

- `pdf_status = error`

## Dependencias de configuración

Frontend:

- `VITE_SUPABASE_URL`
- `VITE_FUNCTION_SECRET`

Edge Function:

- `FUNCTION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QBO_CLIENT_ID`
- `QBO_CLIENT_SECRET`
- `QBO_API_BASE`
- `QBO_FETCH_TIMEOUT_MS`
- `QBO_TAX_CODE_LINE_TAXABLE`
- `QBO_TAX_CODE_LINE_EXEMPT`
- `QBO_TAX_RATE_ITBMS`
- `QBO_INVOICE_TXN_TAX_DETAIL`
- `QBO_INVOICE_USE_QBO_AUTONUMBER`

## Riesgos técnicos actuales

- `handleSave` usa timeout visual y `Promise.race`; si Supabase tarda más de 30 segundos, puede quedar ambigüedad sobre si guardó o no.
- `updateInvoice` borra todas las líneas y luego inserta nuevas. Si el delete funciona y el insert falla, puede quedar factura sin líneas.
- `patchInvoice` no persiste por sí mismo; asume que la Edge Function ya actualizó Supabase o que se requiere reflejo local inmediato.
- Si una línea no tiene `qb_item_id`, el frontend permite continuar con confirmación, pero la Edge Function puede rechazar con `no_qb_item_line`.
- Si la sociedad y cliente no tienen `quickbooks_customer_id`, QBO rechaza el envío con `no_qb_customer`.
- Si los TaxCodes de QBO no se pueden resolver, el envío falla con `qbo_tax_config`.
- Si QuickBooks asigna correlativo automáticamente, el número real de factura solo se conoce después del envío.

## Flujo resumido

```text
CasesTable
  └─ onOpenInvoice(case)
      └─ CasesPage.invoiceCase
          └─ InvoiceModal(caseData)
              ├─ Lista facturas del caso desde allInvoices
              ├─ Nueva / Editar factura
              │   ├─ buildInvoice()
              │   └─ saveInvoice()
              │       ├─ insertInvoice / updateInvoice
              │       ├─ case_invoices
              │       └─ invoice_lines
              └─ Enviar a QuickBooks
                  ├─ saveInvoice(estado pendiente)
                  ├─ postQboCreateInvoice()
                  └─ qbo-create-invoice
                      ├─ lee case_invoices + invoice_lines
                      ├─ resuelve Customer QBO
                      ├─ resuelve TaxCode / TaxRate
                      ├─ POST /invoice QuickBooks
                      └─ actualiza case_invoices
```

