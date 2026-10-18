// Forms for the target markets the registry didn't cover yet (src/forms/markets.ts; read on 2026-10-18): Maryland and
// Montgomery County (Rockville), Hawaii, Utah, Virginia's LLC formation, and the
// cities and counties around them: San Mateo and its county, Cupertino, Glendale, San Gabriel, and unincorporated
// Los Angeles County (Rowland Heights). Each replaces a generic step the planner listed with the jurisdiction's own form
// or portal, cited to the agency's page. Where the agency publishes a fillable PDF, a box map fills it (src/forms/maps);
// where it is online only, Placetta prepares the answers summary for the agency's site.
import { B } from "../bi";
import type { Bi } from "../bi";
import type { FormField, OfficialForm, Segment } from "./registry";

const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const R = "restaurant" as const, T = "retail" as const, S = "seller" as const, W = "warehouse" as const;
const F = (id: string, line: string, en: string, zh: string, options?: string[]): FormField => ({ id, line, label: B(en, zh), ...(options ? { options } : {}) });
const NO_FEE: Bi = B("No fee.", "不收费。");

// What an online state formation asks, for the answers summary (each portal's guide lists these).
const FORMATION = (agentEn: string, agentZh: string): FormField[] => [
  F("name", "Name", "LLC name (with its designator, e.g. LLC)", "LLC 名称（含后缀，如 LLC）"),
  F("address", "Principal office", "Principal office address", "主要办公地址"),
  F("agent", "Agent", agentEn, agentZh),
  F("agent_address", "Agent", "Registered agent's street address in the state", "注册代理人在该州的街道地址"),
  F("management", "Management", "Managed by its members or by managers", "由成员管理或由经理管理", ["Member-managed", "Manager-managed"]),
  F("organizer", "Organizer", "Organizer or authorized person signing: 'name, title'", "签署的发起人或授权人：“姓名、职务”"),
  F("email", "Contact", "Email for the state's notices", "接收州政府通知的电子邮箱"),
];
const EMPLOYER: FormField[] = [
  F("legal_name", "Employer", "Legal name of the business", "企业法定名称"),
  F("fein", "Employer", "Federal EIN", "联邦雇主识别号（EIN）"),
  F("address", "Employer", "Business location address", "营业地址"),
  F("first_wages", "Wages", "Date wages were first paid in the state (MM/DD/YYYY)", "在该州首次支付工资的日期（月/日/年）"),
  F("employees", "Wages", "Number of employees", "员工人数"),
  F("naics", "Activity", "NAICS code or business activity", "NAICS 代码或业务活动"),
  F("owners", "Owners", "Owners or officers: 'name, title'", "所有者或高管：“姓名、职务”"),
];

export const MARKETS_US: OfficialForm[] = [
  /* ------------------------------------------------ Maryland ------------------------------------------------ */
  {
    id: "md-llc", form: "Articles of Organization (Revised August 2024)", title: B("LLC formation (Articles of Organization)", "LLC 设立（组织章程）"),
    agency: B("Maryland State Department of Assessments and Taxation (SDAT)", "马里兰州评估与税务局（SDAT）"), level: "state", where: "MD", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("File online in Maryland Business Express, or mail the signed Articles with a $100 check to SDAT's Charter Division in Baltimore. The resident agent signs too.", "在 Maryland Business Express 在线提交，或将签署后的组织章程连同 100 美元支票邮寄至 SDAT 位于巴尔的摩的章程处。常驻代理人也须签字。"),
    url: "https://egov.maryland.gov/businessexpress", pdf: "https://dat.maryland.gov/sdat%20forms/artorgan.pdf", info: "https://dat.maryland.gov/sdat%20forms/artorgan.pdf",
    fee: 100, feeNote: B("$100; $50 more for review in 7 to 10 business days.", "100 美元；加急（7 至 10 个工作日）另加 50 美元。"),
    takes: B("Standard review takes 6 to 8 weeks.", "标准审核需 6 至 8 周。"), checked: "page", fields: [],
  },
  {
    id: "md-cra", form: "Form CRA, Combined Registration Application", title: B("Maryland sales and use tax, withholding and unemployment insurance registration", "马里兰州销售和使用税、预扣税及失业保险登记"),
    agency: B("Comptroller of Maryland, Central Registration", "马里兰州主计长办公室中央登记处"), level: "state", where: "MD", segments: [R, T, S, W], method: "online", order: 20,
    how: B("One application opens the sales and use tax license, employer withholding and the unemployment insurance account: online, by fax (410-260-7908) or by mail to Central Registration in Annapolis.", "一份申请即可开立销售和使用税执照、雇主预扣税和失业保险账户：可在线提交、传真（410-260-7908）或邮寄至安纳波利斯的中央登记处。"),
    url: "https://interactive.marylandtaxes.gov/webapps/comptrollercra/entrance.asp", pdf: "https://www.marylandtaxes.gov/forms/current_forms/cra.pdf", info: "https://businessexpress.maryland.gov/start/taxes-and-insurance",
    fee: 0, feeNote: NO_FEE, checked: "page", fields: [],
  },
  {
    id: "moco-plan-review", form: "Restaurant Interior Alteration Permit (plan review)", title: B("Food service plan review", "餐饮服务图纸审查"),
    agency: B("Montgomery County Department of Permitting Services, with Licensure & Regulatory Services", "蒙哥马利县许可服务局及许可与监管服务处"), level: "county", where: "MOCO", segments: [R, T], needs: { food: true, buildout: true }, method: "portal", order: 50,
    how: B("Building or remodeling plans are reviewed with the Department of Permitting Services' restaurant interior alteration permit; an Environmental Health Specialist reviews them within 14 days, then inspects before opening.", "建造或改造图纸随许可服务局的餐厅室内改造许可一并审查；环境卫生专员在 14 天内审查，开业前再进行检查。"),
    url: "https://www.montgomerycountymd.gov/department-permitting-services/all-permits/commercial-permits/restaurant-interior-alteration-permit-process",
    info: "https://www.montgomerycountymd.gov/department-health-human-services/about-us/licensure-regulatory-services/environmental-health-unit/food-service-facility-license",
    fee: null, checked: "page", fields: [],
  },
  {
    id: "moco-food-license", form: "Food Service Facility License Application (April 2026)", title: B("Montgomery County food service facility license", "蒙哥马利县餐饮服务设施执照"),
    agency: B("Montgomery County Department of Health and Human Services, Licensure & Regulatory Services", "蒙哥马利县卫生与公众服务局许可与监管服务处"), level: "county", where: "MOCO", segments: [R, T], needs: { food: true }, method: "pdf_mail", order: 76,
    how: B("A license is needed before opening: apply and pay on the county's CivicGov portal, or mail or fax the application to Licensure & Regulatory Services in Wheaton. The county answers in 10 to 14 business days and mails the license.", "开业前须取得执照：在县政府 CivicGov 门户申请并付费，或将申请表邮寄或传真至位于 Wheaton 的许可与监管服务处。县政府在 10 至 14 个工作日内答复并邮寄执照。"),
    url: "https://www.civicgov4.com/md_montgomery/portal/", pdf: "https://assets.montgomerycountymd.gov/files/2026-04/Food%20Service%20Facility%20License%20App_April2026.pdf",
    info: "https://www.montgomerycountymd.gov/department-health-human-services/about-us/licensure-regulatory-services/environmental-health-unit/food-service-facility-license",
    fee: null, feeNote: B("Set by the county's license fee schedule.", "按县政府执照收费标准收取。"), checked: "page", fields: [],
  },

  /* ------------------------------------------------ Hawaii ------------------------------------------------ */
  {
    id: "hi-llc", form: "Form LLC-1, Articles of Organization", title: B("LLC formation (Articles of Organization)", "LLC 设立（组织章程）"),
    agency: B("Hawaii Department of Commerce and Consumer Affairs, Business Registration Division", "夏威夷州商业与消费者事务部企业登记处"), level: "state", where: "HI", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Register online in Hawaii Business Express, or file Form LLC-1 with the Business Registration Division.", "在 Hawaii Business Express 在线登记，或向企业登记处提交 LLC-1 表。"),
    url: "https://hbe.ehawaii.gov/BizEx/home.eb", pdf: "https://files.hawaii.gov/dcca/breg/registration/forms/llc-1.pdf", info: "https://cca.hawaii.gov/breg/registration/dllc/forms/",
    fee: null, feeNote: B("Set by the division's fee schedule.", "按企业登记处收费标准收取。"), checked: "page",
    fields: FORMATION("Registered agent's name", "注册代理人姓名"),
  },
  {
    id: "hi-bb1", form: "Form BB-1 (Rev. 9/2023), Basic Business Application", title: B("General excise tax license", "一般消费税（GET）执照"),
    agency: B("Hawaii Department of Taxation", "夏威夷州税务局"), level: "state", where: "HI", segments: [R, T, S, W], method: "online", order: 20,
    how: B("Apply online at Hawaii Tax Online (about 5 business days), or mail Form BB-1 with the $20 fee to the Department of Taxation, P.O. Box 1425, Honolulu. The same form registers for withholding.", "在 Hawaii Tax Online 在线申请（约 5 个工作日），或将 BB-1 表连同 20 美元费用邮寄至税务局（P.O. Box 1425, Honolulu）。同一表格可登记预扣税。"),
    url: "https://hitax.hawaii.gov/", pdf: "https://files.hawaii.gov/tax/forms/2024/bb1_i.pdf", info: "https://tax.hawaii.gov/geninfo/get/",
    fee: 20, feeNote: B("$20 for the general excise license; withholding registration is free.", "一般消费税执照 20 美元；预扣税登记免费。"), checked: "page",
    fields: [
      F("legal_name", "4", "Legal name", "法定名称"), F("dba", "5", "Trade name (DBA), if any", "商号（DBA），如有"),
      F("mailing", "6", "Mailing address", "邮寄地址"), F("location", "7", "Physical location in Hawaii", "夏威夷州营业地点"),
      F("organization", "8", "Type of legal organization", "法律组织类型", ["LLC", "Single-Member LLC", "Corporation", "S Corporation", "Sole Proprietorship", "General Partnership"]),
      F("began", "10", "Date business began in Hawaii", "在夏威夷开始经营的日期"), F("naics", "15", "NAICS code and business activity", "NAICS 代码和业务活动"),
      F("phone", "16", "Business phone and email", "企业电话和电子邮箱"), F("owners", "20", "Owners, partners, members or officers: 'name, title'", "所有者、合伙人、成员或高管：“姓名、职务”"),
      F("tax_types", "22", "Tax types: general excise, withholding", "税种：一般消费税、预扣税"),
    ],
  },
  {
    id: "hi-ui", form: "Unemployment insurance employer registration (online)", title: B("New employer registration (unemployment insurance)", "新雇主登记（失业保险）"),
    agency: B("Hawaii Department of Labor and Industrial Relations, Unemployment Insurance Division", "夏威夷州劳工与工业关系部失业保险处"), level: "state", where: "HI", segments: [R, T, S, W], needs: { employees: true }, method: "online", order: 60,
    how: B("\"Employers may register their company\" online with the Unemployment Insurance Division; future hire dates aren't accepted, so register once wages start.", "雇主可在失业保险处网站在线登记公司；不接受未来的雇用日期，因此在开始支付工资后登记。"),
    url: "https://huiclaims3.hawaii.gov/", info: "https://labor.hawaii.gov/ui/employer-registration/", fee: 0, feeNote: NO_FEE, checked: "page", fields: EMPLOYER,
  },

  /* ------------------------------------------------ Utah ------------------------------------------------ */
  {
    id: "ut-llc", form: "Certificate of Organization (online)", title: B("LLC formation (Certificate of Organization)", "LLC 设立（组织证书）"),
    agency: B("Utah Division of Corporations and Commercial Code", "犹他州公司与商业法典处"), level: "state", where: "UT", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Filed online at the state's business registration site with a UtahID: Formations, Domestic, Limited Liability Company.", "使用 UtahID 在州企业登记网站在线提交：Formations、Domestic、Limited Liability Company。"),
    url: "https://businessregistration.utah.gov/", info: "https://commerce.utah.gov/corporations/business-entities/domestic-limited-liability-company/",
    fee: null, feeNote: B("Set by the division's fee schedule; non-refundable.", "按该处收费标准收取，不予退还。"), checked: "page",
    fields: FORMATION("Registered agent's name", "注册代理人姓名"),
  },
  {
    id: "ut-tax", form: "Utah State Business and Tax Registration (online, formerly TC-69)", title: B("Utah sales tax license and withholding account", "犹他州销售税执照及预扣税账户"),
    agency: B("Utah State Tax Commission", "犹他州税务委员会"), level: "state", where: "UT", segments: [R, T, S, W], method: "online", order: 20,
    how: B("\"Apply for a Utah tax account/license\" in Taxpayer Access Point (TAP); the paper TC-69 now opens the same online registration.", "在纳税人访问门户（TAP）中选择“Apply for a Utah tax account/license”；纸质 TC-69 表现在也转到同一在线登记。"),
    url: "https://tap.tax.utah.gov/TaxExpress/_/?Link=TapBr", info: "https://tax.utah.gov/business/create-manage/tax-info-business/", fee: 0, feeNote: NO_FEE, checked: "page",
    fields: [
      F("legal_name", "Business", "Legal name of the business", "企业法定名称"), F("fein", "Business", "Federal EIN", "联邦雇主识别号（EIN）"),
      F("location", "Business", "Utah business location", "犹他州营业地点"), F("mailing", "Business", "Mailing address", "邮寄地址"),
      F("naics", "Activity", "NAICS code and business activity", "NAICS 代码和业务活动"), F("first_sales", "Sales", "Date of first sales in Utah", "在犹他州首次销售日期"),
      F("tax_types", "Accounts", "Accounts: sales and use tax, withholding", "账户：销售和使用税、预扣税"), F("owners", "Owners", "Owners or officers: 'name, title'", "所有者或高管：“姓名、职务”"),
    ],
  },
  {
    id: "ut-ui", form: "Employer Registration (online)", title: B("New employer registration (unemployment insurance)", "新雇主登记（失业保险）"),
    agency: B("Utah Department of Workforce Services, Unemployment Insurance", "犹他州劳动力服务部失业保险处"), level: "state", where: "UT", segments: [R, T, S, W], needs: { employees: true }, method: "online", order: 60,
    how: B("\"Create a new UI account for my business\" on Workforce Services' employer registration, after setting up a user account.", "先建立用户账户，再在劳动力服务部雇主登记中选择“Create a new UI account for my business”。"),
    url: "https://jobs.utah.gov/ui/employer/EmployerRegistration/Intro.aspx", info: "https://jobs.utah.gov/ui/employer/public/osbr.aspx", fee: 0, feeNote: NO_FEE, checked: "page", fields: EMPLOYER,
  },

  /* ------------------------------------------------ Virginia ------------------------------------------------ */
  {
    id: "va-llc", form: "Articles of Organization (Clerk's Information System)", title: B("LLC formation (Articles of Organization)", "LLC 设立（组织章程）"),
    agency: B("Virginia State Corporation Commission, Clerk's Office", "弗吉尼亚州公司委员会书记官办公室"), level: "state", where: "VA", segments: ALL, needs: { newEntity: true }, method: "online", order: 12,
    how: B("Formed online in the Clerk's Information System: Online Services, Virginia Entity, Limited Liability Company, Articles of Organization; the system builds the filing image, and the fee is paid at checkout.", "在书记官信息系统（CIS）在线设立：Online Services、Virginia Entity、Limited Liability Company、Articles of Organization；系统自动生成备案文件，结账时付费。"),
    url: "https://cis.scc.virginia.gov/", info: "https://www.scc.virginia.gov/media/sccvirginiagov-home/business-home/business-faqs/llc-faqs/how-to-guide-form-a-virginia-limited-liability-company.pdf",
    fee: null, feeNote: B("Paid at checkout in CIS.", "在 CIS 结账时支付。"), checked: "page",
    fields: FORMATION("Registered agent: an individual Virginia resident or a business entity authorized in Virginia", "注册代理人：弗吉尼亚州居民个人或在弗吉尼亚州获授权的企业实体"),
  },

  /* ------------------------------------------------ San Mateo, Cupertino, Glendale, San Gabriel, unincorporated LA County ------------------------------------------------ */
  {
    id: "smo-license", form: "Application for Business Tax Certificate", title: B("City of San Mateo business tax certificate", "圣马特奥市营业税证书"),
    agency: B("City of San Mateo, Business Tax Division", "圣马特奥市营业税处"), level: "city", where: "SMO", segments: ALL, method: "pdf_mail", order: 55,
    how: B("Clear the location with Planning, Building and Fire first, then send the application with a check for the tax (by gross receipts) and the new-occupancy fire inspection fee to the Business Tax Division at City Hall.", "先向规划、建筑和消防部门确认场所，然后将申请表连同营业税（按总收入计）和新场所消防检查费的支票寄至市政厅营业税处。"),
    url: "https://www.cityofsanmateo.org/DocumentCenter/View/232/Gross-Receipts-Form?bidId=", pdf: "https://www.cityofsanmateo.org/DocumentCenter/View/232/Gross-Receipts-Form?bidId=",
    info: "https://www.cityofsanmateo.org/3323/Starting-a-Business", fee: null,
    feeNote: B("Tax by gross receipts ($27 and up), plus $204 for a new occupancy's fire inspection and $4 state fee.", "按总收入计税（27 美元起），另加新场所消防检查费 204 美元和州政府费用 4 美元。"), checked: "page", fields: [],
  },
  {
    id: "smc-plan-check", form: "Food facility plan check", title: B("Food facility plan check", "食品设施图纸审查"),
    agency: B("San Mateo County Environmental Health Services", "圣马特奥县环境卫生服务处"), level: "county", where: "SMC", segments: [R, T], needs: { food: true, buildout: true }, method: "portal", order: 50,
    how: B("Plans for a new or remodeled food facility go to Environmental Health for review before construction; applications are made through the county's MyEHS portal.", "新建或改造的食品设施须在施工前将图纸提交环境卫生处审查；通过县政府 MyEHS 门户申请。"),
    url: "https://smcehs.my.site.com/s/?language=en_US", info: "https://www.smchealth.org/food-facility-plan-check-process", fee: null, checked: "page", fields: [],
  },
  {
    id: "smc-health-permit", form: "Health permit application (MyEHS)", title: B("Health permit to operate a food facility", "食品设施营业卫生许可证"),
    agency: B("San Mateo County Environmental Health Services", "圣马特奥县环境卫生服务处"), level: "county", where: "SMC", segments: [R, T], needs: { food: true }, method: "portal", order: 76,
    how: B("Create a MyEHS account (staff confirm it), then apply for the permit there, uploading the documents it asks for as PDFs.", "注册 MyEHS 账户（由工作人员确认），然后在门户申请许可证，并以 PDF 上传所需文件。"),
    url: "https://smcehs.my.site.com/s/?language=en_US", info: "https://www.smchealth.org/my-ehs-online-portal", fee: null, checked: "page", fields: [],
  },
  {
    id: "cup-license", form: "Business License application (HdL)", title: B("City of Cupertino business license", "库比蒂诺市营业执照"),
    agency: B("City of Cupertino, Business License (administered by HdL)", "库比蒂诺市营业执照（由 HdL 代管）"), level: "city", where: "CUP", segments: ALL, method: "online", order: 55,
    how: B("Business license services moved to HdL on September 22, 2025: apply at cupertino.hdlgov.com.", "营业执照业务自 2025 年 9 月 22 日起转由 HdL 办理：在 cupertino.hdlgov.com 申请。"),
    url: "https://cupertino.hdlgov.com/", info: "https://cupertino.gov/i-want-to/apply-for/business-license-application",
    fee: 185, feeNote: B("$185 a year ($181 plus the $4 state fee); commercial-zone businesses also pay a square-footage tax.", "每年 185 美元（181 美元加州政府费用 4 美元）；商业区企业另按面积纳税。"), checked: "page",
    fields: [
      F("legal_name", "Business", "Business legal name and DBA", "企业法定名称及 DBA"), F("location", "Business", "Business address in Cupertino", "库比蒂诺营业地址"),
      F("activity", "Business", "Business activity", "业务活动"), F("start", "Business", "Start date in Cupertino", "在库比蒂诺开始经营的日期"),
      F("square_feet", "Business", "Square footage", "营业面积（平方英尺）"), F("owners", "Owners", "Owners or officers: 'name, title'", "所有者或高管：“姓名、职务”"),
      F("fein", "Business", "Federal EIN", "联邦雇主识别号（EIN）"), F("sellers_permit", "Business", "California seller's permit number", "加州卖家许可证号"),
    ],
  },
  {
    id: "gln-brc", form: "Business Registration Certificate (GlendalePermits)", title: B("Glendale business registration certificate", "格伦代尔营业登记证"),
    agency: B("City of Glendale, Community Development, Neighborhood Services (Licensing)", "格伦代尔市社区发展局邻里服务处（执照）"), level: "city", where: "GLN", segments: ALL, method: "portal", order: 55,
    how: B("\"Every business located in Glendale ... is required to apply for and maintain a valid Business Registration Certificate\": apply in the GlendalePermits portal with the lease, grant deed or property tax bill.", "格伦代尔的每家企业都须申请并持有有效的营业登记证：在 GlendalePermits 门户申请，并提交租约、产权契据或房产税单。"),
    url: "https://www.glendaleca.gov/government/departments/community-development/licenses-permits-and-applications/license-and-permit-applications/business-registration-certificate",
    info: "https://www.glendaleca.gov/government/departments/community-development/licenses-permits-and-applications/license-and-permit-applications/business-registration-certificate",
    fee: 496.39, feeNote: B("$496.39 to start, $128.77 a year after.", "首次 496.39 美元，之后每年 128.77 美元。"), checked: "page", fields: [],
  },
  {
    id: "sgb-license", form: "Business License and Occupancy Application", title: B("City of San Gabriel business license", "圣盖博市营业执照"),
    agency: B("City of San Gabriel, Finance (Business License)", "圣盖博市财政局（营业执照）"), level: "city", where: "SGB", segments: ALL, method: "pdf_mail", order: 55,
    how: B("Verify zoning and building permits with Community Development first; once the tenant improvements pass final inspection, apply for the business license by phone or by email to Financeinfo@sgch.org with the business name and address in the subject.", "先向社区发展局核实分区和建筑许可；租户改造通过最终检查后，致电或发邮件至 Financeinfo@sgch.org 申请营业执照，邮件主题写明企业名称和地址。"),
    url: "https://www.sangabrielcity.com/DocumentCenter/View/6352", pdf: "https://www.sangabrielcity.com/DocumentCenter/View/6352",
    info: "https://sangabrielcity.com/DocumentCenter/View/19742/City-Business-License-Guidelines-and-Fees-2023",
    fee: null, feeNote: B("A flat tax by business classification.", "按业务类别收取固定税额。"), checked: "page", fields: [],
  },
  {
    id: "lac-business-license", form: "County of Los Angeles Business License (EnerGov)", title: B("Los Angeles County business license (unincorporated areas)", "洛杉矶县营业执照（非建制区）"),
    agency: B("Los Angeles County Treasurer and Tax Collector, Business License Section", "洛杉矶县财政与税务局营业执照科"), level: "county", where: "LACU", segments: [R, T], needs: { food: true }, method: "online", order: 58,
    how: B("In unincorporated Los Angeles County the county licenses certain activities, \"Restaurant\" and \"Food Establishment\" among them: apply on the county's online application portal after confirming the address with the District Locator.", "在洛杉矶县非建制区，县政府对特定业务发放执照，其中包括“餐厅”和“食品经营场所”：先用 District Locator 确认地址，再在县政府在线申请门户申请。"),
    url: "https://losangelescountyca-energovweb.tylerhost.net/apps/selfservice#/applicationAssistant?sectionName=All&moduleId=10&categoryName=County%20of%20Los%20Angeles%20Business%20License&showTemplates=false",
    info: "https://ttc.lacounty.gov/business-license-requirements-2/", fee: null, checked: "page",
    fields: [
      F("legal_name", "Business", "Business legal name and DBA", "企业法定名称及 DBA"), F("location", "Business", "Business address (unincorporated Los Angeles County)", "营业地址（洛杉矶县非建制区）"),
      F("activity", "Business", "Licensed activity (Restaurant or Food Establishment)", "许可业务（餐厅或食品经营场所）", ["Restaurant", "Food Establishment"]),
      F("owners", "Owners", "Owners or officers: 'name, title'", "所有者或高管：“姓名、职务”"), F("phone", "Contact", "Phone and email", "电话和电子邮箱"),
    ],
  },
];
