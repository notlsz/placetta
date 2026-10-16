// Run: deno test supabase/functions/_shared/whatsapp_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { parseWhatsApp, signWhatsApp, subscribeChallenge, verifyWhatsApp, waMedia, waMediaHost, waTemplate, waText, waTyping, waWindowOpen, whatsappReady } from "./whatsapp.ts";

const ENV = ((o: Record<string, string>) => (k: string) => o[k])({ WHATSAPP_TOKEN: "EAAG", WHATSAPP_PHONE_NUMBER_ID: "1098765", WHATSAPP_APP_SECRET: "app-secret", WHATSAPP_VERIFY_TOKEN: "vt", WHATSAPP_TEMPLATE: "odelia_update" });

Deno.test("ready needs the token, the number id, the app secret and the verify token", () => {
  assert(whatsappReady(ENV));
  assert(!whatsappReady((k) => (k === "WHATSAPP_TOKEN" ? "x" : undefined)));
});

Deno.test("webhook signature: X-Hub-Signature-256 over the raw body", async () => {
  const raw = '{"object":"whatsapp_business_account"}';
  const sig = await signWhatsApp(raw, "app-secret");
  assert(sig.startsWith("sha256="));
  assert(await verifyWhatsApp(raw, sig, "app-secret"));
  assert(await verifyWhatsApp(raw, sig.toUpperCase().replace("SHA256=", "sha256="), "app-secret"), "hex case doesn't matter");
  assert(!(await verifyWhatsApp(raw + " ", sig, "app-secret")));
  assert(!(await verifyWhatsApp(raw, sig, "other-secret")));
  assert(!(await verifyWhatsApp(raw, sig.slice(7), "app-secret")), "needs the sha256= prefix");
  assert(!(await verifyWhatsApp(raw, sig, "")));
});

Deno.test("subscribe handshake echoes the challenge only for the right verify token", () => {
  const u = (t: string) => new URL(`https://x.test/odelia-sms?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=12345`);
  assertEquals(subscribeChallenge(u("vt"), "vt"), "12345");
  assertEquals(subscribeChallenge(u("nope"), "vt"), null);
  assertEquals(subscribeChallenge(u("vt"), ""), null);
});

const event = (messages: unknown[], extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "14155550190", phone_number_id: "1098765" }, contacts: [{ wa_id: "16465550142" }], messages, ...extra } }] }],
}) as never;

Deno.test("parse: text, a photo with a caption, a PDF, a button tap; receipts ignored", () => {
  const out = parseWhatsApp(event([
    { from: "16465550142", id: "wamid.A", timestamp: "1", type: "text", text: { body: " When is my permit due? " } },
    { from: "16465550142", id: "wamid.B", type: "image", image: { id: "media1", mime_type: "image/jpeg", caption: "the permit" } },
    { from: "16465550142", id: "wamid.C", type: "document", document: { id: "media2", mime_type: "application/pdf", filename: "lease.pdf" } },
    { from: "16465550142", id: "wamid.D", type: "button", button: { text: "Open Placetta" } },
    { from: "not-a-number", id: "wamid.E", type: "text", text: { body: "x" } },
  ]));
  assertEquals(out.map((m) => [m.id, m.from, m.text, m.media.length]), [
    ["wa:wamid.A", "+16465550142", "When is my permit due?", 0],
    ["wa:wamid.B", "+16465550142", "the permit", 1],
    ["wa:wamid.C", "+16465550142", "", 1],
    ["wa:wamid.D", "+16465550142", "Open Placetta", 0],
  ]);
  assertEquals(out[1].media[0], { id: "media1", content_type: "image/jpeg" });
  assertEquals(out[0].phoneNumberId, "1098765");
  assertEquals(parseWhatsApp(event([], { statuses: [{ id: "wamid.A", status: "delivered" }] })), []);
  assertEquals(parseWhatsApp({ object: "page" } as never), []);
});

function fake(status: number, body: unknown) {
  const calls: { url: string; body: any; auth: string | null }[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get("authorization") });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { f, calls };
}

Deno.test("send a reply, the update template, and the typing indicator", async () => {
  const t = fake(200, { messaging_product: "whatsapp", contacts: [{ wa_id: "16465550142" }], messages: [{ id: "wamid.OUT" }] });
  const r = await waText(ENV, "+16465550142", "Due Nov 3. Approve: https://placetta.com/app/?ws=1", t.f);
  assertEquals([r.ok, r.id], [true, "wamid.OUT"]);
  assertEquals(t.calls[0].url, "https://graph.facebook.com/v25.0/1098765/messages");
  assertEquals(t.calls[0].auth, "Bearer EAAG");
  assertEquals(t.calls[0].body, { messaging_product: "whatsapp", recipient_type: "individual", to: "16465550142", type: "text", text: { body: "Due Nov 3. Approve: https://placetta.com/app/?ws=1", preview_url: true } });

  const tp = fake(200, { messages: [{ id: "wamid.T" }] });
  await waTemplate(ENV, "+16465550142", "Placetta: your sign permit\nwas approved.    Open: https://x", "zh", tp.f);
  assertEquals(tp.calls[0].body.template, { name: "odelia_update", language: { code: "zh_CN" }, components: [{ type: "body", parameters: [{ type: "text", text: "your sign permit was approved.   Open: https://x" }] }] });

  const ty = fake(200, { success: true });
  assert(await waTyping(ENV, "wa:wamid.A", ty.f));
  assertEquals(ty.calls[0].body, { messaging_product: "whatsapp", status: "read", message_id: "wamid.A", typing_indicator: { type: "text" } });
});

Deno.test("errors carry Meta's code (131047: the 24-hour window closed)", async () => {
  const e = fake(400, { error: { message: "Re-engagement message", type: "OAuthException", code: 131047, error_data: { details: "More than 24 hours have passed since the recipient last replied" } } });
  const r = await waText(ENV, "+16465550142", "hi", e.f);
  assertEquals([r.ok, r.code], [false, 131047]);
  assert(/24 hours/.test(r.detail ?? ""));
});

Deno.test("media: id to a short-lived URL; only Meta's hosts get the token; the 24-hour window", async () => {
  const m = fake(200, { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", mime_type: "image/jpeg", file_size: 2048, id: "media1" });
  assertEquals(await waMedia(ENV, "media1", m.f), { url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1", content_type: "image/jpeg", size: 2048 });
  assertEquals(m.calls[0].url, "https://graph.facebook.com/v25.0/media1");
  assert(waMediaHost("lookaside.fbsbx.com") && waMediaHost("mmg.whatsapp.net") && !waMediaHost("evil.com") && !waMediaHost("fbsbx.com.evil.com"));
  const now = Date.parse("2026-10-16T12:00:00Z");
  assert(waWindowOpen("2026-10-16T00:00:00Z", now));
  assert(!waWindowOpen("2026-10-15T12:03:00Z", now), "inside the last 5 minutes counts as closed");
  assert(!waWindowOpen(null, now));
});
