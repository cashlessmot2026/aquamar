# Despliegue en Supabase (proyecto Aquamar)

Proyecto Supabase: `gfqukwxiaftxppjcdtjz` · Proyecto Firebase (push): `house-53644`
Sitio publicado: https://cashlessmot2026.github.io/aquamar/

## 1. Base de datos (proyecto nuevo, vacío)
1. Supabase → SQL Editor → New query.
2. Pega TODO `supabase/aquamar-setup.sql` y pulsa **Run**. (Incluye el esquema, la recepción, los triggers de push, la salida automática y el inventario con 9 artículos iniciales.)
3. En Table editor deben aparecer, entre otras, `inventory_items` (9 filas) e `inventory_checks`.
4. Abre la app: el primer ingreso crea el admin inicial `admin` / `1234`. Cámbiala desde «Usuarios».

> Si alguna vez solo necesitas el inventario sobre una base ya creada, ejecuta `supabase/migration-2026-11-25-inventario.sql`.

## 2. Edge Function (requiere la CLI de Supabase)
```bash
npm i -g supabase            # o: scoop install supabase
supabase login
supabase link --project-ref gfqukwxiaftxppjcdtjz
supabase functions deploy notify-verification --no-verify-jwt
```
Secret con la cuenta de servicio de Firebase (PowerShell):
```powershell
$json = Get-Content C:\ruta\a\house-53644-firebase-adminsdk-XXXX.json -Raw
supabase secrets set "FCM_SERVICE_ACCOUNT=$json"
```
Nunca subas ese JSON al repositorio.

## 3. Qué notifica la función
| Evento | Quién recibe |
|---|---|
| Habitación pasa a EN VERIFICACIÓN | Supervisores (VL) |
| Habitación pasa a PENDIENTE DE LIMPIEZA | Aseo disponible |
| Servicio asignado | El colaborador asignado |
| **Inventario con diferencias o cambios** | **Administradores** (deben pulsar «Activar notificaciones» en Inventario) |

## 4. Prueba
```bash
curl -X POST https://gfqukwxiaftxppjcdtjz.supabase.co/functions/v1/notify-verification \
  -H "Content-Type: application/json" \
  -d '{"kind":"inventory","number":"101","differences":1,"changes":0,"items":[{"name":"Agua","expected":2,"found":1,"previous":2,"ok":false,"changed":true}]}'
```
Sin dispositivos admin registrados responde `{"sent":0,"removed":0}`.
