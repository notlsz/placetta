// Team chat links: only each app's own webhook address is accepted, and the daily message stays short.
import { hookDigest, hookUrl, postHook } from "../supabase/functions/_shared/channels.ts";
import { chatReply, type LarkBot, larkDecrypt, larkOpen, larkSender, larkSigned, larkText, same, type SlackBot, slackManifest, slackSender, slackSigned, slackText, type WechatBot } from "../supabase/functions/_shared/bots.ts";
import { wxDecrypt, wxEncrypt, wxForget, wxSign } from "../supabase/functions/_shared/wechat.ts";
let bad = 0;
const eq = (got: unknown, want: unknown, what: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `: got ${JSON.stringify(got)}`}`); };
const yes = (k: Parameters<typeof hookUrl>[0], u: string) => !!hookUrl(k, u);
eq(yes("slack", "https://hooks.slack.com/services/T000/B000/XXXX"), true, "a Slack webhook");
eq(yes("slack", "https://hooks.slack.com.evil.com/services/T/B/X"), false, "not a look-alike host");
eq(yes("slack", "http://hooks.slack.com/services/T/B/X"), false, "not over http");
eq(yes("lark", "https://open.feishu.cn/open-apis/bot/v2/hook/0f1e2d3c-aaaa"), true, "a Feishu bot");
eq(yes("lark", "https://open.larksuite.com/open-apis/bot/v2/hook/0f1e2d3c-aaaa"), true, "a Lark bot");
eq(yes("lark", "https://open.feishu.cn/open-apis/im/v1/messages"), false, "not another Feishu API");
eq(yes("wecom", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=693a91f6-7xxx-4bc4-97a0-0ec2sifa5aaa"), true, "a WeCom group robot");
eq(yes("wecom", "https://qyapi.weixin.qq.com/cgi-bin/webhook/send"), false, "WeCom needs its key");
eq(yes("teams", "https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x"), true, "a Teams workflow with :443, as Teams writes it");
eq(yes("teams", "https://prod-12.westus.logic.azure.com/workflows/abc/triggers/manual/paths/invoke?sig=x"), true, "a Teams workflow");
eq(yes("teams", "https://default123.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/x"), true, "a Power Automate workflow");
eq(yes("teams", "https://example.com/hook"), false, "not any host");
eq(yes("dingtalk", "https://oapi.dingtalk.com/robot/send?access_token=3f1e2d3c4b5a69788776655443322110aabbccdd"), true, "a DingTalk robot");
eq(yes("dingtalk", "https://oapi.dingtalk.com/robot/send"), false, "DingTalk needs its token");
eq(yes("slack", "https://hooks.slack.com:8443/services/T/B/X"), false, "no other port");
const items = Array.from({ length: 10 }, (_, i) => ({ title: { en: `Item ${i + 1}`, zh: `事项 ${i + 1}` } }));
const en = hookDigest("Moonleaf Tea", items, "en", "https://placetta.com/app/?ws=1");
eq(en.split("\n").length, 11, "a heading, eight lines, the rest counted, a link");
eq(en.split("\n")[0], "Moonleaf Tea: 10 new updates", "the heading");
eq(/—/.test(en), false, "no em dash");
eq(hookDigest("Moonleaf Tea", items.slice(0, 1), "zh", "").split("\n"), ["Moonleaf Tea：1 条新动态", "- 事项 1"], "in Chinese");
eq((await postHook("lark", "https://example.com/x", "hi")).ok, false, "never posts to a link that isn't the app's");
// the bots: Slack's signature, Lark's encryption and signature, the words without the mentions
{
  const secret = "8f742231b10e8888abcd99yyyzzz85a5", body = '{"type":"event_callback"}', ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = "v0=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${body}`)))].map(x => x.toString(16).padStart(2, "0")).join("");
  eq(await slackSigned(secret, ts, sig, body), true, "a request Slack signed is accepted");
  eq(await slackSigned(secret, ts, sig, body + " "), false, "a changed body is refused");
  eq(await slackSigned(secret, String(Number(ts) - 600), sig, body), false, "an old request is refused");
  eq(slackText("<@U07ABC> map our Flushing store"), "map our Flushing store", "the mention comes off a Slack message");
  const ek = "test-encrypt-key", plain = '{"type":"url_verification","challenge":"abc","token":"vt"}';
  const k = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ek)), { name: "AES-CBC" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k, new TextEncoder().encode(plain)));
  const enc = btoa(String.fromCharCode(...iv, ...ct));
  eq(await larkDecrypt(ek, enc), plain, "Lark's encrypted events decrypt");
  const lb = JSON.stringify({ encrypt: enc }), lts = "1700000000", nonce = "n1";
  const lsig = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lts + nonce + ek + lb)))].map(x => x.toString(16).padStart(2, "0")).join("");
  eq([await larkSigned(ek, lts, nonce, lsig, lb), await larkSigned(ek, lts, nonce, lsig, lb + "x")], [true, false], "Lark's signature checks out, and a changed body doesn't");
  eq(larkText('{"text":"@_user_1 帮我办理法拉盛门店的许可"}'), "帮我办理法拉盛门店的许可", "the @ comes off a Lark message");

  // Lark requests: with an Encrypt Key, encrypted and signed (only the URL check may come unsigned); the token always
  const bot: LarkBot = { kind: "lark_bot", app_id: "cli_x", app_secret: "s", verification_token: "vt-123", encrypt_key: ek, domain: "feishu" };
  const seal = async (o: unknown) => {
    const v = crypto.getRandomValues(new Uint8Array(16));
    const c = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: v }, k, new TextEncoder().encode(JSON.stringify(o))));
    const body = JSON.stringify({ encrypt: btoa(String.fromCharCode(...v, ...c)) });
    const sig = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(lts + nonce + ek + body)))].map(x => x.toString(16).padStart(2, "0")).join("");
    return { body, sig };
  };
  const event = { schema: "2.0", header: { event_id: "e1", event_type: "im.message.receive_v1", token: "vt-123", tenant_key: "t1" }, event: {} };
  const signedEv = await seal(event);
  eq(!!(await larkOpen(bot, { ts: lts, nonce, sig: signedEv.sig }, signedEv.body)), true, "Lark: an encrypted, signed event opens");
  eq(await larkOpen(bot, { ts: lts, nonce, sig: null }, signedEv.body), null, "Lark: with an Encrypt Key, an unsigned event is refused");
  eq(await larkOpen(bot, { ts: lts, nonce, sig: "0".repeat(64) }, signedEv.body), null, "Lark: a bad signature is refused");
  eq(await larkOpen(bot, { ts: lts, nonce, sig: null }, JSON.stringify(event)), null, "Lark: with an Encrypt Key, a plain body is refused");
  const check = await seal({ type: "url_verification", challenge: "ch", token: "vt-123" });
  eq((await larkOpen(bot, { ts: null, nonce: null, sig: null }, check.body))?.challenge, "ch", "Lark: the URL check may come unsigned");
  const wrongTok = await seal({ ...event, header: { ...event.header, token: "vt-124" } });
  eq(await larkOpen(bot, { ts: lts, nonce, sig: wrongTok.sig }, wrongTok.body), null, "Lark: a wrong verification token is refused");
  const plainBot: LarkBot = { ...bot, encrypt_key: undefined };
  eq(!!(await larkOpen(plainBot, { ts: null, nonce: null, sig: null }, JSON.stringify(event))), true, "Lark without an Encrypt Key: the token is enough");
  eq(await larkOpen(plainBot, { ts: null, nonce: null, sig: null }, JSON.stringify({ ...event, header: { ...event.header, token: "vt-12" } })), null, "Lark without an Encrypt Key: a wrong token is refused");
  eq(await larkOpen(plainBot, { ts: lts, nonce, sig: signedEv.sig }, signedEv.body), null, "Lark: an encrypted body for a bot with no Encrypt Key is refused");
  eq([same("abc", "abc"), same("abc", "abd"), same("abc", "ab"), same("", "")], [true, false, false, true], "constant-time comparison");
}

// Who's asking in Slack: a full member of the bot's own team, with an email; guests, Slack Connect and the rest are refused
{
  const slackBot: SlackBot = { kind: "slack_bot", bot_token: "xoxb-1", signing_secret: "s" };
  const calls: string[] = [];
  const reply = (body: unknown, scopes = "app_mentions:read,chat:write,users:read,users:read.email") => (async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json", "x-oauth-scopes": scopes } });
  }) as unknown as typeof fetch;
  const user = (u: Record<string, unknown>) => ({ ok: true, user: { id: "U1", team_id: "T1", profile: { email: "Mei@GoldenOx.com" }, ...u } });
  eq(await slackSender(slackBot, { user: "U1", team: "T1" }, "T1", reply(user({}))), { ok: true, email: "mei@goldenox.com" }, "Slack: a member's email");
  eq(calls[0], "https://slack.com/api/users.info?user=U1", "Slack: asks users.info about the sender");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply(user({ is_restricted: true }))), { ok: false, why: "guest" }, "Slack: a multi-channel guest is refused");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply(user({ is_ultra_restricted: true }))), { ok: false, why: "guest" }, "Slack: a single-channel guest is refused");
  calls.length = 0;
  eq(await slackSender(slackBot, { user: "U9", user_team: "T9", team: "T9" }, "T1", reply(user({}))), { ok: false, why: "outsider" }, "Slack Connect: someone from another company is refused");
  eq(calls.length, 0, "Slack Connect: without even looking them up");
  eq(await slackSender(slackBot, { user: "U9" }, "T1", reply(user({ team_id: "T9" }))), { ok: false, why: "outsider" }, "Slack: a user of another team is refused");
  eq(await slackSender(slackBot, { user: "U9" }, "T1", reply(user({ is_stranger: true }))), { ok: false, why: "outsider" }, "Slack: a stranger is refused");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply(user({ is_bot: true }))), { ok: false, why: "unknown" }, "Slack: a bot is refused");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply({ ok: false, error: "missing_scope" })), { ok: false, why: "setup" }, "Slack: without users:read the owner is told what to add");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply(user({ profile: {} }), "chat:write,users:read")), { ok: false, why: "setup" }, "Slack: without users:read.email too");
  eq(await slackSender(slackBot, { user: "U1" }, "T1", reply(user({ profile: {} }))), { ok: false, why: "unknown" }, "Slack: no email, no job");
  eq(await slackSender(slackBot, { user: "U1" }, undefined, reply(user({}))), { ok: false, why: "unknown" }, "Slack: an event without its team is refused");
  const scopes = slackManifest("https://x.test/functions/v1/chat-events?slack=1").oauth_config.scopes.bot;
  eq(["users:read", "users:read.email"].every(s => scopes.includes(s)), true, "the Slack manifest asks for users:read and users:read.email");
}

// Who's asking in Lark: a user of the bot's own tenant, with an email from the contact API
{
  const larkBot: LarkBot = { kind: "lark_bot", app_id: "cli_x", app_secret: "s", verification_token: "vt", domain: "lark" };
  const seen: string[] = [];
  const api = (contact: unknown, token: unknown = { code: 0, tenant_access_token: "t-1" }) => (async (url: string, init?: RequestInit) => {
    seen.push(String(url) + " " + new Headers(init?.headers).get("authorization"));
    return new Response(JSON.stringify(/tenant_access_token/.test(String(url)) ? token : contact), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  const sender = { sender_type: "user", tenant_key: "tk1", sender_id: { open_id: "ou_1" } };
  eq(await larkSender(larkBot, sender, "tk1", api({ code: 0, data: { user: { email: "Mei@GoldenOx.com" } } })), { ok: true, email: "mei@goldenox.com" }, "Lark: a member's email");
  eq(seen[1], "https://open.larksuite.com/open-apis/contact/v3/users/ou_1?user_id_type=open_id Bearer t-1", "Lark: asks the contact API with the tenant token");
  eq(await larkSender(larkBot, { ...sender, tenant_key: "tk2" }, "tk1", api({ code: 0, data: { user: { email: "x@y.z" } } })), { ok: false, why: "outsider" }, "Lark: someone from another company is refused");
  eq(await larkSender(larkBot, { ...sender, sender_type: "app" }, "tk1", api({})), { ok: false, why: "unknown" }, "Lark: an app is refused");
  eq(await larkSender(larkBot, sender, "tk1", api({ code: 99991672, msg: "Access denied" })), { ok: false, why: "setup" }, "Lark: without contact:user.email:readonly the owner is told what to add");
  eq(await larkSender(larkBot, sender, "tk1", api({ code: 0, data: { user: { email: "" } } })), { ok: false, why: "setup" }, "Lark: no email, no job");
  eq(await larkSender(larkBot, sender, "tk1", api({}, { code: 10003 })), { ok: false, why: "setup" }, "Lark: bad app credentials");
  eq(await larkSender(larkBot, sender, "tk1", api({ code: 0, data: { user: { email: "a@b.c", status: { is_resigned: true } } } })), { ok: false, why: "unknown" }, "Lark: someone who left is refused");
}
// WeChat: WeChat's own documented vectors (https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html),
// here under Node too, and an answer going back through the customer service API
{
  const KEY = "A".repeat(43), APPID = "wxba5fad812f8e6fb9";
  eq(await wxSign("AAAAA", "1714037059", "486452656"), "899cf89e464efb63f54ddac96b0a0a235f53aa78", "WeChat: the documented URL-check signature");
  const sealed = await wxEncrypt(KEY, '{"demo_resp":"good luck"}', APPID, new TextEncoder().encode("707722b803182950"));
  eq(sealed, "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==", "WeChat: the documented safe-mode seal");
  eq(await wxSign("AAAAA", "1713424427", "415670741", sealed), "1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1", "WeChat: the documented reply signature");
  eq(await wxDecrypt(KEY, sealed, APPID), '{"demo_resp":"good luck"}', "WeChat: it opens again");
  eq(await wxDecrypt(KEY, sealed, "wx0000000000000000"), null, "WeChat: not for another account");
  const wx: WechatBot = { kind: "wechat_bot", app_id: "wx00000000000000a1", app_secret: "s", token: "t" };
  const calls: [string, { text?: { content?: string }; touser?: string; aimsgcontext?: unknown } | null][] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push([String(url), init?.body ? JSON.parse(String(init.body)) : null]);
    return new Response(JSON.stringify(String(url).includes("stable_token") ? { access_token: "T", expires_in: 7200 } : { errcode: 0, errmsg: "ok" }), { status: 200 });
  }) as unknown as typeof fetch;
  wxForget(wx.app_id);
  const sent = await chatReply(wx, { kind: "wechat", openid: "oMei000000000000" }, "Your health permit renews by Nov 3.", { tail: "\n\nWaiting for your approval: https://placetta.com/app/?ws=1" });
  const slackish = await chatReply(wx, { kind: "slack", channel: "C1", thread_ts: "1" }, "x");
  globalThis.fetch = real;
  eq([sent, calls.map(c => c[0].replace(/access_token=\w+/, "access_token=…"))], [true, ["https://api.weixin.qq.com/cgi-bin/stable_token", "https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=…"]], "WeChat: a token, then the answer by customer service message");
  eq([calls[1][1]?.touser, calls[1][1]?.text?.content, calls[1][1]?.aimsgcontext], ["oMei000000000000", "Your health permit renews by Nov 3.\n\nWaiting for your approval: https://placetta.com/app/?ws=1", { is_ai_msg: 1 }], "WeChat: to the follower who asked, link and all, marked as written by AI");
  eq(slackish, false, "a WeChat account never answers in a Slack thread");
}
if (bad) { console.log(`${bad} failed`); process.exit(1); } else console.log("all passed");
