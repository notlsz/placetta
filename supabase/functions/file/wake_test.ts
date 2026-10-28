// deno test supabase/functions/file/wake_test.ts
// Wake on demand (logic.ts "sleep and wake", wake.ts): a sleeping portal worker is asleep but wakeable when FILER_URL
// and FILER_SECRET are set and it has beaten before; queuing a filing pings it, once per claim, with the secret in a
// header and nothing about the filing; a wake that gets no heartbeat within the window sends the queued filings the
// way they'd go without the worker, and the app says it in words.
import { deepStrictEqual as assertEquals, ok as assert } from "node:assert";
import {
  type Beat, envFrom, type Filing, handBackDue, PORTAL_FAILED, rerouteLead, wakeable, wakeConfig, wakeFailed, wakeMs, wakePlan, waitsOnWorker,
  WAKE_RETRY_MS, workerOn, workerState, WORKER_ASLEEP,
} from "./logic.ts";
import { pingWorker } from "./wake.ts";

const SECRET = "filer-secret-0123456789abcdef0123456789";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const W = 180_000;

Deno.test("FILER_URL: the worker's https address, nothing else; FILER_SECRET 32 characters or more", () => {
  assertEquals(wakeConfig("https://placetta-filer.onrender.com", SECRET), { url: "https://placetta-filer.onrender.com/wake", secret: SECRET });
  assertEquals(wakeConfig("https://placetta-filer.onrender.com/", SECRET)?.url, "https://placetta-filer.onrender.com/wake");
  assertEquals(wakeConfig("https://placetta-filer.onrender.com/wake", SECRET)?.url, "https://placetta-filer.onrender.com/wake");
  assertEquals(wakeConfig("https://filer.example.run.app/base", SECRET)?.url, "https://filer.example.run.app/base/wake");
  assertEquals(wakeConfig("http://placetta-filer.onrender.com", SECRET), null, "never in the clear");
  assertEquals(wakeConfig("https://user:pw@placetta-filer.onrender.com", SECRET), null);
  assertEquals(wakeConfig("https://placetta-filer.onrender.com?secret=x", SECRET), null);
  assertEquals(wakeConfig("not a url", SECRET), null);
  assertEquals(wakeConfig("https://placetta-filer.onrender.com", "short"), null);
  assertEquals(wakeConfig(undefined, SECRET), null);
});

Deno.test("the wake window: FILER_WAKE_SECONDS, 60 to 900, default 180", () => {
  assertEquals(wakeMs(undefined), 180_000);
  assertEquals(wakeMs(""), 180_000);
  assertEquals(wakeMs("abc"), 180_000);
  assertEquals(wakeMs("10"), 60_000);
  assertEquals(wakeMs("120"), 120_000);
  assertEquals(wakeMs("99999"), 900_000);
});

Deno.test("asleep but wakeable: set up, beat before, not beating, last wake not failed", () => {
  const asleep: Beat = { live: false, seen_at: ago(3600_000), wake_since: null };
  assert(wakeable(true, asleep, NOW, W));
  assert(!wakeable(false, asleep, NOW, W), "without FILER_URL and FILER_SECRET: not wakeable, as before");
  assert(!wakeable(true, { live: false, seen_at: null }, NOW, W), "never beat: not set up");
  assert(!wakeable(true, null, NOW, W));
  assert(!wakeable(true, { live: true, seen_at: ago(1000) }, NOW, W), "beating: live, not asleep");
  // a wake in progress is still wakeable
  assert(wakeable(true, { ...asleep, wake_since: ago(60_000) }, NOW, W));
  assert(!wakeFailed({ ...asleep, wake_since: ago(60_000) }, NOW, W));
  // no beat within the window: failed, not wakeable, until the retry period passes
  const failed = { ...asleep, wake_since: ago(W + 1000) };
  assert(wakeFailed(failed, NOW, W) && !wakeable(true, failed, NOW, W));
  assert(!wakeFailed({ ...asleep, wake_since: ago(WAKE_RETRY_MS + 1000) }, NOW, W), "after 30 minutes it may try again");
  // it beat after the ping: that wake worked
  assert(!wakeFailed({ live: false, seen_at: ago(1000), wake_since: ago(W + 5000) }, NOW, W));
});

Deno.test("the app's state: live, asleep (wakes on demand), down when a wake failed; filings queue while asleep", () => {
  const on = envFrom((k) => ({ FILER_AGENCIES: "portal", FILER_CHANNELS: "email,fax,mail,portal" } as Record<string, string>)[k]);
  const asleep: Beat = { live: false, seen_at: ago(3600_000) };
  assertEquals(workerState(undefined, on, asleep, wakeable(true, asleep, NOW, W)), "asleep");
  assertEquals(workerState(undefined, on, asleep, wakeable(false, asleep, NOW, W)), "down", "without wake set up, a sleeping worker is down, as before");
  const failed = { ...asleep, wake_since: ago(W + 1000) };
  assertEquals(workerState(undefined, on, failed, wakeable(true, failed, NOW, W)), "down");
  assertEquals(workerState(undefined, on, { live: true, seen_at: ago(1000) }, true), "live");
  assertEquals(workerState("0", on, asleep, true), "off", "switched off stays off");
  assertEquals(workerState(undefined, on, { live: false, seen_at: null }, true), "not_set_up", "a worker that never beat isn't asleep");
  assert(workerOn(undefined, asleep, true) && !workerOn(undefined, asleep, false) && !workerOn("0", asleep, true));
});

const queued = (o: Partial<Filing> = {}) => ({ channel: "portal" as const, agent_state: "queued", status: "in_progress", provider_ref: null, submit_clicked_at: null, ...o });
Deno.test("the sweep wakes for queued portal filings, never for one waiting out a retry or a held browser", () => {
  assert(waitsOnWorker(queued(), NOW));
  assert(!waitsOnWorker(queued({ provider_ref: `retry-after:${new Date(NOW + 600_000).toISOString()}` }), NOW));
  assert(waitsOnWorker(queued({ provider_ref: `retry-after:${ago(1000)}` }), NOW));
  assert(!waitsOnWorker(queued({ provider_ref: `held-until:${new Date(NOW + 600_000).toISOString()}` }), NOW));
  assert(!waitsOnWorker(queued({ agent_state: "running" }), NOW));
  assert(!waitsOnWorker(queued({ channel: "fax" }), NOW));
  assert(!waitsOnWorker(queued({ status: "canceled" }), NOW));
  assert(!waitsOnWorker(queued({ submit_clicked_at: ago(1) }), NOW));
  const asleep: Beat = { live: false, seen_at: ago(3600_000) };
  assertEquals(wakePlan({ configured: true, beat: asleep, waiting: 1, nowMs: NOW, windowMs: W }), "wake");
  assertEquals(wakePlan({ configured: true, beat: { ...asleep, wake_since: ago(60_000) }, waiting: 1, nowMs: NOW, windowMs: W }), "wake", "still within the window: ping again");
  assertEquals(wakePlan({ configured: true, beat: { ...asleep, wake_since: ago(W + 1) }, waiting: 2, nowMs: NOW, windowMs: W }), "fall_back");
  assertEquals(wakePlan({ configured: true, beat: { live: true, seen_at: ago(1) }, waiting: 1, nowMs: NOW, windowMs: W }), "none");
  assertEquals(wakePlan({ configured: true, beat: asleep, waiting: 0, nowMs: NOW, windowMs: W }), "none");
  assertEquals(wakePlan({ configured: false, beat: { ...asleep, wake_since: ago(W + 1) }, waiting: 1, nowMs: NOW, windowMs: W }), "none", "without wake set up: as before");
});

Deno.test("a filing the worker didn't wake for goes the way it would without the worker, and says why", () => {
  assert(PORTAL_FAILED.has(WORKER_ASLEEP));
  const f = {
    channel: "team" as const, agent_state: "handoff", status: "in_progress", submit_clicked_at: null,
    agent_log: [{ en: "Opening the agency's site", zh: "x", kind: "queued" }, { en: "Odelia's filing browser didn't start in time.", zh: "x", kind: "handoff", ref: WORKER_ASLEEP, at: ago(1000) }],
  };
  assertEquals(handBackDue(f, NOW), "reroute");
  const r = rerouteLead(f);
  assertEquals(r.lead.en, "Odelia's filing browser didn't start in time.");
  assertEquals(r.sends({ en: "by fax", zh: "传真" }).en, "Odelia's filing browser didn't start in time, so Placetta sends it by fax instead.");
  assertEquals(r.sends({ en: "by fax", zh: "传真" }).zh, "Odelia 的提交浏览器未能及时启动，快哉改为传真提交。");
  // the agency's own failure reads as before
  const site = rerouteLead({ agent_log: [{ en: "x", zh: "x", kind: "handoff", ref: "portal_failed" }] });
  assertEquals(site.sends({ en: "by fax", zh: "传真" }).en, "The agency's site didn't work, so Placetta sends it by fax instead.");
  assertEquals(site.lead.zh, "机构网站无法完成。");
});

// ---------------------------------------------------------------- the ping

type Sent = { url: string; init: RequestInit };
const fakeFetch = (sent: Sent[], answer: () => Promise<Response>) => ((url: string | URL | Request, init?: RequestInit) => { sent.push({ url: String(url), init: init ?? {} }); return answer(); }) as typeof fetch;

Deno.test("the ping: POST to FILER_URL/wake, the secret in x-filer-secret, no body, nothing about the filing", async () => {
  const sent: Sent[] = [];
  const out = await pingWorker(wakeConfig("https://placetta-filer.onrender.com", SECRET), { claim: async () => true, fetch: fakeFetch(sent, async () => new Response('{"ok":true}', { status: 202 })) });
  assertEquals(out, "woke");
  assertEquals(sent.length, 1);
  assertEquals(sent[0].url, "https://placetta-filer.onrender.com/wake");
  assertEquals(sent[0].init.method, "POST");
  assertEquals((sent[0].init.headers as Record<string, string>)["x-filer-secret"], SECRET);
  assertEquals(Object.keys(sent[0].init.headers as Record<string, string>), ["x-filer-secret"]);
  assertEquals(sent[0].init.body, undefined);
  assertEquals(sent[0].init.redirect, "manual", "a redirect never carries the secret somewhere else");
});

Deno.test("the ping: only when the database grants it, never without FILER_URL, and a timeout still counts as sent", async () => {
  const sent: Sent[] = [];
  const cfg = wakeConfig("https://placetta-filer.onrender.com", SECRET);
  assertEquals(await pingWorker(cfg, { claim: async () => false, fetch: fakeFetch(sent, async () => new Response("", { status: 202 })) }), "not_needed");
  assertEquals(await pingWorker(cfg, { claim: async () => { throw new Error("db down"); }, fetch: fakeFetch(sent, async () => new Response("", { status: 202 })) }), "not_needed");
  assertEquals(await pingWorker(null, { claim: async () => true, fetch: fakeFetch(sent, async () => new Response("", { status: 202 })) }), "not_set_up");
  assertEquals(sent.length, 0, "no claim, no ping");
  // Render holds the request while the service starts: the ping gives up waiting, the start goes on
  const slow = await pingWorker(cfg, { claim: async () => true, timeoutMs: 50, fetch: ((_u: string, init?: RequestInit) => new Promise<Response>((_ok, bad) => init?.signal?.addEventListener("abort", () => bad(new DOMException("timeout", "TimeoutError"))))) as typeof fetch });
  assertEquals(slow, "sent");
  // a wrong secret on the worker's side: sent, not woke (the heartbeat decides, and the fallback follows)
  assertEquals(await pingWorker(cfg, { claim: async () => true, fetch: fakeFetch(sent, async () => new Response("", { status: 401 })) }), "sent");
});
