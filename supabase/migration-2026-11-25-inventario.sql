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
    )
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
    )
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
