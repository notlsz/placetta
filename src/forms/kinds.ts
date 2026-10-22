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
//
// Furniture (2026-10-21): what a furniture brand's plan states beyond its filings (src/forms/furniture.ts): the TSCA
// Title VI label on finished goods, the clothing storage unit tests and anti-tip device, California's law label and
// TB 117-2013 statement, Massachusetts's and Pennsylvania's upholstered furniture licensing, and, abroad, the EU's General
// Product Safety Regulation. They are kinds "furniture", "upholstered" and "storage" (clothing storage units).
//
// Furniture, second pass (2026-10-21): children's furniture (CPSC tracking labels and certificate eFiling), the duties a
// furniture importer pays beyond the bond (Section 232 on upholstered wooden products, Section 301 and the antidumping
// order on Chinese wooden bedroom furniture, UFLPA's presumption), California's Proposition 65, Ohio's registration for
// brands selling there from another state, the EU Deforestation Regulation (read on the Commission's environment pages,
// where EUR-Lex refused) and, for a brand expanding to Great Britain, its product safety, timber and furniture fire rules.
// Kinds "children", "china" (furniture the words say is made in China) and "cnbedroom" (Chinese bedroom furniture).
// A fact with `needs` holds only when the business does those things (a duty on imports, never for a showroom that
// buys from a US distributor).
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import type { Needs } from "./registry";
import { BHGS_LABELS, CPSC_CPC, CPSC_CSU, CPSC_TRACKING, EPA_TSCA, isFurniture, furnitureNeeds, furnitureOrigin } from "./furniture";

export type StoreKind = "tea" | "coffee" | "bakery" | "restaurant" | "furniture" | "upholstered" | "storage" | "children" | "china" | "cnbedroom";
/** The kinds that aren't food: their facts hold for any segment (a showroom, an importer, a warehouse). */
export const FURNITURE_KINDS: StoreKind[] = ["furniture", "upholstered", "storage", "children", "china", "cnbedroom"];
export type KindFact = {
  id: string;
  kinds: StoreKind[];          // the kinds of business it is about
  where: string | string[];    // where it applies: a state ("CA"), a county ("KC"), a city ("NYC") or countries, as in the registry
  abroad?: boolean;            // only outside the US (the EU's "DE" is also Delaware's code)
  except?: string[];           // not at these places (a state whose own filing is in the plan instead)
  needs?: (keyof Needs)[];     // only when the business does all of these (imports)
  about?: "food" | "plan" | "building" | "license";   // the plan row it bears on (src/plan/preview.ts roles)
  form?: string[];             // the library forms it bears on, first found wins (before `about`)
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

const MA_DFP = "https://www.mass.gov/how-to/apply-for-a-license-to-manufacture-and-sell-stuffed-toys-bedding-upholstered-furniture-and-related-products";
const PA_BU = "https://www.pa.gov/agencies/dli/programs-services/labor-management-relations/bureau-of-occupational-and-industrial-safety/bedding-and-upholstery";
const GPSR = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R0988";
/** The EU's member states, by the registry's country codes. */
/** The Federal Register and the CFR as GovInfo publishes them: CBP, DHS and USTR pages refuse automated reads. */
const AD_WBF = "https://www.govinfo.gov/content/pkg/FR-2026-08-12/pdf/2026-16446.pdf";           // A-570-890, final results, Aug 12, 2026
const S301_25 = "https://www.govinfo.gov/content/pkg/FR-2019-05-09/pdf/2019-09681.pdf";          // List 3 raised to 25 percent
const S301_LIST3 = "https://www.govinfo.gov/content/pkg/FR-2018-09-21/pdf/2018-20610.pdf";       // List 3 and its annex
const S232_WOOD = "https://www.govinfo.gov/content/pkg/FR-2026-01-09/pdf/2026-00327.pdf";        // Proclamation 11000
const CFR_113 = "https://www.govinfo.gov/content/pkg/CFR-2025-title19-vol1/pdf/CFR-2025-title19-vol1-part113.pdf";   // 19 CFR part 113, bonds
const UFLPA = "https://www.govinfo.gov/content/pkg/FR-2026-08-03/pdf/2026-15628.pdf";            // UFLPA Entity List notice
const P65_FURNITURE = "https://www.p65warnings.ca.gov/sites/default/files/downloads/factsheets/furniture_products_fact_sheet.pdf";
const OH_RULE = "https://codes.ohio.gov/ohio-administrative-code/rule-4101:6-1-03";
const EUDR = "https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en";
const GB_GPSR = "https://www.gov.uk/government/publications/general-product-safety-regulations-2005/general-product-safety-regulations-2005-great-britain";
const GB_TIMBER = "https://www.gov.uk/guidance/regulations-timber-and-flegt-licences";
const GB_FIRE_5 = "https://www.legislation.gov.uk/uksi/1988/1324/regulation/5";
const GB_FIRE_8 = "https://www.legislation.gov.uk/uksi/1988/1324/regulation/8";
const CUSTOMS = ["cbp-301", "cbp-5106"];   // a duty on an entry bears on the bond that secures it
/** Abroad, what bears on placing goods on the market sits with the import number (the EORI rows of src/forms/world.ts). */
const EU_ENTRY = ["fr-eori", "de-eori"];
const EU27 = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];

export const KIND_FACTS: KindFact[] = [
  /* ------------------------------------------------ Furniture: federal ------------------------------------------------ */
  {
    id: "us-tsca-label", kinds: ["furniture"], where: "US", form: ["epa-tsca-import"], level: "federal",
    title: B("Finished goods with composite wood carry a TSCA Title VI label", "含复合木材的成品须贴 TSCA 第六章标签"),
    text: B("Furniture containing hardwood plywood, MDF or particleboard is labeled with the fabricator's name, the month and year it was produced, and a TSCA Title VI compliance statement. EPA's page names retailers among those the rule applies to.",
      "含硬木胶合板、中密度纤维板或刨花板的家具须贴标签，注明制造商名称、生产年月及 TSCA 第六章合规声明。EPA 页面将零售商列为适用对象之一。"),
    agency: B("U.S. Environmental Protection Agency", "美国环境保护署"),
    proof: P(EPA_TSCA, "must include the fabricator’s name, the date the finished good was produced (in month/year format), and a TSCA Title VI compliance statement."),
  },
  {
    id: "us-csu-tests", kinds: ["storage"], where: "US", form: ["cpsc-1261"], level: "federal",
    title: B("Dressers and chests pass three stability tests", "梳妆柜和五斗柜须通过三项稳定性测试"),
    text: B("A clothing storage unit (free-standing, at least 27 inches tall and 30 pounds, like a dresser, chest or armoire) must pass three stability tests: a clothing load, a horizontal force, and a child's weight on carpet.",
      "衣物收纳家具（独立放置、高至少 27 英寸、重至少 30 磅，如梳妆柜、五斗柜或衣柜）须通过三项稳定性测试：衣物负载、水平推力，以及地毯上的儿童体重测试。"),
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会"),
    proof: P(CPSC_CSU, "Product must pass all three stability tests:"),
  },
  {
    id: "us-csu-antitip", kinds: ["storage"], where: "US", form: ["cpsc-1261"], level: "federal",
    title: B("An anti-tip device ships in the box", "包装内须附防倾倒装置"),
    text: B("Every clothing storage unit is packaged with an anti-tip device that meets ASTM F3096, and carries the warning label the standard sets out.",
      "每件衣物收纳家具须随包装附上符合 ASTM F3096 的防倾倒装置，并贴有标准规定的警示标签。"),
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会"),
    proof: P(CPSC_CSU, "Anti-tip device that meets ASTM F3096 must be packaged with the product"),
  },

  {
    id: "us-cpsc-efile", kinds: ["storage", "children"], where: "US", needs: ["imports"], form: ["cpsc-cpc", "cpsc-1261"], level: "federal",
    title: B("The certificate is filed electronically with CBP at entry", "入境时向 CBP 电子申报证书"),
    text: B("Since July 8, 2026, importers of most regulated consumer products eFile their certificates of compliance with CBP at entry, so the certificate is ready before the goods ship.",
      "自 2026 年 7 月 8 日起，大多数受监管消费品的进口商须在入境时向 CBP 电子申报合格证书，因此证书须在发货前备妥。"),
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会"),
    proof: P(CPSC_CPC, "Beginning July 8, 2026, importers of most regulated consumer products will be required to electronically file (eFile) certificates of compliance"),
  },
  {
    id: "us-cpsc-tracking-label", kinds: ["children"], where: "US", form: ["cpsc-cpc"], level: "federal",
    title: B("Children's furniture carries a permanent tracking label", "儿童家具须有永久性追踪标签"),
    text: B("Every children's product, and its packaging where practicable, carries a visible, permanent tracking label: the manufacturer or importer's name, where and when it was made, and the batch or run.",
      "每件儿童产品及其包装（在可行时）须有清晰、永久的追踪标签：制造商或进口商名称、生产地点和日期，以及批次或生产批号。"),
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会"),
    proof: P(CPSC_TRACKING, "requires all children’s products to bear distinguishing marks (generally referred to as “tracking labels”) that:"),
  },

  /* ------------------------------------------------ Furniture: duties at import ------------------------------------------------ */
  {
    id: "us-isf-bond", kinds: ["furniture"], where: "US", needs: ["imports"], form: ["cbp-isf", "cbp-301"], level: "federal",
    title: B("A late or missing ISF is a claim on your bond: $5,000 a violation", "ISF 迟报或漏报即构成保证金违约：每次 5,000 美元"),
    text: B("The importation bond (19 CFR 113.62) binds the importer to file every ISF in the manner and time the rule sets; a default costs liquidated damages of $5,000 for each violation, paid by the importer and its surety. So each ocean shipment's ISF goes in at least 24 hours before it is loaded abroad, every time.",
      "进口保证金（19 CFR 113.62）约定进口商须按规定的方式和时间提交每份 ISF；违约须支付每次 5,000 美元的违约赔偿金，由进口商及其担保人承担。因此每批海运货物的 ISF 都须在境外装船前至少 24 小时提交。"),
    agency: B("U.S. Customs and Border Protection (19 CFR part 113)", "美国海关与边境保护局（19 CFR 第 113 部分）"),
    proof: P(CFR_113, "the principal and surety (jointly and severally) agree to pay liquidated damages of $5,000 for each violation."),
  },
  {
    id: "us-uflpa", kinds: ["furniture"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("Forced labor: goods from UFLPA-listed entities are presumed barred", "强迫劳动：UFLPA 清单实体的货物被推定禁止入境"),
    text: B("Under the Uyghur Forced Labor Prevention Act, CBP presumes that goods made by an entity on the UFLPA Entity List are made with forced labor and keeps them out. Before the first order, Odelia checks your factories and their wood, fabric and foam suppliers against the list.",
      "根据《维吾尔强迫劳动预防法》，CBP 推定 UFLPA 实体清单上的实体所生产的货物使用了强迫劳动，并禁止其入境。首次下单前，Odelia 会对照该清单核查您的工厂及其木材、面料和海绵供应商。"),
    agency: B("U.S. Department of Homeland Security (Forced Labor Enforcement Task Force)", "美国国土安全部（强迫劳动执法工作组）"),
    proof: P(UFLPA, "apply a rebuttable presumption that goods mined, produced, or manufactured by entities on the UFLPA Entity List are made with forced labor,"),
  },
  {
    id: "us-232-upholstered", kinds: ["upholstered"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("Section 232: 25 percent on certain upholstered wooden furniture", "232 条款：部分木制软体家具加征 25% 关税"),
    text: B("Certain upholstered wooden products entering since October 14, 2025 pay a 25 percent Section 232 tariff on top of other duties. The rise to 30 percent for upholstered furniture was moved to January 1, 2027, except for countries with an agreement. Price your landed cost with it.",
      "自 2025 年 10 月 14 日起入境的部分木制软体产品，在其他关税之外加征 25% 的 232 条款关税。软体家具升至 30% 的时间已推迟至 2027 年 1 月 1 日（已与美国达成协议的国家除外）。核算到岸成本时须计入。"),
    agency: B("The President (Proclamation 11000), collected by U.S. Customs and Border Protection", "美国总统（第 11000 号公告），由美国海关与边境保护局征收"),
    proof: P(S232_WOOD, "a 25 percent ad valorem tariff on imports of certain upholstered wooden products, kitchen cabinets, and vanities."),
  },
  {
    id: "us-301-furniture", kinds: ["china"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("Section 301: wooden furniture from China is on List 3", "301 条款：中国产木制家具在清单 3 上"),
    text: B("If your furniture is made in China, check its HTS codes against Section 301's List 3: its annex names wooden bedroom, kitchen and office furniture, among others. List 3 goods pay an additional 25 percent.",
      "如果您的家具在中国制造，请对照 301 条款清单 3 核对 HTS 编码：其附件列有木制卧室、厨房和办公家具等。清单 3 商品须额外缴纳 25% 关税。"),
    agency: B("Office of the U.S. Trade Representative", "美国贸易代表办公室"),
    proof: P(S301_LIST3, "Furniture (a/than seats) of wood (a/than bentwood), of a kind used in the bedroom"),
  },
  {
    id: "us-301-rate", kinds: ["china"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("Section 301 List 3 goods pay an extra 25 percent", "301 条款清单 3 商品额外缴纳 25%"),
    text: B("Since May 10, 2019 the additional duty on the September 2018 list of Chinese products (List 3) is 25 percent, paid at entry with the other duties.",
      "自 2019 年 5 月 10 日起，2018 年 9 月清单（清单 3）上的中国产品附加关税为 25%，在入境时与其他关税一并缴纳。"),
    agency: B("Office of the U.S. Trade Representative", "美国贸易代表办公室"),
    proof: P(S301_25, "increasing the rate of additional duty from 10 percent to 25 percent for the products of China covered by the September 2018 action"),
  },
  {
    id: "us-ad-bedroom", kinds: ["cnbedroom"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("Antidumping order on wooden bedroom furniture from China (A-570-890)", "中国木制卧室家具反倾销令（A-570-890）"),
    text: B("If your bedroom furniture is wooden and made in China, it falls under the antidumping order: a cash deposit is paid at entry, 216.01 percent for exporters without their own rate (the China-wide rate), so Odelia confirms your exporter's rate before you order.",
      "如果您的卧室家具为木制且在中国制造，即受反倾销令约束：入境时须缴纳现金保证金，没有单独税率的出口商适用 216.01%（中国统一税率），因此 Odelia 会在您下单前核实出口商的税率。"),
    agency: B("U.S. Department of Commerce, International Trade Administration", "美国商务部国际贸易管理局"),
    proof: P(AD_WBF, "The product covered by the Order is wooden bedroom furniture from China."),
  },
  {
    id: "us-ad-reimbursement", kinds: ["cnbedroom"], where: "US", needs: ["imports"], form: CUSTOMS, level: "federal",
    title: B("The importer files a reimbursement certificate before liquidation", "清算前进口商须提交补偿证明"),
    text: B("For entries under the order, the importer files a certificate that the exporter hasn't reimbursed its antidumping duties, before the entries liquidate; without it Commerce may presume reimbursement and assess double duties.",
      "对受该命令约束的报关，进口商须在清算前提交出口商未补偿其反倾销税的证明；否则商务部可推定存在补偿并征收双倍反倾销税。"),
    agency: B("U.S. Department of Commerce, International Trade Administration", "美国商务部国际贸易管理局"),
    proof: P(AD_WBF, "to file a certificate regarding the reimbursement of antidumping duties prior to liquidation of the relevant entries"),
  },

  /* ------------------------------------------------ Furniture: states ------------------------------------------------ */
  {
    id: "ca-prop65-furniture", kinds: ["furniture"], where: "CA", form: ["ca-bhgs-importer", "ca-bhgs-retail", "ca-cdtfa"], level: "state",
    title: B("Proposition 65: decide whether your furniture needs a warning", "65 号提案：判断家具是否需要警示"),
    text: B("Furniture can expose people to chemicals on California's Proposition 65 list: formaldehyde from composite wood and coatings, flame retardants in foam and fabric, phthalates in vinyl, PFOA and PFOS in stain-resistant upholstery. The business determines whether a warning is required before selling in California.",
      "家具可能使人接触加州 65 号提案清单上的化学物质：复合木材和涂料释放的甲醛、海绵和面料中的阻燃剂、乙烯基中的邻苯二甲酸酯，以及防污软体中的 PFOA 和 PFOS。企业须在加州销售前判断是否需要警示。"),
    agency: B("California Office of Environmental Health Hazard Assessment", "加州环境健康危害评估办公室"),
    proof: P(P65_FURNITURE, "Proposition 65 requires businesses to determine if they must provide a warning about significant exposure to listed chemicals."),
  },
  {
    id: "us-oh-upholstered", kinds: ["upholstered"], where: "US", except: ["OH"], needs: ["imports"], level: "state",
    title: B("Selling upholstered furniture into Ohio takes Ohio's registration", "向俄亥俄州销售软体家具须办理该州登记"),
    text: B("Ohio requires anyone making or wholesaling upholstered furniture sold in Ohio to register with its Division of Industrial Compliance, $50 a year, wherever the business is based. If you sell into Ohio, register before your first sale there.",
      "俄亥俄州要求在该州销售的软体家具的制造商或批发商向其工业合规处登记，每年 50 美元，无论企业设在何处。如果您向俄亥俄州销售，须在当地首次销售前登记。"),
    agency: B("Ohio Department of Commerce, Division of Industrial Compliance", "俄亥俄州商务部工业合规处"),
    proof: P(OH_RULE, "Any person who engages in manufacturing or wholesaling bedding or upholstered furniture that is to be sold or offered for sale in this state;"),
  },

  /* ------------------------------------------------ Furniture: states (their own pages) ------------------------------------------------ */
  {
    id: "ca-law-label", kinds: ["upholstered"], where: "CA", form: ["ca-bhgs-importer", "ca-bhgs-retail"], level: "state",
    title: B("Every piece carries California's law label", "每件家具须贴加州法定标签"),
    text: B("Upholstered furniture sold in California carries a law label naming the manufacturer, its location (by registry number) and the filling materials, attached before it is offered for sale.",
      "在加州销售的软体家具须在上架前贴上法定标签，注明制造商、其地点（登记号）及填充材料。"),
    agency: B("California Bureau of Household Goods and Services", "加州家居用品与服务局"),
    proof: P(BHGS_LABELS, "Every article of upholstered furniture and bedding products must have a law label to identify the manufacturer,"),
  },
  {
    id: "ca-tb117-label", kinds: ["upholstered"], where: "CA", form: ["ca-bhgs-importer", "ca-bhgs-retail"], level: "state",
    title: B("The TB 117-2013 label and flame retardant statement", "TB 117-2013 标签及阻燃剂声明"),
    text: B("Upholstered furniture also carries a flammability label naming the standard it meets. Furniture meeting Technical Bulletin 117-2013 states on that label whether its materials contain added flame retardant chemicals.",
      "软体家具还须贴阻燃标签，注明所符合的标准。符合第 117-2013 号技术公报的家具须在该标签上声明其材料是否添加了阻燃化学品。"),
    agency: B("California Bureau of Household Goods and Services", "加州家居用品与服务局"),
    proof: P(BHGS_LABELS, "Products meeting Technical Bulletin 117-2013 must also have the flammability chemical statement on the label."),
  },
  {
    id: "ma-upholstered-license", kinds: ["upholstered"], where: "MA", about: "license", level: "state",
    title: B("Massachusetts licenses upholstered furniture makers and sellers", "马萨诸塞州为软体家具制造和销售商发证"),
    text: B("Massachusetts's Department of Public Health licenses the manufacture and sale of upholstered furniture through its Division of Food Protection. Odelia confirms with the Division whether your business needs the license before anything is filed.",
      "马萨诸塞州公共卫生部通过其食品保护处为软体家具的制造和销售发证。Odelia 会在提交任何申请前向该处核实您的企业是否需要此执照。"),
    agency: B("Massachusetts Department of Public Health, Division of Food Protection", "马萨诸塞州公共卫生部食品保护处"),
    proof: P(MA_DFP, "You must have a license from the Division of Food Protection (DFP) to manufacture and sell stuffed toys, bedding, upholstered furniture,"),
  },
  {
    id: "pa-upholstered-registration", kinds: ["upholstered"], where: "PA", about: "license", level: "state",
    title: B("Pennsylvania registers upholstered furniture makers", "宾夕法尼亚州为软体家具制造商登记"),
    text: B("Pennsylvania's Bedding and Upholstery Law requires manufacturers to use only new filling and to register with the Department of Labor and Industry to sell in the state (Form LIBU-32); importers and vendors may register too. Odelia confirms whether yours must.",
      "宾夕法尼亚州《床上用品与软体家具法》要求制造商只使用新填充物，并向州劳工与工业部登记后方可在该州销售（LIBU-32 表）；进口商和经销商也可登记。Odelia 会核实您是否必须登记。"),
    agency: B("Pennsylvania Department of Labor and Industry", "宾夕法尼亚州劳工与工业部"),
    proof: P(PA_BU, "The law requires manufacturers to use only new filling materials in bedding and upholstered furniture and register with the Bureau"),
  },

  /* ------------------------------------------------ Furniture: the EU (track and explain) ------------------------------------------------ */
  {
    id: "eu-gpsr-operator", kinds: ["furniture"], where: EU27, abroad: true, level: "federal",
    title: B("A responsible economic operator in the EU", "须有一家欧盟境内的责任经济运营商"),
    text: B("Under the EU's General Product Safety Regulation (EU) 2023/988, furniture made outside the EU is placed on the EU market only with an economic operator established in the EU responsible for it, whose contact details go with the product. Odelia tracks it; it isn't a filing.",
      "根据欧盟《通用产品安全法规》（EU）2023/988，欧盟境外制造的家具须有一家设在欧盟境内、对其负责的经济运营商，方可投放欧盟市场，其联系方式须随产品提供。Odelia 会跟进此项，它不是一项申报。"),
    agency: B("European Union (Regulation (EU) 2023/988)", "欧盟（第 2023/988 号法规）"),
    proof: P(GPSR, "A product covered by this Regulation shall not be placed on the market unless there is an economic operator"),
  },
  {
    id: "eu-eudr", kinds: ["furniture"], where: EU27, abroad: true, form: EU_ENTRY, level: "federal",
    title: B("EU Deforestation Regulation: prove the wood isn't from deforested land", "欧盟《零毁林法规》：证明木材并非来自毁林土地"),
    text: B("Wood and its derived products, furniture among them, are in scope: any operator or trader placing them on the EU market must be able to prove they don't come from recently deforested land. The Regulation repeals the EU Timber Regulation.",
      "木材及其衍生产品（包括家具）均在适用范围内：将其投放欧盟市场的任何经营者或贸易商都必须能够证明产品并非来自近期毁林的土地。该法规废止《欧盟木材法规》。"),
    agency: B("European Commission (Regulation (EU) 2023/1115)", "欧盟委员会（第 2023/1115 号法规）"),
    proof: P(EUDR, "must be able to prove that the products do not originate from recently deforested land"),
  },
  {
    id: "eu-eudr-dates", kinds: ["furniture"], where: EU27, abroad: true, form: EU_ENTRY, level: "federal",
    title: B("It applies from 30 December 2026 for large and medium operators", "大中型经营者自 2026 年 12 月 30 日起适用"),
    text: B("Large and medium operators apply the Deforestation Regulation from 30 December 2026; micro and small operators from 30 June 2027 (or 30 December 2026 if the EU Timber Regulation already covered them).",
      "大中型经营者自 2026 年 12 月 30 日起适用《零毁林法规》；微型和小型经营者自 2027 年 6 月 30 日起适用（如已受《欧盟木材法规》约束，则自 2026 年 12 月 30 日起）。"),
    agency: B("European Commission (Regulation (EU) 2023/1115)", "欧盟委员会（第 2023/1115 号法规）"),
    proof: P(EUDR, "Large and medium operators: 30 December 2026 Micro and small operators: 30 June 2027"),
  },

  /* ------------------------------------------------ Furniture: Great Britain (track and explain) ------------------------------------------------ */
  {
    id: "gb-gpsr-traceability", kinds: ["furniture"], where: "GB", form: ["gb-eori"], level: "federal",
    title: B("Your name and address on the product or its packaging", "产品或包装上须有您的名称和地址"),
    text: B("Under Great Britain's General Product Safety Regulations 2005, the producer (a UK importer counts) places only safe products on the market and marks the product or its packaging with its name, address and a product or batch reference.",
      "根据英国（大不列颠）《2005 年通用产品安全条例》，生产者（包括英国进口商）只能将安全产品投放市场，并在产品或包装上标明其名称、地址以及产品或批次编号。"),
    agency: B("Office for Product Safety and Standards", "英国产品安全与标准办公室"),
    proof: P(GB_GPSR, "The producer must also allow for traceability by indicating on the product or its packaging, where reasonable to do so:"),
  },
  {
    id: "gb-timber", kinds: ["furniture"], where: "GB", form: ["gb-eori"], level: "federal",
    title: B("UK Timber Regulations: due diligence before the first sale", "英国木材法规：首次销售前完成尽职调查"),
    text: B("The business that first places wooden furniture on the GB market is the operator: it must not place illegally harvested timber there, and applies a due diligence system first.",
      "首次将木制家具投放英国市场的企业即为经营者：不得投放非法采伐的木材，并须事先实行尽职调查体系。"),
    agency: B("Office for Product Safety and Standards (for Defra)", "英国产品安全与标准办公室（代表环境、食品和农村事务部）"),
    proof: P(GB_TIMBER, "Operators must not place illegally harvested timber on the GB market and to avoid doing so must first apply a due diligence system,"),
  },
  {
    id: "gb-fire-cigarette", kinds: ["upholstered"], where: "GB", form: ["gb-eori"], level: "federal",
    title: B("Upholstery passes the cigarette test", "软体部分须通过香烟测试"),
    text: B("Under the Furniture and Furnishings (Fire) (Safety) Regulations 1988, upholstered furniture sold in Great Britain includes only upholstery that passes the cigarette test in Schedule 4.",
      "根据《1988 年家具及陈设（防火）（安全）条例》，在英国销售的软体家具只能使用通过附表 4 香烟测试的软体材料。"),
    agency: B("UK Furniture and Furnishings (Fire) (Safety) Regulations 1988", "英国《1988 年家具及陈设（防火）（安全）条例》"),
    proof: P(GB_FIRE_5, "no furniture to which this regulation applies shall include upholstery which does not pass the cigarette test in Part I of Schedule 4"),
  },
  {
    id: "gb-fire-match", kinds: ["upholstered"], where: "GB", form: ["gb-eori"], level: "federal",
    title: B("Covers pass the match test", "面料须通过火柴测试"),
    text: B("Upholstered furniture supplied with a cover: the cover's visible parts pass the match test in Schedule 5 (an interliner that passes Schedule 3 can stand in for some cover materials).",
      "带面料供应的软体家具：面料可见部分须通过附表 5 的火柴测试（部分面料材质可改用通过附表 3 测试的隔层）。"),
    agency: B("UK Furniture and Furnishings (Fire) (Safety) Regulations 1988", "英国《1988 年家具及陈设（防火）（安全）条例》"),
    proof: P(GB_FIRE_8, "any visible part of the cover shall pass the match test in Part I of Schedule 5 to these Regulations"),
  },

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

/** What kinds of business the words name: "Milk tea shop" is tea, "Bakery cafe" is a bakery and a coffee shop,
    "Cantonese restaurant" a restaurant. A dessert or ice cream shop is none of them. Furniture comes first (a "coffee
    table" brand isn't a coffee shop): "Upholstered furniture brand" is furniture and upholstered, "dressers" are
    furniture and clothing storage. */
export function kindsOf(what: string): StoreKind[] {
  if (isFurniture(what)) {
    const n = furnitureNeeds(what);
    const o = furnitureOrigin(what);
    return ["furniture", ...(n.upholstered ? ["upholstered" as const] : []), ...(n.clothingStorage ? ["storage" as const] : []), ...(n.children ? ["children" as const] : []),
      ...(o.china ? ["china" as const] : []), ...(o.chinaBedroom ? ["cnbedroom" as const] : [])];
  }
  const w = what.toLowerCase(), out: StoreKind[] = [];
  if (/\b(tea|boba)\b|奶茶|茶饮|茶铺|茶店/.test(w)) out.push("tea");
  if (/\b(coffee|caf[eé]s?|espresso)\b|咖啡/.test(w)) out.push("coffee");
  if (/\b(bak(e|ery|eries|ing|ed)|bakehouse|pastr(y|ies)|patisserie)\b|面包|烘焙|糕点|西点|蛋糕/.test(w)) out.push("bakery");
  if (!out.length && /restaurant|hot ?pot|noodle|dumpling|ramen|\bpho\b|malatang|bistro|diner|eatery|grill|bbq|barbecue|kitchen|sushi|dim sum|餐|饭店|火锅|麻辣烫|面馆|饺子/.test(w)) out.push("restaurant");
  return out;
}

/** The facts for these kinds of business at these places (the registry's jurisdictions for the address), for a business
    that does what `have` says (a fact that needs imports isn't stated without it). */
export function kindFactsAt(kinds: StoreKind[], places: string[], have: Needs = {}): KindFact[] {
  const abroad = !places.includes("US");
  return KIND_FACTS.filter(k => (Array.isArray(k.where) ? k.where : [k.where]).some(w => places.includes(w)) && (!k.abroad || abroad) && !(k.except ?? []).some(w => places.includes(w))
    && (k.needs ?? []).every(n => have[n]) && k.kinds.some(x => kinds.includes(x)));
}
