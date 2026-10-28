// Stripe Checkout and the billing portal. Prices live in Stripe, found by lookup key (_shared/stripe_catalog.ts), so
// STRIPE_SECRET_KEY is the only Stripe secret needed. The code never makes a price, and never offers or charges the
// prices from before the simple model (src/pricing.ts LEGACY_LOOKUPS): their actions below answer "plan_retired".
// What follows is kept as the record of what those prices were:
//   STRIPE_PRICE_ENTRY         one-time $299 a market; credited toward the first year only within 60 days of buying it
//   STRIPE_PRICE_LOCATION      Essentials: $149 a location a month, billed yearly (quantity = stores, open or opening)
//   STRIPE_PRICE_LOCATION_PRO  Pro: $299 a location a month, billed yearly (inspection readiness, a larger Odelia allowance)
//   STRIPE_PRICE_OPENING       one time $3,500 per retail store still opening
//   STRIPE_PRICE_OPENING_FOOD  one time $6,500 per restaurant or food store still opening
//   STRIPE_PRICE_GUARANTEE     one time $2,500 per opening, optional: the open-by-date guarantee
// Liquor and complex build-outs are quoted by the team (a team task), never charged at checkout.
//   STRIPE_PRICE_STARTER / _GROWTH / _EXTRA_LOCATION  older plans, kept only for anyone already on them
//   STRIPE_PRICE_PACK     one time, an Odelia pack: PACK_CREDIT_USD (default $25) more AI allowance per pack
// Everything in this block is for customers from before the simple model (billing.price_model = 'legacy') only.
// Credits: entry plans bought in the last 60 days come off the first invoice. Opening fees are not credited.
// Scale is quoted by the team, so it has no checkout. Actions: prices (any member), checkout, portal, sync_locations (owners).
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { aalOf, accessRpc, WORKS } from "../_shared/access.ts";
import { billingHealth, ensureWebhook, itemOf, priceId, verifiedSimplePrice, type Item } from "../_shared/stripe_catalog.ts";
import { applyCheckoutSession, applySubscription } from "../_shared/stripe_apply.ts";
import { configStore, stripeDb } from "../_shared/stripe_db.ts";
import { chargeStep, isChain, planQuantity, filingFactsOf, filingQuote, hqCheckout, licenseFactsOf, moduleApproval, moduleOf, QUOTE_TTL_S, modulePriceOk, moduleQuote, moduleUnits, ownerPriceOk, planCheckoutParams, planIntervalOf, prorationCents,
  returnOrigins, safeReturn, simpleApproval, simpleQuote, type Store, storesFrom, STRIPE_FAILED, LIVE_SUB, packCheckoutParams, SIMPLE_PACK_CREDIT_USD, syncStep } from "./logic.ts";
import { moduleById } from "../../../src/modules.ts";
import { MODULE_PRICES, OWNER_PRICE_ENV, priceModelOf, SIMPLE, SIMPLE_PRICE_ENV, storePlanItemOf, type SimpleItem } from "../../../src/pricing.ts";
// The simple model (src/pricing.ts SIMPLE, docs/PRICING.md), for every workspace that wasn't a customer before it shipped
// (billing.price_model = 'simple'). Customers from before ('legacy') keep the plans above, and the old checkouts stay
// theirs only. Each simple price is charged only from its own Stripe price (never made by this code), and only when
// Stripe's amount is exactly the approved one; otherwise the team sends a quote and nothing is charged.
//   STRIPE_PRICE_LICENSE           $299 one time, a license filed
//   STRIPE_PRICE_LICENSE_COMPLEX   $999 one time, a license on the complex list (liquor, building plan review, import permits)
//   STRIPE_PRICE_RENEWAL           $99 one time, a renewal the plan doesn't include, after the owner's one-tap approval
//   STRIPE_PRICE_STORE_PLAN        $1,788 a year: the store plan, $149 a store a month, billed yearly
//   license_quote   what this filing costs, shown before approval: $299, $999, a $99 renewal, free, or included (a
//                   renewal Odelia files on her own, on the store plan; everything, with 10 or more stores on it)
//   license_pay     that filing, approved at the price shown: charged to the saved card for a renewal (one tap), else
//                   Stripe Checkout; once paid, the filing may go in (the database checks, can_file_app)
//   plan_checkout   the store plan for every store in the workspace, billed yearly
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
/** The webhook's signing secret lives here when Placetta made the endpoint itself (service role only). */
const config = configStore(admin);
const WEBHOOK_URL = () => `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
/** Before anyone pays: Stripe must be able to tell us, or the payment would never reach the workspace. */
async function webhookReady(): Promise<Response | null> {
  const how = await ensureWebhook(env, config, WEBHOOK_URL());
  if (how === "manual") return fail(503, "not_configured", "A Stripe webhook to Placetta was made by hand. Set STRIPE_WEBHOOK_SECRET to its signing secret.");
  return null;
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

/** The workspace's price model. Before migration 20261023120000 has run there is no column: every workspace is then
 *  treated as before ('legacy'), so nothing changes until the database knows who is grandfathered. */
async function modelOf(ws: string) {
  const { data, error } = await admin.from("billing").select("price_model").eq("workspace_id", ws).maybeSingle();
  return error ? "legacy" as const : priceModelOf(data as { price_model?: string } | null);
}

/** The simple model's Stripe price for an item (its env var, else its lookup key), only when it's exactly the approved
 *  one; else null (a team quote). */
const simplePrice = (item: SimpleItem) => verifiedSimplePrice(item, env);
/** Which simple prices can be bought online now, for the plans sheet. */
async function simplePrices(): Promise<Record<SimpleItem, boolean>> {
  const items = Object.keys(SIMPLE_PRICE_ENV) as SimpleItem[];
  const ids = await Promise.all(items.map((i) => simplePrice(i).catch(() => null)));
  return Object.fromEntries(items.map((i, k) => [i, !!ids[k]])) as Record<SimpleItem, boolean>;
}

/** A filing's simple-model quote, worked out on the server from the saved workspace, its history and Stripe. */
async function licenseQuoteFor(ws: string, ref: unknown, bill: { subscription_status?: string | null; comped?: boolean | null; paid_locations?: number | null } | null) {
  const facts = licenseFactsOf((await wsState(ws))?.apps, ref);
  if (!facts) return null;
  const { data: st, error } = await admin.rpc("license_state", { p_ws: ws, p_ref: String(ref) });
  if (error) throw new Error(`license_state: ${error.code ?? ""}`);
  const s = st as { renewal: boolean; paid: { tier: string; cents: number } | null };
  const onPlan = bill?.subscription_status === "active" || bill?.subscription_status === "trialing";
  const chain = !!bill?.comped || (onPlan && isChain(Number(bill?.paid_locations) || 0));
  // a renewal is included on the plan when Odelia can file it on her own (its verified destination, src/overage.ts)
  const automated = filingFactsOf((await wsState(ws))?.apps, ref)?.mode === "automated";
  const ids: Partial<Record<SimpleItem, string | null>> = {};
  for (const i of ["license", "complex", "renewal"] as SimpleItem[]) ids[i] = chain || s.paid ? null : await simplePrice(i);
  const q = simpleQuote(facts, { renewal: !!s.renewal, paid: s.paid, chain, onPlan, automated, priceOk: (i) => !!ids[i] });
  return { q, facts, priceId: q.tier === "license" || q.tier === "complex" || q.tier === "renewal" ? ids[q.tier] ?? null : null };
}

/** A card the customer saved at an earlier Checkout (setup_future_usage), for a one-tap renewal; else null. */
async function savedCard(customer: string): Promise<string | null> {
  const c = await stripeGet(`customers/${encodeURIComponent(customer)}`);
  const d = c?.invoice_settings?.default_payment_method;
  if (typeof d === "string" && d) return d;
  const list = await stripeGet(`payment_methods?customer=${encodeURIComponent(customer)}&type=card&limit=1`);
  return (list?.data?.[0]?.id as string | undefined) ?? null;
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
        // the location line: the store plan's yearly price (or, for a brand plan from before, its own price)
        const item = (sub.items?.data ?? []).find((i: { price?: { id?: string; lookup_key?: string | null } }) => storePlanItemOf(i.price, env) === "plan" || !!itemOf(i.price, env) && itemOf(i.price, env) !== "pack");
        if (item && item.quantity !== Math.max(1, c.locations)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, c.locations)), proration_behavior: "create_prorations" });
      }
      const { data: n } = await admin.rpc("hq_cover_apply", { p_email: email });
      return json(200, { ok: true, covered: n ?? 0, quote });
    }
    if (!ok) return fail(409, "nothing_to_bill", plan.bill_to === "hq" ? "No location has joined yet. Send an invite first." : "Franchisees pay for their own stores on this plan.");
    if (body.renewal_consent !== true) return fail(400, "consent_required", "Agree to the renewal terms first.", "请先同意续费条款。");
    // a location: the store plan's yearly price ($1,788, the same $149 a month). Pro has no current price: the team quotes.
    const loc = tier === "essentials" ? await simplePrice("plan") : null;
    if (!loc) {
      await teamQuote(null, `Quote the brand plan (${tier}) for ${email}`, { hq_email: email, tier, locations: quote.locations }, `quote:hq:${email}:${tier}`);
      return fail(409, "quoted", "Our team sends you a quote for the brand plan. Nothing was charged.", "团队会就品牌方案向您报价。未收取任何费用。");
    }
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
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(jwt);
  const user = auth?.user;
  if (!user) return fail(401, "unauthorized", "Sign in again.");

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  // Billing health, for staff with two-step: the key, the webhook and its events, the signing secret, the prices by
  // lookup key and the legacy prices still active. It makes or repairs the webhook first, so a staff member can finish
  // the setup the moment STRIPE_SECRET_KEY is set (the monitor's daily run does the same on its own).
  if (body.action === "health") {
    const email = (user.email ?? "").toLowerCase();
    const { data: st } = email && user.email_confirmed_at ? await admin.from("staff_emails").select("email").eq("email", email).maybeSingle() : { data: null };
    if (!st) return fail(403, "forbidden", "Staff only.");
    if (aalOf(jwt) !== "aal2") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
    try {
      const h = await billingHealth(env, config, WEBHOOK_URL(), { ensure: true });
      await config.set("health", JSON.stringify(h)).catch(() => undefined);
      return json(200, { ok: true, health: h });
    } catch (e) {
      console.error("billing health:", (e as Error).message.slice(0, 200));
      return fail(502, "upstream_error", STRIPE_FAILED.en, STRIPE_FAILED.zh);
    }
  }
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY in the Edge Function secrets.");
  // Headquarters has no workspace of its own: it is the signed-in, confirmed email its brand plan is kept under.
  if (body.action === "hq_checkout" || body.action === "hq_sync") return await hqAction(body, user);
  const ws = String(body.workspace_id ?? "");
  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (access === "sso_required") return fail(401, "sso_required", "Your company requires single sign-on. Sign in with SSO to continue.");
  if (body.action === "prices") {
    if (!WORKS.has(access) && access !== "viewer") return fail(403, "forbidden", "This isn't your workspace.");
    try {
      // the simple model's prices only: a customer from before keeps its plan, and its old prices are never offered
      const model = await modelOf(ws);
      return json(200, { ok: true, model, simple: { prices: SIMPLE, online: await simplePrices() } });
    } catch (e) {
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
  const model = await modelOf(ws);

  try {
    // ---------------------------------------------------------------- the simple model
    if (body.action === "license_quote" || body.action === "license_pay") {
      if (model !== "simple") return fail(409, "legacy_plan", "This workspace keeps its plan: its licenses are part of it.", "此工作区沿用原方案，执照已包含在内。");
      const { data: cb } = await admin.from("billing").select("comped, paid_locations").eq("workspace_id", ws).maybeSingle();
      const c2 = cb as { comped?: boolean; paid_locations?: number } | null;
      const lq = await licenseQuoteFor(ws, body.ref, { subscription_status: bill?.subscription_status as string | null, comped: c2?.comped ?? false, paid_locations: c2?.paid_locations ?? 0 });
      if (!lq) return fail(404, "not_found", "That filing isn't in this workspace. Nothing was charged.", "此工作区中没有这份申报，未收取任何费用。");
      const { q, facts, priceId: pid } = lq;
      if (body.action === "license_quote") return json(200, { ok: true, quote: q });
      const ok = simpleApproval(q, { tier: body.shown_tier, cents: body.shown_cents });
      if (!ok.ok) return fail(409, ok.code, ok.message, ok.message_zh);
      const ref = String(body.ref);
      // with 10 or more stores on the plan (or comped) it's included: the database already lets it go in
      if (q.tier === "chain") return json(200, { ok: true, paid: true, included: true });
      // a renewal Odelia files on her own, on the store plan: recorded as included ($0), so the database lets it go in
      if (q.tier === "plan") {
        const { data: inc, error: ie } = await admin.rpc("license_charge_open", { p_ws: ws, p_ref: String(body.ref), p_tier: "included", p_cents: 0, p_user: user.id });
        if (ie || !(inc as { ok?: boolean })?.ok) throw new Error(`license_charge_open included: ${ie?.code ?? ""}`);
        return json(200, { ok: true, paid: true, included: true });
      }
      if (q.paid) return json(200, { ok: true, paid: true });
      if (!q.priceOk) {
        await teamQuote(ws, `Quote the ${q.tier} filing ${facts.name}`, { ref, tier: q.tier, by: user.id }, `quote:${ws}:license:${ref}`);
        return fail(409, "quoted", "The team sends you a quote for this filing. Nothing was charged.", "团队会就这份申报向您报价。未收取任何费用。");
      }
      const { data: opened, error: oe } = await admin.rpc("license_charge_open", { p_ws: ws, p_ref: ref, p_tier: q.tier, p_cents: q.cents, p_user: user.id });
      if (oe) throw new Error(`license_charge_open: ${oe.code}`);
      const o = opened as { ok: boolean; id?: string; paid?: boolean; code?: string };
      if (!o.ok) return fail(409, o.code ?? "refused", "Nothing was charged.", "未收取任何费用。");
      const audit = (en: string, zh: string) => admin.from("audit_log").insert({ workspace_id: ws, actor: "you", actor_id: user.id, action: { en, zh }, object: { en: facts.name, zh: facts.name }, detail: q.line });
      if (o.paid) { if (q.tier === "free") await audit("Approved a free filing", "批准了免费申报"); return json(200, { ok: true, paid: true }); }
      const meta = { "metadata[workspace_id]": ws, "metadata[kind]": "license", "metadata[charge_id]": o.id!, "metadata[ref]": ref, "metadata[tier]": q.tier, "metadata[approved_by]": user.id };
      // A renewal with a card saved at an earlier checkout: one tap, charged now, nothing else to do.
      if (q.tier === "renewal" && customer) {
        const pm = await savedCard(customer).catch(() => null);
        if (pm) {
          let inv: { id?: string; status?: string } | null = null;
          try {
            await stripe("invoiceitems", { customer, "pricing[price]": pid!, quantity: "1", ...meta }, `license-item-${o.id}`);
            inv = await stripe("invoices", { customer, collection_method: "charge_automatically", auto_advance: "false", pending_invoice_items_behavior: "include", default_payment_method: pm, description: `Renewal: ${facts.name}`, ...meta }, `license-inv-${o.id}`);
            await stripe(`invoices/${inv!.id}/finalize`, {}, `license-fin-${o.id}`);
            const paid = await stripe(`invoices/${inv!.id}/pay`, { off_session: "true" }, `license-pay-${o.id}`);
            if (paid?.status !== "paid") throw new Error("not paid");
            await admin.rpc("license_charge_settle", { p_id: o.id, p_ok: true, p_stripe: inv!.id });
            await audit("Approved and paid a renewal", "批准并支付了续期");
            return json(200, { ok: true, paid: true, cents: q.cents });
          } catch (e) {
            // the card was refused: let the charge go and fall through to Checkout, where the owner pays by hand
            console.error("billing renewal off-session:", (e as Error).message.slice(0, 200));
            if (inv?.id) await stripe(`invoices/${inv.id}/void`, {}).catch(() => undefined);
            await admin.rpc("license_charge_settle", { p_id: o.id, p_ok: false, p_stripe: inv?.id ?? null });
            const { data: again } = await admin.rpc("license_charge_open", { p_ws: ws, p_ref: ref, p_tier: q.tier, p_cents: q.cents, p_user: user.id });
            meta["metadata[charge_id]"] = (again as { id: string }).id;
          }
        }
      }
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const p: Record<string, string> = {
        mode: "payment", "line_items[0][price]": pid!, "line_items[0][quantity]": "1",
        success_url: `${back}?billing=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${back}?billing=cancel`, client_reference_id: ws,
        "payment_intent_data[setup_future_usage]": "off_session", "payment_intent_data[description]": `${q.tier === "renewal" ? "Renewal" : "License"}: ${facts.name}`.slice(0, 200),
        ...meta,
        // on the payment too, so a refund (charge.refunded names the payment, not the Checkout) lets the charge go
        "payment_intent_data[metadata][workspace_id]": ws, "payment_intent_data[metadata][kind]": "license",
        "payment_intent_data[metadata][charge_id]": meta["metadata[charge_id]"], "payment_intent_data[metadata][ref]": ref,
      };
      if (customer) p.customer = customer; else { if (user.email) p.customer_email = user.email; p.customer_creation = "always"; }
      const s = await stripe("checkout/sessions", p, `license-cs-${meta["metadata[charge_id]"]}`);
      await audit("Approved a filing charge", "批准了申报费用");
      return json(200, { ok: true, paid: false, url: s.url, cents: q.cents });
    }

    if (body.action === "plan_checkout") {
      if (model !== "simple") return fail(409, "legacy_plan", "This workspace keeps its plan.", "此工作区沿用原方案。");
      if (body.renewal_consent !== true) return fail(400, "consent_required", "Agree to the renewal terms first.", "请先同意续费条款。");
      // one store plan per workspace: a second checkout would bill every store twice
      if (bill?.subscription_id && LIVE_SUB.has(String(bill.subscription_status))) return fail(409, "already_subscribed", "This workspace already has the store plan. Change it in Settings, Billing, Manage billing. Nothing was charged.", "此工作区已开通门店方案。请在“设置 > 账单 > 管理账单”中更改。未收取任何费用。");
      const all = await stores(ws);
      const qty = planQuantity(all.length);
      if (Number(body.shown_stores) !== qty) return fail(409, "price_changed", "The number of stores changed since it was shown. Look at the price again. Nothing was charged.", "门店数量已与显示时不同，请重新查看价格。未收取任何费用。");
      // yearly ($149 a store a month, billed yearly) or month to month ($179, cancel anytime); each from its own approved price
      const interval = planIntervalOf(body.interval);
      if (!interval) return fail(400, "bad_interval", "Choose yearly or monthly.", "请选择按年或按月。");
      const chain = await simplePrice(interval === "month" ? "planMonthly" : "plan");
      if (!chain) {
        await teamQuote(ws, `Quote the store plan, ${interval === "month" ? "monthly" : "yearly"}, for ${qty} store${qty === 1 ? "" : "s"}`, { stores: qty, interval, by: user.id }, `quote:${ws}:plan:${interval}:${qty}`);
        return fail(409, "quoted", "The team sends you a quote for the store plan. Nothing was charged.", "团队会就门店方案向您报价。未收取任何费用。");
      }
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const p = planCheckoutParams({ ws, back, price: chain, qty, interval, consentAt: new Date().toISOString() });
      if (customer) p.customer = customer; else if (user.email) p.customer_email = user.email;
      const s = await stripe("checkout/sessions", p);
      await admin.from("billing").update({ checkout_store_ids: all.map((x) => x.id) }).eq("workspace_id", ws);
      return json(200, { ok: true, url: s.url, stores: qty });
    }

    // Back from Checkout (?session_id=): apply what Stripe says now, so the plan or the payment shows at once even if
    // the webhook is late or missing. The same database writes as the webhook, so applying both is harmless.
    if (body.action === "confirm") {
      const sid = typeof body.session_id === "string" && /^cs_[A-Za-z0-9_]{8,200}$/.test(body.session_id) ? body.session_id : null;
      if (!sid) return fail(400, "bad_request", "Unknown checkout.");
      const cs = await stripeGet(`checkout/sessions/${encodeURIComponent(sid)}?expand[]=subscription`);
      if (cs?.metadata?.workspace_id !== ws) return fail(404, "not_found", "That checkout isn't for this workspace.");
      if (cs.status !== "complete") return json(200, { ok: true, applied: false, status: cs.status ?? null });
      const db = stripeDb(admin);
      const sub = cs.subscription && typeof cs.subscription === "object" ? cs.subscription : null;
      // the customer and any one-time payment first; then the subscription as it is this second
      await applyCheckoutSession(db, { ...cs, subscription: sub?.id ?? cs.subscription });
      if (sub) await applySubscription(db, sub, "customer.subscription.updated", new Date().toISOString(), env);
      return json(200, { ok: true, applied: true });
    }

    // The old plans are retired: nothing from before the simple model is offered or charged any more, to anyone.
    if (body.action === "checkout") {
      return fail(409, "plan_retired", "That plan isn't offered any more. Choose the store plan, or email support@placetta.com. Nothing was charged.", "该方案已不再提供。请选择门店方案，或发邮件至 support@placetta.com。未收取任何费用。");
    }
    if (model === "simple" && (body.action === "module_quote" || body.action === "add_module" || body.action === "filing_charge")) {
      return fail(409, "new_pricing", "Placetta now prices per license: each one shows its price before you approve it.", "快哉现按执照计价：每一项在您批准前都会显示价格。");
    }

    if (body.action === "portal") {
      if (!customer) return fail(409, "no_customer", "There's no billing account yet.");
      const s = await stripe("billing_portal/sessions", { customer, return_url: back });
      return json(200, { ok: true, url: s.url });
    }

    if (body.action === "sync_locations") {
      // Keep the subscription's store count in step with the workspace (store_billing, which members can't write).
      // Prorated by Stripe (create_prorations): a store added mid-period is charged for the rest of the period on the
      // next invoice, and one removed is credited there; nothing is refunded to the card. No opening fees any more.
      const subId = bill?.subscription_id as string | null | undefined;
      if (!subId) return json(200, { ok: true, synced: false });
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
      if (!["active", "trialing", "past_due"].includes(sub.status)) return json(200, { ok: true, synced: false });
      const step = syncStep(sub.items?.data ?? [], (await stores(ws)).length, env);
      if (!step) return json(200, { ok: true, synced: false });
      if (step.change) await stripe(`subscription_items/${step.item}`, { quantity: String(step.qty), proration_behavior: "create_prorations" }, `sync-${subId}-${step.item}-${step.qty}-${Math.floor(Date.now() / 60_000)}`);
      return json(200, { ok: true, synced: true, stores: step.qty, changed: step.change });
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

    // An Odelia pack ($49, $25 more allowance, carried over until it's used), on top of a paid plan: the store plan, or
    // a plan from before. Charged only from the approved $49 price; its credit is added once (the webhook or confirm).
    if (body.action === "pack") {
      const { data: budget } = await admin.rpc("ai_budget", { ws });
      const plan = (budget as { plan?: string } | null)?.plan;
      if (plan !== "monthly" && plan !== "entry" && plan !== "comped") return fail(409, "plan_required", "Packs add to a plan. Pick a plan first.", "加量包需配合方案使用，请先选择方案。");
      const pack = await simplePrice("pack");
      if (!pack) {
        await teamQuote(ws, "Quote an Odelia pack", { by: user.id }, `quote:${ws}:pack`);
        return fail(409, "quoted", "Online payment for packs isn't set up yet, so the team sends a quote. Nothing was charged.", "加量包暂不能在线支付，团队会向您报价。未收取任何费用。");
      }
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const packs = Math.max(1, Math.min(10, Math.floor(Number(body.packs) || 1)));
      const p = packCheckoutParams({ ws, back, price: pack, packs, creditUsd: SIMPLE_PACK_CREDIT_USD });
      if (customer) p.customer = customer; else if (user.email) p.customer_email = user.email;
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
