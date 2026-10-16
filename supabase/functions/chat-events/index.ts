// chat-events: what a business's own Slack or Lark bot hears. POST ?slack=<workspace id> or ?lark=<workspace id>, set as
// the bot's event address when it's connected in Settings, Integrations. Each request is checked against that bot's own
// secret (Slack's signing secret; Lark's verification token, and its signature when an Encrypt Key is on). A mention in a
// channel, or a direct message, becomes a job for Odelia; she answers in the same thread. Slack and Lark both retry, so
// each event is taken once. The job runs as the owner who connected the bot, and anything to file, pay or send still
// waits for an approval in the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Bot, type ChatTo, chatReply, type LarkBot, larkDecrypt, larkSigned, larkText, larkWorks, type SlackBot, slackSigned, slackText, slackWho } from "../_shared/bots.ts";
import { HOOK_KINDS, postHook } from "../_shared/channels.ts";

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

/** The workspace's bot: its row (who connected it) and its credentials from the vault. */
async function botOf(ws: string, kind: "slack_bot" | "lark_bot"): Promise<{ bot: Bot; owner: string } | null> {
  const { data: row } = await admin.from("integrations").select("secret_id, status, connected_by").eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (!row?.secret_id || row.status !== "connected" || !row.connected_by) return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  try { const b = JSON.parse(String(raw ?? "")); return { bot: { ...b, kind } as Bot, owner: row.connected_by as string }; } catch { return null; }
}

/** An event id seen for the first time (Slack and Lark retry until they get a 200 in time). */
async function firstTime(id: string) {
  const { data } = await admin.from("chat_events").upsert({ id: id.slice(0, 200) }, { onConflict: "id", ignoreDuplicates: true }).select("id");
  return !!data?.length;
}

/** Keep working after the answer has gone back (Slack wants one within 3 seconds). */
// deno-lint-ignore no-explicit-any
const later = (p: Promise<unknown>) => { const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(p); };

const zh = (t: string) => /[一-鿿]/.test(t);

/** Hand the job to Odelia; if she can't start it, say why in the thread. */
async function startJob(ws: string, owner: string, bot: Bot, to: ChatTo, prompt: string) {
  const lang = zh(prompt) ? "zh" : "en";
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
    body: JSON.stringify({ action: "start_chat", workspace_id: ws, user_id: owner, channel: to.kind, chat_to: to, prompt: prompt.slice(0, 4000), lang }),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (res?.status === 202) return;
  const j = res ? await res.json().catch(() => ({})) as { error?: { message?: string } } : {};
  const why = j.error?.message ?? (lang === "zh" ? "暂时无法开始，请稍后再试。" : "I couldn't start that just now. Try again in a moment.");
  await chatReply(bot, to, why);
}

async function slack(req: Request, ws: string, body: string) {
  const b = await botOf(ws, "slack_bot");
  if (!b || !(await slackSigned((b.bot as SlackBot).signing_secret, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), body))) return json({ error: "unauthorized" }, 401);
  const e = JSON.parse(body) as { type?: string; challenge?: string; event_id?: string; event?: Record<string, string> };
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  if (req.headers.get("x-slack-retry-num")) return okEmpty();
  const ev = e.event ?? {};
  const mention = ev.type === "app_mention", dm = ev.type === "message" && ev.channel_type === "im" && !ev.subtype;
  if ((!mention && !dm) || ev.bot_id || !e.event_id || !(await firstTime("slack:" + e.event_id))) return okEmpty();
  const text = slackText(ev.text ?? "");
  if (!text) return okEmpty();
  const to: ChatTo = { kind: "slack", channel: ev.channel, thread_ts: ev.thread_ts ?? ev.ts };
  // answer Slack within its 3 seconds; the job starts in the background
  later(startJob(ws, b.owner, b.bot, to, text));
  return okEmpty();
}

async function lark(req: Request, ws: string, body: string) {
  const b = await botOf(ws, "lark_bot");
  if (!b) return json({ error: "unauthorized" }, 401);
  const bot = b.bot as LarkBot;
  let e = JSON.parse(body) as Record<string, unknown>;
  if (typeof e.encrypt === "string") {
    if (!bot.encrypt_key) return json({ error: "unauthorized" }, 401);
    // the URL check comes without a signature; every event after it carries one
    const sig = req.headers.get("x-lark-signature");
    if (sig && !(await larkSigned(bot.encrypt_key, req.headers.get("x-lark-request-timestamp"), req.headers.get("x-lark-request-nonce"), sig, body))) return json({ error: "unauthorized" }, 401);
    e = JSON.parse(await larkDecrypt(bot.encrypt_key, e.encrypt));
  }
  const header = (e.header ?? {}) as { token?: string; event_id?: string; event_type?: string };
  const token = String(e.token ?? header.token ?? "");
  if (!bot.verification_token || token !== bot.verification_token) return json({ error: "unauthorized" }, 401);
  if (e.type === "url_verification") return json({ challenge: e.challenge });
  if (header.event_type !== "im.message.receive_v1" || !header.event_id || !(await firstTime("lark:" + header.event_id))) return json({});
  const ev = (e.event ?? {}) as { sender?: { sender_type?: string }; message?: { message_id?: string; chat_type?: string; message_type?: string; content?: string; mentions?: unknown[] } };
  const m = ev.message ?? {};
  if (ev.sender?.sender_type === "app" || m.message_type !== "text" || !m.message_id) return json({});
  // in a group, only when the bot is mentioned (Lark sends those to bots with the group permission); always in a direct chat
  if (m.chat_type === "group" && !(m.mentions ?? []).length) return json({});
  const text = larkText(m.content ?? "");
  if (!text) return json({});
  later(startJob(ws, b.owner, bot, { kind: "lark", message_id: m.message_id }, text));
  return json({});
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = new URL(req.url);
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
    const hooks = await Promise.all(HOOK_KINDS.map(async (k) => [k, await postHook(k, fake[k], "Placetta probe")] as const));
    const slackBot = await slackWho("xoxb-0000000000-0000000000000-000000000000000000000000");
    const larkBot = await larkWorks({ kind: "lark_bot", app_id: "cli_00000000000000", app_secret: "x".repeat(32), verification_token: "x", domain: "feishu" });
    return json({ hooks: Object.fromEntries(hooks), slack_bot_accepts_fake: !!slackBot, lark_bot_accepts_fake: larkBot });
  }
  const s = url.searchParams.get("slack"), l = url.searchParams.get("lark");
  try {
    if (s && UUID.test(s)) return await slack(req, s, body);
    if (l && UUID.test(l)) return await lark(req, l, body);
  } catch (e) { console.error("chat event", String((e as Error)?.message ?? e).slice(0, 160)); return json({ error: "bad request" }, 400); }
  return json({ error: "not found" }, 404);
});
