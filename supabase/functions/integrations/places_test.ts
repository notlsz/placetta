// Run: deno test -A supabase/functions/integrations/places_test.ts
// Store locations from Google Business Profile, Clover, Shopify and Square, and the company's profile from Xero, read
// against recorded answers shaped like each API's documented response: what is asked, and what comes back.
import { deepStrictEqual as assertEquals, ok as assert, rejects } from "node:assert";
import { cloverPlaces, GBP_READ_MASK, gbpPlace, gbpPlaces, placeLine, SHOPIFY_LOCATIONS, shopifyPlaces, squarePlaces, xeroProfile } from "./places.ts";
import { type Call, PosError } from "./pos.ts";

type Seen = { url: string; method: string; headers: Headers; body: Record<string, unknown> | null };
function api(routes: [(s: Seen) => boolean, (s: Seen) => unknown | Response][]) {
  const seen: Seen[] = [];
  const call = (async (u: string, init?: RequestInit) => {
    const s: Seen = { url: String(u), method: init?.method ?? "GET", headers: new Headers(init?.headers), body: init?.body ? JSON.parse(String(init.body)) : null };
    seen.push(s);
    const r = routes.find(([t]) => t(s));
    if (!r) return new Response("{}", { status: 404 });
    const out = r[1](s);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as Call;
  return { call, seen };
}

const GBP = "https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations";

Deno.test("Google Business Profile: every managed location, paged, with address, phone and hours; no storefront, no store", async () => {
  const { call, seen } = api([
    [(s) => s.url.startsWith(GBP) && !new URL(s.url).searchParams.has("pageToken"), () => ({ locations: [
      { name: "locations/111", title: "Golden Ox Tea Flushing", storefrontAddress: { regionCode: "US", postalCode: "11354", administrativeArea: "NY", locality: "Flushing", addressLines: ["136-20 Roosevelt Ave", "Suite 2"] },
        phoneNumbers: { primaryPhone: "+1 718-555-0100" }, regularHours: { periods: [{ openDay: "MONDAY", openTime: "09:00", closeDay: "MONDAY", closeTime: "21:00" }, { openDay: "FRIDAY", openTime: { hours: 10 }, closeDay: "SATURDAY", closeTime: { hours: 1, minutes: 30 } }] } },
      { name: "locations/222", title: "Catering only", phoneNumbers: { primaryPhone: "+1 718-555-0101" } },
    ], nextPageToken: "p2" })],
    [(s) => s.url.startsWith(GBP) && new URL(s.url).searchParams.get("pageToken") === "p2", () => ({ locations: [
      { name: "locations/333", title: "Golden Ox Tea Irvine", storefrontAddress: { regionCode: "US", postalCode: "92618", administrativeArea: "CA", locality: "Irvine", addressLines: ["4250 Barranca Pkwy"] } },
    ] })],
  ]);
  const places = await gbpPlaces(call);
  const q = new URL(seen[0].url).searchParams;
  assertEquals([q.get("readMask"), q.get("pageSize"), seen.length], [GBP_READ_MASK, "100", 2]);
  assertEquals(places, [
    { source: "Google Business Profile", id: "locations/111", name: "Golden Ox Tea Flushing", address: { line1: "136-20 Roosevelt Ave", line2: "Suite 2", city: "Flushing", state: "NY", zip: "11354", country: "US" },
      phone: "+1 718-555-0100", hours: ["MONDAY 09:00-21:00", "FRIDAY-SATURDAY 10:00-01:30"] },
    { source: "Google Business Profile", id: "locations/333", name: "Golden Ox Tea Irvine", address: { line1: "4250 Barranca Pkwy", city: "Irvine", state: "CA", zip: "92618", country: "US" } },
  ]);
  assertEquals(gbpPlace({ title: "x" }), null);
  assertEquals(placeLine(places[0]), "Golden Ox Tea Flushing: 136-20 Roosevelt Ave, Suite 2, Flushing, NY 11354 (Google Business Profile)");
});

Deno.test("Google Business Profile: a refused or rate-limited read says so in both languages", async () => {
  const { call } = api([[() => true, () => new Response("{}", { status: 403 })]]);
  await rejects(gbpPlaces(call), (e: unknown) => e instanceof PosError && e.code === "forbidden" && /Reconnect Google Business Profile/.test(e.message) && !!e.zh);
  const busy = api([[() => true, () => new Response("{}", { status: 429 })]]);
  await rejects(gbpPlaces(busy.call), (e: unknown) => e instanceof PosError && e.code === "rate_limited");
});

Deno.test("Clover: the merchant and its address, expanded", async () => {
  const { call, seen } = api([[(s) => s.url === "https://api.clover.com/v3/merchants/MX12AB?expand=address", () => ({
    id: "MX12AB", name: "Golden Ox Tea", phoneNumber: "7185550100", address: { address1: "136-20 Roosevelt Ave", address2: "", address3: "Unit 3", city: "Flushing", state: "NY", zip: "11354", country: "US" } })]]);
  assertEquals(await cloverPlaces(call, "https://api.clover.com", "MX12AB"), [
    { source: "Clover", id: "MX12AB", name: "Golden Ox Tea", address: { line1: "136-20 Roosevelt Ave", line2: "Unit 3", city: "Flushing", state: "NY", zip: "11354", country: "US" }, phone: "7185550100" }]);
  assertEquals(seen.length, 1);
  const none = api([[() => true, () => ({ id: "MX12AB", name: "No address yet" })]]);
  assertEquals(await cloverPlaces(none.call, "https://api.clover.com", "MX12AB"), []);
});

Deno.test("Shopify: active locations over the GraphQL Admin API, paged by cursor", async () => {
  const URL_ = "https://golden-ox.myshopify.com/admin/api/2026-10/graphql.json";
  const { call, seen } = api([
    [(s) => s.url === URL_ && (s.body?.variables as { after: string | null } | undefined)?.after === null, () => ({ data: { locations: { nodes: [
      { id: "gid://shopify/Location/1", name: "Flushing", isActive: true, address: { address1: "136-20 Roosevelt Ave", address2: null, city: "Flushing", provinceCode: "NY", zip: "11354", countryCode: "US", phone: "+17185550100" } },
      { id: "gid://shopify/Location/2", name: "Closed pop-up", isActive: false, address: { address1: "1 Main St", city: "Queens", provinceCode: "NY", zip: "11101", countryCode: "US" } },
    ], pageInfo: { hasNextPage: true, endCursor: "c1" } } } })],
    [(s) => s.url === URL_ && (s.body?.variables as { after: string | null }).after === "c1", () => ({ data: { locations: { nodes: [
      { id: "gid://shopify/Location/3", name: "Warehouse", isActive: true, address: { address1: "50 Industry Rd", city: "Secaucus", provinceCode: "NJ", zip: "07094", countryCode: "US" } },
    ], pageInfo: { hasNextPage: false, endCursor: null } } } })],
  ]);
  const places = await shopifyPlaces(call, "golden-ox.myshopify.com", "2026-10");
  assertEquals([seen.length, seen[0].method, seen[0].body?.query, seen[0].headers.get("content-type")], [2, "POST", SHOPIFY_LOCATIONS, "application/json"]);
  assertEquals(places.map((p) => [p.name, p.address.city, p.address.state, p.phone ?? null]), [["Flushing", "Flushing", "NY", "+17185550100"], ["Warehouse", "Secaucus", "NJ", null]]);
  const bad = api([[() => true, () => ({ errors: [{ message: "Access denied for locations field." }] })]]);
  await rejects(shopifyPlaces(bad.call, "golden-ox.myshopify.com", "2026-10"), (e: unknown) => e instanceof PosError && e.code === "graphql");
});

Deno.test("Square: active locations with their full address and phone, on the pinned version", async () => {
  const { call, seen } = api([[(s) => s.url === "https://connect.squareup.com/v2/locations", () => ({ locations: [
    { id: "L1", name: "Flushing", status: "ACTIVE", phone_number: "+1 718-555-0100", address: { address_line_1: "136-20 Roosevelt Ave", address_line_2: "Suite 2", locality: "Flushing", administrative_district_level_1: "NY", postal_code: "11354", country: "US" } },
    { id: "L2", name: "Old", status: "INACTIVE", address: { locality: "Queens" } },
    { id: "L3", name: "Online only", status: "ACTIVE" },
  ] })]]);
  const places = await squarePlaces(call, "https://connect.squareup.com", "2026-09-16");
  assertEquals(seen[0].headers.get("square-version"), "2026-09-16");
  assertEquals(places, [{ source: "Square", id: "L1", name: "Flushing", address: { line1: "136-20 Roosevelt Ave", line2: "Suite 2", city: "Flushing", state: "NY", zip: "11354", country: "US" }, phone: "+1 718-555-0100" }]);
});

Deno.test("Xero: the organisation's legal name, addresses, phone and numbers, for the tenant asked", async () => {
  const T = "8b7c1f2e-0a4d-4c55-9e3b-1d2f3a4b5c6d";
  const { call, seen } = api([[(s) => s.url === "https://api.xero.com/api.xro/2.0/Organisation", () => ({ Organisations: [{
    Name: "Golden Ox Tea", LegalName: "Golden Ox Tea LLC", OrganisationType: "COMPANY", CountryCode: "US", TaxNumber: "88-1234471",
    Addresses: [{ AddressType: "POBOX", AddressLine1: "PO Box 12", City: "San Jose", Region: "CA", PostalCode: "95113", Country: "USA" }, { AddressType: "STREET", AddressLine1: "100 N First St", AddressLine2: "Floor 2", City: "San Jose", Region: "CA", PostalCode: "95113", Country: "USA" }, { AddressType: "STREET" }],
    Phones: [{ PhoneType: "MOBILE", PhoneNumber: "5550000" }, { PhoneType: "OFFICE", PhoneNumber: "555-0142", PhoneAreaCode: "408", PhoneCountryCode: "1" }],
  }] })]]);
  const p = await xeroProfile(call, T);
  assertEquals(seen[0].headers.get("xero-tenant-id"), T);
  assertEquals(p, { source: "Xero", name: "Golden Ox Tea", legal_name: "Golden Ox Tea LLC", type: "COMPANY", country: "US", tax_number: "88-1234471",
    addresses: [{ kind: "pobox", line1: "PO Box 12", city: "San Jose", state: "CA", zip: "95113", country: "USA" }, { kind: "street", line1: "100 N First St", line2: "Floor 2", city: "San Jose", state: "CA", zip: "95113", country: "USA" }],
    phone: "+1 408 555-0142" });
  const empty = api([[() => true, () => ({ Organisations: [] })]]);
  await rejects(xeroProfile(empty.call, T), (e: unknown) => e instanceof PosError && e.status === 404);
  assert(true);
});
