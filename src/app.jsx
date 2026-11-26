/* ==================== LOGIN + RAÍZ ==================== */
function LoginScreen({ onLogin }) {
  const [supervisor, setSupervisor] = useState(APP_MODE === 'supervisor');
  const [user, setUser] = useState(''), [pass, setPass] = useState(''), [err, setErr] = useState('');
  const reveal = useSecretTap(useCallback(() => { if (!APP_MODE) { setSupervisor(true); setErr(''); } }, []));
  const aseo = APP_MODE === 'aseo';
  const submit = e => {
    e.preventDefault();
    const sess = Auth.login(user.trim(), pass, supervisor ? 'supervisor' : 'normal', APP_MODE ? APP_ROLES[APP_MODE] : null);
    if (!sess) { setErr(aseo ? 'Código o documento incorrecto.' : 'Usuario o contraseña incorrectos.'); return; }
    onLogin(sess);
  };
  const title = supervisor ? 'Acceso de supervisión' : aseo ? 'Personal de aseo' : APP_MODE === 'admin' ? 'Recepción · Administración' : 'Control de Limpieza Hotelera';
  return (
    <div id="loginScreen">
      <div className="login-box">
        <Logo sub="HOUSEKEEPING CONTROL" onClick={reveal} />
        <div className="login-title">{title}</div>
        <form className="card login-card glow" onSubmit={submit}>
          <Field label={supervisor ? 'Usuario supervisor' : aseo ? 'Cédula o correo' : 'Usuario / Cédula / Correo'}>
            <input value={user} onChange={e => setUser(e.target.value)} placeholder={supervisor ? 'usuario VL' : aseo ? 'tu cédula o correo' : 'admin, cédula o correo'} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          </Field>
          <Field label={aseo ? 'Código de acceso' : 'Contraseña'}><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" /></Field>
          <button className="btn btn-primary btn-lg" type="submit">{supervisor ? 'ENTRAR COMO SUPERVISOR' : aseo ? 'ENTRAR' : 'INICIAR SESIÓN'}</button>
          <div className="login-err">{err}</div>
          {aseo && <div className="demo-hint">Tu código te lo asigna el administrador o el supervisor.</div>}
          {supervisor && !APP_MODE && <div className="login-switch"><button type="button" className="btn btn-sm btn-ghost" onClick={() => { setSupervisor(false); setErr(''); }}>← Volver al acceso normal</button></div>}
          {!supervisor && !aseo && <div className="demo-hint"><b>Administrador inicial:</b> admin / 1234<br />Cambie la contraseña desde «Usuarios» apenas ingrese.</div>}
        </form>
        <InstallCard />
      </div>
    </div>
  );
}

function Root() {
  const [ready, setReady] = useState(false);
  const [, setTick] = useState(0);
  // Una sesión de otro rol no se usa en esta URL: cada interfaz exige su propio inicio de sesión.
  const [session, setSession] = useState(() => { const s = Auth.current(); return s && roleAllowed(s.role) ? s : null; });
  const [modal, setModal] = useState(null);

  useEffect(() => {
    _bump = () => setTick(t => t + 1);
    _setModal = setModal;
    loadData().then(() => setReady(true));
  }, []);
  useEffect(() => { if (ready && session) return startLive(); }, [ready, !!session]);

  const logout = () => { QR.close(); Auth.logout(); setModal(null); setSession(null); };
  const login = s => setSession(s);

  if (!ready) return <div className="splash"><Logo light /><div>Conectando con la base de datos...</div></div>;

  let screen;
  if (!session) screen = <LoginScreen onLogin={login} />;
  else if (session.role === 'ADMIN') screen = <div id="appShell" style={{ display: 'block' }}><AdminApp session={session} onLogout={logout} /></div>;
  else if (session.role === 'VL') screen = <SupervisorApp session={session} onLogout={logout} />;
  else screen = <EmployeeApp session={session} onLogout={logout} />;
  return <>{screen}<Modal modal={modal} /><Toaster /></>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);

/* ---------- PWA: service worker de la app ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('No fue posible registrar el Service Worker', e));
  });
}
