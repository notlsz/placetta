// deno test -A supabase/functions/monitor/governance_test.ts
import { deepStrictEqual as assertEquals, ok } from "node:assert";
import { dur, governanceText, type Health, weeklyGovernance } from "./governance.ts";

const H: Health = {
  days: 7,
  totals: { runs: 412, done: 400, failed: 6, tool_calls: 3010, tool_error_pct: 2.1, first_try_pct: 81.4, checked: 120, reply_p50_s: 3.2, reply_p95_s: 9.8,
    done_p50_s: 41, done_p95_s: 190, ai_cost_usd: 38.2, cost_per_run_usd: 0.0927, saver_pct: 12, throttles: 2 },
  by_vendor: [{ provider: "anthropic", model: "claude-sonnet", calls: 2800, cost_usd: 35.1 }, { provider: "gemini", model: "gemini-flash", calls: 900, cost_usd: 3.1 }],
  slowest: [{ id: "r1", business: "Lucky Leaf Tea", title: "Map every permit for Irvine", done_s: 512, cost_usd: 0.8 }],
  costliest: [{ id: "r2", business: "Quiet Noodle", title: "Fill the health permit", done_s: 200, cost_usd: 1.37 }],
};

Deno.test("the summary says the week's numbers in plain words, in both languages", () => {
  const m = governanceText(H, "2026-10-12", "https://placetta.com");
  ok(m.subject === "Agent health, week of 2026-10-12: 412 runs, first try 81.4%, $38.20 AI", m.subject);
  for (const s of ["Runs: 412 (97% done, 6 failed)", "First-try pass rate: 81.4% of 120 jobs checked", "Tool errors: 2.1% of 3010 tool calls",
    "median 3.2s, 95th percentile 9.8s", "median 41s, 95th percentile 3m 10s", "AI cost: $38.20 ($0.09 a run)", "Saver mode: 12% of calls. Throttles: 2",
    "Slowest run: Lucky Leaf Tea, Map every permit for Irvine (8m 32s)", "Most expensive run: Quiet Noodle, Fill the health permit ($1.37)", "首次通过率：81.4%"]) ok(m.text.includes(s), s);
  ok(m.text.includes("https://placetta.com/app/queue"));
  ok(m.title.zh.includes("2026-10-12") && m.body.en.startsWith("Runs: 412"));
});

Deno.test("numbers not measured yet say so instead of showing zero", () => {
  const m = governanceText({ totals: { runs: 0, first_try_pct: null, tool_error_pct: null, saver_pct: null } }, "2026-10-19");
  ok(m.text.includes("First-try pass rate: not measured yet"));
  ok(m.text.includes("首次通过率：尚未统计"));
  ok(!m.html.includes("<script"));
});

Deno.test("durations", () => {
  assertEquals([dur(null), dur(3.24), dur(41), dur(90), dur(190), dur(600), dur(75), dur(359.6)], ["-", "3.2s", "41s", "1m 30s", "3m 10s", "10m", "1m 15s", "6m"]);
});

Deno.test("Monday's run: claimed once, emailed to staff, posted as an Update", async () => {
  const claimed = new Set<string>();
  const calls: string[] = [];
  const mails: string[][] = [];
  const admin = {
    rpc(fn: string, a: Record<string, unknown> = {}) {
      calls.push(fn);
      if (fn === "agent_health_data") return Promise.resolve({ data: H, error: null });
      if (fn === "governance_claim") { const fresh = !claimed.has(String(a.p_week)); claimed.add(String(a.p_week)); return Promise.resolve({ data: fresh, error: null }); }
      if (fn === "governance_post") return Promise.resolve({ data: 1, error: null });
      return Promise.resolve({ data: null, error: { code: "x" } });
    },
    from: (_t: string) => ({ select: (_c: string) => Promise.resolve({ data: [{ email: "mei@placetta.com" }, { email: "ops@placetta.com" }], error: null }) }),
  };
  const send = (to: string[]) => { mails.push(to); return Promise.resolve(true); };
  assertEquals(await weeklyGovernance(admin, "2026-10-12", send), { sent: true, emailed: 2, updates: 1 });
  assertEquals(await weeklyGovernance(admin, "2026-10-12", send), { sent: false, emailed: 0, updates: 0 });
  assertEquals(mails, [["mei@placetta.com", "ops@placetta.com"]]);
  // without email set up, the Update still goes out
  assertEquals(await weeklyGovernance(admin, "2026-10-19", null), { sent: true, emailed: 0, updates: 1 });
  ok(calls.filter((c) => c === "governance_post").length === 2);
});
