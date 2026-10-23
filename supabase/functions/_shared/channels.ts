// Team chat channels: the business pastes a group's incoming-webhook link (Slack, Lark/Feishu, WeCom, DingTalk, Microsoft Teams)
// and Placetta posts its updates there: deadlines, renewals and filing changes. No app approval or sign-in needed; the
// link itself is the secret, so it's kept in the vault and only the server reads it.

// webhook (added 2026-10-22): any https address that takes JSON, so Zapier ("Catch Hook"), Make, n8n or the business's own
// system gets the same updates as structured data, signed the Standard Webhooks way when a secret is given
// (https://www.standardwebhooks.com/). The route to the thousands of apps no one-click connector covers yet (payroll,
// e-signature, other point-of-sale systems), copied from how Grok's and Dots's plugin catalogs reach them.
export const HOOK_KINDS = ["slack", "lark", "wecom", "dingtalk", "teams", "webhook"] as const;
export type HookKind = (typeof HOOK_KINDS)[number];
export const isHookKind = (v: unknown): v is HookKind => typeof v === "string" && (HOOK_KINDS as readonly string[]).includes(v);

export const HOOK_NAMES: Record<HookKind, { en: string; zh: string }> = {
  slack: { en: "Slack", zh: "Slack" },
  lark: { en: "Lark", zh: "飞书" },
  wecom: { en: "WeCom", zh: "企业微信" },
  dingtalk: { en: "DingTalk", zh: "钉钉" },
  teams: { en: "Microsoft Teams", zh: "Microsoft Teams" },
  webhook: { en: "Webhook", zh: "Webhook" },
};

/** A host a webhook may not point at: an address literal, this machine, or a private or internal name. */
export function privateHost(h: string): boolean {
  const host = h.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") || host.includes(":")) return true;   // no dot (intranet names) or an IPv6 literal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;          // any IPv4 literal: a name is required
  return /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|home\.arpa)$/.test(host);
}

/** The link is the kind's own incoming-webhook address, over https, and nothing else. */
export function hookUrl(kind: HookKind, raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase(), p = u.pathname;
  switch (kind) {
    case "slack": return h === "hooks.slack.com" && /^\/(services|triggers)\/[\w/-]+$/.test(p) ? u : null;
    case "lark": return (h === "open.feishu.cn" || h === "open.larksuite.com") && /^\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(p) ? u : null;
    case "wecom": return h === "qyapi.weixin.qq.com" && p === "/cgi-bin/webhook/send" && /^[\w-]{10,}$/.test(u.searchParams.get("key") ?? "") ? u : null;
    case "dingtalk": return h === "oapi.dingtalk.com" && p === "/robot/send" && /^[\w-]{20,}$/.test(u.searchParams.get("access_token") ?? "") ? u : null;
    case "teams": return /(\.logic\.azure\.com|\.powerplatform\.com|\.webhook\.office\.com)$/.test(h) ? u : null;
    case "webhook": return !privateHost(h) && u.hash === "" ? u : null;
  }
}

/** Standard Webhooks: webhook-id, webhook-timestamp and webhook-signature "v1,<base64 HMAC-SHA256 of id.timestamp.body>".
 *  The key is the secret's base64 after "whsec_", or the secret's own bytes otherwise. */
export async function signWebhook(raw: string, secret: string, id: string, ts: number): Promise<Record<string, string>> {
  let key: Uint8Array<ArrayBuffer>;
  if (secret.startsWith("whsec_")) { try { key = Uint8Array.from(atob(secret.slice(6)), (c) => c.charCodeAt(0)); } catch { key = new TextEncoder().encode(secret); } }
  else key = new TextEncoder().encode(secret);
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  return { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${btoa(String.fromCharCode(...sig))}` };
}
/** What a webhook gets: the message as text (for a step that just forwards it) and, when the sender has it, the data. */
export type HookData = { type: string; business?: string; link?: string; updates?: { title: { en: string; zh: string }; body?: { en: string; zh: string } }[] } & Record<string, unknown>;

/** DingTalk's optional signature: base64(HMAC-SHA256(key = secret, message = "timestamp_ms\nsecret")), on the link. */
async function dingSign(secret: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}\n${secret}`)));
  return btoa(String.fromCharCode(...sig));
}

/** Lark's optional signature: base64(HMAC-SHA256(key = "timestamp\nsecret", message = "")). */
async function larkSign(secret: string, ts: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`${ts}\n${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(0)));
  return btoa(String.fromCharCode(...sig));
}

async function body(kind: HookKind, text: string, secret?: string, data?: HookData): Promise<unknown> {
  switch (kind) {
    case "webhook": return { ...(data ?? { type: "placetta.message" }), text, sent_at: new Date().toISOString() };
    case "slack": return { text: text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") };
    case "lark": {
      const b: Record<string, unknown> = { msg_type: "text", content: { text } };
      if (secret) { const ts = Math.floor(Date.now() / 1000); b.timestamp = String(ts); b.sign = await larkSign(secret, ts); }
      return b;
    }
    case "wecom": case "dingtalk": return { msgtype: "text", text: { content: text } };
    case "teams": return { type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: {
      $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4",
      body: text.split("\n").filter(Boolean).map((line, i) => ({ type: "TextBlock", text: line, wrap: true, weight: i === 0 ? "Bolder" : "Default" })),
    } }] };
  }
}

export type HookResult = { ok: true } | { ok: false; gone: boolean; why: string };

/** Post one message. `gone`: the link no longer works (deleted bot, removed channel), so the connection needs redoing. */
export async function postHook(kind: HookKind, url: string, text: string, secret?: string, data?: HookData, send: typeof fetch = fetch): Promise<HookResult> {
  const u = hookUrl(kind, url);
  if (!u) return { ok: false, gone: true, why: "not a webhook link" };
  if (kind === "dingtalk" && secret) { const ts = Date.now(); u.searchParams.set("timestamp", String(ts)); u.searchParams.set("sign", await dingSign(secret, ts)); }
  const raw = JSON.stringify(await body(kind, text.slice(0, 3800), secret, data));
  const signed = kind === "webhook" && secret ? await signWebhook(raw, secret, `msg_${crypto.randomUUID().replace(/-/g, "")}`, Math.floor(Date.now() / 1000)) : {};
  let res: Response;
  try {
    // a webhook isn't followed through redirects: a public address can't bounce the post somewhere internal
    res = await send(u, { method: "POST", headers: { "Content-Type": "application/json", ...(kind === "webhook" ? { "User-Agent": "Placetta-Webhooks/1" } : {}), ...signed }, body: raw, signal: AbortSignal.timeout(15000), ...(kind === "webhook" ? { redirect: "manual" as const } : {}) });
  } catch {
    return { ok: false, gone: false, why: "no answer" };
  }
  if (kind === "webhook" && res.status >= 300 && res.status < 400) return { ok: false, gone: false, why: `${res.status}: redirects aren't followed` };
  const answer = (await res.text()).slice(0, 400);
  if (kind === "lark" || kind === "wecom" || kind === "dingtalk") {
    // they answer 200 with their own code: Lark {code: 0} (older bots {StatusCode: 0}), WeCom and DingTalk {errcode: 0}
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(answer); } catch { /* not JSON */ }
    const code = kind === "lark" ? (j.code ?? j.StatusCode) : j.errcode;
    if (res.ok && code === 0) return { ok: true };
    const msg = String(j.msg ?? j.errmsg ?? j.StatusMessage ?? res.status).split(/, hint:|, from ip:/)[0];   // never show our server's address
    // Lark 19001 bad link; WeCom 93000 invalid key; DingTalk 300001/310000 bad token or signature
    const gone = kind === "lark" ? [19001, 19002].includes(Number(code)) : kind === "wecom" ? Number(code) === 93000 : [300001, 300005].includes(Number(code));
    return { ok: false, gone, why: `${code ?? res.status}: ${msg}`.slice(0, 160) };
  }
  if (res.ok) return { ok: true };
  // Teams answers 401 WorkflowNotFound for a deleted workflow
  return { ok: false, gone: [400, 403, 404, 410].includes(res.status) || (kind === "teams" && res.status === 401), why: `${res.status}: ${answer.slice(0, 120)}` };
}

/* ------------------------------------------------------------------ when a team chat hears */
// Each linked group chooses: every update as it comes (the default, as before), or one digest a day at the hour it
// picks; and quiet hours (9pm to 8am where the business is), during which updates wait and go as one message at 8am.
// The same quiet hours Odelia's texts already keep (odelia.ts inQuietHours), and the daily digest Claude Tag and Ramp
// post where a team works (docs/CHANNELS.md). Kept in the integration's meta.

export type HookSchedule = { digest?: "each" | "daily"; hour?: number; tz?: string; quiet?: boolean; last_sent?: string | null; held_since?: string | null };
/** What to do with one linked chat at this sweep: post now (since: the updates from then on; without it, the fresh
 *  ones), hold the fresh ones for the morning (held_since to remember), or nothing. */
export type HookPlan = { act: "post"; since?: string } | { act: "hold"; held_since: string } | { act: "none" };

const localParts = (now: Date, tz: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
};
const tzOk = (tz: unknown) => { try { new Intl.DateTimeFormat("en", { timeZone: String(tz) }); return typeof tz === "string" && tz.length > 0; } catch { return false; } };
const quietNow = (now: Date, tz: string) => { const h = localParts(now, tz).hour; return h >= 21 || h < 8; };

export function hookPlan(s: HookSchedule | null | undefined, now: Date, fresh: number): HookPlan {
  const tz = tzOk(s?.tz) ? String(s!.tz) : "America/New_York";
  if (s?.digest === "daily") {
    const hour = Number.isInteger(s.hour) && s.hour! >= 0 && s.hour! <= 23 ? s.hour! : 9;
    const here = localParts(now, tz);
    const sentDay = s.last_sent ? localParts(new Date(s.last_sent), tz).day : "";
    if (here.hour >= hour && sentDay !== here.day) return { act: "post", since: s.last_sent ?? new Date(now.getTime() - 864e5).toISOString() };
    return { act: "none" };
  }
  if (s?.quiet && quietNow(now, tz)) return fresh > 0 || s.held_since ? { act: "hold", held_since: s.held_since ?? now.toISOString() } : { act: "none" };
  if (s?.held_since) return { act: "post", since: s.held_since };
  return fresh > 0 ? { act: "post" } : { act: "none" };
}

/** The welcome post that proves the link works before it's saved. */
export const hookHello = (business: string, lang: "en" | "zh") => lang === "zh"
  ? `快哉已连接${business ? `（${business}）` : ""}。截止日期、续期提醒和申报进展会发到这里。`
  : `Placetta is connected${business ? ` for ${business}` : ""}. Deadlines, renewals and filing updates will post here.`;

type Item = { title: { en: string; zh: string }; body?: { en: string; zh: string }; kind?: string; app_id?: string | null };
/** A digest as data, for a webhook: each update's title and body in both languages, its kind and its application. */
export const hookData = (business: string, items: Item[], link: string): HookData => ({
  type: "placetta.updates", business, link,
  updates: items.slice(0, 50).map((u) => ({ title: u.title, ...(u.body ? { body: u.body } : {}), ...(u.kind ? { kind: u.kind } : {}), ...(u.app_id ? { application_id: u.app_id } : {}) })),
});
/** A day's new updates as one short message: a line each, at most eight, then a link to the app. */
export function hookDigest(business: string, items: Item[], lang: "en" | "zh", link: string): string {
  const head = lang === "zh" ? `${business}：${items.length} 条新动态` : `${business}: ${items.length} new update${items.length === 1 ? "" : "s"}`;
  const lines = items.slice(0, 8).map((u) => `- ${u.title[lang] || u.title.en}`);
  if (items.length > 8) lines.push(lang === "zh" ? `- 另有 ${items.length - 8} 条` : `- and ${items.length - 8} more`);
  return [head, ...lines, link ? (lang === "zh" ? `在快哉中查看：${link}` : `Open in Placetta: ${link}`) : ""].filter(Boolean).join("\n");
}
