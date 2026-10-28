// agent-run: the agent working on the server, so a task carries on after the person closes the app.
// It runs the same tools and instructions as the app (agent.js, built from src/ by `npm run build:agent`), with the
// company's Claude key and research on official sites. Work is saved after every round: the workspace (merged with
// anything the person changed meanwhile), the audit trail, and the run's conversation. A run that nears the time limit
// is saved and picked up again by a fresh instance; a watchdog resumes runs whose instance died.
//
// One instance works a run at a time. heartbeat_at is the run's lease: whoever works the run sets it to a value only
// it knows and every write it makes is conditional on that value still being there, so a duplicated "continue" or the
// watchdog can't work the same run alongside it, and a worker that lost its lease stops without a word. A hand-over
// passes the new value along as a ticket; the watchdog takes only runs whose holder went quiet for STALE_MS.
//
// POST {action: "start", workspace_id, prompt, history?, lang?, deep?}         a member (Supabase session)
// POST {action: "continue", run_id, token?, ticket?} | {action: "watchdog"} | {action: "watch", workspace_id}   the server itself (monitor key)
// POST {action: "settle", workspace_id}   the monitor key: no model; the filings' record onto the workspace, each job
//                                          against its proof, renewals and done reports (src/finish.ts)
// POST {action: "selftest"}   the monitor key: short real-model runs on in-memory scratch workspaces (selftest.ts);
//                             returns {ok, model, checks: [{name, pass, detail, ms}], total_ms} in under 140 s
// POST {action: "start_as", user_id, workspace_id, prompt, channel: "sms"|"voice"|"email", reply_to, plain_sms?, history?, lang?}
//      odelia-sms, odelia-voice and odelia-mail (monitor key), for a person who texted or called from their verified
//      number, or emailed from their sign-in address. The same member and plan checks as "start"; the answer goes back
//      the same way when the run finishes. A run from plain SMS only reads and drafts (src/serverRun.ts).
// POST {action: "start_chat", user_id, workspace_id, prompt, channel: "slack"|"lark"|"wechat"|"teams"|"telegram", chat_to, lang?}
//      chat-events (monitor key), for the Placetta teammate who asked in the business's Slack, Lark or Teams, or who
//      linked their WeChat or Telegram to the business's own account or bot. At most CHAT_JOBS_PER_HOUR a person a chat.
// A run from outside the app starts with the same person's recent requests and answers from the other channels
// (_shared/continuity.ts), so Odelia remembers wherever they write.
// Every run from outside the app carries its channel, and can't remove deadlines, set up routines, save memory or
// skills, or change stores; a business fact or the business's name goes up as a change card (with who asked) for an
// owner to confirm; anything it prepares still needs an approval in the app.
// Store bots (family.ts): a run in the app may split a request across stores (split_job). Each store's part is a run
// of its own (parent_run, job_id, store_id), started side by side up to ODELIA_PARALLEL at once, the rest 'queued';
// the run that split them goes 'waiting' with its answer so far, and is woken (back to 'running', by ticket) when the
// last of them finishes, to write one summary. A finishing run starts the next queued one; so does the watchdog.
// Every run keeps its moments on steps (src/replay.ts): the job's replay in the app.
// The app polls a run with the poll_agent_run RPC and stops one with stop_agent_run. When nobody is watching as it
// finishes, the result becomes an Update and the owners get an email (with RESEND_API_KEY and MAIL_FROM set).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { callModel, canConverse, type Role } from "../_shared/llm.ts";
import { accessRpc, WORKS } from "../_shared/access.ts";
import { CHAT_JOBS_PER_HOUR, chatRateLimited, chatToOk, NOT_CHARGED_EN, overTaskLimit, refundable, repeatKey, repeatStatuses, REPEAT_MS, sharedThread, taskLimit, tokenLimit, tooLarge } from "./limits.ts";
import { gate, record, saverLine, saverNoticeDue } from "../_shared/ai_gate.ts";
import { appLink, appOrigin, normalizePhone, SAY, splitSms } from "../_shared/odelia.ts";
import { linkOf, logMessage, mayUseAgent, textUser } from "../_shared/odelia_db.ts";
import { mailBody, replySubject, sendMail as sendOdeliaMail } from "../_shared/mail.ts";
// @ts-types="./agent.d.ts"
import { agencyKey, chipsOf, CLASSIFIER_SYSTEM, classifierPrompt, parseClassifier, type ToolLog, DISTILL_SYSTEM, distillPrompt, filingEvidence, type FilingRow, finishWork, keepRecall, type Lesson, lessonKeys, lessonsBrief, type MemoryBook, normalizeState, parseDistill, rank, type Recall, recallFrom, runEvidence, runRounds, startState, stampFilings, stripState, worthLearning, type Reply, type RunState, type Services, type Step } from "./agent.js";
import { mayEmail, wantsTexts } from "../_shared/reach.ts";
import { selftest, SELFTEST_NAMES } from "./selftest.ts";
import { type Bot, CHAT_KINDS, type ChatTo, chatReply, isChatKind, type SlackBot } from "../_shared/bots.ts";
import { answerBlocks, type ItemRef, slackEphemeral, slackPostBlocks } from "../_shared/slack.ts";
import { wechatAccount, wechatSender } from "../_shared/wechat_db.ts";
import { telegramBot, telegramSender } from "../_shared/telegram_db.ts";
import { teamsServiceOk } from "../_shared/teams.ts";
import { recentTurns } from "../_shared/continuity.ts";
import { claim, type Lease, type RunsTable, saveOnto, stamp } from "./lease.ts";
import { deliverNotice } from "../_shared/business_rules.ts";
import { filledLines, formAttachments, linkForms, type FilledForm } from "../_shared/form_links.ts";
import type { Attachment } from "../_shared/mail.ts";
import { type FamilyDb, fill, spawn, stillOpen, wake } from "./family.ts";
import { pusher } from "./push.ts";
import { actorOf } from "./actor.ts";
import { secretValues, withoutEnv } from "../_shared/secrets.ts";
// Agent memory (src/odeliaMemory/): read before a run, saved after it
// @ts-types="./agent.d.ts"
import { loadMemory, saveRun, type RunMemory } from "./agent.js";
import { autofileAll, type AutofileIO } from "./agent.js";
import { gradeRun, GRADER_SAMPLE_RATE, sampled } from "./agent.js";
import { memoryDb, pastRuns } from "./memory.ts";

type Workspace = ReturnType<typeof normalizeState>;
type Patch = (w: Workspace) => Workspace;
type Block = Record<string, unknown>;
type Run = { id: string; workspace_id: string; created_by: string | null; kind: "task" | "watch"; title?: { en: string; zh: string } | null; prompt: string; lang: "en" | "zh"; deep: boolean; status: string; steps: Step[]; state: RunState | null; attempts: number; seen_at: string | null; heartbeat_at: string; channel?: "app" | "sms" | "voice" | "slack" | "lark" | "wechat" | "teams" | "telegram" | "email"; reply_to?: string | null; chat_to?: ChatTo | null;
  /** A store's bot: the run that split the work, the store's job and the store. */
  parent_run?: string | null; job_id?: string | null; store_id?: string | null;
  /** "Don't remember this chat": no memory read beyond the records and briefs, none saved. */
  no_memory?: boolean };
/** The channels a chat bot answers in: Slack, Lark, WeChat, Teams and Telegram. */
const CHATS = new Set(Object.keys(CHAT_KINDS));

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
/** One task's ceiling: a task that costs more than this stops and says so, so a loop can't eat a month's budget.
 *  (limits.ts: a broken AI_TASK_LIMIT_USD used to make it NaN, which switched the cap off.) */
const TASK_LIMIT_USD = taskLimit((k) => Deno.env.get(k));
// and its tokens, across every chunk (src/serverRun.ts TOKEN_CAP; AI_TASK_TOKEN_LIMIT changes it)
const TASK_TOKENS = tokenLimit((k) => Deno.env.get(k));
const MODEL = env("AGENT_MODEL", "claude-sonnet-5-5"), MODEL_DEEP = env("AGENT_MODEL_DEEP", "claude-opus-5-5");
/** In saver mode (past 60% of the allowance, or throttled for the day) answers are capped at this many tokens. */
const SAVER_MAX_TOKENS = 2000;
/** Work per instance before saving and handing over (the free plan stops an instance at 150 s). */
const CHUNK_MS = Number(env("AGENT_CHUNK_SECONDS", "70")) * 1000;
const STALE_MS = 3 * 60_000, MAX_ATTEMPTS = 8;
/** How often a streaming answer's draft is saved for the app to show. */
const DRAFT_MS = 300;
/** How often a working instance renews its lease even when it has nothing else to save (a long model call). */
const RENEW_MS = 30_000;
/** Tries to save the agent's changes onto a workspace that others keep changing, before the save fails. */
const SAVE_TRIES = 8;
const FETCH_BETA = "web-fetch-2025-09-10";
/** Placetta's own tools fit under it with room to spare (49 since appeal_case, 2026-10-23); scripts/agent-test.ts
 *  fails before a new tool would be dropped silently. */
const MAX_TOOLS = 52;
/** Some vendor with a key may take a customer's conversation (../_shared/llm.ts). The old list of key names left out
 *  Cerebras, and counted a Gemini key without GEMINI_PAID, which may never see a conversation, so runs started and
 *  every call failed. */
const configured = () => canConverse((k) => Deno.env.get(k));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const err = (code: string, message: string) => Object.assign(new Error(message), { code });
const bg = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt) rt.waitUntil(p); else void p; };

/* ------------------------------ who's asking ------------------------------ */

async function monitorKeyOk(req: Request) {
  const { data } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
  return data === true;
}
let selfKey: string | null = null;
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}
/** Hand the run to a fresh instance, with the ticket (the lease value) the outgoing instance left on it. */
async function handOver(runId: string, token: string | null, ticket: string | null) {
  await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
    body: JSON.stringify({ action: "continue", run_id: runId, ...(token ? { token } : {}), ...(ticket ? { ticket } : {}) }),
  }).catch((e) => console.error("hand over", String(e).slice(0, 120)));
}

/** agent_runs for the lease (lease.ts): reads, and updates that only apply while their conditions hold. */
const runsTable: RunsTable<Run> = {
  async read(id) { const { data } = await admin.from("agent_runs").select("*").eq("id", id).maybeSingle(); return data as Run | null; },
  async update(id, fields, where) {
    let q = admin.from("agent_runs").update(fields).eq("id", id);
    if (where.heartbeat_at) q = q.eq("heartbeat_at", where.heartbeat_at);
    if (where.heartbeat_before) q = q.lt("heartbeat_at", where.heartbeat_before);
    if (where.status) q = q.eq("status", where.status);
    const { data, error } = await q.select("id");
    if (error) { console.error("run update", id, error.code); return null; }
    return data?.length ?? 0;
  },
};

/* ------------------------------ the model ------------------------------ */


/** One task's tally across its model calls: who asked, what it has cost, and whether saver mode was on (and why). */
type Who = { uid: string | null; spent: number; reduced?: "allowance" | "throttle"; renews?: string | null; events?: number[] };

/**
 * One model call: the company keys, the role's route (../_shared/llm.ts), research on official sites, the gate and the
 * price. In saver mode (the workspace is past 60% of its allowance, or throttled for the day) the main loop runs on the
 * draft route instead of plan, research is off and answers are shorter; at 100% the gate stops the call.
 */
async function model(ws: string, body: Record<string, unknown>, deep: boolean, location: { city?: string; region?: string } | undefined, signal: AbortSignal, role: Role = "plan", who: Who = { uid: null, spent: 0 }, onText?: (text: string) => void) {
  if (signal.aborted) throw err("cancelled", "Stopped");
  if (!configured()) {
    console.error("not configured: add a model key in the Edge Function secrets");
    throw err("not_configured", "The agent isn't set up on the server yet. Placetta's team has been told.");
  }
  if (overTaskLimit(who.spent, TASK_LIMIT_USD)) throw err("task_limit", "This task grew too large for one go, so I stopped here. Ask for the next part on its own.");
  // budget, rate limits and the company's ceiling
  // a call after this task's first one is mid-task: never stopped part way for the allowance (saver mode instead)
  const g = await gate(admin, (k) => Deno.env.get(k), ws, who.uid, "call", { midTask: (who.events?.length ?? 0) > 0 });
  if (!g.ok) throw err(g.code, g.message);
  // kept with the run, so a run that fails on our side or the vendor's gives these calls back (refundFailed)
  if (who.events && who.events.length < 500) who.events.push(g.event);
  // Odelia has about 31 tools in a signed-in workspace; a cap of 24 silently dropped email, calendar, drive and QuickBooks.
  const pageTools = (Array.isArray(body.tools) ? (body.tools as Block[]) : []).filter((t) => t && typeof t.name === "string" && !("type" in t)).slice(0, MAX_TOOLS);
  let maxTokens = Math.min(Math.max(Number(body.max_tokens) || 2000, 256), 4000);
  if (deep && role === "plan") role = "deep";
  let research = pageTools.length > 0 || role === "deep";
  if (g.tier === "reduced") {
    who.reduced = g.reason ?? "allowance"; who.renews = g.period_end;
    if (role === "deep" || role === "plan") role = "draft";
    research = false;
    maxTokens = Math.min(maxTokens, SAVER_MAX_TOKENS);
  }
  const userLocation = location?.city ? { type: "approximate", city: String(location.city).slice(0, 80), region: String(location.region ?? "").slice(0, 80) || undefined, country: "US" } : undefined;
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 5, ...(userLocation ? { user_location: userLocation } : {}) };
  const fetchTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, citations: { enabled: true }, max_content_tokens: 24000 };
  const anthropicModel = role === "deep" ? MODEL_DEEP : MODEL;
  const payload: Record<string, unknown> = { model: anthropicModel, max_tokens: maxTokens, messages: body.messages };
  if (typeof body.system === "string" && body.system) payload.system = body.system.slice(0, 80000);
  // prompt caching (src/odeliaMemory/cache.ts): where the stable segments end, and their fingerprint (../_shared/llm.ts)
  if (Array.isArray(body.cache_breaks)) payload.cache_breaks = (body.cache_breaks as unknown[]).filter((b) => typeof b === "number").slice(0, 2);
  if (typeof body.cache_key === "string") payload.cache_key = body.cache_key.slice(0, 64);
  // The instructions were written with research on; in saver mode the model is told it's off, so it doesn't reach for web_search.
  if (g.tier === "reduced" && pageTools.length && typeof payload.system === "string") payload.system += "\n\nWeb research (web_search, web_fetch) is off for now. Work from the workspace and your other tools, keep the answer short, and say plainly when something would need checking on the agency's own site.";
  const tools = [...pageTools, ...(research ? [search, fetchTool] : [])];
  if (tools.length) payload.tools = tools;
  // none of the server's own secrets ever goes to a model vendor, whatever put it in the conversation (_shared/secrets.ts)
  const cutSecrets = withoutEnv(payload, serverSecrets());
  if (cutSecrets.cut) { console.error("model call: cut", cutSecrets.cut, "server secret value(s) from the request"); Object.assign(payload, cutSecrets.body); }
  // onText: the answer streams (the main loop's rounds), so the run's draft shows the words as they're written
  const out = await callModel((k) => Deno.env.get(k), { payload, role, research, beta: research ? FETCH_BETA : null }, anthropicModel,
    research ? { search, fetch: fetchTool, pageTools } : null, fetch, onText);
  if (!out.ok) {
    console.error("models", out.model, out.status, out.text.slice(0, 300));
    throw out.status === 429 || out.status === 529 ? err("rate_limited", "The agent is busy. Try again in a moment.") : err(out.status === 401 || out.status === 503 ? "not_configured" : "upstream_error", "Couldn't reach the agent's model. Try again.");
  }
  const data = out.data as { content: Block[]; stop_reason: string; usage?: Record<string, never> };
  const usd = await record(admin, g.event, out.model, data.usage, role);
  who.spent += usd;
  // the model and price ride along for the run's trace (src/trace.ts)
  return { ...data, model: out.model, usd } as unknown as { content: never[]; stop_reason: string };
}

/** Gives a failed run's model calls back to the allowance (and any pack credit to the pack). Never throws. */
async function refundFailed(ws: string, events: number[]): Promise<boolean> {
  const { data, error } = await admin.rpc("ai_refund_events", { p_ws: ws, p_events: events });
  if (error) { console.error("ai_refund_events", error.message); return false; }
  return Number((data as { events?: number } | null)?.events ?? 0) > 0;
}

/** The function's own secret values (any env var named like a key, secret, token or password), read once. */
let SECRETS: string[] | null = null;
const serverSecrets = () => (SECRETS ??= (() => { try { return secretValues(Deno.env.toObject()); } catch { return []; } })());

/** The main loop's role for a run: watch for the monitor's background checks, short for a text, a call or a chat bot, plan otherwise. */
const roleOfRun = (run: Run): Role => run.kind === "watch" ? "watch" : run.channel === "sms" || run.channel === "voice" || CHATS.has(run.channel ?? "") ? "short" : "plan";

/**
 * The run to hand back instead of starting another: the same key in this workspace within REPEAT_MS, still running
 * (any channel) or done (the app, which shows its reply). A text or a call is answered by the run that finishes, so a
 * repeat there only joins a run still going.
 */
async function repeated(ws: string, key: string, channel: string): Promise<string | null> {
  const { data } = await admin.from("agent_runs").select("id, status").eq("workspace_id", ws).eq("dedupe", key).gt("created_at", new Date(Date.now() - REPEAT_MS).toISOString())
    .in("status", repeatStatuses(channel)).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/* ------------------------------ the account's hands ------------------------------ */

const safeName = (n: string) => n.replace(/[^\w.\-一-鿿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";

/** Who asked from outside the app, as a change card shows it: the number they texted or called from, the address they
 *  emailed from, or for Slack, Lark and WeChat the member's sign-in email (chat-events matched the sender to them: by
 *  email in Slack and Lark, by the WeChat they linked with a code). Nothing for
 *  the app and background checks. */
async function senderOf(run: Run): Promise<string | undefined> {
  if (!run.channel || run.channel === "app") return undefined;
  if (run.reply_to) return run.reply_to;
  if (!run.created_by) return undefined;
  try { return (await admin.auth.admin.getUserById(run.created_by)).data?.user?.email ?? undefined; } catch { return undefined; }
}

/** What a run and "settle" read of the filings: status, proof (confirmation, receipt, the decision) and how it went. */
const FILING_COLS = "app_id, status, confirmation_number, receipt_path, submitted_at, decided_at, updated_at, note, payment_url, customer_paid_at, agent_state, channel, agent_log";

/** settle: the filings' record onto the workspace, every job against its proof, renewals for what the agencies approved,
 *  and a report on each job just finished (src/finish.ts). No model call. Saved onto the newest state like a run's work
 *  (never over anyone's save); nothing is written when nothing changed. The monitor calls it each morning. */
async function settle(ws: string): Promise<{ changed: boolean; finished: number; renewals: number }> {
  const { data: filings, error } = await admin.from("filings").select(FILING_COLS).eq("workspace_id", ws).order("approved_at", { ascending: false });
  if (error) throw err("upstream_error", "Couldn't read the filings.");
  const rows = (filings ?? []) as FilingRow[];
  const read = async () => {
    const { data: fresh, error: e } = await admin.from("workspaces").select("name, state, updated_at").eq("id", ws).maybeSingle();
    if (e) throw err("save_failed", "Couldn't read the workspace: " + e.code);
    return fresh?.updated_at ? { w: normalizeState(String(fresh.name ?? ""), fresh.state ?? {}), version: String(fresh.updated_at) } : null;
  };
  const first = await read();
  if (!first) return { changed: false, finished: 0, renewals: 0 };
  const change = (w: Workspace) => finishWork(stampFilings(w, rows));
  if (change(first.w) === first.w) return { changed: false, finished: 0, renewals: 0 };
  type J = { id: string; status: string };
  const doneBefore = new Set(((first.w.jobs ?? []) as J[]).filter((j) => j.status === "done").map((j) => j.id));
  const deadlinesBefore = ((first.w.deadlines ?? []) as unknown[]).length;
  const w = await saveOnto<Workspace>({
    tries: SAVE_TRIES, read,
    async write(next, version) {
      const { data: saved, error: e } = await admin.from("workspaces").update({ state: stripState(next), updated_at: new Date().toISOString() }).eq("id", ws).eq("updated_at", version).select("id");
      if (e) throw err("save_failed", "save failed: " + e.code);
      return !!saved?.length;
    },
  }, change);
  // the agent's own audit lines (a renewal put on Deadlines), as a run's are
  const audit = w.audit.filter((a) => a.actor === "agent").map((a) => ({ workspace_id: ws, client_id: a.id, actor: a.actor, actor_id: null, action: a.action, object: a.object, detail: a.detail ?? null }));
  if (audit.length) await admin.from("audit_log").upsert(audit, { onConflict: "workspace_id,client_id", ignoreDuplicates: true });
  return { changed: true, finished: ((w.jobs ?? []) as J[]).filter((j) => j.status === "done" && !doneBefore.has(j.id)).length, renewals: Math.max(0, ((w.deadlines ?? []) as unknown[]).length - deadlinesBefore) };
}

async function servicesFor(ws: string, run: Run, token: string | null): Promise<Services> {
  const { data: filings } = await admin.from("filings").select(FILING_COLS).eq("workspace_id", ws).order("approved_at", { ascending: false });
  // Connected apps act as the person, so they need the person's session: runs the monitor starts don't touch them.
  const { data: ints } = token ? await admin.from("integrations").select("kind, status").eq("workspace_id", ws) : { data: [] as { kind: string; status: string }[] };
  // A request that came by text, call, email or chat has no session, but may read from the apps connected through their
  // own MCP servers, as the member who asked: the integrations function checks it with the monitor key, offers only the
  // tools that read, and refuses plain SMS (integrations/mcp.ts mcpRemote).
  const remote = !token && !!run.created_by && !!run.channel && run.channel !== "app";
  const viaMonitor = async <T>(body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("SUPABASE_ANON_KEY")}`, apikey: env("SUPABASE_ANON_KEY"), "x-monitor-key": await monitorKey() },
      body: JSON.stringify({ ...body, workspace_id: ws, user_id: run.created_by, channel: run.channel, plain_sms: run.state?.plainSms === true }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out?.error?.message ?? `That didn't work (${res.status}).`);
    return out as T;
  };
  return {
    filings: () => (filings ?? []) as ReturnType<Services["filings"]>,
    connected: () => (ints ?? []).filter((i) => i.status === "connected").map((i) => i.kind),
    async mcpTools() {
      type Listed = { tools: Record<string, unknown>[] };
      if (!token) return remote ? (await viaMonitor<Listed>({ action: "mcp_tools" })).tools : [];
      const res = await fetch(`${SUPABASE_URL}/functions/v1/integrations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY") }, body: JSON.stringify({ workspace_id: ws, action: "mcp_tools" }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error?.message ?? `That didn't work (${res.status}).`);
      return (out as Listed).tools ?? [];
    },
    async integration<T>(action: string, body: Record<string, unknown>) {
      if (!token && remote && action === "mcp_call") return await viaMonitor<T>({ ...body, action });
      if (!token) throw new Error("Connected apps aren't available to background checks.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/integrations`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: env("SUPABASE_ANON_KEY") }, body: JSON.stringify({ workspace_id: ws, action, ...body }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out?.error?.message ?? `That didn't work (${res.status}).`);
      return out as T;
    },
    async saveFile(file: File, appId?: string) {
      const path = `${ws}/${crypto.randomUUID()}/${safeName(file.name)}`;
      const up = await admin.storage.from("documents").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (up.error) throw new Error("Couldn't store the file.");
      const { error } = await admin.from("documents").insert({ workspace_id: ws, app_id: appId ?? null, name: file.name.slice(0, 200), path, size: file.size, mime: file.type || null, source: "agent", uploaded_by: run.created_by });
      if (error) { await admin.storage.from("documents").remove([path]); throw new Error("Couldn't record the file."); }
      return { path };
    },
    network: (keys: string[]) => lessonsFor(keys),
    // ask_specialist (src/escalate.ts): a review in the team's queue, marked as Odelia's, with the job that waits on it.
    // The database keeps it to one open per application and 3 a day per workspace (migration 20261102090000).
    async specialist(o) {
      const { data, error } = await admin.rpc("agent_request_specialist_review", { ws, p_app_id: o.app.slice(0, 120), p_title: o.title, p_note: o.note.slice(0, 500), p_reason: o.reason, p_job: o.job ?? null });
      if (error) throw new Error(/rate_limited/.test(error.message ?? "") ? "Odelia already asked a specialist 3 times today for this business. Tell the owner plainly what's unsure instead." : "Couldn't reach Placetta's specialists. Tell the owner what's unsure.");
      const r = (data ?? {}) as { due_at?: string; open?: boolean };
      return { due_at: String(r.due_at ?? new Date(Date.now() + 864e5).toISOString()), ...(r.open ? { open: true } : {}) };
    },
    // The agencies' PDFs for filling a form here (src/forms/fill.ts): the two kept with the code are inside agent.js; the
    // rest are the site's own copies under /app/forms/, or the "forms" storage bucket when the site can't be reached.
    formPdf: (file: string) => sitePdf(file),
    async readFile(path: string) {
      if (!path.startsWith(ws + "/")) throw new Error("That file belongs to another workspace.");
      const { data, error } = await admin.storage.from("documents").download(path);
      if (error || !data) throw new Error("Couldn't open the file.");
      return data;
    },
    // Team review (migration 20261018120000_team_review): this workspace's comments, which read_comments hands Odelia
    // as data through the planted-instruction check. Headquarters' comments say "Headquarters", never its staff.
    async comments(item?: { kind: "app" | "doc" | "job"; id: string }) {
      let q = admin.from("comments").select("id, item_kind, item_id, author_email, from_hq, body, created_at, resolved_at").eq("workspace_id", ws).order("created_at", { ascending: true }).limit(300);
      if (item) q = q.eq("item_kind", item.kind).eq("item_id", item.id);
      const { data, error } = await q;
      if (error) { if (error.code === "42P01" || error.code === "PGRST205") return []; throw new Error("Couldn't read the comments."); }
      return (data ?? []).map((c) => ({ id: String(c.id), item: { kind: c.item_kind as "app" | "doc" | "job", id: String(c.item_id) }, by: c.from_hq ? "Headquarters" : String(c.author_email || "A teammate"),
        hq: !!c.from_hq, text: String(c.body ?? ""), at: String(c.created_at), resolved: !!c.resolved_at }));
    },
  };
}

/** What Autopilot's filing needs from the server (src/autopilotFile.ts): the agencies' PDFs, the adopted signature from
 *  the vault, Documents, the database's own check (autopilot_file), and the dispatcher started with the monitor key. */
function autopilotIO(ws: string, svc: Services): AutofileIO {
  return {
    loadPdf: (file: string) => sitePdf(file),
    async signature(grant: string) {
      const { data } = await admin.rpc("autopilot_signature", { p_grant: grant });
      return typeof data === "string" ? data : null;
    },
    async upload(appId: string, name: string, bytes: Uint8Array) {
      return (await svc.saveFile(new File([bytes as BlobPart], name, { type: "application/pdf" }), appId)).path;
    },
    async file(r) {
      const { data, error } = await admin.rpc("autopilot_file", { p_ws: ws, p_grant: r.grant, p_app_id: r.app_id, p_title: r.title, p_agency: r.agency, p_portal_url: r.portal_url,
        p_fee: r.fee, p_payload: r.payload, p_store: r.store, p_form: r.form });
      if (error || typeof data !== "string") throw new Error(error?.message ?? "autopilot_scope: refused");
      return data;
    },
    async start(id: string) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/file`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env("SUPABASE_ANON_KEY")}`, apikey: env("SUPABASE_ANON_KEY"), "x-monitor-key": await monitorKey() },
        body: JSON.stringify({ action: "autopilot_start", workspace_id: ws, filing_id: id }),
      });
      if (!res.ok) console.error("autopilot start", ws, res.status);
    },
  };
}

/** The agencies' PDFs this instance already fetched, by file name (they're the same for everyone). */
const PDFS = new Map<string, Uint8Array>();
async function sitePdf(file: string): Promise<Uint8Array | null> {
  // the two the app keeps with its code (src/forms/pdf: the SS-4 and CBP 5106) are on the site as /app/forms/<name>.pdf
  // too; the server fetches them like the rest rather than carrying them in its bundle (the 5 MB deploy limit)
  if (file.startsWith("pdf/")) file = file.slice(4);
  if (!/^[\w.-]+\.pdf$/.test(file)) return null;
  const had = PDFS.get(file);
  if (had) return had;
  let bytes: Uint8Array | null = null;
  const origin = appOrigin(env);
  if (origin) {
    const res = await fetch(`${origin}/app/forms/${file}`, { signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (res?.ok) bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (!bytes || !isPdf(bytes)) {
    const { data } = await admin.storage.from("forms").download(file).catch(() => ({ data: null }));
    if (data) bytes = new Uint8Array(await data.arrayBuffer());
  }
  if (bytes && isPdf(bytes)) { PDFS.set(file, bytes); return bytes; }
  return null;
}
const isPdf = (b: Uint8Array) => b.length > 8 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/* ------------------------------ the network ------------------------------ */
// Every business makes Odelia better for every other one (src/learning.ts). After a run: its jobs' first independent
// checks go on the learning curve, the lessons it started from earn a win or a loss, and a distiller turns what it
// found into anonymized lessons (or confirms and contradicts existing ones). Agency decisions on filings are learned
// from too, every 15 minutes. A workspace that turns sharing off still reads lessons but never adds to them.

type LessonRow = { id: string; kind: Lesson["kind"]; key: string; text_en: string; text_zh: string; source_url: string | null; businesses: number; confirms: number; contradicts: number; wins: number; losses: number };
const LESSON_COLS = "id, kind, key, text_en, text_zh, source_url, businesses, confirms, contradicts, wins, losses";
const toLesson = (r: LessonRow): Lesson => ({ id: r.id, kind: r.kind, key: r.key, text: { en: r.text_en, zh: r.text_zh }, source_url: r.source_url, businesses: r.businesses, confirms: r.confirms, contradicts: r.contradicts, wins: r.wins, losses: r.losses });
async function lessonsFor(keys: string[], status: string[] = ["live"]): Promise<Lesson[]> {
  if (!keys.length) return [];
  const { data } = await admin.from("odelia_lessons").select(LESSON_COLS).in("key", keys.slice(0, 80)).in("status", status).order("updated_at", { ascending: false }).limit(80);
  return ((data ?? []) as LessonRow[]).map(toLesson);
}
const sharesLearning = (w: Workspace) => (w as { shareLearning?: boolean }).shareLearning !== false;

/** Ask the distiller about one piece of evidence and record its answer as votes and new lessons. */
async function distill(ws: string, w: Workspace, evidence: unknown, keys: string[], who: { uid: string | null; spent: number }) {
  if (!keys.length) return { confirm: 0, contradict: 0, added: 0 };
  const existing = (await lessonsFor(keys, ["live", "candidate"])).slice(0, 40);
  // the draft route: short bilingual lessons from evidence, no tools, no research
  const data = await model(ws, { system: DISTILL_SYSTEM, messages: [{ role: "user", content: distillPrompt(evidence, existing, keys) }], max_tokens: 1400 }, false, undefined, new AbortController().signal, "draft", who) as unknown as { content: Block[] };
  const text = data.content.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join("");
  const d = parseDistill(text, { keys, existing: existing.map((l) => l.id), w });
  for (const id of d.confirm) await admin.rpc("lesson_vote", { p_lesson: id, p_ws: ws, p_vote: 1 });
  for (const id of d.contradict) await admin.rpc("lesson_vote", { p_lesson: id, p_ws: ws, p_vote: -1 });
  for (const n of d.fresh) await admin.rpc("lesson_add", { p_ws: ws, p_kind: n.kind, p_key: n.key, p_en: n.text.en, p_zh: n.text.zh, p_url: n.source_url ?? null, p_official: n.official });
  return { confirm: d.confirm.length, contradict: d.contradict.length, added: d.fresh.length };
}

/** The online grader (src/qa/grade.ts): a sampled share of finished runs is graded with plain checks, no model, and
 *  what it finds goes to the staff triage queue (qa_report). Never changes the run or what the person sees. */
export async function gradeOnline(run: Run, w: Workspace, st: RunState, reply: Reply) {
  try {
    if (!sampled(run.id, GRADER_SAMPLE_RATE)) return;
    const msgs = (st.messages ?? []) as { role: string; content: unknown }[];
    const names = new Map<string, string>(), calls: { name: string; ok: boolean }[] = [], apps = new Set<string>();
    for (const m of msgs) for (const b of (Array.isArray(m.content) ? m.content : []) as Record<string, unknown>[]) {
      if (b.type === "tool_use") names.set(String(b.id), String(b.name));
      if (b.type === "tool_result") {
        calls.push({ name: names.get(String(b.tool_use_id)) ?? "?", ok: !b.is_error });
        for (const id of String(b.content ?? "").match(/"application_id":"([^"]{1,80})"/g) ?? []) apps.add(id.slice(18, -1));
      }
    }
    const found = gradeRun({ runId: run.id, reply: reply.text.map((t) => t.en).join("\n"), calls, ws: w, apps: [...apps], today: new Date().toISOString().slice(0, 10) });
    if (found.length) { const { error } = await admin.rpc("qa_report", { p_findings: found }); if (error) console.error("qa_report", error.code); }
  } catch (e) { console.error("grade run", run.id, String((e as Error)?.message ?? e).slice(0, 160)); }
}

/** A production probe workspace: checked like a customer's, but nothing it does is learned from. */
async function synthetic(ws: string): Promise<boolean> {
  const { data, error } = await admin.from("workspaces").select("synthetic").eq("id", ws).maybeSingle();
  return !error && !!(data as { synthetic?: boolean } | null)?.synthetic;
}

export async function learnFromRun(run: Run, w: Workspace, st: RunState, reply: Reply) {
  try {
    const checks = (st.firstChecks ?? []) as { job: string; passed: number; of: number }[];
    const used = (st.lessons ?? []) as string[];
    if (checks.length) {
      await admin.from("odelia_job_checks").upsert(checks.map((c) => ({ workspace_id: run.workspace_id, run_id: run.id, job_id: c.job, passed: c.passed, of: c.of, lessons: used.length })), { onConflict: "workspace_id,job_id", ignoreDuplicates: true });
      if (used.length) await admin.rpc("lesson_outcome", { p_ids: used, p_ok: checks.every((c) => c.passed === c.of) });
    }
    if (!sharesLearning(w)) return;
    const ev = runEvidence(w, { started: String(st.started ?? run.heartbeat_at), reply: reply.text.map((t) => t.en).join("\n"), sources: (st.sources ?? []) as { url: string; title?: string }[], asked: String(st.request ?? run.prompt) });
    if (!worthLearning(ev)) return;
    await distill(run.workspace_id, w, ev, lessonKeys(w), { uid: run.created_by, spent: 0 });
  } catch (e) { console.error("learn from run", run.id, String((e as Error)?.message ?? e).slice(0, 160)); }
}

/** Agency decisions waiting in the queue: a returned filing teaches what trips people up; an approval credits the
 *  live lessons for that form and agency, which were right. */
export async function learnFromAgencies() {
  const { data: rows } = await admin.from("learning_queue").select("id, workspace_id, filing_id, status").is("done_at", null).order("at").limit(10);
  let learned = 0;
  for (const q of rows ?? []) {
    const { data: claimed } = await admin.from("learning_queue").update({ done_at: new Date().toISOString() }).eq("id", q.id).is("done_at", null).select("id");
    if (!claimed?.length) continue;   // another instance has it
    try {
      const { data: f } = await admin.from("filings").select("title, agency, status, note, submitted_at, decided_at, payload").eq("id", q.filing_id).maybeSingle();
      const { data: row } = await admin.from("workspaces").select("name, state").eq("id", q.workspace_id).maybeSingle();
      if (!f || !row) continue;
      const w = normalizeState(row.name, row.state ?? {});
      const form = (f.payload as { official?: string } | null)?.official;
      const agency = (f.agency as { en?: string } | null)?.en;
      const keys = [form ? "form:" + form : "", agency ? agencyKey(agency) : "", ...lessonKeys(w).filter((k) => k.startsWith("place:"))].filter(Boolean);
      if (q.status === "accepted") {
        const right = (await lessonsFor(keys.filter((k) => !k.startsWith("place:")))).map((l) => l.id);
        if (right.length) await admin.rpc("lesson_outcome", { p_ids: right, p_ok: true });
        continue;
      }
      if (!sharesLearning(w)) continue;
      const days = f.submitted_at && f.decided_at ? Math.round((Date.parse(f.decided_at) - Date.parse(f.submitted_at)) / 86_400_000) : null;
      await distill(q.workspace_id, w, filingEvidence({ title: f.title, agency: f.agency, status: f.status, note: f.note, days, form }), keys, { uid: null, spent: 0 });
      learned++;
    } catch (e) { console.error("learn from agency", q.id, String((e as Error)?.message ?? e).slice(0, 160)); }
  }
  return { ok: true, seen: (rows ?? []).length, learned };
}

/* ------------------------------ memory that acts ------------------------------ */
// What the person wrote is read for durable details (how to reach them, their people, limits on the plan, dates,
// vendors: src/recall.ts) on the cheap extract model, alongside the work, and kept in their memory when the run ends.
// From outside the app (a text, a call, an email, a chat) a detail is only a suggestion until they confirm it in the app.

async function recallFor(run: Run, w: Workspace, who: Who): Promise<Recall[]> {
  // a store's run reads Odelia's instructions for its store, not the person's words: nothing there to remember
  if (run.kind !== "task" || !run.created_by || run.parent_run) return [];
  try {
    const book = ((w as { memories?: Record<string, MemoryBook> }).memories ?? {})[run.created_by];
    // what Odelia said just before, for context ("who's your contractor?" "Kevin, kevin@..."); never a source
    const prior = [...(run.state?.messages ?? [])].reverse().find((m) => m.role === "assistant" && typeof m.content === "string")?.content as string | undefined;
    return await recallFrom(run.prompt, {
      book, prior, ...(run.channel && run.channel !== "app" ? { via: run.channel } : {}),
      ask: async (prompt) => {
        const d = await model(run.workspace_id, { messages: [{ role: "user", content: prompt }], max_tokens: 900 }, false, undefined, new AbortController().signal, "extract", who) as unknown as { content: Block[] };
        return d.content.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join("");
      },
    });
  } catch (e) { console.error("recall", run.id, String((e as Error)?.message ?? e).slice(0, 120)); return []; }
}

/* ------------------------------ agent memory ------------------------------ */
// The workspace's memory and briefs go into the run (src/odeliaMemory/context.ts); what the run learned is saved when it
// ends, with the observation step on the cheap extract model. Off until an owner or admin turns it on; a store's bot
// reads its store's part; a "don't remember this chat" run reads only the records and briefs and saves nothing.

// Who the answer reaches decides what memory may go into it: an admins-only memory only for an owner or admin, and
// neither that nor the asker's own memory into a thread other people read (sharedThread in limits.ts).
async function memoryFor(run: Run): Promise<RunMemory | undefined> {
  try {
    const me = run.created_by ?? undefined;
    const { data: mem } = me ? await admin.from("workspace_members").select("role").eq("workspace_id", run.workspace_id).eq("user_id", me).maybeSingle() : { data: null };
    const audience = { role: me ? String(mem?.role ?? "viewer") : "system", shared: !!run.chat_to && sharedThread(run.chat_to) };
    const memory = await loadMemory(memoryDb(admin, run.workspace_id), me, audience);
    // past chats: the asker's own, and never quoted into a shared thread
    return { memory, me, temporary: run.no_memory === true, past: () => (audience.shared ? [] : pastRuns(admin, run.workspace_id, run.id, me)) };
  } catch (e) { console.error("memory load", run.id, String((e as Error)?.message ?? e).slice(0, 120)); return undefined; }
}
async function saveMemory(run: Run, rm: RunMemory | undefined, state: RunState, w: Workspace, reply: Reply, who: Who, role?: string) {
  if (!rm || run.kind !== "task" || run.no_memory) return;
  try {
    const r = await saveRun(memoryDb(admin, run.workspace_id), {
      ws: run.workspace_id, memory: rm.memory, out: (state.mem ?? { suggested: [], remembered: [], forget: [], proposals: [], flushed: [] }) as never, w, now: new Date().toISOString(),
      run: { id: run.id, prompt: run.prompt, channel: run.channel ?? "app", created_by: run.created_by, no_memory: run.no_memory, store: run.store_id ?? null },
      reply: replyText(reply), messages: state.messages, role,
      ask: async (prompt) => {
        const d = await model(run.workspace_id, { messages: [{ role: "user", content: prompt }], max_tokens: 1200 }, false, undefined, new AbortController().signal, "extract", who) as unknown as { content: Block[] };
        return d.content.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join("");
      },
    });
    if (Object.values(r).some((n) => n)) console.log("memory", run.id, JSON.stringify(r));
  } catch (e) { console.error("memory save", run.id, String((e as Error)?.message ?? e).slice(0, 120)); }
}
/** The run's prompt cache use and cost, for the agent run log (agent_runs.cache_*). Best effort before the migration. */
async function cacheLog(runId: string, st: RunState) {
  // the trace for the team's Replay: names and numbers only (src/trace.ts)
  if (st.trace?.length) {
    const { error: e2 } = await admin.rpc("agent_run_trace", { p_id: runId, p_trace: st.trace });
    if (e2) console.error("agent_run_trace", e2.code ?? "");
  }
  const c = st.cache as { calls: number; input: number; read: number; write: number; output: number; prefix?: string } | undefined;
  if (!c) return;
  const { error } = await admin.rpc("agent_run_cache", { p_id: runId, p_calls: c.calls, p_in: c.input, p_read: c.read, p_write: c.write, p_out: c.output, p_cost: Number(st.spent) || 0, p_prefix: c.prefix ?? null });
  if (error) console.error("agent_run_cache", error.code ?? "");
}

/* ------------------------------ a run ------------------------------ */

const short = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const WATCH = {
  en: (what: string, where: string) => `Weekly check, in the background. Applications' statuses are checked daily by Placetta's status tracker, so don't look them up. Search official government sources for new or changed requirements, fees, inspections or deadlines in the last month that affect a ${what || "business like this one"} in ${where || "its city"}. Add a deadline for any new due date. Report only what changed, each with its source. If nothing changed, reply exactly: No changes.`,
  zh: (what: string, where: string) => `每周后台检查。申请状态由快哉的状态追踪每天检查，无需查询。在政府官方来源中查找近一个月内影响${where || "所在城市"}${what || "此类企业"}的新增或变更的要求、费用、检查或截止日期。如有新的截止日期，请添加。只报告变化，并注明来源。如果没有变化，请只回复：No changes。`,
};

/** A job Odelia does in the background on a schedule: a routine the business set up, a renewal coming due, or a filing
    past the agency's usual time. Nobody is watching, so she works the whole plan and reports only what matters. */
const ROUTINE = {
  en: (job: string) => `Scheduled job, in the background; nobody is watching. ${job} Work it start to end with your tools (set_plan if it takes three or more steps). Never file, pay or send anything: put it up for approval. Finish with what you did, what changed and anything that needs the owner, each with its source. If there was nothing to do and nothing changed, reply exactly: No changes.`,
  zh: (job: string) => `后台定时任务，无人在线。${job} 请用工具从头到尾完成（三步以上先 set_plan）。不要提交、付款或发送任何内容，一律提交审批。最后说明做了什么、有何变化、哪些需要负责人处理，并注明来源。如果无事可做也无变化，请只回复：No changes。`,
};

async function sendMail(to: string[], subject: string, text: string) {
  const key = env("RESEND_API_KEY"), from = env("MAIL_FROM");
  if (!key || !from || !to.length) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, text }) });
  if (!res.ok) console.error("resend", res.status);
  return res.ok;
}

/** How many jobs Odelia works on at once in one workspace. */
const PARALLEL = Math.max(1, Math.min(8, Number(env("ODELIA_PARALLEL") || "3") || 3));
const BUSY_MSG = `Odelia is already on ${PARALLEL} jobs here. This one starts when one of them finishes.`;
async function atCapacity(ws: string) {
  const { count } = await admin.from("agent_runs").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "task").eq("status", "running").gt("heartbeat_at", new Date(Date.now() - STALE_MS).toISOString());
  return (count ?? 0) >= PARALLEL;
}

/** agent_runs for the store bots (family.ts). `run` is the run that splits work: its store runs are its person's, in
 *  its language. */
function familyTable(run: Run | null): FamilyDb {
  return {
    async running(ws, fresh) {
      const { count } = await admin.from("agent_runs").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "task").eq("status", "running").gt("heartbeat_at", fresh);
      return count ?? 0;
    },
    async queued(ws, limit) {
      const { data } = await admin.from("agent_runs").select("id").eq("workspace_id", ws).eq("status", "queued").order("created_at", { ascending: true }).limit(limit);
      return (data ?? []).map((r) => r.id as string);
    },
    async insert(parent, kids) {
      if (!run) throw new Error("No run to split.");
      const at = new Date().toISOString();
      const { data, error } = await admin.from("agent_runs").insert(kids.map((k) => ({
        workspace_id: run.workspace_id, created_by: run.created_by, kind: "task", prompt: k.prompt.slice(0, 4000), lang: run.lang, deep: false, channel: "app",
        status: "queued", state: startState([], k.prompt.slice(0, 4000)), heartbeat_at: at, parent_run: parent, job_id: k.job.slice(0, 80), store_id: k.store.slice(0, 80), ...(k.title ? { title: k.title } : {}),
      }))).select("id, job_id");
      if (error || !data) throw new Error("Couldn't start the stores' runs.");
      return kids.map((k) => String(data.find((r) => r.job_id === k.job)?.id ?? ""));
    },
    async update(id, fields, where) {
      let q = admin.from("agent_runs").update(fields).eq("id", id);
      if (where.status) q = q.eq("status", where.status);
      if (where.heartbeat_at) q = q.eq("heartbeat_at", where.heartbeat_at);
      const { data, error } = await q.select("id");
      if (error) { console.error("family update", id, error.code); return 0; }
      return data?.length ?? 0;
    },
    async children(parent) {
      const { data } = await admin.from("agent_runs").select("id, status").eq("parent_run", parent);
      return (data ?? []) as { id: string; status: string }[];
    },
  };
}
/** Starts the store runs waiting their turn in a workspace, as far as its cap allows. They start without the person's
 *  session, so connected apps (mail, drives) stay with runs the person started themselves. */
async function startQueued(ws: string) {
  for (const s of await fill(familyTable(null), ws, PARALLEL, STALE_MS).catch(() => [])) bg(work(s.id, null, s.ticket));
}
/** After a run ends: its slot is free for the next store run waiting its turn, and when it was the last store of a
 *  split, the run that split them wakes to write the summary. */
async function afterRun(run: Run) {
  try {
    await startQueued(run.workspace_id);
    if (run.parent_run) { const ticket = await wake(familyTable(null), run.parent_run); if (ticket) await handOver(run.parent_run, null, ticket); }
  } catch (e) { console.error("after run", run.id, String((e as Error)?.message ?? e).slice(0, 120)); }
}
/** The first words of a reply, for the run that split the work. */
const replyText = (r: unknown) => ((r as { text?: { en?: string }[] } | null)?.text ?? []).map((t) => t.en ?? "").join(" ").trim();

/** Work on a run until it's done, stopped, or time to hand over. Only with the run's lease (lease.ts): a run someone
 *  else holds, or one already finished, is left alone. */
export async function work(runId: string, token: string | null, ticket: string | null = null) {
  const claimed = await claim(runsTable, runId, ticket, STALE_MS);
  if (!claimed) return;
  const { run, lease } = claimed;
  const ws = run.workspace_id;
  const until = Date.now() + CHUNK_MS;
  const lostLease = () => err("lease_lost", "Another instance took the run over.");

  // Speed (Perplexity's and Claude's pattern: say what's happening before the first lookup): the reads a run needs before
  // its first model call go out together, not one after another, and a fresh run shows its first step at once instead
  // of after them and the connected apps' tool lists. Each read's failure is still met where it was before.
  const rowP = admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle();
  const who0P = actorOf(admin as never, run);
  const svcP = servicesFor(ws, run, token);
  const memP = memoryFor(run);
  for (const p of [who0P, svcP, memP] as Promise<unknown>[]) p.catch(() => undefined);   // met below; never unhandled if the run ends first
  const fresh = !run.state?.rounds && !(Array.isArray(run.steps) && run.steps.length);
  let firstP: Promise<unknown> = Promise.resolve();
  if (fresh && run.kind === "task") {
    // whose step it is, as every step says (a store's bot, or Odelia herself: src/jobs.ts MAIN_BOT)
    const bot = run.parent_run && run.store_id ? run.store_id : "odelia";
    const first = [{ state: "searching", at: new Date().toISOString(), bot, label: { en: "Reading your request", zh: "正在读取您的请求" } }];
    firstP = Promise.resolve(lease.write({ steps: first, updated_at: first[0].at })).then((ok) => { if (ok) pusher(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", run.id, 0).progress(first as never, null, first[0].at); }).catch(() => undefined);
    run.steps = first as never;
  }
  const { data: row } = await rowP;
  await firstP;   // it lands before any later write of the steps, which always carries it
  if (!row) { await lease.write({ status: "failed", error: "The workspace is gone." }, { running: true }); await afterRun(run); return; }
  let cur: Workspace = normalizeState(row.name, row.state ?? {});
  const pending: Patch[] = [];
  const steps: Step[] = Array.isArray(run.steps) ? [...run.steps] : [];
  let draft: string | null = null, flushT: ReturnType<typeof setTimeout> | undefined, flushing: PromiseLike<unknown> = Promise.resolve();
  // and pushed to the app on the run's private Realtime channel as it's saved (push.ts); polling stays as the fallback
  const push = pusher(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", run.id, steps.length);
  // At most one write every DRAFT_MS while the model writes: the app polls the draft and shows the words arriving. (It
  // used to wait for 600 ms of quiet, which a streaming answer never gives, so nothing showed until the end.)
  const flush = (now = false) => {
    const go = () => { flushT = undefined; const at = new Date().toISOString(); flushing = lease.write({ steps, draft, updated_at: at }).then(ok => { if (ok) push.progress(steps, draft, at); return ok; }); };
    if (now) { clearTimeout(flushT); go(); } else if (flushT === undefined) flushT = setTimeout(go, DRAFT_MS);
  };
  // Save the agent's changes onto the newest saved state (the person may have changed things meanwhile), and log them.
  // One save at a time; each takes the patches made so far.
  let chain: Promise<void> = Promise.resolve();
  let saveError: Error | null = null;
  const commit = () => (chain = chain.then(async () => {
    if (saveError) return;
    // Changes from an instance that lost the run would repeat the other one's work.
    if (lease.lost) throw lostLease();
    const batch = pending.splice(0);
    if (!batch.length) return;
    // Several jobs can run at once: each saves its own changes onto the newest state, and only if nobody saved in
    // between (updated_at unchanged); otherwise it reads again and re-applies them. It never writes over someone
    // else's save: after SAVE_TRIES the save fails, and so does the run.
    const w = await saveOnto<Workspace>({
      tries: SAVE_TRIES,
      async read() {
        const { data: fresh, error } = await admin.from("workspaces").select("name, state, updated_at").eq("id", ws).maybeSingle();
        if (error) throw err("save_failed", "Couldn't read the workspace: " + error.code);
        return fresh?.updated_at ? { w: normalizeState(fresh.name ?? row.name, fresh.state ?? {}), version: String(fresh.updated_at) } : null;
      },
      async write(w, version) {
        const { data: saved, error } = await admin.from("workspaces").update({ state: stripState(w), updated_at: new Date().toISOString() }).eq("id", ws).eq("updated_at", version).select("id");
        if (error) throw err("save_failed", "save failed: " + error.code);
        return !!saved?.length;
      },
    }, (w) => batch.reduce((acc, p) => p(acc), w));
    // The audit trail only for changes that were saved.
    const audit = w.audit.filter((a) => a.actor === "agent" || a.actor === "you").map((a) => ({ workspace_id: ws, client_id: a.id, actor: a.actor, actor_id: run.created_by, action: a.action, object: a.object, detail: a.detail ?? null }));
    if (audit.length) await admin.from("audit_log").upsert(audit, { onConflict: "workspace_id,client_id", ignoreDuplicates: true });
    cur = { ...w, audit: cur.audit };   // and this job now sees what the others did
  }).catch((e) => { saveError = e as Error; console.error("commit", runId, String(e).slice(0, 160)); }));
  /** Saves what's pending, and stops the run if it couldn't be saved. */
  const save = async () => { await commit(); if (saveError) throw saveError; };
  /** Saves what's pending, then takes the workspace as it's saved now: the stores' bots saved their work meanwhile. */
  const sync = async () => {
    await save();
    const { data: fresh } = await admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle();
    if (fresh) cur = { ...normalizeState(fresh.name ?? row.name, fresh.state ?? {}), audit: cur.audit };
  };

  // Stop when the person says so, or when another instance has the run; renew the lease through long model calls.
  const ctl = new AbortController();
  let renewed = Date.now();
  const watchStop = setInterval(async () => {
    const { data } = await admin.from("agent_runs").select("status").eq("id", runId).maybeSingle();
    if (data?.status !== "running" || lease.lost) { ctl.abort(); return; }
    if (Date.now() - renewed > RENEW_MS) { renewed = Date.now(); await lease.write({}); if (lease.lost) ctl.abort(); }
  }, 3000);

  // A store's bot works one store's part; any other run in the app may split work across the stores' bots.
  const child = run.parent_run && run.job_id ? { job: run.job_id, store: run.store_id ?? "" } : undefined;
  const fam = familyTable(run);
  let ended = false;   // done, failed or stopped: its slot frees up, and a store's run may wake the run that split it
  let counting: RunState | null = null;   // the run's tool counts, reported for Agent health however it ends

  // every tool call this chunk made: who, their role, a hash of the input and the decision (agent_tool_calls)
  const toolLog: ToolLog[] = [];
  const flushLog = async () => {
    const rows = toolLog.splice(0).map((e) => ({ workspace_id: ws, run_id: run.id, actor_id: e.actor, actor_role: e.role, tool: e.tool.slice(0, 120), scope: e.scope, input_hash: e.input_hash,
      decision: e.decision, code: e.code ?? null, reason: e.reason ? e.reason.slice(0, 400) : null, at: e.at }));
    if (!rows.length) return;
    const { error } = await admin.from("agent_tool_calls").insert(rows);
    if (error) console.error("tool log", run.id, error.code);
  };

  try {
    // Who the run acts for, as of now: the person's role in this workspace (or the system for a background check).
    // Someone who left, or only views it, stops the run; every tool call is checked against this role.
    const who0 = await who0P;
    if ("refused" in who0) throw err("not_allowed", who0.refused);
    const svc = await svcP;
    if (!child && (run.channel ?? "app") === "app") {
      svc.split = async ({ children }) => {
        await save();   // the store jobs are in the workspace before their runs start
        const out = await spawn(fam, { ws, parent: run.id, cap: PARALLEL, staleMs: STALE_MS }, children.map((c) => ({ job: c.job, store: c.store, prompt: c.prompt, title: c.title })));
        // started by this run for the same person: they carry its session, so connected apps work for them too
        for (const s of out.runs) bg(work(s.id, token, s.ticket));
        return { started: out.started, queued: out.queued };
      };
    }
    const state = counting = run.state ?? startState([], run.prompt);
    // The task's spend so far, from every earlier chunk: the ceiling is for the whole task.
    const who: Who = { uid: run.created_by, spent: Number(state.spent) || 0, events: Array.isArray(state.events) ? state.events.filter((x) => Number.isInteger(x)).slice(-500) : [] };
    const mainRole = roleOfRun(run);
    // The network: the run starts from what other businesses' jobs taught Odelia about these places, agencies and forms.
    if (state.network === undefined) {
      const ls = rank(await lessonsFor(lessonKeys(cur)).catch(() => [] as Lesson[])).slice(0, 14);
      state.lessons = ls.map((l) => l.id);
      state.network = lessonsBrief(ls, run.lang);
      if (ls.length) { steps.push({ state: "searching", label: { en: `Starting from ${ls.length} lesson${ls.length === 1 ? "" : "s"} other businesses taught me`, zh: `参考其他商家积累的 ${ls.length} 条经验` } }); flush(); }
    }
    const location = cur.meta?.city ? { city: cur.meta.city, region: cur.meta.region } : undefined;
    // memory: read alongside the work on a fresh run (a resumed one reads it when it ends), so it adds no wait
    const recalling = !state.rounds && !state.recalled ? recallFor(run, cur, who) : null;
    const memory = await memP;
    const out = await runRounds({
      state, ws: () => cur, lang: run.lang, deep: run.deep, account: true, svc, signal: ctl.signal, until, maxTokens: TASK_TOKENS,
      apply: (p) => { cur = p(cur); pending.push(p); },
      step: (s) => { steps.push(s); flush(); },
      // after each round: save the work and where the conversation is (with what it has cost), so a fresh instance can carry on
      round: async (st) => {
        await save();
        await flushLog();
        if (!(await lease.write({ state: st, steps, draft, updated_at: new Date().toISOString() })) && lease.lost) throw lostLease();
      },
      draft: (t) => { draft = t; flush(); },
      send: async (body, deep, role, onText) => {
        try { return await model(ws, body, deep, location, ctl.signal, role ?? mainRole, who, onText) as never; }
        finally { state.spent = who.spent; state.events = who.events; }
      },
      // Every channel, so a request from outside the app gets the remote rules (src/serverRun.ts).
      channel: run.channel ?? "app",
      // and who asked from there, for the change card a business fact or a new name goes up on
      sender: await senderOf(run),
      role: mainRole,
      // whose memory it reads: the person who asked
      me: run.created_by ?? undefined,
      // business rules (src/businessRules.ts): what a rule asks to tell someone goes out through the business's own channels
      notify: (n) => bg(deliverNotice(admin, env, ws, n).then((r) => { if (!r.ok) console.error("business rule", ws, n.via, r.why); })),
      // the replay: jobs link this run; a store's bot works its part; a run that split work waits for its stores
      runId: run.id,
      // who the run acts for, the workspace it may touch, the tool-call log, and the optional model check on untrusted text
      actor: who0.actor, workspaceId: ws, log: (e) => { toolLog.push(e); },
      ...(env("INJECTION_MODEL_CHECK") === "1" ? { classify: async (text: string) => {
        const d = await model(ws, { system: CLASSIFIER_SYSTEM, messages: [{ role: "user", content: classifierPrompt(text) }], max_tokens: 8 }, false, undefined, ctl.signal, "extract", who) as unknown as { content: Block[] };
        return parseClassifier(d.content.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join(""));
      } } : {}),
      ...(memory ? { memory } : {}),
      ...(child ? { child } : {}),
      ...(!child ? { family: {
        pending: async () => stillOpen(await fam.children(run.id)),
        results: async () => {
          await sync();
          const { data } = await admin.from("agent_runs").select("job_id, store_id, status, reply, error").eq("parent_run", run.id);
          return (data ?? []).map((r) => ({ job: String(r.job_id ?? ""), store: String(r.store_id ?? ""), status: String(r.status), reply: replyText(r.reply) || String(r.error ?? "") }));
        },
      } } : {}),
    });
    clearTimeout(flushT);   // the last write below carries the steps; a late flush would bring the draft back
    // (a run waiting on its stores' bots reads it when it wakes and ends, like a paused one)
    if (!("paused" in out) && !("waiting" in out) && !state.recalled) {
      const kept = await (recalling ?? recallFor(run, cur, who));
      state.recalled = true;
      if (kept.length && run.created_by) {
        const p = keepRecall(run.created_by, kept);
        cur = p(cur); pending.push(p);
        out.reply.remembered = chipsOf(kept);
      }
    }
    await save();
    // Autopilot (src/autopilotFile.ts): the filings this run marked go in now, under the owner's standing authorization;
    // every check runs again first and the database checks the grant once more. One that can't go is put back on its
    // card for the owner, with why.
    if (((cur.approvals ?? []) as { autopilot?: { filing?: string } }[]).some((a) => a.autopilot && !a.autopilot.filing)) {
      const done = await autofileAll(cur, autopilotIO(ws, await svcP), new Date().toISOString()).catch((e) => { console.error("autopilot", ws, String((e as Error)?.message ?? e).slice(0, 160)); return null; });
      if (done?.patches.length) { for (const p of done.patches) { cur = p(cur); pending.push(p); } await save(); }
    }
    if ("paused" in out) {
      const next = await lease.release({ state: { ...out.paused, spent: who.spent }, steps, draft, updated_at: new Date().toISOString() });
      if (next) await handOver(runId, token, next);
      return;
    }
    if ("waiting" in out) {
      // Its stores' bots are at work: it waits with its answer so far, which the app shows. Its slot is free for the
      // next store waiting its turn, and if they all finished meanwhile it wakes straight away.
      const parked = await lease.write({ status: "waiting", state: { ...out.waiting, spent: who.spent }, steps, draft: null, ...(out.reply ? { reply: out.reply } : {}), updated_at: new Date().toISOString() }, { running: true });
      if (parked) {
        await startQueued(ws);
        const ticket = await wake(fam, run.id);
        if (ticket) await handOver(runId, token, ticket);
      }
      return;
    }
    // Saver mode is said once per period, at the end of the reply, in the person's language.
    if (who.reduced && run.kind === "task" && await saverNoticeDue(admin, ws).catch(() => false)) {
      out.reply.text = [...out.reply.text, { en: saverLine("en", who.renews ?? null, who.reduced), zh: saverLine("zh", who.renews ?? null, who.reduced) }];
    }
    await finish(run, out.reply, steps, lease, cur);
    ended = true;
    bg(toolCounts(runId, state));
    bg(cacheLog(runId, state));
    bg(saveMemory(run, memory, state, cur, out.reply, who, who0.actor.role));
    // a production probe workspace (migration 20261030090000) teaches the network nothing and files no QA findings
    bg(synthetic(run.workspace_id).then((probe) => probe ? undefined : Promise.all([learnFromRun(run, cur, state, out.reply), gradeOnline(run, cur, state, out.reply)])));
  } catch (e) {
    clearTimeout(flushT);
    // An instance that lost the run says and saves nothing: the one holding it does.
    if (lease.lost) return;
    await commit().catch(() => undefined);
    const code = (e as { code?: string }).code;
    ended = true;
    if (code === "cancelled" || ctl.signal.aborted) await lease.write({ steps, draft: null, state: null, updated_at: new Date().toISOString() });
    else {
      console.error("run failed", runId, code, String((e as Error)?.message ?? e).slice(0, 200));
      // a failure on our side or the vendor's: the run's model calls are given back, and the person is told
      const free = refundable(code) && (counting?.events?.length ?? 0) > 0 ? await refundFailed(ws, counting!.events!) : false;
      const said = ["rate_limited", "not_configured", "over_budget", "plan_required", "entry_ended", "paused", "task_limit", "not_allowed"].includes(code ?? "") ? (e as Error).message : "The agent hit a problem and stopped. Try again.";
      const failed = await lease.write({ status: "failed", error: free ? `${said} ${NOT_CHARGED_EN}` : said, steps, state: null, updated_at: new Date().toISOString() }, { running: true });
      // Someone who asked by text or on a call hears about it the same way.
      if (failed) await textBack(run, SAY.failed[run.lang], []).catch((x) => console.error("text back", String(x).slice(0, 120)));
      if (failed && run.channel === "email") await mailBack(run, SAY.failed[run.lang], []).catch((x) => console.error("mail back", String(x).slice(0, 120)));
      if (failed && CHATS.has(run.channel ?? "")) await chatBack(run, SAY.failed[run.lang], []).catch(() => undefined);
      if (failed && counting) bg(toolCounts(runId, counting));
    }
  } finally {
    clearInterval(watchStop); clearTimeout(flushT); await flushing;
    // done, waiting, handed to a fresh instance, failed or stopped: the app reads the row now instead of at its next poll
    if (!lease.lost) push.end("saved");
    await flushLog().catch(() => undefined);
    if (ended && !lease.lost) await afterRun(run);
  }
}

/** The tools a finished run called and how many returned an error, for the team's Agent health page. Best effort:
 *  a database without the columns yet (20261017210300_agent_health) just doesn't record them. */
async function toolCounts(runId: string, st: RunState) {
  const { error } = await admin.rpc("agent_run_tools", { p_id: runId, p_calls: st.toolCalls ?? 0, p_errors: st.toolErrors ?? 0 });
  if (error) console.error("agent_run_tools", error.code ?? "");
}

/** The answer to someone who emailed Odelia: by email, in their thread, only to the address they sign in with, with
 *  the link to the approval waiting in the app. Nothing is approved by email. */
async function mailBack(run: Run, text: string, approvals: string[], attachments: Attachment[] = []) {
  if (run.channel !== "email" || !run.reply_to || !run.created_by) return;
  const { data: u } = await admin.auth.admin.getUserById(run.created_by);
  const to = String(u?.user?.email ?? "").toLowerCase();
  if (!to || to !== run.reply_to.toLowerCase()) return;
  const { data: asked } = await admin.from("odelia_messages").select("provider_id, subject").eq("run_id", run.id).eq("channel", "email").eq("direction", "in").maybeSingle();
  const origin = appOrigin(env);
  const approve = approvals.length ? appLink(origin, run.workspace_id, approvals.length === 1 ? approvals[0] : "ready") : "";
  const footer = approve ? `${SAY.approve[run.lang]} ${approve}` : `${SAY.open[run.lang]} ${appLink(origin, run.workspace_id)}`;
  const body = mailBody(text || SAY.ack[run.lang], origin ? footer : undefined);
  const r = await sendOdeliaMail(env, { to, subject: replySubject(String(asked?.subject ?? "")), text: body.text, html: body.html, inReplyTo: String(asked?.provider_id ?? "").replace(/^mail:/, "") || undefined, ...(attachments.length ? { attachments } : {}) });
  if (r.ok) await logMessage(admin, { user_id: run.created_by, workspace_id: run.workspace_id, direction: "out", channel: "email", kind: "reply", body: body.text, provider_id: r.id ? `mail:${r.id}` : null, run_id: run.id });
  else console.error("odelia mail", r.status, r.detail);
}

/** The answer to a job asked in Slack, Lark, WeChat, Teams or Telegram, in the same thread (in WeChat, the same chat).
 *  Approvals stay in the app: the reply links to them, as a button that opens the app where the chat has link buttons
 *  (Teams, Telegram), never one that approves in the chat. */
async function chatBack(run: Run, text: string, approvals: string[], extra = "") {
  if (!run.chat_to) return;
  const origin = appOrigin(env);
  const link = approvals.length ? appLink(origin, run.workspace_id, approvals.length === 1 ? approvals[0] : "ready") : "";
  const said = text || (run.lang === "zh" ? "完成了。" : "Done.");
  if (run.chat_to.kind === "teams" || run.chat_to.kind === "telegram") {
    const button = link ? { label: run.lang === "zh" ? "在快哉中查看并批准" : "Review and approve in Placetta", url: link } : undefined;
    const tail = extra ? `\n\n${extra}` : "";
    if (run.chat_to.kind === "telegram") {
      const bot = await telegramBot(admin, run.workspace_id);
      if (!bot) return;
      // only to the Telegram still linked to the member who asked, while they're still a member
      const who = await telegramSender(admin, run.workspace_id, bot.bot_id, run.chat_to.user);
      if (!who?.member || who.user_id !== run.created_by) return;
      await chatReply(bot, run.chat_to, said, { tail, button });
      return;
    }
    if (!teamsServiceOk(run.chat_to.service_url)) return;
    const bot = await vaultBot(run.workspace_id, "teams_bot");
    if (bot) await chatReply(bot, run.chat_to, said, { tail, button });
    return;
  }
  const more = (extra ? `\n\n${extra}` : "") + (link ? (run.lang === "zh" ? `\n\n等您批准：${link}` : `\n\nWaiting for your approval: ${link}`) : "");
  if (run.chat_to.kind === "wechat") {
    const acct = await wechatAccount(admin, run.workspace_id);
    if (!acct) return;
    // only to the WeChat still linked to the member who asked, while they're still a member
    const who = await wechatSender(admin, run.workspace_id, acct.bot.app_id, run.chat_to.openid);
    if (!who?.member || who.user_id !== run.created_by) return;
    await chatReply(acct.bot, run.chat_to, said, { tail: more, save: acct.save });
    return;
  }
  if (run.chat_to.kind === "slack") {
    const bot = await vaultBot(run.workspace_id, "slack_bot") as SlackBot | null;
    if (!bot) return;
    const to = run.chat_to;
    // the application the answer is about (one approval waiting): buttons to open it, take it on, or be reminded
    let item: ItemRef | undefined;
    if (approvals.length === 1) {
      const { data: w } = await admin.from("workspaces").select("state").eq("id", run.workspace_id).maybeSingle();
      const app = ((w?.state as { approvals?: { id?: string; app?: string }[] } | null)?.approvals ?? []).find((a) => a.id === approvals[0])?.app;
      if (app && /^[\w.:-]{1,190}$/.test(app)) item = { kind: "app", id: app };
    }
    // Grok Bot keeps approvals out of groups: in a channel, the link goes only to the person who asked
    const privately = !!link && sharedThread(to) && !!to.user;
    const words = said + (extra ? `\n\n${extra}` : "") + (link && !privately ? (run.lang === "zh" ? `\n\n等您批准：${link}` : `\n\nWaiting for your approval: ${link}`) : "");
    const open = link || (origin ? appLink(origin, run.workspace_id) : "");
    const r = await slackPostBlocks(bot.bot_token, { channel: to.channel, thread_ts: to.thread_ts, text: words, blocks: answerBlocks(words, { lang: run.lang, open: privately ? undefined : open || undefined, item }) });
    if (!r.ok) await chatReply(bot, to, words);   // blocks refused (an old app without them): the words alone
    if (privately) await slackEphemeral(bot.bot_token, { channel: to.channel, user: to.user!, thread_ts: to.thread_ts,
      text: run.lang === "zh" ? `等您批准（只有您能看到）：${link}` : `Waiting for your approval (only you can see this): ${link}`,
      blocks: answerBlocks(run.lang === "zh" ? "等您批准。只有您能看到这条消息，批准只在快哉中进行。" : "Waiting for your approval. Only you can see this; approving happens in Placetta.", { lang: run.lang, open: link, item }) });
    return;
  }
  const bot = await vaultBot(run.workspace_id, "lark_bot");
  if (bot) await chatReply(bot, run.chat_to, said, { tail: more });
}

/** A workspace's connected Slack, Lark or Teams bot, from the vault. */
async function vaultBot(ws: string, kind: "slack_bot" | "lark_bot" | "teams_bot"): Promise<Bot | null> {
  const { data: row } = await admin.from("integrations").select("secret_id, status").eq("workspace_id", ws).eq("kind", kind).maybeSingle();
  if (!row?.secret_id || row.status !== "connected") return null;
  const { data: raw } = await admin.rpc("vault_get", { p_id: row.secret_id });
  try { return { ...JSON.parse(String(raw ?? "")), kind } as Bot; } catch { return null; }
}

/**
 * The answer to someone who texted or called: plain text, at most three messages, ending with the link to the exact
 * approval waiting in the app (or the app, when there are several or the answer runs long). Nothing is approved by text.
 */
async function textBack(run: Run, text: string, approvals: string[], extra = "") {
  if ((run.channel !== "sms" && run.channel !== "voice") || !run.reply_to || !run.created_by) return;
  const link = await linkOf(admin, run.created_by);
  // Only ever to the number this person verified, and only while it's still theirs.
  if (!link?.verified_at || link.number !== normalizePhone(run.reply_to)) return;
  const origin = appOrigin(env);
  const approve = approvals.length ? appLink(origin, run.workspace_id, approvals.length === 1 ? approvals[0] : "ready") : "";
  // the filled form's line and link, then the approval's: always kept, whatever else is cut to fit
  const tail = [extra, approve ? `${SAY.approve[run.lang]} ${approve}` : ""].filter(Boolean).join(" ");
  const segments = splitSms(text, { max: 3, lang: run.lang, more: appLink(origin, run.workspace_id), tail: tail || undefined });
  await textUser(admin, env, { link, workspace_id: run.workspace_id, segments, kind: "reply", run_id: run.id });
}

/** Owners who asked for texts hear when an approval is waiting that nobody saw in the app; the outbox holds it for their quiet hours. */
async function queueApprovalTexts(run: Run, title: { en: string; zh: string }, approvals: string[]) {
  if (!approvals.length) return;
  const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", run.workspace_id).eq("role", "owner");
  const ids = (owners ?? []).map((o) => o.user_id as string);
  if (!ids.length) return;
  const { data: links } = await admin.from("phone_links").select("user_id, lang").in("user_id", ids).not("verified_at", "is", null).eq("texts_on", true).is("opted_out_at", null);
  const origin = appOrigin(env);
  const rows = (links ?? []).map((l) => ({
    user_id: l.user_id, workspace_id: run.workspace_id, kind: "text", urgent: false, dedupe: `approval:${run.id}`,
    body: l.lang === "zh" ? `${title.zh}。有 ${approvals.length} 项等待您批准。` : `${title.en}. ${approvals.length} item${approvals.length === 1 ? " is" : "s are"} waiting for your approval.`,
    link: appLink(origin, run.workspace_id, approvals.length === 1 ? approvals[0] : "ready") || null,
  }));
  if (rows.length) await admin.from("odelia_outbox").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true });
}

/** Owners who asked for texts and said not to email them hear about finished work by text instead (the outbox holds
 *  it for their quiet hours), on their verified number with texts on. */
async function textInstead(run: Run, ids: string[], title: { en: string; zh: string }, said: { en: string; zh: string }) {
  if (!ids.length) return;
  const { data: links } = await admin.from("phone_links").select("user_id, lang").in("user_id", ids).not("verified_at", "is", null).eq("texts_on", true).is("opted_out_at", null);
  const origin = appOrigin(env);
  const rows = (links ?? []).map((l) => ({
    user_id: l.user_id, workspace_id: run.workspace_id, kind: "text", urgent: false, dedupe: `done:${run.id}`,
    body: l.lang === "zh" ? short(`${title.zh}。${said.zh}`, 300) : short(`${title.en}. ${said.en}`, 300), link: appLink(origin, run.workspace_id) || null,
  }));
  if (rows.length) await admin.from("odelia_outbox").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true });
}

async function finish(run: Run, reply: Reply, steps: Step[], lease: Lease, w?: Workspace) {
  const now = new Date().toISOString();
  // The answer goes out only from the instance that marked the run done: not when it was stopped meanwhile, and not
  // from a second instance that lost the run, so nobody gets it twice.
  if (!(await lease.write({ status: "done", reply, steps, draft: null, state: null, updated_at: now }, { running: true }))) return;
  // A store's bot answers the run that split the work, not the person: its one summary is the update they get.
  if (run.parent_run) return;
  const said = reply.text.map((t) => t.en).join(" ").trim();
  // The agency's forms this run filled again (src/forms/versions.ts): attached to an email; by text or in a chat, a
  // short link that opens the filled PDF in the app for a member of the workspace, for seven days.
  const forms = (reply.forms ?? []) as FilledForm[];
  const linked = forms.length && run.channel && run.channel !== "app" && run.channel !== "email"
    ? await linkForms(admin, { ws: run.workspace_id, by: run.created_by, origin: appOrigin(env), forms }).catch(() => forms) : forms;
  const formLine = linked.length ? filledLines(linked, run.lang) : "";
  // Asked by text or on a call: the answer goes back by text, which is where they're watching.
  if (run.channel === "sms" || run.channel === "voice") {
    await textBack(run, reply.text.map((t) => t[run.lang] || t.en).join("\n\n").trim() || SAY.ack[run.lang], reply.approvals ?? [], formLine).catch((e) => console.error("text back", String(e).slice(0, 120)));
    return;
  }
  // Asked by email: the answer goes back by email, in their thread, with the filled forms attached.
  if (run.channel === "email") {
    const files = forms.length ? await formAttachments(admin, run.workspace_id, forms).catch(() => []) : [];
    await mailBack(run, [reply.text.map((t) => t[run.lang] || t.en).join("\n\n").trim(), formLine].filter(Boolean).join("\n\n"), reply.approvals ?? [], files).catch((e) => console.error("mail back", String(e).slice(0, 120)));
    return;
  }
  // Asked in Slack, Lark or WeChat: the answer goes back to the same thread or chat, with the link to anything waiting
  // for approval.
  if (CHATS.has(run.channel ?? "")) {
    await chatBack(run, reply.text.map((t) => t[run.lang] || t.en).join("\n\n").trim(), reply.approvals ?? [], formLine).catch((e) => console.error("chat back", String(e).slice(0, 120)));
    return;
  }
  if (run.kind === "watch" && /^no changes\.?$/i.test(said)) return;
  // Someone watching in the app already sees it; otherwise it becomes an Update and an email.
  const { data: seen } = await admin.from("agent_runs").select("seen_at").eq("id", run.id).maybeSingle();
  if (run.kind === "task" && seen?.seen_at && Date.now() - Date.parse(seen.seen_at) < 20_000) return;
  const title = run.title ? run.title
    : run.kind === "watch" ? { en: "Weekly check: something changed", zh: "每周检查：有变化" }
    : { en: `Placetta finished: ${short(run.prompt)}`, zh: `快哉已完成：${short(run.prompt)}` };
  const zh = reply.text.map((t) => t.zh).join(" ").trim();
  await admin.from("updates").upsert({ workspace_id: run.workspace_id, kind: "agent", title, body: { en: short(said, 600), zh: short(zh, 600) }, dedupe: `run:${run.id}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", run.workspace_id).eq("role", "owner");
  const emails: string[] = [], texts: string[] = [];
  for (const o of owners ?? []) {
    // how each owner asked to be reached (src/recall.ts): never by email when they said so; by text when they asked
    if (!mayEmail(w, o.user_id)) { if (wantsTexts(w, o.user_id)) texts.push(o.user_id); continue; }
    const { data } = await admin.auth.admin.getUserById(o.user_id); if (data?.user?.email && data.user.email_confirmed_at) emails.push(data.user.email);
  }
  const waiting = (reply.approvals ?? []).length;
  const app = (env("APP_ORIGINS").split(",")[0] ?? "").trim().replace(/\/+$/, "");
  await sendMail(emails, title.en, `${said}${waiting ? `\n\n${waiting} item${waiting === 1 ? "" : "s"} waiting for your approval.` : ""}${app ? `\n\nOpen Placetta: ${app}/app/` : ""}\n`);
  await textInstead(run, texts, title, { en: said, zh }).catch((e) => console.error("text instead", String(e).slice(0, 120)));
  await queueApprovalTexts(run, title, reply.approvals ?? []).catch((e) => console.error("approval texts", String(e).slice(0, 120)));
}

/* ------------------------------ requests ------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  // Messages are text and short; files go through Documents. Anything bigger is not a conversation.
  if (tooLarge(req.headers.get("content-length"))) return fail(413, "bad_request", "That request is too large. Upload files to Documents instead of pasting them.");
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (tooLarge(null, raw)) return fail(413, "bad_request", "That request is too large. Upload files to Documents instead of pasting them.");
    body = JSON.parse(raw);
  } catch { return fail(400, "bad_request", "Send JSON."); }
  const action = String(body.action ?? "start");

  if (action === "continue" || action === "watchdog" || action === "watch" || action === "selftest" || action === "learn" || action === "settle") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
    if (action === "learn") return json(200, await learnFromAgencies());
    if (action === "settle") {
      const ws = String(body.workspace_id ?? "");
      if (!UUID.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
      try { return json(200, { ok: true, ...(await settle(ws)) }); } catch (e) { console.error("settle", ws, String(e).slice(0, 160)); return fail(500, "upstream_error", "Couldn't settle the workspace."); }
    }
    if (action === "selftest") {
      // short real-model runs on scratch workspaces held in memory: no workspace is read or written
      // {probe: true}: which server secrets are set (names and yes/no only, never a value), and the checks there are
      if (body.probe) {
        const names = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "AGENT_MODEL", "AGENT_ROUTE",
          "GEMINI_PAID", "ALLOW_DEEPSEEK", "ALLOW_OPENROUTER", "ALLOW_GROQ", "AGENT_ROUTE_PLAN", "AGENT_ROUTE_REVIEW", "AGENT_ROUTE_EXTRACT", "AGENT_ROUTE_TRANSLATE", "AGENT_ROUTE_DRAFT", "AGENT_ROUTE_SHORT", "AGENT_ROUTE_WATCH", "AGENT_ROUTE_DEEP",
          "AI_DAILY_LIMIT_USD", "AI_WS_DAILY_LIMIT_USD", "AI_TASK_LIMIT_USD",
          "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ENTRY", "STRIPE_PRICE_LOCATION", "STRIPE_PRICE_LOCATION_PRO", "STRIPE_PRICE_OPENING", "STRIPE_PRICE_OPENING_FOOD", "STRIPE_PRICE_PACK", "STRIPE_PRICE_GUARANTEE",
          "RESEND_API_KEY", "MAIL_FROM", "APP_ORIGINS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "QB_CLIENT_ID", "OAUTH_STATE_SECRET",
          "SQUARE_CLIENT_ID", "SQUARE_CLIENT_SECRET", "TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET", "WECHAT_API_BASE",
          "TELNYX_API_KEY", "TELNYX_FAX_CONNECTION_ID", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_VOICE_CONNECTION_ID", "ODELIA_NUMBER", "LOB_API_KEY", "FILER_SECRET", "AZURE_SPEECH_KEY"];
        return json(200, { secrets: Object.fromEntries(names.map((n) => [n, !!env(n)])), checks: SELFTEST_NAMES() });
      }
      if (!configured()) return json(200, { ok: false, model: null, checks: [{ name: "a model key is set", pass: false, detail: "Add ANTHROPIC_API_KEY (or another model key) in the Edge Function secrets.", ms: 0 }], total_ms: 0 });
      return json(200, await selftest((k) => Deno.env.get(k), { budgetMs: Number(body.budget_ms) || undefined, only: Array.isArray(body.only) ? body.only.map(String) : undefined, model: typeof body.model === "string" ? body.model : undefined }));
    }
    if (action === "continue") {
      const id = String(body.run_id ?? "");
      if (!UUID.test(id)) return fail(400, "bad_request", "run_id is required.");
      // The ticket from a hand-over; a duplicated continue with the same ticket finds the run already taken.
      bg(work(id, typeof body.token === "string" ? body.token : null, typeof body.ticket === "string" ? body.ticket.slice(0, 64) : null));
      return json(202, { ok: true });
    }
    if (action === "watchdog") {
      const cutoff = new Date(Date.now() - STALE_MS).toISOString();
      const { data: stale } = await admin.from("agent_runs").select("id, attempts, heartbeat_at").eq("status", "running").lt("heartbeat_at", cutoff).limit(20);
      for (const r of stale ?? []) {
        // Only if it's still the same quiet run: an instance may have taken it up since the list was read.
        if (r.attempts >= MAX_ATTEMPTS) {
          const { data: dead } = await admin.from("agent_runs").update({ status: "failed", error: "The agent stopped responding. Try again." }).eq("id", r.id).eq("status", "running").eq("heartbeat_at", r.heartbeat_at).select("workspace_id, state");
          // it stopped on our side: its model calls are given back
          for (const d of dead ?? []) { const ev = (d.state as RunState | null)?.events; if (ev?.length) await refundFailed(String(d.workspace_id), ev); }
        }
        else await handOver(r.id, null, null);   // no ticket: it's taken only while its holder is still quiet
      }
      // Store bots: runs waiting their turn start where there's room, and a run whose stores all finished (its wake-up
      // lost with an instance) is woken.
      const { data: queued } = await admin.from("agent_runs").select("workspace_id").eq("status", "queued").limit(50);
      for (const ws of new Set((queued ?? []).map((r) => String(r.workspace_id)))) await startQueued(ws);
      const { data: parked } = await admin.from("agent_runs").select("id").eq("status", "waiting").lt("updated_at", new Date(Date.now() - 60_000).toISOString()).limit(20);
      let woken = 0;
      for (const r of parked ?? []) { const ticket = await wake(familyTable(null), r.id); if (ticket) { woken++; await handOver(r.id, null, ticket); } }
      return json(200, { ok: true, resumed: (stale ?? []).length, woken });
    }
    // watch: the weekly background check the monitor starts
    const ws = String(body.workspace_id ?? "");
    if (!UUID.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
    const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const meta = ((w?.state ?? {}) as { meta?: { city?: string; region?: string; what?: string } }).meta ?? {};
    const lang = body.lang === "zh" ? "zh" : "en";
    const where = [meta.city, meta.region].filter(Boolean).join(", ");
    // a routine, a renewal or a chase brings its own job and title; the weekly check is the default
    const job = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
    const t = body.title as { en?: unknown; zh?: unknown } | undefined;
    const title = job && t && typeof t.en === "string" ? { en: t.en.slice(0, 120), zh: (typeof t.zh === "string" ? t.zh : t.en).slice(0, 120) } : null;
    const prompt = job ? ROUTINE[lang](job) : WATCH[lang](meta.what ?? "", where);
    // A new run carries a ticket (its first lease value), so only the instance started here takes it.
    const ticket = stamp();
    const { data: run, error } = await admin.from("agent_runs").insert({ workspace_id: ws, kind: "watch", prompt, lang, state: startState([], prompt), heartbeat_at: ticket, ...(title ? { title } : {}) }).select("id").single();
    if (error) return fail(500, "upstream_error", "Couldn't start the check.");
    bg(work(run.id, null, ticket));
    return json(202, { id: run.id });
  }

  // start_chat: a Placetta teammate asked Odelia in the business's own Slack, Lark or WeChat (chat-events, with the
  // monitor key, which has matched the sender to this member). The job runs as them; the answer goes back to the same
  // thread or chat.
  if (action === "start_chat") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
    const uid = String(body.user_id ?? ""), ws = String(body.workspace_id ?? "");
    const channel = isChatKind(body.channel) ? body.channel : null;
    const to = body.chat_to as ChatTo | undefined;
    const zh = body.lang === "zh";
    if (!UUID.test(uid) || !UUID.test(ws) || !channel || !to || to.kind !== channel) return fail(400, "bad_request", "user_id, workspace_id, channel and chat_to are required.");
    if (!chatToOk(to)) return fail(400, "bad_request", "chat_to isn't a place this chat can answer.");
    const may = await mayUseAgent(admin, ws, uid);
    if (may === "not_member") return fail(403, "forbidden", zh ? "您不是这个快哉工作区的成员。负责人可以在快哉中邀请您。" : "You're not a member of this Placetta workspace. The owner can invite you in Placetta.");
    if (may === "no_plan") return fail(402, "payment_required", zh ? "Odelia 需要先开通入门套餐。请在快哉中选择套餐。" : "Odelia starts with the entry plan. Choose a plan in Placetta.");
    if (!configured()) return fail(503, "not_configured", zh ? "此账户的 Odelia 尚未开通，快哉团队已收到通知。" : "Odelia isn't switched on for this account yet. Placetta's team has been told.");
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    if (!prompt) return fail(400, "bad_request", "prompt is required.");
    // a repeat joins the run still going, before the gate and the capacity check (see "start")
    const key = await repeatKey(prompt, []);
    const again = await repeated(ws, key, channel);
    if (again) return json(202, { id: again, repeated: true });
    // a person's jobs from one chat, at most CHAT_JOBS_PER_HOUR (a stuck script or a loop between two bots stops here)
    const { data: allowed } = await admin.rpc("rate_hit", { p_key: `chat_job:${channel}:${ws}:${uid}`, p_limit: CHAT_JOBS_PER_HOUR, p_window_seconds: 3600 });
    if (allowed === false) return fail(429, "rate_limited", chatRateLimited(zh ? "zh" : "en"));
    const tg = await gate(admin, (k) => Deno.env.get(k), ws, uid, "task");
    if (!tg.ok) return fail(tg.status, tg.code, tg.message);
    if (await atCapacity(ws)) return fail(409, "busy", BUSY_MSG);
    const ticket = stamp();
    // the same person's recent requests from the other channels come along (_shared/continuity.ts)
    const history = await recentTurns(admin, ws, uid, channel, zh ? "zh" : "en").catch(() => []);
    const { data: run, error } = await admin.from("agent_runs").insert({
      workspace_id: ws, created_by: uid, kind: "task", prompt, lang: zh ? "zh" : "en", deep: false,
      state: startState(history, prompt), channel, chat_to: to, heartbeat_at: ticket, dedupe: key,
    }).select("id").single();
    if (error) return fail(500, "upstream_error", "Couldn't start the agent.");
    bg(work(run.id, null, ticket));
    return json(202, { id: run.id });
  }

  // start_as: someone texted or called Odelia from their verified number (odelia-sms and odelia-voice), or emailed her
  // from the address they sign in with (odelia-mail), with the monitor key
  if (action === "start_as") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
    const uid = String(body.user_id ?? ""), ws = String(body.workspace_id ?? "");
    const channel = body.channel === "voice" ? "voice" : body.channel === "sms" ? "sms" : body.channel === "email" ? "email" : null;
    const replyTo = channel === "email" ? String(body.reply_to ?? "").trim().toLowerCase() : normalizePhone(body.reply_to);
    if (!UUID.test(uid) || !UUID.test(ws) || !channel || !replyTo) return fail(400, "bad_request", "user_id, workspace_id, channel and reply_to are required.");
    // The number must still be this person's verified number (or the address their account signs in with), and they
    // must still be a member with a plan.
    if (channel === "email") {
      const { data: u } = await admin.auth.admin.getUserById(uid);
      if (String(u?.user?.email ?? "").toLowerCase() !== replyTo) return fail(403, "forbidden", "That isn't this person's address.");
    } else {
      const link = await linkOf(admin, uid);
      if (!link?.verified_at || link.number !== replyTo) return fail(403, "forbidden", "That number isn't linked to this person.");
    }
    const may = await mayUseAgent(admin, ws, uid);
    if (may === "not_member") return fail(403, "forbidden", "This isn't their workspace.");
    if (may === "no_plan") return fail(402, "payment_required", "Get the entry plan to start the agent.");
    if (!configured()) return (console.error("not configured: add a model key in the Edge Function secrets"), fail(503, "not_configured", "The agent isn't set up on the server yet. Placetta's team has been told."));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    if (!prompt) return fail(400, "bad_request", "prompt is required.");
    const history = (Array.isArray(body.history) ? body.history : []).filter((t: { role?: string; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-8)
      .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 2000) }));
    // A text by plain SMS (whose sender is easy to forge) only reads and drafts. odelia-sms says which it was; when it
    // doesn't say, a text counts as plain SMS.
    const plainSms = channel === "sms" && body.plain_sms !== false;
    // a repeat joins the run still going, before the gate and the capacity check (see "start")
    const key = await repeatKey(prompt, history);
    const again = await repeated(ws, key, channel);
    if (again) return json(202, { id: again, repeated: true });
    const tg = await gate(admin, (k) => Deno.env.get(k), ws, uid, "task");
    if (!tg.ok) return fail(tg.status, tg.code, tg.message);
    if (await atCapacity(ws)) return fail(409, "busy", BUSY_MSG);
    const ticket = stamp();
    // one conversation across channels: their recent requests and answers from anywhere they may carry from
    // (_shared/continuity.ts); a text's own thread (odelia-sms) when there are none
    const carried = await recentTurns(admin, ws, uid, channel, body.lang === "zh" ? "zh" : "en").catch(() => []);
    const { data: run, error } = await admin.from("agent_runs").insert({
      workspace_id: ws, created_by: uid, kind: "task", prompt, lang: body.lang === "zh" ? "zh" : "en", deep: false,
      state: { ...startState(carried.length ? carried : history, prompt), ...(plainSms ? { plainSms: true } : {}) }, channel, reply_to: replyTo, heartbeat_at: ticket, dedupe: key,
    }).select("id").single();
    if (error) return fail(500, "upstream_error", "Couldn't start the agent.");
    await admin.from("phone_links").update({ last_workspace_id: ws }).eq("user_id", uid);
    // No session token: connected apps (mail, drives) act as the person and stay with runs started in the app.
    bg(work(run.id, null, ticket));
    return json(202, { id: run.id });
  }

  // start: a member asks the agent for something
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  const ws = String(body.workspace_id ?? "");
  if (!UUID.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
  const { data: access, error: accessError } = await accessRpc(admin, ws, user.id, jwt);
  if (accessError) return fail(500, "upstream_error", "Couldn't check access.");
  if (access === "mfa_required" || access === "staff_mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access === "sso_required") return fail(401, "sso_required", "Your company requires single sign-on. Sign in with SSO to continue.");
  if (access === "none") return fail(403, "forbidden", "This isn't your workspace.");
  // a task changes the workspace: viewers read it but don't start one
  if (access !== "staff" && !WORKS.has(String(access))) return fail(403, "forbidden", "You can view this workspace but not change it. Ask an admin for member access.");
  if (access !== "staff") {
    const { data: plan } = await admin.rpc("plan_of", { ws });
    if (plan === "none") return fail(402, "payment_required", "Get the entry plan to start the agent.");
  }
  if (!configured()) return (console.error("not configured: add a model key in the Edge Function secrets"), fail(503, "not_configured", "The agent isn't set up on the server yet. Placetta's team has been told."));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) return fail(400, "bad_request", "prompt is required.");
  // "/apply" and "/go" carry out an owner's approval (held changes, an approved plan: src/held.ts): only an owner starts them
  if (/^\s*\/(apply|go)\b/i.test(prompt)) {
    const { data: mine } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
    if (mine?.role !== "owner") return fail(403, "forbidden", "Only an owner of this workspace can approve that.");
  }
  const history = (Array.isArray(body.history) ? body.history : []).filter((t: { role?: string; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-12)
    .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  // the same request again within ten minutes: the earlier run, whose reply the app shows. Checked before the gate and
  // the capacity check, so a double tap neither counts as another task nor gets "busy" for the run it already started.
  const key = await repeatKey(prompt, history);
  const again = await repeated(ws, key, "app");
  if (again) return json(202, { id: again, repeated: true });
  const tg = await gate(admin, (k) => Deno.env.get(k), ws, user.id, "task");
  if (!tg.ok) return fail(tg.status, tg.code, tg.message);
  // several jobs at once, up to ODELIA_PARALLEL per workspace (3 by default)
  if (await atCapacity(ws)) return fail(409, "busy", BUSY_MSG);
  const ticket = stamp();
  const { data: run, error } = await admin.from("agent_runs").insert({
    workspace_id: ws, created_by: user.id, kind: "task", prompt, lang: body.lang === "zh" ? "zh" : "en", deep: body.deep === true,
    state: startState(history, prompt), seen_at: new Date().toISOString(), heartbeat_at: ticket, dedupe: key,
    // "don't remember this chat" (only sent when on, so a database without the column still starts runs)
    ...(body.no_memory === true ? { no_memory: true } : {}),
  }).select("id").single();
  if (error) return fail(500, "upstream_error", "Couldn't start the agent.");
  bg(work(run.id, jwt, ticket));
  return json(202, { id: run.id });
}

if (import.meta.main) Deno.serve(handle);
