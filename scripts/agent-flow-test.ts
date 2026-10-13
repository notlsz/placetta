/* The agent's tools end to end, for every kind of business and several kinds of place: add a store, find its forms,
   prepare each one, check nothing is filed with an empty field or a missing document, fill once and see it reused,
   and read progress for that store only. Run: npm run test:flow */
import { makeTools, coreFields, type Made, type X } from "../src/live";
import { FORMS } from "../src/forms/registry";
import { applyChange, blockersSay, isBlank, normalizeState } from "../src/core";
import { demoAgent, type AgentEvent, type Request } from "../src/agent";
import { feeText, Prose } from "../src/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readiness } from "../src/stores.ts";
import { B, SAMPLE, same, type Workspace } from "../src/model";

/** A believable answer for a form line, so the check before approval sees real-looking values (it refuses "test value" as a phone). */
const plausible = (label: string) =>
  /\b(ein|fein)\b|employer identification/i.test(label) ? "12-3456789"
  : /\b(ssn|social security|itin)\b/i.test(label) ? "123-45-6789"
  : /e-?mail/i.test(label) ? "owner@moonleaf.com"
  : /phone|telephone|mobile|\bcell\b|\bfax\b/i.test(label) ? "512-555-0100"
  : /\bzip\b|postal code/i.test(label) ? "78701"
  : /^state$/i.test(label) ? "TX"
  : /date|expir|opening|start|effective|birth/i.test(label) && !/update|candidate|mandate/i.test(label) ? "2027-03-01"
  : "test value";

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
    const empty = a.fields.filter(f => !f.value).map(f => ({ label: f.label.en, value: plausible(f.label.en) }));
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
  ok(pa.length === ids.length && pa.every(a => a.store === `${c.city} store`), `${tag}: progress for one store shows only its ${ids.length} applications`);
  ok((prog.approvals_waiting as { id: string }[]).every(a => w.approvals.find(x => x.id === a.id)?.app && ids.includes(w.approvals.find(x => x.id === a.id)!.app!)), `${tag}: progress for one store shows only its approvals`);
}


/* ------------------------------------------- edge cases ------------------------------------------- */

const kit = (w0: Workspace, lang: "en" | "zh" = "en") => {
  let w = w0;
  const made: Made = { apps: new Set(), approvals: [], memory: [], skills: [], files: [], lastToolAt: 0 };
  const x = { model: {} as X["model"], files: new Map(), signal: new AbortController().signal } as X;
  const tools = makeTools(() => w, p => { w = p(w); }, () => undefined, made, lang, () => 0, false, x);
  const call = (n: string, i: Record<string, unknown> = {}) => run(tools.find(t => t.name === n)!.execute.bind(null) as (i: Record<string, unknown>) => unknown, i);
  return { call, get: () => w, set: (f: (w: Workspace) => Workspace) => { w = f(w); } };
};

// the library: one entry per form id, or a form shows twice and the second copy can't be prepared
{ const ids = FORMS.map(f => f.id); ok(new Set(ids).size === ids.length, `edge: every form id in the library is unique (${ids.length} forms)`); }

// the blank rule
ok(["", "   ", "TBD", "tbd", "Unknown", "?", "??", "-", "...", "…", "[owner name]", "<email>", "{phone}", "待定", "to be confirmed", "pending"].every(isBlank), "edge: stand-ins count as blank");
ok(!["N/A", "None", "0", "No", "Unknown Pleasures LLC", "TBD Holdings Inc", "-5", "Jamie"].some(isBlank), "edge: real answers aren't blank (N/A, None, 0, names that contain TBD)");

// stores: how people actually type places
{
  const k = kit(base());
  const tx = (await k.call("add_store", { name: "A", address: "1 Congress Ave", city: "  austin ", state: "Texas" })).r!;
  ok(tx.county === "Travis County, TX" && k.get().stores![0].address === "1 Congress Ave, Austin, TX", "edge: 'Texas' and '  austin ' become Austin, TX in Travis County");
  ok((await k.call("add_store", { name: "B", address: "1 Congress Avenue", city: "Austin", state: "tx" })).r!.already_there === true, "edge: the same address (Ave vs Avenue, tx) isn't added twice");
  ok((await k.call("add_store", { name: "C", city: "Dallas", state: "德州" })).r!.county === "Dallas County, TX", "edge: a state in Chinese works");
  ok(/isn't a US state/.test((await k.call("add_store", { name: "D", city: "Springfield", state: "Narnia" })).err ?? ""), "edge: a made-up state is refused");
  ok(/state is required/.test((await k.call("add_store", { name: "E", city: "Springfield" })).err ?? ""), "edge: a US store needs a state");
  const sh = (await k.call("add_store", { name: "Shanghai", address: "100 Nanjing Rd", city: "Shanghai", country: "China" })).r!;
  ok(sh.county === "China" && !sh.err, "edge: a store abroad needs no state");
  ok(/isn't a country/.test((await k.call("add_store", { name: "F", city: "X", country: "Atlantis" })).err ?? ""), "edge: an unknown country is refused");
  ok(/real date|isn't a/.test((await k.call("add_store", { name: "G", city: "Houston", state: "TX", planned_open: "2027-02-30" })).err ?? ""), "edge: Feb 30 is refused");
  ok(/real date|isn't a/.test((await k.call("add_store", { name: "H", city: "Houston", state: "TX", planned_open: "March 2027" })).err ?? ""), "edge: 'March 2027' is refused, not saved as a date");
  ok(!!(await k.call("add_store", { name: "I", city: "Houston", state: "TX", planned_open: "2020-01-01" })).r!.note, "edge: a past opening date is flagged");

  // two Austin stores: "Austin" alone is ambiguous
  await k.call("add_store", { name: "Austin South", address: "9 Lamar Blvd", city: "Austin", state: "TX" });
  ok(/matches 2 stores/.test((await k.call("check_progress", { store_id: "Austin" })).err ?? ""), "edge: 'Austin' with two Austin stores asks which one");
  ok(!(await k.call("check_progress", { store_id: k.get().stores![0].id })).err, "edge: an exact store id always works");
  ok(/No store matches/.test((await k.call("check_progress", { store_id: "Paris" })).err ?? ""), "edge: an unknown store is said plainly");
  ok(/No store "nope"/.test((await k.call("prepare_application", { official_form_id: "tx-ap201", store_id: "nope" })).err ?? ""), "edge: a wrong store_id is refused, not silently moved");

  // abroad: the core lines don't ask a Shanghai shop for a US EIN
  const shId = k.get().stores!.find(x => x.name.en === "Shanghai")!.id;
  const cn = (await k.call("prepare_application", { name: "Food business license", agency: "Shanghai Municipal Administration for Market Regulation", level: "city", currency: "CNY", fee: 0, store_id: shId })).r!;
  const cnApp = k.get().apps.find(a => a.id === cn.application_id)!;
  ok(cnApp.fields.some(f => f.id === "core-local-tax") && !cnApp.fields.some(f => f.id === "core-ein") && cnApp.currency === "CNY", "edge: abroad asks for the local tax number, not the EIN, in CNY");
}

// applications: duplicates, placeholders, filed ones, stale approvals
{
  const k = kit(base());
  const s1 = String((await k.call("add_store", { name: "One", address: "1 A St", city: "Austin", state: "TX" })).r!.store_id);
  const s2 = String((await k.call("add_store", { name: "Two", address: "2 B St", city: "Austin", state: "TX" })).r!.store_id);
  const a1 = (await k.call("prepare_application", { official_form_id: "aus-co", store_id: s1 })).r!;
  const again = (await k.call("prepare_application", { official_form_id: "aus-co", store_id: s1 })).r!;
  ok((again.already_there === true || again.already_in_workspace === true) && again.application_id === a1.application_id, "edge: the same form for the same store isn't prepared twice");
  const other = (await k.call("prepare_application", { official_form_id: "aus-co", store_id: s2 })).r!;
  ok(other.application_id !== a1.application_id, "edge: the same form for another store is its own application");
  ok(/name and agency/.test((await k.call("prepare_application", { name: "Something" })).err ?? ""), "edge: a made-up application needs a name and an agency");
  ok(/No official form/.test((await k.call("prepare_application", { official_form_id: "made-up-id" })).err ?? ""), "edge: a made-up form id is refused");
  const neg = (await k.call("prepare_application", { name: "Odd fee", agency: "Somewhere", fee: -50, store_id: s1 })).r!;
  ok(k.get().apps.find(a => a.id === neg.application_id)!.fees[0].amount === 0, "edge: a negative fee becomes 0, not a credit");
  const nan = (await k.call("prepare_application", { name: "Text fee", agency: "Somewhere else", fee: "about two hundred", store_id: s1 })).r!;
  ok(k.get().apps.find(a => a.id === nan.application_id)!.fees[0].amount === 0, "edge: a fee in words doesn't break the math");

  const id = String(a1.application_id);
  const tbd = (await k.call("fill_fields", { application_id: id, fields: [{ label: "Owner or responsible person", value: "TBD" }, { label: "Business phone", value: "N/A" }, { label: "Contact email", value: "[email]" }] })).r!;
  ok((tbd.still_empty as string[]).includes("Owner or responsible person") && (tbd.still_empty as string[]).includes("Contact email") && !(tbd.still_empty as string[]).includes("Business phone"), "edge: 'TBD' and '[email]' stay empty, 'N/A' counts");
  ok(!k.get().facts.some(f => f.value.en === "TBD"), "edge: a stand-in isn't saved to Context");
  ok((await k.call("request_filing_approval", { application_id: id })).r!.approval_requested === false, "edge: approval refused while a line says TBD");
  ok(/fields (is empty|must be)/.test((await k.call("fill_fields", { application_id: id, fields: [] })).err ?? ""), "edge: fill with nothing is refused");
  ok(/No application/.test((await k.call("fill_fields", { application_id: "nope", fields: [{ label: "x", value: "y" }] })).err ?? ""), "edge: an unknown application is said plainly");
  const up = await k.call("update_application", { application_id: id, status: "ready" });
  ok(!!up.err && k.get().apps.find(a => a.id === id)!.status !== "ready", "edge: it can't be marked ready by hand, only through approval");

  await k.call("fill_fields", { application_id: id, fields: [{ label: "Owner or responsible person", value: "Jamie Chen" }, { label: "Contact email", value: "ops@example.com" }] });
  const left = k.get().apps.find(a => a.id === id)!.fields.filter(f => isBlank(f.value)).map(f => ({ label: f.label.en, value: plausible(f.label.en) }));
  if (left.length) await k.call("fill_fields", { application_id: id, fields: left });
  await k.call("fill_fields", { application_id: id, fields: [{ label: "Contact email", value: "ops at example" }] });
  const refused = (await k.call("request_filing_approval", { application_id: id })).r!;
  ok(refused.approval_requested === false && (refused.fix as string[]).some(x => /Contact email/.test(x)) && !k.get().approvals.some(x => x.app === id), "edge: a malformed email goes back to Odelia, never to the person");
  await k.call("fill_fields", { application_id: id, fields: [{ label: "Contact email", value: "ops@example.com" }] });
  const ap = (await k.call("request_filing_approval", { application_id: id })).r!;
  ok(!!ap.approval_id, "edge: complete, it goes for approval");
  ok((await k.call("request_filing_approval", { application_id: id })).r!.note === "Already waiting for approval", "edge: asking twice doesn't make two approvals");
  // the person (or a sync) empties a line after approval was asked: the stale approval goes
  k.set(w => ({ ...w, apps: w.apps.map(a => (a.id === id ? { ...a, fields: a.fields.map(f => (f.id === "core-phone" ? { ...f, value: "" } : f)) } : a)) }));
  ok((await k.call("request_filing_approval", { application_id: id })).r!.approval_requested === false && !k.get().approvals.some(a => a.app === id), "edge: a line emptied later takes the old approval away");
  // filed: nothing changes it
  k.set(w => ({ ...w, apps: w.apps.map(a => (a.id === id ? { ...a, status: "review" } : a)) }));
  ok(/already filed/i.test((await k.call("fill_fields", { application_id: id, fields: [{ label: "Business phone", value: "1" }] })).err ?? ""), "edge: a filed application can't be edited");
  ok(/already/i.test((await k.call("request_filing_approval", { application_id: id })).err ?? ""), "edge: a filed application can't be filed again");
  ok((await k.call("prepare_application", { official_form_id: "aus-co", store_id: s1 })).r!.application_id !== id, "edge: once filed, preparing it again (a renewal) makes a new one");

  // deadlines
  ok(/real (calendar )?date/.test((await k.call("add_deadline", { date: "2027-13-01", title: "x" })).err ?? ""), "edge: month 13 is refused");
  ok(/title is required/.test((await k.call("add_deadline", { date: "2027-01-01", title: "  " })).err ?? ""), "edge: a deadline needs a title");
  ok(/No application/.test((await k.call("add_deadline", { date: "2027-01-01", title: "x", application_id: "nope" })).err ?? ""), "edge: a deadline for an unknown application is refused");
  const d1 = (await k.call("add_deadline", { date: "2027-01-15", title: "Book inspection" })).r!;
  ok((await k.call("add_deadline", { date: "2027-01-15", title: "book inspection" })).r!.already_there === true && k.get().deadlines.filter(d => d.date === "2027-01-15").length === 1, "edge: the same deadline isn't added twice");
  ok(!!(await k.call("add_deadline", { date: "2020-01-01", title: "Old" })).r!.note, "edge: a past deadline is flagged as overdue");
  ok(/real (calendar )?date/.test((await k.call("edit_deadline", { deadline_id: d1.deadline_id, date: "2027-02-29" })).err ?? ""), "edge: Feb 29 in a non-leap year is refused when editing");
}

// a brand-new workspace with nothing in Context
{
  const k = kit({ ...normalizeState("New Co", {}), stores: [] });
  const r = (await k.call("prepare_application", { name: "Business license", agency: "City of Boise", level: "city" })).r!;
  const a = k.get().apps.find(x => x.id === r.application_id)!;
  ok(a.fields.length >= 8 && a.fields.find(f => f.id === "core-dba")!.value === "New Co", "edge: with an empty Context the lines are there to fill, and the name is used");
  ok((await k.call("check_progress")).r!.counts !== undefined, "edge: progress works with no stores");
  ok(/no stores yet/i.test((await k.call("prepare_application", { name: "x", agency: "y", store_id: "s" })).err ?? ""), "edge: a store_id before any store exists says to add one");
}

// Chinese
{
  const k = kit(base(), "zh");
  const s = String((await k.call("add_store", { name: "奥斯汀店", address: "1 Congress Ave", city: "Austin", state: "TX" })).r!.store_id);
  const r = (await k.call("prepare_application", { official_form_id: "aus-food-permit", store_id: s })).r!;
  const a = k.get().apps.find(x => x.id === r.application_id)!;
  ok(a.name.zh.includes("食品") && blockersSay(a).zh.startsWith("还不能提交"), "edge: in Chinese the form and what's left read in Chinese");
}

// what the person reads
ok(blockersSay({ fields: Array.from({ length: 9 }, (_, i) => ({ id: "f" + i, label: B("Line " + i, "第" + i + "行"), value: "" })), checklist: [] }).en.includes("and 3 more"), "edge: a long list of what's left is cut short");
const fee = (fees: { amount: number; tbd?: boolean }[], currency?: string) => feeText({ fees: fees.map(f => ({ label: B("", ""), ...f })), currency }, k => ({ free: "No fee", feeTbd: "Set by the agency" } as Record<string, string>)[k] ?? k);
ok(fee([{ amount: 0, tbd: true }]) === "Set by the agency" && fee([{ amount: 312, tbd: true }]) === "$312+" && fee([{ amount: 0 }]) === "No fee" && fee([{ amount: 500 }], "CNY").includes("500"), "edge: fees read right: set by agency, $312+, no fee, other currencies");

// lists in replies
const html = (t: string) => renderToStaticMarkup(createElement(Prose, { text: t }));
ok(html("Done.\n- One\n- Two\nAfter.") === "<p>Done.</p><ul class=\"prose-l\"><li>One</li><li>Two</li></ul><p>After.</p>", "edge: bullets between sentences");
ok(html("1. First\n2. Second") === "<ol class=\"prose-l\"><li>First</li><li>Second</li></ol>", "edge: numbered steps");
ok(html("It's -5 degrees.\nLine two") === "<p>It&#x27;s -5 degrees.<br/>Line two</p>", "edge: a dash mid-sentence isn't a bullet, line breaks kept");
ok(html("- a\n1. b") === "<ul class=\"prose-l\"><li>a</li></ul><ol class=\"prose-l\"><li>b</li></ol>", "edge: a bullet list then a numbered one stay separate");
ok(html("") === "" && html("\n\n") === "", "edge: an empty reply renders nothing");
ok(!html("<script>alert(1)</script>").includes("<script>"), "edge: a reply can't inject markup");

// the demo: its own scripted filings still go through, an incomplete one doesn't
{
  const events: AgentEvent[] = [];
  const ctx = (w: Workspace) => ({ lang: "en" as const, current: w });
  let w = SAMPLE;
  const go = async (req: Request) => { events.length = 0; await demoAgent.run(req, ctx(w), e => { events.push(e); if (e.type === "update") w = e.patch(w); }, new AbortController().signal).catch(() => undefined); return events.find(e => e.type === "reply") as Extract<AgentEvent, { type: "reply" }> | undefined; };
  const signed = await go({ approve: "a-sign" });
  ok(w.apps.find(a => a.id === "sign")!.status === "review" && /Filed/.test(signed?.reply.text[0].en ?? ""), "edge: the demo's sign permit still files");
  w = SAMPLE;
  w = { ...w, apps: w.apps.map(a => (a.id === "sign" ? { ...a, fields: a.fields.map((f, i) => (i === 0 ? { ...f, value: "TBD" } : f)) } : a)) };
  const held = await go({ approve: "a-sign" });
  ok(w.apps.find(a => a.id === "sign")!.status === "ready" && /Not ready/.test(held?.reply.text[0].en ?? ""), "edge: the demo won't file it with a TBD line");
}

// the demo's other scripted filings: prepared by the script, then approved, each still files
{
  let w = SAMPLE;
  const go = async (req: Request) => { let reply: Extract<AgentEvent, { type: "reply" }> | undefined; await demoAgent.run(req, { lang: "en", current: w }, e => { if (e.type === "update") w = e.patch(w); if (e.type === "reply") reply = e; }, new AbortController().signal).catch(() => undefined); return reply; };
  await go({ text: "File everything that's ready" });
  ok(w.approvals.some(a => a.id === "a-edd"), "edge: the demo prepares the employer registration");
  await go({ approve: "a-edd" });
  ok(w.apps.find(a => a.id === "edd")!.status === "review", "edge: the demo files the employer registration once approved");
  await go({ text: "Prepare the statement of information" });
  if (w.approvals.some(a => a.id === "a-soi")) { await go({ approve: "a-soi" }); ok(w.apps.find(a => a.id === "soi")?.status === "approved", "edge: the demo files the statement of information"); }
  const sent = await go({ approve: "a-staff" });
  ok(!!sent && !w.approvals.some(a => a.id === "a-staff"), "edge: a message approval (not a filing) still goes through");
}

// removing a store takes its unfiled applications with it, keeps filed ones
{
  const k = kit(base());
  const s1 = String((await k.call("add_store", { name: "Keep", address: "1 A St", city: "Austin", state: "TX" })).r!.store_id);
  const s2 = String((await k.call("add_store", { name: "Drop", address: "2 B St", city: "Plano", state: "TX" })).r!.store_id);
  const keepApp = String((await k.call("prepare_application", { official_form_id: "aus-co", store_id: s1 })).r!.application_id);
  const dropApp = String((await k.call("prepare_application", { name: "Plano CO", agency: "City of Plano", level: "city", store_id: s2 })).r!.application_id);
  const filedApp = String((await k.call("prepare_application", { name: "Plano sign", agency: "City of Plano", level: "city", store_id: s2 })).r!.application_id);
  k.set(w => ({ ...w, apps: w.apps.map(a => (a.id === filedApp ? { ...a, status: "review" } : a)) }));
  await k.call("add_deadline", { date: "2027-01-01", title: "Plano inspection", application_id: dropApp });
  const rm = (await k.call("remove_store", { store_id: s2 })).r!;
  const ap = k.get().approvals.find(a => a.id === rm.approval_id)!;
  ok(ap.does.length === 2, "edge: the removal says it takes the store's unfiled applications too");
  k.set(applyChange(ap.change!));
  const w = k.get();
  ok(!w.apps.some(a => a.id === dropApp) && w.apps.some(a => a.id === filedApp) && w.apps.some(a => a.id === keepApp), "edge: unfiled applications go with the store, filed and other stores' stay");
  ok(!w.deadlines.some(d => d.app === dropApp) && !w.locations.some(l => l.name.en === "Plano") && w.locations.some(l => l.name.en === "Austin"), "edge: its deadlines and its city go too, other cities stay");
}

if (fails) { console.error(`\n${fails} failed`); process.exit(1); } else console.log("\nall passed");
