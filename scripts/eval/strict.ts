// The accuracy sets' case format, and the evidence rules of the strict set (scripts/eval/strict): every expected answer
// (and every must-not that cites a page) carries the official page's own words (under 40 words), its URL and the day it
// was read, and the strict read log (scripts/eval/strict-log.json, written by `npm run strict:read`) found those words on
// that page. A case whose page couldn't be read isn't in the set at all: it's listed in scripts/eval/strict/README.json.
import LOG from "./strict-log.json";
import type { Level } from "../../src/model";
import { officialSource } from "./official";

export type GoldItem = { key: string; name: string; agency: string; level: Level; levels?: Level[]; required: boolean; verified: boolean; fee: number | null; source: string; match: string; agencyMatch: string; condition?: string; note?: string; quote?: string; read?: string; feeQuote?: string };
export type Gold = {
  id: string; title: string; read: string;
  input: { what: string; where: string; lang: "en" | "zh"; entity?: string; employees?: boolean; buildout?: boolean; signage?: boolean;
    // the intake's answers (src/plan/intake.ts), for the lifecycle set
    intake?: { employees?: boolean; manufactures?: boolean; imports?: boolean; upholstered?: boolean; children?: boolean; online?: boolean } };
  items: GoldItem[]; order: { before: string; after: string; source: string; why: string; verified: boolean; quote?: string; read?: string }[];
  mustNotInclude: { name: string; why: string; match: string; source?: string; quote?: string; read?: string }[];
  // what differs for this kind of food business here (src/forms/kinds.ts): the facts the plan must state, each with the
  // official page's words, URL and read day, and the ones it must not (another kind's, another place's)
  facts?: { key: string; match: string; source: string; quote: string; read: string; required: boolean }[];
  mustNotFacts?: { match: string; why: string }[];
  // beyond the permits (src/plan/also.ts): every line the plan must state, in its group, with the official words where
  // verified (or none where the page couldn't be read), and the lines it must not state
  lifecycle?: { expect: { id: string; group: string; verified: boolean; source: string; quote?: string }[]; mustNot: { id: string; why: string }[] };
};

type Entry = { id: string; read: string; quote: string; checked: string; method: "curl" | "webfetch" | "browser"; found: boolean };
const log = LOG as Entry[];
const words = (s: string) => s.trim().split(/\s+/).length;

/** Every (page, words) pair the strict set cites, for the reader (scripts/eval/strict-dump.ts). */
export function strictQuotes(cases: Gold[]): { id: string; read: string; quote: string }[] {
  const out: { id: string; read: string; quote: string }[] = [];
  for (const g of cases) {
    for (const i of g.items) { if (i.quote) out.push({ id: `${g.id}:${i.key}`, read: i.source, quote: i.quote }); if (i.feeQuote) out.push({ id: `${g.id}:${i.key}:fee`, read: i.source, quote: i.feeQuote }); }
    for (const m of g.mustNotInclude) if (m.quote && m.source) out.push({ id: `${g.id}:not:${m.name}`, read: m.source, quote: m.quote });
    for (const o of g.order) if (o.quote) out.push({ id: `${g.id}:order:${o.before}>${o.after}`, read: o.source, quote: o.quote });
  }
  return out;
}

/** What's wrong with the strict set's evidence: an answer without its words, URL or read day, a page that isn't official,
    words the log didn't find on that page, or an unverified answer (the strict set has none). */
export function strictProblems(cases: Gold[]): string[] {
  const out: string[] = [];
  const found = (url: string, quote: string) => log.find(e => e.read === url && e.quote === quote && e.found);
  for (const g of cases) {
    for (const i of g.items) {
      const at = `${g.id}: ${i.key}`;
      if (!i.verified) out.push(`${at}: unverified (the strict set has no unverified answers)`);
      if (!i.quote) { out.push(`${at}: no quote`); continue; }
      if (!i.read || !/^\d{4}-\d{2}-\d{2}$/.test(i.read)) out.push(`${at}: no read date`);
      if (!officialSource(i.source)) out.push(`${at}: ${i.source} isn't an official page`);
      if (words(i.quote) > 40) out.push(`${at}: quote has ${words(i.quote)} words`);
      if (!found(i.source, i.quote)) out.push(`${at}: the strict read log didn't find "${i.quote.slice(0, 60)}" on ${i.source}`);
      if (i.fee != null && !(i.feeQuote && found(i.source, i.feeQuote))) out.push(`${at}: a fee of ${i.fee} without the page's words for it`);
    }
    for (const m of g.mustNotInclude) if (m.source && !(m.quote && found(m.source, m.quote))) out.push(`${g.id}: must-not "${m.name}" cites ${m.source} without words found there`);
    for (const o of g.order) if (o.verified && !(o.quote && found(o.source, o.quote))) out.push(`${g.id}: order ${o.before} > ${o.after} without words found on ${o.source}`);
  }
  return out;
}
