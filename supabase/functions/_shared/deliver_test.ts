// Run: deno test -A supabase/functions/_shared/deliver_test.ts
// Which way a text goes (routeFor), which one channel an update takes (updateChannel), and the words of approving by
// text (text_approval.ts).
import { deepStrictEqual as eq, ok } from "node:assert";
import { routeFor, takesIMessage, updateChannel } from "./deliver.ts";
import { approvalAsk, approvalReply, cardByText } from "./text_approval.ts";
import { textLimit } from "./odelia.ts";

const all = { linq: true, sms: true, whatsapp: true };

Deno.test("a reply goes back the way they wrote", () => {
  eq(routeFor({ ...all, reply: true, via: "whatsapp", line: "+12125550177" }), "whatsapp");
  eq(routeFor({ ...all, reply: true, via: "sms", line: "+12125550177" }), "sms", "they texted Odelia's Telnyx number: not from an iMessage line");
  eq(routeFor({ ...all, reply: true, via: null, line: "+12125550177", imessage: false }), "imessage", "back on the line they wrote to, even from Android");
  eq(routeFor({ linq: false, sms: true, whatsapp: false, reply: true, via: "whatsapp" }), "sms", "WhatsApp isn't set up: SMS");
  eq(routeFor({ linq: false, sms: false, whatsapp: false, reply: true }), null);
});

Deno.test("an update goes by iMessage to an iPhone with a conversation, else by SMS (cost, and Linq's rule on new chats)", () => {
  eq(routeFor({ ...all, reply: false, line: "+12125550177", imessage: true }), "imessage");
  eq(routeFor({ ...all, reply: false, line: "+12125550177", imessage: null }), "imessage", "not known yet: the line they have");
  eq(routeFor({ ...all, reply: false, line: "+12125550177", imessage: false }), "sms", "Android: Telnyx SMS");
  eq(routeFor({ ...all, reply: false, line: null, imessage: true }), "sms", "no conversation yet: Odelia doesn't open one with an update");
  eq(routeFor({ linq: true, sms: false, whatsapp: false, reply: false, line: null }), "imessage", "Linq alone: it's the only way");
  eq(routeFor({ ...all, reply: false, via: "whatsapp" }), "whatsapp", "a WhatsApp person hears on WhatsApp (the template outside the window)");
  eq(routeFor({ linq: false, sms: true, whatsapp: false, reply: false }), "sms");
});

Deno.test("Linq's service says whether the phone takes iMessage", () => {
  eq([takesIMessage("iMessage"), takesIMessage("SMS"), takesIMessage("RCS"), takesIMessage(undefined), takesIMessage("WhatsApp")], [true, false, false, null, null]);
});

Deno.test("one channel per update, and never one the owner said not to use", () => {
  const phone = { texts: true, calls: true };
  const none = { avoid: [] as ("text" | "email" | "call")[] };
  eq(updateChannel("urgent", { reach: none, phone, email: true }), "call");
  eq(updateChannel("urgent", { reach: { avoid: ["call"] }, phone, email: true }), "text");
  eq(updateChannel("urgent", { reach: none, phone: { texts: true, calls: false }, email: true }), "text");
  eq(updateChannel("urgent", { reach: none, phone: null, email: true }), "email");
  eq(updateChannel("important", { reach: none, phone, email: true }), "text");
  eq(updateChannel("important", { reach: { prefer: "email", avoid: [] }, phone, email: true }), "email", "they said email");
  eq(updateChannel("important", { reach: { avoid: ["text"] }, phone, email: true }), "email");
  eq(updateChannel("important", { reach: { avoid: ["text", "email"] }, phone, email: true }), "none");
  eq(updateChannel(null, { reach: none, phone, email: true }), "email", "routine: the digest");
  eq(updateChannel(null, { reach: { prefer: "text", avoid: [] }, phone, email: true }), "text", "they asked for texts");
  eq(updateChannel(null, { reach: { avoid: ["email"] }, phone, email: true }), "text");
  eq(updateChannel(null, { reach: none, phone: { texts: false, calls: false }, email: false }), "none");
});

Deno.test("approving by text takes YES and the code, in English or Chinese; never a bare yes", () => {
  for (const t of ["YES 4821", "yes 4821", "Yes, 4821.", "approve 4821", "Approved 4821!", "YES4821", "4821 yes", "批准 4821", "同意4821", "ok 4821"]) eq(approvalReply(t)?.code, "4821", t);
  eq(approvalReply("yes"), null, "a bare yes is an answer to Odelia");
  eq(approvalReply("approve"), { code: null, bare: "approve" });
  eq(approvalReply("批准"), { code: null, bare: "approve" });
  for (const t of ["yes 48211", "yes 482", "4821", "yes please file 4821 now", "approve the sign permit", "", "  "]) eq(approvalReply(t)?.code ?? null, null, t);
  eq(approvalReply(42), null);
});

Deno.test("the ask fits a text and names the card when there are several", () => {
  eq(approvalAsk("4821", "en"), "Reply YES 4821 to approve.");
  eq(approvalAsk("4821", "en", "File the sign permit."), "Reply YES 4821 to approve: File the sign permit.");
  eq(approvalAsk("4821", "zh"), "回复 YES 4821 即可批准。");
  ok(approvalAsk("4821", "en", "x".repeat(200)).length < 80);
  ok(approvalAsk("4821", "en").length + 60 < textLimit("a"));
});

Deno.test("only a filing's own card can be approved by text", () => {
  ok(cardByText({ kind: "file", app: "sj-sign" }));
  for (const c of [{ kind: "pay", app: "x", purchase: "p1" }, { kind: "send" }, { kind: "change" }, { kind: "file" }, { kind: "file", app: "a", autopilot: { grant: "g" } }, { kind: "file", app: "a", withdrawn: true }, null]) ok(!cardByText(c), JSON.stringify(c));
});
