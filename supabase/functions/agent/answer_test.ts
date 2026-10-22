// deno test -A supabase/functions/agent/answer_test.ts
import { deepStrictEqual as assertEquals } from "node:assert";
import { clientAnswer } from "./answer.ts";

Deno.test("the app gets the answer, never the model, the vendor's id or the token counts", () => {
  const vendor = { id: "msg_01", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "text", text: "Hi" }], stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 2 }, provider: "anthropic" };
  const out = clientAnswer(vendor);
  assertEquals(out, { content: [{ type: "text", text: "Hi" }], stop_reason: "tool_use" });
  assertEquals(JSON.stringify(out).includes("claude"), false);
});

Deno.test("an odd answer still has the shape the app reads", () => {
  assertEquals(clientAnswer(null), { content: [], stop_reason: "end_turn" });
  assertEquals(clientAnswer({ content: "x", stop_reason: 3 }), { content: [], stop_reason: "end_turn" });
});
