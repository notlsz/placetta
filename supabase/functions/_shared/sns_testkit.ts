// Test kit for SNS (sns_test.ts, ses_inbound_test.ts, scripts/redteam-test.ts): a signing certificate made on the spot
// with WebCrypto (a tiny DER writer), and messages signed the way SNS signs them (SignatureVersion 2). Never imported by
// a server function.
import { type SnsMessage, stringToSign } from "./sns.ts";

const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const len = (n: number) => n < 128 ? new Uint8Array([n]) : n < 256 ? new Uint8Array([0x81, n]) : new Uint8Array([0x82, n >> 8, n & 0xff]);
const tlv = (tag: number, body: Uint8Array) => cat(new Uint8Array([tag]), len(body.length), body);
const seq = (...a: Uint8Array[]) => tlv(0x30, cat(...a));
const set = (...a: Uint8Array[]) => tlv(0x31, cat(...a));
const oid = (s: string) => {
  const p = s.split(".").map(Number); const out = [40 * p[0] + p[1]];
  for (const v of p.slice(2)) { const b: number[] = []; let x = v; do { b.unshift(x & 0x7f); x = Math.floor(x / 128); } while (x); for (let i = 0; i < b.length - 1; i++) b[i] |= 0x80; out.push(...b); }
  return tlv(0x06, new Uint8Array(out));
};
const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
const utc = (d: Date) => tlv(0x17, new TextEncoder().encode(d.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));
const name = (cn: string) => seq(set(seq(oid("2.5.4.3"), utf8(cn))));
const b64 = (b: Uint8Array) => { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); };

export const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem";
export const TOPIC = "arn:aws:sns:us-east-1:123456789012:placetta-mail";

export type Kit = { pem: string; keys: CryptoKeyPair; sign: (m: Partial<SnsMessage>) => Promise<SnsMessage>; fetchCert: (url: string) => Promise<string>; fetched: string[] };

/** A key pair and a certificate for it, as SNS's would be (or not, with the options). */
export async function snsKit(o: { cn?: string; sans?: string[]; notBefore?: Date; notAfter?: Date; keys?: CryptoKeyPair; signer?: CryptoKeyPair } = {}): Promise<Kit> {
  const keys = o.keys ?? await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  const alg = seq(oid("1.2.840.113549.1.1.11"), new Uint8Array([0x05, 0x00]));
  const sans = o.sans ?? ["sns.amazonaws.com"];
  const ext = tlv(0xa3, seq(seq(oid("2.5.29.17"), tlv(0x04, seq(...sans.map((d) => tlv(0x82, new TextEncoder().encode(d))))))));
  const tbs = seq(tlv(0xa0, tlv(0x02, new Uint8Array([2]))), tlv(0x02, new Uint8Array([1, 2, 3, 4])), alg, name("Test CA"),
    seq(utc(o.notBefore ?? new Date(Date.now() - 86400_000)), utc(o.notAfter ?? new Date(Date.now() + 365 * 86400_000))), name(o.cn ?? "sns.amazonaws.com"), spki, ext);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, tbs));
  const der = seq(tbs, alg, tlv(0x03, cat(new Uint8Array([0]), sig)));
  const pem = `-----BEGIN CERTIFICATE-----\n${b64(der).replace(/.{64}/g, "$&\n")}\n-----END CERTIFICATE-----\n`;
  const fetched: string[] = [];
  const signer = o.signer ?? keys;
  return {
    pem, keys, fetched,
    fetchCert: (url) => { fetched.push(url); return Promise.resolve(pem); },
    async sign(m) {
      const msg = { Type: "Notification", MessageId: crypto.randomUUID(), TopicArn: TOPIC, Message: "{}", Timestamp: new Date().toISOString(), SignatureVersion: "2", SigningCertURL: CERT_URL, Signature: "", ...m } as SnsMessage;
      const text = stringToSign(msg) ?? "";
      msg.Signature = b64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer.privateKey, new TextEncoder().encode(text))));
      return msg;
    },
  };
}

/** An SES "Received" notification with the raw message inline (BASE64, as the SNS action sends it). */
export function received(raw: string, o: { recipients?: string[]; dmarc?: string; dkim?: string; spf?: string; virus?: string; from?: string[] } = {}) {
  const bytes = new TextEncoder().encode(raw);
  return {
    notificationType: "Received",
    mail: { messageId: "ses-" + crypto.randomUUID(), source: "bounce@goldenox.com", commonHeaders: { from: o.from ?? [] } },
    receipt: { recipients: o.recipients ?? ["odelia@in.placetta.com"], spfVerdict: { status: o.spf ?? "PASS" }, dkimVerdict: { status: o.dkim ?? "PASS" }, dmarcVerdict: { status: o.dmarc ?? "PASS" },
      spamVerdict: { status: "PASS" }, virusVerdict: { status: o.virus ?? "PASS" }, action: { type: "SNS", topicArn: TOPIC, encoding: "BASE64" } },
    content: b64(bytes),
  };
}
export const SES_ENV: Record<string, string> = { ODELIA_EMAIL: "odelia@placetta.com", ODELIA_REPLY_TO: "odelia@in.placetta.com", AWS_SES_SNS_TOPIC_ARNS: TOPIC, AWS_SES_ACCESS_KEY_ID: "AKIDTEST", AWS_SES_SECRET_ACCESS_KEY: "secret", AWS_SES_REGION: "us-east-1" };
export const sesEnv = (extra: Record<string, string> = {}) => (k: string) => ({ ...SES_ENV, ...extra } as Record<string, string>)[k];
