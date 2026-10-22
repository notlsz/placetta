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
//   cancel {id}                           owners: drops a purchase that isn't paid yet
import { decide, policyProblems, DEFAULT_POLICY, SPEND_CATEGORIES, type Purchase, type SpendCategory, type SpendPolicy } from "../../../src/spend.ts";
import { admin, audit, HttpError, ok, readBody, requireAccess, requireUser, serve, text, uuidParam, type L10n } from "./shared.ts";

type Row = {
  id: string; workspace_id: string; category: string; payee: string; payee_url: string | null; amount_cents: number; store_id: string | null;
  app_id: string | null; filing_id: string | null; why: L10n; status: Purchase["status"]; by_agent: boolean; approvals: { who: string; at: string }[];
  approvers_needed: number; reasons: L10n[] | null; method: "link" | null; receipt_path: string | null; created_at: string; paid_at: string | null;
};
const toPurchase = (r: Row): Purchase => ({
  id: r.id, at: r.created_at, category: r.category as SpendCategory, payee: r.payee, payeeUrl: r.payee_url ?? undefined, amount: r.amount_cents / 100,
  store: r.store_id ?? undefined, app: r.app_id ?? undefined, why: r.why, status: r.status, by: r.by_agent ? "agent" : "you", approvals: r.approvals,
  method: r.method ?? undefined, receipt: r.receipt_path ?? undefined, reasons: r.reasons ?? undefined,
});

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
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");

  if (action === "get") {
    await requireAccess(ws, user, jwt, "member");
    const [policy, rows] = await Promise.all([policyOf(ws), purchasesOf(ws, 200)]);
    return ok({ policy, purchases: rows.map(toPurchase) });
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
    if (r.status !== "approved") throw new HttpError("bad_request", "Only an approved purchase can be marked paid.");
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
    const { data } = await admin.from("purchases").update({ status: "canceled", decided_at: new Date().toISOString() }).eq("id", r.id).select("*").single();
    await audit({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Canceled a purchase", zh: "取消了购买" }, object: what(r) });
    return ok({ purchase: toPurchase(data as Row) });
  }

  throw new HttpError("bad_request", "Unknown action.");
});
