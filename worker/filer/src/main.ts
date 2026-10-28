// Entry point: node --experimental-strip-types src/main.ts
// Local Chromium in the container by default (CHROMIUM_PATH for a custom binary). Browserbase is optional: with its two
// keys set, runs on the hosts whose bot protection refuses a cloud server's address (env.ts BLOCKS_DATACENTER, plus
// FILER_BROWSERBASE_HOSTS; "*" for every run) open there instead.
import { chromium } from "playwright-core";
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { checkEnv, missingLines, wantsHostedBrowser } from "./env.ts";
import { LiveViews } from "./live.ts";
import { AnthropicLabeler, AnthropicModel } from "./model.ts";
import { PLAYBOOKS, playbookFor } from "./playbooks.ts";
import { checkAll, findingsOf, probeDue, probesOf } from "./probe.ts";
import { type Route, Worker, type Session } from "./run.ts";
import { dbKey, SupabaseStore } from "./store.ts";
import { assertNotRoot } from "./sandbox.ts";
import { startServer, type Health } from "./server.ts";
import { KeyLock } from "./heal.ts";

/** The destination's tenant path, other hosts and start page, from destinations.ts like its host. */
export const routeOf = (id: string): Route | null => {
  const d = DEST[id];
  return d?.portal ? { tenant: d.tenant, alsoOn: d.alsoOn, start: d.portalUrl } : null;
};

/** A new browser session for one run, never reused: a new Browserbase session (no saved Browserbase context, so it
 *  starts empty), or a new local Chromium process with a new, empty browser context (Playwright gives it a throwaway
 *  profile folder and deletes it on close). The worker checks it's empty (assertFresh) and closes it when the run ends. */
export async function openBrowser(host = ""): Promise<Session> {
  const key = process.env.BROWSERBASE_API_KEY, project = process.env.BROWSERBASE_PROJECT_ID;
  if (key && project && wantsHostedBrowser(host, process.env)) {
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
  const page = await (await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", viewport: { width: 1280, height: 900 } })).newPage();
  // no Browserbase view: the worker serves its own live browser for a hand-back (live.ts, run.ts handBack)
  return { browser, page, liveUrl: null, close: () => browser.close() };
}

export const settings = () => ({
  dryRun: process.env.FILER_DRY_RUN === "1", twoKey: Number(process.env.FILER_TWO_KEY ?? "10"),
  maxSteps: 80, maxMs: 15 * 60_000, holdMs: 20 * 60_000, pollMs: 5000,
  // "Show Odelia how": the person has 30 minutes to file while Odelia watches (the run's limit is maxMs + holdMs + 5)
  teachMs: 30 * 60_000,
  // A playbook written from the agency's guide runs before anyone has watched it on the live site, and every run of an
  // unverified one stops at the agency's review page for the team's check, however many filings the agency has had
  // (run.ts beforeSubmit). FILER_ALLOW_UNVERIFIED=0 sends those filings to the team instead, as before.
  allowUnverified: process.env.FILER_ALLOW_UNVERIFIED !== "0",
});

/** How many filings run side by side in this container (FILER_CONCURRENCY, 1 to 4, default 1). Each slot has its own
 *  store (its own run token) and opens its own browser per run; the slots share one lock so a workspace's runs on the
 *  same portal still go one at a time (heal.ts KeyLock). */
export const slots = (env: Record<string, string | undefined>) => Math.min(4, Math.max(1, Math.floor(Number(env.FILER_CONCURRENCY ?? "1")) || 1));

export const VERSION = "2026-10-24";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.FILER_ENABLED === "0") { console.log("FILER_ENABLED is 0; the portal worker is off."); process.exit(0); }
  assertNotRoot();
  const env = checkEnv(process.env);
  for (const w of env.warnings) console.warn("filer:", w);
  const live = new LiveViews(env.publicUrl);
  const health: Health = { env, started: new Date().toISOString(), version: VERSION, playbooks: PLAYBOOKS.length, probes: probesOf().length,
    lastHeartbeat: null, lastHeartbeatError: null, lastClaim: null, lastProbe: null, probeDrift: null, running: 0 };
  startServer(Number(process.env.PORT ?? "10000"), () => health, live);
  if (!env.ok) {
    // Fail safe: no key, no filing. The server stays up so /healthz says what's missing, and Render's health check fails.
    for (const l of missingLines(env)) console.error("filer:", l);
    console.error("filer: not taking any filing until these are set in Render, placetta-filer, Environment.");
    for (;;) await sleep(60_000);
  }
  const store0 = new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env));
  const beat = async () => {
    try {
      await store0.heartbeat({ version: VERSION, browser: env.browser, live_view: live.on || env.browser === "browserbase", slots: slots(process.env),
        playbooks: PLAYBOOKS.length, running: health.running, nightly_check: health.lastProbe, nightly_drift: health.probeDrift });
      health.lastHeartbeat = new Date().toISOString(); health.lastHeartbeatError = null;
    } catch (e) { health.lastHeartbeatError = e instanceof Error ? e.message.slice(0, 200) : "error"; console.error("filer: heartbeat", health.lastHeartbeatError); }
  };
  // The heartbeat, every minute: the app shows online filing as live, and filings queue for it, only while it beats.
  void (async () => { for (;;) { await beat(); await sleep(60_000); } })();
  // The nightly re-check of every playbook against the agencies' public pages (probe.ts), at FILER_PROBE_HOUR UTC.
  const hour = Math.min(23, Math.max(0, Number(process.env.FILER_PROBE_HOUR ?? "10") || 0));
  void (async () => {
    for (;;) {
      if (process.env.FILER_PROBE !== "0" && probeDue(new Date(), health.lastProbe?.slice(0, 10) ?? null, hour)) {
        try {
          const drift = await checkAll();
          health.probeDrift = drift.length;
          if (drift.length) await store0.probeReport(findingsOf(drift));
          console.log(`filer: nightly check of ${health.probes} public pages, ${drift.length} drifted`);
        } catch (e) { console.error("filer: nightly check", e instanceof Error ? e.message : e); }
        health.lastProbe = new Date().toISOString();
      }
      await sleep(15 * 60_000);
    }
  })();
  const lock = new KeyLock();
  const loop = async () => {
    const store = new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env, () => undefined));
    const w = new Worker({ store, model: new AnthropicModel(process.env.ANTHROPIC_API_KEY!), open: openBrowser, portalOf: (id) => DEST[id]?.portal ?? null,
      routeOf, playbookOf: playbookFor, lock, labeler: new AnthropicLabeler(process.env.ANTHROPIC_API_KEY!).label, live, ...settings() });
    for (;;) {
      try {
        health.running++;
        const busy = await w.once().finally(() => { health.running--; });
        if (busy) health.lastClaim = new Date().toISOString();
        else await sleep(5000);
      }
      catch (e) { console.error("worker:", e instanceof Error ? e.message : e); await sleep(5000); }
    }
  };
  await Promise.all(Array.from({ length: slots(process.env) }, loop));
}
