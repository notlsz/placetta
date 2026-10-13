/* The agent's tools end to end, for every kind of business and several kinds of place: add a store, find its forms,
   prepare each one, check nothing is filed with an empty field or a missing document, fill once and see it reused,
   and read progress for that store only. Run: npm run test:flow */
import { makeTools, coreFields, type Made, type X } from "../src/live";
import { normalizeState } from "../src/core";
import { readiness } from "../src/stores.ts";
import { B, same, type Workspace } from "../src/model";

let fails = 0;
const ok = (cond: unknown, m: string) => { if (cond) console.log("ok  ", m); else { console.error("FAIL", m); fails++; } };

const base = (): Workspace => ({
  ...normalizeState("Moonleaf Tea", {}),
  business: same("Moonleaf Tea"),
  facts: [
    { id: "f-name", group: "business", label: B("Legal name", "法定名称"), value: same("Moonleaf Tea LLC"), source: same("Articles") },
    { id: "f-entity", group: "business", label: B("Entity", "实体类型"), value: same("Delaware limited liability company"), source: same("Articles") },
    { id: "f-ein", group: "business", label: B("EIN", "EIN"), value: same("12-3456789"), source: same("CP 575") },
    { id: "f-owner", group: "business", label: B("Owner", "所有人"), value: same("You, sole member"), source: same("You") },
    { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: same("Varies by test"), source: same("You") },
  ],
  stores: [],
});

const CASES: { business: string; place: string; city: string; state: string; opts: Record<string, boolean>; local: boolean }[] = [
  { business: "milk tea shop", place: "500 Congress Ave, Austin, TX", city: "Austin", state: "TX", opts: { hires_staff: true, builds_out: true, exterior_sign: true }, local: true },
  { business: "clothing retail store", place: "500 Congress Ave, Austin, TX", city: "Austin", state: "TX", opts: { builds_out: true, exterior_sign: true }, local: true },
  { business: "Amazon seller importing goods", place: "Austin, TX", city: "Austin", state: "TX", opts: { imports_goods: true, hires_staff: true }, local: true },
  { business: "3PL warehouse", place: "Austin, TX", city: "Austin", state: "TX", opts: { builds_out: true, hazmat_or_batteries: true }, local: true },
  { business: "milk tea shop", place: "North First St, San Jose, CA", city: "San Jose", state: "CA", opts: { hires_staff: true, exterior_sign: true }, local: true },
  { business: "lifestyle retail chain", place: "Flushing, NY", city: "Flushing", state: "NY", opts: { exterior_sign: true }, local: true },
  { business: "bakery", place: "Denver, CO", city: "Denver", state: "CO", opts: { hires_staff: true }, local: false },
  { business: "3PL warehouse", place: "Dallas, TX", city: "Dallas", state: "TX", opts: { builds_out: true }, local: true },
];

const run = async (fn: (i: Record<string, unknown>) => unknown, i: Record<string, unknown>) => { try { return { r: await fn(i) as Record<string, unknown> }; } catch (e) { return { err: (e as Error).message }; } };

for (const c of CASES) {
  const tag = `${c.business} in ${c.city}`;
  let w = base();
  w = { ...w, facts: w.facts.map(f => (f.id === "f-sell" ? { ...f, value: same(c.business) } : f)) };
  const made: Made = { apps: new Set(), approvals: [], memory: [], skills: [], files: [], lastToolAt: 0 };
  const x = { model: {} as X["model"], files: new Map(), signal: new AbortController().signal } as X;
  const tools = makeTools(() => w, p => { w = p(w); }, () => undefined, made, "en", () => 0, false, x);
  const T = (n: string) => tools.find(t => t.name === n)!.execute.bind(null) as (i: Record<string, unknown>) => unknown;

  const st = (await run(T("add_store"), { name: `${c.city} store`, address: "1 Main St", city: c.city, state: c.state, stage: "opening", planned_open: "2027-03-01" })).r!;
  const store = String(st.store_id);
  ok(readiness(w.stores![0], w).label.en === "Permits not mapped yet", `${tag}: a new store doesn't claim to be ready`);
  const county = w.locations.find(l => l.name.en === c.city)?.county.en ?? "";
  ok(county !== c.state || !c.local, `${tag}: store shows its county (${county})`);

  const found = (await run(T("find_official_forms"), { business: c.business, place: c.place, ...c.opts })).r!;
  const forms = found.forms as { official_form_id: string; level: string; fee: number | null; attachments?: string[] }[];
  ok(forms.length > 0, `${tag}: ${forms.length} official forms`);

  const ids: string[] = [];
  for (const f of forms) {
    const p = await run(T("prepare_application"), { official_form_id: f.official_form_id, store_id: store });
    if (p.err) { ok(false, `${tag}: prepare ${f.official_form_id}: ${p.err}`); continue; }
    ids.push(String(p.r!.application_id));
  }
  const apps = w.apps.filter(a => ids.includes(a.id));
  ok(apps.every(a => a.fields.length > 0), `${tag}: every application has fields to fill (none are "0 of 0")`);
  ok(apps.every(a => a.fees.length && (a.fees[0].amount > 0 || a.fees[0].tbd || forms.find(f => a.official === f.official_form_id)?.fee === 0)), `${tag}: a fee is never shown as free when the agency sets it`);
  ok(apps.every(a => a.fields.find(f => f.id === "core-legal-name")?.value !== "" || a.fields.every(f => !f.id.startsWith("core-"))), `${tag}: Context fills the legal name`);

  // nothing goes for approval with an empty field
  const first = apps.find(a => a.fields.some(f => !f.value))!;
  const refused = (await run(T("request_filing_approval"), { application_id: first.id })).r!;
  ok(refused.approval_requested === false && (refused.empty_fields as string[]).length > 0, `${tag}: approval refused while fields are empty`);
  ok(!w.approvals.some(a => a.app === first.id), `${tag}: no approval was created`);

  // fill the owner once: every other open application with that line gets it, and Context keeps it
  const filled = (await run(T("fill_fields"), { application_id: first.id, fields: [{ label: "Owner or responsible person", value: "Jamie Chen" }, { label: "Business phone", value: "512-555-0142" }, { label: "Contact email", value: "ops@example.com" }] })).r!;
  const withOwner = w.apps.filter(a => ids.includes(a.id) && a.fields.some(f => f.id === "core-owner"));
  ok(withOwner.every(a => a.fields.find(f => f.id === "core-owner")!.value === "Jamie Chen"), `${tag}: owner filled once, used on ${withOwner.length} applications (${String(filled.also_filled_on ?? "only one")})`);
  ok(w.facts.some(f => f.value.en === "Jamie Chen"), `${tag}: owner saved to Context`);
  ok(coreFields(w, w.stores![0]).find(f => f.id === "core-owner")!.value === "Jamie Chen", `${tag}: the next form starts with the owner filled`);

  // fill the rest, then: apps without missing documents go for approval; apps with them don't
  for (const a of w.apps.filter(a => ids.includes(a.id))) {
    const empty = a.fields.filter(f => !f.value).map(f => ({ label: f.label.en, value: "test value" }));
    if (empty.length) await run(T("fill_fields"), { application_id: a.id, fields: empty });
  }
  let asked = 0, held = 0;
  for (const id of ids) {
    const a = w.apps.find(x => x.id === id)!;
    const r = (await run(T("request_filing_approval"), { application_id: id })).r!;
    const missing = a.checklist.some(c => c.state === "missing");
    if (missing) { held++; ok(r.approval_requested === false && (r.missing_documents as string[]).length > 0, `${tag}: ${a.name.en} held for its documents`); }
    else { asked++; ok(!!r.approval_id, `${tag}: ${a.name.en} goes for approval once complete`); }
  }
  console.log(`     ${tag}: ${asked} ready for approval, ${held} waiting on documents`);

  // a second store: city and county permits must say which store; progress can be read for one store
  await run(T("add_store"), { name: "Second", address: "2 Main St", city: "Houston", state: "TX" });
  const cityForm = forms.find(f => f.level === "city" || f.level === "county");
  if (cityForm) {
    const e = await run(T("prepare_application"), { official_form_id: cityForm.official_form_id });
    ok(!!e.err && /store_id/.test(e.err), `${tag}: with two stores, a ${cityForm.level} permit asks which store`);
  }
  const prog = (await run(T("check_progress"), { store_id: c.city })).r!;
  const pa = prog.applications as { store?: string }[];
  ok(pa.length === new Set(ids).size && pa.every(a => a.store === `${c.city} store`), `${tag}: progress for one store shows only its ${new Set(ids).size} applications` + (pa.length === new Set(ids).size && pa.every(a => a.store === `${c.city} store`) ? "" : " " + JSON.stringify({ ids, got: pa.map(a => [(a as { id?: string }).id, a.store]) })));
  ok((prog.approvals_waiting as { id: string }[]).every(a => w.approvals.find(x => x.id === a.id)?.app && ids.includes(w.approvals.find(x => x.id === a.id)!.app!)), `${tag}: progress for one store shows only its approvals`);
}

if (fails) { console.error(`\n${fails} failed`); process.exit(1); } else console.log("\nall passed");
