// One door to many models. The app and both agent functions speak Anthropic's Messages format; this module sends
// each request to the first model in a route that has a key, translating to and from the OpenAI chat format for
// DeepSeek, Gemini, OpenAI, OpenRouter and Groq, and falls through to the next model when one is busy or down.
//
// Routes are set with Edge Function secrets, as comma-separated "provider:model" lists, cheapest first:
//   AGENT_ROUTE_FAST      reading uploads and other extraction (no web research)
//   AGENT_ROUTE           conversations
//   AGENT_ROUTE_DEEP      deep lookups
// e.g. AGENT_ROUTE_FAST = "deepseek:deepseek-chat,gemini:gemini-2.5-flash,anthropic:claude-haiku-4-5-20251001"
// With no route set, everything goes to Anthropic exactly as before.
//
// Keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY.
// Free models (an OpenRouter model ending in ":free", or anything on Groq's free tier) are skipped unless
// AGENT_ALLOW_FREE=1, and are never sent customer files, because free tiers may keep or train on prompts.

type Block = Record<string, unknown>;
export type Tier = "fast" | "standard" | "deep";
export type Call = { payload: Record<string, unknown>; tier: Tier; research: boolean; beta: string | null };
export type Result = { ok: boolean; status: number; data?: Record<string, unknown>; text: string; model: string };
type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

const OPENAI_STYLE: Record<string, { url: string; key: string }> = {
  openai: { url: "https://api.openai.com/v1/chat/completions", key: "OPENAI_API_KEY" },
  deepseek: { url: "https://api.deepseek.com/chat/completions", key: "DEEPSEEK_API_KEY" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: "GEMINI_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: "OPENROUTER_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: "GROQ_API_KEY" },
};

export function routeFor(env: Env, tier: Tier, fallbackModel: string): [string, string][] {
  const raw = env(tier === "fast" ? "AGENT_ROUTE_FAST" : tier === "deep" ? "AGENT_ROUTE_DEEP" : "AGENT_ROUTE") ?? env("AGENT_ROUTE") ?? "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const i = s.indexOf(":"); return [s.slice(0, i), s.slice(i + 1)] as [string, string]; })
    .filter(([p, m]) => m && (p === "anthropic" || p in OPENAI_STYLE));
  // Anthropic stays the safety net at the end of every route.
  if (!list.some(([p]) => p === "anthropic")) list.push(["anthropic", fallbackModel]);
  return list;
}

const isFree = (p: string, m: string) => p === "groq" || /:free$/.test(m);
const hasFiles = (messages: Block[]) => messages.some((m) => Array.isArray(m.content) && (m.content as Block[]).some((b) => b.type === "image" || b.type === "document"));
const hasDocs = (messages: Block[]) => messages.some((m) => Array.isArray(m.content) && (m.content as Block[]).some((b) => b.type === "document"));

/* ---------- Anthropic Messages -> OpenAI chat ---------- */
export function toOpenAI(payload: Record<string, unknown>, model: string): Record<string, unknown> {
  const out: Block[] = [];
  if (typeof payload.system === "string" && payload.system) out.push({ role: "system", content: payload.system });
  for (const m of (payload.messages as Block[]) ?? []) {
    if (typeof m.content === "string") { out.push({ role: m.role, content: m.content }); continue; }
    const blocks = (m.content as Block[]) ?? [];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      const calls = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: String(b.id), type: "function", function: { name: String(b.name), arguments: JSON.stringify(b.input ?? {}) } }));
      out.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    // user turn: tool results become tool messages, the rest one user message
    const parts: Block[] = [];
    for (const b of blocks) {
      if (b.type === "tool_result") {
        const c = b.content;
        const s = typeof c === "string" ? c : Array.isArray(c) ? (c as Block[]).map((x) => (x.type === "text" ? String(x.text ?? "") : "")).join("") : JSON.stringify(c ?? "");
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: (b.is_error ? "Error: " : "") + s });
      } else if (b.type === "text") parts.push({ type: "text", text: String(b.text ?? "") });
      else if (b.type === "image") {
        const src = b.source as Block;
        if (src?.type === "base64") parts.push({ type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } });
      }
    }
    if (parts.length) out.push({ role: "user", content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts });
  }
  const tools = ((payload.tools as Block[]) ?? []).filter((t) => !("type" in t)).map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } } }));
  return { model, messages: out, max_tokens: payload.max_tokens, ...(tools.length ? { tools } : {}) };
}

/* ---------- OpenAI chat -> Anthropic Messages ---------- */
export function fromOpenAI(d: Record<string, unknown>, model: string): Record<string, unknown> {
  const ch = ((d.choices as Block[]) ?? [])[0] ?? {};
  const msg = (ch.message as Block) ?? {};
  const content: Block[] = [];
  if (typeof msg.content === "string" && msg.content.trim()) content.push({ type: "text", text: msg.content });
  for (const c of (msg.tool_calls as Block[]) ?? []) {
    const f = c.function as Block;
    let input: unknown = {};
    try { input = JSON.parse(String(f.arguments || "{}")); } catch { input = {}; }
    content.push({ type: "tool_use", id: String(c.id || crypto.randomUUID()), name: String(f.name), input });
  }
  const fr = String(ch.finish_reason ?? "");
  const u = (d.usage as Block) ?? {};
  return {
    id: String(d.id ?? ""), type: "message", role: "assistant", model, content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn",
    usage: { input_tokens: Number(u.prompt_tokens ?? 0), output_tokens: Number(u.completion_tokens ?? 0) },
  };
}

async function anthropic(f: Fetch, key: string, payload: Record<string, unknown>, beta: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const res = await f("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  return { res, text: await res.text() };
}

/**
 * Prompt caching: Odelia's instructions and tools (about 6,500 tokens) are the same on every round, and each round
 * repeats the conversation so far. Marking the end of each as cacheable makes those repeats cost a tenth.
 */
export function withCache(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  if (typeof out.system === "string" && out.system) out.system = [{ type: "text", text: out.system, cache_control: { type: "ephemeral" } }];
  const tools = Array.isArray(out.tools) ? [...(out.tools as Block[])] : [];
  if (tools.length) { tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } }; out.tools = tools; }
  const msgs = Array.isArray(out.messages) ? [...(out.messages as Block[])] : [];
  const last = msgs.length - 1;
  if (last >= 0 && msgs[last].role === "user") {
    const c = msgs[last].content;
    const blocks = typeof c === "string" ? [{ type: "text", text: c }] : Array.isArray(c) ? [...(c as Block[])] : [];
    if (blocks.length && (blocks[blocks.length - 1].type === "text" || blocks[blocks.length - 1].type === "tool_result")) {
      blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
      msgs[last] = { ...msgs[last], content: blocks };
      out.messages = msgs;
    }
  }
  return out;
}

/** Anthropic with its research tools, stepping down when the account lacks web fetch or web search. */
async function viaAnthropic(f: Fetch, key: string, call: Call, model: string, research: { search: Block; fetch: Block; pageTools: Block[] } | null) {
  const payload: Record<string, unknown> = withCache({ ...call.payload, model });
  let { res, text } = await anthropic(f, key, payload, call.beta);
  if (research && res.status === 400 && /web_fetch|beta/i.test(text)) { payload.tools = withCache({ tools: [...research.pageTools, research.search] }).tools; ({ res, text } = await anthropic(f, key, payload, null)); }
  if (research && res.status === 400 && /web_search/i.test(text)) { payload.tools = research.pageTools.length ? withCache({ tools: research.pageTools }).tools : undefined; ({ res, text } = await anthropic(f, key, payload, null)); }
  return { res, text };
}

/**
 * Sends the call down its route. Returns the first answer in Anthropic's format, or the last failure.
 * research: the server tools to use when the model is Anthropic; other models answer without web research,
 * so a research call tries Anthropic first.
 */
export async function callModel(env: Env, call: Call, fallbackModel: string, research: { search: Block; fetch: Block; pageTools: Block[] } | null, f: Fetch = fetch): Promise<Result> {
  let route = routeFor(env, call.tier, fallbackModel);
  const msgs = (call.payload.messages as Block[]) ?? [];
  const files = hasFiles(msgs), docs = hasDocs(msgs), allowFree = env("AGENT_ALLOW_FREE") === "1";
  route = route.filter(([p, m]) => !isFree(p, m) || (allowFree && !files));
  if (docs) route = route.filter(([p]) => p === "anthropic" || p === "gemini" || p === "openrouter");   // PDFs need a model that reads them
  if (call.research) route = [...route.filter(([p]) => p === "anthropic"), ...route.filter(([p]) => p !== "anthropic")];
  let last: Result = { ok: false, status: 503, text: "No model has a key. Add one in the Edge Function secrets.", model: "" };
  for (const [p, model] of route) {
    try {
      if (p === "anthropic") {
        const key = env("ANTHROPIC_API_KEY"); if (!key) continue;
        const { res, text } = await viaAnthropic(f, key, call, model, research);
        if (res.ok) return { ok: true, status: 200, data: JSON.parse(text), text, model: `${p}:${model}` };
        last = { ok: false, status: res.status, text, model: `${p}:${model}` };
      } else {
        const cfg = OPENAI_STYLE[p], key = env(cfg.key); if (!key) continue;
        const body = toOpenAI({ ...call.payload, tools: research ? research.pageTools : call.payload.tools }, model);
        const res = await f(cfg.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
        const text = await res.text();
        if (res.ok) { const data = fromOpenAI(JSON.parse(text), `${p}:${model}`); return { ok: true, status: 200, data, text, model: `${p}:${model}` }; }
        last = { ok: false, status: res.status, text, model: `${p}:${model}` };
      }
      // A bad request from one model (an unsupported block, a tool schema it rejects) can still work on the next.
      console.error("model", last.model, last.status, last.text.slice(0, 200));
    } catch (e) {
      last = { ok: false, status: 502, text: String(e), model: `${p}:${model}` };
      console.error("model", last.model, last.text.slice(0, 200));
    }
  }
  return last;
}
