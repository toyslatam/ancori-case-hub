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
  categoria text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  id_qb integer,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

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

create table if not exists public.etapas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  n_etapa integer not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

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

-- Servicios de sociedades (catálogo independiente de public.services usado por casos/facturas).
-- Extensión no destructiva: no modifica public.societies.
create table if not exists public.servicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sociedad_servicios (
  id uuid primary key default gen_random_uuid(),
  sociedad_id uuid not null references public.societies(id) on delete cascade,
  servicio_id uuid not null references public.servicios(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sociedad_servicios_unique unique (sociedad_id, servicio_id)
);

create index if not exists idx_sociedad_servicios_sociedad
  on public.sociedad_servicios(sociedad_id);
create index if not exists idx_sociedad_servicios_servicio
  on public.sociedad_servicios(servicio_id);

create or replace function public.sociedad_servicios_require_active_servicio()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.servicios s
    where s.id = new.servicio_id
      and s.activo = true
  ) then
    raise exception 'No se puede asignar un servicio inexistente o inactivo a la sociedad.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sociedad_servicios_require_active_servicio on public.sociedad_servicios;
create trigger trg_sociedad_servicios_require_active_servicio
  before insert or update on public.sociedad_servicios
  for each row
  execute function public.sociedad_servicios_require_active_servicio();

insert into public.servicios (nombre, activo)
select v.nombre, true
from (values
  ('Mantenimiento Anual'),
  ('Registros Contables'),
  ('Custodia de Acciones'),
  ('Oficina Virtual')
) as v(nombre)
where not exists (
  select 1
  from public.servicios s
  where lower(s.nombre) = lower(v.nombre)
);

grant select, insert, update, delete on table public.servicios to anon, authenticated;
grant select, insert, update, delete on table public.sociedad_servicios to anon, authenticated;
grant all on table public.servicios to service_role;
grant all on table public.sociedad_servicios to service_role;

-- QuickBooks async sync (Sociedades): cola + estado sin bloquear UI
alter table public.societies add column if not exists qbo_sync_status text
  check (qbo_sync_status in ('pending', 'success', 'error')) default 'pending';
alter table public.societies add column if not exists qbo_sync_attempts integer not null default 0;
alter table public.societies add column if not exists qbo_sync_last_error text;
alter table public.societies add column if not exists qbo_sync_last_attempt_at timestamptz;
alter table public.societies add column if not exists qbo_sync_last_success_at timestamptz;

create table if not exists public.qbo_society_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  operation text not null default 'upsert' check (operation in ('upsert')),
  status text not null default 'pending' check (status in ('pending', 'success', 'error')),
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qbo_society_sync_jobs_pending
  on public.qbo_society_sync_jobs(status, next_run_at);
create index if not exists idx_qbo_society_sync_jobs_society
  on public.qbo_society_sync_jobs(society_id);

comment on table public.qbo_society_sync_jobs is 'Cola async: sociedades pendientes de sincronizar a QuickBooks (no bloquear UI).';

grant select, insert, update, delete on table public.qbo_society_sync_jobs to anon, authenticated;
grant all on table public.qbo_society_sync_jobs to service_role;

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  n_tarea integer,
  numero_caso text not null,
  client_id uuid references public.clients(id) on delete set null,
  society_id uuid references public.societies(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  service_item_id uuid references public.service_items(id) on delete set null,
  descripcion text not null default '',
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'En Curso', 'Completado/Facturado', 'Cancelado')),
  etapa text,
  etapa_id uuid references public.etapas(id) on delete set null,
  gastos_cotizados numeric(12,2) not null default 0,
  gastos_cliente numeric(12,2),
  gastos_pendiente numeric(12,2),
  cliente_temporal boolean not null default false,
  prioridad text check (prioridad in ('Baja', 'Media', 'Urgente')),
  prioridad_urgente boolean not null default false,
  creado_por text not null default '',
  responsable text not null default '',
  usuario_asignado_id uuid references public.usuarios(id) on delete set null,
  observaciones text,
  notas text,
  fecha_caso date,
  fecha_vencimiento date,
  recurrencia boolean not null default false,
  envio_correo boolean not null default false,
  created_at timestamptz not null default now()
);

-- Migración: si ya existe la tabla, agrega las columnas nuevas
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='n_tarea') then
    alter table public.cases add column n_tarea integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='service_item_id') then
    alter table public.cases add column service_item_id uuid references public.service_items(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='etapa_id') then
    alter table public.cases add column etapa_id uuid references public.etapas(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='prioridad') then
    alter table public.cases add column prioridad text check (prioridad in ('Baja', 'Media', 'Urgente'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='usuario_asignado_id') then
    alter table public.cases add column usuario_asignado_id uuid references public.usuarios(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='notas') then
    alter table public.cases add column notas text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='fecha_vencimiento') then
    alter table public.cases add column fecha_vencimiento date;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='recurrencia') then
    alter table public.cases add column recurrencia boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='envio_correo') then
    alter table public.cases add column envio_correo boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='gastos_cliente') then
    alter table public.cases add column gastos_cliente numeric(12,2);
  end if;
  if not exists (select 1 from information_schema.columns where table_name='cases' and column_name='gastos_pendiente') then
    alter table public.cases add column gastos_pendiente numeric(12,2);
  end if;
end $$;

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

alter table public.invoice_lines add column if not exists categoria text;

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

-- RLS: permitir que la app autenticada lea catálogos y relaciones usadas por Sociedades.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_select_authenticated'
  ) then
    create policy clients_select_authenticated on public.clients
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_insert_authenticated'
  ) then
    create policy clients_insert_authenticated on public.clients
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_update_authenticated'
  ) then
    create policy clients_update_authenticated on public.clients
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_delete_authenticated'
  ) then
    create policy clients_delete_authenticated on public.clients
      for delete to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'directores' and policyname = 'directores_select_authenticated'
  ) then
    create policy directores_select_authenticated on public.directores
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'servicios' and policyname = 'servicios_select_authenticated'
  ) then
    create policy servicios_select_authenticated on public.servicios
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'servicios' and policyname = 'servicios_insert_authenticated'
  ) then
    create policy servicios_insert_authenticated on public.servicios
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'servicios' and policyname = 'servicios_update_authenticated'
  ) then
    create policy servicios_update_authenticated on public.servicios
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sociedad_servicios' and policyname = 'sociedad_servicios_select_authenticated'
  ) then
    create policy sociedad_servicios_select_authenticated on public.sociedad_servicios
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sociedad_servicios' and policyname = 'sociedad_servicios_insert_authenticated'
  ) then
    create policy sociedad_servicios_insert_authenticated on public.sociedad_servicios
      for insert to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sociedad_servicios' and policyname = 'sociedad_servicios_update_authenticated'
  ) then
    create policy sociedad_servicios_update_authenticated on public.sociedad_servicios
      for update to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'sociedad_servicios' and policyname = 'sociedad_servicios_delete_authenticated'
  ) then
    create policy sociedad_servicios_delete_authenticated on public.sociedad_servicios
      for delete to authenticated
      using (true);
  end if;
end $$;

-- RLS: policies CRUD para todas las tablas operativas que consume el frontend.
-- Se excluyen tablas sensibles/solo backend como qbo_oauth_tokens.
do $$
declare
  table_name text;
  app_tables text[] := array[
    'case_comments',
    'case_expenses',
    'case_invoices',
    'categories',
    'compliance_checks',
    'directores',
    'etapas',
    'invoice_lines',
    'invoice_terms',
    'qb_items',
    'service_items',
    'services',
    'sync_conflicts',
    'sync_notifications',
    'usuarios'
  ];
begin
  foreach table_name in array app_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and policyname = table_name || '_select_authenticated'
      ) then
        execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_select_authenticated', table_name);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and policyname = table_name || '_insert_authenticated'
      ) then
        execute format('create policy %I on public.%I for insert to authenticated with check (true)', table_name || '_insert_authenticated', table_name);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and policyname = table_name || '_update_authenticated'
      ) then
        execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', table_name || '_update_authenticated', table_name);
      end if;

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = table_name
          and policyname = table_name || '_delete_authenticated'
      ) then
        execute format('create policy %I on public.%I for delete to authenticated using (true)', table_name || '_delete_authenticated', table_name);
      end if;
    end if;
  end loop;
end $$;

-- Tras los grants globales: esta tabla solo service_role (Edge Functions).
revoke all on table public.qbo_oauth_tokens from anon;
revoke all on table public.qbo_oauth_tokens from authenticated;
grant select, insert, update, delete on table public.qbo_oauth_tokens to service_role;

-- ============================================================
-- Conciliación: detección y resolución de conflictos de sync
-- ============================================================

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  society_id uuid not null references public.societies(id) on delete cascade,
  field_name text not null,
  supabase_value text,
  quickbooks_value text,
  status text not null default 'pending'
    check (status in ('pending', 'resolved_supabase', 'resolved_quickbooks', 'dismissed')),
  resolved_by uuid references public.usuarios(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_sync_conflicts_society on public.sync_conflicts(society_id);
create index if not exists idx_sync_conflicts_status on public.sync_conflicts(status);

-- Solo un conflicto pendiente por sociedad+campo a la vez.
create unique index if not exists idx_sync_conflicts_pending_unique
  on public.sync_conflicts(society_id, field_name)
  where (status = 'pending');

comment on table public.sync_conflicts is 'Conflictos detectados durante sync bidireccional Supabase ↔ QuickBooks.';

create table if not exists public.sync_notifications (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  conflict_id uuid references public.sync_conflicts(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_sync_notifications_usuario on public.sync_notifications(usuario_id);
create index if not exists idx_sync_notifications_unread
  on public.sync_notifications(usuario_id, read)
  where (read = false);

comment on table public.sync_notifications is 'Notificaciones in-app para conflictos de sync.';

grant select, insert, update, delete on table public.sync_conflicts to anon, authenticated;
grant all on table public.sync_conflicts to service_role;
grant select, insert, update, delete on table public.sync_notifications to anon, authenticated;
grant all on table public.sync_notifications to service_role;

-- ============================================================
-- Cumplimiento: verificaciones PEP/AML vía AgileCheck
-- ============================================================

-- Tipo de cliente (persona natural, jurídica, PEP)
alter table public.clients add column if not exists tipo_cliente text
  check (tipo_cliente in ('Persona Natural', 'Persona Juridica', 'PEP'));

create table if not exists public.compliance_checks (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('client', 'director', 'society')),
  entity_id uuid not null,
  entity_name text not null,
  check_type text not null default 'PEP'
    check (check_type in ('PEP', 'sanctions', 'negative_news', 'full')),
  status text not null default 'pending'
    check (status in ('pending', 'clean', 'match', 'review', 'error')),
  risk_level text check (risk_level in ('bajo', 'medio', 'alto', 'critico')),
  agilecheck_id text,
  result_summary text,
  result_data jsonb,
  checked_by uuid references public.usuarios(id) on delete set null,
  checked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_compliance_entity on public.compliance_checks(entity_type, entity_id);
create index if not exists idx_compliance_status on public.compliance_checks(status);
create index if not exists idx_compliance_expires on public.compliance_checks(expires_at);

comment on table public.compliance_checks is 'Verificaciones PEP/AML vía AgileCheck para clientes, directores y sociedades.';

grant select, insert, update, delete on table public.compliance_checks to anon, authenticated;
grant all on table public.compliance_checks to service_role;

-- Facturas huérfanas (solo QBO / import) pueden existir sin caso vinculado.
alter table public.case_invoices alter column case_id drop not null;

-- Facturas: columnas extendidas (errores QBO, sync QB, PDF en Storage, conciliación).
alter table public.case_invoices add column if not exists numero_factura text;
alter table public.case_invoices add column if not exists nota_cliente text;
alter table public.case_invoices add column if not exists error_detalle text;
alter table public.case_invoices add column if not exists qb_total numeric(12,2);
alter table public.case_invoices add column if not exists qb_balance numeric(12,2);
alter table public.case_invoices add column if not exists qb_last_sync_at timestamptz;
alter table public.case_invoices add column if not exists pdf_path text;
alter table public.case_invoices add column if not exists pdf_url_signed_last text;
alter table public.case_invoices add column if not exists pdf_synced_at timestamptz;
alter table public.case_invoices add column if not exists pdf_status text
  check (pdf_status is null or pdf_status in ('pending', 'ok', 'error'));

comment on column public.case_invoices.error_detalle is 'Último error al enviar o sincronizar con QuickBooks.';
comment on column public.case_invoices.qb_total is 'TotalAmt en QBO (última sync webhook o creación).';
comment on column public.case_invoices.qb_balance is 'Balance en QBO (saldo pendiente).';

-- Cola simple: factura en QBO sin fila local enlazada por qb_invoice_id.
create table if not exists public.qbo_invoice_unmatched (
  id uuid primary key default gen_random_uuid(),
  qb_invoice_id text not null,
  doc_number text,
  realm_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_qbo_invoice_unmatched_qb_id on public.qbo_invoice_unmatched(qb_invoice_id);

comment on table public.qbo_invoice_unmatched is 'Eventos Invoice de QBO sin case_invoices.qb_invoice_id correspondiente.';

grant select, insert, update, delete on table public.qbo_invoice_unmatched to anon, authenticated;
grant all on table public.qbo_invoice_unmatched to service_role;

-- Bucket Storage para PDFs de factura (subida vía Edge Function con service_role).
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;
