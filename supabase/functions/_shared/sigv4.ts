// AWS Signature Version 4, with WebCrypto and nothing else, for Amazon SES (sending) and S3 (an inbound message too
// big for SNS). Small enough to read in one sitting; checked against AWS's own SigV4 test suite in sigv4_test.ts.
//
// https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (s: string | Uint8Array): Bytes => (typeof s === "string" ? enc.encode(s) : new Uint8Array(s)) as Bytes;
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256Hex = async (s: string | Uint8Array) => hex(await crypto.subtle.digest("SHA-256", bytes(s)));
async function hmac(key: Uint8Array | ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key instanceof ArrayBuffer ? key : bytes(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 encoding, as SigV4 wants it: everything but A-Z a-z 0-9 - _ . ~ is %XX (upper case). */
export const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };

export type Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
export type SignInput = {
  method: string; url: string; region: string; service: string;
  /** Headers to sign and send. host and x-amz-date are added. */
  headers?: Record<string, string>;
  body?: string | Uint8Array;
  /** The time to sign at (tests); now by default. */
  date?: Date;
  /** Adds x-amz-content-sha256 (S3 wants it). */
  contentSha?: boolean;
};

/** The date as SigV4 writes it: 20150830T123600Z. */
export const amzDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function canonicalUri(pathname: string): string {
  const p = pathname || "/";
  return p.split("/").map((seg) => uriEncode(decode(seg))).join("/") || "/";
}
export function canonicalQuery(search: string): string {
  const q = search.replace(/^\?/, "");
  if (!q) return "";
  return q.split("&").filter(Boolean).map((kv) => {
    const i = kv.indexOf("=");
    const k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? "" : kv.slice(i + 1);
    return [uriEncode(decode(k.replace(/\+/g, " "))), uriEncode(decode(v.replace(/\+/g, " ")))] as const;
  }).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join("&");
}

/** The signing key: HMAC chain over the date, region, service. */
export async function signingKey(secret: string, day: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode("AWS4" + secret), day);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return await hmac(kService, "aws4_request");
}

/** Signs a request. Returns every header to send (with Authorization) and the pieces, for tests. */
export async function signV4(input: SignInput, cred: Credentials): Promise<{ headers: Record<string, string>; canonicalRequest: string; stringToSign: string; signature: string }> {
  const url = new URL(input.url);
  const when = amzDate(input.date ?? new Date());
  const day = when.slice(0, 8);
  const body = input.body ?? "";
  const payloadHash = await sha256Hex(body);
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.headers ?? {})) h[k.toLowerCase()] = String(v);
  h["host"] = url.host;
  h["x-amz-date"] = when;
  if (input.contentSha) h["x-amz-content-sha256"] = payloadHash;
  if (cred.sessionToken) h["x-amz-security-token"] = cred.sessionToken;
  const names = Object.keys(h).sort();
  // values trimmed, inner runs of spaces folded to one (the suite's get-header-value-trim)
  const canonHeaders = names.map((n) => `${n}:${h[n].trim().replace(/\s+/g, " ")}\n`).join("");
  const signed = names.join(";");
  const canonicalRequest = [input.method.toUpperCase(), canonicalUri(url.pathname), canonicalQuery(url.search), canonHeaders, signed, payloadHash].join("\n");
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", when, scope, await sha256Hex(canonicalRequest)].join("\n");
  const signature = hex(await hmac(await signingKey(cred.secretAccessKey, day, input.region, input.service), stringToSign));
  const out: Record<string, string> = { ...h, authorization: `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}` };
  delete out.host;   // fetch sets it
  return { headers: out, canonicalRequest, stringToSign, signature };
}

/** fetch, signed. */
export async function awsFetch(input: SignInput, cred: Credentials, f: typeof fetch = fetch, timeoutMs = 15000): Promise<Response> {
  const s = await signV4(input, cred);
  const body = input.body === undefined ? undefined : typeof input.body === "string" ? input.body : bytes(input.body);
  return await f(input.url, { method: input.method, headers: s.headers, body, signal: AbortSignal.timeout(timeoutMs) });
}
