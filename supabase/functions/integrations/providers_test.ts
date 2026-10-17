// Run: deno test -A supabase/functions/integrations/providers_test.ts
// Square's sign-in through the shared providers module, with a stand-in for fetch: the authorize link, the code
// exchange (JSON, Square-Version, expires_at), the account name, renewal, revoking, and Toast never signing in.
import { deepStrictEqual as assertEquals, ok as assert, rejects, throws } from "node:assert";

// the module reads these when it loads (a client that never connects here)
Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-for-tests");
Deno.env.set("SQUARE_CLIENT_ID", "sq0idp-TestAppId");
Deno.env.set("SQUARE_CLIENT_SECRET", "sq0csp-TestSecret");
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
  assertEquals([P.PROVIDER.square, P.PROVIDER.toast, P.isKind("square"), P.isKind("toast"), P.isKind("clover")], ["square", "toast", true, true, false]);
});
