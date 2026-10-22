/* Modules: what a plan grows by, the way Vanta adds frameworks to one contract. Each one is added from Plans or
   Settings and goes through the billing function (module_quote, then add_module with the price the owner saw).

   Prices are approved (src/pricing.ts MODULE_PRICES) and each counts its own unit, from the workspace's own facts:
     entity      a legal entity in each state it's registered in, a year
     sales_tax   each US state a store is in, a month, billed yearly
     alcohol     each location marked as holding a liquor license, a month, billed yearly
     imports     the importing company, a month, billed yearly (its customs broker still files the entries)
     abroad      each new country, one time, on the next invoice; the stores there pay the usual location price, and
                 notary and government fees are passed through at cost
     security    the company, a month, billed yearly
   A module is billed only from STRIPE_PRICE_MODULE_<ID>, and only when Stripe's amount is exactly the one here; else
   the team sends a quote and nothing is charged. Owners only, never on the landing page.

   Imports only the price list and the state names, so the billing function (Deno) prices with this same file. */
import { MODULE_PRICES, moduleStripeCents, type ModulePrice, type ModuleUnit } from "./pricing.ts";
import { stateCode } from "./counties.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type ModuleId = "entity" | "sales_tax" | "alcohol" | "imports" | "abroad" | "security";
export type Module = { id: ModuleId; name: Bi; does: Bi; env: string };

export const MODULES: Module[] = [
  { id: "entity", env: "STRIPE_PRICE_MODULE_ENTITY", name: B("Entity compliance", "实体合规"),
    does: B("Annual reports and statements of information for each legal entity in each state it's registered in, on the calendar and filed with your approval.", "每个法律实体在其登记的每个州的年报和信息声明，加入日历，经您批准后提交。") },
  { id: "sales_tax", env: "STRIPE_PRICE_MODULE_SALES_TAX", name: B("Sales tax returns", "销售税申报"),
    does: B("Registration in each state where you sell, and the returns on their due dates.", "在每个销售所在州登记，并按期申报。") },
  { id: "alcohol", env: "STRIPE_PRICE_MODULE_ALCOHOL", name: B("Alcohol", "酒类"),
    does: B("State and local liquor licenses, the federal registration, and their renewals.", "州和地方酒牌、联邦登记及其续期。") },
  { id: "imports", env: "STRIPE_PRICE_MODULE_IMPORTS", name: B("Imports and customs", "进口与海关"),
    does: B("The customs bond, importer filings and FDA prior notice. Your licensed customs broker still files each entry.", "海关担保、进口申报与 FDA 预先通知。每票报关仍由您的持牌报关行提交。") },
  { id: "abroad", env: "STRIPE_PRICE_MODULE_ABROAD", name: B("Europe and Mexico", "欧洲与墨西哥"),
    does: B("Licenses, registrations and renewals for stores in Europe and Mexico, with a local notary or gestor where only they may file. Their fees and government fees are passed through at cost.", "欧洲和墨西哥门店的执照、登记和续期；仅限当地公证人或代办人提交的，由其办理。其费用和政府规费按实际金额转付。") },
  { id: "security", env: "STRIPE_PRICE_MODULE_SECURITY", name: B("Enterprise security", "企业安全"),
    does: B("Single sign-on, SCIM, audit export and roles, and a security review for your vendor process.", "单点登录、SCIM、审计记录导出和角色权限，以及配合您供应商审核的安全评估。") },
];

export const moduleById = (id: unknown): Module | undefined => MODULES.find(m => m.id === id);
export const modulePrice = (id: ModuleId): ModulePrice => MODULE_PRICES[id];

/* ------------------------------------------------------------------ prices, said with their units */

const money = (cents: number) => "$" + (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });

/** One unit, said in a count: "1 state", "3 states". */
export function unitCount(unit: ModuleUnit, n: number): Bi {
  const one = n === 1;
  switch (unit) {
    case "entity_state": return B(`${n} ${one ? "entity registration" : "entity registrations"} (an entity in one state)`, `${n} 个实体登记（一个实体在一个州）`);
    case "state": return B(`${n} ${one ? "state" : "states"}`, `${n} 个州`);
    case "licensed_location": return B(`${n} licensed ${one ? "location" : "locations"}`, `${n} 家持酒牌门店`);
    case "company": return B(`${n} ${one ? "company" : "companies"}`, `${n} 家公司`);
    case "country": return B(`${n} new ${one ? "country" : "countries"}`, `${n} 个新国家`);
  }
}

/** A module's price with its unit, as owners see it: "$49 a state a month, billed yearly". */
export function priceLabel(id: ModuleId): Bi {
  const p = MODULE_PRICES[id], $ = money(p.usd * 100);
  switch (id) {
    case "entity": return B(`${$} a legal entity in each state it's registered in, a year`, `每个法律实体在每个登记州每年 ${$}`);
    case "sales_tax": return B(`${$} a state a month, billed yearly`, `每州每月 ${$}，按年计费`);
    case "alcohol": return B(`${$} a licensed location a month, billed yearly`, `每家持酒牌门店每月 ${$}，按年计费`);
    case "imports": return B(`${$} a month for the importing company, billed yearly. Your customs broker's own fees are separate.`, `进口公司每月 ${$}，按年计费。报关行自身费用另计。`);
    case "abroad": return B(`${$} one time for each new country, plus the usual price for each location there. Notary and government fees at cost.`, `每个新国家一次性 ${$}，当地每家门店另按常规价格计费。公证和政府规费按实际金额收取。`);
    case "security": return B(`${$} a month for the company, billed yearly`, `每家公司每月 ${$}，按年计费`);
  }
}

/* ------------------------------------------------------------------ the workspace's own facts */

const US = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "));

/** Where a store is, from the end of its address: a US state ("…, San Jose, CA 95112", "…, Texas 78701") or, for a
 *  store abroad, its two-letter country code ("…, Madrid, ES"). Empty when the address doesn't say. */
export function placeOf(address: string | undefined): { state?: string; country?: string } {
  const a = (address ?? "").trim().replace(/,?\s*(USA|U\.S\.A\.|United States)\s*$/i, "");
  const zip = /,\s*([A-Za-z .]+?)\s+\d{5}(?:-\d{4})?\s*$/.exec(a);
  if (zip) { const s = stateCode(zip[1]); if (s) return { state: s }; }
  const tail = /,\s*([A-Za-z .]+?)\s*$/.exec(a);
  if (!tail) return {};
  const s = stateCode(tail[1]);
  if (s && US.has(s)) return { state: s };
  return /^[A-Z]{2}$/.test(tail[1]) ? { country: tail[1] } : {};
}

type StoreIn = { id: string; address?: string; liquor?: boolean };
type EntityIn = { id: string; registrations?: { state: string }[] };
/** What each module counts, read from the workspace (the app's copy or the server's saved one; both are the same JSON). */
export type ModuleFacts = { entityStates: string[]; salesTaxStates: string[]; licensedLocations: string[]; countries: string[] };

export function moduleFactsOf(state: { stores?: StoreIn[] | null; entities?: EntityIn[] | null } | null | undefined): ModuleFacts {
  const stores = Array.isArray(state?.stores) ? state!.stores!.filter(s => s && typeof s.id === "string").slice(0, 2000) : [];
  const entities = Array.isArray(state?.entities) ? state!.entities!.filter(e => e && typeof e.id === "string").slice(0, 500) : [];
  const places = stores.map(s => placeOf(typeof s.address === "string" ? s.address : ""));
  const uniq = (xs: string[]) => [...new Set(xs)].sort();
  return {
    entityStates: uniq(entities.flatMap(e => (Array.isArray(e.registrations) ? e.registrations : []).map(r => stateCode(String(r?.state ?? ""))).filter(Boolean).map(st => `${e.id}:${st}`))),
    salesTaxStates: uniq(places.map(p => p.state ?? "").filter(Boolean)),
    licensedLocations: uniq(stores.filter(s => s.liquor === true).map(s => s.id)),
    countries: uniq(places.map(p => p.country ?? "").filter(Boolean)),
  };
}

/** How many units a module bills, from the facts. abroad counts only countries not charged before. */
export function moduleQuantity(id: ModuleId, f: ModuleFacts, chargedCountries: string[] = []): number {
  switch (id) {
    case "entity": return f.entityStates.length;
    case "sales_tax": return f.salesTaxStates.length;
    case "alcohol": return f.licensedLocations.length;
    case "imports": case "security": return 1;
    case "abroad": return f.countries.filter(c => !chargedCountries.includes(c)).length;
  }
}

/** What to add first when there's nothing to count yet. */
const FIRST: Record<ModuleId, Bi> = {
  entity: B("Add your legal entities and the states each is registered in under Entities first.", "请先在“法律实体”中添加实体及其登记的州。"),
  sales_tax: B("Add a store with its full address first, so the state is known.", "请先添加门店及其完整地址，以便确定所在州。"),
  alcohol: B("Mark which stores hold a liquor license first.", "请先标出哪些门店持有酒牌。"),
  imports: B("", ""), security: B("", ""),
  abroad: B("Every country your stores are in is already on your plan. A store in a new country shows here.", "您门店所在的国家都已在方案中。新国家的门店会显示在这里。"),
};

/* ------------------------------------------------------------------ the quote */

export type ModuleQuote = {
  id: ModuleId; unit: ModuleUnit; per: ModulePrice["per"];
  qty: number;                  // units billed after this change
  had: number;                  // units billed before it (0 when the module is new)
  unitCents: number;            // one unit of the Stripe price: a year, or one time
  periodCents: number;          // qty × unitCents: each year's charge, or the one-time charge
  dueNowCents: number;          // what this change charges now (prorated to the renewal for a yearly price), from Stripe
  billed: boolean;              // false: the team sends a quote, nothing is charged
  reason?: "no_price" | "no_plan" | "nothing_to_count" | "no_change";
  line: Bi;
};

/** The quote for adding a module (or changing how many units it bills), said before the owner approves. dueNowCents
 *  comes from Stripe's own preview of the change, so the amount shown is the amount charged, to the cent. */
export function moduleQuote(id: ModuleId, x: { qty: number; had?: number; priceOk: boolean; subscribed: boolean; dueNowCents?: number; renews?: string | null }): ModuleQuote {
  const p = MODULE_PRICES[id], unitCents = moduleStripeCents(p), qty = Math.max(0, Math.floor(x.qty)), had = Math.max(0, Math.floor(x.had ?? 0));
  const base = { id, unit: p.unit, per: p.per, qty, had, unitCents, periodCents: qty * unitCents, dueNowCents: 0 };
  const name = moduleById(id)!.name, price = priceLabel(id);
  if (!x.priceOk) return { ...base, billed: false, reason: "no_price", line: B(`${price.en}. Our team sends you a quote for ${name.en}. Nothing is charged until you accept it.`, `${price.zh}。团队会就${name.zh}向您报价。您接受报价前不会收费。`) };
  if (!x.subscribed) return { ...base, billed: false, reason: "no_plan", line: B(`${price.en}. Modules add to a yearly plan: start one first.`, `${price.zh}。模块需加在年度方案上，请先开通方案。`) };
  if (qty === 0 && had === 0) return { ...base, billed: false, reason: "nothing_to_count", line: B(`${price.en}. ${FIRST[id].en}`, `${price.zh}。${FIRST[id].zh}`) };
  if (p.per !== "once" && qty === had) return { ...base, billed: false, reason: "no_change", line: B(`${unitCount(p.unit, qty).en} on your plan, ${money(qty * unitCents)} a year.`, `方案中已有${unitCount(p.unit, qty).zh}，每年 ${money(qty * unitCents)}。`) };
  const count = unitCount(p.unit, qty), now = x.dueNowCents ?? 0;
  if (p.per === "once") {
    return { ...base, dueNowCents: qty * unitCents, billed: true,
      line: B(`${count.en} × ${money(unitCents)} = ${money(qty * unitCents)}, one time, on your next invoice. Each location there pays the usual location price. Notary and government fees are passed through at cost.`,
        `${count.zh} × ${money(unitCents)} = ${money(qty * unitCents)}，一次性，计入下一张账单。当地每家门店按常规门店价格计费。公证和政府规费按实际金额转付。`) };
  }
  const yearly = B(`${count.en} × ${money(unitCents)} a year = ${money(qty * unitCents)} a year`, `${count.zh} × 每年 ${money(unitCents)} = 每年 ${money(qty * unitCents)}`);
  const until = x.renews ? B(` until your renewal on ${x.renews}`, `（至 ${x.renews} 续费日）`) : B("", "");
  const today = now > 0 ? B(`${money(now)} is charged now for the rest of this term${until.en}, when you approve.`, `批准后立即收取本期剩余部分${until.zh}的 ${money(now)}。`)
    : now < 0 ? B(`${money(now)} comes off your next invoice for the rest of this term${until.en}.`, `本期剩余部分${until.zh}的 ${money(now)} 将从下一张账单中扣除。`)
    : B("Nothing more is charged this term.", "本期不再另外收费。");
  return { ...base, dueNowCents: now, billed: true, line: B(`${yearly.en}. ${today.en}`, `${yearly.zh}。${today.zh}`) };
}

/** A year of every recurring module on the plan, in cents, from the units each bills (billing.module_qty). */
export function modulesYearCents(qty: Record<string, number> | null | undefined): number {
  return MODULES.reduce((sum, m) => {
    const p = MODULE_PRICES[m.id], n = Math.max(0, Math.floor(Number(qty?.[m.id]) || 0));
    return p.per === "once" ? sum : sum + n * moduleStripeCents(p);
  }, 0);
}

export type ModuleState = "on" | "requested" | "off";
/** Where each module stands for a workspace: on (billed), requested (waiting for the team's quote), or off. */
export function moduleStates(on: string[], requested: string[]): Record<ModuleId, ModuleState> {
  return Object.fromEntries(MODULES.map(m => [m.id, on.includes(m.id) ? "on" : requested.includes(m.id) ? "requested" : "off"])) as Record<ModuleId, ModuleState>;
}
