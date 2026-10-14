// forms: the agency's own PDF of an official form, fetched for a signed-in person so the app can hand over (and fill)
// the real government document instead of a Placetta copy. Browsers can't fetch irs.gov and the like directly (no
// CORS), so this passes the file through: only https, only government hosts (.gov), only a PDF, at most 15 MB.
// POST { url } with the person's session; the gateway checks the JWT.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const fail = (status: number, code: string, message: string) =>
  new Response(JSON.stringify({ error: { code, message } }), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const MAX = 15 * 1024 * 1024;

/** Agencies whose own site isn't under .gov: San Francisco Planning, Dallas City Hall, OC Health Care Agency. */
const AGENCY_HOSTS = /(^|\.)(sfplanning\.org|sfgov\.org|dallascityhall\.com|ochealthinfo\.com)$/i;

/** A government host Placetta may fetch forms from: anything under .gov (irs.gov, cdtfa.ca.gov, nyc.gov, ...), plus the
    few agencies above. A plain http link to one of them is fetched over https. */
export function allowed(u: string): URL | null {
  try {
    const url = new URL(u);
    if (url.protocol === "http:") url.protocol = "https:";
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return /(^|\.)[a-z0-9-]+\.gov$/i.test(url.hostname) || AGENCY_HOSTS.test(url.hostname) ? url : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return fail(405, "bad_request", "Use POST.");
  let body: { url?: unknown; as?: unknown };
  try { body = await req.json(); } catch { return fail(400, "bad_request", "Send JSON."); }
  const url = allowed(String(body.url ?? ""));
  if (!url) return fail(400, "bad_request", "Only official government forms (https, .gov) can be fetched.");
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Placetta forms (support@placetta.com)", Accept: "application/pdf" }, signal: AbortSignal.timeout(20000) });
  } catch { return fail(502, "upstream_error", "The agency's site didn't answer. Open the form from the agency's page instead."); }
  // a redirect must stay on a government host too
  if (!allowed(res.url || url.href)) return fail(502, "upstream_error", "The agency moved the form off its own site.");
  if (!res.ok) return fail(502, "upstream_error", `The agency's site returned ${res.status}. The form may have moved; open the agency's page.`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX) return fail(413, "too_large", "That form is larger than 15 MB.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX) return fail(413, "too_large", "That form is larger than 15 MB.");
  if (!String.fromCharCode(...bytes.subarray(0, 1024)).includes("%PDF-")) return fail(502, "not_pdf", "The agency's link didn't return a PDF. Open the agency's page instead.");
  const name0 = decodeURIComponent(url.pathname.split("/").pop() || "form.pdf");
  if (body.as === "base64") {   // for tools that can't take binary (the forms library's own checks)
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return new Response(JSON.stringify({ name: name0, size: bytes.length, base64: btoa(bin) }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }
  const name = decodeURIComponent(url.pathname.split("/").pop() || "form.pdf").replace(/[^\w.-]+/g, "-");
  return new Response(bytes, { headers: { ...CORS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, max-age=3600" } });
});
