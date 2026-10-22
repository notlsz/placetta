// No secret of the server's own goes to a model vendor. Every model call's request body has the exact values of the
// function's secrets (any env var named like a key, secret, token or password, 8 characters or more) cut out before it
// leaves, whatever put them there: a tool result, a pasted log, a prompt. Used by agent-run's model call; the agent's
// own prompt scrubbing is src/security/secrets.ts, which re-exports these.

/** Env names whose values are secrets. */
export const SECRET_ENV = /(KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|SIGNING|WEBHOOK)/i;

/** The secret values among these env vars (8 characters or more, so "1" or "on" is never one), longest first. */
export function secretValues(env: Record<string, string | undefined>): string[] {
  return Object.entries(env).filter(([k, v]) => SECRET_ENV.test(k) && typeof v === "string" && v.length >= 8).map(([, v]) => v!).sort((a, b) => b.length - a.length);
}

/** A request body with every one of these secret values cut out, and how many were. */
export function withoutEnv<T>(body: T, secrets: string[]): { body: T; cut: number } {
  if (!secrets.length) return { body, cut: 0 };
  let s = JSON.stringify(body), cut = 0;
  for (const v of secrets) {
    const enc = JSON.stringify(v).slice(1, -1);
    if (!enc || !s.includes(enc)) continue;
    cut += s.split(enc).length - 1;
    s = s.split(enc).join("[hidden]");
  }
  return { body: cut ? JSON.parse(s) as T : body, cut };
}
