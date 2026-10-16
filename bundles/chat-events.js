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

// supabase/functions/chat-events/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// supabase/functions/_shared/bots.ts
var enc = new TextEncoder();
var hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
var b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function slackSigned(secret, ts, sig, body2, now = Date.now()) {
  if (!ts || !sig || !/^\d+$/.test(ts) || Math.abs(now / 1e3 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = "v0=" + hex(await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${ts}:${body2}`)));
  return same(want, sig);
}
var slackText = (t) => t.replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();
async function slackPost(bot, to, text) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${bot.bot_token}` },
    body: JSON.stringify({ channel: to.channel, ...to.thread_ts ? { thread_ts: to.thread_ts } : {}, text: text.slice(0, 3900), unfurl_links: false }),
    signal: AbortSignal.timeout(15e3)
  }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  return !!j.ok;
}
async function slackWho(token) {
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(1e4) }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  return j.ok ? { team: j.team ?? "Slack", bot: j.user ?? "odelia" } : null;
}
var larkBase = (d) => d === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
async function larkDecrypt(encryptKey, data) {
  const raw = b64bytes(data);
  const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(encryptKey));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: raw.slice(0, 16) }, key, raw.slice(16));
  return new TextDecoder().decode(out);
}
async function larkSigned(encryptKey, ts, nonce, sig, body2) {
  if (!ts || !nonce || !sig) return false;
  return same(hex(await crypto.subtle.digest("SHA-256", enc.encode(ts + nonce + encryptKey + body2))), sig);
}
function larkText(content) {
  try {
    return String(JSON.parse(content).text ?? "").replace(/@_user_\d+/g, "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}
async function larkToken(bot) {
  const res = await fetch(`${larkBase(bot.domain)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: bot.app_id, app_secret: bot.app_secret }),
    signal: AbortSignal.timeout(1e4)
  }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  return j.code === 0 && j.tenant_access_token ? j.tenant_access_token : null;
}
var larkWorks = async (bot) => !!await larkToken(bot);
async function larkReply(bot, messageId, text) {
  const tok = await larkToken(bot);
  if (!tok) return false;
  const res = await fetch(`${larkBase(bot.domain)}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ msg_type: "text", content: JSON.stringify({ text: text.slice(0, 3900) }) }),
    signal: AbortSignal.timeout(15e3)
  }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  return j.code === 0;
}
async function chatReply(bot, to, text) {
  if (bot.kind === "slack_bot" && to.kind === "slack") return await slackPost(bot, { channel: to.channel, thread_ts: to.thread_ts }, text);
  if (bot.kind === "lark_bot" && to.kind === "lark") return await larkReply(bot, to.message_id, text);
  return false;
}

// supabase/functions/_shared/channels.ts
var HOOK_KINDS = ["slack", "lark", "wecom", "dingtalk", "teams"];
function hookUrl(kind, raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase(), p = u.pathname;
  switch (kind) {
    case "slack":
      return h === "hooks.slack.com" && /^\/(services|triggers)\/[\w/-]+$/.test(p) ? u : null;
    case "lark":
      return (h === "open.feishu.cn" || h === "open.larksuite.com") && /^\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(p) ? u : null;
    case "wecom":
      return h === "qyapi.weixin.qq.com" && p === "/cgi-bin/webhook/send" && /^[\w-]{10,}$/.test(u.searchParams.get("key") ?? "") ? u : null;
    case "dingtalk":
      return h === "oapi.dingtalk.com" && p === "/robot/send" && /^[\w-]{20,}$/.test(u.searchParams.get("access_token") ?? "") ? u : null;
    case "teams":
      return /(\.logic\.azure\.com|\.powerplatform\.com|\.webhook\.office\.com)$/.test(h) ? u : null;
  }
}
async function dingSign(secret, ts) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}
${secret}`)));
  return btoa(String.fromCharCode(...sig));
}
async function larkSign(secret, ts) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${ts}
${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(0)));
  return btoa(String.fromCharCode(...sig));
}
async function body(kind, text, secret) {
  switch (kind) {
    case "slack":
      return { text: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") };
    case "lark": {
      const b = { msg_type: "text", content: { text } };
      if (secret) {
        const ts = Math.floor(Date.now() / 1e3);
        b.timestamp = String(ts);
        b.sign = await larkSign(secret, ts);
      }
      return b;
    }
    case "wecom":
    case "dingtalk":
      return { msgtype: "text", text: { content: text } };
    case "teams":
      return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: text.split("\n").filter(Boolean).map((line, i) => ({ type: "TextBlock", text: line, wrap: true, weight: i === 0 ? "Bolder" : "Default" }))
      } }] };
  }
}
async function postHook(kind, url, text, secret) {
  const u = hookUrl(kind, url);
  if (!u) return { ok: false, gone: true, why: "not a webhook link" };
  if (kind === "dingtalk" && secret) {
    const ts = Date.now();
    u.searchParams.set("timestamp", String(ts));
    u.searchParams.set("sign", await dingSign(secret, ts));
  }
  let res;
  try {
    res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await body(kind, text.slice(0, 3800), secret)), signal: AbortSignal.timeout(15e3) });
  } catch {
    return { ok: false, gone: false, why: "no answer" };
  }
  const raw = (await res.text()).slice(0, 400);
  if (kind === "lark" || kind === "wecom" || kind === "dingtalk") {
    let j = {};
    try {
      j = JSON.parse(raw);
    } catch {
    }
    const code = kind === "lark" ? j.code ?? j.StatusCode : j.errcode;
    if (res.ok && code === 0) return { ok: true };
    const msg = String(j.msg ?? j.errmsg ?? j.StatusMessage ?? res.status);
    const gone = kind === "lark" ? [19001, 19002].includes(Number(code)) : kind === "wecom" ? Number(code) === 93e3 : [300001, 300005].includes(Number(code));
    return { ok: false, gone, why: `${code ?? res.status}: ${msg}`.slice(0, 160) };
  }
  if (res.ok) return { ok: true };
  return { ok: false, gone: [400, 403, 404, 410].includes(res.status), why: `${res.status}: ${raw.slice(0, 120)}` };
}

// supabase/functions/chat-events/index.ts
var SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
var admin = (0, import_supabase_js_2.createClient)(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var json = (body2, status = 200) => new Response(JSON.stringify(body2), { status, headers: { "Content-Type": "application/json" } });
var okEmpty = () => new Response("", { status: 200 });
var selfKey = "";
async function monitorKey() {
  if (!selfKey) {
    const { data } = await admin.rpc("monitor_key");
    selfKey = typeof data === "string" ? data : "";
  }
  return selfKey;
}
async function botOf(ws, kind) {
  const { data: row } = await admin.from("integrations").select("secret_id, status, connected_by").eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (!row?.secret_id || row.status !== "connected" || !row.connected_by) return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  try {
    const b = JSON.parse(String(raw ?? ""));
    return { bot: { ...b, kind }, owner: row.connected_by };
  } catch {
    return null;
  }
}
async function firstTime(id) {
  const { data } = await admin.from("chat_events").upsert({ id: id.slice(0, 200) }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  return !!data?.length;
}
var later = (p) => {
  const rt = globalThis.EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
};
var zh = (t) => /[一-鿿]/.test(t);
async function startJob(ws, owner, bot, to, prompt) {
  const lang = zh(prompt) ? "zh" : "en";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
    body: JSON.stringify({ action: "start_chat", workspace_id: ws, user_id: owner, channel: to.kind, chat_to: to, prompt: prompt.slice(0, 4e3), lang }),
    signal: AbortSignal.timeout(2e4)
  }).catch(() => null);
  if (res?.status === 202) return;
  const j = res ? await res.json().catch(() => ({})) : {};
  const why = j.error?.message ?? (lang === "zh" ? "\u6682\u65F6\u65E0\u6CD5\u5F00\u59CB\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002" : "I couldn't start that just now. Try again in a moment.");
  await chatReply(bot, to, why);
}
async function slack(req, ws, body2) {
  const b = await botOf(ws, "slack_bot");
  if (!b || !await slackSigned(b.bot.signing_secret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body2)) return json({ error: "unauthorized" }, 401);
  const e = JSON.parse(body2);
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  if (req.headers.get("x-slack-retry-num")) return okEmpty();
  const ev = e.event ?? {};
  const mention = ev.type === "app_mention", dm = ev.type === "message" && ev.channel_type === "im" && !ev.subtype;
  if (!mention && !dm || ev.bot_id || !e.event_id || !await firstTime("slack:" + e.event_id)) return okEmpty();
  const text = slackText(ev.text ?? "");
  if (!text) return okEmpty();
  const to = { kind: "slack", channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts };
  later(startJob(ws, b.owner, b.bot, to, text));
  return okEmpty();
}
async function lark(req, ws, body2) {
  const b = await botOf(ws, "lark_bot");
  if (!b) return json({ error: "unauthorized" }, 401);
  const bot = b.bot;
  let e = JSON.parse(body2);
  if (typeof e.encrypt === "string") {
    if (!bot.encrypt_key) return json({ error: "unauthorized" }, 401);
    const sig = req.headers.get("x-lark-signature");
    if (sig && !await larkSigned(bot.encrypt_key, req.headers.get("x-lark-request-timestamp"), req.headers.get("x-lark-request-nonce"), sig, body2)) return json({ error: "unauthorized" }, 401);
    e = JSON.parse(await larkDecrypt(bot.encrypt_key, e.encrypt));
  }
  const header = e.header ?? {};
  const token = String(e.token ?? header.token ?? "");
  if (!bot.verification_token || token !== bot.verification_token) return json({ error: "unauthorized" }, 401);
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  if (header.event_type !== "im.message.receive_v1" || !header.event_id || !await firstTime("lark:" + header.event_id)) return json({});
  const ev = e.event ?? {};
  const m = ev.message ?? {};
  if (ev.sender?.sender_type === "app" || m.message_type !== "text" || !m.message_id) return json({});
  if (m.chat_type === "group" && !(m.mentions ?? []).length) return json({});
  const text = larkText(m.content ?? "");
  if (!text) return json({});
  later(startJob(ws, b.owner, bot, { kind: "lark", message_id: m.message_id }, text));
  return json({});
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = new URL(req.url);
  const body2 = await req.text();
  if (body2.length > 2e5) return json({ error: "too large" }, 413);
  if (url.searchParams.get("probe")) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
    if (good !== true) return json({ error: "unauthorized" }, 401);
    const fake = {
      slack: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      lark: "https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-0000-0000-000000000000",
      wecom: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=00000000-0000-0000-0000-000000000000",
      dingtalk: "https://oapi.dingtalk.com/robot/send?access_token=0000000000000000000000000000000000000000000000000000000000000000",
      teams: "https://prod-00.westus.logic.azure.com/workflows/00000000000000000000000000000000/triggers/manual/paths/invoke?api-version=2016-06-01&sig=x"
    };
    const hooks = await Promise.all(HOOK_KINDS.map(async (k) => [k, await postHook(k, fake[k], "Placetta probe")]));
    const slackBot = await slackWho("xoxb-0000000000-0000000000000-000000000000000000000000");
    const larkBot = await larkWorks({ kind: "lark_bot", app_id: "cli_00000000000000", app_secret: "x".repeat(32), verification_token: "x", domain: "feishu" });
    return json({ hooks: Object.fromEntries(hooks), slack_bot_accepts_fake: !!slackBot, lark_bot_accepts_fake: larkBot });
  }
  const s = url.searchParams.get("slack"), l = url.searchParams.get("lark");
  try {
    if (s && UUID.test(s)) return await slack(req, s, body2);
    if (l && UUID.test(l)) return await lark(req, l, body2);
  } catch (e) {
    console.error("chat event", String(e?.message ?? e).slice(0, 160));
    return json({ error: "bad request" }, 400);
  }
  return json({ error: "not found" }, 404);
});
