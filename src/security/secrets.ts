import { redact } from "../guard";

/* ------------------------------------------------------------------ *
 * Secrets never go into a prompt. Two layers:
 *
 *   scrubSecrets   every system prompt, tool result and piece of
 *                  untrusted content goes through it: API keys, bearer
 *                  tokens, JWTs, passwords written as "password: x",
 *                  card and bank numbers, SSNs (src/guard.ts redact),
 *                  plus private keys and connection strings.
 *   withoutEnv     on the server, the exact values of the function's own
 *                  secrets (any env var named like a key, secret, token
 *                  or password) are cut from the whole request body
 *                  before it leaves for a model vendor, whatever put them
 *                  there.
 * ------------------------------------------------------------------ */

const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const CONN = /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi;
const SB_KEY = /\bsb_(secret|publishable)_[A-Za-z0-9_-]{16,}\b/g;
const GENERIC = /\b(xox[abposr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]{20,}|scim_[0-9a-f]{8}_[0-9a-f]{32,}|KEY[0-9A-F]{20,}|pk_(live|test)_[A-Za-z0-9]{16,})\b/g;

export function scrubSecrets(text: string): string {
  return redact(String(text ?? "").replace(PRIVATE_KEY, "[hidden]").replace(CONN, (m) => m.replace(/:\/\/[^@]+@/, "://[hidden]@")).replace(SB_KEY, "[hidden]").replace(GENERIC, "[hidden]"));
}

const KEYS = /\b(sk-[A-Za-z0-9_-]{8,}|sk_(live|test)_[A-Za-z0-9]{8,}|rk_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{6,}|re_[A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}|Bearer\s+[A-Za-z0-9._-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/g;
const PASSWORD = /\b(password|passcode|passwd|api[ _-]?key|secret key|access token|refresh token|client secret)\b\s*[:=]\s*\S+/gi;
/** Credentials only (keys, tokens, private keys, connection strings, "password: x"), leaving a business's own numbers
 *  (its EIN, a confirmation number) alone: for the system prompt and tool results, which the work needs. */
export function scrubCredentials(text: string): string {
  return String(text ?? "").replace(PRIVATE_KEY, "[hidden]").replace(CONN, (m) => m.replace(/:\/\/[^@]+@/, "://[hidden]@")).replace(SB_KEY, "[hidden]").replace(GENERIC, "[hidden]")
    .replace(KEYS, "[hidden]").replace(PASSWORD, (m) => m.replace(/[:=]\s*\S+$/, ": [hidden]"));
}

/** Env names whose values are secrets. */
export const SECRET_ENV = /(KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CREDENTIAL|SIGNING|WEBHOOK)/i;

/** The secret values among these env vars (8 characters or more, so "1" or "on" is never one). */
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
