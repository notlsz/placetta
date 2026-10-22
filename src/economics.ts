/* What it costs Placetta to deliver what it sells, and the limits that keep it from losing money: the inputs to
   docs/UNIT-ECONOMICS.md (scripts/econ/measure.ts measures the AI side from the requests Placetta builds and prices it
   here) and the guardrails the server reads (supabase/functions/_shared/ai_gate.ts, the margin watch in migration
   20261025090000_margin_guard.sql, the online grader in src/qa/grade.ts).

   Three kinds of number, each labelled where it is:
     VENDOR     a list price read from the vendor's own page, with the page and the day it was read
     ASSUME     an estimate of how customers and the team behave. FOUNDER TO CONFIRM. Each says where it came from
     GUARDRAIL  a limit that protects margin. FOUNDER TO CONFIRM. None blocks a filing already in motion
   Nothing here is a price Placetta charges (those are in src/pricing.ts and never change from here).

   No imports: the Deno functions read this file as it is. */

export type Cited = { usd: number; per: string; source: string; read: string };
const READ = "2026-10-22";

/** List prices, read from each vendor's own page (or, where marked, a page that quotes it). */
export const VENDOR = {
  // Stripe: https://stripe.com/pricing as quoted by https://flexprice.io/blog/stripe-pricing-breakdown-2026 (read 2026-10-22)
  stripeCardPct: { usd: 0.029, per: "of each card payment", source: "https://stripe.com/pricing", read: READ } as Cited,
  stripeCardFixed: { usd: 0.30, per: "card payment", source: "https://stripe.com/pricing", read: READ } as Cited,
  stripeBillingPct: { usd: 0.007, per: "of subscription billing volume", source: "https://stripe.com/pricing", read: READ } as Cited,
  stripeAchPct: { usd: 0.008, per: "of an ACH debit, capped at $5", source: "https://stripe.com/pricing", read: READ } as Cited,
  stripeAchCap: { usd: 5, per: "ACH debit", source: "https://stripe.com/pricing", read: READ } as Cited,
  // Telnyx: https://telnyx.com/pricing.md (read 2026-10-22)
  faxPage: { usd: 0.007, per: "fax page sent", source: "https://telnyx.com/pricing", read: READ } as Cited,
  smsMessage: { usd: 0.004, per: "SMS sent, from", source: "https://telnyx.com/pricing", read: READ } as Cited,
  smsCarrier: { usd: 0.012, per: "SMS, highest 10DLC carrier fee listed (T-Mobile)", source: "https://telnyx.com/pricing", read: READ } as Cited,
  phoneNumberMonth: { usd: 1, per: "US number a month", source: "https://telnyx.com/pricing", read: READ } as Cited,
  // Lob, Startup plan, effective 2026-07-12: https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details
  letter: { usd: 0.89, per: "black and white first class letter", source: "https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details", read: READ } as Cited,
  letterPage: { usd: 0.09, per: "additional page", source: "https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details", read: READ } as Cited,
  certified: { usd: 6.95, per: "certified mail", source: "https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details", read: READ } as Cited,
  // Browserbase: https://docs.browserbase.com/account/plans
  browserbasePlan: { usd: 99, per: "month, Startup, 500 browser hours", source: "https://docs.browserbase.com/account/plans", read: READ } as Cited,
  browserHour: { usd: 0.10, per: "browser hour past the plan's", source: "https://docs.browserbase.com/account/plans", read: READ } as Cited,
  // hosting
  supabasePro: { usd: 25, per: "month, Pro organization", source: "https://supabase.com/pricing (quoted by jetadmin.io, July 2026)", read: READ } as Cited,
  vercelPro: { usd: 20, per: "month, Pro platform fee with one seat", source: "https://vercel.com/docs/plans/pro-plan", read: READ } as Cited,
  renderWorker: { usd: 7, per: "month, 0.5 CPU and 512 MB (the filer worker)", source: "https://render.com/pricing", read: READ } as Cited,
  resendPro: { usd: 20, per: "month, 50,000 emails", source: "https://resend.com/pricing", read: READ } as Cited,
} as const;

/** Model prices are in supabase/functions/_shared/ai_cost.ts (Anthropic and Gemini read from their pages on 2026-10-22). */

/** Fixed platform cost a month, before the first customer: hosting, email, the fax number, the filer's browser. */
export const fixedMonthUsd = () =>
  VENDOR.supabasePro.usd + VENDOR.vercelPro.usd + VENDOR.renderWorker.usd + VENDOR.resendPro.usd + VENDOR.phoneNumberMonth.usd + VENDOR.browserbasePlan.usd;

/** Estimates of how customers and the team behave. FOUNDER TO CONFIRM, every one. */
export const ASSUME = {
  /** FOUNDER TO CONFIRM. Loaded cost of an hour of Placetta's team (docs/PRICING.md, "Team time"). */
  teamHourUsd: 60,
  /** FOUNDER TO CONFIRM. Chat turns a store's people send Odelia in a month: a normal store, a heavy one. No production
   *  data yet; 20 is one question every working day or so. */
  chatTurnsPerStoreMonth: 20,
  heavyChatTurnsPerStoreMonth: 200,
  /** FOUNDER TO CONFIRM. The monitor's weekly rule check per store (role watch, with web research on Haiku). Its cost
   *  isn't measurable offline (web search results come from Anthropic): docs/AI_COSTS.md budgets about $0.11 a check. */
  watchRunsPerStoreMonth: 4,
  watchRunUsd: 0.11,
  /** FOUNDER TO CONFIRM. Texts a store gets a month (deadline and renewal alerts). */
  smsPerStoreMonth: 4,
  /** FOUNDER TO CONFIRM. Pages a faxed or mailed filing has (a filled form plus a cover page). */
  pagesPerFiling: 4,
  /** FOUNDER TO CONFIRM. A portal filing: the worker's browser time and its model steps (the worker stops at 80). */
  portalBrowserMinutes: 10,
  portalSteps: 30,
  /** FOUNDER TO CONFIRM. Team minutes per filing, by how it goes (docs/PRICING.md's estimates: half an hour on a new
   *  license, five hours on a complex one, half an hour on a renewal the team sends). The first 10 filings of each form
   *  wait for a two-key review (FILER_TWO_KEY). */
  teamMinutes: { automated: 5, twoKeyReview: 10, team: 45, owner: 15, complex: 300, renewalAutomated: 5, renewalTeam: 30 },
  /** FOUNDER TO CONFIRM. Renewals a store files a year, and the share Odelia can send on her own: both measured by
   *  scripts/econ/measure.ts from the registry and the destinations, so these are only the fallback when it can't. */
  renewalsPerStoreYear: 6,
  /** FOUNDER TO CONFIRM. Thinking tokens a Gemini 3 call adds. Gemini 3 always thinks and bills it as output; the
   *  offline fixtures can't measure it. The first live eval should (ai_events now records it). */
  thinkingTokensPerCall: 0,
} as const;

/* ------------------------------------------------------------------ the store ceiling (founder, 2026-10-22) */

/** The most AI and running cost one store on the $149 store plan may cost Placetta in a month, so the plan leaves about
 *  $100. Set by the founder; the soft line is where Odelia moves to saver mode. */
export const MAX_COST_PER_STORE_MONTH_USD = 50;
export const SOFT_COST_PER_STORE_MONTH_USD = 35;

/** A store's running cost a month that isn't AI: Stripe on its yearly plan invoice (by card, the dearer way), its
 *  alert texts, and the delivery of the renewals Odelia sends on her own (about 2 a year: fax pages, the filer's
 *  browser and model, scripts/econ/measure.ts). Team minutes are not in it: they are funded by the $299, $999 and $99
 *  fees (docs/UNIT-ECONOMICS.md, "The $50 ceiling"). */
export function runningCostPerStoreMonth(): number {
  const stripe = stripeFee(149 * 12, "subscription_card") / 12;
  const sms = ASSUME.smsPerStoreMonth * (VENDOR.smsMessage.usd + VENDOR.smsCarrier.usd);
  const ownRenewals = (2 / 12) * (ASSUME.portalSteps * 0.0041 + (ASSUME.portalBrowserMinutes / 60) * VENDOR.browserHour.usd + ASSUME.pagesPerFiling * VENDOR.faxPage.usd);
  return Math.round((stripe + sms + ownRenewals) * 100) / 100;
}
/** What's left of the ceiling for AI: the store plan's hard AI allowance a store, and where saver mode starts. These
 *  are the numbers in ai_rules() (store_plan_month, store_plan_soft); agent-test checks they agree. */
export const storeAiBudget = () => ({
  hard: Math.floor(MAX_COST_PER_STORE_MONTH_USD - runningCostPerStoreMonth()),
  soft: Math.floor(SOFT_COST_PER_STORE_MONTH_USD - runningCostPerStoreMonth()),
});

/** Limits that protect margin. FOUNDER TO CONFIRM, every one. None stops a filing already approved or in motion: the
 *  gate refuses new Odelia work only, and filings, deadlines and reminders carry on (ai_gate.ts refusal text). */
export const GUARDRAIL = {
  /** FOUNDER TO CONFIRM. A workspace whose AI cost this month is more than this share of its plan revenue this month
   *  opens a staff alert (the margin watch): about $15 a store, well before the $44 hard AI allowance, so staff see a
   *  pattern while it is still cheap. */
  aiShareOfRevenueAlert: 0.10,
  /** FOUNDER TO CONFIRM. A workspace with no revenue this month (the free plan preview) alerts past this many dollars. */
  aiNoRevenueAlertUsd: 5,
  /** FOUNDER TO CONFIRM. Team minutes on one filing past its budget (ASSUME.teamMinutes for its kind) by this factor
   *  open a staff alert. */
  teamOverBudgetFactor: 1.5,
  /** FOUNDER TO CONFIRM. The share of finished runs the online grader checks (no model: plain checks, so it costs nothing). */
  graderSampleRate: 0.2,
  /** FOUNDER TO CONFIRM. A source page whose proof was read longer ago than this is re-checked first by the sweeper. */
  sweepStaleDays: 90,
} as const;

/** The online grader's share of runs, for the server (src/server/agent-entry.ts). */
export const GRADER_SAMPLE_RATE = GUARDRAIL.graderSampleRate;

/** What a payment costs in Stripe fees: a card, or a yearly subscription invoice paid by card or by ACH. */
export function stripeFee(amountUsd: number, how: "card" | "subscription_card" | "subscription_ach" = "card"): number {
  const card = amountUsd * VENDOR.stripeCardPct.usd + VENDOR.stripeCardFixed.usd;
  const ach = Math.min(amountUsd * VENDOR.stripeAchPct.usd, VENDOR.stripeAchCap.usd);
  const billing = how === "card" ? 0 : amountUsd * VENDOR.stripeBillingPct.usd;
  return Math.round(((how === "subscription_ach" ? ach : card) + billing) * 100) / 100;
}

/** Team cost of some minutes. */
export const teamUsd = (minutes: number) => Math.round((minutes / 60) * ASSUME.teamHourUsd * 100) / 100;

/** The staff alert rule for AI cost against revenue: true when the month's AI cost is past the share (or, with no
 *  revenue, past the dollar line). Read by the margin watch's tests so the SQL and this agree. */
export function aiCostAlert(costUsd: number, revenueUsd: number): boolean {
  if (revenueUsd <= 0) return costUsd > GUARDRAIL.aiNoRevenueAlertUsd;
  return costUsd > revenueUsd * GUARDRAIL.aiShareOfRevenueAlert;
}

/** The kinds of filing work the team budget is kept for. */
export type TeamKind = keyof typeof ASSUME.teamMinutes;
/** True when a filing's team minutes are past its budget by the guardrail's factor. */
export const teamOverBudget = (minutes: number, kind: TeamKind) => minutes > ASSUME.teamMinutes[kind] * GUARDRAIL.teamOverBudgetFactor;
