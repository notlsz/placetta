// Run: deno test -A supabase/functions/_shared/wechat_test.ts
// The vectors are WeChat's own, from its safe-mode guide (https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html):
// Token "AAAAA", EncodingAESKey "A" x 43, AppID wxba5fad812f8e6fb9.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { cdata, parseXml, textXml, type WechatBot, WX_SAY, wxAccessToken, wxCredsWork, wxDecrypt, type WxDeps, wxEncrypt, wxForget, wxHandle, wxKeyBytes, wxLinkCode, wxNewSecrets, wxOpen, wxReply, wxSendText, wxSign, wxSplit, wxTokenProblem, wxUrlCheck, wxWords } from "./wechat.ts";
import { NOT_TEAMMATE } from "./bots.ts";

const TOKEN = "AAAAA", KEY = "A".repeat(43), APPID = "wxba5fad812f8e6fb9";
const bot: WechatBot = { kind: "wechat_bot", app_id: APPID, app_secret: "secret", token: TOKEN, aes_key: KEY };
const at = (ts: number) => ts * 1000 + 2000;   // "now" a moment after WeChat's timestamp
// WeChat's sealed push (JSON in the guide's example; the Encrypt field is the same whatever the wrapper)
const ENCRYPT = "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVzazhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwKSqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=";
const INNER = '{"ToUserName":"gh_97417a04a28d","FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","CreateTime":1714112445,"MsgType":"event","Event":"debug_demo","debug_str":"hello world"}';

Deno.test("plaintext signature: WeChat's documented example", async () => {
  assertEquals(await wxSign(TOKEN, "1714037059", "486452656"), "899cf89e464efb63f54ddac96b0a0a235f53aa78");
  assertEquals(await wxSign("486452656", TOKEN, "1714037059"), "899cf89e464efb63f54ddac96b0a0a235f53aa78", "order doesn't matter: the parts are sorted");
});

Deno.test("the URL check answers echostr only to a signed, recent request", async () => {
  const q = (o: Record<string, string>) => new URLSearchParams({ signature: "899cf89e464efb63f54ddac96b0a0a235f53aa78", timestamp: "1714037059", nonce: "486452656", echostr: "5739285619383", ...o });
  assertEquals(await wxUrlCheck(TOKEN, q({}), at(1714037059)), "5739285619383");
  assertEquals(await wxUrlCheck(TOKEN, q({ signature: "899CF89E464EFB63F54DDAC96B0A0A235F53AA78" }), at(1714037059)), "5739285619383", "hex case doesn't matter");
  assertEquals(await wxUrlCheck("AAAAB", q({}), at(1714037059)), null, "another token");
  assertEquals(await wxUrlCheck(TOKEN, q({ nonce: "486452657" }), at(1714037059)), null, "a changed nonce");
  assertEquals(await wxUrlCheck(TOKEN, q({}), at(1714037059) + 2 * 3600_000), null, "two hours later");
  assertEquals(await wxUrlCheck("", q({}), at(1714037059)), null, "no token saved");
  const noEcho = q({}); noEcho.delete("echostr");
  assertEquals(await wxUrlCheck(TOKEN, noEcho, at(1714037059)), null, "no echostr");
});

Deno.test("safe mode: WeChat's documented msg_signature over the Encrypt field", async () => {
  // the guide's URL carries 046e02f8204d34f8ba5fa3b1db94908f3df2e9b3 (its prose copy drops some digits)
  assertEquals(await wxSign(TOKEN, "1714112445", "415670741", ENCRYPT), "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3");
});

Deno.test("safe mode: WeChat's documented message opens, and only for its AppID", async () => {
  assertEquals(wxKeyBytes(KEY)?.length, 32);
  assertEquals(wxKeyBytes("A".repeat(42)), null);
  assertEquals(wxKeyBytes("A".repeat(42) + "="), null);
  const inner = await wxDecrypt(KEY, ENCRYPT, APPID);
  assertEquals(inner, INNER);
  assertEquals(new TextEncoder().encode(inner!).length, 167, "msg_len is 167, as the guide says");
  assertEquals(await wxDecrypt(KEY, ENCRYPT, "wx0000000000000000"), null, "sealed for another account");
  assertEquals(await wxDecrypt("B".repeat(43), ENCRYPT, APPID), null, "another key");
  assertEquals(await wxDecrypt(KEY, ENCRYPT.slice(0, -8) + "AAAAAAA=", APPID), null, "a damaged message");
  assertEquals(await wxDecrypt(KEY, "not base64!", APPID), null);
});

Deno.test("safe mode: sealing WeChat's documented reply gives its Encrypt and MsgSignature", async () => {
  const random = new TextEncoder().encode("707722b803182950");
  const sealed = await wxEncrypt(KEY, '{"demo_resp":"good luck"}', APPID, random);
  assertEquals(sealed, "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==");
  assertEquals(await wxSign(TOKEN, "1713424427", "415670741", sealed), "1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1");
  assertEquals(await wxDecrypt(KEY, sealed, APPID), '{"demo_resp":"good luck"}', "and it opens again");
  // a message whose length is already a multiple of 32 gets a whole block of padding (32 bytes of 32)
  const exact = "x".repeat(32 - ((16 + 4 + APPID.length) % 32)) + "y".repeat(32);
  assertEquals(await wxDecrypt(KEY, await wxEncrypt(KEY, exact, APPID), APPID), exact);
  const zh = "您好，帮我查一下法拉盛门店的营业执照什么时候到期？";
  assertEquals(await wxDecrypt(KEY, await wxEncrypt(KEY, zh, APPID), APPID), zh, "Chinese text round trips");
});

const textMsg = (content: string, extra = "") =>
  `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><FromUserName><![CDATA[o9AgO5Kd5ggOC-bXrbNODIiE3bGY]]></FromUserName><CreateTime>1714112445</CreateTime><MsgType><![CDATA[text]]></MsgType><Content>${cdata(content)}</Content><MsgId>24561234567890123</MsgId>${extra}</xml>`;

Deno.test("XML: WeChat's documented text message, CDATA, entities and nesting", () => {
  // the example from https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_standard_messages.html
  const doc = "<xml>\n  <ToUserName><![CDATA[toUser]]></ToUserName>\n  <FromUserName><![CDATA[fromUser]]></FromUserName>\n  <CreateTime>1348831860</CreateTime>\n  <MsgType><![CDATA[text]]></MsgType>\n  <Content><![CDATA[this is a test]]></Content>\n  <MsgId>1234567890123456</MsgId>\n  <MsgDataId>xxxx</MsgDataId>\n  <Idx>xxxx</Idx>\n</xml>";
  assertEquals(parseXml(doc), { ToUserName: "toUser", FromUserName: "fromUser", CreateTime: "1348831860", MsgType: "text", Content: "this is a test", MsgId: "1234567890123456", MsgDataId: "xxxx", Idx: "xxxx" });
  const tricky = "a </Content> b ]]> c <xml> 中文";
  assertEquals(parseXml(textMsg(tricky)).Content, tricky, "a message that contains XML-looking text and ]]> survives");
  assertEquals(parseXml("<xml><A>1 &lt; 2 &amp;&#x4e2d;</A><B/><Video><MediaId><![CDATA[m1]]></MediaId><Title>t</Title></Video></xml>"), { A: "1 < 2 &中", B: "", "Video.MediaId": "m1", "Video.Title": "t" });
  for (const bad of ["", "{}", "<xml><A>1</xml>", "<xml><A><![CDATA[x</A></xml>", "<notxml/>"]) {
    let threw = false; try { parseXml(bad); } catch { threw = true; }
    assert(threw, `refused: ${bad}`);
  }
});

Deno.test("XML: a passive text reply, built and read back", () => {
  const x = textXml("o9AgO5Kd5ggOC-bXrbNODIiE3bGY", "gh_97417a04a28d", "收到 ]]> ok", 1714112447000);
  assertEquals(x, "<xml><ToUserName><![CDATA[o9AgO5Kd5ggOC-bXrbNODIiE3bGY]]></ToUserName><FromUserName><![CDATA[gh_97417a04a28d]]></FromUserName><CreateTime>1714112447</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[收到 ]]]]><![CDATA[> ok]]></Content></xml>");
  assertEquals(parseXml(x).Content, "收到 ]]> ok");
});

Deno.test("a pushed message: plaintext mode", async () => {
  const plainBot = { ...bot, aes_key: undefined };
  const ts = "1714112445", nonce = "415670741", sig = await wxSign(TOKEN, ts, nonce);
  const q = new URLSearchParams({ signature: sig, timestamp: ts, nonce, openid: "o9AgO5Kd5ggOC-bXrbNODIiE3bGY" });
  const got = await wxOpen(plainBot, q, textMsg("我的卫生许可证什么时候到期？"), at(1714112445));
  assertEquals(got?.sealed, false);
  assertEquals(got?.msg.Content, "我的卫生许可证什么时候到期？");
  assertEquals(await wxOpen(plainBot, new URLSearchParams({ ...Object.fromEntries(q), signature: "0".repeat(40) }), textMsg("x"), at(1714112445)), null, "a wrong signature");
  assertEquals(await wxOpen(plainBot, q, textMsg("x"), at(1714112445) + 3 * 3600_000), null, "too old");
  assertEquals(await wxOpen(plainBot, q, `<xml><ToUserName><![CDATA[gh]]></ToUserName><Encrypt><![CDATA[${ENCRYPT}]]></Encrypt></xml>`, at(1714112445)), null, "a sealed body without an EncodingAESKey saved");
  assertEquals(await wxOpen(plainBot, q, "not xml", at(1714112445)), null);
  // plaintext replies are plain XML
  const r = await wxReply(plainBot, got!.msg, "On it.", { sealed: false, nonce, now: at(1714112445) });
  assertEquals(parseXml(r), { ToUserName: "o9AgO5Kd5ggOC-bXrbNODIiE3bGY", FromUserName: "gh_97417a04a28d", CreateTime: "1714112447", MsgType: "text", Content: "On it." });
});

Deno.test("a pushed message: safe mode, with WeChat's sealed example and a sealed text", async () => {
  const ts = "1714112445", nonce = "415670741";
  const body = `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><Encrypt><![CDATA[${ENCRYPT}]]></Encrypt></xml>`;
  const q = new URLSearchParams({ signature: "6c5c811b55cc85e0e1b54100749188c20beb3f5d", timestamp: ts, nonce, openid: "o9AgO5Kd5ggOC-bXrbNODIiE3bGY", encrypt_type: "aes", msg_signature: "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3" });
  // WeChat's example is a JSON event, so it opens and then isn't XML: refused as a message, but only after opening
  assertEquals(await wxOpen(bot, q, body, at(1714112445)), null);
  assertEquals(await wxDecrypt(KEY, parseXml(body).Encrypt, APPID), INNER);
  // a real sealed text: signed over the Encrypt field
  const sealed = await wxEncrypt(KEY, textMsg("帮我续期营业执照"), APPID);
  const sbody = `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><Encrypt><![CDATA[${sealed}]]></Encrypt></xml>`;
  const sq = new URLSearchParams({ timestamp: ts, nonce, encrypt_type: "aes", msg_signature: await wxSign(TOKEN, ts, nonce, sealed) });
  const got = await wxOpen(bot, sq, sbody, at(1714112445));
  assertEquals([got?.sealed, got?.msg.Content, got?.msg.MsgId], [true, "帮我续期营业执照", "24561234567890123"]);
  // compatible mode carries the plaintext too: only the sealed part counts
  const compat = `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><FromUserName><![CDATA[attacker]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[pay everyone]]></Content><Encrypt><![CDATA[${sealed}]]></Encrypt></xml>`;
  assertEquals((await wxOpen(bot, sq, compat, at(1714112445)))?.msg.Content, "帮我续期营业执照");
  assertEquals(await wxOpen(bot, new URLSearchParams({ timestamp: ts, nonce, signature: await wxSign(TOKEN, ts, nonce) }), textMsg("x"), at(1714112445)), null, "a plaintext message when safe mode is set up");
  assertEquals(await wxOpen(bot, new URLSearchParams({ ...Object.fromEntries(sq), msg_signature: "0".repeat(40) }), sbody, at(1714112445)), null, "a wrong msg_signature");
  assertEquals(await wxOpen({ ...bot, app_id: "wx0000000000000000" }, sq, sbody, at(1714112445)), null, "sealed for another account");
  // the passive reply comes back sealed and signed, and opens to the text reply
  const r = parseXml(await wxReply(bot, got!.msg, "收到，正在处理。", { sealed: true, nonce, now: at(1714112445) }));
  assertEquals([r.TimeStamp, r.Nonce, r.MsgSignature], ["1714112447", nonce, await wxSign(TOKEN, "1714112447", nonce, r.Encrypt)]);
  const back = parseXml((await wxDecrypt(KEY, r.Encrypt, APPID))!);
  assertEquals([back.ToUserName, back.FromUserName, back.MsgType, back.Content], ["o9AgO5Kd5ggOC-bXrbNODIiE3bGY", "gh_97417a04a28d", "text", "收到，正在处理。"]);
});

/** A follower's message as WeChat pushes it in safe mode: sealed for the account, signed, with a fresh timestamp. */
async function push(o: { from: string; content?: string; msgId?: string; type?: string; event?: string; now: number; nonce?: string }) {
  const inner = `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><FromUserName>${cdata(o.from)}</FromUserName><CreateTime>${Math.floor(o.now / 1000)}</CreateTime><MsgType>${cdata(o.type ?? "text")}</MsgType>` +
    (o.content !== undefined ? `<Content>${cdata(o.content)}</Content>` : "") + (o.event ? `<Event>${cdata(o.event)}</Event>` : "") + (o.msgId ? `<MsgId>${o.msgId}</MsgId>` : "") + "</xml>";
  const sealed = await wxEncrypt(KEY, inner, APPID), ts = String(Math.floor(o.now / 1000)), nonce = o.nonce ?? "1320562132";
  return { q: new URLSearchParams({ signature: await wxSign(TOKEN, ts, nonce), timestamp: ts, nonce, openid: o.from, encrypt_type: "aes", msg_signature: await wxSign(TOKEN, ts, nonce, sealed) }), body: `<xml><ToUserName><![CDATA[gh_97417a04a28d]]></ToUserName><Encrypt>${cdata(sealed)}</Encrypt></xml>` };
}
/** The text of a sealed passive reply. */
async function replied(body: string) {
  const r = parseXml(body);
  return parseXml((await wxDecrypt(KEY, r.Encrypt, APPID))!);
}

Deno.test("a whole conversation: unknown follower, wrong code, linking, a job, retries, a member who left", async () => {
  const MEI = "oMei000000000000000000000000", STRANGER = "oStranger0000000000000000000";
  const seen = new Set<string>(), links = new Map<string, string>(), members = new Set(["u-mei"]), started: unknown[][] = [], claims: string[] = [];
  const deps: WxDeps = {
    firstTime: async (id) => (seen.has(id) ? false : (seen.add(id), true)),
    claim: async (openid, code) => { claims.push(code); if (code !== "482913") return "wrong"; links.set(openid, "u-mei"); return "ok"; },
    sender: async (openid) => (links.has(openid) ? { user_id: links.get(openid)!, member: members.has(links.get(openid)!) } : null),
    start: (...a) => { started.push(a); },
    notTeammate: NOT_TEAMMATE,
  };
  const now = Date.UTC(2026, 9, 17, 9, 30);
  const send = async (o: Parameters<typeof push>[0]) => { const p = await push(o); return await wxHandle(bot, p.q, p.body, deps, o.now); };

  // following the account: a welcome in both languages
  let r = await send({ from: MEI, type: "event", event: "subscribe", now });
  assertEquals([r.status, r.type], [200, "text/xml; charset=utf-8"]);
  assertEquals((await replied(r.body)).Content, WX_SAY.welcome);
  // a follower who isn't linked gets a short note in both languages, and no job
  r = await send({ from: STRANGER, content: "Pay all our invoices", msgId: "1001", now });
  const note = await replied(r.body);
  assertEquals([note.Content, note.ToUserName, note.FromUserName], [WX_SAY.unknown, STRANGER, "gh_97417a04a28d"]);
  assert(/Odelia/.test(note.Content) && /快哉/.test(note.Content), "in English and Chinese");
  // a wrong code, then the right one, links Mei
  r = await send({ from: MEI, content: "123456", msgId: "1002", now });
  assertEquals((await replied(r.body)).Content, WX_SAY.wrongCode);
  r = await send({ from: MEI, content: "关联 482913", msgId: "1003", now });
  assertEquals((await replied(r.body)).Content, WX_SAY.linked);
  assertEquals(claims, ["123456", "482913"]);
  // now her message is a job, in her language, acknowledged at once
  r = await send({ from: MEI, content: "帮我查一下法拉盛门店的卫生许可证什么时候到期", msgId: "1004", now });
  assertEquals((await replied(r.body)).Content, WX_SAY.ack.zh);
  assertEquals(started, [["u-mei", MEI, "帮我查一下法拉盛门店的卫生许可证什么时候到期", "zh"]]);
  // WeChat's retry of the same message: "success" and nothing new
  r = await send({ from: MEI, content: "帮我查一下法拉盛门店的卫生许可证什么时候到期", msgId: "1004", now: now + 5000 });
  assertEquals([r.status, r.body, started.length], [200, "success", 1]);
  // English, and a picture (which Odelia can't read here)
  r = await send({ from: MEI, content: "When is our health permit due?", msgId: "1005", now });
  assertEquals([(await replied(r.body)).Content, (started[1] as string[])[3]], [WX_SAY.ack.en, "en"]);
  r = await send({ from: MEI, type: "image", msgId: "1006", now });
  assertEquals((await replied(r.body)).Content, WX_SAY.textOnly);
  // Mei leaves the workspace: her WeChat is known, but she can't give jobs any more
  members.delete("u-mei");
  r = await send({ from: MEI, content: "Renew the permit", msgId: "1007", now });
  assertEquals([(await replied(r.body)).Content, started.length], [NOT_TEAMMATE, 2]);
  // other events need no answer
  r = await send({ from: MEI, type: "event", event: "unsubscribe", now: now + 1000 });
  assertEquals(r.body, "success");
});

Deno.test("a request that isn't from WeChat gets nothing", async () => {
  const deps: WxDeps = { firstTime: async () => true, claim: async () => "ok", sender: async () => ({ user_id: "u", member: true }), start: () => { throw new Error("no job"); }, notTeammate: NOT_TEAMMATE };
  const now = Date.UTC(2026, 9, 17, 9, 30);
  const p = await push({ from: "oMei000000000000000000000000", content: "hi", msgId: "1", now });
  const forged = new URLSearchParams(p.q); forged.set("msg_signature", "0".repeat(40));
  assertEquals(await wxHandle(bot, forged, p.body, deps, now), { status: 401, type: "text/plain; charset=utf-8", body: "" });
  assertEquals((await wxHandle(bot, p.q, p.body, deps, now + 2 * 3600_000)).status, 401, "replayed two hours later");
  assertEquals((await wxHandle({ ...bot, token: "other" }, p.q, p.body, deps, now)).status, 401, "another account's Token");
  // a sealed message whose sender isn't an OpenID: nothing to do
  const odd = await push({ from: "bad id!", content: "hi", msgId: "2", now });
  assertEquals((await wxHandle(bot, odd.q, odd.body, deps, now)).body, "success");
});

Deno.test("words and link codes", () => {
  assertEquals(wxWords({ MsgType: "text", Content: "  map our   Flushing store " }), "map our Flushing store");
  assertEquals(wxWords({ MsgType: "voice", Recognition: "营业执照" }), "营业执照");
  assertEquals(wxWords({ MsgType: "image", PicUrl: "x" }), "");
  assertEquals(["123456", " 654321 ", "LINK 123456", "link:123456", "关联 123456", "绑定：123456"].map(wxLinkCode), ["123456", "654321", "123456", "123456", "123456", "123456"]);
  assertEquals(["12345", "1234567", "my code is 123456", "123456 please", "abcdef"].map(wxLinkCode), [null, null, null, null, null]);
});

Deno.test("splitting an answer: bytes, the approval link kept whole, a cut marked", () => {
  assertEquals(wxSplit("short", { tail: "\n\nLink" }), ["short\n\nLink"]);
  const zh = "执照".repeat(1500);   // 9000 bytes
  const parts = wxSplit(zh, { tail: "\n\n等您批准：https://placetta.com/app/?ws=1" });
  assertEquals(parts.length, 3);
  assert(parts.every((p) => new TextEncoder().encode(p).length <= 2000), "each under 2000 bytes");
  assert(parts[2].endsWith("…\n\n等您批准：https://placetta.com/app/?ws=1"), "the last ends with … and the whole link");
  const two = wxSplit("a ".repeat(1500), { max: 3 });
  assertEquals(two.length, 2);
  assertEquals(two.join(" "), "a ".repeat(1500).trim(), "cut at a space, nothing lost");
  assertEquals(wxSplit("x".repeat(30), { bytes: 10, max: 1 }), ["xxxxxxx…"], "one text at most: cut with …");
});

Deno.test("token problems by WeChat's codes", () => {
  assertEquals([40164, 61004, 89503, 89506, 89507, 40125, 40013, -1, undefined].map(wxTokenProblem), ["ip", "ip", "confirm", "refused", "refused", "credentials", "credentials", "unreachable", "unreachable"]);
});

type Call = { url: string; body: Record<string, unknown> };
function fake(replies: ((c: Call) => unknown)[]) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(url), body: JSON.parse(String(init?.body ?? "{}")) };
    calls.push(c);
    const r = replies[Math.min(calls.length - 1, replies.length - 1)](c);
    return new Response(JSON.stringify(r), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

Deno.test("the API token: stable_token, cached, saved, refetched when WeChat rejects it", async () => {
  wxForget(APPID);
  const b: WechatBot = { ...bot };
  const saved: (string | undefined)[] = [];
  const { f, calls } = fake([() => ({ access_token: "T1", expires_in: 7200 }), () => ({ errcode: 0, errmsg: "ok" })]);
  const t = await wxAccessToken(b, { f, save: async (x) => { saved.push(x.access_token); } });
  assertEquals(t, { token: "T1" });
  assertEquals(calls[0], { url: "https://api.weixin.qq.com/cgi-bin/stable_token", body: { grant_type: "client_credential", appid: APPID, secret: "secret", force_refresh: false } });
  assertEquals(saved, ["T1"]);
  await wxAccessToken(b, { f });
  assertEquals(calls.length, 1, "the second ask uses the cached token");
  wxForget(APPID);
  await wxAccessToken(b, { f });
  assertEquals(calls.length, 1, "another instance uses the vault copy");
  await wxAccessToken({ ...b, expires_at: Date.now() + 5 * 60_000 }, { f: fake([() => ({ access_token: "T2", expires_in: 7200 })]).f });
  assertEquals((await wxAccessToken(b, {})), { token: "T2" }, "under 6 minutes left: fetched again");
  // sending: a token WeChat no longer accepts is fetched again, then the send goes through
  wxForget(APPID);
  const s = fake([() => ({ access_token: "OLD", expires_in: 7200 }), () => ({ errcode: 40001, errmsg: "invalid credential" }), () => ({ access_token: "NEW", expires_in: 7200 }), () => ({ errcode: 0 })]);
  const sent = await wxSendText({ ...bot }, "o9Ag", "您的营业执照 2027 年 3 月到期。", { f: s.f, tail: "\n\n等您批准：https://placetta.com/app/" });
  assertEquals(sent, { ok: true });
  assertEquals(s.calls.map((c) => c.url.replace(/access_token=\w+/, "access_token=$")), ["https://api.weixin.qq.com/cgi-bin/stable_token", "https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=$", "https://api.weixin.qq.com/cgi-bin/stable_token", "https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=$"]);
  assertEquals(s.calls[3].url.endsWith("access_token=NEW"), true);
  assertEquals(s.calls[3].body, { touser: "o9Ag", msgtype: "text", text: { content: "您的营业执照 2027 年 3 月到期。\n\n等您批准：https://placetta.com/app/" }, aimsgcontext: { is_ai_msg: 1 } });
  assertEquals(s.calls[2].body.force_refresh, false, "asked again in normal mode first");
  // 48 hours passed: WeChat says so and nothing is retried
  wxForget(APPID);
  const late = fake([() => ({ access_token: "T3", expires_in: 7200 }), () => ({ errcode: 45015, errmsg: "response out of time limit" })]);
  assertEquals(await wxSendText({ ...bot }, "o9Ag", "x", { f: late.f }), { ok: false, errcode: 45015 });
  assertEquals(late.calls.length, 2);
});

Deno.test("checking pasted credentials", async () => {
  assertEquals((await wxCredsWork(APPID, "s", fake([() => ({ access_token: "T", expires_in: 7200 })]).f)).ok, true);
  assertEquals(await wxCredsWork(APPID, "s", fake([() => ({ errcode: 40125, errmsg: "invalid appsecret" })]).f), { ok: false, problem: "credentials", code: 40125 });
  assertEquals(await wxCredsWork(APPID, "s", fake([() => ({ errcode: 40164, errmsg: "invalid ip" })]).f), { ok: false, problem: "ip", code: 40164 });
  assertEquals(await wxCredsWork(APPID, "s", fake([() => ({ errcode: 89503, errmsg: "need confirm" })]).f), { ok: false, problem: "confirm", code: 89503 });
  const down = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assertEquals(await wxCredsWork(APPID, "s", down), { ok: false, problem: "unreachable", code: undefined });
});

Deno.test("suggested Token and EncodingAESKey are the shapes WeChat takes", () => {
  const s = wxNewSecrets();
  assert(/^[A-Za-z0-9]{32}$/.test(s.token));
  assert(wxKeyBytes(s.aes_key)?.length === 32);
});
