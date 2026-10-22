/* Modules: what a plan grows by, the way Vanta adds frameworks to one contract. Each one is added from Plans or
   Settings and goes through the existing billing function (action add_module): billed from its own Stripe price when
   STRIPE_PRICE_MODULE_<ID> is set, else quoted by the team. No module has a public price (src/pricing.ts
   MODULE_PRICES: FOUNDER TO CONFIRM). No imports but the price list, so the billing function reads it as it is. */
import { MODULE_PRICES } from "./pricing.ts";

type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

export type ModuleId = "entity" | "sales_tax" | "alcohol" | "imports" | "abroad" | "security";
export type Module = { id: ModuleId; name: Bi; does: Bi; env: string; ready: Bi };

export const MODULES: Module[] = [
  { id: "entity", env: "STRIPE_PRICE_MODULE_ENTITY", name: B("Entity compliance", "实体合规"),
    does: B("Annual reports and statements of information for each legal entity in each state it's registered in, on the calendar and filed with your approval.", "每个法律实体在其登记的每个州的年报和信息声明，加入日历，经您批准后提交。"),
    ready: B("Ready now", "现已可用") },
  { id: "sales_tax", env: "STRIPE_PRICE_MODULE_SALES_TAX", name: B("Sales tax returns", "销售税申报"),
    does: B("Registration in each state where you sell, and the returns on their due dates.", "在每个销售所在州登记，并按期申报。"), ready: B("Ready now", "现已可用") },
  { id: "alcohol", env: "STRIPE_PRICE_MODULE_ALCOHOL", name: B("Alcohol", "酒类"),
    does: B("State and local liquor licenses, the federal registration, and their renewals.", "州和地方酒牌、联邦登记及其续期。"), ready: B("Quoted by our team", "由团队报价") },
  { id: "imports", env: "STRIPE_PRICE_MODULE_IMPORTS", name: B("Imports and customs", "进口与海关"),
    does: B("The customs bond, importer filings and FDA prior notice, with a licensed broker where the law requires one.", "海关担保、进口申报与 FDA 预先通知；法律要求时由持牌报关行办理。"), ready: B("Quoted by our team", "由团队报价") },
  { id: "abroad", env: "STRIPE_PRICE_MODULE_ABROAD", name: B("Europe and Mexico", "欧洲与墨西哥"),
    does: B("Licenses, registrations and renewals for stores in Europe and Mexico, with a local notary or gestor where only they may file.", "欧洲和墨西哥门店的执照、登记和续期；仅限当地公证人或代办人提交的，由其办理。"), ready: B("Quoted by our team", "由团队报价") },
  { id: "security", env: "STRIPE_PRICE_MODULE_SECURITY", name: B("Enterprise security", "企业安全"),
    does: B("Single sign-on, SCIM, audit export and a security review for your vendor process.", "单点登录、SCIM、审计记录导出，以及配合您供应商审核的安全评估。"), ready: B("Quoted by our team", "由团队报价") },
];

export const moduleById = (id: unknown): Module | undefined => MODULES.find(m => m.id === id);
/** A module's yearly price per location when the founder confirmed one; null means the team quotes it. */
export const modulePrice = (id: ModuleId): number | null => MODULE_PRICES[id] ?? null;

export type ModuleState = "on" | "requested" | "off";
/** Where each module stands for a workspace: on (billed), requested (waiting for the team's quote), or off. */
export function moduleStates(on: string[], requested: string[]): Record<ModuleId, ModuleState> {
  return Object.fromEntries(MODULES.map(m => [m.id, on.includes(m.id) ? "on" : requested.includes(m.id) ? "requested" : "off"])) as Record<ModuleId, ModuleState>;
}

/** What adding a module does, said before the owner confirms. */
export function addLine(m: Module, billed: boolean): Bi {
  return billed
    ? B(`${m.name.en} is added to your yearly plan. Stripe shows the prorated amount on your next invoice before it's charged.`, `${m.name.zh}将加入您的年度方案。Stripe 会在下一张账单上列出按比例计算的金额，然后再收费。`)
    : B(`Our team sends you a quote for ${m.name.en}. Nothing is charged until you accept it.`, `团队会就${m.name.zh}向您报价。您接受报价前不会收费。`);
}
