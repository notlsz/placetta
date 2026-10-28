// spend: what Odelia may ask to buy, and every purchase. The rules are src/spend.ts, the same code the app shows; here they
// decide. Nothing is ever paid without an owner's approval, and Placetta never holds or moves the money: an approved
// purchase is paid by a person in the workspace on the payee's own page, and recorded here with its receipt.
// POST {workspace_id, action, ...} with the person's session:
//   get                                   members: the rules (or the defaults) and the last 200 purchases
//   set_policy {policy}                   owners: save the rules and budgets (checked by policyProblems)
//   propose {purchase}                    members (and Odelia acting for them): check it against the rules. Inside every
//                                         rule it waits for approval; outside any rule it's refused and recorded.
//   decide {id, approve}                  owners: approve or decline. Over the two-person amount it needs two different
//                                         owners. The rules are checked again when the last approval lands.
//   paid {id, receipt_path?}              members: an approved purchase was paid on the payee's page
//   cancel {id}                           owners: drops a purchase that isn't paid yet (a single-use card is closed and
//                                         its charge refunded)
// Under Autopilot, with single-use cards on (STRIPE_ISSUING=on and app_settings.issuing_on; _shared/issuing.ts), Odelia's
// server asks with the monitor key, never a person's session:
//   autopilot_card {workspace_id, grant_id, app_id, payee, payee_url, amount_cents, why}
//                                         an agency fee inside the owner's signed Autopilot grant (the database's
//                                         autopilot_spend_ok decides): the workspace's card on file is charged the
//                                         exact amount and a single-use card is issued for it. The owner's signed grant
//                                         is the approval; the purchase records it.
//   bill {workspace_id, grant_id?, app_id, payee, payee_url?, amount_cents, link?}
//                                         an agency's bill: paid the same way when cards are on and it fits the grant,
//                                         otherwise forwarded to the business's accounts-payable email.
//   card {workspace_id, purchase_id}      the portal worker types the card on the agency's own checkout: its number,
//                                         only while the purchase is approved and unpaid and the card is open. Never
//                                         to the model, a log or the app.
import { decide, isGovernment, policyProblems, DEFAULT_POLICY, SPEND_CATEGORIES, type Purchase, type SpendCategory, type SpendPolicy } from "../../../src/spend.ts";
import { apForward, cardParams, issuingOn, STRIPE_VERSION } from "../_shared/issuing.ts";
import { admin, audit, HttpError, ok, readBody, requireAccess, requireUser, serve, text, uuidParam, type L10n } from "./shared.ts";

type Row = {
  id: string; workspace_id: string; category: string; payee: string; payee_url: string | null; amount_cents: number; store_id: string | null;
  app_id: string | null; filing_id: string | null; why: L10n; status: Purchase["status"]; by_agent: boolean; approvals: { who: string; at: string }[];
  approvers_needed: number; reasons: L10n[] | null; method: "link" | "card" | null; receipt_path: string | null; created_at: string; paid_at: string | null;
  charge_id?: string | null; card_id?: string | null; card_last4?: string | null; autopilot_grant?: string | null;
};
const toPurchase = (r: Row): Purchase => ({
  id: r.id, at: r.created_at, category: r.category as SpendCategory, payee: r.payee, payeeUrl: r.payee_url ?? undefined, amount: r.amount_cents / 100,
  store: r.store_id ?? undefined, app: r.app_id ?? undefined, why: r.why, status: r.status, by: r.by_agent ? "agent" : "you", approvals: r.approvals,
  method: r.method === "link" ? "link" : undefined, receipt: r.receipt_path ?? undefined, reasons: r.reasons ?? undefined,
});

/* ------------------------------------------------------------------ single-use cards (off until STRIPE_ISSUING=on) */

const env = (k: string) => Deno.env.get(k);
async function stripe(path: string, params: Record<string, string> = {}, method = "POST", idem?: string) {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new HttpError("not_configured", "Card payments need STRIPE_SECRET_KEY.");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idem ? { "Idempotency-Key": idem } : {}) },
    ...(method === "POST" ? { body: new URLSearchParams(params) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  // the code only, never Stripe's message or a card detail, in the log
  if (!res.ok) { console.error("stripe", path.split("?")[0].replace(/ic_[A-Za-z0-9]+/, "ic_*"), res.status, data?.error?.code ?? ""); throw new HttpError("upstream_error", "Stripe refused it."); }
  return data;
}
/** The card on file the workspace's plan is billed to. */
async function cardOnFile(ws: string): Promise<{ customer: string; pm: string } | null> {
  const { data } = await admin.from("billing").select("stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return null;
  const c = await stripe(`customers/${encodeURIComponent(customer)}`, {}, "GET");
  let pm = c?.invoice_settings?.default_payment_method as string | undefined;
  if (!pm) pm = (await stripe(`customers/${encodeURIComponent(customer)}/payment_methods?type=card&limit=1`, {}, "GET"))?.data?.[0]?.id;
  return pm ? { customer, pm } : null;
}
const dbReason = (m: string) => (/\b(autopilot_\w+|cards_off):\s*([^\n]{1,200})/.exec(m)?.[2] ?? "Placetta's check refused it.").replace(/^./, (c) => c.toUpperCase());

/** Pays one agency fee inside the owner's Autopilot grant with a single-use card. Returns the purchase. */
async function payByCard(ws: string, q: { grant: string; app: string | null; filing: string | null; payee: string; payeeUrl: string | null; cents: number; why: L10n }): Promise<Row> {
  // the database decides: cards switched on, the grant this workspace's and live, within both caps
  const { error: no } = await admin.rpc("autopilot_spend_ok", { p_ws: ws, p_grant: q.grant, p_cents: q.cents });
  if (no) throw new HttpError("bad_request", dbReason(no.message ?? ""));
  if (!isGovernment(q.payee, q.payeeUrl ?? undefined)) throw new HttpError("bad_request", "Single-use cards pay government agencies only.");
  // the same fee asked twice: one purchase, one card
  const { data: dup } = await admin.from("purchases").select("*").eq("workspace_id", ws).eq("autopilot_grant", q.grant).eq("app_id", q.app ?? "").eq("amount_cents", q.cents).in("status", ["approved", "paid"]).maybeSingle();
  if (dup) return dup as Row;
  const holder = env("STRIPE_ISSUING_CARDHOLDER") ?? (await admin.from("spend_policies").select("card_holder").eq("workspace_id", ws).maybeSingle()).data?.card_holder;
  if (!holder) throw new HttpError("not_configured", "No Issuing cardholder (STRIPE_ISSUING_CARDHOLDER).");
  const { data: ins, error } = await admin.from("purchases").insert({
    workspace_id: ws, category: "gov_fees", payee: q.payee, payee_url: q.payeeUrl, amount_cents: q.cents, app_id: q.app, filing_id: q.filing, why: q.why, status: "approved",
    by_agent: true, approvals: [{ who: `autopilot:${q.grant}`, at: new Date().toISOString() }], approvers_needed: 1, method: "card", autopilot_grant: q.grant, decided_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw new Error(`purchase insert: ${error.code ?? ""}`);
  let r = ins as Row;
  const file = await cardOnFile(ws).catch(() => null);
  const fail = async (en: string, zh: string) => {
    const { data } = await admin.from("purchases").update({ status: "failed", reasons: [{ en, zh }] }).eq("id", r.id).eq("workspace_id", ws).select("*").single();
    await tell(data as Row, { en: `Couldn't pay ${q.payee}: ${en}`, zh: `未能向 ${q.payee} 付款：${zh}` });
    return data as Row;
  };
  if (!file) return await fail("there's no card on file for the business.", "企业没有登记银行卡。");
  const pi = await stripe("payment_intents", {
    amount: String(q.cents), currency: "usd", customer: file.customer, payment_method: file.pm, off_session: "true", confirm: "true",
    description: `Agency fee to ${q.payee}, paid by Placetta under Autopilot`.slice(0, 200), "metadata[purchase_id]": r.id, "metadata[workspace_id]": ws,
  }, "POST", `spend-charge-${r.id}`).catch(() => null);
  if (!pi || pi.status !== "succeeded") return await fail("the card on file was declined, so nothing was paid.", "登记的银行卡被拒，未付款。");
  let card;
  try { card = await stripe("issuing/cards", cardParams({ holder, cents: q.cents, purchase: r.id, workspace: ws, now: Date.now() }), "POST", `spend-card-${r.id}`); }
  catch (e) { await stripe("refunds", { payment_intent: pi.id }, "POST", `spend-refund-${r.id}`).catch(() => {}); await fail("the single-use card couldn't be made; the charge was refunded.", "一次性卡未能生成，已退款。"); throw e; }
  const { data: upd } = await admin.from("purchases").update({ charge_id: pi.id, card_id: card.id, card_last4: card.last4 }).eq("id", r.id).eq("workspace_id", ws).select("*").single();
  r = upd as Row;
  await audit({ workspace_id: ws, actor: "agent", actor_id: null, action: { en: "Paying an agency fee under Autopilot", zh: "在自动驾驶下支付机构费用" }, object: what(r), detail: { en: `Single-use card ending ${card.last4}, for this fee only, within your signed caps`, zh: `尾号 ${card.last4} 的一次性卡，仅限此笔费用，在您签署的上限内` } });
  await tell(r, { en: `Paying ${q.payee} ${money(q.cents)} from a single-use card (Autopilot)`, zh: `正用一次性卡向 ${q.payee} 支付 ${money(q.cents)}（自动驾驶）` }, q.why);
  return r;
}
async function closeCard(r: Row, refund: boolean) {
  if (r.card_id) await stripe(`issuing/cards/${encodeURIComponent(r.card_id)}`, { status: "canceled" }).catch(() => console.error("card close failed"));
  if (refund && r.charge_id) await stripe("refunds", { payment_intent: r.charge_id }, "POST", `spend-refund-${r.id}`).catch(() => console.error("refund failed"));
}
/** An agency bill no card pays: forwarded to the business's accounts-payable email, and the owners told. */
async function forwardBill(ws: string, q: { app: string | null; payee: string; cents: number; link: string | null; why: L10n }): Promise<{ forwarded: string | null }> {
  const [{ data: sp }, { data: w }] = await Promise.all([
    admin.from("spend_policies").select("ap_email").eq("workspace_id", ws).maybeSingle(),
    admin.from("workspaces").select("name").eq("id", ws).maybeSingle(),
  ]);
  const to = (sp?.ap_email as string | null) ?? null;
  const key = env("RESEND_API_KEY"), from = env("BILLS_FROM") ?? env("RESEND_FROM");
  let sent = false;
  if (to && key && from) {
    const m = apForward({ to, business: String(w?.name ?? "your business"), payee: q.payee, cents: q.cents, filing: q.why.en, link: q.link ?? undefined });
    const res = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }) }).catch(() => null);
    sent = !!res?.ok;
    if (!sent) console.error("bill forward failed", res?.status ?? "no answer");
  }
  const amt = money(q.cents);
  await admin.from("updates").upsert({ workspace_id: ws, kind: "payment", app_id: q.app, dedupe: `bill:${q.app ?? ""}:${q.payee}:${q.cents}`,
    title: sent ? { en: `${q.payee}'s ${amt} bill went to ${to}`, zh: `${q.payee} 的 ${amt} 账单已转发至 ${to}` } : { en: `${q.payee} billed ${amt}: pay it on the agency's page`, zh: `${q.payee} 开出 ${amt} 账单：请在机构页面支付` },
    body: q.why }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  await audit({ workspace_id: ws, actor: "agent", actor_id: null, action: sent ? { en: "Forwarded an agency bill to accounts payable", zh: "将机构账单转发给应付账款" } : { en: "An agency bill came in", zh: "收到机构账单" }, object: { en: `${amt} to ${q.payee}`, zh: `向 ${q.payee} 支付 ${amt}` } });
  return { forwarded: sent ? to : null };
}
const cents = (v: unknown) => { const n = Math.round(Number(v)); if (!(n > 0) || n > 10_000_000) throw new HttpError("bad_request", "The amount has to be between $0 and $100,000."); return n; };
const httpsOrNull = (v: unknown) => { const u = v ? String(v) : null; if (u && !/^https:\/\//i.test(u)) throw new HttpError("bad_request", "The payee's page must be an https address."); return u; };

async function policyOf(ws: string): Promise<SpendPolicy> {
  const { data } = await admin.from("spend_policies").select("policy").eq("workspace_id", ws).maybeSingle();
  return { ...DEFAULT_POLICY, ...((data?.policy as Partial<SpendPolicy>) ?? {}) };
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
const what = (r: Row): L10n => ({ en: `${money(r.amount_cents)} to ${r.payee}`, zh: `向 ${r.payee} 支付 ${money(r.amount_cents)}` });

async function tell(r: Row, title: L10n, body?: L10n) {
  await admin.from("updates").upsert({ workspace_id: r.workspace_id, kind: "purchase", title, body: body ?? null, app_id: r.app_id, dedupe: `purchase:${r.id}:${r.status}` }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
}

const CATS = new Set(SPEND_CATEGORIES.map((c) => c.id));
function readPurchase(v: unknown) {
  const o = (v ?? {}) as Record<string, unknown>;
  const category = String(o.category ?? "") as SpendCategory;
  if (!CATS.has(category)) throw new HttpError("bad_request", "Unknown kind of purchase.");
  const amount = Math.round(Number(o.amount) * 100) / 100;
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
  // Odelia's server and the portal worker, with the monitor key: Autopilot's agency fees (single-use cards off until
  // STRIPE_ISSUING=on, and the database's issuing_on)
  if (req.headers.get("x-monitor-key")) {
    const body = await readBody(req);
    const ws = uuidParam(body.workspace_id, "workspace_id");
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: req.headers.get("x-monitor-key") });
    if (!good) throw new HttpError("unauthorized", "Bad key.");
    const action = String(body.action ?? "");
    const why = (body.why ?? {}) as Partial<L10n>;
    const q = { grant: body.grant_id ? uuidParam(body.grant_id, "grant_id") : "", app: body.app_id ? String(body.app_id).slice(0, 80) : null, filing: body.filing_id ? uuidParam(body.filing_id, "filing_id") : null,
      payee: text(body.payee, "payee", 2, 160), payeeUrl: httpsOrNull(body.payee_url), cents: cents(body.amount_cents),
      why: { en: String(why.en ?? "Agency fee").slice(0, 300), zh: String(why.zh ?? why.en ?? "机构费用").slice(0, 300) } };
    if (action === "autopilot_card") {
      if (!issuingOn(env)) throw new HttpError("not_configured", "Single-use cards aren't switched on.");
      if (!q.grant) throw new HttpError("bad_request", "grant_id is required.");
      return ok({ purchase: toPurchase(await payByCard(ws, q)) });
    }
    if (action === "bill") {
      if (issuingOn(env) && q.grant) {
        try { return ok({ paid_by: "card", purchase: toPurchase(await payByCard(ws, q)) }); }
        catch (e) { if (!(e instanceof HttpError) || e.code !== "bad_request") throw e; }   // outside the grant: forwarded
      }
      return ok({ paid_by: "accounts_payable", ...(await forwardBill(ws, { app: q.app, payee: q.payee, cents: q.cents, link: httpsOrNull(body.link), why: q.why })) });
    }
    if (action === "card") {
      if (!issuingOn(env)) throw new HttpError("not_configured", "Single-use cards aren't switched on.");
      const pid = uuidParam(body.purchase_id, "purchase_id");
      const { data: r } = await admin.from("purchases").select("*").eq("workspace_id", ws).eq("id", pid).maybeSingle();
      if (!r || r.status !== "approved" || r.method !== "card" || !r.card_id) throw new HttpError("not_found", "No approved card purchase.");
      const c = await stripe(`issuing/cards/${encodeURIComponent(r.card_id)}?expand[]=number&expand[]=cvc`, {}, "GET");
      if (c.status !== "active") throw new HttpError("forbidden", "That card is closed.");
      return ok({ amount_cents: r.amount_cents, payee: r.payee, number: c.number, cvc: c.cvc, exp_month: c.exp_month, exp_year: c.exp_year });
    }
    throw new HttpError("bad_request", "Unknown action.");
  }

  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");

  if (action === "get") {
    await requireAccess(ws, user, jwt, "member");
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws, 200)]);
    return ok({ policy, cards: issuingOn(env), purchases: rows.map(toPurchase) });
  }

  if (action === "set_policy") {
    await requireAccess(ws, user, jwt, "owner");
    const p = { ...DEFAULT_POLICY, ...((body.policy ?? {}) as Partial<SpendPolicy>) };
    delete (p as Record<string, unknown>).autoUnder;   // there is no buying without approval
    const bad = policyProblems(p);
    if (bad.length) throw new HttpError("bad_request", bad.map((b) => b.en).join(" "));
    const { error } = await admin.from("spend_policies").upsert({ workspace_id: ws, policy: p, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw new Error(`policy save: ${error.code ?? ""}`);
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Changed what Odelia may ask to buy", zh: "修改了 Odelia 的购买权限" }, object: { en: p.on ? `On, up to $${p.perPurchase} each, ${p.budgets.length} budget(s)` : "Off", zh: p.on ? `已开启，单笔最高 $${p.perPurchase}，${p.budgets.length} 项预算` : "已关闭" } });
    return ok({ policy: p });
  }

  if (action === "propose") {
    await requireAccess(ws, user, jwt, "member");
    const q = readPurchase(body.purchase);
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    // the same thing asked again while it's still waiting: one card, not two
    const dup = rows.find((r) => r.status === "asked" && r.payee === q.payee && r.amount_cents === Math.round(q.amount * 100) && r.app_id === (q.app ?? null));
    if (dup) return ok({ verdict: "ask", reasons: [], purchase: toPurchase(dup), already: true });
    const d = decide({ category: q.category, payee: q.payee, payeeUrl: q.payeeUrl, amount: q.amount, store: q.store }, policy, rows.map(toPurchase));
    const { data, error } = await admin.from("purchases").insert({
      workspace_id: ws, category: q.category, payee: q.payee, payee_url: q.payeeUrl ?? null, amount_cents: Math.round(q.amount * 100), store_id: q.store ?? null,
      app_id: q.app ?? null, filing_id: q.filing ?? null, why: q.why, status: d.verdict === "blocked" ? "blocked" : "asked", by_agent: q.byAgent, requested_by: user.id,
      approvers_needed: Math.max(1, d.approvers), reasons: d.reasons,
    }).select("*").single();
    if (error) throw new Error(`purchase insert: ${error.code ?? ""}`);
    const r = data as Row;
    await audit({ workspace_id: ws, actor: q.byAgent ? "agent" : "you", actor_id: user.id, action: d.verdict === "blocked" ? { en: "Stopped a purchase outside the rules", zh: "拦截了一笔超出规则的购买" } : { en: "Asked to buy", zh: "申请购买" }, object: what(r), detail: d.reasons[0] ?? q.why });
    if (d.verdict === "ask") await tell(r, { en: `Approve ${money(r.amount_cents)} to ${r.payee}?`, zh: `是否批准向 ${r.payee} 支付 ${money(r.amount_cents)}？` }, q.why);
    return ok({ verdict: d.verdict, reasons: d.reasons, purchase: toPurchase(r) });
  }

  if (action === "decide") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked") throw new HttpError("bad_request", "That purchase was already decided.");
    if (!body.approve) {
      const { data } = await admin.from("purchases").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", r.id).eq("status", "asked").select("*").single();
      await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Declined a purchase", zh: "拒绝了购买" }, object: what(r) });
      return ok({ purchase: toPurchase(data as Row) });
    }
    if (r.approvals.some((a) => a.who === user.id)) throw new HttpError("bad_request", "You already approved it. A second owner has to approve it too.");
    const approvals = [...r.approvals, { who: user.id, at: new Date().toISOString() }];
    const { data: upd } = await admin.from("purchases").update({ approvals }).eq("id", r.id).eq("status", "asked").select("*").single();
    if (approvals.length < r.approvers_needed) {
      await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a purchase (first of two)", zh: "批准购买（两人中的第一位）" }, object: what(r) });
      return ok({ purchase: toPurchase(upd as Row), waiting: r.approvers_needed - approvals.length });
    }
    // the rules again, now: a budget may have been spent since it was asked
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws)]);
    const d = decide({ category: r.category as SpendCategory, payee: r.payee, payeeUrl: r.payee_url ?? undefined, amount: r.amount_cents / 100, store: r.store_id ?? undefined }, policy, rows.filter((x) => x.id !== r.id).map(toPurchase));
    if (d.verdict === "blocked") {
      const { data } = await admin.from("purchases").update({ status: "blocked", reasons: d.reasons, decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
      return ok({ purchase: toPurchase(data as Row), reasons: d.reasons });
    }
    const { data } = await admin.from("purchases").update({ status: "approved", method: "link", decided_at: new Date().toISOString() }).eq("id", r.id).eq("status", "asked").select("*").single();
    const row = data as Row;
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a purchase", zh: "批准购买" }, object: what(r), detail: r.why });
    await tell(row, { en: `Approved: pay ${r.payee} ${money(r.amount_cents)} on their page`, zh: `已批准：在 ${r.payee} 的页面支付 ${money(r.amount_cents)}` }, r.why);
    return ok({ purchase: toPurchase(row) });
  }

  if (action === "paid") {
    await requireAccess(ws, user, jwt, "member");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "approved" || r.method === "card") throw new HttpError("bad_request", "Only an approved purchase paid on the payee's page can be marked paid.");
    const receipt = body.receipt_path ? String(body.receipt_path).slice(0, 300) : null;
    // inside this workspace's folder, with no way back out of it ("ws/../other-ws/...")
    if (receipt && (!receipt.startsWith(`${ws}/`) || receipt.split("/").some((p) => p === ".." || p === "."))) throw new HttpError("bad_request", "That receipt isn't in this workspace.");
    const { data } = await admin.from("purchases").update({ status: "paid", paid_at: new Date().toISOString(), receipt_path: receipt }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Paid", zh: "已支付" }, object: what(r) });
    return ok({ purchase: toPurchase(data as Row) });
  }

  if (action === "cancel") {
    await requireAccess(ws, user, jwt, "owner");
    const r = await one(ws, uuidParam(body.id, "id"));
    if (r.status !== "asked" && r.status !== "approved") throw new HttpError("bad_request", "Only an unpaid purchase can be canceled.");
    if (r.method === "card") await closeCard(r, true);
    const { data } = await admin.from("purchases").update({ status: "canceled", decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Canceled a purchase", zh: "取消了购买" }, object: what(r) });
    return ok({ purchase: toPurchase(data as Row) });
  }

  throw new HttpError("bad_request", "Unknown action.");
});
