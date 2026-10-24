// A mailbox connected with its authorization code (授权码) or app password: QQ, NetEase 163 and 126, Sina, Aliyun,
// Yahoo, and company mail on Tencent Exmail, NetEase Qiye, Aliyun Qiye or any host the business types. Gmail, Outlook,
// Google Workspace and Microsoft 365 sign in with OAuth instead (providers.ts).
//
// Supabase Edge refuses outbound ports 25 and 587, so mail goes out over SMTP with implicit TLS (465) and replies are
// read over IMAP with TLS (993). Both clients are small on purpose: they speak only what sending a filing and finding
// the agency's answer need. Every network step has a timeout, the code never logs a password, and the dialer is passed
// in so the tests run against a fake server.

import type { Host } from "../../../src/mailboxPresets.ts";
export {
  CUSTOM_HINT, hintOf, hostOk, type Host, isMailboxProvider, MAILBOX_PROVIDERS, type MailboxProvider, PRESETS, providerFor, providerName, serversFor,
} from "../../../src/mailboxPresets.ts";

// ------------------------------------------------------------------ errors

export type MailboxErrorCode = "auth" | "connect" | "rejected" | "protocol" | "timeout";
export class MailboxError extends Error {
  constructor(readonly code: MailboxErrorCode, message: string, readonly zh: string) {
    super(message);
  }
}

// ------------------------------------------------------------------ the wire

export interface Wire {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
  close(): void;
}
export type Dial = (host: string, port: number) => Promise<Wire>;

/** The real dialer: TLS from the first byte. */
export const tlsDial: Dial = async (host, port) => {
  try {
    return await Deno.connectTls({ hostname: host, port });
  } catch {
    throw new MailboxError("connect", `Couldn't reach ${host}:${port}.`, `无法连接 ${host}:${port}。`);
  }
};

const enc = new TextEncoder();
const latin = new TextDecoder("latin1");

/** Lines and literals over a wire, every read under a deadline. */
export class Conn {
  private buf = new Uint8Array(0);
  private closed = false;
  constructor(private wire: Wire, private ms = 20000) {}

  private async more(): Promise<void> {
    const chunk = new Uint8Array(16384);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, no) => {
      timer = setTimeout(() => no(new MailboxError("timeout", "The mail server stopped answering.", "邮件服务器没有响应。")), this.ms);
    });
    let n: number | null;
    try {
      n = await Promise.race([this.wire.read(chunk), deadline]);
    } catch (e) {
      this.close();
      throw e instanceof MailboxError ? e : new MailboxError("connect", "The connection to the mail server dropped.", "与邮件服务器的连接中断。");
    } finally {
      clearTimeout(timer);
    }
    if (n === null) {
      this.close();
      throw new MailboxError("connect", "The mail server closed the connection.", "邮件服务器关闭了连接。");
    }
    const next = new Uint8Array(this.buf.length + n);
    next.set(this.buf);
    next.set(chunk.subarray(0, n), this.buf.length);
    this.buf = next;
    if (this.buf.length > 60 * 1024 * 1024) throw new MailboxError("protocol", "The mail server sent too much.", "邮件服务器返回的数据过多。");
  }

  /** One line without its CRLF, read as latin1 (bytes kept one-to-one). */
  async line(): Promise<string> {
    for (;;) {
      const i = this.buf.indexOf(10);
      if (i >= 0) {
        const raw = this.buf.subarray(0, i);
        this.buf = this.buf.slice(i + 1);
        const s = latin.decode(raw);
        return s.endsWith("\r") ? s.slice(0, -1) : s;
      }
      if (this.buf.length > 1024 * 1024) throw new MailboxError("protocol", "The mail server sent a line that never ended.", "邮件服务器返回的数据格式不正确。");
      await this.more();
    }
  }

  async bytes(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.more();
    const out = this.buf.slice(0, n);
    this.buf = this.buf.slice(n);
    return out;
  }

  async write(s: string | Uint8Array): Promise<void> {
    let b = typeof s === "string" ? enc.encode(s) : s;
    while (b.length) {
      const n = await this.wire.write(b);
      b = b.subarray(n);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try { this.wire.close(); } catch { /* already gone */ }
  }
}

// ------------------------------------------------------------------ MIME

const utf8 = (s: string) => enc.encode(s);

/** RFC 2047 encoded-words for a header value, split so each word stays short. */
export function encodeHeader(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (utf8(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${btoa(String.fromCharCode(...utf8(w)))}?=`).join("\r\n ");
}

export function base64Lines(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

export type Attachment = { name: string; mime: string; bytes: Uint8Array };

/** A Message-ID on the sender's own domain, so replies quote it back and the reply finder can match them. */
export function newMessageId(from: string): string {
  const domain = (from.split("@").pop() ?? "placetta.app").toLowerCase().replace(/[^a-z0-9.-]/g, "") || "placetta.app";
  const r = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `<placetta.${Date.now().toString(36)}.${r}@${domain}>`;
}

/** The whole message: headers, then plain text, or multipart/mixed with the text first and one part per file. */
export function buildMessage(o: { from: string; to: string[]; subject: string; text: string; files: Attachment[]; messageId: string; date?: Date }): string {
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(utf8(o.text.replace(/\r?\n/g, "\r\n")))];
  const head = [
    `From: ${o.from}`, `To: ${o.to.join(", ")}`, `Subject: ${encodeHeader(o.subject)}`,
    `Date: ${(o.date ?? new Date()).toUTCString()}`, `Message-ID: ${o.messageId}`, "MIME-Version: 1.0",
  ];
  if (!o.files.length) return [...head, ...textPart].join("\r\n");
  const boundary = `placetta_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  const parts = [`--${boundary}`, ...textPart];
  for (const f of o.files) {
    const name = encodeHeader(f.name.replace(/[\r\n"]/g, " "));
    parts.push(`--${boundary}`, `Content-Type: ${f.mime.replace(/[\r\n;"]/g, "")}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64", "", base64Lines(f.bytes));
  }
  parts.push(`--${boundary}--`, "");
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

// ------------------------------------------------------------------ SMTP

export type Login = { user: string; pass: string };

type Reply = { code: number; lines: string[] };

async function smtpReply(c: Conn): Promise<Reply> {
  const lines: string[] = [];
  for (;;) {
    const l = await c.line();
    const m = /^(\d{3})([ -])(.*)$/.exec(l);
    if (!m) throw new MailboxError("protocol", "The mail server answered in a way Placetta doesn't understand.", "邮件服务器的回复无法识别。");
    lines.push(m[3]);
    if (m[2] === " ") return { code: Number(m[1]), lines };
  }
}

async function smtpCmd(c: Conn, cmd: string, want: number[], what: string): Promise<Reply> {
  await c.write(cmd + "\r\n");
  const r = await smtpReply(c);
  if (!want.includes(r.code)) {
    const said = r.lines.join(" ").replace(/[^\x20-\x7e一-鿿]/g, "").slice(0, 160);
    throw new MailboxError("rejected", `The mail server refused ${what} (${r.code} ${said}).`, `邮件服务器拒绝了${what === "the login" ? "登录" : "发送"}（${r.code} ${said}）。`);
  }
  return r;
}

/** Opens an SMTP session and signs in. Throws MailboxError "auth" when the code is wrong. */
async function smtpOpen(dial: Dial, server: Host, login: Login): Promise<Conn> {
  const c = new Conn(await dial(server.host, server.port));
  try {
    const hi = await smtpReply(c);
    if (hi.code !== 220) throw new MailboxError("protocol", "The mail server didn't greet Placetta.", "邮件服务器没有正常响应。");
    const ehlo = await smtpCmd(c, "EHLO placetta.app", [250], "the greeting");
    const auth = ehlo.lines.find((l) => /^AUTH[ =]/i.test(l))?.toUpperCase() ?? "";
    let r: Reply;
    if (/\bPLAIN\b/.test(auth) || !/\bLOGIN\b/.test(auth)) {
      await c.write(`AUTH PLAIN ${btoa(String.fromCharCode(...utf8(`\0${login.user}\0${login.pass}`)))}\r\n`);
      r = await smtpReply(c);
    } else {
      await c.write("AUTH LOGIN\r\n");
      r = await smtpReply(c);
      if (r.code === 334) { await c.write(btoa(String.fromCharCode(...utf8(login.user))) + "\r\n"); r = await smtpReply(c); }
      if (r.code === 334) { await c.write(btoa(String.fromCharCode(...utf8(login.pass))) + "\r\n"); r = await smtpReply(c); }
    }
    if (r.code !== 235) throw new MailboxError("auth", "The mailbox refused the address or code.", "邮箱拒绝了这个地址或授权码。");
    return c;
  } catch (e) {
    c.close();
    throw e;
  }
}

/** Checks the address and code by signing in to SMTP, then says goodbye. */
export async function smtpVerify(dial: Dial, server: Host, login: Login): Promise<void> {
  const c = await smtpOpen(dial, server, login);
  try { await smtpCmd(c, "QUIT", [221], "goodbye").catch(() => undefined); } finally { c.close(); }
}

/** Lines starting with a dot get a second one (RFC 5321 4.5.2); the message ends with CRLF.CRLF. */
export function dotStuff(raw: string): string {
  const body = raw.replace(/\r?\n/g, "\r\n").split("\r\n").map((l) => (l.startsWith(".") ? "." + l : l)).join("\r\n");
  return body + "\r\n.\r\n";
}

/** Sends one message. Returns once the server accepted it for delivery. */
export async function smtpSend(dial: Dial, server: Host, login: Login, mail: { from: string; to: string[]; raw: string }): Promise<void> {
  const c = await smtpOpen(dial, server, login);
  try {
    await smtpCmd(c, `MAIL FROM:<${mail.from}>`, [250], "the sender");
    for (const t of mail.to) await smtpCmd(c, `RCPT TO:<${t}>`, [250, 251], `the address ${t}`);
    await smtpCmd(c, "DATA", [354], "the message");
    await c.write(dotStuff(mail.raw));
    const r = await smtpReply(c);
    if (r.code !== 250) throw new MailboxError("rejected", `The mail server didn't accept the message (${r.code}).`, `邮件服务器没有接收这封邮件（${r.code}）。`);
    await smtpCmd(c, "QUIT", [221], "goodbye").catch(() => undefined);
  } finally {
    c.close();
  }
}

// ------------------------------------------------------------------ IMAP

/** An IMAP quoted string. Codes and addresses are ASCII; anything else would need a literal and is refused. */
export function quote(s: string): string {
  if (/[\r\n\0]/.test(s) || !/^[\x20-\x7e]*$/.test(s)) throw new MailboxError("auth", "The address or code has characters a mailbox can't take.", "地址或授权码含有邮箱无法识别的字符。");
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** One untagged or tagged response, with any literals it carried in order, and the text just before each literal. */
type Resp = { text: string; literals: { before: string; bytes: Uint8Array }[] };

export class Imap {
  private n = 0;
  private constructor(private c: Conn) {}

  static async open(dial: Dial, server: Host, login: Login): Promise<Imap> {
    const c = new Conn(await dial(server.host, server.port));
    const m = new Imap(c);
    try {
      const hi = await c.line();
      if (!/^\* (OK|PREAUTH)/i.test(hi)) throw new MailboxError("protocol", "The mail server didn't greet Placetta.", "邮件服务器没有正常响应。");
      const r = await m.run(`LOGIN ${quote(login.user)} ${quote(login.pass)}`, false);
      if (!r.ok) throw new MailboxError("auth", "The mailbox refused the address or code.", "邮箱拒绝了这个地址或授权码。");
      // NetEase refuses to open a folder for a client that hasn't said who it is (RFC 2971); others ignore it
      await m.run('ID ("name" "Placetta" "version" "1.0" "vendor" "Placetta")', false).catch(() => undefined);
      return m;
    } catch (e) {
      c.close();
      throw e;
    }
  }

  private async resp(): Promise<Resp> {
    let text = "";
    const literals: Resp["literals"] = [];
    for (;;) {
      const l = await this.c.line();
      const lit = /\{(\d+)\+?\}$/.exec(l);
      if (!lit) return { text: text + l, literals };
      const n = Number(lit[1]);
      if (n > 50 * 1024 * 1024) throw new MailboxError("protocol", "A message is too large to read.", "邮件过大，无法读取。");
      const before = text + l.slice(0, lit.index);
      literals.push({ before, bytes: await this.c.bytes(n) });
      text = before + `{${literals.length - 1}}`;
    }
  }

  /** Runs one command; returns the untagged responses and whether it ended in OK. */
  async run(cmd: string, strict = true): Promise<{ ok: boolean; untagged: Resp[]; status: string }> {
    const tag = `P${++this.n}`;
    await this.c.write(`${tag} ${cmd}\r\n`);
    const untagged: Resp[] = [];
    for (;;) {
      const r = await this.resp();
      if (r.text.startsWith(`${tag} `)) {
        const status = r.text.slice(tag.length + 1);
        const ok = /^OK\b/i.test(status);
        if (!ok && strict) throw new MailboxError("rejected", `The mailbox refused a request (${status.replace(/[^\x20-\x7e]/g, "").slice(0, 120)}).`, "邮箱拒绝了请求。");
        return { ok, untagged, status };
      }
      if (r.text.startsWith("+")) throw new MailboxError("protocol", "The mail server asked for more than Placetta sends.", "邮件服务器要求的数据无法提供。");
      untagged.push(r);
    }
  }

  /** Opens the inbox read-only. Returns its UIDVALIDITY. */
  async inbox(): Promise<string> {
    const r = await this.run("EXAMINE INBOX");
    for (const u of r.untagged) {
      const m = /UIDVALIDITY (\d+)/i.exec(u.text);
      if (m) return m[1];
    }
    return "0";
  }

  /** UIDs of messages since a day (and matching any extra SEARCH keys), newest last. */
  async since(day: Date, extra = ""): Promise<number[]> {
    const r = await this.run(`UID SEARCH SINCE ${imapDate(day)}${extra ? " " + extra : ""}`);
    const out: number[] = [];
    for (const u of r.untagged) {
      const m = /^\* SEARCH\b(.*)$/i.exec(u.text);
      if (m) for (const x of m[1].trim().split(/\s+/)) if (/^\d+$/.test(x)) out.push(Number(x));
    }
    return out.sort((a, b) => a - b);
  }

  /** The headers that matter and the first part of the text, for each UID. */
  async heads(uids: number[]): Promise<Head[]> {
    if (!uids.length) return [];
    const r = await this.run(`UID FETCH ${uids.join(",")} (UID BODY.PEEK[HEADER.FIELDS (FROM TO DATE SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] BODY.PEEK[TEXT]<0.4000>)`);
    const out: Head[] = [];
    for (const u of r.untagged) {
      const uid = /\bUID (\d+)/i.exec(u.text);
      if (!uid || !/ FETCH /i.test(u.text)) continue;
      const head = u.literals.find((l) => /HEADER/i.test(l.before.slice(-140)));
      const body = u.literals.find((l) => /TEXT\]/i.test(l.before.slice(-40)));
      const h = parseHeaders(head ? latin.decode(head.bytes) : "");
      out.push({
        uid: Number(uid[1]),
        from: decodeWords(h.get("from") ?? ""),
        to: decodeWords(h.get("to") ?? ""),
        subject: decodeWords(h.get("subject") ?? ""),
        date: h.get("date") ?? "",
        messageId: (h.get("message-id") ?? "").trim(),
        inReplyTo: (h.get("in-reply-to") ?? "").trim(),
        references: (h.get("references") ?? "").trim(),
        snippet: body ? snippetOf(body.bytes, h) : "",
      });
    }
    return out;
  }

  /** The whole message for one UID, or null when it's gone. */
  async full(uid: number): Promise<Uint8Array | null> {
    const r = await this.run(`UID FETCH ${uid} (UID BODY.PEEK[])`);
    for (const u of r.untagged) if (u.literals.length) return u.literals[u.literals.length - 1].bytes;
    return null;
  }

  async close(): Promise<void> {
    try { await this.run("LOGOUT", false); } catch { /* closing anyway */ } finally { this.c.close(); }
  }
}

export type Head = { uid: number; from: string; to: string; subject: string; date: string; messageId: string; inReplyTo: string; references: string; snippet: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** IMAP's date form for SEARCH: 1-Oct-2026. */
export const imapDate = (d: Date) => `${d.getUTCDate()}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}`;

/** Signs in to IMAP and opens the inbox, then logs out: proves the code reads mail too. */
export async function imapVerify(dial: Dial, server: Host, login: Login): Promise<void> {
  const m = await Imap.open(dial, server, login);
  try { await m.inbox(); } finally { await m.close(); }
}

// ------------------------------------------------------------------ reading what comes back

/** Header fields, unfolded, lower-cased names; the first of each name wins. */
export function parseHeaders(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    if (!out.has(k)) out.set(k, line.slice(i + 1).trim());
  }
  return out;
}

/** A charset label to a decoder, falling back to UTF-8 (GB2312 and GBK go to GB18030, which covers both). */
function decoder(charset: string | null): TextDecoder {
  const c = (charset ?? "utf-8").toLowerCase().replace(/^"|"$/g, "");
  const label = c === "gb2312" || c === "gbk" || c === "x-gbk" || c === "cp936" ? "gb18030" : c;
  try { return new TextDecoder(label); } catch { return new TextDecoder("utf-8"); }
}

function bytesOf(bin: string): Uint8Array {
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i) & 0xff;
  return b;
}

export function qpDecode(s: string, header = false): Uint8Array {
  const src = header ? s.replace(/_/g, " ") : s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) { out.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(src.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

function b64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  try { return bytesOf(atob(clean + "===".slice((clean.length + 3) % 4))); } catch { return new Uint8Array(0); }
}

/** RFC 2047 encoded-words in a header value (=?GBK?B?...?=), adjacent words joined. Raw 8-bit headers read as UTF-8. */
export function decodeWords(v: string): string {
  const raw = /[\x80-\xff]/.test(v) ? new TextDecoder("utf-8").decode(bytesOf(v)) : v;
  return raw
    .replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, "$1")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs: string, how: string, data: string) => decoder(cs.split("*")[0]).decode(how.toUpperCase() === "B" ? b64Decode(data) : qpDecode(data, true)))
    .trim();
}

const param = (v: string, name: string) => new RegExp(`${name}\\*?=\\s*"?([^";]+)"?`, "i").exec(v)?.[1] ?? null;

function bodyText(bytes: Uint8Array, cte: string, charset: string | null): string {
  const s = latin.decode(bytes);
  const raw = /base64/i.test(cte) ? b64Decode(s) : /quoted-printable/i.test(cte) ? qpDecode(s) : bytes;
  return decoder(charset).decode(raw);
}

/** First lines of a message's text for the reply notice, from a partial fetch (plain text when it's simple enough). */
function snippetOf(bytes: Uint8Array, h: Map<string, string>): string {
  const ct = h.get("content-type") ?? "text/plain";
  let t: string;
  if (/^multipart\//i.test(ct)) {
    const parsed = parseMessage(bytes, ct);
    t = parsed.text;
  } else {
    t = bodyText(bytes, h.get("content-transfer-encoding") ?? "", param(ct, "charset"));
    if (/html/i.test(ct)) t = t.replace(/<[^>]+>/g, " ");
  }
  return t.replace(/\s+/g, " ").trim().slice(0, 280);
}

export type Parsed = { headers: Map<string, string>; text: string; html: string | null; attachments: { name: string; size: number; mime: string }[] };

/** A whole message (or, with a content type, just its body): the first plain text, else the first HTML, and the files. */
export function parseMessage(bytes: Uint8Array, bodyType?: string): Parsed {
  const s = latin.decode(bytes);
  let headers = new Map<string, string>(), body = s;
  if (!bodyType) {
    const cut = s.search(/\r?\n\r?\n/);
    headers = parseHeaders(cut >= 0 ? s.slice(0, cut) : s);
    body = cut >= 0 ? s.slice(cut).replace(/^\r?\n\r?\n/, "") : "";
  }
  const out: Parsed = { headers, text: "", html: null, attachments: [] };
  let plain: string | null = null;
  const walk = (ct: string, cte: string, disp: string, part: string, depth: number) => {
    if (depth > 12) return;
    const type = ct.split(";")[0].trim().toLowerCase() || "text/plain";
    const name = param(disp, "filename") ?? param(ct, "name");
    if (type.startsWith("multipart/")) {
      const boundary = param(ct, "boundary");
      if (!boundary) return;
      const b = `--${boundary}`, end = part.indexOf(`${b}--`);
      // the preamble before the first boundary and the epilogue after the last are not parts
      const pieces = (end >= 0 ? part.slice(0, end) : part).split(b).slice(1).map((p) => p.replace(/^[ \t]*\r?\n/, "").replace(/\r?\n$/, ""));
      for (const p of pieces) {
        if (!p.trim()) continue;
        const cut = p.search(/\r?\n\r?\n/);
        const ph = parseHeaders(cut >= 0 ? p.slice(0, cut) : "");
        const pb = cut >= 0 ? p.slice(cut).replace(/^\r?\n\r?\n/, "") : p;
        walk(ph.get("content-type") ?? "text/plain", ph.get("content-transfer-encoding") ?? "", ph.get("content-disposition") ?? "", pb, depth + 1);
      }
      return;
    }
    if (name || /attachment/i.test(disp)) {
      out.attachments.push({ name: decodeWords(name ?? "attachment"), size: Math.floor((part.length * (/base64/i.test(cte) ? 3 : 4)) / 4), mime: type });
      return;
    }
    if (type === "text/plain" && plain === null) plain = bodyText(bytesOf(part), cte, param(ct, "charset"));
    else if (type === "text/html" && out.html === null) out.html = bodyText(bytesOf(part), cte, param(ct, "charset"));
  };
  walk(bodyType ?? headers.get("content-type") ?? "text/plain", bodyType ? "" : headers.get("content-transfer-encoding") ?? "", "", body, 0);
  out.text = plain ?? (out.html ? out.html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "") : "");
  return out;
}

/** True when a message answers ours: it quotes our Message-ID, or comes from someone we wrote to with our subject. */
export function answers(h: Head, sent: { messageId: string; to: string[]; subject: string; me: string }): boolean {
  const addr = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
  const from = addr(h.from);
  if (!from || from === sent.me.toLowerCase()) return false;
  if (sent.messageId && (h.inReplyTo.includes(sent.messageId) || h.references.includes(sent.messageId))) return true;
  const bare = (s: string) => s.replace(/^\s*((re|fw|fwd|答复|回复|转发)\s*[:：]\s*)+/i, "").trim().toLowerCase();
  return sent.to.map((t) => t.toLowerCase()).includes(from) && !!sent.subject && bare(h.subject) === bare(sent.subject);
}
