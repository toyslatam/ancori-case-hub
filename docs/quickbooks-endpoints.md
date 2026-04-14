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

## 7. `qbo-webhook` — Notificaciones Intuit → App (POST)

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

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` suelen inyectarse en el entorno hosted.

En la app (Vite), para llamar a `qbo-society-push` desde el navegador: `VITE_QBO_SOCIETY_PUSH_SECRET` (ver advertencia de seguridad en [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md)).

---

## Despliegue

```bash
npm run deploy:qbo-functions
```

Incluye `qbo-sync-societies`, `qbo-webhook` y `qbo-society-push` junto al resto de funciones QBO.

---

*Plan por fases: [quickbooks-supabase-edge-fases.md](./quickbooks-supabase-edge-fases.md). Webhooks: [quickbooks-webhooks-setup.md](./quickbooks-webhooks-setup.md). Categorías QBO (`Item` + `Type: Category`): [quickbooks-item-category-webhook.md](./quickbooks-item-category-webhook.md).*
