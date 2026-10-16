// deno test supabase/functions/monitor/hq_test.ts
import "./test_env.ts";
import { ok } from "node:assert";
import { hqReport, type HqWeekly } from "./index.ts";

const rows: HqWeekly[] = [
  { hq_email: "hq@brand.com", workspace_id: "w1", name: "Golden Ox Group", brand: "Moonleaf", stores: [
    { id: "a", name: { en: "Flushing", zh: "法拉盛" }, stage: "open", status: "overdue", overdue: 2, due_30: 0, next: { kind: "permit", title: { en: "Sign permit", zh: "招牌许可" }, date: "2026-10-01" } },
    { id: "b", name: { en: "Irvine", zh: "尔湾" }, stage: "open", status: "current", overdue: 0, due_30: 0, next: null },
  ] },
  { hq_email: "hq@brand.com", workspace_id: "w2", name: "Jade Bun LLC", brand: "Moonleaf", stores: [
    { id: "c", name: { en: "San Jose", zh: "圣何塞" }, stage: "opening", status: "due", overdue: 0, due_30: 1, next: { kind: "due", title: { en: "Health permit", zh: "卫生许可" }, date: "2026-10-20" } },
  ] },
];

Deno.test("one page: totals, then the stores at risk, overdue first", () => {
  const m = hqReport(rows, "2026-10-12");
  ok(m.subject.startsWith("Moonleaf weekly store status: 1 overdue"), m.subject);
  ok(m.text.includes("3 stores, 1 fully current, 1 due in 30 days, 1 overdue"), m.text);
  const a = m.text.indexOf("Golden Ox Group, Flushing: Sign permit, 2026-10-01 (11 days overdue), and 1 more");
  const b = m.text.indexOf("Jade Bun LLC, San Jose: Health permit, 2026-10-20 (due in 8 days)");
  ok(a > 0 && b > a, m.text);
  ok(!m.text.includes("Irvine"));
  ok(m.html.includes("At risk") && !m.html.includes("<script"));
});

Deno.test("all clear when nothing is due", () => {
  const m = hqReport([{ ...rows[0], brand: null, stores: [rows[0].stores![1]] }], "2026-10-12");
  ok(m.subject === "weekly store status: all current", m.subject);
  ok(m.text.includes("Every store is current."));
});
