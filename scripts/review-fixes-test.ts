// The sample review of 2026-10-23 (docs/LESSONS.md): each bug it found, checked where it was made. Run from
// scripts/agent-test.ts.
//   1. a question about the workspace's own permits went to the forms library and got "I'm not sure"
//   2. one store showed three opening dates (store card, Deadlines, the cost line on Permits)
//   3. Home's badge, "Waiting on you", the chat greeting and "Do this next" disagreed
//   4. a San Jose store's county health permit cited milpitas.gov, and SJ permits cited sjeconomy.com
//   5. the appeal reply read "…, heard by The county environmental health agency."
import { __plansForRecording } from "../src/agent";
import { SAMPLE, type Workspace } from "../src/model";
import { inDays } from "../src/time";
import { openingOf, openingPath, withOpenings, workspaceOpening } from "../src/smart";
import { costToOpen } from "../src/cost";
import { todos, headline } from "../src/doNext";
import { standing } from "../src/feed";
import { FORMS } from "../src/forms/registry";
import { PROOF } from "../src/forms/proof";
import { SAMPLE_WS } from "../src/sample";
import { APPEALS, appealSay, namesBody } from "../src/appeals";
import { denialAppeal, scheduleAppeals } from "../src/finish";
import { approvalRoute } from "../src/approvalRoute";
import ROUTES from "../src/forms/filingRoutes.json";
import { channelsFrom } from "../src/channelsRule";
import { B } from "../src/bi";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

const reply = (w: Workspace, text: string, lang: "en" | "zh" = "en") => {
  const p = __plansForRecording.plan({ text }, { lang, current: w });
  return { en: p.reply.text.map(t => t.en).join(" "), zh: p.reply.text.map(t => t.zh).join(""), p };
};

export function reviewFixTests(ok: Ok, eq: Eq) {
  const w = structuredClone(SAMPLE), today = inDays(0);
  const sj = (w.stores ?? []).find(s => s.id === "sanjose")!;
  const open = openingOf(sj, w, today)!;

  console.log("\n# 1. Questions about the workspace's own permits are answered from the workspace");
  for (const q of ["What permits do I still need for San Jose and when will we open?", "What's left?", "what's left to do", "What do I need to do?", "What do we still need?", "还需要哪些许可？", "我还需要做什么？"]) {
    const r = reply(w, q);
    ok(!/not sure|library doesn't have|登记库里还没有/.test(r.en + r.zh), `"${q}" is not answered with "I'm not sure"`, r.en.slice(0, 200));
    // it scans: one summary line, then one short line per permit still to get, then the opening, then the next step
    const first = r.p.reply.text[0], lines = first.en.split("\n"), zl = first.zh.split("\n");
    eq(lines[0], "San Jose, North First St: 2 of 10 done, 1 with the agency, 7 to go.", `"${q}" opens with one summary line`);
    ok(lines.length === 8 && lines.slice(1).every(l => /^[A-Z][^:]+: [a-zO0-9].{0,45}$/.test(l)), `"${q}" then lists the 7, one short line each`, lines);
    ok(lines.includes("Food facility plan check: needs your floor plan and equipment list") && lines.includes("Sign permit: ready, waiting for your approval"), `"${q}" says what each waits on`, lines);
    ok(zl[0] === "圣何塞 North First St 店：10 项中已办好 2 项，1 项在机构审核，还有 7 项。" && zl.length === 8 && zl.includes("食品设施图纸审查：需要您的平面图和设备清单"), `"${q}" the same in Chinese`, zl);
  }
  {
    const r = reply(w, "What's left?"), gap = Math.round((Date.parse(sj.plannedOpen! + "T12:00:00Z") - Date.parse(open + "T12:00:00Z")) / 864e5);
    const fmt = (iso: string, y: boolean) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", ...(y ? { year: "numeric" } : {}) });
    eq(r.p.reply.text[1].en, `Opens around ${fmt(open, true)}, ${gap} days before your ${fmt(sj.plannedOpen!, false)} target.`, "the opening says the date and how it sits against the target, plainly");
    ok(/^约 .+ 开业，比您定的 .+ 早 \d+ 天。$/.test(r.p.reply.text[1].zh), "and in Chinese", r.p.reply.text[1].zh);
    ok(!/where the permits put it|planned:/.test(r.en), "no 'where the permits put it today (planned: …)'");
  }
  for (const q of ["When do we open?", "When will we open?", "什么时候开业？", "What permits do I still need for San Jose and when will we open?"]) {
    const r = reply(w, q);
    const d = new Date(open + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    ok(r.en.includes(d), `"${q}" gives the store card's opening date (${d})`, r.en.slice(0, 300));
    ok(!r.en.includes("Mar 1, 2027") && !/target opening/i.test(r.en), `"${q}" names no second opening date`, r.en);
  }
  const first = todos(w, today)[0];
  ok(reply(w, "What do I need to do?").en.includes(headline(first).en.charAt(0).toLowerCase() + headline(first).en.slice(1)), "the workspace answer's next step is Home's \"Do this next\"");
  const lib = reply(w, "Do I need a seller's permit in Texas?");
  ok(/Texas/.test(lib.en) && !/North First/.test(lib.en), "a requirement question about another place still goes to the forms library", lib.en.slice(0, 200));

  console.log("\n# 2. One opening date per store, from one source");
  eq(openingPath(sj, w, today).landing, open, "the store card's date is openingPath's landing");
  eq(costToOpen(w, { today }).landing, open, "the cost line on Permits shows the same date");
  eq(workspaceOpening(w, today)?.date, open, "Home's opening line shows the same date");
  const ms = withOpenings(w, today).filter(d => d.kind === "milestone");
  eq(ms.map(d => d.date), [open], "Deadlines has one opening milestone, on the same date");
  ok(!SAMPLE.deadlines.some(d => d.id === "dl-open") && !sj.projectedOpen, "the sample keeps no hand-written opening date that could drift");
  const signedUp = { ...w, deadlines: [...w.deadlines, { id: "pv-dl-open", date: "2027-06-15", kind: "milestone" as const, title: { en: "Target opening", zh: "目标开业日" } }] };
  eq(withOpenings(signedUp, today).filter(d => d.kind === "milestone").map(d => d.date), [open], "a stored Target opening milestone is replaced by the permits' date");

  console.log("\n# 3. One count of what needs you");
  const n = todos(w, today).length;
  const s = standing(w, today);
  ok(s.text.en.includes(`${n} things need you`) && s.text.zh.includes(`${n} 项需要您处理`), `the greeting counts ${n}, Home's count`, s.text);
  ok(s.text.en.toLowerCase().includes(headline(first).en.toLowerCase()) && s.text.zh.includes(headline(first).zh), "the greeting's first step is Home's \"Do this next\"", s.text);
  eq(s.approvals, first.kind === "approval" ? [first.a.id] : [], "the greeting's card is that same item");
  ok(!/3 need you/.test(s.text.en) || n === 3, "no fixed \"3 need you\"");
  for (const [q, lang] of [["What's waiting for my approval?", "en"], ["有哪些等我批准？", "zh"]] as const) {
    const r = reply(w, q, lang);
    ok(lang === "en" ? r.en.startsWith(`${n} waiting on you`) : r.zh.startsWith(`${n} 项等您处理`), `"${q}" counts ${n}, like Home`, lang === "en" ? r.en : r.zh);
  }

  console.log("\n# 4. San Jose and Santa Clara County items cite their own agencies");
  const sjForms = FORMS.filter(f => ["SJ", "SCC"].includes(f.where));
  for (const f of sjForms) {
    for (const u of [f.url, f.info, f.proof?.link, f.proof?.read].filter(Boolean) as string[]) {
      const h = new URL(u).hostname;
      ok(/(^|\.)(sanjoseca\.gov|sjpermits\.org|santaclaracounty\.gov|sccgov\.org)$/.test(h), `${f.id} links to its agency (${h})`);
    }
  }
  ok(/deh\.santaclaracounty\.gov/.test(PROOF["scc-health-permit"].read), "the county health permit's quote was read on the county's DEH site");
  const cdtfa = PROOF["ca-cdtfa"];
  ok(/cdtfa\.ca\.gov/.test(cdtfa.read), "the state seller's permit cites the CDTFA, not a city's guide", cdtfa.read);
  const shown = SAMPLE_WS.apps.filter(a => a.official && /^(sj|scc)-/.test(a.official)).map(a => new URL(a.source.url).hostname);
  ok(shown.length >= 5 && shown.every(h => /sanjoseca\.gov$|santaclaracounty\.gov$|sjpermits\.org$/.test(h)), "the sample's Permits table shows only the agencies' own sites", shown);

  console.log("\n# 5. The appeal reply reads as sentences, in English and Chinese");
  for (const ap of APPEALS) {
    const s = appealSay(ap);
    ok(!/, heard by/.test(s.route.en) && !/[a-z,] The [a-z]/.test(s.route.en), `${ap.id}: no capitalized "The" mid-sentence`, s.route.en);
    ok(/^The route: [^]+?\.( Who decides: [a-zA-Z][^]+\.)?$/.test(s.route.en), `${ap.id}: "The route: <name>." and, when the name doesn't say it, "Who decides: <body>."`, s.route.en);
    ok(/^申诉途径：.+。(受理机构：[^：]+。)?$/.test(s.route.zh) && /。$/.test(s.deadline.zh) && /。$/.test(s.next.zh), `${ap.id}: the Chinese reads as sentences`, s.route.zh);
    ok(/\.$/.test(s.deadline.en) && !/\.\./.test(s.deadline.en + s.next.en), `${ap.id}: the deadline and next step end cleanly`, s.deadline.en);
    // who decides is said once: never the body again when the name already names it ("Board of Standards and Appeals")
    const said = namesBody(ap);
    ok(said.en === !/Who decides/.test(s.route.en) && said.zh === !/受理机构/.test(s.route.zh), `${ap.id}: the body is said once`, s.route);
    const core = ap.body.en.split(",")[0].replace(/\s*\([^)]*\)/g, "").replace(/^the\s+/i, "").toLowerCase();
    ok(s.route.en.toLowerCase().split(core).length <= 2, `${ap.id}: no name repeated in the route`, s.route.en);
  }
  eq(appealSay(APPEALS.find(a => a.id === "nyc_bsa_appeal")!).route.en, "The route: Appeal to the NYC Board of Standards and Appeals.", "the BSA route names the Board once");
  const plan = appealSay(APPEALS.find(a => a.id === "ca_health_plan_review")!);
  eq(plan.route.en, "The route: Health plan check rejected (California Retail Food Code). Who decides: the county environmental health agency.", "the reviewed sentence, fixed");
  const r = reply(w, "Our plan check was rejected. Can we appeal?");
  ok(!/heard by The/.test(r.en) && /Who decides: the county environmental health agency\./.test(r.en) && /受理机构：县环境卫生机构。/.test(r.zh), "the agent's appeal reply uses it", r.en);

  console.log("\n# Gap: a denied permit shows its appeal, with the deadline on Deadlines");
  const ws = structuredClone(SAMPLE_WS), denied = ws.apps.find(a => a.filed?.status === "rejected")!;
  ok(!!denied, "the sample has a denied permit");
  const v = denialAppeal(ws, denied, today)!;
  ok(v && v.ap.id === "nyc_bsa_appeal" && !!v.dl && v.dl.verified, "it routes to its appeal, with a confirmed deadline", v && { ap: v.ap.id, dl: v.dl });
  eq(v.dl!.date, inDaysFrom(denied.filed!.decided!, 30), "the deadline is counted by the rule: 30 days from the determination");
  ok(/2 RCNY §1-06\.3\(a\)\(1\)/.test(v.say.deadline.en) && /2 RCNY/.test(v.say.deadline.zh), "it carries the rule's citation, in both languages", v.say.deadline);
  ok(!/\d{4}-\d{2}-\d{2}/.test(v.say.deadline.en + v.say.deadline.zh), "no ISO date in the sentence: the panel's deadline line says the date", v.say.deadline);
  ok(/^Next: /.test(v.say.next.en) && /^下一步：/.test(v.say.next.zh), "and the next step");
  const onCal = scheduleAppeals(ws, today).deadlines.find(d => d.id === v.deadlineId);
  ok(onCal && onCal.date === v.dl!.date && onCal.kind === "due", "the appeal deadline is on Deadlines", onCal);
  ok(denialAppeal(ws, ws.apps.find(a => a.id === "sign")!, today) === null, "a permit that wasn't denied shows no appeal panel");

  console.log("\n# Gap: who files it and how long, on every approval card");
  const sign = SAMPLE_WS.apps.find(a => a.id === "sign")!;
  const rs = approvalRoute({ kind: "file" }, sign)!;
  eq(rs.who.en, "Odelia files online", "the sign permit goes on San José's portal (filing coverage: portal)");
  eq(rs.time?.en, "Average: 2 weeks.", "with the city's published time, from the registry");
  const team = approvalRoute({ kind: "file" }, { official: undefined, est: B("To be confirmed", "待确认") })!;
  ok(team.who.en === "The Placetta team files it" && !team.time, "a form with no route goes to the team, and no time is invented", team);
  ok(approvalRoute({ kind: "upload" }) === null, "an upload card is the owner's own step: no route line");
  for (const [form, kind] of Object.entries(ROUTES as Record<string, string>)) if (!["portal", "email", "fax", "mail", "owner", "faxSigned", "ownerSigns", "team"].includes(kind)) ok(false, `${form}: unknown route ${kind}`);

  console.log("\n# Gap: channels that aren't set up show nothing to press");
  eq(channelsFrom(null, null), { talk: false, interpreter: false, rehearse: false, calls: false, texts: false, imessage: false }, "with no answer, nothing is set up");
  eq(channelsFrom({ talk: true, interpreter: false, rehearse: true }, { configured: true, voice: false, sms: true, imessage: false }), { talk: true, interpreter: false, rehearse: true, calls: false, texts: true, imessage: false }, "each channel from its own credentials");
  ok(!channelsFrom(null, { configured: false, voice: true, sms: true, imessage: true }).calls, "a line that isn't configured has no calls, whatever else it says");
}
const inDaysFrom = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
