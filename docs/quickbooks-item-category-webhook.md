# QuickBooks: categorías vía webhook e Item API (`Type: Category`)

## Objetivo: lo creado/editado/eliminado en QBO se refleja en la app

Modelo acordado (empezamos por **categorías**; otras entidades pueden seguir el mismo patrón):

1. **Webhook** — Intuit avisa que hubo un cambio (entidad **Item**, operación **Create** / **Update** / **Merge** / **Delete** / **Void**, más el **Id** del registro en QBO).
2. **Token** — La Edge Function obtiene un `access_token` válido (`qbo_oauth_tokens` + refresh si hace falta).
3. **Consulta a la API por Id** — Para **alta o edición**, se hace **GET** `.../v3/company/{realmId}/item/{Id}` y se usa la respuesta como fuente de verdad.
4. **Extraer y filtrar** — Del JSON se toman `Name` / `FullyQualifiedName`, `Id`, `Active` y se comprueba **`Type === "Category"`**. Si no es categoría, no se escribe en `public.categories`.
5. **Persistir** — Insert o update en **`public.categories`** (`nombre`, `id_qb`, `activo`). La app **Utilidades → Categorías** lee esa tabla.

**Baja en QBO:** en **Delete / Void** no conviene hacer GET (el item puede ya no existir). Se usa el **Id del propio webhook** para marcar en la app `activo: false` en la fila con ese `id_qb`.

---

En QuickBooks Online, las **categorías** de productos/servicios **no son un endpoint aparte**: son registros **Item** cuyo campo **`Type`** vale **`Category`**. La documentación oficial lo describe en la respuesta del recurso Item (ejemplo con `"Type": "Category"`).

Requisito en la compañía: la función de categorías debe estar habilitada; en la API se puede comprobar el flag `CompanyInfo` / `NameValue` relacionado con categorías de items (`ItemCategoriesFeature`), según la guía de Intuit.

---

## Flujo equivalente a Power Automate (token → HTTP → JSON → app)

Este repositorio implementa el mismo patrón que un flujo tipo **Power Automate**, pero en **una sola Edge Function** `qbo-webhook`:

| Paso en automatización | Implementación aquí |
|------------------------|---------------------|
| Disparador: webhook Intuit (`name` = **Item**, `operation` = **Create** / **Update** / etc.) | Intuit envía POST firmado a `qbo-webhook`; el cuerpo incluye `eventNotifications[].dataChangeEvent.entities[]` con `name` y `operation`. |
| **Obtener token** | `getValidQboAccessToken()` (OAuth ya guardado en `qbo_oauth_tokens`; refresh si hace falta). Equivale a tu paso “ObtenerToken” / proxy tipo `get-token`. |
| **HTTP GET** `.../v3/company/{realmId}/item/{Id}` | `qboGetItem()` en `_shared/qbo-items.ts` (misma idea que tu URI con `Bearer` + `Accept: application/json`). |
| **Parse JSON** | Respuesta JSON de QBO; se lee `Item.Type`, `Item.Name`, `Item.Id`, `Item.Active`. |
| **Filtrar solo categorías** | Si `Item.Type !== "Category"`, no se toca `public.categories` (se deja constancia en `processed` como `skip_item_not_category:...`). |
| **Cargar en la app** | **Insert** o **update** en `public.categories` (`nombre`, `id_qb` = Id numérico de QBO, `activo`). No hace falta SharePoint: la app lee Supabase. |

### Por operación (resumen)

| Operación en el webhook (Item) | ¿GET a la API? | Qué hace la app |
|--------------------------------|----------------|-----------------|
| **Create**, **Update**, **Merge**, (vacío) | **Sí** — `GET /item/{id}` | Si `Type === "Category"` → insert o update en `categories`. |
| **Delete**, **Void** | **No** — solo Id del evento | `UPDATE categories SET activo = false WHERE id_qb = …` |

Código: `processItemCategoryFromWebhook` en `supabase/functions/qbo-webhook/index.ts` y `qboGetItem` en `_shared/qbo-items.ts`.

---

## Condición “solo categoría”

- En Power Automate a veces se filtra por `name = Item` y `operation = Create`.
- Aquí, además, **siempre** se llama a la API y se exige **`Type === "Category"`** antes de escribir en `categories`. Así los Items de tipo `Service`, `Inventory`, etc. **no** generan filas en Utilidades → Categorías.

---

## Configuración en Intuit Developer

1. Misma URL de webhook que para Customer:  
   `https://<REF>.supabase.co/functions/v1/qbo-webhook?apikey=<ANON_KEY>`
2. **Verifier token** → secret `INTUIT_WEBHOOK_VERIFIER_TOKEN`.
3. Suscripción de entidad **Item** (crear, actualizar, borrar/anular según el portal), además de **Customer** si usas sociedades.
4. Si activaste el formato **CloudEvents** en el portal, `qbo-webhook` ya lo interpreta (`qbo.item.created.v1`, etc.); si sigues en formato clásico, también.

---

## Respuesta de `qbo-webhook`

El cuerpo JSON de respuesta incluye arrays `processed` y `errors`. Ejemplos de entradas útiles para categorías:

- `category_create:<id>` — categoría nueva en `categories`.
- `category_update:<id>` — categoría existente actualizada.
- `category_deactivate:<id>` — webhook de baja; fila desactivada.
- `skip_item_not_category:<id>:<tipo>` — Item que no es categoría (ignorado a propósito).

---

## Ver también

- [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md) — URL, secretos, Customer + Item.
- [quickbooks-endpoints.md](./quickbooks-endpoints.md) — función `qbo-webhook`.
