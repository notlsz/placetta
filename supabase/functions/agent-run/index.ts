// agent-run: the agent working on the server, so a task carries on after the person closes the app.
// It runs the same tools and instructions as the app (agent.js, built from src/ by `npm run build:agent`), with the
// company's Claude key and research on official sites. Work is saved after every round: the workspace (merged with
// anything the person changed meanwhile), the audit trail, and the run's conversation. A run that nears the time limit
// is saved and picked up again by a fresh instance; a watchdog resumes runs whose instance died.
//
// POST {action: "start", workspace_id, prompt, history?, lang?, deep?}         a member (Supabase session)
// POST {action: "continue", run_id, token?} | {action: "watchdog"} | {action: "watch", workspace_id}   the server itself (monitor key)
// POST {action: "selftest"}   the monitor key: short real-model runs on in-memory scratch workspaces (selftest.ts);
//                             returns {ok, model, checks: [{name, pass, detail, ms}], total_ms} in under 140 s
// POST {action: "start_as", user_id, workspace_id, prompt, channel: "sms"|"voice", reply_to, history?, lang?}
//      odelia-sms and odelia-voice (monitor key), for a person who texted or called from their verified number. The
//      same member and plan checks as "start"; the answer is texted to reply_to when the run finishes.
// The app polls a run with the poll_agent_run RPC and stops one with stop_agent_run. When nobody is watching as it
// finishes, the result becomes an Update and the owners get an email (with RESEND_API_KEY and MAIL_FROM set).
import { createClient } from "npm:@supabase/supabase-js@2";
import { callModel } from "../_shared/llm.ts";
import { gate, record } from "../_shared/ai_gate.ts";
import { appLink, appOrigin, normalizePhone, SAY, splitSms } from "../_shared/odelia.ts";
import { linkOf, mayUseAgent, textUser } from "../_shared/odelia_db.ts";
// @ts-types="./agent.d.ts"
import { normalizeState, runRounds, startState, stripState, type Reply, type RunState, type Services, type Step } from "./agent.js";
import { selftest, SELFTEST_NAMES } from "./selftest.ts";

type Workspace = ReturnType<typeof normalizeState>;
type Patch = (w: Workspace) => Workspace;
type Block = Record<string, unknown>;
type Run = { id: string; workspace_id: string; created_by: string | null; kind: "task" | "watch"; prompt: string; lang: "en" | "zh"; deep: boolean; status: string; steps: Step[]; state: RunState | null; attempts: number; seen_at: string | null; heartbeat_at: string; channel?: "app" | "sms" | "voice"; reply_to?: string | null };

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
/** One task's ceiling: a task that costs more than this stops and says so, so a loop can't eat a month's budget. */
const TASK_LIMIT_USD = Number(env("AI_TASK_LIMIT_USD", "1.5"));
const MODEL = env("AGENT_MODEL", "claude-sonnet-5-5"), MODEL_DEEP = env("AGENT_MODEL_DEEP", "claude-opus-5-5");
/** The model for texts and calls, where a fast answer matters most. Same as AGENT_MODEL unless set (e.g. a faster model). */
const MODEL_PHONE = env("AGENT_MODEL_PHONE", "") || MODEL;
/** Work per instance before saving and handing over (the free plan stops an instance at 150 s). */
const CHUNK_MS = Number(env("AGENT_CHUNK_SECONDS", "70")) * 1000;
const STALE_MS = 3 * 60_000, MAX_ATTEMPTS = 8;
const FETCH_BETA = "web-fetch-2025-09-10";
const MAX_TOOLS = 48;
const MODEL_KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });
const err = (code: string, message: string) => Object.assign(new Error(message), { code });
const bg = (p: Promise<unknown>) => { const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime; if (rt) rt.waitUntil(p); else void p; };

/* ------------------------------ who's asking ------------------------------ */

function aalOf(jwt: string): string {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch { return "aal1"; }
}
async function monitorKeyOk(req: Request) {
  const { data } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") ?? "" });
  return data === true;
}
let selfKey: string | null = null;
async function monitorKey() {
  if (!selfKey) { const { data } = await admin.rpc("monitor_key"); selfKey = typeof data === "string" ? data : ""; }
  return selfKey;
}
/** Hand the run to a fresh instance. */
async function handOver(runId: string, token: string | null) {
  await fetch(`${SUPABASE_URL}/functions/v1/agent-run`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-monitor-key": await monitorKey() },
    body: JSON.stringify({ action: "continue", run_id: runId, ...(token ? { token } : {}) }),
  }).catch((e) => console.error("hand over", String(e).slice(0, 120)));
}

/* ------------------------------ the model ------------------------------ */


/** One model call: the company key, research on official sites, the daily limit and usage, as in the agent function. */
async function model(ws: string, body: Record<string, unknown>, deep: boolean, location: { city?: string; region?: string } | undefined, signal: AbortSignal, phone = false, who: { uid: string | null; spent: number } = { uid: null, spent: 0 }) {
  const standard = phone ? MODEL_PHONE : MODEL;
  if (signal.aborted) throw err("cancelled", "Stopped");
  if (!MODEL_KEYS.some((k) => env(k)))
    throw err("not_configured", "Add a model key (for example ANTHROPIC_API_KEY) in the Edge Function secrets.");
  if (who.spent >= TASK_LIMIT_USD) throw err("task_limit", "This task grew too large for one go, so I stopped here. Ask for the next part on its own.");
  // budget, rate limits and the company's ceiling; past 80% of the budget, no deep model
  const g = await gate(admin, (k) => Deno.env.get(k), ws, who.uid, "call");
  if (!g.ok) throw err(g.code, g.message);
  if (g.tier === "reduced") deep = false;
  // Odelia has about 31 tools in a signed-in workspace; a cap of 24 silently dropped email, calendar, drive and QuickBooks.
  const pageTools = (Array.isArray(body.tools) ? (body.tools as Block[]) : []).filter((t) => t && typeof t.name === "string" && !("type" in t)).slice(0, MAX_TOOLS);
  const research = pageTools.length > 0 || deep;
  const userLocation = location?.city ? { type: "approximate", city: String(location.city).slice(0, 80), region: String(location.region ?? "").slice(0, 80) || undefined, country: "US" } : undefined;
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 5, ...(userLocation ? { user_location: userLocation } : {}) };
  const fetchTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, citations: { enabled: true }, max_content_tokens: 24000 };
  const payload: Record<string, unknown> = { model: deep ? MODEL_DEEP : standard, max_tokens: Math.min(Math.max(Number(body.max_tokens) || 2000, 256), 4000), messages: body.messages };
  if (typeof body.system === "string" && body.system) payload.system = body.system.slice(0, 80000);
  const tools = [...pageTools, ...(research ? [search, fetchTool] : [])];
  if (tools.length) payload.tools = tools;
  const out = await callModel((k) => Deno.env.get(k), { payload, tier: deep ? "deep" : "standard", research, beta: research ? FETCH_BETA : null }, deep ? MODEL_DEEP : standard,
    research ? { search, fetch: fetchTool, pageTools } : null);
  if (!out.ok) {
    console.error("models", out.model, out.status, out.text.slice(0, 300));
    throw out.status === 429 || out.status === 529 ? err("rate_limited", "The agent is busy. Try again in a moment.") : err(out.status === 401 || out.status === 503 ? "not_configured" : "upstream_error", "Couldn't reach the agent's model. Try again.");
  }
  const data = out.data as { content: Block[]; stop_reason: string; usage?: Record<string, never> };
  who.spent += await record(admin, g.event, out.model, data.usage);
  return data as { content: never[]; stop_reason: string };
}

/* ------------------------------ the account's hands ------------------------------ */

const safeName = (n: string) => n.replace(/[^\w.\-一-鿿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";

async function servicesFor(ws: string, run: Run, token: string | null): Promise<Services> {
  const { data: filings } = await admin.from("filings").select("app_id, status, confirmation_number, submitted_at, updated_at, note, payment_url, agent_state, channel, agent_log").eq("workspace_id", ws).order("approved_at", { ascending: false });
  // Connected apps act as the person, so they need the person's session: runs the monitor starts don't touch them.
  const { data: ints } = token ? await admin.from("integrations").select("kind, status").eq("workspace_id", ws) : { data: [] as { kind: string; status: string }[] };
  return {
    filings: () => (filings ?? []) as ReturnType<Services["filings"]>,
    connected: () => (ints ?? []).filter((i) => i.status === "connected").map((i) => i.kind),
    async integration<T>(action: string, body: Record<string, unknown>) {
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
    async readFile(path: string) {
      if (!path.startsWith(ws + "/")) throw new Error("That file belongs to another workspace.");
      const { data, error } = await admin.storage.from("documents").download(path);
      if (error || !data) throw new Error("Couldn't open the file.");
      return data;
    },
  };
}

/* ------------------------------ a run ------------------------------ */

const short = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const WATCH = {
  en: (what: string, where: string) => `Weekly check, in the background. 1) For each application that has been submitted or approved, look up its current status on the agency's own public lookup or records page (search the agency's site with the business name, license number or confirmation number) and compare it with the workspace. 2) Search official government sources for new or changed requirements, fees, inspections or deadlines in the last month that affect a ${what || "business like this one"} in ${where || "its city"}. Add a deadline for any new due date. Report only what changed, each with its source. If nothing changed, reply exactly: No changes.`,
  zh: (what: string, where: string) => `每周后台检查。1）对每项已提交或已批准的申请，在该机构官方的公开查询或记录页面（用企业名称、执照号或确认号在机构网站搜索）查看当前状态，并与工作区对比。2）在政府官方来源中查找近一个月内影响${where || "所在城市"}${what || "此类企业"}的新增或变更的要求、费用、检查或截止日期。如有新的截止日期，请添加。只报告变化，并注明来源。如果没有变化，请只回复：No changes。`,
};

async function sendMail(to: string[], subject: string, text: string) {
  const key = env("RESEND_API_KEY"), from = env("MAIL_FROM");
  if (!key || !from || !to.length) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, subject, text }) });
  if (!res.ok) console.error("resend", res.status);
  return res.ok;
}

/** Work on a run until it's done, stopped, or time to hand over. */
export async function work(runId: string, token: string | null) {
  const { data: run } = await admin.from("agent_runs").select("*").eq("id", runId).maybeSingle() as { data: Run | null };
  if (!run || run.status !== "running") return;
  const ws = run.workspace_id;
  await admin.from("agent_runs").update({ attempts: run.attempts + 1, heartbeat_at: new Date().toISOString() }).eq("id", runId);
  const until = Date.now() + CHUNK_MS;

  const { data: row } = await admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle();
  if (!row) { await admin.from("agent_runs").update({ status: "failed", error: "The workspace is gone." }).eq("id", runId); return; }
  let cur: Workspace = normalizeState(row.name, row.state ?? {});
  const pending: Patch[] = [];
  const steps: Step[] = Array.isArray(run.steps) ? [...run.steps] : [];
  let draft: string | null = null, flushT: ReturnType<typeof setTimeout> | undefined, flushing: PromiseLike<unknown> = Promise.resolve();
  const flush = (now = false) => {
    const go = () => { flushing = admin.from("agent_runs").update({ steps, draft, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).then((r) => r); };
    clearTimeout(flushT);
    if (now) go(); else flushT = setTimeout(go, 600);
  };
  // Save the agent's changes onto the newest saved state (the person may have changed things meanwhile), and log them.
  // One save at a time; each takes the patches made so far.
  let chain: Promise<void> = Promise.resolve();
  const commit = () => (chain = chain.then(async () => {
    const batch = pending.splice(0);
    if (!batch.length) return;
    const { data: fresh } = await admin.from("workspaces").select("name, state").eq("id", ws).maybeSingle();
    let w = normalizeState(fresh?.name ?? row.name, fresh?.state ?? {});
    for (const p of batch) w = p(w);
    const audit = w.audit.filter((a) => a.actor === "agent" || a.actor === "you").map((a) => ({ workspace_id: ws, client_id: a.id, actor: a.actor, actor_id: run.created_by, action: a.action, object: a.object, detail: a.detail ?? null }));
    if (audit.length) await admin.from("audit_log").upsert(audit, { onConflict: "workspace_id,client_id", ignoreDuplicates: true });
    const { error } = await admin.from("workspaces").update({ state: stripState(w) }).eq("id", ws);
    if (error) { pending.unshift(...batch); throw new Error("save failed: " + error.code); }
  }).catch((e) => console.error("commit", runId, String(e).slice(0, 160))));

  // stop when the person says so
  const ctl = new AbortController();
  const watchStop = setInterval(async () => {
    const { data } = await admin.from("agent_runs").select("status").eq("id", runId).maybeSingle();
    if (data?.status !== "running") ctl.abort();
  }, 3000);

  try {
    const svc = await servicesFor(ws, run, token);
    const who = { uid: run.created_by, spent: 0 };
    const state = run.state ?? startState([], run.prompt);
    const location = cur.meta?.city ? { city: cur.meta.city, region: cur.meta.region } : undefined;
    const out = await runRounds({
      state, ws: () => cur, lang: run.lang, deep: run.deep, account: true, svc, signal: ctl.signal, until,
      apply: (p) => { cur = p(cur); pending.push(p); },
      step: (s) => { steps.push(s); flush(); },
      // after each round: save the work and where the conversation is, so a fresh instance can carry on
      round: async (st) => { await commit(); await admin.from("agent_runs").update({ state: st, steps, draft, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "running"); },
      draft: (t) => { draft = t; flush(); },
      send: (body, deep) => model(ws, body, deep, location, ctl.signal, run.channel === "sms" || run.channel === "voice", who) as never,
      channel: run.channel === "sms" || run.channel === "voice" ? run.channel : undefined,
    });
    await commit();
    if ("paused" in out) {
      await admin.from("agent_runs").update({ state: out.paused, steps, draft, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
      await handOver(runId, token);
      return;
    }
    await finish(run, out.reply, steps);
  } catch (e) {
    await commit().catch(() => undefined);
    const code = (e as { code?: string }).code;
    if (code === "cancelled" || ctl.signal.aborted) await admin.from("agent_runs").update({ steps, draft: null, state: null, updated_at: new Date().toISOString() }).eq("id", runId);
    else {
      console.error("run failed", runId, code, String((e as Error)?.message ?? e).slice(0, 200));
      const { data: failed } = await admin.from("agent_runs").update({ status: "failed", error: ["rate_limited", "not_configured", "over_budget", "plan_required", "entry_ended", "paused", "task_limit"].includes(code ?? "") ? (e as Error).message : "The agent hit a problem and stopped. Try again.", steps, state: null, updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "running").select("id");
      // Someone who asked by text or on a call hears about it the same way.
      if (failed?.length) await textBack(run, SAY.failed[run.lang], []).catch((x) => console.error("text back", String(x).slice(0, 120)));
    }
  } finally {
    clearInterval(watchStop); clearTimeout(flushT); await flushing;
  }
}

/**
 * The answer to someone who texted or called: plain text, at most three messages, ending with the link to the exact
 * approval waiting in the app (or the app, when there are several or the answer runs long). Nothing is approved by text.
 */
async function textBack(run: Run, text: string, approvals: string[]) {
  if ((run.channel !== "sms" && run.channel !== "voice") || !run.reply_to || !run.created_by) return;
  const link = await linkOf(admin, run.created_by);
  // Only ever to the number this person verified, and only while it's still theirs.
  if (!link?.verified_at || link.number !== normalizePhone(run.reply_to)) return;
  const origin = appOrigin(env);
  const approve = approvals.length ? appLink(origin, run.workspace_id, approvals.length === 1 ? approvals[0] : "ready") : "";
  const segments = splitSms(text, { max: 3, lang: run.lang, more: appLink(origin, run.workspace_id), tail: approve ? `${SAY.approve[run.lang]} ${approve}` : undefined });
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

async function finish(run: Run, reply: Reply, steps: Step[]) {
  const now = new Date().toISOString();
  await admin.from("agent_runs").update({ status: "done", reply, steps, draft: null, state: null, updated_at: now }).eq("id", run.id).eq("status", "running");
  const said = reply.text.map((t) => t.en).join(" ").trim();
  // Asked by text or on a call: the answer goes back by text, which is where they're watching.
  if (run.channel === "sms" || run.channel === "voice") {
    await textBack(run, reply.text.map((t) => t[run.lang] || t.en).join("\n\n").trim() || SAY.ack[run.lang], reply.approvals ?? []).catch((e) => console.error("text back", String(e).slice(0, 120)));
    return;
  }
  if (run.kind === "watch" && /^no changes\.?$/i.test(said)) return;
  // Someone watching in the app already sees it; otherwise it becomes an Update and an email.
  const { data: seen } = await admin.from("agent_runs").select("seen_at").eq("id", run.id).maybeSingle();
  if (run.kind === "task" && seen?.seen_at && Date.now() - Date.parse(seen.seen_at) < 20_000) return;
  const title = run.kind === "watch"
    ? { en: "Weekly check: something changed", zh: "每周检查：有变化" }
    : { en: `Placetta finished: ${short(run.prompt)}`, zh: `快哉已完成：${short(run.prompt)}` };
  const zh = reply.text.map((t) => t.zh).join(" ").trim();
  await admin.from("updates").upsert({ workspace_id: run.workspace_id, kind: "agent", title, body: { en: short(said, 600), zh: short(zh, 600) }, dedupe: `run:${run.id}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", run.workspace_id).eq("role", "owner");
  const emails: string[] = [];
  for (const o of owners ?? []) { const { data } = await admin.auth.admin.getUserById(o.user_id); if (data?.user?.email && data.user.email_confirmed_at) emails.push(data.user.email); }
  const waiting = (reply.approvals ?? []).length;
  const app = (env("APP_ORIGINS").split(",")[0] ?? "").trim().replace(/\/+$/, "");
  await sendMail(emails, title.en, `${said}${waiting ? `\n\n${waiting} item${waiting === 1 ? "" : "s"} waiting for your approval.` : ""}${app ? `\n\nOpen Placetta: ${app}/app/` : ""}\n`);
  await queueApprovalTexts(run, title, reply.approvals ?? []).catch((e) => console.error("approval texts", String(e).slice(0, 120)));
}

/* ------------------------------ requests ------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  const action = String(body.action ?? "start");

  if (action === "continue" || action === "watchdog" || action === "watch" || action === "selftest") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
    if (action === "selftest") {
      // short real-model runs on scratch workspaces held in memory: no workspace is read or written
      // {probe: true}: which server secrets are set (names and yes/no only, never a value), and the checks there are
      if (body.probe) {
        const names = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "AGENT_MODEL", "AGENT_ROUTE",
          "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ENTRY", "STRIPE_PRICE_LOCATION", "STRIPE_PRICE_LOCATION_PRO", "STRIPE_PRICE_OPENING", "STRIPE_PRICE_OPENING_FOOD", "STRIPE_PRICE_PACK", "STRIPE_PRICE_GUARANTEE",
          "RESEND_API_KEY", "MAIL_FROM", "APP_ORIGINS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "QB_CLIENT_ID", "OAUTH_STATE_SECRET",
          "TELNYX_API_KEY", "TELNYX_FAX_CONNECTION_ID", "TELNYX_MESSAGING_PROFILE_ID", "TELNYX_VOICE_CONNECTION_ID", "ODELIA_NUMBER", "LOB_API_KEY", "FILER_SECRET", "AZURE_SPEECH_KEY"];
        return json(200, { secrets: Object.fromEntries(names.map((n) => [n, !!env(n)])), checks: SELFTEST_NAMES() });
      }
      if (!MODEL_KEYS.some((k) => env(k))) return json(200, { ok: false, model: null, checks: [{ name: "a model key is set", pass: false, detail: "Add ANTHROPIC_API_KEY (or another model key) in the Edge Function secrets.", ms: 0 }], total_ms: 0 });
      return json(200, await selftest((k) => Deno.env.get(k), { budgetMs: Number(body.budget_ms) || undefined, only: Array.isArray(body.only) ? body.only.map(String) : undefined, model: typeof body.model === "string" ? body.model : undefined }));
    }
    if (action === "continue") {
      const id = String(body.run_id ?? "");
      if (!UUID.test(id)) return fail(400, "bad_request", "run_id is required.");
      bg(work(id, typeof body.token === "string" ? body.token : null));
      return json(202, { ok: true });
    }
    if (action === "watchdog") {
      const { data: stale } = await admin.from("agent_runs").select("id, attempts").eq("status", "running").lt("heartbeat_at", new Date(Date.now() - STALE_MS).toISOString()).limit(20);
      for (const r of stale ?? []) {
        if (r.attempts >= MAX_ATTEMPTS) await admin.from("agent_runs").update({ status: "failed", error: "The agent stopped responding. Try again." }).eq("id", r.id);
        else await handOver(r.id, null);
      }
      return json(200, { ok: true, resumed: (stale ?? []).length });
    }
    // watch: the weekly background check the monitor starts
    const ws = String(body.workspace_id ?? "");
    if (!UUID.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
    const { data: w } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
    const meta = ((w?.state ?? {}) as { meta?: { city?: string; region?: string; what?: string } }).meta ?? {};
    const lang = body.lang === "zh" ? "zh" : "en";
    const where = [meta.city, meta.region].filter(Boolean).join(", ");
    const prompt = WATCH[lang](meta.what ?? "", where);
    const { data: run, error } = await admin.from("agent_runs").insert({ workspace_id: ws, kind: "watch", prompt, lang, state: startState([], prompt) }).select("id").single();
    if (error) return fail(500, "upstream_error", "Couldn't start the check.");
    bg(work(run.id, null));
    return json(202, { id: run.id });
  }

  // start_as: someone texted or called Odelia from their verified number (odelia-sms and odelia-voice, with the monitor key)
  if (action === "start_as") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
    const uid = String(body.user_id ?? ""), ws = String(body.workspace_id ?? "");
    const channel = body.channel === "voice" ? "voice" : body.channel === "sms" ? "sms" : null;
    const replyTo = normalizePhone(body.reply_to);
    if (!UUID.test(uid) || !UUID.test(ws) || !channel || !replyTo) return fail(400, "bad_request", "user_id, workspace_id, channel and reply_to are required.");
    // The number must still be this person's verified number, and they must still be a member with a plan.
    const link = await linkOf(admin, uid);
    if (!link?.verified_at || link.number !== replyTo) return fail(403, "forbidden", "That number isn't linked to this person.");
    const may = await mayUseAgent(admin, ws, uid);
    if (may === "not_member") return fail(403, "forbidden", "This isn't their workspace.");
    if (may === "no_plan") return fail(402, "payment_required", "Get the entry plan to start the agent.");
    if (!MODEL_KEYS.some((k) => env(k))) return fail(503, "not_configured", "Add a model key (ANTHROPIC_API_KEY or GEMINI_API_KEY) in the Edge Function secrets.");
    const tg = await gate(admin, (k) => Deno.env.get(k), ws, uid, "task");
    if (!tg.ok) return fail(tg.status, tg.code, tg.message);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
    if (!prompt) return fail(400, "bad_request", "prompt is required.");
    const { data: busy } = await admin.from("agent_runs").select("id").eq("workspace_id", ws).eq("kind", "task").eq("status", "running").gt("heartbeat_at", new Date(Date.now() - STALE_MS).toISOString()).limit(1);
    if (busy?.length) return fail(409, "busy", "Placetta is still working on the last task.");
    const history = (Array.isArray(body.history) ? body.history : []).filter((t: { role?: string; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-8)
      .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 2000) }));
    const { data: run, error } = await admin.from("agent_runs").insert({
      workspace_id: ws, created_by: uid, kind: "task", prompt, lang: body.lang === "zh" ? "zh" : "en", deep: false,
      state: startState(history, prompt), channel, reply_to: replyTo,
    }).select("id").single();
    if (error) return fail(500, "upstream_error", "Couldn't start the agent.");
    await admin.from("phone_links").update({ last_workspace_id: ws }).eq("user_id", uid);
    // No session token: connected apps (mail, drives) act as the person and stay with runs started in the app.
    bg(work(run.id, null));
    return json(202, { id: run.id });
  }

  // start: a member asks the agent for something
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");
  const ws = String(body.workspace_id ?? "");
  if (!UUID.test(ws)) return fail(400, "bad_request", "workspace_id is required.");
  const { data: access, error: accessError } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (accessError) return fail(500, "upstream_error", "Couldn't check access.");
  if (access === "mfa_required" || access === "staff_mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access === "none") return fail(403, "forbidden", "This isn't your workspace.");
  if (access !== "staff") {
    const { data: plan } = await admin.rpc("plan_of", { ws });
    if (plan === "none") return fail(402, "payment_required", "Get the entry plan to start the agent.");
  }
  if (!MODEL_KEYS.some((k) => env(k))) return fail(503, "not_configured", "Add a model key (ANTHROPIC_API_KEY or GEMINI_API_KEY) in the Edge Function secrets.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) return fail(400, "bad_request", "prompt is required.");
  const tg = await gate(admin, (k) => Deno.env.get(k), ws, user.id, "task");
  if (!tg.ok) return fail(tg.status, tg.code, tg.message);
  // one task at a time per workspace
  const { data: busy } = await admin.from("agent_runs").select("id").eq("workspace_id", ws).eq("kind", "task").eq("status", "running").gt("heartbeat_at", new Date(Date.now() - STALE_MS).toISOString()).limit(1);
  if (busy?.length) return fail(409, "busy", "Placetta is still working on the last task.");
  const history = (Array.isArray(body.history) ? body.history : []).filter((t: { role?: string; content?: unknown }) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string").slice(-12)
    .map((t: { role: "user" | "assistant"; content: string }) => ({ role: t.role, content: t.content.slice(0, 4000) }));
  const { data: run, error } = await admin.from("agent_runs").insert({
    workspace_id: ws, created_by: user.id, kind: "task", prompt, lang: body.lang === "zh" ? "zh" : "en", deep: body.deep === true,
    state: startState(history, prompt), seen_at: new Date().toISOString(),
  }).select("id").single();
  if (error) return fail(500, "upstream_error", "Couldn't start the agent.");
  bg(work(run.id, jwt));
  return json(202, { id: run.id });
}

if (import.meta.main) Deno.serve(handle);
