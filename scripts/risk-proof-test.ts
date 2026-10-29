/* Rejection risk before filing (src/risk.ts) and proof of a filing (src/proof.ts). Run: npm run test:risk */
import { normalizeState } from "../src/core";
import { B, same, type Application, type Approval, type Store, type Workspace } from "../src/model";
import { autoFixes, LEARN_MIN_N, overridable, rejectionRisk, riskBlocks, riskFlags, withFixes } from "../src/risk";
import { docKindOf, proofFacts, proofStrength, proofTokenFromPath, PROOF_DAYS } from "../src/proofFacts";

let fails = 0;
const ok = (cond: unknown, m: string, extra?: unknown) => { if (cond) console.log("ok  ", m); else { console.error("FAIL", m, extra === undefined ? "" : JSON.stringify(extra).slice(0, 600)); fails++; } };
const TODAY = "2026-10-29";
const plus = (n: number) => { const d = new Date(TODAY + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const app = (id: string, o: Partial<Application> = {}): Application => ({
  id, name: same(id), agency: same("Agency"), level: "city", status: "ready", fees: [], est: same("about 2 weeks"), source: { label: "x", url: "https://x" },
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
const clean = [f("EIN", "12-3456789"), f("Business email", "mei@goldenox.com"), f("Phone", "(718) 555-0100"), f("ZIP code", "11354"), f("State", "NY"),
  f("Legal business name", "Golden Ox Noodle LLC"), f("Premises address", "39-01 Main St, Flushing, NY 11354")];

/* ---------------- the level ---------------- */
{
  const w = ws({ apps: [app("a1", { fields: clean })], stores: [store({ apps: ["a1"] })] });
  const r = rejectionRisk(w, fileAp("a1"), TODAY);
  ok(r.level === "low" && r.issues.length === 0 && r.checked >= clean.length, "a clean filing is Low, with every line checked", r);
  ok(!riskBlocks(r, false), "Low never blocks");

  // a warning (the name differs from the legal name on file) is Medium, with a one-tap fix to the registered name
  const w2 = ws({ apps: [app("a1", { fields: clean.map(x => (x.id === "Legal business name" ? f(x.id, "Golden Ox Noodles Inc") : x)) })], stores: [store({ apps: ["a1"] })] });
  const r2 = rejectionRisk(w2, fileAp("a1"), TODAY);
  const name = r2.issues.find(x => x.kind === "name");
  ok(r2.level === "medium" && name?.severity === "medium" && !name.hard, "a name that differs from the registration is Medium", r2.issues);
  ok(name?.fix?.value === "Golden Ox Noodle LLC" && name.fix.field === "Legal business name", "with a one-tap fix to the legal name on file", name);
  ok(!riskBlocks(r2, false), "Medium doesn't block");

  // an address that isn't the store's: Medium, fix to the store's own address
  const w3 = ws({ apps: [app("a1", { fields: clean.map(x => (x.id === "Premises address" ? f(x.id, "12 Other Ave, Bayside, NY 11361") : x)) })], stores: [store({ apps: ["a1"] })] });
  const addr = rejectionRisk(w3, fileAp("a1"), TODAY).issues.find(x => x.kind === "address");
  ok(addr?.fix?.value === "39-01 Main St, Flushing, NY 11354", "an address that isn't the store's: fix to the store's address", addr);

  // a definite mistake is High and hard: it blocks, and "send it anyway" isn't offered
  const w4 = ws({ apps: [app("a1", { fields: clean.map(x => (x.id === "Business email" ? f(x.id, "not-an-email") : x)) })] });
  const r4 = rejectionRisk(w4, fileAp("a1"), TODAY);
  ok(r4.level === "high" && r4.issues.some(x => x.hard && x.kind === "email"), "a malformed email is High and can't be sent anyway", r4.issues);
  ok(riskBlocks(r4, true) && !overridable(r4), "a hard issue blocks even when the owner says send it anyway");

  // a placeholder is caught as its own kind
  const w5 = ws({ apps: [app("a1", { fields: [...clean, f("Mailing address", "39-01 Main St, Suite [unit], Flushing, NY 11354")] })] });
  ok(rejectionRisk(w5, fileAp("a1"), TODAY).issues.some(x => x.kind === "placeholder" && x.hard), "a placeholder inside an answer (Suite [unit]) is a hard issue of its own kind");
}

/* ---------------- what Placetta learned ---------------- */
{
  const fields = clean.map(x => (x.id === "Legal business name" ? f(x.id, "Golden Ox Noodles Inc") : x));
  const w = ws({ apps: [app("a1", { fields, official: "irs-ss4" })], stores: [store({ apps: ["a1"] })] });
  // the agency sent back 3 of 4 filings of this form that had a name mismatch: it becomes High, said as a real count
  const learned = rejectionRisk(w, fileAp("a1"), TODAY, { issues: [{ issue: "name", n: 4, sent_back: 3 }] });
  const nm = learned.issues.find(x => x.kind === "name");
  ok(learned.level === "high" && nm?.severity === "high" && nm.source === "learned" && /3 of 4/.test(nm.note.en) && /4 份里机构退回了 3 份/.test(nm.note.zh), "an issue the agency sent back 3 of 4 times is High, with the count", nm);
  ok(overridable(learned) && riskBlocks(learned, false) && !riskBlocks(learned, true), "a learned High blocks until the owner says send it anyway, then doesn't");
  // too few to learn from, or the agency mostly took it: stays Medium
  ok(rejectionRisk(w, fileAp("a1"), TODAY, { issues: [{ issue: "name", n: LEARN_MIN_N - 1, sent_back: LEARN_MIN_N - 1 }] }).level === "medium", "under 3 decided filings, nothing is learned");
  ok(rejectionRisk(w, fileAp("a1"), TODAY, { issues: [{ issue: "name", n: 10, sent_back: 2 }] }).level === "medium", "an issue the agency mostly accepted stays Medium");

  // the form's own return rate: said as a count, only with 5 or more decided and 25% or more back
  const wc = ws({ apps: [app("a1", { fields: clean, official: "irs-ss4" })] });
  const rate = rejectionRisk(wc, fileAp("a1"), TODAY, { stats: [{ form: "irs-ss4", n: 8, median_days: 6, p90_days: 9, rejected_pct: 50 }] }).issues.find(x => x.kind === "agency_rate");
  ok(rate?.severity === "medium" && /4 of the 8/.test(rate.note.en) && !/%/.test(rate.note.en), "the form's return rate is a real count, never a percentage", rate);
  ok(!rejectionRisk(wc, fileAp("a1"), TODAY, { stats: [{ form: "irs-ss4", n: 4, median_days: 6, p90_days: 9, rejected_pct: 50 }] }).issues.some(x => x.kind === "agency_rate"), "fewer than 5 decided: not said");
  ok(!rejectionRisk(wc, fileAp("a1"), TODAY, { stats: [{ form: "irs-ss4", n: 40, median_days: 6, p90_days: 9, rejected_pct: 10 }] }).issues.some(x => x.kind === "agency_rate"), "a low return rate: not said");
}

/* ---------------- timing against the opening ---------------- */
{
  const w = ws({ apps: [app("a1", { fields: clean, official: "irs-ss4" })], stores: [store({ apps: ["a1"], plannedOpen: plus(10) })] });
  const t = rejectionRisk(w, fileAp("a1"), TODAY, { stats: [{ form: "irs-ss4", n: 6, median_days: 30, p90_days: 45, rejected_pct: 0 }] }).issues.find(x => x.kind === "timing");
  ok(t?.severity === "medium" && /about 30 days/.test(t.note.en) && /in 10/.test(t.note.en), "the agency's usual 30 days against an opening in 10 is Medium, with both numbers", t);
  const far = ws({ apps: [app("a1", { fields: clean, official: "irs-ss4" })], stores: [store({ apps: ["a1"], plannedOpen: plus(120) })] });
  ok(!rejectionRisk(far, fileAp("a1"), TODAY, { stats: [{ form: "irs-ss4", n: 6, median_days: 30, p90_days: 45, rejected_pct: 0 }] }).issues.some(x => x.kind === "timing"), "plenty of time: nothing said");
}

/* ---------------- fixes Odelia makes herself ---------------- */
{
  const w = ws();
  const a = app("a1", { fields: [f("EIN", "123456789"), f("State", "new york"), f("State of formation", "Delaware"), f("Legal business name", "golden  ox noodle llc"), f("City", "  Flushing  "), f("SSN", "123456789"), f("Phone", "7185550100")] });
  const fx = autoFixes(w, a);
  const to = (id: string) => fx.find(x => x.field === id)?.to;
  ok(to("EIN") === "12-3456789", "an EIN without its dash gets one", fx);
  ok(to("State of formation") === "DE", "a state spelled out becomes its code");
  ok(to("State") === undefined || to("State") === "NY", "a state line written in words is fixed only when it's a real state");
  ok(to("Legal business name") === "Golden Ox Noodle LLC", "the legal name in its registered spelling when only case and spacing differ");
  ok(to("City") === "Flushing", "stray spaces go");
  ok(to("SSN") === undefined && to("Phone") === undefined, "a person's number and anything that needs judgement are left alone");
  const fixed = withFixes(a, fx);
  ok(fixed.fields.find(x => x.id === "EIN")?.value === "12-3456789" && /Odelia fixed it/.test(fixed.fields.find(x => x.id === "EIN")?.from?.en ?? ""), "each fixed line says Odelia fixed it, and why");
  ok(autoFixes(w, app("a2", { fields: [f("Legal business name", "Golden Ox Noodles Inc")] })).length === 0, "a different name is never changed silently: that's the owner's one tap");
}

/* ---------------- what's kept with the filing ---------------- */
{
  const w = ws({ apps: [app("a1", { fields: clean.map(x => (x.id === "Legal business name" ? f(x.id, "Golden Ox Noodles Inc") : x)), official: "irs-ss4" })], stores: [store({ apps: ["a1"] })] });
  const r = rejectionRisk(w, fileAp("a1"), TODAY, { issues: [{ issue: "name", n: 5, sent_back: 4 }] });
  const k = riskFlags(r, { at: "2026-10-29T12:00:00Z" });
  ok(k.level === "high" && k.flags.some(x => x.issue === "name" && x.severity === "high") && k.override?.at, "the flags carry each issue's kind and severity, and the owner's override", k);
  ok(!JSON.stringify(k).includes("Golden Ox"), "never a value from the form");
}

/* ---------------- proof ---------------- */
{
  const day = (iso: string) => same(iso.slice(0, 10));
  const facts = proofFacts({ title: same("EIN"), status: "accepted", channel: "fax", approved_at: "2026-10-01T10:00:00Z", submitted_at: "2026-10-02T10:00:00Z", decided_at: "2026-10-08T10:00:00Z", confirmation_number: "EIN-123", license_expires: null }, day);
  ok(facts.map(x => x.k).join(",") === "status,approved,sent,submitted,confirmation,decided", "the facts in order, each only when known", facts.map(x => x.k));
  ok(facts.find(x => x.k === "confirmation")?.mono === true && facts.find(x => x.k === "sent")?.value.en === "By fax", "the confirmation number set apart, the channel in words");
  ok(proofStrength({ title: same("x"), status: "accepted" }, false).level === "agency", "approved by the agency is the strongest proof");
  ok(proofStrength({ title: same("x"), status: "submitted", confirmation_number: "C1" }, false).level === "agency", "the agency's confirmation number is proof");
  ok(proofStrength({ title: same("x"), status: "submitted", submitted_at: "2026-10-02" }, true).level === "sent", "Placetta's record alone is only 'sent'");
  ok(proofStrength({ title: same("x"), status: "requested" }, false).level === "none", "nothing sent: no proof");
  const W = "11111111-1111-1111-1111-111111111111";
  ok(docKindOf({ name: "x.pdf", path: `${W}/forms/ss4.pdf`, source: "agent" }, { formPath: `${W}/forms/ss4.pdf` }) === "form", "the filed form");
  ok(docKindOf({ name: "review.png", path: `${W}/receipts/r.png`, mime: "image/png", source: "agent" }) === "screenshot", "a page the worker saw");
  ok(docKindOf({ name: "confirmation.pdf", path: `${W}/receipts/c.pdf`, mime: "application/pdf", source: "agent" }) === "receipt", "a receipt");
  ok(docKindOf({ name: "Health permit.pdf", path: `${W}/agency/p.pdf`, source: "agency" }) === "license", "the agency's license");
  ok(docKindOf({ name: "Letter.pdf", path: `${W}/agency/l.pdf`, source: "agency" }) === "agency", "the agency's letter");
  ok(proofTokenFromPath("/app/proof/" + "a".repeat(48)) === "a".repeat(48) && proofTokenFromPath("/app/proof/" + "a".repeat(47)) === null && proofTokenFromPath("/app/proof/../x") === null, "a shared proof's token, and nothing else, from the address");
  ok(Math.max(...PROOF_DAYS) <= 30, "a shared proof lasts 30 days at most (the database holds the same)");
}

if (fails) { console.error(`\n${fails} failed`); process.exit(1); }
console.log("\nrisk and proof: all passed");
