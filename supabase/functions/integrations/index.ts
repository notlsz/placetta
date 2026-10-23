// integrations: connect and use the customer's mail, calendar, files, books, point of sale (Square, Toast), team
// chats (Slack, Lark, WeChat) and any app's own MCP server (mcp.ts).
// POST {workspace_id, action, ...}. Members of the workspace; owners only to connect, disconnect, send mail or read sales
// and staff. Reading a connected mailbox, drive or books: owners, or the member who connected that account. Each member
// links their own WeChat (wechat_link).
import type { User } from "npm:@supabase/supabase-js@2.117.2";
import {
  admin,
  allowedReturn,
  appOrigins,
  audit,
  b64urlDecode,
  b64urlEncode,
  HttpError,
  hmacSha256,
  accessFor,
  type L10n,
  ok,
  optText,
  readBody,
  requireAccess,
  requireUser,
  same,
  serve,
  signState,
  SUPABASE_URL,
  text,
  timingSafeEqual,
  userClient,
  utf8,
  uuidParam,
} from "./shared.ts";
import {
  authorizeUrl,
  Conn,
  cloverApi,
  creds,
  dropSecret,
  findIntegration,
  isKind,
  type Kind,
  listIntegrations,
  NAMES,
  PROVIDER,
  qbApiBase,
  readBundle,
  revoke,
  SHOPIFY_VERSION,
  SQUARE_VERSION,
  squareBase,
  toastBase,
  writeBundle,
} from "./providers.ts";
import { HOOK_KINDS, HOOK_NAMES, hookHello, hookUrl, isHookKind, postHook, type HookKind } from "../_shared/channels.ts";
import { type LarkBot, larkWorks, slackManifest, slackWho } from "../_shared/bots.ts";
import { type WechatBot, wxCredsWork, wxKeyBytes, wxNewSecrets, type WxTokenProblem } from "../_shared/wechat.ts";
import { wechatBundle } from "../_shared/wechat_db.ts";
import { teamsIdsOk, teamsWorks } from "../_shared/teams.ts";
import { tgBotId, tgDeepLink, tgDeleteWebhook, tgGetMe, tgNewSecret, tgSetWebhook, tgTokenOk } from "../_shared/telegram.ts";
import { telegramBot } from "../_shared/telegram_db.ts";
import { type Call, lastFullMonth, monthsBetween, PosError, type SavedToken, squareSales, squareStaff, type ToastCtx, toastMatches, toastPlace, type ToastPlace, toastSales, toastStaff, toastTokens } from "./pos.ts";
import { mayRead, READ_REFUSED } from "./access.ts";
import { cloverPlaces, gbpPlaces, type Place, shopifyPlaces, squarePlaces, xeroProfile } from "./places.ts";
import { checkSend, dsAccount, dsSend, dsStatus, SignError } from "./esign.ts";
import { MCP_ACTIONS, mcpFinish, mcpRemote } from "./mcp.ts";
import { MCP_OWNER_ACTIONS } from "./mcp_rules.ts";

/** access: the caller's role in the workspace ("owner" or "member"), or "" for finish, which checks it itself. */
type Ctx = { user: User; jwt: string; ws: string; body: Record<string, unknown>; access: string };

/** Open a connected account to read what it holds: an owner, or the member who connected it. */
async function openToRead(c: Ctx, kind: Kind): Promise<Conn> {
  const row = await findIntegration(c.ws, kind);
  if (!row) throw new HttpError("not_connected", `Connect ${NAMES[kind].en} in Settings.`, `请在设置中连接${NAMES[kind].zh}。`);
  if (!mayRead(c.access, row, c.user.id)) throw new HttpError("forbidden", READ_REFUSED.en, READ_REFUSED.zh);
  return await Conn.fromRow(row);
}
type Action = (c: Ctx) => Promise<Response>;

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH = "https://graph.microsoft.com/v1.0";
const DRIVE = "https://www.googleapis.com/drive/v3";
const MAX_IMPORT = 25 * 1024 * 1024;
const enc = encodeURIComponent;

const you = (c: Ctx) => ({ workspace_id: c.ws, actor: "you" as const, actor_id: c.user.id });

function kindParam(v: unknown, allowed: Kind[]): Kind {
  if (!isKind(v) || !allowed.includes(v)) throw new HttpError("bad_request", `kind must be one of: ${allowed.join(", ")}.`);
  return v;
}

/** The explicit kind, or the first connected one in preference order. */
async function pickKind(ws: string, given: unknown, allowed: Kind[], none: string): Promise<Kind> {
  if (given !== undefined && given !== null && given !== "") return kindParam(given, allowed);
  const rows = await listIntegrations(ws, allowed);
  const k = allowed.find((a) => rows.some((r) => r.kind === a));
  if (!k) throw new HttpError("not_connected", none);
  return k;
}

function dateParam(v: unknown, label = "date"): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError("bad_request", `${label} must be YYYY-MM-DD.`);
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new HttpError("bad_request", `${label} is not a real date.`);
  return v;
}

function nextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function intParam(v: unknown, label: string, min: number, max: number, dflt?: number): number {
  if ((v === undefined || v === null || v === "") && dflt !== undefined) return dflt;
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError("bad_request", `${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

function idParam(v: unknown, label: string, max = 512): string {
  if (typeof v !== "string" || !v || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new HttpError("bad_request", `${label} is required.`);
  return v;
}

const isoDate = (v: unknown): string => {
  const t = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};

// ------------------------------------------------------------------ text helpers

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "\u2013", mdash: "\u2014", hellip: "\u2026",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d", copy: "\u00a9", reg: "\u00ae", middot: "\u00b7", bull: "\u2022",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html: string): string {
  return tidy(
    decodeEntities(
      html
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section|article|ul|ol)\s*>/gi, "\n")
        .replace(/<\/t[dh]\s*>/gi, "\t")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBytes(bytes: Uint8Array, charset: string | null): string {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// ------------------------------------------------------------------ mail

type Msg = { kind: Kind; id: string; from: string; subject: string; date: string; snippet: string };
type GHeader = { name: string; value: string };
type GPart = { mimeType?: string; filename?: string; headers?: GHeader[]; body?: { attachmentId?: string; size?: number; data?: string }; parts?: GPart[] };
type GMessage = { id: string; snippet?: string; internalDate?: string; payload?: GPart };

const header = (hs: GHeader[] | undefined, name: string): string =>
  hs?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

const GMAIL_DEFAULT = "from:.gov OR permit OR license OR licence OR inspection OR application OR renewal OR 许可";
const GRAPH_DEFAULT = "from:gov OR permit OR license OR licence OR inspection OR application OR renewal OR 许可";

async function gmailSearch(c: Conn, days: number, query: string | null): Promise<Msg[]> {
  const q = query ? `${query} newer_than:${days}d` : `newer_than:${days}d (${GMAIL_DEFAULT})`;
  // The list call refreshes the token if needed, so the parallel reads below all reuse it.
  const list = await c.callJson<{ messages?: { id: string }[] }>(`${GMAIL}/messages?${new URLSearchParams({ q, maxResults: "25" })}`);
  const got = await Promise.allSettled(
    (list.messages ?? []).slice(0, 25).map((m) =>
      c.callJson<GMessage>(`${GMAIL}/messages/${enc(m.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`)
    ),
  );
  return got.flatMap((r) => {
    if (r.status !== "fulfilled") return [];
    const m = r.value;
    const h = m.payload?.headers;
    return [{
      kind: "gmail" as Kind,
      id: m.id,
      from: header(h, "From"),
      subject: header(h, "Subject"),
      date: isoDate(m.internalDate) || isoDate(header(h, "Date")),
      snippet: decodeEntities(m.snippet ?? ""),
    }];
  });
}

type GraphAddress = { emailAddress?: { name?: string; address?: string } };
const graphAddr = (a: GraphAddress | undefined): string => {
  const name = a?.emailAddress?.name ?? "";
  const addr = a?.emailAddress?.address ?? "";
  return name && addr && name !== addr ? `${name} <${addr}>` : addr || name;
};

async function graphSearch(c: Conn, days: number, query: string | null): Promise<Msg[]> {
  const term = (query ?? GRAPH_DEFAULT).replace(/["\\]/g, " ").trim();
  const url = `${GRAPH}/me/messages?$search=${enc(`"${term}"`)}&$top=25&$select=id,from,subject,receivedDateTime,bodyPreview`;
  const res = await c.callJson<{ value?: { id: string; from?: GraphAddress; subject?: string; receivedDateTime?: string; bodyPreview?: string }[] }>(url);
  const since = Date.now() - days * 86400_000;
  return (res.value ?? [])
    .filter((m) => !m.receivedDateTime || Date.parse(m.receivedDateTime) >= since)
    .map((m) => ({
      kind: "outlook_mail" as Kind,
      id: m.id,
      from: graphAddr(m.from),
      subject: m.subject ?? "",
      date: isoDate(m.receivedDateTime),
      snippet: (m.bodyPreview ?? "").slice(0, 300),
    }));
}

const mailSearch: Action = async (c) => {
  const days = intParam(c.body.days, "days", 1, 365, 60);
  const query = optText(c.body.query, "query", 200);
  const connected = await listIntegrations(c.ws, ["gmail", "outlook_mail"]);
  if (!connected.length) throw new HttpError("not_connected", "Connect Gmail or Outlook in Settings.", "请在设置中连接 Gmail 或 Outlook。");
  // Only the mailboxes this caller may read: all of them for an owner, a member's own for a member.
  const rows = connected.filter((r) => mayRead(c.access, r, c.user.id));
  if (!rows.length) throw new HttpError("forbidden", READ_REFUSED.en, READ_REFUSED.zh);
  const results = await Promise.allSettled(
    rows.map(async (row) => {
      const conn = await Conn.fromRow(row);
      return row.kind === "gmail" ? gmailSearch(conn, days, query) : graphSearch(conn, days, query);
    }),
  );
  const messages = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [{ kind: rows[i].kind, error: r.reason }] : []));
  if (failed.length === rows.length) throw failed[0].error;
  messages.sort((a, b) => b.date.localeCompare(a.date));
  const errors = failed.map((f) => ({
    kind: f.kind,
    message: f.error instanceof HttpError ? f.error.message : `${NAMES[f.kind].en} could not be searched.`,
  }));
  return ok({ messages: messages.slice(0, 25), ...(errors.length ? { errors } : {}) });
};

const TEXT_LIMIT = 20000;

const mailRead: Action = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "outlook_mail"]);
  const id = idParam(c.body.id, "id");
  const conn = await openToRead(c, kind);

  if (kind === "gmail") {
    const m = await conn.callJson<GMessage>(`${GMAIL}/messages/${enc(id)}?format=full`);
    let plain: string | null = null;
    let html: string | null = null;
    const attachments: { id: string; name: string; size: number; mime: string }[] = [];
    const walk = (p: GPart | undefined, depth = 0) => {
      if (!p || depth > 20) return;
      const mime = (p.mimeType ?? "").toLowerCase();
      if (p.filename && p.body?.attachmentId) {
        attachments.push({ id: p.body.attachmentId, name: p.filename, size: p.body.size ?? 0, mime: p.mimeType ?? "application/octet-stream" });
      } else if (p.body?.data && (mime === "text/plain" || mime === "text/html")) {
        const charset = /charset="?([^";\s]+)"?/i.exec(header(p.headers, "Content-Type"))?.[1] ?? null;
        const s = decodeBytes(b64urlDecode(p.body.data), charset);
        if (mime === "text/plain" && plain === null) plain = s;
        if (mime === "text/html" && html === null) html = s;
      }
      p.parts?.forEach((x) => walk(x, depth + 1));
    };
    walk(m.payload);
    const h = m.payload?.headers;
    const body = plain !== null ? tidy(plain) : html !== null ? htmlToText(html) : decodeEntities(m.snippet ?? "");
    return ok({
      from: header(h, "From"),
      to: header(h, "To"),
      subject: header(h, "Subject"),
      date: isoDate(m.internalDate) || isoDate(header(h, "Date")),
      text: body.slice(0, TEXT_LIMIT),
      attachments,
    });
  }

  type GraphMsg = {
    from?: GraphAddress;
    toRecipients?: GraphAddress[];
    subject?: string;
    receivedDateTime?: string;
    hasAttachments?: boolean;
    body?: { contentType?: string; content?: string };
  };
  const m = await conn.callJson<GraphMsg>(`${GRAPH}/me/messages/${enc(id)}?$select=from,toRecipients,subject,receivedDateTime,body,hasAttachments`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  const content = m.body?.content ?? "";
  const body = (m.body?.contentType ?? "").toLowerCase() === "html" ? htmlToText(content) : tidy(content);
  let attachments: { id: string; name: string; size: number; mime: string }[] = [];
  if (m.hasAttachments) {
    const a = await conn.callJson<{ value?: { id: string; name?: string; size?: number; contentType?: string; isInline?: boolean }[] }>(
      `${GRAPH}/me/messages/${enc(id)}/attachments?$select=id,name,size,contentType,isInline`,
    );
    attachments = (a.value ?? [])
      .filter((x) => !x.isInline)
      .map((x) => ({ id: x.id, name: x.name ?? "attachment", size: x.size ?? 0, mime: x.contentType ?? "application/octet-stream" }));
  }
  return ok({
    from: graphAddr(m.from),
    to: (m.toRecipients ?? []).map(graphAddr).filter(Boolean).join(", "),
    subject: m.subject ?? "",
    date: isoDate(m.receivedDateTime),
    text: body.slice(0, TEXT_LIMIT),
    attachments,
  });
};

const EMAIL = /^[^\s@<>(),;:"[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

function recipients(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;]/) : [];
  const list = raw.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (!list.length) throw new HttpError("bad_request", "to is required.");
  if (list.length > 20) throw new HttpError("bad_request", "Send to at most 20 recipients.");
  for (const a of list) if (a.length > 254 || !EMAIL.test(a)) throw new HttpError("bad_request", `${a.slice(0, 80)} is not a valid email address.`);
  return list;
}

/** RFC 2047 encoded-words for a header value, split so each word stays short. */
function encodeHeader(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const words: string[] = [];
  let chunk = "";
  for (const ch of s) {
    if (utf8(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${btoa(String.fromCharCode(...utf8(w)))}?=`).join("\r\n ");
}

function base64Lines(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

type Attachment = { name: string; mime: string; bytes: Uint8Array };
const MAX_ATTACHMENTS = 5, MAX_ATTACH_BYTES = 15 * 1024 * 1024, GRAPH_INLINE_BYTES = 3 * 1024 * 1024;

/** Attachments by documents path: at most 5 files and 15 MB, each in this workspace's folder and in its documents. */
async function loadAttachments(ws: string, v: unknown, allowed?: Set<string>): Promise<Attachment[]> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError("bad_request", "attachments must be a list of { path }.");
  if (v.length > MAX_ATTACHMENTS) throw new HttpError("bad_request", `Attach at most ${MAX_ATTACHMENTS} files.`);
  const out: Attachment[] = [];
  let total = 0;
  for (const a of v) {
    const path = typeof a?.path === "string" ? a.path : "";
    if (!path.startsWith(`${ws}/`) || path.includes("..") || path.length > 500) throw new HttpError("bad_request", "That file isn't in this workspace.");
    if (allowed && !allowed.has(path)) throw new HttpError("forbidden", "Only the files the customer approved can be attached.");
    const { data: doc, error } = await admin.from("documents").select("name, mime").eq("workspace_id", ws).eq("path", path).maybeSingle();
    if (error) throw new Error(`document lookup failed: ${error.code ?? ""}`);
    if (!doc) throw new HttpError("not_found", "That file isn't in Documents.");
    const dl = await admin.storage.from("documents").download(path);
    if (dl.error || !dl.data) throw new HttpError("not_found", `Couldn't open ${doc.name}.`);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    total += bytes.length;
    if (total > MAX_ATTACH_BYTES) throw new HttpError("bad_request", "Attachments can be at most 15 MB in total.");
    out.push({ name: String(doc.name).replace(/[\r\n"]/g, " ").slice(0, 200), mime: doc.mime || "application/octet-stream", bytes });
  }
  return out;
}

const plainB64 = (bytes: Uint8Array) => base64Lines(bytes).replace(/\r\n/g, "");

/** The Gmail message: plain text, or multipart/mixed with the text first and one part per file. */
export function gmailMime(to: string[], subject: string, content: string, files: Attachment[]): string {
  const textPart = ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", base64Lines(utf8(content.replace(/\n/g, "\r\n")))];
  const head = [`To: ${to.join(", ")}`, `Subject: ${encodeHeader(subject)}`, "MIME-Version: 1.0"];
  if (!files.length) return [...head, ...textPart].join("\r\n");
  const boundary = `placetta_${b64urlEncode(crypto.getRandomValues(new Uint8Array(18)))}`;
  const parts = [`--${boundary}`, ...textPart];
  for (const f of files) {
    const name = encodeHeader(f.name);
    parts.push(`--${boundary}`, `Content-Type: ${f.mime.replace(/[\r\n;"]/g, "")}; name="${name}"`, `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64", "", base64Lines(f.bytes));
  }
  parts.push(`--${boundary}--`, "");
  return [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
}

/** Send from the workspace's own Gmail or Outlook. Returns the provider's message id and the account it went from. */
async function sendFrom(ws: string, kindParamValue: unknown, to: string[], subject: string, content: string, files: Attachment[]) {
  const kind = await pickKind(ws, kindParamValue, ["gmail", "outlook_mail"], "Connect Gmail or Outlook in Settings.");
  const conn = await Conn.open(ws, kind);
  let id = "", thread = "";
  if (kind === "gmail") {
    const r = await conn.callJson<{ id?: string; threadId?: string }>(`${GMAIL}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64urlEncode(utf8(gmailMime(to, subject, content, files))) }),
    });
    id = r.id ?? ""; thread = r.threadId ?? "";
  } else {
    const size = files.reduce((n, f) => n + f.bytes.length, 0);
    if (size > GRAPH_INLINE_BYTES) throw new HttpError("bad_request", "Outlook takes at most about 3 MB of attachments in one message. Send it by fax or mail instead.");
    const message = {
      subject,
      body: { contentType: "Text", content },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
      attachments: files.map((f) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.name, contentType: f.mime, contentBytes: plainB64(f.bytes) })),
    };
    // A draft first, so the message has an id to record, then send it.
    const draft = await conn.callJson<{ id?: string; conversationId?: string }>(`${GRAPH}/me/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message),
    });
    if (!draft.id) throw new HttpError("upstream_error", "Outlook didn't create the message. Try again.");
    await conn.callJson(`${GRAPH}/me/messages/${enc(draft.id)}/send`, { method: "POST" });
    id = draft.id; thread = draft.conversationId ?? "";
  }
  return { kind, id, thread, account: conn.row.account ?? "" };
}

function mailInput(body: Record<string, unknown>) {
  const to = recipients(body.to);
  const subject = text(body.subject, "subject", 1, 300).replace(/[\r\n]+/g, " ");
  if (typeof body.body !== "string" || !body.body.trim()) throw new HttpError("bad_request", "body is required.");
  if (body.body.length > 50000) throw new HttpError("bad_request", "body is too long (at most 50000 characters).");
  return { to, subject, content: body.body.replace(/\r\n?/g, "\n") };
}

/** Remember a sent message so mail_watch can tell the person when someone replies. Never fails the send. */
async function track(ws: string, sent: { kind: Kind; id: string; thread: string; account: string }, to: string[], subject: string, extra: { sent_by?: string; filing_id?: string; app_id?: string } = {}) {
  if (!sent.id || !sent.thread) return;
  const { error } = await admin.from("mail_threads").insert({
    workspace_id: ws, kind: sent.kind, account: sent.account || null, message_id: sent.id, thread_id: sent.thread,
    to_addrs: to.join(", ").slice(0, 500), subject: subject.slice(0, 300), ...extra,
  });
  if (error) console.error("mail_threads insert:", error.code ?? "");
}

const mailSend: Action = async (c) => {
  if (c.body.approved !== true) throw new HttpError("bad_request", "The customer must approve this message before it is sent.");
  const { to, subject, content } = mailInput(c.body);
  const files = await loadAttachments(c.ws, c.body.attachments);
  const sent = await sendFrom(c.ws, c.body.kind, to, subject, content, files);
  const { kind, account } = sent;
  await track(c.ws, sent, to, subject, { sent_by: c.user.id, app_id: optText(c.body.app_id, "app_id", 80) ?? undefined });

  const list = to.join(", ");
  const via = account ? ` (${account})` : "";
  await audit({
    ...you(c),
    action: { en: `Sent email to ${list}`, zh: `已发送邮件至 ${list}` },
    object: same(subject),
    detail: { en: `Via ${NAMES[kind].en}${via}${files.length ? `, ${files.length} attached` : ""}`, zh: `通过 ${NAMES[kind].zh}${via}${files.length ? `，附件 ${files.length} 个` : ""}` },
  });
  return ok({ kind, tracking: !!sent.thread });
};

/** The file function's server-to-server path: sends one running email filing, only its approved files. */
async function filerMailSend(body: Record<string, unknown>): Promise<Response> {
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const filingId = uuidParam(body.filing_id, "filing_id");
  const { data: f, error } = await admin.from("filings").select("id, workspace_id, payload, agent_state, channel, submit_clicked_at")
    .eq("id", filingId).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(`filing lookup failed: ${error.code ?? ""}`);
  if (!f) throw new HttpError("not_found", "No such filing.");
  if (f.agent_state !== "running" || f.channel !== "email") throw new HttpError("forbidden", "This filing isn't being sent by email right now.");
  if (!f.submit_clicked_at) throw new HttpError("forbidden", "Record the send before sending.");
  const p = (f.payload ?? {}) as Record<string, unknown>;
  const approved = new Set<string>([p.pdf_path, ...(Array.isArray(p.attachments) ? p.attachments.map((a: { path?: string }) => a?.path) : [])].filter((x): x is string => typeof x === "string"));
  const { to, subject, content } = mailInput(body);
  const files = await loadAttachments(ws, body.attachments, approved);
  // At most one email per filing, even if the file function were to ask twice: claim the filing's provider_ref while
  // it is still empty (the file function replaces the marker with the message id once this answers).
  const { data: claimed, error: claimError } = await admin.from("filings").update({ provider_ref: "email:sending" })
    .eq("id", filingId).eq("workspace_id", ws).is("provider_ref", null).select("id");
  if (claimError) throw new Error(`filing claim failed: ${claimError.code ?? ""}`);
  if (!claimed?.length) throw new HttpError("too_late", "This filing's email was already sent.", "这份申请的邮件已经发出。");
  const sent = await sendFrom(ws, body.kind, to, subject, content, files);
  const { data: row } = await admin.from("filings").select("app_id").eq("id", filingId).eq("workspace_id", ws).maybeSingle();
  await track(ws, sent, to, subject, { filing_id: filingId, app_id: (row?.app_id as string | undefined) ?? undefined });
  return ok(sent);
}

/* ------------------------------------------------------------------ replies to what Placetta sent */

type Reply = { from: string; at: string; snippet: string };
const addrOf = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();
const nameOf = (s: string) => (s.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || addrOf(s));

async function gmailReplies(conn: Conn, t: ThreadRow): Promise<Reply[]> {
  const r = await conn.callJson<{ messages?: GMessage[] }>(`${GMAIL}/threads/${enc(t.thread_id)}?format=metadata&metadataHeaders=From&metadataHeaders=Date`);
  const me = (t.account ?? "").toLowerCase(), sent = Date.parse(t.sent_at);
  return (r.messages ?? []).flatMap((m) => {
    const from = header(m.payload?.headers, "From"), at = Number(m.internalDate ?? 0);
    if (m.id === t.message_id || !at || at <= sent || (me && addrOf(from) === me)) return [];
    return [{ from, at: new Date(at).toISOString(), snippet: decodeEntities(m.snippet ?? "").slice(0, 280) }];
  });
}

async function graphReplies(conn: Conn, t: ThreadRow): Promise<Reply[]> {
  const filter = `conversationId eq '${t.thread_id.replace(/'/g, "''")}'`;
  const r = await conn.callJson<{ value?: { id: string; from?: GraphAddress; receivedDateTime?: string; bodyPreview?: string; isDraft?: boolean }[] }>(
    `${GRAPH}/me/messages?$filter=${enc(filter)}&$select=id,from,receivedDateTime,bodyPreview,isDraft&$top=25`);
  const me = (t.account ?? "").toLowerCase(), sent = Date.parse(t.sent_at);
  return (r.value ?? []).flatMap((m) => {
    const from = graphAddr(m.from), at = Date.parse(m.receivedDateTime ?? "");
    if (m.isDraft || m.id === t.message_id || !at || at <= sent || (me && addrOf(from) === me)) return [];
    return [{ from, at: new Date(at).toISOString(), snippet: (m.bodyPreview ?? "").slice(0, 280) }];
  });
}

type ThreadRow = { id: string; workspace_id: string; kind: Kind; account: string | null; message_id: string; thread_id: string; subject: string; to_addrs: string; app_id: string | null; sent_at: string; replies: number; last_reply_at: string | null };

/** The monitor key's job, every 10 minutes: look for replies to what Placetta sent, tell the person, stop after 30 days. */
async function mailWatch(): Promise<Response> {
  const now = new Date().toISOString();
  await admin.from("mail_threads").update({ closed_at: now }).is("closed_at", null).lt("sent_at", new Date(Date.now() - 30 * 864e5).toISOString()).eq("replies", 0);
  const { data, error } = await admin.from("mail_threads")
    .select("id, workspace_id, kind, account, message_id, thread_id, subject, to_addrs, app_id, sent_at, replies, last_reply_at")
    .is("closed_at", null).order("checked_at", { ascending: true, nullsFirst: true }).limit(80);
  if (error) throw new Error(`mail_threads: ${error.code ?? ""}`);
  const conns = new Map<string, Conn | null>();
  let checked = 0, replied = 0;
  for (const t of (data ?? []) as ThreadRow[]) {
    const key = `${t.workspace_id}:${t.kind}`;
    if (!conns.has(key)) conns.set(key, await Conn.open(t.workspace_id, t.kind).catch(() => null));
    const conn = conns.get(key);
    if (!conn) { await admin.from("mail_threads").update({ checked_at: now, closed_at: now }).eq("id", t.id); continue; }   // the mailbox was disconnected
    let found: Reply[] = [];
    try { found = t.kind === "gmail" ? await gmailReplies(conn, t) : await graphReplies(conn, t); checked++; }
    catch (e) { console.error("mail_watch", t.kind, e instanceof Error ? e.message.slice(0, 160) : e); }
    const fresh = found.filter((r) => !t.last_reply_at || r.at > t.last_reply_at).sort((a, b) => a.at.localeCompare(b.at));
    if (!fresh.length) { await admin.from("mail_threads").update({ checked_at: now }).eq("id", t.id); continue; }
    const last = fresh[fresh.length - 1], who = nameOf(last.from);
    await admin.from("mail_threads").update({ checked_at: now, replies: t.replies + fresh.length, last_reply_at: last.at, last_reply_from: last.from.slice(0, 300), last_reply_snippet: last.snippet }).eq("id", t.id);
    await notifyReply(t, who, last);
    replied++;
  }
  return ok({ checked, replied });
}

/** A reply: an Update in the app, a line in the audit trail, and a text to owners who linked a phone. */
async function notifyReply(t: ThreadRow, who: string, r: Reply) {
  const dedupe = `mail:${t.id}:${r.at}`;
  const title = { en: `${who} replied: ${t.subject}`.slice(0, 200), zh: `${who} 回复了：${t.subject}`.slice(0, 200) };
  const { data: made, error } = await admin.from("updates").upsert({
    workspace_id: t.workspace_id, kind: "mail", title, body: same(r.snippet || "(no text)"), app_id: t.app_id, dedupe,
  }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true }).select("id");
  if (error) { console.error("updates insert:", error.code ?? ""); return; }
  if (!made?.length) return;   // already told
  await audit({ workspace_id: t.workspace_id, actor: "agent", actor_id: null, action: { en: "Got a reply", zh: "收到回复" }, object: same(t.subject), detail: same(who) });
  const { data: owners } = await admin.from("workspace_members").select("user_id").eq("workspace_id", t.workspace_id).eq("role", "owner");
  const ids = (owners ?? []).map((o) => o.user_id as string);
  if (!ids.length) return;
  const { data: links } = await admin.from("phone_links").select("user_id, lang").in("user_id", ids).eq("texts_on", true).not("verified_at", "is", null).is("opted_out_at", null);
  const rows = (links ?? []).map((l) => ({
    user_id: l.user_id, workspace_id: t.workspace_id, kind: "text", urgent: false, link: null, dedupe: `${dedupe}`.slice(0, 300),
    body: l.lang === "zh"
      ? `${who} 回复了“${t.subject}”：${r.snippet.slice(0, 120)}。回复我“读一下”，我来告诉您下一步。`
      : `${who} replied to "${t.subject}": ${r.snippet.slice(0, 120)}. Text me "read it" and I'll tell you what to do next.`,
  }));
  if (!rows.length) return;
  const { error: oe } = await admin.from("odelia_outbox").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true });
  if (oe) console.error("odelia_outbox:", oe.code ?? "");
}

/** True when the request carries the file function's shared secret. */
async function fromFiler(req: Request): Promise<boolean> {
  const got = req.headers.get("x-filer-secret");
  if (!got) return false;
  const want = Deno.env.get("FILER_SECRET") ?? "";
  if (want.length < 32) throw new HttpError("not_configured", "FILER_SECRET is not set.");
  // Compare HMACs so the comparison is constant-time whatever the lengths.
  const k = "placetta-filer";
  if (!timingSafeEqual(await hmacSha256(k + want, got), await hmacSha256(k + want, want))) throw new HttpError("unauthorized", "Wrong filer key.");
  return true;
}

// ------------------------------------------------------------------ calendar

const calendarAdd: Action = async (c) => {
  const title = text(c.body.title, "title", 1, 300);
  const date = dateParam(c.body.date);
  const notes = optText(c.body.notes, "notes", 5000);
  const tz = optText(c.body.time_zone, "time_zone", 64) ?? "UTC";
  if (!/^[A-Za-z0-9_+\-/ .()]+$/.test(tz)) throw new HttpError("bad_request", "time_zone is not valid.");
  const kind = await pickKind(c.ws, c.body.kind, ["gcal", "outlook_cal"], "Connect Google Calendar or Outlook Calendar in Settings.");
  const conn = await Conn.open(c.ws, kind);
  const end = nextDay(date);

  let link: string | undefined;
  if (kind === "gcal") {
    const ev = await conn.callJson<{ htmlLink?: string }>("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: title, description: notes ?? undefined, start: { date }, end: { date: end }, transparency: "transparent" }),
    });
    link = ev.htmlLink;
  } else {
    const ev = await conn.callJson<{ webLink?: string }>(`${GRAPH}/me/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: title,
        body: { contentType: "text", content: notes ?? "" },
        start: { dateTime: `${date}T00:00:00`, timeZone: tz },
        end: { dateTime: `${end}T00:00:00`, timeZone: tz },
        isAllDay: true,
        showAs: "free",
      }),
    });
    link = ev.webLink;
  }

  await audit({
    ...you(c),
    action: { en: "Added to your calendar", zh: "已添加到您的日历" },
    object: same(title),
    detail: { en: `${date}, ${NAMES[kind].en}`, zh: `${date}，${NAMES[kind].zh}` },
  });
  return ok(link ? { link } : {});
};

// ------------------------------------------------------------------ files

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", heic: "image/heic",
  tif: "image/tiff", tiff: "image/tiff", txt: "text/plain", csv: "text/csv", json: "application/json", zip: "application/zip",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const mimeOf = (name: string): string => MIME_BY_EXT[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

type FileOut = { id: string; name: string; size: number | null; modified: string | null; mime: string };

const filesSearch: Action = async (c) => {
  const kind = kindParam(c.body.kind, ["gdrive", "dropbox"]);
  const query = text(c.body.query, "query", 1, 200);
  const conn = await openToRead(c, kind);
  let files: FileOut[];
  if (kind === "gdrive") {
    const esc = query.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const q = `name contains '${esc}' and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;
    const params = new URLSearchParams({
      q,
      pageSize: "25",
      orderBy: "modifiedTime desc",
      fields: "files(id,name,size,modifiedTime,mimeType)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    const res = await conn.callJson<{ files?: { id: string; name: string; size?: string; modifiedTime?: string; mimeType?: string }[] }>(`${DRIVE}/files?${params}`);
    files = (res.files ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? Number(f.size) : null,
      modified: f.modifiedTime ?? null,
      mime: f.mimeType ?? "application/octet-stream",
    }));
  } else {
    type DbxMeta = { ".tag"?: string; id?: string; name?: string; size?: number; server_modified?: string };
    const res = await conn.callJson<{ matches?: { metadata?: { metadata?: DbxMeta } }[] }>("https://api.dropboxapi.com/2/files/search_v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, options: { max_results: 25, file_status: "active" } }),
    });
    files = (res.matches ?? [])
      .map((m) => m.metadata?.metadata)
      .filter((m): m is DbxMeta => !!m && m[".tag"] === "file" && !!m.id && !!m.name)
      .map((m) => ({ id: m.id as string, name: m.name as string, size: m.size ?? null, modified: m.server_modified ?? null, mime: mimeOf(m.name as string) }));
  }
  return ok({ files: files.slice(0, 25) });
};

const TOO_BIG = () => new HttpError("bad_request", "Files over 25 MB can't be imported.");

async function readCapped(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_IMPORT) {
    await res.body?.cancel();
    throw TOO_BIG();
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_IMPORT) {
      await reader.cancel();
      throw TOO_BIG();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const ch of chunks) {
    out.set(ch, at);
    at += ch.length;
  }
  return out;
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const rawBase = dot > 0 ? name.slice(0, dot) : name;
  const rawExt = dot > 0 ? name.slice(dot + 1) : "";
  const base = rawBase.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 100) || "file";
  const ext = rawExt.replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toLowerCase();
  return ext ? `${base}.${ext}` : base;
}

/** ASCII-only JSON for HTTP headers (Dropbox-API-Arg). */
const asciiJson = (v: unknown): string => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);

const GOOGLE_EXPORTABLE = new Set([
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.drawing",
]);

type AppRef = { id: string; name?: L10n };

async function findApp(ws: string, appId: string | null): Promise<AppRef | null> {
  if (!appId) return null;
  const { data, error } = await admin.from("workspaces").select("state").eq("id", ws).maybeSingle();
  if (error) throw new Error(`workspace lookup failed: ${error.code ?? ""}`);
  const apps = (data?.state as { apps?: AppRef[] } | null)?.apps;
  const app = Array.isArray(apps) ? apps.find((a) => a && String(a.id) === appId) : undefined;
  if (!app) throw new HttpError("bad_request", "That application is not in this workspace.");
  return app;
}

const filesImport: Action = async (c) => {
  const kind = kindParam(c.body.kind, ["gdrive", "dropbox"]);
  const fileId = idParam(c.body.file_id, "file_id", 300);
  const app = await findApp(c.ws, optText(c.body.app_id, "app_id", 100));
  const conn = await openToRead(c, kind);

  let name: string;
  let mime: string;
  let bytes: Uint8Array;
  if (kind === "gdrive") {
    const meta = await conn.callJson<{ id: string; name: string; mimeType: string; size?: string }>(
      `${DRIVE}/files/${enc(fileId)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    );
    let url: string;
    if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
      if (!GOOGLE_EXPORTABLE.has(meta.mimeType)) throw new HttpError("bad_request", "This file type can't be imported.");
      url = `${DRIVE}/files/${enc(fileId)}/export?mimeType=application%2Fpdf`;
      name = /\.pdf$/i.test(meta.name) ? meta.name : `${meta.name}.pdf`;
      mime = "application/pdf";
    } else {
      if (Number(meta.size ?? "0") > MAX_IMPORT) throw TOO_BIG();
      url = `${DRIVE}/files/${enc(fileId)}?alt=media&supportsAllDrives=true`;
      name = meta.name;
      mime = meta.mimeType || mimeOf(meta.name);
    }
    const res = await conn.call(url, {}, 60000);
    if (!res.ok) throw await conn.upstream(res);
    bytes = await readCapped(res);
  } else {
    const meta = await conn.callJson<{ ".tag"?: string; name?: string; size?: number }>("https://api.dropboxapi.com/2/files/get_metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: fileId }),
    });
    if (meta[".tag"] !== "file" || !meta.name) throw new HttpError("bad_request", "Pick a file, not a folder.");
    if ((meta.size ?? 0) > MAX_IMPORT) throw TOO_BIG();
    const res = await conn.call("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { "Dropbox-API-Arg": asciiJson({ path: fileId }) } }, 60000);
    if (!res.ok) throw await conn.upstream(res);
    bytes = await readCapped(res);
    name = meta.name;
    mime = mimeOf(meta.name);
  }

  const display = name.trim().slice(0, 200) || "file";
  const path = `${c.ws}/${crypto.randomUUID()}/${safeFileName(display)}`;
  const up = await admin.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("storage upload failed:", up.error.message?.slice(0, 120) ?? "");
    throw new Error("storage upload failed");
  }
  const { data: doc, error } = await admin
    .from("documents")
    .insert({ workspace_id: c.ws, app_id: app ? String(app.id) : null, name: display, path, size: bytes.length, mime, source: "customer", uploaded_by: c.user.id })
    .select("id, name, path, size, mime")
    .single();
  if (error || !doc) {
    await admin.storage.from("documents").remove([path]);
    console.error("documents insert failed:", error?.code ?? "");
    throw new Error("documents insert failed");
  }

  await audit({
    ...you(c),
    action: { en: `Imported from ${NAMES[kind].en}`, zh: `从 ${NAMES[kind].zh} 导入` },
    object: same(display),
    detail: app?.name ? { en: `For ${app.name.en ?? app.name.zh}`, zh: `用于 ${app.name.zh ?? app.name.en}` } : null,
  });
  return ok({ document: doc });
};

// ------------------------------------------------------------------ books

type QbRow = { group?: string; type?: string; Summary?: { ColData?: { value?: string }[] }; Rows?: { Row?: QbRow[] } };

function totalIncome(rows: QbRow[] | undefined, depth = 0): number | null {
  if (!rows || depth > 10) return null;
  for (const r of rows) {
    const label = r.Summary?.ColData?.[0]?.value ?? "";
    if (r.group === "Income" || /^total income$/i.test(label)) {
      const v = Number(r.Summary?.ColData?.[1]?.value ?? "");
      if (Number.isFinite(v)) return v;
    }
  }
  for (const r of rows) {
    const v = totalIncome(r.Rows?.Row, depth + 1);
    if (v !== null) return v;
  }
  return null;
}

const booksIncome: Action = async (c) => {
  const year = intParam(c.body.year, "year", 2000, new Date().getUTCFullYear() + 1);
  const conn = await openToRead(c, "quickbooks");
  const realm = typeof conn.row.meta?.realm_id === "string" ? conn.row.meta.realm_id : "";
  if (!/^\d+$/.test(realm)) throw new HttpError("not_connected", "Reconnect QuickBooks in Settings.");
  const base = conn.row.meta?.env === "production"
    ? "https://quickbooks.api.intuit.com"
    : conn.row.meta?.env === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : qbApiBase();
  const report = await conn.callJson<{ Header?: { Currency?: string }; Rows?: { Row?: QbRow[] } }>(
    `${base}/v3/company/${realm}/reports/ProfitAndLoss?start_date=${year}-01-01&end_date=${year}-12-31`,
    { headers: { Accept: "application/json" } },
  );
  return ok({ year, total_income: totalIncome(report.Rows?.Row) ?? 0, currency: report.Header?.Currency ?? null, company: conn.row.account });
};

// ------------------------------------------------------------------ slack

const slackPost: Action = async (c) => {
  const msg = text(c.body.text, "text", 1, 4000);
  const conn = await Conn.open(c.ws, "slack");
  const hook = conn.bundle.webhook_url ?? "";
  const r = await postHook("slack", hook, msg);
  if (r.ok) return ok();
  console.error("slack post:", r.why);
  if (r.gone) {
    await conn.markError("The Slack channel is no longer available. Reconnect in Settings.");
    throw new HttpError("not_connected", "Reconnect Slack in Settings.");
  }
  throw new HttpError("upstream_error", "Slack did not answer. Try again.");
};

// ------------------------------------------------------------------ team chat: a pasted incoming-webhook link

/** Save a group's webhook link for Slack, Lark, WeCom or Microsoft Teams, after a welcome post proves it works. */
const hookConnect: Action = async (c) => {
  const kind = c.body.kind;
  if (!isHookKind(kind)) throw new HttpError("bad_request", `kind must be one of: ${HOOK_KINDS.join(", ")}.`);
  const url = hookUrl(kind, text(c.body.url, "url", 10, 600));
  if (!url) throw new HttpError("bad_request", `That isn't a ${HOOK_NAMES[kind].en} webhook link. Copy the whole link the bot or workflow gives you.`);
  const secret = optText(c.body.secret, "secret", 200) ?? undefined;
  const lang = c.body.lang === "zh" ? "zh" : "en";
  const { data: w } = await admin.from("workspaces").select("name").eq("id", c.ws).maybeSingle();
  const business = typeof w?.name === "string" ? w.name : "";
  const r = await postHook(kind, url.href, hookHello(business, lang), secret);
  if (!r.ok) {
    console.error(`${kind} hook test:`, r.why);
    throw new HttpError("bad_request", lang === "zh"
      ? `${HOOK_NAMES[kind].zh}没有接受测试消息（${r.why}）。请检查链接${kind === "lark" ? "，以及机器人的签名或关键词设置" : ""}。`
      : `${HOOK_NAMES[kind].en} didn't accept the test message (${r.why}). Check the link${kind === "lark" ? " and the bot's signature or keyword setting" : ""}.`);
  }
  const old = await findIntegration(c.ws, kind as Kind);
  if (old) { if (kind === "slack" && old.meta?.via !== "link") await revoke(old); await dropSecret(old.secret_id); await admin.from("integrations").delete().eq("id", old.id); }
  const secretId = await writeBundle({ access_token: "", refresh_token: null, expires_at: null, token_type: "webhook", webhook_url: url.href, secret }, `integration:${kind}`, null);
  const account = lang === "zh" ? `${HOOK_NAMES[kind].zh}群` : `${HOOK_NAMES[kind].en} channel`;
  const { error } = await admin.from("integrations").insert({ workspace_id: c.ws, kind, account, scopes: "webhook", status: "connected", secret_id: secretId, meta: { via: "link", lang }, connected_by: c.user.id });
  if (error) { await dropSecret(secretId); throw new Error(`integration insert failed: ${error.code ?? ""}`); }
  await audit({ ...you(c), action: { en: `Connected ${HOOK_NAMES[kind].en}`, zh: `已连接${HOOK_NAMES[kind].zh}` }, object: HOOK_NAMES[kind] });
  return ok({ kind, account });
};

// ------------------------------------------------------------------ talk to Odelia: the business's own Slack or Lark bot, or WeChat account

const BOT_NAMES = {
  slack_bot: { en: "Odelia in Slack", zh: "Slack 中的 Odelia" },
  lark_bot: { en: "Odelia in Lark", zh: "飞书中的 Odelia" },
  wechat_bot: { en: "Odelia in WeChat", zh: "微信中的 Odelia" },
  teams_bot: { en: "Odelia in Microsoft Teams", zh: "Microsoft Teams 中的 Odelia" },
  telegram_bot: { en: "Odelia in Telegram", zh: "Telegram 中的 Odelia" },
} as const;
type BotKind = keyof typeof BOT_NAMES;
const isBotKind = (v: unknown): v is BotKind => typeof v === "string" && Object.hasOwn(BOT_NAMES, v);
const BOT_KINDS_SAY = "kind must be slack_bot, lark_bot, wechat_bot, teams_bot or telegram_bot.";
/** Where the bot's events go. WeChat's and Telegram's addresses are paths, so their own query strings can't collide
 *  with ours. */
const eventsUrl = (ws: string, kind: BotKind) =>
  kind === "wechat_bot" ? `${SUPABASE_URL}/functions/v1/chat-events/wechat/${ws}`
  : kind === "telegram_bot" ? `${SUPABASE_URL}/functions/v1/chat-events/telegram/${ws}`
  : `${SUPABASE_URL}/functions/v1/chat-events?${kind === "slack_bot" ? "slack" : kind === "lark_bot" ? "lark" : "teams"}=${ws}`;
/** The addresses Placetta calls WeChat from, when they're fixed (WECHAT_EGRESS_IPS, with WECHAT_API_BASE pointing at a
 *  relay on those addresses): what the account's API IP whitelist needs. Empty when calls go straight to WeChat. */
const egressIps = () => (Deno.env.get("WECHAT_EGRESS_IPS") ?? "").split(/[\s,]+/).filter((ip) => /^[0-9a-fA-F.:]{3,45}$/.test(ip)).slice(0, 10);

/** What to set up before connecting: the bot's event address, for Slack the app manifest to paste, and for WeChat a
 *  fresh Token and EncodingAESKey to use (or replace with the account's own) and any addresses to whitelist. */
const botSetup: Action = async (c) => {
  const kind = c.body.kind;
  if (!isBotKind(kind)) throw new HttpError("bad_request", BOT_KINDS_SAY);
  return ok({
    events_url: eventsUrl(c.ws, kind),
    ...(kind === "slack_bot" ? { manifest: JSON.stringify(slackManifest(eventsUrl(c.ws, kind)), null, 2) } : {}),
    ...(kind === "wechat_bot" ? { ...wxNewSecrets(), ips: egressIps() } : {}),
  });
};

/** What to tell an owner when WeChat won't give their account a token (https://developers.weixin.qq.com/doc/service/guide/dev/api/). */
const WX_PROBLEM: Record<WxTokenProblem, L10n> = {
  credentials: {
    en: "WeChat didn't accept that AppID and AppSecret. Copy both from the WeChat developer platform (My business, Service account, Development keys). The AppSecret shows once, when it's reset.",
    zh: "微信不接受这个 AppID 和 AppSecret。请从微信开发者平台复制（我的业务 → 服务号 → 开发密钥）。AppSecret 只在重置时显示一次。",
  },
  ip: {
    en: "This account's API IP whitelist is on and Placetta's server isn't on it. Turn the whitelist off (My business, Service account, Development keys, API IP whitelist), or add the addresses shown above, then connect again.",
    zh: "该账号开启了 API IP 白名单，快哉的服务器不在其中。请关闭白名单（我的业务 → 服务号 → 开发密钥 → API IP 白名单），或添加上面显示的地址，然后重新连接。",
  },
  confirm: {
    en: "WeChat sent this account's admin a message asking to allow Placetta's server. Allow it in WeChat, then press Connect again.",
    zh: "微信已向该账号的管理员发消息，请求允许快哉的服务器调用接口。请在微信中允许，然后再点“连接”。",
  },
  refused: {
    en: "This account's admin turned Placetta's server away. Wait an hour, connect again, and allow it when WeChat asks.",
    zh: "该账号的管理员拒绝了快哉的服务器。请一小时后重新连接，并在微信询问时允许。",
  },
  unreachable: { en: "WeChat didn't answer. Try again in a minute.", zh: "微信没有响应，请一分钟后再试。" },
};

/** Save the business's own bot after checking its credentials work. */
const botConnect: Action = async (c) => {
  const kind = c.body.kind;
  if (!isBotKind(kind)) throw new HttpError("bad_request", BOT_KINDS_SAY);
  let bundle: Record<string, unknown>, account: string;
  const meta: Record<string, unknown> = { via: "bot" };
  // Telegram: the webhook is set (with a fresh secret) once the bot is saved, and undone if saving fails
  let telegram: { token: string; secret: string } | null = null;
  if (kind === "teams_bot") {
    // the bot's ID and a client secret from the Teams Developer Portal (Tools, Bot management), and the Microsoft Entra
    // tenant it lives in: checked by getting a Bot Framework token with them
    const app_id = text(c.body.app_id, "app_id", 36, 36).toLowerCase(), app_secret = text(c.body.app_secret, "app_secret", 8, 200), tenant_id = text(c.body.tenant_id, "tenant_id", 36, 36).toLowerCase();
    if (!teamsIdsOk(app_id, tenant_id)) throw new HttpError("bad_request", "The bot ID and the tenant ID each look like 8c3e5d2a-1b4f-4e6a-9c7d-2f1e0a9b8c7d. Copy them from the Teams Developer Portal and Microsoft Entra.", "机器人 ID 和租户 ID 的格式都类似 8c3e5d2a-1b4f-4e6a-9c7d-2f1e0a9b8c7d。请从 Teams 开发者门户和 Microsoft Entra 复制。");
    if (!(await teamsWorks({ kind, app_id, app_secret, tenant_id }))) throw new HttpError("bad_request", "Microsoft didn't accept that bot ID, client secret and tenant ID. Check the secret hasn't expired and the tenant is the one the bot was made in.", "Microsoft 不接受这个机器人 ID、客户端密钥和租户 ID。请确认密钥未过期，且租户就是创建机器人的那个。");
    bundle = { app_id, app_secret, tenant_id }; account = "Microsoft Teams"; meta.app_id = app_id;
  } else if (kind === "telegram_bot") {
    const bot_token = text(c.body.bot_token, "bot_token", 30, 80);
    if (!tgTokenOk(bot_token)) throw new HttpError("bad_request", "That isn't a bot token. @BotFather gives one like 7012345678:AAH9f3kq...", "这不是机器人令牌。@BotFather 给的令牌类似 7012345678:AAH9f3kq...");
    const me = await tgGetMe(bot_token);
    if (!me) throw new HttpError("bad_request", "Telegram didn't accept that token. Copy it again from @BotFather (/mybots, your bot, API Token).", "Telegram 不接受这个令牌。请在 @BotFather 中重新复制（/mybots → 您的机器人 → API Token）。");
    const secret = tgNewSecret();
    bundle = { bot_token, secret, bot_id: tgBotId(bot_token), username: me.username }; account = `@${me.username}`;
    meta.bot_id = tgBotId(bot_token); meta.username = me.username;
    telegram = { token: bot_token, secret };
  } else if (kind === "slack_bot") {
    const bot_token = text(c.body.bot_token, "bot_token", 20, 200), signing_secret = text(c.body.signing_secret, "signing_secret", 16, 100);
    if (!/^xoxb-/.test(bot_token)) throw new HttpError("bad_request", "That isn't a bot token. Copy the Bot User OAuth Token, which starts with xoxb-.");
    const who = await slackWho(bot_token);
    if (!who) throw new HttpError("bad_request", "Slack didn't accept that bot token. Install the app to your workspace first, then copy its Bot User OAuth Token.");
    bundle = { bot_token, signing_secret }; account = `${who.team} (@${who.bot})`;
  } else if (kind === "wechat_bot") {
    // a verified service account's AppID (wx and 16 letters or digits), AppSecret, the Token for signatures and, for
    // safe mode, the EncodingAESKey, all as set under Message push in the WeChat developer platform
    const app_id = text(c.body.app_id, "app_id", 18, 18), app_secret = text(c.body.app_secret, "app_secret", 16, 64), token = text(c.body.token, "token", 3, 32);
    const aes_key = optText(c.body.aes_key, "aes_key", 43) ?? undefined;
    if (!/^wx[0-9A-Za-z]{16}$/.test(app_id)) throw new HttpError("bad_request", "That isn't an AppID. It starts with wx: copy it from the WeChat developer platform (My business, Service account).", "这不是 AppID。AppID 以 wx 开头，请从微信开发者平台复制（我的业务 → 服务号）。");
    if (!/^[A-Za-z0-9]{3,32}$/.test(token)) throw new HttpError("bad_request", "The Token is 3 to 32 letters and digits, the same as under Message push in WeChat.", "Token 为 3 到 32 位字母和数字，需与微信“消息推送”中填写的一致。");
    if (aes_key && !wxKeyBytes(aes_key)) throw new HttpError("bad_request", "The EncodingAESKey is 43 letters and digits, the same as under Message push in WeChat.", "EncodingAESKey 为 43 位字母和数字，需与微信“消息推送”中填写的一致。");
    const r = await wxCredsWork(app_id, app_secret);
    if (!r.ok) throw new HttpError("bad_request", WX_PROBLEM[r.problem].en, WX_PROBLEM[r.problem].zh);
    const bot: WechatBot = { kind, app_id, app_secret, token, ...(aes_key ? { aes_key } : {}), access_token: r.token, expires_at: r.expires_at };
    bundle = wechatBundle(bot); account = app_id; meta.app_id = app_id; meta.safe_mode = !!aes_key;
  } else {
    const bot: LarkBot = { kind, app_id: text(c.body.app_id, "app_id", 6, 80), app_secret: text(c.body.app_secret, "app_secret", 10, 120),
      verification_token: text(c.body.verification_token, "verification_token", 6, 120), encrypt_key: optText(c.body.encrypt_key, "encrypt_key", 120) ?? undefined,
      domain: c.body.domain === "lark" ? "lark" : "feishu" };
    if (!(await larkWorks(bot))) throw new HttpError("bad_request", "Lark didn't accept that App ID and App Secret. Copy them from the app's Credentials page.");
    const { kind: _k, ...rest } = bot; void _k; bundle = rest; account = bot.domain === "lark" ? "Lark" : "飞书";
  }
  const old = await findIntegration(c.ws, kind as unknown as Kind);
  if (old) { await dropSecret(old.secret_id); await admin.from("integrations").delete().eq("id", old.id); }
  const secretId = await writeBundle({ access_token: "", refresh_token: null, expires_at: null, token_type: "bot", ...bundle } as never, `integration:${kind}`, null);
  const { error } = await admin.from("integrations").insert({ workspace_id: c.ws, kind, account, scopes: "bot", status: "connected", secret_id: secretId, meta, connected_by: c.user.id });
  if (error) { await dropSecret(secretId); throw new Error(`integration insert failed: ${error.code ?? ""}`); }
  if (telegram) {
    // the bot's messages come to this workspace's address, each carrying the secret only Telegram and Placetta know
    const hook = await tgSetWebhook(telegram.token, eventsUrl(c.ws, kind), telegram.secret);
    if (!hook.ok) {
      await admin.from("integrations").delete().eq("workspace_id", c.ws).eq("kind", kind);
      await dropSecret(secretId);
      throw new HttpError("bad_request", `Telegram didn't take the webhook (${hook.why}). Try again in a minute.`, `Telegram 没有接受 webhook（${hook.why}）。请一分钟后再试。`);
    }
  }
  await audit({ ...you(c), action: { en: `Connected ${BOT_NAMES[kind].en}`, zh: `已连接${BOT_NAMES[kind].zh}` }, object: BOT_NAMES[kind], detail: same(account) });
  return ok({ kind, account, events_url: eventsUrl(c.ws, kind) });
};

/* A teammate's own WeChat: the code to send the workspace's WeChat account (it links their WeChat to them), whether
   they're linked, and unlinking. Any member, for themselves only; a new code needs the settings PIN when it's on, like
   linking a phone. */

const wechatRow = async (ws: string) => {
  const row = await findIntegration(ws, "wechat_bot" as unknown as Kind);
  return row && row.status === "connected" ? row : null;
};

const wechatLink: Action = async (c) => {
  const row = await wechatRow(c.ws);
  if (!row) throw new HttpError("not_connected", "An owner needs to connect the WeChat Official Account first.", "需要所有者先连接微信公众号。");
  const { data: pinOk } = await userClient(c.jwt).rpc("pin_ok");
  if (pinOk === false) throw new HttpError("forbidden", "Unlock settings with your PIN first.", "请先用设置 PIN 解锁。");
  const { data, error } = await admin.rpc("wechat_link_start", { p_ws: c.ws, p_uid: c.user.id });
  if (error) {
    if (/rate_limited/.test(error.message ?? "")) throw new HttpError("rate_limited", "That's 5 codes this hour. Try again later.", "本小时已获取 5 次验证码，请稍后再试。");
    throw new Error(`wechat link failed: ${error.code ?? ""}`);
  }
  const d = data as { code: string; expires_at: string };
  return ok({ code: d.code, expires_at: d.expires_at, account: row.account });
};

const wechatLinkStatus: Action = async (c) => {
  const row = await wechatRow(c.ws);
  const { data } = await admin.from("wechat_links").select("appid, linked_at, code_expires_at").eq("workspace_id", c.ws).eq("user_id", c.user.id).maybeSingle();
  const linked = !!row && !!data?.linked_at && data.appid === row.meta?.app_id;
  return ok({ connected: !!row, linked, linked_at: linked ? data!.linked_at : null, waiting: !!data?.code_expires_at && Date.parse(data.code_expires_at) > Date.now() });
};

const wechatUnlink: Action = async (c) => {
  const { error } = await admin.from("wechat_links").delete().eq("workspace_id", c.ws).eq("user_id", c.user.id);
  if (error) throw new Error(`wechat unlink failed: ${error.code ?? ""}`);
  await audit({ ...you(c), action: { en: "Unlinked their WeChat", zh: "取消关联了微信" }, object: BOT_NAMES.wechat_bot });
  return ok({ linked: false });
};

/* A teammate's own Telegram, the same way: a code to send the workspace's bot (or a t.me link that carries it), whether
   they're linked, and unlinking. Any member, for themselves only; the settings PIN when it's on. */

const telegramRow = async (ws: string) => {
  const row = await findIntegration(ws, "telegram_bot" as unknown as Kind);
  return row && row.status === "connected" ? row : null;
};

const telegramLink: Action = async (c) => {
  const row = await telegramRow(c.ws);
  if (!row) throw new HttpError("not_connected", "An owner needs to connect the Telegram bot first.", "需要所有者先连接 Telegram 机器人。");
  const { data: pinOk } = await userClient(c.jwt).rpc("pin_ok");
  if (pinOk === false) throw new HttpError("forbidden", "Unlock settings with your PIN first.", "请先用设置 PIN 解锁。");
  const { data, error } = await admin.rpc("telegram_link_start", { p_ws: c.ws, p_uid: c.user.id });
  if (error) {
    if (/rate_limited/.test(error.message ?? "")) throw new HttpError("rate_limited", "That's 5 codes this hour. Try again later.", "本小时已获取 5 次验证码，请稍后再试。");
    throw new Error(`telegram link failed: ${error.code ?? ""}`);
  }
  const d = data as { code: string; expires_at: string };
  const username = typeof row.meta?.username === "string" ? row.meta.username : "";
  return ok({ code: d.code, expires_at: d.expires_at, account: row.account, link: username ? tgDeepLink(username, d.code) : null });
};

const telegramLinkStatus: Action = async (c) => {
  const row = await telegramRow(c.ws);
  const { data } = await admin.from("telegram_links").select("bot_id, linked_at, code_expires_at").eq("workspace_id", c.ws).eq("user_id", c.user.id).maybeSingle();
  const linked = !!row && !!data?.linked_at && data.bot_id === row.meta?.bot_id;
  return ok({ connected: !!row, linked, linked_at: linked ? data!.linked_at : null, waiting: !!data?.code_expires_at && Date.parse(data.code_expires_at) > Date.now() });
};

const telegramUnlink: Action = async (c) => {
  const { error } = await admin.from("telegram_links").delete().eq("workspace_id", c.ws).eq("user_id", c.user.id);
  if (error) throw new Error(`telegram unlink failed: ${error.code ?? ""}`);
  await audit({ ...you(c), action: { en: "Unlinked their Telegram", zh: "取消关联了 Telegram" }, object: BOT_NAMES.telegram_bot });
  return ok({ linked: false });
};

// ------------------------------------------------------------------ sales and staff: Square and Toast

const POS: Kind[] = ["square", "toast"];

/** A point-of-sale problem as the person sees it. */
function posFail(e: unknown): never {
  if (e instanceof PosError) throw new HttpError(e.status === 404 ? "not_found" : e.status === 429 ? "rate_limited" : "upstream_error", e.message, e.zh);
  throw e;
}

function monthParam(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) throw new HttpError("bad_request", `${label} must be YYYY-MM.`);
  return v;
}
/** The months asked for: from_month to to_month, at most 3, none still to come; the last full month by default. */
function monthsOf(body: Record<string, unknown>): string[] {
  const to = monthParam(body.to_month, "to_month") ?? monthParam(body.from_month, "from_month") ?? lastFullMonth();
  const from = monthParam(body.from_month, "from_month") ?? to;
  if (from > to) throw new HttpError("bad_request", "from_month must come before to_month.");
  if (to > new Date().toISOString().slice(0, 7)) throw new HttpError("bad_request", "Months still to come have no sales yet.");
  const months = monthsBetween(from, to);
  if (months.length > 3) throw new HttpError("bad_request", "Ask for at most 3 months at a time.");
  return months;
}
/** The dates asked for: from to to, at most 28 days; the last 14 days by default. */
function rangeOf(body: Record<string, unknown>): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const to = body.to ? dateParam(body.to, "to") : today;
  const from = body.from ? dateParam(body.from, "from") : new Date(Date.parse(to + "T00:00:00Z") - 13 * 86_400_000).toISOString().slice(0, 10);
  if (from > to) throw new HttpError("bad_request", "from must come before to.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 27) throw new HttpError("bad_request", "Ask for at most 28 days at a time.");
  return { from, to };
}

/** Square calls go through the connection, which adds the token and renews it; the connection's own environment wins. */
const squareCall = (conn: Conn): Call => (url, init) => conn.call(url, init ?? {}, 30000);
const squareBaseOf = (conn: Conn) => conn.row.meta?.env === "sandbox" ? "https://connect.squareupsandbox.com" : conn.row.meta?.env === "production" ? "https://connect.squareup.com" : squareBase();

/** Toast's partner token, shared by every instance through the vault (server_tokens), one login at a time per instance. */
let toastCtxCache: ToastCtx | null = null;
function toastCtx(): ToastCtx {
  const { id, secret } = creds("toast");
  if (toastCtxCache) return toastCtxCache;
  const base = toastBase();
  const load = async (): Promise<SavedToken | null> => {
    const { data } = await admin.from("server_tokens").select("secret_id, expires_at, fetched_at").eq("name", "toast").maybeSingle();
    if (!data) return null;
    const { data: raw } = await admin.rpc("vault_get", { p_id: data.secret_id });
    return typeof raw === "string" && raw ? { token: raw, exp: Date.parse(data.expires_at), fetched_at: Date.parse(data.fetched_at) } : null;
  };
  const store = async (t: SavedToken) => {
    const { data } = await admin.from("server_tokens").select("secret_id").eq("name", "toast").maybeSingle();
    const { data: sid, error } = await admin.rpc("vault_put", { p_secret: t.token, p_name: "server:toast", ...(data?.secret_id ? { p_id: data.secret_id } : {}) });
    if (error || typeof sid !== "string") { console.error("toast token save", error?.code ?? ""); return; }
    await admin.from("server_tokens").upsert({ name: "toast", secret_id: sid, expires_at: new Date(t.exp).toISOString(), fetched_at: new Date(t.fetched_at).toISOString() });
  };
  toastCtxCache = { f: fetch, base, token: toastTokens({ f: fetch, base, clientId: id, clientSecret: secret, load, store }) };
  return toastCtxCache;
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // 32, none that read alike (no I, O, 0 or 1)
/** The workspace's code for Toast, made the first time it's asked for. */
async function toastCode(ws: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const { data } = await admin.from("pos_link_codes").select("toast_code").eq("workspace_id", ws).maybeSingle();
    if (data?.toast_code) return data.toast_code as string;
    const code = "PLACETTA-" + [...crypto.getRandomValues(new Uint8Array(8))].map((b) => CODE_LETTERS[b % 32]).join("");
    const { error } = await admin.from("pos_link_codes").insert({ workspace_id: ws, toast_code: code });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(`toast code failed: ${error.code ?? ""}`);
  }
  throw new Error("toast code failed");
}

/** What an owner types into Toast so Placetta can find their locations. */
const toastSetup: Action = async (c) => {
  creds("toast");
  return ok({ code: await toastCode(c.ws) });
};

/** Connect Toast: the locations that added Placetta in Toast and carry this workspace's code. */
const toastConnect: Action = async (c) => {
  creds("toast");
  const code = await toastCode(c.ws);
  const ctx = toastCtx();
  let found: ToastPlace[] = [];
  try { found = await toastMatches(ctx, code); } catch (e) { posFail(e); }
  if (!found.length) {
    throw new HttpError("not_found",
      `Placetta can't see a Toast location with your code yet. In Toast Web: Integrations, Browse & purchase integrations, add Placetta. Then Configure integrations, the gear next to Placetta, and type ${code} as the Location ID for each location. Check again after that.`,
      `快哉还看不到带有您验证码的 Toast 门店。请在 Toast Web 中：集成 → Browse & purchase integrations，添加快哉；再到 Configure integrations，点快哉旁边的齿轮，为每家门店在 Location ID 中填写 ${code}。完成后再检查一次。`);
  }
  const places = await Promise.all(found.slice(0, 25).map((p) => toastPlace(ctx, p)));
  const names = places.map((p) => [p.name, p.location].filter(Boolean).join(" "));
  const account = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
  const old = await findIntegration(c.ws, "toast");
  if (old) { await dropSecret(old.secret_id); await admin.from("integrations").delete().eq("id", old.id); }
  const { error } = await admin.from("integrations").insert({ workspace_id: c.ws, kind: "toast", account, scopes: "partner", status: "connected", secret_id: null, meta: { via: "toast_partner", restaurants: places }, connected_by: c.user.id });
  if (error) throw new Error(`integration insert failed: ${error.code ?? ""}`);
  await audit({ ...you(c), action: { en: "Connected Toast", zh: "已连接 Toast" }, object: NAMES.toast, detail: same(account) });
  return ok({ kind: "toast", account, locations: places.length });
};

/** The Toast locations saved with the connection, or the one asked for. */
async function toastPlaces(ws: string, only: string | null) {
  const row = await findIntegration(ws, "toast");
  if (!row) throw new HttpError("not_connected", "Connect Toast in Settings.", "请在设置中连接 Toast。");
  let places = (Array.isArray(row.meta?.restaurants) ? row.meta.restaurants as ToastPlace[] : []).filter((p) => p && /^[0-9a-f-]{36}$/i.test(String(p.guid)));
  if (only) {
    const k = only.toLowerCase();
    places = places.filter((p) => p.guid === only || [p.name, p.location, p.address].some((v) => String(v ?? "").toLowerCase().includes(k)));
  }
  if (!places.length) {
    throw new HttpError("not_found", only ? `No Toast location matches "${only}".` : "Toast has no locations connected. Connect Toast again in Settings.",
      only ? `没有与“${only}”匹配的 Toast 门店。` : "Toast 没有已连接的门店。请在设置中重新连接 Toast。");
  }
  return { row, places };
}

/** Monthly sales by location from Square or Toast, for sales-tax returns and fees that scale with sales. Owners only. */
const posSales: Action = async (c) => {
  const kind = await pickKind(c.ws, c.body.source, POS, "Connect Square or Toast in Settings.");
  const months = monthsOf(c.body), location = optText(c.body.location, "location", 120);
  const deadline = Date.now() + 50_000;
  try {
    if (kind === "square") {
      const conn = await openToRead(c, "square");
      const out = await squareSales(squareCall(conn), squareBaseOf(conn), SQUARE_VERSION(), months, { location, deadline });
      return ok({ source: "Square", account: conn.row.account, months, ...out });
    }
    const { row, places } = await toastPlaces(c.ws, location);
    const out = await toastSales(toastCtx(), places, months, { deadline });
    return ok({ source: "Toast", account: row.account, months, ...out });
  } catch (e) { posFail(e); }
};

/** The team from Square or Toast: who works, their schedules and the hours they worked with breaks, up to 28 days.
 *  Owners only: it's people's names, hours and emails. */
const posStaff: Action = async (c) => {
  const kind = await pickKind(c.ws, c.body.source, POS, "Connect Square or Toast in Settings.");
  const { from, to } = rangeOf(c.body), location = optText(c.body.location, "location", 120);
  try {
    if (kind === "square") {
      const conn = await openToRead(c, "square");
      return ok({ source: "Square", account: conn.row.account, from, to, ...(await squareStaff(squareCall(conn), squareBaseOf(conn), SQUARE_VERSION(), from, to, { location, deadline: Date.now() + 50_000 })) });
    }
    const { row, places } = await toastPlaces(c.ws, location);
    return ok({ source: "Toast", account: row.account, from, to, ...(await toastStaff(toastCtx(), places, from, to)) });
  } catch (e) { posFail(e); }
};

/** Which sign-in connections this server can offer now (each needs its provider's app keys). */
const available: Action = async () => {
  const has = (...v: string[]) => v.every((n) => !!Deno.env.get(n));
  const oauth = has("OAUTH_STATE_SECRET") && appOrigins().length > 0;
  return ok({
    google: oauth && has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
    microsoft: oauth && has("MS_CLIENT_ID", "MS_CLIENT_SECRET"),
    dropbox: oauth && has("DROPBOX_APP_KEY", "DROPBOX_APP_SECRET"),
    quickbooks: oauth && has("QB_CLIENT_ID", "QB_CLIENT_SECRET"),
    slack: oauth && has("SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"),
    square: oauth && has("SQUARE_CLIENT_ID", "SQUARE_CLIENT_SECRET"),
    // Toast has no redirect: Placetta's partner credentials are enough
    toast: has("TOAST_CLIENT_ID", "TOAST_CLIENT_SECRET"),
    // Google approves each project for the Business Profile APIs on request: offered only once GBP_API_APPROVED is set
    gbp: oauth && has("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") && Deno.env.get("GBP_API_APPROVED") === "1",
    clover: oauth && has("CLOVER_APP_ID", "CLOVER_APP_SECRET"),
    shopify: oauth && has("SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"),
    xero: oauth && has("XERO_CLIENT_ID", "XERO_CLIENT_SECRET"),
    // the business's own API key: nothing of Placetta's to register
    dropbox_sign: true,
  });
};

// ------------------------------------------------------------------ connect, disconnect, feed

const connect: Action = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack", "square", "gbp", "clover", "shopify", "xero"]);
  creds(PROVIDER[kind]);
  // Shopify signs in on the store's own address, which the owner types
  const shop = kind === "shopify" ? String(c.body.shop ?? "").trim().toLowerCase() : undefined;
  const origins = appOrigins();
  if (!origins.length) throw new HttpError("not_configured", "OAuth is not configured. Set APP_ORIGINS.");
  const ret = allowedReturn(c.body.return_to, origins) ?? `${origins[0]}/`;
  const state = await signState({ ws: c.ws, uid: c.user.id, kind, ret });
  return ok({ url: authorizeUrl(kind, state, { shop }) });
};

// ------------------------------------------------------------------ finish: bind a pending OAuth connection to its user

type Pending = {
  workspace_id: string;
  user_id: string;
  kind: string;
  secret_id: string;
  account: string | null;
  scopes: string | null;
  meta: Record<string, unknown> | null;
  expires_at: string;
};

const PENDING_ID = /^[0-9a-f]{64}$/;

/** Drop expired pending connections and their vault secrets. Best effort. */
async function sweepPending(): Promise<void> {
  const { data, error } = await admin.from("oauth_pending").delete().lt("expires_at", new Date().toISOString()).select("secret_id");
  if (error) {
    console.error("pending sweep failed:", error.code ?? "");
    return;
  }
  for (const r of (data ?? []) as { secret_id: string }[]) await dropSecret(r.secret_id);
}

const finish: Action = async (c) => {
  const id = typeof c.body.id === "string" ? c.body.id : "";
  if (!PENDING_ID.test(id)) throw new HttpError("bad_request", "id is not valid.");
  await sweepPending();

  // Claim the row by deleting it: only one caller can ever use a pending connection.
  const { data, error } = await admin
    .from("oauth_pending")
    .delete()
    .eq("id", id)
    .select("workspace_id, user_id, kind, secret_id, account, scopes, meta, expires_at");
  if (error) throw new Error(`pending claim failed: ${error.code ?? ""}`);
  const p = (data as Pending[] | null)?.[0];
  const gone = () => new HttpError("not_found", "This sign-in expired or was already used. Connect again.");
  if (!p) throw gone();
  if (Date.parse(p.expires_at) <= Date.now()) {
    await dropSecret(p.secret_id);
    throw gone();
  }

  let member = false;
  try {
    member = (await accessFor(c.ws, c.user, c.jwt)) === "owner";
  } catch (e) {
    await dropSecret(p.secret_id);
    throw e;
  }
  if (p.user_id !== c.user.id || p.workspace_id !== c.ws || !member || !(isKind(p.kind) || p.kind === "mcp")) {
    await dropSecret(p.secret_id);
    throw new HttpError("forbidden", "This connection was started by someone else. Connect again from Settings.");
  }
  // an app's own MCP server, signed in through oauth-callback: it becomes a connected server (mcp.ts)
  if (p.kind === "mcp") return await mcpFinish(c, p);

  const kind = p.kind;
  const existing = await findIntegration(c.ws, kind);
  const { error: upsertError } = await admin.from("integrations").upsert(
    {
      workspace_id: c.ws,
      kind,
      account: p.account,
      scopes: p.scopes,
      status: "connected",
      error: null,
      secret_id: p.secret_id,
      meta: p.meta ?? {},
      connected_by: c.user.id,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,kind" },
  );
  if (upsertError) {
    await dropSecret(p.secret_id);
    throw new Error(`integration upsert failed: ${upsertError.code ?? ""}`);
  }
  // The new tokens are in place: drop the ones they replaced.
  if (existing?.secret_id && existing.secret_id !== p.secret_id) await dropSecret(existing.secret_id);

  await audit({
    ...you(c),
    action: { en: `Connected ${NAMES[kind].en}`, zh: `已连接 ${NAMES[kind].zh}` },
    object: NAMES[kind],
    detail: p.account ? same(p.account) : null,
  });
  return ok({ kind, account: p.account });
};

const disconnect: Action = async (c) => {
  const kind = (isHookKind(c.body.kind) || isBotKind(c.body.kind) ? c.body.kind : kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack", "square", "toast", "gbp", "clover", "shopify", "xero", "dropbox_sign"])) as Kind;
  const name = isBotKind(kind) ? BOT_NAMES[kind as BotKind] : isHookKind(kind) ? HOOK_NAMES[kind as HookKind] : NAMES[kind];
  const row = await findIntegration(c.ws, kind);
  if (!row) throw new HttpError("not_found", `${name.en} is not connected.`);
  if (row.meta?.via !== "link" && row.meta?.via !== "bot") await revoke(row);
  // Telegram: stop the bot sending here before its token is dropped (best effort: the secret goes with it anyway)
  if ((kind as string) === "telegram_bot") { const tg = await telegramBot(admin, c.ws).catch(() => null); if (tg) await tgDeleteWebhook(tg.bot_token).catch(() => false); }
  const { error } = await admin.from("integrations").delete().eq("id", row.id);
  if (error) throw new Error(`integration delete failed: ${error.code ?? ""}`);
  await dropSecret(row.secret_id);
  // the teammates' WeChat links go with the account (a new account means new OpenIDs anyway)
  if ((kind as string) === "wechat_bot") await admin.from("wechat_links").delete().eq("workspace_id", c.ws);
  if ((kind as string) === "telegram_bot") await admin.from("telegram_links").delete().eq("workspace_id", c.ws);
  await audit({
    ...you(c),
    action: { en: `Disconnected ${name.en}`, zh: `已断开 ${name.zh}` },
    object: name,
    detail: row.account ? same(row.account) : null,
  });
  return ok();
};

const feedUrl: Action = async (c) => {
  const rotate = c.body.rotate === true;
  const { data, error } = await userClient(c.jwt).rpc("calendar_token", { ws: c.ws, p_rotate: rotate });
  if (error || typeof data !== "string") {
    console.error("calendar_token failed:", error?.code ?? "");
    if (/not your workspace/i.test(error?.message ?? "")) throw new HttpError("forbidden", "You are not a member of this workspace.");
    if (/only an owner/i.test(error?.message ?? "")) throw new HttpError("forbidden", "Only an owner can reset the calendar link.");
    throw new Error("calendar_token failed");
  }
  if (rotate) {
    await audit({
      ...you(c),
      action: { en: "Reset the calendar feed link", zh: "重置了日历订阅链接" },
      object: { en: "Calendar feed", zh: "日历订阅" },
    });
  }
  return ok({ url: `${SUPABASE_URL}/functions/v1/calendar-feed?t=${enc(data)}` });
};

// ------------------------------------------------------------------ store locations, the company's profile, e-signature

/** Where store locations come from: Google Business Profile, Clover, Shopify, Square (places.ts). */
const PLACE_KINDS: Kind[] = ["gbp", "clover", "shopify", "square"];

/** The business's store locations from every connected app that keeps them (or the one asked for): name, address,
 *  phone and, from Google Business Profile, regular hours. Read only. An owner, or the member who connected the app. */
const placesRead: Action = async (c) => {
  const only = c.body.source === undefined || c.body.source === null || c.body.source === "" ? null : kindParam(c.body.source, PLACE_KINDS);
  const rows = (await listIntegrations(c.ws, only ? [only] : PLACE_KINDS)).filter((r) => mayRead(c.access, r, c.user.id));
  if (!rows.length) throw new HttpError("not_connected", "Connect Google Business Profile, Clover, Shopify or Square in Settings.", "请在设置中连接 Google 商家资料、Clover、Shopify 或 Square。");
  const places: Place[] = [], read: string[] = [], failed: string[] = [];
  for (const row of rows) {
    try {
      const conn = await Conn.fromRow(row);
      const call: Call = (url, init) => conn.call(url, init ?? {}, 30000);
      if (row.kind === "gbp") places.push(...await gbpPlaces(call));
      else if (row.kind === "clover") places.push(...await cloverPlaces(call, row.meta?.env === "sandbox" ? "https://apisandbox.dev.clover.com" : cloverApi(), String(row.meta?.merchant_id ?? "")));
      else if (row.kind === "shopify") places.push(...await shopifyPlaces(call, String(row.meta?.shop ?? ""), SHOPIFY_VERSION()));
      else if (row.kind === "square") places.push(...await squarePlaces(call, squareBaseOf(conn), SQUARE_VERSION()));
      read.push(NAMES[row.kind].en);
    } catch (e) {
      if (rows.length === 1) posFail(e);
      console.error(`${row.kind} places failed:`, e instanceof Error ? e.message.slice(0, 80) : "");
      failed.push(NAMES[row.kind].en);
    }
  }
  return ok({ places: places.slice(0, 200), read, ...(failed.length ? { failed } : {}) });
};

/** The company's own record in Xero: legal name, addresses, phone, tax and registration numbers. Read only. */
const companyProfile: Action = async (c) => {
  const conn = await openToRead(c, "xero");
  const tenant = String(conn.row.meta?.tenant_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(tenant)) throw new HttpError("not_connected", "Reconnect Xero in Settings.", "请在设置中重新连接 Xero。");
  try {
    return ok({ profile: await xeroProfile((url, init) => conn.call(url, init ?? {}, 30000), tenant) });
  } catch (e) { posFail(e); }
};

function signFail(e: unknown): never {
  if (e instanceof SignError) throw new HttpError(e.status === 400 ? "bad_request" : e.status === 401 ? "not_connected" : "upstream_error", e.message, e.zh);
  throw e;
}
/** The business's Dropbox Sign API key, from the vault. */
async function signKey(ws: string): Promise<{ key: string; row: NonNullable<Awaited<ReturnType<typeof findIntegration>>> }> {
  const row = await findIntegration(ws, "dropbox_sign");
  const key = row ? (await readBundle(row.secret_id))?.access_token ?? "" : "";
  if (!row || !key) throw new HttpError("not_connected", "Connect Dropbox Sign in Settings.", "请在设置中连接 Dropbox Sign。");
  return { key, row };
}
const signTest = () => Deno.env.get("DROPBOX_SIGN_TEST_MODE") === "1";

/** Connect Dropbox Sign with the business's own API key (Dropbox Sign, Settings, API). Checked before it's kept. Owners. */
const esignConnect: Action = async (c) => {
  const key = typeof c.body.api_key === "string" ? c.body.api_key.trim() : "";
  if (!/^[A-Za-z0-9]{32,128}$/.test(key)) throw new HttpError("bad_request", "Paste the API key from Dropbox Sign: Settings, API.", "请粘贴 Dropbox Sign 的 API 密钥：设置 → API。");
  let account: string | null = null;
  try { account = await dsAccount(fetch, key); } catch (e) { signFail(e); }
  const old = await findIntegration(c.ws, "dropbox_sign");
  const secret = await writeBundle({ access_token: key, refresh_token: null, expires_at: null, token_type: "api_key" }, `integration:dropbox_sign:${c.ws}`, old?.secret_id ?? null);
  const { error } = await admin.from("integrations").upsert({ workspace_id: c.ws, kind: "dropbox_sign", account, scopes: "api_key", status: "connected", error: null, secret_id: secret, meta: { via: "api_key" }, connected_by: c.user.id, connected_at: new Date().toISOString() }, { onConflict: "workspace_id,kind" });
  if (error) throw new Error(`integration upsert failed: ${error.code ?? ""}`);
  await audit({ ...you(c), action: { en: "Connected Dropbox Sign", zh: "已连接 Dropbox Sign" }, object: NAMES.dropbox_sign, detail: account ? same(account) : null });
  return ok({ kind: "dropbox_sign", account });
};

/** Send one document from Documents for signature. An owner's click is the approval; nothing goes out otherwise. */
const esignSend: Action = async (c) => {
  const { key } = await signKey(c.ws);
  const [file] = await loadAttachments(c.ws, [{ path: c.body.path }]);
  const title = text(c.body.title, "title", 1, 200);
  try {
    const signers = checkSend({ title, signers: c.body.signers, file });
    const st = await dsSend(fetch, key, { title, subject: optText(c.body.subject, "subject", 200) ?? undefined, message: optText(c.body.message, "message", 2000) ?? undefined, signers, file, test: signTest() });
    await audit({ ...you(c), action: { en: `Sent ${file.name} for signature with Dropbox Sign`, zh: `已通过 Dropbox Sign 发送 ${file.name} 签署` }, object: NAMES.dropbox_sign, detail: same(signers.map((x) => x.email).join(", ")) });
    return ok({ request: st, test_mode: signTest() });
  } catch (e) { signFail(e); }
};

/** Where a signature request stands: each signer's status and when they signed. */
const esignStatus: Action = async (c) => {
  const { key } = await signKey(c.ws);
  try { return ok({ request: await dsStatus(fetch, key, typeof c.body.id === "string" ? c.body.id : "") }); } catch (e) { signFail(e); }
};

// ------------------------------------------------------------------ router

const ACTIONS: Record<string, Action> = {
  connect,
  finish,
  disconnect,
  calendar_add: calendarAdd,
  mail_search: mailSearch,
  mail_read: mailRead,
  mail_send: mailSend,
  files_search: filesSearch,
  files_import: filesImport,
  books_income: booksIncome,
  slack_post: slackPost,
  hook_connect: hookConnect,
  bot_setup: botSetup,
  bot_connect: botConnect,
  wechat_link: wechatLink,
  wechat_link_status: wechatLinkStatus,
  wechat_unlink: wechatUnlink,
  telegram_link: telegramLink,
  telegram_link_status: telegramLinkStatus,
  telegram_unlink: telegramUnlink,
  toast_setup: toastSetup,
  toast_connect: toastConnect,
  pos_sales: posSales,
  pos_staff: posStaff,
  places_read: placesRead,
  company_profile: companyProfile,
  esign_connect: esignConnect,
  esign_send: esignSend,
  esign_status: esignStatus,
  available,
  feed_url: feedUrl,
  ...MCP_ACTIONS,
};

/** What only an owner can do: connect or disconnect an account, send mail or Slack posts as the business, and read
 *  sales and staff from Square or Toast. */
const OWNER_ONLY = new Set<Action>([connect, disconnect, mailSend, slackPost, hookConnect, botSetup, botConnect, toastSetup, toastConnect, posSales, posStaff, esignConnect, esignSend,
  // and for an app's own MCP server: connecting, refreshing, switching tools, disconnecting, approving and declining
  ...MCP_OWNER_ACTIONS.map((a) => MCP_ACTIONS[a])]);

serve(async (req) => {
  const mk = req.headers.get("x-monitor-key");
  if (mk) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: mk });
    if (good !== true) throw new HttpError("unauthorized", "Wrong monitor key.");
    const body = await readBody(req);
    // agent-run, for a request that came by text, call, email or chat: reads from connected apps (mcp.ts mcpRemote)
    if (body.action === "mcp_tools" || body.action === "mcp_call") return await mcpRemote(body);
    if (body.action !== "mail_watch") throw new HttpError("bad_request", "The monitor may only watch mail.");
    return await mailWatch();
  }
  if (await fromFiler(req)) {
    const body = await readBody(req);
    if (body.action !== "mail_send") throw new HttpError("bad_request", "The filer may only send mail.");
    return await filerMailSend(body);
  }
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) throw new HttpError("bad_request", `Unknown action. Use one of: ${Object.keys(ACTIONS).join(", ")}.`);
  // finish checks access itself, after claiming the pending row, so a mismatch also discards it. The actions that read
  // a connected account (mail, files, books) let a member through only to what they connected (openToRead).
  const access = action === finish ? "" : await requireAccess(ws, user, jwt, OWNER_ONLY.has(action) ? "owner" : "member");
  return await action({ user, jwt, ws, body, access });
});
