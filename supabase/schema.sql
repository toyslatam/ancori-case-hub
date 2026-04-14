-- Core schema for Plataforma Ancori
-- Run this script in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  razon_social text not null default '',
  numero integer,
  email text,
  telefono text,
  identificacion text,
  direccion text,
  quickbooks_customer_id text,
  activo boolean not null default true,
  observaciones text,
  created_at timestamptz not null default now()
);

create table if not exists public.societies (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  nombre text not null,
  tipo_sociedad text not null,
  correo text,
  telefono text,
  identificacion_fiscal text,
  quickbooks_customer_id text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text not null,
  descripcion text,
  codigo text,
  tarifa_base numeric(12,2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_terms (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  dias_vencimiento integer not null default 0 check (dias_vencimiento >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.qb_items (
  id uuid primary key default gen_random_uuid(),
  nombre_interno text not null,
  nombre_qb text not null,
  qb_item_id text,
  tipo text not null,
  impuesto_default numeric(5,2),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.directores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  comentarios text not null default '',
  activo boolean not null default true,
  fecha_vencimiento_documento date,
  tipo_documento text not null check (tipo_documento in ('Cedula', 'Pasaporte', 'Otro')),
  created_at timestamptz not null default now()
);

-- Migración: columna legacy titulo → nombre
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directores' and column_name = 'titulo'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'directores' and column_name = 'nombre'
  ) then
    alter table public.directores rename column titulo to nombre;
  end if;
end $$;

drop index if exists public.idx_directores_titulo;
create index if not exists idx_directores_nombre on public.directores(nombre);

alter table public.directores drop column if exists tipo_director;

-- Import CSV / SharePoint: si `tipo_documento` viene vacío o NULL, asignar valor válido antes del CHECK.
alter table public.directores alter column tipo_documento set default 'Cedula';

create or replace function public.directores_set_tipo_documento()
returns trigger
language plpgsql
as $$
declare
  t text;
begin
  t := nullif(btrim(coalesce(new.tipo_documento, '')), '');
  if t is null then
    new.tipo_documento := 'Cedula';
    return new;
  end if;
  t := lower(replace(btrim(new.tipo_documento), 'é', 'e'));
  new.tipo_documento := case t
    when 'cedula' then 'Cedula'
    when 'pasaporte' then 'Pasaporte'
    when 'otro' then 'Otro'
    else 'Cedula'
  end;
  return new;
end;
$$;

drop trigger if exists trg_directores_set_tipo_documento on public.directores;
create trigger trg_directores_set_tipo_documento
  before insert or update on public.directores
  for each row
  execute function public.directores_set_tipo_documento();

-- Sociedades: columnas adicionales (FK a directores requiere que exista la tabla directores).
alter table public.societies add column if not exists razon_social text not null default '';
alter table public.societies add column if not exists id_qb integer;
alter table public.societies add column if not exists ruc text not null default '';
alter table public.societies add column if not exists dv text not null default '';
alter table public.societies add column if not exists nit text not null default '';
alter table public.societies add column if not exists presidente_id uuid references public.directores(id) on delete set null;
alter table public.societies add column if not exists tesorero_id uuid references public.directores(id) on delete set null;
alter table public.societies add column if not exists secretario_id uuid references public.directores(id) on delete set null;
alter table public.societies add column if not exists pago_tasa_unica text not null default '';
alter table public.societies add column if not exists fecha_inscripcion date;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  numero_caso text not null unique,
  client_id uuid references public.clients(id) on delete set null,
  society_id uuid references public.societies(id) on delete set null,
  service_id uuid not null references public.services(id) on delete restrict,
  descripcion text not null,
  estado text not null check (estado in ('Pendiente', 'Completado/Facturado', 'En Proceso', 'Cancelado')),
  etapa text not null,
  gastos_cotizados numeric(12,2) not null default 0,
  cliente_temporal boolean not null default false,
  prioridad_urgente boolean not null default false,
  creado_por text not null,
  responsable text not null,
  observaciones text,
  fecha_caso date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.case_comments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_name text not null,
  comentario text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.case_expenses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12,2) not null default 1,
  importe numeric(12,2) not null default 0,
  total numeric(12,2) generated always as (cantidad * importe) stored,
  fecha date not null,
  observaciones text,
  created_at timestamptz not null default now()
);

create table if not exists public.case_invoices (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  society_id uuid references public.societies(id) on delete set null,
  term_id uuid references public.invoice_terms(id) on delete set null,
  fecha_factura date not null,
  fecha_vencimiento date not null,
  subtotal numeric(12,2) not null default 0,
  impuesto numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  estado text not null check (estado in ('borrador', 'pendiente', 'enviada', 'error', 'anulada')),
  qb_invoice_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.case_invoices(id) on delete cascade,
  servicio_id uuid references public.services(id) on delete set null,
  qb_item_id uuid references public.qb_items(id) on delete set null,
  descripcion text not null,
  cantidad numeric(12,2) not null default 1,
  tarifa numeric(12,2) not null default 0,
  importe numeric(12,2) generated always as (cantidad * tarifa) stored,
  itbms numeric(5,2) not null default 0
);

-- Utilidades: categorías (nombre + id QuickBooks).
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  id_qb integer,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_categories_nombre on public.categories(nombre);

grant select, insert, update, delete on table public.categories to anon, authenticated;
grant all on table public.categories to service_role;

create index if not exists idx_societies_client_id on public.societies(client_id);
create index if not exists idx_cases_client_id on public.cases(client_id);
create index if not exists idx_cases_society_id on public.cases(society_id);
create index if not exists idx_cases_service_id on public.cases(service_id);
create index if not exists idx_case_comments_case_id on public.case_comments(case_id);
create index if not exists idx_case_expenses_case_id on public.case_expenses(case_id);
create index if not exists idx_case_invoices_case_id on public.case_invoices(case_id);
create index if not exists idx_invoice_lines_invoice_id on public.invoice_lines(invoice_id);

-- Clientes: razón social + número correlativo (instalaciones previas sin columnas).
alter table public.clients add column if not exists razon_social text not null default '';
alter table public.clients add column if not exists numero integer;

create sequence if not exists public.clients_numero_seq;

update public.clients as c
set numero = sub.rn
from (
  select id, row_number() over (order by created_at) as rn
  from public.clients
  where numero is null
) as sub
where c.id = sub.id;

select setval(
  'public.clients_numero_seq',
  greatest(coalesce((select max(numero) from public.clients), 0), 1)
);

alter table public.clients
  alter column numero set default nextval('public.clients_numero_seq');

alter table public.clients
  alter column numero set not null;

create unique index if not exists idx_clients_numero on public.clients(numero);

-- API de Supabase (anon/authenticated): permisos básicos para desarrollo.
-- QuickBooks Online: tokens OAuth (solo backend / Edge Functions con service_role).
create table if not exists public.qbo_oauth_tokens (
  id text primary key default 'default',
  realm_id text,
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qbo_oauth_tokens_single check (id = 'default')
);

comment on table public.qbo_oauth_tokens is 'OAuth2 QBO; fila única id=default. Sin acceso anon/authenticated.';

alter table public.qbo_oauth_tokens enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;

-- Tras los grants globales: esta tabla solo service_role (Edge Functions).
revoke all on table public.qbo_oauth_tokens from anon;
revoke all on table public.qbo_oauth_tokens from authenticated;
grant select, insert, update, delete on table public.qbo_oauth_tokens to service_role;
