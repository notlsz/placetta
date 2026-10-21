// deno test -A supabase/functions/sso/logic_test.ts
// Domain verification reads the TXT record over DNS-over-HTTPS and never trusts anything but the exact token; status
// reports what Supabase Auth has turned on, and says "couldn't check" rather than guess.
import { deepStrictEqual as assertEquals } from "node:assert";
import { authStatus, lookupTxt, txtValues, verifyTxt } from "./logic.ts";

const TOKEN = "placetta-verify=0123456789abcdef0123456789abcdef";
const doh = (records: string[], status = 0) => ({ Status: status, Answer: records.map((data) => ({ name: "_placetta-verify.acme.com", type: 16, TTL: 300, data })) });
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

Deno.test("TXT values: quotes stripped, split strings joined, other record types ignored", () => {
  assertEquals(txtValues(doh([`"${TOKEN}"`, '"v=spf1 " "include:_spf.google.com ~all"'])), [TOKEN, "v=spf1 include:_spf.google.com ~all"]);
  assertEquals(txtValues({ Status: 0, Answer: [{ type: 5, data: "cname.example." }] }), []);
  assertEquals(txtValues({ Status: 3 }), []);
  assertEquals(txtValues(null), []);
});

Deno.test("verify: the exact token verifies; a near miss doesn't, and what was found is shown", async () => {
  const seen: string[] = [];
  const f = ((u: string) => { seen.push(u); return respond(doh([`"${TOKEN}"`])); }) as typeof fetch;
  assertEquals(await verifyTxt("_placetta-verify.acme.com", TOKEN, f), { verified: true });
  assertEquals(seen[0], "https://cloudflare-dns.com/dns-query?name=_placetta-verify.acme.com&type=TXT");
  const near = (() => respond(doh([`"${TOKEN}x"`, '"placetta-verify=other"']))) as typeof fetch;
  assertEquals(await verifyTxt("_placetta-verify.acme.com", TOKEN, near), { verified: false, reason: "not_found", found: [`${TOKEN}x`, "placetta-verify=other"] });
  const nx = (() => respond({ Status: 3 })) as typeof fetch;
  assertEquals(await verifyTxt("_placetta-verify.acme.com", TOKEN, nx), { verified: false, reason: "not_found", found: [] });
});

Deno.test("lookup: falls back to Google when Cloudflare fails; null when neither answers", async () => {
  const f = ((u: string) => (u.startsWith("https://cloudflare") ? Promise.reject(new Error("down")) : respond(doh([`"${TOKEN}"`])))) as typeof fetch;
  assertEquals(await lookupTxt("_placetta-verify.acme.com", f), [TOKEN]);
  const servfail = (() => respond({ Status: 2 })) as typeof fetch;
  assertEquals(await lookupTxt("_placetta-verify.acme.com", servfail), null);
  assertEquals(await verifyTxt("x", TOKEN, servfail), { verified: false, reason: "dns_unavailable", found: [] });
});

Deno.test("status: what Supabase Auth reports, and whether a SAML provider covers the domain", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const f = ((u: string, init?: RequestInit) => {
    calls.push({ url: u, auth: new Headers(init?.headers).get("authorization") });
    if (u.endsWith("/auth/v1/settings")) return respond({ external: { google: true, azure: false, email: true }, saml_enabled: true });
    return respond({ items: [{ id: "p1", domains: [{ domain: "ACME.com" }] }] });
  }) as typeof fetch;
  assertEquals(await authStatus("https://x.supabase.co", "anon", "service", "acme.com", f),
    { saml_enabled: true, providers: { google: true, azure: false, email: true }, saml_registered: true });
  assertEquals(calls[1], { url: "https://x.supabase.co/auth/v1/admin/sso/providers", auth: "Bearer service" });
  assertEquals((await authStatus("https://x.supabase.co", "anon", "service", "other.com", f)).saml_registered, false);
});

Deno.test("status: SAML off means nothing is registered; an unreadable answer is unknown, never yes", async () => {
  const off = ((u: string) => (u.endsWith("/settings") ? respond({ external: {}, saml_enabled: false }) : respond({ items: [{ domains: [{ domain: "acme.com" }] }] }))) as typeof fetch;
  assertEquals(await authStatus("https://x", "a", "s", "acme.com", off), { saml_enabled: false, providers: {}, saml_registered: false });
  const broken = (() => respond({ message: "nope" }, 500)) as typeof fetch;
  assertEquals(await authStatus("https://x", "a", "s", "acme.com", broken), { saml_enabled: null, providers: null, saml_registered: null });
});
