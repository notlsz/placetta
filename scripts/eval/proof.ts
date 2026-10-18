// Passage-level proof for every plan row of the accuracy sets: each row's source carries a sentence of under 25 words
// read from that official page, and the day it was read; and the read log (scripts/eval/proof-log.json, written by
// scripts/eval/proof-read.py) has the same sentence, from the same URL, found on the fetched page (method "curl", with
// the surrounding text and a hash of the page) or read through WebFetch where the site refuses automated requests.
//
// To refresh the log after changing a proof: `npm run proof:read` (scripts/eval/proof-dump.ts, then proof-read.py).
import LOG from "./proof-log.json";
import type { Application } from "../../src/model";
import type { OfficialForm } from "../../src/forms/registry";

type Entry = { id: string; read: string; quote: string; checked: string; method: "curl" | "webfetch"; found: boolean; note?: string };
const log = LOG as Entry[];
/** Rows whose agency pages couldn't be read at all on 2026-10-18: named, so they fail loudly if more appear. */
export const UNREAD: Record<string, string> = {
  "il-sos": "ilsos.gov timed out for every request (curl over HTTP/1.1 and 2) and WebFetch wasn't permitted for it",
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
export const planRowProof = (a: Application) => proofProblems({ id: a.official ?? a.id, url: a.source.url, quote: a.source.quote, checked: a.source.checked });
export const formProof = (f: OfficialForm) => proofProblems({ id: f.id, url: f.info || f.url, quote: f.proof?.quote, checked: f.proof?.checked });
export const logStats = () => ({ total: log.length, curl: log.filter(e => e.method === "curl" && e.found).length, webfetch: log.filter(e => e.method === "webfetch").length, missing: log.filter(e => !e.found).length });
