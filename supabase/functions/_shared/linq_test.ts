// Run: deno test supabase/functions/_shared/linq_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { hashLine, linqLineHealth, linqLines, linqReady, linqSend, linqTyping, parseLinq, pickLine, signLinq, verifyLinq } from "./linq.ts";

const SECRET = "whsec_" + btoa("0123456789abcdef0123456789abcdef");
const envOf = (o: Record<string, string>) => (k: string) => o[k];
const ENV = envOf({ LINQ_API_KEY: "lk_test", LINQ_WEBHOOK_SECRET: SECRET, LINQ_NUMBERS: "+14155550100, (415) 555-0101,+14155550100" });

Deno.test("lines: normalized, de-duplicated, in order; ready needs key, secret and a line", () => {
  assertEquals(linqLines(ENV), ["+14155550100", "+14155550101"]);
  assert(linqReady(ENV));
  assert(!linqReady(envOf({ LINQ_API_KEY: "k", LINQ_WEBHOOK_SECRET: SECRET })));
  assert(!linqReady(envOf({ LINQ_WEBHOOK_SECRET: SECRET, LINQ_NUMBERS: "+14155550100" })));
});

Deno.test("webhook signature: Standard Webhooks, v1 base64 HMAC of id.timestamp.body", async () => {
  const raw = JSON.stringify({ event_type: "message.received", data: { id: "m1" } });
  const now = 1_790_000_000, ts = String(now);
  const sig = await signLinq(raw, "evt_1", ts, SECRET);
  assert(sig.startsWith("v1,"));
  assert(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig }, SECRET, now));
  // several signatures (key rotation): any one matching is enough
  assert(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: `v1,AAAA ${sig}` }, SECRET, now));
  assert(!(await verifyLinq(raw + " ", { id: "evt_1", timestamp: ts, signature: sig }, SECRET, now)), "body changed");
  assert(!(await verifyLinq(raw, { id: "evt_2", timestamp: ts, signature: sig }, SECRET, now)), "id changed");
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig }, "whsec_" + btoa("another-secret-another-secret!!"), now)), "wrong secret");
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig }, SECRET, now + 301)), "too old");
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig }, SECRET, now - 301)), "from the future");
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig.replace("v1,", "v2,") }, SECRET, now)), "unknown version");
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: "" }, SECRET, now)));
  assert(!(await verifyLinq(raw, { id: "evt_1", timestamp: ts, signature: sig }, "", now)));
});

const received = (data: Record<string, unknown>) => ({ api_version: "v3", event_type: "message.received", event_id: "evt_9", webhook_version: "2026-02-03", data: {
  id: "msg_1", direction: "inbound", service: "iMessage", sender_handle: { handle: "+16465550142", is_me: false },
  chat: { id: "chat_1", is_group: false, owner_handle: { handle: "+14155550101", is_me: true } }, parts: [{ type: "text", value: " When is my permit due? " }], ...data } });

Deno.test("parse: a text, its photo and PDF, the line it came to, and its conversation", () => {
  const m = parseLinq(received({ parts: [
    { type: "text", value: "Here's the inspection report" },
    { type: "media", id: "att_1", url: "https://cdn.linqapp.com/a/1.jpg?sig=x", mime_type: "image/jpeg", size_bytes: 1200, filename: "IMG_1.jpg" },
    { type: "media", id: "att_2", url: "https://cdn.linqapp.com/a/2.pdf?sig=y", mime_type: "application/pdf", size_bytes: 9000, filename: "report.pdf" },
  ] }));
  assert(!("skip" in m));
  assertEquals(m.id, "linq:msg_1");
  assertEquals(m.from, "+16465550142");
  assertEquals(m.to, "+14155550101");
  assertEquals(m.chat, "chat_1");
  assertEquals(m.service, "iMessage");
  assertEquals(m.text, "Here's the inspection report");
  assertEquals(m.media.map((x) => x.content_type), ["image/jpeg", "application/pdf"]);
  assertEquals(m.media[1].size, 9000);
});

Deno.test("parse: what Odelia never answers", () => {
  assertEquals(parseLinq({ event_type: "message.delivered", data: {} }), { skip: "not_a_message" });
  assertEquals(parseLinq(received({ direction: "outbound" })), { skip: "outbound" });
  assertEquals(parseLinq(received({ chat: { id: "c", is_group: true } })), { skip: "group" });
  assertEquals(parseLinq(received({ reconciled_at: "2026-10-16T05:00:00Z" })), { skip: "late" });
  assertEquals(parseLinq(received({ sender_handle: { handle: "not a number" } })), { skip: "no_sender" });
  assertEquals(parseLinq(received({ parts: [], zero_retention: true })), { skip: "empty_zero_retention" });
});

Deno.test("parse: an SMS from an Android phone, and the older 2025-01-01 payload", () => {
  const sms = parseLinq(received({ service: "SMS" }));
  assert(!("skip" in sms) && sms.service === "SMS");
  const old = parseLinq({ event_type: "message.received", event_id: "e", data: { is_from_me: false, from: "+16465550142", chat_id: "chat_old", recipient_phone: "+14155550100", message: { id: "old_1", parts: [{ type: "text", value: "hi" }] } } });
  assert(!("skip" in old));
  assertEquals([old.id, old.from, old.to, old.chat, old.text], ["linq:old_1", "+16465550142", "+14155550100", "chat_old", "hi"]);
});

type Call = { method: string; url: string; body: Record<string, unknown> | null; auth: string | null };
function fake(responses: ((c: Call) => [number, unknown])[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c = { method: String(init.method), url, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get("authorization") };
    calls.push(c);
    const [status, body] = (responses[calls.length - 1] ?? responses.at(-1)!)(c);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const created = (chat = "chat_1", msg = "msg_out_1") => () => [201, { chat: { id: chat, service: "iMessage", is_group: false, handles: [], message: { id: msg, delivery_status: "queued" } } }] as [number, unknown];
const err = (status: number, code: number) => () => [status, { success: false, error: { status, code, message: `code ${code}` }, trace_id: "t" }] as [number, unknown];

Deno.test("send: one message into the conversation, keyed so a retry never sends twice", async () => {
  const { f, calls } = fake([created()]);
  const r = await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "Your permit is due Nov 3.", key: "k1" }, f);
  assertEquals([r.ok, r.id, r.chat, r.service], [true, "msg_out_1", "chat_1", "iMessage"]);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://api.linqapp.com/api/partner/v3/chats");
  assertEquals(calls[0].auth, "Bearer lk_test");
  assertEquals(calls[0].body, { from: "+14155550100", to: ["+16465550142"], message: { parts: [{ type: "text", value: "Your permit is due Nov 3." }], idempotency_key: "k1" } });
});

Deno.test("send: a new conversation can't open with a link, so the words go first and the link follows", async () => {
  const { f, calls } = fake([err(400, 1005), created("chat_new", "msg_words"), () => [201, { chat_id: "chat_new", message: { id: "msg_link" } }]]);
  const r = await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "Approve in the app: https://placetta.com/app/?ws=1&approval=a" }, f);
  assert(r.ok);
  assertEquals(r.id, "msg_link");
  assertEquals((calls[1].body!.message as { parts: { value: string }[] }).parts[0].value, "Approve in the app");
  assertEquals(calls[2].url, "https://api.linqapp.com/api/partner/v3/chats/chat_new/messages");
  assertEquals((calls[2].body!.message as { parts: { value: string }[] }).parts[0].value, "https://placetta.com/app/?ws=1&approval=a");
  // a 1005 for some other reason, with no link in the text, is just a failure
  const two = fake([err(400, 1005)]);
  const r2 = await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "no link here" }, two.f);
  assertEquals([r2.ok, r2.code, two.calls.length], [false, 1005, 1]);
});

Deno.test("send: opted out (2024), line restricted (2027), and the one courtesy reply to STOP", async () => {
  assertEquals((await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "x" }, fake([err(403, 2024)]).f)).code, 2024);
  assertEquals((await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "x" }, fake([err(403, 2027)]).f)).code, 2027);
  const { f, calls } = fake([created()]);
  await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "You're unsubscribed.", courtesy: true }, f);
  assertEquals(calls[0].body!.override_optout, true);
  const down = await linqSend(ENV, { from: "+14155550100", to: "+16465550142", text: "x" }, (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch);
  assertEquals([down.ok, down.status], [false, 502]);
  assertEquals((await linqSend(envOf({}), { from: "a", to: "b", text: "x" })).status, 503);
});

Deno.test("typing bubble and line reputation", async () => {
  const t = fake([() => [204, {}]]);
  assert(await linqTyping(ENV, "chat 1", t.f));
  assertEquals([t.calls[0].method, t.calls[0].url], ["POST", "https://api.linqapp.com/api/partner/v3/chats/chat%201/typing"]);
  const h = fake([() => [200, { phone_numbers: [
    { id: "1", phone_number: "+14155550100", reputation: { status: "HEALTHY", doc_url: "u" } },
    { id: "2", phone_number: "+14155550101", reputation: { status: "CRITICAL", doc_url: "v" } },
    { id: "3", phone_number: "+19995550000", reputation: { status: "AT_RISK" } },
  ] }]]);
  assertEquals(await linqLineHealth(ENV, h.f), [{ number: "+14155550100", reputation: "HEALTHY", doc_url: "u" }, { number: "+14155550101", reputation: "CRITICAL", doc_url: "v" }]);
  assertEquals(h.calls[0].method, "GET");
});

Deno.test("which line: stable spread, replies stay on their line, CRITICAL lines skipped for outbound", () => {
  const lines = ["+14155550100", "+14155550101", "+14155550102", "+14155550103"];
  const counts = new Map<string, number>();
  for (let i = 0; i < 400; i++) { const l = hashLine(lines, `+1646555${String(i).padStart(4, "0")}`)!; counts.set(l, (counts.get(l) ?? 0) + 1); }
  assertEquals(counts.size, 4);
  for (const n of counts.values()) assert(n > 60, `uneven spread: ${[...counts.values()]}`);
  assertEquals(hashLine(lines, "+16465550142"), hashLine(lines, "+16465550142"));
  assertEquals(hashLine([], "+1"), null);
  const bad = new Set(["+14155550101"]);
  assertEquals(pickLine(lines, { stored: "+14155550102", number: "+1", critical: bad }), "+14155550102");
  assertEquals(pickLine(lines, { stored: "+14155550101", number: "+16465550142", critical: bad, reply: true }), "+14155550101");
  const moved = pickLine(lines, { stored: "+14155550101", number: "+16465550142", critical: bad });
  assert(moved && moved !== "+14155550101");
  assertEquals(pickLine(lines, { stored: "+19995550000", number: "+16465550142" }), hashLine(lines, "+16465550142"), "a line we no longer have");
  assertEquals(pickLine(["+14155550101"], { number: "+1", critical: bad }), null);
});
