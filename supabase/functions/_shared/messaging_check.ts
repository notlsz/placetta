// `npm run check:messaging` (scripts/check-messaging.ts): for each way Odelia reaches owners, whether its keys are set,
// whether the provider accepts them, and whether the deployed webhook is there and refusing forgeries. The readiness
// rules are the servers' own (linqReady, smsReady, whatsappReady, mailReady), so this says exactly what the functions
// will do. Takes its fetch, so messaging_check_test.ts runs it against stand-ins. Never prints a value, only names.
import type { Env } from "./odelia.ts";
import { smsReady } from "./odelia.ts";
import { LINQ, linqEnabled, linqLines, linqReady } from "./linq.ts";
import { GRAPH, whatsappReady } from "./whatsapp.ts";
import { mailInReady, mailOutReady, odeliaEmail } from "./mail.ts";
import { sesRegion } from "./email.ts";
import { awsFetch } from "./sigv4.ts";

export type Check = { name: string; ok: boolean; detail: string };
export type ChannelReport = { channel: "imessage" | "sms" | "whatsapp" | "email"; label: string; ready: boolean; checks: Check[]; started?: boolean };

const KEYS = {
  imessage: ["LINQ_API_KEY", "LINQ_WEBHOOK_SECRET", "LINQ_NUMBERS", "LINQ_ENABLED"],
  sms: ["TELNYX_API_KEY", "TELNYX_PUBLIC_KEY", "ODELIA_NUMBER", "TELNYX_MESSAGING_PROFILE_ID"],
  whatsapp: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_TEMPLATE", "WHATSAPP_NUMBER"],
  email: ["ODELIA_EMAIL", "AWS_SES_ACCESS_KEY_ID", "AWS_SES_SECRET_ACCESS_KEY", "AWS_SES_REGION", "AWS_SES_SNS_TOPIC_ARNS"],
} as const;

const missing = (env: Env, names: readonly string[]) => names.filter((n) => !(env(n) ?? "").trim());
const keysCheck = (env: Env, names: readonly string[], ready: boolean): Check => {
  const gone = missing(env, names);
  return { name: "keys", ok: ready, detail: gone.length ? `missing: ${gone.join(", ")}` : "all set" };
};
async function status(f: typeof fetch, url: string, init: RequestInit = {}): Promise<{ status: number; text: string } | null> {
  try { const r = await f(url, { ...init, signal: AbortSignal.timeout(15000) }); return { status: r.status, text: await r.text().catch(() => "") }; } catch { return null; }
}

/** The report for every channel. `fnUrl` is the project's functions base (https://<ref>.supabase.co/functions/v1). */
export async function checkMessaging(env: Env, o: { fnUrl?: string; offline?: boolean; f?: typeof fetch } = {}): Promise<ChannelReport[]> {
  const f = o.f ?? fetch, live = !o.offline, fn = (o.fnUrl ?? "").replace(/\/+$/, "");
  const out: ChannelReport[] = [];

  // iMessage (Linq)
  {
    const checks: Check[] = [keysCheck(env, KEYS.imessage, linqReady(env))];
    if (!linqEnabled(env)) checks.push({ name: "flag", ok: false, detail: "LINQ_ENABLED isn't 1: texts go by Telnyx SMS and Linq's webhook is refused" });
    if (live && env("LINQ_API_KEY")) {
      const r = await status(f, `${LINQ}/v3/phone_numbers`, { headers: { Authorization: `Bearer ${env("LINQ_API_KEY")}`, Accept: "application/json" } });
      let listed: string[] = [];
      try { listed = ((JSON.parse(r?.text ?? "{}").phone_numbers ?? []) as { phone_number?: string }[]).map((p) => String(p.phone_number ?? "")); } catch { /* not JSON */ }
      const lines = linqLines(env), absent = lines.filter((l) => !listed.includes(l));
      checks.push({ name: "provider", ok: r?.status === 200 && !absent.length, detail: r?.status === 200 ? (absent.length ? `lines not on this Linq account: ${absent.length}` : `key accepted, ${lines.length} line${lines.length === 1 ? "" : "s"} found`) : r ? `Linq answered ${r.status}` : "Linq unreachable" });
    }
    if (live && fn) {
      const r = await status(f, `${fn}/odelia-sms`, { method: "POST", body: "{}", headers: { "webhook-id": "msg_check", "webhook-timestamp": String(Math.floor(Date.now() / 1000)), "webhook-signature": "v1,Zm9yZ2Vk" } });
      checks.push({ name: "webhook", ok: r?.status === 401, detail: r ? (r.status === 401 ? "deployed, refuses a forged signature" : r.status === 503 ? "deployed, iMessage is off there (LINQ_ENABLED)" : `answered ${r.status}`) : "odelia-sms unreachable" });
    }
    out.push({ channel: "imessage", label: "iMessage (Linq)", ready: checks.every((c) => c.ok), checks });
  }

  // SMS (Telnyx)
  {
    const checks: Check[] = [keysCheck(env, KEYS.sms, smsReady(env))];
    if (live && env("TELNYX_API_KEY") && env("TELNYX_MESSAGING_PROFILE_ID")) {
      const r = await status(f, `https://api.telnyx.com/v2/messaging_profiles/${encodeURIComponent(env("TELNYX_MESSAGING_PROFILE_ID")!)}`, { headers: { Authorization: `Bearer ${env("TELNYX_API_KEY")}`, Accept: "application/json" } });
      let hook = "";
      try { hook = String(JSON.parse(r?.text ?? "{}").data?.webhook_url ?? ""); } catch { /* not JSON */ }
      const points = !fn || hook.startsWith(`${fn}/odelia-sms`);
      checks.push({ name: "provider", ok: r?.status === 200 && points, detail: r?.status === 200 ? (points ? "key accepted, the messaging profile sends its webhooks to odelia-sms" : "the messaging profile's webhook isn't odelia-sms") : r ? `Telnyx answered ${r.status}` : "Telnyx unreachable" });
      checks.push({ name: "10DLC (check by hand)", ok: true, detail: "carriers deliver only after the 10DLC campaign (or toll-free verification) is approved: check Messaging, Compliance in Telnyx" });
    }
    if (live && fn) {
      const r = await status(f, `${fn}/odelia-sms`, { method: "POST", body: "{}", headers: { "telnyx-signature-ed25519": "Zm9yZ2Vk", "telnyx-timestamp": String(Math.floor(Date.now() / 1000)) } });
      checks.push({ name: "webhook", ok: r?.status === 401, detail: r ? (r.status === 401 ? "deployed, refuses a forged signature" : `answered ${r.status}`) : "odelia-sms unreachable" });
    }
    out.push({ channel: "sms", label: "SMS (Telnyx)", ready: checks.every((c) => c.ok), checks });
  }

  // WhatsApp (Meta Cloud API)
  {
    const checks: Check[] = [keysCheck(env, KEYS.whatsapp, whatsappReady(env) && !!env("WHATSAPP_TEMPLATE"))];
    if (live && env("WHATSAPP_TOKEN") && env("WHATSAPP_PHONE_NUMBER_ID")) {
      const v = (env("WHATSAPP_GRAPH_VERSION") || "v25.0").replace(/[^\w.]/g, "");
      const r = await status(f, `${GRAPH}/${v}/${encodeURIComponent(env("WHATSAPP_PHONE_NUMBER_ID")!)}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}` } });
      checks.push({ name: "provider", ok: r?.status === 200, detail: r?.status === 200 ? "token accepted, the phone number is on the account" : r ? `Meta answered ${r.status}` : "Meta unreachable" });
    }
    if (live && fn && env("WHATSAPP_VERIFY_TOKEN")) {
      const r = await status(f, `${fn}/odelia-sms?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(env("WHATSAPP_VERIFY_TOKEN")!)}&hub.challenge=placetta-check`);
      checks.push({ name: "webhook", ok: r?.status === 200 && r.text === "placetta-check", detail: r?.status === 200 ? "deployed, with the same verify token" : r?.status === 403 ? "deployed, but its verify token differs" : r ? `answered ${r.status}` : "odelia-sms unreachable" });
    }
    out.push({ channel: "whatsapp", label: "WhatsApp (Meta)", ready: checks.every((c) => c.ok), checks });
  }

  // Email (Amazon SES out, SNS in)
  {
    const checks: Check[] = [keysCheck(env, KEYS.email, mailOutReady(env) && mailInReady(env))];
    if (!odeliaEmail(env)) checks.push({ name: "address", ok: false, detail: "ODELIA_EMAIL isn't set (odelia@in.placetta.com)" });
    if (live && env("AWS_SES_ACCESS_KEY_ID") && env("AWS_SES_SECRET_ACCESS_KEY")) {
      const region = sesRegion(env);
      let r: Response | null = null;
      try { r = await awsFetch({ method: "GET", url: `https://email.${region}.amazonaws.com/v2/email/account`, region, service: "ses" }, { accessKeyId: env("AWS_SES_ACCESS_KEY_ID")!, secretAccessKey: env("AWS_SES_SECRET_ACCESS_KEY")! }, f); } catch { r = null; }
      const j = r?.ok ? await r.json().catch(() => ({})) as { ProductionAccessEnabled?: boolean; SendingEnabled?: boolean } : {};
      checks.push({ name: "provider", ok: !!r?.ok && j.SendingEnabled !== false && j.ProductionAccessEnabled === true,
        detail: r?.ok ? (j.ProductionAccessEnabled ? "keys accepted, out of the sandbox" : "keys accepted, but SES is still in the sandbox: request production access") : r ? `SES answered ${r.status}` : "SES unreachable" });
    }
    if (live && fn) {
      const r = await status(f, `${fn}/odelia-mail`, { method: "POST", body: JSON.stringify({ Type: "Notification", TopicArn: "arn:aws:sns:us-east-1:000000000000:forged", Message: "{}" }), headers: { "x-amz-sns-message-type": "Notification", "Content-Type": "text/plain" } });
      checks.push({ name: "webhook", ok: r?.status === 403, detail: r ? (r.status === 403 ? "deployed, refuses a message not signed by our SNS topic" : `answered ${r.status}`) : "odelia-mail unreachable" });
    }
    out.push({ channel: "email", label: "Email (Amazon SES)", ready: checks.every((c) => c.ok), checks });
  }
  for (const c of out) c.started = missing(env, KEYS[c.channel]).length < KEYS[c.channel].length;
  return out;
}

/** The report as plain lines, one channel a block. */
export function reportLines(r: ChannelReport[]): string[] {
  return r.flatMap((c) => [`${c.ready ? "READY  " : "NOT YET"} ${c.label}`, ...c.checks.map((k) => `        ${k.ok ? "ok " : "no "} ${k.name}: ${k.detail}`)]);
}
