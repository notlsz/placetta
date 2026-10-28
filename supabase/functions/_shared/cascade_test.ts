// deno test supabase/functions/_shared/cascade_test.ts
// The server's model cascade (2026-10-28): the roles' models, effort, the advisor in the main loop, fast mode only while a
// person waits, the one-hour cache for background calls, the Batches API for work nobody waits on, and what a sample
// license costs by role before and after, feature by feature (prices from ai_cost.ts, read on platform.claude.com).
import { deepStrictEqual as eq, ok } from "node:assert";
import { ADVISOR_BETA, advisorFor, appealTurn, callModel, EFFORT, fastModeFor, routeFor, withCache } from "./llm.ts";
import { batchRun, customId, deferred, pollBatches, type Job, type Jobs } from "./batch.ts";
import { costOf } from "./ai_cost.ts";

const only = (o: Record<string, string>) => (k: string) => o[k];
const payload = { model: "m", max_tokens: 500, system: "Odelia's rules", messages: [{ role: "user", content: "find permits" }], tools: [{ name: "lookup", description: "d", input_schema: { type: "object", properties: {} } }] };
const anth = (o: Record<string, unknown> = {}) => new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 }, ...o }), { status: 200 });

Deno.test("roles: Opus reviews and appeals, Sonnet chats and drafts, Haiku classifies and reads statuses; effort by role", () => {
  const env = only({ ANTHROPIC_API_KEY: "a" });
  const first = (r: Parameters<typeof routeFor>[1], m = "claude-sonnet-5-5") => routeFor(env, r, m)[0].join(":");
  eq([first("review"), first("appeal"), first("deep", "claude-opus-5-5")], ["anthropic:claude-opus-5-5", "anthropic:claude-opus-5-5", "anthropic:claude-opus-5-5"]);
  eq([first("plan"), first("draft"), first("short")], ["anthropic:claude-sonnet-5-5", "anthropic:claude-sonnet-5-5", "anthropic:claude-sonnet-5-5"]);
  eq([first("extract"), first("translate"), first("watch")], ["anthropic:claude-haiku-5-5", "anthropic:claude-haiku-5-5", "anthropic:claude-haiku-5-5"]);
  eq([EFFORT.extract, EFFORT.watch, EFFORT.plan, EFFORT.review, EFFORT.appeal], ["low", "low", "medium", "high", "high"]);
  // a turn after appeal_case (or a deficiency answer) is the appeal role
  ok(appealTurn([{ role: "user", content: "x" }, { role: "assistant", content: [{ type: "tool_use", name: "appeal_case", input: {} }] }, { role: "user", content: [{ type: "tool_result" }] }]));
  ok(!appealTurn([{ role: "assistant", content: [{ type: "tool_use", name: "add_deadline", input: {} }] }]));
});

Deno.test("the request: effort set per role, the advisor on Sonnet in the plan role (beta header, capped), dropped when refused", async () => {
  const sent: { body: any; beta: string | null }[] = [];
  let refuse = false;
  const f = (async (_u: string, init: any) => {
    const body = JSON.parse(init.body);
    sent.push({ body, beta: init.headers["anthropic-beta"] ?? null });
    if (refuse && body.tools?.some((t: any) => t.type === "advisor_20260301")) return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "advisor tool is not enabled" } }), { status: 400 });
    return anth();
  }) as unknown as typeof fetch;
  const env = only({ ANTHROPIC_API_KEY: "a" });
  await callModel(env, { payload, role: "plan", research: false, beta: null, advisorLeft: 3 }, "claude-sonnet-5-5", null, f);
  const b = sent[0].body;
  eq(b.output_config, { effort: "medium" });
  eq(b.tools.at(-1), { type: "advisor_20260301", name: "advisor", model: "claude-opus-5-5", max_uses: 2, max_tokens: 2048, cache_control: { type: "ephemeral" } });
  ok(String(sent[0].beta).includes(ADVISOR_BETA));
  // no calls left in the run: no advisor
  sent.length = 0;
  await callModel(env, { payload, role: "plan", research: false, beta: null, advisorLeft: 0 }, "claude-sonnet-5-5", null, f);
  ok(!sent[0].body.tools.some((t: any) => t.type === "advisor_20260301"));
  // the review is Opus itself at high effort, never with an advisor
  sent.length = 0;
  await callModel(env, { payload, role: "review", research: false, beta: null, advisorLeft: 3 }, "claude-sonnet-5-5", null, f);
  eq([sent[0].body.model, sent[0].body.output_config.effort], ["claude-opus-5-5", "high"]);
  ok(!sent[0].body.tools.some((t: any) => t.type === "advisor_20260301"));
  // refused: asked again without it
  refuse = true; sent.length = 0;
  const r = await callModel(env, { payload, role: "plan", research: false, beta: null, advisorLeft: 3 }, "claude-sonnet-5-5", null, f);
  ok(r.ok && sent.length === 2 && !sent[1].body.tools.some((t: any) => t.type === "advisor_20260301"));
  // zero data retention: only with anthropic:advisor listed
  ok(!advisorFor(only({ AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" }), { payload, role: "plan", research: false, beta: null, advisorLeft: 3 }, "claude-sonnet-5-5"));
  ok(advisorFor(only({ AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic,anthropic:advisor" }), { payload, role: "plan", research: false, beta: null, advisorLeft: 3 }, "claude-sonnet-5-5"));
});

Deno.test("fast mode: off by default; only Opus 5.5 with a person waiting and ODELIA_FAST_MODE=1; a 429 asks at standard speed", async () => {
  const call = { payload, role: "deep" as const, research: false, beta: null, interactive: true };
  ok(!fastModeFor(only({}), call, "claude-opus-5-5"), "off by default");
  ok(fastModeFor(only({ ODELIA_FAST_MODE: "1" }), call, "claude-opus-5-5"));
  ok(!fastModeFor(only({ ODELIA_FAST_MODE: "1" }), { ...call, interactive: false }, "claude-opus-5-5"), "never in the background");
  ok(!fastModeFor(only({ ODELIA_FAST_MODE: "1" }), call, "claude-sonnet-5-5"), "Opus 5.5 only");
  const sent: any[] = [];
  const f = (async (_u: string, init: any) => { const b = JSON.parse(init.body); sent.push(b); return b.speed === "fast" ? new Response("{}", { status: 429 }) : anth(); }) as unknown as typeof fetch;
  const r = await callModel(only({ ANTHROPIC_API_KEY: "a", ODELIA_FAST_MODE: "1" }), call, "claude-opus-5-5", null, f);
  ok(r.ok && sent[0].speed === "fast" && sent[1].speed === undefined, "fell back to standard speed");
  // a batch never carries it
  const { batchable } = await import("./batch.ts");
  ok(!("speed" in batchable({ model: "claude-opus-5-5", max_tokens: 1, messages: [], speed: "fast", stream: true } as never)));
});

Deno.test("caching: the stable prefix for an hour when calls are more than five minutes apart; the last message five minutes", () => {
  const out = withCache({ ...payload, messages: [{ role: "user", content: "hi" }] }, "1h") as any;
  eq(out.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  eq(out.tools[0].cache_control, { type: "ephemeral", ttl: "1h" });
  eq(out.messages[0].content[0].cache_control, { type: "ephemeral" }, "the longer lifetime comes before the shorter");
  eq((withCache(payload) as any).system[0].cache_control, { type: "ephemeral" });
});

/** ai_batch_jobs in memory, the same conditional writes as the database. */
function memJobs(): Jobs & { rows: Map<string, Job> } {
  const rows = new Map<string, Job>();
  return { rows,
    get: async (id) => rows.get(id) ?? null,
    add: async (j) => { if (rows.has(j.custom_id)) return false; rows.set(j.custom_id, { ...j }); return true; },
    pending: async (n) => [...rows.values()].filter((j) => j.status === "pending").slice(0, n),
    inFlight: async () => [...new Set([...rows.values()].filter((j) => j.status === "submitted" && j.batch_id).map((j) => j.batch_id!))],
    set: async (id, when, patch) => { const j = rows.get(id); if (!j || !when.includes(j.status)) return false; Object.assign(j, patch); return true; } };
}
/** Anthropic's Batches API, mocked: create, retrieve (ended at once), results, delete. */
function batchApi() {
  const made: any[] = [], deleted: string[] = [];
  const f = (async (u: string, init: any = {}) => {
    if (init.method === "POST") { made.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "msgbatch_1" }), { status: 200 }); }
    if (init.method === "DELETE") { deleted.push(u); return new Response("{}", { status: 200 }); }
    if (u.endsWith("/results")) return new Response(made.flatMap((b) => b.requests).map((r: any) => JSON.stringify({ custom_id: r.custom_id, result: { type: "succeeded", message: { content: [{ type: "text", text: `scored ${r.custom_id}` }], usage: { input_tokens: 50_000, output_tokens: 0 } } } })).join("\n"), { status: 200 });
    return new Response(JSON.stringify({ processing_status: "ended", results_url: "https://api.anthropic.com/v1/messages/batches/msgbatch_1/results" }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, made, deleted };
}

Deno.test("batch: queued once, polled, written once at half price, deleted at Anthropic; past the deadline asked the normal way", async () => {
  const env = only({ ANTHROPIC_API_KEY: "a", ODELIA_BATCH: "1" });
  const jobs = memJobs(), api = batchApi();
  let direct = 0;
  const call = async () => { direct++; return { ok: true, data: { content: [{ type: "text", text: "now" }] }, model: "anthropic:claude-haiku-5-5" }; };
  const params = { model: "claude-haiku-5-5", max_tokens: 300, messages: [{ role: "user", content: "summarize" }] };
  const deadline = new Date(Date.now() + 3600_000);
  eq(await deferred(env, jobs, { key: "status-summary:f1:2026-11-01", kind: "status_summary", params, deadline, call }), { status: "pending" });
  eq(await deferred(env, jobs, { key: "status-summary:f1:2026-11-01", kind: "status_summary", params, deadline, call }), { status: "pending" }, "queued once");
  eq(jobs.rows.size, 1);
  const p = await pollBatches(env, jobs, api.f);
  eq(p, { submitted: 1, written: 1, failed: 0 });
  eq(await pollBatches(env, jobs, api.f), { submitted: 0, written: 0, failed: 0 }, "a second poll writes nothing again");
  ok(api.deleted.length >= 1, "the batch is deleted once its results are written");
  const row = jobs.rows.get(customId("status-summary:f1:2026-11-01"))!;
  eq(row.cost_usd, 0.0025, "Haiku 5.5 at $0.10 a million, half price");
  const got = await deferred(env, jobs, { key: "status-summary:f1:2026-11-01", kind: "status_summary", params, deadline, call });
  ok(got.status === "done" && got.batch && direct === 0);
  // a request whose batch hasn't ended by its deadline: asked now, once
  const late = memJobs();
  await deferred(env, late, { key: "digest:w1", kind: "digest", params, deadline: new Date(Date.now() - 1), call: async () => ({ ok: false, model: "" }) });
  const r = await deferred(env, late, { key: "digest:w1", kind: "digest", params, deadline: new Date(Date.now() - 1), call });
  ok(r.status === "fallback" && (direct as number) === 1);
  // off (no ODELIA_BATCH, or ZDR without anthropic:batch): always the normal way
  ok((await deferred(only({ ANTHROPIC_API_KEY: "a" }), memJobs(), { key: "x", kind: "x", params, deadline, call })).status === "fallback");
  ok((await deferred(only({ ANTHROPIC_API_KEY: "a", ODELIA_BATCH: "1", AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" }), memJobs(), { key: "x", kind: "x", params, deadline, call })).status === "fallback");
  // a script's batch (eval scoring): everything in one batch, results by key
  const api2 = batchApi();
  const out = await batchRun(env, [{ key: "case-1", params }, { key: "case-2", params }], { deadlineMs: 5_000, pollMs: 1, f: api2.f, call, sleep: async () => {} });
  ok(out.get("case-1")?.batch && out.get("case-2")?.data?.content?.[0].text === "scored case-2");
});

// ---------------------------------------------------------------- what a license costs, by role

/** A sample license's model work on the server, as Odelia does it: the plan, the review before it goes out, a deficiency
 *  answer, extraction from uploads, status checks until the agency approves, and its scoring in the eval. Tokens are
 *  estimates from the prompts' sizes (Odelia's instructions and tools about 6,500 tokens: llm.ts withCache), not
 *  measurements; ai_events records the real ones per role. */
const AT = new Date("2026-11-01T00:00:00Z");
type Step = { role: string; model: string; calls: number; static: number; dynamic: number; out: number; cache?: "none" | "5m" | "1h"; hitsWithin?: boolean; batch?: boolean; advisor?: { calls: number; in: number; out: number } };
function priceOf(s: Step): number {
  let usd = 0;
  for (let i = 0; i < s.calls; i++) {
    const cached = s.cache && s.cache !== "none" && (i > 0 || s.hitsWithin);
    const u = s.cache === "none" || !s.cache ? { input_tokens: s.static + s.dynamic, output_tokens: s.out }
      : cached ? { input_tokens: s.dynamic, cache_read_input_tokens: s.static, output_tokens: s.out }
      : { input_tokens: s.dynamic, cache_creation_input_tokens: s.static, ...(s.cache === "1h" ? { cache_creation: { ephemeral_1h_input_tokens: s.static } } : {}), output_tokens: s.out };
    usd += costOf(s.model, u, AT, { batch: s.batch });
  }
  if (s.advisor) usd += s.advisor.calls * costOf("anthropic:claude-opus-5-5", { input_tokens: s.advisor.in, output_tokens: s.advisor.out }, AT);
  return Math.round(usd * 1e6) / 1e6;
}
const total = (xs: Step[]) => Math.round(xs.reduce((a, s) => a + priceOf(s), 0) * 1e4) / 1e4;

Deno.test("a sample license: tokens and dollars per role, before and after, and what each feature saves", () => {
  // before (the routes until 2026-10-28): the main loop and drafts on Gemini 3.8 Flash, the review on Sonnet, Haiku 4.5
  const before: Step[] = [
    { role: "plan", model: "gemini:gemini-3.8-flash", calls: 8, static: 6500, dynamic: 4000, out: 500, cache: "none" },
    { role: "review", model: "anthropic:claude-sonnet-5-5", calls: 1, static: 2000, dynamic: 6000, out: 800, cache: "none" },
    { role: "appeal", model: "gemini:gemini-3.8-flash", calls: 1, static: 6500, dynamic: 6000, out: 1500, cache: "none" },
    { role: "extract", model: "gemini:gemini-2.5-flash-lite", calls: 4, static: 1500, dynamic: 3000, out: 300, cache: "none" },
    { role: "watch", model: "gemini:gemini-2.5-flash-lite", calls: 20, static: 6500, dynamic: 1500, out: 300, cache: "none" },
    { role: "eval", model: "anthropic:claude-sonnet-5-5", calls: 1, static: 1200, dynamic: 3000, out: 400, cache: "none" },
  ];
  // after, the roles alone (Anthropic at the role's model), nothing cached
  const roles: Step[] = [
    { role: "plan", model: "anthropic:claude-sonnet-5-5", calls: 8, static: 6500, dynamic: 4000, out: 500, cache: "none" },
    { role: "review", model: "anthropic:claude-opus-5-5", calls: 1, static: 2000, dynamic: 6000, out: 1000, cache: "none" },
    { role: "appeal", model: "anthropic:claude-opus-5-5", calls: 1, static: 6500, dynamic: 6000, out: 1500, cache: "none" },
    { role: "extract", model: "anthropic:claude-haiku-5-5", calls: 4, static: 1500, dynamic: 3000, out: 300, cache: "none" },
    { role: "watch", model: "anthropic:claude-haiku-5-5", calls: 20, static: 6500, dynamic: 1500, out: 300, cache: "none" },
    { role: "eval", model: "anthropic:claude-opus-5-5", calls: 1, static: 1200, dynamic: 3000, out: 400, cache: "none" },
  ];
  // + prompt caching: the stable prefix read at 0.05x (Sonnet, Opus) or 0.1x (Haiku) after the first call; the background
  // checks with the one-hour cache (the rules are the same for every workspace, so checks within the hour hit)
  const cached: Step[] = roles.map((s) => s.role === "watch" ? { ...s, cache: "1h", hitsWithin: true } : s.role === "eval" ? s : { ...s, cache: "5m" });
  // + the advisor: two of the plan's eight rounds consult Opus (about 6,000 tokens read, 1,500 written with thinking)
  const advised: Step[] = cached.map((s) => s.role === "plan" ? { ...s, advisor: { calls: 2, in: 6000, out: 1500 } } : s);
  // + batch: the eval's scoring at half price (nobody waits on it)
  const batched: Step[] = advised.map((s) => s.role === "eval" ? { ...s, batch: true } : s);
  const rows = { before: total(before), roles: total(roles), cached: total(cached), advised: total(advised), batched: total(batched) };
  const byRole = Object.fromEntries(batched.map((s) => [s.role, { model: s.model, tokens: s.calls * (s.static + s.dynamic + s.out), usd: priceOf(s) }]));
  console.log("server AI per license (USD):", JSON.stringify(rows));
  console.log("by role, after:", JSON.stringify(byRole));
  ok(rows.roles > rows.before, "Anthropic at each role's model costs more than Gemini Flash: the founder's trade for accuracy");
  ok(rows.cached < rows.roles, "caching takes most of it back");
  ok(rows.batched < rows.advised, "batch halves the scoring");
  // the numbers from ai_cost.ts at the list prices of 2026-11-01
  eq(rows, { before: 0.1501, roles: 0.3862, cached: 0.2994, advised: 0.4074, batched: 0.395 });
});
