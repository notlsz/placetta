// The business's own signed-in session on one agency portal, kept between runs so Odelia signs in (and meets login
// CAPTCHAs and texted codes) less often. Founder-approved 2026-10-28; it replaces "every run starts empty" for exactly
// one thing: this workspace's state on this portal's hosts.
//
//   what      the portal's cookies and local storage, for the run's hosts only (the destination's host and the other
//             hosts it names): never another site's, never a CAPTCHA provider's, never session storage or IndexedDB
//   when      saved after a run that signed in with the workspace's saved login and ended past the sign-in page; used by
//             the next run for the same workspace and portal; replaced when the agency logged it out and Odelia signed in again
//   where     Supabase Vault, the same as saved logins (filer_session_put / filer_session_get, run token checked, keyed to
//             the filing's own workspace plus the host: 20261105090800_filer_ai_cost.sql); never in a log, a trace, the
//             model's prompt or the filing's log
//   expiry    the portal's own session (its auth cookies' expiry; only session cookies: two hours) or 30 days, whichever
//             is first; dropped at once on a sign-in failure, when the owner removes or changes the login, and with the
//             workspace
//
// Why not Browserbase Contexts (docs.browserbase.com, Contexts, read 2026-10-28): a Context persists the whole Chromium
// user data directory, every site the session touched, with no way to scope it to a domain; this keeps only the portal's
// own hosts, the same way on every browser (Playwright's storageState over CDP or local).
//
// Nothing here solves or skips a CAPTCHA: a portal that shows one at sign-in shows it less often because Odelia signs in
// less often, and a CAPTCHA that does come up goes to the team, then the owner, as before.
import type { BrowserContext } from "playwright-core";
import { onPortal } from "./guards.ts";

export type Cookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: "Strict" | "Lax" | "None" };
export type PortalState = { cookies: Cookie[]; origins: { origin: string; localStorage: { name: string; value: string }[] }[] };

export const MAX_DAYS = 30;
/** A portal whose sign-in lives only in session cookies (no expiry): kept this long at most. */
export const SESSION_ONLY_MS = 2 * 3600_000;

const onHosts = (host: string, hosts: string[]) => {
  const h = host.replace(/^\./, "").toLowerCase();
  return hosts.some((x) => onPortal(`https://${h}/`, x));
};

/** The state, kept to the run's hosts only. */
export function scope(state: PortalState, hosts: string[]): PortalState {
  return {
    cookies: (state.cookies ?? []).filter((c) => onHosts(c.domain, hosts)),
    origins: (state.origins ?? []).filter((o) => { try { const u = new URL(o.origin); return u.protocol === "https:" && onHosts(u.hostname, hosts); } catch { return false; } }),
  };
}

/** When the saved state stops being used: the portal's own sign-in cookies' expiry, or 30 days, whichever is first;
 *  session cookies only: two hours. */
export function expiresAt(state: PortalState, now = Date.now()): Date {
  const cap = now + MAX_DAYS * 86_400_000;
  const persistent = state.cookies.filter((c) => c.expires > 0).map((c) => c.expires * 1000).filter((t) => t > now);
  if (!persistent.length) return new Date(Math.min(cap, now + SESSION_ONLY_MS));
  return new Date(Math.min(cap, Math.max(...persistent)));
}

/** Read it from the run's browser, scoped. */
export async function capture(ctx: BrowserContext, hosts: string[]): Promise<PortalState> {
  return scope(await ctx.storageState() as PortalState, hosts);
}

/** Put it into a fresh run's browser, before the first page: the cookies, and each origin's local storage set the first
 *  time a page of that origin loads (an init script holds only those origins' own values). Anything off the run's hosts
 *  is refused, whatever the store gave back. */
export async function restore(ctx: BrowserContext, state: PortalState, hosts: string[]): Promise<number> {
  const s = scope(state, hosts);
  if (s.cookies.length) await ctx.addCookies(s.cookies);
  if (s.origins.length) {
    await ctx.addInitScript((origins: PortalState["origins"]) => {
      const o = origins.find((x) => x.origin === location.origin);
      if (!o) return;
      try { if (sessionStorage.getItem("__pc_restored") === "1") return; sessionStorage.setItem("__pc_restored", "1"); } catch { /* none */ }
      try { for (const kv of o.localStorage) if (localStorage.getItem(kv.name) === null) localStorage.setItem(kv.name, kv.value); } catch { /* none */ }
    }, s.origins);
  }
  return s.cookies.length + s.origins.length;
}

/** After a restore, the browser holds nothing but the portal's own state (assertFresh's rule, adapted): every cookie is
 *  on the run's hosts. */
export async function assertOnly(ctx: BrowserContext, hosts: string[]): Promise<void> {
  const off = (await ctx.cookies()).filter((c) => !onHosts(c.domain, hosts));
  if (off.length) throw new Error(`browser session carries another site's state (${off.length} cookies)`);
}

/** The page still asks for the password after Odelia typed it and pressed sign in, with words of a refusal: a sign-in
 *  failure (a security event: the saved state is dropped). */
export const SIGN_IN_FAILED = /\b(invalid|incorrect|wrong|failed|not recognized|locked|disabled|try again)\b/i;
