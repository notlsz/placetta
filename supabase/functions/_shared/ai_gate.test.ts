// deno test supabase/functions/_shared/ai_gate.test.ts
import { dailyLimit, refusal, saverLine, wsDailyLimit } from "./ai_gate.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

Deno.test("the saver-mode line names the renewal date, in both languages", () => {
  assertEquals(saverLine("en", "2026-11-01T00:00:00+00:00"), "Running in saver mode until your allowance renews on November 1.");
  assertEquals(saverLine("zh", "2026-11-01T00:00:00+00:00"), "目前为节省模式，额度将于 2026 年 11 月 1 日重置。");
  assert(/renews\.$/.test(saverLine("en", null)) && /直到额度重置/.test(saverLine("zh", "not a date")));
});

Deno.test("a throttle says the rest of today, not the renewal", () => {
  assert(/rest of today/.test(saverLine("en", "2026-11-01T00:00:00Z", "throttle")) && /今日剩余时间/.test(saverLine("zh", null, "throttle")));
});

Deno.test("the limits come from the secrets, with sane defaults", () => {
  assertEquals([dailyLimit(() => undefined), wsDailyLimit(() => undefined)], [100, 10]);
  assertEquals([dailyLimit(() => "250"), wsDailyLimit(() => "4.5")], [250, 4.5]);
  assertEquals([dailyLimit(() => "nope"), wsDailyLimit(() => "-3")], [100, 10]);
});

Deno.test("refusals carry the right status", () => {
  assertEquals(refusal("over_budget").status, 402);
  assertEquals(refusal("rate_limited", 120).status, 429);
  assert(/2 minutes/.test(refusal("rate_limited", 120).message));
  assertEquals(refusal("paused").status, 503);
});
