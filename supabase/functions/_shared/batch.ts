// Anthropic's Message Batches API for model calls nobody waits on: every token at 50% of the standard price
// (platform.claude.com, Batch processing, read 2026-10-28). Most batches end within an hour, all within 24 hours; results
// stay 29 days, so each batch is deleted as soon as its results are written. Not with fast mode, never streamed.
//
// Two ways to use it:
//   deferred(...)  a job that runs again later (the monitor's ticks): the first call queues the request and answers
//                  "pending"; a later call gets the result once the poller wrote it; past the request's deadline it is
//                  asked the normal way (callModel) instead, so a slow batch never makes the work late. One row per
//                  custom_id (ai_batch_jobs, 20261105090800): queuing twice, or two pollers, write once.
//   batchRun(...)  a script that can wait (QA and eval scoring, scripts/live-eval.ts): submit everything, poll until it
//                  ends or the deadline passes, then ask whatever is left the normal way.
//   pollBatches()  the monitor's tick: submits what is queued (one batch), polls what is in flight, writes the results
//                  (each row once, only while it is still "submitted"), and deletes finished batches at Anthropic.
//
// Data rules: only Anthropic runs it; with zero data retention required, only when AI_ZDR_PROVIDERS lists
// anthropic:batch (a batch is stored up to 29 days). Off unless ODELIA_BATCH=1.
import { costOf, type Usage } from "./ai_cost.ts";
import { zdrBatch } from "./zdr.ts";

type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;
const API = "https://api.anthropic.com/v1/messages/batches";

export type BatchParams = Record<string, unknown> & { model: string; max_tokens: number; messages: unknown[] };
export type Message = { content?: { type: string; text?: string }[]; usage?: Usage; stop_reason?: string };
export type Job = { custom_id: string; kind: string; workspace_id: string | null; model: string; params: BatchParams; status: "pending" | "submitted" | "done" | "failed" | "fallback" | "taken";
  batch_id: string | null; result: Message | null; usage: Usage | null; cost_usd: number | null; deadline: string };

/** What the database side does (ai_batch_jobs): tests use memory. Each write is conditional on the row's status, so a
 *  second poller or a second queue call changes nothing. */
export interface Jobs {
  get(id: string): Promise<Job | null>;
  /** Insert if absent; false when the custom_id already exists. */
  add(j: Job): Promise<boolean>;
  pending(limit: number): Promise<Job[]>;
  inFlight(): Promise<string[]>;
  /** Set fields only when the row's status is one of `when`; true when it changed. */
  set(id: string, when: Job["status"][], patch: Partial<Job>): Promise<boolean>;
}

export const batchOn = (env: Env) => env("ODELIA_BATCH") === "1" && !!env("ANTHROPIC_API_KEY") && zdrBatch(env);

/** A custom_id from a job's own key (Anthropic: 1 to 64 letters, digits, hyphens, underscores). */
export const customId = (key: string) => key.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64);

const headers = (env: Env) => ({ "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" });
/** What may go in a batch: no streaming and no fast mode (both refused by the Batches API). */
export function batchable(p: BatchParams): BatchParams {
  const { stream: _s, speed: _f, ...rest } = p as BatchParams & { stream?: unknown; speed?: unknown };
  return rest as BatchParams;
}

/** The job's result if the poller wrote it; else queued ("pending"); past its deadline, asked now (fallback). */
export async function deferred(env: Env, jobs: Jobs, o: { key: string; kind: string; workspaceId?: string | null; params: BatchParams; deadline: Date;
  now?: () => Date; call: () => Promise<{ ok: boolean; data?: Message; model: string }> }): Promise<{ status: "done" | "fallback"; data: Message; batch: boolean } | { status: "pending" }> {
  const id = customId(o.key), now = (o.now ?? (() => new Date()))();
  if (!batchOn(env)) {
    const r = await o.call();
    return r.ok && r.data ? { status: "fallback", data: r.data, batch: false } : { status: "pending" };
  }
  let j = await jobs.get(id);
  if (!j) {
    await jobs.add({ custom_id: id, kind: o.kind, workspace_id: o.workspaceId ?? null, model: o.params.model, params: batchable(o.params), status: "pending", batch_id: null, result: null, usage: null, cost_usd: null, deadline: o.deadline.toISOString() });
    j = await jobs.get(id);
  }
  if (j?.status === "done" && j.result) {
    await jobs.set(id, ["done"], { status: "taken" });
    return { status: "done", data: j.result, batch: true };
  }
  if (j && (j.status === "pending" || j.status === "submitted") && now < new Date(j.deadline)) return { status: "pending" };
  // past the deadline (or the batch failed): asked the normal way, once
  // (a model call has no side effects: a fallback that failed may be asked again on the next run)
  if (j && !(await jobs.set(id, ["pending", "submitted", "failed", "fallback"], { status: "fallback" }))) return { status: "pending" };
  const r = await o.call();
  return r.ok && r.data ? { status: "fallback", data: r.data, batch: false } : { status: "pending" };
}

/** The monitor's tick: queued requests go in one batch; batches in flight are polled; finished ones are written and
 *  deleted at Anthropic. Returns counts for the log. */
export async function pollBatches(env: Env, jobs: Jobs, f: Fetch = fetch, o: { max?: number } = {}): Promise<{ submitted: number; written: number; failed: number }> {
  const out = { submitted: 0, written: 0, failed: 0 };
  if (!batchOn(env)) return out;
  const queued = await jobs.pending(Math.min(o.max ?? 500, 10_000));
  if (queued.length) {
    const res = await f(API, { method: "POST", headers: headers(env), body: JSON.stringify({ requests: queued.map((j) => ({ custom_id: j.custom_id, params: j.params })) }) });
    if (res.ok) {
      const b = await res.json() as { id?: string };
      if (b.id) for (const j of queued) if (await jobs.set(j.custom_id, ["pending"], { status: "submitted", batch_id: b.id })) out.submitted++;
    } else console.error("batch submit", res.status, (await res.text().catch(() => "")).slice(0, 200));
  }
  for (const id of await jobs.inFlight()) {
    const st = await f(`${API}/${encodeURIComponent(id)}`, { headers: headers(env) });
    if (!st.ok) { console.error("batch status", id, st.status); continue; }
    const b = await st.json() as { processing_status?: string; results_url?: string };
    if (b.processing_status !== "ended" || !b.results_url) continue;
    const rr = await f(b.results_url, { headers: headers(env) });
    if (!rr.ok) { console.error("batch results", id, rr.status); continue; }
    for (const line of (await rr.text()).split("\n")) {
      if (!line.trim()) continue;
      let r: { custom_id?: string; result?: { type?: string; message?: Message } };
      try { r = JSON.parse(line); } catch { continue; }
      const cid = String(r.custom_id ?? "");
      if (!cid) continue;
      if (r.result?.type === "succeeded" && r.result.message) {
        const job = await jobs.get(cid);
        const usage = r.result.message.usage ?? null;
        // priced at the batch rate (half), the advisor's and cache tokens included (ai_cost.ts)
        if (await jobs.set(cid, ["submitted"], { status: "done", result: r.result.message, usage, cost_usd: costOf(`anthropic:${job?.model ?? ""}`, usage ?? undefined, new Date(), { batch: true }) })) out.written++;
      } else if (await jobs.set(cid, ["submitted"], { status: "failed" })) out.failed++;
    }
    // results written: the batch is deleted at Anthropic (it would otherwise keep the requests 29 days)
    await f(`${API}/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(env) }).catch(() => undefined);
  }
  return out;
}

/** A script's batch (eval scoring): everything submitted at once, polled until it ends or the deadline passes, the rest
 *  asked the normal way. Results by key. */
export async function batchRun(env: Env, items: { key: string; params: BatchParams }[], o: { deadlineMs: number; pollMs?: number; f?: Fetch;
  call: (p: BatchParams) => Promise<{ ok: boolean; data?: Message }>; sleep?: (ms: number) => Promise<void> }): Promise<Map<string, { data: Message | null; batch: boolean; usd: number }>> {
  const out = new Map<string, { data: Message | null; batch: boolean; usd: number }>();
  const mem = new Map<string, Job>();
  const jobs: Jobs = {
    get: async (id) => mem.get(id) ?? null,
    add: async (j) => { if (mem.has(j.custom_id)) return false; mem.set(j.custom_id, j); return true; },
    pending: async (n) => [...mem.values()].filter((j) => j.status === "pending").slice(0, n),
    inFlight: async () => [...new Set([...mem.values()].filter((j) => j.status === "submitted" && j.batch_id).map((j) => j.batch_id!))],
    set: async (id, when, patch) => { const j = mem.get(id); if (!j || !when.includes(j.status)) return false; Object.assign(j, patch); return true; },
  };
  const f = o.f ?? fetch, sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const end = Date.now() + o.deadlineMs;
  if (batchOn(env)) {
    for (const it of items) await jobs.add({ custom_id: customId(it.key), kind: "eval", workspace_id: null, model: it.params.model, params: batchable(it.params), status: "pending", batch_id: null, result: null, usage: null, cost_usd: null, deadline: new Date(end).toISOString() });
    await pollBatches(env, jobs, f);
    while (Date.now() < end && [...mem.values()].some((j) => j.status === "submitted")) { await sleep(o.pollMs ?? 30_000); await pollBatches(env, jobs, f); }
  }
  for (const it of items) {
    const j = mem.get(customId(it.key));
    if (j?.status === "done" && j.result) { out.set(it.key, { data: j.result, batch: true, usd: j.cost_usd ?? 0 }); continue; }
    const r = await o.call(it.params);
    out.set(it.key, { data: r.ok ? r.data ?? null : null, batch: false, usd: r.ok && r.data?.usage ? costOf(`anthropic:${it.params.model}`, r.data.usage) : 0 });
  }
  return out;
}

/** ai_batch_jobs through a Supabase client (service role). */
// deno-lint-ignore no-explicit-any
export function dbJobs(db: { from(t: string): any }): Jobs {
  const t = () => db.from("ai_batch_jobs");
  return {
    get: async (id) => { const { data } = await t().select("*").eq("custom_id", id).maybeSingle(); return (data as Job | null) ?? null; },
    add: async (j) => { const { error } = await t().insert(j); return !error; },
    pending: async (n) => { const { data } = await t().select("*").eq("status", "pending").order("created_at").limit(n); return (data as Job[] | null) ?? []; },
    inFlight: async () => { const { data } = await t().select("batch_id").eq("status", "submitted").not("batch_id", "is", null).limit(1000); return [...new Set(((data ?? []) as { batch_id: string }[]).map((r) => r.batch_id))]; },
    set: async (id, when, patch) => { const { data } = await t().update({ ...patch, updated_at: new Date().toISOString() }).eq("custom_id", id).in("status", when).select("custom_id"); return ((data as unknown[] | null) ?? []).length > 0; },
  };
}
