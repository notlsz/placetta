// Stripe Checkout and the billing portal. Prices live in Stripe; their ids come from the Edge Function secrets:
//   STRIPE_PRICE_ENTRY    one-time $299, quantity = markets
//   STRIPE_PRICE_LOCATION $149 a location a month, billed yearly (the "Per location" plan; quantity = stores, open or opening)
//   STRIPE_PRICE_OPENING  one time $3,500 per store still opening (at checkout, then on the next invoice as stores are added)
//   STRIPE_PRICE_STARTER / _GROWTH / _EXTRA_LOCATION  older plans, kept only for anyone already on them
// Credits: unspent entry plans come off the first invoice, and each opening fee is credited against that store's first year.
// Scale is quoted by the team, so it has no checkout. Actions: prices (any member), checkout, portal, sync_locations (owners).
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

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


const origins = () => (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function safeReturn(url: unknown): string | null {
  try {
    const u = new URL(String(url));
    const ok = origins().some((o) => { try { return new URL(o).origin === u.origin; } catch { return false; } }) || u.hostname === "localhost";
    return ok ? `${u.origin}${u.pathname}` : null;
  } catch { return null; }
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
  if (!res.ok) { console.error("stripe", path, res.status, data?.error?.message); throw new Error(data?.error?.message ?? "Stripe error"); }
  return data;
}

async function stripeGet(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Stripe-Version": STRIPE_VERSION } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Stripe error");
  return data;
}

/** The per-location prices as Stripe has them, so the app never shows a number Stripe doesn't charge. */
async function locationPrices() {
  const one = async (id: string | undefined) => {
    if (!id) return null;
    const p = await stripeGet(`prices/${encodeURIComponent(id)}`);
    return { amount: (p.unit_amount ?? 0) / 100, currency: String(p.currency ?? "usd").toUpperCase(), interval: p.recurring?.interval ?? null, interval_count: p.recurring?.interval_count ?? null };
  };
  const [location, opening] = await Promise.all([one(Deno.env.get("STRIPE_PRICE_LOCATION")), one(Deno.env.get("STRIPE_PRICE_OPENING"))]);
  return { location, opening };
}

/** The workspace's stores (open and opening), from its saved state. Only a store whose stage is "opening" owes the opening fee. */
async function stores(ws: string): Promise<{ id: string; opening: boolean }[]> {
  const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
  const list = (data?.state as { stores?: { id?: unknown; stage?: unknown }[] } | null)?.stores;
  return Array.isArray(list)
    ? list.filter((s) => typeof s?.id === "string").slice(0, 2000).map((s) => ({ id: s.id as string, opening: s.stage === "opening" }))
    : [];
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
  const id = Deno.env.get("STRIPE_PRICE_ENTRY");
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
    try { return json(200, { ok: true, ...(await locationPrices()) }); } catch (e) { return fail(502, "upstream_error", (e as Error).message.slice(0, 200)); }
  }
  if (access === "member") return fail(403, "forbidden", "Only an owner can change the plan or billing.");
  if (access !== "owner") return fail(403, "forbidden", "This isn't your workspace.");
  const back = safeReturn(body.return_url);
  if (!back) return fail(400, "bad_request", "Unknown return address. Add the app's origin to APP_ORIGINS.");

  const { data: bill } = await admin.from("billing").select("stripe_customer_id, subscription_id, charged_store_ids, entry_markets, entry_credited_at").eq("workspace_id", ws).maybeSingle();
  const customer = bill?.stripe_customer_id as string | null | undefined;

  try {
    if (body.action === "portal") {
      if (!customer) return fail(409, "no_customer", "There's no billing account yet.");
      const s = await stripe("billing_portal/sessions", { customer, return_url: back });
      return json(200, { ok: true, url: s.url });
    }

    if (body.action === "checkout" && body.plan === "locations") {
      const loc = Deno.env.get("STRIPE_PRICE_LOCATION"), opening = Deno.env.get("STRIPE_PRICE_OPENING");
      if (!loc) return fail(503, "not_configured", "Set STRIPE_PRICE_LOCATION for per-location billing.");
      const all = await stores(ws);
      const openings = all.filter((s) => s.opening).length;
      const p: Record<string, string> = {
        mode: "subscription", success_url: `${back}?billing=success`, cancel_url: `${back}?billing=canceled`,
        client_reference_id: ws, "metadata[workspace_id]": ws, "metadata[plan]": "locations",
        "subscription_data[metadata][workspace_id]": ws, "subscription_data[metadata][plan]": "locations",
        "line_items[0][price]": loc, "line_items[0][quantity]": String(Math.max(1, all.length)),
      };
      // Stores already open pay no opening fee; each store still opening pays it once.
      if (opening && openings) { p["line_items[1][price]"] = opening; p["line_items[1][quantity]"] = String(openings); }
      // Credits the site promises: the $299 entry plans toward the first year, and each opening fee against that store's first year.
      const year = await yearOfLocation(loc);
      const entry = bill?.entry_credited_at ? 0 : (Number(bill?.entry_markets) || 0) * (await entryCents());
      const openingCredit = opening && openings ? Math.min(year.cents, Number((await stripeGet(`prices/${encodeURIComponent(opening)}`)).unit_amount) || 0) * openings : 0;
      const credit = entry + openingCredit;
      if (credit > 0) {
        const c = await stripe("coupons", { amount_off: String(credit), currency: year.currency, duration: "once", max_redemptions: "1", name: "Entry plan and opening credits", "metadata[workspace_id]": ws });
        p["discounts[0][coupon]"] = c.id;
        p["metadata[entry_credit]"] = String(entry);
      } else p.allow_promotion_codes = "true";
      if (customer) p.customer = customer; else if (user.email) p.customer_email = user.email;
      const sess = await stripe("checkout/sessions", p);
      return json(200, { ok: true, url: sess.url });   // the webhook records which stores were counted, once it's paid
    }

    if (body.action === "sync_locations") {
      // Keep the subscription's store count in step with the workspace, and add the opening fee for new stores.
      const subId = bill?.subscription_id as string | null | undefined;
      const loc = Deno.env.get("STRIPE_PRICE_LOCATION"), opening = Deno.env.get("STRIPE_PRICE_OPENING");
      if (!subId || !loc) return json(200, { ok: true, synced: false });
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
      if (sub?.metadata?.plan !== "locations" || !["active", "trialing", "past_due"].includes(sub.status)) return json(200, { ok: true, synced: false });
      const item = (sub.items?.data ?? []).find((i: { price?: { id?: string } }) => i.price?.id === loc);
      const all = await stores(ws);
      if (item && item.quantity !== Math.max(1, all.length)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, all.length)), proration_behavior: "create_prorations" });
      const charged = new Set<string>((bill?.charged_store_ids as string[] | null) ?? []);
      const fresh = all.filter((s) => !charged.has(s.id));
      const openings = fresh.filter((s) => s.opening).length;
      if (opening && openings && sub.customer) {
        await stripe("invoiceitems", { customer: String(sub.customer), "pricing[price]": opening, quantity: String(openings), subscription: subId, "metadata[workspace_id]": ws });
        // Each opening fee is credited against that store's yearly plan.
        const year = await yearOfLocation(loc);
        const fee = Number((await stripeGet(`prices/${encodeURIComponent(opening)}`)).unit_amount) || 0;
        const credit = Math.min(year.cents, fee) * openings;
        if (credit > 0) await stripe("invoiceitems", { customer: String(sub.customer), amount: String(-credit), currency: year.currency, description: `Opening fee credited against the yearly plan (${openings} store${openings === 1 ? "" : "s"})`, subscription: subId, "metadata[workspace_id]": ws });
      }
      if (fresh.length) await admin.from("billing").update({ charged_store_ids: [...charged, ...fresh.map((s) => s.id)] }).eq("workspace_id", ws);
      return json(200, { ok: true, synced: true, stores: all.length, new_openings: openings });
    }

    if (body.action === "checkout") {
      const plan = String(body.plan ?? "");
      const price = { entry: Deno.env.get("STRIPE_PRICE_ENTRY"), starter: Deno.env.get("STRIPE_PRICE_STARTER"), growth: Deno.env.get("STRIPE_PRICE_GROWTH") }[plan as "entry"];
      if (!price) return fail(plan === "entry" || plan === "starter" || plan === "growth" ? 503 : 400, plan ? "not_configured" : "bad_request", `Set the Stripe price for the ${plan || "chosen"} plan.`);
      const markets = Math.max(1, Math.min(20, Math.floor(Number(body.markets) || 1)));
      const extra = Math.max(0, Math.min(500, Math.floor(Number(body.extra_locations) || 0)));
      const p: Record<string, string> = {
        mode: plan === "entry" ? "payment" : "subscription",
        "line_items[0][price]": price,
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
    return fail(502, "upstream_error", (e as Error).message.slice(0, 200));
  }
  return fail(400, "bad_request", "Unknown action.");
});
