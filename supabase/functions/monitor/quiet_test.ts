// deno test supabase/functions/monitor/quiet_test.ts
// What reaches the owner (quiet.ts): only what needs them, a clock running on them, or the result they're paying for.
import "./test_env.ts";
import { ok as assert } from "node:assert";
import { goodNews, ownerWorthy } from "./quiet.ts";
import { digest } from "./index.ts";

const u = (dedupe: string, kind = "filing", app_id: string | null = null) => ({ kind, dedupe, app_id, title: { en: dedupe, zh: dedupe } });

Deno.test("Odelia's own progress stays in the timeline", () => {
  for (const d of ["filing:f1:in_progress:2026-10-22", "filing:f1:submitted:2026-10-22", "mailed:f1", "run:r1", "done:r1", "weekdone:2026-10-26", "week:2026-10-26",
    "payment_ok:p1", "refund:p1", "agency-status:f1:abc", "page:abc", "call:c1", "purchase:p1:paid", "record:info:r1", "deadline:a1:14", "renewal:a1:45"]) {
    assert(!ownerWorthy(u(d)), `${d} is quiet`);
  }
});

Deno.test("what needs the owner, a clock on them, and the result reach them", () => {
  for (const d of ["needs_you:f1:2026-10-22", "filing:f1:needs_info:2026-10-22", "filing:f1:rejected:2026-10-22", "pay:f1", "approval:a1", "lapsed:a1",
    "overdue:a1", "deadline:a1:3", "renewal:a1:7", "rfi:f1", "agency-asks:f1", "insp-result:b1:2026-10-22", "filing:f1:accepted:2026-11-03", "license:f1",
    "record:urgent:r1", "record:news:r1", "morning:2026-10-28", "something-new:x"]) {
    assert(ownerWorthy(u(d)), `${d} reaches the owner`);
  }
});

Deno.test("the morning email: what needs them first, then good news, no list markers", () => {
  const m = digest("Lucky Leaf Tea", [u("filing:f1:accepted:2026-11-03"), u("pay:f2")] as never);
  assert(m.subject === "Lucky Leaf Tea: 1 thing for you");
  assert(m.text.indexOf("pay:f2") < m.text.indexOf("filing:f1:accepted"), "the ask comes before the good news");
  assert(!/<li|<ul|^- /m.test(m.html + "\n" + m.text), "no bullets");
  assert(goodNews(u("filing:f1:accepted:2026-11-03")) && !goodNews(u("pay:f2")));
  assert(digest("Lucky Leaf Tea", [u("license:f1")] as never).subject === "Lucky Leaf Tea: Good news");
});
