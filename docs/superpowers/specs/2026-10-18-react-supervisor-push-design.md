# Housekeeping Control: migración a React, rol Supervisor (VL) y push — Diseño

Fecha: 2026-10-18 · Estado: pendiente de revisión del usuario

## 1. Objetivo
Convertir la app de limpieza hotelera (hoy un `index.html` en JS vanilla) a React, más rápida y dinámica, con botones de bordes redondeados. Agregar un rol **Supervisor (VL)** con interfaz oculta que verifica las habitaciones terminadas por el personal de aseo, y notificaciones push (incluso con la app cerrada) cuando una habitación queda "en verificación".

## 2. Alcance
Incluye:
- Reescritura de la UI en React 18 (CDN, sin build), un solo `index.html`.
- Rol `VL`, panel de verificación (aprobar / rechazar / agregar novedad).
- Nuevo estado de habitación `EN VERIFICACIÓN` (reemplaza `INSPECCIÓN`).
- Push por Firebase Cloud Messaging (FCM HTTP v1) disparadas desde Supabase.
- Cambio de proyecto Supabase (ya aplicado en `index.html`).

No incluye (fuera de esta entrega):
- Cloudflare R2 / fotos fuera de la base.
- Endurecimiento de seguridad (RLS por rol, hash de contraseñas). Queda anotado como deuda: hoy la política `anon_full_access` permite leer/escribir todo y las contraseñas están en texto plano.

## 3. Arquitectura
- **Frontend:** `index.html` con React 18 + ReactDOM + Babel standalone (o `React.createElement` precompilado a mano si el rendimiento de Babel en cliente resulta inaceptable; decidir en el plan). Librerías ya usadas se mantienen: Chart.js, Leaflet, jsQR, supabase-js. Se agregan Firebase App + Messaging (SDK compat v10/v13 por CDN).
- **Archivos a publicar en la raíz del repo:** `index.html`, `manifest.json`, `sw.js`, `firebase-messaging-sw.js`, carpeta `icons/`.
- **Datos:** Supabase proyecto `redljbblmveabflxeddv`. Se mantiene el modelo actual (hotel, floors, rooms, employees, users, assignments, cleaning_sessions, incidents, history, settings) y se agrega `push_tokens`.
- **Push:** trigger SQL en `rooms` → Edge Function `notify-verification` → FCM HTTP v1 → dispositivos de los VL.
- **Caché offline:** `sw.js` cachea la app y las librerías CDN; `CACHE_VERSION` sube a `v3`.

## 4. Roles y acceso
- `ADMIN` (recepción), `EMPLEADA` (aseo), `VL` (supervisor). Se amplía el `check` de `users.role`.
- Login normal sin cambios (usuario admin; colaborador por cédula o correo).
- Acceso oculto del supervisor: tocar 5 veces seguidas el logo de la pantalla de login revela el formulario de supervisor. Los usuarios VL los crea el admin en la sección Administradores.

## 5. Estados de habitación
`DISPONIBLE`, `PENDIENTE DE LIMPIEZA`, `EN LIMPIEZA`, `LIMPIA`, **`EN VERIFICACIÓN`**, `FUERA DE SERVICIO`.

Flujo:
```
EN LIMPIEZA --(aseo termina)--> EN VERIFICACIÓN --(VL aprueba)--> DISPONIBLE
                                      |
                                      +--(VL rechaza)--> EN LIMPIEZA (+ aviso al personal de aseo)
```
- Migración SQL: reemplazar `INSPECCIÓN` por `EN VERIFICACIÓN` en el `check` de `rooms.status` y convertir filas existentes.
- Recepción (admin) ve `DISPONIBLE` apenas se aprueba.
- Al finalizar la limpieza, la sesión de limpieza se cierra (`FINALIZADA`) y la habitación pasa a `EN VERIFICACIÓN`.

## 6. Panel del supervisor
- Lista en vivo (Supabase Realtime o polling corto) de habitaciones en `EN VERIFICACIÓN`: número, piso, colaborador que limpió, duración.
- Acciones por habitación: **Aprobar**, **Rechazar**, **Agregar novedad** (usa la tabla `incidents`).
- Al tocar una notificación se abre directo este panel.

## 7. Notificaciones push
- Al iniciar sesión, un VL pide permiso de notificaciones, obtiene el token FCM (clave VAPID) y lo guarda en `push_tokens (token, username, role, updated_at)`.
- Trigger `AFTER UPDATE` en `rooms` cuando `status` cambia a `EN VERIFICACIÓN` llama (vía `pg_net`/Database Webhook) a la Edge Function.
- La Edge Function lee los tokens con rol `VL`, obtiene un access token OAuth2 con la cuenta de servicio y envía el mensaje a FCM HTTP v1. Tokens inválidos (`UNREGISTERED`) se borran.
- `firebase-messaging-sw.js` muestra la notificación en segundo plano y abre la app en el panel de verificación al tocarla.
- Secreto: cuenta de servicio de Firebase cargada como secret `FCM_SERVICE_ACCOUNT` en Supabase; nunca en el repo.

### Configuración de Firebase (cliente, pública)
- projectId `house-53644`, messagingSenderId `144124364159`, appId `1:144124364159:web:e9b662d0bb45b7f79d864a`, apiKey y authDomain según el config entregado.
- Clave VAPID: pendiente de confirmar como texto exacto (la leída de captura debe verificarse).

## 8. UI
- Botones con bordes redondeados (radio alto, estados hover/active suaves).
- Componentes React por vista (Login, Admin, Empleada, Supervisor); estado global ligero con hooks/contexto; renderizado por componentes en lugar de `innerHTML`.
- Se conserva el tema actual y las vistas existentes (dashboard, habitaciones, asignaciones, limpiezas, tiempos, novedades, reportes, configuración).

## 9. Errores y límites
- Push en iPhone solo con la PWA instalada (iOS ≥ 16.4); si el usuario niega el permiso, el panel del supervisor sigue funcionando (sin push).
- Fallo de la Edge Function no bloquea el cambio de estado de la habitación; se registra el error.
- CDN caído: el service worker sirve la app desde caché.

## 10. Pruebas
- Flujo completo con datos de prueba en el Supabase nuevo: asignar → limpiar → EN VERIFICACIÓN → aprobar/rechazar → DISPONIBLE.
- Recepción de push con la app cerrada en Android/Chrome y iOS instalado.
- Verificar que el acceso oculto no es visible en el login normal.
- Verificar instalación PWA e íconos tras subir los archivos.

## 11. Entrega
Entrego los archivos listos en la carpeta del proyecto, más el SQL de migración y el código de la Edge Function con los comandos de despliegue. El usuario sube los archivos al repo `cashlesscolombia-blip/limpieza` y ejecuta el SQL en Supabase.
