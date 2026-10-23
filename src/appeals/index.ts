/* Appeals, denials and protests: what to do when an agency says no.

   Each playbook is the official process for one kind of decision in one place, read from the statute, the regulation,
   the city code or the agency's own page, with the exact section, the words, the trigger that starts the clock and the
   day it was read. A rule that wasn't confirmed on an official source is marked UNVERIFIED, is never turned into a
   date, and lists the official URL a person can open in a browser to confirm it (`check`). Unofficial copies of the
   law were used only to find the right section.

   What it copies, and from where:
     deadline math        CompuLaw and Clio's court-rules calendaring (https://www.clio.com/blog/track-court-deadlines-court-rules/):
                          the deadline is computed by rule from the trigger (the decision, its service, its receipt or the
                          day an order becomes final), in the deciding body's time zone, with how it was counted shown.
                          Two dates come back: the last day the rule allows (a weekend or a verified holiday moves it to
                          the next business day, only where the source says so) and Placetta's target, which never moves
                          later. Business days skip only holidays the jurisdiction verifiably observes.
     cited drafts         Harvey and Legora: every line of the draft that states a rule, a fee or a filing step cites its
                          own source by number, and a person checks every citation before anything goes out.
     counsel handoff      Clio's matter intake: the attorney gets one packet (decision, deadline and how it was counted,
                          the grounds, the evidence with what's on file and what's missing, the questions for counsel).
     self-serve, tiered   DoNotPay's flow (guided questions, the letter with the right legal hook, mailing and faxing
                          for the user, deadline reminders) is copied in src/appeals/flow.ts; what got it an FTC order
                          (https://www.ftc.gov/node/87474: "the company did not test whether its 'AI lawyer' operated to
                          the level of a human lawyer" and "did not hire or retain attorneys to test the quality and
                          accuracy") is not. Every playbook has a route (TIERS below), each cited: self-serve where the
                          agency itself says no lawyer is needed or it's a simple administrative review, self-serve with
                          an optional review, or attorney advised. Placetta files only what the owner approves, never
                          says it will win, claims no success rate, and gives no legal opinion.
   Pure: the agent's tools (appeal_options and appeal_case in src/live.ts), finishWork (the deadline on the calendar)
   and the monitor share it. */
import { B, type Bi } from "../bi";

export type AppealId =
  | "ca_abc_denial_hearing" | "ca_abc_appeals_board" | "tx_tabc_denial_hearing" | "tx_tabc_rehearing" | "tx_tabc_court_appeal" | "ny_sla_disapproval"
  | "sf_board_of_appeals_building" | "sf_board_of_appeals_variance" | "sf_board_of_appeals_zoning_admin" | "sf_board_of_appeals_za_violation" | "sf_board_of_appeals_permit"
  | "la_planning_appeal" | "la_bbsc_appeal" | "la_tax_assessment_review" | "la_tax_board_of_review" | "nyc_bsa_appeal" | "nyc_dcwp_denial"
  | "ca_health_permit_hearing" | "ca_health_closure_hearing" | "ca_health_plan_review" | "nyc_health_oath" | "dal_building_appeals_board"
  | "business_license_denial";

/** Holiday lists Placetta can count with: "core" is the six every covered government closes for (New Year's Day,
 *  Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas); "TX" adds Texas's national holidays (Gov't Code
 *  §662.003(a)); "NY" is General Construction Law §24's public holidays. A holiday missing from a list only makes a date
 *  earlier, never later. */
export type Holidays = "core" | "TX" | "NY";

/** How a deadline is counted. days null: not confirmed on an official source, so it's read from the decision letter. */
export type Rule = {
  days: number | null;
  unit: "calendar" | "business" | "months";
  /** "decision": day 1 is the day after the trigger date (the usual count); "day_after": the source says so in words. */
  from: "decision" | "day_after";
  /** What starts the clock, as the source says it (the decision's date, service, receipt, finality). */
  trigger: Bi;
  /** The words of the rule, as the source prints them. */
  says: string;
  /** The exact section. */
  section: string;
  verified: { on: string; source: string } | null;
  /** The source says a last day on a weekend (and, with a list, a holiday) moves to the next business day. */
  roll?: boolean;
  holidays?: Holidays;
  /** days is the shortest period the source gives for this kind of decision ("10 to 15 days"); the letter may allow more. */
  atLeast?: boolean;
  /** The last day ends at this local time ("16:30"). */
  cutoff?: string;
  /** Days added when the trigger was served by mail, only where the rule itself provides it. */
  mail?: { days: number; says: string; section: string; verified: { on: string; source: string } | null };
  /** Official pages to open in a browser to confirm an UNVERIFIED rule (unreachable from Placetta's servers). */
  check?: string[];
};
export type Appeal = {
  id: AppealId;
  name: Bi;
  /** Who decides it. */
  body: Bi;
  where: { state: "CA" | "NY" | "TX"; city?: "sf" | "la" | "nyc" | "dallas" };
  tz: "America/Los_Angeles" | "America/New_York" | "America/Chicago";
  /** What decisions it answers. */
  covers: Bi;
  deadline: Rule;
  /** Shorter deadline in some cases (decided "effective immediately"), as the source says. */
  shorter?: { when: Bi; rule: Rule };
  /** A step that must come first, or the appeal is lost (Texas: the motion for rehearing). */
  before?: AppealId;
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
  /** The source of each claim the draft makes: the deadline's is the rule's own. Default: the first source. */
  cites?: Partial<Record<"form" | "file" | "fee" | "hearing" | "grounds", string>>;
  sources: string[];
  read: string;
};

const U = "UNVERIFIED";
const READ = "2026-10-22";
const ok = (source: string) => ({ on: READ, source });
const CA_ABC_BOARD = "https://abcab.ca.gov/resources/appeal-process.html";
const CA_ABC_FAQ = "https://abcab.ca.gov/resources/frequently-asked-questions.html";
const CA_ABC_HEARING = "https://www.abc.ca.gov/licensing/apply-for-a-new-license/license-application-process/hearing-and-appeals-process";
const SF_APPEAL = "https://sf.gov/file-appeal-permit-or-decision";
const SF_FAQ = "https://www.sf.gov/board-of-appeals-faqs";
const TABC_RULES = "https://www.tabc.texas.gov/static/f6f628258b7ae843925c2025de0a3ff6/tabc-administrative-rules.pdf";
const TX_AL11 = "https://statutes.capitol.texas.gov/Docs/AL/htm/AL.11.htm";
const TX_AL61 = "https://statutes.capitol.texas.gov/Docs/AL/htm/AL.61.htm";
const TX_GV2001 = "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.2001.htm";
const TX_GV311 = "https://statutes.capitol.texas.gov/Docs/GV/htm/GV.311.htm";
const NY_ABC121 = "https://www.nysenate.gov/legislation/laws/ABC/121";
const NY_CPLR217 = "https://www.nysenate.gov/legislation/laws/CVP/217";
const NY_GCL25A = "https://www.nysenate.gov/legislation/laws/GCN/25-A";
const NY_GCL30 = "https://www.nysenate.gov/legislation/laws/GCN/30";
const LA_CP7769 = "https://planning.lacity.gov/odocument/1601f920-8ab1-4b22-a13c-513bdc5eb58f/CP13-7769_Appeal_Application.pdf";
const LA_APPEALS = "https://planning.lacity.gov/odocument/3196b519-482e-445b-a8dc-61f15dc7c030/Planning_Entitlement_Appeals.pdf";
const LA_CP7854 = "https://planning.lacity.gov/odocument/3d099420-dcd1-4c2e-a114-384b24e1adce/CP13-7854";
const LADBS_149 = "https://dbs.lacity.gov/sites/default/files/efs/forms/pc17/ib-p-bc-2017-149-appeals-to-the-bbsc.pdf";
const LA_ARO = "https://finance.lacity.gov/tax-education/tax-assessments/requesting-hearing";
const LA_BOR = "https://finance.lacity.gov/tax-education/tax-assessments/board-review";
/** The California Retail Food Code as Orange County's environmental health agency publishes it (effective January
 *  2026, updated 2026-03-16); leginfo.legislature.ca.gov answers Placetta's servers with a bot challenge. */
const CALCODE = "https://ochealthinfo.com/sites/healthcare/files/2026-04/CalCode%20effective%20January%202026%20updated%203-16-26.pdf";
const DAL_BOARD = "https://dallascityhall.com/departments/sustainabledevelopment/DCH%20documents/APPEALPROCESSOVERVIEWDallas.pdf";
const NYC_DCWP_AFTER = "https://nyc-business.nyc.gov/nycbusiness/description/commercial-lessor-license/after_apply";
const SJ_BTC = "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration";
const HOU_START = "https://www.houstontx.gov/business/start/startup-guide.html";
const TX_GENERAL = "https://gov.texas.gov/business/page/business-permits-office";
const OATH_REP = "https://www.nyc.gov/site/oath/hearings/registered-representatives.page";
const OATH_WHAT = "https://www.nyc.gov/assets/oath/downloads/pdf/en-what-is-oathhd.pdf";
const LADBS_BBSC = "https://dbs.lacity.gov/our-organization/building-and-safety-comissioners/bbsc-appeals-ordinances";
const NYC_BSA_RULE = "https://www.nyc.gov/site/bsa/about/1-06-appeals-calendar-a.page";
const leginfo = (code: string, sec: string) => `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=${code}&sectionNum=${sec}`;

const COMMON_EVIDENCE: Bi[] = [
  B("The decision letter or notice, with its date and how it was delivered", "决定书或通知原件，含日期和送达方式"),
  B("The application exactly as filed, with every attachment (Placetta keeps the filed copy)", "提交时的完整申请及所有附件（快哉保存了提交副本）"),
  B("The confirmation number, receipts and every message with the agency", "确认号、收据和与机构的全部往来记录"),
];
const ARTICLE_78: Rule = {
  days: 4, unit: "months", from: "decision", trigger: B("The day the determination became final and binding on you", "决定对您最终生效并具有约束力之日"),
  says: "CPLR §217(1): \"a proceeding against a body or officer must be commenced within four months after the determination to be reviewed becomes final and binding upon the petitioner\"; months counted as General Construction Law §30 says, and a last day on a Saturday, Sunday or public holiday moves to the next business day (§25-a).",
  section: "N.Y. CPLR §217(1); General Construction Law §§25-a, 30", verified: ok(NY_CPLR217), roll: true, holidays: "NY",
};

export const APPEALS: Appeal[] = [
  {
    id: "ca_abc_denial_hearing", name: B("Hearing on a denied or protested liquor license (California ABC)", "加州酒类管制局：酒牌被拒或被抗议后的听证"),
    body: B("An administrative law judge, then the ABC Director", "行政法法官，之后由 ABC 局长决定"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("ABC denied the application, or valid protests weren't settled with the protestants", "ABC 拒绝了申请，或有效抗议未能与抗议人达成一致"),
    deadline: { days: 10, unit: "calendar", from: "decision", trigger: B("The day ABC mails the notice of denial", "ABC 寄出拒绝通知之日"), section: "Bus. & Prof. Code §§24011, 24012",
      says: "Bus. & Prof. Code §24011: \"Immediately upon the denial of any application for a license, the department shall notify the applicant in writing. Within 10 days after the department mails the notice, the applicant may present his written petition for a license to the department.\" §24012: \"Upon receipt by the department of a petition for a license in proper form, the petition shall be set for hearing.\" (Gov. Code §11506's 15 days applies to a notice of defense after an accusation, not to a denied application.)",
      verified: ok(leginfo("BPC", "24011")) },
    form: B("A written request for hearing, as ABC's letter instructs (no form number published)", "按 ABC 来信要求提交书面听证申请（未公布表格编号）"),
    file: B("With the ABC district office that handles the application, as its letter says", "按来信说明提交给受理申请的 ABC 地区办公室"),
    fee: { usd: null, says: B(`${U}: no fee published for the request`, `${U}：未公布申请费`), verified: false },
    grounds: [B("The facts ABC or the protestants relied on are wrong or incomplete", "ABC 或抗议人依据的事实有误或不完整"),
      B("Conditions on the license (hours, no off-sale, security) answer the concern", "执照附加条件（营业时间、不外卖、安保）可以解决顾虑"),
      B("The premises and the people meet the requirements ABC's letter names", "场所和人员符合 ABC 来信列出的要求")],
    evidence: [...COMMON_EVIDENCE, B("Floor plan and the posted public notice", "平面图和已张贴的公示"), B("Letters of support from neighbors and the community", "邻居和社区的支持信"),
      B("Proposed operating conditions and a security plan", "拟议的经营条件和安保计划")],
    hearing: [B("ABC schedules the hearing within 60 days and mails a Notice of Hearing to all parties", "ABC 在 60 天内安排听证，并向各方邮寄听证通知"), B("A public hearing before an administrative law judge; ABC counsel represents ABC; you may be represented by an attorney or another person; a protestant who doesn't appear abandons the protest", "在行政法法官前公开听证；ABC 由其律师代表；您可由律师或其他人代理；抗议人不出席即视为放弃抗议"),
      B("The judge has 30 days to write a proposed decision for the ABC Director", "法官有 30 天为 ABC 局长起草拟议决定")],
    outcomes: [B("License issued, with or without conditions", "批准发照（可能附条件）"), B("Denial upheld: appeal to the ABC Appeals Board", "维持拒绝：可向 ABC 上诉委员会上诉")],
    counsel: { advised: true, why: B("A contested liquor hearing with protestants as parties", "有抗议人参与的酒牌争议听证") },
    next: "ca_abc_appeals_board", sources: [CA_ABC_HEARING], read: READ,
  },
  {
    id: "ca_abc_appeals_board", name: B("Appeal to the ABC Appeals Board (California)", "向加州酒类管制上诉委员会上诉"),
    body: B("Alcoholic Beverage Control Appeals Board", "加州酒类管制上诉委员会"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A decision of the Department of Alcoholic Beverage Control, after its hearing", "加州酒类管制局在听证后作出的决定"),
    deadline: { days: 40, unit: "calendar", from: "decision", trigger: B("The date of the Department's decision", "管制局决定的日期"), section: "Bus. & Prof. Code §23081, as the Appeals Board states it",
      says: "\"The appeal document must be filed at the Appeals Board office within 40 days from the date of the Department's decision\" (Business and Professions Code §23081).", verified: ok(CA_ABC_FAQ) },
    shorter: { when: B("The decision says it is \"effective immediately\", or is a Decision Following Default", "决定写明“立即生效”，或为缺席决定"),
      rule: { days: 10, unit: "calendar", from: "decision", trigger: B("The date of the Department's decision", "管制局决定的日期"), section: "Bus. & Prof. Code §23081, as the Appeals Board states it",
        says: "\"you must file an appeal within 10 days after the date of the Department's decision\"", verified: ok(CA_ABC_FAQ) } },
    form: B("A Notice of Appeal in writing (the Board's optional Notice of Appeal Form, a letter or a pleading), with a proof of service", "书面上诉通知（委员会的可选上诉表格、信函或诉状均可），附送达证明"),
    file: B("Serve the Board by email at abcboard@abcappeals.ca.gov or by mail to 400 R St, Suite 320, Sacramento, CA 95811, and serve the Department at 3927 Lennane Drive, Suite 100, Sacramento, CA 95834", "以电子邮件 abcboard@abcappeals.ca.gov 或邮寄至 400 R St, Suite 320, Sacramento, CA 95811 送达委员会，并送达 3927 Lennane Drive, Suite 100, Sacramento, CA 95834 的管制局"),
    fee: { usd: 0, says: B("\"There is no charge for filing an appeal\"; the Department charges for hearing transcripts and exhibits", "“提交上诉不收费”；管制局收取听证笔录和证物费用"), verified: true },
    grounds: [B("The Department acted without or beyond its jurisdiction, or didn't proceed as the law requires", "管制局越权或未依法定程序"), B("The findings aren't supported by substantial evidence in light of the whole record", "根据全部记录，认定缺乏实质证据支持"), B("Relevant evidence that couldn't have been produced at the hearing", "听证时无法提交的相关证据")],
    evidence: [...COMMON_EVIDENCE, B("The hearing transcript and exhibits (ordered from the Department)", "听证笔录和证物（向管制局申请）")],
    hearing: [B("File the opening brief by its due date; the Department replies; then an optional closing brief", "按期提交开庭书状；管制局答辩；之后可提交结案书状"),
      B("Tell the Board by email at least 21 days before the hearing if you'll argue in person", "如要出席口头辩论，须至少提前 21 天发邮件告知委员会"), B("The Board accepts no new evidence that wasn't offered at the hearing, and usually decides within 30 days", "委员会不接受听证时未提交的新证据，通常在 30 天内作出决定")],
    outcomes: [B("Affirmed, reversed or sent back to the Department", "维持、撤销或发回管制局重审"), B("After the Board: the applicant, a protestant or ABC may appeal to the District Court of Appeal within 30 days of the Board's decision", "委员会之后：申请人、抗议人或 ABC 可在委员会决定后 30 天内向上诉法院上诉")],
    counsel: { advised: true, why: B("The Board itself says it is \"highly recommended that you seek legal counsel\"", "委员会本身表示“强烈建议寻求法律顾问”") },
    cites: { form: CA_ABC_BOARD, file: CA_ABC_FAQ, fee: CA_ABC_FAQ, hearing: CA_ABC_BOARD }, sources: [CA_ABC_FAQ, CA_ABC_BOARD, CA_ABC_HEARING], read: READ,
  },
  {
    id: "tx_tabc_denial_hearing", name: B("Hearing on a recommended denial (Texas TABC)", "德州酒类委员会：对拟拒绝决定申请听证"),
    body: B("State Office of Administrative Hearings (SOAH), then the Commission", "州行政听证办公室（SOAH），之后由委员会决定"), where: { state: "TX" }, tz: "America/Chicago",
    covers: B("TABC's executive director recommends denying the application, often after a protest", "TABC 执行主任建议拒绝申请（常因抗议）"),
    deadline: { days: 30, unit: "calendar", from: "decision", trigger: B("The date on the notice of the denial recommendation (not the day it arrived)", "拒绝建议通知上所载日期（而非收到之日）"), section: "16 Tex. Admin. Code §33.60(b)",
      says: "16 TAC §33.60(b): \"An applicant may request an administrative hearing on the executive director's denial recommendation by filing a written request for hearing with the commission within thirty (30) days of the date on the notice of the denial recommendation.\" Without a timely request, the denial goes to \"the next available regular commission meeting\" (§33.60(e)).",
      verified: ok(TABC_RULES) },
    form: B("A written request for hearing on the denial recommendation (no form number)", "就拒绝建议提交书面听证申请（无表格编号）"),
    file: B("By mail to Texas Alcoholic Beverage Commission, ATTN: Clerk, P.O. Box 13127, Austin, Texas 78711, or by email to clerk@tabc.texas.gov (§33.60(c))", "邮寄至 Texas Alcoholic Beverage Commission, ATTN: Clerk, P.O. Box 13127, Austin, Texas 78711，或电邮至 clerk@tabc.texas.gov（§33.60(c)）"),
    fee: { usd: null, says: B("None stated in §33.60", "§33.60 未规定费用"), verified: false },
    grounds: [B("No legal ground to deny exists: the facts in the application are true (Alcoholic Beverage Code §11.43(d))", "不存在拒绝的法定理由：申请所述事实属实（酒类法 §11.43(d)）"), B("The protest's allegations aren't supported, or are outside what the Code lets TABC weigh", "抗议理由缺乏依据，或超出法律允许 TABC 考虑的范围")],
    evidence: [...COMMON_EVIDENCE, B("Responses to each protest, with documents", "逐条回应抗议，并附文件")],
    hearing: [B("TABC refers the application to SOAH (§33.60(d)); Government Code chapter 2001 governs (§11.43(h))", "TABC 将申请移交 SOAH（§33.60(d)）；适用政府法第 2001 章（§11.43(h)）"), B("Protestants whose protest was referred are parties (§33.59(b)(4))", "被移交的抗议人为当事方（§33.59(b)(4)）"),
      B("At least 10 days' notice of the hearing (Alcoholic Beverage Code §11.63)", "听证至少提前 10 天通知（酒类法 §11.63）"), B("The judge issues a proposal for decision; the Commission then issues the final decision (§11.43(h))", "法官出具拟议决定；委员会随后作出最终决定（§11.43(h)）")],
    outcomes: [B("Issued, or denied by the Commission", "批准，或由委员会拒绝"), B("A denial: motion for rehearing within 25 days of the signed order, then district court", "被拒：签署命令后 25 天内申请复议，之后可向地区法院起诉")],
    counsel: { advised: true, why: B("A contested case hearing with protestants", "有抗议人参与的争议案件听证") },
    next: "tx_tabc_rehearing", cites: { file: TABC_RULES, hearing: TX_AL11, grounds: TX_AL11 }, sources: [TABC_RULES, TX_AL11, "https://www.tabc.texas.gov/contact-us/file-a-complaint-protest/protest-a-license/"], read: READ,
  },
  {
    id: "tx_tabc_rehearing", name: B("Motion for rehearing of a TABC order (Texas)", "就 TABC 命令申请复议（德州）"),
    body: B("The Texas Alcoholic Beverage Commission", "德州酒类委员会"), where: { state: "TX" }, tz: "America/Chicago",
    covers: B("A signed Commission order denying, cancelling or suspending a license or permit after a contested case", "委员会在争议案件后签署的拒绝、吊销或暂停执照的命令"),
    deadline: { days: 25, unit: "calendar", from: "decision", trigger: B("The date the order was signed", "命令签署之日"), section: "Tex. Gov't Code §§2001.145(a), 2001.146(a); §311.014",
      says: "Gov't Code §2001.146(a): a motion for rehearing \"must be filed by a party not later than the 25th day after the date the decision or order that is the subject of the motion is signed\"; §2001.145(a): \"A timely motion for rehearing is a prerequisite to an appeal\". A last day on a Saturday, Sunday or legal holiday extends to the next day that isn't (Code Construction Act §311.014(b)).",
      verified: ok(TX_GV2001), roll: true, holidays: "TX" },
    form: B("A motion for rehearing stating each error, sent to every other party", "复议动议，逐项列明错误，并送达其他各方"),
    file: B("With TABC; copies to all other parties by a method in Gov't Code §2001.142(a) (§2001.146(a))", "提交 TABC；按政府法 §2001.142(a) 的方式送达其他各方（§2001.146(a)）"),
    fee: { usd: null, says: B("None stated in the statute", "法律未规定费用"), verified: false },
    grounds: [B("Each finding or conclusion you say is wrong, specifically: what isn't raised here can't be raised in court", "逐项列明您认为错误的认定或结论：此处未提出的问题不能在法院提出")],
    evidence: [...COMMON_EVIDENCE, B("The signed order and the proposal for decision", "签署的命令和拟议决定"), B("The SOAH record", "SOAH 听证记录")],
    hearing: [B("Replies are due by the 40th day after signing; TABC must act by the 55th day or the motion is overruled by operation of law (§2001.146(b), (c))", "答辩须在签署后第 40 天前提交；TABC 须在第 55 天前处理，否则动议依法视为驳回（§2001.146(b)、(c)）")],
    outcomes: [B("Granted (a new hearing), or overruled: the order becomes final and appealable (§2001.144(a)(2))", "批准（重新听证），或驳回：命令即成为最终可上诉命令（§2001.144(a)(2)）")],
    counsel: { advised: true, why: B("It fixes what a court may review", "它决定了法院可以审查的范围") },
    next: "tx_tabc_court_appeal", sources: [TX_GV2001, TX_GV311], read: READ,
  },
  {
    id: "tx_tabc_court_appeal", name: B("Appeal of a TABC order to district court (Texas)", "就 TABC 命令向地区法院上诉（德州）"),
    body: B("A Travis County district court for a denied permit; for a cancellation or suspension, the district court of the county where the licensee resides", "被拒许可：特拉维斯县地区法院；吊销或暂停：被许可人居住县的地区法院"), where: { state: "TX" }, tz: "America/Chicago",
    covers: B("A final TABC order denying, cancelling or suspending a license or permit", "TABC 拒绝、吊销或暂停执照的最终命令"),
    deadline: { days: 30, unit: "calendar", from: "decision", trigger: B("The day the order became final and appealable: the day the order overruling the rehearing motion was signed, or the motion was overruled by law (Gov't Code §2001.144(a)(2))", "命令成为最终可上诉之日：驳回复议动议的命令签署之日，或动议依法视为驳回之日（政府法 §2001.144(a)(2)）"),
      section: "Alcoholic Beverage Code §11.67(b)(1); Gov't Code §2001.176(a); §311.014",
      says: "Alcoholic Beverage Code §11.67(b)(1): \"the appeal shall be perfected and filed within 30 days after the date the order, decision, or ruling of the commission or administrator becomes final and appealable\"; a last day on a Saturday, Sunday or legal holiday extends to the next day that isn't (Gov't Code §311.014(b)).",
      verified: ok(TX_AL11), roll: true, holidays: "TX" },
    before: "tx_tabc_rehearing",
    form: B("A petition in district court, filed by counsel", "由律师向地区法院提交起诉状"),
    file: B("A denied permit: a Travis County district court, after exhausting administrative remedies (§11.43(i)); a cancellation or suspension: the licensee's county (§11.67(a)). Within 3 days after filing, the petition goes by certified or registered mail to the local officials and the first three protestants on record (§11.67(c))", "被拒许可：用尽行政救济后向特拉维斯县地区法院起诉（§11.43(i)）；吊销或暂停：被许可人所在县（§11.67(a)）。起诉后 3 天内须以挂号或保价邮件将起诉状寄给记录在案的地方官员及前三名抗议人（§11.67(c)）"),
    fee: { usd: null, says: B(`${U}: the court's filing fee; a license denial appeal also needs a bond for costs (§61.34(d))`, `${U}：法院收费；对执照拒绝上诉还须提供诉讼费担保（§61.34(d)）`), verified: false },
    grounds: [B("The order isn't supported by substantial evidence (§11.67(b))", "命令缺乏实质证据支持（§11.67(b)）")], evidence: [...COMMON_EVIDENCE, B("The SOAH record and the motion for rehearing", "SOAH 记录和复议动议")],
    hearing: [B("Tried before a judge within 20 days of filing; no jury (§11.67(b)(2), (3))", "起诉后 20 天内由法官审理；无陪审团（§11.67(b)(2)、(3)）"), B("The Commission is the only defendant (§11.67(b))", "委员会为唯一被告（§11.67(b)）")],
    outcomes: [B("Affirmed or reversed", "维持或撤销")],
    counsel: { advised: true, why: B("A court case", "法院诉讼") }, cites: { file: TX_AL11, fee: TX_AL61, hearing: TX_AL11, grounds: TX_AL11 }, sources: [TX_AL11, TX_GV2001, TX_AL61, TX_GV311], read: READ,
  },
  {
    id: "ny_sla_disapproval", name: B("Disapproved liquor license (New York SLA)", "纽约州酒类管理局：酒牌申请未获批准"),
    body: B("The State Liquor Authority, then the Supreme Court under CPLR article 78", "纽约州酒类管理局，之后为州最高法院（CPLR 第 78 条程序）"), where: { state: "NY" }, tz: "America/New_York",
    covers: B("The SLA refused to issue the license", "SLA 拒绝发放执照"),
    deadline: ARTICLE_78,
    form: B("A reconsideration request to the SLA, as its letter instructs; for court review, an article 78 petition filed by counsel", "按 SLA 来信要求申请复议；如需法院审查，由律师提交第 78 条程序申请"),
    file: B("Court review: the Supreme Court \"in the manner provided in article seventy-eight\" (Alcoholic Beverage Control Law §121(1))", "法院审查：州最高法院，按“第七十八条规定的方式”（酒类管制法 §121(1)）"),
    fee: { usd: null, says: B(`${U}: the court's index number fee`, `${U}：法院立案费`), verified: false },
    grounds: [B("New facts or conditions that answer the SLA's or the community board's concern", "可回应 SLA 或社区委员会顾虑的新事实或经营条件"), B("In court: the refusal was arbitrary, an abuse of discretion, or not supported by the record", "在法院：拒绝属任意、滥用裁量或缺乏记录支持")],
    evidence: [...COMMON_EVIDENCE, B("The community board's position and any stipulations you agreed to", "社区委员会的意见及您同意的附加条款")],
    hearing: [B("A reconsideration is taken up at a Full Board meeting; the SLA's letter sets any time for it (no official page read states one)", "复议在全体委员会会议上审议；时限以 SLA 来信为准（未查到官方页面规定）"), B("No stay in court except on notice to the SLA, and for at most thirty days (§121)", "法院不得暂停执行，除非通知 SLA，且最长三十天（§121）")],
    outcomes: [B("Approved, approved with conditions, or disapproval stands", "批准、附条件批准或维持不批准")],
    counsel: { advised: true, why: B("A discretionary liquor decision, and a court petition", "酒牌裁量决定及法院申请") },
    cites: { file: NY_ABC121, hearing: NY_ABC121, grounds: NY_ABC121 }, sources: [NY_CPLR217, NY_ABC121, NY_GCL25A, NY_GCL30, "https://sla.ny.gov/03082023-full-board-detailed-miscellaneous-agenda"], read: READ,
  },
  {
    id: "sf_board_of_appeals_building", name: B("Appeal a building permit decision (San Francisco Board of Appeals)", "就建筑许可决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals (five commissioners)", "旧金山上诉委员会（五名委员）"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A building permit issued, denied, suspended or revoked", "建筑许可的签发、拒绝、暂停或吊销"),
    deadline: { days: 15, unit: "calendar", from: "day_after", trigger: B("The day the departmental action became effective", "部门决定生效之日"), section: "SF Board of Appeals filing rules, as the Board publishes them", cutoff: "16:30",
      says: "\"You have 15 calendar days to file an appeal\" for building permits; \"the appeal period begins the day after the departmental action became effective\"; \"Appeals must be filed by 4:30 p.m.\"", verified: ok(SF_APPEAL) },
    form: B("A copy of the decision and a preliminary statement of the grounds: one page, double-spaced, 12-point or larger, no exhibits", "决定副本，加一页理由陈述：双倍行距、12 号字以上、不附证物"),
    file: B("By email to boardofappeals@sfgov.org, by phone (628-652-1150), or in person by appointment; pay online with the appeal number or by check to Board of Appeals, 49 South Van Ness Avenue, Suite 1475, San Francisco, CA 94103", "电邮至 boardofappeals@sfgov.org、电话（628-652-1150）或预约现场提交；凭上诉编号在线付款，或将支票寄至 Board of Appeals, 49 South Van Ness Avenue, Suite 1475, San Francisco, CA 94103"),
    fee: { usd: 175, says: B("Building permits $175, due at filing and non-refundable; a fee waiver form exists for financial hardship", "建筑许可 $175，提交时缴纳且不退；经济困难可申请减免"), verified: true },
    grounds: [B("The department erred or abused its discretion in issuing or denying it", "部门在签发或拒绝时有误或滥用裁量权"), B("The permit as conditioned meets the code", "附条件的许可符合规范")],
    evidence: [...COMMON_EVIDENCE, B("Plans as submitted and any corrections", "提交的图纸及修改"), B("The plan checker's comments and your responses", "审图意见及您的回复")],
    hearing: [B("You get an appeal number; you expand the one-page statement in a brief, due by 4:30 p.m. on its date", "取得上诉编号；在书状中展开一页陈述，按期下午 4:30 前提交"),
      B("Most decisions need 4 of 5 votes to grant (3 with a vacancy)", "多数决定需五票中四票通过（有空缺时三票）"), B("Rehearing request within 12 calendar days, $150", "可在 12 个日历日内申请复审，费用 $150"), B("Missed the deadline: a Jurisdiction Request, granted only if the City caused the lateness", "错过期限：可提交管辖权申请，仅在因市政府导致延误时批准")],
    outcomes: [B("Granted, granted with conditions, or denied (the decision stands)", "批准、附条件批准，或驳回（原决定维持）")],
    counsel: { advised: false, why: B("\"Parties are not required to be represented by attorneys\"; counsel helps when the other side has one", "“当事人无需律师代理”；对方有律师时，聘请律师更有利") },
    cites: { hearing: SF_FAQ }, sources: [SF_APPEAL, SF_FAQ], read: READ,
  },
  {
    id: "sf_board_of_appeals_variance", name: B("Appeal a variance decision (San Francisco Board of Appeals)", "就分区变更许可决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A variance, rear yard modification or reasonable modification decision", "分区变更、后院调整或合理调整决定"),
    deadline: { days: 10, unit: "calendar", from: "day_after", trigger: B("The day the decision became effective", "决定生效之日"), section: "SF Board of Appeals filing rules, as the Board publishes them", cutoff: "16:30",
      says: "\"You have 10 days to file an appeal for: Variance, Rear-Yard Modification and Reasonable Modification decisions\"; the period begins the day after the action became effective; \"Appeals must be filed by 4:30 p.m.\"", verified: ok(SF_APPEAL) },
    form: B("A copy of the decision and a one-page preliminary statement", "决定副本及一页理由陈述"),
    file: B("By email to boardofappeals@sfgov.org, by phone, or in person by appointment (628-652-1150)", "电邮至 boardofappeals@sfgov.org、电话或预约现场提交（628-652-1150）"),
    fee: { usd: 600, says: B("Planning Department decisions $600", "规划局决定 $600"), verified: true },
    grounds: [B("The Zoning Administrator's findings aren't supported", "分区管理员的认定缺乏支持")], evidence: [...COMMON_EVIDENCE, B("Plans, photos and neighbor letters", "图纸、照片和邻居来信")],
    hearing: [B("Brief, then a public hearing; 4 of 5 votes to grant", "提交书状后公开听证；需五票中四票通过")], outcomes: [B("Granted, conditioned or denied", "批准、附条件或驳回")],
    counsel: { advised: true, why: B("A variance hearing where neighbors are often parties and 4 of 5 votes are needed; the Board lets owners appear without one", "邻居常为当事方且需五票中四票通过的变更听证；委员会允许业主无律师出席") }, cites: { hearing: SF_FAQ }, sources: [SF_APPEAL, SF_FAQ], read: READ,
  },
  {
    id: "sf_board_of_appeals_zoning_admin", name: B("Appeal a Zoning Administrator determination (San Francisco Board of Appeals)", "就分区管理员决定上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A Zoning Administrator's Letter of Determination, or a Request for Suspension or Revocation of a building permit", "分区管理员的决定函，或暂停或吊销建筑许可的请求"),
    deadline: { days: 15, unit: "calendar", from: "day_after", trigger: B("The day the determination became effective", "决定生效之日"), section: "SF Board of Appeals filing rules, as the Board publishes them", cutoff: "16:30",
      says: "\"You have 15 calendar days to file an appeal for: ... Certain Zoning Administrator Decisions (eg. Letter of Determination, Request for Suspension or Revocation of a Building Permit)\"; the period begins the day after the action became effective.", verified: ok(SF_APPEAL) },
    form: B("A copy of the decision and a one-page preliminary statement", "决定副本及一页理由陈述"), file: B("By email to boardofappeals@sfgov.org, or by phone (628-652-1150)", "电邮至 boardofappeals@sfgov.org，或电话（628-652-1150）"),
    fee: { usd: 600, says: B("Planning Department decisions $600", "规划局决定 $600"), verified: true },
    grounds: [B("The determination misreads the Planning Code for this use", "该决定误读了规划法规对此用途的规定")], evidence: [...COMMON_EVIDENCE, B("The use as permitted and its history", "已许可用途及其历史")],
    hearing: [B("Brief, then a public hearing", "提交书状后公开听证")], outcomes: [B("Overturned, modified or upheld", "推翻、修改或维持")],
    counsel: { advised: false, why: B("\"Parties are not required to be represented by attorneys\"; a review is worth it because the Planning Code reading decides it", "“当事人无需律师代理”；结果取决于对规划法规的解读，值得请人审阅") }, cites: { hearing: SF_FAQ }, sources: [SF_APPEAL, SF_FAQ], read: READ,
  },
  {
    id: "sf_board_of_appeals_za_violation", name: B("Appeal a Zoning Administrator Notice of Violation (San Francisco Board of Appeals)", "就分区管理员违规通知上诉（旧金山上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A Notice of Violation issued by the Zoning Administrator", "分区管理员发出的违规通知"),
    deadline: { days: 30, unit: "calendar", from: "day_after", trigger: B("The day the notice was issued", "通知发出之日"), section: "SF Board of Appeals filing rules, as the Board publishes them", cutoff: "16:30",
      says: "\"You have 30 calendar days to file an appeal for: Notice of Violation issued by the Zoning Administrator\".", verified: ok(SF_APPEAL) },
    form: B("A copy of the notice and a one-page preliminary statement", "通知副本及一页理由陈述"), file: B("By email to boardofappeals@sfgov.org, or by phone (628-652-1150)", "电邮至 boardofappeals@sfgov.org，或电话（628-652-1150）"),
    fee: { usd: 600, says: B("Planning Department decisions $600", "规划局决定 $600"), verified: true },
    grounds: [B("The use or work cited is permitted, or has been corrected", "被指违规的用途或工程已获许可或已整改")], evidence: [...COMMON_EVIDENCE, B("Permits, photos and the history of the use", "许可、照片及用途历史")],
    hearing: [B("Brief, then a public hearing", "提交书状后公开听证")], outcomes: [B("Overturned, modified or upheld", "推翻、修改或维持")],
    counsel: { advised: false, why: B("\"Parties are not required to be represented by attorneys\"; a review is worth it for an enforcement case", "“当事人无需律师代理”；执法案件值得请人审阅") }, cites: { hearing: SF_FAQ }, sources: [SF_APPEAL, SF_FAQ], read: READ,
  },
  {
    id: "sf_board_of_appeals_permit", name: B("Appeal another San Francisco permit decision (Board of Appeals)", "就旧金山其他许可决定上诉（上诉委员会）"),
    body: B("San Francisco Board of Appeals", "旧金山上诉委员会"), where: { state: "CA", city: "sf" }, tz: "America/Los_Angeles",
    covers: B("A business permit or order the Board hears, such as a tobacco permit or an Entertainment Commission permit", "上诉委员会受理的营业许可或命令，如烟草许可或娱乐委员会许可"),
    deadline: { days: 10, unit: "calendar", from: "day_after", trigger: B("The day the permit or decision was issued", "许可或决定发出之日"), section: "SF Board of Appeals filing rules, as the Board publishes them", cutoff: "16:30", atLeast: true,
      says: "\"In most cases appeals must be filed within either 10 or 15 calendar days after the permit or decision was issued\" (15 for tobacco permits; 10 for certain Entertainment Commission permits). \"Email or call the Board Office to confirm the deadline to file your appeal.\" Placetta counts the shorter one until the Board confirms.", verified: ok(SF_APPEAL) },
    form: B("A copy of the decision and a one-page preliminary statement", "决定副本及一页理由陈述"), file: B("By email to boardofappeals@sfgov.org, or by phone (628-652-1150), which also confirms whether the Board hears this permit", "电邮至 boardofappeals@sfgov.org，或电话（628-652-1150），同时确认委员会是否受理该许可"),
    fee: { usd: 300, says: B("\"Most other permits or orders $300\"; the Board confirms the cost at filing", "“其他多数许可或命令 $300”；以提交时委员会确认的金额为准"), verified: true },
    grounds: [B("The department erred or abused its discretion", "部门有误或滥用裁量权")], evidence: [...COMMON_EVIDENCE],
    hearing: [B("Brief, then a public hearing", "提交书状后公开听证")], outcomes: [B("Granted, conditioned or denied", "批准、附条件或驳回")],
    counsel: { advised: false, why: B("\"Parties are not required to be represented by attorneys\"", "“当事人无需律师代理”") }, cites: { hearing: SF_FAQ }, sources: [SF_APPEAL, SF_FAQ], read: READ,
  },
  {
    id: "la_planning_appeal", name: B("Appeal a Los Angeles City Planning determination", "就洛杉矶城市规划决定上诉"),
    body: B("The Area Planning Commission, City Planning Commission or City Council, as the determination names", "按决定书所列：地区规划委员会、市规划委员会或市议会"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("A zoning or planning determination (conditional use, variance, Director's or Zoning Administrator's decision)", "分区或规划决定（有条件使用、变更许可、主任或分区管理员的决定）"),
    deadline: { days: 10, unit: "calendar", from: "decision", trigger: B("The issuance of the Letter of Determination", "决定函发出之日"), section: "LAMC Chapter 1A, Article 13B (by entitlement), as City Planning states it", cutoff: "16:30", atLeast: true, roll: true,
      says: "City Planning: \"An appeal must be filed within a specified period of time as established by the LAMC, varying in length from 10 to 15 days of the issuance of the Letter of Determination\", \"typically also identified within the LOD\"; it \"must be submitted and paid for before 4:30 PM (PST) on the final day\", and \"Should the final day fall on a weekend or legal City holiday, the time for filing an appeal shall be extended to 4:30 PM (PST) on the next succeeding working day.\" Placetta counts 10 until the letter's Final Date to Appeal is entered.",
      verified: ok(LA_APPEALS), check: ["https://codelibrary.amlegal.com/codes/los_angeles/latest/lamc_ch1a/0-0-0-1"] },
    form: B("Appeal Application CP13-7769, a justification for the appeal, and the Letter of Determination (one original and two copies, plus each as a PDF)", "上诉申请表 CP13-7769、上诉理由说明及决定函（一份原件两份副本，另各附 PDF）"),
    file: B("Online through the Online Application System (planning.lacity.gov/oas), or in person at a Development Services Center", "通过在线申请系统（planning.lacity.gov/oas）或到发展服务中心现场提交"),
    fee: { usd: null, says: B("Original applicant: per LAMC 19.01 B.1(a) (Chapter 1) or 15.1.1.F.1.a (Chapter 1A), or 85% of the original base application fee (bring the receipt); an aggrieved party per 19.01 B.1(b) or 15.1.1.F.1.b; plus the hearing notice mailing", "原申请人：按 LAMC 19.01 B.1(a)（第 1 章）或 15.1.1.F.1.a（第 1A 章），或原基本申请费的 85%（请带收据）；利害关系人按 19.01 B.1(b) 或 15.1.1.F.1.b；另加听证通知邮寄费"), verified: true },
    grounds: [B("The decision-maker erred or abused its discretion", "决策者有误或滥用裁量权"), B("Conditions can answer the concern", "附加条件可以解决顾虑")],
    evidence: [...COMMON_EVIDENCE, B("The original application receipt(s), which set the fee", "原申请收据（决定上诉费）"), B("Mailing labels for the appeal hearing notice (CP13-2074)", "上诉听证通知的邮寄标签（CP13-2074）"), B("Plans, photos, community letters", "图纸、照片、社区来信")],
    hearing: [B("A public hearing before the appellate body named in the determination; notice at least 10 days before", "在决定书所列上诉机构前公开听证；至少提前 10 天通知"), B("If the body can't act by its last day to act, the appeal is deemed denied", "如上诉机构未能在最后期限前作出决定，上诉视为被驳回"), B("Court review: a writ petition no later than the 90th day after the decision became final (Code of Civil Procedure §1094.6)", "法院审查：决定生效后第 90 天前提交令状申请（民事诉讼法 §1094.6）")],
    outcomes: [B("Granted, granted in part, or denied", "批准、部分批准或驳回")],
    counsel: { advised: true, why: B("A zoning hearing", "分区听证") },
    cites: { form: LA_CP7769, file: LA_CP7769, fee: LA_CP7769, hearing: LA_CP7769 }, sources: [LA_APPEALS, LA_CP7769], read: READ,
  },
  {
    id: "la_bbsc_appeal", name: B("Appeal to the Board of Building and Safety Commissioners (Los Angeles)", "向洛杉矶建筑与安全委员会上诉"),
    body: B("Board of Building and Safety Commissioners", "建筑与安全委员会"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("A LADBS decision on the Building Code, such as a denied Request for Modification, said to be in error or an abuse of discretion (a zoning question goes to City Planning on CP13-7854 instead)", "LADBS 关于建筑规范的决定（如被拒的变更申请），认为有误或滥用裁量权（分区问题须改用 CP13-7854 向城市规划局上诉）"),
    deadline: { days: 15, unit: "calendar", from: "decision", trigger: B("The Department's action on the violation (a decision with no violation has no filing deadline in the code; use any date in LADBS's letter)", "LADBS 就违规所作的处理（不涉及违规的决定，法规未设申请期限；以 LADBS 来信中的日期为准）"), section: "LAMC §98.0403.2 (as LADBS publishes it)",
      says: "LAMC §98.0403.2, as published on LADBS's BBSC appeals page: \"If an appeal or request for a slight modification is not filed with 15 days after the Department's action on the violation, the action and/or determination of the Department shall be final.\" Appeals to the Board \"shall be made in writing, upon appropriate forms provided therefore by the Department\" with a filing fee \"as set forth in Tables 4-A or 4-B\". Placetta uses 15 days for every LADBS determination so no appeal is filed late.",
      verified: ok("https://dbs.lacity.gov/our-organization/building-and-safety-comissioners/bbsc-appeals-ordinances") },
    form: B("The Request for Modification, then the Supplemental Application for Appeals with the grounds itemized by LAMC section, signatures notarized, with the evidence attached", "先提交变更申请，再提交上诉补充申请表，按 LAMC 条款逐项列出理由，签名须公证，并附证据"),
    file: B("With the Chief Inspector or Building Civil Engineer (or above) in charge of the office that decided; after paying, return the package to that manager, who hand-delivers it to the Commission Office", "提交给作出决定的办公室主管首席检查员或建筑土木工程师（或更高级别）；缴费后将材料交回该主管，由其转交委员会办公室"),
    fee: { usd: null, says: B("Request for Modification: $130 for the first item, $39 each additional, plus $208 for two hours of research; the appeal: by Tables 4A or 4B plus $104 an hour of research (P/BC 2026-149)", "变更申请：首项 $130，每增一项 $39，另加两小时研究费 $208；上诉：按表 4A 或 4B，另加每小时 $104 研究费（P/BC 2026-149）"), verified: true },
    grounds: [B("LADBS erred or abused its discretion", "LADBS 有误或滥用裁量权"), B("An equivalent alternative meets the code's intent", "替代方案满足规范意图")],
    evidence: [...COMMON_EVIDENCE, B("Engineer's or architect's letter on the equivalent alternative", "工程师或建筑师就替代方案出具的意见")],
    hearing: [B("LADBS reports within 60 days of the appeal; the Board hears it at its next available date; written notice at least ten days before", "LADBS 在上诉后 60 天内出具报告；委员会在下一次会期审理；至少提前十天书面通知"),
      B("Nothing new is accepted after filing unless a new appeal is filed and paid", "提交后不再接受新材料，除非另行上诉并缴费")],
    outcomes: [B("Granted, granted with conditions, or denied", "批准、附条件批准或驳回")],
    counsel: { advised: false, why: B("Technical; an engineer or architect usually leads it", "技术性强，通常由工程师或建筑师主导") },
    sources: [LADBS_149, LA_CP7854], read: READ,
  },
  {
    id: "la_tax_assessment_review", name: B("Contest a Los Angeles business tax assessment (Assessment Review)", "就洛杉矶营业税核定提出异议（核定复审）"),
    body: B("The Office of Finance's Assessment Review Officer", "财政局核定复审官"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("A business tax assessment, or a registration or renewal the Office of Finance refused or assessed", "营业税核定，或财政局拒绝或核定的登记或续期"),
    deadline: { days: 45, unit: "calendar", from: "decision", trigger: B("The date of service of the assessment", "核定通知的送达日期"), section: "LAMC §21.16, as the Office of Finance states it",
      says: "\"Within 45 days from the date of service of an assessment or 45 days for all monthly tax assessments, the taxpayer may appeal the assessment by requesting, in writing, a hearing before the Assessment Review Officer.\"", verified: ok(LA_ARO) },
    form: B("A written request for a hearing addressed to the Assessment Review Officer, stating the basis for it", "致核定复审官的书面听证申请，说明理由"), file: B("With the Office of Finance, which acknowledges it in writing", "向财政局提交，财政局书面确认收到"),
    fee: { usd: null, says: B("None stated", "未列明费用"), verified: false },
    grounds: [B("The assessment's facts or figures are wrong", "核定所依据的事实或数字有误"), B("The business is exempt, or owes less", "企业免税或应缴更少")],
    evidence: [...COMMON_EVIDENCE, B("Gross receipts records and returns", "总收入记录和申报表"), B("A position paper, due at least 30 days before the hearing", "立场书，须在听证前至少 30 天提交")],
    hearing: [B("Set no later than 90 days from the request; notice mailed at least 30 days before", "申请后 90 天内安排听证；至少提前 30 天邮寄通知"), B("The decision normally comes within 90 days of the last hearing", "通常在最后一次听证后 90 天内作出决定")],
    outcomes: [B("Assessment withdrawn, reduced or upheld; upheld: the Board of Review", "核定撤销、减少或维持；维持则可向复审委员会上诉")],
    counsel: { advised: false, why: B("A tax adviser usually handles it", "通常由税务顾问处理") },
    next: "la_tax_board_of_review", sources: [LA_ARO], read: READ,
  },
  {
    id: "la_tax_board_of_review", name: B("Appeal to the Office of Finance Board of Review (Los Angeles)", "向洛杉矶财政局复审委员会上诉"),
    body: B("Board of Review, a panel not involved in the first hearing", "复审委员会（未参与首次听证的小组）"), where: { state: "CA", city: "la" }, tz: "America/Los_Angeles",
    covers: B("The Assessment Review Officer's decision", "核定复审官的决定"),
    deadline: { days: 45, unit: "calendar", from: "decision", trigger: B("The date of service of the Assessment Review Officer's decision", "核定复审官决定的送达日期"), section: "LAMC §21.16, as the Office of Finance states it",
      says: "\"Within 45 days from the date of service of the decision of the Assessment Review Officer, the taxpayer may appeal the decision of the Assessment Review Officer by requesting a hearing before the Board of Review.\"", verified: ok(LA_BOR) },
    form: B("A written request for a Board of Review hearing", "书面申请复审委员会听证"), file: B("With the Office of Finance", "向财政局提交"),
    fee: { usd: null, says: B("None stated", "未列明费用"), verified: false },
    grounds: [B("Only the issues heard by the Assessment Review Officer, except in extraordinary circumstances", "除特殊情况外，仅限于核定复审时已审理的问题")], evidence: [...COMMON_EVIDENCE, B("The position papers and the Assessment Review Officer's decision", "立场书和核定复审官的决定")],
    hearing: [B("Set no later than 90 days after the appeal; notice mailed at least 15 days before; postponements in writing to the Hearing Officer", "上诉后 90 天内安排听证；至少提前 15 天邮寄通知；延期须书面向听证官申请")],
    outcomes: [B("Assessment withdrawn, reduced or upheld", "核定撤销、减少或维持")],
    counsel: { advised: false, why: B("A tax adviser usually handles it", "通常由税务顾问处理") }, sources: [LA_BOR], read: READ,
  },
  {
    id: "nyc_bsa_appeal", name: B("Appeal to the NYC Board of Standards and Appeals", "向纽约市标准与上诉委员会上诉"),
    body: B("Board of Standards and Appeals (BSA)", "标准与上诉委员会（BSA）"), where: { state: "NY", city: "nyc" }, tz: "America/New_York",
    covers: B("A final determination of the Department of Buildings, the Fire Department or the Department of Transportation", "建筑局、消防局或交通局的最终决定"),
    deadline: { days: 30, unit: "calendar", from: "decision", trigger: B("The date of the determination", "决定日期"), section: "2 RCNY §1-06.3(a)(1)",
      says: "2 RCNY §1-06.3(a)(1): an appeal \"must be filed within thirty (30) days from the date of the determination.\"", verified: ok("https://www.nyc.gov/site/bsa/about/1-06-appeals-calendar-a.page") },
    form: B("The BSA's A Form, with the determination appealed", "BSA 的 A 表，附被上诉的决定"),
    file: B("With the BSA; within 3 business days, copies to the agency that signed the determination and, if you aren't the owner, to the property owner, with proof of service", "向 BSA 提交；3 个工作日内将副本送达作出决定的机构，若您不是业主还须送达业主，并提交送达证明"),
    fee: { usd: null, says: B(`${U}: the rules page doesn't state the fee`, `${U}：规则页面未列明费用`), verified: false },
    grounds: [B("The determination misreads the Zoning Resolution or the Building Code", "决定误读了分区决议或建筑规范")], evidence: [...COMMON_EVIDENCE, B("Plans, the objection sheet and the code sections", "图纸、审查意见单和相关条款")],
    hearing: [B("The BSA sends the hearing notice at least 30 days before; forward it at least 20 days before to the agency and the owner", "BSA 至少提前 30 天发出听证通知；您须至少提前 20 天转送机构和业主")],
    outcomes: [B("Granted or denied", "批准或驳回")], counsel: { advised: false, why: B("The rule sets filing and service steps an owner can follow; a review is worth it because the reading of the Zoning Resolution or the Building Code decides it", "规则规定了业主可自行完成的提交和送达步骤；结果取决于对分区决议或建筑规范的解读，值得请人审阅") },
    sources: ["https://www.nyc.gov/site/bsa/about/1-06-appeals-calendar-a.page"], read: READ,
  },
  {
    id: "nyc_dcwp_denial", name: B("Denied NYC Consumer and Worker Protection license", "纽约市消费者与劳工保护局执照被拒"),
    body: B("DCWP, then the Supreme Court under CPLR article 78", "消费者与劳工保护局，之后为州最高法院（CPLR 第 78 条程序）"), where: { state: "NY", city: "nyc" }, tz: "America/New_York",
    covers: B("A DCWP license application denied (for example a tobacco, sidewalk cafe or general vendor license)", "消费者与劳工保护局拒绝的执照申请（如烟草、人行道咖啡座或一般摊贩执照）"),
    deadline: ARTICLE_78,
    form: B("A corrected new application, or an article 78 petition filed by counsel", "修正后重新申请，或由律师提交第 78 条程序申请"),
    file: B("A new application through NYC Business; court review in the Supreme Court", "通过 NYC Business 重新申请；法院审查在州最高法院"),
    fee: { usd: null, says: B(`${U}: the license fee again for a new application; the court's index number fee`, `${U}：重新申请的执照费；法院立案费`), verified: false },
    grounds: [B("The reason DCWP gave is wrong or has been fixed: \"If your application is denied: DCWP will provide you with the reason\"", "消费者与劳工保护局给出的理由有误或已解决：“如申请被拒，DCWP 会告知原因”"), B("Documents DCWP asked for were sent within its 10 days", "已在 10 天内补交所要求的文件")],
    evidence: [...COMMON_EVIDENCE, B("Every document DCWP asked for, with the date it was sent", "DCWP 要求的每份文件及寄出日期")],
    hearing: [B("No administrative appeal is published; most denials are fixed and refiled", "未公布行政上诉程序；多数拒绝可修正后重新申请")], outcomes: [B("Licensed on refiling, or the denial stands", "重新申请后获发执照，或维持拒绝")],
    counsel: { advised: false, why: B("Most are fixed and refiled; counsel for a court petition", "多数可修正后重新申请；如向法院申请须聘请律师") },
    cites: { grounds: NYC_DCWP_AFTER, hearing: NYC_DCWP_AFTER }, sources: [NY_CPLR217, NYC_DCWP_AFTER, NY_GCL25A, NY_GCL30], read: READ,
  },
  {
    id: "ca_health_permit_hearing", name: B("Hearing on a health permit suspension or revocation (California Retail Food Code)", "卫生许可暂停或吊销的听证（加州零售食品法）"),
    body: B("The county environmental health agency's hearing officer", "县环境卫生机构的听证官"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A notice that the health permit will be suspended or revoked after a notice to comply wasn't met", "未按整改通知整改后，卫生许可将被暂停或吊销的通知"),
    deadline: { days: 15, unit: "calendar", from: "decision", trigger: B("Receipt of the notice (not its date)", "收到通知之日（而非通知日期）"), section: "Health & Safety Code §114405(b)",
      says: "Health and Safety Code §114405(b): \"A written request for a hearing shall be made by the PERMIT HOLDER within 15 calendar days after receipt of the notice. A failure to request a hearing within 15 calendar days after receipt of the notice shall be deemed a waiver of the right to a hearing.\"",
      verified: ok(CALCODE), check: [leginfo("HSC", "114405")] },
    form: B("A written request for hearing, as the notice instructs", "按通知要求提交书面听证申请"), file: B("With the county environmental health office named on the notice", "向通知所列的县环境卫生办公室提交"),
    fee: { usd: null, says: B("None stated in the Code", "法规未规定费用"), verified: false },
    grounds: [B("The violations are corrected, or weren't as cited", "违规已整改，或与认定不符")], evidence: [...COMMON_EVIDENCE, B("The notice to comply and the inspection report", "整改通知和检查报告"), B("Photos and receipts showing each correction", "每项整改的照片和收据")],
    hearing: [B("Held within 15 calendar days of the request; the hearing officer may postpone on written request (§114405(c))", "申请后 15 个日历日内举行；可书面申请延期（§114405(c)）"), B("A written decision within five working days after the hearing (§114407)", "听证后五个工作日内出具书面决定（§114407）")],
    outcomes: [B("Permit kept, conditions set, suspended or revoked; reinstated once the conditions no longer exist (§114413)", "保留许可、附条件、暂停或吊销；问题消除后可恢复（§114413）")],
    counsel: { advised: false, why: B("Usually decided on the corrections; counsel if revocation is on the table", "通常取决于整改情况；如面临吊销，建议咨询律师") },
    sources: [CALCODE], read: READ,
  },
  {
    id: "ca_health_closure_hearing", name: B("Hearing on an immediate closure for an imminent health hazard (California Retail Food Code)", "因紧急健康危害被立即停业的听证（加州零售食品法）"),
    body: B("The county environmental health agency's hearing officer", "县环境卫生机构的听证官"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("The permit suspended and the facility closed on the spot for an imminent health hazard", "因紧急健康危害当场暂停许可并停业"),
    deadline: { days: 15, unit: "calendar", from: "decision", trigger: B("Service of the notice", "通知送达之日"), section: "Health & Safety Code §114409(c)",
      says: "Health and Safety Code §114409(c): \"At any time within 15 calendar days after service of a notice pursuant to subdivision (b), the PERMIT HOLDER may request in writing a hearing before a HEARING OFFICER to show cause why the PERMIT suspension is not warranted. The hearing shall be held within 15 calendar days of the receipt of a request for a hearing. A failure to request a hearing within 15 calendar days shall be deemed a waiver of the right to a hearing.\"",
      verified: ok(CALCODE), check: [leginfo("HSC", "114409")] },
    form: B("A written request for hearing", "书面听证申请"), file: B("With the county environmental health office named on the notice", "向通知所列的县环境卫生办公室提交"),
    fee: { usd: null, says: B("None stated in the Code", "法规未规定费用"), verified: false },
    grounds: [B("The hazard is corrected: a permit may be reinstated once the conditions no longer exist (§114413)", "危害已消除：问题消除后许可可恢复（§114413）"), B("There was no imminent health hazard as cited", "不存在所指的紧急健康危害")],
    evidence: [...COMMON_EVIDENCE, B("The closure notice and the inspection report", "停业通知和检查报告"), B("Pest control, repair and hot water receipts and photos", "灭虫、维修、热水的收据和照片")],
    hearing: [B("Usually faster than a hearing: fix the hazard and ask for the reinspection that reinstates the permit", "通常比听证更快：消除危害并申请复检以恢复许可"), B("Held within 15 calendar days of the request", "申请后 15 个日历日内举行")],
    outcomes: [B("Permit reinstated, conditions set, or suspension upheld", "恢复许可、附条件，或维持暂停")],
    counsel: { advised: false, why: B("Decided on the corrections", "取决于整改情况") }, sources: [CALCODE], read: READ,
  },
  {
    id: "ca_health_plan_review", name: B("Health plan check rejected (California Retail Food Code)", "卫生图纸审查未通过（加州零售食品法）"),
    body: B("The county environmental health agency", "县环境卫生机构"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("Food facility plans rejected, or not decided in time", "食品设施图纸被拒，或未按时作出决定"),
    deadline: { days: null, unit: "business", from: "decision", trigger: B("No appeal period: a corrected plan can be resubmitted at any time", "无上诉期限：修正后的图纸可随时重新提交"), section: "Health & Safety Code §114380(e), (f)",
      says: "Health and Safety Code §114380(e): plans \"shall be APPROVED or rejected within 20 working days after receipt\"; \"Unless the plans are APPROVED or rejected within 20 working days, they shall be deemed APPROVED.\" §114380(f)(2), a restaurant tenant improvement: the applicant \"may resubmit a corrected plan addressing the deficiencies identified in the initial denial\"; review of it \"shall be limited to correcting the deficiencies identified in the initial denial\", decided \"within 10 business days of receipt\".",
      verified: ok(CALCODE), check: [leginfo("HSC", "114380")] },
    form: B("Corrected plans answering each deficiency in the rejection", "逐项回应驳回意见的修正图纸"), file: B("With the county's plan check, as the first submission", "按首次提交的方式提交县图纸审查"),
    fee: { usd: null, says: B("The county's plan check fee schedule", "以县图纸审查收费表为准"), verified: false },
    grounds: [B("A restaurant tenant improvement's resubmission may be reviewed only on the deficiencies first identified (§114380(f)(2))", "餐厅装修重新提交时，只能就首次指出的问题审查（§114380(f)(2)）"), B("Plans not decided within 20 working days are deemed approved (§114380(e))", "20 个工作日内未作决定的图纸视为批准（§114380(e)）")],
    evidence: [...COMMON_EVIDENCE, B("The rejection with each deficiency, and the date the complete plan was received", "列明问题的驳回意见，以及完整图纸的收件日期")],
    hearing: [B("No hearing: answer each deficiency, one line per item, and cite §114380(f)(2) if new items appear", "无听证：逐项回应问题，如出现新问题可援引 §114380(f)(2)")],
    outcomes: [B("Approved, or rejected again on the same deficiencies", "批准，或因同样问题再次被拒")],
    counsel: { advised: false, why: B("A corrections exchange, not a hearing", "属整改往来，非听证") }, sources: [CALCODE], read: READ,
  },
  {
    id: "nyc_health_oath", name: B("Health Department summons: settle or a hearing at OATH (New York City)", "卫生局传票：和解或在 OATH 听证（纽约市）"),
    body: B("Office of Administrative Trials and Hearings (OATH)", "行政审判与听证办公室（OATH）"), where: { state: "NY", city: "nyc" }, tz: "America/New_York",
    covers: B("A summons from a Health Department inspection, including after a closure", "卫生局检查开出的传票（包括停业后）"),
    deadline: { days: null, unit: "calendar", from: "decision", trigger: B("The hearing date printed on the summons", "传票上所印的听证日期"), section: "NYC Health Department and OATH procedures, as published",
      says: "The hearing date printed on the summons. Settle \"before the hearing date\"; \"Request your Hearing by Phone at least three business days before your scheduled hearing date\"; a missed hearing can be reopened \"within 75 days of the date of the missed hearing date\", once per summons.", verified: ok("https://nyc-business.nyc.gov/nycbusiness/description/settle-a-food-service-establishment-violation") },
    form: B("The Offer of Settlement, or a hearing (by phone, online or in person)", "和解要约，或参加听证（电话、在线或现场）"),
    file: B("Check for an offer on the Health Department's Permit and License Center; hearings at OATH", "在卫生局许可证中心查看和解要约；听证在 OATH 进行"),
    fee: { usd: null, says: B("The settlement amount offered, or the penalty OATH imposes", "和解金额或 OATH 判处的罚款"), verified: true },
    grounds: [B("The violation wasn't as cited", "违规与传票不符"), B("It was corrected; the penalty should be lower", "已整改，罚款应降低")],
    evidence: [...COMMON_EVIDENCE, B("The inspection report and the summons", "检查报告和传票"), B("Photos, pest control and repair receipts", "照片、灭虫和维修收据")],
    hearing: [B("Most choose a phone hearing; ask at least three business days ahead", "多数人选择电话听证；须至少提前三个工作日申请")],
    outcomes: [B("Dismissed, reduced or upheld; a default if missed (a higher penalty)", "撤销、减轻或维持；缺席则按缺席处理（罚款更高）")],
    counsel: { advised: false, why: B("\"OATH hearings do not require a lawyer or representative\"; most settle or appear themselves", "“OATH 听证无需律师或代理人”；多数人自行和解或出席") },
    sources: ["https://nyc-business.nyc.gov/nycbusiness/description/settle-a-food-service-establishment-violation", "https://www.nyc.gov/site/oath/hearings/reopen-a-missed-hearing-default-online.page", OATH_REP, OATH_WHAT], read: READ,
  },
  {
    id: "dal_building_appeals_board", name: B("Appeal a denied certificate of occupancy or building permit (Dallas Board of Appeals)", "就被拒的入住证或建筑许可上诉（达拉斯上诉委员会）"),
    body: B("Dallas Board of Appeals (Building Inspection)", "达拉斯上诉委员会（建筑检查）"), where: { state: "TX", city: "dallas" }, tz: "America/Chicago",
    covers: B("A Building Inspection denial, suspension or revocation of a permit, a certificate of occupancy or an alternate means and method (not zoning: that's the Board of Adjustment)", "建筑检查部门对许可、入住证或替代方案的拒绝、暂停或吊销（分区问题由调整委员会处理）"),
    deadline: { days: 15, unit: "calendar", from: "day_after", trigger: B("The date of the Notice of Disapproval (or of the departmental decision)", "不予批准通知（或部门决定）的日期"), section: "Dallas City Code ch. 52, §208.1", roll: true, cutoff: "16:30",
      says: "\"appeals must be filed within 15 calendar days from the date of issuance of the underlying departmental decision\" (Chapter 52, Section 208.1); \"the appeal period begins the day after the departmental action became effective\"; \"If the last calendar day falls on a weekend or City holiday, the last day to file the appeal is the next business day.\" For a CO or permit denial, \"The appeal must be filed within 15 calendar days from the date of this Notice of Disapproval.\"",
      verified: ok(DAL_BOARD) },
    form: B("The denied application (with Planning's notation on the back), the Notice of Disapproval, and a one-page double-spaced preliminary statement, no exhibits", "被拒的申请（背面有规划人员批注）、不予批准通知，以及一页双倍行距的初步陈述，不附证物"),
    file: B("In person by the appellant or an agent, by appointment (214-948-4347), at 320 E Jefferson Blvd, Dallas TX 75203; appointments Monday to Friday, 8:00 a.m. to 4:30 p.m.", "由上诉人或代理人预约（214-948-4347）现场提交，地址 320 E Jefferson Blvd, Dallas TX 75203；预约时间周一至周五上午 8:00 至下午 4:30"),
    fee: { usd: 714, says: B("$714 at filing (Chapter 52, §303.5.18), non-refundable; cash or check payable to Building Inspection, City of Dallas", "提交时缴纳 $714（第 52 章 §303.5.18），不退；现金或支票，抬头 Building Inspection, City of Dallas"), verified: true },
    grounds: [B("Building Inspection misapplied the construction codes", "建筑检查部门错误适用了建筑规范"), B("An alternate means and method meets the code's intent", "替代方案满足规范意图")],
    evidence: [...COMMON_EVIDENCE, B("Plans or drawings showing the layout", "显示布局的图纸"), B("Photos and letters of support", "照片和支持信")],
    hearing: [B("Your brief is due three Thursdays before the hearing: at most 12 pages, double-spaced, an original and 18 copies by 4:30 p.m., copies to the other parties the same day", "书状须在听证前第三个周四提交：最多 12 页、双倍行距，原件加 18 份副本，下午 4:30 前送达，并同日送达其他各方"),
      B("The Board meets the third Tuesday of each month at 11:30 a.m., Oak Cliff Municipal Center; the appellant speaks first", "委员会每月第三个周二上午 11:30 在 Oak Cliff Municipal Center 开会；上诉人先发言"), B("A majority of members present overturns or modifies the decision; watch a meeting first", "出席委员过半数即可推翻或修改决定；建议先旁听一次会议")],
    outcomes: [B("Upheld, conditioned or overruled", "维持、附条件或推翻")],
    counsel: { advised: false, why: B("\"This agent does not have to be a lawyer or other professional\"", "“代理人不必是律师或其他专业人士”") }, sources: [DAL_BOARD], read: READ,
  },
  {
    id: "business_license_denial", name: B("Denied business license or permit (any city)", "营业执照或许可被拒（各城市）"),
    body: B("The body the denial letter names", "拒绝函所列机构"), where: { state: "CA" }, tz: "America/Los_Angeles",
    covers: B("A city or county license or permit denied where no specific playbook applies; San José and Houston have no general business license to deny", "无专门流程适用的市县执照或许可被拒；圣何塞和休斯敦没有可被拒绝的一般营业执照"),
    deadline: { days: null, unit: "calendar", from: "decision", trigger: B("No appeal period of its own: a general business license denial doesn't exist in San José or Houston, and elsewhere the denial letter states who hears an appeal and by when", "无自身上诉期限：圣何塞和休斯敦不存在一般营业执照被拒的情形，其他城市以拒绝函所列的受理机构和期限为准"),
      section: "San José: Business Tax Certificate (Finance); Houston and Texas: no general business license",
      says: "San José: \"After you register and pay, you will receive a Business Tax Certificate, which is an official receipt for payment of the tax\" (a receipt, not a license the City decides on). Houston: the City lists \"four main requirements for a business to legally operate in the City of Houston\" (entity registration, a Texas sales tax permit, an EIN, a property tax rendition), none a general license, and the State says \"The State of Texas does not require a general license.\" A specific Houston permit (food dealer, alcoholic beverage, sign) that's denied follows the process its denial letter states.",
      verified: ok(SJ_BTC), check: ["https://library.municode.com/ca/san_jose/codes/code_of_ordinances?nodeId=TIT4REFI_CH4.76BUTA"] },
    form: B("A corrected filing, or the review the denial letter names", "修正后重新提交，或按拒绝函所列程序申请复查"), file: B("As the denial letter instructs", "按拒绝函说明"),
    fee: { usd: null, says: B("Whatever the letter or the corrected filing charges", "以来函或重新提交的收费为准"), verified: false },
    grounds: [B("The reason given is wrong, or has been fixed", "所给理由有误或已解决")], evidence: COMMON_EVIDENCE,
    hearing: [B("As the letter says", "按来函说明")], outcomes: [B("Issued, or denial upheld", "发照或维持拒绝")],
    counsel: { advised: false, why: B("Most denials are fixed and refiled", "多数拒绝可修正后重新提交") }, sources: [SJ_BTC, HOU_START, TX_GENERAL], read: READ,
  },
];
export const appealById = (id: string) => APPEALS.find((a) => a.id === id);

/** What "business license denial" means in each top city, and the playbook that answers it. */
export const BUSINESS_LICENSE_ROUTES: { city: string; route: AppealId | null; what: string; source?: string; check?: string }[] = [
  { city: "San Francisco", route: "sf_board_of_appeals_permit", what: "A permit the Board of Appeals hears (the business registration itself is a tax registration)" },
  { city: "Los Angeles", route: "la_tax_assessment_review", what: "The Business Tax Registration Certificate and its assessments (LAMC §21.16)" },
  { city: "New York City", route: "nyc_dcwp_denial", what: "A DCWP license (CPLR article 78 for court review)" },
  { city: "Dallas", route: "dal_building_appeals_board", what: "No general city business license; the certificate of occupancy is the city's gate" },
  // Not applicable: the certificate is "an official receipt for payment of the tax"; a dispute over the tax itself is
  // in Municipal Code chapter 4.76, which Placetta's servers can't open (the founder confirms it in a browser)
  { city: "San José", route: null, what: "Not applicable: the Business Tax Certificate is \"an official receipt for payment of the tax\", not a license the City denies; a dispute over the tax amount goes to Business Tax staff and chapter 4.76",
    source: SJ_BTC, check: "https://library.municode.com/ca/san_jose/codes/code_of_ordinances?nodeId=TIT4REFI_CH4.76BUTA" },
  { city: "Houston", route: null, what: "Not applicable: no general business license (\"The State of Texas does not require a general license\"; the City's four main requirements name none); a denied Houston permit follows its own letter",
    source: HOU_START },
];

/* ------------------------------ which one applies ------------------------------ */

const NYC = /new york|nyc|manhattan|brooklyn|queens|bronx|staten island|flushing|\bNY\s*1[01]\d{3}\b/i;
const cityOf = (addr: string) => NYC.test(addr) ? "nyc" : /san francisco|,\s*CA\s*941\d{2}/i.test(addr) ? "sf" : /los angeles|,\s*CA\s*900\d{2}/i.test(addr) ? "la"
  : /\bdallas\b|,\s*TX\s*752\d{2}/i.test(addr) ? "dallas" : null;
const stateOf = (addr: string) => /\b(CA|NY|TX)\b\s*\d{5}/.exec(addr)?.[1] ?? (/california/i.test(addr) ? "CA" : /new york/i.test(addr) ? "NY" : /texas/i.test(addr) ? "TX" : null);

/** The playbook for a decision on an application at an address, by what the application is and where. A closure or a
 *  summons is named by the decision's own words (`said`). */
export function appealFor(app: { name?: Bi; agency?: Bi }, address: string, said = ""): Appeal | null {
  const what = `${app.name?.en ?? ""} ${app.agency?.en ?? ""}`, c = cityOf(address), st = stateOf(address);
  if (/liquor|alcohol|beer|wine|\bABC\b|\bSLA\b|TABC/i.test(what)) {
    if (st === "CA") return /appeals board|after (the )?hearing|proposed decision|director'?s decision/i.test(said) ? appealById("ca_abc_appeals_board")! : appealById("ca_abc_denial_hearing")!;
    if (st === "TX") return /final and appealable|rehearing (was )?(overruled|denied)|overruled by operation of law/i.test(said) ? appealById("tx_tabc_court_appeal")!
      : /final order|commission (order|denied|voted)|order (was )?signed/i.test(said) ? appealById("tx_tabc_rehearing")! : appealById("tx_tabc_denial_hearing")!;
    if (st === "NY") return appealById("ny_sla_disapproval")!;
    return null;
  }
  if (/variance|conditional use|zoning|planning|land use/i.test(what) || /zoning administrator|variance/i.test(said)) {
    if (c === "sf") return /variance|rear yard|reasonable modification/i.test(`${what} ${said}`) ? appealById("sf_board_of_appeals_variance")!
      : /notice of violation/i.test(said) ? appealById("sf_board_of_appeals_za_violation")! : appealById("sf_board_of_appeals_zoning_admin")!;
    if (c === "la") return appealById("la_planning_appeal")!;
    if (c === "nyc") return appealById("nyc_bsa_appeal")!;
  }
  if (/building|alteration|tenant improvement|build-?out|construction|occupancy|\bC\.?O\.?\b|\bDOB\b|LADBS|\bDBI\b/i.test(what)) {
    if (c === "sf") return appealById("sf_board_of_appeals_building")!;
    if (c === "la") return appealById("la_bbsc_appeal")!;
    if (c === "nyc") return appealById("nyc_bsa_appeal")!;
    if (c === "dallas") return appealById("dal_building_appeals_board")!;
  }
  // a tobacco permit is the Health Department's in San Francisco, but the Board of Appeals hears it
  if (/health|food (facility|establishment|service)|retail food|restaurant|plan check/i.test(what) && !/tobacco/i.test(what)) {
    if (c === "nyc") return appealById("nyc_health_oath")!;
    if (st === "CA") return /plan (check|review)|plans? (were |was )?(rejected|denied)/i.test(`${what} ${said}`) ? appealById("ca_health_plan_review")!
      : /imminent|immediate(ly)? clos|closure|closed/i.test(said) ? appealById("ca_health_closure_hearing")! : appealById("ca_health_permit_hearing")!;
  }
  if (/business (license|tax|registration)|permit|license/i.test(what) && st) {
    if (c === "la" && /business tax|tax registration|BTRC|office of finance|assessment/i.test(`${what} ${said}`)) return /assessment review officer|ARO/i.test(said) ? appealById("la_tax_board_of_review")! : appealById("la_tax_assessment_review")!;
    if (c === "nyc" && /DCWP|consumer (and worker )?protection|consumer affairs/i.test(what)) return appealById("nyc_dcwp_denial")!;
    if (c === "sf" && /tobacco|entertainment|police|permit/i.test(what) && !/business registration|business tax/i.test(what)) return appealById("sf_board_of_appeals_permit")!;
    return appealById("business_license_denial")!;
  }
  return null;
}

/* ------------------------------ the deadline ------------------------------ */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const plus = (d: Date, n: number) => at(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n);
/** The nth weekday (0 Sunday) of a month, or the last when n is -1. */
function nthWeekday(y: number, m: number, wd: number, n: number) {
  if (n > 0) { const first = at(y, m, 1); return at(y, m, 1 + ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7); }
  const last = at(y, m + 1, 0); return at(y, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
}
const sundayToMonday = (d: Date) => (d.getUTCDay() === 0 ? plus(d, 1) : d);
const observed = (d: Date) => (d.getUTCDay() === 6 ? plus(d, -1) : d.getUTCDay() === 0 ? plus(d, 1) : d);
/** US federal holidays as observed (5 U.S.C. 6103). Kept for reference; deadlines use `holidaysOf`. */
export function federalHolidays(y: number): Set<string> {
  return new Set([observed(at(y, 0, 1)), nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), nthWeekday(y, 4, 1, -1), observed(at(y, 5, 19)), observed(at(y, 6, 4)),
    nthWeekday(y, 8, 1, 1), nthWeekday(y, 9, 1, 2), observed(at(y, 10, 11)), nthWeekday(y, 10, 4, 4), observed(at(y, 11, 25))].map(iso));
}
/** The holidays a deadline may skip or roll over, by list. Only days the jurisdiction's own law names are in a list, and
 *  no Friday-before shift is assumed: a missing holiday makes a date earlier, never later. */
export function holidaysOf(list: Holidays, y: number): Set<string> {
  const core = [at(y, 0, 1), nthWeekday(y, 4, 1, -1), at(y, 6, 4), nthWeekday(y, 8, 1, 1), nthWeekday(y, 10, 4, 4), at(y, 11, 25)];
  if (list === "core") return new Set(core.map(iso));
  // Tex. Gov't Code §662.003(a): the national holidays, on their dates (no observed-day rule in the section)
  if (list === "TX") return new Set([...core, nthWeekday(y, 0, 1, 3), nthWeekday(y, 1, 1, 3), at(y, 10, 11)].map(iso));
  // N.Y. General Construction Law §24, "and if any of such days except Flag day is Sunday, the next day thereafter",
  // plus each general election day (the Tuesday after the first Monday in November)
  const ny = [at(y, 0, 1), nthWeekday(y, 0, 1, 3), at(y, 1, 12), nthWeekday(y, 1, 1, 3), nthWeekday(y, 4, 1, -1), at(y, 5, 19), at(y, 6, 4), nthWeekday(y, 8, 1, 1),
    nthWeekday(y, 9, 1, 2), at(y, 10, 11), nthWeekday(y, 10, 4, 4), at(y, 11, 25)].map(sundayToMonday);
  return new Set([...ny, plus(nthWeekday(y, 10, 1, 1), 1)].map(iso));
}
const weekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
const closed = (d: Date, list: Holidays) => weekend(d) || holidaysOf(list, d.getUTCFullYear()).has(iso(d));

/** The decision's date where the deciding body sits: a decision stamped 11 p.m. in Los Angeles is that day there. */
export function localDay(stamp: string, tz: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) return stamp;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(stamp));
  return p.slice(0, 10);
}
/** n calendar months after a day, ending on the same day of the month, or the month's last day when it has fewer
 *  (N.Y. General Construction Law §30; Tex. Gov't Code §311.014(c)). */
function addMonths(d: Date, n: number) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + n, last = at(y, m + 1, 0).getUTCDate();
  return at(y, m, Math.min(d.getUTCDate(), last));
}

export type Deadline = {
  /** Placetta's target: never later than the real last day (not moved past a weekend or holiday). */
  date: string;
  /** The last day the rule allows, after any weekend or holiday roll the source provides. Same as date without one. */
  legal: string;
  days: number; unit: "calendar" | "business" | "months"; counted: string; verified: boolean; tz: string; rule: string; section: string;
  trigger: string;
  /** days was the shortest period for this kind of decision: the letter's date governs if it's later. */
  atLeast: boolean;
  cutoff?: string;
  /** Mailing days added (only where the rule provides them). */
  mailed?: number;
};
export type Served = "mail" | "hand" | "email" | "unknown";
/** The last day to act, counted by the rule from its trigger; null when the rule's days aren't confirmed. */
export function deadlineFor(rule: Rule, decided: string, tz: string, opts: { served?: Served } = {}): Deadline | null {
  if (rule.days == null) return null;
  const start = localDay(decided, tz);
  const s = at(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10));
  const list: Holidays = rule.holidays ?? "core";
  let d = s;
  // "day_after" and "decision" both make day 1 the day after the trigger, so both give trigger + N for calendar days.
  if (rule.unit === "calendar") d = plus(s, rule.days);
  else if (rule.unit === "months") d = addMonths(s, rule.days);
  else { let n = 0; while (n < rule.days) { d = plus(d, 1); if (!closed(d, list)) n++; } }
  const mailed = opts.served === "mail" && rule.mail ? rule.mail.days : 0;
  if (mailed) d = plus(d, mailed);
  let legal = d;
  if (rule.roll) while (closed(legal, list)) legal = plus(legal, 1);
  const zone = tz.replace("America/", "").replace("_", " ");
  const counted = [
    `${rule.days} ${rule.unit === "months" ? "months" : `${rule.unit} days`} from ${start} (${(rule.trigger?.en ?? "the decision").toLowerCase()})${rule.from === "day_after" ? ", the period beginning the day after" : ""}, in ${zone} time`,
    rule.unit === "business" ? `weekends and ${list === "core" ? "the six holidays every covered government closes for" : list === "TX" ? "Texas's national holidays" : "New York's public holidays"} skipped` : "",
    mailed ? `plus ${mailed} days because it was served by mail (${rule.mail!.section})` : "",
    rule.roll && iso(legal) !== iso(d) ? `${iso(d)} falls on a weekend or holiday, so the rule moves the last day to ${iso(legal)}; Placetta's target stays ${iso(d)}` : rule.roll ? "" : "not moved past a weekend or holiday",
    rule.cutoff ? `by ${rule.cutoff} local time` : "",
    rule.atLeast ? "the shortest period for this kind of decision: the letter's date governs if later" : "",
  ].filter(Boolean).join("; ");
  return { date: iso(d), legal: iso(legal), days: rule.days, unit: rule.unit, counted, verified: !!rule.verified, tz, rule: rule.says, section: rule.section ?? "", trigger: rule.trigger?.en ?? "",
    atLeast: !!rule.atLeast, ...(rule.cutoff ? { cutoff: rule.cutoff } : {}), ...(mailed ? { mailed } : {}) };
}

/** Whole days from today to a date (negative once it has passed). */
export const daysLeft = (date: string, today: string) => Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 864e5);

/* ------------------------------ fix and resubmit, or appeal ------------------------------ */

/** Reasons a corrected filing answers (a missing document, a wrong form or fee, an incomplete answer). */
const CURABLE = /missing|incomplete|(do|does|did)(n.?t| not) (show|include)|not (included|attached|signed|legible)|wrong (form|fee|address|name)|unsigned|illegible|expired (document|certificate|insurance)|fee|correction|resubmit|additional (information|documents?)|did not include|lacks?|deficienc/i;
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

/* ------------------------------ saying it ------------------------------ */

/** A label's first letter lowered to sit mid-sentence, unless it starts an acronym or a name. */
const low = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^(DCWP|OATH|NYC|SF|LA|Office|Board|Supreme)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const firstUp = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The route's name already names who decides it ("Appeal to the NYC Board of Standards and Appeals" and "Board of
 *  Standards and Appeals (BSA)"), in each language: then the body isn't said a second time. */
export function namesBody(ap: Pick<Appeal, "name" | "body">): { en: boolean; zh: boolean } {
  const core = (t: string) => t.split(/[,，]/)[0].replace(/\s*[(（][^)）]*[)）]/g, "").replace(/^the\s+/i, "").replace(/^(NYC|纽约市)\s*/, "").trim();
  const name = ap.name.en.toLowerCase(), en = core(ap.body.en).toLowerCase(), words = en.split(/\s+/);
  // the body's own name, its last words ("Appeals Board", "Board of Review") or its acronym ("OATH") already in the name
  const tail2 = words.length > 2 ? words.slice(-2).join(" ") : "", tail3 = words.length > 3 ? words.slice(-3).join(" ") : "";
  const acronym = /\(([A-Z]{3,})\)/.exec(ap.body.en)?.[1];
  const enNamed = (en.length > 3 && name.includes(en)) || (!!tail3 && name.includes(tail3)) || (!!tail2 && /board|commission|council/.test(tail2) && name.includes(tail2)) || (!!acronym && ap.name.en.includes(acronym));
  const zh = core(ap.body.zh).replace(/^(旧金山|洛杉矶|纽约州|达拉斯|加州|德州)/, ""), zhAcr = /（([A-Z]{3,})）/.exec(ap.body.zh)?.[1];
  // a body that goes on to a second step ("…, then the Supreme Court") says something the name doesn't: keep it
  if (/\bthen\b|之后/.test(ap.body.en + ap.body.zh)) return { en: false, zh: false };
  return { en: enNamed, zh: (zh.length > 1 && ap.name.zh.includes(zh)) || (!!zhAcr && ap.name.zh.includes(zhAcr)) };
}
const unitSay = (r: Rule) => ({ en: r.unit === "business" ? "business days" : r.unit === "months" ? "months" : "days", zh: r.unit === "business" ? "个工作日" : r.unit === "months" ? "个月" : "天" });

/** The route in plain sentences: what it is, who decides it, the deadline (or that there is none) and the next step. A
 *  route's name is a label ("Health plan check rejected (California Retail Food Code)") and its body a noun phrase
 *  ("The county environmental health agency"); pasted into one sentence they read "…, heard by The county …", so each
 *  is placed where it reads as written. The agent's reply and the permit drawer's appeal panel both say it this way. */
export function appealSay(ap: Appeal, dl: Deadline | null = null): { route: Bi; deadline: Bi; next: Bi } {
  const r = ap.deadline, u = unitSay(r);
  // who decides it, said once: "Appeal to the NYC Board of Standards and Appeals" already names the Board
  const named = namesBody(ap);
  // "Who decides:" takes any body as written ("An administrative law judge, then the ABC Director"), where "X decides
  // it" broke on the long ones
  const who = B(ap.body.en.replace(/^(The|An|A)\b/, m => m.toLowerCase()), ap.body.zh.replace(/：/g, "，"));
  const route = B(named.en ? `The route: ${ap.name.en}.` : `The route: ${ap.name.en}. Who decides: ${who.en}.`,
    named.zh ? `申诉途径：${ap.name.zh}。` : `申诉途径：${ap.name.zh}。受理机构：${who.zh}。`);
  // with a counted deadline the date is said where it's shown (the panel's deadline line); here only the rule
  const deadline = dl
    ? B(`The rule: ${dl.days} ${u.en} from ${low(r.trigger.en)} (${r.section}).${dl.verified ? "" : " Not confirmed on an official source: check the decision letter."}`,
      `规定：${r.trigger.zh}起 ${dl.days} ${u.zh}（${r.section}）。${dl.verified ? "" : "未经官方来源确认，请以决定函为准。"}`)
    : r.days != null
      ? B(`The deadline is ${r.days} ${u.en} from ${low(r.trigger.en)} (${r.section}).${r.verified ? "" : " Not confirmed on an official source: check the decision letter."}`,
        `期限：${r.trigger.zh}起 ${r.days} ${u.zh}（${r.section}）。${r.verified ? "" : "未经官方来源确认，请以决定函为准。"}`)
      : /^no appeal period/i.test(r.trigger.en)
        ? B(`${firstUp(r.trigger.en)} (${r.section}).`, `${r.trigger.zh}（${r.section}）。`)
        : B(`The deadline is set by ${low(r.trigger.en)} (${r.section}).`, `期限以${r.trigger.zh}为准（${r.section}）。`);
  const bare = (s: string) => s.trim().replace(/[.。]$/, "");
  const next = B(`Next: ${low(bare(ap.form.en))}. Where to file: ${low(bare(ap.file.en))}.`, `下一步：${bare(ap.form.zh)}。提交至：${bare(ap.file.zh)}。`);
  return { route, deadline, next };
}

/** What every appeal output carries, word for word. */
export const NOT_A_LAW_FIRM = B("Placetta isn't a law firm and this isn't legal advice. Placetta prepares the deadline, the evidence and the papers for you to review; it files only what you approve, never where an attorney is advised, and it doesn't predict how an appeal will go.",
  "快哉不是律师事务所，以上不构成法律意见。快哉为您准备截止日期、证据和文件供您审阅；只提交您批准的内容，建议聘请律师的事项不代为提交，也不预测上诉结果。");

/* ------------------------------ who should handle it ------------------------------ */

/** Who handles each playbook. self_serve: the owner files it, because the agency itself says no lawyer is needed or it's
 *  a simple administrative review. self_serve_review: the owner can file it, and a review (an attorney, or the
 *  engineer or tax adviser who knows the facts) is worth paying for. attorney: a contested hearing, a court, or a step
 *  that fixes what a court may later review; Placetta does what a non-lawyer may (the hearing request on time, the
 *  protest response, the conditions offer, the evidence) and hands the packet to counsel. `says` is the source's own
 *  words, `source` the page they're on. */
export type Route = "self_serve" | "self_serve_review" | "attorney";
export type Tier = { route: Route; why: Bi; says: string; source: string };
export const ROUTE_NAME: Record<Route, Bi> = {
  self_serve: B("You can file this yourself", "您可以自行提交"),
  self_serve_review: B("You can file this yourself; a review is worth it", "您可以自行提交；建议请人审阅"),
  attorney: B("An attorney is advised", "建议聘请律师"),
};
const t = (route: Route, en: string, zh: string, says: string, source: string): Tier => ({ route, why: B(en, zh), says, source });
export const TIERS: Record<AppealId, Tier> = {
  ca_abc_denial_hearing: t("attorney", "A contested hearing before an administrative law judge, with protestants as parties and ABC represented by its own counsel. You file the hearing request and answer the protests yourself; counsel represents you at the hearing.",
    "在行政法法官前的争议听证，抗议人为当事方，ABC 由其律师代表。听证申请和抗议答复可自行完成；听证时由律师代理。",
    "\"The applicant and any protestant(s) may be represented by an attorney or other person\"; \"ABC counsel represents ABC\"", CA_ABC_HEARING),
  ca_abc_appeals_board: t("attorney", "A record appeal with briefs; the Board itself recommends counsel.", "基于听证记录、需提交书状的上诉；委员会本身建议聘请律师。",
    "\"highly recommended that you seek legal counsel\"", CA_ABC_BOARD),
  tx_tabc_denial_hearing: t("attorney", "A contested case at SOAH under Government Code chapter 2001, with protestants as parties. You file the hearing request on time yourself; counsel represents you.",
    "根据政府法第 2001 章在 SOAH 进行的争议案件，抗议人为当事方。听证申请可自行按时提交；由律师代理出庭。",
    "16 TAC §33.60(b): \"An applicant may request an administrative hearing ... by filing a written request for hearing with the commission within thirty (30) days\"", TABC_RULES),
  tx_tabc_rehearing: t("attorney", "It fixes what a court may review: \"A timely motion for rehearing is a prerequisite to an appeal.\"", "它决定法院可审查的范围：“及时的复议动议是上诉的前提。”",
    "Gov't Code §2001.145(a): \"A timely motion for rehearing is a prerequisite to an appeal\"", TX_GV2001),
  tx_tabc_court_appeal: t("attorney", "A district court case.", "地区法院诉讼。", "Alcoholic Beverage Code §11.67(b)(1): \"the appeal shall be perfected and filed within 30 days\"", TX_AL11),
  ny_sla_disapproval: t("attorney", "A discretionary liquor decision; court review is an article 78 petition.", "酒牌裁量决定；法院审查须提交第 78 条程序申请。",
    "Alcoholic Beverage Control Law §121(1): review \"in the manner provided in article seventy-eight\"", NY_ABC121),
  sf_board_of_appeals_building: t("self_serve", "The Board says parties needn't have attorneys, and the appeal is a one-page statement and a brief.", "委员会表示当事人无需律师，上诉只需一页陈述和一份书状。",
    "\"Parties are not required to be represented by attorneys\"", SF_FAQ),
  sf_board_of_appeals_variance: t("attorney", "A variance hearing where neighbors are often parties and 4 of 5 votes are needed. The Board lets you appear without counsel, so you can file the appeal on time yourself.",
    "邻居常为当事方且需五票中四票通过的变更听证。委员会允许无律师出席，因此上诉可自行按时提交。", "\"Parties are not required to be represented by attorneys\"", SF_FAQ),
  sf_board_of_appeals_zoning_admin: t("self_serve_review", "The Board says parties needn't have attorneys; the Planning Code reading decides it, so a review helps.", "委员会表示当事人无需律师；结果取决于规划法规的解读，建议请人审阅。",
    "\"Parties are not required to be represented by attorneys\"", SF_FAQ),
  sf_board_of_appeals_za_violation: t("self_serve_review", "The Board says parties needn't have attorneys; an enforcement case is worth a review.", "委员会表示当事人无需律师；执法案件建议请人审阅。",
    "\"Parties are not required to be represented by attorneys\"", SF_FAQ),
  sf_board_of_appeals_permit: t("self_serve", "The Board says parties needn't have attorneys.", "委员会表示当事人无需律师。", "\"Parties are not required to be represented by attorneys\"", SF_FAQ),
  la_planning_appeal: t("attorney", "A zoning hearing before the appellate body, often with neighbors on the other side, and then only a court writ (Code of Civil Procedure §1094.6). You file the appeal on time yourself; counsel argues it.",
    "在上诉机构前的分区听证，对方常为邻居，此后只能向法院申请令状（民事诉讼法 §1094.6）。上诉可自行按时提交；由律师出庭辩论。",
    "\"An appeal must be filed within a specified period of time as established by the LAMC\"", LA_APPEALS),
  la_bbsc_appeal: t("self_serve_review", "A written appeal on the Department's forms, notarized; the engineer or architect who knows the code usually leads it.", "按建筑局表格提交并公证的书面上诉；通常由熟悉规范的工程师或建筑师主导。",
    "Appeals \"shall be made in writing, upon appropriate forms provided therefore by the Department\"", LADBS_BBSC),
  la_tax_assessment_review: t("self_serve", "The taxpayer asks in writing for an administrative hearing.", "由纳税人书面申请行政听证。",
    "\"the taxpayer may appeal the assessment by requesting, in writing, a hearing before the Assessment Review Officer\"", LA_ARO),
  la_tax_board_of_review: t("self_serve", "The taxpayer asks for the second administrative hearing.", "由纳税人申请第二级行政听证。",
    "\"the taxpayer may appeal the decision of the Assessment Review Officer by requesting a hearing before the Board of Review\"", LA_BOR),
  nyc_bsa_appeal: t("self_serve_review", "The rule sets filing and service steps an owner can follow; the reading of the Zoning Resolution or the Building Code decides it, so a review helps.", "规则规定了业主可自行完成的提交和送达步骤；结果取决于分区决议或建筑规范的解读，建议请人审阅。",
    "2 RCNY §1-06.3(a)(1): an appeal \"must be filed within thirty (30) days from the date of the determination\"", NYC_BSA_RULE),
  nyc_dcwp_denial: t("self_serve", "DCWP gives the reason; most denials are fixed and refiled. A court petition would need counsel.", "DCWP 会告知原因；多数可修正后重新申请。如向法院申请则需律师。",
    "\"If your application is denied: DCWP will provide you with the reason\"", NYC_DCWP_AFTER),
  ca_health_permit_hearing: t("self_serve", "The Code gives the request to the permit holder, and the hearing turns on the corrections.", "法规规定由许可持有人申请，听证取决于整改情况。",
    "Health & Safety Code §114405(b): \"A written request for a hearing shall be made by the PERMIT HOLDER within 15 calendar days\"", CALCODE),
  ca_health_closure_hearing: t("self_serve", "The Code gives the request to the permit holder; fixing the hazard reinstates the permit.", "法规规定由许可持有人申请；消除危害即可恢复许可。",
    "Health & Safety Code §114409(c): \"the PERMIT HOLDER may request in writing a hearing before a HEARING OFFICER\"", CALCODE),
  ca_health_plan_review: t("self_serve", "A corrections exchange: the applicant resubmits the corrected plan.", "属整改往来：申请人重新提交修正图纸。",
    "Health & Safety Code §114380(f)(2): the applicant \"may resubmit a corrected plan addressing the deficiencies identified in the initial denial\"", CALCODE),
  nyc_health_oath: t("self_serve", "OATH says its hearings need no lawyer, and most are by phone or online.", "OATH 表示其听证无需律师，多数通过电话或在线进行。",
    "\"OATH hearings do not require a lawyer or representative.\" \"Anyone may represent his or her self at all OATH hearings.\"", OATH_REP),
  dal_building_appeals_board: t("self_serve", "The City says the appellant's agent needn't be a lawyer.", "市政府表示上诉人的代理人不必是律师。",
    "\"This agent does not have to be a lawyer or other professional\"", DAL_BOARD),
  business_license_denial: t("self_serve", "Most denials are fixed and refiled; San José and Houston have no general business license to deny.", "多数拒绝可修正后重新提交；圣何塞和休斯敦没有可被拒绝的一般营业执照。",
    "San José: \"an official receipt for payment of the tax\"; Texas: \"The State of Texas does not require a general license.\"", SJ_BTC),
};
export const tierOf = (id: AppealId): Tier => TIERS[id];

/* ------------------------------ how it's filed ------------------------------ */

/** How the owner's approved appeal reaches the deciding body, from the playbook's own filing line. dest: the verified
 *  destination the filer sends on (supabase/functions/file/destinations.ts, appeal-*); without one the Placetta team
 *  sends it by the channel the letter or page names, after the same approval. owner: only the business can do it
 *  (in person, or the hearing itself); Placetta prepares the packet. */
export type Channel = { method: "email" | "portal" | "in_person" | "online_hearing" | "refile" | "as_letter_says" | "counsel"; dest?: string; how: Bi };
export const CHANNELS: Record<AppealId, Channel> = Object.fromEntries(APPEALS.map((a): [AppealId, Channel] => {
  const how = a.file;
  if (a.id.startsWith("sf_board_of_appeals_")) return [a.id, { method: "email", dest: "appeal-sf-boa", how }];
  if (a.id === "tx_tabc_denial_hearing") return [a.id, { method: "email", dest: "appeal-tx-tabc-hearing", how }];
  if (a.id === "dal_building_appeals_board" || a.id === "la_bbsc_appeal") return [a.id, { method: "in_person", how }];
  if (a.id === "nyc_health_oath") return [a.id, { method: "online_hearing", how: B("Online at nyc.gov/oath/hearingonline on or before the hearing date, by phone through OATH's Remote Hearings Unit (212-436-0777), or in person when the summons says \"Must Appear\"", "在听证日或之前通过 nyc.gov/oath/hearingonline 在线听证，或通过 OATH 远程听证组（212-436-0777）电话听证；传票写明“Must Appear”时须亲自出席") }];
  if (a.id === "nyc_dcwp_denial") return [a.id, { method: "refile", how }];
  if (a.id === "la_planning_appeal") return [a.id, { method: "portal", how }];
  if (["ca_abc_appeals_board", "tx_tabc_rehearing", "tx_tabc_court_appeal", "ny_sla_disapproval"].includes(a.id)) return [a.id, { method: "counsel", how }];
  return [a.id, { method: "as_letter_says", how }];
})) as Record<AppealId, Channel>;
/** The OATH online hearing, as OATH's own guide prints it. */
export const OATH_SOURCE = OATH_WHAT;

/** Every source a playbook's claims rest on, numbered once, the rule's own first. */
export function sourcesOf(ap: Appeal): { n: number; url: string }[] {
  const urls = [ap.deadline.verified?.source, ...ap.sources, ...Object.values(ap.cites ?? {})].filter((u): u is string => !!u);
  return [...new Set(urls)].map((url, i) => ({ n: i + 1, url }));
}

/** The draft's outline, each claim cited to its own source by number: the Harvey and Legora way, a person checks every
 *  citation before anything goes out. A claim with no official source says UNVERIFIED and where to confirm it. */
export function letterOutline(ap: Appeal, o: { business: string; name: string; agency: string; decided: string; reason: string; confirmation?: string; deadline?: Deadline | null }): { outline: string[]; sources: { n: number; url: string }[] } {
  const src = sourcesOf(ap);
  const n = (url?: string) => { const s = src.find((x) => x.url === (url ?? ap.sources[0])); return s ? ` [${s.n}]` : ""; };
  const ruleCite = ap.deadline.verified ? n(ap.deadline.verified.source) : ` [UNVERIFIED: confirm at ${(ap.deadline.check ?? [])[0] ?? "the decision letter"}]`;
  return {
    outline: [
      `DRAFT for review. ${NOT_A_LAW_FIRM.en}`,
      `To: ${ap.body.en}. From: ${o.business}. Re: ${o.name}${o.confirmation ? `, ${o.confirmation}` : ""}; decision of ${o.agency} dated ${o.decided}.`,
      `1. What is appealed: the decision of ${o.decided}, as stated in the decision letter (attached as Exhibit A).`,
      `2. Timeliness: ${ap.deadline.section}: ${ap.deadline.says}${ruleCite}${o.deadline ? ` Filed on or before ${o.deadline.date}.` : ""}`,
      `3. The decision's reason, in the agency's words: "${o.reason.slice(0, 300)}" (Exhibit A).`,
      `4. Grounds, each tied to an exhibit: ${ap.grounds.map((g) => g.en).join("; ")}.${n(ap.cites?.grounds)} Only the grounds the facts support stay in.`,
      `5. Evidence: ${ap.evidence.map((e, i) => `Exhibit ${String.fromCharCode(66 + i)}: ${e.en}`).join("; ")}.`,
      `6. What is asked: ${ap.outcomes[0]?.en ?? "reconsideration"}.`,
      `Form: ${ap.form.en}.${n(ap.cites?.form)}`,
      `Filing: ${ap.file.en}.${n(ap.cites?.file)}`,
      `Fee: ${ap.fee.says.en}.${ap.fee.verified ? n(ap.cites?.fee) : " [UNVERIFIED]"}`,
    ],
    sources: src,
  };
}

/** The packet for the owner's attorney: one message with everything needed to take the matter on (Clio's intake). */
export function counselPacket(ap: Appeal, o: { business: string; name: string; agency: string; decided: string; reason: string; deadline: Deadline | null; evidence: { item: string; on_file: boolean }[] }): { subject: string; body: string[]; questions: string[] } {
  const src = sourcesOf(ap);
  return {
    subject: `${ap.name.en}: ${o.business}, decided ${o.decided}${o.deadline ? `, last day ${o.deadline.legal}` : ""}`,
    body: [
      `${o.agency} decided against ${o.business} on ${o.decided} (${o.name}). Its reason: "${o.reason.slice(0, 300)}".`,
      o.deadline ? `Deadline: ${o.deadline.legal} by the rule (${o.deadline.section}); Placetta's target ${o.deadline.date}. Counted: ${o.deadline.counted}.` : `Deadline: not confirmed on an official source (${ap.deadline.section}); take it from the decision letter. ${(ap.deadline.check ?? []).join(" ")}`,
      ap.before ? `First: ${appealById(ap.before)?.name.en}; without it this step may be lost.` : "",
      `Body: ${ap.body.en}. Filing: ${ap.file.en}. Fee: ${ap.fee.says.en}.`,
      `Evidence on file: ${o.evidence.filter((e) => e.on_file).map((e) => e.item).join("; ") || "none yet"}. Missing: ${o.evidence.filter((e) => !e.on_file).map((e) => e.item).join("; ") || "nothing"}.`,
      `Sources: ${src.map((s) => `[${s.n}] ${s.url}`).join(" ")}`,
      "Prepared by Placetta, which isn't a law firm; please check every rule against its source.",
    ].filter(Boolean),
    questions: ["Do you agree with the deadline and how it was counted?", "Which grounds would you keep?", "Is anything missing from the evidence?", "Will you file it, and by when?"],
  };
}
