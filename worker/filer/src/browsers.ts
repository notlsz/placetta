// Where a run's browser comes from: BROWSER_PROVIDER=local|steel|browserbase (env.ts providerOf).
//
//   local        Chromium inside this container (the Playwright image). The default. With Browserbase's two keys set,
//                the hosts that refuse a cloud server's address (env.ts BLOCKS_DATACENTER) open on Browserbase instead.
//   steel        every run on a new Steel session (steel.dev), over CDP. No Chromium is started here, so the worker fits
//                a small container (Render's free plan).
//   browserbase  every run on a new Browserbase session, over CDP. No Chromium is started here either.
//
// Every session is new and empty (no saved profile, context, cookies or stored credentials), and is released when the
// run ends. No provider's CAPTCHA solving is ever on: Steel is created with solveCaptcha false and its stealth
// auto-solve off, Browserbase with solveCaptchas false. A CAPTCHA goes to a person (run.ts handBack), never to a solver.
//
// The live view: a provider's own viewer (Steel's debugUrl, Browserbase's debugger) is the owner's hand-back view, as
// Browserbase's has been. It shows the page uncovered, so the Placetta team never gets it: staff always get the
// worker's own covered view (live.ts, page.ts staffGuard), or no picture at all. A provider address that isn't https,
// or that carries the API key, is never used as a view.
//
// Recordings: Steel records every session, so a Steel session says recorded and never gets Placetta's single-use card
// (run.ts hands the fee to a person). Browserbase sessions are made with recording off while cards are on.
//
// The API key never leaves this module in an error: a refusal says "steel 401", not the address it went to.
// Tests: worker/filer/test/providers.test.ts (a mock Steel and Browserbase API in front of a real Chromium over CDP).
import type { Browser } from "playwright-core";
import type { Session } from "./run.ts";
import { providerOf, wantsHostedBrowser, type Provider } from "./env.ts";
import { cardsOn } from "./card.ts";

export type Deps = {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  /** Playwright's chromium.connectOverCDP (tests: the same, to a mock's Chromium). */
  connect(url: string): Promise<Browser>;
  /** Local Chromium (only for BROWSER_PROVIDER=local). */
  launch(): Promise<Browser>;
  /** How long a remote session may live at most (the run's own limit plus a margin). */
  sessionMs?: number;
};

// Playwright is loaded when a browser is opened, not when this module is (the red-team test reads the pure parts).
const pw = () => import("playwright-core").then((m) => m.chromium);
export const defaultDeps = (env: Record<string, string | undefined> = process.env): Deps => ({
  env, fetch: (...a) => fetch(...a),
  connect: async (url) => (await pw()).connectOverCDP(url, { timeout: 60_000 }),
  launch: async () => (await pw()).launch({ headless: true, executablePath: env.CHROMIUM_PATH || undefined, args: env.CHROMIUM_PATH ? ["--no-sandbox"] : [] }),
});

const STEEL_API = "https://api.steel.dev";
const STEEL_CONNECT = "wss://connect.steel.dev";
const BB_API = "https://api.browserbase.com";

/** The body Steel's sessions API gets: nothing saved, nothing solved. Exported for the tests. */
export function steelBody(ms: number) {
  return {
    solveCaptcha: false,                                   // never: a CAPTCHA goes to a person
    stealthConfig: { autoCaptchaSolving: false },
    useProxy: false,
    timeout: Math.max(60_000, Math.min(Math.floor(ms), 6 * 3600_000)),
    dimensions: { width: 1280, height: 900 },
    debugConfig: { interactive: true },                    // the owner's hand-back types into the viewer
  };
}

/** The body Browserbase's sessions API gets. keepAlive so a dropped connection doesn't lose the page mid-filing; the
 *  session is released when the run ends. No saved context. With single-use cards on (STRIPE_ISSUING_ON), record is
 *  false: Browserbase keeps no replay of a session that may type Placetta's card (card.ts). */
export const browserbaseBody = (project: string, record = true) =>
  ({ projectId: project, keepAlive: true, browserSettings: { solveCaptchas: false, ...(record ? {} : { recordSession: false }) } });

/** A provider's viewer address, if it's one the owner may be given: https, and never carrying the key. */
export function viewerUrl(raw: unknown, key: string, params = ""): string | null {
  if (typeof raw !== "string" || !raw.startsWith("https://")) return null;
  if (key && raw.includes(key)) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.username || u.password) return null;
  for (const [k, v] of new URLSearchParams(params)) u.searchParams.set(k, v);
  const out = u.toString();
  return key && out.includes(key) ? null : out;
}

/** The run's page on a remote browser: the session's own first page, which assertFresh (run.ts) checks is blank. */
async function firstPage(browser: Browser) {
  const ctx = browser.contexts()[0] ?? await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
  return ctx.pages()[0] ?? await ctx.newPage();
}

/** A new Steel session for one run. */
export async function openSteel(d: Deps): Promise<Session> {
  const key = (d.env.STEEL_API_KEY ?? "").trim();
  if (!key) throw new Error("steel: STEEL_API_KEY is not set");
  const api = (d.env.STEEL_API_URL || STEEL_API).replace(/\/+$/, "");
  // A plan caps how long a session may live (Steel's free plan is shorter than the 30 minutes asked for), and a timeout
  // over the cap is refused with a 400. Ask for the configured length, then the free plan's 15 minutes, then 5.
  const want = d.sessionMs ?? Number(d.env.STEEL_SESSION_MS || 30 * 60_000);
  const create = (ms: number) => d.fetch(`${api}/v1/sessions`, { method: "POST", headers: { "steel-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(steelBody(ms)), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  let res = await create(want), why = "";
  for (const ms of [15 * 60_000, 5 * 60_000].filter((m) => m < want)) {
    if (res?.status !== 400) break;
    why = (await res.text().catch(() => "")).replaceAll(key, "•••").replace(/\s+/g, " ").slice(0, 160);
    res = await create(ms);
  }
  if (!res?.ok) {
    if (res && !why) why = (await res.text().catch(() => "")).replaceAll(key, "•••").replace(/\s+/g, " ").slice(0, 160);
    throw new Error(`steel ${res?.status ?? "unreachable"}${why ? `: ${why}` : ""}`);
  }
  const s = await res.json().catch(() => ({})) as { id?: string; debugUrl?: string; sessionViewerUrl?: string };
  if (!s.id || !/^[\w-]{8,80}$/.test(s.id)) throw new Error("steel: no session id");
  const id = s.id;
  const release = () => d.fetch(`${api}/v1/sessions/${encodeURIComponent(id)}/release`, { method: "POST", headers: { "steel-api-key": key, "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(15_000) })
    .then(() => undefined, () => undefined);
  const base = (d.env.STEEL_CONNECT_URL || STEEL_CONNECT).replace(/\/+$/, "");
  const url = `${base}${base.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(key)}&sessionId=${encodeURIComponent(id)}`;
  let browser: Browser;
  try { browser = await d.connect(url); }
  catch { await release(); throw new Error("steel: couldn't connect to the session"); }
  try {
    const page = await firstPage(browser);
    // interactive for the owner's hand-back; no address bar (showControls), so the viewer can't be pointed elsewhere
    const liveUrl = viewerUrl(s.debugUrl, key, "interactive=true&showControls=false");
    return { browser, page, liveUrl, recorded: true, close: async () => { await browser.close().catch(() => undefined); await release(); } };
  } catch (e) {
    await browser.close().catch(() => undefined); await release();
    throw new Error(`steel: ${e instanceof Error ? e.message.replaceAll(key, "•••").slice(0, 120) : "error"}`);
  }
}

/** A new Browserbase session for one run. */
export async function openBrowserbase(d: Deps): Promise<Session> {
  const key = (d.env.BROWSERBASE_API_KEY ?? "").trim(), project = (d.env.BROWSERBASE_PROJECT_ID ?? "").trim();
  if (!key || !project) throw new Error("browserbase: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are both needed");
  const api = (d.env.BROWSERBASE_API_URL || BB_API).replace(/\/+$/, "");
  const res = await d.fetch(`${api}/v1/sessions`, { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(browserbaseBody(project, !cardsOn(d.env))), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) throw new Error(`browserbase ${res?.status ?? "unreachable"}`);
  const s = await res.json().catch(() => ({})) as { id?: string; connectUrl?: string };
  if (!s.id || !/^[\w-]{8,80}$/.test(s.id) || typeof s.connectUrl !== "string" || !/^wss?:\/\//.test(s.connectUrl)) throw new Error("browserbase: no session");
  const id = s.id;
  const release = () => d.fetch(`${api}/v1/sessions/${encodeURIComponent(id)}`, { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project, status: "REQUEST_RELEASE" }), signal: AbortSignal.timeout(15_000) })
    .then(() => undefined, () => undefined);
  let browser: Browser;
  try { browser = await d.connect(s.connectUrl); }
  catch { await release(); throw new Error("browserbase: couldn't connect to the session"); }
  try {
    const page = await firstPage(browser);
    const live = await d.fetch(`${api}/v1/sessions/${encodeURIComponent(id)}/debug`, { headers: { "X-BB-API-Key": key }, signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json(), () => ({})).catch(() => ({})) as { debuggerFullscreenUrl?: string };
    return { browser, page, liveUrl: viewerUrl(live.debuggerFullscreenUrl, key), recorded: !cardsOn(d.env), close: async () => { await browser.close().catch(() => undefined); await release(); } };
  } catch (e) {
    await browser.close().catch(() => undefined); await release();
    throw new Error(`browserbase: ${e instanceof Error ? e.message.replaceAll(key, "•••").slice(0, 120) : "error"}`);
  }
}

/** Local Chromium: a new process with a new, empty context (Playwright's throwaway profile, deleted on close). */
export async function openLocal(d: Deps): Promise<Session> {
  const browser = await d.launch();
  // no downloads, no service workers: the run's own throwaway context (sandbox.ts locks the rest down)
  const page = await (await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", viewport: { width: 1280, height: 900 } })).newPage();
  // no hosted view: the worker serves its own live browser for a hand-back (live.ts, run.ts handBack)
  return { browser, page, liveUrl: null, recorded: false, close: () => browser.close() };
}

/** The opener the worker uses for each run (run.ts Config.open). An unknown provider opens nothing. */
export function opener(d: Deps): (host?: string) => Promise<Session> {
  const p: Provider | "invalid" = providerOf(d.env);
  return async (host = "") => {
    if (p === "steel") return openSteel(d);
    if (p === "browserbase") return openBrowserbase(d);
    if (p === "local") return wantsHostedBrowser(host, d.env) ? openBrowserbase(d) : openLocal(d);
    throw new Error("BROWSER_PROVIDER must be local, steel or browserbase");
  };
}

/** A whole browser for the nightly re-check and the founder's check (probe.ts Launch): local Chromium, or one remote
 *  session whose close() also releases it. */
export function launcher(d: Deps): () => Promise<Browser> {
  const p = providerOf(d.env);
  if (p !== "steel" && p !== "browserbase") return d.launch;
  return async () => {
    const s = await (p === "steel" ? openSteel(d) : openBrowserbase(d));
    const b = s.browser;
    return new Proxy(b, { get: (t, k) => {
      if (k === "close") return () => s.close();
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    } }) as Browser;
  };
}
