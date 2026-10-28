// The model cascade for a filing run, cheapest first (founder-approved 2026-10-28):
//   1. replay    a recorded skill or a reviewed playbook's steps (run.ts replay): no model call at all
//   2. fast      routine steps (fill, select, check, click on a normal page): FILER_MODEL_FAST, default Haiku 5.5
//   3. strong    FILER_MODEL_STRONG, default Opus 5.5, for the pages that decide something:
//                  the agency's review or summary page, and the final-submit check (a send button with every line filled)
//                  a page the fast model answered with need_person, an invalid tool call, a value the approved-values
//                  guard refused, or the same action twice on a page that didn't change
//                  a page with a CAPTCHA or an identity question the person just cleared, or that asks one in its words
//                  a deficiency, correction or status page being read
// Each tier fails over through the vendors (llm.ts tierSeats: Gemini, OpenRouter, Muse) on errors and usage limits.
// The guards (guards.ts, run.ts exec) apply to whatever is chosen, whichever tier chose it: a strong model gets no more
// room than a fast one. The hand-back messages a person reads stay the fixed, bilingual ones (guards.ts mustStop): a
// model never writes what the owner is told about a CAPTCHA or an identity check.
//
// Pure: run.ts asks which tier, and reads the ledger the router keeps (llm.ts Router.ledger) for filer_runs.
import { costOf, type Usage } from "../../../supabase/functions/_shared/ai_cost.ts";
import { isFinal, mustStop, type PageState } from "./guards.ts";
import type { CallCost, ModelTier, ToolCall, ToolDef } from "./llm.ts";

export type Why =
  | "review" | "final_submit" | "captcha" | "identity" | "deficiency"     // the page itself
  | "need_person" | "invalid_call" | "guard" | "repeat";                  // the fast model's answer on it

const REVIEW = /\b(review|summary|preview|verify (your|the) (information|application|entries|answers|details)|confirm (your|the) (information|application|details|entries)|before you submit|check your answers)\b/i;
const DEFICIENCY = /\b(deficien\w*|corrections? (required|needed|notice)|notice of (incomplete|deficiency|correction)|incomplete application|additional information (required|requested|needed)|request for (additional )?information|application status|permit status|status of (your|the) application|resubmi\w+)\b/i;
const IDENTITY_Q = /\b(verify your identity|identity verification|security questions?|mother'?s maiden name|knowledge[- ]based (authentication|questions)|answer (the|these) questions about (yourself|your credit))\b/i;
const CAPTCHA_Q = /\b(captcha|i'?m not a robot|verify (that )?you are (a )?human|human verification)\b/i;
const EMPTY = (c: PageState["controls"][number]) => ["text", "email", "tel", "number", "date", "textarea", "url", "search"].includes(c.type) && !c.value;

/** Why this page goes to the strong model from the first look, or null for the fast one. */
export function pageTier(st: PageState): Why | null {
  const head = [st.title, ...st.headings].join("\n");
  const top = `${head}\n${st.text.slice(0, 2000)}`;
  // reached only once the person has cleared it (run.ts waived), or when the page asks in words a guard doesn't stop on
  const stop = mustStop(st)?.reason;
  if (stop === "captcha" || CAPTCHA_Q.test(top)) return "captcha";
  if (stop === "identity" || IDENTITY_Q.test(top)) return "identity";
  if (DEFICIENCY.test(head)) return "deficiency";
  if (REVIEW.test(head)) return "review";
  // the final-submit check: a send button, and nothing left to fill on the page
  if (st.buttons.some((b) => isFinal(b.text)) && !st.controls.some(EMPTY)) return "final_submit";
  return null;
}

/** Why the fast model's answer goes to the strong one instead, or null when it may be carried out. */
export function answerTier(call: ToolCall, tools: ToolDef[], o: { doneHere: Set<string> }): Why | null {
  if (call.name === "need_person") return "need_person";
  const def = tools.find((t) => t.name === call.name);
  if (!def) return "invalid_call";
  const req = ((def.input_schema as { required?: string[] }).required ?? []);
  if (req.some((k) => call.input?.[k] === undefined || call.input?.[k] === null || call.input?.[k] === "")) return "invalid_call";
  // the same action again on a page that didn't change (a wait for a slow page isn't one)
  if (call.name !== "wait" && o.doneHere.has(actionKey(call))) return "repeat";
  return null;
}

/** One action, as the repeat check compares them: the tool and its arguments. */
export const actionKey = (call: ToolCall) => `${call.name} ${JSON.stringify(Object.keys(call.input ?? {}).sort().map((k) => [k, call.input[k]]))}`;

/** The approved-values guard refused what the model typed or chose (run.ts exec): the next try on that page is strong. */
export const guardRefused = (error: string) => /^Refused: that (value|option) isn't one of the approved values/.test(error);

/** The tier for a reason. */
export const tierOf = (why: Why | null): ModelTier => (why ? "strong" : "fast");

/** The run's AI, added up for filer_runs and the filing log: calls and dollars by tier, tokens, total. */
export type RunAi = {
  provider: string | null; replayed_steps: number; calls: number; usd: number;
  input: number; output: number; cache_read: number; cache_write: number;
  by_tier: Record<string, { calls: number; usd: number }>;
  steps: (CallCost & { why?: string })[];
};
export function summarize(ledger: (CallCost & { why?: string })[], o: { provider?: string | null; replayed?: number } = {}): RunAi {
  const out: RunAi = { provider: o.provider ?? null, replayed_steps: o.replayed ?? 0, calls: ledger.length, usd: 0, input: 0, output: 0, cache_read: 0, cache_write: 0, by_tier: {}, steps: ledger.slice(0, 200) };
  for (const c of ledger) {
    out.usd += c.usd; out.input += c.input; out.output += c.output; out.cache_read += c.cache_read; out.cache_write += c.cache_write;
    const t = (out.by_tier[c.tier] ??= { calls: 0, usd: 0 });
    t.calls++; t.usd = round(t.usd + c.usd);
  }
  out.usd = round(out.usd);
  return out;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** What a run's AI is expected to cost, priced with ai_cost.ts: steps per tier, the static prompt (tools and rules,
 *  cached after each tier's first call), the page each step reads, and the output each writes (thinking included). */
export type Sample = { fast: number; strong: number; staticTokens: number; pageTokens: number; fastOut: number; strongOut: number;
  fastModel?: string; strongModel?: string;
  /** Prompt caching of the static part (default on): the first call of each model writes it, the rest read it. */
  cache?: boolean;
  /** Advisor calls inside fast steps (Opus reading the step's transcript and writing its advice). */
  advisor?: { calls: number; input: number; output: number; model?: string };
  /** Prices as of (a published change applies from its day). */
  at?: Date };
export function expectedCost(s: Sample): { fast: number; strong: number; advisor: number; total: number } {
  const at = s.at ?? new Date("2026-11-01T00:00:00Z");
  const tier = (n: number, model: string, out: number) => {
    let usd = 0;
    for (let i = 0; i < n; i++) {
      const u: Usage = s.cache === false ? { input_tokens: s.staticTokens + s.pageTokens, output_tokens: out }
        : { input_tokens: s.pageTokens, output_tokens: out, ...(i === 0 ? { cache_creation_input_tokens: s.staticTokens } : { cache_read_input_tokens: s.staticTokens }) };
      usd += costOf(model, u, at);
    }
    return round(usd);
  };
  const fast = tier(s.fast, s.fastModel ?? "anthropic:claude-haiku-5-5", s.fastOut);
  const strong = tier(s.strong, s.strongModel ?? "anthropic:claude-opus-5-5", s.strongOut);
  const a = s.advisor;
  const advisor = a ? round(a.calls * costOf(a.model ?? "anthropic:claude-opus-5-5", { input_tokens: a.input, output_tokens: a.output }, at)) : 0;
  return { fast, strong, advisor, total: round(fast + strong + advisor) };
}
