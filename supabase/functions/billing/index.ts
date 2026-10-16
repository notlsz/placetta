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
import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureWebhook, priceId, type Item } from "../_shared/stripe_catalog.ts";
import { openingCounts, returnOrigins, safeReturn, type Store, storesFrom, STRIPE_FAILED } from "./logic.ts";

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

/** The session's assurance level from its JWT (verified by getUser above): "aal2" after two-step sign-in. */
function aalOf(jwt: string): string {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch { return "aal1"; }
}

/** owner, member, staff (with two-step), mfa_required, staff_mfa_required or none. Same rules as the database. */
async function accessFor(ws: string, user: { id: string; email?: string; email_confirmed_at?: string }, jwt: string): Promise<string> {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
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

async function stripe(path: string, params: Record<string, string>) {
  const key = Deno.env.get("STRIPE_SECRET_KEY")!;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_VERSION },
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
  return { location, pro, opening, opening_food, guarantee, pack, entry };
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
  const ws = String(body.workspace_id ?? "");
  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (body.action === "prices") {
    if (access !== "owner" && access !== "member") return fail(403, "forbidden", "This isn't your workspace.");
    try { return json(200, { ok: true, ...(await locationPrices()) }); } catch (e) {
      console.error("prices:", (e as Error).message.slice(0, 200));
      return fail(502, "upstream_error", STRIPE_FAILED.en, STRIPE_FAILED.zh);
    }
  }
  if (access === "member") return fail(403, "forbidden", "Only an owner can change the plan or billing.");
  if (access !== "owner") return fail(403, "forbidden", "This isn't your workspace.");
  const back = safeReturn(body.return_url, returnOrigins((k) => Deno.env.get(k)));
  if (!back) return fail(400, "bad_request", "Unknown return address. Add the app's origin to APP_ORIGINS.");

  const { data: bill } = await admin.from("billing").select("stripe_customer_id, subscription_id, charged_store_ids, entry_markets, entry_paid_at, entry_credited_at").eq("workspace_id", ws).maybeSingle();
  const customer = bill?.stripe_customer_id as string | null | undefined;

  try {
    if (body.action === "portal") {
      if (!customer) return fail(409, "no_customer", "There's no billing account yet.");
      const s = await stripe("billing_portal/sessions", { customer, return_url: back });
      return json(200, { ok: true, url: s.url });
    }

    if (body.action === "checkout" && body.plan === "locations") {
      const tier = body.tier === "pro" ? "pro" : "essentials", guarantee = body.guarantee === true;
      const loc = await price(tier);
      if (!loc) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY for per-location billing.");
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const all = await stores(ws);
      const p: Record<string, string> = {
        mode: "subscription", success_url: `${back}?billing=success`, cancel_url: `${back}?billing=canceled`,
        client_reference_id: ws, "metadata[workspace_id]": ws, "metadata[plan]": "locations", "metadata[tier]": tier, "metadata[guarantee]": guarantee ? "1" : "0",
        "subscription_data[metadata][workspace_id]": ws, "subscription_data[metadata][plan]": "locations", "subscription_data[metadata][tier]": tier, "subscription_data[metadata][guarantee]": guarantee ? "1" : "0",
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
      const locs = (await Promise.all([price("essentials"), price("pro")])).filter(Boolean);
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
