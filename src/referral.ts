/* Partner referrals in the browser: the first partner link someone arrives through is kept for 90 days (first touch),
   on this site's own storage, so the website (site/index.html keeps the same key) and the app agree. When the person
   creates a workspace, onboarding records it there (referral_claim, which checks the 90 days again) and asks, once,
   whether that partner may see the business's progress. The plan box on a partner's site (site/embed.js) also sends
   the line the person typed ("Milk tea in Flushing, NY"), which onboarding starts from. */

export const REF_KEY = "placetta-ref";
const LINE_KEY = "placetta-embed-line";
export const WINDOW_DAYS = 90;
const DAY = 864e5;
const CODE = /^[A-Z2-9]{8}$/;

export type Touch = { code: string; at: number };

/** The touch to keep: the earlier one while it's inside the window, otherwise the new code (if it's a code at all). */
export function firstTouch(prev: Touch | null, code: string | null | undefined, now: number): Touch | null {
  const live = prev && CODE.test(prev.code) && typeof prev.at === "number" && now - prev.at <= WINDOW_DAYS * DAY && prev.at <= now + 6e4 ? prev : null;
  if (live) return live;
  const c = (code ?? "").trim().toUpperCase();
  return CODE.test(c) ? { code: c, at: now } : null;
}

const read = <T,>(k: string): T | null => { try { return JSON.parse(localStorage.getItem(k) ?? "null") as T | null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/** The partner touch this browser holds, while it's inside the 90 days. */
export const readTouch = (now = Date.now()): Touch | null => firstTouch(read<Touch>(REF_KEY), null, now);

/** At start-up: keep a ?ref= code (first touch wins) and the plan box's ?line=, then tidy the address. */
export function captureRef(now = Date.now()) {
  try {
    const p = new URLSearchParams(location.search);
    const ref = p.get("ref"), line = p.get("line");
    if (!ref && !line) return;
    const t = firstTouch(read<Touch>(REF_KEY), ref, now);
    if (t) write(REF_KEY, t);
    if (line && line.trim()) write(LINE_KEY, { line: line.trim().slice(0, 140), at: now });
    p.delete("ref"); p.delete("line");
    const q = p.toString();
    history.replaceState(history.state, "", location.pathname + (q ? "?" + q : "") + location.hash);
  } catch { /* no history or storage: nothing kept */ }
}

/** The line from a partner's plan box, for onboarding, within 3 days. */
export function embedLine(now = Date.now()): string {
  const s = read<{ line: string; at: number }>(LINE_KEY);
  return s && typeof s.line === "string" && now - s.at <= 3 * DAY ? s.line : "";
}

/** Once a workspace exists, the touch and the line are used up. */
export function clearTouch() { write(REF_KEY, null); write(LINE_KEY, null); }
