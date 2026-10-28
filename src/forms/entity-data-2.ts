// Company formation and foreign qualification: the rest of the states, in alphabetical order (the priority states are in
// src/forms/entity-data.ts). Same rules: each quote was copied from the official page as fetched on READ_ENT and found
// there by scripts/eval/proof-read.py's matcher; a page that refused automated reads leaves its row UNVERIFIED with the
// reason, stating nothing.
import type { CustomTier, Report, StateData, Tier } from "./entities";

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
      "llc-qualify": { id: "az-acc-foreign", fee: 150, proof: [AZ_LLC_FEES, "Foreign Registration Statement $150.00 $185.00"],
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
      "llc-qualify": { doc: ["Statement of Foreign Entity Authority", "外州实体授权声明"], form: "Statement of Foreign Entity Authority (limited liability company)", fee: 100, proof: CO_FOREIGN,
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
];
