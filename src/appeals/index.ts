/* Appeals, denials and protests: what to do when an agency says no.

   Each playbook is the official process for one kind of decision in one place, read from the agency's or the appeal
   body's own page (or the rule it publishes), with the day it was read. A fact that wasn't confirmed on an official
   page is marked UNVERIFIED and is never computed into a date: the decision letter decides it instead.

   What it copies, and from where:
     deadline discipline  Clio's court-rules calendaring (https://www.clio.com/blog/track-court-deadlines-court-rules/):
                          the deadline is computed from the trigger date by the rule, put on the calendar at once, and
                          shown with how it was counted. Placetta counts conservatively: calendar days never roll forward
                          past a weekend or holiday, and business days skip only federal holidays, so a date shown is
                          never later than the real one.
     cited drafts         Harvey and Legora: every line of the draft letter that states a rule cites its source, and the
                          owner sees the sources before approving.
     the line not crossed DoNotPay's "robot lawyer" claims ended in an FTC order (https://www.ftc.gov/node/87474).
                          Placetta prepares, calendars and drafts; it never files an appeal, never says it will win, and
                          gives no legal opinion. Where the appeal body itself recommends counsel, or a hearing decides
                          it (liquor protests, zoning), the playbook says counsel is advisable and the owner is offered a
                          handoff to an attorney.
   Pure: the agent's tool (appeal_options in src/live.ts), finishWork (the deadline on the calendar) and the monitor
   share it. */
import { B, type Bi } from "../bi";

export type AppealId =
  | "ca_abc_denial_hearing" | "ca_abc_appeals_board" | "tx_tabc_denial_hearing" | "tx_tabc_court_appeal" | "ny_sla_disapproval"
  | "sf_board_of_appeals_building" | "sf_board_of_appeals_variance" | "sf_board_of_appeals_zoning_admin"
  | "la_planning_appeal" | "la_bbsc_appeal" | "nyc_bsa_appeal"
  | "ca_health_permit_hearing" | "nyc_health_oath" | "business_license_denial";

/** How a deadline is counted. days null: not confirmed on an official page, so it's read from the decision letter. */
export type Rule = {
  days: number | null;
  unit: "calendar" | "business";
  /** "decision": counted from the decision's date; "day_after": the period begins the day after (SF Board of Appeals). */
  from: "decision" | "day_after";
  /** The words of the rule, as the source prints them. */
  says: string;
  verified: { on: string; source: string } | null;
};
export type Appeal = {
  id: AppealId;
  name: Bi;
  /** Who decides it. */
  body: Bi;
  where: { state: "CA" | "NY" | "TX"; city?: "sf" | "la" | "nyc" };
  tz: "America/Los_Angeles" | "America/New_York" | "America/Chicago";
  /** What decisions it answers. */
  covers: Bi;
  deadline: Rule;
  /** Shorter deadline in some cases (decided "effective immediately"), as the source says. */
  shorter?: { when: Bi; rule: Rule };
  form: Bi;
  file: Bi;
  fee: { usd: number | null; says: Bi; verified: boolean };
  grounds: Bi[];
  evidence: Bi[];
  hearing: Bi[];
  outcomes: Bi[];
  counsel: { advised: boolean; why: Bi };
  /** What comes after it, when this step is lost. */
  next?: AppealId;
  sources: string[];
  read: string;
};

const U = "UNVERIFIED";
const CA_ABC_BOARD = "https://abcab.ca.gov/resources/appeal-process.html";
const CA_ABC_FAQ = "https://abcab.ca.gov/resources/frequently-asked-questions.html";
const CA_ABC_HEARING = "https://www.abc.ca.gov/licensing/apply-for-a-new-license/license-application-process/hearing-and-appeals-process";
const SF_APPEAL = "https://sf.gov/file-appeal-permit-or-decision";
const SF_FAQ = "https://www.sf.gov/board-of-appeals-faqs";

const COMMON_EVIDENCE: Bi[] = [
  B("The decision letter or notice, with its date and how it was delivered", "决定书或通知原件，含日期和送达方式"),
  B("The application exactly as filed, with every attachment (Placetta keeps the filed copy)", "提交时的完整申请及所有附件（快哉保存了提交副本）"),
  B("The confirmation number, receipts and every message with the agency", "确认号、收据和与机构的全部往来记录"),
];

export const APPEALS: Appeal[] = [
  {
    id: "ca_abc_denial_hearing", name: B("Hearing on a denied or protested liquor license (California ABC)", "加州酒类管制局：酒牌被拒或被抗议后的听证"),
    body: B("An administrative law judge, then the ABC Director", "行政法法官，之后由 ABC 局长决定"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("ABC denied the application, or valid protests weren't settled with the protestants", "ABC 拒绝了申请，或有效抗议未能与抗议人达成一致"),
    deadline: { days: null, unit: "calendar", from: "decision", says: `${U}: ABC's page says a hearing is set "within 60 days" once the applicant requests one, but gives no deadline for the request. Use the date in ABC's letter.`, verified: null },
    form: B("A written request for hearing, as ABC's letter instructs (no form number published)", "按 ABC 来信要求提交书面听证申请（未公布表格编号）"),
    file: B("With the ABC district office that handles the application, as its letter says", "按来信说明提交给受理申请的 ABC 地区办公室"),
    fee: { usd: null, says: B(`${U}: no fee published for the request`, `${U}：未公布申请费`), verified: false },
    grounds: [B("The facts ABC or the protestants relied on are wrong or incomplete", "ABC 或抗议人依据的事实有误或不完整"),
      B("Conditions on the license (hours, no off-sale, security) answer the concern", "执照附加条件（营业时间、不外卖、安保）可以解决顾虑"),
      B("The premises and the people meet the requirements ABC's letter names", "场所和人员符合 ABC 来信列出的要求")],
    evidence: [...COMMON_EVIDENCE, B("Floor plan and the posted public notice", "平面图和已张贴的公示"), B("Letters of support from neighbors and the community", "邻居和社区的支持信"),
      B("Proposed operating conditions and a security plan", "拟议的经营条件和安保计划")],
    hearing: [B("ABC sets the hearing within 60 days of the request", "申请后 ABC 会在 60 天内安排听证"), B("A public hearing before an administrative law judge; witnesses and exhibits", "在行政法法官前公开听证，可传证人、交证据"),
      B("The judge has 30 days to write a proposed decision for the ABC Director", "法官有 30 天为 ABC 局长起草拟议决定")],
    outcomes: [B("License issued, with or without conditions", "批准发照（可能附条件）"), B("Denial upheld: appeal to the ABC Appeals Board", "维持拒绝：可向 ABC 上诉委员会上诉")],
    counsel: { advised: true, why: B("A contested liquor hearing with protestants as parties", "有抗议人参与的酒牌争议听证") },
    next: "ca_abc_appeals_board", sources: [CA_ABC_HEARING], read: "2026-10-22",
  },
  {
    id: "ca_abc_appeals_board", name: B("Appeal to the ABC Appeals Board (California)", "向加州酒类管制上诉委员会上诉"),
    body: B("Alcoholic Beverage Control Appeals Board", "加州酒类管制上诉委员会"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A decision of the Department of Alcoholic Beverage Control, after its hearing", "加州酒类管制局在听证后作出的决定"),
    deadline: { days: 40, unit: "calendar", from: "decision", says: "\"The appeal document must be filed at the Appeals Board office within 40 days from the date of the Department's decision\" (Business and Professions Code §23081).", verified: { on: "2026-10-22", source: CA_ABC_FAQ } },
    shorter: { when: B("The decision says it is \"effective immediately\", or is a Decision Following Default", "决定写明“立即生效”，或为缺席决定"),
      rule: { days: 10, unit: "calendar", from: "decision", says: "\"you must file an appeal within 10 days after the date of the Department's decision\"", verified: { on: "2026-10-22", source: CA_ABC_FAQ } } },
    form: B("A Notice of Appeal in writing (the Board's optional Notice of Appeal Form, a letter or a pleading), with a proof of service", "书面上诉通知（委员会的可选上诉表格、信函或诉状均可），附送达证明"),
    file: B("Serve the Board by email at abcboard@abcappeals.ca.gov or by mail to 400 R St, Suite 320, Sacramento, CA 95811, and serve the Department at 3927 Lennane Drive, Suite 100, Sacramento, CA 95834", "以电子邮件 abcboard@abcappeals.ca.gov 或邮寄至 400 R St, Suite 320, Sacramento, CA 95811 送达委员会，并送达 3927 Lennane Drive, Suite 100, Sacramento, CA 95834 的管制局"),
    fee: { usd: 0, says: B("\"There is no charge for filing an appeal\"; the Department charges for hearing transcripts and exhibits", "“提交上诉不收费”；管制局收取听证笔录和证物费用"), verified: true },
    grounds: [B("The Department acted without or beyond its jurisdiction, or didn't proceed as the law requires", "管制局越权或未依法定程序"), B("The findings aren't supported by substantial evidence in light of the whole record", "根据全部记录，认定缺乏实质证据支持"), B("Relevant evidence that couldn't have been produced at the hearing", "听证时无法提交的相关证据")],
    evidence: [...COMMON_EVIDENCE, B("The hearing transcript and exhibits (ordered from the Department)", "听证笔录和证物（向管制局申请）")],
    hearing: [B("File the opening brief by its due date; the Department replies; then an optional closing brief", "按期提交开庭书状；管制局答辩；之后可提交结案书状"),
      B("Tell the Board by email at least 21 days before the hearing if you'll argue in person", "如要出席口头辩论，须至少提前 21 天发邮件告知委员会")],
    outcomes: [B("Affirmed, reversed or sent back to the Department", "维持、撤销或发回管制局重审"), B("After the Board: a petition for writ of review in the Court of Appeal or Supreme Court (deadline UNVERIFIED)", "委员会之后：可向上诉法院或最高法院申请复审令（期限未核实）")],
    counsel: { advised: true, why: B("The Board itself says it is \"highly recommended that you seek legal counsel\"", "委员会本身表示“强烈建议寻求法律顾问”") },
    sources: [CA_ABC_BOARD, CA_ABC_FAQ], read: "2026-10-22",
  },
  {
    id: "tx_tabc_denial_hearing", name: B("Hearing on a recommended denial (Texas TABC)", "德州酒类委员会：对拟拒绝决定申请听证"),
    body: B("State Office of Administrative Hearings (SOAH), then the Commission", "州行政听证办公室（SOAH），之后由委员会决定"), where: { state: "TX" }, tz: "America/Chicago",
    covers: B("TABC's executive director recommends denying the application, often after a protest", "TABC 执行主任建议拒绝申请（常因抗议）"),
    deadline: { days: 30, unit: "calendar", from: "decision", says: `16 Tex. Admin. Code §33.60(b): a written request for hearing "within thirty (30) days of the date on the notice of the denial recommendation". ${U} on an official page: read from Cornell LII's copy of the rule; count from the date on the notice.`, verified: null },
    form: B("A written request for hearing filed with the Commission", "向委员会提交书面听证申请"),
    file: B("With TABC, as the notice of the denial recommendation instructs", "按拒绝建议通知的说明提交给 TABC"),
    fee: { usd: null, says: B(`${U}: no fee found`, `${U}：未查到费用`), verified: false },
    grounds: [B("The protest's allegations aren't supported, or are outside what the Code lets TABC weigh", "抗议理由缺乏依据，或超出法律允许 TABC 考虑的范围"), B("The premises and the applicant qualify", "场所与申请人均符合条件")],
    evidence: [...COMMON_EVIDENCE, B("Responses to each protest, with documents", "逐条回应抗议，并附文件")],
    hearing: [B("A contested case at SOAH, where the protestants are parties", "在 SOAH 进行有争议案件听证，抗议人为当事方")],
    outcomes: [B("Issued, or denied by the Commission", "批准，或由委员会拒绝"), B("A final denial: appeal to district court", "最终拒绝：可向地区法院上诉")],
    counsel: { advised: true, why: B("A contested case hearing with protestants", "有抗议人参与的争议案件听证") },
    next: "tx_tabc_court_appeal", sources: ["https://www.law.cornell.edu/regulations/texas/16-Tex-Admin-Code-SS-33-60", "https://www.law.cornell.edu/regulations/texas/16-Tex-Admin-Code-SS-33-59", "https://tabc.texas.gov/contact-us/file-a-complaint-protest/protest-a-license/"], read: "2026-10-22",
  },
  {
    id: "tx_tabc_court_appeal", name: B("Appeal of a TABC order to district court (Texas)", "就 TABC 命令向地区法院上诉（德州）"),
    body: B("The district court of the county where the licensee resides", "被许可人居住县的地区法院"), where: { state: "TX" }, tz: "America/Chicago",
    covers: B("A final TABC order denying the license", "TABC 拒绝执照的最终命令"),
    deadline: { days: 30, unit: "calendar", from: "decision", says: `Alcoholic Beverage Code §11.67: perfected and filed "within 30 days after the date" the order becomes final and appealable. ${U} on an official page: read from texas.public.law's copy; count from the day the order became final.`, verified: null },
    form: B("A petition in district court, filed by counsel", "由律师向地区法院提交起诉状"), file: B("The district court of the licensee's county", "被许可人所在县的地区法院"),
    fee: { usd: null, says: B(`${U}: the court's filing fee`, `${U}：法院收费`), verified: false },
    grounds: [B("The order isn't supported by substantial evidence", "命令缺乏实质证据支持")], evidence: [...COMMON_EVIDENCE, B("The SOAH record", "SOAH 听证记录")],
    hearing: [B("Decided under the substantial evidence rule, with the Commission as the only defendant", "按实质证据规则审理，委员会为唯一被告")], outcomes: [B("Affirmed or reversed", "维持或撤销")],
    counsel: { advised: true, why: B("A court case", "法院诉讼") }, sources: ["https://texas.public.law/statutes/tex._alcoh._bev._code_section_11.67"], read: "2026-10-22",
  },
  {
    id: "ny_sla_disapproval", name: B("Disapproved liquor license (New York SLA)", "纽约州酒类管理局：酒牌申请未获批准"),
    body: B("The State Liquor Authority's Full Board", "纽约州酒类管理局全体委员会"), where: { state: "NY" }, tz: "America/New_York",
    covers: B("The SLA disapproved the application", "SLA 未批准申请"),
    deadline: { days: null, unit: "calendar", from: "decision", says: `${U}: no official page read here states how or by when to ask the SLA to reconsider; the SLA's Full Board agendas list reconsideration requests. Use the disapproval letter's instructions.`, verified: null },
    form: B(`${U}: as the SLA's letter instructs`, `${U}：按 SLA 来信说明`), file: B("With the SLA, as its letter instructs", "按 SLA 来信说明提交"),
    fee: { usd: null, says: B(`${U}`, `${U}`), verified: false },
    grounds: [B("New facts or conditions that answer the SLA's or the community board's concern", "可回应 SLA 或社区委员会顾虑的新事实或经营条件")],
    evidence: [...COMMON_EVIDENCE, B("The community board's position and any stipulations you agreed to", "社区委员会的意见及您同意的附加条款")],
    hearing: [B("Considered at a Full Board meeting", "在全体委员会会议上审议")], outcomes: [B("Approved, approved with conditions, or disapproval stands", "批准、附条件批准或维持不批准")],
    counsel: { advised: true, why: B("A discretionary liquor decision with community input", "涉及社区意见的酒牌裁量决定") }, sources: ["https://sla.ny.gov/03082023-full-board-detailed-miscellaneous-agenda"], read: "2026-10-22",
  },
  {
    id: "sf_board_of_appeals_building", name: B("Appeal a building permit decision (San Francisco Board of Appeals)", "就建筑许可决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals (five commissioners)", "旧金山上诉委员会（五名委员）"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A building permit issued, denied, suspended or revoked", "建筑许可的签发、拒绝、暂停或吊销"),
    deadline: { days: 15, unit: "calendar", from: "day_after", says: "\"You have 15 calendar days to file an appeal\" for building permits; \"the appeal period begins the day after the departmental action became effective.\"", verified: { on: "2026-10-22", source: SF_APPEAL } },
    form: B("A copy of the decision and a preliminary statement of the grounds: one page, double-spaced, 12-point or larger, no exhibits", "决定副本，加一页理由陈述：双倍行距、12 号字以上、不附证物"),
    file: B("By email to boardofappeals@sfgov.org, or in person by appointment (628-652-1150); payment by mail to 49 South Van Ness Avenue, Suite 1475, San Francisco, CA 94103", "电邮至 boardofappeals@sfgov.org，或预约现场提交（628-652-1150）；邮寄付款至 49 South Van Ness Avenue, Suite 1475, San Francisco, CA 94103"),
    fee: { usd: 175, says: B("Building permits $175", "建筑许可 $175"), verified: true },
    grounds: [B("The department erred or abused its discretion in issuing or denying it", "部门在签发或拒绝时有误或滥用裁量权"), B("The permit as conditioned meets the code", "附条件的许可符合规范")],
    evidence: [...COMMON_EVIDENCE, B("Plans as submitted and any corrections", "提交的图纸及修改"), B("The plan checker's comments and your responses", "审图意见及您的回复")],
    hearing: [B("You get an appeal number; you expand the one-page statement in a brief, due by 4:30 p.m. on its date", "取得上诉编号；在书状中展开一页陈述，按期下午 4:30 前提交"),
      B("Most decisions need 4 of 5 votes to grant (3 with a vacancy)", "多数决定需五票中四票通过（有空缺时三票）"), B("Rehearing request within 12 calendar days, $150", "可在 12 个日历日内申请复审，费用 $150")],
    outcomes: [B("Granted, granted with conditions, or denied (the decision stands)", "批准、附条件批准，或驳回（原决定维持）")],
    counsel: { advised: false, why: B("\"Parties are not required to be represented by attorneys\"; counsel helps when the other side has one", "“当事人无需律师代理”；对方有律师时，聘请律师更有利") },
    sources: [SF_APPEAL, SF_FAQ], read: "2026-10-22",
  },
  {
    id: "sf_board_of_appeals_variance", name: B("Appeal a variance decision (San Francisco Board of Appeals)", "就分区变更许可决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A variance, rear yard modification or reasonable modification decision", "分区变更、后院调整或合理调整决定"),
    deadline: { days: 10, unit: "calendar", from: "day_after", says: "\"You have 10 days to file an appeal\" for variances, rear yard modification and reasonable modification decisions; the period begins the day after the action became effective.", verified: { on: "2026-10-22", source: SF_APPEAL } },
    form: B("A copy of the decision and a one-page preliminary statement", "决定副本及一页理由陈述"),
    file: B("By email to boardofappeals@sfgov.org, or in person by appointment (628-652-1150)", "电邮至 boardofappeals@sfgov.org，或预约现场提交（628-652-1150）"),
    fee: { usd: 600, says: B("Planning Department decisions $600", "规划局决定 $600"), verified: true },
    grounds: [B("The Zoning Administrator's findings aren't supported", "分区管理员的认定缺乏支持")], evidence: [...COMMON_EVIDENCE, B("Plans, photos and neighbor letters", "图纸、照片和邻居来信")],
    hearing: [B("Brief, then a public hearing; 4 of 5 votes to grant", "提交书状后公开听证；需五票中四票通过")], outcomes: [B("Granted, conditioned or denied", "批准、附条件或驳回")],
    counsel: { advised: true, why: B("A zoning hearing", "分区听证") }, sources: [SF_APPEAL, SF_FAQ], read: "2026-10-22",
  },
  {
    id: "sf_board_of_appeals_zoning_admin", name: B("Appeal a Zoning Administrator decision (San Francisco Board of Appeals)", "就分区管理员决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A Zoning Administrator's written decision, such as a Notice of Violation", "分区管理员的书面决定，如违规通知"),
    deadline: { days: 30, unit: "calendar", from: "day_after", says: "\"You have 30 calendar days to file an appeal\" for Zoning Administrator written decisions; the period begins the day after the action became effective.", verified: { on: "2026-10-22", source: SF_APPEAL } },
    form: B("A copy of the decision and a one-page preliminary statement", "决定副本及一页理由陈述"), file: B("By email to boardofappeals@sfgov.org", "电邮至 boardofappeals@sfgov.org"),
    fee: { usd: 600, says: B("Planning Department decisions $600", "规划局决定 $600"), verified: true },
    grounds: [B("The determination misreads the Planning Code for this use", "该决定误读了规划法规对此用途的规定")], evidence: [...COMMON_EVIDENCE, B("The use as permitted and its history", "已许可用途及其历史")],
    hearing: [B("Brief, then a public hearing", "提交书状后公开听证")], outcomes: [B("Overturned, modified or upheld", "推翻、修改或维持")],
    counsel: { advised: true, why: B("A zoning hearing", "分区听证") }, sources: [SF_APPEAL, SF_FAQ], read: "2026-10-22",
  },
  {
    id: "la_planning_appeal", name: B("Appeal a Los Angeles City Planning determination", "就洛杉矶城市规划决定上诉"),
    body: B("The Area Planning Commission, City Planning Commission or City Council, as the determination names", "按决定书所列：地区规划委员会、市规划委员会或市议会"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("A zoning or planning determination (conditional use, variance, Director's or Zoning Administrator's decision)", "分区或规划决定（有条件使用、变更许可、主任或分区管理员的决定）"),
    deadline: { days: null, unit: "calendar", from: "decision", says: `${U}: the appeal form (CP-7769) leaves "Final Date to Appeal" to be filled from the determination letter. Use the date printed on the letter.`, verified: null },
    form: B("Appeal Application Form CP-7769, a justification for the appeal, and copies of the original determination letter (one original and two copies; PDFs under 9.8 MB each)", "上诉申请表 CP-7769、上诉理由说明及原决定书副本（一份原件两份副本；PDF 每个不超过 9.8 MB）"),
    file: B("With City Planning, where staff upload the materials at filing", "向城市规划局提交，工作人员在受理时上传材料"),
    fee: { usd: null, says: B("Applicant: 85% of the original application fee (LAMC 19.01 B 1); an aggrieved party: per LAMC 19.01 B 1; plus the notice mailing fee. Dollar amounts UNVERIFIED", "申请人：原申请费的 85%（LAMC 19.01 B 1）；利害关系人：按 LAMC 19.01 B 1；另加通知邮寄费。具体金额未核实"), verified: false },
    grounds: [B("The decision-maker erred or abused its discretion", "决策者有误或滥用裁量权"), B("Conditions can answer the concern", "附加条件可以解决顾虑")],
    evidence: [...COMMON_EVIDENCE, B("The original application receipt(s), which set the fee", "原申请收据（决定上诉费）"), B("Plans, photos, community letters", "图纸、照片、社区来信")],
    hearing: [B("A public hearing before the appellate body named in the determination", "在决定书所列的上诉机构前公开听证")], outcomes: [B("Granted, granted in part, or denied", "批准、部分批准或驳回")],
    counsel: { advised: true, why: B("A zoning hearing", "分区听证") },
    sources: ["https://planning.lacity.gov/odocument/5d4c44c5-0aa7-4a03-88fe-09323bf2ff54/WSPA_NOPEC_-_ZAI_appeal_application.pdf"], read: "2026-10-22",
  },
  {
    id: "la_bbsc_appeal", name: B("Appeal to the Board of Building and Safety Commissioners (Los Angeles)", "向洛杉矶建筑与安全委员会上诉"),
    body: B("Board of Building and Safety Commissioners", "建筑与安全委员会"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("A LADBS decision, such as a denied Request for Modification, said to be in error or an abuse of discretion", "LADBS 的决定（如被拒的变更申请），认为有误或滥用裁量权"),
    deadline: { days: null, unit: "calendar", from: "decision", says: `${U}: LADBS's bulletin on appeals to the Board states no filing deadline. Ask LADBS and use any date in its letter.`, verified: null },
    form: B("The Appeal Form with the grounds itemized by LAMC section, signatures notarized, with the Request for Modification and evidence", "上诉表，按 LAMC 条款逐项列出理由，签名须公证，附变更申请和证据"),
    file: B("With a LADBS Chief Inspector or Building Civil Engineer (or above), who sends it to the Commission Office", "提交给 LADBS 首席检查员或建筑土木工程师（或更高级别），由其转交委员会办公室"),
    fee: { usd: null, says: B("Bulletin P/BC 2017-149 lists a Board Fee of $354 an item plus research at $104 an hour; current amounts UNVERIFIED", "公告 P/BC 2017-149 列明委员会费每项 $354，另加每小时 $104 的研究费；现行金额未核实"), verified: false },
    grounds: [B("LADBS erred or abused its discretion", "LADBS 有误或滥用裁量权"), B("An equivalent alternative meets the code's intent", "替代方案满足规范意图")],
    evidence: [...COMMON_EVIDENCE, B("Engineer's or architect's letter on the equivalent alternative", "工程师或建筑师就替代方案出具的意见")],
    hearing: [B("LADBS reports within 60 days; the Board hears it at its next date; notice at least ten days before", "LADBS 在 60 天内出具报告；委员会在下一次会期审理；至少提前十天通知"),
      B("Nothing new is accepted after filing unless a new appeal is filed and paid", "提交后不再接受新材料，除非另行上诉并缴费")],
    outcomes: [B("Granted, granted with conditions, or denied", "批准、附条件批准或驳回")],
    counsel: { advised: false, why: B("Technical; an engineer or architect usually leads it", "技术性强，通常由工程师或建筑师主导") },
    sources: ["https://dbs.lacity.gov/sites/default/files/efs/forms/pc17/ib-p-bc-2017-149-appeals-to-the-bbsc.pdf"], read: "2026-10-22",
  },
  {
    id: "nyc_bsa_appeal", name: B("Appeal to the NYC Board of Standards and Appeals", "向纽约市标准与上诉委员会上诉"),
    body: B("Board of Standards and Appeals (BSA)", "标准与上诉委员会（BSA）"), where: { state: "NY", city: "nyc" }, tz: "America/New_York",
    covers: B("A final determination of the Department of Buildings, the Fire Department or the Department of Transportation", "建筑局、消防局或交通局的最终决定"),
    deadline: { days: 30, unit: "calendar", from: "decision", says: "2 RCNY §1-06.3(a)(1): an appeal \"must be filed within thirty (30) days from the date of the determination.\"", verified: { on: "2026-10-22", source: "https://www.nyc.gov/site/bsa/about/1-06-appeals-calendar-a.page" } },
    form: B("The BSA's A Form, with the determination appealed", "BSA 的 A 表，附被上诉的决定"),
    file: B("With the BSA; within 3 business days, copies to the agency that signed the determination and, if you aren't the owner, to the property owner, with proof of service", "向 BSA 提交；3 个工作日内将副本送达作出决定的机构，若您不是业主还须送达业主，并提交送达证明"),
    fee: { usd: null, says: B(`${U}: the rules page doesn't state the fee`, `${U}：规则页面未列明费用`), verified: false },
    grounds: [B("The determination misreads the Zoning Resolution or the Building Code", "决定误读了分区决议或建筑规范")], evidence: [...COMMON_EVIDENCE, B("Plans, the objection sheet and the code sections", "图纸、审查意见单和相关条款")],
    hearing: [B("The BSA sends the hearing notice at least 30 days before; forward it at least 20 days before to the agency and the owner", "BSA 至少提前 30 天发出听证通知；您须至少提前 20 天转送机构和业主")],
    outcomes: [B("Granted or denied", "批准或驳回")], counsel: { advised: true, why: B("A zoning and code hearing with service rules", "有送达规则的分区及规范听证") },
    sources: ["https://www.nyc.gov/site/bsa/about/1-06-appeals-calendar-a.page"], read: "2026-10-22",
  },
  {
    id: "ca_health_permit_hearing", name: B("Hearing on a health permit suspension, revocation or closure (California Retail Food Code)", "卫生许可暂停、吊销或停业的听证（加州零售食品法）"),
    body: B("The county environmental health agency's hearing officer", "县环境卫生机构的听证官"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A notice to suspend or revoke the health permit, or a closure order", "暂停或吊销卫生许可的通知，或停业令"),
    deadline: { days: 15, unit: "calendar", from: "decision", says: `Health and Safety Code §114409(c): request a hearing "within 15 calendar days after service of a notice"; failing to "shall be deemed a waiver of the right to a hearing"; the hearing is held within 15 calendar days of the request. ${U} on an official page: read from california.public.law's copy; leginfo.legislature.ca.gov didn't load. Count from service of the notice.`, verified: null },
    form: B("A written request for hearing, as the notice instructs", "按通知要求提交书面听证申请"), file: B("With the county environmental health office named on the notice", "向通知所列的县环境卫生办公室提交"),
    fee: { usd: null, says: B(`${U}`, `${U}`), verified: false },
    grounds: [B("The violations are corrected, or weren't as cited", "违规已整改，或与认定不符")], evidence: [...COMMON_EVIDENCE, B("The inspection report", "检查报告"), B("Photos and receipts showing each correction", "每项整改的照片和收据")],
    hearing: [B("Held within 15 calendar days of the request", "申请后 15 个日历日内举行")], outcomes: [B("Permit reinstated, conditions set, or suspension upheld", "恢复许可、附条件，或维持暂停")],
    counsel: { advised: false, why: B("Usually decided on the corrections; counsel if revocation is on the table", "通常取决于整改情况；如面临吊销，建议咨询律师") },
    sources: ["https://california.public.law/codes/ca_health_and_safety_code_section_114409"], read: "2026-10-22",
  },
  {
    id: "nyc_health_oath", name: B("Health Department summons: settle or a hearing at OATH (New York City)", "卫生局传票：和解或在 OATH 听证（纽约市）"),
    body: B("Office of Administrative Trials and Hearings (OATH)", "行政审判与听证办公室（OATH）"), where: { state: "NY", city: "nyc" }, tz: "America/New_York",
    covers: B("A summons from a Health Department inspection, including after a closure", "卫生局检查开出的传票（包括停业后）"),
    deadline: { days: null, unit: "calendar", from: "decision", says: "The hearing date printed on the summons. Settle \"before the hearing date\"; \"Request your Hearing by Phone at least three business days before your scheduled hearing date\"; a missed hearing can be reopened \"within 75 days of the date of the missed hearing date\", once per summons.", verified: { on: "2026-10-22", source: "https://nyc-business.nyc.gov/nycbusiness/description/settle-a-food-service-establishment-violation" } },
    form: B("The Offer of Settlement, or a hearing (by phone, online or in person)", "和解要约，或参加听证（电话、在线或现场）"),
    file: B("Check for an offer on the Health Department's Permit and License Center; hearings at OATH", "在卫生局许可证中心查看和解要约；听证在 OATH 进行"),
    fee: { usd: null, says: B("The settlement amount offered, or the penalty OATH imposes", "和解金额或 OATH 判处的罚款"), verified: true },
    grounds: [B("The violation wasn't as cited", "违规与传票不符"), B("It was corrected; the penalty should be lower", "已整改，罚款应降低")],
    evidence: [...COMMON_EVIDENCE, B("The inspection report and the summons", "检查报告和传票"), B("Photos, pest control and repair receipts", "照片、灭虫和维修收据")],
    hearing: [B("Most choose a phone hearing; ask at least three business days ahead", "多数人选择电话听证；须至少提前三个工作日申请")],
    outcomes: [B("Dismissed, reduced or upheld; a default if missed (a higher penalty)", "撤销、减轻或维持；缺席则按缺席处理（罚款更高）")],
    counsel: { advised: false, why: B("Most settle or appear themselves", "多数人自行和解或出席") },
    sources: ["https://nyc-business.nyc.gov/nycbusiness/description/settle-a-food-service-establishment-violation", "https://www.nyc.gov/site/oath/hearings/reopen-a-missed-hearing-default-online.page"], read: "2026-10-22",
  },
  {
    id: "business_license_denial", name: B("Denied business license or permit (any city)", "营业执照或许可被拒（各城市）"),
    body: B("The body the denial letter names", "拒绝函所列机构"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A city or county license or permit denied, where no specific playbook applies", "无专门流程适用的市县执照或许可被拒"),
    deadline: { days: null, unit: "calendar", from: "decision", says: `${U}: every city sets its own. The denial letter must say who hears an appeal and by when; Placetta reads it from the letter.`, verified: null },
    form: B("As the denial letter instructs", "按拒绝函说明"), file: B("As the denial letter instructs", "按拒绝函说明"),
    fee: { usd: null, says: B(`${U}`, `${U}`), verified: false },
    grounds: [B("The reason given is wrong, or has been fixed", "所给理由有误或已解决")], evidence: COMMON_EVIDENCE,
    hearing: [B("As the letter says", "按来函说明")], outcomes: [B("Issued, or denial upheld", "发照或维持拒绝")],
    counsel: { advised: false, why: B("Most denials are fixed and refiled", "多数拒绝可修正后重新提交") }, sources: [], read: "2026-10-22",
  },
];
export const appealById = (id: string) => APPEALS.find((a) => a.id === id);

/* ------------------------------ which one applies ------------------------------ */

const NYC = /new york|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|\bNY\s*1[01]\d{3}\b/i;
const cityOf = (addr: string) => NYC.test(addr) ? "nyc" : /san francisco|,\s*CA\s*941\d{2}/i.test(addr) ? "sf" : /los angeles|,\s*CA\s*900\d{2}/i.test(addr) ? "la" : null;
const stateOf = (addr: string) => /\b(CA|NY|TX)\b\s*\d{5}/.exec(addr)?.[1] ?? (/california/i.test(addr) ? "CA" : /new york/i.test(addr) ? "NY" : /texas/i.test(addr) ? "TX" : null);

/** The playbook for a decision on an application at an address, by what the application is and where. A closure or a
 *  summons is named by the decision's own words (`said`). */
export function appealFor(app: { name?: Bi; agency?: Bi }, address: string, said = ""): Appeal | null {
  const what = `${app.name?.en ?? ""} ${app.agency?.en ?? ""}`, c = cityOf(address), st = stateOf(address);
  if (/liquor|alcohol|beer|wine|\bABC\b|\bSLA\b|TABC/i.test(what)) {
    if (st === "CA") return /appeals board|after (the )?hearing|proposed decision|director'?s decision/i.test(said) ? appealById("ca_abc_appeals_board")! : appealById("ca_abc_denial_hearing")!;
    if (st === "TX") return /final order|commission (order|denied)/i.test(said) ? appealById("tx_tabc_court_appeal")! : appealById("tx_tabc_denial_hearing")!;
    if (st === "NY") return appealById("ny_sla_disapproval")!;
    return null;
  }
  if (/variance|conditional use|zoning|planning|land use/i.test(what) || /zoning administrator|variance/i.test(said)) {
    if (c === "sf") return /variance|rear yard|reasonable modification/i.test(`${what} ${said}`) ? appealById("sf_board_of_appeals_variance")! : appealById("sf_board_of_appeals_zoning_admin")!;
    if (c === "la") return appealById("la_planning_appeal")!;
    if (c === "nyc") return appealById("nyc_bsa_appeal")!;
  }
  if (/building|alteration|tenant improvement|build-?out|construction|\bDOB\b|LADBS|\bDBI\b/i.test(what)) {
    if (c === "sf") return appealById("sf_board_of_appeals_building")!;
    if (c === "la") return appealById("la_bbsc_appeal")!;
    if (c === "nyc") return appealById("nyc_bsa_appeal")!;
  }
  if (/health|food (facility|establishment|service)|retail food|restaurant/i.test(what)) {
    if (c === "nyc") return appealById("nyc_health_oath")!;
    if (st === "CA") return appealById("ca_health_permit_hearing")!;
  }
  if (/business (license|tax|registration)|permit|license/i.test(what) && st) return appealById("business_license_denial")!;
  return null;
}

/* ------------------------------ the deadline ------------------------------ */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
/** The nth weekday (0 Sunday) of a month, or the last when n is -1. */
function nthWeekday(y: number, m: number, wd: number, n: number) {
  if (n > 0) { const first = at(y, m, 1); return at(y, m, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7); }
  const last = at(y, m + 1, 0); return at(y, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
}
const observed = (d: Date) => (d.getUTCDay() === 6 ? at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1) : d.getUTCDay() === 0 ? at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) : d);
/** US federal holidays as observed (5 U.S.C. 6103). State and city holidays aren't skipped, which only makes a
 *  business-day deadline earlier, never later. */
export function federalHolidays(y: number): Set<string> {
  return new Set([observed(at(y, 0, 1)), nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), nthWeekday(y, 4, 1, -1), observed(at(y, 5, 19)), observed(at(y, 6, 4)),
    nthWeekday(y, 8, 1, 1), nthWeekday(y, 9, 1, 2), observed(at(y, 10, 11)), nthWeekday(y, 10, 4, 4), observed(at(y, 11, 25))].map(iso));
}
const isBusinessDay = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !federalHolidays(d.getUTCFullYear()).has(iso(d));

/** The decision's date where the deciding body sits: a decision stamped 11 p.m. in Los Angeles is that day there. */
export function localDay(stamp: string, tz: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(stamp));
  return p.slice(0, 10);
}

export type Deadline = { date: string; days: number; unit: "calendar" | "business"; counted: string; verified: boolean; tz: string; rule: string };
/** The last day to act, counted by the rule from the decision; null when the rule's days aren't confirmed. Calendar days
 *  never roll forward past a weekend or holiday (the date may be earlier than the agency allows, never later). */
export function deadlineFor(rule: Rule, decided: string, tz: string): Deadline | null {
  if (rule.days == null) return null;
  const start = localDay(decided, tz);
  let d = at(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  // "day_after": day 1 is the day after; "decision": day 1 is also the day after the decision (the usual count). Both
  // give decision + N for calendar days; the difference matters for business days, which start the next business day.
  if (rule.unit === "calendar") d = at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + rule.days);
  else { let n = 0; while (n < rule.days) { d = at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); if (isBusinessDay(d)) n++; } }
  const counted = `${rule.days} ${rule.unit} days from ${start}${rule.from === "day_after" ? " (the period begins the day after)" : ""}, in ${tz.replace("America/", "").replace("_", " ")} time${rule.unit === "calendar" ? "; not moved past a weekend or holiday" : "; weekends and federal holidays skipped"}`;
  return { date: iso(d), days: rule.days, unit: rule.unit, counted, verified: !!rule.verified, tz, rule: rule.says };
}

/** Whole days from today to a date (negative once it has passed). */
export const daysLeft = (date: string, today: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);

/* ------------------------------ fix and resubmit, or appeal ------------------------------ */

/** Reasons a corrected filing answers (a missing document, a wrong form or fee, an incomplete answer). */
const CURABLE = /missing|incomplete|(do|does|did)(n.?t| not) (show|include)|not (included|attached|signed|legible)|wrong (form|fee|address|name)|unsigned|illegible|expired (document|certificate|insurance)|fee|correction|resubmit|additional (information|documents?)|did not include|lacks?/i;
/** Reasons only a hearing or an appeal answers (a protest, a finding about the premises or the people, discretion). */
const CONTESTED = /protest|public convenience|undue concentration|nuisance|police|neighbou?rs?|community board|zoning|not permitted|prohibited use|discretion|character|moral|criminal|disapprov|denied after hearing/i;

export type Choice = { id: "resubmit" | "appeal"; title: Bi; when: Bi; cost: Bi; recommended: boolean };
/** The two ways forward, side by side. Which fits is a suggestion from the reason's words; the owner decides. */
export function choices(reason: string, ap: Appeal | null, dl: Deadline | null, today: string): Choice[] {
  const curable = CURABLE.test(reason) && !CONTESTED.test(reason), contested = CONTESTED.test(reason);
  const left = dl ? daysLeft(dl.date, today) : null;
  return [
    { id: "resubmit", title: B("Fix it and file again", "修正后重新提交"), recommended: curable,
      when: B("When the reason is something missing or wrong on the application. Odelia fixes the lines, you approve, Placetta files again.", "当理由是申请中缺少或有误的内容时。Odelia 修正各项，您批准后快哉重新提交。"),
      cost: B("The agency's filing fee again, if it charges one; usually the fastest", "如机构收费需再交一次申请费；通常最快") },
    { id: "appeal", title: ap ? B(`Appeal: ${ap.name.en}`, `上诉：${ap.name.zh}`) : B("Appeal or ask for a hearing", "上诉或申请听证"), recommended: contested && !curable,
      when: B(`When the agency weighed the facts or the law against you and a corrected filing wouldn't change that.${left != null ? ` ${left >= 0 ? `${left} days left to file.` : "The computed deadline has passed; check the letter."}` : ""}`,
        `当机构在事实或法律上作出不利判断、修正后重新提交也无法改变时。${left != null ? (left >= 0 ? `距截止还有 ${left} 天。` : "推算的截止日期已过，请核对来函。") : ""}`),
      cost: ap ? B(`${ap.fee.says.en}${ap.counsel.advised ? "; counsel is advisable" : ""}`, `${ap.fee.says.zh}${ap.counsel.advised ? "；建议聘请律师" : ""}`) : B("As the letter says", "按来函说明") },
  ];
}

/** What every appeal output carries, word for word. */
export const NOT_A_LAW_FIRM = B("Placetta isn't a law firm and this isn't legal advice. Placetta prepares the deadline, the evidence and a draft for you to review; it never files an appeal, and it doesn't predict how one will go.",
  "快哉不是律师事务所，以上不构成法律意见。快哉为您准备截止日期、证据和草稿供您审阅；快哉从不代为提交上诉，也不预测结果。");

/** The draft's outline, each rule cited to its source by number: the Harvey and Legora way, a person checks every
 *  citation before anything goes out. */
export function letterOutline(ap: Appeal, o: { business: string; name: string; agency: string; decided: string; reason: string; confirmation?: string }): { outline: string[]; sources: { n: number; url: string }[] } {
  const src = ap.sources.map((url, i) => ({ n: i + 1, url }));
  const cite = src.length ? ` [${src.map((s) => s.n).join("][")}]` : "";
  return {
    outline: [
      `DRAFT for review. ${NOT_A_LAW_FIRM.en}`,
      `To: ${ap.body.en}. From: ${o.business}. Re: ${o.name}${o.confirmation ? `, ${o.confirmation}` : ""}; decision of ${o.agency} dated ${o.decided}.`,
      `1. What is appealed: the decision of ${o.decided}, as stated in the decision letter (attached as Exhibit A).`,
      `2. Timeliness: filed within the period the rule sets: ${ap.deadline.says}${cite}`,
      `3. The decision's reason, in the agency's words: "${o.reason.slice(0, 300)}" (Exhibit A).`,
      `4. Grounds, each tied to an exhibit: ${ap.grounds.map((g) => g.en).join("; ")}. Only the grounds the facts support stay in.`,
      `5. Evidence: ${ap.evidence.map((e, i) => `Exhibit ${String.fromCharCode(66 + i)}: ${e.en}`).join("; ")}.`,
      `6. What is asked: ${ap.outcomes[0]?.en ?? "reconsideration"}.`,
      `Filing: ${ap.form.en}. ${ap.file.en}.${cite}`,
    ],
    sources: src,
  };
}
