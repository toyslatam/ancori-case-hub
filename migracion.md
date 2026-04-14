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
| Tipo de Sociedad | Desplegable: **SOCIEDADES**, **FUNDACIONES**, **B.V.I** | `tipo_sociedad` | `tipo_sociedad` (`TipoSociedad`) |
| Correo | Texto | `correo` | `correo` |
| Cliente | Desplegable (muestra nombre del cliente) | `client_id` FK `public.clients(id)` | `client_id` (UUID del cliente) |
| ID_QB | Numérico (opcional) | `id_qb` (integer, nullable) | `id_qb` |
| RUC | Texto | `ruc` | `ruc` |
| DV | Texto | `dv` | `dv` |
| NIT | Texto | `nit` | `nit` |
| Presidente | Desplegable (nombre del director) | `presidente_id` FK `public.directores(id)`, nullable | `presidente_id` |
| Tesorero | Desplegable (nombre director) | `tesorero_id` FK `public.directores(id)`, nullable | `tesorero_id` |
| Secretario | Desplegable (nombre director) | `secretario_id` FK `public.directores(id)`, nullable | `secretario_id` |
| Pago Tasa Única | Texto | `pago_tasa_unica` | `pago_tasa_unica` |
| Fecha Insc. | Fecha | `fecha_inscripcion` (date, nullable) | `fecha_inscripcion` (`YYYY-MM-DD` opcional) |
| Semestre | Solo lectura: **1** o **2** | *No hay columna en base* | Calculado: meses 1-6 = 1, 7-12 = 2 |

**Claves técnicas:**

- La PK de sociedad es **`id` (UUID)**. `client_id`, `presidente_id`, `tesorero_id` y `secretario_id` deben ser **UUID existentes** en `clients` y `directores`.
- **Orden de migración:** cargar **`clients`** y **`directores`** antes que **`societies`**.
- **Tipo de sociedad:** debe coincidir con uno de los tres literales **`SOCIEDADES`**, **`FUNDACIONES`**, **`B.V.I`**.

#### Import con **muchas celdas vacías** (errores `22P02` en columnas UUID)

- **`invalid input syntax for type uuid: ""`**: la celda llega como cadena vacía. Solución: celda vacía sin comillas, o quitar esas columnas del CSV.
- **`invalid input syntax for type uuid: "NULL"`**: el CSV trae la palabra `NULL` como texto. Solución: reemplaza `NULL` por celda vacía en columnas UUID.

```sql
-- Tabla staging para importar con texto libre
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

-- Después de importar el CSV a la staging, insertar en societies:
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

## 2. Prerrequisitos en Supabase

1. Ejecutar el esquema del proyecto: `supabase/schema.sql` en el **SQL Editor** del panel de Supabase.
2. Confirmar que `public.clients` y `public.directores` existen con las columnas descritas arriba.

## 3. Exportar datos desde SharePoint

### Opción A — Vista de Excel / exportación a Excel

1. En la lista **Anc_Clientes**, usa **Exportar a Excel** o abre en **vista de hoja** y copia con encabezados.
2. Normaliza columnas en Excel para que coincidan con nombres lógicos: `nombre`, `razon_social`, `email`, `telefono`, `activo`, `numero`, `created_at`.
3. Guarda como **CSV UTF-8** (importante para tildes y ñ).

### Opción B — Power Automate / flujo

Flujo que lea ítems de la lista y escriba filas en un archivo CSV o llame a Supabase REST con service role solo en backend.

### Opción C — Microsoft Graph API

Adecuada si hay muchos registros o migración repetible: aplicación registrada en Entra ID con permisos a SharePoint, script Node/Python que pagina la lista y genera SQL.

## 4. Transformación de datos (reglas prácticas)

- **Activo:** en CSV suele venir como `Sí`/`No`, `1`/`0`. Convierte a booleano SQL: `true` / `false`.
- **Creado:** convierte a ISO `YYYY-MM-DD` o `YYYY-MM-DDTHH:mm:ssZ` para `timestamptz`.
- **numero:** puedes importar el **ID** de SharePoint en `numero`. Después ajusta la secuencia: `SELECT setval('public.clients_numero_seq', (SELECT COALESCE(MAX(numero),1) FROM public.clients));`
- **id (UUID):** cada fila nueva debe tener `gen_random_uuid()`.

## 5. Importar en Supabase

### 5.1 Desde CSV (Table Editor)

1. Supabase → **Table Editor** → `clients` → **Insert** → **Import data from CSV**.
2. Mapea columnas del CSV a columnas de la tabla.

### 5.2 SQL generado (control total)

```sql
insert into public.clients (id, nombre, razon_social, numero, email, telefono, activo, created_at)
values
  (gen_random_uuid(), 'NOMBRE', 'RAZON', 123, 'correo@ejemplo.com', '', true, '2023-11-06T12:00:00Z');
```

## 6. Orden recomendado si migras más listas

1. **Clientes** (`clients`) primero.
2. **Directores** (`directores`) en paralelo con clientes.
3. **Categorías** (`categories`) — desde QBO vía webhook o manualmente en Utilidades → Categorías.
4. **Servicios** (`services`) después de categorías (ver sección 9).
5. **Sociedades** (`societies`) después de clients y directores.
6. Resto de catálogos y **casos** al final.

## 7. Verificación post-migración

- En **Table Editor**, revisa conteos y algunas filas al azar.
- En la app, abre **Mantenimiento → Clientes**, **Directores** y **Sociedades**; comprueba búsqueda, filtros y edición.

## 8. Resumen en una frase

**Clientes:** exportas **Anc_Clientes** a CSV, mapeas columnas a `nombre`, `razon_social`, `email`, `telefono`, `activo`, `numero`, `created_at`, generas `id` UUID por fila, e importas en `public.clients` con SQL o asistente de Supabase, y reajustas la secuencia de `numero` para altas nuevas desde la aplicación.

**Sociedades:** después de tener **UUID** de `clients` y `directores`, importas filas en `public.societies` con los campos del formulario; el **semestre** lo calcula la app, no el CSV.

---

## 9. Migración — Servicios (`public.services`)

Campos: **Nombre Servicio**, **Categorías**, **ID QB**.

### Paso 1 — Alteración de tabla (una sola vez en SQL Editor)

```sql
alter table public.services
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists id_qb integer;
```

### Paso 2 — Importar servicios

> Primero deben existir las categorías en **Utilidades → Categorías**.

```sql
insert into public.services (id, nombre, category_id, id_qb)
values
  (gen_random_uuid(), 'Sociedad Anonima',                         (select id from public.categories where upper(nombre) = upper('CONSTITUCION DE PERSONA JURIDICA') limit 1), null),
  (gen_random_uuid(), 'Sociedad de Responsabilidad Limitada',     (select id from public.categories where upper(nombre) = upper('CONSTITUCION DE PERSONA JURIDICA') limit 1), null),
  (gen_random_uuid(), 'Fundaciones de Interes Privado',           (select id from public.categories where upper(nombre) = upper('CONSTITUCION DE PERSONA JURIDICA') limit 1), null),
  (gen_random_uuid(), 'SOCIEDADES DE JURISDICCION EXTRANJERA',    (select id from public.categories where upper(nombre) = upper('CONSTITUCION DE PERSONA JURIDICA') limit 1), null),
  (gen_random_uuid(), 'COMPRAVENTAS',                             (select id from public.categories where upper(nombre) = upper('COMPRAVENTAS') limit 1),                     null),
  (gen_random_uuid(), 'Servicios Bancarios',                      (select id from public.categories where upper(nombre) = upper('BANCARIOS') limit 1),                        null),
  (gen_random_uuid(), 'OTROS SERVICIOS CORPORATIVOS',             (select id from public.categories where upper(nombre) = upper('OTROS SERVICIOS CORPORATIVOS') limit 1),     null),
  (gen_random_uuid(), 'SERVICIOS TERCERIZADOS',                   (select id from public.categories where upper(nombre) = upper('SERVICIOS TERCERIZADOS') limit 1),           null),
  (gen_random_uuid(), 'OTROS SERVICIOS DE LA FIRMA',              (select id from public.categories where upper(nombre) = upper('OTROS SERVICIOS DE LA FIRMA') limit 1),      null)
on conflict do nothing;
```

### Paso 3 — Verificar

```sql
select s.nombre, c.nombre as categorias, s.id_qb
from public.services s
left join public.categories c on c.id = s.category_id
order by s.nombre;
```
