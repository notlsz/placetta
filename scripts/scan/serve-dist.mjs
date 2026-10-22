#!/usr/bin/env node
/* Serves dist/ the way Vercel serves it from vercel.json: redirects, then the filesystem (a file, or a folder's
   index.html), then rewrites, then 404.html; and every header rule whose source matches the path. For local scans
   (npm run scan:local) and the CSP check, so they see the headers production sends instead of a bare file server's.
   Usage: node scripts/scan/serve-dist.mjs [port] [root]     (default 4173, dist) */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const port = Number(process.argv[2] ?? 4173), root = process.argv[3] ?? "dist";
const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));

/** A vercel.json source (path-to-regexp) as a RegExp: :name(re), :name+, :name*, :name, and bare (re) groups. */
export function toRegExp(source) {
  let re = "", i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === ":") {
      const m = /^:(\w+)(\((?:[^()]|\([^()]*\))*\))?([+*?])?/.exec(source.slice(i));
      re += m[2] ? m[2] : m[3] === "+" ? "(.+)" : m[3] === "*" ? "(.*)" : "([^/]+)";
      i += m[0].length;
    } else if (c === "(") {
      let d = 0, j = i;
      for (; j < source.length; j++) { if (source[j] === "(") d++; else if (source[j] === ")" && !--d) break; }
      re += source.slice(i, j + 1); i = j + 1;
    } else { re += /[.*+?^${}|[\]\\]/.test(c) ? "\\" + c : c; i++; }
  }
  return new RegExp(`^${re}$`);
}
const rules = k => (cfg[k] ?? []).map(r => ({ ...r, re: toRegExp(r.source) }));
const REDIRECTS = rules("redirects"), REWRITES = rules("rewrites"), HEADERS = rules("headers");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff",
  ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream", ".ttf": "font/ttf" };

function file(path) {
  const p = normalize(join(root, decodeURIComponent(path)));
  if (!p.startsWith(normalize(root))) return null;
  if (existsSync(p) && statSync(p).isFile()) return p;
  if (existsSync(join(p, "index.html")) && statSync(p).isDirectory()) return join(p, "index.html");
  return null;
}

createServer((req, res) => { try { serve(req, res); } catch { if (!res.headersSent) res.writeHead(400); res.end("bad request"); } })
  .listen(port, "127.0.0.1", () => console.log(`dist/ on http://127.0.0.1:${port} with vercel.json's headers`));

function serve(req, res) {
  const u = new URL(req.url, "http://localhost");
  const path = u.pathname;
  for (const h of HEADERS) if (h.re.test(path)) for (const { key, value } of h.headers) res.setHeader(key, value);
  res.setHeader("Server", "Vercel");
  const red = REDIRECTS.find(r => r.re.test(path));
  if (red) { res.writeHead(red.permanent ? 308 : 307, { Location: red.destination + u.search }); return res.end(); }
  let f = file(path);
  if (!f) { const rw = REWRITES.find(r => r.re.test(path)); if (rw) f = file(rw.destination); }   // every rewrite here goes to a fixed page
  const status = f ? 200 : 404;
  if (!f) f = file("/404.html");
  if (!f) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(status, { "Content-Type": TYPES[extname(f).toLowerCase()] ?? "application/octet-stream" });
  if (req.method === "HEAD") return res.end();
  res.end(readFileSync(f));
}
