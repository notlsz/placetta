// Talk to Odelia from Slack or Lark (Feishu). The business creates its own bot in its own Slack or Lark (a few clicks,
// no app review), pastes the bot's credentials into Placetta, and points the bot's events at chat-events. Mention the
// bot in a channel, or message it directly, and Odelia takes the job and answers in the same thread. The credentials
// live in the vault; only the server reads them.

export type SlackBot = { kind: "slack_bot"; bot_token: string; signing_secret: string };
export type LarkBot = { kind: "lark_bot"; app_id: string; app_secret: string; verification_token: string; encrypt_key?: string; domain: "feishu" | "lark" };
export type Bot = SlackBot | LarkBot;
/** Where an answer goes back: the Slack channel and thread, or the Lark message to reply to. */
export type ChatTo = { kind: "slack"; channel: string; thread_ts: string } | { kind: "lark"; message_id: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Constant-time comparison of two strings. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ------------------------------------------------------------------ Slack */

/** Slack signs each request: v0=HMAC-SHA256(signing secret, "v0:timestamp:body"), at most five minutes old. */
export async function slackSigned(secret: string, ts: string | null, sig: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!ts || !sig || !/^\d+$/.test(ts) || Math.abs(now / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = "v0=" + hex(await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${ts}:${body}`)));
  return same(want, sig);
}

/** The words of a Slack message, without the bot's mention. */
export const slackText = (t: string) => t.replace(/<@[A-Z0-9]+>/g, "").replace(/\s+/g, " ").trim();

export async function slackPost(bot: SlackBot, to: { channel: string; thread_ts?: string }, text: string): Promise<boolean> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${bot.bot_token}` },
    body: JSON.stringify({ channel: to.channel, ...(to.thread_ts ? { thread_ts: to.thread_ts } : {}), text: text.slice(0, 3900), unfurl_links: false }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const j = res ? await res.json().catch(() => ({})) : {};
  return !!(j as { ok?: boolean }).ok;
}

/** Checks a pasted bot token: which Slack team and bot it is. */
export async function slackWho(token: string): Promise<{ team: string; bot: string } | null> {
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; team?: string; user?: string };
  return j.ok ? { team: j.team ?? "Slack", bot: j.user ?? "odelia" } : null;
}

/* ------------------------------------------------------------------ Lark (Feishu) */

const larkBase = (d: LarkBot["domain"]) => (d === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn");

/** With an Encrypt Key set, Lark sends {encrypt}: AES-256-CBC, key = SHA-256(encrypt key), IV = the first 16 bytes. */
export async function larkDecrypt(encryptKey: string, data: string): Promise<string> {
  const raw = b64bytes(data);
  const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(encryptKey));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: raw.slice(0, 16) }, key, raw.slice(16));
  return new TextDecoder().decode(out);
}

/** Lark's request signature when an Encrypt Key is set: SHA-256 hex of timestamp + nonce + encrypt key + body. */
export async function larkSigned(encryptKey: string, ts: string | null, nonce: string | null, sig: string | null, body: string): Promise<boolean> {
  if (!ts || !nonce || !sig) return false;
  return same(hex(await crypto.subtle.digest("SHA-256", enc.encode(ts + nonce + encryptKey + body))), sig);
}

/** The words of a Lark text message, without the @ mentions. */
export function larkText(content: string): string {
  try { return String((JSON.parse(content) as { text?: string }).text ?? "").replace(/@_user_\d+/g, "").replace(/\s+/g, " ").trim(); } catch { return ""; }
}

async function larkToken(bot: LarkBot): Promise<string | null> {
  const res = await fetch(`${larkBase(bot.domain)}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify({ app_id: bot.app_id, app_secret: bot.app_secret }), signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { code?: number; tenant_access_token?: string };
  return j.code === 0 && j.tenant_access_token ? j.tenant_access_token : null;
}

/** Checks pasted Lark credentials by getting a token with them. */
export const larkWorks = async (bot: LarkBot) => !!(await larkToken(bot));

export async function larkReply(bot: LarkBot, messageId: string, text: string): Promise<boolean> {
  const tok = await larkToken(bot);
  if (!tok) return false;
  const res = await fetch(`${larkBase(bot.domain)}/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reply`, {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ msg_type: "text", content: JSON.stringify({ text: text.slice(0, 3900) }) }), signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { code?: number };
  return j.code === 0;
}

/** Answer in the chat a job came from. */
export async function chatReply(bot: Bot, to: ChatTo, text: string): Promise<boolean> {
  if (bot.kind === "slack_bot" && to.kind === "slack") return await slackPost(bot, { channel: to.channel, thread_ts: to.thread_ts }, text);
  if (bot.kind === "lark_bot" && to.kind === "lark") return await larkReply(bot, to.message_id, text);
  return false;
}

/** The Slack app manifest a business pastes into "Create an app, From a manifest": the bot, its scopes, and its events
    pointed at this workspace's address. */
export function slackManifest(eventsUrl: string) {
  return {
    display_information: { name: "Odelia", description: "Placetta's compliance agent: licenses, permits, filings and deadlines.", background_color: "#4d73a3" },
    features: { bot_user: { display_name: "Odelia", always_online: true }, app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false } },
    oauth_config: { scopes: { bot: ["app_mentions:read", "chat:write", "im:history", "im:read", "im:write"] } },
    settings: { event_subscriptions: { request_url: eventsUrl, bot_events: ["app_mention", "message.im"] }, org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
  };
}
