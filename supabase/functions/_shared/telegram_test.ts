// Run: deno test -A supabase/functions/_shared/telegram_test.ts
// Odelia in Telegram: the webhook secret, who may give her a job, link codes only in private, answers as replies with the
// approval as a link button, and the token never in anything logged or returned.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { NOT_TEAMMATE } from "./bots.ts";
import { TG_SAY, tgDeepLink, type TgDeps, tgDownload, type TgFile, tgGetMe, tgHandle, tgLinkCode, tgNewSecret, tgSend, tgSetWebhook, tgSplit, tgTokenOk, type TelegramBot, type TelegramTo, tgWords } from "./telegram.ts";

const TOKEN = "7012345678:AAH9f3kq2Zx0-LmNoPqRsTuVwXyZ_abcdEF";
const bot: TelegramBot = { kind: "telegram_bot", bot_token: TOKEN, secret: "s3cret-Value_123", bot_id: "7012345678", username: "LuckyLeafOdeliaBot" };
const MEI = "123456789", STRANGER = "555000111";

function deps(o: Partial<TgDeps> = {}) {
  const seen = new Set<string>(), started: { uid: string; to: TelegramTo; text: string; lang: string; files: TgFile[] }[] = [], claims: [string, string][] = [];
  const d: TgDeps = {
    firstTime: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    claim: async (u, c) => (claims.push([u, c]), c === "424242" ? "ok" : "wrong"),
    sender: async (u) => (u === MEI ? { user_id: "uid-mei", member: true } : u === "222333444" ? { user_id: "uid-left", member: false } : null),
    start: (uid, to, text, lang, files) => { started.push({ uid, to, text, lang, files }); },
    notTeammate: NOT_TEAMMATE,
    ...o,
  };
  return { d, started, claims };
}
let n = 1;
const update = (m: Record<string, unknown>) => JSON.stringify({ update_id: n++, message: { message_id: 77, date: 1, ...m } });
const dm = (text: string, from = MEI) => update({ from: { id: Number(from), is_bot: false }, chat: { id: Number(from), type: "private" }, text });
const group = (text: string, extra: Record<string, unknown> = {}) => update({ from: { id: Number(MEI), is_bot: false }, chat: { id: -1001234567890, type: "supergroup" }, text, ...extra });
const said = (body: string) => (body ? JSON.parse(body) : null) as { method: string; text?: string; chat_id: number; reply_parameters?: { message_id: number }; message_thread_id?: number } | null;

Deno.test("a request without the bot's secret is refused before anything is read", async () => {
  const { d, started } = deps();
  for (const h of [null, "", "wrong", bot.secret + "x", bot.secret.toUpperCase()]) {
    const r = await tgHandle(bot, h, dm("When does my permit expire?"), d);
    assertEquals(r.status, 401);
  }
  assertEquals(started.length, 0);
  assertEquals((await tgHandle({ ...bot, secret: "" }, "", dm("x"), d)).status, 401, "a bot saved without a secret takes nothing");
});

Deno.test("a linked teammate's direct message starts a job as them, and the answer will reply to it", async () => {
  const { d, started } = deps();
  const r = await tgHandle(bot, bot.secret, dm("When does the health permit expire?"), d);
  assertEquals(r.status, 200);
  assertEquals(said(r.body)?.method, "sendChatAction", "typing while she starts");
  assertEquals(started.length, 1);
  assertEquals(started[0].uid, "uid-mei");
  assertEquals(started[0].to, { kind: "telegram", chat_id: MEI, message_id: 77, user: MEI });
  assertEquals(started[0].lang, "en");
  const zh = deps();
  await tgHandle(bot, bot.secret, dm("营业执照什么时候到期？"), zh.d);
  assertEquals(zh.started[0].lang, "zh");
});

Deno.test("someone not linked, or no longer a member, gets a polite note and no job", async () => {
  const { d, started } = deps();
  const a = said((await tgHandle(bot, bot.secret, dm("File my renewal", STRANGER), d)).body);
  assertEquals(a?.text, TG_SAY.unknown);
  assertEquals(a?.reply_parameters?.message_id, 77, "the note replies to their message");
  const b = said((await tgHandle(bot, bot.secret, dm("File my renewal", "222333444"), d)).body);
  assertEquals(b?.text, NOT_TEAMMATE);
  assertEquals(started.length, 0);
});

Deno.test("each update is taken once: Telegram's retries do nothing", async () => {
  const { d, started } = deps();
  const body = dm("What's due this week?");
  await tgHandle(bot, bot.secret, body, d);
  const again = await tgHandle(bot, bot.secret, body, d);
  assertEquals([again.status, again.body, started.length], [200, "", 1]);
});

Deno.test("link codes: only in a private chat, and the result says what happened", async () => {
  const { d, claims } = deps();
  assertEquals(said((await tgHandle(bot, bot.secret, dm("424242", STRANGER), d)).body)?.text, TG_SAY.linked);
  assertEquals(said((await tgHandle(bot, bot.secret, dm("/start 424242", STRANGER), d)).body)?.text, TG_SAY.linked, "the t.me link's /start carries the code");
  assertEquals(said((await tgHandle(bot, bot.secret, dm("关联 111111", STRANGER), d)).body)?.text, TG_SAY.wrongCode);
  assertEquals(claims, [[STRANGER, "424242"], [STRANGER, "424242"], [STRANGER, "111111"]]);
  const g = deps();
  assertEquals(said((await tgHandle(bot, bot.secret, group("@LuckyLeafOdeliaBot 424242"), g.d)).body)?.text, TG_SAY.privateCode, "a code typed in a group is never claimed");
  assertEquals(g.claims.length, 0);
  const locked = deps({ claim: async () => "locked" });
  assertEquals(said((await tgHandle(bot, bot.secret, dm("424242", STRANGER), locked.d)).body)?.text, TG_SAY.locked);
});

Deno.test("in a group she answers only when asked: a mention, /ask, or a reply to her", async () => {
  const { d, started } = deps();
  assertEquals((await tgHandle(bot, bot.secret, group("lunch at noon?"), d)).body, "", "ordinary group chatter is ignored");
  assertEquals((await tgHandle(bot, bot.secret, group("/ask@SomeOtherBot what's due?"), d)).body, "", "another bot's command");
  await tgHandle(bot, bot.secret, group("@LuckyLeafOdeliaBot what's due this month?"), d);
  await tgHandle(bot, bot.secret, group("/ask what's due this month?"), d);
  await tgHandle(bot, bot.secret, group("and the sign permit?", { reply_to_message: { from: { id: 7012345678, is_bot: true } } }), d);
  await tgHandle(bot, bot.secret, group("@luckyleafodeliabot topic question", { is_topic_message: true, message_thread_id: 12 }), d);
  assertEquals(started.map((s) => s.text), ["what's due this month?", "what's due this month?", "and the sign permit?", "topic question"]);
  assertEquals(started[3].to.thread_id, 12, "a forum topic's answer stays in the topic");
  assertEquals(started[0].to.chat_id, "-1001234567890");
});

Deno.test("bots, channels, photos without words and malformed updates start nothing", async () => {
  const { d, started } = deps();
  const fromBot = update({ from: { id: 999, is_bot: true }, chat: { id: 999, type: "private" }, text: "hi" });
  const channel = update({ from: { id: Number(MEI) }, chat: { id: -100555, type: "channel" }, text: "@LuckyLeafOdeliaBot hi" });
  for (const b of [fromBot, channel, "not json", JSON.stringify({ update_id: 1 }), JSON.stringify({ message: { text: "x" } })]) assertEquals((await tgHandle(bot, bot.secret, b, d)).body, "");
  const voice = update({ from: { id: Number(MEI) }, chat: { id: Number(MEI), type: "private" }, voice: { file_id: "v1" } });
  assertEquals(said((await tgHandle(bot, bot.secret, voice, d)).body)?.text, TG_SAY.textOnly, "a voice note isn't a document: it says what it can read");
  const broken = update({ from: { id: Number(MEI) }, chat: { id: Number(MEI), type: "private" }, photo: [{}] });
  assertEquals((await tgHandle(bot, bot.secret, broken, d)).body, "", "a photo with no file id is nothing to read");
  assertEquals(started.length, 0);
});

Deno.test("photos and PDFs: a teammate's become documents with the job, a stranger's are never fetched", async () => {
  const { d, started } = deps();
  const pdf = update({ from: { id: Number(MEI), language_code: "zh-hans" }, chat: { id: Number(MEI), type: "private" }, document: { file_id: "BQAD1", file_name: "inspection report.pdf", mime_type: "application/pdf", file_size: 81234 } });
  await tgHandle(bot, bot.secret, pdf, d);
  assertEquals(started[0].files, [{ file_id: "BQAD1", name: "inspection report.pdf", mime: "application/pdf", size: 81234 }]);
  assertEquals([started[0].text, started[0].lang], ["", "zh"], "only a file: no words, in the language their Telegram is set to");
  const photo = update({ from: { id: Number(MEI) }, chat: { id: Number(MEI), type: "private" }, caption: "Is this violation serious?",
    photo: [{ file_id: "small", width: 90, height: 90, file_size: 1000 }, { file_id: "big", width: 1280, height: 960, file_size: 180000 }] });
  await tgHandle(bot, bot.secret, photo, d);
  assertEquals([started[1].text, started[1].files.map((f) => f.file_id)], ["Is this violation serious?", ["big"]], "the caption is the question, the largest size the file");
  const groupPhoto = group("", { caption: "", photo: [{ file_id: "g", width: 10, height: 10 }] });
  await tgHandle(bot, bot.secret, groupPhoto, d);
  assertEquals(started.length, 2, "a photo in a group that doesn't address her is ignored");
  const stranger = update({ from: { id: Number(STRANGER) }, chat: { id: Number(STRANGER), type: "private" }, document: { file_id: "x", mime_type: "application/pdf" } });
  assertEquals(said((await tgHandle(bot, bot.secret, stranger, d)).body)?.text, TG_SAY.unknown);
  assertEquals(started.length, 2);
});

Deno.test("a file: getFile, then the file address, refused over the limit", async () => {
  const calls: string[] = [];
  const f = ((url: string) => {
    calls.push(String(url).replace(TOKEN, "<token>"));
    if (String(url).endsWith("/getFile")) return Promise.resolve(new Response(JSON.stringify({ ok: true, result: { file_path: "documents/file_7.pdf", file_size: 5 } })));
    return Promise.resolve(new Response(new Uint8Array([37, 80, 68, 70, 45])));
  }) as typeof fetch;
  assertEquals(await tgDownload(bot, "BQAD1", 1000, f), new Uint8Array([37, 80, 68, 70, 45]));
  assertEquals(calls, ["https://api.telegram.org/bot<token>/getFile", "https://api.telegram.org/file/bot<token>/documents/file_7.pdf"]);
  assertEquals(await tgDownload(bot, "BQAD1", 4, f), null, "over the limit");
});

Deno.test("the words: commands and mentions come out", () => {
  const b = { bot_id: bot.bot_id, username: bot.username };
  assertEquals(tgWords(b, { chat: { type: "private" }, text: "/ask  When is   the inspection?" }), "When is the inspection?");
  assertEquals(tgWords(b, { chat: { type: "group" }, text: "hey @LuckyLeafOdeliaBot, renewals?" }), "hey , renewals?");
  assertEquals(tgWords(b, { chat: { type: "group" }, text: "renewals?" }), null);
  assertEquals(tgLinkCode("123456"), "123456");
  assertEquals(tgLinkCode("/start@LuckyLeafOdeliaBot 123456"), "123456");
  assertEquals(tgLinkCode("1234567"), null);
  assertEquals(tgLinkCode("call me at 123456"), null);
});

Deno.test("answers: a reply in the same chat and topic, plain text, the approval as a link button, long ones split", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const f = (async (u: string | URL | Request, i?: RequestInit) => { calls.push({ url: String(u), body: JSON.parse(String(i?.body)) }); return new Response(JSON.stringify({ ok: true, result: {} })); }) as typeof fetch;
  const to: TelegramTo = { kind: "telegram", chat_id: "-1001234567890", message_id: 77, thread_id: 12, user: MEI };
  const r = await tgSend(bot, to, "Your renewal is ready. <b>not html</b>", { button: { label: "Review and approve", url: "https://app.placetta.com/app/?ws=w1&approval=ap1" }, f });
  assert(r.ok);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  const b = calls[0].body as { chat_id: string; text: string; message_thread_id: number; reply_parameters: { message_id: number }; reply_markup: { inline_keyboard: { text: string; url: string }[][] }; parse_mode?: string };
  assertEquals([b.chat_id, b.message_thread_id, b.reply_parameters.message_id, b.parse_mode], [to.chat_id, 12, 77, undefined]);
  assertEquals(b.reply_markup.inline_keyboard[0][0], { text: "Review and approve", url: "https://app.placetta.com/app/?ws=w1&approval=ap1" });
  assert(!("callback_data" in b.reply_markup.inline_keyboard[0][0]), "a link, never a callback: nothing is approved in Telegram");
  calls.length = 0;
  await tgSend(bot, to, "x", { button: { label: "Open", url: "http://insecure.example" }, f });
  assert(!("reply_markup" in calls[0].body), "only an https link becomes a button");
  const long = ("A paragraph about permits. ".repeat(200) + "\n\n").repeat(3);
  assertEquals(tgSplit(long).length, 3);
  assert(tgSplit(long).every((p) => p.length <= 4096));
  assertEquals(tgSplit("short"), ["short"]);
});

Deno.test("setup: getMe checks the token, setWebhook carries the secret, and a failure never shows the token", async () => {
  const bodies: Record<string, unknown>[] = [];
  const ok = (async (u: string | URL | Request, i?: RequestInit) => {
    bodies.push(JSON.parse(String(i?.body)));
    return new Response(JSON.stringify(String(u).endsWith("/getMe") ? { ok: true, result: { id: 7012345678, is_bot: true, username: "LuckyLeafOdeliaBot" } } : { ok: true, result: true }));
  }) as typeof fetch;
  assertEquals(await tgGetMe(TOKEN, ok), { id: "7012345678", username: "LuckyLeafOdeliaBot", groups: true });
  assertEquals(await tgGetMe("not-a-token", ok), null, "a malformed token isn't even sent");
  const secret = tgNewSecret();
  assert(/^[A-Za-z0-9_-]{40,}$/.test(secret));
  assertEquals((await tgSetWebhook(TOKEN, "https://x.supabase.co/functions/v1/chat-events/telegram/ws", secret, ok)).ok, true);
  assertEquals(bodies.at(-1), { url: "https://x.supabase.co/functions/v1/chat-events/telegram/ws", secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true, max_connections: 20 });
  const boom = (async () => { throw new Error(`connect failed: https://api.telegram.org/bot${TOKEN}/setWebhook`); }) as typeof fetch;
  const r = await tgSetWebhook(TOKEN, "https://x", secret, boom);
  assert(!r.ok && !JSON.stringify(r).includes(TOKEN.split(":")[1]), "the error leaves the token out");
  const refused = (async () => new Response(JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" }), { status: 401 })) as typeof fetch;
  assertEquals(await tgGetMe(TOKEN, refused), null);
  assertEquals(tgTokenOk(TOKEN), true);
  assertEquals(tgTokenOk("123:short"), false);
  assertEquals(tgDeepLink("LuckyLeafOdeliaBot", "424242"), "https://t.me/LuckyLeafOdeliaBot?start=424242");
});
