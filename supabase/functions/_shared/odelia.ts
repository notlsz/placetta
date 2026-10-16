// Odelia by text and phone: the pieces odelia-sms, odelia-voice, agent-run and monitor share. Everything here is
// pure (or takes its fetch), so it's unit tested in odelia_test.ts: phone numbers, Telnyx's webhook signature, the
// carrier keywords, turning a reply into a few plain texts, quiet hours, the daily limits and the call tokens.
//
// Telnyx (developers.telnyx.com), v2:
//   POST /v2/messages {from, to, text, messaging_profile_id}                 send a text
//   webhook message.received {payload: {id, from: {phone_number}, to: [{phone_number}], text, autoresponse_type?}}
//   POST /v2/calls {connection_id, to, from, webhook_url, client_state, timeout_secs, answering_machine_detection}
//   POST /v2/calls/{call_control_id}/actions/{answer|speak|hangup|ai_assistant_start}
// Webhooks are signed with Ed25519: telnyx-signature-ed25519 over `${telnyx-timestamp}|${raw body}`.

export type Lang = "en" | "zh";
export type Env = (k: string) => string | undefined;
export type Channel = "sms" | "voice";

/* ------------------------------ phone numbers ------------------------------ */

/**
 * A phone number as E.164 (+14155550134), or null. Ten digits, or eleven starting with 1, are North American; anything
 * else needs its country code with + (or 00). North American numbers must have a real area code and exchange.
 */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s || s.length > 32 || /[^\d\s().+\-]/.test(s) || s.indexOf("+") > 0) return null;
  let d = s.replace(/\D/g, "");
  const intl = s.startsWith("+") || s.startsWith("00");
  if (s.startsWith("00")) d = d.slice(2);
  if (!intl) {
    if (d.length === 10) d = "1" + d;
    else if (!(d.length === 11 && d.startsWith("1"))) return null;
  }
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  if (d.startsWith("1") && !/^1[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
  return "+" + d;
}

/** Island nations and territories that share +1 with the US and Canada but are billed as international (and are the
    usual SMS pumping targets). US territories stay in. The database has the same list (phone_nanp_foreign). */
const NANP_FOREIGN = new Set(["242", "246", "264", "268", "284", "345", "441", "473", "649", "658", "664", "721", "758", "767",
  "784", "809", "829", "849", "868", "869", "876"]);

/** The country codes Odelia texts codes to: ODELIA_SMS_COUNTRIES (comma separated, like "1,86,44"), else US and Canada
    (1) and China (86). */
export function smsCountries(env: Env): string[] {
  const list = (env("ODELIA_SMS_COUNTRIES") ?? "").split(",").map((s) => s.trim().replace(/^\+/, "")).filter((s) => /^[1-9]\d{0,2}$/.test(s));
  return list.length ? list : ["1", "86"];
}

/** Whether a code may be texted to this E.164 number: +1 only for the US and Canada (not the islands that share +1),
    +86 only for mainland China mobiles, and any other listed country code as given. Same rule as phone_sms_allowed. */
export function smsCountryAllowed(e164: string, countries: string[]): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return false;
  if (e164.startsWith("+1")) return countries.includes("1") && /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164) && !NANP_FOREIGN.has(e164.slice(2, 5));
  if (e164.startsWith("+86")) return countries.includes("86") && /^\+861[3-9]\d{9}$/.test(e164);
  return countries.some((c) => c !== "1" && c !== "86" && e164.startsWith(`+${c}`));
}

/** The carrier vouches the caller owns this number: STIR/SHAKEN attestation "A" that Telnyx validated. A missing
    shaken_stir_validated counts as not validated. */
export const callerAttested = (p: { shaken_stir_attestation?: string; shaken_stir_validated?: boolean }): boolean =>
  p.shaken_stir_attestation === "A" && p.shaken_stir_validated === true;

/** +14155550134 as +1 (415) 555-0134; other countries as given. */
export function prettyPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/* ------------------------------ webhook signatures ------------------------------ */

export function b64bytes(s: string): Uint8Array {
  const b64 = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * Whether a webhook really came from Telnyx: its Ed25519 signature (base64, telnyx-signature-ed25519) over
 * `${timestamp}|${raw body}`, checked with the account's public key (TELNYX_PUBLIC_KEY, base64), and a timestamp
 * within five minutes so an old webhook can't be replayed.
 */
export async function verifyTelnyx(raw: string, signature: string, timestamp: string, publicKey: string, nowSec = Date.now() / 1000, toleranceSec = 300): Promise<boolean> {
  if (!raw || !signature || !timestamp || !publicKey) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  try {
    const key = await crypto.subtle.importKey("raw", b64bytes(publicKey) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, b64bytes(signature) as BufferSource, utf8(`${timestamp}|${raw}`) as BufferSource);
  } catch {
    return false;
  }
}

/* ------------------------------ carrier keywords ------------------------------ */

// CTIA and the carriers: STOP and its synonyms opt out, START and UNSTOP opt back in, HELP gets who we are and how
// to stop. Only a text that is just the keyword counts, so "stop the renewal" still reaches Odelia.
const STOP = new Set(["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE", "退订", "TD"]);
const START = new Set(["START", "UNSTOP", "SUBSCRIBE", "RESUME"]);
const HELP = new Set(["HELP", "INFO", "帮助"]);
export type Keyword = "stop" | "start" | "help";
// The FCC's revocation rule (in force April 11, 2025): consent can be revoked by "any reasonable means", so a short text
// that plainly asks us to stop counts too, not only the keyword. Kept to short, unambiguous asks.
const OPT_OUT_PHRASE = /^(PLEASE )?(STOP|DON'?T|DO NOT|NO MORE) (TEXTING|TEXT|MESSAGING|CALLING|CALL|CONTACTING)( ME)?( ANYMORE| AGAIN)?( PLEASE)?$|^(REMOVE ME|TAKE ME OFF( YOUR LIST)?|LEAVE ME ALONE)$|^(不要再?(发短信|打电话|联系我)了?|别再?(发|打)了?)$/u;

export function keyword(text: unknown): Keyword | null {
  if (typeof text !== "string") return null;
  const k = text.trim().replace(/[\s.!?。！？]+$/u, "").replace(/\s+/g, " ").toUpperCase();
  if (STOP.has(k) || OPT_OUT_PHRASE.test(k)) return "stop";
  if (START.has(k)) return "start";
  if (HELP.has(k)) return "help";
  return null;
}

export const KEYWORD_REPLY: Record<Keyword, Record<Lang, string>> = {
  stop: { en: "Placetta: you won't get more texts from Odelia. Reply START to turn them back on.", zh: "快哉：Odelia 将不再给您发短信。回复 START 可重新开启。" },
  start: { en: "Placetta: texts from Odelia are back on. Reply STOP to opt out, HELP for help. Msg and data rates may apply.", zh: "快哉：已重新开启 Odelia 的短信。回复 STOP 退订，回复 HELP 获取帮助。可能产生短信和流量费用。" },
  help: { en: "Placetta: text Odelia about your licenses, permits and deadlines. Help: support@placetta.com. Reply STOP to opt out. Msg and data rates may apply.", zh: "快哉：可以发短信问 Odelia 关于执照、许可和截止日期的问题。帮助：support@placetta.com。回复 STOP 退订。可能产生短信和流量费用。" },
};

/** "switch to Dumpling House" (or 切换到 …): the workspace name to switch to, else null. */
export function switchTarget(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const t = text.trim();
  const m = /^(?:switch|change)\s+(?:to\s+)?(.{1,120}?)[\s.!。！]*$/i.exec(t) ?? /^(?:切换到|切换至|换到)\s*(.{1,120}?)[\s。！]*$/.exec(t);
  return m ? m[1].trim() || null : null;
}

/** The workspace a name means: an exact match first (ignoring case), then the only one that contains it. */
export function pickWorkspace<T extends { id: string; name: string }>(list: T[], name: string): T | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = list.filter((w) => w.name.trim().toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const part = list.filter((w) => w.name.toLowerCase().includes(q));
  return part.length === 1 ? part[0] : null;
}

/* ------------------------------ replies as texts ------------------------------ */

/** Markdown and list formatting out, plain sentences in. No em dashes. */
export function plainText(s: string): string {
  const lines = String(s ?? "")
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s*[—–]\s*/g, ", ")
    .split(/\n/)
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-*+•·]|\d+[.)])\s+/, "").replace(/^\s*\|.*\|\s*$/, (row) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", ")).trim())
    .filter((l) => l && !/^[-|:\s]+$/.test(l));
  // join lines into sentences
  return lines.map((l, i) => (i < lines.length - 1 && !/[.!?。！？:：,，;；]$/.test(l) ? l + (/[㐀-鿿]$/.test(l) ? "。" : ".") : l))
    .join(" ").replace(/\s+([。！？，])/g, "$1").replace(/([。！？，])\s+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}

/** GSM-7 text fits 153 characters per concatenated part; anything else (Chinese, emoji) goes as UCS-2, 67 per part. */
const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
export const isGsm = (s: string) => GSM.test(s);
/** The most characters one text (two message parts) should hold. */
export const textLimit = (s: string) => (isGsm(s) ? 306 : 134);

function sentences(s: string): string[] {
  return s.match(/[^.!?。！？]+(?:[.!?。！？]+["')\]]*|$)\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
}
function hardSplit(s: string, limit: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(" ", limit);
    if (cut < limit * 0.5) cut = limit;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * A reply as at most `max` texts, split between sentences. `tail` (an approval link, say) always ends the last text.
 * When it doesn't all fit, the last text is cut and points to `more` (the app) for the rest.
 */
export function splitSms(text: string, o: { max?: number; tail?: string; more?: string; lang?: Lang } = {}): string[] {
  const max = Math.max(1, o.max ?? 3);
  const body = plainText(text);
  const all = body + (o.tail ? " " + o.tail : "");
  const limit = textLimit(all + (o.more ?? ""));
  const join = (a: string, b: string) => (a ? (/[㐀-鿿。！？]$/.test(a) && /^[㐀-鿿]/.test(b) ? a + b : a + " " + b) : b);
  const pack = (parts: string[]) => {
    const segs: string[] = [];
    let cur = "";
    for (const p of parts.flatMap((x) => (x.length > limit ? hardSplit(x, limit) : [x]))) {
      const next = join(cur, p);
      if (next.length <= limit) cur = next;
      else { if (cur) segs.push(cur); cur = p; }
    }
    if (cur) segs.push(cur);
    return segs;
  };
  const tail = o.tail?.trim() ?? "";
  const segs = pack([...sentences(body), ...(tail ? [tail] : [])]);
  if (segs.length <= max) return segs.length ? segs : tail ? [tail] : [];
  // Too long: keep what fits, end with "more in the app" and the tail.
  const moreNote = o.more ? (o.lang === "zh" ? `完整内容：${o.more}` : `More: ${o.more}`) : "";
  const end = [moreNote, tail].filter(Boolean).join(" ");
  const kept = segs.slice(0, max);
  const room = limit - end.length - 2;
  let last = kept[max - 1].replace(tail, "").trim();
  if (last.length > room) last = last.slice(0, Math.max(0, room)).replace(/\s+\S*$/, "");
  kept[max - 1] = (last ? last.replace(/[\s,;:，；：]+$/, "") + "… " : "") + end;
  return kept.map((s) => s.trim()).filter(Boolean);
}

/* ------------------------------ quiet hours and limits ------------------------------ */

export const LIMITS = { textsPerDay: 3, callsPerDay: 1, inboundPerHour: 30, strangerDays: 90, maxQueuedHours: 48, newChatsPerLine: 25 };

export function validTz(tz: unknown): string {
  if (typeof tz === "string" && tz.length <= 64) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { /* not a zone */ }
  }
  return "America/Los_Angeles";
}
const hm = (s: string, d: number) => { const m = /^(\d{1,2}):(\d{2})/.exec(s ?? ""); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : d; };

/** Minutes past local midnight in a time zone. */
export function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0), m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (h % 24) * 60 + m;
}
/** The local calendar day, YYYY-MM-DD. */
export function localDay(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: validTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** Whether it's quiet hours where they are (default 9pm to 8am). A window can cross midnight; start = end means never. */
export function inQuietHours(now: Date, tz: string, start = "21:00", end = "08:00"): boolean {
  const m = localMinutes(now, tz), s = hm(start, 21 * 60), e = hm(end, 8 * 60);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** Whether one more proactive text or call fits today's limit (3 texts, 1 call a day, in their own day). */
export function underDailyLimit(kind: "text" | "call", sentToday: number): boolean {
  return sentToday < (kind === "call" ? LIMITS.callsPerDay : LIMITS.textsPerDay);
}
/** A number with no account gets one explanation, then nothing for 90 days. */
export function strangerMayGetReply(lastRepliedAt: string | null | undefined, now: Date): boolean {
  if (!lastRepliedAt) return true;
  const t = Date.parse(lastRepliedAt);
  return !Number.isFinite(t) || now.getTime() - t > LIMITS.strangerDays * 864e5;
}
/** Too many texts in an hour from one person: stop starting runs until it calms down. */
export const inboundFlood = (lastHour: number) => lastHour >= LIMITS.inboundPerHour;

/* ------------------------------ which updates reach a phone ------------------------------ */

export type UpdateLike = { kind: string; dedupe: string; app_id?: string | null; title?: { en: string; zh: string } };

/**
 * How much an update matters for a phone. urgent (a call, if they want calls): a permit that lapsed (risk of a fine
 * or closure), an overdue due date on an application that blocks opening, the agency returning a critical
 * application or anything about a failed inspection. important (a text): needs their approval or a step, a fee to
 * pay, anything due or renewing within 7 days, anything overdue. Everything else stays in the app and email.
 */
export function urgency(u: UpdateLike, critical: Set<string>): "urgent" | "important" | null {
  const parts = u.dedupe.split(":"), head = parts[0], bucket = Number(parts[parts.length - 1]);
  const title = `${u.title?.en ?? ""}`.toLowerCase();
  const isCritical = !!u.app_id && critical.has(u.app_id);
  if (head === "lapsed") return "urgent";
  if (head === "opening") return parts[2] === "late" ? "important" : null;   // a store slipping past its opening date
  if (head === "record") return parts[1] === "urgent" ? "urgent" : parts[1] === "news" ? "important" : null;   // what the city posted
  if (/inspection/.test(title) && /(fail|returned|overdue|closure|closed)/.test(title)) return "urgent";
  if (head === "overdue") return isCritical ? "urgent" : "important";
  if (head === "filing" && parts[2] === "rejected") return isCritical ? "urgent" : "important";
  if (head === "filing" && parts[2] === "needs_info") return "important";
  if (head === "needs_you" || head === "pay" || head === "approval") return "important";
  if ((head === "deadline" || head === "renewal" || head === "permit") && Number.isFinite(bucket) && bucket <= 7) return "important";
  return null;
}

/** One update as a text: brand first (carriers want the sender named), then what happened, short. */
export function noticeText(u: { title: { en: string; zh: string }; body?: { en: string; zh: string } | null }, business: string, lang: Lang): string {
  const t = plainText(u.title[lang] || u.title.en).replace(/[.。]$/, ""), b = plainText(u.body?.[lang] || u.body?.en || "");
  const s = lang === "zh" ? `快哉：${t}（${business}）。${b}` : `Placetta: ${t} (${business}). ${b}`;
  return s.trim().slice(0, 300);
}

/* ------------------------------ what Odelia knows on a call ------------------------------ */

type Rec = Record<string, unknown>;
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Rec[] : []);
const pickLang = (v: unknown, lang: Lang) => (v && typeof v === "object" ? String((v as Rec)[lang] ?? (v as Rec).en ?? "") : String(v ?? "")).slice(0, 120);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * A small, read-only summary of a workspace for a phone call: the business, its stores, each application's status and
 * next step, what's due in the next 30 days or overdue, filings with the agency, approvals waiting and recent updates.
 * Names, dates and statuses only: never document contents, form fields, logins, memory or chats.
 */
export function workspaceBrief(o: { name: string; state: unknown; filings?: Rec[]; updates?: Rec[]; lang: Lang; today: string }, maxChars = 3500): string {
  const st = (o.state && typeof o.state === "object" ? o.state : {}) as Rec;
  const L = o.lang, in30 = new Date(Date.parse(o.today + "T00:00:00Z") + 30 * 864e5).toISOString().slice(0, 10);
  const brief: Rec = {
    business: pickLang(st.business, L) || o.name,
    where: [((st.meta ?? {}) as Rec).city, ((st.meta ?? {}) as Rec).region].filter(Boolean).join(", ") || undefined,
    stores: arr(st.stores).slice(0, 12).map((s) => ({ name: pickLang(s.name, L), stage: s.stage, address: String(s.address ?? "").slice(0, 120), opens: isDay(s.projectedOpen) ? s.projectedOpen : isDay(s.plannedOpen) ? s.plannedOpen : undefined,
      permits_expiring: arr(s.permits).filter((p) => isDay(p.expires) && String(p.expires) <= in30).map((p) => `${pickLang(p.name, L)} ${String(p.expires).slice(0, 10)}`) })),
    applications: arr(st.apps).slice(0, 25).map((a) => ({ name: pickLang(a.name, L), agency: pickLang(a.agency, L), status: a.status, next: pickLang(a.next, L) || undefined, blocks_opening: a.critical === true || undefined })),
    due: arr(st.deadlines).filter((d) => isDay(d.date) && String(d.date) <= in30).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 12)
      .map((d) => ({ date: String(d.date).slice(0, 10), what: pickLang(d.title, L), kind: d.kind, overdue: String(d.date) < o.today || undefined })),
    filings: (o.filings ?? []).slice(0, 12).map((f) => ({ what: pickLang(f.title, L), status: f.status, confirmation: f.confirmation_number ?? undefined, since: String(f.updated_at ?? "").slice(0, 10) })),
    approvals_waiting: arr(st.approvals).slice(0, 8).map((a) => pickLang(a.title, L)),
    recent_updates: (o.updates ?? []).slice(0, 6).map((u) => `${String(u.created_at ?? "").slice(0, 10)} ${pickLang(u.title, L)}`),
  };
  let out = JSON.stringify(brief, (_k, v) => (Array.isArray(v) && v.length === 0 ? undefined : v));
  // Too long: drop detail from the end until it fits.
  for (const k of ["recent_updates", "filings", "stores", "applications"]) {
    if (out.length <= maxChars) break;
    const list = brief[k] as unknown[] | undefined;
    if (list) brief[k] = list.slice(0, Math.max(3, Math.floor(list.length / 2)));
    out = JSON.stringify(brief, (_k, v) => (Array.isArray(v) && v.length === 0 ? undefined : v));
  }
  return out.length > maxChars ? out.slice(0, maxChars) : out;
}

/* ------------------------------ codes and call tokens ------------------------------ */

/** A random code of n digits, uniform (no modulo bias). */
export function randomCode(n: number): string {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < n) { crypto.getRandomValues(buf); if (buf[0] < 250) out += String(buf[0] % 10); }
  return out;
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", utf8(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data) as BufferSource));
}
/** A token for one call's tools: the call's id and an expiry, signed. Telnyx sends it back on every tool request. */
export async function signCallToken(secret: string, callId: string, expSec: number): Promise<string> {
  const id = b64url(utf8(callId));
  return `${id}.${expSec}.${b64url(await hmac(secret, `odelia-call|${callId}|${expSec}`))}`;
}
/** The call id a token was signed for, or null when it's forged, malformed or expired. */
export async function verifyCallToken(secret: string, token: string, nowSec = Date.now() / 1000): Promise<string | null> {
  const [id, exp, sig] = String(token ?? "").split(".");
  if (!id || !exp || !sig || !secret || !/^\d+$/.test(exp) || Number(exp) < nowSec) return null;
  let callId: string;
  try { callId = new TextDecoder().decode(b64bytes(id)); } catch { return null; }
  const want = b64url(await hmac(secret, `odelia-call|${callId}|${exp}`));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? callId : null;
}

/** The digits in a spoken code as speech-to-text writes it: "4 7 one two", "four seven oh 2", "四七一二". */
const SPOKEN: Record<string, string> = {
  zero: "0", oh: "0", o: "0", one: "1", won: "1", two: "2", to: "2", too: "2", three: "3", tree: "3", four: "4", for: "4", fore: "4", five: "5", six: "6",
  seven: "7", eight: "8", ate: "8", nine: "9", niner: "9", "零": "0", "〇": "0", "一": "1", "幺": "1", "二": "2", "两": "2", "三": "3", "四": "4", "五": "5",
  "六": "6", "七": "7", "八": "8", "九": "9",
};
export function spokenDigits(s: unknown): string {
  return (String(s ?? "").toLowerCase().match(/\d|[a-z]+|[零〇一幺二两三四五六七八九]/g) ?? []).map((t) => (/^\d$/.test(t) ? t : SPOKEN[t] ?? "")).join("");
}

/** Telnyx client_state: base64 JSON, carried on every later webhook for the call. */
export const clientState = (o: Record<string, unknown>) => btoa(String.fromCharCode(...utf8(JSON.stringify(o))));
export function readClientState(s: unknown): Record<string, unknown> {
  if (typeof s !== "string" || !s) return {};
  try { return JSON.parse(new TextDecoder().decode(b64bytes(s))); } catch { return {}; }
}

/* ------------------------------ configuration and Telnyx ------------------------------ */

/** Texting needs the key, the webhook key, Odelia's number and its messaging profile. */
export const smsReady = (env: Env) => !!(env("TELNYX_API_KEY") && env("TELNYX_PUBLIC_KEY") && env("ODELIA_NUMBER") && env("TELNYX_MESSAGING_PROFILE_ID"));
/** Calls also need the Call Control connection the number is on and the Telnyx AI Assistant that talks. */
export const voiceReady = (env: Env) => !!(env("TELNYX_API_KEY") && env("TELNYX_PUBLIC_KEY") && env("ODELIA_NUMBER") && env("TELNYX_VOICE_CONNECTION_ID") && env("TELNYX_ASSISTANT_ID"));
export const odeliaNumber = (env: Env) => normalizePhone(env("ODELIA_NUMBER") ?? "");

export const TELNYX = "https://api.telnyx.com/v2";
export type TelnyxResult = { ok: boolean; status: number; data?: Record<string, unknown>; code?: string; detail?: string };

export async function telnyx(env: Env, path: string, body: Record<string, unknown>, f: typeof fetch = fetch): Promise<TelnyxResult> {
  const key = env("TELNYX_API_KEY");
  if (!key) return { ok: false, status: 503, code: "not_configured" };
  try {
    const res = await f(`${TELNYX}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({})) as { data?: Record<string, unknown>; errors?: { code?: string; detail?: string; title?: string }[] };
    if (res.ok) return { ok: true, status: res.status, data: j.data };
    const e = j.errors?.[0];
    return { ok: false, status: res.status, code: String(e?.code ?? res.status), detail: String(e?.detail ?? e?.title ?? "").slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 502, code: "network", detail: String(e).slice(0, 200) };
  }
}

/** Text one message from Odelia's number. code 40300 means they texted STOP (Telnyx blocks the send). */
export async function sendSms(env: Env, to: string, text: string, f: typeof fetch = fetch): Promise<TelnyxResult & { id?: string }> {
  if (!smsReady(env)) return { ok: false, status: 503, code: "not_configured" };
  const out = await telnyx(env, "/messages", { from: odeliaNumber(env), to, text, messaging_profile_id: env("TELNYX_MESSAGING_PROFILE_ID"), type: "SMS" }, f);
  return { ...out, id: typeof out.data?.id === "string" ? out.data.id : undefined };
}
export const BLOCKED_BY_STOP = "40300";

/* ------------------------------ links and words ------------------------------ */

export const appOrigin = (env: Env) => ((env("APP_ORIGINS") ?? "").split(",")[0] ?? "").trim().replace(/\/+$/, "");
/** The app, opened on a workspace, and on one approval when given (the app shows that approval's card), or on "ready":
 *  everything waiting, in Odelia's panel, where whatever passed every check is approved with one tap. */
export function appLink(origin: string, ws?: string | null, approval?: string | null): string {
  if (!origin) return "";
  const q = new URLSearchParams();
  if (ws) q.set("ws", ws);
  if (approval) q.set("approval", approval);
  const qs = q.toString();
  return `${origin}/app/${qs ? "?" + qs : ""}`;
}

export const SAY = {
  ack: { en: "On it.", zh: "收到，正在处理。" },
  busy: { en: "I'm still working on your last request. I'll text you when it's done.", zh: "我还在处理上一个请求，完成后会发短信告诉您。" },
  noPlan: { en: "This workspace doesn't have a plan yet. Open Placetta to start one.", zh: "这个工作区还没有开通方案。请打开快哉开通。" },
  noWorkspace: { en: "Your number is linked, but you're not on a Placetta workspace anymore.", zh: "您的号码已关联，但您已不在任何快哉工作区中。" },
  failed: { en: "Sorry, I hit a problem on that one. Try again, or open Placetta.", zh: "抱歉，这件事处理时出了问题。请再试一次，或打开快哉。" },
  stranger: { en: "This is Odelia from Placetta. This number isn't linked to an account. To text me, link it in Placetta, Settings, Text and call Odelia. Reply STOP to opt out.", zh: "我是快哉的 Odelia。这个号码还没有关联账户。如需给我发短信，请在快哉的“设置”中打开“发短信或致电 Odelia”关联号码。回复 STOP 退订。" },
  picture: { en: "I can only open photos and PDFs by text. Upload other files in Placetta and I'll read them there.", zh: "短信中我只能打开照片和 PDF。其他文件请在快哉中上传，我会在那里读取。" },
  flood: { en: "That's a lot of texts at once. I'll pick up again in a little while.", zh: "短信有点多，我稍后再继续处理。" },
  approve: { en: "Approve in the app:", zh: "请在应用中批准：" },
  open: { en: "Open Placetta:", zh: "打开快哉：" },
  code: { en: (c: string) => `Your Placetta code is ${c}. It expires in 10 minutes. Don't share it.`, zh: (c: string) => `您的快哉验证码是 ${c}，10 分钟内有效。请勿告诉他人。` },
  callCode: { en: (c: string) => `Odelia: your call code is ${c}. Say it on the call. If you're not on a call with Placetta, ignore this.`, zh: (c: string) => `Odelia：您的通话验证码是 ${c}，请在电话中说出。如果您没有在和快哉通话，请忽略。` },
  switched: { en: (n: string) => `Switched to ${n}. Text me anything about it.`, zh: (n: string) => `已切换到 ${n}。有任何问题都可以发短信给我。` },
  whichWs: { en: (names: string[]) => `Which one? ${names.join(", ")}. Text "switch to" and the name.`, zh: (names: string[]) => `切换到哪一个？${names.join("、")}。请回复“切换到”加名称。` },
  callSorry: { en: "Sorry I couldn't talk just now. Text me here and I'll help.", zh: "抱歉刚才没能接听。请直接发短信给我，我来帮您。" },
  missed: { en: "Odelia from Placetta tried to call you about this:", zh: "快哉的 Odelia 刚才致电您，事由如下：" },
  linked: { en: "You're linked. Text me anything about your licenses, permits and deadlines, and I'll text you when something needs you. Reply STOP to opt out.", zh: "已关联。关于执照、许可和截止日期的任何问题都可以发短信给我，有事需要您时我也会发短信告诉您。回复 STOP 退订。" },
  codeWrong: { en: "That code doesn't match. Text the code shown in Placetta, Settings.", zh: "验证码不对。请发送快哉“设置”中显示的验证码。" },
  codeExpired: { en: "That code expired. Get a new one in Placetta, Settings.", zh: "验证码已过期。请在快哉的“设置”中获取新的验证码。" },
  codeLocked: { en: "Too many wrong codes. Get a new one in Placetta, Settings.", zh: "错误次数太多。请在快哉的“设置”中获取新的验证码。" },
  codeTaken: { en: "This number is already linked to another Placetta account.", zh: "这个号码已关联到另一个快哉账户。" },
};
