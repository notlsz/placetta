// deno test -A supabase/functions/partner-api/logic_test.ts
// The partner API and the plan box: keys are checked by their SHA-256, every route is rate-limited, a key only ever
// reaches its own partner's consenting referrals, and only the shared fields leave.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { clientIp, type Deps, handle, keyFrom, LIMITS, planQuery, type PlanRow, type ReferralRow, scope, sha256Hex, startUrl } from "./logic.ts";
// @ts-types="./plan.d.ts"
import { previewPlan, stateOf } from "./plan.js";

const KEY_A = "plk_0a1b2c3d_" + "ab".repeat(24);
const KEY_B = "plk_99aa88bb_" + "cd".repeat(24);
const row = (id: string, name: string, extra: Record<string, unknown> = {}): ReferralRow => ({
  referral_id: id, business_name: name, stage: "opening", permits_done: 3, permits_total: 9, opening_date: "2027-03-01",
  referred_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-16T00:00:00Z", ...extra,
} as ReferralRow);

/** A stand-in database: two partners, each with their own referrals; a limiter that counts in memory. */
async function world(o: { limitMax?: number } = {}) {
  const hashes: Record<string, string> = { [await sha256Hex(KEY_A)]: "partner-a", [await sha256Hex(KEY_B)]: "partner-b" };
  const byPartner: Record<string, ReferralRow[]> = {
    "partner-a": [row("r1", "Lucky Leaf Tea", { email: "owner@tea.test", ein: "12-3456789" })],
    "partner-b": [row("r2", "Other Bakery"), row("r3", "Noodle Bar")],
  };
  const hits = new Map<string, number>();
  const asked: string[] = [];
  const d: Deps = {
    auth: (h) => Promise.resolve(hashes[h] ?? null),
    referrals: (p) => { asked.push(p); return Promise.resolve(byPartner[p] ?? []); },
    limit: (k, max) => { const n = (hits.get(k) ?? 0) + 1; hits.set(k, n); return Promise.resolve(n <= (o.limitMax ?? max)); },
    plan: (what, where) => (stateOf(where) ? previewPlan(what, where) as unknown as { apps: PlanRow[] } : null),
    partner: (code) => Promise.resolve(code === "BAYB2345" ? "Bay Bridge Realty" : null),
    appOrigin: "https://placetta.com",
  };
  return { d, hits, asked };
}
const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://x.supabase.co/functions/v1/partner-api${path}`, { headers: { "x-forwarded-for": "203.0.113.9", ...headers } });

Deno.test("keys: only plk_ keys in a Bearer header are read", () => {
  assertEquals(keyFrom(`Bearer ${KEY_A}`), KEY_A);
  assertEquals(keyFrom(`bearer   ${KEY_A}  `), KEY_A);
  assertEquals(keyFrom(KEY_A), null);
  assertEquals(keyFrom("Bearer plk_0a1b2c3d_short"), null);
  assertEquals(keyFrom("Bearer sk_live_whatever"), null);
  assertEquals(keyFrom(null), null);
});

Deno.test("keys: hashed with SHA-256 as lowercase hex, the way the database stores them", async () => {
  // the standard SHA-256 test vector, and the same function the database's encode(digest(key, 'sha256'), 'hex') matches
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const h = await sha256Hex(KEY_A);
  assert(/^[0-9a-f]{64}$/.test(h));
  assert(!h.includes(KEY_A.slice(13)));
});

Deno.test("referrals: a key reaches only its own partner's referrals, with only the shared fields", async () => {
  const { d, asked } = await world();
  const r = await handle(get("/v1/referrals", { authorization: `Bearer ${KEY_A}` }), d);
  assertEquals(r.status, 200);
  const body = await r.json();
  assertEquals(body.count, 1);
  assertEquals(body.data[0].business_name, "Lucky Leaf Tea");
  assertEquals(Object.keys(body.data[0]).sort(), ["business_name", "opening_date", "permits_done", "permits_total", "referral_id", "referred_at", "stage", "updated_at"]);
  assert(!JSON.stringify(body).includes("owner@tea.test") && !JSON.stringify(body).includes("12-3456789"), "nothing beyond the shared fields leaves");
  assertEquals(asked, ["partner-a"], "only the key's partner is asked for");
  const b = await (await handle(get("/v1/referrals", { authorization: `Bearer ${KEY_B}` }), d)).json();
  assertEquals(b.data.map((x: ReferralRow) => x.business_name), ["Other Bakery", "Noodle Bar"]);
});

Deno.test("referrals: no key, a malformed key or an unknown key gets 401 and no data", async () => {
  const { d, asked } = await world();
  for (const h of [{}, { authorization: "Bearer nope" }, { authorization: `Bearer plk_00000000_${"0".repeat(48)}` }] as Record<string, string>[]) {
    const r = await handle(get("/v1/referrals", h), d);
    assertEquals(r.status, 401);
    assert(!("data" in (await r.json())));
  }
  assertEquals(asked, [], "no referrals were read for a bad key");
});

Deno.test("scope: rows whose sharing stopped (no stage) are dropped, extra fields never leave", () => {
  const out = scope([row("r1", "A", { secret: 1 }), { ...row("r2", "B"), stage: null }, null, "x", { referral_id: 5 }]);
  assertEquals(out.length, 1);
  assertEquals((out[0] as Record<string, unknown>).secret, undefined);
  assertEquals(scope("not a list"), []);
});

Deno.test("rate limit: 60 a minute per key, then 429 with Retry-After", async () => {
  const { d, hits } = await world();
  let last: Response | null = null;
  for (let i = 0; i < LIMITS.api.max + 1; i++) last = await handle(get("/v1/referrals", { authorization: `Bearer ${KEY_A}`, "x-forwarded-for": `198.51.100.${i % 50}` }), d);
  assertEquals(last!.status, 429);
  assertEquals(last!.headers.get("retry-after"), "60");
  const keyHits = [...hits.keys()].filter((k) => k.startsWith("api:key:"));
  assertEquals(keyHits.length, 1, "one counter per key, kept by its hash");
  assert(!keyHits[0].includes(KEY_A.slice(13)), "the counter's name never holds the key");
  // another key is unaffected
  assertEquals((await handle(get("/v1/referrals", { authorization: `Bearer ${KEY_B}` }), d)).status, 200);
});

Deno.test("rate limit: wrong keys from one address are limited too", async () => {
  const { d } = await world();
  let last: Response | null = null;
  for (let i = 0; i < LIMITS.apiIp.max + 1; i++) last = await handle(get("/v1/referrals", { authorization: `Bearer plk_00000000_${String(i).padStart(48, "0")}` }), d);
  assertEquals(last!.status, 429);
});

Deno.test("plan box: the registry's plan for a business and city, with the partner's code on the start link", async () => {
  const { d } = await world();
  const r = await handle(get("/v1/plan?type=Milk%20tea&city=Flushing,%20NY&ref=bayb2345"), d);
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), "*");
  const p = await r.json();
  assert(p.count >= 5 && p.permits.length === p.count);
  assert(p.permits.some((x: { name: { en: string } }) => /Food Service Establishment/.test(x.name.en)), "Flushing gets the NYC food service permit");
  assertEquals(p.partner, { org_name: "Bay Bridge Realty" });
  const u = new URL(p.start_url);
  assertEquals([u.origin, u.pathname, u.searchParams.get("ref"), u.searchParams.get("line")], ["https://placetta.com", "/app/", "BAYB2345", "Milk tea in Flushing, NY"]);
});

Deno.test("plan box: an unknown code isn't passed on; a city without a state is refused", async () => {
  const { d } = await world();
  const p = await (await handle(get("/v1/plan?type=Bakery&city=Houston,%20TX&ref=ZZZZ2222"), d)).json();
  assertEquals(p.partner, null);
  assertEquals(new URL(p.start_url).searchParams.get("ref"), null);
  assertEquals((await handle(get("/v1/plan?type=Bakery&city=Springfield"), d)).status, 400);
  assertEquals((await handle(get("/v1/plan?city=Houston,%20TX"), d)).status, 400);
  assertEquals((await handle(get("/v1/plan?type=%3Cscript%3E&city=Houston,%20TX"), d)).status, 400);
});

Deno.test("plan box: 20 a minute from one address, then 429; another address is unaffected", async () => {
  const { d } = await world();
  let last: Response | null = null;
  for (let i = 0; i < LIMITS.plan.max + 1; i++) last = await handle(get("/v1/plan?type=Retail&city=Atlanta,%20GA"), d);
  assertEquals(last!.status, 429);
  assertEquals((await handle(get("/v1/plan?type=Retail&city=Atlanta,%20GA", { "x-forwarded-for": "192.0.2.77" }), d)).status, 200);
});

Deno.test("routing: preflight, methods and unknown paths", async () => {
  const { d } = await world();
  const pre = await handle(new Request("https://x/functions/v1/partner-api/v1/plan", { method: "OPTIONS" }), d);
  assertEquals(pre.status, 204);
  assertEquals(pre.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assertEquals((await handle(new Request("https://x/functions/v1/partner-api/v1/referrals", { method: "POST" }), d)).status, 405);
  assertEquals((await handle(get("/v2/everything"), d)).status, 404);
});

Deno.test("helpers: the caller's address, the plan question, the start link", () => {
  assertEquals(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" } })), "203.0.113.1");
  assertEquals(clientIp(new Request("https://x")), "unknown");
  const q = planQuery(new URL("https://x/v1/plan?type=%20Hot%20%20pot%20&city=Irvine,%20CA&lang=zh&ref=bad"));
  assertEquals(q, { what: "Hot pot", where: "Irvine, CA", ref: null, lang: "zh" });
  assertEquals(startUrl("https://placetta.com", { what: "Bakery", where: "Houston, TX", ref: null }), "https://placetta.com/app/?line=Bakery+in+Houston%2C+TX");
});
