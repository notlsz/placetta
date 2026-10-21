// Zero data retention (ZDR): with AI_ZDR_REQUIRED=1, customer data goes only to AI providers and modes listed in
// AI_ZDR_PROVIDERS, and every other call is refused. The list is the founder's record of which providers have confirmed
// zero retention in writing for Placetta's account (docs/ENTERPRISE.md); this code can't check a provider's settings,
// so it enforces the list, nothing more. Off (AI_ZDR_REQUIRED unset) everything behaves as before.
//
// AI_ZDR_PROVIDERS, comma separated:
//   anthropic, gemini, openai, groq, cerebras, openrouter, deepseek    a model vendor, every model
//   anthropic:claude-sonnet-5-5                                       one model only
//   anthropic:web-tools                                               Anthropic's server-side web search and fetch
//   telnyx                                                            the phone assistant (odelia-voice)
//   azure_speech                                                      reading replies aloud (tts)
// Used by _shared/llm.ts (every agent model call), _shared/odelia.ts (voiceReady), tts, and the portal filer.

type Env = (k: string) => string | undefined;

export const zdrRequired = (env: Env): boolean => env("AI_ZDR_REQUIRED") === "1";

/** The allowlist, lowercased. */
export const zdrList = (env: Env): string[] =>
  (env("AI_ZDR_PROVIDERS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** May this provider (and, when given, this model) get customer data? Always yes while ZDR isn't required. Without a
 *  model, a provider counts when it or any one of its models is listed. */
export function zdrAllows(env: Env, provider: string, model?: string): boolean {
  if (!zdrRequired(env)) return true;
  const p = provider.toLowerCase(), list = zdrList(env);
  if (list.includes(p)) return true;
  if (model === undefined) return list.some((x) => x.startsWith(p + ":") && x !== `${p}:web-tools`);
  return list.includes(`${p}:${model.toLowerCase()}`);
}

/** Anthropic's server-side web tools (search, fetch) send the query and pages through Anthropic's tool servers. */
export const zdrWebTools = (env: Env): boolean => !zdrRequired(env) || zdrList(env).includes("anthropic:web-tools");

export const ZDR_REFUSED = "Zero data retention is required (AI_ZDR_REQUIRED=1) and no provider for this call is on AI_ZDR_PROVIDERS.";
