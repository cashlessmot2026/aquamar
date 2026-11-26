const { useState, useEffect, useRef, useCallback } = React;

/* ---------- hooks ---------- */
function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set(n => n + 1), ms); return () => clearInterval(t); }, [ms]);
}
/* Lógica pura del acceso oculto: 5 toques seguidos, máx. 2 s entre toque y toque. */
function tapStep(state, now, windowMs, taps) {
  const count = state.last && now - state.last <= windowMs ? state.count + 1 : 1;
  return { count: count >= taps ? 0 : count, last: now, revealed: count >= taps };
}
function useSecretTap(onReveal, taps = 5, windowMs = 2000) {
  const st = useRef({ count: 0, last: 0 });
  return useCallback(() => {
    const r = tapStep(st.current, Date.now(), windowMs, taps);
    st.current = { count: r.count, last: r.last };
    if (r.revealed) onReveal();
  }, [onReveal, taps, windowMs]);
}

/* ---------- piezas visuales ---------- */
/* Logo de Aquamare Hotel: azul marino sobre fondos claros; `light` = blanco (sobre azul). `sub` = rótulo de la interfaz. */
const BRAND = { name: 'AQUAMARE', full: 'Aquamare Hotel', logo: 'icons/logo-aquamare-navy.png', logoLight: 'icons/logo-aquamare.png', icon: 'icons/icon-192.png' };
function Logo({ small, onClick, sub, light }) {
  return (
    <div className={'logo' + (small ? ' logo-sm' : '')}>
      <img className="logo-img" src={light ? BRAND.logoLight : BRAND.logo} alt={BRAND.full} onClick={onClick} draggable={false} />
      {sub && <span className="logo-sub">{sub}</span>}
    </div>
  );
}

/* ---------- PWA instalable: Android / PC (Chrome, Edge) con aviso nativo; iPhone/iPad y otros con instrucciones ---------- */
const APP_LABELS = { aseo: 'Aquamare Aseo', supervisor: 'Aquamare Supervisor', admin: 'Aquamare Recepción' };
const appLabel = () => APP_LABELS[APP_MODE] || 'Aquamare Housekeeping';
function detectPlatform() {
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return { os: 'ios', browser: /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'other' : 'safari' };
  if (/Android/i.test(ua)) return { os: 'android', browser: /SamsungBrowser/.test(ua) ? 'samsung' : /Firefox/.test(ua) ? 'firefox' : 'chrome' };
  const mac = /Macintosh/.test(ua);
  const browser = /Edg\//.test(ua) ? 'edge' : /Firefox/.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
  return { os: mac ? 'mac' : 'desktop', browser };
}
const isStandalone = () => (window.matchMedia && (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: minimal-ui)').matches || matchMedia('(display-mode: window-controls-overlay)').matches)) || navigator.standalone === true;

/* El evento beforeinstallprompt se captura en template.html (antes de que cargue React) y queda en window.__bip. */
function useInstallPrompt() {
  const [evt, setEvt] = useState(() => window.__bip || null);
  const [installed, setInstalled] = useState(isStandalone);
  useEffect(() => {
    const onReady = () => setEvt(window.__bip || null);
    const onInstalled = () => { window.__bip = null; setEvt(null); setInstalled(true); toast('✅ ' + appLabel() + ' quedó instalada en este dispositivo', 'ok'); };
    const mq = window.matchMedia ? matchMedia('(display-mode: standalone)') : null;
    const onMode = () => setInstalled(isStandalone());
    window.addEventListener('bip-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    if (mq && mq.addEventListener) mq.addEventListener('change', onMode);
    return () => {
      window.removeEventListener('bip-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
      if (mq && mq.removeEventListener) mq.removeEventListener('change', onMode);
    };
  }, []);
  const install = async () => {
    if (evt) {
      try { await evt.prompt(); const r = await evt.userChoice; if (r && r.outcome === 'accepted') { window.__bip = null; setEvt(null); } }
      catch (e) { openModal(<InstallHelp />); }
      return;
    }
    openModal(<InstallHelp />);
  };
  return { installed, native: !!evt, install };
}
function InstallHelp() {
  const p = detectPlatform(), name = appLabel();
  let title, steps, note = null;
  if (p.os === 'ios') {
    title = 'Instalar en iPhone / iPad';
    steps = [<>Toca el botón <span className="kbd">Compartir ⬆︎</span> en la barra del navegador.</>,
      <>Elige <span className="kbd">Agregar a pantalla de inicio</span> (desliza hacia abajo si no lo ves).</>,
      <>Confirma con <span className="kbd">Agregar</span>. Abre <b>{name}</b> desde el ícono nuevo.</>];
    note = p.browser === 'safari' ? 'Las notificaciones en iPhone solo funcionan con la app instalada (iOS 16.4 o superior).'
      : 'Si no aparece la opción, abre este mismo enlace en Safari. Las notificaciones requieren la app instalada (iOS 16.4+).';
  } else if (p.os === 'android') {
    title = 'Instalar en Android';
    steps = p.browser === 'samsung'
      ? [<>Toca el menú <span className="kbd">☰</span> de Samsung Internet.</>, <>Elige <span className="kbd">Agregar página a</span> → <span className="kbd">Pantalla de inicio</span>.</>]
      : [<>Toca el menú <span className="kbd">⋮</span> del navegador (arriba a la derecha).</>, <>Elige <span className="kbd">Instalar app</span> o <span className="kbd">Agregar a la pantalla principal</span>.</>, <>Confirma con <span className="kbd">Instalar</span>.</>];
    if (p.browser === 'firefox') note = 'En Firefox la instalación es limitada: para la mejor experiencia y notificaciones usa Chrome.';
  } else if (p.browser === 'safari' && p.os === 'mac') {
    title = 'Instalar en Mac';
    steps = [<>En la barra de menú elige <span className="kbd">Archivo</span>.</>, <>Pulsa <span className="kbd">Agregar al Dock…</span> y luego <span className="kbd">Agregar</span>.</>];
    note = 'Requiere Safari 17 (macOS Sonoma) o superior. También puedes usar Chrome o Edge.';
  } else if (p.browser === 'firefox') {
    title = 'Instalar en el computador';
    steps = [<>Firefox no permite instalar aplicaciones web.</>, <>Abre este enlace en <b>Chrome</b> o <b>Edge</b> y pulsa el ícono <span className="kbd">⊕ Instalar</span> de la barra de direcciones.</>];
  } else {
    title = 'Instalar en el computador';
    steps = [<>Pulsa el ícono <span className="kbd">⊕ Instalar</span> al final de la barra de direcciones.</>,
      <>O abre el menú <span className="kbd">⋮</span> → <span className="kbd">{p.browser === 'edge' ? 'Aplicaciones → Instalar este sitio como aplicación' : 'Transmitir, guardar y compartir → Instalar página como app'}</span>.</>,
      <>Confirma con <span className="kbd">Instalar</span>: {name} abrirá en su propia ventana.</>];
  }
  return (
    <>
      <h2>📲 {title}</h2>
      <ol className="install-steps">{steps.map((s, i) => <li key={i}><span>{s}</span></li>)}</ol>
      {note && <div className="banner banner-info" style={{ marginBottom: 0 }}>{note}</div>}
    </>
  );
}
/* Botón compacto para encabezados. */
function InstallButton({ className, label }) {
  const { installed, install } = useInstallPrompt();
  if (installed) return null;
  return <button className={'btn btn-sm ' + (className || '')} onClick={install}>⬇️ {label || 'Instalar app'}</button>;
}
/* Tarjeta para el login. */
function InstallCard() {
  const { installed, native, install } = useInstallPrompt();
  if (installed) return null;
  const p = detectPlatform();
  const where = p.os === 'ios' ? 'tu iPhone' : p.os === 'android' ? 'tu celular' : 'este computador';
  return (
    <div className="card install-card">
      <img src={BRAND.icon} alt="" />
      <div className="txt"><b>Instala {appLabel()}</b>Úsala como app en {where}: acceso directo, pantalla completa y notificaciones.</div>
      <button className="btn btn-sm btn-primary" onClick={install}>{native ? 'Instalar' : 'Cómo instalar'}</button>
    </div>
  );
}
const Badge = ({ cls, children }) => <span className={'badge ' + cls}>{children}</span>;
const StatusBadge = ({ status }) => <Badge cls={STATUS_BADGE[status] || 'b-gray'}>{status}</Badge>;
const Field = ({ label, children }) => <div className="field"><label>{label}</label>{children}</div>;
const Topbar = ({ title, sub, children }) => (
  <div className="topbar"><div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>{children}</div>
);
const Empty = ({ cols, children }) => <tr><td colSpan={cols} className="empty-state">{children}</td></tr>;

function Modal({ modal }) {
  if (!modal) return null;
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) closeModal(); }}>
      <div className={'modal' + (modal.wide ? ' wide' : '')}>
        <button className="modal-close" onClick={closeModal}>✕</button>
        {modal.node}
      </div>
    </div>
  );
}
function Toaster() {
  const [list, setList] = useState([]);
  useEffect(() => {
    const fn = t => { setList(l => [...l, t]); setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), 3600); };
    _toastListeners.push(fn);
    return () => { _toastListeners = _toastListeners.filter(f => f !== fn); };
  }, []);
  return <div id="toastWrap">{list.map(t => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}</div>;
}

/* ---------- Chart.js, Leaflet y QR como componentes ---------- */
function ChartCanvas({ type, data, options }) {
  const ref = useRef(null);
  const key = JSON.stringify([type, data, options]);
  useEffect(() => {
    if (!ref.current || !window.Chart) return;
    Chart.defaults.color = '#5b6680'; Chart.defaults.borderColor = 'rgba(11,18,32,.08)';
    const c = new Chart(ref.current, { type, data, options });
    return () => c.destroy();
  }, [key]);
  return <canvas ref={ref}></canvas>;
}
function MapBox({ height, setup }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.L) return;
    const map = L.map(ref.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    setup(map);
    return () => map.remove();
  }, []);
  return <div ref={ref} style={{ height, borderRadius: 12, overflow: 'hidden' }}></div>;
}
/* Vista previa del QR en SVG: nítida en cualquier pantalla (también en celulares de alta densidad). */
function QrCanvas({ text, size = 200 }) {
  const svg = text ? QR.svg(text) : '';
  return (
    <div className="qr-canvas-box" style={{ width: size + 30 }}>
      {svg ? <div className="qr-svg" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="qr-svg qr-empty" style={{ width: size, height: size }}>Sin código</div>}
    </div>
  );
}

/* ---------- foto: input + vista previa ---------- */
function PhotoInput({ onChange, capture }) {
  const [src, setSrc] = useState(null);
  return (
    <>
      <input type="file" accept="image/*" capture={capture}
        onChange={async e => { const f = e.target.files[0]; if (!f) { onChange(null); setSrc(null); return; } onChange(f); setSrc(await readFileAsDataURL(f)); }} />
      {src && <img className="photo-preview" src={src} alt="" />}
    </>
  );
}
