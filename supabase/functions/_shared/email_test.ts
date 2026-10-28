// Run: deno test supabase/functions/_shared/email_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { emailProvider, sendEmail, systemMailReady } from "./email.ts";
import { mailOutReady, sendMail } from "./mail.ts";
import { parseMime } from "./mime.ts";
import { refOf } from "./chase.ts";

const envOf = (o: Record<string, string>) => (k: string) => o[k];
const SES = { AWS_SES_ACCESS_KEY_ID: "AKIDTEST", AWS_SES_SECRET_ACCESS_KEY: "secret" };
const PM = { POSTMARK_SERVER_TOKEN: "pm_x" }, RS = { RESEND_API_KEY: "re_x" };

function fake(reply: Record<string, unknown> = { MessageId: "ses-1" }, status = 200) {
  const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const f = ((url: string, init: RequestInit = {}) => {
    calls.push({ url, headers: new Headers(init.headers), body: JSON.parse(String(init.body ?? "{}")) });
    return Promise.resolve(new Response(JSON.stringify(reply), { status }));
  }) as unknown as typeof fetch;
  return { f, calls };
}
const rawOf = (body: Record<string, unknown>) => { const d = atob(((body.Content as { Raw: { Data: string } }).Raw.Data)); return new TextDecoder().decode(Uint8Array.from(d, (c) => c.charCodeAt(0))); };

Deno.test("provider switch: SES once its keys are set; EMAIL_PROVIDER picks; the old defaults otherwise", () => {
  assertEquals(emailProvider(envOf({ ...SES, ...PM, ...RS })), "ses");
  assertEquals(emailProvider(envOf({ ...SES, ...PM, ...RS }), "odelia"), "ses");
  // switching back is one setting
  assertEquals(emailProvider(envOf({ ...SES, ...PM, ...RS, EMAIL_PROVIDER: "resend" })), "resend");
  assertEquals(emailProvider(envOf({ ...SES, ...PM, ...RS, EMAIL_PROVIDER: "Postmark" }), "odelia"), "postmark");
  // as before SES: Odelia's mail prefers Postmark, Placetta's notices Resend
  assertEquals(emailProvider(envOf({ ...PM, ...RS }), "odelia"), "postmark");
  assertEquals(emailProvider(envOf({ ...PM, ...RS }), "system"), "resend");
  assertEquals(emailProvider(envOf({ ...PM })), "postmark");
  // an explicit choice without its keys sends nothing, rather than quietly using another provider
  assertEquals(emailProvider(envOf({ ...RS, EMAIL_PROVIDER: "ses" })), null);
  assertEquals(emailProvider(envOf({ ...SES, EMAIL_PROVIDER: "sendgrid" })), null);
  assertEquals(emailProvider(envOf({ AWS_SES_ACCESS_KEY_ID: "only-half" })), null);
  assertEquals(emailProvider(envOf({})), null);
  assert(systemMailReady(envOf({ ...SES, MAIL_FROM: "Placetta <hello@placetta.com>" })) && !systemMailReady(envOf({ ...SES })));
  assert(mailOutReady(envOf({ ...SES, ODELIA_EMAIL: "odelia@placetta.com" })) && !mailOutReady(envOf({ ...SES })));
});

Deno.test("SES: SendEmail v2 with a SigV4-signed raw message to the configured region and configuration set", async () => {
  const { f, calls } = fake();
  const env = envOf({ ...SES, AWS_SES_REGION: "us-west-2", AWS_SES_CONFIGURATION_SET: "placetta" });
  const r = await sendEmail(env, { from: "Placetta <hello@placetta.com>", to: ["a@x.com", "a@x.com", "b@y.com"], subject: "New for the team", text: "t", html: "<p>t</p>" }, { f });
  assertEquals([r.ok, r.id, r.provider], [true, "ses-1", "ses"]);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://email.us-west-2.amazonaws.com/v2/email/outbound-emails");
  const auth = calls[0].headers.get("authorization") ?? "";
  assert(/^AWS4-HMAC-SHA256 Credential=AKIDTEST\/\d{8}\/us-west-2\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/.test(auth), auth);
  assertEquals(calls[0].body.ConfigurationSetName, "placetta");
  assertEquals(calls[0].body.Destination, { ToAddresses: ["a@x.com", "b@y.com"] });
  assertEquals(calls[0].body.FromEmailAddress, "Placetta <hello@placetta.com>");
  const m = parseMime(rawOf(calls[0].body));
  assertEquals([m.headers.subject, m.text, m.html], [["New for the team"], "t", "<p>t</p>"]);
  // the default region is us-east-1, and no configuration set unless one is named
  const d = fake();
  await sendEmail(envOf(SES), { from: "hello@placetta.com", to: ["a@x.com"], subject: "s", text: "t" }, { f: d.f });
  assertEquals([d.calls[0].url, d.calls[0].body.ConfigurationSetName], ["https://email.us-east-1.amazonaws.com/v2/email/outbound-emails", undefined]);
});

Deno.test("SES: Odelia's reply carries the attachment, Reply-To on the inbound subdomain, threading and the reference tag", async () => {
  const { f, calls } = fake({ MessageId: "ses-2" });
  const env = envOf({ ...SES, ODELIA_EMAIL: "odelia@placetta.com", ODELIA_REPLY_TO: "odelia@in.placetta.com" });
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
  const r = await sendMail(env, { to: "landlord@leasing.com", subject: "Lease for Golden Ox [P-ABCDEFGH]", text: "Could you send the signed lease?", html: "<p>Could you send the signed lease?</p>",
    inReplyTo: "<CAF1@mail.gmail.com>", attachments: [{ name: "DE 1, filled.pdf", content: pdf, type: "application/pdf" }] }, f);
  assertEquals([r.ok, r.id], [true, "ses-2"]);
  const m = parseMime(rawOf(calls[0].body));
  assertEquals(m.headers.from, ['"Odelia (Placetta)" <odelia@placetta.com>']);
  assertEquals(m.headers["reply-to"], ["odelia@in.placetta.com"]);
  assertEquals([m.headers["in-reply-to"], m.headers.references], [["<CAF1@mail.gmail.com>"], ["<CAF1@mail.gmail.com>"]]);
  assertEquals(refOf(m.headers.subject[0]), "ABCDEFGH");
  assertEquals(m.files.map((x) => [x.name, x.mime, [...x.bytes]]), [["DE 1, filled.pdf", "application/pdf", [...pdf]]]);
});

Deno.test("Postmark and Resend still work, now with Reply-To", async () => {
  const pm = fake({ MessageID: "pm-1" });
  await sendMail(envOf({ ...PM, ODELIA_EMAIL: "odelia@placetta.com", ODELIA_REPLY_TO: "odelia@in.placetta.com" }), { to: "a@x.com", subject: "s", text: "t", html: "h" }, pm.f);
  assertEquals([pm.calls[0].url, pm.calls[0].body.ReplyTo, pm.calls[0].body.To], ["https://api.postmarkapp.com/email", "odelia@in.placetta.com", "a@x.com"]);
  const rs = fake({ id: "rs-1" });
  const r = await sendEmail(envOf({ ...RS }), { from: "hello@placetta.com", to: ["a@x.com"], subject: "s", text: "t", replyTo: "help@placetta.com" }, { f: rs.f });
  assertEquals([r.ok, r.id, rs.calls[0].body.reply_to, rs.calls[0].body.html], [true, "rs-1", "help@placetta.com", undefined]);
  // an error from the provider comes back as a failure with its message, never thrown
  const bad = fake({ message: "Email address is not verified." }, 400);
  const e = await sendEmail(envOf(SES), { from: "x@placetta.com", to: ["a@x.com"], subject: "s", text: "t" }, { f: bad.f });
  assertEquals([e.ok, e.status, e.detail], [false, 400, "Email address is not verified."]);
  const boom = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
  assertEquals((await sendEmail(envOf(SES), { from: "x@placetta.com", to: ["a@x.com"], subject: "s", text: "t" }, { f: boom })).status, 502);
});

Deno.test("suppression: a hard-bounced or complaining address is never mailed, by any provider", async () => {
  const list = new Set(["gone@bounce.test", "angry@complain.test"]);
  const suppressed = (emails: string[]) => Promise.resolve(new Set(emails.filter((e) => list.has(e))));
  for (const env of [envOf(SES), envOf(PM), envOf(RS)]) {
    const { f, calls } = fake({ MessageId: "x", MessageID: "x", id: "x" });
    const r = await sendEmail(env, { from: "hello@placetta.com", to: ["Gone <GONE@bounce.test>", "ok@fine.test"], subject: "s", text: "t" }, { f, suppressed });
    assertEquals([r.ok, r.suppressed], [true, ["Gone <GONE@bounce.test>"]]);
    assertEquals(calls.length, 1);
    assert(!JSON.stringify(calls[0].body).toLowerCase().includes("gone@bounce.test"));
    if (calls[0].body.Content) assert(!rawOf(calls[0].body).toLowerCase().includes("gone@bounce.test"));
    // everyone suppressed: nothing is sent at all
    const none = fake();
    const r2 = await sendEmail(env, { from: "hello@placetta.com", to: ["angry@complain.test"], subject: "s", text: "t" }, { f: none.f, suppressed });
    assertEquals([r2.ok, r2.status, r2.detail, none.calls.length], [false, 422, "suppressed", 0]);
  }
  // Odelia's own mail goes through the same list
  const o = fake();
  const r3 = await sendMail(envOf({ ...SES, ODELIA_EMAIL: "odelia@placetta.com" }), { to: "gone@bounce.test", subject: "s", text: "t", html: "h" }, o.f, suppressed);
  assertEquals([r3.ok, o.calls.length], [false, 0]);
});
