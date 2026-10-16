// forms: the agency's own PDF of an official form, fetched for a signed-in person so the app can hand over (and fill)
// the real government document instead of a Placetta copy. Browsers can't fetch irs.gov and the like directly (no
// CORS), so this passes the file through: only https, only government hosts (.gov) on every redirect hop (at most 5),
// only a PDF, at most 15 MB (counted as it downloads), and at most RATE_LIMIT fetches an hour per person.
// POST { url } with the person's session (requireUser checks it).
// With the monitor key, POST { url, keep: "<form id>" } also keeps a copy in the public official-forms bucket (these are
// public government forms), so the forms library can read each form's boxes and check a filled copy.

import { admin, CORS_HEADERS, HttpError, readBody, requireUser, serve } from "./shared.ts";
import { allowed, fetchForm } from "./fetch.ts";

const RATE_LIMIT = Math.max(1, Number(Deno.env.get("FORMS_PER_HOUR") ?? "60") || 60);

serve(async (req) => {
  const monitorKey = req.headers.get("x-monitor-key");
  // Who is asking, before anything is fetched: the monitor (keeping a copy), or a signed-in person, rate limited.
  if (monitorKey) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: monitorKey });
    if (good !== true) throw new HttpError("unauthorized", "Bad key.");
  } else {
    const { user } = await requireUser(req);
    const { data: allowedHit, error } = await admin.rpc("rate_hit", { p_key: `forms:${user.id}`, p_limit: RATE_LIMIT, p_window_seconds: 3600 });
    if (error) throw new Error(`rate limit check failed: ${error.code ?? ""}`);
    if (allowedHit !== true) {
      throw new HttpError("rate_limited", "Too many forms fetched in the last hour. Try again later, or open the form from the agency's page.",
        "过去一小时内获取的表格太多。请稍后再试，或从机构页面打开表格。");
    }
  }

  const body = await readBody(req);
  const url = allowed(String(body.url ?? ""));
  if (!url) throw new HttpError("bad_request", "Only official government forms (https, .gov) can be fetched.", "只能获取政府官方表格（https、.gov）。");
  const got = await fetchForm(url);
  if (!got.ok) {
    return new Response(JSON.stringify({ error: { code: got.code, message: got.en, message_zh: got.zh } }),
      { status: got.status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  const { bytes } = got;

  if (typeof body.keep === "string") {
    if (!monitorKey) throw new HttpError("unauthorized", "Bad key.");
    const id = body.keep.replace(/[^a-z0-9-]/gi, "").slice(0, 60);
    const { error } = await admin.storage.from("official-forms").upload(`${id}.pdf`, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new HttpError("upstream_error", "Couldn't keep a copy.");
    return new Response(JSON.stringify({ kept: `${id}.pdf`, size: bytes.length }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  const last = got.url.pathname.split("/").pop() || "form.pdf";
  let name0 = last;
  try { name0 = decodeURIComponent(last); } catch { /* a stray % in the path: keep it as is */ }
  if (body.as === "base64") {   // for tools that can't take binary (the forms library's own checks)
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return new Response(JSON.stringify({ name: name0, size: bytes.length, base64: btoa(bin) }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
  const name = name0.replace(/[^\w.-]+/g, "-");
  return new Response(bytes, { headers: { ...CORS_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, max-age=3600" } });
});
