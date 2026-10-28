// The states' own pages for company formation and foreign qualification (src/forms/entities.ts has the rules and the
// builder). Each quote was copied from the page as fetched on READ_ENT and found there by scripts/eval/proof-read.py's
// matcher. Where a page refused automated reads, `blocked` says so and the row states nothing.
import type { CustomTier, Report, StateData, T, Tier } from "./entities";
import { MORE_STATES } from "./entity-data-2";

/* ------------------------------------------------------------------ Delaware */
const DE_FEES = "https://corpfiles.delaware.gov/Fee_Schedule/AugustFee2026.pdf";
const DE_EXP = "https://corp.delaware.gov/expserv/";
const DE_HOW = "https://corp.delaware.gov/howtoform/";
const DE_1H = [DE_EXP, "One Hour Service – $1,000.00 Processed within one hour of receipt."] as const;
const DE_2H = [DE_EXP, "Two Hour Service – $500.00 Processed within two hours of receipt."] as const;

/* ------------------------------------------------------------------ California */
const CA_LLC = "https://www.sos.ca.gov/business-programs/business-entities/forms/limited-liability-companies-california-domestic";
const CA_LLC_F = "https://www.sos.ca.gov/business-programs/business-entities/forms/limited-liability-companies-foreign-out-state-or-out-country";
const CA_CORP = "https://www.sos.ca.gov/business-programs/business-entities/forms/corporations-california-domestic";
const CA_CORP_F = "https://www.sos.ca.gov/business-programs/business-entities/forms/corporations-foreign-out-state-or-out-country";
const CA_SI = "https://www.sos.ca.gov/business-programs/business-entities/forms/corporations-statement-information";
const CA_OPT = "https://www.sos.ca.gov/business-programs/business-entities/service-options";

/* ------------------------------------------------------------------ New York */
const NY_FEES = "https://dos.ny.gov/fee-schedules";
const NY_BIEN = "https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies";

/* ------------------------------------------------------------------ Texas */
const TX_EXP = "https://www.sos.state.tx.us/express.shtml";

/* ------------------------------------------------------------------ Florida */
const FL_FEES = "https://dos.fl.gov/sunbiz/forms/fees/";
const FL_LLC_FORM = "https://form.sunbiz.org/pdf/cr2e047.pdf";
const FL_CORP_FORM = "https://form.sunbiz.org/pdf/cr2e010.pdf";
const FL_CORP_FOREIGN = "https://form.sunbiz.org/pdf/cr2e007.pdf";
const FL_LLC_FOREIGN = "https://dos.fl.gov/media/702554/cr2e027.pdf";
const FL_LLC_AGENT = ["https://www.flsenate.gov/Laws/Statutes/2025/605.0113", "that has a certificate of authority under s. 605.0902 shall designate and continuously maintain in this state:"] as const;
const FL_CORP_AGENT = ["https://www.flsenate.gov/Laws/Statutes/2025/607.0501", "Each corporation shall designate and continuously maintain in this state:"] as const;
const FL_LLC_FEE = [FL_FEES, "New Florida/Foreign LLC Filing Fee (required) $100.00 Registered Agent Fee (required) $25.00"] as const;
const FL_LLC_REPORT = { name: ["Annual Report", "年度报告"], fee: 138.75, due: ["Between January 1 and May 1 each year, from the year after it registers", "注册次年起，每年 1 月 1 日至 5 月 1 日之间"],
  q: [FL_LLC_FORM, "The report must be filed electronically online between January 1st and May 1st. The fee for the annual report is $138.75."] } as const;
const FL_CORP_REPORT = { name: ["Annual Report", "年度报告"], fee: 150, due: ["Between January 1 and May 1 each year, from the year after it registers", "注册次年起，每年 1 月 1 日至 5 月 1 日之间"],
  q: [FL_CORP_FORM, "The report must be filed electronically online between January 1st and May 1st. The fee for the annual report is $150."] } as const;

/* ------------------------------------------------------------------ Washington */
const WA_FEES = "https://www.sos.wa.gov/corporations-charities/frequently-asked-questions-faqs/fee-schedules-priority-services";
const WA_OLINE = "https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/";
const WA_REPORT = { name: ["Annual Report", "年度报告"], fee: 70, due: ["By the last day of the month the company was formed or registered, every year", "每年在公司成立或注册月份的最后一天前"],
  q: ["https://www.sos.wa.gov/corporations-charities/business-entities/maintain-business-compliance/annual-reports", "This annual report is due by the last day of the month in which the business was originally formed or registered."],
  feeQ: [WA_FEES, "Annual Report $70 Annual Report with delinquency fee $95"] } as const;
const WA_FOREIGN_FEE = ["https://www.sos.wa.gov/sites/default/files/2025-06/6.2025%20-%20FO%20Profit%20Foreign%20Registration%20Statement.pdf", "The filing fee is $180 for all business types."] as const;

/* ------------------------------------------------------------------ Nevada: nvsos.gov walls off automated reads (Incapsula), so
   the fees are the Nevada Revised Statutes' own (leg.state.nv.us), and no expedite tier or processing time is stated */
const NRS_86 = "https://www.leg.state.nv.us/nrs/nrs-086.html";
const NRS_78 = "https://www.leg.state.nv.us/nrs/nrs-078.html";
const NRS_80 = "https://www.leg.state.nv.us/nrs/nrs-080.html";
const NV_BLOCKED = "nvsos.gov answered every automated read on 2026-10-27 with an Incapsula wall (\"Request unsuccessful\"), and WebFetch got an empty page: expedite tiers and processing times are on the Secretary's fee schedule, for a person to read in a browser.";
const NV_LLC_FEE = [NRS_86, "(a) Filing the original articles of organization, or for registration of a foreign company, $75;"] as const;

/* ------------------------------------------------------------------ Illinois: ilsos.gov refuses automated reads and robots-disallows
   fetches; the LLC fees are 805 ILCS 180/50-10 on ilga.gov, read with WebFetch (curl gets a certificate error) */
const ILCS_50_10 = "https://ilga.gov/Documents/legislation/ilcs/documents/080501800K50-10.htm";
const IL_BLOCKED = "ilsos.gov refused every automated read on 2026-10-27 (HTTP/2 stream reset; WebFetch: robots disallowed), and the Business Corporation Act's fee section on ilga.gov refused WebFetch too (robots disallowed): the corporation's form and fee are for a person to read in a browser.";

/* ------------------------------------------------------------------ New Jersey */
const NJ_FEES = "https://www.nj.gov/treasury/revenue/fees.shtml";
const NJ_LLC_X = "Same Day service fee (FAX filing only) 2 hour service fee, per document 1 hour service fee, per document $25.00 $50.00 $500.00 $1000.00";
const NJ_CORP_X = "per filing for corporations and limited partnerships 2 hour service fee, per document 1 hour service fee, per document $15.00 $500.00 $1000.00";
const NJ_COUNTER: T = ["Over the counter in Trenton", "仅限特伦顿柜台办理"];
const NJ_CORP_TIERS: (Tier | CustomTier)[] = [
  { label: ["Expedited (counter)", "柜台加急"], turn: ["handled ahead of the queue; no time is stated on the fee page", "优先处理；收费页面未注明时限"], hours: null, fee: 15,
    q: [NJ_FEES, NJ_CORP_X], note: ["Over-the-counter transactions only", "仅限柜台办理"] },
  ["2h", 500, [NJ_FEES, NJ_CORP_X], NJ_COUNTER], ["1h", 1000, [NJ_FEES, NJ_CORP_X], NJ_COUNTER],
];

/* ------------------------------------------------------------------ Georgia: sos.ga.gov answers 403; georgia.gov's guides state the fees and times */
const GA_LLC = "https://georgia.gov/register-llc";
const GA_CORP = "https://georgia.gov/register-corporation";
const GA_X = (page: string): (Tier | CustomTier)[] => [
  { label: ["2 business days", "2 个工作日加急"], turn: ["within 2 business days", "2 个工作日内办结"], hours: 48, fee: 100, q: [page, "Processing in 2 business days costs an additional $100."] },
  ["same", 250, [page, "Processing in the same business day (if submitted before noon on a weekday) costs an additional $250."], ["Submitted before noon on a weekday", "须在工作日中午前提交"]],
  ["1h", 1000, [page, "Processing in one hour costs an additional $1,000."], ["By mail or in person, not online", "限邮寄或现场提交，不适用于在线提交"]],
];
const GA_BLOCKED = "sos.ga.gov answered 403 to every automated read on 2026-10-27 (its fee schedule PDF included): the foreign registration's fee is for a person to read in a browser.";

/* ------------------------------------------------------------------ Massachusetts */
const MA_FEES = "https://www.sec.state.ma.us/divisions/corporations/download/Fee_Schedule.pdf";
const MA_FAX: Pick<CustomTier, "label" | "turn" | "hours"> = { label: ["Filed by fax or online", "传真或在线提交"], turn: ["handled as an expedited filing; no time is published", "按加急处理；未公布时限"], hours: null };

/* ------------------------------------------------------------------ Pennsylvania */
const PA_FEES = "https://www.pa.gov/agencies/dos/programs/business/fees-and-payments";
const PA_X: (Tier | CustomTier)[] = [
  ["1h", 1000, [PA_FEES, "1 hour service (received before 4:00 p.m.) $1,000"], ["Received before 4:00 p.m.", "须在下午 4:00 前收到"]],
  { label: ["3-hour", "3 小时加急"], turn: ["within 3 hours", "3 小时内办结"], hours: 3, fee: 300, q: [PA_FEES, "3 hour service (received before 2:00 p.m.) $300"], note: ["Received before 2:00 p.m.", "须在下午 2:00 前收到"] },
  ["same", 100, [PA_FEES, "Same-day service (received before 10:00 a.m.) $100"], ["Received before 10:00 a.m.", "须在上午 10:00 前收到"]],
];
const PA_REPORT: Report = { name: ["Annual Report", "年度报告"], fee: 7, due: ["Every year", "每年"], q: [PA_FEES, "All other annual reports (for profit entities) $7"] };

export const ENTITY_STATES: StateData[] = [
  {
    st: "DE", name: ["Delaware", "特拉华州"], agency: ["Delaware Division of Corporations", "特拉华州公司处"],
    site: DE_HOW, portal: "https://corp.delaware.gov/document-upload-service-information/",
    agent: [DE_HOW, "Delaware law requires that every business entity have and maintain a Registered Agent in the State of Delaware"],
    report: {
      llc: { name: ["LLC annual tax (no annual report)", "LLC 年度税（无需年报）"], fee: 300, due: ["By June 1 each year", "每年 6 月 1 日前"],
        q: [DE_HOW, "pay an annual tax of $300.00. Taxes for these entities are to be received no later than June 1st of each year."] },
      corp: { name: ["Annual Report and franchise tax", "年度报告及特许经营税"], fee: 50, due: ["By March 1 each year, with the franchise tax", "每年 3 月 1 日前，连同特许经营税"],
        q: [DE_HOW, "Taxes and Annual Reports are to be received no later than March 1st of each year."],
        feeQ: [DE_HOW, "For an Annual Report or Amended Annual Report for non-exempt domestic corporations the filing fee is $50."] },
    },
    rows: {
      "llc-form": { doc: ["Certificate of Formation", "成立证书"], form: "Certificate of Formation (limited liability company)", fee: 110,
        proof: [DE_FEES, "Formation – domestic $110.00 $50.00 $100.00 $50.00"],
        x: [["1h", 1000, DE_1H], ["2h", 500, DE_2H], ["same", 100, [DE_FEES, "Formation – domestic $110.00 $50.00 $100.00 $50.00"]], ["24h", 50, [DE_FEES, "Formation – domestic $110.00 $50.00 $100.00 $50.00"]]] },
      "corp-form": { doc: ["Certificate of Incorporation", "公司注册证书"], form: "Certificate of Incorporation (stock corporation)", fee: 109,
        feeNote: ["The least it costs: the fee rises with the authorized stock.", "最低费用：随授权股本增加。"],
        proof: [DE_FEES, "Incorporation (including Public Benefit Corporations) *$109.00 $50.00 $100.00 $50.00"],
        x: [["1h", 1000, DE_1H], ["2h", 500, DE_2H], ["same", 100, [DE_FEES, "Incorporation (including Public Benefit Corporations) *$109.00 $50.00 $100.00 $50.00"]],
          ["24h", 50, [DE_FEES, "Incorporation (including Public Benefit Corporations) *$109.00 $50.00 $100.00 $50.00"]]] },
      "llc-qualify": { doc: ["Foreign LLC Registration", "外州 LLC 注册"], form: "Foreign Certificate of Registration (limited liability company)", fee: 200, report: null,
        proof: [DE_FEES, "Foreign Certificate of Registration $200.00 $50.00 $100.00 $50.00"],
        x: [["1h", 1000, DE_1H], ["2h", 500, DE_2H], ["same", 100, [DE_FEES, "Foreign Certificate of Registration $200.00 $50.00 $100.00 $50.00"]], ["24h", 50, [DE_FEES, "Foreign Certificate of Registration $200.00 $50.00 $100.00 $50.00"]]] },
      "corp-qualify": { doc: ["Foreign Corporation Qualification", "外州公司资格登记"], form: "Qualification of a Foreign Corporation", fee: 245, report: null,
        proof: [DE_FEES, "Corporations – Foreign Qualification $245.00 $50.00 $100.00 $50.00"],
        x: [["1h", 1000, DE_1H], ["2h", 500, DE_2H], ["same", 100, [DE_FEES, "Corporations – Foreign Qualification $245.00 $50.00 $100.00 $50.00"]], ["24h", 50, [DE_FEES, "Corporations – Foreign Qualification $245.00 $50.00 $100.00 $50.00"]]] },
    },
  },
  {
    st: "CA", name: ["California", "加州"], agency: ["California Secretary of State", "加州州务卿"],
    site: "https://www.sos.ca.gov/business-programs/business-entities/forms", portal: "https://bizfileonline.sos.ca.gov/", loginOnly: true,
    p: [5, "5 days or less when filed online; 10 days or more on the PDF forms", "在线提交 5 天以内；PDF 纸质表格 10 天以上", [CA_LLC, "File Online for fastest response 5 days or less"]],
    x: [["24h", 350, [CA_OPT, "24–Hour Filing Service (Class C) - $350.00 : Online or Drop-Off in Sacramento."]],
      ["same", 750, [CA_OPT, "Same Day Filing Service (Class B) - $750.00 : Online or Drop-Off in Sacramento."], ["Received by 9:30 a.m., answered by 4:00 p.m.", "须在上午 9:30 前收到，下午 4:00 前答复"]],
      ["4h", 500, [CA_OPT, "4–Hour Filing Service (Class A) - $500.00 : Drop-Off-Only in Sacramento."], ["Dropped off in Sacramento only, after a paid preclearance", "仅限萨克拉门托现场递交，且须先付费预审"]]],
    agent: ["https://www.sos.ca.gov/business-programs/business-entities/faqs", "An agent for service of process is an individual who resides in California, or a registered 1505 corporate agent,"],
    report: {
      llc: { name: ["Statement of Information (Form LLC-12)", "信息声明（LLC-12 表）"], fee: 20, due: ["Within 90 days of registering, then every two years", "注册后 90 天内，之后每两年一次"],
        q: [CA_LLC, "Statement of Information : Due within 90 days of initial registration and every two years thereafter."] },
      corp: { name: ["Statement of Information (Form SI-550)", "信息声明（SI-550 表）"], fee: 25, due: ["Within 90 days of registering, then every year", "注册后 90 天内，之后每年一次"],
        q: [CA_SI, "Statement of Information - Domestic and Foreign Stock : Due within 90 days of initial registration and every year thereafter."] },
    },
    rows: {
      "llc-form": { id: "ca-llc-1", fee: 70, proof: [CA_LLC, "Formation - Articles of Organization Form LLC-1 (PDF) $70.00"] },
      "corp-form": { form: "Form ARTS-GS, Articles of Incorporation (general stock)", fee: 100, proof: [CA_CORP, "Articles of Incorporation - General Stock Form ARTS-GS (PDF) $100.00"] },
      "llc-qualify": { id: "ca-llc-5", fee: 70, proof: [CA_LLC_F, "Application to Register Form LLC-5 (PDF) $70.00"] },
      "corp-qualify": { doc: ["Statement and Designation by Foreign Corporation", "外州公司声明与指定书"], form: "Form S&DC-S/N, Statement and Designation by Foreign Corporation (stock)", fee: 100,
        proof: [CA_CORP_F, "Statement and Designation by Foreign Corporation - Stock Form S&DC-S/N (PDF) $100.00"] },
    },
  },
  {
    st: "NY", name: ["New York", "纽约州"], agency: ["New York Department of State, Division of Corporations", "纽约州务院公司处"],
    site: NY_FEES, portal: "https://dos.ny.gov/limited-liability-company-articles-organization",
    x: [["24h", 25, [NY_FEES, "For processing within 24 hours $25"]], ["same", 75, [NY_FEES, "For processing the same day $75"]], ["2h", 150, [NY_FEES, "For processing within 2 hours $150"]]],
    agent: ["https://dos.ny.gov/certificate-incorporation-domestic-business-corporation", "The corporation must designate the Secretary of State as its agent for service of process."],
    agentRequired: false, agentNote: ["The Secretary of State is the agent for service of process; a separate registered agent is optional.", "州务卿即为法律文书送达代理人；另设注册代理人为可选。"],
    report: {
      llc: { name: ["Biennial Statement", "双年报"], fee: 9, due: ["Every two years, in the month the company was formed or registered", "每两年一次，在公司成立或注册的月份"],
        q: [NY_BIEN, "are required by Section 301(e) of the Limited Liability Company Law to file a Biennial Statement every two years"], feeQ: [NY_BIEN, "$9 filing fee for Biennial Statement"] },
      corp: { name: ["Biennial Statement", "双年报"], fee: 9, due: ["Every two years, in the month the corporation was formed or registered", "每两年一次，在公司成立或注册的月份"],
        q: [NY_BIEN, "are required by Section 408 of the Business Corporation Law to file a Biennial Statement every two years"], feeQ: [NY_BIEN, "$9 filing fee for Biennial Statement"] },
    },
    rows: {
      "llc-form": { id: "ny-dos-1336", fee: 200, proof: [NY_FEES, "DOMESTIC Articles of Organization $200"] },
      "corp-form": { doc: ["Certificate of Incorporation", "公司注册证书"], form: "Certificate of Incorporation (DOS-1239-f, Business Corporation Law section 402)", fee: 125,
        url: "https://dos.ny.gov/certificate-incorporation-domestic-business-corporation", proof: [NY_FEES, "Incorporation (all corporations) $125"] },
      "llc-qualify": { id: "ny-dos-foreign-llc", fee: 250, proof: [NY_FEES, "FOREIGN Application for Authority $250"] },
      "corp-qualify": { doc: ["Application for Authority", "营业授权申请"], form: "Application for Authority (foreign business corporation, Business Corporation Law section 1304)", fee: 225,
        url: "https://dos.ny.gov/application-authority-foreign-business-corporation", proof: [NY_FEES, "Application for Authority (Foreign) $225"] },
    },
  },
  {
    st: "TX", name: ["Texas", "德州"], agency: ["Texas Secretary of State", "德州州务卿"],
    site: "https://www.sos.state.tx.us/corp/forms_boc.shtml", portal: "https://www.sos.state.tx.us/corp/sosda/index.shtml",
    x: [["same", 750, [TX_EXP, "Filings received by 12:00 p.m. are processed by close of business the same day. $750 per document"], ["Online through SOSPortal or in person in Austin", "通过 SOSPortal 在线或在奥斯汀现场申请"]],
      ["next", 500, [TX_EXP, "Filings received by 12:00 p.m. are processed by close of business the next business day. $500 per document"]],
      { label: ["Standard expedited", "标准加急"], turn: ["typically within 2 to 3 business days", "通常 2 至 3 个工作日"], hours: 72, fee: 50,
        q: [TX_EXP, "Filings are processed before regular submissions, typically within 2-3 business days. $50 per document"] }],
    agent: ["https://www.sos.state.tx.us/corp/instructions/205.shtml", "A person designated as the registered agent of an entity must have consented, either in a written or electronic form,"],
    report: {
      llc: { name: ["Franchise Tax Report and Public Information Report", "特许经营税报告及公开信息报告"], fee: null, due: ["By May 15 each year", "每年 5 月 15 日前"],
        q: ["https://comptroller.texas.gov/taxes/franchise/", "The annual franchise tax report is due May 15."] },
      corp: { name: ["Franchise Tax Report and Public Information Report", "特许经营税报告及公开信息报告"], fee: null, due: ["By May 15 each year", "每年 5 月 15 日前"],
        q: ["https://comptroller.texas.gov/taxes/franchise/", "The annual franchise tax report is due May 15."] },
    },
    rows: {
      "llc-form": { id: "tx-205", fee: 300, proof: ["https://www.sos.state.tx.us/corp/instructions/205.shtml", "The filing fee for a certificate of formation for an LLC is $300."] },
      "corp-form": { doc: ["Certificate of Formation", "成立证书"], form: "Form 201, Certificate of Formation (for-profit corporation)", fee: 300, url: "https://www.sos.state.tx.us/corp/forms/201_boc.pdf",
        proof: ["https://www.sos.state.tx.us/corp/instructions/201.shtml", "The filing fee for a Certificate of Formation for a for-profit corporation is $300."] },
      "llc-qualify": { id: "tx-304", fee: 750, proof: ["https://www.sos.state.tx.us/corp/instructions/304.shtml", "The filing fee for an application for registration for a limited liability company is $750."] },
      "corp-qualify": { doc: ["Application for Registration", "注册申请"], form: "Form 301, Application for Registration of a Foreign For-Profit Corporation", fee: 750, url: "https://www.sos.state.tx.us/corp/forms/301_boc.pdf",
        proof: ["https://www.sos.state.tx.us/corp/instructions/301.shtml", "The filing fee for an application for registration for a for-profit corporation is $750."] },
    },
  },
  {
    st: "FL", name: ["Florida", "佛罗里达州"], agency: ["Florida Department of State, Division of Corporations", "佛罗里达州务院公司处"],
    site: FL_FEES, portal: "https://dos.fl.gov/sunbiz/start-business/efile/",
    agent: FL_LLC_AGENT,
    report: { llc: FL_LLC_REPORT, corp: FL_CORP_REPORT },
    rows: {
      "llc-form": { id: "fl-sunbiz", fee: 125, feeNote: ["$100 filing fee and $25 for designating the registered agent.", "申请费 100 美元，另加指定注册代理人费 25 美元。"], proof: FL_LLC_FEE,
        url: "https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/" },
      "corp-form": { form: "Articles of Incorporation (Florida profit corporation, Form CR2E010)", fee: 70, url: "https://dos.fl.gov/sunbiz/start-business/efile/fl-profit-corporation/",
        feeNote: ["$35 filing fee and $35 for designating the registered agent.", "申请费 35 美元，另加指定注册代理人费 35 美元。"], agent: FL_CORP_AGENT,
        proof: [FL_FEES, "New Florida/Foreign Corporation Filing Fees $35.00 Registered Agent Designation $35.00"] },
      "llc-qualify": { id: "fl-sunbiz-foreign-llc", fee: 125, feeNote: ["$100 filing fee and $25 for designating the registered agent.", "申请费 100 美元，另加指定注册代理人费 25 美元。"], proof: FL_LLC_FEE,
        report: { ...FL_LLC_REPORT, q: [FL_LLC_FOREIGN, "The report must be filed electronically online between January 1st and May 1st. The fee for the annual report is $138.75."] } },
      "corp-qualify": { doc: ["Application by Foreign Corporation for Authorization to Transact Business", "外州公司在本州经营授权申请"], form: "Application by Foreign Profit Corporation for Authorization to Transact Business in Florida (Form CR2E007)",
        fee: 70, method: "pdf_mail", url: FL_CORP_FOREIGN, agent: FL_CORP_AGENT, report: { ...FL_CORP_REPORT, q: [FL_CORP_FOREIGN, "The report must be filed electronically online between January 1st and May 1st. The fee for the annual report is $150."] },
        proof: [FL_CORP_FOREIGN, "There is a $70.00 registration fee and a letter of acknowledgment will be issued free of charge upon registration."] },
    },
  },
  {
    st: "WA", name: ["Washington", "华盛顿州"], agency: ["Washington Secretary of State, Corporations and Charities Division", "华盛顿州州务卿公司与慈善处"],
    site: WA_FEES, portal: "https://ccfs.sos.wa.gov/", loginOnly: true,
    x: [{ label: ["Expedited", "加急"], turn: ["generally within three working days", "通常 3 个工作日内"], hours: 72, fee: 100,
        q: [WA_FEES, "Expedited service: $100 per business entity, generally processed within three working days."] },
      ["same", 150, [WA_FEES, "Same-day service: This service charges a \"same-day\" fee of $150 per business entity."],
        ["At the front counter in Tumwater. The Secretary's LLC page says the same-day fee isn't charged for now, due to system limitations.", "仅限 Tumwater 柜台办理。州务卿 LLC 页面称，因系统限制，当日加急费暂不收取。"]]],
    agent: ["https://www.sos.wa.gov/corporations-charities/business-entities/online-filing-instructions/start-domestic-wa-limited-liability-company-llc-online", "All businesses must designate a Registered Agent in Washington State, as required by RCW"],
    report: { llc: WA_REPORT, corp: WA_REPORT },
    rows: {
      "llc-form": { id: "wa-sos", fee: 180, proof: [WA_OLINE + "start-domestic-wa-limited-liability-company-llc-online", "Filing Fee: $180 in addition to an online processing fee."] },
      "corp-form": { form: "Articles of Incorporation (Washington profit corporation, RCW 23B)", fee: 180, url: WA_OLINE + "start-domestic-wa-profit-corporation-online",
        proof: [WA_OLINE + "start-domestic-wa-profit-corporation-online", "Filing Fee: $180 in addition to an online processing fee."] },
      "llc-qualify": { id: "wa-sos-foreign", fee: 180, url: WA_OLINE + "register-foreign-non-wa-limited-liability-company-llc-online", proof: WA_FOREIGN_FEE },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (RCW 23.95), profit corporation", fee: 180,
        url: WA_OLINE + "register-foreign-non-wa-profit-corporation-online", proof: [WA_OLINE + "register-foreign-non-wa-profit-corporation-online", "Filing Fee: $180 in addition to an online processing fee."] },
    },
  },
  {
    st: "NV", name: ["Nevada", "内华达州"], agency: ["Nevada Secretary of State, Commercial Recordings", "内华达州州务卿商业登记处"],
    site: "https://www.nvsilverflume.gov", portal: "https://www.nvsilverflume.gov", speedBlocked: NV_BLOCKED,
    agent: [NRS_86, "Registered agent required; address of registered office. A limited-liability company shall have a"],
    report: {
      llc: { name: ["Annual list of managers or members", "年度经理/成员名单"], fee: 150, due: ["By the last day of the anniversary month of its formation, every year", "每年在成立周年月份的最后一天前"],
        q: [NRS_86, "on or before the last day of the month in which the anniversary date of its organization occurs,"],
        feeQ: [NRS_86, "(b) Each annual list required by subsection 2, the limited-liability company shall pay to the Secretary of State a fee of $150."] },
      corp: { name: ["Annual list of officers and directors", "年度高管和董事名单"], fee: 150, due: ["By the last day of the anniversary month of incorporation, every year", "每年在注册周年月份的最后一天前"],
        q: [NRS_78, "on or before the last day of the month in which the anniversary date of incorporation occurs in each year,"],
        feeQ: [NRS_78, "Subsection 1, the corporation shall pay to the Secretary of State a fee of $150."] },
    },
    rows: {
      "llc-form": { id: "nv-silverflume", fee: 75, proof: NV_LLC_FEE,
        feeNote: ["$75 for the articles; the initial list of managers or members ($150) and the state business license are filed with them.", "组织章程 75 美元；首份经理/成员名单（150 美元）和州营业执照随之一并提交。"] },
      "corp-form": { form: "Articles of Incorporation (NRS 78.035)", fee: 75, proof: [NRS_78, "The fee for filing articles of incorporation is prescribed in the following schedule:"],
        feeNote: ["The least it costs, for shares worth $75,000 or less: the fee rises with the authorized stock. The initial list ($150) and the state business license are filed with it.", "最低费用（股本价值 75,000 美元或以下）：随授权股本增加。首份名单（150 美元）和州营业执照随之一并提交。"] },
      "llc-qualify": { id: "nv-foreign-registration", doc: ["Application for Registration of a Foreign Limited-Liability Company", "外州有限责任公司注册申请"], form: "Application for Registration of a Foreign Limited-Liability Company (NRS 86.544)", fee: 75, proof: NV_LLC_FEE },
      "corp-qualify": { doc: ["Qualification of a Foreign Corporation", "外州公司资格登记"], form: "Qualification to do business in Nevada (foreign corporation, NRS 80.010)", fee: 75,
        feeNote: ["The same fee a Nevada corporation pays for its articles: $75 at the least, rising with the authorized stock.", "与内华达州本地公司提交章程的费用相同：最低 75 美元，随授权股本增加。"],
        proof: [NRS_80, "foreign corporations shall pay the same fees to the Secretary of State as are required to be paid by corporations organized"] },
    },
  },
  {
    st: "IL", name: ["Illinois", "伊利诺伊州"], agency: ["Illinois Secretary of State, Department of Business Services", "伊利诺伊州州务卿商业服务处"],
    site: "https://www.ilsos.gov/departments/business-services/home.html", portal: "https://www.ilsos.gov/departments/business-services/organization/llc-instructions.html",
    blocked: IL_BLOCKED,
    report: { llc: { name: ["Annual Report", "年度报告"], fee: 75, due: ["Every year", "每年"], q: [ILCS_50_10, "Filing an annual report of a limited liability company or foreign limited liability company, $75,"] } },
    rows: {
      "llc-form": { id: "il-sos", fee: 150, proof: [ILCS_50_10, "Filing articles of organization (domestic), application for admission (foreign), and restated articles of organization (domestic), $150."] },
      "llc-qualify": { id: "il-sos-foreign-llc", fee: 150, proof: [ILCS_50_10, "Filing articles of organization (domestic), application for admission (foreign), and restated articles of organization (domestic), $150."] },
      "corp-form": { doc: ["Articles of Incorporation", "公司章程"] },
      "corp-qualify": { doc: ["Application for Authority to Transact Business", "营业授权申请"] },
    },
  },
  {
    st: "NJ", name: ["New Jersey", "新泽西州"], agency: ["New Jersey Division of Revenue and Enterprise Services", "新泽西州税收与企业服务处"],
    site: NJ_FEES, portal: "https://www.njportal.com/DOR/BusinessFormation/",
    agent: ["https://www.njportal.com/DOR/BusinessFormation/", "Registered Agent information (including Email Address to receive Registered Agent notifications)"],
    x: [{ label: ["Expedited (counter)", "柜台加急"], turn: ["handled ahead of the queue; no time is stated on the fee page", "优先处理；收费页面未注明时限"], hours: null, fee: 25,
        q: [NJ_FEES, "per filing Same Day service fee (FAX filing only) 2 hour service fee, per document 1 hour service fee, per document $25.00"], note: ["Over-the-counter transactions only", "仅限柜台办理"] },
      ["same", 50, [NJ_FEES, NJ_LLC_X], ["Faxed filings only", "仅限传真提交"]], ["2h", 500, [NJ_FEES, NJ_LLC_X], NJ_COUNTER], ["1h", 1000, [NJ_FEES, NJ_LLC_X], NJ_COUNTER]],
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 75, due: ["Every year", "每年"], q: [NJ_FEES, "Renewal of LLC alternate name $50.00 Annual Report $75.00"] },
      corp: { name: ["Annual Report", "年度报告"], fee: 75, due: ["Every year", "每年"], q: [NJ_FEES, "Annual Report - corporate and LP (Expediting is not available on this item.) $75.00"] },
    },
    rows: {
      "llc-form": { id: "nj-formation", fee: 100, proof: [NJ_FEES, "Certificate of formation $100.00 Certificate of registration for a foreign LLC $100.00"] },
      "corp-form": { doc: ["Certificate of Incorporation", "公司注册证书"], form: "Certificate of Incorporation (Public Records Filing for New Business Entity)", fee: 100, x: NJ_CORP_TIERS,
        proof: [NJ_FEES, "Certificate of incorporation or limited partnership $100.00 Certificate of authority for a foreign corporation or limited partnership $100.00"] },
      "llc-qualify": { id: "nj-foreign-registration", doc: ["Certificate of Registration (foreign LLC)", "外州 LLC 注册证书"], form: "Certificate of Registration of a Foreign LLC (Public Records Filing for New Business Entity)", fee: 100,
        proof: [NJ_FEES, "Certificate of formation $100.00 Certificate of registration for a foreign LLC $100.00"] },
      "corp-qualify": { doc: ["Certificate of Authority", "营业授权证书"], form: "Certificate of Authority for a Foreign Corporation (Public Records Filing for New Business Entity)", fee: 100, x: NJ_CORP_TIERS,
        proof: [NJ_FEES, "Certificate of incorporation or limited partnership $100.00 Certificate of authority for a foreign corporation or limited partnership $100.00"] },
    },
  },
  {
    st: "GA", name: ["Georgia", "佐治亚州"], agency: ["Georgia Secretary of State, Corporations Division", "佐治亚州州务卿公司处"],
    site: GA_LLC, portal: "https://ecorp.sos.ga.gov/", loginOnly: true, blocked: GA_BLOCKED,
    p: [9, "7 business days online; 15 business days by mail", "在线 7 个工作日；邮寄 15 个工作日", [GA_LLC, "Processing Time: 7 business days; Processing in 2 business days costs an additional $100."]],
    x: GA_X(GA_LLC),
    agent: [GA_LLC, "A registered agent must be located in Georgia."],
    report: {
      llc: { name: ["Annual registration", "年度登记"], fee: null, due: ["Between January 1 and April 1 each year", "每年 1 月 1 日至 4 月 1 日之间"], q: [GA_LLC, "Each year, you must file an annual registration for your LLC between January 1 and April 1."] },
      corp: { name: ["Annual registration", "年度登记"], fee: null, due: ["An initial registration within 90 days of incorporation, then every year", "注册后 90 天内首次登记，之后每年一次"],
        q: [GA_CORP, "Within 90 days of incorporation, each Georgia corporation must file an initial annual registration that lists three principal officers"] },
    },
    rows: {
      "llc-form": { id: "ga-sos", fee: 100, feeNote: ["$100 online; $110 on paper by mail.", "在线 100 美元；纸质邮寄 110 美元。"], proof: [GA_LLC, "Pay the $100 filing fee by approved credit card: Visa, MasterCard, American Express, or Discover."] },
      "corp-form": { form: "Articles of Incorporation (with the Form CD 227 transmittal)", fee: 100, feeNote: ["$100 online; $110 on paper by mail.", "在线 100 美元；纸质邮寄 110 美元。"],
        p: [9, "7 business days online; 15 business days by mail", "在线 7 个工作日；邮寄 15 个工作日", [GA_CORP, "Processing Time: 7 business days; registrations can be expedited for an additional fee."]], x: GA_X(GA_CORP),
        proof: [GA_CORP, "Pay the $100 filing fee by approved credit card: Visa, MasterCard, American Express, or Discover."] },
      "llc-qualify": { id: "ga-sos-foreign", p: null, x: null },
      "corp-qualify": { doc: ["Application for Certificate of Authority", "营业授权证书申请"], form: "Application for Certificate of Authority (foreign corporation, eCorp)", p: null, x: null,
        report: { name: ["Annual registration", "年度登记"], fee: null, due: ["Every year", "每年"], q: [GA_CORP, "Within 90 days of incorporation, each Georgia corporation must file an initial annual registration that lists three principal officers"] },
        proof: [GA_CORP, "Foreign entities must follow a different procedure to do business in Georgia."] },
    },
  },
  {
    st: "MA", name: ["Massachusetts", "马萨诸塞州"], agency: ["Secretary of the Commonwealth of Massachusetts, Corporations Division", "马萨诸塞州州务卿公司处"],
    site: MA_FEES, portal: "https://corp.sec.state.ma.us/corpweb/loginsystem/externallogin.aspx", loginOnly: true,
    report: {
      llc: { name: ["Annual Report", "年度报告"], fee: 500, due: ["On or before the anniversary date of organization, every year", "每年在成立周年日或之前"],
        q: [MA_FEES, "Annual Report $500.00 $500.00 plus $20.00 expedite fee $500.00 plus $20.00 expedite fee Due on or before the anniversary date of organization."] },
      corp: { name: ["Annual Report", "年度报告"], fee: 125, due: ["Within 2½ months after the end of the fiscal year", "财政年度结束后两个半月内"],
        q: [MA_FEES, "within two and one half months of the fiscal year end to be considered on time."],
        feeQ: [MA_FEES, "Annual Report for Domestic $125.00, $150.00 if late."] },
    },
    rows: {
      "llc-form": { id: "ma-sos", fee: 500,
        x: [{ ...MA_FAX, fee: 20, q: [MA_FEES, "Certificate of Organization $500.00 $500.00 plus $20.00 expedite fee $500.00 plus $20.00 expedite fee"], note: ["Charged on every fax or online filing", "所有传真或在线提交均收取"] }] },
      "corp-form": { form: "Articles of Organization (business corporation, M.G.L. c. 156D)", fee: 275, feeNote: ["$275 at the least on paper (up to 275,000 shares); $250 plus a $15 expedite fee online.", "纸质提交最低 275 美元（最多 275,000 股）；在线提交 250 美元另加 15 美元加急费。"],
        proof: [MA_FEES, "Articles of Organization $275.00 min. for up to 275,000 shares, $250.00 plus $15.00 expedite fee"],
        x: [{ ...MA_FAX, fee: 15, q: [MA_FEES, "Articles of Organization $275.00 min. for up to 275,000 shares, $250.00 plus $15.00 expedite fee"], note: ["Charged on every fax or online filing", "所有传真或在线提交均收取"] }] },
      "llc-qualify": { id: "ma-sos-foreign-llc", fee: 500,
        report: { name: ["Annual Report", "年度报告"], fee: 500, due: ["On or before the anniversary date of registration, every year", "每年在注册周年日或之前"],
          q: [MA_FEES, "Annual Report $500.00 $500.00 plus $20.00 expedite fee $500.00 plus $20.00 expedite fee Due on or before anniversary date of registration."] } },
      "corp-qualify": { doc: ["Foreign Corporation Certificate of Registration", "外州公司注册证书"], form: "Foreign Corporation Certificate of Registration (M.G.L. c. 156D, s. 15.03)", fee: 400, method: "pdf_mail",
        feeNote: ["$400 by mail or by hand; $375 plus a $15 expedite fee by fax. It can't be filed online.", "邮寄或递交 400 美元；传真 375 美元另加 15 美元加急费。不能在线提交。"],
        proof: [MA_FEES, "Foreign Corporation Certiﬁcate of $400.00 $375 plus $15.00 expedite fee"],
        x: [{ ...MA_FAX, label: ["Filed by fax", "传真提交"], fee: 15, q: [MA_FEES, "Foreign Corporation Certiﬁcate of $400.00 $375 plus $15.00 expedite fee"], note: ["Charged on a fax filing", "传真提交时收取"] }] },
    },
  },
  {
    st: "PA", name: ["Pennsylvania", "宾夕法尼亚州"], agency: ["Pennsylvania Department of State, Bureau of Corporations and Charitable Organizations", "宾夕法尼亚州州务厅公司与慈善组织局"],
    site: PA_FEES, portal: "https://file.dos.pa.gov/forms/business", x: PA_X,
    report: { llc: PA_REPORT, corp: PA_REPORT },
    rows: {
      "llc-form": { id: "pa-dos", fee: 125, proof: [PA_FEES, "Domestic Limited Liability Company Fee Certificate of Organization $125"] },
      "corp-form": { doc: ["Articles of Incorporation", "公司章程"], form: "Articles of Incorporation (for-profit corporation)", fee: 125,
        proof: [PA_FEES, "Articles of Incorporation or like instrument incorporating a corporation or association $125"] },
      "llc-qualify": { id: "pa-foreign-registration", doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (foreign limited liability company)", fee: 250,
        proof: [PA_FEES, "Foreign Limited Liability Partnership/Limited Liability Company Fee Registration $250"] },
      "corp-qualify": { doc: ["Foreign Registration Statement", "外州注册声明"], form: "Foreign Registration Statement (foreign corporation)", fee: 250,
        proof: [PA_FEES, "Foreign Registration Statement $250 Amendment of Foreign Registration $250"] },
    },
  },
];

// the rest of the states, alphabetically (src/forms/entity-data-2.ts)
ENTITY_STATES.push(...MORE_STATES);
