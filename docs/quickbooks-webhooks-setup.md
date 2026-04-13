# QuickBooks Online: webhooks y sincronización de sociedades

Este documento aclara **qué hace cada canal** y cómo configurar Intuit y Supabase.

## Dos direcciones distintas

| Dirección | Mecanismo en este proyecto | Para qué sirve |
|-----------|----------------------------|----------------|
| **App → QuickBooks** | Edge Function `qbo-society-push` llamada al **guardar o eliminar** una sociedad en la app | Alta, edición y “baja” lógica (Customer **desactivado** en QBO al borrar en la app). |
| **QuickBooks → App** | Edge Function `qbo-webhook` (notificaciones de Intuit) | Tras **create/update/merge**, se lee el Customer por Id en la API de QBO y se **actualiza** la sociedad enlazada por `quickbooks_customer_id`, o se **crea** una fila nueva si aún no existe (ver `QBO_WEBHOOK_DEFAULT_CLIENT_ID`). **Delete/void** desactiva la sociedad enlazada. |

El **webhook de Intuit no sustituye** el push desde la app: Intuit notifica cambios **originados en QBO**, no intercepta lo que hace tu frontend. Por eso las altas/edits/bajas desde la plataforma usan `qbo-society-push`.

## 1. Secretos en Supabase (Dashboard → Edge Functions → Secrets)

| Secret | Obligatorio | Uso |
|--------|-------------|-----|
| `INTUIT_WEBHOOK_VERIFIER_TOKEN` | Sí, si usas webhook | Mismo valor que el **Verifier Token** en el portal de desarrolladores Intuit (Webhooks). La función valida la cabecera `intuit-signature`. |
| `QBO_WEBHOOK_DEFAULT_CLIENT_ID` | Sí, si quieres **crear** sociedades desde Customer nuevos en QBO | UUID de un registro existente en `public.clients` (cliente **interno** de la plataforma). Las sociedades importadas quedan con ese `client_id` hasta que las reasignes. **No** es el Id de QuickBooks. |

En `societies`, **`id_qb`** es el **Customer.Id** de QuickBooks en forma numérica (cuando el Id es un entero que cabe en `integer`); **`quickbooks_customer_id`** guarda el mismo identificador como texto. Ambos se rellenan desde webhook, `qbo-society-push` y `qbo-sync-societies`.
| `QBO_SOCIETY_PUSH_SECRET` | Recomendado | Secreto dedicado para `qbo-society-push`. Si no lo defines, puedes autorizar con `Authorization: Bearer <QBO_CRON_SECRET>`. |
| `QBO_CRON_SECRET` | Ya lo usas para cron/sync | También aceptado por `qbo-society-push` como alternativa al secreto anterior. |

El resto (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, tokens OAuth, etc.) sigue siendo necesario como en el flujo OAuth ya documentado.

## 2. URL del webhook en Intuit Developer

1. Despliega la función: `npm run deploy:qbo-functions` (incluye `qbo-webhook`).
2. URL base:

   ```text
   https://<REF_PROYECTO>.supabase.co/functions/v1/qbo-webhook
   ```

3. En muchos proyectos Supabase, las Edge Functions exigen el **anon key** en la petición. Intuit no permite cabeceras arbitrarias fácilmente en todos los flujos; lo habitual es añadir la clave en la **query**:

   ```text
   https://<REF>.supabase.co/functions/v1/qbo-webhook?apikey=<SUPABASE_ANON_KEY>
   ```

   Registra en Intuit **exactamente** esa URL (con el `apikey` si tu gateway lo requiere).

4. Copia el **Verifier Token** del portal y pégalo en Supabase como `INTUIT_WEBHOOK_VERIFIER_TOKEN`.

## 3. Suscripción de eventos

En el portal de la app Intuit, en la sección de **Webhooks**, suscribe al menos entidades **Customer** (crear, actualizar, borrar/anular según permita el portal). Así `qbo-webhook` puede actualizar `societies` enlazadas.

**Customer nuevo solo en QBO** (webhook create/update y no hay `quickbooks_customer_id` local): se **inserta** una fila en `societies` con datos del Customer (nombre, razón social, correo, teléfono si viene en QBO, `tipo_sociedad` = `SOCIEDADES`) y `client_id` = `QBO_WEBHOOK_DEFAULT_CLIENT_ID`. Sin ese secret, el evento se registra en `errors` de la respuesta del webhook.

## 4. App (Vite): push al guardar/borrar

En `.env.local` (no versionar):

```env
VITE_QBO_SOCIETY_PUSH_SECRET=<mismo valor que QBO_SOCIETY_PUSH_SECRET o que QBO_CRON_SECRET>
```

Con eso, al guardar o eliminar una sociedad, la app llama a `qbo-society-push` con la cabecera `x-qbo-society-push-secret`.

**Advertencia de seguridad:** cualquier variable `VITE_*` queda en el bundle del navegador. Úsalo solo en entornos controlados; en producción pública conviene sustituir esto por una llamada autenticada (p. ej. JWT de usuario y validación en la función).

## 5. Comprobación rápida

- Tras conectar QBO (OAuth), crea una sociedad en la app: debería aparecer un Customer en QBO y `quickbooks_customer_id` en la fila.
- Edita el Customer en QBO: si el webhook está bien configurado, la sociedad enlazada debería actualizarse al recibir la notificación.
- Borra la sociedad en la app: el Customer correspondiente en QBO pasa a **inactivo** (no se borra físicamente en QBO por limitaciones habituales de la API).

Detalle de endpoints y `curl`: [quickbooks-endpoints.md](./quickbooks-endpoints.md).
