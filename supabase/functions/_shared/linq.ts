// Linq: Odelia on iMessage (with automatic RCS and SMS fallback for Android), the same provider Poke, Lindy and Instinct
// use. Everything here is pure or takes its fetch, so it's unit tested in linq_test.ts against Linq's published shapes
// (API V3, the official @linqapp/sdk types; webhook payload version 2026-02-03).
//
//   Base     https://api.linqapp.com/api/partner, Authorization: Bearer LINQ_API_KEY
//   Send     POST /v3/chats {from, to: [handle], message: {parts: [{type: "text", value}], idempotency_key}}
//            Chats are keyed on from + to, so this reuses the existing conversation. The first message of a NEW chat
//            may not contain a URL (400, code 1005): then the words go first and the link follows in the chat.
//   Opt-out  403 code 2024: they texted STOP. Linq blocks every send until they write again; override_optout lets one
//            courtesy reply through (the carriers' "you've been unsubscribed").
//   Line     403 code 2027: that line is restricted for its reputation; send from another line.
//   Typing   POST /v3/chats/{id}/typing
//   Lines    GET /v3/phone_numbers: each line's reputation (HEALTHY, AT_RISK, CRITICAL)
//   Webhook  Standard Webhooks: webhook-id, webhook-timestamp, webhook-signature "v1,<base64 HMAC-SHA256 of
//            `${id}.${timestamp}.${raw body}`>" keyed with the base64 after "whsec_" in the subscription's signing secret.
import { type Env, normalizePhone } from "./odelia.ts";

export const LINQ = "https://api.linqapp.com/api/partner";
export const LINQ_OPTED_OUT = 2024;
export const LINQ_LINE_RESTRICTED = 2027;
export const LINQ_BAD_PARAM = 1005;
/** Sandbox (free tier): the contact hasn't texted the line yet, so it can't text them. */
export const LINQ_TEXT_FIRST = 2008;

/** Odelia's iMessage lines, in order (LINQ_NUMBERS, comma separated). The first is the one the app shows. */
export function linqLines(env: Env): string[] {
  const seen = new Set<string>();
  for (const raw of (env("LINQ_NUMBERS") ?? "").split(",")) { const n = normalizePhone(raw.trim()); if (n) seen.add(n); }
  return [...seen];
}
export const linqReady = (env: Env) => !!(env("LINQ_API_KEY") && env("LINQ_WEBHOOK_SECRET") && linqLines(env).length);

/* ------------------------------ webhook signatures ------------------------------ */

const enc = new TextEncoder();
function b64(bytes: Uint8Array) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function unb64(s: string): Uint8Array<ArrayBuffer> | null { try { const bin = atob(s); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch { return null; } }
function sameString(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

/** Whether a webhook really came from Linq (Standard Webhooks). Five minutes either way of now. */
export async function verifyLinq(raw: string, headers: { id: string; timestamp: string; signature: string }, secret: string, nowSec = Date.now() / 1000, toleranceSec = 300): Promise<boolean> {
  const ts = Number(headers.timestamp);
  if (!secret || !headers.id || !headers.signature || !Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = unb64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (!key || !key.length) return false;
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${headers.id}.${headers.timestamp}.${raw}`))));
  return headers.signature.split(" ").some((s) => { const [v, sig] = s.split(","); return v === "v1" && !!sig && sameString(sig, want); });
}
/** Signs like Linq does (tests and the e2e stand-in). */
export async function signLinq(raw: string, id: string, timestamp: string, secret: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", unb64(secret.replace(/^whsec_/, ""))!, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `v1,${b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${id}.${timestamp}.${raw}`))))}`;
}

/* ------------------------------ inbound ------------------------------ */

type Part = { type?: string; value?: string; url?: string; mime_type?: string; size_bytes?: number; filename?: string };
export type LinqEvent = {
  event_type?: string; event_id?: string;
  data?: {
    id?: string; direction?: string; service?: string; parts?: Part[]; reconciled_at?: string; zero_retention?: boolean;
    sender_handle?: { handle?: string; is_me?: boolean | null };
    chat?: { id?: string; is_group?: boolean | null; owner_handle?: { handle?: string } | null };
    // the 2025-01-01 payload, in case a subscription was made without ?version=2026-02-03
    is_from_me?: boolean; from?: string; chat_id?: string; recipient_phone?: string; message?: { id?: string; parts?: Part[] };
  };
};
/** One text from someone, in the same shape odelia-sms handles Telnyx's in. */
export type LinqInbound = {
  id: string; from: string; to: string | null; text: string; chat: string | null; service: "iMessage" | "SMS" | "RCS";
  media: { url: string; content_type: string; size: number }[];
};
export type LinqSkip = { skip: "not_a_message" | "outbound" | "group" | "late" | "no_sender" | "empty_zero_retention" };

/** What to do with a Linq webhook: a text to answer, or a reason to ignore it. */
export function parseLinq(ev: LinqEvent): LinqInbound | LinqSkip {
  if (ev.event_type !== "message.received") return { skip: "not_a_message" };
  const d = ev.data ?? {};
  if (d.direction === "outbound" || d.is_from_me === true || d.sender_handle?.is_me) return { skip: "outbound" };
  if (d.chat?.is_group) return { skip: "group" };
  // A message Linq recovered late is real but out of order: history, not something to answer now.
  if (d.reconciled_at) return { skip: "late" };
  const from = normalizePhone(d.sender_handle?.handle ?? d.from ?? "");
  const id = String(d.id ?? d.message?.id ?? ev.event_id ?? "");
  if (!from || !id) return { skip: "no_sender" };
  const parts = (Array.isArray(d.parts) ? d.parts : Array.isArray(d.message?.parts) ? d.message!.parts! : []) as Part[];
  if (!parts.length && d.zero_retention) return { skip: "empty_zero_retention" };
  const text = parts.filter((p) => p.type === "text" && typeof p.value === "string").map((p) => p.value!.trim()).filter(Boolean).join("\n").slice(0, 1600);
  const media = parts.filter((p) => p.type === "media" && typeof p.url === "string")
    .map((p) => ({ url: p.url!, content_type: String(p.mime_type ?? ""), size: Number(p.size_bytes ?? 0) }));
  const service = d.service === "SMS" || d.service === "RCS" ? d.service : "iMessage";
  return { id: `linq:${id}`, from, to: normalizePhone(d.chat?.owner_handle?.handle ?? d.recipient_phone ?? ""), text, chat: d.chat?.id ?? d.chat_id ?? null, service, media };
}

/* ------------------------------ sending ------------------------------ */

export type LinqResult = { ok: boolean; status: number; code?: number; detail?: string; id?: string; chat?: string; service?: string };

async function call(env: Env, method: string, path: string, body: unknown, f: typeof fetch): Promise<{ status: number; j: Record<string, unknown> }> {
  const res = await f(`${LINQ}${path}`, {
    method, headers: { Authorization: `Bearer ${env("LINQ_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  return { status: res.status, j: await res.json().catch(() => ({})) as Record<string, unknown> };
}
const errOf = (status: number, j: Record<string, unknown>): LinqResult => {
  const e = (j.error ?? {}) as { code?: number; message?: string };
  return { ok: false, status, code: typeof e.code === "number" ? e.code : undefined, detail: String(e.message ?? "").slice(0, 200) };
};
const URLS = /https?:\/\/\S+/g;
const hasUrl = (s: string) => /https?:\/\/\S+/.test(s);

/**
 * Text one message from one of Odelia's lines. A new conversation can't open with a link, so then the words go first
 * and the link follows. `courtesy` sends past an opt-out once (the reply to STOP itself).
 */
export async function linqSend(env: Env, o: { from: string; to: string; text: string; key?: string; courtesy?: boolean }, f: typeof fetch = fetch): Promise<LinqResult> {
  if (!env("LINQ_API_KEY")) return { ok: false, status: 503, detail: "not_configured" };
  const send = async (text: string, key?: string) => {
    const { status, j } = await call(env, "POST", "/v3/chats", {
      from: o.from, to: [o.to], message: { parts: [{ type: "text", value: text }], ...(key ? { idempotency_key: key } : {}) }, ...(o.courtesy ? { override_optout: true } : {}),
    }, f);
    if (status >= 200 && status < 300) {
      const chat = (j.chat ?? {}) as { id?: string; service?: string; message?: { id?: string } };
      return { ok: true, status, id: chat.message?.id, chat: chat.id, service: chat.service } as LinqResult;
    }
    return errOf(status, j);
  };
  try {
    const r = await send(o.text, o.key);
    if (r.ok || r.code !== LINQ_BAD_PARAM || !hasUrl(o.text)) return r;
    // A brand-new conversation: words first, then the link into the chat that just opened.
    const links = o.text.match(URLS) ?? [];
    const words = o.text.replace(URLS, "").replace(/[ \t]+\n/g, "\n").replace(/\s*[:：]\s*$/, "").replace(/[ \t]{2,}/g, " ").trim();
    const first = await send(words || "Odelia from Placetta.", o.key ? `${o.key}:w` : undefined);
    if (!first.ok || !first.chat) return first;
    const { status, j } = await call(env, "POST", `/v3/chats/${encodeURIComponent(first.chat)}/messages`, {
      message: { parts: [{ type: "text", value: links.join("\n") }], ...(o.key ? { idempotency_key: `${o.key}:l` } : {}) },
    }, f);
    if (status >= 200 && status < 300) return { ...first, id: String(((j.message ?? {}) as { id?: string }).id ?? first.id) };
    return { ...errOf(status, j), id: first.id, chat: first.chat };
  } catch (e) {
    return { ok: false, status: 502, detail: String(e).slice(0, 200) };
  }
}

/** The "typing…" bubble while Odelia works on a text. Best effort. */
export async function linqTyping(env: Env, chat: string, f: typeof fetch = fetch): Promise<boolean> {
  if (!env("LINQ_API_KEY") || !chat) return false;
  try { return (await call(env, "POST", `/v3/chats/${encodeURIComponent(chat)}/typing`, undefined, f)).status < 300; } catch { return false; }
}

export type LineHealth = { number: string; reputation: "HEALTHY" | "AT_RISK" | "CRITICAL"; doc_url?: string };
/** Each of our lines' reputation as Linq scores it. Lines Linq doesn't list are left out. */
export async function linqLineHealth(env: Env, f: typeof fetch = fetch): Promise<LineHealth[] | null> {
  if (!env("LINQ_API_KEY")) return null;
  try {
    const { status, j } = await call(env, "GET", "/v3/phone_numbers", undefined, f);
    if (status >= 300) return null;
    const ours = new Set(linqLines(env));
    return ((j.phone_numbers ?? []) as { phone_number?: string; reputation?: { status?: string; doc_url?: string } }[])
      .map((p) => ({ number: normalizePhone(p.phone_number ?? "") ?? "", reputation: (["AT_RISK", "CRITICAL"].includes(String(p.reputation?.status)) ? p.reputation!.status : "HEALTHY") as LineHealth["reputation"], doc_url: p.reputation?.doc_url }))
      .filter((p) => ours.has(p.number));
  } catch { return null; }
}

/* ------------------------------ which line ------------------------------ */

/** A stable line for a number nobody has assigned yet, so people spread evenly across lines (Lindy's lesson). */
export function hashLine(lines: string[], number: string): string | null {
  if (!lines.length) return null;
  let h = 2166136261;
  for (const c of number) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return lines[(h >>> 0) % lines.length];
}

/**
 * The line to text someone from: the one they last texted (so replies stay in one conversation), else their assigned
 * one; skipping lines Linq has put at CRITICAL (pause outbound there), unless it's a reply to them, which always goes
 * back on the line they wrote to. Null: no usable line.
 */
export function pickLine(lines: string[], o: { stored?: string | null; number: string; critical?: Set<string>; reply?: boolean }): string | null {
  const usable = lines.filter((l) => !o.critical?.has(l));
  if (o.stored && lines.includes(o.stored) && (o.reply || !o.critical?.has(o.stored))) return o.stored;
  return hashLine(usable, o.number);
}
