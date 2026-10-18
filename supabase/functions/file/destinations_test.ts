// deno test supabase/functions/file/destinations_test.ts
// Every destination Placetta may send to: cited, dated, with a channel, and safe for the dispatcher and the worker to
// open (a public host, never an address or an internal name; links only on the agency's own host).
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { DEST, type Dest, destinationProblems, isPublicHost, loginMatches, onHost, TEAM_ONLY, TO_VERIFY } from "./destinations.ts";

const base = (d: Partial<Dest> = {}): Dest => ({ signature: "typed", checked: "2026-10-18", source: "https://agency.gov/apply", ...d });

Deno.test("every destination has a source page, a checked date and a channel, and passes every rule", () => {
  assertEquals(destinationProblems(), []);
  for (const [id, d] of Object.entries(DEST)) {
    assert(/^https:\/\//.test(d.source), `${id}: source`);
    assert(!!(d.email || d.fax || d.mail || d.portal || d.owner), `${id}: channel`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(d.checked), `${id}: checked`);
  }
});

Deno.test("every portal is a public host, and every link the worker starts from is on it", () => {
  for (const [id, d] of Object.entries(DEST)) {
    if (d.portal) assert(isPublicHost(d.portal), `${id}: ${d.portal}`);
    for (const h of d.alsoOn ?? []) assert(isPublicHost(h), `${id}: other host ${h}`);
    if (d.portalUrl) {
      const u = new URL(d.portalUrl);
      assertEquals(u.protocol, "https:", `${id}: https`);
      assert(onHost(u.hostname, d.portal!), `${id}: ${u.hostname} is on ${d.portal}`);
      assert(!u.username && !u.password && !u.port, `${id}: plain link`);
    }
    if (d.email) assert(isPublicHost(d.email.split("@")[1].toLowerCase()), `${id}: email domain`);
  }
});

Deno.test("the host rules refuse addresses, internal names and links off the agency's host", () => {
  for (const h of ["127.0.0.1", "10.0.0.5", "localhost", "intranet.local", "files.internal", "metadata", "x.test", "a..b.gov", "UPPER.gov"]) {
    assert(!isPublicHost(h), h);
  }
  for (const h of ["aca-prod.accela.com", "mytax.illinois.gov", "myhealthdepartment.com"]) assert(isPublicHost(h), h);
  const bad = (d: Partial<Dest>) => destinationProblems({ x: base(d) });
  assert(bad({ portal: "169.254.169.254" }).some((p) => p.includes("public host")));
  assert(bad({ portal: "agency.gov", portalUrl: "http://agency.gov/apply" }).some((p) => p.includes("plain https")));
  assert(bad({ portal: "agency.gov", portalUrl: "https://evil.example.com/agency.gov" }).some((p) => p.includes("on the portal host")));
  assert(bad({ portal: "agency.gov", portalUrl: "https://user:pw@agency.gov/" }).some((p) => p.includes("plain https")));
  assert(bad({ portal: "agency.gov", alsoOn: ["localhost"] }).some((p) => p.includes("other host")));
  assert(bad({ portalUrl: "https://agency.gov/" }).some((p) => p.includes("without a portal")));
  assert(bad({ fax: { us: "+442071234567" } }).some((p) => p.includes("US number")));
  assert(bad({ email: "not an address" }).some((p) => p.includes("email")));
  assert(bad({}).some((p) => p.includes("no destination")));
});

Deno.test("a host several agencies share needs each agency's path, and a login for one never opens another", () => {
  const shared = { a: base({ portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/dallastx" }), b: base({ portal: "aca-prod.accela.com", portalUrl: "https://aca-prod.accela.com/CFW" }) };
  assertEquals(destinationProblems(shared).filter((p) => p.includes("tenant path")).length, 2);
  // Two pages at the root of one agency's site (Sunbiz's LLC and fictitious name filings) are not two agencies.
  const oneSite = { a: base({ portal: "efile.sunbiz.org", portalUrl: "https://efile.sunbiz.org/llc_file.html" }), b: base({ portal: "efile.sunbiz.org", portalUrl: "https://efile.sunbiz.org/ficregintro.html" }) };
  assertEquals(destinationProblems(oneSite).filter((p) => p.includes("tenant path")).length, 0);
  const dallas = DEST["dal-co"], fortWorth = DEST["ftw-co"];
  assert(dallas.tenant && fortWorth.tenant && dallas.portal === fortWorth.portal);
  assert(loginMatches("https://aca-prod.accela.com/DALLASTX/Login.aspx", dallas));
  assert(!loginMatches("https://aca-prod.accela.com/DALLASTX/Login.aspx", fortWorth));
  assert(!loginMatches("https://aca-prod.accela.com.evil.example/DALLASTX", dallas));
  assert(loginMatches("www.sjpermits.org", DEST["sj-sign"]));                 // a bare host typed in the vault
  assert(!loginMatches("https://sjpermits.org.attacker.net/", DEST["sj-sign"]));
  assert(!loginMatches(null, DEST["sj-sign"]));
});

Deno.test("an owner-only form carries no channel Placetta sends on, and says why and where", () => {
  const owners = Object.entries(DEST).filter(([, d]) => d.owner);
  assert(owners.length > 5);
  for (const [id, d] of owners) {
    assert(!d.email && !d.fax && !d.mail && !d.portal, id);
    assert(d.owner!.why.length > 10 && !!(d.owner!.url || d.owner!.email || d.owner!.mail), id);
  }
  assert(destinationProblems({ x: base({ owner: { why: "Notarized in person", url: "https://agency.gov" }, email: "a@agency.gov" }) }).some((p) => p.includes("owner-only")));
  assert(destinationProblems({ x: base({ owner: { why: "In person" } }) }).some((p) => p.includes("where the owner")));
});

Deno.test("an agency that wants a signed authorization names it", () => {
  assert(destinationProblems({ x: base({ email: "a@agency.gov", onBehalf: "authorization" }) }).some((p) => p.includes("authorization")));
  for (const [id, d] of Object.entries(DEST)) if (d.onBehalf === "authorization") assert(!!d.authorization, id);
});

Deno.test("team-only and unverified forms are never sent anywhere", () => {
  for (const id of Object.keys(TO_VERIFY)) assertEquals(DEST[id], undefined, id);
  for (const [id, t] of Object.entries(TEAM_ONLY)) {
    assertEquals(DEST[id], undefined, id);
    assert(t.why.length > 10 && /^https:\/\//.test(t.source) && /^\d{4}-\d{2}-\d{2}$/.test(t.checked), id);
  }
});

Deno.test("a fee that goes with the filing is recorded, and payment is one of the known kinds", () => {
  assert(destinationProblems({ x: base({ email: "a@agency.gov", payment: "cash" as never }) }).some((p) => p.includes("payment")));
  assertEquals(DEST["sdg-business-tax"].payment, "with_filing");
  assertEquals(DEST["scc-plan-check"].payment, "invoice");
});
