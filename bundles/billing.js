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

// supabase/functions/billing/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);

// supabase/functions/_shared/stripe_catalog.ts
var CATALOG = {
  entry: { env: "STRIPE_PRICE_ENTRY", lookup: "placetta_entry", name: "Placetta entry plan", description: "Every license, permit and registration for one market, in order, with timelines and agency fees.", cents: 29900 },
  essentials: { env: "STRIPE_PRICE_LOCATION", lookup: "placetta_essentials_year", name: "Placetta Essentials", description: "Per location, billed yearly: every license tracked and renewals filed, with Odelia.", cents: 178800, year: true },
  pro: { env: "STRIPE_PRICE_LOCATION_PRO", lookup: "placetta_pro_year", name: "Placetta Pro", description: "Per location, billed yearly: Essentials plus daily logs, mock inspections and twice the Odelia allowance.", cents: 358800, year: true },
  retail: { env: "STRIPE_PRICE_OPENING", lookup: "placetta_opening_retail", name: "Store opening, retail", description: "Every permit for a new retail store, filed and tracked to approval.", cents: 35e4 },
  food: { env: "STRIPE_PRICE_OPENING_FOOD", lookup: "placetta_opening_food", name: "Store opening, restaurant or food", description: "Every permit for a new restaurant or food store, filed and tracked to approval.", cents: 65e4 },
  guarantee: { env: "STRIPE_PRICE_GUARANTEE", lookup: "placetta_guarantee", name: "Open-by-date guarantee", description: "If a permit Placetta files makes the store open late, the opening fee is refunded.", cents: 25e4 },
  pack: { env: "STRIPE_PRICE_PACK", lookup: "placetta_odelia_pack", name: "Odelia pack", description: "$25 more Odelia allowance, carried over until it's used.", cents: 4900 }
};
var WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
var VERSION = "2025-03-31.basil";
function client(env2, f = fetch) {
  const key = () => env2("STRIPE_SECRET_KEY") ?? "";
  const headers = (extra = {}) => ({ Authorization: `Bearer ${key()}`, "Stripe-Version": VERSION, ...extra });
  async function get(path) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
    return d;
  }
  async function post(path, params, idem) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: headers({ "Content-Type": "application/x-www-form-urlencoded", ...idem ? { "Idempotency-Key": idem } : {} }), body: new URLSearchParams(params) });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
    return d;
  }
  async function del(path) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "DELETE", headers: headers() });
    if (!r.ok) throw new Error((await r.json())?.error?.message ?? "Stripe error");
  }
  return { get, post, del };
}
var memo = /* @__PURE__ */ new Map();
async function priceId(item, env2, f = fetch) {
  const d = CATALOG[item];
  const set = env2(d.env);
  if (set) return set;
  if (!env2("STRIPE_SECRET_KEY")) return void 0;
  const hit = memo.get(d.lookup);
  if (hit) return hit;
  const s = client(env2, f);
  const found = await s.get(`prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(d.lookup)}`);
  let id = found?.data?.[0]?.id;
  if (!id) {
    const p = {
      currency: "usd",
      unit_amount: String(d.cents),
      lookup_key: d.lookup,
      "product_data[name]": d.name,
      "product_data[metadata][placetta]": item,
      "metadata[placetta]": item
    };
    if (d.year) p["recurring[interval]"] = "year";
    id = (await s.post("prices", p, `placetta-catalog-${d.lookup}-${d.cents}`)).id;
  }
  memo.set(d.lookup, id);
  return id;
}
async function ensureWebhook(env2, store, url, f = fetch) {
  if (env2("STRIPE_WEBHOOK_SECRET")) return "env";
  if (await store.get("webhook_secret")) return "stored";
  const s = client(env2, f);
  const list = await s.get("webhook_endpoints?limit=100");
  const ours = (list?.data ?? []).filter((e) => e.url === url);
  if (ours.some((e) => e.metadata?.placetta !== "1")) return "manual";
  for (const e of ours) await s.del(`webhook_endpoints/${e.id}`);
  const p = { url, "metadata[placetta]": "1", api_version: VERSION, description: "Placetta billing" };
  WEBHOOK_EVENTS.forEach((ev, i) => p[`enabled_events[${i}]`] = ev);
  const made = await s.post("webhook_endpoints", p, `placetta-webhook-${url}-${ours.map((e) => e.id).join(",")}`);
  if (!made?.secret) throw new Error("Stripe made the webhook without a signing secret.");
  await store.set("webhook_secret", made.secret);
  await store.set("webhook_endpoint", made.id);
  return "created";
}

// supabase/functions/billing/index.ts
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
var origins = () => [...(Deno.env.get("APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean), "https://placetta.vercel.app"];
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
  const ids = await Promise.all(["essentials", "pro", "retail", "food", "guarantee", "pack", "entry"].map(price));
  const [location, pro, opening, opening_food, guarantee, pack, entry] = await Promise.all(ids.map(one));
  return { location, pro, opening, opening_food, guarantee, pack, entry };
}
var FOOD = /tea|coffee|caf[eé]|restaurant|food|kitchen|bakery|hot ?pot|noodle|dessert|ice cream|boba|bubble|juice|bar\b|grill|pizza|sushi|dumpling|奶茶|茶|咖啡|餐|火锅|面|甜品|烘焙|食/i;
async function stores(ws) {
  const { data } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
  const st = data?.state;
  const sells = [st?.business?.en ?? "", ...(st?.facts ?? []).filter((f) => /what you sell|business type|cuisine|menu/i.test(f.label?.en ?? "")).map((f) => f.value?.en ?? "")].join(" ");
  const fallback = FOOD.test(sells) ? "food" : "retail";
  const list = st?.stores;
  return Array.isArray(list) ? list.filter((s) => typeof s?.id === "string").slice(0, 2e3).map((s) => ({
    id: s.id,
    name: String(s.name?.en ?? s.id),
    opening: s.stage === "opening",
    kind: s.kind === "retail" || s.kind === "food" || s.kind === "complex" ? s.kind : fallback
  })) : [];
}
var env = (k) => Deno.env.get(k);
var price = (i) => priceId(i, env);
async function openingItems(list, guarantee) {
  const n = (k) => list.filter((s) => s.opening && s.kind === k).length;
  const retail = n("retail"), food = n("food");
  const items = [];
  if (retail) items.push([await price("retail"), retail]);
  if (food) items.push([await price("food"), food]);
  if (guarantee && retail + food) items.push([await price("guarantee"), retail + food]);
  return items;
}
var config = {
  async get(key) {
    const { data } = await admin.from("stripe_config").select("value").eq("key", key).maybeSingle();
    return data?.value ?? void 0;
  },
  async set(key, value) {
    const { error } = await admin.from("stripe_config").upsert({ key, value, updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (error) throw new Error(error.message);
  }
};
async function webhookReady() {
  const how = await ensureWebhook(env, config, `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`);
  if (how === "manual") return fail(503, "not_configured", "A Stripe webhook to Placetta was made by hand. Set STRIPE_WEBHOOK_SECRET to its signing secret.");
  return null;
}
async function askForQuote(ws, list) {
  const rows = list.filter((s) => s.opening && s.kind === "complex").map((s) => ({ kind: "quote", workspace_id: ws, title: `Quote the opening for ${s.name}`, detail: { store_id: s.id }, dedupe: `quote:${ws}:${s.id}` }));
  if (rows.length) await admin.from("team_tasks").upsert(rows, { onConflict: "dedupe", ignoreDuplicates: true });
  return rows.length;
}
async function yearOfLocation(loc) {
  const p = await stripeGet(`prices/${encodeURIComponent(loc)}`);
  const n = Math.max(1, Number(p.recurring?.interval_count) || 1);
  const per = { day: 365, week: 52, month: 12, year: 1 }[String(p.recurring?.interval)] ?? 1;
  return { cents: Math.round((p.unit_amount ?? 0) * per / n), currency: String(p.currency ?? "usd") };
}
async function entryCents() {
  const id = await price("entry");
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
  const { data: bill } = await admin.from("billing").select("stripe_customer_id, subscription_id, charged_store_ids, entry_markets, entry_paid_at, entry_credited_at").eq("workspace_id", ws).maybeSingle();
  const customer = bill?.stripe_customer_id;
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
      const p = {
        mode: "subscription",
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=canceled`,
        client_reference_id: ws,
        "metadata[workspace_id]": ws,
        "metadata[plan]": "locations",
        "metadata[tier]": tier,
        "metadata[guarantee]": guarantee ? "1" : "0",
        "subscription_data[metadata][workspace_id]": ws,
        "subscription_data[metadata][plan]": "locations",
        "subscription_data[metadata][tier]": tier,
        "subscription_data[metadata][guarantee]": guarantee ? "1" : "0",
        "line_items[0][price]": loc,
        "line_items[0][quantity]": String(Math.max(1, all.length))
      };
      (await openingItems(all, guarantee)).forEach(([price2, qty], i) => {
        p[`line_items[${i + 1}][price]`] = price2;
        p[`line_items[${i + 1}][quantity]`] = String(qty);
      });
      const quoted = await askForQuote(ws, all);
      const year = await yearOfLocation(loc);
      const fresh = bill?.entry_paid_at && Date.now() - Date.parse(String(bill.entry_paid_at)) <= 60 * 864e5;
      const entry = bill?.entry_credited_at || !fresh ? 0 : (Number(bill?.entry_markets) || 0) * await entryCents();
      const credit = entry;
      if (credit > 0) {
        const c = await stripe("coupons", { amount_off: String(credit), currency: year.currency, duration: "once", max_redemptions: "1", name: "Entry plan credit", "metadata[workspace_id]": ws });
        p["discounts[0][coupon]"] = c.id;
        p["metadata[entry_credit]"] = String(entry);
      } else p.allow_promotion_codes = "true";
      if (customer) p.customer = customer;
      else if (user.email) p.customer_email = user.email;
      const sess = await stripe("checkout/sessions", p);
      await admin.from("billing").update({ checkout_store_ids: all.map((s) => s.id) }).eq("workspace_id", ws);
      return json(200, { ok: true, url: sess.url, ...quoted ? { quoted } : {} });
    }
    if (body.action === "sync_locations") {
      const subId = bill?.subscription_id;
      if (!subId) return json(200, { ok: true, synced: false });
      const sub = await stripeGet(`subscriptions/${encodeURIComponent(subId)}`);
      if (sub?.metadata?.plan !== "locations" || !["active", "trialing", "past_due"].includes(sub.status)) return json(200, { ok: true, synced: false });
      const locs = (await Promise.all([price("essentials"), price("pro")])).filter(Boolean);
      const item = (sub.items?.data ?? []).find((i) => locs.includes(i.price?.id));
      const all = await stores(ws);
      if (item && item.quantity !== Math.max(1, all.length)) await stripe(`subscription_items/${item.id}`, { quantity: String(Math.max(1, all.length)), proration_behavior: "create_prorations" });
      const charged = new Set(bill?.charged_store_ids ?? []);
      const fresh = all.filter((s) => !charged.has(s.id));
      const openings = fresh.filter((s) => s.opening && s.kind !== "complex").length;
      if (sub.customer) for (const [id, qty] of await openingItems(fresh, sub.metadata?.guarantee === "1"))
        await stripe("invoiceitems", { customer: String(sub.customer), "pricing[price]": id, quantity: String(qty), subscription: subId, "metadata[workspace_id]": ws });
      await askForQuote(ws, fresh);
      if (fresh.length) await admin.from("billing").update({ charged_store_ids: [...charged, ...fresh.map((s) => s.id)] }).eq("workspace_id", ws);
      return json(200, { ok: true, synced: true, stores: all.length, new_openings: openings });
    }
    if (body.action === "pack") {
      const pack = await price("pack");
      if (!pack) return fail(503, "not_configured", "Set STRIPE_SECRET_KEY for Odelia packs.");
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const { data: budget } = await admin.rpc("ai_budget", { ws });
      const plan = budget?.plan;
      if (plan !== "monthly" && plan !== "entry" && plan !== "comped") return fail(409, "plan_required", "Packs add to a plan. Pick a plan first.");
      const packs = Math.max(1, Math.min(10, Math.floor(Number(body.packs) || 1)));
      const credit = Math.max(1, Number(Deno.env.get("PACK_CREDIT_USD") ?? "25"));
      const p = {
        mode: "payment",
        "line_items[0][price]": pack,
        "line_items[0][quantity]": String(packs),
        success_url: `${back}?billing=success`,
        cancel_url: `${back}?billing=cancel`,
        client_reference_id: ws,
        "metadata[workspace_id]": ws,
        "metadata[kind]": "pack",
        "metadata[packs]": String(packs),
        "metadata[credit_usd]": String(credit * packs)
      };
      if (customer) p.customer = customer;
      else if (user.email) p.customer_email = user.email;
      const s = await stripe("checkout/sessions", p);
      return json(200, { ok: true, url: s.url });
    }
    if (body.action === "checkout") {
      const plan = String(body.plan ?? "");
      const chosen = plan === "entry" ? await price("entry") : { starter: Deno.env.get("STRIPE_PRICE_STARTER"), growth: Deno.env.get("STRIPE_PRICE_GROWTH") }[plan];
      if (!chosen) return fail(plan === "entry" || plan === "starter" || plan === "growth" ? 503 : 400, plan ? "not_configured" : "bad_request", `Set the Stripe price for the ${plan || "chosen"} plan.`);
      const notReady = await webhookReady();
      if (notReady) return notReady;
      const markets = Math.max(1, Math.min(20, Math.floor(Number(body.markets) || 1)));
      const extra = Math.max(0, Math.min(500, Math.floor(Number(body.extra_locations) || 0)));
      const p = {
        mode: plan === "entry" ? "payment" : "subscription",
        "line_items[0][price]": chosen,
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
