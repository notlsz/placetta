/* ------------------------------------------------------------------ *
 * The human check on sign-in and sign-up: Cloudflare Turnstile.
 *
 * Every way into Odelia's credits, emails and text messages starts with a Supabase Auth call (a code by email or text,
 * a password sign-in, an account, a reset link). Supabase checks a Turnstile token on those calls itself once CAPTCHA
 * protection is on in its dashboard (Authentication, Bot and Abuse Protection). This module gets the token in the
 * browser; the secret lives only in Supabase.
 *
 * Off until VITE_TURNSTILE_SITE_KEY is set: no script loads and every call goes out exactly as before. With the key,
 * the widget is rendered once, invisible unless Cloudflare wants an interaction (then a small box appears at the
 * bottom of the screen), and run ahead while the person types, so the token is usually ready when they press the
 * button. A token is single-use and lives 300 seconds, so each one is used once and the widget is reset.
 *
 * Mainland China: Turnstile isn't blocked there but loads slowly and fails more often. A token that hasn't come after
 * WAIT_MS is given up on and the call goes out without one; Supabase then answers "captcha failed" if protection is on,
 * and the sign-in screen says so in both languages with a way to reach Placetta (SETUP.md, "Human check").
 * ------------------------------------------------------------------ */

export const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long a sign-in waits for a token before going out without one. */
export const WAIT_MS = 20_000;
/** A token is good for 300 seconds; one older than this is replaced before use. */
const FRESH_MS = 270_000;

export type Action = "signin" | "signup" | "code" | "phone" | "reset";

type Widget = { render(el: HTMLElement, o: Record<string, unknown>): string; execute(id: string): void; reset(id: string): void; remove?(id: string): void };
type Env = { siteKey: string; doc?: Document; win?: Window & { turnstile?: Widget }; now?: () => number; wait?: number };

let env: Env = { siteKey: ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_TURNSTILE_SITE_KEY ?? "").trim() };
let loading: Promise<Widget | null> | null = null;
let widget: { id: string; t: Widget } | null = null;
let ready: { token: string; at: number } | null = null;
let waiting: ((t: string | null) => void)[] = [];
let failures = 0;
/** Cloudflare is showing its box and waiting for a click: no deadline runs out and nothing resets it meanwhile. */
let interactive = false;
/** A check is under way (executed, no answer yet): a second request joins it instead of resetting it. */
let pending = false;

/** For tests: swap the key, the document and the clock, and forget everything loaded. */
export function configureHuman(e: Env) { env = e; loading = null; widget = null; ready = null; waiting = []; failures = 0; interactive = false; pending = false; }
/** True while Cloudflare's box is on screen waiting for the person (the sign-in screen says "tick the box below"). */
export const humanWaiting = () => interactive;
/** True when a site key is set, so tokens are asked for. */
export const humanCheckOn = () => !!env.siteKey;
/** How many times a token couldn't be had (script blocked, Cloudflare unreachable, an error): for the sign-in screen. */
export const humanFailures = () => failures;

const now = () => (env.now ?? Date.now)();
const doc = () => env.doc ?? (typeof document === "undefined" ? undefined : document);
const win = () => env.win ?? (typeof window === "undefined" ? undefined : (window as Window & { turnstile?: Widget }));
const lang = () => { const l = (doc()?.documentElement.lang || "").toLowerCase(); return l.startsWith("zh") ? "zh-cn" : "en"; };

function settle(t: string | null) { const w = waiting; waiting = []; for (const f of w) f(t); }

function load(): Promise<Widget | null> {
  if (loading) return loading;
  loading = new Promise<Widget | null>(resolve => {
    const d = doc(), w = win();
    if (!d || !w) return resolve(null);
    if (w.turnstile) return resolve(w.turnstile);
    const s = d.createElement("script");
    s.src = TURNSTILE_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(w.turnstile ?? null);
    s.onerror = () => resolve(null);
    d.head.appendChild(s);
  }).then(t => { if (!t) { loading = null; failures++; } return t; });
  return loading;
}

async function mount(): Promise<{ id: string; t: Widget } | null> {
  if (widget) return widget;
  const t = await load(), d = doc();
  if (!t || !d) return null;
  let box = d.getElementById("pc-human");
  if (!box) {
    box = d.createElement("div");
    box.id = "pc-human";
    // only visible when Cloudflare asks for a click; then it sits at the bottom, above everything, on any screen size
    box.setAttribute("style", "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px)");
    d.body.appendChild(box);
  }
  try {
    const id = t.render(box, {
      sitekey: env.siteKey, action: "auth", appearance: "interaction-only", execution: "execute", size: "flexible",
      language: lang(), "refresh-expired": "manual", retry: "auto",
      callback: (token: string) => { pending = false; interactive = false; ready = { token, at: now() }; settle(token); },
      "error-callback": () => { pending = false; interactive = false; failures++; settle(null); return true; },
      "expired-callback": () => { ready = null; },
      "timeout-callback": () => { pending = false; interactive = false; failures++; settle(null); },
      "before-interactive-callback": () => { interactive = true; },
      "after-interactive-callback": () => { interactive = false; },
    });
    widget = { id, t };
    return widget;
  } catch { failures++; return null; }
}

/** Load and run the check ahead of time (the sign-in screen calls this when it opens). Does nothing when off. */
export function prepareHuman() { if (humanCheckOn()) void token(false); }

async function token(take: boolean): Promise<string | undefined> {
  if (ready && now() - ready.at < FRESH_MS) {
    const t = ready.token;
    if (take) { ready = null; if (widget) { try { widget.t.reset(widget.id); } catch { /* gone */ } } }
    return t;
  }
  ready = null;
  const w = await mount();
  if (!w) return undefined;
  const got = new Promise<string | null>(resolve => {
    let done = false;
    const once = (t: string | null) => { if (!done) { done = true; resolve(t); } };
    waiting.push(once);
    // the deadline doesn't run out while Cloudflare's box waits for the person (up to the token's own life)
    const started = now();
    const tick = () => {
      if (done) return;
      if (interactive && now() - started < FRESH_MS) { setTimeout(tick, 1000); return; }
      failures++; waiting = waiting.filter(f => f !== once); once(null);
    };
    setTimeout(tick, env.wait ?? WAIT_MS);
  });
  // start a check only when none is under way: resetting one would wipe the box the person is about to tick
  if (!pending) { try { pending = true; w.t.reset(w.id); w.t.execute(w.id); } catch { pending = false; failures++; settle(null); } }
  const t = await got;
  if (!t) return undefined;
  if (take) { ready = null; try { w.t.reset(w.id); } catch { /* gone */ } }
  return t;
}

/** A fresh token for one Supabase Auth call, or undefined when the check is off or Cloudflare couldn't be reached. */
export async function humanToken(_action: Action): Promise<string | undefined> {
  if (!humanCheckOn()) return undefined;
  return token(true);
}

/** Supabase's answer when CAPTCHA protection is on and the token was missing, used or wrong. */
export const isCaptchaError = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "captcha_failed" || /captcha/i.test(e.message ?? ""));
