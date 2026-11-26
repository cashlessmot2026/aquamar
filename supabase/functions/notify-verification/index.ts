// Edge Function: notify-verification
// La llaman los triggers de la base con { kind, room_id, number, status, assigned_to } y envía push FCM (HTTP v1):
//   - status = 'PENDIENTE DE LIMPIEZA' -> solo al aseo DISPONIBLE (rol limpieza activo, sin limpieza iniciada
//                                         y sin otra habitación tomada/asignada sin terminar)
//   - kind   = 'assigned'              -> al colaborador asignado, solo si está disponible (sin otro servicio)
//   - status = 'EN VERIFICACIÓN'       -> el aseo terminó la limpieza: a supervisores (VL) y administradores (ADMIN)
//   - kind   = 'inventory'             -> a los administradores (ADMIN): inventario con diferencias o cambios
//   - kind   = 'ping'                  -> no envía nada (comprobar que la función responde)
// Cada llamada queda registrada en la tabla push_log (si existe) para poder diagnosticar.
// Secret requerido: FCM_SERVICE_ACCOUNT (JSON completo de la cuenta de servicio de Firebase).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const FCM_PROJECT_ID = "house-53644";
const BASE = "https://cashlessmot2026.github.io/aquamar/";
const LINK = { aseo: BASE + "?app=aseo", supervisor: BASE + "?view=supervisor", admin: BASE + "?app=admin" };

interface ServiceAccount { client_email: string; private_key: string; }
interface InvItem { name: string; expected: number; found: number; previous: number | null; ok: boolean; changed: boolean; }
interface Payload {
  kind?: string; room_id?: string; number?: string; status?: string; assigned_to?: string | null;
  differences?: number; changes?: number; items?: InvItem[]; notes?: string | null;
}
interface TokenRow { token: string; username?: string; role?: string; employee_id?: string | null; }
interface Target { token: string; username: string; link: string; }

const b64url = (data: Uint8Array | string): string => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// El permiso de Google dura 1 hora: se guarda mientras la función siga "caliente" para responder rápido.
let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 120 > now) return cachedToken.value;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claim}.${b64url(sig)}` }),
  });
  if (!res.ok) throw new Error("OAuth FCM: " + (await res.text()));
  const j = await res.json();
  cachedToken = { value: j.access_token as string, exp: now + (Number(j.expires_in) || 3600) };
  return cachedToken.value;
}

/* Colaboradores de aseo DISPONIBLES: rol de limpieza activo y sin servicio en curso, es decir sin una
   limpieza iniciada y sin otra habitación tomada/asignada pendiente de terminar.
   `roomId` = la habitación del aviso (tenerla asignada no cuenta como "ocupado"). */
async function availableCleaners(supabase: SupabaseClient, roomId: string | undefined): Promise<Set<string>> {
  const [emps, busy, taken] = await Promise.all([
    supabase.from("employees").select("id").eq("cleaning_role", true).in("status", ["ACTIVA", "EN TURNO"]),
    supabase.from("cleaning_sessions").select("employee_id, room_id").eq("status", "EN_LIMPIEZA"),
    supabase.from("rooms").select("id, assigned_to").not("assigned_to", "is", null)
      .in("status", ["PENDIENTE DE LIMPIEZA", "EN LIMPIEZA"]),
  ]);
  const err = emps.error || busy.error || taken.error;
  if (err) throw new Error("Consulta de disponibilidad: " + err.message);
  const ok = new Set((emps.data ?? []).map((e: { id: string }) => e.id));
  (busy.data ?? []).forEach((b: { employee_id: string; room_id: string }) => { if (b.room_id !== roomId) ok.delete(b.employee_id); });
  (taken.data ?? []).forEach((r: { id: string; assigned_to: string }) => { if (r.id !== roomId) ok.delete(r.assigned_to); });
  return ok;
}

async function tokensFor(supabase: SupabaseClient, roles: string[]): Promise<TokenRow[]> {
  const { data, error } = await supabase.from("push_tokens").select("token, username, role, employee_id").in("role", roles);
  if (error) throw new Error("Consulta de dispositivos: " + error.message);
  return (data ?? []) as TokenRow[];
}

async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  let p: Payload;
  try { p = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (p.kind === "ping") return json({ sent: 0, removed: 0, ignored: true });

  const number = p.number ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const event = p.kind === "status" || !p.kind ? (p.status ?? "") : p.kind;

  // Registro para diagnóstico (si la tabla push_log no existe, simplemente no se guarda).
  const log = async (r: Record<string, unknown>) => {
    try {
      await supabase.from("push_log").insert({ event, room_id: p.room_id ?? null, number, ...r });
    } catch (_) { /* sin registro */ }
  };

  let targets: Target[] = [];
  let title = "", body = "", note = "";
  try {
    // 1) ¿A quién y qué se envía?
    if (p.kind === "inventory") {
      targets = (await tokensFor(supabase, ["ADMIN"])).map((t) => ({ token: t.token, username: t.username ?? "", link: LINK.admin }));
      const items = p.items ?? [];
      const detail = [
        ...items.filter((i) => !i.ok).map((i) => `${i.name} ${i.found}/${i.expected}`),
        ...items.filter((i) => i.ok && i.changed).map((i) => `${i.name} ${i.previous}→${i.found}`),
      ].slice(0, 4).join(", ");
      const parts: string[] = [];
      if (p.differences) parts.push(`${p.differences} diferencia(s)`);
      if (p.changes) parts.push(`${p.changes} cambio(s)`);
      title = `📦 Inventario Hab. ${number}`;
      body = parts.join(" · ") + (detail ? `: ${detail}` : "") + (p.notes ? ` — ${p.notes}` : "");
    } else if (p.kind === "assigned" && p.assigned_to) {
      const free = await availableCleaners(supabase, p.room_id);
      if (!free.has(p.assigned_to)) {
        note = "colaborador ocupado con otro servicio o sin rol de limpieza activo";
      } else {
        targets = (await tokensFor(supabase, ["EMPLEADA"])).filter((t) => t.employee_id === p.assigned_to)
          .map((t) => ({ token: t.token, username: t.username ?? "", link: LINK.aseo }));
      }
      title = "🧹 Servicio asignado";
      body = `Te asignaron la habitación ${number}. Escanea su QR para iniciar.`;
    } else if (p.status === "PENDIENTE DE LIMPIEZA") {
      // Si ya viene asignada a alguien, ese colaborador recibe el aviso de "Servicio asignado"; aquí no se repite.
      if (p.assigned_to) {
        note = "ya asignada: se avisa con 'Servicio asignado'";
      } else {
        const free = await availableCleaners(supabase, p.room_id);
        targets = (await tokensFor(supabase, ["EMPLEADA"])).filter((t) => !!t.employee_id && free.has(t.employee_id))
          .map((t) => ({ token: t.token, username: t.username ?? "", link: LINK.aseo }));
        if (!targets.length) note = free.size ? "aseo disponible sin notificaciones activadas" : "no hay aseo disponible";
      }
      title = "🛏️ Habitación por limpiar";
      body = `La habitación ${number} está lista para limpieza. ¡Toma el servicio!`;
    } else if (p.status === "EN VERIFICACIÓN") {
      // El aseo terminó: avisar a supervisores y administradores.
      let who = "";
      if (p.assigned_to) {
        const { data } = await supabase.from("employees").select("name").eq("id", p.assigned_to).maybeSingle();
        who = (data as { name?: string } | null)?.name ?? "";
      }
      targets = (await tokensFor(supabase, ["VL", "ADMIN"])).map((t) => ({
        token: t.token, username: t.username ?? "", link: t.role === "ADMIN" ? LINK.admin : LINK.supervisor,
      }));
      title = "✅ Limpieza terminada";
      body = `${who ? who + " terminó" : "Terminó"} la limpieza de la habitación ${number}. Lista para verificar.`;
    } else {
      return json({ sent: 0, removed: 0, ignored: true });
    }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await log({ sent: 0, removed: 0, recipients: [], error: msg });
    return json({ error: msg }, 500);
  }

  if (targets.length === 0) {
    await log({ sent: 0, removed: 0, recipients: [], error: note || "sin dispositivos registrados" });
    return json({ sent: 0, removed: 0, note: note || "sin dispositivos registrados" });
  }

  // 2) Envío
  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!saRaw) {
    await log({ sent: 0, removed: 0, recipients: targets.map((t) => t.username), error: "Falta el secret FCM_SERVICE_ACCOUNT" });
    return json({ error: "Falta el secret FCM_SERVICE_ACCOUNT" }, 500);
  }
  let accessToken: string;
  try { accessToken = await getAccessToken(JSON.parse(saRaw)); } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await log({ sent: 0, removed: 0, recipients: targets.map((t) => t.username), error: msg });
    return json({ error: msg }, 500);
  }

  let sent = 0, removed = 0;
  const errors: string[] = [];
  await Promise.all(targets.map(async ({ token, link }) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: { room_id: p.room_id ?? "", number, link },
          webpush: {
            // Urgencia alta: Android la entrega al instante aunque el celular esté en reposo.
            headers: { Urgency: "high", TTL: "86400" },
            notification: {
              icon: BASE + "icons/icon-192.png",
              badge: BASE + "icons/favicon-64.png",
              tag: `aq-${p.room_id ?? "general"}-${event}`,
              renotify: true,
            },
            fcm_options: { link },
          },
        },
      }),
    });
    if (res.ok) { sent++; return; }
    const err = await res.text();
    // Solo se borra el dispositivo si FCM dice que ESE token ya no sirve. Un error del mensaje
    // (INVALID_ARGUMENT por un campo) no debe borrar los registros de todos.
    const deadToken = res.status === 404 || err.includes("UNREGISTERED") ||
      (err.includes("INVALID_ARGUMENT") && /registration token|token is not a valid/i.test(err));
    if (deadToken) {
      await supabase.from("push_tokens").delete().eq("token", token);
      removed++;
    } else {
      console.error("FCM error", res.status, err);
      if (errors.length < 3) errors.push(`${res.status}: ${err.slice(0, 300)}`);
    }
  }));
  await log({ sent, removed, recipients: targets.map((t) => t.username), error: errors.length ? errors.join(" | ") : null });
  return json(errors.length ? { sent, removed, errors } : { sent, removed });
}

Deno.serve(handler);
