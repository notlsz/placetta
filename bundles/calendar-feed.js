var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dep:npm:@supabase/supabase-js@2
var require_supabase_js_2 = __commonJS({
  "dep:npm:@supabase/supabase-js@2"(exports, module) {
    module.exports = globalThis.__placettaDeps["npm:@supabase/supabase-js@2"];
  }
});

// ../../../../../../home/claude/placetta-agent/supabase/functions/calendar-feed/index.ts
var import_supabase_js_2 = __toESM(require_supabase_js_2(), 1);
var admin = (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var fail = (status, code, message) => new Response(JSON.stringify({ error: { code, message } }), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
var pick = (v, lang) => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return (lang === "zh" ? v.zh || v.en : v.en || v.zh) ?? "";
};
var esc = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n?|\n/g, "\\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
var enc = new TextEncoder();
function fold(line) {
  const out = [];
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
function dateParts(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? [y, m, d] : null;
}
var basicDate = (t) => t.toISOString().slice(0, 10).replace(/-/g, "");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET" && req.method !== "HEAD") return fail(400, "bad_request", "Use GET.");
  const q = new URL(req.url).searchParams;
  const token = q.get("t") ?? "";
  const lang = q.get("lang") === "zh" ? "zh" : "en";
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
  const deadlines = Array.isArray(ws.state?.deadlines) ? ws.state.deadlines : [];
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const calName = `Placetta: ${ws.name}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Placetta//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H"
  ];
  for (const d of deadlines) {
    if (!d || typeof d !== "object") continue;
    const parts = dateParts(d.date);
    const id = typeof d.id === "string" || typeof d.id === "number" ? String(d.id) : "";
    if (!parts || !id) continue;
    const [y, m, day] = parts;
    const start = new Date(Date.UTC(y, m - 1, day));
    const end = new Date(Date.UTC(y, m - 1, day + 1));
    const summary = pick(d.title, lang) || (lang === "zh" ? "\u622A\u6B62\u65E5\u671F" : "Deadline");
    const agency = pick(d.agency, lang);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(id)}@placetta.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${basicDate(start)}`,
      `DTEND;VALUE=DATE:${basicDate(end)}`,
      `SUMMARY:${esc(summary)}`
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
      "Cache-Control": "private, max-age=900"
    }
  });
});
