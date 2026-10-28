// The worker's small web server (Render runs it as a web service so it has a health check and a public address):
//
//   GET  /healthz          is the worker up, are its keys set, did its last heartbeat and nightly check go through
//                          (no secret, no customer data: only yes/no, counts and times); 503 while a key is missing
//   GET  /live/<token>...  the live browser for a hand-back (live.ts); 404 for anything else under /live
//   GET  /live.js          the live view's script
//   POST /wake             the server's wake ping (wake.ts): FILER_SECRET in x-filer-secret, rate-limited; the worker
//                          looks for queued filings now
//
// Everything else is 404. Nothing here reads or writes a filing.
import { createServer, type Server } from "node:http";
import type { EnvCheck } from "./env.ts";
import { LIVE_JS, type LiveViews } from "./live.ts";
import type { Waker } from "./wake.ts";

export type Health = {
  env: EnvCheck; started: string; version: string; playbooks: number; probes: number;
  lastHeartbeat: string | null; lastHeartbeatError: string | null; lastClaim: string | null; lastProbe: string | null; probeDrift: number | null;
  running: number;
};

/** What /healthz says: never a key, a customer or a filing. */
export function healthBody(h: Health, live: LiveViews) {
  return {
    ok: h.env.ok, worker: h.env.ok ? "running" : "missing_keys",
    missing: h.env.missing.map((m) => ({ key: m.key, where: m.where })), warnings: h.env.warnings,
    browser: h.env.browser, remote_browser: h.env.remote, wake_on_demand: h.env.wake,
    live_view: live.on || h.env.remote || h.env.browser === "browserbase", version: h.version, started: h.started,
    playbooks: h.playbooks, public_pages_checked_nightly: h.probes,
    heartbeat: h.lastHeartbeat, heartbeat_error: h.lastHeartbeatError, last_claim: h.lastClaim, nightly_check: h.lastProbe, nightly_drift: h.probeDrift,
    running: h.running, live_views_open: live.open_count,
  };
}

export function startServer(port: number, h: () => Health, live: LiveViews, waker?: Waker): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://worker");
    const send = (status: number, type: string, body: string | Uint8Array, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...headers });
      res.end(body);
    };
    try {
      if (req.method === "GET" && (url.pathname === "/healthz" || url.pathname === "/")) {
        const b = healthBody(h(), live);
        return send(b.ok ? 200 : 503, "application/json", JSON.stringify(b, null, 2), { "Cache-Control": "no-store" });
      }
      if (req.method === "GET" && url.pathname === "/live.js") return send(200, "text/javascript; charset=utf-8", LIVE_JS, { "Cache-Control": "no-store" });
      if (url.pathname === "/wake") {
        // the body is never read: the secret is the header, the request itself is the wake
        req.resume();
        const header = req.headers["x-filer-secret"];
        const r = waker ? waker.handle(req.method ?? "GET", Array.isArray(header) ? header[0] : header) : { status: 503, body: { error: "not_configured" } as Record<string, unknown>, headers: undefined };
        return send(r.status, "application/json", JSON.stringify(r.body), { "Cache-Control": "no-store", ...(r.headers ?? {}) });
      }
      if (url.pathname.startsWith("/live/")) {
        let body = "";
        if (req.method === "POST") {
          for await (const chunk of req) { body += chunk; if (body.length > 4000) return send(413, "text/plain", "Too large."); }
        }
        const r = await live.handle(req.method ?? "GET", url.pathname, body);
        return send(r.status, r.type, r.body, r.headers);
      }
      send(404, "text/plain", "Not found.");
    } catch {
      send(500, "text/plain", "Something went wrong.");
    }
  });
  server.listen(port);
  return server;
}
