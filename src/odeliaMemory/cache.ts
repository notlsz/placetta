import { cacheRates } from "../../supabase/functions/_shared/cache_rates.ts";

/* ------------------------------------------------------------------ *
 * Prompt caching: the stable parts of a prompt first, so every provider
 * can serve them from its cache instead of reading them again.
 *
 *   1. Odelia's rules (the same for every run of a workspace, all day)
 *   2. the tool schemas (sent beside the system prompt; fixed order)
 *   3. the workspace profile: the briefs, the pinned facts from the
 *      records, and the approved memories (change only when the
 *      business changes them)
 *   4. then what changes every run: today's date, the workspace as it
 *      stands, the lessons, the person's own memory, the channel
 *
 * Anthropic gets cache_control breakpoints at the end of 1 and of 3
 * (with the tools' and the last message's, four in all, the API's
 * limit). Gemini caches a repeated prefix by itself (implicit caching on
 * 2.5 and later) and, where turned on, holds it as explicit context
 * (supabase/functions/_shared/gemini_cache.ts). OpenAI caches any
 * repeated prefix of 1,024 tokens or more automatically. All three only
 * pay off when the prefix is byte-for-byte the same, which is what the
 * layout guarantees and the tests check.
 * ------------------------------------------------------------------ */

/** Where the stable rules end and the per-run part begins in rules() (src/live.ts). */
const DATE_RE = / Today is \d{4}-\d{2}-\d{2}\./;
const VOLATILE_AT = "\n\nWorkspace:\n";

export type Layout = {
  /** The whole system prompt. */
  system: string;
  /** Character offsets where a cache breakpoint ends a stable segment (the rules; the profile). */
  breaks: number[];
  /** Fingerprint of the stable prefix (rules + profile): equal across runs means the cache can hit. */
  prefix: string;
};

/** FNV-1a 64-bit as hex: a fingerprint of the prefix, the same in the browser, Node and Deno. */
export function fingerprint(s: string): string {
  let h = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, "0");
}

/** Split rules() into what's the same every run (the rules, the skills) and what isn't (today's date, the workspace). */
export function splitRules(rules: string): { stable: string; volatile: string } {
  const date = DATE_RE.exec(rules)?.[0].trim() ?? "";
  const body = rules.replace(DATE_RE, "");
  const at = body.indexOf(VOLATILE_AT);
  const stable = at >= 0 ? body.slice(0, at) : body;
  const rest = at >= 0 ? body.slice(at + 2) : "";
  return { stable, volatile: [date, rest].filter(Boolean).join("\n\n") };
}

/** The system prompt in cache order. profile is the workspace's stable memory (briefs, pinned facts, approved
 *  memories); tail is everything that changes per run. */
export function layout(o: { rules: string; profile?: string; tail?: string[]; clean?: (s: string) => string }): Layout {
  // clean (the credential scrub) runs on each segment before the offsets are counted, so the breakpoints stay exact
  const c = o.clean ?? ((s: string) => s);
  const { stable, volatile } = splitRules(o.rules);
  const head = c(stable).trimEnd();
  const profile = c(o.profile ?? "").trim();
  const tail = [volatile, ...(o.tail ?? [])].map(s => c(s).trim()).filter(Boolean).join("\n\n");
  const seg1 = head + "\n\n";
  const seg2 = profile ? `${profile}\n\n` : "";
  const system = seg1 + seg2 + tail;
  const breaks = [seg1.length, ...(seg2 ? [seg1.length + seg2.length] : [])];
  return { system, breaks, prefix: fingerprint(seg1 + seg2) };
}

/* ------------------------------ what the cache did ------------------------------ */

/** One call's tokens, the same for every provider: input read fresh, read from the cache, written to the cache, output. */
export type CacheUse = { input: number; read: number; write: number; output: number };
const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
/** Usage as Anthropic reports it, or OpenAI's and Gemini's OpenAI-compatible endpoint (prompt_tokens_details.cached_tokens),
 *  or Gemini's own (cachedContentTokenCount). */
export function cacheUse(u: Record<string, unknown> | undefined): CacheUse {
  if (!u) return { input: 0, read: 0, write: 0, output: 0 };
  if ("cache_read_input_tokens" in u || "cache_creation_input_tokens" in u || "input_tokens" in u)
    return { input: n(u.input_tokens), read: n(u.cache_read_input_tokens), write: n(u.cache_creation_input_tokens), output: n(u.output_tokens) };
  if ("prompt_tokens" in u) {
    const cached = n((u.prompt_tokens_details as Record<string, unknown> | undefined)?.cached_tokens);
    return { input: Math.max(0, n(u.prompt_tokens) - cached), read: cached, write: 0, output: n(u.completion_tokens) };
  }
  if ("promptTokenCount" in u) {
    const cached = n(u.cachedContentTokenCount);
    return { input: Math.max(0, n(u.promptTokenCount) - cached), read: cached, write: 0, output: n(u.candidatesTokenCount) };
  }
  return { input: 0, read: 0, write: 0, output: 0 };
}

/** A run's cache record, carried in its state across chunks and written to agent_runs when it ends. */
export type CacheStats = CacheUse & { calls: number; hits: number; prefix?: string; prefixChanged?: number };
export const emptyStats = (): CacheStats => ({ calls: 0, hits: 0, input: 0, read: 0, write: 0, output: 0 });
export function addCall(s: CacheStats, u: CacheUse, prefix?: string): CacheStats {
  const changed = prefix && s.prefix && s.prefix !== prefix ? 1 : 0;
  return { calls: s.calls + 1, hits: s.hits + (u.read > 0 ? 1 : 0), input: s.input + u.input, read: s.read + u.read, write: s.write + u.write, output: s.output + u.output,
    ...(prefix ? { prefix } : s.prefix ? { prefix: s.prefix } : {}), ...((s.prefixChanged ?? 0) + changed ? { prefixChanged: (s.prefixChanged ?? 0) + changed } : {}) };
}
/** Share of input tokens served from the cache (0 to 1). */
export const hitRate = (s: CacheUse) => { const all = s.input + s.read + s.write; return all ? s.read / all : 0; };

/** What a provider charges for a cached input token, as a share of a fresh one (the same table prices every call). */
export { cacheRates };

/** What caching saved on a run, as a share of what the same input would have cost uncached. */
export function savedShare(s: CacheUse, model: string): number {
  const r = cacheRates(model), all = s.input + s.read + s.write;
  if (!all) return 0;
  const paid = s.input + s.read * r.read + s.write * r.write;
  return Math.max(-1, 1 - paid / all);
}
