// Ground-truth accuracy for Odelia's permit plans: 30 store openings (scripts/eval/gold/*.json), each researched from
// the agencies' own pages, scored against the two deterministic paths that build plans:
//   instant plan   src/plan/preview.ts previewPlan: the app's first screen, a first text to Odelia (agent-run's
//                  text start, via src/plan/start.ts) and the partner API all build the plan with it
//   library        src/forms/registry.ts formsFor: what agent-run's find_official_forms tool returns for the business
//                  and place (src/live.ts), with the needs the model passes for the case
// No model is called. Only verified gold items count toward the scores; unverified ones are listed and set aside.
//
//   recall      required gold items the plan has
//   precision   plan rows that are right for this opening (a required or conditional gold item), over every row that
//               isn't an unverified item; a row that matches nothing is invented, one on the case's must-not list is wrong
//   agency      found items filed with the right agency
//   level       found items at the right level (federal, state, county, city)
//   order       gold order constraints (both steps in the plan) that the plan's order keeps
//   source      plan rows with an official source link
//   fee         found items whose published gold fee the plan states
//
// npm run test:accuracy            the tables, totals and every miss, wrong row and broken order; exit 1 below the targets
// QUIET=1 npm run test:accuracy    the tables and totals only
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { previewPlan } from "../../src/plan/preview";
import { formsFor, segmentOf } from "../../src/forms/registry";
import type { Level } from "../../src/model";
import { answerChecks } from "./answers";
import { officialSource } from "./official";

type GoldItem = { key: string; name: string; agency: string; level: Level; levels?: Level[]; required: boolean; verified: boolean; fee: number | null; source: string; match: string; agencyMatch: string; condition?: string; note?: string };
type Gold = {
  id: string; title: string; read: string;
  input: { what: string; where: string; lang: "en" | "zh"; entity?: string; employees?: boolean; buildout?: boolean; signage?: boolean };
  items: GoldItem[]; order: { before: string; after: string; source: string; why: string; verified: boolean }[];
  mustNotInclude: { name: string; why: string; match: string; source?: string }[];
};
type Row = { id: string; name: string; agency: string; level: Level; source?: string; fee: number | null };

const here = dirname(fileURLToPath(import.meta.url));
const goldDir = [join(here, "gold"), join(process.cwd(), "scripts/eval/gold")].find(d => { try { return readdirSync(d).length > 0; } catch { return false; } })!;
const cases: Gold[] = readdirSync(goldDir).filter(f => f.endsWith(".json")).sort().map(f => JSON.parse(readFileSync(join(goldDir, f), "utf8")));
// npm passes its own arguments after the script's "exit", so the quiet mode is an environment variable: QUIET=1
const showMisses = !process.env.QUIET;
const TODAY = "2026-10-18", OPENING = "2027-04-01";
const TARGET = { recall: 0.95, precision: 0.97, agency: 0.97, level: 0.97, order: 0.95, source: 1, fee: 0.9 };

/* ------------------------------------------------------------------ the two paths */

function instantPlan(g: Gold): Row[] {
  const i = g.input;
  const p = previewPlan(i.what, i.where, OPENING, { entity: i.entity, employees: i.employees, buildout: i.buildout, signage: i.signage, today: TODAY });
  return p.apps.map(a => ({ id: a.official ?? a.id, name: a.name.en, agency: a.agency.en, level: a.level, source: a.source?.url, fee: a.fees.some(f => f.tbd) ? null : a.fees.reduce((s, f) => s + f.amount, 0) }));
}

/** What find_official_forms returns (src/live.ts), with the flags the model sets for this case. */
function library(g: Gold): Row[] {
  const i = g.input, segment = segmentOf(i.what);
  const imports = /import|进口/i.test(i.what), alcohol = /\b(beer|wine|liquor|alcohol|cocktail|bar)\b|酒/i.test(i.what);
  const needs = { employees: i.employees ?? true, buildout: i.buildout ?? true, signage: i.signage ?? true, newEntity: !i.entity, food: segment === "restaurant" || /food|snack|食品/i.test(i.what), imports, alcohol };
  return formsFor({ segment, where: i.where, needs }).filter(f => f.order < 88)
    .map(f => ({ id: f.id, name: f.title.en, agency: f.agency.en, level: f.level, source: f.info || f.url, fee: f.fee }));
}

/* ------------------------------------------------------------------ scoring */

type Score = {
  id: string; req: number; found: number; rows: number; correct: number; wrong: number; invented: number; setAside: number;
  agencyOk: number; levelOk: number; orderOk: number; orderN: number; sourced: number; feeOk: number; feeN: number;
  misses: string[]; wrongRows: string[]; agencyMiss: string[]; levelMiss: string[]; orderMiss: string[]; unsourced: string[]; feeMiss: string[];
};
const text = (r: Row) => `${r.name} | ${r.agency} | ${r.id}`;
const re = (s: string) => new RegExp(s, "i");

function score(g: Gold, rows: Row[]): Score {
  const s: Score = { id: g.id, req: 0, found: 0, rows: rows.length, correct: 0, wrong: 0, invented: 0, setAside: 0, agencyOk: 0, levelOk: 0, orderOk: 0, orderN: 0, sourced: 0, feeOk: 0, feeN: 0,
    misses: [], wrongRows: [], agencyMiss: [], levelMiss: [], orderMiss: [], unsourced: [], feeMiss: [] };
  // each gold item's row: the first that matches it and its agency, else the first that matches it
  const rowOf = new Map<string, number>();
  for (const it of g.items) {
    const hits = rows.map((r, k) => [r, k] as const).filter(([r]) => re(it.match).test(text(r)));
    const best = hits.find(([r]) => re(it.agencyMatch).test(r.agency)) ?? hits[0];
    if (best) rowOf.set(it.key, best[1]);
  }
  for (const it of g.items.filter(x => x.verified)) {
    const k = rowOf.get(it.key);
    if (it.required) { s.req++; if (k !== undefined) s.found++; else s.misses.push(`${it.name} (${it.agency})`); }
    if (k === undefined) continue;
    const r = rows[k];
    if (re(it.agencyMatch).test(r.agency)) s.agencyOk++; else s.agencyMiss.push(`${it.name}: plan says "${r.agency}", should be ${it.agency}`);
    if ((it.levels ?? [it.level]).includes(r.level)) s.levelOk++; else s.levelMiss.push(`${it.name}: plan says ${r.level}, should be ${it.level}`);
    if (it.fee != null) { s.feeN++; if (r.fee === it.fee) s.feeOk++; else s.feeMiss.push(`${it.name}: plan says ${r.fee ?? "varies"}, published ${it.fee}`); }
  }
  rows.forEach(r => {
    if (officialSource(r.source)) s.sourced++; else s.unsourced.push(`${r.name}: ${r.source ?? "no link"}`);
    const bad = g.mustNotInclude.find(m => re(m.match).test(text(r)));
    if (bad) { s.wrong++; s.wrongRows.push(`${r.name} (${r.agency}): ${bad.why}`); return; }
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

type Totals = { recall: number; precision: number; agency: number; level: number; order: number; source: number; fee: number };
function report(title: string, scores: Score[]): Totals {
  console.log(`\n${title}\n`);
  console.log(`${pad("case", 26)}${lpad("recall", 13)}${lpad("precision", 14)}${lpad("agency", 10)}${lpad("level", 10)}${lpad("order", 9)}${lpad("source", 10)}${lpad("fee", 8)}`);
  for (const s of scores) {
    console.log(`${pad(s.id, 26)}${lpad(`${s.found}/${s.req}`, 7)}${lpad(pct(s.found, s.req), 7)}${lpad(`${s.correct}/${s.correct + s.wrong + s.invented}`, 7)}${lpad(pct(s.correct, s.correct + s.wrong + s.invented), 7)}`
      + `${lpad(pct(s.agencyOk, s.agencyOk + s.agencyMiss.length), 10)}${lpad(pct(s.levelOk, s.levelOk + s.levelMiss.length), 10)}${lpad(s.orderN ? `${s.orderOk}/${s.orderN}` : "-", 9)}${lpad(pct(s.sourced, s.rows), 10)}${lpad(s.feeN ? `${s.feeOk}/${s.feeN}` : "-", 8)}`);
  }
  const sum = (f: (s: Score) => number) => scores.reduce((t, s) => t + f(s), 0);
  const t = {
    recall: sum(s => s.found) / sum(s => s.req),
    precision: sum(s => s.correct) / sum(s => s.correct + s.wrong + s.invented),
    agency: sum(s => s.agencyOk) / sum(s => s.agencyOk + s.agencyMiss.length),
    level: sum(s => s.levelOk) / sum(s => s.levelOk + s.levelMiss.length),
    order: sum(s => s.orderOk) / (sum(s => s.orderN) || 1),
    source: sum(s => s.sourced) / sum(s => s.rows),
    fee: sum(s => s.feeOk) / (sum(s => s.feeN) || 1),
  };
  console.log(`${"-".repeat(100)}`);
  console.log(`${pad("TOTAL", 26)}${lpad(`${sum(s => s.found)}/${sum(s => s.req)}`, 7)}${lpad(pct(sum(s => s.found), sum(s => s.req)), 7)}${lpad(`${sum(s => s.correct)}/${sum(s => s.correct + s.wrong + s.invented)}`, 7)}${lpad((100 * t.precision).toFixed(1) + "%", 7)}`
    + `${lpad((100 * t.agency).toFixed(1) + "%", 10)}${lpad((100 * t.level).toFixed(1) + "%", 10)}${lpad(`${sum(s => s.orderOk)}/${sum(s => s.orderN)}`, 9)}${lpad((100 * t.source).toFixed(1) + "%", 10)}${lpad(`${sum(s => s.feeOk)}/${sum(s => s.feeN)}`, 8)}`);
  console.log(`  rows set aside (match only an unverified gold item): ${sum(s => s.setAside)}; wrong-jurisdiction or must-not rows: ${sum(s => s.wrong)}; invented rows: ${sum(s => s.invented)}`);
  if (showMisses) for (const s of scores) {
    const lines = [...s.misses.map(m => `missing   ${m}`), ...s.wrongRows.map(m => `wrong     ${m}`), ...s.agencyMiss.map(m => `agency    ${m}`), ...s.levelMiss.map(m => `level     ${m}`),
      ...s.orderMiss.map(m => `order     ${m}`), ...s.unsourced.map(m => `source    ${m}`), ...s.feeMiss.map(m => `fee       ${m}`)];
    if (lines.length) console.log(`\n  ${s.id}\n    ${lines.join("\n    ")}`);
  }
  return t;
}

const unverified = cases.flatMap(g => g.items.filter(i => !i.verified).map(i => `${g.id}: ${i.name}${i.note ? ` (${i.note})` : ""}`));
console.log(`Gold set: ${cases.length} openings, ${cases.reduce((t, g) => t + g.items.filter(i => i.verified && i.required).length, 0)} verified required items, `
  + `${cases.reduce((t, g) => t + g.items.filter(i => i.verified && !i.required).length, 0)} verified conditional items, ${unverified.length} unverified items set aside, `
  + `${cases.reduce((t, g) => t + g.order.filter(o => o.verified).length, 0)} verified order constraints.`);

const instant = report("Instant plan (src/plan/preview.ts: the app's first screen, text-to-start, partner API)", cases.map(g => score(g, instantPlan(g))));
const lib = report("Library (find_official_forms in agent-run, src/forms/registry.ts formsFor)", cases.map(g => score(g, library(g))));
if (showMisses && unverified.length) console.log(`\nUnverified gold items (not scored):\n  ${[...new Set(unverified)].join("\n  ")}`);

// her written answers: sample mode and the server's grounding (scripts/eval/answers.ts)
const answers = await answerChecks();
console.log(`\nWritten answers (sample mode and the server's grounding): ${answers.filter(c => c.pass).length} of ${answers.length} checks pass\n`);
for (const c of answers) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}${c.pass ? "" : `\n     ${c.detail}`}`);

const fails: string[] = [];
for (const [name, t] of [["instant plan", instant], ["library", lib]] as const)
  for (const k of Object.keys(TARGET) as (keyof Totals)[]) if (t[k] + 1e-9 < TARGET[k]) fails.push(`${name} ${k} ${(100 * t[k]).toFixed(1)}% < ${(100 * TARGET[k]).toFixed(0)}%`);
for (const c of answers) if (!c.pass) fails.push(`answer: ${c.name}`);
console.log(fails.length ? `\nBelow target: ${fails.join("; ")}` : `\nAll targets met (recall >= 95%, precision >= 97%, agency and level >= 97%, order >= 95%, every row sourced, fees >= 90%, every answer check).`);
process.exit(fails.length ? 1 : 0);
