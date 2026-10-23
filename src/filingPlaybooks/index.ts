/* Playbooks: one per kind of filing, as data. Odelia follows them with one tool (follow_playbook, src/live.ts) instead
   of reasoning each filing out from scratch: the playbook finds the store's own form in the registry, fills every line
   it can from the business profile and earlier filings, runs the field validators in code, reuses documents already in
   the workspace, asks for everything still missing in one message, and puts complete filings up for approval. The
   model is left only what needs judgment (named in `judgment`).

   What each playbook holds:
     match        which registry forms it covers (the form for each city, county or state comes from the registry)
     inputs       what it needs, collected once up front: where each comes from in the profile and its validator
     documents    what it needs attached, and what in the workspace can be reused for it
     steps        the exact order, in code
     rejections   why an agency sends this kind of filing back, and the check in code that prevents it
     judgment     what the model still decides
     fallback     when it goes to Placetta's team
     lookups      where the agency publishes its status, read every day (./status.ts, src/tracking)
     book_inspection  the step after issue for permits an inspector signs off: book it (src/inspections/booking.ts)
   The agency's time, the renewal cycle, the fee, the form's own lines and how it's sent (portal, email, fax, mail, the
   owner, or the team) are read from the registry entry and the verified destination of each store's own form
   (src/forms/registry.ts, supabase/functions/file/destinations.ts), so a playbook is never out of step with them.

   To add one: a new entry below with its match, inputs and documents. scripts/agent-test.ts ("Filing playbooks")
   checks every entry covers at least one registry form and every input names a real validator, and npm run econ
   measures its runs, rounds, tool calls and cost against the step-by-step way. */
import { B, type Bi } from "../bi";
import type { OfficialForm } from "../forms/registry";
import { complexOf } from "../pricing";
import type { ValidatorId } from "../validate";
import type { LookupId } from "./status";

export type PlaybookId = "business_license" | "health_permit" | "sellers_permit" | "sign_permit" | "building_permit" | "liquor" | "entity_registration" | "sales_tax_return";
export type Input = {
  key: string; label: Bi;
  /** The business profile fact that answers it (a workspace fact's English label), or the store's own address. */
  from: { fact: RegExp } | "store_address" | "store_name" | "ask";
  validator?: ValidatorId;
};
export type Doc = { key: string; label: Bi; /** a document already in the workspace that can be reused */ reuse: RegExp };
export type Step = "find_form" | "prefill" | "reuse_documents" | "validate" | "ask_once" | "approve" | "send" | "track" | "book_inspection";
export type Rejection = { why: Bi; check: "preflight" | "jurisdiction" | "premises" | "ein" | "latin" | "legal_name" | "attachments" | "expired" | "fee" | "duplicate" | "readback" };
export type Playbook = {
  id: PlaybookId; name: Bi;
  match: (f: OfficialForm) => boolean;
  /** City and county permits are per store, so one call batches every store; a state or federal filing is once. */
  perStore: boolean;
  inputs: Input[]; documents: Doc[]; steps: Step[]; rejections: Rejection[];
  judgment: Bi[]; fallback: Bi;
  /** Where the agency publishes this kind of filing's status (./status.ts): read daily, in code where it can be. */
  lookups?: LookupId[];
};

const NOT = /plan (check|review)|pre-?opening|inspection|food (handler|worker|protection|safety) (card|certificate|course)|manager|final/i;
const t = (f: OfficialForm) => `${f.id} ${f.title.en}`;

/* The inputs most filings share, each from the business profile (src/model.ts facts) or the store. */
const LEGAL: Input = { key: "legal_name", label: B("Legal name, as registered with the state", "在州登记的法定名称"), from: { fact: /legal (business |entity )?name|registered name/i }, validator: "latin" };
const EIN: Input = { key: "ein", label: B("EIN", "EIN（联邦雇主识别号）"), from: { fact: /\bein\b|employer identification/i }, validator: "ein" };
const PREMISES: Input = { key: "premises", label: B("The store's street address", "门店街道地址"), from: "store_address", validator: "premises" };
const OWNER: Input = { key: "owner", label: B("Owner or responsible person", "负责人"), from: { fact: /owner|responsible|principal|officer|member/i }, validator: "latin" };
const PHONE: Input = { key: "phone", label: B("Business phone", "营业电话"), from: { fact: /phone|telephone/i } };
const OPENING: Input = { key: "opening", label: B("Opening or start date", "开业或开始日期"), from: { fact: /opening|start date|begin/i }, validator: "date" };

/* Why agencies send filings back, each one prevented by a check that already runs in code before approval. */
const R = {
  jurisdiction: { why: B("Filed with the wrong city or county", "提交给了错误的市或县"), check: "jurisdiction" } as Rejection,
  legal: { why: B("The name doesn't match the state registration letter for letter", "名称与州登记记录不完全一致"), check: "legal_name" } as Rejection,
  premises: { why: B("A P.O. box where the agency needs the premises", "在需要经营场所的地方填了邮政信箱"), check: "premises" } as Rejection,
  ein: { why: B("An EIN that isn't one (wrong format or a prefix the IRS doesn't assign)", "EIN 无效（格式错误或 IRS 不分配的前缀）"), check: "ein" } as Rejection,
  latin: { why: B("Chinese characters on a US form, which don't print", "美国表格上出现中文字符，无法打印"), check: "latin" } as Rejection,
  attach: { why: B("A document the agency lists is missing", "缺少机构要求的文件"), check: "attachments" } as Rejection,
  expired: { why: B("An attached document has expired", "附件已过期"), check: "expired" } as Rejection,
  fee: { why: B("The fee doesn't match the agency's schedule", "费用与机构标准不符"), check: "fee" } as Rejection,
  twice: { why: B("The same filing already went in", "同一申请已提交过"), check: "duplicate" } as Rejection,
  readback: { why: B("A line on the PDF doesn't say what was approved", "PDF 上的某一行与批准内容不一致"), check: "readback" } as Rejection,
};
const COMMON_STEPS: Step[] = ["find_form", "prefill", "reuse_documents", "validate", "ask_once", "approve", "send", "track"];
const TEAM = B("Placetta's team files it when the agency needs a wet signature, a payment with the filing, or has no route Odelia can use; the approval card says so before anything is charged.", "当机构要求亲笔签名、随件缴费或没有 Odelia 可用的途径时，由快哉团队提交；批准卡片会在收费前说明。");

export const PLAYBOOKS: Playbook[] = [
  {
    id: "business_license", name: B("Business license or tax certificate", "营业执照或营业税证书"), perStore: true,
    // a city or county license, or a state business license (Washington's: its state tax registration too)
    match: f => ((f.level === "city" || f.level === "county") && /business (tax|license|registration|operations tax)|commercial activity license|\bbpol\b|business certificate/i.test(t(f)) || f.level === "state" && /\bbusiness license\b/i.test(t(f))) && !NOT.test(f.title.en),
    inputs: [LEGAL, EIN, PREMISES, OWNER, PHONE, OPENING],
    documents: [{ key: "lease", label: B("Signed lease", "签署的租约"), reuse: /lease|租约/i }],
    steps: COMMON_STEPS, rejections: [R.jurisdiction, R.legal, R.premises, R.ein, R.latin, R.twice, R.readback],
    judgment: [B("A business description in the agency's own categories when the form asks for one", "表格要求时，按机构的分类描述业务")], fallback: TEAM,
  },
  {
    id: "health_permit", name: B("Health permit (food facility)", "卫生许可（食品设施）"), perStore: true,
    match: f => /health permit|food (facility|establishment|service|enterprise|dealer|preparation|services business)[a-z ]*(permit|license)|retail food (establishment )?license|food service permit/i.test(t(f)) && !NOT.test(f.title.en),
    inputs: [LEGAL, PREMISES, OWNER, PHONE, OPENING, { key: "hours", label: B("Seats and opening hours", "座位数与营业时间"), from: { fact: /seats|hours/i } }],
    documents: [{ key: "plan_approval", label: B("Plan check approval", "图纸审查批准"), reuse: /plan (check|review)|图纸/i },
      { key: "manager_cert", label: B("Food manager certificate", "食品经理证书"), reuse: /food (manager|protection|safety)|经理证/i }],
    steps: [...COMMON_STEPS, "book_inspection"], rejections: [R.jurisdiction, R.legal, R.premises, R.attach, R.expired, R.latin, R.twice],
    judgment: [B("The menu's risk category when the agency asks for one", "机构要求时判断菜单风险等级")], fallback: TEAM,
  },
  {
    id: "sellers_permit", name: B("Seller's permit or sales tax registration", "销售许可或销售税登记"), perStore: false,
    match: f => /seller'?s permit|sales (and use )?tax (permit|vendor)|sales tax|transaction privilege tax|tax id and sales tax/i.test(t(f)),
    inputs: [LEGAL, EIN, PREMISES, OWNER, PHONE, OPENING],
    documents: [],
    steps: COMMON_STEPS, rejections: [R.legal, R.ein, R.premises, R.latin, R.twice],
    judgment: [B("The expected monthly sales when the form asks, from the owner's own estimate", "表格要求时，按负责人估算填写月销售额")], fallback: TEAM,
  },
  {
    id: "sign_permit", name: B("Sign permit", "招牌许可"), perStore: true,
    match: f => /\bsign (and awning )?permit\b/i.test(f.title.en),
    inputs: [LEGAL, PREMISES, PHONE, { key: "sign_contractor", label: B("Licensed sign contractor", "持牌招牌承包商"), from: { fact: /sign contractor|contractor/i } }],
    documents: [{ key: "sign_drawing", label: B("Sign drawing with size and placement", "标示尺寸与位置的招牌图纸"), reuse: /sign|招牌/i },
      { key: "landlord", label: B("Landlord's consent", "房东同意书"), reuse: /landlord|consent|房东/i }],
    steps: COMMON_STEPS, rejections: [R.jurisdiction, R.attach, R.premises, R.twice],
    judgment: [B("Whether the sign's size needs a structural review, read from the agency's own rule", "按机构规定判断招牌尺寸是否需要结构审查")], fallback: TEAM,
  },
  {
    id: "building_permit", name: B("Building permit for the build-out", "装修建筑许可"), perStore: true,
    match: f => /building permit|build-?out|tenant (improvement|finish)|construction permit|alteration/i.test(f.title.en) && !/final/i.test(f.title.en),
    inputs: [LEGAL, PREMISES, PHONE, { key: "contractor", label: B("Licensed contractor and license number", "持牌承包商及执照号"), from: { fact: /contractor/i } },
      { key: "valuation", label: B("Value of the work", "工程造价"), from: "ask" }],
    documents: [{ key: "plans", label: B("Plans stamped by the architect or engineer", "建筑师或工程师盖章的图纸"), reuse: /plans?|drawings?|图纸/i },
      { key: "landlord", label: B("Landlord's consent", "房东同意书"), reuse: /landlord|consent|房东/i }],
    steps: [...COMMON_STEPS, "book_inspection"], rejections: [R.jurisdiction, R.attach, R.premises, R.fee, R.twice],
    judgment: [B("Answers to the plan checker's comments, which the team reviews", "回复图纸审查意见，由团队审核")], fallback: TEAM,
    lookups: ["sf_dbi_permits", "la_ladbs_permits", "nyc_dob_now_jobs"],
  },
  {
    id: "liquor", name: B("Liquor license", "酒类执照"), perStore: true,
    // the license itself; its community board or public notice is a free step of it, prepared as a document
    match: f => (complexOf(f.title.en)?.id === "liquor" || /\bliquor license\b|wine license|alcohol(ic beverage)? (license|permit)|conditional use permit to sell alcohol/i.test(f.title.en)) && !/dealer registration|notice/i.test(f.title.en),
    inputs: [LEGAL, EIN, PREMISES, OWNER, PHONE, OPENING],
    documents: [{ key: "lease", label: B("Signed lease", "签署的租约"), reuse: /lease|租约/i },
      { key: "community_notice", label: B("Proof of the community or public notice", "社区或公示通知证明"), reuse: /notice|community board|通知/i },
      { key: "diagram", label: B("Floor plan of the licensed premises", "持牌场所平面图"), reuse: /floor plan|diagram|平面图/i }],
    steps: COMMON_STEPS, rejections: [R.jurisdiction, R.legal, R.premises, R.attach, R.expired, R.latin, R.twice],
    judgment: [B("Answers about the owners' history and the premises that only the owner can give", "只有负责人能回答的关于股东背景和场所的问题")],
    lookups: ["ca_abc_license", "ny_sla_license", "tx_tabc_license"],
    fallback: B("A liquor license is complex: Placetta's team leads it with the owner (notices, hearings, the agency's questions), with Odelia preparing every form.", "酒类执照属于复杂执照：由快哉团队与负责人一起办理（公示、听证、机构问询），Odelia 准备全部表格。"),
  },
  {
    id: "entity_registration", name: B("Company formation or foreign registration", "公司设立或外州登记"), perStore: false,
    match: f => /articles of organization|certificate of formation|llc formation|register a foreign llc|registration of a foreign llc|registration of an out-of-state|application for (authority|admission|registration)|foreign registration|authority to transact/i.test(`${f.title.en} ${f.form}`) || f.level === "state" && !!f.needs?.foreignEntity,
    inputs: [LEGAL, OWNER, { key: "agent", label: B("Registered agent in the state", "州内注册代理人"), from: { fact: /registered agent|agent for service/i }, validator: "premises" },
      { key: "mailing", label: B("Mailing address", "邮寄地址"), from: { fact: /mailing address|company address/i } }],
    documents: [{ key: "home_good_standing", label: B("Good standing certificate from the home state (foreign registration)", "注册州的良好存续证明（外州登记时）"), reuse: /good standing|existence|存续/i }],
    steps: COMMON_STEPS, rejections: [R.legal, R.premises, R.latin, R.attach, R.twice],
    judgment: [B("Whether the name is free in the state, from the state's own search", "通过州政府查询判断名称是否可用")], fallback: TEAM,
  },
  {
    id: "sales_tax_return", name: B("Sales tax return", "销售税申报"), perStore: false,
    // returns aren't registry forms: they are filed on the state's portal each period, from the permit's own account
    match: () => false,
    inputs: [LEGAL, { key: "permit_number", label: B("Seller's permit or sales tax account number", "销售许可或销售税账号"), from: { fact: /seller'?s permit|sales tax (account|permit|number)/i } },
      { key: "period", label: B("The period it covers", "申报所属期间"), from: "ask", validator: "date" },
      { key: "sales", label: B("Gross and taxable sales for the period, from the connected books or POS", "该期间的总销售额与应税销售额（来自已连接的账本或收银系统）"), from: "ask" }],
    documents: [],
    steps: ["prefill", "validate", "ask_once", "approve", "send", "track"], rejections: [R.twice, R.fee],
    judgment: [B("Which sales are exempt when the books don't say", "账本未注明时判断哪些销售免税")],
    fallback: B("Placetta's team files returns on the state's portal until a return playbook for that state has had its supervised first run.", "在该州的申报流程完成有人监督的首次运行之前，由快哉团队在州政府网站申报。"),
  },
];

export const playbookById = (id: string) => PLAYBOOKS.find(p => p.id === id);
/** The playbook a registry form falls under, if any. */
export const playbookOf = (f: OfficialForm) => PLAYBOOKS.find(p => p.match(f));
