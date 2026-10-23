// Where a portal filing stands against the agency's published guide: the worker logs the guide's pages when it starts
// (worker/filer/src/playbooks.ts pageOutline, on the "playbook" step), and each page it reaches is a "page" step. The
// filing card shows "Page 3 of 6: Work Location" and the list, the way Devin and Claude Code show the plan beside the
// live work. Pure: src/FilingLive.tsx and scripts/agent-test.ts use it.

export type Progress = { steps: { page: string; state: "done" | "now" | "next" }[]; done: number; of: number; now?: string };

/** The guide's pages, from the filing's log, or undefined when the run follows no guide (or an older worker ran it). */
export function outlineOf(log: { kind?: string; ref?: string }[] | null | undefined): string[] | undefined {
  const e = (log ?? []).find(x => x.kind === "playbook" && typeof x.ref === "string" && x.ref.startsWith("["));
  if (!e) return undefined;
  try {
    const v = JSON.parse(e.ref!);
    const pages = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 20) : [];
    return pages.length ? pages : undefined;
  } catch { return undefined; }
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'’]/g, "").replace(/[^a-z0-9一-鿿]+/g, " ").trim();
const same = (a: string, b: string) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

/** The guide's pages marked done, now or next from the page titles the run reached, in order. finished: the filing was
 *  submitted, so every page counts as done. Null without an outline. */
export function progressOf(outline: string[] | undefined, seen: string[], finished = false): Progress | null {
  if (!outline?.length) return null;
  let last = -1;
  for (const t of seen) {
    const i = outline.findIndex((p, k) => k > last - 1 && same(p, t));
    if (i >= 0 && i >= last) last = i;
  }
  const steps = outline.map((page, i) => ({ page, state: (finished || i < last ? "done" : i === last ? "now" : "next") as "done" | "now" | "next" }));
  const done = steps.filter(s => s.state === "done").length;
  return { steps, done, of: outline.length, ...(last >= 0 && !finished ? { now: outline[last] } : {}) };
}
