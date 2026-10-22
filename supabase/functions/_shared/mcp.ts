// Remote MCP servers: how Placetta reaches any app's Model Context Protocol server for Odelia.
//
// What's here, all without the database, so it can be tested against a fake server (mcp_test.ts):
//   the address guard     only https, never a private, loopback or link-local address, checked again after the DNS
//                         lookup when the runtime can do one, and again on every redirect
//   McpClient             the Streamable HTTP transport: JSON-RPC over HTTP POST, answered as JSON or as a stream of
//                         server-sent events, with the session id the server hands out (Mcp-Session-Id), initialize,
//                         tools/list and tools/call, a time limit and a size limit on every answer
//   sign-in               OAuth 2.1 with PKCE the way the MCP authorization spec says: where the server says to sign in
//                         (protected resource metadata), the sign-in server's own description, registering Placetta
//                         with it (a client metadata document, or dynamic registration), the code exchange and refresh
//
// The specs this follows:
//   Transport (sessions, initialize):   https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
//   The newer stateless revision:       https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
//                                       (no initialize and no sessions; we fall back to it when a server only speaks it)
//   Authorization:                      https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
//     discovery:                        .../authorization/authorization-server-discovery (RFC 9728, RFC 8414, OIDC)
//     registration:                     .../authorization/client-registration (pre-registered, client ID metadata
//                                       documents, then RFC 7591 dynamic registration)
//     PKCE and redirects:               .../authorization/security-considerations
//   Tools and their annotations:        https://modelcontextprotocol.io/specification/2026-07-28/server/tools

/* ------------------------------------------------------------------ errors */

export type McpErrorCode =
  | "bad_url" | "private_address" | "unreachable" | "timeout" | "too_large" | "auth" | "auth_setup" | "protocol" | "rpc" | "http";

/** Something that went wrong talking to an MCP server or its sign-in server. message is plain English for a person;
 *  zh the same in Chinese. challenge: what a 401 said (where to sign in, which scopes). */
export class McpError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
    readonly zh: string,
    readonly extra: { status?: number; rpcCode?: number; data?: unknown; challenge?: Challenge } = {},
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ the address guard */

/** The network this module uses: fetch, and a DNS lookup that returns the addresses a name points to, null when the
 *  runtime can't look names up (then only the name itself is checked), or throws when the lookup failed. */
export type Net = { fetch: typeof fetch; resolve: (host: string) => Promise<string[] | null> };

type DnsFn = (query: string, type: "A" | "AAAA") => Promise<string[]>;

/** Deno's DNS lookup, when this runtime has one and lets us use it. A name with no records of a type is fine as long
 *  as it has the other; a lookup that fails for any other reason refuses the address, so a name server that stalls on
 *  purpose can't skip the check. */
export async function denoResolve(host: string): Promise<string[] | null> {
  const d = (globalThis as unknown as { Deno?: { resolveDns?: DnsFn; errors?: Record<string, new (...a: unknown[]) => Error> } }).Deno;
  if (!d || typeof d.resolveDns !== "function") return null;
  const errors = d.errors ?? {};
  const out: string[] = [];
  for (const type of ["A", "AAAA"] as const) {
    try {
      out.push(...await d.resolveDns(host, type));
    } catch (e) {
      if (errors.NotFound && e instanceof errors.NotFound) continue;
      if ((errors.PermissionDenied && e instanceof errors.PermissionDenied) || (errors.NotSupported && e instanceof errors.NotSupported)) return null;
      throw new McpError("unreachable", "Couldn't look up that server's address. Check the link and try again.", "无法查询该服务器的地址，请检查链接后重试。");
    }
  }
  return out;
}

export const defaultNet = (): Net => ({ fetch: (input, init) => fetch(input, init), resolve: denoResolve });

const ipv4 = (s: string): number[] | null => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.every((n) => n <= 255) ? p : null;
};

/** A v4 address in a range that isn't the public internet: this host, private networks, shared address space,
 *  link-local (cloud metadata lives at 169.254.169.254), documentation and benchmark ranges, multicast, reserved. */
function privateV4([a, b, c]: number[]): boolean {
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113);
}

/** The eight 16-bit groups of a v6 address (with any v4 tail turned into two groups), or null when it isn't one. */
function ipv6(s: string): number[] | null {
  let t = s.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
  if (tail) {
    const v4 = ipv4(tail[1]);
    if (!v4) return null;
    t = t.slice(0, -tail[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  if (!/^[0-9a-f:]+$/.test(t) || (t.match(/::/g) ?? []).length > 1) return null;
  const [head, rest] = t.includes("::") ? t.split("::") : [t, null];
  const left = head ? head.split(":") : [], right = rest ? rest.split(":") : [];
  const fill = rest === null ? 0 : 8 - left.length - right.length;
  if (fill < 0 || (rest === null && left.length !== 8)) return null;
  const groups = [...left, ...Array(fill).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

/** True for any address that isn't somewhere on the public internet (v4 or v6, including v4 tucked inside v6). */
export function privateIp(addr: string): boolean {
  const v4 = ipv4(addr);
  if (v4) return privateV4(v4);
  const g = ipv6(addr);
  if (!g) return true;   // not an address we can read: never trust it
  const v4in = (hi: number, lo: number) => privateV4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
  if (g.slice(0, 7).every((x) => x === 0)) return true;                                   // :: and ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4in(g[6], g[7]);    // ::ffff:a.b.c.d
  if (g.slice(0, 6).every((x) => x === 0)) return v4in(g[6], g[7]);                       // ::a.b.c.d (old form)
  if (g[0] === 0x64 && g[1] === 0xff9b) return v4in(g[6], g[7]);                          // NAT64
  if (g[0] === 0x2002) return v4in(g[1], g[2]);                                           // 6to4
  if (g[0] === 0x2001 && g[1] === 0) return true;                                         // Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true;                                     // documentation
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;              // discard
  if ((g[0] & 0xfe00) === 0xfc00) return true;                                            // unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true;              // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true;                                            // multicast
  return false;
}

const LOCAL_NAMES = /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|home\.arpa|in-addr\.arpa|ip6\.arpa)$/i;

/** A server address a person typed, checked before anything is sent to it: https only, no user name or password in it,
 *  no fragment, and a public name or address. Throws McpError. */
export function checkUrl(raw: string): URL {
  const bad = () => new McpError("bad_url", "That isn't a server link. It starts with https:// (copy it from the app's own page).", "这不是服务器链接。链接以 https:// 开头，请从该应用自己的页面复制。");
  if (typeof raw !== "string" || !raw.trim() || raw.length > 500) throw bad();
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw bad(); }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname) throw bad();
  u.hash = "";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const literal = !!ipv4(host) || host.includes(":");
  if (literal ? privateIp(host) : (LOCAL_NAMES.test(host) || !host.includes(".") || host.endsWith("."))) {
    throw new McpError("private_address", "Placetta only connects to apps on the public internet, not to addresses inside a private network.", "快哉只连接公共互联网上的应用，不连接私有网络内的地址。");
  }
  return u;
}

/** checkUrl, then the addresses the name points to right now (when the runtime can look them up). The fetch that
 *  follows looks the name up again by itself, so a name that changes in between could still slip through; checking on
 *  every request and every redirect keeps that window small. */
export async function guardUrl(net: Net, raw: string): Promise<URL> {
  const u = checkUrl(raw);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (ipv4(host) || host.includes(":")) return u;
  const addrs = await net.resolve(host);
  if (addrs === null) return u;
  if (!addrs.length) throw new McpError("unreachable", "Couldn't find that server. Check the link.", "找不到该服务器，请检查链接。");
  if (addrs.some(privateIp)) {
    throw new McpError("private_address", "Placetta only connects to apps on the public internet, not to addresses inside a private network.", "快哉只连接公共互联网上的应用，不连接私有网络内的地址。");
  }
  return u;
}

/** fetch through the guard: every hop (redirects too, at most 3) checked, a time limit on the whole thing. The body
 *  isn't read here: readCapped reads it with a size limit. */
export async function guardedFetch(net: Net, url: string, init: RequestInit, timeoutMs: number): Promise<{ res: Response; url: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let at = url, method = (init.method ?? "GET").toUpperCase(), body = init.body;
  let first: string | null = null;
  for (let hop = 0; hop <= 3; hop++) {
    const u = await guardUrl(net, at);
    first ??= u.origin;
    // like the Fetch standard: a redirect to another origin doesn't carry the person's token or cookies with it
    const headers = new Headers(init.headers);
    if (u.origin !== first) { headers.delete("authorization"); headers.delete("cookie"); headers.delete("proxy-authorization"); }
    let res: Response;
    try {
      res = await net.fetch(u.toString(), { ...init, headers, method, body, redirect: "manual", signal });
    } catch (e) {
      if (signal.aborted) throw new McpError("timeout", "The app's server took too long to answer.", "该应用的服务器响应超时。");
      throw new McpError("unreachable", "Couldn't reach the app's server. Check the link and try again.", "无法连接该应用的服务器，请检查链接后重试。", { data: e instanceof Error ? e.message.slice(0, 120) : undefined });
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel();
      // 307 and 308 keep the method and body; the others turn into a GET, which only a GET may follow
      if (res.status !== 307 && res.status !== 308 && method !== "GET") throw new McpError("http", "The app's server sent the request somewhere else.", "该应用的服务器把请求转到了别处。", { status: res.status });
      at = new URL(loc, u).toString();
      continue;
    }
    return { res, url: u.toString() };
  }
  throw new McpError("http", "The app's server redirected too many times.", "该应用的服务器重定向次数过多。");
}

const TOO_BIG = () => new McpError("too_large", "The app sent back more than Placetta reads at once.", "该应用返回的内容超过了快哉一次读取的上限。");

/** A response body as text, refusing anything over maxBytes (declared or actual). */
export async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? "0") > maxBytes) { await res.body?.cancel(); throw TOO_BIG(); }
  if (!res.body) return "";
  const reader = res.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { await reader.cancel(); throw TOO_BIG(); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return new TextDecoder().decode(out);
}

/* ------------------------------------------------------------------ server-sent events */

/** The events in a text/event-stream body, as the HTML spec defines them: data lines joined, comments skipped, lines
 *  ending in \n, \r\n or \r. Stops with McpError once more than maxBytes have arrived. */
export async function* sseEvents(body: ReadableStream<Uint8Array>, maxBytes: number): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = "", total = 0, data: string[] = [], event = "";
  const line = (l: string): { event: string; data: string } | null => {
    if (l === "") {
      const out = data.length ? { event: event || "message", data: data.join("\n") } : null;
      data = []; event = "";
      return out;
    }
    if (l.startsWith(":")) return null;
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    const value = i < 0 ? "" : l.slice(i + 1).replace(/^ /, "");
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    return null;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw TOO_BIG();
      buf += dec.decode(value, { stream: true });
      let m: RegExpExecArray | null;
      while ((m = /\r\n|\r(?!$)|\n/.exec(buf))) {
        const ev = line(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
        if (ev) yield ev;
      }
    }
    buf += dec.decode();
    for (const l of [...buf.split(/\r\n|\r|\n/), ""]) { const ev = line(l); if (ev) yield ev; }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ the client */

/** The protocol version we ask for, the ones we accept back, and the newer stateless one we fall back to. */
export const PROTOCOL = "2025-11-25";
const ACCEPTED = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const STATELESS = "2026-07-28";
const CLIENT_INFO = { name: "Placetta", title: "Placetta (快哉)", version: "1.0.0" };

/** A tool as Placetta keeps it: its name, what it says it does, whether it only reads, and its input schema. */
export type McpTool = { name: string; title?: string; description: string; read_only: boolean; input_schema: Record<string, unknown>; headers?: Record<string, string> };
export type CallResult = { text: string; is_error: boolean };

/** Verbs a tool's name leads with when it changes something, and verbs that only look. A tool that says it only reads
 *  but is named like a change ("send_email", "notion-create-pages") is treated as one that changes things: the hint
 *  comes from the app, and the spec says annotations from a server are untrusted. */
const WRITE_VERBS = new Set("add archive assign book cancel charge close comment create delete destroy disable drop duplicate edit enable execute insert invite merge move pay post publish purge put refund remove rename reply reset revoke run schedule send set share submit transfer trigger update upload upsert write".split(" "));
const READ_VERBS = new Set("get list search read fetch find query lookup look describe view show retrieve count check download export".split(" "));

/** The leading words of a tool name: "notion-create-pages" and "createPage" both read as words. */
const nameWords = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase().split(/[_\-.\s]+/).filter(Boolean);

/** Whether a tool's name says it changes something: its first word is a change, or (after an app prefix like
 *  "notion-") its second is, unless its first already says it only looks ("get_post"). */
export function writeNamed(name: string): boolean {
  const [a, b] = nameWords(name);
  if (!a) return false;
  if (WRITE_VERBS.has(a)) return true;
  if (READ_VERBS.has(a)) return false;
  return !!b && WRITE_VERBS.has(b);
}

/** Whether a tool may run without an approval: only when its annotations say readOnlyHint true, they don't also say it's
 *  destructive, and its name doesn't say it changes something. No annotation means it needs an approval. */
export function readOnly(t: { name?: unknown; annotations?: unknown }): boolean {
  const a = (t.annotations ?? {}) as Record<string, unknown>;
  return a.readOnlyHint === true && a.destructiveHint !== true && !writeNamed(String(t.name ?? ""));
}

/** A header value as the newer revision wants it: plain ASCII as it is, anything else in its base64 form. */
const headerValue = (v: string) => (/^[\x20-\x7e]*$/.test(v) && v.trim() === v ? v : `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode(v)))}?=`);

type Rpc = { jsonrpc?: string; id?: unknown; result?: Record<string, unknown>; error?: { code?: number; message?: string; data?: unknown }; method?: string };

export type ClientOptions = {
  url: string;
  /** The bearer token for each request, or null for a server that needs none. */
  token?: () => Promise<string | null>;
  net?: Net;
  /** Each request's time limit (default 20 s) and the most an answer may be (default 2 MB). */
  timeoutMs?: number;
  maxBytes?: number;
};

export class McpClient {
  session: string | null = null;
  protocol: string | null = null;
  /** The server only speaks the newer stateless revision: no initialize, no session, version in every request. */
  stateless = false;
  serverInfo: Record<string, unknown> | null = null;
  private seq = 0;
  private readonly net: Net;
  constructor(readonly o: ClientOptions) {
    this.net = o.net ?? defaultNet();
  }

  /** Start a session: initialize, then the initialized notice. A server that only speaks the newer revision answers
   *  initialize with an error naming the versions it supports; then we ask it server/discover instead. */
  async connect(): Promise<void> {
    this.session = null; this.protocol = null; this.stateless = false;
    let r: Record<string, unknown>;
    try {
      r = await this.rpc("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT_INFO });
    } catch (e) {
      if (!(e instanceof McpError) || !this.speaksStateless(e)) throw e;
      this.stateless = true;
      const d = await this.rpc("server/discover", {});
      const versions = (d.supportedVersions ?? d.protocolVersions ?? []) as unknown[];
      if (Array.isArray(versions) && versions.length && !versions.includes(STATELESS)) throw e;
      this.protocol = STATELESS;
      this.serverInfo = (d.serverInfo ?? null) as Record<string, unknown> | null;
      return;
    }
    const v = String(r.protocolVersion ?? "");
    if (!ACCEPTED.includes(v)) {
      throw new McpError("protocol", `This app's server speaks a version of MCP Placetta doesn't know (${v.slice(0, 20) || "none"}).`, `该应用的服务器使用快哉不支持的 MCP 版本（${v.slice(0, 20) || "未知"}）。`);
    }
    this.protocol = v;
    this.serverInfo = (r.serverInfo ?? null) as Record<string, unknown> | null;
    await this.rpc("notifications/initialized", undefined, { notify: true });
  }

  /** An initialize the server turned down because it only speaks the stateless revision. */
  private speaksStateless(e: McpError): boolean {
    if (e.code !== "rpc" && e.code !== "http") return false;
    const d = (e.extra.data ?? {}) as Record<string, unknown>;
    const supported = (d.supported ?? d.supportedVersions) as unknown;
    return (Array.isArray(supported) && supported.includes(STATELESS)) || e.extra.rpcCode === -32022 || e.extra.rpcCode === -32004 || e.extra.rpcCode === -32601;
  }

  /** Every tool, page by page: at most 10 pages and 200 tools. Tools with a name the spec doesn't allow are skipped. */
  async listTools(): Promise<McpTool[]> {
    const out: McpTool[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10 && out.length < 200; page++) {
      const r = await this.rpc("tools/list", cursor ? { cursor } : {});
      for (const t of (Array.isArray(r.tools) ? r.tools : []) as Record<string, unknown>[]) {
        const name = typeof t?.name === "string" ? t.name : "";
        if (!/^[A-Za-z0-9_.\-]{1,128}$/.test(name) || out.some((x) => x.name === name)) continue;
        const schema = t.inputSchema && typeof t.inputSchema === "object" && !Array.isArray(t.inputSchema) ? t.inputSchema as Record<string, unknown> : { type: "object" };
        const headers = this.stateless ? paramHeaders(schema) : {};
        if (headers === null) continue;   // the newer revision: a tool whose header annotations are invalid is left out
        const a = (t.annotations ?? {}) as Record<string, unknown>;
        const title = typeof t.title === "string" ? t.title : typeof a.title === "string" ? a.title : undefined;
        out.push({ name, ...(title ? { title: title.slice(0, 120) } : {}), description: typeof t.description === "string" ? t.description.slice(0, 2000) : "", read_only: readOnly(t), input_schema: schema, ...(Object.keys(headers).length ? { headers } : {}) });
        if (out.length >= 200) break;
      }
      cursor = typeof r.nextCursor === "string" && r.nextCursor ? r.nextCursor : undefined;
      if (!cursor) break;
    }
    return out;
  }

  /** Call one tool and read what it said as text (at most maxChars). A tool that reports its own failure comes back
   *  with is_error, so the model can read why and try again. */
  async callTool(name: string, args: Record<string, unknown>, o: { headers?: Record<string, string>; maxChars?: number } = {}): Promise<CallResult> {
    const extra: Record<string, string> = {};
    for (const [param, header] of Object.entries(o.headers ?? {})) {
      const v = args[param];
      if (v !== undefined && v !== null) extra[`Mcp-Param-${header}`] = headerValue(typeof v === "string" ? v : JSON.stringify(v));
    }
    const r = await this.rpc("tools/call", { name, arguments: args }, { name, headers: extra });
    return { text: resultText(r, o.maxChars ?? 12000), is_error: r.isError === true };
  }

  /** End the session (best effort). */
  async close(): Promise<void> {
    if (!this.session) return;
    try {
      const { res } = await guardedFetch(this.net, this.o.url, { method: "DELETE", headers: await this.headers("") }, 5000);
      await res.body?.cancel();
    } catch { /* the server forgets it on its own */ }
    this.session = null;
  }

  private async headers(method: string, name?: string): Promise<Record<string, string>> {
    const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
    const tok = this.o.token ? await this.o.token() : null;
    if (tok) h.Authorization = `Bearer ${tok}`;
    if (this.stateless) {
      h["MCP-Protocol-Version"] = STATELESS;
      if (method) h["Mcp-Method"] = method;
      if (name) h["Mcp-Name"] = headerValue(name);
    } else {
      if (this.protocol && method !== "initialize") h["MCP-Protocol-Version"] = this.protocol;
      if (this.session) h["Mcp-Session-Id"] = this.session;
    }
    return h;
  }

  /** One JSON-RPC request (or a notification). Throws McpError for anything but a result. */
  private async rpc(method: string, params: Record<string, unknown> | undefined, o: { notify?: boolean; retried?: boolean; name?: string; headers?: Record<string, string> } = {}): Promise<Record<string, unknown>> {
    const id = ++this.seq;
    const p = this.stateless && params
      ? { ...params, _meta: { "io.modelcontextprotocol/protocolVersion": STATELESS, "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": CLIENT_INFO } }
      : params;
    const body = JSON.stringify({ jsonrpc: "2.0", ...(o.notify ? {} : { id }), method, ...(p ? { params: p } : {}) });
    const maxBytes = this.o.maxBytes ?? 2_000_000;
    const { res } = await guardedFetch(this.net, this.o.url, { method: "POST", headers: { ...await this.headers(method, o.name), ...(o.headers ?? {}) }, body }, this.o.timeoutMs ?? 20000);

    if (res.status === 401 || (res.status === 403 && /insufficient_scope/i.test(res.headers.get("www-authenticate") ?? ""))) {
      await res.body?.cancel();
      throw new McpError("auth", "The app needs you to sign in again.", "该应用需要您重新登录。", { status: res.status, challenge: parseChallenge(res.headers.get("www-authenticate")) });
    }
    // the server ended the session: start a new one and ask once more (transports, session management, point 4)
    if (res.status === 404 && this.session && !o.retried && method !== "initialize") {
      await res.body?.cancel();
      await this.connect();
      return this.rpc(method, params, { ...o, retried: true });
    }
    if (method === "initialize" && res.ok) {
      const sid = res.headers.get("mcp-session-id");
      if (sid && /^[\x21-\x7e]{1,256}$/.test(sid)) this.session = sid;
    }
    if (o.notify) {
      await res.body?.cancel();
      if (res.ok) return {};
      throw new McpError("http", `The app's server refused a notice (${res.status}).`, `该应用的服务器拒绝了通知（${res.status}）。`, { status: res.status });
    }
    if (!res.ok) {
      let msg: Rpc | null = null;
      try { msg = JSON.parse(await readCapped(res, 16_000)) as Rpc; } catch { /* not JSON */ }
      const err = msg?.error;
      throw new McpError(err ? "rpc" : "http", `The app's server answered with an error (${res.status}${err?.message ? `: ${String(err.message).slice(0, 160)}` : ""}).`,
        `该应用的服务器返回错误（${res.status}${err?.message ? `：${String(err.message).slice(0, 160)}` : ""}）。`, { status: res.status, rpcCode: err?.code, data: err?.data });
    }
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("text/event-stream") && res.body) {
      for await (const ev of sseEvents(res.body, maxBytes)) {
        if (ev.event !== "message") continue;
        let msg: unknown;
        try { msg = JSON.parse(ev.data); } catch { continue; }
        const hit = answerFor(msg, id);
        if (hit) return unwrap(hit, this.stateless);
      }
      throw new McpError("protocol", "The app's server closed the stream without an answer.", "该应用的服务器在给出答复前关闭了连接。");
    }
    let msg: unknown;
    try { msg = JSON.parse(await readCapped(res, maxBytes)); } catch (e) {
      if (e instanceof McpError) throw e;
      throw new McpError("protocol", "The app's server sent something that isn't JSON.", "该应用的服务器返回的内容不是 JSON。");
    }
    const hit = answerFor(msg, id);
    if (!hit) throw new McpError("protocol", "The app's server answered a different request.", "该应用的服务器答复了另一个请求。");
    return unwrap(hit, this.stateless);
  }
}

/** The response to request id in what the server sent (one message, or a batch). Notifications and the server's own
 *  requests are skipped: Placetta never samples or elicits for a server. */
function answerFor(msg: unknown, id: number): Rpc | null {
  const list = (Array.isArray(msg) ? msg : [msg]) as Rpc[];
  return list.find((m) => m && typeof m === "object" && m.id === id && ("result" in m || "error" in m)) ?? null;
}

function unwrap(m: Rpc, stateless: boolean): Record<string, unknown> {
  if (m.error) {
    throw new McpError("rpc", `The app's server said: ${String(m.error.message ?? "error").slice(0, 200)}`, `该应用的服务器返回：${String(m.error.message ?? "错误").slice(0, 200)}`, { rpcCode: m.error.code, data: m.error.data });
  }
  const r = (m.result && typeof m.result === "object" ? m.result : {}) as Record<string, unknown>;
  if (stateless && r.resultType === "input_required") {
    throw new McpError("protocol", "The app asked for more input in the middle of the request, which Placetta can't give it.", "该应用在处理中途要求补充输入，快哉无法提供。");
  }
  return r;
}

/** The newer revision's header annotations on a tool's inputs: {param: header name}, or null when one is invalid. */
function paramHeaders(schema: Record<string, unknown>): Record<string, string> | null {
  const out: Record<string, string> = {};
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(props)) {
    const h = v && typeof v === "object" ? v["x-mcp-header"] : undefined;
    if (h === undefined) continue;
    if (typeof h !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(h) || Object.values(out).some((x) => x.toLowerCase() === h.toLowerCase())) return null;
    out[k] = h;
  }
  return out;
}

/** What a tool call said, as text: its text blocks, a line for each file or link, or its structured result. */
export function resultText(r: Record<string, unknown>, maxChars: number): string {
  const parts: string[] = [];
  for (const b of (Array.isArray(r.content) ? r.content : []).slice(0, 50) as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
    else if (b.type === "image" || b.type === "audio") parts.push(`[${b.type} not shown]`);
    else if (b.type === "resource_link") parts.push(`[link] ${String(b.name ?? b.title ?? "")} ${String(b.uri ?? "")}`.trim());
    else if (b.type === "resource") {
      const res = (b.resource ?? {}) as Record<string, unknown>;
      parts.push(typeof res.text === "string" ? res.text : `[file ${String(res.uri ?? "")} not shown]`);
    }
  }
  if (!parts.length && r.structuredContent !== undefined) {
    try { parts.push(JSON.stringify(r.structuredContent)); } catch { /* not JSON */ }
  }
  const text = parts.join("\n\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "\n[cut: the rest was longer than Placetta reads at once]" : text;
}

/* ------------------------------------------------------------------ sign-in: discovery */

/** What a 401's WWW-Authenticate header says: where the sign-in description is, which scopes, and why. */
export type Challenge = { resource_metadata?: string; scope?: string; error?: string };

export function parseChallenge(h: string | null): Challenge {
  if (!h) return {};
  const at = h.search(/\bbearer\b/i);
  if (at < 0) return {};
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g;
  re.lastIndex = at + 6;
  let m: RegExpExecArray | null;
  while ((m = re.exec(h))) {
    const key = m[1].toLowerCase();
    if (key === "basic" || key === "digest") break;
    if (!(key in out)) out[key] = (m[2] ?? m[3] ?? "").replace(/\\(.)/g, "$1");
  }
  return { ...(out.resource_metadata ? { resource_metadata: out.resource_metadata } : {}), ...(out.scope ? { scope: out.scope } : {}), ...(out.error ? { error: out.error } : {}) };
}

/** A JSON document over the guard: GET, at most 64 KB, 10 seconds. null when it isn't there or isn't JSON. Address
 *  problems (a private address) are thrown, not skipped. */
async function getJson(net: Net, url: string): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    ({ res } = await guardedFetch(net, url, { method: "GET", headers: { Accept: "application/json" } }, 10000));
  } catch (e) {
    if (e instanceof McpError && (e.code === "private_address" || e.code === "bad_url")) throw e;
    return null;
  }
  if (!res.ok) { await res.body?.cancel(); return null; }
  try {
    const j = JSON.parse(await readCapped(res, 64_000));
    return j && typeof j === "object" && !Array.isArray(j) ? j as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const noSlash = (s: string) => s.replace(/\/+$/, "");
const setupError = (en: string, zh: string) => new McpError("auth_setup", en, zh);

/** Where an app's MCP server says to sign in (OAuth 2.0 Protected Resource Metadata, RFC 9728). */
export type ResourceMeta = { resource: string; authorization_servers: string[]; scopes_supported?: string[] };

/** The resource metadata: from the 401's resource_metadata link when it gave one, otherwise from the well-known
 *  addresses, path-specific first, then the root (authorization-server-discovery, protected resource metadata). The
 *  resource it names must be this server, or the origin above it. */
export async function discoverResource(net: Net, serverUrl: string, ch: Challenge): Promise<ResourceMeta> {
  const u = new URL(serverUrl);
  const path = u.pathname.replace(/\/+$/, "");
  const tries = ch.resource_metadata ? [ch.resource_metadata] : [...(path ? [`${u.origin}/.well-known/oauth-protected-resource${path}`] : []), `${u.origin}/.well-known/oauth-protected-resource`];
  for (const t of tries) {
    const j = await getJson(net, t);
    const servers = Array.isArray(j?.authorization_servers) ? (j!.authorization_servers as unknown[]).filter((s): s is string => typeof s === "string") : [];
    if (!j || !servers.length) continue;
    const resource = typeof j.resource === "string" && j.resource ? j.resource : serverUrl;
    if (!coversServer(resource, serverUrl)) {
      throw setupError("The app's sign-in details are for a different server. Placetta didn't use them.", "该应用的登录信息属于另一个服务器，快哉没有使用。");
    }
    const scopes = Array.isArray(j.scopes_supported) ? (j.scopes_supported as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 60) : undefined;
    return { resource, authorization_servers: servers.slice(0, 5), ...(scopes ? { scopes_supported: scopes } : {}) };
  }
  throw setupError("This app's server didn't say where to sign in. If it gave you an access token, paste it instead.", "该应用的服务器没有说明在哪里登录。如果它给了您访问令牌，请改为粘贴令牌。");
}

/** The resource a server's metadata names is the server itself, or an address above it on the same origin. */
export function coversServer(resource: string, serverUrl: string): boolean {
  try {
    const r = new URL(resource), s = new URL(serverUrl);
    if (r.protocol !== s.protocol || r.host.toLowerCase() !== s.host.toLowerCase() || r.hash) return false;
    const rp = r.pathname.replace(/\/+$/, ""), sp = s.pathname.replace(/\/+$/, "");
    return rp === "" || rp === sp || sp.startsWith(rp + "/");
  } catch {
    return false;
  }
}

/** A sign-in server's own description (RFC 8414 / OpenID Connect Discovery), as much of it as Placetta uses. */
export type AuthServer = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  client_id_metadata_document_supported?: boolean;
  authorization_response_iss_parameter_supported?: boolean;
};

/** The sign-in server's description from the well-known addresses in the spec's order; its issuer must be the one we
 *  asked for (a trailing slash aside), and it must support PKCE with S256, or we stop. */
export async function discoverAuthServer(net: Net, issuer: string): Promise<AuthServer> {
  const u = checkUrl(issuer);
  const path = u.pathname.replace(/\/+$/, "");
  const tries = path
    ? [`${u.origin}/.well-known/oauth-authorization-server${path}`, `${u.origin}/.well-known/openid-configuration${path}`, `${u.origin}${path}/.well-known/openid-configuration`]
    : [`${u.origin}/.well-known/oauth-authorization-server`, `${u.origin}/.well-known/openid-configuration`];
  for (const t of tries) {
    const j = await getJson(net, t);
    if (!j || typeof j.issuer !== "string") continue;
    if (noSlash(j.issuer) !== noSlash(issuer)) {
      throw setupError("The app's sign-in server described itself as a different server. Placetta stopped there.", "该应用的登录服务器自称是另一个服务器，快哉已停止。");
    }
    const str = (k: string) => (typeof j[k] === "string" && j[k] ? String(j[k]) : undefined);
    const list = (k: string) => (Array.isArray(j[k]) ? (j[k] as unknown[]).filter((x): x is string => typeof x === "string") : undefined);
    const authz = str("authorization_endpoint"), token = str("token_endpoint");
    if (!authz || !token || !authz.startsWith("https://") || !token.startsWith("https://")) {
      throw setupError("The app's sign-in server is missing a secure sign-in address.", "该应用的登录服务器缺少安全的登录地址。");
    }
    // security considerations: no code_challenge_methods_supported, or no S256 in it, means no PKCE, and we refuse
    if (!(list("code_challenge_methods_supported") ?? []).includes("S256")) {
      throw setupError("The app's sign-in server doesn't support the secure sign-in Placetta requires (PKCE).", "该应用的登录服务器不支持快哉要求的安全登录方式（PKCE）。");
    }
    const reg = str("registration_endpoint"), rev = str("revocation_endpoint");
    return {
      issuer: j.issuer, authorization_endpoint: authz, token_endpoint: token,
      ...(reg?.startsWith("https://") ? { registration_endpoint: reg } : {}),
      ...(rev?.startsWith("https://") ? { revocation_endpoint: rev } : {}),
      ...(list("scopes_supported") ? { scopes_supported: list("scopes_supported")!.slice(0, 80) } : {}),
      ...(list("token_endpoint_auth_methods_supported") ? { token_endpoint_auth_methods_supported: list("token_endpoint_auth_methods_supported") } : {}),
      client_id_metadata_document_supported: j.client_id_metadata_document_supported === true,
      authorization_response_iss_parameter_supported: j.authorization_response_iss_parameter_supported === true,
    };
  }
  throw setupError("Couldn't read the app's sign-in server. Try again, or paste an access token instead.", "无法读取该应用的登录服务器。请重试，或改为粘贴访问令牌。");
}

/* ------------------------------------------------------------------ sign-in: registration, PKCE, tokens */

/** How Placetta proves itself at the token endpoint: as a public client (PKCE alone), or with a secret. */
export type TokenAuth = "none" | "client_secret_post" | "client_secret_basic";
export type OAuthClient = { client_id: string; client_secret?: string; auth: TokenAuth; via: "preregistered" | "metadata_document" | "registered" };

/** The client metadata document Placetta serves at its client id address (client ID metadata documents). */
export function clientMetadata(clientIdUrl: string, redirectUri: string): Record<string, unknown> {
  return {
    client_id: clientIdUrl, client_name: "Placetta", redirect_uris: [redirectUri],
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", application_type: "web",
  };
}

/** The client to sign in with, in the spec's order: a pre-registered one (bound to its issuer), a client metadata
 *  document when the server takes them and public clients, then dynamic registration (RFC 7591). */
export async function chooseClient(net: Net, as: AuthServer, o: { redirectUri: string; metadataUrl?: string; preregistered?: { issuer: string; client_id: string; client_secret?: string } }): Promise<OAuthClient> {
  const methods = as.token_endpoint_auth_methods_supported ?? ["client_secret_basic"];
  if (o.preregistered) {
    // authorization server binding: credentials registered with one issuer are never sent to another
    if (noSlash(o.preregistered.issuer) !== noSlash(as.issuer)) throw setupError("This app now signs in somewhere else than Placetta was set up for. Ask Placetta's team to update it.", "该应用的登录服务器已变更，与快哉的设置不符。请联系快哉团队更新。");
    const auth: TokenAuth = !o.preregistered.client_secret ? "none" : methods.includes("client_secret_post") ? "client_secret_post" : "client_secret_basic";
    return { client_id: o.preregistered.client_id, ...(o.preregistered.client_secret ? { client_secret: o.preregistered.client_secret } : {}), auth, via: "preregistered" };
  }
  if (o.metadataUrl && as.client_id_metadata_document_supported && methods.includes("none")) {
    return { client_id: o.metadataUrl, auth: "none", via: "metadata_document" };
  }
  if (!as.registration_endpoint) {
    throw setupError("This app only lets apps it already knows sign in. Paste an access token from the app instead, or ask Placetta's team to add it.", "该应用只允许已登记的应用登录。请改为粘贴该应用提供的访问令牌，或联系快哉团队添加。");
  }
  const want: TokenAuth = methods.includes("none") ? "none" : methods.includes("client_secret_post") ? "client_secret_post" : "client_secret_basic";
  let res: Response;
  try {
    ({ res } = await guardedFetch(net, as.registration_endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      // client-registration: application_type is required; Placetta is a web app on a public host
      body: JSON.stringify({ client_name: "Placetta", redirect_uris: [o.redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: want, application_type: "web" }),
    }, 15000));
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw setupError("The app's sign-in server didn't answer. Try again.", "该应用的登录服务器没有响应，请重试。");
  }
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(await readCapped(res, 64_000)); } catch { /* not JSON */ }
  if (!res.ok || typeof j.client_id !== "string" || !j.client_id) {
    throw setupError("The app wouldn't register Placetta for sign-in. Paste an access token from the app instead.", "该应用拒绝为快哉登记登录。请改为粘贴该应用提供的访问令牌。");
  }
  const got = typeof j.token_endpoint_auth_method === "string" && ["none", "client_secret_post", "client_secret_basic"].includes(j.token_endpoint_auth_method) ? j.token_endpoint_auth_method as TokenAuth : want;
  const secret = typeof j.client_secret === "string" && j.client_secret ? j.client_secret : undefined;
  return { client_id: j.client_id, ...(secret ? { client_secret: secret } : {}), auth: secret ? (got === "none" ? "client_secret_post" : got) : "none", via: "registered" };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** A PKCE pair: a 43-character verifier and its S256 challenge (OAuth 2.1, section 4.1.1). */
export async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge: b64url(digest) };
}

/** The scopes to ask for (scope selection strategy): the 401's own scope, else every scope the resource lists, else
 *  none. A catalog entry can name fewer. offline_access is added when the sign-in server offers it, for a refresh token. */
export function chooseScope(ch: Challenge, rm: ResourceMeta, as: AuthServer, override?: string): string | undefined {
  const base = override ?? ch.scope ?? (rm.scopes_supported?.length ? rm.scopes_supported.join(" ") : undefined);
  const words = new Set((base ?? "").split(/\s+/).filter(Boolean));
  if (as.scopes_supported?.includes("offline_access") && !override) words.add("offline_access");
  return words.size ? [...words].join(" ") : undefined;
}

/** The sign-in page to send the person to: the code flow with PKCE, the resource it's for (RFC 8707), and the state. */
export function authorizeUrl(as: AuthServer, o: { client_id: string; redirect_uri: string; challenge: string; state: string; resource: string; scope?: string; extra?: Record<string, string> }): string {
  const u = new URL(as.authorization_endpoint);
  const q = u.searchParams;
  q.set("response_type", "code");
  q.set("client_id", o.client_id);
  q.set("redirect_uri", o.redirect_uri);
  q.set("code_challenge", o.challenge);
  q.set("code_challenge_method", "S256");
  q.set("state", o.state);
  q.set("resource", o.resource);
  if (o.scope) q.set("scope", o.scope);
  for (const [k, v] of Object.entries(o.extra ?? {})) if (!q.has(k)) q.set(k, v);
  return u.toString();
}

/** RFC 9207 on the way back: when the server says it sends iss, it must be there; when iss is there, it must be the
 *  issuer we recorded, compared exactly. */
export function issOk(recorded: { issuer: string; iss_param: boolean }, iss: string | null): boolean {
  if (iss === null || iss === "") return !recorded.iss_param;
  return iss === recorded.issuer;
}

/** Where tokens come from and how Placetta signs those requests. */
export type TokenCtx = { token_endpoint: string; client_id: string; client_secret?: string; auth: TokenAuth; resource: string };
export type TokenSet = { access_token: string; refresh_token: string | null; expires_at: number | null; scope: string | null };

async function tokenRequest(net: Net, t: TokenCtx, params: Record<string, string>): Promise<TokenSet> {
  const form = new URLSearchParams({ ...params, resource: t.resource });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (t.auth === "client_secret_basic" && t.client_secret) {
    headers.Authorization = `Basic ${btoa(`${encodeURIComponent(t.client_id)}:${encodeURIComponent(t.client_secret)}`)}`;
  } else {
    form.set("client_id", t.client_id);
    if (t.auth === "client_secret_post" && t.client_secret) form.set("client_secret", t.client_secret);
  }
  const { res } = await guardedFetch(net, t.token_endpoint, { method: "POST", headers, body: form.toString() }, 15000);
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(await readCapped(res, 64_000)); } catch { /* not JSON */ }
  if (res.status === 400 || res.status === 401) {
    throw new McpError("auth", "The app turned down the sign-in. Connect it again.", "该应用拒绝了登录，请重新连接。", { status: res.status, data: typeof j.error === "string" ? j.error.slice(0, 60) : undefined });
  }
  const access = typeof j.access_token === "string" ? j.access_token : "";
  const type = typeof j.token_type === "string" ? j.token_type.toLowerCase() : "bearer";
  if (!res.ok || !access || type !== "bearer") {
    throw new McpError("auth_setup", "The app's sign-in server didn't hand over a usable sign-in. Try again.", "该应用的登录服务器没有返回可用的登录凭证，请重试。", { status: res.status });
  }
  const s = typeof j.expires_in === "number" ? j.expires_in : typeof j.expires_in === "string" ? Number(j.expires_in) : NaN;
  return {
    access_token: access,
    refresh_token: typeof j.refresh_token === "string" && j.refresh_token ? j.refresh_token : null,
    expires_at: Number.isFinite(s) && s > 0 ? Date.now() + s * 1000 : null,
    scope: typeof j.scope === "string" ? j.scope : null,
  };
}

/** The authorization code for tokens, with the PKCE verifier and the resource. */
export const exchangeCode = (net: Net, t: TokenCtx, o: { code: string; verifier: string; redirect_uri: string }) =>
  tokenRequest(net, t, { grant_type: "authorization_code", code: o.code, code_verifier: o.verifier, redirect_uri: o.redirect_uri });

/** A new access token from the refresh token (and maybe a new refresh token: some servers rotate them). */
export const refreshTokens = (net: Net, t: TokenCtx, refresh: string) => tokenRequest(net, t, { grant_type: "refresh_token", refresh_token: refresh });

/** What the vault keeps for one connected MCP server. */
export type McpSecret = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
  /** oauth: where to refresh and how */
  token_endpoint?: string;
  client_id?: string;
  client_secret?: string;
  auth?: TokenAuth;
  resource?: string;
  issuer?: string;
  revocation_endpoint?: string;
};

/** Revoke a token when an owner disconnects (RFC 7009), when the server offers it. Never throws. */
export async function revokeToken(net: Net, s: McpSecret): Promise<void> {
  if (!s.revocation_endpoint || !s.client_id) return;
  try {
    const form = new URLSearchParams({ token: s.refresh_token || s.access_token, client_id: s.client_id });
    if (s.client_secret) form.set("client_secret", s.client_secret);
    const { res } = await guardedFetch(net, s.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }, 8000);
    await res.body?.cancel();
  } catch { /* best effort */ }
}

/* ------------------------------------------------------------------ names */

/** The short name a server's tools go under (mcp__<slug>__<tool>): lowercase letters and digits, at most 16, starting
 *  with a letter; numbered when the workspace already has it. */
export function slugFor(name: string, taken: string[]): string {
  const base = (name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").replace(/^[0-9]+/, "") || "app").slice(0, 14);
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.includes(`${base}${i}`)) return `${base}${i}`;
  return `${base.slice(0, 8)}${crypto.randomUUID().slice(0, 6).replace(/-/g, "")}`;
}

/** A display name for a server from its address, when the owner didn't give one: "notion" from mcp.notion.com. */
export function nameFromUrl(url: string): string {
  try {
    const parts = new URL(url).hostname.split(".").filter((p) => !/^(mcp|api|www|app|ai|connect|server)$/i.test(p));
    const pick = parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? "app";
    return pick.charAt(0).toUpperCase() + pick.slice(1);
  } catch {
    return "App";
  }
}
