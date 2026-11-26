/* ==================== COLABORADOR (aseo) ==================== */
/* Código de habitación recibido por enlace (QR leído con la cámara del celular o TAG NFC en iPhone). */
function takeRoomParam() {
  const p = new URLSearchParams(location.search), code = p.get('r') || p.get('room');
  if (!code) return null;
  p.delete('r'); p.delete('room');
  history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash);
  return code;
}
function EmployeeApp({ session, onLogout }) {
  const emp = empById(session.employeeId) || DB.employees[0];
  useEffect(() => { const code = takeRoomParam(); if (code && emp) setTimeout(() => handleRoomCode(code, emp), 300); }, []);
  if (!emp) return <div className="emp-wrap card" style={{ margin: 20 }}>No hay colaboradores registrados. <button className="btn btn-sm" onClick={onLogout}>Salir</button></div>;
  const active = findActiveSessionByEmployee(emp.id);
  const push = usePushRegistration(session);
  const canClean = cleaningRoleOn(emp);
  const busy = isEmployeeBusy(emp.id);
  const mine = DB.rooms.filter(r => r.status === 'PENDIENTE DE LIMPIEZA' && r.assignedTo === emp.id);
  const open = DB.rooms.filter(r => r.status === 'PENDIENTE DE LIMPIEZA' && !r.assignedTo).sort((a, b) => a.number - b.number);
  const myHistory = DB.cleaningSessions.filter(s => s.employeeId === emp.id && s.status === 'FINALIZADA').sort((a, b) => new Date(b.endTime) - new Date(a.endTime)).slice(0, 6);
  const waiting = []; const seen = {};
  myHistory.forEach(s => { const r = roomById(s.roomId); if (r && r.status === 'EN VERIFICACIÓN' && !seen[r.id]) { seen[r.id] = 1; waiting.push(r); } });
  return (
    <div id="employeeScreen">
      <div className="emp-head">
        <Logo small sub="HOUSEKEEPING" />
        <div className="tag-row"><InstallButton label="Instalar" /><button className="btn btn-sm" onClick={onLogout}>Salir</button></div>
      </div>
      <div className="emp-hello">Hola, {emp.name.split(' ')[0]} 👋</div>
      <div className="emp-shift">Turno activo: {emp.shift}</div>
      {active ? <ActiveCard session={active} /> : (
        <div className="card status-card">
          <div className="scan-empty"><div className="ic">🧹</div>Escanee el QR o acerque el teléfono al NFC de la habitación para comenzar.</div>
          <div className="scan-btns">
            <button className="btn btn-primary" onClick={() => openModal(<ScanModal mode="qr" emp={emp} />)}>📷 Escanear QR</button>
            <button className="btn" onClick={() => openModal(NFC.available() ? <ScanModal mode="nfc" emp={emp} /> : <NfcHelp />)}>📶 Leer NFC</button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => openModal(<ManualEntry emp={emp} />)}>⌨️ Ingresar código manualmente</button>
        </div>
      )}
      {canClean && <PushBanner {...push} text="Activa las notificaciones para enterarte cuando haya habitaciones por limpiar, incluso con la app cerrada." />}
      {mine.length > 0 && (
        <div className="banner banner-warn">📌 Servicio asignado a ti: {mine.map(r => <Badge key={r.id} cls="b-yellow">Hab. {r.number}</Badge>)} · Escanea el QR de la habitación para iniciar.</div>
      )}
      {canClean && !active && open.length > 0 && (
        <>
          <div className="section-title" style={{ fontSize: 14 }}>🧹 Servicios disponibles</div>
          {busy && <div className="small muted" style={{ marginBottom: 8 }}>Ya tienes un servicio en curso: termínalo para tomar otro.</div>}
          <div className="card" style={{ marginBottom: 14 }}>
            {open.map(r => (
              <div className="emp-history-item" key={r.id} style={{ alignItems: 'center' }}>
                <span><b>Hab. {r.number}</b> · Piso {r.floor} · {r.estimatedMinutes} min</span>
                <button className="btn btn-sm btn-primary" disabled={busy}
                  onClick={async () => { const ok = await claimRoom(r.id, emp.id, false); if (ok) toast('Servicio tomado: habitación ' + r.number + '. Escanea su QR para iniciar.', 'ok'); }}>Tomar servicio</button>
              </div>
            ))}
          </div>
        </>
      )}
      {waiting.length > 0 && (
        <div className="banner banner-info">🔎 En verificación del supervisor: {waiting.map(r => <Badge key={r.id} cls="b-yellow">Hab. {r.number}</Badge>)}</div>
      )}
      <div className="section-title" style={{ fontSize: 14 }}>📋 Mi historial reciente</div>
      <div className="card">
        {myHistory.length ? myHistory.map(s => {
          const r = roomById(s.roomId), ts = timeStatus(s.diffSeconds, DB.settings);
          return <div className="emp-history-item" key={s.id}><span>Hab. {r ? r.number : '-'} · {fmtDate(s.endTime)}</span><Badge cls={ts.cls}>{ts.dot} {Timer.format(s.durationSeconds)}</Badge></div>;
        }) : <div className="muted small">Aún no has finalizado limpiezas.</div>}
      </div>
    </div>
  );
}

function ActiveCard({ session }) {
  useTick(1000);
  const room = roomById(session.roomId);
  const elapsed = Timer.elapsedSeconds(session.startTime);
  const pct = Math.min(100, Math.round(elapsed / (session.estimatedMinutes * 60) * 100));
  const rejection = DB.incidents.filter(i => i.roomId === session.roomId && i.type === 'RECHAZO VERIFICACIÓN' && new Date(i.timestamp).getTime() >= new Date(session.startTime).getTime() - 5000)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
  const [busy, setBusy] = useState(false);
  return (
    <>
      {rejection && <div className="banner banner-err">↩️ El supervisor devolvió esta habitación: <b>{rejection.description}</b></div>}
      <div className="card status-card glow">
        <div className="status-room">Habitación<b>{room ? room.number : '-'}</b></div>
        <Badge cls="b-violet">🟣 LIMPIANDO</Badge>
        <div className="timer-display">{Timer.format(elapsed)}</div>
        <div className="timer-sub">Tiempo estimado: {Timer.format(session.estimatedMinutes * 60)}</div>
        <div className="progress-outer"><div className="progress-inner" style={{ width: pct + '%' }}></div></div>
        <div className="small muted">{pct >= 100 ? <Badge cls="b-red">⏰ TIEMPO SUPERADO</Badge> : pct + '% del tiempo estimado utilizado'}</div>
        <div className="emp-actions">
          <button className="btn" onClick={() => openModal(<IncidentForm sessionId={session.id} />)}>⚠️ Reportar novedad</button>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={async () => {
            // Con artículos de inventario configurados, primero se hace el checklist de la habitación.
            if (room && inventoryForRoom(room).length) { openModal(<InventoryChecklist sessionId={session.id} />, true); return; }
            setBusy(true); await finishCleaning(session.id); setBusy(false);
          }}>✅ FINALIZAR LIMPIEZA</button>
        </div>
      </div>
    </>
  );
}

function ScanModal({ mode, emp }) {
  return mode === 'qr' ? <QrScan emp={emp} /> : <NfcScan emp={emp} />;
}
/* Escáner QR con estados visibles: así se sabe si falta el permiso, si la cámara está ocupada, etc. */
function QrScan({ emp }) {
  const videoRef = useRef(null);
  const [state, setState] = useState('starting');   // starting | running | denied | nocamera | busy | insecure | unsupported | error | manual
  const [slow, setSlow] = useState(false);
  useEffect(() => { if (state !== 'starting') { setSlow(false); return; } const t = setTimeout(() => setSlow(true), 8000); return () => clearTimeout(t); }, [state]);
  const start = async () => {
    setState('starting');
    const r = await QR.open(videoRef.current, v => handleRoomCode(v, emp));
    setState(r.ok ? 'running' : r.reason);
  };
  useEffect(() => { start(); return () => QR.close(); }, []);
  if (state === 'manual') return <><h2>Ingresar código</h2><CodeInput emp={emp} /></>;
  const failed = state !== 'starting' && state !== 'running';
  return (
    <>
      <h2>📷 Escanear QR</h2>
      <div className="qr-video-wrap" style={failed ? { display: 'none' } : null}>
        <video ref={videoRef} playsInline muted autoPlay></video><div className="qr-frame"></div>
      </div>
      {state === 'starting' && <div className="banner banner-info">📷 Abriendo la cámara… Si el celular pregunta, toca <b>Permitir</b>.
        {slow && <><br />¿No ves el aviso? Puede estar arriba, junto a la dirección, o se cerró sin contestar.
          <button className="btn btn-sm btn-primary" onClick={start}>🔄 Reintentar</button></>}</div>}
      {state === 'running' && <div className="small muted center">Apunta al QR de la habitación a unos 15–25 cm, con buena luz. · Lector: {QR.engine}</div>}
      {failed && <CameraHelp reason={state} onRetry={start} />}
      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { QR.close(); setState('manual'); }}>⌨️ Ingresar código manualmente</button>
    </>
  );
}
function CameraHelp({ reason, onRetry }) {
  const p = detectPlatform();
  const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|; wv\)/i.test(navigator.userAgent);
  let title = 'No se pudo abrir la cámara', steps = null, text = null;
  if (reason === 'denied') {
    title = '🔒 La cámara está bloqueada para Aquamare';
    steps = p.os === 'ios' ? [
      <>En Safari toca <span className="kbd">aA</span> en la barra de direcciones → <span className="kbd">Configuración del sitio web</span> → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>.</>,
      <>Si usas la app instalada: <span className="kbd">Ajustes</span> → <span className="kbd">Safari</span> → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>, y vuelve a abrir Aquamare.</>,
      <>Toca <b>Reintentar</b>.</>
    ] : p.os === 'android' ? [
      <>Toca el ícono <span className="kbd">🔒</span> (o <span className="kbd">ⓘ</span>) junto a la dirección → <span className="kbd">Permisos</span> → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>.</>,
      <>Si usas la app instalada: mantén presionado el ícono de Aquamare → <span className="kbd">ⓘ Información de la app</span> → <span className="kbd">Permisos</span> → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>.</>,
      <>Si sigue igual: <span className="kbd">Ajustes del celular</span> → <span className="kbd">Apps</span> → <span className="kbd">Chrome</span> → <span className="kbd">Permisos</span> → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>. Luego toca <b>Reintentar</b>.</>
    ] : [
      <>Haz clic en el ícono <span className="kbd">🔒</span> junto a la dirección → <span className="kbd">Cámara</span> → <span className="kbd">Permitir</span>.</>,
      <>Toca <b>Reintentar</b>.</>
    ];
  } else if (reason === 'busy') text = 'La cámara está siendo usada por otra app (cámara, WhatsApp, videollamada). Ciérrala y toca Reintentar.';
  else if (reason === 'nocamera') text = 'No se encontró una cámara en este dispositivo. Escribe el código de la habitación.';
  else if (reason === 'insecure') text = 'La cámara solo funciona en la dirección segura: https://cashlessmot2026.github.io/aquamar/';
  else if (reason === 'unsupported') text = 'Este navegador no permite usar la cámara aquí. Abre la app en Chrome (Android) o Safari (iPhone).';
  else text = 'Error de la cámara: ' + (QR.lastError || 'desconocido') + '. Toca Reintentar o escribe el código.';
  return (
    <div className="card" style={{ boxShadow: 'none', marginBottom: 4 }}>
      <b style={{ display: 'block', marginBottom: 8 }}>{title}</b>
      {inApp && <div className="banner banner-warn">Abriste el enlace dentro de otra app (WhatsApp, Instagram…). Esos navegadores bloquean la cámara: toca <b>⋮ → Abrir en Chrome</b> o <b>Abrir en Safari</b>.</div>}
      {steps ? <ol className="install-steps">{steps.map((x, i) => <li key={i}><span>{x}</span></li>)}</ol> : <p className="small" style={{ marginBottom: 10 }}>{text}</p>}
      {reason !== 'nocamera' && reason !== 'insecure' && <button className="btn btn-primary" style={{ width: '100%' }} onClick={onRetry}>🔄 Reintentar</button>}
    </div>
  );
}
/* Lector NFC (Chrome en Android). */
function NfcScan({ emp }) {
  const [state, setState] = useState('starting'), [manual, setManual] = useState(false);
  useEffect(() => {
    NFC.read(v => { if (v) handleRoomCode(v, emp); else toast('El TAG no tiene un código de habitación.', 'err'); })
      .then(ok => setState(ok ? 'running' : 'failed'));
    return () => NFC.stop();
  }, []);
  if (manual || state === 'failed') return <><h2>Ingresar código</h2>{state === 'failed' && <p className="small muted" style={{ marginBottom: 10 }}>No se pudo activar el NFC. Revisa que el NFC del celular esté encendido (Ajustes → Conexiones → NFC) y que el sitio tenga permiso, o escribe el código.</p>}<CodeInput emp={emp} /></>;
  return (
    <>
      <h2>📶 Leer NFC</h2>
      <div className="scan-empty"><div className="ic">📶</div>{state === 'running' ? 'Acerca la parte trasera del celular al TAG de la habitación y mantenlo quieto un segundo…' : 'Activando NFC… si el celular pregunta, toca Permitir.'}</div>
      <button className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => { NFC.stop(); setManual(true); }}>⌨️ Ingresar código manualmente</button>
    </>
  );
}
function CodeInput({ emp }) {
  const [code, setCode] = useState('');
  return (
    <>
      <Field label="Código (ej. ROOM-305)"><input value={code} onChange={e => setCode(e.target.value)} placeholder="ROOM-305" autoFocus /></Field>
      <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => handleRoomCode(code, emp)}>Buscar</button>
    </>
  );
}
const ManualEntry = ({ emp }) => <><h2>Ingresar código de habitación</h2><CodeInput emp={emp} /></>;
/* Sin Web NFC (iPhone, PC, Firefox): el iPhone lee el TAG por su cuenta y abre el enlace grabado. */
function NfcHelp() {
  const p = detectPlatform();
  return (
    <>
      <h2>📶 Leer NFC</h2>
      {p.os === 'ios' ? <ol className="install-steps">
        <li><span>Bloquea y desbloquea el iPhone (o deja la pantalla encendida) <b>sin abrir ninguna app</b>.</span></li>
        <li><span>Acerca la parte superior del iPhone al TAG de la habitación.</span></li>
        <li><span>Toca el aviso <span className="kbd">Abrir en Safari / Aquamare</span> que aparece arriba: se abre la habitación para iniciar la limpieza.</span></li>
      </ol> : <p className="small" style={{ marginBottom: 12 }}>Este navegador no puede leer NFC. Usa <b>Chrome en Android</b> o escanea el QR de la habitación.</p>}
      <div className="banner banner-info" style={{ marginBottom: 0 }}>Si no funciona, usa el botón <b>📷 Escanear QR</b>: hace lo mismo.</div>
    </>
  );
}

function handleRoomCode(code, emp) {
  if (!code || !String(code).trim()) { toast('Código vacío', 'err'); return; }
  const room = findRoomByCode(code);
  if (!room) { closeModal(); toast('Habitación no encontrada para el código: ' + parseRoomCode(code), 'err'); return; }
  const mine = findActiveSessionByEmployee(emp.id);
  if (mine) {
    openModal(<><h2>Limpieza activa</h2><p>Ya tienes una limpieza activa en la habitación {roomById(mine.roomId)?.number || '-'}. Finaliza esa limpieza antes de iniciar otra.</p>
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={closeModal}>Entendido</button></>);
    return;
  }
  const busy = findActiveSessionByRoom(room.id);
  if (busy) {
    openModal(<><h2>🔴 Habitación en limpieza</h2>
      <div className="kv"><b>Colaborador</b><span>{empById(busy.employeeId)?.name || '-'}</span></div>
      <div className="kv"><b>Inicio</b><span>{fmtTime(busy.startTime)}</span></div>
      <p className="small muted" style={{ marginTop: 10 }}>Esta habitación ya está siendo limpiada por otra persona.</p></>);
    return;
  }
  if (room.status === 'OCUPADA') {
    openModal(<><h2>🛎️ Habitación ocupada</h2><p className="small muted">La habitación {room.number} tiene un huésped. Podrá limpiarse cuando se registre la salida.</p></>);
    return;
  }
  if (room.assignedTo && room.assignedTo !== emp.id) {
    openModal(<><h2>📌 Servicio de otro colaborador</h2><p className="small muted">La habitación {room.number} está asignada a {empById(room.assignedTo)?.name || 'otro colaborador'}.</p></>);
    return;
  }
  // Un servicio a la vez: con otra habitación tomada o asignada (sin terminar) no se puede iniciar esta.
  const other = DB.rooms.find(r => r.id !== room.id && r.assignedTo === emp.id && r.status === 'PENDIENTE DE LIMPIEZA');
  if (other) {
    openModal(<><h2>📌 Ya tienes un servicio</h2><p className="small muted">Tienes tomada la habitación <b>{other.number}</b>. Escanea su QR e inicia esa limpieza; cuando la termines podrás tomar otra.</p>
      <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={closeModal}>Entendido</button></>);
    return;
  }
  if (room.status === 'EN VERIFICACIÓN') {
    openModal(<><h2>🔎 En verificación</h2><p className="small muted">La habitación {room.number} está esperando la verificación del supervisor.</p></>);
    return;
  }
  openModal(<><h2>Habitación encontrada</h2>
    <div className="kv"><b>Habitación</b><span>{room.number}</span></div>
    <div className="kv"><b>Piso</b><span>{room.floor}</span></div>
    <div className="kv"><b>Tipo</b><span>{room.category}</span></div>
    <div className="kv"><b>Tiempo estimado</b><span>{room.estimatedMinutes} minutos</span></div>
    <button className="btn btn-primary btn-lg" style={{ marginTop: 16 }} onClick={() => startCleaning(room.id, emp)}>INICIAR LIMPIEZA</button></>);
}

async function startCleaning(roomId, emp) {
  const sess = Auth.current(), room = roomById(roomId);
  closeModal();
  toast('Obteniendo ubicación GPS...', 'warn');
  const gps = await GPS.capture();
  if (!gps && DB.settings.gpsRequired) toast('⚠️ No fue posible obtener la ubicación.', 'warn');
  const session = { id: generateId('SES'), roomId, employeeId: emp.id, startTime: new Date().toISOString(), endTime: null,
    estimatedMinutes: room.estimatedMinutes, gpsStart: gps, gpsEnd: null, status: 'EN_LIMPIEZA', durationSeconds: 0, diffSeconds: 0 };
  DB.cleaningSessions.push(session);
  room.status = 'EN LIMPIEZA'; room.assignedTo = emp.id;
  logHistory(sess.username, 'INICIO LIMPIEZA', `Habitación ${room.number} · ${emp.name}`);
  Cloud.upsert('cleaning_sessions', session);
  commit('rooms', room);
  toast(gps ? '📍 Ubicación capturada' : 'Limpieza iniciada', 'ok');
}

/* Al terminar, la habitación NO queda limpia: pasa a EN VERIFICACIÓN (dispara la push a los VL). */
async function finishCleaning(sessionId) {
  const session = DB.cleaningSessions.find(s => s.id === sessionId), room = roomById(session.roomId);
  toast('Finalizando y capturando ubicación...', 'warn');
  const gps = await GPS.capture();
  const end = new Date();
  const durationSeconds = Math.round((end - new Date(session.startTime)) / 1000);
  const diffSeconds = durationSeconds - session.estimatedMinutes * 60;
  Object.assign(session, { endTime: end.toISOString(), gpsEnd: gps, durationSeconds, diffSeconds, status: 'FINALIZADA' });
  room.status = 'EN VERIFICACIÓN';
  logHistory(Auth.current().username, 'FIN LIMPIEZA', `Habitación ${room.number} · Duración ${Timer.format(durationSeconds)} · en verificación`);
  await Cloud.upsert('cleaning_sessions', session);
  commit('rooms', room);
  const ts = timeStatus(diffSeconds, DB.settings);
  toast(`Limpieza finalizada ${ts.dot} · enviada a verificación`, diffSeconds > DB.settings.redLimit * 60 ? 'err' : 'ok');
}

/* Checklist de inventario al finalizar: cuenta cada artículo; lo que no cuadre se avisa al administrador. */
function InventoryChecklist({ sessionId }) {
  const session = DB.cleaningSessions.find(s => s.id === sessionId), room = roomById(session.roomId);
  const items = inventoryForRoom(room);
  const [counts, setCounts] = useState({}), [checked, setChecked] = useState({}), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false);
  const qty = i => counts[i.id] !== undefined ? counts[i.id] : i.expectedQty;
  const setQty = (i, v) => { setCounts(c => ({ ...c, [i.id]: Math.max(0, v) })); setChecked(c => ({ ...c, [i.id]: true })); };
  const pending = items.filter(i => !checked[i.id]).length;
  const diffs = items.filter(i => checked[i.id] && qty(i) !== i.expectedQty).length;
  const allOk = () => { const c = {}; items.forEach(i => { c[i.id] = true; }); setChecked(c); setCounts({}); };
  const submit = async () => {
    if (pending) { toast('Revisa los ' + pending + ' artículo(s) que faltan', 'err'); return; }
    if (diffs && !notes.trim() && !confirm('Hay ' + diffs + ' diferencia(s) en el inventario. ¿Enviar sin observaciones?')) return;
    setBusy(true);
    const c = {}; items.forEach(i => { c[i.id] = qty(i); });
    const check = buildInventoryCheck(room, c, session, notes);
    await saveInventoryCheck(check);
    closeModal();
    await finishCleaning(session.id);
    if (check.differences || check.changes) toast('📦 Inventario con novedades: se avisó al administrador', 'warn');
  };
  let lastCat = null;
  return (
    <>
      <h2>📦 Inventario · Hab. {room.number}</h2>
      <p className="small muted" style={{ marginBottom: 10 }}>Antes de finalizar, confirma lo que hay en la habitación. Marca ✓ si está completo o ajusta la cantidad encontrada.</p>
      <div className="flex-between" style={{ marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <span className="small">{items.length - pending}/{items.length} revisados{diffs ? <> · <Badge cls="b-red">{diffs} diferencia(s)</Badge></> : null}</span>
        <button className="btn btn-sm" onClick={allOk}>✓ Todo completo</button>
      </div>
      <div className="inv-list">
        {items.map(i => {
          const q = qty(i), done = !!checked[i.id], bad = done && q !== i.expectedQty;
          const head = i.category !== lastCat ? (lastCat = i.category) : null;
          return (
            <React.Fragment key={i.id}>
              {head && <div className="inv-cat">{head}</div>}
              <div className={'inv-row' + (done ? (bad ? ' bad' : ' good') : '')}>
                <div className="inv-name"><b>{i.name}</b><span className="small muted">Debe haber {i.expectedQty}</span></div>
                <div className="inv-ctrl">
                  <button className="btn btn-sm" onClick={() => setQty(i, q - 1)} aria-label="Menos">−</button>
                  <span className="inv-qty">{q}</span>
                  <button className="btn btn-sm" onClick={() => setQty(i, q + 1)} aria-label="Más">+</button>
                  <button className={'btn btn-sm' + (done && !bad ? ' btn-ok' : '')} onClick={() => setQty(i, i.expectedQty)} aria-label="Completo">✓</button>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <Field label={diffs ? 'Observaciones (¿qué falta o qué pasó?)' : 'Observaciones (opcional)'}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej.: el huésped consumió 2 aguas; plancha no enciende..." />
      </Field>
      <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={busy} onClick={submit}>{busy ? 'Guardando...' : '✅ Guardar inventario y finalizar'}</button>
    </>
  );
}

function IncidentForm({ sessionId }) {
  const session = DB.cleaningSessions.find(s => s.id === sessionId), room = roomById(session.roomId);
  const types = ['Daño', 'Mantenimiento', 'Objeto olvidado', 'Suciedad especial', 'Falta de elemento', 'Problema de baño', 'Problema eléctrico', 'Problema de aire acondicionado', 'Otro'];
  const [type, setType] = useState(types[0]), [desc, setDesc] = useState(''), [photo, setPhoto] = useState(null), [busy, setBusy] = useState(false);
  const save = async () => {
    if (DB.settings.photoRequired && !photo) { toast('La fotografía es obligatoria para reportar una novedad', 'err'); return; }
    setBusy(true);
    const gps = await GPS.capture();
    const inc = { id: generateId('INC'), sessionId, roomId: session.roomId, employeeId: session.employeeId, type, description: desc,
      photo: photo ? await readFileAsDataURL(photo) : null, gps, timestamp: new Date().toISOString() };
    DB.incidents.push(inc);
    logHistory(Auth.current().username, 'NOVEDAD', 'Tipo: ' + type + ' · Hab. ' + room.number);
    commit('incidents', inc); closeModal(); toast('Novedad registrada', 'ok');
  };
  return (
    <>
      <h2>Reportar novedad · Hab. {room.number}</h2>
      <Field label="Tipo de novedad"><select value={type} onChange={e => setType(e.target.value)}>{types.map(t => <option key={t}>{t}</option>)}</select></Field>
      <Field label="Descripción"><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describa la novedad..." /></Field>
      <Field label="Fotografía"><PhotoInput onChange={setPhoto} capture="environment" /></Field>
      <button className="btn btn-primary btn-lg" disabled={busy} onClick={save}>Guardar novedad</button>
    </>
  );
}
