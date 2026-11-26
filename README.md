# AQUAMARE · Housekeeping

App web instalable (PWA) de control de limpieza para Aquamare Hotel: habitaciones, check-in/out,
servicios de limpieza, verificación del supervisor, inventario de habitación, QR/NFC y notificaciones push.

Sitio: https://cashlessmot2026.github.io/aquamar/ · Aseo `?app=aseo` · Supervisor `?app=supervisor` · Recepción `?app=admin`

## Estructura
- `src/` código fuente (React por CDN). **`index.html` y los `manifest*.json` se GENERAN**: no editarlos a mano.
- `tools/build.mjs` compila: `cd tools && npm install && node build.mjs`
- `supabase/aquamar-setup.sql` instalación completa de la base · `supabase/functions/notify-verification` Edge Function de push
- `supabase/README-deploy.md` despliegue en Supabase (SQL, función, secret `FCM_SERVICE_ACCOUNT`)
- `docs/SESION-CONTINUACION.md` historial y estado del trabajo
- `backup/` versiones anteriores

## Publicar
```bash
cd tools && node build.mjs && cd ..
git add -A && git commit -m "describe el cambio" && git push
```
GitHub Pages publica la rama `main` en 1–2 minutos.

## Seguridad
- La carpeta `secrets/` (clave privada de Firebase) está en `.gitignore`: **nunca subirla**.
- La llave de Supabase en `src/core.js` es la *publicable* (pública por diseño).
