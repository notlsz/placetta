// Where a run's browser comes from: BROWSER_PROVIDER, one of local|steel|browserbase or an order of them such as
// browserbase,steel,local (env.ts providersOf). A run opens on the first that gives it a session; a refusal (quota, 4xx,
// 5xx, a failed connection) goes to the next for that run (opener). Unset, the order is browserbase,steel,local when
// Browserbase's two keys are set (steel only with its key), else local alone.
//
//   local        Chromium inside this container (the Playwright image). Alone, with Browserbase's two keys set,
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
// Recordings: Steel records every session ("Every Steel browser session automatically records all page events",
// docs.steel.dev, Embed Session Recordings; its session options have no switch to turn that off), so a Steel session
// says recorded and never gets Placetta's single-use card (run.ts hands the fee to a person). Browserbase sessions are
// made with recording off while cards are on, and whenever the run asks for an unrecorded browser.
//
// An unrecorded browser (open's second argument): a run where a person may be handed a page they haven't agreed to
// have recorded (privacy.ts: California, or nowhere known, without their opt-in). On Steel the run opens on Browserbase
// with recording off when its two keys are set, else on Kernel (KERNEL_API_KEY; it records nothing unless asked, and
// its stealth mode, which turns on a CAPTCHA solver, stays off), else on local Chromium when this container has it, else on Steel all
// the same, still marked recorded, so run.ts never hands that page to the person.
//
// The API key never leaves this module in an error: a refusal says "steel 401", not the address it went to.
// Tests: worker/filer/test/providers.test.ts (a mock Steel and Browserbase API in front of a real Chromium over CDP).
import type { Browser } from "playwright-core";
import type { Session } from "./run.ts";
import { providerOf, usableProviders, wantsHostedBrowser, type Provider } from "./env.ts";
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
const KERNEL_API = "https://api.onkernel.com";

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
/*  recordSession false (docs.browserbase.com, Session replay, read 2026-10-28: "Set recordSession to false under
 *  browserSettings"). verified (BROWSERBASE_VERIFIED=1, Scale plan): Browserbase's "Verified" browser, a real Chromium
 *  fingerprint that sites challenge less, made with its proxies as Browserbase's own example does (Identity overview).
 *  It doesn't solve anything: solveCaptchas stays false. Web Bot Auth (Cloudflare's signed agents) has no session option:
 *  Browserbase switches it on for the account on request, and every session then carries the signature. */
export const browserbaseBody = (project: string, record = true, verified = false) =>
  ({ projectId: project, keepAlive: true, ...(verified ? { proxies: true } : {}),
    browserSettings: { solveCaptchas: false, ...(record ? {} : { recordSession: false }), ...(verified ? { verified: true } : {}) } });

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
    return { browser, page, liveUrl, recorded: true, provider: "steel", close: async () => { await browser.close().catch(() => undefined); await release(); } };
  } catch (e) {
    await browser.close().catch(() => undefined); await release();
    throw new Error(`steel: ${e instanceof Error ? e.message.replaceAll(key, "•••").slice(0, 120) : "error"}`);
  }
}

/** A new Browserbase session for one run. */
export async function openBrowserbase(d: Deps, o: { record?: boolean } = {}): Promise<Session> {
  const record = o.record !== false && !cardsOn(d.env);
  const key = (d.env.BROWSERBASE_API_KEY ?? "").trim(), project = (d.env.BROWSERBASE_PROJECT_ID ?? "").trim();
  if (!key || !project) throw new Error("browserbase: BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID are both needed");
  const api = (d.env.BROWSERBASE_API_URL || BB_API).replace(/\/+$/, "");
  const res = await d.fetch(`${api}/v1/sessions`, { method: "POST", headers: { "X-BB-API-Key": key, "Content-Type": "application/json" }, body: JSON.stringify(browserbaseBody(project, record, d.env.BROWSERBASE_VERIFIED === "1")), signal: AbortSignal.timeout(30_000) }).catch(() => null);
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
    return { browser, page, liveUrl: viewerUrl(live.debuggerFullscreenUrl, key), recorded: record, provider: "browserbase", keepAlive: true, close: async () => { await browser.close().catch(() => undefined); await release(); } };
  } catch (e) {
    await browser.close().catch(() => undefined); await release();
    throw new Error(`browserbase: ${e instanceof Error ? e.message.replaceAll(key, "•••").slice(0, 120) : "error"}`);
  }
}

/** The body Kernel's browsers API gets (kernel.sh docs, Create a browser session, read 2026-10-28). stealth stays false:
 *  Kernel's stealth "enables the CAPTCHA solver", and a CAPTCHA goes to a person. Headless (the cheaper image, about
 *  $0.06 an hour); the person's hand-back uses the worker's own live view. No profile, no proxy: a new, empty browser.
 *  Kernel keeps no replay unless one is started, so a Kernel session counts as unrecorded. */
export const kernelBody = (idleSeconds = 300) => ({ headless: true, stealth: false, timeout_seconds: Math.max(60, Math.min(Math.floor(idleSeconds), 3600)) });

/** A new Kernel browser for one run (kernel.sh). For runs that may not be recorded when Browserbase isn't set up. */
export async function openKernel(d: Deps): Promise<Session> {
  const key = (d.env.KERNEL_API_KEY ?? "").trim();
  if (!key) throw new Error("kernel: KERNEL_API_KEY is not set");
  const api = (d.env.KERNEL_API_URL || KERNEL_API).replace(/\/+$/, "");
  const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const res = await d.fetch(`${api}/browsers`, { method: "POST", headers: auth, body: JSON.stringify(kernelBody()), signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) {
    const why = res ? (await res.text().catch(() => "")).replaceAll(key, "•••").replace(/\s+/g, " ").slice(0, 160) : "";
    throw new Error(`kernel ${res?.status ?? "unreachable"}${why ? `: ${why}` : ""}`);
  }
  const s = await res.json().catch(() => ({})) as { session_id?: string; cdp_ws_url?: string };
  if (!s.session_id || !/^[\w-]{6,80}$/.test(s.session_id) || typeof s.cdp_ws_url !== "string" || !/^wss?:\/\//.test(s.cdp_ws_url)) throw new Error("kernel: no session");
  const id = s.session_id;
  const release = () => d.fetch(`${api}/browsers/${encodeURIComponent(id)}`, { method: "DELETE", headers: auth, signal: AbortSignal.timeout(15_000) })
    .then(() => undefined, () => undefined);
  let browser: Browser;
  try { browser = await d.connect(s.cdp_ws_url); }
  catch { await release(); throw new Error("kernel: couldn't connect to the session"); }
  try {
    const page = await firstPage(browser);
    // A new Kernel browser opens on its own start page, not a blank one. Leave it for about:blank so the run starts
    // where every other provider's does; run.ts assertFresh still checks the session has no cookies and no other pages.
    if (/^https?:/i.test(page.url())) await page.goto("about:blank", { timeout: 15_000 });
    return { browser, page, liveUrl: null, recorded: false, provider: "kernel", close: async () => { await browser.close().catch(() => undefined); await release(); } };
  } catch (e) {
    await browser.close().catch(() => undefined); await release();
    throw new Error(`kernel: ${e instanceof Error ? e.message.replaceAll(key, "•••").slice(0, 120) : "error"}`);
  }
}

/** Local Chromium: a new process with a new, empty context (Playwright's throwaway profile, deleted on close). */
export async function openLocal(d: Deps): Promise<Session> {
  const browser = await d.launch();
  // no downloads, no service workers: the run's own throwaway context (sandbox.ts locks the rest down)
  const page = await (await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", viewport: { width: 1280, height: 900 } })).newPage();
  // no hosted view: the worker serves its own live browser for a hand-back (live.ts, run.ts handBack)
  return { browser, page, liveUrl: null, recorded: false, provider: "local", close: () => browser.close() };
}

export type OpenOpts = { /** A person may be handed this page without having agreed to a recording. */ unrecorded?: boolean;
  /** A browser comparison (rehearsals only, run.ts benchBrowser): this provider and no other, still under the California
   *  rule, so a run that may not be recorded never opens on Steel. */
  only?: Provider };

/** The providers a run tries, in order (pure, for the tests):
 *   - BROWSER_PROVIDER's order (env.ts providersOf); local alone sends the hosts that refuse a cloud server's address
 *     (env.ts BLOCKS_DATACENTER) to Browserbase when its keys are set, as before
 *   - an unrecorded run (privacy.ts: a person in California, or nowhere known, who hasn't opted in) never opens on Steel,
 *     which records every session: only Browserbase with recording off, or local Chromium. Browserbase joins the order
 *     when its keys are set and local Chromium is the last resort, so a Steel-only worker still has somewhere to go. */
export function orderFor(env: Record<string, string | undefined>, host: string, o: OpenOpts = {}): Provider[] {
  const list = usableProviders(env);
  if (list === "invalid") return [];
  const bb = !!env.BROWSERBASE_API_KEY?.trim() && !!env.BROWSERBASE_PROJECT_ID?.trim();
  const kernel = !!env.KERNEL_API_KEY?.trim();
  let order: Provider[] = list.length === 1 && list[0] === "local" && wantsHostedBrowser(host, env) ? ["browserbase"] : [...list];
  if (o.unrecorded) {
    order = order.filter((p) => p !== "steel");
    if (bb && !order.includes("browserbase")) order.unshift("browserbase");
    // Kernel (no recording unless asked) right after Browserbase: the free stand-in until Browserbase's keys are set
    if (kernel && !order.includes("kernel")) order.splice(order.includes("browserbase") ? order.indexOf("browserbase") + 1 : 0, 0, "kernel");
    if (!order.includes("local")) order.push("local");
  }
  if (o.only) {
    const keyed = o.only === "local" || (o.only === "steel" ? !!env.STEEL_API_KEY?.trim() : o.only === "kernel" ? kernel : bb);
    order = keyed && !(o.unrecorded && o.only === "steel") ? [o.only] : [];
  }
  return order;
}

/** The opener the worker uses for each run (run.ts Config.open). Each provider in the order is tried until one gives a
 *  session: a refusal (a plan's quota, a 4xx or 5xx, a failed connection, Chromium that won't start) goes to the next for
 *  this run, and the log says which one served it. An unknown provider opens nothing. */
export function opener(d: Deps): (host?: string, o?: OpenOpts) => Promise<Session> {
  return async (host = "", o: OpenOpts = {}) => {
    const order = orderFor(d.env, host, o);
    if (!order.length && o.only) throw new Error(`browsers: ${o.only} can't serve this comparison run (no key, or Steel on a run that may not be recorded)`);
    if (!order.length) throw new Error("BROWSER_PROVIDER must be local, steel or browserbase, or an order of them such as browserbase,steel,local");
    const failed: string[] = [];
    for (const p of order) {
      try {
        const s = p === "steel" ? await openSteel(d) : p === "kernel" ? await openKernel(d) : p === "browserbase" ? await openBrowserbase(d, o.unrecorded ? { record: false } : {}) : await openLocal(d);
        // the California rule, checked on what was opened, not only on what was asked for
        if (o.unrecorded && s.recorded) { await s.close().catch(() => undefined); failed.push(`${p}: recorded`); continue; }
        if (failed.length || order.length > 1) console.log(`filer: browser ${p}${failed.length ? ` after ${failed.join("; ")}` : ""}`);
        return { ...s, provider: p };
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 160) : "error";
        failed.push(p === "local" && !/^local:/.test(msg) ? `local: ${msg}` : msg);
        if (order.length > 1) console.warn(`filer: ${p} refused the session (${failed.at(-1)}), trying the next`);
      }
    }
    // one provider: its own error as before; several: every refusal, under "browsers" (run.ts treats it as its own tools)
    if (order.length === 1) throw new Error(failed[0]);
    throw new Error(`browsers: ${failed.join("; ")}`.slice(0, 400));
  };
}

/** A whole browser for the nightly re-check and the founder's check (probe.ts Launch): local Chromium, or one remote
 *  session (in the same order as a run) whose close() also releases it. */
export function launcher(d: Deps): () => Promise<Browser> {
  const p = providerOf(d.env);
  if (p !== "steel" && p !== "browserbase") return d.launch;
  return async () => {
    const s = await opener(d)("");
    const b = s.browser;
    return new Proxy(b, { get: (t, k) => {
      if (k === "close") return () => s.close();
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    } }) as Browser;
  };
}
