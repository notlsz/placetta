var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// ../../../../../../home/claude/placetta-agent/supabase/functions/billing/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
var json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
var fail = (status, code, message) => json(status, { error: { code, message } });
var admin = (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false }
});
function aalOf(jwt) {
  try {
    const part = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=")));
    return typeof claims.aal === "string" ? claims.aal : "aal1";
  } catch {
    return "aal1";
  }
}
async function accessFor(ws, user, jwt) {
  const { data, error } = await admin.rpc("access_for", { ws, uid: user.id, p_aal: aalOf(jwt) });
  if (!error) return String(data);
  if (error.code !== "PGRST202") return "none";
  const { data: m } = await admin.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle();
  if (m) return m.role === "owner" ? "owner" : "member";
  if (!user.email_confirmed_at) return "none";
  const { data: s } = await admin.from("staff_emails").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle();
  return s ? "staff" : "none";
}
var origins = () => (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function safeReturn(url) {
  try {
    const u = new URL(String(url));
    const ok = origins().some((o) => {
      try {
        return new URL(o).origin === u.origin;
      } catch {
        return false;
      }
    }) || u.hostname === "localhost";
    return ok ? `${u.origin}${u.pathname}` : null;
  } catch {
    return null;
  }
}
var STRIPE_VERSION = "2025-03-31.basil";
async function stripe(path, params) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": STRIPE_VERSION },
    body: new URLSearchParams(params)
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("stripe", path, res.status, data?.error?.message);
    throw new Error(data?.error?.message ?? "Stripe error");
  }
  return data;
}
async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, "Stripe-Version": STRIPE_VERSION } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? "Stripe error");
  return data;
}
async function locationPrices() {
  const one = async (id) => {
    if (!id) return null;
    const p = await stripeGet(`prices/${encodeURIComponent(id)}`);
    return { amount: (p.unit_amount ?? 0) / 100, currency: String(p.currency ?? "usd").toUpperCase(), interval: p.recurring?.interval ?? null, interval_count: p.recurring?.interval_count ?? null };
  };
  const [location, opening] = await Promise.all([one(Deno.env.get("STRIPE_PRICE_LOCATION")), one(Deno.env.get("STRIPE_PRICE_OPENING"))]);
  return { location, opening };
}
async function stores(ws) {
  const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
  const list = data?.state?.stores;
  return Array.isArray(list) ? list.filter((s) => typeof s?.id === "string").slice(0, 2e3).map((s) => ({ id: s.id, opening: s.stage === "opening" })) : [];
}
async function yearOfLocation(loc) {
  const p = await stripeGet(`prices/${encodeURIComponent(loc)}`);
  const n = Math.max(1, Number(p.recurring?.interval_count) || 1);
  const per = { day: 365, week: 52, month: 12, year: 1 }[String(p.recurring?.interval)] ?? 1;
  return { cents: Math.round((p.unit_amount ?? 0) * per / n), currency: String(p.currency ?? "usd") };
}
async function entryCents() {
  const id = Deno.env.get("STRIPE_PRICE_ENTRY");
  if (!id) return 0;
  try {
    return Number((await stripeGet(`prices/${encodeURIComponent(id)}`)).unit_amount) || 0;
  } catch {
    return 0;
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
  let body;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_request", "Send JSON.");
  }
  const ws = String(body.workspace_id ?? "");
  const access = await accessFor(ws, user, jwt);
  if (access === "mfa_required") return fail(401, "mfa_required", "Finish two-step sign-in to continue.");
  if (body.action === "prices") {
    if (access !== "owner" && access !== "member") return fail(403, "forbidden", "This isn't your workspace.");
    try {
      return json(200, { ok: true, ...await locationPrices() });
    } catch (e) {
      return fail(502, "upstream_error", e.message.slice(0, 200));
    }
  }
  if (access === "member") return fail(403, "forbidden", "Only an owner can change the plan or billing.");
  if (access !== "owner") return fail(403, "forbidden", "This isn't your workspace.");
  const back = safeReturn(body.return_url);
  if (!back) return fail(400, "bad_request", "Unknown return address. Add the app's origin to APP_ORIGINS.");
  const { data: bill } = await admin.from("billing").select("stripe_customer_id, subscription_id, charged_store_ids, entry_markets, entry_credited_at").eq("workspace_id", ws).maybeSingle();
  const customer = bill?.stripe_customer_id;
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
      const p = {
        mode: "subscription",
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=canceled`,
        client_reference_id: ws,
        "metadata[workspace_id]": ws,
        "metadata[plan]": "locations",
        "subscription_data[metadata][workspace_id]": ws,
        "subscription_data[metadata][plan]": "locations",
        "line_items[0][price]": loc,
        "line_items[0][quantity]": String(Math.max(1, all.length))
      };
      if (opening && openings) {
        p["line_items[1][price]"] = opening;
        p["line_items[1][quantity]"] = String(openings);
      }
      const year = await yearOfLocation(loc);
      const entry = bill?.entry_credited_at ? 0 : (Number(bill?.entry_markets) || 0) * await entryCents();
      const openingCredit = opening && openings ? Math.min(year.cents, Number((await stripeGet(`prices/${encodeURIComponent(opening)}`)).unit_amount) || 0) * openings : 0;
      const credit = entry + openingCredit;
      if (credit > 0) {
        const c = await stripe("coupons", { amount_off: String(credit), currency: year.currency, duration: "once", max_redemptions: "1", name: "Entry plan and opening credits", "metadata[workspace_id]": ws });
        p["discounts[0][coupon]"] = c.id;
        p["metadata[entry_credit]"] = String(entry);
      } else p.allow_promotion_codes = "true";
      if (customer) p.customer = customer;
      else if (user.email) p.customer_email = user.email;
      const sess = await stripe("checkout/sessions", p);
      await admin.from("billing").update({ checkout_store_ids: all.map((s) => s.id) }).eq("workspace_id", ws);
      return json(200, { ok: true, url: sess.url });
    }
    if (body.action === "sync_locations") {
      const subId = bill?.subscription_id;
      const loc = Deno.env.get("STRIPE_PRICE_LOCATION"), opening = Deno.env.get("STRIPE_PRICE_OPENING");
      if (!subId || !loc) return json(200, { ok: true, synced: false });
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
      if (sub?.metadata?.plan !== "locations" || !["active", "trialing", "past_due"].includes(sub.status)) return json(200, { ok: true, synced: false });
      const item = (sub.items?.data ?? []).find((i) => i.price?.id === loc);
      const all = await stores(ws);
      if (item && item.quantity !== Math.max(1, all.length)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, all.length)), proration_behavior: "create_prorations" });
      const charged = new Set(bill?.charged_store_ids ?? []);
      const fresh = all.filter((s) => !charged.has(s.id));
      const openings = fresh.filter((s) => s.opening).length;
      if (opening && openings && sub.customer) {
        await stripe("invoiceitems", { customer: String(sub.customer), "pricing[price]": opening, quantity: String(openings), subscription: subId, "metadata[workspace_id]": ws });
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
      const price = { entry: Deno.env.get("STRIPE_PRICE_ENTRY"), starter: Deno.env.get("STRIPE_PRICE_STARTER"), growth: Deno.env.get("STRIPE_PRICE_GROWTH") }[plan];
      if (!price) return fail(plan === "entry" || plan === "starter" || plan === "growth" ? 503 : 400, plan ? "not_configured" : "bad_request", `Set the Stripe price for the ${plan || "chosen"} plan.`);
      const markets = Math.max(1, Math.min(20, Math.floor(Number(body.markets) || 1)));
      const extra = Math.max(0, Math.min(500, Math.floor(Number(body.extra_locations) || 0)));
      const p = {
        mode: plan === "entry" ? "payment" : "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": plan === "entry" ? String(markets) : "1",
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=cancel`,
        client_reference_id: ws,
        "metadata[workspace_id]": ws,
        "metadata[plan]": plan,
        "metadata[markets]": String(markets),
        allow_promotion_codes: "true"
      };
      if (plan !== "entry") {
        p["subscription_data[metadata][workspace_id]"] = ws;
        p["subscription_data[metadata][plan]"] = plan;
        const extraPrice = Deno.env.get("STRIPE_PRICE_EXTRA_LOCATION");
        if (extra && extraPrice) {
          p["line_items[1][price]"] = extraPrice;
          p["line_items[1][quantity]"] = String(extra);
        }
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
    return fail(502, "upstream_error", e.message.slice(0, 200));
  }
  return fail(400, "bad_request", "Unknown action.");
});
