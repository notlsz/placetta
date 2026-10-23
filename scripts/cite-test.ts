// Inline numbered citations (src/sources.ts): which sentence carries which source's number, and what hovering a number
// shows (the quote and the day it was read, only while the read is current). Run from scripts/agent-test.ts.
import { citeLines, sentences, sourceLinks, usedBy, type Cite } from "../src/sources";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

export function citeTests(ok: Ok, eq: Eq) {
  console.log("\n# Inline citations: a number after each sentence, the quote and read date behind it");
  eq(sentences("The fee is $1.50. File at sjpermits.org today. Done"), ["The fee is $1.50. ", "File at sjpermits.org today. ", "Done"], "a period inside a price or a site doesn't end a sentence");
  eq(sentences("需要卫生许可证。费用见县收费表。"), ["需要卫生许可证。", "费用见县收费表。"], "Chinese full stops end sentences");

  const cites: Cite[] = [
    { title: "CDTFA-400-SPR", url: "https://www.cdtfa.ca.gov/x", keys: ["CDTFA-400-SPR", "California Department of Tax and Fee Administration", "seller's permit"] },
    { title: "Permit Application & Certification Statement", url: "https://deh.santaclaracounty.gov/y", keys: ["Santa Clara County", "health permit"] },
    { title: "sba.gov", url: "https://www.sba.gov/z", keys: ["sba.gov"] },
  ];
  const m = citeLines(["You need a seller's permit from the California Department of Tax and Fee Administration. It's free.", "Santa Clara County issues the health permit; the fee is invoiced after the final inspection.", "Ask me to start the forms."], cites);
  eq(m[0].map(s => s.marks), [[1], []], "the sentence that names the CDTFA gets its number, the next one none");
  eq(m[1][0].marks, [2, 3], "the county's sentence gets its number, and a source no sentence names lands on the last sentence stating a rule");
  eq(m[2][0].marks, [], "a sentence stating no rule gets no stray number");
  eq(m.flat().map(s => s.text).join(""), "You need a seller's permit from the California Department of Tax and Fee Administration. It's free.Santa Clara County issues the health permit; the fee is invoiced after the final inspection.Ask me to start the forms.", "the words are kept exactly");
  const none = citeLines(["Hello there."], cites);
  eq(none[0][0].marks, [1, 2, 3], "with no sentence stating a rule, the numbers go after the last sentence, never nowhere");

  // a registry form's quote and read date, from the read log, only while it's current
  const used = usedBy("find_official_forms", {}, { forms: [{ official_form_id: "scc-health-permit" }] });
  const reply = "Santa Clara County requires a health permit for the shop; the operating fee is invoiced after the final inspection.";
  const [c] = sourceLinks(reply, used, "2026-10-23");
  // the county's own page (src/forms/verify.ts moved the proof off a City of Milpitas PDF)
  const SCC_DEH = "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and";
  ok(c && /permit to operate application/.test(c.quote ?? "") && c.read === "2026-10-23", "hovering the county's number shows the sentence read on the page and the day", c);
  ok(c && c.url === SCC_DEH && !c.from, "the link is the page the quote was read on, so no second page is named", c);
  ok(c && (c.keys ?? []).includes("County of Santa Clara Department of Environmental Health") && !(c.keys ?? []).some(k => k.length <= 2), "its keys are the words a sentence uses for it", c?.keys);
  const away = sourceLinks("The fee is $50.", [{ kind: "form", label: "X", url: "https://example.gov/other", form: "scc-health-permit" }], "2026-10-23")[0];
  ok(away?.from === SCC_DEH, "a quote read on another page names that page", away);
  const [stale] = sourceLinks(reply, used, "2027-06-01");
  ok(stale && !stale.quote && !stale.read, "a quote not seen within 90 days is never shown as current", stale);
  const pages = sourceLinks("The fee is $50.", [{ kind: "page", label: "sfgov.org", url: "https://sfgov.org/a" }], "2026-10-23");
  eq(pages[0]?.keys, ["sfgov.org"], "a page read by the search service is cited by its site");
}
