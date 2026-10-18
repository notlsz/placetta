// Mention notices: who is reached how, what the message says, and what's left alone.
import { deepStrictEqual as assertEquals } from "node:assert";
import { channelFor, deliverNotices, noticeLink, noticeMessage, type NoticeDb, type NoticeRow, type Person } from "./notices.ts";

const textMe = (uid: string) => ({ memories: { [uid]: { items: [{ kind: "preference", status: "saved", reach: "text", avoid: ["email"], at: "2026-10-01" }] } } });
const noEmail = (uid: string) => ({ memories: { [uid]: { items: [{ kind: "preference", status: "saved", avoid: ["email"], at: "2026-10-01" }] } } });
const person = (o: Partial<Person> = {}): Person => ({ email: "jun@moonleaf.example", confirmed: true, phone: null, ...o });

Deno.test("each person's own channel", () => {
  assertEquals(channelFor({}, "u1", person()), "email");
  assertEquals(channelFor(textMe("u1"), "u1", person({ phone: { lang: "zh", texts: true } })), "text");
  // asked for texts but has no phone that takes them, and said no email: the app only
  assertEquals(channelFor(textMe("u1"), "u1", person()), "none");
  assertEquals(channelFor(noEmail("u1"), "u1", person()), "none");
  assertEquals(channelFor(noEmail("u1"), "u1", person({ phone: { lang: "en", texts: true } })), "text");
  // an address nobody confirmed is never emailed
  assertEquals(channelFor({}, "u1", person({ confirmed: false })), "none");
  // a headquarters email has no member behind it
  assertEquals(channelFor({}, null, null), "email");
  // someone else's preference doesn't count
  assertEquals(channelFor(textMe("u2"), "u1", person({ phone: { lang: "en", texts: true } })), "email");
});

Deno.test("the link and the words", () => {
  assertEquals(noticeLink("https://placetta.com", { workspace_id: "w1", user_id: "u1" }), "https://placetta.com/app/?ws=w1");
  assertEquals(noticeLink("https://placetta.com", { workspace_id: "w1", user_id: null }), "https://placetta.com/app/headquarters");
  const m = noticeMessage({ kind: "mention", title: { en: "mei@x.com mentioned you: Health permit", zh: "mei@x.com 提到了您：卫生许可" }, body: { en: "Who has the <lease>?", zh: "Who has the <lease>?" } }, "Moonleaf Tea", "https://p.test/app/", "zh");
  assertEquals(m.subject, "mei@x.com mentioned you: Health permit (Moonleaf Tea)");
  assertEquals(m.html.includes("&lt;lease&gt;"), true);
  assertEquals(m.html.includes("<lease>"), false);
  assertEquals(m.text.includes("提到了您"), true);
  assertEquals(m.sms, "mei@x.com 提到了您：卫生许可：“Who has the <lease>?”");
});

function fakeDb(rows: NoticeRow[], people: Record<string, Person>, states: Record<string, unknown> = {}) {
  const marked: [string, string][] = [];
  const db: NoticeDb = {
    async due({ today, by }) { return rows.filter((r) => (!r.remind_on || r.remind_on <= today) && (!by || by === "a1")); },
    async person(id) { return people[id] ?? person({ email: null, confirmed: false }); },
    async workspace(id) { return { name: "Moonleaf Tea", state: states[id] ?? {} }; },
    async mark(id, via) { marked.push([id, via]); },
  };
  return { db, marked };
}
const row = (o: Partial<NoticeRow>): NoticeRow => ({ id: "n", workspace_id: "w1", kind: "mention", user_id: "u1", email: null, title: { en: "t", zh: "t" }, body: null,
  item_kind: "app", item_id: "a1", remind_on: null, created_at: "2026-10-18T10:00:00Z", ...o });

Deno.test("deliver: email, text, quiet, stale and reminders", async () => {
  const rows = [
    row({ id: "n1" }),                                                         // member, email
    row({ id: "n2", user_id: "u2" }),                                          // member who asked for texts
    row({ id: "n3", user_id: "u3" }),                                          // member who said no email and has no phone
    row({ id: "n4", user_id: null, email: "hq@brand.test" }),                  // headquarters
    row({ id: "n5", created_at: "2026-10-01T10:00:00Z" }),                     // a week and more old: left in the app
    row({ id: "n6", user_id: null, email: "hq@brand.test", kind: "reminder", remind_on: "2026-10-25", created_at: "2026-10-02T00:00:00Z" }),   // not today
    row({ id: "n7", user_id: null, email: "hq@brand.test", kind: "reminder", remind_on: "2026-10-18", created_at: "2026-10-02T00:00:00Z" }),   // today, set long ago
  ];
  const { db, marked } = fakeDb(rows, { u1: person(), u2: person({ phone: { lang: "zh", texts: true } }), u3: person() }, { w1: { memories: { ...textMe("u2").memories, ...noEmail("u3").memories } } });
  const mails: string[] = [], texts: { user_id: string; body: string; dedupe: string }[] = [];
  const r = await deliverNotices(db, { mail: async (to) => { mails.push(to); return true; }, text: async (t) => { texts.push(t); return true; } }, { app: "https://p.test", today: "2026-10-18" });
  assertEquals(r, { emailed: 3, texted: 1, quiet: 1, stale: 1, failed: 0 });
  assertEquals(mails, ["jun@moonleaf.example", "hq@brand.test", "hq@brand.test"]);
  assertEquals(texts.map((t) => [t.user_id, t.dedupe]), [["u2", "notice:n2"]]);
  assertEquals(marked, [["n1", "email"], ["n2", "text"], ["n3", "none"], ["n4", "email"], ["n5", "none"], ["n7", "email"]]);
});

Deno.test("deliver: a failed send stays for the next run", async () => {
  const { db, marked } = fakeDb([row({ id: "n1" })], { u1: person() });
  const r = await deliverNotices(db, { mail: async () => false, text: async () => true }, { app: "", today: "2026-10-18" });
  assertEquals(r.failed, 1);
  assertEquals(marked, []);
});
