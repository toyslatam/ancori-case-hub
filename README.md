# Plataforma Ancori

Aplicación web para seguimiento de casos y mantenimiento maestro (clientes, directores, sociedades, catálogos), con persistencia opcional en Supabase.

Documentación del repositorio: [`proyecto.md`](./proyecto.md). Migración desde SharePoint: [`migracion.md`](./migracion.md).

## Desarrollo

```bash
npm install
npm run dev
```

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Build de producción |
| `npm run seed:db` | Aplica `supabase/seed.sql` (requiere `DATABASE_URL` u opciones en `scripts/run-seed.mjs`) |

Variables de entorno: ver `.env.example`.
