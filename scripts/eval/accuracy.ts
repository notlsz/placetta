// Ground-truth accuracy for Odelia's permit plans: 30 store openings (scripts/eval/gold/*.json, in-sample: the library
// was fixed against them) and 25 held-out openings in other cities (scripts/eval/heldout/*.json, researched and scored
// before any fix for them), each researched from the agencies' own pages, scored against the two deterministic paths
// that build plans:
//   instant plan   src/plan/preview.ts previewPlan: the app's first screen, a first text to Odelia (agent-run's
//                  text start, via src/plan/start.ts) and the partner API all build the plan with it
//   library        src/forms/registry.ts formsFor: what agent-run's find_official_forms tool returns for the business
//                  and place (src/live.ts), with the needs the model passes for the case
// No model is called. Only verified gold items count toward the scores; unverified ones are listed and set aside.
// Rows fail closed (src/plan/ask.ts): a row claims a requirement only with a current quote from an official page, and
// otherwise abstains, naming who to ask. An abstention never counts as finding an item.
//
//   recall      required gold items the plan claims
//   covered     required gold items the plan claims, or abstains on while naming the office that decides them (with
//               that office's link): what's left is silently missing, the failure that costs an opening
//   precision   plan rows that claim and are right for this opening (a required or conditional gold item), over every
//               claiming row that isn't an unverified item; a row that matches nothing is invented, one on the case's
//               must-not list is wrong (an abstention on the must-not list is wrong too)
//   agency      found items filed with the right agency
//   level       found items at the right level (federal, state, county, city)
//   order       gold order constraints (both steps in the plan) that the plan's order keeps
//   source      plan rows with an official source link
//   fee         found items whose published gold fee the plan states
//
// npm run test:accuracy                the tables, totals and every miss, wrong row and broken order; exit 1 below the
//                                      targets (all 100%), then the fail-closed checks (scripts/eval/failclosed.ts)
// QUIET=1 npm run test:accuracy        the tables and totals only
// GENERAL_ONLY=1 npm run test:accuracy the held-out set with its city entries removed: recall reported, coverage 100%
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { libraryAnswer, previewPlan, sellsAlcohol } from "../../src/plan/preview";
import { proofCurrent } from "../../src/plan/ask";
import { FORMS, formsFor, segmentOf } from "../../src/forms/registry";
import { furnitureNeeds } from "../../src/forms/furniture";
import { sectorNeeds } from "../../src/forms/sectors";
import { FURNITURE_KINDS, SECTOR_KINDS } from "../../src/forms/kinds";
import type { Application, Level } from "../../src/model";
import { answerChecks } from "./answers";
import { officialSource } from "./official";
import { UNREAD, formProof, logStats, planRowProof, proofProblems } from "./proof";
import { MAX_PROOF_AGE } from "../../src/plan/ask";
import { strictProblems } from "./strict";
import { failClosedChecks } from "./failclosed";
import { entityChecks } from "./entity";

import type { Gold } from "./strict";
type Row = { id: string; name: string; agency: string; level: Level; source?: string; fee: number | null; abstain: boolean; quote?: string };

const here = dirname(fileURLToPath(import.meta.url));
const setDir = (name: string) => [join(here, name), join(process.cwd(), "scripts/eval", name)].find(d => { try { return readdirSync(d).length > 0; } catch { return false; } })!;
// ONLY=<regex> scores the cases whose id matches (e.g. ONLY='brooklyn|sandiego')
const load = (name: string): Gold[] => { const d = setDir(name); if (!d) return []; return readdirSync(d).filter(f => f.endsWith(".json") && f !== "README.json").sort().map(f => JSON.parse(readFileSync(join(d, f), "utf8")) as Gold).filter(g => !process.env.ONLY || new RegExp(process.env.ONLY).test(g.id)); };
// gold: the 30 openings the library was fixed against (in-sample). heldout: 33 openings in other cities, researched
// before any fix for them (scripts/eval/heldout). strict: the top 15 cities and top 15 states for Chinese brands, every
// expected answer quoted from its official page (scripts/eval/strict). SET=gold, heldout or strict scores one; all three
// by default, and only the held-out set with GENERAL_ONLY.
// kinds: the same place opened as a different kind of food business (a bubble tea shop and a restaurant on one Flushing
// street, a bakery at the San Gabriel restaurant's address), scored on the filings and on what differs by kind
// (scripts/eval/kinds, src/forms/kinds.ts).
// world: store openings abroad (src/forms/europe.ts, src/forms/mexico.ts), each answer quoted in the agency's language.
// furniture: furniture brands importing and opening showrooms (an upholstered brand into Los Angeles, a dresser brand
// into New Jersey), scored on the filings (src/forms/furniture.ts) and on what the plan states beyond them.
// lifecycle: five openings scored on their permits and on what the plan says beyond them (scripts/eval/lifecycle,
// src/forms/lifecycle.ts, src/plan/also.ts), with the intake's answers.
// sectors: the landing page's other sectors (scripts/eval/sectors, src/forms/sectors.ts): a nail salon in Los Angeles,
// an import warehouse in Houston, an auto repair shop in San José, a medical device importer in New York City and a tech
// office in San Francisco.
const SETS = (process.env.SET ? [process.env.SET] : process.env.GENERAL_ONLY ? ["heldout"] : ["gold", "heldout", "strict", "kinds", "furniture", "world", "lifecycle", "sectors"]).map(name => ({ name, cases: load(name) }));
// npm passes its own arguments after the script's "exit", so the quiet mode is an environment variable: QUIET=1
const showMisses = !process.env.QUIET;
/** A row that hedges whether the requirement applies ("if the city requires one", "We'll confirm with ...") asserts
    nothing: it never counts as finding a required item, and it is set aside rather than scored right or wrong. */
const HEDGE = /if (the|your) city requires|if one is required|we'll confirm|we will confirm|如所在城市要求|我们会向/i;
// GENERAL_ONLY=1: drop the city entries added for the held-out cities (src/forms/beachhead.ts), so the held-out score
// shows what the state and county layers and the named-agency fallbacks get right on their own
const HELDOUT_CITIES = new Set(["FRE", "CUP", "MIL", "DLY", "ARC", "ALH", "TOR", "FTL", "SUG", "DUL", "HEN", "BEL", "QCY", "ROC", "GLN", "SMO", "SGB"]);
const GENERAL = !!process.env.GENERAL_ONLY;
if (GENERAL) for (let k = FORMS.length - 1; k >= 0; k--) if (HELDOUT_CITIES.has(FORMS[k].where)) FORMS.splice(k, 1);
const TODAY = "2026-10-18", OPENING = "2027-04-01";
// Every target is 100%: a plan row is right, filed with the right agency at the right level, in the agencies' order,
// linked to an official page, with the published fee; and every required item is found, or (covered) at least never
// silently missing: a row abstains for it and names the right office. With GENERAL_ONLY the city entries are gone, so
// recall is reported, not targeted: what can't be claimed must be covered by an abstention instead.
const TARGET: Record<keyof Totals, number> = { recall: GENERAL ? 0 : 1, covered: 1, precision: 1, agency: 1, level: 1, order: 1, source: 1, fee: 1 };

/* ------------------------------------------------------------------ the two paths */

const fee = (a: Application) => a.fees.some(f => f.tbd) ? null : a.fees.reduce((s, f) => s + f.amount, 0);
const rowOfApp = (a: Application, id = a.official ?? a.id): Row => ({ id, name: a.name.en, agency: a.agency.en, level: a.level, source: a.source?.url, fee: fee(a), abstain: !!a.abstain, quote: a.source?.quote });

/** The instant plan for a case, with the intake's answers where the case gives them. */
const planOf = (g: Gold) => { const i = g.input; return previewPlan(i.what, i.where, OPENING, { entity: i.entity, employees: i.intake?.employees ?? i.employees, buildout: i.buildout, signage: i.signage, today: TODAY, ...(i.intake ?? {}) }); };
function instantPlan(g: Gold): Row[] {
  return planOf(g).apps.map(a => rowOfApp(a));
}

/** What find_official_forms returns (src/live.ts), with the flags the model sets for this case: the library's forms, each
    claimed or not (libraryAnswer), and the local steps the library has no form for. */
function library(g: Gold): Row[] {
  const i = g.input, segment = segmentOf(i.what);
  // the flags the model sets, read the way the instant plan reads them ("noodle bar" isn't a bar that serves alcohol)
  const imports = i.intake?.imports ?? /import|进口/i.test(i.what), alcohol = sellsAlcohol(i.what);
  const needs = { employees: i.intake?.employees ?? i.employees ?? true, buildout: i.buildout ?? true, signage: i.signage ?? true, newEntity: !i.entity, food: segment === "restaurant" || /food|snack|食品/i.test(i.what), imports, alcohol, ...furnitureNeeds(i.what), ...sectorNeeds(i.what),
    ...(i.intake?.upholstered !== undefined ? { upholstered: i.intake.upholstered } : {}), ...(i.intake?.children !== undefined ? { children: i.intake.children } : {}) };
  const known = libraryAnswer(i.what, i.where, needs, TODAY);
  const forms = formsFor({ segment, where: i.where, needs }).filter(f => f.order < 88).map(f => {
    const claim = known.claim(f), seen = f.proof ? proofCurrent(f.proof, TODAY) : undefined;
    return { id: f.id, name: claim ? f.title.en : `${f.title.en}: We'll confirm with ${f.agency.en}`, agency: f.agency.en, level: f.level, source: f.info || f.url, fee: claim ? f.fee : null, abstain: !claim, quote: claim && seen ? f.proof!.quote : undefined };
  });
  return [...forms, ...known.steps.map(a => rowOfApp(a))];
}

/* ------------------------------------------------------------------ scoring */

type Score = {
  id: string; req: number; found: number; covered: number; rows: number; correct: number; wrong: number; invented: number; setAside: number;
  agencyOk: number; levelOk: number; orderOk: number; orderN: number; sourced: number; feeOk: number; feeN: number;
  misses: string[]; abstained: string[]; misrouted: string[]; wrongRows: string[]; agencyMiss: string[]; levelMiss: string[]; orderMiss: string[]; unsourced: string[]; feeMiss: string[]; hedged: string[];
};
const text = (r: Row) => `${r.name} | ${r.agency} | ${r.id}`;
const re = (s: string) => new RegExp(s, "i");
/** A row that claims nothing: it abstains (src/plan/ask.ts) or hedges in words. */
const asks = (r: Row) => r.abstain || HEDGE.test(r.name);

function score(g: Gold, rows: Row[]): Score {
  const s: Score = { id: g.id, req: 0, found: 0, covered: 0, rows: rows.length, correct: 0, wrong: 0, invented: 0, setAside: 0, agencyOk: 0, levelOk: 0, orderOk: 0, orderN: 0, sourced: 0, feeOk: 0, feeN: 0,
    misses: [], abstained: [], misrouted: [], wrongRows: [], agencyMiss: [], levelMiss: [], orderMiss: [], unsourced: [], feeMiss: [], hedged: [] };
  // each gold item's row: the first claim that matches it and its agency, else the first claim that matches it
  const rowOf = new Map<string, number>();
  for (const it of g.items) {
    const hits = rows.map((r, k) => [r, k] as const).filter(([r]) => !asks(r) && re(it.match).test(text(r)));
    const best = hits.find(([r]) => re(it.agencyMatch).test(r.agency)) ?? hits[0];
    if (best) rowOf.set(it.key, best[1]);
  }
  for (const it of g.items.filter(x => x.verified)) {
    const k = rowOf.get(it.key);
    if (it.required) {
      s.req++;
      if (k !== undefined) { s.found++; s.covered++; }
      else {
        // not claimed: covered when a row abstains for it and names the office that decides it; an abstention that names
        // another office leaves the person asking the wrong place, so it doesn't count
        const ask = rows.filter(r => asks(r) && re(it.match).test(text(r)));
        const right = ask.find(r => re(it.agencyMatch).test(r.agency));
        if (right) { s.covered++; s.abstained.push(`${it.name}: asks ${right.agency} (${right.source ?? "no link"})`); }
        else if (ask.length) s.misrouted.push(`${it.name} (${it.agency}): the row asks ${ask[0].agency}`);
        else s.misses.push(`${it.name} (${it.agency})`);
      }
    }
    if (k === undefined) continue;
    const r = rows[k];
    if (re(it.agencyMatch).test(r.agency)) s.agencyOk++; else s.agencyMiss.push(`${it.name}: plan says "${r.agency}", should be ${it.agency}`);
    if ((it.levels ?? [it.level]).includes(r.level)) s.levelOk++; else s.levelMiss.push(`${it.name}: plan says ${r.level}, should be ${it.level}`);
    if (it.fee != null) { s.feeN++; if (r.fee === it.fee) s.feeOk++; else s.feeMiss.push(`${it.name}: plan says ${r.fee ?? "varies"}, published ${it.fee}`); }
  }
  rows.forEach(r => {
    if (officialSource(r.source)) s.sourced++; else s.unsourced.push(`${r.name}: ${r.source ?? "no link"}`);
    const bad = g.mustNotInclude.find(m => re(m.match).test(text(r)));
    // an abstention for a step that doesn't apply still sends the person to ask about it: it's wrong too
    if (bad) { s.wrong++; s.wrongRows.push(`${r.name} (${r.agency}): ${bad.why}`); return; }
    if (asks(r)) { s.setAside++; s.hedged.push(`${r.name} (${r.agency})`); return; }
    // a row is right when it names a gold item and is filed with that item's agency; the right permit with another
    // place's agency (Los Angeles County's plan check for a San José store) is a wrong row, not a right one
    const named = g.items.filter(it => re(it.match).test(text(r)));
    if (!named.length) { s.invented++; s.wrongRows.push(`${r.name} (${r.agency}): not a requirement for this opening`); return; }
    const items = named.filter(it => re(it.agencyMatch).test(r.agency));
    if (!items.length) {
      if (named.every(it => !it.verified)) { s.setAside++; return; }
      s.wrong++; s.wrongRows.push(`${r.name} (${r.agency}): the requirement is ${named[0].name} with ${named[0].agency}`); return;
    }
    if (items.some(it => it.verified)) s.correct++; else s.setAside++;
  });
  for (const o of g.order.filter(x => x.verified)) {
    const a = rowOf.get(o.before), b = rowOf.get(o.after);
    if (a === undefined || b === undefined || a === b) continue;
    s.orderN++;
    if (a < b) s.orderOk++; else s.orderMiss.push(`${rows[b].name} comes before ${rows[a].name}: ${o.why}`);
  }
  return s;
}

/* ------------------------------------------------------------------ report */

const pct = (n: number, d: number) => (d ? (100 * n / d).toFixed(1) + "%" : "n/a");
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

type Totals = { recall: number; covered: number; precision: number; agency: number; level: number; order: number; source: number; fee: number };
function report(title: string, scores: Score[]): Totals {
  console.log(`\n${title}\n`);
  console.log(`${pad("case", 26)}${lpad("recall", 13)}${lpad("covered", 9)}${lpad("precision", 14)}${lpad("agency", 10)}${lpad("level", 10)}${lpad("order", 9)}${lpad("source", 10)}${lpad("fee", 8)}`);
  for (const s of scores) {
    console.log(`${pad(s.id, 26)}${lpad(`${s.found}/${s.req}`, 7)}${lpad(pct(s.found, s.req), 7)}${lpad(pct(s.covered, s.req), 9)}${lpad(`${s.correct}/${s.correct + s.wrong + s.invented}`, 7)}${lpad(pct(s.correct, s.correct + s.wrong + s.invented), 7)}`
      + `${lpad(pct(s.agencyOk, s.agencyOk + s.agencyMiss.length), 10)}${lpad(pct(s.levelOk, s.levelOk + s.levelMiss.length), 10)}${lpad(s.orderN ? `${s.orderOk}/${s.orderN}` : "-", 9)}${lpad(pct(s.sourced, s.rows), 10)}${lpad(s.feeN ? `${s.feeOk}/${s.feeN}` : "-", 8)}`);
  }
  const sum = (f: (s: Score) => number) => scores.reduce((t, s) => t + f(s), 0);
  const ratio = (n: number, d: number) => (d ? n / d : 1);
  const t: Totals = {
    recall: ratio(sum(s => s.found), sum(s => s.req)),
    covered: ratio(sum(s => s.covered), sum(s => s.req)),
    precision: ratio(sum(s => s.correct), sum(s => s.correct + s.wrong + s.invented)),
    agency: ratio(sum(s => s.agencyOk), sum(s => s.agencyOk + s.agencyMiss.length)),
    level: ratio(sum(s => s.levelOk), sum(s => s.levelOk + s.levelMiss.length)),
    order: ratio(sum(s => s.orderOk), sum(s => s.orderN)),
    source: ratio(sum(s => s.sourced), sum(s => s.rows)),
    fee: ratio(sum(s => s.feeOk), sum(s => s.feeN)),
  };
  console.log(`${"-".repeat(110)}`);
  console.log(`${pad("TOTAL", 26)}${lpad(`${sum(s => s.found)}/${sum(s => s.req)}`, 7)}${lpad(pct(sum(s => s.found), sum(s => s.req)), 7)}${lpad((100 * t.covered).toFixed(1) + "%", 9)}${lpad(`${sum(s => s.correct)}/${sum(s => s.correct + s.wrong + s.invented)}`, 7)}${lpad((100 * t.precision).toFixed(1) + "%", 7)}`
    + `${lpad((100 * t.agency).toFixed(1) + "%", 10)}${lpad((100 * t.level).toFixed(1) + "%", 10)}${lpad(`${sum(s => s.orderOk)}/${sum(s => s.orderN)}`, 9)}${lpad((100 * t.source).toFixed(1) + "%", 10)}${lpad(`${sum(s => s.feeOk)}/${sum(s => s.feeN)}`, 8)}`);
  console.log(`  required items not claimed but covered by an abstention naming the right office: ${sum(s => s.abstained.length)}; abstentions naming the wrong office: ${sum(s => s.misrouted.length)}; silently missing: ${sum(s => s.misses.length)}`);
  console.log(`  rows set aside (match only an unverified gold item, or abstain): ${sum(s => s.setAside)} (${sum(s => s.hedged.length)} abstain); wrong-jurisdiction or must-not rows: ${sum(s => s.wrong)}; invented rows: ${sum(s => s.invented)}`);
  if (showMisses) for (const s of scores) {
    const lines = [...s.misses.map(m => `missing   ${m}`), ...s.misrouted.map(m => `misrouted ${m}`), ...s.abstained.map(m => `abstained ${m}`), ...s.wrongRows.map(m => `wrong     ${m}`), ...s.agencyMiss.map(m => `agency    ${m}`), ...s.levelMiss.map(m => `level     ${m}`),
      ...s.orderMiss.map(m => `order     ${m}`), ...s.unsourced.map(m => `source    ${m}`), ...s.feeMiss.map(m => `fee       ${m}`)];
    if (lines.length) console.log(`\n  ${s.id}\n    ${lines.join("\n    ")}`);
  }
  return t;
}

const fails: string[] = [];
// passage-level proof, fail closed: every row of both paths, in every case of the sets scored, either claims (a quote,
// the day it was last seen on its page within MAX_PROOF_AGE, and the read log has that quote from that page) or
// abstains (claims no fee, names who to ask, links an official page) (scripts/eval/proof.ts)
{
  const problems = new Set<string>(); let rowsChecked = 0, claims = 0, abstentions = 0;
  for (const { cases } of SETS) for (const g of cases) {
    const i = g.input;
    const p = planOf(g);
    for (const a of p.apps) { rowsChecked++; if (a.abstain) abstentions++; else claims++; for (const x of planRowProof(a, TODAY)) problems.add(`${g.id}: ${x}`); }
    // what differs by kind of business: every fact the plan states carries its quote, in the read log, from an official page
    for (const k of p.facts) { rowsChecked++; claims++; for (const x of [...proofProblems({ id: k.id, url: k.source.url, quote: k.source.quote, checked: k.source.checked }), ...(officialSource(k.source.url) ? [] : [`${k.id}: not an official page`])]) problems.add(`${g.id} (fact): ${x}`); }
    for (const r of library(g)) { rowsChecked++; const f = FORMS.find(x => x.id === r.id); if (f && !r.abstain) for (const x of formProof(f)) problems.add(`${g.id} (library): ${x}`); }
  }
  const st = logStats();
  console.log(`\nPassage-level proof: ${rowsChecked} rows checked (instant plan: ${claims} claims, each quoted from its page and seen within ${MAX_PROOF_AGE} days; ${abstentions} abstentions naming who to ask); read log ${st.total} entries (${st.curl} read with curl, ${st.webfetch} read with WebFetch, ${st.browser} read in a browser, ${st.missing} not found); unread: ${Object.keys(UNREAD).join(", ") || "none"}`);
  if (problems.size) { console.log(`  ${[...problems].slice(0, 40).join("\n  ")}`); fails.push(`proof: ${problems.size} row problems`); }
}

// the stricter set: every expected answer carries the official page's own words, its URL and the day it was read, and
// the strict read log (scripts/eval/strict-log.json, `npm run strict:read`) found those words on that page
for (const { name: set, cases } of SETS.filter(s => s.name === "strict")) {
  const problems = strictProblems(cases);
  console.log(`\nStrict set evidence: ${cases.reduce((t, g) => t + g.items.length + g.mustNotInclude.length, 0)} expected answers and must-nots, ${new Set(cases.flatMap(g => g.items.map(i => i.source))).size} official pages; ${problems.length} problems`);
  if (problems.length) { console.log(`  ${problems.slice(0, 40).join("\n  ")}`); fails.push(`${set} evidence: ${problems.length} problems`); }
}

const TITLE: Record<string, string> = {
  gold: "Gold set (in-sample: the library was fixed against it)", heldout: GENERAL ? "Held-out set, city entries removed (GENERAL_ONLY)" : "Held-out set (scripts/eval/heldout)",
  strict: "Strict set (scripts/eval/strict: top cities and states, every answer quoted from its official page)",
  kinds: "Store-type set (scripts/eval/kinds: the same place as a tea shop, coffee shop, bakery or restaurant)",
  furniture: "Furniture set (scripts/eval/furniture: furniture brands importing and opening showrooms)",
  world: "World set (scripts/eval/world: store openings in Europe and Mexico, quoted in the agencies' own languages)",
  lifecycle: "Lifecycle set (scripts/eval/lifecycle: the permits, and what the plan says beyond them)",
};

/* ------------------------------------------------------------------ beyond the permits */
// Each lifecycle case: the plan states every expected line in its group (recall), with the official words and URL the
// case names where verified, or abstains (no quote) where the case says the page couldn't be read; states no line the
// case doesn't expect (precision) and none on its must-not list; and every quoted line's words are in the read log, from
// an official page. Targets: 100%.
const lifeTotals = { want: 0, found: 0, stated: 0, right: 0 };
for (const { name: set, cases } of SETS) for (const g of cases.filter(x => x.lifecycle)) {
  const p = planOf(g), lc = g.lifecycle!;
  const miss: string[] = [], bad: string[] = [];
  for (const w of lc.expect) {
    lifeTotals.want++;
    const hit = p.also.find(a => a.id === w.id);
    if (!hit) { miss.push(`missing ${w.id}`); continue; }
    if (hit.group !== w.group) { miss.push(`${w.id}: in ${hit.group}, the case puts it in ${w.group}`); continue; }
    if (hit.verified !== w.verified || hit.sources[0].url !== w.source || (w.verified && hit.sources[0].quote !== w.quote)) { miss.push(`${w.id}: quoted from ${hit.sources[0].url} ("${hit.sources[0].quote ?? "no quote"}"), the case reads ${w.source}`); continue; }
    lifeTotals.found++;
  }
  for (const a of p.also) {
    lifeTotals.stated++;
    const no = lc.mustNot.find(m => m.id === a.id);
    if (no) { bad.push(`wrong ${a.id}: ${no.why}`); continue; }
    if (!lc.expect.some(w => w.id === a.id)) { bad.push(`invented ${a.id}`); continue; }
    const problems = a.sources.flatMap(x => x.quote ? [...proofProblems({ id: a.id, url: x.url, quote: x.quote, checked: x.read }), ...(officialSource(x.url) ? [] : [`${a.id}: not an official page`])] : officialSource(x.url) ? [] : [`${a.id}: abstains without an official link`]);
    if (problems.length) { bad.push(...problems); continue; }
    if (!a.verified && a.fee != null) { bad.push(`${a.id}: states a fee without a quote`); continue; }
    lifeTotals.right++;
  }
  if (miss.length || bad.length) { fails.push(`${set} ${g.id} beyond the permits: ${[...miss, ...bad].join("; ")}`); console.log(`  ${set} ${g.id} (beyond the permits): ${[...miss, ...bad].join("; ")}`); }
}
if (lifeTotals.want) console.log(`\nBeyond the permits (src/plan/also.ts): ${lifeTotals.found}/${lifeTotals.want} expected lines stated in their group with their official words (recall ${pct(lifeTotals.found, lifeTotals.want)}), ${lifeTotals.right}/${lifeTotals.stated} stated lines right (precision ${pct(lifeTotals.right, lifeTotals.stated)})`);

/* ------------------------------------------------------------------ what differs by kind of business */
// Each case with expected facts: the instant plan and the forms tool must state every expected fact, with the official
// page's own words from the URL the case names, and no fact on the case's must-not list; a fact that matches nothing the
// case expects is invented. Targets: recall and precision 100%, for both paths.
const factTotals = { want: 0, found: 0, stated: 0, right: 0 };
for (const { name: set, cases } of SETS) for (const g of cases.filter(x => x.facts?.length || x.mustNotFacts?.length)) {
  const i = g.input;
  const p = planOf(g);
  const segment = segmentOf(i.what);
  const lib = libraryAnswer(i.what, i.where, { employees: i.employees ?? true, buildout: i.buildout ?? true, signage: i.signage ?? true, newEntity: !i.entity, imports: /import|进口/i.test(i.what), alcohol: sellsAlcohol(i.what) }, TODAY);
  for (const [path, facts] of [["instant plan", p.facts], ["library", lib.facts]] as const) {
    const miss: string[] = [], bad: string[] = [];
    for (const want of g.facts ?? []) {
      factTotals.want++;
      const hit = facts.find(f => re(want.match).test(f.id));
      if (!hit) { miss.push(`missing ${want.key}`); continue; }
      if (hit.source.url !== want.source || hit.source.quote !== want.quote) { miss.push(`${want.key}: quoted from ${hit.source.url} ("${hit.source.quote}"), the case reads ${want.source}`); continue; }
      factTotals.found++;
    }
    for (const f of facts) {
      factTotals.stated++;
      const no = (g.mustNotFacts ?? []).find(m => re(m.match).test(f.id));
      if (no) { bad.push(`wrong ${f.id}: ${no.why}`); continue; }
      if (!(g.facts ?? []).some(w => re(w.match).test(f.id))) { bad.push(`invented ${f.id}`); continue; }
      const proof = proofProblems({ id: f.id, url: f.source.url, quote: f.source.quote, checked: f.source.checked });
      if (proof.length || !officialSource(f.source.url)) { bad.push(`${f.id}: ${proof.join("; ") || "not an official page"}`); continue; }
      factTotals.right++;
    }
    const food = facts.filter(f => !f.kinds.some(k => FURNITURE_KINDS.includes(k) || SECTOR_KINDS.includes(k)));
    if (segment !== "restaurant" && food.length) bad.push(`${food.length} food facts for a ${segment} business`);
    if (miss.length || bad.length) { fails.push(`${set} ${g.id} ${path} facts: ${[...miss, ...bad].join("; ")}`); console.log(`  ${set} ${g.id} (${path}): ${[...miss, ...bad].join("; ")}`); }
  }
}
console.log(`\nWhat differs by kind of business (both paths): ${factTotals.found}/${factTotals.want} expected facts stated with their official words (recall ${pct(factTotals.found, factTotals.want)}), ${factTotals.right}/${factTotals.stated} stated facts right (precision ${pct(factTotals.right, factTotals.stated)})`);
for (const { name: set, cases } of SETS) {
  const unverified = cases.flatMap(g => g.items.filter(i => !i.verified).map(i => `${g.id}: ${i.name}${i.note ? ` (${i.note})` : ""}`));
  console.log(`\n================ ${TITLE[set] ?? set} ================`);
  console.log(`${cases.length} openings, ${cases.reduce((t, g) => t + g.items.filter(i => i.verified && i.required).length, 0)} verified required items, `
    + `${cases.reduce((t, g) => t + g.items.filter(i => i.verified && !i.required).length, 0)} verified conditional items, ${unverified.length} unverified items set aside, `
    + `${cases.reduce((t, g) => t + g.order.filter(o => o.verified).length, 0)} verified order constraints.`);
  const instant = report(`Instant plan, ${set} (src/plan/preview.ts: the app's first screen, text-to-start, partner API)`, cases.map(g => score(g, instantPlan(g))));
  const lib = report(`Library, ${set} (find_official_forms in agent-run: src/forms/registry.ts formsFor and libraryAnswer)`, cases.map(g => score(g, library(g))));
  if (showMisses && unverified.length) console.log(`\nUnverified ${set} items (not scored):\n  ${[...new Set(unverified)].join("\n  ")}`);
  for (const [name, t] of [["instant plan", instant], ["library", lib]] as const)
    for (const k of Object.keys(TARGET) as (keyof Totals)[]) if (t[k] + 1e-9 < TARGET[k]) fails.push(`${set} ${name} ${k} ${(100 * t[k]).toFixed(1)}% < ${(100 * TARGET[k]).toFixed(0)}%`);
}

// fail closed everywhere, not only in the sets: every plan for every place the library names, and every state, for each
// store type (scripts/eval/failclosed.ts); a quote too old, a page that no longer says it, and two sources that disagree
// each turn a claim into an abstention
if (!GENERAL) {
  const fc = failClosedChecks(TODAY);
  console.log(`\nFail closed: ${fc.plans} plans, ${fc.rows} rows (${fc.claims} claims, every one quoted from an official page seen within ${MAX_PROOF_AGE} days; ${fc.abstentions} abstentions, every one naming who to ask with an official link); ${fc.checks.filter(c => c.pass).length} of ${fc.checks.length} checks pass`);
  for (const c of fc.checks) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}${c.pass ? "" : `\n     ${c.detail}`}`);
  for (const c of fc.checks) if (!c.pass) fails.push(`fail-closed: ${c.name}`);
}

// company formation and foreign qualification (scripts/eval/entity.ts): an LLC in DE, CA, NY, TX and FL, a Delaware LLC
// registering in California and a corporation from abroad registering in New York, on both paths
if (!GENERAL) {
  const ent = entityChecks(TODAY);
  console.log(`\nCompany filings (formation and foreign qualification): ${ent.filter(c => c.pass).length} of ${ent.length} cases pass`);
  for (const c of ent) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}${c.pass ? "" : `\n     ${c.detail}`}`);
  for (const c of ent) if (!c.pass) fails.push(c.name);
}

// her written answers: sample mode and the server's grounding (scripts/eval/answers.ts)
const answers = await answerChecks();
console.log(`\nWritten answers (sample mode and the server's grounding): ${answers.filter(c => c.pass).length} of ${answers.length} checks pass\n`);
for (const c of answers) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}${c.pass ? "" : `\n     ${c.detail}`}`);

for (const c of answers) if (!c.pass) fails.push(`answer: ${c.name}`);
console.log(fails.length ? `\nBelow target: ${fails.join("; ")}`
  : `\nAll targets met (${GENERAL ? "recall reported; " : "recall 100%, "}every required item covered, precision, agency, level and order 100%, every row sourced, every published fee, every row fail closed, every answer check).`);
process.exit(fails.length ? 1 : 0);
