-- =====================================================================
-- CORRECCIÓN 2026-11-25 · Permitir el estado OCUPADA en habitaciones
-- Error que corrige: "violates check constraint rooms_status_check"
-- al pulsar «Ocupar» (check-in / check-out) desde el admin.
-- Ejecutar en Supabase -> SQL Editor -> Run. Es idempotente y no borra datos.
-- =====================================================================
alter table public.rooms drop constraint if exists rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in
    ('DISPONIBLE','OCUPADA','PENDIENTE DE LIMPIEZA','EN LIMPIEZA','LIMPIA','EN VERIFICACIÓN','FUERA DE SERVICIO'));

-- Comprobación (debe listar OCUPADA):
select pg_get_constraintdef(oid) as regla from pg_constraint where conname = 'rooms_status_check';
