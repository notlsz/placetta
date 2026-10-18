import { useEffect, useState, useSyncExternalStore } from "react";
import { B, type Bi } from "./bi";

/* ------------------------------------------------------------------ *
 * The undo window. Devin and Grok act the moment they decide; Placetta
 * waits before anything leaves after an approval, so a slip of the
 * thumb can be taken back. In an account the server holds every filing
 * (SEND_HOLD_MINUTES, 10 by default) and decides Undo against the send
 * under one row lock (supabase/functions/file). What the app sends
 * itself (the sample's filings, a message sent from your own mailbox)
 * waits here, in this tab: if the tab closes before the time is up,
 * nothing is sent and the approval is still there to approve again.
 * ------------------------------------------------------------------ */

/** The app's own window, the same as the server's default. */
export const HOLD_MINUTES = 10;

/** Time left until `until` (an ISO date or epoch ms), never below zero. */
export const timeLeft = (until: string | number, now = Date.now()) => Math.max(0, (typeof until === "string" ? Date.parse(until) : until) - now);

/** "9:58" for a minute or more, "42 s" under a minute (no padded minutes). */
export function clock(ms: number, lang: "en" | "zh"): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return lang === "zh" ? `${s} 秒` : `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Sending in 9:58" and its Chinese. */
export const sendingIn = (ms: number): Bi => B(`Sending in ${clock(ms, "en")}`, `${clock(ms, "zh")}后发送`);

/** A send this tab is holding: the approvals it covers, when it goes, and what sends it. */
export type Hold = { key: string; ids: string[]; app?: string; title: Bi; until: number; go: () => void };

const holds = new Map<string, Hold>();
const timers = new Map<string, number>();
const released = new Set<string>();
const subs = new Set<() => void>();
let snapshot: Hold[] = [];
const changed = () => { snapshot = [...holds.values()]; subs.forEach(f => f()); };

/** Hold a send: `go` runs when the time is up, unless it's undone first. Returns false when these approvals are already
 *  held (a second tap) or when their hold just ended, which lets the send go ahead. */
export function startHold(h: { ids: string[]; app?: string; title: Bi; minutes?: number; go: () => void }): boolean {
  const key = h.ids.join(",");
  if (h.ids.every(id => released.has(id))) { h.ids.forEach(id => released.delete(id)); return false; }
  if (holds.has(key) || h.ids.some(id => holdOf(id))) return true;
  const until = Date.now() + (h.minutes ?? HOLD_MINUTES) * 60_000;
  holds.set(key, { key, ids: h.ids, app: h.app, title: h.title, until, go: h.go });
  timers.set(key, window.setTimeout(() => sendHeld(key), until - Date.now()));
  changed();
  return true;
}

/** End a hold and send now (the time ran out, or "Send now"). */
export function sendHeld(key: string) {
  const h = holds.get(key);
  if (!h) return;
  clearTimeout(timers.get(key)); timers.delete(key); holds.delete(key);
  // one approval's send goes back through the approval, which now lets it pass; a group sends itself
  if (h.ids.length === 1) released.add(h.ids[0]);
  changed();
  h.go();
}

/** Undo: nothing is sent and the approvals stay where they were. False when it already went. */
export function undoHold(key: string): boolean {
  if (!holds.has(key)) return false;
  clearTimeout(timers.get(key)); timers.delete(key); holds.delete(key);
  changed();
  return true;
}

/** The hold covering this approval, if any. */
export const holdOf = (id: string) => snapshot.find(h => h.ids.includes(id));

/** Every hold in this tab, live. */
export function useHolds(): Hold[] {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => snapshot, () => snapshot);
}

/** Re-render once a second while something is counting down. */
export function useTick(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}
