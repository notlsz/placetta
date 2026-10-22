/* The sweeper's judgment, pure: given a rule Placetta keeps (a form's proof quote and the page it was read from, a
   destination's source page, a published fee) and what that page says today, what's wrong, how bad, and whether a fix
   is safe to propose without a person. Copied from Vanta's continuous monitoring (each control is an automated test
   run on a schedule, failing tests carry remediation guidance, an owner and a due date: vanta.com/resources/
   help-center-articles-for-tests) and Stripe's degradation alerts (a dip alerts only when it holds, routed by urgency:
   stripe.com/blog/using-ml-to-detect-and-respond-to-performance-degradations-in-slices-of-stripe-payments): an
   unreachable page is never read as a changed rule, and a finding is opened once per kind and source.

   Safe to fix on its own, as a proposal a person merges: a fee whose new amount is the only fee-like amount on the
   form's own cited page. Everything else goes to staff with a repro and a proposed fix. Nothing here changes what a
   customer sees or files anything. */

export type Severity = "high" | "medium" | "low";
export type FindingKind = "drift" | "unreachable" | "stale" | "fee" | "grader" | "edge";
export type Finding = {
  kind: FindingKind; severity: Severity; source: string; subject: string;
  /** what happened and how to see it again */
  repro: string;
  /** what to change, for staff to approve */
  fix: string;
  /** a fix that is safe to propose as a code change on its own */
  safe?: { file: "registry"; form: string; field: "fee"; from: number | null; to: number; cite: string };
};
export type Proofed = { id: string; url: string; quote: string; checked: string; fee?: number | null };
export type Page = { status: number; text: string };

/** The words of a page as people read them: tags out, entities decoded, spaces and quotes made plain. */
export function pageWords(html: string): string {
  return String(html ?? "")
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&quot;|&#34;/g, "\"").replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&ldquo;|&rdquo;/g, "\"")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, "\"").replace(/[–—]/g, "-")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
const norm = (s: string) => pageWords(s).replace(/[.,;:]+$/, "");
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/** Dollar amounts within a few words of "fee", as the page prints them. */
export function feesOnPage(text: string): number[] {
  const t = pageWords(text), out = new Set<number>();
  for (const m of t.matchAll(/fee[^$.]{0,60}\$\s?([\d,]+(?:\.\d{2})?)|\$\s?([\d,]+(?:\.\d{2})?)[^$.]{0,40}fee/g)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0 && n < 100000) out.add(n);
  }
  return [...out];
}

/** One rule against its page today. null: it holds, and was read recently enough. */
export function sweepFinding(p: Proofed, page: Page, today: string, staleDays = 90): Finding | null {
  if (!(page.status >= 200 && page.status < 300) || !page.text.trim())
    return { kind: "unreachable", severity: "low", source: p.url, subject: p.id, repro: `GET ${p.url} answered ${page.status || "nothing"} on ${today}.`,
      fix: "Nothing changes: the page is re-read on the next sweep. Two sweeps in a row unreachable: check whether the agency moved the page." };
  const words = pageWords(page.text), quote = norm(p.quote);
  if (quote && !words.includes(quote)) {
    // a quote cut off mid-sentence still holds when its first two thirds are there
    const head = quote.slice(0, Math.max(30, Math.floor(quote.length * 2 / 3)));
    if (!words.includes(head)) return { kind: "drift", severity: "high", source: p.url, subject: p.id,
      repro: `The words Placetta quotes for ${p.id} ("${p.quote.slice(0, 120)}") are not on ${p.url} as read ${today}.`,
      fix: `Re-read ${p.url}: if the requirement changed, update ${p.id} in the registry (form, fee, time, lines) with a new quote and date; if the page only moved, point the proof at the new page.` };
  }
  if (p.fee != null && p.fee > 0) {
    const fees = feesOnPage(page.text);
    if (fees.length && !fees.includes(p.fee)) {
      const only = fees.length === 1 ? fees[0] : null;
      return { kind: "fee", severity: "medium", source: p.url, subject: p.id,
        repro: `${p.id}'s fee is $${p.fee} in the registry; ${p.url} shows ${fees.map(f => `$${f}`).join(", ")} near the word "fee" on ${today}.`,
        fix: only != null ? `Change ${p.id}'s fee from $${p.fee} to $${only}, citing ${p.url} read ${today}.` : `Read ${p.url} and set ${p.id}'s fee from it; it shows more than one amount.`,
        ...(only != null ? { safe: { file: "registry" as const, form: p.id, field: "fee" as const, from: p.fee, to: only, cite: `${p.url} (${today})` } } : {}) };
    }
  }
  if (daysBetween(p.checked, today) > staleDays)
    return { kind: "stale", severity: "low", source: p.url, subject: p.id, repro: `${p.id}'s proof was read ${p.checked}, ${daysBetween(p.checked, today)} days before ${today}; its words are still on the page.`,
      fix: `Update the date ${p.id}'s proof was read to ${today}.` };
  return null;
}

/** The registry's text with one form's fee changed, or null when the form or its old fee isn't found exactly once in its
 *  entry. The nightly sweep proposes it as a change for a person to merge; nothing deploys on its own. */
export function applySafeFee(source: string, form: string, from: number | null, to: number): string | null {
  const at = source.indexOf(`id: "${form}"`);
  if (at < 0 || source.indexOf(`id: "${form}"`, at + 1) >= 0) return null;
  const next = source.indexOf("\n  {", at + 1), end = next < 0 ? source.length : next;
  const entry = source.slice(at, end), want = `fee: ${from === null ? "null" : from},`;
  if (entry.split(want).length !== 2) return null;
  return source.slice(0, at) + entry.replace(want, `fee: ${to},`) + source.slice(end);
}
