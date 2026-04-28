# Lógica de “Mantenimiento → Clientes” (estructura y dependencias)

Este documento describe **cómo está construido** el módulo de **Mantenimiento → Clientes** en la app: qué capas existen, qué archivos participan, y cómo fluye la información al **listar / crear / editar / eliminar**.

## 1) Capas (arquitectura)

### UI (Página)
- **Archivo**: `src/pages/maintenance/ClientsPage.tsx`
- **Responsabilidad**:
  - Render del listado (tabla).
  - Búsqueda + filtros (panel lateral).
  - Modal/diálogo para crear y editar cliente.
  - Confirmación de borrado.
  - Estados locales de UI: `search`, `panelOpen`, `panelFilters`, `showForm`, `editItem`, `form`, `saving`, etc.
  - Validaciones de formulario (mínimas) antes de guardar.

### Estado global (Context)
- **Archivo**: `src/context/AppContext.tsx`
- **Responsabilidad**:
  - Mantener en memoria `clients` y el resto de catálogos (`societies`, `usuarios`, etc.).
  - Cargar datos desde Supabase al iniciar (y aplicar cache).
  - Exponer acciones a la UI:
    - `saveClient(client, isEdit)`
    - `deleteClient(id)`
  - Manejar timeouts/errores de Supabase y mostrar `toast`.

### Persistencia (DB adapter)
- **Archivo**: `src/lib/supabaseDb.ts`
- **Responsabilidad**:
  - Transformaciones:
    - `rowToClient(row)` (DB → modelo app)
    - `clientToRow(client)` (modelo app → DB)
  - Operaciones Supabase:
    - `insertClient(sb, client)` → **insert + return row** (`select('*').single()`)
    - `updateClientRow(sb, client)`
    - `deleteClientRow(sb, id)`

### Base de datos (schema)
- **Archivo**: `supabase/schema.sql`
- **Tabla**: `public.clients`
  - Campos principales: `id`, `nombre`, `razon_social`, `numero`, `email`, `telefono`, `identificacion`, `direccion`, `activo`, `observaciones`, `created_at`.
  - El correlativo `numero` se apoya en una secuencia `clients_numero_seq` y un índice único `idx_clients_numero`.

## 2) Dependencias directas del módulo

### Datos / Tipos
- **Archivo**: `src/data/mockData.ts`
  - Define la interfaz `Client`.
  - Cuando Supabase no está configurado, se usan `mockClients`.

### UI components (reuso)
- `src/components/ui/*`:
  - `Button`, `Input`, `Label`, `Dialog`, `Switch`, `Badge`, `Sheet`, `AlertDialog`, `Collapsible`, etc.
- `src/components/ui/searchable-combo.tsx`
  - Se usa para selects con búsqueda (en filtros).

### Notificaciones
- `sonner` para `toast.success/error/warning`.

## 3) Flujo de datos (lectura inicial)

### Carga desde Supabase
- En `AppContext.tsx`, al montar:
  - Lee un **cache** de `localStorage`.
  - Intenta cargar todo desde Supabase vía `db.loadAllFromSupabase(sb)` (incluye `clients`).
  - Si falla, mantiene cache o cae a mock (según el caso).

### Cómo llega a Clientes
- `ClientsPage.tsx` consume `clients` desde `useApp()` (AppContext).
- Aplica:
  - búsqueda (texto)
  - filtros avanzados (`panelFilters`)
  - orden final (por `numero` desc)

## 4) Flujo de crear/editar Cliente

### 4.1 En UI (`ClientsPage.tsx`)
- Abre modal:
  - `openNew()` inicializa `form` con defaults.
  - `openEdit(c)` copia el cliente al `form` y setea `editItem`.
- `handleSave()`:
  - valida `nombre` (obligatorio)
  - arma `base` normalizando strings (`trim`) y defaults
  - construye el `client` final:
    - **Nuevo**: genera `id` (UUID) + `created_at` (fecha) y fuerza `numero: undefined`
      - **Importante**: se deja que Postgres asigne `numero` por secuencia para evitar colisiones multiusuario.
    - **Edición**: mezcla `editItem` con `base`
  - llama `await saveClient(client, isEdit)`
  - si ok: toast + cierra modal
  - siempre libera `saving` con `finally`

### 4.2 En Context (`AppContext.tsx`)
- `saveClient(client, isEdit)`:
  - Hace llamada Supabase con timeout:
    - insert: `db.insertClient(...)` (devuelve fila completa)
    - update: `db.updateClientRow(...)`
  - Si insert devuelve `data`, se transforma con `rowToClient()` y se añade al estado.
  - En caso de error:
    - muestra `toast.error(...)`
    - retorna `false` a la UI

### 4.3 En DB adapter (`supabaseDb.ts`)
- `insertClient()`:
  - Inserta el row mapeado y **retorna** la fila creada con `.select('*').single()`.
  - Esto permite que `numero` (secuencia) llegue de vuelta al frontend.

## 5) Flujo de eliminar Cliente

### En UI (`ClientsPage.tsx`)
- El usuario dispara confirmación (AlertDialog).
- `confirmDelete()` llama `await deleteClient(id)`.
- También calcula `societiesForClient` para advertir si hay sociedades vinculadas.

### En Context (`AppContext.tsx`)
- `deleteClient(id)`:
  - Si hay Supabase: ejecuta `db.deleteClientRow(sb, id)`
  - Si ok: actualiza estado local removiendo el cliente
  - Si error: toast y retorna `false`

## 6) Puntos críticos / “depende de qué”

### El guardado correcto depende de:
- **Secuencia `clients_numero_seq`** sincronizada con los datos existentes (si se desincroniza → error de unique en `numero`).
- **No enviar `numero` desde el frontend** al crear (se hace `numero: undefined`).
- **Supabase disponible** (red/DNS) para que el insert/update responda.
- **`insertClient()` retornando la fila** (para traer `numero` real asignado por DB).

### Lo que NO hace este módulo (hoy)
- No hace paginación en `clients` (se carga todo en memoria vía `loadAllFromSupabase`).
- No hace reglas por rol/usuario para permisos (eso sería RLS/policies si se habilita).

