// chat-events: what a business's own Slack or Lark bot, or its own WeChat Official Account, hears. POST ?slack=<workspace
// id> or ?lark=<workspace id>, set as the bot's event address when it's connected in Settings, Integrations; WeChat
// uses /chat-events/wechat/<workspace id> as its server address (GET for the URL check WeChat sends when the address is
// saved, POST for messages). Each request is checked against that bot's own secret (Slack's signing secret; Lark's
// verification token, and with an Encrypt Key on, its signature, which every request but Lark's URL check must carry;
// WeChat's Token, and in safe mode the msg_signature and the AES seal for that AppID). A mention in a channel, or a
// direct message, becomes a job for Odelia; she answers in the same thread, or in WeChat the same chat. Slack, Lark and
// WeChat all retry, so each event is taken once, by its event id (WeChat's MsgId).
//
// The job runs as the teammate who asked, never as whoever connected the bot: the sender is looked up in Slack
// (users.info) or Lark (the contact API), matched by email to a Placetta account, and must be a member of this
// workspace. WeChat doesn't share emails, so a teammate links their WeChat once by sending the account the 6-digit
// code Settings shows them (wechat_links). Guests, people from another company in a shared channel, followers who
// haven't linked, and anyone else get a polite note in both languages and no run. Anything to file, pay or send still
// waits for an approval in the app. The one exception is Placetta's own public account (the workspace named by
// ODELIA_PUBLIC_WECHAT_WS): a follower who isn't on the team can text to start ("奶茶店，纽约法拉盛") and gets the plan
// and its claim link as the reply (_shared/text_start.ts), with no run and no model.
//
// Microsoft Teams (?teams=<workspace id>, the bot's messaging endpoint): every request carries a Bot Framework token,
// checked against Microsoft's published keys, this bot's ID and the service address (teams.ts); the sender is matched by
// work email like Slack, and only people in the bot's own tenant count. Telegram (/chat-events/telegram/<workspace id>,
// set as the bot's webhook when it's connected): every request carries the secret Placetta set with the webhook; a
// teammate links their Telegram once with a 6-digit code, like WeChat (telegram.ts).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { type Bot, type ChatSender, type ChatTo, chatReply, type LarkBot, larkOpen, larkSender, larkText, larkWorks, NEEDS_EMAIL_SCOPE, NOT_TEAMMATE, type SlackBot, slackSender, slackSigned, slackText, slackWho } from "../_shared/bots.ts";
import { TEAMS_SETUP, type TeamsBot, type TeamsFile, teamsHandle, teamsSender, teamsToken } from "../_shared/teams.ts";
import { tgDownload, type TgFile, tgHandle } from "../_shared/telegram.ts";
import { type ChatFile, fetchBytes, FILE_ONLY, fileName, fileOk, FILES_UNREAD, filesNote, mimeOf } from "../_shared/chat_files.ts";
import { DOC_MAX, storeDocs } from "../_shared/odelia_db.ts";
import { ambientBlocks, ambientWorth, actionSaid, ephemeral, type Form, interactionOf, itemOf, SLASH_HELP, type SlackFile, slackEphemeral, slackFiles, slackForm, slackPostBlocks, slashOf, TASK_PROMPT, threadContext, threadOf } from "../_shared/slack.ts";
import { telegramBot, telegramSender } from "../_shared/telegram_db.ts";
import { HOOK_KINDS, postHook } from "../_shared/channels.ts";
import { type WechatBot, WX_SAY, wxCredsWork, wxHandle, wxUrlCheck } from "../_shared/wechat.ts";
import { wechatAccount, wechatSender } from "../_shared/wechat_db.ts";
import { publicWechatWs, startForStranger, textStartOn } from "../_shared/text_start_db.ts";

const env = (k: string) => Deno.env.get(k);
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const okEmpty = () => new Response("", { status: 200 });

let selfKey = "";
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}

/** The workspace's bot credentials from the vault. */
async function botOf(ws: string, kind: "slack_bot" | "lark_bot" | "teams_bot"): Promise<Bot | null> {
  return (await botRow(ws, kind))?.bot ?? null;
}
/** The bot and its integration row's settings (Slack: its own user, its team, the channels with the ambient check on). */
type BotMeta = { bot_user?: string; team_id?: string; ambient_channels?: string[] };
async function botRow(ws: string, kind: "slack_bot" | "lark_bot" | "teams_bot"): Promise<{ id: string; bot: Bot; meta: BotMeta } | null> {
  const { data: row } = await admin.from("integrations").select("id, secret_id, status, meta").eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (!row?.secret_id || row.status !== "connected") return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  try { return { id: String(row.id), bot: { ...JSON.parse(String(raw ?? "")), kind } as Bot, meta: (row.meta ?? {}) as BotMeta }; } catch { return null; }
}

/** An event id seen for the first time (Slack and Lark retry until they get a 200 in time). */
async function firstTime(id: string) {
  const { data } = await admin.from("chat_events").upsert({ id: id.slice(0, 200) }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  return !!data?.length;
}

/** The Placetta account behind a chat sender's email, if it's a member of this workspace (any role). */
async function teammate(ws: string, email: string): Promise<string | null> {
  const { data: uid } = await admin.rpc("user_by_email", { p_email: email });
  if (typeof uid !== "string" || !UUID.test(uid)) return null;
  const { data: m } = await admin.from("workspace_members").select("user_id").eq("workspace_id", ws).eq("user_id", uid).maybeSingle();
  return m?.user_id ? uid : null;
}

/** Keep working after the answer has gone back (Slack wants one within 3 seconds). */
// deno-lint-ignore no-explicit-any
const later = (p: Promise<unknown>) => { const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(p); };

const zh = (t: string) => /[一-鿿]/.test(t);

/** Hands the job to Odelia as this member (agent-run, with the monitor key): null once it started (or joined the same
 *  request still running), else what to tell them, in their language. */
async function startChat(ws: string, uid: string, to: ChatTo, prompt: string, lang: "en" | "zh"): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
    body: JSON.stringify({ action: "start_chat", workspace_id: ws, user_id: uid, channel: to.kind, chat_to: to, prompt: prompt.slice(0, 4000), lang }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (res?.status === 202) return null;
  const j = res ? await res.json().catch(() => ({})) as { error?: { message?: string } } : {};
  return j.error?.message ?? (lang === "zh" ? "暂时无法开始，请稍后再试。" : "I couldn't start that just now. Try again in a moment.");
}

/** A chat's photos and PDFs, fetched once the sender is known to be a teammate and saved to Documents as them. */
type Files = { chat: string; list: ChatFile[]; read: (f: ChatFile, i: number) => Promise<Uint8Array | null> };
async function saveChatFiles(ws: string, uid: string, files: Files | undefined): Promise<{ saved: string[]; skipped: number }> {
  if (!files?.list.length) return { saved: [], skipped: 0 };
  const got: { name: string; mime: string; bytes: Uint8Array }[] = [];
  let skipped = 0;
  for (const [i, f] of files.list.slice(0, 5).entries()) {
    const bytes = fileOk(f) ? await files.read(f, i).catch(() => null) : null;
    if (bytes) got.push({ name: fileName(files.chat, i, f), mime: mimeOf(f.mime), bytes }); else skipped++;
  }
  const saved = got.length ? await storeDocs(admin, ws, uid, got, { folder: files.chat.toLowerCase(), tag: { en: `Sent in ${files.chat}`, zh: `${files.chat} 发送` } }) : [];
  return { saved: saved.map((s) => s.name), skipped: skipped + (got.length - saved.length) + Math.max(0, files.list.length - 5) };
}

/** Works out who asked and, for a teammate, hands the job to Odelia as them, with the photos and PDFs they sent saved to
 *  Documents and, in a Slack thread, the thread before they asked as context; anyone else gets a note and no run, and
 *  nothing of theirs is fetched. */
async function takeJob(ws: string, bot: Bot, to: ChatTo, prompt: string, who: () => Promise<ChatSender>, o: { files?: Files; context?: (lang: "en" | "zh") => Promise<string> } = {}) {
  const sender = await who().catch(() => ({ ok: false, why: "unknown" }) as ChatSender);
  const uid = sender.ok ? await teammate(ws, sender.email) : null;
  if (!uid) {
    if (!sender.ok) console.warn("chat sender refused", to.kind, sender.why);
    await chatReply(bot, to, !sender.ok && sender.why === "setup" ? (to.kind === "teams" ? TEAMS_SETUP : NEEDS_EMAIL_SCOPE) : NOT_TEAMMATE);
    return;
  }
  await startAs(ws, bot, uid, to, prompt, zh(prompt) ? "zh" : "en", o);
}
/** Starts the job for a teammate already known: files saved first, the context added, refusals said back in the chat. */
async function startAs(ws: string, bot: Bot, uid: string, to: ChatTo, prompt: string, lang: "en" | "zh", o: { files?: Files; context?: (lang: "en" | "zh") => Promise<string> } = {}) {
  const got = await saveChatFiles(ws, uid, o.files);
  if (!prompt && !got.saved.length) { if (got.skipped) await chatReply(bot, to, FILES_UNREAD[lang]); return; }
  const context = o.context ? await o.context(lang).catch(() => "") : "";
  const ask = (prompt || FILE_ONLY[lang]) + context + filesNote({ saved: got.saved, skipped: got.skipped, asked: !!prompt, chat: o.files?.chat ?? "chat", lang });
  const why = await startChat(ws, uid, to, ask, lang);
  if (why) await chatReply(bot, to, why);
}

/* ------------------------------------------------------------------ Slack */

/** The Slack user's teammate account, or null (a guest, someone from another company, no email). */
async function slackTeammate(ws: string, bot: SlackBot, user: string, team: string): Promise<string | null> {
  const s = await slackSender(bot, { user }, team).catch(() => ({ ok: false }) as ChatSender);
  return s.ok ? await teammate(ws, s.email) : null;
}
/** Says something to the person through Slack's response_url (only they see it). */
async function respond(url: string, body: Record<string, unknown>) {
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) return;
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }).catch(() => null);
}
const slackLang = (t: string): "en" | "zh" => (zh(t) ? "zh" : "en");
/** Files on a Slack message, read with the bot token from files.slack.com. */
const slackFilesOf = (bot: SlackBot, list: SlackFile[] | undefined): Files | undefined => {
  const fs = slackFiles(list);
  return fs.length ? { chat: "Slack", list: fs, read: (f) => fetchBytes(f.url ?? "", { Authorization: `Bearer ${bot.bot_token}` }) } : undefined;
};

async function slack(req: Request, ws: string, body: string) {
  const row = await botRow(ws, "slack_bot");
  const bot = row?.bot as SlackBot | undefined;
  if (!row || !bot || !(await slackSigned(bot.signing_secret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body))) return json({ error: "unauthorized" }, 401);
  // slash commands and interactions come form-encoded to the same address; events come as JSON
  if (!body.trimStart().startsWith("{")) return slackForm_(ws, row.id, bot, row.meta, slackForm(body));
  const e = JSON.parse(body) as { type?: string; challenge?: string; event_id?: string; team_id?: string; event?: Record<string, unknown> };
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  // Retries (x-slack-retry-num) come through like any event; the event id makes sure each is taken only once.
  const ev = (e.event ?? {}) as { type?: string; channel_type?: string; subtype?: string; bot_id?: string; user?: string; text?: string; channel?: string; ts?: string; thread_ts?: string; files?: SlackFile[] };
  const mention = ev.type === "app_mention";
  const dm = ev.type === "message" && ev.channel_type === "im" && (!ev.subtype || ev.subtype === "file_share");
  const chan = ev.type === "message" && (ev.channel_type === "channel" || ev.channel_type === "group") && (!ev.subtype || ev.subtype === "file_share");
  if ((!mention && !dm && !chan) || ev.bot_id || !e.event_id || !ev.channel || !ev.ts) return okEmpty();
  const team = row.meta.team_id ?? e.team_id ?? "";
  if (chan) {
    // the opt-in check (Claude Tag's ambient behavior): only in a channel an owner or admin turned it on for, only for
    // a message about an inspection, a permit or a deadline, once a thread, and only the person who wrote it sees it
    if (!(row.meta.ambient_channels ?? []).includes(ev.channel) || !ambientWorth(ev, row.meta.bot_user)) return okEmpty();
    const thread = ev.thread_ts ?? ev.ts;
    if (!(await firstTime("slack:" + e.event_id)) || !(await firstTime(`slack-ambient:${ev.channel}:${thread}`))) return okEmpty();
    later((async () => {
      const uid = ev.user ? await slackTeammate(ws, bot, ev.user, team) : null;
      if (!uid || !ev.user) return;
      await slackEphemeral(bot.bot_token, { channel: ev.channel!, user: ev.user, thread_ts: thread, text: "Want me to make this a task?", blocks: ambientBlocks(slackLang(ev.text ?? ""), thread) }).catch(() => false);
    })());
    return okEmpty();
  }
  if (!(await firstTime("slack:" + e.event_id))) return okEmpty();
  const text = slackText(ev.text ?? "");
  const files = slackFilesOf(bot, ev.files);
  if (!text && !files) return okEmpty();
  const to: ChatTo = { kind: "slack", channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts, ...(ev.user && /^[UW][A-Z0-9]{6,20}$/.test(ev.user) ? { user: ev.user } : {}) };
  // asked inside a thread: the thread before the mention comes along, as Claude in Slack reads it
  const context = mention && ev.thread_ts && ev.thread_ts !== ev.ts
    ? async (lang: "en" | "zh") => threadContext((await threadOf(bot.bot_token, ev.channel!, ev.thread_ts!)) ?? [], { before: ev.ts!, botUser: row.meta.bot_user, lang }) : undefined;
  // answer Slack within its 3 seconds; looking up the sender and starting the job happen in the background
  later(takeJob(ws, bot, to, text, () => slackSender(bot, ev, team || undefined), { files, context }));
  return okEmpty();
}

/** /odelia and the interactions (buttons, the "Make it a task" shortcut). Slack wants an answer within 3 seconds, so
 *  the HTTP answer says what's happening and the work goes on in the background, its outcome through response_url. */
async function slackForm_(ws: string, rowId: string, bot: SlackBot, meta: BotMeta, form: Form): Promise<Response> {
  const team = meta.team_id ?? form.team_id ?? "";
  if (form.command) {
    const cmd = slashOf(form.text ?? ""), lang = slackLang(form.text ?? "");
    const user = form.user_id ?? "", channel = form.channel_id ?? "", url = form.response_url ?? "";
    if (cmd.kind === "help") return json(ephemeral(SLASH_HELP));
    if (!/^[UW][A-Z0-9]{6,20}$/.test(user) || !/^[CGD][A-Z0-9]{6,24}$/.test(channel)) return json(ephemeral(NOT_TEAMMATE));
    if (cmd.kind === "ambient") {
      later((async () => {
        const uid = await slackTeammate(ws, bot, user, team);
        const { data: m } = uid ? await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", uid).maybeSingle() : { data: null };
        if (!m || !["owner", "admin"].includes(String(m.role))) { await respond(url, ephemeral(lang === "zh" ? "只有快哉的所有者或管理员可以开启或关闭主动提示。" : "Only a Placetta owner or admin can turn the ambient check on or off.")); return; }
        if (channel.startsWith("D")) { await respond(url, ephemeral(lang === "zh" ? "主动提示只在频道中使用。" : "The ambient check is for channels, not direct messages.")); return; }
        const list = new Set(meta.ambient_channels ?? []);
        if (cmd.on) list.add(channel); else list.delete(channel);
        await admin.from("integrations").update({ meta: { ...meta, ambient_channels: [...list].slice(0, 50) } }).eq("id", rowId);
        await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: uid, action: cmd.on ? { en: "Turned on Odelia's ambient check in a Slack channel", zh: "在 Slack 频道开启了 Odelia 的主动提示" } : { en: "Turned off Odelia's ambient check in a Slack channel", zh: "在 Slack 频道关闭了 Odelia 的主动提示" }, object: { en: "Odelia in Slack", zh: "Slack 中的 Odelia" } });
        await respond(url, ephemeral(cmd.on
          ? (lang === "zh" ? "已开启。有人在这里提到检查、许可或截止日期时，Odelia 只会向那个人提出一次跟进建议，每个话题一次。" : "On. When someone here mentions an inspection, a permit or a deadline, Odelia offers once, only to them, to make it a task. One offer a thread.")
          : (lang === "zh" ? "已关闭。只有 @Odelia 时她才会回应。" : "Off. She answers only when someone mentions @Odelia.")));
      })());
      return json(ephemeral(lang === "zh" ? "正在处理…" : "One moment..."));
    }
    // a question: posted in the channel as theirs, answered in its thread, as them
    later((async () => {
      const uid = await slackTeammate(ws, bot, user, team);
      if (!uid) { await respond(url, ephemeral(NOT_TEAMMATE)); return; }
      const posted = await slackPostBlocks(bot.bot_token, { channel, text: `<@${user}> asked Odelia: ${cmd.prompt.slice(0, 2800)}` });
      if (!posted.ok || !posted.ts) {
        await respond(url, ephemeral(posted.error === "not_in_channel" || posted.error === "channel_not_found"
          ? (lang === "zh" ? "请先把 Odelia 加入这个频道（/invite @Odelia），或在私信中问她。" : "Add Odelia to this channel first (/invite @Odelia), or ask her in a direct message.")
          : (lang === "zh" ? "暂时无法发帖，请稍后再试。" : "I couldn't post here just now. Try again in a moment.")));
        return;
      }
      await startAs(ws, bot, uid, { kind: "slack", channel, thread_ts: posted.ts, user }, cmd.prompt, lang);
    })());
    return json(ephemeral(lang === "zh" ? "收到，我会在频道的话题中回答。" : "On it. I'll answer in a thread in this channel."));
  }

  const it = interactionOf(form);
  if (it.kind === "ignore") return okEmpty();
  later((async () => {
    const uid = await slackTeammate(ws, bot, it.user, team);
    if (!uid) { await respond(it.response_url, ephemeral(NOT_TEAMMATE)); return; }
    if (it.kind === "thread_task") {
      const msgs = (await threadOf(bot.bot_token, it.channel, it.thread_ts)) ?? [{ ts: it.ts, text: it.text }];
      const lang = slackLang(msgs.map((m) => m.text ?? "").join(" "));
      // the whole thread, fenced: "before" is just past the last message
      const context = async (l: "en" | "zh") => threadContext(msgs, { before: "9999999999.999999", botUser: meta.bot_user, lang: l });
      await respond(it.response_url, ephemeral(lang === "zh" ? "收到，我会把这个话题整理成任务，并在话题中回复。" : "On it: I'll make this thread a task and answer in the thread."));
      await startAs(ws, bot, uid, { kind: "slack", channel: it.channel, thread_ts: it.thread_ts, user: it.user }, TASK_PROMPT[lang], lang, { context });
      return;
    }
    // a button: only the safe actions
    if (it.action === "open_app") return;   // a link button: Slack opens it, there's nothing to do here
    if (it.action === "ambient_no") { await respond(it.response_url, { delete_original: true }); return; }
    if (it.action === "ambient_task") {
      if (!it.channel || !it.thread_ts) return;
      const msgs = (await threadOf(bot.bot_token, it.channel, it.thread_ts)) ?? [];
      const lang = slackLang(msgs.map((m) => m.text ?? "").join(" "));
      await respond(it.response_url, { delete_original: true });
      await startAs(ws, bot, uid, { kind: "slack", channel: it.channel, thread_ts: it.thread_ts, user: it.user }, TASK_PROMPT[lang], lang,
        { context: async (l) => threadContext(msgs, { before: "9999999999.999999", botUser: meta.bot_user, lang: l }) });
      return;
    }
    const item = itemOf(it.value);
    if (!item) return;
    const days = it.action === "remind_1d" ? 1 : it.action === "remind_7d" ? 7 : null;
    const { data, error } = await admin.rpc("chat_item_action", { ws, p_user: uid, p_action: days ? "remind" : "assign_me", p_kind: item.kind, p_item: item.id, p_days: days });
    const d = (data ?? {}) as { title?: { en?: string; zh?: string }; remind_on?: string };
    // Slack doesn't say which language the person reads: both, as the bot's other notes do
    const said = (lang: "en" | "zh") => actionSaid({ action: it.action, title: d.title?.[lang] || d.title?.en, remind_on: d.remind_on, ...(error ? { error: (error.message ?? "").replace(/^.*?:\s/, "").slice(0, 120) || "try again" } : {}) }, lang);
    await respond(it.response_url, ephemeral(`${said("en")}\n${said("zh")}`));
  })());
  return okEmpty();
}

async function lark(req: Request, ws: string, body: string) {
  const bot = await botOf(ws, "lark_bot") as LarkBot | null;
  if (!bot) return json({ error: "unauthorized" }, 401);
  const e = await larkOpen(bot, { ts: req.headers.get("x-lark-request-timestamp"), nonce: req.headers.get("x-lark-request-nonce"), sig: req.headers.get("x-lark-signature") }, body);
  if (!e) return json({ error: "unauthorized" }, 401);
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  const header = (e.header ?? {}) as { event_id?: string; event_type?: string; tenant_key?: string };
  if (header.event_type !== "im.message.receive_v1" || !header.event_id || !(await firstTime("lark:" + header.event_id))) return json({});
  const ev = (e.event ?? {}) as { sender?: { sender_type?: string; tenant_key?: string; sender_id?: { open_id?: string } }; message?: { message_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: unknown[] } };
  const m = ev.message ?? {};
  if (ev.sender?.sender_type === "app" || m.message_type !== "text" || !m.message_id) return json({});
  // in a group, only when the bot is mentioned (Lark sends those to bots with the group permission); always in a direct chat
  if (m.chat_type === "group" && !(m.mentions ?? []).length) return json({});
  const text = larkText(m.content ?? "");
  if (!text) return json({});
  later(takeJob(ws, bot, { kind: "lark", message_id: m.message_id, group: m.chat_type !== "p2p" }, text, () => larkSender(bot, ev.sender, header.tenant_key)));
  return json({});
}

/* ------------------------------------------------------------------ Microsoft Teams */

/** A message to the workspace's Teams bot: checked and read (teamsHandle), then the sender looked up and the job started
 *  in the background, so Teams gets its answer at once. */
async function teams(req: Request, ws: string, body: string) {
  const bot = await botOf(ws, "teams_bot") as TeamsBot | null;
  if (!bot) return json({ error: "unauthorized" }, 401);
  const r = await teamsHandle(bot, req.headers.get("authorization"), body);
  if (r.status === 401) return json({ error: "unauthorized" }, 401);
  const job = r.job;
  if (!job || !(await firstTime(job.id))) return okEmpty();
  // a personal chat's file is a short-lived OneDrive link; an inline photo is read with the bot's own token
  const files: Files | undefined = job.files.length ? { chat: "Teams", list: job.files, read: async (f) => {
    const t = f as TeamsFile;
    const tok = t.bot ? await teamsToken(bot) : null;
    return t.bot && !tok ? null : await fetchBytes(t.url, tok ? { Authorization: `Bearer ${tok}` } : {});
  } } : undefined;
  later(takeJob(ws, bot, job.to, job.text, () => teamsSender(bot, job.to, job.from), { files }));
  return okEmpty();
}

/* ------------------------------------------------------------------ Telegram */

/** The workspace a Telegram webhook is for: /chat-events/telegram/<id>, the address Placetta sets on the bot. */
function telegramWs(url: URL): string | null {
  const id = /\/telegram\/([0-9a-f-]{36})\/?$/i.exec(url.pathname)?.[1];
  return id && UUID.test(id) ? id.toLowerCase() : null;
}

/** An update for the workspace's Telegram bot (tgHandle in telegram.ts has the steps). Quick answers go back in the
 *  webhook's own response; a teammate's job starts in the background and its answer comes as a reply. */
async function telegram(req: Request, ws: string, body: string) {
  const bot = await telegramBot(admin, ws);
  if (!bot) return json({ error: "unauthorized" }, 401);
  const r = await tgHandle(bot, req.headers.get("x-telegram-bot-api-secret-token"), body, {
    firstTime,
    claim: async (tgUser, code) => {
      const { data, error } = await admin.rpc("telegram_link_claim", { p_ws: ws, p_bot: bot.bot_id, p_tg_user: tgUser, p_code: code });
      if (error) console.error("telegram link", error.code ?? "");
      return (data as { result?: string } | null)?.result;
    },
    sender: (tgUser) => telegramSender(admin, ws, bot.bot_id, tgUser),
    // photos and PDFs: getFile, then the file, with the bot's own token
    start: (uid, to, text, lang, list) => later(startAs(ws, bot, uid, to, text, lang, list.length ? { files: { chat: "Telegram", list, read: (f) => tgDownload(bot, (f as TgFile).file_id, DOC_MAX) } } : {})),
    notTeammate: NOT_TEAMMATE,
  });
  return r.body ? new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json" } }) : new Response("", { status: r.status });
}

/* ------------------------------------------------------------------ WeChat */

/** The workspace a WeChat request is for: /chat-events/wechat/<id> (the address Settings gives), or ?wechat=<id>. */
function wechatWs(url: URL): string | null {
  const id = /\/wechat\/([0-9a-f-]{36})\/?$/i.exec(url.pathname)?.[1] ?? url.searchParams.get("wechat");
  return id && UUID.test(id) ? id.toLowerCase() : null;
}
const plain = (text: string, status = 200) => new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** WeChat's URL check, sent when the server address is saved in its console: echostr back when it's signed with this
 *  account's Token. */
async function wechatCheck(url: URL, ws: string) {
  const acct = await wechatAccount(admin, ws);
  const echo = acct ? await wxUrlCheck(acct.bot.token, url.searchParams) : null;
  return echo === null ? plain("", 401) : plain(echo);
}

/** Starts a WeChat member's job in the background; a refusal (no plan, too many jobs) goes back to them in WeChat. */
async function wechatJob(ws: string, bot: WechatBot, save: (b: WechatBot) => Promise<void>, uid: string, openid: string, prompt: string, lang: "en" | "zh") {
  const to: ChatTo = { kind: "wechat", openid };
  const why = await startChat(ws, uid, to, prompt, lang);
  if (why) await chatReply(bot, to, why, { save });
}

/** A message pushed to the workspace's WeChat account (wxHandle in wechat.ts has the steps), with the database and the
 *  agent behind it. */
async function wechat(url: URL, ws: string, body: string) {
  const acct = await wechatAccount(admin, ws);
  if (!acct) return plain("", 401);
  const { bot, save } = acct;
  const isPublic = textStartOn(env) && publicWechatWs(env) === ws;
  const r = await wxHandle(bot, url.searchParams, body, {
    firstTime,
    claim: async (openid, code) => {
      const { data, error } = await admin.rpc("wechat_link_claim", { p_ws: ws, p_appid: bot.app_id, p_openid: openid, p_code: code });
      if (error) console.error("wechat link", error.code ?? "");
      return (data as { result?: string } | null)?.result;
    },
    sender: (openid) => wechatSender(admin, ws, bot.app_id, openid),
    // the job starts after the answer has gone back (WeChat waits 5 seconds); its answer comes as a customer service message
    start: (uid, openid, text, lang) => later(wechatJob(ws, bot, save, uid, openid, text, lang)),
    notTeammate: NOT_TEAMMATE,
    // Placetta's own public account (ODELIA_PUBLIC_WECHAT_WS): a follower who isn't on the team can text to start, and
    // gets the plan as the passive reply, from the registry, with no model
    ...(isPublic ? {
      welcome: WX_SAY.startWelcome,
      stranger: async (openid: string, text: string) => (await startForStranger(admin, env, { channel: "wechat", handle: `wx:${openid}`, text })).reply,
    } : {}),
  });
  return new Response(r.body, { status: r.status, headers: { "Content-Type": r.type } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const ws = wechatWs(url);
    if (!ws) return json({ error: "Use POST." }, 405);
    try { return await wechatCheck(url, ws); } catch (e) { console.error("wechat check", String((e as Error)?.message ?? e).slice(0, 160)); return plain("", 400); }
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const body = await req.text();
  if (body.length > 200_000) return json({ error: "too large" }, 413);
  // ?probe=1 with the monitor key: each provider's real answer to a well-formed link or credentials it doesn't know, so a
  // change on their side shows up here before a customer finds it (nothing is posted anywhere)
  if (url.searchParams.get("probe")) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
    if (good !== true) return json({ error: "unauthorized" }, 401);
    const fake: Record<string, string> = {
      slack: "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
      lark: "https://open.feishu.cn/open-apis/bot/v2/hook/00000000-0000-0000-0000-000000000000",
      wecom: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=00000000-0000-0000-0000-000000000000",
      dingtalk: "https://oapi.dingtalk.com/robot/send?access_token=0000000000000000000000000000000000000000000000000000000000000000",
      teams: "https://prod-00.westus.logic.azure.com/workflows/00000000000000000000000000000000/triggers/manual/paths/invoke?api-version=2016-06-01&sig=x",
    };
    // the chat apps only: a webhook goes wherever the business points it, so there is no fixed service to probe
    const hooks = await Promise.all(HOOK_KINDS.filter((k) => k !== "webhook").map(async (k) => [k, await postHook(k, fake[k], "Placetta probe")] as const));
    const slackBot = await slackWho("xoxb-0000000000-0000000000000-000000000000000000000000");
    const larkBot = await larkWorks({ kind: "lark_bot", app_id: "cli_00000000000000", app_secret: "x".repeat(32), verification_token: "x", domain: "feishu" });
    // WeChat should call made-up credentials wrong ("credentials"); "ip" or "confirm" means its address rules changed
    const wx = await wxCredsWork("wx0000000000000000", "0".repeat(32));
    return json({ hooks: Object.fromEntries(hooks), slack_bot_accepts_fake: !!slackBot, lark_bot_accepts_fake: larkBot, wechat_accepts_fake: wx.ok, wechat_says: wx.ok ? null : wx.problem });
  }
  const s = url.searchParams.get("slack"), l = url.searchParams.get("lark"), t = url.searchParams.get("teams"), tg = telegramWs(url), wx = wechatWs(url);
  try {
    if (s && UUID.test(s)) return await slack(req, s, body);
    if (l && UUID.test(l)) return await lark(req, l, body);
    if (t && UUID.test(t)) return await teams(req, t.toLowerCase(), body);
    if (tg) return await telegram(req, tg, body);
    if (wx) return await wechat(url, wx, body);
  } catch (e) { console.error("chat event", String((e as Error)?.message ?? e).slice(0, 160)); return json({ error: "bad request" }, 400); }
  return json({ error: "not found" }, 404);
});
