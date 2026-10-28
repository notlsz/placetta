// npm test (no browser needed): POST /wake, the server's ping that wakes a sleeping worker (wake.ts, server.ts). It
// needs FILER_SECRET, is rate-limited (wrong secrets on their own budget), reads no body and says nothing back but ok.
import { test, after } from "node:test";
import assert from "node:assert";
import type { AddressInfo } from "node:net";
import { checkEnv } from "../src/env.ts";
import { LiveViews } from "../src/live.ts";
import { startServer, type Health } from "../src/server.ts";
import { secretOk, Waker, Window } from "../src/wake.ts";

const SECRET = "filer-secret-0123456789abcdef0123456789";

test("the secret: 32 characters or more, compared whole", () => {
  assert.equal(secretOk(SECRET, SECRET), true);
  assert.equal(secretOk(SECRET, SECRET.slice(0, -1)), false);
  assert.equal(secretOk(SECRET, SECRET + "x"), false);
  assert.equal(secretOk(SECRET, ""), false);
  assert.equal(secretOk(SECRET, null), false);
  assert.equal(secretOk("short", "short"), false, "a short secret never opens it");
});

test("a fixed window: at most max in each window, then it opens again", () => {
  let t = 0;
  const w = new Window(2, 60_000, () => t);
  assert.equal(w.take(), true); assert.equal(w.take(), true); assert.equal(w.take(), false);
  assert.equal(w.retryAfter(), 60);
  t = 59_000; assert.equal(w.take(), false); assert.equal(w.retryAfter(), 1);
  t = 60_000; assert.equal(w.take(), true);
});

test("Waker: POST only, off without a secret, 401 for a wrong one, 202 and a nudge for the right one, 429 past the limits", () => {
  let t = 0, nudged = 0;
  assert.equal(new Waker("", () => nudged++).handle("POST", SECRET).status, 503, "no secret on the worker: off, never open");
  const w = new Waker(SECRET, () => nudged++, () => t);
  assert.equal(w.handle("GET", SECRET).status, 405);
  assert.equal(w.handle("POST", undefined).status, 401);
  assert.equal(w.handle("POST", "wrong").status, 401);
  assert.equal(nudged, 0);
  const ok = w.handle("POST", SECRET);
  assert.equal(ok.status, 202); assert.deepEqual(ok.body, { ok: true, awake: true });
  assert.equal(nudged, 1);
  for (let i = 1; i < 12; i++) assert.equal(w.handle("POST", SECRET).status, 202);
  const over = w.handle("POST", SECRET);
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers?.["Retry-After"]) >= 1);
  assert.equal(nudged, 12, "no nudge past the limit");
  t = 61_000;
  assert.equal(w.handle("POST", SECRET).status, 202, "the next minute opens again");
  // guessing has its own budget: it can't use up the server's wakes
  const g = new Waker(SECRET, () => undefined, () => 0);
  for (let i = 0; i < 20; i++) assert.equal(g.handle("POST", `guess-${i}`).status, 401);
  assert.equal(g.handle("POST", "guess-x").status, 429);
  assert.equal(g.handle("POST", SECRET).status, 202, "the right secret still wakes it");
});

// ---------------------------------------------------------------- over HTTP

const env = checkEnv({ SUPABASE_URL: "https://esquxzcfsylffuijvzec.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service-role-secret", ANTHROPIC_API_KEY: "sk-ant-secret", FILER_SECRET: SECRET, RENDER_EXTERNAL_URL: "https://placetta-filer.onrender.com" });
const health: Health = { env, started: "t", version: "v", playbooks: 1, probes: 1, lastHeartbeat: null, lastHeartbeatError: null, lastClaim: null, lastProbe: null, probeDrift: null, running: 0 };
let nudges = 0;
const server = startServer(0, () => health, new LiveViews(null), new Waker(SECRET, () => nudges++));
after(() => new Promise<void>((r) => server.close(() => r())));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

test("POST /wake over HTTP: the secret in x-filer-secret; the answer carries nothing but ok", async () => {
  await new Promise((r) => server.listening ? r(null) : server.once("listening", r));
  const no = await fetch(`${base()}/wake`, { method: "POST" });
  assert.equal(no.status, 401);
  const inBody = await fetch(`${base()}/wake`, { method: "POST", body: JSON.stringify({ secret: SECRET }), headers: { "Content-Type": "application/json" } });
  assert.equal(inBody.status, 401, "the secret in the body doesn't count: the body is never read");
  const inQuery = await fetch(`${base()}/wake?secret=${SECRET}`, { method: "POST" });
  assert.equal(inQuery.status, 401);
  const get = await fetch(`${base()}/wake`, { headers: { "x-filer-secret": SECRET } });
  assert.equal(get.status, 405);
  assert.equal(nudges, 0);
  const ok = await fetch(`${base()}/wake`, { method: "POST", headers: { "x-filer-secret": SECRET } });
  assert.equal(ok.status, 202);
  const text = await ok.text();
  assert.deepEqual(JSON.parse(text), { ok: true, awake: true });
  for (const s of [SECRET, "service-role-secret", "sk-ant-secret"]) assert.ok(!text.includes(s));
  assert.equal(ok.headers.get("cache-control"), "no-store");
  assert.equal(nudges, 1);
  // /healthz says wake on demand is on, never the secret
  const h = await (await fetch(`${base()}/healthz`)).text();
  assert.match(h, /"wake_on_demand": true/);
  assert.ok(!h.includes(SECRET));
});

test("a server without a waker answers /wake with 503, never 202", async () => {
  const s = startServer(0, () => health, new LiveViews(null));
  await new Promise((r) => s.once("listening", r));
  const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/wake`, { method: "POST", headers: { "x-filer-secret": SECRET } });
  assert.equal(r.status, 503);
  await new Promise<void>((done) => s.close(() => done()));
});
