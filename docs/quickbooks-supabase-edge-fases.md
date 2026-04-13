# QuickBooks + Supabase Edge Functions — plan por fases

Este documento describe **cómo** vamos a integrar QuickBooks Online (QBO) usando **Supabase Edge Functions** como backend seguro para OAuth y **renovación de tokens**, alineado con Plataforma Ancori (Vite + Supabase).

Documento complementario: [Alternativas de token (visión general)](./quickbooks-oauth-y-token-alternativas.md).

---

## Estado del proyecto (check rápido)

| Fase | Estado | Notas |
|------|--------|--------|
| **0** Intuit | Hecha (por ti) | Client ID/Secret, Redirect URI = callback Supabase. |
| **1** SQL | Pendiente de confirmar en tu proyecto | Ejecutar bloque `qbo_oauth_tokens` en SQL Editor si aún no está. |
| **2** `qbo-oauth-refresh` | Lista en repo | Deploy + secrets; probar con `curl` o tras Fase 3. |
| **2b** OAuth + UI | Lista en repo | `deploy:qbo-functions`, secrets `QBO_REDIRECT_URI` + prefijos, `/configuracion`. |
| **3** Cron | **Siguiente paso operativo** | Workflow GitHub en `.github/workflows/qbo-oauth-refresh-scheduled.yml` + 3 secrets. |
| **4** App | Parcial | Conectar + estado; falta auth duro y “Renovar ahora” seguro. |
| **5** Sync / historial | **Sociedades ↔ QBO** en repo | Función `qbo-sync-societies`; historial de cambios pendiente. Ver [Endpoints QBO](./quickbooks-endpoints.md). |

---

## Objetivo global

- Guardar de forma segura `access_token`, `refresh_token`, `realm_id` y vigencia.
- **Renovar** el access token antes de que caduque (aprox. 1 hora) mediante una función invocable por **cron** o **bajo demanda**.
- Más adelante: sincronizar sociedades/clientes con QBO e historial de cambios (**Fase 5**).

---

## Arquitectura resumida

| Pieza | Rol |
|--------|-----|
| **Tabla `public.qbo_oauth_tokens`** | Una fila lógica por entorno (p. ej. `id = 'default'`). Solo **`service_role`** puede leer/escribir; `anon` / `authenticated` sin permisos. |
| **Edge Function `qbo-oauth-refresh`** | Lee secretos de Intuit + fila en BD, llama a `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`, actualiza tokens y `access_expires_at`. |
| **Secreto `QBO_CRON_SECRET`** | Cabecera obligatoria en la petición para que no cualquiera dispare el refresh. |
| **Programación** | Supabase **Scheduled Functions** (si tu plan lo incluye) o **pg_net** + `pg_cron` / ping externo cada 45–50 min. |

```
[Intuit] <--HTTPS--> [Edge Function qbo-oauth-refresh] <--service_role--> [Postgres qbo_oauth_tokens]
                              ^
                              |  Authorization: Bearer <QBO_CRON_SECRET>
[Cron / Dashboard / GitHub Actions]
```

---

## Fase 0 — Intuit Developer y variables

**Entregable:** app registrada y lista para OAuth.

1. En [Intuit Developer](https://developer.intuit.com/), crear o usar la app **QuickBooks Online + Accounting**.
2. **Redirect URI** de desarrollo: URL de otra Edge Function (fase 2) o `https://localhost` según flujo; en producción, `https://<ref>.supabase.co/functions/v1/qbo-oauth-callback` (cuando exista).
3. Anotar **Client ID** y **Client Secret** (solo en **Secrets** de Supabase y en `.env` local nunca en git).

**Criterio de hecho:** credenciales creadas y redirect acordado con el entorno (sandbox vs producción).

---

## Fase 1 — Base de datos (tokens)

**Entregable:** tabla aplicada en el proyecto Supabase.

1. Ejecutar en el SQL Editor el bloque de **`qbo_oauth_tokens`** definido en `supabase/schema.sql` (o el fragmento que añadimos al final del archivo).
2. **No** insertar tokens reales en chats; el primer `refresh_token` se obtiene tras el consentimiento OAuth (fase 2).
3. Tras el primer OAuth exitoso, insertar o actualizar la fila `default` con `realm_id`, `access_token`, `refresh_token` y `access_expires_at` (la callback o un script manual puede hacerlo).

**Criterio de hecho:** tabla existe, RLS activo, `anon`/`authenticated` revocados en esa tabla, `service_role` con acceso.

---

## Fase 2 — Edge Function `qbo-oauth-refresh`

**Entregable:** función desplegada y probable con `curl`.

### Código en el repo

- `supabase/functions/qbo-oauth-refresh/index.ts`

### Secrets en Supabase (Dashboard → Edge Functions → Secrets)

| Secret | Uso |
|--------|-----|
| `QBO_CLIENT_ID` | OAuth Intuit |
| `QBO_CLIENT_SECRET` | OAuth Intuit |
| `QBO_CRON_SECRET` | Valida la cabecera `Authorization: Bearer …` o `x-qbo-cron-secret` |
| `SUPABASE_URL` | Inyectado por Supabase al desplegar |
| `SUPABASE_SERVICE_ROLE_KEY` | Inyectado; solo en servidor, nunca en el front |

### Comportamiento

1. Comprueba el secreto de cron.
2. Lee la fila `qbo_oauth_tokens` (`id = 'default'`).
3. Si el access token **aún es válido** más de N minutos (p. ej. 10), puede responder `200` sin llamar a Intuit (opcional, reduce carga).
4. Si hace falta refrescar: `grant_type=refresh_token` contra Intuit.
5. Persiste el nuevo `access_token`, `refresh_token` (si Intuit lo rota) y `access_expires_at`.

### Probar en local (CLI)

```bash
npx supabase start
npx supabase functions serve qbo-oauth-refresh --env-file supabase/functions/.env.local
```

(`.env.local` en esa carpeta no se versiona; copia desde `.env.example` de functions si lo añadimos.)

### Probar en producción

```bash
curl -i -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/qbo-oauth-refresh" \
  -H "Authorization: Bearer <QBO_CRON_SECRET>" \
  -H "apikey: <SUPABASE_ANON_KEY>"
```

**Criterio de hecho:** respuesta `200` y fila en BD con `access_expires_at` actualizado tras un refresh real.

---

## Fase 2b — OAuth “Conectar QuickBooks” (implementado en el repo)

**Entregable:** flujo web sin pegar tokens a mano.

1. **`qbo-oauth-start`** (GET): valida `redirect_to` frente a `QBO_ALLOWED_REDIRECT_PREFIXES`, arma `state` firmado con `QBO_CRON_SECRET`, redirige a Intuit (`scope=com.intuit.quickbooks.accounting`).
2. Intuit redirige a **`qbo-oauth-callback`** con `code`, `realmId` y `state`.
3. La callback verifica `state`, intercambia `code` por tokens y hace **upsert** en `qbo_oauth_tokens`; luego redirige al `redirect_to` de la app con `?qb=connected` (o `qb=denied`, etc.).

### Secrets adicionales (Dashboard → Edge Functions)

| Secret | Uso |
|--------|-----|
| `QBO_REDIRECT_URI` | Debe ser **exactamente** `https://<REF>.supabase.co/functions/v1/qbo-oauth-callback` y estar registrada igual en Intuit. |
| `QBO_ALLOWED_REDIRECT_PREFIXES` | Lista separada por comas; orígenes permitidos para `redirect_to` (ej. `http://localhost:5173,https://tu-app.com`). |

### UI

- **`/configuracion`**: botón “Conectar QuickBooks” abre la URL de `qbo-oauth-start` con `apikey` (anon) y `redirect_to` = origen actual + `/configuracion`.
- **`qbo-oauth-status`**: devuelve `connected`, `realm_id`, `access_expires_at` (sin tokens). Hoy es **pública** con `apikey`; cuando exista login Supabase, conviene endurecerla (JWT + rol).

**Criterio de hecho:** conectar desde la app y ver tokens en `qbo_oauth_tokens` en el SQL Editor.

---

## Fase 3 — Programación automática del refresh (implementado en el repo)

**Entregable:** el access token se renueva de forma periódica sin abrir la app.

### Opción A — GitHub Actions (recomendada, sin coste extra habitual)

En el repo existe **`.github/workflows/qbo-oauth-refresh-scheduled.yml`**: cada hora (UTC, minuto 20) hace `POST` a `qbo-oauth-refresh` con las mismas cabeceras que el `curl` de la fase 2.

1. Sube el workflow a GitHub (commit en la rama **por defecto**; los `schedule` solo corren ahí).
2. En **GitHub → tu repo → Settings → Secrets and variables → Actions → New repository secret**, crea:

| Secret | Valor |
|--------|--------|
| `QBO_OAUTH_REFRESH_URL` | `https://<TU_REF>.supabase.co/functions/v1/qbo-oauth-refresh` |
| `QBO_CRON_SECRET` | **El mismo** string que en Supabase Edge Function secrets. |
| `SUPABASE_ANON_KEY` | La **anon** key del proyecto (Supabase → Settings → API). |

3. Prueba sin esperar al cron: **Actions → “QBO OAuth refresh token” → Run workflow**.

**Nota:** GitHub puede retrasar ejecuciones programadas unos minutos en repos gratuitos; una hora sigue siendo adecuado para tokens QBO de ~1 h.

### Opción B — Supabase Dashboard

Si tu plan incluye **Scheduled Functions** u otro programador nativo, configura un `POST` periódico a la misma URL con `Authorization: Bearer <QBO_CRON_SECRET>` y `apikey: <anon>`.

### Opción C — `pg_cron` + `pg_net`

Solo si tienes extensiones y red habilitadas; job SQL que invoque la URL de la función.

**Criterio de hecho:** en **Actions** (o logs del scheduler) ves ejecuciones OK y en `qbo_oauth_tokens` el `updated_at` / `access_expires_at` se mantiene al día.

---

## Fase 4 — Uso desde la app (Vite) — parcial

**Hecho:** pantalla **Configuración** con conexión OAuth y lectura de estado vía `qbo-oauth-status`.

**Pendiente (recomendado con auth):**

1. **No** exponer `service_role` en el front (sigue así).
2. Endurecer **`qbo-oauth-status`** con `verify_jwt` + rol admin cuando exista login Supabase.
3. Botón **“Renovar token ahora”** que dispare `qbo-oauth-refresh` solo para admins (el refresh **nunca** debe usar el anon key del navegador; usar un backend o un secret rotado vía sesión de servidor).

**Criterio de hecho (completo):** solo usuarios autorizados consultan estado sensible y disparan refresh.

---

## Fase 5 — Sincronización e historial

### Hecho: sociedades ↔ Customer QBO

- Edge Function **`qbo-sync-societies`** (`POST`, mismo secreto que `qbo-oauth-refresh`).
- Modos: `from_qb` (enlaza `quickbooks_customer_id` por Id / `id_qb` / nombre), `to_qb` (crea Customer faltantes), `both`.
- Helpers: `_shared/qbo-tokens.ts`, `_shared/qbo-customers.ts`.

**Referencia de URLs y cabeceras:** [quickbooks-endpoints.md](./quickbooks-endpoints.md).

### Pendiente

- Sincronizar **clientes** (`public.clients`) si hace falta el mismo patrón.
- Tabla **`qbo_sync_log`** / **`entity_changelog`** y botón **Historial** en mantenimiento.

---

## Riesgos y buenas prácticas

- **Concurrencia:** dos refreshes simultáneos pueden invalidar el refresh token; la función puede usar bloqueo optimista (`updated_at` / transacción) o un solo worker de cron.
- **Sandbox vs producción:** URLs y `realmId` distintos; considerar columna `environment` o proyectos Supabase separados.
- **Revocación:** si Intuit devuelve error de refresh, alertar y mostrar en UI “Reconectar QuickBooks”.

---

## Checklist rápido por fase

| Fase | Checklist |
|------|-----------|
| 0 | App Intuit, redirect URI, sandbox probado |
| 1 | SQL `qbo_oauth_tokens` + revokes |
| 2 | Deploy `qbo-oauth-refresh` + secrets + `curl` OK |
| 2b | Callback OAuth + upsert tokens |
| 3 | Workflow GitHub + 3 secrets **o** scheduler Supabase / pg_cron |
| 4 | UI config + sin secrets en cliente |
| 5 | Sync + historial |

---

## Archivos del repo relacionados

| Archivo | Descripción |
|---------|-------------|
| `supabase/schema.sql` | Tabla `qbo_oauth_tokens`, RLS y `REVOKE` tras grants globales |
| `supabase/functions/qbo-oauth-refresh/index.ts` | Edge Function de refresh (fase 2) |
| `supabase/functions/.env.example` | Plantilla para `supabase functions serve` en local |
| `supabase/config.toml` | `project_id` y `verify_jwt` por función |
| `.github/workflows/qbo-oauth-refresh-scheduled.yml` | Cron horario del refresh (Fase 3) |
| `supabase/functions/qbo-sync-societies/index.ts` | Sync sociedades ↔ Customer QBO (Fase 5) |
| `docs/quickbooks-endpoints.md` | Listado de endpoints y ejemplos `curl` |
| `docs/quickbooks-oauth-y-token-alternativas.md` | Contexto de tokens y otras opciones |

### Ya en el repo (fases 1–3 en código y fase 4 parcial)

- **DDL** `qbo_oauth_tokens` y permisos restrictivos respecto a `anon` / `authenticated`.
- **Funciones:** `qbo-oauth-refresh`, `qbo-oauth-start`, `qbo-oauth-callback`, `qbo-oauth-status`.
- **Fase 3:** `.github/workflows/qbo-oauth-refresh-scheduled.yml` (configurar secrets en GitHub).
- **App:** `src/lib/qboIntegration.ts`, `src/pages/ConfigPage.tsx` (botón Conectar + estado).
- **Compartido:** `supabase/functions/_shared/intuit-oauth.ts` (estado firmado OAuth).

**Instalación local de CLI:** [Supabase CLI](https://supabase.com/docs/guides/cli). Luego:

```bash
supabase login
supabase link --project-ref <TU_REF>
supabase secrets set \
  QBO_CLIENT_ID=... \
  QBO_CLIENT_SECRET=... \
  QBO_CRON_SECRET=... \
  QBO_REDIRECT_URI=https://<TU_REF>.supabase.co/functions/v1/qbo-oauth-callback \
  QBO_ALLOWED_REDIRECT_PREFIXES=http://localhost:5173,https://tu-dominio.com

supabase functions deploy qbo-oauth-start
supabase functions deploy qbo-oauth-callback
supabase functions deploy qbo-oauth-refresh
supabase functions deploy qbo-oauth-status
```

**Windows / sin CLI global:** desde la carpeta del repo (`ancori-case-hub`), con dependencia `supabase` en el proyecto:

```bash
npm install
npm run supabase:login
npm run supabase:link -- --project-ref TU_REF
npm run deploy:qbo-functions
```

No uses el texto literal `ruta\a\ancori-case-hub`; debe ser la ruta real del proyecto en tu PC.

**SQL:** si la base ya existía sin QBO, ejecuta en el SQL Editor el bloque `qbo_oauth_tokens` de `supabase/schema.sql` (creación + `revoke` final).

---

*Última actualización: plan inicial para implementación conjunta; ajustar fechas y dueños de tarea según el equipo.*
