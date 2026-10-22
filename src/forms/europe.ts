// Europe: what a brand files to open and run a store in the UK, the EU countries it enters first, Switzerland and
// Norway, read from the governments' own pages on 2026-10-21 (gov.uk, service-public.fr and entreprendre.service-public.fr,
// the German federal and state portals, impresainungiorno.gov.it and the Italian agencies, the Spanish ministries and
// cities, the Dutch government's business.gov.nl, Your Europe and the European Commission).
//
// Fail closed, as everywhere in the library: each entry's proof is a sentence of under 25 words copied from its source
// page in the page's own language, with an English translation (`en`) when that language isn't English, the URL read
// and the day. A filing with no sentence that could be read carries no proof, so its plan row abstains and names the
// office to ask, with that office's own link. No fee, form number or processing time is stated unless the page states
// it. A filing only a local professional may make (a notary, a lawyer, a gestor) says so in `specialist`: Placetta
// prepares it and hands it over.
//
// Where an entry is a city's ("FR-PAR"), it is that city's office; where it is a country's ("FR") at the city level, it
// is the local office for the address (the mairie, the Ordnungsamt, the council), named in the agency.
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import type { Method, Needs, OfficialForm, Segment } from "./registry";

export const READ_EU = "2026-10-21";
type T = readonly [string, string];
const b = (t: T): Bi => B(t[0], t[1]);
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
/** Premises: a shop, a restaurant or a warehouse (an online seller has none). */
const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];
const STORES: Segment[] = ["restaurant", "retail"];

export type EuEntry = {
  id: string; where: string; level: Level; segs?: Segment[]; needs?: Needs; unless?: (keyof Needs)[]; method: Method; order: number; form: string;
  title: T; agency: T; how: T; url: string; fee?: number | null; cur: string; feeNote?: T; takes?: T; renews?: T; foreign?: T; specialist?: T; plain?: T;
  /** [the page read, the sentence as written, its English translation when the page isn't in English] */
  proof?: readonly [string, string, string?];
  info?: string;
};
export function E(o: EuEntry): OfficialForm {
  const info = o.proof?.[0] ?? o.info ?? o.url;
  return {
    id: o.id, form: o.form, title: b(o.title), agency: b(o.agency), level: o.level, where: o.where, segments: o.segs ?? ALL,
    ...(o.needs ? { needs: o.needs } : {}), ...(o.unless ? { unless: o.unless } : {}), method: o.method, how: b(o.how), url: o.url, info,
    fee: o.fee === undefined ? null : o.fee, currency: o.cur, ...(o.feeNote ? { feeNote: b(o.feeNote) } : {}), ...(o.takes ? { takes: b(o.takes) } : {}),
    ...(o.renews ? { renews: b(o.renews) } : {}), fields: [], ...(o.foreign ? { foreign: b(o.foreign) } : {}), ...(o.specialist ? { specialist: b(o.specialist) } : {}),
    ...(o.plain ? { plain: b(o.plain) } : {}), checked: "page", order: o.order,
    ...(o.proof ? { proof: { read: o.proof[0], quote: o.proof[1], checked: READ_EU, ...(o.proof[2] ? { en: o.proof[2] } : {}) } } : {}),
  };
}

/* ------------------------------------------------------------------ United Kingdom (England) */
const GOVUK = "https://www.gov.uk";
const GB_COUNCIL: T = ["Local council (in London, the borough council for the address)", "所在地市政厅（伦敦为地址所属的自治市议会）"];
const GB_PLANNING: T = ["Local planning authority (the council)", "地方规划机关（市政厅）"];

export const UK_FORMS: OfficialForm[] = [
  E({ id: "gb-incorporate", where: "GB", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "GBP", fee: 100,
    form: "Register a private limited company (IN01)", title: ["Company registration with Companies House", "在 Companies House 注册公司"], agency: ["Companies House", "英国公司注册处（Companies House）"],
    how: ["Registered online with Companies House, after each director and person with significant control verifies their identity. The same application usually sets the company up for Corporation Tax.", "在 Companies House 在线注册，所有董事和重要控制人须先完成身份验证。同一申请通常同时完成公司税登记。"],
    url: `${GOVUK}/limited-company-formation/register-your-company`, takes: ["Usually within 24 hours.", "通常 24 小时内完成。"],
    foreign: ["A company formed abroad can instead register its UK establishment on form OS IN01 with Companies House.", "境外公司也可改为以 OS IN01 表向 Companies House 登记其英国分支机构。"],
    plain: ["Forms the UK company; its number goes on every other filing.", "设立英国公司，公司编号会用在其他所有申请上。"],
    proof: [`${GOVUK}/limited-company-formation/register-your-company`, "It costs £100 and can be paid by debit or credit card."] }),
  E({ id: "gb-corp-tax", where: "GB", level: "federal", needs: { newEntity: true }, method: "online", order: 20, cur: "GBP",
    form: "Corporation Tax registration", title: ["Corporation Tax registration", "公司税登记"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Usually done with the company registration; otherwise added to the company's HMRC business tax account.", "通常随公司注册一并完成；否则在公司的 HMRC 商业税务账户中添加。"], url: `${GOVUK}/limited-company-formation/register-your-company`,
    proof: [`${GOVUK}/limited-company-formation/register-your-company`, "You will usually be set up for Corporation Tax at the same time,"] }),
  E({ id: "gb-vat", where: "GB", level: "federal", method: "online", order: 25, cur: "GBP",
    form: "VAT registration", title: ["VAT registration", "增值税（VAT）登记"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Registered online with HMRC once taxable turnover passes £90,000 in 12 months, or is expected to within 30 days.", "12 个月应税营业额超过 9 万英镑，或预计 30 天内超过时，向 HMRC 在线登记。"], url: `${GOVUK}/register-for-vat`,
    proof: [`${GOVUK}/register-for-vat`, "You must register if your total taxable turnover for the last 12 months goes over £90,000."] }),
  E({ id: "gb-paye", where: "GB", level: "federal", needs: { employees: true }, method: "online", order: 28, cur: "GBP",
    form: "Register as an employer (PAYE)", title: ["Employer registration (PAYE)", "雇主登记（PAYE）"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Registered online with HMRC before the first payday, and no more than 2 months before it.", "首次发薪前向 HMRC 在线登记，最早可提前 2 个月。"], url: `${GOVUK}/register-employer`,
    proof: [`${GOVUK}/register-employer`, "You must register before the first payday to get your employer PAYE reference number."] }),
  E({ id: "gb-pension", where: "GB", level: "federal", needs: { employees: true }, method: "online", order: 62, cur: "GBP",
    form: "Workplace pension and declaration of compliance", title: ["Workplace pension (automatic enrolment)", "职场养老金（自动加入）"], agency: ["The Pensions Regulator", "英国养老金监管局"],
    how: ["Set up a workplace pension scheme, enrol eligible staff from their first day, then declare compliance to The Pensions Regulator.", "设立职场养老金计划，员工入职起为符合条件者办理加入，再向养老金监管局申报合规。"], url: `${GOVUK}/workplace-pensions-employers`,
    proof: [`${GOVUK}/workplace-pensions-employers`, "You must enrol and make an employer’s contribution for all staff who:"] }),
  E({ id: "gb-el-insurance", where: "GB", level: "federal", needs: { employees: true }, method: "insurer", order: 63, cur: "GBP",
    form: "Employers' liability insurance", title: ["Employers' liability insurance", "雇主责任险"], agency: ["Authorised insurer (cover the law requires)", "授权保险公司（法定要求的保险）"],
    how: ["Bought from an authorised insurer as soon as the company becomes an employer, covering at least £5 million.", "成为雇主时即须向授权保险公司投保，保额至少 500 万英镑。"], url: `${GOVUK}/employers-liability-insurance`,
    proof: [`${GOVUK}/employers-liability-insurance`, "as soon as you become an employer to cover you for at least £5 million from an authorised insurer"] }),
  E({ id: "gb-planning", where: "GB", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 50, cur: "GBP",
    form: "Planning permission", title: ["Planning permission (a change of use or major works)", "规划许可（变更用途或重大改建）"], agency: GB_PLANNING,
    how: ["Asked of the council's planning department when the premises change use (a shop becoming a restaurant) or the works are major.", "场所变更用途（如商店改为餐厅）或进行重大改建时，向市政厅规划部门申请。"], url: `${GOVUK}/planning-permission-england-wales`,
    proof: [`${GOVUK}/planning-permission-england-wales`, "change the use of your building"] }),
  E({ id: "gb-signage", where: "GB", level: "city", segs: PREMISES, needs: { signage: true }, method: "online", order: 66, cur: "GBP",
    form: "Advertisement consent", title: ["Advertisement consent for the shop sign", "门店招牌广告许可"], agency: GB_PLANNING,
    how: ["Many shop signs have deemed consent; an illuminated or larger sign may need the council's express consent first.", "许多门店招牌属于视同许可；发光或较大的招牌可能须先取得市政厅的明示许可。"], url: `${GOVUK}/guidance/advertisements`,
    proof: [`${GOVUK}/guidance/advertisements`, "Those which require the express consent of the local planning authority."] }),
  E({ id: "gb-business-rates", where: "GB", level: "city", segs: PREMISES, method: "online", order: 70, cur: "GBP",
    form: "Business rates", title: ["Business rates on the premises", "营业场所商业房产税"], agency: GB_COUNCIL,
    how: ["The council bills business rates on the premises; tell it when you move in.", "市政厅按场所征收商业房产税；入驻时须通知市政厅。"], url: `${GOVUK}/introduction-to-business-rates`,
    renews: ["Billed every year.", "每年征收。"], proof: [`${GOVUK}/introduction-to-business-rates`, "Business rates are charged on most non-domestic properties, like:"] }),
  E({ id: "gb-fire", where: "GB", level: "city", segs: PREMISES, method: "none", order: 72, cur: "GBP",
    form: "Fire risk assessment", title: ["Fire risk assessment (no sign-off: the fire authority inspects)", "消防风险评估（无需审批，由消防机关检查）"], agency: ["Local fire and rescue authority", "当地消防救援机关"],
    how: ["England has no fire certificate to apply for: the person responsible carries out and keeps a fire risk assessment, and the fire and rescue authority inspects.", "英格兰无须申请消防证书：责任人须进行并保存消防风险评估，由消防救援机关检查。"], url: `${GOVUK}/workplace-fire-safety-your-responsibilities`,
    feeNote: ["Nothing is filed with the authority.", "无需向机关申报。"],
    proof: [`${GOVUK}/workplace-fire-safety-your-responsibilities`, "carry out a fire risk assessment of the premises and review it regularly"] }),
  E({ id: "gb-food", where: "GB", level: "city", segs: ["restaurant", "retail", "warehouse", "seller"], needs: { food: true }, method: "online", order: 74, cur: "GBP",
    form: "Register a food business", title: ["Food business registration", "食品企业登记"], agency: GB_COUNCIL,
    how: ["Registered online with the council's environmental health team; the council inspects and gives a food hygiene rating.", "向市政厅环境卫生部门在线登记；市政厅会检查并给出食品卫生评级。"], url: `${GOVUK}/food-business-registration`,
    takes: ["Register at least 28 days before trading.", "须在开始营业前至少 28 天登记。"],
    proof: [`${GOVUK}/food-business-registration`, "You are required to register at least 28 days before trading."] }),
  E({ id: "gb-premises", where: "GB", level: "city", segs: STORES, needs: { alcohol: true }, method: "online", order: 71, cur: "GBP",
    form: "Premises licence", title: ["Premises licence (alcohol, or hot food from 11pm)", "场所许可证（售酒，或晚 11 点后供应热食）"], agency: ["Local council licensing", "所在地市政厅许可部门"],
    how: ["Applied for with the council's licensing team. Also needed to serve hot food or drink between 11pm and 5am.", "向市政厅许可部门申请。晚 11 点至早 5 点供应热食热饮也需要。"], url: `${GOVUK}/premises-licence`,
    feeNote: ["Set by the premises' rateable value.", "按场所应税估值确定。"],
    proof: [`${GOVUK}/premises-licence`, "You'll need a premises licence if you want to sell alcohol or offer entertainment from a particular venue"] }),
  E({ id: "gb-personal-licence", where: "GB", level: "city", segs: STORES, needs: { alcohol: true }, method: "online", order: 72, cur: "GBP",
    form: "Personal licence", title: ["Personal licence to sell alcohol (the premises supervisor's)", "个人售酒许可证（场所主管）"], agency: ["Local council licensing (where the holder lives)", "持证人居住地市政厅许可部门"],
    how: ["Held by the designated premises supervisor, applied for with the council where that person lives.", "由指定场所主管持有，向其居住地市政厅申请。"], url: `${GOVUK}/personal-licence-to-sell-alcohol`,
    proof: [`${GOVUK}/personal-licence-to-sell-alcohol`, "You need a licence to sell alcohol from a licensed premises"] }),
  E({ id: "gb-pavement", where: "GB", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "GBP",
    form: "Pavement licence", title: ["Pavement licence for tables outside", "街边桌椅许可"], agency: GB_COUNCIL,
    how: ["Applied for with the council before putting removable tables and chairs on the pavement.", "在人行道摆放可移动桌椅前向市政厅申请。"], url: `${GOVUK}/government/publications/pavement-licences-guidance`,
    feeNote: ["Set by the council, up to the cap in the government's guidance.", "由市政厅确定，不超过政府指引规定的上限。"],
    proof: [`${GOVUK}/government/publications/pavement-licences-guidance`, "obtain a licence to place removable furniture, such as tables and chairs outside of cafes, bars, and restaurants quickly."] }),
  E({ id: "gb-eori", where: "GB", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "GBP",
    form: "EORI number", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["HM Revenue & Customs", "英国税务海关总署（HMRC）"],
    how: ["Applied for online with HMRC before the first import.", "首次进口前向 HMRC 在线申请。"], url: `${GOVUK}/eori`,
    proof: [`${GOVUK}/eori`, "You may need an Economic Operators Registration and Identification number"] }),
  /* running it: after the opening */
  E({ id: "gb-confirmation", where: "GB", level: "federal", needs: { newEntity: true }, method: "online", order: 92, cur: "GBP",
    form: "Confirmation statement (CS01)", title: ["Confirmation statement every 12 months", "每 12 个月提交确认声明"], agency: ["Companies House", "英国公司注册处（Companies House）"],
    how: ["Filed online with Companies House at least once every 12 months, even if nothing changed.", "每 12 个月至少在线提交一次，即使信息无变化。"], url: `${GOVUK}/file-your-confirmation-statement-with-companies-house`,
    renews: ["Every 12 months.", "每 12 个月一次。"], proof: [`${GOVUK}/guidance/confirmation-statement-guidance`, "You must review your records and file at least one confirmation statement every 12 months."] }),
  E({ id: "gb-accounts", where: "GB", level: "federal", needs: { newEntity: true }, method: "online", order: 93, cur: "GBP",
    form: "Annual accounts and Company Tax Return", title: ["Annual accounts and Company Tax Return", "年度账目与公司税申报"], agency: ["Companies House and HM Revenue & Customs", "Companies House 与 HMRC"],
    how: ["Each year the accounts go to Companies House and the Company Tax Return to HMRC.", "每年向 Companies House 提交账目，向 HMRC 提交公司税申报。"], url: `${GOVUK}/prepare-file-annual-accounts-for-limited-company`,
    renews: ["Every year.", "每年一次。"], proof: [`${GOVUK}/prepare-file-annual-accounts-for-limited-company`, "After the end of its financial year, your private limited company must prepare:"] }),
];

export const EUROPE_FORMS: OfficialForm[] = [...UK_FORMS];
