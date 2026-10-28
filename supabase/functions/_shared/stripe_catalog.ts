// Placetta's price list in Stripe, found by lookup key so the only secret Stripe needs is STRIPE_SECRET_KEY.
// A STRIPE_PRICE_* secret, when set, still wins (tests and any hand-made price). Otherwise the price is the active one
// with its lookup key. The code never makes a price: the founder creates them in Stripe, and billing charges one only
// when Stripe's amount, currency and interval are exactly the approved ones (src/pricing.ts).
// The webhook endpoint is made by the code (ensureWebhook), and its signing secret kept in public.stripe_config
// (service role only). billingHealth says whether all of it is in place, for staff and the monitor's daily run.
import { LEGACY_LOOKUPS, SIMPLE_PRICE_ENV, type SimpleItem, stripePriceMatches } from "../../../src/pricing.ts";

/** The legacy items (before the simple model) keep their names so older subscriptions are still recognized, but
 *  priceId refuses them: they are never offered or charged. pack is current ($49). */
export type Item = "entry" | "essentials" | "pro" | "retail" | "food" | "guarantee" | "pack";
type Def = { env: string; lookup: string; cents: number; legacy?: true };

export const CATALOG: Record<Item, Def> = {
  entry: { env: "STRIPE_PRICE_ENTRY", lookup: "placetta_entry", cents: 29900, legacy: true },
  essentials: { env: "STRIPE_PRICE_LOCATION", lookup: "placetta_essentials_year", cents: 178800, legacy: true },
  pro: { env: "STRIPE_PRICE_LOCATION_PRO", lookup: "placetta_pro_year", cents: 358800, legacy: true },
  retail: { env: "STRIPE_PRICE_OPENING", lookup: "placetta_opening_retail", cents: 350000, legacy: true },
  food: { env: "STRIPE_PRICE_OPENING_FOOD", lookup: "placetta_opening_food", cents: 650000, legacy: true },
  guarantee: { env: "STRIPE_PRICE_GUARANTEE", lookup: "placetta_guarantee", cents: 250000, legacy: true },
  pack: { env: "STRIPE_PRICE_PACK", lookup: "placetta_odelia_pack", cents: 4900 },
};

/** Every event the app relies on (supabase/functions/stripe-webhook/handler.ts). async_payment_succeeded: a checkout
 *  paid by a delayed method (a bank debit) completes unpaid and is fulfilled only when this arrives; _failed lets its
 *  charge go. ensureWebhook brings an endpoint Placetta made up to this list; one made by hand needs them added. */
export const WEBHOOK_EVENTS = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.paid", "invoice.payment_failed", "charge.refunded",
];
export const VERSION = "2025-03-31.basil";
/** Single-use cards (_shared/issuing.ts) are on only with STRIPE_ISSUING=on; then the webhook also needs these (the
 *  authorization request goes to the real-time endpoint set in Stripe's Issuing settings, this same function). */
export const ISSUING_EVENTS = ["issuing_transaction.created"];
export const issuingOn = (env: (k: string) => string | undefined) => env("STRIPE_ISSUING") === "on";

type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

export function client(env: Env, f: Fetch = fetch) {
  const key = () => env("STRIPE_SECRET_KEY") ?? "";
  const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key()}`, "Stripe-Version": VERSION, ...extra });
  async function get(path: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { headers: headers() });
    const d = await r.json();
    if (!r.ok) throw Object.assign(new Error(d?.error?.message ?? "Stripe error"), { status: r.status });
    return d;
  }
  async function post(path: string, params: Record<string, string>, idem?: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: headers({ "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) }), body: new URLSearchParams(params) });
    const d = await r.json();
    if (!r.ok) throw Object.assign(new Error(d?.error?.message ?? "Stripe error"), { status: r.status });
    return d;
  }
  async function del(path: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "DELETE", headers: headers() });
    if (!r.ok) throw new Error((await r.json())?.error?.message ?? "Stripe error");
  }
  return { get, post, del };
}

export type StripePrice = { id: string; lookup_key?: string | null; unit_amount?: number | null; currency?: string | null; active?: boolean; recurring?: { interval?: string | null; interval_count?: number | null } | null };

/** The active price with this lookup key, or undefined. */
export async function findByLookup(lookup: string, env: Env, f: Fetch = fetch): Promise<StripePrice | undefined> {
  if (!env("STRIPE_SECRET_KEY")) return undefined;
  const found = await client(env, f).get(`prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookup)}`);
  return (found?.data?.[0] as StripePrice | undefined) ?? undefined;
}

const memo = new Map<string, string>();
/** The Stripe price id for a current item: its secret, else the active price with its lookup key. Never made; never a
 *  legacy item. Undefined when it isn't there (or there is no Stripe key). */
export async function priceId(item: Item, env: Env, f: Fetch = fetch): Promise<string | undefined> {
  const d = CATALOG[item];
  if (d.legacy) return undefined;
  const set = env(d.env);
  if (set) return set;
  if (!env("STRIPE_SECRET_KEY")) return undefined;
  const hit = memo.get(d.lookup);
  if (hit) return hit;
  const id = (await findByLookup(d.lookup, env, f))?.id;
  if (id) memo.set(d.lookup, id);
  return id;
}

/** A simple-model price, from its env var or its lookup key, only when Stripe has exactly the approved amount, currency
 *  and interval; else null (the team quotes it and nothing is charged). */
export async function verifiedSimplePrice(item: SimpleItem, env: Env, f: Fetch = fetch): Promise<string | null> {
  const d = SIMPLE_PRICE_ENV[item];
  if (!env("STRIPE_SECRET_KEY")) return null;
  const s = client(env, f);
  const id = env(d.env);
  const p = (id ? await s.get(`prices/${encodeURIComponent(id)}`) : await findByLookup(d.lookup, env, f)) as StripePrice | undefined;
  if (!p) return null;
  if (stripePriceMatches(p, { cents: d.cents, interval: d.interval })) return p.id;
  console.error("billing: price differs from the approved list", d.env, d.lookup);
  return null;
}

/** Which item a Stripe price is: by the configured id, else by its lookup key. */
export function itemOf(price: { id?: string; lookup_key?: string | null } | undefined, env: Env): Item | undefined {
  if (!price) return undefined;
  return (Object.keys(CATALOG) as Item[]).find((k) => (price.id && env(CATALOG[k].env) === price.id) || (price.lookup_key && price.lookup_key === CATALOG[k].lookup));
}

/** Rows of public.stripe_config, read and written with the service role. */
export type Store = { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void> };

/** The webhook signing secret: the env secret, else the stored one. */
export async function webhookSecret(env: Env, store: Store): Promise<string | undefined> {
  return env("STRIPE_WEBHOOK_SECRET") ?? (await store.get("webhook_secret"));
}

type Endpoint = { id: string; url?: string; status?: string; enabled_events?: string[]; metadata?: Record<string, string> };
/** The events the endpoint needs: WEBHOOK_EVENTS, and the single-use cards' once they're on (_shared/issuing.ts). */
export const webhookEvents = (env: Env) => [...WEBHOOK_EVENTS, ...(issuingOn(env) ? ISSUING_EVENTS : [])];
const missingEvents = (e: Endpoint, env: Env) => (e.enabled_events ?? []).includes("*") ? [] : webhookEvents(env).filter((ev) => !(e.enabled_events ?? []).includes(ev));
const eventParams = (env: Env) => Object.fromEntries(webhookEvents(env).map((ev, i) => [`enabled_events[${i}]`, ev]));

/**
 * Make sure Stripe sends every event the app relies on to our webhook. No signing secret yet: make the endpoint and keep
 * its secret. One Placetta made earlier: kept, its events brought up to date, made again if it was deleted in Stripe.
 * An endpoint at our URL that Placetta made but whose secret we lost is replaced; one someone made by hand is left alone
 * (then STRIPE_WEBHOOK_SECRET has to be set, and billing health says whether its events are right).
 */
export async function ensureWebhook(env: Env, store: Store, url: string, f: Fetch = fetch): Promise<"env" | "stored" | "updated" | "created" | "manual"> {
  if (env("STRIPE_WEBHOOK_SECRET")) return "env";
  const s = client(env, f);
  let gone = "";
  if (await store.get("webhook_secret")) {
    const id = await store.get("webhook_endpoint");
    gone = id ?? "";
    if (!id) return "stored";
    let e: Endpoint | null = null;
    try { e = await s.get(`webhook_endpoints/${encodeURIComponent(id)}`); } catch (x) { if ((x as { status?: number }).status !== 404) throw x; }
    if (e && e.url === url) {
      if (!missingEvents(e, env).length && e.status !== "disabled") return "stored";
      await s.post(`webhook_endpoints/${encodeURIComponent(id)}`, { ...eventParams(env), disabled: "false" });
      return "updated";
    }
    // gone (or moved) in Stripe: the stored secret is useless now, so make it again below
  }
  const list = await s.get("webhook_endpoints?limit=100");
  const ours = (list?.data ?? []).filter((e: Endpoint) => e.url === url) as Endpoint[];
  if (ours.some((e) => e.metadata?.placetta !== "1")) return "manual";
  for (const e of ours) await s.del(`webhook_endpoints/${e.id}`);
  const p: Record<string, string> = { url, "metadata[placetta]": "1", api_version: VERSION, description: "Placetta billing", ...eventParams(env) };
  // the key names what it replaces, so making it again after a deletion isn't answered with the deleted one (Stripe
  // replays an idempotency key's first answer for 24 hours)
  const made = await s.post("webhook_endpoints", p, `placetta-webhook-${url}-${[gone, ...ours.map((e) => e.id)].filter(Boolean).join(",")}-${webhookEvents(env).length}`);
  if (!made?.secret) throw new Error("Stripe made the webhook without a signing secret.");
  await store.set("webhook_secret", made.secret);
  await store.set("webhook_endpoint", made.id);
  return "created";
}

export type Health = {
  ok: boolean;
  checked_at: string;
  key: { set: boolean; mode: "live" | "test" | null };
  webhook: { exists: boolean; id: string | null; status: string | null; missing_events: string[]; how: string | null; error?: string };
  secret: { stored: boolean; env: boolean };
  prices: { item: SimpleItem; lookup: string; found: boolean; ok: boolean; id: string | null }[];
  legacy_active: string[];
  tax: string;
  problems: string[];
};

/** Is the key set, does the webhook exist with the right events, is the signing secret stored, are the prices found by
 *  lookup key at the approved amounts, and which legacy prices are still active in Stripe (to archive). With
 *  ensure=true it makes or repairs the webhook first (ensureWebhook). Never writes a price. */
export async function billingHealth(env: Env, store: Store, url: string, o: { f?: Fetch; ensure?: boolean; now?: Date } = {}): Promise<Health> {
  const f = o.f ?? fetch;
  const key = env("STRIPE_SECRET_KEY") ?? "";
  const h: Health = {
    ok: false, checked_at: (o.now ?? new Date()).toISOString(),
    key: { set: !!key, mode: key.startsWith("sk_live_") || key.startsWith("rk_live_") ? "live" : key ? "test" : null },
    webhook: { exists: false, id: null, status: null, missing_events: webhookEvents(env), how: null },
    secret: { stored: false, env: !!env("STRIPE_WEBHOOK_SECRET") }, prices: [], legacy_active: [],
    tax: "Not configured in code: Checkout sessions don't set automatic_tax, so Stripe Tax isn't applied.", problems: [],
  };
  if (!key) { h.problems.push("STRIPE_SECRET_KEY isn't set."); return h; }
  const s = client(env, f);
  if (o.ensure) {
    try { h.webhook.how = await ensureWebhook(env, store, url, f); } catch (e) { h.webhook.error = (e as Error).message.slice(0, 200); h.problems.push("Couldn't make the webhook: " + h.webhook.error); }
  }
  h.secret.stored = !!(await store.get("webhook_secret"));
  try {
    const list = await s.get("webhook_endpoints?limit=100");
    const e = ((list?.data ?? []) as Endpoint[]).find((x) => x.url === url);
    if (e) h.webhook = { ...h.webhook, exists: true, id: e.id, status: e.status ?? null, missing_events: missingEvents(e, env) };
  } catch (e) { h.problems.push("Couldn't list webhooks: " + (e as Error).message.slice(0, 120)); }
  if (!h.webhook.exists) h.problems.push("No Stripe webhook points at " + url + ".");
  else {
    if (h.webhook.missing_events.length) h.problems.push("The webhook is missing " + h.webhook.missing_events.join(", ") + ".");
    if (h.webhook.status === "disabled") h.problems.push("The webhook is disabled in Stripe.");
  }
  if (!h.secret.stored && !h.secret.env) h.problems.push("No webhook signing secret: neither stored nor STRIPE_WEBHOOK_SECRET.");
  for (const item of Object.keys(SIMPLE_PRICE_ENV) as SimpleItem[]) {
    const d = SIMPLE_PRICE_ENV[item];
    try {
      const id = env(d.env);
      const p = (id ? await s.get(`prices/${encodeURIComponent(id)}`) : await findByLookup(d.lookup, env, f)) as StripePrice | undefined;
      const ok = !!p && stripePriceMatches(p, { cents: d.cents, interval: d.interval });
      h.prices.push({ item, lookup: d.lookup, found: !!p, ok, id: p?.id ?? null });
      if (!ok) h.problems.push(p ? `${d.lookup} differs from the approved ${d.cents / 100} USD${d.interval ? " a " + d.interval : " one time"}.` : `No active price with lookup key ${d.lookup}.`);
    } catch (e) { h.prices.push({ item, lookup: d.lookup, found: false, ok: false, id: null }); h.problems.push(`${d.lookup}: ${(e as Error).message.slice(0, 100)}`); }
  }
  for (const lk of LEGACY_LOOKUPS) {
    try { if (await findByLookup(lk, env, f)) h.legacy_active.push(lk); } catch { /* reported by the prices above if Stripe is down */ }
  }
  h.ok = h.problems.length === 0;
  return h;
}
