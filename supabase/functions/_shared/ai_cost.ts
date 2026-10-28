// What one model call cost, from the usage the provider returns. Dollars per million tokens, at each vendor's list
// price. The Anthropic and Gemini rows were read again from the vendors' own pages on 2026-10-22
// (https://platform.claude.com/docs/en/about-claude/pricing, https://ai.google.dev/gemini-api/docs/pricing; the list
// and what changed are in docs/UNIT-ECONOMICS.md, Sources). Before that pass Gemini 3.8 Flash was priced at half its
// list price ($0.375 / $1.875 for $0.75 / $3.75), so the main loop's recorded cost, the allowance it counts against and
// the margin views read about half of what Google bills. Other vendors: checked 2026-10-16 against price trackers.
// Where a vendor charges more for long prompts (Gemini Pro past 200k tokens, GPT-5.4 past 272k, Haiku 5.5 past 100k),
// the dearer rate applies to the whole call, as the vendors bill it. Cache rates are in cache_rates.ts; web search is
// $10 per 1,000 searches. Where two sources disagreed, the higher price is used. A price a vendor has announced will
// change on a date carries `next`, and calls on or after that day are priced at it (Gemini 3.8 and 3.6 Flash double on
// 2027-01-01).
// A model not listed here is priced like the most expensive one, so an unknown route can never look cheap.
// The first matching pattern wins, so the specific ones come before the family names.

import { cacheRates } from "./cache_rates.ts";

type Price = { in: number; out: number; /** the rate past `longAt` input tokens, when the vendor has one */ long?: Price; longAt?: number;
  /** a published price change: from `at` (YYYY-MM-DD, UTC) the call is priced at `price` */ next?: { at: string; price: Price } };
const PRICES: [RegExp, Price][] = [
  // Anthropic
  [/fable|mythos/, { in: 10, out: 50 }],
  [/opus-5-5/, { in: 4, out: 20 }],
  [/opus-4-1/, { in: 15, out: 75 }],
  [/opus/, { in: 5, out: 25 }],                       // Opus 4.5, 4.6, 5
  [/sonnet-4/, { in: 3, out: 15 }],                   // Sonnet 4, 4.5, 4.6
  [/sonnet/, { in: 2, out: 10 }],                     // Sonnet 5, 5.5
  [/haiku-3/, { in: 0.8, out: 4 }],
  [/haiku-5/, { in: 0.1, out: 0.5, longAt: 100_000, long: { in: 0.5, out: 2.5 } }],   // Haiku 5.5; over 100K tokens, the higher tier
  [/haiku/, { in: 1, out: 5 }],                       // Haiku 4.5
  // DeepSeek (peak-hour rate; off-peak is half)
  [/deepseek-flash|deepseek-chat|deepseek-reasoner/, { in: 0.3, out: 1.2 }],
  [/deepseek/, { in: 0.6, out: 2.5 }],
  // Google
  [/gemini-2\.5-flash-lite/, { in: 0.1, out: 0.4 }],
  [/gemini-2\.5-flash/, { in: 0.3, out: 2.5 }],
  [/gemini-2\.5-pro/, { in: 1.25, out: 10, longAt: 200_000, long: { in: 2.5, out: 15 } }],
  [/gemini-3\.1-flash-lite/, { in: 0.25, out: 1.5 }],
  [/gemini-3\.5-flash-lite/, { in: 0.3, out: 2.5 }],
  [/gemini-3\.5-flash/, { in: 1.5, out: 9 }],
  // 3.8 and 3.6 Flash: $0.75 / $3.75 through 2026-12-31, then $1.50 / $7.50 from 2027-01-01, as Google's page lists them
  [/gemini-3\.[86]-flash/, { in: 0.75, out: 3.75, next: { at: "2027-01-01", price: { in: 1.5, out: 7.5 } } }],
  [/gpt-oss-120b/, { in: 0.35, out: 0.75 }],   // Cerebras list price; Groq and OpenRouter are lower (0.15 / 0.60)
  [/gemini-3\.7-flash/, { in: 0.75, out: 3.75 }],
  [/gemini-3-flash|gemini-flash-latest/, { in: 0.5, out: 3 }],
  [/gemini-3\.1-pro/, { in: 2, out: 12, longAt: 200_000, long: { in: 4, out: 18 } }],
  [/flash-lite/, { in: 0.3, out: 2.5 }],
  [/flash/, { in: 1.5, out: 9 }],
  [/gemini/, { in: 2.5, out: 15 }],
  // Meta Muse Spark (Meta Model API pay-as-you-go, dev.meta.ai; the same on OpenRouter)
  [/muse-spark/, { in: 1.25, out: 4.25 }],
  // OpenAI
  [/gpt-5-nano/, { in: 0.05, out: 0.4 }],
  [/gpt-5-mini|gpt-5\.[0-9]+-mini|-mini/, { in: 0.25, out: 2 }],
  [/gpt-5\.2/, { in: 1.75, out: 14 }],
  [/gpt-5\.4/, { in: 2.5, out: 15, longAt: 272_000, long: { in: 5, out: 22.5 } }],
  [/gpt-5\.6/, { in: 4, out: 20 }],
  [/gpt-5(?![.\d])/, { in: 1.25, out: 10 }],
  [/gpt/, { in: 5, out: 30 }],
];
const UNKNOWN: Price = { in: 10, out: 50 };
export const SEARCH_USD = 0.01;

export type Usage = {
  input_tokens?: number; output_tokens?: number;
  cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

/** One call's price: the model's row as of the call's date (a published change applies from its day), at the long-prompt
 *  rate when the prompt is past it. `at` defaults to now. */
export function priceOf(model: string, inputTokens = 0, at: Date = new Date()): Price {
  const m = model.toLowerCase();
  let p = PRICES.find(([re]) => re.test(m))?.[1] ?? UNKNOWN;
  if (p.next && at.toISOString().slice(0, 10) >= p.next.at) p = p.next.price;
  return p.long && p.longAt && inputTokens > p.longAt ? p.long : { in: p.in, out: p.out };
}

/** True when the price table has a row for this model (not the unknown-model price). */
export const priced = (model: string) => PRICES.some(([re]) => re.test(model.toLowerCase()));

/** The dollars a call cost. model is "provider:model" or a bare model id. */
export function costOf(model: string, u: Usage | undefined, at: Date = new Date()): number {
  if (!u) return 0;
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const p = priceOf(model, n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens), at);
  // cached input at the vendor's own cached rate (cache_rates.ts): Anthropic reads 0.1x and writes 1.25x, Gemini 2.5 reads 0.25x
  const r = cacheRates(model);
  const usd = (n(u.input_tokens) * p.in + n(u.cache_creation_input_tokens) * p.in * r.write + n(u.cache_read_input_tokens) * p.in * r.read + n(u.output_tokens) * p.out) / 1e6
    + n(u.server_tool_use?.web_search_requests) * SEARCH_USD;
  return Math.round(usd * 1e6) / 1e6;
}
