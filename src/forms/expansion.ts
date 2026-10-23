// The cities Chinese companies are expanding into that the guides didn't cover yet, from the destinations MOFCOM's
// outward FDI statistics, MERICS and Rhodium Group's tracking of Chinese FDI in Europe and the Austrian National Bank's
// study of Chinese outward greenfield FDI name (Hong Kong and Singapore first by stock and flow; Southeast Asia, the
// Gulf, Hungary, Spain, Mexico, Brazil, Egypt, Morocco and Australia among the rest). A city becomes a guide city only
// when the registry holds verified rows for it: a national company step and a tax registration, each quoted from the
// government's own page, and a local step (a food permit or a city licence) where the city isn't itself the state.
//
// Read 2026-10-23 with curl, each quote under 25 words copied from the page as fetched (scripts/eval/proof-read.py).
// Added: Hong Kong, Australia (Sydney, Melbourne). Verified: Singapore's GST and food shop licence, Malaysia's SSM
// incorporation. The cities left out, and why, are in docs/COVERAGE.md and the commit that added this file.
import type { Fix } from "./audit";
import type { OfficialForm, Segment } from "./registry";
import { E, type EuEntry } from "./europe";

export const READ_EXP = "2026-10-23";
/** An entry read in this pass: E (src/forms/europe.ts) with this pass's read date on its proof. */
const X = (o: EuEntry): OfficialForm => { const f = E(o); if (f.proof) f.proof.checked = READ_EXP; return f; };
const STORES: Segment[] = ["restaurant", "retail"];

/* ------------------------------------------------------------------ Hong Kong */
const HK_BR = "https://www.ird.gov.hk/eng/pdf/pam17.pdf";
const HK_CR = "https://www.cr.gov.hk/en/faq/local-company/incorporation.htm";
const HK_FEHD = "https://www.fehd.gov.hk/english/licensing/guide.html";

/* ------------------------------------------------------------------ Australia */
const AU_COMPANY = "https://ablis.business.gov.au/service/ag/register-a-company/67";
const AU_ABN = "https://business.gov.au/registrations/register-for-an-australian-business-number-abn";
const AU_GST = "https://business.gov.au/registrations/register-for-taxes/register-for-goods-and-services-tax-gst";
const SYD_FOOD = "https://ablis.business.gov.au/service/nsw/food-business-notification-council-of-the-city-of-sydney/46323";
const MEL_FOOD = "https://ablis.business.gov.au/service/vic/registration-notification-of-fixed-food-premises/28955";

/* ------------------------------------------------------------------ Singapore and Malaysia (entries already in src/forms/intl.ts) */
const SG_GST = "https://www.iras.gov.sg/taxes/goods-services-tax-%28gst%29/gst-registration-deregistration/do-i-need-to-register-for-gst";
const SG_FOOD = "https://www.sfa.gov.sg/food-retail/licensing-permits/food-shop-licence";
const MY_SSM = "https://ssm.com.my/Pages/Register_Business_Company_LLP/Company/Starting_Company.aspx";

export const EXPANSION_FORMS: OfficialForm[] = [
  X({ id: "hk-cr-incorporate", where: "HK", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "HKD",
    form: "Incorporation Form (Form NNC1)", title: ["Company incorporation with the Companies Registry", "向公司注册处注册成立公司"],
    agency: ["Hong Kong Companies Registry", "香港公司注册处"],
    how: ["Filed with the Companies Registry, online through its e-Filing services or on paper, with the articles of association and the notice to the Business Registration Office (IRBR1); the business registration is applied for at the same time.", "通过公司注册处电子提交服务或以纸质方式提交，附组织章程细则及致商业登记署通知书（IRBR1）；商业登记同时申请。"],
    url: HK_CR, plain: ["Forms the Hong Kong company; its number goes on every other filing.", "设立香港公司，公司编号会用在其他所有申请上。"],
    proof: [HK_CR, "The application documents include: Incorporation Form - Form NNC1 (for company limited by shares)"] }),
  X({ id: "hk-ird-br", where: "HK", level: "federal", method: "online", order: 20, cur: "HKD",
    form: "Business registration (Business Registration Ordinance, Cap. 310)", title: ["Business registration with the Inland Revenue Department", "向税务局商业登记署办理商业登记"],
    agency: ["Inland Revenue Department, Business Registration Office", "税务局商业登记署"],
    how: ["Every business carried on in Hong Kong registers with the Business Registration Office; a company incorporated locally applies with its incorporation form, and the certificate is displayed at the place of business.", "在香港经营的每项业务须向商业登记署登记；本地注册成立的公司随注册成立表格一并申请，登记证须在营业地点展示。"],
    url: HK_BR, renews: ["Renewed before the current certificate expires.", "须在现有登记证到期前续期。"],
    proof: [HK_BR, "every person carrying on business in Hong Kong must register his business with the Business Registration Office of the Inland Revenue Department."] }),
  X({ id: "hk-fehd-restaurant", where: "HK", level: "city", segs: ["restaurant"], needs: { food: true }, method: "in_person", order: 75, cur: "HKD",
    form: "General Restaurant Licence (and Provisional General Restaurant Licence)", title: ["Restaurant licence", "食肆牌照"],
    agency: ["Food and Environmental Hygiene Department (FEHD)", "食物环境卫生署（食环署）"],
    how: ["Applied for with the FEHD with a layout plan of the premises; a provisional licence lets a restaurant open while the full licence's conditions are completed. A light refreshment restaurant licence covers a narrower menu.", "向食环署申请，附处所平面图；暂准牌照可让餐厅在完成正式牌照条件期间先行营业。小食食肆牌照适用于较有限的菜单。"],
    url: HK_FEHD, proof: [HK_FEHD, "General Restaurant Licence and Provisional General Restaurant Licence"] }),

  X({ id: "au-asic-company", where: "AU", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "AUD",
    form: "Company registration (Form 201)", title: ["Company registration with ASIC", "向澳大利亚证券和投资委员会（ASIC）注册公司"],
    agency: ["Australian Securities and Investments Commission (ASIC)", "澳大利亚证券和投资委员会（ASIC）"],
    how: ["A company is registered with ASIC, online through the Business Registration Service or a private provider, and gets its Australian Company Number (ACN).", "公司须向 ASIC 注册（通过商业登记服务在线办理或经私营服务商），并取得澳大利亚公司编号（ACN）。"],
    url: AU_COMPANY, plain: ["Forms the Australian company; its ACN goes on every other filing.", "设立澳大利亚公司，ACN 会用在其他所有申请上。"],
    proof: [AU_COMPANY, "If you decide to adopt a company as your business structure, you must register it with the Australian Company Register,"] }),
  X({ id: "au-abn", where: "AU", level: "federal", method: "online", order: 20, cur: "AUD", fee: 0,
    form: "Australian Business Number (ABN) application", title: ["Australian Business Number (ABN)", "澳大利亚商业编号（ABN）"],
    agency: ["Australian Business Register (Australian Taxation Office)", "澳大利亚商业登记处（澳大利亚税务局）"],
    how: ["Applied for online with the Australian Business Register, free; the business uses it on invoices and to register for GST.", "向澳大利亚商业登记处在线免费申请；企业在发票上使用，并凭其登记 GST。"],
    url: AU_ABN, proof: [AU_ABN, "It’s free to register for an ABN through the Australian Government’s Australian Business Register (ABR)."] }),
  X({ id: "au-gst", where: "AU", level: "federal", method: "online", order: 21, cur: "AUD", fee: 0,
    form: "GST registration", title: ["GST registration", "商品及服务税（GST）登记"],
    agency: ["Australian Taxation Office", "澳大利亚税务局"],
    how: ["A business registers for GST once its GST turnover reaches $75,000 (or expects to in its first year), online through the ATO or with the ABN.", "企业 GST 营业额达到 75,000 澳元（或预计首年达到）时须登记 GST，可通过 ATO 在线办理或在申请 ABN 时一并办理。"],
    url: AU_GST, proof: [AU_GST, "You must register for GST if: your business has a GST turnover of $75,000 or more"] }),
  X({ id: "syd-food-notification", where: "AU-SYD", level: "city", segs: STORES, needs: { food: true }, method: "online", order: 75, cur: "AUD",
    form: "Food business notification", title: ["Food business notification", "食品企业通报"],
    agency: ["City of Sydney (or the NSW Food Authority)", "悉尼市政府（或新南威尔士州食品管理局）"],
    how: ["A food business notifies the council or the NSW Food Authority before it opens; the City of Sydney takes notifications for retail food businesses in its area and inspects them.", "食品企业须在开业前向市政府或新南威尔士州食品管理局通报；悉尼市政府受理其辖区零售食品企业的通报并进行检查。"],
    url: SYD_FOOD, proof: [SYD_FOOD, "You will need to notify either your council or the NSW Food Authority if you intend to operate a food business."] }),
  X({ id: "mel-food-registration", where: "AU-MEL", level: "city", segs: STORES, needs: { food: true }, method: "in_person", order: 75, cur: "AUD",
    form: "Registration or notification of fixed food premises (Food Act 1984)", title: ["Food premises registration or notification", "食品场所登记或通报"],
    agency: ["City of Melbourne", "墨尔本市政府"],
    how: ["Registered with (or, for the lowest-risk class, notified to) the City of Melbourne before the premises open; the class follows the food handled, and the council may inspect the premises first.", "开业前向墨尔本市政府登记（最低风险类别为通报）；类别取决于所处理的食品，市政府可能先检查场所。"],
    url: MEL_FOOD, feeNote: ["Set by class and size: for 2026-27, class 1 and 2 registration is $1,133.00 (small) to $2,029.10 (large).", "按类别和规模收费：2026-27 年度，第 1、2 类登记为 1,133.00 澳元（小型）至 2,029.10 澳元（大型）。"],
    renews: ["Every year (registration).", "每年一次（登记）。"],
    proof: [MEL_FOOD, "You will need this registration or notification if you intend to operate a food business from a fixed food premises,"] }),
];

/** Proofs for entries already in the registry (src/forms/intl.ts), read in this pass. */
const P = (id: string, read: string, quote: string, why: string, extra: Partial<Fix> = {}): Fix => ({ id, info: read, proof: { read, quote, checked: READ_EXP }, why, ...extra });
export const EXPANSION_FIXES: Fix[] = [
  P("sg-gst", SG_GST, "You must register for GST if your taxable turnover is:", "Proof from IRAS's own page on compulsory GST registration."),
  P("sg-sfa-food-shop", SG_FOOD, "The Food Shop Licence costs $195 and is valid for 1 year.", "Proof and fee from the Singapore Food Agency's food shop licence page.",
    { url: SG_FOOD, fee: 195, feeNote: { en: "$195, valid for one year.", zh: "195 新元，有效期一年。" } }),
  P("my-ssm", MY_SSM, "The incorporation of companies under the Companies Act 2016 may be made by individuals who intend to form a company.", "Proof from SSM's own page on starting a company.",
    { url: MY_SSM }),
];
