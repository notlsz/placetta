// What a provider charges for an input token served from its prompt cache, and for one written to it, as a share of a
// fresh input token. Used to price calls (ai_cost.ts costOf) and to report what caching saved (src/odeliaMemory/cache.ts).
//   Anthropic  reads 10% (5% on Opus 5.5 and Sonnet 5.5, 2.5% on Fable 5.1 and Mythos 5.1), writes 125% (five minutes)
//   Gemini     10% on every current model, 2.5 included (implicit and explicit caching; explicit storage is billed apart);
//              2.0 kept at 25%
//   OpenAI     GPT-5 family 10%, GPT-4.1 and o-series 25%, GPT-4o 50%; writes cost nothing extra
// Anthropic and Gemini read again from their own pricing pages on 2026-10-22 (docs/UNIT-ECONOMICS.md, Sources). Before
// that, Sonnet 5.5's cache reads were priced at twice their rate and Gemini 2.5's at two and a half times.
export function cacheRates(model: string): { read: number; write: number } {
  const m = String(model ?? "").toLowerCase();
  if (m.startsWith("anthropic:") || m.includes("claude")) {
    if (/(fable|mythos)-5-1/.test(m)) return { read: 0.025, write: 1.25 };
    if (/(opus|sonnet)-5[-.]5/.test(m)) return { read: 0.05, write: 1.25 };
    return { read: 0.1, write: 1.25 };
  }
  if (/gemini-2\.0/.test(m)) return { read: 0.25, write: 1 };
  if (m.includes("gemini")) return { read: 0.1, write: 1 };
  if (/gpt-4o/.test(m)) return { read: 0.5, write: 1 };
  if (/gpt-4\.1|(^|[:/])o[34]/.test(m)) return { read: 0.25, write: 1 };
  return { read: 0.1, write: 1 };
}
