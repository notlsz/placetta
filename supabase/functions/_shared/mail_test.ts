// Run: deno test supabase/functions/_shared/mail_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { addressOf, fetchResend, isForward, mailBody, parsePostmark, postmarkAuthOk, replySubject, sendMail, senderVerified, stripQuoted } from "./mail.ts";
import { dkimAligned, joinTxt, type TxtLookup, verifyDkim } from "./dkim.ts";

Deno.test("addresses", () => {
  assertEquals(addressOf('"Mei Chen" <Mei@GoldenOx.com>'), "mei@goldenox.com");
  assertEquals(addressOf("ops@placetta.test"), "ops@placetta.test");
  assertEquals(addressOf("nobody"), "");
});

/* ------------------------------ who really sent it ------------------------------ */

const CRLF = (lines: string[]) => lines.join("\r\n");
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
/** DNS for the tests: a fixed set of TXT records, and a count of lookups. */
function dns(records: Record<string, string>): TxtLookup & { asked: string[] } {
  const asked: string[] = [];
  const f = (async (name: string) => { asked.push(name); return name in records ? [records[name]] : []; }) as TxtLookup & { asked: string[] };
  f.asked = asked;
  return f;
}

// RFC 8463, Appendix A: a message with an Ed25519 and an RSA signature, and the keys' DNS records. An independent
// check that our canonicalization matches everyone else's.
const RFC_ED = CRLF([
  "DKIM-Signature: v=1; a=ed25519-sha256; c=relaxed/relaxed;", " d=football.example.com; i=@football.example.com;",
  " q=dns/txt; s=brisbane; t=1528637909; h=from : to :", " subject : date : message-id : from : subject : date;",
  " bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;", " b=/gCrinpcQOoIfuHNQIbq4pgh9kyIK3AQUdt9OdqQehSwhEIug4D11Bus", " Fa3bT3FY5OsU7ZbnKELq+eXdp1Q1Dw==",
]);
const RFC_RSA = CRLF([
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;", " d=football.example.com; i=@football.example.com;",
  " q=dns/txt; s=test; t=1528637909; h=from : to : subject :", " date : message-id : from : subject : date;",
  " bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;", " b=F45dVWDfMbQDGHJFlXUNB2HKfbCeLRyhDXgFpEL8GwpsRe0IeIixNTe3",
  " DhCVlUrSjV4BwcVcOF6+FF3Zo9Rpo1tFOeS9mPYQTnGdaSGsgeefOsk2Jz", " dA+L10TeYt9BgDfQNZtKdN1WO//KgIqXP7OdEFE4LjFYNcUxZQ4FADY+8=",
]);
const RFC_REST = CRLF([
  "From: Joe SixPack <joe@football.example.com>", "To: Suzie Q <suzie@shopping.example.net>", "Subject: Is dinner ready?",
  "Date: Fri, 11 Jul 2003 21:00:37 -0700 (PDT)", "Message-ID: <20030712040037.46341.5F8J@football.example.com>", "",
  "Hi.", "", "We lost the game.  Are you hungry yet?", "", "Joe.", "",
]);
const RFC_DNS = {
  "brisbane._domainkey.football.example.com": joinTxt('"v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="'),
  "test._domainkey.football.example.com": joinTxt('"v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWR" "iGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/J16JYi0Qvx/byYzCNb3W91y3FutAC" "DfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3" "Ip3G+2kryOTIKT+l/K4w3QIDAQAB"'),
};
const RFC_FROM = "joe@football.example.com";

Deno.test("DKIM: RFC 8463's signed message verifies, Ed25519 and RSA alike", async () => {
  const txt = dns(RFC_DNS);
  assertEquals(await verifyDkim(RFC_ED + "\r\n" + RFC_REST, RFC_FROM, { txt }), { ok: true, why: "dkim_pass", domain: "football.example.com" });
  assertEquals(await verifyDkim(RFC_RSA + "\r\n" + RFC_REST, RFC_FROM, { txt }), { ok: true, why: "dkim_pass", domain: "football.example.com" });
  // bare LF line ends, as some JSON payloads carry them, are the same message
  assert((await verifyDkim((RFC_RSA + "\r\n" + RFC_REST).replace(/\r\n/g, "\n"), RFC_FROM, { txt })).ok);
  assertEquals(txt.asked, ["brisbane._domainkey.football.example.com", "test._domainkey.football.example.com", "test._domainkey.football.example.com"]);
});

Deno.test("DKIM: any change to what was signed, or a From the signature doesn't vouch for, fails", async () => {
  const txt = dns(RFC_DNS);
  const msg = RFC_RSA + "\r\n" + RFC_REST;
  assertEquals((await verifyDkim(msg.replace("We lost the game.", "We won the game."), RFC_FROM, { txt })).why, "body_changed");
  assertEquals((await verifyDkim(msg.replace("Is dinner ready?", "Pay invoice 4411"), RFC_FROM, { txt })).why, "bad_signature");
  assertEquals((await verifyDkim(msg, "mei@goldenox.com", { txt })).why, "from_mismatch", "the From the provider parsed must be the one signed");
  // a second From header: the signature covers the bottom one, a mail app shows the top one
  assertEquals((await verifyDkim("From: Mei <mei@football.example.com>\r\n" + msg, "mei@football.example.com", { txt })).why, "several_from_headers");
  assertEquals((await verifyDkim(msg.replace("From: Joe SixPack <joe@football.example.com>", "From: joe@football.example.com, mei@evil.com"), RFC_FROM, { txt })).why, "from_mismatch");
  // the key is gone, or DNS can't be reached: fail closed
  assertEquals((await verifyDkim(msg, RFC_FROM, { txt: dns({}) })).ok, false);
  assertEquals((await verifyDkim(msg, RFC_FROM, { txt: async () => null })).why, "dns_failed");
  // a revoked key (empty p=)
  assertEquals((await verifyDkim(msg, RFC_FROM, { txt: dns({ "test._domainkey.football.example.com": "v=DKIM1; k=rsa; p=" }) })).why, "no_key");
  // expired (x=)
  const expiring = msg.replace("t=1528637909;", "t=1528637909; x=1528637999;");
  assertEquals((await verifyDkim(expiring, RFC_FROM, { txt, now: 1700000000000 })).why, "expired");
});

/** Signs a message the way a sender's mail server would, with relaxed or simple canonicalization. */
async function signMail(o: { headers: string[]; body: string; d: string; s: string; keys: CryptoKeyPair; algo: "rsa" | "ed25519"; c?: "relaxed/relaxed" | "simple/simple"; h?: string[]; extra?: string }) {
  const relaxed = (o.c ?? "relaxed/relaxed") === "relaxed/relaxed";
  const body = relaxed
    ? o.body.split("\r\n").map((l) => l.replace(/[ \t]+/g, " ").replace(/ $/, "")).join("\r\n").replace(/(\r\n)*$/, "") + "\r\n"
    : o.body.replace(/(\r\n)*$/, "") + "\r\n";
  const bh = b64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
  const h = o.h ?? ["from", "to", "subject", "date"];
  const canon = (line: string) => {
    if (!relaxed) return line;
    const i = line.indexOf(":");
    return line.slice(0, i).trim().toLowerCase() + ":" + line.slice(i + 1).replace(/\r\n(?=[ \t])/g, "").replace(/[ \t]+/g, " ").trim();
  };
  const pick = h.map((n) => [...o.headers].reverse().find((l) => l.slice(0, l.indexOf(":")).trim().toLowerCase() === n)).filter((l): l is string => !!l);
  const sigNoB = `DKIM-Signature: v=1; a=${o.algo === "rsa" ? "rsa-sha256" : "ed25519-sha256"}; c=${o.c ?? "relaxed/relaxed"}; d=${o.d}; s=${o.s};${o.extra ?? ""}\r\n h=${h.join(":")}; bh=${bh}; b=`;
  const data = new TextEncoder().encode(pick.map((l) => canon(l) + "\r\n").join("") + canon(sigNoB));
  const sig = o.algo === "rsa"
    ? await crypto.subtle.sign("RSASSA-PKCS1-v1_5", o.keys.privateKey, data)
    : await crypto.subtle.sign("Ed25519", o.keys.privateKey, await crypto.subtle.digest("SHA-256", data));
  return CRLF([sigNoB + b64(sig), ...o.headers, "", o.body]);
}
const rsaKeys = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
const edKeys = () => crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
const rsaRecord = async (k: CryptoKeyPair) => `v=DKIM1; k=rsa; p=${b64(await crypto.subtle.exportKey("spki", k.publicKey))}`;
const edRecord = async (k: CryptoKeyPair) => `v=DKIM1; k=ed25519; p=${b64(await crypto.subtle.exportKey("raw", k.publicKey))}`;
const MEI = ["From: Mei Chen <mei@goldenox.com>", "To: odelia@placetta.com", "Subject: Renew our permit", "Date: Fri, 16 Oct 2026 09:00:00 -0700", "Message-ID: <a1@goldenox.com>"];
const BODY = "Please renew the health permit.  \r\n\r\nMei\r\n\r\n";

Deno.test("DKIM: a mail signed by the From domain passes, in both canonicalizations and both algorithms", async () => {
  const rsa = await rsaKeys(), ed = await edKeys();
  const txt = dns({ "s1._domainkey.goldenox.com": await rsaRecord(rsa), "s2._domainkey.goldenox.com": await edRecord(ed) });
  for (const c of ["relaxed/relaxed", "simple/simple"] as const) {
    assert((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s1", keys: rsa, algo: "rsa", c }), "mei@goldenox.com", { txt })).ok, c + " rsa");
    assert((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s2", keys: ed, algo: "ed25519", c }), "mei@goldenox.com", { txt })).ok, c + " ed25519");
  }
  // signed by a parent of the From domain: aligned
  const sub = MEI.map((l) => l.replace("mei@goldenox.com", "mei@mail.goldenox.com"));
  assert((await verifyDkim(await signMail({ headers: sub, body: BODY, d: "goldenox.com", s: "s1", keys: rsa, algo: "rsa" }), "mei@mail.goldenox.com", { txt })).ok);
});

Deno.test("DKIM: a valid signature by someone else's domain, a partial body, or an unsigned From doesn't count", async () => {
  const rsa = await rsaKeys();
  const record = await rsaRecord(rsa);
  const txt = dns({ "s1._domainkey.evil.com": record, "s1._domainkey.goldenox.com": record, "s1._domainkey.x.goldenox.com": record, "s1._domainkey.com": record });
  const from = "mei@goldenox.com";
  // the attacker's own domain, with a perfectly good signature
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "evil.com", s: "s1", keys: rsa, algo: "rsa" }), from, { txt })).ok, false);
  // a subdomain under the From domain, which someone else may control
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "x.goldenox.com", s: "s1", keys: rsa, algo: "rsa" }), from, { txt })).ok, false);
  // a bare top-level domain
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "com", s: "s1", keys: rsa, algo: "rsa" }), from, { txt })).ok, false);
  // l=: anything could follow the signed part
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s1", keys: rsa, algo: "rsa", extra: " l=10;" }), from, { txt })).why, "partial_body");
  // From not among the signed headers
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s1", keys: rsa, algo: "rsa", h: ["to", "subject"] }), from, { txt })).why, "from_not_signed");
  // an RSA key under 1024 bits
  const weak = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 512, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  assertEquals((await verifyDkim(await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s1", keys: weak, algo: "rsa" }), from, { txt: dns({ "s1._domainkey.goldenox.com": await rsaRecord(weak) }) })).why, "bad_key");
  assert(dkimAligned("goldenox.com", from) && dkimAligned("goldenox.com", "a@mail.goldenox.com"));
  assert(!dkimAligned("mail.goldenox.com", from) && !dkimAligned("com", from) && !dkimAligned("oldenox.com", from) && !dkimAligned("goldenox.com.evil.com", from));
});

const FORGED = ["Authentication-Results: mx.postmarkapp.com; dkim=pass header.d=goldenox.com; spf=pass smtp.mailfrom=goldenox.com; dmarc=pass header.from=goldenox.com",
  "Authentication-Results: mx; dmarc=pass", "ARC-Authentication-Results: i=1; mx.google.com; dmarc=pass header.from=goldenox.com", "X-Spam-Tests: DKIM_SIGNED,DKIM_VALID,DKIM_VALID_AU,SPF_PASS", "X-Spam-Status: No"];

Deno.test("Postmark: headers the sender wrote never verify anything; only a DKIM signature on the raw message does", async () => {
  const rsa = await rsaKeys();
  const txt = dns({ "s1._domainkey.goldenox.com": await rsaRecord(rsa) });
  const base = { MessageID: "pm-9", FromFull: { Email: "mei@goldenox.com", Name: "Mei Chen" }, To: "odelia@placetta.com", Subject: "Renew our permit", TextBody: "Please renew." };
  // injected Authentication-Results (with and without header.from), ARC and Postmark-style spam headers, both in the
  // parsed headers and in the raw message, on an unsigned mail
  const forged = parsePostmark({ ...base, Headers: [{ Name: "Message-ID", Value: "<a1@goldenox.com>" }, ...FORGED.map((l) => ({ Name: l.slice(0, l.indexOf(":")), Value: l.slice(l.indexOf(":") + 2) }))],
    RawEmail: CRLF([...FORGED, ...MEI, "", "Please renew."]) })!;
  assertEquals(await senderVerified(forged, { txt }), { ok: false, why: "postmark_unsigned" });
  // the same headers without the raw message: Postmark's RawEmailEnabled is off, so nothing can be verified
  const noRaw = parsePostmark({ ...base, Headers: FORGED.map((l) => ({ Name: l.slice(0, l.indexOf(":")), Value: l.slice(l.indexOf(":") + 2) })) })!;
  assertEquals(await senderVerified(noRaw, { txt }), { ok: false, why: "postmark_raw_missing" });
  // a forged From with the attacker's own valid signature
  const evil = await rsaKeys();
  const spoof = parsePostmark({ ...base, RawEmail: await signMail({ headers: [...FORGED, ...MEI], body: BODY, d: "evil.com", s: "s1", keys: evil, algo: "rsa" }) })!;
  assertEquals((await senderVerified(spoof, { txt: dns({ "s1._domainkey.evil.com": await rsaRecord(evil) }) })).ok, false);
  // the real thing
  const real = parsePostmark({ ...base, RawEmail: await signMail({ headers: MEI, body: BODY, d: "goldenox.com", s: "s1", keys: rsa, algo: "rsa" }) })!;
  assertEquals(await senderVerified(real, { txt }), { ok: true, why: "postmark_dkim_pass" });
  // Postmark's FromFull must be the signed From
  assertEquals((await senderVerified({ ...real, from: "boss@goldenox.com" }, { txt })).ok, false);
});

Deno.test("Resend: only Resend's own authentication result counts, never the headers", async () => {
  const from = "mei@goldenox.com";
  const ok = (result: unknown) => senderVerified({ from, auth: { provider: "resend", result: result as never } });
  assertEquals(await ok({ spf: "pass", dkim: "pass", dmarc: "pass" }), { ok: true, why: "resend_dmarc_pass" });
  assertEquals(await ok({ spf: "fail", dkim: "pass", dmarc: "gray" }), { ok: true, why: "resend_dkim_pass" });
  assertEquals((await ok({ spf: "pass", dkim: "gray", dmarc: "gray" })).ok, false, "SPF alone");
  assertEquals((await ok({ spf: "pass", dkim: "fail", dmarc: "fail" })).ok, false);
  assertEquals((await ok(null)).why, "resend_no_auth", "mail from before Resend reported it");
  assertEquals((await senderVerified({ from: "", auth: { provider: "resend", result: { dmarc: "pass" } } })).ok, false);
  assertEquals((await senderVerified({ from } as never)).ok, false, "no provider result at all");
});

Deno.test("Postmark: basic auth, parsing, the stripped reply, a forward kept whole, attachments", async () => {
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
  // an Authentication-Results header in the parsed headers proves nothing, and without RawEmail nothing is verified
  assertEquals(m.auth, { provider: "postmark", raw: null });
  assertEquals((await senderVerified(m, { txt: async () => { throw new Error("no lookup expected"); } })).ok, false);
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
      html: null, headers: { "authentication-results": "mx; dmarc=pass header.from=goldenox.com", "message-id": "<abc@goldenox.com>" }, message_id: "<abc@goldenox.com>", attachments: [{ id: "a1", filename: "p.pdf", size: 8, content_type: "application/pdf" }],
      authentication: { spf: "pass", dkim: "pass", dmarc: "pass" } },
    "/emails/receiving/em_2": { object: "email", id: "em_2", from: "mei@goldenox.com", to: ["odelia@placetta.com"], subject: "Pay this", text: "x",
      headers: { "authentication-results": "mx.resend.com; dkim=pass header.d=goldenox.com; dmarc=pass header.from=goldenox.com", "arc-authentication-results": "i=1; dmarc=pass", "x-spam-tests": "DKIM_VALID_AU" },
      authentication: { spf: "softfail", dkim: "gray", dmarc: "fail" } },
    "/emails/receiving/em_1/attachments": { object: "list", has_more: false, data: [{ id: "a1", filename: "p.pdf", size: 8, content_type: "application/pdf", content_disposition: "attachment", download_url: "https://cdn.resend.test/a1", expires_at: "x" }, { id: "a2", filename: "logo.png", size: 3, content_type: "image/png", content_disposition: "inline", download_url: "https://cdn.resend.test/a2", expires_at: "x" }] },
  });
  const m = (await fetchResend(env, { type: "email.received", data: { email_id: "em_1" } }, f))!;
  assertEquals([m.id, m.from, m.name, m.subject, m.text, m.files.map((x) => x.name)], ["mail:<abc@goldenox.com>", "mei@goldenox.com", "Mei Chen", "Question", "When is it due?", ["p.pdf"]]);
  assertEquals(await senderVerified(m), { ok: true, why: "resend_dmarc_pass" });
  // a spoof carrying every header that used to pass: Resend's own result says no, so it's no
  const spoof = (await fetchResend(env, { type: "email.received", data: { email_id: "em_2" } }, f))!;
  assertEquals(await senderVerified(spoof), { ok: false, why: "resend_not_passed" });
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
