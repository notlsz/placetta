// MIME, both ways: reading a raw message (Amazon SES hands us the whole thing) and writing one (SES's raw send, so
// attachments, Reply-To and threading headers go out exactly as written). Pure; tested in mime_test.ts.

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

/* ------------------------------ reading ------------------------------ */

export type MimeFile = { name: string; mime: string; bytes: Bytes; size: number; inline: boolean };
export type ParsedMail = {
  /** Every header field, names lower-cased, values unfolded and with encoded-words decoded, in order. */
  headers: Record<string, string[]>;
  /** How many From fields the message has. More than one is a forgery trick: callers treat it as unverified. */
  fromCount: number;
  text: string;
  html: string;
  files: MimeFile[];
};

/** A "binary string" (one char per byte) from bytes, in chunks so a big message can't overflow the stack. */
export const binStr = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
/** Bytes from a "binary string" (one char per byte). */
const latin1 = (s: string): Bytes => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b as Bytes; };
function decodeText(b: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  try { return new TextDecoder(cs === "gb2312" ? "gbk" : cs).decode(b); } catch { return new TextDecoder("utf-8").decode(b); }
}
function b64bytes(s: string): Bytes {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  try { return latin1(atob(clean.replace(/=+$/, "").padEnd(Math.ceil(clean.replace(/=+$/, "").length / 4) * 4, "="))); } catch { return new Uint8Array(0) as Bytes; }
}
function qpBytes(s: string, header = false): Bytes {
  const src = header ? s.replace(/_/g, " ") : s.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) { out.push(parseInt(src.slice(i + 1, i + 3), 16)); i += 2; }
    else out.push(src.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out) as Bytes;
}

/** RFC 2047: =?utf-8?B?...?= and =?gbk?Q?...?= in a header; whitespace between two encoded-words is dropped. */
export function decodeWords(v: string): string {
  return String(v ?? "").replace(/(=\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)\s+(?==\?[^?\s]+\?[bBqQ]\?[^?\s]*\?=)/g, "$1")
    .replace(/=\?([^?\s]+)\?([bBqQ])\?([^?\s]*)\?=/g, (_, cs: string, how: string, data: string) => decodeText(how.toUpperCase() === "B" ? b64bytes(data) : qpBytes(data, true), cs.split("*")[0]));
}

type Part = { head: string; body: string };   // both as binary strings, CRLF line ends
function split(raw: string): Part {
  const i = raw.search(/\r?\n\r?\n/);
  if (i < 0) return { head: raw, body: "" };
  const m = /\r?\n\r?\n/.exec(raw.slice(i))!;
  return { head: raw.slice(0, i), body: raw.slice(i + m[0].length) };
}
function fieldsOf(head: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const line of head.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1].value += " " + line.trim();
    else { const c = line.indexOf(":"); if (c > 0) out.push({ name: line.slice(0, c).trim().toLowerCase(), value: line.slice(c + 1).trim() }); }
  }
  return out;
}
/** A structured header's value and parameters, with RFC 2231 (name*=utf-8''..., name*0*=...) put back together. */
export function params(v: string): { value: string; params: Record<string, string> } {
  const parts: string[] = []; let cur = "", q = false;
  for (const ch of String(v ?? "")) { if (ch === '"') q = !q; if (ch === ";" && !q) { parts.push(cur); cur = ""; } else cur += ch; }
  parts.push(cur);
  const out: Record<string, string> = {}; const cont: Record<string, { i: number; v: string; enc: boolean }[]> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("="); if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase(); let val = p.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, "$1");
    const m = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
    if (m) (cont[m[1]] ??= []).push({ i: Number(m[2] ?? 0), v: val, enc: !!m[3] || (m[2] === undefined) });
    else out[k] = decodeWords(val);
  }
  for (const [k, list] of Object.entries(cont)) {
    list.sort((a, b) => a.i - b.i);
    let cs = "utf-8"; const chunks: number[] = [];
    list.forEach((x, n) => {
      let v = x.v;
      if (n === 0 && x.enc) { const m = /^([^']*)'[^']*'(.*)$/.exec(v); if (m) { cs = m[1] || cs; v = m[2]; } }
      if (x.enc) for (const b of qpBytes(v.replace(/%([0-9A-Fa-f]{2})/g, "=$1"))) chunks.push(b); else for (const b of latin1(v)) chunks.push(b);
    });
    out[k] = decodeText(new Uint8Array(chunks), cs);
  }
  return { value: parts[0].trim().toLowerCase(), params: out };
}

function bodyBytes(body: string, cte: string): Bytes {
  const c = cte.toLowerCase();
  if (c === "base64") return b64bytes(body);
  if (c === "quoted-printable") return qpBytes(body);
  return latin1(body);
}

/**
 * Reads a raw message (as received: a string whose chars are bytes, or real text; both work for the usual 7-bit mail).
 * The first text/plain and text/html parts that aren't attachments are the body; every other leaf with a file name, or
 * marked as an attachment, is a file. Nesting is followed 8 levels down; anything deeper is ignored.
 */
export function parseMime(raw: string | Uint8Array): ParsedMail {
  const s = typeof raw === "string" ? (/[^\x00-\xff]/.test(raw) ? binStr(enc.encode(raw)) : raw) : binStr(raw);
  const top = split(s);
  const fields = fieldsOf(top.head);
  const headers: Record<string, string[]> = {};
  for (const f of fields) (headers[f.name] ??= []).push(decodeWords(f.value));
  const out: ParsedMail = { headers, fromCount: fields.filter((f) => f.name === "from").length, text: "", html: "", files: [] };
  const walk = (part: Part, fs: { name: string; value: string }[], depth: number) => {
    const get = (k: string) => fs.find((f) => f.name === k)?.value ?? "";
    const ct = params(get("content-type") || "text/plain; charset=us-ascii");
    const cd = params(get("content-disposition"));
    const cte = get("content-transfer-encoding").trim() || "7bit";
    if (ct.value.startsWith("multipart/")) {
      const b = ct.params.boundary;
      if (!b || depth > 8) return;
      const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // everything after the closing delimiter is the epilogue, never a part
      const close = part.body.search(new RegExp(`(?:^|\\r?\\n)--${esc}--`));
      const inner = close >= 0 ? part.body.slice(0, close) : part.body;
      const pieces = inner.split(new RegExp(`(?:^|\\r?\\n)--${esc}[ \\t]*(?:\\r?\\n|$)`));
      for (const p of pieces.slice(1)) {
        if (!p.trim()) continue;
        const sub = split(p);
        walk(sub, fieldsOf(sub.head), depth + 1);
      }
      return;
    }
    const name = cd.params.filename || ct.params.name || "";
    const attached = cd.value === "attachment" || (!!name && !ct.value.startsWith("text/"));
    const data = bodyBytes(part.body, cte);
    if (!attached && ct.value === "text/plain" && !out.text) { out.text = decodeText(data, ct.params.charset ?? "utf-8"); return; }
    if (!attached && ct.value === "text/html" && !out.html) { out.html = decodeText(data, ct.params.charset ?? "utf-8"); return; }
    if (ct.value === "message/rfc822" && !name) { const inner = split(part.body); walk(inner, fieldsOf(inner.head), depth + 1); return; }
    if (name || attached) out.files.push({ name: (name || "attachment").replace(/[\r\n]/g, " ").slice(0, 200), mime: ct.value, bytes: data, size: data.length, inline: cd.value === "inline" });
  };
  walk(top, fields, 0);
  return out;
}

/* ------------------------------ writing ------------------------------ */

export type OutFile = { name: string; content: Uint8Array; type: string };
export type OutMail = {
  from: string; to: string[]; subject: string; text: string; html?: string;
  replyTo?: string; headers?: Record<string, string>; attachments?: OutFile[];
  /** The boundary and date, fixed in tests. */
  boundary?: string; date?: Date;
};

/** No CR or LF ever reaches a header from a value: that is how header injection works. */
const oneLine = (s: string) => String(s ?? "").replace(/[\r\n\0]+/g, " ").trim();
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const wrap76 = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");
/** An RFC 2047 encoded-word for a header value that isn't plain ASCII (split so no word passes 75 chars). */
export function encodeWord(v: string): string {
  const s = oneLine(v);
  if (ascii(s)) return s;
  const words: string[] = []; let chunk = "";
  for (const ch of s) {
    if (enc.encode(chunk + ch).length > 45) { words.push(chunk); chunk = ""; }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${b64(enc.encode(w))}?=`).join("\r\n ");
}
/** "Name <a@b>" with the name quoted or encoded as needed. */
export function addressHeader(v: string): string {
  const s = oneLine(v);
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(s);
  if (!m || !m[1].trim()) return s.replace(/[<>"]/g, "") || s;
  const name = m[1].trim();
  return `${ascii(name) ? `"${name.replace(/["\\]/g, "")}"` : encodeWord(name)} <${m[2]}>`;
}

export function buildMime(m: OutMail): string {
  const bnd = m.boundary ?? `=_pc_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines: string[] = [];
  const h = (k: string, v: string) => lines.push(`${k}: ${v}`);
  h("From", addressHeader(m.from));
  h("To", m.to.map(addressHeader).join(", "));
  if (m.replyTo) h("Reply-To", addressHeader(m.replyTo));
  h("Subject", encodeWord(m.subject));
  h("Date", (m.date ?? new Date()).toUTCString().replace("GMT", "+0000"));
  h("MIME-Version", "1.0");
  for (const [k, v] of Object.entries(m.headers ?? {})) {
    const key = k.replace(/[^A-Za-z0-9-]/g, "");
    if (!key || /^(from|to|cc|bcc|subject|date|mime-version|content-.*|reply-to|return-path|sender)$/i.test(key)) continue;   // never overridden by a caller
    h(key, encodeWord(v));
  }
  const textPart = `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(enc.encode(m.text ?? "")))}`;
  const htmlPart = m.html ? `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(enc.encode(m.html)))}` : "";
  const alt = htmlPart ? `Content-Type: multipart/alternative; boundary="${bnd}a"\r\n\r\n--${bnd}a\r\n${textPart}--${bnd}a\r\n${htmlPart}--${bnd}a--\r\n` : textPart;
  const files = m.attachments ?? [];
  if (!files.length) return lines.join("\r\n") + "\r\n" + alt;
  let body = `Content-Type: multipart/mixed; boundary="${bnd}m"\r\n\r\n--${bnd}m\r\n${alt}`;
  for (const f of files) {
    const name = oneLine(f.name).replace(/["\\]/g, "").slice(0, 150) || "attachment";
    const type = /^[\w.+-]+\/[\w.+-]+$/.test(f.type) ? f.type : "application/octet-stream";
    const quoted = ascii(name) ? `"${name}"` : `"${encodeWord(name).replace(/\r\n /g, " ")}"`;
    const star = ascii(name) ? "" : `; filename*=UTF-8''${encodeURIComponent(name)}`;
    body += `--${bnd}m\r\nContent-Type: ${type}; name=${quoted}\r\nContent-Disposition: attachment; filename=${quoted}${star}\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(f.content))}`;
  }
  body += `--${bnd}m--\r\n`;
  return lines.join("\r\n") + "\r\n" + body;
}
