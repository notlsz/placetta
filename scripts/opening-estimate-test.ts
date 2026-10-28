// The opening estimate and the agencies' expedite options (src/smart.ts openingPath, src/forms/expedite.ts,
// src/expedite.ts). Run from scripts/agent-test.ts.
//   1. the critical path: each step starts when the steps it waits on are done, and the date is the longest chain
//   2. the range: the same chain at every step's quickest and longest published time, said "Jan 7, likely Dec 20 to Feb 3"
//   3. the hinge: the one or two steps that decide the date, each with its time and the page that states it
//   4. one date per store, on every surface, in English and Chinese
//   5. no invented numbers: a step with no published time says so and uses the 30-day default, labeled a default
//   6. expedite: picking it changes the estimate, the agency's fee line, and the line the form carries; standard undoes it
//   7. every time and fee cites the issuing agency
import { B } from "../src/bi";
import type { Application, Approval, Store, Workspace } from "../src/model";
import { estimateSay, hingeSay, openingOf, openingPath, preflight, stepTiming, withOpenings, workspaceEstimate, workspaceOpening } from "../src/smart";
import { costToOpen } from "../src/cost";
import { SAMPLE_WS } from "../src/sample";
import { FORMS, formById } from "../src/forms/registry";
import { expediteOf as speedTiers } from "../src/forms/speed";
import { DEFAULT_TIMING, EXPEDITE, TIMES, calendarDays, expediteOptions, hostOf, spanFromWords, spanSay, timingOf } from "../src/forms/expedite";
import { chooseExpedite, choices, expediteStep, withExpedite } from "../src/expedite";
import { answersHash, answersOf } from "../src/forms/versions";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

const TODAY = "2026-10-27";
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** An application as the plan makes it from the registry: its official form, the agency's own sentence, waiting on deps. */
function app(id: string, official: string | undefined, deps: string[] = [], extra: Partial<Application> = {}): Application {
  const f = official ? formById(official) : undefined;
  return {
    id, name: f ? f.title : B(id, id), agency: f ? f.agency : B("The agency", "机构"), level: f?.level ?? "city", status: "todo",
    fees: f?.fee != null ? [{ label: B("Agency fee", "机构费用"), amount: f.fee }] : [{ label: B("Agency fee", "机构费用"), amount: 0, tbd: true }],
    est: f?.takes ?? B("The agency doesn't publish a processing time.", "机构未公布办理时间。"), source: { label: hostOf(f?.info), url: f?.info ?? "" },
    fields: (f?.fields ?? []).map(x => ({ id: x.id, label: x.label, value: "" })), official,
    checklist: deps.map(d => ({ id: "dep-" + d, label: B(d, d), state: "missing" as const, dep: d })), ...extra,
  };
}
function ws(apps: Application[], store: Partial<Store> = {}): Workspace {
  const s: Store = { id: "st", name: B("Test store", "测试门店"), address: "100 N First St, San Jose, CA 95113", stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: apps.map(a => a.id), ...store };
  return { ...SAMPLE_WS, apps, stores: [s], approvals: [], deadlines: [], audit: [], closed: [] } as Workspace;
}

export function openingEstimateTests(ok: Ok, eq: Eq) {
  console.log("\n# The opening estimate: critical path, range, hinge, sources, expedite");

  /* 1. the critical path: formation, then EIN, then seller's permit; plan check, then building permit, then health permit */
  {
    const apps = [
      app("ein", "irs-ss4"),
      app("seller", "ca-cdtfa", ["ein"]),
      app("plan", "scc-plan-check"),
      app("building", "sj-building-ti", ["plan"]),
      app("health", "scc-health-permit", ["building"]),
    ];
    const w = ws(apps), p = openingPath(w.stores![0], w, TODAY);
    eq(p.chain, ["plan", "building", "health"], "the critical chain runs plan check, then building permit, then health permit");
    // usual times: plan check up to 20 business days (28 days) + a week to gather documents; San José's building review
    // 15 working days (21) + a week; the health permit has no published time: the 30-day default + a week
    const typical = (28 + 7) + (21 + 7) + (30 + 7), fast = (28 + 7) + (14 + 7) + (30 + 7), slow = (28 + 7) + (28 + 7) + (30 + 7);
    eq(p.landing, addDays(TODAY, typical), "the date is the end of the longest chain at the usual times");
    eq(p.range, { fast: addDays(TODAY, fast), slow: addDays(TODAY, slow) }, "the range is the same chain at the quickest and longest published times");
    ok(p.range!.fast <= p.landing! && p.landing! <= p.range!.slow, "the date sits inside its range");
    // the EIN chain (fax, 4 business days, then the seller's permit the same day) is shorter, so it isn't critical
    ok(!p.chain.includes("ein") && !p.chain.includes("seller"), "the EIN and seller's permit aren't on the critical chain", p.chain);
    // a step never starts before what it waits on: the seller's permit waits on the EIN
    const ein = stepTiming(apps[0]).days.typical, seller = stepTiming(apps[1]).days.typical;
    eq([ein, seller], [6, 1], "the EIN takes 4 business days by fax (6 days) and the seller's permit is often issued the same day");
    // the hinge: the longest step on the chain, and the next when it's at least half as long
    eq(p.hinge.map(h => h.app), ["health", "plan"], "the date hinges on the two longest steps on the chain");
    eq(p.hinge[0].timing.kind, "default", "a step with no published time is a default, not a number of ours");
    const h = hingeSay(p)!;
    eq(h.en, "The date hinges on Health permit to operate a food facility, issued after the final inspection; no published time, a 30-day default; and Food facility plan check, up to 20 business days after payment, per deh.santaclaracounty.gov.", "the hinge names each step, its time and its source");
    eq(h.zh, "开业日期取决于：食品设施卫生营业许可证，竣工检查后签发；未公布办理时间，按默认 30 天估算；以及食品设施图纸审查，付款后最长 20 个工作日，依据 deh.santaclaracounty.gov。", "and in Chinese");
  }

  /* the hinge with only published times: plan check then building permit */
  {
    const w = ws([app("plan", "scc-plan-check"), app("building", "sj-building-ti", ["plan"])]);
    const p = openingPath(w.stores![0], w, TODAY);
    eq(p.hinge.map(h => h.app), ["plan", "building"], "the hinge is the plan check, then the building permit");
    eq(hingeSay(p)!.en, "The date hinges on Food facility plan check, up to 20 business days after payment, per deh.santaclaracounty.gov; and Building permit for a tenant improvement, 10 to 20 working days: 10 for the first review, 5 for each recheck, per sanjoseca.gov.", "each with its own words and host");
    ok(p.hinge.every(h => /^https:\/\//.test(h.timing.source ?? "")), "each hinge step links to its source", p.hinge.map(h => h.timing.source));
  }

  /* 2. the range, said */
  {
    eq(estimateSay("2027-01-07", { fast: "2026-12-20", slow: "2027-02-03" }).en, "Jan 7, 2027, likely Dec 20, 2026 to Feb 3", "the date, then the likely range, a year only where it differs");
    eq(estimateSay("2027-01-07", { fast: "2026-12-20", slow: "2027-02-03" }).zh, "2027年1月7日，可能在 2026年12月20日 至 2月3日 之间", "and in Chinese");
    eq(estimateSay("2027-01-07", { fast: "2027-01-07", slow: "2027-01-07" }).en, "Jan 7, 2027", "no range when every step's time is exact");
    const all = [estimateSay("2027-01-07", { fast: "2027-01-02", slow: "2027-02-03" }), hingeSay(openingPath(SAMPLE_WS.stores!.find(s => s.stage === "opening")!, SAMPLE_WS, TODAY))!];
    ok(all.every(x => !/[·•]/.test(x.en + x.zh) && !/\b0\d\b/.test(x.en)), "no dot separators and no leading zeros", all);
  }

  /* 4. one date per store, everywhere */
  {
    const w = SAMPLE_WS, today = TODAY;
    for (const s of (w.stores ?? []).filter(x => x.stage === "opening")) {
      const d = openingOf(s, w, today), p = openingPath(s, w, today);
      const milestone = withOpenings(w, today).find(x => x.id === `open-${s.id}`)?.date;
      eq([p.landing, milestone], [d, d], `${s.name.en}: the store card, Deadlines and the estimate share one date`);
      ok(p.range && p.range.fast <= d! && d! <= p.range.slow, `${s.name.en}: the range is around that date`, p.range);
    }
    const est = workspaceEstimate(w, today)!, open = workspaceOpening(w, today)!;
    // (the first-run build reads the same workspaceEstimate: scripts/home-next-test.ts checks its date, range and hinge)
    eq([est.date, costToOpen(w, { today }).landing], [open.date, open.date], "Home and Cost to open show the same date");
    ok(estimateSay(est.date, est.path!.range).zh.startsWith(estimateSay(est.date).zh), "the Chinese estimate says the same date");
  }

  /* 5. no invented numbers */
  {
    eq(timingOf(app("x", undefined)).kind, "default", "a step with no form and no source uses the default");
    eq(DEFAULT_TIMING.say.en, "no published time; a 30-day default", "and says it's a default");
    eq(spanFromWords("No standard time published; expedited review in 1 to 2 business days."), null, "a sentence that says no time is published gives no number");
    eq(spanFromWords("If you pay during registration, the account activates in 2 to 3 business days; otherwise the invoice is mailed within 5 to 10 business days."), { fast: 2, typical: 3, slow: 3, unit: "business" }, "the agency's first stated time, its range kept");
    eq(spanFromWords("Average: 2 weeks."), { fast: 14, typical: 14, slow: 14, unit: "calendar" }, "weeks in days");
    eq(spanFromWords("Eligible small businesses opening a new business can get a 30-day review once the application is complete.")?.typical, 30, "a 30-day review is 30 days");
    eq(spanSay({ fast: 10, typical: 15, slow: 20, unit: "business" }).en, "10 to 20 business days", "a span said in words");
    eq(calendarDays(10, "business"), 14, "10 business days are 14 calendar days");
    const nyc = timingOf(app("alt", "nyc-dob-alt"));
    ok(nyc.kind === "report" && /performance report/.test(hingeSay({ hinge: [{ app: "alt", name: B("Alteration", "改建"), agency: B("DOB", "DOB"), days: { fast: 5, typical: 9, slow: 9 }, timing: nyc }] })!.en), "an official performance report is labeled as one", nyc);
  }

  /* 6. expedite: the estimate, the fee and the form's line move with the pick */
  {
    const tier = "Restaurant/Caterer - NEW: 501 - 1,999 Sq. Ft. - $1,530.00";
    const plan = app("plan", "lac-plan-check");
    plan.fields = plan.fields.map(f => (f.id === "square_footage" ? { ...f, value: tier } : f));
    const permit = app("permit", "lac-health-permit", ["plan"]);
    let w = ws([plan, permit], { address: "100 Main St, Los Angeles, CA 90012" });
    const card: Approval = { id: "ap-plan", kind: "file", app: "plan", title: B("File the plan check", "提交图纸审查"), does: [], action: B("Approve", "批准"), hash: answersHash(plan) };
    w = { ...w, approvals: [card] };
    const before = openingPath(w.stores![0], w, TODAY);
    const list = choices(plan);
    eq(list.map(c => c.id), [null, "expedited"], "Los Angeles County's plan review offers standard and expedited");
    eq([list[0].time.en, list[1].time.en, list[1].fee.en], ["within 20 working days after payment", "within 10 working days after payment", "+$765 agency fee"], "the card says each side's time and the agency's extra fee for this size");
    w = chooseExpedite(w, "plan", "expedited");
    const a = w.apps.find(x => x.id === "plan")!, after = openingPath(w.stores![0], w, TODAY);
    eq(a.expedite, "expedited", "the pick is kept on the application");
    eq(Date.parse(before.landing!) - Date.parse(after.landing!), 14 * 864e5, "the estimate moves 10 working days (14 days) earlier at once");
    eq(after.hinge.find(h => h.app === "plan")?.expedite?.id, "expedited", "the hinge says the step is expedited");
    eq(answersOf(a).square_footage, "Restaurant/Caterer - NEW: 501 - 1,999 Sq. Ft. (Expedited) - $2,295.00", "the form's fee line becomes the expedited one Odelia fills");
    eq(a.fees.filter(f => f.expedite).map(f => [f.amount, !!f.tbd]), [[765, false]], "the agency's own expedite fee is on the fee list, at its amount");
    eq(w.approvals[0].hash, answersHash(a), "the waiting card is brought in line with the new answers, so it can still be approved");
    ok(/Ask for expedited plan review on the agency's own form/.test(expediteStep(a)?.en ?? "") && /paid to the agency, not to Placetta/.test(expediteStep(a)?.en ?? ""), "the card's steps say how it's asked for and who is paid", expediteStep(a));
    ok(!preflight(w, w.approvals[0], TODAY).warnings.some(x => x.label.en === "Fee"), "the expedite fee isn't read as a wrong agency fee");
    ok(w.audit.some(x => x.action.en === "Chose expedited review"), "the pick is on the activity log");
    w = chooseExpedite(w, "plan", null);
    const back = w.apps.find(x => x.id === "plan")!;
    eq([back.expedite, answersOf(back).square_footage, back.fees.some(f => f.expedite), openingPath(w.stores![0], w, TODAY).landing], [undefined, tier, false, before.landing], "standard again undoes every part of it");
    // Dallas: the portal's review type line carries the Q-Team request
    const dal = withExpedite(app("dal", "dal-building"), "q-team");
    ok(answersOf(dal).review_type === "Minor Commercial Q-Team Express Plan Review" && dal.fees.some(f => f.expedite && f.tbd), "Dallas's review type line says Q-Team, its fee set by the agency", dal);
    // the IRS: free and faster, kept as the team's step
    const irs = withExpedite(app("ein", "irs-ss4"), "phone");
    eq([stepTiming(irs).days.typical, irs.fees.filter(f => f.expedite).map(f => f.amount)], [0, [0]], "the IRS by phone: issued on the call, no fee");
    // an option with no published time leaves the estimate alone and says so
    const sj = withExpedite(app("b", "sj-building-ti"), "star");
    eq(stepTiming(sj).days, stepTiming(app("b", "sj-building-ti")).days, "STAR has no published time: the estimate keeps the standard one");
    ok(/the estimate keeps the standard time/.test(choices(sj)[1].time.en), "and the card says so");
    eq(withExpedite(plan, "nope"), plan, "an unknown option changes nothing");
  }

  /* the Secretary of State tiers on the registry rows (src/forms/speed.ts) and this file's options: one list, each once */
  {
    const rows = FORMS.filter(f => (f.expedite ?? []).length);
    ok(rows.length > 0, "the registry rows carry their own expedite tiers", rows.length);
    let shown = 0;
    for (const f of rows) {
      const opts = expediteOptions(f.id, TODAY), current = speedTiers(f, TODAY);
      ok(new Set(opts.map(o => o.id)).size === opts.length && new Set(opts.map(o => o.label.en)).size === opts.length, `${f.id}: each option once`, opts.map(o => o.id));
      ok(current.every(c => opts.some(o => o.label.en === c.label.en)), `${f.id}: every current tier is offered`);
      shown += opts.length;
    }
    const sos = rows.find(f => speedTiers(f, TODAY).some(x => x.hours != null));
    if (sos) {
      const tier = expediteOptions(sos.id, TODAY).find(o => o.hours != null)!;
      const before = stepTiming(app("f", sos.id)).days.typical, after = stepTiming(withExpedite(app("f", sos.id), tier.id)).days.typical;
      ok(after <= before && after === Math.ceil(tier.hours! / 24), `${sos.id}: picking ${tier.label.en} moves the step to its stated turnaround`, [before, after]);
      eq(choices(app("f", sos.id)).length, expediteOptions(sos.id).length + 1, `${sos.id}: the card offers standard and each tier, once`);
    }
    ok(shown > 0, "registry tiers reach the choice", shown);
  }

  /* 7. every time and fee cites the issuing agency */
  {
    const official = (u: string) => /\.gov$/.test(hostOf(u)) || ["houstonhealth.org", "dallascityhall.com"].includes(hostOf(u));
    for (const [id, t] of Object.entries(TIMES)) ok(formById(id) && (t.kind === "default" ? !t.source && /no published time/.test(t.say.en) : t.source && official(t.source)) && t.say.en && t.say.zh && t.fast <= t.typical && t.typical <= t.slow, `${id}: its time cites the agency, fast to slow`, t);
    for (const [id, list] of Object.entries(EXPEDITE)) for (const x of expediteOptions(id)) {
      ok(formById(id), `${id}: the form is in the library`);
      ok(official(x.source.url) && x.source.quote.length > 10 && x.turnaround.en && x.turnaround.zh && (x.feeUsd != null || x.feeNote), `${id} ${x.id}: fee, turnaround and an official source`, x);
      ok(!x.span || (x.span.fast <= x.span.typical && x.span.typical <= x.span.slow), `${id} ${x.id}: its span runs fast to slow`);
      void list;
    }
  }
}
