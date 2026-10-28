// SigV4 against AWS's published test suite (aws-sig-v4-test-suite, as kept in botocore's tests/unit/auth/aws4_testsuite):
// credentials AKIDEXAMPLE / wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY, us-east-1, service "service", 20150830T123600Z.
import { deepStrictEqual as assertEquals } from "node:assert";
import { awsFetch, canonicalQuery, signingKey, signV4 } from "./sigv4.ts";

const cred = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };
const date = new Date("2015-08-30T12:36:00Z");
const base = { region: "us-east-1", service: "service", date };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

const VECTORS: { name: string; method: string; url: string; headers?: Record<string, string>; body?: string; signed: string; sig: string }[] = [
  { name: "get-vanilla", method: "GET", url: "https://example.amazonaws.com/", signed: "host;x-amz-date", sig: "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31" },
  { name: "post-vanilla", method: "POST", url: "https://example.amazonaws.com/", signed: "host;x-amz-date", sig: "5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b" },
  { name: "get-vanilla-query-order-key-case", method: "GET", url: "https://example.amazonaws.com/?Param2=value2&Param1=value1", signed: "host;x-amz-date", sig: "b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500" },
  { name: "post-vanilla-query", method: "POST", url: "https://example.amazonaws.com/?Param1=value1", signed: "host;x-amz-date", sig: "28038455d6de14eafc1f9222cf5aa6f1a96197d7deb8263271d420d138af7f11" },
  { name: "get-vanilla-utf8-query", method: "GET", url: "https://example.amazonaws.com/?ሴ=bar", signed: "host;x-amz-date", sig: "2cdec8eed098649ff3a119c94853b13c643bcf08f8b0a1d91e12c9027818dd04" },
  { name: "get-utf8", method: "GET", url: "https://example.amazonaws.com/ሴ", signed: "host;x-amz-date", sig: "8318018e0b0f223aa2bbf98705b62bb787dc9c0e678f255a891fd03141be5d85" },
  { name: "get-header-value-trim", method: "GET", url: "https://example.amazonaws.com/", headers: { "My-Header1": " value1", "My-Header2": ' "a   b   c"' }, signed: "host;my-header1;my-header2;x-amz-date", sig: "acc3ed3afb60bb290fc8d2dd0098b9911fcaa05412b367055dee359757a9c736" },
  { name: "post-x-www-form-urlencoded", method: "POST", url: "https://example.amazonaws.com/", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "Param1=value1", signed: "content-type;host;x-amz-date", sig: "ff11897932ad3f4e8b18135d722051e5ac45fc38421b1da7b9d196a0fe09473a" },
];

for (const v of VECTORS) {
  Deno.test(`sigv4: AWS test suite, ${v.name}`, async () => {
    const s = await signV4({ ...base, method: v.method, url: v.url, headers: v.headers, body: v.body }, cred);
    assertEquals(s.signature, v.sig);
    assertEquals(s.headers.authorization, `AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=${v.signed}, Signature=${v.sig}`);
    assertEquals(s.headers["x-amz-date"], "20150830T123600Z");
  });
}

Deno.test("sigv4: the canonical request of get-vanilla is the suite's, byte for byte", async () => {
  const s = await signV4({ ...base, method: "GET", url: "https://example.amazonaws.com/" }, cred);
  assertEquals(s.canonicalRequest, "GET\n/\n\nhost:example.amazonaws.com\nx-amz-date:20150830T123600Z\n\nhost;x-amz-date\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assertEquals(s.stringToSign, "AWS4-HMAC-SHA256\n20150830T123600Z\n20150830/us-east-1/service/aws4_request\nbb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63");
});

Deno.test("sigv4: the derived signing key from AWS's documentation example", async () => {
  assertEquals(hex(await signingKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20120215", "us-east-1", "iam")), "f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d");
});

Deno.test("sigv4: query keys sorted, values encoded once", () => {
  assertEquals(canonicalQuery("?b=2&a=x y&a=1"), "a=1&a=x%20y&b=2");
  assertEquals(canonicalQuery(""), "");
});

Deno.test("sigv4: a session token is signed, and awsFetch sends what it signed", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const f = ((url: string, init: RequestInit) => { seen = { url, init }; return Promise.resolve(new Response("{}")); }) as typeof fetch;
  await awsFetch({ ...base, method: "POST", url: "https://email.us-east-1.amazonaws.com/v2/email/outbound-emails", headers: { "content-type": "application/json" }, body: "{}" }, { ...cred, sessionToken: "TOKEN" }, f);
  const h = seen!.init.headers as Record<string, string>;
  assertEquals(h["x-amz-security-token"], "TOKEN");
  assertEquals(/SignedHeaders=content-type;host;x-amz-date;x-amz-security-token,/.test(h.authorization), true);
  assertEquals(h.host, undefined);
});
