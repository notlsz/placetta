/* The margin guardrails agree between the app and the database (src/economics.ts and migration
   20261025090000_margin_guard.sql), and the $50 store ceiling holds. Run from scripts/agent-test.ts. */
import { readFileSync } from "node:fs";
import { aiCostAlert, ASSUME, GUARDRAIL, MAX_COST_PER_STORE_MONTH_USD, runningCostPerStoreMonth, SOFT_COST_PER_STORE_MONTH_USD, storeAiBudget, stripeFee, teamOverBudget } from "../src/economics";

type Ok = (cond: unknown, m: string, detail?: unknown) => void;
type Eq = (a: unknown, b: unknown, m: string) => void;

export function econTests(ok: Ok, eq: Eq) {
  console.log("\n# Unit economics: the $50 store ceiling and the margin guardrails");
  const sql = readFileSync("supabase/migrations/20261025090000_margin_guard.sql", "utf8");
  const num = (key: string) => Number(new RegExp(`'${key}',\\s*([0-9.]+)`).exec(sql)?.[1]);
  eq([MAX_COST_PER_STORE_MONTH_USD, SOFT_COST_PER_STORE_MONTH_USD], [50, 35], "the founder's ceiling: $50 a store a month, saver from about $35");
  const run = runningCostPerStoreMonth();
  ok(run > 5 && run < 7, "a store's running cost that isn't AI is about $5.50 a month (Stripe, texts, its own renewals)", run);
  eq(storeAiBudget(), { hard: num("store_plan_month"), soft: num("store_plan_soft") }, "the database's store plan allowance is the ceiling less running cost: $44 hard, $29 soft");
  ok(storeAiBudget().hard + run <= MAX_COST_PER_STORE_MONTH_USD && storeAiBudget().soft + run <= SOFT_COST_PER_STORE_MONTH_USD, "AI at the hard line plus running cost stays at or under $50; the soft line under $35");
  eq([num("ai_share_alert"), num("ai_no_revenue_alert_usd"), num("team_over_budget_factor")], [GUARDRAIL.aiShareOfRevenueAlert, GUARDRAIL.aiNoRevenueAlertUsd, GUARDRAIL.teamOverBudgetFactor], "the margin watch's lines are the same in the app and the database");
  ok(new RegExp(`'complex', ${ASSUME.teamMinutes.complex}`).test(sql) && new RegExp(`'renewal', ${ASSUME.teamMinutes.renewalTeam}`).test(sql), "team-minute budgets agree: complex 300, renewal 30");
  ok(aiCostAlert(15.5, 149) && !aiCostAlert(14, 149) && aiCostAlert(5.01, 0) && !aiCostAlert(4.99, 0), "alert past 10% of revenue, or past $5 with none");
  ok(teamOverBudget(68, "team") && !teamOverBudget(67, "team") && !teamOverBudget(449, "complex") && teamOverBudget(451, "complex"), "team time alerts past 1.5x the budget");
  eq([stripeFee(299), stripeFee(1788, "subscription_card"), stripeFee(1788, "subscription_ach")], [8.97, 64.67, 17.52], "Stripe: a $299 card charge, a yearly plan by card and by ACH");
  ok((sql.match(/FOUNDER TO CONFIRM/g) ?? []).length >= 5, "every guardrail number in the database is marked for the founder");
}
