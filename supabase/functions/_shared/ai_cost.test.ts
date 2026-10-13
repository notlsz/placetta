// deno test supabase/functions/_shared/ai_cost.test.ts
import { costOf, priceOf } from "./ai_cost.ts";
import { withCache } from "./llm.ts";
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";

Deno.test("prices by model, unknown priced as the most expensive", () => {
  assertEquals(priceOf("anthropic:claude-sonnet-5-5"), { in: 2, out: 10 });
  assertEquals(priceOf("anthropic:claude-opus-5-5"), { in: 4, out: 20 });
  assertEquals(priceOf("anthropic:claude-haiku-4-5-20251001"), { in: 1, out: 5 });
  assertEquals(priceOf("somewhere:mystery-model"), { in: 10, out: 50 });
});

Deno.test("a Sonnet round: 9,000 in, 500 out", () => {
  assertEquals(costOf("anthropic:claude-sonnet-5-5", { input_tokens: 9000, output_tokens: 500 }), 0.023);
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
