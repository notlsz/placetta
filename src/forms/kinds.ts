// What differs by kind of food business: the facts an official page states about milk tea and bubble tea shops, coffee
// shops or bakeries (and, where a page states it for restaurants alone, restaurants) that don't hold for the others in
// the same place. Each one is the agency's own sentence (under 25 words, as fetched), the page it was read on and the
// day. Read 2026-10-21 with curl (scripts/eval/proof-read.py) or, where the site refuses automated reads, through
// WebFetch, asked whether the exact words are on the page.
//
// A fact is shown only while its quote is current (src/plan/ask.ts proofCurrent): the instant plan (src/plan/preview.ts)
// lists it and attaches it to the row it bears on, the agent's forms tool returns it, and the guides
// (scripts/build-guides.mts) print it, so a milk tea shop's guide differs from a restaurant's only by what an official
// page says. Nothing here is a filing: the filings stay in the registry. A fact that names a condition ("if you sell
// wholesale") says so, and never claims the condition holds.
import { B, type Bi } from "../bi";
import type { Level } from "../model";

export type StoreKind = "tea" | "coffee" | "bakery" | "restaurant";
export type KindFact = {
  id: string;
  kinds: StoreKind[];          // the kinds of business it is about
  where: string;               // where it applies: a state ("CA"), a county ("KC") or a city ("NYC"), as in the registry
  about?: "food" | "plan" | "building" | "license";   // the plan row it bears on (src/plan/preview.ts roles)
  title: Bi;                   // one line
  text: Bi;                    // what it means for the shop, in plain words
  agency: Bi;
  level: Level;
  proof: { quote: string; checked: string; read: string };
};

const READ = "2026-10-21";
const P = (read: string, quote: string) => ({ quote, read, checked: READ });

const KC_RISK = "https://cdn.kingcounty.gov/-/media/king-county/depts/dph/documents/certificates-permits-licenses/food-worker-business-permits/permanent-businesses/food-establishment-risk-levels.pdf?rev=fa5058bfe2344c0da374012f74cac082&hash=6343EB80E0FD05EB643F9899D4DA212D";
const FDACS = "https://www.fdacs.gov/Business-Services/Food/Food-Establishments/Retail-Food-Establishment-Permit";
const DBPR_JUR = "https://www2.myfloridalicense.com/hotels-restaurants/licensing/jurisdiction/";
const VA_MOU = "https://www.vdh.virginia.gov/content/uploads/sites/20/VDH-VDACS-Retail-MOU-Signed-2025.pdf";
const MDA = "https://www.mda.state.mn.us/food-feed/food-licenses";
const MARICOPA = "https://listos.maricopa.gov/DocumentCenter/View/44074/Permit-Type-Class-and-Inspection-Frequency-PDF";
const NYC_GREASE = "https://ht.nyc-business.nyc.gov/nycbusiness/description/grease-interceptor-information";
const LAC_CONSTRUCT = "https://admin.publichealth.lacounty.gov/eh/inspection/construction-requirements-retail-food-facilities.htm";

export const KIND_FACTS: KindFact[] = [
  /* ------------------------------------------------ New York ------------------------------------------------ */
  {
    id: "ny-wholesale-bakery", kinds: ["bakery"], where: "NY", about: "food", level: "state",
    title: B("Baking for other businesses takes a state food processing license", "为其他商家烘焙须取得州食品加工执照"),
    text: B("New York State licenses wholesale bakeries under Article 20-C, a food processing establishment license from the Department of Agriculture and Markets. It applies if the bakery sells to other stores, cafes or restaurants.",
      "纽约州依据第 20-C 条为批发烘焙坊发放食品加工场所执照，由州农业与市场部签发。烘焙店若向其他商店、咖啡店或餐厅供货，即须办理。"),
    agency: B("New York State Department of Agriculture and Markets", "纽约州农业与市场部"),
    proof: P("https://agriculture.ny.gov/food-business-licensing", "Article 20-C Food Processing Establishment licenses apply to food manufactures, processing plants, wholesale bakeries,"),
  },
  {
    id: "nyc-grease-restaurant", kinds: ["restaurant"], where: "NYC", about: "building", level: "city",
    title: B("A restaurant needs a grease interceptor", "餐厅须安装隔油器"),
    text: B("New York City requires a grease interceptor of a business that produces and disposes of fat, oil or grease, like a restaurant. A licensed plumber installs it, and the Department of Environmental Protection checks that businesses have and maintain one.",
      "纽约市要求产生并排放油脂的企业（如餐厅）安装隔油器，须由持证水管工安装，环境保护局会检查企业是否安装并维护。"),
    agency: B("NYC Department of Environmental Protection", "纽约市环境保护局"),
    proof: P(NYC_GREASE, "like a restaurant, food processing establishment, hospital or day care and senior center, you need a grease interceptor."),
  },
  {
    id: "nyc-grease-drinks", kinds: ["tea", "coffee", "bakery"], where: "NYC", about: "building", level: "city",
    title: B("A grease interceptor depends on what the kitchen does", "是否需要隔油器取决于后厨做什么"),
    text: B("New York City requires a grease interceptor of a business that produces and disposes of fat, oil or grease; its examples are restaurants and food processing establishments. Whether your shop needs one turns on what its kitchen makes, and a licensed plumber sizes it.",
      "纽约市要求产生并排放油脂的企业安装隔油器，列举的例子是餐厅和食品加工场所。您的店是否需要，取决于后厨制作什么；由持证水管工确定规格。"),
    agency: B("NYC Department of Environmental Protection", "纽约市环境保护局"),
    proof: P(NYC_GREASE, "like a restaurant, food processing establishment, hospital or day care and senior center, you need a grease interceptor."),
  },

  /* ------------------------------------------------ California ------------------------------------------------ */
  {
    id: "ca-takeout-restrooms", kinds: ["tea", "coffee", "bakery"], where: "CA", about: "plan", level: "state",
    title: B("Seats bring customer restrooms with them", "设座位就要设顾客洗手间"),
    text: B("Under California's food code, a food facility in a building built after January 1, 2004 that gives customers space to eat or drink on the premises must provide clean restrooms for them. The rule turns on that space, so whether to add seats is a build-out decision.",
      "根据加州食品法规，2004 年 1 月 1 日以后建成的建筑内，凡为顾客提供店内用餐或饮用空间的食品设施，都须为顾客提供洁净的洗手间。规定以是否有该空间为准，因此是否设座位是装修阶段就要决定的事。"),
    agency: B("California Retail Food Code, as Los Angeles County's construction guide states it", "加州零售食品法规（据洛杉矶县施工要求）"),
    proof: P(LAC_CONSTRUCT, "that provides space for the consumption of food on the premises shall provide clean toilet facilities in good repair for consumers"),
  },
  {
    id: "ca-wholesale-bakery", kinds: ["bakery"], where: "CA", about: "food", level: "state",
    title: B("Selling wholesale adds a state registration", "批发销售须办理州级登记"),
    text: B("California's Processed Food Registration, from the Department of Public Health, covers bakery products. A retail food facility that sells directly to consumers under a county health permit is exempt, so a bakery selling only over its own counter doesn't need it; making goods for other stores or cafes falls outside that exemption.",
      "加州公共卫生部的加工食品登记（PFR）涵盖烘焙产品。持县卫生许可、直接向消费者销售的零售食品设施可豁免，因此只在自家柜台销售的烘焙店无需办理；为其他商店或咖啡店制作商品则不在豁免范围内。"),
    agency: B("California Department of Public Health", "加州公共卫生部"),
    proof: P("https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/PFRFAQs.aspx", "General foods such as bakery products, noodles, seafood (except molluscan shellfish)"),
  },

  /* ---------------------------------------- Seattle and King County ---------------------------------------- */
  {
    id: "kc-coffee-risk", kinds: ["coffee"], where: "KC", about: "food", level: "county",
    title: B("A coffee shop is King County's lowest risk category", "咖啡店属于金县最低风险类别"),
    text: B("King County puts a coffee shop in risk Category 1 (low), with one routine inspection a year, when it prepares espresso and blended drinks from commercially packaged products. Cooking or baking on site moves it up a category.",
      "金县将以商业包装原料制作意式咖啡和调制饮品的咖啡店列为第 1 类（低风险），每年例行检查一次。店内烹饪或烘焙会提高风险类别。"),
    agency: B("Public Health – Seattle & King County", "西雅图与金县公共卫生局"),
    proof: P(KC_RISK, "Scooping ice cream, preparing espresso and/or blended drinks with commercially packaged products."),
  },
  {
    id: "kc-bakery-risk", kinds: ["bakery"], where: "KC", about: "food", level: "county",
    title: B("A bakery is King County's moderate risk category", "烘焙店属于金县中风险类别"),
    text: B("King County puts a bakery in risk Category 2 (moderate): one routine inspection a year plus an educational visit. Hot holding or cooling food that needs temperature control, or using Time as a Public Health Control, moves it to Category 3.",
      "金县将烘焙店列为第 2 类（中风险）：每年例行检查一次，另有一次指导性访问。对需温控的食品进行热保温或冷却，或采用时间作为公共卫生控制手段，会使其升为第 3 类。"),
    agency: B("Public Health – Seattle & King County", "西雅图与金县公共卫生局"),
    proof: P(KC_RISK, "Making smoothies, baking cake, frying donuts, and grilling/toasting sandwiches for immediate service."),
  },
  {
    id: "kc-tea-tphc", kinds: ["tea"], where: "KC", about: "food", level: "county",
    title: B("Holding food on time instead of temperature raises the risk category", "以时间而非温度控制食品会提高风险类别"),
    text: B("King County sets the risk category by the menu: drinks made only from commercially packaged products are Category 1 (low), but using Time as a Public Health Control, holding a food out of temperature control for a set time, makes it Category 3 (high), with two routine inspections a year.",
      "金县按菜单确定风险类别：仅用商业包装原料制作饮品属第 1 类（低风险）；若采用时间作为公共卫生控制手段（在限定时间内将食品置于温控之外），则属第 3 类（高风险），每年例行检查两次。"),
    agency: B("Public Health – Seattle & King County", "西雅图与金县公共卫生局"),
    proof: P(KC_RISK, "Using Time as a Public Health Control"),
  },

  /* ------------------------------------------------ Florida ------------------------------------------------ */
  {
    id: "fl-coffee-agency", kinds: ["coffee"], where: "FL", about: "food", level: "state",
    title: B("Two possible licensing agencies for a coffee shop", "咖啡店可能由两个机构发证"),
    text: B("Florida's Department of Agriculture and Consumer Services (FDACS) issues retail food permits to coffee shops selling directly to customers, while DBPR licenses restaurants and fast food. Odelia confirms which one licenses yours before anything is filed.",
      "佛罗里达州农业与消费者服务部（FDACS）为直接面向顾客销售的咖啡店发放零售食品许可，而商业与职业管理部（DBPR）负责餐厅和快餐。Odelia 会在提交任何申请前核实由哪个机构为您的店发证。"),
    agency: B("Florida Department of Agriculture and Consumer Services", "佛罗里达州农业与消费者服务部"),
    proof: P(FDACS, "These food establishments may include supermarkets, grocery stores, convenience stores, coffee shops, bakeries, retail meat markets, retail seafood markets, juice and smoothie bars,"),
  },
  {
    id: "fl-tea-agency", kinds: ["tea"], where: "FL", about: "food", level: "state",
    title: B("Which agency licenses a tea shop is confirmed first", "茶饮店由哪个机构发证须先核实"),
    text: B("Florida's Department of Agriculture and Consumer Services (FDACS) permits coffee shops and juice and smoothie bars, and DBPR licenses restaurants and fast food. Neither names tea shops, so Odelia confirms which one licenses yours before anything is filed.",
      "佛罗里达州农业与消费者服务部（FDACS）为咖啡店和果汁、冰沙店发放许可，商业与职业管理部（DBPR）负责餐厅和快餐。两者都未列明茶饮店，因此 Odelia 会在提交前核实由哪个机构为您的店发证。"),
    agency: B("Florida Department of Agriculture and Consumer Services", "佛罗里达州农业与消费者服务部"),
    proof: P(FDACS, "These food establishments may include supermarkets, grocery stores, convenience stores, coffee shops, bakeries, retail meat markets, retail seafood markets, juice and smoothie bars,"),
  },
  {
    id: "fl-bakery-agency", kinds: ["bakery"], where: "FL", about: "food", level: "state",
    title: B("Florida licenses bakeries through Agriculture", "佛罗里达州由农业部门为烘焙店发证"),
    text: B("Florida's DBPR, which licenses restaurants, says the Department of Agriculture and Consumer Services (FDACS) licenses bakeries. Odelia confirms which agency licenses yours, by what it serves, before anything is filed.",
      "负责餐厅发证的佛罗里达州商业与职业管理部（DBPR）表示，烘焙店由农业与消费者服务部（FDACS）发证。Odelia 会根据您的经营内容，在提交前核实由哪个机构发证。"),
    agency: B("Florida DBPR, Division of Hotels and Restaurants", "佛罗里达州商业与职业管理部酒店餐饮处"),
    proof: P(DBPR_JUR, "FDACS licenses bakeries, grocery stores, and convenience stores."),
  },

  /* ------------------------------------------------ Virginia ------------------------------------------------ */
  {
    id: "va-bakery-agency", kinds: ["bakery"], where: "VA", about: "food", level: "state",
    title: B("Virginia splits bakeries between Health and Agriculture", "弗吉尼亚州由卫生和农业两部门分管烘焙店"),
    text: B("Under Virginia's agreement between its health and agriculture departments, a bakery that mainly sells cakes, cookies, donuts and other baked goods to take away, or sells wholesale, is under the Department of Agriculture and Consumer Services (VDACS); one that mainly serves food to eat on site, with no wholesale, stays with the health department.",
      "根据弗吉尼亚州卫生与农业部门的协议，主要销售外带蛋糕、饼干、甜甜圈等烘焙食品或从事批发的烘焙店归农业与消费者服务部（VDACS）管辖；主要提供堂食且不批发的，仍归卫生部门管辖。"),
    agency: B("Virginia Department of Agriculture and Consumer Services", "弗吉尼亚州农业与消费者服务部"),
    proof: P(VA_MOU, "whose primary business model is the preparation and sale of conventional baked goods (e.g., cakes, cookies, donuts etc.) for offsite consumption"),
  },
  {
    id: "va-coffee-agency", kinds: ["coffee"], where: "VA", about: "food", level: "state",
    title: B("A coffee shop with no wholesale stays with the health department", "不批发的咖啡店归卫生部门管辖"),
    text: B("Under Virginia's agreement between its health and agriculture departments, a shop serving coffee and baked goods to eat on site, with no wholesale, is the health department's to license and inspect. Selling baked goods wholesale brings in the Department of Agriculture and Consumer Services.",
      "根据弗吉尼亚州卫生与农业部门的协议，供应咖啡和烘焙食品供店内食用且不批发的店，由卫生部门发证和检查。批发烘焙食品则须由农业与消费者服务部管辖。"),
    agency: B("Virginia Department of Health", "弗吉尼亚州卫生局"),
    proof: P(VA_MOU, "there is no wholesale distribution (e.g., coffee and baked goods without wholesale)"),
  },

  /* ------------------------------------------------ Oregon ------------------------------------------------ */
  {
    id: "or-bakery-agency", kinds: ["bakery"], where: "OR", about: "food", level: "state",
    title: B("Oregon licenses bakeries through Agriculture", "俄勒冈州由农业部为烘焙店发证"),
    text: B("In Oregon the Department of Agriculture (ODA) licenses bakeries, and the county health department licenses restaurants. A bakery with a cafe is licensed by one of them, by its predominant activity: food for later (ODA) or food to eat right away (the county).",
      "在俄勒冈州，烘焙店由州农业部（ODA）发证，餐厅由县卫生部门发证。附设咖啡区的烘焙店按主要业务由其中一方发证：以外带供日后食用为主的归 ODA，以即时食用为主的归县。"),
    agency: B("Oregon Department of Agriculture", "俄勒冈州农业部"),
    proof: P("https://www.oregon.gov/oda/Documents/Publications/foodsafety/CombinationFacilities.pdf", "ODA licenses and inspects firms including grocery stores, wineries, breweries, food processors, and bakeries."),
  },

  /* ------------------------------------------------ Minnesota ------------------------------------------------ */
  {
    id: "mn-bakery-agency", kinds: ["bakery"], where: "MN", about: "food", level: "state",
    title: B("Minnesota licenses bakeries through Agriculture", "明尼苏达州由农业部为烘焙店发证"),
    text: B("Minnesota licenses a bakery through the Department of Agriculture (MDA), not the health department that licenses restaurants. MDA starts with a pre-consultation questionnaire.",
      "明尼苏达州的烘焙店由州农业部（MDA）发证，而不是为餐厅发证的卫生部门。MDA 的流程从预咨询问卷开始。"),
    agency: B("Minnesota Department of Agriculture", "明尼苏达州农业部"),
    proof: P(MDA, "I want to operate a grocery store, convenience store, meat market, bakery, vending machine, or food warehouse."),
  },
  {
    id: "mn-coffee-agency", kinds: ["coffee"], where: "MN", about: "food", level: "state",
    title: B("Coffee drinks are licensed like a restaurant", "咖啡饮品按餐厅发证"),
    text: B("Minnesota lists coffee beverages with restaurant food: a shop making them is licensed by the Department of Health or the local health department (in Minneapolis, the city), not the Department of Agriculture.",
      "明尼苏达州将咖啡饮品与餐厅食品归为一类：制作咖啡饮品的店由州卫生部或当地卫生部门（明尼阿波利斯为市政府）发证，而非农业部。"),
    agency: B("Minnesota Department of Health", "明尼苏达州卫生部"),
    proof: P(MDA, "sells foods such as burgers, tacos, pizzas, egg rolls, hot entrees, fresh lemonade, coffee beverages, or dirty sodas."),
  },

  /* ------------------------------------------------ Georgia ------------------------------------------------ */
  {
    id: "ga-bakery-agency", kinds: ["bakery"], where: "GA", about: "food", level: "state",
    title: B("Georgia regulates bakeries as food retailers", "佐治亚州将烘焙店作为食品零售商管理"),
    text: B("The Georgia Department of Agriculture regulates bakeries as food retailers, while restaurants get their food service permit from the county health department (Fulton County in Atlanta). Odelia confirms which licenses yours, by what it sells and where it's eaten.",
      "佐治亚州农业部将烘焙店作为食品零售商管理，而餐厅的餐饮服务许可由县卫生部门（亚特兰大为富尔顿县）发放。Odelia 会根据您销售的食品及其食用方式，核实由哪个机构发证。"),
    agency: B("Georgia Department of Agriculture", "佐治亚州农业部"),
    proof: P("https://agr.ga.gov/retailers", "regulates and monitors food retailers: grocery stores, convenience stores, bakeries, seafood operations, salvage food operations, mobile meat trucks, and rolling stores."),
  },

  /* ---------------------------------------- Phoenix and Maricopa County ---------------------------------------- */
  {
    id: "mc-bakery-permit", kinds: ["bakery"], where: "MARI", about: "food", level: "county",
    title: B("Maricopa County has a Bakery permit of its own", "马里科帕县设有专门的烘焙许可"),
    text: B("Maricopa County issues a Bakery permit (Class 2) to a place that only prepares bakery items, served on site, sold directly to customers or sold on to retailers. A wider menu makes it an Eating and Drinking permit instead.",
      "马里科帕县为只制作烘焙食品（店内供应、直接售予顾客或转售给零售商）的场所发放烘焙许可（第 2 类）。菜单更广的则改为餐饮许可。"),
    agency: B("Maricopa County Environmental Services", "马里科帕县环境服务局"),
    proof: P(MARICOPA, "A bakery is a food establishment that exclusively prepares bakery items for immediate service on the premises, directly to a consumer,"),
  },
  {
    id: "mc-drinks-class", kinds: ["tea", "coffee"], where: "MARI", about: "food", level: "county",
    title: B("The permit class follows the menu", "许可类别取决于菜单"),
    text: B("Maricopa County sets an Eating and Drinking permit's class by the menu: quick service with only limited preparation is Class 2, the lowest; advanced preparation of three or more menu items is Class 4. The department decides which yours is.",
      "马里科帕县按菜单确定餐饮许可的类别：仅有有限制备的快餐服务为第 2 类（最低）；三种以上菜品需深度制备的为第 4 类。具体类别由该局决定。"),
    agency: B("Maricopa County Environmental Services", "马里科帕县环境服务局"),
    proof: P(MARICOPA, "Quick service operations with only limited preparation of menu items or as approved by the Department."),
  },

  /* ------------------------------------------------ Ohio ------------------------------------------------ */
  {
    id: "oh-coffee-risk", kinds: ["coffee"], where: "OH", about: "food", level: "state",
    title: B("Serving coffee is Ohio's lowest risk level", "供应咖啡属俄亥俄州最低风险等级"),
    text: B("Ohio rates serving coffee as a risk level I activity, the lowest. The license takes the risk level of the highest-risk activity on the menu, so preparing food moves it up.",
      "俄亥俄州将供应咖啡列为第 I 级（最低）风险活动。执照按菜单上风险最高的活动定级，因此制备食品会提高等级。"),
    agency: B("Ohio Department of Health (licensed locally by Columbus Public Health)", "俄亥俄州卫生部（由哥伦布市公共卫生局发证）"),
    proof: P("https://codes.ohio.gov/ohio-administrative-code/rule-3701-21-02.3", "Coffee, self-service hot beverage dispenser drinks, self-service fountain drinks, prepackaged non-time/temperature controlled for safety beverages;"),
  },

  /* ------------------------------------------------ Texas ------------------------------------------------ */
  {
    id: "tx-bakery-manufacturer", kinds: ["bakery"], where: "TX", about: "food", level: "state",
    title: B("Packaged goods on a self-service shelf need a state license", "自助货架上的包装食品须办州执照"),
    text: B("Texas requires a Food Manufacturer license from the Department of State Health Services (DSHS) of a business that packages food for wholesale or for a self-service display, and lists bakeries among its examples. It applies if the bakery packages its goods that way.",
      "德州要求为批发或自助陈列而包装食品的企业向州卫生服务部（DSHS）申领食品生产执照，并将烘焙店列为例子。烘焙店若以这种方式包装商品，即须办理。"),
    agency: B("Texas Department of State Health Services", "德州卫生服务部"),
    proof: P("https://dshs.texas.gov/foods/manufacturers.aspx", "Processing and/or packaging any food product, including dietary supplements, ice, and water, for wholesale distribution or for sale via retail customer self-service."),
  },

  /* ------------------------------------------------ Chicago ------------------------------------------------ */
  {
    id: "chi-bakery-wholesale", kinds: ["bakery"], where: "CHI", about: "food", level: "city",
    title: B("Retail and wholesale from one place is one license", "同一地点零售加批发只需一张执照"),
    text: B("A Chicago bakery that sells both retail and wholesale from the same place needs only the Retail Food Establishment license; selling only wholesale takes the Wholesale Food Establishment license instead.",
      "在芝加哥，同一地点既零售又批发的烘焙店只需零售食品场所执照；只做批发的则须改办批发食品场所执照。"),
    agency: B("City of Chicago Department of Business Affairs and Consumer Protection", "芝加哥市商业事务与消费者保护局"),
    proof: P("https://chicago.gov/content/city/en/sites/chicago-business-licensing/home/wholesalefood.html", "only a City of Chicago Retail Food Establishment license is required"),
  },
];

/** What kinds of food business the words name: "Milk tea shop" is tea, "Bakery cafe" is a bakery and a coffee shop,
    "Cantonese restaurant" a restaurant. A dessert or ice cream shop is none of them. */
export function kindsOf(what: string): StoreKind[] {
  const w = what.toLowerCase(), out: StoreKind[] = [];
  if (/\b(tea|boba)\b|奶茶|茶饮|茶铺|茶店/.test(w)) out.push("tea");
  if (/\b(coffee|caf[eé]s?|espresso)\b|咖啡/.test(w)) out.push("coffee");
  if (/\b(bak(e|ery|eries|ing|ed)|bakehouse|pastr(y|ies)|patisserie)\b|面包|烘焙|糕点|西点|蛋糕/.test(w)) out.push("bakery");
  if (!out.length && /restaurant|hot ?pot|noodle|dumpling|ramen|\bpho\b|malatang|bistro|diner|eatery|grill|bbq|barbecue|kitchen|sushi|dim sum|餐|饭店|火锅|麻辣烫|面馆|饺子/.test(w)) out.push("restaurant");
  return out;
}

/** The facts for these kinds of business at these places (the registry's jurisdictions for the address). */
export function kindFactsAt(kinds: StoreKind[], places: string[]): KindFact[] {
  return KIND_FACTS.filter(k => places.includes(k.where) && k.kinds.some(x => kinds.includes(x)));
}
