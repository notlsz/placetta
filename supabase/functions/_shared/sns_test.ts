// Run: deno test supabase/functions/_shared/sns_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { confirmSubscription, pemToDer, readCert, snsUrlOk, stringToSign, verifySns } from "./sns.ts";
import { CERT_URL, sesEnv, snsKit, TOPIC } from "./sns_testkit.ts";

const env = sesEnv();

Deno.test("SNS: a notification signed by the topic's certificate verifies; the cert comes only from the pinned URL", async () => {
  const kit = await snsKit();
  const msg = await kit.sign({ Message: '{"notificationType":"Received"}', Subject: "Amazon SES Email Receipt Notification" });
  const r = await verifySns(JSON.stringify(msg), env, { fetchCert: kit.fetchCert });
  assert(r.ok);
  assertEquals(kit.fetched, [CERT_URL]);
  // and without a Subject (SES's notifications often have none)
  assert((await verifySns(JSON.stringify(await kit.sign({ Message: "{}" })), env, { fetchCert: kit.fetchCert })).ok);
});

Deno.test("SNS: the string to sign follows AWS's field order for each type", () => {
  const base = { MessageId: "m", TopicArn: TOPIC, Message: "hi", Timestamp: "2026-10-27T00:00:00.000Z", SignatureVersion: "2", Signature: "", SigningCertURL: CERT_URL };
  assertEquals(stringToSign({ ...base, Type: "Notification", Subject: "S" }), `Message\nhi\nMessageId\nm\nSubject\nS\nTimestamp\n2026-10-27T00:00:00.000Z\nTopicArn\n${TOPIC}\nType\nNotification\n`);
  assertEquals(stringToSign({ ...base, Type: "SubscriptionConfirmation", Token: "t", SubscribeURL: "u" }), `Message\nhi\nMessageId\nm\nSubscribeURL\nu\nTimestamp\n2026-10-27T00:00:00.000Z\nToken\nt\nTopicArn\n${TOPIC}\nType\nSubscriptionConfirmation\n`);
  assertEquals(stringToSign({ ...base, Type: "SubscriptionConfirmation" }), null, "a confirmation without its token");
  assertEquals(stringToSign({ ...base, Type: "Whatever" }), null);
});

Deno.test("SNS: forged, tampered and replayed messages are refused", async () => {
  const kit = await snsKit();
  const msg = await kit.sign({ Message: '{"notificationType":"Bounce"}' });
  // a word changed after signing
  assertEquals(await verifySns(JSON.stringify({ ...msg, Message: '{"notificationType":"Received"}' }), env, { fetchCert: kit.fetchCert }), { ok: false, why: "bad_signature" });
  // signed by someone else's key, served under SNS's name
  const other = await snsKit();
  const forged = await snsKit({ keys: kit.keys, signer: other.keys });
  assertEquals((await verifySns(JSON.stringify(await forged.sign({})), env, { fetchCert: kit.fetchCert })).why, "bad_signature");
  // SHA-1 (SignatureVersion 1) is not accepted
  assertEquals((await verifySns(JSON.stringify({ ...msg, SignatureVersion: "1" }), env, { fetchCert: kit.fetchCert })).why, "signature_version");
  // a week-old message, and one from the future
  assertEquals((await verifySns(JSON.stringify(await kit.sign({ Timestamp: new Date(Date.now() - 7 * 86400_000).toISOString() })), env, { fetchCert: kit.fetchCert })).why, "stale");
  assertEquals((await verifySns(JSON.stringify(await kit.sign({ Timestamp: new Date(Date.now() + 3600_000).toISOString() })), env, { fetchCert: kit.fetchCert })).why, "stale");
  // not JSON, not SNS
  assertEquals((await verifySns("hello", env)).why, "not_json");
  assertEquals((await verifySns('{"Type":"Notification"}', env)).why, "not_sns");
});

Deno.test("SNS: a certificate URL anywhere but https://sns.<our region>.amazonaws.com/*.pem is never fetched", async () => {
  const kit = await snsKit();
  for (const url of [
    "https://sns.us-east-1.amazonaws.com.evil.com/SimpleNotificationService-x.pem",
    "https://evil.com/sns.us-east-1.amazonaws.com/x.pem",
    "http://sns.us-east-1.amazonaws.com/SimpleNotificationService-x.pem",
    "https://sns.us-west-2.amazonaws.com/SimpleNotificationService-x.pem",
    "https://s3.amazonaws.com/my-bucket/cert.pem",
    "https://sns.us-east-1.amazonaws.com:8443/SimpleNotificationService-x.pem",
    "https://user@sns.us-east-1.amazonaws.com/SimpleNotificationService-x.pem",
    "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-x.pem?redirect=https://evil.com/x.pem",
    "https://sns.us-east-1.amazonaws.com/../evil/x.txt",
    "not a url",
  ]) {
    const msg = await kit.sign({ SigningCertURL: url });
    assertEquals((await verifySns(JSON.stringify(msg), env, { fetchCert: kit.fetchCert })).why, "cert_url", url);
  }
  assertEquals(kit.fetched, [], "nothing was fetched");
  assert(snsUrlOk(CERT_URL, "us-east-1", "cert"));
  // AWS_SES_REGION moves the pin with it
  assert(snsUrlOk("https://sns.eu-west-1.amazonaws.com/SimpleNotificationService-x.pem", "eu-west-1", "cert"));
});

Deno.test("SNS: a perfectly signed message from a topic that isn't ours is refused", async () => {
  const kit = await snsKit();
  const theirs = await kit.sign({ TopicArn: "arn:aws:sns:us-east-1:999999999999:attacker", Message: '{"notificationType":"Bounce"}' });
  assertEquals((await verifySns(JSON.stringify(theirs), env, { fetchCert: kit.fetchCert })).why, "foreign_topic");
  // and with no topics configured, nothing at all is accepted
  assertEquals((await verifySns(JSON.stringify(await kit.sign({})), sesEnv({ AWS_SES_SNS_TOPIC_ARNS: "" }), { fetchCert: kit.fetchCert })).why, "no_topics_configured");
});

Deno.test("SNS: the certificate must be in date and name SNS", async () => {
  const expired = await snsKit({ notBefore: new Date("2020-01-01"), notAfter: new Date("2021-01-01") });
  assertEquals((await verifySns(JSON.stringify(await expired.sign({})), env, { fetchCert: expired.fetchCert })).why, "cert_expired");
  const notSns = await snsKit({ cn: "evil.com", sans: ["evil.com"] });
  assertEquals((await verifySns(JSON.stringify(await notSns.sign({})), env, { fetchCert: notSns.fetchCert })).why, "cert_not_sns");
  const bySan = await snsKit({ cn: "Amazon", sans: ["sns.us-east-1.amazonaws.com"] });
  assert((await verifySns(JSON.stringify(await bySan.sign({})), env, { fetchCert: bySan.fetchCert })).ok);
  const c = readCert(pemToDer(bySan.pem));
  assertEquals(c.names, ["amazon", "sns.us-east-1.amazonaws.com"]);
  const junk = await snsKit();
  assert(/^cert_error/.test(String((await verifySns(JSON.stringify(await junk.sign({})), env, { fetchCert: () => Promise.resolve("<html>not a cert</html>") })).why)));
});

Deno.test("SNS: our own subscription is confirmed by a GET to the pinned host; anything else isn't", async () => {
  const kit = await snsKit();
  const calls: string[] = [];
  const f = ((u: string) => { calls.push(u); return Promise.resolve(new Response("<ok/>")); }) as unknown as typeof fetch;
  const url = `https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${encodeURIComponent(TOPIC)}&Token=abc`;
  const msg = await kit.sign({ Type: "SubscriptionConfirmation", Token: "abc", SubscribeURL: url, Message: "You have chosen to subscribe" });
  const v = await verifySns(JSON.stringify(msg), env, { fetchCert: kit.fetchCert });
  assert(v.ok);
  assert(await confirmSubscription(msg, env, f));
  assertEquals(calls, [url]);
  // a confirmation URL elsewhere, or for another topic, is never visited
  assertEquals(await confirmSubscription({ ...msg, SubscribeURL: "https://evil.com/?Action=ConfirmSubscription" }, env, f), false);
  assertEquals(await confirmSubscription({ ...msg, SubscribeURL: url.replace("placetta-mail", "other") }, env, f), false);
  assertEquals(await confirmSubscription({ ...msg, TopicArn: "arn:aws:sns:us-east-1:999999999999:attacker" }, env, f), false);
  assertEquals(calls.length, 1);
});
