// deno test supabase/functions/_shared/stripe_catalog.test.ts
import { allPrices, CATALOG, ensureWebhook, itemOf, priceId, WEBHOOK_EVENTS } from "./stripe_catalog.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

/** A tiny Stripe: prices by lookup key, webhook endpoints, idempotency keys replayed like Stripe does. */
function fakeStripe(seed: { prices?: Record<string, string>; endpoints?: { id: string; url: string; metadata?: Record<string, string> }[] } = {}) {
  const prices = new Map(Object.entries(seed.prices ?? {}));
  const endpoints = [...(seed.endpoints ?? [])];
  const idem = new Map<string, unknown>();
  const calls: { method: string; path: string; body?: Record<string, string> }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(url), path = u.pathname.replace("/v1/", ""), method = init?.method ?? "GET";
    const body = init?.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : undefined;
    calls.push({ method, path: path + u.search, body });
    const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200 });
    const key = (init?.headers as Record<string, string>)?.["Idempotency-Key"];
    if (key && idem.has(key)) return ok(idem.get(key));
    let out: unknown;
    if (method === "GET" && path === "prices") {
      const lk = u.searchParams.get("lookup_keys[]")!;
      return ok({ data: prices.has(lk) ? [{ id: prices.get(lk), lookup_key: lk }] : [] });
    } else if (method === "POST" && path === "prices") {
      const id = `price_${++n}`; prices.set(body!.lookup_key, id); out = { id, lookup_key: body!.lookup_key };
    } else if (method === "GET" && path === "webhook_endpoints") {
      return ok({ data: endpoints });
    } else if (method === "DELETE") {
      endpoints.splice(endpoints.findIndex((e) => path.endsWith(e.id)), 1); return ok({ deleted: true });
    } else if (method === "POST" && path === "webhook_endpoints") {
      const e = { id: `we_${++n}`, url: body!.url, metadata: { placetta: body!["metadata[placetta]"] } };
      endpoints.push(e); out = { ...e, secret: `whsec_${n}` };
    } else return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 404 });
    if (key) idem.set(key, out);
    return ok(out);
  }) as typeof fetch;
  return { f, calls, prices, endpoints };
}
const envOf = (o: Record<string, string>) => (k: string) => o[k];
const memStore = () => { const m = new Map<string, string>(); return { m, get: async (k: string) => m.get(k), set: async (k: string, v: string) => void m.set(k, v) }; };

Deno.test("a STRIPE_PRICE_* secret wins and Stripe isn't asked", async () => {
  const s = fakeStripe();
  assertEquals(await priceId("pro", envOf({ STRIPE_SECRET_KEY: "sk", STRIPE_PRICE_LOCATION_PRO: "price_hand" }), s.f), "price_hand");
  assertEquals(s.calls.length, 0);
});

Deno.test("no Stripe key, no price", async () => {
  assertEquals(await priceId("entry", envOf({}), fakeStripe().f), undefined);
});

Deno.test("found by lookup key when it exists, made once when it doesn't", async () => {
  const s = fakeStripe({ prices: { placetta_essentials_year: "price_existing" } });
  const env = envOf({ STRIPE_SECRET_KEY: "sk_a" });
  assertEquals(await priceId("essentials", env, s.f), "price_existing");
  assert(!s.calls.some((c) => c.method === "POST"));
  const ids = await allPrices(env, s.f);
  assertEquals(new Set(Object.values(ids)).size, Object.keys(CATALOG).length);
  const made = s.calls.filter((c) => c.method === "POST" && c.path === "prices");
  assertEquals(made.length, Object.keys(CATALOG).length - 1);
  const food = made.find((c) => c.body?.lookup_key === "placetta_opening_food")!.body!;
  assertEquals([food.unit_amount, food.currency, food["recurring[interval]"]], ["650000", "usd", undefined]);
  const pro = made.find((c) => c.body?.lookup_key === "placetta_pro_year")!.body!;
  assertEquals([pro.unit_amount, pro["recurring[interval]"]], ["358800", "year"]);
  const before = s.calls.length;
  await allPrices(env, s.f);
  assertEquals(s.calls.length, before, "remembered after the first look");
});

Deno.test("the catalog matches the approved prices", () => {
  assertEquals(Object.fromEntries(Object.entries(CATALOG).map(([k, d]) => [k, d.cents])), { entry: 29900, essentials: 178800, pro: 358800, retail: 350000, food: 650000, guarantee: 250000, pack: 4900 });
});

Deno.test("itemOf knows a price by its id or its lookup key", () => {
  const env = envOf({ STRIPE_PRICE_LOCATION: "price_ess" });
  assertEquals(itemOf({ id: "price_ess" }, env), "essentials");
  assertEquals(itemOf({ id: "price_x", lookup_key: "placetta_pro_year" }, env), "pro");
  assertEquals(itemOf({ id: "price_y", lookup_key: null }, env), undefined);
  assertEquals(itemOf(undefined, env), undefined);
});

Deno.test("the webhook: env secret, stored secret, made and kept, a lost one replaced, a hand-made one left alone", async () => {
  const URL_ = "https://x.supabase.co/functions/v1/stripe-webhook";
  assertEquals(await ensureWebhook(envOf({ STRIPE_WEBHOOK_SECRET: "whsec_env" }), memStore(), URL_, fakeStripe().f), "env");

  const st = memStore(), s = fakeStripe();
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "created");
  assert(st.m.get("webhook_secret")?.startsWith("whsec_"));
  const made = s.calls.find((c) => c.method === "POST")!.body!;
  assertEquals(WEBHOOK_EVENTS.map((_, i) => made[`enabled_events[${i}]`]), WEBHOOK_EVENTS);
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st, URL_, s.f), "stored");
  assertEquals(s.calls.filter((c) => c.method === "POST").length, 1);

  const lost = fakeStripe({ endpoints: [{ id: "we_old", url: URL_, metadata: { placetta: "1" } }] }), st2 = memStore();
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), st2, URL_, lost.f), "created");
  assertEquals(lost.endpoints.map((e) => e.id).includes("we_old"), false);
  assertEquals(lost.endpoints.length, 1);

  const hand = fakeStripe({ endpoints: [{ id: "we_hand", url: URL_ }] });
  assertEquals(await ensureWebhook(envOf({ STRIPE_SECRET_KEY: "sk" }), memStore(), URL_, hand.f), "manual");
  assertEquals(hand.endpoints.length, 1);
});
