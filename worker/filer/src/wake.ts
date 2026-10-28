// Wake on demand (Render's free plan sleeps a web service after 15 minutes without a request, and the next request
// wakes it in about a minute). When a filing is queued for an agency's website, the file function and its sweep send
// POST /wake to the worker's address (the Supabase secret FILER_URL) with the shared FILER_SECRET in x-filer-secret.
// The request itself is what wakes the container; the endpoint then tells the worker to look for work now and beat at
// once, so the app sees it live. It reads and writes no filing.
//
//   auth        x-filer-secret must equal FILER_SECRET (32+ characters), compared in constant time; without the
//               secret set on the worker the endpoint is off (503), never open
//   rate limit  a fixed window: at most 12 accepted wakes a minute, and wrong or missing secrets have their own
//               budget (20 a minute), so guessing can't use up the server's wakes; past either, 429 with Retry-After
//   nothing     the answer is ok and a count, never a key, a filing or the worker's details
//
// Tests: worker/filer/test/wake.test.ts.
import { createHash, timingSafeEqual } from "node:crypto";

/** A fixed-window counter: at most `max` in each window of `ms`. */
export class Window {
  private start = 0;
  private n = 0;
  private max: number;
  private ms: number;
  private now: () => number;
  constructor(max: number, ms: number, now: () => number = Date.now) { this.max = max; this.ms = ms; this.now = now; }
  /** Take one; false when the window is full. */
  take(): boolean {
    const t = this.now();
    if (t - this.start >= this.ms) { this.start = t; this.n = 0; }
    if (this.n >= this.max) return false;
    this.n++;
    return true;
  }
  /** Seconds until the window opens again. */
  retryAfter(): number { return Math.max(1, Math.ceil((this.start + this.ms - this.now()) / 1000)); }
}

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();
/** The secret matches, in constant time (both sides hashed first, so the lengths never differ). */
export const secretOk = (want: string, got: string | null | undefined) => want.length >= 32 && typeof got === "string" && timingSafeEqual(digest(want), digest(got));

export type WakeReply = { status: number; body: Record<string, unknown>; headers?: Record<string, string> };

export class Waker {
  private good: Window;
  private bad: Window;
  wakes = 0;
  private secret: string;
  private onWake: () => void;
  constructor(secret: string, onWake: () => void, now: () => number = Date.now) {
    this.secret = secret; this.onWake = onWake;
    this.good = new Window(12, 60_000, now);
    this.bad = new Window(20, 60_000, now);
  }
  get on() { return this.secret.length >= 32; }
  handle(method: string, header: string | null | undefined): WakeReply {
    if (method !== "POST") return { status: 405, body: { error: "method" }, headers: { Allow: "POST" } };
    if (!this.on) return { status: 503, body: { error: "not_configured" } };
    if (!secretOk(this.secret, header)) {
      if (!this.bad.take()) return { status: 429, body: { error: "rate_limited" }, headers: { "Retry-After": String(this.bad.retryAfter()) } };
      return { status: 401, body: { error: "unauthorized" } };
    }
    if (!this.good.take()) return { status: 429, body: { error: "rate_limited" }, headers: { "Retry-After": String(this.good.retryAfter()) } };
    this.wakes++;
    try { this.onWake(); } catch { /* the wake is the request itself; a failed nudge changes nothing */ }
    return { status: 202, body: { ok: true, awake: true } };
  }
}
