# Migración SharePoint → Supabase (Clientes, Directores y otras listas)

Este documento explica cómo pasar listas de SharePoint (**Anc_Clientes**, **Directores**, **Sociedades**, etc.) a **Supabase**, alineadas con las tablas `public.clients`, `public.directores`, `public.societies`, etc., que usa **Plataforma Ancori**.

## 1. Qué tienes hoy en SharePoint

En la lista **Anc_Clientes** los campos visibles equivalentes son:

| Columna SharePoint | Significado |
|--------------------|-------------|
| Nombre Cliente | Nombre comercial o persona |
| Razon Social | Razón social o nombre fiscal (puede incluir NIT en el texto) |
| Correo | Email |
| Telefono | Teléfono |
| Activo | Sí / No (checkbox) |
| ID | Identificador numérico de la lista (correlativo en SharePoint) |
| Creado | Fecha de creación del ítem |

En la aplicación web, eso se refleja así:

| SharePoint | Supabase (`public.clients`) | TypeScript (`Client` en `mockData.ts`) |
|------------|-----------------------------|----------------------------------------|
| Nombre Cliente | `nombre` | `nombre` |
| Razon Social | `razon_social` | `razon_social` |
| Correo | `email` | `email` |
| Telefono | `telefono` | `telefono` |
| Activo | `activo` | `activo` |
| ID (numérico lista) | `numero` (único, correlativo de negocio) | `numero` |
| Creado | `created_at` (timestamptz) | `created_at` (string fecha ISO o `YYYY-MM-DD`) |

**Clave técnica en Supabase:** la clave primaria es **`id` (UUID)**. El valor **ID de SharePoint** no sustituye al UUID; se guarda en **`numero`** para mantener el correlativo que ves en pantalla y en informes. Si necesitas conservar el ID numérico original de SharePoint como referencia histórica, puedes añadir en el futuro una columna `sharepoint_id integer` única; hoy el diseño usa `numero` como correlativo de aplicación.

Campos extra que ya existen en `clients` y la app (por compatibilidad / QuickBooks): `identificacion`, `direccion`, `quickbooks_customer_id`, `observaciones`. Pueden quedar vacíos al migrar desde SharePoint si la lista no los tiene.

### Lista **Directores** (mantenimiento)

En SharePoint la lista de directores muestra columnas equivalentes a:

| Columna SharePoint | Supabase (`public.directores`) | TypeScript (`Director` en `mockData.ts`) |
|--------------------|--------------------------------|-------------------------------------------|
| Título (nombre) | `nombre` | `nombre` |
| Comentarios | `comentarios` | `comentarios` |
| Activo | `activo` | `activo` |
| Fecha Vencimiento Documento | `fecha_vencimiento_documento` (date, puede ser NULL) | `fecha_vencimiento_documento` (string `YYYY-MM-DD` opcional) |
| Tipo Documento (Cédula / Pasaporte / Otro) | `tipo_documento` con valores exactos **`Cedula`**, **`Pasaporte`**, **`Otro`** | `tipo_documento` (`TipoDocumentoDirector`) |
| Creado | `created_at` | `created_at` |

**Clave técnica:** la PK es **`id` (UUID)**. Si en SharePoint solo existe un ID de lista, no es obligatorio conservarlo en base: puedes generar `gen_random_uuid()` por fila y usar una columna futura `sharepoint_item_id` si necesitas trazabilidad.

**Importación:** el `CHECK` de `tipo_documento` solo acepta **`Cedula`**, **`Pasaporte`**, **`Otro`**. Si el CSV trae la columna vacía o `NULL`, el esquema del repo aplica **valor por defecto `Cedula`** y un **trigger** `trg_directores_set_tipo_documento` que rellena y normaliza (p. ej. `cédula` / `CEDULA` → `Cedula`) antes de validar; ejecuta la sección correspondiente de `supabase/schema.sql` en tu proyecto Supabase si aún no la tienes. Fechas vacías en vencimiento → `NULL` en SQL.

### Lista **Sociedades** (mantenimiento)

En la app (**Mantenimiento → Sociedades**) los campos de negocio se alinean con la tabla `public.societies` así:

| Campo en pantalla / formulario | Tipo en UI | Supabase (`public.societies`) | TypeScript (`Society` en `mockData.ts`) |
|--------------------------------|------------|--------------------------------|------------------------------------------|
| Nombre Sociedad | Texto | `nombre` | `nombre` |
| Razón Social | Texto | `razon_social` | `razon_social` |
| Tipo de Sociedad | Desplegable: **SOCIEDADES**, **FUNDACIONES**, **B.V.I** (texto exacto) | `tipo_sociedad` | `tipo_sociedad` (`TipoSociedad`) |
| Correo | Texto | `correo` | `correo` |
| Cliente | Desplegable (muestra nombre del cliente) | `client_id` → FK `public.clients(id)` | `client_id` (UUID del cliente) |
| ID_QB | Numérico (opcional) | `id_qb` (integer, nullable) | `id_qb` |
| RUC | Texto | `ruc` | `ruc` |
| DV | Texto | `dv` | `dv` |
| NIT | Texto | `nit` | `nit` |
| Presidente | Desplegable (muestra nombre del director) | `presidente_id` → FK `public.directores(id)`, nullable | `presidente_id` |
| Tesorero | Desplegable (nombre director) | `tesorero_id` → FK `public.directores(id)`, nullable | `tesorero_id` |
| Secretario | Desplegable (nombre director) | `secretario_id` → FK `public.directores(id)`, nullable | `secretario_id` |
| Pago Tasa Única | Texto | `pago_tasa_unica` | `pago_tasa_unica` |
| Fecha Insc. | Fecha | `fecha_inscripcion` (date, nullable) | `fecha_inscripcion` (`YYYY-MM-DD` opcional) |
| Semestre | Solo lectura en formulario: **1** o **2** según el mes de fecha inscripción | *No hay columna en base* | Calculado en app: meses **1–6 → 1**, **7–12 → 2** (`semestreFromFechaInscripcion`) |

**Listado principal (tabla):** se muestran Nombre Sociedad, Cliente (nombre resuelto), Tipo (badge), RUC, DV, NIT, Presidente, Tesorero, Secretario (nombres resueltos), Fecha Inscripción. Razón social, correo, ID_QB, pago tasa única y semestre aparecen en el **formulario** de alta/edición y entran en **búsqueda y filtros** según la pantalla.

**Claves técnicas:**

- La PK de sociedad es **`id` (UUID)**. `client_id`, `presidente_id`, `tesorero_id` y `secretario_id` deben ser **UUID existentes** en `clients` y `directores`; en CSV/import no uses el nombre visible como valor de esas columnas salvo que hagas un paso previo de **mapeo nombre → UUID**.
- **Orden de migración:** cargar **`clients`** y **`directores`** antes que **`societies`**, para que las FK no fallen.
- **Tipo de sociedad:** en base y CSV debe coincidir con uno de los tres literales **`SOCIEDADES`**, **`FUNDACIONES`**, **`B.V.I`** (incluido el punto en `B.V.I`). Valores antiguos tipo `S.A.` conviene normalizarlos en Excel o con un `UPDATE` antes de imponer reglas estrictas.
- **Semestre:** no se persiste en Postgres en el diseño actual; si lo necesitas en informes SQL, puedes añadir una columna generada o un `EXTRACT(MONTH FROM fecha_inscripcion)` en vistas.

**Columnas que siguen en `societies` por compatibilidad** (pueden quedar vacías al migrar solo desde SharePoint “sociedades”): `telefono`, `identificacion_fiscal`, `quickbooks_customer_id`, `activo`, `created_at`.

#### Import con **muchas celdas vacías** (errores `22P02` en columnas UUID)

**Sí puedes importar**, siempre que lo “vacío” llegue a Postgres como **`NULL` de verdad**, no como texto inválido.

- **`invalid input syntax for type uuid: ""`**: la celda llega como **cadena vacía** `""`. Solución: celda vacía sin comillas, o quitar esas columnas del CSV.
- **`invalid input syntax for type uuid: "NULL"`**: el CSV trae la **palabra** `NULL` (cuatro letras) como texto. Eso **no** es un UUID ni es el NULL de SQL. Solución: en Excel o en el editor de texto, **reemplaza todo** `NULL` por **celda vacía** en columnas UUID (`client_id`, `presidente_id`, `tesorero_id`, `secretario_id`, `id`). Muchas exportaciones (SQL, Python `to_csv`, etc.) escriben el literal `NULL` en el archivo; el import de Supabase lo interpreta como string.

El importador del Table Editor a veces manda `""` en columnas UUID y por eso falla (`22P02`), **antes** de que un trigger pueda corregirlo.

**Qué sí puede ir vacío (opcional):** `presidente_id`, `tesorero_id`, `secretario_id`, `fecha_inscripcion`, `id_qb`, textos como `ruc` / `dv` / `nit` (según defaults de tu tabla).

**Qué no puede ir vacío:** `client_id` (cada sociedad debe tener un cliente; UUID válido de `clients`).

**Formas prácticas si tienes muchas filas sin presidente/tesorero/secretario:**

1. **Quitar del CSV** las columnas `presidente_id`, `tesorero_id` y `secretario_id` (si el asistente deja el resto). Al no venir en el archivo, Postgres suele rellenarlas con **`NULL`** por defecto.
2. En Excel: celda **realmente vacía** (no fórmula `=""` ni comillas). Guarda CSV UTF-8 y vuelve a importar.
3. **Tabla temporal en `text`** (recomendado si el CSV trae nombres o mezcla basura): creas una tabla staging con columnas `text`, importas el CSV ahí sin FK, y luego insertas en `societies` convirtiendo vacíos a `NULL` y textos a UUID:

```sql
-- Ejemplo: ajusta nombres de columnas a tu CSV. client_id_text debe ser UUID válido por fila.
create table if not exists public.societies_import_stage (
  client_id text not null,
  nombre text not null,
  razon_social text,
  tipo_sociedad text,
  correo text,
  presidente_id text,
  tesorero_id text,
  secretario_id text,
  ruc text, dv text, nit text,
  id_qb text,
  pago_tasa_unica text,
  fecha_inscripcion text
);

-- 1) Importa Sociedades.csv en societies_import_stage (Table Editor → esa tabla).
-- 2) Inserta en societies convirtiendo '' → NULL en UUID opcionales:

insert into public.societies (
  client_id, nombre, razon_social, tipo_sociedad, correo,
  presidente_id, tesorero_id, secretario_id,
  ruc, dv, nit, id_qb, pago_tasa_unica, fecha_inscripcion,
  telefono, activo, created_at
)
select
  s.client_id::uuid,
  trim(s.nombre),
  coalesce(nullif(trim(s.razon_social), ''), ''),
  trim(s.tipo_sociedad),
  nullif(trim(s.correo), ''),
  nullif(trim(s.presidente_id), '')::uuid,
  nullif(trim(s.tesorero_id), '')::uuid,
  nullif(trim(s.secretario_id), '')::uuid,
  coalesce(nullif(trim(s.ruc), ''), ''),
  coalesce(nullif(trim(s.dv), ''), ''),
  coalesce(nullif(trim(s.nit), ''), ''),
  nullif(trim(s.id_qb), '')::integer,
  coalesce(nullif(trim(s.pago_tasa_unica), ''), ''),
  nullif(trim(s.fecha_inscripcion), '')::date,
  '',
  true,
  now()
from public.societies_import_stage s;
```

Si `nullif(trim(x),'')::uuid` falla porque el texto no es UUID, corrige esa celda o deja la columna en el `INSERT` solo cuando tengas UUID válido (puedes usar `CASE WHEN trim(s.presidente_id) = '' THEN NULL ELSE trim(s.presidente_id)::uuid END`).

## 2. Prerrequisitos en Supabase

1. Ejecutar el esquema del proyecto: `supabase/schema.sql` en el **SQL Editor** del panel de Supabase (o tu pipeline de migraciones).
2. Confirmar que `public.clients` y `public.directores` existen con las columnas descritas arriba, y que `public.societies` incluye al menos: `id`, `client_id`, `nombre`, `razon_social`, `tipo_sociedad`, `correo`, `telefono`, `activo`, `created_at`, y las columnas extendidas (`id_qb`, `ruc`, `dv`, `nit`, `presidente_id`, `tesorero_id`, `secretario_id`, `pago_tasa_unica`, `fecha_inscripcion`) según el bloque `ALTER` del `schema.sql`.

## 3. Exportar datos desde SharePoint

Elige **una** vía (la que te resulte más simple en tu tenant):

### Opción A — Vista de Excel / exportación a Excel

1. En la lista **Anc_Clientes**, usa **Exportar a Excel** o abre en **vista de hoja** y copia con encabezados.
2. Normaliza columnas en Excel para que coincidan con nombres lógicos: `nombre`, `razon_social`, `email`, `telefono`, `activo`, `numero`, `created_at`.
3. Guarda como **CSV UTF-8** (importante para tildes y ñ).

### Opción B — Power Automate / flujo

1. Flujo que lea ítems de la lista **Anc_Clientes** y escriba filas en un archivo CSV en OneDrive/SharePoint o envíe a un script HTTP que inserte en Supabase (requiere **service role** solo en backend, nunca en el navegador).

### Opción C — Microsoft Graph API

Adecuada si hay muchos registros o migración repetible: aplicación registrada en Entra ID con permisos a SharePoint, script Node/Python que pagina la lista y genera SQL o llama a la API REST de Supabase.

## 4. Transformación de datos (reglas prácticas)

- **Activo:** en CSV suele venir como `Sí`/`No`, `1`/`0`, o checkbox. Convierte a booleano SQL: `true` / `false`.
- **Creado:** SharePoint suele devolver fecha/hora. Convierte a ISO `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm:ssZ` para `timestamptz`. Si solo tienes día, usa medianoche UTC o la zona que definas con el equipo.
- **Telefono / Correo:** texto; celdas vacías → cadena vacía o `NULL` según prefieras (la app tolera strings vacíos).
- **numero:** puedes importar el **ID** de SharePoint en `numero` para conservar el correlativo visible. Después de importar, ajusta la secuencia `clients_numero_seq` con `SELECT setval('public.clients_numero_seq', (SELECT COALESCE(MAX(numero),1) FROM public.clients));` para que los **nuevos** clientes en la app no choquen.
- **id (UUID):** cada fila nueva en Supabase debe tener `gen_random_uuid()` si no la generas en el script (recomendado).

## 5. Importar en Supabase

### 5.1 Desde CSV (Table Editor)

1. Supabase → **Table Editor** → `clients` → **Insert** → **Import data from CSV** (si tu plan lo permite).
2. Mapea columnas del CSV a columnas de la tabla. **No** omitas `id` si ya generaste UUIDs en el CSV; si el import espera solo columnas “de negocio”, deja que `id` y defaults los rellene la tabla (según lo que permita el asistente).

### 5.2 SQL generado (control total)

1. A partir del CSV, con Excel fórmulas o un script, genera sentencias `INSERT`:

```sql
insert into public.clients (id, nombre, razon_social, numero, email, telefono, activo, created_at)
values
  (gen_random_uuid(), 'NOMBRE', 'RAZON', 123, 'correo@ejemplo.com', '', true, '2023-11-06T12:00:00Z');
```

2. Ejecuta por lotes en el **SQL Editor** (bloques de cientos o miles de filas según límites de tiempo de sesión).

### 5.3 `COPY` desde Postgres (avanzado)

Si tienes acceso directo a Postgres (misma `DATABASE_URL` que usas para `npm run seed:db`), puedes usar `\copy` desde `psql` cargando un CSV a una tabla staging y luego `INSERT INTO clients SELECT ...` con transformaciones.

## 6. Orden recomendado si migras más listas

1. **Clientes** (`clients`) primero.
2. **Directores** (`directores`) cuando convenga: no depende de otras tablas del esquema actual; puedes importarla en paralelo con otros catálogos.
3. **Sociedades** (`societies`) después, porque `client_id` debe existir en `clients.id` (UUID). Si en SharePoint las sociedades guardan el **ID numérico** del cliente, necesitas una tabla de correspondencia **SharePoint ID → UUID** generada en el paso 1 antes de insertar sociedades.
4. Resto de catálogos y **casos** al final, respetando FKs del `schema.sql`.

## 7. Verificación post-migración

- En **Table Editor**, revisa conteos y algunas filas al azar.
- En la app (`npm run dev` con `.env.local` apuntando al proyecto), abre **Mantenimiento → Clientes**, **Directores** y **Sociedades**; comprueba búsqueda, filtros, vínculo cliente/directores en el formulario de sociedad y edición.
- Si usas RLS en el futuro, revisa políticas para el rol `anon` / `authenticated`; el esquema actual del repo incluye grants básicos para desarrollo.

## 8. Resumen en una frase

**Clientes:** exportas **Anc_Clientes** a CSV, mapeas columnas a `nombre`, `razon_social`, `email`, `telefono`, `activo`, `numero`, `created_at`, generas `id` UUID por fila, e importas en `public.clients` con SQL o asistente de Supabase, y reajustas la secuencia de `numero` para altas nuevas desde la aplicación.

**Sociedades:** después de tener **UUID** de `clients` y `directores`, importas filas en `public.societies` con los campos de la tabla de la sección “Lista Sociedades” (`client_id`, `nombre`, `razon_social`, `tipo_sociedad` ∈ {SOCIEDADES, FUNDACIONES, B.V.I}, correo, id_qb, ruc, dv, nit, presidente_id, tesorero_id, secretario_id, pago_tasa_unica, fecha_inscripcion); el **semestre** lo calcula la app, no el CSV.
