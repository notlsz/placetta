// deno test supabase/functions/_shared/stripe_catalog.test.ts
import { billingHealth, CATALOG, ensureWebhook, itemOf, priceId, verifiedSimplePrice, WEBHOOK_EVENTS } from "./stripe_catalog.ts";
import { LEGACY_LOOKUPS, SIMPLE_PRICE_ENV, storePlanItemOf } from "../../../src/pricing.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

type P = { id: string; lookup_key: string; unit_amount: number; currency: string; active: boolean; recurring: { interval: string; interval_count: number } | null };
const price = (id: string, lookup_key: string, cents: number, interval: string | null = null): P =>
  ({ id, lookup_key, unit_amount: cents, currency: "usd", active: true, recurring: interval ? { interval, interval_count: 1 } : null });
/** The live account as the founder left it: the six current prices and the six legacy ones, all active. */
const LIVE: P[] = [
  price("price_m", "placetta_store_plan_month", 17900, "month"), price("price_y", "placetta_store_plan_year", 178800, "year"),
  price("price_l", "placetta_license_on_approval", 14900), price("price_l299", "placetta_license", 29900), price("price_c", "placetta_license_complex", 99900), price("price_r", "placetta_renewal", 9900),
  price("price_p", "placetta_odelia_pack", 4900),
  price("price_pro", "placetta_pro_year", 358800, "year"), price("price_ess", "placetta_essentials_year", 178800, "year"), price("price_of", "placetta_opening_food", 650000),
  price("price_or", "placetta_opening_retail", 350000), price("price_g", "placetta_guarantee", 250000), price("price_e", "placetta_entry", 29900),
];

/** A tiny Stripe: prices by lookup key and id, webhook endpoints (get, update, delete, make), idempotency replayed. */
function fakeStripe(seed: { prices?: P[]; endpoints?: { id: string; url: string; status?: string; enabled_events?: string[]; metadata?: Record<string, string> }[] } = {}) {
  const prices = [...(seed.prices ?? [])];
  const endpoints = [...(seed.endpoints ?? [])];
  const idem = new Map<string, unknown>();
  const calls: { method: string; path: string; body?: Record<string, string> }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url), path = u.pathname.replace("/v1/", ""), method = init?.method ?? "GET";
    const body = init?.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : undefined;
    calls.push({ method, path: path + u.search, body });
    const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    const missing = () => new Response(JSON.stringify({ error: { message: "No such thing" } }), { status: 404 });
    const key = (init?.headers as Record<string, string>)?.["Idempotency-Key"];
    if (key && idem.has(key)) return ok(idem.get(key));
    let out: unknown;
    if (method === "GET" && path === "prices") {
      const lk = u.searchParams.get("lookup_keys[]")!;
      return ok({ data: prices.filter((p) => p.lookup_key === lk && p.active).slice(0, 1) });
    } else if (method === "GET" && path.startsWith("prices/")) {
      const p = prices.find((x) => x.id === decodeURIComponent(path.slice(7)));
      return p ? ok(p) : missing();
    } else if (method === "POST" && path === "prices") {
      throw new Error("the code must never make a price");
    } else if (method === "GET" && path === "webhook_endpoints") {
      return ok({ data: endpoints });
    } else if (method === "GET" && path.startsWith("webhook_endpoints/")) {
      const e = endpoints.find((x) => x.id === path.split("/")[1]);
      return e ? ok(e) : missing();
    } else if (method === "DELETE") {
      endpoints.splice(endpoints.findIndex((e) => path.endsWith(e.id)), 1); return ok({ deleted: true });
    } else if (method === "POST" && path.startsWith("webhook_endpoints/")) {
      const e = endpoints.find((x) => x.id === path.split("/")[1])!;
      e.enabled_events = Object.entries(body!).filter(([k]) => k.startsWith("enabled_events")).map(([, v]) => v);
      if (body!.disabled === "false") e.status = "enabled";
      out = e;
    } else if (method === "POST" && path === "webhook_endpoints") {
      const e = { id: `we_${++n}`, url: body!.url, status: "enabled", enabled_events: Object.entries(body!).filter(([k]) => k.startsWith("enabled_events")).map(([, v]) => v), metadata: { placetta: body!["metadata[placetta]"] } };
      endpoints.push(e); out = { ...e, secret: `whsec_${n}` };
    } else return missing();
    if (key) idem.set(key, out);
    return ok(out);
  }) as typeof fetch;
  return { f, calls, prices, endpoints };
}
const envOf = (o: Record<string, string>) => (k: string) => o[k];
const memStore = () => { const m = new Map<string, string>(); return { m, get: async (k: string) => m.get(k), set: async (k: string, v: string) => void m.set(k, v) }; };
const URL_ = "https://esquxzcfsylffuijvzec.supabase.co/functions/v1/stripe-webhook";

Deno.test("a STRIPE_PRICE_* secret wins and Stripe isn't asked", async () => {
  const s = fakeStripe();
  assertEquals(await priceId("pack", envOf({ STRIPE_SECRET_KEY: "sk", STRIPE_PRICE_PACK: "price_hand" }), s.f), "price_hand");
  assertEquals(s.calls.length, 0);
});

Deno.test("no Stripe key, no price", async () => {
  assertEquals(await priceId("pack", envOf({}), fakeStripe().f), undefined);
  assertEquals(await verifiedSimplePrice("plan", envOf({}), fakeStripe().f), null);
});

Deno.test("legacy prices are ignored: never looked up, never made, even when active in Stripe", async () => {
  const s = fakeStripe({ prices: LIVE });
  const env = envOf({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_PRICE_LOCATION: "price_ess" });
  for (const k of ["entry", "essentials", "pro", "retail", "food", "guarantee"] as const) assertEquals(await priceId(k, env, s.f), undefined, k);
  assertEquals(s.calls.length, 0);
  assertEquals(Object.entries(CATALOG).filter(([, d]) => d.legacy).map(([, d]) => d.lookup).sort(), [...LEGACY_LOOKUPS].sort());
  // the current lookup keys don't overlap the legacy ones
  for (const d of Object.values(SIMPLE_PRICE_ENV)) assert(!(LEGACY_LOOKUPS as readonly string[]).includes(d.lookup), d.lookup);
});

Deno.test("the live prices are found by lookup key and checked to the cent; none is made", async () => {
  const s = fakeStripe({ prices: LIVE });
  const env = envOf({ STRIPE_SECRET_KEY: "sk_live_x" });
  assertEquals(await verifiedSimplePrice("plan", env, s.f), "price_y");
  assertEquals(await verifiedSimplePrice("planMonthly", env, s.f), "price_m");
  assertEquals(await verifiedSimplePrice("license", env, s.f), "price_l");
  assertEquals(await verifiedSimplePrice("complex", env, s.f), "price_c");
  assertEquals(await verifiedSimplePrice("renewal", env, s.f), "price_r");
  assertEquals(await verifiedSimplePrice("pack", env, s.f), "price_p");
  assertEquals(await priceId("pack", env, s.f), "price_p");
  assert(!s.calls.some((c) => c.method === "POST"));
  // a price at the wrong amount or interval is never charged (the team quotes instead)
  const off = fakeStripe({ prices: [price("price_bad", "placetta_store_plan_month", 17800, "month"), price("price_yr", "placetta_store_plan_year", 178800, "month")] });
  assertEquals(await verifiedSimplePrice("planMonthly", env, off.f), null);
  assertEquals(await verifiedSimplePrice("plan", env, off.f), null);
  // the env var still wins, and is checked the same way
  assertEquals(await verifiedSimplePrice("plan", envOf({ STRIPE_SECRET_KEY: "sk", STRIPE_PRICE_STORE_PLAN: "price_y" }), s.f), "price_y");
  assertEquals(await verifiedSimplePrice("plan", envOf({ STRIPE_SECRET_KEY: "sk", STRIPE_PRICE_STORE_PLAN: "price_m" }), s.f), null);
});

Deno.test("itemOf and storePlanItemOf know a price by its id or its lookup key", () => {
  const env = envOf({ STRIPE_PRICE_LOCATION: "price_ess", STRIPE_PRICE_STORE_PLAN: "price_env_y" });
  assertEquals(itemOf({ id: "price_ess" }, env), "essentials");
  assertEquals(itemOf({ id: "price_x", lookup_key: "placetta_pro_year" }, env), "pro");
  assertEquals(itemOf({ id: "price_y", lookup_key: null }, env), undefined);
  assertEquals(itemOf(undefined, env), undefined);
  assertEquals(storePlanItemOf({ id: "price_m", lookup_key: "placetta_store_plan_month" }, env), "planMonthly");
  assertEquals(storePlanItemOf({ id: "price_y", lookup_key: "placetta_store_plan_year" }, env), "plan");
  assertEquals(storePlanItemOf({ id: "price_env_y" }, env), "plan");
  assertEquals(storePlanItemOf({ id: "price_l", lookup_key: "placetta_license_on_approval" }, env), null);
});

Deno.test("the webhook: every event the app relies on", () => {
  assertEquals(WEBHOOK_EVENTS, ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded"]);
});

Deno.test("the webhook: env secret, made and kept, events brought up to date, made again if deleted, a lost one replaced, a hand-made one left alone", async () => {
  assertEquals(await ensureWebhook(envOf({ STRIPE_WEBHOOK_SECRET: "whsec_env" }), memStore(), URL_, fakeStripe().f), "env");

  const st = memStore(), s = fakeStripe();
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "created");
  assert(st.m.get("webhook_secret")?.startsWith("whsec_"));
  const made = s.calls.find((c) => c.method === "POST")!.body!;
  assertEquals(WEBHOOK_EVENTS.map((_, i) => made[`enabled_events[${i}]`]), WEBHOOK_EVENTS);
  assertEquals(made.url, URL_);
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "stored");
  assertEquals(s.calls.filter((c) => c.method === "POST").length, 1);

  // an endpoint made before invoice and refund events existed: updated in place, its secret kept
  s.endpoints[0].enabled_events = WEBHOOK_EVENTS.slice(0, 4);
  const secret = st.m.get("webhook_secret");
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "updated");
  assertEquals(s.endpoints[0].enabled_events, WEBHOOK_EVENTS);
  assertEquals(st.m.get("webhook_secret"), secret);
  // deleted by hand in Stripe: made again, with a new secret
  s.endpoints.splice(0, 1);
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "created");
  assert(st.m.get("webhook_secret") !== secret);

  const lost = fakeStripe({ endpoints: [{ id: "we_old", url: URL_, metadata: { placetta: "1" } }] }), st2 = memStore();
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st2, URL_, lost.f), "created");
  assertEquals(lost.endpoints.map((e) => e.id).includes("we_old"), false);
  assertEquals(lost.endpoints.length, 1);

  const hand = fakeStripe({ endpoints: [{ id: "we_hand", url: URL_ }] });
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), memStore(), URL_, hand.f), "manual");
  assertEquals(hand.endpoints.length, 1);
});

Deno.test("billing health: today's live state, then after ensure", async () => {
  // no key: one problem, nothing asked
  const none = await billingHealth(envOf({}), memStore(), URL_, { f: fakeStripe().f });
  assert(!none.ok && none.problems[0].includes("STRIPE_SECRET_KEY"));

  // the live account today: payments on, prices there, no webhook, nothing stored
  const s = fakeStripe({ prices: LIVE }), st = memStore(), env = envOf({ STRIPE_SECRET_KEY: "sk_live_x" });
  const before = await billingHealth(env, st, URL_, { f: s.f });
  assert(!before.ok);
  assertEquals(before.key, { set: true, mode: "live" });
  assert(!before.webhook.exists && !before.secret.stored);
  assert(before.prices.every((p) => p.ok), JSON.stringify(before.prices));
  assertEquals(before.legacy_active.sort(), [...LEGACY_LOOKUPS].sort());
  assert(before.tax.includes("automatic_tax"));
  assert(!s.calls.some((c) => c.method === "POST"), "a check alone writes nothing");

  // with ensure: the webhook is made with every event and its secret stored; legacy prices are reported, not a problem
  const after = await billingHealth(env, st, URL_, { f: s.f, ensure: true });
  assertEquals(after.webhook.how, "created");
  assert(after.ok, after.problems.join("; "));
  assertEquals(after.webhook.missing_events, []);
  assert(after.secret.stored);
  assertEquals(after.legacy_active.length, 6);
  assert(!s.calls.some((c) => c.method === "POST" && c.path === "prices"));

  // a price missing and one at the wrong amount are named
  const bad = fakeStripe({ prices: LIVE.filter((p) => p.lookup_key !== "placetta_renewal").map((p) => p.lookup_key === "placetta_license_on_approval" ? { ...p, unit_amount: 14800 } : p) });
  const h = await billingHealth(env, memStore(), URL_, { f: bad.f, ensure: true });
  assert(h.problems.some((p) => p.includes("placetta_renewal")) && h.problems.some((p) => p.includes("placetta_license_on_approval differs")), h.problems.join("; "));
});
