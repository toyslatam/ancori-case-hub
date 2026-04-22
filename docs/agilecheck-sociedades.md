# Integración AgileCheck → Sociedades (LAFT/PEP) en Ancori Case Hub

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
  - Llama a `callAgileCheckAPI(name, checkType)` (actualmente con endpoint **placeholder** `/check`) y luego inserta en `compliance_checks`.
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
En `supabase/functions/agilecheck-verify/index.ts` ya están documentados:

- `AGILECHECK_API_URL`
- `AGILECHECK_API_KEY`
- `AGILECHECK_DB` (si aplica)
- `FUNCTION_SECRET` (para proteger el endpoint)

### Secrets en Frontend
`src/lib/agileCheckApi.ts` usa:

- `VITE_SUPABASE_URL`
- `VITE_AGILECHECK_SECRET` (o fallback `VITE_QBO_SOCIETY_PUSH_SECRET`)

Recomendación:

- Usar **solo** `VITE_AGILECHECK_SECRET` para evitar mezclar con QBO.
- Mantener el secreto **no vacío** en producción.

## Cómo se conectaría con el Swagger de prueba que compartiste
El link que enviaste es un Swagger UI:

- `https://pruebas.agilecheck.io/HubQueryEngine_agilecheck/swagger/ui/index#/`

En este entorno, el Swagger no respondió desde mi fetch (HTTP 500), así que no pude enumerar endpoints. Pero el “encaje” es directo:

1. Identificar en Swagger:
   - endpoint de **búsqueda/consulta** por “sociedad” (por nombre o tax id)
   - estructura de respuesta (estado/flags)
2. Ajustar `callAgileCheckAPI()` en la Edge Function para:
   - URL/paths reales
   - headers (API key, token, etc.)
   - payload exacto (query params/body)
   - parseo de respuesta para poblar `status`, `risk_level`, `summary`, `raw_data`

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

