// Passage-level proof for every plan row of the accuracy sets: each row's source carries a sentence of under 25 words
// read from that official page, and the day it was read; and the read log (scripts/eval/proof-log.json, written by
// scripts/eval/proof-read.py) has the same sentence, from the same URL, found on the fetched page (method "curl", with
// the surrounding text and a hash of the page) or read through WebFetch where the site refuses automated requests.
//
// To refresh the log after changing a proof: `npm run proof:read` (scripts/eval/proof-dump.ts, then proof-read.py).
import LOG from "./proof-log.json";
import type { Application } from "../../src/model";
import { formById, type OfficialForm } from "../../src/forms/registry";
import { MAX_PROOF_AGE, proofCurrent } from "../../src/plan/ask";
import { officialSource } from "./official";

type Entry = { id: string; read: string; quote: string; checked: string; method: "curl" | "webfetch"; found: boolean; note?: string };
const log = LOG as Entry[];
/** Rows whose agency pages couldn't be read at all on 2026-10-18: named, so they fail loudly if more appear. */
export const UNREAD: Record<string, string> = {
  // il-sos was here until 2026-10-22: its proof is now read from the Illinois Department of Commerce's handbook
};
const words = (s: string) => s.trim().split(/\s+/).length;

/** The proof problems of one row: a plan row (Application) or a library form. */
export function proofProblems(row: { id: string; url: string; quote?: string; checked?: string }): string[] {
  if (UNREAD[row.id]) return [];
  const out: string[] = [];
  if (!row.quote) return [`${row.id}: no quote on ${row.url}`];
  if (!row.checked || !/^\d{4}-\d{2}-\d{2}$/.test(row.checked)) out.push(`${row.id}: no date read`);
  if (words(row.quote) >= 25) out.push(`${row.id}: quote has ${words(row.quote)} words`);
  const e = log.find(x => x.read === row.url && x.quote === row.quote);
  if (!e) out.push(`${row.id}: the read log has no fetch of ${row.url} with this quote`);
  else if (!e.found) out.push(`${row.id}: the quote wasn't on the page fetched (${e.note ?? ""})`);
  return out;
}
/** A plan row fails closed: a claim carries its quote, seen on its page within MAX_PROOF_AGE days (src/plan/ask.ts) and
    in the read log; an abstention claims nothing (no fee, no time, "We'll confirm with" whom) and links an official page. */
export function planRowProof(a: Application, today: string): string[] {
  const id = a.official ?? a.id;
  if (a.abstain) {
    const out: string[] = [];
    if (!officialSource(a.source.url)) out.push(`${id}: abstains but its link isn't an official page (${a.source.url})`);
    if (!/We'll confirm with \S/.test(a.name.en) || !/我们会向.+核实/.test(a.name.zh)) out.push(`${id}: abstains without naming who to ask`);
    if (a.fees.some(f => !f.tbd || f.amount)) out.push(`${id}: abstains but states a fee`);
    if (a.source.quote) out.push(`${id}: abstains but shows a quote as if it claimed`);
    return out;
  }
  if (UNREAD[id]) return [`${id}: claims with no page read (${UNREAD[id]})`];
  const out = proofProblems({ id, url: a.source.url, quote: a.source.quote, checked: a.source.checked });
  if (!officialSource(a.source.url)) out.push(`${id}: claims from a page that isn't official (${a.source.url})`);
  if (a.source.quote && !proofCurrent({ read: a.source.url, quote: a.source.quote }, today) && !proofCurrent(formById(a.official ?? "")?.proof, today)) out.push(`${id}: its quote wasn't seen on the page within ${MAX_PROOF_AGE} days`);
  return out;
}
export const formProof = (f: OfficialForm) => proofProblems({ id: f.id, url: f.info || f.url, quote: f.proof?.quote, checked: f.proof?.checked });
export const logStats = () => ({ total: log.length, curl: log.filter(e => e.method === "curl" && e.found).length, webfetch: log.filter(e => e.method === "webfetch").length, missing: log.filter(e => !e.found).length });
