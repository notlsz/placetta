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

function io(o: { tracking?: Record<string, Tracking & { lookup_url?: string }>; json?: unknown; jsonBy?: (url: string) => unknown; page?: string; failFetch?: boolean } = {}) {
  const log = { checks: [] as Check[], events: [] as Event[], updates: [] as Update[], tasks: [] as string[], runs: [] as string[], saved: new Map<string, Tracking>(), fetched: [] as string[] };
  const x: StatusIO = {
    tracking: async () => new Map(Object.entries(o.tracking ?? {})),
    fetchJson: async (u) => { log.fetched.push(u); if (o.failFetch) throw new Error("503"); return o.jsonBy ? o.jsonBy(u) : o.json ?? []; },
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

// Rows in the shape each feed returned when it was queried live on 2026-10-22 (trimmed to the fields read).
const LIVE: Record<string, { key: string; body: unknown; status: string; norm: string; date: string | null }> = {
  chicago_building_permits: { key: "101089151", body: [{ permit_: "101089151", issue_date: "2026-10-21T00:00:00.000", application_start_date: "2026-09-30T00:00:00.000" }], status: "Issued", norm: "issued", date: "2026-10-21" },
  chicago_business_licenses: { key: "2757733", body: [{ license_number: "2757733", license_status: "AAI", application_type: "RENEW", date_issued: "2026-10-21T00:00:00.000", license_status_change_date: null }], status: "Issued (AAI)", norm: "issued", date: "2026-10-21" },
  austin_permits: { key: "2025-133771 PP", body: [{ permit_number: "2025-133771 PP", status_current: "Active", statusdate: "2026-10-22T00:00:00.000", permit_type_desc: "Plumbing Permit" }], status: "Active", norm: "issued", date: "2026-10-22" },
  seattle_permits: { key: "7163750-CN", body: [{ permitnum: "7163750-CN", statuscurrent: "Additional Info Requested", permittypedesc: "New" }], status: "Additional Info Requested", norm: "needs_info", date: null },
  boston_permits: { key: "A1000569", body: { success: true, result: { records: [{ permitnumber: "A1000569", status: "Closed", issued_date: "2021-01-28T16:29:26" }] } }, status: "Issued (Closed)", norm: "issued", date: "2021-01-28" },
  philly_permits: { key: "ZP-2023-004901", body: { rows: [{ permitnumber: "ZP-2023-004901", status: "Refused", permitissuedate: null, permitcompleteddate: "2024-07-22T16:11:03Z" }] }, status: "Refused", norm: "denied", date: "2024-07-22" },
  philly_business_licenses: { key: "246211", body: { rows: [{ licensenum: "246211", licensestatus: "Inactive", licensetype: "Rental", inactivedate: "2009-02-18T17:23:00Z" }] }, status: "Inactive", norm: "expired", date: "2009-02-18" },
  nyc_dcwp_applications: { key: "16848-2026-RTTD", body: [{ application_id: "16848-2026-RTTD", status: "Submitted", submission_date: "2026-10-16T00:00:00.000" }], status: "Submitted", norm: "received", date: "2026-10-16" },
};

Deno.test("new open-data lookups: each parses the row its feed returned live, by the record's own number", () => {
  for (const [id, x] of Object.entries(LIVE)) {
    const l = LOOKUPS.find((y) => y.id === id)!;
    ok(l && l.kind === "open_data" && l.verified?.on === "2026-10-22" && /^https:\/\//.test(l.source) && /^https:\/\//.test(l.see), id);
    const p = l.parse!(x.body)!;
    eq([p.status, p.norm, p.date], [x.status, x.norm, x.date], id);
    ok(decodeURIComponent(l.url(x.key)!).includes(x.key), `${id}: the url carries the key`);
    ok(!decodeURIComponent(l.url("1' OR '1'='1")!).includes("'1'='1"), `${id}: the key can't change the query`);
    eq(l.parse!(id.startsWith("philly") ? { rows: [] } : id === "boston_permits" ? { result: { records: [] } } : []), null, `${id}: no record yet is no status`);
  }
  eq(["Additional Info Requested", "TOL Issued", "Active", "Inactive", "Revoked (REV)", "Approved", "Denied"].map((s) => normStatus(s).norm), ["needs_info", "in_review", "issued", "expired", "denied", "approved", "denied"]);
});

Deno.test("the new cities route to their own feeds", () => {
  const b = (en: string) => ({ en, zh: en });
  eq([lookupFor({ name: b("Building permit") }, "100 N State St, Chicago, IL 60602")?.id, lookupFor({ name: b("Retail Food Establishment License"), agency: b("BACP") }, "100 N State St, Chicago, IL 60602")?.id,
    lookupFor({ name: b("Building permit") }, "500 E 7th St, Austin, TX 78701")?.id, lookupFor({ name: b("Tenant improvement permit") }, "400 Pine St, Seattle, WA 98101")?.id,
    lookupFor({ name: b("Building permit") }, "1 Court St, Boston, MA 02108")?.id, lookupFor({ name: b("Building permit") }, "1400 JFK Blvd, Philadelphia, PA 19107")?.id,
    lookupFor({ name: b("Commercial Activity License") }, "1400 JFK Blvd, Philadelphia, PA 19107")?.id, lookupFor({ name: b("Tobacco retail dealer license"), agency: b("NYC DCWP") }, "136-20 Roosevelt Ave, Flushing, NY 11354")?.id,
    lookupFor({ name: b("Building permit") }, "1500 Main St, Dallas, TX 75201")?.id],
    ["chicago_building_permits", "chicago_business_licenses", "austin_permits", "seattle_permits", "boston_permits", "philly_permits", "philly_business_licenses", "nyc_dcwp_applications", undefined]);
});

Deno.test("no model key: open data and hashed pages still run; a changed page goes to the team; nothing starts a model run", async () => {
  const chi: WsState = { apps: [{ id: "bp", name: { en: "Building permit", zh: "建筑许可" }, agency: { en: "Chicago DOB", zh: "芝加哥建筑局" }, est: { en: "30 days", zh: "30 天" } },
    { id: "hp", name: { en: "Health permit", zh: "卫生许可" }, agency: { en: "CDPH", zh: "芝加哥卫生局" } }, { id: "sp", name: { en: "Sign permit", zh: "招牌许可" }, agency: { en: "Chicago DOB", zh: "芝加哥建筑局" } }],
    stores: [{ address: "100 N State St, Chicago, IL 60602", apps: ["bp", "hp", "sp"] }] };
  const a = io({ json: LIVE.chicago_building_permits.body, page: "<p>Status: Approved</p>", tracking: { f3: { lookup_url: "https://agency.example.gov/s?id=3", last_hash: "old" } as Tracking & { lookup_url: string } } });
  const r = await runStatusChecks({ filings: [filing("f1", "bp", "submitted", { confirmation_number: "101089151" }), filing("f2", "hp", "submitted"), filing("f3", "sp", "submitted")],
    states: new Map([["w1", chi]]), today, now, io: a.x, maxModel: 0, model: false });
  eq([r.code, r.pages, r.model], [1, 1, 0], "the feed read in code, the page hashed, no model");
  eq(a.log.runs.length, 0, "no background run started");
  ok(a.log.updates.some((u) => /Issued/.test(u.title.en)), "issued reaches the owner");
  ok(a.log.tasks.some((t) => /status page changed/.test(t)) && a.log.events.some((e) => /team is reading it/.test(e.title.en) && /团队正在查看/.test(e.title.zh)), "the changed page goes to the team, said in both languages");
  ok(a.log.saved.get("f3")!.last_hash !== "old", "and isn't flagged again tomorrow");
  ok(!a.log.saved.has("f2"), "the one only a model could check waits, untouched");
});

Deno.test("good standing: an approved license read weekly from open data; news only when it leaves good standing", async () => {
  const chi: WsState = { apps: [{ id: "bl", name: { en: "Retail Food Establishment License", zh: "零售食品经营执照" }, agency: { en: "BACP", zh: "芝加哥商业事务局" } },
    { id: "hp", name: { en: "Health permit", zh: "卫生许可" }, agency: { en: "CDPH", zh: "芝加哥卫生局" } }],
    stores: [{ address: "100 N State St, Chicago, IL 60602", apps: ["bl", "hp"] }] };
  const go = (x: StatusIO, f: StatusFiling[]) => runStatusChecks({ filings: f, states: new Map([["w1", chi]]), today, now, io: x });
  const issued = [{ license_number: "2757733", license_status: "AAI", license_status_change_date: "2026-09-01T00:00:00.000", date_issued: "2026-09-01T00:00:00.000" }];
  const a = io({ json: issued });
  const r = await go(a.x, [filing("f1", "bl", "accepted", { confirmation_number: "2757733" }), filing("f2", "hp", "accepted", { confirmation_number: "77" }), filing("f3", "bl", "accepted")]);
  eq(r.checked, 1, "only the license with its number on file and its agency's record in open data");
  eq(a.log.updates.length, 0, "already approved: issued on the record is not news");
  const t = a.log.saved.get("f1")!;
  eq(Math.round((Date.parse(t.next_check_at!) - now) / 864e5), 7, "read again in a week");
  const revoked = [{ ...issued[0], license_status: "REV", license_status_change_date: "2026-10-20T00:00:00.000" }];
  const b = io({ json: revoked, tracking: { f1: { ...t, next_check_at: "2026-10-22T00:00:00Z" } } });
  await go(b.x, [filing("f1", "bl", "accepted", { confirmation_number: "2757733" })]);
  eq(b.log.updates.length, 1, "revoked on the agency's record: the owner hears");
  ok(/no longer active/.test(b.log.updates[0].title.en) && /不再有效/.test(b.log.updates[0].title.zh) && /status pages/.test(b.log.updates[0].body!.en), JSON.stringify(b.log.updates[0]));
  eq(b.log.saved.get("f1")!.agency_norm, "denied", "kept, so the status page shows it needs attention");
  const c = io({ json: issued, tracking: { f1: { ...b.log.saved.get("f1")!, next_check_at: "2026-10-22T00:00:00Z" } } });
  await go(c.x, [filing("f1", "bl", "accepted", { confirmation_number: "2757733" })]);
  ok(c.log.updates.length === 1 && /active again/.test(c.log.updates[0].title.en), "back in good standing says so once");
  const d = io({ json: issued, tracking: { f1: { ...t, next_check_at: "2026-10-30T00:00:00Z" } } });
  eq((await go(d.x, [filing("f1", "bl", "accepted", { confirmation_number: "2757733" })])).checked, 0, "not due before the week is out");
});

/* ------------------------------ state liquor licenses, read in code (2026-10-24) ------------------------------ */

// Rows in the shape data.ny.gov and data.texas.gov returned when queried live on 2026-10-24 (trimmed to the fields read).
const NY_PENDING_ROW = { application_id: "NA-0071-26-227961", description: "Grocery Store", received_date: "2026-09-18T16:10:00.000", status: "IntakeComplete" };
const NY_ACTIVE_ROW = { licensepermitid: "0032-23-139868", description: "Farm winery", lastissuedate: "2026-01-27T00:00:00.000", effectivedate: "2026-03-01T00:00:00.000", expirationdate: "2029-02-28T00:00:00.000" };
const NY_INACTIVE_ROW = { license_permit_id: "0340-19-111757", description: "Restaurant", expiration_date: "2021-04-30T00:00:00.000" };
const TX_LICENSE_ROW = { license_id: "200212337", license_type: "NT", license_status: "Active", status_change_date: "2026-10-22T00:00:00.000", current_issued_date: "2026-10-22T00:00:00.000", expiration_date: "2026-11-08T00:00:00.000", owner: "Undermain Theatre" };
const TX_PENDING_ROW = { application_id: "668589", license_type: "NT", applicationstatus: "Pending – In Review", primary_license_id: "200212372", submission_date: "2026-10-22T00:00:00.000" };

Deno.test("New York SLA: pending, active and inactive datasets, by the record's own number", () => {
  const l = LOOKUPS.find((y) => y.id === "ny_sla_license")!;
  ok(l.kind === "open_data" && l.verified?.on === "2026-10-24" && l.urls, "read in code now, not a page for the model");
  const u = l.urls!("NA-0071-26-227961").map(decodeURIComponent);
  ok(u.length === 3 && u[0].includes("f8i8-k2gm") && u[0].includes("application_id='NA-0071-26-227961'") && u[1].includes("9s3h-dpkz") && u[2].includes("6dg3-2z7i"), u.join("\n"));
  ok(!l.urls!("1' OR '1'='1").some((x) => decodeURIComponent(x).includes("'1'='1")), "the key can't change the query");
  const p1 = l.parse!([[NY_PENDING_ROW], [], []])!;
  eq([p1.status, p1.norm, p1.date], ["IntakeComplete", "received", "2026-09-18"], "intake complete is received");
  eq(l.parse!([[{ ...NY_PENDING_ROW, status: "Conditionally Approved" }], [], []])!.norm, "approved");
  eq(l.parse!([[{ ...NY_PENDING_ROW, status: "Under Review" }], [], []])!.norm, "in_review");
  const p2 = l.parse!([[], [NY_ACTIVE_ROW], []])!;
  eq([p2.status, p2.norm, p2.date, p2.expires], ["Active", "issued", "2026-01-27", "2029-02-28"], "an active license carries the SLA's own expiration date");
  eq(l.parse!([[NY_PENDING_ROW], [NY_ACTIVE_ROW], []])!.norm, "issued", "active wins over a stale pending row");
  const p3 = l.parse!([[], [], [NY_INACTIVE_ROW]])!;
  eq([p3.status, p3.norm, p3.expires], ["Inactive", "expired", "2021-04-30"]);
  eq(l.parse!([[], [], []]), null, "on none of the lists: no status");
  eq(l.parse!("garbage"), null, "a feed answering in the wrong shape is no status, never a throw");
});

Deno.test("Texas TABC: one license id finds the application while pending and the license once issued", () => {
  const l = LOOKUPS.find((y) => y.id === "tx_tabc_license")!;
  ok(l.kind === "open_data" && l.verified?.on === "2026-10-24" && l.urls);
  const u = l.urls!("200212372").map(decodeURIComponent);
  ok(u[0].includes("7hf9-qc9f") && u[0].includes("license_id='200212372'") && u[1].includes("mxm5-tdpj") && u[1].includes("primary_license_id='200212372'"), u.join("\n"));
  const p1 = l.parse!([[], [TX_PENDING_ROW]])!;
  eq([p1.norm, p1.date], ["in_review", "2026-10-22"], "pending, in review");
  eq(l.parse!([[], [{ ...TX_PENDING_ROW, applicationstatus: "Received" }]])!.norm, "received");
  const p2 = l.parse!([[TX_LICENSE_ROW], [TX_PENDING_ROW]])!;
  eq([p2.status, p2.norm, p2.date, p2.expires], ["Active", "issued", "2026-10-22", "2026-11-08"], "issued, with TABC's own expiration date");
  eq(["Active - Renewal Pending", "Suspended", "Suspended - Renewal Pending", "Expired - Original Required", "Surrendered", "Temporarily Surrendered", "Cancelled"]
    .map((s) => l.parse!([[{ ...TX_LICENSE_ROW, license_status: s }], []])!.norm),
    ["issued", "suspended", "suspended", "expired", "withdrawn", "withdrawn", "withdrawn"], "every status the feed uses means what it says");
  eq(l.parse!([[], []]), null);
});

Deno.test("liquor licenses route to the state's feed; California's stays Odelia's page", () => {
  const b = (en: string) => ({ en, zh: en });
  eq([lookupFor({ name: b("On-premises liquor license"), agency: b("NYS SLA") }, "136-20 Roosevelt Ave, Flushing, NY 11354")?.id,
    lookupFor({ name: b("Mixed beverage permit"), agency: b("TABC") }, "9889 Bellaire Blvd, Houston, TX 77036")?.id,
    lookupFor({ name: b("On-sale beer and wine license") }, "1 Main St, San Jose, CA 95113")?.kind],
    ["ny_sla_license", "tx_tabc_license", "page"]);
});

const hou: WsState = { apps: [{ id: "mb", name: { en: "Mixed beverage permit", zh: "混合饮料许可" }, agency: { en: "TABC", zh: "德州酒类委员会" }, est: { en: "45 to 60 days", zh: "45 至 60 天" } }],
  stores: [{ address: "9889 Bellaire Blvd, Houston, TX 77036", apps: ["mb"] }] };
const tx = (x: StatusIO, f: StatusFiling[], st: WsState = hou) => runStatusChecks({ filings: f, states: new Map([["w1", st]]), today, now, io: x });
const byUrl = (license: unknown[], pending: unknown[]) => (u: string) => u.includes("7hf9-qc9f") ? license : u.includes("mxm5-tdpj") ? pending : [];

Deno.test("several datasets: every one is asked, in code, and the license's issue reaches the owner", async () => {
  const a = io({ jsonBy: byUrl([], [TX_PENDING_ROW]) });
  const r = await tx(a.x, [filing("f1", "mb", "submitted", { confirmation_number: "200212372" })]);
  eq([r.code, r.model, a.log.fetched.length], [1, 0, 2], "both TABC datasets, no model");
  eq(a.log.updates.length, 0, "in review on first sight is the baseline, not news");
  const t = a.log.saved.get("f1")!;
  eq(t.agency_norm, "in_review");
  const b = io({ jsonBy: byUrl([{ ...TX_LICENSE_ROW, license_id: "200212372" }], []), tracking: { f1: { ...t, next_check_at: "2026-10-22T00:00:00Z" } } });
  await tx(b.x, [filing("f1", "mb", "submitted", { confirmation_number: "200212372" })]);
  ok(b.log.updates.some((u) => /Issued on the agency's record/.test(u.title.en)), "issued is news");
  ok(b.log.updates.some((u) => /expires 2026-11-08 on the agency's record/.test(u.title.en) && /no renewal on your Deadlines/.test(u.body!.en) && /2026-11-08/.test(u.body!.zh)),
    "and TABC's expiration date is offered for the calendar, in both languages");
  const c = io({ failFetch: true });
  const rc = await tx(c.x, [filing("f1", "mb", "submitted", { confirmation_number: "200212372" })]);
  eq(rc.errors, 1, "one dataset failing is an error for the check, retried with back-off");
});

Deno.test("expiration: the agency's date governs the calendar's; said once per date, quiet when they agree", async () => {
  const withRenewal = (date: string): WsState => ({ ...hou, deadlines: [{ id: "rn", app: "mb", kind: "renewal", date, title: { en: "Renew", zh: "续办" } }] });
  const lic = [{ ...TX_LICENSE_ROW, license_id: "200212372", expiration_date: "2027-10-22T00:00:00.000" }];
  const a = io({ jsonBy: byUrl(lic, []) });
  await tx(a.x, [filing("f1", "mb", "accepted", { confirmation_number: "200212372" })], withRenewal("2027-11-30"));
  const u = a.log.updates.find((x) => x.dedupe.startsWith("agency-expires:"));
  ok(u && /2027-10-22/.test(u.title.en) && /Deadlines have the renewal on 2027-11-30/.test(u.body!.en) && /governs/.test(u.body!.en), JSON.stringify(u));
  ok(a.log.events.some((e) => /expires 2027-10-22/.test(e.title.en)), "on the filing's timeline too");
  const b = io({ jsonBy: byUrl(lic, []) });
  await tx(b.x, [filing("f1", "mb", "accepted", { confirmation_number: "200212372" })], withRenewal("2027-10-22"));
  ok(!b.log.updates.some((x) => x.dedupe.startsWith("agency-expires:")), "the calendar already has the agency's date: nothing to say");
  const old = [{ ...lic[0], license_status: "Expired", expiration_date: "2025-01-01T00:00:00.000" }];
  const c = io({ jsonBy: byUrl(old, []) });
  await tx(c.x, [filing("f1", "mb", "accepted", { confirmation_number: "200212372" })], withRenewal("2027-10-22"));
  ok(!c.log.updates.some((x) => x.dedupe.startsWith("agency-expires:")), "an expired license isn't offered as a renewal date");
  ok(c.log.updates.some((x) => /no longer active/.test(x.title.en)), "it's out of good standing instead");
});

Deno.test("suspension: out of good standing, said in both languages", async () => {
  const t0 = { agency_status: "Active", agency_norm: "issued", last_hash: "x", next_check_at: "2026-10-22T00:00:00Z" };
  const a = io({ jsonBy: byUrl([{ ...TX_LICENSE_ROW, license_id: "200212372", license_status: "Suspended" }], []), tracking: { f1: t0 } });
  await tx(a.x, [filing("f1", "mb", "accepted", { confirmation_number: "200212372" })]);
  const u = a.log.updates.find((x) => /no longer active/.test(x.title.en));
  ok(u && /Suspended/.test(u.body!.en) && /不再有效/.test(u.title.zh), JSON.stringify(a.log.updates));
  eq(a.log.saved.get("f1")!.agency_norm, "suspended");
});

Deno.test("a record that leaves the feed is said once, with what to do next", async () => {
  const nyc: WsState = { apps: [{ id: "ol", name: { en: "On-premises liquor license", zh: "店内酒牌" }, agency: { en: "NYS SLA", zh: "纽约州酒类管理局" } }],
    stores: [{ address: "136-20 Roosevelt Ave, Flushing, NY 11354", apps: ["ol"] }] };
  const go = (x: StatusIO) => runStatusChecks({ filings: [filing("f1", "ol", "submitted", { confirmation_number: "NA-0071-26-227961" })], states: new Map([["w1", nyc]]), today, now, io: x });
  const a = io({ jsonBy: (u) => u.includes("f8i8-k2gm") ? [{ ...NY_PENDING_ROW, status: "Under Review" }] : [] });
  await go(a.x);
  eq(a.log.fetched.length, 3, "the three SLA datasets");
  const t = a.log.saved.get("f1")!;
  const b = io({ jsonBy: () => [], tracking: { f1: { ...t, next_check_at: "2026-10-22T00:00:00Z" } } });
  const r = await go(b.x);
  eq(r.changed, 1);
  const u = b.log.updates[0];
  ok(u && /no longer on New York State Liquor Authority's list/.test(u.title.en) && /Under Review/.test(u.body!.en) && /license number/.test(u.body!.en) && /执照编号/.test(u.body!.zh), JSON.stringify(u));
  const c = io({ jsonBy: () => [], tracking: { f1: { ...b.log.saved.get("f1")!, next_check_at: "2026-10-22T00:00:00Z" } } });
  await go(c.x);
  eq(c.log.updates.length, 0, "said once: still gone is no news");
});
