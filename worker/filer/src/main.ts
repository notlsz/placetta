// Entry point: node --experimental-strip-types src/main.ts
// The browser (browsers.ts): BROWSER_PROVIDER=local (the default: Chromium in the container, CHROMIUM_PATH for a custom
// binary; with Browserbase's two keys set, the hosts whose bot protection refuses a cloud server's address open there,
// env.ts BLOCKS_DATACENTER plus FILER_BROWSERBASE_HOSTS), steel or browserbase (every run remote, no Chromium here).
//
// Sleep and wake (Render's free plan): the worker beats while it's up. Asleep, the server wakes it with POST /wake
// (wake.ts); it drains the queue and idles, and the plan puts it to sleep again after 15 minutes with no request. While
// a run is open it asks for its own /healthz every few minutes, so the plan doesn't put it to sleep mid-filing.
import { DEST } from "../../../supabase/functions/file/destinations.ts";
import { defaultDeps, launcher, opener } from "./browsers.ts";
import { checkEnv, missingLines } from "./env.ts";
import { LiveViews } from "./live.ts";
import { AnthropicLabeler, AnthropicModel } from "./model.ts";
import { PLAYBOOKS, playbookFor } from "./playbooks.ts";
import { checkAll, findingsOf, probeDue, probesOf } from "./probe.ts";
import { type Route, Worker, type Session } from "./run.ts";
import { dbKey, SupabaseStore } from "./store.ts";
import { assertNotRoot } from "./sandbox.ts";
import { startServer, type Health } from "./server.ts";
import { KeyLock } from "./heal.ts";
import { Waker } from "./wake.ts";

/** The destination's tenant path, other hosts and start page, from destinations.ts like its host. */
export const routeOf = (id: string): Route | null => {
  const d = DEST[id];
  return d?.portal ? { tenant: d.tenant, alsoOn: d.alsoOn, start: d.portalUrl } : null;
};

/** A new browser session for one run, never reused (browsers.ts): a new Steel or Browserbase session (no saved profile
 *  or context, so it starts empty), or a new local Chromium process with a new, empty browser context (Playwright gives
 *  it a throwaway profile folder and deletes it on close). The worker checks it's empty (assertFresh) and closes it
 *  when the run ends. */
export function openBrowser(host = ""): Promise<Session> {
  return opener(defaultDeps(process.env))(host);
}

/** Runs with a browser open right now: while there are any, the worker keeps its own plan awake (keepAwake). */
export function counted(open: (host?: string) => Promise<Session>, n: { open: number }) {
  return async (host?: string): Promise<Session> => {
    const s = await open(host);
    n.open++;
    let closed = false;
    return { ...s, close: async () => { if (!closed) { closed = true; n.open--; } await s.close(); } };
  };
}

/** Should the worker ask for its own /healthz now so its plan doesn't sleep? Only with a run or a live view open, a
 *  public https address, and not more often than every 4 minutes (Render sleeps a free service after 15). */
export const keepAwakeDue = (o: { open: number; views: number; publicUrl: string | null; last: number; now: number; off?: boolean }) =>
  !o.off && !!o.publicUrl?.startsWith("https://") && (o.open > 0 || o.views > 0) && o.now - o.last >= 4 * 60_000;

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
  // A wake (POST /wake) cuts the slots' idle wait short and beats at once, so the app sees the worker live within seconds.
  let nudges: (() => void)[] = [];
  const nap = (ms: number) => new Promise<void>((r) => { const t = setTimeout(go, ms); function go() { clearTimeout(t); nudges = nudges.filter((x) => x !== go); r(); } nudges.push(go); });
  let onWake = () => { for (const go of [...nudges]) go(); };
  const waker = new Waker((process.env.FILER_SECRET ?? "").trim(), () => onWake());
  startServer(Number(process.env.PORT ?? "10000"), () => health, live, waker);
  if (!env.ok) {
    // Fail safe: no key, no filing. The server stays up so /healthz says what's missing, and Render's health check fails.
    for (const l of missingLines(env)) console.error("filer:", l);
    console.error("filer: not taking any filing until these are set in Render, placetta-filer, Environment.");
    for (;;) await sleep(60_000);
  }
  const store0 = new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env));
  const beat = async () => {
    try {
      await store0.heartbeat({ version: VERSION, browser: env.browser, live_view: live.on || env.remote || env.browser === "browserbase", slots: slots(process.env),
        playbooks: PLAYBOOKS.length, running: health.running, nightly_check: health.lastProbe, nightly_drift: health.probeDrift });
      health.lastHeartbeat = new Date().toISOString(); health.lastHeartbeatError = null;
    } catch (e) { health.lastHeartbeatError = e instanceof Error ? e.message.slice(0, 200) : "error"; console.error("filer: heartbeat", health.lastHeartbeatError); }
  };
  // The heartbeat, every minute: the app shows online filing as live, and filings queue for it, only while it beats.
  void (async () => { for (;;) { await beat(); await sleep(60_000); } })();
  onWake = () => { for (const go of [...nudges]) go(); void beat(); };
  // While a run or a live view is open, keep the plan awake (a sleeping plan would stop the browser mid-filing).
  const runs = { open: 0 };
  let lastPing = 0;
  void (async () => {
    for (;;) {
      await sleep(30_000);
      if (keepAwakeDue({ open: runs.open, views: live.open_count, publicUrl: env.publicUrl, last: lastPing, now: Date.now(), off: process.env.FILER_KEEP_AWAKE === "0" })) {
        lastPing = Date.now();
        await fetch(`${env.publicUrl}/healthz`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.body?.cancel(), () => undefined);
      }
    }
  })();
  // The nightly re-check of every playbook against the agencies' public pages (probe.ts), at FILER_PROBE_HOUR UTC. With
  // a remote browser it's off unless FILER_PROBE=1 (it would spend the provider's minutes; a sleeping plan skips it anyway).
  const hour = Math.min(23, Math.max(0, Number(process.env.FILER_PROBE_HOUR ?? "10") || 0));
  const probeOn = process.env.FILER_PROBE === "1" || (process.env.FILER_PROBE !== "0" && !env.remote);
  const launch = launcher(defaultDeps(process.env));
  void (async () => {
    for (;;) {
      if (probeOn && probeDue(new Date(), health.lastProbe?.slice(0, 10) ?? null, hour)) {
        try {
          const drift = await checkAll(launch);
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
  const open = counted(opener(defaultDeps(process.env)), runs);
  const loop = async () => {
    const store = new SupabaseStore(process.env.SUPABASE_URL!, dbKey(process.env, () => undefined));
    const w = new Worker({ store, model: new AnthropicModel(process.env.ANTHROPIC_API_KEY!), open, portalOf: (id) => DEST[id]?.portal ?? null,
      routeOf, playbookOf: playbookFor, lock, labeler: new AnthropicLabeler(process.env.ANTHROPIC_API_KEY!).label, live, ...settings() });
    for (;;) {
      try {
        health.running++;
        const busy = await w.once().finally(() => { health.running--; });
        if (busy) health.lastClaim = new Date().toISOString();
        else await nap(5000);
      }
      catch (e) { console.error("worker:", e instanceof Error ? e.message : e); await sleep(5000); }
    }
  };
  await Promise.all(Array.from({ length: slots(process.env) }, loop));
}
