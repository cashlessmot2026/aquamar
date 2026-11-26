# React + Supervisor (VL) + Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar la app de limpieza a React (un solo `index.html`, sin build), agregar el rol Supervisor (VL) con verificación de habitaciones y push FCM con la app cerrada.

**Architecture:** React 18 por CDN sobre el modelo de datos Supabase existente; el flujo de limpieza termina en `EN VERIFICACIÓN`; un trigger SQL en `rooms` invoca una Edge Function de Supabase que envía la push por FCM HTTP v1 a los tokens con rol VL.

**Tech Stack:** React 18 + ReactDOM + Babel standalone (CDN), supabase-js 2, Firebase JS SDK (App + Messaging, compat) por CDN, Chart.js, Leaflet, jsQR, Supabase Edge Functions (Deno), PostgreSQL (`pg_net`), FCM HTTP v1.

**Spec:** `docs/superpowers/specs/2026-10-18-react-supervisor-push-design.md`

## Global Constraints

- Sin paso de build: se publica `index.html`, `manifest.json`, `sw.js`, `firebase-messaging-sw.js` e `icons/` en la raíz del repo `cashlesscolombia-blip/limpieza` (GitHub Pages).
- Supabase: `https://redljbblmveabflxeddv.supabase.co` (ya configurado en `index.html:283-284`).
- Firebase: projectId `house-53644`, messagingSenderId `144124364159`, appId `1:144124364159:web:e9b662d0bb45b7f79d864a`, apiKey `AIzaSyA6m1FFeRtDhqgzwASpHSZinLVF897za3s`, authDomain `house-53644.firebaseapp.com`.
- VAPID: `BHfCJCdxVt12AC6Z7L85cQfCaS95KNC1i_7cTHerFxiA8CW-NR-DRCiyXGifcwvKy3omcG0Cw9rpmdHzJNjB0Zw`.
- Roles: `ADMIN`, `EMPLEADA`, `VL`. Estados de `rooms.status`: `DISPONIBLE`, `PENDIENTE DE LIMPIEZA`, `EN LIMPIEZA`, `LIMPIA`, `EN VERIFICACIÓN`, `FUERA DE SERVICIO`.
- La cuenta de servicio de Firebase nunca se escribe en el repo ni en el código: solo como secret `FCM_SERVICE_ACCOUNT` de Supabase.
- Botones con bordes redondeados (radio ≥ 12px). Textos de UI en español. `CACHE_VERSION` de `sw.js` = `v3`.
- Fuera de alcance: R2/fotos, RLS por rol, hash de contraseñas.
- La carpeta no es un repo git: los pasos de "commit" se sustituyen por guardar el archivo; el usuario sube los archivos a GitHub y corre el SQL en Supabase.

## Review Focus

- VL sin permiso de notificaciones o token no obtenido: el panel funciona igual, sin error visible.
- Token FCM inválido/expirado: la Edge Function lo borra de `push_tokens` y sigue con los demás.
- Dos VL conectados aprueban/rechazan la misma habitación a la vez: la segunda acción no debe pisar un estado ya resuelto.
- Habitación rechazada: la sesión de limpieza vuelve a estar activa y el colaborador la ve de nuevo en su lista.
- Toques en el logo que no llegan a 5 seguidos (o con pausa > 2 s) no revelan el acceso de supervisor.

---

### Task 1: Migración SQL (rol VL, estado, push_tokens, trigger)

**Files:**
- Create: `supabase/migration-2026-10-18.sql`
- Modify: `schema.sql` (role check línea 104, status check línea 88, tabla `push_tokens`, comentarios)

**Interfaces:**
- Produces: tabla `public.push_tokens(token text primary key, username text not null, role text not null, updated_at timestamptz default now())`; función `public.notify_room_verification()` y trigger `trg_room_verification` en `rooms` que hace `net.http_post` a `https://redljbblmveabflxeddv.supabase.co/functions/v1/notify-verification` con body `{"room_id": text, "number": text}`.

- [ ] **Step 1: Escribir las sentencias de verificación** que fallan antes de migrar (guardadas como comentario al final del archivo): `insert into users(username,password,role) values('t','t','VL')` debe fallar antes y pasar después; `update rooms set status='EN VERIFICACIÓN'` igual.
- [ ] **Step 2: Migrar**: reemplazar los `check` de `users.role` (agregar `'VL'`) y `rooms.status` (cambiar `INSPECCIÓN` por `EN VERIFICACIÓN`, convirtiendo filas existentes con `update rooms set status='EN VERIFICACIÓN' where status='INSPECCIÓN'` antes de recrear el constraint); crear `push_tokens` con la política `anon_full_access` como las demás tablas; habilitar `pg_net`.
- [ ] **Step 3: Trigger** `AFTER UPDATE OF status ON rooms FOR EACH ROW WHEN (new.status='EN VERIFICACIÓN' and old.status is distinct from new.status)` que llama a `net.http_post` con header `Authorization: Bearer <anon key del proyecto nuevo>`.
- [ ] **Step 4: Verificar en el SQL Editor de Supabase**: `select conname, pg_get_constraintdef(oid) from pg_constraint where conname like '%role%' or conname like '%status%'` muestra `VL` y `EN VERIFICACIÓN`; el insert de prueba de Step 1 pasa; `select count(*) from net._http_response` aumenta tras actualizar una habitación a `EN VERIFICACIÓN`. Expected: sin errores.
- [ ] **Step 5: Guardar** `schema.sql` actualizado para que una instalación nueva ya incluya todo.

### Task 2: Edge Function `notify-verification`

**Files:**
- Create: `supabase/functions/notify-verification/index.ts`
- Create: `supabase/README-deploy.md` (comandos exactos de despliegue y de secret)

**Interfaces:**
- Consumes: tabla `push_tokens` y el body `{room_id, number}` de Task 1.
- Produces: `Deno.serve(handler)` que responde `200 {sent:number, removed:number}`.

- [ ] **Step 1: Test de contrato (manual con curl)**: `curl -X POST <url>/functions/v1/notify-verification -H "Authorization: Bearer <anon>" -d '{"room_id":"x","number":"101"}'` con `push_tokens` vacía debe responder `{"sent":0,"removed":0}`.
- [ ] **Step 2: Implementar** `async function getAccessToken(sa: ServiceAccount): Promise<string>` (JWT RS256 con scope `https://www.googleapis.com/auth/firebase.messaging` firmado con `crypto.subtle`, intercambiado en `https://oauth2.googleapis.com/token`) y el `handler(req: Request): Promise<Response>`: lee tokens con `role='VL'` vía `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (inyectados), envía un mensaje por token a `https://fcm.googleapis.com/v1/projects/house-53644/messages:send` con `notification {title:"Habitación por verificar", body:"Habitación <number> lista para verificación"}` y `webpush.fcm_options.link` = `https://cashlesscolombia-blip.github.io/limpieza/?view=supervisor`; si FCM responde `UNREGISTERED`/`NOT_FOUND` borra ese token.
- [ ] **Step 3: Documentar el despliegue** en `supabase/README-deploy.md`: `supabase functions deploy notify-verification --no-verify-jwt` y `supabase secrets set FCM_SERVICE_ACCOUNT="$(cat <ruta al json>)"`.
- [ ] **Step 4: Verificar** con el curl de Step 1 (sin tokens → `{"sent":0,"removed":0}`) y, tras Task 7, con un token real (→ `sent:1`). Un token inventado debe quedar en `removed:1`.

### Task 3: Service worker de FCM y configuración Firebase

**Files:**
- Create: `firebase-messaging-sw.js` (raíz)
- Modify: `index.html` (bloque `CFG`, línea ~279: agregar `firebase:{...}` y `vapidKey`)

**Interfaces:**
- Produces: `CFG.firebase` (objeto firebaseConfig de Global Constraints) y `CFG.vapidKey`; `firebase-messaging-sw.js` que llama `messaging.onBackgroundMessage` y, en `notificationclick`, abre/enfoca `/limpieza/?view=supervisor`.

- [ ] **Step 1: Implementar** `firebase-messaging-sw.js` con `importScripts` del SDK compat de Firebase (misma versión mayor que `index.html`), `firebase.initializeApp(<config>)` y manejo de `notificationclick` que enfoca una ventana existente o abre una nueva.
- [ ] **Step 2: Agregar** `CFG.firebase` y `CFG.vapidKey` con los valores de Global Constraints.
- [ ] **Step 3: Verificar** (tras publicar): `https://cashlesscolombia-blip.github.io/limpieza/firebase-messaging-sw.js` responde 200 y en DevTools → Application → Service Workers aparece registrado. Expected: sin errores en consola.

### Task 4: Base React: capa de datos, Auth con VL y login oculto

**Files:**
- Modify: `index.html` (reescritura de `<head>`/`<body>`/`<script>`: CDN de React/ReactDOM/Babel/Firebase, estilos de botones redondeados, raíz `#root`)

**Interfaces:**
- Consumes: `Cloud` y mapeos `toRow/fromRow` existentes (se conservan sin cambios de lógica, líneas 307-435), `CFG`.
- Produces:
  - `useStore(): { DB, update(mutator: (DB)=>void, tables?: string[]): void, session, login(user, pass): Session|null, logout(): void }` (contexto React que envuelve `DB`, `saveData()` y `Cloud.upsert`).
  - `Auth.login(username, password): Session|null` ahora también acepta `role:'VL'` desde `DB.users`.
  - `<LoginScreen/>` con `useSecretTap(ref, {taps:5, windowMs:2000}): boolean` que revela el formulario de supervisor.
  - `<App/>` que enruta por `session.role` a `<AdminApp/>`, `<EmployeeApp/>` o `<SupervisorApp/>`.
  - Clase CSS `.btn` con `border-radius:14px`.

- [ ] **Step 1: Pruebas en consola del navegador** (cargar `index.html` con Claude in Chrome): `useSecretTap` simulado con 4 clics no revela el formulario; 5 clics en < 2 s sí; 5 clics con pausa de 3 s entre el 2.º y 3.º no. Debe fallar antes de implementar.
- [ ] **Step 2: Implementar** el contexto `useStore`, `LoginScreen`, `useSecretTap` y el enrutado por rol; mantener el login de admin (usuario) y colaborador (cédula/correo) sin cambios de comportamiento.
- [ ] **Step 3: Verificar**: login `admin/1234` entra a `AdminApp`; un usuario VL de prueba (creado en Task 5) entra a `SupervisorApp`; el formulario de supervisor no aparece sin los 5 toques.

### Task 5: Vistas de Admin en React + gestión de VL y nuevo estado

**Files:**
- Modify: `index.html` (portar `Admin`, `Charts`, `Reports` a componentes: `AdminApp`, `Dashboard`, `RoomsView`, `AssignmentsView`, `CleaningsView`, `TimesView`, `IncidentsView`, `ReportsView`, `SettingsView`, `AdminUsersView`)

**Interfaces:**
- Consumes: `useStore()` de Task 4.
- Produces: `STATUS_BADGE: Record<RoomStatus,string>` (incluye `EN VERIFICACIÓN`); `<AdminUsersView/>` permite elegir rol `ADMIN` o `VL` al crear un usuario.

- [ ] **Step 1: Prueba**: crear en la UI un usuario VL; `select role from users where username='<vl>'` en Supabase devuelve `VL`. Debe fallar antes de implementar.
- [ ] **Step 2: Portar** cada vista conservando filtros, tablas, QR/NFC, reportes CSV y gráficas (Chart.js en un `useEffect` por gráfica); reemplazar `INSPECCIÓN` por `EN VERIFICACIÓN` en filtros, formularios y badges; los totales del dashboard cuentan `EN VERIFICACIÓN` por separado.
- [ ] **Step 3: Verificar**: recepción ve una habitación como `DISPONIBLE` tras aprobarla (cubierto en Task 8); no quedan referencias a `INSPECCIÓN` (`Grep` sin resultados en `index.html`).

### Task 6: Vista del colaborador y paso a EN VERIFICACIÓN

**Files:**
- Modify: `index.html` (portar `Employee`: `EmployeeApp`, escáner QR/NFC, cronómetro, novedades, `finishCleaning`)

**Interfaces:**
- Consumes: `useStore().update`, `GPS.capture()`, `Timer`.
- Produces: `finishCleaning(sessionId: string): Promise<void>` que cierra la sesión (`FINALIZADA`) y deja `room.status = 'EN VERIFICACIÓN'` (antes `'LIMPIA'`, `index.html:1766`).

- [ ] **Step 1: Prueba** (con datos de prueba en Supabase): iniciar y finalizar una limpieza; `select status from rooms where id='<id>'` debe ser `EN VERIFICACIÓN`. Falla antes (queda `LIMPIA`).
- [ ] **Step 2: Implementar** el portado y el cambio de estado; el colaborador ve la habitación terminada como "En verificación" y no puede reiniciarla.
- [ ] **Step 3: Verificar** el resultado de Step 1 y que se registra el `history` `FIN LIMPIEZA`.

### Task 7: Panel del supervisor y registro de push

**Files:**
- Modify: `index.html` (`SupervisorApp`, `VerificationList`, `usePushRegistration`)

**Interfaces:**
- Consumes: `useStore()`, `CFG.firebase`, `CFG.vapidKey`, tabla `push_tokens` y `incidents`.
- Produces:
  - `usePushRegistration(session): { status: 'granted'|'denied'|'unsupported'|'pending' }` que pide permiso, obtiene el token (`messaging.getToken({vapidKey, serviceWorkerRegistration})`) y hace upsert en `push_tokens` `{token, username, role:'VL'}`.
  - `approveRoom(roomId: string): Promise<boolean>` y `rejectRoom(roomId: string): Promise<boolean>`: actualizan solo si el estado actual es `EN VERIFICACIÓN` (`update ... where id=? and status='EN VERIFICACIÓN'`) y devuelven `false` si otra persona ya resolvió.
  - `addVerificationNote(roomId: string, description: string): Promise<void>` inserta en `incidents` (`type:'NOVEDAD VERIFICACIÓN'`, `session_id` = última sesión `FINALIZADA` de la habitación).
- Reglas: aprobar → `DISPONIBLE`; rechazar → `EN LIMPIEZA` y la sesión vuelve a `EN_LIMPIEZA` (se borra `end_time`), con aviso visible al colaborador; la vista lee `?view=supervisor` y se refresca en vivo (Supabase Realtime sobre `rooms`, con respaldo de polling cada 15 s).

- [ ] **Step 1: Pruebas** (consola/SQL): con una habitación `EN VERIFICACIÓN`, `approveRoom` la deja `DISPONIBLE`; llamarlo dos veces seguidas devuelve `true` y luego `false` sin cambiar el estado; `rejectRoom` deja `EN LIMPIEZA` y su sesión `EN_LIMPIEZA`; `addVerificationNote` crea una fila en `incidents`. Fallan antes de implementar.
- [ ] **Step 2: Implementar** el panel (tarjetas con número, piso, colaborador, duración; botones Aprobar / Rechazar / Agregar novedad con bordes redondeados) y el hook de push; si el permiso es `denied` o el navegador no soporta push, mostrar un aviso discreto y no bloquear el panel.
- [ ] **Step 3: Verificar** los resultados de Step 1 y que tras el login de un VL aparece una fila en `push_tokens` con `role='VL'`.

### Task 8: PWA (sw.js v3, manifest, íconos) y verificación de punta a punta

**Files:**
- Modify: `sw.js` (`CACHE_VERSION = 'v3'`, cachear CDN de React/Firebase y `index.html`; excluir `firebase-messaging-sw.js` de la caché)
- Modify: `manifest.json` (revisar `icons` → solo `icons/*`)
- Delete: `icon-192.png`, `icon-512.png` de la raíz (versiones antiguas de 1,4 MB y 864 KB)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Ajustar** `sw.js` y `manifest.json` (sin referencias a los PNG de la raíz); borrar los PNG sobrantes de la raíz.
- [ ] **Step 2: Flujo completo** con datos de prueba: admin asigna habitación → colaborador limpia y finaliza → habitación `EN VERIFICACIÓN` → llega push al VL con la app cerrada → VL abre desde la notificación en el panel → aprueba → admin la ve `DISPONIBLE`; repetir rechazando y confirmar que vuelve al colaborador.
- [ ] **Step 3: Verificar PWA**: Lighthouse/Application muestra "instalable", manifest e íconos sin 404 en `https://cashlesscolombia-blip.github.io/limpieza/`.
- [ ] **Step 4: Entrega**: listar los archivos a subir al repo y los pasos manuales (correr `supabase/migration-2026-10-18.sql`, desplegar la función, cargar el secret).
