// Store locations and the company's own profile from the apps a business already keeps them in, read only, so Odelia
// can add stores and fill the address, phone and hours lines on a form from the business's own record instead of
// asking for them again:
//   Google Business Profile  every location the sign-in manages, with its storefront address, phone and regular hours
//                            GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations?readMask=...
//                            (https://developers.google.com/my-business/content/location-data)
//   Clover                   the merchant and its address: GET /v3/merchants/{mId}?expand=address
//                            (https://docs.clover.com/dev/reference/merchants)
//   Shopify                  the store's locations through the GraphQL Admin API, the token in X-Shopify-Access-Token
//                            (https://shopify.dev/docs/api/admin-graphql; REST's /locations.json is legacy since 2024-10)
//   Square                   ListLocations, already used for sales (pos.ts)
//   Xero                     the organisation's legal name, addresses, phone and tax and registration numbers:
//                            GET https://api.xero.com/api.xro/2.0/Organisation with xero-tenant-id
// Field names not shown on a page this pass could read are marked "to confirm" in SETUP.md
// (Integrations); a field that's missing is left out, never guessed. Free of the database and of Deno.env, so it's
// tested with recorded answers (places_test.ts).
import { type Call, PosError } from "./pos.ts";

export type Place = {
  source: "Google Business Profile" | "Clover" | "Shopify" | "Square";
  id: string;
  name: string;
  address: { line1: string; line2?: string; city: string; state: string; zip: string; country: string };
  phone?: string;
  /** Regular hours, one line a period: "MONDAY 09:00-17:00". */
  hours?: string[];
};

export type CompanyProfile = {
  source: "Xero";
  name: string;
  legal_name?: string;
  type?: string;
  country?: string;
  tax_number?: string;
  registration_number?: string;
  addresses: { kind: string; line1: string; line2?: string; city: string; state: string; zip: string; country: string }[];
  phone?: string;
};

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const MAX = 200;

async function getJson<T>(call: Call, url: string, app: string, init: RequestInit = {}): Promise<T> {
  const res = await call(url, { ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    if (res.status === 403) throw new PosError(403, "forbidden", `${app} refused (missing permission). Reconnect ${app} in Settings.`, `${app} 拒绝了请求（缺少权限）。请在设置中重新连接 ${app}。`);
    if (res.status === 429) throw new PosError(429, "rate_limited", `${app} is busy. Try again in a minute.`, `${app} 正忙，请一分钟后再试。`);
    throw new PosError(res.status, String(res.status), `${app} returned an error (${res.status}).`, `${app} 返回错误（${res.status}）。`);
  }
  return j;
}

/* ------------------------------------------------------------------ Google Business Profile */

type GbpLocation = {
  name?: string; title?: string;
  storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string; postalCode?: string; regionCode?: string };
  phoneNumbers?: { primaryPhone?: string };
  regularHours?: { periods?: { openDay?: string; closeDay?: string; openTime?: unknown; closeTime?: unknown }[] };
};
export const GBP_READ_MASK = "name,title,storefrontAddress,phoneNumbers,regularHours";

/** A time as the API gives it: "09:00", or {hours, minutes} (a missing part is 0). */
const hhmm = (t: unknown): string => {
  if (typeof t === "string") return t;
  if (t && typeof t === "object") { const o = t as { hours?: number; minutes?: number }; return `${String(o.hours ?? 0).padStart(2, "0")}:${String(o.minutes ?? 0).padStart(2, "0")}`; }
  return "";
};

export function gbpPlace(l: GbpLocation): Place | null {
  const a = l.storefrontAddress;
  if (!a || !s(a.locality)) return null;   // a service-area business with no storefront has no store address to file
  const lines = (a.addressLines ?? []).map(s).filter(Boolean);
  const hours = (l.regularHours?.periods ?? []).map((p) => `${s(p.openDay)}${p.closeDay && p.closeDay !== p.openDay ? "-" + s(p.closeDay) : ""} ${hhmm(p.openTime)}-${hhmm(p.closeTime)}`).filter((h) => !h.startsWith(" "));
  return {
    source: "Google Business Profile", id: s(l.name), name: s(l.title),
    address: { line1: lines[0] ?? "", ...(lines.length > 1 ? { line2: lines.slice(1).join(", ") } : {}), city: s(a.locality), state: s(a.administrativeArea), zip: s(a.postalCode), country: s(a.regionCode) },
    ...(s(l.phoneNumbers?.primaryPhone) ? { phone: s(l.phoneNumbers?.primaryPhone) } : {}),
    ...(hours.length ? { hours } : {}),
  };
}

/** Every location the sign-in manages ("-" includes those managed through a group), paged, at most MAX. */
export async function gbpPlaces(call: Call, maxPages = 3): Promise<Place[]> {
  const out: Place[] = [];
  let token = "";
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({ readMask: GBP_READ_MASK, pageSize: "100", ...(token ? { pageToken: token } : {}) });
    const j = await getJson<{ locations?: GbpLocation[]; nextPageToken?: string }>(call, `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations?${q}`, "Google Business Profile");
    for (const l of j.locations ?? []) { const p = gbpPlace(l); if (p) out.push(p); }
    token = s(j.nextPageToken);
    if (!token || out.length >= MAX) break;
  }
  return out.slice(0, MAX);
}

/* ------------------------------------------------------------------ Clover */

type CloverMerchant = { id?: string; name?: string; phoneNumber?: string; address?: { address1?: string; address2?: string; address3?: string; city?: string; state?: string; zip?: string; country?: string } };

export async function cloverPlaces(call: Call, api: string, merchant: string): Promise<Place[]> {
  const m = await getJson<CloverMerchant>(call, `${api}/v3/merchants/${encodeURIComponent(merchant)}?expand=address`, "Clover");
  const a = m.address;
  if (!a || !s(a.city)) return [];
  const line2 = [a.address2, a.address3].map(s).filter(Boolean).join(", ");
  return [{ source: "Clover", id: s(m.id) || merchant, name: s(m.name),
    address: { line1: s(a.address1), ...(line2 ? { line2 } : {}), city: s(a.city), state: s(a.state), zip: s(a.zip), country: s(a.country) },
    ...(s(m.phoneNumber) ? { phone: s(m.phoneNumber) } : {}) }];
}

/* ------------------------------------------------------------------ Shopify */

export const SHOPIFY_LOCATIONS = `query Locations($after: String) { locations(first: 100, after: $after) { nodes { id name isActive address { address1 address2 city provinceCode zip countryCode phone } } pageInfo { hasNextPage endCursor } } }`;
type ShopifyReply = { data?: { locations?: { nodes?: ShopifyLocation[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string } } }; errors?: unknown[] };
type ShopifyLocation = { id?: string; name?: string; isActive?: boolean; address?: { address1?: string; address2?: string; city?: string; provinceCode?: string; zip?: string; countryCode?: string; phone?: string } };

export async function shopifyPlaces(call: Call, shop: string, version: string, maxPages = 2): Promise<Place[]> {
  const out: Place[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const j: ShopifyReply = await getJson<ShopifyReply>(
      call, `https://${shop}/admin/api/${version}/graphql.json`, "Shopify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: SHOPIFY_LOCATIONS, variables: { after } }) });
    if (Array.isArray(j.errors) && j.errors.length) throw new PosError(400, "graphql", "Shopify didn't return the locations. Reconnect Shopify in Settings.", "Shopify 没有返回门店。请在设置中重新连接 Shopify。");
    for (const l of j.data?.locations?.nodes ?? []) {
      const a = l.address;
      if (l.isActive === false || !a || !s(a.city)) continue;
      out.push({ source: "Shopify", id: s(l.id), name: s(l.name),
        address: { line1: s(a.address1), ...(s(a.address2) ? { line2: s(a.address2) } : {}), city: s(a.city), state: s(a.provinceCode), zip: s(a.zip), country: s(a.countryCode) },
        ...(s(a.phone) ? { phone: s(a.phone) } : {}) });
    }
    const info: { hasNextPage?: boolean; endCursor?: string } | undefined = j.data?.locations?.pageInfo;
    if (!info?.hasNextPage || !info.endCursor || out.length >= MAX) break;
    after = info.endCursor;
  }
  return out.slice(0, MAX);
}

/* ------------------------------------------------------------------ Square */

type SqLoc = { id?: string; name?: string; status?: string; phone_number?: string; address?: { address_line_1?: string; address_line_2?: string; locality?: string; administrative_district_level_1?: string; postal_code?: string; country?: string } };

export async function squarePlaces(call: Call, base: string, version: string): Promise<Place[]> {
  const j = await getJson<{ locations?: SqLoc[] }>(call, `${base}/v2/locations`, "Square", { headers: { "Square-Version": version } });
  return (j.locations ?? []).filter((l) => l.status !== "INACTIVE" && s(l.address?.locality)).slice(0, MAX).map((l) => ({
    source: "Square" as const, id: s(l.id), name: s(l.name),
    address: { line1: s(l.address?.address_line_1), ...(s(l.address?.address_line_2) ? { line2: s(l.address?.address_line_2) } : {}), city: s(l.address?.locality), state: s(l.address?.administrative_district_level_1), zip: s(l.address?.postal_code), country: s(l.address?.country) },
    ...(s(l.phone_number) ? { phone: s(l.phone_number) } : {}) }));
}

/* ------------------------------------------------------------------ Xero */

type XeroOrg = {
  Name?: string; LegalName?: string; OrganisationType?: string; CountryCode?: string; TaxNumber?: string; RegistrationNumber?: string;
  Addresses?: { AddressType?: string; AddressLine1?: string; AddressLine2?: string; City?: string; Region?: string; PostalCode?: string; Country?: string }[];
  Phones?: { PhoneType?: string; PhoneNumber?: string; PhoneAreaCode?: string; PhoneCountryCode?: string }[];
};

export async function xeroProfile(call: Call, tenant: string): Promise<CompanyProfile> {
  const j = await getJson<{ Organisations?: XeroOrg[] }>(call, "https://api.xero.com/api.xro/2.0/Organisation", "Xero", { headers: { "xero-tenant-id": tenant } });
  const o = j.Organisations?.[0];
  if (!o) throw new PosError(404, "not_found", "Xero returned no organisation. Reconnect Xero in Settings.", "Xero 没有返回组织信息。请在设置中重新连接 Xero。");
  const phone = (o.Phones ?? []).find((p) => s(p.PhoneNumber) && (p.PhoneType === "OFFICE" || p.PhoneType === "DEFAULT")) ?? (o.Phones ?? []).find((p) => s(p.PhoneNumber));
  return {
    source: "Xero", name: s(o.Name),
    ...(s(o.LegalName) ? { legal_name: s(o.LegalName) } : {}), ...(s(o.OrganisationType) ? { type: s(o.OrganisationType) } : {}), ...(s(o.CountryCode) ? { country: s(o.CountryCode) } : {}),
    ...(s(o.TaxNumber) ? { tax_number: s(o.TaxNumber) } : {}), ...(s(o.RegistrationNumber) ? { registration_number: s(o.RegistrationNumber) } : {}),
    addresses: (o.Addresses ?? []).filter((a) => s(a.AddressLine1) || s(a.City)).map((a) => ({ kind: s(a.AddressType).toLowerCase() || "address", line1: s(a.AddressLine1), ...(s(a.AddressLine2) ? { line2: s(a.AddressLine2) } : {}), city: s(a.City), state: s(a.Region), zip: s(a.PostalCode), country: s(a.Country) })),
    ...(phone ? { phone: [s(phone.PhoneCountryCode) ? "+" + s(phone.PhoneCountryCode) : "", s(phone.PhoneAreaCode), s(phone.PhoneNumber)].filter(Boolean).join(" ") } : {}),
  };
}

/** One line a place, for a person or a model: "Flushing: 136-20 Roosevelt Ave, Flushing, NY 11354 (Square)". */
export const placeLine = (p: Place) => `${p.name || p.address.city}: ${[p.address.line1, p.address.line2, p.address.city, [p.address.state, p.address.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")} (${p.source})`;
