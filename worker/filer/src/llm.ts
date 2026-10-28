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

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ToolCall = { name: string; input: Record<string, unknown> };
/** One question: a prompt, the tools, and (only) the one tool the answer must be. */
export type Ask = { prompt: string; tools: ToolDef[]; only?: string; maxTokens: number };
/** A question as the router takes it: the prompt may be built only once a seat may see it (nothing is built, so nothing
 *  can throw or leak, when the data rules leave no seat). */
export type AskIn = Omit<Ask, "prompt"> & { prompt: string | (() => string) };
export type Vendor = "anthropic" | "gemini" | "openrouter" | "muse";
export type Seat = { vendor: Vendor; model: string };
type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

export const VENDORS: Vendor[] = ["anthropic", "gemini", "openrouter", "muse"];
export const KEY_OF: Record<Vendor, string> = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", openrouter: "OPENROUTER_API_KEY", muse: "MUSE_API_KEY" };
/** Each vendor's default model, checked on the vendor's own docs on 2026-10-28:
 *  claude-sonnet-5-5 (platform.claude.com, models, Sonnet 5.5), gemini-3.8-flash (ai.google.dev models: stable),
 *  anthropic/claude-sonnet-5.5 (openrouter.ai: served by hosts other than our own Anthropic account, so our spend cap
 *  doesn't reach it), muse-spark-1.3 (dev.meta.ai docs, models: "Recommended for new work"). */
export const DEFAULT_MODEL: Record<Vendor, string> = { anthropic: "claude-sonnet-5-5", gemini: "gemini-3.8-flash", openrouter: "anthropic/claude-sonnet-5.5", muse: "muse-spark-1.3" };
export const DEFAULT_ORDER: Vendor[] = ["anthropic", "gemini", "openrouter", "muse"];

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
      return { vendor: v, model: m || (v === "anthropic" ? anth : DEFAULT_MODEL[v]) };
    }).filter((x) => VENDORS.includes(x.vendor) && !!x.model)
    : DEFAULT_ORDER.map((v) => ({ vendor: v, model: v === "anthropic" ? anth : DEFAULT_MODEL[v] }));
  const seen = new Set<string>();
  return list.filter((s) => { const k = `${s.vendor}:${s.model}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Why a seat may not take customer data, or null when it may. Checked before anything is sent. */
export function refusal(env: Env, s: Seat, o: { synthetic?: boolean } = {}): "no_key" | "zdr" | "gemini_unpaid" | "contributor" | null {
  if (!env(KEY_OF[s.vendor])?.trim()) return "no_key";
  if (!zdrAllows(env, s.vendor, s.model)) return "zdr";
  if (s.vendor === "gemini" && env("GEMINI_PAID") !== "1" && !(env("GEMINI_FREE_SYNTHETIC") === "1" && o.synthetic === true)) return "gemini_unpaid";
  if (s.vendor === "muse" && /contributor/i.test(s.model)) return "contributor";
  if (s.vendor === "openrouter" && /^meta\/.*contributor/i.test(s.model)) return "contributor";
  return null;
}

/** The seats this worker can use right now, in order. */
export const usableSeats = (env: Env, o: { synthetic?: boolean } = {}) => seatsOf(env).filter((s) => refusal(env, s, o) === null);

/** Every key, and the shapes keys take, out of a line of text. */
export function redact(text: string, env: Env): string {
  let t = text;
  for (const v of VENDORS) { const k = env(KEY_OF[v])?.trim(); if (k && k.length >= 6) t = t.split(k).join("•••"); }
  return t.replace(/sk-ant-[\w-]+/g, "•••").replace(/sk-or-[\w-]+/g, "•••").replace(/AIza[\w-]{20,}/g, "•••").replace(/\bBearer\s+\S+/gi, "Bearer •••");
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
  constructor(status: number, message: string) { super(message); this.status = status; }
}
/** A failure that will last a while (a spend or usage limit, a refused key, an outage): the seat sits out. */
export const lasting = (e: SeatError) => e.status === 429 || e.status === 401 || e.status === 402 || e.status === 403 || e.status >= 500 || e.status === 0
  || /usage limit|spend limit|credit balance|quota|billing|exceeded/i.test(e.message);

// ---------------------------------------------------------------- adapters

/** Claude Sonnet 5.5 refuses forced tool use (tool_choice "any" or "tool" is a 400: platform.claude.com, What's new in
 *  Sonnet 5.5), so Claude always gets "auto" and the prompt says which tool; an answer without one fails over. */
const claudeModel = (m: string) => /claude/i.test(m);
const mustUse = (a: Ask) => a.only ? `\n\nAnswer only by calling the ${a.only} tool.` : "\n\nAnswer only by calling exactly one of the tools.";

async function anthropic(f: Fetch, key: string, model: string, a: Ask, env: Env): Promise<ToolCall> {
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    // adaptive thinking is on by default on the current models and counts against max_tokens: room for it and the call
    body: JSON.stringify({ model, max_tokens: Math.max(a.maxTokens, 4000), tools: a.only ? a.tools.filter((t) => t.name === a.only) : a.tools, tool_choice: { type: "auto" },
      messages: [{ role: "user", content: a.prompt + mustUse(a) }] }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) throw new SeatError(res.status, await why(res, env));
  const body = await res.json() as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
  const use = body.content?.find((c) => c.type === "tool_use" && (!a.only || c.name === a.only));
  if (!use?.name) throw new SeatError(200, "chose no tool");
  return { name: use.name, input: use.input ?? {} };
}

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

async function gemini(f: Fetch, key: string, model: string, a: Ask, env: Env): Promise<ToolCall> {
  const res = await f(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: a.prompt }] }],
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
  if (body.promptFeedback?.blockReason) throw new SeatError(200, `blocked: ${body.promptFeedback.blockReason}`);
  const c = body.candidates?.[0];
  const call = c?.content?.parts?.find((p) => p.functionCall?.name)?.functionCall;
  if (!call?.name || (a.only && call.name !== a.only)) throw new SeatError(200, `chose no tool${c?.finishReason ? ` (${c.finishReason})` : ""}`);
  return { name: call.name, input: call.args ?? {} };
}

/** OpenAI-style chat completions with tools: OpenRouter and Meta Model API. */
async function chat(f: Fetch, url: string, key: string, model: string, a: Ask, env: Env, extra: Record<string, unknown>): Promise<ToolCall> {
  const claude = claudeModel(model);
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, max_tokens: Math.max(a.maxTokens, 4000),
      messages: [{ role: "user", content: a.prompt + (claude ? mustUse(a) : "") }],
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
  const fn = body.choices?.[0]?.message?.tool_calls?.find((c) => c.function?.name && (!a.only || c.function.name === a.only))?.function;
  if (!fn?.name) throw new SeatError(200, "chose no tool");
  let input: Record<string, unknown>;
  try { input = JSON.parse(fn.arguments || "{}"); } catch { throw new SeatError(200, "tool arguments weren't JSON"); }
  return { name: fn.name, input: input && typeof input === "object" ? input : {} };
}

export async function askSeat(s: Seat, a: Ask, env: Env, f: Fetch = fetch): Promise<ToolCall> {
  const key = env(KEY_OF[s.vendor])!.trim();
  switch (s.vendor) {
    case "anthropic": return anthropic(f, key, s.model, a, env);
    case "gemini": return gemini(f, key, s.model, a, env);
    case "openrouter":
      // only hosts that don't keep or train on prompts; with zero retention required, only zero-retention hosts; and
      // only hosts that take the tools and tool_choice as sent
      return chat(f, "https://openrouter.ai/api/v1/chat/completions", key, s.model, a, env,
        { provider: { data_collection: "deny", require_parameters: true, ...(zdrRequired(env) ? { zdr: true } : {}) } });
    case "muse": return chat(f, (env("MUSE_BASE_URL")?.trim().replace(/\/+$/, "") || "https://api.meta.ai/v1") + "/chat/completions", key, s.model, a, env, {});
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
  async ask(q: AskIn): Promise<ToolCall> {
    const all = seatsOf(this.env);
    const o = { synthetic: this.synthetic };
    const ok = all.filter((s) => refusal(this.env, s, o) === null);
    if (!ok.length) {
      if (zdrRequired(this.env) && all.some((s) => refusal(this.env, s, o) === "zdr")) throw new Error(ZDR_REFUSED);
      throw new Error("model error: no model key is set (ANTHROPIC_API_KEY, GEMINI_API_KEY with GEMINI_PAID=1, OPENROUTER_API_KEY or MUSE_API_KEY)");
    }
    const cool = Math.max(0, Number(this.env("FILER_MODEL_COOLDOWN_S") ?? "120") || 0) * 1000;
    const t = this.now();
    const ready = ok.filter((s) => (this.benched.get(id(s)) ?? 0) <= t);
    const order = ready.length ? [...ready, ...ok.filter((s) => !ready.includes(s))] : ok;
    const a: Ask = { ...q, prompt: typeof q.prompt === "function" ? q.prompt() : q.prompt };
    const failed: string[] = [];
    for (const s of order) {
      this.calls++;
      try {
        const out = await askSeat(s, a, this.env, this.f);
        this.benched.delete(id(s));
        if (this.by !== id(s) || failed.length) this.log(`filer: model ${id(s)} answered${failed.length ? ` after ${failed.join("; ")}` : ""}`);
        this.by = id(s);
        return out;
      } catch (e) {
        const err = e instanceof SeatError ? e : new SeatError(0, redact(String((e as Error)?.message ?? e), this.env).slice(0, 160));
        if (lasting(err) && cool) this.benched.set(id(s), t + cool);
        failed.push(`${id(s)} ${err.status || "no answer"}${err.message ? `: ${err.message}` : ""}`);
        console.error(`filer: model ${id(s)} failed (${err.status || "no answer"}${err.message ? `: ${err.message}` : ""}), trying the next`);
      }
    }
    throw new Error(`model error: every model failed: ${failed.join("; ")}`.slice(0, 400));
  }
}
const id = (s: Seat) => `${s.vendor}:${s.model}`;
