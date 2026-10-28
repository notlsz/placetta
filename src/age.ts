// Who may use Placetta: people 18 or older (COPPA, and the state laws that treat minors specially). Asked at sign-up
// and at the next sign-in of anyone who hasn't answered, as OpenAI and xAI's Grok ask for a birth date at sign-up;
// Instinct, the closest product to Odelia, is 18+ like Placetta.
//
// The person's own date is checked here first, in their own calendar. Only an adult's date is sent, and the server
// checks it again (confirm_age, 20261105090600_privacy_recording_age.sql) and keeps only that they confirmed, and when.
// Under 18 the date is never sent: the app asks the server to delete the account made at sign-in (age_refused), so
// nothing of a minor is kept, and under 13 nothing at all leaves the device. Tests: scripts/agent-test.ts.

export type AgeVerdict = "adult" | "minor" | "child" | "invalid";

/** "YYYY-MM-DD" from a date input, or null when it isn't a real calendar date. */
export function parseBirthdate(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > days) return null;
  return { y, m: mo, d };
}

/** Whole years from a birth date to today, in the person's own calendar (a birthday today counts). */
export function ageOn(birth: { y: number; m: number; d: number }, today: { y: number; m: number; d: number }): number {
  let a = today.y - birth.y;
  if (today.m < birth.m || (today.m === birth.m && today.d < birth.d)) a--;
  return a;
}

/** The person's local date. */
export const localToday = (now = new Date()) => ({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });

/** adult 18+, minor 13 to 17, child under 13; invalid for a date that isn't one, is in the future or before 1900. */
export function ageVerdict(s: string, today = localToday()): AgeVerdict {
  const b = parseBirthdate(s);
  if (!b || b.y < 1900) return "invalid";
  if (b.y > today.y || (b.y === today.y && (b.m > today.m || (b.m === today.m && b.d > today.d)))) return "invalid";
  const a = ageOn(b, today);
  return a >= 18 ? "adult" : a >= 13 ? "minor" : "child";
}
