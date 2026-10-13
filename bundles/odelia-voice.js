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

// ../../../../../../home/claude/placetta-agent/supabase/functions/odelia-voice/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// ../../../../../../home/claude/placetta-agent/supabase/functions/_shared/odelia.ts
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
function b64bytes(s) {
  const b64 = s.trim().replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
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
var arr = (v) => Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : [];
var pickLang = (v, lang) => (v && typeof v === "object" ? String(v[lang] ?? v.en ?? "") : String(v ?? "")).slice(0, 120);
var isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
function workspaceBrief(o, maxChars = 3500) {
  const st = o.state && typeof o.state === "object" ? o.state : {};
  const L = o.lang, in30 = new Date(Date.parse(o.today + "T00:00:00Z") + 30 * 864e5).toISOString().slice(0, 10);
  const brief = {
    business: pickLang(st.business, L) || o.name,
    where: [(st.meta ?? {}).city, (st.meta ?? {}).region].filter(Boolean).join(", ") || void 0,
    stores: arr(st.stores).slice(0, 12).map((s) => ({
      name: pickLang(s.name, L),
      stage: s.stage,
      address: String(s.address ?? "").slice(0, 120),
      opens: isDay(s.projectedOpen) ? s.projectedOpen : isDay(s.plannedOpen) ? s.plannedOpen : void 0,
      permits_expiring: arr(s.permits).filter((p) => isDay(p.expires) && String(p.expires) <= in30).map((p) => `${pickLang(p.name, L)} ${String(p.expires).slice(0, 10)}`)
    })),
    applications: arr(st.apps).slice(0, 25).map((a) => ({ name: pickLang(a.name, L), agency: pickLang(a.agency, L), status: a.status, next: pickLang(a.next, L) || void 0, blocks_opening: a.critical === true || void 0 })),
    due: arr(st.deadlines).filter((d) => isDay(d.date) && String(d.date) <= in30).sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 12).map((d) => ({ date: String(d.date).slice(0, 10), what: pickLang(d.title, L), kind: d.kind, overdue: String(d.date) < o.today || void 0 })),
    filings: (o.filings ?? []).slice(0, 12).map((f) => ({ what: pickLang(f.title, L), status: f.status, confirmation: f.confirmation_number ?? void 0, since: String(f.updated_at ?? "").slice(0, 10) })),
    approvals_waiting: arr(st.approvals).slice(0, 8).map((a) => pickLang(a.title, L)),
    recent_updates: (o.updates ?? []).slice(0, 6).map((u) => `${String(u.created_at ?? "").slice(0, 10)} ${pickLang(u.title, L)}`)
  };
  let out = JSON.stringify(brief, (_k, v) => Array.isArray(v) && v.length === 0 ? void 0 : v);
  for (const k of ["recent_updates", "filings", "stores", "applications"]) {
    if (out.length <= maxChars) break;
    const list = brief[k];
    if (list) brief[k] = list.slice(0, Math.max(3, Math.floor(list.length / 2)));
    out = JSON.stringify(brief, (_k, v) => Array.isArray(v) && v.length === 0 ? void 0 : v);
  }
  return out.length > maxChars ? out.slice(0, maxChars) : out;
}
function randomCode(n) {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) out += String(buf[0] % 10);
  }
  return out;
}
var b64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", utf8(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8(data)));
}
async function signCallToken(secret, callId, expSec) {
  const id = b64url(utf8(callId));
  return `${id}.${expSec}.${b64url(await hmac(secret, `odelia-call|${callId}|${expSec}`))}`;
}
async function verifyCallToken(secret, token, nowSec = Date.now() / 1e3) {
  const [id, exp, sig] = String(token ?? "").split(".");
  if (!id || !exp || !sig || !secret || !/^\d+$/.test(exp) || Number(exp) < nowSec) return null;
  let callId;
  try {
    callId = new TextDecoder().decode(b64bytes(id));
  } catch {
    return null;
  }
  const want = b64url(await hmac(secret, `odelia-call|${callId}|${exp}`));
  if (want.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0 ? callId : null;
}
var SPOKEN = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  tree: "3",
  four: "4",
  for: "4",
  fore: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
  niner: "9",
  "\u96F6": "0",
  "\u3007": "0",
  "\u4E00": "1",
  "\u5E7A": "1",
  "\u4E8C": "2",
  "\u4E24": "2",
  "\u4E09": "3",
  "\u56DB": "4",
  "\u4E94": "5",
  "\u516D": "6",
  "\u4E03": "7",
  "\u516B": "8",
  "\u4E5D": "9"
};
function spokenDigits(s) {
  return (String(s ?? "").toLowerCase().match(/\d|[a-z]+|[零〇一幺二两三四五六七八九]/g) ?? []).map((t) => /^\d$/.test(t) ? t : SPOKEN[t] ?? "").join("");
}
var clientState = (o) => btoa(String.fromCharCode(...utf8(JSON.stringify(o))));
function readClientState(s) {
  if (typeof s !== "string" || !s) return {};
  try {
    return JSON.parse(new TextDecoder().decode(b64bytes(s)));
  } catch {
    return {};
  }
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

// ../../../../../../home/claude/placetta-agent/supabase/functions/_shared/odelia_db.ts
var LINK_COLS = "user_id, number, verified_at, texts_on, calls_on, quiet_start, quiet_end, tz, lang, last_workspace_id, opted_out_at";
async function linkByNumber(admin2, number) {
  const { data } = await admin2.from("phone_links").select(LINK_COLS).eq("number", number).not("verified_at", "is", null).maybeSingle();
  return data ?? null;
}
async function linkOf(admin2, userId) {
  const { data } = await admin2.from("phone_links").select(LINK_COLS).eq("user_id", userId).maybeSingle();
  return data ?? null;
}
async function logMessage(admin2, row) {
  const { data, error } = await admin2.from("odelia_messages").insert({ ...row, body: row.body.slice(0, 2e3), workspace_id: row.workspace_id ?? null, provider_id: row.provider_id ?? null, run_id: row.run_id ?? null }).select("id").maybeSingle();
  if (error && error.code !== "23505") console.error("odelia log", error.code);
  return error ? null : data?.id ?? null;
}
async function textUser(admin2, env2, o) {
  if (o.link.opted_out_at) return { ok: false, sent: 0, code: "opted_out" };
  let sent = 0;
  for (const text of o.segments) {
    const r = await sendSms(env2, o.link.number, text);
    if (!r.ok) {
      console.error("odelia text", r.status, r.code, r.detail);
      if (r.code === BLOCKED_BY_STOP) await admin2.from("phone_links").update({ opted_out_at: (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("user_id", o.link.user_id);
      return { ok: false, sent, code: r.code };
    }
    sent++;
    await logMessage(admin2, { user_id: o.link.user_id, workspace_id: o.workspace_id, direction: "out", channel: "sms", kind: o.kind, body: o.logBody ?? text, provider_id: r.id, run_id: o.run_id });
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
async function mayUseAgent(admin2, ws, userId) {
  const { data: access, error } = await admin2.rpc("access_for", { ws, uid: userId, p_aal: "aal2" });
  if (error || access !== "owner" && access !== "member") return "not_member";
  const { data: plan } = await admin2.rpc("plan_of", { ws });
  return plan === "none" ? "no_plan" : "ok";
}

// ../../../../../../home/claude/placetta-agent/supabase/functions/odelia-voice/index.ts
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
var env = (k) => Deno.env.get(k);
var SELF = `${SUPABASE_URL}/functions/v1/odelia-voice`;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var VOICE = { en: env("ODELIA_VOICE_EN") ?? "AWS.Polly.Joanna-Neural", zh: env("ODELIA_VOICE_ZH") ?? "AWS.Polly.Zhiyu-Neural" };
var SPEAK_LANG = { en: "en-US", zh: "cmn-CN" };
var STT_MODEL = env("ODELIA_STT_MODEL") ?? "deepgram/nova-3";
var MAX_TOOL_CALLS = 40;
var MAX_CODE_TRIES = 3;
var MAX_CALL_TEXTS = 3;
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
var fail = (status, code, message) => json(status, { error: { code, message } });
var bg = (p) => {
  const rt = globalThis.EdgeRuntime;
  if (rt) rt.waitUntil(p);
  else void p;
};
var selfKey = null;
async function monitorKey() {
  if (!selfKey) {
    const { data } = await admin.rpc("monitor_key");
    selfKey = typeof data === "string" ? data : "";
  }
  return selfKey;
}
async function monitorKeyOk(key) {
  if (!key) return false;
  const { data } = await admin.rpc("monitor_key_ok", { p_key: key });
  return data === true;
}
var cmd = (ccid, action, body) => telnyx(env, `/calls/${encodeURIComponent(ccid)}/actions/${action}`, body);
var callOf = async (ccid) => (await admin.from("odelia_calls").select("*").eq("call_control_id", ccid).maybeSingle()).data;
var LINES = {
  stranger: { en: "Hi, this is Odelia from Placetta. I don't recognize this number. To call me, link your phone in Placetta, under Settings, Text and call Odelia. Goodbye.", zh: "\u60A8\u597D\uFF0C\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002\u6211\u4E0D\u8BA4\u8BC6\u8FD9\u4E2A\u53F7\u7801\u3002\u5982\u9700\u7ED9\u6211\u6253\u7535\u8BDD\uFF0C\u8BF7\u5728\u5FEB\u54C9\u7684\u8BBE\u7F6E\u4E2D\u6253\u5F00\u201C\u53D1\u77ED\u4FE1\u6216\u81F4\u7535 Odelia\u201D\uFF0C\u5173\u8054\u60A8\u7684\u624B\u673A\u3002\u518D\u89C1\u3002" },
  noAccess: { en: "Hi, it's Odelia from Placetta. Your number is linked, but I can't open a workspace for you right now. Please check the Placetta app. Goodbye.", zh: "\u60A8\u597D\uFF0C\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002\u60A8\u7684\u53F7\u7801\u5DF2\u5173\u8054\uFF0C\u4F46\u6211\u73B0\u5728\u65E0\u6CD5\u6253\u5F00\u60A8\u7684\u5DE5\u4F5C\u533A\u3002\u8BF7\u67E5\u770B\u5FEB\u54C9\u5E94\u7528\u3002\u518D\u89C1\u3002" },
  sorry: { en: "Hi, it's Odelia from Placetta. I'm sorry, I can't talk right now. I'll text you instead, so just reply there. Goodbye.", zh: "\u60A8\u597D\uFF0C\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002\u62B1\u6B49\uFF0C\u6211\u73B0\u5728\u65E0\u6CD5\u901A\u8BDD\u3002\u6211\u4F1A\u7ED9\u60A8\u53D1\u77ED\u4FE1\uFF0C\u76F4\u63A5\u56DE\u590D\u5C31\u53EF\u4EE5\u3002\u518D\u89C1\u3002" },
  unverifiable: { en: "Hi, it's Odelia from Placetta. I couldn't confirm it's you on this call, so please use the Placetta app or text me. Goodbye.", zh: "\u60A8\u597D\uFF0C\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002\u8FD9\u901A\u7535\u8BDD\u65E0\u6CD5\u786E\u8BA4\u662F\u60A8\u672C\u4EBA\uFF0C\u8BF7\u4F7F\u7528\u5FEB\u54C9\u5E94\u7528\u6216\u7ED9\u6211\u53D1\u77ED\u4FE1\u3002\u518D\u89C1\u3002" },
  idle: { en: "I'll let you go. Text me anytime. Goodbye.", zh: "\u90A3\u6211\u5148\u6302\u4E86\uFF0C\u6709\u9700\u8981\u968F\u65F6\u53D1\u77ED\u4FE1\u7ED9\u6211\u3002\u518D\u89C1\u3002" }
};
function greeting(lang, name, mode, business) {
  if (lang === "zh") {
    const hi2 = `\u60A8\u597D${name ? `\uFF0C${name}` : ""}\uFF0C\u6211\u662F\u5FEB\u54C9\u7684 Odelia\u3002`;
    return mode === "code" ? `${hi2}\u4E3A\u4E86\u4FDD\u62A4\u60A8\u7684\u8D26\u6237\uFF0C\u6211\u521A\u628A 4 \u4F4D\u9A8C\u8BC1\u7801\u53D1\u5230\u4E86\u60A8\u8D26\u6237\u4E0A\u7684\u624B\u673A\u53F7\u3002\u8BF7\u544A\u8BC9\u6211\u9A8C\u8BC1\u7801\u3002` : mode === "outbound" ? `${hi2}\u6211\u6253\u7535\u8BDD\u662F\u4E3A\u4E86${business}\u7684\u4E00\u4EF6\u6025\u4E8B\u3002\u73B0\u5728\u65B9\u4FBF\u8BF4\u4E24\u53E5\u5417\uFF1F` : `${hi2}\u6709\u4EC0\u4E48\u53EF\u4EE5\u5E2E\u60A8\uFF1F`;
  }
  const hi = `Hi${name ? ` ${name}` : ""}, it's Odelia from Placetta.`;
  return mode === "code" ? `${hi} To keep your account safe, I just texted a 4-digit code to the phone number on your account. What's the code?` : mode === "outbound" ? `${hi} I'm calling about something urgent at ${business}. Is now a good time?` : `${hi} What can I do for you?`;
}
function instructions(o) {
  return [
    `You are Odelia, the AI compliance agent at Placetta (\u5FEB\u54C9), on a phone call${o.name ? ` with ${o.name}` : ""} about ${o.business}. You get business licenses, permits and registrations done and keep them current. If asked, say plainly that you are an AI. Today is ${o.today}.`,
    `Speak ${o.lang === "zh" ? "Mandarin Chinese (\u666E\u901A\u8BDD)" : "English"} unless they switch languages. Keep each turn to one to three short spoken sentences. No lists, no markdown, and don't read out links. Ask one question at a time. If they talk over you, stop and listen.`,
    o.verified ? "Answer from the workspace summary below. If something isn't in it, call workspace_details. If it still isn't there, say you'll look into it and call start_task." : "First verify the caller. Ask for the 4-digit code just texted to the phone number on file, and call verify_code with the digits they say. Until verify_code returns ok, say nothing about the business, its stores, licenses, filings or account, and call no other tool. If verify_code says no tries are left, apologize, suggest the Placetta app or texting this number, say goodbye and call hangup. Once verified, answer from the workspace verify_code returns.",
    "For real work (mapping a new store, drafting a letter, preparing or renewing an application, researching a rule), call start_task with what they want in their own words and every detail they gave, then tell them you're on it and will text them when it's done.",
    "On a call you never file, pay, send an email, delete or approve anything, and you never take Social Security, ITIN, bank or card numbers. Those happen in the Placetta app with their approval: offer to text them the link with send_text.",
    "If they want something in writing (an address, a date, a confirmation number, a link to the app), use send_text.",
    "If you hear nothing for a while, ask once whether they're still there. When they're done, say a short goodbye and call hangup. If a tool fails, apologize in one sentence and offer to text instead.",
    o.outbound ? `You called them about this: ${o.outbound} Tell them in one or two sentences, answer their questions, and offer to start on it with start_task.` : "",
    o.verified ? `Workspace (read only, JSON):
${o.brief}` : ""
  ].filter(Boolean).join("\n\n");
}
async function firstName(uid, ws) {
  const { data } = await admin.auth.admin.getUserById(uid);
  const m = data?.user?.user_metadata ?? {};
  let n = String(m.first_name ?? m.full_name ?? m.name ?? "").trim().split(/\s+/)[0];
  if (!n && ws) {
    const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const facts = w?.state?.facts ?? [];
    const f = facts.find((x) => /^(owner|contact name|responsible person)/i.test(x.label?.en ?? "") && !/^you\b/i.test(x.value?.en ?? ""));
    n = String(f?.value?.en ?? "").trim().split(/[\s,]+/)[0];
  }
  return n && n.length <= 40 && /^[\p{L}'-]+$/u.test(n) ? n : null;
}
async function briefFor(ws, lang) {
  const [{ data: w }, { data: filings }, { data: updates }] = await Promise.all([
    admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle(),
    admin.from("filings").select("title, status, confirmation_number, updated_at").eq("workspace_id", ws).neq("status", "canceled").order("updated_at", { ascending: false }).limit(12),
    admin.from("updates").select("title, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(6)
  ]);
  return workspaceBrief({ name: String(w?.name ?? ""), state: w?.state ?? {}, filings: filings ?? [], updates: updates ?? [], lang, today: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) });
}
async function assistantFor(o) {
  const token = await signCallToken(await monitorKey(), o.ccid, Math.floor(Date.now() / 1e3) + 2 * 3600);
  const headers = [{ name: "x-odelia-call", value: token }];
  const tool2 = (name, description, properties, required) => ({
    type: "webhook",
    timeout_ms: name === "workspace_details" || name === "verify_code" ? 6e3 : 1e4,
    webhook: { name, description, url: `${SELF}?tool=${name}`, method: "POST", headers, body_parameters: { type: "object", properties, required } }
  });
  const tools = [
    ...o.verified ? [] : [tool2("verify_code", "Check the 4-digit code the caller says. Returns ok and the workspace summary when it matches.", { code: { type: "string", description: "The digits the caller said, digits only, e.g. 4721" } }, ["code"])],
    tool2("workspace_details", "Read the business's current workspace summary again: stores, applications and their status, deadlines, filings, approvals waiting and recent updates.", {}, []),
    tool2("start_task", "Start real work in the background (mapping a store, drafting a letter, preparing an application, researching a rule). The result is texted to them.", { request: { type: "string", description: "What they want done, in their words, with every detail they gave" } }, ["request"]),
    tool2("send_text", "Text the caller on their verified number: something in writing they asked for, or a link to the Placetta app.", { message: { type: "string", description: "The text to send, plain, under 300 characters" }, app_link: { type: "boolean", description: "Add a link to their workspace in the app" } }, ["message"]),
    { type: "hangup", hangup: { description: "Hang up the call, after saying goodbye." } }
  ];
  const brief = o.verified ? await briefFor(o.ws.id, o.lang) : "";
  const model = env("ODELIA_VOICE_MODEL");
  return {
    id: env("TELNYX_ASSISTANT_ID"),
    ...model ? { model } : {},
    instructions: instructions({ lang: o.lang, name: o.name, business: o.ws.name, verified: o.verified, brief, outbound: o.outbound, today: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) }),
    greeting: greeting(o.lang, o.name, o.outbound ? "outbound" : o.verified ? "verified" : "code", o.ws.name),
    voice_settings: { voice: VOICE[o.lang] },
    transcription: { model: STT_MODEL, language: o.lang },
    tools
  };
}
var sayAndHangUp = (ccid, lang, text) => cmd(ccid, "speak", { payload: text, payload_type: "text", voice: VOICE[lang], language: SPEAK_LANG[lang], client_state: clientState({ k: "bye" }), command_id: `bye-${ccid}`.slice(0, 120) });
async function incoming(p) {
  const ccid = p.call_control_id;
  const from = normalizePhone(p.from);
  const link = from ? await linkByNumber(admin, from) : null;
  const lang = link?.lang ?? "en";
  const answerThen = (k, extra = {}) => cmd(ccid, "answer", { client_state: clientState({ k, l: lang, ...extra }), command_id: `answer-${ccid}`.slice(0, 120) });
  if (!voiceReady(env)) {
    await answerThen("sorry", { t: link ? 1 : 0 });
    return;
  }
  if (!link) {
    await answerThen("stranger");
    return;
  }
  const { ws } = await currentWorkspace(admin, link);
  if (!ws || await mayUseAgent(admin, ws.id, link.user_id) !== "ok") {
    await answerThen("noaccess");
    return;
  }
  const verified = p.shaken_stir_attestation === "A" && p.shaken_stir_validated !== false;
  await admin.from("odelia_calls").upsert({ call_control_id: ccid, user_id: link.user_id, workspace_id: ws.id, direction: "in", number: from, attestation: p.shaken_stir_attestation ?? null, verified_at: verified ? (/* @__PURE__ */ new Date()).toISOString() : null, lang }, { onConflict: "call_control_id" });
  await admin.from("phone_links").update({ last_workspace_id: ws.id }).eq("user_id", link.user_id);
  if (!verified) {
    const code = randomCode(4);
    const { error } = await admin.rpc("phone_code_issue", { p_user: link.user_id, p_purpose: "call", p_number: from, p_code: code, p_minutes: 10 });
    const sent = !error && (await textUser(admin, env, { link, workspace_id: ws.id, segments: [SAY.callCode[lang](code)], kind: "code", logBody: lang === "zh" ? "\u5DF2\u53D1\u9001\u901A\u8BDD\u9A8C\u8BC1\u7801" : "Sent a call code" })).ok;
    if (!sent) {
      await answerThen("unverifiable");
      return;
    }
  }
  const assistant = await assistantFor({ ccid, lang, name: await firstName(link.user_id, ws?.id), ws, verified });
  const r = await cmd(ccid, "answer", { assistant, client_state: clientState({ k: "talk", l: lang }), command_id: `answer-${ccid}`.slice(0, 120) });
  if (!r.ok) {
    console.error("answer with assistant", r.status, r.code, r.detail);
    await cmd(ccid, "answer", { client_state: clientState({ k: "sorry", l: lang, t: 1 }), command_id: `answer2-${ccid}`.slice(0, 120) });
  }
}
async function textInstead(call) {
  if (!call.user_id || !call.outbox_id) return;
  const [{ data: o }, link] = await Promise.all([admin.from("odelia_outbox").select("body, link, workspace_id").eq("id", call.outbox_id).maybeSingle(), linkOf(admin, call.user_id)]);
  if (!o || !link?.verified_at || !link.texts_on) return;
  const already = await admin.from("odelia_messages").select("id", { count: "exact", head: true }).eq("user_id", call.user_id).eq("kind", "missed").eq("channel", "sms").gt("created_at", call.answered_at ?? new Date(Date.now() - 36e5).toISOString());
  if (already.count) return;
  const text = `${SAY.missed[link.lang]} ${o.body}`;
  await textUser(admin, env, { link, workspace_id: o.workspace_id, segments: splitSms(text, { max: 1, lang: link.lang, tail: o.link || appLink(appOrigin(env), o.workspace_id) || void 0 }), kind: "missed" });
}
async function event(type, p) {
  const ccid = p.call_control_id;
  if (!ccid) return;
  const cs = readClientState(p.client_state);
  const lang = cs.l === "zh" ? "zh" : "en";
  if (type === "call.initiated" && p.direction === "incoming") return await incoming(p);
  if (type === "call.answered") {
    await admin.from("odelia_calls").update({ answered_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("call_control_id", ccid).is("answered_at", null);
    if (cs.k === "stranger") await sayAndHangUp(ccid, "en", LINES.stranger.en);
    else if (cs.k === "noaccess") await sayAndHangUp(ccid, lang, LINES.noAccess[lang]);
    else if (cs.k === "unverifiable") await sayAndHangUp(ccid, lang, LINES.unverifiable[lang]);
    else if (cs.k === "sorry") {
      await sayAndHangUp(ccid, lang, LINES.sorry[lang]);
      const from = normalizePhone(p.from), link = cs.t && from ? await linkByNumber(admin, from) : null;
      if (link) await textUser(admin, env, { link, segments: [SAY.callSorry[link.lang]], kind: "system" });
    }
    return;
  }
  if (type === "call.speak.ended" && cs.k === "bye") {
    await cmd(ccid, "hangup", { command_id: `hangup-${ccid}`.slice(0, 120) });
    return;
  }
  if (type === "call.machine.detection.ended") {
    const call = await callOf(ccid);
    if (!call || call.direction !== "out" || !call.user_id || !call.workspace_id) return;
    if (p.result === "machine") {
      await cmd(ccid, "hangup", {});
      await textInstead(call);
      return;
    }
    const [{ data: o }, { data: w }] = await Promise.all([
      admin.from("odelia_outbox").select("body").eq("id", call.outbox_id ?? "").maybeSingle(),
      admin.from("workspaces").select("id, name").eq("id", call.workspace_id).maybeSingle()
    ]);
    if (!w) {
      await cmd(ccid, "hangup", {});
      return;
    }
    const assistant = await assistantFor({ ccid, lang: call.lang, name: await firstName(call.user_id, w.id), ws: { id: w.id, name: String(w.name ?? "") }, verified: true, outbound: String(o?.body ?? "") });
    const r = await cmd(ccid, "ai_assistant_start", { assistant, client_state: clientState({ k: "talk", l: call.lang }) });
    if (!r.ok) {
      console.error("assistant start", r.status, r.code, r.detail);
      await sayAndHangUp(ccid, call.lang, LINES.sorry[call.lang]);
      await textInstead(call);
    }
    return;
  }
  if (type === "call.conversation.ended") {
    const call = await callOf(ccid);
    if (call && !call.ended_at) await sayAndHangUp(ccid, call.lang, /error|fail/i.test(String(p.reason ?? "")) ? LINES.sorry[call.lang] : LINES.idle[call.lang]);
    return;
  }
  if (type === "call.hangup") {
    const call = await callOf(ccid);
    if (!call || call.ended_at) return;
    const now = /* @__PURE__ */ new Date();
    await admin.from("odelia_calls").update({ ended_at: now.toISOString() }).eq("call_control_id", ccid);
    if (!call.user_id) return;
    const mins = call.answered_at ? Math.max(1, Math.round((now.getTime() - Date.parse(call.answered_at)) / 6e4)) : 0;
    const body = call.direction === "out" && !mins ? call.lang === "zh" ? "Odelia \u6765\u7535\uFF0C\u672A\u63A5\u901A" : "Odelia called, no answer" : call.lang === "zh" ? `${call.direction === "in" ? "\u60A8\u6765\u7535" : "Odelia \u6765\u7535"}\uFF0C${mins} \u5206\u949F` : `${call.direction === "in" ? "You called" : "Odelia called"}, ${mins} min`;
    await logMessage(admin, { user_id: call.user_id, workspace_id: call.workspace_id, direction: call.direction, channel: "voice", kind: "call", body, provider_id: `call:${ccid}` });
    if (call.direction === "out" && !mins) await textInstead(call);
  }
}
async function runTool(name, call, body) {
  const notVerified = { ok: false, result: "The caller isn't verified yet. Ask for the 4-digit code and call verify_code first." };
  if (name === "verify_code") {
    if (call.verified_at) return { ok: true, result: "Already verified." };
    if (call.code_tries >= MAX_CODE_TRIES || !call.user_id) return { ok: false, tries_left: 0, result: "No tries left. Apologize, suggest the Placetta app or texting this number, say goodbye and hang up." };
    const code = spokenDigits(body.code);
    const { data: res } = await admin.rpc("phone_code_check", { p_user: call.user_id, p_purpose: "call", p_code: code, p_number: call.number });
    const tries = call.code_tries + 1;
    if (res === "ok") {
      await admin.from("odelia_calls").update({ verified_at: (/* @__PURE__ */ new Date()).toISOString(), code_tries: tries }).eq("call_control_id", call.call_control_id);
      return { ok: true, result: "Verified. You can discuss the account now. Ask how you can help.", workspace: call.workspace_id ? await briefFor(call.workspace_id, call.lang) : "" };
    }
    await admin.from("odelia_calls").update({ code_tries: tries }).eq("call_control_id", call.call_control_id);
    const left = res === "locked" || res === "expired" ? 0 : Math.max(0, MAX_CODE_TRIES - tries);
    return { ok: false, tries_left: left, result: left ? "That code doesn't match. Ask them to say it again, digit by digit." : "No tries left. Apologize, suggest the Placetta app or texting this number, say goodbye and hang up." };
  }
  if (!call.verified_at || !call.user_id || !call.workspace_id) return notVerified;
  if (name === "workspace_details") return { ok: true, workspace: await briefFor(call.workspace_id, call.lang) };
  if (name === "start_task") {
    const request = String(body.request ?? "").trim().slice(0, 2e3);
    if (!request) return { ok: false, result: "Ask what they want done." };
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
      body: JSON.stringify({ action: "start_as", user_id: call.user_id, workspace_id: call.workspace_id, prompt: request, channel: "voice", reply_to: call.number, lang: call.lang }),
      signal: AbortSignal.timeout(8e3)
    }).catch(() => null);
    if (res?.status === 202) return { ok: true, result: "Started. Tell them you're on it and will text them when it's done." };
    if (res?.status === 409) return { ok: false, result: "You're still working on their last request. Tell them you'll text when that's done, then you can start this one." };
    if (res?.status === 402) return { ok: false, result: "This workspace has no plan, so you can't start work. Tell them to open Placetta to start one." };
    return { ok: false, result: "Couldn't start it. Apologize and suggest texting the request instead." };
  }
  if (name === "send_text") {
    if (call.texts >= MAX_CALL_TEXTS) return { ok: false, result: "You've already texted them several times on this call. Tell them it's in their texts." };
    const link = await linkOf(admin, call.user_id);
    if (!link?.verified_at || link.number !== call.number) return { ok: false, result: "Their number isn't linked anymore." };
    const message = String(body.message ?? "").trim().slice(0, 600);
    if (!message) return { ok: false, result: "Nothing to send." };
    const tail = body.app_link === true ? appLink(appOrigin(env), call.workspace_id) : "";
    const r = await textUser(admin, env, { link, workspace_id: call.workspace_id, segments: splitSms(message, { max: 2, lang: call.lang, tail: tail || void 0 }), kind: "reply" });
    await admin.from("odelia_calls").update({ texts: call.texts + 1 }).eq("call_control_id", call.call_control_id);
    return r.ok ? { ok: true, result: "Texted." } : { ok: false, result: r.code === "opted_out" ? "They turned off texts from you (STOP). They can text START to turn them back on." : "The text didn't go through. Apologize." };
  }
  return { ok: false, result: "Unknown tool." };
}
async function tool(req, name) {
  const ccid = await verifyCallToken(await monitorKey(), req.headers.get("x-odelia-call") ?? "");
  if (!ccid) return fail(401, "unauthorized", "unauthorized");
  const call = await callOf(ccid);
  if (!call || call.ended_at) return json(200, { ok: false, result: "The call has ended." });
  if (call.tool_calls >= MAX_TOOL_CALLS) return json(200, { ok: false, result: "That's a lot on one call. Offer to text them instead." });
  await admin.from("odelia_calls").update({ tool_calls: call.tool_calls + 1 }).eq("call_control_id", ccid);
  const body = await req.json().catch(() => ({}));
  try {
    return json(200, await runTool(name, call, body));
  } catch (e) {
    console.error("tool", name, String(e).slice(0, 200));
    return json(200, { ok: false, result: "Something went wrong. Apologize briefly and offer to text instead." });
  }
}
async function dial(outboxId) {
  if (!UUID.test(outboxId)) return fail(400, "bad_request", "outbox_id is required.");
  if (!voiceReady(env)) return fail(503, "not_configured", "Calls aren't set up: set TELNYX_VOICE_CONNECTION_ID and TELNYX_ASSISTANT_ID.");
  const { data: o } = await admin.from("odelia_outbox").select("id, user_id, workspace_id, body").eq("id", outboxId).is("sent_at", null).is("dropped_at", null).maybeSingle();
  if (!o) return fail(404, "not_found", "Nothing to call about.");
  const link = await linkOf(admin, o.user_id);
  if (!link?.verified_at || !link.calls_on) return fail(409, "not_allowed", "They don't take calls.");
  const { data: claimed } = await admin.from("odelia_outbox").update({ sent_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", o.id).is("sent_at", null).select("id");
  if (!claimed?.length) return fail(409, "busy", "Already being called.");
  const r = await telnyx(env, "/calls", {
    connection_id: env("TELNYX_VOICE_CONNECTION_ID"),
    to: link.number,
    from: odeliaNumber(env),
    webhook_url: SELF,
    client_state: clientState({ k: "out", l: link.lang }),
    timeout_secs: 30,
    time_limit_secs: 900,
    answering_machine_detection: "detect",
    command_id: `dial-${o.id}`
  });
  const ccid = typeof r.data?.call_control_id === "string" ? r.data.call_control_id : "";
  if (!r.ok || !ccid) {
    console.error("dial", r.status, r.code, r.detail);
    await admin.from("odelia_outbox").update({ sent_at: null }).eq("id", o.id);
    return fail(502, "upstream_error", "Couldn't place the call.");
  }
  await admin.from("odelia_calls").insert({ call_control_id: ccid, user_id: o.user_id, workspace_id: o.workspace_id, direction: "out", number: link.number, verified_at: (/* @__PURE__ */ new Date()).toISOString(), lang: link.lang, outbox_id: o.id });
  await logMessage(admin, { user_id: o.user_id, workspace_id: o.workspace_id, direction: "out", channel: "voice", kind: "urgent", body: String(o.body).slice(0, 600) });
  return json(200, { ok: true });
}
async function handle(req) {
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  const toolName = new URL(req.url).searchParams.get("tool");
  if (toolName) return await tool(req, toolName);
  if (req.headers.get("telnyx-signature-ed25519")) {
    const raw = await req.text();
    const ok = await verifyTelnyx(raw, req.headers.get("telnyx-signature-ed25519") ?? "", req.headers.get("telnyx-timestamp") ?? "", env("TELNYX_PUBLIC_KEY") ?? "");
    if (!ok) return fail(401, "unauthorized", "Bad webhook signature.");
    let ev;
    try {
      ev = JSON.parse(raw)?.data ?? {};
    } catch {
      return fail(400, "bad_request", "Send JSON.");
    }
    bg(event(String(ev.event_type ?? ""), ev.payload ?? {}).catch((e) => console.error("call event", ev.event_type, String(e).slice(0, 200))));
    return json(200, { ok: true });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  if (!await monitorKeyOk(req.headers.get("x-monitor-key"))) return fail(401, "unauthorized", "unauthorized");
  if (body.action === "dial") return await dial(String(body.outbox_id ?? ""));
  return fail(400, "bad_request", "Unknown action.");
}
if (true) Deno.serve(handle);
export {
  handle
};
