// Entry point: node --experimental-strip-types src/main.ts
// Hosted browser (Browserbase) when BROWSERBASE_API_KEY is set, local Chromium otherwise (CHROMIUM_PATH for a custom binary).
import { chromium } from "playwright-core";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { AnthropicLabeler, AnthropicModel } from "./model.ts";
import { playbookFor } from "./playbooks.ts";
import { type Route, Worker, type Session } from "./run.ts";
import { dbKey, SupabaseStore } from "./store.ts";
import { assertNotRoot } from "./sandbox.ts";
import { KeyLock } from "./heal.ts";

/** The destination's tenant path, other hosts and start page, from destinations.ts like its host. */
export const routeOf = (id: string): Route | null => {
  const d = DEST[id];
  return d?.portal ? { tenant: d.tenant, alsoOn: d.alsoOn, start: d.portalUrl } : null;
};

/** A new browser session for one run, never reused: a new Browserbase session (no saved Browserbase context, so it
 *  starts empty), or a new local Chromium process with a new, empty browser context (Playwright gives it a throwaway
 *  profile folder and deletes it on close). The worker checks it's empty (assertFresh) and closes it when the run ends. */
export async function openBrowser(): Promise<Session> {
  const key = process.env.BROWSERBASE_API_KEY, project = process.env.BROWSERBASE_PROJECT_ID;
  if (key && project) {
    const res = await fetch("https://api.browserbase.com/v1/sessions", { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project, keepAlive: true }) });
    if (!res.ok) throw new Error(`browserbase ${res.status}`);
    const s = await res.json() as { id: string; connectUrl: string };
    const browser = await chromium.connectOverCDP(s.connectUrl);
    const page = browser.contexts()[0]?.pages()[0] ?? await (browser.contexts()[0] ?? await browser.newContext()).newPage();
    const live = await fetch(`https://api.browserbase.com/v1/sessions/${s.id}/debug`, { headers: { "X-BB-API-Key": key } }).then((r) => r.json()).catch(() => ({})) as { debuggerFullscreenUrl?: string };
    return { browser, page, liveUrl: live.debuggerFullscreenUrl?.startsWith("https://") ? live.debuggerFullscreenUrl : null,
      close: async () => { await browser.close(); await fetch(`https://api.browserbase.com/v1/sessions/${s.id}`, { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project, status: "REQUEST_RELEASE" }) }).catch(() => undefined); } };
  }
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: process.env.CHROMIUM_PATH ? ["--no-sandbox"] : [] });
  // no downloads, no service workers: the run's own throwaway context (sandbox.ts locks the rest down)
  const page = await (await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" })).newPage();
  return { browser, page, liveUrl: null, close: () => browser.close() };
}

export const settings = () => ({
  dryRun: process.env.FILER_DRY_RUN === "1", twoKey: Number(process.env.FILER_TWO_KEY ?? "10"),
  maxSteps: 80, maxMs: 15 * 60_000, holdMs: 20 * 60_000, pollMs: 5000,
  // "Show Odelia how": the person has 30 minutes to file while Odelia watches (the run's limit is maxMs + holdMs + 5)
  teachMs: 30 * 60_000,
  // Off unless staff turn it on to watch a playbook's first run on the live site.
  allowUnverified: process.env.FILER_ALLOW_UNVERIFIED === "1",
});

/** How many filings run side by side in this container (FILER_CONCURRENCY, 1 to 4, default 1). Each slot has its own
 *  store (its own run token) and opens its own browser per run; the slots share one lock so a workspace's runs on the
 *  same portal still go one at a time (heal.ts KeyLock). */
export const slots = (env: Record<string, string | undefined>) => Math.min(4, Math.max(1, Math.floor(Number(env.FILER_CONCURRENCY ?? "1")) || 1));

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.FILER_ENABLED !== "1") { console.log("FILER_ENABLED is not 1; the portal worker is off."); process.exit(0); }
  assertNotRoot();
  const lock = new KeyLock();
  const loop = async () => {
    const store = new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env));
    const w = new Worker({ store, model: new AnthropicModel(process.env.ANTHROPIC_API_KEY!), open: openBrowser, portalOf: (id) => DEST[id]?.portal ?? null,
      routeOf, playbookOf: playbookFor, lock, labeler: new AnthropicLabeler(process.env.ANTHROPIC_API_KEY!).label, ...settings() });
    for (;;) {
      try { if (!(await w.once())) await new Promise((r) => setTimeout(r, 5000)); }
      catch (e) { console.error("worker:", e instanceof Error ? e.message : e); await new Promise((r) => setTimeout(r, 5000)); }
    }
  };
  await Promise.all(Array.from({ length: slots(process.env) }, loop));
}
