import { idNumber, injected, redact, secretNumber, SENSITIVE } from "../guard";

/* What memory never keeps, as plain checks with no model in them, so they hold whatever a model does. Placetta's
   privacy policy: no Social Security number or ITIN is ever stored, no card numbers, no saved passwords, and content is
   never used for anything but the service. Memory adds: no ID numbers of any kind, no credentials, no health, religion,
   politics or other sensitive topics, and a license number only as its last 4 digits when an owner allowed that. */

export type Blocked = "secret" | "id_number" | "credential" | "sensitive" | "instruction" | "empty";

const CREDENTIAL = /\b(password|passcode|passwd|pass ?phrase|pin( code| number)?|login|username|user ?name|security (question|answer)|one-time code|2fa code|verification code|api[ _-]?key|token|secret)\b|密码|口令|验证码|用户名|登录名/i;
/** "license ending 4821", "permit ••••4821", "last 4: 4821". */
const LAST4 = /(ending( in)?|last (4|four)( digits)?:?|•{2,}|\*{2,}|尾号)\s*(\d{4})\b/i;

/** Why a line can't be kept in memory, or null when it can. */
export function blocked(text: string, o: { allowLast4?: boolean; untrusted?: boolean } = {}): Blocked | null {
  const t = String(text ?? "").trim();
  if (!t) return "empty";
  if (redact(t) !== t || secretNumber("", t)) return "secret";
  if (CREDENTIAL.test(t)) return "credential";
  if (SENSITIVE.test(t)) return "sensitive";
  // instructions hidden in data: never a memory, from anywhere (a person who wants a rule says it in the app)
  if (injected(t)) return "instruction";
  if (o.untrusted && /\b(ignore|disregard|you (must|should) (now )?(always|never)|from now on|new instructions?|system prompt|odelia,? (always|never|must))\b|忽略|从现在起|新的指令/i.test(t)) return "instruction";
  // a license number only as its last 4, and only when allowed; any other ID number never
  const masked = t.replace(LAST4, " ");
  if (LAST4.test(t) && !o.allowLast4) return "id_number";
  if (idNumber(masked)) return "id_number";
  return null;
}

/** The last 4 digits of a license or permit number, written the one way memory keeps it ("ending 4821"), or null. */
export function lastFour(num: string): string | null {
  const d = String(num ?? "").replace(/\D/g, "");
  return d.length >= 4 ? `ending ${d.slice(-4)}` : null;
}
