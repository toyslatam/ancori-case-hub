# AgileCheck en esta app — guía paso a paso

Este documento resume **qué es**, **cómo está cableado** en Ancori Case Hub y **qué falta** para dejarlo 100 % operativo contra el API real de AgileCheck (Swagger de pruebas).

---

## 1. ¿Para qué sirve?

AgileCheck se usa como proveedor externo de **verificaciones PEP / AML** (listas restrictivas, noticias negativas, etc.). En la app:

- El usuario dispara una verificación desde la pantalla de **Cumplimiento** (y en el futuro se puede reutilizar en Sociedades u otras vistas).
- La app **no** llama a AgileCheck directamente con usuario/contraseña desde el navegador.
- Todo pasa por una **Supabase Edge Function** (`agilecheck-verify`), que guarda el resultado en la tabla **`compliance_checks`**.

---

## 2. Flujo general (de arriba a abajo)

```text
Usuario en la web (CumplimientoPage)
    │
    ▼
verifyEntity() en src/lib/agileCheckApi.ts
    │  POST {VITE_SUPABASE_URL}/functions/v1/agilecheck-verify
    │  Header: x-ancori-secret = VITE_AGILECHECK_SECRET (o fallback VITE_QBO_SOCIETY_PUSH_SECRET)
    │  Body JSON: entity_type, entity_id, entity_name, check_type, checked_by_usuario_id
    ▼
Edge Function supabase/functions/agilecheck-verify/index.ts
    │  Valida FUNCTION_SECRET (mismo valor que x-ancori-secret)
    │  1) getAgileCheckToken() → POST application/x-www-form-urlencoded a AGILECHECK_TOKEN_URL
    │  2) callAgileCheckAPI() → POST JSON a AGILECHECK_API_BASE + AGILECHECK_QUERY_PATH con Bearer token
    │  3) INSERT en public.compliance_checks
    ▼
Tabla public.compliance_checks
    │
    ▼
La UI vuelve a leer con fetchComplianceChecks() / getLatestCheck()
```

---

## 3. Paso a paso: qué configurar tú (Supabase + entorno)

### Importante: ¿dónde se “ponen” estos valores?

**No** vas a un panel de AgileCheck a registrar `FUNCTION_SECRET` ni nombres raros. AgileCheck solo te da **URL de token**, **usuario** y **contraseña** (y luego documentación/Swagger para la consulta).

Tú copias eso a:

1. **Supabase** → *Project Settings* → *Edge Functions* → **Secrets** (o `npx supabase secrets set ...`) para que la Edge Function `agilecheck-verify` pueda llamar a AgileCheck **desde el servidor**, sin exponer la contraseña en el navegador.
2. **Tu `.env` del frontend** solo necesita `VITE_AGILECHECK_SECRET` (y `VITE_SUPABASE_URL`): es el **secreto propio de tu app** para que nadie abuse de tu función; no lo entrega AgileCheck.

### Por fases (alineado con Power Automate u otros flujos)

**Fase 1 — Obtener el token (OAuth2, grant `password`)**  
Equivale a tu acción HTTP “Token”: `POST` a la URI de token, `Content-Type: application/x-www-form-urlencoded`, body `username=...&password=...&grant_type=password`.

En Supabase solo necesitas para esta fase:

| Secret | Qué poner |
|--------|-----------|
| `AGILECHECK_TOKEN_URL` | La misma URI que en Power Automate, p. ej. `https://app.agilecheck.io/HubQueryEngine_agilecheck/api/oauth2/token` (o la de **pruebas** si usáis otro host). |
| `AGILECHECK_USERNAME` | El usuario que os dio AgileCheck (el que va en el body del token). |
| `AGILECHECK_PASSWORD` | La contraseña (solo en Secrets de Supabase; nunca en el repo ni en el frontend). |
| `AGILECHECK_GRANT_TYPE` | `password` (si no lo defines, el código ya usa `password` por defecto). |

Con eso la función puede ejecutar `getAgileCheckToken()` y recibir un `access_token`.

**Fase 2 — Llamar al API de consulta (PEP/AML, etc.)**  
Después del token, otra petición HTTP usa `Authorization: Bearer <access_token>` contra el endpoint que marque el **Swagger** de HubQueryEngine.

Ahí entran:

| Secret | Qué poner |
|--------|-----------|
| `AGILECHECK_API_BASE` | URL base del motor, p. ej. `https://app.agilecheck.io/HubQueryEngine_agilecheck` (sin barra final o da igual; el código la normaliza). |
| `AGILECHECK_QUERY_PATH` | El path que copiéis del Swagger (ej. `api/.../algo`). **Pendiente** hasta tener el endpoint real. |
| `AGILECHECK_DB` | Solo si el Swagger o soporte AgileCheck indica base de datos en header o body. |

El código del body de esa segunda llamada (`callAgileCheckAPI`) hay que **ajustarlo** al contrato real del Swagger; hoy es un placeholder.

**Siempre (seguridad de tu función)**  

| Secret | Qué poner |
|--------|-----------|
| `FUNCTION_SECRET` | Una cadena larga que **tú inventas**; la misma va en `VITE_AGILECHECK_SECRET` en el frontend para el header `x-ancori-secret`. |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase solo; no los copies a mano salvo entorno local.

### 3.1 Secrets en Supabase (Dashboard → Edge Functions → Secrets)

La función `agilecheck-verify` espera (tabla resumida; ver fases arriba):

| Secret | Rol |
|--------|-----|
| `FUNCTION_SECRET` | Mismo valor que envías desde la app en `x-ancori-secret` (y el que uses en `VITE_AGILECHECK_SECRET`). Si está vacío en la función, no valida el header (no recomendado en producción). |
| `SUPABASE_URL` | Lo inyecta Supabase automáticamente. |
| `SUPABASE_SERVICE_ROLE_KEY` | Lo inyecta Supabase automáticamente. |
| `AGILECHECK_TOKEN_URL` | URL del endpoint OAuth2 de AgileCheck (ej. token en entorno de pruebas). |
| `AGILECHECK_USERNAME` | Usuario AgileCheck. |
| `AGILECHECK_PASSWORD` | Contraseña AgileCheck. |
| `AGILECHECK_GRANT_TYPE` | Normalmente `password` (valor por defecto en código si no lo defines). |
| `AGILECHECK_API_BASE` | URL base del motor de consultas (sin path final de la operación concreta). |
| `AGILECHECK_QUERY_PATH` | Opcional. Por defecto la función usa `api/Consulta/Buscar`. Solo definir si AgileCheck cambia el path. |
| `AGILECHECK_LISTA_IDS` | **Recomendado.** IDs de listas restrictivas separados por coma (salen de `GET /api/List/GetListas` en Swagger). Si no se define, la función intenta obtenerlos con esa llamada. |
| `AGILECHECK_PAIS_ID` / `AGILECHECK_PAIS` | Opcional. Filtro país (`0` y vacío = sin país, según modelo Hub). |
| `AGILECHECK_QUERY_MODE` | Opcional. Entero; por defecto `0`. |
| `AGILECHECK_DB` | Opcional: nombre de base de datos en AgileCheck si el API lo requiere (header o body). |

Comando típico (ejemplo):

```bash
npx supabase secrets set AGILECHECK_LISTA_IDS="3,7,12"
```

### 3.1.1 Fase 2 ya con token: ¿de dónde saco `AGILECHECK_API_BASE`, `AGILECHECK_QUERY_PATH` y `AGILECHECK_DB`?

**`AGILECHECK_API_BASE` (casi siempre lo puedes deducir tú)**  
Mira la misma URL que usaste para el token (`AGILECHECK_TOKEN_URL`). Suele ser del estilo:

`https://HOST/HubQueryEngine_agilecheck/api/oauth2/token`

La **base del motor** es la misma ruta **sin** el sufijo del token. Ejemplos:

| Si tu `AGILECHECK_TOKEN_URL` es… | Entonces `AGILECHECK_API_BASE` suele ser… |
|-----------------------------------|--------------------------------------------|
| `https://app.agilecheck.io/HubQueryEngine_agilecheck/api/oauth2/token` | `https://app.agilecheck.io/HubQueryEngine_agilecheck` |
| `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/api/oauth2/token` | `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck` |

Es decir: **mismo host + mismo prefijo `.../HubQueryEngine_agilecheck`**, quitando `/api/oauth2/token`. Eso no lo “da” un formulario aparte: lo infieres de la URL del token (y debe coincidir con la URL base que abrís en el Swagger del mismo entorno).

**`AGILECHECK_QUERY_PATH` (no se adivina: sale del Swagger o de AgileCheck)**  
Es solo la parte **después** de esa base, por ejemplo si el Swagger dice `POST /api/Algo/Consultar`, el path relativo sería `api/Algo/Consultar` (sin barra inicial o con una sola barra al unir; el código quita barras duplicadas).

Dónde conseguirlo:

1. Abrís el **Swagger UI** que os hayan dado para ese mismo entorno (pruebas o producción), por ejemplo:  
   `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/`  
   o el equivalente en `app.agilecheck.io` si es producción.
2. Buscáis el endpoint de **consulta / búsqueda / verificación** (PEP, listas, etc.).
3. Copiáis el **path** que muestra el Swagger (no la URL completa: la base va en `AGILECHECK_API_BASE`).

Si el Swagger no carga o no está claro, **preguntáis a soporte o cuenta técnica de AgileCheck**: “¿Cuál es el endpoint HTTP y el body para ejecutar una consulta PEP usando el Bearer token del oauth2/token?”.

**`AGILECHECK_DB` (opcional)**  
Solo lo configuráis si en el Swagger (o en la documentación) aparece un parámetro explícito de **base de datos**, tenant o similar (a veces `db`, `database`, etc.). Si ningún endpoint lo pide, **dejadlo sin definir**; la función ya lo trata como opcional.

### 3.2 Variables en el frontend (`.env` local / build)

| Variable | Rol |
|----------|-----|
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_AGILECHECK_SECRET` | Debe coincidir con `FUNCTION_SECRET` de la Edge Function. **Recomendado** usar solo esta y no mezclar con QBO. |
| `VITE_QBO_SOCIETY_PUSH_SECRET` | Solo como **fallback** si no definiste `VITE_AGILECHECK_SECRET` (ver `agileCheckApi.ts`). |

### 3.3 Desplegar la función

Después de cambiar código o secrets:

```bash
npx supabase functions deploy agilecheck-verify
```

### 3.4 Swagger [HubQueryEngine (pruebas)](https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/): ¿qué grupo abrir?

En el Swagger aparecen muchos controladores (catálogos, direcciones, etc.). Para **cumplimiento / listas / “cómo está el cliente”** enfocate en estos tres bloques:

| Bloque en Swagger | Para qué sirve | Endpoint destacado (path relativo para `AGILECHECK_QUERY_PATH`) |
|-------------------|----------------|-------------------------------------------------------------------|
| **Consulta** | Búsqueda en listas (persona natural por nombres/apellidos; jurídica por razón social / comercial; también por documento si envías `NumeroId`). | `api/Consulta/Buscar` — **POST**, cuerpo JSON modelo `ConsultaIndividualDTOIN` (campos obligatorios: `Nombres`, `Apellidos`, `EsJuridico`, `Listas`, `Pais`, `PaisId`, `queryMode`). Los IDs de `Listas` salen del endpoint de listas en la categoría **List** (`GetListas`). |
| **Cliente** | Cliente **dentro de AgileCheck** (alta, búsqueda por cédula/RUC, riesgo alto). | Ejemplos: `api/Cliente/PostCliente` (POST), `api/Cliente/GetClienteByDocIdentidad`, `api/Cliente/EsAltoRiesgoCliente` (GET con query `idCliente`). |
| **DetalleCalculoRiesgo** | Detalle del **cálculo de riesgo** asociado a un cliente **ya existente en AgileCheck**. | `api/DetalleCalculoRiesgo/GetDetalleCalculoRiesgoByCliente` — **GET**, query obligatoria `idCliente` (entero, **id interno de AgileCheck**, no el UUID de Ancori). |

**IDs de `Listas` — ¿cuáles son?**

No son fijos universales: **cada tenant / instalación AgileCheck** tiene sus propias listas con **IDs numéricos distintos**. El Swagger solo da un **ejemplo** en la descripción del modelo (`[1,2,8]`). Para saber los vuestros:

1. En Swagger, abrís **List** → **`GET /api/List/GetListas`** → **Execute** y revisáis el JSON (cada lista trae un `id` o equivalente).
2. O preguntáis a AgileCheck qué IDs usar para PEP/sanciones en Panamá.
3. En Supabase definís el secret **`AGILECHECK_LISTA_IDS`** con esos números separados por coma, p. ej. `3,7,12`.

La Edge Function `agilecheck-verify` usa ese secret; si no está, intenta parsear la respuesta de `GetListas` automáticamente (puede fallar si el JSON viene en un formato que no reconocemos).

**`EsJuridico` — natural y jurídica**

- Por defecto en la función: **`society` → `EsJuridico: true`** (persona jurídica); **`client`** y **`director` → `false`** (persona natural).
- Un **cliente persona jurídica** en Ancori debe enviar en el body **`"es_juridico": true`** (el frontend puede pasarlo con `verifyEntity(..., hubOptions: { es_juridico: true })`).
- Podéis enviar **`nombres`**, **`apellidos`** y **`numero_id`** (RUC/cédula) opcionales para alinear con el modelo del Hub sin depender solo de `entity_name`.

**Cómo orientarte en la UI del Swagger**

1. Entrá a [Swagger UI pruebas](https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/).
2. Tocá **“List Operations”** o **“Expand Operations”** solo en **Consulta**, **Cliente** y **DetalleCalculoRiesgo** (no hace falta desplegar todo).
3. Para probar: **Try it out** → completá parámetros → **Execute** y mirá el JSON de respuesta y los códigos 200/400.

**`AGILECHECK_API_BASE` en pruebas**

Suele ser: `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck`  
(el mismo prefijo que en la URL del Swagger; sin `/swagger/...`).

**`AGILECHECK_QUERY_PATH`**

Es **solo** la parte final, por ejemplo:

- Primera integración típica (búsqueda listas): `api/Consulta/Buscar`
- Solo detalle de riesgo (si ya tenés `idCliente` en AgileCheck): `api/DetalleCalculoRiesgo/GetDetalleCalculoRiesgoByCliente` (en GET los query params van en la URL; en secrets solo va el path base del recurso — en integración a veces conviene llamar al GET construyendo `?idCliente=` desde código).

**Importante para Ancori**

En la app guardás clientes/sociedades con **UUID**. AgileCheck usa **`idCliente` numérico** propio. Flujo habitual: **buscar o crear cliente** en AgileCheck (`PostCliente` / `GetClienteByDocIdentidad`), obtener su `id`, y recién ahí llamar **DetalleCalculoRiesgo** o **EsAltoRiesgoCliente**. Eso implica mapear o guardar el id de AgileCheck si querés consultas repetidas.

**Especificación OpenAPI (para buscar paths sin clic)**  
JSON del API: `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/docs/v1` (útil para `grep` o búsqueda en el navegador).

---

## 4. Paso a paso: qué hace el código (por fases)

### 4.1 Frontend — `src/lib/agileCheckApi.ts`

- **`verifyEntity(...)`**  
  Hace `POST` a `/functions/v1/agilecheck-verify` con el JSON de la entidad y el tipo de chequeo (`PEP` por defecto).

- **`fetchComplianceChecks` / `getLatestCheck`**  
  Leen directamente de Supabase la tabla `compliance_checks` (no pasan por la función).

### 4.2 Edge Function — `supabase/functions/agilecheck-verify/index.ts`

1. **Autenticación de la petición a la función**  
   Si existe `FUNCTION_SECRET`, el header `x-ancori-secret` debe coincidir.

2. **Token OAuth2** — `getAgileCheckToken()`  
   - `POST` a `AGILECHECK_TOKEN_URL`  
   - `Content-Type: application/x-www-form-urlencoded`  
   - Cuerpo: `username`, `password`, `grant_type`  
   - Espera JSON con `access_token`.

3. **Consulta a AgileCheck** — `callAgileCheckAPI()`  
   - Construye `endpoint = AGILECHECK_API_BASE + "/" + AGILECHECK_QUERY_PATH`.  
   - Si falta `AGILECHECK_API_BASE` o `AGILECHECK_QUERY_PATH`, devuelve error claro (token OK pero consulta no configurada).  
   - Hoy envía un **cuerpo tipo JSON-RPC de ejemplo** (`jsonrpc`, `method`, `params` con `name`, `check_type`, `db`).  
   - **Importante:** ese formato es un **placeholder** hasta alinearlo con lo que diga el Swagger real de HubQueryEngine.

4. **Parseo** — `parseAgileCheckResult()`  
   - Intenta leer `matches` / `results`, `risk_level`, `id` de la respuesta.  
   - Cuando tengamos el JSON real del API, habrá que ajustar este mapeo.

5. **Persistencia**  
   - Inserta una fila en `compliance_checks` con `status`, `risk_level`, `result_summary`, `result_data` (JSON completo), fechas y `expires_at` (+6 meses desde la verificación PEP).

### 4.3 Base de datos — `public.compliance_checks`

Campos principales: `entity_type` (`client` \| `director` \| `society`), `entity_id`, `entity_name`, `check_type`, `status`, `risk_level`, `agilecheck_id`, `result_summary`, `result_data`, `checked_by`, `checked_at`, `expires_at`, `created_at`.

Definición en `supabase/schema.sql`.

### 4.4 UI — `src/pages/CumplimientoPage.tsx`

Muestra listado/estadísticas y el diálogo de confirmación antes de llamar a `verifyEntity`.

---

## 5. Qué falta para cerrar la integración

1. **Abrir el Swagger de AgileCheck** (entorno de pruebas que indiquen):  
   `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/`

2. **Anotar del Swagger** (imprescindible para el desarrollador):
   - Path exacto del endpoint de consulta PEP/AML (o el que usen).
   - Método (GET/POST).
   - Headers obligatorios (además de `Authorization: Bearer …`).
   - Cuerpo o query params exactos (nombre, RUC, tipo de entidad, etc.).
   - Forma real de la respuesta (campos de éxito, errores, matches, score).

3. **En el repositorio**, actualizar:
   - `callAgileCheckAPI()` en `agilecheck-verify/index.ts`: URL, método, body y headers según el punto anterior.
   - `parseAgileCheckResult()` para mapear bien a `clean` / `match` / `review` / `error` y `risk_level`.

4. **Secret** `AGILECHECK_QUERY_PATH` (y `AGILECHECK_DB` si aplica) en Supabase.

5. **Probar** con un caso conocido y revisar fila en `compliance_checks` y mensajes en logs de la función.

### 5.1 Prueba local solo `Consulta/Buscar` (sin Supabase)

En el repo hay un script Node que hace **token + GetListas (si hace falta) + Buscar** y imprime el JSON en consola:

```bash
# 1) Variables en supabase/functions/.env y/o .env.local
#    - Sin # al inicio de la línea (si está comentado, el script no carga el valor).
#    - El script lee primero .env y después .env.local (este último pisa).
# 2) Opcional: AGILECHECK_LISTA_IDS=... ; AGILECHECK_TEST_NOMBRES, etc.
npm run test:agilecheck-buscar
```

Archivo: `scripts/test-agilecheck-buscar.mjs`. No subas `.env.local` al git.

---

## 6. Probar la Edge Function sin la UI (curl)

Sustituye URL, secret y un `entity_id` UUID válido de tu BD:

```bash
curl -X POST "https://TU_PROYECTO.supabase.co/functions/v1/agilecheck-verify" ^
  -H "Content-Type: application/json" ^
  -H "x-ancori-secret: TU_FUNCTION_SECRET" ^
  -d "{\"entity_type\":\"society\",\"entity_id\":\"00000000-0000-0000-0000-000000000001\",\"entity_name\":\"Prueba S.A.\",\"check_type\":\"PEP\"}"
```

- Si el token está bien pero falta path de consulta, la respuesta suele indicar que falta `AGILECHECK_QUERY_PATH` / `AGILECHECK_API_BASE`.
- Si el path está mal o el body no coincide con AgileCheck, verás `status: error` y detalle en `result_data` o en el cuerpo de error.

---

## 7. Documentación relacionada

- `docs/agilecheck-sociedades.md` — contexto de uso con **sociedades** y checklist ampliado (puede mencionar nombres de variables antiguos; esta guía refleja el código actual con OAuth2 + `AGILECHECK_API_BASE` / `AGILECHECK_QUERY_PATH`).

---

## 8. Resumen en una frase

**Hoy:** token AgileCheck + proxy seguro + guardado en `compliance_checks` están preparados; **falta** copiar del Swagger el **endpoint real** y el **formato de request/response**, configurar `AGILECHECK_QUERY_PATH` (y ajustar el código del body y del parseo) para que la consulta deje de ser un placeholder.
