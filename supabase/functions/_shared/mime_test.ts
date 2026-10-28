// Run: deno test supabase/functions/_shared/mime_test.ts
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { buildMime, decodeWords, params, parseMime } from "./mime.ts";
import { REF_RE, refOf } from "./chase.ts";

const CRLF = (l: string[]) => l.join("\r\n");
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0xff, 0x00, 0x80]);
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

Deno.test("MIME: a Gmail-style multipart with a PDF, a photo, an inline logo, quoted-printable text and a Chinese file name", () => {
  const raw = CRLF([
    "From: =?UTF-8?B?6ZmI576O?= <mei@goldenox.com>", "To: odelia@in.placetta.com", "Subject: =?UTF-8?Q?Re:_=E7=89=8C=E7=85=A7?= [P-ABCDEFGH]",
    "Message-ID: <CAF1@mail.gmail.com>", "MIME-Version: 1.0", 'Content-Type: multipart/mixed; boundary="outer"', "",
    "This is a multi-part message in MIME format.", "--outer", 'Content-Type: multipart/alternative; boundary="inner"', "",
    "--inner", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "",
    "Here is the lease =E2=80=94 signed.=", "Thanks", "", "--inner", "Content-Type: text/html; charset=UTF-8", "", "<p>Here is the lease</p>", "--inner--", "",
    "--outer", 'Content-Type: application/pdf; name="lease.pdf"', 'Content-Disposition: attachment; filename="lease.pdf"', "Content-Transfer-Encoding: base64", "", b64(pdf),
    "--outer", "Content-Type: image/jpeg", "Content-Disposition: attachment; filename*=UTF-8''%E8%90%A5%E4%B8%9A%E6%89%A7%E7%85%A7.jpg", "Content-Transfer-Encoding: base64", "", btoa("JPEGDATA"),
    "--outer", 'Content-Type: image/png; name="logo.png"', "Content-Disposition: inline", "Content-ID: <logo>", "Content-Transfer-Encoding: base64", "", btoa("PNG"),
    "--outer--", "epilogue: never a part",
  ]);
  const m = parseMime(raw);
  assertEquals(m.headers.subject, ["Re: 牌照 [P-ABCDEFGH]"]);
  assertEquals(m.headers.from, ["陈美 <mei@goldenox.com>"]);
  assertEquals(m.fromCount, 1);
  assertEquals(m.text, "Here is the lease — signed.Thanks\r\n");
  assertEquals(m.html, "<p>Here is the lease</p>");
  assertEquals(m.files.map((f) => [f.name, f.mime, f.size, f.inline]), [["lease.pdf", "application/pdf", 12, false], ["营业执照.jpg", "image/jpeg", 8, false], ["logo.png", "image/png", 3, true]]);
  assertEquals([...m.files[0].bytes], [...pdf], "binary attachment bytes survive");
  assertEquals(refOf(m.headers.subject[0]), "ABCDEFGH", "the initiative reference survives");
});

Deno.test("MIME: two From fields are counted, so a caller can refuse them", () => {
  const m = parseMime(CRLF(["From: boss@goldenox.com", "From: mei@goldenox.com", "Subject: x", "", "body"]));
  assertEquals(m.fromCount, 2);
  assertEquals(m.text, "body");
});

Deno.test("MIME: encoded words, RFC 2231 continuations, other charsets", () => {
  assertEquals(decodeWords("=?utf-8?B?5L2g5aW9?= =?utf-8?B?5LiW55WM?="), "你好世界");
  assertEquals(decodeWords("=?gb2312?B?xOO6ww==?="), "你好");
  assertEquals(decodeWords("=?iso-8859-1?Q?caf=E9_cr=E8me?="), "café crème");
  assertEquals(params("attachment; filename*0*=UTF-8''%E8%90%A5%E4%B8%9A; filename*1*=%E6%89%A7%E7%85%A7.pdf").params.filename, "营业执照.pdf");
  assertEquals(params('form-data; name="a;b"; x=1').params, { name: "a;b", x: "1" });
});

Deno.test("MIME: what we write reads back the same: text, HTML, threading, Reply-To, a Chinese subject with its reference, a PDF", () => {
  const subject = "Re: 请寄来租约 [P-ABCDEFGH] (Golden Ox, San José)";
  const raw = buildMime({ from: "Odelia (Placetta) <odelia@placetta.com>", to: ["Mei Chen <mei@goldenox.com>"], replyTo: "odelia@in.placetta.com", subject, text: "Hello 你好\n\nLine two", html: "<p>Hello 你好</p>",
    headers: { "In-Reply-To": "<CAF1@mail.gmail.com>", References: "<CAF1@mail.gmail.com>" }, attachments: [{ name: "租约 v2.pdf", content: pdf, type: "application/pdf" }], boundary: "B", date: new Date("2026-10-27T17:00:00Z") });
  assert(!/[^\x00-\x7f]/.test(raw), "the raw message is 7-bit");
  assert(raw.split("\r\n").every((l) => l.length <= 998), "no line longer than SMTP allows");
  const m = parseMime(raw);
  assertEquals(m.headers.subject, [subject]);
  assert(REF_RE.test(m.headers.subject[0]));
  assertEquals(m.headers.from, ['"Odelia (Placetta)" <odelia@placetta.com>']);
  assertEquals(m.headers["reply-to"], ["odelia@in.placetta.com"]);
  assertEquals(m.headers["in-reply-to"], ["<CAF1@mail.gmail.com>"]);
  assertEquals(m.headers.date, ["Tue, 27 Oct 2026 17:00:00 +0000"]);
  assertEquals([m.text, m.html], ["Hello 你好\n\nLine two", "<p>Hello 你好</p>"]);
  assertEquals(m.files.map((f) => [f.name, f.mime, [...f.bytes]]), [["租约 v2.pdf", "application/pdf", [...pdf]]]);
});

Deno.test("MIME: values can't add headers (no CR/LF injection), and callers can't override From, To or Subject", () => {
  const raw = buildMime({ from: "odelia@placetta.com", to: ["mei@goldenox.com"], subject: "Hi\r\nBcc: everyone@evil.com", text: "t",
    headers: { "X-Note": "a\r\nBcc: x@evil.com", From: "ceo@placetta.com", "Content-Type": "text/html", "Bad Name\r\n": "v" }, attachments: [{ name: 'a"\r\nX: y.pdf', content: pdf, type: "application/pdf\r\nX: y" }], boundary: "B" });
  const m = parseMime(raw);
  assertEquals(m.headers.bcc, undefined);
  assertEquals(m.headers.x, undefined);
  assertEquals(m.headers.from, ["odelia@placetta.com"]);
  assertEquals(m.fromCount, 1);
  assertEquals(m.headers.subject, ["Hi Bcc: everyone@evil.com"]);
  assertEquals(m.files[0].mime, "application/octet-stream");
});
