// Edge Function: notify-verification
// La llama el trigger de `rooms` con { kind, room_id, number, status, assigned_to } y envía push FCM (HTTP v1):
//   - status = 'EN VERIFICACIÓN'      -> a los supervisores (role = 'VL')
//   - status = 'PENDIENTE DE LIMPIEZA' -> al personal de aseo disponible (rol limpieza, sin una limpieza en curso)
//   - kind   = 'assigned'              -> solo al colaborador al que le asignaron la habitación
//   - kind   = 'inventory'             -> a los administradores (role = 'ADMIN'): inventario con diferencias o cambios
// Secret requerido: FCM_SERVICE_ACCOUNT (JSON completo de la cuenta de servicio de Firebase).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FCM_PROJECT_ID = "house-53644";
const BASE = "https://cashlessmot2026.github.io/aquamar/";

interface ServiceAccount { client_email: string; private_key: string; }
interface InvItem { name: string; expected: number; found: number; previous: number | null; ok: boolean; changed: boolean; }
interface Payload {
  kind?: string; room_id?: string; number?: string; status?: string; assigned_to?: string | null;
  differences?: number; changes?: number; items?: InvItem[]; notes?: string | null;
}

const b64url = (data: Uint8Array | string): string => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
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
  return (await res.json()).access_token as string;
}

async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  let p: Payload;
  try { p = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const number = p.number ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1) ¿A quién y qué se envía?
  let tokens: string[] = [];
  let title = "", body = "", link = BASE;

  if (p.kind === "inventory") {
    const { data } = await supabase.from("push_tokens").select("token").eq("role", "ADMIN");
    tokens = (data ?? []).map((r: { token: string }) => r.token);
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
    link = BASE + "?app=admin";
  } else if (p.kind === "assigned" && p.assigned_to) {
    const { data } = await supabase.from("push_tokens").select("token").eq("role", "EMPLEADA").eq("employee_id", p.assigned_to);
    tokens = (data ?? []).map((r: { token: string }) => r.token);
    title = "Servicio asignado";
    body = `Te asignaron la habitación ${number}. Escanea su QR para iniciar.`;
    link = BASE + "?app=aseo";
  } else if (p.status === "EN VERIFICACIÓN") {
    const { data } = await supabase.from("push_tokens").select("token").eq("role", "VL");
    tokens = (data ?? []).map((r: { token: string }) => r.token);
    title = "Habitación por verificar";
    body = `Habitación ${number} lista para verificación`;
    link = BASE + "?view=supervisor";
  } else if (p.status === "PENDIENTE DE LIMPIEZA") {
    // Aseo disponible: rol limpieza activo y sin una limpieza en curso.
    const [{ data: emps }, { data: busy }, { data: toks }] = await Promise.all([
      supabase.from("employees").select("id").eq("cleaning_role", true).in("status", ["ACTIVA", "EN TURNO"]),
      supabase.from("cleaning_sessions").select("employee_id").eq("status", "EN_LIMPIEZA"),
      supabase.from("push_tokens").select("token, employee_id").eq("role", "EMPLEADA"),
    ]);
    const ok = new Set((emps ?? []).map((e: { id: string }) => e.id));
    (busy ?? []).forEach((b: { employee_id: string }) => ok.delete(b.employee_id));
    tokens = (toks ?? []).filter((t: { employee_id: string }) => ok.has(t.employee_id)).map((t: { token: string }) => t.token);
    title = "Habitación por limpiar";
    body = `La habitación ${number} está lista para limpieza. ¡Toma el servicio!`;
    link = BASE + "?app=aseo";
  } else {
    return json({ sent: 0, removed: 0, ignored: true });
  }
  if (tokens.length === 0) return json({ sent: 0, removed: 0 });

  // 2) Envío
  const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!saRaw) return json({ error: "Falta el secret FCM_SERVICE_ACCOUNT" }, 500);
  const accessToken = await getAccessToken(JSON.parse(saRaw));

  let sent = 0, removed = 0;
  const errors: string[] = [];
  for (const token of tokens) {
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
              tag: `aq-${p.room_id ?? "general"}-${title}`,
              renotify: true,
              vibrate: [200, 100, 200],
            },
            fcm_options: { link },
          },
        },
      }),
    });
    if (res.ok) { sent++; continue; }
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
  }
  return json(errors.length ? { sent, removed, errors } : { sent, removed });
}

Deno.serve(handler);
