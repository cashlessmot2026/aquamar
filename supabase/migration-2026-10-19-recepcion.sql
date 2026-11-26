-- ⛔ NO EJECUTAR EN AQUAMARE (proyecto gfqukwxiaftxppjcdtjz). Archivo histórico del proyecto anterior:
-- apunta a otra URL y deja la regla de estados SIN 'OCUPADA'. Usa supabase/aquamar-setup.sql.
-- =====================================================================
-- MIGRACIÓN 2026-10-19 · Ocupación (check-in/out), servicios de limpieza y push al aseo
-- Ejecutar en Supabase -> SQL Editor DESPUÉS de migration-2026-10-18.sql. Es idempotente.
-- ⚠️ Ejecútala ANTES de subir el nuevo index.html (la app escribe las columnas nuevas).
-- =====================================================================

-- 1) Habitaciones: estado OCUPADA, horas de entrada/salida y colaborador asignado -------
alter table public.rooms add column if not exists check_in    timestamptz;
alter table public.rooms add column if not exists check_out   timestamptz;
alter table public.rooms add column if not exists assigned_to text;

alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in
    ('DISPONIBLE','OCUPADA','PENDIENTE DE LIMPIEZA','EN LIMPIEZA','LIMPIA','EN VERIFICACIÓN','FUERA DE SERVICIO'));

-- 2) Colaboradores: casilla "rol limpieza" (recibe avisos y puede tomar servicios) -------
alter table public.employees add column if not exists cleaning_role boolean not null default true;

-- 3) Tokens push: también del personal de aseo ------------------------------------------
alter table public.push_tokens add column if not exists employee_id text;
create index if not exists idx_push_tokens_employee on public.push_tokens(employee_id);

-- 4) Triggers: avisan a la Edge Function (estado de la habitación / asignación) ---------
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_room_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://redljbblmveabflxeddv.supabase.co/functions/v1/notify-verification',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlZGxqYmJsbXZlYWJmbHhlZGR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMzc0NzAsImV4cCI6MjEwNzkxMzQ3MH0.LJrPS3lukEXHSx4GGrIkdzdEk-11eamQpD3zQoJcX3E'
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

-- 5) Salida automática: cuando pasa la hora de check-out, la habitación pasa a limpieza -
--    (cada minuto, aunque no haya nadie con la app abierta). Requiere pg_cron.
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

-- Realtime (por si faltara alguna tabla)
do $$
declare t text;
begin
  foreach t in array array['rooms','cleaning_sessions','incidents'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- VERIFICACIÓN (a mano):
--   select column_name from information_schema.columns where table_name='rooms' and column_name in ('check_in','check_out','assigned_to');
--   select jobname, schedule from cron.job;
