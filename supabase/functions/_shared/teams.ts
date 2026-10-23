// Talk to Odelia from Microsoft Teams. The business registers its own bot (Teams Developer Portal, Tools, Bot management:
// a few clicks, no Azure subscription, no store review), pastes the bot's ID, a client secret and its Microsoft Entra
// tenant ID into Placetta, sets the bot's endpoint to chat-events, and adds the bot to Teams as an app for its org.
// Message the bot, or @mention it in a channel or group chat, and Odelia takes the job as the teammate who asked
// (matched by their work email, like Slack and Lark) and answers as a reply in the same thread. Anything to file, pay
// or send comes back as a card with a button that opens the approval in Placetta: nothing is approved in Teams.
// Everything here is the Teams side and takes its fetch, so it's tested in teams_test.ts.
//
// Microsoft's own documents, for each piece:
//   requests from Teams (the JWT and its checks)     https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication
//   the bot's token (client credentials)              same page, "Authenticate requests from your bot"
//   replying to an activity, getting a member         https://learn.microsoft.com/en-us/bot-framework/rest-api/bot-framework-rest-connector-api-reference
//   cost: Teams is a standard channel, unlimited      https://azure.microsoft.com/en-us/pricing/details/bot-service/
import type { ChatSender } from "./bots.ts";

/** The bot as saved in the vault: its Microsoft App ID (the bot ID), a client secret, and the Microsoft Entra tenant it
 *  belongs to. Only people from that tenant can give Odelia jobs. */
export type TeamsBot = { kind: "teams_bot"; app_id: string; app_secret: string; tenant_id: string };
/** Where an answer goes: the service the request came from, the conversation (a channel thread's id carries the thread)
 *  and the message to reply to. */
export type TeamsTo = { kind: "teams"; service_url: string; conversation_id: string; activity_id: string };

type Fetch = typeof fetch;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const teamsIdsOk = (appId: string, tenantId: string) => GUID.test(appId) && GUID.test(tenantId);

/** Microsoft's own Bot Framework service addresses: the bot's token is only ever sent to one of these, whatever a
 *  request says. Teams (smba.trafficmanager.net), the Bot Framework, and Microsoft's government clouds. */
export function teamsServiceOk(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  return /^(smba\.trafficmanager\.net|([a-z0-9-]+\.)*botframework\.com|([a-z0-9-]+\.)*botframework\.azure\.us|([a-z0-9-]+\.)*teams\.microsoft\.us)$/i.test(u.hostname);
}
const base = (s: string) => s.replace(/\/+$/, "");

/* ------------------------------------------------------------------ requests from Teams */

const OPENID = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const ISSUER = "https://api.botframework.com";
type Jwk = { kid?: string; kty?: string; n?: string; e?: string; endorsements?: string[] };
let keyCache: { at: number; keys: Jwk[] } | null = null;
/** Forget the cached signing keys (tests, or a key that just rotated). */
export const teamsForgetKeys = () => { keyCache = null; };

async function signingKeys(f: Fetch, now: number): Promise<Jwk[]> {
  // Microsoft asks for the keys to be fetched again at least every 24 hours
  if (keyCache && now - keyCache.at < 12 * 3600e3) return keyCache.keys;
  const conf = await f(OPENID, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null) as { jwks_uri?: string } | null;
  const uri = String(conf?.jwks_uri ?? "");
  if (!/^https:\/\/login\.botframework\.com\//.test(uri)) return keyCache?.keys ?? [];
  const j = await f(uri, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null) as { keys?: Jwk[] } | null;
  if (!Array.isArray(j?.keys) || !j!.keys.length) return keyCache?.keys ?? [];
  keyCache = { at: now, keys: j!.keys };
  return j!.keys;
}

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const jsonPart = (s: string) => { try { return JSON.parse(new TextDecoder().decode(b64url(s))) as Record<string, unknown>; } catch { return null; } };

/**
 * Whether a request really came from Teams for this bot: the Authorization header's JWT is signed (RS256) by one of the
 * Bot Framework's published keys, endorsed for the activity's channel, issued by the Bot Framework, for this bot's App
 * ID, within its validity (five minutes' skew), and for the same service address the activity names. Microsoft offers
 * no way to switch this off, and neither does Placetta.
 */
export async function teamsVerify(bot: Pick<TeamsBot, "app_id">, auth: string | null, activity: { serviceUrl?: string; channelId?: string }, o: { f?: Fetch; now?: number } = {}): Promise<boolean> {
  const f = o.f ?? fetch, now = o.now ?? Date.now();
  const m = /^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(String(auth ?? "").trim());
  if (!m || !bot.app_id) return false;
  const head = jsonPart(m[1]), body = jsonPart(m[2]);
  if (!head || !body || head.alg !== "RS256" || typeof head.kid !== "string") return false;
  if (body.iss !== ISSUER || body.aud !== bot.app_id) return false;
  const s = now / 1000;
  if (typeof body.exp !== "number" || body.exp < s - 300 || (typeof body.nbf === "number" && body.nbf > s + 300)) return false;
  if (!activity.serviceUrl || base(String(body.serviceUrl ?? "")) !== base(activity.serviceUrl)) return false;
  const key = (await signingKeys(f, now)).find((k) => k.kid === head.kid && k.kty === "RSA" && k.n && k.e);
  if (!key) return false;
  if (!activity.channelId || !(key.endorsements ?? []).includes(activity.channelId)) return false;
  try {
    const pub = await crypto.subtle.importKey("jwk", { kty: "RSA", n: key.n, e: key.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, b64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
  } catch { return false; }
}

/* ------------------------------------------------------------------ the bot's own token */

const tokens = new Map<string, { token: string; until: number }>();
export const teamsForgetToken = (appId: string) => tokens.delete(appId);
/** The bot's token for the Bot Framework (client credentials from its own tenant), cached until 5 minutes before it
 *  ends. null when Microsoft doesn't accept the ID, secret and tenant. */
export async function teamsToken(bot: Pick<TeamsBot, "app_id" | "app_secret" | "tenant_id">, f: Fetch = fetch, now = Date.now()): Promise<string | null> {
  const hit = tokens.get(bot.app_id);
  if (hit && hit.until > now) return hit.token;
  if (!teamsIdsOk(bot.app_id, bot.tenant_id)) return null;
  const res = await f(`https://login.microsoftonline.com/${bot.tenant_id}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: bot.app_id, client_secret: bot.app_secret, scope: "https://api.botframework.com/.default" }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const j = (res ? await res.json().catch(() => ({})) : {}) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  tokens.set(bot.app_id, { token: j.access_token, until: now + Math.max(60, Number(j.expires_in ?? 3600) - 300) * 1000 });
  return j.access_token;
}
/** Checks pasted credentials by getting a token with them. */
export const teamsWorks = async (bot: TeamsBot, f: Fetch = fetch) => (teamsForgetToken(bot.app_id), !!(await teamsToken(bot, f)));

/* ------------------------------------------------------------------ who's asking */

/** A Teams sender: a member (not a guest) of the bot's own tenant, with a work email, from the conversation's member
 *  list (the email isn't in the message itself). */
export async function teamsSender(bot: TeamsBot, to: TeamsTo, fromId: string, f: Fetch = fetch): Promise<ChatSender> {
  if (!fromId || !teamsServiceOk(to.service_url)) return { ok: false, why: "unknown" };
  const tok = await teamsToken(bot, f);
  if (!tok) return { ok: false, why: "setup" };
  const res = await f(`${base(to.service_url)}/v3/conversations/${encodeURIComponent(to.conversation_id)}/members/${encodeURIComponent(fromId)}`, { headers: { Authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!res) return { ok: false, why: "unknown" };
  if (res.status === 401 || res.status === 403) return { ok: false, why: "setup" };
  const u = await res.json().catch(() => ({})) as { email?: string; userPrincipalName?: string; tenantId?: string; userRole?: string };
  if (!res.ok) return { ok: false, why: "unknown" };
  if (u.tenantId && u.tenantId.toLowerCase() !== bot.tenant_id.toLowerCase()) return { ok: false, why: "outsider" };
  const upn = String(u.userPrincipalName ?? "");
  if (u.userRole === "guest" || u.userRole === "anonymous" || /#EXT#/i.test(upn)) return { ok: false, why: "guest" };
  const email = String(u.email || (upn.includes("@") ? upn : "")).trim().toLowerCase();
  return email ? { ok: true, email } : { ok: false, why: "unknown" };
}

/* ------------------------------------------------------------------ answering */

/** A button that opens a link (an approval in the app): Action.OpenUrl, so nothing can be approved in Teams itself. */
export type TeamsButton = { label: string; url: string };
/** The answer as a reply to the message that asked (in a channel, inside its thread), with the approval as a card
 *  button when there is one. */
export async function teamsReply(bot: TeamsBot, to: TeamsTo, text: string, o: { button?: TeamsButton; f?: Fetch } = {}): Promise<boolean> {
  const f = o.f ?? fetch;
  if (!teamsServiceOk(to.service_url)) return false;
  const tok = await teamsToken(bot, f);
  if (!tok) return false;
  const card = o.button && /^https:\/\//.test(o.button.url) ? [{ contentType: "application/vnd.microsoft.card.adaptive", content: {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json", type: "AdaptiveCard", version: "1.4", body: [],
    actions: [{ type: "Action.OpenUrl", title: o.button.label.slice(0, 60), url: o.button.url }],
  } }] : undefined;
  const res = await f(`${base(to.service_url)}/v3/conversations/${encodeURIComponent(to.conversation_id)}/activities/${encodeURIComponent(to.activity_id)}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
    body: JSON.stringify({ type: "message", text: text.slice(0, 20000), textFormat: "markdown", replyToId: to.activity_id, ...(card ? { attachments: card } : {}) }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (res?.status === 401) teamsForgetToken(bot.app_id);
  return !!res?.ok;
}

/* ------------------------------------------------------------------ one request, start to answer */

type Account = { id?: string; name?: string; aadObjectId?: string };
export type TeamsActivity = {
  type?: string; id?: string; serviceUrl?: string; channelId?: string; text?: string;
  from?: Account; recipient?: Account; conversation?: { id?: string; conversationType?: string; tenantId?: string };
  entities?: { type?: string; mentioned?: { id?: string } }[]; channelData?: { tenant?: { id?: string } };
};

/** The words of a message, without the <at>Odelia</at> mention and Teams' HTML. */
export function teamsText(t: string): string {
  return String(t ?? "").replace(/<at>[^<]*<\/at>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** What a request from Teams comes to: refused (401), nothing to do, or a job to hand to Odelia (after the sender is
 *  looked up, in the background) with its event id for taking it once. */
export type TeamsAnswer = { status: number; job?: { id: string; to: TeamsTo; text: string; from: string } };

/**
 * Checks and reads one request. In a personal chat any message is for Odelia; in a channel or group chat only one that
 * @mentions the bot (Teams sends bots only those anyway). Someone from another company's tenant is turned away here,
 * before anything is looked up.
 */
export async function teamsHandle(bot: TeamsBot, auth: string | null, body: string, o: { f?: Fetch; now?: number } = {}): Promise<TeamsAnswer> {
  let a: TeamsActivity;
  try { a = JSON.parse(body) as TeamsActivity; } catch { return { status: 400 }; }
  if (!(await teamsVerify(bot, auth, a, o))) return { status: 401 };
  if (a.type !== "message" || a.channelId !== "msteams" || !a.id || !a.conversation?.id || !a.from?.id || !a.serviceUrl || !teamsServiceOk(a.serviceUrl)) return { status: 200 };
  const tenant = String(a.conversation.tenantId ?? a.channelData?.tenant?.id ?? "").toLowerCase();
  if (tenant !== bot.tenant_id.toLowerCase()) return { status: 200 };
  const personal = a.conversation.conversationType === "personal";
  if (!personal && !(a.entities ?? []).some((e) => e.type === "mention" && e.mentioned?.id && e.mentioned.id === a.recipient?.id)) return { status: 200 };
  const text = teamsText(a.text ?? "");
  if (!text) return { status: 200 };
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${a.conversation.id}\n${a.id}`)));
  const id = "teams:" + [...digest.slice(0, 20)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { status: 200, job: { id, to: { kind: "teams", service_url: base(a.serviceUrl), conversation_id: a.conversation.id, activity_id: a.id }, text, from: a.from.id } };
}

export const TEAMS_SETUP = "I can't tell who's asking yet. The Placetta owner needs to check the bot's ID, client secret and tenant ID in Placetta (Settings, Integrations, Odelia in Teams), and that the Teams app is installed for your team.\n我还无法确认是谁在提问。快哉负责人需要在快哉中检查机器人的 ID、客户端密钥和租户 ID（设置 → 集成 → Teams 中的 Odelia），并确认 Teams 应用已为团队安装。";
