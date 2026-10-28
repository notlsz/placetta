// The live browser, served by the worker itself, for a run on local Chromium (no Browserbase account needed). When a
// run hands a step to the person (a CAPTCHA, a code sent to their phone, an SSN line, the agency's fee), the worker
// opens a view of that one page at an unguessable address and puts it in the filing's handoff_url, which only the
// workspace's members can read. The person sees the page as it is now, clicks and types on it, and taps "Done": Odelia
// carries on by herself. Copied from Devin's and Browserbase's "take over the browser", without a second vendor.
//
//   one page, one run   a view shows the run's own page only, and closes when the hand-back ends (or after its time)
//   the sandbox holds   what the person clicks happens inside the run's locked-down browser (sandbox.ts): no other
//                       site, no downloads, no popups, whatever they press
//   nothing recorded    what the person types goes to the page and nowhere else: never logged, never stored
//   no Placetta code    the view is a picture of the page and the person's clicks; the agency's page never runs in
//                       Placetta's origin, and the view sends no cookies (the address is the only key)
//
//   the team's view     a visible CAPTCHA goes to the Placetta team first (run.ts staffFirst): their view of the same
//                       page covers every SSN, card, account and saved-login line and won't let them type in one
//                       (StaffGuard, page.ts staffGuard); if the page can't be covered, they get no picture at all
//
// Tests: worker/filer/test/live.test.ts, worker/filer/test/staff.test.ts.
import { randomBytes } from "node:crypto";

/** What the view needs from the run's page (Playwright's Page has all of it). */
export type LivePage = {
  screenshot(o: { type: "jpeg"; quality: number }): Promise<Uint8Array>;
  mouse: { click(x: number, y: number): Promise<void>; wheel(dx: number, dy: number): Promise<void> };
  keyboard: { type(text: string): Promise<void>; press(key: string): Promise<void> };
  viewportSize(): { width: number; height: number } | null;
  url(): string;
};

/** The team's view: a picture with the owner's lines covered, and whether the line in focus is one of them. */
export type StaffGuard = { shot(): Promise<Uint8Array>; typingBlocked(): Promise<boolean> };

type View = { page: LivePage; until: number; touched: number; done: boolean; host: string; staff?: StaffGuard; note?: string };
export type Reply = { status: number; type: string; body: string | Uint8Array; headers?: Record<string, string> };

/** Keys a person may press in the view: editing and moving between fields, nothing that opens the browser's own tools. */
/** Keys that only move between lines: staff may press these while a covered line has focus, to move off it. */
const MOVE = new Set(["Tab", "Escape", "ArrowUp", "ArrowDown", "PageUp", "PageDown"]);
const KEYS = new Set(["Enter", "Tab", "Backspace", "Delete", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space"]);

export class LiveViews {
  private views = new Map<string, View>();
  private base: string | null;
  private now: () => number;
  constructor(base: string | null, now: () => number = Date.now) { this.base = base; this.now = now; }

  /** Can this worker serve a view? Only with a public https address (Render gives one: RENDER_EXTERNAL_URL). */
  get on(): boolean { return !!this.base && /^https:\/\//.test(this.base); }

  /** A view of this page until ttlMs from now. Null when the worker has no public address. With staff, the team's view. */
  /** note: what the person is asked to do on this page, shown at the top of the view (the hand-back's own words). */
  open(page: LivePage, ttlMs: number, staff?: StaffGuard, note?: string): { token: string; url: string } | null {
    if (!this.on) return null;
    const token = randomBytes(24).toString("base64url");
    let host = ""; try { host = new URL(page.url()).hostname; } catch { /* about:blank */ }
    this.views.set(token, { page, until: this.now() + ttlMs, touched: 0, done: false, host, ...(staff ? { staff } : {}), ...(note ? { note: note.slice(0, 600) } : {}) });
    return { token, url: `${this.base!.replace(/\/+$/, "")}/live/${token}` };
  }
  close(token: string | null | undefined) { if (token) this.views.delete(token); }
  /** The person tapped Done in the view. */
  done(token: string): boolean { return !!this.view(token)?.done; }
  /** When the person last clicked or typed (0: never), so Odelia doesn't take the page back from under their hands. */
  touched(token: string): number { return this.view(token)?.touched ?? 0; }
  get open_count() { this.sweep(); return this.views.size; }

  private view(token: string): View | null {
    const v = this.views.get(token);
    if (!v) return null;
    if (v.until < this.now()) { this.views.delete(token); return null; }
    return v;
  }
  private sweep() { for (const [t, v] of this.views) if (v.until < this.now()) this.views.delete(t); }

  /** One request to /live/... The token is the only key; a wrong or expired one gets the same 404 as no view at all. */
  async handle(method: string, path: string, body: string): Promise<Reply> {
    const m = /^\/live\/([A-Za-z0-9_-]{32})(\/frame\.jpg|\/act|\/done)?$/.exec(path);
    const v = m ? this.view(m[1]) : null;
    if (!m || !v) return text(404, "This live view has ended. Go back to Placetta.");
    const part = m[2] ?? "";
    if (method === "GET" && part === "") return { status: 200, type: "text/html; charset=utf-8", body: page(v.host, !!v.staff, v.note), headers: SECURE };
    if (method === "GET" && part === "/frame.jpg") {
      // the team's picture or none: never the page uncovered
      let img: Uint8Array;
      try { img = v.staff ? await v.staff.shot() : await v.page.screenshot({ type: "jpeg", quality: 70 }); }
      catch { return text(503, "The page can't be shown right now."); }
      return { status: 200, type: "image/jpeg", body: img, headers: { ...SECURE, "Cache-Control": "no-store" } };
    }
    if (method !== "POST") return text(405, "Not allowed.");
    if (part === "/done") { v.done = true; return json({ ok: true }); }
    let a: { kind?: string; x?: number; y?: number; w?: number; h?: number; text?: string; key?: string; dy?: number };
    try { a = JSON.parse(body || "{}"); } catch { return text(400, "Bad request."); }
    v.touched = this.now();
    // staff never type into, or edit, a line that is the owner's
    if (v.staff && (a.kind === "type" || (a.kind === "key" && !MOVE.has(String(a.key)))) && await v.staff.typingBlocked()) {
      return text(403, "That line is the owner's. Only the human check is yours.");
    }
    const vp = v.page.viewportSize() ?? { width: 1280, height: 720 };
    if (a.kind === "click") {
      // the click lands where it was on the picture, scaled to the page's own size
      const fx = Number(a.x) / Math.max(1, Number(a.w) || 1), fy = Number(a.y) / Math.max(1, Number(a.h) || 1);
      if (!(fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)) return text(400, "Bad request.");
      await v.page.mouse.click(Math.round(fx * vp.width), Math.round(fy * vp.height));
    } else if (a.kind === "type") {
      const t = String(a.text ?? "").slice(0, 200);
      if (t) await v.page.keyboard.type(t);
    } else if (a.kind === "key") {
      if (!KEYS.has(String(a.key))) return text(400, "That key isn't available here.");
      await v.page.keyboard.press(a.key === "Space" ? " " : String(a.key));
    } else if (a.kind === "scroll") {
      await v.page.mouse.wheel(0, Math.max(-2000, Math.min(2000, Number(a.dy) || 0)));
    } else return text(400, "Bad request.");
    return json({ ok: true });
  }
}

const SECURE = {
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
};
const text = (status: number, body: string): Reply => ({ status, type: "text/plain; charset=utf-8", body, headers: SECURE });
const json = (o: unknown): Reply => ({ status: 200, type: "application/json", body: JSON.stringify(o), headers: SECURE });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** The view: the page as a picture that refreshes, a box to type into, and Done. */
function page(host: string, staff = false, note?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Placetta live browser</title>
<style>
:root{color-scheme:light dark;--bg:#f6f5f2;--fg:#1d1d1b;--mut:#6b6a66;--line:#d9d7d1;--ink:#1d1d1b;--on:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#eceae4;--mut:#a3a19b;--line:#3a3936;--ink:#eceae4;--on:#161615}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif}
header{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg)}
header b{font-weight:600}header small{color:var(--mut);display:block}
button{font:inherit;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--fg);padding:8px 14px;cursor:pointer}
button.ink{background:var(--ink);color:var(--on);border-color:var(--ink)}
main{padding:12px 16px;max-width:1320px;margin:0 auto}
#shot{width:100%;height:auto;border:1px solid var(--line);border-radius:8px;cursor:crosshair;display:block;background:#fff}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.row input{flex:1;min-width:180px;font:inherit;padding:8px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--fg)}
p{color:var(--mut);margin:6px 0}
</style></head><body>
<header><span><b>${staff ? "Placetta team view" : "Live browser"} on ${esc(host || "the agency's site")}</b><small>${staff ? "Solve the human check only. The owner's numbers and saved login are covered, and you can't type in those lines." : "Click on the page to use it. What you type goes only to the agency's page."}</small></span>
<button class="ink" id="done" type="button">Done, Odelia carries on</button></header>
<main>
${note && !staff ? `<p class="ask" style="color:var(--fg)"><b>${esc(note)}</b></p>` : ""}
<div class="row"><input id="txt" autocomplete="off" placeholder="Type here, then press Send (for a code or a number)"><button id="send" type="button">Send</button>
<button data-key="Tab" type="button">Tab</button><button data-key="Enter" type="button">Enter</button><button data-key="Backspace" type="button">Delete</button>
<button data-scroll="-600" type="button">Scroll up</button><button data-scroll="600" type="button">Scroll down</button></div>
<img id="shot" alt="The agency's page, as it is now">
<p id="msg">${staff ? "Solve the CAPTCHA on the page. Once it's done, Odelia carries on by herself. Opening this view is in the owner's audit trail." : "Solve the CAPTCHA, enter the code, or pay the fee on the page. When you're done, Odelia carries on by herself."}</p>
</main><script src="/live.js"></script></body></html>`;
}

/** The view's script, served from the worker's own origin (the page's CSP allows only 'self'). */
export const LIVE_JS = `(() => {
  const base = location.pathname.replace(/\\/$/, "");
  const shot = document.getElementById("shot"), msg = document.getElementById("msg");
  let busy = false, ended = false;
  const refresh = () => { if (ended) return; const i = new Image(); i.onload = () => { shot.src = i.src; setTimeout(refresh, 700); }; i.onerror = () => { ended = true; msg.textContent = "This live view has ended. Go back to Placetta."; }; i.src = base + "/frame.jpg?t=" + Date.now(); };
  const act = async (a) => { if (busy || ended) return; busy = true; try { const r = await fetch(base + "/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a) }); if (r.status === 404) { ended = true; msg.textContent = "This live view has ended. Go back to Placetta."; } } finally { busy = false; } };
  shot.addEventListener("click", (e) => { const r = shot.getBoundingClientRect(); act({ kind: "click", x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }); });
  document.getElementById("send").addEventListener("click", () => { const t = document.getElementById("txt"); if (t.value) { act({ kind: "type", text: t.value }); t.value = ""; } });
  for (const b of document.querySelectorAll("[data-key]")) b.addEventListener("click", () => act({ kind: "key", key: b.dataset.key }));
  for (const b of document.querySelectorAll("[data-scroll]")) b.addEventListener("click", () => act({ kind: "scroll", dy: Number(b.dataset.scroll) }));
  document.getElementById("done").addEventListener("click", async () => { await fetch(base + "/done", { method: "POST" }); msg.textContent = "Thanks. Odelia carries on; you can close this page."; });
  refresh();
})();`;
