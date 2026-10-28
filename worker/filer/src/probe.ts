// The nightly re-check of the playbooks against the agencies' public pages, and the tool that reads a public page for
// someone writing a playbook. Copied from the way Browserbase/Stagehand keep a cached action honest (replay, and check
// it still matches before trusting it) and from Skyvern's "read the page, not the guide": every playbook names the
// public pages it was written against and the words seen on them (Probe), on the day they were seen. Each night the
// worker opens those pages in a fresh, locked-down browser (sandbox.ts: only the page's own host) and checks the words
// are still there. A word that's gone is drift: it goes to the Quality tab's queue (filer_probe_report ->
// qa_report) before a customer's filing runs into it.
//
// Only public pages: nothing here signs in, fills, clicks or submits, and it never creates an account. A page behind a
// sign-in is never probed; the steps past it are checked by the runs themselves (heal.ts drift, the two-key review).
//
//   node --experimental-strip-types src/probe.ts <url>     print what the worker reads on a public page (writing a playbook)
//   node --experimental-strip-types src/probe.ts --all     check every playbook's public pages now, print the drift
import { chromium, type Browser } from "playwright-core";
import type { PageState } from "./guards.ts";
import { pageState } from "./page.ts";
import { PLAYBOOKS, type Playbook } from "./playbooks.ts";
import { harden } from "./sandbox.ts";

/** A public page a playbook was written against: its address, the words a person sees on it (a heading, a link, a
 *  button, a line of text) and the day they were seen there. */
export type Probe = { url: string; expect: string[]; seen: string };
export type Drift = { host: string; name: string; url: string; missing: string[]; error?: string };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Everything a person reads on the page, for matching words: headings, buttons, links, labels, then the text. */
export const wordsOn = (s: PageState) => norm([s.title, ...s.headings, ...s.buttons.map((b) => b.text), ...s.links.map((l) => l.text), ...s.controls.map((c) => c.label), s.text].join("\n"));

/** The expected words the page no longer shows. Empty when it still matches. */
export function missingWords(p: Probe, s: PageState): string[] {
  const on = wordsOn(s);
  return p.expect.filter((w) => w.trim() && !on.includes(norm(w)));
}

/** Every public page the playbooks name, once each. */
export function probesOf(list: Playbook[] = PLAYBOOKS): { pb: Playbook; probe: Probe }[] {
  const seen = new Set<string>();
  const out: { pb: Playbook; probe: Probe }[] = [];
  for (const pb of list) for (const probe of pb.probes ?? []) {
    if (seen.has(probe.url)) continue;
    seen.add(probe.url);
    out.push({ pb, probe });
  }
  return out;
}

/** Hosts a probe's page may load in its frames: the page's own host and the playbook's. */
const hostsFor = (pb: Playbook, url: string) => { const h = new URL(url).hostname; return [...new Set([h, pb.host, ...(pb.probeHosts ?? [])])]; };

export type Launch = () => Promise<Browser>;
/** Local Chromium, through the machine's proxy when it has one. */
export const launchLocal: Launch = () => chromium.launch({
  headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
  ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1,::1" } } : {}),
});

/** Open one public page in its own empty, locked-down context and read it. */
export async function readPublic(browser: Browser, url: string, hosts: string[], settleMs = 2500): Promise<PageState> {
  const ctx = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
  try {
    const page = await ctx.newPage();
    await harden(page, hosts, () => undefined);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // single-page apps (GenTax, Salesforce, Angular) draw after the document loads
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(settleMs);
    return await pageState(page);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Check every playbook's public pages. A page that won't open counts as drift too (it may have moved). */
export async function checkAll(launch: Launch = launchLocal, list: Playbook[] = PLAYBOOKS): Promise<Drift[]> {
  const browser = await launch();
  const out: Drift[] = [];
  try {
    for (const { pb, probe } of probesOf(list)) {
      try {
        const st = await readPublic(browser, probe.url, hostsFor(pb, probe.url));
        const missing = missingWords(probe, st);
        if (missing.length) out.push({ host: pb.host, name: pb.name, url: probe.url, missing });
      } catch (e) {
        out.push({ host: pb.host, name: pb.name, url: probe.url, missing: probe.expect, error: e instanceof Error ? e.message.slice(0, 200) : "error" });
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return out;
}

/** The Quality tab's findings for drift (supabase/migrations/20261025100000_quality.sql qa_report's shape). */
export const findingsOf = (drift: Drift[]) => drift.map((d) => ({
  kind: "drift", severity: d.error ? "high" : "medium", source: d.url,
  subject: `Playbook ${d.name}: the public page changed`.slice(0, 300),
  repro: (d.error ? `The page didn't open (${d.error}).` : `These words the playbook was written against are gone: ${d.missing.join("; ")}.`).slice(0, 4000),
  fix: "Open the page, update the playbook's steps and probes in worker/filer/src/playbooks.ts (or record it again with Show Odelia how), and run the replay tests.",
}));

/** Has the nightly check run today (UTC), and is it its hour? */
export const probeDue = (now: Date, last: string | null, hour: number) => now.getUTCHours() >= hour && last !== now.toISOString().slice(0, 10);

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] ?? "--all";
  if (arg === "--all") {
    const drift = await checkAll();
    console.log(drift.length ? JSON.stringify(drift, null, 2) : `every playbook's public pages match (${probesOf().length} pages)`);
    process.exit(drift.length ? 1 : 0);
  }
  const browser = await launchLocal();
  if (arg === "--many") {
    // a short summary of several public pages, side by side
    await Promise.all(process.argv.slice(3).map(async (u) => {
      try {
        const st = await readPublic(browser, u, [new URL(u).hostname]);
        console.log([`=== ${u} -> ${st.url} | ${st.title}`, `H: ${st.headings.join(" / ")}`, `B: ${st.buttons.map((b) => b.text).join(" / ")}`,
          `L: ${st.links.slice(0, 40).map((l) => l.text).join(" / ")}`, `C: ${st.controls.map((c) => `${c.type} ${c.selector}`).join(" / ")}`,
          `F: ${st.frames.join(" ")} ${st.markers.join(" ")}`, `T: ${st.text.replace(/\n+/g, " ¶ ").slice(0, 1200)}`].join("\n"));
      } catch (e) { console.log(`=== ${u} ERROR ${e instanceof Error ? e.message.slice(0, 200) : e}`); }
    }));
    await browser.close();
    process.exit(0);
  }
  try {
    const st = await readPublic(browser, arg, [new URL(arg).hostname, ...process.argv.slice(3)]);
    console.log(JSON.stringify({ url: st.url, title: st.title, headings: st.headings, buttons: st.buttons.map((b) => b.text), links: st.links.map((l) => `${l.text} -> ${l.href}`),
      controls: st.controls.map((c) => `${c.type} ${c.selector}${c.options ? ` [${c.options.slice(0, 12).join(" | ")}]` : ""}`), frames: st.frames, markers: st.markers, text: st.text.slice(0, 2500) }, null, 2));
  } finally { await browser.close(); }
}
