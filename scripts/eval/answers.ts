// Odelia's written answers, checked against the official forms library and the agencies' pages it cites, with no key:
//   sample mode   the demo agent's answer to a question about a requirement (src/agent.ts, src/answer.ts): the facts
//                 it states are the library's for that form, it cites the agency's own page, and when the library
//                 doesn't have the answer it says "I'm not sure" and who to ask, never a guess
//   server        the live agent's instructions (src/live.ts rules) carry the same grounding rules, and the tool it
//                 answers from (find_official_forms) returns only official links for the place asked about
// Run by scripts/eval/accuracy.ts (npm run test:accuracy).
import { __plansForRecording, type Reply } from "../../src/agent";
import { SAMPLE } from "../../src/model";
import { formById } from "../../src/forms/registry";
import { makeTools, messagesModel, rules, type Made } from "../../src/live";
import { normalizeState } from "../../src/core";
import { B } from "../../src/bi";
import { firstWorkspace, startFacts } from "../../src/plan/start";
import { officialSource } from "./official";

const official = (u: string) => officialSource(u);
const DOLLARS = /\$\s?\d/;

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
const check = (name: string, pass: boolean, detail?: unknown) => checks.push({ name, pass, ...(pass ? {} : { detail: JSON.stringify(detail)?.slice(0, 400) }) });

/** The demo agent's reply, through the same plan its run streams (without the pauses between steps). */
async function ask(text: string, lang: "en" | "zh" = "en"): Promise<Reply> {
  return __plansForRecording.plan({ text }, { lang, current: SAMPLE }).reply;
}
const said = (r: Reply, lang: "en" | "zh" = "en") => r.text.map(t => t[lang]).join(" ");
const cites = (r: Reply, id: string) => { const f = formById(id)!; return !!r.sources?.some(s => s.url === (f.info || f.url)) && r.sources!.every(s => official(s.url)); };

export async function answerChecks(): Promise<Check[]> {
  checks.length = 0;
  /* ---------------- sample mode: answers that match the library and cite the agency's page ---------------- */
  {
    const r = await ask("Do I need a seller's permit in California?"), f = formById("ca-cdtfa")!;
    check("seller's permit in California: CDTFA, free and one per store (the library's line from CDTFA), cdtfa.ca.gov cited",
      said(r).includes(f.agency.en) && /free/i.test(said(r)) && /one per store/.test(said(r)) && cites(r, "ca-cdtfa") && !DOLLARS.test(said(r)), r);
  }
  {
    const r = await ask("When does the San José business tax renew?"), f = formById("sj-business-tax")!;
    check("San José business tax renewal: the 15th of the month the business started, from the city's page",
      /15th of the month your business started/.test(said(r)) && said(r).includes(f.agency.en) && cites(r, "sj-business-tax"), r);
  }
  {
    const r = await ask("How long does an EIN take?");
    check("EIN timing: fax about 4 business days, mail 4 to 5 weeks (the IRS's own words), irs.gov cited",
      /4 business days/.test(said(r)) && /4 to 5 weeks/.test(said(r)) && cites(r, "irs-ss4"), r);
  }
  {
    const r = await ask("Do I need a food handler card in California?");
    check("California food handler card: within 30 days of hire, the statute cited", /30 days/.test(said(r)) && cites(r, "ca-food-handler"), r);
  }
  {
    const r = await ask("How much is the Chicago retail food license?");
    check("Chicago retail food license fee: $660 for the smallest tier, as the city publishes it", /\$660/.test(said(r)) && cites(r, "chi-license"), r);
  }
  {
    const r = await ask("How much does the Seattle business license cost?");
    check("Seattle business license fee: $73 the first year (2026 rates), seattle.gov cited", /\$73/.test(said(r)) && cites(r, "sea-business-license"), r);
  }
  {
    const r = await ask("Do I need a liquor license to serve beer at my restaurant in Flushing, NY?");
    check("beer in Flushing: the community board notice, the SLA's restaurant wine license ($1,060) and TTB registration, each cited",
      /community board/i.test(said(r)) && /\$1,060/.test(said(r)) && /TTB/.test(said(r)) && cites(r, "ny-sla-rw") && cites(r, "ttb-dealer") && cites(r, "nyc-cb-notice"), r);
  }
  {
    const r = await ask("When does the FDA food facility registration renew?");
    check("FDA food facility registration renewal: October 1 to December 31 of even-numbered years", /even-numbered year/.test(said(r)) && cites(r, "fda-ffr"), r);
  }
  {
    const r = await ask("How long does a Texas sales tax permit take?");
    check("Texas sales tax permit time: about 2 to 3 weeks, comptroller.texas.gov cited", /2 to 3 weeks/.test(said(r)) && cites(r, "tx-ap201"), r);
  }
  {
    const r = await ask("How much is the LA County health permit?");
    check("a fee the agency doesn't publish is never given a number", !DOLLARS.test(said(r)) && /doesn't publish a fixed fee/.test(said(r)) && cites(r, "lac-health-permit"), r);
  }
  {
    const r = await ask("Do I need a business license in Las Vegas?");
    check("a business license in Las Vegas: the City's, not Clark County's", said(r).includes("City of Las Vegas") && !/Clark County/.test(said(r)) && cites(r, "lv-license"), r);
  }
  {
    const r = await ask("加州需要销售许可证吗？", "zh"), f = formById("ca-cdtfa")!;
    check("Chinese: 加州销售许可证 is answered in Chinese with CDTFA and its page", said(r, "zh").includes(f.agency.zh) && cites(r, "ca-cdtfa"), r);
  }
  {
    const r = await ask("圣何塞营业税什么时候续期？", "zh");
    check("Chinese: 圣何塞营业税续期 gives the city's due-date rule in Chinese", /15 日到期/.test(said(r, "zh")) && cites(r, "sj-business-tax"), r);
  }
  /* ---------------- sample mode: "I'm not sure, here's who to ask" instead of a guess ---------------- */
  {
    // Texas's TABC permit is in the library since 2026-10-18 (src/forms/beachhead.ts): answered from it, no fee invented
    const r = await ask("Do I need a liquor license in Austin, Texas?");
    check("a liquor license in Austin: TABC's permit from the library, tabc.texas.gov cited, no fee invented",
      /Texas Alcoholic Beverage Commission/.test(said(r)) && !DOLLARS.test(said(r)) && cites(r, "tx-tabc") && r.sources!.every(s => official(s.url)), r);
  }
  {
    // Illinois's state liquor license isn't in the library: not sure, and who to ask
    const r = await ask("Do I need a liquor license in Chicago?");
    check("a liquor license in Chicago (Illinois's not in the library): not sure, says who to ask, no license name or fee invented",
      /I'm not sure/.test(said(r)) && /Here's who to ask/.test(said(r)) && !DOLLARS.test(said(r)) && !!r.sources?.length && r.sources.every(s => official(s.url)), r);
  }
  {
    const r = await ask("How much is a fireworks permit in San Jose?");
    check("a fireworks permit (no such form): not sure, points to the City of San Jose's own site, no amount",
      /I'm not sure/.test(said(r)) && /City of San Jos[eé]/.test(said(r)) && !DOLLARS.test(said(r)) && !!r.sources?.some(s => /sanjoseca\.gov/.test(s.url)), r);
  }
  {
    const r = await ask("Do I need a business license in Houston?");
    check("a city business license in Houston (Texas cities mostly have none; the library has no Houston license): not sure rather than invented",
      /I'm not sure/.test(said(r)) && !DOLLARS.test(said(r)) && !/Houston business license/i.test(said(r)), r);
  }
  /* ---------------- sample mode: the scripted jobs still route as before ---------------- */
  {
    const r = await ask("What's blocking our opening date?");
    check("\"What's blocking our opening date?\" still runs the opening-path flow, not a lookup", !/forms library/.test(JSON.stringify(r)) && !/I'm not sure/.test(said(r)) && said(r).length > 0, r);
  }
  {
    const r = await ask("Remind staff about food handler cards");
    check("\"Remind staff about food handler cards\" still drafts the staff reminder", !(r.sources ?? []).some(s => /leginfo/.test(s.url)) && said(r).length > 0, r);
  }
  /* ---------------- server: the instructions and the tool it answers from ---------------- */
  {
    const ws = normalizeState("Lucky Leaf", { business: B("Lucky Leaf Tea LLC", "幸运叶茶饮有限公司") });
    const both = [true, false].map(research => rules(ws, "en", false, research, [], true));
    check("server prompt: never invent a permit, agency, fee, time or date; answer from find_official_forms; not sure means saying who to ask",
      both.every(t => /Never invent a license or permit name, form number, agency, fee, processing time, rule or date/.test(t)
        && /answered from find_official_forms/.test(t) && /say you're not sure and who to ask/.test(t) && /Never fill the gap with a guess/.test(t)));
    const made: Made = { apps: new Set(), approvals: [], memory: [], skills: [], files: [], lastToolAt: 0 };
    const model = messagesModel("server", async () => ({ content: [{ type: "text", text: "" }], stop_reason: "end_turn" }));
    const tools = makeTools(() => ws, () => undefined, () => undefined, made, "en", () => 0, false, { model, files: new Map(), signal: new AbortController().signal });
    const find = tools.find(t => t.name === "find_official_forms")!;
    const out = await find.execute({ business: "milk tea shop", place: "San Jose, CA", hires_staff: true, builds_out: true }) as { forms: { official_form_id: string; agency: string; official_link: string; info: string; fee: number | null }[] };
    const cdtfa = out.forms.find(f => f.official_form_id === "ca-cdtfa");
    check("server tool: find_official_forms for a San José milk tea shop gives CDTFA's seller's permit and Santa Clara County's permits, every link official",
      !!cdtfa && cdtfa.agency === formById("ca-cdtfa")!.agency.en && out.forms.some(f => f.official_form_id === "scc-health-permit")
        && !out.forms.some(f => /lac-|la-btrc/.test(f.official_form_id)) && out.forms.every(f => official(f.official_link) && official(f.info)), out.forms.map(f => [f.official_form_id, f.official_link]));
    const austin = await find.execute({ business: "restaurant serving beer and wine", place: "Austin, TX", serves_alcohol: true }) as { forms: { official_form_id: string; level: string }[]; not_in_library?: string };
    const chicago = await find.execute({ business: "restaurant serving beer and wine", place: "Chicago, IL", serves_alcohol: true }) as { forms: { official_form_id: string; level: string }[]; not_in_library?: string };
    check("server tool: a liquor question in Austin returns TABC's permit and TTB's registration; in Chicago (no Illinois liquor license in the library) no invented state license",
      austin.forms.some(f => f.official_form_id === "tx-tabc") && austin.forms.some(f => f.official_form_id === "ttb-dealer")
        && !chicago.forms.some(f => f.level === "state" && /alcohol|liquor|wine|abc|lcb/i.test(f.official_form_id)) && chicago.forms.some(f => f.official_form_id === "ttb-dealer"), { austin, chicago });
  }
  {
    // a first text to Odelia (agent-run's text start): the plan's first steps name their agency and only published fees
    const f = firstWorkspace({ what: "Milk tea shop", city: "San Jose", state: "CA", lang: "en", now: new Date("2026-10-18T12:00:00Z") });
    const facts = startFacts(f, new Date("2026-10-18T12:00:00Z"));
    check("text start: the first three steps carry the agency and the registry's own fee (null when unpublished)",
      facts.first.length === 3 && facts.first.every((s, k) => { const a = f.filled.apps[k], off = a.official ? formById(a.official) : undefined; return s.agency.en === a.agency.en && (off ? s.fee === off.fee : true); }), facts.first);
  }
  return [...checks];
}
