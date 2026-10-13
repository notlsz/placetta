// What one model call cost, from the usage the provider returns. Dollars per million tokens, Anthropic's list prices
// (checked 2026-10-12); cache writes are 1.25x input, cache reads 0.1x; web search is $10 per 1,000 searches.
// A model not listed here is priced like the most expensive one, so an unknown route can never look cheap.

type Price = { in: number; out: number };
const PRICES: [RegExp, Price][] = [
  [/fable/, { in: 10, out: 50 }],
  [/opus-5-5/, { in: 4, out: 20 }],
  [/opus/, { in: 5, out: 25 }],
  [/sonnet/, { in: 2, out: 10 }],
  [/haiku/, { in: 1, out: 5 }],
  [/deepseek/, { in: 0.6, out: 2.5 }],
  [/gemini-2\.5-flash|flash/, { in: 0.5, out: 3 }],
  [/gemini/, { in: 2.5, out: 15 }],
  [/gpt-5\.[0-9]+-mini|mini/, { in: 0.5, out: 4 }],
  [/gpt/, { in: 5, out: 30 }],
];
const UNKNOWN: Price = { in: 10, out: 50 };
export const SEARCH_USD = 0.01;

export type Usage = {
  input_tokens?: number; output_tokens?: number;
  cache_creation_input_tokens?: number; cache_read_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number };
};

export function priceOf(model: string): Price {
  const m = model.toLowerCase();
  return PRICES.find(([re]) => re.test(m))?.[1] ?? UNKNOWN;
}

/** The dollars a call cost. model is "provider:model" or a bare model id. */
export function costOf(model: string, u: Usage | undefined): number {
  if (!u) return 0;
  const p = priceOf(model), n = (v: unknown) => (typeof v === "number" && v > 0 ? v : 0);
  const usd = (n(u.input_tokens) * p.in + n(u.cache_creation_input_tokens) * p.in * 1.25 + n(u.cache_read_input_tokens) * p.in * 0.1 + n(u.output_tokens) * p.out) / 1e6
    + n(u.server_tool_use?.web_search_requests) * SEARCH_USD;
  return Math.round(usd * 1e6) / 1e6;
}
