// Run: deno test -A supabase/functions/_shared/teams_test.ts
// Odelia in Microsoft Teams: every request's Bot Framework token checked (signature, issuer, audience, time, service
// address, endorsement), other tenants and guests turned away, a mention or a personal message becomes a job, answers
// reply in the thread with the approval as an Open URL button, and the bot's token goes only to Microsoft.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { teamsFiles, teamsForgetKeys, teamsForgetToken, teamsHandle, teamsReply, teamsSender, teamsServiceOk, teamsText, type TeamsBot, type TeamsTo, teamsVerify, teamsWorks } from "./teams.ts";

const APP = "8c3e5d2a-1b4f-4e6a-9c7d-2f1e0a9b8c7d", TENANT = "4a1b2c3d-5e6f-4789-8abc-def012345678", OTHER_TENANT = "99999999-9999-4999-8999-999999999999";
const bot: TeamsBot = { kind: "teams_bot", app_id: APP, app_secret: "client~secret.value", tenant_id: TENANT };
const SERVICE = "https://smba.trafficmanager.net/amer/";

const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const otherPair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const KID = "test-kid-1";
const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function jwt(claims: Record<string, unknown>, o: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = enc({ alg: o.alg ?? "RS256", kid: o.kid ?? KID, typ: "JWT" }), p = enc({ iss: "https://api.botframework.com", aud: APP, exp: now + 3600, nbf: now - 10, serviceUrl: SERVICE, ...claims });
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", o.key ?? pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
  return `Bearer ${h}.${p}.${btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

type Call = { url: string; init?: RequestInit };
function microsoft(o: { member?: Record<string, unknown>; memberStatus?: number; endorsements?: string[]; token?: boolean } = {}) {
  const calls: Call[] = [];
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, init });
    if (url === "https://login.botframework.com/v1/.well-known/openidconfiguration") return Response.json({ jwks_uri: "https://login.botframework.com/v1/.well-known/keys" });
    if (url === "https://login.botframework.com/v1/.well-known/keys") return Response.json({ keys: [{ ...jwk, kid: KID, endorsements: o.endorsements ?? ["msteams", "emulator"] }] });
    if (url.startsWith("https://login.microsoftonline.com/")) return o.token === false ? Response.json({ error: "invalid_client" }, { status: 401 }) : Response.json({ access_token: "bf-token", expires_in: 3600 });
    if (url.includes("/members/")) return Response.json(o.member ?? { email: "Mei@LuckyLeaf.com", userPrincipalName: "mei@luckyleaf.com", tenantId: TENANT, userRole: "user" }, { status: o.memberStatus ?? 200 });
    if (url.includes("/activities/")) return Response.json({ id: "reply-1" }, { status: 201 });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const activity = (o: Record<string, unknown> = {}) => ({
  type: "message", id: "1700000000001", serviceUrl: SERVICE, channelId: "msteams", text: "<at>Odelia</at> When does the food permit expire?",
  from: { id: "29:1abc", aadObjectId: "aad-mei" }, recipient: { id: "28:" + APP, name: "Odelia" },
  conversation: { id: "19:abc@thread.tacv2;messageid=1700000000001", conversationType: "channel", tenantId: TENANT },
  entities: [{ type: "mention", mentioned: { id: "28:" + APP } }], channelData: { tenant: { id: TENANT } }, ...o,
});

Deno.test("a genuine request from Teams for this bot is taken; the job replies in the same thread", async () => {
  teamsForgetKeys();
  const { f } = microsoft();
  const r = await teamsHandle(bot, await jwt({}), JSON.stringify(activity()), { f });
  assertEquals(r.status, 200);
  assertEquals(r.job?.text, "When does the food permit expire?");
  assertEquals(r.job?.to, { kind: "teams", service_url: "https://smba.trafficmanager.net/amer", conversation_id: "19:abc@thread.tacv2;messageid=1700000000001", activity_id: "1700000000001" });
  assertEquals(r.job?.from, "29:1abc");
  assert(/^teams:[0-9a-f]{40}$/.test(r.job!.id), "a short, stable id for taking it once");
  const again = await teamsHandle(bot, await jwt({}), JSON.stringify(activity()), { f });
  assertEquals(again.job?.id, r.job?.id, "the same message gets the same id (Teams retries)");
});

Deno.test("every check on the token: signature, key, issuer, audience, time, service address, endorsement", async () => {
  teamsForgetKeys();
  const { f } = microsoft();
  const body = JSON.stringify(activity());
  const now = Math.floor(Date.now() / 1000);
  const bad: [string, string | null][] = [
    ["no header", null], ["not a bearer token", "Basic abc"], ["signed by another key", await jwt({}, { key: otherPair.privateKey })],
    ["an unknown key id", await jwt({}, { kid: "nope" })], ["another algorithm", await jwt({}, { alg: "HS256" })],
    ["another issuer", await jwt({ iss: "https://evil.example" })], ["another bot", await jwt({ aud: "11111111-1111-4111-8111-111111111111" })],
    ["expired", await jwt({ exp: now - 600 })], ["not valid yet", await jwt({ nbf: now + 900 })],
    ["for another service address", await jwt({ serviceUrl: "https://evil.example/" })],
  ];
  for (const [why, h] of bad) assertEquals((await teamsHandle(bot, h, body, { f })).status, 401, why);
  // a payload changed after signing
  const good = (await jwt({})).split(".");
  const forged = [good[0], enc({ iss: "https://api.botframework.com", aud: APP, exp: now + 3600, serviceUrl: SERVICE, extra: 1 }), good[2]].join(".");
  assertEquals((await teamsHandle(bot, forged, body, { f })).status, 401, "a changed payload");
  assertEquals(await teamsVerify(bot, await jwt({}), { serviceUrl: SERVICE, channelId: "msteams" }, { f, now: Date.now() + 2 * 3600e3 }), false, "two hours later");
  teamsForgetKeys();
  const noEndorse = microsoft({ endorsements: ["webchat"] });
  assertEquals((await teamsHandle(bot, await jwt({}), body, { f: noEndorse.f })).status, 401, "a key not endorsed for Teams");
  teamsForgetKeys();
});

Deno.test("only this tenant, only Teams' own addresses, only a mention in a channel", async () => {
  teamsForgetKeys();
  const { f } = microsoft();
  const t = await jwt({});
  const run = async (o: Record<string, unknown>) => (await teamsHandle(bot, t, JSON.stringify(activity(o)), { f })).job;
  assertEquals(await run({ conversation: { id: "19:x", conversationType: "channel", tenantId: OTHER_TENANT }, channelData: { tenant: { id: OTHER_TENANT } } }), undefined, "another company's tenant");
  assertEquals(await run({ entities: [] }), undefined, "a channel message that doesn't mention her");
  assertEquals(await run({ type: "conversationUpdate" }), undefined, "not a message");
  assertEquals(await run({ text: "<at>Odelia</at>" }), undefined, "only a mention, no words");
  const personal = await run({ conversation: { id: "a:1personal", conversationType: "personal", tenantId: TENANT }, entities: [], text: "What's due?" });
  assertEquals(personal?.text, "What's due?", "a personal chat needs no mention");
  const evilT = await jwt({ serviceUrl: "https://evil.example/" });
  assertEquals((await teamsHandle(bot, evilT, JSON.stringify(activity({ serviceUrl: "https://evil.example/" })), { f })).job, undefined, "a service address that isn't Microsoft's");
  for (const u of ["https://smba.trafficmanager.net/emea/", "https://europe.webchat.botframework.com/", "https://smba.infra.gcc.teams.microsoft.us/"]) assert(teamsServiceOk(u), u);
  for (const u of ["http://smba.trafficmanager.net/", "https://smba.trafficmanager.net.evil.example/", "https://botframework.com.evil.example/", "https://user:pw@smba.trafficmanager.net/", "https://127.0.0.1/"]) assert(!teamsServiceOk(u), u);
});

Deno.test("who's asking: a member of the tenant by work email; guests and other tenants are turned away", async () => {
  teamsForgetToken(APP);
  const to: TeamsTo = { kind: "teams", service_url: "https://smba.trafficmanager.net/amer", conversation_id: "19:abc@thread.tacv2", activity_id: "1" };
  assertEquals(await teamsSender(bot, to, "29:1abc", microsoft().f), { ok: true, email: "mei@luckyleaf.com" });
  assertEquals(await teamsSender(bot, to, "29:1abc", microsoft({ member: { userPrincipalName: "kevin@luckyleaf.com", tenantId: TENANT } }).f), { ok: true, email: "kevin@luckyleaf.com" }, "the sign-in name when there's no email field");
  assertEquals(await teamsSender(bot, to, "29:x", microsoft({ member: { email: "x@contractor.com", tenantId: OTHER_TENANT } }).f), { ok: false, why: "outsider" });
  assertEquals(await teamsSender(bot, to, "29:x", microsoft({ member: { email: "g@gmail.com", userPrincipalName: "g_gmail.com#EXT#@luckyleaf.onmicrosoft.com", tenantId: TENANT } }).f), { ok: false, why: "guest" });
  assertEquals(await teamsSender(bot, to, "29:x", microsoft({ member: { email: "g@x.com", tenantId: TENANT, userRole: "guest" } }).f), { ok: false, why: "guest" });
  assertEquals(await teamsSender(bot, to, "29:x", microsoft({ memberStatus: 403 }).f), { ok: false, why: "setup" });
  teamsForgetToken(APP);
  assertEquals(await teamsSender(bot, to, "29:x", microsoft({ token: false }).f), { ok: false, why: "setup" }, "credentials Microsoft won't take");
  teamsForgetToken(APP);
});

Deno.test("answers: a reply to the message, the approval as an Open URL button, the token only to Microsoft", async () => {
  teamsForgetToken(APP);
  const { f, calls } = microsoft();
  const to: TeamsTo = { kind: "teams", service_url: "https://smba.trafficmanager.net/amer", conversation_id: "19:abc@thread.tacv2;messageid=1", activity_id: "1" };
  assert(await teamsReply(bot, to, "The renewal is ready for your approval.", { button: { label: "Review and approve", url: "https://app.placetta.com/app/?ws=w&approval=a" }, f }));
  const post = calls.find((c) => c.url.includes("/activities/"))!;
  assertEquals(post.url, "https://smba.trafficmanager.net/amer/v3/conversations/19%3Aabc%40thread.tacv2%3Bmessageid%3D1/activities/1");
  assertEquals((post.init?.headers as Record<string, string>).Authorization, "Bearer bf-token");
  const b = JSON.parse(String(post.init?.body));
  assertEquals([b.type, b.replyToId, b.text], ["message", "1", "The renewal is ready for your approval."]);
  assertEquals(b.attachments[0].content.actions, [{ type: "Action.OpenUrl", title: "Review and approve", url: "https://app.placetta.com/app/?ws=w&approval=a" }]);
  assert(!JSON.stringify(b).includes("Action.Submit") && !JSON.stringify(b).includes("Action.Execute"), "nothing is approved in Teams");
  const before = calls.length;
  assertEquals(await teamsReply(bot, { ...to, service_url: "https://evil.example" }, "x", { f }), false);
  assertEquals(calls.length, before, "an address that isn't Microsoft's gets nothing, not even a request");
  assert(await teamsWorks(bot, f));
  assert(!(await teamsWorks({ ...bot, tenant_id: "not-a-guid" }, f)), "a malformed tenant is never sent");
  teamsForgetToken(APP);
});

Deno.test("the words, without Teams' mention and HTML", () => {
  assertEquals(teamsText("<at>Odelia</at>&nbsp;what&#39;s due &amp; when?<br>Thanks"), "what's due & when?\nThanks");
  assertEquals(teamsText("<p>Renew the <b>sign</b> permit</p>"), "Renew the sign permit");
});

Deno.test("files: a personal chat's PDF from OneDrive, an inline photo with the bot's token, nothing from anywhere else", () => {
  const files = teamsFiles({ attachments: [
    { contentType: "application/vnd.microsoft.teams.file.download.info", name: "Health inspection.pdf", content: { downloadUrl: "https://contoso-my.sharepoint.com/personal/mei/_layouts/15/download.aspx?UniqueId=1&Translate=false&tempauth=x", fileType: "pdf" } },
    { contentType: "image/png", contentUrl: "https://smba.trafficmanager.net/amer/v3/attachments/0-wus-d1/views/original", name: "violation.png" },
    { contentType: "text/html", content: {} },
    { contentType: "application/vnd.microsoft.teams.file.download.info", name: "notes.docx", content: { downloadUrl: "https://contoso-my.sharepoint.com/x", fileType: "docx" } },
    { contentType: "application/vnd.microsoft.teams.file.download.info", name: "evil.pdf", content: { downloadUrl: "https://evil.example/download.pdf", fileType: "pdf" } },
    { contentType: "image/png", contentUrl: "https://evil.example/a.png" },
  ] });
  assertEquals(files, [
    { url: "https://contoso-my.sharepoint.com/personal/mei/_layouts/15/download.aspx?UniqueId=1&Translate=false&tempauth=x", name: "Health inspection.pdf", mime: "application/pdf", bot: false },
    { url: "https://smba.trafficmanager.net/amer/v3/attachments/0-wus-d1/views/original", name: "violation.png", mime: "image/png", bot: true },
  ]);
});
