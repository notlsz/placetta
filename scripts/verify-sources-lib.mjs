// The link check behind `npm run verify:sources` (scripts/verify-sources.ts), kept free of Node-only APIs so the nightly
// sweeper can import it as is (Deno or Node: only fetch, URL, AbortController and setTimeout).
//
// Polite by design: HEAD first, and a GET only when a server refuses HEAD, cut off as soon as the headers arrive (the body
// is never read). One request at a time per host, with a pause between them (default 2 s), a few hosts in parallel, a
// named user agent with a contact URL, and no retries beyond one GET fallback. It never posts, logs in or submits.

export const USER_AGENT = "PlacettaSourceCheck/1.0 (+https://placetta.com; official-source link check, HEAD/GET only)";

/** What a status means for a source link. "blocked": the agency refuses automated reads (403, 429, a bot wall); the
    page may well be fine, so it's reported but isn't a failure. "moved": the link redirects to another URL, which the
    registry should take. "broken": 404, 410, a 5xx or a name that doesn't resolve. */
export function verdict(r) {
  if (r.error) return /ENOTFOUND|EAI_AGAIN|getaddrinfo|dns/i.test(r.error) ? "broken" : "unreachable";
  if (r.status === 404 || r.status === 410) return "broken";
  if (r.status >= 500) return "unreachable";
  if (r.status === 401 || r.status === 403 || r.status === 429 || r.status === 999) return "blocked";
  if (r.status >= 200 && r.status < 400) return r.finalUrl && sameish(r.finalUrl, r.url) ? "ok" : "moved";
  return "unreachable";
}

/** Two URLs that differ only by a trailing slash, the scheme, case of the host or a "www." are the same page. */
export function sameish(a, b) {
  const n = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "").toLowerCase() + x.pathname.replace(/\/+$/, "") + x.search); } catch { return u; } };
  return n(a) === n(b);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(url, method, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { method, redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/pdf,application/xhtml+xml;q=0.9,*/*;q=0.8" } });
    // never read the body: the headers are the answer
    try { await res.body?.cancel(); } catch { /* already closed */ }
    return { status: res.status, finalUrl: res.url || url, type: res.headers.get("content-type") ?? "", ms: Date.now() - started };
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message || "";
    return { error: (e?.name === "AbortError" ? "timeout" : String(e?.message ?? e)) + (cause ? ` (${cause})` : ""), ms: Date.now() - started };
  } finally { clearTimeout(t); }
}

/** HEAD, then one GET when the server won't answer HEAD (405, 403, 501, a timeout or a reset). */
export async function checkUrl(url, { timeoutMs = 20000 } = {}) {
  let r = await once(url, "HEAD", timeoutMs);
  if (r.error || [400, 403, 404, 405, 406, 429, 500, 501, 503].includes(r.status)) {
    const g = await once(url, "GET", timeoutMs);
    if (!g.error || r.error) r = { ...g, via: "GET" };
  }
  const out = { url, ...r };
  out.verdict = verdict(out);
  return out;
}

/** Check every URL, one at a time per host with `delayMs` between requests to it, `hosts` hosts at once. */
export async function checkAll(urls, { delayMs = 2000, hosts = 4, timeoutMs = 20000, onResult } = {}) {
  const byHost = new Map();
  for (const u of new Set(urls)) {
    let h; try { h = new URL(u).hostname; } catch { h = "invalid"; }
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(u);
  }
  const queue = [...byHost.entries()];
  const results = [];
  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [host, list] = next;
      for (let i = 0; i < list.length; i++) {
        const r = host === "invalid" ? { url: list[i], error: "invalid URL", verdict: "broken" } : await checkUrl(list[i], { timeoutMs });
        results.push(r);
        onResult?.(r);
        if (i < list.length - 1) await sleep(delayMs);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, hosts) }, worker));
  return results;
}
