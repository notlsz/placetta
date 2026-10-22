// Countries added in the coverage audit of 2026-10-22 (docs/COVERAGE.md): Canada first, with Ontario and Toronto,
// British Columbia and Vancouver. Same rules as src/forms/europe.ts: a proof is a sentence of under 25 words copied from
// the government's own page, with the URL and the day it was read; an entry whose official page couldn't be read has no
// proof (UNVERIFIED in docs/COVERAGE.md), so its plan row abstains and names the office, and no fee is stated for it.
//
// Canada's country code is "CA", which is also California's. The registry keeps them apart by currency (a Canadian
// entry is priced in CAD, so src/forms/registry.ts usFormAbroad never lets it into a US plan, nor a California entry into
// a Canadian one), as it does for Delaware and Germany ("DE"). Provinces are "CA-ON" and "CA-BC", cities "CA-TOR" and
// "CA-VAN" (src/forms/world.ts).
import type { OfficialForm, Segment } from "./registry";
import { E } from "./europe";

const PREMISES: Segment[] = ["restaurant", "retail", "warehouse"];
const CRA_BN = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/business-registration/business-number-program-account/how-register.html";
const CRA_GST = "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html";
const ISED = "https://ised-isde.canada.ca/cc/lgcy/index.html";
const ISED_PROV = "https://ised-isde.canada.ca/site/corporations-canada/en/business-corporations/provincial-registration-federal-business-corporations";
const SFC = "https://www.canada.ca/en/food-inspection-agency/news/2018/12/safe-food-for-canadians-licences-now-available-for-food-businesses.html";
const SFC_ACT = "https://inspection.canada.ca/en/food-licences/food-business-activities";
const ON_FEES = "https://www.ontario.ca/page/cost-time-required-to-register-change-search-for-business-name-corporation-not-for-profit";
const WSIB = "https://www.wsib.ca/en/businesses/registration-and-coverage/questions-and-answers-registration";
const AGCO = "https://www.agco.ca/en/alcohol/apply-liquor-sales-licence";
const TOR_EAT = "https://www.toronto.ca/services-payments/permits-licences-bylaws/restaurants-cafes-grocery-variety-and-retail-stores-selling-food/eating-or-drinking-establishment/";
const BC_PST = "https://www2.gov.bc.ca/gov/content/taxes/sales-taxes/pst/register";
const WSBC = "https://www.worksafebc.com/en/for-employers/small-businesses/getting-started";
const VCH = "https://www.vch.ca/en/service/food-service-permits-and-health-approvals";
const BC_LIQ = "https://www2.gov.bc.ca/gov/content/employment-business/business/liquor-regulation-licensing/liquor-licence-permits";

export const CANADA_FORMS: OfficialForm[] = [
  /* ------------------------------------------------------------------ federal */
  E({ id: "ca-ised-incorporate", where: "CA", level: "federal", needs: { newEntity: true }, method: "online", order: 10, cur: "CAD", fee: 200,
    form: "Articles of incorporation (Canada Business Corporations Act)", title: ["Federal incorporation with Corporations Canada", "向加拿大联邦公司局（Corporations Canada）注册联邦公司"],
    agency: ["Corporations Canada (Innovation, Science and Economic Development Canada)", "加拿大创新、科学与经济发展部联邦公司局"],
    how: ["Filed online at Corporations Canada's Online Filing Centre after the filer verifies their identity. A federal corporation then registers in each province where it does business (in Ontario, at the same time, through the joint online system). A company can incorporate in a province instead.", "在联邦公司局在线申报中心提交（申报人须先完成身份验证）。联邦公司还须在其经营所在的每个省登记（安大略省可通过联合在线系统同时办理）。也可改为在省级注册公司。"],
    url: ISED, takes: ["Express service gives a decision within four business hours.", "加急服务可在四个工作小时内作出决定。"],
    proof: [ISED, "Incorporate ($200)"] }),
  E({ id: "ca-cra-bn", where: "CA", level: "federal", method: "online", order: 20, cur: "CAD", fee: 0,
    form: "Business number (BN) and CRA program accounts (Business Registration Online, or Form RC1)", title: ["Business number and tax accounts with the Canada Revenue Agency", "向加拿大税务局（CRA）申请商业号码及税务账户"],
    agency: ["Canada Revenue Agency", "加拿大税务局（CRA）"],
    how: ["The business number is the federal tax identifier; the GST/HST, payroll (RP) and import-export (RM) accounts hang off it. Residents register online; a non-resident registers by phone or on Form RC1.", "商业号码是联邦税务识别号，GST/HST、工资（RP）和进出口（RM）账户均以其为基础。居民可在线登记；非居民须致电或以 RC1 表登记。"],
    url: CRA_BN,
    proof: [CRA_BN, "Find out how to register for a business number (BN) and Canada Revenue Agency (CRA) program accounts for your business."] }),
  E({ id: "ca-cra-gst", where: "CA", level: "federal", method: "online", order: 21, cur: "CAD", fee: 0,
    form: "GST/HST registration (RT program account)", title: ["GST/HST registration", "商品及服务税/统一销售税（GST/HST）登记"],
    agency: ["Canada Revenue Agency", "加拿大税务局（CRA）"],
    how: ["A business stops being a small supplier once its taxable sales pass $30,000 in a calendar quarter or over four consecutive quarters, and must then register and charge GST/HST. Registering earlier is allowed.", "企业在一个日历季度或连续四个季度内应税销售额超过 30,000 加元，即不再属于小供应商，须登记并收取 GST/HST。也可提前自愿登记。"],
    url: CRA_GST,
    proof: [CRA_GST, "You are no longer a small supplier and have to charge GST/HST on the supply that made you exceed $30,000 within the calendar quarter."] }),
  E({ id: "ca-cfia-sfc", where: "CA", level: "federal", segs: ["seller", "warehouse", "retail"], needs: { imports: true, food: true }, method: "online", order: 45, cur: "CAD", fee: 250,
    form: "Safe Food for Canadians licence (My CFIA)", title: ["Safe Food for Canadians licence to import food", "加拿大食品安全进口许可（SFC 许可）"],
    agency: ["Canadian Food Inspection Agency (CFIA)", "加拿大食品检验局（CFIA）"],
    how: ["A business that imports food, or makes, processes, packages or labels food for trade across provinces or for export, applies online in My CFIA. Restaurants and shops that only sell within their province don't need it.", "进口食品，或为跨省贸易或出口而生产、加工、包装或贴标食品的企业，须在 My CFIA 在线申请。只在本省销售的餐厅和商店无需办理。"],
    url: SFC_ACT, renews: ["Valid for two years.", "有效期两年。"],
    proof: [SFC, "A Safe Food for Canadians licence costs $250."] }),

  /* ------------------------------------------------------------------ Ontario and Toronto */
  E({ id: "ca-on-extra-provincial", where: "CA-ON", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "CAD",
    form: "Form 2, Extra-Provincial Corporations Initial Return (Ontario Business Registry)", title: ["Registration in Ontario of a corporation formed elsewhere", "外省（外国）公司在安大略省登记"],
    agency: ["Ontario Ministry of Public and Business Service Delivery (Ontario Business Registry)", "安大略省公共与商业服务部（安大略商业登记处）"],
    how: ["A federal or other-province corporation files Form 2 in the Ontario Business Registry; a corporation formed outside Canada first needs an extra-provincial licence ($330).", "联邦公司或外省公司在安大略商业登记处提交 Form 2；在加拿大境外成立的公司须先取得外省经营许可（330 加元）。"],
    url: ON_FEES, feeNote: ["$330 for the extra-provincial licence of a corporation from outside Canada.", "加拿大境外公司的外省经营许可费为 330 加元。"],
    proof: [ISED_PROV, "Corporations are required to register in the provinces in which they will conduct business."] }),
  E({ id: "ca-on-wsib", where: "CA-ON", level: "state", needs: { employees: true }, method: "online", order: 61, cur: "CAD",
    form: "WSIB employer registration", title: ["Workplace insurance registration (WSIB)", "安大略省工伤保险登记（WSIB）"],
    agency: ["Workplace Safety and Insurance Board (WSIB)", "安大略省工作场所安全与保险委员会（WSIB）"],
    how: ["Most businesses register with the WSIB within 10 calendar days of hiring their first employee.", "大多数企业须在雇用首位员工后 10 个日历日内向 WSIB 登记。"],
    url: WSIB, takes: ["Within 10 calendar days of the first hire.", "首位员工入职后 10 个日历日内。"],
    proof: [WSIB, "By law, most businesses need to register with the WSIB within 10 calendar days of hiring their first employee."] }),
  E({ id: "ca-on-agco", where: "CA-ON", level: "state", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "CAD", fee: 1055,
    form: "Liquor sales licence (iAGCO)", title: ["Liquor sales licence", "酒类销售许可"],
    agency: ["Alcohol and Gaming Commission of Ontario (AGCO)", "安大略省酒类与博彩委员会（AGCO）"],
    how: ["The business owner applies in iAGCO, with letters from the municipality, fire, building and health agencies; a new application is published for public notice.", "由企业所有人在 iAGCO 申请，附市政、消防、建筑和卫生机构的函件；新申请须公示。"],
    url: AGCO, feeNote: ["$1,055 for a 2-year term or $1,355 for 4 years (new application with public notice).", "两年期 1,055 加元，四年期 1,355 加元（需公示的新申请）。"], renews: ["Every 2 or 4 years.", "每 2 年或 4 年。"],
    proof: [AGCO, "As the owner (or representative) of the business, you must apply for the liquor sales licence."] }),
  E({ id: "ca-on-food-handler", where: "CA-ON", level: "state", segs: ["restaurant"], needs: { food: true }, method: "online", order: 40, cur: "CAD",
    form: "Certified food handler (O. Reg. 493/17, Food Premises)", title: ["A certified food handler on site", "店内须有持证食品从业人员"],
    agency: ["Ontario Ministry of Health (taught and examined by the local public health unit; in Toronto, Toronto Public Health)", "安大略省卫生部（由当地公共卫生机构授课和考试，多伦多为多伦多公共卫生局）"],
    how: ["Every food service premises has at least one certified food handler or supervisor on site whenever it is open.", "每家餐饮服务场所营业期间须至少有一名持证食品从业人员或主管在场。"],
    url: "https://www.ontario.ca/laws/regulation/170493",
    lead: "https://www.healthunit.com/businesses/food-businesses/food-handler-certification/" }),
  E({ id: "ca-tor-eating", where: "CA-TOR", level: "city", segs: ["restaurant"], method: "online", order: 75, cur: "CAD", fee: 536.64,
    form: "Eating or Drinking Establishment licence", title: ["Eating or drinking establishment licence", "餐饮场所营业执照"],
    agency: ["City of Toronto, Municipal Licensing and Standards", "多伦多市政许可与标准局"],
    how: ["Applied for online with Municipal Licensing and Standards; the application fee is due with the application and the licence fee on approval. The city's zoning must allow the use.", "向市政许可与标准局在线申请；申请费随申请缴纳，执照费在批准后缴纳。场所须符合城市分区用途。"],
    url: TOR_EAT, feeNote: ["$268.32 application fee plus $268.32 licence fee.", "申请费 268.32 加元，另加执照费 268.32 加元。"], renews: ["Every year.", "每年。"],
    proof: [TOR_EAT, "Application fee: $268.32"] }),

  /* ------------------------------------------------------------------ British Columbia and Vancouver */
  E({ id: "ca-bc-pst", where: "CA-BC", level: "state", segs: ["restaurant", "retail", "seller"], method: "online", order: 22, cur: "CAD", fee: 0,
    form: "PST registration (eTaxBC)", title: ["Provincial sales tax (PST) registration", "省销售税（PST）登记"],
    agency: ["Government of British Columbia, Ministry of Finance", "不列颠哥伦比亚省财政部"],
    how: ["A business in B.C. that sells or leases taxable goods (liquor and prepared food included) registers to collect PST before it starts.", "在不列颠哥伦比亚省销售或租赁应税商品（包括酒类和预制食品）的企业，须在开始前登记以代收 PST。"],
    url: BC_PST,
    proof: [BC_PST, "You must register to collect PST if you're located in B.C. and you sell or lease taxable goods,"] }),
  E({ id: "ca-bc-worksafe", where: "CA-BC", level: "state", needs: { employees: true }, method: "online", order: 61, cur: "CAD",
    form: "WorkSafeBC employer registration", title: ["Workers' compensation registration (WorkSafeBC)", "工伤保险登记（WorkSafeBC）"],
    agency: ["WorkSafeBC", "不列颠哥伦比亚省工伤保险局（WorkSafeBC）"],
    how: ["A business that hires one or more employees, full-time, part-time, casual or on contract, registers for WorkSafeBC coverage.", "雇用一名以上员工（全职、兼职、临时或合同）的企业，须登记 WorkSafeBC 保险。"],
    url: WSBC,
    proof: [WSBC, "You’re required to register for WorkSafeBC insurance coverage if you own a business that hires one or more employees"] }),
  E({ id: "ca-bc-vch-plan", where: "CA-VAN", level: "city", segs: ["restaurant"], needs: { buildout: true }, method: "online", order: 50, cur: "CAD",
    form: "Floor plan review and health approval", title: ["Food premises plan review and health approval", "食品场所图纸审查与卫生许可"],
    agency: ["Vancouver Coastal Health, Environmental Health", "温哥华沿岸卫生局环境卫生处"],
    how: ["Vancouver Coastal Health reviews and approves the floor plans before construction, inspects the finished premises, then issues the health approval to operate.", "温哥华沿岸卫生局在施工前审查并批准图纸，完工后检查场所，然后发放经营卫生许可。"],
    url: VCH,
    proof: [VCH, "Floor plans must be reviewed and approved by VCH prior to the beginning of construction."] }),
  E({ id: "ca-bc-liquor", where: "CA-BC", level: "state", segs: ["restaurant"], needs: { alcohol: true }, method: "online", order: 71, cur: "CAD",
    form: "Food-primary liquor licence", title: ["Liquor licence for a restaurant", "餐厅酒类许可"],
    agency: ["B.C. Liquor and Cannabis Regulation Branch", "不列颠哥伦比亚省酒类与大麻监管处"],
    how: ["A restaurant whose main business is food applies to the Liquor and Cannabis Regulation Branch for a food-primary licence; local government comments on the application.", "以食品为主营的餐厅须向酒类与大麻监管处申请以食品为主的酒类许可，当地政府会对申请提出意见。"],
    url: BC_LIQ }),
  E({ id: "ca-van-business-licence", where: "CA-VAN", level: "city", segs: PREMISES, method: "online", order: 55, cur: "CAD",
    form: "Business licence", title: ["City of Vancouver business licence", "温哥华市营业执照"],
    agency: ["City of Vancouver, Licensing", "温哥华市政府许可部门"],
    how: ["A business operating in Vancouver holds a city business licence, renewed every year.", "在温哥华经营的企业须持有市营业执照，每年续期。"],
    url: "https://vancouver.ca/doing-business/business-licences.aspx" }),
];

/* ------------------------------------------------------------------ South America, Southeast Asia, Africa */
// The national core first (the company, the tax number, VAT where a threshold was read) and one city's licence where its
// page could be read. Depth tapers here by design (docs/COVERAGE.md lists what's still missing). Most of these
// governments' portals are built in script or refuse automated reads, so most rows are UNVERIFIED: they name the office
// and link its own site, and state no fee.
type T = readonly [string, string];
type Core = { id: string; where: string; cur: string; level?: "federal" | "city"; segs?: Segment[]; needs?: OfficialForm["needs"]; order: number; method?: OfficialForm["method"];
  form: string; title: T; agency: T; how: T; url: string; proof?: readonly [string, string, string?]; specialist?: T };
const N = (c: Core): OfficialForm => E({ id: c.id, where: c.where, level: c.level ?? "federal", segs: c.segs, needs: c.needs, method: c.method ?? "online", order: c.order, cur: c.cur,
  form: c.form, title: c.title, agency: c.agency, how: c.how, url: c.url, ...(c.proof ? { proof: c.proof } : {}), ...(c.specialist ? { specialist: c.specialist } : {}) });
const COMPANY: T = ["Company registration", "公司注册"];
const TAXNO: T = ["Tax registration number", "税务登记号"];
const LOCAL_SPECIALIST: T = ["A local lawyer, notary or accountant usually files this for a foreign-owned company. Placetta prepares the documents and hands them over.", "外资公司通常由当地律师、公证人或会计师办理。快哉准备文件并交给对方。"];

export const WORLD_GAPS: OfficialForm[] = [
  // Brazil
  N({ id: "br-redesim-cnpj", where: "BR", cur: "BRL", order: 10, needs: { newEntity: true }, form: "Abertura de empresa e inscrição no CNPJ (Redesim)", title: ["Company opening and federal tax number (CNPJ) through Redesim", "通过 Redesim 开办公司并取得联邦税号（CNPJ）"],
    agency: ["Receita Federal and the state Junta Comercial, through Redesim", "联邦税务局与州商业登记处（经 Redesim）"], url: "https://www.gov.br/empresas-e-negocios/pt-br/redesim",
    how: ["The company is registered with the state commercial board and the federal tax number (CNPJ) issued in one Redesim process; municipal licences follow.", "在一个 Redesim 流程中完成州商业登记并取得联邦税号（CNPJ），随后办理市级许可。"], specialist: LOCAL_SPECIALIST }),
  N({ id: "br-anvisa", where: "BR", cur: "BRL", order: 45, segs: ["seller", "warehouse"], needs: { food: true, imports: true }, form: "Regularização de alimentos (ANVISA)", title: ["Food product regularisation with ANVISA", "向巴西国家卫生监督局（ANVISA）办理食品合规"],
    agency: ["Agência Nacional de Vigilância Sanitária (ANVISA)", "巴西国家卫生监督局（ANVISA）"], url: "https://www.gov.br/anvisa/pt-br",
    how: ["Imported food products are regularised with ANVISA (notified or registered, by category) before they are sold.", "进口食品须在销售前向 ANVISA 办理合规（按类别备案或注册）。"] }),
  // Chile
  N({ id: "cl-empresa", where: "CL", cur: "CLP", order: 10, needs: { newEntity: true }, form: "Constitución en el Registro de Empresas y Sociedades (Tu Empresa en un Día)", title: COMPANY,
    agency: ["Ministerio de Economía, Registro de Empresas y Sociedades", "智利经济部企业与公司登记处"], url: "https://www.registrodeempresasysociedades.cl/",
    how: ["A company is formed online in the Registro de Empresas y Sociedades (the one-day company system).", "在企业与公司登记处（一日开办公司系统）在线设立公司。"] }),
  N({ id: "cl-sii-inicio", where: "CL", cur: "CLP", order: 20, form: "Inicio de actividades (SII)", title: ["Start of activities with the tax service (SII)", "向税务局（SII）申报开始经营"],
    agency: ["Servicio de Impuestos Internos (SII)", "智利国内税务局（SII）"], url: "https://www.sii.cl/servicios_online/1039-1182.html",
    how: ["The business declares the start of its activities to the SII, which sets its tax obligations, VAT included.", "企业须向 SII 申报开始经营，由其确定包括增值税在内的纳税义务。"] }),
  // Colombia
  N({ id: "co-rut", where: "CO", cur: "COP", order: 20, form: "Registro Único Tributario (RUT)", title: TAXNO,
    agency: ["Dirección de Impuestos y Aduanas Nacionales (DIAN)", "哥伦比亚国家税务与海关局（DIAN）"], url: "https://www.dian.gov.co/",
    how: ["Every business registers in the RUT with the DIAN; a company's RUT is usually opened with its commercial registration.", "每家企业须在 DIAN 登记 RUT；公司的 RUT 通常与商业登记一并办理。"] }),
  N({ id: "co-registro-mercantil", where: "CO", cur: "COP", order: 10, needs: { newEntity: true }, form: "Matrícula mercantil", title: ["Commercial registration with the chamber of commerce", "在商会办理商业登记"],
    agency: ["The chamber of commerce for the address (in Bogotá, the Cámara de Comercio de Bogotá)", "所在地商会（波哥大为波哥大商会）"], url: "https://www.ccb.org.co/",
    how: ["Companies and establishments register in the commercial register kept by the local chamber of commerce and renew it every year.", "公司和经营场所须在当地商会登记商业注册，并每年续期。"] }),
  // Argentina
  N({ id: "ar-igj", where: "AR", cur: "ARS", order: 10, needs: { newEntity: true }, method: "in_person", form: "Inscripción de sociedad (IGJ)", title: ["Company registration (Buenos Aires: the IGJ)", "公司注册（布宜诺斯艾利斯：司法监察总局）"],
    agency: ["Inspección General de Justicia (IGJ), for companies domiciled in the City of Buenos Aires", "司法监察总局（IGJ），适用于住所在布宜诺斯艾利斯市的公司"], url: "https://www.argentina.gob.ar/justicia/igj",
    how: ["A company domiciled in the City of Buenos Aires is registered with the IGJ; elsewhere, with the province's registry.", "住所在布宜诺斯艾利斯市的公司在 IGJ 注册；其他地区则在所在省的登记机构注册。"], specialist: LOCAL_SPECIALIST,
    proof: ["https://www.argentina.gob.ar/justicia/igj", "Inscribimos y fiscalizamos a las sociedades comerciales y a las entidades civiles con domicilio legal en la Ciudad Autónoma de Buenos Aires,", "We register and supervise the commercial companies and civil entities with legal domicile in the Autonomous City of Buenos Aires,"] }),
  N({ id: "ar-cuit", where: "AR", cur: "ARS", order: 20, form: "Clave Única de Identificación Tributaria (CUIT)", title: TAXNO,
    agency: ["Agencia de Recaudación y Control Aduanero (ARCA, formerly AFIP)", "阿根廷税收与海关监管局（ARCA，原 AFIP）"], url: "https://www.arca.gob.ar/",
    how: ["The company gets its CUIT and registers for its taxes with ARCA.", "公司须向 ARCA 取得 CUIT 并登记各项税种。"] }),
  // Peru
  N({ id: "pe-ruc", where: "PE", cur: "PEN", order: 20, form: "Registro Único de Contribuyentes (RUC)", title: TAXNO,
    agency: ["Superintendencia Nacional de Aduanas y de Administración Tributaria (SUNAT)", "秘鲁国家海关与税务管理局（SUNAT）"], url: "https://www.sunat.gob.pe/",
    how: ["Every business registers in the RUC with SUNAT before it starts operating.", "每家企业须在开业前向 SUNAT 登记 RUC。"] }),
  // Singapore
  N({ id: "sg-acra", where: "SG", cur: "SGD", order: 10, needs: { newEntity: true }, form: "Registration of a local company (Bizfile)", title: ["Company registration with ACRA (Bizfile)", "通过 Bizfile 向会计与企业管制局（ACRA）注册公司"],
    agency: ["Accounting and Corporate Regulatory Authority (ACRA)", "新加坡会计与企业管制局（ACRA）"], url: "https://www.acra.gov.sg/how-to-guides/setting-up-a-local-company",
    how: ["The name is reserved first; the person who reserved it, or a corporate service provider, registers the company on Bizfile.", "须先预留名称；由预留名称者或企业服务商在 Bizfile 注册公司。"],
    proof: ["https://www.acra.gov.sg/register/business/registering-different-business-structures/local-company/registering-via-bizfile", "Only the person who reserved the company name can register."] }),
  N({ id: "sg-gst", where: "SG", cur: "SGD", order: 21, form: "GST registration", title: ["GST registration", "商品及服务税（GST）登记"],
    agency: ["Inland Revenue Authority of Singapore (IRAS)", "新加坡国内税务局（IRAS）"], url: "https://www.iras.gov.sg/",
    how: ["A business registers for GST with IRAS once its taxable turnover passes the registration threshold.", "企业应税营业额超过登记门槛后，须向 IRAS 登记 GST。"] }),
  N({ id: "sg-sfa-food-shop", where: "SG", cur: "SGD", order: 75, segs: ["restaurant"], needs: { food: true }, form: "Food shop licence (GoBusiness)", title: ["Food shop licence", "食品店执照"],
    agency: ["Singapore Food Agency (SFA)", "新加坡食品局（SFA）"], url: "https://www.sfa.gov.sg/",
    how: ["A restaurant, cafe or snack bar is licensed by the SFA, applied for through GoBusiness Licensing.", "餐厅、咖啡馆或小吃店须向 SFA 申领执照，经 GoBusiness 许可平台申请。"] }),
  // Malaysia
  N({ id: "my-ssm", where: "MY", cur: "MYR", order: 10, needs: { newEntity: true }, form: "Company incorporation (Companies Act 2016)", title: ["Company registration with SSM", "向马来西亚公司委员会（SSM）注册公司"],
    agency: ["Suruhanjaya Syarikat Malaysia (SSM)", "马来西亚公司委员会（SSM）"], url: "https://www.ssm.com.my/Pages/Home.aspx",
    how: ["A company is incorporated with SSM under the Companies Act 2016.", "公司须根据《2016 年公司法》向 SSM 注册成立。"] }),
  N({ id: "my-kul-licence", where: "MY-KUL", level: "city", cur: "MYR", order: 55, segs: ["restaurant", "retail"], form: "Lesen perniagaan (DBKL)", title: ["Kuala Lumpur business premises licence", "吉隆坡营业场所执照"],
    agency: ["Dewan Bandaraya Kuala Lumpur (DBKL)", "吉隆坡市政局（DBKL）"], url: "https://www.dbkl.gov.my/",
    how: ["A shop or restaurant in Kuala Lumpur holds a premises licence from the city hall.", "在吉隆坡经营的商店或餐厅须持有市政局发放的场所执照。"] }),
  // Thailand
  N({ id: "th-dbd", where: "TH", cur: "THB", order: 10, needs: { newEntity: true }, form: "Company registration (DBD)", title: COMPANY,
    agency: ["Department of Business Development, Ministry of Commerce", "泰国商务部商业发展厅"], url: "https://www.dbd.go.th/en",
    how: ["A limited company is registered with the Department of Business Development; a majority foreign-owned company may also need a foreign business licence for its activity.", "有限公司须在商业发展厅注册；外资控股公司视经营活动可能还须取得外商经营许可。"], specialist: LOCAL_SPECIALIST }),
  N({ id: "th-vat", where: "TH", cur: "THB", order: 21, form: "VAT registration (Phor Por 01)", title: ["VAT registration", "增值税登记"],
    agency: ["The Revenue Department", "泰国税务厅"], url: "https://www.rd.go.th/english/6043.html",
    how: ["A business with annual turnover over 1.8 million baht registers for VAT.", "年营业额超过 180 万泰铢的企业须登记增值税。"],
    proof: ["https://www.rd.go.th/english/6043.html", "regularly supplies goods or provides services in Thailand and has an annual turnover exceeding 1.8 million baht is subject to VAT"] }),
  // Vietnam
  N({ id: "vn-erc", where: "VN", cur: "VND", order: 10, needs: { newEntity: true }, form: "Giấy chứng nhận đăng ký doanh nghiệp (Enterprise Registration Certificate)", title: ["Enterprise registration certificate", "企业登记证书"],
    agency: ["Business registration office of the provincial Department of Finance, through the National Business Registration Portal", "省财政厅商业登记处（经国家企业登记门户）"], url: "https://dangkykinhdoanh.gov.vn/",
    how: ["The enterprise registers through the national portal; a foreign investor first obtains an investment registration certificate.", "企业通过国家门户登记；外国投资者须先取得投资登记证书。"], specialist: LOCAL_SPECIALIST }),
  // Indonesia
  N({ id: "id-nib", where: "ID", cur: "IDR", order: 10, form: "Nomor Induk Berusaha (NIB) through OSS", title: ["Business identification number (NIB) through OSS", "通过 OSS 取得营业识别号（NIB）"],
    agency: ["Ministry of Investment and Downstreaming / BKPM, through the OSS system", "印尼投资与下游产业部 / 投资协调委员会（经 OSS 系统）"], url: "https://oss.go.id/",
    how: ["Every business gets its NIB in the risk-based OSS system, which then issues or routes the licences its activity needs.", "每家企业须在基于风险的 OSS 系统取得 NIB，系统随后签发或转办其经营所需的许可。"],
    proof: ["https://oss.go.id/", "Nomor Induk Berusaha (NIB) adalah identitas resmi untuk memulai atau menjalankan usaha di Indonesia.", "The Business Identification Number (NIB) is the official identity for starting or running a business in Indonesia."] }),
  N({ id: "id-npwp", where: "ID", cur: "IDR", order: 20, form: "Nomor Pokok Wajib Pajak (NPWP)", title: TAXNO,
    agency: ["Direktorat Jenderal Pajak (DJP)", "印尼税务总局（DJP）"], url: "https://www.pajak.go.id/",
    how: ["The company registers for its taxpayer number (NPWP) with the tax directorate.", "公司须向税务总局登记纳税人编号（NPWP）。"] }),
  // Philippines
  N({ id: "ph-sec", where: "PH", cur: "PHP", order: 10, needs: { newEntity: true }, form: "SEC registration", title: ["Company registration with the SEC", "向菲律宾证券交易委员会（SEC）注册公司"],
    agency: ["Securities and Exchange Commission", "菲律宾证券交易委员会（SEC）"], url: "https://www.sec.gov.ph/",
    how: ["A corporation is registered with the SEC; the city's mayor's permit and BIR registration follow.", "公司须在 SEC 注册，随后办理市长许可和税务局登记。"] }),
  N({ id: "ph-bir", where: "PH", cur: "PHP", order: 20, form: "BIR registration (Certificate of Registration, Form 2303)", title: ["Tax registration with the BIR", "向菲律宾国内税务局（BIR）办理税务登记"],
    agency: ["Bureau of Internal Revenue (BIR)", "菲律宾国内税务局（BIR）"], url: "https://www.bir.gov.ph/",
    how: ["The business registers with the BIR, which issues its Certificate of Registration.", "企业须在 BIR 登记，由其发放登记证书。"] }),
  // Nigeria
  N({ id: "ng-cac", where: "NG", cur: "NGN", order: 10, needs: { newEntity: true }, form: "Company registration (CAC)", title: COMPANY,
    agency: ["Corporate Affairs Commission (CAC)", "尼日利亚公司事务委员会（CAC）"], url: "https://www.cac.gov.ng/",
    how: ["A company is registered with the Corporate Affairs Commission; a foreign-owned company also registers with the investment promotion commission.", "公司须在公司事务委员会注册；外资公司还须在投资促进委员会登记。"] }),
  N({ id: "ng-nafdac", where: "NG", cur: "NGN", order: 45, segs: ["seller", "warehouse", "retail"], needs: { food: true, imports: true }, form: "NAFDAC product registration", title: ["Food product registration with NAFDAC", "向尼日利亚食品药品管理局（NAFDAC）注册食品"],
    agency: ["National Agency for Food and Drug Administration and Control (NAFDAC)", "尼日利亚国家食品药品管理与控制局（NAFDAC）"], url: "https://nafdac.gov.ng/",
    how: ["Packaged and imported food products are registered with NAFDAC before they are sold.", "预包装和进口食品须在销售前向 NAFDAC 注册。"] }),
  // Kenya
  N({ id: "ke-brs", where: "KE", cur: "KES", order: 10, needs: { newEntity: true }, form: "Company registration (eCitizen, Business Registration Service)", title: COMPANY,
    agency: ["Business Registration Service (BRS)", "肯尼亚商业登记服务局（BRS）"], url: "https://brs.go.ke/",
    how: ["Name reservation and registration are one online application with the Business Registration Service.", "名称预留和公司注册已合并为向商业登记服务局提交的一份在线申请。"],
    proof: ["https://brs.go.ke/", "Submit your choice of 3 preferred names and the full application online."] }),
  N({ id: "ke-kra-pin", where: "KE", cur: "KES", order: 20, form: "KRA PIN (non-individual)", title: TAXNO,
    agency: ["Kenya Revenue Authority (KRA)", "肯尼亚税务局（KRA）"], url: "https://www.kra.go.ke/",
    how: ["The company registers for its KRA PIN, the tax number every other filing uses.", "公司须登记 KRA PIN，其他申报均使用该税号。"] }),
  N({ id: "ke-nbo-permit", where: "KE-NBO", level: "city", cur: "KES", order: 55, segs: ["restaurant", "retail", "warehouse"], form: "Unified business permit (Nairobi eServices)", title: ["Nairobi business permit", "内罗毕营业许可"],
    agency: ["Nairobi City County", "内罗毕市县政府"], url: "https://nairobiservices.go.ke/",
    how: ["A business operating in Nairobi gets its county business permit on the county's eServices portal; food places also need health licences there.", "在内罗毕经营的企业须在县电子服务门户取得营业许可；食品场所还须在此申领卫生许可。"],
    proof: ["https://nairobiservices.go.ke/", "Obtain business licenses, permits, and registration to operate within the county."] }),
  // South Africa
  N({ id: "za-cipc", where: "ZA", cur: "ZAR", order: 10, needs: { newEntity: true }, form: "Company registration (CoR14.1)", title: COMPANY,
    agency: ["Companies and Intellectual Property Commission (CIPC)", "南非公司与知识产权委员会（CIPC）"], url: "https://www.cipc.co.za/",
    how: ["A company is registered with the CIPC, usually online.", "公司须在 CIPC 注册，通常在线办理。"] }),
  N({ id: "za-vat", where: "ZA", cur: "ZAR", order: 21, form: "VAT registration (VAT101)", title: ["VAT registration", "增值税登记"],
    agency: ["South African Revenue Service (SARS)", "南非税务局（SARS）"], url: "https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/",
    how: ["Registration is compulsory once taxable supplies pass R2.3 million in 12 months; a business may register voluntarily above R120,000.", "12 个月内应税供应超过 230 万兰特须强制登记；超过 12 万兰特可自愿登记。"],
    proof: ["https://www.sars.gov.za/types-of-tax/value-added-tax/register-for-vat/", "compulsory for a person to register for VAT if the value of taxable supplies made or to be made, is in excess of R2.3 million"] }),
  // Egypt: GAFI's company establishment was already in the library (eg-gafi, src/forms/world.ts)
  // Morocco
  N({ id: "ma-dgi", where: "MA", cur: "MAD", order: 20, form: "Identifiant fiscal et taxe professionnelle", title: TAXNO,
    agency: ["Direction Générale des Impôts (DGI)", "摩洛哥税务总局（DGI）"], url: "https://www.tax.gov.ma/",
    how: ["The company registers with the DGI for its tax identifier and business tax, usually with its company formation at the regional investment centre.", "公司须向税务总局登记税务识别号和营业税，通常在区域投资中心设立公司时一并办理。"] }),
];

export const INTL_FORMS: OfficialForm[] = [...CANADA_FORMS, ...WORLD_GAPS];
