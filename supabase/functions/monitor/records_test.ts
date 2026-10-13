// deno test supabase/functions/monitor/records_test.ts: what the cities post for a store's address, read and turned
// into updates (no network: a stand-in for the open-data portals answers).
import { deepStrictEqual as eq, ok } from "node:assert";
import { cityOf, cityRecords, parseAddress } from "../../../src/opendata.ts";

const rows: Record<string, unknown[]> = {
  "43nn-pn8j": [
    { camis: "1", dba: "GOLDEN OX", building: "13620", street: "ROOSEVELT AVENUE", zipcode: "11354", inspection_date: "2026-10-08T00:00:00.000", action: "Violations were cited in the following area(s).", critical_flag: "Critical", violation_description: "Cold food held above 41F.", score: "31" },
    { camis: "1", dba: "GOLDEN OX", building: "13620", street: "ROOSEVELT AVENUE", zipcode: "11354", inspection_date: "2026-10-08T00:00:00.000", action: "Violations were cited in the following area(s).", critical_flag: "Critical", violation_description: "Evidence of mice.", score: "31" },
    { camis: "1", dba: "GOLDEN OX", building: "13620", street: "ROOSEVELT AVENUE", zipcode: "11354", inspection_date: "2026-09-01T00:00:00.000", grade: "A", grade_date: "2026-09-01T00:00:00.000", critical_flag: "Not Critical", score: "9" },
  ],
  "rbx6-tga4": [{ job_filing_number: "Q00123-I1", work_type: "Sign", permit_status: "Issued", approved_date: "2026-10-05T00:00:00.000", job_description: "Illuminated wall sign" }],
  "i98e-djp9": [{ permit_number: "202610011234", permit_type_definition: "additions alterations or repairs", status: "issued", status_date: "2026-10-02T00:00:00.000", description: "Tenant improvement for restaurant" }],
};
const asked: string[] = [];
const f = (async (u: string) => { asked.push(decodeURIComponent(u)); const id = /resource\/([^.]+)\.json/.exec(u)![1]; return new Response(JSON.stringify(rows[id] ?? [])); }) as typeof fetch;

Deno.test("addresses and cities", () => {
  eq(parseAddress("136-20 Roosevelt Ave, Flushing, NY 11354"), { number: "136-20", street: "ROOSEVELT AVE", core: "ROOSEVELT", zip: "11354", city: "Flushing" });
  eq(parseAddress("200 W 41st St, New York, NY 10036")?.core, "41");
  eq(parseAddress("Roosevelt Ave, Flushing"), null);
  eq([cityOf("136-20 Roosevelt Ave, Flushing, NY 11354"), cityOf("760 14th St, San Francisco, CA 94114"), cityOf("500 Congress Ave, Austin, TX 78701"), cityOf("1 Main St, Dallas, TX")], ["nyc", "sf", "austin", null]);
});

Deno.test("NYC: one record per inspection, the bad one flagged; the sign permit issued", async () => {
  asked.length = 0;
  const recs = await cityRecords("136-20 Roosevelt Ave, Flushing, NY 11354", { f, today: "2026-10-13", days: 60 });
  ok(asked.some((u) => /building in \('136-20','13620'\)/.test(u) && /like '%ROOSEVELT%'/.test(u) && /zipcode='11354'/.test(u)), asked.join("\n"));
  const insp = recs.filter((r) => r.kind === "inspection");
  eq(insp.length, 2);
  const bad = insp.find((r) => r.date === "2026-10-08")!;
  ok(bad.urgent && /2 critical violations/.test(bad.detail ?? "") && bad.status === "Score 31", JSON.stringify(bad));
  ok(insp.some((r) => r.status === "Grade A" && !r.urgent));
  const sign = recs.find((r) => r.source === "nyc_dob")!;
  ok(sign.title === "Sign permit" && sign.status === "Issued" && sign.date === "2026-10-05");
  eq(recs[0].date, "2026-10-08", "newest first");
});

Deno.test("the monitor turns records into updates: urgent, good news, and once each", async () => {
  Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://localhost");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "x");
  const { recordUpdates } = await import("./index.ts");
  const { urgency } = await import("../_shared/odelia.ts");
  const state = { stores: [
    { id: "s1", name: { en: "Main St", zh: "主街店" }, address: "136-20 Roosevelt Ave, Flushing, NY 11354" },
    { id: "s2", name: { en: "Castro", zh: "卡斯特罗店" }, address: "760 14th St, San Francisco, CA 94114" },
    { id: "s3", name: { en: "Dallas", zh: "达拉斯店" }, address: "1 Main St, Dallas, TX 75201" },
  ] };
  const ups = await recordUpdates("w", state, "2026-10-13", { f, days: 60 });
  const bad = ups.find((u) => /Score 31/.test(u.title.en))!, sign = ups.find((u) => /Sign permit, Issued/.test(u.title.en))!, sf = ups.find((u) => u.title.en.startsWith("Castro"))!;
  ok(bad && urgency(bad, new Set()) === "urgent" && /2 critical violations/.test(bad.body!.en), JSON.stringify(bad));
  ok(sign && urgency(sign, new Set()) === "important" && sign.kind === "filing");
  ok(sf && /issued/.test(sf.title.en));
  ok(!ups.some((u) => u.title.en.startsWith("Dallas")), "no records for a city without open data");
  eq(new Set(ups.map((u) => u.dedupe)).size, ups.length, "one update per record");
  const capped = await recordUpdates("w", state, "2026-10-13", { f, days: 60, max: 1 });
  ok(capped.every((u) => u.title.en.startsWith("Main St")), "the cap stops after one store");
});
