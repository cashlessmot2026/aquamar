# AQUAMARE · Housekeeping (antes CASHLESS COLOMBIA) — Estado de la sesión

Guardado el 2026-10-18 · actualizado el 2026-11-25 (migración a Aquamar + inventario + marca AQUAMARE). Para retomar: abre Claude Code en `C:\Users\victo\OneDrive\Desktop\limpieza` y pide "lee docs/SESION-CONTINUACION.md y continúa".

## ▶ Último estado (2026-11-25, noche)
- El usuario confirmó desplegado en Supabase `gfqukwxiaftxppjcdtjz`: `supabase/aquamar-setup.sql`, Edge Function `notify-verification` y secret `FCM_SERVICE_ACCOUNT`.
- Verificado en vivo: las 12 tablas responden; `inventory_items` tiene los 9 artículos; usuarios `admin` (ADMIN) y `sr` (VL); 2 pisos, 1 habitación, 2 colaboradores (datos reales del usuario: no borrar). La función responde (`{"kind":"ping"}` → `ignored:true`).
- `push_tokens` vacía: ningún celular ha pulsado aún «Activar notificaciones» (admin en Inventario, VL y aseo en su panel).
- Pendiente: que cada dispositivo active notificaciones y hacer una prueba real de inventario con diferencia (debe llegar push al admin).
- Datos reales en la nueva base: no borrar. Mis pruebas solo con ids `TEST-` y se limpian.
- **Push no llegaba (2026-11-25):** la función respondía `Falta el secret FCM_SERVICE_ACCOUNT` (el secret no estaba en el proyecto nuevo). Por pedido del usuario la clave se copió a `secrets/house-53644-firebase-adminsdk-fbsvc-5c336daf13.json` (protegida con `.gitignore`; NUNCA leerla, mostrarla ni publicarla; al publicar solo se copian los archivos del sitio). El usuario la cargó en Supabase → la prueba directa (`kind: assigned`, `number: PRUEBA`) devolvió `{"sent":1}` ✅. Se probó también el trigger con la habitación temporal TEST 9999 (DISPONIBLE → PENDIENTE DE LIMPIEZA, ya borrada); falta que el usuario confirme si le llegó a victor. El usuario ejecutó el fix de OCUPADA (regla confirmada con OCUPADA) y la prueba con TEST 9999 guardó estado, check-in y check-out ✅.
- **QR nítido (2026-11-25, commit 1e7899c):** `QR.svg(text)` (vectorial, crispEdges) para pantalla (`QrCanvas`) e impresión (`roomLabelHtml` / `printRoomLabels`, QR 70 mm); `QR.EC = 'Q'`, margen 4 módulos. Enlace corto `roomLink` = `…/aquamar/?r=ROOM-xxx` (37×37 módulos; `?room=` sigue aceptado; `?r=` fuerza APP_MODE aseo). `downloadRoomQr` genera etiqueta PNG 1200×1650. Probado: decodifica a 110 px.
- **Cámara / permisos (2026-11-25, commit e14e0cc):** `QR.open` devuelve `{ok, reason}` (denied | nocamera | busy | insecure | unsupported | error); `QrScan` + `CameraHelp` en `src/employee.jsx` muestran estado y pasos por plataforma (Android / iPhone / PC, aviso si es navegador de WhatsApp/Instagram), botón Reintentar y aviso a los 8 s si el permiso no se contesta. Loop híbrido: nativo + jsQR (si el nativo da vacío o 3 errores → solo jsQR). 1920x1080 + `focusMode: continuous`. Probado: con permiso abre; bloqueado muestra ayuda; nativo vacío/erróneo igual lee (≈250 ms). Pendiente: el usuario confirme en su celular (qué modelo/navegador y qué mensaje ve).
- **QR / NFC (2026-11-25, commit 66c8dbd):** `QR.renderVisual` dibujaba un patrón FALSO (no era un QR) → ahora QR real con `qrcode-generator` (cdnjs 1.4.4). Contenido = `roomLink(code)` = `…/aquamar/?app=aseo&room=ROOM-xxx`; `EmployeeApp` toma `?room=` al abrir (`takeRoomParam`). `findRoomByCode`/`parseRoomCode` en core aceptan enlace, ROOM-, NFC-ROOM- o número. Escáner con `QR.loop` (120 ms, imagen ≤720 px). `printRoomLabels(rooms)` (iframe) y `downloadRoomQr(room)`; botón «Imprimir QR de todas» en Habitaciones. NFC: AbortController (`NFC.stop`), TAG graba url + text; sin Web NFC → `NfcHelp` (iPhone lee el enlace nativo). **Todos los QR impresos antes son inválidos: reimprimir. TAG grabados antes (solo texto) siguen sirviendo en Android; regrabar para iPhone.** Ojo en pruebas: llamar `print()` en Playwright bloquea el navegador; stubear `contentWindow.print`.
- **Push con app abierta (2026-11-25):** diagnóstico con navegador `TEST-diag` (token borrado): la cadena Supabase → FCM → navegador FUNCIONA; con la app en pantalla FCM entrega a `onMessage` y solo salía el aviso interno. Ahora `onMessage` también llama `reg.showNotification` (verificado). App cerrada/otra pestaña: la muestra `firebase-messaging-sw.js`. Función con `webpush.headers Urgency: high` + icon/badge/tag → **el usuario debe redesplegar** `supabase functions deploy notify-verification --no-verify-jwt`. jsQR de cdnjs daba 404 → ahora jsDelivr (commit e08adc7). La función no tiene CORS (no hace falta: la llaman los triggers).
- **Ocupar bloqueado (2026-11-25):** en Habitaciones, mientras no esté DISPONIBLE se ve «🔒 Ocupar» con la etapa (`OCCUPY_LOCK` en `src/admin.jsx`). `transitionRoom` devuelve true / false (otro la cambió) / null (la nube rechazó; ya avisó). Publicado (commit 4511b84).
- **Bug «Ocupar» (2026-11-25):** la nube devolvía 23514 `rooms_status_check` sin 'OCUPADA' (probablemente se corrió también un SQL antiguo). Solución: el usuario debe ejecutar `supabase/fix-2026-11-25-estado-ocupada.sql`. Los SQL antiguos quedaron marcados «NO EJECUTAR». La app ahora muestra el motivo real del rechazo. Verificar después con una habitación `TEST-ROOM-9999` temporal (crear → PATCH a OCUPADA → borrar).

## Proyecto
- App de control de limpieza hotelera (PWA, React por CDN, un solo `index.html` generado).
- **Desde 2026-11-25** publicada en https://cashlessmot2026.github.io/aquamar/ (repo `cashlessmot2026/aquamar`, rama `main`, se publica con `git push` vía `gh` logueado como cashlessmot2026). Antes: `cashlesscolombia-blip/limpieza`.
- Supabase: proyecto **`gfqukwxiaftxppjcdtjz`** (llave publicable en `src/core.js`; el correo de la cuenta está en la memoria local de Claude, no en el repo). Antes `redljbblmveabflxeddv`. Firebase: proyecto `house-53644` (configs públicas ya en `src/core.js` y `firebase-messaging-sw.js`).
- No es repo git local. Yo subo a GitHub desde el navegador (subida web); el usuario sube SQL a Supabase y despliega la Edge Function.

## Reglas del usuario (respetar)
- No pedir permiso para seguir con lo que falte; subir al repo lo necesario.
- Clave privada de cuenta de servicio de Firebase (`Downloads\house-53644-firebase-adminsdk-fbsvc-*.json`): **nunca leerla, pegarla en el chat ni subirla al repo**. Solo vive como secret `FCM_SERVICE_ACCOUNT` en Supabase (ya cargado).
- No poner secretos en el repo. No mostrar contraseñas de usuarios al inspeccionar la base.
- Fuera de alcance / deuda aceptada: RLS abiertas (`anon_full_access`), contraseñas en texto plano, Cloudflare R2/fotos.
- No borrar datos reales: `admin`, `vl001` (victor lopez, VL), colaborador `andres` (id `EMP-mve3j3z27fkj9`, doc "1", sin código), piso 1, habitaciones 102 y 103. Mis pruebas solo usan ids/prefijos `TEST-` y se limpian.

## Arquitectura
- Fuente en `src/`: `core.js`, `components.jsx`, `admin.jsx`, `employee.jsx`, `supervisor.jsx`, `app.jsx`, `template.html`, `styles.base.css`, `styles.extra.css`.
- Build: `cd tools && npm install && node build.mjs` (esbuild, quita BOM, genera `index.html`).
- Respaldo original en `backup/`. `README.md` explica fuente y publicación.
- Archivos a publicar en raíz del repo: `index.html`, `sw.js` (CACHE `cc-housekeeping-v3`), `manifest.json`, `manifest-aseo.json`, `manifest-supervisor.json`, `manifest-admin.json`, `firebase-messaging-sw.js`, carpeta `icons/`.
- SQL / funciones: `schema.sql`, `supabase/migration-2026-10-18.sql`, `supabase/migration-2026-10-19-recepcion.sql`, `supabase/functions/notify-verification/index.ts`, `supabase/README-deploy.md`.
- Specs/planes: `docs/superpowers/specs/2026-10-18-react-supervisor-push-design.md` y `docs/superpowers/plans/2026-10-18-react-supervisor-push.md`.

## Funcionalidad publicada
- URLs por rol (misma página): aseo `?app=aseo`, supervisor `?app=supervisor` (`?view=supervisor` usado por push), admin `?app=admin`. Cada una exige su rol y es PWA separada. Acceso oculto: 5 toques al logo "CC" revela login de supervisor.
- Login tolerante a mayúsculas y espacios.
- Flujo de habitación: `DISPONIBLE → OCUPADA` (admin ocupa/da salida, check-in/out) → `PENDIENTE DE LIMPIEZA` (manual o automático al vencer check-out vía pg_cron + respaldo en cliente) → aseo "Tomar servicio" o VL/admin asigna → `EN LIMPIEZA` (iniciar escaneando QR) → `EN VERIFICACIÓN` (push a VL) → supervisor aprueba (`DISPONIBLE`), rechaza (vuelve a `EN LIMPIEZA`) o agrega novedad.
- Admin: Usuarios (Admin/VL), enlaces de acceso copiables, casilla "Rol limpieza", generador de código de 6 dígitos. Supervisor: pestañas Verificación / Servicios / Personal de aseo.
- Push (FCM v1): registro por rol; banner "Activar notificaciones".
- Última corrección: guardado de habitaciones ya no choca con QR/NFC repetidos; la app valida duplicados, muestra el motivo real y revierte el cambio local si la nube rechaza (también en pisos).

## Inventario de habitación (2026-11-25)
- Aseo: al pulsar FINALIZAR LIMPIEZA se abre el checklist (`InventoryChecklist` en `src/employee.jsx`); guarda en `inventory_checks` y luego finaliza.
- Admin: menú «📦 Inventario» (Revisiones / Artículos, CRUD de `inventory_items`, banner para activar push). Último inventario en el detalle de habitación y aviso en el Dashboard.
- diferencia = contado ≠ esperado; cambio = contado ≠ revisión anterior de esa habitación.
- Push: trigger `trg_inventory_alert` → Edge Function `kind: 'inventory'` → tokens con `role = 'ADMIN'`.
- SQL de instalación completa: `supabase/aquamar-setup.sql` (= schema.sql + migration-2026-11-25-inventario.sql).

## Pendiente / próximos pasos
1. **Decir/hacer por el usuario:** Habitaciones → Editar la 102 → Guardar (corrige su QR a `ROOM-102`, NFC `NFC-ROOM-102`); después ya se puede crear la 101. Revisar etiqueta QR impresa de la 102.
2. Confirmar que la push de prueba llegó al celular (VL `sent:1`, aseo `sent:1` en la prueba).
3. Asignar código de acceso a `andres`.
4. Cada celular debe pulsar "Activar notificaciones" (iPhone: PWA instalada, iOS ≥ 16.4).
5. Si pg_cron no está disponible, la salida automática solo ocurre con admin/supervisor conectado.
6. Prueba end-to-end real de push (tocaría habitación real) solo si el usuario lo pide.

## Notas de proceso
- Herramienta `find` de Chrome falla a veces con "Permission denied" la primera vez en github.com; reintentar.
- En la subida a GitHub, el aviso "ProTip" mueve el botón Commit; usar `find` + ref.
- Transcript completo: `C:\Users\victo\.claude\projects\C--Users-victo-OneDrive-Desktop-limpieza\13981644-db41-4d6b-a411-6022c29fecd9.jsonl`

## Marca AQUAMARE + tema claro + PWA (2026-11-25)
- Nombre: AQUAMARE (Aquamare Hotel). Logo desde `icons/aqua.png` (original del usuario; respaldo en `backup/icons-original-2026-11-25/`).
- Generados: `icons/logo-aquamare.png` (blanco), `icons/logo-aquamare-navy.png` (azul marino), `aquamare-mark*.png` (ola), íconos 192/512, maskable 192/512, apple-touch 180, `favicon-64.png`. Azul de marca `#061045`.
- Tema claro (blanco / azules / negro) en `src/styles.base.css` + `src/styles.extra.css`; menú del admin azul marino con logo blanco (`<Logo light />`).
- PWA: `useInstallPrompt`, `InstallButton`, `InstallCard`, `InstallHelp` en `src/components.jsx`; `beforeinstallprompt` se captura en `template.html` (window.__bip). Manifests generados por `tools/build.mjs` (no editar los JSON a mano).
- Corregido: Chart.js 4.4.4 en cdnjs daba 404 → ahora 4.4.1.
