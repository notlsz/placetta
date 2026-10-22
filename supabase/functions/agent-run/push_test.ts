// Run: deno test supabase/functions/agent-run/push_test.ts
// Live run updates on the run's private Realtime channel: what is sent, when nothing is, and that a failing push never
// throws into the run.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { PUSH_MAX, pusher } from "./push.ts";

function recorder(o: { fail?: boolean } = {}) {
  const sent: { url: string; headers: Record<string, string>; body: { messages: { topic: string; event: string; payload: Record<string, unknown>; private: boolean }[] } }[] = [];
  const f = ((url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return o.fail ? Promise.reject(new Error("down")) : Promise.resolve(new Response("{}", { status: 202 }));
  }) as unknown as typeof fetch;
  return { sent, f };
}

Deno.test("progress sends only the new steps and the words so far, on the run's private channel", () => {
  const r = recorder();
  const p = pusher("https://x.supabase.co", "service", "run-1", 2, r.f);
  const steps: unknown[] = [{ a: 1 }, { a: 2 }, { a: 3 }];
  p.progress(steps, "Hello", "t1");
  p.progress(steps, "Hello", "t2");            // nothing new: nothing sent
  steps.push({ a: 4 });
  p.progress(steps, "Hello there", "t3");
  assertEquals(r.sent.length, 2);
  assertEquals(r.sent[0].url, "https://x.supabase.co/realtime/v1/api/broadcast");
  assertEquals(r.sent[0].headers.Authorization, "Bearer service");
  const [m1] = r.sent[0].body.messages, [m2] = r.sent[1].body.messages;
  assertEquals([m1.topic, m1.event, m1.private], ["run:run-1", "progress", true]);
  assertEquals(m1.payload, { from: 2, steps: [{ a: 3 }], draft: "Hello", at: "t1" });
  assertEquals(m2.payload, { from: 3, steps: [{ a: 4 }], draft: "Hello there", at: "t3" });
});

Deno.test("end tells the app to read the row; too big, unconfigured or failing pushes are skipped quietly", async () => {
  const r = recorder({ fail: true });
  const p = pusher("https://x.supabase.co", "service", "run-2", 0, r.f);
  p.progress([], "x".repeat(PUSH_MAX), "t");   // too big: polling carries it
  p.end("saved");                        // the push fails: nothing throws
  await new Promise((res) => setTimeout(res, 0));
  assertEquals(r.sent.map((s) => s.body.messages[0].event), ["end"]);
  const none = recorder();
  pusher("", "", "run-3", 0, none.f).end("saved");
  assert(none.sent.length === 0, "without the server's address and key nothing is sent");
});
