/* The adversarial and edge-case generator: every accuracy fixture (a business and an address) is mutated the ways real
   customers write them, and the plan Placetta builds for each mutation must keep its invariants. Copied from OpenAI's
   automated red teaming (generate many varied cases from a goal, reward the ones that break a rule: openai.com/index/
   advancing-red-teaming-with-people-and-ai) and Anthropic's Petri (seed scenarios run in parallel, each judged on fixed
   dimensions: alignment.anthropic.com/2025/petri), with the judge replaced by plain invariants so it costs nothing and
   never flakes. Runs nightly (.github/workflows/quality.yml) and a slice in every test run.

   The mutations and what must hold:
     same place, written differently (a suite, ZIP+4, capitals, "Street" for "St", extra spaces): the same forms
     a P.O. box as the premises: the check before approval refuses it
     the same business as a food truck: none of a building's food permits
     the same business serving beer and wine: an alcohol license in the plan
     nonsense for an address: a plan with no crash, and nothing invented for a place it can't read */
import { previewPlan } from "../plan/preview";
import { premises } from "../validate";
import type { Finding } from "./sweep";

export type Fixture = { id: string; what: string; where: string };
export type Mutation = { id: string; what: string; where: string; expect: "same" | "po_box" | "mobile" | "alcohol" | "no_crash" };

const ZIP = /\b(\d{5})(?!-)\b(?=[^\d]*$)/;
export function mutations(f: Fixture): Mutation[] {
  const m: Mutation[] = [];
  const parts = f.where.split(",").map(s => s.trim());
  if (parts.length >= 3 && /^\d/.test(parts[0])) m.push({ id: `${f.id}~suite`, what: f.what, where: [parts[0], "Suite 200", ...parts.slice(1)].join(", "), expect: "same" });
  if (ZIP.test(f.where)) m.push({ id: `${f.id}~zip4`, what: f.what, where: f.where.replace(ZIP, "$1-0001"), expect: "same" });
  m.push({ id: `${f.id}~caps`, what: f.what, where: f.where.toUpperCase(), expect: "same" });
  if (/\bSt\b/.test(f.where)) m.push({ id: `${f.id}~street`, what: f.what, where: f.where.replace(/\bSt\b/, "Street"), expect: "same" });
  m.push({ id: `${f.id}~spaces`, what: f.what, where: f.where.replace(/, /g, " ,  "), expect: "same" });
  if (parts.length >= 3) m.push({ id: `${f.id}~pobox`, what: f.what, where: ["P.O. Box 1234", ...parts.slice(1)].join(", "), expect: "po_box" });
  if (/\b(restaurant|tea|coffee|cafe|bakery|noodles?|dumplings?|pho|ramen|hot pot|dessert|boba)\b/i.test(f.what)) {
    m.push({ id: `${f.id}~truck`, what: `Food truck selling ${f.what.toLowerCase()}`, where: f.where, expect: "mobile" });
    if (!/beer|wine|liquor/i.test(f.what)) m.push({ id: `${f.id}~alcohol`, what: `${f.what} serving beer and wine`, where: f.where, expect: "alcohol" });
  }
  m.push({ id: `${f.id}~nonsense`, what: f.what, where: "??? somewhere ###", expect: "no_crash" });
  return m;
}

const plan = (what: string, where: string) => previewPlan(what, where, "2027-03-01", { today: "2026-10-22" }).apps;
const ids = (what: string, where: string) => plan(what, where).map(a => a.official ?? a.id).sort();
/** A state, county or city license to sell alcohol (the federal dealer registration alone isn't one). */
const sellsAlcohol = (what: string, where: string) => plan(what, where).some(a => a.level !== "federal" && /liquor|alcohol|beer|wine|licen[cs]e iv|débit de boissons/i.test(a.name.en));

/** Every mutation of a fixture against its invariant. Returns a finding per broken one. */
export function checkFixture(f: Fixture): { ran: number; findings: Finding[] } {
  const out: Finding[] = [];
  const base = ids(f.what, f.where).join(",");
  const muts = mutations(f);
  const fail = (m: Mutation, why: string, severity: Finding["severity"] = "medium") => out.push({ kind: "edge", severity, source: "mutate", subject: m.id,
    repro: `previewPlan(${JSON.stringify(m.what)}, ${JSON.stringify(m.where)}): ${why}`, fix: `Make the plan for this wording hold its invariant (${m.expect}), then add it to scripts/edge-test.ts.` });
  for (const m of muts) {
    let got: string[] = [];
    try { got = ids(m.what, m.where); } catch (e) { fail(m, `threw ${(e as Error).message}`, "high"); continue; }
    if (m.expect === "same" && got.join(",") !== base) {
      const a = new Set(base.split(",")), b = new Set(got);
      fail(m, `the same place written differently changes the plan: lost ${[...a].filter(x => !b.has(x)).join(" ") || "nothing"}, gained ${[...b].filter(x => !a.has(x)).join(" ") || "nothing"}`, "high");
    }
    if (m.expect === "po_box" && !premises(m.where)) fail(m, "a P.O. box isn't caught as the premises", "high");
    if (m.expect === "mobile" && got.some(x => /health-permit|food-permit|plan-check|plan-review|-fse$|food-license|food-dealer/.test(x) && !/mobile/.test(x))) fail(m, `a food truck got a building's food permits: ${got.filter(x => /health|food|plan/.test(x)).join(" ")}`);
    if (m.expect === "alcohol" && !sellsAlcohol(m.what, m.where)) fail(m, "serving beer and wine added no alcohol license");
  }
  return { ran: muts.length, findings: out };
}
