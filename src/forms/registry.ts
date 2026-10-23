import TIMES from "./times.json";
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import { WORLD_FORMS, unaccent, worldPlaces } from "./world";
import { LOCAL_US } from "./local-us";
import { BEACHHEAD } from "./beachhead";
import { TOP_CITIES } from "./topcities";
import { PROOF } from "./proof";
import { countyFor, usPlace } from "./usplace";
import { MORE_US } from "./more-us";
import { MARKETS_US } from "./markets-us";
import { LINES } from "./lines";
import { PLAIN } from "./plain";
import { MAPS } from "./maps";
import { FURNITURE, FURNITURE_FORMS } from "./furniture";
import { applyFixes } from "./audit";
import { US_GAPS } from "./us-gaps";
import { INTL_FORMS } from "./intl";
import { FINISH_FIXES, FINISH_FORMS } from "./finish";
import { SECTOR_FORMS } from "./sectors";

/* The official forms library: the real government forms, by number, with the agency, how it's filed, the official
   links and fee, and (for the forms Placetta fills) the fields line by line as printed. Sources are the agencies' own
   sites. "form": we read the actual form (the PDF is bundled and filled). "page": the official page is confirmed; the
   filing team re-checks the current requirements before submitting, as it does for every filing. */

export type Segment = "restaurant" | "retail" | "seller" | "warehouse";
/** Where a form applies: "US", a state ("NY"), a US city ("NYC"), a country ("GB") or a city abroad ("GB-LON"). */
export type Where = string;
export type Method = "online" | "pdf_mail" | "pdf_fax" | "portal" | "in_person" | "insurer" | "none";
export type FormField = { id: string; line: string; label: Bi; hint?: Bi; options?: string[] };
export type Needs = { food?: boolean; employees?: boolean; imports?: boolean; alcohol?: boolean; hazmat?: boolean; signage?: boolean; buildout?: boolean; newEntity?: boolean; foreignEntity?: boolean; outOfState?: boolean; manhattan?: boolean; cosmetics?: boolean; children?: boolean; forwarder?: boolean; reference?: boolean;
  wood?: boolean; upholstered?: boolean; clothingStorage?: boolean;
  salon?: boolean; autoRepair?: boolean; devices?: boolean; manufactures?: boolean; office?: boolean;   // the landing page's sectors (src/forms/sectors.ts)
  terrace?: boolean };   // terrace: tables and chairs outside on the street (a pavement licence, a terrasse, a Sondernutzung)   // furniture: wood goods, upholstered furniture, clothing storage units (src/forms/furniture.ts)   // reference: listed in the library and answers, never added to a plan

export type SignSpot = { page: number; x: number; y: number; w: number; h: number; date?: { x: number; y: number; size: number } };

export type OfficialForm = {
  id: string;
  form: string;               // the number as the agency prints it
  title: Bi;
  agency: Bi;
  level: Level;
  where: Where;
  segments: Segment[];
  needs?: Needs;              // only when the business does this
  unless?: (keyof Needs)[];   // not when the business does any of these (an importer's license covers California's retail one)
  method: Method;
  how: Bi;                    // how it's filed, in one line
  url: string;                // where it's filed: the portal, or the official PDF
  pdf?: string;               // the official PDF
  info: string;               // the agency's page about it
  fee: number | null;         // government fee in the local currency (USD unless currency says otherwise); null when it varies
  currency?: string;
  feeNote?: Bi;
  takes?: Bi;
  takesDays?: number | null;   // the days a file-by date counts back, when the time came from research (null: none)
  takesSource?: string;       // the agency page that states that time, and when we read it
  renews?: Bi;
  fields: FormField[];        // as printed on the form or asked by the portal
  attach?: Bi[];
  foreign?: Bi;               // what's different for a China-based owner
  fill?: "ss4" | "cbp5106";   // Placetta fills the official PDF itself
  esign?: boolean;            // the agency accepts a drawn signature on this form (from its own page)
  sign?: SignSpot;            // where a signature and its date go on the official PDF (PDF points, page from 0)
  checked: "form" | "page" | "known";
  lines?: { status: "mapped" | "page_only"; read: string; seen: string; sources: string[]; submit: { email?: string; fax?: string; portal?: string; signature: string; source: string } };   // the line-by-line research   // known: from Placetta's library of official sites; re-read before filing
  order: number;              // where it falls in an opening: lower first
  plain?: Bi;                 // what this is, in one line a person would say to an owner (src/forms/plain.ts)
  /** Other library forms this one waits on, when the agency's own page says so (Boston's food permit is issued only
      after the common victualler license). The instant plan links them when both are in it. */
  after?: { form: string; label: Bi }[];
  /** Places inside `where` this form doesn't apply to, because a local form replaces it (New Jersey's plan review rule
      is Edison's own entry in Edison). */
  except?: Where[];
  /** The proof behind the source link: a sentence (under 25 words) from the official page that states the requirement,
      the day it was read, and the URL that was fetched to read it (src/forms/proof.ts, scripts/eval/proof.ts). */
  proof?: { quote: string; checked: string; read: string; en?: string };   // en: the quote in English, when the page isn't
  /** A filing only a local professional may make (a notary, a lawyer, a gestor): Placetta prepares it and hands it to one. */
  specialist?: Bi;
  /** Internal only, never shown or cited: a secondary source (a law firm, a blog, an aggregator) that named this filing
      when no official page could be read to confirm it. Staff follow it up; the entry stays unverified (no proof). */
  lead?: string;
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
    // The Signature line under "Name and title" (f1_44), checked by rendering page 1 with pdftoppm.
    sign: { page: 0, x: 100, y: 38, w: 215, h: 20, date: { x: 356, y: 41, size: 9 } },
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
      F("l7b", "7b", "SSN, ITIN, or EIN of responsible party", "负责人 SSN、ITIN 或 EIN", undefined, B("Placetta never stores an SSN or ITIN. Write \"Foreign\" if there is none, or \"By hand\" and the signer writes it on the signed copy.", "快哉从不保存 SSN 或 ITIN。没有时填写 \"Foreign\"；或填写 \"手写\"，由签署人在签字件上手写。")),
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
    url: "https://www.cbp.gov/sites/default/files/2026-06/cbp_form_5106.pdf", pdf: "https://www.cbp.gov/sites/default/files/2026-06/cbp_form_5106.pdf", info: "https://www.cbp.gov/newsroom/publications/forms", takes: B("Up to 5 business days.", "最多 5 个工作日。"), takesSource: "https://www.cbp.gov/sites/default/files/documents/Policy%20and%20Procedures%20Form%205106_2.pdf (2026-10-09)",
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
    url: "https://www.cbp.gov/sites/default/files/2024-05/cbp_form_301.pdf", pdf: "https://www.cbp.gov/sites/default/files/2024-05/cbp_form_301.pdf", info: "https://www.cbp.gov/trade/priority-issues/bonds", takes: B("At least 5 business days for review.", "审核至少需要 5 个工作日。"), takesSource: "https://www.cbp.gov/sites/default/files/documents/Bonds%20General%20Guidelines.pdf (2026-10-09)",
    fee: null, feeNote: B("No CBP fee. The surety charges a premium; a continuous bond is at least $50,000 of coverage.", "CBP 不收费。担保公司收取保费；连续保证金额度至少 50,000 美元。"), renews: B("Continuous bonds renew yearly.", "连续保证金每年续保。"), checked: "form",
    fields: [
      F("broker", "Header", "Broker filer code (when a customs broker files the bond)", "报关行申报人代码（由报关行提交时填写）"),
      F("bond_type", "Section I", "Single transaction bond or continuous bond (not both)", "单次交易保证金或连续保证金（二选一）", ["Single transaction bond", "Continuous bond"]),
      F("transaction", "Section I", "Single transaction only: entry number (or ISF transaction number) this bond secures", "仅限单次保证金：本保证金担保的报关单号（或 ISF 交易号）"),
      F("transaction_date", "Section I", "Single transaction only: transaction date", "仅限单次保证金：交易日期"),
      F("port", "Section I", "Single transaction only: 4-digit port code", "仅限单次保证金：4 位口岸代码"),
      F("effective_date", "Section I", "Continuous bond only: effective date", "仅限连续保证金：生效日期"),
      F("limit_1", "Section II, code 1", "Activity code 1, importer or broker: limit of liability (whole dollars)", "活动代码 1（进口商或报关行）：责任限额（整数美元）", undefined, B("Answer only the activity this bond covers: the answer ticks that box. A continuous bond is at least $50,000.", "只填写本保证金涵盖的活动，填写即勾选该项。连续保证金至少 50,000 美元。")),
      F("limit_1a", "Section II, code 1a", "Activity code 1a, drawback payments refunds: limit of liability (whole dollars)", "活动代码 1a（退税款项）：责任限额（整数美元）"),
      F("limit_16", "Section II, code 16", "Activity code 16, Importer Security Filing (ISF): limit of liability (whole dollars)", "活动代码 16（进口商安全申报 ISF）：责任限额（整数美元）"),
      F("principal", "Principal", "Principal: full name and legal description, physical address (not a P.O. box) and state of incorporation", "委托人：全称及法律形式、实际地址（不可用邮政信箱）及注册州", undefined, B("One per line: the name; the legal description and state (e.g. a Delaware limited liability company); street, City, ST ZIP.", "每项一行：名称；法律形式及注册州（如 a Delaware limited liability company）；街道, 城市, 州 邮编。")),
      F("cbp_id", "Principal", "Principal's CBP identification number (EIN with its 2-digit suffix, e.g. 12-3456789-00, or the CBP-assigned number)", "委托人的 CBP 识别号（EIN 加两位后缀，如 12-3456789-00，或 CBP 分配的号码）"),
      F("trade_names", "Section III", "Trade names or unincorporated divisions that may use this bond, with their CBP identification numbers", "可使用本保证金的商号或非法人分部及其 CBP 识别号", undefined, B("One per line: CBP number, complete name (e.g. 12-3456789-01, Lotus Tea House LLC DBA Lotus Tea).", "每项一行：CBP 识别号, 完整名称（如 12-3456789-01, Lotus Tea House LLC DBA Lotus Tea）。")),
    ],
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
    url: "https://www.access.fda.gov/", info: "https://www.fda.gov/food/online-registration-food-facilities", takes: B("Number issued on screen as soon as an online registration with a valid UFI is submitted; foreign facilities wait for U.S. agent confirmation.", "网上提交且 UFI 有效时，注册号当即在页面显示；外国设施需等待美国代理人确认。"), takesSource: "https://fda.gov/media/166887/download?attachment= (2026-10-09)", fee: 0, renews: B("Renew between October 1 and December 31 of every even-numbered year.", "每逢偶数年 10 月 1 日至 12 月 31 日续期。"), checked: "page", fields: [],
  },
  {
    id: "irs-w7", form: "Form W-7", title: B("Application for IRS Individual Taxpayer Identification Number (ITIN)", "个人报税识别号（ITIN）申请"),
    agency: B("Internal Revenue Service", "美国国税局（IRS）"), level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_mail", order: 11,
    how: B("For people who need a US tax number but can't get a Social Security number. File Form W-7 with a US federal tax return unless an exception applies, and either mail it with original or certified identity documents, use a Certifying Acceptance Agent, or book an IRS Taxpayer Assistance Center.", "适用于需要美国税号但无法取得社会安全号的个人。除符合例外情形外，W-7 表须随美国联邦报税表一并提交；可附原件或签发机构认证副本邮寄，也可通过认证受理代理人（CAA）或预约 IRS 纳税人援助中心办理。"),
    url: "https://www.irs.gov/pub/irs-pdf/fw7.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/fw7.pdf", info: "https://www.irs.gov/instructions/iw7",
    takes: B("Allow 7 weeks for the IRS to send the application status.", "IRS 约 7 周内通知申请结果。"), takesSource: "https://www.irs.gov/instructions/iw7 (2026-10-12)",
    fee: 0, checked: "page",
    // The lines of Form W-7 (Rev. December 2024) as printed; the Acceptance Agent block is for the agent and is left out.
    fields: [
      F("app_type", "Application type", "Application type", "申请类型", ["Apply for a new ITIN", "Renew an existing ITIN"]),
      F("reason", "Reason", "Reason you're submitting Form W-7", "提交 W-7 表的原因", [
        "a. Nonresident alien required to get an ITIN to claim tax treaty benefit",
        "b. Nonresident alien filing a U.S. federal tax return",
        "c. U.S. resident alien (based on days present in the United States) filing a U.S. federal tax return",
        "d. Dependent of U.S. citizen/resident alien",
        "e. Spouse of U.S. citizen/resident alien",
        "f. Nonresident alien student, professor, or researcher filing a U.S. federal tax return or claiming an exception",
        "g. Dependent/spouse of a nonresident alien holding a U.S. visa",
        "h. Other",
      ], B("Box a also needs box h. With b, c, d, e, f or g, a U.S. federal tax return goes with the form unless an exception applies.", "选 a 时还须填写 h 栏。选 b、c、d、e、f 或 g 时，除符合例外情形外，须随表附上美国联邦报税表。")),
      F("relationship", "d", "If d: relationship to the U.S. citizen/resident alien", "如选 d：与美国公民/居民外国人的关系"),
      F("us_person", "d, e", "If d or e: name of the U.S. citizen/resident alien", "如选 d 或 e：美国公民/居民外国人的姓名", undefined, B("Their SSN or ITIN is written by hand on the form after the name; Placetta doesn't print it.", "其 SSN 或 ITIN 由申请人在表上姓名后手写，快哉不打印。")),
      F("other", "h", "If h: the exception or other reason (see instructions)", "如选 h：适用的例外情形或其他原因（见说明）", undefined, B("Also needed with box a, and with box f when claiming an exception: write the exception the instructions name.", "选 a 时必填；选 f 并主张例外情形时也须填写：写明说明中列出的例外情形。")),
      F("treaty_country", "a, f", "Treaty country", "税收协定国家"),
      F("treaty_article", "a, f", "Treaty article number", "税收协定条款编号"),
      F("first_name", "1a", "First name", "名", undefined, B("As on the passport.", "与护照一致。")),
      F("middle_name", "1a", "Middle name", "中间名"),
      F("last_name", "1a", "Last name", "姓"),
      F("birth_name", "1b", "Name at birth, if different (first, middle, last)", "出生时姓名（如不同）（名、中间名、姓）"),
      F("mailing", "2", "Mailing address: street, apartment or rural route number; then city, state or province, country and ZIP or postal code", "邮寄地址：街道、门牌或乡村路线号；然后是城市、州或省、国家及邮编", undefined, B("For a P.O. box, see the instructions.", "使用邮政信箱的，见说明。")),
      F("foreign_address", "3", "Foreign (non-U.S.) address: street; then city, state or province, country and postal code", "外国（非美国）地址：街道；然后是城市、州或省、国家及邮编", undefined, B("Not a P.O. box. Put the street first, then a semicolon or new line.", "不可用邮政信箱。先写街道，再用分号或换行接城市等。")),
      F("dob", "4", "Date of birth (mm/dd/yyyy)", "出生日期（月/日/年）"),
      F("birth_country", "4", "Country of birth", "出生国家"),
      F("birth_city", "4", "City and state or province of birth (optional)", "出生城市及州或省（可选）"),
      F("sex", "5", "Sex", "性别", ["Male", "Female"]),
      F("citizenship", "6a", "Country(ies) of citizenship", "国籍"),
      F("foreign_tin", "6b", "Foreign tax I.D. number (if any)", "外国税号（如有）"),
      F("visa", "6c", "Type of U.S. visa (if any), number, and expiration date", "美国签证类型（如有）、签证号码及到期日"),
      F("id_type", "6d", "Identification document submitted", "提交的身份证明文件", ["Passport", "Driver's license/State I.D.", "USCIS documentation", "Other"], B("For Other, write \"Other: \" and the document.", "选其他时，写 \"Other: \" 加文件名称。")),
      F("id_issuer", "6d", "Issued by", "签发机构"),
      F("id_number", "6d", "Document number (written by hand)", "证件号码（手写）", undefined, B("The applicant writes the number by hand on the form; Placetta doesn't print it.", "由申请人在表上手写，快哉不打印。")),
      F("id_expiry", "6d", "Document expiration date (mm/dd/yyyy)", "证件有效期至（月/日/年）"),
      F("us_entry", "6d", "Date of entry into the United States (mm/dd/yyyy)", "入境美国日期（月/日/年）"),
      F("prev_itin", "6e", "Have you previously received an ITIN or an IRS Number (IRSN)?", "以前是否获得过 ITIN 或 IRS 编号（IRSN）？", ["No/Don't know", "Yes"]),
      F("prev_number", "6f", "ITIN and/or IRSN (written by hand)", "ITIN 和/或 IRSN（手写）", undefined, B("The applicant writes the number by hand on the form; Placetta doesn't print it.", "由申请人在表上手写，快哉不打印。")),
      F("prev_name", "6f", "Name under which it was issued (first, middle, last)", "签发时使用的姓名（名、中间名、姓）"),
      F("school", "6g", "Name of college/university or company", "大学或公司名称"),
      F("school_city", "6g", "City and state", "所在城市及州"),
      F("stay", "6g", "Length of stay", "停留时长"),
      F("phone", "Sign Here", "Applicant's phone number", "申请人电话"),
      F("delegate", "Sign Here", "Name of delegate, if applicable", "代理人姓名（如适用）"),
      F("delegate_rel", "Sign Here", "Delegate's relationship to applicant", "代理人与申请人的关系", ["Parent", "Power of attorney", "Court-appointed guardian"]),
    ],
  },
  {
    id: "uspto-tm", form: "USPTO trademark application", title: B("US trademark application", "美国商标注册申请"),
    agency: B("United States Patent and Trademark Office", "美国专利商标局（USPTO）"), level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "online", order: 95,
    how: B("Filed online with the USPTO. An applicant domiciled outside the US, including a China-based company, must be represented by a US-licensed attorney, and every applicant gives and keeps current its domicile address.", "向 USPTO 在线提交。住所在美国境外的申请人（包括中国公司）必须委托持美国执照的律师代理；所有申请人都须提供并及时更新住所地址。"),
    url: "https://www.uspto.gov/trademarks/apply", info: "https://www.uspto.gov/trademarks/basics/do-i-need-attorney",
    fee: null, feeNote: B("$350 base application fee for each class of goods or services; other fees may apply.", "每个商品或服务类别基本申请费 350 美元，另可能产生其他费用。"),
    foreign: B("A foreign-domiciled applicant must have a US-licensed attorney represent it.", "住所在境外的申请人必须由持美国执照的律师代理。"),
    checked: "page", fields: [],
  },
  {
    id: "fda-prior-notice", form: "FDA Prior Notice of Imported Food", title: B("Prior Notice for imported food", "进口食品预先通报（Prior Notice）"),
    agency: B("U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）"), level: "federal", where: "US", segments: ["seller", "warehouse"], needs: { reference: true }, method: "online", order: 47,
    how: B("Submitted for each food shipment before it arrives, through FDA's Prior Notice System Interface or CBP's ABI/ACS, by anyone with the required information. At least 2 hours ahead by road, 4 by rail or air and 8 by water; for international mail, before the food is sent.", "每批进口食品抵达前，由掌握所需信息的任何人通过 FDA 预先通报系统（PNSI）或 CBP 的 ABI/ACS 提交。公路运输至少提前 2 小时，铁路或空运 4 小时，海运 8 小时；国际邮件须在寄出前提交。"),
    url: "https://www.access.fda.gov/", info: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-what-you-need-know-about-prior-notice-imported-food-shipments",
    fee: null, checked: "page", fields: [],
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
    // not for a food importer: the Consumer Product Safety Act's "consumer product" excludes "(I) food" as the FD&C Act
    // defines it (15 U.S.C. 2052(a)(5)(I), govinfo.gov USCODE-2023); FDA's registration and prior notice cover it instead.
    // Nor for medical devices, which the same definition excludes (2052(a)(5)(H)); FDA's device registration covers them
    agency: B("U.S. Consumer Product Safety Commission", "美国消费品安全委员会（CPSC）"), level: "federal", where: "US", segments: ["seller", "retail"], needs: { imports: true }, unless: ["food", "devices"], method: "online", order: 50,
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
    id: "ttb-dealer", form: "TTB F 5630.5d (Alcohol Dealer Registration)", title: B("Alcohol dealer registration", "酒类经销商登记"),
    agency: B("Alcohol and Tobacco Tax and Trade Bureau (TTB)", "美国酒类与烟草税务贸易局（TTB）"), level: "federal", where: "US", segments: ["restaurant", "retail"], needs: { alcohol: true }, method: "online", order: 72,
    how: B("Every business that sells beer, wine or spirits, restaurants and bars included, registers each location with TTB before it starts selling (Form 5630.5d or Permits Online), and updates it by July 1 when anything changes.", "凡销售啤酒、葡萄酒或烈酒的企业（包括餐厅和酒吧），须在开始销售前为每个门店向 TTB 登记（5630.5d 表或 Permits Online），信息变更时须在 7 月 1 日前更新。"),
    url: "https://www.ttb.gov/nrc/retail-beverage-alcohol-dealers", info: "https://www.ttb.gov/nrc/retail-beverage-alcohol-dealers",
    fee: 0, feeNote: B("TTB's page lists no fee.", "TTB 页面未列出费用。"), checked: "page", fields: [],
    plain: B("A free federal registration for any place that sells alcohol, done once per location before the first sale.", "任何销售酒类的场所须办理的免费联邦登记，每个门店在首次销售前办理一次。"),
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
    url: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0", info: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0", takes: B("No standard time published; paid expedited processing within 24 hours ($25).", "未公布标准处理时间；付费加急可在 24 小时内处理（25 美元）。"), takesSource: "https://dos.ny.gov/certificate-publication-domestic-limited-liability-company-0 (2026-10-09)",
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
    url: "https://dol.ny.gov/register-unemployment-insurance-0", pdf: "https://dol.ny.gov/system/files/documents/2021/02/nys100-1.pdf", info: "https://dol.ny.gov/register-unemployment-insurance-0", fee: 0, checked: "page", fields: [],
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
    url: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit", info: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit", renews: B("Every year.", "每年续期一次。"), takes: B("You may open 22 days after applying, even before the pre-permit inspection.", "提交申请 22 天后即可开业，即使尚未进行发证前检查。"), takesSource: "https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit (2026-10-09)",
    fee: 280, checked: "page",
    fields: [F("legal", "Business", "Legal name and trade name", "法定名称与营业名称"), F("addr", "Premises", "Premises address", "场所地址"), F("owner", "Owner", "Owner or officers", "所有人或高管"), F("fpc", "Supervisor", "Food Protection Certificate number of a supervisor", "主管的食品保护证书编号"), F("seats", "Operation", "Seats and hours", "座位数与营业时间")],
    attach: [B("Food Protection Certificate", "食品保护证书"), B("Certificate of Occupancy or letter of no objection", "占用证或无异议函"), B("Lease", "租约")],
  },
  {
    id: "nyc-fpc", form: "Food Protection Certificate", title: B("Food Protection Certificate (course and exam)", "食品保护证书（课程与考试）"),
    agency: B("NYC Department of Health and Mental Hygiene", "纽约市卫生与心理健康局"), level: "city", where: "NYC", segments: ["restaurant"], method: "online", order: 70,
    how: B("Free online course, then an in-person exam. A certified supervisor must be on site whenever you are open.", "免费在线课程，之后线下考试。营业时必须有持证主管在场。"),
    url: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page", info: "https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page", renews: B("Does not expire.", "永久有效，无需续期。"), takes: B("Certificate arrives 2 to 6 weeks after the exam.", "考试后 2 至 6 周收到证书。"), takesSource: "https://www.nyc.gov/assets/doh/downloads/pdf/hany/food-protection-course-faq.pdf (2026-10-09)",
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
    id: "nyc-dob-alt", form: "Alteration permit (DOB NOW: Build)", title: B("Building permit for the build-out (DOB alteration)", "装修建筑许可证（建筑局改建许可）"),
    agency: B("NYC Department of Buildings", "纽约市建筑局"), level: "city", where: "NYC", segments: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 52,
    how: B("Department of Buildings work permits are required for most construction; a registered design professional (PE or RA) files the alteration in DOB NOW: Build, and a change of use also amends the Certificate of Occupancy.", "大多数施工都须取得建筑局工程许可；由注册专业人员（PE 或 RA）在 DOB NOW: Build 提交改建申请，改变用途时还须修改占用证。"),
    url: "https://www.nyc.gov/site/buildings/industry/dob-now-build-resources-laa.page", info: "https://www.nyc.gov/site/buildings/property-or-business-owner/renovating-kitchens-bathrooms.page",
    fee: null, feeNote: B("Set by the Department of Buildings' fees for the work.", "按建筑局的工程收费标准计算。"), checked: "page", fields: [],
    plain: B("The city's permit to build out the space, filed by your architect or engineer.", "市政府的场所装修许可，由您的建筑师或工程师提交。"),
  },
  {
    id: "nyc-cb-notice", form: "30-day notice to the community board", title: B("Community board notice for the liquor license", "酒类执照社区委员会通知"),
    agency: B("Your community board (required by the State Liquor Authority)", "所在社区委员会（纽约州酒类管理局要求）"), level: "city", where: "NYC", segments: ["restaurant"], needs: { alcohol: true }, method: "pdf_mail", order: 70,
    how: B("An on-premises license applicant tells its community board it intends to apply 30 days before filing with the SLA, and sends proof of that notice with the application.", "申请堂饮酒类执照者须在向酒类管理局提交前 30 天通知所在社区委员会，并随申请附上已通知的证明。"),
    url: "https://sla.ny.gov/community-board-faqs", info: "https://sla.ny.gov/community-board-faqs",
    fee: 0, takes: B("Notify the board 30 days before filing.", "提交前 30 天通知。"), takesDays: 30, takesSource: "https://sla.ny.gov/community-board-faqs (2026-10-18)", checked: "page", fields: [],
    plain: B("New York City makes you tell the local community board 30 days before you apply for a liquor license.", "纽约市要求在申请酒类执照前 30 天通知当地社区委员会。"),
  },
  {
    id: "ny-sla-rw", form: "Restaurant Wine license (RW 341)", title: B("Restaurant wine license (beer and wine)", "餐厅葡萄酒执照（啤酒与葡萄酒）"),
    agency: B("New York State Liquor Authority", "纽约州酒类管理局"), level: "state", where: "NYC", segments: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71,
    how: B("The SLA's license for a restaurant with a kitchen and a full menu to serve beer and wine, not spirits, on the premises. Serving spirits takes an On-Premises Liquor license instead.", "纽约州酒类管理局为有厨房和完整菜单的餐厅发放的执照，可在店内供应啤酒和葡萄酒，但不含烈酒。供应烈酒须改申请堂饮酒类执照（On-Premises Liquor）。"),
    url: "https://sla.ny.gov/restaurant-license-quick-reference-0", info: "https://ht.nyc-business.nyc.gov/nycbusiness/description/restaurant-wine-license",
    fee: 1060, feeNote: B("$960 for the 2-year license in New York City's counties plus a $100 filing fee (SLA fee chart).", "纽约市各县 2 年期执照费 960 美元，另加 100 美元申请费（酒类管理局收费表）。"),
    renews: B("Every 2 years.", "每 2 年。"), checked: "page", fields: [],
    after: [{ form: "nyc-cb-notice", label: B("Community board notified 30 days before", "已提前 30 天通知社区委员会") }],
    plain: B("The state license to serve beer and wine with meals.", "州政府发放的随餐供应啤酒和葡萄酒的执照。"),
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
    url: "https://bizfileonline.sos.ca.gov/", info: "https://www.sos.ca.gov/business-programs/business-entities/forms", takes: B("Online filings are currently reviewed about 3 days after receipt (mail about 8 days), per the Oct 8, 2026 queue.", "截至 2026 年 10 月 8 日，网上提交约在收到后 3 天内开始审核（邮寄约 8 天）。"), takesSource: "https://www.sos.ca.gov/business-programs/business-entities/processing-times (2026-10-09)", fee: 70,
    renews: B("Statement of Information (LLC-12, $20) within 90 days, then every two years.", "90 天内提交信息声明（LLC-12，20 美元），之后每两年一次。"), checked: "page",
    fields: [F("name", "1", "Limited liability company name", "有限责任公司名称"), F("office", "2a", "Initial street address of designated office in California", "加州指定办公室街道地址"), F("mail", "2b", "Initial mailing address, if different", "邮寄地址（如不同）"), F("agent", "3", "Agent for service of process", "法律文书送达代理人"), F("mgmt", "4", "Management", "管理方式", ["One manager", "More than one manager", "All LLC member(s)"])],
  },
  {
    id: "ca-llc-5", form: "Form LLC-5", title: B("Application to Register a Foreign LLC", "外州/外国 LLC 注册申请"),
    agency: B("California Secretary of State", "加州州务卿"), level: "state", where: "CA", segments: ALL, needs: { foreignEntity: true }, method: "online", order: 12,
    how: B("Filed in bizfile Online with a certificate of good standing from the home state or country.", "在 bizfile Online 提交，并附注册地出具的存续证明。"),
    url: "https://bizfileonline.sos.ca.gov/", info: "https://www.sos.ca.gov/business-programs/business-entities/forms", takes: B("Online filings are currently reviewed about 3 days after receipt (mail about 8 days), per the Oct 8, 2026 queue.", "截至 2026 年 10 月 8 日，网上提交约在收到后 3 天内开始审核（邮寄约 8 天）。"), takesSource: "https://www.sos.ca.gov/business-programs/business-entities/processing-times (2026-10-09)", fee: 70, checked: "page", fields: [],
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
    url: "https://onlineservices.cdtfa.ca.gov/", info: "https://cdtfa.ca.gov/services/registration.htm", renews: B("Does not expire.", "永久有效，无需续期。"), takes: B("Often issued the same day.", "通常可当天发放。"), takesSource: "https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm (2026-10-09)", fee: 0, feeNote: B("Free. CDTFA may ask for a security deposit.", "免费。CDTFA 可能要求缴纳保证金。"), checked: "page",
    fields: [F("legal", "Business", "Ownership type, legal name and FEIN", "所有权类型、法定名称与 FEIN"), F("addr", "Location", "Business location in California", "加州营业地址"), F("sells", "Activity", "What you sell (NAICS)", "销售内容（NAICS）"), F("people", "Owners", "Officers, members or managers", "高管、成员或经理"), F("start", "Sales", "Start date and expected monthly taxable sales", "开始日期与预计月应税销售额")],
  },
  {
    id: "ca-edd-de1", form: "DE 1", title: B("Registration Form for Commercial Employers", "商业雇主登记表"),
    agency: B("California Employment Development Department", "加州就业发展局（EDD）"), level: "state", where: "CA", segments: ALL, needs: { employees: true }, method: "online", order: 60,
    how: B("Register in e-Services for Business within 15 days of paying over $100 in wages.", "支付工资超过 100 美元后 15 天内在 e-Services for Business 登记。"),
    url: "https://edd.ca.gov/en/payroll_taxes/save_time_and_register_online/", pdf: "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de1.pdf", info: "https://edd.ca.gov/en/payroll_taxes/step-3-register-for-a-payroll-tax-account/", takes: B("Mail-in registration takes about 10 to 14 days; online is faster.", "邮寄登记约需 10 至 14 天；网上登记更快。"), takesSource: "https://edd.ca.gov/en/payroll_taxes/step-3-register-for-a-payroll-tax-account/ (2026-10-09)", fee: 0, checked: "page", fields: [],
  },
  {
    id: "ca-abc", form: "Retail alcoholic beverage license (Type 41 on-sale beer and wine; Type 47 with spirits)", title: B("Alcoholic beverage license", "酒类销售执照"),
    agency: B("California Department of Alcoholic Beverage Control", "加州酒类饮料管理局"), level: "state", where: "CA", segments: ["restaurant", "retail"], needs: { alcohol: true }, method: "in_person", order: 71,
    // re-read on ABC's own FAQ 2026-10-18: a Type 41 is "On-Sale Beer & Wine – Eating Place"; on-sale general (Type 47)
    // licenses are limited by county population, which is why many are bought by transfer; ABC's own figure for the
    // investigation is 55 to 65 days, never under 30 (the 3-to-6-month figure was San Francisco's guide, for the whole
    // process). The notice is posted at the premises for 30 days.
    how: B("A restaurant serving beer and wine applies for a Type 41 (on-sale beer and wine, eating place); spirits take a Type 47, whose number is capped by county population, so many are bought from an existing holder by transfer. The notice of application is posted at the premises for 30 days.", "供应啤酒和葡萄酒的餐厅申请 41 类执照（堂饮啤酒和葡萄酒，餐饮场所）；含烈酒须申请 47 类，其数量按县人口设上限，因此多数须向现有持照人受让。申请公告须在场所张贴 30 天。"),
    url: "https://www.abc.ca.gov", info: "https://www.abc.ca.gov/licensing/frequently-asked-questions",
    fee: null, feeNote: B("Set by ABC for the license type and county.", "按执照类型和所在县由酒类管理局核定。"), takes: B("ABC's investigation takes about 55 to 65 days, and the license can't issue in under 30; San Francisco's guide plans 3 to 6 months for the whole process.", "酒类管理局的调查约需 55 至 65 天，且不少于 30 天不得发证；旧金山指南建议整个流程预留 3 至 6 个月。"), takesDays: 65,
    takesSource: "https://www.abc.ca.gov/licensing/frequently-asked-questions (2026-10-18)", checked: "page", fields: [],
    proof: { quote: "Most investigations take approximately 55-65 days, and by law the license cannot be issued for a minimum of 30 days.", checked: "2026-10-18", read: "https://www.abc.ca.gov/licensing/frequently-asked-questions" },
    plain: B("The state license to sell or serve alcohol. It takes months, so it's filed early.", "州政府发放的酒类销售或供应执照。办理需要数月，要尽早申请。"),
  },
  {
    id: "ca-sb54", form: "SB 54 producer registration", title: B("Packaging producer registration (EPR)", "包装生产者登记（生产者延伸责任）"),
    agency: B("CalRecycle, through Circular Action Alliance", "加州资源回收局（经 Circular Action Alliance）"), level: "state", where: "CA", segments: ["seller", "retail", "restaurant"], needs: { imports: true }, method: "portal", order: 47,
    how: B("A producer of packaged goods sold in California applies to participate in Circular Action Alliance's plan, submits an independent producer application, or obtains a small producer exemption; CalRecycle's PEPRS portal or the PRO takes the registration and the reports.",
      "在加州销售包装商品的生产者须申请加入 Circular Action Alliance 的计划、提交独立生产者申请，或取得小型生产者豁免；登记和申报通过加州资源回收局的 PEPRS 系统或生产者责任组织提交。"),
    url: "https://calrecycle.ca.gov/packaging/packaging-epr/producerguidance/", info: "https://calrecycle.ca.gov/packaging/packaging-epr/producerguidance/", fee: null, checked: "page", fields: [],
    plain: B("California's packaging law (SB 54): the brand joins the producer organization, applies on its own, or claims the small producer exemption.", "加州包装法（SB 54）：品牌加入生产者组织、单独申请，或申请小型生产者豁免。"),
    // read 2026-10-21 with curl (the furniture set's second pass); the typo "Actional" is CalRecycle's own
    proof: { quote: "Producers must apply to participate in the PRO (Circular Actional Alliance) plan, submit an independent producer application, or obtain a small producer exemption.", checked: "2026-10-21", read: "https://calrecycle.ca.gov/packaging/packaging-epr/producerguidance/" },
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
    url: "https://finance.lacity.gov/register-new-business", info: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc", takes: B("Temporary certificate issued immediately; permanent one mailed in 4 to 6 weeks.", "临时证书即时发放；正式证书 4 至 6 周内寄出。"), takesSource: "https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc (2026-10-09)", fee: null, feeNote: B("Tax depends on the business class and gross receipts.", "税额取决于业务类别和营业总额。"), renews: B("Renew every year.", "每年续期。"), checked: "page", fields: [],
  },
  {
    id: "lac-plan-check", form: "Retail Food Facility Plan Review Service Request (Rev 11/2025)", title: B("Food facility plan check", "食品设施图纸审查"),
    agency: B("Los Angeles County Department of Public Health, Environmental Health", "洛杉矶县公共卫生局环境卫生处"), level: "county", where: "LAC", segments: ["restaurant"], needs: { buildout: true }, method: "portal", order: 50,
    how: B("Submit plans before building out; approval comes before the public health permit.", "装修施工前提交图纸，获批后才能申请公共卫生许可证。"),
    url: "http://publichealth.lacounty.gov/eh/i-want-to/submit-electronic-plan.htm", pdf: "http://publichealth.lacounty.gov/eh/docs/inspection/retail-food-facility-plan-review-service-request.pdf", info: "http://publichealth.lacounty.gov/eh/inspection/retail-plan-check.htm", takes: B("Plan review within 20 working days.", "图纸审核在 20 个工作日内完成。"), takesSource: "http://publichealth.lacounty.gov/eh/docs/retailplanchecknew.pdf (2026-10-09)", fee: null, checked: "page",
    fields: [
      F("request_date", "Date of Request", "Date of request", "申请日期"),
      F("contact", "Person Submitting: Name", "Person submitting the plans (receives the returned plans)", "提交图纸的人（接收退回的图纸）"),
      F("contact_title", "Person Submitting: Title", "Title of the person submitting", "提交人职务"),
      F("contact_phone", "Person Submitting: Phone #", "Phone of the person submitting", "提交人电话"),
      F("contact_email", "Person Submitting: Email", "Email of the person submitting", "提交人电子邮箱"),
      F("site", "Food Facility Information: Business Name/DBA, Address", "Food facility name (DBA) and address", "食品设施名称（DBA）及地址"),
      F("facility_phone", "Food Facility Information: Phone #", "Food facility phone", "食品设施电话"),
      F("facility_email", "Food Facility Information: Email", "Food facility email", "食品设施电子邮箱"),
      F("owner", "Business Owner/Corporation Name", "Business owner or corporation name", "业主或公司名称"),
      F("owner_phone", "Business Owner: Phone #", "Owner's phone", "业主电话"),
      F("owner_address", "Business Owner: Address", "Owner's address", "业主地址"),
      F("owner_email", "Business Owner: Email", "Owner's email", "业主电子邮箱"),
      F("scope", "Section 1", "Type of plan review", "图纸审查类型", ["Review of NEW construction plans for a food facility", "Review of REMODELING plans for an existing food facility", "Existing food facility, new owner", "Review of Fire Rebuild Plans for a food facility"]),
      F("built_before_2004", "Section 2", "Was the food facility constructed before 1/1/2004?", "该食品设施是否建于 2004 年 1 月 1 日之前？", ["Yes", "No"]),
      F("prepackaged_only", "Section 2", "Prepackaged foods only?", "是否仅销售预包装食品？", ["Yes", "No"]),
      F("reusable_tableware", "Section 2", "Does the facility have re-usable tableware?", "设施是否使用可重复使用的餐具？", ["Yes", "No"]),
      F("common_restroom", "Section 2", "Does the facility have a common-use restroom?", "设施是否有共用洗手间？", ["Yes", "No"]),
      F("common_janitorial", "Section 2", "Does the facility have a common-use janitorial facility?", "设施是否有共用清洁间？", ["Yes", "No"]),
      F("php_number", "For Remodeling Only", "Current Public Health Permit/License number (remodels only)", "现有公共卫生许可证编号（仅限改建）"),
      F("remodel_operation", "For Remodeling Only", "Open or closed during the remodel (remodels only)", "改建期间是否继续营业（仅限改建）", ["The Facility will remain open during remodeling", "The Facility will remain closed during remodeling"]),
      F("remodel_scope", "For Remodeling Only", "Scope of the remodel (remodels only)", "改建范围说明（仅限改建）"),
      F("square_footage", "Section 3", "Facility type and size (fee line)", "设施类型与面积（收费档）", ["Restaurant/Caterer - NEW: 500 Sq. Ft. or less - $1,044.00", "Restaurant/Caterer - NEW: 501 - 1,999 Sq. Ft. - $1,530.00", "Restaurant/Caterer - Remodel: 501 - 1,999 Sq. Ft. - $1,530.00", "Restaurant/Caterer - NEW: 2,000 - 3,999 Sq. Ft. - $1,865.00", "Restaurant/Caterer - Remodel: 2,000 - 3,999 Sq. Ft. - $1,865.00", "Restaurant/Caterer - NEW: 4,000 - 9,999 Sq. Ft. - $2,276.00", "Restaurant/Caterer - Remodel: 4,000 - 9,999 Sq. Ft. - $2,276.00", "Restaurant/Caterer - NEW: 10,000 Sq. Ft. or more - $2,723.00", "Restaurant/Caterer - Remodel: 10,000 Sq. Ft. or more - $2,723.00", "Restaurant/Caterer - Remodel: 300 Sq. Ft. or less - $315.00", "Restaurant/Caterer - Remodel: 301 - 500 Sq. Ft. - $1,044.00", "Food Market - NEW: 25 - 50 Sq. Ft. - $858.00", "Food Market - NEW: 51 - 1,999 Sq. Ft. - $1,119.00", "Food Market - NEW: 2,000 - 5,999 Sq. Ft. - $1,232.00", "Food Market - Remodel: 2,000 - 5,999 Sq. Ft. - $1,232.00", "Food Market - Remodel: 300 Sq. Ft. or less - $315.00", "Food Market - Remodel: 301 - 1,999 Sq. Ft. - $1,119.00"]),
    ], attach: [B("Scaled floor plan, equipment and finish schedules", "按比例绘制的平面图、设备与装修清单"), B("Menu", "菜单")],
  },
  {
    id: "lac-health-permit", form: "Public Health Permit/License Application", title: B("Public health permit (food facility)", "公共卫生许可证（食品设施）"),
    agency: B("Los Angeles County Department of Public Health, Environmental Health", "洛杉矶县公共卫生局环境卫生处"), level: "county", where: "LAC", segments: ["restaurant"], method: "pdf_mail", order: 76,
    how: B("Apply after plan approval and before opening; an inspector visits first.", "图纸获批后、开业前申请，需先通过现场检查。"),
    url: "http://publichealth.lacounty.gov/eh/docs/permit/Public-Health-Permit-License-Application.pdf", pdf: "http://publichealth.lacounty.gov/eh/docs/permit/Public-Health-Permit-License-Application.pdf", info: "http://publichealth.lacounty.gov/eh/inspection/how-to-obtain-restaurant-food-facility-permit.htm", fee: null, renews: B("Every year.", "每年。"), checked: "page",
    fields: [
      F("application_date", "Date of Application", "Date of application", "申请日期"),
      F("first_operation_date", "First Date of Operation", "First date of operation", "首次营业日期"),
      F("application_type", "Select One", "New business or change of ownership", "新开业或所有权变更", ["New Business", "Change of Ownership"]),
      F("business_type", "Business Type", "Business type (one application per type)", "业务类型（每种类型须单独申请）", ["Food Facility", "Mobile Food Facility", "Shared Kitchen Complex", "Vending Machine", "Certified Farmers Market", "Other"]),
      F("business_name", "Legal Name of Business (DBA)", "Business name (DBA)", "营业名称（DBA）"),
      F("business_address", "Business Street Address, Unit, City, Zip", "Business address", "营业地址"),
      F("business_phone", "Phone", "Business phone", "营业电话"),
      F("business_email", "Email Address (for Reports & Communications)", "Business email (inspection reports are sent here)", "营业电子邮箱（检查报告发送至此）"),
      F("website", "Website address", "Website (N/A if none)", "网站（如无请填 N/A）"),
      F("open_time", "Hours of Operation: Open", "Opening time", "开门时间", undefined, B("One time for every day, or seven times Mon to Sun separated by semicolons (Closed for a day off); 24 hours if always open.", "每天相同则填一个时间，否则按周一至周日填七个时间并以分号分隔（休息日填 Closed）；全天营业填 24 hours。")),
      F("close_time", "Hours of Operation: Closed", "Closing time", "打烊时间", undefined, B("One time for every day, or seven times Mon to Sun separated by semicolons.", "每天相同则填一个时间，否则按周一至周日填七个时间并以分号分隔。")),
      F("ownership_type", "Ownership Information: Type", "Type of ownership", "所有权类型", ["Individual/Sole Proprietorship", "Partnership", "LP", "LLP", "Corporation", "LLC"]),
      F("owner1", "Owner 1: Name", "Owner 1 (the person, or the company for an LLC or corporation)", "所有人 1（个人，或 LLC/公司名称）"),
      F("owner1_phone", "Owner 1: Phone", "Owner 1 phone", "所有人 1 电话"),
      F("owner1_email", "Owner 1: Email", "Owner 1 email", "所有人 1 电子邮箱"),
      F("owner2", "Owner 2", "Owner 2, if any (name, phone, email)", "所有人 2（如有；姓名、电话、电子邮箱）"),
      F("emergency_contact", "Emergency Contact: Name", "Emergency contact name", "紧急联系人姓名"),
      F("emergency_phone", "Emergency Contact: Phone", "Emergency contact phone", "紧急联系人电话"),
      F("emergency_email", "Emergency Contact: Email", "Emergency contact email", "紧急联系人电子邮箱"),
      F("billing_address", "Billing Information", "Billing address (or same as the business address)", "账单地址（或与营业地址相同）"),
      F("print_name", "Print Name", "Name of the person signing", "签署人姓名"),
      F("signer_title", "Title", "Title of the person signing", "签署人职务"),
    ],
  },
  {
    id: "la-ladbs", form: "Application for Building Permit and Certificate of Occupancy", title: B("Building permit and Certificate of Occupancy", "建筑许可证与占用证"),
    agency: B("Los Angeles Department of Building and Safety", "洛杉矶建筑与安全局（LADBS）"), level: "city", where: "LA", segments: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 52,
    how: B("Tenant improvements and changes of use go through plan check; a new use gets a new Certificate of Occupancy.", "租户装修和用途变更需图纸审查；新用途需取得新的占用证。"),
    url: "https://dbs.lacity.gov/services/plan-review-permitting/building-permits", info: "https://dbs.lacity.gov/services/plan-review-permitting/building-permits", takes: B("Plans are returned within weeks, depending on workload.", "图纸视工作量在数周内返还。"), takesSource: "https://dbs.lacity.gov/services/plan-review-permitting/plan-check-permit/regular-plan-check (2026-10-09)", fee: null, checked: "page", fields: [],
  },
  {
    id: "la-alcohol-cup", form: "Conditional Use Permit for alcohol sales", title: B("Conditional use permit to sell alcohol", "酒类销售有条件使用许可"),
    agency: B("Los Angeles Department of City Planning", "洛杉矶市规划局"), level: "city", where: "LA", segments: ["restaurant", "retail"], needs: { alcohol: true }, method: "in_person", order: 70,
    how: B("The city's restaurant checklist requires a Conditional Use Permit from City Planning to serve alcohol, alongside the state ABC license; it usually takes at least 4 to 5 months.", "洛杉矶市餐厅清单要求供应酒类须向市规划局申请有条件使用许可，并另取得州酒类执照；通常至少需要 4 至 5 个月。"),
    url: "https://planning.lacity.gov", info: "https://business.lacity.gov/sites/g/files/wph1606/files/2021-02/Restaurant_Bar%20Checklist_0.pdf",
    fee: null, takes: B("Typically at least 4 to 5 months.", "通常至少 4 至 5 个月。"), takesDays: 150, takesSource: "https://business.lacity.gov/sites/g/files/wph1606/files/2021-02/Restaurant_Bar%20Checklist_0.pdf (2026-10-18)", checked: "page", fields: [],
    plain: B("Los Angeles's own zoning approval to sell alcohol at the address, on top of the state license.", "洛杉矶市对该地址销售酒类的分区批准，州执照之外另需办理。"),
  },
  {
    id: "la-lafd-ops", form: "LAFD operational fire permits", title: B("Fire permits for high-piled storage and hazardous materials", "高堆货物与危险品消防许可证"),
    agency: B("Los Angeles Fire Department, Fire Prevention Bureau", "洛杉矶消防局防火处"), level: "city", where: "LA", segments: ["warehouse", "retail"], needs: { hazmat: true }, method: "portal", order: 78,
    how: B("Needed when storage or batteries cross fire code thresholds; inspected before issue.", "储存或电池数量超过消防规范门槛时需要，发证前检查。"),
    url: "https://lafd.org/operational-fire-permits", info: "https://lafd.org/operational-fire-permits", renews: B("Every year.", "每年续期一次。"), fee: null, checked: "page", fields: [],
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
    url: "https://www.sos.state.tx.us/corp/forms/205_boc.pdf", pdf: "https://www.sos.state.tx.us/corp/forms/205_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/205.shtml", takes: B("No standard time published; paid expedited service typically takes 2 to 3 business days.", "未公布标准处理时间；付费加急服务通常需 2 至 3 个工作日。"), takesSource: "https://www.sos.state.tx.us/express.shtml (2026-10-09)", fee: 300, checked: "page",
    fields: [F("name", "Article 1", "Entity name", "实体名称"), F("agent", "Article 2", "Registered agent and Texas registered office", "注册代理人与德州注册办公室"), F("gov", "Article 3", "Governing authority: managers or members, with names and addresses", "管理方式：经理或成员，及其姓名地址"), F("purpose", "Article 4", "Purpose", "经营目的"), F("organizer", "Organizer", "Organizer name and address", "组织人姓名与地址")],
  },
  {
    id: "tx-304", form: "Form 304", title: B("Application for Registration of a Foreign LLC", "外州/外国 LLC 注册申请"),
    agency: B("Texas Secretary of State", "德州州务卿"), level: "state", where: "TX", segments: ALL, needs: { foreignEntity: true }, method: "online", order: 12,
    how: B("Filed in SOSDirect with a certificate of existence from the home jurisdiction.", "通过 SOSDirect 提交，并附注册地出具的存续证明。"),
    url: "https://www.sos.texas.gov/corp/forms/304_boc.pdf", pdf: "https://www.sos.texas.gov/corp/forms/304_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/304.shtml", takes: B("No standard time published; paid expedited service typically takes 2 to 3 business days.", "未公布标准处理时间；付费加急服务通常需 2 至 3 个工作日。"), takesSource: "https://www.sos.state.tx.us/express.shtml (2026-10-09)", fee: 750, checked: "page", fields: [],
  },
  {
    id: "tx-503", form: "Form 503", title: B("Assumed Name Certificate (DBA)", "假定名称证书（DBA）"),
    agency: B("Texas Secretary of State", "德州州务卿"), level: "state", where: "TX", segments: ALL, method: "online", order: 14,
    how: B("Filed when the store trades under a name other than the legal name.", "门店使用与法定名称不同的名称经营时提交。"),
    url: "https://www.sos.state.tx.us/corp/forms/503_boc.pdf", pdf: "https://www.sos.state.tx.us/corp/forms/503_boc.pdf", info: "https://www.sos.state.tx.us/corp/instructions/503.shtml", takes: B("No standard time published; paid expedited service typically takes 2 to 3 business days.", "未公布标准处理时间；付费加急服务通常需 2 至 3 个工作日。"), takesSource: "https://www.sos.state.tx.us/express.shtml (2026-10-09)", fee: 25, renews: B("Valid up to 10 years.", "最长有效 10 年。"), checked: "page", fields: [],
  },
  {
    id: "tx-ap201", form: "AP-201", title: B("Texas Sales and Use Tax Permit Application", "德州销售与使用税许可证申请"),
    agency: B("Texas Comptroller of Public Accounts", "德州审计长办公室"), level: "state", where: "TX", segments: ALL, method: "online", order: 20,
    how: B("Apply online in eSystems before your first sale; one permit for each location.", "首笔销售前通过 eSystems 在线申请，每个门店一张。"),
    url: "https://comptroller.texas.gov/taxes/permit/", info: "https://comptroller.texas.gov/taxes/permit/", renews: B("Does not expire.", "永久有效，无需续期。"), takes: B("Permit arrives in about 2 to 3 weeks.", "约 2 至 3 周收到许可证。"), takesSource: "https://comptroller.texas.gov/taxes/permit/ (2026-10-09)", fee: 0, feeNote: B("Free. A security may be required.", "免费，可能需要缴纳担保金。"), checked: "page", fields: [],
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
    url: "https://www.twc.texas.gov/services/register-tax", info: "https://www.twc.texas.gov/services/register-tax", takes: B("Account number issued instantly online.", "网上登记后即时获得账号。"), takesSource: "https://www.twc.texas.gov/services/register-tax (2026-10-09)", fee: 0, checked: "page", fields: [],
  },

  {
    id: "tx-food-manager", form: "Certified Food Manager certificate (DSHS-licensed exam)", title: B("Certified food manager", "注册食品经理"),
    agency: B("Texas Department of State Health Services", "德州卫生服务部"), level: "state", where: "TX", segments: ["restaurant"], needs: { food: true }, method: "online", order: 40,
    how: B("At least one manager passes an exam from a DSHS-licensed certified food manager program. Local health departments require a certified food manager on site whenever the place is open.", "至少一名经理通过德州卫生服务部认可的注册食品经理考试。当地卫生部门要求营业期间始终有一名注册食品经理在场。"),
    url: "https://www.dshs.texas.gov/food-managers", info: "https://www.dshs.texas.gov/food-managers",
    fee: null, feeNote: B("Set by the exam provider.", "由考试机构定价。"), renews: B("Every 5 years.", "每 5 年。"), checked: "page", fields: [],
  },
  {
    id: "tx-food-handler", form: "Accredited food handler course (each food employee)", title: B("Food handler certificates for staff", "员工食品从业人员证书"),
    agency: B("Texas Department of State Health Services", "德州卫生服务部"), level: "state", where: "TX", segments: ["restaurant"], needs: { food: true, employees: true }, method: "online", order: 42,
    how: B("Every employee who works with unpackaged food, equipment or food-contact surfaces finishes an accredited food handler course within 30 days of hire. Certified food managers are exempt.", "凡接触未包装食品、设备或食品接触面的员工，须在入职 30 天内完成经认可的食品从业人员课程。注册食品经理可免。"),
    url: "https://www.dshs.texas.gov/food-handlers", info: "https://www.dshs.texas.gov/food-handlers/faq.aspx",
    fee: null, feeNote: B("Set by each accredited course.", "由各认可课程定价。"), renews: B("Valid to the date on the card, or 2 years if none.", "有效期以证书所载为准；未载明的为 2 年。"), checked: "page", fields: [],
  },

  /* -------------------------------- Houston -------------------------------- */
  {
    id: "hou-co", form: "Certificate of Occupancy (HPW Code 1106)", title: B("Certificate of Occupancy", "占用证"),
    agency: B("City of Houston, Houston Permitting Center", "休斯顿市许可中心"), level: "city", where: "HOU", segments: ["restaurant", "retail", "warehouse"], method: "pdf_mail", order: 54,
    how: B("Form CE-1045-A, emailed to Occupancy Inspections (Occupancy.Inspections@houstontx.gov); iPermits is only for paying afterwards. Needed for a new tenant use or change of use inside city limits.", "填写 CE-1045-A 表，电邮至占用检查科（Occupancy.Inspections@houstontx.gov）；iPermits 仅用于事后缴费。市内新租户用途或用途变更时需要。"),
    url: "https://www.houstonpermittingcenter.org/hpwcode1106", pdf: "https://www.houstonpermittingcenter.org/media/941/download", info: "https://www.houstonpermittingcenter.org/hpwcode1106", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-sign", form: "On-premises sign permit (HPW Code 1112)", title: B("Sign permit", "招牌许可证"),
    agency: B("City of Houston, Sign Administration", "休斯顿市招牌管理处"), level: "city", where: "HOU", segments: STORES, needs: { signage: true }, method: "portal", order: 80,
    how: B("Filed with the Houston Permitting Center before the sign goes up.", "安装招牌前向休斯顿许可中心提交。"),
    url: "https://www.houstonpermittingcenter.org/hpwcode1112", pdf: "https://www.houstonpermittingcenter.org/media/6006/download", info: "https://houstonpermittingcenter.org/building-code-enforcement/sign-administration", renews: B("Every year.", "每年续期一次。"), takes: B("About 4 to 11 business days.", "约 4 至 11 个工作日。"), takesSource: "https://www.houstonpermittingcenter.org/hpwcode1112 (2026-10-09)", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-buildout", form: "Buildout Permit (HPW Code 1148)", title: B("Buildout permit (building permit for the space)", "装修许可证（场所建筑许可）"),
    agency: B("City of Houston, Houston Permitting Center", "休斯顿市许可中心"), level: "city", where: "HOU", segments: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 52,
    how: B("For building out empty space in a commercial building: plan review and inspections, with the Fire Marshal and the Health Department reviewing where the work calls for it. The permit stays on site until final approval.", "适用于商业建筑内空置场所的装修：须经图纸审查和检查，视工程需要由消防署和卫生局审查。许可证须留在现场直至最终验收。"),
    url: "https://www.houstonpermittingcenter.org/hpwcode1148", info: "https://www.houstonpermittingcenter.org/hpwcode1148",
    fee: null, feeNote: B("A $33.56 admin fee plus the city fee schedule's permit and plan review fees.", "33.56 美元行政费，另按市收费表缴纳许可费和图纸审查费。"), checked: "page", fields: [],
    plain: B("The city's permit to build out the space, reviewed and inspected before you open.", "市政府的场所装修许可，开业前须经审查和检查。"),
  },
  {
    id: "hou-plan-review", form: "Food establishment plan review", title: B("Food establishment plan review", "食品场所图纸审查"),
    agency: B("Houston Health Department", "休斯顿卫生局"), level: "city", where: "HOU", segments: ["restaurant"], needs: { buildout: true }, method: "portal", order: 50,
    how: B("Submit plans before building or remodeling a food establishment.", "新建或改建食品场所前提交图纸。"),
    url: "https://www.houstonhealth.org/food-permits/opening-food-establishment", info: "https://www.houstonhealth.org/food-permits/opening-food-establishment", takes: B("No standard time published; expedited review in 1 to 2 business days.", "未公布标准处理时间；加急审核需 1 至 2 个工作日。"), takesSource: "https://www.houstonhealth.org/media/4206/download (2026-10-09)", fee: null, checked: "page", fields: [],
  },
  {
    id: "hou-food-dealer", form: "Food Dealer permit (HHD1003)", title: B("Food dealer permit", "食品经营许可证"),
    agency: B("Houston Health Department", "休斯顿卫生局"), level: "city", where: "HOU", segments: ["restaurant"], method: "pdf_mail", order: 76,
    how: B("The operating permit, issued after plan review and inspection. The application is emailed to Food-COO@houstontx.gov.", "经营许可证，图纸审查和检查合格后发放。申请表电邮至 Food-COO@houstontx.gov。"),
    url: "https://www.houstonpermittingcenter.org/hhd1003", pdf: "https://www.houstonhealth.org/media/14901/download", info: "https://www.houstonpermittingcenter.org/hhd1003", takes: B("Up to 15 business days.", "最多 15 个工作日。"), takesSource: "https://www.houstonpermittingcenter.org/hhd1003 (2026-10-09)", fee: null, renews: B("Every year.", "每年。"), checked: "page", fields: [],
  },
  {
    id: "hou-fire", form: "Fire prevention permits", title: B("Fire permits for hazardous materials and high-piled storage", "危险品与高堆货物消防许可证"),
    agency: B("Houston Fire Department, Fire Marshal's Office", "休斯顿消防局消防署"), level: "city", where: "HOU", segments: ["warehouse", "retail"], needs: { hazmat: true }, method: "in_person", order: 78,
    how: B("Needed when storage or batteries cross fire code thresholds.", "储存或电池数量超过消防规范门槛时需要。"),
    url: "https://www.houstontx.gov/fire/formsandpermits", info: "https://www.houstonpermittingcenter.org/fire-marshal-office", renews: B("Every year.", "每年续期一次。"), fee: null, checked: "page", fields: [],
  },
];

FORMS.push(...WORLD_FORMS, ...LOCAL_US, ...MORE_US, ...MARKETS_US, ...BEACHHEAD, ...TOP_CITIES, ...FURNITURE_FORMS, ...US_GAPS, ...INTL_FORMS, ...FINISH_FORMS, ...SECTOR_FORMS);

/* County steps are filed under the county (src/forms/usplace.ts), not the city they were first researched for, so every
   city in the county gets them: Alameda County's food permits apply in Fremont as in Oakland, King County's in Bellevue
   as in Seattle, the Southern Nevada Health District's in Henderson as in Las Vegas. */
const COUNTY_OF_FORM: Record<string, string> = {
  "ac-plan-check": "ALA", "ac-health-permit": "ALA", "oc-plan-check": "ORC", "oc-health-permit": "ORC", "sdc-plan-check": "SDC", "sdc-health-permit": "SDC",
  "sacc-plan-review": "SACC", "sacc-health-permit": "SACC", "kc-plan-review": "KC", "sea-food": "KC",
  "snhd-food-handler": "SNHD", "snhd-cfsm": "SNHD", "snhd-plan-review": "SNHD", "lv-food": "SNHD",
  "mc-plan-review": "MARI", "mc-food-permit": "MARI", "mult-plan-review": "MULT", "mult-food-license": "MULT",
  "fulton-plan-review": "FULC", "fulton-food-permit": "FULC", "hc-business-tax": "HILL", "ocfl-business-tax": "ORFL", "mdc-btr": "MDC",
};
for (const f of FORMS) if (COUNTY_OF_FORM[f.id]) f.where = COUNTY_OF_FORM[f.id];
// Edison's plan review fee is in the township code (ecode360), which refuses automated reads; the requirement itself is
// New Jersey's food code, read on nj.gov. Edison's retail food license is linked to the township's own application.
{
  const nj = "https://www.nj.gov/health/ceohs/documents/phfpp/Chapter%2024%20w%20Cottage%20Food%20Rules%201-18-22.pdf";
  const edi = FORMS.find(f => f.id === "edi-plan-review"); if (edi) { edi.info = nj; edi.url = nj; }
  const lic = FORMS.find(f => f.id === "edi-food-license"); if (lic) lic.info = lic.url;
}

/* Processing times for filings whose library entry had none, read from each agency's own page (research/times.json,
   kept as src/forms/times.json). An agency that publishes no time says so in words, with no file-by date from it. */
for (const f of FORMS) {
  const t = (TIMES as Record<string, { en: string; zh: string; days: number | null; source: string }>)[f.id];
  if (t && !f.takes) { f.takes = B(t.en, t.zh); f.takesDays = t.days; f.takesSource = t.source; }
}
// The line-by-line research (src/forms/lines.ts): each form's questions as the agency prints them, the attachments it
// lists, and how it is submitted. It replaces a shorter list of lines, never a longer one.
for (const f of FORMS) {
  const l = LINES[f.id];
  if (!l) continue;
  if (l.fields.length >= f.fields.length) f.fields = l.fields;
  const have = new Set((f.attach ?? []).map(a => a.en.toLowerCase()));
  f.attach = [...(f.attach ?? []), ...l.attach.filter(a => !have.has(a.en.toLowerCase()))];
  if (l.status === "mapped") f.checked = "form";
  f.lines = { status: l.status, read: l.read, seen: l.seen, sources: l.sources, submit: { email: l.submit.email, fax: l.submit.fax, portal: l.submit.portal, signature: l.submit.signature, source: l.submit.source } };
}
// The forms Placetta fills on the agency's own PDF by a box map (src/forms/maps): a map lists the form's lines as printed
// on that PDF, with the agency's link to it. They replace a shorter list of lines, never a longer one.
for (const f of FORMS) {
  const m = MAPS[f.id];
  if (!m) continue;
  if (m.url && !f.pdf) f.pdf = m.url;
  if (!m.lines?.length || m.lines.length < f.fields.length) continue;
  f.fields = m.lines.map(l => ({ id: l.id, line: l.line, label: B(l.en, l.zh), ...(l.options ? { options: l.options } : {}), ...(l.hint ? { hint: B(l.hint.en, l.hint.zh) } : {}) }));
  f.checked = "form";
}
// What each form is, the way a person would say it (src/forms/plain.ts): shown on the instant plan a new workspace starts with.
for (const f of FORMS) { const p = PLAIN[f.id]; if (p && !f.plain) f.plain = p; }
// The sentence on each source page that states the requirement, with the day it was read (src/forms/proof.ts). A proof
// read from another page than the one linked moves the link to that page, so the link and the quote always match.
for (const f of FORMS) { const p = PROOF[f.id]; if (p && !f.proof) { f.proof = p; if (p.link && p.link !== (f.info || f.url)) f.info = p.link; } }

// The source audit (src/forms/audit.ts): links moved to the pages the agencies use now, proofs whose page is gone replaced
// or taken away. Last, so it wins over every layer above.
// then the finishing pass's proofs for entries already in the library (src/forms/finish.ts)
export const AUDIT_MISSING = [...applyFixes(FORMS), ...applyFixes(FORMS, FINISH_FIXES)];

export const formById = (id: string) => FORMS.find(f => f.id === id);

/** What kind of business it is, from what it sells. */
export function segmentOf(text: string): Segment {
  const t = text.toLowerCase();
  if (/warehouse|3pl|fulfil|logistic|freight|仓|物流|货代/.test(t)) return "warehouse";
  // furniture before food: a "coffee table", a "bar stool", a "kitchen cabinet" or "teak" isn't a food business. A
  // showroom or store is retail; a brand that only imports is a seller; a furniture warehouse took the warehouse path above
  if (FURNITURE.test(t)) return /showroom|store|retail|gallery|shop|门店|展厅/.test(t) || !/import|e-?commerce|online|amazon|seller|wholesal|跨境|电商|进口|批发/.test(t) ? "retail" : "seller";
  if (/import|e-?commerce|amazon|seller|shein|temu|tiktok shop|跨境|电商|卖家|进口/.test(t)) return "seller";
  if (/tea|coffee|restaurant|food|kitchen|bakery|hot ?pot|malatang|noodle|dessert|ice cream|bubble|cafe|\bbar\b|\bpub\b|tavern|brewery|奶茶|茶|咖啡|餐|火锅|麻辣烫|面|甜品|烘焙|食|酒吧/.test(t)) return "restaurant";
  return "retail";
}

const NYC = /\b(new york city|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|astoria|long island city|elmhurst|sunset park|chinatown, ny)\b|纽约市|法拉盛|曼哈顿|皇后区|布鲁克林/i;
/** A New York City address: a borough or neighborhood by name, "New York, NY" (Manhattan's postal city), or a
    New York ZIP code inside the five boroughs (100-104 Manhattan, Bronx and Staten Island; 111-114 and 116 Queens and
    Brooklyn; 11004-11005 Glen Oaks and Floral Park, Queens). */
const NYC_HOOD = /\b(jackson heights|forest hills|bayside|jamaica|corona|sunnyside|ridgewood|woodside|rego park|fresh meadows|whitestone|college point|williamsburg|bushwick|bensonhurst|bay ridge|park slope|greenpoint|harlem|tribeca|soho|chelsea|midtown|financial district|lower east side|upper (east|west) side)\b/;
function inNYC(w: string, ny: boolean): boolean {
  if (NYC.test(w) || /\bnew york,?\s*(ny|new york)\b/.test(w)) return true;
  if (!ny) return false;
  return /\b(10[0-4]\d\d|11[1-4]\d\d|116\d\d|1100[45])(-\d{4})?\b/.test(w) || NYC_HOOD.test(w);
}
/** Places in unincorporated Clark County, Nevada (licensed by the county, not a city): the Strip and the towns around it. */
const CLARK_UNINCORPORATED = /\b(paradise|spring valley|enterprise|winchester|sunrise manor|whitney|summerlin south|unincorporated clark|las vegas (blvd|boulevard) s(outh)?|the strip)\b|拉斯维加斯大道/;
/** Where it is: the jurisdictions whose forms apply, at home and abroad. */
export function placesOf(place: string): Where[] {
  const where = unaccent(place);
  const w = where.toLowerCase();
  const world = worldPlaces(where);
  const abroad = !!world.country && world.country.code !== "US";
  const out: Where[] = abroad ? [] : ["US"];
  // the city as the address gives it (the street line dropped: "2140 Dallas Pkwy, Plano" is in Plano, not Dallas)
  const up = abroad ? undefined : usPlace(where);
  const loc = (up?.locality ?? where).toLowerCase(), city = up?.city?.toLowerCase();
  if (!abroad) {
    const ny = NYC.test(loc) || /,\s*ny\b|new york|纽约/.test(loc) || up?.state === "NY";
    if (ny) out.push("NY");
    if (inNYC(loc, ny)) out.push("NYC");
    if (up?.state === "CA" || /,\s*ca\b|california|加州|los angeles|洛杉矶|san francisco|\bsf\b|旧金山|san jose|圣何塞|irvine|arcadia|alhambra|san gabriel/.test(loc)) out.push("CA");
    // the City of Los Angeles itself (its own business tax, LADBS and alcohol CUP); other county cities get the county's steps
    if (city ? /^(los angeles|la)$/.test(city) : /los angeles|洛杉矶|\bla\b/.test(loc)) out.push("LA", "LAC");
    if (up?.state === "TX" || (!up?.state && /texas|德州|houston|休斯顿|dallas|达拉斯|austin|奥斯汀/.test(loc))) out.push("TX");
    if (city ? city === "houston" : /houston|休斯顿/.test(loc)) out.push("HOU");
  }
  for (const code of world.codes) if (!out.includes(code) && code !== "US") out.push(code);
  if (!abroad) {
    // the county whose health department, business tax or building office applies (src/forms/usplace.ts); a city that
    // runs its own health department (Pasadena, Long Beach, Berkeley) doesn't take the county's food steps
    const st = up?.state ?? world.city?.state;
    const c = up?.county ? up : world.city?.state ? countyFor(world.city.en, world.city.state) : undefined;
    if (c?.county && !c.ownHealth && !out.includes(c.county.code)) out.push(c.county.code);
    if (c?.county?.code === "LAC" && c.unincorporated) out.push("LACU");
    if (st && /^[A-Z]{2}$/.test(st) && !out.includes(st)) out.push(st);
  }
  // A "Las Vegas" address is in the City of Las Vegas or in unincorporated Clark County (the Strip is in Paradise), and
  // each licenses its own businesses; Henderson and North Las Vegas license their own too. The Health District's steps
  // (where "SNHD") apply across the county either way.
  // ZIP codes wholly outside city limits (the Strip's 89109, 89119, 89169) count as unincorporated too.
  const clarkTown = CLARK_UNINCORPORATED.test(w) || /\b891(09|19|69)\b/.test(w);
  if (!abroad && clarkTown && out.includes("NV") && !out.includes("SNHD")) out.push("SNHD");
  if (out.includes("SNHD") || out.includes("LV")) {
    if (clarkTown || up?.unincorporated) out.push("CLK");
    else if (city ? city === "las vegas" : /las vegas|拉斯维加斯/.test(loc) && !/north las vegas|henderson/.test(loc)) out.push("LVC");
  }
  // Santa Clara County runs food permits for San José and the rest of the county
  if (!abroad && out.includes("SJ") && !out.includes("SCC")) out.push("SCC");
  if (!abroad && out.includes("SCC") && !out.includes("CA")) out.push("CA");
  return out;
}

/** What the library knows about a place: its country, its city, and whether the city has its own local steps. */
export function placeInfo(place: string) {
  const where = unaccent(place);
  const p = worldPlaces(where);
  const us = !p.country || p.country.code === "US";
  const loc = us ? usPlace(where).locality : where;
  const usLocal = us && /new york|nyc|flushing|manhattan|brooklyn|queens|los angeles|洛杉矶|houston|休斯顿|纽约|法拉盛/i.test(loc);
  // a city counts as covered only when the library actually holds its own steps: a city-level form for the place, or a
  // form filed under the city's own code (Arlington's and Fairfax County's are county-run). The hand-set "guide" flag
  // alone used to hide a city whose forms were missing, so it got neither its steps nor a row saying whom to ask.
  const places = us ? placesOf(place) : [], st = us ? usPlace(where).state ?? p.city?.state : undefined;
  const own = !us || FORMS.some(f => places.includes(f.where) && f.where !== "US" && (f.where === p.city?.code || (f.where !== st && f.level === "city")));
  return { country: p.country?.code ?? (us ? "US" : undefined), city: p.city, local: (p.known || usLocal) && own, currency: p.country?.currency ?? "USD" };
}

/** A form of a US jurisdiction (priced in dollars) at a place abroad: Israel's country code is also Illinois's, so
    Tel Aviv must not pick up Illinois's forms. */
const usFormAbroad = (f: OfficialForm, places: Where[]) => !places.includes("US") ? (!f.currency || f.currency === "USD")
  // and the other way: Delaware's code is Germany's ("DE"), so a Delaware address must not pick up Germany's forms
  : !!f.currency && f.currency !== "USD";

/** The forms an opening needs, in the order they're filed. */
export function formsFor(o: { segment: Segment; where: string; needs?: Needs }): OfficialForm[] {
  const places = placesOf(o.where), have = o.needs ?? {};
  return FORMS.filter(f => places.includes(f.where) && !(f.except ?? []).some(x => places.includes(x)) && !usFormAbroad(f, places) && f.segments.includes(o.segment)
    && Object.keys(f.needs ?? {}).every(k => needMet(f, k as keyof Needs, have)) && !(f.unless ?? []).some(k => have[k]))
    .sort((a, b) => (formsEntity(a) ? 5 : a.order) - (formsEntity(b) ? 5 : b.order));
}

/** Whether a form's need is met. A state's registration for a company formed elsewhere (needs foreignEntity, level
 *  state) applies both to a company from another US state (outOfState: a California LLC opening in New York) and to one
 *  from another country; the federal filings for foreign-owned companies (Form 5472, the BOIR) only to the second. */
export function needMet(f: OfficialForm, k: keyof Needs, have: Needs): boolean {
  if (k === "foreignEntity" && f.level !== "federal") return !!(have.foreignEntity || have.outOfState);
  return !!have[k];
}

/** A form that creates the company itself: filed first, since the EIN and every registration carry its name and number
    (the IRS: "form your entity through the secretary of state before you apply for an EIN"). */
export function formsEntity(f: OfficialForm): boolean {
  return !!f.needs?.newEntity && f.id !== "ny-dos-pub";
}

/** Search the library: by words in the form number, title or agency, and by place and segment. */
export function searchForms(q: { text?: string; where?: string; segment?: Segment }): OfficialForm[] {
  const places = q.where ? placesOf(q.where) : null;
  const words = (q.text ?? "").toLowerCase().split(/\s+/).filter(w => w.length > 1);
  return FORMS.filter(f => (!places || (places.includes(f.where) && !usFormAbroad(f, places))) && (!q.segment || f.segments.includes(q.segment))
    && words.every(w => `${f.form} ${f.title.en} ${f.title.zh} ${f.agency.en} ${f.agency.zh} ${f.id}`.toLowerCase().includes(w)))
    .sort((a, b) => a.order - b.order);
}

export const METHOD: Record<Method, Bi> = {
  online: B("Filed online", "在线提交"), pdf_mail: B("Paper form, mailed", "纸质表格邮寄"), pdf_fax: B("Paper form, faxed or mailed", "纸质表格传真或邮寄"),
  portal: B("Filed on the agency's portal", "在机构门户提交"), in_person: B("Filed in person", "现场办理"), insurer: B("Through your insurer", "通过保险公司办理"), none: B("Nothing to file", "无需申报"),
};
