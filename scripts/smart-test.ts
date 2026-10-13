/* The checks that make an approval a decision (preflight), where each opening store's permits put its opening date
   (openingPath) and the next asks from the workspace (suggestions). Run: npm run test:smart */
import { normalizeState } from "../src/core";
import { B, same, type Application, type Approval, type Store, type Workspace } from "../src/model";
import { basisLine, cityOf, openingLine, openingPath, parseDate, preflight, suggestions } from "../src/smart";

let fails = 0;
const ok = (cond: unknown, m: string, extra?: unknown) => { if (cond) console.log("ok  ", m); else { console.error("FAIL", m, extra ?? ""); fails++; } };
const TODAY = "2026-10-13";
const plus = (n: number) => { const d = new Date(TODAY + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const app = (id: string, o: Partial<Application> = {}): Application => ({
  id, name: same(id), agency: same("Agency"), level: "city", status: "needs", fees: [], est: same("about 2 weeks"), source: { label: "x", url: "https://x" },
  fields: [], checklist: [], ...o,
});
const store = (o: Partial<Store> = {}): Store => ({ id: "s1", name: same("Main St"), address: "39-01 Main St, Flushing, NY 11354", stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, ...o });
const ws = (o: Partial<Workspace> = {}): Workspace => ({
  ...normalizeState("Golden Ox", {}),
  facts: [{ id: "f-name", group: "business", label: B("Legal name", "法定名称"), value: same("Golden Ox Noodle LLC"), source: same("Articles") }],
  ...o,
});
const fileAp = (appId: string): Approval => ({ id: "ap-" + appId, kind: "file", app: appId, title: same("File"), does: [], action: same("Approve") });
const f = (label: string, value: string) => ({ id: label, label: same(label), value });

/* ---------------- preflight ---------------- */
{
  ok(parseDate("2026-11-02") === "2026-11-02" && parseDate("11/2/2026") === "2026-11-02" && parseDate("Nov 2, 2026") === "2026-11-02" && parseDate("2026年11月2日") === "2026-11-02", "dates: the usual ways of writing one");
  ok(parseDate("2026-02-30") === null && parseDate("13/1/2026") === null && parseDate("soon") === null, "dates: impossible ones aren't dates");
  ok(cityOf("39-01 Main St, Flushing, NY 11354") === "Flushing" && cityOf("500 Congress Ave, Austin, TX") === "Austin", "the city part of an address");

  const good = app("a1", { fields: [
    f("EIN", "12-3456789"), f("Business email", "mei@goldenox.com"), f("Phone", "(718) 555-0100"), f("ZIP code", "11354"), f("State", "NY"),
    f("Legal business name", "Golden Ox Noodle, L.L.C."), f("Premises address", "39-01 Main St, Flushing, NY 11354"), f("Planned opening date", plus(60)),
    f("Seating", "40"), f("Owner home address", "1 Elsewhere Rd, Bayside, NY"),
  ] });
  const w1 = ws({ apps: [good], stores: [store({ apps: ["a1"] })] });
  const p1 = preflight(w1, fileAp("a1"), TODAY);
  ok(p1.errors.length === 0 && p1.warnings.length === 0, "a clean filing passes every check", p1);
  ok(p1.checked === 12, "every line is counted, plus the fee and the twin check", p1.checked);

  const bad = app("a2", { fields: [
    f("EIN", "123456"), f("Contact email", "mei at goldenox"), f("Phone", "555-0100"), f("ZIP", "1135"), f("Food protection certificate expiration date", plus(-3)),
    f("Owner name", "Mei [last name]"),
  ] });
  const p2 = preflight(ws({ apps: [bad] }), fileAp("a2"), TODAY);
  const errs = p2.errors.map(e => e.label.en);
  ok(["EIN", "Contact email", "Phone", "ZIP", "Food protection certificate expiration date", "Owner name"].every(l => errs.includes(l)), "wrong EIN, email, phone, ZIP, an expired date and a placeholder are all errors", errs);

  const soft = app("a3", { fields: [
    f("EIN", "Applied for"), f("Legal business name", "Golden Ox Restaurant Inc"), f("Premises address", "12 Other Ave, Queens, NY 11101"), f("Start date", plus(-10)), f("State", "Nwe York"),
  ] });
  const p3 = preflight(ws({ apps: [soft], stores: [store({ apps: ["a3"] })] }), fileAp("a3"), TODAY);
  const warns = p3.warnings.map(e => e.label.en);
  ok(p3.errors.length === 0 && ["EIN", "Legal business name", "Premises address", "Start date", "State"].every(l => warns.includes(l)), "EIN pending, another legal name, another address, a past start date and a misspelled state are warnings", { errs: p3.errors, warns });

  // lines that take more than one thing: SSN or EIN, and city, state and ZIP together
  const combo = app("a6", { fields: [f("SSN, ITIN, or EIN of responsible party", "12-3456789"), f("City, state, and ZIP code", "Flushing, NY 11354"), f("City, state, and ZIP code (if foreign, see instructions)", "Shenzhen, Guangdong, China")] });
  const p7 = preflight(ws({ apps: [combo] }), fileAp("a6"), TODAY);
  ok(!p7.errors.length && !p7.warnings.length, "an EIN in an SSN-or-EIN line, a full city line, a foreign address", p7);
  const combo2 = app("a7", { fields: [f("City, state, and ZIP code", "Flushing, NY")] });
  ok(preflight(ws({ apps: [combo2] }), fileAp("a7"), TODAY).warnings.length === 1, "a US city line with no ZIP is worth a look");

  // the fee against the agency's published one, and the same form already filed for the same store
  const nycFse = app("a4", { official: "nyc-dohmh-fse", fees: [{ label: same("Fee"), amount: 1 }], fields: [f("Seating", "40")] });
  const twin = app("a5", { official: "nyc-dohmh-fse", status: "review" });
  const p4 = preflight(ws({ apps: [nycFse, twin], stores: [store({ apps: ["a4", "a5"] })] }), fileAp("a4"), TODAY);
  ok(p4.warnings.some(w => w.label.en === "Already filed"), "the same form already filed for this store is flagged", p4.warnings);

  // a message: no recipient, and a promise only an agency can make
  const msg: Approval = { id: "m", kind: "send", title: same("Msg"), does: [], action: same("Send"), data: [f("To", "the landlord"), f("Message", "We guarantee the permit will be approved by Friday.")] };
  const p5 = preflight(ws(), msg, TODAY);
  ok(p5.errors.some(e => e.label.en === "To") && p5.warnings.some(w => w.label.en === "Message"), "a message with no address and a promised approval", p5);
  const p6 = preflight(ws(), { ...msg, data: [f("To", "mei@goldenox.com"), f("Message", "We expect the permit in about two weeks.")] }, TODAY);
  ok(!p6.errors.length && !p6.warnings.length, "a plain message passes", p6);
}

/* ---------------- opening path ---------------- */
{
  // two weeks of agency time from "needs": 14 + 7 days; a chain through a dependency adds up
  const lease = app("lease", { status: "approved" });
  const plan = app("plan", { status: "needs", est: same("about 3 weeks"), checklist: [{ id: "c1", label: same("Signed lease"), state: "missing" }] });
  const permit = app("permit", { status: "waiting", est: same("2 weeks"), checklist: [{ id: "c2", label: same("Approved plans"), state: "missing", dep: "plan" }] });
  const sign = app("sign", { status: "review", est: same("10 business days") });
  const s = store({ apps: ["lease", "plan", "permit", "sign"], plannedOpen: plus(90) });
  const w = ws({ apps: [lease, plan, permit, sign], stores: [s] });
  const p = openingPath(s, w, TODAY);
  // plan: 21 + 7 = 28; permit after it: 28 + 14 + 7 = 49
  ok(p.landing === plus(49) && p.slack === 41 && p.verdict === "on_track", "on track: the longest chain sets the date", p);
  ok(p.blocker?.app === "plan" && p.blocker.on === "you" && /Signed lease/.test(p.blocker.why.en), "the blocker is where the chain starts, with what it needs", p.blocker);

  const late = openingPath({ ...s, plannedOpen: plus(40) }, w, TODAY);
  ok(late.verdict === "late" && late.slack === -9 && /9 days behind/.test(openingLine(late)!.en) && /plan: needs from you/.test(openingLine(late)!.en), "late: by how much and why", openingLine(late));
  const tight = openingPath({ ...s, plannedOpen: plus(52) }, w, TODAY);
  ok(tight.verdict === "tight" && tight.slack === 3, "tight under a week", tight);

  ok(openingPath(store({ apps: [] }), w, TODAY).verdict === "not_mapped", "a store with nothing mapped says so");
  ok(openingPath(store({ stage: "open", opened: "2026-01-01" }), w, TODAY).verdict === "open", "an open store has no path");
  const nodate = openingPath({ ...s, plannedOpen: undefined }, w, TODAY);
  ok(nodate.verdict === "no_date" && nodate.landing === plus(49), "no opening date: still says when the permits land");

  // unknown agency time is counted at 30 days and reported; a loop in the data doesn't hang
  const a = app("x", { status: "todo", est: same("No standard time"), checklist: [{ id: "c", label: same("y"), state: "missing", dep: "y" }] });
  const b = app("y", { status: "todo", est: same("1 week"), checklist: [{ id: "c", label: same("x"), state: "missing", dep: "x" }] });
  const loop = openingPath(store({ apps: ["x", "y"], plannedOpen: plus(200) }), ws({ apps: [a, b] }), TODAY);
  ok(loop.guessed === 1 && loop.landing !== null, "unknown agency time is guessed and counted; a loop ends", loop);

  // everything approved: lands today
  const done = openingPath(store({ apps: ["lease"], plannedOpen: plus(5) }), ws({ apps: [lease] }), TODAY);
  ok(done.landing === TODAY && done.verdict === "tight" && done.slack === 5 && !done.blocker, "all approved: permits in hand now, nothing holding it up", done);
}

/* ---------------- substance, not just format ---------------- */
{
  // an NYC food permit on an Austin store goes to the wrong agency; a Flushing store is right
  const fse = app("f1", { official: "nyc-fse", fields: [f("Seating", "40")] });
  const austin = store({ id: "sa", address: "500 Congress Ave, Austin, TX 78701", apps: ["f1"] });
  const wrong = preflight(ws({ business: same("Golden Ox Noodle"), apps: [fse], stores: [austin] }), fileAp("f1"), TODAY);
  ok(wrong.errors.some(e => e.label.en === "Agency" && /wrong agency/.test(e.note.en)), "a New York City form on an Austin store is stopped", wrong.errors);
  const right = preflight(ws({ business: same("Golden Ox Noodle"), apps: [fse], stores: [store({ apps: ["f1"] })] }), fileAp("f1"), TODAY);
  ok(!right.errors.some(e => e.label.en === "Agency"), "the same form on a Flushing store goes through");
  ok(right.warnings.some(w => w.label.en === "Form lines"), "lines the agency's own form asks that the application lacks are named", right.warnings);
  // a food permit for a clothing store
  const clothes = preflight(ws({ business: same("Northwind Apparel clothing boutique"), apps: [fse], stores: [store({ apps: ["f1"] })] }), fileAp("f1"), TODAY);
  ok(clothes.warnings.some(w => w.label.en === "Business type"), "a food permit for a clothing store is questioned", clothes.warnings);
  // "Line 9b: Phone" is checked as a phone line
  const lined = app("l1", { fields: [f("Line 9b: Applicant's telephone number", "call me")] });
  ok(preflight(ws({ apps: [lined] }), fileAp("l1"), TODAY).errors.length === 1, "a numbered line is checked on what it asks");
}

/* ---------------- the estimate stands on evidence ---------------- */
{
  const inReview = app("r", { status: "review", est: same("about 4 weeks") });
  const s = store({ apps: ["r"], plannedOpen: plus(30) });
  const w = ws({ apps: [inReview] });
  // no submission date: half the agency time
  ok(openingPath(s, w, TODAY).landing === plus(14), "with the agency, no date known: half its time", openingPath(s, w, TODAY));
  // submitted 25 days ago of 28: 3 days left
  const sent = openingPath(s, w, TODAY, { submitted: { r: plus(-25) + "T10:00:00Z" } });
  ok(sent.landing === plus(3), "submitted 25 days ago: counted from that day", sent);
  // overdue at the agency still leaves a couple of days, never a date in the past
  ok(openingPath(s, w, TODAY, { submitted: { r: plus(-60) } }).landing === plus(2), "past the agency's time: 2 days, not the past");
  // Placetta's own filings of that form win over the published time, and the line stops saying "about"
  const official = app("o", { status: "needs", est: same("about 2 weeks"), official: "nyc-fse" });
  const so = store({ apps: ["o"], plannedOpen: plus(60) });
  const measured = openingPath(so, ws({ apps: [official] }), TODAY, { stats: [{ form: "nyc-fse", n: 12, median_days: 20, p90_days: 31, rejected_pct: 8 }] });
  ok(measured.landing === plus(38) && measured.basis.measured === 1 && !/about/.test(openingLine(measured)!.en), "measured times: precise, no 'about'", { measured, line: openingLine(measured) });
  const published = openingPath(so, ws({ apps: [official] }), TODAY);
  ok(/about/.test(openingLine(published)!.en) && /agency's published time for 1/.test(basisLine(published)!.en), "published times: said as an estimate, and why", basisLine(published));
  ok(openingPath(so, ws({ apps: [official] }), TODAY, { stats: [{ form: "nyc-fse", n: 2, median_days: 5, p90_days: 6, rejected_pct: 0 }] }).basis.measured === 0, "two filings aren't enough to measure");
}

/* ---------------- suggestions ---------------- */
{
  const FALL = [B("Where does everything stand?", "进展如何？")];
  const plan = app("plan", { status: "needs", est: same("about 3 weeks"), checklist: [{ id: "c1", label: same("Signed lease"), state: "missing" }] });
  const late = store({ id: "s1", name: same("Main St"), apps: ["plan"], plannedOpen: plus(10) });
  const open = store({ id: "s2", name: same("Bell Blvd"), stage: "open", permits: [{ name: same("Food service permit"), expires: plus(20) }] });
  const w = ws({ apps: [plan], stores: [late, open], approvals: [fileAp("a"), fileAp("b")] });
  const s = suggestions(w, TODAY, FALL).map(x => x.en);
  ok(s[0] === "Walk me through the 2 filings waiting for my approval", "filings waiting come first", s);
  ok(s.includes("How do we get Main St back on schedule?") && s.includes("Renew Food service permit for Bell Blvd") && s.includes("What do you still need from me for plan?"), "a slipping store, a renewal and what's missing", s);
  ok(s[s.length - 1] === FALL[0].en, "the fixed list fills in after", s);
  const empty = suggestions(ws(), TODAY, FALL).map(x => x.en);
  ok(empty[0] === "Map every license my first store needs", "a new workspace starts with mapping", empty);
}

if (fails) { console.error(`\n${fails} failed`); process.exit(1); } else console.log("\nall passed");
