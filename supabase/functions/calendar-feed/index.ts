// calendar-feed: a workspace's deadlines as an iCalendar (RFC 5545) subscription.
// GET ?t=<token>&lang=en|zh. Deployed with verify_jwt off: the unguessable token is the credential.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const fail = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

type Bi = { en?: string; zh?: string } | string | null | undefined;
type Deadline = { id?: unknown; date?: unknown; kind?: unknown; title?: Bi; agency?: Bi };

const pick = (v: Bi, lang: "en" | "zh"): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return (lang === "zh" ? v.zh || v.en : v.en || v.zh) ?? "";
};

/** TEXT escaping (RFC 5545 3.3.11). */
const esc = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");

const enc = new TextEncoder();

/** Fold a content line at 75 octets without splitting a UTF-8 character (RFC 5545 3.1). */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = " ";
      bytes = 1;
      limit = 75;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n");
}

function dateParts(v: unknown): [number, number, number] | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? [y, m, d] : null;
}

const basicDate = (t: Date): string => t.toISOString().slice(0, 10).replace(/-/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") return fail(400, "bad_request", "Use GET.");

  const q = new URL(req.url).searchParams;
  const token = q.get("t") ?? "";
  const lang: "en" | "zh" = q.get("lang") === "zh" ? "zh" : "en";
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return fail(404, "not_found", "Calendar feed not found.");

  const { data: feed, error: feedError } = await admin.from("calendar_feeds").select("workspace_id").eq("token", token).maybeSingle();
  if (feedError) {
    console.error("feed lookup failed:", feedError.code ?? "");
    return fail(500, "internal", "Something went wrong. Try again.");
  }
  if (!feed) return fail(404, "not_found", "Calendar feed not found.");

  const { data: ws, error: wsError } = await admin.from("workspaces").select("name, state").eq("id", feed.workspace_id).maybeSingle();
  if (wsError) {
    console.error("workspace lookup failed:", wsError.code ?? "");
    return fail(500, "internal", "Something went wrong. Try again.");
  }
  if (!ws) return fail(404, "not_found", "Calendar feed not found.");

  const deadlines: Deadline[] = Array.isArray(ws.state?.deadlines) ? ws.state.deadlines : [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const calName = `Placetta: ${ws.name}`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Placetta//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const d of deadlines) {
    if (!d || typeof d !== "object") continue;
    const parts = dateParts(d.date);
    const id = typeof d.id === "string" || typeof d.id === "number" ? String(d.id) : "";
    if (!parts || !id) continue;
    const [y, m, day] = parts;
    const start = new Date(Date.UTC(y, m - 1, day));
    const end = new Date(Date.UTC(y, m - 1, day + 1));
    const summary = pick(d.title, lang) || (lang === "zh" ? "截止日期" : "Deadline");
    const agency = pick(d.agency, lang);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(id)}@placetta.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${basicDate(start)}`,
      `DTEND;VALUE=DATE:${basicDate(end)}`,
      `SUMMARY:${esc(summary)}`,
    );
    if (agency) lines.push(`DESCRIPTION:${esc(agency)}`);
    lines.push("TRANSP:TRANSPARENT");
    if (d.kind === "due" || d.kind === "renewal") {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(summary)}`, "TRIGGER:-P3D", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");

  const body = lines.map(fold).join("\r\n") + "\r\n";
  return new Response(req.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="placetta-deadlines.ics"',
      "Cache-Control": "private, max-age=900",
    },
  });
});
