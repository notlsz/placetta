/* Where the company itself was formed, from the workspace facts ("Entity: California limited liability company",
   "State of formation: Delaware", "成立州：加州"). It decides what a store in another state files for the company: the
   state's registration of an out-of-state company (a California LLC opening in New York files New York's Application
   for Authority), not the formation of a new company there. */
import { stateCode } from "./counties";

type Fact = { label: { en: string; zh?: string }; value: { en: string; zh?: string } };
const ABOUT_ENTITY = /entity|formation|formed|organi[sz]ed|incorporat|state of (registration|organization)|domicile|home state|legal structure|company type|成立|注册州|公司类型/i;
const NAMES = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;
const ZH = /(加州|加利福尼亚|德州|德克萨斯|纽约州|纽约|佛罗里达|华盛顿州|伊利诺伊|新泽西|马萨诸塞)/;

/** The two-letter state the company was formed in, or "" when the facts don't say. */
export function homeStateOf(facts: Fact[]): string {
  for (const f of facts) {
    if (!ABOUT_ENTITY.test(`${f.label.en} ${f.label.zh ?? ""}`)) continue;
    for (const v of [f.value.en, f.value.zh ?? ""]) {
      const name = NAMES.exec(v)?.[1] ?? ZH.exec(v)?.[1];
      if (name) { const c = stateCode(name); if (c) return c; }
      const code = /\b([A-Z]{2})\b(?=\s*(LLC|L\.L\.C\.|limited|corporation|corp|inc|company)?)/.exec(v)?.[1];
      if (code && stateCode(code)) return code;
    }
  }
  return "";
}
/** Whether the business already is a company (an LLC, a corporation), from its legal name or entity facts. */
export function isCompany(facts: Fact[]): boolean {
  return facts.some(f => (/legal (business |entity )?name|registered name/i.test(f.label.en) && /\b(llc|l\.l\.c\.|inc\.?|corp(oration)?|ltd|co\.)\s*$/i.test(f.value.en.trim()))
    || (ABOUT_ENTITY.test(f.label.en) && /(limited liability|llc|corporation|inc\b|公司)/i.test(f.value.en + (f.value.zh ?? ""))));
}
/** What the company files in a store's state: register there (formed in another state), nothing (formed there),
 *  form one (no company yet), or ask (a company whose home state the facts don't give). */
export function entityNeed(facts: Fact[], storeState: string): "register" | "none" | "form" | "ask" {
  const home = homeStateOf(facts);
  if (home && storeState) return home === storeState ? "none" : "register";
  return isCompany(facts) ? "ask" : "form";
}
