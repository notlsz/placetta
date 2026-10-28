// The whole journey, not only the permits to open: what a business files, keeps on its products and its premises, and
// is told by an agency, from forming the company to selling online, for Placetta's customers (food and drink, tea and
// coffee, retail, furniture makers, importers and showrooms, cosmetics and personal care, consumer products, e-commerce
// sellers and importers). Read 2026-10-23 from official pages only (.gov, GovInfo's Code of Federal Regulations, state
// codes and agency pages), each quote under 25 words, copied from the page as fetched with curl
// (scripts/eval/proof-read.py) and kept in the read log; a page that refused every automated read leaves its item
// UNVERIFIED (no quote): the plan names the agency and its link and states no fee for it.
//
// Three kinds, kept apart because Placetta does different things with each:
//   filing      a license, registration or filing Placetta can prepare and file (or hand to the professional who must)
//   checklist   a label, design or workplace requirement: Placetta lists it and says where to verify it; it never
//               certifies a product, a label or a premises
//   advisory    an agency or a rule decides (OEHHA under Proposition 65, CBP on a tariff classification, the bank on an
//               account, a city's wage ordinance): Placetta cites the rule and tracks it, and doesn't advise
//
// An item that is already a registry filing (src/forms/registry.ts) names it in `refs` and takes its proof, fee and place
// from there, so the plan never states two versions of one requirement; an item about a product label the kinds facts
// already quote (src/forms/kinds.ts) names the fact in `fact`. Everything else carries its own source.
//
// Triggers are the registry's `needs` plus what the intake asks (src/plan/intake.ts): manufactures, imports,
// upholstered, children's products, sells online, has employees. `when` says the condition in words, the way an owner
// would hear it ("within 15 days of paying over $100 in wages"), so a plan never claims a condition holds.
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import type { Segment } from "./registry";

export const READ_LIFE = "2026-10-23";

export type LifeStage = "start" | "open" | "employ" | "sell" | "online";
export type LifeKind = "filing" | "checklist" | "advisory";
/** What the business does, as the plan and the intake read it (src/plan/also.ts haveOf). */
export type Have = {
  food?: boolean; packagedFood?: boolean; cosmetics?: boolean; furniture?: boolean; upholstered?: boolean; clothingStorage?: boolean; children?: boolean;
  textile?: boolean; consumer?: boolean; employees?: boolean; imports?: boolean; manufactures?: boolean; online?: boolean; premises?: boolean;
  newEntity?: boolean; foreignEntity?: boolean;
  foreignOwned?: boolean; corp?: boolean;   // a US company 25% or more owned from outside the US (Form 5472); a corporation, not an LLC
};
export type LifeItem = {
  id: string;
  stage: LifeStage;
  kind: LifeKind;
  title: Bi;                 // the name an owner knows it by
  detail?: Bi;               // what goes in brackets after it: the form and the fee ("California LLC-1, $70")
  when?: Bi;                 // the condition, in words ("if you sell upholstered furniture")
  whenAt?: Record<string, Bi>;   // the condition where it differs by state, keyed by the state of the filing it is
  why: Bi;                   // one plain line: what it is and why it matters
  agency: Bi;
  level: Level;
  where?: string | string[]; // the registry's jurisdictions ("US", "CA", "SF", "GB"); a ref'd item takes its form's
  except?: string[];         // not at these places (California's own remote seller rule isn't for a California seller)
  needs?: (keyof Have)[];    // all of these
  any?: (keyof Have)[];      // at least one of these
  unless?: (keyof Have)[];   // none of these
  segments?: Segment[];
  refs?: string[];           // the registry filings it is, first one at the place wins (its proof, fee and link)
  refsLike?: RegExp;         // and, where none of those is filed at the place, any registry filing whose id matches (the
                             // formation filing of a state the list doesn't name, its workers' compensation entry)
  fact?: string;             // the kinds fact (src/forms/kinds.ts) whose quote it carries
  form?: string;             // the form or portal
  url?: string;              // where it's filed, or the rule
  fee?: number | null;       // only when the agency publishes it
  renews?: Bi;
  source?: { url: string; quote?: string };   // its own proof; no quote: UNVERIFIED
  decides?: Bi;              // advisory: who decides
  verify?: Bi;               // checklist: where to check it
  specialist?: Bi;           // a filing only a licensed professional may make
  feeless?: boolean;         // a filing with no government fee to confirm (named on another filing)
};

const L = (en: string, zh: string) => B(en, zh);
const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];

const FTB_LLC = "https://www.ftb.ca.gov/file/business/types/limited-liability-company/index.html";
const CA_AGENT = "https://www.sos.ca.gov/business-programs/business-entities/service-process";
const USPTO_FEES = "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";
const USPTO_ATTY = "https://www.uspto.gov/trademarks/basics/do-i-need-attorney";
const CDD = "https://www.govinfo.gov/content/pkg/CFR-2025-title31-vol3/pdf/CFR-2025-title31-vol3-sec1010-230.pdf";
const TITLE17 = "https://www.copyright.gov/title17/92chap1.html";
const ADA = "https://www.ada.gov/resources/title-iii-primer/";
const NEW_HIRE = "https://www.acf.hhs.gov/css/employers/employer-responsibilities/new-hire-reporting";
const CA_DE34 = "https://edd.ca.gov/en/payroll_taxes/new_hire_reporting";
const NY_NEW_HIRE = "https://www.tax.ny.gov/bus/wt/newhire.htm";
const DOL_POSTERS = "https://www.dol.gov/general/topics/posters";
const CA_POSTERS = "https://www.dir.ca.gov/wpnodb.html";
const I9 = "https://www.govinfo.gov/content/pkg/CFR-2025-title8-vol1/pdf/CFR-2025-title8-vol1-sec274a-2.pdf";
const FL_EVERIFY = "https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0448/Sections/0448.095.html";
const SF_MWO = "https://www.sf.gov/information--minimum-wage-ordinance";
const SF_PSLO = "https://www.sf.gov/information--paid-sick-leave-ordinance";
const CA_PSL = "https://www.dir.ca.gov/dlse/paid_sick_leave.htm";
const NYC_ESSTA = "https://www.nyc.gov/site/dca/about/paid-safe-sick-leave-law.page";
const LA_WAGES = "https://wagesla.lacity.gov/";
const BHGS_FLYER = "https://bhgs.dca.ca.gov/forms_pubs/19-012_statelicflyer.pdf";
const CFR_1261 = "https://www.govinfo.gov/content/pkg/CFR-2025-title16-vol2/pdf/CFR-2025-title16-vol2-part1261.pdf";
const CPSC_CPC = "https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/Childrens-Product-Certificate-CPC";
const CPSC_GCC = "https://www.cpsc.gov/Business--Manufacturing/Testing-Certification/General-Certificate-of-Conformity";
const CFR_1110 = "https://www.govinfo.gov/content/pkg/CFR-2025-title16-vol2/pdf/CFR-2025-title16-vol2-part1110.pdf";
const CFR_101_9 = "https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol2/pdf/CFR-2025-title21-vol2-sec101-9.pdf";
const FDA_ALLERGENS = "https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies";
const CFR_1_279 = "https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol1/pdf/CFR-2025-title21-vol1-sec1-279.pdf";
const CFR_701_3 = "https://www.govinfo.gov/content/pkg/CFR-2025-title21-vol7/pdf/CFR-2025-title21-vol7-sec701-3.pdf";
const FDA_COSMETICS = "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products";
const CFR_303 = "https://www.govinfo.gov/content/pkg/CFR-2025-title16-vol1/pdf/CFR-2025-title16-vol1-part303.pdf";
const CFR_423 = "https://www.govinfo.gov/content/pkg/CFR-2025-title16-vol1/pdf/CFR-2025-title16-vol1-part423.pdf";
const CFR_134 = "https://www.govinfo.gov/content/pkg/CFR-2025-title19-vol1/pdf/CFR-2025-title19-vol1-part134.pdf";
const CFR_177 = "https://www.govinfo.gov/content/pkg/CFR-2025-title19-vol2/pdf/CFR-2025-title19-vol2-part177.pdf";
const CA_NEXUS = "https://www.cdtfa.ca.gov/industry/wayfair.htm";
const CA_MPF = "https://cdtfa.ca.gov/industry/MPFAct.htm";
const TX_REMOTE = "https://comptroller.texas.gov/taxes/sales/remote-sellers.php";
const FL_REMOTE = "https://floridarevenue.com/taxes/eservices/Pages/registration.aspx";
const NY_SALES = "https://www.tax.ny.gov/bus/st/register.htm";
const P65_BUSINESS = "https://www.p65warnings.ca.gov/new-proposition-65-warnings/businesses";
const GB_COSMETICS = "https://www.gov.uk/guidance/making-cosmetic-products-available-to-consumers-in-great-britain";

const CPSC = L("U.S. Consumer Product Safety Commission", "美国消费品安全委员会（CPSC）");
const FDA = L("U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）");
const FTC = L("Federal Trade Commission", "美国联邦贸易委员会（FTC）");
const CBP = L("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）");

export const LIFECYCLE: LifeItem[] = [
  /* ------------------------------------------------------------ A. Start the business */
  {
    id: "life-formation", stage: "start", kind: "filing", level: "state", needs: ["newEntity"],
    refs: ["ca-llc-1", "ny-dos-1336", "tx-205", "fl-sunbiz", "mn-sos-llc", "or-sos-llc", "oh-sos-llc"], refsLike: /./,
    title: L("Company formation", "成立公司"), when: L("if you haven't formed a US company yet", "如果您还没有成立美国公司"),
    why: L("The company is formed with the state first; its name and number go on every other filing.", "公司须先在州政府成立，其名称和编号会用在其他所有申请上。"),
    agency: L("The state's business filing office", "州企业登记机构"),
  },
  {
    id: "ca-ftb-annual-tax", stage: "start", kind: "filing", level: "state", where: "CA", needs: ["newEntity"],
    title: L("California annual LLC tax", "加州 LLC 年度税"), detail: L("FTB 3522, $800 a year", "FTB 3522 表，每年 800 美元"),
    when: L("every year once a California LLC is formed or registered, even before it does business", "加州 LLC 成立或登记后每年缴纳，即使尚未开展业务"),
    why: L("Every LLC organized or doing business in California owes the $800 tax each year until it is cancelled.", "在加州成立或经营的 LLC 每年都须缴纳 800 美元税款，直至注销。"),
    agency: L("California Franchise Tax Board", "加州税务局（FTB）"), form: "FTB 3522", url: FTB_LLC, fee: 800, renews: L("Every year.", "每年一次。"),
    source: { url: FTB_LLC, quote: "Every LLC that is doing business or organized in California must pay an annual tax of $800." },
  },
  {
    id: "ca-agent", stage: "start", kind: "filing", level: "state", where: "CA", needs: ["newEntity"],
    title: L("Agent for service of process (registered agent)", "法律文书送达代理人（注册代理人）"), when: L("named on the formation filing, with a California address", "在成立文件中指定，须有加州地址"),
    why: L("Every LLC and corporation names someone in the state to receive legal papers; Placetta puts it on the Articles.", "每家 LLC 和公司都须在州内指定接收法律文书的人，快哉会写在组织章程上。"),
    agency: L("California Secretary of State", "加州州务卿"), url: CA_AGENT, feeless: true,
    source: { url: CA_AGENT, quote: "Corporations, limited liability companies, limited partnerships, and limited liability partnerships are required by statute to designate an agent for service of process." },
  },
  {
    id: "life-itin", stage: "start", kind: "filing", level: "federal", needs: ["foreignEntity"], refs: ["irs-w7"],
    title: L("ITIN for an owner without a Social Security number", "为没有社会安全号的股东申请 ITIN"), when: L("only if an owner needs a US tax number and can't get an SSN", "仅当股东需要美国税号但无法取得 SSN 时"),
    why: L("The IRS's tax number for people who can't get a Social Security number.", "IRS 为无法取得社会安全号的个人发放的税号。"), agency: L("Internal Revenue Service", "美国国税局（IRS）"),
  },
  {
    id: "life-boi", stage: "start", kind: "advisory", level: "federal", where: "US",
    title: L("Beneficial ownership (BOI) report", "受益所有人（BOI）报告"), when: L("not filed by a US-formed company; only a company formed abroad and registered in a state files", "在美国成立的公司无需申报；只有在外国成立并在州注册的公司须申报"),
    why: L("FinCEN decides who reports. Under its current rule a US company files nothing.", "由 FinCEN 决定谁须申报。按现行规定，美国公司无需申报。"),
    agency: L("Financial Crimes Enforcement Network (FinCEN)", "美国金融犯罪执法网络（FinCEN）"), decides: L("FinCEN", "FinCEN"), url: "https://www.fincen.gov/boi",
    source: { url: "https://www.fincen.gov/boi", quote: "U.S. companies are exempt from BOI reporting requirements and therefore, are no longer required to file BOI reports." },
  },
  // the yearly federal returns of a foreign-owned company (the federal audit's gap): Form 5472 for a company formed abroad
  // and for a US company a foreign person owns 25% or more of; it rides on Form 1120-F for the first and, for a
  // single-member LLC, on a pro forma Form 1120 (Instructions for Form 5472, "Reporting corporation")
  {
    id: "life-5472", stage: "start", kind: "filing", level: "federal", any: ["foreignEntity", "foreignOwned"], refs: ["irs-5472"],
    title: L("Foreign ownership information return (Form 5472)", "外资持股信息申报（5472 表）"),
    when: L("every year with the tax return: a US corporation 25% or more foreign-owned, an LLC with one owner outside the US, or a company formed abroad doing business here", "每年随所得税申报表提交：适用于外资持股 25% 以上的美国公司、由一位境外股东持有的 LLC，或在美国开展业务的外国公司"),
    why: L("Reports the foreign owner and the company's dealings with related parties, the owner included. The penalty for not filing starts at $25,000.", "申报境外股东，以及公司与关联方（包括股东本人）之间的往来。未申报罚款起点为 25,000 美元。"),
    agency: L("Internal Revenue Service", "美国国税局（IRS）"),
  },
  {
    id: "life-1120-pro-forma", stage: "start", kind: "filing", level: "federal", needs: ["foreignOwned"], unless: ["foreignEntity", "corp"], refs: ["irs-1120"],
    title: L("Pro forma Form 1120 that carries Form 5472", "附 5472 表的形式 1120 表"),
    when: L("every year, if one owner outside the US owns the whole LLC", "如果 LLC 由一位境外股东全资持有，则每年提交"),
    why: L("An LLC with one foreign owner files no income tax return of its own, so it files Form 5472 on a pro forma Form 1120, faxed or mailed.", "由一位境外股东持有的 LLC 本身不申报所得税，因此须将 5472 表附在形式 1120 表上，以传真或邮寄提交。"),
    agency: L("Internal Revenue Service", "美国国税局（IRS）"),
  },
  {
    id: "life-1120f", stage: "start", kind: "filing", level: "federal", needs: ["foreignEntity"], refs: ["irs-1120f"],
    title: L("US income tax return of a foreign corporation (Form 1120-F)", "外国公司美国所得税申报（1120-F 表）"),
    when: L("every year, for a company formed abroad that does business in the US", "在美国开展业务的外国公司每年申报"),
    why: L("A company formed abroad reports its US business to the IRS each year, with Form 5472 attached when it has dealings with related parties.", "在外国成立的公司每年须向 IRS 申报其在美业务；与关联方有往来的须附 5472 表。"),
    agency: L("Internal Revenue Service", "美国国税局（IRS）"),
  },
  {
    id: "life-dba", stage: "start", kind: "filing", level: "county", refs: ["fl-fictitious", "ny-assumed-name", "lac-fbn", "scc-fbn"],
    title: L("Trade name (DBA or fictitious business name)", "商号登记（DBA 或虚拟商业名称）"), when: L("if you sell under a name other than the company's legal name", "如果您以公司法定名称以外的名称经营"),
    why: L("Registers the brand name you trade under, so customers and banks can tie it to the company.", "登记您经营使用的品牌名称，便于客户和银行将其与公司对应。"), agency: L("The county clerk or the state", "县书记官或州政府"),
  },
  {
    id: "uspto-trademark", stage: "start", kind: "filing", level: "federal", where: "US",
    title: L("Federal trademark application", "联邦商标申请"), detail: L("USPTO, $350 per class", "美国专利商标局，每类 350 美元"),
    when: L("optional; it protects the brand name nationwide", "可选；在全美范围保护品牌名称"),
    why: L("Registers the brand with the USPTO. A foreign-domiciled owner must file through a US-licensed attorney.", "在美国专利商标局注册品牌。住所在境外的申请人必须通过美国执业律师提交。"),
    agency: L("United States Patent and Trademark Office", "美国专利商标局（USPTO）"), form: "Trademark Center base application", url: USPTO_FEES, fee: 350,
    specialist: L("A foreign-domiciled applicant must be represented by a US-licensed attorney; Placetta prepares the file for one.", "住所在境外的申请人必须由美国执业律师代理；快哉为律师准备好材料。"),
    source: { url: USPTO_FEES, quote: "Base application, per class 350.00" },
  },
  {
    id: "uspto-attorney", stage: "start", kind: "advisory", level: "federal", where: "US", needs: ["foreignEntity"],
    title: L("A US attorney for a foreign-domiciled trademark owner", "境外商标申请人须聘请美国律师"), why: L("The USPTO requires it; the owner chooses the attorney.", "这是美国专利商标局的要求，律师由申请人自行选择。"),
    agency: L("United States Patent and Trademark Office", "美国专利商标局（USPTO）"), decides: L("USPTO", "美国专利商标局"), url: USPTO_ATTY,
    source: { url: USPTO_ATTY, quote: "If you are a foreign-domiciled trademark applicant or registrant, you must have a U.S.-licensed attorney represent you." },
  },
  {
    id: "bank-account", stage: "start", kind: "advisory", level: "federal", where: "US",
    title: L("Business bank account", "企业银行账户"),
    when: L("the bank decides and opens it; Placetta doesn't open accounts", "由银行审核并开户，快哉不代开账户"),
    why: L("Banks must identify the company's owners when the account opens: bring the formation filing, the EIN letter and each owner's ID.", "银行开户时必须核实公司的所有人：请带上成立文件、EIN 确认函和每位所有人的身份证件。"),
    agency: L("Financial Crimes Enforcement Network rule, applied by the bank", "FinCEN 规定，由银行执行"), decides: L("the bank", "银行"), url: CDD,
    source: { url: CDD, quote: "Identify the beneficial owner(s) of each legal entity customer at the time a new account is opened" },
  },

  /* ------------------------------------------------------------ B. Open the location */
  {
    id: "life-formula-retail", stage: "open", kind: "filing", level: "city", refs: ["sf-formula-retail"], segments: ["restaurant", "retail"],
    title: L("Formula retail affidavit", "连锁零售经营声明书"), detail: L("SF Planning", "旧金山规划局"),
    when: L("only if you have 11 or more other locations worldwide", "仅当您在全球另有 11 家及以上门店时"),
    why: L("San Francisco treats chains differently by district: some need a hearing, a few ban them.", "旧金山各街区对连锁店规定不同：有的需要听证，少数禁止。"), agency: L("San Francisco Planning Department", "旧金山规划局"),
  },
  {
    id: "life-alarm", stage: "open", kind: "filing", level: "city", refs: ["la-alarm-permit"], segments: PREMISES,
    title: L("Alarm permit", "报警系统许可"), when: L("if you run a burglar alarm system", "如果您使用防盗报警系统"),
    why: L("The city requires a permit for each alarm system it may be called to.", "市政府要求每套报警系统取得许可。"), agency: L("City of Los Angeles Office of Finance", "洛杉矶市财政办公室"),
  },
  {
    id: "music-license", stage: "open", kind: "advisory", level: "federal", where: "US", needs: ["premises"], segments: ["restaurant", "retail"],
    title: L("Music played for customers", "为顾客播放音乐"), when: L("if you play recorded music or radio in the store", "如果您在店内播放录制音乐或广播"),
    why: L("Playing music publicly is the copyright owners' right, so a store usually needs their license; some small places are exempt under 17 U.S.C. 110(5).", "公开播放音乐属于版权人的权利，因此门店通常需要取得授权；部分小型场所依 17 U.S.C. 110(5) 豁免。"),
    agency: L("U.S. Copyright Office (Title 17)", "美国版权局（第 17 编）"), decides: L("the copyright owners and their licensing organizations", "版权人及其授权组织"), url: TITLE17,
    source: { url: TITLE17, quote: "in the case of literary, musical, dramatic, and choreographic works, pantomimes, and motion pictures and other audiovisual works, to perform the copyrighted work publicly;" },
  },
  {
    id: "ada-access", stage: "open", kind: "checklist", level: "federal", where: "US", needs: ["premises"], segments: ["restaurant", "retail"],
    title: L("Accessibility (ADA) basics", "无障碍（ADA）基本要求"), when: L("for any store open to the public", "适用于所有对公众开放的门店"),
    why: L("A store removes barriers when it is readily achievable, and new work follows the 2010 ADA Standards.", "门店须在易于实现时消除障碍，新施工须符合 2010 年 ADA 标准。"),
    agency: L("U.S. Department of Justice", "美国司法部"), verify: L("ada.gov, and the building office's plan check", "ada.gov，以及建筑部门的图纸审查"), url: ADA,
    source: { url: ADA, quote: "must remove architectural barriers to elements subject to the new requirements in the 2010 Standards when it is readily achievable to do so." },
  },

  /* ------------------------------------------------------------ C. Employ people */
  {
    id: "life-employer", stage: "employ", kind: "filing", level: "state", needs: ["employees"],
    refs: ["ca-edd-de1", "ny-dol-100", "tx-twc", "fl-dor"],
    title: L("State employer registration", "州雇主登记"), when: L("once you have staff on payroll", "有员工发薪后"),
    whenAt: { CA: L("within 15 days of paying over $100 in wages", "支付工资超过 100 美元后 15 天内") },
    why: L("Opens the state payroll tax and unemployment insurance account.", "开设州工资税和失业保险账户。"), agency: L("The state employment agency", "州就业机构"),
  },
  {
    id: "life-workers-comp", stage: "employ", kind: "filing", level: "state", needs: ["employees"],
    refs: ["ca-workers-comp", "ny-wcb", "tx-workers-comp", "fl-workers-comp"], refsLike: /-workers-comp$/,
    title: L("Workers' compensation insurance", "工伤保险"), when: L("the state sets which employers must carry it", "由州政府规定哪些雇主须投保"),
    whenAt: {
      CA: L("required with even one employee", "即使只有一名员工也须投保"),
      TX: L("optional for most private employers in Texas", "德州多数私营雇主可自行选择是否投保"),
      FL: L("required by industry and number of employees", "按行业和员工人数规定是否须投保"),
    },
    why: L("Covers staff hurt at work; bought from an insurer before the first employee starts.", "为工作中受伤的员工提供保障，须在首位员工入职前向保险公司购买。"), agency: L("The state's workers' compensation agency", "州工伤赔偿机构"),
  },
  {
    id: "new-hire-report", stage: "employ", kind: "filing", level: "state", where: "US", needs: ["employees"], except: ["CA", "NY"],
    title: L("New hire report", "新员工报告"), when: L("within 20 days of each hire", "每次雇人后 20 天内"),
    why: L("Each new employee is reported to the state where they work.", "每位新员工都须向其工作所在州报告。"),
    agency: L("The state's new hire registry (federal rule)", "州新员工登记处（联邦规定）"), url: NEW_HIRE, feeless: true,
    source: { url: NEW_HIRE, quote: "Federal law requires employers to report basic information on new and rehired employees within 20 days of hire" },
  },
  {
    id: "ca-new-hire", stage: "employ", kind: "filing", level: "state", where: "CA", needs: ["employees"],
    title: L("New hire report", "新员工报告"), detail: L("EDD DE 34", "EDD DE 34 表"), when: L("within 20 days of each hire", "每次雇人后 20 天内"),
    why: L("Each new employee is reported to EDD, online or on the DE 34.", "每位新员工都须在网上或用 DE 34 表向 EDD 报告。"),
    agency: L("California Employment Development Department", "加州就业发展局（EDD）"), form: "DE 34", url: CA_DE34, fee: 0,
    source: { url: CA_DE34, quote: "Use e-Services for Business to submit a Report of New Employee(s) (DE 34)." },
  },
  {
    id: "ny-new-hire", stage: "employ", kind: "filing", level: "state", where: "NY", needs: ["employees"],
    title: L("New hire report", "新员工报告"), when: L("within 20 calendar days of each hire", "每次雇人后 20 个日历日内"),
    why: L("Each new employee working in New York is reported to the Tax Department.", "在纽约州工作的每位新员工都须向州税务局报告。"),
    agency: L("New York State Department of Taxation and Finance", "纽约州税务与财政局"), url: NY_NEW_HIRE, fee: 0,
    source: { url: NY_NEW_HIRE, quote: "You must report newly hired or rehired employees who will be employed in New York State within 20 calendar days from the hiring date." },
  },
  {
    id: "us-posters", stage: "employ", kind: "checklist", level: "federal", where: "US", needs: ["employees"],
    title: L("Required workplace posters (federal)", "法定工作场所告示（联邦）"), when: L("once you have staff", "有员工后"),
    why: L("Federal labor laws require notices posted where staff can see them; DOL's Poster Advisor lists which apply.", "联邦劳动法要求在员工可见处张贴告示；劳工部的告示指引会列出适用的告示。"),
    agency: L("U.S. Department of Labor", "美国劳工部"), verify: L("DOL's elaws Poster Advisor", "劳工部 elaws 告示指引"), url: DOL_POSTERS,
    source: { url: DOL_POSTERS, quote: "require that notices be provided to employees and/or posted in the workplace." },
  },
  {
    id: "ca-posters", stage: "employ", kind: "checklist", level: "state", where: "CA", needs: ["employees"],
    title: L("California workplace postings and the yearly rights notice", "加州工作场所告示及年度权利通知"), when: L("by February 1 every year", "每年 2 月 1 日前"),
    why: L("California employers post the state's notices and give staff the workplace rights notice each year.", "加州雇主须张贴州告示，并每年向员工提供工作场所权利通知。"),
    agency: L("California Department of Industrial Relations", "加州劳资关系部"), verify: L("DIR's Workplace Postings page", "劳资关系部工作场所告示页面"), url: CA_POSTERS,
    source: { url: CA_POSTERS, quote: "On or before February 1, 2026, and each year after that, an employer must provide employees a required workplace rights notice." },
  },
  {
    id: "i9", stage: "employ", kind: "checklist", level: "federal", where: "US", needs: ["employees"],
    title: L("Form I-9 for every hire", "每位新员工的 I-9 表"), when: L("within three business days of each hire; kept on file, not filed", "每次雇人后 3 个工作日内完成；留存备查，无需提交"),
    why: L("The employer checks each new employee's identity and work authorization documents.", "雇主须核查每位新员工的身份及工作许可文件。"),
    agency: L("U.S. Citizenship and Immigration Services (8 CFR 274a.2)", "美国公民及移民服务局（8 CFR 274a.2）"), verify: L("USCIS's I-9 Central", "USCIS 的 I-9 中心"), url: I9,
    source: { url: I9, quote: "must examine documents that evidence the identity and employment authorization of the individual" },
  },
  {
    id: "fl-everify", stage: "employ", kind: "checklist", level: "state", where: "FL", needs: ["employees"],
    title: L("E-Verify for new hires", "新员工须使用 E-Verify 核验"), when: L("if you have 25 or more employees", "如果您有 25 名及以上员工"),
    why: L("Florida requires private employers of 25 or more to check each new hire in E-Verify.", "佛罗里达州要求 25 名及以上员工的私营雇主用 E-Verify 核验每位新员工。"),
    agency: L("Florida Statutes section 448.095", "佛罗里达州法典第 448.095 条"), verify: L("e-verify.gov", "e-verify.gov"), url: FL_EVERIFY,
    source: { url: FL_EVERIFY, quote: "Beginning on July 1, 2023, a private employer with 25 or more employees shall use the E-Verify system" },
  },
  {
    id: "sf-minimum-wage", stage: "employ", kind: "advisory", level: "city", where: "SF", needs: ["employees"],
    title: L("San Francisco minimum wage", "旧金山最低工资"), when: L("set each July 1", "每年 7 月 1 日调整"),
    why: L("The city's rate, above the state's, applies to all work done in San Francisco. Placetta tracks it; it doesn't advise on pay.", "市级标准高于州标准，适用于在旧金山完成的所有工作。快哉跟踪该标准，不提供薪酬建议。"),
    agency: L("San Francisco Office of Labor Standards Enforcement", "旧金山劳动标准执法办公室"), decides: L("the city's ordinance", "市条例"), url: SF_MWO,
    source: { url: SF_MWO, quote: "Employers are required to pay no less than the San Francisco minimum wage to employees performing work in San Francisco" },
  },
  {
    id: "sf-sick-leave", stage: "employ", kind: "advisory", level: "city", where: "SF", needs: ["employees"],
    title: L("San Francisco paid sick leave", "旧金山带薪病假"), when: L("from the first hour worked in the city", "自在本市工作的第一小时起"),
    why: L("Staff earn 1 hour of paid sick leave for every 30 hours worked. Placetta tracks the rule; it doesn't advise.", "员工每工作 30 小时可累积 1 小时带薪病假。快哉跟踪该规定，不提供建议。"),
    agency: L("San Francisco Office of Labor Standards Enforcement", "旧金山劳动标准执法办公室"), decides: L("the city's ordinance", "市条例"), url: SF_PSLO,
    source: { url: SF_PSLO, quote: "Employees earn 1 hour of paid sick leave for every 30 hours worked." },
  },
  {
    id: "ca-sick-leave", stage: "employ", kind: "advisory", level: "state", where: "CA", needs: ["employees"],
    title: L("California paid sick leave", "加州带薪病假"), when: L("at least 5 days or 40 hours a year", "每年至少 5 天或 40 小时"),
    why: L("State law sets the minimum; a city's own ordinance can require more. Placetta tracks the rule; it doesn't advise.", "州法律规定最低标准，市条例可要求更多。快哉跟踪该规定，不提供建议。"),
    agency: L("California Labor Commissioner", "加州劳工专员办公室"), decides: L("state law", "州法律"), url: CA_PSL,
    source: { url: CA_PSL, quote: "Starting on January 1, 2024, employers must generally provide 5 days or 40 hours of paid sick leave to their employees in California." },
  },
  {
    id: "nyc-sick-leave", stage: "employ", kind: "advisory", level: "city", where: "NYC", needs: ["employees"],
    title: L("New York City Earned Safe and Sick Time", "纽约市带薪安全与病假"), when: L("for staff working in the city", "适用于在本市工作的员工"),
    why: L("The city's own sick leave law. Its page refused automated reads, so Placetta doesn't state the rule: check it at the link.", "市级病假法。其页面拒绝自动读取，快哉不转述其规定，请在链接中核实。"),
    agency: L("NYC Department of Consumer and Worker Protection", "纽约市消费者与劳工保护局"), decides: L("the city's law", "市法律"), url: NYC_ESSTA,
    source: { url: NYC_ESSTA },
  },
  {
    id: "la-minimum-wage", stage: "employ", kind: "advisory", level: "city", where: "LA", needs: ["employees"],
    title: L("Los Angeles minimum wage and sick leave", "洛杉矶最低工资与病假"), when: L("for work inside city limits", "适用于市界内的工作"),
    why: L("The city sets its own rates. Placetta hasn't quoted them yet, so it doesn't state them: check at the link.", "市政府自行设定标准。快哉尚未引用其原文，因此不转述，请在链接中核实。"),
    agency: L("City of Los Angeles Office of Wage Standards", "洛杉矶市工资标准办公室"), decides: L("the city's ordinance", "市条例"), url: LA_WAGES,
    source: { url: LA_WAGES },
  },

  /* ------------------------------------------------------------ D. Sell products: furniture */
  {
    id: "ca-bhgs-manufacturer", stage: "sell", kind: "filing", level: "state", where: "CA", needs: ["manufactures", "upholstered"],
    title: L("California furniture and bedding manufacturer license", "加州家具及床上用品制造商执照"), detail: L("Bureau of Household Goods and Services", "加州家居用品与服务局"),
    when: L("if you make upholstered furniture, in whole or in part", "如果您全部或部分生产软体家具"),
    why: L("The state license for a company that makes upholstered furniture sold in California.", "在加州销售的软体家具，其生产企业须持有的州执照。"),
    agency: L("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"), url: BHGS_FLYER, renews: undefined,
    source: { url: BHGS_FLYER, quote: "Furniture and Bedding Manufacturer—A company that produces upholstered furniture or bedding in whole or in part" },
  },
  {
    id: "life-bhgs-retail", stage: "sell", kind: "filing", level: "state", refs: ["ca-bhgs-retail"], needs: ["upholstered"], unless: ["imports"], segments: ["retail"],
    title: L("California retail furniture dealer's license", "加州家具零售商执照"), detail: L("Bureau of Household Goods and Services", "加州家居用品与服务局"),
    when: L("if you sell upholstered furniture", "如果您销售软体家具"),
    why: L("One license for each store selling upholstered furniture.", "每家销售软体家具的门店一张执照。"), agency: L("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"),
  },
  {
    id: "life-bhgs-importer", stage: "sell", kind: "filing", level: "state", refs: ["ca-bhgs-importer"], needs: ["imports", "upholstered"],
    title: L("California importer's license for upholstered furniture", "加州软体家具进口商执照"), when: L("if you import upholstered furniture made outside the US", "如果您进口美国境外制造的软体家具"),
    why: L("Covers selling imported upholstered furniture in California, at retail too.", "涵盖在加州销售进口软体家具，包括零售。"), agency: L("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"),
  },
  {
    id: "life-law-label", stage: "sell", kind: "checklist", level: "state", where: "CA", needs: ["upholstered"], fact: "ca-law-label",
    title: L("Upholstered furniture law label", "软体家具法定标签"), why: L("Each piece sold in California carries the law label with the registry number.", "在加州销售的每件软体家具都须贴有带登记号的法定标签。"),
    agency: L("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"), verify: L("BHGS's law label flyer", "BHGS 法定标签说明"),
  },
  {
    id: "life-tb117", stage: "sell", kind: "checklist", level: "state", where: "CA", needs: ["upholstered"], fact: "ca-tb117-label",
    title: L("Flammability label (TB 117-2013)", "阻燃标签（TB 117-2013）"), why: L("Upholstered furniture sold in California carries the TB 117-2013 statement.", "在加州销售的软体家具须标注 TB 117-2013 声明。"),
    agency: L("California Bureau of Household Goods and Services", "加州家居用品与服务局（BHGS）"), verify: L("BHGS's law label flyer", "BHGS 法定标签说明"),
  },
  {
    id: "life-tsca-label", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["furniture"], fact: "us-tsca-label",
    title: L("TSCA Title VI label for composite wood", "复合木材 TSCA 第六章标签"), when: L("if the furniture has plywood, MDF or particleboard", "如果家具含胶合板、中密度纤维板或刨花板"),
    why: L("Finished goods with composite wood carry the fabricator's name, the month and year made and the compliance statement.", "含复合木材的成品须标明制造商名称、生产年月及合规声明。"),
    agency: L("U.S. Environmental Protection Agency", "美国环境保护署"), verify: L("EPA's formaldehyde emission standards page", "EPA 甲醛排放标准页面"),
  },
  {
    id: "cpsc-sturdy", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["clothingStorage"], any: ["manufactures", "imports"],
    title: L("Tip-over standard for dressers and chests (STURDY Act, 16 CFR 1261)", "梳妆柜和五斗柜防倾倒标准（STURDY 法案，16 CFR 1261）"),
    when: L("for clothing storage units made after September 1, 2023", "适用于 2023 年 9 月 1 日后生产的衣物收纳家具"),
    why: L("Each unit passes the stability tests, ships with an anti-tip device and warning label, and is certified by the maker or importer.", "每件产品须通过稳定性测试，随附防倾倒装置和警示标签，并由制造商或进口商出具证书。"),
    agency: CPSC, verify: L("CPSC's clothing storage unit page and an accredited lab", "CPSC 衣物收纳家具页面及认可实验室"), url: CFR_1261,
    source: { url: CFR_1261, quote: "All clothing storage units that are manufactured after September 1, 2023, are subject to the requirements of this part." },
  },
  {
    id: "life-antitip", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["clothingStorage"], fact: "us-csu-antitip",
    title: L("Anti-tip device and label in the box", "包装内附防倾倒装置及标签"), why: L("Every dresser or chest ships with an ASTM F3096 anti-tip kit and the standard's warning label.", "每件梳妆柜或五斗柜须随附 ASTM F3096 防倾倒装置及标准规定的警示标签。"),
    agency: CPSC, verify: L("CPSC's clothing storage unit page", "CPSC 衣物收纳家具页面"),
  },
  {
    id: "cpsc-cpc-children", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["children"], any: ["manufactures", "imports"],
    title: L("Children's Product Certificate (CPSIA)", "儿童产品合格证书（CPSIA）"), when: L("for products made mainly for children 12 or younger", "适用于主要供 12 岁及以下儿童使用的产品"),
    why: L("Tested by a CPSC-accepted lab, then certified by the maker or importer. Placetta doesn't certify products.", "须经 CPSC 认可的实验室检测，再由制造商或进口商出具证书。快哉不认证产品。"),
    agency: CPSC, verify: L("CPSC's CPC page and a CPSC-accepted lab", "CPSC 的 CPC 页面及 CPSC 认可实验室"), url: CPSC_CPC,
    source: { url: CPSC_CPC, quote: "requires domestic manufacturers and importers of children’s products to certify in a written Children’s Product Certificate (CPC)," },
  },
  {
    id: "life-tracking-label", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["children"], fact: "us-cpsc-tracking-label",
    title: L("Permanent tracking label on children's products", "儿童产品永久性追踪标签"), why: L("The maker or importer, where and when made, and the batch, on the product and its packaging.", "在产品及包装上标明制造商或进口商、生产地点和日期以及批次。"),
    agency: CPSC, verify: L("CPSC's tracking label page", "CPSC 追踪标签页面"),
  },
  {
    id: "life-prop65-furniture", stage: "sell", kind: "advisory", level: "state", where: "CA", needs: ["furniture"], fact: "ca-prop65-furniture",
    title: L("Proposition 65 warning", "65 号提案警示"), when: L("if the furniture exposes buyers to a listed chemical", "如果家具会使购买者接触清单所列化学物质"),
    why: L("Whether a warning is needed turns on the chemicals and the exposure; OEHHA's safe-harbor wording is the model.", "是否需要警示取决于化学物质和接触程度；可参照 OEHHA 的安全港措辞。"),
    agency: L("California Office of Environmental Health Hazard Assessment (OEHHA)", "加州环境健康危害评估办公室（OEHHA）"), decides: L("OEHHA", "OEHHA"),
  },
  {
    id: "prop65-products", stage: "sell", kind: "advisory", level: "state", where: "US", unless: ["furniture", "food"], any: ["consumer", "cosmetics"],
    title: L("Proposition 65 warning for products sold into California", "销往加州产品的 65 号提案警示"), when: L("if a product sold to Californians exposes them to a listed chemical", "如果销往加州的产品会使消费者接触清单所列化学物质"),
    why: L("OEHHA decides what needs a warning. Its business page couldn't be read automatically, so Placetta doesn't state the rule: check at the link.", "由 OEHHA 决定哪些产品需要警示。其企业页面无法自动读取，快哉不转述规定，请在链接中核实。"),
    agency: L("California Office of Environmental Health Hazard Assessment (OEHHA)", "加州环境健康危害评估办公室（OEHHA）"), decides: L("OEHHA", "OEHHA"), url: P65_BUSINESS,
    source: { url: P65_BUSINESS },
  },

  /* ------------------------------------------------------------ D. Sell products: food */
  {
    id: "life-ffr", stage: "sell", kind: "filing", level: "federal", refs: ["fda-ffr"], needs: ["food"], any: ["manufactures", "imports", "packagedFood"],
    title: L("FDA food facility registration", "FDA 食品设施注册"), detail: L("free", "免费"),
    when: L("if you make, pack or hold food for sale (restaurants and retail food stores are exempt)", "如果您生产、包装或储存待售食品（餐厅和零售食品店豁免）"),
    why: L("Registers the facility with FDA, renewed every even-numbered year.", "向 FDA 注册设施，每逢偶数年续期。"), agency: FDA,
  },
  {
    id: "nutrition-facts", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["packagedFood"],
    title: L("Nutrition Facts label", "营养成分表标签"), when: L("on packaged food, unless an exemption applies", "适用于包装食品，豁免情形除外"),
    why: L("Packaged food carries the Nutrition Facts panel in FDA's format; small businesses can qualify for an exemption.", "包装食品须按 FDA 格式标注营养成分表；小企业可能符合豁免条件。"),
    agency: FDA, verify: L("21 CFR 101.9 and FDA's labeling guide", "21 CFR 101.9 及 FDA 标签指南"), url: CFR_101_9,
    source: { url: CFR_101_9, quote: "Nutrition information relating to food shall be provided for all products intended for human consumption and offered for sale unless an exemption is provided" },
  },
  {
    id: "allergen-label", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["packagedFood"],
    title: L("Allergen labeling (FALCPA and the FASTER Act's sesame)", "过敏原标签（FALCPA 及 FASTER 法案的芝麻）"),
    why: L("Packaged food names any of the nine major allergens it contains, sesame included since 2023.", "包装食品须标明所含的九种主要过敏原，自 2023 年起包括芝麻。"),
    agency: FDA, verify: L("FDA's food allergies page", "FDA 食物过敏页面"), url: FDA_ALLERGENS,
    source: { url: FDA_ALLERGENS, quote: "declaring sesame as the 9th major food allergen recognized by the United States." },
  },
  {
    id: "life-fsvp", stage: "sell", kind: "filing", level: "federal", refs: ["fda-fsvp"], needs: ["imports", "food"],
    title: L("Foreign Supplier Verification Program (FSVP)", "国外供应商验证计划（FSVP）"), when: L("for each food you import", "适用于您进口的每种食品"),
    why: L("The importer checks that each foreign supplier makes the food to US safety standards.", "进口商须核实每家国外供应商按美国安全标准生产食品。"), agency: FDA,
  },
  {
    id: "fda-prior-notice", stage: "sell", kind: "filing", level: "federal", where: "US", needs: ["imports", "food"],
    title: L("FDA prior notice of imported food", "进口食品预先通知"), when: L("before each food shipment arrives", "每批食品抵达前"),
    why: L("Each shipment of food is announced to FDA before it arrives, usually by the customs broker.", "每批进口食品须在抵达前向 FDA 预先通知，通常由报关行提交。"),
    agency: FDA, form: "Prior Notice System Interface or ACE", url: CFR_1_279, fee: 0,
    source: { url: CFR_1_279, quote: "you must submit the prior notice to FDA and the prior notice submission must be confirmed by FDA for review" },
  },

  /* ------------------------------------------------------------ D. Sell products: cosmetics */
  {
    id: "life-mocra-facility", stage: "sell", kind: "filing", level: "federal", where: "US", needs: ["cosmetics", "manufactures"], refs: ["fda-5066"],
    title: L("Cosmetic facility registration (MoCRA)", "化妆品设施注册（MoCRA）"), detail: L("Form FDA 5066, free", "FDA 5066 表，免费"),
    when: L("if you make or process cosmetics; renewed every two years", "如果您生产或加工化妆品；每两年续期"),
    why: L("Manufacturers and processors register each facility with FDA.", "化妆品生产和加工企业须向 FDA 注册每个设施。"), agency: FDA,
    source: { url: "https://www.fda.gov/cosmetics/cosmetics-laws-regulations/modernization-cosmetics-regulation-act-2022-mocra", quote: "Manufacturers and processors must register their facilities with FDA and renew their registration every two years." },
  },
  {
    id: "life-mocra-listing", stage: "sell", kind: "filing", level: "federal", needs: ["cosmetics"], refs: ["fda-5067"],
    title: L("Cosmetic product listing (MoCRA)", "化妆品产品列名（MoCRA）"), detail: L("Form FDA 5067, free", "FDA 5067 表，免费"),
    when: L("for each product, by the brand named on the label; updated every year", "每个产品由标签上的品牌方提交；每年更新"),
    why: L("The brand lists each product and its ingredients with FDA.", "品牌须向 FDA 列名每个产品及其成分。"), agency: FDA,
  },
  {
    id: "cosmetic-ingredients", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["cosmetics"],
    title: L("Cosmetic ingredient declaration", "化妆品成分声明"), why: L("Each package lists its ingredients in descending order of predominance.", "每个包装须按含量由高到低列出成分。"),
    agency: FDA, verify: L("21 CFR 701.3", "21 CFR 701.3"), url: CFR_701_3,
    source: { url: CFR_701_3, quote: "The label on each package of a cosmetic shall bear a declaration of the name of each ingredient in descending order of predominance" },
  },
  {
    id: "gb-cosmetics-rp", stage: "sell", kind: "filing", level: "federal", where: "GB", needs: ["cosmetics"],
    title: L("UK Responsible Person for cosmetics", "英国化妆品责任人"), when: L("before selling cosmetics in Great Britain", "在英国（大不列颠）销售化妆品前"),
    why: L("A business or person with a UK address answers for each product's safety and labeling.", "须由具有英国地址的企业或个人对每个产品的安全和标签负责。"),
    agency: L("Office for Product Safety and Standards", "英国产品安全与标准办公室（OPSS）"), url: GB_COSMETICS,
    source: { url: GB_COSMETICS, quote: "A Responsible Person must have a UK established address to make cosmetic products available in GB." },
  },
  {
    id: "gb-cosmetics-scpn", stage: "sell", kind: "filing", level: "federal", where: "GB", needs: ["cosmetics"],
    title: L("UK cosmetic product notification (SCPN)", "英国化妆品通报（SCPN）"), when: L("for each product, before it goes on sale", "每个产品上市前"),
    why: L("The Responsible Person notifies OPSS of each product before it is sold.", "责任人须在每个产品上市前向 OPSS 通报。"),
    agency: L("Office for Product Safety and Standards", "英国产品安全与标准办公室（OPSS）"), form: "Submit cosmetic product notifications", url: GB_COSMETICS,
    source: { url: GB_COSMETICS, quote: "know about the cosmetic product (called notification) before it is made available to consumers" },
  },

  /* ------------------------------------------------------------ D. Sell products: general consumer products */
  {
    id: "cpsc-gcc", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["consumer"], any: ["manufactures", "imports"], unless: ["children"],
    title: L("General Certificate of Conformity (GCC)", "一般合格证书（GCC）"), when: L("if a CPSC safety rule covers the product", "如果产品受 CPSC 安全规定管辖"),
    why: L("The maker or importer certifies the product meets each CPSC rule that applies. Placetta doesn't certify products.", "制造商或进口商须证明产品符合适用的每项 CPSC 规定。快哉不认证产品。"),
    agency: CPSC, verify: L("CPSC's Regulatory Robot and the rule list on its GCC page", "CPSC 的 Regulatory Robot 及其 GCC 页面上的规定清单"), url: CPSC_GCC,
    source: { url: CPSC_GCC, quote: "requires domestic manufacturers and importers of certain general-use products (i.e., non-children’s products)" },
  },
  {
    id: "textile-label", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["textile"],
    title: L("Textile fiber content and origin label", "纺织品纤维成分及原产地标签"), why: L("Clothing and other textile products show fiber content, the maker's name or RN, and the country of origin.", "服装及其他纺织品须标明纤维成分、制造商名称或 RN 号以及原产国。"),
    agency: FTC, verify: L("16 CFR part 303", "16 CFR 第 303 部分"), url: CFR_303,
    source: { url: CFR_303, quote: "Each textile fiber product, except those exempted or excluded under section 12 of the Act, shall be labeled or invoiced" },
  },
  {
    id: "care-label", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["textile"], any: ["manufactures", "imports"],
    title: L("Care label on clothing", "服装护理标签"), why: L("Clothing carries permanent washing or dry-cleaning instructions.", "服装须有永久性的洗涤或干洗说明。"),
    agency: FTC, verify: L("16 CFR part 423 (the Care Labeling Rule)", "16 CFR 第 423 部分（护理标签规则）"), url: CFR_423,
    source: { url: CFR_423, quote: "Manufacturers and importers must attach care labels so that they can be seen or easily found" },
  },
  {
    id: "origin-marking", stage: "sell", kind: "checklist", level: "federal", where: "US", needs: ["imports"],
    title: L("Country of origin marking on imported goods", "进口商品原产国标记"), why: L("Each imported article, or its container, shows its country of origin in English for the final buyer.", "每件进口商品或其包装须用英文向最终购买者标明原产国。"),
    agency: CBP, verify: L("19 CFR part 134", "19 CFR 第 134 部分"), url: CFR_134,
    source: { url: CFR_134, quote: "shall be marked in a conspicuous place as legibly, indelibly, and permanently as the nature of the article (or container) will permit" },
  },
  {
    id: "life-sb54", stage: "sell", kind: "filing", level: "state", refs: ["ca-sb54"], any: ["manufactures", "imports"], unless: ["food"],
    title: L("California packaging producer responsibility (SB 54)", "加州包装生产者责任（SB 54）"), when: L("if you sell packaged goods into California; a small producer claims the exemption", "如果您向加州销售包装商品；小型生产者可申请豁免"),
    why: L("The brand joins the producer organization, applies on its own, or claims the small producer exemption.", "品牌须加入生产者组织、单独申请，或申请小型生产者豁免。"), agency: L("CalRecycle", "加州资源回收局"),
  },

  /* ------------------------------------------------------------ D. Import */
  {
    id: "life-isf", stage: "sell", kind: "filing", level: "federal", refs: ["cbp-isf"], needs: ["imports"],
    title: L("Importer Security Filing (ISF, 10+2)", "进口商安全申报（ISF，10+2）"), when: L("for each ocean shipment, 24 hours before it is loaded abroad", "每批海运货物在境外装船前 24 小时"),
    why: L("The security filing for ocean freight, usually sent by the customs broker.", "海运货物的安全申报，通常由报关行提交。"), agency: CBP,
  },
  {
    id: "hts-ruling", stage: "sell", kind: "advisory", level: "federal", where: "US", needs: ["imports"],
    title: L("Tariff classification (HTS code)", "关税归类（HTS 编码）"), when: L("for each product you import", "适用于您进口的每种产品"),
    why: L("CBP decides the classification. For certainty, ask CBP for a binding ruling; Placetta never picks the code.", "由 CBP 决定归类。如需确定，可向 CBP 申请具有约束力的裁定；快哉不替您确定编码。"),
    agency: CBP, decides: L("CBP, through binding rulings (19 CFR part 177)", "CBP，通过具有约束力的裁定（19 CFR 第 177 部分）"), url: CFR_177,
    source: { url: CFR_177, quote: "binding tariff classification ruling letter (including pre-entry classification decisions)" },
  },

  /* ------------------------------------------------------------ E. Sell online and through retailers */
  {
    id: "ca-economic-nexus", stage: "online", kind: "filing", level: "state", where: "US", needs: ["online"], except: ["CA"],
    title: L("California use tax registration for remote sellers", "加州远程卖家使用税登记"), when: L("once your sales into California pass $500,000 a year", "向加州的年销售额超过 50 万美元时"),
    why: L("A seller outside California registers and collects California's use tax past that threshold.", "加州以外的卖家超过该门槛后须登记并代收加州使用税。"),
    agency: L("California Department of Tax and Fee Administration", "加州税费管理局（CDTFA）"), url: CA_NEXUS, fee: 0,
    source: { url: CA_NEXUS, quote: "by the retailer and all persons related to the retailer exceed $500,000." },
  },
  {
    id: "tx-economic-nexus", stage: "online", kind: "filing", level: "state", where: "US", needs: ["online"], except: ["TX"],
    title: L("Texas use tax permit for remote sellers", "德州远程卖家使用税许可"), when: L("once your Texas revenue passes $500,000 in twelve months", "12 个月内德州收入超过 50 万美元时"),
    why: L("Below that safe harbor a remote seller doesn't need a Texas permit.", "低于该安全港门槛的远程卖家无需德州许可。"),
    agency: L("Texas Comptroller of Public Accounts", "德州审计长办公室"), url: TX_REMOTE, fee: 0,
    source: { url: TX_REMOTE, quote: "Remote sellers with total Texas revenue of less than $500,000 in the preceding twelve calendar months are not required to obtain a tax permit" },
  },
  {
    id: "fl-economic-nexus", stage: "online", kind: "filing", level: "state", where: "US", needs: ["online"], except: ["FL"],
    title: L("Florida sales tax registration for remote sellers", "佛罗里达州远程卖家销售税登记"), when: L("once your taxable remote sales into Florida pass $100,000 a year", "向佛罗里达州的应税远程销售额每年超过 10 万美元时"),
    why: L("A seller outside Florida registers and collects Florida tax past that threshold.", "佛罗里达州以外的卖家超过该门槛后须登记并代收该州税款。"),
    agency: L("Florida Department of Revenue", "佛罗里达州税务局"), url: FL_REMOTE,
    source: { url: FL_REMOTE, quote: "if the retailer has made taxable remote Florida sales in excess of $100,000 over the previous calendar year." },
  },
  {
    id: "ny-economic-nexus", stage: "online", kind: "filing", level: "state", where: "US", needs: ["online"], except: ["NY"],
    title: L("New York sales tax registration for remote sellers", "纽约州远程卖家销售税登记"), when: L("once your sales into New York pass the state's threshold", "向纽约州的销售额超过该州门槛时"),
    why: L("Placetta hasn't quoted New York's threshold from its page yet, so it doesn't state it: check at the link.", "快哉尚未从其页面引用纽约州的门槛，因此不转述，请在链接中核实。"),
    agency: L("New York State Department of Taxation and Finance", "纽约州税务与财政局"), url: NY_SALES,
    source: { url: NY_SALES },
  },
  {
    id: "ca-marketplace", stage: "online", kind: "advisory", level: "state", where: "US", needs: ["online"],
    title: L("California: the marketplace collects the tax on marketplace sales", "加州：平台代收平台销售的税款"), when: L("for sales through a marketplace like Amazon or Walmart", "适用于通过亚马逊、沃尔玛等平台的销售"),
    why: L("Count your own direct sales toward the threshold; the marketplace reports its own.", "您的直销额计入门槛；平台自行申报其平台销售。"),
    agency: L("California Department of Tax and Fee Administration", "加州税费管理局（CDTFA）"), decides: L("the Marketplace Facilitator Act", "《平台协助者法》"), url: CA_MPF,
    source: { url: CA_MPF, quote: "A marketplace facilitator is generally responsible for collecting, reporting, and paying the tax on retail sales made through their marketplace" },
  },
  {
    id: "tx-marketplace", stage: "online", kind: "advisory", level: "state", where: "US", needs: ["online"], except: ["TX"],
    title: L("Texas: selling only through a marketplace needs no permit", "德州：只通过平台销售无需许可"), when: L("if the marketplace certifies it collects Texas tax for you", "如果平台证明其为您代收德州税款"),
    why: L("You still keep records of every marketplace sale for four years.", "您仍须保存所有平台销售记录四年。"),
    agency: L("Texas Comptroller of Public Accounts", "德州审计长办公室"), decides: L("the Comptroller's remote seller rules", "审计长的远程卖家规定"), url: TX_REMOTE,
    source: { url: TX_REMOTE, quote: "who only sells through a marketplace provider that certifies they are collecting and reporting sales and use tax on the remote seller’s behalf" },
  },
  {
    id: "fl-marketplace", stage: "online", kind: "advisory", level: "state", where: "US", needs: ["online"],
    title: L("Florida: marketplace providers collect on marketplace sales", "佛罗里达州：平台代收平台销售的税款"), when: L("for sales through a marketplace", "适用于通过平台的销售"),
    why: L("The marketplace registers and remits Florida tax on the sales it makes for you.", "平台须登记并就其为您完成的销售缴纳佛罗里达州税款。"),
    agency: L("Florida Department of Revenue", "佛罗里达州税务局"), decides: L("Florida's marketplace law", "佛罗里达州平台法"), url: FL_REMOTE,
    source: { url: FL_REMOTE, quote: "are required to register online to collect and must electronically report and remit Florida sales tax" },
  },
  {
    id: "retailer-certificates", stage: "online", kind: "checklist", level: "federal", where: "US", any: ["consumer", "children"], unless: ["food"],
    title: L("Certificates go to every retailer and marketplace", "证书须提供给每家零售商和平台"), when: L("when a retailer or marketplace asks for your GCC or CPC", "当零售商或平台索要 GCC 或 CPC 时"),
    why: L("The certificate a marketplace asks for is the one federal law already requires; it is furnished to each distributor and retailer.", "平台索要的证书正是联邦法律已要求的证书，须提供给每个分销商和零售商。"),
    agency: CPSC, verify: L("16 CFR part 1110", "16 CFR 第 1110 部分"), url: CFR_1110,
    source: { url: CFR_1110, quote: "to each distributor and retailer of the product in question." },
  },
  {
    id: "cosmetics-no-certificate", stage: "online", kind: "advisory", level: "federal", where: "US", needs: ["cosmetics"],
    title: L("FDA issues no registration certificate for cosmetics", "FDA 不为化妆品注册出具证书"), when: L("when a retailer or marketplace asks for an FDA certificate", "当零售商或平台索要 FDA 证书时"),
    why: L("Give the facility registration and product listing numbers instead; FDA doesn't certify compliance.", "请提供设施注册号和产品列名号；FDA 不出具合规证明。"),
    agency: FDA, decides: L("FDA", "FDA"), url: FDA_COSMETICS,
    source: { url: FDA_COSMETICS, quote: "it does not provide certificates or other documents to verify compliance for cosmetic product facility registration." },
  },
];

/** Every own source the lifecycle cites, for the read log (scripts/eval/proof-dump.ts). */
export const LIFECYCLE_SOURCES = LIFECYCLE.flatMap(i => i.source?.quote ? [{ id: `life:${i.id}`, read: i.source.url, quote: i.source.quote }] : []);
