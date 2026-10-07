import { B, type Bi } from "../bi";
import type { Level } from "../model";
import { WORLD_FORMS, worldPlaces } from "./world";

/* The official forms library: the real government forms, by number, with the agency, how it's filed, the official
   links and fee, and (for the forms Placetta fills) the fields line by line as printed. Sources are the agencies' own
   sites. "form": we read the actual form (the PDF is bundled and filled). "page": the official page is confirmed; the
   filing team re-checks the current requirements before submitting, as it does for every filing. */

export type Segment = "restaurant" | "retail" | "seller" | "warehouse";
/** Where a form applies: "US", a state ("NY"), a US city ("NYC"), a country ("GB") or a city abroad ("GB-LON"). */
export type Where = string;
export type Method = "online" | "pdf_mail" | "pdf_fax" | "portal" | "in_person" | "insurer" | "none";
export type FormField = { id: string; line: string; label: Bi; hint?: Bi; options?: string[] };
export type Needs = { food?: boolean; employees?: boolean; imports?: boolean; hazmat?: boolean; signage?: boolean; buildout?: boolean; newEntity?: boolean; foreignEntity?: boolean; manhattan?: boolean; cosmetics?: boolean; children?: boolean; forwarder?: boolean };

export type OfficialForm = {
  id: string;
  form: string;               // the number as the agency prints it
  title: Bi;
  agency: Bi;
  level: Level;
  where: Where;
  segments: Segment[];
  needs?: Needs;              // only when the business does this
  method: Method;
  how: Bi;                    // how it's filed, in one line
  url: string;                // where it's filed: the portal, or the official PDF
  pdf?: string;               // the official PDF
  info: string;               // the agency's page about it
  fee: number | null;         // government fee in the local currency (USD unless currency says otherwise); null when it varies
  currency?: string;
  feeNote?: Bi;
  takes?: Bi;
  renews?: Bi;
  fields: FormField[];        // as printed on the form or asked by the portal
  attach?: Bi[];
  foreign?: Bi;               // what's different for a China-based owner
  fill?: "ss4" | "cbp5106";   // Placetta fills the official PDF itself
  checked: "form" | "page" | "known";   // known: from Placetta's library of official sites; re-read before filing
  order: number;              // where it falls in an opening: lower first
};

const F = (id: string, line: string, en: string, zh: string, options?: string[], hint?: Bi): FormField => ({ id, line, label: B(en, zh), ...(options ? { options } : {}), ...(hint ? { hint } : {}) });
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const STORES: Segment[] = ["restaurant", "retail"];

export const FORMS: OfficialForm[] = [
  /* ------------------------------- federal ------------------------------- */
  {
    id: "irs-ss4", form: "Form SS-4 (Rev. December 2025)", title: B("Application for Employer Identification Number (EIN)", "雇主识别号（EIN）申请"),
    agency: B("Internal Revenue Service", "美国国税局（IRS）"), level: "federal", where: "US", segments: ALL, method: "pdf_fax", order: 10,
    how: B("Owners with an SSN or ITIN apply online. A company whose responsible party has neither (most China-based owners) faxes or mails Form SS-4, or calls the IRS international line.", "负责人有 SSN 或 ITIN 的可在线申请；负责人两者都没有的公司（多数中国股东）需传真或邮寄 SS-4 表，或致电 IRS 国际专线。"),
    url: "https://www.irs.gov/pub/irs-pdf/fss4.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/fss4.pdf", info: "https://www.irs.gov/forms-pubs/about-form-ss-4",
    fee: 0, feeNote: B("The IRS charges nothing. Sites that charge for an EIN are resellers.", "IRS 不收费。收费办理 EIN 的网站都是中介。"),
    takes: B("Fax: about 4 business days. Mail: about 4 to 5 weeks. Phone: issued on the call.", "传真约 4 个工作日；邮寄约 4 至 5 周；电话当场发号。"),
    fill: "ss4", checked: "form",
    foreign: B("Line 7b: a responsible party with no SSN or ITIN writes \"Foreign\" per the instructions. A single-member LLC owned by a foreign company checks \"Other\" on line 9a and writes \"Foreign-owned U.S. disregarded entity\", then files Form 5472 each year.", "第 7b 行：负责人没有 SSN 或 ITIN 时，按说明填写 \"Foreign\"。由外国公司单一持有的 LLC 在第 9a 行勾选 \"Other\"，填写 \"Foreign-owned U.S. disregarded entity\"，此后每年申报 5472 表。"),
    fields: [
      F("l1", "1", "Legal name of entity", "实体法定名称"),
      F("l2", "2", "Trade name of business (if different from line 1)", "营业名称（与第 1 行不同时）"),
      F("l4a", "4a", "Mailing address (room, suite no. and street, or P.O. box)", "邮寄地址（门牌、套房号与街道，或邮政信箱）"),
      F("l4b", "4b", "City, state, and ZIP code (if foreign, see instructions)", "城市、州与邮编（境外地址见说明）"),
      F("l5a", "5a", "Street address (if different; not a P.O. box)", "街道地址（如不同；不可用邮政信箱）"),
      F("l5b", "5b", "City, state, and ZIP code", "城市、州与邮编"),
      F("l6", "6", "County and state where principal business is located", "主要营业地所在县和州"),
      F("l7a", "7a", "Name of responsible party", "负责人姓名"),
      F("l7b", "7b", "SSN, ITIN, or EIN of responsible party", "负责人 SSN、ITIN 或 EIN", undefined, B("Placetta never stores an SSN or ITIN. Write \"Foreign\" if there is none, or the signer fills it in by hand.", "快哉从不保存 SSN 或 ITIN。没有时填写 \"Foreign\"，或由签署人手写。")),
      F("l8a", "8a", "Is this application for a limited liability company (LLC)?", "是否为有限责任公司（LLC）申请？", ["Yes", "No"]),
      F("l8b", "8b", "If 8a is \"Yes\", the number of LLC members", "若 8a 为\"是\"，LLC 成员人数"),
      F("l8c", "8c", "If 8a is \"Yes\", was the LLC organized in the United States?", "若 8a 为\"是\"，LLC 是否在美国成立？", ["Yes", "No"]),
      F("l9a", "9a", "Type of entity", "实体类型", ["Partnership", "Corporation (form 1120)", "Other: Foreign-owned U.S. disregarded entity", "Sole proprietor"]),
      F("l9b", "9b", "If a corporation, state or foreign country where incorporated", "若为公司，注册所在州或国家"),
      F("l10", "10", "Reason for applying: started new business (specify type)", "申请原因：新成立业务（注明类型）"),
      F("l11", "11", "Date business started or acquired (month, day, year)", "业务开始或收购日期（月、日、年）"),
      F("l12", "12", "Closing month of accounting year", "会计年度结束月份"),
      F("l13", "13", "Highest number of employees expected in the next 12 months (other)", "未来 12 个月预计最多雇员人数（其他类）"),
      F("l15", "15", "First date wages or annuities were paid (month, day, year)", "首次支付工资日期（月、日、年）"),
      F("l16", "16", "Principal activity of the business", "主要业务类别", ["Accommodation & food service", "Retail", "Transportation & warehousing", "Wholesale-other", "Wholesale-agent/broker", "Manufacturing", "Other"]),
      F("l17", "17", "Principal line of merchandise sold or services provided", "主要销售商品或提供的服务"),
      F("l18", "18", "Has the entity on line 1 ever applied for and received an EIN?", "第 1 行实体是否曾申请并获得 EIN？", ["Yes", "No"]),
      F("sign", "Signature", "Name and title of the person signing", "签署人姓名与职务"),
      F("phone", "Signature", "Applicant's telephone number", "申请人电话"),
    ],
  },
  {
    id: "irs-5472", form: "Form 5472", title: B("Information Return of a 25% Foreign-Owned U.S. Corporation or a Foreign Corporation Engaged in a U.S. Trade or Business", "外资持股 25% 以上美国公司信息申报表"),
    agency: B("Internal Revenue Service", "美国国税局（IRS）"), level: "federal", where: "US", segments: ALL, needs: { foreignEntity: true }, method: "pdf_mail", order: 90,
    how: B("Filed each year with Form 1120 (a foreign-owned single-member LLC attaches it to a pro forma 1120). Not filed electronically for a disregarded entity.", "每年随 1120 表一同申报（外资单一成员 LLC 附在形式 1120 表上），视为非独立实体的需纸质邮寄或传真。"),
    url: "https://www.irs.gov/pub/irs-pdf/f5472.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f5472.pdf", info: "https://www.irs.gov/forms-pubs/about-form-5472",
    fee: 0, feeNote: B("No fee. The penalty for not filing starts at $25,000.", "不收费。未申报罚款起点为 25,000 美元。"), renews: B("Every year, by the tax return due date.", "每年在报税截止日前。"), checked: "page", fields: [],
  },
  {
    id: "fincen-boir", form: "Beneficial Ownership Information Report (BOIR)", title: B("Beneficial ownership report for foreign companies registered in a U.S. state", "在美国州注册的外国公司受益所有人报告"),
    agency: B("Financial Crimes Enforcement Network (FinCEN)", "美国金融犯罪执法网络（FinCEN）"), level: "federal", where: "US", segments: ALL, needs: { foreignEntity: true }, method: "online", order: 25,
    how: B("Filed online. Since March 2025 only foreign companies registered to do business in a U.S. state must file; U.S.-formed companies are exempt.", "在线申报。自 2025 年 3 月起，只有在美国州注册经营的外国公司需要申报；在美国成立的公司豁免。"),
    url: "https://boiefiling.fincen.gov/fileboir", info: "https://www.fincen.gov/boi", fee: 0, takes: B("Due 30 days after the state registration takes effect.", "州注册生效后 30 天内。"), checked: "page", fields: [],
  },
  {
    id: "cbp-5106", form: "CBP Form 5106 (06/26)", title: B("Create/Update Importer Identity Form", "进口商身份创建/更新表"),
    agency: B("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）"), level: "federal", where: "US", segments: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "pdf_mail", order: 30,
    how: B("Sent to CBP (usually through your customs broker), or created in the ACE portal. Needed before your first entry as importer of record.", "提交给 CBP（通常经由报关行），或在 ACE 门户中创建。以进口商身份首次报关前必须完成。"),
    url: "https://www.cbp.gov/sites/default/files/2026-06/cbp_form_5106.pdf", pdf: "https://www.cbp.gov/sites/default/files/2026-06/cbp_form_5106.pdf", info: "https://www.cbp.gov/newsroom/publications/forms",
    fee: 0, fill: "cbp5106", checked: "form",
    foreign: B("A U.S. entity uses its EIN in block 1B. Officers in block 3J give a passport number instead of an SSN; Placetta leaves those for the officer to write by hand.", "美国实体在 1B 栏填写 EIN。3J 栏的高管可用护照号代替 SSN，快哉会留空由本人手写。"),
    fields: [
      F("c1a", "1A", "Importer/Business/Private Party Name", "进口商/企业/个人名称"),
      F("c1b", "1B", "Number type", "号码类型", ["IRS Employer Identification Number (EIN)", "Requesting a CBP-Assigned Number"]),
      F("c1bn", "1B", "EIN", "EIN 号码"),
      F("c1d", "1D", "DIV/AKA/DBA name", "分部/别名/营业名称"),
      F("c1g", "1G", "Type of company", "公司类型", ["Corporation", "Partnership", "LLC", "Sole Proprietorship"]),
      F("c1h", "1H", "Entries you plan to file in a year", "预计每年报关次数", ["1-4 per year", "5-24 per year", "25 or more per year"]),
      F("c1i", "1I", "How the number will be used", "号码用途", ["Importer of Record", "Consignee/Ultimate Consignee"]),
      F("c2a1", "2A", "Mailing address: street address 1", "邮寄地址：街道 1"),
      F("c2acity", "2A", "City", "城市"),
      F("c2ast", "2A", "State/Province", "州/省"),
      F("c2azip", "2A", "Zip code", "邮编"),
      F("c2aiso", "2A", "Country ISO code", "国家 ISO 代码"),
      F("c2atype", "2A", "The address in 2A is a", "2A 地址类型", ["Corporate Office", "Warehouse", "Retail Location", "Office Building", "Business Service Center"]),
      F("c2c", "2C", "Phone number", "电话"),
      F("c2e", "2E", "Email address", "电子邮箱"),
      F("c2f", "2F", "Website", "网站"),
      F("c3a", "3A", "Brief business description", "业务简述"),
      F("c3b", "3B", "6-digit NAICS code", "6 位 NAICS 代码"),
      F("c3c", "3C", "D-U-N-S number", "邓白氏编码（D-U-N-S）"),
      F("c3e", "3E", "Year established", "成立年份"),
      F("c3jpos", "3J", "Officer: company position title", "高管：职务"),
      F("c3jlast", "3J", "Officer: last name", "高管：姓"),
      F("c3jfirst", "3J", "Officer: first name", "高管：名"),
      F("c3jphone", "3J", "Officer: direct phone number", "高管：直线电话"),
      F("c3jmail", "3J", "Officer: direct email", "高管：电子邮箱"),
    ],
  },
  {
    id: "cbp-301", form: "CBP Form 301", title: B("Customs Bond", "海关保证金（关税担保）"),
    agency: B("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）"), level: "federal", where: "US", segments: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "portal", order: 35,
    how: B("Bought from a CBP-approved surety, usually through your customs broker, who files it electronically. A continuous bond covers a year of entries.", "通过 CBP 认可的担保公司购买，通常由报关行代为电子提交。连续保证金覆盖一年内的全部报关。"),
    url: "https://www.cbp.gov/sites/default/files/2024-05/cbp_form_301.pdf", pdf: "https://www.cbp.gov/sites/default/files/2024-05/cbp_form_301.pdf", info: "https://www.cbp.gov/trade/priority-issues/bonds",
    fee: null, feeNote: B("No CBP fee. The surety charges a premium; a continuous bond is at least $50,000 of coverage.", "CBP 不收费。担保公司收取保费；连续保证金额度至少 50,000 美元。"), renews: B("Continuous bonds renew yearly.", "连续保证金每年续保。"), checked: "page", fields: [],
  },
  {
    id: "cbp-ace", form: "ACE Portal Account Application", title: B("ACE Secure Data Portal account for importers", "ACE 安全数据门户进口商账户"),
    agency: B("U.S. Customs and Border Protection", "美国海关与边境保护局（CBP）"), level: "federal", where: "US", segments: ["seller", "warehouse"], needs: { imports: true }, method: "online", order: 40,
    how: B("Applied for online in ACE. Lets you see your entries, duties and bond.", "在 ACE 在线申请，可查看报关记录、关税和保证金。"),
    url: "https://www.cbp.gov/trade/automated/getting-started/portal-applying", info: "https://www.cbp.gov/trade/automated", fee: 0, checked: "page", fields: [],
  },
  {
    id: "fda-ffr", form: "FDA Food Facility Registration (Form FDA 3537)", title: B("Food Facility Registration", "食品设施注册"),
    agency: B("U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）"), level: "federal", where: "US", segments: ["seller", "warehouse"], needs: { food: true }, method: "online", order: 45,
    how: B("Filed online in FDA Industry Systems. Required for facilities that make, pack or hold food for U.S. consumption, including foreign ones. Restaurants and retail food stores are exempt.", "在 FDA 行业系统在线提交。生产、包装或储存供美国消费食品的设施（包括境外设施）必须注册；餐厅和零售食品店豁免。"),
    url: "https://www.access.fda.gov/", info: "https://www.fda.gov/food/online-registration-food-facilities", fee: 0, renews: B("Renew between October 1 and December 31 of every even-numbered year.", "每逢偶数年 10 月 1 日至 12 月 31 日续期。"), checked: "page", fields: [],
  },
  {
    id: "fda-5066", form: "Form FDA 5066", title: B("Cosmetic product facility registration (MoCRA)", "化妆品生产设施注册（MoCRA）"),
    agency: B("U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）"), level: "federal", where: "US", segments: ["seller", "retail"], needs: { cosmetics: true }, method: "online", order: 46,
    how: B("Filed online in Cosmetics Direct by the facility that makes or processes the cosmetics.", "由生产或加工化妆品的设施在 Cosmetics Direct 在线提交。"),
    url: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", info: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", fee: 0, renews: B("Every two years.", "每两年一次。"), checked: "page", fields: [],
  },
  {
    id: "fda-5067", form: "Form FDA 5067", title: B("Cosmetic product listing (MoCRA)", "化妆品产品列名（MoCRA）"),
    agency: B("U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）"), level: "federal", where: "US", segments: ["seller", "retail"], needs: { cosmetics: true }, method: "online", order: 47,
    how: B("Filed online in Cosmetics Direct by the brand (the responsible person on the label), one listing per product.", "由品牌方（标签上的责任人）在 Cosmetics Direct 在线提交，每个产品一份。"),
    url: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", info: "https://www.fda.gov/cosmetics/registration-listing-cosmetic-product-facilities-and-products", fee: 0, renews: B("Update every year.", "每年更新。"), checked: "page", fields: [],
  },
  {
    id: "cpsc-cert", form: "General Certificate of Conformity / Children's Product Certificate (16 CFR 1110)", title: B("Product safety certificate, filed electronically at entry", "产品安全合格证书（入境时电子申报）"),
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会（CPSC）"), level: "federal", where: "US", segments: ["seller", "retail"], needs: { imports: true }, method: "online", order: 50,
    how: B("The importer issues the certificate itself (there is no government form) and, under the eFiling rule, files the certificate data with CBP at entry.", "由进口商自行出具证书（无政府表格），并按电子申报规则在入境报关时向 CBP 申报证书数据。"),
    url: "https://www.cpsc.gov/eFiling", info: "https://www.cpsc.gov/Business--Manufacturing/Testing-Certification", fee: 0, checked: "page", fields: [],
  },
  {
    id: "fmc-18", form: "Form FMC-18 (with Form FMC-48 bond)", title: B("Ocean Transportation Intermediary license", "远洋运输中介（OTI）执照"),
    agency: B("Federal Maritime Commission", "美国联邦海事委员会（FMC）"), level: "federal", where: "US", segments: ["warehouse"], needs: { forwarder: true }, method: "online", order: 55,
    how: B("Filed online for freight forwarders and NVOCCs, with a surety bond on Form FMC-48.", "货运代理和无船承运人在线申请，并附 FMC-48 保证金。"),
    url: "https://www2.fmc.gov/form18/Form18/FillingInformation.aspx", info: "https://www.fmc.gov/resources-services/licensing-registration/", fee: null, checked: "page", fields: [],
  },
  {
    id: "phmsa-5800", form: "DOT Form F 5800.2", title: B("Hazardous materials registration", "危险品注册"),
    agency: B("Pipeline and Hazardous Materials Safety Administration (DOT)", "美国交通部管道与危险品安全管理局（PHMSA）"), level: "federal", where: "US", segments: ["warehouse"], needs: { hazmat: true }, method: "online", order: 56,
    how: B("Filed online when you ship or offer certain hazardous materials in bulk, such as large lithium battery shipments.", "运输或托运特定数量危险品（如大批锂电池）时在线申请。"),
    url: "https://hazmatonline.phmsa.dot.gov/services/", info: "https://www.phmsa.dot.gov/registration/registration-overview", fee: null, renews: B("Every year by June 30.", "每年 6 月 30 日前。"), checked: "page", fields: [],
  },

  /* --------------------------- New York State --------------------------- */
  {
    id: "ny-dos-1336", form: "DOS-1336-f", title: B("Articles of Organization (New York LLC)", "组织章程（纽约州 LLC）"),
    agency: B("New York Department of State, Division of Corporations", "纽约州务院公司处"), level: "state", where: "NY", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Filed online with the Department of State, or mailed.", "向纽约州务院在线提交或邮寄。"),
    url: "https://dos.ny.gov/limited-liability-company-articles-organization", info: "https://dos.ny.gov/limited-liability-company-articles-organization",
    fee: 200, takes: B("A few business days online; expedite is extra.", "在线约数个工作日，加急另收费。"), renews: B("Biennial statement every two years ($9).", "每两年提交一次双年报（9 美元）。"), checked: "page",
    fields: [F("name", "First", "Name of the limited liability company", "有限责任公司名称"), F("county", "Second", "County where the office will be located", "办公室所在县"), F("process", "Third", "Address for the Secretary of State to mail process to", "州务卿转送法律文书的地址"), F("agent", "Optional", "Registered agent name and address", "注册代理人姓名与地址"), F("organizer", "Signature", "Organizer name and signature", "组织人姓名与签名")],
  },
  {
    id: "ny-dos-pub", form: "Certificate of Publication", title: B("LLC publication within 120 days", "LLC 成立公告（120 天内）"),
    agency: B("New York Department of State, Division of Corporations", "纽约州务院公司处"), level: "state", where: "NY", segments: ALL, needs: { newEntity: true }, method: "pdf_mail", order: 13,
    how: B("Publish a notice in two newspapers chosen by the county clerk for six weeks, then file the certificate with the affidavits.", "在县书记官指定的两份报纸上连续刊登六周，然后提交证明及刊登宣誓书。"),
    url: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0", info: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0",
    fee: 50, feeNote: B("Plus the newspapers' charges, which vary by county.", "另付报社刊登费，各县不同。"), checked: "page", fields: [],
  },
  {
    id: "ny-dtf-17", form: "DTF-17", title: B("Application for Registration as a Sales Tax Vendor (Certificate of Authority)", "销售税经营者登记申请（授权证书）"),
    agency: B("New York State Department of Taxation and Finance", "纽约州税务与财政局"), level: "state", where: "NY", segments: ALL, method: "online", order: 20,
    how: B("Apply online through New York Business Express at least 20 days before your first sale. Display the certificate at each location.", "首笔销售前至少 20 天通过 New York Business Express 在线申请，并在每个门店张贴证书。"),
    url: "https://www.businessexpress.ny.gov/", info: "https://www.tax.ny.gov/bus/st/register.htm", pdf: "https://www.tax.ny.gov/pdf/current_forms/st/dtf17att_fill_in.pdf",
    fee: 0, takes: B("Usually about two weeks.", "通常约两周。"), checked: "page",
    fields: [F("legal", "Part 1", "Legal name and DBA", "法定名称与营业名称"), F("ein", "Part 1", "Federal EIN", "联邦 EIN"), F("addr", "Part 2", "Business location address", "营业地址"), F("start", "Part 2", "Date you begin selling", "开始销售日期"), F("naics", "Part 3", "NAICS code and what you sell", "NAICS 代码与销售内容"), F("people", "Part 4", "Responsible persons: owners and officers", "责任人：股东与高管")],
    attach: [B("Schedule of locations (DTF-17-ATT) for more than one store", "多家门店需附门店清单（DTF-17-ATT）")],
  },
  {
    id: "ny-dol-100", form: "NYS-100", title: B("New employer registration for unemployment insurance and withholding", "新雇主失业保险与预扣税登记"),
    agency: B("New York State Department of Labor", "纽约州劳工部"), level: "state", where: "NY", segments: ALL, needs: { employees: true }, method: "online", order: 60,
    how: B("Register online once you pay wages in New York.", "在纽约州支付工资后在线登记。"),
    url: "https://dol.ny.gov/register-unemployment-insurance-0", pdf: "https://dol.ny.gov/system/files/documents/2024/03/nys100.pdf", info: "https://dol.ny.gov/register-unemployment-insurance-0", fee: 0, checked: "page", fields: [],
  },
  {
    id: "ny-wcb", form: "Workers' compensation and disability (DBL/PFL) coverage", title: B("Proof of workers' comp and disability/paid family leave insurance", "工伤保险与残疾/带薪家庭假保险证明"),
    agency: B("New York State Workers' Compensation Board", "纽约州工伤赔偿委员会"), level: "state", where: "NY", segments: ALL, needs: { employees: true }, method: "insurer", order: 61,
    how: B("Buy the policies from an insurer; the insurer reports coverage to the Board. Agencies ask for the certificates.", "向保险公司购买保单，由保险公司向委员会报备。各机构会要求出示保险证明。"),
    url: "https://www.wcb.ny.gov/content/main/coverage-requirements.jsp", info: "https://www.wcb.ny.gov/content/main/coverage-requirements.jsp", fee: null, checked: "page", fields: [],
  },

  /* ---------------------------- New York City ---------------------------- */
  {
    id: "nyc-fse", form: "Food Service Establishment Permit", title: B("Food Service Establishment Permit", "餐饮服务场所许可证"),
    agency: B("NYC Department of Health and Mental Hygiene", "纽约市卫生与心理健康局"), level: "city", where: "NYC", segments: ["restaurant"], method: "portal", order: 75,
    how: B("Apply on NYC Business. The Health Department inspects before issuing; letter grades follow.", "在 NYC Business 申请，卫生局检查合格后发证，之后实行字母评级。"),
    url: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit", info: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit",
    fee: 280, checked: "page",
    fields: [F("legal", "Business", "Legal name and trade name", "法定名称与营业名称"), F("addr", "Premises", "Premises address", "场所地址"), F("owner", "Owner", "Owner or officers", "所有人或高管"), F("fpc", "Supervisor", "Food Protection Certificate number of a supervisor", "主管的食品保护证书编号"), F("seats", "Operation", "Seats and hours", "座位数与营业时间")],
    attach: [B("Food Protection Certificate", "食品保护证书"), B("Certificate of Occupancy or letter of no objection", "占用证或无异议函"), B("Lease", "租约")],
  },
  {
    id: "nyc-fpc", form: "Food Protection Certificate", title: B("Food Protection Certificate (course and exam)", "食品保护证书（课程与考试）"),
    agency: B("NYC Department of Health and Mental Hygiene", "纽约市卫生与心理健康局"), level: "city", where: "NYC", segments: ["restaurant"], method: "online", order: 70,
    how: B("Free online course, then an in-person exam. A certified supervisor must be on site whenever you are open.", "免费在线课程，之后线下考试。营业时必须有持证主管在场。"),
    url: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page", info: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page",
    fee: 24.6, feeNote: B("The exam fee; the course is free.", "考试费用；课程免费。"), checked: "page", fields: [],
  },
  {
    id: "nyc-sign", form: "Sign permit (DOB NOW: Build)", title: B("Sign permit", "招牌许可证"),
    agency: B("NYC Department of Buildings", "纽约市建筑局"), level: "city", where: "NYC", segments: STORES, needs: { signage: true }, method: "portal", order: 80,
    how: B("Filed in DOB NOW by a registered design professional or licensed sign hanger.", "由注册设计专业人员或持证招牌安装商在 DOB NOW 提交。"),
    url: "https://www.nyc.gov/site/buildings/property-or-business-owner/sign-permit.page", info: "https://www.nyc.gov/site/buildings/property-or-business-owner/sign-permit.page", fee: null, checked: "page", fields: [],
  },
  {
    id: "nyc-co", form: "Certificate of Occupancy check", title: B("Certificate of Occupancy for the use", "符合用途的占用证"),
    agency: B("NYC Department of Buildings", "纽约市建筑局"), level: "city", where: "NYC", segments: ["restaurant", "retail", "warehouse"], method: "portal", order: 15,
    how: B("Check the space's existing CO allows your use; a change of use needs an alteration filing and an amended CO.", "核对场所现有占用证是否允许您的用途；改变用途需提交改建申请并更新占用证。"),
    url: "https://www.nyc.gov/site/buildings/property-or-business-owner/certificate-of-occupancy.page", info: "https://www.nyc.gov/site/buildings/property-or-business-owner/certificate-of-occupancy.page", fee: null, checked: "page", fields: [],
  },
  {
    id: "nyc-crt", form: "Commercial Rent Tax", title: B("Commercial Rent Tax registration and returns", "商业租金税登记与申报"),
    agency: B("NYC Department of Finance", "纽约市财政局"), level: "city", where: "NYC", segments: ALL, needs: { manhattan: true }, method: "online", order: 85,
    how: B("Only for Manhattan spaces south of 96th Street above the rent threshold.", "仅适用于曼哈顿 96 街以南且租金超过门槛的场所。"),
    url: "https://nyc-business.nyc.gov/nycbusiness/description/commercial-rent-tax", info: "https://nyc.gov/site/finance/business/business-commercial-rent-tax-crt.page", fee: 0, checked: "page", fields: [],
  },

  /* ------------------------------ California ------------------------------ */
  {
    id: "ca-llc-1", form: "Form LLC-1", title: B("Articles of Organization (California LLC)", "组织章程（加州 LLC）"),
    agency: B("California Secretary of State", "加州州务卿"), level: "state", where: "CA", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Filed online in bizfile Online.", "在 bizfile Online 在线提交。"),
    url: "https://bizfileonline.sos.ca.gov/", info: "https://www.sos.ca.gov/business-programs/business-entities/forms", fee: 70,
    renews: B("Statement of Information (LLC-12, $20) within 90 days, then every two years.", "90 天内提交信息声明（LLC-12，20 美元），之后每两年一次。"), checked: "page",
    fields: [F("name", "1", "Limited liability company name", "有限责任公司名称"), F("office", "2a", "Initial street address of designated office in California", "加州指定办公室街道地址"), F("mail", "2b", "Initial mailing address, if different", "邮寄地址（如不同）"), F("agent", "3", "Agent for service of process", "法律文书送达代理人"), F("mgmt", "4", "Management", "管理方式", ["One manager", "More than one manager", "All LLC member(s)"])],
  },
  {
    id: "ca-llc-5", form: "Form LLC-5", title: B("Application to Register a Foreign LLC", "外州/外国 LLC 注册申请"),
    agency: B("California Secretary of State", "加州州务卿"), level: "state", where: "CA", segments: ALL, needs: { foreignEntity: true }, method: "online", order: 12,
    how: B("Filed in bizfile Online with a certificate of good standing from the home state or country.", "在 bizfile Online 提交，并附注册地出具的存续证明。"),
    url: "https://bizfileonline.sos.ca.gov/", info: "https://www.sos.ca.gov/business-programs/business-entities/forms", fee: 70, checked: "page", fields: [],
  },
  {
    id: "ca-ftb-3522", form: "FTB 3522", title: B("LLC annual tax ($800)", "LLC 年度税（800 美元）"),
    agency: B("California Franchise Tax Board", "加州特许经营税务委员会"), level: "state", where: "CA", segments: ALL, method: "online", order: 88,
    how: B("Paid every year by every LLC registered or doing business in California.", "所有在加州注册或经营的 LLC 每年缴纳。"),
    url: "https://www.ftb.ca.gov/pay/", pdf: "https://www.ftb.ca.gov/forms/2026/2026-3522.pdf", info: "https://www.ftb.ca.gov/file/business/types/limited-liability-company/index.html",
    fee: 800, renews: B("Every year, by the 15th day of the 4th month of the tax year.", "每年税务年度第 4 个月 15 日前。"), checked: "page", fields: [],
  },
  {
    id: "ca-cdtfa", form: "CDTFA seller's permit (online registration)", title: B("Seller's permit", "销售许可证"),
    agency: B("California Department of Tax and Fee Administration", "加州税费管理局（CDTFA）"), level: "state", where: "CA", segments: ALL, method: "online", order: 20,
    how: B("Register online before your first sale; one permit for each location.", "首笔销售前在线登记，每个门店一张。"),
    url: "https://onlineservices.cdtfa.ca.gov/", info: "https://cdtfa.ca.gov/services/registration.htm", fee: 0, feeNote: B("Free. CDTFA may ask for a security deposit.", "免费。CDTFA 可能要求缴纳保证金。"), checked: "page",
    fields: [F("legal", "Business", "Ownership type, legal name and FEIN", "所有权类型、法定名称与 FEIN"), F("addr", "Location", "Business location in California", "加州营业地址"), F("sells", "Activity", "What you sell (NAICS)", "销售内容（NAICS）"), F("people", "Owners", "Officers, members or managers", "高管、成员或经理"), F("start", "Sales", "Start date and expected monthly taxable sales", "开始日期与预计月应税销售额")],
  },
  {
    id: "ca-edd-de1", form: "DE 1", title: B("Registration Form for Commercial Employers", "商业雇主登记表"),
    agency: B("California Employment Development Department", "加州就业发展局（EDD）"), level: "state", where: "CA", segments: ALL, needs: { employees: true }, method: "online", order: 60,
    how: B("Register in e-Services for Business within 15 days of paying over $100 in wages.", "支付工资超过 100 美元后 15 天内在 e-Services for Business 登记。"),
    url: "https://edd.ca.gov/en/payroll_taxes/save_time_and_register_online/", pdf: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de1.pdf", info: "https://edd.ca.gov/en/payroll_taxes/step-3-register-for-a-payroll-tax-account/", fee: 0, checked: "page", fields: [],
  },
  {
    id: "ca-sb54", form: "SB 54 producer registration", title: B("Packaging producer registration (EPR)", "包装生产者登记（生产者延伸责任）"),
    agency: B("CalRecycle, through Circular Action Alliance", "加州资源回收局（经 Circular Action Alliance）"), level: "state", where: "CA", segments: ["seller", "retail", "restaurant"], needs: { imports: true }, method: "portal", order: 92,
    how: B("The brand owner or importer of packaged goods sold in California registers and reports with the producer organization.", "在加州销售包装商品的品牌方或进口商向生产者组织登记并申报。"),
    url: "https://circularactionalliance.org/california", info: "https://calrecycle.ca.gov/packaging/packaging-epr/", fee: null, checked: "page", fields: [],
  },
  {
    id: "ca-prop65", form: "Proposition 65 warnings (no filing)", title: B("Proposition 65 warning labels", "65 号提案警示标签"),
    agency: B("California Office of Environmental Health Hazard Assessment", "加州环境健康危害评估办公室"), level: "state", where: "CA", segments: ["seller", "retail"], method: "none", order: 93,
    how: B("Nothing is filed. Businesses with 10 or more employees warn before exposing Californians to listed chemicals, including online at checkout.", "无需申报。雇员 10 人以上的企业在让加州消费者接触列名化学物质前须给出警示，网上销售也需在结账处提示。"),
    url: "https://www.p65warnings.ca.gov/business-resources/frequently-asked-questions-businesses", info: "https://www.p65warnings.ca.gov/", fee: 0, checked: "page", fields: [],
  },

  /* ------------------------ Los Angeles city/county ------------------------ */
  {
    id: "la-btrc", form: "Business Tax Registration Certificate (BTRC)", title: B("City of Los Angeles business tax registration", "洛杉矶市营业税登记证"),
    agency: B("City of Los Angeles Office of Finance", "洛杉矶市财政办公室"), level: "city", where: "LA", segments: ALL, method: "online", order: 22,
    how: B("Register online within 30 days of starting business in the city.", "在市内开业后 30 天内在线登记。"),
    url: "https://finance.lacity.gov/register-new-business", info: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc", fee: null, feeNote: B("Tax depends on the business class and gross receipts.", "税额取决于业务类别和营业总额。"), renews: B("Renew every year.", "每年续期。"), checked: "page", fields: [],
  },
  {
    id: "lac-plan-check", form: "Retail Food Facility Plan Review Service Request (Rev 11/2025)", title: B("Food facility plan check", "食品设施图纸审查"),
    agency: B("Los Angeles County Department of Public Health, Environmental Health", "洛杉矶县公共卫生局环境卫生处"), level: "county", where: "LAC", segments: ["restaurant"], needs: { buildout: true }, method: "portal", order: 50,
    how: B("Submit plans before building out; approval comes before the public health permit.", "装修施工前提交图纸，获批后才能申请公共卫生许可证。"),
    url: "http://publichealth.lacounty.gov/eh/i-want-to/submit-electronic-plan.htm", pdf: "http://publichealth.lacounty.gov/eh/docs/inspection/retail-food-facility-plan-review-service-request.pdf", info: "http://publichealth.lacounty.gov/eh/inspection/retail-plan-check.htm", fee: null, checked: "page",
    fields: [], attach: [B("Scaled floor plan, equipment and finish schedules", "按比例绘制的平面图、设备与装修清单"), B("Menu", "菜单")],
  },
  {
    id: "lac-health-permit", form: "Public Health Permit/License Application", title: B("Public health permit (food facility)", "公共卫生许可证（食品设施）"),
    agency: B("Los Angeles County Department of Public Health, Environmental Health", "洛杉矶县公共卫生局环境卫生处"), level: "county", where: "LAC", segments: ["restaurant"], method: "pdf_mail", order: 76,
    how: B("Apply after plan approval and before opening; an inspector visits first.", "图纸获批后、开业前申请，需先通过现场检查。"),
    url: "http://publichealth.lacounty.gov/eh/docs/permit/Public-Health-Permit-License-Application.pdf", pdf: "http://publichealth.lacounty.gov/eh/docs/permit/Public-Health-Permit-License-Application.pdf", info: "http://publichealth.lacounty.gov/eh/inspection/how-to-obtain-restaurant-food-facility-permit.htm", fee: null, renews: B("Every year.", "每年。"), checked: "page", fields: [],
  },
  {
    id: "la-ladbs", form: "Application for Building Permit and Certificate of Occupancy", title: B("Building permit and Certificate of Occupancy", "建筑许可证与占用证"),
    agency: B("Los Angeles Department of Building and Safety", "洛杉矶建筑与安全局（LADBS）"), level: "city", where: "LA", segments: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 52,
    how: B("Tenant improvements and changes of use go through plan check; a new use gets a new Certificate of Occupancy.", "租户装修和用途变更需图纸审查；新用途需取得新的占用证。"),
    url: "https://dbs.lacity.gov/services/plan-review-permitting/building-permits", pdf: "https://www.ladbs.org/docs/default-source/forms/plan-check-2023/application-for-building-permit-or-grading-and-certificate-of-occupancy-pc-str-app01.pdf", info: "https://dbs.lacity.gov/services/plan-review-permitting/building-permits", fee: null, checked: "page", fields: [],
  },
  {
    id: "la-lafd-ops", form: "LAFD operational fire permits", title: B("Fire permits for high-piled storage and hazardous materials", "高堆货物与危险品消防许可证"),
    agency: B("Los Angeles Fire Department, Fire Prevention Bureau", "洛杉矶消防局防火处"), level: "city", where: "LA", segments: ["warehouse", "retail"], needs: { hazmat: true }, method: "portal", order: 78,
    how: B("Needed when storage or batteries cross fire code thresholds; inspected before issue.", "储存或电池数量超过消防规范门槛时需要，发证前检查。"),
    url: "https://lafd.org/operational-fire-permits", info: "https://lafd.org/operational-fire-permits", fee: null, checked: "page", fields: [],
  },
  {
    id: "la-cupa-hmbp", form: "Hazardous Materials Business Plan (CERS)", title: B("Hazardous materials business plan", "危险品业务计划"),
    agency: B("Los Angeles Fire Department CUPA", "洛杉矶消防局 CUPA"), level: "city", where: "LA", segments: ["warehouse"], needs: { hazmat: true }, method: "portal", order: 79,
    how: B("Filed in the California Environmental Reporting System when stored materials reach reporting amounts.", "储存量达到申报标准时在加州环境报告系统（CERS）提交。"),
    url: "https://lafd.org/fire-prevention/cupa/hazardous-materials", info: "https://lafd.org/hmbp-threshold-reporting-guidance", fee: null, renews: B("Certify every year.", "每年认证。"), checked: "page", fields: [],
  },

  /* -------------------------------- Texas -------------------------------- */
  {
    id: "tx-205", form: "Form 205", title: B("Certificate of Formation (Texas LLC)", "成立证书（德州 LLC）"),
    agency: B("Texas Secretary of State", "德州州务卿"), level: "state", where: "TX", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Filed online in SOSDirect, or by mail or fax.", "通过 SOSDirect 在线提交，也可邮寄或传真。"),
    url: "https://www.sos.state.tx.us/corp/forms/205_boc.pdf", pdf: "https://www.sos.state.tx.us/corp/forms/205_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/205.shtml", fee: 300, checked: "page",
    fields: [F("name", "Article 1", "Entity name", "实体名称"), F("agent", "Article 2", "Registered agent and Texas registered office", "注册代理人与德州注册办公室"), F("gov", "Article 3", "Governing authority: managers or members, with names and addresses", "管理方式：经理或成员，及其姓名地址"), F("purpose", "Article 4", "Purpose", "经营目的"), F("organizer", "Organizer", "Organizer name and address", "组织人姓名与地址")],
  },
  {
    id: "tx-304", form: "Form 304", title: B("Application for Registration of a Foreign LLC", "外州/外国 LLC 注册申请"),
    agency: B("Texas Secretary of State", "德州州务卿"), level: "state", where: "TX", segments: ALL, needs: { foreignEntity: true }, method: "online", order: 12,
    how: B("Filed in SOSDirect with a certificate of existence from the home jurisdiction.", "通过 SOSDirect 提交，并附注册地出具的存续证明。"),
    url: "https://www.sos.texas.gov/corp/forms/304_boc.pdf", pdf: "https://www.sos.texas.gov/corp/forms/304_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/304.shtml", fee: 750, checked: "page", fields: [],
  },
  {
    id: "tx-503", form: "Form 503", title: B("Assumed Name Certificate (DBA)", "假定名称证书（DBA）"),
    agency: B("Texas Secretary of State", "德州州务卿"), level: "state", where: "TX", segments: ALL, method: "online", order: 14,
    how: B("Filed when the store trades under a name other than the legal name.", "门店使用与法定名称不同的名称经营时提交。"),
    url: "https://www.sos.state.tx.us/corp/forms/503_boc.pdf", pdf: "https://www.sos.state.tx.us/corp/forms/503_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/503.shtml", fee: 25, renews: B("Valid up to 10 years.", "最长有效 10 年。"), checked: "page", fields: [],
  },
  {
    id: "tx-ap201", form: "AP-201", title: B("Texas Sales and Use Tax Permit Application", "德州销售与使用税许可证申请"),
    agency: B("Texas Comptroller of Public Accounts", "德州审计长办公室"), level: "state", where: "TX", segments: ALL, method: "online", order: 20,
    how: B("Apply online in eSystems before your first sale; one permit for each location.", "首笔销售前通过 eSystems 在线申请，每个门店一张。"),
    url: "https://comptroller.texas.gov/taxes/permit/", info: "https://comptroller.texas.gov/taxes/permit/", fee: 0, feeNote: B("Free. A security may be required.", "免费，可能需要缴纳担保金。"), checked: "page", fields: [],
  },
  {
    id: "tx-franchise", form: "Franchise Tax Report and Public Information Report (05-102)", title: B("Franchise tax annual report", "特许经营税年度报告"),
    agency: B("Texas Comptroller of Public Accounts", "德州审计长办公室"), level: "state", where: "TX", segments: ALL, method: "online", order: 89,
    how: B("Filed every year by May 15, even when no tax is due.", "每年 5 月 15 日前申报，即使无需缴税。"),
    url: "https://comptroller.texas.gov/taxes/franchise/", info: "https://comptroller.texas.gov/taxes/franchise/", fee: 0, renews: B("Every year by May 15.", "每年 5 月 15 日前。"), checked: "page", fields: [],
  },
  {
    id: "tx-twc", form: "Employer registration (unemployment tax)", title: B("Unemployment tax account", "失业保险税账户"),
    agency: B("Texas Workforce Commission", "德州劳动力委员会"), level: "state", where: "TX", segments: ALL, needs: { employees: true }, method: "online", order: 60,
    how: B("Register online once you pay wages in Texas.", "在德州支付工资后在线登记。"),
    url: "https://www.twc.texas.gov/services/register-tax", info: "https://www.twc.texas.gov/services/register-tax", fee: 0, checked: "page", fields: [],
  },

  /* -------------------------------- Houston -------------------------------- */
  {
    id: "hou-co", form: "Certificate of Occupancy (HPW Code 1106)", title: B("Certificate of Occupancy", "占用证"),
    agency: B("City of Houston, Houston Permitting Center", "休斯顿市许可中心"), level: "city", where: "HOU", segments: ["restaurant", "retail", "warehouse"], method: "portal", order: 54,
    how: B("Needed for a new tenant use or change of use inside city limits.", "市内新租户用途或用途变更时需要。"),
    url: "https://www.houstonpermittingcenter.org/hpwcode1106", info: "https://www.houstonpermittingcenter.org/hpwcode1106", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-sign", form: "On-premises sign permit (HPW Code 1112)", title: B("Sign permit", "招牌许可证"),
    agency: B("City of Houston, Sign Administration", "休斯顿市招牌管理处"), level: "city", where: "HOU", segments: STORES, needs: { signage: true }, method: "portal", order: 80,
    how: B("Filed with the Houston Permitting Center before the sign goes up.", "安装招牌前向休斯顿许可中心提交。"),
    url: "https://www.houstonpermittingcenter.org/hpwcode1112", info: "https://houstonpermittingcenter.org/building-code-enforcement/sign-administration", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-plan-review", form: "Food establishment plan review", title: B("Food establishment plan review", "食品场所图纸审查"),
    agency: B("Houston Health Department", "休斯顿卫生局"), level: "city", where: "HOU", segments: ["restaurant"], needs: { buildout: true }, method: "portal", order: 50,
    how: B("Submit plans before building or remodeling a food establishment.", "新建或改建食品场所前提交图纸。"),
    url: "https://www.houstonhealth.org/food-permits/opening-food-establishment", info: "https://www.houstonhealth.org/food-permits/opening-food-establishment", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-food-dealer", form: "Food Dealer permit (HHD1003)", title: B("Food dealer permit", "食品经营许可证"),
    agency: B("Houston Health Department", "休斯顿卫生局"), level: "city", where: "HOU", segments: ["restaurant"], method: "portal", order: 76,
    how: B("The operating permit, issued after plan review and inspection.", "经营许可证，图纸审查和检查合格后发放。"),
    url: "https://www.houstonpermittingcenter.org/hhd1003", info: "https://www.houstonpermittingcenter.org/hhd1003", fee: null, renews: B("Every year.", "每年。"), checked: "page", fields: [],
  },
  {
    id: "hou-fire", form: "Fire prevention permits", title: B("Fire permits for hazardous materials and high-piled storage", "危险品与高堆货物消防许可证"),
    agency: B("Houston Fire Department, Fire Marshal's Office", "休斯顿消防局消防署"), level: "city", where: "HOU", segments: ["warehouse", "retail"], needs: { hazmat: true }, method: "in_person", order: 78,
    how: B("Needed when storage or batteries cross fire code thresholds.", "储存或电池数量超过消防规范门槛时需要。"),
    url: "https://www.houstontx.gov/fire/formsandpermits", info: "https://www.houstonpermittingcenter.org/fire-marshal-office", fee: null, checked: "page", fields: [],
  },
];

FORMS.push(...WORLD_FORMS);

export const formById = (id: string) => FORMS.find(f => f.id === id);

/** What kind of business it is, from what it sells. */
export function segmentOf(text: string): Segment {
  const t = text.toLowerCase();
  if (/warehouse|3pl|fulfil|logistic|freight|仓|物流|货代/.test(t)) return "warehouse";
  if (/import|e-?commerce|amazon|seller|shein|temu|tiktok shop|跨境|电商|卖家|进口/.test(t)) return "seller";
  if (/tea|coffee|restaurant|food|kitchen|bakery|hot ?pot|malatang|noodle|dessert|ice cream|bubble|cafe|奶茶|茶|咖啡|餐|火锅|麻辣烫|面|甜品|烘焙|食/.test(t)) return "restaurant";
  return "retail";
}

const NYC = /\b(new york city|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|astoria|long island city|elmhurst|sunset park|chinatown, ny)\b|纽约市|法拉盛|曼哈顿|皇后区|布鲁克林/i;
/** Where it is: the jurisdictions whose forms apply, at home and abroad. */
export function placesOf(where: string): Where[] {
  const w = where.toLowerCase();
  const world = worldPlaces(where);
  const abroad = !!world.country && world.country.code !== "US";
  const out: Where[] = abroad ? [] : ["US"];
  if (!abroad) {
    if (NYC.test(w) || /,\s*ny\b|new york|纽约/.test(w)) out.push("NY");
    if (NYC.test(w)) out.push("NYC");
    if (/,\s*ca\b|california|加州|los angeles|洛杉矶|san francisco|旧金山|san jose|圣何塞|irvine|arcadia|alhambra|san gabriel/.test(w)) out.push("CA");
    if (/los angeles|洛杉矶|\bla\b/.test(w)) out.push("LA", "LAC");
    else if (/arcadia|alhambra|san gabriel|monterey park|rowland heights|pasadena|long beach|torrance|el monte/.test(w)) out.push("LAC");
    if (/,\s*tx\b|texas|德州|houston|休斯顿|dallas|达拉斯|austin|奥斯汀|plano/.test(w)) out.push("TX");
    if (/houston|休斯顿/.test(w)) out.push("HOU");
  }
  for (const code of world.codes) if (!out.includes(code) && code !== "US") out.push(code);
  return out;
}

/** What the library knows about a place: its country, its city, and whether the city has its own local steps. */
export function placeInfo(where: string) {
  const p = worldPlaces(where);
  const us = !p.country || p.country.code === "US";
  const usLocal = us && /new york|nyc|flushing|manhattan|brooklyn|queens|los angeles|洛杉矶|houston|休斯顿|纽约|法拉盛/i.test(where);
  return { country: p.country?.code ?? (us ? "US" : undefined), city: p.city, local: p.known || usLocal, currency: p.country?.currency ?? "USD" };
}

/** The forms an opening needs, in the order they're filed. */
export function formsFor(o: { segment: Segment; where: string; needs?: Needs }): OfficialForm[] {
  const places = placesOf(o.where), have = o.needs ?? {};
  return FORMS.filter(f => places.includes(f.where) && f.segments.includes(o.segment)
    && Object.keys(f.needs ?? {}).every(k => have[k as keyof Needs]))
    .sort((a, b) => a.order - b.order);
}

/** Search the library: by words in the form number, title or agency, and by place and segment. */
export function searchForms(q: { text?: string; where?: string; segment?: Segment }): OfficialForm[] {
  const places = q.where ? placesOf(q.where) : null;
  const words = (q.text ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 1);
  return FORMS.filter(f => (!places || places.includes(f.where)) && (!q.segment || f.segments.includes(q.segment))
    && words.every(w => `${f.form} ${f.title.en} ${f.title.zh} ${f.agency.en} ${f.agency.zh} ${f.id}`.toLowerCase().includes(w)))
    .sort((a, b) => a.order - b.order);
}

export const METHOD: Record<Method, Bi> = {
  online: B("Filed online", "在线提交"), pdf_mail: B("Paper form, mailed", "纸质表格邮寄"), pdf_fax: B("Paper form, faxed or mailed", "纸质表格传真或邮寄"),
  portal: B("Filed on the agency's portal", "在机构门户提交"), in_person: B("Filed in person", "现场办理"), insurer: B("Through your insurer", "通过保险公司办理"), none: B("Nothing to file", "无需申报"),
};
