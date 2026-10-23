// WhatsApp: Odelia on Meta's WhatsApp Cloud API, used directly (no reseller fee; Meta bills per message). Pure or takes
// its fetch, so it's unit tested in whatsapp_test.ts.
//
//   Send     POST https://graph.facebook.com/{v}/{WHATSAPP_PHONE_NUMBER_ID}/messages, Authorization: Bearer WHATSAPP_TOKEN
//            {messaging_product: "whatsapp", to, type: "text", text: {body, preview_url}}
//   Window   Free-form replies only within 24 hours of their last message (each number's first 1,000 service messages a
//            month are free). Outside it, only an approved template: Odelia's updates (a renewal due, an agency asking
//            for something) use one utility template (WHATSAPP_TEMPLATE, "Placetta: {{1}}"), $0.0034 each to a US
//            number; since Oct 1 2026 a utility template costs that inside the window too. Marketing templates don't
//            deliver to US numbers at all. Error 131047: the window closed. Prices and sources: docs/CHANNELS.md.
//   Typing   {messaging_product, status: "read", message_id, typing_indicator: {type: "text"}}: marks theirs read and
//            shows typing for up to 25 seconds
//   Media    GET /{media id} gives a URL good for 5 minutes, fetched with the same token
//   Webhook  GET hub.mode=subscribe&hub.verify_token&hub.challenge to subscribe; POSTs signed X-Hub-Signature-256:
//            "sha256=" + hex HMAC-SHA256 of the raw body with the app secret. Retried for up to 7 days: deduplicate.
import { type Env, normalizePhone } from "./odelia.ts";

export const GRAPH = "https://graph.facebook.com";
export const WA_WINDOW_CLOSED = 131047;
const version = (env: Env) => (env("WHATSAPP_GRAPH_VERSION") || "v25.0").replace(/[^\w.]/g, "");

export const whatsappReady = (env: Env) => !!(env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID") && env("WHATSAPP_APP_SECRET") && env("WHATSAPP_VERIFY_TOKEN"));
/** Odelia's WhatsApp number, for the app to show (wa.me link). */
export const whatsappNumber = (env: Env) => normalizePhone(env("WHATSAPP_NUMBER") ?? "");
/** WhatsApp ids are E.164 without the plus. */
export const waId = (e164: string) => e164.replace(/^\+/, "");

/* ------------------------------ webhook ------------------------------ */

const enc = new TextEncoder();
function sameString(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hmacHex(secret: string, raw: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Whether a webhook really came from Meta: X-Hub-Signature-256 over the raw body with the app secret. */
export async function verifyWhatsApp(raw: string, header: string, appSecret: string): Promise<boolean> {
  if (!appSecret || !header.startsWith("sha256=")) return false;
  return sameString(header.slice(7).toLowerCase(), await hmacHex(appSecret, raw));
}
export const signWhatsApp = async (raw: string, appSecret: string) => `sha256=${await hmacHex(appSecret, raw)}`;

/** The subscribe handshake: the challenge to echo back, or null when the verify token is wrong. */
export function subscribeChallenge(url: URL, verifyToken: string): string | null {
  const q = url.searchParams;
  if (q.get("hub.mode") !== "subscribe" || !verifyToken || !sameString(q.get("hub.verify_token") ?? "", verifyToken)) return null;
  return q.get("hub.challenge") ?? "";
}

type WaMessage = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string }; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { id?: string; mime_type?: string; caption?: string }; document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  context?: unknown;
};
export type WaEvent = { object?: string; entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string; display_phone_number?: string }; messages?: WaMessage[] } }[] }[] };
export type WaInbound = { id: string; from: string; text: string; media: { id: string; content_type: string }[]; phoneNumberId: string | null };

/** The messages people sent, in the shape odelia-sms handles; status receipts and the like are left out. */
export function parseWhatsApp(ev: WaEvent): WaInbound[] {
  if (ev.object !== "whatsapp_business_account") return [];
  const out: WaInbound[] = [];
  for (const e of ev.entry ?? []) for (const c of e.changes ?? []) {
    if (c.field !== "messages") continue;
    for (const m of c.value?.messages ?? []) {
      const from = normalizePhone(m.from ? `+${String(m.from).replace(/^\+/, "")}` : "");
      if (!from || !m.id) continue;
      const media = [m.image, m.document].filter((x): x is { id?: string; mime_type?: string } => !!x?.id).map((x) => ({ id: String(x.id), content_type: String(x.mime_type ?? "") }));
      const text = String(m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? m.image?.caption ?? m.document?.caption ?? "").trim().slice(0, 1600);
      out.push({ id: `wa:${m.id}`, from, text, media, phoneNumberId: c.value?.metadata?.phone_number_id ?? null });
    }
  }
  return out;
}

/* ------------------------------ sending ------------------------------ */

export type WaResult = { ok: boolean; status: number; code?: number; detail?: string; id?: string };
async function post(env: Env, body: Record<string, unknown>, f: typeof fetch): Promise<WaResult> {
  if (!whatsappReady(env)) return { ok: false, status: 503, detail: "not_configured" };
  try {
    const res = await f(`${GRAPH}/${version(env)}/${encodeURIComponent(env("WHATSAPP_PHONE_NUMBER_ID")!)}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }), signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { code?: number; message?: string; error_data?: { details?: string } } };
    if (res.ok) return { ok: true, status: res.status, id: j.messages?.[0]?.id };
    return { ok: false, status: res.status, code: j.error?.code, detail: String(j.error?.error_data?.details ?? j.error?.message ?? "").slice(0, 200) };
  } catch (e) { return { ok: false, status: 502, detail: String(e).slice(0, 200) }; }
}

/** A free-form reply, inside their 24-hour window. */
export const waText = (env: Env, to: string, text: string, f: typeof fetch = fetch) =>
  post(env, { recipient_type: "individual", to: waId(to), type: "text", text: { body: text.slice(0, 4096), preview_url: /https?:\/\//.test(text) } }, f);

/** Odelia's update template (utility), for outside the window. Template parameters can't hold newlines or runs of spaces. */
export const waTemplateReady = (env: Env) => !!env("WHATSAPP_TEMPLATE");
export function waTemplate(env: Env, to: string, text: string, lang: "en" | "zh", f: typeof fetch = fetch) {
  const param = text.replace(/^(Placetta|快哉)[:：]\s*/, "").replace(/\s*\n+\s*/g, " ").replace(/ {4,}/g, "   ").replace(/\t/g, " ").trim().slice(0, 1000);
  const code = lang === "zh" ? (env("WHATSAPP_TEMPLATE_LANG_ZH") || "zh_CN") : (env("WHATSAPP_TEMPLATE_LANG_EN") || "en_US");
  return post(env, { to: waId(to), type: "template", template: { name: env("WHATSAPP_TEMPLATE"), language: { code }, components: [{ type: "body", parameters: [{ type: "text", text: param || "-" }] }] } }, f);
}

/** Mark their message read and show typing while Odelia works (up to 25 seconds, or until she answers). */
export const waTyping = (env: Env, messageId: string, f: typeof fetch = fetch) =>
  post(env, { status: "read", message_id: messageId.replace(/^wa:/, ""), typing_indicator: { type: "text" } }, f).then((r) => r.ok).catch(() => false);

/** Where to download a media item they sent (good for 5 minutes), and its type and size. */
export async function waMedia(env: Env, mediaId: string, f: typeof fetch = fetch): Promise<{ url: string; content_type: string; size: number } | null> {
  if (!whatsappReady(env)) return null;
  try {
    const res = await f(`${GRAPH}/${version(env)}/${encodeURIComponent(mediaId)}`, { headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}` }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const j = await res.json() as { url?: string; mime_type?: string; file_size?: number };
    return j.url ? { url: j.url, content_type: String(j.mime_type ?? ""), size: Number(j.file_size ?? 0) } : null;
  } catch { return null; }
}
/** Meta's media hosts take the same token; nothing else gets it. */
export const waMediaHost = (host: string) => /(^|\.)(fbsbx\.com|facebook\.com|whatsapp\.net)$/i.test(host);

/** Whether their 24-hour window is still open (a 5-minute margin so a long run doesn't land just after it shuts). */
export const waWindowOpen = (lastIn: string | null | undefined, now = Date.now()) => !!lastIn && now - Date.parse(lastIn) < 24 * 3600e3 - 5 * 60e3;
