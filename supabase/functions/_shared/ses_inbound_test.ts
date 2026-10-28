// Run: deno test supabase/functions/_shared/ses_inbound_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { routeSns } from "./ses_inbound.ts";
import { sesEvent, type Suppression, suppressedIn } from "./suppression.ts";
import { received, sesEnv, snsKit, TOPIC } from "./sns_testkit.ts";

const env = sesEnv();
const bounce = (type: string, emails: string[]) => JSON.stringify({ notificationType: "Bounce", bounce: { bounceType: type, bounceSubType: "General", bouncedRecipients: emails.map((emailAddress) => ({ emailAddress, diagnosticCode: "smtp; 550 5.1.1 user unknown" })) }, mail: { messageId: "x" } });
const complaint = (emails: string[], type = "abuse") => JSON.stringify({ notificationType: "Complaint", complaint: { complaintFeedbackType: type, complainedRecipients: emails.map((emailAddress) => ({ emailAddress })) }, mail: { messageId: "y" } });
function deps(kit: Awaited<ReturnType<typeof snsKit>>, f?: typeof fetch) {
  const added: Suppression[] = [];
  return { added, d: { suppress: (l: Suppression[]) => { added.push(...l); return Promise.resolve(l.length); }, fetchCert: kit.fetchCert, f } };
}

Deno.test("bounces and complaints: a hard bounce or a complaint suppresses the address; a soft bounce doesn't", async () => {
  assertEquals(sesEvent(JSON.parse(bounce("Permanent", ["Gone@Bounce.test"]))), { kind: "suppress", list: [{ email: "gone@bounce.test", reason: "bounce", detail: "General smtp; 550 5.1.1 user unknown" }] });
  assertEquals(sesEvent(JSON.parse(bounce("Transient", ["full@mailbox.test"]))), { kind: "ignore", why: "bounce_transient" });
  assertEquals(sesEvent(JSON.parse(complaint(["angry@complain.test"]))), { kind: "suppress", list: [{ email: "angry@complain.test", reason: "complaint", detail: "abuse" }] });
  assertEquals(sesEvent(JSON.parse(complaint(["fine@x.test"], "not-spam"))).kind, "ignore");
  // configuration set events name it eventType
  assertEquals(sesEvent({ eventType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@b.test" }] } }).kind, "suppress");
  assertEquals(sesEvent({ eventType: "Delivery" }), { kind: "ignore", why: "type_delivery" });
  assertEquals(sesEvent({ notificationType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "not an address" }] } }).kind, "ignore");

  const kit = await snsKit();
  const { added, d } = deps(kit);
  const r = await routeSns(JSON.stringify(await kit.sign({ Message: bounce("Permanent", ["gone@bounce.test"]) })), env, d);
  assertEquals([r.status, r.body], [200, { ok: true, suppressed: 1 }]);
  await routeSns(JSON.stringify(await kit.sign({ Message: bounce("Transient", ["full@mailbox.test"]) })), env, d);
  await routeSns(JSON.stringify(await kit.sign({ Message: complaint(["angry@complain.test"]) })), env, d);
  assertEquals(added.map((s) => [s.email, s.reason]), [["gone@bounce.test", "bounce"], ["angry@complain.test", "complaint"]]);
});

Deno.test("suppression lookup reads the table for just these addresses", async () => {
  let asked: string[] = [];
  const db = { from: (t: string) => ({ select: () => ({ in: (_c: string, list: string[]) => { asked = list; assertEquals(t, "email_suppressions"); return Promise.resolve({ data: [{ email: "gone@bounce.test" }], error: null }); } }) }) };
  assertEquals([...await suppressedIn(db)(["Gone@Bounce.test", "ok@fine.test", "ok@fine.test"])], ["gone@bounce.test"]);
  assertEquals(asked, ["gone@bounce.test", "ok@fine.test"]);
});

Deno.test("received: a verified notification hands on the mail, for Odelia's addresses by the envelope", async () => {
  const kit = await snsKit();
  const { d } = deps(kit);
  const raw = "From: Mei Chen <mei@goldenox.com>\r\nTo: odelia@in.placetta.com\r\nSubject: When is it due?\r\nMessage-ID: <q1@goldenox.com>\r\n\r\nWhen is the health permit due?\r\n";
  const r = await routeSns(JSON.stringify(await kit.sign({ Message: JSON.stringify(received(raw)) })), env, d);
  assertEquals([r.status, r.mail?.from, r.mail?.to, r.mail?.subject, r.mail?.text, r.mail?.auth.provider], [200, "mei@goldenox.com", ["odelia@in.placetta.com"], "When is it due?", "When is the health permit due?", "ses"]);
  // inbound needs ODELIA_EMAIL; bounces don't
  const off = await routeSns(JSON.stringify(await kit.sign({ Message: JSON.stringify(received(raw)) })), sesEnv({ ODELIA_EMAIL: "" }), d);
  assertEquals([off.status, off.mail], [503, undefined]);
});

Deno.test("received over 150 KB: the message is read from our own S3 bucket, signed; never from a bucket the notification names", async () => {
  const kit = await snsKit();
  const raw = "From: mei@goldenox.com\r\nSubject: big\r\nMessage-ID: <big@goldenox.com>\r\n\r\nlarge scan attached\r\n";
  const calls: { url: string; auth: string; sha: string }[] = [];
  const f = ((url: string, init: RequestInit = {}) => { const h = new Headers(init.headers); calls.push({ url, auth: h.get("authorization") ?? "", sha: h.get("x-amz-content-sha256") ?? "" }); return Promise.resolve(new Response(raw)); }) as unknown as typeof fetch;
  const note = (bucket: string, key = "inbound/abc123") => JSON.stringify({ ...received(""), content: undefined, receipt: { ...received("").receipt, action: { type: "S3", topicArn: TOPIC, bucketName: bucket, objectKeyPrefix: "inbound/", objectKey: key } } });
  const { d } = deps(kit, f);
  const s3env = sesEnv({ AWS_SES_S3_BUCKET: "placetta-inbound" });
  const r = await routeSns(JSON.stringify(await kit.sign({ Message: note("placetta-inbound") })), s3env, d);
  assertEquals([r.status, r.mail?.text], [200, "large scan attached"]);
  assertEquals(calls[0].url, "https://placetta-inbound.s3.us-east-1.amazonaws.com/inbound/abc123");
  assert(/Credential=AKIDTEST\/\d{8}\/us-east-1\/s3\/aws4_request/.test(calls[0].auth) && /^[0-9a-f]{64}$/.test(calls[0].sha));
  // another bucket, or no bucket configured: nothing is fetched
  const other = await routeSns(JSON.stringify(await kit.sign({ Message: note("someone-elses-bucket") })), s3env, d);
  const none = await routeSns(JSON.stringify(await kit.sign({ Message: note("placetta-inbound") })), env, d);
  assertEquals([other.mail, none.mail, calls.length], [undefined, undefined, 1]);
});

Deno.test("subscription confirmation for our topic: confirmed once, by GET to SNS", async () => {
  const kit = await snsKit();
  const got: string[] = [];
  const f = ((u: string) => { got.push(u); return Promise.resolve(new Response("ok")); }) as unknown as typeof fetch;
  const { d } = deps(kit, f);
  const url = `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=t1`;
  const r = await routeSns(JSON.stringify(await kit.sign({ Type: "SubscriptionConfirmation", Token: "t1", SubscribeURL: url })), env, d);
  assertEquals([r.status, r.body.confirmed, got], [200, true, [url]]);
});

Deno.test("forged SNS posts do nothing: no suppression, no mail, no confirmation", async () => {
  const kit = await snsKit();
  const got: string[] = [];
  const f = ((u: string) => { got.push(u); return Promise.resolve(new Response("ok")); }) as unknown as typeof fetch;
  const { added, d } = deps(kit, f);
  const raw = "From: ceo@placetta.com\r\nSubject: wire it\r\nMessage-ID: <f@x>\r\n\r\nPay the invoice.\r\n";
  // unsigned, tampered, a foreign topic (signed for real), a cert from elsewhere
  const signed = await kit.sign({ Message: bounce("Permanent", ["customer@goldenox.com"]) });
  const posts = [
    JSON.stringify({ ...signed, Signature: "" }),
    JSON.stringify({ ...signed, Message: bounce("Permanent", ["everyone@goldenox.com"]) }),
    JSON.stringify(await kit.sign({ TopicArn: "arn:aws:sns:us-east-1:999999999999:attacker", Message: bounce("Permanent", ["customer@goldenox.com"]) })),
    JSON.stringify(await kit.sign({ SigningCertURL: "https://evil.com/SimpleNotificationService-x.pem", Message: JSON.stringify(received(raw)) })),
    JSON.stringify(await kit.sign({ TopicArn: "arn:aws:sns:us-east-1:999999999999:attacker", Type: "SubscriptionConfirmation", Token: "t", SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=x" })),
    "not json",
  ];
  for (const p of posts) {
    const r = await routeSns(p, env, d);
    assertEquals([r.status, r.mail], [403, undefined], p.slice(0, 80));
  }
  assertEquals([added.length, got.length], [0, 0]);
});
