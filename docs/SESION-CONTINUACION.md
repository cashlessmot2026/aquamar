# AQUAMARE · Housekeeping — Historial y estado del trabajo

**Última actualización:** 2026-11-26
**Para retomar:** abre Claude Code en `C:\Users\victo\OneDrive\Desktop\limpieza` y escribe:
> lee docs/SESION-CONTINUACION.md y continúa

---

## ▶ Estado actual (resumen)
- App web instalable (PWA) **AQUAMARE** (Aquamare Hotel), tema claro (blanco / azules / negro).
- Publicada en **https://cashlessmot2026.github.io/aquamar/** — repo público `cashlessmot2026/aquamar`, rama `main`.
- Base de datos **Supabase `gfqukwxiaftxppjcdtjz`** (instalada con `supabase/aquamar-setup.sql` + `fix-2026-11-25-estado-ocupada.sql`). El correo de la cuenta está en la memoria local de Claude (no en el repo).
- Notificaciones push **funcionando** (el usuario confirmó que le llegan). Firebase `house-53644`, Edge Function `notify-verification`, secret `FCM_SERVICE_ACCOUNT` cargado.
- Funciona: login por rol, ocupar / check-in / check-out (con «🔒 Ocupar» bloqueado hasta la verificación), servicios de limpieza (un servicio a la vez), escaneo QR real, NFC, inventario de habitación con alertas al admin, verificación del supervisor, dashboard con gráficas, instalación como app en Android / iPhone / PC.

## ⏳ Pendientes
1. **Arreglo de push (2026-11-26), lo hace el usuario, en este orden:**
   a) SQL Editor → ejecutar `supabase/fix-2026-11-26-push.sql` (timeout 20 s en los triggers + tabla `push_log`). La última consulta del script muestra las llamadas recientes de `pg_net`: `timed_out = true` confirma la causa.
   b) `supabase functions deploy notify-verification --no-verify-jwt`
   c) Probar: check-out → push «Habitación por limpiar» al aseo libre; asignar → «Servicio asignado»; terminar → «Limpieza terminada» al supervisor y al admin.
   d) Si algo no llega: `GET /rest/v1/push_log?order=created_at.desc&limit=20` (o `select * from push_log`) dice a quién se envió y el error.
2. **Reimprimir todos los QR** (Habitaciones → «🖨️ Imprimir QR de todas»): los impresos antes del 2026-11-25 eran un dibujo sin datos.
3. **Regrabar los TAG NFC** (Editar habitación → «📶 Asignar TAG», en Chrome Android) para que el iPhone también los lea.
4. Confirmar en celular real que el escáner QR lee las etiquetas nuevas.
5. Cada dispositivo debe pulsar «Activar notificaciones» (admin en Inventario; supervisor y aseo en su panel). iPhone: app instalada en inicio, iOS ≥ 16.4. Hoy hay 3 registrados: `admin`, `sr`, `1082` (victor). `jorge` no tiene dispositivo.
6. Idea: cuando el aseo pulsa «Tomar servicio» le llega a sí mismo la push «Servicio asignado» (el trigger no distingue quién asignó).
7. Opcional (idea): avisar a un colaborador que queda libre si ya hay habitaciones por limpiar sin tomar.

## Reglas del usuario (respetar)
- No pedir permiso para seguir con lo que falte; subir al repo lo necesario.
- Cuando pregunte «¿con qué correo está la base de datos?», responder con el correo guardado en la memoria local de Claude.
- **Clave privada de Firebase** (`secrets/house-53644-firebase-adminsdk-*.json`, copia en `Downloads`): **nunca leerla, mostrarla, pegarla en el chat ni subirla**. `secrets/` está en `.gitignore`.
- El repo es **público**: no escribir correos, contraseñas ni secretos en archivos del proyecto. No mostrar contraseñas al inspeccionar la base.
- No borrar datos reales. Mis pruebas en la nube solo con ids `TEST-` (p. ej. habitación `TEST-ROOM-9999`) y se borran al terminar. Para pruebas de interfaz usar copia local sin nube: `sed 's#https://gfqukwxiaftxppjcdtjz.supabase.co#https://offline.invalid#' index.html > zz-test-offline.html` (en `.gitignore`).
- Deuda aceptada / fuera de alcance: RLS abiertas (`anon_full_access`), contraseñas en texto plano, fotos como Data URL.

## Datos reales en la base (no borrar)
- Usuarios: `admin` (ADMIN), `sr` (VL / supervisor).
- Colaboradores: `EMP-mwwzb10t53s3k` (doc 1082, el usuario lo usa para pruebas de aseo) y `EMP-mwwzcb8qaowzd`.
- 2 pisos, habitación 101, 9 artículos de inventario (sembrados por el SQL).

## Cómo trabajar
- **Fuente:** `src/` → `core.js` (datos, Supabase, QR/NFC, push), `components.jsx` (logo, instalación PWA, QR en pantalla), `admin.jsx`, `employee.jsx`, `supervisor.jsx`, `app.jsx`, `template.html`, `styles.base.css`, `styles.extra.css`.
- **Compilar:** `cd tools && npm install && node build.mjs` → genera `index.html` y los 4 `manifest*.json` (no editarlos a mano). No usar `| head` con el build (corta la salida y falla con EPIPE).
- **Publicar:** la carpeta del proyecto ES el repo git → `git add -A && git commit -m "..." && git push` (gh logueado como `cashlessmot2026`). Pages tarda 1–2 min. Autor de commits: `cashlessmot2026 <cashlessmot2026@users.noreply.github.com>`.
- **Supabase (lo hace el usuario):** SQL en el SQL Editor; función con la CLI (`supabase link --project-ref gfqukwxiaftxppjcdtjz`); secrets en Edge Functions → Secrets. Guía: `supabase/README-deploy.md`.
- **Comprobar la función sin enviar nada:** `POST …/functions/v1/notify-verification` con `{"kind":"ping"}` → `{"ignored":true}`. Con `{"kind":"assigned","number":"PRUEBA","assigned_to":"<EMP id>"}` envía una push real a ese colaborador.
- **Pruebas con Playwright:** `print()` bloquea el navegador → stubear `iframe.contentWindow.print`. Headless no conserva notificaciones del sistema (verificar interceptando `showNotification`). `DB` no está en `window` (usar `typeof DB`).

## Arquitectura y funcionalidad
- **URLs por rol** (misma página, cada una instalable como app): aseo `?app=aseo`, supervisor `?app=supervisor` (`?view=supervisor` desde la push), recepción `?app=admin`. Enlace de habitación `?r=ROOM-xxx` (abre el aseo en esa habitación; `?room=` también se acepta). Acceso oculto al supervisor: 5 toques al logo.
- **Flujo de habitación:** `DISPONIBLE → OCUPADA` (admin «Ocupar» con check-in/out) → `PENDIENTE DE LIMPIEZA` (salida manual o automática por pg_cron) → push al aseo disponible → «Tomar servicio» o asignación del supervisor/admin → escanear QR → `EN LIMPIEZA` → checklist de inventario → `EN VERIFICACIÓN` (push al supervisor) → aprobar (`DISPONIBLE`) / rechazar (vuelve a `EN LIMPIEZA`) / novedad.
- **Un servicio a la vez:** `isEmployeeBusy` (limpieza iniciada o habitación tomada/asignada sin terminar) bloquea «Tomar servicio», la asignación y el inicio por QR de otra habitación.
- **Inventario:** catálogo `inventory_items` (admin: crear/editar/eliminar, por categoría y tipo de habitación); revisión `inventory_checks` al finalizar (diferencia = contado ≠ esperado; cambio = ≠ revisión anterior). Trigger `trg_inventory_alert` → push a `role = 'ADMIN'`.
- **Push:** `push_tokens` (token, username, role ADMIN/VL/EMPLEADA, employee_id). Triggers `trg_room_status` (EN VERIFICACIÓN / PENDIENTE DE LIMPIEZA) y `trg_room_assigned` → `pg_net` (timeout 20 s) → función → FCM HTTP v1. Destinos: por limpiar → aseo disponible; asignada → ese colaborador si está disponible; terminada (EN VERIFICACIÓN) → VL + ADMIN; inventario → ADMIN. Cada aviso queda en `push_log`. Con la app abierta, `onMessage` muestra igual la notificación del sistema; cerrada o en otra pestaña la muestra `firebase-messaging-sw.js`.
- **QR:** reales (`qrcode-generator` 1.4.4), SVG nítido, corrección Q, 37×37 módulos. Etiquetas `printRoomLabels` (QR 70 mm) y `downloadRoomQr` (PNG 1200×1650). Escáner `QR.open` + `QR.loop`: lector nativo + jsQR de respaldo, 1920×1080 con enfoque continuo; `QrScan`/`CameraHelp` muestran el estado y cómo dar permiso de cámara.
- **NFC:** Web NFC (Chrome Android) con `NFC.read`/`NFC.stop`; los TAG graban enlace + texto; en iPhone `NfcHelp` explica la lectura nativa.
- **PWA:** `useInstallPrompt` / `InstallButton` / `InstallCard` / `InstallHelp`; `beforeinstallprompt` capturado en `template.html`. Service worker `sw.js` (caché `aquamare-housekeeping-v4`).
- **Librerías CDN:** React 18.3.1, Chart.js **4.4.1** (4.4.4 daba 404), Leaflet 1.9.4, jsQR 1.4.0 (**jsDelivr**; cdnjs daba 404), qrcode-generator 1.4.4, supabase-js@2, Firebase 10.12.2.

---

## Bitácora (más reciente primero)

### 2026-11-26
- **Push no llegaban tras el último cambio.** La función desplegada sí envía (llamada directa: `{"sent":1}` a victor). El fallo está en el camino trigger → función: `pg_net` corta a los 5 s y la función en frío (firma + OAuth Google + FCM) puede pasarse; el trigger traga el error. Arreglo: `fix-2026-11-26-push.sql` (timeout 20 s + `push_log`), caché del permiso de Google en la función, envíos en paralelo.
- **Destinos pedidos por el usuario:** aseo solo si está disponible (por limpiar y asignado); «✅ Limpieza terminada» (con el nombre del aseo) al supervisor **y** al admin.

### 2026-11-25
- **Un servicio a la vez + push solo al aseo disponible** (`560ee35`): la función excluye a quien tiene otra habitación tomada/asignada; la app impide iniciar otra habitación por QR. Se mantuvo «Servicio asignado».
- **Revisión de la función push** (`8945d2e`): API correcta (FCM HTTP v1 `projects/house-53644/messages:send`, OAuth `firebase.messaging`), mismo proyecto en función, app y SW. Corregido: ya no borra tokens ante cualquier `INVALID_ARGUMENT`. Prueba real: `{"sent":1,"removed":1}`. El usuario confirmó que le llegan las push.
- **Repo completo** (`a89984a`): la carpeta del proyecto pasó a ser el repo; `.gitignore` protege `secrets/` y `node_modules`; README con estructura y cómo publicar.
- **QR nítido** (`1e7899c`): SVG, corrección Q, enlace corto `?r=`, etiqueta de 70 mm, descarga PNG.
- **Cámara / permisos** (`e14e0cc`): estados visibles, ayuda para permiso bloqueado (Android / iPhone / PC / navegador de WhatsApp), reintentar, lector híbrido nativo + jsQR.
- **QR reales y NFC** (`66c8dbd`): el QR anterior era un patrón falso sin datos; NFC con AbortController y TAG con enlace.
- **Push con la app abierta** (`e08adc7`): `onMessage` muestra la notificación del sistema; jsQR movido a jsDelivr.
- **Secret faltante**: la función respondía «Falta el secret FCM_SERVICE_ACCOUNT»; el usuario lo cargó en Supabase.
- **«Ocupar» fallaba**: `rooms_status_check` sin `OCUPADA` (se había corrido un SQL antiguo). El usuario ejecutó `fix-2026-11-25-estado-ocupada.sql`. SQL antiguos marcados «NO EJECUTAR». Botón «🔒 Ocupar» con la etapa (`4511b84`).
- **Marca AQUAMARE + tema claro + PWA**: logo e íconos desde `icons/aqua.png` (originales en `backup/icons-original-2026-11-25/`), tema claro, instalación en Android / iPhone / PC, manifests generados por `build.mjs`. Corregido Chart.js (404).
- **Inventario de habitación**: checklist al finalizar la limpieza, sección Inventario del admin, push al admin por diferencias o cambios.
- **Migración**: de Supabase `redljbblmveabflxeddv` / repo `cashlesscolombia-blip/limpieza` a Supabase `gfqukwxiaftxppjcdtjz` / repo `cashlessmot2026/aquamar`.

### 2026-10-18 / 19 (proyecto anterior)
- Migración de JS puro a React (respaldo en `backup/index-vanilla-2026-10-18.html`), rol supervisor (VL), estado EN VERIFICACIÓN, push FCM, recepción (ocupación, check-in/out, servicios de limpieza), URLs por rol.
- Specs/planes de esa etapa: `docs/superpowers/specs/2026-10-18-react-supervisor-push-design.md`, `docs/superpowers/plans/2026-10-18-react-supervisor-push.md`.

### 2026-09 (inicio)
- Ver `resumen-conversacion.md`: TAG NFC y QR por habitación, PWA inicial, eliminación de datos demo, administradores, login de colaboradores con cédula/correo.
