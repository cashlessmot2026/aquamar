# Resumen de desarrollo — CASHLESS COLOMBIA · Housekeeping Control

**Proyecto:** `index.html` (app de control de limpieza hotelera), `manifest.json`, `sw.js`, `schema.sql`
**Repositorio publicado:** https://cashlesscolombia-blip.github.io/limpieza/
**Fecha:** septiembre 2026

---

## 1. Habitaciones: TAG NFC y QR único de aseo

En la pestaña **Habitaciones**, dentro del formulario de "Nueva habitación / Editar habitación":

- Botón **"📶 Asignar TAG"** junto al campo Código NFC: usa la Web NFC API (`NDEFReader.write()`) para grabar el código en un tag físico. Solo funciona en **Chrome para Android** con hardware NFC; en escritorio muestra un aviso de que no es compatible.
- Sección de **código QR único** con vista previa en vivo (`ROOM-<número>`), botón **"🔄 Generar QR"** y **"🖨️ Imprimir QR"**. Ese código es el mismo que ya usa el panel de la colaboradora (`Employee.handleRoomCode`) para validar el aseo al escanear.

## 2. Progresive Web App (PWA) — instalación como aplicación

Archivos nuevos:
- **`manifest.json`** — nombre, colores, `display: standalone`, íconos.
- **`sw.js`** — service worker con caché del "app shell" (HTML, manifest, íconos, librerías CDN) para uso offline. Las llamadas a Supabase (`*.supabase.co`) nunca se cachean, siempre van en vivo a la red.
- **`icons/`** — `icon-192.png`, `icon-512.png`, versiones `maskable` (Android) y `apple-touch-icon.png` (iOS), generadas con Python/Pillow, degradado de marca + logo "CC".

Cambios en `index.html`: `<link rel="manifest">`, `apple-touch-icon`, `theme-color`, metaetiquetas `mobile-web-app-capable`, y registro del service worker (`navigator.serviceWorker.register('sw.js')`).

### Bug encontrado y corregido: no dejaba instalar la PWA
Al revisar el sitio publicado (`https://cashlesscolombia-blip.github.io/limpieza/`) se confirmó que `manifest.json`, `sw.js` e `index.html` sí se servían correctamente (200 OK), pero **la carpeta `icons/` completa devolvía error 404** — nunca se había subido al repositorio de GitHub. Sin íconos válidos, Chrome no considera la app instalable.

**Solución aplicada:** se regeneraron los 5 íconos con las dimensiones correctas (192×192, 512×512, etc. — antes algunos habían quedado con tamaños incorrectos: 2048×2048 y 1254×1254) y se subió la versión de caché del service worker (`cc-housekeeping-v1` → `v2`) para forzar la actualización limpia en los navegadores.

**Pendiente del usuario:** subir manualmente a GitHub (`Add file → Upload files`) la carpeta `icons/` completa (arrastrándola para conservar la ruta `icons/...`), junto con el `manifest.json` y `sw.js` actualizados. Después, recargar con `Ctrl+Shift+R` y volver a intentar instalar.

## 3. Eliminación de datos demo

- Se reemplazó `seedDemoData()` (generaba 10 empleadas, 80 habitaciones, 35 limpiezas y 2 usuarios falsos) por `initEmptyData()`, que solo crea la configuración base y el administrador principal.
- **Administrador inicial:** usuario `admin`, contraseña `1234`.
- El botón "Restablecer datos demo" en Configuración pasó a llamarse **"Borrar todos los datos"** — borra todo y deja únicamente el admin principal.
- Se quitó la función `placeholderPhoto` (ya no se usa) y el hint de credenciales demo en el login se actualizó.

## 4. Gestión de Administradores

Nueva pestaña **"🛡️ Administradores"** en el menú, con el mismo patrón CRUD que Colaboradores:
- Listado de administradores.
- **+ Nuevo administrador** (nombre, usuario, contraseña).
- **Editar**: permite cambiar nombre y, opcionalmente, la contraseña.
- **Eliminar**: bloqueado si es el único administrador o si es la cuenta con la que se inició sesión (evita quedar sin acceso).

## 5. Pestaña "Empleadas" → "Colaboradores" + login con cédula/correo

- Se renombraron todas las etiquetas visibles: menú lateral, dashboard, gráficas, asignaciones, limpiezas, tiempos, novedades, reportes CSV y configuración.
- En el formulario de colaborador se agregó la casilla **"Contraseña de acceso"** (al crear) / **"Nueva contraseña de acceso (dejar en blanco para no cambiarla)"** (al editar).
- **Login de colaboradores:** ahora pueden entrar con su **cédula (documento)** o **correo** + esa contraseña. `Auth.login()` primero revisa administradores (por usuario) y si no coincide, busca en colaboradores por documento o correo.
- Se agregó la columna `password` a la tabla `employees` en `schema.sql` (con `alter table ... add column if not exists` para no romper una base ya creada) y se actualizó la sincronización con Supabase (`Cloud.toRow`/`fromRow`).

> **Importante:** si el `schema.sql` ya se había ejecutado antes en Supabase, hay que volver a correrlo (o al menos la línea `alter table public.employees add column if not exists password text;`) para que la nueva columna exista en la base remota.

---

## Pendientes / próximos pasos sugeridos
- [ ] Subir `icons/`, `manifest.json` y `sw.js` actualizados a GitHub Pages.
- [ ] Verificar que `https://.../icons/icon-192.png` y `icon-512.png` respondan 200 (no 404).
- [ ] Volver a ejecutar `schema.sql` en Supabase si la tabla `employees` ya existía (por la columna `password`).
- [ ] Cambiar la contraseña del administrador principal (`admin` / `1234`) desde la pestaña "Administradores" una vez se ingrese por primera vez.
- [ ] Cargar los pisos, habitaciones y colaboradores reales (ya no hay datos de ejemplo precargados).
