// npm test: the worker's model seats (llm.ts) against a mocked fetch. What must hold:
//   - each vendor gets its own request shape with tool calling (Anthropic Messages, Gemini generateContent with function
//     declarations, OpenAI-style chat completions with tools on OpenRouter and Meta Model API), and its tool call comes
//     back as one { name, input }
//   - FILER_MODELS / ODELIA_MODELS set the order; a usage limit, a 429, a 5xx, a refused key, a dropped connection or an
//     answer with no tool goes to the next seat, and a seat that's down sits out for the cooldown
//   - the data rules hold before anything is sent: zero data retention, Gemini only paid, never a Muse contributor model
//   - no key ever reaches a log line or an error
import { test } from "node:test";
import assert from "node:assert";
import { ZDR_REFUSED } from "../../../supabase/functions/_shared/zdr.ts";
import { checkEnv } from "../src/env.ts";
import { askSeat, geminiSchema, redact, refusal, Router, seatsOf, usableSeats, type Ask } from "../src/llm.ts";
import { FilerLabeler, FilerModel, LABEL_TOOL, TOOLS } from "../src/model.ts";
import { STATUS_TOOLS, FilerStatusModel } from "../src/status.ts";

const KEYS = { ANTHROPIC_API_KEY: "sk-ant-live-0123456789", GEMINI_API_KEY: "AIzaSyLiveGeminiKey0123456789abc", GEMINI_PAID: "1", OPENROUTER_API_KEY: "sk-or-v1-live0123456789", MUSE_API_KEY: "muse-live-key-0123456789" };
const envOf = (e: Record<string, string>) => (k: string) => e[k];
type Sent = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
const vendorOf = (url: string) => url.includes("api.anthropic.com") ? "anthropic" : url.includes("generativelanguage.googleapis.com") ? "gemini" : url.includes("openrouter.ai") ? "openrouter" : url.includes("api.meta.ai") ? "muse" : "?";
/** A fetch that answers each vendor with what plan says, and keeps every request. */
function mock(plan: Partial<Record<string, (s: Sent) => Response>>) {
  const sent: Sent[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const s = { url: String(url), headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    sent.push(s);
    const h = plan[vendorOf(s.url)];
    if (!h) throw new TypeError("fetch failed");
    return h(s);
  }) as unknown as typeof fetch;
  return { f, sent, order: () => sent.map((s) => vendorOf(s.url)) };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const claudeSays = (name: string, input: Record<string, unknown>) => json({ content: [{ type: "thinking", thinking: "" }, { type: "tool_use", id: "t1", name, input }], stop_reason: "tool_use" });
const geminiSays = (name: string, args: Record<string, unknown>) => json({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name, args } }] }, finishReason: "STOP" }] });
const chatSays = (name: string, args: Record<string, unknown>) => json({ id: "x", choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: "tool_calls" }] });
const ASK: Ask = { prompt: "Fill the form.", tools: TOOLS, maxTokens: 800 };
const quiet = { log: () => undefined };

test("Anthropic: Messages API with the tools, tool_choice auto (Sonnet 5.5 refuses forced tool use), the tool_use block back", async () => {
  const m = mock({ anthropic: () => claudeSays("fill", { selector: "label:Legal name", value: "Acme Noodles LLC" }) });
  const out = await askSeat({ vendor: "anthropic", model: "claude-sonnet-5-5" }, ASK, envOf(KEYS), m.f);
  assert.deepEqual(out, { name: "fill", input: { selector: "label:Legal name", value: "Acme Noodles LLC" } });
  const s = m.sent[0];
  assert.equal(s.url, "https://api.anthropic.com/v1/messages");
  assert.equal(s.headers["x-api-key"], KEYS.ANTHROPIC_API_KEY);
  assert.equal(s.headers["anthropic-version"], "2023-06-01");
  assert.equal(s.body.model, "claude-sonnet-5-5");
  assert.deepEqual(s.body.tool_choice, { type: "auto" });
  assert.equal((s.body.tools as unknown[]).length, TOOLS.length);
  assert.match(String((s.body.messages as { content: string }[])[0].content), /^Fill the form\.[\s\S]*calling exactly one of the tools/);
});

test("Gemini: native generateContent with function declarations, mode ANY, the key in a header (never the URL), the functionCall back", async () => {
  const m = mock({ gemini: () => geminiSays("select", { selector: "label:Title", option: "Manager" }) });
  const out = await askSeat({ vendor: "gemini", model: "gemini-3.8-flash" }, ASK, envOf(KEYS), m.f);
  assert.deepEqual(out, { name: "select", input: { selector: "label:Title", option: "Manager" } });
  const s = m.sent[0];
  assert.equal(s.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.ok(!s.url.includes(KEYS.GEMINI_API_KEY));
  assert.equal(s.headers["x-goog-api-key"], KEYS.GEMINI_API_KEY);
  const decl = (s.body.tools as { functionDeclarations: { name: string; parameters: Record<string, any> }[] }[])[0].functionDeclarations;
  assert.equal(decl.length, TOOLS.length);
  const fillLogin = decl.find((d) => d.name === "fill_login")!;
  assert.equal(fillLogin.parameters.type, "OBJECT");
  assert.equal(fillLogin.parameters.properties.which.type, "STRING");
  assert.deepEqual(fillLogin.parameters.properties.which.enum, ["username", "password"]);
  assert.deepEqual(fillLogin.parameters.required, ["selector", "which"]);
  assert.deepEqual(s.body.toolConfig, { functionCallingConfig: { mode: "ANY" } });
  assert.deepEqual((s.body.contents as unknown[])[0], { role: "user", parts: [{ text: "Fill the form." }] });
  // one named tool: allowedFunctionNames
  const m2 = mock({ gemini: () => geminiSays("label_steps", { pages: [], fields: [] }) });
  await askSeat({ vendor: "gemini", model: "gemini-3.8-flash" }, { prompt: "p", tools: [LABEL_TOOL], only: "label_steps", maxTokens: 2000 }, envOf(KEYS), m2.f);
  assert.deepEqual(m2.sent[0].body.toolConfig, { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["label_steps"] } });
  assert.equal(geminiSchema(LABEL_TOOL.input_schema).properties && (geminiSchema(LABEL_TOOL.input_schema) as any).properties.pages.items.type, "OBJECT");
});

test("OpenRouter: chat completions with function tools, hosts that don't keep or train on prompts, zero-retention hosts when required, the arguments parsed", async () => {
  const m = mock({ openrouter: () => chatSays("click", { selector: "button:Continue" }) });
  const out = await askSeat({ vendor: "openrouter", model: "google/gemini-3.8-flash" }, ASK, envOf(KEYS), m.f);
  assert.deepEqual(out, { name: "click", input: { selector: "button:Continue" } });
  const s = m.sent[0];
  assert.equal(s.url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(s.headers.authorization, `Bearer ${KEYS.OPENROUTER_API_KEY}`);
  assert.equal(s.body.tool_choice, "required");
  const t = (s.body.tools as { type: string; function: { name: string; parameters: unknown } }[]);
  assert.equal(t[0].type, "function");
  assert.deepEqual(t.find((x) => x.function.name === "done")!.function.parameters, TOOLS.find((x) => x.name === "done")!.input_schema);
  assert.deepEqual(s.body.provider, { data_collection: "deny", require_parameters: true });
  // Claude through OpenRouter: auto, as on Anthropic's own API
  const m2 = mock({ openrouter: () => chatSays("click", { selector: "button:Continue" }) });
  await askSeat({ vendor: "openrouter", model: "anthropic/claude-sonnet-5.5" }, ASK, envOf({ ...KEYS, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "openrouter" }), m2.f);
  assert.equal(m2.sent[0].body.tool_choice, "auto");
  assert.deepEqual(m2.sent[0].body.provider, { data_collection: "deny", require_parameters: true, zdr: true });
  // a 200 that carries the host's error is a failure, not an answer
  const m3 = mock({ openrouter: () => json({ error: { code: 502, message: "upstream down" } }) });
  await assert.rejects(askSeat({ vendor: "openrouter", model: "x/y" }, ASK, envOf(KEYS), m3.f), (e: any) => e.status === 502);
});

test("Muse: Meta Model API chat completions at api.meta.ai/v1 with tools; a contributor model (Meta may train on it) is never used", async () => {
  const m = mock({ muse: () => chatSays("need_person", { reason: "q", message: "m" }) });
  const out = await askSeat({ vendor: "muse", model: "muse-spark-1.3" }, ASK, envOf(KEYS), m.f);
  assert.equal(out.name, "need_person");
  assert.equal(m.sent[0].url, "https://api.meta.ai/v1/chat/completions");
  assert.equal(m.sent[0].headers.authorization, `Bearer ${KEYS.MUSE_API_KEY}`);
  assert.equal(m.sent[0].body.model, "muse-spark-1.3");
  assert.equal(m.sent[0].body.tool_choice, "required");
  assert.equal(refusal(envOf(KEYS), { vendor: "muse", model: "muse-spark-1.3-contributor" }), "contributor");
  assert.equal(refusal(envOf(KEYS), { vendor: "openrouter", model: "meta/muse-spark-1.3-contributor" }), "contributor");
  assert.equal(refusal(envOf(KEYS), { vendor: "openrouter", model: "meta/muse-spark-1.3" }), null);
});

test("the order: FILER_MODELS, else ODELIA_MODELS, else the default; bare names take the vendor's default model; FILER_MODEL still names Claude", () => {
  const ids = (e: Record<string, string>) => seatsOf(envOf(e)).map((s) => `${s.vendor}:${s.model}`);
  assert.deepEqual(ids({}), ["anthropic:claude-sonnet-5-5", "gemini:gemini-3.8-flash", "openrouter:anthropic/claude-sonnet-5.5", "muse:muse-spark-1.3"]);
  assert.deepEqual(ids({ FILER_MODEL: "claude-opus-5-5" })[0], "anthropic:claude-opus-5-5");
  assert.deepEqual(ids({ ODELIA_MODELS: "gemini:gemini-3.6-flash, openrouter:meta/muse-spark-1.3,anthropic" }), ["gemini:gemini-3.6-flash", "openrouter:meta/muse-spark-1.3", "anthropic:claude-sonnet-5-5"]);
  assert.deepEqual(ids({ ODELIA_MODELS: "gemini", FILER_MODELS: "muse,nonsense:x,anthropic:claude-sonnet-5-5,anthropic:claude-sonnet-5-5" }), ["muse:muse-spark-1.3", "anthropic:claude-sonnet-5-5"]);
  // only the seats with a key and the data rules' leave
  assert.deepEqual(usableSeats(envOf({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })).map((s) => s.vendor), ["anthropic"], "Gemini waits for GEMINI_PAID=1");
});

test("failover: Anthropic's usage limit (400), then Gemini's 429, then OpenRouter answers; the log names who answered and carries no key", async () => {
  const lines: string[] = [], errs: string[] = [];
  const m = mock({
    anthropic: () => json({ type: "error", error: { type: "invalid_request_error", message: `You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC. key ${KEYS.ANTHROPIC_API_KEY}` } }, 400),
    gemini: () => json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } }, 429),
    openrouter: () => chatSays("click", { selector: "button:Next" }),
  });
  const realErr = console.error;
  console.error = (...a: unknown[]) => { errs.push(a.join(" ")); };
  try {
    let t = 1_000_000;
    const r = new Router({ env: envOf(KEYS), fetch: m.f, now: () => t, log: (l) => lines.push(l) });
    const out = await r.ask(ASK);
    assert.deepEqual(out, { name: "click", input: { selector: "button:Next" } });
    assert.deepEqual(m.order(), ["anthropic", "gemini", "openrouter"], "in FILER_MODELS order, one try each");
    assert.equal(r.by, "openrouter:anthropic/claude-sonnet-5.5");
    assert.equal(r.calls, 3);
    assert.ok(lines.some((l) => /model openrouter:anthropic\/claude-sonnet-5\.5 answered after anthropic:claude-sonnet-5-5 400: invalid_request_error: You have reached your specified API usage limits/.test(l)));
    for (const l of [...lines, ...errs]) for (const k of Object.values(KEYS)) if (k.length > 4) assert.ok(!l.includes(k), `no key in: ${l}`);
    // the next step: the two that are down sit out; OpenRouter goes first
    m.sent.length = 0;
    await r.ask(ASK);
    assert.deepEqual(m.order(), ["openrouter"]);
    // after the cooldown, Anthropic is first again
    t += 121_000; m.sent.length = 0;
    await r.ask(ASK);
    assert.deepEqual(m.order(), ["anthropic", "gemini", "openrouter"]);
  } finally { console.error = realErr; }
});

test("failover: a 5xx, a dropped connection and an answer with no tool each go to the next seat; every seat failing is a model error", async () => {
  const realErr = console.error; console.error = () => undefined;
  try {
    const env = envOf({ ...KEYS, FILER_MODELS: "anthropic,gemini,muse,openrouter" });
    const m = mock({
      anthropic: () => json({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529),
      // gemini: no handler, the connection fails
      muse: () => json({ id: "x", choices: [{ message: { role: "assistant", content: "I'd click Next." }, finish_reason: "stop" }] }),
      openrouter: () => chatSays("wait", { ms: 500 }),
    });
    const out = await new Router({ env, fetch: m.f, ...quiet }).ask(ASK);
    assert.equal(out.name, "wait");
    assert.deepEqual(m.order(), ["anthropic", "gemini", "muse", "openrouter"]);
    const none = mock({ anthropic: () => json({ error: { type: "authentication_error", message: "invalid x-api-key" } }, 401), openrouter: () => json({}, 503), muse: () => json({}, 500) });
    await assert.rejects(new Router({ env, fetch: none.f, ...quiet }).ask(ASK), (e: Error) => /^model error: every model failed/.test(e.message) && !Object.values(KEYS).some((k) => k.length > 4 && e.message.includes(k)));
  } finally { console.error = realErr; }
});

test("data rules before anything is sent: zero data retention keeps only listed seats, and refuses when none is left", async () => {
  const realErr = console.error; console.error = () => undefined;
  try {
    const m = mock({ anthropic: () => json({ error: { message: "limit" } }, 429), gemini: () => geminiSays("done", { confirmation_number: "1", summary: "s" }), openrouter: () => chatSays("done", {}) });
    const env = envOf({ ...KEYS, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic:claude-sonnet-5-5,openrouter" });
    await new Router({ env, fetch: m.f, ...quiet }).ask(ASK);
    assert.deepEqual(m.order(), ["anthropic", "openrouter"], "Gemini isn't on the list, so it never sees the filing");
    const none = mock({});
    await assert.rejects(new Router({ env: envOf({ ...KEYS, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "telnyx" }), fetch: none.f, ...quiet }).ask(ASK), new RegExp(ZDR_REFUSED.slice(0, 30)));
    assert.equal(none.sent.length, 0);
    const unpaid = mock({ gemini: () => geminiSays("done", {}) });
    await assert.rejects(new Router({ env: envOf({ GEMINI_API_KEY: "g" }), fetch: unpaid.f, ...quiet }).ask(ASK), /no model key/);
    assert.equal(unpaid.sent.length, 0, "an unpaid Gemini key never gets a filing");
  } finally { console.error = realErr; }
});

test("the filing step, the status check and teach mode's labels all go through the same router", async () => {
  const realErr = console.error; console.error = () => undefined;
  try {
    const m = mock({ anthropic: () => json({ error: { type: "invalid_request_error", message: "You have reached your specified API usage limits" } }, 400),
      gemini: (s) => {
        const names = ((s.body.tools as any)[0].functionDeclarations as { name: string }[]).map((d) => d.name);
        return names.includes("label_steps") ? geminiSays("label_steps", { pages: [{ heading: "Start" }], fields: [] }) : names.includes("read_status") ? geminiSays("give_up", { reason: "x" }) : geminiSays("wait", { ms: 1 });
      } });
    const router = new Router({ env: envOf({ ANTHROPIC_API_KEY: KEYS.ANTHROPIC_API_KEY, GEMINI_API_KEY: KEYS.GEMINI_API_KEY, GEMINI_PAID: "1" }), fetch: m.f, ...quiet });
    const st = { url: "https://portal.example.gov/x", title: "t", headings: [], text: "", controls: [], buttons: [], links: [] } as any;
    const filing = { payload: { official: "x", fields: [] } } as any;
    assert.equal((await new FilerModel(router).next({ filing, agency: "a", state: st, recent: [] })).name, "wait");
    assert.equal((await new FilerStatusModel(router).next({ job: { title: { en: "t" }, agency: null } as any, state: st, recent: [], signedIn: false })).name, "give_up");
    assert.deepEqual(await new FilerLabeler(router).label({ host: "h", official: "o", pages: [], unmapped: [], facts: [] }), { pages: [{ heading: "Start" }], fields: [] });
    assert.ok(STATUS_TOOLS.length > 0);
  } finally { console.error = realErr; }
});

test("env: any one model key runs the worker, one alone is warned about, and an unpaid Gemini key doesn't count", () => {
  const base = { SUPABASE_URL: "https://esquxzcfsylffuijvzec.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", RENDER_EXTERNAL_URL: "https://placetta-filer.onrender.com" };
  assert.deepEqual(checkEnv(base).missing.map((m) => m.key), ["ANTHROPIC_API_KEY"]);
  assert.deepEqual(checkEnv({ ...base, GEMINI_API_KEY: "g" }).missing.map((m) => m.key), ["ANTHROPIC_API_KEY"]);
  const one = checkEnv({ ...base, OPENROUTER_API_KEY: "o" });
  assert.equal(one.ok, true);
  assert.ok(one.warnings.some((w) => /Only one model/.test(w)));
  const two = checkEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-x", GEMINI_API_KEY: "g", GEMINI_PAID: "1" });
  assert.deepEqual(two.models, ["anthropic:claude-sonnet-5-5", "gemini:gemini-3.8-flash"]);
  assert.ok(!two.warnings.some((w) => /Only one model/.test(w)));
  assert.equal(redact(`x-api-key sk-ant-abc123 Bearer sk-or-v1-zzz AIzaSyAAAAAAAAAAAAAAAAAAAAAAAA ${KEYS.MUSE_API_KEY}`, envOf(KEYS)).includes("sk-"), false);
});

test("a free Gemini key (no GEMINI_PAID): only a synthetic workspace's run with GEMINI_FREE_SYNTHETIC=1, never a customer's", async () => {
  const free = { GEMINI_API_KEY: KEYS.GEMINI_API_KEY };
  const gem = { vendor: "gemini" as const, model: "gemini-3.8-flash" };
  assert.equal(refusal(envOf(free), gem), "gemini_unpaid", "a customer's run: refused");
  assert.equal(refusal(envOf(free), gem, { synthetic: true }), "gemini_unpaid", "a rehearsal without the switch: refused");
  assert.equal(refusal(envOf({ ...free, GEMINI_FREE_SYNTHETIC: "1" }), gem), "gemini_unpaid", "the switch alone never opens it to a customer");
  assert.equal(refusal(envOf({ ...free, GEMINI_FREE_SYNTHETIC: "1" }), gem, { synthetic: true }), null, "a rehearsal with the switch: allowed");
  assert.equal(refusal(envOf({ ...free, GEMINI_PAID: "1" }), gem), null, "the paid tier as before");

  const m = mock({ gemini: () => geminiSays("wait", { ms: 1 }) });
  const router = new Router({ env: envOf({ ...free, GEMINI_FREE_SYNTHETIC: "1" }), fetch: m.f, ...quiet });
  const model = new FilerModel(router);
  const st = { url: "https://portal.example.gov/x", title: "t", headings: [], text: "", controls: [], buttons: [], links: [] } as any;
  const filing = { payload: { official: "x", fields: [] } } as any;
  await assert.rejects(model.next({ filing, agency: "a", state: st, recent: [] }), /no model key/, "a customer's step: no seat, nothing sent");
  assert.equal(m.sent.length, 0, "nothing reached Google");
  model.rehearsal(true);
  assert.equal((await model.next({ filing, agency: "a", state: st, recent: [] })).name, "wait", "a rehearsal: Gemini answers");
  assert.deepEqual(m.order(), ["gemini"]);
  model.rehearsal(false);
  await assert.rejects(model.next({ filing, agency: "a", state: st, recent: [] }), /no model key/, "the next customer's run: refused again");
  assert.equal(m.sent.length, 1);
});

test("env: a free Gemini key with GEMINI_FREE_SYNTHETIC=1 starts the worker for rehearsals, and says customers wait", () => {
  const base = { SUPABASE_URL: "https://esquxzcfsylffuijvzec.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x", RENDER_EXTERNAL_URL: "https://placetta-filer.onrender.com" };
  const e = checkEnv({ ...base, GEMINI_API_KEY: "g", GEMINI_FREE_SYNTHETIC: "1" });
  assert.deepEqual(e.missing, []);
  assert.ok(e.warnings.some((w) => /rehearsals on synthetic workspaces only/.test(w)));
  assert.deepEqual(checkEnv({ ...base, GEMINI_API_KEY: "g" }).missing.map((m) => m.key), ["ANTHROPIC_API_KEY"], "without the switch, as before");
});
