// One door to many models. The app and both agent functions speak Anthropic's Messages format; this module sends
// each request to the first model in its route that has a key, translating to and from the OpenAI chat format for
// DeepSeek, Gemini, OpenAI, OpenRouter, Groq, Cerebras and Meta's Muse, and falls through to the next model when one is
// busy, down, out of credit or over a spend limit (any refusal: a model call has no side effects, so asking the next
// one can't act twice).
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
// ODELIA_MODELS (the same list format) replaces the route of every role that has no AGENT_ROUTE_<ROLE> of its own, so
// one secret sets Odelia's failover order everywhere, for example
// gemini:gemini-3.8-flash,openrouter:anthropic/claude-sonnet-5.5,muse:muse-spark-1.3 (Anthropic still ends it). The portal
// worker reads the same ODELIA_MODELS (worker/filer/src/llm.ts), or its own FILER_MODELS.
//
// Keys: GEMINI_API_KEY (the main one), ANTHROPIC_API_KEY, GROQ_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY,
// OPENAI_API_KEY, DEEPSEEK_API_KEY, MUSE_API_KEY (Meta Model API, dev.meta.ai).
// Which vendors may see what is decided by vendorOk (data-use guardrails):
//   Anthropic and OpenAI       always (both contractually don't train on API traffic)
//   Gemini                     everything only with GEMINI_PAID=1 (Google's free tier may use prompts to improve its
//                              products; the paid tier doesn't). Without it, Gemini gets no customer files and no
//                              conversations, only calls marked publicOnly (a scan of public pages with nothing of the
//                              customer's in it). Today every call carries the workspace, so without GEMINI_PAID a
//                              Gemini key goes unused. One exception, for rehearsals: with GEMINI_FREE_SYNTHETIC=1 a
//                              free key may take a call marked synthetic (a probe or test workspace, workspaces.synthetic,
//                              set by the service role only). Never a real customer's.
//   DeepSeek                   PRC-hosted: only with ALLOW_DEEPSEEK=1, and never files
//   Groq, Cerebras, OpenRouter the gpt-oss-120b backups: on when their key is set, last in every route, never files
//   Muse                       Meta Model API standard mode ("your content is not used to train Meta models"): on when
//                              its key is set and a route names it, never files. A "-contributor" model (Meta may train
//                              on it) is never used, on Muse or through OpenRouter
// Free models (an OpenRouter model ending in ":free", or anything on Groq's free tier) are skipped unless
// AGENT_ALLOW_FREE=1, and are never sent customer files, because free tiers may keep or train on prompts.
// PDFs (document blocks) only go to models that read them: Anthropic, Gemini, OpenRouter.
// Zero data retention (zdr.ts): with AI_ZDR_REQUIRED=1, only providers and models on AI_ZDR_PROVIDERS are used, and
// Anthropic's web tools only when "anthropic:web-tools" is listed; a call with nothing left is refused.

import { anthropicMessage, openaiCompletion, type OnText } from "./stream.ts";
import { ZDR_REFUSED, zdrAdvisor, zdrAllows, zdrRequired, zdrWebTools } from "./zdr.ts";
import { ensureCache, explicitOn, useCache } from "./gemini_cache.ts";

type Block = Record<string, unknown>;
export type Role ="plan" | "review" | "extract" | "translate" | "draft" | "short" | "watch" | "deep" | "appeal";
export const ROLES: Role[] = ["plan", "review", "extract", "translate", "draft", "short", "watch", "deep", "appeal"];
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
  /** The call is for a synthetic workspace (workspaces.synthetic: a probe or test, never a customer). Only then may a free
   *  Gemini key take it, and only with GEMINI_FREE_SYNTHETIC=1. Set from the database, never from a request. */
  synthetic?: boolean;
  /** A person is waiting on this answer (a chat streaming to them): only then may fast mode be used (ODELIA_FAST_MODE=1,
   *  Opus 5.5 only). Never in a batch or a background run. */
  interactive?: boolean;
  /** The advisor tool on this request (the plan role's Sonnet consults Opus): how many calls it may still make in this
   *  run (agent-run counts them; 0 leaves the tool out). */
  advisorLeft?: number;
  /** The cached prefix's lifetime: "1h" for calls more than five minutes apart (the monitor's background checks, chases). */
  cacheTtl?: "5m" | "1h";
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
  // Meta's Muse Spark on Meta Model API, OpenAI SDK compatible (dev.meta.ai docs: base https://api.meta.ai/v1, Bearer key)
  muse: { url: "https://api.meta.ai/v1/chat/completions", key: "MUSE_API_KEY" },
};
export const PROVIDERS = ["anthropic", ...Object.keys(OPENAI_STYLE)];
/** Each vendor's key, by provider. */
export const PROVIDER_KEYS: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY", ...Object.fromEntries(Object.entries(OPENAI_STYLE).map(([p, c]) => [p, c.key])) };
/** Whether any vendor with a key may take a customer's conversation (vendorOk below): what decides if Odelia can run at
 *  all. A Gemini key without GEMINI_PAID doesn't count, since no conversation may go to Google's free tier. */
export const canConverse = (env: Env, o: { synthetic?: boolean } = {}) =>
  Object.entries(PROVIDER_KEYS).some(([p, k]) => !!env(k) && vendorOk(env, p, { hasFiles: false, role: "plan", synthetic: o.synthetic === true }));

/** The Anthropic models by size. The repo's defaults; AGENT_MODEL, AGENT_MODEL_DEEP and AGENT_MODEL_FAST change them. */
export const ANTHROPIC_MODELS = { plan: "claude-sonnet-5-5", deep: "claude-opus-5-5", fast: "claude-haiku-5-5" };
const GEMINI = { lite: "gemini-2.5-flash-lite", flash: "gemini-2.5-flash", next: "gemini-3.8-flash", pro: "gemini-2.5-pro" };
/** The open-model backups: gpt-oss-120b on Groq, then Cerebras, then OpenRouter. Each is used only
 *  when its key is set, only after Gemini and Anthropic can't answer, and never with a customer's files. */
const BACKUPS: [string, string][] = [["groq", "openai/gpt-oss-120b"], ["cerebras", "gpt-oss-120b"], ["openrouter", "openai/gpt-oss-120b"]];

/**
 * The default route of each role, cheapest first, as [provider, model]. "anthropic:*" stands for the Anthropic model
 * that fits the role (Haiku for the cheap roles, Sonnet for plan and review, Opus for deep), so AGENT_MODEL still
 * picks the exact one. A provider without a key is skipped at call time.
 */
// The model roles (founder-approved 2026-10-28): Anthropic first on every role, at the model that fits it, Gemini and the
// open backups behind it for failover:
//   Opus 5.5    Odelia's reasoning that decides something: the review before a filing goes out, deficiency answers and
//               appeals (appeal), deep research (deep); and, as the advisor, inside the plan role's loop
//   Sonnet 5.5  chat and plan drafting: the main loop (plan, consulting Opus as its advisor), drafts, one-liners (short)
//   Haiku 5.5   classification, routing, status reading and summaries (extract, translate, watch)
// "anthropic:*" stands for that model, so AGENT_MODEL, AGENT_MODEL_DEEP and AGENT_MODEL_FAST still pick the exact one.
const CHEAP: [string, string][] = [["anthropic", "*"], ["gemini", GEMINI.lite], ["gemini", GEMINI.flash], ...BACKUPS];
export const DEFAULT_ROUTES: Record<Role, [string, string][]> = {
  extract: CHEAP,
  translate: CHEAP,
  watch: CHEAP,
  short: [["anthropic", "*"], ["gemini", GEMINI.next], ["gemini", GEMINI.flash], ...BACKUPS],
  draft: [["anthropic", "*"], ["gemini", GEMINI.next], ["gemini", GEMINI.flash], ...BACKUPS],
  // the main loop: Sonnet (with Opus as its advisor), then Gemini 3.8 Flash, 2.5 Flash, then the backups
  plan: [["anthropic", "*"], ["gemini", GEMINI.next], ["gemini", GEMINI.flash], ...BACKUPS],
  // the checker: Opus; a vendor other than the doer's still checks when Anthropic can't answer
  review: [["anthropic", "*"], ["gemini", GEMINI.pro], ["gemini", GEMINI.flash], ...BACKUPS],
  appeal: [["anthropic", "*"], ["gemini", GEMINI.pro], ["gemini", GEMINI.next], ...BACKUPS],
  deep: [["anthropic", "*"], ["gemini", GEMINI.pro], ["gemini", GEMINI.next]],
};

/** output_config.effort by role (platform.claude.com, Effort, read 2026-10-28: low for short, simple, high-volume work;
 *  high for complex reasoning and agentic work; Sonnet 5.5 for chat starts at medium). Part of the cached prefix, so a
 *  role always sends the same one. Anthropic only. */
export const EFFORT: Record<Role, "low" | "medium" | "high"> = {
  extract: "low", translate: "low", watch: "low", short: "low", draft: "medium", plan: "medium", review: "high", appeal: "high", deep: "high",
};
/** A main-loop turn that answers an agency's deficiency notice or writes an appeal: the last tool Odelia called was one
 *  of those (appeal_case, or a tool named for a deficiency, an RFI or corrections). That turn is the appeal role (Opus). */
export function appealTurn(messages: unknown): boolean {
  const msgs = Array.isArray(messages) ? messages as Block[] : [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== "assistant" || !Array.isArray(msgs[i].content)) continue;
    const uses = (msgs[i].content as Block[]).filter((b) => b.type === "tool_use").map((b) => String(b.name ?? ""));
    if (uses.length) return uses.some((n) => /appeal|deficien|rfi|correction/i.test(n));
  }
  return false;
}

/** The advisor tool (beta; platform.claude.com, Advisor tool): Sonnet 5.5 consults Opus 5.5 mid-answer in the plan role. */
export const ADVISOR_BETA = "advisor-tool-2026-03-01";

/** The Anthropic model a role falls back to. fallbackModel is what the caller already decided (AGENT_MODEL or AGENT_MODEL_DEEP). */
export function anthropicFor(env: Env, role: Role, fallbackModel: string): string {
  if (role === "review" || role === "appeal") return env("AGENT_MODEL_DEEP") || ANTHROPIC_MODELS.deep;
  if (role === "plan" || role === "deep" || role === "draft" || role === "short") return fallbackModel;
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
  const raw = env(`AGENT_ROUTE_${role.toUpperCase()}`) ?? (ALIAS[role] ? env(ALIAS[role]!) : undefined) ?? env("ODELIA_MODELS") ?? "";
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
export function vendorOk(env: Env, provider: string, o: { hasFiles: boolean; role?: Role; region?: string; publicOnly?: boolean; synthetic?: boolean }): boolean {
  if (!zdrAllows(env, provider)) return false;
  switch (provider) {
    case "anthropic": case "openai": return true;
    case "gemini": return env("GEMINI_PAID") === "1" || geminiFreeRehearsal(env, o.synthetic) || (!o.hasFiles && o.role === "watch" && o.publicOnly === true);
    case "deepseek": return env("ALLOW_DEEPSEEK") === "1" && !o.hasFiles;
    // the open-model backups: on when their key is set (paid API tiers don't train on traffic), never with files
    case "openrouter": case "groq": case "cerebras": case "muse": return !o.hasFiles;
    default: return false;
  }
}

/** A free-tier Gemini key for rehearsals: only with GEMINI_FREE_SYNTHETIC=1 and only for a call on a synthetic
 *  workspace. Google may use free-tier prompts to improve its products, so a real customer's call never goes there. */
export function geminiFreeRehearsal(env: Env, synthetic: boolean | undefined): boolean {
  return env("GEMINI_FREE_SYNTHETIC") === "1" && synthetic === true;
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
  // the share of the prompt the vendor served from its cache (OpenAI's automatic prefix cache, Gemini's implicit or
  // explicit context cache), so the call is priced at the cached rate and the run's hit rate is measured
  const cached = Math.max(0, Number(((u.prompt_tokens_details as Block) ?? {}).cached_tokens ?? 0) || 0);
  return {
    id: String(d.id ?? ""), type: "message", role: "assistant", model, content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn",
    usage: { input_tokens: Math.max(0, Number(u.prompt_tokens ?? 0) - cached), output_tokens: billedOutput(u), ...(cached ? { cache_read_input_tokens: cached } : {}) },
  };
}

/** The output tokens a vendor bills, from OpenAI-style usage. Gemini 3 models always think ("Reasoning cannot be turned
 *  off for Gemini 2.5 Pro or 3 models", ai.google.dev/gemini-api/docs/openai) and bill thinking as output; OpenAI counts
 *  reasoning inside completion_tokens, but a vendor that reports it apart (in total_tokens or reasoning_tokens) would
 *  otherwise go unpriced. The largest reading wins, so thinking is never left out of a call's cost. */
export function billedOutput(u: Record<string, unknown>): number {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const completion = num(u.completion_tokens);
  const reasoning = num(((u.completion_tokens_details as Record<string, unknown>) ?? {}).reasoning_tokens);
  const rest = num(u.total_tokens) ? Math.max(0, num(u.total_tokens) - num(u.prompt_tokens)) : 0;
  return Math.max(completion, rest, reasoning > completion ? completion + reasoning : 0);
}

/** One call to Anthropic. A streamed answer that started fine is left unread for the caller (text is ""); anything
 *  else, an error included, is read whole. */
async function anthropic(f: Fetch, key: string, payload: Record<string, unknown>, beta: string | null) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (beta) headers["anthropic-beta"] = beta;
  const res = await f("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(payload) });
  return { res, text: res.ok && payload.stream ? "" : await res.text() };
}

/**
 * Prompt caching: Odelia's instructions and tools (about 6,500 tokens) are the same on every round, and each round
 * repeats the conversation so far. Marking the end of each as cacheable makes those repeats cost a tenth.
 */
export function withCache(payload: Record<string, unknown>, ttl: "5m" | "1h" = "5m"): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  // the 1-hour lifetime for the stable prefix (system and tools) when calls are more than five minutes apart; the last
  // message keeps five minutes (a longer lifetime must come before a shorter one: Prompt caching, Mixing TTLs)
  const cc = ttl === "1h" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" };
  // cache_breaks (src/odeliaMemory/cache.ts layout): where the stable segments of the system prompt end (the rules; the
  // workspace profile). Each gets its own breakpoint, so a run whose per-run part changed still reads both from the
  // cache; with the tools' and the last message's that's four, the API's limit. Never sent to a provider.
  const breaks = (Array.isArray(out.cache_breaks) ? out.cache_breaks as unknown[] : []).filter((b): b is number => typeof b === "number" && Number.isInteger(b) && b > 0);
  delete out.cache_breaks; delete out.cache_key;
  if (typeof out.system === "string" && out.system && breaks.length) {
    const s = out.system, cuts = [...new Set(breaks)].filter((b) => b < s.length).sort((a, b) => a - b).slice(0, 2);
    const parts: Block[] = [];
    let at = 0;
    for (const c of cuts) { parts.push({ type: "text", text: s.slice(at, c), cache_control: cc }); at = c; }
    parts.push({ type: "text", text: s.slice(at), ...(cuts.length ? {} : { cache_control: cc }) });
    out.system = parts.filter((p) => String(p.text).length);
  } else if (typeof out.system === "string" && out.system) out.system = [{ type: "text", text: out.system, cache_control: cc }];
  const tools = Array.isArray(out.tools) ? [...(out.tools as Block[])] : [];
  if (tools.length) { tools[tools.length - 1] = { ...tools[tools.length - 1], cache_control: cc }; out.tools = tools; }
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
/** Fast mode (platform.claude.com, Fast mode, read 2026-10-28): Opus 5.5 at up to 2.5x the output speed for 2x the price.
 *  Only with ODELIA_FAST_MODE=1, only on Opus 5.5, only while a person waits on the answer (call.interactive); never in a
 *  batch or the background. */
export const fastModeFor = (env: Env, call: Call, model: string) => env("ODELIA_FAST_MODE") === "1" && call.interactive === true && /^claude-opus-5-5/.test(model);
/** The advisor for this request: the plan role on Sonnet (or Haiku), ZDR allowing it, ODELIA_ADVISOR not 0, and calls
 *  left in the run. Opus 5.5 is a listed advisor for Sonnet 5.5 and Haiku 5.5. */
export const advisorFor = (env: Env, call: Call, model: string): Block | null =>
  (call.role ?? roleOfTier(call.tier)) === "plan" && /^claude-(sonnet|haiku)-5-5/.test(model) && env("ODELIA_ADVISOR") !== "0" && zdrAdvisor(env) && (call.advisorLeft ?? 0) > 0
    ? { type: "advisor_20260301", name: "advisor", model: env("AGENT_MODEL_DEEP") || ANTHROPIC_MODELS.deep, max_uses: Math.min(2, call.advisorLeft ?? 0), max_tokens: 2048 }
    : null;

async function viaAnthropic(f: Fetch, key: string, call: Call, model: string, research: { search: Block; fetch: Block; pageTools: Block[] } | null, stream = false, env: Env = () => undefined) {
  const role = call.role ?? roleOfTier(call.tier);
  const adv = advisorFor(env, call, model);
  const fast = fastModeFor(env, call, model);
  const base: Record<string, unknown> = { ...call.payload, model, ...(stream ? { stream: true } : {}),
    ...(call.payload.output_config ? {} : { output_config: { effort: EFFORT[role] } }),
    ...(adv ? { tools: [...((call.payload.tools as Block[] | undefined) ?? []), adv] } : {}),
    ...(fast ? { speed: "fast" } : {}) };
  const payload: Record<string, unknown> = withCache(base, call.cacheTtl ?? "5m");
  // the beta header also whenever the history holds an advisor's result (the docs: it must still be sent for those blocks)
  const advInHistory = JSON.stringify(call.payload.messages ?? []).includes('"advisor_tool_result"');
  const beta = adv || advInHistory ? [call.beta, ADVISOR_BETA].filter(Boolean).join(",") : call.beta;
  let { res, text } = await anthropic(f, key, payload, beta);
  // fast mode over its own rate limit: the same request at standard speed (a cache miss: speeds don't share cached
  // prefixes, Fast mode, Retries and fallbacks)
  if (fast && res.status === 429) {
    console.error("fast mode 429: asking at standard speed (the cached prefix isn't shared across speeds)");
    delete payload.speed;
    ({ res, text } = await anthropic(f, key, payload, beta));
  }
  // the advisor beta refused (not on for the account, or the pair): the same request without it
  if (adv && res.status === 400 && /advisor|beta/i.test(text)) {
    console.error("advisor refused: asking without it");
    payload.tools = withCache({ tools: (call.payload.tools as Block[] | undefined) ?? [] }, call.cacheTtl ?? "5m").tools;
    if (!(payload.tools as Block[]).length) delete payload.tools;
    ({ res, text } = await anthropic(f, key, payload, call.beta));
  }
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
  // a contributor model trades a lower price for the vendor training on the prompts (Meta's Muse Spark contributor tier)
  route = route.filter(([, m]) => !/contributor/i.test(m));
  if (docs) route = route.filter(([p]) => p === "anthropic" || p === "gemini" || p === "openrouter");   // PDFs need a model that reads them
  route = route.filter(([p, m]) => vendorOk(env, p, { hasFiles: files, role, region: call.region, publicOnly: call.publicOnly, synthetic: call.synthetic }) && zdrAllows(env, p, m));
  if (call.research && RESEARCH_FIRST.has(role)) route = [...route.filter(([p]) => p === "anthropic"), ...route.filter(([p]) => p !== "anthropic")];
  return route;
}

/** A streamed answer that came without usage (a vendor that doesn't send it in the stream): an estimate at about four
 *  characters a token, so the call is still priced and counted against the allowance rather than free. */
function withUsage(data: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
  const u = (data.usage ?? {}) as Record<string, unknown>;
  if (Number(u.input_tokens) > 0 || Number(u.output_tokens) > 0) return data;
  const out = JSON.stringify(data.content ?? "").length;
  return { ...data, usage: { input_tokens: Math.ceil(JSON.stringify(payload.messages ?? "").length / 4) + Math.ceil(String(payload.system ?? "").length / 4), output_tokens: Math.ceil(out / 4), estimated: true } };
}

/**
 * Sends the call down its route. Returns the first answer in Anthropic's format, or the last failure.
 * research: the server tools to use when the model is Anthropic; other models answer without web research.
 * onText: stream the answer. The model's words arrive as they're written (the whole text so far each time), and the
 * same complete answer comes back at the end. A model that fails before it says anything falls through to the next one,
 * as without streaming; one that breaks off mid-answer does too, and onText starts again with the next model's words.
 */
export async function callModel(env: Env, call: Call, fallbackModel: string, research: { search: Block; fetch: Block; pageTools: Block[] } | null, f: Fetch = fetch, onText?: OnText): Promise<Result> {
  if (!zdrWebTools(env)) {
    // web search and fetch run on Anthropic's tool servers: off unless they're on the zero-retention list
    const tools = Array.isArray(call.payload.tools) ? (call.payload.tools as Block[]).filter((t) => !("type" in t)) : undefined;
    call = { ...call, research: false, beta: null, payload: { ...call.payload, ...(tools ? { tools: tools.length ? tools : undefined } : {}) } };
    research = null;
  }
  const route = candidates(env, call, fallbackModel);
  const stream = !!onText;
  let last: Result = { ok: false, status: 503, text: zdrRequired(env) && !route.length ? ZDR_REFUSED : "No model has a key. Add one in the Edge Function secrets.", model: "" };
  for (const [p, model] of route) {
    try {
      if (p === "anthropic") {
        const key = env("ANTHROPIC_API_KEY"); if (!key) continue;
        const { res, text } = await viaAnthropic(f, key, call, model, research, stream, env);
        if (res.ok && stream) { const data = withUsage(await anthropicMessage(res, onText), call.payload); return { ok: true, status: 200, data, text: JSON.stringify(data), model: `${p}:${model}` }; }
        if (res.ok) return { ok: true, status: 200, data: JSON.parse(text), text, model: `${p}:${model}` };
        last = { ok: false, status: res.status, text, model: `${p}:${model}` };
      } else {
        const cfg = OPENAI_STYLE[p], key = env(cfg.key); if (!key) continue;
        let body = toOpenAI({ ...call.payload, tools: research ? research.pageTools : call.payload.tools }, model);
        // OpenRouter routes to many hosts: only those that don't keep or train on prompts may serve our calls.
        if (p === "openrouter") (body as Record<string, unknown>).provider = { data_collection: "deny" };
        // prompt caching: OpenAI caches a repeated prefix by itself, and routes calls with the same key to the same cache;
        // Gemini, where explicit caching is on, refers to a stored copy of the stable prefix (gemini_cache.ts)
        if (p === "openai" && typeof call.payload.cache_key === "string") body.prompt_cache_key = call.payload.cache_key.slice(0, 64);
        const plain = body;
        if (p === "gemini" && explicitOn(env)) { const c = await ensureCache(env, model, call.payload, f); if (c) body = useCache(body, c); }
        // the usage comes in the stream's last piece where the vendor supports asking for it (Gemini's endpoint isn't
        // asked; withUsage estimates when it's missing)
        if (stream) { Object.assign(body, { stream: true, ...(p === "gemini" ? {} : { stream_options: { include_usage: true } }) }); Object.assign(plain, { stream: true, ...(p === "gemini" ? {} : { stream_options: { include_usage: true } }) }); }
        const post = (b: Record<string, unknown>) => f(cfg.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify(b) });
        let res = await post(body);
        // a cache that expired or was refused: the same call without it
        if (!res.ok && body !== plain && res.status === 400) { await res.text().catch(() => ""); res = await post(plain); }
        if (res.ok && stream) { const data = withUsage(fromOpenAI(await openaiCompletion(res, onText), `${p}:${model}`), call.payload); return { ok: true, status: 200, data, text: JSON.stringify(data), model: `${p}:${model}` }; }
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
