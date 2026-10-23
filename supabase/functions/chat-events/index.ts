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
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { type Bot, type ChatSender, type ChatTo, chatReply, type LarkBot, larkOpen, larkSender, larkText, larkWorks, NEEDS_EMAIL_SCOPE, NOT_TEAMMATE, type SlackBot, slackSender, slackSigned, slackText, slackWho } from "../_shared/bots.ts";
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
async function botOf(ws: string, kind: "slack_bot" | "lark_bot"): Promise<Bot | null> {
  const { data: row } = await admin.from("integrations").select("secret_id, status").eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (!row?.secret_id || row.status !== "connected") return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  try { return { ...JSON.parse(String(raw ?? "")), kind } as Bot; } catch { return null; }
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

/** Works out who asked and, for a teammate, hands the job to Odelia as them; anyone else gets a note and no run. */
async function takeJob(ws: string, bot: Bot, to: ChatTo, prompt: string, who: () => Promise<ChatSender>) {
  const sender = await who().catch(() => ({ ok: false, why: "unknown" }) as ChatSender);
  const uid = sender.ok ? await teammate(ws, sender.email) : null;
  if (!uid) {
    if (!sender.ok) console.warn("chat sender refused", to.kind, sender.why);
    await chatReply(bot, to, !sender.ok && sender.why === "setup" ? NEEDS_EMAIL_SCOPE : NOT_TEAMMATE);
    return;
  }
  const why = await startChat(ws, uid, to, prompt, zh(prompt) ? "zh" : "en");
  if (why) await chatReply(bot, to, why);
}

async function slack(req: Request, ws: string, body: string) {
  const bot = await botOf(ws, "slack_bot") as SlackBot | null;
  if (!bot || !(await slackSigned(bot.signing_secret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body))) return json({ error: "unauthorized" }, 401);
  const e = JSON.parse(body) as { type?: string; challenge?: string; event_id?: string; team_id?: string; event?: Record<string, string> };
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  // Retries (x-slack-retry-num) come through like any event; the event id makes sure each is taken only once.
  const ev = e.event ?? {};
  const mention = ev.type === "app_mention", dm = ev.type === "message" && ev.channel_type === "im" && !ev.subtype;
  if ((!mention && !dm) || ev.bot_id || !e.event_id || !(await firstTime("slack:" + e.event_id))) return okEmpty();
  const text = slackText(ev.text ?? "");
  if (!text) return okEmpty();
  const to: ChatTo = { kind: "slack", channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts };
  // answer Slack within its 3 seconds; looking up the sender and starting the job happen in the background
  later(takeJob(ws, bot, to, text, () => slackSender(bot, ev, e.team_id)));
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
  later(takeJob(ws, bot, { kind: "lark", message_id: m.message_id }, text, () => larkSender(bot, ev.sender, header.tenant_key)));
  return json({});
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
  const s = url.searchParams.get("slack"), l = url.searchParams.get("lark"), wx = wechatWs(url);
  try {
    if (s && UUID.test(s)) return await slack(req, s, body);
    if (l && UUID.test(l)) return await lark(req, l, body);
    if (wx) return await wechat(url, wx, body);
  } catch (e) { console.error("chat event", String((e as Error)?.message ?? e).slice(0, 160)); return json({ error: "bad request" }, 400); }
  return json({ error: "not found" }, 404);
});
