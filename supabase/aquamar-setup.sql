-- =====================================================================
-- AQUAMAR · INSTALACIÓN COMPLETA EN SUPABASE (proyecto gfqukwxiaftxppjcdtjz)
-- Pega TODO este archivo en Supabase -> SQL Editor -> Run. Es idempotente.
-- Contiene: schema.sql + supabase/migration-2026-11-25-inventario.sql
-- =====================================================================

-- =====================================================================
-- CASHLESS COLOMBIA · HOUSEKEEPING CONTROL
-- Esquema de base de datos para Supabase (PostgreSQL)
-- =====================================================================
-- Cómo usarlo:
--   1) Entra a tu proyecto Supabase -> SQL Editor -> New query.
--   2) Pega TODO este archivo y ejecútalo (Run).
--   3) Verifica en "Table editor" que aparezcan las 9 tablas.
--   4) La app (index.html) ya está configurada con la URL y la clave
--      "anon" de este mismo proyecto, así que no necesitas tocar nada más.
--
-- ⚠️ NOTA DE SEGURIDAD (léela antes de usar en producción):
-- Esta demo usa la clave pública "anon" desde el navegador, sin
-- autenticación real de Supabase (la app tiene su propia tabla "users"
-- con usuario/contraseña en texto plano, igual que la versión con
-- localStorage). Para que esto funcione, las políticas de Row Level
-- Security (RLS) de abajo son PERMISIVAS: cualquiera que tenga la clave
-- anon puede leer y escribir todas las tablas. Eso es aceptable para una
-- demo o una prueba de concepto, pero NO para producción con datos reales
-- de huéspedes/colaboradores. Para producción se recomienda:
--   - Usar Supabase Auth (email/contraseña o magic link) en vez de la
--     tabla "users" propia.
--   - Reescribir las políticas RLS para que cada rol solo pueda ver/editar
--     lo que le corresponde (auth.uid(), auth.jwt() ->> 'role', etc).
--   - Guardar las fotografías en Supabase Storage (no como Data URL en
--     la columna "photo"/"photo" de incidents/employees).
--   - Usar una Edge Function o API propia para validar el login en vez de
--     comparar contraseñas en el cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) HOTEL (fila única con la configuración general del hotel)
-- ---------------------------------------------------------------------
create table if not exists public.hotel (
  id            text primary key default 'main',
  name          text not null default 'Hotel Cashless Colombia',
  floors_count  integer not null default 0,
  rooms_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) PISOS
-- ---------------------------------------------------------------------
create table if not exists public.floors (
  id          text primary key,
  name        text not null,
  number      integer not null unique,
  rooms_count integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) COLABORADORES (housekeeping)
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  id          text primary key,
  name        text not null,
  document    text,
  phone       text,
  email       text,
  position    text default 'Housekeeping',
  shift       text,
  floor       integer,
  status      text not null default 'ACTIVA'
              check (status in ('ACTIVA','INACTIVA','EN DESCANSO','EN TURNO')),
  photo       text, -- Data URL en demo; en producción usar Supabase Storage
  password    text, -- contraseña de acceso del colaborador (texto plano solo para la demo, ver nota de seguridad arriba)
  cleaning_role boolean not null default true, -- recibe avisos de limpieza y puede tomar servicios
  created_at  timestamptz not null default now()
);

-- Migración: agrega la columna "password" si la tabla ya existía de una
-- ejecución previa de este script (antes de incluir el login de colaboradores).
alter table public.employees add column if not exists password text;

-- ---------------------------------------------------------------------
-- 4) HABITACIONES
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id                text primary key,
  number            integer not null,
  floor             integer not null,
  type              text not null default 'NORMAL' check (type in ('NORMAL','ESPECIAL')),
  category          text not null default 'Normal',
  estimated_minutes integer not null default 30,
  status            text not null default 'DISPONIBLE'
                    check (status in ('DISPONIBLE','PENDIENTE DE LIMPIEZA','EN LIMPIEZA','LIMPIA','EN VERIFICACIÓN','FUERA DE SERVICIO','OCUPADA')),
  check_in          timestamptz,
  check_out         timestamptz,
  assigned_to       text,
  qr                text unique,
  nfc               text unique,
  notes             text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);
create index if not exists idx_rooms_floor on public.rooms(floor);
create index if not exists idx_rooms_status on public.rooms(status);

-- ---------------------------------------------------------------------
-- 5) USUARIOS (login propio de la app: administradores)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  username    text primary key,
  password    text not null, -- texto plano solo para la demo, ver nota de seguridad arriba
  role        text not null check (role in ('ADMIN','EMPLEADA','VL')),
  name        text,
  employee_id text references public.employees(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6) ASIGNACIONES (habitaciones asignadas a cada colaborador)
-- ---------------------------------------------------------------------
create table if not exists public.assignments (
  id          text primary key,
  employee_id text references public.employees(id) on delete cascade,
  room_ids    jsonb not null default '[]'::jsonb, -- array de ids de rooms
  created_at  timestamptz not null default now()
);
create index if not exists idx_assignments_employee on public.assignments(employee_id);

-- ---------------------------------------------------------------------
-- 7) SESIONES DE LIMPIEZA (registro/auditoría principal)
-- ---------------------------------------------------------------------
create table if not exists public.cleaning_sessions (
  id                text primary key,
  room_id           text references public.rooms(id) on delete cascade,
  employee_id       text references public.employees(id) on delete cascade,
  start_time        timestamptz not null,
  end_time          timestamptz,
  estimated_minutes integer not null default 30,
  gps_start         jsonb, -- { lat, lng, accuracy, timestamp }
  gps_end           jsonb,
  status            text not null default 'EN_LIMPIEZA' check (status in ('EN_LIMPIEZA','FINALIZADA')),
  duration_seconds  integer not null default 0,
  diff_seconds      integer not null default 0, -- real - estimado (segundos)
  created_at        timestamptz not null default now()
);
create index if not exists idx_sessions_room on public.cleaning_sessions(room_id);
create index if not exists idx_sessions_employee on public.cleaning_sessions(employee_id);
create index if not exists idx_sessions_status on public.cleaning_sessions(status);
create index if not exists idx_sessions_start on public.cleaning_sessions(start_time desc);

-- ---------------------------------------------------------------------
-- 8) NOVEDADES / INCIDENCIAS
-- ---------------------------------------------------------------------
create table if not exists public.incidents (
  id          text primary key,
  session_id  text references public.cleaning_sessions(id) on delete cascade,
  room_id     text references public.rooms(id) on delete cascade,
  employee_id text references public.employees(id) on delete cascade,
  type        text not null,
  description text,
  photo       text, -- Data URL en demo; en producción usar Supabase Storage
  gps         jsonb,
  timestamp   timestamptz not null default now()
);
create index if not exists idx_incidents_room on public.incidents(room_id);
create index if not exists idx_incidents_timestamp on public.incidents(timestamp desc);

-- ---------------------------------------------------------------------
-- 9) HISTORIAL / AUDITORÍA DE EVENTOS
-- ---------------------------------------------------------------------
create table if not exists public.history (
  id          text primary key,
  timestamp   timestamptz not null default now(),
  user_name   text,
  event       text,
  description text
);
create index if not exists idx_history_timestamp on public.history(timestamp desc);

-- ---------------------------------------------------------------------
-- 10) CONFIGURACIÓN (fila única con los parámetros del sistema)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id                   text primary key default 'main',
  normal_minutes       integer not null default 30,
  special_minutes      integer not null default 50,
  presidential_minutes integer not null default 75,
  tolerance            integer not null default 5,
  yellow_limit         integer not null default 10,
  red_limit            integer not null default 10,
  gps_required         boolean not null default true,
  photo_required       boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 11) TOKENS DE NOTIFICACIONES PUSH (dispositivos de los supervisores VL)
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  token      text primary key,
  username   text not null,
  role       text not null,
  employee_id text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_role on public.push_tokens(role);

-- =====================================================================
-- ROW LEVEL SECURITY (RLS)
-- Se habilita en todas las tablas y se agregan políticas permisivas
-- para el rol "anon" (la clave pública que usa la app). Ver la nota de
-- seguridad al inicio del archivo antes de llevar esto a producción.
-- =====================================================================
alter table public.hotel              enable row level security;
alter table public.floors             enable row level security;
alter table public.employees          enable row level security;
alter table public.rooms              enable row level security;
alter table public.users              enable row level security;
alter table public.assignments        enable row level security;
alter table public.cleaning_sessions  enable row level security;
alter table public.incidents          enable row level security;
alter table public.history            enable row level security;
alter table public.settings           enable row level security;
alter table public.push_tokens        enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array['hotel','floors','employees','rooms','users','assignments',
                         'cleaning_sessions','incidents','history','settings','push_tokens'])
  loop
    execute format('drop policy if exists "anon_full_access" on public.%I;', t);
    execute format(
      'create policy "anon_full_access" on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- =====================================================================
-- FIN DEL ESQUEMA
-- Después de ejecutar este script, abre index.html: la primera vez que
-- alguien entre y las tablas estén vacías, la app sembrará únicamente la
-- configuración base y el administrador principal (admin / 1234) en este
-- proyecto de Supabase. Desde ese momento todos los dispositivos que abran
-- el archivo compartirán la misma información en la nube, y el propio
-- administrador debe crear los pisos, habitaciones y colaboradores reales
-- desde la interfaz.
-- =====================================================================


-- =====================================================================
-- MIGRACIÓN 2026-11-25 · Proyecto Aquamar (gfqukwxiaftxppjcdtjz)
-- Triggers de push + salida automática + INVENTARIO DE HABITACIÓN.
-- Va incluida al final de supabase/aquamar-setup.sql. Es idempotente.
-- =====================================================================

-- 0) Estados válidos de habitación (incluye OCUPADA). Se fija aquí también por si
--    se corrió antes algún SQL antiguo que dejó la regla sin OCUPADA.
alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in
    ('DISPONIBLE','OCUPADA','PENDIENTE DE LIMPIEZA','EN LIMPIEZA','LIMPIA','EN VERIFICACIÓN','FUERA DE SERVICIO'));
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('ADMIN','EMPLEADA','VL'));

-- 1) Triggers de habitaciones -> Edge Function notify-verification -----
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_room_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://gfqukwxiaftxppjcdtjz.supabase.co/functions/v1/notify-verification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',       'sb_publishable_n7qmek6Z55maBOztUoomVg__NbSJ4dS'
    ),
    body    := jsonb_build_object(
      'kind',        TG_ARGV[0],
      'room_id',     new.id,
      'number',      new.number::text,
      'status',      new.status,
      'assigned_to', new.assigned_to
    ),
    timeout_milliseconds := 20000  -- el límite por defecto (5 s) cortaba la función en frío
  );
  return new;
exception when others then
  -- Un fallo al notificar nunca debe bloquear el cambio de la habitación.
  return new;
end;
$$;

drop trigger if exists trg_room_verification on public.rooms;
drop trigger if exists trg_room_status on public.rooms;
create trigger trg_room_status
  after update of status on public.rooms
  for each row
  when (new.status in ('EN VERIFICACIÓN','PENDIENTE DE LIMPIEZA') and old.status is distinct from new.status)
  execute function public.notify_room_event('status');

drop trigger if exists trg_room_assigned on public.rooms;
create trigger trg_room_assigned
  after update of assigned_to on public.rooms
  for each row
  when (new.assigned_to is not null and old.assigned_to is distinct from new.assigned_to)
  execute function public.notify_room_event('assigned');

-- 2) Salida automática al vencer el check-out (requiere pg_cron) --------
do $$
begin
  create extension if not exists pg_cron with schema extensions;
  perform cron.unschedule(jobid) from cron.job where jobname = 'auto-checkout';
  perform cron.schedule(
    'auto-checkout', '* * * * *',
    $job$update public.rooms set status = 'PENDIENTE DE LIMPIEZA'
         where status = 'OCUPADA' and check_out is not null and check_out <= now()$job$
  );
exception when others then
  raise notice 'pg_cron no disponible (%). La app hace la salida automática mientras haya un admin o supervisor conectado.', sqlerrm;
end $$;

-- 3) INVENTARIO: catálogo de artículos (lo administra el admin) ---------
create table if not exists public.inventory_items (
  id              text primary key,
  name            text not null,
  category        text not null default 'Otros',
  expected_qty    integer not null default 1 check (expected_qty >= 0),
  room_categories jsonb not null default '[]'::jsonb, -- vacío = aplica a todas las habitaciones
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

-- 4) INVENTARIO: revisiones que hace el aseo al finalizar la limpieza ---
create table if not exists public.inventory_checks (
  id          text primary key,
  room_id     text references public.rooms(id) on delete cascade,
  session_id  text references public.cleaning_sessions(id) on delete set null,
  employee_id text references public.employees(id) on delete set null,
  timestamp   timestamptz not null default now(),
  items       jsonb not null default '[]'::jsonb, -- [{itemId,name,category,expected,found,previous,ok,changed}]
  differences integer not null default 0,         -- artículos con cantidad distinta a la esperada
  changes     integer not null default 0,         -- artículos que cambiaron frente a la revisión anterior
  notes       text
);
create index if not exists idx_inventory_checks_room on public.inventory_checks(room_id);
create index if not exists idx_inventory_checks_ts   on public.inventory_checks(timestamp desc);

alter table public.inventory_items  enable row level security;
alter table public.inventory_checks enable row level security;
drop policy if exists "anon_full_access" on public.inventory_items;
create policy "anon_full_access" on public.inventory_items  for all to anon, authenticated using (true) with check (true);
drop policy if exists "anon_full_access" on public.inventory_checks;
create policy "anon_full_access" on public.inventory_checks for all to anon, authenticated using (true) with check (true);

-- Artículos iniciales (el admin los edita o elimina desde la app) -------
insert into public.inventory_items (id, name, category, expected_qty, sort_order) values
  ('ITEM-sabanas',    'Sábanas',               'Lencería',         2, 1),
  ('ITEM-almohadas',  'Almohadas',             'Lencería',         2, 2),
  ('ITEM-toallas',    'Toallas',               'Lencería',         4, 3),
  ('ITEM-plancha',    'Plancha',               'Equipos',          1, 1),
  ('ITEM-cajafuerte', 'Caja fuerte (funciona)','Equipos',          1, 2),
  ('ITEM-agua',       'Agua',                  'Nevera / minibar', 2, 1),
  ('ITEM-gaseosa',    'Gaseosa',               'Nevera / minibar', 2, 2),
  ('ITEM-cerveza',    'Cerveza',               'Nevera / minibar', 2, 3),
  ('ITEM-snack',      'Snack',                 'Nevera / minibar', 2, 4)
on conflict (id) do nothing;

-- 5) Push al ADMIN cuando una revisión trae diferencias o cambios -------
create or replace function public.notify_inventory_check()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare num text;
begin
  select r.number::text into num from public.rooms r where r.id = new.room_id;
  perform net.http_post(
    url     := 'https://gfqukwxiaftxppjcdtjz.supabase.co/functions/v1/notify-verification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',       'sb_publishable_n7qmek6Z55maBOztUoomVg__NbSJ4dS'
    ),
    body    := jsonb_build_object(
      'kind',        'inventory',
      'room_id',     new.room_id,
      'number',      coalesce(num, ''),
      'check_id',    new.id,
      'differences', new.differences,
      'changes',     new.changes,
      'items',       new.items,
      'notes',       new.notes
    ),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_inventory_alert on public.inventory_checks;
create trigger trg_inventory_alert
  after insert on public.inventory_checks
  for each row
  when (new.differences > 0 or new.changes > 0)
  execute function public.notify_inventory_check();

-- 6) Realtime (paneles en vivo) -----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rooms','cleaning_sessions','incidents','inventory_checks','inventory_items'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- VERIFICACIÓN (a mano):
--   select * from public.inventory_items order by category, sort_order;
--   select id, differences, changes from public.inventory_checks order by timestamp desc limit 5;
--   select status_code, content from net._http_response order by id desc limit 3;

-- 7) Registro de push (2026-11-26): la función guarda aquí cada aviso ----
create table if not exists public.push_log (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  event      text,
  room_id    text,
  number     text,
  sent       integer,
  removed    integer,
  recipients jsonb,
  error      text
);
create index if not exists idx_push_log_created on public.push_log(created_at desc);
alter table public.push_log enable row level security;
drop policy if exists "anon_read" on public.push_log;
create policy "anon_read" on public.push_log for select to anon, authenticated using (true);
--   select * from public.push_log order by created_at desc limit 20;
