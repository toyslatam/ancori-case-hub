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

Agrega las columnas nuevas y elimina las que ya no se usan:

```sql
-- Agregar columnas nuevas (si no existen)
alter table public.services
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists id_qb integer;

-- Eliminar columnas que ya no se usan
alter table public.services
  drop column if exists descripcion,
  drop column if exists codigo,
  drop column if exists tarifa_base;
```

### Paso 2 — Preparar el CSV

Crea un archivo `servicios.csv` en Excel con exactamente estas 3 columnas y guárdalo como **CSV UTF-8**:

```
nombre,categoria_nombre,id_qb
Sociedad Anonima,CONSTITUCION DE PERSONA JURIDICA,
Sociedad de Responsabilidad Limitada,CONSTITUCION DE PERSONA JURIDICA,
Fundaciones de Interes Privado,CONSTITUCION DE PERSONA JURIDICA,
SOCIEDADES DE JURISDICCION EXTRANJERA,CONSTITUCION DE PERSONA JURIDICA,
COMPRAVENTAS,COMPRAVENTAS,
Servicios Bancarios,BANCARIOS,
OTROS SERVICIOS CORPORATIVOS,OTROS SERVICIOS CORPORATIVOS,
SERVICIOS TERCERIZADOS,SERVICIOS TERCERIZADOS,
OTROS SERVICIOS DE LA FIRMA,OTROS SERVICIOS DE LA FIRMA,
```

> `id_qb` puede ir vacío. `categoria_nombre` debe coincidir exactamente (mayúsculas/minúsculas) con el nombre en **Utilidades → Categorías**.

### Paso 3 — Crear tabla staging e importar el CSV

En Supabase **SQL Editor**, crea la tabla temporal:

```sql
create table if not exists public.services_import (
  nombre text,
  categoria_nombre text,
  id_qb text
);
```

Luego ve a **Table Editor → `services_import` → Import data from CSV** y sube el archivo.

### Paso 4 — Pasar datos a la tabla real

```sql
insert into public.services (id, nombre, category_id, id_qb)
select
  gen_random_uuid(),
  trim(i.nombre),
  (select id from public.categories where upper(nombre) = upper(trim(i.categoria_nombre)) limit 1),
  nullif(trim(i.id_qb), '')::integer
from public.services_import i
where trim(i.nombre) <> ''
on conflict do nothing;

-- Borrar la tabla temporal
drop table public.services_import;
```

### Paso 5 — Verificar

```sql
select s.nombre, c.nombre as categorias, s.id_qb
from public.services s
left join public.categories c on c.id = s.category_id
order by s.nombre;
```

---

## 10. Migración — Items de Servicio (`public.service_items`)

Campos: **Nombre Ítem**, **Servicios**, **Tipo Ítem**, **ID QB**, **SKU**, **Descripción**.

### Paso 1 — Crear tabla (una sola vez)

```sql
create table if not exists public.service_items (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  service_id uuid references public.services(id) on delete set null,
  tipo_item text not null default 'N/A',
  id_qb integer,
  sku text,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
```

### Paso 2 — Preparar el CSV

Crea `items_servicio.csv` con estas columnas (guarda como **CSV UTF-8**):

```
nombre,servicio_nombre,tipo_item,id_qb,sku,descripcion
Constitución,Sociedad Anonima,N/A,,,
Cambio de Nombre,Sociedad Anonima,Reformas al Pacto,,,
Cambio de Junta Directiva,Sociedad Anonima,Reformas al Pacto,72,400001-1,HONORARIOS
Cambio de Agente Residente - CAR OUT,Sociedad Anonima,Reformas al Pacto,,,
Cambio de Agente Residente - CAR IN,Sociedad Anonima,Reformas al Pacto,,,
Aumento o Disminución de Capital,Sociedad Anonima,Reformas al Pacto,,,
Anulación y Emisión de Acciones,Sociedad Anonima,Acciones,,,
Contrato Leasing,Servicios Bancarios,N/A,,,
Disolución de Sociedad,Sociedad Anonima,N/A,,,
Reactivación de Sociedad,Sociedad Anonima,N/A,,,
Transformación,Sociedad Anonima,N/A,,,
```

> `tipo_item` debe ser exactamente uno de: `N/A`, `Reformas al Pacto`, `Reformas al Acta Fundacional`, `Emision de Poder General o Especial`, `Bien Inmueble`, `Acciones`.

### Paso 3 — Crear tabla staging e importar el CSV

```sql
create table if not exists public.service_items_import (
  nombre text,
  servicio_nombre text,
  tipo_item text,
  id_qb text,
  sku text,
  descripcion text
);
```

Luego: **Table Editor → `service_items_import` → Import data from CSV**.

### Paso 4 — Pasar a la tabla real

```sql
insert into public.service_items (id, nombre, service_id, tipo_item, id_qb, sku, descripcion)
select
  gen_random_uuid(),
  trim(i.nombre),
  (select id from public.services where upper(nombre) = upper(trim(i.servicio_nombre)) limit 1),
  coalesce(nullif(trim(i.tipo_item), ''), 'N/A'),
  nullif(trim(i.id_qb), '')::integer,
  nullif(trim(i.sku), ''),
  nullif(trim(i.descripcion), '')
from public.service_items_import i
where trim(i.nombre) <> ''
on conflict do nothing;

drop table public.service_items_import;
```

### Paso 5 — Verificar

```sql
select si.nombre, s.nombre as servicio, si.tipo_item, si.id_qb, si.sku
from public.service_items si
left join public.services s on s.id = si.service_id
order by si.nombre;
```

---

## 11. Migración — Usuarios (`public.usuarios` + Supabase Auth)

### Paso 1 — Crear tabla

```sql
create table if not exists public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null,
  rol text,
  puesto text,
  correo_microsoft text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
```

### Paso 2 — Insertar los 9 usuarios

```sql
insert into public.usuarios (nombre, correo, rol, correo_microsoft) values
  ('Leydis Valdés',        'finanzas@ancori.com',               'Contabilidad',            'lvaldes@Ancoriyasociados.onmicrosoft.com'),
  ('Jean Richa',           'jricha@ancori.com',                 'Socio',                   'jricha@Ancoriyasociados.onmicrosoft.com'),
  ('Margie Angel',         'mangel@ancori.com',                 'Socio',                   'mangel@Ancoriyasociados.onmicrosoft.com'),
  ('Yolimar Gordón',       'ygordon@ancori.com',                'Abogada',                 'ygordon@Ancoriyasociados.onmicrosoft.com'),
  ('Milagros Flores',      'mflores@ancori.com',                'Abogada',                 'mflores@Ancoriyasociados.onmicrosoft.com'),
  ('María Isabel Palma',   'mpalma@ancori.com',                 'Asistente Legal',         'mipalma@Ancoriyasociados.onmicrosoft.com'),
  ('Vanessa Suarez',       'administracion@ancori.com',         'Asistente Administrativo','vsuarez@Ancoriyasociados.onmicrosoft.com'),
  ('Soporte',              'soporte@ancoriyasociados.com',      null,                      'soporte@ancoriyasociados.onmicrosoft.com'),
  ('Soporte Ct Auditores', 'panelbi@ctauditoresbi.onmicrosoft.com', null,                  'panelbi@ctauditoresbi.onmicrosoft.com');
```

### Paso 3 — Crear cuentas de acceso en Supabase Auth

Ve a **Supabase Dashboard → Authentication → Users** y crea cada cuenta con el botón **"Add user"**:

| Correo | Contraseña |
|--------|-----------|
| finanzas@ancori.com | ANCORI2026** |
| jricha@ancori.com | ANCORI2026** |
| mangel@ancori.com | ANCORI2026** |
| ygordon@ancori.com | ANCORI2026** |
| mflores@ancori.com | ANCORI2026** |
| mpalma@ancori.com | ANCORI2026** |
| administracion@ancori.com | ANCORI2026** |
| soporte@ancoriyasociados.com | ANCORI2026** |
| panelbi@ctauditoresbi.onmicrosoft.com | ANCORI2026** |

> Marca **"Auto Confirm User"** al crear cada uno para que no necesiten confirmar por email.

---

## 12. Migración — Casos (nuevas columnas)

Ejecuta en Supabase SQL Editor para agregar los campos nuevos a la tabla `cases` existente:

```sql
-- Agregar columnas nuevas a la tabla cases existente
ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS n_tarea integer,
  ADD COLUMN IF NOT EXISTS service_item_id uuid references public.service_items(id) on delete set null,
  ADD COLUMN IF NOT EXISTS etapa_id uuid references public.etapas(id) on delete set null,
  ADD COLUMN IF NOT EXISTS prioridad text check (prioridad in ('Baja','Media','Urgente')),
  ADD COLUMN IF NOT EXISTS usuario_asignado_id uuid references public.usuarios(id) on delete set null,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS recurrencia boolean not null default false,
  ADD COLUMN IF NOT EXISTS envio_correo boolean not null default false,
  ADD COLUMN IF NOT EXISTS gastos_cliente numeric(12,2),
  ADD COLUMN IF NOT EXISTS gastos_pendiente numeric(12,2);

-- Actualizar constraint de estado para incluir 'En Curso'
ALTER TABLE public.cases
  DROP CONSTRAINT IF EXISTS cases_estado_check;

ALTER TABLE public.cases
  ADD CONSTRAINT cases_estado_check
  CHECK (estado in ('Pendiente','En Curso','Completado/Facturado','Cancelado'));

-- Hacer service_id opcional (antes era NOT NULL)
ALTER TABLE public.cases
  ALTER COLUMN service_id DROP NOT NULL;

-- Rellenar n_tarea si la columna está vacía (basado en orden de created_at)
UPDATE public.cases SET n_tarea = sub.rn
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
  FROM public.cases
  WHERE n_tarea IS NULL
) sub
WHERE public.cases.id = sub.id;
```

---

## 13. Importar `casos_import.csv` a Supabase

### Pasos

**1. Ejecuta primero la migración del paso 12** (agregar columnas nuevas a `cases`).

**2. Obtén los UUIDs de tus usuarios** (solo una vez):
```sql
SELECT id, nombre FROM public.usuarios ORDER BY nombre;
```
Copia los IDs y actualiza el diccionario `usuarios_by_nombre` en `public/generar_casos_import.py`, luego vuelve a ejecutarlo:
```bash
python public/generar_casos_import.py
```

**3. Crea la tabla staging en Supabase SQL Editor:**
```sql
CREATE TEMP TABLE casos_staging (
  n_tarea              integer,
  numero_caso          text,
  descripcion          text,
  estado               text,
  prioridad            text,
  fecha_caso           text,
  fecha_vencimiento    text,
  society_id           text,
  client_id            text,
  service_item_id      text,
  service_id           text,
  etapa_id             text,
  usuario_asignado_id  text,
  usuario_asignado_nombre text,
  gastos_cliente       text,
  gastos_pendiente     text,
  notas                text,
  observaciones        text,
  cliente_temporal     text,
  recurrencia          text,
  envio_correo         text,
  creado_por           text,
  responsable          text,
  _ref_item            text,
  _ref_sociedad        text,
  _ref_etapa           text
);
```

**4. Importa el CSV** via Supabase Dashboard → Table Editor → `casos_staging` → Import Data → sube `public/casos_import.csv`.

**5. Inserta en `cases` desde staging:**
```sql
INSERT INTO public.cases (
  n_tarea, numero_caso, descripcion, estado, prioridad,
  fecha_caso, fecha_vencimiento,
  society_id, client_id, service_item_id, service_id, etapa_id,
  usuario_asignado_id,
  gastos_cotizados, gastos_cliente, gastos_pendiente,
  notas, observaciones,
  cliente_temporal, recurrencia, envio_correo,
  creado_por, responsable,
  prioridad_urgente, created_at
)
SELECT
  n_tarea::integer,
  numero_caso,
  descripcion,
  estado,
  prioridad,
  NULLIF(fecha_caso, '')::date,
  NULLIF(fecha_vencimiento, '')::date,
  NULLIF(society_id, '')::uuid,
  NULLIF(client_id, '')::uuid,
  NULLIF(service_item_id, '')::uuid,
  NULLIF(service_id, '')::uuid,
  NULLIF(etapa_id, '')::uuid,
  -- Si tienes UUIDs en el CSV úsalos, si no resuelve por nombre:
  COALESCE(
    NULLIF(usuario_asignado_id, '')::uuid,
    (SELECT id FROM public.usuarios WHERE nombre ILIKE usuario_asignado_nombre LIMIT 1)
  ),
  0,
  NULLIF(gastos_cliente, '')::numeric,
  NULLIF(gastos_pendiente, '')::numeric,
  notas,
  observaciones,
  (cliente_temporal = 'true'),
  (recurrencia = 'true'),
  (envio_correo = 'true'),
  creado_por,
  responsable,
  (prioridad = 'Urgente'),
  NOW()
FROM casos_staging
ORDER BY n_tarea;
```

**6. Verifica:**
```sql
SELECT COUNT(*), MIN(n_tarea), MAX(n_tarea) FROM public.cases;
-- Debe mostrar 128 filas, n_tarea 1..130
```

---

## 14. Configurar correo de asignación (SMTP)

La Edge Function `send-assignment-email` envía un correo automático al usuario asignado cada vez que se guarda un caso con un nuevo responsable.

### Secrets en Supabase Dashboard → Settings → Edge Functions → Secrets

| Secret          | Valor                                    |
|-----------------|------------------------------------------|
| `SMTP_HOST`     | `mail.solucionesdetecnologia.com`        |
| `SMTP_PORT`     | `465`                                    |
| `SMTP_USER`     | `ancori@solucionesdetecnologia.com`      |
| `SMTP_PASSWORD` | `abog90`                                 |
| `SMTP_TLS`      | `true` (SSL puerto 465) ó `false` (587 TLS) |
| `MAIL_FROM`     | `ancori@solucionesdetecnologia.com`      |
| `MAIL_CC`       | `soporte@ancoriyasociados.com`           |

> Si usas puerto 587 (TLS/STARTTLS): cambia `SMTP_PORT=587` y `SMTP_TLS=false`.

### Desplegar la función

```bash
npx supabase functions deploy send-assignment-email --project-ref jyqdfjonikorlwmjepgd
```

### Verificar el host SMTP

Si no sabes el hostname exacto de tu servidor, prueba estas opciones comunes:
- `mail.solucionesdetecnologia.com`
- `smtp.solucionesdetecnologia.com`
- `correo.solucionesdetecnologia.com`

Puedes verificarlo con tu proveedor de hosting (cPanel → Configuración de correo).
