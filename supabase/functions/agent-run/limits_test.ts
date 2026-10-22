// Run: deno test supabase/functions/agent-run/limits_test.ts
import { deepStrictEqual as assertEquals } from "node:assert";
import { NOT_CHARGED_EN, refundable } from "./limits.ts";

Deno.test("a run that failed on our side or the vendor's isn't charged; one stopped by its own limits or the person is", () => {
  for (const code of [undefined, "upstream_error", "save_failed", "not_configured", "rate_limited", "lost"]) assertEquals(refundable(code), true, String(code));
  // giving these back would let a run past the allowance, the task cap or the daily ceiling repeat for free
  for (const code of ["cancelled", "task_limit", "over_budget", "plan_required", "entry_ended", "paused", "not_allowed", "trial_used"]) assertEquals(refundable(code), false, code);
  assertEquals(/wasn't counted against your allowance/.test(NOT_CHARGED_EN), true);
});
