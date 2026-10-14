// spend: what Odelia may buy, and every purchase. The rules are src/spend.ts, the same code the app shows; here they decide.
// POST {workspace_id, action, ...} with the person's session:
//   get                                   members: the rules (or the defaults) and the last 200 purchases
//   set_policy {policy}                   owners: save the rules and budgets (checked by policyProblems)
//   propose {purchase}                    members (and Odelia acting for them): check it against the rules. Inside
//                                         every rule and at or under the no-ask amount it's approved and paid at once;
//                                         otherwise it waits for approval; outside any rule it's blocked and recorded.
//   decide {id, approve}                  owners: approve or decline. A purchase over the two-person amount needs two
//                                         different owners. The rules are checked again when the last approval lands.
//   paid {id, receipt_path?}              members: a link purchase was paid on the agency's page
//   cancel {id}                           owners: stops an unpaid purchase (its card is closed and the charge refunded)
// With the monitor key (the portal worker): card {purchase_id} returns the single-use card's details for typing into
// the agency's own checkout, only while the purchase is approved and unpaid. The details never pass the model.
//
// How it pays. A government payee and card payments set up (STRIPE_ISSUING=on, an Issuing cardholder saved for the
// workspace, a card on file for its plan): the workspace is charged the exact amount on its card on file, then Placetta
// issues a single-use virtual card locked to that amount, to government merchant categories, for 7 days. The card is
// closed after its one payment, or when the purchase is canceled (the charge is then refunded). Otherwise: the agency's
// own payment link, paid by a person in the workspace, and recorded here.
import { decide, isGovernment, policyProblems, DEFAULT_POLICY, SPEND_CATEGORIES, type Purchase, type SpendCategory, type SpendPolicy } from "../../../src/spend.ts";
import { admin, audit, HttpError, ok, readBody, requireAccess, requireUser, serve, text, uuidParam, type L10n } from "./shared.ts";

const STRIPE_VERSION = "2025-03-31.basil";
/** Merchant categories a government fee is charged under: government services (9399) and tax payments (9311). */
export const GOV_CATEGORIES = ["government_services", "tax_payments"];
const CARD_DAYS = 7;

async function stripe(path: string, params: Record<string, string> = {}, method = "POST", idem?: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new HttpError("not_configured", "Card payments need STRIPE_SECRET_KEY.");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) },
    ...(method === "POST" ? { body: new URLSearchParams(params) } : {}),
  });
  const data = await res.json();
  if (!res.ok) { console.error("stripe", path, res.status, data?.error?.code ?? ""); throw new HttpError("upstream_error", data?.error?.message ?? "Stripe refused it."); }
  return data;
}

type Row = {
  id: string; workspace_id: string; category: string; payee: string; payee_url: string | null; amount_cents: number; store_id: string | null;
  app_id: string | null; filing_id: string | null; why: L10n; status: Purchase["status"]; by_agent: boolean; approvals: { who: string; at: string }[];
  approvers_needed: number; reasons: L10n[] | null; method: "card" | "link" | null; charge_id: string | null; card_id: string | null; card_last4: string | null;
  receipt_path: string | null; created_at: string; paid_at: string | null;
};
const toPurchase = (r: Row): Purchase => ({
  id: r.id, at: r.created_at, category: r.category as SpendCategory, payee: r.payee, payeeUrl: r.payee_url ?? undefined, amount: r.amount_cents / 100,
  store: r.store_id ?? undefined, app: r.app_id ?? undefined, why: r.why, status: r.status, by: r.by_agent ? "agent" : "you", approvals: r.approvals,
  method: r.method ?? undefined, card: r.card_last4 ? { last4: r.card_last4, expires: "" } : undefined, receipt: r.receipt_path ?? undefined, reasons: r.reasons ?? undefined,
});

async function policyOf(ws: string): Promise<{ policy: SpendPolicy; holder: string | null }> {
  const { data } = await admin.from("spend_policies").select("policy, card_holder").eq("workspace_id", ws).maybeSingle();
  return { policy: { ...DEFAULT_POLICY, ...((data?.policy as Partial<SpendPolicy>) ?? {}) }, holder: (data?.card_holder as string) ?? null };
}
async function purchasesOf(ws: string, limit = 500): Promise<Row[]> {
  const { data, error } = await admin.from("purchases").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`purchases read: ${error.code ?? ""}`);
  return (data ?? []) as Row[];
}
async function one(ws: string, id: string): Promise<Row> {
  const { data } = await admin.from("purchases").select("*").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!data) throw new HttpError("not_found", "That purchase isn't in this workspace.");
  return data as Row;
}
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;

async function tell(r: Row, title: L10n, body?: L10n) {
  await admin.from("updates").upsert({ workspace_id: r.workspace_id, kind: "purchase", title, body: body ?? null, app_id: r.app_id, dedupe: `purchase:${r.id}:${r.status}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
}

/** The card on file the workspace's plan is billed to: its Stripe customer and default card. */
async function cardOnFile(ws: string): Promise<{ customer: string; pm: string } | null> {
  const { data } = await admin.from("billing").select("stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return null;
  const c = await stripe(`customers/${customer}`, {}, "GET");
  let pm = c?.invoice_settings?.default_payment_method as string | undefined;
  if (!pm) pm = (await stripe(`customers/${customer}/payment_methods?type=card&limit=1`, {}, "GET"))?.data?.[0]?.id;
  return pm ? { customer, pm } : null;
}

/** Pays an approved purchase: a single-use card when that's set up and the payee is an agency, else the agency's link. */
async function pay(r: Row, holder: string | null): Promise<Row> {
  const cardsOn = Deno.env.get("STRIPE_ISSUING") === "on" && !!holder && isGovernment(r.payee, r.payee_url ?? undefined);
  const file = cardsOn ? await cardOnFile(r.workspace_id).catch(() => null) : null;
  if (!cardsOn || !file) {
    const { data } = await admin.from("purchases").update({ method: "link", decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
    return data as Row;
  }
  // 1. bill the workspace the exact amount, 2. issue a card that can spend exactly that, only at agencies, for 7 days
  const pi = await stripe("payment_intents", {
    amount: String(r.amount_cents), currency: "usd", customer: file.customer, payment_method: file.pm, off_session: "true", confirm: "true",
    description: `Placetta purchase for ${r.payee}`.slice(0, 200), "metadata[purchase_id]": r.id, "metadata[workspace_id]": r.workspace_id,
  }, "POST", `spend-charge-${r.id}`);
  if (pi.status !== "succeeded") {
    const { data } = await admin.from("purchases").update({ status: "failed", reasons: [{ en: "Your card on file was declined, so nothing was bought.", zh: "您登记的银行卡被拒，未进行购买。" }], charge_id: pi.id }).eq("id", r.id).select("*").single();
    await tell(data as Row, { en: `Couldn't pay ${r.payee}: card declined`, zh: `未能向 ${r.payee} 付款：银行卡被拒` });
    return data as Row;
  }
  const p: Record<string, string> = {
    cardholder: holder!, currency: "usd", type: "virtual", status: "active",
    "spending_controls[spending_limits][0][amount]": String(r.amount_cents), "spending_controls[spending_limits][0][interval]": "all_time",
    "metadata[purchase_id]": r.id, "metadata[workspace_id]": r.workspace_id, "metadata[expires]": new Date(Date.now() + CARD_DAYS * 864e5).toISOString(),
  };
  GOV_CATEGORIES.forEach((c, i) => (p[`spending_controls[allowed_categories][${i}]`] = c));
  let card;
  try { card = await stripe("issuing/cards", p, "POST", `spend-card-${r.id}`); }
  catch (e) { await stripe("refunds", { payment_intent: pi.id }, "POST", `spend-refund-${r.id}`).catch(() => {}); throw e; }
  const { data } = await admin.from("purchases").update({ method: "card", charge_id: pi.id, card_id: card.id, card_last4: card.last4, decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
  return data as Row;
}

async function approved(r: Row, holder: string | null, who: string | null): Promise<Row> {
  const { data } = await admin.from("purchases").update({ status: "approved", decided_at: new Date().toISOString() }).eq("id", r.id).eq("status", "asked").select("*").maybeSingle();
  const row = (data as Row) ?? r;
  await audit({ workspace_id: r.workspace_id, actor: who ? "you" : "agent", actor_id: who, action: { en: "Approved a purchase", zh: "批准购买" }, object: { en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` }, detail: r.why });
  const paid = await pay(row, holder);
  if (paid.status === "approved") await tell(paid, paid.method === "card"
    ? { en: `Odelia is paying ${r.payee} ${money(r.amount_cents)} with a single-use card ending ${paid.card_last4}`, zh: `Odelia 正用尾号 ${paid.card_last4} 的一次性卡向 ${r.payee} 支付 ${money(r.amount_cents)}` }
    : { en: `Approved: pay ${r.payee} ${money(r.amount_cents)} on the agency's page`, zh: `已批准：在机构页面向 ${r.payee} 支付 ${money(r.amount_cents)}` }, r.why);
  return paid;
}

async function closeCard(r: Row, refund: boolean) {
  if (r.card_id) await stripe(`issuing/cards/${r.card_id}`, { status: "canceled" }).catch((e) => console.error("card close", String(e).slice(0, 120)));
  if (refund && r.charge_id) await stripe("refunds", { payment_intent: r.charge_id }, "POST", `spend-refund-${r.id}`).catch((e) => console.error("refund", String(e).slice(0, 120)));
}

const CATS = new Set(SPEND_CATEGORIES.map((c) => c.id));
function readPurchase(v: unknown) {
  const o = (v ?? {}) as Record<string, unknown>;
  const category = String(o.category ?? "") as SpendCategory;
  if (!CATS.has(category)) throw new HttpError("bad_request", "Unknown kind of purchase.");
  const amount = Number(o.amount);
  if (!(amount > 0) || amount > 100000) throw new HttpError("bad_request", "The amount has to be between $0 and $100,000.");
  const url = o.payee_url ? String(o.payee_url) : undefined;
  if (url && !/^https:\/\//i.test(url)) throw new HttpError("bad_request", "The payee's page must be an https address.");
  const why = (o.why ?? {}) as Partial<L10n>;
  return {
    category, amount, payee: text(o.payee, "payee", 2, 160), payeeUrl: url, store: o.store ? String(o.store).slice(0, 80) : undefined,
    app: o.app ? String(o.app).slice(0, 80) : undefined, filing: o.filing ? uuidParam(o.filing, "filing") : undefined,
    why: { en: text(why.en ?? "", "why", 2, 300), zh: String(why.zh ?? why.en ?? "").slice(0, 300) }, byAgent: o.by !== "you",
  };
}

serve(async (req) => {
  // the portal worker, with the monitor key: the card for one approved purchase, to type into the agency's checkout
  const mk = req.headers.get("x-monitor-key");
  if (mk) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: mk });
    if (!good) throw new HttpError("unauthorized", "Bad key.");
    const body = await readBody(req);
    if (body.action !== "card") throw new HttpError("bad_request", "Only card.");
    const { data: r } = await admin.from("purchases").select("*").eq("id", uuidParam(body.purchase_id, "purchase_id")).maybeSingle();
    if (!r || r.status !== "approved" || r.method !== "card" || !r.card_id) throw new HttpError("not_found", "No approved card purchase.");
    const c = await stripe(`issuing/cards/${r.card_id}?expand[]=number&expand[]=cvc`, {}, "GET");
    if (c.status !== "active") throw new HttpError("forbidden", "That card is closed.");
    return ok({ amount_cents: r.amount_cents, payee: r.payee, number: c.number, cvc: c.cvc, exp_month: c.exp_month, exp_year: c.exp_year, name: c.cardholder?.name ?? "", zip: c.cardholder?.billing?.address?.postal_code ?? "" });
  }

  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");

  if (action === "get") {
    await requireAccess(ws, user, jwt, "member");
    const [{ policy, holder }, rows] = await Promise.all([policyOf(ws), purchasesOf(ws, 200)]);
    return ok({ policy, cards: Deno.env.get("STRIPE_ISSUING") === "on" && !!holder, purchases: rows.map(toPurchase) });
  }

  if (action === "set_policy") {
    await requireAccess(ws, user, jwt, "owner");
    const p = { ...DEFAULT_POLICY, ...((body.policy ?? {}) as Partial<SpendPolicy>) };
    const bad = policyProblems(p);
    if (bad.length) throw new HttpError("bad_request", bad.map((b) => b.en).join(" "));
    const { error } = await admin.from("spend_policies").upsert({ workspace_id: ws, policy: p, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw new Error(`policy save: ${error.code ?? ""}`);
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Changed what Odelia may buy", zh: "修改了 Odelia 的购买权限" }, object: { en: p.on ? `On, up to $${p.perPurchase} each` : "Off", zh: p.on ? `已开启，单笔最高 $${p.perPurchase}` : "已关闭" } });
    return ok({ policy: p });
  }

  if (action === "propose") {
    await requireAccess(ws, user, jwt, "member");
    const q = readPurchase(body.purchase);
    const [{ policy, holder }, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    const d = decide({ category: q.category, payee: q.payee, payeeUrl: q.payeeUrl, amount: q.amount, store: q.store }, policy, rows.map(toPurchase));
    const status = d.verdict === "blocked" ? "blocked" : "asked";
    const { data, error } = await admin.from("purchases").insert({
      workspace_id: ws, category: q.category, payee: q.payee, payee_url: q.payeeUrl ?? null, amount_cents: Math.round(q.amount * 100), store_id: q.store ?? null,
      app_id: q.app ?? null, filing_id: q.filing ?? null, why: q.why, status, by_agent: q.byAgent, requested_by: user.id, approvers_needed: Math.max(1, d.approvers), reasons: d.reasons,
    }).select("*").single();
    if (error) throw new Error(`purchase insert: ${error.code ?? ""}`);
    let r = data as Row;
    await audit({ workspace_id: ws, actor: q.byAgent ? "agent" : "you", actor_id: user.id, action: d.verdict === "blocked" ? { en: "Stopped a purchase outside the rules", zh: "拦截了一笔超出规则的购买" } : { en: "Asked to buy", zh: "申请购买" }, object: { en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` }, detail: d.reasons[0] ?? q.why });
    if (d.verdict === "auto") r = await approved(r, holder, null);
    else if (d.verdict === "ask") await tell(r, { en: `Approve ${money(r.amount_cents)} to ${r.payee}?`, zh: `是否批准向 ${r.payee} 支付 ${money(r.amount_cents)}？` }, q.why);
    return ok({ verdict: d.verdict, reasons: d.reasons, purchase: toPurchase(r) });
  }

  if (action === "decide") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked") throw new HttpError("bad_request", "That purchase was already decided.");
    if (!body.approve) {
      const { data } = await admin.from("purchases").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", r.id).eq("status", "asked").select("*").single();
      await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Declined a purchase", zh: "拒绝了购买" }, object: { en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` } });
      return ok({ purchase: toPurchase(data as Row) });
    }
    if (r.approvals.some((a) => a.who === user.id)) throw new HttpError("bad_request", "You already approved it. A second owner has to approve it too.");
    const approvals = [...r.approvals, { who: user.id, at: new Date().toISOString() }];
    const { data: upd } = await admin.from("purchases").update({ approvals }).eq("id", r.id).eq("status", "asked").select("*").single();
    let row = upd as Row;
    if (approvals.length < r.approvers_needed) return ok({ purchase: toPurchase(row), waiting: r.approvers_needed - approvals.length });
    // the rules again, now: a budget may have been spent since it was asked
    const [{ policy, holder }, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    const d = decide({ category: r.category as SpendCategory, payee: r.payee, payeeUrl: r.payee_url ?? undefined, amount: r.amount_cents / 100, store: r.store_id ?? undefined }, policy, rows.filter((x) => x.id !== r.id).map(toPurchase));
    if (d.verdict === "blocked") {
      const { data } = await admin.from("purchases").update({ status: "blocked", reasons: d.reasons, decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
      return ok({ purchase: toPurchase(data as Row), reasons: d.reasons });
    }
    row = await approved(row, holder, user.id);
    return ok({ purchase: toPurchase(row) });
  }

  if (action === "paid") {
    await requireAccess(ws, user, jwt, "member");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "approved" || r.method !== "link") throw new HttpError("bad_request", "Only an approved purchase paid on the agency's page can be marked paid.");
    const receipt = body.receipt_path ? String(body.receipt_path).slice(0, 300) : null;
    if (receipt && !receipt.startsWith(`${ws}/`)) throw new HttpError("bad_request", "That receipt isn't in this workspace.");
    const { data } = await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString(), receipt_path: receipt }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Paid", zh: "已支付" }, object: { en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` } });
    return ok({ purchase: toPurchase(data as Row) });
  }

  if (action === "cancel") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked" && r.status !== "approved") throw new HttpError("bad_request", "Only an unpaid purchase can be canceled.");
    await closeCard(r, true);
    const { data } = await admin.from("purchases").update({ status: "canceled", decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Canceled a purchase", zh: "取消了购买" }, object: { en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` } });
    return ok({ purchase: toPurchase(data as Row) });
  }

  throw new HttpError("bad_request", "Unknown action.");
});
