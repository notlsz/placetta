// Fail closed, checked everywhere rather than only in the accuracy sets: no official quote, no claim. Run by
// scripts/eval/accuracy.ts (npm run test:accuracy).
//   sweep       every place the library names (src/forms/usplace.ts, src/forms/world.ts) and a town in every state, for
//               each store type: every plan row either claims (its quote, seen on an official page within MAX_PROOF_AGE
//               days and in the read log) or abstains (no fee, names who to ask, an official link); the agent's forms
//               tool claims exactly what the instant plan claims
//   stale       a quote last seen more than MAX_PROOF_AGE days ago claims nothing
//   gone        a quote the last re-read didn't find on its page claims nothing
//   conflict    two official sources naming different offices for the permit to open: both abstain, neither is picked
//   answers     a written answer from a form whose quote is stale says "I'm not sure" and who to ask
import { readFileSync } from "node:fs";
import { FORMS, formsFor, segmentOf, type OfficialForm } from "../../src/forms/registry";
import { furnitureNeeds } from "../../src/forms/furniture";
import { FURNITURE_KINDS } from "../../src/forms/kinds";
import { CITIES } from "../../src/forms/world";
import { COUNTIES } from "../../src/forms/usplace";
import { libraryAnswer, previewPlan, sellsAlcohol } from "../../src/plan/preview";
import { MAX_PROOF_AGE, proofCurrent } from "../../src/plan/ask";
import { groundedAnswer } from "../../src/answer";
import { formProof, planRowProof, proofProblems } from "./proof";
import { officialSource } from "./official";

type Check = { name: string; pass: boolean; detail?: string };
const STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];
const STORES: { what: string; entity?: string }[] = [{ what: "Restaurant" }, { what: "Bubble tea shop" }, { what: "Bakery" }, { what: "Coffee shop" }, { what: "Clothing store" }, { what: "Franchised milk tea shop", entity: "existing" },
  // furniture (src/forms/furniture.ts): a showroom takes the retail path, an importer the seller path, a warehouse its own
  { what: "Furniture showroom" }, { what: "Upholstered furniture brand importing sofas" }, { what: "Furniture warehouse" }];
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Every US place the library names: the county table's cities and towns, the world table's US cities, a town per state. */
function places(): string[] {
  const src = readFileSync("src/forms/usplace.ts", "utf8"), out = new Set<string>();
  for (const m of src.matchAll(/^add\("([A-Z]{2})", "([A-Z]+)", "([^"]+)"/gm)) if (COUNTIES[m[2]]) for (const n of m[3].split(",")) out.add(`${n.trim().replace(/\b\w/g, c => c.toUpperCase())}, ${m[1]}`);
  for (const c of CITIES) if (c.country === "US" && c.state) out.add(`${c.en}, ${c.state}`);
  for (const s of STATES) out.add(`Springfield, ${s}`);
  return [...out];
}

export function failClosedChecks(today: string) {
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(pass ? {} : { detail: JSON.stringify(detail)?.slice(0, 600) }) });
  let plans = 0, rows = 0, claims = 0, abstentions = 0, facts = 0;
  const problems = new Set<string>(), parity = new Set<string>(), factProblems = new Set<string>();
  for (const where of places()) for (const s of STORES) {
    const p = previewPlan(s.what, where, "2027-04-01", { entity: s.entity, today });
    plans++;
    for (const a of p.apps) { rows++; if (a.abstain) abstentions++; else claims++; for (const x of planRowProof(a, today)) problems.add(`${where}, ${s.what}: ${x}`); }
    // what differs by kind of business: a fact is stated only with its quote, seen on its official page within the window
    for (const k of p.facts) {
      facts++;
      const bad = [...proofProblems({ id: k.id, url: k.source.url, quote: k.source.quote, checked: k.source.checked }), ...(officialSource(k.source.url) ? [] : ["not an official page"]), ...(proofCurrent({ read: k.source.url, quote: k.source.quote }, today) ? [] : ["quote not current"])];
      for (const x of bad) factProblems.add(`${where}, ${s.what}: ${k.id}: ${x}`);
    }
    // food facts only for a food business; furniture's only for furniture, and never for a warehouse
    const food = p.facts.filter(k => !k.kinds.some(x => FURNITURE_KINDS.includes(x))), furn = p.facts.length - food.length;
    if (segmentOf(s.what) !== "restaurant" && food.length) factProblems.add(`${where}, ${s.what}: food store-type facts on a ${segmentOf(s.what)} business`);
    if (furn && (!/furniture/i.test(s.what) || segmentOf(s.what) === "warehouse")) factProblems.add(`${where}, ${s.what}: furniture facts on a ${segmentOf(s.what)} business`);
    // the agent's tool claims what the plan claims: never a form the plan abstains on, never one without a current quote
    const segment = segmentOf(s.what), needs = { employees: true, buildout: true, signage: true, newEntity: !s.entity, food: segment === "restaurant", imports: false, alcohol: sellsAlcohol(s.what), ...furnitureNeeds(s.what) };
    const known = libraryAnswer(s.what, where, needs, today);
    for (const f of formsFor({ segment, where, needs })) {
      const claimed = known.claim(f), row = p.apps.find(a => a.official === f.id);
      if (claimed && (!f.proof || !proofCurrent(f.proof, today) || formProof(f).length)) parity.add(`${where}, ${s.what}: the tool claims ${f.id} without a current quote`);
      if (row && claimed === !!row.abstain) parity.add(`${where}, ${s.what}: the tool and the plan disagree on ${f.id}`);
    }
  }
  check(`sweep: every row of ${plans} plans (every place the library names and a town in every state, ${STORES.length} store types) claims with a current official quote or abstains naming who to ask`, !problems.size, [...problems].slice(0, 12));
  check(`sweep: every store-type fact those plans state (${facts}) carries its official quote, in the read log and current, and only the kind of business it's about gets it`, !factProblems.size, [...factProblems].slice(0, 12));
  check("sweep: the agent's forms tool claims exactly what the instant plan claims, and nothing without a current quote", !parity.size, [...parity].slice(0, 12));

  // stale: the day after every quote ages out, a San José milk tea shop's plan claims nothing at all
  {
    const later = addDays(today, MAX_PROOF_AGE + 30);
    const p = previewPlan("Milk tea shop", "San Jose, CA", "2027-08-01", { today: later });
    check(`stale: ${MAX_PROOF_AGE + 30} days on with no re-read, every row of a San José plan abstains (${p.apps.length} rows) and none sets a file-by date`,
      p.apps.length > 0 && p.apps.every(a => a.abstain) && !p.deadlines.some(d => d.kind === "due"), p.apps.filter(a => !a.abstain).map(a => a.official ?? a.id));
    check(`stale: the same day, the San José milk tea shop's store-type facts are withheld (${p.withheld.length}), none stated and none on a row`,
      p.withheld.length > 0 && !p.facts.length && !p.apps.some(a => a.notes?.length), { facts: p.facts.map(f => f.id), withheld: p.withheld });
  }
  // gone: a quote the last re-read didn't find (here, words that aren't on the page) claims nothing
  {
    const f = FORMS.find(x => x.id === "ca-cdtfa")!, was = f.proof!;
    f.proof = { ...was, quote: was.quote + " (not on the page)" };
    const row = previewPlan("Milk tea shop", "San Jose, CA", undefined, { today }).apps.find(a => a.official === "ca-cdtfa");
    f.proof = was;
    const back = previewPlan("Milk tea shop", "San Jose, CA", undefined, { today }).apps.find(a => a.official === "ca-cdtfa");
    check("gone: when the page no longer has the quote, the seller's permit row abstains and names CDTFA; with the quote back it claims again",
      !!row?.abstain && /We'll confirm with the California Department of Tax and Fee Administration/.test(row.name.en) && !!back && !back.abstain, [row?.name.en, back?.abstain]);
  }
  // conflict: a second, city-level permit to open the same Irvine food place, from another office, with a current quote
  {
    const county = FORMS.find(x => x.id === "oc-health-permit") ?? FORMS.find(x => x.where === "ORC" && /permit/i.test(x.title.en) && !/plan/i.test(x.title.en));
    const fake: OfficialForm = { ...county!, id: "test-conflict-city-permit", where: "IRV", level: "city", agency: { en: "City of Irvine Test Office", zh: "测试" } };
    FORMS.push(fake);
    const p = previewPlan("Restaurant", "Irvine, CA", undefined, { today });
    FORMS.splice(FORMS.indexOf(fake), 1);
    const both = p.apps.filter(a => a.official === fake.id || a.official === county!.id);
    check("conflict: two official sources naming different offices for the permit to open (Orange County's and a city's) both abstain, naming both, and the plan lists the conflict",
      both.length === 2 && both.every(a => a.abstain && /City of Irvine Test Office/.test(a.name.en) && /Orange County/.test(a.name.en)) && p.conflicts.length === 1, both.map(a => a.name.en));
  }
  // answers: a stale quote means "I'm not sure", naming the agency and its page
  {
    const r = groundedAnswer("Do I need a seller's permit in California?", { today: addDays(today, MAX_PROOF_AGE + 30) });
    check("answers: with CDTFA's quote aged out, \"Do I need a seller's permit in California?\" is answered \"I'm not sure\", naming CDTFA and its page",
      !!r && !r.sure && /I'm not sure/.test(r.text.en) && /California Department of Tax and Fee Administration/.test(r.text.en) && r.sources.some(s => /cdtfa\.ca\.gov/.test(s.url)), r);
  }
  return { plans, rows, claims, abstentions, checks };
}
