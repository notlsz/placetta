// New England's own state filings the library didn't have yet (Connecticut, Rhode Island, Vermont, New Hampshire and
// Maine, and the gap in Massachusetts): sales and use tax registration, employer withholding, unemployment insurance,
// Maine's paid leave registration, the state food license for a maker, processor or food warehouse, and the state retail
// food license where the state (not the town) issues it. Plus two federal filings the federal audit found missing (Form
// 1120-F for a foreign company doing business in the U.S., FDA's registration and process filing for acidified and
// low-acid canned foods) and the fixes below. Read 2026-10-28 from each agency's own page or the state's official
// statutes with curl; each proof is under 25 words, copied as fetched. Data in newengland.json (gzipped in the server
// bundles); routes in supabase/functions/file/dest/newengland.ts.
//
// Left out, with the reason: workers' compensation in all six states (a policy bought from an insurer, not a state
// filing); Massachusetts and Connecticut retail food (the town's board of health or health district issues it); New
// Hampshire withholding (no state income tax on wages). New Hampshire's three rows are UNVERIFIED: revenue.nh.gov,
// nhes.nh.gov, dhhs.nh.gov and gc.nh.gov refused every automated read (403 or an empty reply), so they abstain.
import type { FactSource, OfficialForm } from "../registry";
import DATA from "./newengland.json";
import { VERIFY_BLOCKED } from "../verify";

export const NEWENGLAND_FORMS = DATA as unknown as OfficialForm[];

const NH_BLOCKED = "revenue.nh.gov, nhes.nh.gov and dhhs.nh.gov answer automated reads with 403 (and gc.nh.gov, the RSA, with an empty reply); a person reads the page in a browser before filing";
for (const id of ["nh-dra-meals", "nh-nhes-ui", "nh-dhhs-food"]) VERIFY_BLOCKED[id] ??= NH_BLOCKED;

const READ = "2026-10-28";
const s = (url: string, quote: string): FactSource => ({ url, quote, checked: READ });
const CT_LLC = s("https://prdext3.cga.ct.gov/current/pub/chap_613a.htm", "Each limited liability company and each registered foreign limited liability company shall designate and maintain a registered agent in this state.");
const CT_CORP = s("https://prdext3.cga.ct.gov/current/pub/chap_601.htm", "a registered agent at such registered office, who may be: (A) A natural person who is a resident of this state;");
const MA_LLC = s("https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter156C/Section5", "a resident agent for service of process on the limited liability company, which agent must be an individual resident of the commonwealth,");
const MA_CORP = s("https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter156D/Section5.01", "a registered agent who may be any of the following individuals or entities whose business office is also the registered office of the corporation:");
const RI_LLC = s("https://webserver.rilegislature.gov/Statutes/TITLE7/7-16/7-16-11.htm", "Each domestic or foreign registered limited liability company shall have a resident agent for service of process on the limited liability company");
const RI_CORP = s("https://webserver.rilegislature.gov/Statutes/TITLE7/7-1.2/7-1.2-501.htm", "A registered agent, who may be: (i) An individual resident in this state;");
const VT_LLC = s("https://legislature.vermont.gov/statutes/section/11/025/04007", "A limited liability company and a foreign limited liability company authorized to do business in this State shall designate and continuously maintain:");
const ME_ALL = s("https://legislature.maine.gov/statutes/5/title5sec105.html", "The name of the represented entity's commercial clerk or commercial registered agent; or");

/** The registered agent each state's statute requires of the company: a step named on the formation or registration
 *  filing, not a filing of its own. Rows whose statute this pass didn't read keep what they had. */
const AGENT: Record<string, FactSource> = {
  "ct-llc-form": CT_LLC, "ct-llc-qualify": CT_LLC, "ct-corp-form": CT_CORP,
  "ma-sos": MA_LLC, "ma-corp-form": MA_CORP,
  "ri-llc-form": RI_LLC, "ri-llc-qualify": RI_LLC, "ri-corp-form": RI_CORP,
  "vt-llc-form": VT_LLC, "vt-llc-qualify": VT_LLC,
  "me-llc-form": ME_ALL, "me-llc-qualify": ME_ALL, "me-corp-form": ME_ALL, "me-corp-qualify": ME_ALL,
};

/** The federal audit's fixes to existing rows, and the agent sources above. Applied once every layer is in FORMS.
 *  Returns the ids it didn't find. */
const I5472 = "https://www.irs.gov/instructions/i5472";

export function applyNewEngland(forms: OfficialForm[]): string[] {
  const missing: string[] = [];
  const get = (id: string) => { const f = forms.find(x => x.id === id); if (!f) missing.push(id); return f; };
  // ISF (19 CFR 149) stays as it is: it is owed for ocean shipments only, the intake doesn't ask how goods ship, and the
  // lifecycle list (src/forms/lifecycle.ts life-isf) already names it for every importer. Form 5472 goes with the company's own return: Form 1120-F for a foreign corporation (the row's foreignEntity
  // case), a pro forma Form 1120 only for a foreign-owned U.S. single-member LLC. It is owed by a U.S. company 25% or more
  // foreign-owned as well (the row's foreignOwned case, src/forms/registry.ts anyOf): the proof is the instructions'
  // definition of a reporting corporation, which names both, in place of the About page's sentence, which names neither.
  const f5472 = get("irs-5472");
  if (f5472) {
    f5472.how = {
      en: "Filed each year with the company's income tax return: a U.S. corporation 25% or more foreign-owned attaches it to its Form 1120, a foreign-owned single-member U.S. LLC to a pro forma Form 1120 (faxed or mailed, never e-filed), and a foreign corporation doing business in the U.S. to Form 1120-F.",
      zh: "每年随公司所得税申报表一同提交：外资持股 25% 以上的美国公司附在其 1120 表上；外资单一成员美国 LLC 附在形式 1120 表上（以传真或邮寄提交，不能电子申报）；在美国开展业务的外国公司附在 1120-F 表上。",
    };
    f5472.info = I5472;
    f5472.proof = { read: I5472, quote: "A reporting corporation is either: A 25% foreign-owned U.S. corporation (including a foreign-owned U.S. disregarded entity (DE))", checked: "2026-10-28" };
  }
  for (const [id, source] of Object.entries(AGENT)) {
    const f = get(id);
    if (f?.entity) f.entity.agent = { ...f.entity.agent, required: true, source };
  }
  return missing;
}
