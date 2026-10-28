// Company formation and foreign qualification: the rest of the states, in alphabetical order (the priority states are in
// src/forms/entity-data.ts). Same rules: each quote was copied from the official page as fetched on READ_ENT and found
// there by scripts/eval/proof-read.py's matcher; a page that refused automated reads leaves its row UNVERIFIED with the
// reason, stating nothing.
import type { CustomTier, Report, StateData, Tier } from "./entities";
import { LATER_STATES } from "./entity-data-3";

/* ------------------------------------------------------------------ Alabama */
const AL_LLC = "https://www.sos.alabama.gov/business-entities/llcs";
const AL_CORP = "https://www.sos.alabama.gov/business-entities/domestic-corporations";
const AL_FCORP = "https://www.sos.alabama.gov/business-entities/foreign-corporations";
const AL_RESERVE: readonly [string, string] = ["A Certificate of Name Reservation must be obtained first.", "须先取得名称保留证书。"];

/* ------------------------------------------------------------------ Arizona */
const AZ_LLC_FEES = "https://azcc.gov/docs/default-source/corps-files/fee-schedules/fee-schedule-llcs.pdf";
const AZ_CORP_FEES = "https://azcc.gov/docs/default-source/corps-files/fee-schedules/fee-schedule-corporations6def4cc74b1a47129d16c2b1c3851bda.pdf";
const AZ_FAQ = "https://azcc.gov/faqs/BusinessServicesFAQs";
const AZ_EXP = "https://azcc.gov/docs/default-source/corps-files/instructions/m004i-instructions-expedite-pending-document.pdf?sfvrsn=a2fbe0ac_4";
const AZ_X: (Tier | CustomTier)[] = [
  { label: ["Expedited", "加急"], turn: ["typically 3 to 5 days", "通常 3 至 5 天"], hours: 120, fee: 35,
    q: [AZ_FAQ, "Expedite ($35 in addition to the filing fee; the estimated processing time is typically 3-5 days)"] },
  ["next", 100, [AZ_EXP, "For Next Day Service, $100.00."]],
  ["same", 200, [AZ_EXP, "For Same Day Service, $200.00."]],
  ["2h", 400, [AZ_EXP, "For Two-Hour Service, $400.00."]],
];

/* ------------------------------------------------------------------ Arkansas */
const AR_LLC = "https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/llc";
const AR_CORP = "https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/corporations";

/* ------------------------------------------------------------------ Colorado */
const CO_FEES = "https://www.sos.state.co.us/pubs/info_center/fees/business.html";
const CO_REPORT: Report = { name: ["Periodic Report", "定期报告"], fee: 25, due: ["Every year", "每年"], q: [CO_FEES, "Periodic Report $25.00 n/a Periodic Report Late Filing Penalty $50.00"] };
const CO_FOREIGN = [CO_FEES, "Foreign entities Online fee Paper fee Foreign Entity Authority Statement $100.00"] as const;

/* ------------------------------------------------------------------ Connecticut */
const CT_FEES = "https://portal.ct.gov/-/media/sots/business-services/bsd-forms/fee-schedule-revised-712020.pdf?rev=584e7111891242319ce570a4d20221c0&hash=D46A230464D9BB9B2AE176B451F4FCFB";
const CT_LLC = "https://business.ct.gov/knowledge-base/articles/domestic-limited-liability-companies-forms-and-fees";
const CT_LLC_REPORT: Report = { name: ["Annual Report", "年度报告"], fee: 80, due: ["Online between January 1 and March 31 each year", "每年 1 月 1 日至 3 月 31 日在线提交"],
  q: [CT_LLC, "Annual Report - filed online annually from January 1 to March 31. (file online) > $80"] };

/* ------------------------------------------------------------------ District of Columbia */
const DC_FEES = "https://dlcp.dc.gov/node/1621901";
const DC_LLC_FEES = "https://dlcp.dc.gov/node/1621921";
const DC_CORP_FEES = "https://dlcp.dc.gov/node/1621906";

/* ------------------------------------------------------------------ Hawaii */
const HI_FEES = "https://cca.hawaii.gov/wp-content/uploads/2025/12/Form-Fee-Schedule-12-2022.pdf";
const HI_LLC = "https://cca.hawaii.gov/breg/registration/dllc/fees/";
const HI_CORP = "https://cca.hawaii.gov/breg/registration/dpc/fees/";
const HI_X: Omit<CustomTier, "q"> = { label: ["Expedited review", "加急审查"], turn: ["faster review; no time is stated on the fee page", "加快审查；收费页面未注明时限"], hours: null, fee: 25 };

/* ------------------------------------------------------------------ Idaho */
const ID_FORMS = "https://sos.idaho.gov/business-forms/";
const ID_CORP_PDF = "https://sos.idaho.gov/CORP/forms/CORP/Art%20of%20Incorp%20General.pdf";
const ID_PAPER: readonly [string, string] = ["$100 online; $20 more for a paper filing.", "在线 100 美元；纸质提交另加 20 美元。"];

/* ------------------------------------------------------------------ Indiana: the fees are Indiana Code 23-0.5-9 (iga.in.gov) */
const IN_FEES = "https://iga.in.gov/ic/2026/Title_23/Article_0.5/Chapter_9.pdf";
const IN_FOREIGN_NOTE: readonly [string, string] = ["$75 filed online; $125 on paper (Indiana Code 23-0.5-9-26).", "在线 75 美元；纸质 125 美元（印第安纳州法典 23-0.5-9-26）。"];

/* ------------------------------------------------------------------ Iowa: sos.iowa.gov answers curl with 403; read with WebFetch */
const IA_FEES = "https://sos.iowa.gov/businesses/business-entity-forms-and-fees";

/* ------------------------------------------------------------------ Kansas */
const KS_FA = "https://sos.ks.gov/forms/business_services/FA.pdf";

export const MORE_STATES: StateData[] = [
  {
    st: "AL", name: ["Alabama", "阿拉巴马州"], agency: ["Alabama Secretary of State, Business Entities Division", "阿拉巴马州州务卿商业实体处"],
    site: AL_LLC, method: "pdf_mail",
    agent: ["https://www.sos.alabama.gov/sites/default/files/2022-09/ForeignLLCRegistration.pdf", "Name of registered agent for service of process (MUST be physically located in Alabama):"],
    rows: {
      "llc-form": { doc: ["Certificate of Formation", "成立证书"], form: "Domestic Limited Liability Company Certificate of Formation", fee: 200, feeNote: AL_RESERVE,
        url: "https://www.sos.alabama.gov/sites/default/files/2026-03/DomesticLLCFormation.pdf", proof: [AL_LLC, "Domestic LLC Filing Filing Fees Secretary of State: $200.00"] },
      "corp-form": { doc: ["Certificate of Formation", "成立证书"], form: "Domestic Business Corporation Certificate of Formation", fee: 200, feeNote: AL_RESERVE, url: AL_CORP,
        proof: [AL_CORP, "Domestic Business Filing Filing Fee Secretary of State: $200.00"] },
      "llc-qualify": { form: "Foreign Limited Liability Company Application for Registration", fee: 150, method: "online", url: AL_LLC, proof: [AL_LLC, "File Foreign LLC Online - Filing Fee $150.00"] },
      "corp-qualify": { doc: ["Application for Registration", "注册申请"], form: "Foreign Corporation Application for Registration", fee: 150, method: "online", url: AL_FCORP,
        proof: [AL_FCORP, "File Foreign Corporation online - Filing Fee $150.00"] },
    },
  },
  {
    st: "AK", name: ["Alaska", "阿拉斯加州"], agency: ["Alaska Division of Corporations, Business and Professional Licensing", "阿拉斯加州公司、商业与职业许可处"],
    site: "https://www.commerce.alaska.gov/web/cbpl/Corporations/CorporationFormsFees",
    blocked: "commerce.alaska.gov answered 403 to every automated read on 2026-10-27 (the forms and fees page and the biennial report pages): for a person to read in a browser.",
    rows: {},
  },
  {
    st: "AZ", name: ["Arizona", "亚利桑那州"], agency: ["Arizona Corporation Commission, Corporations Division", "亚利桑那州公司委员会公司处"],
    site: "https://azcc.gov/corporations/home", portal: "https://ArizonaBusinessCenter.azcc.gov",
    p: [16, "Typically 14 to 16 days", "通常 14 至 16 天", [AZ_FAQ, "Regular (no additional fee; the estimated processing time is typically 14-16 days)"]],
    x: AZ_X,
    report: { corp: { name: ["Annual Report", "年度报告"], fee: 45, due: ["Every year, by the corporation's due date", "每年在公司指定的到期日前"],
      q: [AZ_FAQ, "Each corporation must file their annual report by their designated due date each year."], feeQ: [AZ_CORP_FEES, "Annual Report – For-profit corporation $45.00 $80.00"] } },
    rows: {
      "llc-form": { id: "az-llc", fee: 50, feeNote: ["$50; $85 with expedited processing.", "50 美元；加急处理 85 美元。"], proof: [AZ_LLC_FEES, "Articles of Organization $50.00 $85.00"],
        report: { name: ["No annual report", "无需年度报告"], fee: 0, due: ["Arizona LLCs file no annual report", "亚利桑那州 LLC 无需提交年度报告"], q: [AZ_FAQ, "No, LLCs are not required to file annual reports."] } },
      "corp-form": { form: "Articles of Incorporation, for-profit (Form C010)", fee: 60, feeNote: ["$60; $95 with expedited processing.", "60 美元；加急处理 95 美元。"],
        url: "https://www.azcc.gov/docs/default-source/corps-files/instructions/c010i-instructions-articles-of-inc-for-profit.pdf?sfvrsn=f3206078_4", proof: [AZ_CORP_FEES, "Articles of Incorporation $60.00 $95.00 For-profit"] },
      "llc-qualify": { id: "az-acc-foreign", fee: 150, replaceProof: true, proof: [AZ_LLC_FEES, "Foreign Registration Statement $150.00 $185.00"],
        report: { name: ["No annual report", "无需年度报告"], fee: 0, due: ["LLCs file no annual report in Arizona", "LLC 在亚利桑那州无需提交年度报告"], q: [AZ_FAQ, "No, LLCs are not required to file annual reports."] } },
      "corp-qualify": { doc: ["Application for Authority to Transact Business", "营业授权申请"], form: "Application for Authority to Transact Business in Arizona (Form C030)", fee: 175,
        feeNote: ["$175; $210 with expedited processing.", "175 美元；加急处理 210 美元。"], proof: [AZ_CORP_FEES, "Application for Authority $175.00 $210.00 to Transact Business in Arizona"] },
    },
  },
  {
    st: "AR", name: ["Arkansas", "阿肯色州"], agency: ["Arkansas Secretary of State, Business and Commercial Services", "阿肯色州州务卿商业服务处"],
    site: AR_LLC, portal: AR_LLC,
    rows: {
      "llc-form": { doc: ["Certificate of Organization", "组织证书"], form: "Certificate of Organization for a Domestic Limited Liability Company (Form LL-01)", fee: 45,
        feeNote: ["$45 online; $50 on paper.", "在线 45 美元；纸质 50 美元。"], proof: [AR_LLC, "Certificate of Organization for a Dom. Limited Liability Co. LL-01 $45.00 $50.00"] },
      "corp-form": { form: "Articles of Incorporation (Form DN-01)", fee: 45, feeNote: ["$45 online; $50 on paper.", "在线 45 美元；纸质 50 美元。"], url: AR_CORP,
        proof: [AR_CORP, "Articles of Incorporation DN-01 $45.00 $50.00"] },
      "llc-qualify": { doc: ["Application for Certificate of Registration", "注册证书申请"], form: "Application for Certificate of Registration of Foreign Limited Liability Company (Form FL-01)", fee: 270,
        feeNote: ["$270 online; $300 on paper.", "在线 270 美元；纸质 300 美元。"], url: "https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/llc/foreign-llc",
        proof: ["https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/llc/foreign-llc", "Application for Certificate of Registration of Foreign Limited Liability Company FL-01 $270.00 $300.00"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (Form F-01)", fee: 270,
        feeNote: ["$270 online; $300 on paper.", "在线 270 美元；纸质 300 美元。"], url: "https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/corporations/foreign-corporations",
        proof: ["https://www.sos.arkansas.gov/business-commercial-services-bcs/forms-fees/corporations/foreign-corporations", "Application for Certificate of Authority F-01 $270.00 $300.00"] },
    },
  },
  {
    st: "CO", name: ["Colorado", "科罗拉多州"], agency: ["Colorado Secretary of State, Business and Licensing Division", "科罗拉多州州务卿商业与许可处"],
    site: CO_FEES, portal: "https://www.coloradosos.gov/pubs/business/businessHome.html",
    x: [{ label: ["Expedited", "加急"], turn: ["fulfilled within 3 business days", "3 个工作日内办结"], hours: 72, fee: 150,
      q: [CO_FEES, "Expedited Service, business organization document filing (fulfilled within 3 business days) - additional fee n/a $150.00"], note: ["Paper filings only (online it's n/a)", "仅限纸质提交（在线不适用）"] }],
    agent: ["https://www.sos.state.co.us/pubs/business/FAQs/foreigns.html", "An entity appointed to serve as a registered agent must have a usual place of business in Colorado,"],
    report: { llc: CO_REPORT, corp: CO_REPORT },
    rows: {
      "llc-form": { id: "co-sos", fee: 50, proof: [CO_FEES, "Limited liability company Online fee Paper fee Articles of Organization $50.00"] },
      "corp-form": { form: "Articles of Incorporation (profit corporation)", fee: 50, proof: [CO_FEES, "Profit corporations Online fee Paper fee Articles of Incorporation $50.00"] },
      "llc-qualify": { id: "co-foreign-registration", doc: ["Statement of Foreign Entity Authority", "外州实体授权声明"], form: "Statement of Foreign Entity Authority (limited liability company)", fee: 100, proof: CO_FOREIGN,
        url: "https://www.sos.state.co.us/pubs/business/helpFiles/AUTHORITY_HELP.html" },
      "corp-qualify": { doc: ["Statement of Foreign Entity Authority", "外州实体授权声明"], form: "Statement of Foreign Entity Authority (corporation)", fee: 100, proof: CO_FOREIGN,
        url: "https://www.sos.state.co.us/pubs/business/helpFiles/AUTHORITY_HELP.html" },
    },
  },
  {
    st: "CT", name: ["Connecticut", "康涅狄格州"], agency: ["Connecticut Secretary of the State, Business Services Division", "康涅狄格州州务卿商业服务处"],
    site: CT_LLC, portal: "https://business.ct.gov/",
    x: [{ label: ["Expedited", "加急"], turn: ["faster handling; no time is stated", "加快处理；未注明时限"], hours: null, fee: 50, q: [CT_FEES, "A. Expedited Services (Per transaction) $50"] }],
    report: { llc: CT_LLC_REPORT },
    rows: {
      "llc-form": { doc: ["Certificate of Organization", "组织证书"], form: "Certificate of Organization (including appointment of statutory agent)", fee: 120,
        proof: [CT_LLC, "Certificate of Organization - required, including appointment of statutory agent. (file online) > $120"] },
      "corp-form": { doc: ["Certificate of Incorporation", "公司注册证书"], form: "Certificate of Incorporation (stock corporation)", fee: 250,
        feeNote: ["Includes the minimum franchise tax for up to 20,000 authorized shares.", "含最多 20,000 股授权股本的最低特许经营税。"],
        report: { name: ["Annual Report", "年度报告"], fee: 150, due: ["Every year", "每年"], q: [CT_FEES, "G. Annual Report (Filed online) 150"] },
        proof: [CT_FEES, "D. Certificate of Incorporation 250 Includes the minimum franchise tax if authorizing up to 20,000.00 shares."] },
      "llc-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (limited liability company)", fee: 120,
        url: "https://business.ct.gov/-/media/SOTS/Business-Services/BSD-Forms/Limited-Liability-Company/Foreign/Foreign_Registration_Statement_LLC_Foreign_FILLABLE_20220127.pdf",
        report: { ...CT_LLC_REPORT, q: [CT_FEES, "G. Annual Report (Filed online annually between January 1 and March 31) 80"] },
        proof: [CT_FEES, "F. Foreign Registration Statement 120"] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign stock corporation)", fee: 385,
        feeNote: ["Includes the $285 license fee.", "含 285 美元许可费。"],
        report: { name: ["Annual Report", "年度报告"], fee: 435, due: ["Every year", "每年"], q: [CT_FEES, "I. Annual Report (Filed online) 435"] },
        proof: [CT_FEES, "F. Application for Certificate of Authority (Includes $285 License Fee) 385"] },
    },
  },
  {
    st: "DC", name: ["the District of Columbia", "华盛顿特区"], agency: ["DC Department of Licensing and Consumer Protection, Corporations Division", "华盛顿特区许可与消费者保护局公司处"],
    site: DC_FEES, portal: "https://corponline.dlcp.dc.gov/",
    x: [["same", 100, [DC_FEES, "Expedited same-day service: $100, in addition to all other fees required by statute or regulation;"], ["Charged to every walk-in customer at the Business License Center", "在营业执照中心现场办理的客户一律收取"]],
      { label: ["3-day", "3 天加急"], turn: ["within 3 days", "3 天内办结"], hours: 72, fee: 50, q: [DC_FEES, "Expedited 3-day service: $50, in addition to all other fees required by statute or regulation."] }],
    report: {
      llc: { name: ["Biennial report", "双年报"], fee: 300, due: ["Every two years", "每两年一次"], q: [DC_LLC_FEES, "Domestic & Foreign Limited Liability Company Biennial report $300.00"] },
      corp: { name: ["Biennial report", "双年报"], fee: 300, due: ["Every two years", "每两年一次"], q: [DC_CORP_FEES, "Domestic & Foreign Business Corporation Biennial report $300.00"] },
    },
    rows: {
      "llc-form": { id: "dc-formation", fee: 99, proof: [DC_LLC_FEES, "Domestic Limited Liability Company Certificate of organization $99.00"] },
      "corp-form": { form: "Articles of Incorporation (Form DCA-1)", fee: 99, feeNote: ["For authorized capital up to $100,000; the fee rises with the capital.", "授权资本不超过 100,000 美元时的费用；资本越高费用越高。"],
        proof: [DC_CORP_FEES, "Filing articles of incorporation for a corporation with authorized capital up to one hundred thousand dollars ($100,000) $99.00"] },
      "llc-qualify": { id: "dc-foreign-registration", doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (limited liability company)", fee: 220,
        proof: [DC_LLC_FEES, "Foreign Limited Liability Company Foreign registration statement $220.00"] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (business corporation)", fee: 220,
        proof: [DC_CORP_FEES, "Foreign Business Corporation Foreign registration statement $220.00"] },
    },
  },
  {
    st: "HI", name: ["Hawaii", "夏威夷州"], agency: ["Hawaii Department of Commerce and Consumer Affairs, Business Registration Division", "夏威夷州商业与消费者事务部企业登记处"],
    site: HI_FEES,
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 15, due: ["Every year", "每年"], q: [HI_FEES, "Annual Report (Domestic/Foreign) $15.00** $25.00"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 15, due: ["Every year", "每年"], q: [HI_FEES, "Annual Report of Domestic and Foreign Corporations Organized for $15.00** $25.00"] },
    },
    rows: {
      "llc-form": { id: "hi-llc", fee: 50, proof: [HI_LLC, "DOMESTIC LIMITED LIABILITY COMPANY FILING FEE EXPEDITED REVIEW Articles of Organization $50.00 $25.00"],
        x: [{ ...HI_X, q: [HI_LLC, "DOMESTIC LIMITED LIABILITY COMPANY FILING FEE EXPEDITED REVIEW Articles of Organization $50.00 $25.00"] }] },
      "corp-form": { form: "Form DP-1, Articles of Incorporation", fee: 50, proof: [HI_CORP, "DOMESTIC PROFIT CORPORATION FILING FEE EXPEDITED REVIEW Articles of Incorporation $50.00 $25.00"],
        x: [{ ...HI_X, q: [HI_CORP, "DOMESTIC PROFIT CORPORATION FILING FEE EXPEDITED REVIEW Articles of Incorporation $50.00 $25.00"] }] },
      "llc-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign limited liability company)", fee: 50,
        proof: [HI_FEES, "Liability Company Application for Certificate of Authority $50.00* $25.00"], x: [{ ...HI_X, q: [HI_FEES, "Liability Company Application for Certificate of Authority $50.00* $25.00"] }] },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for a Certificate of Authority (foreign profit corporation)", fee: 50,
        proof: [HI_FEES, "Application for a Certificate of Authority $50.00* $25.00"], x: [{ ...HI_X, q: [HI_FEES, "Application for a Certificate of Authority $50.00* $25.00"] }] },
    },
  },
  {
    st: "ID", name: ["Idaho", "爱达荷州"], agency: ["Idaho Secretary of State, Business and Commercial Services", "爱达荷州州务卿商业服务处"],
    site: ID_FORMS, portal: "https://sosbiz.idaho.gov/",
    p: [5, "About 3 to 5 days from the date of filing", "提交后约 3 至 5 天", [ID_FORMS, "Business Filings are currently being processed approximately 3-5 days from the date of filing."]],
    x: [{ label: ["Expedited", "加急"], turn: ["faster handling; no time is stated", "加快处理；未注明时限"], hours: null, fee: 40, q: [ID_CORP_PDF, "If expedited service is requested, add an additional $40.00 to the filing fee."], note: ["Paper forms (page 2)", "纸质表格（第 2 页）"] },
      ["same", 100, [ID_CORP_PDF, "If 'same day' service is requested, add $100.00 to the filing fee."], ["Paper forms (page 2)", "纸质表格（第 2 页）"]]],
    rows: {
      "llc-form": { doc: ["Certificate of Organization", "组织证书"], form: "Certificate of Organization, Limited Liability Company", fee: 100, feeNote: ID_PAPER,
        proof: [ID_FORMS, "Start an LLC Certificate of Organization – Limited Liability Company $100 (base filing fee)"] },
      "corp-form": { form: "Articles of Incorporation, General Business", fee: 100, feeNote: ID_PAPER, url: ID_CORP_PDF,
        proof: [ID_FORMS, "Start a corporation Articles of Incorporation – General Business $100 (base filing fee)"] },
      "llc-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (limited liability company)", fee: 100, feeNote: ID_PAPER,
        proof: [ID_FORMS, "Register an out-of-state business in Idaho Foreign Registration Statement $100 (base filing fee)"] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (corporation)", fee: 100, feeNote: ID_PAPER,
        proof: [ID_FORMS, "Register an out-of-state business in Idaho Foreign Registration Statement $100 (base filing fee)"] },
    },
  },
  {
    st: "IN", name: ["Indiana", "印第安纳州"], agency: ["Indiana Secretary of State, Business Services Division", "印第安纳州州务卿商业服务处"],
    site: IN_FEES, portal: "https://inbiz.in.gov/",
    rows: {
      "llc-form": { form: "Articles of Organization (domestic limited liability company)", fee: 75, feeNote: ["$75 filed online; $100 on paper (Indiana Code 23-0.5-9-19).", "在线 75 美元；纸质 100 美元（印第安纳州法典 23-0.5-9-19）。"],
        proof: [IN_FEES, "organization of a domestic limited liability company: (1) Seventy-five dollars ($75) for an electronic filing."] },
      "corp-form": { form: "Articles of Incorporation (domestic business corporation)", fee: 75, feeNote: ["$75 filed online; $100 on paper (Indiana Code 23-0.5-9-1).", "在线 75 美元；纸质 100 美元（印第安纳州法典 23-0.5-9-1）。"],
        proof: [IN_FEES, "incorporation of a domestic business corporation: (1) Seventy-five dollars ($75) for an electronic filing."] },
      "llc-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (limited liability company)", fee: 75, feeNote: IN_FOREIGN_NOTE,
        proof: [IN_FEES, "registration statement electronically: (1) Seventy-five dollars ($75) for a for-profit entity."] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (corporation)", fee: 75, feeNote: IN_FOREIGN_NOTE,
        proof: [IN_FEES, "registration statement electronically: (1) Seventy-five dollars ($75) for a for-profit entity."] },
    },
  },
  {
    st: "IA", name: ["Iowa", "爱荷华州"], agency: ["Iowa Secretary of State, Business Services", "爱荷华州州务卿商业服务处"],
    site: IA_FEES,
    report: {
      llc: { name: ["Biennial report", "双年报"], fee: 30, due: ["Odd-numbered years, January 1 to April 1", "单数年份 1 月 1 日至 4 月 1 日"],
        q: [IA_FEES, "Every Odd numbered year beginning January 1st and due by April 1st."], feeQ: [IA_FEES, "$30* by online filing or $45* by paper."] },
      corp: { name: ["Biennial report", "双年报"], fee: 60, due: ["Even-numbered years, January 1 to April 1", "双数年份 1 月 1 日至 4 月 1 日"],
        q: [IA_FEES, "Every Even numbered year beginning January 1st and due by April 1st. The filing fee is $60."] },
    },
    rows: {
      "llc-form": { doc: ["Certificate of Organization", "组织证书"], form: "Certificate of Organization (limited liability company)", fee: 50, proof: [IA_FEES, "Certificate of Organization - $50"] },
      "corp-form": { form: "Articles of Incorporation (profit corporation)", fee: 50, proof: [IA_FEES, "Articles of Incorporation - $50"] },
      "llc-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (limited liability company)", fee: 100, proof: [IA_FEES, "Foreign Registration Statement- $100"] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (profit corporation)", fee: 100, proof: [IA_FEES, "Foreign Registration Statement - $100"] },
    },
  },
  {
    st: "KS", name: ["Kansas", "堪萨斯州"], agency: ["Kansas Secretary of State, Business Services", "堪萨斯州州务卿商业服务处"],
    site: "https://www.sos.ks.gov/forms/business_services/dl.pdf",
    rows: {
      "llc-form": { form: "Articles of Organization (Form DL)", fee: 85, feeNote: ["$85 online; $90 on paper.", "在线 85 美元；纸质 90 美元。"], url: "https://www.sos.ks.gov/forms/business_services/dl.pdf",
        proof: ["https://www.sos.ks.gov/forms/business_services/dl.pdf", "Online Articles of Organization:...................... $85"] },
      "corp-form": { form: "Articles of Incorporation (Form 51-01, for-profit corporation)", fee: 85, feeNote: ["$85 online; $90 on paper.", "在线 85 美元；纸质 90 美元。"], url: "https://sos.ks.gov/forms/business_services/AI.pdf",
        proof: ["https://sos.ks.gov/forms/business_services/AI.pdf", "For-profit Corporation online filing:................. $85"] },
      "llc-qualify": { doc: ["Application for Authority", "营业授权申请"], form: "Foreign Business Application for Authority (Form FA), limited liability company", fee: 115, url: KS_FA,
        proof: [KS_FA, "o Limited liability company o Series limited liability company (fee $115) (fee $115)"] },
      "corp-qualify": { doc: ["Application for Authority", "营业授权申请"], form: "Foreign Business Application for Authority (Form FA), corporation for profit", fee: 115, url: KS_FA,
        proof: [KS_FA, "o Corporation for profit o Limited partnership (fee $115) (fee $115)"] },
    },
  },
];

// Kentucky onward (src/forms/entity-data-3.ts)
MORE_STATES.push(...LATER_STATES);
