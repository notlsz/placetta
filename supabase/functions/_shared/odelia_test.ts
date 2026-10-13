// deno test supabase/functions/_shared/odelia_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import {
  appLink, b64bytes, clientState, inboundFlood, inQuietHours, keyword, LIMITS, localDay, localMinutes, noticeText, normalizePhone, pickWorkspace, plainText,
  prettyPhone, randomCode, readClientState, sendSms, signCallToken, splitSms, spokenDigits, strangerMayGetReply, switchTarget, textLimit, underDailyLimit,
  urgency, verifyCallToken, verifyTelnyx, workspaceBrief,
} from "./odelia.ts";

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

/* ------------------------------ signatures ------------------------------ */

async function signer() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = b64(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
  const sign = async (ts: string, body: string) => b64(new Uint8Array(await crypto.subtle.sign("Ed25519", kp.privateKey, new TextEncoder().encode(`${ts}|${body}`))));
  return { pub, sign };
}

Deno.test("signature: a webhook Telnyx signed passes", async () => {
  const { pub, sign } = await signer();
  const now = 1_760_000_000, ts = String(now), body = '{"data":{"event_type":"message.received"}}';
  assert(await verifyTelnyx(body, await sign(ts, body), ts, pub, now));
});

Deno.test("signature: a changed body, a wrong key or a missing header fails", async () => {
  const a = await signer(), other = await signer();
  const now = 1_760_000_000, ts = String(now), body = '{"data":{"payload":{"text":"hi"}}}';
  const sig = await a.sign(ts, body);
  assert(!(await verifyTelnyx(body.replace("hi", "file it"), sig, ts, a.pub, now)), "tampered body");
  assert(!(await verifyTelnyx(body, sig, ts, other.pub, now)), "someone else's key");
  assert(!(await verifyTelnyx(body, "", ts, a.pub, now)), "no signature");
  assert(!(await verifyTelnyx(body, sig, ts, "", now)), "no public key configured");
  assert(!(await verifyTelnyx(body, "not base64!!", ts, a.pub, now)), "garbage signature");
});

Deno.test("signature: an old or future timestamp is refused (replay)", async () => {
  const { pub, sign } = await signer();
  const now = 1_760_000_000, body = "{}";
  const old = String(now - 301), soon = String(now + 301), fine = String(now - 299);
  assert(!(await verifyTelnyx(body, await sign(old, body), old, pub, now)));
  assert(!(await verifyTelnyx(body, await sign(soon, body), soon, pub, now)));
  assert(await verifyTelnyx(body, await sign(fine, body), fine, pub, now));
  assert(!(await verifyTelnyx(body, await sign("abc", body), "abc", pub, now)));
});

Deno.test("signature: url-safe and padded base64 keys both work", () => {
  const bytes = new Uint8Array([251, 255, 0, 62, 63]);
  assertEquals([...b64bytes(btoa(String.fromCharCode(...bytes)))], [...bytes]);
  assertEquals([...b64bytes(btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""))], [...bytes]);
});

/* ------------------------------ keywords ------------------------------ */

Deno.test("keywords: carrier opt-out, opt-in and help words, alone and in any case", () => {
  for (const w of ["STOP", "stop", " Stop. ", "STOPALL", "stop all", "UNSUBSCRIBE", "cancel", "END", "quit", "退订"]) assertEquals(keyword(w), "stop", w);
  for (const w of ["START", "unstop", "Start!"]) assertEquals(keyword(w), "start", w);
  for (const w of ["HELP", "help?", "Info", "帮助"]) assertEquals(keyword(w), "help", w);
});

Deno.test("keywords: a sentence that contains one still goes to Odelia", () => {
  for (const w of ["stop the renewal", "Can you help me with my permit?", "yes", "cancel my health permit application", "", "end of month taxes"]) assertEquals(keyword(w), null, w);
  assertEquals(keyword(undefined), null);
});

Deno.test("switching workspaces by text", () => {
  assertEquals(switchTarget("switch to Dumpling House"), "Dumpling House");
  assertEquals(switchTarget("Switch Noodle Bar."), "Noodle Bar");
  assertEquals(switchTarget("切换到 饺子馆"), "饺子馆");
  assertEquals(switchTarget("what's due this week?"), null);
  const list = [{ id: "a", name: "Dumpling House" }, { id: "b", name: "Dumpling House Oakland" }, { id: "c", name: "Noodle Bar" }];
  assertEquals(pickWorkspace(list, "dumpling house")?.id, "a", "exact beats partial");
  assertEquals(pickWorkspace(list, "noodle")?.id, "c");
  assertEquals(pickWorkspace(list, "house"), null, "ambiguous");
  assertEquals(pickWorkspace(list, "pizza"), null);
});

/* ------------------------------ message splitting ------------------------------ */

Deno.test("plain text: markdown, lists and em dashes go", () => {
  const s = plainText("**Done.** I filed nothing yet.\n\n- Health permit: ready\n- Seller's permit — waiting\n\n[County](https://sccgov.org) says `30 days`.");
  assert(!/[*_`#—]/.test(s), s);
  assert(s.includes("Health permit: ready."), s);
  assert(s.includes("Seller's permit, waiting"), s);
  assert(s.includes("County (https://sccgov.org)"), s);
});

Deno.test("splitting: a short reply is one text", () => {
  assertEquals(splitSms("Your health permit renews March 3. I added it to your deadlines."), ["Your health permit renews March 3. I added it to your deadlines."]);
});

Deno.test("splitting: a long reply is at most three texts, between sentences, each within the limit", () => {
  const sentence = (i: number) => `Sentence number ${i} explains one requirement of the county health department in some detail.`;
  const text = Array.from({ length: 6 }, (_, i) => sentence(i + 1)).join(" ");
  const segs = splitSms(text);
  assert(segs.length >= 2 && segs.length <= 3, String(segs.length));
  for (const s of segs) assert(s.length <= 306, String(s.length));
  assert(segs.every((s) => /[.]$/.test(s)), "ends at sentence boundaries");
});

Deno.test("splitting: too long for three texts ends with a link to the app, and the approval link always survives", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Point ${i} about the permit and its many conditions.`).join(" ");
  const segs = splitSms(text, { max: 3, more: "https://app.placetta.com/app/?ws=1", tail: "Approve in the app: https://app.placetta.com/app/?ws=1&approval=a1" });
  assertEquals(segs.length, 3);
  for (const s of segs) assert(s.length <= 306, String(s.length));
  assert(segs[2].includes("More: https://app.placetta.com/app/?ws=1"), segs[2]);
  assert(segs[2].endsWith("approval=a1"), segs[2]);
});

Deno.test("splitting: Chinese uses the shorter limit and still splits between sentences", () => {
  const text = "您的卫生许可证将于三月三日到期。我已经把续期加入截止日期。".repeat(8);
  assertEquals(textLimit(text), 134);
  const segs = splitSms(text, { lang: "zh" });
  assert(segs.length <= 3);
  for (const s of segs) assert(s.length <= 134, String(s.length));
  assert(segs[0].endsWith("。"), segs[0]);
});

Deno.test("splitting: one word longer than a text is cut, not dropped", () => {
  const segs = splitSms("x".repeat(500), { max: 3 });
  assert(segs.join("").replace(/\s/g, "").length >= 500);
});

/* ------------------------------ quiet hours and limits ------------------------------ */

Deno.test("quiet hours: 9pm to 8am in their own time zone, across midnight", () => {
  const la = "America/Los_Angeles";
  // 2026-10-13T04:30Z is 9:30pm in Los Angeles (PDT): quiet. 15:30Z is 8:30am: not quiet.
  assert(inQuietHours(new Date("2026-10-13T04:30:00Z"), la));
  assert(!inQuietHours(new Date("2026-10-13T15:30:00Z"), la));
  assert(inQuietHours(new Date("2026-10-13T14:59:00Z"), la), "7:59am");
  assert(!inQuietHours(new Date("2026-10-13T15:00:00Z"), la), "8:00am sharp");
  // The same instant in Shanghai is 12:30pm (from 04:30Z).
  assert(!inQuietHours(new Date("2026-10-13T04:30:00Z"), "Asia/Shanghai"));
  // A window that doesn't cross midnight, and one that's off (same start and end).
  assert(inQuietHours(new Date("2026-10-13T20:00:00Z"), la, "12:00", "14:00"), "1pm");
  assert(!inQuietHours(new Date("2026-10-13T04:30:00Z"), la, "00:00", "00:00"));
});

Deno.test("quiet hours: a bad time zone falls back to Los Angeles instead of failing", () => {
  assertEquals(localMinutes(new Date("2026-10-13T04:30:00Z"), "Not/AZone"), 21 * 60 + 30);
  assertEquals(localDay(new Date("2026-10-13T04:30:00Z"), "America/Los_Angeles"), "2026-10-12");
  assertEquals(localDay(new Date("2026-10-13T04:30:00Z"), "Asia/Shanghai"), "2026-10-13");
});

Deno.test("limits: three texts and one call a day, one note to a stranger every 90 days, flood guard", () => {
  assert(underDailyLimit("text", 0) && underDailyLimit("text", 2) && !underDailyLimit("text", 3));
  assert(underDailyLimit("call", 0) && !underDailyLimit("call", 1));
  const now = new Date("2026-10-13T00:00:00Z");
  assert(strangerMayGetReply(null, now));
  assert(!strangerMayGetReply("2026-10-12T00:00:00Z", now));
  assert(!strangerMayGetReply(new Date(now.getTime() - (LIMITS.strangerDays - 1) * 864e5).toISOString(), now));
  assert(strangerMayGetReply(new Date(now.getTime() - (LIMITS.strangerDays + 1) * 864e5).toISOString(), now));
  assert(!inboundFlood(LIMITS.inboundPerHour - 1) && inboundFlood(LIMITS.inboundPerHour));
});

/* ------------------------------ phone numbers ------------------------------ */

Deno.test("phone numbers: US formats become E.164", () => {
  for (const s of ["(415) 555-0134", "415-555-0134", "415.555.0134", "4155550134", "1 415 555 0134", "+1 415 555 0134", "+14155550134"]) assertEquals(normalizePhone(s), "+14155550134", s);
});

Deno.test("phone numbers: international with a country code, and junk refused", () => {
  assertEquals(normalizePhone("+86 138 0013 8000"), "+8613800138000");
  assertEquals(normalizePhone("0086 138 0013 8000"), "+8613800138000");
  assertEquals(normalizePhone("+44 20 7946 0958"), "+442079460958");
  for (const s of ["", "555-0134", "12345", "+1 015 555 0134", "+1 415 155 0134", "call me", "+0 123 456 7890", "1+4155550134", "+1234567890123456", "415555013x"]) assertEquals(normalizePhone(s), null, s);
  assertEquals(normalizePhone(42), null);
  assertEquals(prettyPhone("+14155550134"), "+1 (415) 555-0134");
  assertEquals(prettyPhone("+8613800138000"), "+8613800138000");
});

/* ------------------------------ which updates reach a phone ------------------------------ */

Deno.test("urgency: closures and blockers call, this week's items text, the rest stay in the app", () => {
  const crit = new Set(["health"]);
  const u = (dedupe: string, app_id?: string, en = "x") => ({ kind: "deadline", dedupe, app_id, title: { en, zh: en } });
  assertEquals(urgency(u("lapsed:s1:Health permit:2026-10-01"), crit), "urgent");
  assertEquals(urgency(u("overdue:d1:2026-10-01", "health"), crit), "urgent");
  assertEquals(urgency(u("overdue:d2:2026-10-01", "signage"), crit), "important");
  assertEquals(urgency(u("filing:f1:rejected:2026-10-12", "health"), crit), "urgent");
  assertEquals(urgency(u("filing:f1:needs_info:2026-10-12", "signage"), crit), "important");
  assertEquals(urgency(u("filing:f1:submitted:2026-10-12", "health"), crit), null);
  assertEquals(urgency(u("deadline:d1:2026-10-15:3"), crit), "important");
  assertEquals(urgency(u("deadline:d1:2026-10-25:14"), crit), null);
  assertEquals(urgency(u("renewal:r1:2026-10-19:7"), crit), "important");
  assertEquals(urgency(u("permit:s1:Fire:2026-12-01:60"), crit), null);
  assertEquals(urgency(u("week:2026-10-12"), crit), null);
  assertEquals(urgency(u("x:1", undefined, "Health inspection failed"), crit), "urgent");
  assertEquals(urgency(u("pay:f1:2900"), crit), "important");
});

Deno.test("notice text names the brand and stays short", () => {
  const t = noticeText({ title: { en: "Overdue: Health permit", zh: "已逾期：卫生许可证" }, body: { en: "It was due 2026-10-01.", zh: "截止日期为 2026-10-01。" } }, "Dumpling House", "en");
  assert(t.startsWith("Placetta: Overdue: Health permit (Dumpling House)."), t);
  assert(noticeText({ title: { en: "x", zh: "已逾期" } }, "饺子馆", "zh").startsWith("快哉：已逾期（饺子馆）"));
  assert(noticeText({ title: { en: "y".repeat(500), zh: "" } }, "B", "en").length <= 300);
});

/* ------------------------------ calls ------------------------------ */

Deno.test("call tokens: bound to one call, expire, can't be forged", async () => {
  const now = 1_760_000_000;
  const t = await signCallToken("secret-key-123", "v3:abc_DEF-123", now + 60);
  assertEquals(await verifyCallToken("secret-key-123", t, now), "v3:abc_DEF-123");
  assertEquals(await verifyCallToken("other-key", t, now), null);
  assertEquals(await verifyCallToken("secret-key-123", t, now + 61), null);
  const [id, exp, sig] = t.split(".");
  assertEquals(await verifyCallToken("secret-key-123", [id, String(Number(exp) + 3600), sig].join("."), now), null, "extended expiry");
  const other = await signCallToken("secret-key-123", "v3:other", now + 60);
  assertEquals(await verifyCallToken("secret-key-123", [other.split(".")[0], exp, sig].join("."), now), null, "swapped call id");
  assertEquals(await verifyCallToken("secret-key-123", "", now), null);
});

Deno.test("spoken codes and client state", () => {
  assertEquals(spokenDigits("4 7 2 1"), "4721");
  assertEquals(spokenDigits("four seven two one"), "4721");
  assertEquals(spokenDigits("Four, seven, oh, 9."), "4709");
  assertEquals(spokenDigits("四七二一"), "4721");
  assertEquals(spokenDigits("幺两三四"), "1234");
  assertEquals(readClientState(clientState({ k: "out", l: "zh", n: "饺子" })), { k: "out", l: "zh", n: "饺子" });
  assertEquals(readClientState("%%%"), {});
  const c = randomCode(6);
  assert(/^\d{6}$/.test(c), c);
});

Deno.test("workspace brief: names, dates and statuses only, and it stays small", () => {
  const state = {
    business: { en: "Dumpling House", zh: "饺子馆" }, meta: { city: "San Jose", region: "CA" },
    apps: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, name: { en: `Permit ${i}`, zh: `许可 ${i}` }, agency: { en: "County", zh: "县" }, status: "draft", fields: [{ value: "SECRET-SSN-123-45-6789" }], critical: i === 0 })),
    deadlines: [{ id: "d1", date: "2026-10-20", kind: "due", title: { en: "Health permit", zh: "卫生许可证" } }, { id: "d2", date: "2027-05-01", kind: "renewal", title: { en: "Far away", zh: "很远" } }],
    approvals: [{ id: "ap1", title: { en: "File the health permit", zh: "提交卫生许可证" } }],
    memories: { u1: { files: [{ lines: ["private"] }] } },
  };
  const brief = workspaceBrief({ name: "Dumpling House", state, filings: [{ title: { en: "EIN", zh: "EIN" }, status: "submitted", confirmation_number: "C-1", updated_at: "2026-10-10T00:00:00Z" }], updates: [], lang: "en", today: "2026-10-13" }, 2500);
  assert(brief.length <= 2500, String(brief.length));
  assert(!brief.includes("SECRET") && !brief.includes("private"), "never fields or memory");
  assert(brief.includes("Health permit") && !brief.includes("Far away"), "next 30 days only");
  assert(brief.includes("File the health permit") && brief.includes("C-1"));
  assert(workspaceBrief({ name: "饺子馆", state, lang: "zh", today: "2026-10-13" }).includes("卫生许可证"));
});

Deno.test("app links and sending", async () => {
  assertEquals(appLink("https://app.placetta.com", "w1", "ap1"), "https://app.placetta.com/app/?ws=w1&approval=ap1");
  assertEquals(appLink("https://app.placetta.com", "w1"), "https://app.placetta.com/app/?ws=w1");
  assertEquals(appLink("", "w1"), "");
  // Not configured: a clear refusal, no request.
  let calls = 0;
  const f = (() => { calls++; return Promise.resolve(new Response("{}")); }) as unknown as typeof fetch;
  const none = await sendSms(() => undefined, "+14155550134", "hi", f);
  assertEquals([none.ok, none.code, calls], [false, "not_configured", 0]);
  // Configured: the exact Telnyx request; a STOP block comes back as 40300.
  const env = (k: string) => ({ TELNYX_API_KEY: "KEY", TELNYX_PUBLIC_KEY: "PUB", ODELIA_NUMBER: "(415) 555-0100", TELNYX_MESSAGING_PROFILE_ID: "prof" } as Record<string, string>)[k];
  let sent: { url: string; body: Record<string, unknown>; auth: string } | null = null;
  const ok = await sendSms(env, "+14155550134", "hi", ((url: string, init: RequestInit) => {
    sent = { url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") ?? "" };
    return Promise.resolve(new Response(JSON.stringify({ data: { id: "msg-1" } }), { status: 200 }));
  }) as unknown as typeof fetch);
  assertEquals([ok.ok, ok.id], [true, "msg-1"]);
  assertEquals(sent!.url, "https://api.telnyx.com/v2/messages");
  assertEquals(sent!.body, { from: "+14155550100", to: "+14155550134", text: "hi", messaging_profile_id: "prof", type: "SMS" });
  assertEquals(sent!.auth, "Bearer KEY");
  const blocked = await sendSms(env, "+14155550134", "hi", (() => Promise.resolve(new Response(JSON.stringify({ errors: [{ code: "40300", title: "Blocked due to STOP message" }] }), { status: 400 }))) as unknown as typeof fetch);
  assertEquals([blocked.ok, blocked.code], [false, "40300"]);
});

Deno.test("plain-language opt-outs count as STOP (FCC any reasonable means)", async () => {
  const { keyword } = await import("./odelia.ts");
  for (const t of ["Stop texting me", "please stop calling me", "Don't text me anymore", "remove me", "不要再发短信了", "STOP"]) if (keyword(t) !== "stop") throw new Error(`not an opt-out: ${t}`);
  for (const t of ["stop the renewal", "Don't file the permit yet", "What should I stop doing?"]) if (keyword(t) !== null) throw new Error(`wrongly an opt-out: ${t}`);
});
