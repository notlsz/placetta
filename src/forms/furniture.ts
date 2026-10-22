// The home and furniture industry's filings: what a furniture brand files to import wood and upholstered goods into the
// US and to sell them in California, read from the agencies' own pages on 2026-10-21. Each entry's proof is the sentence
// on its source page that states the requirement (under 25 words, copied from the page as fetched), the URL read and the
// day. A filing with no quote that could be read stays without proof, so its row abstains and names who to ask.
//
//   aphis-ppq505        Lacey Act plant and plant product declaration (PPQ Form 505), wood products, at entry
//   epa-tsca-import     TSCA Title VI import certification for composite wood in finished goods
//   cpsc-1261           clothing storage units (dressers, chests, armoires): 16 CFR part 1261 and its certificate
//   cbp-isf             Importer Security Filing (10+2) for ocean shipments, 24 hours before lading abroad: CBP's pages
//                       refuse automated reads, so it is quoted from 19 CFR part 149 as GovInfo publishes it
//   cpsc-cpc            Children's Product Certificate (16 CFR part 1110) for children's furniture, before it ships
//   ca-bhgs-importer    California importer's license, for upholstered furniture made outside the US
//   ca-bhgs-retail      California retail furniture dealer's license, for a store selling upholstered furniture that
//                       doesn't hold an importer's license
//   oh-bedding          Ohio's registration for makers and wholesalers of upholstered furniture sold in Ohio ($50 a year)
//   or-epr, co-epr      Oregon's and Colorado's packaging producer responsibility (EPR): the brand joins the producer
//                       responsibility organization before it sells there, and pays its dues every year
//
// Read 2026-10-21 (second pass): the customs bond's proof moved to 19 CFR 142.4 on GovInfo (src/forms/proof.ts), which
// curl reads, where CBP's own bond page only opened through WebFetch.
//
// Plan order: what clears the first shipment (importer number, bond, ISF, the Lacey and TSCA declarations, the product
// certificates) comes before what the first sale needs (state furniture licenses, EPR), and each store's own steps after.
// What recurs (the bond, the California license every 2 years, Ohio's registration and the EPR dues every year) carries
// the agency's cycle in `renews`, so it lands on the renewal calendar (src/finish.ts scheduleRenewals).
//
// What a furniture plan says beyond its filings (labels, the tip-over tests, tariffs and the antidumping order, other
// states' registrations, the EU and the UK) is in src/forms/kinds.ts, quoted the same way.
import { B } from "../bi";
import type { Needs, OfficialForm } from "./registry";

const READ = "2026-10-21";
const P = (quote: string, read: string) => ({ quote, read, checked: READ });

export const PPQ505 = "https://www.aphis.usda.gov/sites/default/files/ppq505.pdf";
export const EPA_TSCA = "https://www.epa.gov/node/155807";
export const CPSC_CSU = "https://www.cpsc.gov/Business--Manufacturing/Business-Education/Business-Guidance/Clothing-Storage-Units";
export const BHGS_IMPORTER = "https://bhgs.dca.ca.gov/forms_pubs/app_importer.pdf";
export const BHGS_FLYER = "https://bhgs.dca.ca.gov/forms_pubs/19-012_statelicflyer.pdf";
export const BHGS_LABELS = "https://bhgs.dca.ca.gov/forms_pubs/19-014_furnbedlawflyer.pdf";
/** 19 CFR part 149 (Importer Security Filing), the April 1, 2025 edition as GovInfo publishes it. */
export const CFR_149 = "https://www.govinfo.gov/content/pkg/CFR-2025-title19-vol2/pdf/CFR-2025-title19-vol2-part149.pdf";
/** 19 CFR part 142 (entry), whose section 142.4 requires the bond at entry. */
export const CFR_142 = "https://www.govinfo.gov/content/pkg/CFR-2025-title19-vol2/pdf/CFR-2025-title19-vol2-part142.pdf";
export const CPSC_CPC = "https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate-CPC";
export const CPSC_TRACKING = "https://cpsc.gov/Business--Manufacturing/Business-Education/tracking-label";
const OH_RULE = "https://codes.ohio.gov/ohio-administrative-code/rule-4101:6-1-03";
const OR_EPR = "https://www.oregon.gov/deq/recycling/Documents/RMAProducerObligationsSummary.pdf";
const CO_EPR = "https://cdphe.colorado.gov/hm/epr-program";

/** Furniture, in the words a brand uses: "Upholstered furniture brand", "Furniture showroom", "dressers", "家具". */
export const FURNITURE = /\bbunk ?beds?\b|\bcribs?\b|\bfurniture\b|\bsofas?\b|\bcouch(es)?\b|\bsectionals?\b|\brecliners?\b|\bloveseats?\b|\bupholster(y|ed)\b|\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bcase[- ]?goods\b|\bcasegoods\b|\b(coffee|dining|side|end|console) tables?\b|\bnightstands?\b|\bbed ?frames?\b|\bbar ?stools?\b|\bsideboards?\b|\bcredenzas?\b|\bbookcases?\b|家具|沙发|衣柜|斗柜/i;
const UPHOLSTERED = /\bupholster(y|ed)\b|\bsofas?\b|\bcouch(es)?\b|\bsectionals?\b|\brecliners?\b|\bloveseats?\b|\barmchairs?\b|沙发|软体/i;
/** Only wood case goods named, nothing upholstered: a dresser brand doesn't sell upholstered furniture. */
const CASE_ONLY = /\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bcase[- ]?goods\b|\bcasegoods\b|\bcabinets?\b|\bbookcases?\b|\bdesks?\b|\btables?\b|\bnightstands?\b|\bbed ?frames?\b|\bstools?\b|\bsideboards?\b|\bcredenzas?\b|衣柜|斗柜/i;
/** A clothing storage unit, as CPSC's page names them: chests, chests of drawers, armoires, bureaus, dressers. */
const CLOTHING_STORAGE = /\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bchifferobes?\b|\bbureaus?\b|衣柜|斗柜/i;

/** Furniture for children, as CPSC's children's product rules name them (designed or intended primarily for children 12
    or younger): "children's furniture", "kids' beds", "nursery", "toddler", "bunk beds", "cribs". */
const CHILDREN = /\bkids?'?s?\b|\bchild(ren)?'?s?\b|\btoddlers?\b|\bnursery\b|\bbab(y|ies)\b|\binfants?\b|\bbunk ?beds?\b|\bcribs?\b|儿童|婴儿|宝宝/i;
/** Made in China, as the words say it ("importing Chinese bedroom furniture", "from China", "中国"). A brand that only
    says it is Chinese-owned still reads as China here, so every fact that turns on it names the condition. */
const CHINA = /\bchin(a|ese)\b|\bprc\b|中国|国产/i;
/** Bedroom furniture, the antidumping order's product: beds, headboards, nightstands, dressers, chests, armoires. */
const BEDROOM = /\bbedroom\b|\bbeds?\b|\bbed ?frames?\b|\bheadboards?\b|\bnightstands?\b|\bnight ?tables?\b|\bdressers?\b|\bchests?\b|\barmoires?\b|\bwardrobes?\b|卧室|床/i;

export const isFurniture = (what: string) => FURNITURE.test(what);
/** What the words say a furniture business makes or sells: wood (a furniture brand, unless it names only metal or
    plastic), upholstered furniture (named, or furniture in general unless only case goods are named), clothing storage
    units (named) and children's furniture (named). Nothing for a business that isn't furniture. */
export function furnitureNeeds(what: string): Pick<Needs, "wood" | "upholstered" | "clothingStorage" | "children"> {
  if (!isFurniture(what)) return {};
  const upholstered = UPHOLSTERED.test(what) || !CASE_ONLY.test(what);
  return { wood: !/\b(metal|steel|plastic)\s+(only\s+)?furniture\b/i.test(what), ...(upholstered ? { upholstered: true } : {}), ...(CLOTHING_STORAGE.test(what) ? { clothingStorage: true } : {}),
    ...(CHILDREN.test(what) ? { children: true } : {}) };
}
/** Where the words say the furniture is made, for the duties that turn on it: China (Section 301), and Chinese bedroom
    furniture (the antidumping order on wooden bedroom furniture). */
export function furnitureOrigin(what: string): { china?: boolean; chinaBedroom?: boolean } {
  if (!isFurniture(what) || !CHINA.test(what)) return {};
  return { china: true, ...(BEDROOM.test(what) ? { chinaBedroom: true } : {}) };
}

const IMPORTERS = ["seller", "retail", "warehouse"] as const;

export const FURNITURE_FORMS: OfficialForm[] = [
  {
    id: "aphis-ppq505", form: "PPQ Form 505", title: B("Lacey Act plant and plant product declaration (PPQ Form 505)", "雷斯法案植物及植物产品申报（PPQ 505 表）"),
    agency: B("USDA Animal and Plant Health Inspection Service (APHIS)", "美国农业部动植物卫生检验局（APHIS）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, wood: true }, method: "pdf_mail", order: 41,
    how: B("Declared for each shipment of wood products at entry, usually electronically by the customs broker. On paper, the importer keeps a copy for CBP at the port and mails the original to APHIS after CBP clears the shipment.", "每批木制品入境时申报，通常由报关行电子申报。纸质申报时，进口商在口岸备一份供 CBP 查验，CBP 放行后将原件寄给 APHIS。"),
    url: PPQ505, pdf: PPQ505, info: PPQ505, fee: 0, feeNote: B("The form lists no fee.", "表格未列出费用。"), checked: "form",
    plain: B("A declaration for each shipment of wood furniture: the wood's species and the country where it was harvested.", "每批木制家具的申报：写明木材树种及采伐国家。"),
    fields: [], proof: P("Importers should have a copy of the form available for CBP to review at the port of entry.", PPQ505),
  },
  {
    id: "epa-tsca-import", form: "TSCA Title VI import certification", title: B("TSCA Title VI import certification for composite wood", "TSCA 第六章复合木材进口认证"),
    agency: B("U.S. Environmental Protection Agency (EPA)", "美国环境保护署（EPA）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, wood: true }, method: "none", order: 42,
    how: B("Made at entry for furniture that contains hardwood plywood, MDF or particleboard, which must be certified TSCA Title VI compliant by an EPA-recognized third-party certifier.", "含硬木胶合板、中密度纤维板或刨花板的家具在入境时作出认证，这些板材须经 EPA 认可的第三方认证机构认证符合 TSCA 第六章。"),
    url: EPA_TSCA, info: EPA_TSCA, fee: null, feeNote: B("EPA's page names no fee. The third-party certifier charges for certifying the panels.", "EPA 页面未列出费用。第三方认证机构对板材认证收费。"), checked: "page",
    plain: B("A statement at import that the composite wood in the furniture meets the federal formaldehyde limits.", "进口时声明家具中的复合木材符合联邦甲醛限值。"),
    fields: [], proof: P("Importers to provide import certification under TSCA beginning March 22, 2019;", EPA_TSCA),
  },
  {
    id: "cpsc-1261", form: "General Certificate of Conformity (16 CFR part 1261)", title: B("Clothing storage unit tip-over standard and certificate (16 CFR part 1261)", "衣物收纳家具防倾倒标准及合格证书（16 CFR 第 1261 部分）"),
    agency: B("U.S. Consumer Product Safety Commission (CPSC)", "美国消费品安全委员会（CPSC）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, clothingStorage: true }, method: "none", order: 43,
    how: B("Dressers, chests and armoires must pass the rule's three stability tests and ship with an anti-tip device that meets ASTM F3096. The importer issues the certificate itself, citing 16 CFR part 1261.", "梳妆柜、五斗柜和衣柜须通过该规定的三项稳定性测试，并随附符合 ASTM F3096 的防倾倒装置。由进口商自行出具证书，注明 16 CFR 第 1261 部分。"),
    url: CPSC_CSU, info: CPSC_CSU, fee: 0, feeNote: B("No government form or fee: the importer issues the certificate.", "无政府表格或费用：由进口商出具证书。"), checked: "page",
    plain: B("The tip-over rule for dressers and chests: tested, shipped with an anti-tip device, and certified by the importer.", "梳妆柜和五斗柜的防倾倒规定：须经测试、随附防倾倒装置，并由进口商出具证书。"),
    fields: [], proof: P("For clothing storage units, the citation to use in section 2 of the CPC or GCC is", CPSC_CSU),
  },
  {
    id: "cbp-isf", form: "Importer Security Filing (ISF, 10+2)", title: B("Importer Security Filing (ISF) for ocean shipments", "进口商安全申报（ISF，适用于海运）"),
    agency: B("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, wood: true }, method: "portal", order: 36,
    how: B("Filed electronically for goods arriving by ocean, usually by the customs broker: seller, buyer, importer of record and consignee numbers, manufacturer, ship-to party, country of origin and HTS number no later than 24 hours before the cargo is loaded at the foreign port; the container stuffing location and consolidator no later than 24 hours before arrival. The ISF importer holds a bond first; without one, the agent filing the ISF may post its own.",
      "海运货物须电子申报，通常由报关行办理：卖方、买方、进口商记录号和收货人编号，以及制造商、送达方、原产国和 HTS 编码，须在境外港口装船前至少 24 小时提交；装箱地点和拼箱人须在抵港前至少 24 小时提交。ISF 进口商须先持有保证金；如没有，代为申报 ISF 的代理人可使用其自身的保证金。"),
    url: "https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102", info: CFR_149,
    fee: 0, feeNote: B("CBP charges no fee; the broker charges for filing it.", "CBP 不收费；报关行收取代理费。"), checked: "page",
    plain: B("The security filing for each ocean shipment, sent before it is loaded abroad.", "每批海运货物在境外装船前提交的安全申报。"),
    fields: [], proof: P("later than 24 hours before the cargo is laden aboard the vessel at the foreign port.", CFR_149),
  },
  {
    id: "cpsc-cpc", form: "Children's Product Certificate (16 CFR part 1110)", title: B("Children's Product Certificate, from a CPSC-accepted lab's tests", "儿童产品合格证书（依据 CPSC 认可实验室的检测）"),
    agency: B("U.S. Consumer Product Safety Commission (CPSC)", "美国消费品安全委员会（CPSC）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, children: true }, method: "none", order: 43,
    how: B("Children's furniture is tested by a third-party, CPSC-accepted laboratory to the children's product safety rules that apply, and the importer issues the certificate, with its test reports, in English, citing each rule. Since July 8, 2026 most certificates are eFiled with CBP at entry, so it is ready before the goods ship. There is no government form.",
      "儿童家具须由 CPSC 认可的第三方实验室按适用的儿童产品安全规定检测，进口商出具英文证书（连同检测报告）并列明每项规定。自 2026 年 7 月 8 日起，大多数证书须在入境时向 CBP 电子申报，因此须在发货前备妥。没有政府表格。"),
    url: CPSC_CPC, info: CPSC_CPC, fee: 0, feeNote: B("No government fee: the lab charges for testing.", "无政府费用：实验室收取检测费。"), checked: "page",
    plain: B("The certificate that children's furniture meets the children's safety rules, based on an accepted lab's tests.", "证明儿童家具符合儿童安全规定的证书，以认可实验室的检测为依据。"),
    fields: [], proof: P("requires domestic manufacturers and importers of children’s products to certify in a written Children’s Product Certificate (CPC),", CPSC_CPC),
  },
  {
    id: "oh-bedding", form: "Certificate of registration (Ohio Revised Code chapter 3713)", title: B("Ohio registration for upholstered furniture makers and wholesalers", "俄亥俄州软体家具制造商和批发商登记"),
    agency: B("Ohio Department of Commerce, Division of Industrial Compliance", "俄亥俄州商务部工业合规处"), level: "state", where: "OH", segments: [...IMPORTERS], needs: { imports: true, upholstered: true }, method: "pdf_mail", order: 46,
    how: B("Applied for with the Division before selling upholstered furniture in Ohio, with the $50 annual fee. Registrants other than Ohio-based wholesalers report the number of articles every 12 months.", "在俄亥俄州销售软体家具前向该处申请，缴纳每年 50 美元的登记费。除在俄亥俄州设有营业场所的批发商外，登记人每 12 个月申报一次件数。"),
    url: OH_RULE, info: OH_RULE, fee: 50, renews: B("Every year.", "每年一次。"), checked: "page",
    plain: B("Ohio's registration for anyone making or wholesaling upholstered furniture sold in Ohio, renewed every year.", "在俄亥俄州销售的软体家具，其制造商或批发商须办理的登记，每年续期。"),
    fields: [], proof: P("Any person who engages in manufacturing or wholesaling bedding or upholstered furniture that is to be sold or offered for sale in this state;", OH_RULE),
  },
  {
    id: "or-epr", form: "Producer responsibility organization membership (Recycling Modernization Act)", title: B("Oregon packaging producer responsibility (EPR): join the PRO, unless exempt", "俄勒冈州包装生产者责任（EPR）：加入生产者责任组织（豁免者除外）"),
    agency: B("Oregon Department of Environmental Quality, through Circular Action Alliance", "俄勒冈州环境质量部（经 Circular Action Alliance）"), level: "state", where: "OR", segments: ["seller", "retail"], needs: { imports: true }, method: "portal", order: 47,
    how: B("The brand that imports packaged goods sold into Oregon registers with the producer responsibility organization (Circular Action Alliance) and pays its annual membership fee. Exempt: under $5 million gross revenue, under one metric ton of covered products into Oregon, or a single store with no online sales.",
      "向俄勒冈州销售包装商品的进口品牌须在生产者责任组织（Circular Action Alliance）登记并缴纳年度会费。豁免情形：年总收入低于 500 万美元、进入俄勒冈州的受管产品不足 1 公吨，或只有一家门店且无网上销售。"),
    url: OR_EPR, info: OR_EPR, fee: null, feeNote: B("The PRO sets the fee every year by the quantity and type of packaging.", "生产者责任组织每年按包装数量和类型核定费用。"), renews: B("Every year.", "每年一次。"), checked: "page",
    plain: B("Oregon's packaging law: the brand pays into the state's recycling system through the PRO, every year, unless exempt.", "俄勒冈州包装法：品牌每年通过生产者责任组织为州回收体系付费（豁免者除外）。"),
    fields: [], proof: P("Register with and be a member of a producer responsibility organization (PRO) that administers a state-approved producer responsibility program.", OR_EPR),
  },
  {
    id: "co-epr", form: "Producer Responsibility Program participation (Circular Action Alliance)", title: B("Colorado packaging producer responsibility (EPR): join before selling, unless exempt", "科罗拉多州包装生产者责任（EPR）：销售前加入（豁免者除外）"),
    agency: B("Colorado Department of Public Health and Environment, through Circular Action Alliance", "科罗拉多州公共卫生与环境部（经 Circular Action Alliance）"), level: "state", where: "CO", segments: ["seller", "retail"], needs: { imports: true }, method: "portal", order: 47,
    how: B("The brand registers with Circular Action Alliance and submits a supply report before selling packaged goods in Colorado, then pays dues on covered materials every year, starting January 2026. Producers under the state's revenue threshold, adjusted for inflation each year, are exempt.",
      "品牌须在科罗拉多州销售包装商品前向 Circular Action Alliance 登记并提交供应报告，自 2026 年 1 月起每年就受管材料缴纳会费。收入低于州门槛（每年按通胀调整）的生产者可豁免。"),
    url: CO_EPR, info: CO_EPR, fee: null, feeNote: B("Dues are set on the covered materials sold into Colorado.", "会费按销往科罗拉多州的受管材料核定。"), renews: B("Every year.", "每年一次。"), checked: "page",
    plain: B("Colorado's packaging law: a producer can't sell there unless it participates in the program, and pays dues every year.", "科罗拉多州包装法：生产者须参加该计划才能在当地销售，并每年缴纳会费。"),
    fields: [], proof: P("a producer cannot sell or distribute products that use covered materials in Colorado unless they participate in the Producer Responsibility Program.", CO_EPR),
  },
  {
    id: "ca-bhgs-importer", form: "Application for Importer's License (HFTI Imp App)", title: B("California importer's license for upholstered furniture", "加州软体家具进口商执照"),
    agency: B("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"), level: "state", where: "CA", segments: [...IMPORTERS], needs: { imports: true, upholstered: true }, method: "pdf_mail", order: 45,
    how: B("Mailed to the Bureau's Licensing Unit with the fee and an original signature, before operating. Every business location holds its own license, and each location that manufactures gets a registry number for the law label.", "开业前将申请表连同费用和亲笔签名寄给该局执照处。每个营业地点须单独持照，每个生产地点会获得一个登记号，用于法定标签。"),
    url: BHGS_IMPORTER, pdf: BHGS_IMPORTER, info: BHGS_IMPORTER, fee: 750, renews: B("Every 2 years.", "每 2 年一次。"), checked: "form",
    plain: B("The state license to sell upholstered furniture made outside the US in California; it also covers selling it at retail.", "在加州销售美国境外制造的软体家具所需的州执照，也涵盖零售。"),
    fields: [], proof: P("An importer’s license is required for those who manufacture or wholesale, through employees or agents, any article of upholstered furniture,", BHGS_IMPORTER),
  },
  {
    id: "ca-bhgs-retail", form: "Retail furniture dealer's license", title: B("California retail furniture dealer's license", "加州家具零售商执照"),
    agency: B("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"), level: "state", where: "CA", segments: ["retail"], needs: { upholstered: true }, unless: ["imports"], method: "pdf_mail", order: 45,
    how: B("Applied for with the Bureau before the store opens, one license for each location. A business holding an importer's license doesn't need it.", "门店开业前向该局申请，每个地点一张执照。持有进口商执照的企业无需办理。"),
    url: BHGS_FLYER, info: BHGS_FLYER, fee: null, checked: "page",
    plain: B("The state license for a store selling upholstered furniture in California.", "在加州销售软体家具的门店所需的州执照。"),
    fields: [], proof: P("Furniture Retailer—A store operation selling upholstered furniture.", BHGS_FLYER),
  },
];
