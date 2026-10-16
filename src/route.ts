import type { View } from "./ctx";

/* Real addresses for every page of the app: /app/stores, /app/settings/billing and so on, so a page can be bookmarked,
   shared, reloaded and opened in a new tab, and Back and Forward work. Only where the app is served from a path
   (/app/); the single-file preview keeps one address. The host serves /app/index.html for every /app/ address. */

const BASE = import.meta.env.BASE_URL;
export const routed = BASE.startsWith("/");

const SLUG: Record<View, string> = {
  overview: "", work: "work", playbooks: "playbooks", updates: "updates", stores: "stores", apps: "applications", docs: "documents", deadlines: "deadlines",
  audit: "activity", context: "context", find: "find", settings: "settings", queue: "queue", hq: "headquarters",
};

/** The address of a page, and for Settings of one of its categories. */
export function hrefOf(v: View, sub?: string): string {
  const s = SLUG[v];
  return BASE + (s ? s + (sub ? "/" + encodeURIComponent(sub) : "") : "");
}

/** The page the address names. Unknown addresses open the overview. */
export function readRoute(): { view: View; sub?: string } {
  if (!routed || !location.pathname.startsWith(BASE)) return { view: "overview" };
  const [first = "", second] = location.pathname.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent);
  const view = (Object.keys(SLUG) as View[]).find(k => SLUG[k] === first);
  return view ? { view, ...(second ? { sub: second } : {}) } : { view: "overview" };
}

/** Put a page's address in the bar: a new history entry, or the same one when the move isn't a step of its own. */
export function setRoute(v: View, sub?: string, replace = false) {
  if (!routed) return;
  const h = hrefOf(v, sub);
  if (location.pathname === h) return;
  if (replace) history.replaceState(history.state, "", h);
  else history.pushState(null, "", h);
}

/** A click on a link inside the app: handle it in place, unless the person asked for a new tab or window. */
export function plainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
