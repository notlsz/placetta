// deno test supabase/functions/_shared/ai_cost.test.ts
import { costOf, priced, priceOf } from "./ai_cost.ts";
import { DEFAULT_ROUTES, ROLES, withCache } from "./llm.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

Deno.test("prices by model, unknown priced as the most expensive", () => {
  assertEquals(priceOf("anthropic:claude-sonnet-5-5"), { in: 2, out: 10 });
  assertEquals(priceOf("anthropic:claude-sonnet-4-5"), { in: 3, out: 15 });
  assertEquals(priceOf("anthropic:claude-opus-5-5"), { in: 4, out: 20 });
  assertEquals(priceOf("anthropic:claude-opus-4-1"), { in: 15, out: 75 });
  assertEquals(priceOf("anthropic:claude-haiku-4-5-20251001"), { in: 1, out: 5 });
  assertEquals(priceOf("gemini:gemini-2.5-flash-lite"), { in: 0.1, out: 0.4 });
  assertEquals(priceOf("gemini:gemini-2.5-flash"), { in: 0.3, out: 2.5 });
  assertEquals(priceOf("gemini:gemini-2.5-pro").in, 1.25);
  assertEquals(priceOf("openai:gpt-5-mini"), { in: 0.25, out: 2 });
  assertEquals(priceOf("openai:gpt-5"), { in: 1.25, out: 10 });
  assertEquals(priceOf("deepseek:deepseek-chat"), { in: 0.3, out: 1.2 });
  assertEquals(priceOf("somewhere:mystery-model"), { in: 10, out: 50 });
  assert(!priced("somewhere:mystery-model") && priced("gemini:gemini-2.5-flash"));
  // "gemini" contains "mini": it must never be priced as GPT-5 mini
  assert(priceOf("gemini:gemini-9-ultra").in === 2.5);
});

Deno.test("every model on a default route has a price of its own", () => {
  for (const role of ROLES) {
    for (const [p, m] of DEFAULT_ROUTES[role]) {
      const model = m === "*" ? (role === "deep" ? "claude-opus-5-5" : role === "plan" || role === "review" ? "claude-sonnet-5-5" : "claude-haiku-4-5-20251001") : m;
      assert(priced(`${p}:${model}`), `${role}: ${p}:${model} has no price`);
    }
  }
});

Deno.test("a Sonnet round: 9,000 in, 500 out", () => {
  assertEquals(costOf("anthropic:claude-sonnet-5-5", { input_tokens: 9000, output_tokens: 500 }), 0.023);
});

Deno.test("the same round on Flash-Lite costs about a thirtieth", () => {
  assertEquals(costOf("gemini:gemini-2.5-flash-lite", { input_tokens: 9000, output_tokens: 500 }), 0.0011);
});

Deno.test("long prompts on Gemini Pro are billed at the long rate", () => {
  assertEquals(costOf("gemini:gemini-2.5-pro", { input_tokens: 100_000, output_tokens: 1000 }), 0.135);
  assertEquals(costOf("gemini:gemini-2.5-pro", { input_tokens: 300_000, output_tokens: 1000 }), 0.765);
});

Deno.test("cache reads cost a tenth, writes 1.25x, searches a cent", () => {
  const c = costOf("anthropic:claude-sonnet-5-5", { input_tokens: 1000, cache_read_input_tokens: 6500, cache_creation_input_tokens: 1000, output_tokens: 500, server_tool_use: { web_search_requests: 2 } });
  assertEquals(c, Math.round((1000 * 2 + 6500 * 0.2 + 1000 * 2.5 + 500 * 10) / 1e6 * 1e6 + 0.02 * 1e6) / 1e6);
  assertEquals(costOf("x", undefined), 0);
});

Deno.test("withCache marks system, last tool and the newest user turn", () => {
  const p = withCache({ system: "rules", tools: [{ name: "a" }, { name: "b" }], messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "ok" }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x" }] }] });
  assertEquals((p.system as { cache_control?: unknown }[])[0].cache_control, { type: "ephemeral" });
  const tools = p.tools as Record<string, unknown>[];
  assert(!tools[0].cache_control && tools[1].cache_control);
  const last = (p.messages as { content: Record<string, unknown>[] }[])[2].content;
  assertEquals(last[0].cache_control, { type: "ephemeral" });
  // the earlier turns are untouched
  assertEquals((p.messages as { content: unknown }[])[0].content, "hi");
});
