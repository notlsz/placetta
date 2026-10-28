// The intake: the few yes-or-no questions that decide what a plan holds beyond the permits to open (src/forms/lifecycle.ts),
// asked one at a time after the first line, and only those that apply. A question the words already answer ("furniture
// importer", "sells online") or that can't matter for this kind of business (a restaurant doesn't manufacture products,
// a dresser brand isn't asked about upholstery once it said "dressers") is skipped. Pure: the first screen
// (src/cloud/Root.tsx) asks them and passes the answers to the instant plan (src/plan/start.ts, src/plan/preview.ts).
import { B, type Bi } from "../bi";
import { isFurniture } from "../forms/furniture";
import { productNeeds, sellsCleaning } from "../forms/states/products";
import { segmentOf } from "../forms/registry";
import { childrensProducts, makesProducts, sellsCosmetics, sellsOnline } from "./also";
import { dealsInFood, imports, ownedAbroad } from "./preview";

export type IntakeKey = "employees" | "manufactures" | "imports" | "upholstered" | "children" | "online" | "antimicrobial" | "foreignOwned";
export type Intake = Partial<Record<IntakeKey, boolean>>;
export type IntakeQuestion = { key: IntakeKey; q: Bi; hint: Bi };

const UPHOLSTERY_NAMED = /\bupholster(y|ed)\b|\bsofas?\b|\bcouch(es)?\b|\bsectionals?\b|\brecliners?\b|\bloveseats?\b|\barmchairs?\b|沙发|软体/i;
const CASE_GOODS_ONLY = /\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bcase[- ]?goods\b|\bcabinets?\b|\bbookcases?\b|\bdesks?\b|\bnightstands?\b|衣柜|斗柜/i;

const Q: Record<IntakeKey, { q: Bi; hint: Bi }> = {
  employees: { q: B("Will you have employees?", "您会雇用员工吗？"), hint: B("Employer registration, workers' comp, new hire reports and posters.", "涉及雇主登记、工伤保险、新员工报告和法定告示。") },
  manufactures: { q: B("Do you make what you sell?", "您销售的产品是自己生产的吗？"), hint: B("Makers get the label and facility rules for their products.", "生产商须遵守产品标签和设施方面的规定。") },
  imports: { q: B("Do you import any of it from outside the US?", "您有从美国境外进口的产品吗？"), hint: B("Importer number, customs bond, the security filing and origin marking.", "涉及进口商编号、海关保证金、安全申报和原产地标记。") },
  upholstered: { q: B("Do you sell upholstered furniture, like sofas or upholstered chairs?", "您销售沙发、软包椅等软体家具吗？"), hint: B("Upholstered furniture has its own licenses and law labels in some states.", "部分州对软体家具有专门的执照和法定标签要求。") },
  children: { q: B("Are any of your products made for children 12 or younger?", "您有专为 12 岁及以下儿童设计的产品吗？"), hint: B("Children's products need lab testing, a certificate and tracking labels.", "儿童产品须经实验室检测、出具证书并加贴追踪标签。") },
  antimicrobial: { q: B("Do any of your products claim to disinfect, sanitize or kill germs?", "您有宣称消毒、除菌或杀菌的产品吗？"), hint: B("A germ-killing claim makes it a pesticide: EPA registers it, and so does almost every state.", "宣称杀菌的产品属于农药：须在 EPA 登记，几乎每个州也要求登记。") },
  foreignOwned: { q: B("Is 25% or more of the company owned by a person or company outside the US?", "公司是否有 25% 或以上的股份由美国境外的个人或公司持有？"), hint: B("A US company with an owner abroad files Form 5472 with the IRS every year.", "有境外股东的美国公司每年须向美国国税局申报 5472 表。") },
  online: { q: B("Will you sell online?", "您会在网上销售吗？"), hint: B("Sales tax in other states, marketplace rules and what marketplaces ask for.", "涉及其他州的销售税、平台规则以及平台要求的文件。") },
};

/** What the words already say, so the question isn't asked: "importer" answers imports, "online" answers online. */
export function intakeFromWords(what: string): Intake {
  const out: Intake = {};
  if (imports(what)) out.imports = true;
  if (sellsOnline(what)) out.online = true;
  if (makesProducts(what)) out.manufactures = true;
  if (isFurniture(what) && UPHOLSTERY_NAMED.test(what)) out.upholstered = true;
  if (childrensProducts(what)) out.children = true;
  if (productNeeds(what).antimicrobial) out.antimicrobial = true;
  // "a US subsidiary of a Chinese company", "中资": an owner outside the US
  if (ownedAbroad(what)) out.foreignOwned = true;
  return out;
}

/** The questions to ask for this business, in order, skipping any the words answer or that can't apply. formedAbroad:
 *  the company itself was formed in another country, so it is a foreign company (foreignEntity), not a foreign-owned US
 *  one, and who owns it isn't asked. */
export function intakeQuestions(what: string, o: { formedAbroad?: boolean } = {}): IntakeQuestion[] {
  const segment = segmentOf(what), known = intakeFromWords(what);
  const food = dealsInFood(what, segment), furniture = isFurniture(what), cosmetics = !furniture && sellsCosmetics(what);
  const restaurant = segment === "restaurant";
  const ask: IntakeKey[] = ["employees"];
  // a restaurant, a tea shop or a coffee shop cooks and serves: it doesn't manufacture products, import them or sell them online
  if (!restaurant) ask.push("manufactures", "imports");
  // only furniture has upholstery, and a brand that named only case goods ("dressers") has none to ask about
  if (furniture && !(CASE_GOODS_ONLY.test(what) && !UPHOLSTERY_NAMED.test(what))) ask.push("upholstered");
  // children's products are goods: not food, not cosmetics
  if (!restaurant && !food && !cosmetics) ask.push("children");
  if (!restaurant) ask.push("online");
  // detergent and cleaning products: whether any claims to kill germs decides EPA's and every state's pesticide registration
  if (sellsCleaning(what)) ask.push("antimicrobial");
  // who owns the US company: an owner outside the US with 25% or more means Form 5472 every year
  if (!o.formedAbroad) ask.push("foreignOwned");
  return ask.filter(k => known[k] === undefined).map(key => ({ key, ...Q[key] }));
}

/** The answers with what the words said, for the plan: an unanswered question stays unset (the plan reads the words). */
export const intakeAnswers = (what: string, given: Intake): Intake => ({ ...intakeFromWords(what), ...given });
