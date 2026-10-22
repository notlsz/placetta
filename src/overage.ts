/* Filings past the allowance, the Avalara pattern without its surprise bills.

   A plan's own licenses and their renewals are always included (that's what the published plans promise). Other
   filings (a sales tax return, an entity's annual report, an amendment) are priced by who has to do the work
   (approved by the founder on 2026-10-22, src/pricing.ts APPROVED):
     automated  Odelia completes it on her own (email, fax, or a portal she works, with a typed or drawn signature):
                2 a month are included for every paid location; past that, one Odelia pack at the $49 pack price
     assisted   it needs Placetta's team (a wet signature, mail, or no route Odelia can use): $199 each, no allowance,
                billed from STRIPE_PRICE_FILING_ASSISTED; without that price the team sends a quote instead
   A charge happens only when:
     1. the price was shown to an owner before the charge, and the owner approved that exact price and kind;
     2. it fits under the hard monthly cap the owner set (a new workspace's cap is $0: nothing past the allowance is ever
        charged until an owner sets one);
     3. the database reserved it under the cap in the same step (filing_charge_reserve), so two approvals at once can't
        pass the cap together.
   The billing function (supabase/functions/billing) quotes and charges with this file, and the app shows its quote.
   No imports but the price list, so Deno reads it as it is. */
import { APPROVED, PROPOSED, PUBLISHED } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type FilingKind = "license" | "renewal" | "sales_tax" | "entity" | "amendment" | "other";
export const FILING_KINDS: FilingKind[] = ["license", "renewal", "sales_tax", "entity", "amendment", "other"];
/** Always part of the plan: a location's own licenses and their renewals. */
export const IN_PLAN: FilingKind[] = ["license", "renewal"];
/** Who does the work: Odelia on her own, or Placetta's team. */
export type FilingMode = "automated" | "assisted";
export const FILING_MODES: FilingMode[] = ["automated", "assisted"];

/** How a filing goes, from its verified destination (supabase/functions/file/destinations.ts): automated when Odelia can
 *  send it herself by email, fax or a portal and the agency takes a typed or drawn signature (or the owner sends it
 *  themselves); assisted when it needs a wet signature, goes only by mail, or has no verified route at all. */
export function filingModeOf(dest: { signature?: string; email?: string; fax?: unknown; portal?: string; owner?: unknown } | null | undefined): FilingMode {
  if (!dest || dest.signature === "wet") return "assisted";
  return dest.owner || dest.email || dest.fax || dest.portal ? "automated" : "assisted";
}

export type Month = {
  /** paid locations on the plan */
  locations: number;
  /** automated filings outside the plan already made or reserved this month (charged or not) */
  used: number;
  /** cents already charged or reserved past the allowance this month */
  chargedCents: number;
  /** the owner's hard monthly cap, in cents; 0 means nothing past the allowance is charged */
  capCents: number;
  /** the pack price in cents, as Stripe has it (the existing $49 pack) */
  packCents?: number;
  /** the assisted filing price in cents, only when Stripe has exactly the approved one; else the team quotes */
  assistedCents?: number | null;
};

export type Quote =
  | { kind: "plan"; mode?: FilingMode; cents: 0; line: Bi }
  | { kind: "allowance"; mode: "automated"; cents: 0; left: number; line: Bi }
  | { kind: "charge"; mode: FilingMode; cents: number; packs: number; line: Bi; capLeftCents: number }
  | { kind: "quoted"; mode: "assisted"; cents: 0; line: Bi }
  | { kind: "blocked"; mode: FilingMode; cents: number; packs: number; reason: "no_cap" | "over_cap" | "no_plan"; line: Bi; capLeftCents: number };

/** What kind of filing an application is, from its own id and name: the entity module's (ids start with ent-), a
 *  sales tax return, an amendment, or else a license or its renewal, which the plan always includes. */
export function filingKindOf(a: { id: string; name?: { en: string } }): FilingKind {
  const n = (a.name?.en ?? "").toLowerCase();
  if (/^ent-/.test(a.id) || /statement of information|annual report|biennial statement|franchise tax report|annual list\b/.test(n)) return "entity";
  if (/\bamend(ed|ment)\b/.test(n)) return "amendment";
  if (/sales (and use )?tax return/.test(n)) return "sales_tax";
  return "license";
}

export const allowanceOf = (locations: number) => Math.max(0, Math.floor(locations)) * APPROVED.includedAutomatedPerLocationMonth;
const usd = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** The approved assisted price, in cents (what STRIPE_PRICE_FILING_ASSISTED must be). */
export const ASSISTED_CENTS = APPROVED.assistedFilingUsd * 100;

/** What one more filing of this kind costs this month, said before anything happens. */
export function quoteFiling(kind: FilingKind, m: Month, mode: FilingMode = "automated"): Quote {
  if (IN_PLAN.includes(kind)) return { kind: "plan", mode, cents: 0, line: B("Included in your plan.", "包含在您的方案中。") };
  const who = mode === "assisted"
    ? B("Placetta's team files this one (a wet signature, mail, or a portal Odelia can't work on her own)", "此次申报需由快哉团队办理（需手写签名、邮寄，或 Odelia 无法自行操作的网站）")
    : B("Odelia files this one on her own", "此次申报由 Odelia 自行完成");
  const packs = mode === "assisted" ? 0 : APPROVED.packsPerAutomatedFiling;
  const cents = mode === "assisted" ? (m.assistedCents ?? 0) : packs * (m.packCents ?? PUBLISHED.packUsd * 100);
  const what = mode === "assisted" ? B(usd(cents), usd(cents)) : B(`${usd(cents)} (${packs} Odelia pack${packs === 1 ? "" : "s"})`, `${usd(cents)}（${packs} 个 Odelia 加量包）`);
  if (m.locations < 1) return { kind: "blocked", mode, cents, packs, reason: "no_plan", capLeftCents: 0, line: B("Filings past a plan need a yearly plan first.", "方案之外的申报需要先开通年度方案。") };
  if (mode === "automated") {
    const allow = allowanceOf(m.locations);
    if (m.used < allow) {
      const left = allow - m.used;
      return { kind: "allowance", mode, cents: 0, left, line: B(`${who.en}. Included: ${left} of ${allow} automated filings outside your plan left this month.`, `${who.zh}。已包含：本月方案外自动申报额度剩余 ${left} 次（共 ${allow} 次）。`) };
    }
  } else if (!m.assistedCents) {
    return { kind: "quoted", mode, cents: 0, line: B(`${who.en}. Our team sends you a quote before filing it. Nothing is charged until you accept it.`, `${who.zh}。团队会在提交前向您报价，您接受前不会收费。`) };
  }
  const capLeftCents = Math.max(0, m.capCents - m.chargedCents);
  if (m.capCents <= 0) return { kind: "blocked", mode, cents, packs, reason: "no_cap", capLeftCents, line: B(`${who.en}. It would cost ${what.en}. Your monthly cap is $0, so nothing is charged. Set a cap in Settings to allow it.`, `${who.zh}，需 ${what.zh}。您的每月上限为 0 美元，因此不会收费。如需允许，请在设置中设定上限。`) };
  if (cents > capLeftCents) return { kind: "blocked", mode, cents, packs, reason: "over_cap", capLeftCents, line: B(`${who.en}. It would cost ${usd(cents)}, more than the ${usd(capLeftCents)} left under your ${usd(m.capCents)} monthly cap. Nothing is charged.`, `${who.zh}，需 ${usd(cents)}，超过每月上限 ${usd(m.capCents)} 的剩余额度 ${usd(capLeftCents)}，不会收费。`) };
  return { kind: "charge", mode, cents, packs, capLeftCents, line: B(`${who.en}. It costs ${what.en}, charged only when you approve. ${usd(capLeftCents - cents)} would be left under your ${usd(m.capCents)} monthly cap.`, `${who.zh}，费用为 ${what.zh}，仅在您批准后收取。批准后每月上限 ${usd(m.capCents)} 还剩 ${usd(capLeftCents - cents)}。`) };
}

/** A cap an owner may set, in whole dollars: 0 up to the most the app allows. Null for anything else. */
export function validCap(usdIn: unknown): number | null {
  const n = typeof usdIn === "number" ? usdIn : typeof usdIn === "string" && usdIn.trim() !== "" ? Number(usdIn) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > PROPOSED.maxFilingCapUsd || Math.floor(n) !== n) return null;
  return n;
}

/** The server's check on an approval: the charge is the one quoted and shown, to the cent, for the same kind of work. */
export function approvalMatches(q: Quote, shownCents: unknown, shownMode?: unknown): boolean {
  return q.kind === "charge" && typeof shownCents === "number" && shownCents === q.cents && shownMode === q.mode;
}
