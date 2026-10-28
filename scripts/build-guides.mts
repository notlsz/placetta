/* Builds site/guides/ and the files search and AI engines read (sitemap.xml, robots.txt, llms.txt, llms-full.txt,
   guides/data.json). Every fact comes from the official forms library (src/forms/registry.ts and world.ts) or the
   answers in guides-answers.mts, and links the agency's own page. English and Chinese.
   Per city: a city page, a guide per kind of business (one or more for each sector on the landing page) and a page per
   topic (8). Plus a page per official form,
   a page per question and the hub. Each page ends in the same conversion: the plan for your exact address.
   Run: npm run guides (output is committed; Vite copies site/ into dist/). */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { CITIES, COUNTRIES } from "../src/forms/world.ts";
import { FORMS, METHOD, formById, formsFor, placesOf, type Needs, type OfficialForm, type Segment } from "../src/forms/registry.ts";
import { kindFactsAt, type KindFact, type StoreKind } from "../src/forms/kinds.ts";
import { proofCurrent } from "../src/plan/ask.ts";
import { ANSWERS } from "./guides-answers.mts";
// the site's address and the company entity: one place for every canonical, sitemap and JSON-LD (scripts/seo/config.mjs)
import { BAIDU_META, ORG_ID, ORIGIN, SEARCH_PATH, SITE_ID, ldTag, orgLd, websiteLd } from "./seo/config.mjs";

const TODAY = process.env.GUIDES_TODAY ?? new Date().toISOString().slice(0, 10);
type L = "en" | "zh";
type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// house style: no em dashes and no middle-dot separators in copy
const clean = (s: string) => s.replace(/\s*\u2014\s*/g, ", ").replace(/ \u00b7 /g, ", ");
const t = (b: Bi, l: L) => clean(b[l]);
const day = (l: L) => (l === "zh" ? TODAY.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1 年 $2 月 $3 日") : new Date(TODAY + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
// "Seller's permit" reads "the seller's permit" mid-sentence; titles with other capitalized words keep their case
const lower1 = (s: string) => (/^[A-Z][a-z]/.test(s) && !s.split(/\s+/).slice(1).some(w => /^[A-Z][a-z]/.test(w)) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const an = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");

/* ------------------------------------------------------------ businesses, topics and places */

// kinds: what src/forms/kinds.ts calls this business, for the facts an official page states differ for it
// sector: the landing page's sector it belongs to (the hub groups its links by them)
// only: built in a place only when its filings or facts there include what makes it this kind of business (a salon's own
// license, a factory's stormwater permit); where the library has none, no guide is built rather than a page that leaves
// out the filing that defines it
type SectorId = "food" | "retail" | "tech" | "game" | "consumer" | "manufacturing" | "beauty" | "health" | "auto" | "logistics" | "home";
type Biz = { slug: string; seg: Segment; name: Bi; plural: Bi; chip: string; needs: Needs; note: Bi; kinds?: StoreKind[]; sector: SectorId;
  only?: (forms: OfficialForm[], facts: KindFact[], place: Place) => boolean };
/** The sectors on the landing page (site/index.html, "in.*"), in its order, with its names. */
const SECTORS: { id: SectorId; name: Bi }[] = [
  { id: "food", name: B("Food and beverage", "餐饮") }, { id: "retail", name: B("Retail", "零售") }, { id: "tech", name: B("Technology", "科技") },
  { id: "game", name: B("Game studios", "游戏") }, { id: "consumer", name: B("Consumer goods", "消费品") }, { id: "manufacturing", name: B("Manufacturing", "制造业") },
  { id: "beauty", name: B("Beauty and personal care", "美妆个护") }, { id: "health", name: B("Healthcare and life sciences", "医疗与生命科学") },
  { id: "auto", name: B("Automotive and EV", "汽车与新能源") }, { id: "logistics", name: B("Logistics and warehousing", "物流仓储") }, { id: "home", name: B("Home and furniture", "家居家具") },
];
const US_ONLY = (_f: OfficialForm[], _k: KindFact[], p: Place) => p.country === "US";
/** In the US, and with at least one filing that needs this (a salon license, an auto repair registration). */
const withForm = (need: keyof Needs) => (f: OfficialForm[], _k: KindFact[], p: Place) => p.country === "US" && f.some(x => !!x.needs?.[need]);
const OFFICE: Needs = { employees: true, newEntity: true, buildout: true, office: true };
const SALON: Needs = { employees: true, newEntity: true, signage: true, buildout: true, salon: true };
const FOOD: Needs = { food: true, employees: true, newEntity: true, buildout: true, signage: true };
const BUSINESSES: Biz[] = [
  { slug: "milk-tea-shop", sector: "food", seg: "restaurant", name: B("milk tea shop", "奶茶店"), plural: B("Milk tea and bubble tea shops", "奶茶店"), chip: "Milk tea", needs: FOOD, kinds: ["tea"],
    note: B("A tea shop that makes drinks to order is a food service business, so the health permit and food safety training apply even with no kitchen.", "现制饮品的奶茶店属于餐饮服务，即使没有厨房，也需要卫生许可和食品安全培训。") },
  { slug: "coffee-shop", sector: "food", seg: "restaurant", name: B("coffee shop", "咖啡店"), plural: B("Coffee shops", "咖啡店"), chip: "Coffee", needs: FOOD, kinds: ["coffee"],
    note: B("A coffee shop that prepares drinks or food on site is a food service business, licensed and inspected like a restaurant.", "现场制作饮品或食品的咖啡店属于餐饮服务，与餐厅一样需要许可和检查。") },
  { slug: "restaurant", sector: "food", seg: "restaurant", name: B("restaurant", "餐厅"), plural: B("Restaurants", "餐厅"), chip: "Restaurant", needs: FOOD, kinds: ["restaurant"],
    note: B("A restaurant files the most: company and tax registration, then the build-out, the health permit and the inspections that come with it.", "餐厅需要办理的最多：先是公司和税务登记，然后是装修、卫生许可以及随之而来的检查。") },
  { slug: "hot-pot-restaurant", sector: "food", seg: "restaurant", name: B("hot pot restaurant", "火锅店"), plural: B("Hot pot restaurants", "火锅店"), chip: "Restaurant", needs: FOOD, kinds: ["restaurant"],
    note: B("Tabletop cooking adds questions for the build-out and fire review, so the plan for the space matters more than usual.", "桌边加热会给装修和消防审查带来更多问题，因此场地方案比一般餐厅更关键。") },
  { slug: "bakery", sector: "food", seg: "restaurant", name: B("bakery", "烘焙店"), plural: B("Bakeries", "烘焙店"), chip: "Bakery and desserts", needs: FOOD, kinds: ["bakery"],
    note: B("A bakery that bakes on site needs the kitchen approved before opening, the same as a restaurant.", "现场烘焙的店铺需要在开业前通过厨房审批，与餐厅相同。") },
  { slug: "dessert-shop", sector: "food", seg: "restaurant", name: B("dessert shop", "甜品店"), plural: B("Dessert shops", "甜品店"), chip: "Bakery and desserts", needs: FOOD,
    note: B("Desserts served on site make it a food service business, with the health permit and inspection that go with it.", "现场供应甜品即属于餐饮服务，需要相应的卫生许可和检查。") },
  { slug: "grocery-store", sector: "food", seg: "retail", name: B("grocery store", "超市"), plural: B("Grocery stores", "超市"), chip: "Grocery", needs: { food: true, employees: true, newEntity: true, signage: true },
    note: B("Selling packaged food adds food rules on top of a store's usual registrations.", "销售包装食品会在门店常规登记之外增加食品方面的要求。") },
  { slug: "retail-store", sector: "retail", seg: "retail", name: B("retail store", "零售门店"), plural: B("Retail stores", "零售门店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true },
    note: B("A store's filings are mostly registration and tax, plus the sign and occupancy for the space.", "零售门店的申请主要是登记和税务，再加上招牌和场所使用许可。") },
  { slug: "cosmetics-store", sector: "beauty", seg: "retail", name: B("cosmetics store", "美妆店"), plural: B("Cosmetics stores", "美妆店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true, cosmetics: true, imports: true },
    note: B("Importing cosmetics brings product registration and import filings on top of the store's own.", "进口化妆品需要在门店本身的申请之外，办理产品注册和进口手续。") },
  { slug: "toy-store", sector: "retail", seg: "retail", name: B("toy store", "玩具店"), plural: B("Toy stores", "玩具店"), chip: "Retail", needs: { employees: true, newEntity: true, signage: true, children: true, imports: true },
    note: B("Imported children's products need product safety certificates at entry, in addition to the store's registrations.", "进口儿童产品在入境时需要产品安全证书，此外还有门店本身的登记。") },
  { slug: "importer-ecommerce", sector: "consumer", seg: "seller", name: B("importer or e-commerce seller", "进口商或跨境电商卖家"), plural: B("Importers and online sellers", "进口与电商"), chip: "Importer or online seller", needs: { imports: true, newEntity: true },
    note: B("Selling imported goods online means customs registration and import paperwork before the first shipment lands.", "在线销售进口商品，需要在首批货物到港前完成海关登记和进口手续。") },
  { slug: "warehouse-3pl", sector: "logistics", seg: "warehouse", name: B("warehouse or 3PL", "仓库或第三方物流"), plural: B("Warehouses and 3PLs", "仓储物流"), chip: "Warehouse or 3PL", needs: { imports: true, employees: true, newEntity: true, hazmat: true },
    note: B("A warehouse adds occupancy and fire rules for storage, and customs filings when it handles imports.", "仓库需要满足仓储方面的场所使用和消防要求，处理进口货物时还要办理海关手续。") },
  /* the landing page's other sectors (src/forms/sectors.ts): US cities, where the library holds what defines them */
  { slug: "tech-office", sector: "tech", seg: "retail", name: B("tech office", "科技公司办公室"), plural: B("Tech offices and startups", "科技公司办公室"), chip: "Technology company", needs: OFFICE, only: US_ONLY,
    note: B("No license is specific to software: a tech office files the company, tax and employer registrations and the permits for its space. The sales tax registration applies if it sells taxable goods or services in the state.", "软件行业没有专门的执照：科技公司办公室需要办理公司、税务和雇主登记，以及办公场所的许可。如在该州销售应税商品或服务，还需办理销售税登记。") },
  { slug: "game-studio", sector: "game", seg: "retail", name: B("game studio", "游戏工作室"), plural: B("Game studios", "游戏工作室"), chip: "Game studio", needs: OFFICE, kinds: ["game"], only: US_ONLY,
    note: B("A game studio files what any office does. No government license rates or approves a game: age ratings are voluntary.", "游戏工作室的申请与一般办公室相同。没有政府执照为游戏评级或审批：年龄分级是自愿的。") },
  { slug: "consumer-products-brand", sector: "consumer", seg: "seller", name: B("consumer products brand", "消费品品牌"), plural: B("Consumer products brands", "消费品品牌"), chip: "Consumer goods", needs: { imports: true, newEntity: true, employees: true }, kinds: ["consumer"],
    only: (_f, k, p) => p.country === "US" && k.length > 0,
    note: B("A brand that imports and sells consumer products adds customs filings and a product safety certificate for each product a CPSC rule covers.", "进口并销售消费品的品牌，需要办理海关手续，并为受 CPSC 规定管辖的每种产品出具产品安全证书。") },
  { slug: "cosmetics-brand", sector: "beauty", seg: "seller", name: B("cosmetics brand", "化妆品品牌"), plural: B("Cosmetics and skincare brands", "化妆品与护肤品牌"), chip: "Cosmetics brand", needs: { imports: true, newEntity: true, employees: true, cosmetics: true }, only: withForm("cosmetics"),
    note: B("Under MoCRA a cosmetics brand lists each product with FDA, and the facility that makes or processes it registers, on top of the import filings.", "根据 MoCRA，化妆品品牌须向 FDA 列名每个产品，生产或加工设施须注册，此外还有进口手续。") },
  { slug: "nail-salon", sector: "beauty", seg: "retail", name: B("nail salon", "美甲店"), plural: B("Nail salons", "美甲店"), chip: "Nail salon", needs: SALON, kinds: ["nail"], only: withForm("salon"),
    note: B("The state board licenses the salon itself, besides each technician's own license, and may inspect it before it opens.", "州委员会为沙龙本身发证，另有每位技师的个人执照，并可能在开业前检查。") },
  { slug: "hair-salon", sector: "beauty", seg: "retail", name: B("hair salon", "美发店"), plural: B("Hair salons and barbershops", "美发店与理发店"), chip: "Hair salon", needs: SALON, only: withForm("salon"),
    note: B("The state board licenses the salon or shop itself, besides each stylist's or barber's own license, and may inspect it before it opens.", "州委员会为美发店或理发店本身发证，另有每位发型师或理发师的个人执照，并可能在开业前检查。") },
  { slug: "medical-device-importer", sector: "health", seg: "seller", name: B("medical device importer", "医疗器械进口商"), plural: B("Medical device importers and distributors", "医疗器械进口与分销"), chip: "Medical devices", needs: { imports: true, newEntity: true, employees: true, devices: true }, kinds: ["device"], only: withForm("devices"),
    note: B("An importer of medical devices registers its establishment with FDA every year and pays FDA's registration fee, on top of the customs filings.", "医疗器械进口商须每年向 FDA 注册其企业并缴纳注册费，此外还有海关手续。") },
  { slug: "auto-repair-shop", sector: "auto", seg: "retail", name: B("auto repair shop", "汽车维修店"), plural: B("Auto repair shops", "汽车维修店"), chip: "Auto repair", needs: { employees: true, newEntity: true, signage: true, buildout: true, autoRepair: true }, only: withForm("autoRepair"),
    note: B("A shop paid to repair other people's vehicles registers with the state before it takes work, besides the usual business, tax and building filings.", "有偿维修他人车辆的店铺须在接单前向州政府登记，此外还有常规的营业、税务和建筑申请。") },
  { slug: "light-manufacturing", sector: "manufacturing", seg: "warehouse", name: B("light manufacturing facility", "轻工制造工厂"), plural: B("Light manufacturing facilities", "轻工制造工厂"), chip: "Manufacturing", needs: { employees: true, newEntity: true, buildout: true, hazmat: true, manufactures: true }, only: withForm("manufactures"),
    note: B("A factory adds environmental filings where its activity is covered: the industrial stormwater permit, air permits for equipment that emits, and a plan for hazardous materials kept on site.", "工厂在其活动属适用范围时需增加环保申请：工业雨水排放许可、排放设备的空气许可，以及场内危险品的业务计划。") },
  { slug: "furniture-showroom", sector: "home", seg: "retail", name: B("furniture showroom", "家具展厅"), plural: B("Furniture showrooms and stores", "家具展厅与门店"), chip: "Furniture showroom", needs: { employees: true, newEntity: true, signage: true, wood: true, upholstered: true }, kinds: ["furniture", "upholstered"],
    only: (_f, k, p) => p.country === "US" && k.length > 0,
    note: B("A furniture store sells under the labeling rules for composite wood and, in some states, upholstered furniture licensing.", "家具门店须遵守复合木材标签规定，部分州还要求软体家具执照。") },
  { slug: "furniture-importer", sector: "home", seg: "seller", name: B("furniture importer", "家具进口商"), plural: B("Furniture importers and brands", "家具进口商与品牌"), chip: "Furniture importer", needs: { imports: true, newEntity: true, employees: true, wood: true, upholstered: true }, kinds: ["furniture", "upholstered"],
    only: (_f, k, p) => p.country === "US" && k.length > 0,
    note: B("Importing furniture adds the wood declaration, the composite wood certification and the security filing for each ocean shipment to the customs registrations.", "进口家具除海关登记外，还需办理木材申报、复合木材认证以及每批海运货物的安全申报。") },
  { slug: "furniture-maker", sector: "home", seg: "warehouse", name: B("furniture maker", "家具制造商"), plural: B("Furniture makers", "家具制造商"), chip: "Furniture maker", needs: { employees: true, newEntity: true, buildout: true, hazmat: true, manufactures: true, wood: true, upholstered: true }, kinds: ["furniture", "upholstered"],
    only: withForm("manufactures"),
    note: B("A furniture factory files what any factory does where it applies, and makes upholstered pieces under the state's furniture rules.", "家具工厂在适用时须办理与一般工厂相同的申请，并按州家具规定生产软体家具。") },
];

type Topic = { slug: string; title: (c: string, l: L) => string; dek: Bi; pick: (f: OfficialForm) => boolean };
const TOPICS: Topic[] = [
  { slug: "permit-costs", title: (c, l) => (l === "zh" ? `在${c}开店，许可要花多少钱` : `How much permits cost to open in ${c}`), dek: B("The government fees for each filing, what's free and what depends on your business.", "每项申请的政府规费：哪些免费，哪些视业务而定。"), pick: () => true },
  { slug: "how-long-permits-take", title: (c, l) => (l === "zh" ? `在${c}办许可需要多长时间` : `How long permits take in ${c}`), dek: B("How long each agency takes, so you can plan the opening date.", "各机构办理所需的时间，便于规划开业日期。"), pick: f => !!f.takes },
  { slug: "foreign-company", title: (c, l) => (l === "zh" ? `外国公司在${c}开店` : `Opening in ${c} as a foreign company`), dek: B("What changes when the owner or parent company is based abroad.", "股东或母公司在境外时，需要注意的不同之处。"), pick: f => !!f.foreign || !!f.needs?.foreignEntity },
  { slug: "hiring-employees", title: (c, l) => (l === "zh" ? `在${c}雇佣第一批员工` : `Hiring your first employees in ${c}`), dek: B("The employer registrations to make before the first payday.", "首次发薪前需要完成的雇主登记。"), pick: f => !!f.needs?.employees },
  { slug: "build-out-and-occupancy", title: (c, l) => (l === "zh" ? `在${c}装修与场所使用许可` : `Build-out and occupancy permits in ${c}`), dek: B("Plan review, building and occupancy approvals for the space.", "场所的图纸审查、施工和使用审批。"), pick: f => !!f.needs?.buildout || /occupancy|plan review|plan check|building|fire|消防|占用|图纸|装修/i.test(f.title.en + f.title.zh) },
  { slug: "sign-permits", title: (c, l) => (l === "zh" ? `在${c}办理招牌许可` : `Sign permits in ${c}`), dek: B("What it takes to put up a storefront sign.", "安装门店招牌需要办理的手续。"), pick: f => !!f.needs?.signage || /sign|招牌/i.test(f.title.en + f.title.zh) },
  { slug: "importing-goods", title: (c, l) => (l === "zh" ? `从${c}进口商品需要办什么` : `Importing goods into ${c}`), dek: B("Customs registration, bonds and product filings for imports.", "进口所需的海关登记、保证金和产品申报。"), pick: f => !!f.needs?.imports },
  { slug: "renewals", title: (c, l) => (l === "zh" ? `在${c}需要定期续期的证照` : `Renewals and annual filings in ${c}`), dek: B("What renews, and how often, once the business is open.", "开业后哪些证照需要续期、多久一次。"), pick: f => !!f.renews },
];

type Place = { slug: string; name: Bi; where: string; country: string; state?: string };
const PLACES: Place[] = [
  { slug: "new-york-city", name: B("New York City", "纽约市"), where: "Flushing, New York City, NY", country: "US", state: "NY" },
  { slug: "los-angeles", name: B("Los Angeles", "洛杉矶"), where: "Los Angeles, CA", country: "US", state: "CA" },
  { slug: "houston", name: B("Houston", "休斯顿"), where: "Houston, TX", country: "US", state: "TX" },
  ...CITIES.filter(c => c.guide).map(c => ({ slug: slug(c.en), name: B(c.en, c.zh), where: c.aliases[0] + (c.state ? `, ${c.state}` : ""), country: c.country, ...(c.state ? { state: c.state } : {}) })),
];
/* US states by postal code, for "where it applies" and the state hubs */
const US_STATES: Record<string, Bi> = Object.fromEntries(Object.entries({
  AL: "Alabama/阿拉巴马州", AK: "Alaska/阿拉斯加州", AZ: "Arizona/亚利桑那州", AR: "Arkansas/阿肯色州", CA: "California/加州", CO: "Colorado/科罗拉多州",
  CT: "Connecticut/康涅狄格州", DE: "Delaware/特拉华州", DC: "District of Columbia/华盛顿特区", FL: "Florida/佛罗里达州", GA: "Georgia/佐治亚州",
  HI: "Hawaii/夏威夷州", ID: "Idaho/爱达荷州", IL: "Illinois/伊利诺伊州", IN: "Indiana/印第安纳州", IA: "Iowa/艾奥瓦州", KS: "Kansas/堪萨斯州",
  KY: "Kentucky/肯塔基州", LA: "Louisiana/路易斯安那州", ME: "Maine/缅因州", MD: "Maryland/马里兰州", MA: "Massachusetts/马萨诸塞州", MI: "Michigan/密歇根州",
  MN: "Minnesota/明尼苏达州", MS: "Mississippi/密西西比州", MO: "Missouri/密苏里州", MT: "Montana/蒙大拿州", NE: "Nebraska/内布拉斯加州", NV: "Nevada/内华达州",
  NH: "New Hampshire/新罕布什尔州", NJ: "New Jersey/新泽西州", NM: "New Mexico/新墨西哥州", NY: "New York State/纽约州", NC: "North Carolina/北卡罗来纳州",
  ND: "North Dakota/北达科他州", OH: "Ohio/俄亥俄州", OK: "Oklahoma/俄克拉何马州", OR: "Oregon/俄勒冈州", PA: "Pennsylvania/宾夕法尼亚州", RI: "Rhode Island/罗得岛州",
  SC: "South Carolina/南卡罗来纳州", SD: "South Dakota/南达科他州", TN: "Tennessee/田纳西州", TX: "Texas/德州", UT: "Utah/犹他州", VT: "Vermont/佛蒙特州",
  VA: "Virginia/弗吉尼亚州", WA: "Washington State/华盛顿州", WV: "West Virginia/西弗吉尼亚州", WI: "Wisconsin/威斯康星州", WY: "Wyoming/怀俄明州",
}).map(([k, v]) => { const [en, zh] = v.split("/"); return [k, B(en, zh)]; }));

/* The day each form's official page was last read and its requirement found on it (scripts/eval/proof-log.json, written
   by npm run proof:read, plus the proofs carried inline). A page's "Sources checked" date is the latest of its forms'. */
const PROOF_DAY = new Map<string, string>();
try {
  for (const r of JSON.parse(readFileSync("scripts/eval/proof-log.json", "utf8")) as { id: string; checked?: string; found?: boolean }[])
    if (r.found !== false && r.checked && /^\d{4}-\d\d-\d\d$/.test(r.checked) && r.checked > (PROOF_DAY.get(r.id) ?? "")) PROOF_DAY.set(r.id, r.checked);
} catch { /* no proof log: no "Sources checked" line */ }
for (const f of FORMS) { const d = f.proof?.checked; if (d && /^\d{4}-\d\d-\d\d$/.test(d) && d > (PROOF_DAY.get(f.id) ?? "")) PROOF_DAY.set(f.id, d); }
const checkedOf = (forms: OfficialForm[]) => forms.map(f => PROOF_DAY.get(f.id) ?? "").sort().pop() || "";
const REGION = (country: string) => (country === "US" ? "us" : country === "CN" ? "cn" : ["AE", "SA", "QA", "KW", "BH", "OM", "TR", "EG", "JO", "IL"].includes(country) ? "me"
  : ["CA", "MX", "BR", "CL", "CO", "AR", "PE"].includes(country) ? "am" : ["HK", "SG", "MY", "TH", "VN", "ID", "PH", "AU", "NZ", "JP", "KR"].includes(country) ? "ap"
  : ["KE", "NG", "ZA", "MA", "ET"].includes(country) ? "af" : "eu");
const REGIONS: { id: string; name: Bi }[] = [{ id: "us", name: B("United States", "美国") }, { id: "cn", name: B("China", "中国") }, { id: "eu", name: B("Europe", "欧洲") }, { id: "me", name: B("Middle East", "中东") },
  { id: "am", name: B("Americas", "美洲") }, { id: "ap", name: B("Asia Pacific", "亚太") }, { id: "af", name: B("Africa", "非洲") }];
const countryName = (code: string): Bi => { const c = COUNTRIES.find(x => x.code === code); return c ? B(c.en, c.zh) : B(code, code); };

/* ------------------------------------------------------------ the shell */

const priv = readFileSync("site/privacy.html", "utf8");
const BRAND = (priv.match(/<span class="wm">[\s\S]*?<\/svg><\/span>/) ?? [""])[0];
const FAVICON = (priv.match(/<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g) ?? []).join("\n");
// self-hosted (npm run fonts): no request to Google Fonts, so no third party sees each visit
const FONTS = "/fonts/fonts.css";
const UI = {
  home: B("Home", "首页"), guides: B("Guides", "指南"), cities: B("Cities", "城市"), answers: B("Answers", "问答"), forms: B("Official forms", "官方表格"),
  plan: B("Get my plan", "获取我的方案"), privacy: B("Privacy Policy", "隐私政策"), terms: B("Terms and Conditions", "服务条款"),
  other: B("中文", "English"), onPage: B("In this guide", "本页内容"), updated: B("Updated", "更新于"),
};
const base = (l: L) => (l === "zh" ? "/guides/zh" : "/guides");
const ORG = orgLd();
const PUB = { "@type": "Organization", "@id": ORG_ID, name: "Placetta", url: ORIGIN + "/", logo: { "@type": "ImageObject", url: ORIGIN + "/icon-512.png" } };
const inLang = (l: L) => (l === "zh" ? "zh-CN" : "en");
/** An article about this page, linked to the company entity, with the agencies' own pages it is built from as citations. */
const articleLd = (o: { l: L; path: string; title: string; desc: string; forms?: OfficialForm[]; about?: unknown; type?: string }) => ({
  "@context": "https://schema.org", "@type": o.type ?? "Article", "@id": ORIGIN + o.path + "#article", headline: o.title.slice(0, 110), name: o.title, description: o.desc,
  inLanguage: inLang(o.l), url: ORIGIN + o.path, mainEntityOfPage: ORIGIN + o.path, isPartOf: { "@id": SITE_ID }, datePublished: PUBLISHED, dateModified: TODAY,
  author: PUB, publisher: PUB, image: ORIGIN + "/guides/og.png",
  ...(o.about ? { about: o.about } : {}),
  ...(o.forms?.length ? { citation: [...new Set(o.forms.map(f => f.url))].map(u => ({ "@type": "CreativeWork", url: u })) } : {}),
});
const placeLd = (p: Place, l: L) => ({ "@type": "City", name: p.name[l], ...(p.state ? { containedInPlace: { "@type": "State", name: US_STATES[p.state]?.[l] ?? p.state } } : {}), ...(p.country ? { addressCountry: p.country } : {}) });
const faqLd = (l: L, qa: [string, string][]) => ({ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: inLang(l), mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
/** The visible questions and answers that faqLd describes, word for word. */
const faqHtml = (l: L, qa: [string, string][]) => `<section class="faqs"><h2>${l === "zh" ? "常见问题" : "Questions and answers"}</h2>${qa.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("")}</section>`;

/* Sponsors: shown on every guide. A logo in scripts/sponsors/<name>.svg or .png replaces the name when it's added. Paid links
   carry rel="sponsored", as search engines require. */
const SPONSORS: { name: string; url: string | null; logo?: string }[] = [
  { name: "DeepSeek", url: "https://www.deepseek.com" },
  { name: "ByteDance", url: "https://www.bytedance.com" },
  { name: "Alibaba", url: "https://www.alibabagroup.com" },
];
const LOGOS = SPONSORS.flatMap(sp => ["svg", "png"].flatMap(ext => { try { return [{ name: sp.name, file: `${slug(sp.name)}.${ext}`, bytes: readFileSync(`scripts/sponsors/${slug(sp.name)}.${ext}`) }]; } catch { return []; } }));
const sponsorLogo = (s: (typeof SPONSORS)[number]) => { const x = LOGOS.find(y => y.name === s.name); return x ? `/guides/sponsors/${x.file}` : undefined; };
const sponsors = (l: L) => `<aside class="sponsors" aria-label="${l === "zh" ? "赞助方" : "Sponsors"}"><span>${l === "zh" ? "赞助方" : "Sponsored by"}</span>${SPONSORS.map(sp => {
  const logo = sp.logo ?? sponsorLogo(sp), inner = logo ? `<img src="${logo}" alt="${esc(sp.name)}" height="20">` : `<b>${esc(sp.name)}</b>`;
  return sp.url ? `<a href="${sp.url}" rel="sponsored noopener" target="_blank" data-track="sponsor_${slug(sp.name)}">${inner}</a>` : `<span class="sp">${inner}</span>`;
}).join("")}</aside>`;

/** Titles stay under search engines' cutoff (the page keeps the full name in its h1): cut at a word, with an ellipsis. */
const clipTitle = (t: string, max = 118) => { if (t.length <= max) return t; const cut = t.slice(0, max - 1); const at = cut.lastIndexOf(" "); return (at > 60 ? cut.slice(0, at) : cut).replace(/[\s,:;(]+$/, "") + "…"; };
type Ctx = { place?: Place; biz?: Biz };
function page(o: { l: L; path: string; alt: string; title: string; desc: string; crumbs: ([string, string] | [string, string, string])[]; body: string; ld: unknown[]; kind: string; ctx?: Ctx; noindex?: boolean }) {
  const url = ORIGIN + o.path, altUrl = ORIGIN + o.alt, l = o.l;
  if (o.noindex) NOINDEX.add(o.path);
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: o.crumbs.filter((c, i) => !c[2] || i === o.crumbs.length - 1).map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + path })) };
  const cityName = o.ctx?.place?.name[l];
  return `<!doctype html>
<html lang="${l === "zh" ? "zh-CN" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(clipTitle(o.title))} | Placetta</title>
<meta name="description" content="${esc(o.desc)}">
<meta name="robots" content="${o.noindex ? "noindex, follow" : "index, follow, max-snippet:-1, max-image-preview:large"}">
${l === "zh" ? BAIDU_META + "\n" : ""}<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${l === "zh" ? "zh-CN" : "en"}" href="${url}">
<link rel="alternate" hreflang="${l === "zh" ? "en" : "zh-CN"}" href="${altUrl}">
<link rel="alternate" hreflang="x-default" href="${l === "en" ? url : altUrl}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/guides/og.png">
<meta property="og:site_name" content="Placetta">
<meta property="og:locale" content="${l === "zh" ? "zh_CN" : "en_US"}">
<meta property="og:locale:alternate" content="${l === "zh" ? "en_US" : "zh_CN"}">
<meta property="article:modified_time" content="${TODAY}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.desc)}">
<meta name="twitter:image" content="${ORIGIN}/guides/og.png">
${FAVICON}
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/guides/guides.css">
${[crumbs, ...o.ld].map(ldTag).join("\n")}
<script src="/guides/guides.js" defer></script>
</head>
<body class="pg-${o.kind}">
<a class="skip" role="link" tabindex="0" data-to="main">${l === "zh" ? "跳到正文" : "Skip to content"}</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <nav class="topnav" aria-label="${l === "zh" ? "指南" : "Guides"}">
    <a href="${base(l)}/" data-to="cities">${UI.cities[l]}</a>
    <a href="${base(l)}/" data-to="answers">${UI.answers[l]}</a>
    <a href="${base(l)}/" data-to="forms">${UI.forms[l]}</a>
  </nav>
  <a class="lang" href="${o.alt}" hreflang="${l === "zh" ? "en" : "zh-CN"}">${UI.other[l]}</a>
  <a class="btn" role="link" tabindex="0" data-to="get-plan" data-track="nav_cta">${UI.plan[l]}</a>
</div></header>
<main id="main">
<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${o.crumbs.map(([n, p, to], i) => (i < o.crumbs.length - 1 ? `<li><a href="${p}"${to ? ` data-to="${to}"` : ""}>${esc(n)}</a></li>` : `<li aria-current="page">${esc(n)}</li>`)).join("")}</ol></nav>
${o.body}
<section class="wrap helpful" data-helpful hidden><p>${l === "zh" ? "这一页对您有帮助吗？" : "Was this page helpful?"}</p><button type="button" class="hbtn">${l === "zh" ? "有帮助" : "Yes, it helped"}</button><span class="hcount" aria-live="polite"></span></section>
${convert(l, o.ctx ?? {})}
</main>
<a class="dock" role="link" tabindex="0" data-to="get-plan" data-track="dock_cta">${esc(cityName ? (l === "zh" ? `获取${cityName}的开店方案` : `Get my plan for ${cityName}`) : UI.plan[l])}</a>
<footer class="foot"><div class="wrap">
  ${sponsors(l)}
  <a class="brand" href="/" aria-label="Placetta">${BRAND}</a>
  <p>${l === "zh" ? "快哉为进入新市场的企业办理执照、许可和登记，并保持有效。" : "Placetta gets the licenses, permits and registrations a business needs to open in a new market, and keeps them current."}</p>
  <nav><a href="/">${UI.home[l]}</a><a href="${base(l)}/">${UI.guides[l]}</a><a href="/about.html">${l === "zh" ? "关于快哉" : "About Placetta"}</a><a href="/help/">${l === "zh" ? "帮助中心" : "Help Center"}</a><a href="/privacy.html">${UI.privacy[l]}</a><a href="/terms.html">${UI.terms[l]}</a></nav>
  <small>© 2026 Placetta</small>
</div></footer>
</body>
</html>
`;
}

/** The one conversion on every page: the plan for your exact address, prefilled from the page. */
function convert(l: L, c: Ctx) {
  const city = c.place?.name[l] ?? "", biz = c.biz;
  const head = city ? (l === "zh" ? `获取您在${city}的门店专属方案` : `Get the plan for your ${biz ? biz.name.en : "business"} in ${city}`) : (l === "zh" ? "获取您的门店专属方案" : "Get the plan for your exact address");
  return `<section class="convert" id="get-plan"><div class="wrap">
<div class="cv-copy">
<h2>${esc(head)}</h2>
<p>${l === "zh" ? "这份指南适用于整座城市。您的具体地址决定了所属的县、卫生辖区和分区规定。快哉按地址梳理每一项申请，用您的资料填好官方表格，添加截止日期，并交给您批准。" : "This guide covers the city. Your exact address decides the county, the health district and the zoning. Placetta maps every filing for it, fills the official forms from your details, adds the deadlines and puts them up for your approval."}</p>
<ul class="cv-points"><li>${l === "zh" ? "按地址列出的完整申请清单" : "The full list for your address, in filing order"}</li><li>${l === "zh" ? "逐行填好的官方表格" : "The official forms, filled line by line"}</li><li>${l === "zh" ? "续期和检查提醒" : "Renewal and inspection reminders"}</li></ul>
</div>
<form class="cv-form" data-lead method="post" novalidate>
<input type="hidden" name="sell" value="${esc(biz?.chip ?? "")}"><input type="hidden" name="business" value="${esc(biz?.slug ?? "")}"><input type="hidden" name="city" value="${esc(c.place?.name.en ?? "")}">
<label><span>${l === "zh" ? "品牌或公司名称" : "Brand or company name"}</span><input name="company" autocomplete="organization" required maxlength="120"></label>
<label><span>${l === "zh" ? "门店地址或街区" : "Store address or neighborhood"}</span><input name="address" autocomplete="street-address" maxlength="200" value="${esc(city)}"></label>
<label><span>${l === "zh" ? "工作邮箱" : "Work email"}</span><input name="email" type="email" autocomplete="email" required maxlength="254"></label>
<button class="btn big" type="submit">${UI.plan[l]}</button>
<p class="cv-fine">${l === "zh" ? "免费开始，无需绑卡。我们只用邮箱联系您。" : "Free to start, no card needed. We only use your email to reach you."}</p>
<p class="cv-err" role="alert" hidden></p>
</form>
</div></section>`;
}

const money = (n: number, cur = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const fee = (f: OfficialForm, l: L) => (f.fee === null ? (l === "zh" ? "视情况而定" : "Varies") : f.fee === 0 ? (l === "zh" ? "免费" : "Free") : money(f.fee, f.currency ?? "USD"));
const formPath = (f: OfficialForm, l: L) => `${base(l)}/forms/${f.id}.html`;
const answerPath = (s: string, l: L) => `${base(l)}/answers/${s}.html`;
const cityPath = (p: Place, l: L) => `${base(l)}/${p.slug}/`;
const where = (f: OfficialForm, l: L) => {
  if (f.where === "US") return l === "zh" ? "美国联邦" : "US federal";
  const city = CITIES.find(c => c.code === f.where), country = COUNTRIES.find(c => c.code === f.where);
  if (city) return l === "zh" ? city.zh : city.en;
  if (country) return l === "zh" ? `${country.zh}全国` : `${country.en}, national`;
  const us: Record<string, Bi> = { NY: B("New York State", "纽约州"), NYC: B("New York City", "纽约市"), CA: B("California", "加州"), LA: B("City of Los Angeles", "洛杉矶市"), LAC: B("Los Angeles County", "洛杉矶县"), TX: B("Texas", "德州"), HOU: B("Houston", "休斯顿") };
  return us[f.where]?.[l] ?? US_STATES[f.where]?.[l] ?? f.where;
};
const sourceNote = (f: OfficialForm, l: L) => f.checked === "known"
  ? (l === "zh" ? "出自快哉的官方网站资料库。提交前请以机构官网为准，快哉会在每次提交前重新核对。" : "From Placetta's library of official sites. Check the agency's page before you file; Placetta re-checks it before every filing.")
  : (l === "zh" ? "依据机构官网核对。" : "Checked against the agency's own page.");
const facts = (f: OfficialForm, l: L) => `<dl class="facts"><div><dt>${l === "zh" ? "费用" : "Fee"}</dt><dd>${fee(f, l)}</dd></div><div><dt>${l === "zh" ? "办理" : "Filed"}</dt><dd>${esc(t(METHOD[f.method], l))}</dd></div>${f.takes ? `<div><dt>${l === "zh" ? "时长" : "Takes"}</dt><dd>${esc(t(f.takes, l))}</dd></div>` : ""}${f.renews ? `<div><dt>${l === "zh" ? "续期" : "Renews"}</dt><dd>${esc(t(f.renews, l))}</dd></div>` : ""}</dl>`;
const hero = (title: string, dek: string, bits: string[]) => `<header class="hero wrap"><h1>${esc(title)}</h1><p class="dek">${esc(dek)}</p><p class="meta">${bits.map(b => `<span>${b}</span>`).join("")}</p></header>`;
/** The sourcing note at the end of every guide: where the facts come from, and the editorial policy behind them. */
const sourcing = (l: L, advice = false) => `<p class="fine">${l === "zh"
  ? `${advice ? "这是一般信息，不是法律或税务意见。" : ""}每项申请都链接到机构官网，事实只取自官方表格和机构页面。各机构要求可能变化，提交前请以机构官网为准。<a href="/editorial.html">我们如何核对来源</a>`
  : `${advice ? "General information, not legal or tax advice. " : ""}Every filing links to the agency's own page, and every fact comes from an official form or agency page. Agency requirements change; check the agency's page before you file. <a href="/editorial.html">How we source and check these guides</a>`}</p>`;
const bitsFor = (l: L, n: number) => [`${UI.updated[l]} ${day(l)}`, l === "zh" ? `${n} 项申请` : `${n} filing${n === 1 ? "" : "s"}`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites"];
function costOf(forms: OfficialForm[]) {
  const fixed = forms.filter(f => typeof f.fee === "number" && f.fee > 0), free = forms.filter(f => f.fee === 0), varies = forms.filter(f => f.fee === null);
  return { total: fixed.reduce((s, f) => s + (f.fee as number), 0), fixed, free, varies, cur: forms.find(f => f.currency)?.currency ?? "USD" };
}
const steps = (forms: OfficialForm[], l: L) => `<ol class="steps">${forms.map((f, i) => `<li id="s${i + 1}"><span class="n" aria-hidden="true">${i + 1}</span><div class="step">
<h2><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h2>
<p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p>
<p>${esc(t(f.how, l))}</p>
${facts(f, l)}
<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网办理入口" : "File on the agency's site"}</a><a href="${formPath(f, l)}">${l === "zh" ? "这项申请详解" : "How to fill it"}</a></p>
</div></li>`).join("\n")}</ol>`;
const rail = (forms: OfficialForm[], l: L, extra = "") => {
  const c = costOf(forms);
  return `<aside class="rail"><div class="rail-in">
<p class="rail-h">${UI.onPage[l]}</p>
<ol>${forms.map((f, i) => `<li><a role="link" tabindex="0" data-to="s${i + 1}">${esc(t(f.title, l))}</a></li>`).join("")}</ol>
<div class="sum"><p>${l === "zh" ? "固定政府规费" : "Fixed government fees"}</p><b>${c.total || !c.varies.length ? money(c.total, c.cur) : (l === "zh" ? "视业务而定" : "Varies")}</b><small>${l === "zh" ? `另有 ${c.varies.length} 项视业务而定，${c.free.length} 项免费` : `${c.varies.length} more depend on the business; ${c.free.length} are free`}</small><a class="btn" role="link" tabindex="0" data-to="get-plan" data-track="rail_cta">${UI.plan[l]}</a></div>
${extra}
</div></aside>`;
};
const embed = (title: string, forms: OfficialForm[], url: string, l: L) => {
  const html = `<div class="placetta-checklist"><p><strong>${esc(title)}</strong></p><ol>${forms.map(f => `<li>${esc(t(f.title, l))} (${esc(t(f.agency, l))})</li>`).join("")}</ol><p>${l === "zh" ? "来源" : "Source"}: <a href="${url}">${l === "zh" ? "快哉开店许可指南" : "Placetta license guide"}</a></p></div>`;
  return `<details class="embed"><summary>${l === "zh" ? "在您的网站上使用这份清单" : "Use this checklist on your site"}</summary><p>${l === "zh" ? "复制下面的代码贴到您的网站或文章中，内容会注明来源。" : "Copy this into your site or article. It credits the source."}</p><textarea readonly rows="5" aria-label="HTML">${esc(html)}</textarea><button type="button" class="btn ghost" data-copy>${l === "zh" ? "复制代码" : "Copy the code"}</button></details>`;
};

/* ------------------------------------------------------------ build */

type Kind = "hub" | "guide" | "topic" | "form" | "answer";
const urls: { path: string; alt: string; type: Kind }[] = [];
/** Pages kept out of search (noindex, follow): near-duplicates of another page. Left out of the sitemaps and IndexNow. */
const NOINDEX = new Set<string>();
/* Each page keeps the date its content last changed: the build hashes the page with today's date masked, and only a page
   whose hash moved gets today's date (in the "Updated" line, the JSON-LD and the sitemap's lastmod). It also keeps the day
   the page was first published (p): the day version control first added it, or the day this build first wrote it. */
const DATES_FILE = "scripts/guides-dates.json";
const DATES: Record<string, { h: string; d: string; p?: string }> = existsSync(DATES_FILE) ? JSON.parse(readFileSync(DATES_FILE, "utf8")) : {};
const NEXT_DATES: typeof DATES = {};
const ADDED: Record<string, string> = {};
if (Object.values(DATES).some(x => !x.p)) {
  try {
    let day = "";
    for (const line of execFileSync("git", ["log", "--diff-filter=A", "--name-only", "--format=@%as", "--", "site/guides"], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\n")) {
      if (line.startsWith("@")) day = line.slice(1);
      else if (line.startsWith("site/")) ADDED[line.slice(4).replace(/\/index\.html$/, "/")] = day; // newest first, so the oldest add wins
    }
  } catch { /* no history: first-published dates start today */ }
}
const PUBLISHED = "@@PUBLISHED_DATE@@";
const fmtDay = (iso: string, l: L) => (l === "zh" ? iso.replace(/^(\d+)-0?(\d+)-0?(\d+)$/, "$1 年 $2 月 $3 日") : new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
const lastmodOf = (path: string) => NEXT_DATES[path]?.d ?? TODAY;
const write = (path: string, html: string) => {
  const masked = html.split(TODAY).join("\u0000ISO").split(fmtDay(TODAY, "en")).join("\u0000EN").split(fmtDay(TODAY, "zh")).join("\u0000ZH");
  const h = createHash("sha256").update(masked).digest("hex").slice(0, 16), prev = DATES[path], d = prev && prev.h === h ? prev.d : TODAY;
  const pub = [prev?.p, ADDED[path], d].filter((x): x is string => !!x).sort()[0];
  NEXT_DATES[path] = { h, d, p: pub };
  const out = masked.split("\u0000ISO").join(d).split("\u0000EN").join(fmtDay(d, "en")).split("\u0000ZH").join(fmtDay(d, "zh")).split(PUBLISHED).join(pub);
  const file = "site" + path.replace(/\/$/, "/index.html"); mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true }); writeFileSync(file, out);
};
const keepOg = (() => { try { return readFileSync("site/guides/og.png"); } catch { return null; } })();
rmSync("site/guides", { recursive: true, force: true });

// facts: what an official page says differs for this kind of business here (src/forms/kinds.ts), each with the day its
// quote was last seen; only facts whose quote is current are printed (fail closed, as in the plans)
type Fact = KindFact & { seen: string };
type Guide = { place: Place; biz: Biz; forms: OfficialForm[]; facts: Fact[] };
const guides: Guide[] = [];
const topicPages: { place: Place; topic: Topic; forms: OfficialForm[] }[] = [];
const usedBy = new Map<string, Guide[]>();
const factsFor = (biz: Biz, place: Place): Fact[] => !biz.kinds?.length || place.country !== "US" ? []
  : kindFactsAt(biz.kinds, placesOf(place.where), biz.needs).flatMap(k => { const seen = proofCurrent(k.proof, TODAY); return seen ? [{ ...k, seen }] : []; });
for (const place of PLACES) {
  for (const biz of BUSINESSES) {
    const forms = formsFor({ segment: biz.seg, where: place.where, needs: { ...biz.needs, ...(place.country !== "US" ? { foreignEntity: true } : {}) } });
    if (forms.length < 3) continue;
    const g = { place, biz, forms, facts: factsFor(biz, place) };
    if (biz.only && !biz.only(forms, g.facts, place)) continue;
    guides.push(g);
    for (const f of forms) usedBy.set(f.id, [...(usedBy.get(f.id) ?? []), g]);
  }
  const all = [...new Map(guides.filter(g => g.place === place).flatMap(g => g.forms).map(f => [f.id, f])).values()].sort((a, b) => a.order - b.order);
  for (const topic of TOPICS) { const forms = all.filter(topic.pick); if (forms.length >= 2) topicPages.push({ place, topic, forms }); }
}
const guidePath = (g: { place: Place; biz: Biz }, l: L) => `${base(l)}/${g.place.slug}/${g.biz.slug}.html`;
const topicPath = (p: Place, tp: Topic, l: L) => `${base(l)}/${p.slug}/${tp.slug}.html`;
const findGuide = (place: string, seg: string) => guides.find(g => g.place.slug === place && (g.biz.slug === seg || (seg === "seller" && g.biz.slug === "importer-ecommerce") || (seg === "warehouse" && g.biz.slug === "warehouse-3pl") || (seg === "retail" && g.biz.slug === "retail-store")));
const guideLabel = (g: Guide, l: L) => (l === "zh" ? `${g.place.name.zh}：${g.biz.name.zh}` : `${g.biz.plural.en} in ${g.place.name.en}`);
const placesUsed = PLACES.filter(p => guides.some(g => g.place === p));

/* Near-duplicates. In a city, kinds of business that file exactly the same filings and for which no official page states
   anything different (a dessert shop and a restaurant, often) would be the same page under different names. The first
   of PRIMARY is the one search engines index; the others stay up for visitors and links (noindex, follow) and the indexed
   one names them. A guide whose filings match another's but whose facts differ (a milk tea shop's grease interceptor rule
   in New York City, a bakery's wholesale registration in California) is its own page. Same for topic pages. */
const PRIMARY = ["restaurant", "retail-store", "grocery-store", "importer-ecommerce", "warehouse-3pl", "cosmetics-store", "toy-store", "milk-tea-shop", "coffee-shop", "hot-pot-restaurant", "bakery", "dessert-shop",
  "tech-office", "game-studio", "consumer-products-brand", "cosmetics-brand", "hair-salon", "nail-salon", "medical-device-importer", "auto-repair-shop", "light-manufacturing",
  "furniture-showroom", "furniture-importer", "furniture-maker"];
const sig = (forms: OfficialForm[]) => forms.map(f => f.id).join(",");
/** What makes a guide the page it is: its filings, and what an official page says differs for its kind of business. */
const sigG = (g: Guide) => sig(g.forms) + "|" + g.facts.map(k => k.id).join(",");
const byPrimary = (a: Guide, b: Guide) => PRIMARY.indexOf(a.biz.slug) - PRIMARY.indexOf(b.biz.slug);
const dupGuide = new Map<Guide, Guide>(), alsoGuide = new Map<Guide, Guide[]>();
/** A guide with the same filings as an indexed guide in its city but facts of its own: the one it shares filings with. */
const sameFilings = new Map<Guide, Guide>();
const dupTopicOf = new Map<(typeof topicPages)[number], string>();
for (const p of placesUsed) {
  const bySig = new Map<string, Guide[]>();
  for (const g of guides.filter(x => x.place === p)) bySig.set(sigG(g), [...(bySig.get(sigG(g)) ?? []), g]);
  for (const gs of bySig.values()) {
    const [first, ...rest] = gs.sort(byPrimary);
    for (const x of rest) dupGuide.set(x, first);
    if (rest.length) alsoGuide.set(first, rest);
  }
  // a guide with no fact of its own adds nothing to the guide ahead of it with the same filings, even when that one has
  // facts (a dessert shop next to a New York restaurant whose grease interceptor rule is stated): it points there instead
  for (const g of guides.filter(x => x.place === p && !x.facts.length && !dupGuide.has(x))) {
    const o = guides.filter(x => x.place === p && x !== g && !dupGuide.has(x) && sig(x.forms) === sig(g.forms) && byPrimary(x, g) < 0).sort(byPrimary)[0];
    if (!o) continue;
    dupGuide.set(g, o); alsoGuide.set(o, [...(alsoGuide.get(o) ?? []), g, ...(alsoGuide.get(g) ?? [])]);
    for (const x of alsoGuide.get(g) ?? []) dupGuide.set(x, o);
    alsoGuide.delete(g);
  }
  const indexedHere = guides.filter(x => x.place === p && !dupGuide.has(x)).sort(byPrimary);
  for (const g of indexedHere) { const o = indexedHere.find(x => x !== g && sig(x.forms) === sig(g.forms)); if (o && byPrimary(o, g) < 0) sameFilings.set(g, o); }
  // a topic page listing exactly a guide's filings (often "permit costs" and the restaurant guide) is that guide again
  const seen = new Map<string, string>();
  for (const g of indexedHere) if (!seen.has(sig(g.forms))) seen.set(sig(g.forms), "g:" + g.biz.slug);
  for (const tp of topicPages.filter(x => x.place === p)) { const k = sig(tp.forms); if (seen.has(k)) dupTopicOf.set(tp, seen.get(k)!); else seen.set(k, "t:" + tp.topic.slug); }
}

/** On a topic page kept out of search, the link to the page that lists the same filings. */
function dupLink(tp: (typeof topicPages)[number], l: L) {
  const k = dupTopicOf.get(tp); if (!k) return "";
  const [kind, sl] = k.split(":"), city = tp.place.name[l];
  if (kind === "g") { const g = guides.find(x => x.place === tp.place && x.biz.slug === sl)!; return l === "zh" ? `与<a href="${guidePath(g, l)}">${esc(city)}${esc(g.biz.name.zh)}指南</a>的申请完全相同。` : `The same filings as <a href="${guidePath(g, l)}">the guide for ${esc(g.biz.plural.en.toLowerCase())} in ${esc(city)}</a>.`; }
  const o = TOPICS.find(x => x.slug === sl)!; return l === "zh" ? `与<a href="${topicPath(tp.place, o, l)}">${esc(o.title(city, l))}</a>的申请完全相同。` : `The same filings as <a href="${topicPath(tp.place, o, l)}">${esc(o.title(city, l).replace(/^./, c => c.toLowerCase()))}</a>.`;
}

/* ------------------------------------------------------------ the parts that make a page answer first */

const agencyNames = (forms: OfficialForm[], l: L) => [...new Set(forms.map(f => t(f.agency, l)))];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const listEn = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
/** The fee picture in one sentence, from the forms' own fees. */
function feeLine(forms: OfficialForm[], l: L) {
  const c = costOf(forms);
  if (l === "zh") return [c.fixed.length ? `有固定金额的政府规费合计约 ${money(c.total, c.cur)}` : "没有固定金额的政府规费", c.varies.length ? `${c.varies.length} 项按场所或业务计算` : "", c.free.length ? `${c.free.length} 项免费` : ""].filter(Boolean).join("，") + "。";
  const parts = [c.fixed.length ? `the fixed government fees add up to about ${money(c.total, c.cur)}` : "none of them has a fixed government fee", c.varies.length ? `${plural(c.varies.length, "fee is", "fees are")} set by the space or the business` : "", c.free.length ? `${plural(c.free.length, "filing is", "filings are")} free` : ""].filter(Boolean);
  const s = listEn(parts);
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
const ON_TOP = B("Build-out, insurance and adviser costs are on top.", "装修、保险和顾问费用不在其内。");
/** The quotable answer at the top of a guide: how many filings, with whom, in what order and what they cost. */
function guideAnswer(g: Guide, l: L) {
  const n = g.forms.length, k = agencyNames(g.forms, l).length, first = t(g.forms[0].title, l), last = t(g.forms[n - 1].title, l), biz = g.biz.name[l], city = g.place.name[l];
  return l === "zh"
    ? `在${city}开${biz}，需要向 ${k} 个机构办理 ${n} 项申请，第一项是${first}，最后一项是${last}。${feeLine(g.forms, l)}${t(ON_TOP, l)}`
    : `Opening ${an(biz)} ${biz} in ${city} takes ${n} filings with ${plural(k, "agency", "agencies")}, starting with the ${lower1(first)} and ending with the ${lower1(last)}. ${feeLine(g.forms, l)} ${t(ON_TOP, l)}`;
}
const NOT_LISTED = B("Not listed", "未列明");
/** Fees and timelines as a table: one row per filing, linked to its step. */
function glance(forms: OfficialForm[], l: L, intro = "", anchors = true) {
  const takes = forms.some(f => f.takes), renews = forms.some(f => f.renews);
  const th = (x: string) => `<th scope="col">${x}</th>`;
  return `<section class="glance"><h2>${l === "zh" ? "费用与时长一览" : "Fees and timelines at a glance"}</h2>${intro ? `<p>${intro}</p>` : ""}
<div class="tscroll"><table class="lines gl"><thead><tr>${th(l === "zh" ? "申请" : "Filing")}${th(l === "zh" ? "机构" : "Agency")}${th(l === "zh" ? "政府规费" : "Government fee")}${takes ? th(l === "zh" ? "所需时间" : "How long") : ""}${renews ? th(l === "zh" ? "续期" : "Renews") : ""}</tr></thead><tbody>
${forms.map((f, i) => `<tr><th scope="row">${anchors ? `<a href="#s${i + 1}">${esc(t(f.title, l))}</a>` : `<a href="${formPath(f, l)}">${esc(t(f.title, l))}</a>`}</th><td>${esc(t(f.agency, l))}</td><td>${fee(f, l)}</td>${takes ? `<td>${esc(f.takes ? t(f.takes, l) : t(NOT_LISTED, l))}</td>` : ""}${renews ? `<td>${esc(f.renews ? t(f.renews, l) : t(NOT_LISTED, l))}</td>` : ""}</tr>`).join("\n")}
</tbody></table></div></section>`;
}
const endDot = (s: string, l: L) => (/[.。!?！？]$/.test(s.trim()) ? s.trim() : s.trim() + (l === "zh" ? "。" : "."));
/** Questions a guide answers, each answer built from the filings on the page. */
function guideFaq(g: Guide, l: L): [string, string][] {
  const biz = g.biz.name[l], city = g.place.name[l], c = costOf(g.forms), ags = agencyNames(g.forms, l), first = g.forms[0];
  const top = c.fixed.slice().sort((a, b) => (b.fee as number) - (a.fee as number))[0];
  const timed = g.forms.filter(f => f.takes);
  const qa: [string, string][] = [];
  if (l === "zh") {
    qa.push([`在${city}开${biz}，办许可要花多少钱？`, `${feeLine(g.forms, l)}${top ? `金额最高的一项是${t(top.title, l)}，${money(top.fee as number, c.cur)}。` : ""}${t(ON_TOP, l)}`]);
    if (timed.length) qa.push([`在${city}开${biz}，办许可需要多长时间？`, `各机构公布的办理时间。${timed.map(f => `${t(f.title, l)}：${endDot(t(f.takes!, l), l)}`).join("")}`]);
    qa.push([`在${city}开${biz}，要和哪些机构打交道？`, `${g.forms.length} 项申请分别向 ${ags.length} 个机构办理：${ags.join("、")}。`]);
    qa.push([`在${city}开${biz}，第一步办什么？`, `第一项是${t(first.title, l)}，由${t(first.agency, l)}办理。${endDot(t(first.how, l), l)}`]);
  } else {
    qa.push([`How much do the permits cost to open ${an(biz)} ${biz} in ${city}?`, `${feeLine(g.forms, l)}${top ? ` The largest fixed fee is the ${lower1(t(top.title, l))}, at ${money(top.fee as number, c.cur)}.` : ""} ${t(ON_TOP, l)}`]);
    if (timed.length) qa.push([`How long do the permits take for ${an(biz)} ${biz} in ${city}?`, `The times the agencies give. ${timed.map(f => `${t(f.title, l)}: ${endDot(t(f.takes!, l), l)}`).join(" ")}`]);
    qa.push([`Which agencies issue the permits for ${an(biz)} ${biz} in ${city}?`, `The ${plural(g.forms.length, "filing goes", "filings go")} to ${plural(ags.length, "agency", "agencies")}: ${listEn(ags)}.`]);
    qa.push([`What is the first filing to open ${an(biz)} ${biz} in ${city}?`, `The ${lower1(t(first.title, l))}, with the ${t(first.agency, l).replace(/^The /, "")}. ${endDot(t(first.how, l), l)}`]);
  }
  // what an official page says differs for this kind of business here, in the same words as the section on the page
  if (g.facts.length) qa.push([l === "zh" ? `${factsHeading(g, l)}？` : `${factsHeading(g, l)}?`, g.facts.map(k => endDot(t(k.text, l), l)).join(l === "zh" ? "" : " ")]);
  return qa;
}
const stateOf = (p: Place) => (p.country === "US" && p.state && US_STATES[p.state] ? p.state : "");
const statePath = (code: string, l: L) => `${base(l)}/states/${slug(US_STATES[code].en)}.html`;
const bizPath = (b: Biz, l: L) => `${base(l)}/business/${b.slug}.html`;
const permitPath = (tp: Topic, l: L) => `${base(l)}/permits/${tp.slug}.html`;
const stateForms = (code: string) => FORMS.filter(f => f.where === code && f.level === "state").sort((a, b) => a.order - b.order);
/* a state hub when the state has state-level forms of its own to list */
const STATE_HUBS = [...new Set(placesUsed.map(stateOf).filter(Boolean))].filter(code => stateForms(code).length >= 2).sort();
const placeCrumbs = (p: Place, l: L): [string, string][] => [[UI.guides[l], base(l) + "/"], ...(STATE_HUBS.includes(stateOf(p)) ? [[US_STATES[stateOf(p)][l], statePath(stateOf(p), l)] as [string, string]] : []), [p.name[l], cityPath(p, l)]];
const checkedBit = (forms: OfficialForm[], l: L) => { const d = checkedOf(forms); return d ? [`${l === "zh" ? "来源核对于" : "Sources checked"} ${fmtDay(d, l)}`] : []; };

/* What differs for this kind of business here: each official page's own words, the agency, the link and the day read. */
const factsHeading = (g: Guide, l: L) => (l === "zh" ? `在${g.place.name.zh}开${g.biz.name.zh}有何不同` : `What's different for ${an(g.biz.name.en)} ${g.biz.name.en} in ${g.place.name.en}`);
function factsSection(g: Guide, l: L) {
  if (!g.facts.length) return "";
  const same = sameFilings.get(g);
  const intro = same ? (l === "zh" ? `在${g.place.name.zh}，${g.biz.name.zh}的申请与<a href="${guidePath(same, l)}">${esc(same.biz.name.zh)}</a>相同，不同之处在下面，每一项都出自机构官网原文。` : `In ${esc(g.place.name.en)}, ${esc(g.biz.plural.en.toLowerCase())} file the same filings as <a href="${guidePath(same, l)}">${esc(same.biz.plural.en.toLowerCase())}</a>. What differs is below, each in the agency's own words.`)
    : (l === "zh" ? "以下每一项都出自机构官网原文。" : "Each of these is in the agency's own words.");
  return `<section class="kinds" id="differs" data-facts="${g.facts.map(k => k.id).join(",")}"><h2>${esc(factsHeading(g, l))}</h2><p>${intro}</p>
${g.facts.map(k => `<div class="kfact"><h3>${esc(t(k.title, l))}</h3><p>${esc(t(k.text, l))}</p><blockquote lang="en">“${esc(k.proof.quote)}”</blockquote><p class="src">${esc(t(k.agency, l))}<a href="${esc(k.proof.read)}" rel="noopener">${l === "zh" ? `官方原文，读取于 ${fmtDay(k.seen, l)}` : `The official page, read ${fmtDay(k.seen, l)}`}</a></p></div>`).join("\n")}
</section>
`;
}
/** "Sources checked": the latest day any of the guide's sources was read, its facts' pages included. */
const guideChecked = (g: Guide, l: L) => { const d = [checkedOf(g.forms), ...g.facts.map(k => k.seen)].sort().pop(); return d ? [`${l === "zh" ? "来源核对于" : "Sources checked"} ${fmtDay(d, l)}`] : []; };

const bizHubsEn: { b: Biz }[] = [];
for (const l of ["en", "zh"] as L[]) {
  const o: L = l === "en" ? "zh" : "en";

  /* guides: a business in a city */
  for (const g of guides) {
    const biz = g.biz.name[l], city = g.place.name[l];
    const title = l === "zh" ? `在${city}开${biz}需要哪些执照和许可` : `Licenses and permits to open ${an(biz)} ${biz} in ${city}`;
    const desc = l === "zh" ? `在${city}开${biz}需要办理的 ${g.forms.length} 项执照、许可和登记，按顺序列出机构、办理方式、费用和官方链接。` : `The ${g.forms.length} licenses, permits and registrations ${an(biz)} ${biz} in ${city} files, in order, with the agency, how each is filed, the fee and the official link.`;
    const answer = guideAnswer(g, l), qa = guideFaq(g, l), dupOf = dupGuide.get(g), also = alsoGuide.get(g) ?? [];
    const alsoLine = also.length ? (l === "zh" ? `在${city}，${also.map(x => x.biz.name.zh).join("、")}办理的申请与此完全相同。` : `In ${city}, ${listEn(also.map(x => x.biz.plural.en.toLowerCase()))} file exactly the same filings.`) : "";
    const dupLine = dupOf ? (l === "zh" ? `与<a href="${guidePath(dupOf, l)}">${esc(dupOf.biz.name.zh)}</a>的申请完全相同。` : `The same filings as <a href="${guidePath(dupOf, l)}">${esc(dupOf.biz.plural.en.toLowerCase())}</a>.`) : "";
    const siblings = guides.filter(x => x.place === g.place && x !== g);
    const qs = ANSWERS.filter(a => a.forms.some(id => g.forms.some(f => f.id === id))).slice(0, 6);
    const tps = topicPages.filter(x => x.place === g.place);
    const body = `${hero(title, answer, [...bitsFor(l, g.forms.length), ...guideChecked(g, l)])}
<div class="cols wrap"><div class="main">
${glance(g.forms, l, [esc(t(g.biz.note, l)), esc(alsoLine), dupLine].filter(Boolean).join(" "))}
${factsSection(g, l)}${steps(g.forms, l)}
${faqHtml(l, qa)}
${embed(title, g.forms, ORIGIN + guidePath(g, l), l)}
${tps.length ? `<section class="more"><h2>${l === "zh" ? `${city}专题` : `More on opening in ${city}`}</h2><ul class="links">${tps.map(x => `<li><a href="${topicPath(x.place, x.topic, l)}">${esc(x.topic.title(city, l))}</a></li>`).join("")}</ul></section>` : ""}
${qs.length ? `<section class="more"><h2>${l === "zh" ? "相关问答" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
<section class="more"><h2>${l === "zh" ? `${city}的其他业务` : `Other businesses in ${city}`}</h2><ul class="links">${siblings.map(x => `<li><a href="${guidePath(x, l)}">${esc(x.biz.plural[l])}</a></li>`).join("")}<li><a href="${bizPath(g.biz, l)}">${l === "zh" ? `其他城市的${esc(g.biz.name.zh)}` : `${esc(g.biz.plural.en)} in other cities`}</a></li></ul></section>
${sourcing(l)}
</div>${rail(g.forms, l)}</div>`;
    const howto = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: inLang(l), dateModified: TODAY, publisher: PUB,
      step: g.forms.map((f, i) => ({ "@type": "HowToStep", position: i + 1, name: t(f.title, l), text: t(f.how, l), url: ORIGIN + guidePath(g, l) + `#s${i + 1}` })) };
    write(guidePath(g, l), page({ l, path: guidePath(g, l), alt: guidePath(g, o), title, desc, body, kind: "guide", ctx: { place: g.place, biz: g.biz }, noindex: !!dupOf,
      ld: [articleLd({ l, path: guidePath(g, l), title, desc: answer, forms: g.forms, about: placeLd(g.place, l) }), howto, faqLd(l, qa)],
      crumbs: [...placeCrumbs(g.place, l), [g.biz.plural[l], guidePath(g, l)]] }));
    urls.push({ path: guidePath(g, l), alt: guidePath(g, o), type: "guide" });
  }

  /* topics in a city */
  for (const tp of topicPages) {
    const city = tp.place.name[l], title = tp.topic.title(city, l);
    let lead = `${t(tp.topic.dek, l)} ${l === "zh" ? `${city}共 ${tp.forms.length} 项相关申请。${feeLine(tp.forms, l)}` : `${city} has ${plural(tp.forms.length, "filing", "filings")} on this. ${feeLine(tp.forms, l)}`}`;
    if (tp.topic.slug === "permit-costs") lead = l === "zh" ? `在${city}，${feeLine(tp.forms, l)}${t(ON_TOP, l)}` : `In ${city}, ${feeLine(tp.forms, l).replace(/^./, ch => ch.toLowerCase())} ${t(ON_TOP, l)}`;
    const desc = `${lead} ${l === "zh" ? `共 ${tp.forms.length} 项申请，附官方链接。` : `${tp.forms.length} filings with official links.`}`.slice(0, 300);
    const body = `${hero(title, lead, [...bitsFor(l, tp.forms.length), ...checkedBit(tp.forms, l)])}
<div class="cols wrap"><div class="main">
${glance(tp.forms, l, dupLink(tp, l))}
${steps(tp.forms, l)}
<section class="more"><h2>${l === "zh" ? `按业务查看${city}指南` : `Guides for each business in ${city}`}</h2><ul class="links">${guides.filter(x => x.place === tp.place).map(x => `<li><a href="${guidePath(x, l)}">${esc(x.biz.plural[l])}</a></li>`).join("")}<li><a href="${permitPath(tp.topic, l)}">${l === "zh" ? "其他城市的同一专题" : "The same topic in other cities"}</a></li></ul></section>
${sourcing(l)}
</div>${rail(tp.forms, l)}</div>`;
    const ld = { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: inLang(l), mainEntity: [{ "@type": "Question", name: title, acceptedAnswer: { "@type": "Answer", text: lead } }] };
    write(topicPath(tp.place, tp.topic, l), page({ l, path: topicPath(tp.place, tp.topic, l), alt: topicPath(tp.place, tp.topic, o), title, desc, body, kind: "topic", ctx: { place: tp.place }, noindex: dupTopicOf.has(tp),
      ld: [articleLd({ l, path: topicPath(tp.place, tp.topic, l), title, desc: lead, forms: tp.forms, about: placeLd(tp.place, l) }), ld],
      crumbs: [...placeCrumbs(tp.place, l), [title, topicPath(tp.place, tp.topic, l)]] }));
    urls.push({ path: topicPath(tp.place, tp.topic, l), alt: topicPath(tp.place, tp.topic, o), type: "topic" });
  }

  /* a city page */
  for (const p of placesUsed) {
    const city = p.name[l], gs = guides.filter(x => x.place === p), tps = topicPages.filter(x => x.place === p);
    const title = l === "zh" ? `在${city}开店：执照与许可指南` : `Opening a business in ${city}: licenses and permits`;
    const lo = Math.min(...gs.map(x => x.forms.length)), hi = Math.max(...gs.map(x => x.forms.length));
    const dek = l === "zh" ? `在${city}开店需要办理 ${lo === hi ? lo : `${lo} 到 ${hi}`} 项申请，视业务而定。这里有 ${gs.length} 类业务的完整申请清单，以及费用、时长、外资、雇佣和续期等 ${tps.length} 个专题。` : `Opening in ${city} takes ${lo === hi ? lo : `${lo} to ${hi}`} filings, depending on the business. Here are the filing lists for ${gs.length} kinds of business, and ${tps.length} topics on costs, timing, foreign owners, hiring and renewals.`;
    const st = stateOf(p);
    const body = `${hero(title, dek, [`${UI.updated[l]} ${day(l)}`, esc(countryName(p.country)[l])])}
<div class="wrap city-page">
<section><h2 class="sec">${l === "zh" ? "按业务" : "By business"}</h2><ul class="tiles">${gs.map(x => `<li><a href="${guidePath(x, l)}"><b>${esc(x.biz.plural[l])}</b><span>${l === "zh" ? `${x.forms.length} 项申请` : `${x.forms.length} filings`}</span></a></li>`).join("")}</ul></section>
<section><h2 class="sec">${l === "zh" ? "按专题" : "By topic"}</h2><ul class="qgrid">${tps.map(x => `<li><a href="${topicPath(p, x.topic, l)}">${esc(x.topic.title(city, l))}</a></li>`).join("")}${STATE_HUBS.includes(st) ? `<li><a href="${statePath(st, l)}">${l === "zh" ? `${US_STATES[st].zh}的州级申请` : `State filings in ${US_STATES[st].en}`}</a></li>` : ""}</ul></section>
</div>`;
    const ld = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + cityPath(p, l) + "#page", name: title, description: dek, inLanguage: inLang(l), url: ORIGIN + cityPath(p, l), isPartOf: { "@id": SITE_ID }, publisher: PUB, about: placeLd(p, l), dateModified: TODAY,
      hasPart: gs.map(x => ({ "@type": "Article", name: x.biz.plural[l], url: ORIGIN + guidePath(x, l) })) };
    write(cityPath(p, l), page({ l, path: cityPath(p, l), alt: cityPath(p, o), title, desc: dek, body, ld: [ld], kind: "city", ctx: { place: p },
      crumbs: placeCrumbs(p, l) }));
    urls.push({ path: cityPath(p, l), alt: cityPath(p, o), type: "hub" });
  }

  /* a page per official form */
  for (const f of FORMS) {
    const name = t(f.title, l);
    // "Food establishment approval: how to file the food establishment approval" says it twice: when the form's own name
    // is the filing's name, the title names it once, with where it applies
    const same = (() => { const w = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, " ").split(/\s+/).filter(y => y.length > 2));
      const a = w(f.form), b = w(name); if (!a.size || !b.size) return f.form === name; let n = 0; for (const x of a) if (b.has(x)) n++; return n / Math.min(a.size, b.size) >= 0.6; })();
    const title = same
      ? (l === "zh" ? `${name}办理指南（${where(f, l)}）` : `How to file the ${lower1(name)} (${where(f, l)})`)
      : (l === "zh" ? `${f.form}：${name}办理指南` : `${f.form}: how to file the ${lower1(name)}`.length > 100 ? `${f.form}: how to file it` : `${f.form}: how to file the ${lower1(name)}`);
    const desc = l === "zh" ? `${t(f.agency, l)}的${name}：谁需要办、如何办理、费用、所需时间${f.fields.length ? "和表格逐行说明" : ""}。` : `${name} from ${t(f.agency, l)}: who files it, how, the fee and how long it takes${f.fields.length ? ", with each line of the form" : ""}.`;
    const users = usedBy.get(f.id) ?? [];
    const qs = ANSWERS.filter(a => a.forms.includes(f.id));
    const body = `${hero(title, t(f.how, l), [esc(t(f.agency, l)), esc(where(f, l)), `${UI.updated[l]} ${day(l)}`, ...checkedBit([f], l)])}
<div class="cols wrap"><div class="main">
<dl class="sheet">
<div><dt>${l === "zh" ? "机构" : "Agency"}</dt><dd>${esc(t(f.agency, l))}</dd></div>
<div><dt>${l === "zh" ? "适用地区" : "Where it applies"}</dt><dd>${esc(where(f, l))}</dd></div>
<div><dt>${l === "zh" ? "办理方式" : "How it's filed"}</dt><dd>${esc(t(METHOD[f.method], l))}</dd></div>
<div><dt>${l === "zh" ? "费用" : "Fee"}</dt><dd>${fee(f, l)}${f.feeNote ? `<small>${esc(t(f.feeNote, l))}</small>` : ""}</dd></div>
${f.takes ? `<div><dt>${l === "zh" ? "所需时间" : "How long it takes"}</dt><dd>${esc(t(f.takes, l))}</dd></div>` : ""}
${f.renews ? `<div><dt>${l === "zh" ? "续期" : "Renewal"}</dt><dd>${esc(t(f.renews, l))}</dd></div>` : ""}
</dl>
${f.foreign ? `<section class="note"><h2>${l === "zh" ? "股东在境外时" : "When the owner is abroad"}</h2><p>${esc(t(f.foreign, l))}</p></section>` : ""}
${f.fields.length ? `<section><h2>${l === "zh" ? "表格逐行说明" : "The form, line by line"}</h2><table class="lines"><thead><tr><th scope="col">${l === "zh" ? "行" : "Line"}</th><th scope="col">${l === "zh" ? "填写内容" : "What goes there"}</th></tr></thead><tbody>${f.fields.map(x => `<tr><th scope="row">${esc(x.line)}</th><td>${esc(t(x.label, l))}${x.options ? `<small>${esc(x.options.join(" / "))}</small>` : ""}${x.hint ? `<small>${esc(t(x.hint, l))}</small>` : ""}</td></tr>`).join("")}</tbody></table></section>` : ""}
${f.attach?.length ? `<section><h2>${l === "zh" ? "需要附上" : "What to attach"}</h2><ul class="plain">${f.attach.map(a => `<li>${esc(t(a, l))}</li>`).join("")}</ul></section>` : ""}
<section><h2>${l === "zh" ? "官方链接" : "Official links"}</h2><ul class="links"><li><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "办理入口" : "Where it's filed"}</a></li>${f.info !== f.url ? `<li><a href="${esc(f.info)}" rel="noopener">${l === "zh" ? "机构说明页" : "The agency's page about it"}</a></li>` : ""}${f.pdf && f.pdf !== f.url ? `<li><a href="${esc(f.pdf)}" rel="noopener">${l === "zh" ? "官方 PDF" : "The official PDF"}</a></li>` : ""}</ul><p class="fine">${sourceNote(f, l)}</p></section>
${qs.length ? `<section class="more"><h2>${l === "zh" ? "相关问答" : "Questions people ask"}</h2><ul class="qlist">${qs.map(a => `<li><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>` : ""}
${sourcing(l)}
</div>
${users.length ? `<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "哪些企业需要" : "Who files it"}</p><ul>${users.slice(0, 14).map(u => `<li><a href="${guidePath(u, l)}">${esc(guideLabel(u, l))}</a></li>`).join("")}</ul><div class="sum"><p>${f.fill ? (l === "zh" ? `快哉会逐行填好 ${f.form}` : `Placetta fills ${f.form} line by line`) : (l === "zh" ? "快哉帮您准备并跟进" : "Placetta prepares and tracks it")}</p><a class="btn" role="link" tabindex="0" data-to="get-plan" data-track="rail_cta">${UI.plan[l]}</a></div></div></aside>` : ""}
</div>`;
    const svc = { "@context": "https://schema.org", "@type": "GovernmentService", name: name, alternateName: f.form, description: t(f.how, l), url: f.info,
      provider: { "@type": "GovernmentOrganization", name: t(f.agency, l) }, areaServed: where(f, l), availableChannel: { "@type": "ServiceChannel", serviceUrl: f.url },
      ...(typeof f.fee === "number" ? { offers: { "@type": "Offer", price: f.fee, priceCurrency: f.currency ?? "USD", description: l === "zh" ? "政府规费" : "Government fee" } } : {}) };
    const ld = { "@context": "https://schema.org", "@type": "HowTo", name: title, description: desc, inLanguage: inLang(l), dateModified: TODAY, publisher: PUB,
      step: [{ "@type": "HowToStep", text: t(f.how, l) }, ...(f.fields.length ? [{ "@type": "HowToStep", text: (l === "zh" ? "填写：" : "Fill in: ") + f.fields.map(x => t(x.label, l)).join(l === "zh" ? "；" : "; ") }] : []), { "@type": "HowToStep", text: (l === "zh" ? "提交至：" : "File at: ") + f.url }] };
    write(formPath(f, l), page({ l, path: formPath(f, l), alt: formPath(f, o), title, desc, body, kind: "form",
      ld: [articleLd({ l, path: formPath(f, l), title, desc, forms: [f], about: { "@type": "GovernmentService", name, url: f.info } }), svc, ld],
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.forms[l], `${base(l)}/`, "forms"], [f.form, formPath(f, l)]] }));
    urls.push({ path: formPath(f, l), alt: formPath(f, o), type: "form" });
  }

  /* related answers: the ones sharing a form or a city first, then the next ones in the list, so every answer gets links */
  const related = (a: (typeof ANSWERS)[number]) => {
    const i = ANSWERS.indexOf(a), places = new Set([...(a.plan ?? []).map(x => x.place), a.cost?.place].filter(Boolean));
    const score = (x: (typeof ANSWERS)[number]) => 2 * x.forms.filter(f => a.forms.includes(f)).length + [...(x.plan ?? []).map(y => y.place), x.cost?.place].filter(pl => pl && places.has(pl)).length;
    return ANSWERS.filter(x => x !== a).map(x => ({ x, s: score(x), d: (ANSWERS.indexOf(x) - i + ANSWERS.length) % ANSWERS.length }))
      .sort((p, q) => q.s - p.s || p.d - q.d).slice(0, 8).map(r => r.x);
  };
  /* a page per question */
  for (const a of ANSWERS) {
    let short = a.a[l], forms = a.forms.map(id => formById(id)!).filter(Boolean);
    const rel = (a.plan ?? []).map(x => findGuide(x.place, x.seg)).filter((x): x is Guide => !!x);
    // the sign-up box names a city only when the answer is about one city; a state or federal question gets the generic box
    let place: Place | undefined = rel.length && rel.every(g => g.place === rel[0].place) ? rel[0].place : undefined;
    if (a.cost) {
      const g = findGuide(a.cost.place, "restaurant")!; const c = costOf(g.forms); forms = g.forms; rel.unshift(g); place = g.place;
      short = l === "zh"
        ? `${g.place.name.zh}开餐厅的 ${g.forms.length} 项申请中，固定政府规费合计约 ${money(c.total, c.cur)}（${c.fixed.map(f => `${t(f.title, l)} ${money(f.fee as number, c.cur)}`).join("，")}）。另有 ${c.varies.length} 项按场所或业务计算，${c.free.length} 项免费。装修、保险和顾问费用不在其内。`
        : `Across the ${g.forms.length} filings a restaurant in ${g.place.name.en} makes, the fixed government fees add up to about ${money(c.total, c.cur)} (${c.fixed.map(f => `${lower1(t(f.title, l))} ${money(f.fee as number, c.cur)}`).join(", ")}). ${c.varies.length} more are set by the space or the business, and ${c.free.length} are free. Build-out, insurance and adviser costs are on top.`;
    }
    const q = a.q[l];
    const items = forms.map(f => `<li><h3><a href="${formPath(f, l)}">${esc(t(f.title, l))}</a></h3><p class="by">${esc(t(f.agency, l))}<span>${esc(where(f, l))}</span></p><p>${esc(t(f.how, l))}</p>${facts(f, l)}<p class="src"><a href="${esc(f.url)}" rel="noopener">${l === "zh" ? "机构官网" : "The agency's site"}</a></p></li>`).join("");
    const body = `${hero(q, clean(short), [`${UI.updated[l]} ${day(l)}`, l === "zh" ? "来源：各机构官网" : "Sources: the agencies' own sites", ...checkedBit(forms, l)])}
<div class="cols wrap"><div class="main">
${forms.length ? `<section><h2>${l === "zh" ? (a.cost ? "每项申请及费用" : "相关表格") : (a.cost ? "Every filing and its fee" : "The forms involved")}</h2><ol class="cards">${items}</ol></section>` : ""}
${rel.length ? `<section class="more"><h2>${l === "zh" ? "完整指南" : "Full guides"}</h2><ul class="links">${rel.map(g => `<li><a href="${guidePath(g, l)}">${esc(guideLabel(g, l))}</a></li>`).join("")}</ul></section>` : ""}
${sourcing(l, true)}
</div>
<aside class="rail"><div class="rail-in"><p class="rail-h">${l === "zh" ? "更多问答" : "More answers"}</p><ul>${related(a).map(x => `<li><a href="${answerPath(x.slug, l)}">${esc(x.q[l])}</a></li>`).join("")}</ul></div></aside>
</div>`;
    const ld = faqLd(l, [[q, clean(short)]]);
    write(answerPath(a.slug, l), page({ l, path: answerPath(a.slug, l), alt: answerPath(a.slug, o), title: q, desc: clean(short).slice(0, 155), body, kind: "answer", ctx: { place },
      ld: [articleLd({ l, path: answerPath(a.slug, l), title: q, desc: clean(short), forms, ...(place ? { about: placeLd(place, l) } : {}) }), ld],
      crumbs: [[UI.guides[l], base(l) + "/"], [UI.answers[l], `${base(l)}/`, "answers"], [q, answerPath(a.slug, l)]] }));
    urls.push({ path: answerPath(a.slug, l), alt: answerPath(a.slug, o), type: "answer" });
  }

  /* hubs by kind of business: every city's guide for it, with its filings and fixed fees in one table */
  const bizHubs: { b: Biz; gs: Guide[] }[] = [];
  const bizSeen = new Map<string, Biz>();
  for (const b of [...BUSINESSES].sort((x, y) => PRIMARY.indexOf(x.slug) - PRIMARY.indexOf(y.slug))) {
    const gs = guides.filter(g => g.biz === b); if (gs.length < 2) continue;
    // the same hub as an earlier one when, city by city, its guide is the same page as that one's (or points to it)
    const k = gs.map(g => g.place.slug + ":" + sigG(dupGuide.get(g) ?? g)).join("|"), same = bizSeen.get(k); if (!same) bizSeen.set(k, b);
    bizHubs.push({ b, gs }); if (l === "en") bizHubsEn.push({ b });
    const title = l === "zh" ? `${b.name.zh}开店执照与许可：按城市查看` : `Licenses and permits to open ${an(b.name.en)} ${b.name.en}, city by city`;
    const counts = gs.map(g => g.forms.length), lo = Math.min(...counts), hi = Math.max(...counts);
    const dek = l === "zh" ? `在快哉覆盖的 ${gs.length} 座城市开${b.name.zh}，需要办理 ${lo === hi ? lo : `${lo} 到 ${hi}`} 项申请，视城市而定。${t(b.note, l)}下表列出每座城市的申请数量和固定政府规费。` : `${b.plural.en} file ${lo === hi ? lo : `${lo} to ${hi}`} filings to open, depending on the city, across the ${gs.length} cities Placetta covers. ${t(b.note, l)} The table lists each city's filings and fixed government fees.`;
    const rows = gs.map(g => { const c = costOf(g.forms); return `<tr><th scope="row"><a href="${guidePath(g, l)}">${esc(g.place.name[l])}</a></th><td>${esc(countryName(g.place.country)[l])}</td><td>${g.forms.length}</td><td>${c.fixed.length ? money(c.total, c.cur) : (l === "zh" ? "无固定规费" : "None fixed")}</td><td>${c.varies.length}</td></tr>`; }).join("\n");
    const body = `${hero(title, dek, [`${UI.updated[l]} ${day(l)}`, l === "zh" ? `${gs.length} 座城市` : `${gs.length} cities`, ...checkedBit(gs.flatMap(g => g.forms), l)])}
<div class="cols wrap"><div class="main">
<section class="glance"><h2>${l === "zh" ? "各城市一览" : "Every city at a glance"}</h2><div class="tscroll"><table class="lines gl"><thead><tr><th scope="col">${l === "zh" ? "城市" : "City"}</th><th scope="col">${l === "zh" ? "国家" : "Country"}</th><th scope="col">${l === "zh" ? "申请数" : "Filings"}</th><th scope="col">${l === "zh" ? "固定政府规费" : "Fixed government fees"}</th><th scope="col">${l === "zh" ? "视情况而定" : "Fees that vary"}</th></tr></thead><tbody>
${rows}
</tbody></table></div></section>
<section class="more"><h2>${l === "zh" ? "其他业务" : "Other kinds of business"}</h2><ul class="links">${BUSINESSES.filter(x => x !== b && guides.filter(g => g.biz === x).length >= 2).map(x => `<li><a href="${bizPath(x, l)}">${esc(x.plural[l])}</a></li>`).join("")}</ul></section>
${sourcing(l)}
</div></div>`;
    const ldc = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + bizPath(b, l) + "#page", name: title, description: dek, inLanguage: inLang(l), url: ORIGIN + bizPath(b, l), isPartOf: { "@id": SITE_ID }, publisher: PUB, dateModified: TODAY,
      hasPart: gs.map(g => ({ "@type": "Article", name: guideLabel(g, l), url: ORIGIN + guidePath(g, l) })) };
    write(bizPath(b, l), page({ l, path: bizPath(b, l), alt: bizPath(b, o), title, desc: dek.slice(0, 300), body, ld: [ldc], kind: "topic", noindex: !!same, ctx: { biz: b },
      crumbs: [[UI.guides[l], base(l) + "/"], [b.plural[l], bizPath(b, l)]] }));
    urls.push({ path: bizPath(b, l), alt: bizPath(b, o), type: "hub" });
  }

  /* hubs by permit type: one topic across every city */
  const permitHubs = TOPICS.map(tp => ({ tp, ps: topicPages.filter(x => x.topic === tp) })).filter(x => x.ps.length >= 3);
  for (const { tp, ps } of permitHubs) {
    const title = tp.title(l === "zh" ? "各城市" : "each city", l);
    const dek = `${t(tp.dek, l)} ${l === "zh" ? `覆盖 ${ps.length} 座城市，下表列出每座城市的相关申请数和固定政府规费。` : `${ps.length} cities, each with its number of filings and fixed government fees.`}`;
    const rows = ps.map(x => { const c = costOf(x.forms); return `<tr><th scope="row"><a href="${topicPath(x.place, tp, l)}">${esc(x.place.name[l])}</a></th><td>${esc(countryName(x.place.country)[l])}</td><td>${x.forms.length}</td><td>${c.fixed.length ? money(c.total, c.cur) : (l === "zh" ? "无固定规费" : "None fixed")}</td></tr>`; }).join("\n");
    const body = `${hero(title, dek, [`${UI.updated[l]} ${day(l)}`, ...checkedBit(ps.flatMap(x => x.forms), l)])}
<div class="cols wrap"><div class="main">
<section class="glance"><h2>${l === "zh" ? "各城市一览" : "Every city at a glance"}</h2><div class="tscroll"><table class="lines gl"><thead><tr><th scope="col">${l === "zh" ? "城市" : "City"}</th><th scope="col">${l === "zh" ? "国家" : "Country"}</th><th scope="col">${l === "zh" ? "申请数" : "Filings"}</th><th scope="col">${l === "zh" ? "固定政府规费" : "Fixed government fees"}</th></tr></thead><tbody>
${rows}
</tbody></table></div></section>
<section class="more"><h2>${l === "zh" ? "其他专题" : "Other topics"}</h2><ul class="links">${permitHubs.filter(x => x.tp !== tp).map(x => `<li><a href="${permitPath(x.tp, l)}">${esc(x.tp.title(l === "zh" ? "各城市" : "each city", l))}</a></li>`).join("")}</ul></section>
${sourcing(l)}
</div></div>`;
    const ldc = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + permitPath(tp, l) + "#page", name: title, description: dek, inLanguage: inLang(l), url: ORIGIN + permitPath(tp, l), isPartOf: { "@id": SITE_ID }, publisher: PUB, dateModified: TODAY,
      hasPart: ps.map(x => ({ "@type": "Article", name: tp.title(x.place.name[l], l), url: ORIGIN + topicPath(x.place, tp, l) })) };
    write(permitPath(tp, l), page({ l, path: permitPath(tp, l), alt: permitPath(tp, o), title, desc: dek.slice(0, 300), body, ld: [ldc], kind: "topic",
      crumbs: [[UI.guides[l], base(l) + "/"], [title, permitPath(tp, l)]] }));
    urls.push({ path: permitPath(tp, l), alt: permitPath(tp, o), type: "hub" });
  }

  /* hubs by US state: the state's own filings, then its cities */
  for (const code of STATE_HUBS) {
    const st = US_STATES[code][l], sf = stateForms(code), ps = placesUsed.filter(p => stateOf(p) === code);
    const title = l === "zh" ? `在${st}开店：州级执照、许可与登记` : `Opening a business in ${st}: state licenses, permits and registrations`;
    const dek = l === "zh" ? `${st}的 ${sf.length} 项州级申请，以及 ${ps.length} 座城市的完整指南。${feeLine(sf, l)}` : `The ${sf.length} state-level filings in ${st}, and full guides for ${plural(ps.length, "city", "cities")} there. ${feeLine(sf, l)}`;
    const body = `${hero(title, dek, [`${UI.updated[l]} ${day(l)}`, ...checkedBit(sf, l)])}
<div class="cols wrap"><div class="main">
${glance(sf, l, "", false)}
<section class="more"><h2>${l === "zh" ? `${st}的城市指南` : `City guides in ${st}`}</h2><ul class="links">${ps.map(p => `<li><a href="${cityPath(p, l)}">${esc(p.name[l])}</a></li>`).join("")}</ul></section>
${sourcing(l)}
</div></div>`;
    const ldc = { "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + statePath(code, l) + "#page", name: title, description: dek, inLanguage: inLang(l), url: ORIGIN + statePath(code, l), isPartOf: { "@id": SITE_ID }, publisher: PUB, dateModified: TODAY,
      about: { "@type": "State", name: st }, citation: [...new Set(sf.map(f => f.url))].map(u => ({ "@type": "CreativeWork", url: u })), hasPart: ps.map(p => ({ "@type": "CollectionPage", name: p.name[l], url: ORIGIN + cityPath(p, l) })) };
    write(statePath(code, l), page({ l, path: statePath(code, l), alt: statePath(code, o), title, desc: dek.slice(0, 300), body, ld: [ldc], kind: "topic",
      crumbs: [[UI.guides[l], base(l) + "/"], [st, statePath(code, l)]] }));
    urls.push({ path: statePath(code, l), alt: statePath(code, o), type: "hub" });
  }

  /* the hub */
  const nGuides = guides.length + topicPages.length;
  const hubTitle = l === "zh" ? "每座城市开店所需的执照，一目了然" : "Every license to open, city by city";
  const hubDek = l === "zh" ? `品牌扩张最快的 ${placesUsed.length} 座城市，${BUSINESSES.length} 类业务，${FORMS.length} 张官方表格：每项申请的机构、顺序、费用和官方链接。` : `The ${placesUsed.length} cities brands are expanding into fastest, ${BUSINESSES.length} kinds of business and ${FORMS.length} official forms: every filing with its agency, order, fee and official link.`;
  const regionPanels = REGIONS.map(r => {
    const ps = placesUsed.filter(p => REGION(p.country) === r.id);
    return `<div class="panel" id="r-${r.id}" role="tabpanel" aria-labelledby="t-${r.id}"><ul class="citygrid">${ps.map(p => {
      const gs = guides.filter(g => g.place === p);
      return `<li class="city" data-f="${esc((p.name.en + " " + p.name.zh + " " + countryName(p.country).en + " " + countryName(p.country).zh).toLowerCase())}"><a class="city-h" href="${cityPath(p, l)}"><b>${esc(p.name[l])}</b><span>${esc(countryName(p.country)[l])}</span></a><p class="city-biz">${gs.slice(0, 5).map(g => `<a href="${guidePath(g, l)}">${esc(g.biz.plural[l])}</a>`).join("")}</p><a class="city-all" href="${cityPath(p, l)}">${l === "zh" ? `全部 ${gs.length + topicPages.filter(x => x.place === p).length} 份指南` : `All ${gs.length + topicPages.filter(x => x.place === p).length} guides`}</a></li>`;
    }).join("")}</ul></div>`;
  }).join("");
  const agencies = [...new Set(FORMS.map(f => where(f, l)))];
  const hub = `<header class="hero hub-hero wrap"><h1>${esc(hubTitle)}</h1><p class="dek">${esc(hubDek)}</p>
<form class="find" role="search"><label class="sr" for="q">${l === "zh" ? "搜索城市、表格或问题" : "Search cities, forms or questions"}</label><input id="q" type="search" autocomplete="off" placeholder="${l === "zh" ? "搜索城市、表格或问题，例如 上海 或 SS-4" : "Search a city, form or question, e.g. Dubai or SS-4"}"><p class="count" id="count" aria-live="polite"></p></form>
<dl class="stats"><div><dt>${l === "zh" ? "城市" : "Cities"}</dt><dd>${placesUsed.length}</dd></div><div><dt>${l === "zh" ? "指南" : "Guides"}</dt><dd>${nGuides}</dd></div><div><dt>${l === "zh" ? "官方表格" : "Official forms"}</dt><dd>${FORMS.length}</dd></div><div><dt>${l === "zh" ? "语言" : "Languages"}</dt><dd>2</dd></div></dl>${sponsors(l)}</header>
<section class="wrap block" id="cities"><h2 class="sec">${l === "zh" ? "品牌正在扩张的城市" : "Where brands are expanding"}</h2>
<div class="tabs" role="tablist" aria-label="${l === "zh" ? "地区" : "Region"}">${REGIONS.map((r, i) => `<button type="button" role="tab" id="t-${r.id}" aria-controls="r-${r.id}" aria-selected="${i === 0}">${esc(r.name[l])}<span>${placesUsed.filter(p => REGION(p.country) === r.id).length}</span></button>`).join("")}</div>
${regionPanels}</section>
<section class="wrap block" id="by-business"><h2 class="sec">${l === "zh" ? "按行业" : "By sector"}</h2>
${SECTORS.map(sc => ({ sc, hs: bizHubs.filter(x => x.b.sector === sc.id) })).filter(x => x.hs.length).map(({ sc, hs }) => `<div class="sector" id="sector-${sc.id}"><h3>${esc(sc.name[l])}</h3><ul class="qgrid">${hs.map(x => `<li><a href="${bizPath(x.b, l)}">${esc(x.b.plural[l])}</a></li>`).join("")}</ul></div>`).join("\n")}</section>
<section class="wrap block" id="by-permit"><h2 class="sec">${l === "zh" ? "按许可类型" : "By kind of permit"}</h2><ul class="qgrid">${permitHubs.map(x => `<li><a href="${permitPath(x.tp, l)}">${esc(x.tp.title(l === "zh" ? "各城市" : "each city", l))}</a></li>`).join("")}</ul></section>
<section class="wrap block" id="by-state"><h2 class="sec">${l === "zh" ? "按美国州" : "By US state"}</h2><ul class="qgrid">${STATE_HUBS.map(c => `<li><a href="${statePath(c, l)}">${esc(US_STATES[c][l])}</a></li>`).join("")}</ul></section>
<section class="wrap block" id="answers"><h2 class="sec">${UI.answers[l]}</h2><ul class="qgrid">${ANSWERS.map(a => `<li data-f="${esc((a.q.en + " " + a.q.zh).toLowerCase())}"><a href="${answerPath(a.slug, l)}">${esc(a.q[l])}</a></li>`).join("")}</ul></section>
<section class="wrap block" id="forms"><h2 class="sec">${UI.forms[l]}</h2>
${agencies.map(w => { const fs = FORMS.filter(f => where(f, l) === w); return `<details class="fgroup"${w === (l === "zh" ? "美国联邦" : "US federal") ? " open" : ""}><summary><b>${esc(w)}</b><span>${fs.length}</span></summary><ul class="fgrid">${fs.map(f => `<li data-f="${esc((f.form + " " + f.title.en + " " + f.title.zh + " " + f.agency.en + " " + f.agency.zh).toLowerCase())}"><a href="${formPath(f, l)}"><b>${esc(f.form)}</b><span>${esc(t(f.title, l))}</span></a></li>`).join("")}</ul></details>`; }).join("")}
</section>`;
  const ld = [{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": ORIGIN + base(l) + "/#page", name: hubTitle, description: hubDek, inLanguage: inLang(l), url: ORIGIN + base(l) + "/", isPartOf: { "@id": SITE_ID }, publisher: PUB, dateModified: TODAY }, ORG,
    websiteLd(SEARCH_PATH)];
  write(base(l) + "/", page({ l, path: base(l) + "/", alt: base(o) + "/", title: hubTitle, desc: hubDek, body: hub, ld, kind: "hub", crumbs: [[UI.home[l], "/"], [UI.guides[l], base(l) + "/"]] }));
  urls.push({ path: base(l) + "/", alt: base(o) + "/", type: "hub" });
}

/* ------------------------------------------------------------ assets, data and the files engines read */

writeFileSync("site/guides/guides.css", readFileSync("scripts/guides.css", "utf8"));
writeFileSync("site/guides/guides.js", readFileSync("scripts/guides.js", "utf8"));
if (keepOg) writeFileSync("site/guides/og.png", keepOg);
if (LOGOS.length) { mkdirSync("site/guides/sponsors", { recursive: true }); for (const x of LOGOS) writeFileSync(`site/guides/sponsors/${x.file}`, x.bytes); }

const data = {
  updated: TODAY, publisher: "Placetta", url: ORIGIN + "/guides/",
  cities: placesUsed.map(p => ({ city: p.name.en, country: countryName(p.country).en, url: ORIGIN + cityPath(p, "en"),
    guides: guides.filter(g => g.place === p).map(g => ({ business: g.biz.plural.en, url: ORIGIN + guidePath(g, "en"), filings: g.forms.map(f => ({ name: f.title.en, agency: f.agency.en, fee: f.fee, currency: f.currency ?? "USD", official_link: f.url })),
      ...(g.facts.length ? { differs: g.facts.map(k => ({ fact: k.text.en, agency: k.agency.en, quote: k.proof.quote, official_link: k.proof.read, read: k.seen })) } : {}) })) })),
  answers: ANSWERS.map(a => ({ question: a.q.en, url: ORIGIN + answerPath(a.slug, "en") })),
  // the counts every page quotes (llms.txt, the About page), so no number is written by hand anywhere
  coverage: { cities: placesUsed.length, countries: new Set(placesUsed.map(p => p.country)).size, us_cities: placesUsed.filter(p => p.country === "US").length,
    business_kinds: BUSINESSES.length, business_guides: guides.length, topic_pages: topicPages.length, official_forms: FORMS.length, answers: ANSWERS.length,
    indexed_pages: urls.filter(u => !NOINDEX.has(u.path)).length, languages: ["en", "zh-CN"] },
  hubs: {
    business: bizHubsEn.map(x => ({ name: x.b.plural.en, url: ORIGIN + bizPath(x.b, "en") })),
    permits: TOPICS.filter(tp => topicPages.filter(x => x.topic === tp).length >= 3).map(tp => ({ name: tp.title("each city", "en"), url: ORIGIN + permitPath(tp, "en") })),
    states: STATE_HUBS.map(c => ({ name: US_STATES[c].en, url: ORIGIN + statePath(c, "en") })),
  },
};
writeFileSync("site/guides/data.json", JSON.stringify(data));

const indexed = (g: Guide) => !dupGuide.has(g);
writeFileSync("site/llms-full.txt", `# Placetta license guides (full text)

Updated ${TODAY}. Source: ${ORIGIN}/guides/. Publisher: Placetta (${ORIGIN}/about.html). Sourcing policy: ${ORIGIN}/editorial.html. General information, not legal advice; check each agency's page before filing.

## Answers
${ANSWERS.map(a => {
  if (a.cost) { const g = findGuide(a.cost.place, "restaurant")!; const c = costOf(g.forms); return `### ${a.q.en}\nAcross the ${g.forms.length} filings a restaurant in ${g.place.name.en} makes, the fixed government fees add up to about ${money(c.total, c.cur)}; ${c.varies.length} more depend on the space or business and ${c.free.length} are free. ${ORIGIN}${answerPath(a.slug, "en")}`; }
  return `### ${a.q.en}\n${clean(a.a.en)} ${ORIGIN}${answerPath(a.slug, "en")}`;
}).join("\n\n")}

## City guides
${guides.filter(indexed).map(g => `### ${g.biz.plural.en} in ${g.place.name.en}\n${ORIGIN}${guidePath(g, "en")}\n${guideAnswer(g, "en")}${alsoGuide.get(g) ? ` The same filings apply to ${listEn(alsoGuide.get(g)!.map(x => x.biz.plural.en.toLowerCase()))}.` : ""}\n${g.forms.map((f, i) => `${i + 1}. ${f.title.en}, ${f.agency.en}. ${clean(f.how.en)} Fee: ${fee(f, "en")}.${f.takes ? ` Takes: ${clean(f.takes.en)}` : ""} ${f.url}`).join("\n")}${g.facts.length ? `\n${factsHeading(g, "en")}:\n${g.facts.map(k => `- ${clean(k.text.en)} ${k.agency.en}: "${k.proof.quote}" ${k.proof.read} (read ${k.seen})`).join("\n")}` : ""}`).join("\n\n")}
`);

/* sitemaps by type (the index, sitemap.xml, and the website's own pages come from scripts/seo/build.mjs); noindex pages stay out */
mkdirSync("site/sitemaps", { recursive: true });
for (const type of ["hub", "guide", "topic", "form", "answer"] as Kind[]) {
  const rows = urls.filter(u => u.type === type && !NOINDEX.has(u.path)).map(u => `<url><loc>${ORIGIN}${u.path}</loc><lastmod>${lastmodOf(u.path)}</lastmod><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "zh-CN" : "en"}" href="${ORIGIN}${u.path}"/><xhtml:link rel="alternate" hreflang="${u.path.includes("/zh/") ? "en" : "zh-CN"}" href="${ORIGIN}${u.alt}"/><xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${u.path.includes("/zh/") ? u.alt : u.path}"/></url>`);
  writeFileSync(`site/sitemaps/guides-${type}s.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${rows.join("\n")}\n</urlset>\n`);
}
writeFileSync(DATES_FILE, JSON.stringify(Object.fromEntries(Object.entries(NEXT_DATES).sort()), null, 0).replace(/},"/g, '},\n"') + "\n");
writeFileSync("site/guides/urls.txt", urls.filter(u => !NOINDEX.has(u.path)).map(u => ORIGIN + u.path).join("\n") + "\n");
console.log(`guides: ${urls.length} pages (${urls.length - NOINDEX.size} indexed, ${NOINDEX.size} near-duplicates noindexed): per language ${placesUsed.length} cities, ${guides.length} business guides, ${topicPages.length} topic pages, ${FORMS.length} form pages, ${ANSWERS.length} answers, ${STATE_HUBS.length} state hubs`);
