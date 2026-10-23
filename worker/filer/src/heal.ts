// Self-healing selectors for a recorded skill, and the checks around a run's end.
//
// A replay used to stop at the first recorded selector the page no longer had, and the model drove the rest of the
// filing (a model call per step) while the skill counted a failure. Copied from Stagehand's and Browser Use's semantic
// fallback (find the element again by what it says, not where it was: docs.stagehand.dev "act" caching and self-heal,
// docs.browser-use.com), with the rule this worker keeps everywhere: only an unambiguous match is used. The label or
// button text is compared without case, spacing, a trailing colon or a required-field star; a control is matched only
// among controls of the same kind, a button only among buttons and links. Two candidates, or none: no guess, the model
// takes over as before. Every heal is written to the filing's log and goes to the team as selector drift, so the
// recorded skill is checked by a person before the portal drifts further. Pure.
import type { PageState } from "./guards.ts";
import type { Act } from "./types.ts";

const norm = (s: string) => s.toLowerCase().replace(/\(required\)|\*/g, " ").replace(/[:：]\s*$/, "").replace(/\s+/g, " ").trim().replace(/[:：]$/, "").trim();
/** The words a selector names, when it names any (label:, button:, link:); a CSS id or name has none. */
export const wordsOf = (selector: string) => /^(label|button|link):(.+)$/.exec(selector)?.[2] ?? "";

/** The page's one control (or button or link) that says what the recorded selector said, or null. */
export function heal(selector: string, st: PageState, action: Act["action"]): string | null {
  const want = norm(wordsOf(selector));
  if (!want) {
    // "#id" or [name="x"]: the same id or name in another case is still the same field
    const id = /^#(.+)$/.exec(selector)?.[1] ?? /^\[name="(.+)"\]$/.exec(selector)?.[1];
    if (!id) return null;
    const hits = st.controls.filter((c) => c.id.toLowerCase() === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase());
    return hits.length === 1 && hits[0].selector !== selector ? hits[0].selector : null;
  }
  if (action === "click") {
    const all = [...st.buttons.map((b) => ({ selector: b.selector, text: b.text })), ...st.links.map((l) => ({ selector: l.selector, text: l.text }))];
    const exact = all.filter((x) => norm(x.text) === want);
    if (exact.length === 1) return exact[0].selector !== selector ? exact[0].selector : null;
    return null;
  }
  const kind = (c: PageState["controls"][number]) => action === "upload" ? c.type === "file" : action === "select" ? c.tag === "select" : action === "check" ? c.type === "checkbox" || c.type === "radio" : c.tag !== "select" && !["checkbox", "radio", "file"].includes(c.type);
  const same = st.controls.filter(kind);
  const exact = same.filter((c) => norm(c.label) === want);
  if (exact.length === 1) return exact[0].selector !== selector ? exact[0].selector : null;
  if (exact.length > 1) return null;
  // the label grew or shrank around the same words ("Legal name" and "Legal name of the business"): one match only
  const near = same.filter((c) => { const l = norm(c.label); return l.length >= 3 && (l.startsWith(want) || want.startsWith(l)); });
  return near.length === 1 ? near[0].selector : null;
}

/** What the owner and the team see when a filing is submitted: each proof Placetta keeps, ticked or missing. */
export type ReceiptCheck = { confirmation_on_page: boolean; screenshot: boolean; pdf: boolean; receipt_page: boolean | null; at: string };
export function receiptCheck(o: { text: string; heading: string; confirmation: string; screenshot: string | null; pdf: string | null; receiptWords?: string[]; at?: string }): ReceiptCheck {
  return {
    confirmation_on_page: !!o.confirmation && o.text.includes(o.confirmation),
    screenshot: !!o.screenshot, pdf: !!o.pdf,
    receipt_page: o.receiptWords?.length ? o.receiptWords.some((w) => o.heading.toLowerCase().includes(w.toLowerCase()) || o.text.toLowerCase().includes(w.toLowerCase())) : null,
    at: o.at ?? new Date().toISOString(),
  };
}
export const receiptLine = (c: ReceiptCheck) => {
  const items: [boolean | null, string, string][] = [[c.confirmation_on_page, "confirmation number shown by the agency", "机构页面显示确认号"], [c.screenshot, "screenshot of the confirmation page", "确认页截图"],
    [c.pdf, "PDF of the confirmation page", "确认页 PDF"], [c.receipt_page, "the guide's receipt page reached", "到达指南所述的回执页"]];
  const shown = items.filter(([v]) => v !== null);
  return { en: `Receipt check: ${shown.map(([v, en]) => `${en} ${v ? "yes" : "missing"}`).join("; ")}.`, zh: `回执核对：${shown.map(([v, , zh]) => `${zh}${v ? "已保存" : "缺失"}`).join("；")}。` };
};

/** Errors that mean the agency's site is down or slow rather than that something about this filing is wrong. */
const DOWN = /net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|Timeout \d+ms exceeded|navigation timeout|\b50[234]\b|service unavailable|bad gateway|gateway time-?out|temporarily unavailable|maintenance/i;
export const portalDown = (msg: string) => DOWN.test(msg);
/** How long to wait before the next try when the portal is down, by the try that just failed: 2, 10, then 30 minutes. */
export const backoffMinutes = (attempts: number) => [2, 10, 30][Math.min(Math.max(attempts, 1), 3) - 1];

/** One run at a time per workspace and portal: two runs with one saved login sign each other out. Runs on other
 *  portals, or for other workspaces, go side by side. */
export class KeyLock {
  private tails = new Map<string, Promise<void>>();
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => { release = r; });
    const tail = prev.then(() => mine);
    this.tails.set(key, tail);
    await prev;
    try { return await fn(); }
    finally { release(); if (this.tails.get(key) === tail) this.tails.delete(key); }
  }
  busy(key: string) { return this.tails.has(key); }
}
