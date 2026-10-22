// The browser a portal run drives is a sandbox around a hostile page: the agency's site is the one thing in a run that
// Placetta doesn't control. Whatever the page does, and whatever the model asks for:
//
//   navigation   every frame's navigation goes only to the run's allowlisted agency hosts (the destination's host and
//                the other hosts it names); a CAPTCHA provider may load in a sub-frame only, so a person can solve it
//   schemes      file:, data:, javascript:, chrome: and anything else that isn't http(s) is refused, as a request, a
//                navigation or a link the model asks to click
//   downloads    refused (the context doesn't accept them, and any that starts is cancelled)
//   dialogs      alert, confirm, prompt and beforeunload are dismissed; popups and new tabs are closed
//   time         the whole run has a hard limit; past it the browser is closed, whatever it was waiting on
//   storage      cookies, permissions, local and session storage and IndexedDB are wiped before the browser closes
//   user         the worker refuses to start as root (the image runs as pwuser: worker/filer/Dockerfile)
//   regexes      a confirmation pattern read back from the shared skill table runs only if it has the shape the worker
//                itself writes (escaped words, \s*, then one group of letters, digits and escaped characters)
//
// Tests: worker/filer/test/sandbox.test.ts (real Chromium).
import type { BrowserContext, Page } from "playwright-core";
import { onPortal } from "./guards.ts";

/** Where a CAPTCHA or an identity check loads from: allowed in a sub-frame, never as the page itself. */
export const CHALLENGE_HOSTS = ["google.com", "gstatic.com", "recaptcha.net", "hcaptcha.com", "challenges.cloudflare.com", "arkoselabs.com", "funcaptcha.com"];

/** May a frame go to this address? Only http(s), only to the run's hosts; a CAPTCHA provider in a sub-frame only. */
export function navAllowed(url: string, hosts: string[], mainFrame: boolean): boolean {
  if (url === "about:blank") return true;
  if (!/^https?:\/\//i.test(url)) return false;
  if (hosts.some((h) => onPortal(url, h))) return true;
  return !mainFrame && CHALLENGE_HOSTS.some((h) => onPortal(url, h));
}

/** A request the browser may make at all: http(s), or data:/blob: inside a page (images, fonts), never file: or the rest. */
export const schemeAllowed = (url: string) => /^(https?:|data:|blob:)/i.test(url) || url === "about:blank";

export type Blocked = { kind: "navigation" | "scheme" | "download" | "dialog" | "popup"; detail: string };

/** Lock the run's browser down. onBlocked hears each thing refused, for the filing's log. */
export async function harden(page: Page, hosts: string[], onBlocked: (b: Blocked) => void): Promise<void> {
  const ctx: BrowserContext = page.context();
  await ctx.route("**/*", (route) => {
    const req = route.request(), url = req.url();
    if (!schemeAllowed(url)) { onBlocked({ kind: "scheme", detail: url.slice(0, 120) }); return route.abort("blockedbyclient"); }
    // a navigation whose frame doesn't exist yet (a popup) is held to the main page's rule
    let main = true; try { main = req.frame() === page.mainFrame() || !req.frame().parentFrame(); } catch { main = true; }
    if (req.isNavigationRequest() && !navAllowed(url, hosts, main)) {
      onBlocked({ kind: "navigation", detail: url.slice(0, 120) });
      // a 204 leaves the frame where it was (an aborted navigation would put Chromium's error page in its place)
      return route.fulfill({ status: 204, body: "" });
    }
    return route.continue();
  });
  page.on("dialog", (d) => { onBlocked({ kind: "dialog", detail: `${d.type()}: ${d.message().slice(0, 80)}` }); d.dismiss().catch(() => undefined); });
  page.on("download", (d) => { onBlocked({ kind: "download", detail: d.suggestedFilename().slice(0, 80) }); d.cancel().catch(() => undefined); });
  ctx.on("page", (p) => { if (p !== page) { onBlocked({ kind: "popup", detail: p.url().slice(0, 120) || "a new window" }); p.close().catch(() => undefined); } });
}

/** The run's browser storage, wiped before it closes (the context is thrown away too; this holds even if it weren't). */
export async function wipe(page: Page): Promise<void> {
  const ctx = page.context();
  await ctx.clearCookies().catch(() => undefined);
  await ctx.clearPermissions().catch(() => undefined);
  for (const p of ctx.pages()) {
    await p.evaluate(async () => {
      try { localStorage.clear(); } catch { /* none */ }
      try { sessionStorage.clear(); } catch { /* none */ }
      try { const dbs = await (indexedDB as unknown as { databases?(): Promise<{ name?: string }[]> }).databases?.() ?? []; for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name); } catch { /* none */ }
      try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* none */ }
    }).catch(() => undefined);
  }
}

/** A link the model may click: on the run's hosts, over http(s). */
export const linkAllowed = (href: string, hosts: string[]) => !href || navAllowed(href, hosts, true) || /^#/.test(href);

/** The worker never runs as root. FILER_ALLOW_ROOT=1 is for a developer's own machine only. */
export function assertNotRoot(env: Record<string, string | undefined> = process.env, uid: number | undefined = process.getuid?.()): void {
  if (uid === 0 && env.FILER_ALLOW_ROOT !== "1") throw new Error("the filer must not run as root: run it as an unprivileged user (the image's pwuser)");
}

/** The promise, or a rejection once ms have passed (and onTimeout to stop what's still running). */
export function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void | Promise<void>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => { t = setTimeout(async () => { try { await onTimeout(); } catch { /* stopped anyway */ } reject(new Error(`the run passed its ${Math.round(ms / 1000)} s limit`)); }, ms); });
  return Promise.race([p, limit]).finally(() => clearTimeout(t));
}

/** A confirmation pattern from the shared skill table, as a RegExp, only if it has the shape confirmPattern writes:
 *  escaped words, optional \s*, then one group of [A-Za-z], \d and escaped characters. Anything else is refused, so a
 *  poisoned skill can't run a regex of its own (catastrophic backtracking, lookarounds, alternations). */
const LITERAL = String.raw`(?:\\[^A-Za-z0-9]|\\s|[^\\()[\]{}*+?|^$.])`;
const SHAPE = new RegExp(String.raw`^${LITERAL}{1,120}\\s\*\((?:\[A-Za-z\]|\\d|${LITERAL}){1,60}\)$`);
export function safeConfirm(pattern: unknown): RegExp | null {
  if (typeof pattern !== "string" || pattern.length > 400 || !SHAPE.test(pattern)) return null;
  try { return new RegExp(pattern); } catch { return null; }
}
