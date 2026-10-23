// Run: deno test -A supabase/functions/_shared/webhook_test.ts
// The generic webhook connection (channels.ts, kind "webhook"): which addresses it takes, what it posts (the text and
// the updates as data), the Standard Webhooks signature a receiver can check, and no following of redirects.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import { hookData, hookUrl, postHook, privateHost } from "./channels.ts";
import { verifyLinq as verifyStandardWebhook } from "./linq.ts";

Deno.test("a webhook takes a public https address and nothing internal", () => {
  assert(hookUrl("webhook", "https://hooks.zapier.com/hooks/catch/123456/abcdef/"), "Zapier's Catch Hook");
  assert(hookUrl("webhook", "https://hook.us1.make.com/abc123"), "Make");
  assert(hookUrl("webhook", "https://n8n.example.com/webhook/placetta"), "n8n on the business's own host");
  for (const bad of ["http://hooks.zapier.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://localhost/x", "https://intranet/x", "https://printer.local/x",
    "https://svc.internal/x", "https://user:pw@hooks.zapier.com/x", "https://hooks.zapier.com:8443/x", "https://10.0.0.8/x", "https://169.254.169.254/latest", "https://hooks.zapier.com/x#frag"]) {
    assertEquals(hookUrl("webhook", bad), null, bad);
  }
  assert(privateHost("192.168.1.1") && privateHost("metadata") && !privateHost("hooks.zapier.com"));
  // the chat kinds keep their own strict hosts
  assertEquals(hookUrl("slack", "https://hooks.zapier.com/hooks/catch/1/2"), null);
});

Deno.test("a webhook gets the text and the updates as data, signed when there is a secret", async () => {
  const secret = "whsec_" + btoa("a-32-byte-secret-for-the-tests!!");
  let got: { url: string; headers: Headers; body: string } | null = null;
  const send = ((u: string | URL, init?: RequestInit) => { got = { url: String(u), headers: new Headers(init?.headers), body: String(init?.body) }; assertEquals(init?.redirect, "manual"); return Promise.resolve(new Response("ok", { status: 200 })); }) as typeof fetch;
  const items = [{ title: { en: "Renew the health permit by Nov 15", zh: "11月15日前续期卫生许可证" }, kind: "renewal", app_id: "scc-health" }];
  const r = await postHook("webhook", "https://hooks.zapier.com/hooks/catch/1/2/", "Lucky Leaf: 1 new update", secret, hookData("Lucky Leaf", items, "https://app.placetta.test/app/?ws=1"), send);
  assertEquals(r, { ok: true });
  const g = got!;
  const body = JSON.parse(g.body);
  assertEquals(body.type, "placetta.updates");
  assertEquals(body.text, "Lucky Leaf: 1 new update");
  assertEquals(body.updates, [{ title: items[0].title, kind: "renewal", application_id: "scc-health" }]);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(body.sent_at));
  const h = { id: g.headers.get("webhook-id")!, timestamp: g.headers.get("webhook-timestamp")!, signature: g.headers.get("webhook-signature")! };
  assert(/^msg_[0-9a-f]{32}$/.test(h.id) && /^v1,/.test(h.signature));
  assert(await verifyStandardWebhook(g.body, h, secret), "a Standard Webhooks receiver accepts the signature");
  assert(!(await verifyStandardWebhook(g.body.replace("Lucky", "Lucki"), h, secret)), "and refuses a changed body");

  // no secret: posted, unsigned
  const r2 = await postHook("webhook", "https://hooks.zapier.com/hooks/catch/1/2/", "hello", undefined, undefined, send);
  assertEquals(r2, { ok: true });
  assertEquals(got!.headers.get("webhook-signature"), null);
  assertEquals(JSON.parse(got!.body).type, "placetta.message");
});

Deno.test("a webhook that redirects or is gone is reported, never followed", async () => {
  const redirect = (() => Promise.resolve(new Response(null, { status: 302, headers: { Location: "http://169.254.169.254/" } }))) as typeof fetch;
  const r = await postHook("webhook", "https://hooks.zapier.com/hooks/catch/1/2/", "x", undefined, undefined, redirect);
  assert(!r.ok && !r.gone && /redirect/.test(r.why));
  const gone = (() => Promise.resolve(new Response("not found", { status: 410 }))) as typeof fetch;
  const r2 = await postHook("webhook", "https://hooks.zapier.com/hooks/catch/1/2/", "x", undefined, undefined, gone);
  assert(!r2.ok && r2.gone, "a 410 asks for the connection to be redone");
});
