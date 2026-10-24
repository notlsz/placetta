/* npm run test:incumbents: what was copied from the incumbents customers pay today (docs/COMPETITIVE.md, "The
   incumbents"), and the gaps filled, held to their promises.

   - The license report (src/report.ts): every row names its agency, fee, renewal and source; a fee the agency sets is
     never estimated; a row without a current quote says it isn't confirmed; one store's report keeps the company-wide
     rows and drops other stores'; the spreadsheet carries every field, in English, Chinese or both, and Excel reads it.
   - The renewal runway (src/runway.ts): 30, 60 and 90-day lanes, lapsed ones, a person's certificate once, and the
     start date Odelia keeps (60 days out).
   - Plan review corrections (src/corrections.ts): numbered, unnumbered and Chinese comments parsed; sheets found; who
     fixes each; two business days skipping the weekend; the letter has every comment, its response and its sheet. */

import { SAMPLE } from "../src/model";
import type { Application, Workspace } from "../src/model";
import { buildReport, reportCsv, reportName, say } from "../src/report";
import { addDays, laneOf, runway } from "../src/runway";
import { addBusinessDays, businessDaysBetween, designerPrompt, explainPrompt, newRound, notEnglish, parseComments, progress, responseLetter, sheetOf, waitingOn, whoFor } from "../src/corrections";

let failed = 0, passed = 0;
const ok = (cond: unknown, what: string) => { if (cond) passed++; else { failed++; console.error("  FAIL " + what); } };
const eq = (a: unknown, b: unknown, what: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const section = (s: string) => console.log("\n" + s);

const TODAY = "2026-10-23";
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/* ------------------------------- the runway ------------------------------- */
section("Renewal runway");
eq([laneOf(-91), laneOf(-1), laneOf(0), laneOf(30), laneOf(31), laneOf(60), laneOf(61), laneOf(90), laneOf(91)], [null, "lapsed", 30, 30, 60, 60, 90, 90, null], "lanes at their edges");
{
  const ws: Workspace = clone(SAMPLE);
  ws.deadlines = [
    { id: "r-a", date: addDays(TODAY, 75), kind: "renewal", app: "btc", title: { en: "Business Tax Certificate renewal", zh: "营业税证书续期" } },
    { id: "r-b", date: addDays(TODAY, 14), kind: "renewal", title: { en: "Renew Marco's food protection certificate", zh: "为 Marco 续期食品保护证书" } },
    { id: "r-c", date: addDays(TODAY, -5), kind: "renewal", title: { en: "Renew the sign permit", zh: "续期招牌许可" } },
    { id: "r-d", date: addDays(TODAY, 200), kind: "renewal", title: { en: "Far off", zh: "远" } },
    { id: "d-x", date: addDays(TODAY, 3), kind: "due", title: { en: "Not a renewal", zh: "非续期" } },
  ];
  ws.stores = [
    { id: "s1", name: { en: "Flushing", zh: "法拉盛" }, address: "1 Main St", stage: "open", rules: [], logs: [], value: { closures: 0, fines: 0, caught: 0 },
      certs: [{ id: "c1", person: "Marco D.", kind: { en: "Food Protection Certificate", zh: "食品保护证书" }, expires: addDays(TODAY, 19) },
              { id: "c2", person: "Ana P.", kind: { en: "Food Protection Certificate", zh: "食品保护证书" }, expires: addDays(TODAY, 50) }],
      permits: [{ name: { en: "Sidewalk sign approval", zh: "人行道招牌批准" }, expires: addDays(TODAY, 41) }, { name: { en: "Certificate of Authority", zh: "授权证书" }, expires: addDays(TODAY, 9999) }] },
    { id: "s2", name: { en: "San Jose", zh: "圣何塞" }, address: "2 First St", stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: ["btc"] },
  ];
  const r = runway(ws, TODAY);
  eq(r.map(x => x.id), ["r-c", "r-b", "rw-s1-Sidewalk sign approval", "rw-s1-c2", "r-a"], "soonest first, the far one and the non-renewal left out");
  eq(r.map(x => x.lane), ["lapsed", 30, 60, 60, 90], "each in its lane");
  ok(!r.some(x => x.holder?.en === "Marco D."), "Marco's certificate shows once (the reminder on Deadlines), not twice");
  ok(r.find(x => x.id === "r-b")!.kind === "person" && /Marco renews it/.test(r.find(x => x.id === "r-b")!.next.en), "a person's certificate is theirs to renew");
  ok(r.find(x => x.id === "r-a")!.next.en.includes(`starts the renewal on ${addDays(TODAY, 15)}`), "61 to 90 days: the day Odelia starts it (60 days out)");
  ok(/Lapsed on/.test(r[0].next.en) && /过期/.test(r[0].next.zh), "lapsed says so in both languages");
  eq(runway(ws, TODAY, { store: "s2" }).map(x => x.id), ["r-c", "r-b", "r-a"], "one store: its own and the business-wide lines, not another store's permits");
  ok(r.every(x => x.name.en && x.name.zh), "every line has both languages");
}

/* ------------------------------- the report ------------------------------- */
section("License report");
{
  const ws: Workspace = clone(SAMPLE);
  const all = buildReport(ws, TODAY);
  ok(all.rows.length >= ws.apps.length, "every application is a row");
  ok(all.rows.every(r => r.agency.en && r.agency.zh && r.name.en && r.name.zh), "every row names its agency, in both languages");
  ok(all.rows.every(r => r.status === "held" || r.fee.en.length > 0), "every application row states its fee");
  eq(all.counts.total, all.counts.approved + all.counts.moving + all.counts.toDo, "the counts add up");
  const levels = all.rows.filter(r => r.status !== "held").map(r => ["federal", "state", "county", "city"].indexOf(r.level));
  ok(levels.every((l, i) => i === 0 || l >= levels[i - 1]), "rows run federal, state, county, city");
  ok(all.rows.filter(r => r.status === "held").length === 3, "an open store's permits on file are listed");
  ok(all.rows.filter(r => r.status === "held").every(r => !r.expires || r.expires < "2100"), "a never-expiring permit shows no expiry");
  // a fee the agency sets is said so, never a number
  const a0 = ws.apps[0];
  const tbd: Application = { ...clone(a0), id: "tbd", status: "todo", fees: [{ label: { en: "Permit", zh: "许可" }, amount: 0, tbd: true }] };
  const mixed: Application = { ...clone(a0), id: "mixed", status: "todo", fees: [{ label: { en: "Base", zh: "基本" }, amount: 100 }, { label: { en: "By size", zh: "按面积" }, amount: 0, tbd: true }] };
  const unsourced: Application = { ...clone(a0), id: "nosrc", status: "todo", source: { label: "", url: "" } };
  const abstained: Application = { ...clone(a0), id: "abst", status: "todo", abstain: true };
  const ws2: Workspace = { ...ws, apps: [...ws.apps, tbd, mixed, unsourced, abstained] };
  const r2 = buildReport(ws2, TODAY);
  const row = (id: string) => r2.rows.find(x => x.id === id)!;
  eq(row("tbd").fee.en, "Set by the agency", "a fee the agency sets");
  eq(row("mixed").fee.en, "$100 plus what the agency sets", "a floor plus the agency's part");
  ok(!row("nosrc").confirmed && !row("abst").confirmed, "no source, or Odelia abstains: not confirmed");
  ok(r2.unconfirmed >= 2, "the report counts what isn't confirmed");
  ok(r2.fees.open >= 2, "fees the agency sets are counted, not summed");
  const quoted: Application = { ...clone(a0), id: "quoted", status: "todo", source: { label: "sccgov.org", url: "https://www.sccgov.org/x", quote: "A permit is required.", checked: "2026-10-20" } };
  const r3 = buildReport({ ...ws, apps: [...ws.apps, quoted] }, TODAY);
  const q3 = r3.rows.find(x => x.id === "quoted")!;
  ok(q3.proof === "quoted" && q3.confirmed, "a row with the page's words and the day read is quoted");
  ok(all.rows.filter(r => r.status !== "held").every(r => r.proof === "linked"), "the sample's rows link the agency's page without its words: linked, not claimed as quoted");
  eq([row("nosrc").proof, row("abst").proof], ["open", "open"], "no page, or abstained: open");
  ok(reportCsv(r3, "en").includes("Yes, quoted") && reportCsv(r3, "en").includes("Linked, not quoted"), "the spreadsheet says which");
  ok(all.rows.filter(r => r.status === "approved").every(r => r.who.en === "Done"), "approved rows say done");
  // one store's report
  const sj = buildReport(ws, TODAY, { store: "sanjose" });
  const sjApps = new Set(ws.stores!.find(s => s.id === "sanjose")!.apps);
  ok(sj.rows.every(r => r.status === "held" || sjApps.has(r.id) || r.shared), "a store's report: its own applications and the company-wide ones");
  ok(!sj.rows.some(r => r.status === "held"), "another store's permits on file stay out");
  eq(sj.scope.en, "San Jose, North First St", "the scope is the store");
  const fl = buildReport(ws, TODAY, { store: "flushing" });
  ok(fl.renewals.some(x => x.store === "flushing"), "Flushing's renewals are in Flushing's report");
  // the spreadsheet
  const csv = reportCsv(all, "en"), zh = reportCsv(all, "zh"), both = reportCsv(all, "both");
  ok(csv.startsWith("﻿"), "a byte-order mark so Excel reads Chinese");
  const lines = csv.slice(1).split("\r\n");
  eq(lines.length, all.rows.length + 1, "a line for every row and the header");
  ok(lines[0].startsWith("Level,License or permit,Agency,Form,Status,Agency fee"), "English header");
  ok(zh.includes("执照或许可") && zh.includes("机构费用"), "Chinese header");
  ok(both.includes("Agency / 机构"), "both languages side by side");
  ok(/"[^"]*,[^"]*"/.test(csv), "a cell with a comma is quoted");
  eq(reportName(sj, "csv"), `moonleaf-tea-san-jose-north-first-st-licenses-${TODAY}.csv`, "the file name");
  eq(say({ en: "Agency", zh: "机构" }, "both"), "Agency / 机构", "both: English then Chinese");
  eq(say({ en: "IRS", zh: "IRS" }, "both"), "IRS", "both: once when they're the same");
}

/* ------------------------------ corrections ------------------------------ */
section("Plan review corrections");
{
  const numbered = parseComments(`Plan check comments, round 1
1. Show the location of the hand sink on sheet A-2.1.
2) Provide equipment spec sheets for the blender and the ice machine.
   NSF listed models only.
#3 The application form is missing the owner's signature.
Item 4: Grease interceptor sizing worksheet required. See P-1.`);
  eq(numbered.map(x => x.n), [1, 2, 3, 4], "numbered comments, the heading left out");
  ok(numbered[1].text.endsWith("NSF listed models only."), "a continued line stays with its comment");
  eq(numbered.map(x => x.sheet), ["A-2.1", undefined, undefined, "P-1"], "sheets named in the comment");
  eq(numbered.map(x => whoFor(x.text)), ["designer", "owner", "odelia", "designer"], "who fixes each");
  const plain = parseComments("Hand sink must be shown in the bar area\nProvide a finish schedule for walls and floors\nPay the plan review balance");
  eq(plain.map(x => x.n), [1, 2, 3], "one a line when they aren't numbered");
  eq(plain.map(x => whoFor(x.text)), ["designer", "designer", "odelia"], "unnumbered: who fixes each");
  const cn = parseComments("一、平面图上标明洗手池位置\n二、提供设备规格书\n三、申请表缺少签名");
  eq(cn.map(x => x.n), [1, 2, 3], "Chinese numbering");
  eq(cn.map(x => whoFor(x.text)), ["designer", "owner", "odelia"], "Chinese: who fixes each");
  eq(parseComments("第1条 补充隔油池计算\n第2条 提供菜单").map(x => x.n), [1, 2], "第1条 numbering");
  eq(parseComments("   \n  "), [], "nothing to parse");
  eq(parseComments("1. Same\n1. Again").map(x => x.n), [1, 2], "repeated numbers don't collide");
  eq(sheetOf("Revise the exhaust hood detail on M-2"), "M-2", "a mechanical sheet");
  eq(sheetOf("Section 114380 of the code"), undefined, "a code section is not a sheet");
  ok(parseComments("x".repeat(5000)).every(x => x.text.length <= 1200), "a comment is capped");
  ok(parseComments(Array.from({ length: 100 }, (_, i) => `${i + 1}. Comment ${i + 1}`).join("\n")).length === 60, "at most 60 comments a round");

  eq(addBusinessDays("2026-10-23", 2), "2026-10-27", "Friday plus 2 business days is Tuesday");
  eq(addBusinessDays("2026-10-21", 2), "2026-10-23", "Wednesday plus 2 is Friday");
  eq(businessDaysBetween("2026-10-23", "2026-10-27"), 2, "business days forward over a weekend");
  eq(businessDaysBetween("2026-10-27", "2026-10-23"), -2, "and backward");
  eq(businessDaysBetween("2026-10-23", "2026-10-23"), 0, "same day");

  const r1 = newRound("plancheck", "1. Show the hand sink on A-2\n2. Provide spec sheets for the reach-in", "2026-10-23", [], "PC-26-0141")!;
  eq([r1.round, r1.target, r1.reference, r1.items.length], [1, "2026-10-27", "PC-26-0141", 2], "a new round");
  const r2 = newRound("plancheck", "1. Hand sink still not dimensioned", "2026-11-02", [r1])!;
  eq(r2.round, 2, "the next round is numbered after the last");
  eq(newRound("plancheck", "", "2026-10-23"), null, "no comments, no round");
  r1.items[0].response = "Hand sink added at the bar, dimensioned.";
  r1.items[0].done = true;
  r1.items[1].response = "已提供规格书";
  eq(progress(r1), { done: 1, of: 2 }, "progress");
  eq(waitingOn(r1), { designer: 0, owner: 1, odelia: 0 }, "who it waits on");
  eq(notEnglish(r1).map(i => i.n), [2], "a response in Chinese is flagged before it goes to the agency");
  const letter = responseLetter(r1, { business: "Moonleaf Tea", address: "150 N First St, San Jose", application: "Food facility plan check", agency: "Santa Clara County DEH", today: "2026-10-24" });
  ok(letter.startsWith("RESPONSE TO PLAN REVIEW COMMENTS"), "the letter's title");
  ok(letter.includes("Plan check or permit number: PC-26-0141") && letter.includes("Response round 1"), "the reference and the round");
  ok(letter.includes("Comment 1: Show the hand sink on A-2") && letter.includes("Response: Hand sink added at the bar, dimensioned.") && letter.includes("Revised on sheet: A-2"), "each comment, its response and its sheet");
  const empty = newRound("x", "1. Something", "2026-10-23")!;
  ok(responseLetter(empty, { business: "B", application: "A", agency: "G", today: "2026-10-23" }).includes("[Response to be written]"), "a missing response is marked, not left blank");
  ok(explainPrompt(r1, "图纸审查", "县环境卫生局", "zh").includes("逐条用中文解释") && explainPrompt(r1, "plan check", "DEH", "en").includes("never invent"), "Odelia's ask, in both languages, never inventing facts");
  r1.items[1].who = "designer";
  ok(designerPrompt(r1, "plan check", "DEH", "en")!.includes("Show it to me to approve"), "the architect's email waits for the owner's approval");
  r1.items[1].done = true;
  eq(designerPrompt(r1, "plan check", "DEH", "en"), null, "nothing for the architect once their items are done");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
