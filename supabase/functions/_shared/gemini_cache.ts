// Gemini context caching, explicit. Gemini 2.5 and later already cache a repeated prompt prefix by themselves (implicit
// caching), which the cache-ordered prompt (src/odeliaMemory/cache.ts) makes hit. Explicit caching goes further: the
// stable prefix (Odelia's rules, the workspace profile, the tool schemas) is stored once as a cachedContents resource
// for an hour and every call in that hour refers to it by name, at the cached rate, guaranteed.
//
// On only with GEMINI_CONTEXT_CACHE=1. A cache must hold the system instruction and the tools itself (Gemini refuses a
// request that sets either beside a cache), so the call's per-run part of the system prompt moves into a first user
// message. Any failure to create or use a cache falls back to the ordinary call.

type Block = Record<string, unknown>;
type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

const API = "https://generativelanguage.googleapis.com/v1beta";
/** Below this many characters (about 4,096 tokens, the largest minimum among Gemini models) a cache isn't allowed or worth it. */
export const MIN_CACHE_CHARS = 16_000;
const TTL_S = 3600;

/** Names of live caches, by the prefix's fingerprint and the model. Per instance: a fresh one makes its own. */
const live = new Map<string, { name: string; expires: number }>();

export const explicitOn = (env: Env) => env("GEMINI_CONTEXT_CACHE") === "1";

/** FNV-1a over the stable prefix and the tools: the cache's key. */
function key(model: string, prefix: string, tools: unknown): string {
  let h = 0x811c9dc5;
  const s = `${model}\n${prefix}\n${JSON.stringify(tools ?? [])}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${model}:${(h >>> 0).toString(16)}:${s.length}`;
}

/** The stable prefix of a call (up to its last cache break), or null when the call has none worth caching. */
export function stablePart(payload: Record<string, unknown>): { prefix: string; rest: string } | null {
  const system = typeof payload.system === "string" ? payload.system : "";
  const breaks = (Array.isArray(payload.cache_breaks) ? payload.cache_breaks as number[] : []).filter((b) => Number.isInteger(b) && b > 0 && b <= system.length);
  if (!breaks.length) return null;
  const at = Math.max(...breaks);
  if (at < MIN_CACHE_CHARS) return null;
  return { prefix: system.slice(0, at), rest: system.slice(at) };
}

/** The cachedContents body for a prefix and the call's tools (in Gemini's own format). */
export function cacheBody(model: string, prefix: string, tools: Block[]): Record<string, unknown> {
  const decls = tools.filter((t) => !("type" in t)).map((t) => ({ name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } }));
  return { model: `models/${model}`, systemInstruction: { parts: [{ text: prefix }] }, ...(decls.length ? { tools: [{ functionDeclarations: decls }] } : {}), ttl: `${TTL_S}s` };
}

/** The cache for this prefix: an existing one, or a new one made now. Null when it can't be made. */
export async function ensureCache(env: Env, model: string, payload: Record<string, unknown>, f: Fetch = fetch, now = Date.now()): Promise<{ name: string; rest: string } | null> {
  const part = stablePart(payload), keyApi = env("GEMINI_API_KEY");
  if (!part || !keyApi) return null;
  const tools = (Array.isArray(payload.tools) ? payload.tools : []) as Block[];
  const k = key(model, part.prefix, tools);
  const have = live.get(k);
  if (have && have.expires > now + 60_000) return { name: have.name, rest: part.rest };
  try {
    const res = await f(`${API}/cachedContents`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": keyApi }, body: JSON.stringify(cacheBody(model, part.prefix, tools)) });
    if (!res.ok) { console.error("gemini cache", res.status, (await res.text()).slice(0, 160)); return null; }
    const j = await res.json() as { name?: string };
    if (!j.name) return null;
    live.set(k, { name: j.name, expires: now + TTL_S * 1000 });
    return { name: j.name, rest: part.rest };
  } catch (e) { console.error("gemini cache", String(e).slice(0, 160)); return null; }
}

/** An OpenAI-format body that uses the cache: no system message and no tools of its own (both are in the cache); the
 *  per-run part of the system prompt goes first in the conversation. */
export function useCache(body: Record<string, unknown>, cache: { name: string; rest: string }): Record<string, unknown> {
  const msgs = ((body.messages as Block[]) ?? []).filter((m) => m.role !== "system");
  const lead = cache.rest.trim() ? [{ role: "user", content: `Context for this request:\n${cache.rest.trim()}` }] : [];
  // two user turns in a row are fine for Gemini; the first is the context, the second the conversation
  const out: Record<string, unknown> = { ...body, messages: [...lead, ...msgs], extra_body: { google: { cached_content: cache.name } } };
  delete out.tools;
  return out;
}

export const __forTests = { live };
