// Run: deno test -A supabase/functions/integrations/providers_test.ts
// Square's sign-in through the shared providers module, with a stand-in for fetch: the authorize link, the code
// exchange (JSON, Square-Version, expires_at), the account name, renewal, revoking, and Toast never signing in; then
// Google Business Profile, Clover, Shopify (its signed redirect) and Xero, and Dropbox Sign taking an API key instead.
import { deepStrictEqual as assertEquals, ok as assert, rejects, throws } from "node:assert";

// the module reads these when it loads (a client that never connects here)
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-for-tests");
Deno.env.set("SQUARE_CLIENT_ID", "sq0idp-TestAppId");
Deno.env.set("SQUARE_CLIENT_SECRET", "sq0csp-TestSecret");
Deno.env.set("CLOVER_APP_ID", "CLOVERAPPID");
Deno.env.set("CLOVER_APP_SECRET", "clover-secret");
Deno.env.set("SHOPIFY_CLIENT_ID", "shopify-client");
Deno.env.set("SHOPIFY_CLIENT_SECRET", "shopify-secret");
Deno.env.set("XERO_CLIENT_ID", "xero-client");
Deno.env.set("XERO_CLIENT_SECRET", "xero-secret");
Deno.env.set("GOOGLE_CLIENT_ID", "google-client");
Deno.env.set("GOOGLE_CLIENT_SECRET", "google-secret");
const P = await import("./providers.ts");

type Seen = { url: string; method: string; headers: Headers; body: string };
function stub(reply: (s: Seen) => Response) {
  const seen: Seen[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string | URL | Request, init?: RequestInit) => {
    const s = { url: String(u), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: String(init?.body ?? "") };
    seen.push(s);
    return reply(s);
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = real; } };
}
const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

Deno.test("Square: the authorize link asks for read-only sales and team access, code flow", () => {
  const u = new URL(P.authorizeUrl("square", "signed-state"));
  assertEquals(u.origin + u.pathname, "https://connect.squareup.com/oauth2/authorize");
  assertEquals(u.searchParams.get("client_id"), "sq0idp-TestAppId");
  assertEquals(u.searchParams.get("scope")?.split(" "), ["MERCHANT_PROFILE_READ", "PAYMENTS_READ", "ORDERS_READ", "EMPLOYEES_READ", "TIMECARDS_READ"]);
  assertEquals([u.searchParams.get("session"), u.searchParams.get("state"), u.searchParams.has("redirect_uri")], ["false", "signed-state", false]);
  assert(/scope=MERCHANT_PROFILE_READ\+PAYMENTS_READ/.test(u.search), "scopes joined with +, as Square's examples show");
  Deno.env.set("SQUARE_ENV", "sandbox");
  try { assertEquals(new URL(P.authorizeUrl("square", "s")).host, "connect.squareupsandbox.com"); } finally { Deno.env.delete("SQUARE_ENV"); }
});

Deno.test("Square: the code exchange, the business name, and what's kept", async () => {
  const { seen, restore } = stub((s) => {
    if (s.url === "https://connect.squareup.com/oauth2/token") return j({ access_token: "EAAAl-access", token_type: "bearer", expires_at: "2026-11-16T10:00:00Z", merchant_id: "ML7MERCHANT", refresh_token: "EQAAl-refresh", short_lived: false });
    if (s.url === "https://connect.squareup.com/v2/merchants/me") return j({ merchant: { id: "ML7MERCHANT", business_name: "Golden Ox Tea", country: "US" } });
    return j({}, 404);
  });
  try {
    const ex = await P.exchangeCode("square", "sq0cgb-code", null);
    assertEquals(seen[0].method, "POST");
    assertEquals(seen[0].headers.get("content-type"), "application/json");
    assertEquals(seen[0].headers.get("square-version"), "2026-09-16");
    assertEquals(JSON.parse(seen[0].body), { client_id: "sq0idp-TestAppId", client_secret: "sq0csp-TestSecret", grant_type: "authorization_code", code: "sq0cgb-code" });
    assertEquals([seen[1].headers.get("authorization"), seen[1].headers.get("square-version")], ["Bearer EAAAl-access", "2026-09-16"]);
    assertEquals(ex.bundle, { access_token: "EAAAl-access", refresh_token: "EQAAl-refresh", expires_at: Date.parse("2026-11-16T10:00:00Z"), token_type: "bearer" });
    assertEquals([ex.account, ex.meta, ex.scopes], ["Golden Ox Tea", { merchant_id: "ML7MERCHANT", env: "production" }, P.SCOPES.square]);
  } finally { restore(); }
});

Deno.test("Square: a refused code, and renewal with the refresh token", async () => {
  let r = stub(() => j({ message: "Authorization code is already redeemed", type: "service.not_authorized", errors: [{ category: "AUTHENTICATION_ERROR", code: "UNAUTHORIZED" }] }, 401));
  try { await rejects(P.exchangeCode("square", "used", null), (e: unknown) => e instanceof Error && e.message === "token_exchange"); } finally { r.restore(); }
  r = stub(() => j({ access_token: "EAAAl-new", token_type: "bearer", expires_at: "2026-12-16T10:00:00Z", merchant_id: "ML7MERCHANT", refresh_token: "EQAAl-refresh" }));
  try {
    const b = await P.refreshBundle("square", { access_token: "EAAAl-old", refresh_token: "EQAAl-refresh", expires_at: Date.now(), token_type: "bearer" });
    assertEquals(JSON.parse(r.seen[0].body), { client_id: "sq0idp-TestAppId", client_secret: "sq0csp-TestSecret", grant_type: "refresh_token", refresh_token: "EQAAl-refresh" });
    assertEquals([b.access_token, b.refresh_token, b.expires_at], ["EAAAl-new", "EQAAl-refresh", Date.parse("2026-12-16T10:00:00Z")]);
  } finally { r.restore(); }
  r = stub(() => j({ errors: [{ code: "UNAUTHORIZED" }] }, 401));
  try { await rejects(P.refreshBundle("square", { access_token: "a", refresh_token: "gone", expires_at: 0, token_type: null }), (e: unknown) => e instanceof P.RefreshRejected); } finally { r.restore(); }
});

Deno.test("Toast never signs in through OAuth, and without keys Square isn't offered", () => {
  throws(() => P.authorizeUrl("toast", "s"), /Toast connects with a code/);
  Deno.env.delete("SQUARE_CLIENT_SECRET");
  try { throws(() => P.creds("square"), /Set SQUARE_CLIENT_ID and SQUARE_CLIENT_SECRET/); } finally { Deno.env.set("SQUARE_CLIENT_SECRET", "sq0csp-TestSecret"); }
  throws(() => P.creds("toast"), /Set TOAST_CLIENT_ID and TOAST_CLIENT_SECRET/);
  assertEquals([P.PROVIDER.square, P.PROVIDER.toast, P.isKind("square"), P.isKind("toast"), P.isKind("clover"), P.isKind("lightspeed")], ["square", "toast", true, true, true, false]);
});

/** Shopify's signature over a redirect, as its guide describes it: sorted key=value pairs without hmac, HMAC-SHA256. */
async function shopifySign(params: Record<string, string>, secret: string): Promise<URLSearchParams> {
  const msg = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg))), (b) => b.toString(16).padStart(2, "0")).join("");
  return new URLSearchParams({ ...params, hmac: mac });
}

Deno.test("Google Business Profile signs in with Google, for business.manage only", () => {
  const u = new URL(P.authorizeUrl("gbp", "s"));
  assertEquals([u.host, P.PROVIDER.gbp, u.searchParams.get("scope"), u.searchParams.get("access_type")], ["accounts.google.com", "google", "openid email https://www.googleapis.com/auth/business.manage", "offline"]);
});

Deno.test("Clover: the v2 link, the code trade in JSON, the merchant's name, renewal at /oauth/v2/refresh", async () => {
  const u = new URL(P.authorizeUrl("clover", "s"));
  assertEquals([u.origin + u.pathname, u.searchParams.get("response_type"), u.searchParams.get("client_id")], ["https://www.clover.com/oauth/v2/authorize", "code", "CLOVERAPPID"]);
  Deno.env.set("CLOVER_ENV", "sandbox");
  try { assertEquals(new URL(P.authorizeUrl("clover", "s")).host, "sandbox.dev.clover.com"); } finally { Deno.env.delete("CLOVER_ENV"); }
  let r = stub((s) => s.url === "https://api.clover.com/oauth/v2/token" ? j({ access_token: "clv-access", access_token_expiration: 1792800000, refresh_token: "clv-refresh", refresh_token_expiration: 1795000000 })
    : s.url === "https://api.clover.com/v3/merchants/MX12AB" ? j({ id: "MX12AB", name: "Golden Ox Tea" }) : j({}, 404));
  try {
    await rejects(P.exchangeCode("clover", "code1", null, new URLSearchParams({ code: "code1" })), (e: unknown) => e instanceof Error && e.message === "missing_merchant");
    const ex = await P.exchangeCode("clover", "code1", null, new URLSearchParams({ code: "code1", merchant_id: "MX12AB" }));
    assertEquals([r.seen[0].headers.get("content-type"), JSON.parse(r.seen[0].body)], ["application/json", { client_id: "CLOVERAPPID", client_secret: "clover-secret", code: "code1" }]);
    assertEquals([ex.account, ex.meta, ex.bundle.expires_at, ex.bundle.refresh_token], ["Golden Ox Tea", { merchant_id: "MX12AB", env: "production" }, 1792800000 * 1000, "clv-refresh"]);
  } finally { r.restore(); }
  r = stub(() => j({ access_token: "clv-new", access_token_expiration: 1792900000, refresh_token: "clv-refresh-2" }));
  try {
    const b = await P.refreshBundle("clover", { access_token: "old", refresh_token: "clv-refresh", expires_at: 0, token_type: null });
    assertEquals([r.seen[0].url, JSON.parse(r.seen[0].body), b.access_token, b.refresh_token], ["https://api.clover.com/oauth/v2/refresh", { client_id: "CLOVERAPPID", refresh_token: "clv-refresh" }, "clv-new", "clv-refresh-2"]);
  } finally { r.restore(); }
});

Deno.test("Shopify: the store's own link, its signed redirect checked, an expiring token for that store", async () => {
  throws(() => P.authorizeUrl("shopify", "s", { shop: "evil.example.com" }), /myshopify\.com/);
  const u = new URL(P.authorizeUrl("shopify", "s", { shop: "golden-ox.myshopify.com" }));
  assertEquals([u.origin + u.pathname, u.searchParams.get("scope"), u.searchParams.get("client_id")], ["https://golden-ox.myshopify.com/admin/oauth/authorize", "read_locations", "shopify-client"]);
  const good = await shopifySign({ code: "c1", shop: "golden-ox.myshopify.com", state: "s", timestamp: "1792800000" }, "shopify-secret");
  assert(await P.shopifySigned(good, "shopify-secret"));
  const forged = new URLSearchParams(good); forged.set("shop", "other.myshopify.com");
  assert(!(await P.shopifySigned(forged, "shopify-secret")), "a changed parameter breaks the signature");
  await rejects(P.exchangeCode("shopify", "c1", null, forged), (e: unknown) => e instanceof Error && e.message === "bad_signature");
  const r = stub(() => j({ access_token: "shpat_x", scope: "read_locations", expires_in: 3600, refresh_token: "shprt_y", refresh_token_expires_in: 7776000 }));
  try {
    const ex = await P.exchangeCode("shopify", "c1", null, good);
    const form = new URLSearchParams(r.seen[0].body);
    assertEquals([r.seen[0].url, form.get("code"), form.get("expiring"), form.get("client_id"), form.has("grant_type"), form.has("redirect_uri")], ["https://golden-ox.myshopify.com/admin/oauth/access_token", "c1", "1", "shopify-client", false, false]);
    assertEquals([ex.bundle.shop, ex.account, ex.meta, ex.bundle.refresh_token], ["golden-ox.myshopify.com", "golden-ox.myshopify.com", { shop: "golden-ox.myshopify.com" }, "shprt_y"]);
  } finally { r.restore(); }
});

Deno.test("Xero: its identity server, Basic auth on the trade, the organisation from /connections", async () => {
  const u = new URL(P.authorizeUrl("xero", "s"));
  assertEquals([u.origin + u.pathname, u.searchParams.get("scope")], ["https://login.xero.com/identity/connect/authorize", "openid profile email accounting.settings.read offline_access"]);
  const r = stub((s) => s.url === "https://identity.xero.com/connect/token" ? j({ access_token: "xero-access", expires_in: 1800, refresh_token: "xero-refresh", token_type: "Bearer" })
    : s.url === "https://api.xero.com/connections" ? j([{ tenantId: "8b7c1f2e-0a4d-4c55-9e3b-1d2f3a4b5c6d", tenantType: "ORGANISATION", tenantName: "Golden Ox Tea" }]) : j({}, 404));
  try {
    const ex = await P.exchangeCode("xero", "c1", null);
    assertEquals([r.seen[0].headers.get("authorization"), new URLSearchParams(r.seen[0].body).has("client_secret")], [`Basic ${btoa("xero-client:xero-secret")}`, false]);
    assertEquals([ex.account, ex.meta], ["Golden Ox Tea", { tenant_id: "8b7c1f2e-0a4d-4c55-9e3b-1d2f3a4b5c6d" }]);
  } finally { r.restore(); }
});

Deno.test("Dropbox Sign never signs in: it takes the business's own API key", () => {
  throws(() => P.authorizeUrl("dropbox_sign", "s"), /API key/);
  throws(() => P.creds("dropbox_sign"), /API key/);
});
