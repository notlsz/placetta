// Run: deno test -A supabase/functions/integrations/mailbox_test.ts
// The SMTP and IMAP clients against a scripted fake server, the MIME reader on real-world shapes (GBK, quoted-printable,
// multipart with a file), the provider presets and the host checks.
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  answers, buildMessage, Conn, decodeWords, type Dial, dotStuff, hostOk, imapDate, imapVerify, Imap, MailboxError, MAILBOX_PROVIDERS, newMessageId,
  parseMessage, PRESETS, providerFor, qpDecode, serversFor, smtpSend, smtpVerify, type Wire,
} from "./mailbox.ts";

const te = new TextEncoder(), td = new TextDecoder();

/** A server in memory: it greets, then answers each line the client sends through `on`. */
class Fake implements Wire {
  private out: Uint8Array[] = [];
  private wake: (() => void) | null = null;
  private inbuf = "";
  closed = false;
  seen: string[] = [];
  constructor(greeting: string | null, private on: (line: string, f: Fake) => void) {
    if (greeting !== null) this.send(greeting);
  }
  send(s: string | Uint8Array) {
    this.out.push(typeof s === "string" ? te.encode(s) : s);
    this.wake?.();
  }
  async read(p: Uint8Array): Promise<number | null> {
    while (!this.out.length) {
      if (this.closed) return null;
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
    const chunk = this.out[0];
    const n = Math.min(p.length, chunk.length);
    p.set(chunk.subarray(0, n));
    if (n < chunk.length) this.out[0] = chunk.subarray(n); else this.out.shift();
    return n;
  }
  write(p: Uint8Array): Promise<number> {
    this.inbuf += td.decode(p);
    let i: number;
    while ((i = this.inbuf.indexOf("\r\n")) >= 0) {
      const line = this.inbuf.slice(0, i);
      this.inbuf = this.inbuf.slice(i + 2);
      this.seen.push(line);
      this.on(line, this);
    }
    return Promise.resolve(p.length);
  }
  close() { this.closed = true; this.wake?.(); }
}

const dialTo = (f: Fake): Dial => () => Promise.resolve(f);
const login = { user: "shop@qq.com", pass: "abcdefghijklmnop" };
const server = { host: "smtp.qq.com", port: 465 };

/** An SMTP server: ext is what EHLO advertises; auth decides the login; rcpt can refuse an address. */
function smtpServer(o: { ext?: string[]; authOk?: boolean; refuse?: string } = {}) {
  let data = false;
  const body: string[] = [];
  let loginStep = 0;
  const f = new Fake("220 smtp.qq.com Esmtp QQ Mail Server\r\n", (l, s) => {
    if (data) {
      if (l === ".") { data = false; s.send("250 OK: queued as 1\r\n"); } else body.push(l);
      return;
    }
    if (loginStep === 1) { loginStep = 2; s.send("334 UGFzc3dvcmQ6\r\n"); return; }
    if (loginStep === 2) { loginStep = 0; s.send(o.authOk === false ? "535 Login Fail\r\n" : "235 Authentication successful\r\n"); return; }
    if (l.startsWith("EHLO")) s.send(["250-smtp.qq.com", ...(o.ext ?? ["AUTH LOGIN PLAIN", "SIZE 73400320"]).map((e) => `250-${e}`), "250 8BITMIME\r\n"].join("\r\n"));
    else if (l.startsWith("AUTH PLAIN")) s.send(o.authOk === false ? "535 Error: authentication failed\r\n" : "235 Authentication successful\r\n");
    else if (l === "AUTH LOGIN") { loginStep = 1; s.send("334 VXNlcm5hbWU6\r\n"); }
    else if (l.startsWith("MAIL FROM")) s.send("250 OK\r\n");
    else if (l.startsWith("RCPT TO")) s.send(o.refuse && l.includes(o.refuse) ? "550 Mailbox not found\r\n" : "250 OK\r\n");
    else if (l === "DATA") { data = true; s.send("354 End data with <CR><LF>.<CR><LF>\r\n"); }
    else if (l === "QUIT") { s.send("221 Bye\r\n"); s.close(); }
    else s.send("502 Command not implemented\r\n");
  });
  return { f, body };
}

Deno.test("smtp: signs in with AUTH PLAIN and sends, dot-stuffed, to every recipient", async () => {
  const { f, body } = smtpServer();
  const raw = buildMessage({ from: login.user, to: ["permits@houstontx.gov", "clerk@tabc.texas.gov"], subject: "食品经营许可 application", text: "Hello\n.leading dot\nBye", files: [], messageId: "<a@qq.com>" });
  await smtpSend(dialTo(f), server, login, { from: login.user, to: ["permits@houstontx.gov", "clerk@tabc.texas.gov"], raw });
  const plain = f.seen.find((l) => l.startsWith("AUTH PLAIN"))!;
  assertEquals(atob(plain.slice(11)), `\0${login.user}\0${login.pass}`);
  assertEquals(f.seen.filter((l) => l.startsWith("RCPT TO")).length, 2);
  assert(body.some((l) => l.startsWith("Subject: =?UTF-8?B?")), "subject is RFC 2047");
  assert(body.includes("Message-ID: <a@qq.com>"));
  assert(f.closed);
});

Deno.test("smtp: uses AUTH LOGIN when that's all the server offers", async () => {
  const { f } = smtpServer({ ext: ["AUTH LOGIN"] });
  await smtpVerify(dialTo(f), server, login);
  const i = f.seen.indexOf("AUTH LOGIN");
  assert(i >= 0);
  assertEquals(atob(f.seen[i + 1]), login.user);
  assertEquals(atob(f.seen[i + 2]), login.pass);
});

Deno.test("smtp: a wrong code is an auth error, a refused address a rejection", async () => {
  const bad = smtpServer({ authOk: false });
  const e = await assertRejects(() => smtpVerify(dialTo(bad.f), server, login), MailboxError);
  assertEquals(e.code, "auth");
  assert(bad.f.closed, "the connection is closed after a failed login");
  const refuse = smtpServer({ refuse: "nobody@" });
  const r = await assertRejects(() => smtpSend(dialTo(refuse.f), server, login, { from: login.user, to: ["nobody@example.gov"], raw: "Subject: x\r\n\r\nhi" }), MailboxError);
  assertEquals(r.code, "rejected");
  assertStringIncludes(r.message, "550");
});

Deno.test("dot-stuffing doubles a leading dot and ends with CRLF.CRLF", () => {
  assertEquals(dotStuff("a\n.b\r\n..c"), "a\r\n..b\r\n...c\r\n.\r\n");
});

Deno.test("conn: a silent server times out, and the timer doesn't leak", async () => {
  const f = new Fake(null, () => undefined);
  const c = new Conn(f, 30);
  const e = await assertRejects(() => c.line(), MailboxError);
  assertEquals(e.code, "timeout");
  assert(f.closed);
});

/** An IMAP server holding a few messages. */
function imapServer(o: { loginOk?: boolean; needId?: boolean } = {}) {
  let idSent = false;
  const hdr1 = "From: =?GBK?B?yfq7ysq5?= <permits@houstontx.gov>\r\nSubject: Re: Food dealer permit\r\nDate: Fri, 23 Oct 2026 10:00:00 -0500\r\nMessage-ID: <r1@houstontx.gov>\r\nIn-Reply-To: <placetta.x@qq.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n";
  const txt1 = "Your permit is approved.\r\nPermit number FD-2026-118.";
  const hdr2 = "From: news@shop.example\r\nSubject: Sale\r\nDate: Fri, 23 Oct 2026 11:00:00 -0500\r\nMessage-ID: <n@shop.example>\r\n\r\n";
  const full = hdr1 + txt1;
  const lit = (s: string) => `{${te.encode(s).length}}\r\n${s}`;
  const f = new Fake("* OK [CAPABILITY IMAP4rev1 ID] ready\r\n", (l, s) => {
    const [tag, cmd, ...rest] = l.split(" ");
    if (cmd === "LOGIN") s.send(o.loginOk === false ? `${tag} NO LOGIN failed\r\n` : `${tag} OK LOGIN completed\r\n`);
    else if (cmd === "ID") { idSent = true; s.send(`* ID NIL\r\n${tag} OK ID completed\r\n`); }
    else if (cmd === "EXAMINE") s.send(o.needId && !idSent ? `${tag} NO SELECT Unsafe Login\r\n` : `* 2 EXISTS\r\n* OK [UIDVALIDITY 1700000000] UIDs valid\r\n${tag} OK [READ-ONLY] EXAMINE completed\r\n`);
    else if (cmd === "UID" && rest[0] === "SEARCH") s.send(`* SEARCH 12 7\r\n${tag} OK SEARCH completed\r\n`);
    else if (cmd === "UID" && rest[0] === "FETCH" && l.includes("BODY.PEEK[]")) s.send(`* 1 FETCH (UID 7 BODY[] ${lit(full)})\r\n${tag} OK FETCH completed\r\n`);
    else if (cmd === "UID" && rest[0] === "FETCH") s.send(
      `* 1 FETCH (UID 7 BODY[HEADER.FIELDS (FROM TO DATE SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] ${lit(hdr1)} BODY[TEXT]<0> ${lit(txt1)})\r\n` +
      `* 2 FETCH (UID 12 BODY[HEADER.FIELDS (FROM TO DATE SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] ${lit(hdr2)} BODY[TEXT]<0> ${lit("hi")})\r\n${tag} OK FETCH completed\r\n`);
    else if (cmd === "LOGOUT") { s.send(`* BYE\r\n${tag} OK LOGOUT completed\r\n`); s.close(); }
    else s.send(`${tag} BAD unknown\r\n`);
  });
  return f;
}

Deno.test("imap: logs in, says who it is (NetEase needs it), finds and reads the agency's reply", async () => {
  const f = imapServer({ needId: true });
  const m = await Imap.open(dialTo(f), { host: "imap.163.com", port: 993 }, { user: "shop@163.com", pass: "CODE123" });
  assertEquals(await m.inbox(), "1700000000");
  const uids = await m.since(new Date(Date.UTC(2026, 9, 20)));
  assertEquals(uids, [7, 12]);
  assert(f.seen.some((l) => l.endsWith("UID SEARCH SINCE 20-Oct-2026")));
  const heads = await m.heads(uids);
  assertEquals(heads.length, 2);
  const h = heads.find((x) => x.uid === 7)!;
  assertEquals(h.from, "审核局 <permits@houstontx.gov>".replace("审核局", decodeWords("=?GBK?B?yfq7ysq5?=")));
  assertStringIncludes(h.snippet, "FD-2026-118");
  const sent = { messageId: "<placetta.x@qq.com>", to: ["permits@houstontx.gov"], subject: "Food dealer permit", me: "shop@163.com" };
  assert(answers(h, sent));
  assert(!answers(heads.find((x) => x.uid === 12)!, sent));
  const raw = await m.full(7);
  assertStringIncludes(parseMessage(raw!).text, "approved");
  await m.close();
  assert(f.closed);
});

Deno.test("imap: a refused login is an auth error", async () => {
  const e = await assertRejects(() => imapVerify(dialTo(imapServer({ loginOk: false })), { host: "imap.qq.com", port: 993 }, login), MailboxError);
  assertEquals(e.code, "auth");
});

Deno.test("answers: a reply by subject from someone we wrote to, without In-Reply-To", () => {
  const h = { uid: 1, from: "Clerk <CLERK@tabc.texas.gov>", to: "", subject: "回复：Hearing request", date: "", messageId: "", inReplyTo: "", references: "", snippet: "" };
  assert(answers(h, { messageId: "<m@x>", to: ["clerk@tabc.texas.gov"], subject: "Hearing request", me: "a@b.com" }));
  assert(!answers({ ...h, from: "a@b.com" }, { messageId: "<m@x>", to: ["a@b.com"], subject: "Hearing request", me: "a@b.com" }), "our own copy isn't a reply");
});

Deno.test("mime: GBK base64 text, a quoted-printable part and a file", () => {
  const gbk = "yfq7ysq5"; // "审核局"... any GBK bytes; decoded through GB18030
  const msg = [
    "From: a@qq.com", "Subject: =?gb2312?B?suLK1A==?=", 'Content-Type: multipart/mixed; boundary="XX"', "",
    "This is a multi-part message in MIME format.", "--XX",
    'Content-Type: text/plain; charset="GBK"', "Content-Transfer-Encoding: base64", "", gbk, "--XX",
    "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: quoted-printable", "", "<p>caf=C3=A9</p>", "--XX",
    'Content-Type: application/pdf; name="=?UTF-8?B?6K645Y+v6K+B?=.pdf"', "Content-Disposition: attachment", "Content-Transfer-Encoding: base64", "", "JVBERi0=", "--XX--", "epilogue",
  ].join("\r\n");
  const p = parseMessage(te.encode(msg));
  assertEquals(decodeWords(p.headers.get("subject")!), "测试");
  assertEquals(p.text, decodeWords(`=?GBK?B?${gbk}?=`));
  assert(!p.text.includes("multi-part"), "the preamble isn't the text");
  assertEquals(p.html, "<p>café</p>");
  assertEquals(p.attachments.map((a) => a.name), ["许可证.pdf"]);
  assertEquals(td.decode(qpDecode("a=3Db=\r\nc")), "a=bc");
});

Deno.test("mime: what we build reads back: subject, text and the file", () => {
  const raw = buildMessage({ from: "shop@163.com", to: ["x@y.gov"], subject: "许可证申请 Houston", text: "第一行\n第二行", files: [{ name: "申请表.pdf", mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) }], messageId: newMessageId("shop@163.com") });
  const p = parseMessage(te.encode(raw));
  assertEquals(decodeWords(p.headers.get("subject")!), "许可证申请 Houston");
  assertEquals(p.text, "第一行\r\n第二行");
  assertEquals(p.attachments[0].name, "申请表.pdf");
  assert(/^<placetta\.[a-z0-9]+\.[0-9a-f]{24}@163\.com>$/.test(p.headers.get("message-id")!));
});

Deno.test("presets: SSL ports only, domains pick their provider, company presets have no domains", () => {
  for (const [k, v] of Object.entries(PRESETS)) {
    assertEquals(v.smtp.port, 465, k);
    assertEquals(v.imap.port, 993, k);
    assert(hostOk(v.smtp.host) && hostOk(v.imap.host), k);
    assert(v.help.startsWith("https://"), k);
    assert(v.hint.en && v.hint.zh, k);
    if (v.company) assertEquals(v.domains.length, 0, k);
  }
  assertEquals(MAILBOX_PROVIDERS.length, Object.keys(PRESETS).length + 1);
  assertEquals(providerFor("Shop@QQ.com"), "qq");
  assertEquals(providerFor("a@foxmail.com"), "qq");
  assertEquals(providerFor("a@126.com"), "126");
  assertEquals(providerFor("a@yahoo.co.jp"), "yahoo");
  assertEquals(providerFor("a@mytea.com"), null);
});

Deno.test("hosts: typed company hosts are DNS names on SSL ports, never internal or bare IPs", () => {
  assert(hostOk("mail.mytea.com"));
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "mail.internal", "db.abc.supabase.co", "x", "a..b.com", "-a.com"]) assert(!hostOk(h), h);
  assertEquals(serversFor("custom", { smtp_host: "smtp.mytea.com", imap_host: "imap.mytea.com" })?.smtp, { host: "smtp.mytea.com", port: 465 });
  assertEquals(serversFor("custom", { smtp_host: "smtp.mytea.com", imap_host: "imap.mytea.com", smtp_port: 587 }), null);
  assertEquals(serversFor("custom", { smtp_host: "169.254.169.254", imap_host: "imap.mytea.com" }), null);
  assertEquals(serversFor("qq")?.imap.host, "imap.qq.com");
});

Deno.test("imapDate is IMAP's d-Mon-yyyy", () => {
  assertEquals(imapDate(new Date(Date.UTC(2026, 0, 5))), "5-Jan-2026");
});
