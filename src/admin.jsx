/* ==================== ADMIN (recepción) ==================== */
const ADMIN_NAV = [
  ['dashboard', '📊', 'Dashboard'], ['rooms', '🛏️', 'Habitaciones'], ['services', '🧹', 'Servicios de limpieza'], ['floors', '🏢', 'Pisos'],
  ['employees', '🧑‍🔧', 'Colaboradores'], ['assignments', '📌', 'Asignaciones'], ['cleanings', '🧾', 'Limpiezas'],
  ['times', '⏱️', 'Tiempos'], ['incidents', '⚠️', 'Novedades'], ['inventory', '📦', 'Inventario'], ['photos', '📷', 'Fotografías'],
  ['map', '🗺️', 'Mapa GPS'], ['history', '🕓', 'Historial'], ['reports', '📤', 'Reportes'],
  ['admins', '🛡️', 'Usuarios (Admin / VL)'], ['settings', '⚙️', 'Configuración']
];
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const finishedSessions = () => DB.cleaningSessions.filter(s => s.status === 'FINALIZADA');

function AdminApp({ session, onLogout }) {
  const [route, setRoute] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const go = r => { setRoute(r); setOpen(false); window.scrollTo(0, 0); };
  // Salida automática: al vencer el check-out la habitación pasa a limpieza (y se avisa al aseo).
  useEffect(() => { autoCheckout(); const t = setInterval(autoCheckout, 30000); return () => clearInterval(t); }, []);
  const views = {
    dashboard: Dashboard, rooms: RoomsView, services: ServicesView, floors: FloorsView, employees: EmployeesView, assignments: AssignmentsView,
    cleanings: CleaningsView, times: TimesView, incidents: IncidentsView, inventory: InventoryView, photos: PhotosView, map: MapView,
    history: HistoryView, reports: ReportsView, admins: UsersView, settings: SettingsView
  };
  const View = views[route] || Dashboard;
  return (
    <div className="shell-row">
      <div className={'overlay-bg' + (open ? ' show' : '')} onClick={() => setOpen(false)}></div>
      <div className={'sidebar' + (open ? ' open' : '')}>
        <Logo light sub="RECEPCIÓN · ADMIN" />
        <div>
          {ADMIN_NAV.map(([key, ic, label]) => (
            <div key={key} className={'navitem' + (route === key ? ' active' : '')} onClick={() => go(key)}>
              <span className="ic">{ic}</span>{label}
            </div>
          ))}
        </div>
        <div className="sidebar-foot">
          <div className="userchip"><span>👤</span><span><b>{session.name}</b><span>Administrador</span></span></div>
          <InstallButton className="btn-primary" label="Instalar app" />
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} onClick={onLogout}>Cerrar sesión</button>
        </div>
      </div>
      <div className="main">
        <div className="mobile-topbar">
          <button className="btn btn-sm" onClick={() => setOpen(o => !o)}>☰ Menú</button>
          <Logo small />
          <InstallButton label="Instalar" />
        </div>
        <div className="view-enter" key={route}><View go={go} /></div>
      </div>
    </div>
  );
}

/* -------- DASHBOARD -------- */
function Dashboard({ go }) {
  useTick(30000);
  const rooms = DB.rooms;
  const count = st => rooms.filter(r => st.includes(r.status)).length;
  const todayStr = new Date().toDateString();
  const todaySessions = DB.cleaningSessions.filter(s => s.endTime && new Date(s.endTime).toDateString() === todayStr);
  const avgToday = avg(todaySessions.map(s => s.durationSeconds));
  const invAlerts = DB.inventoryChecks.filter(c => (c.differences || c.changes) && new Date(c.timestamp).toDateString() === todayStr).length;
  const late = DB.cleaningSessions.filter(s => s.status === 'EN_LIMPIEZA' && Timer.elapsedSeconds(s.startTime) / 60 > (roomById(s.roomId)?.estimatedMinutes || 30)).length;
  const cards = [
    ['Habitaciones totales', rooms.length], ['Disponibles', count(['DISPONIBLE'])], ['Ocupadas', count(['OCUPADA'])], ['Por limpiar', count(['PENDIENTE DE LIMPIEZA'])],
    ['En limpieza', count(['EN LIMPIEZA'])], ['En verificación', count(['EN VERIFICACIÓN'])], ['Limpias', count(['LIMPIA'])],
    ['Fuera de servicio', count(['FUERA DE SERVICIO'])],
    ['Colaboradores activos', DB.employees.filter(e => e.status === 'ACTIVA' || e.status === 'EN TURNO').length],
    ['Limpiezas hoy', todaySessions.length], ['Tiempo promedio hoy', avgToday ? Timer.format(avgToday) : '--:--:--']
  ];
  const days = []; for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
  const byDay = days.map(d => DB.cleaningSessions.filter(s => s.endTime && new Date(s.endTime).toDateString() === d.toDateString()).length);
  const roomAgg = {};
  finishedSessions().forEach(s => { (roomAgg[s.roomId] = roomAgg[s.roomId] || []).push(s.durationSeconds / 60); });
  const roomList = Object.entries(roomAgg).map(([id, a]) => ({ room: roomById(id), avg: avg(a) })).filter(x => x.room).sort((a, b) => b.avg - a.avg).slice(0, 8);
  const empList = DB.employees.map(e => ({ name: e.name.split(' ')[0], avg: avg(finishedSessions().filter(s => s.employeeId === e.id).map(s => s.durationSeconds / 60)) })).filter(x => x.avg > 0);
  const top6 = Object.entries(roomAgg).map(([id, a]) => ({ room: roomById(id), max: Math.max(...a) })).filter(x => x.room).sort((a, b) => b.max - a.max).slice(0, 6);
  const floorList = DB.floors.slice().sort((a, b) => a.number - b.number).map(f => ({ name: f.name, count: DB.cleaningSessions.filter(s => roomById(s.roomId)?.floor === f.number).length }));
  const noLegend = { plugins: { legend: { display: false } } };
  return (
    <>
      <Topbar title="Dashboard" sub={'Resumen operativo en tiempo real · ' + (DB.hotel.name || '')}>
        <button className="btn btn-primary" onClick={() => go('cleanings')}>Ver limpiezas activas</button>
      </Topbar>
      {count(['EN VERIFICACIÓN']) > 0 && (
        <div className="banner banner-warn">🔎 <b>{count(['EN VERIFICACIÓN'])}</b> habitación(es) esperando verificación del supervisor.</div>
      )}
      {invAlerts > 0 && (
        <div className="banner banner-err">📦 <b>{invAlerts}</b> inventario(s) de hoy con diferencias o cambios.<button className="btn btn-sm" onClick={() => go('inventory')}>Ver inventario</button></div>
      )}
      {late > 0 && <div className="card glow" style={{ borderColor: 'rgba(239,68,68,.4)', marginBottom: 16, background: 'rgba(239,68,68,.08)' }}>⚠️ <b>{late}</b> limpieza(s) en curso superan el tiempo estimado.</div>}
      <div className="cards-grid">
        {cards.map(([lab, val]) => <div key={lab} className="card stat-card"><div className="accent"></div><div className="lab">{lab}</div><div className="val">{val}</div></div>)}
      </div>
      <div className="charts-grid">
        <div className="card chart-card"><h3>Limpiezas por día (últimos 7 días)</h3>
          <ChartCanvas type="bar" data={{ labels: days.map(d => d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' })), datasets: [{ label: 'Limpiezas', data: byDay, backgroundColor: '#1d4ed8' }] }} options={{ ...noLegend, scales: { y: { beginAtZero: true } } }} /></div>
        <div className="card chart-card"><h3>Tiempo promedio por habitación (top 8)</h3>
          <ChartCanvas type="bar" data={{ labels: roomList.map(x => x.room.number), datasets: [{ label: 'Min. promedio', data: roomList.map(x => +x.avg.toFixed(1)), backgroundColor: '#061045' }] }} options={{ indexAxis: 'y', ...noLegend }} /></div>
        <div className="card chart-card"><h3>Tiempo promedio por colaborador</h3>
          <ChartCanvas type="bar" data={{ labels: empList.map(x => x.name), datasets: [{ label: 'Min. promedio', data: empList.map(x => +x.avg.toFixed(1)), backgroundColor: '#4cc9f0' }] }} options={noLegend} /></div>
        <div className="card chart-card"><h3>Habitaciones especiales vs normales</h3>
          <ChartCanvas type="doughnut" data={{ labels: ['Especiales', 'Normales'], datasets: [{ data: [rooms.filter(r => r.type === 'ESPECIAL').length, rooms.filter(r => r.type === 'NORMAL').length], backgroundColor: ['#061045', '#4cc9f0'] }] }} /></div>
        <div className="card chart-card"><h3>Mayor tiempo de limpieza (top 6)</h3>
          <ChartCanvas type="bar" data={{ labels: top6.map(x => 'Hab. ' + x.room.number), datasets: [{ label: 'Min. máximo', data: top6.map(x => +x.max.toFixed(1)), backgroundColor: '#ef4444' }] }} options={noLegend} /></div>
        <div className="card chart-card"><h3>Limpiezas por piso</h3>
          <ChartCanvas type="line" data={{ labels: floorList.map(x => x.name), datasets: [{ label: 'Limpiezas', data: floorList.map(x => x.count), borderColor: '#1d4ed8', backgroundColor: 'rgba(29,78,216,.10)', fill: true, tension: .35 }] }} options={noLegend} /></div>
      </div>
    </>
  );
}

/* -------- HABITACIONES -------- */
function RoomsView() {
  const [search, setSearch] = useState(''), [floorF, setFloorF] = useState(''), [statusF, setStatusF] = useState('');
  const rooms = DB.rooms.filter(r => (!search || String(r.number).includes(search)) && (!floorF || String(r.floor) === floorF) && (!statusF || r.status === statusF)).sort((a, b) => a.number - b.number);
  return (
    <>
      <Topbar title="Habitaciones" sub={DB.rooms.length + ' habitaciones registradas'}>
        <div className="tag-row">
          {DB.rooms.length > 0 && <button className="btn" onClick={() => printRoomLabels(DB.rooms.slice().sort((a, b) => a.number - b.number))}>🖨️ Imprimir QR de todas</button>}
          <button className="btn btn-primary" onClick={() => openModal(<RoomForm />)}>+ Nueva habitación</button>
        </div>
      </Topbar>
      <div className="toolbar">
        <input placeholder="Buscar número..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={floorF} onChange={e => setFloorF(e.target.value)}><option value="">Todos los pisos</option>{DB.floors.map(f => <option key={f.id} value={f.number}>{f.name}</option>)}</select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)}><option value="">Todos los estados</option>{ROOM_STATUSES.map(s => <option key={s}>{s}</option>)}</select>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Número</th><th>Piso</th><th>Categoría</th><th>T. estimado</th><th>Estado</th><th>Check-in</th><th>Check-out</th><th>Reserva</th><th></th></tr></thead>
        <tbody>
          {rooms.map(r => (
            <tr key={r.id} onClick={() => openModal(<RoomDetail id={r.id} />)}>
              <td><b>{r.number}</b></td><td>{r.floor}</td><td>{r.category}</td>
              <td>{r.estimatedMinutes} min</td><td><StatusBadge status={r.status} /></td>
              <td>{r.status === 'OCUPADA' ? fmtDateTime(r.checkIn) : '-'}</td><td>{r.status === 'OCUPADA' ? fmtDateTime(r.checkOut) : '-'}</td>
              <td onClick={e => e.stopPropagation()}>
                {r.status === 'DISPONIBLE' && <button className="btn btn-sm btn-pill btn-warn" onClick={() => openModal(<OccupyForm id={r.id} />)}>🛎️ Ocupar</button>}
                {r.status === 'OCUPADA' && <button className="btn btn-sm btn-pill btn-ok" onClick={() => checkoutRoom(r.id).then(ok => { if (ok !== null) toast(ok ? 'Salida registrada: habitación ' + r.number + ' pasa a limpieza' : 'La habitación ya cambió de estado.', ok ? 'ok' : 'warn'); })}>🚪 Dar salida</button>}
                {OCCUPY_LOCK[r.status] && <button className="btn btn-sm btn-pill btn-locked" disabled title={'Se habilita cuando la habitación quede DISPONIBLE (limpieza + verificación del supervisor)'}>🔒 Ocupar<span className="lock-why">{OCCUPY_LOCK[r.status]}</span></button>}
              </td>
              <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); openModal(<RoomForm id={r.id} />); }}>Editar</button></td>
            </tr>
          ))}
          {!rooms.length && <Empty cols={9}>Sin resultados</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
const CATEGORIES = ['Normal', 'Suite', 'Suite Presidencial', 'VIP', 'Habitación familiar'];
/* Etapas en las que no se puede ocupar: después del check-out hay que limpiar y que el supervisor apruebe. */
const OCCUPY_LOCK = { 'PENDIENTE DE LIMPIEZA': 'Por limpiar', 'EN LIMPIEZA': 'En limpieza', 'LIMPIA': 'Falta verificación',
  'EN VERIFICACIÓN': 'Esperando supervisor', 'FUERA DE SERVICIO': 'Fuera de servicio' };
function defaultEst(cat) {
  if (cat === 'Suite') return DB.settings.specialMinutes;
  if (cat === 'Suite Presidencial' || cat === 'VIP') return DB.settings.presidentialMinutes;
  return DB.settings.normalMinutes;
}
function RoomForm({ id }) {
  const r = id ? roomById(id) : null;
  const [f, setF] = useState({
    number: r ? r.number : '', floor: r ? r.floor : (DB.floors[0]?.number ?? ''), category: r ? r.category : 'Normal',
    est: r ? r.estimatedMinutes : DB.settings.normalMinutes, status: r ? r.status : 'DISPONIBLE', nfc: r ? r.nfc : '', notes: r ? (r.notes || '') : ''
  });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const code = f.number ? 'ROOM-' + f.number : '';
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const number = parseInt(f.number), floor = parseInt(f.floor);
    if (!number) { toast('Ingrese un número de habitación válido', 'err'); return; }
    if (isNaN(floor)) { toast('Primero cree un piso (menú Pisos) y elíjalo aquí.', 'err'); return; }
    // El QR sigue al número de la habitación; el NFC también, salvo que se haya personalizado.
    const qr = 'ROOM-' + number;
    let nfc = f.nfc.trim();
    if (!nfc || (r && nfc === 'NFC-ROOM-' + r.number)) nfc = 'NFC-ROOM-' + number;
    const clash = DB.rooms.find(x => x.id !== id && (x.number === number || x.qr === qr || x.nfc === nfc));
    if (clash) {
      toast(clash.number === number ? 'Ya existe la habitación ' + number + '.'
        : 'El código ' + (clash.qr === qr ? qr : nfc) + ' ya lo usa la habitación ' + clash.number + '. Edítela y guárdela para corregir su código.', 'err');
      return;
    }
    const data = { number, floor, qr, category: f.category, type: f.category === 'Normal' ? 'NORMAL' : 'ESPECIAL',
      estimatedMinutes: parseInt(f.est) || 30, status: f.status, nfc, notes: f.notes };
    const before = r ? { ...r } : null;
    let saved;
    if (r) { Object.assign(r, data); saved = r; }
    else { saved = { id: generateId('ROOM'), active: true, ...data }; DB.rooms.push(saved); }
    setBusy(true);
    const ok = await Cloud.upsert('rooms', saved, { quiet: true });
    setBusy(false);
    if (!ok) {   // la nube lo rechazó: se deshace aquí para no dejar datos solo locales
      if (before) Object.assign(r, before); else DB.rooms = DB.rooms.filter(x => x !== saved);
      refresh(); toast('No se guardó: ' + Cloud.lastError, 'err'); return;
    }
    logHistory(Auth.current().username, 'HABITACIÓN', 'Habitación ' + number + (r ? ' actualizada.' : ' creada.'));
    saveData(); refresh(); closeModal(); toast('Habitación guardada', 'ok');
  };
  const del = () => { DB.rooms = DB.rooms.filter(x => x.id !== id); saveData(); Cloud.remove('rooms', id); refresh(); closeModal(); toast('Habitación eliminada', 'ok'); };
  const assignTag = async () => {
    let v = f.nfc.trim();
    if (!v) { if (!f.number) { toast('Ingrese primero el número de habitación', 'warn'); return; } v = 'NFC-ROOM-' + f.number; setF({ ...f, nfc: v }); }
    await NFC.write(v);
  };
  return (
    <>
      <h2>{r ? 'Editar' : 'Nueva'} habitación</h2>
      <div className="grid2">
        <Field label="Número"><input type="number" value={f.number} onChange={set('number')} /></Field>
        <Field label="Piso"><select value={f.floor} onChange={set('floor')}>{DB.floors.map(fl => <option key={fl.id} value={fl.number}>{fl.name}</option>)}</select></Field>
        <Field label="Categoría"><select value={f.category} onChange={e => setF({ ...f, category: e.target.value, est: defaultEst(e.target.value) })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Tiempo estimado (min)"><input type="number" value={f.est} onChange={set('est')} /></Field>
        <Field label="Estado"><select value={f.status} onChange={set('status')}>{ROOM_STATUSES.filter(s => !['EN LIMPIEZA', 'OCUPADA'].includes(s) || f.status === s).map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Código NFC">
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.nfc} onChange={set('nfc')} placeholder="Se genera automáticamente" style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={assignTag}>📶 Asignar TAG</button>
          </div>
        </Field>
      </div>
      <Field label="Notas"><textarea value={f.notes} onChange={set('notes')} /></Field>
      <div className="divider"></div>
      <Field label="Código QR único (para validar el aseo)">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <QrCanvas text={code ? roomLink(code) : ''} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="small muted">{code || 'Ingrese el número para generar el QR'}</span>
            {code && <><button type="button" className="btn btn-sm" onClick={() => printRoomLabels([{ number: f.number, qr: code }])}>🖨️ Imprimir etiqueta</button>
              <button type="button" className="btn btn-sm" onClick={() => downloadRoomQr({ number: f.number, qr: code })}>⬇️ Descargar QR</button></>}
          </div>
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
        {r && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </>
  );
}
function RoomDetail({ id }) {
  const r = roomById(id);
  const sessions = finishedSessions().filter(s => s.roomId === id);
  const d = sessions.map(s => s.durationSeconds / 60);
  const last = sessions.slice().sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0];
  const fm = v => v ? v.toFixed(1) + ' min' : '-';
  const inv = lastInventoryCheck(id);
  return (
    <>
      <h2>Habitación {r.number}</h2>
      {[['Piso', r.floor], ['Categoría', r.category], ['Tipo', r.type], ['Estado', <StatusBadge status={r.status} />], ['Tiempo estimado', r.estimatedMinutes + ' min'], ['Código QR', r.qr], ['NFC UID', r.nfc]]
        .map(([k, v]) => <div className="kv" key={k}><b>{k}</b><span>{v}</span></div>)}
      <div className="divider"></div>
      {r.status === 'OCUPADA' && <>
        <div className="kv"><b>Check-in</b><span>{fmtDateTime(r.checkIn)}</span></div>
        <div className="kv"><b>Check-out previsto</b><span>{fmtDateTime(r.checkOut)}</span></div></>}
      {r.assignedTo && <div className="kv"><b>Servicio asignado a</b><span>{empById(r.assignedTo)?.name || '-'}</span></div>}
      <div className="kv"><b>Promedio histórico</b><span>{fm(avg(d))}</span></div>
      <div className="kv"><b>Máximo histórico</b><span>{fm(d.length ? Math.max(...d) : 0)}</span></div>
      <div className="kv"><b>Mínimo histórico</b><span>{fm(d.length ? Math.min(...d) : 0)}</span></div>
      <div className="kv"><b>Última limpieza</b><span>{last ? fmtDateTime(last.endTime) + ' · ' + (empById(last.employeeId)?.name || '-') : '-'}</span></div>
      {inv && <div className="kv" style={{ cursor: 'pointer' }} onClick={() => openModal(<InventoryCheckDetail id={inv.id} />, true)}><b>Último inventario</b><span>{fmtDateTime(inv.timestamp)} <InventoryResult check={inv} /></span></div>}
      <div className="divider"></div>
      <div className="center">
        <QrCanvas text={roomLink(r.qr)} /><div className="small muted" style={{ marginTop: 8 }}>{r.qr}</div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => printRoomLabels([r])}>🖨️ Imprimir etiqueta</button>
          <button className="btn btn-sm" onClick={() => downloadRoomQr(r)}>⬇️ Descargar QR</button>
          <button className="btn btn-sm btn-primary" onClick={() => openModal(<RoomForm id={r.id} />)}>Editar</button>
        </div>
      </div>
    </>
  );
}

/* -------- OCUPAR HABITACIÓN (check-in / check-out) -------- */
const toLocalInput = d => { const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
function OccupyForm({ id }) {
  const r = roomById(id);
  const now = new Date(), out = new Date(now.getTime() + 24 * 3600 * 1000); out.setHours(12, 0, 0, 0);
  const [ci, setCi] = useState(toLocalInput(now)), [co, setCo] = useState(toLocalInput(out)), [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); const ok = await occupyRoom(id, ci, co); setBusy(false); if (ok) { closeModal(); toast('Habitación ' + r.number + ' ocupada hasta ' + fmtDateTime(isoOrNull(co)), 'ok'); } };
  return (
    <>
      <h2>Ocupar habitación {r.number}</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>Al llegar la hora de check-out (o al dar salida) la habitación pasa a limpieza y se avisa al personal de aseo.</p>
      <div className="grid2">
        <Field label="Check-in (entrada)"><input type="datetime-local" value={ci} onChange={e => setCi(e.target.value)} /></Field>
        <Field label="Check-out (salida)"><input type="datetime-local" value={co} onChange={e => setCo(e.target.value)} /></Field>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy} onClick={save}>Registrar ocupación</button>
    </>
  );
}

/* -------- SERVICIOS DE LIMPIEZA: habitaciones por limpiar y su asignación -------- */
function CleaningBoard() {
  useTick(15000);
  const pending = DB.rooms.filter(r => r.status === 'PENDIENTE DE LIMPIEZA').sort((a, b) => a.number - b.number);
  const free = availableCleaners();
  return (
    <>
      <div className="small muted" style={{ marginBottom: 12 }}>
        Personal disponible: {free.length ? free.map(e => e.name).join(', ') : 'ninguno'} · El aseo disponible puede tomar los servicios sin asignar; quien ya tiene una limpieza no puede tomar otro.
      </div>
      <div className="sup-grid">
        {pending.map(r => <ServiceCard key={r.id} room={r} free={free} />)}
        {!pending.length && <div className="card empty-state">✅ No hay habitaciones esperando limpieza.</div>}
      </div>
    </>
  );
}
function ServiceCard({ room, free }) {
  const [sel, setSel] = useState('');
  const owner = room.assignedTo ? empById(room.assignedTo) : null;
  const options = free.filter(e => e.id !== room.assignedTo);
  const assign = async () => {
    if (!sel) { toast('Elige un colaborador disponible', 'err'); return; }
    const ok = await claimRoom(room.id, sel, true);
    if (ok) { setSel(''); toast('Servicio asignado a ' + empById(sel).name, 'ok'); }
  };
  return (
    <div className="card sup-room">
      <div className="flex-between"><div className="num">{room.number}</div><StatusBadge status={room.status} /></div>
      <div className="meta">Piso {room.floor} · {room.category} · {room.estimatedMinutes} min<br />
        {owner ? <>Asignada a: <b>{owner.name}</b></> : <span>⏳ Sin asignar · disponible para tomar</span>}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="select-inline" value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">{options.length ? (owner ? 'Reasignar a...' : 'Asignar a...') : 'Sin personal disponible'}</option>
          {options.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" disabled={!sel} onClick={assign}>Asignar</button>
      </div>
    </div>
  );
}
function ServicesView() {
  return (<><Topbar title="Servicios de limpieza" sub="Habitaciones por limpiar: asigna o deja que el aseo disponible las tome" /><CleaningBoard /></>);
}

/* -------- PISOS -------- */
function FloorsView() {
  const floors = DB.floors.slice().sort((a, b) => a.number - b.number);
  return (
    <>
      <Topbar title="Pisos" sub={floors.length + ' pisos configurados'}><button className="btn btn-primary" onClick={() => openModal(<FloorForm />)}>+ Nuevo piso</button></Topbar>
      <div className="cards-grid">
        {floors.map(f => {
          const rooms = DB.rooms.filter(r => r.floor === f.number);
          const c = st => rooms.filter(r => st.includes(r.status)).length;
          const a = avg(finishedSessions().filter(s => roomById(s.roomId)?.floor === f.number).map(s => s.durationSeconds / 60));
          return (
            <div className="card stat-card" key={f.id}>
              <div className="flex-between"><b>{f.name}</b>
                <div className="tag-row">
                  <button className="btn btn-sm" onClick={() => openModal(<FloorForm id={f.id} />)}>✎</button>
                  <button className="btn btn-sm btn-danger" onClick={() => { DB.floors = DB.floors.filter(x => x.id !== f.id); saveData(); Cloud.remove('floors', f.id); refresh(); }}>✕</button>
                </div></div>
              <div className="small muted" style={{ marginTop: 8 }}>Habitaciones: {rooms.length}</div>
              <div className="small muted">Disponibles: {c(['DISPONIBLE'])} · Pendientes: {c(['PENDIENTE DE LIMPIEZA'])} · En limpieza: {c(['EN LIMPIEZA'])} · En verificación: {c(['EN VERIFICACIÓN'])}</div>
              <div className="small muted">Tiempo promedio: {a ? a.toFixed(1) + ' min' : '-'}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
function FloorForm({ id }) {
  const f0 = id ? DB.floors.find(x => x.id === id) : null;
  const [name, setName] = useState(f0 ? f0.name : ''), [number, setNumber] = useState(f0 ? f0.number : '');
  const save = async () => {
    const n = parseInt(number);
    if (!name.trim() || !n) { toast('Complete los campos', 'err'); return; }
    if (DB.floors.some(x => x.id !== id && x.number === n)) { toast('Ya existe un piso con el número ' + n + '.', 'err'); return; }
    const before = f0 ? { ...f0 } : null;
    let saved;
    if (f0) { Object.assign(f0, { name: name.trim(), number: n }); saved = f0; }
    else { saved = { id: generateId('FLR'), name: name.trim(), number: n, roomsCount: 0 }; DB.floors.push(saved); }
    const ok = await Cloud.upsert('floors', saved, { quiet: true });
    if (!ok) { if (before) Object.assign(f0, before); else DB.floors = DB.floors.filter(x => x !== saved); refresh(); toast('No se guardó: ' + Cloud.lastError, 'err'); return; }
    saveData(); refresh(); closeModal(); toast('Piso guardado', 'ok');
  };
  return (<><h2>{f0 ? 'Editar' : 'Nuevo'} piso</h2>
    <Field label="Nombre"><input value={name} onChange={e => setName(e.target.value)} /></Field>
    <Field label="Número"><input type="number" value={number} onChange={e => setNumber(e.target.value)} /></Field>
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={save}>Guardar</button></div></>);
}

/* -------- COLABORADORES -------- */
function EmployeesView() {
  return (
    <>
      <Topbar title="Colaboradores" sub={DB.employees.length + ' colaboradores registrados'}><button className="btn btn-primary" onClick={() => openModal(<EmpForm />)}>+ Nuevo colaborador</button></Topbar>
      <AccessLinks />
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Nombre</th><th>Documento</th><th>Cargo</th><th>Turno</th><th>Piso</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {DB.employees.map(e => (
            <tr key={e.id} onClick={() => openModal(<EmpDetail id={e.id} />)}>
              <td>{e.photo ? <img className="thumb" src={e.photo} alt="" /> : <div className="thumb" style={{ background: 'var(--grad-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>}</td>
              <td><b>{e.name}</b></td><td>{e.document}</td><td>{e.position}</td><td>{e.shift}</td><td>{e.floor}</td>
              <td><Badge cls={e.status === 'ACTIVA' || e.status === 'EN TURNO' ? 'b-green' : (e.status === 'EN DESCANSO' ? 'b-yellow' : 'b-gray')}>{e.status}</Badge></td>
              <td><button className="btn btn-sm" onClick={ev => { ev.stopPropagation(); openModal(<EmpForm id={e.id} />); }}>Editar</button></td>
            </tr>
          ))}
          {!DB.employees.length && <Empty cols={8}>Sin colaboradores</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
/* Enlaces de acceso de cada interfaz (misma página, distinto ?app=). */
function appBaseUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
const APP_LINKS = [
  ['🧹 Personal de aseo', 'aseo', 'Cada colaborador entra con su cédula o correo y el código que le asignes.'],
  ['🔎 Supervisor (VL)', 'supervisor', 'Verifica habitaciones y recibe las notificaciones.'],
  ['🛡️ Recepción / Admin', 'admin', 'Dashboard completo.']
];
function AccessLinks() {
  const copy = async url => { try { await navigator.clipboard.writeText(url); toast('Enlace copiado', 'ok'); } catch (e) { toast(url, 'warn'); } };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b>Enlaces de acceso</b>
      <div className="small muted" style={{ margin: '4px 0 10px' }}>Comparte cada enlace con su grupo. Se pueden instalar como app desde el navegador.</div>
      {APP_LINKS.map(([label, app, hint]) => {
        const url = appBaseUrl() + '?app=' + app;
        return (
          <div key={app} style={{ padding: '8px 0', borderTop: '1px solid var(--panel-b)' }}>
            <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span><b>{label}</b><br /><span className="small muted">{hint}</span></span>
              <button className="btn btn-sm" onClick={() => copy(url)}>📋 Copiar</button>
            </div>
            <div className="small" style={{ wordBreak: 'break-all', color: 'var(--cyan)', marginTop: 4 }}>{url}</div>
          </div>
        );
      })}
    </div>
  );
}
const randomCode = () => String(Math.floor(100000 + Math.random() * 900000));

function EmpForm({ id, canDelete = true }) {
  const e0 = id ? empById(id) : null;
  const [f, setF] = useState({ name: e0?.name || '', document: e0?.document || '', phone: e0?.phone || '', email: e0?.email || '',
    shift: e0?.shift || '06:00 - 14:00', floor: e0?.floor ?? (DB.floors[0]?.number ?? ''), status: e0?.status || 'ACTIVA', pass: '',
    cleaning: e0 ? e0.cleaningRole !== false : true });
  const [photo, setPhoto] = useState(null);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (!f.name.trim()) { toast('Ingrese el nombre', 'err'); return; }
    const data = { name: f.name.trim(), document: f.document, phone: f.phone, email: f.email, shift: f.shift, floor: parseInt(f.floor), status: f.status, position: 'Housekeeping', cleaningRole: f.cleaning };
    const photoUrl = photo ? await readFileAsDataURL(photo) : null;
    let saved;
    if (e0) { Object.assign(e0, data); if (photoUrl) e0.photo = photoUrl; if (f.pass) e0.password = f.pass; saved = e0; }
    else { saved = { id: generateId('EMP'), photo: photoUrl, password: f.pass || null, ...data }; DB.employees.push(saved); }
    commit('employees', saved); closeModal(); toast('Colaborador guardado', 'ok');
  };
  const del = () => { DB.employees = DB.employees.filter(x => x.id !== id); saveData(); Cloud.remove('employees', id); refresh(); closeModal(); };
  return (
    <>
      <h2>{e0 ? 'Editar' : 'Nuevo'} colaborador</h2>
      <div className="grid2">
        <Field label="Nombre"><input value={f.name} onChange={set('name')} /></Field>
        <Field label="Documento (cédula)"><input value={f.document} onChange={set('document')} /></Field>
        <Field label="Teléfono"><input value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Correo"><input value={f.email} onChange={set('email')} /></Field>
        <Field label="Turno"><input value={f.shift} onChange={set('shift')} /></Field>
        <Field label="Piso asignado"><select value={f.floor} onChange={set('floor')}>{DB.floors.map(fl => <option key={fl.id} value={fl.number}>{fl.name}</option>)}</select></Field>
        <Field label="Estado"><select value={f.status} onChange={set('status')}>{['ACTIVA', 'INACTIVA', 'EN DESCANSO', 'EN TURNO'].map(s => <option key={s}>{s}</option>)}</select></Field>
        <Field label="Foto"><PhotoInput onChange={setPhoto} /></Field>
        <Field label={e0 ? 'Nuevo código de acceso (en blanco = no cambiarlo)' : 'Código de acceso'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={f.pass} onChange={set('pass')} placeholder={e0 ? '••••••' : 'Ej.: 482913'} style={{ flex: 1 }} />
            <button type="button" className="btn btn-sm" onClick={() => setF({ ...f, pass: randomCode() })}>🎲 Generar</button>
          </div>
        </Field>
      </div>
      <div className="field"><label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={f.cleaning} onChange={e => setF({ ...f, cleaning: e.target.checked })} style={{ width: 'auto' }} />
        🧹 Rol limpieza: recibe avisos de habitaciones por limpiar y puede tomar servicios</label></div>
      <div className="small muted" style={{ margin: '-4px 0 14px' }}>El colaborador entra en el enlace de aseo con su <b>cédula</b> o <b>correo</b> y este código. Anótalo antes de guardar: después no se muestra.</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {e0 && canDelete && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        <button className="btn btn-primary" onClick={save}>Guardar</button>
      </div>
    </>
  );
}
function EmpDetail({ id }) {
  const e = empById(id);
  const sessions = finishedSessions().filter(s => s.employeeId === id);
  const d = sessions.map(s => s.durationSeconds / 60), total = d.reduce((a, b) => a + b, 0);
  const last = sessions.slice().sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0];
  return (
    <>
      <h2>{e.name}</h2>
      <div className="kv"><b>Documento</b><span>{e.document}</span></div>
      <div className="kv"><b>Estado</b><span>{e.status}</span></div>
      <div className="divider"></div>
      <div className="kv"><b>Habitaciones limpiadas</b><span>{sessions.length}</span></div>
      <div className="kv"><b>Tiempo total</b><span>{Timer.formatLong(total * 60)}</span></div>
      <div className="kv"><b>Tiempo promedio</b><span>{avg(d).toFixed(1)} min</span></div>
      <div className="kv"><b>Tiempo mínimo</b><span>{(d.length ? Math.min(...d) : 0).toFixed(1)} min</span></div>
      <div className="kv"><b>Tiempo máximo</b><span>{(d.length ? Math.max(...d) : 0).toFixed(1)} min</span></div>
      <div className="kv"><b>Habitaciones especiales</b><span>{sessions.filter(s => roomById(s.roomId)?.type === 'ESPECIAL').length}</span></div>
      <div className="kv"><b>Última actividad</b><span>{last ? fmtDateTime(last.endTime) : '-'}</span></div>
    </>
  );
}

/* -------- USUARIOS: ADMIN y VL (supervisor) -------- */
function UsersView() {
  const users = DB.users.filter(u => u.role === 'ADMIN' || u.role === 'VL');
  return (
    <>
      <Topbar title="Usuarios" sub={users.length + ' usuario(s): administradores y supervisores (VL)'}>
        <button className="btn btn-primary" onClick={() => openModal(<UserForm />)}>+ Nuevo usuario</button>
      </Topbar>
      <AccessLinks />
      <div className="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th></th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.username} onClick={() => openModal(<UserForm username={u.username} />)}>
              <td><b>{u.name}</b></td><td>{u.username}</td>
              <td><Badge cls={u.role === 'VL' ? 'b-violet' : 'b-blue'}>{u.role === 'VL' ? 'SUPERVISOR (VL)' : 'ADMIN'}</Badge></td>
              <td><button className="btn btn-sm" onClick={ev => { ev.stopPropagation(); openModal(<UserForm username={u.username} />); }}>Editar</button></td>
            </tr>
          ))}
          {!users.length && <Empty cols={4}>Sin usuarios</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
function UserForm({ username }) {
  const u0 = username ? DB.users.find(x => x.username === username && (x.role === 'ADMIN' || x.role === 'VL')) : null;
  const [f, setF] = useState({ name: u0?.name || '', username: u0?.username || '', pass: '', role: u0?.role || 'ADMIN' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const me = Auth.current();
  const save = () => {
    const name = f.name.trim(), uname = f.username.trim();
    if (!name || !uname) { toast('Ingrese nombre y usuario', 'err'); return; }
    if (u0) {
      if (u0.role === 'ADMIN' && f.role !== 'ADMIN' && DB.users.filter(x => x.role === 'ADMIN').length <= 1) { toast('Debe existir al menos un administrador', 'err'); return; }
      u0.name = name; u0.role = f.role; if (f.pass) u0.password = f.pass;
      logHistory(me.username, 'USUARIO', 'Usuario ' + uname + ' actualizado.');
      commit('users', u0); closeModal(); toast('Usuario actualizado', 'ok');
    } else {
      if (DB.users.some(x => x.username === uname)) { toast('Ese nombre de usuario ya existe', 'err'); return; }
      if (!f.pass) { toast('Ingrese una contraseña', 'err'); return; }
      const nu = { username: uname, password: f.pass, role: f.role, name };
      DB.users.push(nu);
      logHistory(me.username, 'USUARIO', 'Usuario ' + uname + ' (' + f.role + ') creado.');
      commit('users', nu); closeModal(); toast('Usuario creado', 'ok');
    }
  };
  const del = () => {
    if (u0.role === 'ADMIN' && DB.users.filter(x => x.role === 'ADMIN').length <= 1) { toast('Debe existir al menos un administrador', 'err'); return; }
    if (me && me.username === u0.username) { toast('No puede eliminar su propio usuario con la sesión iniciada', 'err'); return; }
    DB.users = DB.users.filter(x => x.username !== u0.username);
    saveData(); Cloud.remove('users', u0.username, 'username'); refresh(); closeModal(); toast('Usuario eliminado', 'ok');
    logHistory(me ? me.username : 'sistema', 'USUARIO', 'Usuario ' + u0.username + ' eliminado.');
  };
  return (
    <>
      <h2>{u0 ? 'Editar' : 'Nuevo'} usuario</h2>
      <Field label="Nombre completo"><input value={f.name} onChange={set('name')} /></Field>
      <Field label="Usuario"><input value={f.username} onChange={set('username')} disabled={!!u0} /></Field>
      <Field label="Rol">
        <select value={f.role} onChange={set('role')}><option value="ADMIN">Administrador (recepción)</option><option value="VL">Supervisor (VL) — verifica limpiezas</option></select>
      </Field>
      <Field label={u0 ? 'Nueva contraseña (dejar en blanco para no cambiarla)' : 'Contraseña'}><input type="password" value={f.pass} onChange={set('pass')} placeholder={u0 ? '••••••••' : ''} /></Field>
      {f.role === 'VL' && <div className="small muted" style={{ marginBottom: 12 }}>El supervisor entra desde el login con el acceso oculto (5 toques seguidos al logo "CC").</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        {u0 && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        <button className="btn btn-primary" onClick={save}>Guardar</button>
      </div>
    </>
  );
}

/* -------- ASIGNACIONES -------- */
function AssignmentsView() {
  return (
    <>
      <Topbar title="Asignaciones" sub="Habitaciones asignadas por colaborador" />
      {DB.employees.map(e => {
        const asg = DB.assignments.find(a => a.employeeId === e.id) || { roomIds: [] };
        const rooms = asg.roomIds.map(roomById).filter(Boolean).sort((a, b) => a.number - b.number);
        return (
          <div className="card" style={{ marginBottom: 12 }} key={e.id}>
            <div className="flex-between"><b>{e.name}</b><button className="btn btn-sm btn-primary" onClick={() => openModal(<AssignForm employeeId={e.id} />)}>Reasignar</button></div>
            <div className="tag-row" style={{ marginTop: 10 }}>{rooms.length ? rooms.map(r => <Badge key={r.id} cls="b-blue">{r.number}</Badge>) : <span className="muted small">Sin habitaciones asignadas</span>}</div>
          </div>
        );
      })}
    </>
  );
}
function AssignForm({ employeeId }) {
  const asg = DB.assignments.find(a => a.employeeId === employeeId) || { roomIds: [] };
  const [sel, setSel] = useState(asg.roomIds);
  const toggle = id => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const save = () => {
    let a = DB.assignments.find(x => x.employeeId === employeeId);
    if (a) a.roomIds = sel; else { a = { id: generateId('ASG'), employeeId, roomIds: sel }; DB.assignments.push(a); }
    commit('assignments', a); closeModal(); toast('Asignación guardada', 'ok');
  };
  return (
    <>
      <h2>Asignar habitaciones · {empById(employeeId).name}</h2>
      <div className="tag-row" style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 14 }}>
        {DB.rooms.slice().sort((a, b) => a.number - b.number).map(r => (
          <button key={r.id} className={'btn btn-sm btn-pill' + (sel.includes(r.id) ? ' btn-primary' : '')} onClick={() => toggle(r.id)}>{r.number} · P{r.floor}</button>
        ))}
      </div>
      <div className="small muted" style={{ marginBottom: 12 }}>{sel.length} habitación(es) seleccionada(s)</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={save}>Guardar asignación</button></div>
    </>
  );
}

/* -------- LIMPIEZAS -------- */
function sessionDiffMin(s) {
  return s.status === 'FINALIZADA' ? Math.round(s.diffSeconds / 60) : Math.round(Timer.elapsedSeconds(s.startTime) / 60 - s.estimatedMinutes);
}
function CleaningsView() {
  useTick(30000);
  const [q, setQ] = useState({ search: '', emp: '', floor: '', status: '', from: '', to: '' });
  const set = k => e => setQ({ ...q, [k]: e.target.value });
  const list = DB.cleaningSessions.slice().sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).filter(s => {
    const r = roomById(s.roomId), e = empById(s.employeeId), sr = q.search.toLowerCase();
    if (sr && !(String(r?.number).includes(sr) || (e?.name || '').toLowerCase().includes(sr))) return false;
    if (q.emp && s.employeeId !== q.emp) return false;
    if (q.floor && String(r?.floor) !== q.floor) return false;
    if (q.status && s.status !== q.status) return false;
    if (q.from && new Date(s.startTime) < new Date(q.from)) return false;
    if (q.to && new Date(s.startTime) > new Date(q.to + 'T23:59:59')) return false;
    return true;
  });
  return (
    <>
      <Topbar title="Limpiezas" sub="Todos los registros de limpieza"><button className="btn btn-sm" onClick={exportCSV}>⬇️ CSV</button></Topbar>
      <div className="toolbar">
        <input placeholder="Buscar habitación/colaborador..." value={q.search} onChange={set('search')} />
        <select value={q.emp} onChange={set('emp')}><option value="">Todos los colaboradores</option>{DB.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <select value={q.floor} onChange={set('floor')}><option value="">Todos los pisos</option>{DB.floors.map(f => <option key={f.id} value={f.number}>{f.name}</option>)}</select>
        <select value={q.status} onChange={set('status')}><option value="">Todos los estados</option><option value="EN_LIMPIEZA">En limpieza</option><option value="FINALIZADA">Finalizada</option></select>
        <input type="date" value={q.from} onChange={set('from')} /><input type="date" value={q.to} onChange={set('to')} />
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Hab.</th><th>Piso</th><th>Colaborador</th><th>Inicio</th><th>Fin</th><th>Estimado</th><th>Real</th><th>Diferencia</th><th>Estado</th></tr></thead>
        <tbody>
          {list.map(s => {
            const r = roomById(s.roomId), e = empById(s.employeeId), dm = sessionDiffMin(s), ts = timeStatus(dm * 60, DB.settings);
            return (
              <tr key={s.id} onClick={() => openModal(<SessionDetail id={s.id} />, true)}>
                <td>{fmtDate(s.startTime)}</td><td><b>{r ? r.number : '-'}</b></td><td>{r ? r.floor : '-'}</td><td>{e ? e.name : '-'}</td>
                <td>{fmtTime(s.startTime)}</td><td>{s.endTime ? fmtTime(s.endTime) : '-'}</td><td>{s.estimatedMinutes} min</td>
                <td>{Timer.format(s.status === 'FINALIZADA' ? s.durationSeconds : Timer.elapsedSeconds(s.startTime))}</td>
                <td><Badge cls={ts.cls}>{ts.dot} {dm >= 0 ? '+' : ''}{dm} min</Badge></td>
                <td>{s.status === 'EN_LIMPIEZA' ? <Badge cls="b-violet">EN LIMPIEZA</Badge> : <Badge cls="b-green">FINALIZADA</Badge>}</td>
              </tr>
            );
          })}
          {!list.length && <Empty cols={10}>Sin resultados</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
function SessionDetail({ id }) {
  const s = DB.cleaningSessions.find(x => x.id === id), r = roomById(s.roomId), e = empById(s.employeeId);
  const inc = DB.incidents.find(i => i.sessionId === s.id);
  const dm = sessionDiffMin(s), ts = timeStatus(dm * 60, DB.settings);
  const ll = g => g ? g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) : 'No disponible';
  return (
    <>
      <h2>Detalle de limpieza · Habitación {r ? r.number : '-'}</h2>
      <div className="kv"><b>Piso / categoría</b><span>{r ? r.floor : '-'} · {r ? r.category : '-'}</span></div>
      <div className="kv"><b>Colaborador</b><span>{e ? e.name : '-'}</span></div>
      <div className="divider"></div>
      <div className="kv"><b>Fecha</b><span>{fmtDate(s.startTime)}</span></div>
      <div className="kv"><b>Hora inicio</b><span>{fmtTime(s.startTime)}</span></div>
      <div className="kv"><b>GPS inicio</b><span>{ll(s.gpsStart)}</span></div>
      <div className="divider"></div>
      <div className="kv"><b>Hora fin</b><span>{s.endTime ? fmtTime(s.endTime) : 'En curso'}</span></div>
      <div className="kv"><b>GPS final</b><span>{ll(s.gpsEnd)}</span></div>
      <div className="divider"></div>
      <div className="kv"><b>Tiempo estimado</b><span>{Timer.format(s.estimatedMinutes * 60)}</span></div>
      <div className="kv"><b>Tiempo real</b><span>{Timer.format(s.status === 'FINALIZADA' ? s.durationSeconds : Timer.elapsedSeconds(s.startTime))}</span></div>
      <div className="kv"><b>Diferencia</b><span><Badge cls={ts.cls}>{ts.dot} {dm >= 0 ? '+' : ''}{dm} min</Badge></span></div>
      {inc && <><div className="divider"></div><div className="kv"><b>Novedad</b><span>{inc.type}</span></div>
        <div className="small muted" style={{ margin: '6px 0' }}>{inc.description}</div>
        {inc.photo && <img className="photo-preview" src={inc.photo} alt="" />}</>}
      {s.gpsStart && window.L && <><div className="divider"></div>
        <MapBox height={220} setup={map => {
          map.setView([s.gpsStart.lat, s.gpsStart.lng], 15);
          L.marker([s.gpsStart.lat, s.gpsStart.lng]).addTo(map).bindPopup('Inicio');
          if (s.gpsEnd) L.marker([s.gpsEnd.lat, s.gpsEnd.lng]).addTo(map).bindPopup('Fin');
        }} /></>}
    </>
  );
}

/* -------- TIEMPOS -------- */
function TimesView() {
  const roomStats = DB.rooms.map(r => {
    const d = finishedSessions().filter(x => x.roomId === r.id).map(x => x.durationSeconds / 60);
    return { r, count: d.length, avg: avg(d), max: d.length ? Math.max(...d) : 0, min: d.length ? Math.min(...d) : 0, diff: avg(d) - r.estimatedMinutes };
  }).filter(x => x.count > 0).sort((a, b) => b.avg - a.avg);
  const topAvg = roomStats[0], topMax = roomStats.slice().sort((a, b) => b.max - a.max)[0];
  return (
    <>
      <Topbar title="Tiempos" sub="Consolidado por habitación y por colaborador" />
      {topAvg && <div className="cards-grid">
        <div className="card stat-card"><div className="lab">Mayor tiempo promedio</div><div className="val">Hab. {topAvg.r.number}</div><div className="small muted">{topAvg.avg.toFixed(1)} min prom. (estimado {topAvg.r.estimatedMinutes} min)</div></div>
        <div className="card stat-card"><div className="lab">Mayor tiempo máximo registrado</div><div className="val">Hab. {topMax.r.number}</div><div className="small muted">{topMax.max.toFixed(1)} min</div></div>
      </div>}
      <div className="section-title">⏱️ Tiempos por habitación</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Hab.</th><th>Piso</th><th>Tipo</th><th># Limpiezas</th><th>Promedio</th><th>Mínimo</th><th>Máximo</th><th>Estimado</th><th>Diferencia</th></tr></thead>
        <tbody>
          {roomStats.map(x => { const ts = timeStatus(x.diff * 60, DB.settings); return (
            <tr key={x.r.id}><td><b>{x.r.number}</b></td><td>{x.r.floor}</td><td>{x.r.category}</td><td>{x.count}</td>
              <td>{x.avg.toFixed(1)} min</td><td>{x.min.toFixed(1)} min</td><td>{x.max.toFixed(1)} min</td><td>{x.r.estimatedMinutes} min</td>
              <td><Badge cls={ts.cls}>{x.diff >= 0 ? '+' : ''}{x.diff.toFixed(1)} min</Badge></td></tr>); })}
          {!roomStats.length && <Empty cols={9}>Sin datos</Empty>}
        </tbody>
      </table></div>
      <div className="section-title">🧑‍🔧 Productividad por colaborador</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Colaborador</th><th>Hab. limpiadas</th><th>T. total</th><th>Promedio</th><th>Mínimo</th><th>Máximo</th><th>Especiales</th><th>Novedades</th><th>Última actividad</th></tr></thead>
        <tbody>
          {DB.employees.map(e => {
            const s = finishedSessions().filter(x => x.employeeId === e.id), d = s.map(x => x.durationSeconds / 60);
            const last = s.slice().sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0];
            return (
              <tr key={e.id} onClick={() => openModal(<EmpDetail id={e.id} />)}>
                <td><b>{e.name}</b></td><td>{s.length}</td><td>{Timer.formatLong(d.reduce((a, b) => a + b, 0) * 60)}</td>
                <td>{avg(d).toFixed(1)} min</td><td>{(d.length ? Math.min(...d) : 0).toFixed(1)} min</td><td>{(d.length ? Math.max(...d) : 0).toFixed(1)} min</td>
                <td>{s.filter(x => roomById(x.roomId)?.type === 'ESPECIAL').length}</td><td>{DB.incidents.filter(i => i.employeeId === e.id).length}</td>
                <td>{last ? fmtDateTime(last.endTime) : '-'}</td>
              </tr>);
          })}
        </tbody>
      </table></div>
    </>
  );
}

/* -------- NOVEDADES / FOTOS -------- */
function IncidentDetail({ id }) {
  const i = DB.incidents.find(x => x.id === id), r = roomById(i.roomId), e = empById(i.employeeId);
  return (
    <>
      <h2>Novedad · Habitación {r ? r.number : '-'}</h2>
      <div className="kv"><b>Colaborador</b><span>{e ? e.name : '-'}</span></div>
      <div className="kv"><b>Tipo</b><span>{i.type}</span></div>
      <div className="kv"><b>Fecha</b><span>{fmtDateTime(i.timestamp)}</span></div>
      <div className="kv"><b>GPS</b><span>{i.gps ? i.gps.lat.toFixed(5) + ', ' + i.gps.lng.toFixed(5) : 'No disponible'}</span></div>
      <div className="divider"></div>
      <p className="small">{i.description || ''}</p>
      {i.photo && <img className="photo-preview" src={i.photo} alt="" style={{ maxHeight: 320 }} />}
    </>
  );
}
function IncidentsView() {
  const list = DB.incidents.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return (
    <>
      <Topbar title="Novedades" sub={list.length + ' novedades reportadas'} />
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Fecha</th><th>Hab.</th><th>Colaborador</th><th>Tipo</th><th>Descripción</th></tr></thead>
        <tbody>
          {list.map(i => { const r = roomById(i.roomId), e = empById(i.employeeId); return (
            <tr key={i.id} onClick={() => openModal(<IncidentDetail id={i.id} />)}>
              <td>{i.photo ? <img className="thumb" src={i.photo} alt="" /> : '—'}</td><td>{fmtDateTime(i.timestamp)}</td>
              <td><b>{r ? r.number : '-'}</b></td><td>{e ? e.name : '-'}</td>
              <td><Badge cls={i.type.includes('VERIFICACIÓN') ? 'b-yellow' : 'b-red'}>{i.type}</Badge></td><td>{(i.description || '').slice(0, 60)}</td>
            </tr>); })}
          {!list.length && <Empty cols={6}>Sin novedades registradas</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
function PhotosView() {
  const list = DB.incidents.filter(i => i.photo);
  return (
    <>
      <Topbar title="Fotografías" sub="Evidencia fotográfica de novedades" />
      <div className="cards-grid">
        {list.map(i => { const r = roomById(i.roomId), e = empById(i.employeeId); return (
          <div className="card" style={{ padding: 10, cursor: 'pointer' }} key={i.id} onClick={() => openModal(<IncidentDetail id={i.id} />)}>
            <img src={i.photo} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }} />
            <div className="small" style={{ marginTop: 8 }}><b>Hab. {r ? r.number : '-'}</b></div>
            <div className="small muted">{e ? e.name : '-'} · {fmtDate(i.timestamp)}</div>
          </div>); })}
        {!list.length && <div className="empty-state">No hay fotografías registradas</div>}
      </div>
    </>
  );
}

/* -------- INVENTARIO DE HABITACIONES -------- */
function InventoryView() {
  const session = Auth.current();
  const push = usePushRegistration(session);
  const [tab, setTab] = useState('checks');
  const alerts = DB.inventoryChecks.filter(c => c.differences || c.changes).length;
  return (
    <>
      <Topbar title="Inventario" sub="Checklist que hace el aseo al finalizar cada limpieza">
        {tab === 'items' && <button className="btn btn-primary" onClick={() => openModal(<InventoryItemForm />)}>+ Nuevo artículo</button>}
      </Topbar>
      <PushBanner {...push} text="Activa las notificaciones para recibir una alerta cuando un inventario tenga diferencias o cambios." />
      <div className="radio-row" style={{ marginBottom: 14 }}>
        <button className={'btn btn-pill' + (tab === 'checks' ? ' btn-primary' : '')} onClick={() => setTab('checks')}>🧾 Revisiones {alerts ? '(' + alerts + ' con novedad)' : ''}</button>
        <button className={'btn btn-pill' + (tab === 'items' ? ' btn-primary' : '')} onClick={() => setTab('items')}>📦 Artículos ({DB.inventoryItems.length})</button>
      </div>
      {tab === 'items' ? <InventoryItemsTable /> : <InventoryChecksTable />}
    </>
  );
}
function InventoryItemsTable() {
  const items = sortInventory(DB.inventoryItems);
  return (
    <>
      <div className="small muted" style={{ marginBottom: 10 }}>Estos artículos aparecen en el checklist del personal de aseo. La cantidad es lo que debe haber en cada habitación.</div>
      <div className="table-wrap"><table>
        <thead><tr><th>Artículo</th><th>Categoría</th><th>Cantidad</th><th>Aplica a</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          {items.map(i => (
            <tr key={i.id} onClick={() => openModal(<InventoryItemForm id={i.id} />)}>
              <td><b>{i.name}</b></td><td>{i.category}</td><td>{i.expectedQty}</td>
              <td>{i.roomCategories && i.roomCategories.length ? i.roomCategories.join(', ') : 'Todas'}</td>
              <td><Badge cls={i.active !== false ? 'b-green' : 'b-gray'}>{i.active !== false ? 'ACTIVO' : 'INACTIVO'}</Badge></td>
              <td><button className="btn btn-sm" onClick={e => { e.stopPropagation(); openModal(<InventoryItemForm id={i.id} />); }}>Editar</button></td>
            </tr>
          ))}
          {!items.length && <Empty cols={6}>Aún no hay artículos. Crea el primero con «+ Nuevo artículo».</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
function InventoryItemForm({ id }) {
  const i0 = id ? DB.inventoryItems.find(x => x.id === id) : null;
  const [f, setF] = useState({ name: i0?.name || '', category: i0?.category || INVENTORY_CATEGORIES[0], qty: i0 ? i0.expectedQty : 1,
    cats: i0?.roomCategories || [], active: i0 ? i0.active !== false : true });
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const toggleCat = c => setF({ ...f, cats: f.cats.includes(c) ? f.cats.filter(x => x !== c) : [...f.cats, c] });
  const me = Auth.current();
  const save = async () => {
    const name = f.name.trim(), qty = parseInt(f.qty, 10);
    if (!name) { toast('Ingrese el nombre del artículo', 'err'); return; }
    if (isNaN(qty) || qty < 0) { toast('La cantidad debe ser 0 o más', 'err'); return; }
    if (DB.inventoryItems.some(x => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase() && x.category === f.category)) { toast('Ya existe ese artículo en la categoría', 'err'); return; }
    const data = { name, category: f.category, expectedQty: qty, roomCategories: f.cats, active: f.active };
    const before = i0 ? { ...i0 } : null;
    let saved;
    if (i0) { Object.assign(i0, data); saved = i0; }
    else { saved = { id: generateId('ITEM'), sortOrder: DB.inventoryItems.length, ...data }; DB.inventoryItems.push(saved); }
    setBusy(true);
    const ok = await Cloud.upsert('inventory_items', saved, { quiet: true });
    setBusy(false);
    if (!ok) { if (before) Object.assign(i0, before); else DB.inventoryItems = DB.inventoryItems.filter(x => x !== saved); refresh(); toast('No se guardó: ' + Cloud.lastError, 'err'); return; }
    logHistory(me.username, 'INVENTARIO', 'Artículo ' + name + (i0 ? ' actualizado.' : ' creado.'));
    saveData(); refresh(); closeModal(); toast('Artículo guardado', 'ok');
  };
  const del = () => {
    if (!confirm('¿Eliminar «' + i0.name + '» del inventario? Las revisiones anteriores se conservan.')) return;
    DB.inventoryItems = DB.inventoryItems.filter(x => x.id !== id);
    saveData(); Cloud.remove('inventory_items', id);
    logHistory(me.username, 'INVENTARIO', 'Artículo ' + i0.name + ' eliminado.');
    refresh(); closeModal(); toast('Artículo eliminado', 'ok');
  };
  return (
    <>
      <h2>{i0 ? 'Editar' : 'Nuevo'} artículo</h2>
      <div className="grid2">
        <Field label="Nombre"><input value={f.name} onChange={set('name')} placeholder="Ej.: Toallas de baño" autoFocus /></Field>
        <Field label="Categoría"><select value={f.category} onChange={set('category')}>{INVENTORY_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Cantidad que debe haber por habitación"><input type="number" min="0" value={f.qty} onChange={set('qty')} /></Field>
        <Field label="Estado"><select value={f.active ? '1' : '0'} onChange={e => setF({ ...f, active: e.target.value === '1' })}><option value="1">Activo (aparece en el checklist)</option><option value="0">Inactivo</option></select></Field>
      </div>
      <Field label="Aplica a las habitaciones (sin marcar = todas)">
        <div className="tag-row">{CATEGORIES.map(c => <button key={c} type="button" className={'btn btn-sm btn-pill' + (f.cats.includes(c) ? ' btn-primary' : '')} onClick={() => toggleCat(c)}>{c}</button>)}</div>
      </Field>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
        {i0 && <button className="btn btn-danger" onClick={del}>Eliminar</button>}
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Guardando...' : 'Guardar'}</button>
      </div>
    </>
  );
}
function InventoryChecksTable() {
  const [onlyAlerts, setOnlyAlerts] = useState(false), [roomF, setRoomF] = useState('');
  const list = DB.inventoryChecks.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .filter(c => (!onlyAlerts || c.differences || c.changes) && (!roomF || String(roomById(c.roomId)?.number || '').includes(roomF)));
  return (
    <>
      <div className="toolbar">
        <input placeholder="Buscar habitación..." value={roomF} onChange={e => setRoomF(e.target.value)} />
        <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={onlyAlerts} onChange={e => setOnlyAlerts(e.target.checked)} style={{ width: 'auto' }} /> Solo con diferencias o cambios</label>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Hab.</th><th>Colaborador</th><th>Resultado</th><th>Observaciones</th></tr></thead>
        <tbody>
          {list.map(c => { const r = roomById(c.roomId), e = empById(c.employeeId); return (
            <tr key={c.id} onClick={() => openModal(<InventoryCheckDetail id={c.id} />, true)}>
              <td>{fmtDateTime(c.timestamp)}</td><td><b>{r ? r.number : '-'}</b></td><td>{e ? e.name : '-'}</td>
              <td><InventoryResult check={c} /></td><td>{(c.notes || '').slice(0, 60)}</td>
            </tr>); })}
          {!list.length && <Empty cols={5}>Sin revisiones de inventario</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
const InventoryResult = ({ check }) => (
  <span className="tag-row">
    {check.differences ? <Badge cls="b-red">⚠️ {check.differences} diferencia(s)</Badge> : <Badge cls="b-green">✅ Completo</Badge>}
    {check.changes ? <Badge cls="b-yellow">🔄 {check.changes} cambio(s)</Badge> : null}
  </span>
);
function InventoryCheckDetail({ id }) {
  const c = DB.inventoryChecks.find(x => x.id === id), r = roomById(c.roomId), e = empById(c.employeeId);
  return (
    <>
      <h2>Inventario · Habitación {r ? r.number : '-'}</h2>
      <div className="kv"><b>Fecha</b><span>{fmtDateTime(c.timestamp)}</span></div>
      <div className="kv"><b>Colaborador</b><span>{e ? e.name : '-'}</span></div>
      <div className="kv"><b>Resultado</b><span><InventoryResult check={c} /></span></div>
      {c.notes && <><div className="divider"></div><p className="small"><b>Observaciones:</b> {c.notes}</p></>}
      <div className="divider"></div>
      <div className="table-wrap"><table>
        <thead><tr><th>Artículo</th><th>Categoría</th><th>Esperado</th><th>Encontrado</th><th>Revisión anterior</th></tr></thead>
        <tbody>
          {c.items.map(it => (
            <tr key={it.itemId} style={{ cursor: 'default' }}>
              <td><b>{it.name}</b></td><td>{it.category}</td><td>{it.expected}</td>
              <td><Badge cls={it.ok ? 'b-green' : 'b-red'}>{it.found}{it.ok ? '' : ' (' + (it.found - it.expected > 0 ? '+' : '') + (it.found - it.expected) + ')'}</Badge></td>
              <td>{it.previous === null || it.previous === undefined ? '-' : it.changed ? <Badge cls="b-yellow">{it.previous} → {it.found}</Badge> : it.previous}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

/* -------- MAPA / HISTORIAL / REPORTES / CONFIG -------- */
function MapView() {
  return (
    <>
      <Topbar title="Mapa GPS" sub="Ubicación de inicios y finalizaciones de limpieza" />
      <div className="card" style={{ padding: 6 }}>
        <MapBox height={520} setup={map => {
          const withGps = DB.cleaningSessions.filter(s => s.gpsStart);
          map.setView(withGps.length ? [withGps[0].gpsStart.lat, withGps[0].gpsStart.lng] : [11.2408, -74.2110], 14);
          withGps.forEach(s => {
            const r = roomById(s.roomId), e = empById(s.employeeId);
            L.marker([s.gpsStart.lat, s.gpsStart.lng]).addTo(map).bindPopup(`<b>Hab. ${r ? r.number : '-'}</b><br>${e ? e.name : '-'}<br>Inicio: ${fmtTime(s.startTime)}<br>Estado: ${s.status}`);
            if (s.gpsEnd) L.circleMarker([s.gpsEnd.lat, s.gpsEnd.lng], { radius: 6, color: '#22c55e' }).addTo(map).bindPopup(`<b>Hab. ${r ? r.number : '-'}</b><br>Fin: ${fmtTime(s.endTime)}`);
          });
          DB.incidents.filter(i => i.gps).forEach(i => L.marker([i.gps.lat, i.gps.lng]).addTo(map).bindPopup(`⚠️ Novedad · Hab. ${roomById(i.roomId)?.number || '-'}<br>${i.type}`));
        }} />
      </div>
    </>
  );
}
function HistoryView() {
  return (
    <>
      <Topbar title="Historial" sub="Registro de eventos del sistema" />
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Evento</th><th>Descripción</th></tr></thead>
        <tbody>
          {DB.history.slice(0, 200).map(h => <tr key={h.id}><td>{fmtDateTime(h.timestamp)}</td><td>{h.user}</td><td><Badge cls="b-blue">{h.event}</Badge></td><td>{h.description}</td></tr>)}
          {!DB.history.length && <Empty cols={4}>Sin eventos</Empty>}
        </tbody>
      </table></div>
    </>
  );
}
function exportCSV() {
  const header = ['Fecha', 'Colaborador', 'Habitacion', 'Piso', 'Inicio', 'Fin', 'Duracion_min', 'Tiempo_esperado_min', 'Diferencia_min', 'Lat_inicio', 'Lng_inicio', 'Lat_final', 'Lng_final', 'Estado', 'Novedad'];
  const rows = DB.cleaningSessions.map(s => {
    const r = roomById(s.roomId), e = empById(s.employeeId), inc = DB.incidents.find(i => i.sessionId === s.id);
    return [fmtDate(s.startTime), e ? e.name : '', r ? r.number : '', r ? r.floor : '', fmtTime(s.startTime), s.endTime ? fmtTime(s.endTime) : '',
      (s.status === 'FINALIZADA' ? s.durationSeconds / 60 : Timer.elapsedSeconds(s.startTime) / 60).toFixed(1), s.estimatedMinutes,
      s.status === 'FINALIZADA' ? (s.diffSeconds / 60).toFixed(1) : '', s.gpsStart ? s.gpsStart.lat : '', s.gpsStart ? s.gpsStart.lng : '',
      s.gpsEnd ? s.gpsEnd.lat : '', s.gpsEnd ? s.gpsEnd.lng : '', s.status, inc ? inc.type : ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const blob = new Blob(['﻿' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'aquamare_housekeeping_reporte.csv'; a.click();
  URL.revokeObjectURL(url); toast('CSV exportado', 'ok');
}
function ReportsView({ go }) {
  return (
    <>
      <Topbar title="Reportes" sub="Exportación de información" />
      <div className="card" style={{ maxWidth: 480 }}>
        <p className="small muted" style={{ marginBottom: 16 }}>Genera un archivo CSV con todos los registros de limpieza (fecha, colaborador, habitación, tiempos, GPS, estado y novedades) o imprime el reporte actual.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn btn-primary" onClick={exportCSV}>⬇️ Exportar CSV</button>
          <button className="btn" onClick={() => window.print()}>🖨️ Imprimir</button>
          <button className="btn" onClick={() => go('cleanings')}>🧾 Ver todos los registros</button>
        </div>
      </div>
    </>
  );
}
function SettingsView() {
  const s = DB.settings;
  const [f, setF] = useState({ normal: s.normalMinutes, special: s.specialMinutes, tol: s.tolerance, yellow: s.yellowLimit, red: s.redLimit, gps: !!s.gpsRequired, photo: !!s.photoRequired });
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = () => {
    Object.assign(DB.settings, { normalMinutes: parseInt(f.normal) || 30, specialMinutes: parseInt(f.special) || 50, tolerance: parseInt(f.tol) || 5,
      yellowLimit: parseInt(f.yellow) || 10, redLimit: parseInt(f.red) || 10, gpsRequired: f.gps, photoRequired: f.photo });
    commit('settings', DB.settings); toast('Configuración guardada', 'ok');
  };
  return (
    <>
      <Topbar title="Configuración" sub="Parámetros generales del sistema" />
      <div className="card" style={{ maxWidth: 560 }}>
        <div className="grid2">
          <Field label="Tiempo estándar habitación normal (min)"><input type="number" value={f.normal} onChange={set('normal')} /></Field>
          <Field label="Tiempo estándar habitación especial (min)"><input type="number" value={f.special} onChange={set('special')} /></Field>
          <Field label="Tolerancia (min)"><input type="number" value={f.tol} onChange={set('tol')} /></Field>
          <Field label="Límite amarillo (min por encima)"><input type="number" value={f.yellow} onChange={set('yellow')} /></Field>
          <Field label="Límite rojo (min por encima)"><input type="number" value={f.red} onChange={set('red')} /></Field>
        </div>
        <div className="field"><label><input type="checkbox" checked={f.gps} onChange={set('gps')} /> GPS obligatorio al iniciar/finalizar</label></div>
        <div className="field"><label><input type="checkbox" checked={f.photo} onChange={set('photo')} /> Fotografía obligatoria para reportar novedad</label></div>
        <button className="btn btn-primary" onClick={save}>Guardar configuración</button>
        <div className="divider"></div>
        <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => { if (confirm('¿Borrar TODOS los datos (habitaciones, colaboradores, historial, etc.)? Solo quedará el administrador principal (admin / 1234). Esta acción no se puede deshacer.')) resetDatabase(); }}>Borrar todos los datos</button>
      </div>
    </>
  );
}
