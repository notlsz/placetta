// Passage-level proof for the library's forms: for each, a sentence (or the opening of one) of under 25 words from the
// official page that states the requirement, the day it was read and the URL that was fetched to read it. `link` moves
// the row's source link to that page when the sentence isn't on the page the form linked before, so the link and the
// quote always match. Entries are copied from the page as fetched, never written from memory; scripts/eval/proof-log.json
// records how each page was fetched and scripts/eval/proof.ts checks every plan row of the accuracy sets against it.
// Forms added in src/forms/beachhead.ts carry their proof inline.
export type Proof = { quote: string; checked: string; read: string; link?: string };

const D = "2026-10-18";
/** A proof read from the form's own source page. */
const p = (read: string, quote: string): Proof => ({ quote, checked: D, read });
/** A proof read from another official page, which becomes the row's source link. */
const at = (read: string, quote: string): Proof => ({ quote, checked: D, read, link: read });

const BOS_GUIDE = "https://www.boston.gov/sites/default/files/file/2025/11/Eng%20resturant%20guide-.pdf";
const LAC_HOWTO = "https://admin.publichealth.lacounty.gov/eh/inspection/how-to-obtain-restaurant-food-facility-permit.htm";
const LAC_CONSTRUCT = "https://admin.publichealth.lacounty.gov/eh/inspection/construction-requirements-retail-food-facilities.htm";
const VENTURA = "https://rmadocs.venturacounty.gov/environmental-health/programs/consumer-food-protection/publications/environmental-health-californias-requirement-for-food-safety-certification.pdf";
const SNHD_PACKET = "https://media.southernnevadahealthdistrict.org/download/eh/2022/plan-review/applications/snhd-application-packet-food-202207.pdf";
const KC_FOOD = "https://kingcounty.gov/en/dept/dph/certificates-permits-licenses/food-business-permits/permanent-food-business-permit";
const FFX_HEALTH = "https://www.fairfaxcounty.gov/health/permits/new-food-establishment";
const NY_LLC = "https://dos.ny.gov/node/16156";
const MA_ALLERGEN = "https://www.mass.gov/lists/food-allergen-awareness-guidance";
const NJ_REG = "https://www.nj.gov/treasury/revenue/gettingregistered.shtml";
const SJ_SRP = "https://www.sjeconomy.com/how-we-help/programs-and-services/streamlined-restaurant-program";
const NV_TAX = "https://tax.nv.gov/faqs/register-a-business/";

export const PROOF: Record<string, Proof> = {
  /* federal */
  "irs-ss4": at("https://www.irs.gov/businesses/small-businesses-self-employed/get-an-employer-identification-number", "You never have to pay a fee for an EIN."),
  "cbp-5106": at("https://govinfo.gov/content/pkg/FR-2024-05-24/pdf/2024-11495.pdf", "shall file CBP Form 5106 with the first formal entry."),
  "cbp-301": at("https://cbp.gov/sites/default/files/assets/documents/2021-Jun/IE%20%E2%80%93%20Bond%20Recommendations.pdf", "Customs Bonds are the backbone to the importation process guaranteeing the payment of duties, taxes, and fees to CBP"),
  "cbp-ace": at("https://govinfo.gov/content/pkg/FR-2024-05-24/pdf/2024-11495.pdf", "register an entity as an Importer of Record (IOR) in the Automated Commercial Environment (ACE)"),
  "fda-ffr": at("https://www.fda.gov/Food/GuidanceRegulation/FoodFacilityRegistration/ucm324780.htm", "requires food facilities that are required to register with FDA to renew such registrations."),
  "ttb-dealer": p("https://www.ttb.gov/nrc/retail-beverage-alcohol-dealers", "Registration must be made: Before engaging in business."),

  /* New York State and City */
  "ny-dos-1336": at(NY_LLC, "Organizers form an LLC by filing the Articles of Organization"),
  "ny-dos-pub": at(NY_LLC, "Failure to publish and file the Certificate of Publication with the Department of State within 120 days"),
  "ny-dtf-17": p("https://www.tax.ny.gov/bus/st/register.htm", "If you must register to collect sales tax and need information about how to register, see Tax Bulletin"),
  "ny-dol-100": p("https://dol.ny.gov/register-unemployment-insurance-0", "You must complete an employer registration form for us to decide if you are liable under the New York State Unemployment Insurance Law."),
  "ny-wcb": p("https://www.wcb.ny.gov/content/main/coverage-requirements.jsp", "Disability and Paid Family Leave benefits coverage is required for sole proprietorships with employees, including part-time employees"),
  "ny-sla-rw": p("https://ht.nyc-business.nyc.gov/nycbusiness/description/restaurant-wine-license", "The State Liquor Authority (SLA) gives this license to restaurants."),
  "nyc-cb-notice": p("https://sla.ny.gov/community-board-faqs", "notify their community board of their intention to apply for a liquor license 30 days before filing an application"),
  "nyc-co": p("https://www.nyc.gov/site/buildings/property-or-business-owner/certificate-of-occupancy.page", "No one may legally occupy a building until the Department has issued a CO or Temporary Certificate of Occupancy (TCO) ."),
  "nyc-dob-alt": p("https://www.nyc.gov/site/buildings/property-or-business-owner/renovating-kitchens-bathrooms.page", "Department of Buildings work permits are required for most construction projects."),
  "nyc-fpc": p("https://www.nyc.gov/site/doh/business/health-academy/food-protection-online-free.page", "To receive a certification, you must first complete the free Online Food Protection Course"),
  "nyc-fse": p("https://nyc-business.nyc.gov/nycbusiness/description/food-service-establishment-permit", "A Food Protection Certificate (FPC) or course registration is needed when applying for the permit."),
  "nyc-sign": p("https://www.nyc.gov/site/buildings/property-or-business-owner/sign-permit.page", "A Sign permit (SG) must be filed for the copy (text or image) to be displayed."),

  /* California */
  "ca-llc-1": at("https://bpd.cdn.sos.ca.gov/llc/forms/llc-1.pdf", "Articles of Organization Limited Liability Company (LLC) Filing Fee - $70.00"),
  "ca-cdtfa": at("https://www.sf.gov/guide-opening-restaurant", "Every location must have this permit to sell taxable goods."),
  "ca-edd-de1": at("https://edd.ca.gov/en/payroll_taxes/am_i_required_to_register_as_an_employer", "If you operate a business and hire employees or household workers, you must register as an employer within 15 days when:"),
  "ca-food-manager": at(VENTURA, "food facilities that prepare, handle, or serve non-prepackaged potentially hazardous food (PHF), except temporary food facilities, to have at least one owner or employee"),
  "ca-food-handler": at(VENTURA, "A food handler shall obtain a food hander card within 30 days after the date of hire."),
  "ca-cdph-pfr": p("https://www.cdph.ca.gov/Programs/CEH/DFDCS/Pages/FDBPrograms/FoodSafetyProgram/ProcessedFoodRegistration.aspx", "PFR certificates are also required for general food warehouses."),
  "lac-plan-check": at(LAC_CONSTRUCT, "shall receive plan approval before starting any new construction or remodeling of any facility for use as a retail food"),
  "lac-health-permit": at(LAC_HOWTO, "After payment of the Public Health Permit fee is made, the permit will be issued."),
  "la-btrc": p("https://finance.lacity.gov/tax-education/new-business-registration/how-register-btrc", "Once you completed the registration process, you will receive a temporary Business Tax Registration Certificate or Registration Number."),
  "la-ladbs": p("https://dbs.lacity.gov/services/plan-review-permitting/building-permits", "Building Permits are required for new constructions, additions, alterations, and demolition/removal of a building or structure."),
  "sj-business-tax": at("https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/register-for-a-business-tax-certificate", "must register for a Business Tax Certificate within 90 days of starting their business."),
  "sj-building-ti": p("https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/tenant-improvement", "To obtain a building permit for a tenant improvement project, you must submit plans."),
  "sj-fire-systems": at(SJ_SRP, "Projects proposing individual carbon dioxide (CO2) tanks over 100 pounds"),
  "sj-sign": at(SJ_SRP, "Review sign permit info (if you are proposing new signage)."),
  "sj-building-final": p("https://www.sanjoseca.gov/your-government/departments-offices/planning-building-code-enforcement/building-division/inspections/inspection-success", "This final inspection is made after finish grading and the building is completed and ready for occupancy or use."),
  "scc-plan-check": at(SJ_SRP, "Ideally, required County Department of Environmental Health (DEH) plans"),
  "scc-health-permit": at("https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/register-for-a-business-tax-certificate", "County Health Permit Number (If applicable)"),
  "sf-business-registration": p("https://sftreasurer.org/registration", "In general, businesses must register if any of the below statements are true: Maintain a fixed place of business within San Francisco ."),
  "sf-formula-retail": p("https://sfplanning.org/permit/chain-stores-businesses", "By a voter initiative in 2007 (Proposition G), formula retail use was made subject to a Conditional Use Authorization in any NC district"),
  "sf-dph-plan-check": p("https://sf.gov/guide-building-and-remodeling-food-facility", "Submit your plans The process for getting a building permit includes review by the Department of Public Health."),
  "sf-dbi-building": p("https://www.sf.gov/learn-about-our-building-permit-review-processes", "Building permit projects must be sent to the required permitting agencies."),
  "sf-dph-health-permit": at("https://www.sf.gov/guide-opening-restaurant", "Apply for your Health Permit to Operate Apply within 6-8 weeks of your planned open date."),
  "sf-sign": p("https://sf.gov/step-by-step/get-permit-install-sign-or-awning", "Most exterior business signs and all awnings require a permit."),
  "sf-fire-assembly": p("https://sf-fire.org/permits", "Applications for operational or temporary permits shall be submitted to the Bureau of Fire Prevention."),
  "irv-license": at("https://www.cityofirvine.gov/sites/default/files/irvine/repository/business-license-application-checklist.pdf", "Ensure your OC Health or ABC permits are ready if you’re in food or beverage service."),
  "oc-plan-check": p("https://www.ochealthinfo.com/services-programs/environmental-health/plan-check", "Plan Approval: Congratulations on the approval of your submitted plans, which allows you to initiate construction."),
  "oc-health-permit": p("https://ochealthinfo.com/about-hca/public-health-services/environmental-health-division/food/food-facility-health-permit", "A health permit will be issued upon completion of a final inspection."),
  "sdg-business-tax": at("https://www.sandiego.gov/treasurer/taxesfees/btax", "All businesses operating in the City of San Diego are required to obtain a Business Tax Certificate."),
  "sdg-co": p("https://www.sandiego.gov/development-services/forms-publications/information-bulletin/585", "A Certificate of Occupancy is issued upon final approval of all inspections for work authorized under a building permit and associated permits."),
  "sdc-plan-check": p("https://www.sandiegocounty.gov/content/dam/sdc/deh/fhd/food/pdf/publications_plancheckreference.pdf", "The Plan Check Unit reviews and approves plans for the construction and remodeling of health-regulated facilities."),
  "sdc-health-permit": p("https://www.sandiegocounty.gov/content/dam/sdc/deh/fhd/food/pdf/publications_newbusiness664.pdf", "Apply for a Health Permit"),
  "ac-plan-check": p("https://health.alamedacountyca.gov/alameda-county-plan-check-guide-for-retail-food-facilities/", "shall receive plan approval before starting any new construction or remodeling of any facility for use as a retail food facility."),
  "ac-health-permit": at("https://www.oaklandca.gov/Business/For-Business-Owners/Starting-Your-Business", "will need permits from the Alameda County Department of Environmental Health."),
  "oak-zoning": p("https://www.oaklandca.gov/Planning-Building/Your-Commercial-Projects-Permits/Zoning-Clearance-Permit", "You’ll need to obtain the Zoning Clearance Permit before applying for your business tax certificate."),
  "oak-business-tax": at("https://www.oaklandca.gov/Business/For-Business-Owners/Starting-Your-Business", "need to file a Business Tax Certificate and pay an annual tax."),

  /* Texas */
  "tx-205": p("https://www.sos.state.tx.us/corp/instructions/205.shtml", "Title 1, chapter 3, subchapter A of the BOC governs the formation of an LLC"),
  "tx-503": p("https://www.sos.state.tx.us/corp/instructions/503.shtml", "a separate assumed name certificate must be filed for each assumed name."),
  "tx-ap201": p("https://comptroller.texas.gov/taxes/permit/", "You will need to apply using form AP-201, Texas Application (PDF) ."),
  "tx-twc": p("https://www.twc.texas.gov/services/register-tax", "register with the Texas Workforce Commission (TWC) within 10 days of becoming liable."),
  "tx-food-manager": p("https://www.dshs.texas.gov/food-managers", "The food manager certification is obtained by passing a DSHS or ANSI-CFP approved food manager certification examination."),
  "tx-food-handler": p("https://www.dshs.texas.gov/food-handlers/faq.aspx", "all food employees shall successfully complete an accredited food handler training course, within 30 days of employment."),
  "hou-co": p("https://www.houstonpermittingcenter.org/hpwcode1106", "The certificate is normally issued at the time of construction or when a remodel or change of use occurs."),
  "hou-sign": p("https://houstonpermittingcenter.org/building-code-enforcement/sign-administration", "Permits must be obtained before signs can be erected, altered, or repaired."),
  "hou-buildout": p("https://www.houstonpermittingcenter.org/hpwcode1148", "Buildout permits must be on-site for inspection."),
  "hou-plan-review": p("https://www.houstonhealth.org/food-permits/opening-food-establishment", "Plans must be submitted for the following: Construction of a food establishment."),
  "hou-food-dealer": p("https://www.houstonpermittingcenter.org/hhd1003", "If inspection is passed then an operating permit is invoiced and processed when payment is received."),
  "pla-co": p("https://content.civicplus.com/api/assets/tx-plano/d2490980-662a-4f38-8def-66070c8691e5", "A Certificate of Occupancy is required to occupy any building or property with nonresidential or multifamily uses."),
  "pla-plan-review": at("https://content.civicplus.com/api/assets/234824a7-ef4c-481f-8b7b-ab68b680a9fb", "The City of Plano Food Code requires that complete plans be submitted, reviewed and approved before any construction and/ or remodeling can begin."),
  "pla-food-permit": p("https://content.civicplus.com/api/assets/tx-plano/c39480c6-84db-4e2c-b253-d47e9ef3f83a", "No permit shall be issued or renewed until the applicable permit fee is paid."),

  /* Washington, Nevada, Illinois, Massachusetts */
  "wa-sos": at("https://sos.wa.gov/node/13051", "Certificate of Formation for a Limited Liability Company governed by RCW 25.15 is used to create a new business entity"),
  "wa-bls": p("https://dor.wa.gov/open-business/business-licensing-and-renewals-faqs", "You need a license if you meet one or more of the following criteria: Your business requires city and state endorsements."),
  "wa-food-worker": p("https://doh.wa.gov/node/5754", "All food workers are required, per Chapter 246-217 WAC , to have a valid food worker card to work in Washington."),
  "sea-business-license": p("https://www.seattle.gov/licenses", "Anyone doing business in Seattle must have a Seattle business license tax certificate, also known as a business license or general business license."),
  "kc-plan-review": at(KC_FOOD, "Food business owners must submit plans for review before construction, remodeling, or changing ownership takes place."),
  "sea-food": p(KC_FOOD, "A successful plan review approval and pre-operational inspection are required prior to starting operations."),
  "sea-building": p("https://www.seattle.gov/office-of-economic-development/small-business/food-businesses/restaurants", "Final Inspections Once all permits have been approved and construction has been completed, final inspections need to be scheduled."),
  "nv-silverflume": at("https://dpbh.nv.gov/uploadedFiles/dpbhnvgov/content/Reg/Radiation-Machines/Docs/Informational_Notice_Secretary_of_State_Business_License_8-17-23ADA.pdf", "the person must obtain the state business license before conducting business in this State."),
  "nv-tax": p(NV_TAX, "You must have a Federal Identification Number (FEIN# or EIN) and Business License before registering for a tax permit."),
  "nv-esd": p(NV_TAX, "If you also need to be registered for Unemployment Insurance , DETR will share your details with the Department of Taxation."),
  "lv-license": p("https://lasvegasnevada.gov/Business/Business-License/Apply-For-A-Business-License", "This will provide you with the primary jurisdiction for your location, which determines where you must file for your business license."),
  "cc-business-license": at("https://www.clarkcountynv.gov/adobe/assets/urn:aaid:aem:0746bb4a-633d-43f6-85c8-875896f099a7/original/as/application-checklist-08-13-2026.pdf", "Proof that you have applied with the Southern Nevada Health District (SNHD)."),
  "snhd-food-handler": p("https://www.southernnevadahealthdistrict.org/?p=3661", "First-time applicants must demonstrate knowledge of safe food handling techniques to obtain their Food Handler Safety Training Card."),
  "snhd-cfsm": p(SNHD_PACKET, "A person in charge that is a Certified Food Safety Manager. (Attach copy of certification)"),
  "snhd-plan-review": at(SNHD_PACKET, "Plans are reviewed remotely on the day of the appointment."),
  "lv-food": at(SNHD_PACKET, "A Certificate of Occupancy or Temporary Certificate of Occupancy must be obtained prior to the final permitting inspection"),
  "il-tax": p("https://tax.illinois.gov/businesses/registration.html", "Register with us, using one of the above methods, before you make any purchases, sales, or hire an employee."),
  "il-ides": p("https://ides.illinois.gov/employer-resources/tax-employer-information.html", "You can access the form online through MyTax Illinois and then Register a new business (Form REG-1) ."),
  "chi-sanitation": p("https://chicago.gov/city/en/depts/cdph/provdrs/food_safety/svcs/enroll_in_a_foodsanitationcertificationcourse.html", "To obtain a CDPH Foodservice Sanitation Manager Certificate you must attend and pass an approved course."),
  "chi-plan-review": at("https://www.chicago.gov/content/dam/city/depts/bacp/general/Retail%20Food%20Guide.pdf", "The Plan Review is coordinated between the Department of Public Heath and the Department of Buildings"),
  "chi-license": p("https://www.chicago.gov/city/en/depts/bacp/supp_info/retailfoodestablishment0.html", "A Retail Food Establishment license can only be issued at a properly zoned, non-residential location."),
  "chi-limited": at("https://www.chicago.gov/city/en/ofinterest/bus/retail.html", "the majority of retail establishments will be required to have a City of Chicago Limited Business License."),
  "ma-sos": at("https://www.sec.state.ma.us/divisions/corporations/download/c156c512dllccert.pdf", "Filing fee: $500"),
  "ma-tax": at("https://mass.gov/info-details/register-your-business-with-masstaxconnect", "Businesses are required to register with an EIN in MassTaxConnect."),
  "ma-dua": p("https://www.mass.gov/how-to/register-a-business-with-the-department-of-unemployment-assistance", "Employers who pay wages for work done in Massachusetts must register with DUA."),
  "ma-food-manager": at(MA_ALLERGEN, "each establishment must have a certified food protection manager trained in allergen awareness"),
  "ma-allergen": at(MA_ALLERGEN, "each establishment must have a certified food protection manager trained in allergen awareness"),
  "bos-cert": p("https://www.boston.gov/departments/city-clerk/how-apply-business-certificate", "Massachusetts law requires most businesses operating under a trade name to file with the City Clerk’s Office ."),
  "bos-cv": p("https://www.boston.gov/departments/licensing-board/how-get-common-victualler-license", "You must have this license before you can apply for a Food Service Health Permit from the Inspectional Services Department Health Division (ISD)."),
  "bos-food-permit": p("https://www.boston.gov/permitting/permits/food-service-permit", "Before you can serve food to the public, you need to apply for a Food Service Permit and pass a health inspection."),
  "bos-plan-review": p("https://www.boston.gov/permitting/permits/food-service-permit", "Depending on your situation, you may also need a Plan Review before we can issue your permit."),
  "bos-building": p(BOS_GUIDE, "File a building permit application for any necessary construction."),
  "bos-co": p(BOS_GUIDE, "Obtain a Certificate of Occupancy by submitting your Certificate of Occupancy Application."),
  "bos-site": p(BOS_GUIDE, "Apply for Site Cleanliness License."),

  /* Colorado, Pennsylvania, Georgia, Virginia, New Jersey */
  "co-sos": at("https://www.coloradosos.gov/pubs/business/helpFiles/LLCChecklist.pdf", "Filing Articles of Organization is how you form your LLC in the State of Colorado."),
  "co-tax": p("https://tax.colorado.gov/new-businesses", "you must apply for a Colorado sales tax license."),
  "co-ui": at("https://cdle.colorado.gov/employers/recruiting-hiring/new-employer-checklist", "To receive an unemployment account number, you may register your business online through MyBizColorado."),
  "den-tax": p("https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Department-of-Finance/Our-Divisions/Treasury/Business-Tax-Information/Business-Tax-FAQ", "or you have economic nexus, you are required to obtain a Denver sales tax license"),
  "den-zoning": p("https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Community-Planning-and-Development/Plan-Review-Permits-and-Inspections/Zoning-Permits/Apply-for-Commercial-Zoning-Permits", "If your plans meet the requirements of the zoning code and your permit fee has been paid, staff will issue the zoning permit."),
  "den-plan-review": p("https://denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Public-Health-Environment/Public-Health-Investigations/Food-Safety/Restaurant-Food-Establishment-Compliance", "Food Establishment Construction, Remodeling, and Plan Review Information See Plan Review Page for more information."),
  "den-food-license": p("https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Business-Licensing/Business-licenses/Retail-Food/Retail-food/New", "Your license will not issue until a proper zone use permit has submitted."),
  "pa-dos": at("https://www.pa.gov/agencies/dos/programs/business", "Online Filing Business Filing Services allows you to submit your filings electronically, but your application still requires human review."),
  "pa-tax": p("https://www.pa.gov/services/revenue/register-my-business-for-taxes", "New customers can register for various taxes without logging in to myPATH using the Pennsylvania Online Business Tax Registration."),
  "phl-tax-account": p("https://www.phila.gov/services/payments-assistance-taxes/taxes/get-a-tax-account/", "You also need a PHTIN to get a Commercial Activity License (CAL) , which is required to do any business in Philadelphia."),
  "phl-cal": p("https://www.phila.gov/services/permits-violations-licenses/get-a-license/business-licenses-permits-and-approvals/get-a-commercial-activity-license/", "You should always make sure you have a Commercial Activity License before applying for other business licenses."),
  "phl-food-safety": p("https://www.phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/food-businesses/take-a-food-safety-certification-course", "You can apply and pay for your City of Philadelphia food safety certificate online, in person, or by mail."),
  "phl-plan-review": p("https://phila.gov/services/permits-violations-licenses/get-a-license/business-licenses/food-businesses/apply-for-a-plan-review-for-a-stationary-food-business/", "Anyone opening a stationary food business must submit a plan review for approval."),
  "phl-building": at("https://www.phila.gov/media/20260806124408/PB_007_F-EZ-Level-I-Commercial-Alterations-Standards-2021-Code.pdf", "Obtain permits for limited demolition and commercial alterations without submitting plans by meeting the Conditions and Design Limitations below."),
  "phl-food-license": p("https://www.phila.gov/services/business-self-employment/starting-a-business/business-licenses-permits-and-approvals/food-businesses/get-a-food-preparation-and-serving-license/", "You can apply for this license online using eCLIPSE or in person at the Permit and License Center."),
  "ga-sos": at("https://georgia.gov/register-llc-georgia-secretary-state", "You can register an LLC online, by mail, or in person."),
  "ga-tax": at("https://dor.georgia.gov/taxes/business-taxes/tax-registration", "must register for a sales and use tax number and certificate of registration regardless of whether all sales will be online"),
  "ga-food-manager": p("https://dph.georgia.gov/document/document/envhealthfoodfoodservice-rulespdf/download", "Enough certified food safety managers must be present whenever the establishment is in operation."),
  "va-tax": p("https://www.tax.virginia.gov/register-business-virginia", "While all new businesses are required to register with us online, the following reasons may prevent you from doing so:"),
  "va-vec": p("https://vec.virginia.gov/node/382", "The fastest and easiest way to register is through iFile/iReg ."),
  "va-food-manager": p("https://www.vdh.virginia.gov/environmental-health/food-safety-in-virginia/cfpm/", "Only facilities that meet the criteria for exemption in 12VAC5-421-55 B. or § 35.1-25 . will not need to have a CFPM."),
  "ffx-bpol": p("https://www.fairfaxcounty.gov/topics/starting-business-step-3-license-taxes", "All businesses with a physical location in Fairfax County — including home-based businesses — must have a business license"),
  "ffx-nonrup": p("https://www.fairfaxcounty.gov/plan2build/node/204", "A Non-RUP shall be deemed to authorize and is required for both the initial and continued occupancy and use of the building or land"),
  "ffx-plan-review": p(FFX_HEALTH, "The process to get a permit starts with a commercial plan review before construction begins."),
  "ffx-food-permit": p(FFX_HEALTH, "Upon completing a successful pre-occupancy inspection, the Health Department will issue a permit to operate."),
  "nj-formation": at(NJ_REG, "First, file a Certificate of formation/authorization."),
  "nj-reg": p(NJ_REG, "Second, after filing the certificate of formation/authorization, file the tax/employer registration form (Form NJ-REG)."),
  "edi-plan-review": p("https://www.nj.gov/health/ceohs/documents/phfpp/Chapter%2024%20w%20Cottage%20Food%20Rules%201-18-22.pdf", "A permit applicant or operator shall submit to the health authority properly prepared plans and specifications for review and approval before:"),
  "edi-food-license": p("https://cms2.revize.com/revize/edisonnj/document_center/Retail%20Food%20Fillable%20Application.pdf", "RETAIL FOOD APPLICATION"),
};
