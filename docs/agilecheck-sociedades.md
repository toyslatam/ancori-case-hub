# Integración AgileCheck → Sociedades (LAFT/PEP) en Ancori Case Hub

> **Guía paso a paso (configuración, flujo y pendientes):** ver [`agilecheck-paso-a-paso.md`](./agilecheck-paso-a-paso.md).

---

## Fase 1 — checklist (token OAuth2)

Marcá cada ítem cuando esté listo:

| # | Qué | Dónde |
|---|-----|--------|
| 1 | `AGILECHECK_TOKEN_URL`, `AGILECHECK_USERNAME`, `AGILECHECK_PASSWORD` (y `AGILECHECK_GRANT_TYPE=password` si aplica) | Secrets Supabase |
| 2 | `FUNCTION_SECRET` en Supabase = `VITE_AGILECHECK_SECRET` en el frontend | Supabase + `.env` del build |
| 3 | `AGILECHECK_API_BASE` = base del Hub (ej. pruebas: `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck`) | Secret Supabase |
| 4 | Edge Function `agilecheck-verify` desplegada | `npx supabase functions deploy agilecheck-verify` |

Si los cuatro están OK, **Fase 1 está cerrada**: el servidor puede obtener `access_token` y llamar al API bajo la misma base URL.

---

## Fase 2 — tus tres líneas de API (Consulta, Cliente, Detalle de riesgo)

En el Swagger de HubQueryEngine encajan así:

| Bloque | Rol típico para una **sociedad** (persona jurídica) |
|--------|-----------------------------------------------------|
| **Consulta** | `POST /api/Consulta/Buscar` — listas (natural: nombres + apellidos; jurídica: razón social + comercial; opcional `NumeroId`). **Implementado** en `agilecheck-verify`. **`EsJuridico`:** por defecto `society` → `true`; `client` / `director` → `false`. Cliente jurídico en Ancori: body `es_juridico: true` o `verifyEntity(..., { es_juridico: true })`. |
| **Cliente** | Alta o localización del **cliente en AgileCheck** (`PostCliente`, `GetClienteByDocIdentidad`, etc.). Devuelve un **`idCliente` numérico** interno de AgileCheck. |
| **DetalleCalculoRiesgo** | `GET /api/DetalleCalculoRiesgo/GetDetalleCalculoRiesgoByCliente?idCliente=...` — **porcentaje / detalle del cálculo de riesgo** que ya tiene **ese** cliente en AgileCheck. **No** sustituye a `Consulta/Buscar`; se usa cuando ya existe `idCliente`. |

**Orden lógico recomendado para “todo lo que la persona/sociedad ya tiene”:**

1. **Consulta** (`Buscar`) → coincidencias en listas + contexto de la búsqueda.  
2. Si el negocio exige **riesgo formal en AgileCheck**: **Cliente** (crear o buscar por RUC) → obtener `idCliente`.  
3. **DetalleCalculoRiesgo** → detalle o % de riesgo asociado a ese `idCliente`.

En la primera versión se puede implementar solo **(1)** y dejar **(2)+(3)** cuando tengamos RUC estable y un ejemplo real de respuesta de `PostCliente` / `GetDetalleCalculoRiesgoByCliente`.

---

## Fase 2 — qué haré **yo** (código / repo) y qué harás **tú** (config + negocio)

### Yo (desarrollo en el proyecto)

- Implementar en `agilecheck-verify` la **Fase 2 real**: llamadas HTTP con `Authorization: Bearer <token>` al API de Hub (sin JSON-RPC inventado).
- **`POST /api/Consulta/Buscar`** implementado: body `ConsultaIndividualDTOIN`, listas desde `AGILECHECK_LISTA_IDS` o `GET /api/List/GetListas`, parseo de respuesta → `compliance_checks`.
- Encadenar cuando toque: **`Cliente`** + **`DetalleCalculoRiesgo`** (pendiente de acuerdo y ejemplos JSON).
- Construir el body desde `entity_name` y campos opcionales (`es_juridico`, `nombres`, `apellidos`, `numero_id`); mapear respuesta a `status`, `risk_level`, `result_summary`, `result_data`, `agilecheck_id` (`consultaId` cuando exista).
- Afinar parseo si el JSON real difiere (enviar ejemplo 200 desde Swagger).
- Si hace falta, ampliar el **body** que acepta la función (`tax_id`, `check_mode`, etc.) y documentarlo aquí y en `agilecheck-paso-a-paso.md`.
- Opcional: botón/flujo en **Sociedades** que llame a `verifyEntity('society', ...)` y muestre `getLatestCheck`.

### Tú (configuración, datos y validación)

- Confirmar **entorno**: mismos host en secrets (`pruebas` vs `app`) para token y `AGILECHECK_API_BASE`.
- Configurar secret **`AGILECHECK_LISTA_IDS`** (recomendado) con los IDs que devuelve **`GET /api/List/GetListas`** en Swagger para vuestro tenant, o pedirlos a AgileCheck.
- Probar en Swagger **una sociedad real** (o de prueba): `Buscar` con `EsJuridico: true`, nombres legales/comerciales y RUC en `NumeroId` si aplica; copiar un **ejemplo de JSON de respuesta** (200) para que el mapeo sea exacto.
- Si usamos **Cliente + DetalleCalculoRiesgo**: confirmar si el cliente jurídico se crea solo con **PostCliente** o si primero va **Buscar**; y pegar un ejemplo de respuesta con **`idCliente`**.
- Tras el deploy del código: `npx supabase functions deploy agilecheck-verify` y, si hace falta, `npx supabase secrets set AGILECHECK_QUERY_PATH=...` (si dejamos un solo path por defecto; si son varios pasos, puede que **no** uses un solo `QUERY_PATH` y lo dejemos todo en código con paths fijos del Swagger).

### Secret `AGILECHECK_QUERY_PATH` en Fase 2 “multi-endpoint”

Si la integración llama a **varios** paths en secuencia, `AGILECHECK_QUERY_PATH` puede quedar **vacío u omitido** y los paths quedan **fijos en código** (`api/Consulta/Buscar`, etc.). Si preferís un solo endpoint configurable, se define un secret por el principal (normalmente `api/Consulta/Buscar`).

---

## Lo que entendí (tu requerimiento)
Quieres que, para cada **sociedad** en la app:

- Se pueda **buscar/verificar en AgileCheck**.
- AgileCheck devuelva un **estado de cumplimiento LAFT/AML** (por ejemplo: **cumple / no cumple / requiere revisión / error**) y/o **nivel de riesgo**.
- Ese resultado se **guarde** y se **muestre** dentro de la app (en la ficha de la sociedad y/o en listados), para que el equipo tenga trazabilidad.

Esto **ya está parcialmente preparado** en el proyecto con una tabla de auditoría (`compliance_checks`) y una Edge Function (`agilecheck-verify`) que actúa como **proxy** hacia el API real de AgileCheck.

## Estado actual del codebase (ya existe)

- **Tabla**: `public.compliance_checks` (en `supabase/schema.sql`)
  - Guarda historial por entidad (cliente/director/sociedad).
  - Campos clave: `entity_type`, `entity_id`, `entity_name`, `check_type`, `status`, `risk_level`, `agilecheck_id`, `result_summary`, `result_data`, `checked_at`, `expires_at`.
- **Edge Function**: `supabase/functions/agilecheck-verify/index.ts`
  - Recibe `entity_type='society'`, `entity_id`, `entity_name`, `check_type`.
  - Obtiene token OAuth2 (`AGILECHECK_TOKEN_URL`) y llama a `callAgileCheckAPI` usando `AGILECHECK_API_BASE` + `AGILECHECK_QUERY_PATH` (el cuerpo de la petición aún debe alinearse con el Swagger real). Luego inserta en `compliance_checks`.
  - Protegida opcionalmente por header `x-ancori-secret` (`FUNCTION_SECRET`).
- **Frontend API helper**: `src/lib/agileCheckApi.ts`
  - `verifyEntity('society', societyId, societyName, checkType)`
  - `fetchComplianceChecks(...)`, `getLatestCheck(...)`
- **UI existente**: `src/pages/CumplimientoPage.tsx`
  - Dashboard de verificaciones, filtros por entidad (incluye `society`).

## Diseño propuesto para “Sociedades → Verificar en AgileCheck”

### Flujo funcional

1. Usuario abre **Sociedades** (listado o detalle).
2. Click **“Verificar en AgileCheck”**.
3. La app llama a `verifyEntity('society', society.id, society.nombre, 'full'|'PEP'|...)`.
4. La Edge Function:
   - Autentica (secret compartido).
   - Llama al API de AgileCheck (según Swagger real).
   - Mapea respuesta a:
     - `status`: `clean | match | review | error` (o equivalente)
     - `risk_level`: `bajo | medio | alto | critico` (si aplica)
     - `summary`: texto corto para UI
     - `raw_data`: JSON completo para auditoría
   - Inserta una fila en `compliance_checks`.
5. Frontend refresca y muestra:
   - **Último estado** (badge)
   - **Fecha** y **expiración**
   - Link/acción para ver **historial** (opcional).

### Qué dato usar para “buscar la sociedad” en AgileCheck
Depende de lo que AgileCheck soporte en su API. Normalmente hay 3 opciones:

- **RUC/NIT** (ideal si está limpio y es único)
- **Nombre/Razón social** (más “fuzzy”, puede dar múltiples matches)
- **Identificador interno AgileCheck** (si ya lo guardamos en `agilecheck_id`)

**Recomendación**:

- Si AgileCheck permite buscar por RUC/NIT, usar eso como clave primaria.
- Si solo permite por nombre, enviar `society.nombre` y manejar:
  - resultados múltiples → `status='review'`
  - coincidencia exacta → `match/clean` según reglas

Para esto, podríamos ampliar el request de la Edge Function para mandar:

```json
{
  "entity_type": "society",
  "entity_id": "<uuid>",
  "entity_name": "<razon social>",
  "tax_id": "<ruc/nit opcional>",
  "check_type": "full"
}
```

## Mapeo “cumple / no cumple” a nuestros estados

En la app ya existen estados normalizados:

- `clean`: sin coincidencias / cumple
- `match`: coincidencia en listas (PEP/sanciones) / no cumple o alerta alta
- `review`: requiere revisión humana (múltiples matches, score ambiguo, datos incompletos)
- `error`: fallo de API/timeout/credenciales
- `pending`: reservado para colas/async (si luego lo hacemos async)

Si AgileCheck devuelve literalmente `cumple` / `no_cumple`:

- `cumple` → `clean`
- `no_cumple` → `match` (o `review` si es “observación”)
- `observación` / `en_proceso` → `review`

Si devuelve “score” o “nivel de riesgo”, se guarda en `risk_level`.

## Persistencia y consultas (ya resuelto)

No necesitas crear una tabla nueva por sociedad. El patrón correcto es:

- Guardar **historial** en `compliance_checks`.
- Para UI rápida, consultar “último check”:
  - `getLatestCheck('society', society.id)`

Opcional (si quieres performance en listados grandes):

- Crear una **vista materializada** o una columna “denormalizada” en `societies` con:
  - `compliance_status`, `compliance_risk_level`, `compliance_checked_at`, `compliance_expires_at`
pero **no es obligatorio** (hoy ya funciona con `compliance_checks`).

## UI/UX en Sociedades (qué se agregaría)

### En listado de sociedades
- Una columna/badge: **Cumplimiento**
  - Verde: Limpio
  - Rojo: Coincidencia
  - Ámbar: Revisión
  - Gris: Sin verificar / Expirado
- Tooltip: “Última verificación: dd/mm/yyyy; expira: dd/mm/yyyy”
- Acción rápida: “Verificar” (si no está verificable o está expirado).

### En detalle/modal de sociedad
- Card “Cumplimiento (AgileCheck)”
  - Último estado + nivel de riesgo
  - Botón “Verificar ahora”
  - Tabla “Historial” (últimos N checks)

## Seguridad y configuración

### Secrets en Supabase (Edge Function)
En `supabase/functions/agilecheck-verify/index.ts` y en [`agilecheck-paso-a-paso.md`](./agilecheck-paso-a-paso.md) están documentados (flujo actual con OAuth2):

- `AGILECHECK_TOKEN_URL`, `AGILECHECK_USERNAME`, `AGILECHECK_PASSWORD`, `AGILECHECK_GRANT_TYPE`
- `AGILECHECK_API_BASE`, `AGILECHECK_QUERY_PATH`, `AGILECHECK_DB` (opcional)
- `FUNCTION_SECRET` (para proteger el endpoint)

### Secrets en Frontend
`src/lib/agileCheckApi.ts` usa:

- `VITE_SUPABASE_URL`
- `VITE_AGILECHECK_SECRET` (o fallback `VITE_QBO_SOCIETY_PUSH_SECRET`)

Recomendación:

- Usar **solo** `VITE_AGILECHECK_SECRET` para evitar mezclar con QBO.
- Mantener el secreto **no vacío** en producción.

## Cómo se conecta con el Swagger de pruebas

- **Swagger UI:** `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/`
- **OpenAPI JSON** (lista de paths): `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/docs/v1`

Endpoints ya identificados para Fase 2: ver sección **“Fase 2 — tus tres líneas de API”** arriba y [`agilecheck-paso-a-paso.md` §3.4](./agilecheck-paso-a-paso.md).

Implementación en código:

1. Ajustar `callAgileCheckAPI()` (y llamadas encadenadas si aplica) en `agilecheck-verify`.
2. Headers: `Authorization: Bearer <token>`, `Content-Type: application/json` donde corresponda.
3. Payload y parseo según respuestas reales → `status`, `risk_level`, `summary`, `raw_data` en `compliance_checks`.

## Pasos concretos de implementación (checklist)

1. **Confirmar qué campo busca AgileCheck**
   - ¿RUC/NIT? ¿razón social? ¿ambos?
2. **Ajustar Edge Function** `agilecheck-verify`
   - Reemplazar el endpoint placeholder `${apiUrl}/check` por el endpoint real del Swagger
   - Mapear respuesta → `status/risk_level/summary/raw_data`
3. **En Sociedades UI**
   - Agregar botón “Verificar en AgileCheck” (reusar `verifyEntity`)
   - Mostrar `getLatestCheck('society', society.id)` en la vista
4. **Reglas de expiración**
   - Hoy la Edge Function pone expiración 6 meses.
   - Ajustar según política (ej. 3/6/12 meses por tipo de check).
5. **(Opcional) Automatización**
   - Job programado (cron) para re-verificar expirados.

## Preguntas mínimas que necesito del lado AgileCheck (para cerrar el mapeo)

- ¿El Swagger devuelve un campo explícito tipo `cumple`/`no_cumple` o devuelve “matches”/“score”?
- ¿Se consulta por **RUC/NIT** o por **nombre**?
- ¿Devuelve un `agilecheck_id` estable para guardar y reusar?

