/* Filings past the allowance, the Avalara pattern without its surprise bills.

   A plan's own licenses and their renewals are always included (that's what the published plans promise). Other
   filings (a sales tax return, an entity's annual report, an amendment) come out of a monthly allowance for every paid
   location. Past it, each filing costs Odelia packs at the existing pack price, and only when:
     1. the price was shown to an owner before the charge, and the owner approved that exact price;
     2. it fits under the hard monthly cap the owner set (a new workspace's cap is $0: nothing past the allowance is ever
        charged until an owner sets one);
     3. the database reserved it under the cap in the same step (filing_charge_reserve), so two approvals at once can't
        pass the cap together.
   The billing function (supabase/functions/billing) and the app both decide with this file. No imports but the price
   list, so Deno reads it as it is. */
import { PROPOSED, PUBLISHED } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type FilingKind = "license" | "renewal" | "sales_tax" | "entity" | "amendment" | "other";
export const FILING_KINDS: FilingKind[] = ["license", "renewal", "sales_tax", "entity", "amendment", "other"];
/** Always part of the plan: a location's own licenses and their renewals. */
export const IN_PLAN: FilingKind[] = ["license", "renewal"];

export type Month = {
  /** paid locations on the plan */
  locations: number;
  /** filings outside the plan already made or reserved this month (charged or not) */
  used: number;
  /** cents already charged or reserved past the allowance this month */
  chargedCents: number;
  /** the owner's hard monthly cap, in cents; 0 means nothing past the allowance is charged */
  capCents: number;
  /** the pack price in cents, as Stripe has it (the existing $49 pack) */
  packCents?: number;
};

export type Quote =
  | { kind: "plan"; cents: 0; line: Bi }
  | { kind: "allowance"; cents: 0; left: number; line: Bi }
  | { kind: "charge"; cents: number; packs: number; line: Bi; capLeftCents: number }
  | { kind: "blocked"; cents: number; packs: number; reason: "no_cap" | "over_cap" | "no_plan"; line: Bi; capLeftCents: number };

/** What kind of filing an application is, from its own id and name: the entity module's (ids start with ent-), a
 *  sales tax return, an amendment, or else a license or its renewal, which the plan always includes. */
export function filingKindOf(a: { id: string; name?: { en: string } }): FilingKind {
  const n = (a.name?.en ?? "").toLowerCase();
  if (/^ent-/.test(a.id) || /statement of information|annual report|biennial statement|franchise tax report|annual list\b/.test(n)) return "entity";
  if (/\bamend(ed|ment)\b/.test(n)) return "amendment";
  if (/sales (and use )?tax return/.test(n)) return "sales_tax";
  return "license";
}

export const allowanceOf =(locations: number) => Math.max(0, Math.floor(locations)) * PROPOSED.extraFilingsPerLocationMonth;
const usd = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** What one more filing of this kind costs this month, said before anything happens. */
export function quoteFiling(kind: FilingKind, m: Month): Quote {
  if (IN_PLAN.includes(kind)) return { kind: "plan", cents: 0, line: B("Included in your plan.", "包含在您的方案中。") };
  if (m.locations < 1) {
    const packs = PROPOSED.packsPerExtraFiling, cents = packs * (m.packCents ?? PUBLISHED.packUsd * 100);
    return { kind: "blocked", cents, packs, reason: "no_plan", capLeftCents: 0, line: B("Filings past a plan need a yearly plan first.", "方案之外的申报需要先开通年度方案。") };
  }
  const allow = allowanceOf(m.locations);
  if (m.used < allow) {
    const left = allow - m.used;
    return { kind: "allowance", cents: 0, left, line: B(`Included: ${left} of ${allow} this month's filings outside your plan left.`, `已包含：本月方案外申报额度剩余 ${left} 次（共 ${allow} 次）。`) };
  }
  const packs = PROPOSED.packsPerExtraFiling, cents = packs * (m.packCents ?? PUBLISHED.packUsd * 100);
  const capLeftCents = Math.max(0, m.capCents - m.chargedCents);
  if (m.capCents <= 0) return { kind: "blocked", cents, packs, reason: "no_cap", capLeftCents, line: B(`This filing would cost ${usd(cents)} (${packs} Odelia pack${packs === 1 ? "" : "s"}). Your monthly cap is $0, so nothing is charged. Set a cap in Settings to allow it.`, `此次申报需 ${usd(cents)}（${packs} 个 Odelia 加量包）。您的每月上限为 0 美元，因此不会收费。如需允许，请在设置中设定上限。`) };
  if (cents > capLeftCents) return { kind: "blocked", cents, packs, reason: "over_cap", capLeftCents, line: B(`This filing would cost ${usd(cents)}, more than the ${usd(capLeftCents)} left under your ${usd(m.capCents)} monthly cap. Nothing is charged.`, `此次申报需 ${usd(cents)}，超过每月上限 ${usd(m.capCents)} 的剩余额度 ${usd(capLeftCents)}，不会收费。`) };
  return { kind: "charge", cents, packs, capLeftCents, line: B(`This filing costs ${usd(cents)} (${packs} Odelia pack${packs === 1 ? "" : "s"}), charged only when you approve. ${usd(capLeftCents - cents)} would be left under your ${usd(m.capCents)} monthly cap.`, `此次申报费用为 ${usd(cents)}（${packs} 个 Odelia 加量包），仅在您批准后收取。批准后每月上限 ${usd(m.capCents)} 还剩 ${usd(capLeftCents - cents)}。`) };
}

/** A cap an owner may set, in whole dollars: 0 up to the most the app allows. Null for anything else. */
export function validCap(usdIn: unknown): number | null {
  const n = typeof usdIn === "number" ? usdIn : typeof usdIn === "string" && usdIn.trim() !== "" ? Number(usdIn) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > PROPOSED.maxFilingCapUsd || Math.floor(n) !== n) return null;
  return n;
}

/** The server's check on an approval: the charge is the one quoted and shown, to the cent. */
export function approvalMatches(q: Quote, shownCents: unknown): boolean {
  return q.kind === "charge" && typeof shownCents === "number" && shownCents === q.cents;
}
