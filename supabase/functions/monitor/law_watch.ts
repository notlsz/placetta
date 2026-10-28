// Law watch in the daily run (src/lawWatch.ts): read the official feeds, queue what's new for the Placetta team, and turn
// what the team approved into one Update per affected business. Nothing read from a feed reaches an owner: only the
// team's own headline and body, with the official source, after they approved it (rule_alert_decide). The Update then
// goes out with the day's others: email unless the owner said not to, a text on a linked phone held for their quiet
// hours (odelia-sms), the team chat on its schedule. The (workspace, dedupe) key on updates keeps each to once.
// All network and database work goes through LawIO, so the rules are tested without either.
import { candidatesFrom, extraFeeds, FEEDS, lawUpdates, parseFeed, type Alert, type Candidate, type Feed, type LawUpdate, type WsLite } from "../../../src/lawWatch.ts";

export type LawIO = {
  fetchText(url: string): Promise<string>;
  /** Queue candidates (rule_alert_report); how many were new. */
  report(c: Candidate[]): Promise<number>;
  /** Changes the team approved recently. */
  approved(): Promise<Alert[]>;
};
export type LawRun = { feeds: number; read: number; queued: number; errors: number; updates: LawUpdate[] };

/** The feeds to read: Placetta's, then any the team added (RULE_FEEDS), each official. */
export const feedsFor = (env: (k: string) => string | undefined): Feed[] => [...FEEDS, ...extraFeeds(env("RULE_FEEDS"))];

export async function lawWatch(o: { io: LawIO; feeds: Feed[]; workspaces: { id: string; state: WsLite }[]; today: string; now: number }): Promise<LawRun> {
  const r: LawRun = { feeds: 0, read: 0, queued: 0, errors: 0, updates: [] };
  const found: Candidate[] = [];
  for (const f of o.feeds) {
    r.feeds++;
    try {
      const items = parseFeed(await o.io.fetchText(f.url));
      r.read += items.length;
      found.push(...candidatesFrom(f, items, o.today));
    } catch (e) { r.errors++; console.error("law feed", f.id, String(e).slice(0, 120)); }
  }
  if (found.length) {
    try { r.queued = await o.io.report(found); } catch (e) { r.errors++; console.error("law report", String(e).slice(0, 120)); }
  }
  try { r.updates = lawUpdates(await o.io.approved(), o.workspaces, o.now); } catch (e) { r.errors++; console.error("law approved", String(e).slice(0, 120)); }
  return r;
}
