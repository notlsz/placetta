// Stripe Checkout and the billing portal. Prices live in Stripe, found by lookup key and made on first use
// (_shared/stripe_catalog.ts), so STRIPE_SECRET_KEY is the only Stripe secret needed. A secret below, when set, wins:
//   STRIPE_PRICE_ENTRY         one-time $299 a market; credited toward the first year only within 60 days of buying it
//   STRIPE_PRICE_LOCATION      Essentials: $149 a location a month, billed yearly (quantity = stores, open or opening)
//   STRIPE_PRICE_LOCATION_PRO  Pro: $299 a location a month, billed yearly (inspection readiness, a larger Odelia allowance)
//   STRIPE_PRICE_OPENING       one time $3,500 per retail store still opening
//   STRIPE_PRICE_OPENING_FOOD  one time $6,500 per restaurant or food store still opening
//   STRIPE_PRICE_GUARANTEE     one time $2,500 per opening, optional: the open-by-date guarantee
// Liquor and complex build-outs are quoted by the team (a team task), never charged at checkout.
//   STRIPE_PRICE_STARTER / _GROWTH / _EXTRA_LOCATION  older plans, kept only for anyone already on them
//   STRIPE_PRICE_PACK     one time, an Odelia pack: PACK_CREDIT_USD (default $25) more AI allowance per pack
// Credits: entry plans bought in the last 60 days come off the first invoice. Opening fees are not credited.
// Scale is quoted by the team, so it has no checkout. Actions: prices (any member), checkout, portal, sync_locations (owners).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { accessRpc, WORKS } from "../_shared/access.ts";
import { ensureWebhook, priceId, type Item } from "../_shared/stripe_catalog.ts";
import { chargeStep, filingFactsOf, filingQuote, hqCheckout, moduleApproval, moduleOf, QUOTE_TTL_S, modulePriceOk, moduleQuote, moduleUnits, openingCounts, ownerPriceOk, prorationCents,
  returnOrigins, safeReturn, type Store, storesFrom, STRIPE_FAILED, termOf, termPriceEnv, termPriceOk } from "./logic.ts";
import { moduleById } from "../../../src/modules.ts";
import { MODULE_PRICES, OWNER_PRICE_ENV } from "../../../src/pricing.ts";
import type { BillTo } from "../../../src/hqPlan.ts";
// Growth actions, at the owner prices the founder approved on 2026-10-22 (src/pricing.ts, docs/PRICING.md). Each is
// charged only from its own Stripe price (an env var), and only when Stripe's amount is exactly the approved one; when
// it's missing or differs, the team sends a quote and nothing is charged. Never a guessed amount.
//   filing_quote   what a filing past the plan costs: automated (Odelia on her own; the monthly allowance, then one
//                  $49 pack) or assisted (Placetta's team; $199 from STRIPE_PRICE_FILING_ASSISTED), from the filing's
//                  verified destination (supabase/functions/file/destinations.ts)
//   filing_charge  that filing, approved: counted in the allowance, or charged as an invoice item, only when the owner
//                  approved the exact price and kind shown and it fits under the owner's monthly cap (reserved in the
//                  database first, filing_charge_reserve)
//   module_quote   a module's units from the workspace's own facts (entities and states, sales tax states, licensed
//                  locations, countries) and what adding it charges now, from Stripe's own preview of the change
//   add_module     that module, approved at the units and cents shown: on the yearly plan from STRIPE_PRICE_MODULE_<ID>
//                  (abroad: one time per new country, on the next invoice), else a team quote
//   auto_renew     cancel auto-renew online (cancel_at_period_end) or turn it back on, one click either way
//   hq_checkout    headquarters pays for its brand: locations × the tier's price, people past the included number
//                  (STRIPE_PRICE_HQ_PERSON), and the published "from $25,000 a year" floor; hq_sync keeps the count
//   checkout       a two or three year term bills from its own discounted price (STRIPE_PRICE_LOCATION_2Y and the rest)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string, zh?: string) => json(status, { error: { code, message, ...(zh ? { message_zh: zh } : {}) } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});


/** owner, admin, member, viewer, staff (with two-step), mfa_required, staff_mfa_required, sso_required or none. Same rules as the database. */
async function accessFor(ws: string, user: { id: string; email?: string; email_confirmed_at?: string }, jwt: string): Promise<string> {
  const { data, error } = await accessRpc(admin, ws, user.id, jwt);
  if (!error) return String(data);
  // Fail closed: only a missing function (before the teams migration) falls back, and then every member is an owner.
  if (error.code !== "PGRST202") return "none";
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  if (!user.email_confirmed_at) return "none";
  const { data: s } = await admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  return s ? "staff" : "none";
}


/** Every request names the API version it's written for, so it doesn't change with the account's default. Since
    2025-03-31.basil an invoice item takes pricing[price], not price (a newer account rejects price outright). */
const STRIPE_VERSION = "2025-03-31.basil";

async function stripe(path: string, params: Record<string, string>, idem?: string) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")!;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_VERSION, ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) { console.error("stripe", path, res.status, data?.error?.message); throw new Error("Stripe refused the request"); }
  return data;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Stripe-Version": STRIPE_VERSION } });
  const data = await res.json();
  if (!res.ok) { console.error("stripe GET", path.split("/")[0], res.status, data?.error?.message); throw new Error("Stripe refused the request"); }
  return data;
}

/** The per-location prices as Stripe has them, so the app never shows a number Stripe doesn't charge. */
async function locationPrices() {
  const one = async (id: string | undefined) => {
    if (!id) return null;
    const p = await stripeGet(`prices/${encodeURIComponent(id)}`);
    return { amount: (p.unit_amount ?? 0) / 100, currency: String(p.currency ?? "usd").toUpperCase(), interval: p.recurring?.interval ?? null, interval_count: p.recurring?.interval_count ?? null };
  };
  const ids = await Promise.all((["essentials", "pro", "retail", "food", "guarantee", "pack", "entry"] as Item[]).map(price));
  const [location, pro, opening, opening_food, guarantee, pack, entry] = await Promise.all(ids.map(one));
  // which two and three year terms can be bought online: only those whose approved Stripe price is set
  const terms: Record<string, Record<string, boolean>> = {};
  for (const t of ["essentials", "pro"] as const) {
    terms[t] = {};
    for (const y of [2, 3]) terms[t][y] = !!(await verifiedPrice(termPriceEnv(t, y)!, (x) => termPriceOk(t, y, x)));
  }
  return { location, pro, opening, opening_food, guarantee, pack, entry, terms };
}

/**
 * The workspace's stores (open and opening), as billing knows them: from store_billing, which a database trigger keeps
 * from the workspace's stores and which members can't write. A store first seen opening stays opening there until its
 * opening fee is charged, and an unpaid opening store can't drop to a cheaper kind, so editing the workspace can't
 * lower a bill. Only a store still opening owes the opening fee: retail or food, and complex ones are quoted by the team.
 */
async function stores(ws: string): Promise<Store[]> {
  const { data, error } = await admin.from("store_billing").select("store_id, name, kind, opening").eq("workspace_id", ws).is("removed_at", null).limit(2000);
  if (error) throw new Error(`store lookup failed: ${error.code ?? ""}`);
  return storesFrom(data ?? []);
}
const env = (k: string) => Deno.env.get(k);
/** A price id from the catalog: its secret, else found or made in Stripe by lookup key. */
const price = (i: Item) => priceId(i, env);
/** Line items for the openings: one per kind, plus the guarantee when asked for. Complex stores are left to a quote. */
async function openingItems(list: Pick<Store, "opening" | "kind">[], guarantee: boolean): Promise<[string, number][]> {
  const { retail, food } = openingCounts(list);
  const items: [string, number][] = [];
  if (retail) items.push([(await price("retail"))!, retail]);
  if (food) items.push([(await price("food"))!, food]);
  if (guarantee && retail + food) items.push([(await price("guarantee"))!, retail + food]);
  return items;
}

/** The webhook's signing secret lives here when Placetta made the endpoint itself (service role only). */
const config = {
  async get(key: string) { const { data } = await admin.from("stripe_config").select("value").eq("key", key).maybeSingle(); return (data?.value as string | undefined) ?? undefined; },
  async set(key: string, value: string) { const { error } = await admin.from("stripe_config").upsert({ key, value, updated_at: new Date().toISOString() }); if (error) throw new Error(error.message); },
};
/** Before anyone pays: Stripe must be able to tell us, or the payment would never reach the workspace. */
async function webhookReady(): Promise<Response | null> {
  const how = await ensureWebhook(env, config, `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`);
  if (how === "manual") return fail(503, "not_configured", "A Stripe webhook to Placetta was made by hand. Set STRIPE_WEBHOOK_SECRET to its signing secret.");
  return null;
}
/** A complex opening (liquor, major build-out) goes to the team for a quote, once per store. */
async function askForQuote(ws: string, list: Store[]) {
  const rows = list.filter((s) => s.opening && s.kind === "complex").map((s) => ({ kind: "quote", workspace_id: ws, title: `Quote the opening for ${s.name}`, detail: { store_id: s.id }, dedupe: `quote:${ws}:${s.id}` }));
  if (rows.length) await admin.from("team_tasks").upsert(rows, { onConflict: "dedupe", ignoreDuplicates: true });
  return rows.length;
}

/** A price the team quotes instead of charging: one team task, once per dedupe key. */
async function teamQuote(ws: string | null, title: string, detail: Record<string, unknown>, dedupe: string) {
  await admin.from("team_tasks").upsert([{ kind: "quote", workspace_id: ws, title, detail, dedupe }], { onConflict: "dedupe", ignoreDuplicates: true });
}

/** An owner price's Stripe id from its env var, only when Stripe's amount is exactly the approved one; else null, and
 *  the caller falls back to a team quote. A mismatch goes to the log so the founder can fix the price. */
async function verifiedPrice(envName: string, ok: (p: Record<string, unknown>) => boolean): Promise<string | null> {
  const id = env(envName);
  if (!id) return null;
  const p = await stripeGet(`prices/${encodeURIComponent(id)}`);
  if (ok(p)) return id;
  console.error("billing: price differs from the approved list", envName);
  return null;
}

/** The parts of the workspace billing prices from: its filings, stores and entities, as saved on the server. */
async function wsState(ws: string): Promise<{ apps?: unknown; stores?: unknown; entities?: unknown } | null> {
  const { data, error } = await admin.from("workspaces").select("apps:state->apps, stores:state->stores, entities:state->entities").eq("id", ws).maybeSingle();
  if (error) throw new Error(`workspace lookup failed: ${error.code ?? ""}`);
  return data as { apps?: unknown; stores?: unknown; entities?: unknown } | null;
}

type Bill = { stripe_customer_id?: string | null; subscription_id?: string | null; subscription_status?: string | null; current_period_end?: string | null; abroad_countries?: string[] | null };
type SubItem = { id: string; quantity?: number; price?: { id?: string }; metadata?: Record<string, string> };

/** A module's quote, worked out on the server: the Stripe price (only the approved one), the units from the workspace's
 *  own facts, the subscription item it would change, and what the change charges now from Stripe's own preview at the
 *  second `at`, so the amount the owner sees is the amount charged. */
async function moduleQuoteFor(ws: string, id: NonNullable<ReturnType<typeof moduleOf>>, bill: Bill | null, at: number) {
  const mod = moduleById(id)!, per = MODULE_PRICES[id].per;
  const pid = await verifiedPrice(mod.env, (p) => modulePriceOk(id, p));
  const subId = bill?.subscription_id ?? null;
  const subscribed = !!subId && (bill?.subscription_status === "active" || bill?.subscription_status === "trialing");
  const { qty, countries } = moduleUnits(id, await wsState(ws), bill?.abroad_countries ?? []);
  let item: SubItem | undefined, customer: string | undefined;
  if (subscribed && pid) {
    const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId!)}`);
    customer = String(sub.customer ?? "") || undefined;
    if (per !== "once") item = ((sub.items?.data ?? []) as SubItem[]).find((i) => i.price?.id === pid || i.metadata?.module === id);
  }
  const had = Math.max(0, Number(item?.quantity) || 0);
  const renews = bill?.current_period_end ? String(bill.current_period_end).slice(0, 10) : null;
  let dueNowCents = 0;
  if (subscribed && pid && per !== "once" && qty !== had && (qty > 0 || had > 0)) {
    const p: Record<string, string> = { subscription: subId!, "subscription_details[proration_date]": String(at), "subscription_details[proration_behavior]": "always_invoice", "subscription_details[items][0][quantity]": String(qty) };
    if (customer) p.customer = customer;
    if (item) p["subscription_details[items][0][id]"] = item.id; else p["subscription_details[items][0][price]"] = pid;
    dueNowCents = prorationCents(await stripe("invoices/create_preview", p));
  }
  const q = moduleQuote(id, { qty, had, priceOk: !!pid, subscribed, dueNowCents, renews });
  return { q, pid, item, customer, subId, countries };
}

/** One year of the per-location price, in cents: what an opening fee is credited against. */
async function yearOfLocation(loc: string): Promise<{ cents: number; currency: string }> {
  const p = await stripeGet(`prices/${encodeURIComponent(loc)}`);
  const n = Math.max(1, Number(p.recurring?.interval_count) || 1);
  const per = { day: 365, week: 52, month: 12, year: 1 }[String(p.recurring?.interval) as "year"] ?? 1;
  return { cents: Math.round(((p.unit_amount ?? 0) * per) / n), currency: String(p.currency ?? "usd") };
}

/** The entry plan price in cents (what each market's $299 entry plan is credited at). */
async function entryCents(): Promise<number> {
  const id = await price("entry");
  if (!id) return 0;
  try { return Number((await stripeGet(`prices/${encodeURIComponent(id)}`)).unit_amount) || 0; } catch { return 0; }
}

/**
 * Headquarters pays for its brand (src/hqPlan.ts). Only the confirmed email the brand plan is kept under, and only when
 * that plan bills headquarters. The checkout bills every location that joined at the tier's published price, each person
 * on the franchisees' teams past the included number at the approved price (STRIPE_PRICE_HQ_PERSON, src/pricing.ts), and
 * the top-up to the published $25,000 floor. hq_sync keeps the location count in step and applies coverage.
 */
async function hqAction(body: Record<string, unknown>, user: { id: string; email?: string; email_confirmed_at?: string }): Promise<Response> {
  const email = (user.email ?? "").toLowerCase();
  if (!email || !user.email_confirmed_at) return fail(403, "forbidden", "Confirm your email first.");
  const { data: plan } = await admin.from("hq_plans").select("hq_email, bill_to, tier, stripe_customer_id, subscription_id").eq("hq_email", email).maybeSingle();
  if (!plan) return fail(409, "no_plan", "Set up the brand plan first.", "请先设置品牌方案。");
  const back = safeReturn(body.return_url, returnOrigins((k) => Deno.env.get(k)));
  if (!back) return fail(400, "bad_request", "Unknown return address. Add the app's origin to APP_ORIGINS.");
  const { data: counts } = await admin.rpc("hq_counts", { p_email: email });
  const c = (counts ?? { locations: 0, people: 0 }) as { locations: number; people: number };
  const tier = plan.tier === "pro" ? "pro" : "essentials";
  const { quote, ok } = hqCheckout({ billTo: plan.bill_to as BillTo, tier, locations: c.locations, people: c.people });
  try {
    if (body.action === "hq_sync") {
      if (plan.subscription_id) {
        const sub = await stripeGet(`subscriptions/${encodeURIComponent(String(plan.subscription_id))}`);
        const loc = await price(tier);
        const item = (sub.items?.data ?? []).find((i: { price?: { id?: string } }) => i.price?.id === loc);
        if (item && item.quantity !== Math.max(1, c.locations)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, c.locations)), proration_behavior: "create_prorations" });
      }
      const { data: n } = await admin.rpc("hq_cover_apply", { p_email: email });
      return json(200, { ok: true, covered: n ?? 0, quote });
    }
    if (!ok) return fail(409, "nothing_to_bill", plan.bill_to === "hq" ? "No location has joined yet. Send an invite first." : "Franchisees pay for their own stores on this plan.");
    if (body.renewal_consent !== true) return fail(400, "consent_required", "Agree to the renewal terms first.", "请先同意续费条款。");
    const loc = await price(tier);
    if (!loc) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY for per-location billing.");
    // people past those included: only from the approved Stripe price, else the team quotes and nothing is charged
    const person = quote.extraPeople > 0 ? await verifiedPrice(OWNER_PRICE_ENV.hqPerson.env, (x) => ownerPriceOk("hqPerson", x)) : null;
    if (quote.extraPeople > 0 && !person) {
      await teamQuote(null, `Quote the brand plan for ${email}`, { hq_email: email, extra_people: quote.extraPeople }, `quote:hq:${email}:people`);
      return fail(409, "quoted", "Our team sends you a quote for the people past those included. Nothing was charged.", "团队会就超出包含人数的部分向您报价。未收取任何费用。");
    }
    const notReady = await webhookReady();
    if (notReady) return notReady;
    const p: Record<string, string> = {
      mode: "subscription", success_url: `${back}?billing=success`, cancel_url: `${back}?billing=canceled`, client_reference_id: email,
      "metadata[hq_email]": email, "metadata[plan]": "hq", "metadata[tier]": tier, "subscription_data[metadata][hq_email]": email, "subscription_data[metadata][plan]": "hq",
      "line_items[0][price]": loc, "line_items[0][quantity]": String(quote.locations),
    };
    let i = 1;
    const inline = (name: string, cents: number, qty: number) => {
      p[`line_items[${i}][price_data][currency]`] = "usd"; p[`line_items[${i}][price_data][unit_amount]`] = String(cents);
      p[`line_items[${i}][price_data][recurring][interval]`] = "year"; p[`line_items[${i}][price_data][product_data][name]`] = name;
      p[`line_items[${i}][quantity]`] = String(qty); i++;
    };
    if (person) { p[`line_items[${i}][price]`] = person; p[`line_items[${i}][quantity]`] = String(quote.extraPeople); i++; }
    if (quote.topUpUsd > 0) inline("Placetta brand plan: headquarters minimum", Math.round(quote.topUpUsd * 100), 1);
    if (plan.stripe_customer_id) p.customer = String(plan.stripe_customer_id); else p.customer_email = email;
    const s = await stripe("checkout/sessions", p);
    return json(200, { ok: true, url: s.url, quote });
  } catch (e) {
    console.error("billing hq:", String(body.action ?? ""), (e as Error).message.slice(0, 200));
    return fail(502, "upstream_error", STRIPE_FAILED.en, STRIPE_FAILED.zh);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY in the Edge Function secrets.");

  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  // Headquarters has no workspace of its own: it is the signed-in, confirmed email its brand plan is kept under.
  if (body.action === "hq_checkout" || body.action === "hq_sync") return await hqAction(body, user);
  const ws = String(body.workspace_id ?? "");
  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access === "sso_required") return fail(401, "sso_required", "Your company requires single sign-on. Sign in with SSO to continue.");
  if (body.action === "prices") {
    if (!WORKS.has(access) && access !== "viewer") return fail(403, "forbidden", "This isn't your workspace.");
    try { return json(200, { ok: true, ...(await locationPrices()) }); } catch (e) {
      console.error("prices:", (e as Error).message.slice(0, 200));
      return fail(502, "upstream_error", STRIPE_FAILED.en, STRIPE_FAILED.zh);
    }
  }
  if (access === "member" || access === "admin" || access === "viewer") return fail(403, "forbidden", "Only an owner can change the plan or billing.");
  if (access !== "owner") return fail(403, "forbidden", "This isn't your workspace.");
  const back = safeReturn(body.return_url, returnOrigins((k) => Deno.env.get(k)));
  if (!back) return fail(400, "bad_request", "Unknown return address. Add the app's origin to APP_ORIGINS.");

  const { data: bill } = await admin.from("billing").select("stripe_customer_id, subscription_id, subscription_status, current_period_end, abroad_countries, charged_store_ids, entry_markets, entry_paid_at, entry_credited_at").eq("workspace_id", ws).maybeSingle();
  const customer = bill?.stripe_customer_id as string | null | undefined;

  try {
    if (body.action === "portal") {
      if (!customer) return fail(409, "no_customer", "There's no billing account yet.");
      const s = await stripe("billing_portal/sessions", { customer, return_url: back });
      return json(200, { ok: true, url: s.url });
    }

    if (body.action === "checkout" && body.plan === "locations") {
      const tier = body.tier === "pro" ? "pro" : "essentials", guarantee = body.guarantee === true;
      // The automatic renewal terms were shown next to the button and agreed to (src/contract.ts disclosure).
      if (body.renewal_consent !== true) return fail(400, "consent_required", "Agree to the renewal terms first.", "请先同意续费条款。");
      const years = termOf(body.term_years);
      // a two or three year term bills from its own discounted price, only the approved one; else the team quotes it
      const termEnv = termPriceEnv(tier, years);
      const loc = termEnv ? await verifiedPrice(termEnv, (x) => termPriceOk(tier, years, x)) : await price(tier);
      if (!loc && termEnv) {
        await teamQuote(ws, `Quote a ${years}-year ${tier} term`, { years, tier, by: user.id }, `quote:${ws}:term:${years}:${tier}`);
        return fail(409, "quoted", `Our team sends you a quote for a ${years}-year term. Nothing was charged.`, `团队会就 ${years} 年期向您报价。未收取任何费用。`);
      }
      if (!loc) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY for per-location billing.");
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const all = await stores(ws);
      const p: Record<string, string> = {
        mode: "subscription", success_url: `${back}?billing=success`, cancel_url: `${back}?billing=canceled`,
        client_reference_id: ws, "metadata[workspace_id]": ws, "metadata[plan]": "locations", "metadata[tier]": tier, "metadata[guarantee]": guarantee ? "1" : "0",
        "subscription_data[metadata][workspace_id]": ws, "subscription_data[metadata][plan]": "locations", "subscription_data[metadata][tier]": tier, "subscription_data[metadata][guarantee]": guarantee ? "1" : "0",
        "metadata[term_years]": String(years), "subscription_data[metadata][term_years]": String(years), "metadata[renewal_consent]": new Date().toISOString(),
        "line_items[0][price]": loc, "line_items[0][quantity]": String(Math.max(1, all.length)),
      };
      // Stores already open pay no opening fee; each store still opening pays it once, by kind; complex ones are quoted.
      (await openingItems(all, guarantee)).forEach(([price, qty], i) => { p[`line_items[${i + 1}][price]`] = price; p[`line_items[${i + 1}][quantity]`] = String(qty); });
      const quoted = await askForQuote(ws, all);
      // The entry plans are credited toward the first year when bought in the last 60 days.
      const year = await yearOfLocation(loc);
      const fresh = bill?.entry_paid_at && Date.now() - Date.parse(String(bill.entry_paid_at)) <= 60 * 864e5;
      const entry = bill?.entry_credited_at || !fresh ? 0 : (Number(bill?.entry_markets) || 0) * (await entryCents());
      const credit = entry;
      if (credit > 0) {
        const c = await stripe("coupons", { amount_off: String(credit), currency: year.currency, duration: "once", max_redemptions: "1", name: "Entry plan credit", "metadata[workspace_id]": ws });
        p["discounts[0][coupon]"] = c.id;
        p["metadata[entry_credit]"] = String(entry);
      } else p.allow_promotion_codes = "true";
      if (customer) p.customer = customer; else if (user.email) p.customer_email = user.email;
      const sess = await stripe("checkout/sessions", p);
      // The stores this checkout bills for: once it's paid, the webhook counts exactly these, so a store added while
      // the person is on Stripe's page still gets its opening fee on the next invoice.
      await admin.from("billing").update({ checkout_store_ids: all.map((s) => s.id) }).eq("workspace_id", ws);
      return json(200, { ok: true, url: sess.url, ...(quoted ? { quoted } : {}) });   // the webhook records which stores were counted, once it's paid
    }

    if (body.action === "sync_locations") {
      // Keep the subscription's store count in step with the workspace, and add the opening fee for new stores.
      const subId = bill?.subscription_id as string | null | undefined;
      if (!subId) return json(200, { ok: true, synced: false });
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
      if (sub?.metadata?.plan !== "locations" || !["active", "trialing", "past_due"].includes(sub.status)) return json(200, { ok: true, synced: false });
      const terms = (["essentials", "pro"] as const).flatMap((t) => [2, 3].map((y) => env(termPriceEnv(t, y)!)));
      const locs = [...(await Promise.all([price("essentials"), price("pro")])), ...terms].filter(Boolean);
      const item = (sub.items?.data ?? []).find((i: { price?: { id?: string } }) => locs.includes(i.price?.id));
      const all = await stores(ws);
      if (item && item.quantity !== Math.max(1, all.length)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, all.length)), proration_behavior: "create_prorations" });
      const charged = new Set<string>((bill?.charged_store_ids as string[] | null) ?? []);
      const fresh = all.filter((s) => !charged.has(s.id));
      const openings = fresh.filter((s) => s.opening && s.kind !== "complex").length;
      // a new store still opening: its opening fee (and the guarantee, when the plan has it) on the next invoice
      if (sub.customer) for (const [id, qty] of await openingItems(fresh, sub.metadata?.guarantee === "1"))
        await stripe("invoiceitems", { customer: String(sub.customer), "pricing[price]": id, quantity: String(qty), subscription: subId, "metadata[workspace_id]": ws });
      await askForQuote(ws, fresh);
      if (fresh.length) await admin.from("billing").update({ charged_store_ids: [...charged, ...fresh.map((s) => s.id)] }).eq("workspace_id", ws);
      return json(200, { ok: true, synced: true, stores: all.length, new_openings: openings });
    }

    // A filing past the plan (src/overage.ts): its price from who does the work. Automated: the allowance first, then
    // one pack. Assisted: $199 from its approved Stripe price, else a team quote. Always the exact price and kind the
    // owner was shown, under the owner's hard monthly cap, reserved in the database before Stripe is asked, and let go
    // if Stripe refuses.
    if (body.action === "filing_quote" || body.action === "filing_charge") {
      const { data: month, error: me } = await admin.rpc("filing_month", { ws });
      if (me || !month) return fail(503, "not_configured", "Filing charges aren't set up on this server yet.");
      const mo = month as { locations: number; used: number; charged_cents: number; cap_cents: number; paid: boolean };
      const facts = filingFactsOf((await wsState(ws))?.apps, body.ref);
      const packId = await price("pack");
      const packCents = packId ? Number((await stripeGet(`prices/${encodeURIComponent(packId)}`)).unit_amount) || undefined : undefined;
      const assistedId = facts?.mode === "assisted" ? await verifiedPrice(OWNER_PRICE_ENV.filingAssisted.env, (x) => ownerPriceOk("filingAssisted", x)) : null;
      const m = { locations: mo.paid ? Math.max(mo.locations, 1) : 0, used: mo.used, chargedCents: mo.charged_cents, capCents: mo.cap_cents, packCents, assistedCents: assistedId ? OWNER_PRICE_ENV.filingAssisted.cents : null };
      if (body.action === "filing_quote") {
        const quote = filingQuote(facts, m);
        return quote ? json(200, { ok: true, quote }) : fail(404, "not_found", "That filing isn't in this workspace.", "此工作区中没有这份申报。");
      }
      const step = chargeStep(body, facts, m);
      if (step.do === "refuse") return fail(step.status, step.code, step.message, step.message_zh);
      if (step.do === "none") return json(200, { ok: true, kind: "plan", cents: 0 });
      if (step.do === "quote") {
        await teamQuote(ws, `Quote the assisted filing ${String(body.ref)}`, { ref: String(body.ref), by: user.id }, `quote:${ws}:filing:${String(body.ref)}`);
        return fail(409, "quoted", `${step.message} Nothing was filed or charged yet.`, `${step.message_zh}尚未提交或收费。`);
      }
      const chargePrice = step.mode === "assisted" ? assistedId : packId;
      if (step.charge && (!customer || !chargePrice)) return fail(409, "no_customer", "There's no billing account to charge yet.", "还没有可收费的账单账户。");
      const { data: held, error: he } = await admin.rpc("filing_charge_reserve", { p_ws: ws, p_ref: String(body.ref), p_kind: step.kind, p_cents: step.cents, p_allow: step.allow, p_user: user.id, p_mode: step.mode });
      if (he) throw new Error(`reserve: ${he.code}`);
      const r = held as { ok: boolean; id?: string; kind?: string; again?: boolean; code?: string; left_cents?: number };
      if (!r.ok) return fail(409, r.code ?? "refused", r.code === "over_cap" ? "That would pass your monthly cap. Nothing was charged." : "Nothing was charged.", r.code === "over_cap" ? "这会超过您的每月上限，未收取任何费用。" : "未收取任何费用。");
      if (r.kind === "allowance" || r.again) return json(200, { ok: true, kind: r.kind, cents: r.kind === "allowance" ? 0 : step.cents, again: !!r.again });
      try {
        const item = await stripe("invoiceitems", { customer: customer!, "pricing[price]": chargePrice!, quantity: String(step.mode === "assisted" ? 1 : step.packs), ...(bill?.subscription_id ? { subscription: String(bill.subscription_id) } : {}),
          "metadata[workspace_id]": ws, "metadata[kind]": "filing", "metadata[mode]": step.mode, "metadata[ref]": String(body.ref), "metadata[approved_by]": user.id }, `filing-${r.id}`);
        await admin.rpc("filing_charge_settle", { p_id: r.id, p_ok: true, p_item: item.id });
      } catch (e) {
        await admin.rpc("filing_charge_settle", { p_id: r.id, p_ok: false, p_item: null });
        throw e;
      }
      await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a filing charge", zh: "批准了申报费用" },
        object: { en: String(body.ref), zh: String(body.ref) }, detail: { en: `$${(step.cents / 100).toFixed(2)} on the next invoice`, zh: `$${(step.cents / 100).toFixed(2)}，计入下一张账单` } });
      return json(200, { ok: true, kind: "charge", cents: step.cents });
    }

    // A module (src/modules.ts), by its own unit from the workspace's facts. module_quote says the units and what the
    // change charges now (Stripe's preview at that second); add_module bills exactly that, or asks the team to quote.
    if (body.action === "module_quote" || body.action === "add_module") {
      const id = moduleOf(body.module);
      if (!id) return fail(400, "bad_request", "Unknown module.");
      const now = Math.floor(Date.now() / 1000);
      const at = body.action === "add_module" && typeof body.quote_at === "number" ? Math.floor(body.quote_at) : now;
      if (body.action === "add_module" && (now - at > QUOTE_TTL_S || at > now + 60)) return fail(409, "quote_expired", "That price was shown a while ago. Look at it again before approving. Nothing was charged.", "该价格显示已久，请重新查看后再批准。未收取任何费用。");
      const { q, pid, item, customer: cus, subId, countries } = await moduleQuoteFor(ws, id, bill as Bill | null, at);
      if (body.action === "module_quote") return json(200, { ok: true, quote: q, quote_at: at });
      if (!q.billed) {
        // without its approved price the team quotes it; anything else (no plan, nothing to count yet) is said as it is
        if (q.reason !== "no_price") return fail(409, q.reason ?? "refused", q.line.en, q.line.zh);
        const { data: st, error: e2 } = await admin.rpc("module_apply", { p_ws: ws, p_module: id, p_on: false, p_user: user.id });
        if (e2) throw new Error(`module: ${e2.code}`);
        return json(200, { ok: true, module: id, state: st });
      }
      const ok = moduleApproval(q, { qty: body.shown_qty, cents: body.shown_cents, at: body.quote_at }, now);
      if (!ok.ok) return fail(409, ok.code, ok.message, ok.message_zh);
      const meta = { "metadata[workspace_id]": ws, "metadata[module]": id, "metadata[approved_by]": user.id };
      const idem = `module-${ws}-${id}-${at}-${q.qty}`;
      if (MODULE_PRICES[id].per === "once") {
        await stripe("invoiceitems", { customer: cus!, "pricing[price]": pid!, quantity: String(q.qty), subscription: subId!, "metadata[countries]": countries.join(","), ...meta }, idem);
      } else if (item) {
        await stripe(`subscription_items/${encodeURIComponent(item.id)}`, { quantity: String(q.qty), proration_behavior: "always_invoice", proration_date: String(at) }, idem);
      } else {
        await stripe("subscription_items", { subscription: subId!, price: pid!, quantity: String(q.qty), proration_behavior: "always_invoice", proration_date: String(at), ...meta }, idem);
      }
      const { data: st, error: e2 } = await admin.rpc("module_bill_apply", { p_ws: ws, p_module: id, p_qty: q.qty, p_countries: countries, p_user: user.id });
      if (e2) throw new Error(`module: ${e2.code}`);
      await admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en: "Approved a module charge", zh: "批准了模块费用" },
        object: moduleById(id)!.name, detail: q.line });
      return json(200, { ok: true, module: id, state: st, cents: q.dueNowCents, qty: q.qty });
    }

    // Auto-renew off is the online cancel (Cal. Bus. & Prof. Code § 17602(d)(1)): one call, no other step; on undoes it.
    if (body.action === "auto_renew") {
      const on = body.on === true, subId = bill?.subscription_id as string | null | undefined;
      if (subId) await stripe(`subscriptions/${encodeURIComponent(subId)}`, { cancel_at_period_end: on ? "false" : "true" });
      const { error: e3 } = await admin.rpc("billing_auto_renew_apply", { p_ws: ws, p_on: on, p_user: user.id });
      if (e3) throw new Error(`auto_renew: ${e3.code}`);
      return json(200, { ok: true, auto_renew: on });
    }

    // An Odelia pack: more AI allowance on top of the plan, carried over until it's used (like Devin's extra ACUs).
    // Only for a paid plan: a trial or an ended entry plan moves to a plan instead.
    if (body.action === "pack") {
      const pack = await price("pack");
      if (!pack) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY for Odelia packs.");
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const { data: budget } = await admin.rpc("ai_budget", { ws });
      const plan = (budget as { plan?: string } | null)?.plan;
      if (plan !== "monthly" && plan !== "entry" && plan !== "comped") return fail(409, "plan_required", "Packs add to a plan. Pick a plan first.");
      const packs = Math.max(1, Math.min(10, Math.floor(Number(body.packs) || 1)));
      const credit = Math.max(1, Number(Deno.env.get("PACK_CREDIT_USD") ?? "25"));
      const p: Record<string, string> = {
        mode: "payment", "line_items[0][price]": pack, "line_items[0][quantity]": String(packs),
        success_url: `${back}?billing=success`, cancel_url: `${back}?billing=cancel`, client_reference_id: ws,
        "metadata[workspace_id]": ws, "metadata[kind]": "pack", "metadata[packs]": String(packs), "metadata[credit_usd]": String(credit * packs),
      };
      if (customer) p.customer = customer; else if (user.email) p.customer_email = user.email;
      const s = await stripe("checkout/sessions", p);
      return json(200, { ok: true, url: s.url });
    }

    if (body.action === "checkout") {
      const plan = String(body.plan ?? "");
      const chosen = plan === "entry" ? await price("entry") : { starter: Deno.env.get("STRIPE_PRICE_STARTER"), growth: Deno.env.get("STRIPE_PRICE_GROWTH") }[plan as "starter"];
      if (!chosen) return fail(plan === "entry" || plan === "starter" || plan === "growth" ? 503 : 400, plan ? "not_configured" : "bad_request", `Set the Stripe price for the ${plan || "chosen"} plan.`);
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const markets = Math.max(1, Math.min(20, Math.floor(Number(body.markets) || 1)));
      const extra = Math.max(0, Math.min(500, Math.floor(Number(body.extra_locations) || 0)));
      const p: Record<string, string> = {
        mode: plan === "entry" ? "payment" : "subscription",
        "line_items[0][price]": chosen,
        "line_items[0][quantity]": plan === "entry" ? String(markets) : "1",
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=cancel`,
        client_reference_id: ws,
        "metadata[workspace_id]": ws,
        "metadata[plan]": plan,
        "metadata[markets]": String(markets),
        allow_promotion_codes: "true",
      };
      if (plan !== "entry") {
        p["subscription_data[metadata][workspace_id]"] = ws;
        p["subscription_data[metadata][plan]"] = plan;
        const extraPrice = Deno.env.get("STRIPE_PRICE_EXTRA_LOCATION");
        if (extra && extraPrice) { p["line_items[1][price]"] = extraPrice; p["line_items[1][quantity]"] = String(extra); }
      }
      if (customer) p.customer = customer;
      else {
        if (user.email) p.customer_email = user.email;
        if (plan === "entry") p.customer_creation = "always";
      }
      const s = await stripe("checkout/sessions", p);
      return json(200, { ok: true, url: s.url });
    }
  } catch (e) {
    // Stripe's own words (and anything else that went wrong) go to the log, not to the person.
    console.error("billing:", String(body.action ?? ""), (e as Error).message.slice(0, 200));
    return fail(502, "upstream_error", STRIPE_FAILED.en, STRIPE_FAILED.zh);
  }
  return fail(400, "bad_request", "Unknown action.");
});
