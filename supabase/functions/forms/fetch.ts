// Fetching an agency's PDF safely: only government hosts on every hop of a redirect (at most MAX_HOPS), and never more
// than MAX bytes read, counted while the body streams in. Kept apart from index.ts so it can be tested with a fake fetch.

export const MAX = 15 * 1024 * 1024;
export const MAX_HOPS = 5;

/** Agencies whose own site isn't under .gov: SF Planning and Treasurer, Dallas City Hall, OC Health Care Agency and Tax
    Collector, Houston Health and Permitting Center, LAFD, and the City of Austin's document library (austin.widen.net). */
const AGENCY_HOSTS = /(^|\.)(sfplanning\.org|sfgov\.org|sftreasurer\.org|dallascityhall\.com|ochealthinfo\.com|octaxcol\.com|houstonhealth\.org|houstonpermittingcenter\.org|lafd\.org|austin\.widen\.net)$/i;
/** State agencies still on the old state.XX.us addresses (Texas Secretary of State: sos.state.tx.us). */
const STATE_US = /(^|\.)state\.[a-z]{2}\.us$/i;

/** A government host Placetta may fetch forms from: anything under .gov (irs.gov, cdtfa.ca.gov, nyc.gov, ...), plus the
    few agencies above. A plain http link to one of them is fetched over https. */
export function allowed(u: string): URL | null {
  try {
    const url = new URL(u);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    // Austin's library hands the file out from its CDN, under the city's own /austin/ folder
    const austinCdn = url.hostname === "cf-store.widencdn.net" && url.pathname.startsWith("/austin/");
    return /(^|\.)[a-z0-9-]+\.gov$/i.test(url.hostname) || AGENCY_HOSTS.test(url.hostname) || STATE_US.test(url.hostname) || austinCdn ? url : null;
  } catch { return null; }
}

export type Fetched =
  | { ok: true; url: URL; bytes: Uint8Array<ArrayBuffer> }
  | { ok: false; status: number; code: string; en: string; zh: string };

const no = (status: number, code: string, en: string, zh: string): Fetched => ({ ok: false, status, code, en, zh });

/** Read a body, stopping (and cancelling the download) as soon as it passes max bytes. Null when it's too large. */
export async function readCapped(res: Response, max = MAX): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Number(res.headers.get("content-length") ?? 0) > max) { await res.body?.cancel().catch(() => {}); return null; }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Fetch a form, following redirects by hand: each hop must be an allowed government host, at most MAX_HOPS of them. */
export async function fetchForm(start: URL, fetchImpl: typeof fetch = fetch, max = MAX): Promise<Fetched> {
  let url = start;
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PlacettaForms/1.0; +https://placetta.com)", Accept: "application/pdf" },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return no(502, "upstream_error", "The agency's site didn't answer. Open the form from the agency's page instead.", "机构网站没有响应。请从机构页面打开表格。");
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const loc = res.headers.get("location");
      if (!loc) return no(502, "upstream_error", "The agency's site sent a broken redirect.", "机构网站返回了无效的跳转。");
      if (hop + 1 > MAX_HOPS) return no(502, "upstream_error", "The agency's site redirected too many times.", "机构网站跳转次数过多。");
      // A redirect must stay on a government host too, checked before following it.
      let next: URL | null = null;
      try { next = allowed(new URL(loc, url).href); } catch { next = null; }
      if (!next) return no(502, "upstream_error", "The agency moved the form off its own site.", "机构已将表格移出其官方网站。");
      url = next;
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return no(502, "upstream_error", `The agency's site returned ${res.status}. The form may have moved; open the agency's page.`, `机构网站返回 ${res.status}。表格可能已移动，请打开机构页面。`);
    }
    const bytes = await readCapped(res, max);
    if (!bytes) return no(413, "too_large", "That form is larger than 15 MB.", "该表格超过 15 MB。");
    if (!String.fromCharCode(...bytes.subarray(0, 1024)).includes("%PDF-")) {
      return no(502, "not_pdf", "The agency's link didn't return a PDF. Open the agency's page instead.", "机构链接返回的不是 PDF。请从机构页面打开。");
    }
    return { ok: true, url, bytes };
  }
}
