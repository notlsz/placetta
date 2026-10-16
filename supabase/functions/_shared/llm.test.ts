// Run: deno test supabase/functions/_shared/llm.test.ts
import { callModel, candidates, DEFAULT_ROUTES, fromOpenAI, ROLES, routeFor, toOpenAI, vendorOk, type Role } from "./llm.ts";
let ok = 0, bad = 0; const check = (n: string, c: boolean) => { c ? ok++ : bad++; console.log((c ? "PASS " : "FAIL ") + n); };
const calls: string[] = [];
// the vendor each URL belongs to (Gemini's OpenAI-compatible endpoint is on googleapis.com)
const vendorOfUrl = (url: string) => url.includes("anthropic") ? "anthropic" : url.includes("googleapis") ? "gemini" : url.includes("deepseek") ? "deepseek" : url.includes("openrouter") ? "openrouter" : url.includes("groq") ? "groq" : url.includes("openai") ? "openai" : "";
const mk = (plan: Record<string, () => Response>) => (async (url: string, init: any) => { calls.push(url); const h = plan[vendorOfUrl(url)]; return h ? h() : new Response("nope", { status: 404 }); }) as any;
const anth = (o: any = {}) => new Response(JSON.stringify({ content: [{ type: "text", text: "from claude" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 3 }, ...o }), { status: 200 });
const oai = (msg: any) => new Response(JSON.stringify({ id: "x", choices: [{ message: msg, finish_reason: msg.tool_calls ? "tool_calls" : "stop" }], usage: { prompt_tokens: 7, completion_tokens: 2 } }), { status: 200 });
const payload = { model: "m", max_tokens: 500, system: "sys", messages: [
  { role: "user", content: "find permits" },
  { role: "assistant", content: [{ type: "text", text: "checking" }, { type: "tool_use", id: "t1", name: "lookup", input: { city: "LA" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "3 permits" }] }] } ],
  tools: [{ name: "lookup", description: "d", input_schema: { type: "object", properties: { city: { type: "string" } } } }] };
const only = (o: Record<string, string>) => (k: string) => o[k];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const names = (r: [string, string][]) => r.map(([p, m]) => `${p}:${m}`);

// 1. translation
const o = toOpenAI(payload, "deepseek-chat") as any;
check("system first", o.messages[0].role === "system");
check("assistant tool_calls", o.messages[2].tool_calls[0].function.name === "lookup" && JSON.parse(o.messages[2].tool_calls[0].function.arguments).city === "LA");
check("tool result message", o.messages[3].role === "tool" && o.messages[3].tool_call_id === "t1" && o.messages[3].content === "3 permits");
check("tools mapped", o.tools[0].function.parameters.properties.city.type === "string");
const back = fromOpenAI({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "lookup", arguments: "{\"city\":\"SF\"}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }, "x") as any;
check("tool_use back", back.content[0].type === "tool_use" && back.content[0].input.city === "SF" && back.stop_reason === "tool_use");
const withPdf = toOpenAI({ messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "QUJD" } }, { type: "text", text: "read" }] }] }, "gemini-2.5-flash") as any;
check("a PDF travels as a file part", withPdf.messages[0].content[0].type === "file" && /^data:application\/pdf;base64,QUJD$/.test(withPdf.messages[0].content[0].file.file_data));

// 2. the default routes, by role
{
  const env = only({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
  check("plan: Sonnet, then Gemini Pro", same(names(routeFor(env, "plan", "claude-sonnet-5-5")), ["anthropic:claude-sonnet-5-5", "gemini:gemini-2.5-pro"]));
  check("review: a different vendor first, Sonnet behind it", same(names(routeFor(env, "review", "claude-sonnet-5-5")), ["gemini:gemini-2.5-pro", "anthropic:claude-sonnet-5-5"]));
  for (const r of ["extract", "translate", "short", "watch"] as Role[])
    check(`${r}: Flash-Lite, Flash, Haiku`, same(names(routeFor(env, r, "claude-sonnet-5-5")), ["gemini:gemini-2.5-flash-lite", "gemini:gemini-2.5-flash", "anthropic:claude-haiku-4-5-20251001"]));
  check("draft: Flash, Haiku", same(names(routeFor(env, "draft", "claude-sonnet-5-5")), ["gemini:gemini-2.5-flash", "anthropic:claude-haiku-4-5-20251001"]));
  check("deep: the deep model alone", same(names(routeFor(env, "deep", "claude-opus-5-5")), ["anthropic:claude-opus-5-5"]));
  check("AGENT_MODEL_FAST picks the cheap Anthropic model", names(routeFor(only({ AGENT_MODEL_FAST: "claude-haiku-9" }), "extract", "x")).pop() === "anthropic:claude-haiku-9");
  check("every role has a default route ending in Anthropic", ROLES.every(r => { const d = DEFAULT_ROUTES[r]; return d.length > 0 && d.some(([p]) => p === "anthropic"); }));
  // the old tier names still route
  check("tier fast is extract", same(routeFor(env, "fast", "x"), routeFor(env, "extract", "x")));
  check("tier standard is plan", same(routeFor(env, "standard", "x"), routeFor(env, "plan", "x")));
}

// 3. secrets per role, and the three old names as aliases
{
  check("AGENT_ROUTE_REVIEW wins", names(routeFor(only({ AGENT_ROUTE_REVIEW: "openai:gpt-5-mini" }), "review", "claude-sonnet-5-5"))[0] === "openai:gpt-5-mini");
  check("a route that leaves Anthropic out gets it added", names(routeFor(only({ AGENT_ROUTE_SHORT: "openai:gpt-5-mini" }), "short", "x")).pop() === "anthropic:claude-haiku-4-5-20251001");
  check("AGENT_ROUTE_FAST is extract", names(routeFor(only({ AGENT_ROUTE_FAST: "deepseek:deepseek-chat" }), "extract", "x"))[0] === "deepseek:deepseek-chat");
  check("AGENT_ROUTE is plan", names(routeFor(only({ AGENT_ROUTE: "deepseek:deepseek-chat" }), "plan", "x"))[0] === "deepseek:deepseek-chat");
  check("AGENT_ROUTE_DEEP is deep", names(routeFor(only({ AGENT_ROUTE_DEEP: "gemini:gemini-2.5-pro" }), "deep", "x"))[0] === "gemini:gemini-2.5-pro");
  check("AGENT_ROUTE_EXTRACT beats the old name", names(routeFor(only({ AGENT_ROUTE_FAST: "deepseek:deepseek-chat", AGENT_ROUTE_EXTRACT: "openai:gpt-5-nano" }), "extract", "x"))[0] === "openai:gpt-5-nano");
  check("AGENT_ROUTE does not leak into other roles", names(routeFor(only({ AGENT_ROUTE: "deepseek:deepseek-chat" }), "extract", "x"))[0] === "gemini:gemini-2.5-flash-lite");
}

// 4. data-use guardrails: who may see what
{
  const none = only({});
  check("Anthropic and OpenAI always", vendorOk(none, "anthropic", { hasFiles: true }) && vendorOk(none, "openai", { hasFiles: true, role: "plan" }));
  check("Gemini without GEMINI_PAID: only a public-pages watch scan without files", !vendorOk(none, "gemini", { hasFiles: false, role: "plan" }) && !vendorOk(none, "gemini", { hasFiles: false, role: "watch" })
    && !vendorOk(none, "gemini", { hasFiles: true, role: "watch", publicOnly: true }) && vendorOk(none, "gemini", { hasFiles: false, role: "watch", publicOnly: true }));
  check("Gemini paid: everything", vendorOk(only({ GEMINI_PAID: "1" }), "gemini", { hasFiles: true, role: "extract" }));
  check("DeepSeek only when allowed, never files", !vendorOk(none, "deepseek", { hasFiles: false }) && vendorOk(only({ ALLOW_DEEPSEEK: "1" }), "deepseek", { hasFiles: false }) && !vendorOk(only({ ALLOW_DEEPSEEK: "1" }), "deepseek", { hasFiles: true }));
  check("OpenRouter and Groq likewise", !vendorOk(none, "openrouter", { hasFiles: false }) && vendorOk(only({ ALLOW_OPENROUTER: "1" }), "openrouter", { hasFiles: false }) && !vendorOk(only({ ALLOW_GROQ: "1" }), "groq", { hasFiles: true }) && vendorOk(only({ ALLOW_GROQ: "1" }), "groq", { hasFiles: false }));
  check("an unknown vendor never", !vendorOk(only({}), "mystery", { hasFiles: false }));
  // through the whole filter
  const unpaid = only({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" });
  check("unpaid Gemini: extract goes straight to Haiku", same(names(candidates(unpaid, { payload, role: "extract", research: false, beta: null }, "x")), ["anthropic:claude-haiku-4-5-20251001"]));
  check("unpaid Gemini: a watch run with the workspace in it may not", names(candidates(unpaid, { payload, role: "watch", research: false, beta: null }, "x"))[0] === "anthropic:claude-haiku-4-5-20251001");
  check("unpaid Gemini: a public-pages scan may", names(candidates(unpaid, { payload, role: "watch", research: false, beta: null, publicOnly: true }, "x"))[0] === "gemini:gemini-2.5-flash-lite");
  const paid = only({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", GEMINI_PAID: "1" });
  check("paid Gemini: extract runs on Flash-Lite", names(candidates(paid, { payload, role: "extract", research: false, beta: null }, "x"))[0] === "gemini:gemini-2.5-flash-lite");
  const pdf = { ...payload, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "AAA" } }, { type: "text", text: "read" }] }] };
  check("a PDF skips vendors that can't read it", same(names(candidates(only({ ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d", ALLOW_DEEPSEEK: "1", AGENT_ROUTE_EXTRACT: "deepseek:deepseek-chat" }), { payload: pdf, role: "extract", research: false, beta: null }, "claude-haiku")), ["anthropic:claude-haiku-4-5-20251001"]));
  check("research puts Anthropic first for plan and watch, not for short", names(candidates(paid, { payload, role: "watch", research: true, beta: "b" }, "x"))[0].startsWith("anthropic:")
    && names(candidates(paid, { payload, role: "short", research: true, beta: "b" }, "x"))[0] === "gemini:gemini-2.5-flash-lite");
}

// 5. calls: the first with a key wins, translated; fallthrough when busy
let env: Record<string, string> = { ANTHROPIC_API_KEY: "a" };
let r = await callModel(k => env[k], { payload, role: "plan", research: false, beta: null }, "claude-sonnet", null, mk({ anthropic: () => anth() }));
check("plan with only an Anthropic key: Anthropic", r.ok && r.model === "anthropic:claude-sonnet");
env = { ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d", ALLOW_DEEPSEEK: "1", AGENT_ROUTE_EXTRACT: "deepseek:deepseek-chat,gemini:gemini-flash" };
r = await callModel(k => env[k], { payload, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({ deepseek: () => oai({ content: "cheap answer" }) }));
check("deepseek used", r.ok && r.model === "deepseek:deepseek-chat" && (r.data as any).content[0].text === "cheap answer" && (r.data as any).usage.input_tokens === 7);
calls.length = 0;
r = await callModel(k => env[k], { payload, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({ deepseek: () => new Response("busy", { status: 429 }), anthropic: () => anth() }));
check("falls to anthropic on 429", r.ok && r.model === "anthropic:claude-haiku-4-5-20251001" && calls.length === 2);
calls.length = 0; env = { ANTHROPIC_API_KEY: "a", DEEPSEEK_API_KEY: "d", ALLOW_DEEPSEEK: "1", AGENT_ROUTE: "deepseek:deepseek-chat" };
r = await callModel(k => env[k], { payload, role: "plan", research: true, beta: "b" }, "claude-sonnet", { search: {}, fetch: {}, pageTools: [] }, mk({ anthropic: () => anth(), deepseek: () => oai({ content: "x" }) }));
check("research prefers anthropic", r.model === "anthropic:claude-sonnet" && calls[0].includes("anthropic"));
calls.length = 0; env = { ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", GEMINI_PAID: "1" };
r = await callModel(k => env[k], { payload, role: "plan", research: true, beta: "b" }, "claude-sonnet", { search: {}, fetch: {}, pageTools: [] }, mk({ anthropic: () => new Response("down", { status: 529 }), gemini: () => oai({ content: "pro answer" }) }));
check("Anthropic down: plan falls to Gemini Pro", r.ok && r.model === "gemini:gemini-2.5-pro" && calls.length === 2);
r = await callModel(k => env[k], { payload, role: "review", research: false, beta: null }, "claude-sonnet", null, mk({ gemini: () => oai({ content: "{\"items\":[]}" }), anthropic: () => anth() }));
check("the checker runs on the other vendor", r.ok && r.model === "gemini:gemini-2.5-pro");

// 6. free models skipped unless allowed, and never with files
env = { OPENROUTER_API_KEY: "o", ALLOW_OPENROUTER: "1", ANTHROPIC_API_KEY: "a", AGENT_ROUTE_EXTRACT: "openrouter:deepseek/deepseek-chat:free" };
r = await callModel(k => env[k], { payload, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free skipped by default", r.model === "anthropic:claude-haiku-4-5-20251001");
env.AGENT_ALLOW_FREE = "1";
r = await callModel(k => env[k], { payload, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free used when allowed", r.model === "openrouter:deepseek/deepseek-chat:free");
const withImg = { ...payload, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } }, { type: "text", text: "read" }] }] };
r = await callModel(k => env[k], { payload: withImg, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({ openrouter: () => oai({ content: "free" }), anthropic: () => anth() }));
check("free never gets customer files", r.model === "anthropic:claude-haiku-4-5-20251001");

// 7. no keys
r = await callModel(k => undefined, { payload, role: "extract", research: false, beta: null }, "claude-haiku", null, mk({}));
check("no keys -> 503", !r.ok && r.status === 503);
console.log(`${ok} passed, ${bad} failed`);
if (bad) throw new Error(`${bad} failed`);
