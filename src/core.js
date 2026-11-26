'use strict';
/* ==================== CONFIG ==================== */
const CFG = {
  storageKey: 'aquamarHousekeepingDB_v1',
  sessionKey: 'ccHousekeepingSession_v1',
  supabaseUrl: 'https://gfqukwxiaftxppjcdtjz.supabase.co',
  supabaseAnonKey: 'sb_publishable_n7qmek6Z55maBOztUoomVg__NbSJ4dS',
  firebase: {
    apiKey: 'AIzaSyA6m1FFeRtDhqgzwASpHSZinLVF897za3s',
    authDomain: 'house-53644.firebaseapp.com',
    projectId: 'house-53644',
    storageBucket: 'house-53644.firebasestorage.app',
    messagingSenderId: '144124364159',
    appId: '1:144124364159:web:e9b662d0bb45b7f79d864a',
    measurementId: 'G-3EH6TPNP8Q'
  },
  vapidKey: 'BHfCJCdxVt12AC6Z7L85cQfCaS95KNC1i_7cTHerFxiA8CW-NR-DRCiyXGifcwvKy3omcG0Cw9rpmdHzJNjB0Zw',
  pollMs: 15000
};

/* Interfaz según la URL: ?app=aseo | supervisor | admin  (?view=supervisor es el enlace de las push). */
const APP_ROLES = { aseo: 'EMPLEADA', supervisor: 'VL', admin: 'ADMIN' };
const APP_MODE = (() => {
  const p = new URLSearchParams(location.search), v = p.get('app') || p.get('view') || (p.get('r') || p.get('room') ? 'aseo' : null);
  return APP_ROLES[v] ? v : null;
})();
const roleAllowed = role => !APP_MODE || APP_ROLES[APP_MODE] === role;

const ROOM_STATUSES = ['DISPONIBLE', 'OCUPADA', 'PENDIENTE DE LIMPIEZA', 'EN LIMPIEZA', 'LIMPIA', 'EN VERIFICACIÓN', 'FUERA DE SERVICIO'];
const STATUS_BADGE = {
  'DISPONIBLE': 'b-blue', 'OCUPADA': 'b-orange', 'PENDIENTE DE LIMPIEZA': 'b-yellow', 'EN LIMPIEZA': 'b-violet',
  'LIMPIA': 'b-green', 'EN VERIFICACIÓN': 'b-yellow', 'FUERA DE SERVICIO': 'b-red'
};

/* ==================== UI BRIDGE (React <-> lógica) ==================== */
let _bump = () => {};
let _setModal = () => {};
let _toastListeners = [];
function refresh() { _bump(); }
function openModal(node, wide) { _setModal({ node, wide: !!wide }); }
function closeModal() { _setModal(null); }
function toast(msg, type) {
  const t = { id: Math.random().toString(36).slice(2), msg, type: type || 'ok' };
  _toastListeners.forEach(fn => fn(t));
}

/* ==================== SUPABASE ==================== */
let sbClient = null;
let CLOUD_ONLINE = false;
/* Columnas añadidas por migration-2026-10-19-recepcion.sql (la app sigue funcionando sin ellas). */
const NEW_COLUMNS = { rooms: ['check_in', 'check_out', 'assigned_to'], employees: ['cleaning_role'] };
const isMissingColumn = e => !!e && (e.code === 'PGRST204' || e.code === '42703' || /column|schema cache/i.test(e.message || ''));
try {
  if (window.supabase && CFG.supabaseUrl && CFG.supabaseAnonKey) {
    sbClient = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  }
} catch (e) { console.warn('No fue posible inicializar el cliente Supabase', e); }

const Cloud = {
  pending: 0,
  tables: ['hotel', 'floors', 'rooms', 'employees', 'users', 'assignments', 'cleaning_sessions', 'incidents', 'history', 'settings', 'inventory_items', 'inventory_checks'],

  toRow(entity, obj) {
    switch (entity) {
      case 'hotel': return { id: 'main', name: obj.name, floors_count: obj.floorsCount, rooms_count: obj.roomsCount };
      case 'floors': return { id: obj.id, name: obj.name, number: obj.number, rooms_count: obj.roomsCount };
      case 'rooms': return { id: obj.id, number: obj.number, floor: obj.floor, type: obj.type, category: obj.category,
        estimated_minutes: obj.estimatedMinutes, status: obj.status, qr: obj.qr, nfc: obj.nfc, notes: obj.notes, active: obj.active,
        check_in: obj.checkIn || null, check_out: obj.checkOut || null, assigned_to: obj.assignedTo || null };
      case 'employees': return { id: obj.id, name: obj.name, document: obj.document, phone: obj.phone, email: obj.email,
        position: obj.position, shift: obj.shift, floor: obj.floor, status: obj.status, photo: obj.photo, password: obj.password || null,
        cleaning_role: obj.cleaningRole !== false };
      case 'users': return { username: obj.username, password: obj.password, role: obj.role, name: obj.name, employee_id: obj.employeeId || null };
      case 'assignments': return { id: obj.id, employee_id: obj.employeeId, room_ids: obj.roomIds };
      case 'cleaning_sessions': return { id: obj.id, room_id: obj.roomId, employee_id: obj.employeeId, start_time: obj.startTime,
        end_time: obj.endTime, estimated_minutes: obj.estimatedMinutes, gps_start: obj.gpsStart, gps_end: obj.gpsEnd,
        status: obj.status, duration_seconds: obj.durationSeconds, diff_seconds: obj.diffSeconds };
      case 'incidents': return { id: obj.id, session_id: obj.sessionId || null, room_id: obj.roomId, employee_id: obj.employeeId || null,
        type: obj.type, description: obj.description, photo: obj.photo, gps: obj.gps, timestamp: obj.timestamp };
      case 'history': return { id: obj.id, timestamp: obj.timestamp, user_name: obj.user, event: obj.event, description: obj.description };
      case 'settings': return { id: 'main', normal_minutes: obj.normalMinutes, special_minutes: obj.specialMinutes,
        presidential_minutes: obj.presidentialMinutes, tolerance: obj.tolerance, yellow_limit: obj.yellowLimit,
        red_limit: obj.redLimit, gps_required: obj.gpsRequired, photo_required: obj.photoRequired };
      case 'inventory_items': return { id: obj.id, name: obj.name, category: obj.category, expected_qty: obj.expectedQty,
        room_categories: obj.roomCategories || [], active: obj.active !== false, sort_order: obj.sortOrder || 0 };
      case 'inventory_checks': return { id: obj.id, room_id: obj.roomId, session_id: obj.sessionId || null, employee_id: obj.employeeId || null,
        timestamp: obj.timestamp, items: obj.items, differences: obj.differences, changes: obj.changes, notes: obj.notes || null };
      default: return obj;
    }
  },
  fromRow(entity, row) {
    switch (entity) {
      case 'hotel': return { name: row.name, floorsCount: row.floors_count, roomsCount: row.rooms_count };
      case 'floors': return { id: row.id, name: row.name, number: row.number, roomsCount: row.rooms_count };
      case 'rooms': return { id: row.id, number: row.number, floor: row.floor, type: row.type, category: row.category,
        estimatedMinutes: row.estimated_minutes, status: row.status, qr: row.qr, nfc: row.nfc, notes: row.notes, active: row.active,
        checkIn: row.check_in, checkOut: row.check_out, assignedTo: row.assigned_to };
      case 'employees': return { id: row.id, name: row.name, document: row.document, phone: row.phone, email: row.email,
        position: row.position, shift: row.shift, floor: row.floor, status: row.status, photo: row.photo, password: row.password,
        cleaningRole: row.cleaning_role !== false };
      case 'users': return { username: row.username, password: row.password, role: row.role, name: row.name, employeeId: row.employee_id };
      case 'assignments': return { id: row.id, employeeId: row.employee_id, roomIds: row.room_ids || [] };
      case 'cleaning_sessions': return { id: row.id, roomId: row.room_id, employeeId: row.employee_id, startTime: row.start_time,
        endTime: row.end_time, estimatedMinutes: row.estimated_minutes, gpsStart: row.gps_start, gpsEnd: row.gps_end,
        status: row.status, durationSeconds: row.duration_seconds, diffSeconds: row.diff_seconds };
      case 'incidents': return { id: row.id, sessionId: row.session_id, roomId: row.room_id, employeeId: row.employee_id,
        type: row.type, description: row.description, photo: row.photo, gps: row.gps, timestamp: row.timestamp };
      case 'history': return { id: row.id, timestamp: row.timestamp, user: row.user_name, event: row.event, description: row.description };
      case 'settings': return { normalMinutes: row.normal_minutes, specialMinutes: row.special_minutes,
        presidentialMinutes: row.presidential_minutes, tolerance: row.tolerance, yellowLimit: row.yellow_limit,
        redLimit: row.red_limit, gpsRequired: row.gps_required, photoRequired: row.photo_required };
      case 'inventory_items': return { id: row.id, name: row.name, category: row.category, expectedQty: row.expected_qty,
        roomCategories: row.room_categories || [], active: row.active !== false, sortOrder: row.sort_order || 0 };
      case 'inventory_checks': return { id: row.id, roomId: row.room_id, sessionId: row.session_id, employeeId: row.employee_id,
        timestamp: row.timestamp, items: row.items || [], differences: row.differences || 0, changes: row.changes || 0, notes: row.notes };
      default: return row;
    }
  },

  async fetchAll() {
    if (!sbClient) return null;
    try {
      const q = [
        sbClient.from('hotel').select('*').eq('id', 'main').maybeSingle(),
        sbClient.from('floors').select('*'),
        sbClient.from('rooms').select('*'),
        sbClient.from('employees').select('*'),
        sbClient.from('users').select('*'),
        sbClient.from('assignments').select('*'),
        sbClient.from('cleaning_sessions').select('*'),
        sbClient.from('incidents').select('*'),
        sbClient.from('history').select('*').order('timestamp', { ascending: false }).limit(500),
        sbClient.from('settings').select('*').eq('id', 'main').maybeSingle()
      ];
      const [hotel, floors, rooms, employees, users, assignments, sessions, incidents, history, settings] = await Promise.all(q);
      const anyError = [hotel, floors, rooms, employees, users, assignments, sessions, incidents, history, settings].find(r => r.error);
      if (anyError) { console.warn('Supabase fetch error', anyError.error); return null; }
      // Inventario: si su SQL aún no se ha corrido, la app sigue funcionando sin él.
      const [invItems, invChecks] = await Promise.all([
        sbClient.from('inventory_items').select('*'),
        sbClient.from('inventory_checks').select('*').order('timestamp', { ascending: false }).limit(300)
      ]);
      if (invItems.error || invChecks.error) console.warn('Inventario no disponible en la nube', invItems.error || invChecks.error);
      CLOUD_ONLINE = true;
      return {
        hotel: hotel.data ? Cloud.fromRow('hotel', hotel.data) : null,
        floors: (floors.data || []).map(r => Cloud.fromRow('floors', r)),
        rooms: (rooms.data || []).map(r => Cloud.fromRow('rooms', r)),
        employees: (employees.data || []).map(r => Cloud.fromRow('employees', r)),
        users: (users.data || []).map(r => Cloud.fromRow('users', r)),
        assignments: (assignments.data || []).map(r => Cloud.fromRow('assignments', r)),
        cleaningSessions: (sessions.data || []).map(r => Cloud.fromRow('cleaning_sessions', r)),
        incidents: (incidents.data || []).map(r => Cloud.fromRow('incidents', r)),
        history: (history.data || []).map(r => Cloud.fromRow('history', r)),
        settings: settings.data ? Cloud.fromRow('settings', settings.data) : null,
        inventoryItems: invItems.error ? null : (invItems.data || []).map(r => Cloud.fromRow('inventory_items', r)),
        inventoryChecks: invChecks.error ? null : (invChecks.data || []).map(r => Cloud.fromRow('inventory_checks', r))
      };
    } catch (e) { console.warn('Supabase no disponible, modo local.', e); CLOUD_ONLINE = false; return null; }
  },

  lastError: '',
  explain(e) {
    const m = (e && e.message) || String(e || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión con la nube. Revisa el internet e inténtalo de nuevo.';
    if (e && (e.code === '23505' || /duplicate key/i.test(m))) return 'Ya existe otro registro con el mismo código (número, QR o NFC).';
    if (e && (e.code === '23502' || /not-null/i.test(m))) return 'Falta un dato obligatorio (por ejemplo el piso).';
    if (e && (e.code === '23514' || /check constraint/i.test(m))) return /rooms_status_check/.test(m)
      ? 'La base de datos no acepta ese estado de habitación. Ejecuta supabase/fix-2026-11-25-estado-ocupada.sql en Supabase.'
      : 'La base de datos rechazó un valor no permitido (' + m + ').';
    return m;
  },
  /* Devuelve true si quedó guardado en la nube. opts.quiet evita el aviso genérico (el llamador muestra el suyo). */
  async upsert(entity, obj, opts) {
    if (!sbClient) return true;
    const quiet = !!(opts && opts.quiet);
    Cloud.pending++;
    try {
      const row = Cloud.toRow(entity, obj);
      const conflictCol = entity === 'users' ? 'username' : 'id';
      let { error } = await sbClient.from(entity).upsert(row, { onConflict: conflictCol });
      // Compatibilidad: si la migración SQL aún no se corrió, se guardan solo las columnas anteriores.
      if (error && isMissingColumn(error) && NEW_COLUMNS[entity]) {
        const legacy = { ...row }; NEW_COLUMNS[entity].forEach(c => delete legacy[c]);
        ({ error } = await sbClient.from(entity).upsert(legacy, { onConflict: conflictCol }));
      }
      if (error) throw error;
      CLOUD_ONLINE = true;
      Cloud.lastError = '';
      return true;
    } catch (e) {
      console.warn('Error sincronizando con Supabase (' + entity + ')', e);
      Cloud.lastError = Cloud.explain(e);
      // Con código = la nube RECHAZÓ el dato (no es falta de conexión): se dice el motivo real.
      if (!quiet) toast(e && e.code ? '⚠️ La nube rechazó el cambio: ' + Cloud.lastError : '⚠️ Cambio guardado localmente. Sin conexión con la nube.', 'warn');
      return false;
    } finally { Cloud.pending--; }
  },
  async remove(entity, id, idCol) {
    if (!sbClient) return;
    Cloud.pending++;
    try {
      const { error } = await sbClient.from(entity).delete().eq(idCol || 'id', id);
      if (error) throw error;
    } catch (e) { console.warn('Error eliminando (' + entity + ')', e); toast('⚠️ No se pudo eliminar en la nube.', 'warn'); }
    finally { Cloud.pending--; }
  },
  async clearAll() {
    if (!sbClient) return;
    for (const t of Cloud.tables) {
      try { await sbClient.from(t).delete().neq(t === 'users' ? 'username' : 'id', '___none___'); } catch (e) { console.warn('Error limpiando tabla', t, e); }
    }
  },
  async pushAll(dbObj) {
    if (!sbClient) return;
    try {
      await sbClient.from('hotel').upsert(Cloud.toRow('hotel', dbObj.hotel), { onConflict: 'id' });
      await sbClient.from('settings').upsert(Cloud.toRow('settings', dbObj.settings), { onConflict: 'id' });
      const bulk = async (table, list, conflict) => {
        if (list.length) await sbClient.from(table).upsert(list.map(r => Cloud.toRow(table, r)), { onConflict: conflict });
      };
      await bulk('floors', dbObj.floors, 'id');
      await bulk('employees', dbObj.employees, 'id');
      await bulk('rooms', dbObj.rooms, 'id');
      await bulk('users', dbObj.users, 'username');
      await bulk('assignments', dbObj.assignments, 'id');
      await bulk('cleaning_sessions', dbObj.cleaningSessions, 'id');
      await bulk('incidents', dbObj.incidents, 'id');
      await bulk('history', dbObj.history, 'id');
      await bulk('inventory_items', dbObj.inventoryItems || [], 'id');
      await bulk('inventory_checks', dbObj.inventoryChecks || [], 'id');
      CLOUD_ONLINE = true;
    } catch (e) { console.warn('Error subiendo datos iniciales a Supabase', e); }
  }
};

/* ==================== BASE DE DATOS EN MEMORIA ==================== */
const DB_KEYS = ['hotel', 'floors', 'rooms', 'employees', 'users', 'assignments', 'cleaningSessions', 'incidents', 'gpsLogs', 'history', 'settings', 'inventoryItems', 'inventoryChecks'];
let DB = {};

function applyCloud(cloud) {
  DB = { hotel: cloud.hotel || {}, floors: cloud.floors, rooms: cloud.rooms, employees: cloud.employees,
    users: cloud.users, assignments: cloud.assignments, cleaningSessions: cloud.cleaningSessions,
    incidents: cloud.incidents, gpsLogs: [], history: cloud.history, settings: cloud.settings || {},
    inventoryItems: cloud.inventoryItems || DB.inventoryItems || [], inventoryChecks: cloud.inventoryChecks || DB.inventoryChecks || [] };
  try { localStorage.setItem(CFG.storageKey, JSON.stringify(DB)); } catch (e) {}
}
async function loadData() {
  const cloud = await Cloud.fetchAll();
  if (cloud && cloud.users && cloud.users.length) {
    applyCloud(cloud);
  } else {
    try {
      const raw = localStorage.getItem(CFG.storageKey);
      if (raw) { DB = JSON.parse(raw); } else { initEmptyData(); }
    } catch (e) { console.error('Error cargando datos, reiniciando', e); initEmptyData(); }
    saveData();
    if (sbClient && cloud) await Cloud.pushAll(DB);
  }
  DB_KEYS.forEach(k => { if (!(k in DB)) DB[k] = (k === 'settings' || k === 'hotel') ? {} : []; });
}
/* Refresca desde la nube sin pisar escrituras locales todavía en vuelo. */
async function syncFromCloud() {
  if (!sbClient || Cloud.pending > 0) return;
  const cloud = await Cloud.fetchAll();
  if (cloud && cloud.users && cloud.users.length && Cloud.pending === 0) { applyCloud(cloud); refresh(); }
}
function saveData() { try { localStorage.setItem(CFG.storageKey, JSON.stringify(DB)); } catch (e) {} }
function generateId(prefix) { return (prefix || 'ID') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
async function resetDatabase() {
  localStorage.removeItem(CFG.storageKey);
  await Cloud.clearAll();
  initEmptyData(); saveData();
  await Cloud.pushAll(DB);
  toast('Datos restablecidos. Se conservó únicamente el administrador principal.', 'ok');
  refresh();
}
function logHistory(user, event, description) {
  const entry = { id: generateId('HIST'), timestamp: new Date().toISOString(), user: user || 'sistema', event, description: description || '' };
  DB.history.unshift(entry);
  DB.history = DB.history.slice(0, 500);
  Cloud.upsert('history', entry);
}
function initEmptyData() {
  DB = { hotel: { name: 'Hotel', floorsCount: 0, roomsCount: 0 }, floors: [], rooms: [], employees: [], users: [], assignments: [],
    cleaningSessions: [], incidents: [], gpsLogs: [], history: [], inventoryItems: [], inventoryChecks: [],
    settings: { normalMinutes: 30, specialMinutes: 50, presidentialMinutes: 75, tolerance: 5, yellowLimit: 10, redLimit: 10, gpsRequired: true, photoRequired: false } };
  DB.users.push({ username: 'admin', password: '1234', role: 'ADMIN', name: 'Administrador' });
  logHistory('sistema', 'INICIALIZACIÓN', 'Base de datos inicializada.');
}
/* Guarda en local + nube y vuelve a pintar. */
function commit(entity, obj) { saveData(); if (entity) Cloud.upsert(entity, obj); refresh(); }

/* ==================== AUTH ==================== */
const Auth = {
  current() { try { return JSON.parse(sessionStorage.getItem(CFG.sessionKey) || localStorage.getItem(CFG.sessionKey)); } catch (e) { return null; } },
  /* mode 'normal': ADMIN y colaboradores. mode 'supervisor': solo rol VL. */
  login(username, password, mode, allowRole) {
    if (!username || !password) return null;
    const save = (sess, label) => {
      if (allowRole && sess.role !== allowRole) return null;
      localStorage.setItem(CFG.sessionKey, JSON.stringify(sess));
      logHistory(sess.username, 'LOGIN', 'Inicio de sesión de ' + label);
      saveData();
      return sess;
    };
    // Tolera lo que hacen los teclados de celular: mayúscula inicial y espacios al final.
    const uname = username.trim().toLowerCase(), pwd = password.trim();
    const u = DB.users.find(x => (x.username || '').trim().toLowerCase() === uname && (x.password || '').trim() === pwd);
    if (u) {
      const isVL = u.role === 'VL';
      if ((mode === 'supervisor') !== isVL) return null;
      return save({ username: u.username, role: u.role, name: u.name, employeeId: u.employeeId || null, loginAt: new Date().toISOString() }, u.name);
    }
    if (mode === 'supervisor') return null;
    const input = uname;
    const emp = DB.employees.find(e => e.password && e.password.trim() === pwd &&
      ((e.document && e.document.trim().toLowerCase() === input) || (e.email && e.email.trim().toLowerCase() === input)));
    if (emp) return save({ username: emp.document, role: 'EMPLEADA', name: emp.name, employeeId: emp.id, loginAt: new Date().toISOString() }, emp.name);
    return null;
  },
  logout() {
    const s = Auth.current();
    if (s) logHistory(s.username, 'LOGOUT', 'Cierre de sesión');
    saveData();
    localStorage.removeItem(CFG.sessionKey);
  }
};

/* ==================== UTILIDADES ==================== */
const Timer = {
  elapsedSeconds(startIso) { return Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000)); },
  format(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  },
  formatLong(totalSeconds) {
    totalSeconds = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(totalSeconds / 3600), m = Math.floor((totalSeconds % 3600) / 60), s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`;
  }
};
const GPS = {
  capture() {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0), timestamp: new Date().toISOString() }),
        () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
    });
  }
};
/* ==================== CÓDIGOS DE HABITACIÓN (QR / NFC) ==================== */
/* Los QR y TAG llevan un enlace a la app (…?app=aseo&room=ROOM-101): sirven con el escáner de la app
   y también con la cámara o el lector NFC nativo del celular (iPhone incluido), que abren la habitación. */
const appBase = () => location.origin + location.pathname.replace(/index\.html$/, '');
/* Enlace corto (?r=…): menos módulos en el QR → cuadros más grandes y lectura más fácil. */
const roomLink = code => appBase() + '?r=' + encodeURIComponent(code);
/* Acepta 'ROOM-101', 'NFC-ROOM-101', '101' o un enlace con ?room=… */
function parseRoomCode(raw) {
  let c = String(raw || '').trim();
  if (/^https?:\/\//i.test(c)) { try { const q = new URL(c).searchParams; c = q.get('r') || q.get('room') || c; } catch (e) {} }
  return c.trim().toUpperCase();
}
function findRoomByCode(raw) {
  const code = parseRoomCode(raw);
  if (!code) return null;
  return DB.rooms.find(r => (r.qr || '').toUpperCase() === code || (r.nfc || '').toUpperCase() === code)
    || (/^\d+$/.test(code) ? DB.rooms.find(r => String(r.number) === code) : null)
    || DB.rooms.find(r => String(r.number) === code.replace(/\D/g, '')) || null;
}

const QR = {
  stream: null, detecting: false, detector: null, scanCb: null, timer: null, canvas: null, engine: '', lastError: '',
  /* Estado del permiso de cámara: 'granted' | 'denied' | 'prompt' | 'unknown'. */
  async permission() {
    try { if (navigator.permissions && navigator.permissions.query) return (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) {}
    return 'unknown';
  },
  /* Devuelve { ok:true } o { ok:false, reason } (denied | nocamera | busy | insecure | unsupported | error). */
  async open(videoEl, onDetect) {
    QR.close();
    QR.lastError = '';
    if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return { ok: false, reason: 'unsupported' };
    try {
      try {
        QR.stream = await navigator.mediaDevices.getUserMedia({ audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      } catch (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
        QR.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });   // cámara sin requisitos
      }
      // Enfoque continuo si la cámara lo permite (muchas traseras no enfocan de cerca sin esto).
      const track = QR.stream.getVideoTracks()[0];
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch (e) {}
      videoEl.setAttribute('playsinline', ''); videoEl.setAttribute('autoplay', ''); videoEl.muted = true;
      videoEl.srcObject = QR.stream;
      await videoEl.play();
      QR.scanCb = onDetect;
      QR.detecting = true;
      QR.detector = null;
      if ('BarcodeDetector' in window) {
        try {
          const formats = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : ['qr_code'];
          if (formats.includes('qr_code')) QR.detector = new BarcodeDetector({ formats: ['qr_code'] });
        } catch (e) { QR.detector = null; }
      }
      if (!QR.detector && !window.jsQR) { QR.close(); return { ok: false, reason: 'unsupported' }; }
      QR.engine = QR.detector ? (window.jsQR ? 'nativo + respaldo' : 'nativo') : 'respaldo';
      QR.loop(videoEl);
      return { ok: true };
    } catch (e) {
      console.warn('Cámara no disponible', e);
      QR.close();
      QR.lastError = (e && (e.name + ': ' + e.message)) || String(e);
      const n = e && e.name;
      return { ok: false, reason: n === 'NotAllowedError' || n === 'SecurityError' ? 'denied'
        : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'nocamera' : n === 'NotReadableError' || n === 'AbortError' ? 'busy' : 'error' };
    }
  },
  /* ~8 lecturas por segundo. Usa el lector nativo y, si no encuentra nada (o falla), el de respaldo (jsQR):
     en varios Android el nativo existe pero devuelve vacío. */
  loop(v) {
    let n = 0, nativeErrors = 0;
    const tick = async () => {
      if (!QR.detecting) return;
      let text = null;
      if (v.readyState >= 2 && v.videoWidth) {
        n++;
        if (QR.detector) {
          try { text = await QR.detectNative(v); }
          catch (e) { if (++nativeErrors >= 3) { QR.detector = null; QR.engine = 'respaldo'; } }
        }
        if (!text && window.jsQR && (!QR.detector || n % 2 === 0)) { try { text = QR.detectJsQR(v); } catch (e) {} }
      }
      if (text && QR.detecting && QR.scanCb) { const cb = QR.scanCb; QR.close(); if (navigator.vibrate) navigator.vibrate(80); cb(text); return; }
      QR.timer = setTimeout(tick, 120);
    };
    tick();
  },
  async detectNative(v) { const c = await QR.detector.detect(v); return c && c[0] ? c[0].rawValue : null; },
  detectJsQR(v) {
    const scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
    const c = QR.canvas || (QR.canvas = document.createElement('canvas'));
    if (c.width !== w) c.width = w; if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const code = window.jsQR(img.data, w, h, { inversionAttempts: 'attemptBoth' });
    return code && code.data ? code.data : null;
  },
  close() {
    QR.detecting = false; QR.scanCb = null;
    if (QR.timer) { clearTimeout(QR.timer); QR.timer = null; }
    if (QR.stream) { QR.stream.getTracks().forEach(t => t.stop()); QR.stream = null; }
  },
  /* ---- Generación (librería qrcode-generator) ----
     Nivel Q (~25 % de corrección): se lee aunque la etiqueta esté rayada, con brillo o plastificada.
     Negro puro sobre blanco, módulos cuadrados y margen blanco de 4 módulos (lo que pide el estándar). */
  EC: 'Q', QUIET: 4,
  matrix(text) {
    if (!text || !window.qrcode) return null;
    const qr = window.qrcode(0, QR.EC); qr.addData(text); qr.make();
    return { n: qr.getModuleCount(), dark: (y, x) => qr.isDark(y, x) };
  },
  /* SVG vectorial: nítido en cualquier pantalla e impresora (sin pixelado ni bordes borrosos). */
  svg(text, size) {
    const m = QR.matrix(text);
    if (!m) return '';
    const q = QR.QUIET, total = m.n + q * 2;
    let d = '';
    for (let y = 0; y < m.n; y++) {
      for (let x = 0; x < m.n; x++) {
        if (!m.dark(y, x)) continue;
        let run = 1; while (x + run < m.n && m.dark(y, x + run)) run++;
        d += 'M' + (x + q) + ' ' + (y + q) + 'h' + run + 'v1h-' + run + 'z';
        x += run - 1;
      }
    }
    const dim = size ? ' width="' + size + '" height="' + size + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '"' + dim +
      ' shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="' + total + '" height="' + total + '" fill="#fff"/><path fill="#000" d="' + d + '"/></svg>';
  },
  /* Mapa de bits con módulos de tamaño entero (para descargar como PNG). */
  draw(canvas, text, px) {
    const ctx = canvas.getContext('2d');
    const m = QR.matrix(text);
    if (!m) { canvas.width = canvas.height = px || 200; ctx.clearRect(0, 0, canvas.width, canvas.height); return false; }
    const q = QR.QUIET, cell = Math.max(2, Math.floor((px || 600) / (m.n + q * 2)));
    canvas.width = canvas.height = (m.n + q * 2) * cell;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let y = 0; y < m.n; y++) for (let x = 0; x < m.n; x++) if (m.dark(y, x)) ctx.fillRect((x + q) * cell, (y + q) * cell, cell, cell);
    return true;
  },
  renderVisual(canvas, text) { return QR.draw(canvas, text, 600); },
  toDataURL(text, px) { const c = document.createElement('canvas'); QR.draw(c, text, px || 600); return c.toDataURL('image/png'); }
};

/* Etiquetas imprimibles (una o varias habitaciones): QR vectorial de 70 mm, número grande y ayuda corta. */
const escHtml = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function roomLabelHtml(r, logo) {
  return '<div class="lbl"><img class="logo" src="' + logo + '" alt="">' +
    '<div class="qr">' + QR.svg(roomLink(r.qr)) + '</div>' +
    '<div class="num"><small>HABITACIÓN</small>' + escHtml(r.number) + '</div>' +
    '<div class="how">Escanea con la app Aquamare o la cámara del celular</div>' +
    '<div class="code">' + escHtml(r.qr) + '</div></div>';
}
function printRoomLabels(rooms) {
  if (!window.qrcode) { toast('No se cargó el generador de QR. Revisa la conexión y recarga.', 'err'); return; }
  const logo = new URL('icons/logo-aquamare-navy.png', location.href).href;
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR habitaciones · Aquamare</title><style>' +
    '@page{size:A4;margin:10mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    'body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0b1220}' +
    '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}' +
    '.lbl{border:0.4mm dashed #b8c2d6;border-radius:4mm;padding:6mm 5mm 5mm;text-align:center;break-inside:avoid;page-break-inside:avoid}' +
    '.logo{height:11mm;display:block;margin:0 auto 3mm}' +
    '.qr{width:70mm;height:70mm;margin:0 auto}.qr svg{width:100%;height:100%;display:block}' +
    '.num{font-size:30pt;font-weight:800;color:#061045;line-height:1;margin-top:3mm}' +
    '.num small{display:block;font-size:8pt;letter-spacing:2.5pt;color:#5b6680;font-weight:700;margin-bottom:1mm}' +
    '.how{font-size:8.5pt;color:#1f2a44;margin-top:2.5mm}.code{font-size:7.5pt;color:#8a94a8;margin-top:1mm;letter-spacing:.5pt}' +
    '</style></head><body><div class="grid">' + rooms.map(r => roomLabelHtml(r, logo)).join('') + '</div></body></html>';
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(f);
  const d = f.contentDocument; d.open(); d.write(html); d.close();
  const imgs = [...d.images].map(i => i.complete ? Promise.resolve() : new Promise(res => { i.onload = i.onerror = res; }));
  Promise.all(imgs).then(() => setTimeout(() => {
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('No se pudo abrir la impresión: ' + e.message, 'err'); }
    setTimeout(() => f.remove(), 60000);
  }, 150));
}
/* Descarga la etiqueta completa en PNG de alta resolución (≈ 1200 × 1650 px): QR, número y logo. */
async function downloadRoomQr(room) {
  if (!window.qrcode) { toast('No se cargó el generador de QR. Revisa la conexión y recarga.', 'err'); return; }
  const W = 1200, H = 1650, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  try {
    const logo = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'icons/logo-aquamare-navy.png'; });
    const lh = 120, lw = logo.width * lh / logo.height; ctx.drawImage(logo, (W - lw) / 2, 70, lw, lh);
  } catch (e) {}
  const q = document.createElement('canvas'); QR.draw(q, roomLink(room.qr), 1000);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(q, (W - q.width) / 2, 230);
  const y = 230 + q.width + 40;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#5b6680'; ctx.font = '700 34px Arial, Helvetica, sans-serif'; ctx.fillText('H A B I T A C I Ó N', W / 2, y + 30);
  ctx.fillStyle = '#061045'; ctx.font = '800 150px Arial, Helvetica, sans-serif'; ctx.fillText(String(room.number), W / 2, y + 180);
  ctx.fillStyle = '#1f2a44'; ctx.font = '32px Arial, Helvetica, sans-serif'; ctx.fillText('Escanea con la app Aquamare o la cámara del celular', W / 2, y + 250);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png'); a.download = 'QR-habitacion-' + room.number + '.png';
  document.body.appendChild(a); a.click(); a.remove();
}

/* Web NFC: solo Chrome en Android. En iPhone el TAG se lee de forma nativa (abre el enlace grabado). */
const NFC = {
  ctrl: null,
  available() { return 'NDEFReader' in window; },
  stop() { if (NFC.ctrl) { try { NFC.ctrl.abort(); } catch (e) {} NFC.ctrl = null; } },
  decode(rec) {
    try {
      if (rec.recordType === 'text') return new TextDecoder(rec.encoding || 'utf-8').decode(rec.data);
      if (rec.recordType === 'url' || rec.recordType === 'absolute-url') return new TextDecoder().decode(rec.data);
      if (rec.data) return new TextDecoder().decode(rec.data);
    } catch (e) {}
    return null;
  },
  async read(onDetect) {
    if (!NFC.available()) return false;
    NFC.stop();
    const ctrl = new AbortController(); NFC.ctrl = ctrl;
    try {
      const reader = new NDEFReader();
      reader.onreading = ev => {
        if (ctrl.signal.aborted) return;
        const texts = [...ev.message.records].map(NFC.decode).filter(Boolean);
        const best = texts.find(t => findRoomByCode(t)) || texts[0] || ev.serialNumber || null;
        NFC.stop();
        if (navigator.vibrate) navigator.vibrate(80);
        onDetect(best);
      };
      reader.onreadingerror = () => toast('No se pudo leer el TAG. Acércalo de nuevo y mantenlo quieto un segundo.', 'warn');
      await reader.scan({ signal: ctrl.signal });
      return true;
    } catch (e) {
      NFC.ctrl = null;
      if (e && e.name === 'AbortError') return false;
      toast(e && e.name === 'NotAllowedError' ? 'Permiso de NFC denegado. Actívalo en los ajustes del sitio.' : 'No fue posible activar NFC: ' + (e.message || e), 'warn');
      return false;
    }
  },
  /* Graba el enlace (para iPhone y la cámara/lector nativo) y el código en texto (para la app). */
  async write(code) {
    if (!NFC.available()) { toast('Grabar TAG NFC solo funciona en Chrome para Android.', 'warn'); return false; }
    if (!code) { toast('Ingrese primero un código NFC para asignar', 'warn'); return false; }
    NFC.stop();
    try {
      const w = new NDEFReader();
      toast('Acerque el TAG NFC al teléfono para grabarlo...', 'warn');
      await w.write({ records: [{ recordType: 'url', data: roomLink(code) }, { recordType: 'text', data: code, lang: 'es' }] }, { overwrite: true });
      toast('TAG NFC grabado: ' + code, 'ok');
      return true;
    } catch (e) { toast('No fue posible grabar el TAG NFC: ' + (e.message || e), 'err'); return false; }
  }
};

function timeStatus(diffSeconds, settings) {
  const diffMin = diffSeconds / 60;
  if (diffMin <= 0) return { cls: 'b-green', dot: '🟢', label: Math.abs(Math.round(diffMin)) + ' min por debajo' };
  if (diffMin <= (settings.yellowLimit || 10)) return { cls: 'b-yellow', dot: '🟡', label: Math.round(diffMin) + ' min por encima' };
  return { cls: 'b-red', dot: '🔴', label: Math.round(diffMin) + ' min por encima' };
}
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('es-CO') : '-';
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour12: false }) : '-';
const fmtDateTime = iso => iso ? fmtDate(iso) + ' ' + fmtTime(iso) : '-';
const roomById = id => DB.rooms.find(r => r.id === id);
const empById = id => DB.employees.find(e => e.id === id);
const findActiveSessionByEmployee = id => DB.cleaningSessions.find(s => s.employeeId === id && s.status === 'EN_LIMPIEZA');
const findActiveSessionByRoom = id => DB.cleaningSessions.find(s => s.roomId === id && s.status === 'EN_LIMPIEZA');
const lastFinishedSession = roomId => DB.cleaningSessions
  .filter(s => s.roomId === roomId && s.status === 'FINALIZADA')
  .sort((a, b) => new Date(b.endTime) - new Date(a.endTime))[0];
function readFileAsDataURL(file) {
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
}

/* ==================== VERIFICACIÓN (supervisor VL) ==================== */
const ROOM_PATCH_COLS = { checkIn: 'check_in', checkOut: 'check_out', assignedTo: 'assigned_to' };
/* Cambia el estado solo si sigue en `from` (evita que dos personas se pisen). `patch` = otros campos
   de la habitación (checkIn, checkOut, assignedTo) que se guardan en la misma operación.
   Devuelve true (hecho), false (otra persona ya la cambió) o null (la nube lo rechazó; ya se avisó el motivo). */
async function transitionRoom(roomId, from, to, patch) {
  const room = roomById(roomId);
  if (!room) return false;
  patch = patch || {};
  const cols = { status: to };
  Object.keys(patch).forEach(k => { cols[ROOM_PATCH_COLS[k]] = patch[k] || null; });
  if (sbClient) {
    Cloud.pending++;
    try {
      let res = await sbClient.from('rooms').update(cols).eq('id', roomId).eq('status', from).select('id');
      if (res.error && isMissingColumn(res.error)) res = await sbClient.from('rooms').update({ status: to }).eq('id', roomId).eq('status', from).select('id');
      const { data, error } = res;
      if (error) throw error;
      if (!data || !data.length) { Cloud.pending--; await syncFromCloud(); Cloud.pending++; return false; }
    } catch (e) { console.warn('transitionRoom', e); toast('No se pudo actualizar la habitación: ' + Cloud.explain(e), 'err'); return null; }
    finally { Cloud.pending--; }
  } else if (room.status !== from) { return false; }
  room.status = to; Object.assign(room, patch); saveData(); refresh();
  return true;
}

/* ==================== RECEPCIÓN: ocupación, salida y servicios de limpieza ==================== */
const isoOrNull = v => (v ? new Date(v).toISOString() : null);
async function occupyRoom(roomId, checkIn, checkOut) {
  const ci = new Date(checkIn), co = new Date(checkOut);
  if (isNaN(ci) || isNaN(co)) { toast('Indique las horas de check-in y check-out', 'err'); return false; }
  if (co <= ci) { toast('El check-out debe ser posterior al check-in', 'err'); return false; }
  const ok = await transitionRoom(roomId, 'DISPONIBLE', 'OCUPADA', { checkIn: ci.toISOString(), checkOut: co.toISOString(), assignedTo: null });
  if (ok) { const s = Auth.current(); logHistory(s && s.username, 'CHECK-IN', 'Habitación ' + roomById(roomId).number + ' ocupada hasta ' + fmtDateTime(co.toISOString())); saveData(); refresh(); }
  else if (ok === false) toast('La habitación ya no está disponible.', 'warn');
  return ok;
}
/* Salida del huésped (manual o por hora vencida): la habitación pasa a limpieza y se avisa al aseo. */
async function checkoutRoom(roomId, auto) {
  const room = roomById(roomId);
  const ok = await transitionRoom(roomId, 'OCUPADA', 'PENDIENTE DE LIMPIEZA', auto ? {} : { checkOut: new Date().toISOString() });
  if (ok) { const s = Auth.current(); logHistory(auto ? 'sistema' : (s && s.username), auto ? 'CHECK-OUT AUTOMÁTICO' : 'CHECK-OUT', 'Habitación ' + room.number + ' pasa a limpieza'); saveData(); refresh(); }
  return ok;
}
async function autoCheckout() {
  const now = Date.now();
  for (const r of DB.rooms.filter(x => x.status === 'OCUPADA' && x.checkOut && new Date(x.checkOut).getTime() <= now)) await checkoutRoom(r.id, true);
}
const cleaningRoleOn = e => !!e && e.cleaningRole !== false && (e.status === 'ACTIVA' || e.status === 'EN TURNO');
/* Ocupado = tiene una limpieza en curso o ya tomó/le asignaron un servicio sin terminar. */
const isEmployeeBusy = (empId, exceptRoomId) => !!findActiveSessionByEmployee(empId) ||
  DB.rooms.some(r => r.id !== exceptRoomId && r.assignedTo === empId && (r.status === 'PENDIENTE DE LIMPIEZA' || r.status === 'EN LIMPIEZA'));
const availableCleaners = () => DB.employees.filter(e => cleaningRoleOn(e) && !isEmployeeBusy(e.id));

/* force=false: el aseo toma un servicio libre. force=true: supervisor/admin lo asigna (aunque ya tuviera dueño). */
async function claimRoom(roomId, empId, force) {
  const room = roomById(roomId), emp = empById(empId);
  if (!room || !emp) return false;
  if (!cleaningRoleOn(emp)) { toast('Este colaborador no tiene rol de limpieza activo.', 'err'); return false; }
  if (isEmployeeBusy(empId, roomId)) { toast(force ? emp.name + ' está ocupado con otro servicio.' : 'Termina tu limpieza actual antes de tomar otro servicio.', 'warn'); return false; }
  if (sbClient) {
    Cloud.pending++;
    try {
      let q = sbClient.from('rooms').update({ assigned_to: empId }).eq('id', roomId).eq('status', 'PENDIENTE DE LIMPIEZA');
      if (!force) q = q.is('assigned_to', null);
      const { data, error } = await q.select('id');
      if (error) throw error;
      if (!data || !data.length) { Cloud.pending--; await syncFromCloud(); Cloud.pending++; toast('Otra persona ya tomó este servicio.', 'warn'); return false; }
    } catch (e) { console.warn('claimRoom', e); toast('No se pudo tomar el servicio.', 'err'); return false; }
    finally { Cloud.pending--; }
  } else if (room.status !== 'PENDIENTE DE LIMPIEZA' || (!force && room.assignedTo)) { return false; }
  room.assignedTo = empId; saveData(); refresh();
  const s = Auth.current();
  logHistory(s && s.username, force ? 'SERVICIO ASIGNADO' : 'SERVICIO TOMADO', 'Habitación ' + room.number + ' → ' + emp.name);
  saveData(); refresh();
  return true;
}

async function approveRoom(roomId) {
  const ok = await transitionRoom(roomId, 'EN VERIFICACIÓN', 'DISPONIBLE', { assignedTo: null });
  if (ok) {
    const s = Auth.current();
    logHistory(s && s.username, 'VERIFICACIÓN APROBADA', 'Habitación ' + roomById(roomId).number + ' aprobada y disponible');
    saveData(); refresh();
  }
  return ok;
}
async function rejectRoom(roomId, reason) {
  const prev = lastFinishedSession(roomId);
  const ok = await transitionRoom(roomId, 'EN VERIFICACIÓN', 'EN LIMPIEZA');
  if (!ok) return ok;
  const room = roomById(roomId), s = Auth.current();
  if (prev) {
    const redo = { id: generateId('SES'), roomId, employeeId: prev.employeeId, startTime: new Date().toISOString(), endTime: null,
      estimatedMinutes: prev.estimatedMinutes, gpsStart: null, gpsEnd: null, status: 'EN_LIMPIEZA', durationSeconds: 0, diffSeconds: 0 };
    DB.cleaningSessions.push(redo);
    Cloud.upsert('cleaning_sessions', redo);
  }
  const inc = { id: generateId('INC'), sessionId: prev ? prev.id : null, roomId, employeeId: prev ? prev.employeeId : null,
    type: 'RECHAZO VERIFICACIÓN', description: reason || 'Rechazada por el supervisor', photo: null, gps: null, timestamp: new Date().toISOString() };
  DB.incidents.push(inc); Cloud.upsert('incidents', inc);
  logHistory(s && s.username, 'VERIFICACIÓN RECHAZADA', 'Habitación ' + room.number + ' devuelta a limpieza. ' + (reason || ''));
  saveData(); refresh();
  return true;
}
async function addVerificationNote(roomId, description) {
  const prev = lastFinishedSession(roomId), s = Auth.current();
  const inc = { id: generateId('INC'), sessionId: prev ? prev.id : null, roomId, employeeId: prev ? prev.employeeId : null,
    type: 'NOVEDAD VERIFICACIÓN', description, photo: null, gps: null, timestamp: new Date().toISOString() };
  DB.incidents.push(inc);
  logHistory(s && s.username, 'NOVEDAD', 'Novedad de verificación · Hab. ' + roomById(roomId).number);
  commit('incidents', inc);
}

/* ==================== INVENTARIO DE HABITACIÓN ==================== */
const INVENTORY_CATEGORIES = ['Lencería', 'Equipos', 'Nevera / minibar', 'Baño', 'Otros'];
const catIndex = c => { const i = INVENTORY_CATEGORIES.indexOf(c); return i < 0 ? 99 : i; };
const sortInventory = list => list.slice().sort((a, b) => catIndex(a.category) - catIndex(b.category) || (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
/* Artículos activos que aplican a la categoría de esa habitación (sin categorías = todas). */
const inventoryForRoom = room => sortInventory((DB.inventoryItems || [])
  .filter(i => i.active !== false && (!i.roomCategories || !i.roomCategories.length || i.roomCategories.includes(room.category))));
const lastInventoryCheck = roomId => (DB.inventoryChecks || []).filter(c => c.roomId === roomId)
  .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
/* Arma la revisión: diferencia = contado ≠ esperado; cambio = contado ≠ revisión anterior de la habitación. */
function buildInventoryCheck(room, counts, session, notes) {
  const prev = lastInventoryCheck(room.id);
  const prevQty = {}; (prev ? prev.items : []).forEach(it => { prevQty[it.itemId] = it.found; });
  const items = inventoryForRoom(room).map(i => {
    const found = Math.max(0, parseInt(counts[i.id], 10) || 0);
    const previous = prevQty[i.id] === undefined ? null : prevQty[i.id];
    return { itemId: i.id, name: i.name, category: i.category, expected: i.expectedQty, found, previous,
      ok: found === i.expectedQty, changed: previous !== null && previous !== found };
  });
  return { id: generateId('INV'), roomId: room.id, sessionId: session ? session.id : null, employeeId: session ? session.employeeId : null,
    timestamp: new Date().toISOString(), items, differences: items.filter(x => !x.ok).length, changes: items.filter(x => x.changed).length,
    notes: (notes || '').trim() };
}
/* Guarda la revisión (la nube dispara la push al admin si hay diferencias o cambios). */
async function saveInventoryCheck(check) {
  DB.inventoryChecks.unshift(check);
  const room = roomById(check.roomId), s = Auth.current();
  logHistory(s && s.username, 'INVENTARIO', 'Hab. ' + (room ? room.number : '-') + ' · ' +
    (check.differences ? check.differences + ' diferencia(s)' : 'completo') + (check.changes ? ' · ' + check.changes + ' cambio(s)' : ''));
  saveData();
  return Cloud.upsert('inventory_checks', check);
}

/* ==================== EN VIVO (Realtime + respaldo por polling) ==================== */
function startLive() {
  let ch = null;
  if (sbClient) {
    try {
      const onChange = () => syncFromCloud();
      ch = sbClient.channel('cc-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_sessions' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_checks' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, onChange)
        .subscribe();
    } catch (e) { console.warn('Realtime no disponible', e); }
  }
  const timer = setInterval(syncFromCloud, CFG.pollMs);
  return () => { clearInterval(timer); if (ch && sbClient) sbClient.removeChannel(ch); };
}

/* ==================== PUSH (Firebase Cloud Messaging) ==================== */
async function activateServiceWorker(reg) {
  const sw = reg.installing || reg.waiting || reg.active;
  if (!sw || sw.state === 'activated') return;
  await new Promise(res => sw.addEventListener('statechange', () => { if (sw.state === 'activated') res(); }));
}
/* Devuelve 'granted' | 'denied' | 'unsupported'. Nunca lanza: sin push el panel sigue funcionando. */
async function registerPush(session) {
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !window.firebase || !firebase.messaging.isSupported()) return 'unsupported';
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
    const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: 'firebase-cloud-messaging-push-scope' });
    await activateServiceWorker(reg);
    const messaging = firebase.messaging();
    const token = await messaging.getToken({ vapidKey: CFG.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return 'unsupported';
    if (sbClient) {
      const rowTok = { token, username: session.username, role: session.role === 'VL' || session.role === 'ADMIN' ? session.role : 'EMPLEADA', employee_id: session.employeeId || null, updated_at: new Date().toISOString() };
      const r = await sbClient.from('push_tokens').upsert(rowTok, { onConflict: 'token' });
      if (r.error && isMissingColumn(r.error)) { delete rowTok.employee_id; await sbClient.from('push_tokens').upsert(rowTok, { onConflict: 'token' }); }
    }
    // App abierta en pantalla: FCM entrega el mensaje a la página (no al sistema). Se muestra igual
    // la notificación del sistema, además del aviso interno, para que nunca pase desapercibida.
    // (Con la app cerrada o en segundo plano la muestra firebase-messaging-sw.js.)
    messaging.onMessage(async p => {
      const n = p.notification || {}, d = p.data || {};
      const title = n.title || 'Aquamare', body = n.body || 'Hay novedades de habitaciones';
      toast('🔔 ' + body, 'warn');
      try {
        await reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/favicon-64.png',
          tag: 'aq-' + (d.room_id || 'general') + '-' + title, renotify: true, vibrate: [200, 100, 200],
          data: { link: d.link || location.href } });
      } catch (e) { console.warn('No se pudo mostrar la notificación del sistema', e); }
      syncFromCloud();
    });
    return 'granted';
  } catch (e) { console.warn('Push no disponible', e); return 'unsupported'; }
}
