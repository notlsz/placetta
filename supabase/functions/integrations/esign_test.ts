// Run: deno test -A supabase/functions/integrations/esign_test.ts
// Dropbox Sign against recorded answers: the key as Basic auth, the file inside the request (never a link), signers
// checked before anything goes out, test mode only when asked, and each signer's status read back.
import { deepStrictEqual as assertEquals, ok as assert, rejects, throws } from "node:assert";
import { basic, checkSend, DS_API, dsAccount, dsSend, dsStatus, type Fetch, SignError } from "./esign.ts";

const KEY = "a".repeat(64);
type Seen = { url: string; method: string; headers: Headers; form: FormData | null };
function stub(reply: (s: Seen) => unknown | Response) {
  const seen: Seen[] = [];
  const f: Fetch = async (u, init) => {
    const s = { url: String(u), method: init?.method ?? "GET", headers: new Headers(init?.headers), form: init?.body instanceof FormData ? init.body : null };
    seen.push(s);
    const out = reply(s);
    return out instanceof Response ? out : new Response(JSON.stringify(out), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { f, seen };
}
const SR = { signature_request: { signature_request_id: "fa5c8a0b0f492d768749333ad6fcc214c111e967", title: "Landlord authorization", is_complete: false, is_declined: false,
  signatures: [{ signer_email_address: "landlord@example.com", status_code: "awaiting_signature", signed_at: null }] } };

Deno.test("the key goes as Basic auth, key then a colon, and the account's email comes back", async () => {
  assertEquals(basic("abc"), `Basic ${btoa("abc:")}`);
  const { f, seen } = stub(() => ({ account: { email_address: "owner@goldenox.example" } }));
  assertEquals(await dsAccount(f, KEY), "owner@goldenox.example");
  assertEquals([seen[0].url, seen[0].headers.get("authorization")], [`${DS_API}/account`, basic(KEY)]);
  const refused = stub(() => new Response("{}", { status: 401 }));
  await rejects(dsAccount(refused.f, KEY), (e: unknown) => e instanceof SignError && e.status === 401 && /API key/.test(e.message) && !!e.zh);
});

Deno.test("a send carries the file itself and each signer, live unless test mode is asked", async () => {
  const { f, seen } = stub(() => SR);
  const file = { name: "authorization.pdf", mime: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) };
  const st = await dsSend(f, KEY, { title: "Landlord authorization", message: "Please sign so we can file the health permit.", signers: [{ name: "Pat Lee", email: "landlord@example.com" }], file, test: false });
  const form = seen[0].form!;
  assertEquals([seen[0].url, seen[0].method, form.get("title"), form.get("signers[0][name]"), form.get("signers[0][email_address]"), form.get("test_mode"), form.has("file_urls[0]")],
    [`${DS_API}/signature_request/send`, "POST", "Landlord authorization", "Pat Lee", "landlord@example.com", "0", false]);
  assertEquals([(form.get("files[0]") as File).name, (form.get("files[0]") as File).size], ["authorization.pdf", 4]);
  assertEquals(st, { id: SR.signature_request.signature_request_id, title: "Landlord authorization", complete: false, declined: false, signers: [{ email: "landlord@example.com", status: "awaiting_signature", signed_at: null }] });
  const t = stub(() => SR);
  await dsSend(t.f, KEY, { title: "x", signers: [{ name: "A", email: "a@b.co" }], file, test: true });
  assertEquals(t.seen[0].form!.get("test_mode"), "1");
});

Deno.test("signers and the file are checked before anything goes out", () => {
  const file = { name: "a.pdf", bytes: new Uint8Array([1]) };
  assertEquals(checkSend({ title: "T", signers: [{ name: " Pat ", email: "Pat@Example.com " }], file }), [{ name: "Pat", email: "pat@example.com" }]);
  throws(() => checkSend({ title: "T", signers: [], file }), /1 to 5 signers/);
  throws(() => checkSend({ title: "T", signers: Array(6).fill({ name: "A", email: "a@b.co" }), file }), /1 to 5 signers/);
  throws(() => checkSend({ title: "T", signers: [{ name: "A", email: "not-an-email" }], file }), /check not-an-email/);
  throws(() => checkSend({ title: "", signers: [{ name: "A", email: "a@b.co" }], file }), /title/);
  throws(() => checkSend({ title: "T", signers: [{ name: "A", email: "a@b.co" }] }), /Choose the document/);
});

Deno.test("status: each signer's state and when they signed; a made-up id never reaches Dropbox Sign", async () => {
  const done = { signature_request: { ...SR.signature_request, is_complete: true, signatures: [{ signer_email_address: "landlord@example.com", status_code: "signed", signed_at: 1792800000 }] } };
  const { f, seen } = stub(() => done);
  const st = await dsStatus(f, KEY, SR.signature_request.signature_request_id);
  assertEquals([seen[0].url, st.complete, st.signers[0]], [`${DS_API}/signature_request/${SR.signature_request.signature_request_id}`, true, { email: "landlord@example.com", status: "signed", signed_at: new Date(1792800000 * 1000).toISOString() }]);
  const none = stub(() => done);
  await rejects(dsStatus(none.f, KEY, "../account"), (e: unknown) => e instanceof SignError && e.status === 400);
  assert(none.seen.length === 0);
  const plan = stub(() => new Response(JSON.stringify({ error: { error_name: "payment_required" } }), { status: 402 }));
  await rejects(dsStatus(plan.f, KEY, SR.signature_request.signature_request_id), (e: unknown) => e instanceof SignError && /plan/.test(e.message));
});
