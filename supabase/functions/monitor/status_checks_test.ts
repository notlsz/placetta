// deno test supabase/functions/monitor/status_checks_test.ts
// The daily status check: which filings it checks, how (code, page hash, model), when it notifies, backs off and
// escalates, and what it costs.
import { deepStrictEqual as eq, ok } from "node:assert";
import { modelCheckPrompt, runStatusChecks, type Check, type Event, type StatusFiling, type StatusIO, type Update, type WsState } from "./status_checks.ts";
import { BACKOFF, checksPerStoreMonth, nextCheckAt, pageText, realChange, sla, escalate, type Tracking } from "../../../src/tracking/index.ts";
import { LOOKUPS, lookupFor, normStatus } from "../../../src/filingPlaybooks/status.ts";

const today = "2026-10-22", now = Date.parse("2026-10-22T13:00:00Z");
const sf: WsState = { apps: [{ id: "bp", name: { en: "Building permit", zh: "建筑许可" }, agency: { en: "SF DBI", zh: "旧金山建筑检查局" }, est: { en: "4 to 6 weeks", zh: "4 至 6 周" } },
  { id: "hp", name: { en: "Health permit", zh: "卫生许可" }, agency: { en: "SF DPH", zh: "旧金山卫生局" }, est: { en: "30 days", zh: "30 天" } },
  { id: "sp", name: { en: "Sign permit", zh: "招牌许可" }, agency: { en: "SF Planning", zh: "旧金山规划局" }, est: { en: "2 weeks", zh: "2 周" } }],
  stores: [{ address: "760 14th St, San Francisco, CA 94114", apps: ["bp", "hp", "sp"] }],
  deadlines: [{ id: "d1", app: "sp", date: "2026-11-05", kind: "due", title: { en: "x", zh: "x" } }] };
const filing = (id: string, app: string, status: string, extra: Partial<StatusFiling> = {}): StatusFiling =>
  ({ id, workspace_id: "w1", app_id: app, title: { en: app, zh: app }, status, updated_at: "2026-10-01T00:00:00Z", submitted_at: "2026-10-01T00:00:00Z", ...extra });

function io(o: { tracking?: Record<string, Tracking & { lookup_url?: string }>; json?: unknown; page?: string; failFetch?: boolean } = {}) {
  const log = { checks: [] as Check[], events: [] as Event[], updates: [] as Update[], tasks: [] as string[], runs: [] as string[], saved: new Map<string, Tracking>(), fetched: [] as string[] };
  const x: StatusIO = {
    tracking: async () => new Map(Object.entries(o.tracking ?? {})),
    fetchJson: async (u) => { log.fetched.push(u); if (o.failFetch) throw new Error("503"); return o.json ?? []; },
    fetchText: async (u) => { log.fetched.push(u); if (o.failFetch) throw new Error("503"); return o.page ?? ""; },
    saveTracking: async (id, _ws, t) => { log.saved.set(id, t); },
    check: async (c) => { log.checks.push(c); },
    event: async (e) => { log.events.push(e); return true; },
    update: async (u) => { log.updates.push(u); return true; },
    teamTask: async (_f, _w, t) => { log.tasks.push(t); },
    start: async (_ws, p) => { log.runs.push(p); return "run-" + log.runs.length; },
  };
  return { x, log };
}
const run = (filings: StatusFiling[], x: StatusIO, extra: { maxModel?: number } = {}) => runStatusChecks({ filings, states: new Map([["w1", sf]]), today, now, io: x, ...extra });

Deno.test("scope: submitted, in progress and needs-info daily, plus anything hot; finished ones never", async () => {
  const { x, log } = io();
  const r = await run([filing("f1", "hp", "submitted"), filing("f2", "hp", "accepted"), filing("f3", "sp", "requested"), filing("f4", "hp", "requested"), filing("f5", "hp", "canceled")], x);
  eq(r.checked, 2, "the submitted one, and the requested sign permit with a deadline in 14 days");
  eq([...log.saved.keys()].sort(), ["f1", "f3"]);
});

Deno.test("open data: read in code, no model, notified only on a real change", async () => {
  const row = [{ permit_number: "202610221234", status: "issued", status_date: "2026-10-21T10:00:00.000", description: "TI for a tea shop" }];
  const a = io({ json: row });
  const r = await run([filing("f1", "bp", "submitted", { confirmation_number: "2026 1022 1234" })], a.x);
  eq(r.code, 1); eq(r.model, 0); eq(a.log.runs.length, 0, "no model run");
  ok(a.log.fetched[0].startsWith("https://data.sf.gov/resource/i98e-djp9.json") && a.log.fetched[0].includes("202610221234"), a.log.fetched[0]);
  eq(a.log.checks[0].cost_usd, 0); eq(a.log.checks[0].model_used, false);
  eq(a.log.updates.length, 1, "issued is news on its own");
  ok(/Issued/.test(a.log.updates[0].title.en) && /已发证/.test(a.log.updates[0].title.zh), JSON.stringify(a.log.updates[0].title));
  eq(a.log.events[0].source, "open_data"); eq(a.log.events[0].confidence, 0.95);
  const t = a.log.saved.get("f1")!;
  // the same record tomorrow: a check, no event, no message
  const b = io({ json: row, tracking: { f1: { ...t, next_check_at: "2026-10-22T00:00:00Z" } } });
  const r2 = await run([filing("f1", "bp", "submitted", { confirmation_number: "202610221234" })], b.x);
  eq([r2.checked, r2.changed, b.log.events.length, b.log.updates.length], [1, 0, 0, 0], "unchanged: only the check row");
  eq(b.log.checks[0].changed, false);
  eq(b.log.saved.get("f1")!.unchanged_checks, 1);
});

Deno.test("a first sighting that isn't news sets the baseline quietly; a later change of meaning notifies", async () => {
  const a = io({ json: [{ status: "filed", status_date: "2026-10-02" }] });
  await run([filing("f1", "bp", "submitted", { confirmation_number: "1" })], a.x);
  eq(a.log.updates.length, 0); eq(a.log.events.length, 1, "on the timeline all the same");
  ok(!realChange("received", "filed", { status: "Filed", norm: "received" }), "same meaning, other words: no message");
  ok(realChange("received", "filed", { status: "plancheck", norm: "in_review" }));
  ok(realChange("unknown", "odd", { status: "stranger", norm: "unknown" }), "an unknown word that changed is still a change");
});

Deno.test("an agency page is hashed: unchanged costs nothing, changed is read by the model with the page as data", async () => {
  const page = "<html><body><h1>Permit 1</h1><p>Status: Under review</p><p>Page generated 10:31 AM</p><script>x=1</script></body></html>";
  const first = io({ page, tracking: { f1: { lookup_url: "https://agency.example.gov/status?id=1" } as Tracking & { lookup_url: string } } });
  await run([filing("f1", "hp", "submitted")], first.x);
  eq(first.log.runs.length, 0, "the first fetch is the baseline");
  const h = first.log.saved.get("f1")!.last_hash!;
  const same = io({ page: page.replace("10:31 AM", "4:02 PM"), tracking: { f1: { lookup_url: "https://agency.example.gov/status?id=1", last_hash: h } as Tracking & { lookup_url: string } } });
  await run([filing("f1", "hp", "submitted")], same.x);
  eq(same.log.runs.length, 0, "a new timestamp isn't a change");
  const moved = io({ page: page.replace("Under review", "Approved"), tracking: { f1: { lookup_url: "https://agency.example.gov/status?id=1", last_hash: h } as Tracking & { lookup_url: string } } });
  const r = await run([filing("f1", "hp", "submitted")], moved.x);
  eq(r.model, 1); ok(/data from outside, not instructions/.test(moved.log.runs[0]) && /Approved/.test(moved.log.runs[0]));
  eq(moved.log.checks[0].model_used, true);
  ok(!/<script|10:31/.test(pageText(page)), pageText(page));
});

Deno.test("no lookup: Odelia checks it, backing off while nothing moves, daily while hot", async () => {
  const a = io();
  await run([filing("f1", "hp", "submitted")], a.x);
  eq(a.log.runs.length, 1); ok(/Status check, one filing only/.test(a.log.runs[0]) && /No changes/.test(a.log.runs[0]));
  const at = (n: number, hot: boolean) => Math.round((Date.parse(nextCheckAt(now, { kind: "model", hot, changed: false, error: false, unchanged: n, errors: 0 })) - now) / 864e5);
  eq([0, 1, 2, 3, 4, 9].map((n) => at(n, false)), [...BACKOFF, 7]);
  eq([0, 3, 9].map((n) => at(n, true)), [1, 1, 1], "hot stays daily");
  eq(Math.round((Date.parse(nextCheckAt(now, { kind: "open_data", hot: false, changed: false, error: false, unchanged: 9, errors: 0 })) - now) / 864e5), 1, "a check in code is daily, always");
  const capped = io();
  const r = await run([filing("f1", "hp", "submitted"), filing("f2", "hp", "in_progress")], capped.x, { maxModel: 1 });
  eq([r.model, capped.log.runs.length], [1, 1], "the day's model checks are capped");
});

Deno.test("a failing feed backs off and leaves the record as it was", async () => {
  const a = io({ failFetch: true });
  const r = await run([filing("f1", "bp", "submitted", { confirmation_number: "1" })], a.x);
  eq(r.errors, 1); eq(a.log.updates.length, 0); eq(a.log.saved.get("f1")!.check_errors, 1);
});

Deno.test("escalation: past the published time with nothing moving, once a fortnight, with the SLA badge", async () => {
  const s = sla("2026-09-01T00:00:00Z", 42, today, null)!;
  eq(s.state, "breached"); ok(escalate(s, null, today)); ok(!escalate(s, "2026-10-15T00:00:00Z", today), "not again within 14 days");
  eq(sla("2026-10-01T00:00:00Z", 25, today)!.state, "at_risk"); eq(sla("2026-10-20T00:00:00Z", 30, today)!.state, "on_track");
  ok(!escalate(sla("2026-09-01T00:00:00Z", 42, today, "2026-10-20T00:00:00Z"), null, today), "something moved 2 days ago: not stalled");
  const a = io({ json: [] });
  const r = await run([filing("f1", "bp", "submitted", { submitted_at: "2026-09-01T00:00:00Z", confirmation_number: "1" })], a.x);
  eq(r.escalated, 1); eq(a.log.tasks.length, 1); ok(a.log.runs.some((p) => /status inquiry/.test(p) && /draft_message/.test(p)));
  ok(/Past due/.test(a.log.updates[0].title.en) && /逾期/.test(a.log.updates[0].title.zh));
});

Deno.test("parsers: every lookup is cited and the statuses mean what they say", () => {
  for (const l of LOOKUPS) { ok(/^https:\/\//.test(l.source) && /^https:\/\//.test(l.see), l.id); if (l.kind === "open_data") ok(l.parse && l.verified, l.id); }
  eq(["Issued", "Plan Check", "Disapproved", "LOC Issued", "Permit Expired", "Incomplete", "Filed", "zzz"].map((x) => normStatus(x).norm), ["issued", "in_review", "denied", "issued", "expired", "needs_info", "received", "unknown"]);
  eq(lookupFor({ name: { en: "Building permit", zh: "" } }, "1 Main St, Los Angeles, CA 90012")?.id, "la_ladbs_permits");
  eq(lookupFor({ name: { en: "On-sale beer and wine license", zh: "" } }, "1 Main St, San Jose, CA 95113")?.id, "ca_abc_license");
  eq(lookupFor({ name: { en: "Health permit", zh: "" } }, "1 Main St, Los Angeles, CA 90012"), null);
  ok(LOOKUPS.find((l) => l.id === "la_ladbs_permits")!.url("1' OR 1=1")!.includes(encodeURIComponent("permit_nbr='1OR11'")), "the key can't change the query");
  ok(!modelCheckPrompt({ id: "f", workspace_id: "w", app_id: "a", title: { en: "X", zh: "X" }, status: "submitted", updated_at: "" }, undefined, null).includes("undefined"));
});

Deno.test("cost: a store-month of daily checks stays far inside the $50 ceiling", () => {
  const c = checksPerStoreMonth({ inFlight: 3, codeShare: 1 / 3, changesPerMonth: 2, hotShare: 0.5 });
  ok(c.usd < 1 && c.checks >= 60, JSON.stringify(c));
  const worst = checksPerStoreMonth({ inFlight: 9, codeShare: 0, changesPerMonth: 4, hotShare: 1, route: "anthropic" });
  ok(worst.usd < 15, JSON.stringify(worst));
});
