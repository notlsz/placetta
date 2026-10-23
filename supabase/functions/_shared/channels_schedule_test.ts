// Run: deno test supabase/functions/_shared/channels_schedule_test.ts
// When a linked team chat hears (channels.ts hookPlan): every update as it comes (as before), held through quiet hours
// and sent as one message in the morning, or one digest a day at the hour the group picked.
import { deepStrictEqual as assertEquals } from "node:assert";
import { hookPlan } from "./channels.ts";

const NY = "America/New_York";
const at = (iso: string) => new Date(iso);

Deno.test("as they come: the default, same as before", () => {
  assertEquals(hookPlan(undefined, at("2026-10-23T03:00:00Z"), 2), { act: "post" }, "no settings: post now, even at night");
  assertEquals(hookPlan({}, at("2026-10-23T15:00:00Z"), 0), { act: "none" }, "nothing new, nothing posted");
});

Deno.test("quiet hours: held from 9pm to 8am where the business is, then one message", () => {
  const night = at("2026-10-23T02:30:00Z");   // 10:30pm in New York
  assertEquals(hookPlan({ quiet: true, tz: NY }, night, 3), { act: "hold", held_since: night.toISOString() });
  assertEquals(hookPlan({ quiet: true, tz: NY, held_since: "2026-10-23T02:30:00.000Z" }, at("2026-10-23T09:00:00Z"), 1), { act: "hold", held_since: "2026-10-23T02:30:00.000Z" }, "5am: still held, from the first one");
  assertEquals(hookPlan({ quiet: true, tz: NY, held_since: "2026-10-23T02:30:00.000Z" }, at("2026-10-23T12:10:00Z"), 0), { act: "post", since: "2026-10-23T02:30:00.000Z" }, "8:10am: everything since then, at once");
  assertEquals(hookPlan({ quiet: true, tz: NY }, at("2026-10-23T16:00:00Z"), 2), { act: "post" }, "daytime: as they come");
  assertEquals(hookPlan({ quiet: true, tz: "Asia/Shanghai" }, night, 1), { act: "post" }, "10:30am in Shanghai isn't quiet");
  assertEquals(hookPlan({ quiet: true, tz: "Not/AZone" }, night, 1).act, "hold", "an unknown zone falls back to New York's");
});

Deno.test("a daily digest: once a day, at the hour picked, with everything since the last one", () => {
  const s = { digest: "daily" as const, hour: 9, tz: NY };
  assertEquals(hookPlan(s, at("2026-10-23T12:30:00Z"), 5), { act: "none" }, "8:30am: not yet, fresh ones wait");
  assertEquals(hookPlan(s, at("2026-10-23T13:05:00Z"), 0), { act: "post", since: "2026-10-22T13:05:00.000Z" }, "9:05am, never sent: the last day");
  assertEquals(hookPlan({ ...s, last_sent: "2026-10-23T13:05:00.000Z" }, at("2026-10-23T18:00:00Z"), 4), { act: "none" }, "sent today: nothing more today");
  assertEquals(hookPlan({ ...s, last_sent: "2026-10-23T13:05:00.000Z" }, at("2026-10-24T13:01:00Z"), 0), { act: "post", since: "2026-10-23T13:05:00.000Z" }, "next morning: since the last one");
  assertEquals(hookPlan({ digest: "daily", hour: 99, tz: NY }, at("2026-10-23T13:05:00Z"), 0).act, "post", "a bad hour is 9am");
});
