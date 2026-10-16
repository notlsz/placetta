// file: Placetta submits an approved filing itself, by email, fax, certified mail or the agency's portal.
//
// POST { workspace_id, filing_id, action }
//   start   the customer just approved it: check it, pick the channel, send (or queue it for the portal worker)
//   resume  "I've done my part, carry on" after a hand-back
//   signed  { path } the hand-signed copy of a wet-signature form, uploaded to Documents: Placetta faxes it
//   status  refresh a fax or letter that's on its way
//   stop    the customer stops it before anything has left for the agency (refused once submit_clicked_at is set)
//   team_approve, take_over   the Placetta team (two-step) in the two-key period, or taking a run over
// POST { action: "sweep" } with x-monitor-key: the monitor's run (stuck runs, fax and mail status, stale destinations)
// POST ?provider=telnyx: Telnyx fax webhooks, verified with TELNYX_PUBLIC_KEY.
//
// Ground rules: one approval, one submission (only filings.payload, which the database keeps frozen); submit_clicked_at
// is written before anything leaves, and a filing with it set is never sent again; CAPTCHAs, identity checks, payments
// and wet signatures go back to the person; no SSN or ITIN is ever sent; destinations come only from destinations.ts;
// a form self-files only when its id is in FILER_AGENCIES and the channel is in FILER_CHANNELS.
import { PDFDocument, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  admin, aalOf, describe, HttpError, isStaff, ok, readBody, requireAccess, requireUser, serve, uuidParam,
  SUPABASE_URL, b64urlDecode, utf8,
} from "./shared.ts";
import { DEST, staleDestinations, type Dest } from "./destinations.ts";
import {
  askedToResubmit, canFaxSigned, check, DUPLICATE_REF, emailFor, envFrom, faxFailures, faxFile, faxTo, type Filing, isForeign, killSwitchOn,
  type LogEntry, mailOutcome, mailTo, pick, type Refusal, refusalOf, signedCopy, teamApproved,
} from "./logic.ts";

const env = () => envFrom((k) => Deno.env.get(k));
const COLS = "id, workspace_id, app_id, title, status, payload, channel, agent_state, agent_log, handoff_url, provider_ref, submit_clicked_at, attempts, requirements_checked, confirmation_number, portal_url, receipt_path, fee_estimate";
const log = (en: string, zh: string, kind = "info", ref?: string): LogEntry => ({ en, zh, kind, ...(ref ? { ref } : {}) });

// ------------------------------------------------------------------ the filing row

async function loadFiling(ws: string, id: string): Promise<Filing> {
  const { data, error } = await admin.from("filings").select(COLS).eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(`filing lookup failed: ${error.code ?? ""}`);
  if (!data) throw new HttpError("not_found", "No such filing in this workspace.", "此工作区中没有这份申请。");
  return data as unknown as Filing;
}

/** The database refused a step or a claim because the filing moved on (another call acted first, it was already sent,
    it was stopped) or the workspace is at its daily cap. Callers answer with the filing as it is now. */
class Refused extends Error {
  constructor(readonly why: Refusal) {
    super(`refused: ${why}`);
  }
}

/** Append to the log, patch the agent columns, and write the audit row (actor agent), in one statement. The patch may
    carry expect_agent_state / expect_provider_ref: the step then runs only if the row still has those values. */
async function step(f: Filing, entry: LogEntry | null, patch: Record<string, unknown> = {}, auditIt = true): Promise<Filing> {
  const { data, error } = await admin.rpc("filing_agent_step", { p_id: f.id, p_entry: entry, p_patch: patch, p_audit: auditIt });
  if (error) {
    const why = refusalOf(error.message);
    if (why) throw new Refused(why);
    throw new Error(`filing step failed: ${error.message?.slice(0, 200) ?? error.code}`);
  }
  return data as unknown as Filing;
}

/** What the app shows. */
function view(f: Filing) {
  return {
    filing: {
      id: f.id, status: f.status, channel: f.channel, agent_state: f.agent_state, agent_log: f.agent_log, handoff_url: f.handoff_url,
      confirmation_number: f.confirmation_number, submit_clicked_at: f.submit_clicked_at,
    },
  };
}

/** Tells the team right away when work lands in their queue (the monitor still sends a daily reminder for anything left waiting). */
async function alertTeam(f: Filing, kind: string, title: string) {
  const key = Deno.env.get("RESEND_API_KEY"), from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return;
  const { data: staff } = await admin.from("staff_emails").select("email");
  const to = (staff ?? []).map((s) => s.email as string).filter(Boolean);
  if (!to.length) return;
  const { data: w } = await admin.from("workspaces").select("name").eq("id", f.workspace_id).maybeSingle();
  const app = (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean)[0] ?? "";
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const what = f.title?.en ?? "A filing", who = (w?.name as string | undefined) ?? "a customer";
  const subject = kind === "destination_stale" ? `Team task: ${title}` : `New for the team: ${what} (${who})`;
  const text = `${what} for ${who}\n\n${title}\n\n${app ? `Filing queue: ${app}/app/` : ""}`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif"><p><b>${esc(what)}</b> for ${esc(who)}</p><p>${esc(title)}</p>${app ? `<p><a href="${esc(app)}/app/">Open the filing queue</a></p>` : ""}</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!r.ok) console.error("team alert failed:", r.status);
  } catch (e) { console.error("team alert failed:", (e as Error).message); }
}

async function teamTask(f: Filing, kind: string, title: string, detail?: unknown) {
  const { data, error } = await admin.from("team_tasks").upsert(
    { kind, filing_id: f.id, workspace_id: f.workspace_id, title, detail: detail ?? null, dedupe: `${kind}:${f.id}:${f.attempts}` },
    { onConflict: "dedupe", ignoreDuplicates: true },
  ).select("id");
  if (error) { console.error("team task insert failed:", error.code ?? ""); return; }
  if (data?.length) await alertTeam(f, kind, title);   // only the first time, never for a repeat
}

async function toTeam(f: Filing, en: string, zh: string, kind = "handoff") {
  // The status stays as it was: a request nobody has started can still be canceled.
  const g = await step(f, log(en, zh, "handoff"), { channel: "team", agent_state: "handoff" });
  await teamTask(g, kind, en);
  return view(g);
}

async function needsYou(f: Filing, en: string, zh: string, handoff_url: string | null = null, kind = "needs_you") {
  return view(await step(f, log(en, zh, kind), { agent_state: "needs_you", handoff_url }));
}

// ------------------------------------------------------------------ facts about the workspace

async function docPaths(f: Filing): Promise<Set<string>> {
  const p = f.payload;
  const want = [p.pdf_path, signedCopy(f), ...(p.attachments ?? []).map((a) => a.path)].filter((x): x is string => typeof x === "string");
  if (!want.length) return new Set();
  const { data, error } = await admin.from("documents").select("path").eq("workspace_id", f.workspace_id).in("path", want);
  if (error) throw new Error(`documents lookup failed: ${error.code ?? ""}`);
  return new Set((data ?? []).map((r) => r.path as string));
}

const hostOf = (u: string | null | undefined) => { try { return u ? new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.toLowerCase() : ""; } catch { return ""; } };

async function facts(f: Filing, d: Dest | undefined) {
  const [logins, mail] = await Promise.all([
    d?.portal ? admin.from("agency_logins").select("url").eq("workspace_id", f.workspace_id) : Promise.resolve({ data: [], error: null }),
    admin.from("integrations").select("kind").eq("workspace_id", f.workspace_id).in("kind", ["gmail", "outlook_mail"]).eq("status", "connected"),
  ]);
  if (logins.error || mail.error) throw new Error("workspace lookup failed");
  return {
    hasLogin: !!d?.portal && (logins.data ?? []).some((r) => hostOf(r.url as string) === d.portal),
    mailConnected: (mail.data ?? []).length > 0,
  };
}

/** Filings of this form Placetta already submitted itself: the two-key period covers the first FILER_TWO_KEY. */
async function selfFiledCount(official: string): Promise<number> {
  const { count, error } = await admin.from("filings").select("id", { count: "exact", head: true })
    .eq("payload->>official", official).in("channel", ["email", "fax", "mail", "portal"]).in("status", ["submitted", "accepted"]);
  if (error) throw new Error(`count failed: ${error.code ?? ""}`);
  return count ?? 0;
}

async function signedUrl(path: string): Promise<string> {
  const { data, error } = await admin.storage.from("documents").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error("Couldn't make a link to the form.");
  return data.signedUrl;
}

/** Store a receipt in Documents and link it as the filing's receipt. */
async function saveReceipt(f: Filing, name: string, bytes: Uint8Array, mime: string): Promise<string | null> {
  const path = `${f.workspace_id}/receipts/${f.id}-${Date.now()}-${name.replace(/[^\w.-]+/g, "_")}`;
  const up = await admin.storage.from("documents").upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) { console.error("receipt upload failed:", up.error.message?.slice(0, 120)); return null; }
  const { error } = await admin.from("documents").insert({ workspace_id: f.workspace_id, app_id: f.app_id, filing_id: f.id, name, path, size: bytes.length, mime, source: "agent", uploaded_by: null });
  if (error) { await admin.storage.from("documents").remove([path]); return null; }
  return path;
}

async function receiptPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l.replace(/[^\x20-\x7e]/g, " "), { x: 56, y: 720 - i * 18, size: i === 0 ? 14 : 10, font }));
  return await doc.save();
}

// ------------------------------------------------------------------ channels

/** Claim the filing for sending, right before anything leaves: one conditional UPDATE in the database writes
    submit_clicked_at only if nobody has, so of any number of concurrent callers exactly one gets past this line. The
    same claim enforces the workspace's daily cap on faxes and letters. Throws Refused otherwise. */
async function markSubmit(f: Filing, en: string, zh: string): Promise<Filing> {
  if (f.submit_clicked_at) throw new Refused("already");
  const { data, error } = await admin.rpc("filing_claim_submit", { p_id: f.id, p_entry: log(en, zh, "submit"), p_cap: env().dailyCap });
  if (error) {
    const why = refusalOf(error.message);
    if (why) throw new Refused(why);
    throw new Error(`filing claim failed: ${error.message?.slice(0, 200) ?? error.code}`);
  }
  return data as unknown as Filing;
}

/** markSubmit, except that a workspace at its daily cap hands the filing to the team instead of sending it. */
async function claimOrTeam(f: Filing, en: string, zh: string): Promise<Filing | ReturnType<typeof view>> {
  try {
    return await markSubmit(f, en, zh);
  } catch (e) {
    if (!(e instanceof Refused) || e.why !== "cap") throw e;
    const n = env().dailyCap;
    return await toTeam(f,
      `Placetta has sent ${n} filings by fax or mail for this business in the last 24 hours, the most it sends on its own in a day. The Placetta team sends this one.`,
      `过去 24 小时内，快哉已为该商家通过传真或邮寄自动提交了 ${n} 份申请，已达每日上限。这一份由快哉团队提交。`, "review");
  }
}
const isView = (x: Filing | ReturnType<typeof view>): x is ReturnType<typeof view> => "filing" in x;

/** The two-key period and dry runs: stop before sending, the team reviews. */
async function holdForTeam(f: Filing, d: Dest): Promise<ReturnType<typeof view> | null> {
  const e = env();
  if (e.dryRun) {
    return await toTeam(f, "Dry run: everything is ready to send. The Placetta team reviews it; nothing was sent.", "演练：已准备好发送，由快哉团队审核，未实际发送。", "review");
  }
  if (!teamApproved(f) && (await selfFiledCount(f.payload.official!)) < e.twoKey) {
    const g = await step(f, log("With the Placetta team for a final check before it's sent", "快哉团队正在发送前做最后核对", "review_wait"), { agent_state: "handoff" });
    await teamTask(g, "review", `Two-key review before Placetta sends ${f.payload.official} (${f.channel}). Approve or take it over.`, { source: d.source });
    return view(g);
  }
  return null;
}

async function sendEmail(f: Filing, d: Dest) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const secret = Deno.env.get("FILER_SECRET") ?? "";
  if (secret.length < 32) return await toTeam(f, "Email filing isn't set up yet (FILER_SECRET).", "邮件提交尚未配置。");
  const { subject, body } = emailFor(f);
  const claimed = await claimOrTeam(f, `Emailing it to ${d.email}`, `正在发送邮件至 ${d.email}`);
  if (isView(claimed)) return claimed;
  const g = claimed;
  const files = [f.payload.pdf_path, ...(f.payload.attachments ?? []).map((a) => a.path)].filter(Boolean).slice(0, 5).map((path) => ({ path }));
  let res: Response | null = null;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/integrations`, {
      method: "POST",
      // The gateway wants a JWT on integrations: the anon key's passes it and grants nothing. x-filer-secret is what
      // integrations itself checks.
      headers: { "Content-Type": "application/json", "x-filer-secret": secret, Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY") ?? ""}` },
      body: JSON.stringify({ action: "mail_send", workspace_id: f.workspace_id, filing_id: f.id, to: [d.email], subject, body, attachments: files }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    console.error("filer mail_send:", describe(e));
  }
  const out = res ? await res.json().catch(() => ({})) : {};
  const outcome = mailOutcome(res?.status ?? null);
  if (outcome === "unknown") {
    // No answer, or the server failed partway: the email may have left. The team checks; nothing is sent again.
    console.error("filer mail_send unknown:", res?.status ?? "timeout");
    await teamTask(g, "check_agency", "The email send didn't confirm (timeout or server error). Check the customer's Sent folder before sending again.");
    return await toTeam(g, "The email didn't confirm. The team is checking whether it went before anything is sent again.", "邮件未确认送出。团队会先核实是否已发出，再决定是否重发。", "check_agency");
  }
  if (outcome === "refused") {
    const msg = String(out?.error?.message ?? `error ${res?.status}`).slice(0, 200);
    // A refusal before sending (bad input, not connected, too large) is safe to hand to the team as not sent.
    return await toTeam(g, `The email wasn't sent: ${msg}`, `邮件未发送：${String(out?.error?.message_zh ?? msg).slice(0, 200)}`);
  }
  const from = String(out.account ?? "");
  const h = await step(g, log(`Emailed the ${f.payload.form?.en ?? "form"} to ${d.email}${from ? ` from ${from}` : ""}`, `已从 ${from || "您的邮箱"} 将${f.payload.form?.zh ?? "表格"}发送至 ${d.email}`, "submitted", String(out.id ?? "")),
    { provider_ref: String(out.id ?? ""), status: "submitted", agent_state: "done", requirements_checked: true });
  return view(h);
}

const TELNYX = "https://api.telnyx.com/v2";

async function sendFax(f: Filing, d: Dest, retry = false) {
  if (!retry) { const held = await holdForTeam(f, d); if (held) return held; }
  const to = faxTo(d, f.payload);
  if (!to) return await toTeam(f, "There's no fax number for this applicant.", "没有适用于该申请人的传真号码。");
  let g = f;
  if (!retry) {
    const claimed = await claimOrTeam(f, `Faxing it to ${to}${isForeign(f.payload) ? " (international applicants)" : ""}`, `正在传真至 ${to}`);
    if (isView(claimed)) return claimed;
    g = claimed;
  }
  const media_url = await signedUrl(faxFile(f)!);
  const res = await fetch(`${TELNYX}/faxes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("TELNYX_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ connection_id: Deno.env.get("TELNYX_FAX_CONNECTION_ID"), from: Deno.env.get("TELNYX_FAX_FROM"), to, media_url, quality: d.faxQuality ?? "high", monochrome: true }),
    signal: AbortSignal.timeout(30000),
  }).catch((e) => { console.error("telnyx:", describe(e)); return null; });
  const body = res ? await res.json().catch(() => ({})) : {};
  const id = body?.data?.id as string | undefined;
  if (!res || !res.ok || !id) {
    console.error("telnyx refused:", res?.status, JSON.stringify(body?.errors ?? "").slice(0, 200));
    return await toTeam(g, "The fax service didn't take the fax. The team will send it.", "传真服务未接收，团队会处理。");
  }
  return view(await step(g, log("Fax queued with the fax service", "传真已进入发送队列", "fax_queued", id), { provider_ref: id, agent_state: "running", channel: "fax" }));
}

/** Apply a fax status from the API or a webhook. The webhook, the monitor's sweep and a member's "status" can all see
    the same result at once: each change compares-and-sets on the fax id it read, so only the first caller records a
    delivery or a failure, and only that one resends. */
async function applyFax(f: Filing, status: string, info: { pages?: number; reason?: string } = {}) {
  if (f.agent_state !== "running" || f.channel !== "fax" || !f.provider_ref) return view(f);
  const ref = f.provider_ref;
  const same = { expect_agent_state: "running", expect_provider_ref: ref };
  if (status === "delivered") {
    const d = DEST[f.payload.official ?? ""];
    const to = d ? faxTo(d, f.payload) : "";
    const g = await step(f, log(`Faxed to the agency at ${to}. Delivered.`, `已传真至机构 ${to}，已送达。`, "submitted", ref),
      { ...same, status: "submitted", agent_state: "done", requirements_checked: true });
    const pdf = await receiptPdf(["Fax delivery confirmation", `Form: ${f.payload.form?.en ?? f.payload.official}`, `To: ${to}`, `Fax id: ${ref}`,
      ...(info.pages ? [`Pages: ${info.pages}`] : []), `Delivered: ${new Date().toISOString()}`, "Sent by Placetta on the applicant's behalf."]);
    const path = await saveReceipt(g, "fax-confirmation.pdf", pdf, "application/pdf");
    return view(path ? await step(g, null, { receipt_path: path }, false) : g);
  }
  if (status === "failed") {
    // Claim this failure by clearing the fax id it belongs to; a second caller with the same id is refused here.
    const g = await step(f, log(`The fax didn't go through${info.reason ? ` (${info.reason})` : ""}`, `传真未送达${info.reason ? `（${info.reason}）` : ""}`, "fax_failed", ref),
      { ...same, provider_ref: null });
    // Counted from the row the database just returned, not from what this caller read earlier.
    if (faxFailures(g) < 3) return await sendFax(g, DEST[f.payload.official ?? ""]!, true);
    return await toTeam(g, "The fax failed 3 times. The team will send it.", "传真 3 次未送达，团队会处理。");
  }
  return view(f);
}

async function refreshFax(f: Filing) {
  if (!f.provider_ref || !Deno.env.get("TELNYX_API_KEY")) return view(f);
  const res = await fetch(`${TELNYX}/faxes/${encodeURIComponent(f.provider_ref)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("TELNYX_API_KEY")}` }, signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res?.ok) return view(f);
  const data = (await res.json().catch(() => ({})))?.data ?? {};
  return await applyFax(f, String(data.status ?? ""), { pages: data.page_count, reason: data.failure_reason });
}

const LOB = "https://api.lob.com/v1";
const lobAuth = () => `Basic ${btoa(`${Deno.env.get("LOB_API_KEY")}:`)}`;
const lobAddress = (a: { name: string; line1: string; line2?: string; city: string; state: string; zip: string; country?: string }) => ({
  name: a.name.slice(0, 40), address_line1: a.line1, ...(a.line2 ? { address_line2: a.line2 } : {}), address_city: a.city, address_state: a.state, address_zip: a.zip, address_country: a.country ?? "US",
});

async function sendMail(f: Filing, d: Dest) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const to = mailTo(d, f.payload);
  let from: Record<string, string>;
  try { from = JSON.parse(Deno.env.get("LOB_FROM") ?? ""); } catch { return await toTeam(f, "Certified mail isn't set up yet (return address).", "挂号信尚未配置寄件地址。"); }
  if (!to) return await toTeam(f, "There's no mailing address for this form.", "该表格没有邮寄地址。");
  const claimed = await claimOrTeam(f, `Mailing it by certified mail to ${to.name}, ${to.city}`, `正在以挂号信寄往 ${to.name}，${to.city}`);
  if (isView(claimed)) return claimed;
  const g = claimed;
  const file = await signedUrl(f.payload.pdf_path!);
  const res = await fetch(`${LOB}/letters`, {
    method: "POST",
    headers: { Authorization: lobAuth(), "Content-Type": "application/json", "Idempotency-Key": f.id },
    body: JSON.stringify({
      description: `Placetta ${f.payload.official} ${f.id}`.slice(0, 255), to: lobAddress(to), from, file, color: false,
      extra_service: "certified", use_type: "operational", address_placement: "insert_blank_page", metadata: { filing: f.id },
    }),
    signal: AbortSignal.timeout(30000),
  }).catch((e) => { console.error("lob:", describe(e)); return null; });
  const body = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok || !body?.id) {
    console.error("lob refused:", res?.status, JSON.stringify(body?.error ?? "").slice(0, 200));
    return await toTeam(g, "The mail service didn't take the letter. The team will mail it.", "邮寄服务未接收信件，团队会处理。", "check_agency");
  }
  const tracking = String(body.tracking_number ?? "");
  const h = await step(g, log(`Sent by certified mail to ${to.name}${tracking ? `. Tracking ${tracking}` : ""}${body.expected_delivery_date ? `, expected ${body.expected_delivery_date}` : ""}`,
    `已以挂号信寄往 ${to.name}${tracking ? `，追踪号 ${tracking}` : ""}${body.expected_delivery_date ? `，预计 ${body.expected_delivery_date} 送达` : ""}`, "submitted", body.id),
    { provider_ref: body.id, status: "submitted", agent_state: "done", requirements_checked: true, ...(tracking ? { confirmation_number: tracking } : {}) });
  await admin.from("updates").upsert({
    workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `mailed:${f.id}`,
    title: { en: `Mailed: ${f.title.en}`, zh: `已寄出：${f.title.zh}` },
    body: { en: "Answers to mailed forms usually come back by post in about 4 to 5 weeks.", zh: "邮寄表格的回复通常约 4 至 5 周后寄回。" },
  }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  return view(h);
}

/** The letter's proof, once Lob has rendered it. */
async function refreshMail(f: Filing) {
  if (!f.provider_ref || !Deno.env.get("LOB_API_KEY") || f.channel !== "mail") return view(f);
  const res = await fetch(`${LOB}/letters/${encodeURIComponent(f.provider_ref)}`, { headers: { Authorization: lobAuth() }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) return view(f);
  const l = await res.json().catch(() => ({}));
  const events = Array.isArray(l.tracking_events) ? l.tracking_events : [];
  const seen = new Set(f.agent_log.filter((e) => e.kind === "mail_event").map((e) => e.ref));
  let g = f;
  for (const ev of events) {
    const id = String(ev.id ?? ev.name ?? "");
    if (!id || seen.has(id)) continue;
    const what = String(ev.name ?? ev.type ?? "Update").slice(0, 80);
    g = await step(g, log(`Mail: ${what}${ev.location ? `, ${ev.location}` : ""}`, `邮件：${what}${ev.location ? `，${ev.location}` : ""}`, "mail_event", id), {}, false);
  }
  const receipt = (f as unknown as { receipt_path?: string | null }).receipt_path;
  if (!receipt && typeof l.url === "string" && l.url.startsWith("https://")) {
    const pdf = await fetch(l.url, { signal: AbortSignal.timeout(20000) }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (pdf) {
      const path = await saveReceipt(g, "certified-mail-proof.pdf", new Uint8Array(pdf), "application/pdf");
      if (path) g = await step(g, log("Saved the mail proof", "已保存邮寄凭证", "receipt"), { receipt_path: path }, false);
    }
  }
  return view(g);
}

// ------------------------------------------------------------------ the actions

/** An earlier filing of the same form with the same answers in the last 30 days, if any. */
async function duplicateOf(f: Filing): Promise<{ id: string; approved_at: string } | null> {
  const { data, error } = await admin.rpc("filing_duplicate_of", { p_id: f.id, p_days: 30 });
  if (error) throw new Error(`duplicate check failed: ${error.code ?? ""}`);
  return (data as { id: string; approved_at: string } | null) ?? null;
}

async function start(f: Filing, req: Request, by: string, resubmit = false) {
  if (f.agent_state) return view(f);                                 // already started: idempotent
  if (["canceled", "accepted", "rejected", "submitted"].includes(f.status)) throw new HttpError("bad_request", "This filing is already finished.", "这份申请已经办完。");
  // Claim the run: of two calls racing to start the same filing, only one moves it out of "not started".
  f = await step(f, null, { expect_agent_state: null, agent_state: "running" }, false);
  const e = env();
  // Who approved and signed, from where: the e-signature record.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const s = f.payload.signature;
  if (s && !f.agent_log.some((x) => x.kind === "signature")) f = await step(f, log(`Signed by ${s.name}${s.title ? `, ${s.title}` : ""} at ${s.signed_at}${ip ? ` from ${ip}` : ""}`, `由 ${s.name}${s.title ? `（${s.title}）` : ""} 于 ${s.signed_at} 签署${ip ? `，IP ${ip}` : ""}`, "signature", `${by} ${ua}`.trim()));
  if (resubmit && !askedToResubmit(f)) f = await step(f, log("You asked Placetta to send it again", "您要求快哉再次提交", "resubmit", by));

  // The same form with the same answers again: not sent unless the person says it's a resubmission.
  if (!askedToResubmit(f)) {
    const dup = await duplicateOf(f);
    if (dup) {
      const day = String(dup.approved_at).slice(0, 10);
      return view(await step(f, log(
        `You already approved this form with the same answers on ${day}. Placetta doesn't send the same filing twice. If the agency asked for it again, tap "Send it again".`,
        `您已于 ${day} 批准过答案完全相同的这份表格。快哉不会重复提交同一份申请。如果机构要求重新提交，请点击“再次提交”。`,
        "needs_you", DUPLICATE_REF), { agent_state: "needs_you", handoff_url: null }));
    }
  }

  if (!killSwitchOn(f, e)) return await toTeam(f, "Self-filing isn't on for this agency yet. The Placetta team submits it.", "该机构尚未开通自动提交，由快哉团队提交。");
  const d = DEST[f.payload.official ?? ""];
  const problems = check(f, d, { docPaths: await docPaths(f) });
  if (problems.length) {
    return await needsYou(f, problems.map((p) => p.en).join(". ").slice(0, 900), problems.map((p) => p.zh).join("；").slice(0, 900), null, "needs_you");
  }
  const channel = pick(f, d, e, await facts(f, d));
  if (channel === "team" && d?.signature === "wet" && !d.portal) {
    const where = d.fax ? `fax it to ${faxTo(d, f.payload)}` : d.mail ? `mail it to ${mailTo(d, f.payload)?.name}, ${mailTo(d, f.payload)?.city}` : "send it to the agency";
    const whereZh = d.fax ? `传真至 ${faxTo(d, f.payload)}` : d.mail ? `寄往 ${mailTo(d, f.payload)?.name}` : "交给机构";
    if (canFaxSigned(d, e)) {
      // ref "upload": the app shows an upload button for the signed copy.
      return view(await step(f, log(
        "This agency needs a handwritten signature. Download the filled form from Documents, sign it by hand, then upload a scan or a clear photo of the signed page here. Placetta faxes it to the agency and saves the confirmation.",
        "该机构要求手写签名。请从“文件”下载已填写的表格，手写签名后，在此上传签名页的扫描件或清晰照片。快哉会将其传真给机构并保存送达确认。",
        "wet_signature", "upload"), { channel: "team", requirements_checked: true, agent_state: "needs_you", handoff_url: null }));
    }
    return await needsYou(await step(f, null, { channel: "team", requirements_checked: true }),
      `This agency needs a handwritten signature. Download the filled form from Documents, sign it by hand, then ${where}. Tap "I've done it" when it's sent.`,
      `该机构要求手写签名。请从“文件”下载已填写的表格，手写签名后${whereZh}。发出后点击“我已完成”。`, null, "wet_signature");
  }
  f = await step(f, log("Checked against the agency's requirements", "已按机构要求核对", "check"),
    { channel, agent_state: channel === "team" ? "handoff" : "running", requirements_checked: true, status: "in_progress" });
  switch (channel) {
    case "email": return await sendEmail(f, d!);
    case "fax": return await sendFax(f, d!);
    case "mail": return await sendMail(f, d!);
    case "portal": return view(await step(f, log("Opening the agency's site", "打开机构网站", "queued"), { agent_state: "queued" }));
    default:
      await teamTask(f, "handoff", "No automatic channel for this form yet.");
      return view(await step(f, log("No automatic channel for this form yet. The Placetta team submits it.", "该表格暂无自动提交方式，由快哉团队提交。", "handoff")));
  }
}

async function resume(f: Filing, by: string, resubmit = false) {
  if (f.agent_state !== "needs_you") return view(f);
  // Every change below compares-and-sets on needs_you, so two taps on "carry on" act once.
  const was = { expect_agent_state: "needs_you" };
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind === "needs_you" && last.ref === DUPLICATE_REF) {
    if (!resubmit) {
      throw new HttpError("bad_request", "This is the same as a filing you already approved. Tap \"Send it again\" if the agency asked for it again.",
        "这与您已批准过的申请完全相同。如果机构要求重新提交，请点击“再次提交”。");
    }
    const g = await step(f, log("You asked Placetta to send it again", "您要求快哉再次提交", "resubmit", by), { ...was, agent_state: null, handoff_url: null });
    return await startAgain(g);
  }
  if (last?.kind === "wet_signature") {
    const g = await step(f, log("You signed and sent it yourself. The Placetta team confirms it reached the agency.", "您已亲自签署并发出，快哉团队会确认机构已收到。", "you_sent"), { ...was, agent_state: "handoff", channel: "team" });
    await teamTask(g, "review", "Customer says they signed and sent the form themselves. Confirm with the agency and record the submission.");
    return view(g);
  }
  if (f.channel === "portal") {
    return view(await step(f, log("You finished your step. Placetta carries on.", "您已完成这一步，快哉继续办理。", "resume", by), { ...was, agent_state: "queued", handoff_url: null }));
  }
  // A check that failed earlier: run the checks again from the start.
  const g = await step(f, log("Checking it again", "重新核对", "resume", by), { ...was, agent_state: null, handoff_url: null }, false);
  return await startAgain(g);
}
const startAgain = (f: Filing) => start(f, new Request("https://local"), "resume");

/** The person signed a wet-signature form by hand and uploaded it: check the file, turn a photo into a PDF the fax
    service takes, record it, and run the filing again so it goes by fax. */
async function signed(f: Filing, path: string, by: string) {
  if (f.agent_state !== "needs_you") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind !== "wet_signature") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const d = DEST[f.payload.official ?? ""];
  if (!canFaxSigned(d, env())) throw new HttpError("bad_request", "Placetta can't fax this form yet. Send it yourself, then tap \"I've done it\".");
  if (!path.startsWith(`${f.workspace_id}/`)) throw new HttpError("bad_request", "That file isn't in this workspace.");
  const { data: doc, error } = await admin.from("documents").select("path, name, mime").eq("workspace_id", f.workspace_id).eq("path", path).maybeSingle();
  if (error) throw new Error(`documents lookup failed: ${error.code ?? ""}`);
  if (!doc) throw new HttpError("bad_request", "Upload the signed copy to Documents first.");
  const mime = String(doc.mime ?? "").toLowerCase();
  let faxPath = path;
  if (mime !== "application/pdf") {
    if (!/^image\/(jpeg|jpg|png)$/.test(mime)) throw new HttpError("bad_request", "Upload the signed copy as a PDF, JPG or PNG.");
    const dl = await admin.storage.from("documents").download(path);
    if (dl.error || !dl.data) throw new Error("Couldn't read the signed copy.");
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    if (bytes.length > 15 * 1024 * 1024) throw new HttpError("bad_request", "The photo is too large. Upload one under 15 MB.");
    const pdf = await PDFDocument.create();
    const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Letter size, the image scaled to fit inside half-inch margins.
    const W = 612, H = 792, M = 36, k = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height);
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: (W - img.width * k) / 2, y: (H - img.height * k) / 2, width: img.width * k, height: img.height * k });
    const saved = await saveReceipt(f, "signed-form.pdf", await pdf.save(), "application/pdf");
    if (!saved) throw new Error("Couldn't save the signed copy as a PDF.");
    faxPath = saved;
  }
  const g = await step(f, log("You signed it by hand and uploaded it. Placetta faxes it to the agency.", "您已手写签名并上传，快哉将传真给机构。", "signed_copy", faxPath),
    { expect_agent_state: "needs_you", agent_state: null, handoff_url: null });
  console.log("signed copy uploaded by", by.slice(0, 120));
  return await startAgain(g);
}

async function refreshStatus(f: Filing) {
  if (f.channel === "fax") return await refreshFax(f);
  if (f.channel === "mail") return await refreshMail(f);
  return view(f);
}

async function teamApprove(f: Filing, by: string) {
  const waiting = f.agent_log.at(-1)?.kind === "review_wait" || f.agent_log.some((e) => e.kind === "review_wait" || e.kind === "review_page");
  if (f.agent_state !== "handoff" || !waiting) throw new HttpError("bad_request", "This filing isn't waiting for the team's review.");
  if (env().dryRun) throw new HttpError("bad_request", "Dry run is on: nothing is sent. Turn FILER_DRY_RUN off first.");
  // Compare-and-set on handoff: two approvals (or an approval racing a take-over) send at most once.
  const g = await step(f, log("The Placetta team checked it. Sending now.", "快哉团队已核对，现在发送。", "two_key_ok", by), { expect_agent_state: "handoff", agent_state: "running" });
  const d = DEST[f.payload.official ?? ""];
  switch (g.channel) {
    case "email": return await sendEmail(g, d!);
    case "fax": return await sendFax(g, d!);
    case "mail": return await sendMail(g, d!);
    case "portal": return view(await step(g, null, { agent_state: "queued" }, false));
    default: throw new HttpError("bad_request", "No channel to send it on.");
  }
}

async function takeOver(f: Filing, by: string) {
  return view(await step(f, log("The Placetta team took over this filing", "快哉团队已接手此申请", "take_over", by), { agent_state: "handoff", channel: "team" }));
}

/** Stop: one row lock in the database decides it against the submit, so nothing can leave after a stop. A portal run
 *  holding a browser sees the stop at its next step and closes. */
async function stop(f: Filing, by: string) {
  const { data, error } = await admin.rpc("stop_agent_filing", { p_id: f.id, p_by: by });
  if (error) {
    if (/too_late/.test(error.message ?? "")) throw new HttpError("too_late", "It has already gone to the agency, so it can't be stopped. If something is wrong, tell us and the team contacts the agency.");
    throw new Error(`stop failed: ${error.message?.slice(0, 200) ?? error.code}`);
  }
  return view(data as unknown as Filing);
}

// ------------------------------------------------------------------ webhooks and the monitor's sweep

async function telnyxWebhook(req: Request) {
  const pub = Deno.env.get("TELNYX_PUBLIC_KEY") ?? "";
  const sig = req.headers.get("telnyx-signature-ed25519") ?? "", ts = req.headers.get("telnyx-timestamp") ?? "";
  const raw = await req.text();
  if (!pub || !sig || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new HttpError("unauthorized", "Bad webhook.");
  const bytes = (b64: string) => new Uint8Array(b64urlDecode(b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")));
  const key = await crypto.subtle.importKey("raw", bytes(pub) as BufferSource, { name: "Ed25519" }, false, ["verify"]);
  const good = await crypto.subtle.verify("Ed25519", key, bytes(sig) as BufferSource, utf8(`${ts}|${raw}`));
  if (!good) throw new HttpError("unauthorized", "Bad webhook signature.");
  const ev = JSON.parse(raw)?.data ?? {};
  const type = String(ev.event_type ?? ""), p = ev.payload ?? {};
  const id = String(p.fax_id ?? p.id ?? "");
  if (!id || !/^fax\.(delivered|failed)$/.test(type)) return ok({});
  // Each event once: Telnyx redelivers until it gets a 2xx, and a redelivery must not resend a failed fax.
  const eventId = String(ev.id ?? "").slice(0, 200);
  if (eventId) {
    const { error } = await admin.from("webhook_events").insert({ provider: "telnyx", id: eventId });
    if (error?.code === "23505") return ok({ duplicate: true });
    if (error) throw new Error(`webhook event insert failed: ${error.code ?? ""}`);
  }
  try {
    const { data } = await admin.from("filings").select(COLS).eq("provider_ref", id).eq("channel", "fax").maybeSingle();
    if (data) await applyFax(data as unknown as Filing, type.slice(4), { pages: p.page_count, reason: p.failure_reason });
  } catch (e) {
    if (e instanceof Refused) return ok({});      // the sweep or a status check got there first
    // Forget the event so Telnyx's retry is applied.
    if (eventId) await admin.from("webhook_events").delete().eq("provider", "telnyx").eq("id", eventId);
    throw e;
  }
  return ok({});
}

/** Runs that stopped partway (the function was killed between steps): a start that never picked a channel, a fax
    whose failure was recorded but not resent, an email or letter that never confirmed. Nothing is sent again; the team
    checks with the agency when anything may have left. */
async function lostRuns(): Promise<number> {
  const before = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("filings").select(COLS).eq("agent_state", "running").lt("updated_at", before)
    .or("channel.is.null,channel.eq.email,channel.eq.mail,and(channel.eq.fax,provider_ref.is.null)").limit(50);
  if (error) { console.error("lost runs:", error.code ?? ""); return 0; }
  let n = 0;
  for (const r of (data ?? []) as unknown as Filing[]) {
    const sent = !!r.submit_clicked_at;
    try {
      const g = await step(r, sent
        ? log("Placetta lost track of this filing after it may have been sent. The team is checking with the agency before anything is sent again.", "快哉在可能已发出后中断，团队会先向机构核实，再决定是否重发。", "handoff")
        : log("Placetta stopped before sending this filing. The Placetta team takes it from here.", "快哉在发送前中断，由快哉团队接手。", "handoff"),
        { expect_agent_state: "running", expect_provider_ref: r.provider_ref, agent_state: "handoff", channel: "team" });
      await teamTask(g, sent ? "check_agency" : "handoff", sent ? "A run stopped after the send was recorded. Check the agency (and the Sent folder) before sending again." : "A run stopped before sending. Send it or start it again.");
      n++;
    } catch (e) {
      if (!(e instanceof Refused)) console.error("lost run:", describe(e));
    }
  }
  return n;
}

async function sweep() {
  const { data: n } = await admin.rpc("requeue_stuck_filings");
  const lost = await lostRuns();
  const { data: rows } = await admin.from("filings").select(COLS).in("channel", ["fax", "mail"])
    .or("agent_state.eq.running,and(channel.eq.mail,receipt_path.is.null,status.eq.submitted)").limit(100);
  for (const r of rows ?? []) {
    try { await refreshStatus(r as unknown as Filing); } catch (e) { if (!(e instanceof Refused)) console.error("sweep status:", describe(e)); }
  }
  for (const s of staleDestinations(new Date().toISOString().slice(0, 10))) {
    await admin.from("team_tasks").upsert({ kind: "destination_stale", title: `Re-check ${s.id} destinations (last checked ${s.checked}) on ${s.source}`, dedupe: `stale:${s.id}:${s.checked}` },
      { onConflict: "dedupe", ignoreDuplicates: true });
  }
  return { requeued: n ?? 0, lost, refreshed: rows?.length ?? 0 };
}

// ------------------------------------------------------------------ router

serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("provider") === "telnyx") return await telnyxWebhook(req);
  const mk = req.headers.get("x-monitor-key");
  if (mk) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: mk });
    if (good !== true) throw new HttpError("unauthorized", "Wrong monitor key.");
    return ok(await sweep());
  }

  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const filingId = uuidParam(body.filing_id, "filing_id");
  const action = String(body.action ?? "");
  const by = user.email ?? user.id;
  // A refusal from the database means another call already acted on this filing: answer with it as it is now.
  const settled = async (run: () => Promise<ReturnType<typeof view>>) => {
    try {
      return ok(await run());
    } catch (e) {
      if (e instanceof Refused) return ok(view(await loadFiling(ws, filingId)));
      throw e;
    }
  };
  if (action === "team_approve" || action === "take_over") {
    if (!(await isStaff(user)) || aalOf(jwt) !== "aal2") throw new HttpError("forbidden", "Placetta team, with two-step sign-in, only.", "仅限开启两步验证的快哉团队成员。");
    const f = await loadFiling(ws, filingId);
    return await settled(() => action === "team_approve" ? teamApprove(f, by) : takeOver(f, by));
  }
  if (!["start", "resume", "signed", "stop", "status"].includes(action)) {
    throw new HttpError("bad_request", "action must be start, resume, signed, stop or status.");
  }
  // Sending, carrying on, and stopping are an owner's, as in the database (only owners approve or cancel filings);
  // any member can check on one.
  await requireAccess(ws, user, jwt, action === "status" ? "member" : "owner");
  const f = await loadFiling(ws, filingId);
  const resubmit = body.resubmit === true;
  return await settled(() => {
    if (action === "status") return refreshStatus(f);
    if (action === "resume") return resume(f, by, resubmit);
    if (action === "start") return start(f, req, by, resubmit);
    if (action === "signed") return signed(f, String(body.path ?? "").slice(0, 500), by);
    return stop(f, by);
  });
});
