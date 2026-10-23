// deno test supabase/functions/monitor/inspections_test.ts
import "./test_env.ts";
import { deepStrictEqual as eq, ok } from "node:assert";
import { inspectionWork, PREP } from "./inspections.ts";
import { deadlineUpdates } from "./index.ts";

const b = (s: string) => ({ en: s, zh: s + "（中）" });
const state = { bookings: [
  { id: "bk-1", store: "s1", inspection: "health-preopening", name: b("Pre-operating inspection"), agency: b("NYC Health"), method: "phone", status: "with_team", slot: "2026-11-03, morning", script: "Calling..." },
  { id: "bk-2", store: "s1", inspection: "building-final", name: b("Building final"), agency: b("LADBS"), method: "portal", status: "booked", slot: "2026-10-20, morning" },
  { id: "bk-3", store: "s1", inspection: "fire-final", name: b("Fire final"), agency: b("LAFD"), method: "portal", status: "booked", slot: "2026-10-20, morning", result: { outcome: "passed" } },
  { id: "bk-4", store: "s1", inspection: "fire-final", name: b("Fire final"), agency: b("LAFD"), method: "portal", status: "awaiting_approval", slot: "2026-11-01, morning" },
] };

Deno.test("a phone or email booking is a team task with the call script; a past inspection with no result asks how it went", () => {
  const w = inspectionWork("w", state, "2026-10-22");
  eq(w.tasks.length, 1); ok(/Book the Pre-operating inspection with NYC Health \(phone\), preferred 2026-11-03, morning/.test(w.tasks[0].title));
  eq(w.tasks[0].detail.script, "Calling...");
  eq(w.updates.map((u) => u.dedupe), ["insp-result:bk-2:2026-10-20"], "only the booked one without a result, not the passed one or the one awaiting approval");
  ok(/How did the Building final go/.test(w.updates[0].title.en) && /结果如何/.test(w.updates[0].title.zh));
  eq(inspectionWork("w", null, "2026-10-22"), { tasks: [], updates: [] });
});

Deno.test("an inspection's reminder carries the prep; other deadlines don't", () => {
  const u = deadlineUpdates("w", [{ id: "insp-bk-2-2026-10-25", date: "2026-10-25", kind: "milestone", title: b("Building final, morning") }, { id: "d1", date: "2026-10-25", kind: "due", title: b("Sales tax") }], "2026-10-22");
  ok(u[0].body!.en.includes(PREP.en) && u[0].body!.zh.includes(PREP.zh));
  ok(!u[1].body!.en.includes("mock inspection"));
});
