// Amazon SNS messages posted to an HTTPS endpoint (Amazon SES's inbound mail, bounces and complaints reach odelia-mail
// this way). Anyone can POST to that URL, and anyone with an AWS account can make their own topic and point it at us
// with a perfectly valid AWS signature. So a message counts only when all of this holds:
//
//   1. SigningCertURL is https://sns.<our region>.amazonaws.com/<name>.pem: no other host, port, scheme or region,
//      and the certificate is fetched from there only (over TLS, which is what vouches for it).
//   2. The certificate is in date and names SNS (CN or a DNS name sns.amazonaws.com / sns.<region>.amazonaws.com).
//   3. SignatureVersion is 2: RSA with SHA-256 over the fields AWS lists for the message type. Version 1 (SHA-1) is
//      refused; set SignatureVersion=2 on the topic (SETUP.md).
//   4. TopicArn is one of ours (AWS_SES_SNS_TOPIC_ARNS). A real, signed message from someone else's topic is refused.
//   5. The timestamp is recent: a replay of an old signed message is refused.
//
// A subscription is confirmed only for one of our topics, by a GET to a SubscribeURL on the same pinned host.
// Pure apart from the fetch it's given; tested in sns_test.ts with a certificate made in the test.
import { sesRegion } from "./email.ts";

export type Env = (k: string) => string | undefined;
export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation" | string;
  MessageId: string; TopicArn: string; Message: string; Timestamp: string;
  Subject?: string; Token?: string; SubscribeURL?: string; UnsubscribeURL?: string;
  SignatureVersion: string; Signature: string; SigningCertURL: string;
};
export type SnsCheck = { ok: true; msg: SnsMessage; why?: undefined } | { ok: false; why: string; msg?: undefined };

export { sesRegion };
export const ourTopics = (env: Env) => (env("AWS_SES_SNS_TOPIC_ARNS") || "").split(",").map((s) => s.trim()).filter((s) => /^arn:aws:sns:[a-z0-9-]+:\d{12}:[\w-]{1,256}$/.test(s));

/** https://sns.<region>.amazonaws.com/..., exactly; nothing else is fetched. */
export function snsUrlOk(u: string, region: string, kind: "cert" | "subscribe"): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  if (url.hostname !== `sns.${region}.amazonaws.com`) return false;
  if (kind === "cert") return /^\/[\w.-]+\.pem$/.test(url.pathname) && !url.search;
  return url.pathname === "/" && url.searchParams.get("Action") === "ConfirmSubscription";
}

/** The bytes AWS signs: "Key\nValue\n" for each field, in this order, the optional ones only when present. */
export function stringToSign(m: SnsMessage): string | null {
  const keys = m.Type === "Notification" ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
    : m.Type === "SubscriptionConfirmation" || m.Type === "UnsubscribeConfirmation" ? ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] : null;
  if (!keys) return null;
  let s = "";
  for (const k of keys) {
    const v = (m as Record<string, unknown>)[k];
    if (v === undefined || v === null) { if (k === "Subject") continue; return null; }
    s += `${k}\n${String(v)}\n`;
  }
  return s;
}

/* ------------------------------ the certificate (just enough DER) ------------------------------ */

type Node = { tag: number; start: number; hdr: number; len: number; end: number };
function node(b: Uint8Array, at: number): Node {
  const tag = b[at];
  let len = b[at + 1], hdr = 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4) throw new Error("der length");
    len = 0; for (let i = 0; i < n; i++) len = len * 256 + b[at + 2 + i];
    hdr += n;
  }
  const end = at + hdr + len;
  if (end > b.length) throw new Error("der overrun");
  return { tag, start: at, hdr, len, end };
}
function children(b: Uint8Array, n: Node): Node[] {
  const out: Node[] = []; let at = n.start + n.hdr;
  while (at < n.end) { const c = node(b, at); out.push(c); at = c.end; }
  return out;
}
const body = (b: Uint8Array, n: Node) => b.subarray(n.start + n.hdr, n.end);
const latin = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return s; };
function time(b: Uint8Array, n: Node): number {
  const s = latin(body(b, n));
  const m = n.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new Error("der time");
  const y = n.tag === 0x17 ? (Number(m[1]) < 50 ? 2000 : 1900) + Number(m[1]) : Number(m[1]);
  return Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}
const OID_CN = "2.5.4.3", OID_SAN = "2.5.29.17";
function oid(b: Uint8Array): string {
  const parts = [Math.floor(b[0] / 40), b[0] % 40]; let v = 0;
  for (const x of b.subarray(1)) { v = v * 128 + (x & 0x7f); if (!(x & 0x80)) { parts.push(v); v = 0; } }
  return parts.join(".");
}

export type Cert = { spki: Uint8Array; notBefore: number; notAfter: number; names: string[] };
export function pemToDer(pem: string): Uint8Array {
  const m = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/.exec(pem);
  if (!m) throw new Error("no certificate");
  const bin = atob(m[1].replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** The public key, validity and names (subject CN and DNS SANs) of an X.509 certificate. */
export function readCert(der: Uint8Array): Cert {
  const cert = node(der, 0);
  const tbs = children(der, cert)[0];
  let f = children(der, tbs);
  if (f[0].tag === 0xa0) f = f.slice(1);   // [0] version
  // serial, signature alg, issuer, validity, subject, spki, ...
  const [, , , validity, subject, spki, ...rest] = f;
  const [nb, na] = children(der, validity);
  const names: string[] = [];
  for (const rdn of children(der, subject)) for (const atv of children(der, rdn)) {
    const [o, v] = children(der, atv);
    if (oid(body(der, o)) === OID_CN) names.push(latin(body(der, v)).toLowerCase());
  }
  for (const ext of rest) if (ext.tag === 0xa3) {
    for (const e of children(der, children(der, ext)[0])) {
      const parts = children(der, e);
      if (oid(body(der, parts[0])) !== OID_SAN) continue;
      const octet = parts[parts.length - 1];
      const seq = node(der, octet.start + octet.hdr);
      for (const gn of children(der, seq)) if (gn.tag === 0x82) names.push(latin(body(der, gn)).toLowerCase());
    }
  }
  return { spki: der.slice(spki.start, spki.end), notBefore: time(der, nb), notAfter: time(der, na), names };
}
export const namesSns = (names: string[], region: string) => names.some((n) => n === "sns.amazonaws.com" || n === `sns.${region}.amazonaws.com`);

/* ------------------------------ verifying ------------------------------ */

export type FetchCert = (url: string) => Promise<string>;
const certCache = new Map<string, { key: CryptoKey; notAfter: number }>();

const b64bytes = (s: string) => { const bin = atob(String(s ?? "").replace(/\s+/g, "")); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };

/** Checks an SNS POST body completely. Never throws. */
export async function verifySns(raw: string, env: Env, o: { fetchCert?: FetchCert; now?: number; maxAgeMs?: number } = {}): Promise<SnsCheck> {
  let m: SnsMessage;
  try { m = JSON.parse(raw); } catch { return { ok: false, why: "not_json" }; }
  if (!m || typeof m !== "object" || typeof m.Signature !== "string" || typeof m.SigningCertURL !== "string") return { ok: false, why: "not_sns" };
  const region = sesRegion(env);
  const now = o.now ?? Date.now();
  if (String(m.SignatureVersion) !== "2") return { ok: false, why: "signature_version" };
  if (!snsUrlOk(m.SigningCertURL, region, "cert")) return { ok: false, why: "cert_url" };
  const topics = ourTopics(env);
  if (!topics.length) return { ok: false, why: "no_topics_configured" };
  if (!topics.includes(String(m.TopicArn))) return { ok: false, why: "foreign_topic" };
  const ts = Date.parse(String(m.Timestamp));
  if (!Number.isFinite(ts) || ts > now + 5 * 60_000 || now - ts > (o.maxAgeMs ?? 12 * 3600_000)) return { ok: false, why: "stale" };
  const text = stringToSign(m);
  if (!text) return { ok: false, why: "bad_type" };
  try {
    let hit = certCache.get(m.SigningCertURL);
    if (!hit || hit.notAfter < now) {
      const pem = await (o.fetchCert ?? defaultFetchCert)(m.SigningCertURL);
      const c = readCert(pemToDer(pem));
      if (now < c.notBefore || now > c.notAfter) return { ok: false, why: "cert_expired" };
      if (!namesSns(c.names, region)) return { ok: false, why: "cert_not_sns" };
      const key = await crypto.subtle.importKey("spki", c.spki as Uint8Array<ArrayBuffer>, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      hit = { key, notAfter: c.notAfter };
      if (!o.fetchCert) certCache.set(m.SigningCertURL, hit);
    }
    const good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", hit.key, b64bytes(m.Signature), new TextEncoder().encode(text));
    return good ? { ok: true, msg: m } : { ok: false, why: "bad_signature" };
  } catch (e) { return { ok: false, why: "cert_error:" + String(e).slice(0, 60) }; }
}

const defaultFetchCert: FetchCert = async (url) => {
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`cert ${res.status}`);
  const t = await res.text();
  if (t.length > 20_000) throw new Error("cert too big");
  return t;
};

/** Confirms a verified SubscriptionConfirmation for one of our topics. */
export async function confirmSubscription(m: SnsMessage, env: Env, f: typeof fetch = fetch): Promise<boolean> {
  if (m.Type !== "SubscriptionConfirmation" || !m.SubscribeURL || !snsUrlOk(m.SubscribeURL, sesRegion(env), "subscribe")) return false;
  if (!ourTopics(env).includes(m.TopicArn) || new URL(m.SubscribeURL).searchParams.get("TopicArn") !== m.TopicArn) return false;
  const res = await f(m.SubscribeURL, { redirect: "error", signal: AbortSignal.timeout(10000) }).catch(() => null);
  return !!res?.ok;
}
