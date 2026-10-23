/* What a connected app's record means for licenses (src/connectorFacts.ts): a location matched to its store by street
   address, the store's applications whose address lines say something else, a location Placetta doesn't have, a phone
   and hours to keep, and Xero's legal name against the entity on file. Run from scripts/agent-test.ts. */
import { B } from "../src/bi";
import { addrKey, companyFacts, factLines, placeFacts, samePlace } from "../src/connectorFacts";
import type { Workspace } from "../src/model";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

export function connectorFactsTests(ok: Ok, eq: Eq) {
  console.log("\n# Connected apps mapped into license facts");
  eq(addrKey("41-28 Main Street, Suite 3, Flushing, NY 11355"), "41-28 main st ste 3 flushing ny 11355", "addresses compare as the post office writes them");
  ok(samePlace("41-28 Main St #3, Flushing, NY 11355", "41-28 Main Street, Suite 3, Flushing, NY 11355-1234"), "the same place written two ways");
  ok(!samePlace("41-26 Main St, Flushing, NY 11355", "41-28 Main St, Flushing, NY 11355"), "a different street number is a different place");
  ok(!samePlace("88 N First St, San Jose, CA 95113", "88 N First St, Austin, TX 78701"), "the same street in another ZIP is another place");

  const w = {
    stores: [
      { id: "fl", name: B("Flushing", "法拉盛"), address: "41-28 Main St, Flushing, NY 11355", stage: "open", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: ["health", "sign"] },
      { id: "sj", name: B("San Jose", "圣何塞"), address: "88 N First St, San Jose, CA 95113", stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [] },
    ],
    apps: [
      { id: "health", name: B("Health permit", "卫生许可"), fields: [{ id: "premises_address", label: B("Premises address", "营业地址"), value: "41-26 Main St, Flushing, NY 11355" }] },
      { id: "sign", name: B("Sign permit", "招牌许可"), fields: [{ id: "addr", label: B("Business address", "地址"), value: "41-28 Main Street, Flushing NY 11355" }, { id: "owner", label: B("Owner", "业主"), value: "Wei" }] },
    ],
    entities: [{ id: "e1", name: "Moonleaf Tea LLC" }],
  } as unknown as Workspace;

  const facts = placeFacts(w, [
    { source: "Google Business Profile", name: "Moonleaf Flushing", address: { line1: "41-28 Main Street", city: "Flushing", state: "NY", zip: "11355" }, phone: "(718) 555-0100", hours: ["MONDAY 10:00-22:00"] },
    { source: "Google Business Profile", name: "Moonleaf San Jose", address: { line1: "88 North First Street", city: "San Jose", state: "CA", zip: "95113" } },
    { source: "Square", name: "Moonleaf Irvine", address: { line1: "2 Spectrum Center Dr", city: "Irvine", state: "CA", zip: "92618" } },
  ]);
  const fl = facts.find(f => f.kind === "store_address" && f.store?.id === "fl")!;
  eq(fl.status, "check", "Flushing: Google's address matches the store, but an application line doesn't");
  eq(fl.affects, [{ application: "health", name: "Health permit", line: "Premises address", says: "41-26 Main St, Flushing, NY 11355" }], "the health permit's premises address is the one that differs (the sign permit's is the same place)");
  ok(fl.quote.startsWith("Google Business Profile: Moonleaf Flushing, 41-28 Main Street"), "with Google's own words", fl.quote);
  eq(facts.find(f => f.kind === "store_address" && f.store?.id === "sj")?.status, "matches", "San Jose: \"North First Street\" is \"N First St\"");
  const add = facts.find(f => f.kind === "new_store")!;
  eq([add.source, add.propose?.tool, add.propose?.input.address], ["Square", "add_store", "2 Spectrum Center Dr, Irvine, CA 92618"], "a location Placetta doesn't have: propose adding the store");
  eq(facts.filter(f => f.kind === "store_phone" || f.kind === "store_hours").map(f => [f.kind, f.propose?.tool]), [["store_phone", "remember"], ["store_hours", "remember"]], "the phone and hours go to the business facts forms read");
  const lines = factLines(facts);
  ok(lines.some(l => /Health permit, "Premises address": 41-26 Main St/.test(l) && /before anything is filed/.test(l)), "Odelia is told which line differs and to ask before filing", lines);
  ok(!lines.some(l => /San Jose/.test(l) && /lists/.test(l)), "and nothing about the store that matches");

  eq(companyFacts(w, { source: "Xero", name: "Moonleaf", legal_name: "Moonleaf Tea, L.L.C." })[0].status, "matches", "Xero's legal name, written another way, is the entity on file");
  const off = companyFacts(w, { source: "Xero", name: "Moonleaf", legal_name: "Moonleaf Holdings Inc" })[0];
  ok(off.status === "check" && off.record === "Moonleaf Tea LLC" && /formation documents/.test(factLines([off])[0]), "a different legal name: ask which the formation documents say", off);
  eq(companyFacts({ entities: [] } as unknown as Workspace, { source: "Xero", name: "Moonleaf Tea LLC" })[0].propose?.tool, "edit_workspace", "no entity yet: propose it");
}
