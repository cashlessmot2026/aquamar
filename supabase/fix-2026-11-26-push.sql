-- =====================================================================
-- CORRECCIÓN 2026-11-26 · Notificaciones push que no llegaban
-- 1) Los triggers llamaban a la función con el límite por defecto de pg_net (5 s). Con la función "fría"
--    (firma + permiso de Google + FCM) se pasaba de ese tiempo y la llamada se cortaba sin enviar.
--    Ahora esperan hasta 20 s.
-- 2) Tabla push_log: la función deja ahí el resultado de cada aviso (a quién, cuántos enviados, error).
-- Ejecutar en Supabase -> SQL Editor -> Run. Es idempotente y no borra datos.
-- Después: supabase functions deploy notify-verification --no-verify-jwt
-- =====================================================================
create extension if not exists pg_net with schema extensions;

-- 1) Registro de envíos ------------------------------------------------
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

-- 2) Trigger de habitaciones (por limpiar, asignada, terminada) ---------
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
    timeout_milliseconds := 20000
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

-- 3) Trigger de inventario (aviso al admin) -----------------------------
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

-- 4) Diagnóstico: últimas llamadas de los triggers a la función --------
--    timed_out = true  -> se cortó por tiempo (lo que corrige este script)
--    status_code 200   -> la función respondió; "content" dice cuántas push envió
select id, created, status_code, timed_out, error_msg, left(content::text, 200) as respuesta
from net._http_response order by created desc limit 15;
