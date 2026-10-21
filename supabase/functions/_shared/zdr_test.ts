// deno test -A supabase/functions/_shared/zdr_test.ts
// Zero data retention: with AI_ZDR_REQUIRED=1 customer data reaches only the providers, models and modes on
// AI_ZDR_PROVIDERS, and a call with nothing left is refused before anything is sent. Off, nothing changes.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { callModel, canConverse, candidates } from "./llm.ts";
import { voiceReady } from "./odelia.ts";
import { ZDR_REFUSED, zdrAllows, zdrList, zdrWebTools } from "./zdr.ts";

const envOf = (e: Record<string, string>) => (k: string) => e[k];
const payload = { messages: [{ role: "user", content: "hello" }], max_tokens: 10, tools: [{ type: "web_search_20250305", name: "web_search" }, { name: "read_doc", input_schema: { type: "object" } }] };

Deno.test("off by default: every provider allowed, web tools too", () => {
  const env = envOf({ AI_ZDR_PROVIDERS: "anthropic" });
  assert(zdrAllows(env, "gemini") && zdrAllows(env, "groq", "openai/gpt-oss-120b") && zdrAllows(env, "telnyx"));
  assert(zdrWebTools(env));
});

Deno.test("required: a provider, one model, or a mode; case and spaces don't matter", () => {
  const env = envOf({ AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: " Anthropic:claude-sonnet-5-5 , groq,anthropic:web-tools " });
  assertEquals(zdrList(env), ["anthropic:claude-sonnet-5-5", "groq", "anthropic:web-tools"]);
  assert(zdrAllows(env, "groq", "openai/gpt-oss-120b"));
  assert(zdrAllows(env, "anthropic", "claude-sonnet-5-5"));
  assert(!zdrAllows(env, "anthropic", "claude-opus-5-5"), "only the listed model");
  assert(zdrAllows(env, "anthropic"), "the provider counts when one of its models is listed");
  assert(!zdrAllows(env, "gemini") && !zdrAllows(env, "telnyx") && !zdrAllows(env, "azure_speech"));
  assert(zdrWebTools(env));
  // web-tools alone doesn't make Anthropic's models allowed
  assert(!zdrAllows(envOf({ AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic:web-tools" }), "anthropic"));
  // required with an empty list: nothing
  assert(!zdrAllows(envOf({ AI_ZDR_REQUIRED: "1" }), "anthropic"));
});

Deno.test("the model routes keep only allowed providers and models", () => {
  const keys = { ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", GEMINI_PAID: "1", GROQ_API_KEY: "q" };
  const call = { payload, role: "plan" as const, research: false, beta: null };
  const all = candidates(envOf(keys), call, "claude-sonnet-5-5").map(([p]) => p);
  assert(all.includes("gemini") && all.includes("groq") && all.includes("anthropic"));
  const only = candidates(envOf({ ...keys, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" }), call, "claude-sonnet-5-5");
  assertEquals(only.map(([p]) => p), ["anthropic"]);
  // only Opus is listed: deep work (which the agent runs on Opus) may go; plan work (on Sonnet) has nowhere to go
  const zOpus = envOf({ ...keys, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic:claude-opus-5-5" });
  assertEquals(candidates(zOpus, { ...call, role: "deep" }, "claude-opus-5-5"), [["anthropic", "claude-opus-5-5"]]);
  assertEquals(candidates(zOpus, call, "claude-sonnet-5-5"), []);
  assert(!canConverse(envOf({ ...keys, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "openai" })), "no keyed provider is allowed: Odelia reports not configured");
});

Deno.test("a call with no allowed provider is refused before anything is sent", async () => {
  const sent: string[] = [];
  const f = ((u: string) => { sent.push(u); return Promise.resolve(new Response("{}")); }) as typeof fetch;
  const env = envOf({ ANTHROPIC_API_KEY: "a", GROQ_API_KEY: "q", AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "openai" });
  const r = await callModel(env, { payload, role: "plan", research: false, beta: null }, "claude-sonnet-5-5", null, f);
  assertEquals([r.ok, r.status, r.text], [false, 503, ZDR_REFUSED]);
  assertEquals(sent, []);
});

Deno.test("web tools are dropped unless anthropic:web-tools is listed", async () => {
  const bodies: Record<string, unknown>[] = [];
  const f = ((_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } })));
  }) as typeof fetch;
  const research = { search: { type: "web_search_20250305", name: "web_search" }, fetch: { type: "web_fetch_20250910", name: "web_fetch" }, pageTools: [] };
  await callModel(envOf({ ANTHROPIC_API_KEY: "a", AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" }), { payload, role: "plan", research: true, beta: "web-fetch-2025-09-10" }, "claude-sonnet-5-5", research, f);
  assertEquals((bodies[0].tools as { name: string }[]).map((t) => t.name), ["read_doc"]);
  await callModel(envOf({ ANTHROPIC_API_KEY: "a", AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic,anthropic:web-tools" }), { payload, role: "plan", research: true, beta: "b" }, "claude-sonnet-5-5", research, f);
  assertEquals((bodies[1].tools as { name: string }[]).map((t) => t.name), ["web_search", "read_doc"]);
});

Deno.test("phone calls need telnyx on the list when ZDR is required", () => {
  const voice = { TELNYX_API_KEY: "k", TELNYX_PUBLIC_KEY: "p", ODELIA_NUMBER: "+12125550100", TELNYX_VOICE_CONNECTION_ID: "c", TELNYX_ASSISTANT_ID: "a" };
  assert(voiceReady(envOf(voice)));
  assert(!voiceReady(envOf({ ...voice, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic" })));
  assert(voiceReady(envOf({ ...voice, AI_ZDR_REQUIRED: "1", AI_ZDR_PROVIDERS: "anthropic,telnyx" })));
});
