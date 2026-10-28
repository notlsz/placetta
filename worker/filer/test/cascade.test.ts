// npm test: the model cascade (cascade.ts, llm.ts tiers, run.ts drive). What must hold:
//   - routine pages go to the fast model (Haiku 5.5); the review page, the final submit, CAPTCHA and identity pages and
//     deficiency or status pages go to the strong one (Opus 5.5) from the first look
//   - the fast model's need_person, an invalid call, a refused value and a repeat on an unchanged page go up to the strong one
//   - each tier fails over through the other vendors; the guards apply whichever tier chose
//   - the static prompt is cached (cache_control on the system block after the tools; 1h for status checks), effort is
//     set per tier, the advisor (Opus) rides along on the fast tier within a per-run cap, and is dropped when refused
//   - every call is priced into the run's ledger (advisor and cache tokens included), and the expected AI cost of a
//     sample license under the cascade is computed against what it was before
import { test } from "node:test";
import assert from "node:assert";
import { actionKey, answerTier, expectedCost, guardRefused, pageTier, summarize } from "../src/cascade.ts";
import { ADVISOR_BETA, anthropicBody, Router, tierSeats, type CallCost } from "../src/llm.ts";
import { FilerModel, TOOLS, stepPage, stepSystem } from "../src/model.ts";
import { FilerStatusModel, STATUS_SYSTEM, statusAmbiguous } from "../src/status.ts";
import { costOf } from "../../../supabase/functions/_shared/ai_cost.ts";
import type { PageState } from "../src/guards.ts";

const st = (o: Partial<PageState> = {}): PageState => ({ url: "https://portal.example.gov/apply", title: "Apply", headings: ["Business details"], controls: [], buttons: [], links: [], text: "", frames: [], markers: [], ...o });
const ctl = (label: string, value = "") => ({ selector: `label:${label}`, tag: "input", type: "text", label, name: label, id: label, autocomplete: "", value });
const envOf = (e: Record<string, string>) => (k: string) => e[k];
const KEYS = { ANTHROPIC_API_KEY: "sk-ant-live-0123456789", GEMINI_API_KEY: "AIzaSyLiveGeminiKey0123456789abc", GEMINI_PAID: "1", OPENROUTER_API_KEY: "sk-or-v1-live0123456789" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const quiet = { log: () => undefined };

test("pages: routine is fast; review, final submit, CAPTCHA, identity and deficiency pages are strong from the first look", () => {
  assert.equal(pageTier(st({ controls: [ctl("Legal name")], buttons: [{ selector: "button:Next", text: "Next" }] })), null);
  assert.equal(pageTier(st({ headings: ["Review your application"] })), "review");
  assert.equal(pageTier(st({ title: "Application Summary" })), "review");
  // a send button with every line filled: the final-submit check
  assert.equal(pageTier(st({ controls: [ctl("Legal name", "Acme")], buttons: [{ selector: "button:Submit", text: "Submit application" }] })), "final_submit");
  // a send button on a page still being filled: routine until it's filled
  assert.equal(pageTier(st({ controls: [ctl("Legal name")], buttons: [{ selector: "button:Submit", text: "Submit" }] })), null);
  assert.equal(pageTier(st({ headings: ["Notice of Deficiency"] })), "deficiency");
  assert.equal(pageTier(st({ headings: ["Application Status"] })), "deficiency");
  assert.equal(pageTier(st({ text: "Please answer these security questions: mother's maiden name" })), "identity");
  assert.equal(pageTier(st({ markers: ["g-recaptcha"] })), "captcha");
});

test("answers: need_person, an invalid call and a repeat go up; a wait doesn't count as a repeat; the guard's refusal is recognized", () => {
  const done = new Set<string>();
  assert.equal(answerTier({ name: "need_person", input: { reason: "r", message: "m" } }, TOOLS, { doneHere: done }), "need_person");
  assert.equal(answerTier({ name: "type_text", input: {} }, TOOLS, { doneHere: done }), "invalid_call");
  assert.equal(answerTier({ name: "fill", input: { selector: "label:x" } }, TOOLS, { doneHere: done }), "invalid_call", "a required argument is missing");
  const click = { name: "click", input: { selector: "button:Next" } };
  assert.equal(answerTier(click, TOOLS, { doneHere: done }), null);
  done.add(actionKey(click));
  assert.equal(answerTier(click, TOOLS, { doneHere: done }), "repeat");
  done.add(actionKey({ name: "wait", input: { ms: 500 } }));
  assert.equal(answerTier({ name: "wait", input: { ms: 500 } }, TOOLS, { doneHere: done }), null);
  assert.ok(guardRefused("Refused: that value isn't one of the approved values."));
  assert.ok(guardRefused("Refused: that option isn't one of the approved values."));
  assert.ok(!guardRefused("No element for label:x"));
});

test("tiers: Haiku 5.5 fast, Opus 5.5 strong, each failing over through Gemini and OpenRouter at the tier's model; env overrides", () => {
  const ids = (e: Record<string, string>, t: "fast" | "strong") => tierSeats(envOf(e), t).map((s) => `${s.vendor}:${s.model}`);
  assert.deepEqual(ids({}, "fast"), ["anthropic:claude-haiku-5-5", "gemini:gemini-3.8-flash", "openrouter:anthropic/claude-haiku-5.5", "muse:muse-spark-1.3"]);
  assert.deepEqual(ids({}, "strong"), ["anthropic:claude-opus-5-5", "gemini:gemini-3.8-flash", "openrouter:anthropic/claude-opus-5.5", "muse:muse-spark-1.3"]);
  assert.deepEqual(ids({ FILER_MODEL_FAST: "anthropic:claude-sonnet-5-5" }, "fast")[0], "anthropic:claude-sonnet-5-5");
  // FILER_MODELS names the failover chain behind the tier's own model
  assert.deepEqual(ids({ FILER_MODELS: "gemini:gemini-3.8-flash,openrouter" }, "strong"), ["anthropic:claude-opus-5-5", "gemini:gemini-3.8-flash", "openrouter:anthropic/claude-sonnet-5.5"]);
});

test("caching: the static part (rules, approved values) goes in a cached system block after the tools; the page never does", () => {
  const filing = { payload: { official: "x", form: { en: "Seller's permit" }, fields: [{ label: { en: "Legal name" }, value: "Acme" }] } } as any;
  const i = { filing, agency: "cdtfa.ca.gov", state: st({ text: "Page text 12:04:31 PM" }), recent: ["fill label:a"] };
  const sys = stepSystem(i), page = stepPage(i);
  assert.ok(sys.includes("Acme") && !sys.includes("12:04:31") && !sys.includes("Page text"), "nothing of the page or the time in the cached part");
  assert.ok(page.includes("12:04:31"));
  // byte-stable between steps: the same filing on a new page gives the same system text
  assert.equal(stepSystem({ filing, agency: "cdtfa.ca.gov" }), sys);
  const b = anthropicBody("claude-haiku-5-5", { system: sys, prompt: page, tools: TOOLS, maxTokens: 800 }) as any;
  assert.deepEqual(b.system[0].cache_control, { type: "ephemeral" });
  assert.ok(!b.tools.some((t: any) => t.cache_control), "one breakpoint on the system block caches the tools before it");
  assert.equal(b.output_config, undefined, "the fast tier keeps Haiku's default effort");
  const status = anthropicBody("claude-haiku-5-5", { system: STATUS_SYSTEM, prompt: "page", tools: TOOLS, maxTokens: 800, cacheTtl: "1h", effort: "low" }) as any;
  assert.deepEqual(status.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.deepEqual(status.output_config, { effort: "low" });
});

test("the advisor: Haiku consults Opus inside the request, under the beta header, capped per run, dropped when refused", async () => {
  const sent: { headers: Record<string, string>; body: any }[] = [];
  let refuse = false;
  const f = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push({ headers: init.headers as Record<string, string>, body });
    const adv = body.tools.some((t: any) => t.type === "advisor_20260301");
    if (refuse && adv) return json({ type: "error", error: { type: "invalid_request_error", message: "advisor tool not enabled" } }, 400);
    return json({ stop_reason: "tool_use", content: [
      ...(adv ? [{ type: "server_tool_use", id: "s1", name: "advisor", input: {} }, { type: "advisor_tool_result", tool_use_id: "s1", content: { type: "advisor_redacted_result", encrypted_content: "x" } }] : []),
      { type: "tool_use", id: "t", name: "click", input: { selector: "button:Next" } }],
      usage: { input_tokens: 1500, output_tokens: 200, cache_read_input_tokens: 1500, ...(adv ? { iterations: [
        { type: "message", input_tokens: 1500, output_tokens: 100 }, { type: "advisor_message", model: "claude-opus-5-5", input_tokens: 3000, output_tokens: 1500 }] } : {}) } });
  }) as unknown as typeof fetch;
  const router = new Router({ env: envOf({ ...KEYS, FILER_ADVISOR_MAX: "2" }), fetch: f, ...quiet });
  const m = new FilerModel(router);
  const i = { filing: { payload: { official: "x", fields: [] } } as any, agency: "a", state: st(), recent: [] };
  await m.next(i);
  const s0 = sent[0];
  assert.equal(s0.headers["anthropic-beta"], ADVISOR_BETA);
  assert.deepEqual(s0.body.tools.at(-1), { type: "advisor_20260301", name: "advisor", model: "claude-opus-5-5", max_uses: 1, max_tokens: 2048 });
  assert.match(s0.body.system[0].text, /advisor tool backed by a stronger model/);
  assert.equal(m.advised, true);
  // the strong tier is Opus itself at high effort, with no advisor
  await m.next({ ...i, tier: "strong" });
  assert.equal(sent[1].body.model, "claude-opus-5-5");
  assert.ok(!sent[1].body.tools.some((t: any) => t.type === "advisor_20260301"));
  assert.deepEqual(sent[1].body.output_config, { effort: "high" });
  await m.next(i);
  // the run's cap (2): the third fast step goes without the advisor
  await m.next(i);
  assert.ok(!sent[3].body.tools.some((t: any) => t.type === "advisor_20260301"), "past the cap the tool is left out");
  const ledger = m.take();
  const advised = ledger.filter((c) => c.advisor_calls);
  assert.equal(advised.length, 2);
  // the advisor's share at Opus's rates: 3000 in at $4 and 1500 out at $20 per million
  assert.equal(advised[0].advisor_usd, Math.round((3000 * 4 + 1500 * 20) / 1e6 * 1e6) / 1e6);
  // the next run starts with the cap free again; a refused beta drops the advisor and asks the same seat again
  refuse = true; sent.length = 0;
  const out = await m.next(i);
  assert.equal(out.name, "click");
  assert.equal(sent.length, 2);
  assert.ok(!sent[1].body.tools.some((t: any) => t.type === "advisor_20260301") && !sent[1].headers["anthropic-beta"]);
  sent.length = 0;
  await m.next(i);
  assert.equal(sent.length, 1, "the advisor stays off for the cooldown");
});

test("the advisor isn't used where zero data retention is required unless anthropic:advisor is listed, nor with FILER_ADVISOR=0", async () => {
  for (const e of [{ AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" }, { FILER_ADVISOR: "0" }] as Record<string, string>[]) {
    const sent: any[] = [];
    const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return json({ content: [{ type: "tool_use", name: "wait", input: { ms: 1 } }], usage: {} }); }) as unknown as typeof fetch;
    await new FilerModel(new Router({ env: envOf({ ...KEYS, ...e }), fetch: f, ...quiet })).next({ filing: { payload: { official: "x", fields: [] } } as any, agency: "a", state: st(), recent: [] });
    assert.ok(!sent[0].tools.some((t: any) => t.type === "advisor_20260301"));
  }
});

test("status checks: fast at low effort with a one-hour cache; the strong model only when the fast read is ambiguous", async () => {
  assert.ok(statusAmbiguous({ name: "read_status", input: { state: "unknown" } }, null));
  assert.ok(statusAmbiguous({ name: "read_status", input: { state: "approved" } }, false));
  assert.ok(!statusAmbiguous({ name: "read_status", input: { state: "approved" } }, true));
  assert.ok(statusAmbiguous({ name: "give_up", input: {} }, null));
  assert.ok(!statusAmbiguous({ name: "click", input: { selector: "x" } }, null));
  const sent: any[] = [];
  const f = (async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return json({ content: [{ type: "tool_use", name: "give_up", input: { reason: "x" } }], usage: { input_tokens: 10 } }); }) as unknown as typeof fetch;
  await new FilerStatusModel(new Router({ env: envOf(KEYS), fetch: f, ...quiet })).next({ job: { title: { en: "t" }, agency: null } as any, state: st(), recent: [], signedIn: false });
  assert.equal(sent[0].model, "claude-haiku-5-5");
  assert.deepEqual(sent[0].system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.deepEqual(sent[0].output_config, { effort: "low" });
});

test("prices: cache reads and writes (5m and 1h), advisor iterations, fast mode and batch are each priced as Anthropic bills them", () => {
  const M = 1e6, K = 50_000;   // Haiku 5.5 under 100,000 prompt tokens: $0.10 in, $0.50 out; 5m write 1.25x, 1h write 2x, read 0.1x
  assert.equal(costOf("anthropic:claude-haiku-5-5", { input_tokens: K }), 0.005);
  assert.equal(costOf("anthropic:claude-haiku-5-5", { cache_creation_input_tokens: K }), 0.00625);
  assert.equal(costOf("anthropic:claude-haiku-5-5", { cache_creation_input_tokens: K, cache_creation: { ephemeral_1h_input_tokens: K } }), 0.01);
  assert.equal(costOf("anthropic:claude-haiku-5-5", { cache_read_input_tokens: K }), 0.0005);
  // Opus 5.5: $4 / $20; reads 0.05x ($0.20); fast mode 2x ($8 / $40)
  assert.equal(costOf("anthropic:claude-opus-5-5", { input_tokens: M, output_tokens: M }), 24);
  assert.equal(costOf("anthropic:claude-opus-5-5", { cache_read_input_tokens: M }), 0.2);
  assert.equal(costOf("anthropic:claude-opus-5-5", { input_tokens: M, output_tokens: M, speed: "fast" }), 48);
  // OpenRouter's spelling of the same model is priced the same
  assert.equal(costOf("openrouter:anthropic/claude-opus-5.5", { input_tokens: M }), 4);
  // batch: half of everything
  assert.equal(costOf("anthropic:claude-opus-5-5", { input_tokens: M, output_tokens: M }, new Date(), { batch: true }), 12);
  // advisor: the executor at Haiku's rates, the advisor iteration at Opus's
  assert.equal(costOf("anthropic:claude-haiku-5-5", { input_tokens: K, iterations: [{ type: "message", input_tokens: K }, { type: "advisor_message", model: "claude-opus-5-5", input_tokens: K }] }), 0.205);
});

// ---------------------------------------------------------------- the expected AI cost of a license

/** A sample portal filing with no recorded skill yet, as Placetta's playbooks run one: about 23 model steps (sign in,
 *  four pages of fields, uploads, the review page, the final submit, the confirmation). Tokens per step: the static part
 *  (11 tool definitions and the rules with the approved values, about 1,500), the page (controls, buttons and up to 2,000
 *  characters of the agency's text, about 1,500), and the answer (one tool call and adaptive thinking: about 250 on the
 *  fast tier at medium effort, about 1,200 on Opus at high effort). These are estimates, not measurements: filer_runs
 *  records the real ones from the first runs (filer_run_costs). */
const RUN = { staticTokens: 1500, pageTokens: 1500, fastOut: 250, strongOut: 1200 };

test("a sample license: what the worker's AI costs under the cascade, against before, feature by feature", () => {
  // before: every step on the one default seat, Sonnet 5.5, nothing cached
  const before = expectedCost({ ...RUN, fast: 23, strong: 0, fastModel: "anthropic:claude-sonnet-5-5", fastOut: 600, cache: false });
  // the cascade without caching: 20 routine steps on Haiku, 3 on Opus (the review page, the final submit, one escalation)
  const cascade = expectedCost({ ...RUN, fast: 20, strong: 3, cache: false });
  // plus caching of the static part
  const cached = expectedCost({ ...RUN, fast: 20, strong: 3 });
  // plus the advisor: the one escalation becomes one advisor call inside a fast step (Opus reads about 3,000 tokens of
  // transcript and writes about 1,500 including thinking, per Anthropic's advisor page); review and final submit stay on Opus
  const advised = expectedCost({ ...RUN, fast: 21, strong: 2, advisor: { calls: 1, input: 3000, output: 1500 } });
  // a run that replays a recorded skill: no model call at all
  const replayed = expectedCost({ ...RUN, fast: 0, strong: 0 });
  const rows = { before, cascade, cached, advised, replayed };
  console.log("filer AI per license (USD):", JSON.stringify(Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.total]))));
  assert.ok(cascade.total < before.total, "the cascade is cheaper than Sonnet on every step");
  assert.ok(cached.total < cascade.total, "caching the static part saves on every step after the first");
  // the advisor costs a little more than the direct escalation it replaces (Opus's advice runs 1,400 to 1,800 tokens with
  // thinking): it buys Opus's view before Haiku acts, not a saving; the run's cap keeps it bounded
  assert.ok(advised.total <= cached.total * 1.15, "the advisor costs about what one direct Opus escalation does");
  assert.equal(replayed.total, 0);
  // the numbers as computed from ai_cost.ts at today's list prices (2026-11-01)
  assert.equal(before.total, 0.276);
  assert.equal(cached.total, 0.104073);
});

test("the run's ledger adds up by tier, with the provider and the steps replayed", () => {
  const l: CallCost[] = [
    { tier: "fast", model: "anthropic:claude-haiku-5-5", input: 1500, output: 250, cache_read: 1500, cache_write: 0, usd: 0.0003 },
    { tier: "strong", model: "anthropic:claude-opus-5-5", input: 1500, output: 1200, cache_read: 0, cache_write: 1500, usd: 0.0375 },
  ];
  const s = summarize(l, { provider: "browserbase", replayed: 4 });
  assert.equal(s.calls, 2); assert.equal(s.usd, 0.0378); assert.equal(s.provider, "browserbase"); assert.equal(s.replayed_steps, 4);
  assert.deepEqual(s.by_tier, { fast: { calls: 1, usd: 0.0003 }, strong: { calls: 1, usd: 0.0375 } });
});
