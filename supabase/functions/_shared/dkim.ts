// DKIM verification (RFC 6376, with Ed25519 from RFC 8463), for mail whose raw text we have. Postmark's inbound webhook
// includes the raw message when RawEmailEnabled is on; its other authentication signals (X-Spam-Tests, any
// Authentication-Results) can be written by the sender, so for Postmark we check the signature ourselves.
//
// What counts: a signature that verifies against the key the signing domain publishes in DNS, that covers the From
// header, that signs the whole body (no l= tag), and whose d= is the From address's own domain or a parent of it.
// Everything else fails, so callers fail closed.

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const b64 = (s: string): Bytes => { const bin = atob(s.replace(/\s+/g, "")), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const sha256 = (s: string | Bytes) => crypto.subtle.digest("SHA-256", typeof s === "string" ? enc.encode(s) : s);

/** Looks up a DNS TXT name. Each answer is one record with its strings joined; [] when the name has none; null when
 *  the lookup itself failed. */
export type TxtLookup = (name: string) => Promise<string[] | null>;

/** Joins a TXT record's quoted strings ("v=DKIM1; " "p=MIIB...") into one value. */
export function joinTxt(data: string): string {
  const s = String(data ?? "").trim();
  if (!s.startsWith('"')) return s;
  return [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, "$1")).join("");
}

/** TXT records over DNS-over-HTTPS (Cloudflare, then Google), since the edge runtime has no resolver of its own. */
export const dohTxt: TxtLookup = async (name) => {
  for (const base of ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"]) {
    try {
      const res = await fetch(`${base}?name=${encodeURIComponent(name)}&type=TXT`, { headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const j = await res.json() as { Status?: number; Answer?: { type?: number; data?: string }[] };
      if (j.Status === 3) return [];   // no such name
      if (j.Status !== 0) continue;
      return (j.Answer ?? []).filter((a) => a.type === 16).map((a) => joinTxt(String(a.data ?? "")));
    } catch { /* try the next resolver */ }
  }
  return null;
};

/* ------------------------------ the message ------------------------------ */

type Field = { name: string; raw: string };
/** Splits a raw message into its header fields (each with its folding kept, without the final CRLF) and its body.
 *  Line ends become CRLF, as they were on the wire. */
export function splitMessage(raw: string): { fields: Field[]; body: string } {
  const text = String(raw ?? "").replace(/\r?\n/g, "\r\n");
  const cut = text.indexOf("\r\n\r\n");
  const head = cut < 0 ? text : text.slice(0, cut);
  const body = cut < 0 ? "" : text.slice(cut + 4);
  const fields: Field[] = [];
  for (const line of head.split("\r\n")) {
    if (/^[ \t]/.test(line) && fields.length) fields[fields.length - 1].raw += "\r\n" + line;
    else if (line) fields.push({ name: line.slice(0, Math.max(0, line.indexOf(":"))).trim().toLowerCase(), raw: line });
  }
  return { fields, body };
}

/** A header field's value with folding undone. */
export const fieldValue = (f: Field) => f.raw.slice(f.raw.indexOf(":") + 1).replace(/\r\n(?=[ \t])/g, "").trim();

function canonHeader(f: Field, relaxed: boolean): string {
  if (!relaxed) return f.raw + "\r\n";
  const value = f.raw.slice(f.raw.indexOf(":") + 1).replace(/\r\n(?=[ \t])/g, "").replace(/[ \t]+/g, " ").trim();
  return `${f.name}:${value}\r\n`;
}

function canonBody(body: string, relaxed: boolean): string {
  let lines = body.split("\r\n");
  if (relaxed) lines = lines.map((l) => l.replace(/[ \t]+/g, " ").replace(/ $/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  if (!lines.length) return relaxed ? "" : "\r\n";
  return lines.join("\r\n") + "\r\n";
}

/** The tag=value list of a DKIM-Signature or a key record. */
export function tags(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).replace(/\s+/g, "").toLowerCase();
    if (k && !(k in out)) out[k] = part.slice(eq + 1).replace(/\r\n(?=[ \t])/g, "").trim();
  }
  return out;
}

/* ------------------------------ keys ------------------------------ */

/** DER length bytes. */
function derLen(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  for (let x = n; x > 0; x >>= 8) out.unshift(x & 0xff);
  return [0x80 | out.length, ...out];
}
/** Some domains publish a bare PKCS#1 RSA key instead of the usual SubjectPublicKeyInfo; this wraps one in the other. */
function spkiFromPkcs1(pkcs1: Bytes): Bytes {
  const algo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const bits = [0x03, ...derLen(pkcs1.length + 1), 0x00, ...pkcs1];
  return new Uint8Array([0x30, ...derLen(algo.length + bits.length), ...algo, ...bits]);
}

async function importKey(kind: "rsa" | "ed25519", p: string): Promise<CryptoKey | null> {
  let bytes: Bytes;
  try { bytes = b64(p); } catch { return null; }
  if (kind === "ed25519") {
    if (bytes.length !== 32) return null;
    try { return await crypto.subtle.importKey("raw", bytes, { name: "Ed25519" }, false, ["verify"]); } catch { return null; }
  }
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  let key: CryptoKey | null = null;
  try { key = await crypto.subtle.importKey("spki", bytes, alg, false, ["verify"]); } catch {
    try { key = await crypto.subtle.importKey("spki", spkiFromPkcs1(bytes), alg, false, ["verify"]); } catch { return null; }
  }
  // Keys shorter than 1024 bits don't count (RFC 8301).
  const bitsLong = (key.algorithm as RsaHashedKeyAlgorithm).modulusLength ?? 0;
  return bitsLong >= 1024 ? key : null;
}

/* ------------------------------ verifying ------------------------------ */

const domainOf = (addr: string) => (addr.split("@")[1] ?? "").toLowerCase();
/** The signing domain may be the From address's own domain or a parent of it (never a bare top-level domain), so
 *  someone who controls a subdomain under the From domain can't sign for it. */
export function dkimAligned(d: string, from: string): boolean {
  const a = String(d ?? "").toLowerCase().replace(/\.$/, ""), b = domainOf(from);
  return !!a && !!b && a.includes(".") && (a === b || b.endsWith("." + a));
}

export type DkimResult = { ok: boolean; why: string; domain?: string };

/**
 * Whether the raw message carries a valid DKIM signature for the From address `from`. The message must have exactly
 * one From header, holding exactly that one address, so what the signature covers is what the app shows.
 */
export async function verifyDkim(raw: string, from: string, o: { txt: TxtLookup; now?: number }): Promise<DkimResult> {
  const { fields, body } = splitMessage(raw);
  if (!fields.length) return { ok: false, why: "no_headers" };
  const froms = fields.filter((f) => f.name === "from");
  if (froms.length !== 1) return { ok: false, why: froms.length ? "several_from_headers" : "no_from_header" };
  const addrs = [...fieldValue(froms[0]).replace(/"(?:[^"\\]|\\.)*"/g, "").replace(/\([^)]*\)/g, "").matchAll(/[^\s<>",;:]+@[^\s<>",;:]+/g)].map((m) => m[0].toLowerCase());
  if (addrs.length !== 1 || addrs[0] !== String(from ?? "").trim().toLowerCase()) return { ok: false, why: "from_mismatch" };

  const sigs = fields.filter((f) => f.name === "dkim-signature").slice(0, 5);
  if (!sigs.length) return { ok: false, why: "unsigned" };
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  let why = "no_aligned_signature";
  for (const sig of sigs) {
    const t = tags(fieldValue(sig));
    const algo = (t.a ?? "").toLowerCase();
    const d = (t.d ?? "").toLowerCase(), s = (t.s ?? "").toLowerCase();
    if (t.v !== "1" || !t.b || !t.bh || !d || !s || !t.h) { why = "malformed_signature"; continue; }
    if (algo !== "rsa-sha256" && algo !== "ed25519-sha256") { why = "weak_algorithm"; continue; }
    if (!dkimAligned(d, from)) continue;
    // A body length limit lets anyone append to a signed message, so such signatures don't count.
    if ("l" in t) { why = "partial_body"; continue; }
    if (t.x && /^\d+$/.test(t.x) && Number(t.x) < now) { why = "expired"; continue; }
    const signed = t.h.split(":").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (!signed.includes("from")) { why = "from_not_signed"; continue; }
    if (!/^[a-z0-9._-]+$/.test(s) || !/^[a-z0-9.-]+$/.test(d)) { why = "malformed_signature"; continue; }
    const [hc, bc] = (t.c ?? "simple/simple").toLowerCase().split("/");
    const relaxedHead = hc === "relaxed", relaxedBody = (bc ?? "simple") === "relaxed";

    if (toB64(await sha256(canonBody(body, relaxedBody))) !== t.bh.replace(/\s+/g, "")) { why = "body_changed"; continue; }

    // The signed headers: for each name in h=, the next instance from the bottom; a name with none left adds nothing.
    const used = new Map<string, number>();
    let data = "";
    for (const name of signed) {
      const all = fields.filter((f) => f.name === name);
      const n = used.get(name) ?? 0;
      const f = all[all.length - 1 - n];
      used.set(name, n + 1);
      if (f) data += canonHeader(f, relaxedHead);
    }
    // Then the signature header itself with its b= value emptied, without the final CRLF.
    const blank = { name: sig.name, raw: sig.raw.replace(/((?:^[^:]*:|;)\s*b\s*=)[^;]*/i, "$1") };
    data += canonHeader(blank, relaxedHead).replace(/\r\n$/, "");

    const records = await o.txt(`${s}._domainkey.${d}`);
    if (records === null) { why = "dns_failed"; continue; }
    const rec = records.map(tags).find((r) => "p" in r);
    if (!rec || !rec.p) { why = "no_key"; continue; }
    const kind = (rec.k ?? "rsa").toLowerCase();
    if ((kind === "ed25519") !== (algo === "ed25519-sha256") || (kind !== "rsa" && kind !== "ed25519")) { why = "key_mismatch"; continue; }
    if (rec.h && !rec.h.toLowerCase().split(":").map((x) => x.trim()).includes("sha256")) { why = "key_mismatch"; continue; }
    // t=s: the i= domain must be d itself, not a subdomain.
    if ((rec.t ?? "").split(":").map((x) => x.trim()).includes("s") && t.i && domainOf(t.i) !== d) { why = "key_mismatch"; continue; }
    const key = await importKey(kind as "rsa" | "ed25519", rec.p);
    if (!key) { why = "bad_key"; continue; }
    let sigBytes: Bytes;
    try { sigBytes = b64(t.b); } catch { why = "malformed_signature"; continue; }
    const good = kind === "ed25519"
      ? await crypto.subtle.verify("Ed25519", key, sigBytes, await sha256(data)).catch(() => false)
      : await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sigBytes, enc.encode(data)).catch(() => false);
    if (good) return { ok: true, why: "dkim_pass", domain: d };
    why = "bad_signature";
  }
  return { ok: false, why };
}
