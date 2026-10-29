// One door to the worker's models, so one vendor's spend cap or outage never stops Odelia (2026-10-28: production
// stopped on Anthropic's "You have reached your specified API usage limits"). Every model call the worker makes (a
// filing step, a status check step, teach mode's labels) is one request with a list of tools and one tool call back.
// Each vendor is an adapter that speaks its own API with tool calling:
//   anthropic   Messages API (api.anthropic.com/v1/messages)
//   gemini      Google's native generateContent with function declarations (generativelanguage.googleapis.com)
//   openrouter  OpenAI-style chat completions with tools (openrouter.ai), reaching many models
//   muse        Meta's Muse Spark on Meta Model API, OpenAI-style chat completions with tools (api.meta.ai/v1)
//
// FILER_MODELS (or ODELIA_MODELS, shared with the server) is the order, comma separated, "provider:model" or a bare
// provider for its default model, for example anthropic:claude-sonnet-5-5,gemini:gemini-3.8-flash,openrouter:anthropic/claude-sonnet-5.5.
// Unset, the order is DEFAULT_ORDER. A seat without its key is skipped. When a seat fails (a usage or spend limit, a 429,
// a 5xx, a refused key, a timeout, an answer with no tool in it) the next one is asked the same question. A model call
// has no side effects: the worker acts only on the one tool call that comes back, so asking again can never act twice.
// A seat that failed with a limit, a refused key or an outage sits out for FILER_MODEL_COOLDOWN_S (default 120) so every
// step doesn't wait on a vendor that is down; when every seat is sitting out they are all tried anyway.
//
// Data rules (unchanged, applied before anything is sent):
//   - zero data retention (supabase/functions/_shared/zdr.ts): with AI_ZDR_REQUIRED=1, only providers and models on
//     AI_ZDR_PROVIDERS; OpenRouter then also asks for zero-retention hosts only (provider.zdr)
//   - Gemini only with GEMINI_PAID=1, the same rule as the server (_shared/llm.ts vendorOk): Google's free tier may use
//     prompts to improve its products, the paid tier doesn't. The one exception, for rehearsals: with
//     GEMINI_FREE_SYNTHETIC=1 a free key may take a run on a synthetic workspace (a probe or test, set by the service
//     role only; filer_recording_policy tells the worker). Never a real customer's.
//   - OpenRouter always with provider.data_collection "deny": only hosts that don't keep or train on prompts
//   - Muse never on a "-contributor" model: Meta may train on those; standard mode isn't used for training
// The log says which seat answered; never a key (redact below scrubs every key from any error text).
import { ZDR_REFUSED, zdrAllows, zdrRequired } from "../../../supabase/functions/_shared/zdr.ts";
import { costOf, type Usage } from "../../../supabase/functions/_shared/ai_cost.ts";
import { zdrAdvisor } from "../../../supabase/functions/_shared/zdr.ts";

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolCall = { name: string; input: Record<string, unknown> };
/** One question: a prompt, the tools, and (only) the one tool the answer must be. system is the part that is the same on
 *  every step of a run (the rules, the approved values): on Anthropic it goes in the system prompt behind the tools and
 *  is cached (cache_control), so each step after the first reads it at a tenth of the price or less. */
export type Ask = { prompt: string; system?: string; tools: ToolDef[]; only?: string; maxTokens: number;
  /** Anthropic only: the advisor tool for this request (cascade: the fast tier's executor consults Opus). */
  advisor?: Advisor;
  /** Anthropic only: output_config.effort (low, medium, high; the model's default when unset). */
  effort?: "low" | "medium" | "high";
  /** Anthropic only: the cached prefix's lifetime ("1h" where calls are more than 5 minutes apart: status checks). */
  cacheTtl?: "5m" | "1h" };
/** The cascade's tiers (cascade.ts): fast for routine steps (FILER_MODEL_FAST), strong for the pages that decide
 *  something (FILER_MODEL_STRONG). A question with no tier goes down FILER_MODELS as before (teach mode's labels). */
export type ModelTier = "fast" | "strong";
/** A question as the router takes it: the prompt may be built only once a seat may see it (nothing is built, so nothing
 *  can throw or leak, when the data rules leave no seat). */
export type AskIn = Omit<Ask, "prompt" | "system" | "advisor"> & { prompt: string | (() => string); system?: string | (() => string); tier?: ModelTier;
  /** The fast tier may consult the advisor on this question (the router adds it on Anthropic, within the run's cap). */
  advise?: boolean };
/** One model call, for the run's cost ledger (filer_runs.ai_steps): which tier and seat answered, its tokens, its price.
 *  A seat that failed and billed nothing isn't in it. */
export type CallCost = { tier: ModelTier | "any"; model: string; input: number; output: number; cache_read: number; cache_write: number; usd: number;
  /** The advisor calls in it and their share of usd (billed at the advisor's rates). */
  advisor_calls?: number; advisor_usd?: number };
export type Vendor = "anthropic" | "gemini" | "openrouter" | "muse" | "groq" | "mistral" | "nvidia";
export type Seat = { vendor: Vendor; model: string };
type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

export const VENDORS: Vendor[] = ["anthropic", "gemini", "openrouter", "muse", "groq", "mistral", "nvidia"];
export const KEY_OF: Record<Vendor, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY", muse: "MUSE_API_KEY",
  groq: "GROQ_API_KEY", mistral: "MISTRAL_API_KEY", nvidia: "NVIDIA_API_KEY" };
/** The OpenAI-style hosts (chat completions with tools). Groq: console.groq.com docs, OpenAI compatibility; Mistral:
 *  docs.mistral.ai, chat completions; NVIDIA: build.nvidia.com, integrate.api.nvidia.com. */
const CHAT_BASE: Partial<Record<Vendor, string>> = { groq: "https://api.groq.com/openai/v1", mistral: "https://api.mistral.ai/v1", nvidia: "https://integrate.api.nvidia.com/v1" };
/** Free tiers: their providers may keep or train on prompts, so they take only rehearsals (a synthetic workspace, with
 *  FREE_MODELS_SYNTHETIC=1, or GEMINI_FREE_SYNTHETIC=1 for Gemini) until the founder sets that vendor's _PAID=1. An
 *  OpenRouter model whose id ends in ":free" is always a free tier. Never a real customer's data on a free tier. */
export function freeTier(env: Env, s: Seat): boolean {
  if (s.vendor === "openrouter") return /:free$/i.test(s.model);
  if (s.vendor === "gemini" || s.vendor === "groq" || s.vendor === "mistral" || s.vendor === "nvidia") return env(`${s.vendor.toUpperCase()}_PAID`) !== "1";
  return false;
}
const freeRehearsals = (env: Env, s: Seat) => env("FREE_MODELS_SYNTHETIC") === "1" || (s.vendor === "gemini" && env("GEMINI_FREE_SYNTHETIC") === "1");
/** A model the env names (NVIDIA's catalog changes often, so it has no default: NVIDIA_MODEL picks one). */
const envModel = (env: Env, v: Vendor) => (env(`${v.toUpperCase()}_MODEL`) ?? "").trim();
/** Each vendor's default model, checked on the vendor's own docs on 2026-10-28:
 *  claude-sonnet-5-5 (platform.claude.com, models, Sonnet 5.5), gemini-3.8-flash (ai.google.dev models: stable),
 *  anthropic/claude-sonnet-5.5 (openrouter.ai: served by hosts other than our own Anthropic account, so our spend cap
 *  doesn't reach it), muse-spark-1.3 (dev.meta.ai docs, models: "Recommended for new work"). */
export const DEFAULT_MODEL: Record<Vendor, string> = { anthropic: "claude-sonnet-5-5", gemini: "gemini-3.8-flash", openrouter: "anthropic/claude-sonnet-5.5", muse: "muse-spark-1.3",
  groq: "openai/gpt-oss-120b", mistral: "mistral-large-latest", nvidia: "" };
export const DEFAULT_ORDER: Vendor[] = ["anthropic", "gemini", "openrouter", "muse", "groq", "mistral", "nvidia"];

/** The ordered seats from FILER_MODELS, else ODELIA_MODELS, else the default order (FILER_MODEL still names the Anthropic
 *  model). Unknown vendors and duplicates are dropped. */
export function seatsOf(env: Env): Seat[] {
  const raw = (env("FILER_MODELS") ?? "").trim() || (env("ODELIA_MODELS") ?? "").trim();
  const anth = (env("FILER_MODEL") ?? "").trim() || DEFAULT_MODEL.anthropic;
  const list: Seat[] = raw
    ? raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
      const i = s.indexOf(":");
      const v = (i < 0 ? s : s.slice(0, i)).trim().toLowerCase() as Vendor;
      const m = i < 0 ? "" : s.slice(i + 1).trim();
      return { vendor: v, model: m || (v === "anthropic" ? anth : envModel(env, v) || DEFAULT_MODEL[v]) };
    }).filter((x) => VENDORS.includes(x.vendor) && !!x.model)
    : DEFAULT_ORDER.map((v) => ({ vendor: v, model: v === "anthropic" ? anth : envModel(env, v) || DEFAULT_MODEL[v] })).filter((x) => !!x.model);
  const seen = new Set<string>();
  return list.filter((s) => { const k = `${s.vendor}:${s.model}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Why a seat may not take customer data, or null when it may. Checked before anything is sent. */
export function refusal(env: Env, s: Seat, o: { synthetic?: boolean } = {}): "no_key" | "zdr" | "gemini_unpaid" | "free_tier" | "contributor" | null {
  if (!env(KEY_OF[s.vendor])?.trim()) return "no_key";
  if (!zdrAllows(env, s.vendor, s.model)) return "zdr";
  if (freeTier(env, s) && !(freeRehearsals(env, s) && o.synthetic === true)) return s.vendor === "gemini" ? "gemini_unpaid" : "free_tier";
  if (s.vendor === "muse" && /contributor/i.test(s.model)) return "contributor";
  if (s.vendor === "openrouter" && /^meta\/.*contributor/i.test(s.model)) return "contributor";
  return null;
}

/** Each tier's model on each vendor, when nothing names one. Checked on the vendors' own pages on 2026-10-28:
 *  claude-haiku-5-5 and claude-opus-5-5 (platform.claude.com, models overview: the Claude API IDs), anthropic/claude-haiku-5.5
 *  and anthropic/claude-opus-5.5 (openrouter.ai model pages). Gemini and Muse keep their one default for both tiers. */
export const TIER_MODEL: Record<ModelTier, Record<Vendor, string>> = {
  fast: { anthropic: "claude-haiku-5-5", gemini: "gemini-3.8-flash", openrouter: "anthropic/claude-haiku-5.5", muse: "muse-spark-1.3", groq: "openai/gpt-oss-120b", mistral: "mistral-large-latest", nvidia: "" },
  strong: { anthropic: "claude-opus-5-5", gemini: "gemini-3.8-flash", openrouter: "anthropic/claude-opus-5.5", muse: "muse-spark-1.3", groq: "openai/gpt-oss-120b", mistral: "mistral-large-latest", nvidia: "" },
};
const TIER_ENV: Record<ModelTier, string> = { fast: "FILER_MODEL_FAST", strong: "FILER_MODEL_STRONG" };

/** A tier's seats, in order: FILER_MODEL_FAST or FILER_MODEL_STRONG ("provider:model", or a comma list; default
 *  anthropic:claude-haiku-5-5 and anthropic:claude-opus-5-5), then the failover chain: FILER_MODELS or ODELIA_MODELS
 *  when set, else the other vendors at the tier's model (Gemini, OpenRouter, Muse). */
export function tierSeats(env: Env, tier: ModelTier): Seat[] {
  const parse = (raw: string) => raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const i = s.indexOf(":");
    const v = (i < 0 ? s : s.slice(0, i)).trim().toLowerCase() as Vendor;
    return { vendor: v, model: (i < 0 ? "" : s.slice(i + 1).trim()) || envModel(env, v) || TIER_MODEL[tier][v] };
  }).filter((x) => VENDORS.includes(x.vendor) && !!x.model);
  const head = parse((env(TIER_ENV[tier]) ?? "").trim() || `anthropic:${TIER_MODEL[tier].anthropic}`);
  const named = (env("FILER_MODELS") ?? "").trim() || (env("ODELIA_MODELS") ?? "").trim();
  const chain = named ? seatsOf(env) : DEFAULT_ORDER.filter((v) => v !== "anthropic").map((v) => ({ vendor: v, model: envModel(env, v) || TIER_MODEL[tier][v] })).filter((x) => !!x.model);
  const seen = new Set<string>();
  return [...head, ...chain].filter((s) => { const k = `${s.vendor}:${s.model}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Tokens as ai_cost.ts prices them, from each vendor's own usage block. */
export function usageOf(vendor: Vendor, body: Record<string, unknown>): Usage {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  if (vendor === "anthropic") {
    const u = (body.usage ?? {}) as Record<string, unknown>;
    const cc = (u.cache_creation ?? null) as Usage["cache_creation"] | null;
    const it = Array.isArray(u.iterations) ? u.iterations as Usage["iterations"] : undefined;
    return { input_tokens: n(u.input_tokens), output_tokens: n(u.output_tokens), cache_read_input_tokens: n(u.cache_read_input_tokens), cache_creation_input_tokens: n(u.cache_creation_input_tokens),
      ...(cc ? { cache_creation: { ephemeral_5m_input_tokens: n(cc.ephemeral_5m_input_tokens), ephemeral_1h_input_tokens: n(cc.ephemeral_1h_input_tokens) } } : {}),
      ...(it?.length ? { iterations: it } : {}), ...(typeof u.speed === "string" ? { speed: u.speed } : {}) };
  }
  if (vendor === "gemini") {
    // thinking is billed as output; the cached share of the prompt at the cached rate
    const u = (body.usageMetadata ?? {}) as Record<string, unknown>;
    const cached = n(u.cachedContentTokenCount);
    return { input_tokens: Math.max(0, n(u.promptTokenCount) - cached), output_tokens: n(u.candidatesTokenCount) + n(u.thoughtsTokenCount), cache_read_input_tokens: cached };
  }
  const u = (body.usage ?? {}) as Record<string, unknown>;
  const cached = n(((u.prompt_tokens_details ?? {}) as Record<string, unknown>).cached_tokens);
  const reasoning = n(((u.completion_tokens_details ?? {}) as Record<string, unknown>).reasoning_tokens);
  const out = n(u.completion_tokens);
  // reasoning is inside completion_tokens on OpenAI's own shape; a host that reports it apart is still priced
  const rest = n(u.total_tokens) ? Math.max(0, n(u.total_tokens) - n(u.prompt_tokens)) : 0;
  return { input_tokens: Math.max(0, n(u.prompt_tokens) - cached), output_tokens: Math.max(out, rest, reasoning > out ? out + reasoning : 0), cache_read_input_tokens: cached };
}

/** The seats this worker can use right now, in order. */
export const usableSeats = (env: Env, o: { synthetic?: boolean } = {}) => seatsOf(env).filter((s) => refusal(env, s, o) === null);

/** Every key, and the shapes keys take, out of a line of text. */
export function redact(text: string, env: Env): string {
  let t = text;
  for (const v of VENDORS) { const k = env(KEY_OF[v])?.trim(); if (k && k.length >= 6) t = t.split(k).join("•••"); }
  return t.replace(/sk-ant-[\w-]+/g, "•••").replace(/\bgsk_[\w-]+/g, "•••").replace(/\bnvapi-[\w-]+/g, "•••").replace(/sk-or-[\w-]+/g, "•••").replace(/AIza[\w-]{20,}/g, "•••").replace(/\bBearer\s+\S+/gi, "Bearer •••");
}

/** A vendor's refusal, as text a log can carry: the status and the API's own reason, trimmed and scrubbed. */
async function why(res: Response, env: Env): Promise<string> {
  const raw = await res.text().catch(() => "");
  let msg = "";
  try {
    const j = JSON.parse(raw) as { error?: { type?: string; status?: string; code?: unknown; message?: string } | string; message?: string };
    const e = typeof j.error === "string" ? { message: j.error } : j.error;
    msg = [e?.type ?? e?.status, e?.message ?? j.message].filter(Boolean).join(": ");
  } catch { msg = raw; }
  return redact(msg.replace(/\s+/g, " "), env).slice(0, 160);
}

/** An error from one seat: status 0 when nothing came back (a timeout, a refused connection, an answer with no tool). */
export class SeatError extends Error {
  status: number;
  /** An answer that came back but couldn't be used (no tool in it) was still billed: its tokens, for the ledger. */
  usage?: Usage;
  /** "advisor": the request was refused with the advisor tool in it (the beta, or the pair): asked again without it. */
  feature?: "advisor";
  constructor(status: number, message: string, usage?: Usage, feature?: "advisor") { super(message); this.status = status; this.usage = usage; this.feature = feature; }
}
/** A failure of the whole account, not one model (a spend or usage limit, a refused key, no credit): every seat of that
 *  vendor sits out, so the strong tier doesn't ask the same account again a step later. */
export const accountWide = (e: SeatError) => e.status === 401 || e.status === 402 || e.status === 403
  || /usage limit|spend limit|credit balance|billing/i.test(e.message);
/** A failure that will last a while (a spend or usage limit, a refused key, an outage): the seat sits out. */
export const lasting = (e: SeatError) => e.status === 429 || e.status === 401 || e.status === 402 || e.status === 403 || e.status >= 500 || e.status === 0
  || /usage limit|spend limit|credit balance|quota|billing|exceeded/i.test(e.message);

// ---------------------------------------------------------------- adapters

/** Claude Sonnet 5.5 refuses forced tool use (tool_choice "any" or "tool" is a 400: platform.claude.com, What's new in
 *  Sonnet 5.5), so Claude always gets "auto" and the prompt says which tool; an answer without one fails over. */
const claudeModel = (m: string) => /claude/i.test(m);
const mustUse = (a: Ask) => a.only ? `\n\nAnswer only by calling the ${a.only} tool.` : "\n\nAnswer only by calling exactly one of the tools.";

/** What an adapter gives back: the one tool call, the tokens the vendor billed for it, and whether the advisor (Opus,
 *  consulted by the executor mid-answer) was asked and answered. */
type Answer = { call: ToolCall; usage: Usage; advised?: boolean };

/** The advisor tool (beta, header advisor-tool-2026-03-01; platform.claude.com, Advisor tool, read 2026-10-28): the
 *  executor (Haiku 5.5 on a routine step) consults the advisor model (Opus 5.5) inside the same request, and only the
 *  advisor's short advice is billed at Opus rates. max_uses caps it per request; the run's cap is the router's. Valid
 *  pairs: an advisor at least as capable as the executor (Haiku 5.5 with Opus 5.5 is listed). */
export const ADVISOR_BETA = "advisor-tool-2026-03-01";
export type Advisor = { model: string; maxUses: number; maxTokens: number };
const advisorTool = (v: Advisor) => ({ type: "advisor_20260301", name: "advisor", model: v.model, max_uses: v.maxUses, max_tokens: Math.max(1024, v.maxTokens) });
/** What the executor reads about its advisor: when to call it on a filing step. */
export const ADVISOR_NOTE = "You have an advisor tool backed by a stronger model; it takes no parameters and sees this whole request. Call it before need_person, when the page is unclear, when a value doesn't obviously fit a field, or when your last step failed. Then answer with exactly one of the other tools.";

/** The cacheable request: tools, then the system prompt (the same on every step of a run), then the page. Prompt caching
 *  (platform.claude.com, Prompt caching, read 2026-10-28): the prefix is cached in the order tools, system, messages up to
 *  the block marked { cache_control: { type: "ephemeral" } } (five minutes, refreshed on each hit; "1h" costs 2x base
 *  input to write and pays when the next call is more than 5 minutes away), at most 4 marks, and 512 tokens at least on
 *  Opus 5.5, Sonnet 5.5 and Haiku 5.5. One mark on the system block caches the tools with it; with no system part, the
 *  last tool carries it. Nothing in the cached part changes between steps (no time, no id, no page). effort
 *  (output_config.effort) is rendered into the prompt too, so a tier always sends the same one. */
export function anthropicBody(model: string, a: Ask): Record<string, unknown> {
  const cc = { type: "ephemeral", ...(a.cacheTtl === "1h" ? { ttl: "1h" } : {}) };
  const tools: Record<string, unknown>[] = (a.only ? a.tools.filter((t) => t.name === a.only) : a.tools).map((t) => ({ ...t }));
  if (a.advisor) tools.push(advisorTool(a.advisor));
  if (!a.system && tools.length) tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: cc };
  const system = a.system ? (a.advisor ? `${a.system}\n\n${ADVISOR_NOTE}` : a.system) : "";
  // adaptive thinking is on by default on the current models and counts against max_tokens: room for it and the call
  return { model, max_tokens: Math.max(a.maxTokens, 4000), tools, tool_choice: { type: "auto" },
    ...(system ? { system: [{ type: "text", text: system, cache_control: cc }] } : {}),
    ...(a.effort ? { output_config: { effort: a.effort } } : {}),
    messages: [{ role: "user", content: a.prompt + mustUse(a) }] };
}

/** Everything a vendor without a separate cached system block gets: the static part first, so a vendor's own prefix
 *  cache (Gemini's implicit cache, OpenAI-style automatic caching) can still serve it. */
const whole = (a: Ask) => (a.system ? `${a.system}\n\n${a.prompt}` : a.prompt);

type Block = { type: string; name?: string; input?: Record<string, unknown>; content?: { type?: string } };
async function anthropic(f: Fetch, key: string, model: string, a: Ask, env: Env): Promise<Answer> {
  const body0 = anthropicBody(model, a);
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", ...(a.advisor ? { "anthropic-beta": ADVISOR_BETA } : {}) };
  const post = (b: Record<string, unknown>) => f("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(b), signal: AbortSignal.timeout(90000) });
  let res = await post(body0);
  if (!res.ok) {
    // refused because of the advisor (the beta not on for the account, or the pair): its words name it; a usage limit does not
    const msg = await why(res, env);
    throw new SeatError(res.status, msg, undefined, a.advisor && res.status === 400 && /advisor|beta/i.test(msg) ? "advisor" : undefined);
  }
  let body = await res.json() as { content?: Block[]; usage?: Usage; stop_reason?: string };
  const usage: Usage = usageOf("anthropic", body as Record<string, unknown>);
  // a turn that paused while the advisor was still running: sent again with the paused content, as the docs say
  // ("Resuming a paused turn"), at most twice; each resumed request's tokens are added to the same answer
  for (let i = 0; i < 2 && body.stop_reason === "pause_turn"; i++) {
    const msgs = [...(body0.messages as unknown[]), { role: "assistant", content: body.content ?? [] }];
    res = await post({ ...body0, messages: msgs });
    if (!res.ok) throw new SeatError(res.status, await why(res, env), usage);
    body = await res.json() as typeof body;
    addUsage(usage, usageOf("anthropic", body as Record<string, unknown>));
  }
  const advised = (body.content ?? []).some((c) => c.type === "advisor_tool_result" && c.content?.type !== "advisor_tool_result_error");
  const use = body.content?.find((c) => c.type === "tool_use" && (!a.only || c.name === a.only));
  if (!use?.name) throw new SeatError(200, "chose no tool", usage);
  return { call: { name: use.name, input: use.input ?? {} }, usage, advised };
}
const addUsage = (u: Usage, v: Usage) => {
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"] as const) u[k] = (u[k] ?? 0) + (v[k] ?? 0);
  if (v.cache_creation) u.cache_creation = { ephemeral_5m_input_tokens: (u.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (v.cache_creation.ephemeral_5m_input_tokens ?? 0), ephemeral_1h_input_tokens: (u.cache_creation?.ephemeral_1h_input_tokens ?? 0) + (v.cache_creation.ephemeral_1h_input_tokens ?? 0) };
  if (v.iterations) u.iterations = [...(u.iterations ?? []), ...v.iterations];
};

/** JSON Schema as the tools are written, into Gemini's Schema (its type names are the upper-case enum: OBJECT, STRING...). */
export function geminiSchema(s: unknown): Record<string, unknown> {
  const o = (s ?? {}) as Record<string, unknown>, out: Record<string, unknown> = {};
  if (typeof o.type === "string") out.type = o.type.toUpperCase();
  if (typeof o.description === "string") out.description = o.description;
  if (Array.isArray(o.enum)) out.enum = o.enum.map(String);
  if (o.properties && typeof o.properties === "object") out.properties = Object.fromEntries(Object.entries(o.properties as Record<string, unknown>).map(([k, v]) => [k, geminiSchema(v)]));
  if (Array.isArray(o.required)) out.required = o.required;
  if (o.items) out.items = geminiSchema(o.items);
  return out;
}

async function gemini(f: Fetch, key: string, model: string, a: Ask, env: Env): Promise<Answer> {
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: whole(a) }] }],
      tools: [{ functionDeclarations: a.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.input_schema) })) }],
      // ANY: the model must answer with a function call, limited to the one tool when there is one
      toolConfig: { functionCallingConfig: { mode: "ANY", ...(a.only ? { allowedFunctionNames: [a.only] } : {}) } },
      // Gemini 3 models always think, and thinking counts against the output limit: room for it and the call
      generationConfig: { maxOutputTokens: Math.max(a.maxTokens, 4000) },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new SeatError(res.status, await why(res, env));
  const body = await res.json() as { candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: Record<string, unknown> } }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  const usage = usageOf("gemini", body as Record<string, unknown>);
  if (body.promptFeedback?.blockReason) throw new SeatError(200, `blocked: ${body.promptFeedback.blockReason}`, usage);
  const c = body.candidates?.[0];
  const call = c?.content?.parts?.find((p) => p.functionCall?.name)?.functionCall;
  if (!call?.name || (a.only && call.name !== a.only)) throw new SeatError(200, `chose no tool${c?.finishReason ? ` (${c.finishReason})` : ""}`, usage);
  return { call: { name: call.name, input: call.args ?? {} }, usage };
}

/** OpenAI-style chat completions with tools: OpenRouter and Meta Model API. */
async function chat(f: Fetch, url: string, key: string, model: string, a: Ask, env: Env, extra: Record<string, unknown>): Promise<Answer> {
  const claude = claudeModel(model);
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, max_tokens: Math.max(a.maxTokens, 4000),
      messages: [{ role: "user", content: whole(a) + (claude ? mustUse(a) : "") }],
      tools: (a.only && claude ? a.tools.filter((t) => t.name === a.only) : a.tools).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      tool_choice: claude ? "auto" : a.only ? { type: "function", function: { name: a.only } } : "required",
      ...extra,
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new SeatError(res.status, await why(res, env));
  const body = await res.json() as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[]; error?: { message?: string; code?: number } };
  // OpenRouter can answer 200 with an error from the host it reached
  if (body.error) throw new SeatError(Number(body.error.code) || 502, redact(String(body.error.message ?? "error"), env).slice(0, 160));
  const usage = usageOf("openrouter", body as Record<string, unknown>);
  const fn = body.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name && (!a.only || c.function.name === a.only))?.function;
  if (!fn?.name) throw new SeatError(200, "chose no tool", usage);
  let input: Record<string, unknown>;
  try { input = JSON.parse(fn.arguments || "{}"); } catch { throw new SeatError(200, "tool arguments weren't JSON", usage); }
  return { call: { name: fn.name, input: input && typeof input === "object" ? input : {} }, usage };
}

/** One seat's answer: the tool call. */
export async function askSeat(s: Seat, a: Ask, env: Env, f: Fetch = fetch): Promise<ToolCall> {
  return (await answerOf(s, a, env, f)).call;
}

/** One seat's answer with the tokens it billed. */
export async function answerOf(s: Seat, a: Ask, env: Env, f: Fetch = fetch): Promise<Answer> {
  const key = env(KEY_OF[s.vendor])!.trim();
  switch (s.vendor) {
    case "anthropic": return anthropic(f, key, s.model, a, env);
    case "gemini": return gemini(f, key, s.model, a, env);
    case "openrouter":
      // only hosts that don't keep or train on prompts; with zero retention required, only zero-retention hosts; and
      // only hosts that take the tools and tool_choice as sent
      // a ":free" model is only ever a rehearsal (refusal: free_tier), and its hosts keep prompts, so it can't ask for deny
      return chat(f, "https://openrouter.ai/api/v1/chat/completions", key, s.model, a, env,
        { provider: { data_collection: /:free$/i.test(s.model) ? "allow" : "deny", require_parameters: true, ...(zdrRequired(env) ? { zdr: true } : {}) } });
    case "muse": return chat(f, (env("MUSE_BASE_URL")?.trim().replace(/\/+$/, "") || "https://api.meta.ai/v1") + "/chat/completions", key, s.model, a, env, {});
    case "groq": case "mistral": case "nvidia":
      return chat(f, CHAT_BASE[s.vendor] + "/chat/completions", key, s.model, a, env, {});
  }
}

// ---------------------------------------------------------------- failover

/** Asks each usable seat in order until one answers with a tool call. Throws "model error ..." (run.ts holds the filing
 *  for Placetta's team after 3 tries, never the owner) when none does, or ZDR_REFUSED when the data rules leave none. */
export class Router {
  calls = 0;
  /** The seat that gave the last answer ("gemini:gemini-3.8-flash"), for the log. */
  by: string | null = null;
  /** This run is on a synthetic workspace (run.ts sets it from filer_recording_policy, never from the filing's own
   *  data): only then may a free Gemini key take it, with GEMINI_FREE_SYNTHETIC=1. False between runs. */
  synthetic = false;
  private benched = new Map<string, number>();
  private env: Env; private f: Fetch; private now: () => number; private log: (line: string) => void;
  constructor(o: { env?: Env; fetch?: Fetch; now?: () => number; log?: (line: string) => void } = {}) {
    this.env = o.env ?? ((k) => process.env[k]);
    this.f = o.fetch ?? ((...x: Parameters<Fetch>) => fetch(...x));
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((l) => console.log(l));
  }
  /** Every call this router made since the last take(): tier, seat, tokens and price (the run's ledger). */
  ledger: CallCost[] = [];
  /** The ledger so far, emptied: run.ts and status.ts take it at the end of each run for filer_runs. */
  take(): CallCost[] { const l = this.ledger; this.ledger = []; this.advisorCalls = 0; return l; }
  /** The tier of the last answer, for the step's trace. */
  tier: ModelTier | "any" | null = null;
  /** Whether the last answer had the advisor's advice in it (a fast-tier need_person then needs no second opinion). */
  advised = false;
  /** Advisor calls since the last take(): the run's cap is FILER_ADVISOR_MAX (default 3); past it the tool is left out. */
  advisorCalls = 0;
  /** The advisor beta was refused (400 with the tool in it): left out until this time, the hand-rolled escalation
   *  (cascade.ts) carrying on meanwhile. */
  private advisorOffUntil = 0;
  private note(tier: ModelTier | "any", s: Seat, u: Usage | undefined) {
    if (!u) return;
    const n = (v: number | undefined) => v ?? 0;
    const adv = (u.iterations ?? []).filter((x) => x.type === "advisor_message");
    this.advisorCalls += adv.length;
    this.ledger.push({ tier, model: id(s), input: n(u.input_tokens), output: n(u.output_tokens), cache_read: n(u.cache_read_input_tokens), cache_write: n(u.cache_creation_input_tokens), usd: costOf(id(s), u),
      ...(adv.length ? { advisor_calls: adv.length, advisor_usd: Math.round((costOf(id(s), u) - costOf(id(s), { ...u, iterations: [] })) * 1e6) / 1e6 } : {}) });
  }
  /** The advisor for this question, or nothing: the fast tier on Anthropic, FILER_ADVISOR not 0, ZDR allowing it, under the
   *  run's cap, and not switched off by a refusal. Haiku 5.5 with Opus 5.5 is a listed pair. */
  private advisorFor(q: AskIn, s: Seat): Advisor | undefined {
    if (!q.advise || q.tier !== "fast" || s.vendor !== "anthropic" || this.env("FILER_ADVISOR") === "0" || !zdrAdvisor(this.env)) return undefined;
    if (this.now() < this.advisorOffUntil) return undefined;
    const cap = Math.max(0, Number(this.env("FILER_ADVISOR_MAX") ?? "3") || 0);
    if (this.advisorCalls >= cap) return undefined;
    const strong = tierSeats(this.env, "strong")[0];
    return { model: strong?.vendor === "anthropic" ? strong.model : TIER_MODEL.strong.anthropic, maxUses: 1, maxTokens: 2048 };
  }
  async ask(q: AskIn): Promise<ToolCall> {
    const tier: ModelTier | "any" = q.tier ?? "any";
    const all = q.tier ? tierSeats(this.env, q.tier) : seatsOf(this.env);
    const o = { synthetic: this.synthetic };
    const ok = all.filter((s) => refusal(this.env, s, o) === null);
    if (!ok.length) {
      if (zdrRequired(this.env) && all.some((s) => refusal(this.env, s, o) === "zdr")) throw new Error(ZDR_REFUSED);
      throw new Error("model error: no model key is set (ANTHROPIC_API_KEY, GEMINI_API_KEY with GEMINI_PAID=1, OPENROUTER_API_KEY or MUSE_API_KEY)");
    }
    const cool = Math.max(0, Number(this.env("FILER_MODEL_COOLDOWN_S") ?? "120") || 0) * 1000;
    const t = this.now();
    const ready = ok.filter((s) => Math.max(this.benched.get(id(s)) ?? 0, this.benched.get(`${s.vendor}:*`) ?? 0) <= t);
    const order = ready.length ? [...ready, ...ok.filter((s) => !ready.includes(s))] : ok;
    const a: Ask = { prompt: typeof q.prompt === "function" ? q.prompt() : q.prompt, tools: q.tools, maxTokens: q.maxTokens,
      ...(q.only ? { only: q.only } : {}), ...(q.system ? { system: typeof q.system === "function" ? q.system() : q.system } : {}),
      ...(q.effort ? { effort: q.effort } : {}), ...(q.cacheTtl ? { cacheTtl: q.cacheTtl } : {}) };
    const failed: string[] = [];
    const down = new Set<Vendor>();   // vendors whose whole account refused during this question: their other seats are skipped
    for (const s of order) {
      if (down.has(s.vendor)) continue;
      this.calls++;
      try {
        const advisor = this.advisorFor(q, s);
        let out: Answer;
        try { out = await answerOf(s, { ...a, ...(advisor ? { advisor } : {}) }, this.env, this.f); }
        catch (e) {
          // the beta (or the pair) refused: the same seat again without the advisor, and the advisor off for the cooldown
          if (!(e instanceof SeatError) || e.feature !== "advisor") throw e;
          this.advisorOffUntil = t + Math.max(cool, 60_000);
          console.error(`filer: advisor refused on ${id(s)} (${e.status}: ${e.message}); asking without it`);
          out = await answerOf(s, a, this.env, this.f);
        }
        this.advised = !!out.advised;
        this.benched.delete(id(s)); this.benched.delete(`${s.vendor}:*`);
        this.note(tier, s, out.usage);
        if (this.by !== id(s) || failed.length) this.log(`filer: model ${id(s)}${q.tier ? ` (${q.tier})` : ""} answered${failed.length ? ` after ${failed.join("; ")}` : ""}`);
        this.by = id(s);
        this.tier = tier;
        return out.call;
      } catch (e) {
        const err = e instanceof SeatError ? e : new SeatError(0, redact(String((e as Error)?.message ?? e), this.env).slice(0, 160));
        this.note(tier, s, err.usage);
        if (lasting(err) && cool) this.benched.set(accountWide(err) ? `${s.vendor}:*` : id(s), t + cool);
        if (accountWide(err)) down.add(s.vendor);
        failed.push(`${id(s)} ${err.status || "no answer"}${err.message ? `: ${err.message}` : ""}`);
        console.error(`filer: model ${id(s)} failed (${err.status || "no answer"}${err.message ? `: ${err.message}` : ""}), trying the next`);
      }
    }
    throw new Error(`model error: every model failed: ${failed.join("; ")}`.slice(0, 400));
  }
}
const id = (s: Seat) => `${s.vendor}:${s.model}`;
