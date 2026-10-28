import { B, type Bi } from "../bi";

/* ------------------------------------------------------------------ *
 * Agent authority: where Placetta may act for the business as its
 * named agent, the way licensed expediters, registered agents and tax
 * preparers lawfully act for clients, and where the owner must act
 * personally. One row per official form, each answered from the
 * agency's own page or the statute, cited and dated. Read 2026-10-27
 * unless a row says otherwise.
 *
 * The rule a row encodes, and never stretches:
 *
 *   agentOk   The agency (or the law) affirmatively lets an authorized
 *             agent submit this filing for the business. Silence is not
 *             permission: a page that says nothing about agents leaves
 *             agentOk false, with what to ask the agency in `confirm`.
 *   sends     Who puts it in the agency's hands: Placetta as the named
 *             agent, the business's licensed contractor (where only a
 *             contractor or the property owner may apply), or Placetta
 *             mailing or faxing a packet the owner signed.
 *   owner     What the owner must still do personally, with the reason
 *             ("law": a statute or the agency's own form makes it the
 *             signer's own act; "agency": the agency's process, not a
 *             law; "placetta": Placetta's own rule, e.g. it never types
 *             an SSN), when it can happen ("signup": every fact on it is
 *             known when the business signs up, so it goes in the one
 *             signing session; "later": a fact on it only exists later,
 *             like final plans or the first payroll date), and how
 *             (an e-signature, only where the agency says it takes one;
 *             else by hand).
 *
 * Placetta never signs as the owner, never types the owner's name where
 * the owner's signature goes, and never makes a declaration the law
 * makes the owner's. Where an agent signs a declaration as agent, a named
 * Placetta person signs it (SETUP.md "Agent of record"), never Odelia: a
 * declaration under penalty of perjury is a person's act. California
 * Civil Code 2304: "An agent may be authorized to do any acts which his
 * principal might do, except those to which the latter is bound to give
 * his personal attention." Government Code 16.5(b): accepting an
 * electronic signature is "at the option of the parties", so an
 * e-signature is used only where the agency itself says it takes one.
 * ------------------------------------------------------------------ */

export const CIV_2304 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=2304";
export const GOV_16_5 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=GOV&sectionNum=16.5";
export const HSC_19825 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=19825";
const IRS_SS4_I = "https://www.irs.gov/instructions/iss4";
const IRS_EIN = "https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number";
const IRS_ESIGN = "https://www.irs.gov/newsroom/details-on-using-e-signatures-for-certain-forms";
export const IRS_8821_I = "https://www.irs.gov/instructions/i8821";
export const IRS_2848_I = "https://www.irs.gov/instructions/i2848";
export const IRS_SUBMIT_ONLINE = "https://www.irs.gov/tax-professionals/submit-forms-2848-and-8821-online";
export const EDD_REP = "https://edd.ca.gov/en/payroll_taxes/Enroll_Employer_Representative_Payroll_Agent_e-Services_Business";
const EDD_DE1_I = "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de1i.pdf";
export const EDD_DE48 = "https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de48.pdf";
const SJ_BP_INSTR = "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/bulding-permit-application-instructions";
const SJ_WHO = "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/who-can-apply-for-a-permit";
const SJ_TI = "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement";
const SJ_BTC = "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/register-for-a-business-tax-certificate";
const SCC_PLAN = "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and";
const SCC_NEW = "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/food-safety-program/application-new-food-facility";
const CDTFA = "https://cdtfa.ca.gov/formspubs/pub107/applying-for-a-sellers-permit.htm";

export type Why = "law" | "agency" | "placetta";
/** One thing the owner does personally for a form. */
export type OwnerAct = {
  what: Bi;
  why: Why;
  /** signup: every fact on it is known when the business signs up; later: a fact on it only exists later. */
  when: "signup" | "later";
  /** How it's signed: an e-signature (only where the agency says it takes one) or by hand. */
  sig: "esign" | "hand";
  /** Why it can't wait for signup, when it can't. */
  later?: Bi;
  /** It is the same signature as the row's authorization document (one paper, signed once). */
  auth?: true;
  cite: string[];
};
/** An authorization document the owner signs once so Placetta (or its named person) may act as agent. */
export type AuthDoc = {
  id: string;
  name: Bi;
  /** The agency's own form, or Placetta's ("placetta": the Filing Authorization's agent section). */
  issuer: "placetta" | "agency";
  /** Where the official PDF or page is. */
  url: string;
  sig: "esign" | "hand";
  /** How long the agency honors it; null: until revoked. */
  months: number | null;
  /** What it lets the agent do, in a line. */
  lets: Bi;
  cite: string[];
};
/** The account a filing goes through. placetta: Placetta's own preparer or agent account (the founder makes it once;
 *  Odelia never makes one). contractor: the business's licensed contractor's own account. none: no account (mail,
 *  fax, email). owner: the owner's own login. */
export type Account = { who: "placetta" | "contractor" | "none" | "owner"; site?: string; what: Bi };

export type AgentRow = {
  agentOk: boolean;
  /** Who puts it in the agency's hands. */
  sends: "placetta" | "contractor" | "owner";
  /** Who signs as applicant when an agent applies: a named Placetta person (never Odelia) or the contractor. */
  signsAsAgent?: "person" | "contractor";
  auth?: AuthDoc;
  account: Account;
  owner: OwnerAct[];
  /** What to confirm with the agency before relying on an agent route the page doesn't state. */
  confirm?: Bi;
  cite: string[];
  checked: string;
  note: Bi;
};

/** Placetta's own authorization, signed with Autopilot: Placetta (and the named people in SETUP.md) may act as the
 *  business's agent before the agencies in the Autopilot scope, for the filings in it, for 12 months, revocable. */
export const PLACETTA_AGENT: AuthDoc = {
  id: "placetta-agent", name: B("Placetta as your agent (Filing Authorization)", "快哉作为您的代理人（申报授权书）"), issuer: "placetta", url: "/authorization#placetta-as-your-agent",
  sig: "esign", months: 12,
  lets: B("Placetta submits, as your named agent, the filings in your Autopilot scope that their agency lets an agent submit, and answers the agency's questions about them.", "快哉以您指定代理人的身份，提交自动驾驶范围内、机构允许代理人提交的申报，并回答机构就这些申报提出的问题。"),
  cite: [CIV_2304, "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1633.7"],
};

export const AGENT: Record<string, AgentRow> = {
  "irs-ss4": {
    agentOk: true, sends: "placetta", account: { who: "none", what: B("Faxed to the IRS; the EIN comes back to Placetta's designee", "传真给 IRS；EIN 发回快哉的指定人") },
    auth: {
      id: "irs-ss4-designee", name: B("Form SS-4, signed by you, naming Placetta's designee on line 18", "由您签署的 SS-4，第 18 行指定快哉的指定人"), issuer: "agency", url: IRS_SS4_I, sig: "hand", months: null,
      lets: B("Placetta's named person answers the IRS's questions about the SS-4 and receives the EIN. It ends when the EIN is released.", "快哉指定的人员回答 IRS 关于 SS-4 的问题并接收 EIN；EIN 发放后即终止。"),
      cite: [IRS_SS4_I],
    },
    owner: [{
      what: B("Sign the SS-4 by hand, and write your SSN on line 7b yourself", "亲笔签署 SS-4，并自己在第 7b 行写上您的 SSN"), why: "law", when: "signup", sig: "hand", auth: true,
      cite: [IRS_SS4_I, IRS_ESIGN],
    }],
    cite: [IRS_SS4_I, IRS_EIN, IRS_ESIGN], checked: "2026-10-27",
    note: B("The SS-4 must be signed by the individual, or the president, vice president or other principal officer (SS-4 instructions, Signature), and the designee section is valid only with that signature. The IRS's list of forms it takes with an e-signature doesn't include the SS-4, so it's signed in ink. Online, a designee needs signed authorization and the responsible party's SSN, which Placetta never types, so Placetta faxes the signed form and receives the EIN as designee.",
      "SS-4 必须由个人本人，或总裁、副总裁及其他主要负责人签署（SS-4 说明“签名”部分），第三方指定人一栏只有在该签名下才有效。IRS 接受电子签名的表格清单不包括 SS-4，因此需亲笔签名。网上申请时指定人需要签署的授权和负责人的 SSN，而快哉从不输入 SSN，因此由快哉传真签好的表格并以指定人身份接收 EIN。"),
  },
  "ca-cdtfa": {
    agentOk: false, sends: "placetta", account: { who: "none", site: "onlineservices.cdtfa.ca.gov", what: B("CDTFA's online registration needs no login", "CDTFA 网上登记无需登录") },
    owner: [], cite: [CDTFA], checked: "2026-10-13",
    note: B("Nothing to sign and no fee: Autopilot already files it alone.", "无需签名，也无费用：自动驾驶已可自行提交。"),
  },
  "ca-edd-de1": {
    agentOk: true, sends: "placetta", signsAsAgent: undefined,
    account: { who: "none", what: B("Placetta mails the signed DE 1 to EDD (Placetta's EDD e-Services representative account handles the account afterwards)", "快哉把签好的 DE 1 邮寄给 EDD（之后由快哉的 EDD e-Services 代表账户管理）") },
    owner: [{
      what: B("Sign the DE 1 declaration by hand, with your SSN written in", "亲笔签署 DE 1 声明，并写上您的 SSN"), why: "law", when: "later", sig: "hand",
      later: B("It states the date you first paid wages over $100, and EDD wants it within 15 days after you hire, so it can't be signed before payroll starts.", "表上要写首次支付超过 100 美元工资的日期，且 EDD 要求在雇人后 15 天内登记，因此发薪前无法签署。"),
      cite: [EDD_DE1_I],
    }],
    cite: [EDD_REP, EDD_DE1_I, EDD_DE48], checked: "2026-10-27",
    note: B("A representative enrolled in e-Services for Business may register a new employer account (EDD). But the DE 1's declaration \"must be signed by an individual having the authority to sign on behalf of the business\" under penalty of perjury, and it asks each owner's SSN, which Placetta never types. An agent could sign only under a DE 48 power of attorney, which itself needs the owner's signature within 30 days of filing and the business's EIN: still one signature by the owner after the EIN and the first payroll. So the owner signs the DE 1 once, by hand, and Placetta sends it and holds the account as representative.",
      "在 e-Services for Business 登记的代表可以为雇主注册新账户（EDD）。但 DE 1 的声明“必须由有权代表企业签署的个人”以伪证罪为前提签署，并要求填写每位业主的 SSN，而快哉从不输入 SSN。代理人只能凭 DE 48 授权书签署，而 DE 48 本身需要业主在提交前 30 天内签名并填写 EIN：发薪开始、拿到 EIN 之后仍需业主签一次。因此由业主亲笔签署一次 DE 1，快哉以代表身份寄出并管理账户。"),
  },
  "scc-plan-check": {
    agentOk: true, sends: "placetta", account: { who: "none", what: B("Emailed to the county's plan check address", "通过电子邮件发送至县图纸审查邮箱") },
    owner: [{
      what: B("Sign the plan check application by hand when the plans are final", "图纸定稿后亲笔签署图纸审查申请"), why: "agency", when: "later", sig: "hand",
      later: B("It describes the final plans (scope, hoods), which don't exist at signup.", "申请上要写定稿图纸的内容（施工范围、排烟罩），注册时还没有。"),
      cite: [SCC_PLAN, GOV_16_5],
    }],
    confirm: B("Ask the Department of Environmental Health (dehplancheck@deh.sccgov.org) whether an authorized agent may sign on the application's Applicant Signature line. If yes, Placetta's named person signs as agent and this touch goes.", "请询问环境卫生局（dehplancheck@deh.sccgov.org）授权代理人能否在申请的“申请人签名”一栏签字。若可以，由快哉指定人员以代理人身份签署，这一步即可省去。"),
    cite: [SCC_PLAN, SCC_NEW, CIV_2304], checked: "2026-10-18",
    note: B("Since April 1, 2026 every plan check submittal goes by email, and the county invoices the fee. Nothing on the county's page limits who sends the packet, so Placetta emails it as the business's agent (Civil Code 2304), the owner copied. The application's \"Applicant Signature\" line is the owner's until the county says an agent may sign it, and the county says nothing about e-signatures, so it's signed in ink.",
      "自 2026 年 4 月 1 日起所有图纸审查材料都通过电子邮件提交，费用由县政府开账单。县政府页面没有限制由谁发送材料包，因此快哉作为企业的代理人发送（《民法典》第 2304 条），并抄送业主。在县政府说明代理人可以签署之前，“申请人签名”一栏由业主签署；县政府未提及电子签名，因此需亲笔签名。"),
  },
  "scc-health-permit": {
    agentOk: true, sends: "placetta", account: { who: "none", what: B("Emailed with the application package", "随申请材料包通过电子邮件发送") },
    owner: [{
      what: B("Sign the permit application and certification statement by hand", "亲笔签署许可证申请及证明声明"), why: "agency", when: "signup", sig: "hand",
      cite: [SCC_PLAN, GOV_16_5],
    }],
    confirm: B("Ask the county whether a certification signed at signup is accepted months later, unchanged. Placetta re-checks every fact on it before sending and asks the owner to sign again if any changed.", "请询问县政府注册时签好的证明声明在数月后原样提交是否可以。快哉在发送前会重新核对其中每项信息，如有变化会请业主重签。"),
    cite: [SCC_PLAN, SCC_NEW, CIV_2304], checked: "2026-10-18",
    note: B("Every fact it certifies (the owner, the business, the facility) is known at signup, so it's signed then, by hand, and Placetta emails it when the county is ready for it. The operating permit is invoiced after the final inspection.",
      "其中证明的每项信息（业主、企业、设施）在注册时都已知，因此在注册时亲笔签署，县政府需要时由快哉通过电子邮件发送。营业许可证费用在最终检查后开账单。"),
  },
  "sj-business-tax": {
    agentOk: false, sends: "owner", account: { who: "owner", what: B("The city's online registration", "市政府的网上登记") },
    owner: [{
      what: B("Register online for the business tax certificate", "在网上登记营业税证书"), why: "agency", when: "later", sig: "esign",
      later: B("The city's page names no route Placetta can send on and says nothing on who may register for a business.", "市政府页面没有列出快哉可用的提交方式，也没有说明谁可以代企业登记。"),
      cite: [SJ_BTC],
    }],
    confirm: B("Ask San José Finance (Business Tax) whether a preparer may register a business, and on which site. If yes, Placetta registers it as agent from its own account and this touch goes.", "请询问圣何塞财政局（营业税）报税代理人能否替企业登记、在哪个网站登记。若可以，由快哉用自己的账户以代理人身份登记，这一步即可省去。"),
    cite: [SJ_BTC], checked: "2026-10-27",
    note: B("\"Anyone or any company doing business in San José must register\" within 90 days; the page names no portal, form or rule on representatives. Silence isn't permission, so this stays the owner's until the city confirms.",
      "“在圣何塞经营的任何人或公司都必须登记”，期限 90 天；页面没有列出网站、表格或关于代理人的规定。没有说明不等于允许，因此在市政府确认前由业主办理。"),
  },
  "sj-building-ti": {
    agentOk: true, sends: "placetta", signsAsAgent: "contractor",
    account: { who: "placetta", site: "sjpermits.org", what: B("Placetta's own agent account on the city's permit sites (made once by Placetta's founder)", "快哉在市政府许可证网站上的代理人账户（由快哉创始人开设一次）") },
    auth: {
      id: "sj-building-section-c", name: B("Building Permit Application, Section C (authorized agent)", "建筑许可申请第 C 部分（授权代理人）"), issuer: "agency", url: SJ_BP_INSTR, sig: "esign", months: 12,
      lets: B("Placetta's named person signs and submits the building permit application as the business's authorized agent.", "快哉指定人员以企业授权代理人的身份签署并提交建筑许可申请。"),
      cite: [SJ_BP_INSTR, SJ_WHO, SJ_TI],
    },
    owner: [{ what: B("Sign Section C, naming Placetta as your authorized agent", "签署第 C 部分，指定快哉为您的授权代理人"), why: "agency", when: "signup", sig: "esign", auth: true, cite: [SJ_BP_INSTR, SJ_TI] }],
    confirm: B("Confirm with the Permit Center that Section C signed at signup on the city's form is accepted with the application filed later (the alternative it names is a notarized letter dated within 12 months).", "请向许可中心确认：注册时在市政府表格上签署的第 C 部分，可否与之后提交的申请一并使用（其列出的替代方式是 12 个月内的公证信）。"),
    cite: [SJ_BP_INSTR, SJ_WHO, HSC_19825], checked: "2026-10-27",
    note: B("San José lets an authorized agent or an authorized tenant sign a plan-review building permit application; the principal signs Section C or gives a notarized letter dated no earlier than 12 months before the application. The city recommends a licensed contractor sign, and the licensed contractor's declaration is the contractor's own (Health and Safety Code 19825), so the owner makes no sworn declaration. The property owner's authorization, where needed, is the landlord's paper, sent to them for signature.",
      "圣何塞允许授权代理人或获授权的租户签署需图纸审查的建筑许可申请；委托人签署第 C 部分，或提供申请日前 12 个月内的公证信。市政府建议由持牌承包商签署，持牌承包商声明由承包商本人作出（《健康与安全法典》第 19825 条），因此业主无需作宣誓声明。如需产权人授权，那是房东的文件，发给房东签署。"),
  },
  "sj-sign": {
    agentOk: false, sends: "contractor", signsAsAgent: "contractor",
    account: { who: "contractor", site: "sjpermits.org", what: B("Your licensed sign contractor's own SJPermits.org account", "您的持牌招牌承包商自己的 SJPermits.org 账户") },
    owner: [], cite: [SJ_WHO], checked: "2026-10-27",
    note: B("On SJPermits.org \"only licensed contractors or property owners can be the applicant\", so neither a tenant business nor Placetta can apply there: your licensed sign contractor (or the landlord) applies. Odelia prepares the application and the city's checklist, sends them to the contractor and tracks it; nothing comes to the owner.",
      "在 SJPermits.org 上“只有持牌承包商或产权人可以作为申请人”，因此租户企业和快哉都不能在那里申请：由您的持牌招牌承包商（或房东）申请。Odelia 准备好申请和市政府清单，发给承包商并跟进，业主无需操作。"),
  },
};

export const agentRow = (formId?: string): AgentRow | undefined => (formId && Object.prototype.hasOwnProperty.call(AGENT, formId) ? AGENT[formId] : undefined);
/** The agency lets Placetta act for the business on this form (the row's own citation says so). */
export const agentOk = (formId?: string): boolean => !!agentRow(formId)?.agentOk;

/** Forms whose signature or filing the law makes the owner's own act, with the citation: for the "what remains by law"
 *  list on the screen and in the report. */
export function byLaw(formIds: string[]): { form: string; what: Bi; cite: string[] }[] {
  return formIds.flatMap(f => (agentRow(f)?.owner ?? []).filter(o => o.why === "law").map(o => ({ form: f, what: o.what, cite: o.cite })));
}

/** Other ways an agent may act that the plans don't need yet, kept here with their limits so no one reaches for them
 *  wrongly: Form 8821 names any person or organization to receive tax information but "doesn't authorize your designee
 *  to speak on your behalf"; Form 2848 names only individuals eligible to practice before the IRS (attorneys, CPAs,
 *  enrolled agents...), never a company; both take an e-signature only when submitted online. */
export const NOT_USED: { form: string; why: Bi; cite: string[] }[] = [
  { form: "IRS Form 8821", why: B("Lets a designee receive the business's tax information, not act or speak for it. Not needed for an opening.", "只允许指定人接收企业的税务信息，不能代表企业行事或发言。开业无需此表。"), cite: [IRS_8821_I, IRS_SUBMIT_ONLINE] },
  { form: "IRS Form 2848", why: B("Representatives must be individuals eligible to practice before the IRS; Placetta, a company, can't be one.", "代表人必须是有资格在 IRS 执业的个人；快哉作为公司不能担任。"), cite: [IRS_2848_I] },
  { form: "EDD DE 48", why: B("A power of attorney for an existing EDD account: it needs the business's EIN and is filed within 30 days of the owner's signature, so it can't be signed at signup.", "针对已有 EDD 账户的授权书：需要企业的 EIN，且须在业主签名后 30 天内提交，因此无法在注册时签署。"), cite: [EDD_DE48] },
];
