import { deepStrictEqual as assertEquals } from "node:assert";
import { decide, DEFAULT_POLICY, isGovernment, policyProblems, suggestBudgets, type Purchase, type SpendPolicy } from "../../../src/spend.ts";

const on: SpendPolicy = { ...DEFAULT_POLICY, on: true, perPurchase: 1000, secondOver: 800, budgets: [{ id: "b1", period: "month", amount: 1200, label: { en: "Monthly", zh: "每月" } }] };
const fee = { category: "gov_fees" as const, payee: "City of San José", payeeUrl: "https://www.sanjoseca.gov/pay", amount: 445 };
const paid = (amount: number, at = new Date().toISOString()): Purchase => ({ id: crypto.randomUUID(), at, category: "gov_fees", payee: "x", amount, why: { en: "", zh: "" }, status: "paid", by: "agent" });

Deno.test("off: nothing is bought", () => assertEquals(decide(fee, DEFAULT_POLICY, []).verdict, "blocked"));
Deno.test("inside every rule: still waits for one owner", () => { const d = decide(fee, on, []); assertEquals([d.verdict, d.approvers], ["ask", 1]); });
Deno.test("over the two-person amount: asks two", () => { const d = decide({ ...fee, amount: 900 }, on, []); assertEquals([d.verdict, d.approvers], ["ask", 2]); });
Deno.test("over one-purchase cap: blocked", () => assertEquals(decide({ ...fee, amount: 1500 }, on, []).verdict, "blocked"));
Deno.test("budget spent this month: blocked", () => assertEquals(decide(fee, on, [paid(900)]).verdict, "blocked"));
Deno.test("last month's spending doesn't count", () => assertEquals(decide(fee, on, [paid(900, "2020-01-05T00:00:00Z")]).verdict, "ask"));
Deno.test("not a government payee under government-only: blocked", () => assertEquals(decide({ ...fee, payee: "Acme Signs LLC", payeeUrl: "https://acmesigns.com" }, on, []).verdict, "blocked"));
Deno.test("kind not allowed: blocked", () => assertEquals(decide({ ...fee, category: "supplies" }, on, []).verdict, "blocked"));
Deno.test("listed payee allowed under listed", () => assertEquals(decide({ ...fee, category: "mail", payee: "USPS", payeeUrl: "https://usps.com" }, { ...on, allowed: ["mail"], payees: "listed", listed: ["usps.com"] }, []).verdict, "ask"));
Deno.test("blocked payee wins", () => assertEquals(decide(fee, { ...on, blocked: ["sanjoseca.gov"] }, []).verdict, "blocked"));
Deno.test("government detection", () => { assertEquals(isGovernment("x", "https://cdtfa.ca.gov/pay"), true); assertEquals(isGovernment("Shop", "https://example.com"), false); assertEquals(isGovernment("Santa Clara County Department of Environmental Health"), true); });
Deno.test("policy checks", () => { assertEquals(policyProblems(on).length, 0); assertEquals(policyProblems({ ...on, perPurchase: 0 }).length, 1); });
Deno.test("suggested budgets: listed fees plus 15%, to $50", () => assertEquals(suggestBudgets([{ id: "s1", name: { en: "A", zh: "A" }, apps: [{ fees: [{ amount: 445 }, { amount: 919 }] }] }])[0].amount, 1600));
