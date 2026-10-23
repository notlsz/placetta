// Talk to Odelia from Slack, Lark (Feishu), WeChat, Microsoft Teams or Telegram. The business creates its own bot in its
// own Slack, Lark, Teams or Telegram (a few clicks, no app review), or points its own WeChat Official Account at
// Placetta, pastes the credentials into Placetta, and points the events at chat-events. Mention the bot in a channel, or
// message it directly, and Odelia takes the job and answers in the same thread (in WeChat, the same chat). The
// credentials live in the vault; only the server reads them. WeChat's side is in wechat.ts, Teams' in teams.ts and
// Telegram's in telegram.ts; docs/CHANNELS.md compares them all.
import { type WechatBot, wxSendText } from "./wechat.ts";
import { type TeamsBot, teamsReply, type TeamsTo } from "./teams.ts";
import { type TelegramBot, tgSend, type TelegramTo } from "./telegram.ts";
export type { WechatBot } from "./wechat.ts";
export type { TeamsBot, TeamsTo } from "./teams.ts";
export type { TelegramBot, TelegramTo } from "./telegram.ts";

export type SlackBot = { kind: "slack_bot"; bot_token: string; signing_secret: string };
export type LarkBot = { kind: "lark_bot"; app_id: string; app_secret: string; verification_token: string; encrypt_key?: string; domain: "feishu" | "lark" };
export type Bot = SlackBot | LarkBot | WechatBot | TeamsBot | TelegramBot;
/** Where an answer goes back: the Slack channel and thread, the Lark message to reply to, the WeChat follower (by
 *  their OpenID for this account), the Teams message to reply to (in its thread), or the Telegram message to reply to. */
export type ChatTo = { kind: "slack"; channel: string; thread_ts: string; user?: string } | { kind: "lark"; message_id: string; group?: boolean } | { kind: "wechat"; openid: string } | TeamsTo | TelegramTo;
/** The chats a job can come from, each with its bot's integration kind. */
export const CHAT_KINDS = { slack: "slack_bot", lark: "lark_bot", wechat: "wechat_bot", teams: "teams_bot", telegram: "telegram_bot" } as const;
export type ChatKind = keyof typeof CHAT_KINDS;
export const isChatKind = (v: unknown): v is ChatKind => typeof v === "string" && Object.hasOwn(CHAT_KINDS, v);

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Constant-time comparison of two strings. */
export function same(a: string, b: string) {
  a = String(a ?? ""); b = String(b ?? "");
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ------------------------------------------------------------------ who's asking */
// Anyone in the business's Slack or Lark can message the bot, but only Placetta teammates may give Odelia jobs, and a
// job runs as the teammate who asked. The chat's user is matched to a Placetta account by email: Slack's users.info
// (users:read, users:read.email) or Lark's contact API (contact:user.email:readonly). Guests, people from another
// company in a shared channel, and anyone whose email can't be read are turned away politely.

/** Who sent a chat message: their email when they're a full member of the bot's own workspace, else why not. */
export type ChatSender = { ok: true; email: string } | { ok: false; why: "outsider" | "guest" | "unknown" | "setup" };

/** A Slack sender: a full member (not a guest, not a bot) of the bot's own Slack team, with a readable email. */
export async function slackSender(bot: SlackBot, ev: { user?: string; user_team?: string; team?: string }, homeTeam: string | undefined, f: typeof fetch = fetch): Promise<ChatSender> {
  if (!ev.user || !homeTeam) return { ok: false, why: "unknown" };
  // Slack Connect: someone from another company in a shared channel
  if ((ev.user_team ?? ev.team ?? homeTeam) !== homeTeam) return { ok: false, why: "outsider" };
  const res = await f(`https://slack.com/api/users.info?user=${encodeURIComponent(ev.user)}`, { headers: { Authorization: `Bearer ${bot.bot_token}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!res) return { ok: false, why: "unknown" };
  const j = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; user?: { team_id?: string; deleted?: boolean; is_bot?: boolean; is_restricted?: boolean; is_ultra_restricted?: boolean; is_stranger?: boolean; profile?: { email?: string } } };
  if (!j.ok || !j.user) return { ok: false, why: j.error === "missing_scope" || j.error === "not_allowed_token_type" ? "setup" : "unknown" };
  const u = j.user;
  if (u.is_stranger || (u.team_id && u.team_id !== homeTeam)) return { ok: false, why: "outsider" };
  if (u.is_restricted || u.is_ultra_restricted) return { ok: false, why: "guest" };
  if (u.deleted || u.is_bot) return { ok: false, why: "unknown" };
  const email = String(u.profile?.email ?? "").trim().toLowerCase();
  if (!email) {
    // Without users:read.email Slack leaves the email out; Slack lists the token's scopes in X-OAuth-Scopes.
    const scopes = res.headers.get("x-oauth-scopes");
    return { ok: false, why: scopes !== null && !scopes.split(",").map((s) => s.trim()).includes("users:read.email") ? "setup" : "unknown" };
  }
  return { ok: true, email };
}

/** A Lark sender: a user (not an app) of the bot's own tenant, with a readable email. */
export async function larkSender(bot: LarkBot, sender: { sender_type?: string; tenant_key?: string; sender_id?: { open_id?: string } } | undefined, homeTenant: string | undefined, f: typeof fetch = fetch): Promise<ChatSender> {
  const openId = sender?.sender_id?.open_id;
  if (!sender || sender.sender_type !== "user" || !openId) return { ok: false, why: "unknown" };
  // someone from another company (an external contact in the chat)
  if (!homeTenant || !sender.tenant_key || sender.tenant_key !== homeTenant) return { ok: false, why: "outsider" };
  const tok = await larkToken(bot, f);
  if (!tok) return { ok: false, why: "setup" };
  const res = await f(`${larkBase(bot.domain)}/open-apis/contact/v3/users/${encodeURIComponent(openId)}?user_id_type=open_id`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { code?: number; data?: { user?: { email?: string; is_tenant_manager?: boolean; status?: { is_resigned?: boolean; is_frozen?: boolean } } } };
  // a missing permission or a user outside the app's contact range both come back as an error code
  if (j.code !== 0 || !j.data?.user) return { ok: false, why: res ? "setup" : "unknown" };
  if (j.data.user.status?.is_resigned || j.data.user.status?.is_frozen) return { ok: false, why: "unknown" };
  const email = String(j.data.user.email ?? "").trim().toLowerCase();
  return email ? { ok: true, email } : { ok: false, why: "setup" };
}

/** What Odelia says to someone she can't take a job from, in both languages since we don't know theirs. */
export const NOT_TEAMMATE = "Sorry, only Placetta teammates can give Odelia jobs. The workspace owner can invite you to Placetta.\n抱歉，只有快哉团队成员可以给 Odelia 派任务。工作区负责人可以邀请您加入快哉。";
export const NEEDS_EMAIL_SCOPE = "I can't tell who's asking yet. The Placetta owner needs to let this bot read members' emails (Slack: users:read and users:read.email; Lark: contact:user.email:readonly, with the contact range covering your team), then reinstall it.\n我还无法确认是谁在提问。快哉负责人需要为这个机器人开通读取成员邮箱的权限（Slack：users:read 和 users:read.email；飞书：contact:user.email:readonly，并让通讯录权限范围包含团队成员），然后重新安装。";

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
export async function slackWho(token: string): Promise<{ team: string; bot: string; team_id?: string; user_id?: string } | null> {
  const res = await fetch("https://slack.com/api/auth.test", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { ok?: boolean; team?: string; user?: string; team_id?: string; user_id?: string };
  return j.ok ? { team: j.team ?? "Slack", bot: j.user ?? "odelia", ...(j.team_id ? { team_id: j.team_id } : {}), ...(j.user_id ? { user_id: j.user_id } : {}) } : null;
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

/**
 * Opens a Lark event request, or null when it isn't genuine. With an Encrypt Key set, the body must be encrypted and
 * signed; only Lark's URL check, which it sends unsigned, may come without a signature. The verification token inside
 * must match, compared in constant time.
 */
export async function larkOpen(bot: LarkBot, h: { ts: string | null; nonce: string | null; sig: string | null }, body: string): Promise<Record<string, unknown> | null> {
  let e: Record<string, unknown>;
  try { e = JSON.parse(body) as Record<string, unknown>; } catch { return null; }
  if (bot.encrypt_key) {
    if (typeof e.encrypt !== "string") return null;
    const signed = !!h.sig;
    if (signed && !(await larkSigned(bot.encrypt_key, h.ts, h.nonce, h.sig, body))) return null;
    try { e = JSON.parse(await larkDecrypt(bot.encrypt_key, e.encrypt)) as Record<string, unknown>; } catch { return null; }
    if (!signed && e.type !== "url_verification") return null;
  } else if (typeof e.encrypt === "string") return null;
  const header = (e.header ?? {}) as { token?: string };
  const token = String(e.token ?? header.token ?? "");
  if (!bot.verification_token || !same(token, bot.verification_token)) return null;
  return e;
}

async function larkToken(bot: LarkBot, f: typeof fetch = fetch): Promise<string | null> {
  const res = await f(`${larkBase(bot.domain)}/open-apis/auth/v3/tenant_access_token/internal`, {
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

/** Answer in the chat a job came from. tail (the link to an approval) ends the answer; WeChat keeps it whole when a long
 *  answer is cut. button: the approval as a button that opens the app, where the chat has link buttons (Teams,
 *  Telegram); elsewhere it becomes a line with the link. Never a button that approves anything in the chat itself.
 *  save: where a WeChat account's fresh API token goes (the vault), so every instance shares it. */
export async function chatReply(bot: Bot, to: ChatTo, text: string, o: { tail?: string; save?: (bot: WechatBot) => Promise<void>; button?: { label: string; url: string } } = {}): Promise<boolean> {
  if (bot.kind === "teams_bot" && to.kind === "teams") return await teamsReply(bot, to, text + (o.tail ?? ""), { button: o.button });
  if (bot.kind === "telegram_bot" && to.kind === "telegram") return (await tgSend(bot, to, text + (o.tail ?? ""), { button: o.button })).ok;
  if (o.button) o = { ...o, tail: `${o.tail ?? ""}\n\n${o.button.label}: ${o.button.url}` };
  if (bot.kind === "slack_bot" && to.kind === "slack") return await slackPost(bot, { channel: to.channel, thread_ts: to.thread_ts }, text + (o.tail ?? ""));
  if (bot.kind === "lark_bot" && to.kind === "lark") return await larkReply(bot, to.message_id, text + (o.tail ?? ""));
  if (bot.kind === "wechat_bot" && to.kind === "wechat") {
    const r = await wxSendText(bot, to.openid, text, { tail: o.tail, save: o.save });
    if (!r.ok) console.error("wechat send", r.errcode ?? r.problem);
    return r.ok;
  }
  return false;
}

/** The Slack app manifest a business pastes into "Create an app, From a manifest": the bot, its scopes, and its events
    pointed at this workspace's address. */
export function slackManifest(eventsUrl: string) {
  return {
    display_information: { name: "Odelia", description: "Placetta's compliance agent: licenses, permits, filings and deadlines.", background_color: "#4d73a3" },
    features: {
      bot_user: { display_name: "Odelia", always_online: true }, app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
      // /odelia and the "Make it a task" shortcut (_shared/slack.ts): Slack signs both with the same secret, at the same address
      slash_commands: [{ command: "/odelia", url: eventsUrl, description: "Ask Odelia about licenses, permits and deadlines", usage_hint: "[question] | status | ambient on|off", should_escape: false }],
      shortcuts: [{ name: "Make it a task", type: "message", callback_id: "odelia_task", description: "Odelia turns this thread into a task in Placetta" }],
    },
    // users:read and users:read.email: who's asking, so the job runs as that Placetta teammate (and nobody else's runs).
    // channels:history and groups:history: the thread before a mention (Claude in Slack reads it too) and the opt-in
    // ambient check; files:read: photos and PDFs sent to Odelia; commands: /odelia.
    oauth_config: { scopes: { bot: ["app_mentions:read", "chat:write", "commands", "channels:history", "groups:history", "files:read", "im:history", "im:read", "im:write", "users:read", "users:read.email"] } },
    settings: {
      event_subscriptions: { request_url: eventsUrl, bot_events: ["app_mention", "message.im", "message.channels", "message.groups"] },
      interactivity: { is_enabled: true, request_url: eventsUrl },
      org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false,
    },
  };
}
