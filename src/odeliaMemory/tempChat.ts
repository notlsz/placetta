/* "Don't remember this chat": a switch for this browser tab's conversation, the way ChatGPT's temporary chat works.
   While it's on, every request starts its run with no_memory: Odelia reads no memories beyond the records and the
   briefs, and saves nothing from it. It lasts until it's turned off or the tab is closed (session storage), and the
   app shows that it's on. */

const KEY = "placetta:no-memory";
const EVENT = "placetta:no-memory";
let mem = false;   // when session storage isn't there (a private window, a test)

export function tempChat(): boolean {
  try { return sessionStorage.getItem(KEY) === "1"; } catch { return mem; }
}
export function setTempChat(on: boolean) {
  mem = on;
  try { if (on) sessionStorage.setItem(KEY, "1"); else sessionStorage.removeItem(KEY); } catch { /* kept in memory */ }
  try { window.dispatchEvent(new CustomEvent(EVENT, { detail: on })); } catch { /* no window */ }
}
export function onTempChat(f: (on: boolean) => void): () => void {
  const h = (e: Event) => f(!!(e as CustomEvent).detail);
  try { window.addEventListener(EVENT, h); } catch { return () => undefined; }
  return () => window.removeEventListener(EVENT, h);
}
