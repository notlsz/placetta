// Where the product filings go (src/forms/states/products.json): only the channels the agency's own page links or
// states, read on 2026-10-28. A portal host here is one the worker may open; none of these says it files without an
// account, so each signs in with a saved login or asks the team for one (file/accounts.ts). Entries with no channel
// on their page (paper forms whose mailing address wasn't printed, statutes) go to the Placetta team.
import type { Dest } from "../destinations.ts";

const READ = "2026-10-28";

export const PRODUCT_DEST: Record<string, Dest> = {
  // ---- bedding and upholstered furniture
  "ma-dfp-bedding": {
    // "Go to the Environmental Health eLicensing Portal and create an account"; "Pay by credit card or electronic fund
    // transfer using the Environmental Health eLicensing Portal"; "Complete and sign the entire online application form"
    portal: "environmentalhealthlicensing.mass.gov", portalUrl: "https://environmentalhealthlicensing.mass.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.mass.gov/how-to/apply-for-a-license-to-manufacture-and-sell-stuffed-toys-bedding-upholstered-furniture-and-related-products",
  },
  "pa-bedding": {
    // "submit it to our office as shown on the form or through the public eDAP portal. You must also pay the fee";
    // "click here to apply or renew online" (www.boisedap.pa.gov)
    portal: "www.boisedap.pa.gov", portalUrl: "https://www.boisedap.pa.gov/index.html",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.pa.gov/agencies/dli/programs-services/labor-management-relations/bureau-of-occupational-and-industrial-safety/bedding-and-upholstery",
  },
  "ct-bedding-importer": {
    // "Application: Online Account Instructions OR Initial Importer Mail-in Application", the online account on
    // www.elicense.ct.gov
    portal: "www.elicense.ct.gov", portalUrl: "https://www.elicense.ct.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://portal.ct.gov/dcp/license-services-division/all-license-applications/bedding--upholstered-furniture-importer",
  },
  // ---- state pesticide registration for germ-killing products: the portal each agency's page links for it
  "co-pesticide-reg": {
    // "Apply for a Colorado Pesticide Product Registration"; "Renew Pesticide Product Registrations Online (On AgLicense website)"
    portal: "www.ag.state.co.us", portalUrl: "https://www.ag.state.co.us/elicense/Index.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://ag.colorado.gov/plants/pesticides/pesticide-product-registration",
  },
  "ct-pesticide-reg": {
    // "Applications must be submitted through DEEP's online product registration system" (www.elicense.ct.gov)
    portal: "www.elicense.ct.gov", portalUrl: "https://www.elicense.ct.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://portal.ct.gov/DEEP/Pesticides/Pesticide-Product-Registration-Requirements",
  },
  "dc-pesticide-reg": {
    // "Register products online >>" (dcplants.doee.dc.gov)
    portal: "dcplants.doee.dc.gov", portalUrl: "https://dcplants.doee.dc.gov/SecurityLogin.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://doee.dc.gov/service/register-pesticide-product",
  },
  "id-pesticide-reg": {
    // the Idaho Pesticide Registration System: "your company must be registered with the ISDA first", then each product
    portal: "pestreg.isda.idaho.gov", portalUrl: "https://pestreg.isda.idaho.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://pestreg.isda.idaho.gov/Start/Faq",
  },
  "la-pesticide-reg": {
    // "Pesticide/Pharmaceutical Registration Portal (LAPlants)"; "Register online"
    portal: "usaplantsla.ldaf.state.la.us", portalUrl: "https://usaplantsla.ldaf.state.la.us/USAPlantsLA/SecurityLogin.aspx",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.ldaf.la.gov/plants/pesticides/registration",
  },
  "ma-pesticide-reg": {
    // "Register a Pesticide Product" links Massachusetts's permitting site (Accela Citizen Access)
    portal: "permitting.state.ma.us", portalUrl: "https://permitting.state.ma.us/CitizenAccess/", tenant: "/CitizenAccess",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.mass.gov/pesticide-product-registration",
  },
  "ne-pesticide-reg": {
    // "Pesticide Dealers and/or Product Registrations" among the Department's online services
    portal: "nda.nebraska.gov", portalUrl: "https://nda.nebraska.gov/online/pesticide_renewal", tenant: "/online",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://nda.nebraska.gov/pesticide/regist",
  },
  "nv-pesticide-reg": {
    // "Click Here to Register or Renew Online" (nv.certifyag.com/pest/)
    portal: "nv.certifyag.com", portalUrl: "https://nv.certifyag.com/pest/", tenant: "/pest",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://agri.nv.gov/pesticides/",
  },
  "oh-pesticide-reg": {
    // "Register through the Ohio AgEnterprise Portal"
    portal: "ohioagenterprise.agri.ohio.gov", portalUrl: "https://ohioagenterprise.agri.ohio.gov/web",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://agri.ohio.gov/divisions/plant-health/pesticides/product",
  },
  "ok-pesticide-reg": {
    // "Online First-Time Pesticide Product Registration" (Kelly Registration Systems, which several states share)
    portal: "www.kellysolutions.com", portalUrl: "https://www.kellysolutions.com/erenewals/newreg/", tenant: "/erenewals",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://ag.ok.gov/pesticides/",
  },
  "tx-pesticide-reg": {
    // "Texas Agriculture Portal Application" (tap.texasagriculture.gov), linked from the pesticide FAQ
    portal: "tap.texasagriculture.gov", portalUrl: "https://tap.texasagriculture.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://texasagriculture.gov/Regulatory-Programs/Pesticides/Pesticide-FAQs",
  },
  "va-pesticide-reg": {
    // the pesticide product registration page's "online" link (online.vdacs.virginia.gov) and its Payment Portal
    portal: "online.vdacs.virginia.gov", portalUrl: "https://online.vdacs.virginia.gov/",
    signature: "typed", payment: "portal", onBehalf: "unstated",
    checked: READ, source: "https://www.vdacs.virginia.gov/pesticide-product-registration.shtml",
  },
  // FDA's canning registration (fda-fce-sid) is filed in FDA Industry Systems (www.access.fda.gov, per 21 CFR 108.25),
  // which would be the host's third form and needs a written playbook first, so it goes to the team for now.
};
