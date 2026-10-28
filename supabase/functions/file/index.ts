// file: Placetta submits an approved filing itself, by email, fax, certified mail or the agency's portal.
//
// POST { workspace_id, filing_id, action }
//   start   the customer just approved it: check it, pick the channel, send (or queue it for the portal worker)
//   resume  "I've done my part, carry on" after a hand-back
//   signed  { path } the hand-signed copy of a wet-signature form, uploaded to Documents: Placetta faxes it, or emails it
//           to an agency that takes the form by email
//   kit     { address } "Mail me the page": Placetta prints the form to sign and mails it to the owner (Lob, first
//           class), with a return envelope addressed to the agency when the agency wants the original by mail. Held
//           for the undo window (Lob's send_date); kit_undo cancels it before it's printed
//   status  refresh a fax or letter that's on its way
//   stop    the customer stops it before anything has left for the agency (refused once submit_clicked_at is set)
//   undo    the customer takes it back during the undo window (SEND_HOLD_MINUTES, 10 by default), while it's held
//   send_now  the customer ends the undo window early and it goes now
//   team_approve, take_over   the Placetta team (two-step) in the two-key period, or taking a run over
//   teach   "Show Odelia how": the owner (or the team, two-step) files it in the live browser while the worker records
//           the steps as a draft playbook for the team's review (worker/filer/src/teach.ts)
// POST { action: "sweep" } with x-monitor-key: the monitor's run, and every minute while a held send is due or a portal
//   run failed (held sends whose time is up, filings whose agency site failed sent another way, stuck runs, fax and mail
//   status, stale destinations)
// POST { action: "autopilot_start", workspace_id, filing_id } with x-monitor-key: Odelia's server starts a filing the
//   database let in under the owner's Autopilot authorization (autopilot_file); refused unless that grant is still live.
//   The sweep also starts any it finds unstarted after two minutes. Everything after is the same as an approved filing:
//   the undo window, the two-key team check of a form's first filings, CAPTCHAs, fees and wet signatures to a person.
// POST ?provider=telnyx: Telnyx fax webhooks, verified with TELNYX_PUBLIC_KEY: every fax status goes on the timeline.
// POST ?provider=lob: Lob letter webhooks, verified with LOB_WEBHOOK_SECRET: every tracking event of a certified letter
//   or a signing kit goes on its filing's timeline; a certified delivery is saved, and a return envelope's first scan
//   marks the owner's signed original as sent.
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
import { DEST, destFor, staleDestinations, TEAM_ONLY, type Dest } from "./destinations.ts";
import { sendEmail as sendSystemEmail, systemMailReady } from "../_shared/email.ts";
import { suppressedIn } from "../_shared/suppression.ts";
import { asAgent,
  afterHold, askedToResubmit, type Bi, canFaxSignedFor, canMakeAccount, CHANNEL_SAID, check, DUPLICATE_REF, emailFor, envFrom, fallback, faxFailures, faxFile, faxTo, feeBlocks, type Filing,
  handBackDue, handoffPacket, hasLoginFor, holds, isForeign, type LogEntry, mailOutcome, mailTo, OWNER_REF, pick, type Refusal, refusalOf, sentByYou, signedCopy,
  TEACH_REFUSED, teachRefusal, teamApproved, whyYours, YOURS_REF, selfFileScope, workerOn, workerState,
  type Beat, rerouteLead, wakeable, wakeConfig, wakeMs, wakePlan, waitsOnWorker, WORKER_ASLEEP, checkCents, lobCheckBody,
  canEmailSignedFor, kitAddress, paperFile, signKit, wetAsk, wetPath, type WetPath,
} from "./logic.ts";
import { agencyLetter, faxEvent, kitLetter, kitSendAt, lobAddress, lobEvent, lobSigned, type MailEvent } from "./paper.ts";
import { pingWorker } from "./wake.ts";
import { feeAuthority, type Authority } from "../_shared/issuing.ts";
import { client as stripeClient } from "../_shared/stripe_catalog.ts";

const env = () => envFrom((k) => Deno.env.get(k));
/** The portal worker's heartbeat (20261102090000_filer_heartbeat.sql), read at most every 30 seconds. Null when the
 *  database doesn't have it yet. */
let beatCache: { at: number; beat: Beat | null } | null = null;
async function workerBeat(fresh = false) {
  if (!fresh && beatCache && Date.now() - beatCache.at < 30_000) return beatCache.beat;
  const { data, error } = await admin.rpc("filer_live", {});
  const r = (data as { live: boolean; seen_at: string | null; wake_since?: string | null }[] | null)?.[0];
  beatCache = { at: Date.now(), beat: error || !r ? null : { live: r.live === true, seen_at: r.seen_at ?? null, wake_since: r.wake_since ?? null } };
  return beatCache.beat;
}
/** Wake on demand (logic.ts "sleep and wake"): FILER_URL and FILER_SECRET, and how long a wake may take. */
const wakeCfg = () => wakeConfig(Deno.env.get("FILER_URL"), Deno.env.get("FILER_SECRET"));
const wakeWindow = () => wakeMs(Deno.env.get("FILER_WAKE_SECONDS"));
/** Asleep but wakeable: filings still queue for the worker, and the queue wakes it. */
const asleep = (beat: Beat | null) => wakeable(!!wakeCfg(), beat, Date.now(), wakeWindow());
/** The env, with the portal worker on only while it's on (FILER_ENABLED, or unset: its heartbeat, or asleep and wakeable). */
const liveEnv = async () => { const beat = await workerBeat(); return { ...env(), portalWorker: workerOn(Deno.env.get("FILER_ENABLED"), beat, asleep(beat)) }; };
/** A filing was just queued (or held) for the agency's website: wake the worker if it sleeps. Never throws, never waits
 *  more than a few seconds; the database lets one ping through every 30 seconds and none while the worker beats. */
async function wakeWorker(): Promise<void> {
  const out = await pingWorker(wakeCfg(), { claim: async () => {
    const { data, error } = await admin.rpc("filer_wake_claim", {});
    if (error) { if (error.code !== "PGRST202") console.error("filer wake claim:", error.code ?? ""); return false; }
    return data === true;
  }, fetch }).catch(() => "not_needed" as const);
  if (out === "sent" || out === "woke") { beatCache = null; console.log("filer wake:", out); }
}
const COLS = "id, workspace_id, app_id, title, status, payload, channel, agent_state, agent_log, handoff_url, provider_ref, submit_clicked_at, attempts, requirements_checked, confirmation_number, portal_url, receipt_path, fee_estimate, send_after, agent_auth, autopilot_grant";
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
      confirmation_number: f.confirmation_number, submit_clicked_at: f.submit_clicked_at, send_after: f.send_after ?? null,
    },
  };
}

/** Tells the team right away when work lands in their queue (the monitor still sends a daily reminder for anything left waiting). */
async function alertTeam(f: Filing, kind: string, title: string) {
  const menv = (k: string) => Deno.env.get(k), from = menv("MAIL_FROM") ?? "";
  if (!systemMailReady(menv)) return;
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
  const r = await sendSystemEmail(menv, { from, to, subject, text, html }, { suppressed: suppressedIn(admin) });
  if (!r.ok) console.error("team alert failed:", r.status, r.detail ?? "");
}

/** A production probe workspace (migration 20261030090000): checked like any other, never sent, no team tasks. */
const synthCache = new Map<string, boolean>();
async function isSynthetic(ws: string): Promise<boolean> {
  if (!synthCache.has(ws)) {
    const { data, error } = await admin.from("workspaces").select("synthetic").eq("id", ws).maybeSingle();
    synthCache.set(ws, !error && !!(data as { synthetic?: boolean } | null)?.synthetic);
  }
  return synthCache.get(ws)!;
}

async function teamTask(f: Filing, kind: string, title: string, detail?: unknown) {
  if (await isSynthetic(f.workspace_id)) return;   // a probe never puts work on the team
  const { data, error } = await admin.from("team_tasks").upsert(
    { kind, filing_id: f.id, workspace_id: f.workspace_id, title, detail: detail ?? null, dedupe: `${kind}:${f.id}:${f.attempts}` },
    { onConflict: "dedupe", ignoreDuplicates: true },
  ).select("id");
  if (error) { console.error("team task insert failed:", error.code ?? ""); return; }
  if (data?.length) await alertTeam(f, kind, title);   // only the first time, never for a repeat
}

/** Odelia isn't sending this one: the business sends it itself. She puts the filled form and a packet in Documents (why,
    where and how the agency takes it, the signature, the fee, what goes with it), the owners hear about it the way they
    chose (the needs_you stage alert), and "I've sent it" marks it submitted so she tracks it like her own. check:
    something may already have reached the agency, so the packet says to look first. The status stays as it was: a
    request nobody has started can still be canceled. */
async function toYou(f: Filing, why: Bi, opts: { check?: boolean; expect?: Record<string, unknown> } = {}) {
  const d = destFor(f.payload.official, f.payload);
  const t = TEAM_ONLY[f.payload.official ?? ""];
  const packet = handoffPacket(f, d, why, { check: opts.check, agencyWhy: t?.why, agencySource: t?.source });
  // Saved with the filing's documents (not as its receipt: nothing has reached the agency yet).
  await saveReceipt(f, d?.owner ? "owner-packet.pdf" : "filing-packet.pdf", await receiptPdf(packet.lines), "application/pdf");
  return view(await step(f, log(packet.en, packet.zh, "needs_you", d?.owner ? OWNER_REF : YOURS_REF),
    { ...(opts.expect ?? {}), channel: "team", agent_state: "needs_you", handoff_url: packet.link }));
}
const bi = (en: string, zh: string): Bi => ({ en, zh });

/** Placetta sends it as the business's agent: the owner signed what's theirs in the one signup session (the pages are
    in payload.agent.signed), so nothing comes back to them. It goes to the team's queue: a named Placetta person sends
    it the way the agency takes it, as the business's agent, and records it (agent_acts logs the submission). */
async function toTeamAsAgent(f: Filing) {
  const ag = (f.payload as { agent?: { by?: string; signed?: string[] } }).agent ?? {};
  await teamTask(f, "send_as_agent", `Send as the business's agent: ${f.title.en}`.slice(0, 200), { by: ag.by ?? null, signed: ag.signed ?? [], official: f.payload.official ?? null });
  return view(await step(f, log(
    `Placetta's filing team sends this as your agent${ag.by ? ` (${ag.by})` : ""}, with the pages you signed when you signed up. Nothing for you to do.`,
    `快哉申报团队将以您代理人的身份${ag.by ? `（${ag.by}）` : ""}，连同您注册时签好的页面一并提交。您无需操作。`, "as_agent"),
    { channel: "team", requirements_checked: true, agent_state: "handoff", handoff_url: null }));
}

async function needsYou(f: Filing, en: string, zh: string, handoff_url: string | null = null, kind = "needs_you") {
  return view(await step(f, log(en, zh, kind), { agent_state: "needs_you", handoff_url }));
}

/** An agency that takes the form only from the business itself (the owner, or the person being certified): nothing is
    sent. Odelia puts a one-page packet in Documents (what to send, where, the fee and what goes with it) and the
    owner taps "I've sent it" once it's sent; Odelia tracks it from there. */
async function toOwner(f: Filing, d: Dest) {
  return await toYou(f, { en: d.owner!.why, zh: d.owner!.why });
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

async function facts(f: Filing, d: Dest | undefined) {
  const [logins, mail] = await Promise.all([
    d?.portal ? admin.from("agency_logins").select("url").eq("workspace_id", f.workspace_id) : Promise.resolve({ data: [], error: null }),
    admin.from("integrations").select("kind").eq("workspace_id", f.workspace_id).in("kind", ["gmail", "outlook_mail", "mailbox"]).eq("status", "connected"),
  ]);
  if (logins.error || mail.error) throw new Error("workspace lookup failed");
  // The same host, and on a host many agencies share (Accela, BTExpress), the same agency's path.
  const hasLogin = hasLoginFor((logins.data ?? []).map((r) => r.url as string), d);
  // No saved login: may Odelia make the business's own account first? (the live agent packet, with account making
  // switched on: 20261105090000_agent_accounts.sql account_authority). A database without it yet says no.
  let authority = false;
  if (d?.portal && !hasLogin && !d.noLogin) {
    const { data, error } = await admin.rpc("account_authority", { p_ws: f.workspace_id });
    if (error && error.code !== "PGRST202") console.error("account authority:", error.code ?? "");
    authority = !error && typeof data === "string" && data.length > 0;
  }
  return {
    hasLogin, mailConnected: (mail.data ?? []).length > 0, makesAccount: canMakeAccount(d, authority),
    // asked only when a fee would go with a mailed filing and Lob checks are on
    ...(env().checks && feeBlocks(f, d) && d?.payment === "with_filing" ? { feeAuthority: !!(await feeAuthorityOf(f)) } : {}),
  };
}

// ------------------------------------------------------------------ a fee that goes with a mailed filing: a Lob check

/** The filing's fee authority (_shared/issuing.ts feeAuthority): its live Autopilot grant, else an owner's approval of
 *  this filing's fee. With the purchase that approval is, when it is one. */
async function feeAuthorityOf(f: Filing): Promise<Authority | null> {
  const [{ data: rows }, grant] = await Promise.all([
    admin.from("purchases").select("id, status, method, amount_cents, approvals, approvers_needed, authorization_id, category").eq("workspace_id", f.workspace_id).eq("filing_id", f.id).eq("status", "approved"),
    f.autopilot_grant ? (async () => {
      const [{ data: g }, { data: live }] = await Promise.all([
        admin.from("autopilot_grants").select("id, cap_per_filing").eq("id", f.autopilot_grant!).eq("workspace_id", f.workspace_id).maybeSingle(),
        admin.rpc("autopilot_live", { p_grant: f.autopilot_grant }),
      ]);
      return g ? { id: String(g.id), live: live === true, capPerFiling: Number(g.cap_per_filing) } : null;
    })() : Promise.resolve(null),
  ]);
  const approved = ((rows ?? []) as { id: string; status: string; method: string | null; amount_cents: number; approvals: unknown[]; approvers_needed: number; authorization_id: string | null; category: string }[])
    .find((r) => r.method !== "card" && r.method !== "check" && r.category === "gov_fees") ?? null;
  return feeAuthority({ grant, approved });
}

/** The business's card on file (the one its plan is billed to). */
async function cardOnFile(ws: string): Promise<{ customer: string; pm: string } | null> {
  const { data } = await admin.from("billing").select("stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  const customer = data?.stripe_customer_id as string | undefined;
  if (!customer) return null;
  const s = stripeClient(stripeEnv);
  const c = await s.get(`customers/${encodeURIComponent(customer)}`);
  const pm = (c?.invoice_settings?.default_payment_method as string | undefined) ?? (await s.get(`customers/${encodeURIComponent(customer)}/payment_methods?type=card&limit=1`))?.data?.[0]?.id;
  return pm ? { customer, pm } : null;
}
const stripeEnv = (k: string) => Deno.env.get(k);

/** The fee goes with the form: re-checked now (authority and cap), the business's card on file charged the exact fee,
 *  then one Lob check drawn on Placetta's bank account, made out to the agency, with the filled form in the same
 *  envelope. On a decline nothing is mailed; if Lob refuses, the charge is refunded and the business gets the packet. */
async function sendCheck(g: Filing, d: Dest, to: NonNullable<ReturnType<typeof mailTo>>, from: Record<string, string>): Promise<ReturnType<typeof view>> {
  const auth = await feeAuthorityOf(g);
  const cents = auth ? checkCents(g, auth.capCents) : null;
  if (!auth || !cents) return await toYou(g, bi("The agency's fee goes with this filing, and it isn't inside what you authorized Placetta to pay.", "这份申请需随附机构费用，但不在您授权快哉代付的范围内。"));
  if (auth.kind === "autopilot") {
    const { error: no } = await admin.rpc("autopilot_spend_ok", { p_ws: g.workspace_id, p_grant: auth.grant, p_cents: cents });
    if (no) return await toYou(g, bi(`The agency's fee can't be paid under Autopilot: ${(/:\s*([^\n]{1,160})/.exec(no.message ?? "")?.[1] ?? "it's over a cap")}.`, "这笔机构费用无法在自动驾驶下支付：超出上限或授权已失效。"));
  }
  const payee = (d.payTo ?? to.name).slice(0, 40);
  const now = new Date().toISOString();
  // the purchase: new under Autopilot, or the owner's approval turned into a check (one per filing)
  const ins = auth.kind === "autopilot"
    ? await admin.from("purchases").insert({ workspace_id: g.workspace_id, category: "gov_fees", payee, payee_url: g.portal_url, amount_cents: cents, fee_cents: cents, app_id: g.app_id, filing_id: g.id,
        why: { en: `The agency's fee for ${g.title.en}`, zh: `${g.title.zh}的机构费用` }, status: "approved", by_agent: true, approvals: [{ who: `autopilot:${auth.grant}`, at: now }], approvers_needed: 1,
        method: "check", autopilot_grant: auth.grant, decided_at: now }).select("id").single()
    : await admin.from("purchases").update({ method: "check", amount_cents: cents, fee_cents: cents }).eq("id", auth.purchase).eq("status", "approved").select("id").single();
  if (ins.error || !ins.data) { await teamTask(g, "check_agency", "A check for this filing's fee may already be on its way; nothing was mailed again."); return await toYou(g, bi("A check for this fee may already be on its way.", "这笔费用的支票可能已在寄送途中。"), { check: true }); }
  const purchase = String(ins.data.id);
  const fail = async (en: string, zh: string, refundPi?: string) => {
    if (refundPi) await stripeClient(stripeEnv).post("refunds", { payment_intent: refundPi }, `check-refund-${purchase}`).catch(() => console.error("check refund failed"));
    await admin.from("purchases").update({ status: "failed", reasons: [{ en, zh }] }).eq("id", purchase);
    return await toYou(g, bi(`The agency's fee couldn't be sent: ${en}`, `机构费用未能寄出：${zh}`));
  };
  const file = await cardOnFile(g.workspace_id).catch(() => null);
  if (!file) return await fail("there's no card on file for the business.", "企业没有登记银行卡。");
  const pi = await stripeClient(stripeEnv).post("payment_intents", {
    amount: String(cents), currency: "usd", customer: file.customer, payment_method: file.pm, off_session: "true", confirm: "true",
    description: `Agency fee to ${payee}, mailed by check by Placetta`.slice(0, 200), "metadata[purchase_id]": purchase, "metadata[workspace_id]": g.workspace_id, "metadata[filing_id]": g.id,
  }, `check-charge-${purchase}`).catch(() => null);
  if (!pi || pi.status !== "succeeded") return await fail("the card on file was declined, so nothing was mailed.", "登记的银行卡被拒，未寄出。");
  const { data: w } = await admin.from("workspaces").select("name").eq("id", g.workspace_id).maybeSingle();
  const res = await fetch(`${LOB}/checks`, {
    method: "POST",
    headers: { Authorization: lobAuth(), "Content-Type": "application/json", "Idempotency-Key": `check-${g.id}` },
    body: JSON.stringify(lobCheckBody({ filing: g, purchase, to: lobAddress(to), payee, from, bank: Deno.env.get("LOB_CHECK_BANK_ACCOUNT")!, cents, file: await signedUrl(g.payload.pdf_path!), business: String(w?.name ?? "the applicant") })),
    signal: AbortSignal.timeout(30000),
  }).catch((e) => { console.error("lob check:", describe(e)); return null; });
  const body = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok || !body?.id) {
    console.error("lob check refused:", res?.status, JSON.stringify(body?.error?.code ?? body?.error?.status_code ?? "").slice(0, 80));
    await teamTask(g, "check_agency", "The mail service didn't confirm the check and form; the charge was refunded and the business was asked to check before mailing.");
    return await fail("the mail service didn't confirm the check, so the charge was refunded.", "邮寄服务未确认支票，已退款。", pi.id);
  }
  await admin.from("purchases").update({ check_id: String(body.id), charge_id: pi.id, confirmation: body.check_number ? String(body.check_number) : null }).eq("id", purchase);
  const amt = `$${(cents / 100).toFixed(2)}`;
  const tracking = String(body.tracking_number ?? "");
  const h = await step(g, log(`Mailed the form with a ${amt} check to ${payee}${body.check_number ? ` (check ${body.check_number})` : ""}${body.expected_delivery_date ? `, expected ${body.expected_delivery_date}` : ""}`,
    `已将表格连同 ${amt} 支票寄给 ${payee}${body.check_number ? `（支票号 ${body.check_number}）` : ""}${body.expected_delivery_date ? `，预计 ${body.expected_delivery_date} 送达` : ""}`, "submitted", String(body.id)),
    { provider_ref: String(body.id), status: "submitted", agent_state: "done", requirements_checked: true, ...(tracking ? { confirmation_number: tracking } : {}) });
  // the receipt: Placetta's own record of the check, never Lob's proof (it prints Placetta's bank account numbers)
  const pdf = await receiptPdf(["Fee paid by check", `Form: ${g.payload.form?.en ?? g.payload.official}`, `Payee: ${payee}`, `Amount: ${amt}`, ...(body.check_number ? [`Check number: ${body.check_number}`] : []),
    `Mailed to: ${to.name}, ${to.city}`, `Mailed: ${new Date().toISOString().slice(0, 10)}`, "Charged to the business's card on file, mailed by Placetta on the applicant's behalf."]);
  const path = await saveReceipt(h, "fee-check-receipt.pdf", pdf, "application/pdf");
  if (path) await admin.from("purchases").update({ receipt_path: path }).eq("id", purchase);
  await admin.from("updates").upsert({ workspace_id: g.workspace_id, kind: "filing", app_id: g.app_id, dedupe: `mailed:${g.id}`,
    title: { en: `Mailed with its fee: ${g.title.en}`, zh: `已连同费用寄出：${g.title.zh}` },
    body: { en: `A ${amt} check to ${payee} went with the form, charged to your card on file. Answers to mailed forms usually come back by post in about 4 to 5 weeks.`, zh: `表格附有一张给 ${payee} 的 ${amt} 支票，已从您登记的银行卡扣款。邮寄表格的回复通常约 4 至 5 周后寄回。` },
  }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  return view(path ? await step(h, null, { receipt_path: path }, false) : h);
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
  const font = await doc.embedFont(StandardFonts.Helvetica);
  // 36 lines to a page, so a long owner packet runs onto a second page instead of off the bottom.
  let page = doc.addPage([612, 792]);
  lines.forEach((l, i) => {
    if (i && i % 36 === 0) page = doc.addPage([612, 792]);
    page.drawText(l.replace(/[^\x20-\x7e]/g, " "), { x: 56, y: 720 - (i % 36) * 18, size: i === 0 ? 14 : 10, font });
  });
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

/** markSubmit, except that a workspace at its daily cap hands the filing to the business instead of sending it. */
async function claimOrTeam(f: Filing, en: string, zh: string): Promise<Filing | ReturnType<typeof view>> {
  try {
    return await markSubmit(f, en, zh);
  } catch (e) {
    if (!(e instanceof Refused) || e.why !== "cap") throw e;
    const n = env().dailyCap;
    return await toYou(f, bi(
      `Placetta has sent ${n} filings by fax or mail for this business in the last 24 hours, the most it sends on its own in a day.`,
      `过去 24 小时内，快哉已为该商家通过传真或邮寄自动提交了 ${n} 份申请，已达每日上限。`));
  }
}
const isView = (x: Filing | ReturnType<typeof view>): x is ReturnType<typeof view> => "filing" in x;

/** Placetta's check of a form's first self-filings (the two-key period): stop before sending until Placetta approves.
    The owner sees that it's in the check, and the sweep hands it to them with its packet if the check takes longer
    than REVIEW_HOURS. A dry run sends nothing: the business gets the packet. */
async function holdForTeam(f: Filing, d: Dest): Promise<ReturnType<typeof view> | null> {
  const e = env();
  if (e.dryRun) {
    return await toYou(f, bi("Placetta's sending is paused for testing, so nothing was sent.", "快哉的自动发送正处于测试暂停中，未实际发送。"));
  }
  if (!teamApproved(f) && (await selfFiledCount(f.payload.official!)) < e.twoKey) {
    const g = await step(f, log("Placetta checks the first filings of each form before Odelia sends them on her own, and this one is in that check. Nothing for you to do: it goes once checked, usually within a business day. If it takes longer than a day, Odelia gives it to you to send.",
      "Odelia 自动提交每种表格的前几份时，快哉会先核对，这一份正在核对中。您无需操作：核对后即发送，通常在一个工作日内。若超过一天，Odelia 会把材料交给您自行提交。", "review_wait"), { agent_state: "handoff" });
    await teamTask(g, "review", `Two-key review before Placetta sends ${f.payload.official} (${f.channel}). Approve or take it over.`, { source: d.source });
    return view(g);
  }
  return null;
}

async function sendEmail(f: Filing, d: Dest) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const secret = Deno.env.get("FILER_SECRET") ?? "";
  if (secret.length < 32) return await toYou(f, bi("Placetta's email sending isn't set up yet.", "快哉的邮件发送尚未配置。"));
  const { subject, body } = emailFor(f);
  const claimed = await claimOrTeam(f, `Emailing it to ${d.email}`, `正在发送邮件至 ${d.email}`);
  if (isView(claimed)) return claimed;
  const g = claimed;
  // the hand-signed copy, when the agency needed ink and takes a scan by email; otherwise the filled (e-signed) form
  const files = [paperFile(f), ...(f.payload.attachments ?? []).map((a) => a.path)].filter(Boolean).slice(0, 5).map((path) => ({ path }));
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
    await teamTask(g, "check_agency", "An email filing didn't confirm; the business was asked to check before sending again.");
    return await toYou(g, bi("Odelia can't tell whether the email reached the agency.", "Odelia 无法确认邮件是否已送达机构。"), { check: true });
  }
  if (outcome === "refused") {
    const msg = String(out?.error?.message ?? `error ${res?.status}`).slice(0, 200);
    // A refusal before sending (bad input, not connected, too large) is safe to hand to the team as not sent.
    return await toYou(g, bi(`The email wasn't sent: ${msg}`, `邮件未发送：${String(out?.error?.message_zh ?? msg).slice(0, 200)}`));
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
  if (!to) return await toYou(f, bi("The agency lists no fax number for this applicant.", "机构没有列出适用于该申请人的传真号码。"));
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
    return await toYou(g, bi("The fax service didn't take the fax, so nothing was sent.", "传真服务未接收，未发出任何内容。"));
  }
  await paperPiece(id, "telnyx", "filing", g);
  return view(await step(g, log("Fax queued with the fax service", "传真已进入发送队列", "fax_queued", id), { provider_ref: id, agent_state: "running", channel: "fax" }));
}

/** A letter or fax Placetta just sent, so its provider's webhooks find the filing. Never fails the send: the sweep's
    status refresh still finds a letter by the filing's provider_ref. */
async function paperPiece(id: string, provider: "lob" | "telnyx", purpose: "filing" | "sign_kit", f: Filing) {
  const { error } = await admin.from("paper_pieces").upsert({ id, provider, purpose, workspace_id: f.workspace_id, filing_id: f.id }, { onConflict: "id", ignoreDuplicates: true });
  if (error && error.code !== "42P01" && error.code !== "PGRST205") console.error("paper piece:", error.code ?? "");
}

/** Apply a fax status from the API or a webhook. The webhook, the monitor's sweep and a member's "status" can all see
    the same result at once: each change compares-and-sets on the fax id it read, so only the first caller records a
    delivery or a failure, and only that one resends. */
async function applyFax(f: Filing, status: string, info: { pages?: number; reason?: string } = {}) {
  if (f.agent_state !== "running" || f.channel !== "fax" || !f.provider_ref) return view(f);
  const ref = f.provider_ref;
  const same = { expect_agent_state: "running", expect_provider_ref: ref };
  if (status === "delivered") {
    const d = destFor(f.payload.official, f.payload);
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
    if (faxFailures(g) < 3) return await sendFax(g, destFor(f.payload.official, f.payload)!, true);
    return await toYou(g, bi("The fax didn't go through after 3 tries.", "传真尝试 3 次均未送达。"));
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

async function sendMail(f: Filing, d: Dest) {
  const held = await holdForTeam(f, d);
  if (held) return held;
  const to = mailTo(d, f.payload);
  let from: Record<string, string>;
  try { from = JSON.parse(Deno.env.get("LOB_FROM") ?? ""); } catch { return await toYou(f, bi("Placetta's certified mail isn't set up yet.", "快哉的挂号信寄送尚未配置。")); }
  if (!to) return await toYou(f, bi("The agency lists no mailing address for this form.", "机构没有列出这份表格的邮寄地址。"));
  // a fee that goes with it: only by a check under the filing's fee authority (pick chose mail for that), never without
  const withFee = feeBlocks(f, d);
  if (withFee && !env().checks) return await toYou(f, bi("The agency's fee goes with this filing, and Placetta never sends money.", "这份申请需随附机构费用，快哉从不代付款项。"));
  const claimed = await claimOrTeam(f, withFee ? `Mailing it with its fee by check to ${to.name}, ${to.city}` : `Mailing it by certified mail to ${to.name}, ${to.city}`,
    withFee ? `正在连同费用支票寄往 ${to.name}，${to.city}` : `正在以挂号信寄往 ${to.name}，${to.city}`);
  if (isView(claimed)) return claimed;
  const g = claimed;
  if (withFee) return await sendCheck(g, d, to, from);
  const file = await signedUrl(f.payload.pdf_path!);
  const res = await fetch(`${LOB}/letters`, {
    method: "POST",
    headers: { Authorization: lobAuth(), "Content-Type": "application/json", "Idempotency-Key": f.id },
    // certified with return receipt; the undo window already ran before this (holds), so it prints now
    body: JSON.stringify(agencyLetter({ filingId: f.id, official: f.payload.official ?? "", to, from, file })),
    signal: AbortSignal.timeout(30000),
  }).catch((e) => { console.error("lob:", describe(e)); return null; });
  const body = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok || !body?.id) {
    console.error("lob refused:", res?.status, JSON.stringify(body?.error ?? "").slice(0, 200));
    await teamTask(g, "check_agency", "The mail service didn't confirm a certified letter; the business was asked to check before mailing again.");
    return await toYou(g, bi("The mail service didn't confirm the letter.", "邮寄服务未确认收到信件。"), { check: true });
  }
  const tracking = String(body.tracking_number ?? "");
  await paperPiece(String(body.id), "lob", "filing", g);
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
  // a check mailed with its form is followed the same way; its proof (which prints Placetta's bank account) is never kept
  const isCheck = f.provider_ref.startsWith("chk_");
  const res = await fetch(`${LOB}/${isCheck ? "checks" : "letters"}/${encodeURIComponent(f.provider_ref)}`, { headers: { Authorization: lobAuth() }, signal: AbortSignal.timeout(15000) }).catch(() => null);
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
  if (!receipt && !isCheck && typeof l.url === "string" && l.url.startsWith("https://")) {
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
  const e = await liveEnv();
  // Who approved and signed, from where: the e-signature record.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 64);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
  const s = f.payload.signature;
  // Autopilot (by "autopilot:<grant>"): the signature the owner adopted in their authorization, placed by Placetta on a
  // form whose agency takes an electronic signature and whose signature swears to nothing (src/forms/esign.ts)
  if (s && !f.agent_log.some((x) => x.kind === "signature")) f = await step(f, by.startsWith("autopilot:")
    ? log(`Signed with the signature ${s.name} adopted in the Autopilot authorization, placed by Placetta at ${s.signed_at}`, `使用 ${s.name} 在自动驾驶授权中采用的签名，由快哉于 ${s.signed_at} 加上`, "signature", by)
    : log(`Signed by ${s.name}${s.title ? `, ${s.title}` : ""} at ${s.signed_at}${ip ? ` from ${ip}` : ""}`, `由 ${s.name}${s.title ? `（${s.title}）` : ""} 于 ${s.signed_at} 签署${ip ? `，IP ${ip}` : ""}`, "signature", `${by} ${ua}`.trim()));
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

  // A probe workspace goes through every check as if self-filing were on for every channel, then stops: nothing leaves.
  const synth = await isSynthetic(f.workspace_id);
  const d = destFor(f.payload.official, f.payload);
  const scope = selfFileScope(f, e, d);
  if (!synth && asAgent(f) && (!scope || !d || d.owner || d.signature === "wet")) return await toTeamAsAgent(f);
  if (!synth && !scope) return await toYou(f, bi("Placetta doesn't send this form to the agency by itself yet.", "快哉暂时不会自动向机构提交这份表格。"));
  const ePick = synth ? { ...e, channels: ["email", "fax", "mail", "portal"] as typeof e.channels, portalWorker: true, fax: true, mail: true } : e;
  // Where it would go decides what is checked: the filled form and its signature only travel by email, fax and mail.
  const fx = await facts(f, d);
  const channel = pick(f, d, ePick, fx);
  // FILER_AGENCIES=portal switches on agency websites only: any other route goes the way it would without self-filing
  if (!synth && scope === "portal" && channel !== "portal") return await toYou(f, bi("Placetta doesn't send this form to the agency by itself yet.", "快哉暂时不会自动向机构提交这份表格。"));
  const problems = check(f, d, { docPaths: await docPaths(f) }, channel);
  if (problems.length) {
    return await needsYou(f, problems.map((p) => p.en).join(". ").slice(0, 900), problems.map((p) => p.zh).join("；").slice(0, 900), null, "needs_you");
  }
  if (synth) {
    const to = !d ? "you, with a packet (no destination on file)" : channel === "fax" ? `fax ${faxTo(d, f.payload) ?? "?"}` : channel === "mail" ? `mail to ${mailTo(d, f.payload)?.name ?? "?"}`
      : channel === "email" ? `email ${d.email}` : channel === "portal" ? `the agency's site ${d.portal ?? ""}`.trim() : channel === "owner" ? "the owner's packet" : "you, with a packet";
    return view(await step(f, log(`Test run: checked and ready to go by ${to}. Nothing was sent.`, `测试运行：已核对，可通过${to}提交。未实际发送。`, "dry_run", channel),
      { channel: channel === "owner" ? "team" : channel, requirements_checked: true, agent_state: "done" }));
  }
  if (channel === "owner") return await toOwner(f, d!);
  // Self-filing is on for this form, but no channel Placetta sends on fits this filing: the business sends it. A form
  // that needs an ink signature goes the honest way for its agency instead (logic.ts wetPath): a copy of the signed page
  // Placetta faxes or emails, or the original mailed back in Placetta's return envelope. Either way the owner taps
  // "Mail me the page" and never prints or addresses anything.
  const wp: WetPath = channel === "team" && d && !d.portal ? wetPath(f, d, e, fx) : { path: "yours" };
  if (channel === "team" && wp.path === "yours") {
    return await toYou(await step(f, null, { requirements_checked: true }, false), whyYours(f, d, e, fx));
  }
  if (channel === "team") {
    // ref "upload": the app shows "Mail me the page", the upload button for the signed copy, and "I've sent it";
    // ref "kit_return": "Mail me the page" (with the return envelope) and "I've sent it".
    const ask = wetAsk(f, d!, wp as Exclude<WetPath, { path: "yours" }>);
    return view(await step(f, log(ask.en, ask.zh, "wet_signature", wp.path === "photo" ? "upload" : "kit_return"),
      { channel: "team", requirements_checked: true, agent_state: "needs_you", handoff_url: null }));
  }
  f = await step(f, log("Checked against the agency's requirements", "已按机构要求核对", "check"),
    { channel, agent_state: "running", requirements_checked: true, status: "in_progress" });
  // The undo window: nothing leaves for SEND_HOLD_MINUTES, so the person can take it back. The sweep sends it after.
  if (holds(channel, e)) {
    const held = await holdSend(f, e.holdMinutes);
    // a sleeping worker starts waking during the undo window, so it's up when the filing is released
    if (channel === "portal") await wakeWorker();
    return view(held);
  }
  switch (channel) {
    case "email": return await sendEmail(f, d!);
    case "fax": return await sendFax(f, d!);
    case "mail": return await sendMail(f, d!);
    case "portal": {
      const g = await step(f, log("Opening the agency's site", "打开机构网站", "queued"), { agent_state: "queued" });
      await wakeWorker();
      return view(g);
    }
    default:
      return await toYou(f, bi("Placetta doesn't send this form by itself yet.", "快哉暂时无法自动提交这份表格。"));
  }
}

async function resume(f: Filing, by: string, resubmit = false, confirmation = "") {
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
  // "I've sent it": the business sent it with the packet (or signed by hand and sent it). It's submitted, with the
  // agency's confirmation number when they have one, and Odelia tracks it from here like her own filings.
  if (sentByYou(last)) {
    const conf = confirmationOf(confirmation);
    return view(await step(f, log(
      conf ? `You sent it to the agency, confirmation ${conf}. Odelia checks its status from here and tells you when it moves.`
        : "You sent it to the agency. Odelia checks its status from here and tells you when it moves. Add the agency's confirmation number when you have it.",
      conf ? `您已提交给机构，确认号 ${conf}。之后由 Odelia 跟进进度，有变化会通知您。` : "您已提交给机构。之后由 Odelia 跟进进度，有变化会通知您。收到机构的确认号后请补充填写。",
      "you_sent", conf ?? undefined), { ...was, status: "submitted", agent_state: "done", requirements_checked: true, handoff_url: null, ...(conf ? { confirmation_number: conf } : {}) }));
  }
  if (f.channel === "portal") {
    const g = await step(f, log("You finished your step. Placetta carries on.", "您已完成这一步，快哉继续办理。", "resume", by), { ...was, agent_state: "queued", handoff_url: null });
    await wakeWorker();
    return view(g);
  }
  // A check that failed earlier: run the checks again from the start.
  const g = await step(f, log("Checking it again", "重新核对", "resume", by), { ...was, agent_state: null, handoff_url: null }, false);
  return await startAgain(g);
}
const startAgain = (f: Filing) => start(f, new Request("https://local"), "resume");

/** A confirmation number the business typed: letters, digits and - / . # only, at most 60 characters; null if none. */
function confirmationOf(raw: unknown): string | null {
  const v = String(raw ?? "").trim().slice(0, 60);
  if (!v) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 ./#-]*$/.test(v)) throw new HttpError("bad_request", "A confirmation number has only letters, numbers and - / . #", "确认号只能包含字母、数字和 - / . #");
  return v;
}

/** The agency's confirmation number for a filing the business sent itself, added after "I've sent it". */
async function addConfirmation(f: Filing, raw: unknown, by: string) {
  const conf = confirmationOf(raw);
  if (!conf) throw new HttpError("bad_request", "Type the agency's confirmation number.", "请输入机构的确认号。");
  if (f.channel !== "team" || f.status !== "submitted" || f.confirmation_number) throw new HttpError("bad_request", "This filing already has its confirmation, or Placetta sent it.", "这份申请已有确认号，或由快哉提交。");
  return view(await step(f, log(`Confirmation ${conf} added`, `已添加确认号 ${conf}`, "confirmation", by), { confirmation_number: conf }));
}

/** The person signed a wet-signature form by hand and uploaded it: check the file, turn a photo into a PDF the fax
    service takes, record it, and run the filing again so it goes by fax. */
async function signed(f: Filing, path: string, by: string) {
  if (f.agent_state !== "needs_you") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind !== "wet_signature") throw new HttpError("bad_request", "This filing isn't waiting for a signed copy.");
  const d = destFor(f.payload.official, f.payload);
  if (!canFaxSignedFor(f, d, env()) && !canEmailSignedFor(f, d, env(), await facts(f, d))) {
    throw new HttpError("bad_request", "Placetta can't fax or email this form. Send it yourself, then tap \"I've sent it\".", "快哉无法传真或通过邮件发送这份表格。请您自行提交，然后点击“我已发出”。");
  }
  if (!path.startsWith(`${f.workspace_id}/`) || path.split("/").some((p) => p === ".." || p === ".")) throw new HttpError("bad_request", "That file isn't in this workspace.");
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
  const g = await step(f, log("You signed it by hand and uploaded it. Placetta sends it to the agency.", "您已手写签名并上传，快哉将发送给机构。", "signed_copy", faxPath),
    { expect_agent_state: "needs_you", agent_state: null, handoff_url: null });
  console.log("signed copy uploaded by", by.slice(0, 120));
  return await startAgain(g);
}

// ------------------------------------------------------------------ the signing kit
// "Mail me the page": for a form that needs ink, Placetta prints the filled form with a cover page saying what to do
// and mails it to the owner (Lob, first class). Where the agency wants the original by mail, a return envelope comes with
// it, and the kit's last page is a tear-off slip whose agency address shows through its window. The letter is held for
// the undo window with Lob's send_date, and kit_undo cancels it until then.

/** The kit on its way for this filing (its Lob letter id), unless it was canceled. */
function kitSent(f: Filing): string | null {
  for (const e of [...f.agent_log].reverse()) {
    if (e.kind === "sign_kit_canceled") return null;
    if (e.kind === "sign_kit" && e.ref) return e.ref;
    if (e.kind === "wet_signature") return null;
  }
  return null;
}

async function kitPdf(f: Filing, d: Dest, path: Exclude<WetPath, { path: "yours" }>): Promise<{ bytes: Uint8Array; pages: number }> {
  const k = signKit(f, d, path);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const cover = doc.addPage([612, 792]);
  k.cover.slice(0, 38).forEach((l, i) => cover.drawText(l.replace(/[^\x20-\x7e]/g, " "), { x: 56, y: 720 - i * 17, size: i === 0 ? 14 : 10, font }));
  const dl = await admin.storage.from("documents").download(f.payload.pdf_path!);
  if (dl.error || !dl.data) throw new Error("Couldn't read the filled form.");
  const form = await PDFDocument.load(new Uint8Array(await dl.data.arrayBuffer()));
  for (const p of await doc.copyPages(form, form.getPageIndices())) doc.addPage(p);
  if (k.slip) {
    // the perforated slip: the agency's address in the lower third, where the #9 return envelope's window falls
    const slip = doc.addPage([612, 792]);
    slip.drawText("Tear here and put this part in the return envelope, address facing out.", { x: 56, y: 300, size: 9, font });
    k.slip.forEach((l, i) => slip.drawText(l.replace(/[^\x20-\x7e]/g, " "), { x: 72, y: 190 - i * 15, size: 12, font }));
  }
  return { bytes: await doc.save(), pages: doc.getPageCount() };
}

async function kit(f: Filing, raw: unknown, by: string) {
  if (f.agent_state !== "needs_you") throw new HttpError("bad_request", "This filing isn't waiting for your signature.", "这份申请没有在等待您的签名。");
  const last = [...f.agent_log].reverse().find((e) => ["needs_you", "wet_signature", "need_person"].includes(e.kind));
  if (last?.kind !== "wet_signature") throw new HttpError("bad_request", "This filing isn't waiting for your signature.", "这份申请没有在等待您的签名。");
  if (kitSent(f)) throw new HttpError("bad_request", "The page is already on its way to you.", "表格已在寄给您的路上。");
  const e = env(), d = destFor(f.payload.official, f.payload);
  if (!e.mail) throw new HttpError("not_configured", "Placetta's mail isn't set up yet. Print the form from Documents instead.", "快哉的邮寄服务尚未配置，请从“文件”自行打印表格。");
  const path = wetPath(f, d, e, await facts(f, d));
  if (path.path === "yours" || !d) throw new HttpError("bad_request", "This form can't be signed by post. Send it with the packet in Documents.", "这份表格无法通过邮寄签署，请用“文件”中的材料包自行提交。");
  if (!f.payload.pdf_path) throw new HttpError("bad_request", "The filled form is missing. Approve it again from the application.", "缺少已填写的表格，请在申请中重新批准。");
  const to = kitAddress(raw);
  if (!to) throw new HttpError("bad_request", "Type the name, street, city, state and ZIP code to mail it to.", "请填写收件人姓名、街道、城市、州和邮编。");
  let from: Record<string, string>;
  try { from = JSON.parse(Deno.env.get("LOB_FROM") ?? ""); } catch { throw new HttpError("not_configured", "Placetta's mail isn't set up yet. Print the form from Documents instead.", "快哉的邮寄服务尚未配置，请从“文件”自行打印表格。"); }
  const pdf = await kitPdf(f, d, path);
  const saved = await saveReceipt(f, "signing-kit.pdf", pdf.bytes, "application/pdf");
  if (!saved) throw new Error("Couldn't save the signing kit.");
  const tries = f.agent_log.filter((x) => x.kind === "sign_kit").length;
  const res = await fetch(`${LOB}/letters`, {
    method: "POST",
    headers: { Authorization: lobAuth(), "Content-Type": "application/json", "Idempotency-Key": `kit-${f.id}-${tries}` },
    body: JSON.stringify(kitLetter({ filingId: f.id, official: f.payload.official ?? "", to, from, file: await signedUrl(saved), pages: pdf.pages,
      sendAt: kitSendAt(Date.now(), e.holdMinutes), returnKit: path.path === "return", returnEnvelope: Deno.env.get("LOB_RETURN_ENVELOPE") })),
    signal: AbortSignal.timeout(30000),
  }).catch((x) => { console.error("lob kit:", describe(x)); return null; });
  const body = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok || !body?.id) {
    console.error("lob kit refused:", res?.status, JSON.stringify(body?.error ?? "").slice(0, 200));
    throw new HttpError("upstream_error", "The mail service didn't take it, so nothing was mailed. Try again, or print it from Documents.", "邮寄服务未接收，未寄出任何内容。请重试，或从“文件”自行打印。");
  }
  await paperPiece(String(body.id), "lob", "sign_kit", f);
  const k = signKit(f, d, path);
  console.log("signing kit ordered by", by.slice(0, 120));
  return view(await step(f, log(`${k.en} You can cancel it for ${Math.max(5, e.holdMinutes)} minutes.`, `${k.zh}${Math.max(5, e.holdMinutes)} 分钟内可取消。`, "sign_kit", String(body.id)),
    { expect_agent_state: "needs_you" }));
}

/** Cancel the kit before Lob prints it (its send_date). Lob refuses once it's printing: then it's on its way. */
async function kitUndo(f: Filing, by: string) {
  const id = kitSent(f);
  if (!id) throw new HttpError("bad_request", "No page is on its way to you.", "没有正在寄给您的表格。");
  const res = await fetch(`${LOB}/letters/${encodeURIComponent(id)}`, { method: "DELETE", headers: { Authorization: lobAuth() }, signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!res?.ok) throw new HttpError("too_late", "It's already being printed, so it can't be canceled now.", "已开始打印，现在无法取消。");
  console.log("signing kit canceled by", by.slice(0, 120));
  return view(await step(f, log("You canceled the page before it was printed. Nothing was mailed.", "您已在打印前取消，未寄出任何内容。", "sign_kit_canceled", id), { expect_agent_state: "needs_you" }, true));
}

// ------------------------------------------------------------------ the undo window
// A send waits SEND_HOLD_MINUTES after the approval. The database decides every step under the row lock (migration
// 20261017140500_send_hold_ask_person): the hold, the release when the time is up, and Undo, so an Undo and the send
// can never both happen. After a release this function sends on the channel it picked before the hold.

async function rpcFiling(fn: string, args: Record<string, unknown>): Promise<Filing> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    if (/too_late/.test(error.message ?? "")) throw new HttpError("too_late", "The time to undo is over: it's on its way. Use Stop until it reaches the agency.", "撤销时间已过，正在发送。在送达机构前仍可点“停止”。");
    const why = refusalOf(error.message);
    if (why) throw new Refused(why);
    throw new Error(`${fn} failed: ${error.message?.slice(0, 200) ?? error.code}`);
  }
  return data as unknown as Filing;
}

const holdSend = (f: Filing, minutes: number) => rpcFiling("filing_hold", { p_id: f.id, p_minutes: minutes });

/** Released from the hold (by the sweep, or by "Send now"): send it on its channel. */
async function sendHeld(f: Filing) {
  const d = destFor(f.payload.official, f.payload);
  switch (afterHold(f, !!d)) {
    case "email": return await sendEmail(f, d!);
    case "fax": return await sendFax(f, d!);
    case "mail": return await sendMail(f, d!);
    case "queued": await wakeWorker(); return view(f);   // the portal worker takes it from the queue
    default: return await toYou(f, bi("The agency's address changed while it waited, so Placetta didn't send it.", "等待期间机构地址有变，快哉未发送。"));
  }
}

/** Undo: the database cancels it only while it's still held. */
const undo = async (f: Filing, by: string) => view(await rpcFiling("undo_held_filing", { p_id: f.id, p_by: by }));

/** Send now: the owner ends the wait early. Only a filing that's still held; anything else is answered as it is. */
async function sendNow(f: Filing) {
  const { data, error } = await admin.rpc("filing_release_held", { p_id: f.id, p_now: true });
  if (error) throw new Error(`release failed: ${error.message?.slice(0, 200) ?? error.code}`);
  const g = (data ?? [])[0] as Filing | undefined;
  return g ? await sendHeld(g) : view(f);
}

/** Every held send whose time is up: released (each row once, whoever else is sweeping) and sent. */
async function releaseDue(): Promise<number> {
  const { data, error } = await admin.rpc("filing_release_held", { p_id: null, p_now: false });
  if (error) { console.error("release held:", error.code ?? ""); return 0; }
  for (const g of (data ?? []) as Filing[]) {
    try { await sendHeld(g); } catch (e) { if (!(e instanceof Refused)) console.error("send held:", describe(e)); }
  }
  return (data ?? []).length;
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
  const d = destFor(f.payload.official, f.payload);
  switch (g.channel) {
    case "email": return await sendEmail(g, d!);
    case "fax": return await sendFax(g, d!);
    case "mail": return await sendMail(g, d!);
    case "portal": { const q = await step(g, null, { agent_state: "queued" }, false); await wakeWorker(); return view(q); }
    default: throw new HttpError("bad_request", "No channel to send it on.");
  }
}

/** "Show Odelia how" (teach mode): the portal worker opens the agency's site in the live browser and records while the
 *  person (the owner, or the Placetta team) files it themselves. Nothing is typed or clicked for them; passwords and
 *  secret numbers are never recorded. The recording becomes a draft for the team's review (worker/filer/src/teach.ts).
 *  Compare-and-set on the agent state, so two taps start one run. */
async function teach(f: Filing, by: string) {
  const why = teachRefusal(f, destFor(f.payload.official, f.payload), await liveEnv());
  if (why) throw new HttpError("bad_request", TEACH_REFUSED[why].en, TEACH_REFUSED[why].zh);
  const g = await step(f, log("You're showing Odelia how to file this on the agency's site. The live browser opens in a moment.", "您正在教 Odelia 如何在机构网站上提交。实时浏览器即将打开。", "teach", by),
    { expect_agent_state: f.agent_state, channel: "portal", agent_state: "queued", handoff_url: null, provider_ref: null });
  await wakeWorker();
  return view(g);
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
  const said = faxEvent(type);
  if (!id || !said) return ok({});
  // Each event once: Telnyx redelivers until it gets a 2xx, and a redelivery must not resend a failed fax.
  const eventId = String(ev.id ?? "").slice(0, 200);
  if (eventId) {
    const { error } = await admin.from("webhook_events").insert({ provider: "telnyx", id: eventId });
    if (error?.code === "23505") return ok({ duplicate: true });
    if (error) throw new Error(`webhook event insert failed: ${error.code ?? ""}`);
  }
  try {
    const { data } = await admin.from("filings").select(COLS).eq("provider_ref", id).eq("channel", "fax").maybeSingle();
    if (data && said.settle) await applyFax(data as unknown as Filing, said.settle, { pages: p.page_count, reason: p.failure_reason });
    // a step on the way (queued, prepared, dialing): on the filing's timeline, nothing else changes
    else if (data) await step(data as unknown as Filing, log(said.en, said.zh, "fax_event", id), {}, false);
    if (data) await admin.from("paper_pieces").update({ status: type, last_event_at: new Date().toISOString() }).eq("id", id).eq("provider", "telnyx");
  } catch (e) {
    if (e instanceof Refused) return ok({});      // the sweep or a status check got there first
    // Forget the event so Telnyx's retry is applied.
    if (eventId) await admin.from("webhook_events").delete().eq("provider", "telnyx").eq("id", eventId);
    throw e;
  }
  return ok({});
}

/** Lob's letter webhooks: every tracking event of a certified letter to an agency, or of a signing kit and its return
    envelope, on the filing's timeline. Verified with LOB_WEBHOOK_SECRET (paper.ts lobSigned); each event once. */
async function lobWebhook(req: Request) {
  const raw = await req.text();
  const good = await lobSigned(Deno.env.get("LOB_WEBHOOK_SECRET") ?? "", req.headers.get("lob-signature-timestamp") ?? "", raw, req.headers.get("lob-signature") ?? "");
  if (!good) throw new HttpError("unauthorized", "Bad webhook signature.");
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(raw); } catch { throw new HttpError("bad_request", "Not JSON."); }
  const letter = String(((ev.body ?? {}) as { id?: string }).id ?? ev.reference_id ?? "");
  const { data: piece } = await admin.from("paper_pieces").select("filing_id, workspace_id, purpose").eq("id", letter).eq("provider", "lob").maybeSingle();
  if (!piece) return ok({});                       // not one of Placetta's filings (a test letter, another product)
  const me = lobEvent(ev, piece.purpose as "filing" | "sign_kit");
  if (!me) return ok({});
  const { error } = await admin.from("webhook_events").insert({ provider: "lob", id: me.event.slice(0, 200) });
  if (error?.code === "23505") return ok({ duplicate: true });
  if (error) throw new Error(`webhook event insert failed: ${error.code ?? ""}`);
  try {
    const f = await loadFiling(String(piece.workspace_id), String(piece.filing_id));
    // the tracking event's own id when the letter carries one, so the sweep's status refresh doesn't log it twice
    const tracks = ((ev.body ?? {}) as { tracking_events?: { id?: string }[] }).tracking_events ?? [];
    const ref = String(tracks.at(-1)?.id ?? me.event);
    await applyMailEvent(f, me, piece.purpose as "filing" | "sign_kit", ref);
    await admin.from("paper_pieces").update({ status: me.type, last_event_at: new Date().toISOString() }).eq("id", letter).eq("provider", "lob");
  } catch (e) {
    if (e instanceof Refused) return ok({});
    await admin.from("webhook_events").delete().eq("provider", "lob").eq("id", me.event.slice(0, 200));
    throw e;
  }
  return ok({});
}

/** One Lob event on a filing: logged once; a return envelope's first scan marks the owner's signed original as sent (as
    "I've sent it" would); a letter that came back, or a USPS problem, tells the owner. */
async function applyMailEvent(f: Filing, me: MailEvent, purpose: "filing" | "sign_kit", ref: string) {
  if (f.agent_log.some((e) => e.kind === "mail_event" && e.ref === ref)) return;
  let g = await step(f, log(me.en, me.zh, "mail_event", ref), {}, false);
  if (me.done === "posted_back" && purpose === "sign_kit" && g.agent_state === "needs_you" && kitSent(g)) {
    g = await step(g, log("USPS scanned your return envelope on its way to the agency, so it's sent. Odelia checks its status from here.",
      "美国邮政已扫描寄往机构的回邮信封，表示已寄出。之后由 Odelia 跟进进度。", "you_sent"),
      { expect_agent_state: "needs_you", status: "submitted", agent_state: "done", requirements_checked: true, handoff_url: null });
  }
  if (me.problem) {
    await admin.from("updates").upsert({
      workspace_id: f.workspace_id, kind: "filing", app_id: f.app_id, dedupe: `mail-${me.problem}:${f.id}:${ref}`.slice(0, 200),
      title: { en: `Mail problem: ${f.title.en}`, zh: `邮寄问题：${f.title.zh}` }, body: { en: me.en, zh: me.zh },
    }, { onConflict: "workspace_id,dedupe", ignoreDuplicates: true });
  }
}

/** Runs that stopped partway (the function was killed between steps): a start that never picked a channel, a fax
    whose failure was recorded but not resent, an email or letter that never confirmed. Nothing is sent again; the team
    the business gets the packet, told to check with the agency first when anything may have left. */
async function lostRuns(): Promise<number> {
  const before = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("filings").select(COLS).eq("agent_state", "running").lt("updated_at", before)
    .or("channel.is.null,channel.eq.email,channel.eq.mail,and(channel.eq.fax,provider_ref.is.null)").limit(50);
  if (error) { console.error("lost runs:", error.code ?? ""); return 0; }
  let n = 0;
  for (const r of (data ?? []) as unknown as Filing[]) {
    const sent = !!r.submit_clicked_at;
    try {
      const expect = { expect_agent_state: "running", expect_provider_ref: r.provider_ref };
      if (sent) {
        await teamTask(r, "check_agency", "A run stopped after the send was recorded; the business was asked to check before sending again.");
        await toYou(r, bi("Placetta stopped partway after it may have sent this.", "快哉在可能已发出后中断。"), { check: true, expect });
      } else {
        await toYou(r, bi("Placetta stopped before sending this, so nothing was sent.", "快哉在发送前中断，未发出任何内容。"), { expect });
      }
      n++;
    } catch (e) {
      if (!(e instanceof Refused)) console.error("lost run:", describe(e));
    }
  }
  return n;
}

/** The agency's site failed before anything was submitted: Placetta sends it another way the agency takes (email, fax or
    certified mail, after the same undo window and the same checks), or prepares the owner's packet when only the
    business may send it. Nothing is ever sent twice: only a filing with no submit on record, by a compare-and-set on
    its hand-back. When there's no other way, the business gets the packet, and it says why. */
async function reroute(f: Filing) {
  const e = env();
  const d = destFor(f.payload.official, f.payload);
  const was = { expect_agent_state: "handoff" };
  const route = fallback(f, d, e, await facts(f, d));
  const problems = route === "team" ? [] : check(f, d, { docPaths: await docPaths(f) }, route);
  // why the agency's site isn't used: it failed, or the worker didn't wake in time (logic.ts rerouteLead)
  const { lead, sends } = rerouteLead(f);
  if (route === "team" || problems.length) {
    const why = route === "team" ? whyYours(f, d ? { ...d, portal: undefined } : d, e, await facts(f, d)) : { en: `It can't go another way yet: ${problems.map((p) => p.en).join(". ")}.`, zh: `暂时无法改用其他方式：${problems.map((p) => p.zh).join("；")}。` };
    await closeHandoffTasks(f);
    return await toYou(f, bi(`${lead.en} ${why.en}`.slice(0, 900), `${lead.zh}${why.zh}`.slice(0, 900)), { expect: was });
  }
  // Placetta sends it itself now: the hand-back task for it is closed
  await closeHandoffTasks(f);
  if (route === "owner") {
    const g = await step(f, log(`${lead.en} This form is one the business sends itself, so Odelia prepared the packet.`, `${lead.zh}这份表格需由企业本人提交，Odelia 已准备好材料包。`, "reroute", "owner"), was);
    return await toOwner(g, d!);
  }
  const said = sends(CHANNEL_SAID[route]);
  const g = await step(f, log(said.en, said.zh, "reroute", route),
    { ...was, channel: route, agent_state: "running", requirements_checked: true, handoff_url: null });
  if (holds(route, e)) return view(await holdSend(g, e.holdMinutes));
  switch (route) {
    case "email": return await sendEmail(g, d!);
    case "fax": return await sendFax(g, d!);
    case "mail": return await sendMail(g, d!);
    default: return view(g);
  }
}

/** Hand-back tasks for this filing (the worker's, the database's) are closed once Odelia has decided what happens. */
async function closeHandoffTasks(f: Filing) {
  await admin.from("team_tasks").update({ done_at: new Date().toISOString() }).eq("filing_id", f.id).eq("kind", "handoff").is("done_at", null);
}

/** Every filing left with Placetta (a portal run's hand-back, a check that ran long, anything else): the agency's site
    failed, so it's tried another way once; something may have reached the agency, so the business checks first; or
    the business sends it with the packet. Placetta's check of a form's first filings is left alone for REVIEW_HOURS,
    and a filing the Placetta team took over by hand stays theirs. */
async function handBacks(): Promise<number> {
  const { data, error } = await admin.from("filings").select(COLS).eq("agent_state", "handoff")
    .not("status", "in", "(canceled,submitted,accepted,rejected)").order("updated_at").limit(100);
  if (error) { console.error("hand-backs:", error.code ?? ""); return 0; }
  let n = 0;
  const now = Date.now();
  for (const r of (data ?? []) as unknown as Filing[]) {
    const due = handBackDue(r, now);
    if (!due) continue;
    const was = { expect: { expect_agent_state: "handoff" } };
    try {
      if (due === "reroute") await reroute(r);
      else {
        await closeHandoffTasks(r);
        if (due === "review_late") {
          await admin.from("team_tasks").update({ done_at: new Date().toISOString() }).eq("filing_id", r.id).eq("kind", "review").is("done_at", null);
          await toYou(r, bi("Placetta's check of this form's first filings took longer than a day, so it's yours to send.", "快哉对这种表格首批申请的核对超过一天，请您自行提交。"), was);
        } else if (due === "check") await toYou(r, bi("Something may already have reached the agency.", "可能已有内容送达机构。"), { ...was, check: true });
        else {
          await toYou(r, bi("Odelia couldn't finish sending this one herself.", "Odelia 未能自行完成提交。"), was);
        }
      }
      n++;
    } catch (e) { if (!(e instanceof Refused)) console.error("hand-back:", describe(e)); }
  }
  return n;
}

/** The live Autopilot grant a filing was made under (20261103090000_autopilot.sql), or null: not an Autopilot filing, or
 *  its authorization was revoked or has expired. */
async function autopilotGrant(ws: string, id: string): Promise<string | null> {
  const { data, error } = await admin.from("filings").select("autopilot_grant").eq("id", id).eq("workspace_id", ws).maybeSingle();
  const g = (data as { autopilot_grant?: string | null } | null)?.autopilot_grant ?? null;
  if (error || !g) return null;
  const { data: live } = await admin.rpc("autopilot_live", { p_grant: g });
  return live === true ? g : null;
}

/** Autopilot filings the database let in that nobody started (Odelia's server couldn't reach this function): started
 *  now, after two minutes, under their grant if it's still live. */
async function autopilotUnstarted(): Promise<number> {
  const before = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await admin.from("filings").select(COLS).not("autopilot_grant", "is", null).is("agent_state", null).eq("status", "requested").lt("created_at", before).limit(20);
  if (error) return 0;   // a database without the Autopilot migration yet
  let n = 0;
  for (const r of (data ?? []) as unknown as Filing[]) {
    const g = await autopilotGrant(r.workspace_id, r.id);
    if (!g) continue;
    try { await start(r, new Request("https://placetta.invalid/autopilot"), `autopilot:${g}`); n++; } catch (e) { if (!(e instanceof Refused)) console.error("autopilot start:", describe(e)); }
  }
  return n;
}

/** Filings queued for the agency's website while the worker isn't beating: ping it awake (asleep, wakeable), or, once a
    wake has gone unanswered for the wake window, hand them back with ref worker_asleep so handBacks sends them the way
    they'd go without the worker. Nothing at all without wake on demand set up (FILER_URL, FILER_SECRET): as before. */
async function wakeSweep(): Promise<{ wake: string; fell_back: number }> {
  const { data, error } = await admin.from("filings").select(COLS).eq("channel", "portal").eq("agent_state", "queued")
    .not("status", "in", "(canceled,submitted,accepted,rejected)").order("updated_at").limit(100);
  if (error) { console.error("wake sweep:", error.code ?? ""); return { wake: "none", fell_back: 0 }; }
  const now = Date.now();
  const waiting = ((data ?? []) as unknown as Filing[]).filter((f) => waitsOnWorker(f, now));
  if (!waiting.length) return { wake: "none", fell_back: 0 };
  const plan = wakePlan({ configured: !!wakeCfg(), beat: await workerBeat(true), waiting: waiting.length, nowMs: now, windowMs: wakeWindow() });
  if (plan === "wake") { await wakeWorker(); return { wake: "pinged", fell_back: 0 }; }
  if (plan !== "fall_back") return { wake: plan, fell_back: 0 };
  let n = 0;
  for (const f of waiting) {
    try {
      // compare-and-set on queued: a worker that wakes and claims it first keeps it
      await step(f, log("Odelia's filing browser didn't start in time. Placetta sends it another way the agency takes, or gives it to you to send.",
        "Odelia 的提交浏览器未能及时启动。快哉会改用机构接受的其他方式，否则交由您自行提交。", "handoff", WORKER_ASLEEP),
        { expect_agent_state: "queued", agent_state: "handoff", channel: "team", handoff_url: null });
      n++;
    } catch (e) { if (!(e instanceof Refused)) console.error("wake fall back:", describe(e)); }
  }
  return { wake: "failed", fell_back: n };
}

async function sweep() {
  const autopilot = await autopilotUnstarted();
  const released = await releaseDue();
  // before the hand-backs, so a filing the worker didn't wake for goes another way in this same sweep
  const woken = await wakeSweep();
  const rerouted = await handBacks();
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
  return { autopilot, released, rerouted, requeued: n ?? 0, lost, refreshed: rows?.length ?? 0, wake: woken.wake, fell_back: woken.fell_back };
}

// ------------------------------------------------------------------ router

serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("provider") === "telnyx") return await telnyxWebhook(req);
  if (url.searchParams.get("provider") === "lob") return await lobWebhook(req);
  const mk = req.headers.get("x-monitor-key");
  if (mk) {
    const { data: good } = await admin.rpc("monitor_key_ok", { p_key: mk });
    if (good !== true) throw new HttpError("unauthorized", "Wrong monitor key.");
    // Autopilot: Odelia's server starts a filing the database just let in under the owner's live authorization
    const sb = await readBody(req).catch(() => ({} as Record<string, unknown>));
    if (sb.action === "autopilot_start") {
      const f = await loadFiling(uuidParam(sb.workspace_id, "workspace_id"), uuidParam(sb.filing_id, "filing_id"));
      const grant = await autopilotGrant(f.workspace_id, f.id);
      if (!grant) throw new HttpError("forbidden", "Not an Autopilot filing, or its authorization isn't live.");
      try { return ok(await start(f, req, `autopilot:${grant}`)); } catch (e) { if (e instanceof Refused) return ok(view(await loadFiling(f.workspace_id, f.id))); throw e; }
    }
    return ok(await sweep());
  }

  const { user, jwt } = await requireUser(req);
  const body = await readBody(req);
  const ws = uuidParam(body.workspace_id, "workspace_id");
  const action = String(body.action ?? "");
  // Is online filing live? Any member may ask; the answer is a word and a time, never the worker's details.
  if (action === "worker") {
    await requireAccess(ws, user, jwt, "member");
    const beat = await workerBeat();
    return ok({ worker: { state: workerState(Deno.env.get("FILER_ENABLED"), env(), beat, asleep(beat)), seen_at: beat?.seen_at ?? null } });
  }
  const filingId = uuidParam(body.filing_id, "filing_id");
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
  // "Show Odelia how": the owner, or the Placetta team with two-step sign-in filing on a new portal for a customer
  if (action === "teach") {
    if (!((await isStaff(user)) && aalOf(jwt) === "aal2")) await requireAccess(ws, user, jwt, "owner");
    const f = await loadFiling(ws, filingId);
    return await settled(() => teach(f, by));
  }
  if (!["start", "resume", "signed", "kit", "kit_undo", "stop", "status", "undo", "send_now", "confirmation"].includes(action)) {
    throw new HttpError("bad_request", "action must be start, resume, signed, kit, kit_undo, stop, undo, send_now, confirmation, teach, status or worker.");
  }
  // Sending, carrying on, and stopping are an owner's, as in the database (only owners approve or cancel filings);
  // any member can check on one.
  await requireAccess(ws, user, jwt, action === "status" ? "member" : "owner");
  const f = await loadFiling(ws, filingId);
  const resubmit = body.resubmit === true;
  return await settled(() => {
    if (action === "status") return refreshStatus(f);
    if (action === "resume") return resume(f, by, resubmit, String(body.confirmation ?? ""));
    if (action === "confirmation") return addConfirmation(f, body.confirmation, by);
    if (action === "start") return start(f, req, by, resubmit);
    if (action === "signed") return signed(f, String(body.path ?? "").slice(0, 500), by);
    if (action === "kit") return kit(f, body.address, by);
    if (action === "kit_undo") return kitUndo(f, by);
    if (action === "undo") return undo(f, by);
    if (action === "send_now") return sendNow(f);
    return stop(f, by);
  });
});
