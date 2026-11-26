/* ==================== SUPERVISOR (VL) ==================== */
function usePushRegistration(session) {
  const initial = !('Notification' in window) ? 'unsupported' : (Notification.permission === 'denied' ? 'denied' : 'pending');
  const [status, setStatus] = useState(initial);
  const enable = useCallback(async () => setStatus(await registerPush(session)), [session.username]);
  useEffect(() => { if ('Notification' in window && Notification.permission === 'granted') enable(); }, [enable]);
  return { status, enable };
}

function PushBanner({ status, enable, text }) {
  if (status === 'pending') return (
    <div className="banner banner-info">🔔 {text}<button className="btn btn-sm btn-primary" onClick={enable}>Activar notificaciones</button></div>);
  if (status === 'denied') return <div className="banner banner-warn">🔕 Las notificaciones están bloqueadas en este navegador. La app sigue funcionando; para recibir avisos, permítelas en los ajustes del sitio.</div>;
  if (status === 'unsupported' && !('Notification' in window)) return <div className="banner banner-warn">Este navegador no admite notificaciones. En iPhone instala la app en la pantalla de inicio (iOS 16.4 o superior).</div>;
  if (status === 'granted') return <div className="small muted" style={{ marginBottom: 10 }}>🔔 Notificaciones activas en este dispositivo.</div>;
  return null;
}

/* El supervisor también crea/edita al personal de aseo y le asigna su código de acceso. */
function StaffPanel() {
  return (
    <>
      <div className="flex-between" style={{ marginBottom: 12 }}>
        <div className="sup-sub" style={{ margin: 0 }}>{DB.employees.length} colaborador(es) de aseo</div>
        <button className="btn btn-primary btn-sm" onClick={() => openModal(<EmpForm canDelete={false} />)}>+ Nuevo colaborador</button>
      </div>
      <div className="sup-grid">
        {DB.employees.map(e => (
          <div className="card" key={e.id}>
            <div className="flex-between"><b>{e.name}</b><Badge cls={e.status === 'ACTIVA' || e.status === 'EN TURNO' ? 'b-green' : 'b-gray'}>{e.status}</Badge></div>
            <div className="small muted" style={{ margin: '6px 0 10px' }}>Doc.: {e.document || '-'} · Turno: {e.shift || '-'}<br />Código: {e.password ? '✅ asignado' : '⚠️ sin código'}</div>
            <button className="btn btn-sm" onClick={() => openModal(<EmpForm id={e.id} canDelete={false} />)}>Editar / asignar código</button>
          </div>
        ))}
        {!DB.employees.length && <div className="card empty-state">Aún no hay colaboradores.</div>}
      </div>
    </>
  );
}

function SupervisorApp({ session, onLogout }) {
  const { status, enable } = usePushRegistration(session);
  const [tab, setTab] = useState('verify');
  useTick(30000);
  useEffect(() => { autoCheckout(); const t = setInterval(autoCheckout, 30000); return () => clearInterval(t); }, []);
  const toClean = DB.rooms.filter(r => r.status === 'PENDIENTE DE LIMPIEZA').length;
  const pending = DB.rooms.filter(r => r.status === 'EN VERIFICACIÓN')
    .map(r => ({ r, s: lastFinishedSession(r.id) }))
    .sort((a, b) => new Date(a.s?.endTime || 0) - new Date(b.s?.endTime || 0));
  return (
    <div className="sup-wrap">
      <div className="sup-head">
        <Logo small sub="SUPERVISOR" />
        <div className="tag-row"><InstallButton label="Instalar" /><button className="btn btn-sm" onClick={onLogout}>Salir</button></div>
      </div>
      <div className="radio-row" style={{ marginBottom: 14 }}>
        <button className={'btn btn-pill' + (tab === 'verify' ? ' btn-primary' : '')} onClick={() => setTab('verify')}>🔎 Verificación ({pending.length})</button>
        <button className={'btn btn-pill' + (tab === 'services' ? ' btn-primary' : '')} onClick={() => setTab('services')}>🧹 Servicios ({toClean})</button>
        <button className={'btn btn-pill' + (tab === 'staff' ? ' btn-primary' : '')} onClick={() => setTab('staff')}>👥 Personal de aseo</button>
      </div>
      {tab === 'services' ? <><div className="sup-title">Servicios de limpieza</div><div className="sup-sub">Asigna las habitaciones por limpiar al personal disponible</div><CleaningBoard /></>
      : tab === 'staff' ? <StaffPanel /> : <>
      <div className="sup-title">Verificación de habitaciones</div>
      <div className="sup-sub"><span className="pulse-dot"></span>En vivo · {session.name} · {pending.length} por verificar</div>

      <PushBanner status={status} enable={enable} text="Activa las notificaciones para enterarte de cada habitación lista, incluso con la app cerrada." />

      {pending.length === 0 && <div className="card empty-state">✅ No hay habitaciones esperando verificación.</div>}
      <div className="sup-grid">
        {pending.map(({ r, s }) => <VerifyCard key={r.id} room={r} session={s} />)}
      </div>
      </>}
    </div>
  );
}

function VerifyCard({ room, session }) {
  const [busy, setBusy] = useState(false);
  const emp = session ? empById(session.employeeId) : null;
  const ts = session ? timeStatus(session.diffSeconds, DB.settings) : null;
  const run = async fn => {
    setBusy(true);
    try { return await fn(); } finally { setBusy(false); }
  };
  const approve = () => run(async () => {
    const ok = await approveRoom(room.id);
    if (ok !== null) toast(ok ? '✅ Habitación ' + room.number + ' aprobada: disponible' : 'Otra persona ya resolvió esta habitación.', ok ? 'ok' : 'warn');
  });
  return (
    <div className="card sup-room">
      <div className="flex-between"><div className="num">{room.number}</div><StatusBadge status={room.status} /></div>
      <div className="meta">
        Piso {room.floor} · {room.category}<br />
        Limpió: <b>{emp ? emp.name : '-'}</b><br />
        {session && <>Terminó: {fmtTime(session.endTime)} · {Timer.format(session.durationSeconds)} <Badge cls={ts.cls}>{ts.dot} {Math.round(session.diffSeconds / 60) >= 0 ? '+' : ''}{Math.round(session.diffSeconds / 60)} min</Badge></>}
      </div>
      <div className="sup-actions">
        <button className="btn btn-ok" disabled={busy} onClick={approve}>✅ Aprobar</button>
        <button className="btn btn-danger" disabled={busy} onClick={() => openModal(<RejectForm room={room} />)}>↩️ Rechazar</button>
        <button className="btn full" disabled={busy} onClick={() => openModal(<NoteForm room={room} />)}>📝 Agregar novedad</button>
      </div>
    </div>
  );
}

function RejectForm({ room }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const ok = await rejectRoom(room.id, reason.trim());
    closeModal();
    if (ok !== null) toast(ok ? '↩️ Habitación ' + room.number + ' devuelta a limpieza' : 'Otra persona ya resolvió esta habitación.', ok ? 'ok' : 'warn');
  };
  return (
    <>
      <h2>Rechazar habitación {room.number}</h2>
      <p className="small muted" style={{ marginBottom: 12 }}>Vuelve a «En limpieza» y el colaborador la verá de nuevo en su lista, con tu motivo.</p>
      <Field label="Motivo (opcional)"><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej.: faltan toallas, baño sin repasar..." /></Field>
      <button className="btn btn-danger btn-lg" disabled={busy} onClick={go}>Rechazar y devolver</button>
    </>
  );
}

function NoteForm({ room }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    if (!text.trim()) { toast('Escribe la novedad', 'err'); return; }
    setBusy(true);
    await addVerificationNote(room.id, text.trim());
    closeModal(); toast('Novedad registrada', 'ok');
  };
  return (
    <>
      <h2>Novedad · Habitación {room.number}</h2>
      <Field label="Descripción"><textarea value={text} onChange={e => setText(e.target.value)} placeholder="Describe lo observado en la verificación..." autoFocus /></Field>
      <button className="btn btn-primary btn-lg" disabled={busy} onClick={save}>Guardar novedad</button>
    </>
  );
}
