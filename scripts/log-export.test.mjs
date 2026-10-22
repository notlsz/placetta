// Tests for scripts/log-export.mjs, against a stand-in for the Management API. Run: node --test scripts/log-export.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { defaultWindow, fetchWindow, filePath, hours, pageSql, parseArgs, run } from "./log-export.mjs";

const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

test("hours are whole UTC hours, and both ends must sit on the hour", () => {
  const h = hours(new Date("2026-10-21T22:00:00Z"), new Date("2026-10-22T01:00:00Z"));
  assert.deepEqual(h.map(([a]) => a.toISOString()), ["2026-10-21T22:00:00.000Z", "2026-10-21T23:00:00.000Z", "2026-10-22T00:00:00.000Z"]);
  assert.throws(() => hours(new Date("2026-10-21T22:30:00Z"), new Date("2026-10-22T01:00:00Z")), /on the hour/);
  assert.throws(() => hours(new Date("2026-10-22T01:00:00Z"), new Date("2026-10-22T01:00:00Z")), /after/);
});

test("the default window is the hour that ended an hour ago", () => {
  const [a, b] = defaultWindow(new Date("2026-10-22T05:42:10Z"));
  assert.equal(a.toISOString(), "2026-10-22T03:00:00.000Z");
  assert.equal(b.toISOString(), "2026-10-22T04:00:00.000Z");
});

test("only known sources reach the SQL, and paging values are checked", () => {
  assert.match(pageSql("auth_logs", 1000, 2000), /where source = 'auth_logs' order by timestamp asc, id asc limit 1000 offset 2000$/);
  assert.throws(() => pageSql("auth_logs' or 1=1 --", 10, 0), /unknown log source/);
  assert.throws(() => pageSql("auth_logs", 0, 0), /page size/);
  assert.throws(() => pageSql("auth_logs", 10, -1), /offset/);
  assert.throws(() => parseArgs(["--sources", "auth_logs,secrets"]), /unknown log source/);
  assert.throws(() => parseArgs(["--project-ref", "../x"]), /project-ref/);
  assert.throws(() => parseArgs(["--from", "2026-10-21T00:00Z"]), /both/);
});

test("pages until a short page, asks for the window, and sends the token only in the header", async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url: new URL(url), auth: init.headers.Authorization });
    const off = Number(/offset (\d+)/.exec(new URL(url).searchParams.get("sql"))[1]);
    const n = off === 0 ? 2 : off === 2 ? 2 : 1;
    return res(200, { result: Array.from({ length: n }, (_, i) => ({ id: `e${off + i}`, event_message: "m" })) });
  };
  const rows = await fetchWindow({ ref: "esquxzcfsylffuijvzec", token: "sbp_secret", source: "function_logs",
    start: new Date("2026-10-22T03:00:00Z"), end: new Date("2026-10-22T04:00:00Z"), page: 2, fetchImpl: fake });
  assert.equal(rows.length, 5);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url.pathname, "/v1/projects/esquxzcfsylffuijvzec/analytics/endpoints/logs");
  assert.equal(calls[0].url.searchParams.get("iso_timestamp_start"), "2026-10-22T03:00:00.000Z");
  assert.equal(calls[0].url.searchParams.get("iso_timestamp_end"), "2026-10-22T04:00:00.000Z");
  assert.ok(calls.every((c) => c.auth === "Bearer sbp_secret" && !c.url.href.includes("sbp_secret")));
});

test("retries on 429 and 5xx, then gives up; an error in the body fails the export", async () => {
  let n = 0;
  const flaky = async () => (++n < 2 ? res(429, {}) : res(200, { result: [] }));
  const w = { ref: "esquxzcfsylffuijvzec", token: "t", source: "auth_logs", start: new Date(0), end: new Date(3_600_000) };
  assert.deepEqual(await fetchWindow({ ...w, fetchImpl: flaky }), []);
  await assert.rejects(fetchWindow({ ...w, fetchImpl: async () => res(200, { error: "bad query" }) }), /bad query/);
  await assert.rejects(fetchWindow({ ...w, fetchImpl: async () => res(403, { message: "no" }) }), /HTTP 403/);
});

test("writes one gzipped NDJSON file per source and hour, with a manifest of counts and hashes", async () => {
  const out = mkdtempSync(join(tmpdir(), "logexp-"));
  try {
    const fake = async (url) => {
      const u = new URL(url), src = /source = '([a-z_]+)'/.exec(u.searchParams.get("sql"))[1];
      return res(200, { result: src === "auth_logs" ? [{ id: "a1", timestamp: 1, event_message: "login" }] : [] });
    };
    const r = await run(["--out", out, "--from", "2026-10-22T03:00:00Z", "--to", "2026-10-22T05:00:00Z", "--sources", "auth_logs,function_logs"],
      { SUPABASE_ACCESS_TOKEN: "sbp_x" }, fake, () => {});
    assert.equal(r.files.length, 4);
    const f = filePath(out, "auth_logs", new Date("2026-10-22T03:00:00Z"));
    assert.ok(f.endsWith(join("auth_logs", "2026", "10", "22", "03.ndjson.gz")));
    assert.deepEqual(gunzipSync(readFileSync(f)).toString().trim().split("\n").map((l) => JSON.parse(l)), [{ id: "a1", timestamp: 1, event_message: "login" }]);
    const m = JSON.parse(readFileSync(join(out, r.manifest), "utf8"));
    assert.equal(m.files.find((x) => x.source === "auth_logs" && x.start.startsWith("2026-10-22T03")).events, 1);
    assert.ok(m.files.every((x) => /^[0-9a-f]{64}$/.test(x.sha256)));
    assert.ok(!readFileSync(join(out, r.manifest), "utf8").includes("sbp_x"));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("refuses to run without a token or an output folder", async () => {
  await assert.rejects(run(["--out", "/tmp/x"], {}, async () => res(200, { result: [] }), () => {}), /SUPABASE_ACCESS_TOKEN/);
  await assert.rejects(run([], { SUPABASE_ACCESS_TOKEN: "t" }, async () => res(200, { result: [] }), () => {}), /--out/);
});
