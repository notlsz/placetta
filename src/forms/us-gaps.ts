// US filings the library was missing, found in the coverage audit of 2026-10-22 (docs/COVERAGE.md): workers'
// compensation in each state Placetta covers (only New York had it), the out-of-state company's registration where the
// state's own page could be read, the federal importer's permit for alcohol and FDA's importer identification under FSVP,
// and the trade name filings at the state and county level.
//
// Same rules as src/forms/europe.ts: a proof is a sentence of under 25 words copied from the agency's own page, with the
// URL and the day it was read. An entry whose official page refused every automated read (a Cloudflare wall, a 403) has
// no proof: it is listed as UNVERIFIED in docs/COVERAGE.md, its plan row abstains and names the office, and no fee is
// stated. Workers' compensation is bought from an insurer (or a state fund), so its method is "insurer".
import type { OfficialForm, Segment } from "./registry";
import { E } from "./europe";

type T = readonly [string, string];
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const IMPORTERS: Segment[] = ["seller", "warehouse", "retail"];
const WC_AGENCY = (en: string, zh: string): T => [en, zh];
const WC_HOW: T = ["Bought from an insurer licensed in the state (or the state fund) before the first employee starts; the insurer reports the policy to the state.", "在首位员工入职前，向该州持牌保险公司（或州基金）购买；由保险公司向州政府报备保单。"];
const WC_TITLE: T = ["Workers' compensation insurance", "工伤保险"];

/** One state's workers' compensation requirement: [code, agency en, agency zh, page, quote or undefined]. */
const wc = (where: string, agency: T, url: string, quote?: string, extra: Partial<{ how: T; title: T; form: string }> = {}): OfficialForm =>
  E({ id: `${where.toLowerCase()}-workers-comp`, where, level: "state", segs: ALL, needs: { employees: true }, method: "insurer", order: 61, cur: "USD",
    form: extra.form ?? "Workers' compensation policy", title: extra.title ?? WC_TITLE, agency, how: extra.how ?? WC_HOW, url,
    plain: ["Insurance that covers staff hurt at work, which the state requires of employers.", "为工作中受伤的员工提供保障的保险，州法律要求雇主购买。"],
    ...(quote ? { proof: [url, quote] as const } : {}) });

export const US_GAPS: OfficialForm[] = [
  /* ------------------------------------------------------------------ federal */
  E({ id: "ttb-importer", where: "US", level: "federal", segs: IMPORTERS, needs: { imports: true, alcohol: true }, method: "online", order: 33, cur: "USD",
    form: "TTB F 5100.24 (Application for Basic Permit under the Federal Alcohol Administration Act)", title: ["Federal basic importer's permit for wine, beer or spirits", "葡萄酒、啤酒或烈酒联邦进口基本许可"],
    agency: ["Alcohol and Tobacco Tax and Trade Bureau (TTB), National Revenue Center", "美国酒类与烟草税务贸易局（TTB）国家税务中心"],
    how: ["A business that imports wine, malt beverages or distilled spirits gets TTB's basic importer's permit before the first shipment, filed on TTB F 5100.24 through Permits Online or on paper. The products also need label approvals (COLAs).", "进口葡萄酒、麦芽饮料或烈酒的企业，须在首批货物前取得 TTB 的进口基本许可，通过 Permits Online 或纸质 TTB F 5100.24 表申请。产品还须取得标签批准（COLA）。"],
    url: "https://www.ttb.gov/import-export/itd/importing-bottled-alcohol-beverages-into-the-united-states",
    plain: ["The federal permit to import alcohol, needed before your first shipment of wine, beer or spirits.", "进口酒类的联邦许可，首批葡萄酒、啤酒或烈酒到港前必须取得。"],
    proof: ["https://www.ttb.gov/import-export/itd/importing-bottled-alcohol-beverages-into-the-united-states", "into the United States must apply for a Federal Basic Importer’s Permit"] }),
  E({ id: "fda-fsvp", where: "US", level: "federal", segs: IMPORTERS, needs: { imports: true, food: true }, method: "none", order: 48, cur: "USD", fee: 0,
    form: "Foreign Supplier Verification Program (21 CFR part 1, subpart L)", title: ["Foreign supplier verification (FSVP) and the importer's DUNS number at entry", "外国供应商验证计划（FSVP）及入境报关时的进口商 DUNS 编号"],
    agency: ["U.S. Food and Drug Administration", "美国食品药品监督管理局（FDA）"],
    how: ["The US importer of a food keeps a written program verifying each foreign supplier, and its DUNS number goes on every entry line filed with CBP. Nothing is filed to open it; FDA inspects the records.", "食品的美国进口商须保存书面计划，验证每一家外国供应商，且向 CBP 报关时每条报关行都须填写其 DUNS 编号。无需提交申请，FDA 会检查记录。"],
    url: "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-compliance-providing-acceptable-unique-facility-identifier-foreign-supplier",
    plain: ["As the importer of food, you check your foreign suppliers and give your DUNS number on every customs entry.", "作为食品进口商，您须核查外国供应商，并在每次报关时提供 DUNS 编号。"],
    proof: ["https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-compliance-providing-acceptable-unique-facility-identifier-foreign-supplier",
      "the unique facility identifier (UFI) recognized as acceptable by FDA for importer identification is provided electronically when filing entry"] }),

  /* ------------------------------------------------------------------ workers' compensation, by state */
  wc("CA", WC_AGENCY("California Department of Industrial Relations, Division of Workers' Compensation", "加州劳资关系部工伤赔偿处"), "https://dir.ca.gov/DWC/Employer.htm",
    "California employers are required by law to have workers' compensation insurance, even if they have only one employee."),
  wc("TX", WC_AGENCY("Texas Department of Insurance, Division of Workers' Compensation", "德州保险部工伤赔偿处"), "https://Www.Tdi.Texas.Gov/forms/dwc/dwc005nocovst.pdf",
    "Annual filing, between February 1 and April 30 each year.",
    { form: "DWC Form-005 (Non-subscriber notice), if you don't buy coverage", title: ["Workers' compensation, or the yearly non-subscriber notice", "工伤保险，或每年的未投保申报"],
      how: ["Texas doesn't require private employers to carry workers' compensation. An employer with one or more employees who doesn't carry it is a non-subscriber: it files DWC Form-005 every year between February 1 and April 30, and tells its employees.", "德州不强制私营雇主购买工伤保险。有一名以上员工但未投保的雇主为未投保雇主：须每年 2 月 1 日至 4 月 30 日提交 DWC Form-005，并告知员工。"] }),
  wc("FL", WC_AGENCY("Florida Department of Financial Services, Division of Workers' Compensation", "佛罗里达州金融服务部工伤赔偿处"), "https://www.myfloridacfo.com/division/wc/employer/coverage-requirements",
    "Non-Construction Industry Employers with four (4) or more employees, including business owners who are corporate officers"),
  wc("IL", WC_AGENCY("Illinois Workers' Compensation Commission", "伊利诺伊州工伤赔偿委员会"), "https://iwcc.illinois.gov/about/insurance.html",
    "If you have one employee, even a part-time employee, you must obtain workers' compensation insurance."),
  wc("MA", WC_AGENCY("Massachusetts Department of Industrial Accidents", "马萨诸塞州工业事故部"), "https://www.mass.gov/info-details/workers-compensation-insurance-requirements",
    "The requirement applies no matter the number of hours worked or the number of employees."),
  wc("GA", WC_AGENCY("Georgia State Board of Workers' Compensation", "佐治亚州工伤赔偿委员会"), "https://sbwc.georgia.gov/frequently-asked-questions/workers-compensation-law-faqs",
    "The law requires any business with three or more workers, including regular part-time workers, to have workers’ compensation insurance."),
  wc("PA", WC_AGENCY("Pennsylvania Department of Labor and Industry, Bureau of Workers' Compensation", "宾夕法尼亚州劳工与工业部工伤赔偿局"), "https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/workers--compensation-for-employers/workers--compensation-compliance",
    "The requirement to insure workers' compensation liability is mandatory for any employer who:"),
  wc("OR", WC_AGENCY("Oregon Department of Consumer and Business Services, Workers' Compensation Division", "俄勒冈州消费者与商业服务部工伤赔偿处"), "https://wcd.oregon.gov/employer/pages/compensation-insurance-overview.aspx",
    "If you employ one or more workers, you are an employer."),
  wc("VA", WC_AGENCY("Virginia Workers' Compensation Commission", "弗吉尼亚州工伤赔偿委员会"), "https://workcomp.virginia.gov/content/employers",
    "As a general rule, a business with more than two employees regularly employed in Virginia is required to carry workers’ compensation coverage."),
  wc("NJ", WC_AGENCY("New Jersey Department of Labor, Division of Workers' Compensation", "新泽西州劳工部工伤赔偿处"), "https://www.nj.gov/labor/workerscompensation/employer-requirements/",
    "All corporations operating in New Jersey must maintain Workers' Compensation insurance or be approved for self-insurance"),
  wc("CO", WC_AGENCY("Colorado Department of Labor and Employment, Division of Workers' Compensation", "科罗拉多州劳动与就业部工伤赔偿处"), "https://cdle.colorado.gov/dwc",
    "All businesses with employees operating in Colorado are required to have workers’ compensation insurance, regardless of the number of employees,"),
  wc("MN", WC_AGENCY("Minnesota Department of Labor and Industry", "明尼苏达州劳工与工业部"), "https://dli.mn.gov/business/workers-compensation/work-comp-who-needs-workers-compensation-coverage",
    "There is no minimum number of employees an employer must have before insurance is required;"),
  wc("MD", WC_AGENCY("Maryland Workers' Compensation Commission", "马里兰州工伤赔偿委员会"), "https://www.wcc.state.md.us/PDF/Publications/QandA_Emplr.pdf",
    "every employer in the State of Maryland with one or more employees is required by law to provide workers’ compensation coverage"),
  // UNVERIFIED: the official pages were read but carry no sentence that states who must insure in a form a quote can
  // hold (Nevada's brochure prints broken ligatures), or refused the read (Ohio BWC); the rows abstain and name the office
  wc("NV", WC_AGENCY("Nevada Division of Industrial Relations, Workers' Compensation Section", "内华达州劳资关系处工伤赔偿科"), "https://dir.nv.gov/uploadedFiles/dirnvgov/content/WCS/EmployersDocs/EmployerBrochure.7.2026.pdf"),
  wc("OH", WC_AGENCY("Ohio Bureau of Workers' Compensation (the state fund)", "俄亥俄州工伤赔偿局（州基金）"), "https://bwc.ohio.gov/employer/forms/coverage",
    undefined, { form: "BWC Form U-3 (Application for coverage), with the state fund", how: ["Ohio employers buy coverage from the state's own fund, the Bureau of Workers' Compensation, not from a private insurer (unless self-insured).", "俄亥俄州雇主须向州基金（工伤赔偿局）而非私营保险公司投保（自保雇主除外）。"] }),
  wc("DC", WC_AGENCY("DC Department of Employment Services, Office of Workers' Compensation", "华盛顿特区就业服务部工伤赔偿办公室"), "https://does.dc.gov/sites/default/files/dc/sites/does/page_content/attachments/OWC%20Employer%20brochure.pdf"),

  /* ------------------------------------------------------------------ forming the company, where the library had no state filing */
  E({ id: "mn-sos-llc", where: "MN", level: "state", needs: { newEntity: true }, method: "online", order: 12, cur: "USD", fee: 155,
    form: "Articles of Organization (Minnesota Statutes chapter 322C)", title: ["Articles of Organization (Minnesota LLC)", "组织章程（明尼苏达州 LLC）"],
    agency: ["Minnesota Secretary of State, Business Services", "明尼苏达州州务卿商业服务处"],
    how: ["Filed online or in person with the Secretary of State ($155, expedited), or by mail ($135).", "向州务卿在线或现场提交（155 美元，加急），或邮寄提交（135 美元）。"],
    url: "https://www.sos.mn.gov/media/1824/llcarticlesoforganization.pdf", feeNote: ["$155 online or in person, $135 by mail.", "在线或现场 155 美元，邮寄 135 美元。"],
    proof: ["https://www.sos.mn.gov/media/1824/llcarticlesoforganization.pdf", "Filing Fee: $155 for expedited service in-person and online filings, $135 if by mail"] }),
  E({ id: "or-sos-llc", where: "OR", level: "state", needs: { newEntity: true }, method: "online", order: 12, cur: "USD", fee: 100,
    form: "Articles of Organization (Limited Liability Company)", title: ["Articles of Organization (Oregon LLC)", "组织章程（俄勒冈州 LLC）"],
    agency: ["Oregon Secretary of State, Corporation Division", "俄勒冈州州务卿公司处"],
    how: ["Filed online with the Corporation Division's business registry, or on the paper form.", "在公司处商业登记系统在线提交，或以纸质表格提交。"],
    url: "https://sos.oregon.gov/business/Documents/business-registry-forms/llc-articles.pdf",
    proof: ["https://sos.oregon.gov/business/Documents/business-registry-forms/llc-articles.pdf", "$100 Processing Fees are nonrefundable."] }),
  // UNVERIFIED: Ohio's Secretary of State site answered with a maintenance page (403)
  E({ id: "oh-sos-llc", where: "OH", level: "state", needs: { newEntity: true }, method: "online", order: 12, cur: "USD",
    form: "Articles of Organization for a Domestic Limited Liability Company", title: ["Articles of Organization (Ohio LLC)", "组织章程（俄亥俄州 LLC）"],
    agency: ["Ohio Secretary of State, Business Services", "俄亥俄州州务卿商业服务处"],
    how: ["Filed online with the Secretary of State, or on the paper form.", "向州务卿在线提交，或以纸质表格提交。"],
    url: "https://www.ohiosos.gov/businesses/filing-forms--fee-schedule/" }),

  /* ------------------------------------------------------------------ a company from another state registers here */
  E({ id: "ny-dos-foreign-llc", where: "NY", level: "state", needs: { foreignEntity: true }, method: "pdf_mail", order: 12, cur: "USD", fee: 250,
    form: "Application for Authority (foreign limited liability company)", title: ["Registration of an out-of-state LLC (Application for Authority)", "外州 LLC 在纽约州注册（营业授权申请）"],
    agency: ["New York Department of State, Division of Corporations", "纽约州务院公司处"],
    how: ["An LLC formed in another state or country files an Application for Authority with a Certificate of Existence dated within a year, then publishes a notice in two newspapers for six weeks within 120 days.", "在其他州或国家成立的 LLC 须提交营业授权申请，并附一年内出具的存续证明；之后须在 120 天内在两份报纸上连续刊登公告六周。"],
    url: "https://dos.ny.gov/application-authority-foreign-limited-liability-companies",
    feeNote: ["$250 filing fee, plus the newspapers' charges for the publication.", "申请费 250 美元，另付报纸刊登费。"],
    proof: ["https://dos.ny.gov/application-authority-foreign-limited-liability-companies", "The completed application, together with the filing fee of $250, should be forwarded to the New York Department of State,"] }),
  E({ id: "wa-sos-foreign", where: "WA", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD", fee: 180,
    form: "Foreign Registration Statement (RCW 23.95)", title: ["Registration of an out-of-state company", "外州公司在华盛顿州注册"],
    agency: ["Washington Secretary of State, Corporations and Charities Division", "华盛顿州州务卿公司与慈善处"],
    how: ["A company whose home state is another state or country files a Foreign Registration Statement with the Secretary of State before doing business in Washington.", "母州为其他州或国家的公司，须在华盛顿州开展业务前向州务卿提交外州注册声明。"],
    url: "https://www.sos.wa.gov/sites/default/files/2025-06/6.2025%20-%20FO%20Profit%20Foreign%20Registration%20Statement.pdf",
    proof: ["https://www.sos.wa.gov/sites/default/files/2025-06/6.2025%20-%20FO%20Profit%20Foreign%20Registration%20Statement.pdf", "The filing fee is $180 for all business types."] }),
  E({ id: "ma-sos-foreign-llc", where: "MA", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD", fee: 500,
    form: "Foreign Limited Liability Company Application for Registration (G.L. c. 156C, s. 48)", title: ["Registration of an out-of-state LLC", "外州 LLC 在马萨诸塞州注册"],
    agency: ["Secretary of the Commonwealth of Massachusetts, Corporations Division", "马萨诸塞州州务卿公司处"],
    how: ["An LLC formed elsewhere registers with the Corporations Division before doing business in Massachusetts.", "在外州成立的 LLC 须在马萨诸塞州开展业务前向公司处注册。"],
    url: "https://www.sec.state.ma.us/divisions/corporations/download/c156cs48fllcregistration.pdf",
    proof: ["https://www.sec.state.ma.us/divisions/corporations/download/c156cs48fllcregistration.pdf", "Filing fee: $500"] }),
  // UNVERIFIED: Florida's forms page lists the foreign LLC forms but states no fee; Georgia's guide refused the read (403)
  E({ id: "fl-sunbiz-foreign-llc", where: "FL", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD",
    form: "Application by Foreign Limited Liability Company for Authorization to Transact Business in Florida", title: ["Registration of an out-of-state LLC", "外州 LLC 在佛罗里达州注册"],
    agency: ["Florida Department of State, Division of Corporations", "佛罗里达州务院公司处"],
    how: ["An LLC formed elsewhere applies to the Division of Corporations for authority to transact business in Florida, online or on the paper form.", "在外州成立的 LLC 须在线或以纸质表格向公司处申请在佛罗里达州经营的授权。"],
    url: "https://dos.fl.gov/sunbiz/forms/limited-liability-company/" }),
  E({ id: "ga-sos-foreign", where: "GA", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD",
    form: "Application for Certificate of Authority (eCorp)", title: ["Registration of an out-of-state company", "外州公司在佐治亚州注册"],
    agency: ["Georgia Secretary of State, Corporations Division", "佐治亚州州务卿公司处"],
    how: ["A company formed elsewhere registers with the Corporations Division before transacting business in Georgia.", "在外州成立的公司须在佐治亚州经营前向公司处注册。"],
    url: "https://sos.ga.gov/how-to-guide/how-to-guide-register-foreign-entity" }),
  E({ id: "az-acc-foreign", where: "AZ", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD", fee: 150,
    form: "Foreign Registration Statement (Form L025)", title: ["Registration of an out-of-state LLC", "外州 LLC 在亚利桑那州注册"],
    agency: ["Arizona Corporation Commission, Corporations Division", "亚利桑那州公司委员会公司处"],
    how: ["Filed online (Arizona Business Center) or on the paper form, with a certificate of existence from the home state dated within 60 days, a certified copy of the home-state formation documents and the statutory agent's acceptance (Form M002). No publication.", "在线（亚利桑那商业中心）或以纸质表格提交，附母州 60 天内出具的存续证明、母州设立文件的核证副本和法定代理人接受书（M002 表）。无需登报公告。"],
    url: "https://azcc.gov/corporations/forms",
    feeNote: ["$150; $35 more for expedited processing.", "150 美元；加急另付 35 美元。"],
    proof: ["https://azcc.gov/docs/default-source/corps-files/instructions/l025i-instructions-application-for-registration7123c29d942a43c2810255de1f40cd19.pdf?sfvrsn=e87d3b27_12", "Filing fee. The filing fee is $150.00. For Expedited processing, add $35.00."] }),
  // UNVERIFIED: ilsos.gov refused every automated read; the form's number and name are from its own index, the fee isn't stated
  E({ id: "il-sos-foreign-llc", where: "IL", level: "state", needs: { foreignEntity: true }, method: "online", order: 12, cur: "USD",
    form: "Form LLC-45.5, Application for Admission to Transact Business", title: ["Registration of an out-of-state LLC", "外州 LLC 在伊利诺伊州注册"],
    agency: ["Illinois Secretary of State, Department of Business Services", "伊利诺伊州州务卿商业服务处"],
    how: ["An LLC formed elsewhere applies to the Secretary of State for admission before doing business in Illinois.", "在外州成立的 LLC 须在伊利诺伊州开展业务前向州务卿申请准入。"],
    url: "https://www.ilsos.gov/publications/business-services/llc.html" }),

  /* ------------------------------------------------------------------ trade names (doing business under another name) */
  E({ id: "ny-assumed-name", where: "NY", level: "state", needs: { reference: true }, method: "pdf_mail", order: 14, cur: "USD",
    form: "Certificate of Assumed Name (General Business Law section 130)", title: ["Assumed name (DBA) for a company trading under a brand name", "公司以品牌名经营时的假定名称（DBA）登记"],
    agency: ["New York Department of State, Division of Corporations", "纽约州务院公司处"],
    how: ["A corporation or LLC doing business under a name other than its legal name files a Certificate of Assumed Name, listing each county where it uses the name (New York City is five counties).", "以法定名称以外的名称经营的公司或 LLC，须提交假定名称证书，列明使用该名称的每个县（纽约市为五个县）。"],
    url: "https://dos.ny.gov/certificate-assumed-name-domestic-and-foreign-business-corporations",
    feeNote: ["The fee depends on the counties named; see the Department's instructions.", "费用取决于所列县份，见州务院说明。"],
    proof: ["https://dos.ny.gov/certificate-assumed-name-domestic-and-foreign-business-corporations", "Indicate the county or counties in which the entity does business or intends to do business in this State."] }),
  // UNVERIFIED: both county pages answer automated reads with a 403 (Cloudflare); fees aren't stated
  E({ id: "lac-fbn", where: "LAC", level: "county", needs: { reference: true }, method: "online", order: 14, cur: "USD",
    form: "Fictitious Business Name Statement", title: ["Fictitious business name (DBA)", "虚拟商业名称（DBA）登记"],
    agency: ["Los Angeles County Registrar-Recorder/County Clerk", "洛杉矶县登记官/书记官办公室"],
    how: ["A business trading under a name other than its legal name files a Fictitious Business Name Statement with the county clerk and publishes it in a local newspaper.", "以法定名称以外的名称经营的企业，须向县书记官提交虚拟商业名称声明，并在当地报纸刊登。"],
    url: "https://lavote.gov/home/county-clerk/fictitious-business-names/frequently-asked-questions" }),
  E({ id: "scc-fbn", where: "SCC", level: "county", needs: { reference: true }, method: "in_person", order: 14, cur: "USD",
    form: "Fictitious Business Name Statement", title: ["Fictitious business name (DBA)", "虚拟商业名称（DBA）登记"],
    agency: ["Santa Clara County Clerk-Recorder", "圣克拉拉县书记官/登记官办公室"],
    how: ["A business trading under a name other than its legal name files a Fictitious Business Name Statement with the County Clerk-Recorder and publishes it in a local newspaper.", "以法定名称以外的名称经营的企业，须向县书记官/登记官提交虚拟商业名称声明，并在当地报纸刊登。"],
    url: "https://www.santaclaracounty.gov/node/286" }),
];
