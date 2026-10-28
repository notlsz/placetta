// Replicate this store (src/replicate.ts): a San José bakery copied to Dallas, Toronto and Fremont; the four groups,
// the fees, the opening estimate, the price, the one approval, prefill that never invents, and Odelia's demo intent.
// Run from scripts/agent-test.ts.
import { previewPlan } from "../src/plan/preview";
import { compareTable, COVERAGE_SAY, missingFacts, openDoes, openLocations, parseTargets, planTarget, priceSay, readReplicateAsk, replicate, REPLICATE_ASK, setLocationFacts, sourceFacts, type TargetPlan } from "../src/replicate";
import { applyChange, normalizeState } from "../src/core";
import { openingOf } from "../src/smart";
import { SIMPLE } from "../src/pricing";
import { B, same } from "../src/bi";
import { __plansForRecording } from "../src/agent";
import { SAMPLE_WS } from "../src/sample";
import type { Application, Change, Store, Workspace } from "../src/model";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;
const TODAY = "2026-10-28";
const LEGAL = "Sweet Rise Bakery LLC";

/** A San José bakery whose store works: the company formed in California, its EIN, seller's permit and employer
 *  account approved, its local permits in hand. The owner fact is a description, not a person's name. */
export function bakery(): Workspace {
  const plan = previewPlan("Bakery", "San Jose, CA", undefined, { today: TODAY });
  const done = new Set(["ca-llc-1", "ca-llc-12", "irs-ss4", "ca-cdtfa", "ca-edd-de1", "sj-business-tax", "scc-plan-check", "scc-health-permit"]);
  const apps: Application[] = plan.apps.map(a => ({ ...a, id: a.id.replace(/^pv-/, "sj-"), preview: false, status: a.official && done.has(a.official) ? "approved" : "review",
    checklist: a.checklist.map(c => (c.dep ? { ...c, dep: c.dep.replace(/^pv-/, "sj-"), state: "done" as const } : c)) }));
  const ein = apps.find(a => a.official === "irs-ss4")!;
  ein.checklist = [...ein.checklist, { id: "art", label: B("Articles of organization", "组织章程"), state: "done", doc: "d-art" }, { id: "lease", label: B("Lease", "租约"), state: "done", doc: "d-lease" }];
  const store: Store = { id: "sanjose", name: B("San Jose, North First St", "圣何塞 North First St 店"), address: "100 N First St, San Jose, CA 95113", stage: "open", opened: "2026-06-01",
    rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: apps.map(a => a.id) };
  return normalizeState("Sweet Rise", {
    business: B(LEGAL, "甜升烘焙"), goal: B("More stores", "更多门店"), apps, stores: [store], meta: { what: "Bakery", city: "San Jose", region: "CA" },
    facts: [
      { id: "f-name", group: "business", label: B("Legal name", "法定名称"), value: same(LEGAL), source: B("Articles of organization", "组织章程") },
      { id: "f-entity", group: "business", label: B("Entity", "实体类型"), value: B("California limited liability company", "加州有限责任公司"), source: B("Articles of organization", "组织章程") },
      { id: "f-owner", group: "business", label: B("Owner", "所有人"), value: B("You, sole member", "您，唯一成员"), source: B("You told me", "您告诉我的") },
      { id: "f-ein", group: "business", label: B("EIN", "EIN"), value: same("••-•••4471"), source: B("IRS letter CP 575", "国税局 CP 575 函") },
    ],
    docs: [{ id: "d-art", name: "articles.pdf", kind: "pdf", size: 1000, by: "you", at: TODAY, tag: B("Articles", "章程") }],
  });
}

const kinds = (t: TargetPlan, k: string) => t.rows.filter(r => r.kind === k);
const DASH = /[–—]/;
const bis = (x: unknown): string[] => (x && typeof x === "object" ? Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => (k === "en" || k === "zh") && typeof v === "string" ? [v] : bis(v)) : []);

export function replicateTests(ok: Ok, eq: Eq) {
  console.log("\n# Replicate this store: a San José bakery");
  const w = bakery();
  const src = sourceFacts(w, "sanjose")!;
  ok(src.what === "Bakery" && src.legal === LEGAL && src.formedIn === "CA" && !src.formedAssumed && src.ein, "the source's facts: a bakery, its company, formed in California, with an EIN", src);
  ok(src.owner === undefined, "an owner fact that isn't a person's name is never used as one");

  // the places, as the owner types them
  eq(parseTargets("Dallas, Houston, Austin, and Toronto").places, ["Dallas, TX", "Houston, TX", "Austin, TX", "Toronto, Canada"], "\"Dallas, Houston, Austin, and Toronto\" is four places");
  eq(parseTargets("Austin, TX; Toronto").places, ["Austin, TX", "Toronto, Canada"], "a state after a city goes with it");
  eq(parseTargets("达拉斯、多伦多").places, ["Dallas, TX", "Toronto, Canada"], "Chinese place names too");
  ok(parseTargets("Fremont").unknown[0] === "Fremont", "a city the library can't place is said, not guessed");

  console.log("\n# Dallas: Texas's and Dallas's own steps, nothing Californian");
  const r = replicate(w, "sanjose", ["Dallas, TX", "Toronto, Canada", "Fremont, CA"], { today: TODAY })!;
  const [dal, tor, fre] = r.targets;
  const newIds = dal.apps.map(a => a.official);
  ok(newIds.includes("tx-304"), "a Texas foreign qualification (the California LLC registers in Texas)", newIds);
  ok(newIds.includes("tx-ap201"), "a Texas sales and use tax permit");
  ok(newIds.includes("dal-food-permit") && newIds.includes("dal-plan-review"), "Dallas's food establishment permit and its plan review");
  const cal = kinds(dal, "new").filter(x => /california|san jos|santa clara/i.test(`${x.name.en} ${x.agency.en}`)).concat(dal.apps.filter(a => /^(ca|sj|scc)-/.test(a.official ?? "")).map(a => ({ name: a.name } as never)));
  eq(cal.length, 0, "nothing Californian is new for Dallas");
  ok(kinds(dal, "not_needed").some(x => /seller'?s permit/i.test(x.name.en)) && kinds(dal, "not_needed").every(x => x.level !== "federal"), "California's seller's permit and the San José permits aren't needed there");
  ok(kinds(dal, "same").some(x => /employer identification/i.test(x.name.en) && x.ref === "sj-irs-ss4"), "the EIN carries over, by reference to the approved one");
  ok(kinds(dal, "same").some(x => /articles of organization/i.test(x.name.en)), "the company is already formed: no refiling");
  ok(!dal.apps.some(a => a.official === "irs-ss4" || a.official === "ca-llc-1"), "no new EIN or formation application");
  const tax = dal.apps.find(a => a.official === "tx-ap201")!;
  ok(tax.checklist.some(c => c.dep === "sj-irs-ss4" && c.state === "done"), "the Texas permit's EIN step points at the company's approved EIN", tax.checklist);
  const sum = kinds(dal, "new").reduce((t, x) => t + (x.fee ?? 0), 0);
  ok(dal.fees.published === sum && dal.fees.unknown === kinds(dal, "new").filter(x => x.fee == null).length && dal.fees.unknown > 0, "agency fees: the published ones added, the unpublished counted, never guessed", dal.fees);
  ok(!!dal.opening && dal.opening.days > 0 && /^\d{4}-\d{2}-\d{2}$/.test(dal.opening.date) && dal.opening.hinge.length > 0, "an opening estimate with its hinge, from the critical path", dal.opening);
  eq(dal.placetta.usd, dal.placetta.licenses * SIMPLE.licenseUsd + dal.placetta.complex * SIMPLE.complexUsd, "Placetta's price at the current list: each new filing at its tier");
  ok(dal.placetta.complex >= 1, "Dallas's plan review is priced as a complex license");
  ok(dal.touches >= 2 && /one approval/i.test(dal.touchWhy.en), "the owner's touches, said with why", dal.touchWhy);
  eq(dal.counts.licenses, dal.counts.same + dal.counts.covered + dal.counts.new, "total licenses: same, covered and new");

  console.log("\n# Toronto: Canada's and Ontario's steps from the registry");
  ok(tor.country === "CA" && tor.fees.currency === "CAD", "Toronto plans in Canada, in Canadian dollars");
  ok(tor.apps.some(a => /^ca-(on|cra|tor)-/.test(a.official ?? "")), "Ontario and Canada Revenue Agency items where the registry has them", tor.apps.map(a => a.official));
  ok(!tor.apps.some(a => a.official === "irs-ss4" || /^(tx|ca-cdtfa|ca-edd)/.test(a.official ?? "")), "no US filing is new for Toronto");
  ok(kinds(tor, "not_needed").some(x => /employer identification/i.test(x.name.en)), "the US EIN isn't needed there");
  const lagos = planTarget(w, src, "Lagos, Nigeria", { today: TODAY });
  ok(lagos.coverage === "none" && /not covered yet/i.test(COVERAGE_SAY[lagos.coverage].en) && !lagos.apps.length, "a place the registry doesn't hold says \"not covered yet\", and invents no steps");

  console.log("\n# The same state: the company's California registration covers Fremont");
  const edd = kinds(fre, "covered").find(x => x.ref === "sj-ca-edd-de1");
  ok(!!edd && /registration in this state already covers/i.test(edd.why.en), "the employer account is reused, not filed again", kinds(fre, "covered"));
  ok(!fre.apps.some(a => a.official === "ca-edd-de1" || a.official === "ca-llc-1" || a.official === "irs-ss4"), "no new state registration, formation or EIN for a store in the same state");
  ok(fre.apps.some(a => a.official === "ca-cdtfa"), "each location still holds its own seller's permit");
  ok(fre.reused.includes("sj-ca-edd-de1") && fre.reused.includes("sj-irs-ss4"), "the reused applications are kept as references");

  console.log("\n# Prefill never invents facts");
  const all = [...dal.apps, ...tor.apps, ...fre.apps];
  const values = all.flatMap(a => a.fields.filter(f => f.value).map(f => ({ a: a.official, l: f.label.en, v: f.value })));
  ok(values.some(x => x.v === LEGAL), "the legal name comes from the approved facts");
  ok(!values.some(x => /you, sole member|•|4471/i.test(x.v)), "no owner description, no masked EIN, nothing that isn't a stated fact", values.filter(x => /you|•/i.test(x.v)));
  ok(!values.some(x => /street|place of business: street|business location address|site address/i.test(x.l)), "no street address before the owner gives one", values.filter(x => /street/i.test(x.l)));
  ok(!values.some(x => /square f|sq\.? ?ft|floor area/i.test(x.l)), "no square footage before the owner gives it");
  ok(!values.some(x => /\b(ssn|social security|phone|e-?mail|ein|fein|employer identification)\b/i.test(x.l)), "no ID, phone or email line filled");
  const filledFrom = all.flatMap(a => a.fields.filter(f => f.value === LEGAL)).every(f => /approved facts/.test(f.from?.en ?? ""));
  ok(filledFrom, "each prefilled line says it came from the source store's approved facts");
  ok(dal.apps.flatMap(a => a.checklist).some(c => c.doc === "d-art") || !dal.apps.some(a => a.checklist.some(c => /articles of organization/i.test(c.label.en))), "a company document the source has is reused by reference");
  ok(!all.flatMap(a => a.checklist).some(c => c.doc === "d-lease"), "a location's document (the lease) is never reused");

  console.log("\n# The comparison, in English and Chinese");
  const t = compareTable(r);
  ok(t.rows.en.length === 3 && t.rows.zh.length === 3 && t.columns.length === 6, "one row a place, six columns");
  ok(/Dallas/.test(t.rows.en[0][0]) && /达拉斯/.test(t.rows.zh[0][0]), "each place named in both languages", t.rows);
  const words = [...bis(r.targets), ...bis(t), ...bis(priceSay(r)), ...bis(openDoes(r)), ...bis(COVERAGE_SAY)];
  ok(!words.some(s => DASH.test(s)), "no em or en dashes in anything said", words.filter(s => DASH.test(s)).slice(0, 3));
  ok(!t.rows.en.flat().some(c => /(^|[^\d,.])0\d/.test(c)), "no leading zeros", t.rows.en);
  ok(/\$299/.test(priceSay(r).en) && /299 美元/.test(priceSay(r).zh), "the price from the current list, in both languages");

  console.log("\n# One approval opens them all; nothing is filed");
  const change: Change = { op: "replicate", source: "sanjose", targets: [{ place: "Dallas, TX", address: "500 Main St, Dallas, TX 75201", sqft: "1,400", opening: "2027-03-01" }, { place: "Toronto, Canada" }] };
  eq(applyChange(change)(w), w, "the core leaves it to the app's approval (src/App.tsx runs openLocations)");
  const after = openLocations(w, "sanjose", change.targets, TODAY);
  const added = (after.stores ?? []).filter(s => s.replica);
  ok(added.length === 2 && added.every(s => s.replica!.source === "sanjose" && s.stage === "opening"), "two new stores, each a copy of San José", added.map(s => s.id));
  const mine = added.flatMap(s => s.apps ?? []);
  ok(mine.length === new Set(mine).size && mine.every(id => after.apps.some(a => a.id === id)), "each location has its own applications");
  ok(after.apps.filter(a => mine.includes(a.id)).every(a => !["filing", "review", "approved"].includes(a.status)), "nothing filed or approved");
  ok(after.approvals.length === w.approvals.length, "no filing put up for approval: the normal pipeline takes it from here");
  ok(added.every(s => openingOf(s, after, TODAY)), "each location's timeline is its own");
  ok(added.every(s => (s.replica!.reused).every(id => w.apps.some(a => a.id === id))) && after.apps.length === w.apps.length + mine.length, "the company's applications are referenced, not copied");
  const dallas = added.find(s => /Dallas/.test(s.name.en))!;
  ok(dallas.address === "500 Main St, Dallas, TX 75201" && dallas.plannedOpen === "2027-03-01" && dallas.replica!.sqft === "1,400", "the location's own facts land on its store");
  const street = after.apps.filter(a => (dallas.apps ?? []).includes(a.id)).flatMap(a => a.fields).filter(f => /500 Main St/.test(f.value));
  ok(street.length > 0 && street.every(f => /this location/.test(f.from?.en ?? "")), "the address fills its lines, said as the location's own", street.slice(0, 2));
  const toronto = added.find(s => /Toronto/.test(s.name.en))!;
  eq(missingFacts(toronto), ["address", "sqft", "opening"], "the batched form asks only the location's facts it doesn't have");
  const later = setLocationFacts(after, { [toronto.id]: { address: "200 Queen St W, Toronto, ON", sqft: "900", opening: "2027-04-01" } });
  eq(missingFacts(later.stores!.find(s => s.id === toronto.id)!), [], "answered once, nothing more is asked");

  console.log("\n# Odelia: \"open 3 more like our San Jose store in Texas\"");
  const ask = readReplicateAsk(w, "open 3 more like our San Jose store in Texas");
  ok(ask.source?.id === "sanjose" && ask.places.length === 3 && ask.places.every(p => /, TX$/.test(p)) && ask.picked, "three Texas cities the registry covers, from the San José store", ask);
  ok(REPLICATE_ASK.test("open 3 more like our San Jose store in Texas") && REPLICATE_ASK.test("像圣何塞店一样在德州再开3家") && !REPLICATE_ASK.test("What permits do I still need for San Jose?"), "the intent, and not a plain question");
  const zh = readReplicateAsk(w, "像圣何塞店一样在德州再开3家");
  ok(zh.places.length === 3 && zh.places.every(p => /, TX$/.test(p)), "the same in Chinese", zh);
  for (const lang of ["en", "zh"] as const) {
    const p = __plansForRecording.plan({ text: lang === "en" ? "Open 3 more like our San Jose store in Texas" : "像圣何塞店一样在德州再开3家" }, { lang, current: SAMPLE_WS });
    const ws1 = (p.updates ?? []).reduce((x, f) => f(x), SAMPLE_WS);
    const card = ws1.approvals.find(a => a.change?.op === "replicate");
    ok(!!p.reply.table && p.reply.table.rows.length === 3 && p.reply.approvals?.length === 1 && card && p.reply.approvals[0] === card.id, `${lang}: the comparison and one approval card`, p.reply);
    ok((ws1.stores ?? []).length === (SAMPLE_WS.stores ?? []).length, `${lang}: nothing opens before the owner approves`);
    ok(!p.reply.text.some(x => DASH.test(x.en) || DASH.test(x.zh)), `${lang}: no dashes in the reply`);
  }
}
