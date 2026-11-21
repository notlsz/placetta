// Company formation and foreign qualification, Kentucky onward (alphabetical; src/forms/entity-data-2.ts has Alabama to
// Kansas and DC). Same rules as src/forms/entity-data.ts.
import type { CustomTier, StateData, Tier } from "./entities";

/* ------------------------------------------------------------------ Kentucky */
const KY_FEES = "https://www.sos.ky.gov/bus/business-filings/Pages/Fees.aspx";
const KY_AR = "https://www.sos.ky.gov/bus/business-filings/Pages/Annual-Reports.aspx";
const KY_FOREIGN = [KY_FEES, "Foreign Corporation or Limited Liability Company (Profit, Non-Profit or Professional Service) Application for Certificate of Authority: $90.00"] as const;

/* ------------------------------------------------------------------ Louisiana: the fee schedule effective October 1, 2026 */
const LA_FEES = "https://static.sos.la.gov/shared/fee_changes_2026.pdf";
const LA_X: (Tier | CustomTier)[] = [
  { label: ["24-hour (expedite)", "24 小时加急"], turn: ["within 24 hours, for pick-up or mail", "24 小时内办结，可自取或邮寄"], hours: 24, fee: 35,
    q: [LA_FEES, "Documents processed within 24 hours available for pick-up or mail. Referred to $35 as \"expedite.\""] },
  { label: ["While you wait (priority expedite)", "现场立等（优先加急）"], turn: ["while you wait", "现场立等办结"], hours: null, fee: 60,
    q: [LA_FEES, "Documents processed while you wait. Referred to as \"priority expedite or waiting.\" $60"] },
];

/* ------------------------------------------------------------------ Maine: the LLC Act's and the Business Corporation Act's fee sections */
const ME_LLC_FEES = "https://legislature.maine.gov/statutes/31/title31sec1680.html";
const ME_CORP_FEES = "https://legislature.maine.gov/statutes/13-c/title13-Csec123.html";
const ME_FORMS = "https://www.maine.gov/sos/corporations-commissions/i-need-a-business-form/limited-liability-company-forms";
const ME_LLC6 = "https://www.maine.gov/sos/sites/maine.gov.sos/files/inline-files/mllc6.pdf";

/* ------------------------------------------------------------------ Maryland */
const MD_FEES = "https://dat.maryland.gov/Documents/Accessible%20Documents/Charter%20-%20Resource%20Docs/List%20of%20Fees%20for%20Charter%20Services%20and%20Document%20Filings_0326-A.pdf";

/* ------------------------------------------------------------------ Michigan */
const MI_FEES = "https://www.michigan.gov/-/media/Project/Websites/lara/cscl/Folder6/Filing_Fees.pdf?rev=db2522dff4d445a581c925e6f840d3f8";
const MI_701 = "https://www.michigan.gov/lara/-/media/Project/Websites/lara/cscl/NonImages_new/Corps/forms/llc/701-0725.pdf?rev=ddcdc292b70b4173a9b1dbc768a0db37&hash=0200673293E4E4D7CFCDFA58ABBC3012";
const MI_X: (Tier | CustomTier)[] = [
  ["24h", 50, [MI_701, "24-hour service - $50 for formation documents and applications for certificate of authority."]],
  ["same", 100, [MI_701, "Same day - $100 for formation documents and applications for certificate of authority."]],
  ["2h", 500, [MI_701, "Two hour - $500"]],
  ["1h", 1000, [MI_701, "One hour - $1000"]],
];

/* ------------------------------------------------------------------ Minnesota */
const MN_FEES = "https://www.sos.mn.gov/media/1687/businessentityfees.pdf";
const MN_ONLINE: readonly [string, string] = ["Online or in person; $20 less by mail.", "在线或现场提交；邮寄便宜 20 美元。"];

/* ------------------------------------------------------------------ Mississippi to Oregon */
const MS_FEES = "https://www.sos.ms.gov/content/documents/Business/FeeSchedule.pdf";
const MO_BIZ = "https://www.sos.mo.gov/business/corporations/business.asp";
const MT_FEES = "https://sosmt.gov/business/fees/";
const NE_FEES = "https://sos.nebraska.gov/business-services/forms-and-fee-information";
const NE_FLLC = "https://sos.nebraska.gov/sites/sos.nebraska.gov/files/doc/Form%20Cert%20of%20Authority%20Foreign%20LLC_7.01.2021.pdf";
const NE_ONLINE: readonly [string, string] = ["$100 online; $110 in the office.", "在线 100 美元；现场 110 美元。"];
const NC_FEES = "https://sosnc.gov/fees/by_title/_Business_Registration/";
const NC_EXP = "https://www.sosnc.gov/manual/register_a_foreign_business/expedited";
const ND_LLC = "https://ndlegis.gov/cencode/t10c32-1.pdf";
const ND_CORP = "https://ndlegis.gov/cencode/t10c19-1.pdf";
const ORC_FEES = "https://codes.ohio.gov/ohio-revised-code/section-111.16";
const OK_FEES = "https://www.sos.ok.gov/business/fees.aspx";
const OR_DBC = "https://sos.oregon.gov/business/documents/business-registry-forms/dbc-articles.pdf";
const OR_FLLC = "https://sos.oregon.gov/business/Documents/business-registry-forms/fllc-authority.pdf";
const OR_FBC = "https://sos.oregon.gov/business/Documents/business-registry-forms/fbc-authority.pdf";

/* ------------------------------------------------------------------ Rhode Island to Wyoming */
const RI_FEES = "https://docs.sos.ri.gov/documents/BusinessServices/business-forms-fee-schedule.pdf";
const SC_CODE = "https://www.scstatehouse.gov/code/t33c001.php";
const SC_LLC = "https://www.scstatehouse.gov/code/t33c044.php";
const SC_FEE_NOTE: readonly [string, string] = ["The Secretary's fee page couldn't be read, so no fee is stated.", "未能读取州务卿收费页面，因此未列费用。"];
const SD_FEES = "https://sdsos.gov/general-information/filing-fees.aspx";
const SD_PAPER: readonly [string, string] = ["Filed online; $15 more on paper.", "在线提交；纸质另加 15 美元。"];
const TN_FEES = "https://sos.tn.gov/businesses/services/business-forms-fees";
const TN_LLC_NOTE: readonly [string, string] = ["At least $300: the Secretary's list marks it with an asterisk (the fee counts the members).", "至少 300 美元：州务卿的列表以星号标注（费用按成员人数计算）。"];
const UT_FEES = "https://commerce.utah.gov/wp-content/uploads/2023/04/currentfees.pdf";
const VT_FEES = "https://sos.vermont.gov/business-services/fees-statutes";
const VA_TYPES = "https://www.scc.virginia.gov/businesses/new-business-resources/business-types/";
const VA_759 = "https://www.scc.virginia.gov/media/sccvirginiagov-home/business-home/forms-and-fees/foreign-corporations/scc759.pdf";
const VA_CORP_NOTE: readonly [string, string] = ["$25 filing fee plus the charter (entrance) fee: $50 for each 25,000 authorized shares, up to 1 million shares.", "25 美元申请费，另加章程（准入）费：每 25,000 股授权股份 50 美元，最多 100 万股。"];
const WV_FEES = "https://sos.wv.gov/media/335/download?inline=";
const WV_AR = "https://sos.wv.gov/business/updates-and-changes/annual-reports";
const WI_502 = "https://dfi.wi.gov/Documents/BusinessServices/BusinessEntities/Forms/CORP502.pdf";
const WI_2 = "https://dfi.wi.gov/Documents/BusinessServices/BusinessEntities/Forms/CORP2.pdf";
const WI_521 = "https://dfi.wi.gov/Documents/BusinessServices/BusinessEntities/Forms/CORP521.pdf";
const WI_21 = "https://dfi.wi.gov/Documents/BusinessServices/BusinessEntities/Forms/CORP21.pdf";
const WY_FEES = "https://sos.wyo.gov/Business/docs/BusinessFees.pdf";

export const LATER_STATES: StateData[] = [
  {
    st: "KY", name: ["Kentucky", "肯塔基州"], agency: ["Kentucky Secretary of State, Business Filings", "肯塔基州州务卿商业登记处"],
    site: KY_FEES,
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 15, due: ["By June 30 each year", "每年 6 月 30 日前"],
        q: [KY_AR, "Domestic entities that fail to file their annual reports by June 30 are administratively dissolved,"], feeQ: [KY_AR, "Your annual report must be signed, dated and accompanied by a $15 filing fee."] },
      corp: { name: ["Annual Report", "年度报告"], fee: 15, due: ["By June 30 each year", "每年 6 月 30 日前"],
        q: [KY_AR, "Domestic entities that fail to file their annual reports by June 30 are administratively dissolved,"], feeQ: [KY_AR, "Your annual report must be signed, dated and accompanied by a $15 filing fee."] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (profit limited liability company, Form KLC)", fee: 40,
        url: "https://web.sos.ky.gov/forms/corp/KLC-Articles%20of%20Organization-Profit%20Limited%20Liability%20Company.pdf",
        proof: [KY_FEES, "Domestic Limited Liability Company (Profit, Non-Profit or Professional Service) Articles of Organization: $40.00"] },
      "corp-form": { form: "Articles of Incorporation (profit corporation)", fee: 40, feeNote: ["$40, plus the organization tax on the authorized shares (KRS 136.060).", "40 美元，另加按授权股份计算的组织税（KRS 136.060）。"],
        proof: [KY_FEES, "Domestic Corporations (Profit and Professional Service) Articles of Incorporation: $40.00"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 90, proof: KY_FOREIGN,
        report: null },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation)", fee: 90, proof: KY_FOREIGN,
        url: "https://www.sos.ky.gov/bus/Forms/Documents/COA.PDF", report: null },
    },
  },
  {
    st: "LA", where: "LOU", name: ["Louisiana", "路易斯安那州"], agency: ["Louisiana Secretary of State, Commercial Division", "路易斯安那州州务卿商业处"],
    site: "https://www.sos.la.gov/business-services/forms-fee-schedule", portal: "https://www.sos.la.gov/business-services/file-business-documents",
    x: LA_X,
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 35, due: ["Every year", "每年"], q: [LA_FEES, "Annual Reports $35 Name Reservation Cancellation $25"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 35, due: ["Every year", "每年"], q: [LA_FEES, "Annual Report $35 Annual Report for Nonproﬁt $10"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization, Louisiana Limited Liability Company (Form 365)", fee: 125, proof: [LA_FEES, "Articles of Organization-Louisiana Limited Liability Company $125"] },
      "corp-form": { form: "Articles of Incorporation, Louisiana Business Corporation (Form 399)", fee: 95, proof: [LA_FEES, "Articles of Incorporation Louisiana Business $95"] },
      "llc-qualify": { doc: ["Application of Foreign Limited Liability Company", "外州有限责任公司申请"], form: "Application of Foreign Limited Liability Company for Certificate of Authority", fee: 185,
        proof: [LA_FEES, "Application of Foreign Limited Liability Company $185"], report: null },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application of Foreign Corporation for Certificate of Authority", fee: 155,
        proof: [LA_FEES, "Application of Foreign Corporation for Certiﬁcate of Authority $155"], report: null },
    },
  },
  {
    st: "ME", name: ["Maine", "缅因州"], agency: ["Maine Secretary of State, Division of Corporations", "缅因州州务卿公司处"],
    site: ME_FORMS,
    p: [10, "2 to 7 business days", "2 至 7 个工作日", [ME_FORMS, "Corporate filings processing time is 2 - 7 business days."]],
    x: [["next", 50, [ME_LLC6, "24-hour expedited filing (next business day) service: $50 additional filing fee per entity"]],
      ["same", 100, [ME_LLC6, "Immediate expedited filing (same business day): $100 additional filing fee per entity"]]],
    rows: {
      "llc-form": { doc: ["Certificate of Formation", "成立证书"], form: "Certificate of Formation (Form MLLC-6)", fee: 175, url: ME_LLC6,
        report: { name: ["Annual Report", "年度报告"], fee: 85, due: ["Every year", "每年"], q: [ME_LLC_FEES, "a fee of $85 for a limited liability company or a fee of $150 for a foreign limited liability company;"] },
        proof: [ME_LLC_FEES, "For filing of a certificate of formation under section 1531, a fee of $175;"] },
      "corp-form": { form: "Articles of Incorporation (business corporation)", fee: 145,
        report: { name: ["Annual Report", "年度报告"], fee: 85, due: ["Every year", "每年"], q: [ME_CORP_FEES, "For an annual report or amended annual report, the fee is $85."] },
        proof: [ME_CORP_FEES, "For articles of incorporation, the fee is $145."] },
      "llc-qualify": { doc: ["Statement of Foreign Qualification", "外州资格声明"], form: "Statement of Foreign Qualification (limited liability company)", fee: 250,
        report: { name: ["Annual Report", "年度报告"], fee: 150, due: ["Every year", "每年"], q: [ME_LLC_FEES, "a fee of $85 for a limited liability company or a fee of $150 for a foreign limited liability company;"] },
        proof: [ME_LLC_FEES, "For filing of a statement of foreign qualification under section 1622, a fee of $250;"] },
      "corp-qualify": { doc: ["Application for Authority", "营业授权申请"], form: "Application for Authority to Do Business (foreign business corporation)", fee: 250,
        report: { name: ["Annual Report", "年度报告"], fee: 150, due: ["Every year", "每年"], q: [ME_CORP_FEES, "For an annual report or amended annual report for a foreign business corporation, the fee is $150."] },
        proof: [ME_CORP_FEES, "For an application for authority, the fee is $250."] },
    },
  },
  {
    st: "MD", name: ["Maryland", "马里兰州"], agency: ["Maryland State Department of Assessments and Taxation (SDAT)", "马里兰州评估与税务局（SDAT）"],
    site: MD_FEES, portal: "https://egov.maryland.gov/businessexpress",
    p: [56, "6 to 8 weeks online; 4 to 6 weeks on paper", "在线 6 至 8 周；纸质 4 至 6 周", [MD_FEES, "Non-expedited documents will be reviewed within 6-8 weeks."]],
    x: [{ label: ["Expedited", "加急"], turn: ["reviewed within 7 to 10 business days", "7 至 10 个工作日内审查"], hours: 336, fee: 50,
        q: [MD_FEES, "will require a $50 expedite fee and will be reviewed within 7-10 business days."] },
      ["same", 325, [MD_FEES, "Same-day service via online has an expedited fee of $325 and must be submitted by 2:30 PM for Same-day review."], ["Online, submitted by 2:30 PM", "在线提交，须在下午 2:30 前"]],
      ["same", 425, [MD_FEES, "Same-day service has an expedited fee of $425."], ["On paper, in the dropbox by 10 AM or in person by appointment", "纸质提交，须在上午 10 点前投入投递箱或预约现场递交"]]],
    rows: {
      "llc-form": { id: "md-llc" },
      "corp-form": { form: "Articles of Incorporation for a Stock Corporation", fee: 120, url: "https://dat.maryland.gov/SDAT%20Forms/stock.pdf",
        feeNote: ["$100 plus the $20 organization and capitalization fee.", "100 美元，另加 20 美元组织及资本费。"], proof: [MD_FEES, "Articles of Incorporation: $100 *$20 $50"] },
      "llc-qualify": { id: "md-foreign-registration", doc: ["Registration of a Foreign LLC", "外州 LLC 注册"], form: "Registration of a Foreign Limited Liability Company", fee: 100,
        proof: [MD_FEES, "Registration $100 (foreign) $50 Certificate of Amendment $100 (foreign) $50"] },
      "corp-qualify": { doc: ["Foreign Corporation Qualification", "外州公司资格登记"], form: "Foreign Corporation Qualification (to do intrastate business)", fee: 100, url: "https://dat.maryland.gov/SDAT%20Forms/forcp.pdf",
        proof: [MD_FEES, "Qualification to do intrastate business $100 $50"] },
    },
  },
  {
    st: "MI", name: ["Michigan", "密歇根州"], agency: ["Michigan Department of Licensing and Regulatory Affairs, Corporations Division", "密歇根州许可与监管事务部公司处"],
    site: MI_FEES, x: MI_X,
    rows: {
      "llc-form": { form: "Articles of Organization (Form CSCL/CD-700)", fee: 50, proof: [MI_FEES, "700 Articles of Organization $50 Yes"] },
      "corp-form": { form: "Articles of Incorporation, for profit (Form CSCL/CD-500)", fee: 60,
        feeNote: ["$50 for up to 60,000 authorized shares plus the $10 nonrefundable fee; more shares cost more.", "最多 60,000 股授权股份收费 50 美元，另加 10 美元不可退还费用；股份越多费用越高。"],
        proof: [MI_FEES, "1-60,000.................................................................$50.00"] },
      "llc-qualify": { doc: ["Certificate of Authority to Transact Business", "营业授权证书"], form: "Certificate of Authority to Transact Business in Michigan (Form CSCL/CD-760)", fee: 50,
        proof: [MI_FEES, "QUALIFY A FOREIGN COMPANY Certificate of Authority to Transact 760 $50 No"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign profit corporation, Form CSCL/CD-560)", fee: 60,
        feeNote: ["$10 nonrefundable fee plus the $50 initial franchise fee.", "10 美元不可退还费用加 50 美元首次特许经营费。"],
        proof: [MI_FEES, "Total Initial Admission Fees...................................$60.00"] },
    },
  },
  {
    st: "MN", name: ["Minnesota", "明尼苏达州"], agency: ["Minnesota Secretary of State, Business Services", "明尼苏达州州务卿商业服务处"],
    site: MN_FEES, portal: "https://mblsportal.sos.mn.gov/",
    rows: {
      "llc-form": { id: "mn-sos-llc",
        x: [{ label: ["Online or in person (expedited)", "在线或现场（加急）"], turn: ["handled as expedited service; no time is stated", "按加急服务处理；未注明时限"], hours: null, fee: 20,
          q: ["https://www.sos.mn.gov/media/1824/llcarticlesoforganization.pdf", "Filing Fee: $155 for expedited service in-person and online filings, $135 if by mail"] }] },
      "corp-form": { form: "Articles of Incorporation (business corporation, Chapter 302A)", fee: 155, feeNote: MN_ONLINE,
        proof: [MN_FEES, "Articles of Incorporation – Original Filing $135.00 $155.00"] },
      "llc-qualify": { id: "mn-foreign-registration", doc: ["Certificate of Authority", "营业授权证书"], form: "Certificate of Authority (foreign limited liability company, Chapter 322C)", fee: 185, feeNote: MN_ONLINE,
        proof: [MN_FEES, "Certificate of Authority – Original Filing for 322C $185.00 $205.00"] },
      "corp-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Certificate of Authority to Transact Business (foreign business corporation, Chapter 303)", fee: 220, feeNote: MN_ONLINE,
        url: "https://www.sos.mn.gov/media/1559/foreigncorpregistration.pdf",
        report: { name: ["Annual Renewal", "年度续期"], fee: 135, due: ["Every year", "每年"], q: [MN_FEES, "Annual Renewal $115.00 $135.00"] },
        proof: [MN_FEES, "Certificate of Authority – Original Filing $200.00 $220.00"] },
    },
  },
  {
    st: "MS", name: ["Mississippi", "密西西比州"], agency: ["Mississippi Secretary of State, Business Services", "密西西比州州务卿商业服务处"],
    site: MS_FEES, portal: "https://www.sos.ms.gov/business-services/business-faqs", loginOnly: true,
    rows: {
      "llc-form": { doc: ["Certificate of Formation", "成立证书"], form: "Certificate of Formation (Form F0100)", fee: 50, proof: [MS_FEES, "F0100 MS LLC Certificate of Formation $50"],
        report: { name: ["Annual Report", "年度报告"], fee: 0, due: ["Every year", "每年"], q: [MS_FEES, "F0108 MS LLC Annual Report $0"] } },
      "corp-form": { form: "Articles of Incorporation (Form F0001)", fee: 50, proof: [MS_FEES, "F0001 Articles of Incorporation $50 F0008 Annual Report $25"],
        report: { name: ["Annual Report", "年度报告"], fee: 25, due: ["Every year", "每年"], q: [MS_FEES, "F0001 Articles of Incorporation $50 F0008 Annual Report $25"] } },
      "llc-qualify": { doc: ["Application for Registration", "注册申请"], form: "Application for Registration of Foreign Limited Liability Company (Form F0200)", fee: 250,
        proof: [MS_FEES, "F0200 Application for Registration of Foreign Limited Liability Company $250"],
        report: { name: ["Annual Report", "年度报告"], fee: 250, due: ["Every year", "每年"], q: [MS_FEES, "F0208 Foreign LLC Annual Report $250"] } },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (Form F0002)", fee: 500,
        proof: [MS_FEES, "F0002 Application for Certificate of Authority $100 Nonprofit $500 Profit"] },
    },
  },
  {
    st: "MO", name: ["Missouri", "密苏里州"], agency: ["Missouri Secretary of State, Corporations Division", "密苏里州州务卿公司处"],
    site: MO_BIZ,
    rows: {
      "llc-form": { form: "Articles of Organization (Form LLC-1)", fee: 105, feeNote: ["$105 on paper; the Secretary's FAQ says $50 online.", "纸质 105 美元；州务卿常见问题称在线 50 美元。"],
        url: "https://s1.sos.mo.gov/CMSImages/Business/llc1.pdf", proof: ["https://s1.sos.mo.gov/CMSImages/Business/llc1.pdf", "(Submit with filing fee of $105.00)"] },
      "corp-form": { form: "Articles of Incorporation (general business corporation)", fee: 58, feeNote: ["The least it costs, for up to 30,000 authorized shares; more shares cost more.", "最多 30,000 股授权股份时的最低费用；股份越多费用越高。"],
        proof: ["https://www.sos.mo.gov/business/faqs", "30,000 shares are the most that may be authorized for the minimum incorporation fee of $58.00"] },
      "llc-qualify": { doc: ["Application for Registration", "注册申请"], form: "Application for Registration of a Foreign Limited Liability Company (Form LLC-4)", fee: 105,
        url: "https://www.sos.mo.gov/CMSImages/Business/llc4.pdf?v=2", proof: ["https://www.sos.mo.gov/CMSImages/Business/llc4.pdf?v=2", "(Submit with filing fee of $105.00)"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation)", fee: 155,
        proof: [MO_BIZ, "There is a fee of $155 to obtain a certificate of authority."] },
    },
  },
  {
    st: "MT", name: ["Montana", "蒙大拿州"], agency: ["Montana Secretary of State, Business Services", "蒙大拿州州务卿商业服务处"],
    site: MT_FEES,
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 0, due: ["By April 15 each year (the fee is waived until then; $35 after)", "每年 4 月 15 日前（此前免费，之后 35 美元）"], q: [MT_FEES, "Annual Report Prior To April 15th WAIVED Annual Report After April 15th"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 0, due: ["By April 15 each year (the fee is waived until then; $35 after)", "每年 4 月 15 日前（此前免费，之后 35 美元）"], q: [MT_FEES, "Annual Report – Prior To April 15th WAIVED Annual Report – After April 15th $35.00"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (limited liability company)", fee: 35, proof: [MT_FEES, "Articles Of Organization $35.00 plus $50.00 for each series member named in the series LLC"] },
      "corp-form": { form: "Articles of Incorporation (profit corporation)", fee: 35, proof: [MT_FEES, "Articles Of Incorporation – Profit Corporation $35.00"] },
      "llc-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Certificate of Authority (foreign limited liability company)", fee: 70,
        proof: [MT_FEES, "Foreign Filings Certificate Of Authority $70.00 plus $50.00 for each series member named in the series LLC"] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (profit corporation)", fee: 70,
        proof: [MT_FEES, "Foreign Registration Statement – Profit Corporation $70.00"] },
    },
  },
  {
    st: "NE", name: ["Nebraska", "内布拉斯加州"], agency: ["Nebraska Secretary of State, Business Services", "内布拉斯加州州务卿商业服务处"],
    site: NE_FEES,
    rows: {
      "llc-form": { doc: ["Certificate of Organization", "组织证书"], form: "Certificate of Organization (limited liability company)", fee: 100, feeNote: NE_ONLINE,
        url: "https://sos.nebraska.gov/sites/default/files/doc/business-services/Corporations/Forms/CertificateOfOrganization.pdf",
        proof: [NE_FEES, "Certificate of Organization $110 (In-Office) / $100 (Online)"] },
      "corp-form": { form: "Articles of Incorporation", fee: 100, feeNote: NE_ONLINE, proof: [NE_FEES, "Articles of Incorporation and Domestication $110 (In-Office) / $100 (Online)"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 100, feeNote: NE_ONLINE,
        url: NE_FLLC, proof: [NE_FLLC, "FILING FEE: $110.00 (In-Office) / $100.00 (Online) + $10 for Certificate"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority to Transact Business (foreign corporation)", fee: 100, feeNote: NE_ONLINE,
        proof: [NE_FEES, "Application for Certificate of Authority to Transact Business $110 (In-Office) / $100 (Online)"] },
    },
  },
  {
    st: "NH", name: ["New Hampshire", "新罕布什尔州"], agency: ["New Hampshire Secretary of State, Corporation Division", "新罕布什尔州州务卿公司处"],
    site: "https://www.sos.nh.gov/corporations-0/forms-and-fees/limited-liability-companies",
    blocked: "sos.nh.gov answered 403 to every automated read on 2026-10-27 (its forms-and-fees pages and the form PDFs): for a person to read in a browser.",
    rows: {},
  },
  {
    st: "NM", name: ["New Mexico", "新墨西哥州"], agency: ["New Mexico Secretary of State, Business Services", "新墨西哥州州务卿商业服务处"],
    site: "https://www.sos.nm.gov/business-services/",
    blocked: "The Secretary's forms and fees are on its Business Portal (enterprise.sos.nm.gov), which builds its pages in script, so an automated read on 2026-10-27 got an empty page; sos.nm.gov states no fee: for a person to read in a browser.",
    rows: {},
  },
  {
    st: "NC", name: ["North Carolina", "北卡罗来纳州"], agency: ["North Carolina Secretary of State, Business Registration Division", "北卡罗来纳州州务卿商业登记处"],
    site: NC_FEES,
    x: [["24h", 100, [NC_EXP, "24 Hour Received anytime between 8:00 a.m. and 5:00 p.m. $100.00"]],
      ["same", 200, [NC_EXP, "Must be received in the office before 12 Noon on the day same day service is being requested. $200.00"], ["Received before noon", "须在中午前收到"]]],
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 200, due: ["Every year", "每年"], q: [NC_FEES, "Certificate of Existence or Certificate of Authorization $15.00 Annual Report $200.00"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 25, due: ["Every year", "每年"], q: [NC_FEES, "Annual Report (effective September 1, 2007) $25.00"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (limited liability company)", fee: 125, proof: [NC_FEES, "Domestic & Foreign Limited Liability Companies* Articles of Organization $125.00"] },
      "corp-form": { form: "Articles of Incorporation (business corporation)", fee: 125, proof: [NC_FEES, "Domestic & Foreign Business Corporations* Articles of Incorporation $125.00"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 250,
        proof: [NC_FEES, "Certificate of Judicial Dissolution $0.00 Application for Certificate of Authority $250.00"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign business corporation)", fee: 250,
        proof: [NC_FEES, "Application for Certificate of Authority (For Only) $250.00"] },
    },
  },
  {
    st: "ND", name: ["North Dakota", "北达科他州"], agency: ["North Dakota Secretary of State, Business Services", "北达科他州州务卿商业服务处"],
    site: "https://www.sos.nd.gov/business/business-services/register-business", portal: "https://firststop.sos.nd.gov/forms",
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 50, due: ["Before November 16 each year, from the year after formation", "成立次年起，每年 11 月 16 日前"],
        q: [ND_LLC, "must be delivered to the secretary of state before November sixteenth of each year."],
        feeQ: [ND_LLC, "Filing an annual report of a limited liability company or foreign limited liability company, fifty dollars."] },
      corp: { name: ["Annual Report", "年度报告"], fee: 25, due: ["Every year", "每年"], q: [ND_CORP, "Filing an annual report of a corporation or foreign corporation, twenty-five dollars."] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (limited liability company)", fee: 135,
        proof: [ND_LLC, "Filing articles of organization and issuing a certificate of organization, one hundred thirty-five dollars."] },
      "corp-form": { form: "Articles of Incorporation (business corporation)", fee: 100,
        proof: [ND_CORP, "Filing articles of incorporation and issuing a certificate of incorporation, one hundred dollars."] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 135,
        proof: [ND_LLC, "transact business in this state and issuing a certificate of authority, one hundred thirty-five dollars."] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation)", fee: 145,
        proof: [ND_CORP, "business in this state and issuing a certificate of authority, one hundred forty-five dollars."] },
    },
  },
  {
    st: "OH", name: ["Ohio", "俄亥俄州"], agency: ["Ohio Secretary of State, Business Services", "俄亥俄州州务卿商业服务处"],
    site: "https://www.ohiosos.gov/business/business-filing-forms",
    speedBlocked: "ohiosos.gov answered 403 to every automated read on 2026-10-27 (its forms and fee schedule included): expedite tiers and processing times are for a person to read in a browser. The fees are Ohio Revised Code 111.16.",
    rows: {
      "llc-form": { id: "oh-sos-llc", fee: 99, proof: [ORC_FEES, "For filing and recording articles of organization of a limited liability company, for filing and recording an application to become a registered foreign"] },
      "corp-form": { form: "Articles of Incorporation (for-profit corporation, Form 532A)", fee: 99, feeNote: ["At least $99; the fee depends on the authorized shares (Ohio Revised Code 111.16).", "至少 99 美元；费用取决于授权股份（俄亥俄州修订法典 111.16）。"],
        proof: [ORC_FEES, "(A) For filing and recording articles of incorporation of a domestic corporation, including designation of agent:"] },
      "llc-qualify": { id: "oh-foreign-registration", doc: ["Registration of a Foreign Limited Liability Company", "外州有限责任公司注册"], form: "Registration of a Foreign Limited Liability Company", fee: 99,
        proof: [ORC_FEES, "For filing and recording articles of organization of a limited liability company, for filing and recording an application to become a registered foreign"] },
      "corp-qualify": { doc: ["Foreign Corporation License", "外州公司营业执照"], form: "Foreign Corporation Application for License (for-profit)", fee: 99,
        proof: [ORC_FEES, "A license to transact business in this state by a foreign corporation for profit pursuant to section 1703.04 of the Revised Code"] },
    },
  },
  {
    st: "OK", name: ["Oklahoma", "俄克拉何马州"], agency: ["Oklahoma Secretary of State, Business Services", "俄克拉何马州州务卿商业服务处"],
    site: OK_FEES,
    rows: {
      "llc-form": { form: "Articles of Organization (Oklahoma LLC)", fee: 100, proof: [OK_FEES, "Articles of Organization - Oklahoma LLC 18 OS 2055 100.00"],
        report: { name: ["Annual Certificate", "年度证书"], fee: 25, due: ["Every year", "每年"], q: [OK_FEES, "Annual Certificates - Oklahoma/Foreign LLC 18 OS 2055.2 25.00"] } },
      "corp-form": { form: "Certificate of Incorporation (Oklahoma for-profit corporation)", fee: 50, feeNote: ["At least $50: one tenth of one percent of the authorized capital.", "至少 50 美元：按授权资本的千分之一计算。"],
        doc: ["Certificate of Incorporation", "公司注册证书"], proof: [OK_FEES, "Certificate of Incorporation - Oklahoma For Profit Corporation 18 OS 1142 Min. 50.00(1/10 of 1%)"] },
      "llc-qualify": { doc: ["Certificate of Registration", "注册证书"], form: "Certificate of Registration (foreign limited liability company)", fee: 300, proof: [OK_FEES, "Certificate of Registration - LLC 18 OS 2055 300.00"],
        report: { name: ["Annual Certificate", "年度证书"], fee: 25, due: ["Every year", "每年"], q: [OK_FEES, "Annual Certificates - Oklahoma/Foreign LLC 18 OS 2055.2 25.00"] } },
      "corp-qualify": { doc: ["Certificate of Qualification", "资格证书"], form: "Certificate of Qualification (foreign for-profit corporation)", fee: 300, feeNote: ["At least $300: one tenth of one percent of the capital used in Oklahoma.", "至少 300 美元：按在本州使用资本的千分之一计算。"],
        proof: [OK_FEES, "Certificate of Qualification - Foreign For Profit Corporation 18 OS 1142 Min. 300.00(1/10 of 1%)"] },
    },
  },
  {
    st: "OR", name: ["Oregon", "俄勒冈州"], agency: ["Oregon Secretary of State, Corporation Division", "俄勒冈州州务卿公司处"],
    site: "https://sos.oregon.gov/business/Documents/business-registry-forms/br-fee-schedule.pdf",
    rows: {
      "llc-form": { id: "or-sos-llc" },
      "corp-form": { form: "Articles of Incorporation (business/professional corporation)", fee: 100, url: OR_DBC, proof: [OR_DBC, "Required Processing Fee $100"] },
      "llc-qualify": { id: "or-foreign-registration", doc: ["Application for Authority to Transact Business", "营业授权申请"], form: "Application for Authority to Transact Business (foreign limited liability company)", fee: 275, url: OR_FLLC,
        proof: [OR_FLLC, "Required Processing Fee $275"] },
      "corp-qualify": { doc: ["Application for Authority to Transact Business", "营业授权申请"], form: "Application for Authority to Transact Business (foreign business corporation)", fee: 275, url: OR_FBC,
        proof: [OR_FBC, "Required Processing Fee $275"] },
    },
  },
  {
    st: "RI", name: ["Rhode Island", "罗得岛州"], agency: ["Rhode Island Department of State, Business Services", "罗得岛州州务厅商业服务处"],
    site: RI_FEES, portal: "https://www.sos.ri.gov/divisions/business-services/business-basics/costs-and-fees",
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 50, due: ["Every year", "每年"], q: [RI_FEES, "632 ANNUAL REPORT YES $50.00 $2.50"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 50, due: ["Every year", "每年"], q: [RI_FEES, "630 ANNUAL REPORT YES $50.00 $2.50"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (Form 400)", fee: 150, url: "https://docs.sos.ri.gov/documents/BusinessServices/400-articles-of-organization.pdf",
        proof: [RI_FEES, "400 ARTICLES OF ORGANIZATION YES $150.00 $6.00"] },
      "corp-form": { form: "Articles of Incorporation (Form 100, under 75,000,000 shares)", fee: 230, proof: [RI_FEES, "100 ARTICLES OF INCORPORATION (UNDER 75,000,000 SHARES) YES $230.00 $8.00"] },
      "llc-qualify": { doc: ["Application for Registration", "注册申请"], form: "Application for Registration (foreign limited liability company, Form 450)", fee: 150, proof: [RI_FEES, "450 APPLICATION FOR REGISTRATION YES $150.00 $6.00"] },
      "corp-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Application for Certificate of Authority (foreign business corporation, Form 150)", fee: 310,
        proof: [RI_FEES, "150 CERTIFICATE OF AUTHORITY (UNDER 75,000,000 SHARES) YES $310.00 $9.00"] },
    },
  },
  {
    st: "SC", name: ["South Carolina", "南卡罗来纳州"], agency: ["South Carolina Secretary of State, Business Entities Division", "南卡罗来纳州州务卿商业实体处"],
    site: "https://sos.sc.gov/online-filings/business-entities",
    rows: {
      "llc-form": { proof: [SC_LLC, "a limited liability company, consisting of one or more members, by delivering articles of organization to the office of the Secretary of State"],
        feeNote: SC_FEE_NOTE },
      "corp-form": { form: "Articles of Incorporation", feeNote: ["S.C. Code 33-1-220 sets a $10 filing fee; the Secretary collects other state fees at filing too, so the total isn't stated here.", "南卡罗来纳州法典 33-1-220 规定申请费为 10 美元；州务卿在提交时还会收取其他州费用，因此此处不列总额。"],
        proof: [SC_CODE, "Articles of incorporation $10.00. (2) Application for use of indistinguishable name"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", feeNote: SC_FEE_NOTE,
        proof: [SC_LLC, "may apply for a certificate of authority to transact business in this State by delivering an application to the Secretary of State for filing."] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation)",
        feeNote: ["S.C. Code 33-1-220 sets a $10 filing fee; the Secretary collects other state fees at filing too, so the total isn't stated here.", "南卡罗来纳州法典 33-1-220 规定申请费为 10 美元；州务卿在提交时还会收取其他州费用，因此此处不列总额。"],
        proof: [SC_CODE, "Application for certificate of authority $10.00. (20) Application for amended certificate of authority"] },
    },
  },
  {
    st: "SD", name: ["South Dakota", "南达科他州"], agency: ["South Dakota Secretary of State, Business Services", "南达科他州州务卿商业服务处"],
    site: SD_FEES,
    x: [{ label: ["Expedited", "加急"], turn: ["sooner than the normal course of business; no time is stated", "早于正常处理；未注明时限"], hours: null, fee: 50,
      q: [SD_FEES, "Expedited Service (Expedited service is defined as: completion sooner than the normal course of business upon request.) $50"] }],
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 55, due: ["Every year", "每年"], q: [SD_FEES, "Annual Report Filed Electronically online $55 Filed via Paper (includes paper filing fee) $70"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 55, due: ["Every year", "每年"], q: [SD_FEES, "Annual Report Filed Electronically online $55 Filed via Paper (includes paper filing fee) $70"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (domestic limited liability company)", fee: 150, feeNote: SD_PAPER, proof: [SD_FEES, "Domestic Articles of Organization Filed Electronically online $150"] },
      "corp-form": { form: "Articles of Incorporation (domestic business corporation)", fee: 150, feeNote: SD_PAPER, proof: [SD_FEES, "Domestic Articles of Incorporation Filed Electronically online $150"] },
      "llc-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 750, feeNote: SD_PAPER,
        proof: [SD_FEES, "Foreign Certificate of Authority Filed Electronically online $750 Filed via Paper (includes paper filing fee) $765"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation)", fee: 750, feeNote: SD_PAPER,
        proof: [SD_FEES, "Foreign Application for Certificate of Authority Filed Electronically online $750"] },
    },
  },
  {
    st: "TN", name: ["Tennessee", "田纳西州"], agency: ["Tennessee Secretary of State, Business Services Division", "田纳西州州务卿商业服务处"],
    site: TN_FEES,
    rows: {
      "llc-form": { form: "Articles of Organization, Limited Liability Company (Form SS-4270)", fee: 300, feeNote: TN_LLC_NOTE,
        proof: [TN_FEES, "Articles of Organization Limited Liability Company ( PDF , 294.3KB ) SS-4270 $300*"] },
      "corp-form": { doc: ["Charter", "公司章程"], form: "Charter, For-Profit Corporation (Form SS-4417)", fee: 100, proof: [TN_FEES, "Charter For-Profit Corporation ( PDF , 285.2KB ) SS-4417 $100"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority, Limited Liability Company (Form SS-4233)", fee: 300, feeNote: TN_LLC_NOTE,
        proof: [TN_FEES, "Application for Certificate of Authority Limited Liability Company ( PDF , 287.0KB ) SS-4233 $300*"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority, For-Profit Corporation (Form SS-4431)", fee: 600,
        proof: [TN_FEES, "Application for Certificate of Authority For-Profit Corporation ( PDF , 284.2KB ) SS-4431 $600"] },
    },
  },
  {
    st: "UT", name: ["Utah", "犹他州"], agency: ["Utah Division of Corporations and Commercial Code", "犹他州公司与商业法典处"],
    site: UT_FEES,
    x: [{ label: ["Expedited", "加急"], turn: ["faster processing; no time is stated", "加快处理；未注明时限"], hours: null, fee: 75, q: [UT_FEES, "Expedited processing fee​ ​$75 per filing"] }],
    report: {
      llc: { name: ["Annual renewal", "年度续期"], fee: 18, due: ["Every year", "每年"], q: [UT_FEES, "*Domestic/foreign limited liability company (LLC)​ ​ 18"] },
      corp: { name: ["Annual renewal", "年度续期"], fee: 18, due: ["Every year", "每年"], q: [UT_FEES, "*Domestic/foreign corporation​ ​ 18"] },
    },
    rows: {
      "llc-form": { id: "ut-llc", fee: 59, proof: [UT_FEES, "Limited liability company (LLC) - certificate of organization​ ​$59"] },
      "corp-form": { form: "Articles of Incorporation (business corporation)", fee: 59, proof: [UT_FEES, "Business corporation - articles of incorporation​ ​ 59"] },
      "llc-qualify": { doc: ["Foreign Registration", "外州注册"], form: "Foreign Registration Statement (limited liability company)", fee: 59, proof: [UT_FEES, "Limited liability company (LLC)​ ​$59"] },
      "corp-qualify": { doc: ["Foreign Registration", "外州注册"], form: "Foreign Registration Statement (business corporation)", fee: 59,
        proof: [UT_FEES, "Register your foreign business organization in Utah​ ​Business corporation​ ​ 59"] },
    },
  },
  {
    st: "VT", name: ["Vermont", "佛蒙特州"], agency: ["Vermont Secretary of State, Corporations Division", "佛蒙特州州务卿公司处"],
    site: VT_FEES,
    rows: {
      "llc-form": { form: "Articles of Organization (limited liability company)", fee: 155, proof: [VT_FEES, "Articles of Organization 11 V.S.A. § 4023 $155.00"],
        report: { name: ["Annual Report", "年度报告"], fee: 45, due: ["Every year", "每年"], q: [VT_FEES, "Annual Report 11 V.S.A. § 4033 $45.00"] } },
      "corp-form": { form: "Articles of Incorporation (business corporation)", fee: 155, proof: [VT_FEES, "Articles of Incorporation 11A V.S.A. § 2.02 $155.00"],
        report: { name: ["Annual Report", "年度报告"], fee: 60, due: ["Every year", "每年"], q: [VT_FEES, "Annual Report 11A V.S.A. § 16.22 $60.00"] } },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 155,
        proof: [VT_FEES, "Application for Certificate of Authority 11 V.S.A. § 4112 $155.00"],
        report: { name: ["Annual Report", "年度报告"], fee: 170, due: ["Every year", "每年"], q: [VT_FEES, "Annual Report 11 V.S.A. § 4033 $170.00"] } },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign business corporation)", fee: 155,
        proof: [VT_FEES, "Application for Certificate of Authority 11A V.S.A. § 15.03 $155.00"] },
    },
  },
  {
    st: "VA", name: ["Virginia", "弗吉尼亚州"], agency: ["Virginia State Corporation Commission, Clerk's Office", "弗吉尼亚州公司委员会书记官办公室"],
    site: VA_TYPES,
    rows: {
      "llc-form": { id: "va-llc", fee: 100, proof: [VA_TYPES, "Virginia LLC File Online or complete Articles of Organization (Form LLC1011-DOC) $100"] },
      "corp-form": { form: "Articles of Incorporation, stock corporation (Form SCC619)", fee: 75, feeNote: VA_CORP_NOTE,
        proof: [VA_TYPES, "Stock Corporation File Online or complete Articles of Incorporation (Form SCC619-DOC) See Corporation Charter Fee/Entrance Fee Schedule $25"] },
      "llc-qualify": { id: "va-foreign-registration", doc: ["Application for Registration", "注册申请"], form: "Application for Registration as a Foreign Limited Liability Company (Form LLC1052)", fee: 100,
        proof: [VA_TYPES, "Foreign LLC File Online or complete an Application for Registration as a Foreign Limited Liability Company (Form LLC1052-DOC) $100"] },
      "corp-qualify": { doc: ["Application for a Certificate of Authority", "营业授权证书申请"], form: "Application for a Certificate of Authority to Transact Business in Virginia (Form SCC759)", fee: 75, feeNote: VA_CORP_NOTE,
        url: VA_759, proof: [VA_759, "Entrance Fee: Stock Corporation 1 million or fewer authorized shares - $50.00 for each 25,000 shares or fraction thereof"] },
    },
  },
  {
    st: "WV", name: ["West Virginia", "西弗吉尼亚州"], agency: ["West Virginia Secretary of State, Business and Licensing Division", "西弗吉尼亚州州务卿商业与许可处"],
    site: WV_FEES,
    x: [["24h", 25, [WV_FEES, "24-HOUR Expedite additional $25.00"]], ["2h", 250, [WV_FEES, "2-HOUR Expedite additional $250.00"]], ["1h", 500, [WV_FEES, "1-HOUR Expedite additional $500.00"]]],
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 25, due: ["Between January 1 and June 30 each year, from the year after registering", "注册次年起，每年 1 月 1 日至 6 月 30 日之间"], q: [WV_AR, "and pay the annual report $25.00 filing fee between January 1 and June 30 of each year"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 25, due: ["Between January 1 and June 30 each year, from the year after registering", "注册次年起，每年 1 月 1 日至 6 月 30 日之间"], q: [WV_AR, "and pay the annual report $25.00 filing fee between January 1 and June 30 of each year"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (Form LLD-1)", fee: 100, proof: [WV_FEES, "Articles of Organization -- Domestic Limited Liability Company $100.00"] },
      "corp-form": { form: "Articles of Incorporation, domestic for-profit corporation (Form CD-1)", fee: 100, proof: [WV_FEES, "Articles of Incorporation -- Domestic For-Profit Corporation $100.00"] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company, Form LLF-1)", fee: 150,
        url: "https://sos.wv.gov/sites/default/files/2026-07/llf-1.pdf", proof: [WV_FEES, "Domestic Limited Liability Company $100.00 Foreign Limited Liability Company $150.00"] },
      "corp-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Application for Certificate of Authority (foreign for-profit corporation, Form CF-1)", fee: 100,
        url: "https://sos.wv.gov/sites/default/files/2026-04/cf-1.pdf", proof: [WV_FEES, "Certificate of Authority -- Foreign For-Profit Corporation $100.00"] },
    },
  },
  {
    st: "WI", name: ["Wisconsin", "威斯康星州"], agency: ["Wisconsin Department of Financial Institutions, Division of Corporate and Consumer Services", "威斯康星州金融机构部公司与消费者服务处"],
    site: "https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/Fees.aspx", portal: "https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/FileOnline.aspx",
    x: [{ label: ["Expedited", "加急"], turn: ["faster processing; no time is stated on the form", "加快处理；表格未注明时限"], hours: null, fee: 100,
      q: [WI_502, "please check the expedited service box in the upper-right corner of the first page and include an additional $100.00."] }],
    rows: {
      "llc-form": { form: "Articles of Organization, Limited Liability Company (Form 502)", fee: 170, feeNote: ["On the paper form.", "纸质表格。"], url: WI_502,
        proof: [WI_502, "together with a check for the $170.00 filing fee, payable to the Department of Financial Institutions."] },
      "corp-form": { form: "Articles of Incorporation, business corporation (Form 2)", fee: 100, url: WI_2,
        proof: [WI_2, "together with a check for the $100.00 filing fee, payable to the Department of Financial Institutions."] },
      "llc-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement, limited liability company (Form 521)", fee: 100, url: WI_521,
        feeNote: ["At least $100; back fees are added for a company that did business before registering.", "至少 100 美元；注册前已开展业务的公司须补缴费用。"], proof: [WI_521, "State of Wisconsin FILING FEE $100.00 +"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority, foreign business corporation (Form 21)", fee: 100, url: WI_21,
        feeNote: ["At least $100; the form adds a fee on capital and any back fees (item 15).", "至少 100 美元；表格第 15 项另计资本费及补缴费用。"], proof: [WI_21, "State of Wisconsin FILING FEE $100.00+"] },
    },
  },
  {
    st: "WY", name: ["Wyoming", "怀俄明州"], agency: ["Wyoming Secretary of State, Business Division", "怀俄明州州务卿商业处"],
    site: WY_FEES,
    x: [["same", 1400, [WY_FEES, "Expedited Filing Service - Same Business Day..............................................$1,400.00"]],
      ["next", 700, [WY_FEES, "Expedited Filing Service - Next Business Day...................................................$700.00"]]],
    report: {
      llc: { name: ["Annual Report (license tax)", "年度报告（许可税）"], fee: 60, due: ["Every year", "每年"], q: [WY_FEES, "*Annual Report License tax is $60 or two-tenths of one mill on the dollar ($.0002) whichever is greater based"] },
      corp: { name: ["Annual Report (license tax)", "年度报告（许可税）"], fee: 60, due: ["Every year", "每年"], q: [WY_FEES, "*Annual Report License tax is $60 or two-tenths of one mill on the dollar ($.0002) whichever is greater based"] },
    },
    rows: {
      "llc-form": { form: "Articles of Organization (limited liability company)", fee: 100, url: "https://sos.wyo.gov/forms/business/llc/llc-articlesorganization.pdf",
        proof: [WY_FEES, "Articles of Organization*/Continuance/Domestication .......................................$100.00"] },
      "corp-form": { form: "Articles of Incorporation (profit corporation)", fee: 100, url: "https://sos.wyo.gov/Forms/Business/PROF/P-ArticlesIncorporation.pdf",
        proof: [WY_FEES, "Articles of Incorporation*/Continuance/Domestication .......................................$100.00"] },
      "llc-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 150,
        proof: [WY_FEES, "Certificate of Authority ........................................................................................$150.00"] },
      "corp-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Application for Certificate of Authority (foreign profit corporation)", fee: 150,
        proof: [WY_FEES, "Certificate of Authority ........................................................................................$150.00"] },
    },
  },
  // END OF STATES
];
