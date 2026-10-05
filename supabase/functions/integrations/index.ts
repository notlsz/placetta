// integrations: connect and use the customer's mail, calendar, files, books and Slack.
// POST {workspace_id, action, ...}. Members of the workspace; owners only to connect, disconnect or send mail.
import type { User } from "npm:@supabase/supabase-js@2";
import {
  admin,
  allowedReturn,
  appOrigins,
  audit,
  b64urlDecode,
  b64urlEncode,
  HttpError,
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
  userClient,
  utf8,
  uuidParam,
} from "./shared.ts";
import {
  authorizeUrl,
  Conn,
  creds,
  dropSecret,
  findIntegration,
  isKind,
  type Kind,
  listIntegrations,
  NAMES,
  PROVIDER,
  qbApiBase,
  revoke,
} from "./providers.ts";

type Ctx = { user: User; jwt: string; ws: string; body: Record<string, unknown> };
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
  const rows = await listIntegrations(c.ws, ["gmail", "outlook_mail"]);
  if (!rows.length) throw new HttpError("not_connected", "Connect Gmail or Outlook in Settings.");
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
  const conn = await Conn.open(c.ws, kind);

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

const mailSend: Action = async (c) => {
  if (c.body.approved !== true) throw new HttpError("bad_request", "The customer must approve this message before it is sent.");
  const to = recipients(c.body.to);
  const subject = text(c.body.subject, "subject", 1, 300).replace(/[\r\n]+/g, " ");
  if (typeof c.body.body !== "string" || !c.body.body.trim()) throw new HttpError("bad_request", "body is required.");
  if (c.body.body.length > 50000) throw new HttpError("bad_request", "body is too long (at most 50000 characters).");
  const content = c.body.body.replace(/\r\n?/g, "\n");
  const kind = await pickKind(c.ws, c.body.kind, ["gmail", "outlook_mail"], "Connect Gmail or Outlook in Settings.");
  const conn = await Conn.open(c.ws, kind);

  if (kind === "gmail") {
    const mime = [
      `To: ${to.join(", ")}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(utf8(content.replace(/\n/g, "\r\n"))),
    ].join("\r\n");
    await conn.callJson(`${GMAIL}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: b64urlEncode(utf8(mime)) }),
    });
  } else {
    await conn.callJson(`${GRAPH}/me/sendMail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { subject, body: { contentType: "Text", content }, toRecipients: to.map((address) => ({ emailAddress: { address } })) },
        saveToSentItems: true,
      }),
    });
  }

  const list = to.join(", ");
  const via = conn.row.account ? ` (${conn.row.account})` : "";
  await audit({
    ...you(c),
    action: { en: `Sent email to ${list}`, zh: `已发送邮件至 ${list}` },
    object: same(subject),
    detail: { en: `Via ${NAMES[kind].en}${via}`, zh: `通过 ${NAMES[kind].zh}${via}` },
  });
  return ok({ kind });
};

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
  const conn = await Conn.open(c.ws, kind);
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
  const conn = await Conn.open(c.ws, kind);

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
  const conn = await Conn.open(c.ws, "quickbooks");
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
  const hook = conn.bundle.webhook_url;
  if (!hook || !hook.startsWith("https://hooks.slack.com/")) {
    await conn.markError("The Slack channel link is missing. Reconnect in Settings.");
    throw new HttpError("not_connected", "Reconnect Slack in Settings.");
  }
  let res: Response;
  try {
    res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new HttpError("upstream_error", "Slack did not respond. Try again.");
  }
  const reply = (await res.text()).slice(0, 80);
  if (res.ok) return ok();
  console.error(`slack webhook ${res.status}:`, reply);
  if ([403, 404, 410].includes(res.status)) {
    await conn.markError("The Slack channel is no longer available. Reconnect in Settings.");
    throw new HttpError("not_connected", "Reconnect Slack in Settings.");
  }
  throw new HttpError("upstream_error", `Slack returned an error (${res.status}). Try again.`);
};

// ------------------------------------------------------------------ connect, disconnect, feed

const connect: Action = async (c) => {
  const kind = kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"]);
  creds(PROVIDER[kind]);
  const origins = appOrigins();
  if (!origins.length) throw new HttpError("not_configured", "OAuth is not configured. Set APP_ORIGINS.");
  const ret = allowedReturn(c.body.return_to, origins) ?? `${origins[0]}/`;
  const state = await signState({ ws: c.ws, uid: c.user.id, kind, ret });
  return ok({ url: authorizeUrl(kind, state) });
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
  if (p.user_id !== c.user.id || p.workspace_id !== c.ws || !member || !isKind(p.kind)) {
    await dropSecret(p.secret_id);
    throw new HttpError("forbidden", "This connection was started by someone else. Connect again from Settings.");
  }

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
  const kind = kindParam(c.body.kind, ["gmail", "gcal", "gdrive", "outlook_mail", "outlook_cal", "dropbox", "quickbooks", "slack"]);
  const row = await findIntegration(c.ws, kind);
  if (!row) throw new HttpError("not_found", `${NAMES[kind].en} is not connected.`);
  await revoke(row);
  const { error } = await admin.from("integrations").delete().eq("id", row.id);
  if (error) throw new Error(`integration delete failed: ${error.code ?? ""}`);
  await dropSecret(row.secret_id);
  await audit({
    ...you(c),
    action: { en: `Disconnected ${NAMES[kind].en}`, zh: `已断开 ${NAMES[kind].zh}` },
    object: NAMES[kind],
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
  feed_url: feedUrl,
};

/** What only an owner can do: connect or disconnect an account, and send mail or Slack posts as the business. */
const OWNER_ONLY = new Set<Action>([connect, disconnect, mailSend, slackPost]);

serve(async (req) => {
  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = typeof body.action === "string" && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
  if (!action) throw new HttpError("bad_request", `Unknown action. Use one of: ${Object.keys(ACTIONS).join(", ")}.`);
  // finish checks access itself, after claiming the pending row, so a mismatch also discards it.
  if (action !== finish) await requireAccess(ws, user, jwt, OWNER_ONLY.has(action) ? "owner" : "member");
  return await action({ user, jwt, ws, body });
});
