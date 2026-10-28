// Company formation and foreign qualification (src/forms/entities.ts), scored on both deterministic paths: an LLC formed
// in Delaware, California, New York, Texas and Florida, a Delaware LLC registering in California and a corporation from
// abroad registering in New York (scripts/eval/entity-cases.json, each expected answer read on the state's own page).
// Run by scripts/eval/accuracy.ts (npm run test:accuracy).
//   instant plan   previewPlan with the intake's company facts (no company yet; or its name and where it was formed)
//   library        formsFor with the needs the agent's forms tool passes for the same facts (src/live.ts)
// Each case: the expected filing is in the plan, claims (a current quote, never an abstention), states the agency's fee
// and names the agency; the agency's expedite tiers are the ones its page states; and no other company filing is in the
// plan (an LLC never gets the corporation's formation, a company formed elsewhere is never formed again).
import CASES from "./entity-cases.json";
import { companyHome, previewPlan } from "../../src/plan/preview";
import { formById, formsFor, segmentOf, type Needs } from "../../src/forms/registry";
import { expediteOf } from "../../src/forms/speed";
import { planRowProof } from "./proof";

type Case = { id: string; what: string; where: string; options: { entity?: string; formedIn?: string; corp?: boolean };
  expect: { official: string; fee: number | null; agency: string; tiers: string[] }; mustNot: string[]; source: string };
type Check = { name: string; pass: boolean; detail?: string };

export function entityChecks(today: string): Check[] {
  const out: Check[] = [];
  for (const c of CASES as Case[]) {
    const plan = previewPlan(c.what, c.where, undefined, { today, ...c.options });
    const row = plan.apps.find(a => a.official === c.expect.official);
    const problems: string[] = [];
    if (!row) problems.push(`instant plan has no ${c.expect.official}`);
    else {
      if (row.abstain) problems.push(`${c.expect.official} abstains`);
      problems.push(...planRowProof(row, today));
      const fee = row.fees.find(f => !f.tbd)?.amount ?? null;
      if (c.expect.fee != null && fee !== c.expect.fee) problems.push(`${c.expect.official} fee ${fee} != ${c.expect.fee}`);
      if (!row.agency.en.includes(c.expect.agency)) problems.push(`${c.expect.official} agency "${row.agency.en}"`);
    }
    for (const id of c.mustNot) if (plan.apps.some(a => a.official === id)) problems.push(`instant plan has ${id}`);
    // the library: the needs find_official_forms passes for the same facts
    const legal = (c.options.entity ?? "").trim(), home = companyHome(c.options.formedIn, c.where);
    const needs: Needs = { employees: true, ...(legal ? {} : { newEntity: true }), ...(legal && home === "abroad" ? { foreignEntity: true } : legal && home === "other" ? { outOfState: true } : {}),
      ...((c.options.corp ?? /\b(inc|corp|corporation)\.?\s*$/i.test(legal)) ? { corp: true } : {}) };
    const lib = formsFor({ segment: segmentOf(c.what), where: c.where, needs }).map(f => f.id);
    if (!lib.includes(c.expect.official)) problems.push(`library has no ${c.expect.official}`);
    for (const id of c.mustNot) if (lib.includes(id)) problems.push(`library has ${id}`);
    // the expedite tiers the plan and the approval card may offer: exactly the ones the page states
    const tiers = expediteOf(formById(c.expect.official), today).map(x => x.label.en).sort();
    if (JSON.stringify(tiers) !== JSON.stringify([...c.expect.tiers].sort())) problems.push(`expedite tiers ${JSON.stringify(tiers)} != ${JSON.stringify(c.expect.tiers)}`);
    out.push({ name: `company filing: ${c.id} (${c.expect.official})`, pass: !problems.length, ...(problems.length ? { detail: problems.join("; ") } : {}) });
  }
  return out;
}
