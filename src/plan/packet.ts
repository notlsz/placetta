/* One filing-ready packet for a multi-market entry: every market's plan built side by side from the registry (the same
   previewPlan the instant plan and the MCP server use), the steps the markets share filed once, a company formed in the
   first market registered in each other state, every row cited to its agency page with the date that page was read,
   and the totals: the fees agencies publish (by currency, never guessed), the ones they don't, and Placetta's price.
   No model is called: a 4-city entry is one tool call instead of four searches. Pure. */
import { B, type Bi } from "../bi";
import type { Application, Level } from "../model";
import { formsFor, formById, segmentOf } from "../forms/registry";
import { licenseTierOf, PLAN_STORE_YEAR_USD, SIMPLE, tierUsd } from "../pricing";
import { previewPlan, stateAgency, stateOf } from "./preview";
import { proofCurrent } from "./ask";
import { daysFromNow } from "../time";

export type PacketRow = {
  id: string;                 // the registry form, or the plan row's id when the library has no form
  name: Bi; agency: Bi; level: Level;
  fee: number | null;         // what the agency publishes; null when it doesn't (never guessed)
  currency: string;
  source: string;             // the agency's page
  read: string | null;        // the day that page was read
  claim: boolean;             // false: who to ask, not a stated requirement
  tier: "license" | "complex" | "free";
};
export type PacketMarket = { place: string; country: string; opening: string | null; rows: PacketRow[]; foreign?: PacketRow };
export type Packet = {
  business: string;
  markets: PacketMarket[];
  shared: (PacketRow & { markets: string[] })[];   // filed once for the whole entry (an EIN, a federal registration)
  fees: { currency: string; published: number }[];
  unpublished: number;                              // rows whose fee the agency doesn't publish
  placetta: { licenses: number; complex: number; free: number; usd: number; storePlanYearUsd: number };
  formedIn: string | null;                          // where the company is formed, when it's new
};

const CUR: Record<string, string> = { US: "USD", MX: "MXN", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", GB: "GBP", CN: "CNY", CA: "CAD" };
const rowOf = (a: Application, country: string): PacketRow => {
  const f = a.official ? formById(a.official) : undefined;
  const t = licenseTierOf(a.name.en);
  return {
    id: a.official ?? a.id.replace(/^pv-/, ""), name: a.name, agency: a.agency, level: a.level,
    fee: f ? f.fee ?? null : null, currency: f?.currency ?? CUR[country] ?? "USD",
    source: a.source?.url || f?.info || f?.url || "", read: a.source?.checked ?? null, claim: !a.abstain,
    tier: t === "renewal" ? "license" : t,
  };
};

/** The packet for opening `what` in each of `places` (2 to 12), each by `opening` (YYYY-MM-DD) when given. entity: the
 *  company, when it exists already; otherwise it's formed in the first US market and registered in each other state. */
export function entryPacket(what: string, places: string[], o: { opening?: string; entity?: string; today?: string } = {}): Packet {
  const list = [...new Set(places.map(p => p.trim()).filter(Boolean))].slice(0, 12);
  const firstUs = list.find(p => !!stateOf(p));
  const formState = !o.entity?.trim() && firstUs ? stateOf(firstUs)! : null;
  const seen = new Map<string, PacketRow & { markets: string[] }>();
  const markets: PacketMarket[] = list.map((place, k) => {
    const st = stateOf(place);
    // the company is formed once, in the first US market; every other market plans as an existing company
    const entity = o.entity?.trim() || (place === firstUs ? "" : "the company formed for this entry");
    const p = previewPlan(what, place, o.opening, { today: o.today, entity, storeId: `m${k + 1}` });
    const rows: PacketRow[] = [];
    for (const a of p.apps) {
      const r = rowOf(a, p.country);
      // federal and national steps the markets share are filed once (an EIN, FDA's registration, a customs bond)
      if (a.level === "federal" && a.official && p.country === "US") {
        const had = seen.get(r.id);
        if (had) { had.markets.push(place); continue; }
        seen.set(r.id, { ...r, markets: [place] });
        continue;
      }
      rows.push(r);
    }
    // a company formed in one state that opens in another registers there as a foreign company: the registry's form
    // when it has one, else who to ask (the state's own business registration office), never a guessed form
    let foreign: PacketRow | undefined;
    if (formState && st && st !== formState) {
      const f = formsFor({ segment: segmentOf(what), where: place, needs: { foreignEntity: true } }).find(x => x.level === "state" && x.where === st);
      const ag = stateAgency(st);
      // stated only with a current quote from its page, as find_official_forms does; otherwise who to ask
      const read = f ? proofCurrent(f.proof, o.today ?? daysFromNow(0)) ?? null : null;
      foreign = f
        ? { id: f.id, name: f.title, agency: f.agency, level: "state", fee: f.fee ?? null, currency: "USD", source: f.info || f.url, read, claim: !!read, tier: licenseTierOf(f.title.en) === "complex" ? "complex" : "license" }
        : { id: `foreign-${st.toLowerCase()}`, name: B(`Register the company to do business in ${ag?.state ?? st} (foreign qualification)`, `在${ag?.stateZh ?? st}登记为外州公司`), agency: B(ag?.en ?? `${st} Secretary of State`, ag?.zh ?? `${st}州务卿`), level: "state",
          fee: null, currency: "USD", source: ag?.url ?? "", read: null, claim: false, tier: "license" };
    }
    return { place, country: p.country, opening: p.projectedOpen, rows, ...(foreign ? { foreign } : {}) };
  });
  const shared = [...seen.values()];
  const all = [...shared, ...markets.flatMap(m => [...m.rows, ...(m.foreign ? [m.foreign] : [])])];
  const fees = new Map<string, number>();
  for (const r of all) if (r.fee != null) fees.set(r.currency, Math.round(((fees.get(r.currency) ?? 0) + r.fee) * 100) / 100);
  const n = (t: PacketRow["tier"]) => all.filter(r => r.tier === t).length;
  return {
    business: what, markets, shared,
    fees: [...fees].map(([currency, published]) => ({ currency, published })),
    unpublished: all.filter(r => r.fee == null).length,
    placetta: { licenses: n("license"), complex: n("complex"), free: n("free"), usd: n("license") * tierUsd("license") + n("complex") * tierUsd("complex"), storePlanYearUsd: PLAN_STORE_YEAR_USD * markets.length },
    formedIn: formState,
  };
}

/** The packet as Odelia reads it: compact, one line a step, in the person's language. */
export function packetForModel(p: Packet, lang: "en" | "zh") {
  const line = (r: PacketRow) => [r.id, r.name[lang], r.agency[lang], r.fee == null ? (lang === "zh" ? "费用未公布" : "fee not published") : `${r.fee} ${r.currency}`, r.source, r.read ? `read ${r.read}` : "", r.claim ? "" : (lang === "zh" ? "需向该机构确认" : "confirm with this agency")].filter(Boolean).join(" | ");
  return {
    formed_in: p.formedIn,
    shared_once: p.shared.map(r => `${line(r)} | for ${r.markets.join("; ")}`),
    markets: p.markets.map(m => ({ place: m.place, country: m.country, permits_in_hand_around: m.opening, steps: m.rows.map(line), ...(m.foreign ? { register_as_foreign_company: line(m.foreign) } : {}) })),
    agency_fees_published: p.fees, fees_not_published: p.unpublished,
    placetta_price: { new_licenses: p.placetta.licenses, complex: p.placetta.complex, tracked_free: p.placetta.free, licenses_usd: p.placetta.usd, store_plan_first_year_usd: p.placetta.storePlanYearUsd,
      note: `$${SIMPLE.licenseUsd} a license, $${SIMPLE.complexUsd} a complex one, each charged only when approved; $${SIMPLE.planStoreMonthUsd} a store a month on the store plan.` },
    note: "Every step is from Placetta's registry with its agency page and the day it was read. A fee the agency doesn't publish stays open: never estimate it. Steps marked confirm aren't stated requirements: say who decides. Prepare each market's applications with prepare_application and that market's store_id.",
  };
}
