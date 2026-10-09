// Run: node --experimental-strip-types supabase/functions/_shared/llm.test.ts
import { callModel, toOpenAI, fromOpenAI } from "./llm.ts";
let ok = 0, bad = 0; const check = (n: string, c: boolean) => { c ? ok++ : bad++; console.log((c ? "PASS " : "FAIL ") + n); };
const calls: string[] = [];
const mk = (plan: Record<string, () => Response>) => (async (url: string, init: any) => { calls.push(url); const h = Object.keys(plan).find(k => url.includes(k)); return h ? plan[h]() : new Response("nope", { status: 404 }); }) as any;
const anth = (o: any = {}) => new Response(JSON.stringify({ content: [{ type: "text", text: "from claude" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 }, ...o }), { status: 200 });
const oai = (msg: any) => new Response(JSON.stringify({ id: "x", choices: [{ message: msg, finish_reason: msg.tool_calls ? "tool_calls" : "stop" }], usage: { prompt_tokens: 7, completion_tokens: 2 } }), { status: 200 });
const payload = { model: "m", max_tokens: 500, system: "sys", messages: [
  { role: "user", content: "find permits" },
  { role: "assistant", content: [{ type: "text", text: "checking" }, { type: "tool_use", id: "t1", name: "lookup", input: { city: "LA" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "3 permits" }] }] } ],
  tools: [{ name: "lookup", description: "d", input_schema: { type: "object", properties: { city: { type: "string" } } } }] };

// 1. translation
const o = toOpenAI(payload, "deepseek-chat") as any;
check("system first", o.messages[0].role === "system");
check("assistant tool_calls", o.messages[2].tool_calls[0].function.name === "lookup" && JSON.parse(o.messages[2].tool_calls[0].function.arguments).city === "LA");
check("tool result message", o.messages[3].role === "tool" && o.messages[3].tool_call_id === "t1" && o.messages[3].content === "3 permits");
check("tools mapped", o.tools[0].function.parameters.properties.city.type === "string");
const back = fromOpenAI({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "lookup", arguments: "{\"city\":\"SF\"}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }, "x") as any;
check("tool_use back", back.content[0].type === "tool_use" && back.content[0].input.city === "SF" && back.stop_reason === "tool_use");

// 2. no route: Anthropic as before
let env: Record<string, string> = { ANTHROPIC_API_KEY: "a" };
let r = await callModel(k => env[k], { payload, tier: "standard", research: false, beta: null }, "claude-sonnet", null, mk({ anthropic: () => anth() }));
check("default anthropic", r.ok && r.model === "anthropic:claude-sonnet");

// 3. fast route: cheapest with a key wins, translated
env = { ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d", AGENT_ROUTE_FAST: "deepseek:deepseek-chat,gemini:gemini-flash" };
r = await callModel(k => env[k], { payload, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({ deepseek: () => oai({ content: "cheap answer" }) }));
check("deepseek used", r.ok && r.model === "deepseek:deepseek-chat" && (r.data as any).content[0].text === "cheap answer" && (r.data as any).usage.input_tokens === 7);

// 4. fallthrough when busy
calls.length = 0;
r = await callModel(k => env[k], { payload, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({ deepseek: () => new Response("busy", { status: 429 }), anthropic: () => anth() }));
check("falls to anthropic on 429", r.ok && r.model === "anthropic:claude-haiku" && calls.length === 2);

// 5. research goes to anthropic first
calls.length = 0; env = { ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d", AGENT_ROUTE: "deepseek:deepseek-chat" };
r = await callModel(k => env[k], { payload, tier: "standard", research: true, beta: "b" }, "claude-sonnet", { search: {}, fetch: {}, pageTools: [] }, mk({ anthropic: () => anth(), deepseek: () => oai({ content: "x" }) }));
check("research prefers anthropic", r.model === "anthropic:claude-sonnet" && calls[0].includes("anthropic"));

// 6. free models skipped unless allowed, and never with files
env = { OPENROUTER_API_KEY: "o", ANTHROPIC_API_KEY: "a", AGENT_ROUTE_FAST: "openrouter:deepseek/deepseek-chat:free" };
calls.length = 0;
r = await callModel(k => env[k], { payload, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free skipped by default", r.model === "anthropic:claude-haiku");
env.AGENT_ALLOW_FREE = "1";
r = await callModel(k => env[k], { payload, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free used when allowed", r.model === "openrouter:deepseek/deepseek-chat:free");
const withImg = { ...payload, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "read" }] }] };
r = await callModel(k => env[k], { payload: withImg, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free never gets customer files", r.model === "anthropic:claude-haiku");

// 7. no keys
r = await callModel(k => undefined, { payload, tier: "fast", research: false, beta: null }, "claude-haiku", null, mk({}));
check("no keys -> 503", !r.ok && r.status === 503);
console.log(`${ok} passed, ${bad} failed`);
