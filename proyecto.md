# Plataforma Ancori — Estructura y lógica del proyecto

Este documento describe cómo está organizada la aplicación, qué tecnologías usa y cómo fluyen los datos. Sirve como mapa para desarrollo y onboarding.

## Objetivo

Aplicación web para **seguimiento de casos** y **mantenimiento maestro** (clientes, directores, sociedades, servicios, términos de factura, ítems QuickBooks), con posibilidad de persistir en **Supabase** cuando el entorno está configurado.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| UI | React 18, TypeScript |
| Build / dev server | Vite 5 |
| Estilos | Tailwind CSS, componentes tipo shadcn/ui (Radix) |
| Enrutado | React Router v6 |
| Estado global | React Context (`AppProvider`) |
| Datos remotos | `@supabase/supabase-js` (opcional) |
| Consultas preparadas | TanStack Query (provider montado; parte del CRUD usa Context directamente) |
| Pruebas | Vitest; E2E preparado con Playwright |

## Estructura de carpetas (resumen)

```
ancori-case-hub/
├── public/                 # Estáticos (logo, robots, etc.)
├── scripts/
│   └── run-seed.mjs        # Carga seed SQL vía Postgres (DATABASE_URL u otras vars)
├── supabase/
│   ├── schema.sql          # DDL + permisos + migraciones idempotentes de columnas
│   └── seed.sql            # Datos iniciales de demostración
├── src/
│   ├── App.tsx             # Rutas y composición con AppLayout
│   ├── main.tsx            # Punto de entrada React
│   ├── index.css           # Tokens CSS / Tailwind
│   ├── context/
│   │   └── AppContext.tsx  # Estado global: casos, clientes, directores, sociedades, etc.
│   ├── data/
│   │   └── mockData.ts     # Tipos TypeScript + mocks locales
│   ├── lib/
│   │   ├── supabaseClient.ts   # createClient si hay VITE_SUPABASE_*
│   │   ├── supabaseDb.ts       # Carga y persistencia tabular Supabase
│   │   └── utils.ts
│   ├── components/
│   │   ├── layout/         # AppLayout, AppSidebar
│   │   ├── cases/          # Tabla de casos, modales, KPIs, filtros
│   │   └── ui/             # Biblioteca de primitivas UI
│   └── pages/
│       ├── CasesPage.tsx
│       ├── ConfigPage.tsx
│       ├── ComingSoonPage.tsx
│       └── maintenance/    # Clientes, directores, sociedades, servicios, etc.
└── package.json
```

## Lógica de enrutado

Definido en `src/App.tsx`, dentro de `AppLayout`:

| Ruta | Pantalla |
|------|----------|
| `/` | Inicio (lista de casos) |
| `/casos` | Misma vista de casos (acceso duplicado desde menú) |
| `/mantenimiento/clientes` | Mantenimiento de clientes |
| `/mantenimiento/directores` | Directores (catálogo tipo lista SharePoint) |
| `/mantenimiento/sociedades` | Sociedades |
| `/mantenimiento/servicios` | Servicios / procesos |
| `/mantenimiento/terminos` | Términos de factura |
| `/mantenimiento/qb-items` | Productos/servicios QB |
| `/facturas`, `/reportes`, `/instructivos` | Placeholder “en preparación” |
| `/configuracion` | Configuración / integraciones (texto) |
| `*` | NotFound |

El menú lateral (`AppSidebar`) enlaza estas rutas; el estado colapsado/abierto lo gestiona `SidebarProvider` (cookie + atajo Ctrl/Cmd+B).

## Estado global (`AppContext`)

- **Fuente de datos:** Si existen `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, al montar se llama a `loadAllFromSupabase` y se rellenan listas desde Supabase. Si **alguna** tabla falla (p. ej. aún no existe en SQL), el resto se sigue mostrando y aparece un aviso; solo si **ninguna** tabla responde se hace fallback a los mocks de `mockData.ts`.
- **Operaciones:** Altas, bajas y cambios en casos, clientes, directores, sociedades, etc., actualizan el estado en memoria y, si hay cliente Supabase, disparan `insert` / `update` / `delete` en las tablas correspondientes.
- **Funciones de ayuda:** `getClientName`, `getSocietyName`, `getServiceName` resuelven nombres por `id` para tablas y modales.

## Modelo de datos en base (Supabase)

Definido principalmente en `supabase/schema.sql`. Entidades principales:

- `clients` — clientes (nombre, razón social, número correlativo, correo, teléfono, activo, fechas, campos adicionales).
- `directores` — directores (`nombre`, comentarios, activo, vencimiento de documento, tipo de documento `Cedula` | `Pasaporte` | `Otro`, `created_at`). La pantalla `DirectoresPage` replica el listado tipo SharePoint: búsqueda global, panel de filtros, tabla clicable y eliminación con confirmación.
- `societies` — sociedades ligadas a un `client_id`; incluye razón social, tipo (`SOCIEDADES` | `FUNDACIONES` | `B.V.I`), RUC/DV/NIT, `id_qb`, cargos (`presidente_id`, `tesorero_id`, `secretario_id` → `directores`), pago tasa única y `fecha_inscripcion`. El semestre (1 o 2 según el mes de inscripción) se calcula en la UI.
- `services`, `invoice_terms`, `qb_items` — catálogos.
- `cases` — casos; hijos: `case_comments`, `case_expenses`, `case_invoices` + `invoice_lines`.

Las relaciones usan UUID como clave primaria; el **número visible** de cliente (tipo “ID” de negocio) vive en `clients.numero`.

## Variables de entorno

Ver `.env.example`. Lo habitual en `.env.local`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — app en el navegador.
- `DATABASE_URL` (u otras variantes soportadas en `scripts/run-seed.mjs`) — ejecutar `seed.sql` desde Node con `pg`.

## Scripts npm útiles

| Comando | Uso |
|---------|-----|
| `npm run dev` | Servidor de desarrollo (puerto configurado en Vite, p. ej. 8080) |
| `npm run build` | Build de producción |
| `npm run seed:db` | Aplica `supabase/seed.sql` contra Postgres (requiere URL de conexión) |
| `npm run lint` | ESLint |

## Convenciones de código

- TypeScript estricto en lo posible; tipos compartidos en `mockData.ts` para entidades de dominio.
- Rutas de import con alias `@/` → `src/`.
- UI reutilizable bajo `components/ui/`; pantallas bajo `pages/`.
- Textos de negocio en español en pantallas de mantenimiento y casos.

## Documentación relacionada

- `migracion.md` — Cómo llevar listas de SharePoint (p. ej. **Anc_Clientes**, lista **Directores**) a Supabase y alinearlas con esta app.
