// Talk to Odelia from Telegram. The business makes its own bot with @BotFather (a minute, no review, free), pastes the
// token into Placetta, and Placetta points the bot's webhook at chat-events with a secret only Telegram and Placetta
// know. Telegram shares no email, so each teammate links their Telegram once by sending the bot the 6-digit code
// Settings shows them (or tapping the t.me link that carries it), the same way WeChat links work. Then a direct message,
// or in a group a mention, /ask or a reply to the bot, becomes a job for Odelia as that teammate, answered as a reply to
// their message. Anything to file, pay or send comes back as a button that opens the approval in the app: nothing is
// approved in Telegram. Everything here is the Telegram side and takes its fetch, so it's tested in telegram_test.ts.
//
// Telegram's own documents, for each piece:
//   the Bot API, setWebhook and secret_token   https://core.telegram.org/bots/api#setwebhook
//   answering in the webhook's response         https://core.telegram.org/bots/api#making-requests-when-getting-updates
//   sendMessage, reply_parameters, keyboards     https://core.telegram.org/bots/api#sendmessage
//   privacy mode in groups, rate limits, cost   https://core.telegram.org/bots/faq
//   deep links (t.me/<bot>?start=<payload>)      https://core.telegram.org/bots/features#deep-linking

/** The bot as saved in the vault: its token (the only credential), the webhook secret Placetta made, and who it is. */
export type TelegramBot = { kind: "telegram_bot"; bot_token: string; secret: string; bot_id: string; username: string };
/** Where an answer goes: the chat, the message it replies to, the forum topic when there is one, and the Telegram user
 *  who asked (the answer only goes while that user is still linked to the member the run belongs to). */
export type TelegramTo = { kind: "telegram"; chat_id: string; message_id: number; thread_id?: number; user: string };

export const TG_API = "https://api.telegram.org";
type Fetch = typeof fetch;

/** A bot token from @BotFather: the bot's id, a colon, and 35 or so letters, digits, - and _. */
export const tgTokenOk = (t: string) => /^\d{3,20}:[A-Za-z0-9_-]{30,60}$/.test(t);
export const tgBotId = (t: string) => t.split(":")[0];
/** A fresh webhook secret: Telegram allows 1 to 256 of A-Z, a-z, 0-9, _ and -. */
export function tgNewSecret(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function same(a: string, b: string) {
  a = String(a ?? ""); b = String(b ?? "");
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Whether a webhook request carries the secret this bot's webhook was set with (constant time). */
export const tgSigned = (bot: Pick<TelegramBot, "secret">, header: string | null) => !!bot.secret && !!header && same(header, bot.secret);

/** One Bot API call. The token is in the address, so nothing about a failed call (which could carry the address) is
 *  ever logged or returned: only Telegram's own error code and description. */
async function call<T>(token: string, method: string, body: Record<string, unknown>, f: Fetch): Promise<{ ok: true; result: T } | { ok: false; code?: number; description?: string }> {
  try {
    const res = await f(`${TG_API}/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const j = await res.json().catch(() => ({})) as { ok?: boolean; result?: T; error_code?: number; description?: string };
    return j.ok ? { ok: true, result: j.result as T } : { ok: false, code: j.error_code ?? res.status, description: String(j.description ?? "").slice(0, 160) };
  } catch { return { ok: false }; }
}

/** Who a pasted token belongs to (getMe), or null when Telegram doesn't accept it. */
export async function tgGetMe(token: string, f: Fetch = fetch): Promise<{ id: string; username: string; groups: boolean } | null> {
  if (!tgTokenOk(token)) return null;
  const r = await call<{ id?: number; is_bot?: boolean; username?: string; can_join_groups?: boolean }>(token, "getMe", {}, f);
  if (!r.ok || !r.result.is_bot || !r.result.id || !r.result.username) return null;
  return { id: String(r.result.id), username: r.result.username, groups: r.result.can_join_groups !== false };
}

/** Points the bot at chat-events: only messages, older ones waiting are dropped, every request carries the secret. */
export async function tgSetWebhook(token: string, url: string, secret: string, f: Fetch = fetch): Promise<{ ok: boolean; why?: string }> {
  const r = await call<boolean>(token, "setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true, max_connections: 20 }, f);
  return r.ok ? { ok: true } : { ok: false, why: r.description || String(r.code ?? "no answer") };
}
export const tgDeleteWebhook = async (token: string, f: Fetch = fetch) => (await call<boolean>(token, "deleteWebhook", { drop_pending_updates: true }, f)).ok;

/** Telegram's limit for one message is 4,096 characters: longer answers go as up to three, the button on the last. */
export const TG_MAX = 4096;
export function tgSplit(text: string, max = 3): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest && out.length < max) {
    if (rest.length <= TG_MAX || out.length === max - 1) { out.push(rest.slice(0, TG_MAX)); break; }
    let cut = rest.lastIndexOf("\n\n", TG_MAX);
    if (cut < TG_MAX / 2) cut = rest.lastIndexOf("\n", TG_MAX);
    if (cut < TG_MAX / 2) cut = rest.lastIndexOf(" ", TG_MAX);
    if (cut < TG_MAX / 2) cut = TG_MAX;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return out.length ? out : [""];
}

/** A button that opens a link (an approval in the app): no callback, so nothing can be approved from Telegram itself. */
export type TgButton = { label: string; url: string };

/** The answer to a job, as a reply to the message that asked, in its forum topic, with the approval button when there
 *  is one. Plain text: whatever the model wrote is shown as written, never parsed as HTML. */
export async function tgSend(bot: Pick<TelegramBot, "bot_token">, to: TelegramTo, text: string, o: { button?: TgButton; f?: Fetch } = {}): Promise<{ ok: boolean; code?: number }> {
  const f = o.f ?? fetch;
  const parts = tgSplit(text);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    const button = last && o.button && /^https:\/\//.test(o.button.url) ? { reply_markup: { inline_keyboard: [[{ text: o.button.label.slice(0, 60), url: o.button.url }]] } } : {};
    const r = await call(bot.bot_token, "sendMessage", {
      chat_id: to.chat_id, text: parts[i] || "…", ...(to.thread_id ? { message_thread_id: to.thread_id } : {}),
      ...(i === 0 ? { reply_parameters: { message_id: to.message_id, allow_sending_without_reply: true } } : {}),
      link_preview_options: { is_disabled: true }, ...button,
    }, f);
    if (!r.ok) return { ok: false, code: r.code };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ one update, start to answer */

type TgUser = { id?: number; is_bot?: boolean; username?: string; language_code?: string };
export type TgMessage = {
  message_id?: number; message_thread_id?: number; is_topic_message?: boolean; from?: TgUser; chat?: { id?: number; type?: string };
  text?: string; caption?: string; photo?: unknown[]; document?: unknown; voice?: unknown; reply_to_message?: { from?: TgUser };
};
export type TgUpdate = { update_id?: number; message?: TgMessage };

/** A message that is only a link code: "123456", "/start 123456", "link 123456" or "关联 123456". */
export function tgLinkCode(text: string): string | null {
  const m = /^(?:\/start(?:@\w+)?\s+|(?:link|关联|绑定)\s*[:：]?\s*)?(\d{6})$/i.exec(text.trim());
  return m ? m[1] : null;
}

/** The words of a message meant for Odelia, or null when it isn't for her: anything in a private chat; in a group, a
 *  mention of the bot, /ask, or a reply to one of the bot's messages (with privacy mode on, which is Telegram's
 *  default, the bot only gets the last two). The mention and the command are taken out. */
export function tgWords(bot: Pick<TelegramBot, "bot_id" | "username">, m: TgMessage): string | null {
  const raw = String(m.text ?? m.caption ?? "");
  const type = m.chat?.type;
  const at = new RegExp(`@${bot.username.replace(/[^\w]/g, "")}\\b`, "gi");
  const ask = /^\/ask(?:@\w+)?(?:\s+|$)/i;
  if (type === "private") return raw.replace(ask, "").replace(at, "").replace(/\s+/g, " ").trim();
  if (type !== "group" && type !== "supergroup") return null;
  const asked = ask.test(raw) && (!/^\/ask@/i.test(raw) || new RegExp(`^/ask@${bot.username}\\b`, "i").test(raw));
  const mentioned = at.test(raw);
  const replied = String(m.reply_to_message?.from?.id ?? "") === bot.bot_id;
  if (!asked && !mentioned && !replied) return null;
  return raw.replace(ask, "").replace(at, "").replace(/\s+/g, " ").trim();
}

export const TG_SAY = {
  /** to someone who hasn't linked: the bot may sit in a group with others, so it says only who she is */
  unknown: "Hi, this is Odelia, the AI compliance agent for this business's team on Placetta. If you're on the team, link your Telegram in Placetta (Settings, Integrations, Odelia in Telegram) and send me the 6-digit code in a private chat.\n您好，这里是 Odelia，这家企业团队在快哉上的 AI 合规助理。如果您是团队成员，请在快哉中关联 Telegram（设置 → 集成 → Telegram 中的 Odelia），然后在私聊中把 6 位验证码发给我。",
  welcome: "Hi, I'm Odelia, Placetta's AI compliance agent for this business's team. Teammates: link your Telegram in Placetta (Settings, Integrations) and send the 6-digit code here. Then ask me about licenses, permits and deadlines anytime.\n您好，我是 Odelia，快哉为这家企业团队提供的 AI 合规助理。团队成员：请在快哉中关联 Telegram（设置 → 集成），然后把 6 位验证码发到这里。之后随时问我执照、许可和截止日期的事。",
  linked: "Linked. Message me here anytime about your licenses, permits and deadlines, and I'll work as you. Anything to file, pay or send still waits for your approval in Placetta.\n已关联。随时在这里问我执照、许可和截止日期的事，我会以您的身份办理。任何提交、付款或发送仍需您在快哉中批准。",
  wrongCode: "That code didn't match. Get a new one in Placetta (Settings, Integrations) and send it here within 30 minutes.\n验证码不对。请在快哉中获取新的验证码（设置 → 集成），并在 30 分钟内发到这里。",
  locked: "Too many tries. Wait an hour, then get a new code in Placetta.\n尝试次数过多。请一小时后在快哉中获取新的验证码。",
  privateCode: "For your safety, send link codes to me in a private chat, not in a group. Get a new code in Placetta, since this one was seen here.\n为了安全，请在私聊中把验证码发给我，不要发在群里。这个验证码已在群里出现，请在快哉中获取新的验证码。",
  textOnly: "I can read text here. Send your question as a message; photos and PDFs go in Placetta's Documents.\n我在这里只能读文字，请用文字发送问题；照片和 PDF 请上传到快哉的“文件”。",
};

/** What handling an update needs from the database and the agent (chat-events passes the real ones; tests pass
 *  stand-ins). */
export type TgDeps = {
  /** true the first time an update is seen: Telegram retries until it gets a 200 */
  firstTime: (id: string) => Promise<boolean>;
  /** a link code this Telegram user sent: "ok", "wrong" or "locked" (telegram_link_claim) */
  claim: (tgUser: string, code: string) => Promise<string | undefined>;
  /** the member this Telegram user is linked to here, and whether they're still a member (telegram_sender) */
  sender: (tgUser: string) => Promise<{ user_id: string; member: boolean } | null>;
  /** hand the job to Odelia as that member, in the background; the answer comes later as a reply */
  start: (uid: string, to: TelegramTo, text: string, lang: "en" | "zh") => void;
  /** what someone who isn't a teammate any more is told, in both languages */
  notTeammate: string;
};
export type TgAnswer = { status: number; body: string };

/**
 * One webhook request, start to answer. Anything quick (a link code's result, a note for someone who isn't linked, the
 * typing indicator while a teammate's job starts) goes back in the webhook's own response as a Bot API call, so it
 * costs no extra request. A request without the bot's secret gets 401 and nothing else.
 */
export async function tgHandle(bot: Pick<TelegramBot, "bot_id" | "username" | "secret">, secretHeader: string | null, body: string, deps: TgDeps): Promise<TgAnswer> {
  if (!tgSigned(bot, secretHeader)) return { status: 401, body: "" };
  let u: TgUpdate;
  try { u = JSON.parse(body) as TgUpdate; } catch { return { status: 200, body: "" }; }
  const m = u.message;
  if (typeof u.update_id !== "number" || !m?.chat?.id || !m.message_id || !m.from?.id || m.from.is_bot) return { status: 200, body: "" };
  const chatId = String(m.chat.id), userId = String(m.from.id);
  if (!/^-?\d{1,20}$/.test(chatId) || !/^\d{3,20}$/.test(userId)) return { status: 200, body: "" };
  if (!(await deps.firstTime(`telegram:${bot.bot_id}:${u.update_id}`))) return { status: 200, body: "" };
  const thread = m.is_topic_message && m.message_thread_id ? { message_thread_id: m.message_thread_id } : {};
  const say = (text: string): TgAnswer => ({ status: 200, body: JSON.stringify({ method: "sendMessage", chat_id: m.chat!.id, text, ...thread, reply_parameters: { message_id: m.message_id, allow_sending_without_reply: true }, link_preview_options: { is_disabled: true } }) });
  const priv = m.chat.type === "private";
  const words = tgWords(bot, m);
  if (words === null) return { status: 200, body: "" };
  // a code: only ever in a private chat, where nobody else sees it
  const code = tgLinkCode(words) ?? (/^\/start(?:@\w+)?\s+\d{6}$/i.test(String(m.text ?? "").trim()) ? tgLinkCode(String(m.text).trim()) : null);
  if (code) {
    if (!priv) return say(TG_SAY.privateCode);
    const r = await deps.claim(userId, code);
    return say(r === "ok" ? TG_SAY.linked : r === "locked" ? TG_SAY.locked : TG_SAY.wrongCode);
  }
  if (/^\/(start|help)(?:@\w+)?\b/i.test(String(m.text ?? "").trim()) && priv) {
    const who = await deps.sender(userId);
    return say(who?.member ? TG_SAY.linked : TG_SAY.welcome);
  }
  if (!words) return (m.photo || m.document || m.voice) && priv ? say(TG_SAY.textOnly) : { status: 200, body: "" };
  const who = await deps.sender(userId);
  if (!who) return say(TG_SAY.unknown);
  if (!who.member) return say(deps.notTeammate);
  const lang = /[一-鿿]/.test(words) ? "zh" : "en";
  deps.start(who.user_id, { kind: "telegram", chat_id: chatId, message_id: m.message_id, ...(thread.message_thread_id ? { thread_id: thread.message_thread_id } : {}), user: userId }, words, lang);
  // the typing indicator while she starts; her answer comes as a reply to this message
  return { status: 200, body: JSON.stringify({ method: "sendChatAction", chat_id: m.chat.id, action: "typing", ...thread }) };
}

/** The link a teammate taps to link their Telegram: opens the bot with the code already in /start. */
export const tgDeepLink = (username: string, code: string) => `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(code)}`;
