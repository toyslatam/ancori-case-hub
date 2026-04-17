# Endpoints QuickBooks (Supabase Edge Functions)

Base URL (sustituye `<REF>` por el **Reference ID** del proyecto):

```text
https://<REF>.supabase.co/functions/v1/<NOMBRE_FUNCION>
```

En todas las llamadas desde cliente o automatización suele hacer falta la cabecera:

```http
apikey: <SUPABASE_ANON_KEY>
```

(`anon` es la clave pública del proyecto: **Settings → API**.)

---

## 1. `qbo-oauth-start` — Iniciar OAuth (GET)

Redirige al usuario a Intuit para consentimiento.

| | |
|--|--|
| **Método** | `GET` |
| **Query** | `apikey=<anon>` (obligatorio en muchos clientes), `redirect_to=<URL codificada>` (origen permitido en `QBO_ALLOWED_REDIRECT_PREFIXES`) |
| **Auth** | No JWT; solo `apikey` |

**Ejemplo (navegador):** la app arma la URL en **Configuración → Conectar QuickBooks** (`src/lib/qboIntegration.ts`).

---

## 2. `qbo-oauth-callback` — Callback OAuth (GET)

La llama **Intuit** tras el login; no la invoques a mano salvo pruebas.

| | |
|--|--|
| **Método** | `GET` |
| **Query** | `code`, `realmId`, `state` (u `error` si el usuario canceló) |

**Redirect URI** en Intuit debe coincidir exactamente con esta función.

---

## 3. `qbo-oauth-refresh` — Renovar access token (POST)

| | |
|--|--|
| **Método** | `POST` |
| **Headers** | `Authorization: Bearer <QBO_CRON_SECRET>` **o** `x-qbo-cron-secret: <QBO_CRON_SECRET>`, `apikey: <anon>` |
| **Body** | Vacío |

**Ejemplo `curl`:**

```bash
curl -sS -X POST "https://<REF>.supabase.co/functions/v1/qbo-oauth-refresh" \
  -H "Authorization: Bearer <QBO_CRON_SECRET>" \
  -H "apikey: <SUPABASE_ANON_KEY>"
```

Respuesta típica: `200` con `refreshed`, `skipped` o error JSON.

---

## 4. `qbo-oauth-status` — Estado de conexión (GET)

| | |
|--|--|
| **Método** | `GET` |
| **Query** | `apikey=<anon>` |
| **Body** | — |

**Respuesta `200`:** `{ "connected": boolean, "realm_id": string | null, "access_expires_at": string | null }`  
(No devuelve tokens.)

---

## 5. `qbo-sync-societies` — Sincronizar sociedades ↔ Customer QBO (POST)

| | |
|--|--|
| **Método** | `POST` |
| **Headers** | Igual que refresh: `Authorization: Bearer <QBO_CRON_SECRET>` (o `x-qbo-cron-secret`), `apikey: <anon>`, `Content-Type: application/json` si mandas body |
| **Body JSON (opcional)** | `{ "mode": "from_qb" \| "to_qb" \| "both" }` — por defecto `"from_qb"` |

### Modos

| `mode` | Comportamiento |
|--------|----------------|
| `from_qb` | Descarga **Customer** de QBO y actualiza `societies.quickbooks_customer_id` si coincide por Id existente, `id_qb`, o nombre / razón social normalizado. |
| `to_qb` | Crea **Customer** en QBO para sociedades **activas** sin `quickbooks_customer_id` y guarda el Id devuelto. |
| `both` | Ejecuta primero la lógica `from_qb` y luego `to_qb`. |

**Ejemplo `curl` (solo enlazar desde QBO):**

```bash
curl -sS -X POST "https://<REF>.supabase.co/functions/v1/qbo-sync-societies" \
  -H "Authorization: Bearer <QBO_CRON_SECRET>" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"from_qb\"}"
```

**Sandbox QBO:** en Supabase **Secrets**, opcional `QBO_API_BASE=https://sandbox-quickbooks.api.intuit.com` (por defecto se usa producción).

---

## 6. `qbo-society-push` — Empujar sociedad a QBO al guardar/borrar (POST)

Usada desde la app al persistir una sociedad o antes de eliminarla en base de datos.

| | |
|--|--|
| **Método** | `POST` |
| **Headers** | `apikey: <anon>`, `Content-Type: application/json`, y una de: `Authorization: Bearer <QBO_CRON_SECRET>` **o** `Authorization: Bearer <QBO_SOCIETY_PUSH_SECRET>` **o** `x-qbo-society-push-secret: <mismo valor>` |
| **Body** | Ver abajo |

### `operation: upsert`

Crea **Customer** en QBO si la sociedad no tiene `quickbooks_customer_id`, o hace **sparse update** si ya tiene Id. Actualiza `societies.quickbooks_customer_id` en Supabase cuando crea el Customer.

```json
{
  "operation": "upsert",
  "society": {
    "id": "uuid-local",
    "nombre": "Nombre corto",
    "razon_social": "Razón social S.L.",
    "correo": "contacto@empresa.com",
    "activo": true,
    "quickbooks_customer_id": null
  }
}
```

### `operation: delete`

Desactiva el Customer en QBO (`Active: false`). No borra la fila en la app; eso lo hace el cliente tras esta llamada.

```json
{
  "operation": "delete",
  "quickbooks_customer_id": "123"
}
```

**Ejemplo `curl`:**

```bash
curl -sS -X POST "https://<REF>.supabase.co/functions/v1/qbo-society-push" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -H "x-qbo-society-push-secret: <QBO_SOCIETY_PUSH_SECRET>" \
  -d "{\"operation\":\"upsert\",\"society\":{\"id\":\"...\",\"nombre\":\"Demo\",\"activo\":true}}"
```

---

## 7. `qbo-create-invoice` — Crear factura en QBO desde Supabase (POST)

Crea un **Invoice** en QuickBooks a partir de `case_invoices` + `invoice_lines`, y actualiza la fila con `qb_invoice_id`, `estado = enviada`, totales QBO y trazabilidad. Si falla la validación o la API de QBO, persiste `estado = error` y `error_detalle`.

| | |
|--|--|
| **Método** | `POST` |
| **Headers** | `Content-Type: application/json`, `x-ancori-secret: <FUNCTION_SECRET>` (mismo valor que en la app `VITE_FUNCTION_SECRET`) |
| **Body** | `{ "invoice_id": "<uuid>" }` |

**Respuesta `200` (éxito):** `ok`, `qb_invoice_id`, `doc_number`, `txn_date`, `due_date`, `total_amt`, `balance`.

**Impuestos (ITBMS / error QBO 6000):** Cada línea envía `SalesItemLineDetail.TaxCodeRef` con el **Id real** de un `TaxCode` activo en la compañía de QBO (no se usan los literales `TAX`/`NON`, que en muchas compañías fuera de EE.UU. provocan *“todas las transacciones deben tener una tasa impositiva a las ventas”*). La función consulta `SELECT * FROM TaxCode WHERE Active = true` e infiere códigos **gravado** vs **exento** por el campo `Taxable` y por nombre (exento, ITBMS, etc.). Si la inferencia falla, configura en Supabase (secretos de la función) **`QBO_TAX_CODE_LINE_TAXABLE`** y **`QBO_TAX_CODE_LINE_EXEMPT`** con los Ids exactos que ves en QBO para la tasa con ITBMS y la exenta.

**Numeración (DocNumber / correlativo):** Por defecto la función **NO envía** `DocNumber` para que QuickBooks use su **correlativo automático** (configurable en QBO). Si quieres forzar el número desde la app, define `QBO_INVOICE_USE_QBO_AUTONUMBER=false` y la función enviará `case_invoices.numero_factura` como `DocNumber` (debe ser único en QBO).

**Errores frecuentes:** `422` (`no_qb_customer`, `no_qb_item_line`, `no_lines`, `qbo_tax_config`), `502` (`qbo_api_error`), `503` (`qbo_token`). Si `persisted: true`, el estado de error ya está guardado en `case_invoices`.

---

## 8. `qbo-invoice-pdf-sync` — PDF de factura QBO → Storage (POST)

Descarga el PDF desde QBO (`GET .../invoice/{id}/pdf`), lo sube al bucket **`invoices`** y actualiza `pdf_path`, `pdf_status`, `pdf_synced_at`. Si el PDF ya existe y está `ok`, puede devolver solo una URL firmada.

| | |
|--|--|
| **Método** | `POST` |
| **Headers** | `Content-Type: application/json`, `x-ancori-secret: <FUNCTION_SECRET>` |
| **Body** | `{ "invoice_id": "<uuid>", "force": false }` — `force` vuelve a descargar aunque ya exista PDF OK. |

**Respuesta `200`:** `ok`, `path`, `signed_url` (si Supabase pudo firmar).

---

## 9. `qbo-webhook` — Notificaciones Intuit → App (POST)

La invoca **Intuit** con el cuerpo JSON del evento. La función comprueba la firma con `INTUIT_WEBHOOK_VERIFIER_TOKEN` (cabecera `intuit-signature`, HMAC-SHA256 del cuerpo en bruto).

| | |
|--|--|
| **Método** | `POST` |
| **Auth** | Firma Intuit (no JWT Supabase). Suele registrarse la URL con `?apikey=<anon>` si el gateway lo exige. |

**Entidades procesadas**

| Entidad en el webhook | Acción interna |
|----------------------|----------------|
| **Customer** | GET `/customer/{id}` → upsert en `societies` (ver documentación de sociedades). |
| **Item** | GET `/item/{id}` → solo si en JSON `Item.Type === "Category"` → insert/update en `public.categories` (`nombre`, `id_qb`, `activo`). Otros tipos de Item generan `skip_item_not_category` en `processed`. Delete/void → `activo: false` en la categoría con ese `id_qb`. |
| **Invoice** | GET `/invoice/{id}` (create/update) → actualiza `case_invoices` por `qb_invoice_id` (`numero_factura`, fechas, `qb_total`, `qb_balance`, `qb_last_sync_at`). Delete/void → `estado = anulada`. Si no hay fila local con ese `qb_invoice_id`, se inserta en `qbo_invoice_unmatched`. |

Equivale al flujo **webhook → token OAuth ya guardado → GET API → filtrar `Type: Category` → guardar** (como en Power Automate). Detalle: [quickbooks-item-category-webhook.md](./quickbooks-item-category-webhook.md).

Respuesta típica: `{ "ok": true, "processed": [...], "errors": [...] }`.

**Configuración paso a paso:** [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md).

---

## Secretos relevantes (Dashboard → Edge Functions)

| Secret | Uso |
|--------|-----|
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` | OAuth + API |
| `QBO_CRON_SECRET` | Refresh, sync sociedades |
| `QBO_REDIRECT_URI` | Callback OAuth |
| `QBO_ALLOWED_REDIRECT_PREFIXES` | Orígenes válidos para `redirect_to` |
| `QBO_API_BASE` | (Opcional) URL base API QBO; sandbox vs producción |
| `INTUIT_WEBHOOK_VERIFIER_TOKEN` | Validación de firma en `qbo-webhook` |
| `QBO_WEBHOOK_DEFAULT_CLIENT_ID` | UUID de `clients`: cliente por defecto al **crear** `societies` desde Customer nuevo en QBO |
| `QBO_SOCIETY_PUSH_SECRET` | (Opcional) Auth para `qbo-society-push` vía cabecera dedicada |
| `FUNCTION_SECRET` | Compartido con la app (`VITE_FUNCTION_SECRET`) para `qbo-create-invoice` y `qbo-invoice-pdf-sync` |
| `QBO_TAX_CODE_LINE_TAXABLE` / `QBO_TAX_CODE_LINE_EXEMPT` | (Opcional) Ids de `TaxCode` en QBO para líneas con ITBMS y sin impuesto; ver sección `qbo-create-invoice` arriba |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` suelen inyectarse en el entorno hosted.

En la app (Vite), para llamar a `qbo-society-push` desde el navegador: `VITE_QBO_SOCIETY_PUSH_SECRET` (ver advertencia de seguridad en [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md)). Para facturas/PDF, la app usa `VITE_FUNCTION_SECRET` alineado con `FUNCTION_SECRET` en Supabase.

---

## Despliegue

```bash
npm run deploy:qbo-functions
```

Incluye `qbo-sync-societies`, `qbo-webhook`, `qbo-society-push`, `qbo-create-invoice`, `qbo-invoice-pdf-sync` y el resto de funciones QBO del script.

---

*Plan por fases: [quickbooks-supabase-edge-fases.md](./quickbooks-supabase-edge-fases.md). Webhooks: [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md). Categorías QBO (`Item` + `Type: Category`): [quickbooks-item-category-webhook.md](./quickbooks-item-category-webhook.md).*
