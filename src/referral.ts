/* Partner referrals in the browser: the partner links someone arrives through are kept for 90 days, on this site's own
   storage, so the website (site/ref.js keeps the same keys) and the app agree. When the person creates a workspace,
   onboarding records the first one that is a real, approved partner (referral_claim, which checks the 90 days again and
   keeps the first partner recorded) and asks, once, whether that partner may see the business's progress. A mistyped,
   lapsed or unapproved code never blocks a real one that came after it: first valid referral wins. The plan box on a
   partner's site (site/embed.js) also sends the line the person typed ("Milk tea in Flushing, NY"), which onboarding
   starts from.

   A status page's footer ("Get your store licensed.") carries the page's public ref (?st=), kept the same way, first
   touch for 90 days, and recorded against that page when the workspace is created (trust_signup_claim). */

export const REF_KEY = "placetta-ref";
export const ST_KEY = "placetta-st";
const LINE_KEY = "placetta-embed-line";
export const WINDOW_DAYS = 90;
const DAY = 864e5;
const CODE = /^[A-Z2-9]{8}$/;
const ST = /^[a-z2-9]{10}$/;
const MAX_TOUCHES = 5;

export type Touch = { code: string; at: number };
export type StatusTouch = { ref: string; at: number };

const liveAt = (at: unknown, now: number) => typeof at === "number" && now - at <= WINDOW_DAYS * DAY && at <= now + 6e4;

/** The touch to keep: the earlier one while it's inside the window, otherwise the new code (if it's a code at all). */
export function firstTouch(prev: Touch | null, code: string | null | undefined, now: number): Touch | null {
  const live = prev && CODE.test(prev.code) && liveAt(prev.at, now) ? prev : null;
  if (live) return live;
  const c = (code ?? "").trim().toUpperCase();
  return CODE.test(c) ? { code: c, at: now } : null;
}

/** Every partner code this browser came with inside the 90 days, oldest first, each once, at most five; a new code is
 *  added after them. What older versions kept (one touch) reads as a list of one. */
export function touchesWith(prev: unknown, code: string | null | undefined, now: number): Touch[] {
  const list = (Array.isArray(prev) ? prev : prev ? [prev] : []) as Touch[];
  const out: Touch[] = [];
  for (const t of [...list].sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0))) {
    if (t && typeof t.code === "string" && CODE.test(t.code) && liveAt(t.at, now) && !out.some(x => x.code === t.code)) out.push({ code: t.code, at: t.at });
  }
  const c = (code ?? "").trim().toUpperCase();
  if (CODE.test(c) && !out.some(x => x.code === c)) out.push({ code: c, at: now });
  return out.slice(0, MAX_TOUCHES);
}

/** The first touch whose code names an approved partner, asking in order. Null when none does. */
export async function firstValid<P>(touches: Touch[], lookup: (code: string) => Promise<P | null>): Promise<{ touch: Touch; partner: P } | null> {
  for (const t of touches) {
    const p = await lookup(t.code).catch(() => null);
    if (p) return { touch: t, partner: p };
  }
  return null;
}

/** A status page's ref: the earlier one while it's inside the window, otherwise the new one. */
export function statusTouch(prev: StatusTouch | null, ref: string | null | undefined, now: number): StatusTouch | null {
  if (prev && typeof prev.ref === "string" && ST.test(prev.ref) && liveAt(prev.at, now)) return prev;
  const r = (ref ?? "").trim().toLowerCase();
  return ST.test(r) ? { ref: r, at: now } : null;
}

const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? "null") as T | null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** The partner touches this browser holds, inside the 90 days, oldest first. */
export const readTouches = (now = Date.now()): Touch[] => touchesWith(read<unknown>(REF_KEY), null, now);
/** The oldest of them. */
export const readTouch = (now = Date.now()): Touch | null => readTouches(now)[0] ?? null;
/** A code typed at sign-up, kept like a link's. */
export function addCode(code: string, now = Date.now()): Touch[] {
  const t = touchesWith(read<unknown>(REF_KEY), code, now);
  write(REF_KEY, t.length ? t : null);
  return t;
}
/** The status page ref this browser holds, inside the 90 days. */
export const readStatusTouch = (now = Date.now()): StatusTouch | null => statusTouch(read<StatusTouch>(ST_KEY), null, now);

/** At start-up: keep a ?ref= code, a status page's ?st= and the plan box's ?line=, then tidy the address. */
export function captureRef(now = Date.now()) {
  try {
    const p = new URLSearchParams(location.search);
    const ref = p.get("ref"), st = p.get("st"), line = p.get("line");
    if (!ref && !st && !line) return;
    if (ref) { const t = touchesWith(read<unknown>(REF_KEY), ref, now); if (t.length) write(REF_KEY, t); }
    if (st) { const s = statusTouch(read<StatusTouch>(ST_KEY), st, now); if (s) write(ST_KEY, s); }
    if (line && line.trim()) write(LINE_KEY, { line: line.trim().slice(0, 140), at: now });
    p.delete("ref"); p.delete("st"); p.delete("line");
    const q = p.toString();
    history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
  } catch { /* no history or storage: nothing kept */ }
}

/** The line from a partner's plan box, for onboarding, within 3 days. */
export function embedLine(now = Date.now()): string {
  const s = read<{ line: string; at: number }>(LINE_KEY);
  return s && typeof s.line === "string" && now - s.at <= 3 * DAY ? s.line : "";
}

/** Once a workspace exists, the touches and the line are used up. */
export function clearTouch() { write(REF_KEY, null); write(ST_KEY, null); write(LINE_KEY, null); }
