// The home and furniture industry's filings: what a furniture brand files to import wood and upholstered goods into the
// US and to sell them in California, read from the agencies' own pages on 2026-10-21. Each entry's proof is the sentence
// on its source page that states the requirement (under 25 words, copied from the page as fetched), the URL read and the
// day. A filing with no quote that could be read stays without proof, so its row abstains and names who to ask.
//
//   aphis-ppq505        Lacey Act plant and plant product declaration (PPQ Form 505), wood products, at entry
//   epa-tsca-import     TSCA Title VI import certification for composite wood in finished goods
//   cpsc-1261           clothing storage units (dressers, chests, armoires): 16 CFR part 1261 and its certificate
//   cbp-isf             Importer Security Filing for ocean shipments: CBP's pages refused every automated read, so the
//                       row abstains and links CBP's own page
//   ca-bhgs-importer    California importer's license, for upholstered furniture made outside the US
//   ca-bhgs-retail      California retail furniture dealer's license, for a store selling upholstered furniture that
//                       doesn't hold an importer's license
//
// What a furniture plan says beyond its filings (labels, the tip-over tests, other states' registrations, the EU) is in
// src/forms/kinds.ts, quoted the same way.
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

/** Furniture, in the words a brand uses: "Upholstered furniture brand", "Furniture showroom", "dressers", "家具". */
export const FURNITURE = /\bfurniture\b|\bsofas?\b|\bcouch(es)?\b|\bsectionals?\b|\brecliners?\b|\bloveseats?\b|\bupholster(y|ed)\b|\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bcase ?goods\b|\bcasegoods\b|\b(coffee|dining|side|end|console) tables?\b|\bnightstands?\b|\bbed ?frames?\b|\bbar ?stools?\b|\bsideboards?\b|\bcredenzas?\b|\bbookcases?\b|家具|沙发|衣柜|斗柜/i;
const UPHOLSTERED = /\bupholster(y|ed)\b|\bsofas?\b|\bcouch(es)?\b|\bsectionals?\b|\brecliners?\b|\bloveseats?\b|\barmchairs?\b|沙发|软体/i;
/** Only wood case goods named, nothing upholstered: a dresser brand doesn't sell upholstered furniture. */
const CASE_ONLY = /\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bcase ?goods\b|\bcasegoods\b|\bcabinets?\b|\bbookcases?\b|\bdesks?\b|\btables?\b|\bnightstands?\b|\bbed ?frames?\b|\bstools?\b|\bsideboards?\b|\bcredenzas?\b|衣柜|斗柜/i;
/** A clothing storage unit, as CPSC's page names them: chests, chests of drawers, armoires, bureaus, dressers. */
const CLOTHING_STORAGE = /\bdressers?\b|\barmoires?\b|\bwardrobes?\b|chests? of drawers|\bchifferobes?\b|\bbureaus?\b|衣柜|斗柜/i;

export const isFurniture = (what: string) => FURNITURE.test(what);
/** What the words say a furniture business makes or sells: wood (a furniture brand, unless it names only metal or
    plastic), upholstered furniture (named, or furniture in general unless only case goods are named), and clothing
    storage units (named). Nothing for a business that isn't furniture. */
export function furnitureNeeds(what: string): Pick<Needs, "wood" | "upholstered" | "clothingStorage"> {
  if (!isFurniture(what)) return {};
  const upholstered = UPHOLSTERED.test(what) || !CASE_ONLY.test(what);
  return { wood: !/\b(metal|steel|plastic)\s+(only\s+)?furniture\b/i.test(what), ...(upholstered ? { upholstered: true } : {}), ...(CLOTHING_STORAGE.test(what) ? { clothingStorage: true } : {}) };
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
    agency: B("U.S. Consumer Product Safety Commission (CPSC)", "美国消费品安全委员会（CPSC）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, clothingStorage: true }, method: "none", order: 51,
    how: B("Dressers, chests and armoires must pass the rule's three stability tests and ship with an anti-tip device that meets ASTM F3096. The importer issues the certificate itself, citing 16 CFR part 1261.", "梳妆柜、五斗柜和衣柜须通过该规定的三项稳定性测试，并随附符合 ASTM F3096 的防倾倒装置。由进口商自行出具证书，注明 16 CFR 第 1261 部分。"),
    url: CPSC_CSU, info: CPSC_CSU, fee: 0, feeNote: B("No government form or fee: the importer issues the certificate.", "无政府表格或费用：由进口商出具证书。"), checked: "page",
    plain: B("The tip-over rule for dressers and chests: tested, shipped with an anti-tip device, and certified by the importer.", "梳妆柜和五斗柜的防倾倒规定：须经测试、随附防倾倒装置，并由进口商出具证书。"),
    fields: [], proof: P("For clothing storage units, the citation to use in section 2 of the CPC or GCC is", CPSC_CSU),
  },
  {
    id: "cbp-isf", form: "Importer Security Filing (ISF, 10+2)", title: B("Importer Security Filing (ISF) for ocean shipments", "进口商安全申报（ISF，适用于海运）"),
    agency: B("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）"), level: "federal", where: "US", segments: [...IMPORTERS], needs: { imports: true, wood: true }, method: "portal", order: 36,
    how: B("Filed electronically for goods arriving by ocean, usually by the customs broker, before the cargo is loaded abroad.", "海运货物须电子申报，通常由报关行在境外装船前提交。"),
    url: "https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102", info: "https://www.cbp.gov/border-security/ports-entry/cargo-security/importer-security-filing-102",
    fee: 0, checked: "known",
    plain: B("The security filing for each ocean container, sent before it is loaded.", "每个海运集装箱装船前提交的安全申报。"),
    fields: [],
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
