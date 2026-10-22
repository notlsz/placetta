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
  /** places inside `where` where a local entry replaces this one (Paris's Préfecture de police for the mairie) */
  except?: string[];
};
export function E(o: EuEntry): OfficialForm {
  const info = o.proof?.[0] ?? o.info ?? o.url;
  return {
    id: o.id, form: o.form, title: b(o.title), agency: b(o.agency), level: o.level, where: o.where, segments: o.segs ?? ALL,
    ...(o.needs ? { needs: o.needs } : {}), ...(o.unless ? { unless: o.unless } : {}), method: o.method, how: b(o.how), url: o.url, info,
    fee: o.fee === undefined ? null : o.fee, currency: o.cur, ...(o.feeNote ? { feeNote: b(o.feeNote) } : {}), ...(o.takes ? { takes: b(o.takes) } : {}),
    ...(o.renews ? { renews: b(o.renews) } : {}), fields: [], ...(o.foreign ? { foreign: b(o.foreign) } : {}), ...(o.specialist ? { specialist: b(o.specialist) } : {}),
    ...(o.plain ? { plain: b(o.plain) } : {}), ...(o.except ? { except: o.except } : {}), checked: o.proof ? "page" : "known", order: o.order,
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

/* ------------------------------------------------------------------ the EU's own rules, in every member state ("EU") */
const GPSR = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R0988";
const EUDR = "https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en";
const PPWR = "https://environment.ec.europa.eu/topics/waste-and-recycling/packaging-waste_en";
const HYGIENE = "https://food.ec.europa.eu/food-safety/biological-safety/food-hygiene_en";

export const EU_FORMS: OfficialForm[] = [
  E({ id: "eu-food-hygiene", where: "EU", level: "federal", segs: ["restaurant", "retail", "warehouse", "seller"], needs: { food: true }, method: "none", order: 78, cur: "EUR",
    form: "Regulation (EC) No 852/2004", title: ["EU food hygiene rules (Regulation (EC) 852/2004)", "欧盟食品卫生规则（第 852/2004 号法规）"],
    agency: ["European Union (Regulation (EC) 852/2004), checked by the national food inspectors", "欧盟（第 852/2004 号法规），由国家食品监管部门检查"],
    how: ["Nothing to file: every food business keeps to the hygiene rules and runs food safety procedures based on HACCP principles, which the local food inspectors check. The registration it requires is the country's own food business registration.", "无需申报：所有食品企业须遵守卫生规则，并执行基于 HACCP 原则的食品安全程序，由当地食品监管部门检查。该法规要求的登记即各国自己的食品企业登记。"],
    url: HYGIENE, plain: ["The EU's hygiene rules every food business follows, inspected locally.", "所有食品企业都须遵守的欧盟卫生规则，由当地检查。"],
    proof: [HYGIENE, "All food businesses operating in the EU, regardless of their size or type, must comply with basic hygiene requirements."] }),
  E({ id: "eu-gpsr", where: "EU", level: "federal", segs: ["retail", "seller"], unless: ["food"], method: "none", order: 79, cur: "EUR",
    form: "Regulation (EU) 2023/988 (GPSR)", title: ["General Product Safety Regulation: a responsible operator in the EU", "通用产品安全法规：欧盟境内的责任经营者"],
    agency: ["European Union (Regulation (EU) 2023/988), enforced by the national market surveillance authority", "欧盟（第 2023/988 号法规），由国家市场监管机构执行"],
    how: ["Nothing to file: a consumer product made outside the EU is sold there only with an economic operator in the EU responsible for it, named with its contact details on the product.", "无需申报：欧盟境外制造的消费品须有一家欧盟境内的经济经营者对其负责，并在产品上标明其名称和联系方式，方可在欧盟销售。"],
    url: GPSR, plain: ["Every consumer product sold in the EU has a responsible business in the EU, named on it.", "在欧盟销售的每件消费品都须有一家欧盟境内的责任企业，并在产品上标明。"],
    proof: [GPSR, "A product covered by this Regulation shall not be placed on the market unless there is an economic operator"] }),
  E({ id: "eu-ppwr", where: "EU", level: "federal", segs: ["retail", "seller", "warehouse"], needs: { imports: true }, method: "none", order: 80, cur: "EUR",
    form: "Regulation (EU) 2025/40 (PPWR)", title: ["Packaging and Packaging Waste Regulation", "包装与包装废弃物法规"],
    agency: ["European Union (Regulation (EU) 2025/40), with each country's producer register for packaging", "欧盟（第 2025/40 号法规），及各国的包装生产者登记"],
    how: ["Goods imported in packaging meet the regulation's packaging requirements, and the importer registers as the producer of that packaging in each country it sells in (extended producer responsibility).", "进口商品的包装须符合该法规的要求，进口商须在每个销售国登记为该包装的生产者（生产者延伸责任）。"],
    url: PPWR, plain: ["The EU's packaging rules for imported goods, and the producer registration that goes with them.", "欧盟针对进口商品包装的规则及相应的生产者登记。"],
    proof: [PPWR, "The PPWR establishes a new set of requirements in line with Europe's waste rules that cover the entire packaging life cycle"] }),
  E({ id: "eu-eudr", where: "EU", level: "federal", segs: ["retail", "seller", "warehouse"], needs: { wood: true }, method: "online", order: 43, cur: "EUR",
    form: "Due diligence statement (EUDR Information System)", title: ["Deforestation Regulation: due diligence for wood furniture", "反毁林法规：木制家具尽职调查"],
    agency: ["European Commission, EUDR Information System (checked by the national competent authority)", "欧盟委员会 EUDR 信息系统（由国家主管机关检查）"],
    how: ["Wood furniture placed on the EU market needs due diligence on where the wood came from, and a due diligence statement submitted in the EUDR Information System. It applies to large and medium operators from 30 December 2026, and to micro and small operators from 30 June 2027.", "投放欧盟市场的木制家具须对木材来源进行尽职调查，并在 EUDR 信息系统提交尽职调查声明。大中型经营者自 2026 年 12 月 30 日起适用，小微经营者自 2027 年 6 月 30 日起适用。"],
    url: "https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en",
    plain: ["Proof that the wood in the furniture didn't come from deforested land, filed before it goes on sale in the EU.", "证明家具所用木材并非来自毁林土地，在欧盟上市销售前提交。"],
    proof: [EUDR, "Large and medium operators: 30 December 2026 Micro and small operators: 30 June 2027"] }),
];

/* ------------------------------------------------------------------ France (Paris; Lyon and elsewhere through the mairie) */
const SPE = "https://entreprendre.service-public.fr/vosdroits";
const FR_BAR = `${SPE}/F22387`, FR_LICENCE = `${SPE}/F22379`, FR_ERP = `${SPE}/F31687`;
const FR_MAIRIE: T = ["The mairie (town hall) of the commune", "所在市镇政府（mairie）"];

export const FRANCE_FORMS: OfficialForm[] = [
  E({ id: "fr-guichet", where: "FR", level: "federal", method: "online", order: 10, cur: "EUR",
    form: "Guichet unique des formalités d'entreprises", title: ["Company or branch registration (one-stop formalities portal)", "公司或分支机构登记（企业手续统一窗口）"],
    agency: ["INPI, Guichet unique des formalités des entreprises", "法国国家工业产权局（INPI）企业手续统一窗口"],
    how: ["Every company creation, and a foreign company's French branch, is declared online on formalites.entreprises.gouv.fr, which passes it to the trade register, the tax office and Urssaf and returns the SIREN and SIRET numbers.", "所有公司设立及外国公司在法国的分支机构均在 formalites.entreprises.gouv.fr 在线申报，平台会转交商业登记处、税务局和 Urssaf，并发放 SIREN 和 SIRET 编号。"],
    url: "https://formalites.entreprises.gouv.fr", feeNote: ["Registry and legal notice fees depend on the company form; the portal lists them.", "登记费和法定公告费视公司形式而定，平台会列出。"],
    foreign: ["A company formed abroad can register a French branch (succursale) through the same portal, with its articles translated into French.", "境外公司可通过同一平台登记法国分支机构（succursale），其章程须附法文译本。"],
    plain: ["Registers the company or branch in France; its SIREN goes on every other filing.", "在法国登记公司或分支机构，SIREN 编号会用在其他所有申请上。"],
    proof: ["https://formalites.entreprises.gouv.fr/cadre-juridique.php", "l’ensemble des formalités d’entreprise doit être déposé en ligne auprès d’un organisme unique.", "all business formalities must be filed online with a single body."] }),
  E({ id: "fr-tva", where: "FR", level: "federal", method: "online", order: 25, cur: "EUR",
    form: "Numéro de TVA intracommunautaire", title: ["VAT number and the business tax office (SIE)", "增值税号与企业税务局（SIE）"], agency: ["Service des impôts des entreprises (DGFiP)", "企业税务局（法国公共财政总局）"],
    how: ["The business tax office sends the intra-EU VAT number at registration; VAT and business taxes are then filed and paid in the company's professional space on impots.gouv.fr.", "企业税务局在登记时发放欧盟增值税号；之后在 impots.gouv.fr 的企业专属空间申报缴纳增值税和企业税。"],
    url: "https://www.impots.gouv.fr/professionnel",
    proof: [`${SPE}/F23570`, "Le service des impôts des entreprises (SIE) transmet automatiquement le numéro de TVA intracommunautaire à l'entreprise au moment de son immatriculation.", "The business tax office (SIE) automatically sends the company its intra-EU VAT number when it registers."] }),
  E({ id: "fr-dpae", where: "FR", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR",
    form: "Déclaration préalable à l'embauche (DPAE)", title: ["Pre-hiring declaration for each employee (DPAE)", "每位员工的入职前申报（DPAE）"], agency: ["Urssaf", "法国社会保险费征收机构（Urssaf）"],
    how: ["Declared online to Urssaf for each new employee, before they start and no earlier than 8 days before. The first one also registers the company as an employer.", "每位新员工上岗前、最早提前 8 天向 Urssaf 在线申报。首次申报同时将公司登记为雇主。"], url: "https://www.urssaf.fr",
    proof: [`${SPE}/F23107`, "au plus tôt dans les 8 jours précédant la date de l’embauche", "no earlier than 8 days before the hiring date"] }),
  E({ id: "fr-ddpp", where: "FR", level: "county", segs: ["restaurant", "retail"], needs: { food: true }, method: "online", order: 74, cur: "EUR",
    form: "Déclaration de manipulation de denrées alimentaires d'origine animale (Cerfa 13984)", title: ["Food establishment declaration to the DDPP", "向省级民众保护局（DDPP）申报食品经营场所"],
    agency: ["Direction départementale de la protection des populations (DDPP)", "省级民众保护局（DDPP）"],
    how: ["Declared before opening, online or by post, by any shop or restaurant that handles food of animal origin (milk, eggs, meat) for consumers; the DDPP then schedules its inspections.", "凡为消费者处理动物源性食品（奶、蛋、肉）的门店或餐厅，须在开业前在线或邮寄申报；DDPP 随后安排检查。"],
    url: "https://mesdemarches.agriculture.gouv.fr",
    proof: [FR_BAR, "Une déclaration doit être effectuée pour toute activité manipulant des denrées d'origine animale destinées à des consommateurs.", "A declaration must be made for any business handling food of animal origin intended for consumers."] }),
  E({ id: "fr-hygiene-training", where: "FR", level: "county", segs: ["restaurant"], needs: { food: true }, method: "none", order: 73, cur: "EUR",
    form: "Formation à l'hygiène alimentaire", title: ["Food hygiene training (the operator and at least one staff member)", "食品卫生培训（经营者及至少一名员工）"], agency: ["Direction départementale de la protection des populations (DDPP)", "省级民众保护局（DDPP）"],
    how: ["Nothing to file: the operator and at least one staff member complete food hygiene training, which the DDPP checks at inspection.", "无需申报：经营者及至少一名员工须完成食品卫生培训，DDPP 检查时核查。"], url: FR_BAR,
    proof: [FR_BAR, "Formation aux règles d'hygiène alimentaire (l'exploitant et au moins un membre du personnel).", "Training in food hygiene rules (the operator and at least one staff member)."] }),
  E({ id: "fr-erp", where: "FR", level: "city", segs: STORES, needs: { buildout: true }, except: ["FR-PAR"], method: "pdf_mail", order: 65, cur: "EUR",
    form: "Demande d'autorisation de construire, d'aménager ou de modifier un ERP", title: ["Works permit for a shop open to the public (ERP), with the fire safety review", "公众场所（ERP）装修许可，含消防安全审查"], agency: FR_MAIRIE,
    how: ["Fitting out or changing a shop or restaurant open to the public is authorised by the mairie after the departmental safety and accessibility commission checks the fire and accessibility rules; the file goes to the mairie in 4 copies.", "装修或改造对公众开放的门店或餐厅，须经省级安全与无障碍委员会审查消防和无障碍规则后，由市镇政府批准；申请材料一式 4 份交市镇政府。"],
    url: FR_ERP,
    proof: [FR_ERP, "Les travaux sont autorisés par la mairie après vérification des règles d'accessibilité et de sécurité par la commission consultative départementale de sécurité et d'accessibilité", "The works are authorised by the mairie after the departmental safety and accessibility commission checks the accessibility and safety rules"] }),
  E({ id: "fr-licence", where: "FR", level: "city", segs: STORES, needs: { alcohol: true }, except: ["FR-PAR"], method: "pdf_mail", order: 71, cur: "EUR",
    form: "Déclaration d'ouverture d'un débit de boissons (Cerfa 11542)", title: ["Alcohol licence: opening declaration at the mairie", "酒类经营许可：向市镇政府提交开业申报"], agency: FR_MAIRIE,
    how: ["Any place selling alcohol holds a licence of the right category; the operator declares it at the mairie at least 15 days before opening and keeps the receipt as proof.", "凡售酒场所须持有相应类别的执照；经营者须在开业前至少 15 天向市镇政府申报，并保留回执作为证明。"],
    url: FR_LICENCE, takes: ["Declared at least 15 days before opening.", "开业前至少 15 天申报。"],
    proof: [FR_LICENCE, "Tout établissement qui vend de l’alcool à consommer sur place ou à emporter doit posséder une licence.", "Every establishment that sells alcohol to drink on site or to take away must hold a licence."] }),
  E({ id: "fr-permis-exploitation", where: "FR", level: "federal", segs: ["restaurant"], needs: { alcohol: true }, method: "in_person", order: 70, cur: "EUR",
    form: "Permis d'exploitation", title: ["Operating permit training for serving alcohol", "售酒经营许可培训（permis d'exploitation）"], agency: ["An approved training body", "经认可的培训机构"],
    how: ["A place serving alcohol on site needs the operator's permis d'exploitation, earned by a mandatory training course; the certificate goes with the licence declaration.", "现场供酒的场所须由经营者取得经营许可（permis d'exploitation），须参加强制培训；证书随执照申报一并提交。"], url: FR_LICENCE,
    proof: [FR_LICENCE, "Le permis d'exploitation est obtenu suite à une formation obligatoire", "The operating permit is obtained after a mandatory training course"] }),
  E({ id: "fr-terrasse", where: "FR", level: "city", segs: STORES, needs: { terrace: true }, except: ["FR-PAR"], method: "pdf_mail", order: 73, cur: "EUR",
    form: "Autorisation d'occupation temporaire (permis de stationnement)", title: ["Terrace permit on the pavement", "人行道露台许可"], agency: ["The mairie, or the préfecture", "市镇政府或省政府"],
    how: ["Tables on the pavement or a square need an authorisation to occupy public space: a permis de stationnement for an open terrace.", "在人行道或广场摆放桌椅须取得公共空间占用许可：开放式露台为 permis de stationnement。"], url: FR_BAR,
    proof: [FR_BAR, "Si vous souhaitez occuper une partie de l'espace public (trottoirs, places) pour votre bar ou restaurant, vous devez en demander l'autorisation", "If you want to use part of the public space (pavements, squares) for your bar or restaurant, you must apply for authorisation"] }),
  E({ id: "fr-eori", where: "FR", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "EUR",
    form: "Numéro EORI", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["Direction générale des douanes et droits indirects", "法国海关总署"],
    how: ["Requested online from French customs before the first import.", "首次进口前向法国海关在线申请。"], url: "https://www.douane.gouv.fr" }),
  /* Paris: the Préfecture de police and the Ville de Paris */
  E({ id: "fr-par-erp", where: "FR-PAR", level: "city", segs: STORES, needs: { buildout: true }, method: "online", order: 65, cur: "EUR",
    form: "Autorisation de travaux ERP (Paris)", title: ["Works permit for a shop open to the public (ERP), Paris", "巴黎公众场所（ERP）装修许可"], agency: ["Préfecture de police de Paris, with the Ville de Paris urban planning office", "巴黎警察局，及巴黎市城市规划局"],
    how: ["In Paris the fire safety and accessibility review of an ERP's works runs through the Préfecture de police; the file is lodged with the Ville de Paris's urban planning office (BASU).", "在巴黎，ERP 装修的消防与无障碍审查由巴黎警察局负责；申请材料交巴黎市城市规划局（BASU）。"],
    url: "https://www.prefecturedepolice.interieur.gouv.fr",
    proof: [FR_ERP, "Pour les démarches concernant des ERP à Paris, nous vous invitions à consulter le site internet de la préfecture de police", "For procedures about ERPs in Paris, we invite you to consult the Préfecture de police's website"] }),
  E({ id: "fr-par-licence", where: "FR-PAR", level: "city", segs: STORES, needs: { alcohol: true }, method: "pdf_mail", order: 71, cur: "EUR",
    form: "Déclaration d'ouverture d'un débit de boissons (Cerfa 11542)", title: ["Alcohol licence: opening declaration at the Préfecture de police", "酒类经营许可：向巴黎警察局提交开业申报"], agency: ["Préfecture de police de Paris", "巴黎警察局"],
    how: ["In Paris the alcohol licence is declared to the Préfecture de police, not the mairie, at least 15 days before opening, with the permis d'exploitation.", "在巴黎，酒类执照须向巴黎警察局而非市政府申报，须在开业前至少 15 天提交，并附经营许可证书。"],
    url: FR_LICENCE, takes: ["Declared at least 15 days before opening.", "开业前至少 15 天申报。"],
    proof: [FR_LICENCE, "Effectuer la déclaration préalable à la mairie (à Paris et en Alsace-Moselle auprès de la préfecture)", "Make the prior declaration at the mairie (in Paris and Alsace-Moselle, at the préfecture)"] }),
  E({ id: "fr-par-terrasse", where: "FR-PAR", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "EUR",
    form: "Demande de terrasse ou d'étalage", title: ["Terrace permit, Ville de Paris", "巴黎市露台许可"], agency: ["Ville de Paris", "巴黎市政府"],
    how: ["Applied for online on the Ville de Paris's terraces, displays and signs service, under the city's terrace rules.", "依照巴黎市露台规定，在巴黎市露台、陈列与招牌在线服务申请。"], url: "https://www.paris.fr/pages/terrasses-et-etalages-3516",
    proof: ["https://www.paris.fr/pages/terrasses-et-etalages-3516", "Pour cela, vous devez obtenir une autorisation de la Ville de Paris.", "For this, you must obtain an authorisation from the Ville de Paris."] }),
  E({ id: "fr-par-enseigne", where: "FR-PAR", level: "city", segs: PREMISES, needs: { signage: true }, method: "online", order: 66, cur: "EUR",
    form: "Demande d'enseigne", title: ["Shop sign permit, Ville de Paris", "巴黎市招牌许可"], agency: ["Ville de Paris, Direction de l'urbanisme", "巴黎市城市规划局"],
    how: ["Every permanent or temporary shop sign is applied for online on the Ville de Paris's terraces, displays and signs service.", "所有永久或临时招牌均须在巴黎市露台、陈列与招牌在线服务申请。"], url: "https://www.paris.fr/pages/enseignes-et-publicites-3514",
    proof: ["https://www.paris.fr/pages/enseignes-et-publicites-3514", "Toutes les demandes d'enseignes (permanentes ou temporaires) doivent désormais être effectuées via le téléservice", "All sign applications (permanent or temporary) must now be made through the online service"] }),
  /* running it */
  E({ id: "fr-comptes", where: "FR", level: "federal", needs: { newEntity: true }, method: "online", order: 92, cur: "EUR",
    form: "Dépôt des comptes annuels", title: ["Annual accounts filed with the commercial court registry", "向商事法院书记处提交年度账目"], agency: ["Greffe du tribunal de commerce", "商事法院书记处"],
    how: ["After the yearly meeting approves the accounts, the manager files them with the registry, online on the one-stop formalities portal.", "年度会议批准账目后，由负责人在企业手续统一窗口在线提交书记处。"], url: "https://formalites.entreprises.gouv.fr", renews: ["Every year.", "每年一次。"],
    proof: [`${SPE}/F31214`, "Après la tenue de l'assemblée annuelle d'approbation des comptes, le dirigeant doit déposer les comptes annuels au greffe du tribunal du commerce.", "After the annual meeting approving the accounts, the manager must file the annual accounts with the commercial court registry."] }),
];

/* ------------------------------------------------------------------ Germany (Berlin; Hamburg, Munich and Frankfurt through their own offices) */
const SB = "https://service.berlin.de/dienstleistung";
const BER_FOOD = "https://www.berlin.de/ba-spandau/politik-und-verwaltung/aemter/ordnungsamt/veterinaer-und-lebensmittelueberwachung/lebensmittelaufsicht-bezirksamt-spandau-1344989.php";
const BER_BEZIRK = (en: string, zh: string): T => [`Bezirksamt (district office) for the address, ${en}`, `地址所属区政府${zh}`];

export const GERMANY_FORMS: OfficialForm[] = [
  E({ id: "de-gmbh", where: "DE", level: "federal", needs: { newEntity: true }, method: "in_person", order: 10, cur: "EUR",
    form: "Handelsregisteranmeldung (GmbH)", title: ["Commercial register entry for the GmbH", "有限责任公司（GmbH）商业登记"], agency: ["Local court (Registergericht), through a notary", "地方法院登记庭（经公证人提交）"],
    how: ["The articles are notarised and every managing director's signature on the application is certified by a notary, who files it electronically with the register court. The GmbH exists only once registered.", "公司章程须经公证，所有总经理在申请上的签名须经公证人认证，由公证人以电子方式提交登记法院。GmbH 自登记之日起成立。"],
    url: "https://www.handelsregister.de", feeNote: ["Notary and court fees depend on the share capital.", "公证费和法院费用视注册资本而定。"],
    specialist: ["A German notary (Notar) notarises the articles and files the registration: Placetta prepares the documents and hands them to one.", "须由德国公证人（Notar）公证章程并提交登记：快哉准备文件并交给公证人。"],
    foreign: ["A company formed abroad can register a German branch (Zweigniederlassung) instead, also through a notary.", "境外公司也可改为登记德国分支机构（Zweigniederlassung），同样须经公证人办理。"],
    proof: [`${SB}/327425/`, "Wenn Sie eine Gesellschaft mit beschränkter Haftung (GmbH) errichten wollen, müssen Sie diese zur Eintragung in das Handelsregister anmelden.", "If you want to set up a limited liability company (GmbH), you must apply to have it entered in the commercial register."] }),
  E({ id: "de-transparenz", where: "DE", level: "federal", needs: { newEntity: true }, method: "online", order: 15, cur: "EUR",
    form: "Transparenzregister", title: ["Transparency register (beneficial owners)", "透明登记（受益所有人）"], agency: ["Transparency register (Bundesanzeiger Verlag)", "透明登记处（联邦公报出版社）"],
    how: ["The company records its beneficial owners online.", "公司在线登记其受益所有人。"], url: "https://www.transparenzregister.de" }),
  E({ id: "de-steuer", where: "DE", level: "federal", method: "online", order: 25, cur: "EUR",
    form: "Fragebogen zur steuerlichen Erfassung", title: ["Tax registration questionnaire (tax number and VAT ID)", "税务登记问卷（税号与增值税号）"], agency: ["Finanzamt (tax office), through ELSTER", "税务局（通过 ELSTER）"],
    how: ["Filed online through ELSTER within a month of starting; the tax office then sends the tax number by post, and the VAT ID follows.", "开始经营后一个月内通过 ELSTER 在线提交；税务局随后邮寄税号，增值税号随后发放。"], url: "https://www.elster.de",
    takes: ["Due within a month of starting.", "开始经营后一个月内提交。"],
    proof: ["https://www.elster.de/elsterweb/infoseite/unternehmensgruendung", "Der Fragebogen muss innerhalb eines Monats nach Aufnahme Ihrer Tätigkeit unaufgefordert an Ihr zuständiges Finanzamt übermittelt werden.", "The questionnaire must be sent to your tax office, unprompted, within a month of starting your activity."] }),
  E({ id: "de-bg", where: "DE", level: "federal", method: "online", order: 27, cur: "EUR",
    form: "Anmeldung bei der Berufsgenossenschaft", title: ["Statutory accident insurance registration", "法定工伤保险登记"], agency: ["The trade's Berufsgenossenschaft (statutory accident insurer)", "所属行业的同业公会（法定工伤保险机构）"],
    how: ["Every new business registers within a week with its trade's statutory accident insurer, including companies based abroad with staff in Germany.", "所有新企业须在一周内向所属行业的法定工伤保险机构登记，包括在德国雇有员工的境外公司。"], url: "https://www.dguv.de/de/versicherung/unternehmensnummer/anmeldung/index.jsp",
    takes: ["Due within a week of opening.", "开业后一周内登记。"],
    proof: [`${SB}/293946/`, "Wer ein neues Unternehmen eröffnet, muss dieses binnen einer Woche beim zuständigen Unfallversicherungsträger anmelden.", "Anyone opening a new business must register it with the responsible accident insurer within a week."] }),
  E({ id: "de-betriebsnummer", where: "DE", level: "federal", needs: { employees: true }, method: "online", order: 60, cur: "EUR",
    form: "Betriebsnummer", title: ["Employer number for social insurance (Betriebsnummer)", "社会保险雇主编号（Betriebsnummer）"], agency: ["Bundesagentur für Arbeit, Betriebsnummern-Service", "德国联邦劳动局雇主编号服务"],
    how: ["Applied for online before the first employee starts; payroll reports to social insurance carry it.", "首位员工入职前在线申请；向社会保险的工资申报须使用该编号。"], url: "https://www.arbeitsagentur.de/unternehmen/betriebsnummern-service",
    proof: ["https://www.arbeitsagentur.de/unternehmen/betriebsnummern-service/alles-wichtige/beantragung", "Erst ab der Einstellung des ersten Beschäftigten unterliegen Arbeitgeberinnen und Arbeitgeber der Meldepflicht und benötigen eine Betriebsnummer.", "Employers are subject to the reporting duty, and need an employer number, from hiring their first employee."] }),
  E({ id: "de-eori", where: "DE", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true }, method: "online", order: 35, cur: "EUR",
    form: "EORI-Nummer", title: ["EORI number for importing", "进口用 EORI 号码"], agency: ["German customs (Zoll)", "德国海关"], how: ["Requested from German customs before the first import.", "首次进口前向德国海关申请。"], url: "https://www.zoll.de" }),
  /* Berlin: the district offices (Bezirksämter) */
  E({ id: "de-gewerbe-ber", where: "DE-BER", level: "city", method: "online", order: 20, cur: "EUR",
    form: "Gewerbeanmeldung", title: ["Trade registration (Gewerbeanmeldung)", "营业登记（Gewerbeanmeldung）"], agency: BER_BEZIRK("Ordnungsamt", "秩序局"),
    how: ["Every shop, restaurant and trading business registers its trade with the district's Ordnungsamt when it starts, online or in person; the office passes it to the tax office and the inspectors.", "所有门店、餐厅和贸易企业须在开业时向所在区秩序局办理营业登记，可在线或现场办理；该局会转告税务局和监管部门。"],
    url: `${SB}/121921/`, feeNote: ["A fee set by the district; lower when filed online.", "由区政府收取费用；在线办理费用较低。"],
    proof: [`${SB}/121921/`, "Die Gewerbeanmeldung ist gleichzeitig mit dem Beginn des Betriebs vorzunehmen.", "The trade must be registered at the same time as the business starts."] }),
  E({ id: "de-ber-food", where: "DE-BER", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { food: true }, method: "pdf_mail", order: 74, cur: "EUR",
    form: "Meldung eines Lebensmittelbetriebes (Art. 6 VO (EG) 852/2004)", title: ["Food business registration", "食品企业登记"], agency: BER_BEZIRK("Veterinär- und Lebensmittelaufsicht", "兽医与食品监督部门"),
    how: ["Each food business registers its premises with the district's veterinary and food inspection office on the registration form under Article 6 of Regulation (EC) 852/2004, before it opens.", "每家食品企业须在开业前，以依据第 852/2004 号法规第 6 条的登记表，向所在区兽医与食品监督部门登记其场所。"], url: BER_FOOD,
    proof: [BER_FOOD, "Meldung eines Lebensmittelbetriebes nach Artikel 6 der Verordnung (EG) Nr. 852/2004 über Lebensmittelhygiene", "Registration of a food business under Article 6 of Regulation (EC) No 852/2004 on food hygiene"] }),
  E({ id: "de-ber-ifsg", where: "DE-BER", level: "city", segs: ["restaurant", "retail"], needs: { food: true }, method: "in_person", order: 64, cur: "EUR",
    form: "Belehrung nach § 43 Infektionsschutzgesetz", title: ["Infection protection instruction certificate for food staff", "食品从业人员传染病防护培训证明"], agency: BER_BEZIRK("Gesundheitsamt", "卫生局"),
    how: ["Everyone who will prepare or sell food takes the health office's instruction and gets the certificate before starting work.", "所有将从事食品制作或销售的人员，须在上岗前参加卫生局的培训并取得证明。"], url: `${SB}/324295/`,
    proof: [`${SB}/324295/`, "Wenn Sie im Bereich der Lebensmittelzubereitung, des Lebensmittelverkaufs oder in der Gastronomie tätig werden wollen, benötigen Sie eine Bescheinigung.", "If you want to work in food preparation, food sales or hospitality, you need a certificate."] }),
  E({ id: "de-ber-gaststaette", where: "DE-BER", level: "city", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "EUR",
    form: "Gaststättenerlaubnis", title: ["Restaurant licence for serving alcohol (Gaststättenerlaubnis)", "餐饮售酒许可（Gaststättenerlaubnis）"], agency: BER_BEZIRK("Ordnungsamt", "秩序局"),
    how: ["Serving alcohol on the premises needs the district's restaurant licence for that kind of business and those rooms; without alcohol, no licence is needed.", "在场所内供应酒类须取得区政府针对该经营类型及场所的餐饮许可；不供应酒类则无需此许可。"], url: `${SB}/327483/`,
    feeNote: ["The district sends a fee notice with the licence.", "区政府随许可寄送收费通知。"],
    proof: [`${SB}/327483/`, "Wenn Sie ein Gaststättengewerbe mit Alkoholausschank betreiben wollen, benötigen Sie grundsätzlich eine Erlaubnis für Ihr Gaststättengewerbe (Gaststättenerlaubnis).", "If you want to run a restaurant business serving alcohol, you generally need a permit for it (Gaststättenerlaubnis)."] }),
  E({ id: "de-ber-bau", where: "DE-BER", level: "city", segs: PREMISES, needs: { buildout: true }, method: "online", order: 50, cur: "EUR",
    form: "Baugenehmigung (vereinfachtes Verfahren)", title: ["Building permit for works or a change of use", "施工或变更用途的建筑许可"], agency: BER_BEZIRK("Stadtentwicklungsamt, Bau- und Wohnungsaufsicht", "城市发展局建筑与住房监督部门"),
    how: ["Works that aren't exempt, or turning a shop into a restaurant, need the district building office's permit, which reviews fire safety too; it is filed online.", "非豁免工程，或将商店改为餐厅，须取得区建筑监督部门的许可，消防安全也在审查之列；在线提交。"], url: `${SB}/350893/`,
    proof: [`${SB}/350893/`, "wenn Sie Anlagen errichten und/oder ändern und/oder deren Nutzung ändern möchten und diese Anlagen nicht verfahrensfrei sind.", "if you want to build or alter structures, or change their use, and the structures are not exempt from the procedure."] }),
  E({ id: "de-ber-werbeanlage", where: "DE-BER", level: "city", segs: PREMISES, needs: { signage: true }, method: "online", order: 66, cur: "EUR",
    form: "Baugenehmigung für Werbeanlagen", title: ["Permit for the shop sign (Werbeanlage)", "门店招牌许可（Werbeanlage）"], agency: BER_BEZIRK("Stadtentwicklungsamt, Bau- und Wohnungsaufsicht", "城市发展局建筑与住房监督部门"),
    how: ["A sign that isn't exempt needs the district building office's simplified permit, filed online.", "非豁免招牌须向区建筑监督部门在线申请简化许可。"], url: `${SB}/350896/`,
    proof: [`${SB}/350896/`, "Der Antrag für eine vereinfachte Baugenehmigung ist erforderlich, wenn Sie Werbeanlagen errichten und/oder ändern möchten und diese Werbeanlagen nicht verfahrensfrei sind.", "A simplified building permit is required if you want to put up or alter signs that are not exempt from the procedure."] }),
  E({ id: "de-ber-terrasse", where: "DE-BER", level: "city", segs: STORES, needs: { terrace: true }, method: "online", order: 73, cur: "EUR",
    form: "Sondernutzungserlaubnis (Tische und Stühle)", title: ["Street use permit for tables and chairs outside", "街道特别使用许可（户外桌椅）"], agency: BER_BEZIRK("Straßen- und Grünflächenamt", "道路与绿地局"),
    how: ["Tables and chairs on the pavement in front of the shop are a special use of the street, applied for with the district's roads office, online.", "在店前人行道摆放桌椅属于街道特别使用，须向区道路部门在线申请。"], url: `${SB}/326864/`,
    proof: [`${SB}/326864/`, "wie das Herausstellen von Tischen und Stühlen (Schankvorgarten) vor eigenen Geschäftsräumen einschränkt, handelt es sich dabei um eine Sondernutzung.", "such as putting tables and chairs (an outdoor seating area) in front of your own premises, is a special use."] }),
  /* Munich, Hamburg and Frankfurt: the trade registration with the city's own office; the library has no quote of
     their pages yet, so these rows name the office and its site */
  ...([["DE-MUC", "Munich", "慕尼黑", "https://stadt.muenchen.de", "Landeshauptstadt München, Kreisverwaltungsreferat", "慕尼黑市行政管理局"],
    ["DE-HAM", "Hamburg", "汉堡", "https://www.hamburg.de", "Freie und Hansestadt Hamburg, Bezirksamt", "汉堡市区政府"],
    ["DE-FRA", "Frankfurt", "法兰克福", "https://frankfurt.de", "Stadt Frankfurt am Main, Ordnungsamt", "法兰克福市秩序局"]] as const)
    .map(([where, en, zh, url, aen, azh]) => E({ id: "de-gewerbe-" + where.slice(3).toLowerCase(), where, level: "city", method: "online", order: 20, cur: "EUR",
      form: "Gewerbeanmeldung", title: ["Trade registration (Gewerbeanmeldung)", "营业登记（Gewerbeanmeldung）"], agency: [aen, azh],
      how: [`Every shop, restaurant and trading business registers its trade with ${en}'s trade office when it starts.`, `所有门店、餐厅和贸易企业开业时须在${zh}营业登记部门办理营业登记。`], url })),
];

export const EUROPE_FORMS: OfficialForm[] = [...UK_FORMS, ...EU_FORMS, ...FRANCE_FORMS, ...GERMANY_FORMS];
