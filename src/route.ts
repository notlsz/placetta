import type { View } from "./ctx";

/* Real addresses for every page of the app: /app/stores, /app/permits/deadlines, /app/settings/billing and so on, so a
   page can be bookmarked, shared, reloaded and opened in a new tab, and Back and Forward work. Only where the app is
   served from a path (/app/); the single-file preview keeps one address. The host serves /app/index.html for every
   /app/ address.

   Four places plus Settings: Home (/), Permits (/permits, with its tabs), Stores (/stores) and Odelia (/odelia, with
   its tabs). The pages that used to be their own addresses still open, at their new homes (LEGACY). */

const BASE = import.meta.env.BASE_URL;
export const routed = BASE.startsWith("/");

const SLUG: Record<View, string> = {
  overview: "", permits: "permits", stores: "stores", odelia: "odelia", find: "permits/find", settings: "settings", queue: "queue", hq: "headquarters",
};

/** The tabs a page has, by the word in its address. The first is the page's own address. */
export const TABS: Partial<Record<View, readonly string[]>> = {
  permits: ["todo", "filed", "documents", "deadlines"],
  odelia: ["chat", "work", "playbooks", "updates"],
};

/** Old addresses, kept working: where each one lives now. */
export const LEGACY: Record<string, { view: View; sub?: string }> = {
  work: { view: "odelia", sub: "work" }, playbooks: { view: "odelia", sub: "playbooks" }, updates: { view: "odelia", sub: "updates" },
  applications: { view: "permits" }, documents: { view: "permits", sub: "documents" }, deadlines: { view: "permits", sub: "deadlines" },
  activity: { view: "settings", sub: "activity" }, context: { view: "settings", sub: "facts" }, find: { view: "find" },
};

/** The address of a page, and of one of its tabs (or, for Settings, one of its categories). */
export function hrefOf(v: View, sub?: string): string {
  const s = SLUG[v];
  const tabs = TABS[v];
  const tail = sub && !(tabs && tabs[0] === sub) ? "/" + encodeURIComponent(sub) : "";
  return BASE + (s ? s + tail : "");
}

/** The page the address names, and its tab. Unknown addresses open Home; old addresses open their new home. */
export function readRoute(): { view: View; sub?: string; legacy?: boolean } {
  if (!routed || !location.pathname.startsWith(BASE)) return { view: "overview" };
  const [first = "", second] = location.pathname.slice(BASE.length).split("/").filter(Boolean).map(decodeURIComponent);
  if (first === "permits" && second === "find") return { view: "find" };
  const view = (Object.keys(SLUG) as View[]).find(k => SLUG[k] === first);
  if (view) {
    const tabs = TABS[view];
    if (tabs) return { view, ...(second && tabs.includes(second) ? { sub: second } : {}) };
    return { view, ...(second ? { sub: second } : {}) };
  }
  const old = LEGACY[first];
  return old ? { ...old, legacy: true } : { view: "overview" };
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
