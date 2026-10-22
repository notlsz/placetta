// Prompt caching on the server: Anthropic's breakpoints at the end of each stable segment, OpenAI's and Gemini's
// cached-token counts read and priced at each vendor's cached rate, OpenAI's cache key, and Gemini's explicit context
// cache (made once, reused, and dropped for the plain call when Gemini refuses it).
// Run: deno test supabase/functions/_shared/cache_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { callModel, fromOpenAI, toOpenAI, withCache } from "./llm.ts";
import { costOf } from "./ai_cost.ts";
import { cacheRates } from "./cache_rates.ts";
import { __forTests, cacheBody, ensureCache, MIN_CACHE_CHARS, stablePart, useCache } from "./gemini_cache.ts";

type B = Record<string, unknown>;
const RULES = "R".repeat(MIN_CACHE_CHARS), PROFILE = "Never forget (from the records):\n- Legal entity: Acme Tea LLC\n", TAIL = "Today is 2026-10-22.\n\nWorkspace:\n{}";
const payload = () => ({ model: "m", max_tokens: 500, system: RULES + PROFILE + TAIL, cache_breaks: [RULES.length, RULES.length + PROFILE.length], cache_key: "abcdef0123456789",
  messages: [{ role: "user", content: "Where do things stand?" }], tools: [{ name: "check_progress", description: "d", input_schema: { type: "object", properties: {} } }] });

Deno.test("Anthropic: a breakpoint at the end of the rules and of the profile, then the tools' and the last message's", () => {
  const p = withCache(payload()) as B;
  const sys = p.system as B[];
  assertEquals(sys.length, 3);
  assertEquals(sys.map((b) => String(b.text).length), [RULES.length, PROFILE.length, TAIL.length]);
  assert(sys[0].cache_control && sys[1].cache_control && !sys[2].cache_control, "the two stable segments are cached, the per-run part isn't");
  const tools = p.tools as B[], msgs = p.messages as { content: B[] }[];
  assert(tools[0].cache_control && msgs[0].content[0].cache_control);
  const n = sys.filter((b) => b.cache_control).length + tools.filter((t) => t.cache_control).length + msgs.flatMap((m) => m.content).filter((b) => b.cache_control).length;
  assertEquals(n, 4, "four breakpoints, the API's limit");
  assert(!("cache_breaks" in p) && !("cache_key" in p), "our fields never reach the provider");
  assertEquals((sys as B[]).map((b) => b.text).join(""), payload().system, "the same text, split");
});

Deno.test("Anthropic: without breaks, the whole system prompt is one cached block, as before", () => {
  const p = withCache({ system: "sys", messages: [] }) as B;
  assertEquals(p.system, [{ type: "text", text: "sys", cache_control: { type: "ephemeral" } }]);
});

Deno.test("OpenAI and Gemini: the cached share of the prompt is read and priced at the vendor's rate", () => {
  const d = fromOpenAI({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 10_000, completion_tokens: 100, prompt_tokens_details: { cached_tokens: 8_000 } } }, "gemini:gemini-3.8-flash") as { usage: B };
  assertEquals(d.usage, { input_tokens: 2_000, output_tokens: 100, cache_read_input_tokens: 8_000 });
  const plain = fromOpenAI({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 7, completion_tokens: 2 } }, "x") as { usage: B };
  assertEquals(plain.usage, { input_tokens: 7, output_tokens: 2 }, "no cached tokens, the same usage as before");
  assertEquals(cacheRates("gemini:gemini-2.5-flash"), { read: 0.1, write: 1 });
  assertEquals(cacheRates("gemini:gemini-3.8-flash"), { read: 0.1, write: 1 });
  assertEquals(cacheRates("anthropic:claude-sonnet-5-5"), { read: 0.05, write: 1.25 });
  assertEquals(cacheRates("anthropic:claude-haiku-4-5-20251001"), { read: 0.1, write: 1.25 });
  assertEquals(cacheRates("openai:gpt-4o"), { read: 0.5, write: 1 });
  const fresh = costOf("gemini:gemini-2.5-flash", { input_tokens: 10_000, output_tokens: 0 });
  const cached = costOf("gemini:gemini-2.5-flash", { input_tokens: 2_000, cache_read_input_tokens: 8_000, output_tokens: 0 });
  assert(Math.abs(cached / fresh - (2_000 + 8_000 * 0.1) / 10_000) < 0.01, "Gemini 2.5's cached tokens cost a tenth ($0.03 of $0.30)");
  assertEquals(costOf("anthropic:claude-sonnet-5-5", { input_tokens: 1000, cache_read_input_tokens: 6500, cache_creation_input_tokens: 1000, output_tokens: 500 }) > 0, true);
});

Deno.test("OpenAI: calls with the same stable prefix carry the same cache key", async () => {
  const sent: B[] = [];
  const f = (async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: "x", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1 } }), { status: 200 }); }) as unknown as typeof fetch;
  const env: Record<string, string> = { OPENAI_API_KEY: "k", AGENT_ROUTE_PLAN: "openai:gpt-5" };
  const r = await callModel((k) => env[k], { payload: payload(), role: "plan", research: false, beta: null }, "claude", null, f);
  assert(r.ok);
  assertEquals(sent[0].prompt_cache_key, "abcdef0123456789");
  assert(!("cache_breaks" in sent[0]) && !("cache_key" in sent[0]));
  assertEquals((sent[0].messages as B[])[0].content, payload().system, "the system message is the whole prompt, stable part first");
});

Deno.test("Gemini explicit cache: the stable prefix and tools stored once, reused, the rest moved into the conversation", async () => {
  __forTests.live.clear();
  const part = stablePart(payload())!;
  assertEquals(part.prefix, RULES + PROFILE);
  assertEquals(part.rest, TAIL);
  assertEquals(stablePart({ system: "short", cache_breaks: [3] }), null, "too short to cache");
  const body = cacheBody("gemini-2.5-flash", part.prefix, payload().tools as B[]) as { model: string; systemInstruction: { parts: { text: string }[] }; tools: { functionDeclarations: B[] }[]; ttl: string };
  assertEquals(body.model, "models/gemini-2.5-flash");
  assertEquals(body.tools[0].functionDeclarations[0].name, "check_progress");
  let made = 0;
  const f = (async (url: string) => { if (url.endsWith("/cachedContents")) { made++; return new Response(JSON.stringify({ name: "cachedContents/abc" }), { status: 200 }); } return new Response("?", { status: 404 }); }) as unknown as typeof fetch;
  const env = (k: string) => ({ GEMINI_API_KEY: "g" } as Record<string, string>)[k];
  const c1 = await ensureCache(env, "gemini-2.5-flash", payload(), f, 1_000);
  const c2 = await ensureCache(env, "gemini-2.5-flash", payload(), f, 2_000);
  assertEquals([c1?.name, c2?.name, made], ["cachedContents/abc", "cachedContents/abc", 1], "made once, reused within the hour");
  const used = useCache(toOpenAI(payload(), "gemini-2.5-flash"), c1!) as { messages: { role: string; content: string }[]; tools?: unknown; extra_body: { google: { cached_content: string } } };
  assert(!used.tools && used.messages.every((m) => m.role !== "system"), "no system message and no tools beside a cache (Gemini refuses them)");
  assert(used.messages[0].content.includes("Today is 2026-10-22."), "the per-run part goes first in the conversation");
  assertEquals(used.extra_body.google.cached_content, "cachedContents/abc");
});

Deno.test("Gemini explicit cache: on only when asked, and a refused cache falls back to the plain call", async () => {
  __forTests.live.clear();
  const posted: B[] = [];
  let refused = false;
  const f = (async (url: string, init: { body: string }) => {
    if (url.endsWith("/cachedContents")) return new Response(JSON.stringify({ name: "cachedContents/x" }), { status: 200 });
    const b = JSON.parse(init.body); posted.push(b);
    if (b.extra_body && !refused) { refused = true; return new Response("CachedContent not found", { status: 400 }); }
    return new Response(JSON.stringify({ id: "x", choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 1 } }), { status: 200 });
  }) as unknown as typeof fetch;
  const base: Record<string, string> = { GEMINI_API_KEY: "g", GEMINI_PAID: "1", AGENT_ROUTE_PLAN: "gemini:gemini-2.5-flash" };
  await callModel((k) => base[k], { payload: payload(), role: "plan", research: false, beta: null }, "claude", null, f);
  assert(!posted[0].extra_body, "off by default: implicit caching only");
  posted.length = 0;
  const on: Record<string, string> = { ...base, GEMINI_CONTEXT_CACHE: "1" };
  const r = await callModel((k) => on[k], { payload: payload(), role: "plan", research: false, beta: null }, "claude", null, f);
  assert(r.ok && posted.length === 2 && posted[0].extra_body && !posted[1].extra_body && (posted[1].messages as B[])[0].role === "system", "refused once, then the same call without the cache");
});
