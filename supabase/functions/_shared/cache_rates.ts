// What a provider charges for an input token served from its prompt cache, and for one written to it, as a share of a
// fresh input token. Used to price calls (ai_cost.ts costOf) and to report what caching saved (src/odeliaMemory/cache.ts).
//   Anthropic  reads 10%, writes 125% (five-minute cache)
//   Gemini     2.0 and 2.5 models 25%, 3 and later 10% (implicit and explicit caching; explicit storage is billed apart)
//   OpenAI     GPT-5 family 10%, GPT-4.1 and o-series 25%, GPT-4o 50%; writes cost nothing extra
export function cacheRates(model: string): { read: number; write: number } {
  const m = String(model ?? "").toLowerCase();
  if (m.startsWith("anthropic:") || m.includes("claude")) return { read: 0.1, write: 1.25 };
  if (/gemini-2\.(0|5)/.test(m)) return { read: 0.25, write: 1 };
  if (m.includes("gemini")) return { read: 0.1, write: 1 };
  if (/gpt-4o/.test(m)) return { read: 0.5, write: 1 };
  if (/gpt-4\.1|(^|[:/])o[34]/.test(m)) return { read: 0.25, write: 1 };
  return { read: 0.1, write: 1 };
}
