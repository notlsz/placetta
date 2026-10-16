var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// supabase/functions/odelia-sms/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// supabase/functions/_shared/odelia.ts
function normalizePhone(input) {
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
function prettyPhone(e164) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e164;
}
function b64bytes(s) {
  const b642 = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b642 + "===".slice((b642.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
var utf8 = (s) => new TextEncoder().encode(s);
async function verifyTelnyx(raw, signature, timestamp, publicKey, nowSec = Date.now() / 1e3, toleranceSec = 300) {
  if (!raw || !signature || !timestamp || !publicKey) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  try {
    const key = await crypto.subtle.importKey("raw", b64bytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, b64bytes(signature), utf8(`${timestamp}|${raw}`));
  } catch {
    return false;
  }
}
var STOP = /* @__PURE__ */ new Set(["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT OUT", "REVOKE", "\u9000\u8BA2", "TD"]);
var START = /* @__PURE__ */ new Set(["START", "UNSTOP", "SUBSCRIBE", "RESUME"]);
var HELP = /* @__PURE__ */ new Set(["HELP", "INFO", "\u5E2E\u52A9"]);
var OPT_OUT_PHRASE = /^(PLEASE )?(STOP|DON'?T|DO NOT|NO MORE) (TEXTING|TEXT|MESSAGING|CALLING|CALL|CONTACTING)( ME)?( ANYMORE| AGAIN)?( PLEASE)?$|^(REMOVE ME|TAKE ME OFF( YOUR LIST)?|LEAVE ME ALONE)$|^(不要再?(发短信|打电话|联系我)了?|别再?(发|打)了?)$/u;
function keyword(text) {
  if (typeof text !== "string") return null;
  const k = text.trim().replace(/[\s.!?。！？]+$/u, "").replace(/\s+/g, " ").toUpperCase();
  if (STOP.has(k) || OPT_OUT_PHRASE.test(k)) return "stop";
  if (START.has(k)) return "start";
  if (HELP.has(k)) return "help";
  return null;
}
var KEYWORD_REPLY = {
  stop: { en: "Placetta: you won't get more texts from Odelia. Reply START to turn them back on.", zh: "\u5FEB\u54C9\uFF1AOdelia \u5C06\u4E0D\u518D\u7ED9\u60A8\u53D1\u77ED\u4FE1\u3002\u56DE\u590D START \u53EF\u91CD\u65B0\u5F00\u542F\u3002" },
  start: { en: "Placetta: texts from Odelia are back on. Reply STOP to opt out, HELP for help. Msg and data rates may apply.", zh: "\u5FEB\u54C9\uFF1A\u5DF2\u91CD\u65B0\u5F00\u542F Odelia \u7684\u77ED\u4FE1\u3002\u56DE\u590D STOP \u9000\u8BA2\uFF0C\u56DE\u590D HELP \u83B7\u53D6\u5E2E\u52A9\u3002\u53EF\u80FD\u4EA7\u751F\u77ED\u4FE1\u548C\u6D41\u91CF\u8D39\u7528\u3002" },
  help: { en: "Placetta: text Odelia about your licenses, permits and deadlines. Help: support@placetta.com. Reply STOP to opt out. Msg and data rates may apply.", zh: "\u5FEB\u54C9\uFF1A\u53EF\u4EE5\u53D1\u77ED\u4FE1\u95EE Odelia \u5173\u4E8E\u6267\u7167\u3001\u8BB8\u53EF\u548C\u622A\u6B62\u65E5\u671F\u7684\u95EE\u9898\u3002\u5E2E\u52A9\uFF1Asupport@placetta.com\u3002\u56DE\u590D STOP \u9000\u8BA2\u3002\u53EF\u80FD\u4EA7\u751F\u77ED\u4FE1\u548C\u6D41\u91CF\u8D39\u7528\u3002" }
};
function switchTarget(text) {
  if (typeof text !== "string") return null;
  const t = text.trim();
  const m = /^(?:switch|change)\s+(?:to\s+)?(.{1,120}?)[\s.!。！]*$/i.exec(t) ?? /^(?:切换到|切换至|换到)\s*(.{1,120}?)[\s。！]*$/.exec(t);
  return m ? m[1].trim() || null : null;
}
function pickWorkspace(list, name) {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const exact = list.filter((w) => w.name.trim().toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const part = list.filter((w) => w.name.toLowerCase().includes(q));
  return part.length === 1 ? part[0] : null;
}
function plainText(s) {
  const lines = String(s ?? "").replace(/```[a-z]*\n?([\s\S]*?)```/gi, "$1").replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)").replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,!?:;]|$)/g, "$1$2").replace(/`([^`]+)`/g, "$1").replace(/\s*[—–]\s*/g, ", ").split(/\n/).map((l) => l.replace(/^\s*(#{1,6}|>|[-*+•·]|\d+[.)])\s+/, "").replace(/^\s*\|.*\|\s*$/, (row) => row.split("|").map((c) => c.trim()).filter(Boolean).join(", ")).trim()).filter((l) => l && !/^[-|:\s]+$/.test(l));
  return lines.map((l, i) => i < lines.length - 1 && !/[.!?。！？:：,，;；]$/.test(l) ? l + (/[㐀-鿿]$/.test(l) ? "\u3002" : ".") : l).join(" ").replace(/\s+([。！？，])/g, "$1").replace(/([。！？，])\s+/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
var GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
var isGsm = (s) => GSM.test(s);
var textLimit = (s) => isGsm(s) ? 306 : 134;
function sentences(s) {
  return s.match(/[^.!?。！？]+(?:[.!?。！？]+["')\]]*|$)\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
}
function hardSplit(s, limit) {
  const out = [];
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
function splitSms(text, o = {}) {
  const max = Math.max(1, o.max ?? 3);
  const body = plainText(text);
  const all = body + (o.tail ? " " + o.tail : "");
  const limit = textLimit(all + (o.more ?? ""));
  const join = (a, b) => a ? /[㐀-鿿。！？]$/.test(a) && /^[㐀-鿿]/.test(b) ? a + b : a + " " + b : b;
  const pack = (parts) => {
    const segs2 = [];
    let cur = "";
    for (const p of parts.flatMap((x) => x.length > limit ? hardSplit(x, limit) : [x])) {
      const next = join(cur, p);
      if (next.length <= limit) cur = next;
      else {
        if (cur) segs2.push(cur);
        cur = p;
      }
    }
    if (cur) segs2.push(cur);
    return segs2;
  };
  const tail = o.tail?.trim() ?? "";
  const segs = pack([...sentences(body), ...tail ? [tail] : []]);
  if (segs.length <= max) return segs.length ? segs : tail ? [tail] : [];
  const moreNote = o.more ? o.lang === "zh" ? `\u5B8C\u6574\u5185\u5BB9\uFF1A${o.more}` : `More: ${o.more}` : "";
  const end = [moreNote, tail].filter(Boolean).join(" ");
  const kept = segs.slice(0, max);
  const room = limit - end.length - 2;
  let last = kept[max - 1].replace(tail, "").trim();
  if (last.length > room) last = last.slice(0, Math.max(0, room)).replace(/\s+\S*$/, "");
  kept[max - 1] = (last ? last.replace(/[\s,;:，；：]+$/, "") + "\u2026 " : "") + end;
  return kept.map((s) => s.trim()).filter(Boolean);
}
var LIMITS = { textsPerDay: 3, callsPerDay: 1, inboundPerHour: 30, strangerDays: 90, maxQueuedHours: 48, newChatsPerLine: 25 };
function validTz(tz) {
  if (typeof tz === "string" && tz.length <= 64) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return tz;
    } catch {
    }
  }
  return "America/Los_Angeles";
}
var hm = (s, d) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? "");
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : d;
};
function localMinutes(now, tz) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: validTz(tz), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0), m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h % 24 * 60 + m;
}
function inQuietHours(now, tz, start = "21:00", end = "08:00") {
  const m = localMinutes(now, tz), s = hm(start, 21 * 60), e = hm(end, 8 * 60);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
function underDailyLimit(kind, sentToday) {
  return sentToday < (kind === "call" ? LIMITS.callsPerDay : LIMITS.textsPerDay);
}
function strangerMayGetReply(lastRepliedAt, now) {
  if (!lastRepliedAt) return true;
  const t = Date.parse(lastRepliedAt);
  return !Number.isFinite(t) || now.getTime() - t > LIMITS.strangerDays * 864e5;
}
var inboundFlood = (lastHour) => lastHour >= LIMITS.inboundPerHour;
function randomCode(n) {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) out += String(buf[0] % 10);
  }
  return out;
}
var smsReady = (env2) => !!(env2("TELNYX_API_KEY") && env2("TELNYX_PUBLIC_KEY") && env2("ODELIA_NUMBER") && env2("TELNYX_MESSAGING_PROFILE_ID"));
var voiceReady = (env2) => !!(env2("TELNYX_API_KEY") && env2("TELNYX_PUBLIC_KEY") && env2("ODELIA_NUMBER") && env2("TELNYX_VOICE_CONNECTION_ID") && env2("TELNYX_ASSISTANT_ID"));
var odeliaNumber = (env2) => normalizePhone(env2("ODELIA_NUMBER") ?? "");
var TELNYX = "https://api.telnyx.com/v2";
async function telnyx(env2, path, body, f = fetch) {
  const key = env2("TELNYX_API_KEY");
  if (!key) return { ok: false, status: 503, code: "not_configured" };
  try {
    const res = await f(`${TELNYX}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15e3)
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, status: res.status, data: j.data };
    const e = j.errors?.[0];
    return { ok: false, status: res.status, code: String(e?.code ?? res.status), detail: String(e?.detail ?? e?.title ?? "").slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 502, code: "network", detail: String(e).slice(0, 200) };
  }
}
async function sendSms(env2, to, text, f = fetch) {
  if (!smsReady(env2)) return { ok: false, status: 503, code: "not_configured" };
  const out = await telnyx(env2, "/messages", { from: odeliaNumber(env2), to, text, messaging_profile_id: env2("TELNYX_MESSAGING_PROFILE_ID"), type: "SMS" }, f);
  return { ...out, id: typeof out.data?.id === "string" ? out.data.id : void 0 };
}
var BLOCKED_BY_STOP = "40300";
var appOrigin = (env2) => ((env2("APP_ORIGINS") ?? "").split(",")[0] ?? "").trim().replace(/\/+$/, "");
function appLink(origin, ws, approval) {
  if (!origin) return "";
  const q = new URLSearchParams();
  if (ws) q.set("ws", ws);
  if (approval) q.set("approval", approval);
  const qs = q.toString();
  return `${origin}/app/${qs ? "?" + qs : ""}`;
}
var SAY = {
  ack: { en: "On it.", zh: "\u6536\u5230\uFF0C\u6B63\u5728\u5904\u7406\u3002" },
  busy: { en: "I'm still working on your last request. I'll text you when it's done.", zh: "\u6211\u8FD8\u5728\u5904\u7406\u4E0A\u4E00\u4E2A\u8BF7\u6C42\uFF0C\u5B8C\u6210\u540E\u4F1A\u53D1\u77ED\u4FE1\u544A\u8BC9\u60A8\u3002" },
  noPlan: { en: "This workspace doesn't have a plan yet. Open Placetta to start one.", zh: "\u8FD9\u4E2A\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u5F00\u901A\u65B9\u6848\u3002\u8BF7\u6253\u5F00\u5FEB\u54C9\u5F00\u901A\u3002" },
  noWorkspace: { en: "Your number is linked, but you're not on a Placetta workspace anymore.", zh: "\u60A8\u7684\u53F7\u7801\u5DF2\u5173\u8054\uFF0C\u4F46\u60A8\u5DF2\u4E0D\u5728\u4EFB\u4F55\u5FEB\u54C9\u5DE5\u4F5C\u533A\u4E2D\u3002" },
  failed: { en: "Sorry, I hit a problem on that one. Try again, or open Placetta.", zh: "\u62B1\u6B49\uFF0C\u8FD9\u4EF6\u4E8B\u5904\u7406\u65F6\u51FA\u4E86\u95EE\u9898\u3002\u8BF7\u518D\u8BD5\u4E00\u6B21\uFF0C\u6216\u6253\u5F00\u5FEB\u54C9\u3002" },
  stranger: { en: "This is Odelia from Placetta. This number isn't linked to an account. To text me, link it in Placetta, Settings, Text and call Odelia. Reply STOP to opt out.", zh: "\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002\u8FD9\u4E2A\u53F7\u7801\u8FD8\u6CA1\u6709\u5173\u8054\u8D26\u6237\u3002\u5982\u9700\u7ED9\u6211\u53D1\u77ED\u4FE1\uFF0C\u8BF7\u5728\u5FEB\u54C9\u7684\u201C\u8BBE\u7F6E\u201D\u4E2D\u6253\u5F00\u201C\u53D1\u77ED\u4FE1\u6216\u81F4\u7535 Odelia\u201D\u5173\u8054\u53F7\u7801\u3002\u56DE\u590D STOP \u9000\u8BA2\u3002" },
  picture: { en: "I can only open photos and PDFs by text. Upload other files in Placetta and I'll read them there.", zh: "\u77ED\u4FE1\u4E2D\u6211\u53EA\u80FD\u6253\u5F00\u7167\u7247\u548C PDF\u3002\u5176\u4ED6\u6587\u4EF6\u8BF7\u5728\u5FEB\u54C9\u4E2D\u4E0A\u4F20\uFF0C\u6211\u4F1A\u5728\u90A3\u91CC\u8BFB\u53D6\u3002" },
  flood: { en: "That's a lot of texts at once. I'll pick up again in a little while.", zh: "\u77ED\u4FE1\u6709\u70B9\u591A\uFF0C\u6211\u7A0D\u540E\u518D\u7EE7\u7EED\u5904\u7406\u3002" },
  approve: { en: "Approve in the app:", zh: "\u8BF7\u5728\u5E94\u7528\u4E2D\u6279\u51C6\uFF1A" },
  open: { en: "Open Placetta:", zh: "\u6253\u5F00\u5FEB\u54C9\uFF1A" },
  code: { en: (c) => `Your Placetta code is ${c}. It expires in 10 minutes. Don't share it.`, zh: (c) => `\u60A8\u7684\u5FEB\u54C9\u9A8C\u8BC1\u7801\u662F ${c}\uFF0C10 \u5206\u949F\u5185\u6709\u6548\u3002\u8BF7\u52FF\u544A\u8BC9\u4ED6\u4EBA\u3002` },
  callCode: { en: (c) => `Odelia: your call code is ${c}. Say it on the call. If you're not on a call with Placetta, ignore this.`, zh: (c) => `Odelia\uFF1A\u60A8\u7684\u901A\u8BDD\u9A8C\u8BC1\u7801\u662F ${c}\uFF0C\u8BF7\u5728\u7535\u8BDD\u4E2D\u8BF4\u51FA\u3002\u5982\u679C\u60A8\u6CA1\u6709\u5728\u548C\u5FEB\u54C9\u901A\u8BDD\uFF0C\u8BF7\u5FFD\u7565\u3002` },
  switched: { en: (n) => `Switched to ${n}. Text me anything about it.`, zh: (n) => `\u5DF2\u5207\u6362\u5230 ${n}\u3002\u6709\u4EFB\u4F55\u95EE\u9898\u90FD\u53EF\u4EE5\u53D1\u77ED\u4FE1\u7ED9\u6211\u3002` },
  whichWs: { en: (names) => `Which one? ${names.join(", ")}. Text "switch to" and the name.`, zh: (names) => `\u5207\u6362\u5230\u54EA\u4E00\u4E2A\uFF1F${names.join("\u3001")}\u3002\u8BF7\u56DE\u590D\u201C\u5207\u6362\u5230\u201D\u52A0\u540D\u79F0\u3002` },
  callSorry: { en: "Sorry I couldn't talk just now. Text me here and I'll help.", zh: "\u62B1\u6B49\u521A\u624D\u6CA1\u80FD\u63A5\u542C\u3002\u8BF7\u76F4\u63A5\u53D1\u77ED\u4FE1\u7ED9\u6211\uFF0C\u6211\u6765\u5E2E\u60A8\u3002" },
  missed: { en: "Odelia from Placetta tried to call you about this:", zh: "\u5FEB\u54C9\u7684 Odelia \u521A\u624D\u81F4\u7535\u60A8\uFF0C\u4E8B\u7531\u5982\u4E0B\uFF1A" }
};

// supabase/functions/_shared/linq.ts
var LINQ = "https://api.linqapp.com/api/partner";
var LINQ_OPTED_OUT = 2024;
var LINQ_LINE_RESTRICTED = 2027;
var LINQ_BAD_PARAM = 1005;
function linqLines(env2) {
  const seen = /* @__PURE__ */ new Set();
  for (const raw of (env2("LINQ_NUMBERS") ?? "").split(",")) {
    const n = normalizePhone(raw.trim());
    if (n) seen.add(n);
  }
  return [...seen];
}
var linqReady = (env2) => !!(env2("LINQ_API_KEY") && env2("LINQ_WEBHOOK_SECRET") && linqLines(env2).length);
var enc = new TextEncoder();
function b64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s) {
  try {
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
function sameString(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function verifyLinq(raw, headers, secret, nowSec = Date.now() / 1e3, toleranceSec = 300) {
  const ts = Number(headers.timestamp);
  if (!secret || !headers.id || !headers.signature || !Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const key = unb64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  if (!key || !key.length) return false;
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = b64(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${headers.id}.${headers.timestamp}.${raw}`))));
  return headers.signature.split(" ").some((s) => {
    const [v, sig] = s.split(",");
    return v === "v1" && !!sig && sameString(sig, want);
  });
}
function parseLinq(ev) {
  if (ev.event_type !== "message.received") return { skip: "not_a_message" };
  const d = ev.data ?? {};
  if (d.direction === "outbound" || d.is_from_me === true || d.sender_handle?.is_me) return { skip: "outbound" };
  if (d.chat?.is_group) return { skip: "group" };
  if (d.reconciled_at) return { skip: "late" };
  const from = normalizePhone(d.sender_handle?.handle ?? d.from ?? "");
  const id = String(d.id ?? d.message?.id ?? ev.event_id ?? "");
  if (!from || !id) return { skip: "no_sender" };
  const parts = Array.isArray(d.parts) ? d.parts : Array.isArray(d.message?.parts) ? d.message.parts : [];
  if (!parts.length && d.zero_retention) return { skip: "empty_zero_retention" };
  const text = parts.filter((p) => p.type === "text" && typeof p.value === "string").map((p) => p.value.trim()).filter(Boolean).join("\n").slice(0, 1600);
  const media = parts.filter((p) => p.type === "media" && typeof p.url === "string").map((p) => ({ url: p.url, content_type: String(p.mime_type ?? ""), size: Number(p.size_bytes ?? 0) }));
  const service = d.service === "SMS" || d.service === "RCS" ? d.service : "iMessage";
  return { id: `linq:${id}`, from, to: normalizePhone(d.chat?.owner_handle?.handle ?? d.recipient_phone ?? ""), text, chat: d.chat?.id ?? d.chat_id ?? null, service, media };
}
async function call(env2, method, path, body, f) {
  const res = await f(`${LINQ}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env2("LINQ_API_KEY")}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    signal: AbortSignal.timeout(15e3)
  });
  return { status: res.status, j: await res.json().catch(() => ({})) };
}
var errOf = (status, j) => {
  const e = j.error ?? {};
  return { ok: false, status, code: typeof e.code === "number" ? e.code : void 0, detail: String(e.message ?? "").slice(0, 200) };
};
var URLS = /https?:\/\/\S+/g;
var hasUrl = (s) => /https?:\/\/\S+/.test(s);
async function linqSend(env2, o, f = fetch) {
  if (!env2("LINQ_API_KEY")) return { ok: false, status: 503, detail: "not_configured" };
  const send = async (text, key) => {
    const { status, j } = await call(env2, "POST", "/v3/chats", {
      from: o.from,
      to: [o.to],
      message: { parts: [{ type: "text", value: text }], ...key ? { idempotency_key: key } : {} },
      ...o.courtesy ? { override_optout: true } : {}
    }, f);
    if (status >= 200 && status < 300) {
      const chat = j.chat ?? {};
      return { ok: true, status, id: chat.message?.id, chat: chat.id, service: chat.service };
    }
    return errOf(status, j);
  };
  try {
    const r = await send(o.text, o.key);
    if (r.ok || r.code !== LINQ_BAD_PARAM || !hasUrl(o.text)) return r;
    const links = o.text.match(URLS) ?? [];
    const words = o.text.replace(URLS, "").replace(/[ \t]+\n/g, "\n").replace(/\s*[:：]\s*$/, "").replace(/[ \t]{2,}/g, " ").trim();
    const first = await send(words || "Odelia from Placetta.", o.key ? `${o.key}:w` : void 0);
    if (!first.ok || !first.chat) return first;
    const { status, j } = await call(env2, "POST", `/v3/chats/${encodeURIComponent(first.chat)}/messages`, {
      message: { parts: [{ type: "text", value: links.join("\n") }], ...o.key ? { idempotency_key: `${o.key}:l` } : {} }
    }, f);
    if (status >= 200 && status < 300) return { ...first, id: String((j.message ?? {}).id ?? first.id) };
    return { ...errOf(status, j), id: first.id, chat: first.chat };
  } catch (e) {
    return { ok: false, status: 502, detail: String(e).slice(0, 200) };
  }
}
async function linqTyping(env2, chat, f = fetch) {
  if (!env2("LINQ_API_KEY") || !chat) return false;
  try {
    return (await call(env2, "POST", `/v3/chats/${encodeURIComponent(chat)}/typing`, void 0, f)).status < 300;
  } catch {
    return false;
  }
}
async function linqLineHealth(env2, f = fetch) {
  if (!env2("LINQ_API_KEY")) return null;
  try {
    const { status, j } = await call(env2, "GET", "/v3/phone_numbers", void 0, f);
    if (status >= 300) return null;
    const ours = new Set(linqLines(env2));
    return (j.phone_numbers ?? []).map((p) => ({ number: normalizePhone(p.phone_number ?? "") ?? "", reputation: ["AT_RISK", "CRITICAL"].includes(String(p.reputation?.status)) ? p.reputation.status : "HEALTHY", doc_url: p.reputation?.doc_url })).filter((p) => ours.has(p.number));
  } catch {
    return null;
  }
}
function hashLine(lines, number) {
  if (!lines.length) return null;
  let h = 2166136261;
  for (const c of number) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return lines[(h >>> 0) % lines.length];
}
function pickLine(lines, o) {
  const usable = lines.filter((l) => !o.critical?.has(l));
  if (o.stored && lines.includes(o.stored) && (o.reply || !o.critical?.has(o.stored))) return o.stored;
  return hashLine(usable, o.number);
}

// supabase/functions/_shared/odelia_db.ts
var LINK_COLS = "user_id, number, verified_at, texts_on, calls_on, quiet_start, quiet_end, tz, lang, last_workspace_id, opted_out_at, line";
async function linkByNumber(admin2, number) {
  const { data } = await admin2.from("phone_links").select(LINK_COLS).eq("number", number).not("verified_at", "is", null).maybeSingle();
  return data ?? null;
}
async function linkOf(admin2, userId) {
  const { data } = await admin2.from("phone_links").select(LINK_COLS).eq("user_id", userId).maybeSingle();
  return data ?? null;
}
async function logMessage(admin2, row) {
  const { data, error } = await admin2.from("odelia_messages").insert({ ...row, body: row.body.slice(0, 2e3), workspace_id: row.workspace_id ?? null, provider_id: row.provider_id ?? null, run_id: row.run_id ?? null, line: row.line ?? null, service: row.service ?? null }).select("id").maybeSingle();
  if (error && error.code !== "23505") console.error("odelia log", error.code);
  return error ? null : data?.id ?? null;
}
var textingReady = (env2) => linqReady(env2) || smsReady(env2);
var critical = null;
var forgetCriticalLines = () => {
  critical = null;
};
async function criticalLines(admin2) {
  if (critical && Date.now() - critical.at < 6e4) return critical.set;
  const { data } = await admin2.from("odelia_lines").select("number").eq("reputation", "CRITICAL");
  critical = { at: Date.now(), set: new Set((data ?? []).map((r) => String(r.number))) };
  return critical.set;
}
async function sendText(admin2, env2, o, f = fetch) {
  if (linqReady(env2) && !o.smsOnly) {
    const lines = linqLines(env2), bad = new Set(await criticalLines(admin2));
    for (let tries = 0; tries < lines.length; tries++) {
      const line = pickLine(lines, { stored: tries ? null : o.line, number: o.to, critical: bad, reply: o.reply });
      if (!line) break;
      const r2 = await linqSend(env2, { from: line, to: o.to, text: o.text, key: o.key, courtesy: o.courtesy }, f);
      if (r2.ok) return { ok: true, status: r2.status, id: r2.id ? `linq:${r2.id}` : void 0, line, service: r2.service ?? "iMessage", chat: r2.chat };
      if (r2.code === LINQ_OPTED_OUT) return { ok: false, status: r2.status, code: BLOCKED_BY_STOP, detail: r2.detail, line, service: "iMessage" };
      if (r2.code === LINQ_LINE_RESTRICTED || r2.code === 4002 || r2.code === 4008) {
        bad.add(line);
        continue;
      }
      return { ok: false, status: r2.status, code: String(r2.code ?? r2.status), detail: r2.detail, line, service: "iMessage" };
    }
    if (!smsReady(env2)) return { ok: false, status: 503, code: "no_line", line: null, service: "iMessage" };
  }
  const r = await sendSms(env2, o.to, o.text, f);
  return { ok: r.ok, status: r.status, code: r.code, detail: r.detail, id: r.id, line: null, service: "SMS" };
}
async function textUser(admin2, env2, o) {
  if (o.link.opted_out_at) return { ok: false, sent: 0, code: "opted_out" };
  const reply = ["reply", "ack", "system", "chat", "missed"].includes(o.kind);
  let sent = 0, line = o.link.line ?? null;
  for (const text of o.segments) {
    const r = await sendText(admin2, env2, { to: o.link.number, text, line, reply });
    if (!r.ok) {
      console.error("odelia text", r.status, r.code, r.detail);
      if (r.code === BLOCKED_BY_STOP) await admin2.from("phone_links").update({ opted_out_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", o.link.user_id);
      return { ok: false, sent, code: r.code };
    }
    sent++;
    if (r.line && r.line !== line) {
      line = r.line;
      await admin2.from("phone_links").update({ line, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", o.link.user_id);
    }
    await logMessage(admin2, { user_id: o.link.user_id, workspace_id: o.workspace_id, direction: "out", channel: "sms", kind: o.kind, body: o.logBody ?? text, provider_id: r.id, run_id: o.run_id, line: r.line, service: r.service });
  }
  return { ok: true, sent };
}
async function workspacesOf(admin2, userId) {
  const { data } = await admin2.from("workspace_members").select("role, workspaces(id, name, created_at)").eq("user_id", userId);
  return (data ?? []).filter((m) => m.workspaces).sort((a, b) => (b.workspaces.created_at ?? "").localeCompare(a.workspaces.created_at ?? "")).map((m) => ({ id: m.workspaces.id, name: String(m.workspaces.name ?? ""), role: m.role }));
}
async function currentWorkspace(admin2, link) {
  const all = await workspacesOf(admin2, link.user_id);
  if (!all.length) return { ws: null, all };
  let ws = all.find((w) => w.id === link.last_workspace_id) ?? null;
  if (!ws && all.length > 1) {
    const { data } = await admin2.from("agent_runs").select("workspace_id").eq("created_by", link.user_id).order("created_at", { ascending: false }).limit(1);
    ws = all.find((w) => w.id === data?.[0]?.workspace_id) ?? null;
  }
  return { ws: ws ?? all[0], all };
}

// supabase/functions/odelia-sms/index.ts
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
var env = (k) => Deno.env.get(k);
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var ACK_AFTER_MS = 8e3;
var CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
var fail = (status, code, message) => json(status, { error: { code, message } });
var bg = (p) => {
  const rt = globalThis.EdgeRuntime;
  if (rt) rt.waitUntil(p);
  else void p;
};
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function monitorKeyOk(key) {
  if (!key) return false;
  const { data } = await admin.rpc("monitor_key_ok", { p_key: key });
  return data === true;
}
var selfKey = null;
async function monitorKey() {
  if (!selfKey) {
    const { data } = await admin.rpc("monitor_key");
    selfKey = typeof data === "string" ? data : "";
  }
  return selfKey;
}
var internal = async (fn, body) => fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() }, body: JSON.stringify(body), signal: AbortSignal.timeout(2e4) });
async function textNumber(to, text, userId = null, via = {}, courtesy = false) {
  const r = await sendText(admin, env, { to, text, line: via.line, reply: true, courtesy });
  if (r.ok) await logMessage(admin, { user_id: userId, direction: "out", channel: "sms", kind: "system", body: userId ? text : "", provider_id: r.id, line: r.line, service: r.service });
  else console.error("odelia text", r.status, r.code, r.detail);
  return r.ok;
}
async function inbound(p, logId, via = {}) {
  const now = /* @__PURE__ */ new Date();
  const from = normalizePhone(p.from?.phone_number);
  const text = String(p.text ?? "").trim().slice(0, 1600);
  const link = await linkByNumber(admin, from);
  const lang = link?.lang ?? (/[㐀-鿿]/.test(text) ? "zh" : "en");
  const telnyxAnswered = typeof p.autoresponse_type === "string" && p.autoresponse_type.length > 0;
  const kw = keyword(text);
  if (kw === "stop") {
    if (link) {
      await admin.from("phone_links").update({ opted_out_at: now.toISOString(), updated_at: now.toISOString() }).eq("user_id", link.user_id);
      await admin.from("odelia_outbox").update({ dropped_at: now.toISOString(), note: "opted_out" }).eq("user_id", link.user_id).is("sent_at", null).is("dropped_at", null);
    } else await admin.from("odelia_strangers").upsert({ number: from, opted_out_at: now.toISOString(), last_at: now.toISOString() }, { onConflict: "number" });
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.stop[lang], link?.user_id ?? null, via, true);
    return;
  }
  if (kw === "start") {
    if (link) await admin.from("phone_links").update({ opted_out_at: null, updated_at: now.toISOString() }).eq("user_id", link.user_id);
    else await admin.from("odelia_strangers").update({ opted_out_at: null }).eq("number", from);
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.start[lang], link?.user_id ?? null, via);
    return;
  }
  if (kw === "help") {
    if (!telnyxAnswered) await textNumber(from, KEYWORD_REPLY.help[lang], link?.user_id ?? null, via);
    return;
  }
  if (!link) {
    const { data: s } = await admin.from("odelia_strangers").select("replied_at, opted_out_at, messages").eq("number", from).maybeSingle();
    const reply = !s?.opted_out_at && strangerMayGetReply(s?.replied_at, now);
    await admin.from("odelia_strangers").upsert({ number: from, last_at: now.toISOString(), messages: Number(s?.messages ?? 0) + 1, ...reply ? { replied_at: now.toISOString() } : {} }, { onConflict: "number" });
    if (reply) await textNumber(from, SAY.stranger[lang], null, via);
    return;
  }
  if (link.opted_out_at) return;
  if (via.line && via.line !== link.line) {
    await admin.from("phone_links").update({ line: via.line, updated_at: now.toISOString() }).eq("user_id", link.user_id);
    link.line = via.line;
  }
  const since = new Date(now.getTime() - 36e5).toISOString();
  const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", link.user_id).eq("direction", "in").eq("channel", "sms").gt("created_at", since);
  if (inboundFlood((count ?? 1) - 1)) {
    if ((count ?? 0) - 1 === LIMITS.inboundPerHour) await textUser(admin, env, { link, segments: [SAY.flood[lang]], kind: "system" });
    return;
  }
  const { ws, all } = await currentWorkspace(admin, link);
  if (!ws) {
    await textUser(admin, env, { link, segments: [SAY.noWorkspace[lang]], kind: "system" });
    return;
  }
  await admin.from("odelia_messages").update({ workspace_id: ws.id }).eq("id", logId);
  const target = switchTarget(text);
  if (target && all.length) {
    const hit = pickWorkspace(all, target);
    if (hit) {
      await admin.from("phone_links").update({ last_workspace_id: hit.id, updated_at: now.toISOString() }).eq("user_id", link.user_id);
      await textUser(admin, env, { link, workspace_id: hit.id, segments: [SAY.switched[lang](hit.name)], kind: "system" });
    } else await textUser(admin, env, { link, workspace_id: ws.id, segments: splitSms(SAY.whichWs[lang](all.map((w) => w.name).slice(0, 8)), { max: 1 }), kind: "system" });
    return;
  }
  const media = Array.isArray(p.media) ? p.media : [];
  const saved = media.length ? await saveMedia(media, ws.id, link.user_id, lang) : [];
  const skipped = media.length - saved.length;
  if (!text && !saved.length) {
    if (media.length) await textUser(admin, env, { link, workspace_id: ws.id, segments: [SAY.picture[lang]], kind: "system" });
    return;
  }
  const names = saved.map((f) => f.name).join(", ");
  const note = saved.length ? lang === "zh" ? `

\uFF08\u5BF9\u65B9\u901A\u8FC7\u77ED\u4FE1\u53D1\u6765 ${saved.length} \u4E2A\u6587\u4EF6\uFF0C\u5DF2\u5B58\u5165\u201C\u6587\u4EF6\u201D\uFF1A${names}\u3002\u8BF7\u7528 review_documents \u8BFB\u53D6\u8FD9\u4E9B\u6587\u4EF6\u540D${text ? "\uFF0C\u518D\u56DE\u7B54\u4E0A\u9762\u7684\u95EE\u9898" : "\uFF0C\u5E76\u544A\u8BC9\u5BF9\u65B9\u4F60\u8BFB\u5230\u4E86\u4EC0\u4E48\u3001\u6709\u4EC0\u4E48\u8981\u505A\u7684"}\u3002\u53EA\u8BF4\u6587\u4EF6\u91CC\u5199\u660E\u7684\u5185\u5BB9\u3002\uFF09` : `

(They texted ${saved.length} file${saved.length === 1 ? "" : "s"}, now saved in Documents: ${names}. Read ${saved.length === 1 ? "it" : "them"} with review_documents using those names${text ? ", then answer what they asked" : ", then tell them what it is and anything they need to do"}. Only say what the document itself says.)` : "";
  const lost = skipped > 0 ? lang === "zh" ? `

\uFF08\u53E6\u6709 ${skipped} \u4E2A\u9644\u4EF6\u65E0\u6CD5\u6253\u5F00\uFF0C\u53EA\u652F\u6301\u7167\u7247\u548C PDF\u3002\uFF09` : `

(${skipped} other attachment${skipped === 1 ? "" : "s"} couldn't be opened; only photos and PDFs work by text.)` : "";
  const ask = text || (lang === "zh" ? "\u6211\u53D1\u4E86\u4E00\u4E2A\u6587\u4EF6\u7ED9\u4F60\u3002" : "I sent you a file.");
  if (!text) await admin.from("odelia_messages").update({ body: ask }).eq("id", logId);
  await startRun(link, ws.id, ask + note + lost, logId, via);
}
var MEDIA_TYPES = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };
var MEDIA_MAX = 10 * 1024 * 1024;
async function saveMedia(media, ws, uid, lang) {
  const out = [];
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  for (const [i, m] of media.slice(0, 5).entries()) {
    const mime = String(m.content_type ?? "").toLowerCase().split(";")[0].trim();
    const ext = MEDIA_TYPES[mime];
    if (!ext || !m.url || (m.size ?? 0) > MEDIA_MAX) continue;
    let host = "";
    try {
      const u = new URL(m.url);
      if (u.protocol !== "https:") continue;
      host = u.hostname;
    } catch {
      continue;
    }
    try {
      const key = env("TELNYX_API_KEY");
      const res = await fetch(m.url, { headers: key && /(^|\.)telnyx\.com$/i.test(host) ? { Authorization: `Bearer ${key}` } : {} });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > MEDIA_MAX) continue;
      const name = `${lang === "zh" ? "\u77ED\u4FE1" : "Text"} ${stamp} ${i + 1}.${ext}`;
      const path = `${ws}/sms/${crypto.randomUUID()}/${name.replace(/\s+/g, "-")}`;
      const up = await admin.storage.from("documents").upload(path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
      if (up.error) continue;
      const { error } = await admin.from("documents").insert({ workspace_id: ws, name, path, size: bytes.length, mime, source: "customer", uploaded_by: uid });
      if (error) {
        await admin.storage.from("documents").remove([path]);
        continue;
      }
      out.push({ name, path, size: bytes.length, mime });
    } catch (e) {
      console.error("media", String(e).slice(0, 160));
    }
  }
  if (out.length) {
    const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const state = data?.state ?? {};
    const docs = Array.isArray(state.docs) ? state.docs : [];
    const at = (/* @__PURE__ */ new Date()).toISOString();
    const added = out.map((f) => ({ id: "d-" + crypto.randomUUID().slice(0, 8), name: f.name, kind: f.mime === "application/pdf" ? "pdf" : "jpg", size: f.size, by: "you", at, tag: { en: "Texted", zh: "\u77ED\u4FE1\u53D1\u9001" }, path: f.path }));
    await admin.from("workspaces").update({ state: { ...state, docs: [...added, ...docs] } }).eq("id", ws);
  }
  return out;
}
async function history(link, ws, beforeId) {
  const { data } = await admin.from("odelia_messages").select("id, direction, kind, body").eq("user_id", link.user_id).eq("workspace_id", ws).eq("channel", "sms").in("kind", ["chat", "reply"]).lt("id", beforeId).gt("created_at", new Date(Date.now() - 12 * 36e5).toISOString()).order("id", { ascending: false }).limit(8);
  const turns = [];
  for (const m of (data ?? []).reverse()) {
    const content = String(m.body ?? "").trim();
    if (!content) continue;
    const role = m.direction === "in" ? "user" : "assistant";
    const last = turns.at(-1);
    if (last?.role === role) last.content += "\n\n" + content;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === "assistant") turns.shift();
  return turns;
}
async function startRun(link, ws, prompt, logId, via = {}) {
  const lang = link.lang;
  if (via.chat) bg(linqTyping(env, via.chat));
  const res = await internal("agent-run", { action: "start_as", user_id: link.user_id, workspace_id: ws, prompt, channel: "sms", reply_to: link.number, lang, history: await history(link, ws, logId) }).catch(() => null);
  if (!res || res.status !== 202) {
    const code = res?.status;
    await textUser(admin, env, { link, workspace_id: ws, kind: "system", segments: [code === 409 ? SAY.busy[lang] : code === 402 ? SAY.noPlan[lang] : code === 403 ? SAY.noWorkspace[lang] : SAY.failed[lang]] });
    return;
  }
  const { id } = await res.json();
  await admin.from("odelia_messages").update({ run_id: id }).eq("id", logId);
  await sleep(ACK_AFTER_MS);
  const { data: run } = await admin.from("agent_runs").select("status").eq("id", id).maybeSingle();
  if (run?.status !== "running") return;
  const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("run_id", id).eq("direction", "out");
  if (!count) await textUser(admin, env, { link, workspace_id: ws, segments: [SAY.ack[lang]], kind: "ack", run_id: id });
}
async function linqWebhook(req) {
  const raw = await req.text();
  const h = (k) => req.headers.get(k) ?? "";
  const ok = await verifyLinq(raw, { id: h("webhook-id"), timestamp: h("webhook-timestamp"), signature: h("webhook-signature") }, env("LINQ_WEBHOOK_SECRET") ?? "");
  if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
  let ev;
  try {
    ev = JSON.parse(raw) ?? {};
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  const m = parseLinq(ev);
  if ("skip" in m) return json(200, { ok: true, skipped: m.skip });
  const lines = linqLines(env);
  if (m.to && lines.length && !lines.includes(m.to)) return json(200, { ok: true, skipped: "other_line" });
  const line = m.to ?? lines[0] ?? null;
  const link = await linkByNumber(admin, m.from);
  const logId = await logMessage(admin, { user_id: link?.user_id ?? null, direction: "in", channel: "sms", kind: "chat", body: link ? m.text.slice(0, 2e3) : "", provider_id: m.id, line, service: m.service });
  if (logId === null) return json(200, { ok: true, duplicate: true });
  const p = { id: m.id, from: { phone_number: m.from }, to: line ? [{ phone_number: line }] : [], text: m.text, media: m.media };
  bg(inbound(p, logId, { line, chat: m.chat }).catch((e) => console.error("inbound", String(e).slice(0, 200))));
  return json(200, { ok: true });
}
async function webhook(req) {
  const raw = await req.text();
  const ok = await verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519") ?? "", req.headers.get("telnyx-timestamp") ?? "", env("TELNYX_PUBLIC_KEY") ?? "");
  if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
  let ev;
  try {
    ev = JSON.parse(raw)?.data ?? {};
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  if (ev.event_type !== "message.received") return json(200, { ok: true });
  const p = ev.payload ?? {};
  const from = normalizePhone(p.from?.phone_number);
  const to = normalizePhone(p.to?.[0]?.phone_number);
  if (!from || !p.id || odeliaNumber(env) && to && to !== odeliaNumber(env)) return json(200, { ok: true });
  const link = await linkByNumber(admin, from);
  const logId = await logMessage(admin, { user_id: link?.user_id ?? null, direction: "in", channel: "sms", kind: "chat", body: link ? String(p.text ?? "").slice(0, 2e3) : "", provider_id: String(p.id) });
  if (logId === null) return json(200, { ok: true, duplicate: true });
  bg(inbound(p, logId).catch((e) => console.error("inbound", String(e).slice(0, 200))));
  return json(200, { ok: true });
}
async function sendCode(codeId) {
  if (!UUID.test(codeId)) return fail(400, "bad_request", "code_id is required.");
  const code = randomCode(6);
  const { data: c, error } = await admin.rpc("phone_code_set", { p_id: codeId, p_code: code });
  if (error || !c) return fail(404, "not_found", "That code request is gone.");
  const row = c;
  const setError = (e) => admin.from("phone_links").update({ last_error: e, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", row.user_id);
  if (!textingReady(env)) {
    await setError("not_configured");
    return fail(503, "not_configured", "Texting isn't set up: set LINQ_API_KEY, LINQ_WEBHOOK_SECRET and LINQ_NUMBERS for iMessage, or TELNYX_API_KEY, TELNYX_PUBLIC_KEY, ODELIA_NUMBER and TELNYX_MESSAGING_PROFILE_ID for SMS.");
  }
  const lang = row.lang === "zh" ? "zh" : "en";
  let line = null;
  if (linqReady(env)) {
    const { data: l } = await admin.from("phone_links").select("line").eq("user_id", row.user_id).maybeSingle();
    line = await codeLine(row.number, l?.line ?? null);
    if (!line && !smsReady(env)) {
      await setError("line_busy");
      return fail(503, "line_busy", "Every iMessage line has started as many new conversations as it safely can today.");
    }
  }
  const r = await sendText(admin, env, { to: row.number, text: SAY.code[lang](code), line, smsOnly: linqReady(env) && !line, key: `code:${codeId}` });
  if (!r.ok) {
    await setError(r.code === BLOCKED_BY_STOP ? "opted_out" : "send_failed");
    return fail(502, "upstream_error", "Couldn't send the code.");
  }
  await setError(null);
  if (r.line) await admin.from("phone_links").update({ line: r.line, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", row.user_id);
  await logMessage(admin, { user_id: row.user_id, direction: "out", channel: "sms", kind: "code", body: lang === "zh" ? "\u5DF2\u53D1\u9001\u9A8C\u8BC1\u7801" : "Sent a verification code", provider_id: r.id, line: r.line, service: r.service });
  return json(200, { ok: true });
}
async function codeLine(number, stored) {
  const bad = await criticalLines(admin);
  const lines = linqLines(env).filter((l) => !bad.has(l));
  if (!lines.length) return null;
  const day = /* @__PURE__ */ new Date();
  day.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("odelia_messages").select("line").eq("direction", "out").eq("kind", "code").in("line", lines).gte("created_at", day.toISOString());
  const used = /* @__PURE__ */ new Map();
  for (const r of data ?? []) used.set(String(r.line), (used.get(String(r.line)) ?? 0) + 1);
  const open = (l) => (used.get(l) ?? 0) < LIMITS.newChatsPerLine;
  const first = stored && lines.includes(stored) ? stored : hashLine(lines, number);
  if (first && open(first)) return first;
  return lines.filter(open).sort((a, b) => (used.get(a) ?? 0) - (used.get(b) ?? 0))[0] ?? null;
}
async function lineHealth(now = /* @__PURE__ */ new Date()) {
  const health = await linqLineHealth(env);
  if (!health) return { lines: 0 };
  const { data: old } = await admin.from("odelia_lines").select("number, reputation");
  const before = new Map((old ?? []).map((r) => [String(r.number), String(r.reputation)]));
  for (const h of health) {
    const was = before.get(h.number);
    await admin.from("odelia_lines").upsert({ number: h.number, reputation: h.reputation, doc_url: h.doc_url ?? null, checked_at: now.toISOString(), ...was !== h.reputation ? { changed_at: now.toISOString() } : {} }, { onConflict: "number" });
    if (was !== h.reputation && h.reputation !== "HEALTHY") {
      await admin.from("team_tasks").upsert({
        kind: "line_health",
        filing_id: null,
        workspace_id: null,
        title: `iMessage line ${prettyPhone(h.number)} is ${h.reputation === "CRITICAL" ? "critical: outbound paused on it" : "at risk: slow its sending"}`,
        detail: { number: h.number, reputation: h.reputation, was: was ?? null, doc_url: h.doc_url ?? null },
        dedupe: `line_health:${h.number}:${h.reputation}:${now.toISOString().slice(0, 10)}`
      }, { onConflict: "dedupe", ignoreDuplicates: true });
    }
  }
  forgetCriticalLines();
  return { lines: health.length, critical: health.filter((h) => h.reputation === "CRITICAL").length };
}
var expireOld = (now) => admin.from("odelia_outbox").update({ dropped_at: now.toISOString(), note: "expired" }).is("sent_at", null).is("dropped_at", null).lt("created_at", new Date(now.getTime() - LIMITS.maxQueuedHours * 36e5).toISOString());
async function flush(now = /* @__PURE__ */ new Date()) {
  await expireOld(now);
  const { data } = await admin.from("odelia_outbox").select("id, user_id, workspace_id, kind, urgent, body, link, created_at").is("sent_at", null).is("dropped_at", null).order("urgent", { ascending: false }).order("created_at").limit(500);
  const byUser = /* @__PURE__ */ new Map();
  for (const r of data ?? []) byUser.set(r.user_id, [...byUser.get(r.user_id) ?? [], r]);
  const mark = (ids, o) => ids.length ? admin.from("odelia_outbox").update(o).in("id", ids) : Promise.resolve();
  let texts = 0, calls = 0;
  for (const [uid, items] of byUser) {
    const link = await linkOf(admin, uid);
    if (!link?.verified_at || link.opted_out_at || !link.texts_on && !link.calls_on) {
      await mark(items.map((i) => i.id), { dropped_at: now.toISOString(), note: "no_phone" });
      continue;
    }
    if (inQuietHours(now, link.tz, link.quiet_start, link.quiet_end)) continue;
    const dayStart = new Date(now.getTime() - localMinutes(now, link.tz) * 6e4).toISOString();
    const sentToday = async (channel) => {
      const { count } = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("direction", "out").eq("channel", channel).in("kind", ["update", "urgent"]).gte("created_at", dayStart);
      return count ?? 0;
    };
    let rest = items;
    const call2 = items.find((i) => i.kind === "call" && i.urgent);
    if (call2 && link.calls_on && voiceReady(env) && underDailyLimit("call", await sentToday("voice"))) {
      const { count: live } = await admin.from("odelia_calls").select("call_control_id", { count: "exact", head: true }).eq("user_id", uid).is("ended_at", null).gt("created_at", new Date(now.getTime() - 15 * 6e4).toISOString());
      if (!live) {
        const res = await internal("odelia-voice", { action: "dial", outbox_id: call2.id }).catch(() => null);
        if (res?.ok) {
          calls++;
          rest = items.filter((i) => i.id !== call2.id);
        }
      }
    }
    if (!rest.length) continue;
    if (!link.texts_on) {
      await mark(rest.filter((i) => !i.urgent).map((i) => i.id), { dropped_at: now.toISOString(), note: "texts_off" });
      continue;
    }
    if (!underDailyLimit("text", await sentToday("sms"))) {
      await mark(rest.filter((i) => !i.urgent).map((i) => i.id), { dropped_at: now.toISOString(), note: "daily_limit" });
      continue;
    }
    const { data: claimed } = await admin.from("odelia_outbox").update({ sent_at: now.toISOString() }).in("id", rest.map((i) => i.id)).is("sent_at", null).is("dropped_at", null).select("id");
    const mine = new Set((claimed ?? []).map((c) => c.id));
    rest = rest.filter((i) => mine.has(i.id));
    if (!rest.length) continue;
    const lang = link.lang;
    const origin = appOrigin(env);
    const one = rest.length === 1 ? rest[0] : null;
    const tail = one?.link || appLink(origin, rest[0].workspace_id);
    const body = one ? one.body : lang === "zh" ? `\u5FEB\u54C9\uFF1A\u6709 ${rest.length} \u4EF6\u4E8B\u9700\u8981\u60A8\u5904\u7406\u3002${rest.slice(0, 4).map((i) => i.body.replace(/^快哉：/, "")).join("\uFF1B")}` : `Placetta: ${rest.length} things need you. ${rest.slice(0, 4).map((i) => i.body.replace(/^Placetta: /, "")).join("; ")}`;
    const r = await textUser(admin, env, { link, workspace_id: rest[0].workspace_id, segments: splitSms(body, { max: 1, lang, tail: tail || void 0 }), kind: rest.some((i) => i.urgent) ? "urgent" : "update" });
    if (r.ok) texts++;
    else if (r.code === "opted_out" || r.code === BLOCKED_BY_STOP) await mark(rest.map((i) => i.id), { sent_at: null, dropped_at: now.toISOString(), note: "opted_out" });
    else await mark(rest.map((i) => i.id), { sent_at: null });
  }
  return { users: byUser.size, texts, calls };
}
async function handle(req) {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  if (req.headers.get("telnyx-signature-ed25519")) return await webhook(req);
  if (req.headers.get("webhook-signature")) return await linqWebhook(req);
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  if (body.action === "line") {
    const imessage = linqReady(env);
    const n = imessage ? linqLines(env)[0] : odeliaNumber(env);
    const callN = voiceReady(env) ? imessage && env("LINQ_FORWARDS_CALLS") === "1" ? n : odeliaNumber(env) : null;
    return json(200, {
      configured: textingReady(env),
      imessage,
      voice: voiceReady(env),
      number: n,
      display: n ? prettyPhone(n) : null,
      call_number: callN,
      call_display: callN ? prettyPhone(callN) : null
    });
  }
  if (!await monitorKeyOk(req.headers.get("x-monitor-key"))) return fail(401, "unauthorized", "unauthorized");
  if (body.action === "send_code") return await sendCode(String(body.code_id ?? ""));
  if (body.action === "flush") {
    if (!textingReady(env)) {
      await expireOld(/* @__PURE__ */ new Date());
      return fail(503, "not_configured", "Texting isn't set up.");
    }
    const lines = linqReady(env) ? await lineHealth().catch((e) => {
      console.error("line health", String(e).slice(0, 160));
      return null;
    }) : null;
    return json(200, { ok: true, ...await flush(), ...lines ? { lines } : {} });
  }
  return fail(400, "bad_request", "Unknown action.");
}
if (true) Deno.serve(handle);
export {
  flush,
  handle,
  lineHealth
};
