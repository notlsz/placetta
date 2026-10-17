// One door to many models. The app and both agent functions speak Anthropic's Messages format; this module sends
// each request to the first model in its route that has a key, translating to and from the OpenAI chat format for
// DeepSeek, Gemini, OpenAI, OpenRouter and Groq, and falls through to the next model when one is busy or down.
//
// Every call has a role, and each role has a route: the cheapest model that is good enough for that work first, a
// better one behind it, and Anthropic as the safety net. The roles:
//   plan        the main agentic loop: planning, tool use, the final answer
//   review      the independent checker (a different vendor from the doer, so a model isn't grading itself)
//   extract     reading uploads, pulling fields, classifying
//   translate   rendering text that is already decided into English or Chinese
//   draft       routine documents and messages from a template
//   short       one-liners for texts, calls and chat bots, status chases
//   watch       the monitor's weekly rule scan and routine checks
//   deep        web research
// The default routes are in DEFAULT_ROUTES below. A secret AGENT_ROUTE_<ROLE> (AGENT_ROUTE_EXTRACT, AGENT_ROUTE_PLAN...)
// replaces a role's route, as a comma-separated "provider:model" list, cheapest first; the three old names still work:
// AGENT_ROUTE_FAST is extract, AGENT_ROUTE is plan, AGENT_ROUTE_DEEP is deep. Anthropic is added at the end of any route
// that leaves it out. AGENT_MODEL, AGENT_MODEL_DEEP and AGENT_MODEL_FAST name the Anthropic models (Sonnet, Opus, Haiku).
//
// Keys: GEMINI_API_KEY (the main one), ANTHROPIC_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY,
// OPENAI_API_KEY, DEEPSEEK_API_KEY.
// Which vendors may see what is decided by vendorOk (data-use guardrails):
//   Anthropic and OpenAI       always (both contractually don't train on API traffic)
//   Gemini                     everything only with GEMINI_PAID=1 (Google's free tier may use prompts to improve its
//                              products; the paid tier doesn't). Without it, Gemini gets no customer files and no
//                              conversations, only calls marked publicOnly (a scan of public pages with nothing of the
//                              customer's in it). Today every call carries the workspace, so without GEMINI_PAID a
//                              Gemini key goes unused.
//   DeepSeek                   PRC-hosted: only with ALLOW_DEEPSEEK=1, and never files
//   Groq, Cerebras, OpenRouter the gpt-oss-120b backups: on when their key is set, last in every route, never files
// Free models (an OpenRouter model ending in ":free", or anything on Groq's free tier) are skipped unless
// AGENT_ALLOW_FREE=1, and are never sent customer files, because free tiers may keep or train on prompts.
// PDFs (document blocks) only go to models that read them: Anthropic, Gemini, OpenRouter.

type Block = Record<string, unknown>;
export type Role = "plan" | "review" | "extract" | "translate" | "draft" | "short" | "watch" | "deep";
export const ROLES: Role[] = ["plan", "review", "extract", "translate", "draft", "short", "watch", "deep"];
/** The old three-way split, kept so older call sites keep working: fast is extract, standard is plan, deep is deep. */
export type Tier = "fast" | "standard" | "deep";
export type Call = {
  payload: Record<string, unknown>;
  /** What this call is for; picks the route. */
  role?: Role;
  /** The old name for the same thing (fast, standard, deep); role wins when both are given. */
  tier?: Tier;
  /** The payload carries Anthropic's web tools (search and fetch). Only Anthropic runs them. */
  research: boolean;
  beta: string | null;
  /** Where the customer is, for vendor rules that depend on it (none yet; US by default). */
  region?: string;
  /** Nothing of the customer's in the call (a scan of public pages): the one thing an unpaid Gemini tier may see. */
  publicOnly?: boolean;
};
export type Result = { ok: boolean; status: number; data?: Record<string, unknown>; text: string; model: string };
type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

const OPENAI_STYLE: Record<string, { url: string; key: string }> = {
  openai: { url: "https://api.openai.com/v1/chat/completions", key: "OPENAI_API_KEY" },
  deepseek: { url: "https://api.deepseek.com/chat/completions", key: "DEEPSEEK_API_KEY" },
  gemini: { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: "GEMINI_API_KEY" },
  openrouter: { url: "https://openrouter.ai/api/v1/chat/completions", key: "OPENROUTER_API_KEY" },
  groq: { url: "https://api.groq.com/openai/v1/chat/completions", key: "GROQ_API_KEY" },
  cerebras: { url: "https://api.cerebras.ai/v1/chat/completions", key: "CEREBRAS_API_KEY" },
};
export const PROVIDERS = ["anthropic", ...Object.keys(OPENAI_STYLE)];
/** Each vendor's key, by provider. */
export const PROVIDER_KEYS: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", ...Object.fromEntries(Object.entries(OPENAI_STYLE).map(([p, c]) => [p, c.key])) };
/** Whether any vendor with a key may take a customer's conversation (vendorOk below): what decides if Odelia can run at
 *  all. A Gemini key without GEMINI_PAID doesn't count, since no conversation may go to Google's free tier. */
export const canConverse = (env: Env) => Object.entries(PROVIDER_KEYS).some(([p, k]) => !!env(k) && vendorOk(env, p, { hasFiles: false, role: "plan" }));

/** The Anthropic models by size. The repo's defaults; AGENT_MODEL, AGENT_MODEL_DEEP and AGENT_MODEL_FAST change them. */
export const ANTHROPIC_MODELS = { plan: "claude-sonnet-5-5", deep: "claude-opus-5-5", fast: "claude-haiku-4-5-20251001" };
const GEMINI = { lite: "gemini-2.5-flash-lite", flash: "gemini-2.5-flash", next: "gemini-3.8-flash", pro: "gemini-2.5-pro" };
/** The open-model backups, the same as Belluh's: gpt-oss-120b on Groq, then Cerebras, then OpenRouter. Each is used only
 *  when its key is set, only after Gemini and Anthropic can't answer, and never with a customer's files. */
const BACKUPS: [string, string][] = [["groq", "openai/gpt-oss-120b"], ["cerebras", "gpt-oss-120b"], ["openrouter", "openai/gpt-oss-120b"]];

/**
 * The default route of each role, cheapest first, as [provider, model]. "anthropic:*" stands for the Anthropic model
 * that fits the role (Haiku for the cheap roles, Sonnet for plan and review, Opus for deep), so AGENT_MODEL still
 * picks the exact one. A provider without a key is skipped at call time.
 */
// Gemini first, as on Belluh: 3.8 Flash for the work, 2.5 Flash when 3.8 is unavailable, Flash-Lite for the cheap reads.
// Anthropic is the top-of-the-line seat (the reviewer when there's a key, deep research) and the safety net; the open
// gpt-oss backups come last.
const CHEAP: [string, string][] = [["gemini", GEMINI.lite], ["gemini", GEMINI.flash], ["anthropic", "*"], ...BACKUPS];
export const DEFAULT_ROUTES: Record<Role, [string, string][]> = {
  extract: CHEAP,
  translate: CHEAP,
  short: [["gemini", GEMINI.next], ["gemini", GEMINI.flash], ["anthropic", "*"], ...BACKUPS],
  watch: CHEAP,
  draft: [["gemini", GEMINI.next], ["gemini", GEMINI.flash], ["anthropic", "*"], ...BACKUPS],
  // the main loop: Gemini 3.8 Flash, then 2.5 Flash, then Sonnet when there's an Anthropic key, then the backups
  plan: [["gemini", GEMINI.next], ["gemini", GEMINI.flash], ["anthropic", "*"], ...BACKUPS],
  // the checker: a different model from the doer, so the work isn't graded by the model that did it
  review: [["anthropic", "*"], ["gemini", GEMINI.pro], ["gemini", GEMINI.flash], ...BACKUPS],
  deep: [["anthropic", "*"], ["gemini", GEMINI.pro], ["gemini", GEMINI.next]],
};

/** The Anthropic model a role falls back to. fallbackModel is what the caller already decided (AGENT_MODEL or AGENT_MODEL_DEEP). */
export function anthropicFor(env: Env, role: Role, fallbackModel: string): string {
  if (role === "plan" || role === "review" || role === "deep") return fallbackModel;
  return env("AGENT_MODEL_FAST") || ANTHROPIC_MODELS.fast;
}

export const roleOfTier = (tier: Tier | undefined): Role => (tier === "fast" ? "extract" : tier === "deep" ? "deep" : "plan");
const ALIAS: Partial<Record<Role, string>> = { extract: "AGENT_ROUTE_FAST", plan: "AGENT_ROUTE", deep: "AGENT_ROUTE_DEEP" };

const parseRoute = (raw: string) => raw.split(",").map((s) => s.trim()).filter(Boolean)
  .map((s) => { const i = s.indexOf(":"); return [s.slice(0, i), s.slice(i + 1)] as [string, string]; })
  .filter(([p, m]) => m && (p === "anthropic" || p in OPENAI_STYLE));

/** The route for a role: its secret if set (or the old name), else the default. Anthropic is always on it. */
export function routeFor(env: Env, roleOrTier: Role | Tier, fallbackModel: string): [string, string][] {
  const role: Role = (ROLES as string[]).includes(roleOrTier) ? roleOrTier as Role : roleOfTier(roleOrTier as Tier);
  const raw = env(`AGENT_ROUTE_${role.toUpperCase()}`) ?? (ALIAS[role] ? env(ALIAS[role]!) : undefined) ?? "";
  const anth = anthropicFor(env, role, fallbackModel);
  const list = raw ? parseRoute(raw) : DEFAULT_ROUTES[role].map(([p, m]) => [p, p === "anthropic" && m === "*" ? anth : m] as [string, string]);
  // Anthropic stays the safety net at the end of every route.
  if (!list.some(([p]) => p === "anthropic")) list.push(["anthropic", anth]);
  return list;
}

const isFree = (_p: string, m: string) => /:free$/.test(m);
const hasFiles = (messages: Block[]) => messages.some((m) => Array.isArray(m.content) && (m.content as Block[]).some((b) => b.type === "image" || b.type === "document"));
const hasDocs = (messages: Block[]) => messages.some((m) => Array.isArray(m.content) && (m.content as Block[]).some((b) => b.type === "document"));

/**
 * Data-use guardrails: may this vendor see this call? Anthropic and OpenAI always. Gemini everything only on the paid
 * tier (GEMINI_PAID=1); otherwise no files and no conversations, only a watch scan marked publicOnly (nothing of the
 * customer's in it). DeepSeek only when ALLOW_DEEPSEEK=1, OpenRouter and Groq only when allowed too, and none of those
 * three ever gets a customer's files. region is kept for rules that depend on where the customer is; today every
 * customer is treated the same.
 */
export function vendorOk(env: Env, provider: string, o: { hasFiles: boolean; role?: Role; region?: string; publicOnly?: boolean }): boolean {
  switch (provider) {
    case "anthropic": case "openai": return true;
    case "gemini": return env("GEMINI_PAID") === "1" || (!o.hasFiles && o.role === "watch" && o.publicOnly === true);
    case "deepseek": return env("ALLOW_DEEPSEEK") === "1" && !o.hasFiles;
    // the open-model backups: on when their key is set (paid API tiers don't train on traffic), never with files
    case "openrouter": case "groq": case "cerebras": return !o.hasFiles;
    default: return false;
  }
}

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
      } else if (b.type === "document") {
        // a PDF, for the vendors that read them through the OpenAI format (Gemini, OpenRouter)
        const src = b.source as Block;
        if (src?.type === "base64") parts.push({ type: "file", file: { filename: "document.pdf", file_data: `data:${src.media_type ?? "application/pdf"};base64,${src.data}` } });
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

/** Roles whose work needs the web: when such a call carries research tools, Anthropic (the only vendor that runs them) goes first. */
const RESEARCH_FIRST = new Set<Role>(["plan", "deep", "watch"]);

/** The models a call may go to, in order, after every rule: the role's route, keys, free models, files, vendors, research. */
export function candidates(env: Env, call: Call, fallbackModel: string): [string, string][] {
  const role = call.role ?? roleOfTier(call.tier);
  let route = routeFor(env, role, fallbackModel);
  const msgs = (call.payload.messages as Block[]) ?? [];
  const files = hasFiles(msgs), docs = hasDocs(msgs), allowFree = env("AGENT_ALLOW_FREE") === "1";
  route = route.filter(([p, m]) => !isFree(p, m) || (allowFree && !files));
  if (docs) route = route.filter(([p]) => p === "anthropic" || p === "gemini" || p === "openrouter");   // PDFs need a model that reads them
  route = route.filter(([p]) => vendorOk(env, p, { hasFiles: files, role, region: call.region, publicOnly: call.publicOnly }));
  if (call.research && RESEARCH_FIRST.has(role)) route = [...route.filter(([p]) => p === "anthropic"), ...route.filter(([p]) => p !== "anthropic")];
  return route;
}

/**
 * Sends the call down its route. Returns the first answer in Anthropic's format, or the last failure.
 * research: the server tools to use when the model is Anthropic; other models answer without web research.
 */
export async function callModel(env: Env, call: Call, fallbackModel: string, research: { search: Block; fetch: Block; pageTools: Block[] } | null, f: Fetch = fetch): Promise<Result> {
  const route = candidates(env, call, fallbackModel);
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

/** "provider" from a Result's model ("gemini:gemini-2.5-flash" -> "gemini"). */
export const providerOf = (model: string) => (model.includes(":") ? model.slice(0, model.indexOf(":")) : model ? "anthropic" : "");
