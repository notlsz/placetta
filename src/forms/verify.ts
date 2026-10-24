// The verification pass of 2026-10-23 (docs/COVERAGE.md): every UNVERIFIED entry taken back to the government's own
// page, US first (the beachhead metros, then every other US row), then Canada and Mexico, Asia, Europe and the rest.
// Same rules as src/forms/finish.ts: a proof is a sentence of under 25 words copied from the official page as fetched
// (a government domain, or the official legislation site), with the URL read and the day; each was checked with the
// matcher in scripts/eval/proof-read.py before it was written here. A row whose official page couldn't be read stays
// UNVERIFIED, and VERIFY_BLOCKED says what blocked it. No fee, deadline or URL is stated that a page didn't state.
//
// VERIFY_FIXES add a proof to an entry already in the registry, or move a link that pointed at another city's page or
// at a page that isn't the agency's (src/forms/audit.ts applies them, after every other layer). VERIFY_FORMS are core
// steps a guide city was missing.
import type { Fix } from "./audit";
import type { OfficialForm } from "./registry";
import { E, type EuEntry } from "./europe";

export const READ_VER = "2026-10-23";
/** A proof read in this pass: the entry, the page read, the sentence as written, its English gloss when the page isn't in English, why. */
const P = (id: string, read: string, quote: string, en: string | undefined, why: string): Fix =>
  ({ id, info: read, proof: { read, quote, checked: READ_VER, ...(en ? { en } : {}) }, why });
const V = (o: EuEntry): OfficialForm => { const f = E(o); if (f.proof) f.proof.checked = READ_VER; return f; };
/** Pages that refused every automated read (a 403, a Cloudflare wall, a page built in script), read by a person in a
    browser on 2026-10-24 and the sentence copied as it appears there; scripts/eval/proof-read.py logs them as method
    "browser" (BROWSER_SEEN), with that day, which no automated run can advance. */
export const BROWSER_READ = "2026-10-24";
const PB = (id: string, read: string, quote: string, why: string, extra: Partial<Fix> = {}): Fix => {
  const f = P(id, read, quote, undefined, why); f.proof!.checked = BROWSER_READ; return { ...f, ...extra };
};

/* ------------------------------------------------------------------ pages read for more than one entry */
const ABC_NEW = "https://www.abc.ca.gov/licensing/license-forms/new-license-application/";
const AUS_SBP = "https://www.austintexas.gov/development-services/small-business-permitting";
const NRS_76 = "https://www.leg.state.nv.us/nrs/nrs-076.html";
const SCC_DEH = "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and";
const I5472 = "https://www.irs.gov/instructions/i5472";
const IRS = (n: string) => `https://www.irs.gov/forms-pubs/about-form-${n}`;
const LV_BUILDING = "https://www.lasvegasnevada.gov/Business/Permits-Licenses/Building-Permits";
const AZ_WC = "https://www.azleg.gov/ars/23/00961.htm";
const TOR_BUILDING = "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/";
const VCH_FOOD = "https://www.vch.ca/en/health-topics/food-safety";
const LAC_FBN = "https://www.lavote.gov/home/county-clerk/fictitious-business-names/general-info";
const SCC_FBN = "https://clerkrecorder.santaclaracounty.gov/business-services/apply-renew-or-refile-fictitious-business-name-fbn-statement";
const ILCS_45_5 = "https://www.ilga.gov/Documents/legislation/ilcs/documents/080501800K45-5.htm";
const HSC = (n: string) => `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=${n}`;

/** California ABC's new license application page lists each form with whether a retail applicant files it. */
const abc = (id: string, quote: string): Fix => P(id, ABC_NEW, quote, undefined, "Proof added from ABC's New License Application page, which lists the form and when a retail applicant files it.");
/** An IRS form's own About page. */
const irs = (id: string, n: string, quote: string): Fix => P(id, IRS(n), quote, undefined, "Proof added from the IRS's About page for the form.");

export const VERIFY_FIXES: Fix[] = [
  /* ---------------------------------------------------------------- the beachhead metros */
  P("dc-dlcp", "https://dlcp.dc.gov/service/business-licensing-division", "Anyone engaging in business activity within the District is required to be licensed in accordance with the specific activity conducted", undefined,
    "Proof added from DLCP's Business Licensing Division page; the entry linked DLCP's home page, which names no requirement."),
  P("dc-workers-comp", "https://code.dccouncil.gov/us/dc/council/code/sections/32-1534", "Every employer shall secure the payment of compensation under this chapter:", undefined,
    "Proof added from D.C. Code section 32-1534 on the DC Council's code site: the DOES brochure's columns run together when read, so no sentence can be quoted from it."),
  P("hou-fire", "https://www.houstontx.gov/fire/formsandpermits/", "If the permit is for a hazardous material or activity an additional form must be completed.", undefined,
    "Proof added from the Houston Fire Department's Forms and Permits page, which lists the hazardous materials and high-piled storage permits."),
  P("dal-building", "https://dallascityhall.com/departments/sustainabledevelopment/buildinginspection/Pages/commercial_overview.aspx", "A commercial building permit is an official authorization required before constructing, altering, or renovating a commercial property.", undefined,
    "Proof added from Dallas Permitting and Inspections' commercial permits page; the fees page the entry linked states no requirement."),
  P("la-alcohol-cup", "https://planning.lacity.gov/project-review/alcohol-sales", "In addition to a CUB or RBP authorization, applicants must obtain a license from the California Department of Alcohol and Beverage Control", undefined,
    "Proof added from Los Angeles City Planning's Alcohol and Entertainment page; the restaurant checklist PDF the entry linked (business.lacity.gov) is a 404."),
  P("la-lafd-ops", "https://lafd.org/operational-fire-permits", "With a valid BTRC, customers can apply for a Fire Permit.", undefined,
    "Proof added from LAFD's Operational Fire Permits page: the permit is applied for through the Office of Finance once the business holds its tax registration certificate."),
  P("la-cupa-hmbp", "https://lafd.org/hmbp-threshold-reporting-guidance", "you will be required to submit a Hazardous Materials Business Plan (HMBP) through CERS", undefined,
    "Proof added from the LAFD CUPA's threshold guidance: a facility over the reporting thresholds files its plan in CERS."),
  P("nyc-dcwp-license", "https://www.nyc.gov/site/dca/businesses/licenses.page", "Through licensing more than 45,000 businesses in over 45 industries, DCWP ensures fair competition", undefined,
    "Proof added from DCWP's licenses page, which lists the industries that need its license (a library reference entry)."),
  P("ga-sos-foreign", "https://georgia.gov/register-llc-georgia-secretary-state", "Foreign entities must follow a different procedure to do business in Georgia", undefined,
    "Proof added from Georgia's state portal (georgia.gov): sos.ga.gov refused every automated read (403)."),
  P("nv-workers-comp", "https://www.leg.state.nv.us/nrs/nrs-616b.html", "NRS 616B.633 Applicability to all employers who employ at least one employee.", undefined,
    "Proof added from NRS chapter 616B on the Nevada Legislature's site: the Division's brochure prints broken ligatures, so its sentences can't be quoted."),
  P("cook-food-license", "https://cookcountypublichealth.org/contact-us/permits-and-licenses/retail-food-establishment-application/", "CCDPH inspects retail food establishments, issues licenses and permits for unincorporated areas,", undefined,
    "Proof added from the Cook County Department of Public Health's application page (unincorporated Cook County only; Chicago licenses its own)."),

  /* ---------------------------------------------------------------- California */
  abc("ca-abc-217", "ABC-217 Required Required Application Questionnaire – Signatures must be notarized or witnessed by an ABC Employee."),
  abc("ca-abc-258", "ABC-258 Required Not required, unless applying for the Type 75 or Type 85 Planned Operations Retail."),
  abc("ca-abc-255", "ABC-255 Required Not required, unless applying for the Type 17/20 combo license Zoning Affidavit"),
  abc("ca-abc-140", "ABC-140 Required Required Certificate re Chapter 15 Tied-House Restrictions – Required for corporations, limited partnerships and limited liability companies."),
  abc("ca-abc-247", "ABC-247 Required Not Required Statement re: Residences (Rule 61.4, Residences Within 100 feet)."),
  abc("ca-abc-257", "ABC-257 Required Required Licensed Premises Diagram/Planned Operation – Drawing of your floor plan,"),
  abc("ca-abc-211", "ABC-211-SIG Required Required Application Signature Sheet (“Sign On”) – Signature page for applicants who are unable to appear at the ABC district office"),
  abc("ca-abc-243", "ABC-243 Required Required Corporate Questionnaire"),
  abc("ca-abc-256", "ABC-256-LLC Required Required Limited Liability Company Questionnaire."),
  P("ca-abc-244", "https://www.abc.ca.gov/licensing/license-forms/", "ABC-244 Mar-25 Change in Licensee Information or Licensed Premises", undefined,
    "Proof added from ABC's licensing forms index, which lists the current revision."),

  /* ---------------------------------------------------------------- Texas */
  P("tx-franchise", "https://comptroller.texas.gov/taxes/franchise/", "The Texas franchise tax is a privilege tax imposed on each taxable entity formed or organized in Texas or doing business in Texas.", undefined,
    "Proof added from the Comptroller's franchise tax page."),
  P("aus-building", AUS_SBP, "Required to erect, construct, enlarge, alter, repair, improve, or convert any building or structure within the City's zoning jurisdiction", undefined,
    "Proof added from Austin Development Services' small business permitting page; the commercial plan review page the entry linked states no requirement in a sentence."),
  P("aus-hazmat", AUS_SBP, "Required for all businesses that are storing or using hazardous materials above-ground.", undefined,
    "Proof added from Austin Development Services' small business permitting page (the Austin Fire permit)."),
  P("sat-food", "https://www.sa.gov/Directory/Departments/SAMHD/Licenses-Food-Permits/Food-Establishment-License", "before a food establishment license is issued and the establishment may open for business.", undefined,
    "Proof added from Metro Health's Food Establishment License page; the city moved it from sanantonio.gov to sa.gov."),
  P("ftw-food-permit", "https://www.fortworthtexas.gov/files/assets/public/v/2/environmental-services/health/documents/fw-food-ordinance-chpt-16.pdf", "No person shall operate a food establishment without a current, valid food establishment permit issued by the health department.", undefined,
    "Proof added from Fort Worth's food ordinance (City Code chapter 16, section 16-111), published by the city."),

  /* ---------------------------------------------------------------- Florida */
  P("hc-business-tax", "https://www.hillstaxfl.gov/taxes/business-tax-services/new-regulated-businesses/", "New businesses must apply for a new business tax account and obtain a local business tax receipt prior to engaging in their enterprise.", undefined,
    "Proof added from the Hillsborough County Tax Collector's Open a Business page."),
  P("ocfl-business-tax", "https://www.octaxcol.com/taxes/business-taxes/obtain-new-business-tax-receipt/", "you must first obtain a municipal Business Tax Receipt prior to obtaining an Orange County Business Tax Receipt.", undefined,
    "Proof added from the Orange County Tax Collector's page: inside Orlando and the other listed cities, the city's receipt comes first, then the county's."),
  P("fl-fictitious", "https://www.flsenate.gov/Laws/Statutes/2025/865.09", "A person may not engage in business under a fictitious name unless the person first registers the name with the division", undefined,
    "Proof added from section 865.09, Florida Statutes (the Florida Senate's statute site). The Division's own page says the registration \"is not required to form a corporation, limited liability company or limited partnership\", so it is now a library reference, as Los Angeles's and Santa Clara's are, and no longer added to every Florida plan."),
  P("fl-sunbiz-foreign-llc", "https://www.flsenate.gov/Laws/Statutes/2025/605.0902", "A foreign limited liability company may not transact business in this state until it obtains a certificate of authority from the department.", undefined,
    "Proof added from section 605.0902, Florida Statutes; the Division's forms page lists the forms but states no requirement. No fee is claimed."),

  /* ---------------------------------------------------------------- Minnesota, Ohio, Oregon */
  P("mn-tax", "https://www.revenue.state.mn.us/so/node/9571", "Before you make any taxable sales in Minnesota, you must register for a Minnesota Tax ID Number and a Sales and Use Tax account.", undefined,
    "Proof added from the Department of Revenue's Registering Your Business page."),
  P("mn-ui", "https://ui.mn.gov/employers/help-and-support/emp-hbook/new-registration.jsp", "every individual or organization that pays covered wages in Minnesota must register with the Minnesota Unemployment Insurance (UI) Program.", undefined,
    "Proof added from the UI Program's employer handbook page."),
  P("mpls-food-license", "https://minneapolismn.gov/business-services/licenses-permits-inspections/business-licenses/food-restaurants/restaurant-coffee-cafe/restaurant/", "A license is needed for food or beverages made for on-site dining, carryout, or delivery.", undefined,
    "Proof added from the City of Minneapolis restaurant license page."),
  P("oh-pic", "https://odh.ohio.gov/know-our-programs/food-safety-program/food-safety-certification/", "must have at least one person on site at all times during operation who has obtained an Ohio PIC certification in food protection.", undefined,
    "Proof added from the Ohio Department of Health's food safety certification page; the rule PDF the entry linked approves courses and states no duty."),
  P("oh-workers-comp", "https://codes.ohio.gov/ohio-revised-code/section-4123.35", "every private employer and every publicly owned utility shall pay annually in the month of June immediately preceding the policy year", undefined,
    "Proof added from Ohio Revised Code section 4123.35 (codes.ohio.gov): bwc.ohio.gov refused the connection."),
  P("pdx-tax", "https://www.portland.gov/revenue/business-tax", "must register for a Revenue Division tax account within 60 days.", undefined,
    "Proof added from the Revenue Division's business tax page (businesses operating in Portland or Multnomah County)."),

  /* ---------------------------------------------------------------- federal */
  P("irs-5472", IRS("5472"), "Corporations file Form 5472 to provide information required under sections 6038A and 6038C when reportable transactions occur with a foreign or domestic related party.", undefined,
    "Proof added from the IRS's About Form 5472 page."),
  irs("irs-w7", "w-7", "Use Form W-7 to apply for an IRS individual taxpayer identification number (ITIN)."),
  irs("irs-8821", "8821", "File Form 8821 to: Authorize any individual, corporation, firm, organization, or partnership you designate to inspect and/or receive your confidential information"),
  irs("irs-2848", "2848", "Use Form 2848 to authorize an individual to represent you before the IRS."),
  irs("irs-8832", "8832", "An eligible entity uses Form 8832 to elect how it will be classified for federal tax purposes,"),
  irs("irs-8822b", "8822-b", "Use Form 8822-B to notify the Internal Revenue Service if you changed: Business mailing address."),
  irs("irs-2553", "2553", "files this form to make an election under section 1362(a) to be an S corporation."),
  irs("irs-7004", "7004", "Use Form 7004 to request an automatic 6-month extension of time to file certain business income tax, information, and other returns."),
  P("irs-1120", I5472, "it will now be required to file a pro forma Form 1120, U.S. Corporation Income Tax Return, with Form 5472 attached", undefined,
    "Proof added from the Instructions for Form 5472, the page the entry already linked."),
  P("uspto-tm", "https://www.uspto.gov/trademarks/basics/do-i-need-attorney", "If you are a foreign-domiciled trademark applicant or registrant, you must have a U.S.-licensed attorney represent you.", undefined,
    "Proof added from the USPTO's page the entry already linked."),
  P("fda-prior-notice", "https://www.fda.gov/regulatory-information/search-fda-guidance-documents/guidance-industry-what-you-need-know-about-prior-notice-imported-food-shipments", "FDA must be notified in advance of any shipments of food for humans and other animals that are imported into the U.S.,", undefined,
    "Proof added from FDA's prior notice guidance, the page the entry already linked."),
  P("cpsc-cert", "https://www.cpsc.gov/Business--Manufacturing/Testing-Certification", "Certificates are required to accompany the applicable product or shipment of products covered by the certificate,", undefined,
    "Proof added from CPSC's Testing and Certification page, the page the entry already linked."),
  P("fmc-18", "https://www.govinfo.gov/content/pkg/CFR-2025-title46-vol9/pdf/CFR-2025-title46-vol9-sec515-3.pdf", "may advertise, hold oneself out, or act as an ocean transportation intermediary unless that person holds a valid license issued by the Commission.", undefined,
    "Proof added from 46 CFR 515.3 on GovInfo: www2.fmc.gov refused every automated read (403)."),
  P("phmsa-5800", "https://www.ecfr.gov/api/renderer/v1/content/enhanced/current/title-49?part=107&section=107.601", "The registration and fee requirements of this subpart apply to any person who offers for transportation, or transports, in foreign, interstate or intrastate commerce", undefined,
    "Proof added from 49 CFR 107.601 on the eCFR (its rendered text; the reader page builds in script): phmsa.dot.gov refused every automated read (403)."),

  /* ---------------------------------------------------------------- links that pointed at another city's page or another agency's */
  P("scc-health-permit", SCC_DEH, "Complete the permit to operate application", undefined,
    "Link fixed: the proof was read on a City of Milpitas PDF (milpitas.gov) for a County of Santa Clara permit that San José, Cupertino and Milpitas stores all file; it now cites the county Department of Environmental Health's own page. deh.santaclaracounty.gov refuses curl (403), so the page was read through WebFetch."),
  P("scc-plan-check", SCC_DEH, "Submit your complete plan check application, plans, and supporting documents in a digital accessible format", undefined,
    "Link fixed: the proof was read on San José's economic development site (sjeconomy.com) for a county filing that every Santa Clara County city's stores make; it now cites the county Department of Environmental Health's plan review page (read through WebFetch: the site refuses curl)."),
  P("ca-cdtfa", "https://www.cdtfa.ca.gov/services/permits-licenses.htm", "you are required to have a seller's permit and prominently display it at your place of business.", undefined,
    "Link fixed: the state seller's permit was proved from San Francisco's restaurant guide (sf.gov), shown in every California city's plan; it now cites CDTFA's own permits page."),
  P("nv-sbl", NRS_76, "A person shall not conduct a business in this State unless and until the person obtains a state business license", undefined,
    "Link fixed: the proof was read on a Division of Public and Behavioral Health radiation-machines notice (dpbh.nv.gov) for the Secretary of State's license; it now cites NRS 76.100 on the Nevada Legislature's site."),
  P("nv-silverflume", NRS_76, "the person must obtain the state business license at the time of filing the initial or annual list", undefined,
    "Link fixed: same radiation-machines notice (dpbh.nv.gov); now NRS 76.100, which ties the state business license to the LLC's initial list."),
  { id: "bos-cv", url: "https://www.boston.gov/departments/licensing-board/how-get-common-victualler-license",
    why: "Link fixed: the filing link was a Google Forms address (docs.google.com), not an official site; it now opens the Licensing Board's own page, which links the current application." },

  /* ---------------------------------------------------------------- read in a browser on 2026-10-24 (each site refused every automated read) */
  PB("lac-fbn", LAC_FBN, "Persons doing business for profit under a fictitious name (does not include surname in company name).",
    "Proof added from the Registrar-Recorder/County Clerk's Fictitious Business Names general information page (lavote.gov answers automated reads with a 403, so it was read in a browser). The page also says \"The statement must be filed in county of principal place of business\". The link moves from the FAQ to this page, which states who files. No fee is claimed."),
  PB("scc-fbn", SCC_FBN, "Online services are now available through our Self-Service portal.",
    "Link fixed and proof added: santaclaracounty.gov/node/286 is a 404; the Clerk-Recorder's own FBN page (read in a browser: the site answers automated reads with a 403) offers filing online, in person, by mail and by email to bus-rdc@rec.sccgov.org, so the method is now online. It says \"Up to 5 workdays to process your application.\" No fee is stated on the page, so none is claimed.",
    { takesSource: `${SCC_FBN} (${BROWSER_READ})` }),
  PB("il-sos-foreign-llc", ILCS_45_5, "before transacting business in this State, a foreign limited liability company shall be admitted to do so by the Secretary of State.",
    "Proof added from 805 ILCS 180/45-5 on the Illinois General Assembly's site (read in a browser: ilga.gov and ilsos.gov refused every automated read). The filing link stays on the Secretary of State's LLC page. No fee is claimed."),
  PB("ca-food-handler", HSC("113948"), "handler who is hired on or after June 1, 2011, shall obtain a food handler card within 30 days after the date of hire.",
    "Source fixed: the statewide rule was proved from a Ventura County publication (rmadocs.venturacounty.gov), one county's page shown in every California plan; it now cites Health and Safety Code section 113948 on leginfo.legislature.ca.gov (read in a browser: the site answers automated reads with a 403), which also says \"Food handler cards shall be valid for three years from the date of issuance\"."),
  PB("ca-food-manager", HSC("113947.1"), "There shall be at least one food safety certified owner or employee at each food facility.",
    "Source fixed: the statewide rule was proved from a Ventura County publication (rmadocs.venturacounty.gov); it now cites Health and Safety Code section 113947.1 on leginfo.legislature.ca.gov (read in a browser: the site answers automated reads with a 403)."),

  /* ---------------------------------------------------------------- Canada */
  P("ca-bc-liquor", "https://www2.gov.bc.ca/gov/content/employment-business/business/liquor-regulation-licensing/liquor-licence-permits", "If you want to sell liquor in B.C., you need a liquor licence or permit.", undefined,
    "Proof added from the Province of British Columbia's liquor licences page, the page the entry already linked."),

  /* ---------------------------------------------------------------- Europe */
  P("de-eori", "https://www.zoll.de/DE/Fachthemen/Zoelle/EORI-Nummer/eori-nummer_node.html", "Die EORI-Nummer ist insbesondere in Zollanmeldungen und summarischen Ein- und Ausgangsanmeldungen für die Identifizierung der Beteiligten anzugeben.",
    "The EORI number must be given in particular in customs declarations and summary entry and exit declarations, to identify the parties.", "Proof added from German customs' own EORI page (zoll.de)."),
  P("fr-eori", "https://www.douane.gouv.fr/", "Faire une demande d'immatriculation EORI Pour échanger des marchandises hors de l’UE",
    "Apply for an EORI registration: to trade goods outside the EU", "Proof added from French customs' home page (douane.gouv.fr); its EORI service pages answered 404."),

  /* ---------------------------------------------------------------- Gulf, South America and Africa */
  P("qa-moci", "https://www.moci.gov.qa/en/", "Register your business and obtain official commercial registration.", undefined,
    "Proof added from the Ministry of Commerce and Industry's own site."),
  P("br-redesim-cnpj", "https://www.gov.br/empresas-e-negocios/pt-br/redesim", "Inscreva seu negócio no CNPJ.", "Register your business in the CNPJ.",
    "Proof added from Redesim's page on gov.br, the page the entry already linked."),
  P("br-anvisa", "https://www.gov.br/anvisa/pt-br/assuntos/alimentos", "Na área de alimentos, a Anvisa coordena, supervisiona e controla as atividades de registro, inspeção, fiscalização e controle de riscos,",
    "For food, Anvisa coordinates, supervises and controls registration, inspection, enforcement and risk control,", "Proof added from ANVISA's food page on gov.br."),
  P("ar-cuit", "https://www.argentina.gob.ar/obtener-el-cuit", "La CUIT (clave única de identificación tributaria) es un código con el que ARCA identifica a trabajadores autónomos, comercios y empresas.",
    "The CUIT (unique tax identification code) is the code with which ARCA identifies self-employed workers, shops and companies.", "Proof added from the national government's page on getting the CUIT (argentina.gob.ar)."),
  P("pe-ruc", "https://www.gob.pe/284-inscripcion-en-el-ruc", "debes inscribirte al Registro Único de Contribuyente (RUC) de la Sunat.",
    "you must register in SUNAT's Single Taxpayer Register (RUC).", "Proof added from the Peruvian state's service platform (gob.pe), SUNAT's own procedure page for RUC registration."),
  P("ng-cac", "https://www.cac.gov.ng/", "Official Nigerian Corporate Registry, Register, Search or Verify a Business in Minutes.", undefined,
    "Proof added from the Corporate Affairs Commission's own site."),
  P("ke-kra-pin", "https://www.kra.go.ke/business/companies-partnerships/companies-partnerships-pin-taxes/companies-partnerships-pin-registration", "made within thirty days of the applicant becoming liable for that tax.", undefined,
    "Proof added from KRA's PIN registration page for companies (quoting the Tax Procedures Act's registration rule)."),
];

/** Entries that are library references from now on: listed and answered, never added to a plan (the filing applies
    only to some businesses, and the intake doesn't ask). */
export const VERIFY_REFERENCE = ["fl-fictitious"];

/** Core steps a guide city was missing, each read on the agency's own page. */
export const VERIFY_FORMS: OfficialForm[] = [
  V({ id: "lv-building", where: "LVC", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 65, cur: "USD",
    form: "Commercial building permit", title: ["Building permit for the build-out", "装修建筑许可证"],
    agency: ["City of Las Vegas Building and Safety", "拉斯维加斯市建筑与安全局"],
    how: ["For an address inside City of Las Vegas limits, the building permit for a commercial build-out is applied for with the city's Building and Safety department, after any zoning review; only a Nevada licensed contractor may pull it.", "适用于拉斯维加斯市界内的地址：商业装修的建筑许可向市建筑与安全局申请，须先完成所需的分区审查；只有内华达州持牌承包商可以申领。"],
    url: LV_BUILDING, plain: ["The city's permit to build out the space, pulled by a Nevada licensed contractor.", "市政府对场所装修的许可，须由内华达州持牌承包商申领。"],
    proof: [LV_BUILDING, "Only a Nevada licensed contractor may obtain a building permit for commercial construction."] }),
  V({ id: "az-workers-comp", where: "AZ", level: "state", needs: { employees: true }, method: "insurer", order: 61, cur: "USD",
    form: "Workers' compensation policy", title: ["Workers' compensation insurance", "工伤保险"],
    agency: ["Industrial Commission of Arizona", "亚利桑那州工业委员会"],
    how: ["Bought from an insurer licensed in the state (or the state fund) before the first employee starts; the insurer reports the policy to the state.", "在首位员工入职前，向该州持牌保险公司（或州基金）购买；由保险公司向州政府报备保单。"],
    url: AZ_WC, plain: ["Insurance that covers staff hurt at work, which the state requires of employers.", "为工作中受伤的员工提供保障的保险，州法律要求雇主购买。"],
    proof: [AZ_WC, "Employers shall secure workers' compensation to their employees in one of the following ways:"] }),
  V({ id: "ca-tor-building", where: "CA-TOR", level: "city", segs: ["restaurant", "retail", "warehouse"], needs: { buildout: true }, method: "portal", order: 65, cur: "CAD",
    form: "Building permit (Toronto Building)", title: ["Building permit for the build-out", "装修建筑许可证"],
    agency: ["City of Toronto, Toronto Building", "多伦多市建筑局（Toronto Building）"],
    how: ["Applied for with Toronto Building before the work starts; the plans are reviewed for the Ontario Building Code, the zoning by-laws and other applicable law.", "开工前向多伦多市建筑局申请；图纸须按《安大略省建筑规范》、分区法规及其他适用法律审查。"],
    url: TOR_BUILDING, plain: ["The city's permit to build out the space, with the plans checked against the building code and zoning.", "市政府对场所装修的许可，图纸须符合建筑规范和分区规定。"],
    proof: [TOR_BUILDING, "A building permit is required under the Building Code Act for most construction, demolition, additions, or major renovations."] }),
  V({ id: "ca-van-food-permit", where: "CA-VAN", level: "city", segs: ["restaurant", "retail"], needs: { food: true }, method: "in_person", order: 75, cur: "CAD",
    form: "Food premises health permit", title: ["Health permit to operate a food premises", "食品场所卫生许可证"],
    agency: ["Vancouver Coastal Health, Environmental Health", "温哥华沿岸卫生局环境卫生处"],
    how: ["Issued by Vancouver Coastal Health's environmental health officers once the premises' plans are approved and the premises pass inspection, before it opens.", "由温哥华沿岸卫生局环境卫生官员在场所图纸获批并通过检查后、开业前签发。"],
    url: VCH_FOOD, plain: ["The health permit a restaurant or food shop needs before it opens.", "餐厅或食品店开业前须取得的卫生许可证。"],
    proof: [VCH_FOOD, "We facilitate the process of issuing permits and granting health approvals required for operating food premises."] }),
];

/** What still blocks each entry that stays UNVERIFIED after this pass (read 2026-10-23; Los Angeles's and Santa Clara's
    fictitious business names and Illinois's foreign LLC admission left on 2026-10-24, read in a browser). */
export const VERIFY_BLOCKED: Record<string, string> = {
  "ca-prop65": "OEHHA's and p65warnings.ca.gov's pages build their text in script (curl gets an empty shell) and leginfo.legislature.ca.gov answered 403; the 10-employee threshold also isn't asked by the intake",
  "dekalb-plan-review": "dekalbpublichealth.com refused the read on 2026-10-23; Georgia's food rules (dph.georgia.gov) say the county board of health reviews the plans",
  "dekalb-food-permit": "dekalbpublichealth.com refused the read on 2026-10-23; Georgia's food rules (dph.georgia.gov) say the county board of health issues the permit",
  "ca-on-food-handler": "ontario.ca/laws builds the regulation's text in script",
  "ca-van-business-licence": "vancouver.ca answered 403",
  "ca-qc-qst": "revenuquebec.ca answered 403",
  "ca-qc-cnesst": "cnesst.gouv.qc.ca answered 403",
  "mx-infonavit": "portalmx.infonavit.org.mx refused the connection and gob.mx/infonavit builds in script",
  "mx-mx-cmx-isn": "finanzas.cdmx.gob.mx links only to the payment system, and the Fiscal Code on data.consejeria.cdmx.gob.mx refused the connection",
  "mx-nle-isn": "nl.gob.mx answered 403",
  "mx-jal-isn": "hacienda.jalisco.gob.mx returns an empty script shell",
  "mx-roo-isn": "qroo.gob.mx answered 503 and sefiplan.qroo.gob.mx refused the connection",
  "mx-cdmx-pc": "proteccioncivil.cdmx.gob.mx refused the connection",
  "mx-mty-pc": "monterrey.gob.mx's pages name Protección Civil only in menus",
  "mx-mty-alcohol": "monterrey.gob.mx links the alcohol portal (alcoholes.monterrey.gob.mx) without a sentence stating the requirement",
  "cn-customs": "customs.gov.cn refused the connection",
  "cn-open-hz": "zjzwfw.gov.cn refused the connection",
  "cn-open-cd": "sczwfw.gov.cn refused the connection",
  "cn-open-cq": "zwykb.cq.gov.cn answers with a login shell, no service text",
  "cn-open-tj": "zwfw.tj.gov.cn returns an empty script shell",
  "cn-open-xa": "zwfw.shaanxi.gov.cn refused the connection",
  "de-transparenz": "transparenzregister.de builds in script, and gesetze-im-internet.de refused the connection",
  "ie-outdoor": "dublincity.ie answered 522",
  "be-afsca": "favv-afsca.be builds in script",
  "no-brreg": "brreg.no's page carries menus only, no sentence stating the duty",
  "ae-dxb-customs": "dubaicustoms.gov.ae's page carries no sentence stating the registration",
  "sa-misa": "misa.gov.sa's page carries menus only",
  "sa-cr": "mc.gov.sa refused the connection",
  "sa-balady": "balady.gov.sa refused the connection",
  "sa-zatca": "zatca.gov.sa's page carries no sentence stating the registration",
  "sa-gosi": "gosi.gov.sa returns an empty script shell",
  "sa-civil-defense": "998.gov.sa wasn't readable",
  "sa-sfda": "sfda.gov.sa's page carries no sentence stating the licence",
  "qa-tax": "dhareeba.gov.qa's page carries no sentence stating the registration",
  "qa-trade-licence": "mm.gov.qa returns an empty script shell",
  "kw-moci": "moci.gov.kw's page carries menus only",
  "kw-kdipa": "kdipa.gov.kw wasn't readable",
  "bh-sijilat": "sijilat.bh's page carries no sentence stating the registration",
  "om-business": "business.gov.om redirects to a login",
  "eg-gafi": "gafi.gov.eg's pages carry menus only",
  "jo-ccd": "ccd.gov.jo's page carries no sentence stating the registration",
  "cl-empresa": "registrodeempresasysociedades.cl's page carries no sentence stating the registration",
  "cl-sii-inicio": "sii.cl's page builds in script",
  "co-rut": "dian.gov.co's RUT pages answered 404",
  "co-registro-mercantil": "ccb.org.co answered 403",
  "my-kul-licence": "dbkl.gov.my's pages carry no licensing text",
  "th-dbd": "dbd.go.th builds in script",
  "vn-erc": "dangkykinhdoanh.gov.vn's pages carry menus only",
  "id-npwp": "pajak.go.id's pages carry no sentence stating the registration",
  "ph-sec": "sec.gov.ph answered 403",
  "ph-bir": "bir.gov.ph builds in script",
  "ng-nafdac": "nafdac.gov.ng's page carries no sentence stating the registration",
  "za-cipc": "cipc.co.za's pages carry menus only",
  "ma-dgi": "tax.gov.ma's pages carry no sentence stating the registration",
};
