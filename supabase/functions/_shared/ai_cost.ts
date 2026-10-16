// What one model call cost, from the usage the provider returns. Dollars per million tokens, at each vendor's list
// price (checked 2026-10-16 against third-party price trackers that mirror the vendors' pages; see docs/AI_COSTS.md).
// Where a vendor charges more for long prompts (Gemini Pro past 200k tokens, GPT-5.4 past 272k), the dearer rate
// applies to the whole call, as the vendors bill it. Anthropic's cache writes are 1.25x input, cache reads 0.1x;
// web search is $10 per 1,000 searches. Where two sources disagreed, the higher price is used.
// A model not listed here is priced like the most expensive one, so an unknown route can never look cheap.
// The first matching pattern wins, so the specific ones come before the family names.

type Price = { in: number; out: number; /** the rate past `longAt` input tokens, when the vendor has one */ long?: Price; longAt?: number };
const PRICES: [RegExp, Price][] = [
  // Anthropic
  [/fable|mythos/, { in: 10, out: 50 }],
  [/opus-5-5/, { in: 4, out: 20 }],
  [/opus-4-1/, { in: 15, out: 75 }],
  [/opus/, { in: 5, out: 25 }],                       // Opus 4.5, 4.6, 5
  [/sonnet-4/, { in: 3, out: 15 }],                   // Sonnet 4, 4.5, 4.6
  [/sonnet/, { in: 2, out: 10 }],                     // Sonnet 5, 5.5
  [/haiku-3/, { in: 0.8, out: 4 }],
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
  [/gemini-3\.[67]-flash/, { in: 0.75, out: 3.75 }],
  [/gemini-3-flash|gemini-flash-latest/, { in: 0.5, out: 3 }],
  [/gemini-3\.1-pro/, { in: 2, out: 12, longAt: 200_000, long: { in: 4, out: 18 } }],
  [/flash-lite/, { in: 0.3, out: 2.5 }],
  [/flash/, { in: 1.5, out: 9 }],
  [/gemini/, { in: 2.5, out: 15 }],
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

export function priceOf(model: string, inputTokens = 0): Price {
  const m = model.toLowerCase();
  const p = PRICES.find(([re]) => re.test(m))?.[1] ?? UNKNOWN;
  return p.long && p.longAt && inputTokens > p.longAt ? p.long : p;
}

/** True when the price table has a row for this model (not the unknown-model price). */
export const priced = (model: string) => PRICES.some(([re]) => re.test(model.toLowerCase()));

/** The dollars a call cost. model is "provider:model" or a bare model id. */
export function costOf(model: string, u: Usage | undefined): number {
  if (!u) return 0;
  const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const p = priceOf(model, n(u.input_tokens) + n(u.cache_creation_input_tokens) + n(u.cache_read_input_tokens));
  const usd = (n(u.input_tokens) * p.in + n(u.cache_creation_input_tokens) * p.in * 1.25 + n(u.cache_read_input_tokens) * p.in * 0.1 + n(u.output_tokens) * p.out) / 1e6
    + n(u.server_tool_use?.web_search_requests) * SEARCH_USD;
  return Math.round(usd * 1e6) / 1e6;
}
