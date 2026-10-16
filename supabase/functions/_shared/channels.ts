// Team chat channels: the business pastes a group's incoming-webhook link (Slack, Lark/Feishu, WeCom, DingTalk, Microsoft Teams)
// and Placetta posts its updates there: deadlines, renewals and filing changes. No app approval or sign-in needed; the
// link itself is the secret, so it's kept in the vault and only the server reads it.

export const HOOK_KINDS = ["slack", "lark", "wecom", "dingtalk", "teams"] as const;
export type HookKind = (typeof HOOK_KINDS)[number];
export const isHookKind = (v: unknown): v is HookKind => typeof v === "string" && (HOOK_KINDS as readonly string[]).includes(v);

export const HOOK_NAMES: Record<HookKind, { en: string; zh: string }> = {
  slack: { en: "Slack", zh: "Slack" },
  lark: { en: "Lark", zh: "飞书" },
  wecom: { en: "WeCom", zh: "企业微信" },
  dingtalk: { en: "DingTalk", zh: "钉钉" },
  teams: { en: "Microsoft Teams", zh: "Microsoft Teams" },
};

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
  }
}

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

async function body(kind: HookKind, text: string, secret?: string): Promise<unknown> {
  switch (kind) {
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
export async function postHook(kind: HookKind, url: string, text: string, secret?: string): Promise<HookResult> {
  const u = hookUrl(kind, url);
  if (!u) return { ok: false, gone: true, why: "not a webhook link" };
  if (kind === "dingtalk" && secret) { const ts = Date.now(); u.searchParams.set("timestamp", String(ts)); u.searchParams.set("sign", await dingSign(secret, ts)); }
  let res: Response;
  try {
    res = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await body(kind, text.slice(0, 3800), secret)), signal: AbortSignal.timeout(15000) });
  } catch {
    return { ok: false, gone: false, why: "no answer" };
  }
  const raw = (await res.text()).slice(0, 400);
  if (kind === "lark" || kind === "wecom" || kind === "dingtalk") {
    // they answer 200 with their own code: Lark {code: 0} (older bots {StatusCode: 0}), WeCom and DingTalk {errcode: 0}
    let j: Record<string, unknown> = {};
    try { j = JSON.parse(raw); } catch { /* not JSON */ }
    const code = kind === "lark" ? (j.code ?? j.StatusCode) : j.errcode;
    if (res.ok && code === 0) return { ok: true };
    const msg = String(j.msg ?? j.errmsg ?? j.StatusMessage ?? res.status).split(/, hint:|, from ip:/)[0];   // never show our server's address
    // Lark 19001 bad link; WeCom 93000 invalid key; DingTalk 300001/310000 bad token or signature
    const gone = kind === "lark" ? [19001, 19002].includes(Number(code)) : kind === "wecom" ? Number(code) === 93000 : [300001, 300005].includes(Number(code));
    return { ok: false, gone, why: `${code ?? res.status}: ${msg}`.slice(0, 160) };
  }
  if (res.ok) return { ok: true };
  // Teams answers 401 WorkflowNotFound for a deleted workflow
  return { ok: false, gone: [400, 403, 404, 410].includes(res.status) || (kind === "teams" && res.status === 401), why: `${res.status}: ${raw.slice(0, 120)}` };
}

/** The welcome post that proves the link works before it's saved. */
export const hookHello = (business: string, lang: "en" | "zh") => lang === "zh"
  ? `快哉已连接${business ? `（${business}）` : ""}。截止日期、续期提醒和申报进展会发到这里。`
  : `Placetta is connected${business ? ` for ${business}` : ""}. Deadlines, renewals and filing updates will post here.`;

type Item = { title: { en: string; zh: string }; body?: { en: string; zh: string } };
/** A day's new updates as one short message: a line each, at most eight, then a link to the app. */
export function hookDigest(business: string, items: Item[], lang: "en" | "zh", link: string): string {
  const head = lang === "zh" ? `${business}：${items.length} 条新动态` : `${business}: ${items.length} new update${items.length === 1 ? "" : "s"}`;
  const lines = items.slice(0, 8).map((u) => `- ${u.title[lang] || u.title.en}`);
  if (items.length > 8) lines.push(lang === "zh" ? `- 另有 ${items.length - 8} 条` : `- and ${items.length - 8} more`);
  return [head, ...lines, link ? (lang === "zh" ? `在快哉中查看：${link}` : `Open in Placetta: ${link}`) : ""].filter(Boolean).join("\n");
}
