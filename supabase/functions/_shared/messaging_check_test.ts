// Run: deno test -A supabase/functions/_shared/messaging_check_test.ts
// npm run check:messaging's report against stand-in providers and a stand-in project: keys, the providers' answers,
// and the webhooks refusing forgeries. No value is ever printed.
import { deepStrictEqual as eq, ok } from "node:assert";
import { checkMessaging, reportLines } from "./messaging_check.ts";

const FN = "https://ref.supabase.co/functions/v1";
const ALL: Record<string, string> = {
  LINQ_ENABLED: "1", LINQ_API_KEY: "linq_secret_value", LINQ_WEBHOOK_SECRET: "whsec_c2VjcmV0", LINQ_NUMBERS: "+12125550177",
  TELNYX_API_KEY: "KEY_secret_value", TELNYX_PUBLIC_KEY: "pub", ODELIA_NUMBER: "+12125550100", TELNYX_MESSAGING_PROFILE_ID: "mp_1",
  WHATSAPP_TOKEN: "wa_secret_value", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_APP_SECRET: "app", WHATSAPP_VERIFY_TOKEN: "vt", WHATSAPP_TEMPLATE: "odelia_update", WHATSAPP_NUMBER: "+12125550111",
  ODELIA_EMAIL: "odelia@in.placetta.com", AWS_SES_ACCESS_KEY_ID: "AKIATEST", AWS_SES_SECRET_ACCESS_KEY: "aws_secret_value", AWS_SES_REGION: "us-east-1",
  AWS_SES_SNS_TOPIC_ARNS: "arn:aws:sns:us-east-1:123456789012:placetta-mail",
};
/** Providers and the deployed functions as they answer when everything is set up. */
const good = (over: Record<string, Response> = {}) => (async (input: string | URL | Request, init?: RequestInit) => {
  const u = new URL(String(input instanceof Request ? input.url : input));
  const key = `${init?.method ?? "GET"} ${u.host}${u.pathname}`;
  if (over[key]) return over[key].clone();
  const j = (o: unknown, s = 200) => new Response(typeof o === "string" ? o : JSON.stringify(o), { status: s });
  if (u.host === "api.linqapp.com") return j({ phone_numbers: [{ phone_number: "+12125550177" }] });
  if (u.host === "api.telnyx.com") return j({ data: { webhook_url: `${FN}/odelia-sms` } });
  if (u.host === "graph.facebook.com") return j({ display_phone_number: "1 212 555 0111" });
  if (u.host === "email.us-east-1.amazonaws.com") return j({ ProductionAccessEnabled: true, SendingEnabled: true });
  if (u.pathname === "/functions/v1/odelia-sms" && u.searchParams.get("hub.mode")) return u.searchParams.get("hub.verify_token") === "vt" ? j(u.searchParams.get("hub.challenge")!) : j("no", 403);
  if (u.pathname === "/functions/v1/odelia-sms") return j({ error: {} }, 401);
  if (u.pathname === "/functions/v1/odelia-mail") return j({ error: {} }, 403);
  return j({}, 404);
}) as typeof fetch;

Deno.test("everything set up: every channel ready, and no secret in the report", async () => {
  const r = await checkMessaging((k) => ALL[k], { fnUrl: FN, f: good() });
  eq(r.map((c) => [c.channel, c.ready]), [["imessage", true], ["sms", true], ["whatsapp", true], ["email", true]]);
  const text = reportLines(r).join("\n");
  for (const v of Object.values(ALL).filter((v) => /secret|KEY_|AKIA/.test(v))) ok(!text.includes(v), v);
});

Deno.test("missing keys, a refused key, the SES sandbox and a webhook that doesn't refuse forgeries each say so", async () => {
  const env = (k: string) => (k === "LINQ_ENABLED" || k === "TELNYX_PUBLIC_KEY" ? undefined : ALL[k]);
  const r = await checkMessaging(env, { fnUrl: FN, f: good({
    "GET graph.facebook.com/v25.0/123": new Response("{}", { status: 401 }),
    "GET email.us-east-1.amazonaws.com/v2/email/account": new Response(JSON.stringify({ ProductionAccessEnabled: false, SendingEnabled: true })),
    "POST ref.supabase.co/functions/v1/odelia-mail": new Response("{}", { status: 200 }),
  }) });
  const by = Object.fromEntries(r.map((c) => [c.channel, c]));
  ok(!by.imessage.ready && /LINQ_ENABLED/.test(by.imessage.checks[0].detail) && by.imessage.checks.some((c) => c.name === "flag" && !c.ok));
  ok(!by.sms.ready && /TELNYX_PUBLIC_KEY/.test(by.sms.checks[0].detail));
  ok(!by.whatsapp.ready && /Meta answered 401/.test(reportLines([by.whatsapp]).join(" ")));
  ok(!by.email.ready && /sandbox/.test(reportLines([by.email]).join(" ")) && /answered 200/.test(reportLines([by.email]).join(" ")));
  ok(r.every((c) => c.started));
});

Deno.test("offline: keys only, no request anywhere", async () => {
  let calls = 0;
  const r = await checkMessaging((k) => (k.startsWith("TELNYX") || k === "ODELIA_NUMBER" ? ALL[k] : undefined), { fnUrl: FN, offline: true, f: (() => { calls++; return Promise.resolve(new Response()); }) as typeof fetch });
  eq(calls, 0);
  eq(r.map((c) => [c.channel, c.ready, c.started]), [["imessage", false, false], ["sms", true, true], ["whatsapp", false, false], ["email", false, false]]);
});
