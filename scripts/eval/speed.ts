/* Cost and speed on the offline eval fixtures (npm run eval:live -- --dry --speed), with no key. The scripted model
   answers instantly, so this measures what Placetta controls and models what the vendor adds:
     tokens     every request the run actually builds (tools, then system, then messages: the order Anthropic caches
                in), counted at about 4 characters a token (1 for Chinese)
     cache      a call reads from the cache the prefix it shares with the scenario's previous call, when that prefix
                is at least 1,024 tokens (Anthropic's and OpenAI's minimum); the rest is written (Anthropic) or plain
     cost       at the role's default model's list price (supabase/functions/_shared/ai_cost.ts), cached reads at the
                vendor's cached rate
     time       Placetta's own time is measured; each model call adds a modeled latency: time to first token 350 ms
                plus 0.04 ms per uncached input token, then 80 output tokens a second (a Flash or Sonnet class model)
   Time to first token is when the first call that writes words to the person starts streaming them. First words is
   when the person first sees an answer: that, or Placetta's own first line from the registry (src/plan/instant.ts) if
   it comes sooner, counted when the run puts it in the draft. Pure, tested in
   scripts/eval/harness-test.ts. The numbers compare one build with another; only a live run gives real ones. */
import { tokenCount } from "../../src/odeliaMemory/retrieve";
import { costOf } from "../../supabase/functions/_shared/ai_cost";

export const MIN_CACHE_TOKENS = 1024;
export const LATENCY = { firstTokenMs: 350, perInputTokenMs: 0.04, outputTokensPerS: 80 };

/** The request as the vendor reads it, in cache order, with where the tools and the system prompt end. */
export function requestText(body: Record<string, unknown>): { text: string; toolsEnd: number; systemEnd: number } {
  const tools = `${JSON.stringify(body.tools ?? [])}\n`, system = `${typeof body.system === "string" ? body.system : JSON.stringify(body.system ?? "")}\n`;
  return { text: tools + system + JSON.stringify(body.messages ?? []), toolsEnd: tools.length, systemEnd: tools.length + system.length };
}
/** Where a request first differs from the one before: the part that broke the cache. */
export type Break = "tools" | "system" | "messages" | "none";

const common = (a: string, b: string) => { const n = Math.min(a.length, b.length); let i = 0; while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++; return i; };

export type SimCall = { input: number; read: number; output: number; usd: number; ttftMs: number; ms: number; text: boolean };
/** One call: its tokens (cached against the previous request), its price on model, and its modeled time. */
export function simCall(prev: string | null, req: string, out: { content: { type: string; text?: string }[] }, model: string): SimCall {
  const all = tokenCount(req);
  const shared = prev ? tokenCount(req.slice(0, common(prev, req))) : 0;
  const read = shared >= MIN_CACHE_TOKENS ? shared : 0;
  const input = all - read;
  const output = Math.max(1, tokenCount(JSON.stringify(out.content)));
  const usd = costOf(model, { input_tokens: input, cache_read_input_tokens: read, output_tokens: output } as never);
  const ttftMs = LATENCY.firstTokenMs + input * LATENCY.perInputTokenMs;
  return { input, read, output, usd, ttftMs, ms: ttftMs + (output / LATENCY.outputTokensPerS) * 1000, text: out.content.some(b => b.type === "text" && !!b.text?.trim()) };
}

/** A scenario's clock: Placetta's own measured time plus each call's modeled time, in order. */
export class SimClock {
  prev: string | null = null; modelMs = 0; firstTokenMs: number | null = null; usd = 0; input = 0; read = 0; output = 0; calls = 0;
  breaks: Record<Break, number> = { tools: 0, system: 0, messages: 0, none: 0 };
  /** The run's first request, which the next run's first call may find in the cache (a warm cache across runs). */
  first: string | null = null;
  /** warm: the previous run's first request (the cache another run left), or null for a cold start. */
  constructor(warm: string | null = null, private start = Date.now(), private now: () => number = Date.now) { this.prev = warm; this.warm = warm !== null; }
  private warm: boolean;
  call(r: { text: string; toolsEnd: number; systemEnd: number }, out: { content: { type: string; text?: string }[] }, model: string): SimCall {
    const req = r.text;
    if (this.first === null) this.first = req;
    // the first call against another run's request: count where it broke, but as its own kind
    if (this.warm && this.calls === 0) { const at = common(this.prev!, req); this.coldBreak = at < r.toolsEnd ? "tools" : at < r.systemEnd ? "system" : "messages"; const c = simCall(this.prev, req, out, model); this.prev = null; return this.add(c, req); }
    if (this.prev !== null) { const at = common(this.prev, req); this.breaks[at >= this.prev.length - 2 ? "none" : at < r.toolsEnd ? "tools" : at < r.systemEnd ? "system" : "messages"]++; }
    return this.add(simCall(this.prev, req, out, model), req);
  }
  coldBreak: Break | null = null;
  /** When Placetta itself first put words in the draft (src/plan/instant.ts), on the same clock as the model's. */
  wordsMs: number | null = null;
  words(): void { if (this.wordsMs === null) this.wordsMs = this.now() - this.start + this.modelMs; }
  private add(c: SimCall, req: string): SimCall {
    if (c.text && this.firstTokenMs === null) this.firstTokenMs = this.now() - this.start + this.modelMs + c.ttftMs;
    this.prev = req; this.modelMs += c.ms; this.usd += c.usd; this.input += c.input; this.read += c.read; this.output += c.output; this.calls++;
    return c;
  }
  done() {
    const total = this.now() - this.start + this.modelMs;
    const ttft = this.firstTokenMs ?? total;
    return { ttft_ms: Math.round(ttft), first_words_ms: Math.round(Math.min(ttft, this.wordsMs ?? Infinity)), done_ms: Math.round(total), usd: Math.round(this.usd * 1e6) / 1e6, input: this.input, cache_read: this.read, output: this.output, calls: this.calls, breaks: { ...this.breaks }, cross_run_break: this.coldBreak,
      hit: this.input + this.read ? Math.round((1000 * this.read) / (this.input + this.read)) / 10 : 0 };
  }
}
export type Sim = ReturnType<SimClock["done"]>;

const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0; };
/** Median and 95th percentile of time to first token and to done, cost per run, tokens and the cache hit rate. */
export function speedSummary(sims: Sim[]) {
  const m = (f: (s: Sim) => number) => pct(sims.map(f), 50), p = (f: (s: Sim) => number) => pct(sims.map(f), 95);
  const read = sims.reduce((a, s) => a + s.cache_read, 0), input = sims.reduce((a, s) => a + s.input, 0);
  return { runs: sims.length, ttft_p50_ms: m(s => s.ttft_ms), ttft_p95_ms: p(s => s.ttft_ms),
    first_words_p50_ms: m(s => s.first_words_ms ?? s.ttft_ms), first_words_p95_ms: p(s => s.first_words_ms ?? s.ttft_ms), done_p50_ms: m(s => s.done_ms), done_p95_ms: p(s => s.done_ms),
    usd_p50: m(s => s.usd), usd_p95: p(s => s.usd), usd_mean: sims.length ? Math.round((sims.reduce((a, s) => a + s.usd, 0) / sims.length) * 1e6) / 1e6 : 0,
    prompt_tokens_p50: m(s => s.input + s.cache_read), cache_hit_pct: input + read ? Math.round((1000 * read) / (input + read)) / 10 : 0,
    cross_run_breaks: sims.reduce((a, s) => { if (s.cross_run_break) a[s.cross_run_break]++; return a; }, { tools: 0, system: 0, messages: 0, none: 0 } as Record<Break, number>),
    cache_breaks: sims.reduce((a, s) => { for (const k of Object.keys(s.breaks) as Break[]) a[k] += s.breaks[k]; return a; }, { tools: 0, system: 0, messages: 0, none: 0 } as Record<Break, number>) };
}
