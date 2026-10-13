// Placetta's price list in Stripe, kept by lookup key so the only secret Stripe needs is STRIPE_SECRET_KEY.
// A STRIPE_PRICE_* secret, when set, still wins (tests and any hand-made price). Otherwise the price is found by its
// lookup key, and made (product and price) the first time it's needed; an idempotency key stops two at once making two.
// The webhook endpoint is made the same way, and its signing secret kept in public.stripe_config (service role only).

export type Item = "entry" | "essentials" | "pro" | "retail" | "food" | "guarantee" | "pack";
type Def = { env: string; lookup: string; name: string; description: string; cents: number; year?: true };

export const CATALOG: Record<Item, Def> = {
  entry: { env: "STRIPE_PRICE_ENTRY", lookup: "placetta_entry", name: "Placetta entry plan", description: "Every license, permit and registration for one market, in order, with timelines and agency fees.", cents: 29900 },
  essentials: { env: "STRIPE_PRICE_LOCATION", lookup: "placetta_essentials_year", name: "Placetta Essentials", description: "Per location, billed yearly: every license tracked and renewals filed, with Odelia.", cents: 178800, year: true },
  pro: { env: "STRIPE_PRICE_LOCATION_PRO", lookup: "placetta_pro_year", name: "Placetta Pro", description: "Per location, billed yearly: Essentials plus daily logs, mock inspections and twice the Odelia allowance.", cents: 358800, year: true },
  retail: { env: "STRIPE_PRICE_OPENING", lookup: "placetta_opening_retail", name: "Store opening, retail", description: "Every permit for a new retail store, filed and tracked to approval.", cents: 350000 },
  food: { env: "STRIPE_PRICE_OPENING_FOOD", lookup: "placetta_opening_food", name: "Store opening, restaurant or food", description: "Every permit for a new restaurant or food store, filed and tracked to approval.", cents: 650000 },
  guarantee: { env: "STRIPE_PRICE_GUARANTEE", lookup: "placetta_guarantee", name: "Open-by-date guarantee", description: "If a permit Placetta files makes the store open late, the opening fee is refunded.", cents: 250000 },
  pack: { env: "STRIPE_PRICE_PACK", lookup: "placetta_odelia_pack", name: "Odelia pack", description: "$25 more Odelia allowance, carried over until it's used.", cents: 4900 },
};

export const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
const VERSION = "2025-03-31.basil";

type Env = (k: string) => string | undefined;
type Fetch = typeof fetch;

export function client(env: Env, f: Fetch = fetch) {
  const key = () => env("STRIPE_SECRET_KEY") ?? "";
  const headers = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${key()}`, "Stripe-Version": VERSION, ...extra });
  async function get(path: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { headers: headers() });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
    return d;
  }
  async function post(path: string, params: Record<string, string>, idem?: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: headers({ "Content-Type": "application/x-www-form-urlencoded", ...(idem ? { "Idempotency-Key": idem } : {}) }), body: new URLSearchParams(params) });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message ?? "Stripe error");
    return d;
  }
  async function del(path: string) {
    const r = await f(`https://api.stripe.com/v1/${path}`, { method: "DELETE", headers: headers() });
    if (!r.ok) throw new Error((await r.json())?.error?.message ?? "Stripe error");
  }
  return { get, post, del };
}

const memo = new Map<string, string>();
/** The Stripe price id for an item: its secret, else its lookup key, else made now. Undefined only without a Stripe key. */
export async function priceId(item: Item, env: Env, f: Fetch = fetch): Promise<string | undefined> {
  const d = CATALOG[item];
  const set = env(d.env);
  if (set) return set;
  if (!env("STRIPE_SECRET_KEY")) return undefined;
  const hit = memo.get(d.lookup);
  if (hit) return hit;
  const s = client(env, f);
  const found = await s.get(`prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(d.lookup)}`);
  let id = found?.data?.[0]?.id as string | undefined;
  if (!id) {
    const p: Record<string, string> = {
      currency: "usd", unit_amount: String(d.cents), lookup_key: d.lookup, "product_data[name]": d.name,
      "product_data[metadata][placetta]": item, "metadata[placetta]": item,
    };
    if (d.year) p["recurring[interval]"] = "year";
    id = (await s.post("prices", p, `placetta-catalog-${d.lookup}-${d.cents}`)).id as string;
  }
  memo.set(d.lookup, id);
  return id;
}

/** Every item's price id at once (for the plans page). */
export async function allPrices(env: Env, f: Fetch = fetch): Promise<Record<Item, string | undefined>> {
  const keys = Object.keys(CATALOG) as Item[];
  const ids = await Promise.all(keys.map((k) => priceId(k, env, f)));
  return Object.fromEntries(keys.map((k, i) => [k, ids[i]])) as Record<Item, string | undefined>;
}

/** Which item a Stripe price is: by the configured id, else by its lookup key. */
export function itemOf(price: { id?: string; lookup_key?: string | null } | undefined, env: Env): Item | undefined {
  if (!price) return undefined;
  return (Object.keys(CATALOG) as Item[]).find((k) => (price.id && env(CATALOG[k].env) === price.id) || (price.lookup_key && price.lookup_key === CATALOG[k].lookup));
}

/** Rows of public.stripe_config, read and written with the service role. */
type Store = { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void> };

/** The webhook signing secret: the env secret, else the stored one. */
export async function webhookSecret(env: Env, store: Store): Promise<string | undefined> {
  return env("STRIPE_WEBHOOK_SECRET") ?? (await store.get("webhook_secret"));
}

/**
 * Make sure Stripe sends its events to our webhook. If we have no signing secret, make the endpoint and keep its secret.
 * An endpoint at our URL that Placetta made earlier but whose secret we lost is replaced; one someone made by hand is
 * left alone (then STRIPE_WEBHOOK_SECRET has to be set).
 */
export async function ensureWebhook(env: Env, store: Store, url: string, f: Fetch = fetch): Promise<"env" | "stored" | "created" | "manual"> {
  if (env("STRIPE_WEBHOOK_SECRET")) return "env";
  if (await store.get("webhook_secret")) return "stored";
  const s = client(env, f);
  const list = await s.get("webhook_endpoints?limit=100");
  const ours = (list?.data ?? []).filter((e: { url?: string }) => e.url === url) as { id: string; metadata?: Record<string, string> }[];
  if (ours.some((e) => e.metadata?.placetta !== "1")) return "manual";
  for (const e of ours) await s.del(`webhook_endpoints/${e.id}`);
  const p: Record<string, string> = { url, "metadata[placetta]": "1", api_version: VERSION, description: "Placetta billing" };
  WEBHOOK_EVENTS.forEach((ev, i) => (p[`enabled_events[${i}]`] = ev));
  const made = await s.post("webhook_endpoints", p, `placetta-webhook-${url}-${ours.map((e) => e.id).join(",")}`);
  if (!made?.secret) throw new Error("Stripe made the webhook without a signing secret.");
  await store.set("webhook_secret", made.secret);
  await store.set("webhook_endpoint", made.id);
  return "created";
}
