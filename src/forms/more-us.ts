// More US forms Placetta fills on the agency's own PDF (forms coverage, batch 3, read on 2026-10-18): IRS
// authorizations and elections a China-based owner meets after forming (8821, 2848, 8832, 8822-B, 7004 and the pro
// forma 1120 that carries Form 5472), California's alcohol license questionnaires and the Statement of Information,
// New York City's consumer license application, Florida's fictitious name, and Cook County's food license. Each line
// list comes from its box map (src/forms/maps); the forms that are filed only alongside another, or only in some
// openings, are reference forms: in the library and answers, never added to an instant plan by themselves.
import { B } from "../bi";
import type { OfficialForm, Segment } from "./registry";

const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const R = "restaurant" as const, T = "retail" as const;
const IRS = B("Internal Revenue Service", "美国国税局（IRS）");
const ABC = B("California Department of Alcoholic Beverage Control", "加州酒精饮料管理局（ABC）");
const ABC_HOW = B("Filed with the license application at the ABC district office for the premises (by appointment or as the office directs), with the license fee; the office lists what goes in the packet.", "与酒牌申请一起向经营场所所属的 ABC 地区办公室提交（预约或按该办公室指示），同时缴纳执照费；办公室会列出申请材料清单。");
const ABC_INFO = "https://www.abc.ca.gov/licensing/license-forms/new-license-application/";

export const MORE_US: OfficialForm[] = [
  /* ------------------------------- federal: IRS ------------------------------- */
  {
    id: "irs-8821", form: "Form 8821 (Rev. January 2021)", title: B("Tax Information Authorization", "税务信息授权书"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_fax", order: 94,
    how: B("Lets a person or firm (an accountant, a bookkeeper, Placetta's team) see the business's IRS records; it does not let them act for the business. Signed by an officer, then submitted online, faxed or mailed to the IRS unit for the business's state.", "允许某人或机构（会计、记账员、快哉团队）查看企业在 IRS 的记录，但不能代表企业办理事务。由高管签署后，在线提交，或传真、邮寄至企业所在州对应的 IRS 部门。"),
    url: "https://www.irs.gov/pub/irs-pdf/f8821.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f8821.pdf", info: "https://www.irs.gov/forms-pubs/about-form-8821",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-2848", form: "Form 2848 (Rev. January 2021)", title: B("Power of Attorney and Declaration of Representative", "授权委托书及代理人声明"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_fax", order: 94,
    how: B("Appoints an attorney, CPA or enrolled agent to represent the business before the IRS. The taxpayer signs Part I and the representative signs Part II; then it is submitted online, faxed or mailed to the IRS unit for the business's state.", "委任律师、注册会计师或注册代理人在 IRS 面前代表企业。纳税人签署第一部分，代理人签署第二部分，然后在线提交，或传真、邮寄至企业所在州对应的 IRS 部门。"),
    url: "https://www.irs.gov/pub/irs-pdf/f2848.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f2848.pdf", info: "https://www.irs.gov/forms-pubs/about-form-2848",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-8832", form: "Form 8832 (Rev. December 2013)", title: B("Entity Classification Election", "实体分类选择"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_mail", order: 16,
    how: B("Only when the LLC wants a tax classification other than its default (a single-owner LLC is disregarded, a multi-owner LLC a partnership): for example to be taxed as a corporation. Mailed to the IRS service center for the business's state; the election can take effect up to 75 days before it is filed.", "仅当 LLC 希望采用默认以外的税务分类时提交（单一所有者 LLC 默认为非独立实体，多所有者默认为合伙），例如选择按公司纳税。邮寄至企业所在州对应的 IRS 服务中心；选择最多可追溯至提交前 75 天生效。"),
    url: "https://www.irs.gov/pub/irs-pdf/f8832.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f8832.pdf", info: "https://www.irs.gov/forms-pubs/about-form-8832",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-8822b", form: "Form 8822-B (Rev. December 2019)", title: B("Change of Address or Responsible Party — Business", "企业地址或负责人变更"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_mail", order: 96,
    how: B("Tells the IRS the business's new mailing address, location or responsible party. A change of responsible party must be reported within 60 days. Mailed to the IRS address for the old address's state, printed on the form.", "告知 IRS 企业的新邮寄地址、营业地点或负责人。负责人变更须在 60 天内申报。按原地址所在州邮寄至表格上印明的 IRS 地址。"),
    url: "https://www.irs.gov/pub/irs-pdf/f8822b.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f8822b.pdf", info: "https://www.irs.gov/forms-pubs/about-form-8822-b",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-2553", form: "Form 2553 (Rev. December 2017)", title: B("Election by a Small Business Corporation (S corporation)", "小型企业公司选择（S 公司）"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { reference: true }, method: "pdf_fax", order: 17,
    how: B("Only for a corporation (or an LLC electing to be taxed as one) whose shareholders are all US citizens or residents: every shareholder signs the consent, then it is faxed or mailed to the IRS service center for the business's state, no more than 2 months and 15 days after the start of the tax year the election takes effect.", "仅适用于所有股东均为美国公民或居民的公司（或选择按公司纳税的 LLC）：所有股东签署同意书后，在选择生效的纳税年度开始后 2 个月零 15 天内，传真或邮寄至企业所在州对应的 IRS 服务中心。"),
    url: "https://www.irs.gov/pub/irs-pdf/f2553.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f2553.pdf", info: "https://www.irs.gov/forms-pubs/about-form-2553",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-7004", form: "Form 7004 (Rev. December 2025)", title: B("Automatic extension of time to file business returns", "营业申报自动延期申请"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { foreignOwned: true, reference: true }, method: "pdf_fax", order: 89,
    how: B("Extends the time to file the pro forma Form 1120 and the Form 5472 a foreign-owned single-member LLC files with it by six months; it does not extend the time to pay. Filed by the return's due date with \"Foreign-owned U.S. DE\" across the top, faxed or mailed to the IRS PIN Unit in Ogden (not the regular Form 7004 address).", "将外资单一成员 LLC 的形式 1120 表及随附 5472 表的申报期限延长六个月，但不延长缴税期限。须在原申报截止日前提交，顶部写上 \"Foreign-owned U.S. DE\"，传真或邮寄至 IRS 位于 Ogden 的 PIN 部门（不使用 7004 表的常规地址）。"),
    url: "https://www.irs.gov/pub/irs-pdf/f7004.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f7004.pdf", info: "https://www.irs.gov/forms-pubs/about-form-7004",
    fee: 0, checked: "page", fields: [],
  },
  {
    id: "irs-1120", form: "Form 1120 (2025), pro forma", title: B("Pro forma Form 1120 for a foreign-owned U.S. LLC", "外资美国 LLC 的形式 1120 表"),
    agency: IRS, level: "federal", where: "US", segments: ALL, needs: { foreignOwned: true }, unless: ["foreignEntity", "corp"], method: "pdf_fax", order: 90,
    how: B("A foreign-owned single-member LLC files Form 5472 attached to a pro forma Form 1120 with only its name, address, EIN and item E, and \"Foreign-owned U.S. DE\" across the top; it is faxed or mailed, never e-filed.", "外资单一成员 LLC 将 5472 表附在形式 1120 表上提交，1120 表只填名称、地址、EIN 和 E 项，并在顶部写上 \"Foreign-owned U.S. DE\"；以传真或邮寄提交，不能电子申报。"),
    url: "https://www.irs.gov/pub/irs-pdf/f1120.pdf", pdf: "https://www.irs.gov/pub/irs-pdf/f1120.pdf", info: "https://www.irs.gov/instructions/i5472",
    fee: 0, feeNote: B("No fee. The penalty for not filing Form 5472 starts at $25,000.", "不收费。未申报 5472 表罚款起点为 25,000 美元。"),
    renews: B("Every year, by the 15th day of the 4th month after the tax year ends.", "每年在纳税年度结束后第 4 个月 15 日前。"), checked: "page", fields: [],
  },

  /* ------------------------------- California ------------------------------- */
  {
    id: "ca-llc-12", form: "Form LLC-12 (REV 12/2022)", title: B("Statement of Information (California LLC)", "信息声明（加州 LLC）"),
    agency: B("California Secretary of State", "加州州务卿"), level: "state", where: "CA", segments: ALL, needs: { newEntity: true }, method: "online", order: 13,
    how: B("Due within 90 days of forming or registering the LLC in California, then every two years. Filed in bizfile Online, or on the paper form by mail.", "在加州成立或登记 LLC 后 90 天内提交，之后每两年一次。可在 bizfile Online 提交，或邮寄纸质表格。"),
    url: "https://bizfileonline.sos.ca.gov/", pdf: "https://bpd.cdn.sos.ca.gov/llc/forms/llc-12.pdf", info: "https://www.sos.ca.gov/business-programs/business-entities/statements",
    fee: 20, feeNote: B("$20 filing fee; a certified copy is $5 more. Filing late can bring a $250 penalty.", "申报费 20 美元；核证副本另加 5 美元。逾期申报可能被罚款 250 美元。"),
    renews: B("Every two years, in the anniversary month of formation and the five months before it.", "每两年一次，在成立周年月份及其前五个月内提交。"), checked: "page", fields: [],
    after: [{ form: "ca-llc-1", label: B("LLC formed with the Secretary of State", "已在州务卿处成立 LLC") }],
  },

  /* ------------------------------- Florida ------------------------------- */
  {
    id: "fl-fictitious", form: "CR4E001 (10/20)", title: B("Registration of a fictitious name (DBA)", "虚构名称（DBA）登记"),
    agency: B("Florida Department of State, Division of Corporations", "佛罗里达州务院公司处"), level: "state", where: "FL", segments: ALL, method: "online", order: 24,
    how: B("Needed before doing business under any name other than the legal name. Advertise the name once in a newspaper in the county, then register online at Sunbiz or mail the form with the fee.", "以法定名称以外的任何名称经营前必须办理。先在所在县的报纸刊登一次该名称，然后在 Sunbiz 在线登记，或连同费用邮寄表格。"),
    url: "https://dos.fl.gov/sunbiz/manage-business/efile/fictitious-name-registration/", pdf: "https://form.sunbiz.org/pdf/cr4e001.pdf", info: "https://dos.fl.gov/sunbiz/manage-business/efile/fictitious-name-registration/",
    fee: 50, feeNote: B("$50 non-refundable processing fee; a certificate of status is $10 and a certified copy $30 more.", "50 美元处理费，不予退还；存续证明另加 10 美元，核证副本另加 30 美元。"),
    renews: B("Every five years; registrations expire December 31 of the fifth year.", "每五年一次，于第五年 12 月 31 日到期。"), checked: "page", fields: [],
  },

  /* ------------------------------- Cook County, Illinois ------------------------------- */
  {
    id: "cook-food-license", form: "Retail Food Establishment License Application", title: B("Cook County retail food establishment license (unincorporated areas)", "库克县零售食品经营场所执照（非建制区）"),
    agency: B("Cook County Department of Public Health, Environmental Health Division", "库克县公共卫生局环境卫生处"), level: "county", where: "IL", segments: [R, T], needs: { food: true, reference: true }, method: "pdf_mail", order: 74,
    how: B("For a food business in unincorporated Cook County (Chicago and the suburbs with their own health departments license their own). Mail the application with a check for the license fee to the Environmental Health Division in Bridgeview; plans and the $300 plan review fee go first for a new place.", "适用于库克县非建制区的食品企业（芝加哥及设有卫生部门的郊区城市自行发证）。将申请表连同执照费支票邮寄至位于 Bridgeview 的环境卫生处；新开场所须先提交图纸及 300 美元图纸审查费。"),
    url: "https://cookcountypublichealth.org/contact-us/permits-and-licenses/retail-food-establishment-application/", pdf: "https://cookcountypublichealth.org/wp-content/uploads/2019/01/Retail-Food-License-Application.pdf",
    info: "https://cookcountypublichealth.org/contact-us/permits-and-licenses/retail-food-establishment-application/",
    fee: null, feeNote: B("$150 to $600 a year by seats ($150 for 1 to 25 seats), or $75 to $600 by square footage without seating; plan review $300.", "按座位数每年 150 至 600 美元（1 至 25 座 150 美元），无座位的按面积 75 至 600 美元；图纸审查 300 美元。"),
    renews: B("Every year.", "每年。"), checked: "page", fields: [],
  },

  /* ------------------------------- New York City ------------------------------- */
  {
    id: "nyc-dcwp-license", form: "Basic License Application (1/23/2023)", title: B("DCWP Basic License Application", "纽约市消费者与劳工保护局基本执照申请"),
    agency: B("NYC Department of Consumer and Worker Protection", "纽约市消费者与劳工保护局（DCWP）"), level: "city", where: "NYC", segments: [R, T, "seller"], needs: { reference: true }, method: "portal", order: 52,
    how: B("The general application for a DCWP license (for example a tobacco or electronic cigarette retail dealer, a stoop line stand, a scale or a sidewalk stand): it goes with the license's own checklist and documents, filed on the DCWP's online licensing system or at its Licensing Center.", "DCWP 执照的通用申请表（如烟草或电子烟零售商、店门前货摊、秤具或人行道摊位执照）：与该执照的清单和文件一起，通过 DCWP 网上执照系统或其执照中心提交。"),
    url: "https://www.nyc.gov/assets/dca/downloads/pdf/businesses/Basic-License-Application.pdf", pdf: "https://www.nyc.gov/assets/dca/downloads/pdf/businesses/Basic-License-Application.pdf",
    info: "https://www.nyc.gov/site/dca/businesses/licenses.page", fee: null, feeNote: B("Each license has its own fee.", "各类执照收费不同。"), checked: "page", fields: [],
  },

  /* ------------------- California ABC: the new retail license packet ------------------- */
  // The ABC's New License Application page lists these for every new retail license (ABC-256-LLC for an LLC); they are
  // signed at the district office, or on ABC-211-SIG by an applicant who can't come in.
  ...([
    ["ca-abc-217", "ABC-217 (rev. 06/2025)", "Application Questionnaire", "申请问卷", "The main questionnaire: license type, premises, contacts, lease, investment and source of funds.", "主问卷：执照类型、经营场所、联系人、租约、投资及资金来源。", 70],
    ["ca-abc-258", "ABC-258 (Rev. 03/2025)", "Planned Operations (retail)", "计划经营情况（零售）", "How the place will run: business and food type, hours, entertainment, bars, patio and parking.", "经营方式：业务和餐饮类型、营业时间、娱乐、吧台、露台和停车。", 71],
    ["ca-abc-255", "ABC-255 (Rev. 11/2024)", "Zoning Affidavit", "分区宣誓书", "Zoning and land use permits for the premises, completed with the city or county planning department.", "经营场所的分区和土地使用许可，需与市或县规划部门核实后填写。", 71],
    ["ca-abc-140", "ABC-140 (Rev. 03/2026)", "Tied-House Certification", "关联经营认证", "Declares any interest in, or employment by, other alcohol businesses in or outside California.", "申报在加州内外其他酒类企业中的权益或受雇情况。", 71],
    ["ca-abc-247", "ABC-247 (rev. 01/19)", "Statement Re: Residences (Rule 61.4)", "住宅情况声明（第 61.4 条规则）", "Lists the residences within 100 feet of the premises or its parking lot.", "列出距经营场所或其停车场 100 英尺内的住宅。", 71],
    ["ca-abc-257", "ABC-257 (Rev. 11/2024)", "Licensed Premises Diagram", "持牌场所平面图", "The diagram of the area to be licensed, with the header filled.", "拟持牌区域的平面图（表头由快哉填写）。", 72],
    ["ca-abc-211", "ABC-211-SIG (Rev. 12/2024)", "Application Signature Sheet (\"Sign On\")", "申请签名页（“Sign On”）", "For applicants who can't sign at the district office: every applicant signs before an ABC employee or a notary.", "供无法到地区办公室签字的申请人使用：所有申请人须在 ABC 工作人员或公证人面前签字。", 72],
    ["ca-abc-243", "ABC-243 (Rev. 10/2024)", "Corporate Questionnaire", "公司问卷", "For a corporation applicant: its officers, directors, bank and every stock certificate.", "公司申请人填写：高管、董事、银行及所有股票证书。", 71],
    ["ca-abc-256", "ABC-256-LLC (rev. 07/19)", "Limited Liability Company Questionnaire", "有限责任公司问卷", "For an LLC applicant: its filing, management, managers, officers and every member's share.", "LLC 申请人填写：注册情况、管理方式、经理、高管及各成员持股。", 71],
  ] as const).map(([id, form, en, zh, wen, wzh, order]): OfficialForm => ({
    id, form, title: B(en, zh), agency: ABC, level: "state", where: "CA", segments: [R, T], needs: { reference: true }, method: "in_person", order,
    how: B(`${wen} ${ABC_HOW.en}`, `${wzh}${ABC_HOW.zh}`),
    url: `https://www.abc.ca.gov/wp-content/uploads/forms/${form.split(" ")[0]}.pdf`,
    info: ABC_INFO, fee: null, feeNote: B("The license fee follows ABC's application and annual fee schedules for the license type; the forms themselves have no fee.", "执照费按 ABC 申请费和年费标准依执照类型计算；表格本身不收费。"),
    checked: "page", fields: [],
  })),
  {
    id: "ca-abc-244", form: "ABC-244 (Rev. 03/2025)", title: B("Change in Licensee Information / Licensed Premises", "持照人信息或持牌场所变更"),
    agency: ABC, level: "state", where: "CA", segments: [R, T], needs: { reference: true }, method: "in_person", order: 97,
    how: B("After the license is issued: reports a change that doesn't need a transfer, such as a new member, officer or shareholder in the licensed company, a condition modification or removal, or a change to the premises. Submitted to the ABC district office with the fee from the ABC fee schedule.", "取得执照后使用：申报无须转让执照的变更，如持牌公司新增成员、高管或股东，修改或取消附加条件，或经营场所变更。连同 ABC 收费标准所列费用提交至 ABC 地区办公室。"),
    url: "https://www.abc.ca.gov/wp-content/uploads/forms/ABC-244.pdf", pdf: "https://www.abc.ca.gov/wp-content/uploads/forms/ABC-244.pdf",
    info: "https://www.abc.ca.gov/licensing/license-fees/", fee: null, feeNote: B("Fees are non-refundable and follow the ABC fee schedule for the change.", "费用不予退还，按 ABC 收费标准依变更类型计算。"),
    checked: "page", fields: [],
  },
];
