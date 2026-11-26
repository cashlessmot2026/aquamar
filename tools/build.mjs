// Compila src/*.jsx + src/core.js en un único index.html (sin dependencias en el navegador salvo los CDN).
// Uso:  cd tools && npm install && node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, 'src', f), 'utf8').replace(/﻿/g, '');

const order = ['core.js', 'components.jsx', 'admin.jsx', 'employee.jsx', 'supervisor.jsx', 'app.jsx'];
const source = order.map(read).join('\n');
const { code } = transformSync(source, { loader: 'jsx', minify: true, target: 'es2019', legalComments: 'none' });

const css = read('styles.base.css') + '\n' + read('styles.extra.css');
const html = read('template.html')
  .replace('/*STYLES*/', () => css)
  .replace('/*APP*/', () => code.replace(/<\/script/gi, '<\\/script'));

writeFileSync(join(root, 'index.html'), html, 'utf8');
console.log('index.html generado:', (html.length / 1024).toFixed(1), 'KB');

// ---------- Manifests PWA (una app instalable por interfaz) ----------
const BRAND = { name: 'AQUAMARE', theme: '#ffffff', background: '#ffffff' };
const ICONS = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
];
const APPS = {
  'manifest.json': { id: './index.html', start: './index.html', name: 'AQUAMARE · Housekeeping', short: 'Aquamare',
    desc: 'Aquamare Hotel: control de limpieza, verificación e inventario de habitaciones.', orientation: 'any',
    shortcuts: [
      { name: 'Personal de aseo', url: './index.html?app=aseo' },
      { name: 'Supervisor', url: './index.html?app=supervisor' },
      { name: 'Recepción / Admin', url: './index.html?app=admin' }
    ] },
  'manifest-aseo.json': { id: './index.html?app=aseo', start: './index.html?app=aseo', name: 'AQUAMARE · Personal de aseo', short: 'Aquamare Aseo',
    desc: 'Inicio de limpieza por QR/NFC e inventario de la habitación.', orientation: 'portrait' },
  'manifest-supervisor.json': { id: './index.html?app=supervisor', start: './index.html?app=supervisor', name: 'AQUAMARE · Supervisor', short: 'Aquamare Supervisor',
    desc: 'Verificación de habitaciones y asignación de servicios.', orientation: 'portrait' },
  'manifest-admin.json': { id: './index.html?app=admin', start: './index.html?app=admin', name: 'AQUAMARE · Recepción', short: 'Aquamare Recepción',
    desc: 'Dashboard de recepción: habitaciones, personal, inventario y reportes.', orientation: 'any' }
};
for (const [file, a] of Object.entries(APPS)) {
  const manifest = {
    id: a.id, name: a.name, short_name: a.short, description: a.desc,
    start_url: a.start, scope: './', display: 'standalone', display_override: ['standalone', 'minimal-ui'],
    orientation: a.orientation, background_color: BRAND.background, theme_color: BRAND.theme,
    lang: 'es', dir: 'ltr', categories: ['business', 'productivity'], prefer_related_applications: false, icons: ICONS
  };
  if (a.shortcuts) manifest.shortcuts = a.shortcuts.map(s => ({ ...s, icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] }));
  writeFileSync(join(root, file), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
console.log('manifests generados:', Object.keys(APPS).join(', '));
