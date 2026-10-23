import { CATALOG } from "../supabase/functions/_shared/stripe_catalog.ts";
import { B, type Bi } from "./bi";
import { COMPLEX_LIST, licenseTierOf, PLAN_STORE_YEAR_USD, SIMPLE } from "./pricing";
import { formById } from "./forms/registry";
import type { Store, Workspace } from "./model";
import { basisLine, openingPath } from "./smart";

/* ------------------------------------------------------------------ *
 * What it costs to open, before anyone asks. Harvey, Legora and
 * PermitFlow quote by sales call; Devin bills by credits you only see
 * afterwards. Placetta adds up three things it already knows, and says
 * plainly what it doesn't:
 *   - each permit's agency fee, only as Placetta's registry publishes it
 *     (src/forms/registry.ts). A fee the agency sets case by case, or a
 *     permit the registry doesn't have yet, is "not published", never a
 *     guess and never counted;
 *   - Placetta's own price for this business: on the simple model (every
 *     new workspace, and the sample) each permit at its list price
 *     (src/pricing.ts SIMPLE), or the chain plan; for a customer from before
 *     (legacy), the price list Stripe charges
 *     (supabase/functions/_shared/stripe_catalog.ts) and the plan in billing;
 *   - the time to open, from the opening path (src/smart.ts).
 * ------------------------------------------------------------------ */

export type FeeRow = { app: string; name: Bi; agency: Bi; fee: number | null; currency: string; why: Bi; source?: string; form?: string };
/** amount null: quoted by the team. paid: already paid, shown for the record and not added again. */
export type PriceRow = { label: Bi; amount: number | null; note: Bi; paid?: boolean };
/** The plan in billing, as the app has it (src/cloud/api.ts); nothing for the sample, which shows list prices. */
export type Billed = { plan: "none" | "entry" | "monthly" | "simple"; tier?: "essentials" | "pro"; comped?: boolean; free?: boolean; entryMarkets?: number;
  /** legacy: a customer from before the simple model, priced on its old plan; anything else is the simple model */
  model?: "legacy" | "simple";
  /** stores paid for on the store plan: 10 or more includes every new license (the chain plan) */
  paidLocations?: number };
export type Cost = {
  fees: FeeRow[];
  agencyUSD: number;          // published agency fees in US dollars, added up
  published: number;          // permits with a published fee (free ones included)
  unpublished: number;        // permits whose fee isn't published: never counted
  otherCurrencies: { currency: string; amount: number }[];   // published fees abroad, kept in their own currency
  placetta: PriceRow[];
  placettaUSD: number;
  quoted: number;             // store openings the team quotes (liquor, a major build-out)
  totalUSD: number;
  landing: string | null;     // where the permits put the opening
  basis: Bi | null;           // how that date was worked out
};

const usd = (cents: number) => Math.round(cents) / 100;
const FOOD = /tea|coffee|caf[eé]|restaurant|food|kitchen(?!ware|\s*supply)|bakery|hot ?pot|noodle|dessert|ice cream|boba|bubble|juice|\bbar\b|grill|pizza|sushi|dumpling|奶茶|茶|咖啡|餐|火锅|面|甜品|烘焙|食/i;

/** What a store is billed as, the way the database decides it (store_kind_fallback): its own kind, else food when the
 *  business sells food, else retail. */
export function storeKind(s: Store, w: Workspace): "retail" | "food" | "complex" {
  const own = (s as Store & { kind?: string }).kind;
  if (own === "retail" || own === "food" || own === "complex") return own;
  const sells = w.facts.filter(f => /what you sell|business type|cuisine|menu/i.test(f.label.en)).map(f => f.value.en).join(" ");
  return FOOD.test(`${w.business.en} ${sells}`) ? "food" : "retail";
}

/** One permit's agency fee, from the registry only. */
export function feeOf(a: Workspace["apps"][number]): FeeRow {
  const f = a.official ? formById(a.official) : undefined;
  const base = { app: a.id, name: a.name, agency: a.agency };
  if (!f) return { ...base, fee: null, currency: a.currency ?? "USD", why: B("Not in Placetta's registry yet. Odelia confirms it with the agency before you pay.", "快哉的登记库还没有收录。付款前 Odelia 会向机构确认。") };
  const form = f.form.split(" (")[0], source = f.info || f.url, currency = f.currency ?? "USD";
  if (f.fee == null) return { ...base, fee: null, currency, form, source, why: f.feeNote ?? B("The agency sets it case by case and doesn't publish one amount.", "由机构按具体情况确定，没有公布统一金额。") };
  return { ...base, fee: f.fee, currency, form, source, why: f.fee === 0 ? B("The agency charges nothing.", "机构不收费。") : B("The agency's published fee.", "机构公布的费用。") };
}

/** The cost to open for this workspace, today. */
export function costToOpen(w: Workspace, o: { today: string; billing?: Billed }): Cost {
  const fees = w.apps.map(feeOf);
  const known = fees.filter(f => f.fee != null);
  const agencyUSD = known.filter(f => f.currency === "USD").reduce((s, f) => s + f.fee!, 0);
  const other = new Map<string, number>();
  for (const f of known) if (f.currency !== "USD") other.set(f.currency, (other.get(f.currency) ?? 0) + f.fee!);

  // Placetta: the opening fee for each store still opening, and the location plan's first year for each of them
  const opening = (w.stores ?? []).filter(s => s.stage === "opening");
  const b = o.billing;
  const placetta: PriceRow[] = [];
  if (b?.comped) placetta.push({ label: B("Placetta", "快哉"), amount: 0, note: B("Your account is comped: nothing to pay.", "您的账户已免费开通，无需付费。") });
  else if (b?.free) placetta.push({ label: B("Placetta", "快哉"), amount: 0, note: B("Payments aren't switched on yet: nothing to pay for now.", "目前尚未开通付费，暂时无需付费。") });
  else if (b?.model !== "legacy") {
    // the simple model: each new license still to file at its list price (every one included with 10 or more stores on
    // the plan), and the store plan's first year when it isn't on yet
    const todo = w.apps.filter(a => a.status !== "approved");
    const onPlan = b?.plan === "monthly", stores = Math.max(1, (w.stores ?? []).length);
    if (onPlan && (b?.paidLocations ?? 0) >= SIMPLE.chainMinStores) placetta.push({ label: B("Every new license", "每一项新执照"), amount: 0, note: B(`Included: ${SIMPLE.chainMinStores} or more stores are on your store plan.`, `已包含：您的门店方案内有 ${SIMPLE.chainMinStores} 家及以上门店。`) });
    else {
      const tiers = todo.map(a => licenseTierOf(a.name.en));
      const n = (t: string) => tiers.filter(x => x === t).length;
      if (n("license")) placetta.push({ label: B(`${n("license")} license${n("license") === 1 ? "" : "s"} at $${SIMPLE.licenseUsd}`, `${n("license")} 项执照，每项 $${SIMPLE.licenseUsd}`), amount: n("license") * SIMPLE.licenseUsd,
        note: B("Each one filed and tracked to approval, charged only when you approve it.", "每项提交并跟踪至获批，经您批准才收费。") });
      if (n("complex")) placetta.push({ label: B(`${n("complex")} complex license${n("complex") === 1 ? "" : "s"} at $${SIMPLE.complexUsd}`, `${n("complex")} 项复杂执照，每项 $${SIMPLE.complexUsd}`), amount: n("complex") * SIMPLE.complexUsd,
        note: B(`${COMPLEX_LIST.map(c => c.name.en).join(", ")}. Charged only when you approve each one.`, `${COMPLEX_LIST.map(c => c.name.zh).join("、")}。每项经您批准才收费。`) });
      if (n("free")) placetta.push({ label: B(`${n("free")} tracked free`, `${n("free")} 项免费跟踪`), amount: 0, note: B("Certificates your staff earn and inspections inside a permit: Placetta tracks them at no charge.", "员工自行取得的证书和许可内的检查：快哉免费跟踪。") });
    }
    if (onPlan) placetta.push({ label: B("Store plan", "门店方案"), amount: 0, paid: true, note: B("Your plan: tracking, renewal monitoring, alerts, the document vault, Odelia, and the renewals she files on her own.", "您的方案：跟踪、续期监控、提醒、文件库、Odelia，以及她自行提交的续期。") });
    else placetta.push({ label: B(`Store plan, first year${stores > 1 ? ` for ${stores} stores` : ""}`, `门店方案首年${stores > 1 ? `（${stores} 家门店）` : ""}`), amount: PLAN_STORE_YEAR_USD * stores,
      note: B(`$${SIMPLE.planStoreMonthUsd} a store a month, billed yearly: tracking, renewal monitoring, alerts, the document vault, Odelia, and the renewals she files on her own.`, `每家门店每月 $${SIMPLE.planStoreMonthUsd}，按年计费：跟踪、续期监控、提醒、文件库、Odelia，以及她自行提交的续期。`) });
  }
  else {
    for (const s of opening) {
      const k = storeKind(s, w);
      if (k === "complex") placetta.push({ label: B(`Opening ${s.name.en}`, `${s.name.zh}开业`), amount: null, note: B("Liquor or a major build-out: the Placetta team quotes it before any work starts.", "含酒类或大型装修：开工前由快哉团队报价。") });
      else placetta.push({ label: B(`Opening ${s.name.en}`, `${s.name.zh}开业`), amount: usd(CATALOG[k].cents), note: k === "food" ? B("Every permit for a restaurant or food store, filed and tracked to approval. Paid once.", "餐饮门店的全部许可，提交并跟进至批准。一次性付费。") : B("Every permit for a retail store, filed and tracked to approval. Paid once.", "零售门店的全部许可，提交并跟进至批准。一次性付费。") });
    }
    const tier = b?.tier === "pro" ? "pro" : "essentials";
    const n = Math.max(1, opening.length);
    const year = usd(CATALOG[tier].cents), month = Math.round(year / 12);
    const name = tier === "pro" ? B("Pro", "专业版") : B("Essentials", "基础版");
    placetta.push({ label: B(`${name.en}, first year${n > 1 ? ` for ${n} locations` : ""}`, `${name.zh}首年${n > 1 ? `（${n} 家门店）` : ""}`), amount: year * n,
      note: B(`$${month} a location a month, billed yearly.${b && b.plan === "monthly" ? " Your plan." : " Needed for Placetta to file for you."}`, `每家门店每月 $${month}，按年计费。${b && b.plan === "monthly" ? "这是您当前的方案。" : "快哉代为提交时需要此方案。"}`) });
    if (b?.plan === "entry" && (b.entryMarkets ?? 0) > 0) {
      const m = b.entryMarkets!, entry = usd(CATALOG.entry.cents);
      placetta.push({ label: B(`Entry plan${m > 1 ? ` for ${m} markets` : ""}`, `开店计划${m > 1 ? `（${m} 个市场）` : ""}`), amount: entry * m, paid: true, note: B("Already paid. Credited toward the first year if the plan starts within 60 days.", "已支付。60 天内开通方案可抵扣首年费用。") });
    }
  }
  const placettaUSD = placetta.filter(r => !r.paid).reduce((s, r) => s + (r.amount ?? 0), 0);

  // the time to open: where the permits put the latest store still opening (or the plan written at sign-up)
  let landing: string | null = null, basis: Bi | null = null;
  for (const s of opening) {
    const p = openingPath(s, w, o.today);
    if (p.landing && (!landing || p.landing > landing)) { landing = p.landing; basis = basisLine(p); }
  }
  landing ??= w.firstPlan?.projectedOpen ?? null;

  return { fees, agencyUSD, published: known.length, unpublished: fees.length - known.length, otherCurrencies: [...other].map(([currency, amount]) => ({ currency, amount })),
    placetta, placettaUSD, quoted: placetta.filter(r => r.amount == null).length, totalUSD: agencyUSD + placettaUSD, landing, basis };
}
