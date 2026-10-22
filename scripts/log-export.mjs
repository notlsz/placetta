#!/usr/bin/env node
/* Copies Supabase's platform logs out of Supabase before they expire there (1 day on Free, 7 on Pro), so a year of
   them can be kept for investigations: docs/soc2/runbooks/log-retention.md.
   It reads the Management API's log query endpoint (GET /v1/projects/{ref}/analytics/endpoints/logs, ClickHouse SQL on
   the unified `logs` table; at most 24 hours per call, times rounded to the minute; the older logs.all endpoint now
   answers 410 Gone), one source at a time, in pages, and writes each source's
   events for each hour to <out>/<source>/YYYY/MM/DD/HH.ndjson.gz, one JSON event per line, plus a manifest.json with
   the count and SHA-256 of every file. The scheduled workflow (.github/workflows/log-export.yml) uploads the folder to
   storage outside Supabase with a 1-year lock.

   Usage:
     SUPABASE_ACCESS_TOKEN=... node scripts/log-export.mjs --out ./logs                  the hour that ended an hour ago
     SUPABASE_ACCESS_TOKEN=... node scripts/log-export.mjs --out ./logs --from 2026-10-21T00:00Z --to 2026-10-22T00:00Z
     node scripts/log-export.mjs --dry-run                                                 what it would ask for
   Options: --project-ref (default esquxzcfsylffuijvzec), --sources a,b (default: the auth, function and API gateway
   sources below), --page 1000 (rows per call).
   The token needs only the analytics_logs_read permission. Nothing is written to Supabase. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

export const DEFAULT_SOURCES = ["auth_logs", "auth_audit_logs", "function_edge_logs", "function_logs", "edge_logs"];
export const KNOWN_SOURCES = new Set([...DEFAULT_SOURCES, "postgres_logs", "postgrest_logs", "storage_logs", "realtime_logs",
  "supavisor_logs", "pgbouncer_logs", "pg_upgrade_logs"]);
const HOUR = 3_600_000;

/** The whole hours covering [from, to): each a [start, end) pair of Dates. Both ends must sit on the hour. */
export function hours(from, to) {
  const a = from.getTime(), b = to.getTime();
  if (a % HOUR || b % HOUR) throw new Error("--from and --to must be on the hour (UTC)");
  if (b <= a) throw new Error("--to must be after --from");
  const out = [];
  for (let t = a; t < b; t += HOUR) out.push([new Date(t), new Date(t + HOUR)]);
  return out;
}

/** The default window: the hour that ended one hour before now, so late-arriving events are in. */
export function defaultWindow(now = new Date()) {
  const end = Math.floor(now.getTime() / HOUR) * HOUR - HOUR;
  return [new Date(end - HOUR), new Date(end)];
}

/** One page of one source. The source is checked against the known names, never pasted from input as-is. */
export function pageSql(source, limit, offset) {
  if (!KNOWN_SOURCES.has(source)) throw new Error(`unknown log source: ${source}`);
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("page size must be 1 to 10000");
  if (!Number.isInteger(offset) || offset < 0) throw new Error("bad offset");
  return `select id, timestamp, source, severity_text, event_message, log_attributes from logs where source = '${source}' order by timestamp asc, id asc limit ${limit} offset ${offset}`;
}

/** Every event of one source in one window, page by page. fetchImpl is injectable for tests. */
export async function fetchWindow({ ref, token, source, start, end, page = 1000, fetchImpl = fetch, maxPages = 500 }) {
  const rows = [];
  for (let p = 0; p < maxPages; p++) {
    const q = new URLSearchParams({ sql: pageSql(source, page, p * page), iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() });
    const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/analytics/endpoints/logs?${q}`;
    let res, attempt = 0;
    for (;;) {
      res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (res.status !== 429 && res.status < 500) break;
      if (++attempt > 4) throw new Error(`${source}: HTTP ${res.status} after ${attempt} tries`);
      await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt)));
    }
    if (!res.ok) throw new Error(`${source}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    if (body.error) throw new Error(`${source}: ${typeof body.error === "string" ? body.error : JSON.stringify(body.error).slice(0, 200)}`);
    const got = Array.isArray(body.result) ? body.result : [];
    rows.push(...got);
    if (got.length < page) return rows;
  }
  throw new Error(`${source}: more than ${maxPages} pages in one hour; narrow --page or split the window`);
}

/** Where one source's hour is written. */
export function filePath(out, source, start) {
  const iso = start.toISOString();
  return join(out, source, iso.slice(0, 4), iso.slice(5, 7), iso.slice(8, 10), `${iso.slice(11, 13)}.ndjson.gz`);
}

export function parseArgs(argv) {
  const o = { out: null, ref: "esquxzcfsylffuijvzec", sources: DEFAULT_SOURCES, page: 1000, dry: false, from: null, to: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => { const x = argv[++i]; if (x === undefined) throw new Error(`${a} needs a value`); return x; };
    if (a === "--out") o.out = v();
    else if (a === "--project-ref") o.ref = v();
    else if (a === "--sources") o.sources = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--page") o.page = Number(v());
    else if (a === "--from") o.from = new Date(v());
    else if (a === "--to") o.to = new Date(v());
    else if (a === "--dry-run") o.dry = true;
    else throw new Error(`unknown option ${a}`);
  }
  for (const s of o.sources) if (!KNOWN_SOURCES.has(s)) throw new Error(`unknown log source: ${s}`);
  if (!/^[a-z0-9]{20}$/.test(o.ref)) throw new Error("--project-ref looks wrong");
  if ((o.from && isNaN(o.from)) || (o.to && isNaN(o.to))) throw new Error("--from and --to must be ISO times");
  if (!o.from !== !o.to) throw new Error("give both --from and --to, or neither");
  return o;
}

export async function run(argv, env = process.env, fetchImpl = fetch, log = console.log) {
  const o = parseArgs(argv);
  const [from, to] = o.from ? [o.from, o.to] : defaultWindow();
  const windows = hours(from, to);
  if (o.dry) {
    for (const s of o.sources) log(`${s}: ${windows.length} hour(s) from ${from.toISOString()} to ${to.toISOString()}; first page: ${pageSql(s, o.page, 0)}`);
    return { files: [], dry: true };
  }
  if (!o.out) throw new Error("--out is required");
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is not set");
  const files = [];
  for (const s of o.sources) {
    for (const [start, end] of windows) {
      const rows = await fetchWindow({ ref: o.ref, token, source: s, start, end, page: o.page, fetchImpl });
      const text = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
      const gz = gzipSync(Buffer.from(text, "utf8"));
      const path = filePath(o.out, s, start);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, gz);
      files.push({ source: s, start: start.toISOString(), end: end.toISOString(), events: rows.length, file: path.slice(o.out.length + 1),
        sha256: createHash("sha256").update(gz).digest("hex") });
      log(`${s} ${start.toISOString()}: ${rows.length} events`);
    }
  }
  const manifest = { exported_at: new Date().toISOString(), project_ref: o.ref, from: from.toISOString(), to: to.toISOString(), files };
  const name = `manifest-${from.toISOString().replace(/[:]/g, "").slice(0, 15)}Z.json`;
  writeFileSync(join(o.out, name), JSON.stringify(manifest, null, 2) + "\n");
  // The token must never end up in what is kept.
  const all = JSON.stringify(manifest);
  if (all.includes(token)) throw new Error("the token appeared in the output; nothing should be uploaded");
  return { files, manifest: name };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((e) => { console.error(`log-export: ${e.message}`); process.exit(1); });
}
