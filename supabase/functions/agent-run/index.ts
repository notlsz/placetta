// agent-run: the agent working on the server, so a task carries on after the person closes the app.
// It runs the same tools and instructions as the app (agent.js, built from src/ by `npm run build:agent`), with the
// company's Claude key and research on official sites. Work is saved after every round: the workspace (merged with
// anything the person changed meanwhile), the audit trail, and the run's conversation. A run that nears the time limit
// is saved and picked up again by a fresh instance; a watchdog resumes runs whose instance died.
//
// POST {action: "start", workspace_id, prompt, history?, lang?, deep?}         a member (Supabase session)
// POST {action: "continue", run_id, token?} | {action: "watchdog"} | {action: "watch", workspace_id}   the server itself (monitor key)
// The app polls a run with the poll_agent_run RPC and stops one with stop_agent_run. When nobody is watching as it
// finishes, the result becomes an Update and the owners get an email (with RESEND_API_KEY and MAIL_FROM set).
import { createClient } from "npm:@supabase/supabase-js@2";
// @ts-types="./agent.d.ts"
import { normalizeState, runRounds, startState, stripState, type Reply, type RunState, type Services, type Step } from "./agent.js";

type Workspace = ReturnType<typeof normalizeState>;
type Patch = (w: Workspace) => Workspace;
type Block = Record<string, unknown>;
type Run = { id: string; workspace_id: string; created_by: string | null; kind: "task" | "watch"; prompt: string; lang: "en" | "zh"; deep: boolean; status: string; steps: Step[]; state: RunState | null; attempts: number; seen_at: string | null; heartbeat_at: string };

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const DAILY_CALLS = Number(env("AGENT_DAILY_CALLS", "400"));
const MODEL = env("AGENT_MODEL", "claude-sonnet-5-5"), MODEL_DEEP = env("AGENT_MODEL_DEEP", "claude-opus-5-5");
/** Work per instance before saving and handing over (the free plan stops an instance at 150 s). */
const CHUNK_MS = Number(env("AGENT_CHUNK_SECONDS", "70")) * 1000;
const STALE_MS = 3 * 60_000, MAX_ATTEMPTS = 8;
const FETCH_BETA = "web-fetch-2025-09-10";
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

async function callClaude(key: string, payload: Record<string, unknown>, beta: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  return { res, text: await res.text() };
}

/** One model call: the company key, research on official sites, the daily limit and usage, as in the agent function. */
async function model(ws: string, body: Record<string, unknown>, deep: boolean, location: { city?: string; region?: string } | undefined, signal: AbortSignal) {
  if (signal.aborted) throw err("cancelled", "Stopped");
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw err("not_configured", "Set ANTHROPIC_API_KEY in the Edge Function secrets.");
  const { data: usage } = await admin.from("agent_usage").select("calls").eq("workspace_id", ws).eq("day", new Date().toISOString().slice(0, 10)).maybeSingle();
  if ((usage?.calls ?? 0) >= DAILY_CALLS) throw err("rate_limited", "Today's agent limit is reached. It resets at midnight UTC.");
  const pageTools = (Array.isArray(body.tools) ? (body.tools as Block[]) : []).filter((t) => t && typeof t.name === "string" && !("type" in t)).slice(0, 24);
  const research = pageTools.length > 0 || deep;
  const userLocation = location?.city ? { type: "approximate", city: String(location.city).slice(0, 80), region: String(location.region ?? "").slice(0, 80) || undefined, country: "US" } : undefined;
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 5, ...(userLocation ? { user_location: userLocation } : {}) };
  const fetchTool = { type: "web_fetch_20250910", name: "web_fetch", max_uses: 4, citations: { enabled: true }, max_content_tokens: 24000 };
  const payload: Record<string, unknown> = { model: deep ? MODEL_DEEP : MODEL, max_tokens: Math.min(Math.max(Number(body.max_tokens) || 2000, 256), 4000), messages: body.messages };
  if (typeof body.system === "string" && body.system) payload.system = body.system.slice(0, 80000);
  const tools = [...pageTools, ...(research ? [search, fetchTool] : [])];
  if (tools.length) payload.tools = tools;
  let { res, text } = await callClaude(key, payload, research ? FETCH_BETA : null);
  if (res.status === 400 && research && /web_fetch|beta/i.test(text)) { payload.tools = [...pageTools, search]; ({ res, text } = await callClaude(key, payload, null)); }
  if (res.status === 400 && research && /web_search/i.test(text)) { payload.tools = pageTools.length ? pageTools : undefined; ({ res, text } = await callClaude(key, payload, null)); }
  if (!res.ok) {
    console.error("anthropic", res.status, text.slice(0, 300));
    throw res.status === 429 || res.status === 529 ? err("rate_limited", "Claude is busy. Try again in a moment.") : err(res.status === 401 ? "not_configured" : "upstream_error", "Couldn't reach Claude. Try again.");
  }
  const data = JSON.parse(text) as { content: Block[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } };
  await admin.rpc("track_usage", { ws, p_calls: 1, p_in: data.usage?.input_tokens ?? 0, p_out: data.usage?.output_tokens ?? 0, p_tts: 0 });
  return data as { content: never[]; stop_reason: string };
}

/* ------------------------------ the account's hands ------------------------------ */

const safeName = (n: string) => n.replace(/[^\w.\-一-鿿]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "document";

async function servicesFor(ws: string, run: Run, token: string | null): Promise<Services> {
  const { data: filings } = await admin.from("filings").select("app_id, status, confirmation_number, submitted_at, updated_at, note, payment_url").eq("workspace_id", ws).order("approved_at", { ascending: false });
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
    const state = run.state ?? startState([], run.prompt);
    const location = cur.meta?.city ? { city: cur.meta.city, region: cur.meta.region } : undefined;
    const out = await runRounds({
      state, ws: () => cur, lang: run.lang, deep: run.deep, account: true, svc, signal: ctl.signal, until,
      apply: (p) => { cur = p(cur); pending.push(p); },
      step: (s) => { steps.push(s); flush(); },
      // after each round: save the work and where the conversation is, so a fresh instance can carry on
      round: async (st) => { await commit(); await admin.from("agent_runs").update({ state: st, steps, draft, heartbeat_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "running"); },
      draft: (t) => { draft = t; flush(); },
      send: (body, deep) => model(ws, body, deep, location, ctl.signal) as never,
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
      await admin.from("agent_runs").update({ status: "failed", error: code === "rate_limited" || code === "not_configured" ? (e as Error).message : "The agent hit a problem and stopped. Try again.", steps, state: null, updated_at: new Date().toISOString() }).eq("id", runId).eq("status", "running");
    }
  } finally {
    clearInterval(watchStop); clearTimeout(flushT); await flushing;
  }
}

async function finish(run: Run, reply: Reply, steps: Step[]) {
  const now = new Date().toISOString();
  await admin.from("agent_runs").update({ status: "done", reply, steps, draft: null, state: null, updated_at: now }).eq("id", run.id).eq("status", "running");
  const said = reply.text.map((t) => t.en).join(" ").trim();
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
}

/* ------------------------------ requests ------------------------------ */

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  const action = String(body.action ?? "start");

  if (action === "continue" || action === "watchdog" || action === "watch") {
    if (!(await monitorKeyOk(req))) return fail(401, "unauthorized", "unauthorized");
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
  if (!env("ANTHROPIC_API_KEY")) return fail(503, "not_configured", "Set ANTHROPIC_API_KEY in the Edge Function secrets.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 4000) : "";
  if (!prompt) return fail(400, "bad_request", "prompt is required.");
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
