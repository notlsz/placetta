// Run: deno test supabase/functions/_shared/imessage_flag_test.ts
// iMessage on Linq is behind LINQ_ENABLED (linq.ts). With the flag off, a text goes out by Telnyx SMS even when every
// Linq key is set, and Linq is never called; with it on, iMessage goes first. No live key: fetch is a stand-in.
import { ok as assert, deepStrictEqual as assertEquals } from "node:assert";
import { sendText } from "./odelia_db.ts";

const SECRET = "whsec_" + btoa("0123456789abcdef0123456789abcdef");
const KEYS: Record<string, string> = {
  LINQ_API_KEY: "lk_test", LINQ_WEBHOOK_SECRET: SECRET, LINQ_NUMBERS: "+14155550100",
  TELNYX_API_KEY: "tk_test", TELNYX_PUBLIC_KEY: "pk_test", ODELIA_NUMBER: "+14155550199", TELNYX_MESSAGING_PROFILE_ID: "mp_test",
};
const envOf = (o: Record<string, string>) => (k: string) => o[k];
// the database is asked only for Linq lines on CRITICAL reputation
const admin = { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) } as never;

function stub() {
  const hosts: string[] = [];
  const f = ((url: string | URL) => {
    const u = String(url);
    hosts.push(new URL(u).host);
    const body = u.includes("linqapp") ? { chat: { id: "c1" }, message: { id: "m1", service: "iMessage" } } : { data: { id: "sms1" } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  return { f, hosts };
}

Deno.test("flag off: every Linq key set, the text still goes by Telnyx SMS and Linq is never called", async () => {
  const { f, hosts } = stub();
  const r = await sendText(admin, envOf(KEYS), { to: "+14155550123", text: "Your renewal is due" }, f);
  assert(r.ok, JSON.stringify(r));
  assertEquals(r.service, "SMS");
  assert(hosts.every((h) => h.includes("telnyx")) && hosts.length === 1, hosts.join(","));
});

Deno.test("flag on: iMessage first, on the Linq line", async () => {
  const { f, hosts } = stub();
  const r = await sendText(admin, envOf({ ...KEYS, LINQ_ENABLED: "1" }), { to: "+14155550123", text: "Your renewal is due" }, f);
  assert(r.ok, JSON.stringify(r));
  assertEquals(r.service, "iMessage");
  assert(hosts[0].includes("linqapp"), hosts.join(","));
});
