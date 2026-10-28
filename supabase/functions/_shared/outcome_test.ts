// deno test supabase/functions/_shared/outcome_test.ts
// Outcome pricing, the Stripe side (outcome.ts), against a fake Stripe that keeps idempotency keys the way Stripe does:
// approving saves the card and charges nothing, approval charges once (retries never twice), rejected through
// Placetta's fault refunds or voids, rejected not through its fault charges the same one charge, SCA sends the pay
// link, a refused card runs the dunning, and a legacy invoice is untouched. The database side is
// supabase/tests/outcome_pricing.sql.
import { deepStrictEqual as eq, ok } from "node:assert";
import { collect, needsAuth, sweep, undo, type Claimed, type Deps, type Notice, type Obj } from "./outcome.ts";
import { applyCheckoutSession, applyInvoice, type Db } from "./stripe_apply.ts";
import { simpleQuote } from "../billing/logic.ts";
import { chargedOnApproval, OUTCOME_RULE, REJECTION_REASONS, SIMPLE, SIMPLE_PRICE_ENV } from "../../../src/pricing.ts";

type Call = { path: string; params?: Record<string, string>; idem?: string };
function fakeStripe(o: { payFails?: { code: string; status?: number }[]; crashAfterInvoice?: boolean } = {}) {
  const calls: Call[] = [], seen = new Map<string, Obj>(), invoices = new Map<string, Obj>();
  let n = 0;
  const fails = [...(o.payFails ?? [])];
  let crash = !!o.crashAfterInvoice;
  const stripe = {
    calls, invoices,
    async get(path: string) {
      calls.push({ path });
      const m = /^invoices\/(in_\w+)$/.exec(path);
      if (m && invoices.has(m[1])) return structuredClone(invoices.get(m[1])!);
      if (path.startsWith("invoice_payments")) return { data: [{ payment: { payment_intent: "pi_paid1" } }] };
      if (path.startsWith("checkout/sessions/")) return { id: path.split("/")[2], payment_intent: "pi_cs1" };
      throw Object.assign(new Error("not found"), { status: 404 });
    },
    async post(path: string, params: Record<string, string>, idem?: string) {
      calls.push({ path, params, idem });
      if (idem && seen.has(idem)) return structuredClone(seen.get(idem)!);    // Stripe's idempotency
      let out: Obj;
      if (path === "invoices") { const id = `in_fake${++n}`; out = { id, status: "draft", amount_due: 0, lines: { total_count: 0 }, hosted_invoice_url: `https://invoice.stripe.com/i/${id}`, metadata: params }; invoices.set(id, out); }
      else if (path === "invoiceitems") { const inv = invoices.get(params.invoice)!; inv.lines.total_count += 1; inv.amount_due += 14900 * (params["pricing[price]"] === "price_complex" ? 999 / 149 : 1); out = { id: `ii_${n}` }; }
      else if (/\/finalize$/.test(path)) { const inv = invoices.get(path.split("/")[1])!; inv.status = "open"; out = inv; }
      else if (/\/pay$/.test(path)) {
        const inv = invoices.get(path.split("/")[1])!;
        if (crash) { crash = false; throw Object.assign(new Error("network"), { status: 500 }); }
        const f = fails.shift();
        if (f) { const e = Object.assign(new Error(f.code), { status: f.status ?? 402, code: f.code }); throw e; }   // a failure is never cached here: the next key differs or the sweep stops
        inv.status = "paid"; out = inv;
      }
      else if (/\/void$/.test(path)) { const inv = invoices.get(path.split("/")[1])!; inv.status = "void"; out = inv; }
      else if (path === "refunds") out = { id: `re_${++n}`, payment_intent: params.payment_intent, amount: Number(params.amount) };
      else if (/^invoices\/in_\w+$/.test(path)) { const inv = invoices.get(path.split("/")[1])!; Object.assign(inv, { auto_advance: params.auto_advance === "true" }); out = inv; }
      else out = { id: `x_${++n}` };
      if (idem) seen.set(idem, structuredClone(out));
      return structuredClone(out);
    },
  };
  return stripe;
}

/** The database's state machine for one charge, as license_outcome_result has it. */
function fakeDeps(stripe: ReturnType<typeof fakeStripe>, rows: Claimed[], opt: { rejectedOurs?: boolean } = {}) {
  const status: Record<string, string> = {}, refs: Record<string, string | null> = {}, notices: [Notice, string | null | undefined][] = [], tasks: string[] = [];
  for (const r of rows) { status[r.id] = r.job === "undo" ? "refund_due" : "due"; refs[r.id] = r.stripe_ref; }
  const d: Deps = {
    stripe,
    priceId: async (tier) => (tier === "complex" ? "price_complex" : "price_license"),
    notify: async (_c, kind, url) => { notices.push([kind, url]); },
    team: async (_c, title) => { tasks.push(title); },
    rpc: async (fn, a) => {
      if (fn === "license_outcome_claim") {
        const out = rows.filter((r) => status[r.id] === "due" || status[r.id] === "refund_due").map((r) => ({ ...r, stripe_ref: refs[r.id] }));
        for (const r of out) status[r.id] = status[r.id] === "due" ? "charging" : "refunding";
        return { data: out, error: null };
      }
      if (fn === "license_outcome_invoice") { refs[a.p_id as string] ??= a.p_invoice as string; return { data: true, error: null }; }
      if (fn === "license_outcome_result") {
        const id = a.p_id as string, st = status[id], res = a.p_result as string;
        let next = "unchanged";
        if (res === "paid" && ["charging", "due", "action", "failed"].includes(st)) next = opt.rejectedOurs ? "refund_due" : "used";
        else if ((res === "action" || res === "failed") && st === "charging") next = res;
        else if (res === "retry" && st === "charging") next = "due";
        else if (res === "retry" && st === "refunding") next = "refund_due";
        else if (res === "refunded" && st === "refunding") next = "refunded";
        else if (res === "undone" && st === "refunding") next = "waived";
        if (next !== "unchanged") status[id] = next;
        return { data: res === "retry" && next !== "unchanged" ? "retry" : next, error: null };
      }
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
  };
  return { d, status, refs, notices, tasks };
}

const row = (o: Partial<Claimed> = {}): Claimed => ({ id: "11111111-1111-1111-1111-111111111111", workspace_id: "ws1", ref: "sj-sign", tier: "license", cents: 14900, job: "charge", collect: "on_approval",
  stripe_ref: null, payment_method: "pm_card1", fault: null, outcome: "approved", attempts: 1, filing_id: "f1", customer: "cus_1", title: { en: "Sign permit", zh: "招牌许可" }, ...o });
const pays = (s: ReturnType<typeof fakeStripe>) => s.calls.filter((c) => /\/pay$/.test(c.path));
const paidInvoices = (s: ReturnType<typeof fakeStripe>) => [...s.invoices.values()].filter((i) => i.status === "paid").length;

Deno.test("the founder's numbers: $149 and $999, charged on the agency's decision, from their own Stripe prices", () => {
  eq([SIMPLE.licenseOnApprovalUsd, SIMPLE.complexOnApprovalUsd, SIMPLE.planStoreMonthUsd, SIMPLE.renewalUsd], [149, 999, 149, 99]);
  eq([SIMPLE_PRICE_ENV.license.cents, SIMPLE_PRICE_ENV.license.lookup, SIMPLE_PRICE_ENV.complex.cents], [14900, "placetta_license_on_approval", 99900]);
  ok(chargedOnApproval("license") && chargedOnApproval("complex") && !chargedOnApproval("renewal") && !chargedOnApproval("plan"));
  eq(REJECTION_REASONS.filter((r) => r.ours).map((r) => r.id), ["placetta_wrong_value", "placetta_wrong_form", "placetta_missed_document"]);
  eq(REJECTION_REASONS.filter((r) => !r.ours).map((r) => r.id), ["zoning", "ineligible", "owner_info", "owner_withdrew"]);
});

Deno.test("the approval card: $149 when approved, nothing if it's our mistake, never 'nothing unless approved'", () => {
  const base = { renewal: false, paid: null, chain: false, onPlan: false, automated: false, priceOk: () => true };
  const q = simpleQuote({ name: "Sign permit", govFeeUsd: 445 }, base);
  eq([q.tier, q.cents], ["license", 14900]);
  ok(q.line.en.startsWith("$149 when the license is approved. If it's turned down because of a mistake on our side, you pay nothing."), q.line.en);
  ok(q.line.en.includes("for another reason (zoning, the law, information it was given, or you withdraw it), the price is charged too"));
  ok(q.line.en.includes("Nothing is charged today") && q.line.zh.includes("今天不收取任何费用"));
  ok(!/nothing unless|only when the city approves/i.test(q.line.en));
  ok(!/[–—]/.test(q.line.en + q.line.zh + OUTCOME_RULE.short.en + OUTCOME_RULE.other.en), "no dashes");
  const a = simpleQuote({ name: "Sign permit", govFeeUsd: null }, { ...base, authorized: { tier: "license", cents: 14900 } });
  ok(a.authorized && a.cents === 14900 && a.line.en.includes("nothing has been charged yet"));
  eq(simpleQuote({ name: "Alcoholic beverage license", govFeeUsd: null }, base).cents, 99900);
});

Deno.test("approval saves the card and charges nothing", async () => {
  const rpcs: [string, Record<string, unknown>][] = [];
  const db: Db = { rpc: async (fn, a) => { rpcs.push([fn, a]); return { data: true, error: null }; }, insert: async () => {}, billing: async () => null, wsOfSubscription: async () => null,
    setupIntentPm: async (id) => (id === "seti_1" ? "pm_saved1" : null) };
  await applyCheckoutSession(db, { id: "cs_setup1", mode: "setup", status: "complete", payment_status: "no_payment_required", customer: "cus_1", setup_intent: "seti_1",
    metadata: { workspace_id: "ws1", kind: "license_setup", charge_id: "c1", ref: "sj-sign" } });
  eq(rpcs.find(([fn]) => fn === "license_outcome_authorize"), ["license_outcome_authorize", { p_id: "c1", p_pm: "pm_saved1", p_customer: "cus_1" }]);
  ok(!rpcs.some(([fn]) => fn === "license_charge_settle" || fn === "license_outcome_paid"), "nothing is paid or settled at approval");
  // the confirm path expands the SetupIntent: no second lookup
  rpcs.length = 0;
  await applyCheckoutSession({ ...db, setupIntentPm: undefined }, { id: "cs_setup2", mode: "setup", status: "complete", customer: "cus_1", setup_intent: { id: "seti_2", payment_method: "pm_saved2" },
    metadata: { workspace_id: "ws1", kind: "license_setup", charge_id: "c2" } });
  eq(rpcs.find(([fn]) => fn === "license_outcome_authorize")?.[1].p_pm, "pm_saved2");
});

Deno.test("the agency approves: charged once, and retries never charge twice", async () => {
  const s = fakeStripe({ crashAfterInvoice: true });
  const f = fakeDeps(s, [row()]);
  // the first sweep makes the invoice, then Stripe's answer to pay is lost: the charge goes back to due
  eq(await sweep(f.d), { [row().id]: "retry" });
  eq(f.status[row().id], "due");
  // the next sweep finds the same invoice (kept on the charge) and pays it, with the same keys
  eq(await sweep(f.d), { [row().id]: "used" });
  eq(s.invoices.size, 1);
  eq(paidInvoices(s), 1);
  ok(s.calls.filter((c) => c.path === "invoices").length === 1, "one invoice, ever");
  ok(pays(s).every((c) => c.idem === `outcome-pay-${row().id}` && c.params?.off_session === "true"), "paid off session, keyed by the charge id");
  // a third sweep, or a duplicate run of the same charge: nothing more
  eq(await sweep(f.d), {});
  const again = await collect(f.d, { ...row(), stripe_ref: f.refs[row().id] });
  eq(again, "unchanged");
  eq(paidInvoices(s), 1);
  eq(f.notices.map((n) => n[0]), ["charged"]);
});

Deno.test("rejected, not our fault: the same one charge, charged once", async () => {
  const s = fakeStripe();
  const r = row({ outcome: "rejected", fault: "not_placetta", tier: "complex", cents: 99900 });
  const f = fakeDeps(s, [r]);
  eq(await sweep(f.d), { [r.id]: "used" });
  const inv = [...s.invoices.values()][0];
  ok(String(inv.metadata.description).startsWith("License, rejected not through Placetta's fault"));
  eq(inv.metadata["metadata[outcome]"], "rejected");
  eq(inv.amount_due, 99900);
  // an approval of the same filing later would claim the same charge, which is already used: no second charge
  eq(await collect(f.d, { ...r, stripe_ref: f.refs[r.id] }), "unchanged");
  eq(paidInvoices(s), 1);
});

Deno.test("rejected through our fault: a paid charge is refunded once, an unpaid invoice is voided", async () => {
  // paid on approval, then the team marked our fault: refund
  const s = fakeStripe();
  const f = fakeDeps(s, [row()]);
  await sweep(f.d);
  const inv = [...s.invoices.values()][0];
  const r = row({ job: "undo", fault: "placetta", stripe_ref: inv.id });
  const g = fakeDeps(s, [r]);
  eq(await sweep(g.d), { [r.id]: "refunded" });
  const refunds = s.calls.filter((c) => c.path === "refunds");
  eq(refunds.length, 1);
  eq([refunds[0].params?.payment_intent, refunds[0].params?.amount, refunds[0].idem], ["pi_paid1", "14900", `outcome-refund-${r.id}`]);
  eq(g.notices.map((n) => n[0]), ["refunded"]);
  // a $299 fee paid up front through Checkout, before outcome pricing: refunded from its payment
  const s2 = fakeStripe();
  const u = row({ id: "22222222-2222-2222-2222-222222222222", job: "undo", collect: "upfront", cents: 29900, stripe_ref: "cs_old1", fault: "placetta" });
  const h = fakeDeps(s2, [u]);
  eq(await sweep(h.d), { [u.id]: "refunded" });
  eq(s2.calls.find((c) => c.path === "refunds")?.params?.payment_intent, "pi_cs1");
  // an invoice raised but not paid (SCA pending): voided, nothing refunded
  const s3 = fakeStripe({ payFails: [{ code: "authentication_required" }] });
  const k = fakeDeps(s3, [row()]);
  await sweep(k.d);
  const v = row({ job: "undo", fault: "placetta", stripe_ref: [...s3.invoices.values()][0].id });
  const m = fakeDeps(s3, [v]);
  eq(await sweep(m.d), { [v.id]: "waived" });
  ok(!s3.calls.some((c) => c.path === "refunds"));
  eq([...s3.invoices.values()][0].status, "void");
  // nothing at Stripe at all (the card was only saved): waived without a call
  const s4 = fakeStripe();
  const w = row({ job: "undo", fault: "placetta", stripe_ref: null });
  eq(await sweep(fakeDeps(s4, [w]).d), { [w.id]: "waived" });
  eq(s4.calls.length, 0);
});

Deno.test("SCA: the owner gets Stripe's pay link", async () => {
  const s = fakeStripe({ payFails: [{ code: "authentication_required" }] });
  const f = fakeDeps(s, [row()]);
  eq(await sweep(f.d), { [row().id]: "action" });
  ok(needsAuth({ code: "authentication_required" }) && !needsAuth({ code: "card_declined" }));
  eq(f.notices.length, 1);
  eq(f.notices[0][0], "action");
  ok(String(f.notices[0][1]).startsWith("https://invoice.stripe.com/i/"));
});

Deno.test("a refused card: the dunning runs and Stripe retries", async () => {
  const s = fakeStripe({ payFails: [{ code: "card_declined" }] });
  const f = fakeDeps(s, [row()]);
  eq(await sweep(f.d), { [row().id]: "failed" });
  eq(f.notices.map((n) => n[0]), ["failed"]);
  ok([...s.invoices.values()][0].auto_advance === true, "Stripe's smart retries are on for the invoice");
  // Stripe's retry pays: invoice.paid settles the charge and clears the dunning mark
  const rpcs: [string, Record<string, unknown>][] = [];
  const db: Db = { rpc: async (fn, a) => { rpcs.push([fn, a]); return { data: fn === "license_outcome_paid" ? "used" : true, error: null }; }, insert: async () => {}, billing: async () => null, wsOfSubscription: async () => null };
  await applyInvoice(db, { id: "in_fake1", metadata: { workspace_id: "ws1", kind: "license_outcome", charge_id: row().id } }, "invoice.paid", new Date().toISOString());
  eq(rpcs.map(([fn]) => fn), ["license_outcome_paid", "billing_payment_apply"]);
  // a refused retry: the dunning mark, with the license notice, not the store plan's
  const inserted: Record<string, unknown>[] = [];
  await applyInvoice({ ...db, insert: async (_t, r) => { inserted.push(r); } }, { id: "in_fake1", metadata: { workspace_id: "ws1", kind: "license_outcome", charge_id: row().id } }, "invoice.payment_failed", new Date().toISOString());
  ok(inserted.some((r) => (r as { body?: { en?: string } }).body?.en?.includes("for a license")));
});

Deno.test("never an amount other than the one approved, and no card means no charge", async () => {
  const s = fakeStripe();
  const f = fakeDeps(s, [row({ cents: 99900 })]);   // a license price item, but the charge says $999
  eq(await sweep(f.d), { [row().id]: "failed" });
  ok(!pays(s).length, "never paid");
  ok(f.tasks.some((t) => t.includes("not 99900")));
  const s2 = fakeStripe();
  const g = fakeDeps(s2, [row({ payment_method: null })]);
  eq(await sweep(g.d), { [row().id]: "failed" });
  eq(s2.calls.length, 0);
});

Deno.test("legacy and the plan: their invoices are untouched by outcome pricing", async () => {
  const rpcs: string[] = [];
  const db: Db = { rpc: async (fn) => { rpcs.push(fn); return { data: true, error: null }; }, insert: async () => {}, billing: async () => null, wsOfSubscription: async () => "ws-legacy" };
  await applyInvoice(db, { id: "in_plan1", subscription: "sub_1" }, "invoice.paid", new Date().toISOString());
  eq(rpcs, ["billing_payment_apply"]);
  // the old paid Checkout for a $299 license still settles as before
  rpcs.length = 0;
  await applyCheckoutSession(db, { id: "cs_l1", mode: "payment", payment_status: "paid", customer: "cus_1", metadata: { workspace_id: "ws1", kind: "license", charge_id: "c9" } });
  ok(rpcs.includes("license_charge_settle") && !rpcs.includes("license_outcome_authorize"));
});

Deno.test("undo after a crash is keyed: one refund", async () => {
  const s = fakeStripe();
  const f = fakeDeps(s, [row()]);
  await sweep(f.d);
  const r = row({ job: "undo", fault: "placetta", stripe_ref: [...s.invoices.values()][0].id });
  const g = fakeDeps(s, [r]);
  await undo(g.d, r);
  g.status[r.id] = "refunding";   // the sweep crashed before it was recorded and claimed it again
  await undo(g.d, r);
  const keys = new Set(s.calls.filter((c) => c.path === "refunds").map((c) => c.idem));
  eq([...keys], [`outcome-refund-${r.id}`]);
});
