// Team chat links: only each app's own webhook address is accepted, and the daily message stays short.
import { hookDigest, hookUrl, postHook } from "../supabase/functions/_shared/channels.ts";
import { larkDecrypt, larkSigned, larkText, slackSigned, slackText } from "../supabase/functions/_shared/bots.ts";
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
}
if (bad) { console.log(`${bad} failed`); process.exit(1); } else console.log("all passed");
