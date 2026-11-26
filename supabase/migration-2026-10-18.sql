-- ⛔ NO EJECUTAR EN AQUAMARE (proyecto gfqukwxiaftxppjcdtjz). Archivo histórico del proyecto anterior:
-- apunta a otra URL y deja la regla de estados SIN 'OCUPADA'. Usa supabase/aquamar-setup.sql.
-- =====================================================================
-- MIGRACIÓN 2026-10-18 · Rol Supervisor (VL), estado EN VERIFICACIÓN y push
-- Ejecutar en Supabase -> SQL Editor DESPUÉS de schema.sql. Es idempotente.
-- =====================================================================

-- 1) Rol VL en usuarios -------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('ADMIN','EMPLEADA','VL'));

-- 2) Estado EN VERIFICACIÓN (reemplaza INSPECCIÓN) ----------------------
alter table public.rooms drop constraint if exists rooms_status_check;
update public.rooms set status = 'EN VERIFICACIÓN' where status = 'INSPECCIÓN';
alter table public.rooms
  add constraint rooms_status_check check (status in
    ('DISPONIBLE','PENDIENTE DE LIMPIEZA','EN LIMPIEZA','LIMPIA','EN VERIFICACIÓN','FUERA DE SERVICIO'));

-- 3) Tokens de notificaciones push --------------------------------------
create table if not exists public.push_tokens (
  token      text primary key,
  username   text not null,
  role       text not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_role on public.push_tokens(role);

alter table public.push_tokens enable row level security;
drop policy if exists "anon_full_access" on public.push_tokens;
create policy "anon_full_access" on public.push_tokens
  for all to anon, authenticated using (true) with check (true);

-- 3b) Realtime: el panel del supervisor se refresca en vivo --------------
do $$
declare t text;
begin
  foreach t in array array['rooms','cleaning_sessions','incidents'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 4) Trigger: habitación pasa a EN VERIFICACIÓN -> Edge Function --------
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_room_verification()
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
    body    := jsonb_build_object('room_id', new.id, 'number', new.number::text)
  );
  return new;
exception when others then
  -- Un fallo al notificar nunca debe bloquear el cambio de estado.
  return new;
end;
$$;

drop trigger if exists trg_room_verification on public.rooms;
create trigger trg_room_verification
  after update of status on public.rooms
  for each row
  when (new.status = 'EN VERIFICACIÓN' and old.status is distinct from new.status)
  execute function public.notify_room_verification();

-- ---------------------------------------------------------------------
-- VERIFICACIÓN (ejecutar a mano):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('users_role_check','rooms_status_check');
--   select * from public.push_tokens;
--   -- tras pasar una habitación a EN VERIFICACIÓN:
--   select status_code, content from net._http_response order by id desc limit 3;
-- ---------------------------------------------------------------------
