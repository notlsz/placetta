// Text to start: a business that isn't on Placetta yet sends Odelia one line ("Milk tea shop in Flushing, NY", or
// "奶茶店，纽约法拉盛") by SMS, iMessage, WhatsApp or Placetta's WeChat Official Account, and within seconds gets the
// number of permits from the registry, the first three in order with each agency and its published fee, the time to
// open, and a link to claim the full plan. No app, no account and no model: the line is read by rules
// (src/plan/line.ts) and the plan built from the registry (src/plan/start.ts), both bundled into start.js.
//
// Everything here is pure or takes what it needs, so text_start_test.ts covers it without a database: the claim
// link's signature, each channel's reply, and the decision for each text (plan, ask once, reminder, or nothing) with
// its rate limits. text_start_db.ts binds it to the database; odelia-sms and chat-events call that.
//
// The rules, in one place:
//   one reply per text at most, and none to a number outside the countries Placetta texts (ODELIA_SMS_COUNTRIES)
//   a line that can't be read gets one question ("What are you opening, and where?") per number every 90 days; an
//   answer that names only what was missing ("Flushing") is joined with the half read from before
//   ("milk tea shop"): only that reading is kept, never their words, and only for 7 days
//   once a plan was sent, other texts get nothing until it's claimed or expires, except "remind me": one reminder
//   per plan, the next day at 10am where the business is (never in quiet hours), and nothing else is ever sent first
//   per number at most 4 replies an hour and 8 a day; across everyone ODELIA_START_PER_HOUR (default 200)
//   STOP, START and HELP never get here: odelia-sms answers them first, as for everyone
import { type Env, inQuietHours, keyword, type Lang, normalizePhone, odeliaNumber, prettyPhone, smsCountryAllowed, smsReady } from "./odelia.ts";
import { linqLines, linqReady } from "./linq.ts";
import { whatsappNumber, whatsappReady } from "./whatsapp.ts";
import type { PlanForText, StartFacts, StartStep } from "./start.d.ts";

export type StartChannel = "sms" | "imessage" | "whatsapp" | "wechat";
export const START_DAYS = 7;
export const START_LIMITS = { perHour: 4, perDay: 8, globalPerHour: 200, askEveryDays: 90 };

const CJK = /[㐀-鿿]/;
export const langOf = (text: string): Lang => (CJK.test(text) ? "zh" : "en");

/* ------------------------------------------------------------------ the claim link */

const utf8 = (s: string) => new TextEncoder().encode(s);
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ID = /^[A-Za-z0-9]{10}$/;
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A new start's id: ten letters and digits, from the system's random source (about 59 bits). */
export function newStartId(): string {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < 10) { crypto.getRandomValues(buf); if (buf[0] < 248) out += ABC[buf[0] % 62]; }
  return out;
}

/** The signature over one start and its expiry: the first 16 characters of base64url(HMAC-SHA256(secret,
 *  "text-start|<id>|<exp>")). The database computes the same thing when the link is claimed (text_start_verify). */
async function startSig(secret: string, id: string, exp: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", utf8(secret) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(`text-start|${id}|${exp}`) as BufferSource))).slice(0, 16);
}

/** The claim token for a start: "<id>.<expiry in Unix seconds>.<signature>". Signed with the monitor key, the server
 *  secret odelia-sms and the database already share, so nothing new needs setting up. */
export async function signStart(secret: string, id: string, exp: number): Promise<string> {
  if (!secret || !ID.test(id) || !Number.isInteger(exp)) throw new Error("bad start");
  return `${id}.${exp}.${await startSig(secret, id, exp)}`;
}

/** The start a token names, or null when it's forged, malformed or past its expiry. Single use is the database's job
 *  (text_starts.claimed_at). */
export async function verifyStart(secret: string, token: string, nowSec = Date.now() / 1000): Promise<{ id: string; exp: number } | null> {
  const m = /^([A-Za-z0-9]{10})\.(\d{9,11})\.([A-Za-z0-9_-]{16})$/.exec(String(token ?? "").trim());
  if (!m || !secret) return null;
  const exp = Number(m[2]);
  if (exp < nowSec) return null;
  const want = await startSig(secret, m[1], exp);
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ m[3].charCodeAt(i);
  return diff === 0 ? { id: m[1], exp } : null;
}

/** Where the link goes: the app, which keeps the token through sign-in and then claims it. */
export const startLink = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/app/?s=${token}`;

/* ------------------------------------------------------------------ what the reply says */

const STATE_NAMES: Record<string, string> = { "New York": "NY", California: "CA", Texas: "TX", Illinois: "IL", Washington: "WA", Massachusetts: "MA", Pennsylvania: "PA", "New Jersey": "NJ",
  Florida: "FL", Georgia: "GA", Nevada: "NV", Arizona: "AZ", Colorado: "CO", Oregon: "OR", Minnesota: "MN", Michigan: "MI", Ohio: "OH", Hawaii: "HI", Virginia: "VA", Maryland: "MD", "North Carolina": "NC" };

/** An agency's name short enough for a text: "New York Department of State, Division of Corporations" as
 *  "NY Dept of State", "Internal Revenue Service" as "IRS". Chinese names lose only their bracketed English. */
export function agencyShort(name: string, lang: Lang): string {
  if (lang === "zh") return name.replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim() || name;
  let s = name.replace(/,.*$/, "").replace(/^Internal Revenue Service$/, "IRS").replace(/\bNew York City\b/g, "NYC").replace(/\bDepartment\b/g, "Dept").replace(/\bDivision\b/g, "Div");
  for (const [n, c] of Object.entries(STATE_NAMES)) s = s.replace(new RegExp(`^(State of )?${n}\\b`), c);
  return s.trim();
}

/** A published fee as people say it: "$200", "free", or (when the agency sets it case by case) that. */
export function feeSay(fee: number | null, currency: string, lang: Lang): string {
  if (fee === null) return lang === "zh" ? "费用由机构核定" : "fee set by the agency";
  if (fee === 0) return lang === "zh" ? "免费" : "free";
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: fee % 1 ? 2 : 0 }).format(fee); } catch { return `$${fee}`; }
}

/** "About 4 months to open", from the days the chain of permits takes; null when it can't tell or they're open. */
export function timeSay(f: Pick<StartFacts, "days" | "open">, lang: Lang): string | null {
  if (f.open || f.days === null) return null;
  const weeks = Math.max(1, Math.round(f.days / 7)), months = Math.max(1, Math.round(f.days / 30.4));
  if (lang === "zh") return f.days < 63 ? `预计约 ${weeks} 周可开业` : `预计约 ${months} 个月可开业`;
  return f.days < 63 ? `About ${weeks} week${weeks === 1 ? "" : "s"} to open` : `About ${months} month${months === 1 ? "" : "s"} to open`;
}

export type ReplyFor = { channel: StartChannel; lang: Lang; what: string; where: string; whereZh?: string; link: string; facts: StartFacts };
/** The most an SMS reply may hold, in characters: under 320. */
export const SMS_MAX = 319;

/** The reply with the plan. SMS stays under 320 characters (shortening agency names, then the wording, before ever
 *  dropping a detail); iMessage, WhatsApp and WeChat get a fuller message on several lines. */
export function planReply(r: ReplyFor): string {
  const { facts: f, lang } = r;
  const zh = lang === "zh";
  const place = zh ? (r.whereZh ?? r.where) : r.where;
  const n = f.permits, time = timeSay(f, lang);
  const stopLine = r.channel === "wechat" ? "" : zh ? "回复 STOP 退订。" : "Reply STOP to opt out.";
  if (r.channel !== "sms") {
    const bold = (s: string) => (r.channel === "whatsapp" ? `*${s}*` : s);
    const steps = f.first.map((s, i) => `${i + 1}. ${bold(s.short[lang] || s.name[lang])}\n${s.agency[lang]}${zh ? "，" : ", "}${feeSay(s.fee, s.currency, lang)}`).join("\n\n");
    const remind = zh ? (r.channel === "wechat" ? "回复“提醒我”，明天提醒您一次。" : "回复“提醒我”，明天提醒您一次；") : `Reply REMIND ME for one reminder tomorrow${r.channel === "wechat" ? "." : ","}`;
    const tail = zh ? `${remind}${stopLine}` : r.channel === "wechat" ? remind : `${remind} or STOP to opt out.`;
    return zh
      ? `快哉：在${place}开${r.what}需要 ${bold(`${n} 项许可`)}。前三项，按各机构要求的顺序：\n\n${steps}${time ? `\n\n${time}，按各机构公布的办理时间推算。` : ""}\n\n完整计划，含每份表格和费用：${r.link}\n链接 ${START_DAYS} 天内有效。${tail}`
      : `Placetta: ${r.what} in ${place} needs ${bold(`${n} permit${n === 1 ? "" : "s"}`)}. The first three, in the order the agencies want them:\n\n${steps}${time ? `\n\n${time}, from each agency's published processing time.` : ""}\n\nYour full plan, with every form and fee: ${r.link}\nThe link works for ${START_DAYS} days. ${tail}`;
  }
  // SMS: the same facts, tighter at each step until it fits
  const tries: string[] = [];
  for (let level = 0; level < 4; level++) {
    const ag = (a: { en: string; zh: string }) => (level === 0 ? (zh ? a.zh : a.en.replace(/,.*$/, "")) : agencyShort(a[lang], lang));
    const nm = (s: StartStep) => (level < 2 ? s.short[lang] || s.name[lang] : (s.short[lang] || s.name[lang]).replace(/\s+within \d+ days$/i, "").slice(0, 28));
    const items = f.first.map((s, i) => zh ? `${i + 1}）${nm(s)}，${ag(s.agency)}，${feeSay(s.fee, s.currency, lang)}` : `${i + 1}) ${nm(s)}, ${ag(s.agency)}, ${feeSay(s.fee, s.currency, lang)}`);
    tries.push(zh
      ? `快哉：在${place}开${r.what}需要 ${n} 项许可。前三项：${items.join("；")}。${time ? `${time}。` : ""}${level < 3 ? "完整计划：" : ""}${r.link} ${stopLine}`
      : `Placetta: ${r.what} in ${place} needs ${n} permit${n === 1 ? "" : "s"}. First: ${items.join("; ")}. ${time ? `${time}. ` : ""}${level < 3 ? "Full plan: " : ""}${r.link} ${stopLine}`);
  }
  const fit = tries.find((t) => t.length <= SMS_MAX);
  if (fit) return fit;
  // still too long (a very long business name): the count, the time and the link, which always fit
  return zh ? `快哉：在${place}开店需要 ${n} 项许可。${time ? `${time}。` : ""}完整计划：${r.link} ${stopLine}` : `Placetta: your plan has ${n} permit${n === 1 ? "" : "s"}. ${time ? `${time}. ` : ""}Full plan: ${r.link} ${stopLine}`;
}

/** The one question for a line that can't be read. */
export function askReply(channel: StartChannel, lang: Lang): string {
  const stop = channel === "wechat" ? "" : lang === "zh" ? "回复 STOP 退订。" : " Reply STOP to opt out.";
  return lang === "zh"
    ? `快哉：您好，我是 Odelia。您要开什么店？开在哪里？例如：奶茶店，纽约法拉盛。我会把需要的许可发给您。${stop}`
    : `Placetta: Hi, this is Odelia. What are you opening, and where? e.g. Milk tea shop in Flushing, NY. I'll text back the permits you need.${stop}`;
}

/** The answer to "remind me": when, once. */
export function remindReply(lang: Lang, already: boolean): string {
  if (already) return lang === "zh" ? "快哉：已经设好了，明天上午 10 点再发一次链接，之后不再打扰。" : "Placetta: it's already set. I'll send the link once more tomorrow at 10am, and nothing after that.";
  return lang === "zh" ? "快哉：好的。明天上午 10 点我会再发一次链接，之后不再打扰。" : "Placetta: OK. I'll send the link once more tomorrow at 10am, and nothing after that.";
}

/** The one reminder: the link again, until when it works, and how to stop. */
export function reminderText(o: { channel: StartChannel; lang: Lang; what: string; where: string; link: string; exp: number; tz: string }): string {
  const until = new Date(o.exp * 1000);
  const day = (l: string) => new Intl.DateTimeFormat(l, { timeZone: o.tz, month: l === "en-US" ? "short" : "numeric", day: "numeric" }).format(until);
  const stop = o.channel === "wechat" ? "" : o.lang === "zh" ? "回复 STOP 退订。" : " Reply STOP to opt out.";
  return o.lang === "zh"
    ? `快哉：按您的要求，这是${o.where}${o.what}的计划：${o.link} 链接在 ${day("zh-CN")} 前有效。${stop}`
    : `Placetta: as you asked, here's the plan for ${o.what} in ${o.where}: ${o.link} It works until ${day("en-US")}.${stop}`;
}

/** Someone asking for the one reminder: "remind me", "remind me tomorrow", "提醒我". */
export const wantsReminder = (text: string) =>
  /^(please\s+)?(remind\s+me|reminder|remind)(\s+(later|tomorrow|please))?[\s.!。！]*$|^(请)?(明天|稍后)?提醒(我|一下)?[\s.!。！]*$/i.test(String(text ?? "").trim());

/* ------------------------------------------------------------------ where the website says to text */

/**
 * The number and handles the website's hero shows for texting Odelia to start, or null to show nothing (the default).
 * It turns on when the founder sets ODELIA_PUBLIC_NUMBER (one of Odelia's own numbers: an iMessage line in LINQ_NUMBERS
 * or the Telnyx ODELIA_NUMBER) or ODELIA_PUBLIC_WHATSAPP (Odelia's WhatsApp number, with WhatsApp set up). The WeChat
 * account's ID (ODELIA_PUBLIC_WECHAT) shows beside them when Placetta's account is connected (ODELIA_PUBLIC_WECHAT_WS).
 * A number that doesn't reach Odelia is never shown, and nothing shows while ODELIA_TEXT_START is "off".
 */
export function publicStart(env: Env): { number: string | null; display: string | null; whatsapp: string | null; whatsapp_display: string | null; wechat: string | null } | null {
  if ((env("ODELIA_TEXT_START") ?? "").trim().toLowerCase() === "off") return null;
  const ours = new Set([...linqReady(env) ? linqLines(env) : [], ...smsReady(env) && odeliaNumber(env) ? [odeliaNumber(env)!] : []]);
  const n = normalizePhone(env("ODELIA_PUBLIC_NUMBER") ?? "");
  const number = n && ours.has(n) ? n : null;
  const w = normalizePhone(env("ODELIA_PUBLIC_WHATSAPP") ?? "");
  const whatsapp = w && whatsappReady(env) && (!whatsappNumber(env) || whatsappNumber(env) === w) ? w : null;
  if (!number && !whatsapp) return null;
  const wx = (env("ODELIA_PUBLIC_WECHAT") ?? "").trim();
  const wechat = /^[A-Za-z][\w-]{3,40}$/.test(wx) && /^[0-9a-f-]{36}$/i.test((env("ODELIA_PUBLIC_WECHAT_WS") ?? "").trim()) ? wx : null;
  return { number, display: number ? prettyPhone(number) : null, whatsapp, whatsapp_display: whatsapp ? prettyPhone(whatsapp) : null, wechat };
}

/* ------------------------------------------------------------------ when the reminder goes */

/** Each state's main time zone, for a reminder at 10am where the business is. */
const STATE_TZ: Record<string, string> = {
  CA: "America/Los_Angeles", WA: "America/Los_Angeles", OR: "America/Los_Angeles", NV: "America/Los_Angeles", AZ: "America/Phoenix", UT: "America/Denver", CO: "America/Denver",
  NM: "America/Denver", MT: "America/Denver", WY: "America/Denver", ID: "America/Boise", TX: "America/Chicago", IL: "America/Chicago", MN: "America/Chicago", WI: "America/Chicago",
  IA: "America/Chicago", MO: "America/Chicago", KS: "America/Chicago", NE: "America/Chicago", OK: "America/Chicago", AR: "America/Chicago", LA: "America/Chicago", MS: "America/Chicago",
  AL: "America/Chicago", TN: "America/Chicago", ND: "America/Chicago", SD: "America/Chicago", AK: "America/Anchorage", HI: "Pacific/Honolulu",
};
export const stateTz = (state: string) => STATE_TZ[state] ?? "America/New_York";

/** Minutes a time zone is ahead of UTC at a moment. */
function offsetMin(at: number, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(at / 60e3) * 60e3) / 60e3;
}
/** Tomorrow at 10am in that time zone (never in quiet hours, and inside WeChat's 48 hours to answer). */
export function reminderAt(now: Date, tz: string): Date {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  // 10am tomorrow as if the zone were UTC, then moved by the zone's offset (looked up twice, in case the clocks change)
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day + 1, 10, 0);
  let t = wall;
  for (let i = 0; i < 2; i++) t = wall - offsetMin(t, tz) * 60e3;
  return new Date(t);
}
/** Whether a reminder may go now: it's due and it isn't quiet hours (9pm to 8am) where the business is. */
export const reminderMayGo = (due: Date, now: Date, tz: string) => due.getTime() <= now.getTime() && !inQuietHours(now, tz);

/* ------------------------------------------------------------------ one text, start to answer */

export type OpenStart = { id: string; exp: number; what: string; where: string; lang: Lang; remindAsked: boolean; tz: string };
export type NewStart = { id: string; exp: number; plan: PlanForText; tz: string };
/** What deciding a text needs from the database (text_start_db.ts passes the real ones; tests pass stand-ins). */
export type StartDeps = {
  /** one hit against a limit: true when it's allowed (and counted), false when over (rate_hit) */
  hit: (key: string, limit: number, windowSec: number) => Promise<boolean>;
  /** the plan this sender already has and hasn't claimed, if any */
  open: (handle: string) => Promise<OpenStart | null>;
  /** keep a new start until it's claimed or expires; false when it couldn't be saved */
  save: (s: NewStart) => Promise<boolean>;
  /** set the one reminder */
  remind: (id: string, at: Date) => Promise<void>;
  /** record that this number texted in (consent to the one reply) or asked for the reminder */
  consent: (event: "texted_to_start" | "asked_reminder") => Promise<void>;
  /** the server secret the claim link is signed with */
  secret: () => Promise<string>;
  /** the app's address, for the link */
  origin: string;
  /** reads the line and builds the plan (start.js) */
  plan: (text: string, now: Date) => PlanForText | null;
  /** half a line, for an answer that names only what was missing: the business or the place (start.js readPart) */
  part?: (text: string) => { what?: string; where?: string };
  /** that half, kept for this sender until the other half comes (never their words, only what was read from them) */
  parts?: { get: (handle: string) => Promise<{ what?: string; where?: string } | null>; set: (handle: string, p: { what?: string; where?: string } | null) => Promise<void> };
};
export type StartIn = {
  channel: StartChannel; handle: string; text: string; now?: Date;
  /** the country codes Placetta texts (smsCountries); not used for WeChat, which costs nothing and has no number */
  countries?: string[];
  globalPerHour?: number;
};
export type StartOut = { kind: "plan" | "ask" | "remind" | "quiet" | "limited" | "country" | "keyword" | "failed"; reply: string | null; lang: Lang; id?: string; link?: string };

/**
 * A text from someone who isn't on Placetta: the reply to send (at most one), and why. A line that reads gets the
 * plan and its claim link; "remind me" after a plan sets the one reminder; anything else gets the one question, once,
 * or nothing.
 */
export async function textStart(i: StartIn, d: StartDeps): Promise<StartOut> {
  const now = i.now ?? new Date();
  const text = String(i.text ?? "").trim().slice(0, 600);
  const lang = langOf(text);
  const none = (kind: StartOut["kind"]): StartOut => ({ kind, reply: null, lang });
  // STOP, START and HELP are answered before this, for everyone; never as a business
  if (keyword(text)) return none("keyword");
  // a number in a country Placetta doesn't text gets nothing at all (texts there cost money and invite pumping)
  if (i.channel !== "wechat" && !smsCountryAllowed(i.handle, i.countries ?? ["1", "86"])) return none("country");
  let plan = d.plan(text, now);
  // half a line ("I want to open a milk tea shop", then "Flushing"): joined with the half they sent before
  if (!plan && d.part && d.parts) {
    const mine = d.part(text);
    if (mine.what || mine.where) {
      const before = await d.parts.get(i.handle);
      const what = mine.what ?? before?.what, where = mine.where ?? before?.where;
      if (what && where) plan = d.plan(CJK.test(what) ? `${what}，${where}` : `${what} in ${where}`, now);
      if (!plan) await d.parts.set(i.handle, { ...(what ? { what } : {}), ...(where ? { where } : {}) });
    }
  }
  if (plan && d.parts) await d.parts.set(i.handle, null);
  const open = plan ? null : await d.open(i.handle);
  const kind: StartOut["kind"] = plan ? "plan" : open && wantsReminder(text) ? "remind" : open ? "quiet" : "ask";
  if (kind === "quiet") return none("quiet");
  // the question goes once per number every 90 days, before it counts against anything else
  if (kind === "ask" && !(await d.hit(`text_start_ask:${i.handle}`, 1, START_LIMITS.askEveryDays * 86400))) return none("quiet");
  // limits: this sender, then everyone together
  if (!(await d.hit(`text_start:${i.handle}`, START_LIMITS.perHour, 3600)) || !(await d.hit(`text_start_day:${i.handle}`, START_LIMITS.perDay, 86400))
    || !(await d.hit("text_start:all", i.globalPerHour ?? START_LIMITS.globalPerHour, 3600))) return none("limited");
  if (kind === "ask") { await d.consent("texted_to_start"); return { kind, reply: askReply(i.channel, lang), lang }; }
  if (kind === "remind") {
    const o = open!;
    if (!o.remindAsked) { await d.remind(o.id, reminderAt(now, o.tz)); await d.consent("asked_reminder"); }
    return { kind, reply: remindReply(o.lang, o.remindAsked), lang: o.lang, id: o.id };
  }
  const p = plan!;
  const id = newStartId(), exp = Math.floor(now.getTime() / 1000) + START_DAYS * 86400, tz = stateTz(p.line.state);
  const secret = await d.secret();
  if (!secret || !d.origin || !(await d.save({ id, exp, plan: p, tz }))) return none("failed");
  await d.consent("texted_to_start");
  const link = startLink(d.origin, await signStart(secret, id, exp));
  const l = p.line.lang;
  return { kind, lang: l, id, link, reply: planReply({ channel: i.channel, lang: l, what: p.line.what, where: p.line.where, whereZh: p.line.whereZh, link, facts: p.facts }) };
}
