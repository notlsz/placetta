// Run: deno test supabase/functions/_shared/mail_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { addressOf, fetchResend, isForward, mailBody, parsePostmark, postmarkAuthOk, replySubject, sendMail, senderVerified, stripQuoted } from "./mail.ts";

const H = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase(), [v]]));

Deno.test("addresses", () => {
  assertEquals(addressOf('"Mei Chen" <Mei@GoldenOx.com>'), "mei@goldenox.com");
  assertEquals(addressOf("ops@placetta.test"), "ops@placetta.test");
  assertEquals(addressOf("nobody"), "");
});

Deno.test("sender verified only by DMARC pass or DKIM by the From domain, never SPF alone or a forged header.from", () => {
  const from = "mei@goldenox.com";
  assert(senderVerified(H({ "Authentication-Results": "mx.postmarkapp.com; dkim=pass header.d=goldenox.com; spf=pass smtp.mailfrom=goldenox.com; dmarc=pass header.from=goldenox.com" }), from));
  assert(senderVerified(H({ "Authentication-Results": "amazonses.com; spf=fail; dkim=pass header.i=@mail.goldenox.com" }), from), "DKIM by a subdomain of the From domain");
  assert(senderVerified(H({ "X-Spam-Tests": "DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS" }), from), "Postmark's author-domain DKIM test");
  assert(!senderVerified(H({ "Authentication-Results": "mx; spf=pass smtp.mailfrom=goldenox.com; dkim=none; dmarc=none" }), from), "SPF alone");
  assert(!senderVerified(H({ "Authentication-Results": "mx; dkim=pass header.d=evil.com; dmarc=fail header.from=goldenox.com" }), from), "DKIM from another domain");
  assert(!senderVerified(H({ "Authentication-Results": "mx; dmarc=pass header.from=evil.com" }), from), "DMARC for a different From");
  assert(!senderVerified(H({ "X-Spam-Tests": "DKIM_SIGNED,DKIM_VALID,SPF_PASS" }), from));
  assert(!senderVerified({}, from));
});

Deno.test("Postmark: basic auth, parsing, the stripped reply, a forward kept whole, attachments", () => {
  const auth = "Basic " + btoa("odelia:s3cret-pass");
  assert(postmarkAuthOk(auth, "odelia:s3cret-pass"));
  assert(!postmarkAuthOk(auth, "odelia:other"));
  assert(!postmarkAuthOk("Bearer x", "odelia:s3cret-pass"));
  assert(!postmarkAuthOk(auth, ""));
  const base = { MessageID: "pm-1", FromFull: { Email: "Mei@GoldenOx.com", Name: "Mei Chen" }, To: "Odelia <odelia@placetta.com>", ToFull: [{ Email: "odelia@placetta.com" }],
    Headers: [{ Name: "Message-ID", Value: "<CAF123@mail.gmail.com>" }, { Name: "Authentication-Results", Value: "mx; dmarc=pass header.from=goldenox.com" }],
    Attachments: [{ Name: "permit.pdf", Content: btoa("%PDF-1.4"), ContentType: "application/pdf", ContentLength: 8 }] };
  const m = parsePostmark({ ...base, Subject: "Re: your sign permit", TextBody: "Yes please.\n\nOn Tue, Odelia wrote:\n> old", StrippedTextReply: "Yes please." })!;
  assertEquals([m.id, m.from, m.name, m.to, m.subject, m.text], ["mail:<CAF123@mail.gmail.com>", "mei@goldenox.com", "Mei Chen", ["odelia@placetta.com"], "Re: your sign permit", "Yes please."]);
  assertEquals([m.files[0].name, m.files[0].mime, new TextDecoder().decode(m.files[0].bytes)], ["permit.pdf", "application/pdf", "%PDF-1.4"]);
  assert(senderVerified(m.headers, m.from));
  const fwd = parsePostmark({ ...base, Subject: "Fwd: Notice of violation", TextBody: "Can you look?\n\n---------- Forwarded message ---------\nFrom: DOHMH <no-reply@health.nyc.gov>\nDate: Oct 1\n\nYour establishment...", StrippedTextReply: "Can you look?" })!;
  assert(/Your establishment/.test(fwd.text), "a forward keeps the letter");
  assertEquals(parsePostmark({ ...base, FromFull: { Email: "" } }), null);
});

Deno.test("quoted threads and forwards", () => {
  assertEquals(stripQuoted("Thanks!\n\nOn Mon, Oct 12, 2026 at 9:00 AM Odelia <odelia@placetta.com> wrote:\n> hi"), "Thanks!");
  assertEquals(stripQuoted("好的\n\n发件人：Odelia\n发送时间：2026年10月12日\n内容"), "好的");
  assertEquals(stripQuoted("ok\n-----Original Message-----\nFrom: x"), "ok");
  assert(/Inspection/.test(stripQuoted("see below\n---------- Forwarded message ---------\nInspection on Oct 3")));
  assert(isForward("Fwd: x") && isForward("FW: x") && isForward("转发：x") && !isForward("Re: x"));
  assertEquals(replySubject("Notice"), "Re: Notice");
  assertEquals(replySubject("Re: Notice"), "Re: Notice");
});

Deno.test("the answer as an email: markdown dropped, paragraphs and links kept", () => {
  const b = mailBody("**Due Nov 3.** Your [permit](https://x.test/p) needs:\n\n* a floor plan\n* the fee", "Approve in the app: https://app.test/a?x=1&y=2");
  assert(!/\*\*|\]\(/.test(b.text) && /permit \(https:\/\/x\.test\/p\)/.test(b.text) && /- a floor plan/.test(b.text));
  assert(b.html.includes('<a href="https://app.test/a?x=1&amp;y=2">'), b.html);
  assert(b.html.split("<p>").length >= 4);
});

type Call = { url: string; method: string; body: any; headers: Headers };
function fake(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: String(init.method ?? "GET"), body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers) });
    const hit = Object.entries(routes).find(([k]) => url.endsWith(k));
    return new Response(JSON.stringify(hit ? hit[1] : {}), { status: hit ? 200 : 404, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

Deno.test("Resend: the webhook names the mail; its text, headers and attachments come from the API", async () => {
  const env = (k: string) => ({ RESEND_API_KEY: "re_x", ODELIA_EMAIL: "odelia@placetta.com" } as Record<string, string>)[k];
  const { f, calls } = fake({
    "/emails/receiving/em_1": { object: "email", id: "em_1", from: "Mei Chen <mei@goldenox.com>", to: ["odelia@placetta.com"], received_for: ["odelia@placetta.com"], subject: "Question", text: "When is it due?\n\nOn Mon, X wrote:\n> y",
      html: null, headers: { "authentication-results": "mx; dmarc=pass header.from=goldenox.com", "message-id": "<abc@goldenox.com>" }, message_id: "<abc@goldenox.com>", attachments: [{ id: "a1", filename: "p.pdf", size: 8, content_type: "application/pdf" }] },
    "/emails/receiving/em_1/attachments": { object: "list", has_more: false, data: [{ id: "a1", filename: "p.pdf", size: 8, content_type: "application/pdf", content_disposition: "attachment", download_url: "https://cdn.resend.test/a1", expires_at: "x" }, { id: "a2", filename: "logo.png", size: 3, content_type: "image/png", content_disposition: "inline", download_url: "https://cdn.resend.test/a2", expires_at: "x" }] },
  });
  const m = (await fetchResend(env, { type: "email.received", data: { email_id: "em_1" } }, f))!;
  assertEquals([m.id, m.from, m.name, m.subject, m.text, m.files.map((x) => x.name)], ["mail:<abc@goldenox.com>", "mei@goldenox.com", "Mei Chen", "Question", "When is it due?", ["p.pdf"]]);
  assert(senderVerified(m.headers, m.from));
  assertEquals(calls[0].headers.get("authorization"), "Bearer re_x");
  assertEquals(await fetchResend(env, { type: "email.delivered", data: { email_id: "em_1" } }, f), null);
});

Deno.test("sending: Postmark when it's set up, else Resend, threaded under theirs", async () => {
  const pm = fake({ "/email": { MessageID: "pm-out-1" } });
  const envPm = (k: string) => ({ POSTMARK_SERVER_TOKEN: "pm_x", ODELIA_EMAIL: "odelia@placetta.com" } as Record<string, string>)[k];
  const r = await sendMail(envPm, { to: "mei@goldenox.com", subject: "Re: Question", text: "t", html: "<p>t</p>", inReplyTo: "<abc@goldenox.com>" }, pm.f);
  assertEquals([r.ok, r.id], [true, "pm-out-1"]);
  assertEquals(pm.calls[0].headers.get("x-postmark-server-token"), "pm_x");
  assertEquals(pm.calls[0].body.From, "Odelia (Placetta) <odelia@placetta.com>");
  assertEquals(pm.calls[0].body.Headers, [{ Name: "In-Reply-To", Value: "<abc@goldenox.com>" }, { Name: "References", Value: "<abc@goldenox.com>" }]);
  const rs = fake({ "/emails": { id: "rs-out-1" } });
  const envRs = (k: string) => ({ RESEND_API_KEY: "re_x", ODELIA_EMAIL: "odelia@placetta.com" } as Record<string, string>)[k];
  const r2 = await sendMail(envRs, { to: "mei@goldenox.com", subject: "Re: Q", text: "t", html: "<p>t</p>" }, rs.f);
  assertEquals([r2.ok, r2.id, rs.calls[0].url], [true, "rs-out-1", "https://api.resend.com/emails"]);
  assertEquals(rs.calls[0].body.to, ["mei@goldenox.com"]);
  assertEquals((await sendMail((() => undefined) as never, { to: "a@b.c", subject: "s", text: "t", html: "h" })).status, 503);
});
