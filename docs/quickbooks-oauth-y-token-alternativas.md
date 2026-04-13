# QuickBooks Online (API): OAuth y alternativas para refrescar el token sin Render de pago

Este documento resume **cómo funciona la autenticación** de QuickBooks Online (QBO) y **dónde ejecutar** la lógica que renueva el *access token* (aprox. cada hora) **sin depender de un servicio pago** tipo Render solo para eso.

## Cómo piensa Intuit el token

- **OAuth 2.0**: tu app obtiene un **access token** (corta duración, típicamente **~1 hora**) y un **refresh token** (larga duración).
- Las llamadas a la API de QBO llevan el **access token** en el encabezado `Authorization: Bearer …`.
- Cuando el access token expira, tu **backend** (nunca el navegador del usuario final) debe llamar al endpoint de **refresh** de Intuit con el `client_id`, `client_secret` y el **refresh token** guardados de forma segura.
- Intuit puede **rotar** el refresh token en cada renovación: debes **persistir el nuevo refresh token** que devuelve la respuesta y dejar de usar el anterior.

**Importante:** el `client_secret` y el refresh token **no deben vivir** en el frontend (Vite/React) ni en repositorios públicos. Van en variables de entorno de un entorno **servidor** o en un secret manager.

## Por qué “algo” tiene que ejecutarse periódicamente

No es obligatorio un cron **exactamente cada hora**. Opciones habituales:

1. **Renovar bajo demanda**: antes de cada llamada a QBO, si el access token está caducado o falta poco para caducar, llamas al refresh y sigues. Eso implica un **endpoint servidor** (o función serverless) que la app o un job invoque.
2. **Renovar en segundo plano**: un cron cada 30–50 minutos mantiene un access token “fresco” en base de datos o en caché, para que procesos batch no fallen a la hora.

En ambos casos hace falta **código que corre en servidor** con acceso a secretos; la diferencia es si lo disparas por **tiempo** (cron) o por **evento** (antes de usar la API).

## Alternativas económicas a “un servicio siempre encendido” en Render

Abajo, enfoques que suelen encajar en proyectos pequeños o con **Supabase** ya en uso (como Plataforma Ancori).

### 1. Supabase Edge Functions + programación externa gratuita

- **Qué es:** funciones Deno alojadas en Supabase; pueden leer/escribir en Postgres (tokens cifrados o en tabla `secrets`) y llamar a la API de Intuit.
- **Cron:** Supabase ha ido ampliando opciones de **schedules** sobre Edge Functions (revisa la documentación actual de tu plan: *Scheduled Functions* / integraciones).
- **Si no hay cron nativo en tu plan:** cualquier **ping HTTP gratuito** (ver sección 4) puede invocar cada X minutos una URL que ejecute solo el refresh.

**Ventaja:** mismo ecosistema que ya usas para datos; un solo lugar para guardar tokens en tabla con RLS restringida al `service_role`.

**Desventaja:** límites de invocaciones y CPU según plan; hay que medir.

### 2. Vercel / Netlify / similar: función serverless + Cron integrado

- **Qué es:** una **Serverless Function** (Node) que hace el refresh y guarda tokens en Supabase (o en el propio secret store del proveedor).
- **Cron:** Vercel tiene [Cron Jobs](https://vercel.com/docs/cron-jobs) en planes que lo permiten; frecuencia mínima suele ser **diaria** en el tier gratuito (depende del proveedor). Para **cada hora** a veces hace falta plan de pago **o** combinar con otro disparador (p. ej. GitHub Actions cada hora que llame a la función).
- **Netlify** tiene *Scheduled Functions* con reglas similares según plan.

**Ventaja:** encaja si ya despliegas el front en Vercel.

**Desventaja:** el cron “cada hora” en gratis no siempre está disponible; revisar límites actuales.

### 3. Cloudflare Workers + Cron Triggers

- **Qué es:** Worker con **Cron Trigger** (p. ej. cada 30 min) que ejecuta el refresh y escribe el resultado vía **Supabase REST** (service key solo en el Worker, como *secret*) o en **KV/Durable Objects** de Cloudflare.

**Ventaja:** generoso free tier para Workers y crons; latencia baja.

**Desventaja:** otro panel y despliegue; cuidado con rotación de refresh token y persistencia consistente.

### 4. GitHub Actions (workflow programado) — suele ser **gratis** para repos privados con límites razonables

- **Qué es:** un workflow `on: schedule: cron: '0 * * * *'` (cada hora) que ejecuta un script (Node) con **secrets** de GitHub (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`, etc.).
- El script llama a Intuit, obtiene tokens nuevos y los escribe en **Supabase** con la URL `service_role` (cuidado: el secret de service role solo en GitHub Secrets, nunca en logs).

**Ventaja:** sin coste extra para “un ping por hora”; muy útil como **MVP** o respaldo.

**Desventajas:** los minutos de Actions son limitados; no es ideal si necesitas muchas ejecuciones diarias o SLA estricto; el repositorio debe ser confiable (quién tiene acceso al repo tiene acceso a rotar secretos).

### 5. Fly.io / Railway / Koyeb — tiers gratuitos o de bajo coste

- **Qué es:** un contenedor mínimo o **process** que duerme o corre un cron interno (`node` + `node-cron` o sistema cron).
- Algunos ofrecen **créditos gratuitos** o máquinas compartidas baratas comparado con Render “siempre encendido” caro.

**Ventaja:** control total como en Render, a veces más barato o con free tier.

**Desventaja:** hay que mantener el contenedor y secretos.

### 6. “Solo bajo demanda” sin cron: endpoint en Edge Function

- No programas cada hora: expones `POST /internal/qbo/ensure-token` (protegido con un **secret de cabecera** o *Supabase JWT* solo para admins).
- La **app** o un **script local** llama a ese endpoint antes de sincronizar sociedades con QBO.
- La función verifica expiración (`expires_at` en BD); si falta menos de 5 minutos, refresca.

**Ventaja:** cero cron; menos piezas.

**Desventaja:** si nadie usa la app durante días, el primer job largo podría necesitar refresh; sigue siendo válido si el refresh token no ha expirado por inactividad de Intuit (revisa la política actual de Intuit).

## Comparación rápida

| Enfoque | Coste típico | Cron ~1 h | Encaja con Supabase |
|--------|----------------|------------|----------------------|
| Render (web service siempre ON) | Pago frecuente | Sí | Sí (HTTP a tu API) |
| Supabase Edge Function | Plan actual | Depende / ping externo | Nativo |
| Vercel Cron + función | Gratis limitado | A veces no en gratis | Sí (escribe en DB) |
| Cloudflare Worker + Cron | Free tier amplio | Sí | Sí |
| GitHub Actions schedule | Gratis con límites | Sí | Sí |
| Refresh solo bajo demanda | Mínimo | No necesario | Sí |

## Recomendación práctica para este proyecto (Vite + Supabase)

1. **Corto plazo / barato:** **GitHub Actions cada 45–60 min** o **Cloudflare Worker con Cron** que refresque y guarde `access_token`, `refresh_token` (si rota), `expires_at` en una tabla `qbo_oauth` en Supabase (acceso solo `service_role`).
2. **Medio plazo:** **Supabase Edge Function** con la misma lógica y disparo por **cron del proveedor** o por **llamada programada** desde Cloudflare/GitHub.
3. **Producto:** combinar **refresh bajo demanda** (cuando un usuario admin pulse “Sincronizar con QuickBooks”) con un **cron ligero** como red de seguridad para que no caduque en horas muertas.

## Checklist de implementación (cuando programemos la conexión)

- [ ] App registrada en [Intuit Developer](https://developer.intuit.com/) con redirect URI HTTPS válida.
- [ ] Flujo OAuth web: obtener primer `refresh_token` (una vez, pantalla de consentimiento).
- [ ] Tabla o almacén para `access_token`, `refresh_token`, `expires_at`, `realmId` (company).
- [ ] Código de refresh centralizado (una sola función) que actualice tokens de forma atómica (evitar dos refreshes concurrentes).
- [ ] Logs sin imprimir secretos; alertas si el refresh falla (refresh token revocado).

## Referencias oficiales

- [Intuit OAuth 2.0](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0)
- [Refresh token policy](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/faq#how-long-do-refresh-and-access-tokens-last) (vigencia y rotación; revisar siempre la versión actual de la doc).

---

*Documento orientado al equipo Ancori / CT Auditores. Cuando definan el proveedor elegido (p. ej. Edge Functions + Cloudflare Cron), se puede añadir una segunda guía con pasos concretos y variables de entorno del repo.*
