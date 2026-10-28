/* Measured outcomes (migration 20261105091400_outcomes.sql, src/outcomes.ts, site/stats.js). Run from scripts/agent-test.ts.
     1. the database's numbers are the app's: touch minutes, cost constants, the gates of 20 and 5
     2. every baseline row is seeded from a public page, with its address and the day it was read
     3. the website never prints an unmeasured number: under 20 filings every line keeps its placeholder, a comparison
        needs both sides, a ratio is computed and never rounded up, "50 times" appears only when the data says so
     4. the opening estimate uses an agency's observed time from 5 approvals, not 4
     5. the export: one line per filing, the sample under every summary number, no formula injection */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ASSUME, OUTCOME_GATES, VENDOR } from "../src/economics";
import { csvCell, outcomesCsv, type OutcomeMetrics, type OutcomeRow } from "../src/outcomes";
import { AGENCY_MIN_N, agencyKey, stepTiming } from "../src/smart";
import { formById } from "../src/forms/registry";
import type { Application } from "../src/model";
import { B } from "../src/bi";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

type View = { metrics: Record<string, string | null>; comparisons: { text: string; source: string }[] };
function loadStats(): (data: unknown, zh: boolean) => View {
  const box: { PlacettaStats?: { statsView: (d: unknown, zh: boolean) => View } } = {};
  vm.runInNewContext(readFileSync("site/stats.js", "utf8"), { window: box, globalThis: box, Math, Number, String, Date, isFinite, Array });
  return box.PlacettaStats!.statsView;
}

export function outcomesTests(ok: Ok, eq: Eq) {
  console.log("\n# Measured outcomes: the numbers, the baseline, the stats page and the agency times");
  const sql = readFileSync("supabase/migrations/20261105091400_outcomes.sql", "utf8");
  const num = (key: string) => Number(new RegExp(`'${key}',\\s*([0-9.]+)`).exec(sql)?.[1]);

  /* 1. the same numbers in the app and the database */
  const t = ASSUME.ownerTouchMinutes;
  eq([num("approval"), num("upload"), num("hand_back"), num("answer")], [t.approval, t.upload, t.hand_back, t.answer], "owner touch minutes agree: approval, upload, hand-back, answer");
  eq([num("stripe_card_pct"), num("stripe_card_fixed"), num("fax_page"), num("letter"), num("browser_hour")],
    [VENDOR.stripeCardPct.usd, VENDOR.stripeCardFixed.usd, VENDOR.faxPage.usd, VENDOR.letter.usd, VENDOR.browserHour.usd], "cost constants agree with the vendors' prices in src/economics.ts");
  eq([num("team_hour_usd"), num("pages_per_filing")], [ASSUME.teamHourUsd, ASSUME.pagesPerFiling], "team hour and pages per filing agree");
  eq([num("public_min_n"), num("agency_min_n"), AGENCY_MIN_N], [OUTCOME_GATES.publicMinN, OUTCOME_GATES.agencyMinN, OUTCOME_GATES.agencyMinN], "the gates: 20 for the website, 5 for an agency's time");
  ok(/FOUNDER TO CONFIRM: minutes an owner spends/.test(sql), "the touch estimates are marked for the founder");

  /* 2. the baseline: every row sourced and dated, nothing typed without a page */
  const seed = sql.slice(sql.indexOf("insert into public.alternative_costs"), sql.indexOf("on conflict (form, kind, provider) do nothing"));
  const rows = [...seed.matchAll(/\('([a-z0-9-]+)', '(diy|expediter|consultant)', '([^']+)', ([^,]+), ([^,]+), ([^,]+), ([^,]+),\s*'((?:[^']|'')*)',\s*'([^']+)', '(\d{4}-\d\d-\d\d)'\)/g)];
  ok(rows.length >= 6, "the baseline is seeded", rows.length);
  ok(rows.every(r => r[9].startsWith("https://") && r[10] <= new Date().toISOString().slice(0, 10)), "every baseline row carries an https source and the day it was read");
  ok(rows.every(r => [r[4], r[5], r[7]].every(v => v.trim() === "null" || r[8].includes(v.trim().replace(/\.0+$/, "")) || (v.trim() === "8.68" && /5 hr 58 min.*1 hr 17 min.*1 hr 26 min/.test(r[8])))),
    "every number in a baseline row is stated in its note (8.68 hours is the IRS's three times added)", rows.map(r => [r[1], r[4], r[5], r[7]]));
  ok((5 * 60 + 58 + 77 + 86) / 60 > 8.68 - 0.01 && (5 * 60 + 58 + 77 + 86) / 60 < 8.68 + 0.01, "the SS-4 hours add up: 5 h 58 + 1 h 17 + 1 h 26 = 8.68 h");

  /* 3. the website prints only what is measured */
  const view = loadStats();
  const empty = view({ min_n: 20, filings: 7, licenses_approved: null, median_days: null, human_free_pct: null, owner_touches: null, owner_hours: null, comparisons: [] }, false);
  ok(Object.values(empty.metrics).every(v => v === null) && empty.comparisons.length === 0, "under 20 filings nothing is printed");
  // a server that sent too small a sample anyway is still refused here
  const small = view({ min_n: 20, licenses_approved: { n: 19, value: 19 }, comparisons: [{ form: "irs-ss4", metric: "owner_hours", placetta: 0.05, n: 19, kind: "diy", provider: "IRS", baseline: 8.68, source_url: "https://www.irs.gov/instructions/iss4", read_on: "2026-10-28" }] }, false);
  ok(small.metrics.licenses_approved === null && small.comparisons.length === 0, "a number or comparison on 19 filings is never printed, whatever the server says");
  const nosrc = view({ min_n: 20, comparisons: [{ form: "irs-ss4", metric: "price", placetta: 299, n: 40, kind: "expediter", provider: "X", baseline: null, source_url: "https://x.example" },
    { form: "irs-ss4", metric: "price", placetta: 299, n: 40, kind: "expediter", provider: "X", baseline: 79, source_url: "http://insecure.example" }] }, false);
  ok(nosrc.comparisons.length === 0, "a comparison needs a sourced baseline with an https page");
  const full = view({ min_n: 20, licenses_approved: { n: 25, value: 25 }, median_days: { n: 25, value: 6 }, human_free_pct: { n: 30, value: 80 }, owner_touches: { n: 25, value: 1.2 }, owner_hours: { n: 25, value: 0.04 },
    comparisons: [
      { form: "irs-ss4", metric: "owner_hours", placetta: 0.04, n: 25, kind: "diy", provider: "IRS", baseline: 8.68, unit: null, source_url: "https://www.irs.gov/instructions/iss4", read_on: "2026-10-28" },
      { form: "irs-ss4", metric: "days", placetta: 6, n: 25, kind: "diy", provider: "IRS", baseline: 4, unit: "business", source_url: "https://www.irs.gov/instructions/iss4", read_on: "2026-10-28" },
      { form: "ca-llc-1", metric: "days", placetta: 3, n: 21, kind: "diy", provider: "California Secretary of State", baseline: 5, unit: "calendar", source_url: "https://www.sos.ca.gov/x", read_on: "2026-10-28" },
      { form: "irs-ss4", metric: "price", placetta: 299, n: 25, kind: "expediter", provider: "LegalZoom", baseline: 79, unit: null, source_url: "https://legalzoom.com/x", read_on: "2026-10-28" }] }, false);
  ok(full.metrics.licenses_approved === "25 (25 filings)" && full.metrics.median_days === "6 days (25 filings)" && full.metrics.human_free_pct === "80% (30 filings)", "with 20 or more, each number shows with its sample", full.metrics);
  const hours = full.comparisons.find(c => c.text.startsWith("EIN") && c.text.includes("hours"));
  ok(hours && hours.text.includes("217 times less of the owner's time") && hours.source === "https://www.irs.gov/instructions/iss4", "the owner-time ratio is computed from the two numbers (8.68 / 0.04 = 217) and cites the IRS", hours?.text);
  const biz = full.comparisons.find(c => c.text.includes("business days"));
  ok(biz && !/times/.test(biz.text), "calendar days against business days: both said, no ratio", biz?.text);
  const llc = full.comparisons.find(c => c.text.startsWith("California LLC"));
  ok(llc && llc.text.includes("1.6 times faster"), "a ratio is rounded down, never up (5 / 3 = 1.67 says 1.6)", llc?.text);
  const price = full.comparisons.find(c => c.text.includes("$299"));
  ok(price && !/times/.test(price.text), "when Placetta costs more, both prices are said and no ratio is claimed", price?.text);
  ok(full.comparisons.every(c => !/\b50(\.\d)? ?(times|x|×)/i.test(c.text)), "no 50 times claim when no measured ratio is 50");
  const fifty = view({ min_n: 20, comparisons: [{ form: "irs-ss4", metric: "owner_hours", placetta: 0.17, n: 30, kind: "diy", provider: "IRS", baseline: 8.68, source_url: "https://www.irs.gov/instructions/iss4", read_on: "2026-10-28" }] }, false);
  ok(fifty.comparisons[0]?.text.includes("51 times less"), "a 50 times claim appears only when the measured ratio supports it (8.68 / 0.17 = 51.06)", fifty.comparisons[0]?.text);
  const zh = view({ min_n: 20, owner_hours: { n: 25, value: 0.04 }, comparisons: [{ form: "irs-ss4", metric: "owner_hours", placetta: 0.04, n: 25, kind: "diy", provider: "IRS", baseline: 8.68, source_url: "https://www.irs.gov/instructions/iss4", read_on: "2026-10-28" }] }, true);
  ok(zh.metrics.owner_hours?.includes("小时") && zh.comparisons[0]?.text.includes("217 倍") && zh.comparisons[0]?.text.includes("2026年10月28日"), "the Chinese page says the same", zh);
  const bad = view({ min_n: 20, licenses_approved: { n: "lots", value: 25 }, human_free_pct: { n: 30, value: 140 }, median_days: { n: 25, value: "NaN" } }, false);
  ok(Object.values(bad.metrics).every(v => v === null), "malformed or impossible numbers are not printed");
  ok([...full.comparisons, ...zh.comparisons].every(c => !/[—–]/.test(c.text)) && Object.values(full.metrics).every(v => !v || !/[—–]/.test(v)), "no em or en dashes in what the page prints");

  // the static pages: the stats page holds only its placeholders, and no page claims a multiple
  const page = readFileSync("site/stats.html", "utf8");
  const cells = [...page.matchAll(/<td data-value>([^<]*)<\/td>/g)].map(m => m[1]);
  ok(cells.length === 10 && cells.every(c => c === "We publish this once we have 20 filings." || c === "满 20 份申请后公布。"), "every result on the static page is the placeholder, in English and Chinese", cells);
  const cmp = [...page.matchAll(/<div data-comparisons>([\s\S]*?)<\/div>/g)].map(m => m[1].replace(/<[^>]+>/g, ""));
  ok(cmp.length === 2 && cmp.every(c => (c.match(/\d+/g) ?? []).every(d => d === "20")), "the comparison section prints no number but the 20 it waits for", cmp);
  const pages = ["site/index.html", "site/zh.html", "site/stats.html", "site/about.html", "site/trust.html", "site/ai.html", "site/editorial.html"];
  const claim = /\b\d+(\.\d+)?\s?(x|×|times)\s(faster|cheaper|better|less|fewer|quicker|more)\b|\b\d+(\.\d+)?x\b|\d+(\.\d+)?\s?倍/i;
  const visibleText = (h: string) => h.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  const claims = pages.flatMap(f => { const m = visibleText(readFileSync(f, "utf8")).match(new RegExp(claim.source, "gi")); return (m ?? []).map(x => `${f}: ${x}`); });
  ok(claims.length === 0, "no page on the site states a multiple (\"50x\", \"10 times faster\") that isn't computed from data", claims.slice(0, 5));
  ok(readFileSync("site/index.html", "utf8").includes('href="/stats.html"') && readFileSync("site/zh.html", "utf8").includes('href="/stats.html"'), "the landing pages link to the stats page");

  /* 4. the opening estimate learns each agency's time */
  const f = formById("sj-building-ti")!;
  const a = { id: "b", name: f.title, agency: f.agency, level: f.level, status: "todo", fees: [], est: f.takes ?? B("", ""), source: { label: "", url: f.info }, fields: [], official: f.id, checklist: [] } as unknown as Application;
  const key = agencyKey(f.agency.en);
  const at = (n: number) => stepTiming(a, { agencies: [{ agency: key, n, median_days: 9, p90_days: 14 }] });
  eq(at(4).timing.kind === "measured", false, "4 approvals at an agency: the published time still decides");
  const five = at(5);
  ok(five.timing.kind === "measured" && five.days.typical === 9 && five.days.slow === 14 && /5 of Placetta's approved filings/.test(five.timing.say.en) && five.timing.say.zh.includes("5 份"), "5 approvals: the agency's observed median and slow end decide, and the estimate says how many", five);
  const formFirst = stepTiming(a, { stats: [{ form: f.id, n: 3, median_days: 20, p90_days: 30, rejected_pct: 0 }], agencies: [{ agency: key, n: 9, median_days: 9, p90_days: 14 }] });
  eq(formFirst.days.typical, 20, "the form's own measured time comes before the agency's");
  eq(agencyKey("  City of San José "), "city of san josé", "an agency is keyed by its English name, trimmed and lower case, as agency_times keys it");

  /* 5. the export */
  const row = { filing: "f1", workspace: "abc", form: "irs-ss4", agency: "=HYPERLINK(\"x\")", status: "accepted", channel: "fax", submitted_at: null, decided_at: null, days_to_approval: 6, form_seq: 1,
    owner_touches: 1, owner_hours: 0.03, team_minutes: 0, human_free: true, rejections: 0, resubmissions: 0, price_usd: 299, agency_fee_usd: 0, ai_usd: 0.05, browser_usd: 0.02, telephony_usd: 0.03, stripe_usd: 8.97, team_usd: 0 } as OutcomeRow;
  const m = { licenses_approved: { n: 25, value: 25 }, median_days: { n: 25, value: 6 }, human_free: { n: 30, pct: 80, unattended_pct: 10 }, owner_touches: { n: 25, mean: 1.2, hours_mean: 0.04, by_kind: {} },
    team_minutes: { n: 25, mean: 3 }, ai_usd: { n: 25, mean: 0.05 }, margin: { n: 25, per_license_mean: 280, pct: 93 }, renewals: { n: 0, on_time_pct: null }, workspaces: { n: 4, retained_pct: 100 },
    flywheel: [{ bucket: "1", n: 3, median_cost_usd: 12, median_days: 7, median_team_minutes: 30, human_free_pct: 0 }] } as unknown as OutcomeMetrics;
  const csv = outcomesCsv([row], m).split("\n");
  ok(csv[0].startsWith("filing,workspace,form,agency") && csv[1].includes(`"'=HYPERLINK(""x"")"`), "the export neutralizes a formula and quotes what needs it", csv[1]);
  ok(csv.includes("median_days_to_approval,6,25") && csv.includes("renewed_on_time_pct,,0") && csv.includes("flywheel_1_median_cost_usd,12,3"), "every summary number carries its sample; an unmeasured one is blank", csv.slice(3));
  eq([csvCell(-3), csvCell("-3"), csvCell("@x")], ["-3", "-3", "'@x"], "negative numbers stay numbers; an @ cell is neutralized");
}
