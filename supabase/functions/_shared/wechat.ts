// Talk to Odelia from WeChat. Chinese store owners live in WeChat, so a business can point its own WeChat Official
// Account (a verified service account, 认证服务号) at Placetta: a teammate links their WeChat once by sending the
// 6-digit code Settings shows them, then messages the account like a coworker. Odelia takes the job as that teammate
// and answers in the same chat. Everything here is the WeChat side: checking that a request really came from WeChat,
// opening and sealing safe-mode messages, reading and writing WeChat's XML, and sending answers through the customer
// service message API. Nothing here touches the database: callers pass in what to save.
//
// WeChat's own documents, for each piece:
//   the server address and its URL check   https://developers.weixin.qq.com/doc/service/guide/dev/push/
//   safe mode (AES) and its test vectors    https://developers.weixin.qq.com/doc/service/guide/dev/push/encryption.html
//   text messages pushed to the server      https://developers.weixin.qq.com/doc/service/guide/product/message/Receiving_standard_messages.html
//   answering within 5 seconds (passive)    https://developers.weixin.qq.com/doc/service/guide/product/message/Passive_user_reply_message.html
//   customer service messages (48 hours)    https://developers.weixin.qq.com/doc/service/api/customer/message/api_sendcustommessage
//   the stable access token                 https://developers.weixin.qq.com/doc/service/api/base/api_getstableaccesstoken
//   API calls, the IP whitelist, 89503      https://developers.weixin.qq.com/doc/service/guide/dev/api/

/** The account's credentials, as saved in the vault. access_token and expires_at (epoch ms) are WeChat's API token,
 *  cached with the credentials so every server instance shares one. */
export type WechatBot = { kind: "wechat_bot"; app_id: string; app_secret: string; token: string; aes_key?: string; access_token?: string; expires_at?: number | null };

const enc = new TextEncoder(), dec = new TextDecoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64bytes = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytesB64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
/** Constant-time comparison of two strings. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ------------------------------------------------------------------ signatures */

/** WeChat's signature: the strings sorted in dictionary order, joined, then SHA-1 in hex. The URL check and plaintext
 *  messages sign the token, timestamp and nonce; safe mode adds the Encrypt field (msg_signature). */
export async function wxSign(...parts: string[]): Promise<string> {
  const joined = [...parts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join("");
  return hex(await crypto.subtle.digest("SHA-1", enc.encode(joined)));
}

/** A WeChat timestamp close enough to now (an hour either way), so an old request can't be played again later. MsgId
 *  dedupe covers anything sooner. */
export const wxFresh = (ts: string | null, now = Date.now()) => !!ts && /^\d{1,12}$/.test(ts) && Math.abs(now / 1000 - Number(ts)) <= 3600;

/** The URL check WeChat sends (GET) when the server address is saved in its console: answer echostr, exactly as it
 *  came, when the signature over the token, timestamp and nonce matches; null otherwise. */
export async function wxUrlCheck(token: string, q: URLSearchParams, now = Date.now()): Promise<string | null> {
  const sig = q.get("signature"), ts = q.get("timestamp"), nonce = q.get("nonce"), echo = q.get("echostr");
  if (!token || !sig || !ts || !nonce || echo === null || !wxFresh(ts, now)) return null;
  return same(await wxSign(token, ts, nonce), sig.toLowerCase()) ? echo : null;
}

/* ------------------------------------------------------------------ safe mode (AES) */
// AESKey = Base64_Decode(EncodingAESKey + "="), 32 bytes; AES-256-CBC with the first 16 bytes of the key as the IV;
// the plaintext is random(16) + length(4, network order) + message + AppID, padded PKCS#7 to a multiple of 32 bytes.
// Web Crypto only speaks 16-byte PKCS#7, so the WeChat padding is added and removed here and Web Crypto's own block is
// kept out of the way: sliced off after encrypting, and supplied (one extra block) before decrypting.

/** The 32-byte key from an EncodingAESKey (43 letters and digits), or null when it isn't one. */
export function wxKeyBytes(encodingAesKey: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9]{43}$/.test(encodingAesKey ?? "")) return null;
  try { const b = b64bytes(encodingAesKey + "="); return b.length === 32 ? b : null; } catch { return null; }
}

async function aesKey(raw: Uint8Array<ArrayBuffer>) {
  return await crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
}

/** Opens a safe-mode Encrypt field: the message inside, or null when it doesn't open or wasn't sealed for this AppID. */
export async function wxDecrypt(encodingAesKey: string, encrypted: string, appId: string): Promise<string | null> {
  const raw = wxKeyBytes(encodingAesKey);
  if (!raw) return null;
  let ct: Uint8Array<ArrayBuffer>;
  try { ct = b64bytes(encrypted); } catch { return null; }
  if (!ct.length || ct.length % 16) return null;
  try {
    const key = await aesKey(raw), iv = raw.slice(0, 16);
    // one more block that decrypts to sixteen 0x10 bytes, a full block of standard padding, so Web Crypto's check passes
    // and strips exactly that block, leaving WeChat's own padding for us
    const extra = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: ct.slice(ct.length - 16) }, key, new Uint8Array(16).fill(16))).slice(0, 16);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, concat(ct, extra)));
    // WeChat's padding: 1 to 32 bytes, each the count (its sample code treats anything else as none)
    let pad = plain[plain.length - 1];
    if (pad < 1 || pad > 32) pad = 0;
    const body = plain.slice(16, plain.length - pad);
    if (body.length < 4) return null;
    const len = new DataView(body.buffer, body.byteOffset, 4).getUint32(0, false);
    if (len > body.length - 4) return null;
    const msg = dec.decode(body.slice(4, 4 + len)), from = dec.decode(body.slice(4 + len));
    return from === appId ? msg : null;
  } catch { return null; }
}

/** Seals a message for WeChat in safe mode. random is the 16 bytes WeChat's format starts with (fresh ones by default;
 *  tests pass the documented ones). */
export async function wxEncrypt(encodingAesKey: string, msg: string, appId: string, random?: Uint8Array): Promise<string> {
  const raw = wxKeyBytes(encodingAesKey);
  if (!raw) throw new Error("not an EncodingAESKey");
  const m = enc.encode(msg), len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, m.length, false);
  const full = concat(random ?? crypto.getRandomValues(new Uint8Array(16)), len, m, enc.encode(appId));
  const pad = 32 - (full.length % 32);
  const padded = concat(full, new Uint8Array(pad).fill(pad));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: raw.slice(0, 16) }, await aesKey(raw), padded));
  return bytesB64(ct.slice(0, padded.length));   // without Web Crypto's extra padding block
}

/* ------------------------------------------------------------------ XML */

const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const unescape = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
  if (e[0] !== "#") return ENTITY[e.toLowerCase()] ?? m;
  const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
});

/**
 * WeChat's XML as a flat map: each element under <xml> by its name, nested ones as "Parent.Child". Text inside CDATA is
 * taken as it is (a value split across CDATA sections, which is how "]]>" is written, is joined back), other text is
 * unescaped. Throws on anything that isn't a WeChat message.
 */
export function parseXml(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const start = s.indexOf("<xml>"), end = s.lastIndexOf("</xml>");
  if (start < 0 || end < start) throw new Error("not WeChat XML");
  const element = (i: number, prefix: string, depth: number): number => {
    const m = /^<([A-Za-z_][\w.-]*)[^>]*?(\/?)>/.exec(s.slice(i, i + 200));
    if (!m || depth > 4) throw new Error("bad XML");
    const name = m[1], key = prefix + name;
    let j = i + m[0].length;
    if (m[2] === "/") { out[key] ??= ""; return j; }
    const close = `</${name}>`;
    const cdata: string[] = [], text: string[] = [];
    let children = false;
    for (;;) {
      if (j >= end) throw new Error("unclosed element");
      if (s.startsWith("<![CDATA[", j)) {
        const k = s.indexOf("]]>", j + 9);
        if (k < 0) throw new Error("unclosed CDATA");
        cdata.push(s.slice(j + 9, k)); j = k + 3;
      } else if (s.startsWith(close, j)) { j += close.length; break; }
      else if (s.startsWith("<!--", j)) { const k = s.indexOf("-->", j); if (k < 0) throw new Error("unclosed comment"); j = k + 3; }
      else if (s[j] === "<") { children = true; j = element(j, key + ".", depth + 1); }
      else { const k = s.indexOf("<", j); if (k < 0) throw new Error("bad XML"); text.push(s.slice(j, k)); j = k; }
    }
    // the value: CDATA as it is (whitespace between sections ignored), or the text, unescaped and trimmed
    const value = cdata.length ? cdata.join("") + text.filter((t) => t.trim()).map(unescape).join("") : unescape(text.join("")).trim();
    if (!children || value) out[key] = value;
    return j;
  };
  let i = start + 5;
  while (i < end) {
    const k = s.indexOf("<", i);
    if (k < 0 || k >= end) break;
    if (s.startsWith("<!--", k)) { const c = s.indexOf("-->", k); if (c < 0) throw new Error("unclosed comment"); i = c + 3; continue; }
    i = element(k, "", 0);
  }
  return out;
}

/** Text inside CDATA, with any "]]>" split across two sections so it can't end the section early. */
export const cdata = (s: string) => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

/** A text message back to whoever wrote (a passive reply): to their OpenID, from the account. */
export function textXml(toOpenId: string, fromAccount: string, content: string, now = Date.now()): string {
  return `<xml><ToUserName>${cdata(toOpenId)}</ToUserName><FromUserName>${cdata(fromAccount)}</FromUserName><CreateTime>${Math.floor(now / 1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content>${cdata(content)}</Content></xml>`;
}

/* ------------------------------------------------------------------ a request from WeChat */

/** A message WeChat pushed: its fields, and whether it came sealed (then the passive reply must be sealed too). */
export type WxIncoming = { msg: Record<string, string>; sealed: boolean };

/**
 * Opens a message WeChat pushed to the server address, or null when it isn't genuine. With an EncodingAESKey saved the
 * account must be in safe (or compatible) mode: only the Encrypt part counts, its msg_signature must match, and it
 * must have been sealed for this AppID. Without one (plaintext mode) the signature over the token, timestamp and nonce
 * must match, and a sealed body is refused, as Lark's is when its Encrypt Key is missing.
 */
export async function wxOpen(bot: Pick<WechatBot, "app_id" | "token" | "aes_key">, q: URLSearchParams, body: string, now = Date.now()): Promise<WxIncoming | null> {
  const ts = q.get("timestamp"), nonce = q.get("nonce");
  if (!bot.token || !ts || !nonce || !wxFresh(ts, now)) return null;
  let outer: Record<string, string>;
  try { outer = parseXml(body); } catch { return null; }
  if (bot.aes_key) {
    const sealed = outer.Encrypt, ms = q.get("msg_signature");
    if (!sealed || !ms || !same(await wxSign(bot.token, ts, nonce, sealed), ms.toLowerCase())) return null;
    const inner = await wxDecrypt(bot.aes_key, sealed, bot.app_id);
    if (inner === null) return null;
    try { return { msg: parseXml(inner), sealed: true }; } catch { return null; }
  }
  if (outer.Encrypt) return null;
  const sig = q.get("signature");
  if (!sig || !same(await wxSign(bot.token, ts, nonce), sig.toLowerCase())) return null;
  return { msg: outer, sealed: false };
}

/** The passive reply to a pushed message: plain XML, or sealed and signed when the message came sealed. nonce is the
 *  one in the request's URL, as WeChat's documents say. */
export async function wxReply(bot: Pick<WechatBot, "app_id" | "token" | "aes_key">, msg: Record<string, string>, text: string, o: { sealed: boolean; nonce: string; now?: number; random?: Uint8Array }): Promise<string> {
  const now = o.now ?? Date.now();
  const xml = textXml(msg.FromUserName ?? "", msg.ToUserName ?? "", text, now);
  if (!o.sealed || !bot.aes_key) return xml;
  const sealed = await wxEncrypt(bot.aes_key, xml, bot.app_id, o.random);
  const ts = String(Math.floor(now / 1000)), nonce = /^[\w-]{1,64}$/.test(o.nonce) ? o.nonce : "0";
  return `<xml><Encrypt>${cdata(sealed)}</Encrypt><MsgSignature>${cdata(await wxSign(bot.token, ts, nonce, sealed))}</MsgSignature><TimeStamp>${ts}</TimeStamp><Nonce>${cdata(nonce)}</Nonce></xml>`;
}

/** The words of a message Odelia can work from: a text, or a voice message WeChat already turned into text. */
export function wxWords(msg: Record<string, string>): string {
  const t = msg.MsgType === "text" ? msg.Content : msg.MsgType === "voice" ? msg.Recognition : "";
  return String(t ?? "").replace(/\s+/g, " ").trim();
}

/** A message that is only a link code: "123456", "LINK 123456" or "关联 123456". */
export function wxLinkCode(text: string): string | null {
  const m = /^(?:link|关联|绑定)?\s*[:：]?\s*(\d{6})$/i.exec(text.trim());
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ one pushed message, start to answer */

/** What handling a pushed message needs from the database and the agent (chat-events passes the real ones; tests pass
 *  stand-ins). */
export type WxDeps = {
  /** true the first time an id is seen: WeChat tries a message three times when it gets no answer in 5 seconds */
  firstTime: (id: string) => Promise<boolean>;
  /** a link code this follower sent: "ok", "wrong" or "locked" (wechat_link_claim) */
  claim: (openid: string, code: string) => Promise<string | undefined>;
  /** the member this follower's WeChat is linked to here, and whether they're still a member (wechat_sender) */
  sender: (openid: string) => Promise<{ user_id: string; member: boolean } | null>;
  /** hand the job to Odelia as that member, in the background (the answer comes later, by customer service message) */
  start: (uid: string, openid: string, text: string, lang: "en" | "zh") => void;
  /** what someone who isn't a teammate any more is told, in both languages */
  notTeammate: string;
};
export type WxAnswer = { status: number; type: string; body: string };

/**
 * A message pushed to the account's server address, start to answer. WeChat waits 5 seconds, so everything quick is
 * answered here as a passive reply (sealed in safe mode): the link code, a note for followers who aren't linked, and
 * "on it" for a teammate's job, which runs in the background. "success" tells WeChat there's nothing to say.
 */
export async function wxHandle(bot: Pick<WechatBot, "app_id" | "token" | "aes_key">, q: URLSearchParams, body: string, deps: WxDeps, now = Date.now()): Promise<WxAnswer> {
  const plain = (text: string, status = 200): WxAnswer => ({ status, type: "text/plain; charset=utf-8", body: text });
  const got = await wxOpen(bot, q, body, now);
  if (!got) return plain("", 401);
  const m = got.msg, openid = m.FromUserName ?? "", nonce = q.get("nonce") ?? "";
  const say = async (text: string): Promise<WxAnswer> => ({ status: 200, type: "text/xml; charset=utf-8", body: await wxReply(bot, m, text, { sealed: got.sealed, nonce, now }) });
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(openid)) return plain("success");
  // each message once, by its MsgId; an event (which has none) by who and when
  const id = m.MsgId ? `wechat:${bot.app_id}:${m.MsgId}` : `wechat:${bot.app_id}:${openid}:${m.CreateTime ?? ""}:${m.Event ?? ""}`;
  if (!(await deps.firstTime(id))) return plain("success");
  if (m.MsgType === "event") return m.Event === "subscribe" ? await say(WX_SAY.welcome) : plain("success");
  const text = wxWords(m);
  if (!text) return await say(WX_SAY.textOnly);
  // a code from Settings links this WeChat to the member who asked for it
  const code = wxLinkCode(text);
  if (code) {
    const r = await deps.claim(openid, code);
    return await say(r === "ok" ? WX_SAY.linked : r === "locked" ? WX_SAY.locked : WX_SAY.wrongCode);
  }
  const who = await deps.sender(openid);
  if (!who) return await say(WX_SAY.unknown);
  if (!who.member) return await say(deps.notTeammate);
  const lang = /[一-鿿]/.test(text) ? "zh" : "en";
  deps.start(who.user_id, openid, text, lang);
  return await say(WX_SAY.ack[lang]);
}

/* ------------------------------------------------------------------ what Odelia says in WeChat, in both languages */

export const WX_SAY = {
  /** to someone who hasn't linked their WeChat: the account may face customers too, so it says only who she is */
  unknown: "Hi, this is Odelia, the AI compliance agent for this business's team on Placetta. If you're on the team, link your WeChat in Placetta (Settings, Integrations, Odelia in WeChat) and send the 6-digit code here.\n您好，这里是 Odelia，这家企业团队在快哉上的 AI 合规助理。如果您是团队成员，请在快哉中关联微信（设置 → 集成 → 微信中的 Odelia），然后把 6 位验证码发到这里。",
  welcome: "Thanks for following. Odelia, Placetta's AI compliance agent, answers here for this business's team. Teammates: link your WeChat in Placetta (Settings, Integrations) and send the 6-digit code here.\n感谢关注。快哉的 AI 合规助理 Odelia 在这里为这家企业的团队服务。团队成员：请在快哉中关联微信（设置 → 集成），然后把 6 位验证码发到这里。",
  linked: "Linked. Message me here anytime about your licenses, permits and deadlines, and I'll work as you. Anything to file, pay or send still waits for your approval in Placetta.\n已关联。随时在这里问我执照、许可和截止日期的事，我会以您的身份办理。任何提交、付款或发送仍需您在快哉中批准。",
  wrongCode: "That code didn't match. Get a new one in Placetta (Settings, Integrations) and send it here within 30 minutes.\n验证码不对。请在快哉中获取新的验证码（设置 → 集成），并在 30 分钟内发到这里。",
  locked: "Too many tries. Wait an hour, then get a new code in Placetta.\n尝试次数过多。请一小时后在快哉中获取新的验证码。",
  textOnly: "I can read text here. Send your question as a text message.\n我在这里只能读文字，请用文字发送您的问题。",
  ack: { en: "On it. I'll answer here when it's done.", zh: "收到，正在处理，完成后在这里回复您。" },
};

/* ------------------------------------------------------------------ the API token and answering later */

type Fetch = typeof fetch;
// deno-lint-ignore no-explicit-any
const envOf = (k: string): string => { try { return String((globalThis as any).Deno?.env?.get?.(k) ?? ""); } catch { return ""; } };
/** api.weixin.qq.com, or a relay with a fixed address (WECHAT_API_BASE) when the account's IP whitelist is on. */
export const wxApiBase = () => (envOf("WECHAT_API_BASE") || "https://api.weixin.qq.com").replace(/\/+$/, "");

/** Why WeChat wouldn't give a token: the AppID or AppSecret is wrong (or frozen); this server's address isn't on the
 *  account's IP whitelist (40164, 61004); the admin must confirm this server's address first (89503: WeChat sent them
 *  a message); the admin refused it (89506, 89507); or WeChat didn't answer. */
export type WxTokenProblem = "credentials" | "ip" | "confirm" | "refused" | "unreachable";
export function wxTokenProblem(code: number | undefined): WxTokenProblem {
  if (code === 40164 || code === 61004) return "ip";
  if (code === 89503) return "confirm";
  if (code === 89506 || code === 89507) return "refused";
  if (code === 40013 || code === 40125 || code === 41002 || code === 41004 || code === 40243 || code === 40001 || code === 50007) return "credentials";
  return "unreachable";
}

/** One instance's tokens by AppID; the vault copy (bot.access_token) is shared between instances. */
const tokens = new Map<string, { token: string; exp: number; at: number }>();

/**
 * The account's API token from the stable token endpoint (POST, normal mode: every caller gets the same token while
 * it's valid, so instances never knock each other's out). A cached one is used while it has over 6 minutes left; the
 * platform rotates it in the last 5. save gets the bot with the new token so it can go back to the vault.
 * force: "fetch" asks WeChat again in normal mode; "refresh" forces a new token (WeChat allows 20 a day).
 */
export async function wxAccessToken(bot: WechatBot, o: { f?: Fetch; now?: number; force?: "fetch" | "refresh"; save?: (bot: WechatBot) => Promise<void> } = {}): Promise<{ token: string } | { problem: WxTokenProblem; code?: number }> {
  const now = o.now ?? Date.now(), f = o.f ?? fetch;
  if (!o.force) {
    const mem = tokens.get(bot.app_id) ?? (bot.access_token && bot.expires_at ? { token: bot.access_token, exp: Number(bot.expires_at), at: 0 } : undefined);
    if (mem && mem.exp - now > 6 * 60_000) return { token: mem.token };
    // asked a moment ago and still valid: the platform hasn't rotated it yet, so asking again gets the same one
    if (mem && mem.exp - now > 60_000 && now - mem.at < 60_000) return { token: mem.token };
  }
  const res = await f(`${wxApiBase()}/cgi-bin/stable_token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credential", appid: bot.app_id, secret: bot.app_secret, force_refresh: o.force === "refresh" }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { access_token?: string; expires_in?: number; errcode?: number };
  if (!j.access_token) return { problem: res ? wxTokenProblem(j.errcode) : "unreachable", code: j.errcode };
  const exp = now + Math.max(60, Number(j.expires_in) || 7200) * 1000;
  tokens.set(bot.app_id, { token: j.access_token, exp, at: now });
  bot.access_token = j.access_token; bot.expires_at = exp;
  await o.save?.(bot).catch(() => undefined);
  return { token: j.access_token };
}

/** Forget this instance's token for an account (after WeChat said it's no longer valid). */
export const wxForget = (appId: string) => tokens.delete(appId);

/** WeChat counts text in bytes; a customer service text stays under this. */
export const WX_TEXT_BYTES = 2000;

/** Splits an answer into at most `max` texts of at most `bytes` UTF-8 bytes, breaking at a line or a space when it
 *  can. tail (the approval link) always ends the last text, whole; a cut answer ends with "…". */
export function wxSplit(text: string, o: { bytes?: number; max?: number; tail?: string } = {}): string[] {
  const bytes = o.bytes ?? WX_TEXT_BYTES, max = Math.max(1, o.max ?? 3), tail = o.tail ?? "";
  const size = (s: string) => enc.encode(s).length;
  // how many UTF-16 units of s fit in room bytes, never splitting a character
  const fit = (s: string, room: number) => { let cut = 0, used = 0; for (const ch of s) { const n = size(ch); if (used + n > room) break; used += n; cut += ch.length; } return cut; };
  const parts: string[] = [];
  let rest = text.trim();
  while (parts.length < max) {
    if (size(rest) + size(tail) <= bytes) { parts.push(rest + tail); break; }
    const last = parts.length === max - 1;
    const cut = fit(rest, last ? bytes - size(tail) - size("…") : bytes);
    // back to a line break, a space or a full stop in the last third of what fits
    const head = rest.slice(0, cut), brk = Math.max(head.lastIndexOf("\n"), head.lastIndexOf(" "), head.lastIndexOf("。"));
    const at = brk > cut * 0.66 ? brk + 1 : cut;
    if (last) { parts.push(rest.slice(0, at).trimEnd() + "…" + tail); break; }
    parts.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  return parts;
}

/** What a customer service send came to: sent, or why not (45015: the person hasn't written in 48 hours; 45047: the
 *  answers allowed for their message are used up; 48001: the account isn't allowed this API; token: no API token). */
export type WxSent = { ok: true } | { ok: false; errcode?: number; problem?: WxTokenProblem };

/**
 * Answers someone through the customer service message API, which WeChat allows for 48 hours after they wrote (5
 * messages per message they sent). Marked as AI-written (aimsgcontext.is_ai_msg), which WeChat shows under the message.
 * A token WeChat no longer accepts is fetched again once, then forced new once.
 */
export async function wxSendText(bot: WechatBot, openid: string, text: string, o: { f?: Fetch; save?: (bot: WechatBot) => Promise<void>; tail?: string } = {}): Promise<WxSent> {
  const f = o.f ?? fetch;
  for (const content of wxSplit(text, { tail: o.tail })) {
    let tries = 0, done = false;
    while (!done) {
      const t = await wxAccessToken(bot, { f, save: o.save, force: tries === 0 ? undefined : tries === 1 ? "fetch" : "refresh" });
      if (!("token" in t)) return { ok: false, problem: t.problem, errcode: t.code };
      const res = await f(`${wxApiBase()}/cgi-bin/message/custom/send?access_token=${encodeURIComponent(t.token)}`, {
        method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ touser: openid, msgtype: "text", text: { content }, aimsgcontext: { is_ai_msg: 1 } }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      const j = (res ? await res.json().catch(() => ({})) : {}) as { errcode?: number };
      if (res && (j.errcode ?? 0) === 0) { done = true; continue; }
      // 40001, 40014, 42001: the token is no longer valid
      if ([40001, 40014, 42001].includes(Number(j.errcode)) && tries < 2) { wxForget(bot.app_id); bot.access_token = undefined; tries++; continue; }
      return { ok: false, errcode: j.errcode };
    }
  }
  return { ok: true };
}

/** Checks pasted credentials by asking WeChat for a token with them. */
export async function wxCredsWork(appId: string, appSecret: string, f: Fetch = fetch): Promise<{ ok: true; token: string; expires_at: number } | { ok: false; problem: WxTokenProblem; code?: number }> {
  const bot: WechatBot = { kind: "wechat_bot", app_id: appId, app_secret: appSecret, token: "" };
  wxForget(appId);
  const t = await wxAccessToken(bot, { f, force: "fetch" });
  return "token" in t ? { ok: true, token: t.token, expires_at: Number(bot.expires_at) } : { ok: false, problem: t.problem, code: t.code };
}

/** A fresh Token (letters and digits, 32) and EncodingAESKey (43) to suggest for the account's server settings. */
export function wxNewSecrets(): { token: string; aes_key: string } {
  const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const pick = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ABC[b % 62]).join("");
  return { token: pick(32), aes_key: pick(43) };
}
