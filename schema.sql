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
