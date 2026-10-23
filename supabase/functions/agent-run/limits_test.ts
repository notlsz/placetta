// Run: deno test supabase/functions/agent-run/limits_test.ts
import { deepStrictEqual as assertEquals } from "node:assert";
import { CHAT_JOBS_PER_HOUR, chatRateLimited, chatToOk, NOT_CHARGED_EN, refundable, sharedThread } from "./limits.ts";

Deno.test("a chat job's answer only goes somewhere its chat can answer: Teams only to Microsoft, Telegram only to a chat and a linked user", () => {
  const good = [
    { kind: "slack", channel: "C0123ABCD", thread_ts: "1700000000.123456" }, { kind: "lark", message_id: "om_5ce6d572455d361153b7cb51da133945" },
    { kind: "wechat", openid: "o9AgO5Kd5ggOC-bXrbNODIiE3bGY" }, { kind: "telegram", chat_id: "-1001234567890", message_id: 77, thread_id: 12, user: "123456789" },
    { kind: "teams", service_url: "https://smba.trafficmanager.net/amer", conversation_id: "19:abc@thread.tacv2;messageid=1", activity_id: "1700000000001" },
  ];
  for (const t of good) assertEquals(chatToOk(t), true, t.kind);
  const bad = [
    { kind: "teams", service_url: "https://evil.example", conversation_id: "19:x", activity_id: "1" }, { kind: "teams", service_url: "http://smba.trafficmanager.net/amer", conversation_id: "19:x", activity_id: "1" },
    { kind: "telegram", chat_id: "abc", message_id: 1, user: "123456789" }, { kind: "telegram", chat_id: "1", message_id: 0, user: "123456789" }, { kind: "telegram", chat_id: "1", message_id: 1 },
    { kind: "wechat", openid: "x" }, { kind: "slack", channel: "#general", thread_ts: "1" }, { kind: "discord", channel_id: "1" }, {},
  ];
  for (const t of bad) assertEquals(chatToOk(t as never), false, JSON.stringify(t));
  assertEquals(CHAT_JOBS_PER_HOUR, 30);
  assertEquals(/Placetta app/.test(chatRateLimited("en")) && /快哉应用/.test(chatRateLimited("zh")), true, "the limit says what to do next");
});

Deno.test("a run that failed on our side or the vendor's isn't charged; one stopped by its own limits or the person is", () => {
  for (const code of [undefined, "upstream_error", "save_failed", "not_configured", "rate_limited", "lost"]) assertEquals(refundable(code), true, String(code));
  // giving these back would let a run past the allowance, the task cap or the daily ceiling repeat for free
  for (const code of ["cancelled", "task_limit", "over_budget", "plan_required", "entry_ended", "paused", "not_allowed", "trial_used"]) assertEquals(refundable(code), false, code);
  assertEquals(/wasn't counted against your allowance/.test(NOT_CHARGED_EN), true);
});

Deno.test("a shared thread: channels and groups are, DMs and WeChat aren't, and unsure counts as shared", () => {
  const shared = [
    { kind: "slack", channel: "C0123ABCD" }, { kind: "slack", channel: "G0123ABCD" },
    { kind: "teams", conversation_id: "19:abc@thread.tacv2" }, { kind: "teams", conversation_id: "19:abc@thread.v2" },
    { kind: "lark", message_id: "om_x", group: true }, { kind: "lark", message_id: "om_x" },
    { kind: "telegram", chat_id: "-1001234567890" }, { kind: "email" },
  ];
  const own = [{ kind: "slack", channel: "D0123ABCD" }, { kind: "teams", conversation_id: "a:1abc" }, { kind: "lark", message_id: "om_x", group: false }, { kind: "telegram", chat_id: "123456789" }, { kind: "wechat", openid: "o9" }];
  assertEquals(shared.map((t) => sharedThread(t)), shared.map(() => true));
  assertEquals(own.map((t) => sharedThread(t)), own.map(() => false));
  assertEquals(chatToOk({ kind: "lark", message_id: "om_5ce6d572455d361153b7cb51da133945", group: true }), true);
  assertEquals(chatToOk({ kind: "lark", message_id: "om_5ce6d572455d361153b7cb51da133945", group: "yes" }), false);
});
