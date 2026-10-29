// The dispatcher's decisions, kept free of I/O so they can be tested: is this agency switched on, is the filing
// complete, which channel sends it, and is the owner foreign. index.ts does the sending.
import { type Dest, loginMatches, OWNER_KIND, OWNER_KIND_SAID, TEAM_ONLY } from "./destinations.ts";
import { ACCOUNT_SAY, accountOf } from "./accounts.ts";
import { CHANNEL_DAYS, captchaQuestion, type CaptchaChoice } from "./captcha.ts";

export type Bi = { en: string; zh: string };
/** "team" is the database's name for "not sent by Placetta": the business sends it with the packet Odelia prepares
    (or, during Placetta's check of a form's first self-filings, it waits for that check). */
export type Channel = "email" | "fax" | "mail" | "portal" | "team";
/** Where a filing goes: a channel, or "owner" when the agency takes it only from the business itself (Odelia
    prepares the packet and nothing is sent; the filing's channel column says "team"). */
export type Route = Channel | "owner";
export type LogEntry = { at?: string; en: string; zh: string; kind: string; ref?: string };

export type Payload = {
  official?: string;
  form?: Bi;
  fields?: { id?: string; label: Bi; value: string }[];
  checklist?: { label: Bi; state: string; doc?: string }[];
  attachments?: { name: string; path: string }[];
  pdf_path?: string;                                // the filled official PDF, signed when the agency takes a signature
  signature?: { name: string; title?: string; signed_at: string; kind: "typed" | "drawn" };
  us_address?: boolean;                             // false when the business has no US address
  // what the check before approval found (src/risk.ts riskFlags): each issue's kind and severity, never a value, and the
  // owner's "send it anyway" when the risk was High. Kept for learning (filing_risk_flags).
  risk?: { level?: string; flags?: { issue?: string; severity?: string }[]; override?: { at?: string } };
};

export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; status: string; payload: Payload;
  channel: Channel | null; agent_state: string | null; agent_log: LogEntry[]; handoff_url: string | null;
  provider_ref: string | null; submit_clicked_at: string | null; attempts: number; requirements_checked: boolean;
  confirmation_number: string | null; portal_url: string | null;
  fee_estimate?: number | string | null;            // the agency fee; paid by the person, so never sent by email, fax or mail
  send_after?: string | null;                       // while agent_state is "held": when it goes, unless the person undoes it
  agent_auth?: string | null;                       // sent by Placetta as the business's agent, under this signed packet
  autopilot_grant?: string | null;                  // filed under this Autopilot grant (its caps hold the fee)
};

/** Placetta sends this one as the business's named agent (the owner's signed packet, checked by the database's
 *  agent_act_ok when it went in and again when it's submitted): the team sends it, never the owner. */
export const asAgent = (f: Filing): boolean => !!f.agent_auth && !!(f.payload as { agent?: { auth?: string } }).agent?.auth && (f.payload as { agent: { auth: string } }).agent.auth === f.agent_auth;

export type Env = {
  agencies: string[];        // FILER_AGENCIES: form ids allowed to self-file
  channels: Channel[];       // FILER_CHANNELS: channels switched on
  portalWorker: boolean;     // FILER_ENABLED=1
  dryRun: boolean;           // FILER_DRY_RUN=1
  twoKey: number;            // FILER_TWO_KEY: the team reviews each agency's first N filings (default 10)
  dailyCap: number;          // FILER_DAILY_CAP: faxes and letters one workspace self-files in 24 hours (default 10)
  fax: boolean;              // TELNYX_API_KEY, TELNYX_FAX_CONNECTION_ID and TELNYX_FAX_FROM set
  mail: boolean;             // LOB_API_KEY and LOB_FROM set
  holdMinutes: number;       // SEND_HOLD_MINUTES: the undo window before anything leaves (default 10, 0 turns it off)
  /** A fee that goes with a mailed filing is paid by a Lob check mailed with the form: STRIPE_ISSUING_ON (Placetta pays
   *  agency fees at all), the mail set up, and LOB_CHECK_BANK_ACCOUNT (Placetta's verified bank account in Lob). */
  checks?: boolean;
};

/** The undo window, from SEND_HOLD_MINUTES: 10 when it isn't set or isn't a number, 0 to switch it off, at most a day. */
export function holdMinutes(raw: string | undefined): number {
  const s = (raw ?? "").trim();
  if (!s) return 10;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1440) : 10;
}

/** A send waits out the undo window when it's going to leave Placetta by email, fax, mail or an agency's site and the
    window is on. The team's channel doesn't wait: a person sends it, after their own checks. */
export const holds = (channel: Channel, env: Pick<Env, "holdMinutes">): boolean => env.holdMinutes > 0 && channel !== "team";

/** What a held filing does when the sweep finds its time is up, from the row the release returned: the channel to send
    on now, or "queued" for the portal worker (the release already queued it), or "team" when the destination is gone. */
export function afterHold(f: Pick<Filing, "channel" | "agent_state">, hasDest: boolean): "email" | "fax" | "mail" | "queued" | "team" {
  if (f.channel === "portal") return "queued";
  if (!hasDest || f.agent_state !== "running") return "team";
  return f.channel === "email" || f.channel === "fax" || f.channel === "mail" ? f.channel : "team";
}

export function envFrom(get: (k: string) => string | undefined): Env {
  const list = (k: string) => (get(k) ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const two = Number(get("FILER_TWO_KEY") ?? "10");
  const cap = Number(get("FILER_DAILY_CAP") ?? "10");
  return {
    agencies: list("FILER_AGENCIES"),
    channels: list("FILER_CHANNELS").filter((c): c is Channel => ["email", "fax", "mail", "portal"].includes(c)),
    portalWorker: get("FILER_ENABLED") === "1",
    dryRun: get("FILER_DRY_RUN") === "1",
    twoKey: Number.isFinite(two) && two >= 0 ? Math.floor(two) : 10,
    dailyCap: get("FILER_DAILY_CAP")?.trim() && Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : 10,
    fax: !!(get("TELNYX_API_KEY") && get("TELNYX_FAX_CONNECTION_ID") && get("TELNYX_FAX_FROM")),
    mail: !!(get("LOB_API_KEY") && get("LOB_FROM")),
    holdMinutes: holdMinutes(get("SEND_HOLD_MINUTES")),
    checks: ["1", "on", "true"].includes((get("STRIPE_ISSUING_ON") ?? "").trim().toLowerCase()) && !!(get("LOB_API_KEY") && get("LOB_FROM") && /^bank_\w+$/.test(get("LOB_CHECK_BANK_ACCOUNT") ?? "")),
  };
}

/** The kill switch: off unless this form id is listed in FILER_AGENCIES. */
export const killSwitchOn = (f: Filing, env: Env): boolean => !!f.payload.official && env.agencies.includes(f.payload.official.toLowerCase());

/** What FILER_AGENCIES switches on for this form: "all" its channels (its id is listed), or only filing it on the
    agency's own website (the word "portal" is listed and the form has a portal), or nothing. "portal" lets the founder
    switch on every agency website with one word, including the ones playbooks are added for later, without opening
    email, fax or mail for those forms. */
export function selfFileScope(f: Filing, env: Env, d: Dest | undefined): "all" | "portal" | null {
  if (killSwitchOn(f, env)) return "all";
  return env.agencies.includes("portal") && !!d?.portal ? "portal" : null;
}

/** The worker's heartbeat as filer_live reads it (20261102090000_filer_heartbeat.sql, 20261102090300_filer_wake.sql):
    live while it beat in the last three minutes; wake_since is when the current wake attempt began (null: none since). */
export type Beat = { live: boolean; seen_at: string | null; wake_since?: string | null };

// ---------------------------------------------------------------- sleep and wake
// On a plan that sleeps (Render's free plan: asleep after 15 idle minutes, awake about a minute after a request), the
// worker stops beating while it sleeps. With FILER_URL (its address) and FILER_SECRET set, a worker that has beaten
// before counts as asleep but wakeable: filings still queue for it, the file function and its sweep ping FILER_URL/wake,
// and if it hasn't beaten within the wake window (FILER_WAKE_SECONDS, default 180) the queued filings go the way they
// would without the worker. After a failed wake, the next attempt is allowed WAKE_RETRY_MS later.

export const WAKE_RETRY_MS = 30 * 60_000;
/** The hand-back ref for a queued filing whose worker didn't wake: the sweep sends it another way (PORTAL_FAILED). */
export const WORKER_ASLEEP = "worker_asleep";
/** How long a wake may take before the queued filings go another way: FILER_WAKE_SECONDS, 60 to 900, default 180. */
export function wakeMs(raw: string | undefined): number {
  const n = Number((raw ?? "").trim());
  return (Number.isFinite(n) && (raw ?? "").trim() ? Math.min(900, Math.max(60, Math.floor(n))) : 180) * 1000;
}

/** The worker's wake address and the secret it checks, or null when wake on demand isn't set up: FILER_URL must be the
    worker's https address (no user or password in it; a trailing /wake is fine), FILER_SECRET 32 characters or more. */
export function wakeConfig(url: string | undefined, secret: string | undefined): { url: string; secret: string } | null {
  const s = (secret ?? "").trim(), raw = (url ?? "").trim();
  if (s.length < 32 || !raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
  const path = u.pathname.replace(/\/+$/, "").replace(/\/wake$/, "");
  return { url: `${u.origin}${path}/wake`, secret: s };
}

/** The last wake attempt got no heartbeat within the window (and isn't old enough to try again). */
export function wakeFailed(beat: Beat | null, nowMs: number, windowMs: number): boolean {
  if (!beat || beat.live || !beat.wake_since) return false;
  const since = Date.parse(beat.wake_since), seen = Date.parse(beat.seen_at ?? "");
  if (!Number.isFinite(since)) return false;
  if (Number.isFinite(seen) && seen >= since) return false;          // it beat after the ping: that wake worked
  const age = nowMs - since;
  return age > windowMs && age < WAKE_RETRY_MS;
}

/** Asleep but wakeable: wake on demand is set up, the worker has beaten before, it isn't beating now, and its last wake
    didn't fail. */
export const wakeable = (configured: boolean, beat: Beat | null, nowMs: number, windowMs: number): boolean =>
  configured && !!beat?.seen_at && !beat.live && !wakeFailed(beat, nowMs, windowMs);

/** A queued portal filing the worker would take now: not waiting out a retry or a held browser (provider_ref). */
export function waitsOnWorker(f: Pick<Filing, "channel" | "agent_state" | "status" | "provider_ref" | "submit_clicked_at">, nowMs: number): boolean {
  if (f.channel !== "portal" || f.agent_state !== "queued" || f.submit_clicked_at) return false;
  if (["canceled", "submitted", "accepted", "rejected"].includes(f.status)) return false;
  const m = /^(?:retry-after|held-until):(.+)$/.exec(f.provider_ref ?? "");
  const until = m ? Date.parse(m[1]) : NaN;
  return !(Number.isFinite(until) && until > nowMs);
}

/** What the sweep does for the filings queued for the worker: nothing (it's live, or there are none), ping it (asleep,
    wakeable), or send them another way (its wake failed). Without wake on demand set up, nothing: as before. */
export function wakePlan(o: { configured: boolean; beat: Beat | null; waiting: number; nowMs: number; windowMs: number }): "none" | "wake" | "fall_back" {
  if (!o.waiting || o.beat?.live || !o.configured || !o.beat?.seen_at) return "none";
  return wakeFailed(o.beat, o.nowMs, o.windowMs) ? "fall_back" : "wake";
}

/** Is the portal worker on? FILER_ENABLED=1 says so, FILER_ENABLED=0 says not; unset, the worker's own heartbeat decides
    (supabase/migrations/20261102090000_filer_heartbeat.sql): filings queue for it only while it beats, or while it's
    asleep but wakeable (asleep: wakeable(), above). */
export function workerOn(enabled: string | undefined, beat: { live: boolean } | null, asleep = false): boolean {
  const v = (enabled ?? "").trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return !!beat?.live || asleep;
}

/** What the app shows for online filing: live (the worker beats and the portal channel is on), asleep (it sleeps and
    wakes on demand), off (switched off, or the portal channel isn't in FILER_CHANNELS), down (it beat once and stopped,
    or didn't wake), or not set up (it never has). */
export type WorkerState = "live" | "asleep" | "off" | "down" | "not_set_up";
export function workerState(enabled: string | undefined, env: Pick<Env, "channels" | "agencies">, beat: Beat | null, asleep = false): WorkerState {
  if ((enabled ?? "").trim() === "0" || !env.channels.includes("portal")) return "off";
  if (beat?.live) return "live";
  if (asleep && beat?.seen_at) return "asleep";
  if ((enabled ?? "").trim() === "1" && !beat) return "live";   // a database without the heartbeat yet: trust the switch
  return beat?.seen_at ? "down" : "not_set_up";
}

/** SSN or ITIN shapes. Placetta never stores or sends one. */
export const SECRET_NUMBER = /\b\d{3}-?\d{2}-?\d{4}\b|\b9\d{2}-?[78]\d-?\d{4}\b/;
const SECRET_LABEL = /\b(ssn|itin|social security|passport)\b|社会安全号|护照号/i;

/** The owner applies from outside the US: SS-4 line 7b says "Foreign", or the business has no US address. */
export function isForeign(p: Payload): boolean {
  if (p.us_address === false) return true;
  const l7b = p.fields?.find((x) => x.id === "l7b")?.value ?? "";
  return /^\s*foreign\s*$/i.test(l7b);
}

export type Problem = { en: string; zh: string; kind: "missing" | "secret" | "signature" | "file" };

/** An attachment that is the owner's signed authorization for someone else to file (a power of attorney, an
    authority to act, an agent or authorization letter, a disclosure the agency names for that). */
const AUTHORIZATION = /authori[sz]|power of attorney|\bpoa\b|authority to act|agent letter|disclosure|授权|委托/i;

/** A reason an agency gave for sending this form back before (form_rejection_reasons, read by rejection_reasons_for). */
export type PastRejection = { reason: string; seen: number };
const PLACEHOLDER = /^(tbd|tba|n\/?a|none|unknown|todo|x{2,}|\?+|-+|待定|未知|无)$/i;

/** Checks the next filing of a form against why the agency sent earlier ones back: a field the agency named in a
    reason that holds a placeholder (TBD, N/A, unknown), a signature it asked for that isn't there, or a document it
    named that isn't with it yet. Only what can be read for certain stops it. Empty fields and missing documents are
    check()'s, so nothing is said twice. */
export function pastRejectionProblems(f: Filing, reasons: PastRejection[]): Problem[] {
  const out: Problem[] = [];
  const p = f.payload, seen = new Set<string>();
  const said = (r: string) => `The agency sent this form back before because: "${r.slice(0, 160)}".`;
  const saidZh = (r: string) => `机构曾因以下原因退回这份表格："${r.slice(0, 160)}"。`;
  for (const { reason } of reasons) {
    const r = reason.toLowerCase();
    for (const x of p.fields ?? []) {
      const label = x.label.en.trim().toLowerCase(), v = (x.value ?? "").trim();
      if (label.length < 4 || !r.includes(label) || !v || !PLACEHOLDER.test(v) || seen.has("f:" + label)) continue;
      seen.add("f:" + label);
      out.push({ kind: "missing", en: `${said(reason)} ${x.label.en} still says "${v}".`, zh: `${saidZh(reason)}${x.label.zh}仍为"${v}"。` });
    }
    if (/\bsignature|\bsign(ed)?\b|签名|签字/.test(r) && !p.signature && !seen.has("sig")) {
      seen.add("sig");
      out.push({ kind: "signature", en: `${said(reason)} It isn't signed yet.`, zh: `${saidZh(reason)}尚未签名。` });
    }
    for (const c of p.checklist ?? []) {
      const label = c.label.en.trim().toLowerCase();
      if (label.length < 4 || !r.includes(label) || c.state === "done" || c.state === "missing" || seen.has("c:" + label)) continue;
      seen.add("c:" + label);
      out.push({ kind: "file", en: `${said(reason)} ${c.label.en} isn't with it yet.`, zh: `${saidZh(reason)}${c.label.zh}尚未附上。` });
    }
  }
  return out;
}

/** The risk flags a filing carries, cleaned for filing_risk_flags: known shapes only, at most 30, each kind once. */
export function riskRows(f: Pick<Filing, "id" | "workspace_id" | "payload">): { filing_id: string; workspace_id: string; form: string | null; issue: string; severity: "low" | "medium" | "high"; overridden: boolean }[] {
  const r = f.payload.risk;
  if (!r || !Array.isArray(r.flags)) return [];
  const over = !!r.override?.at, seen = new Set<string>(), out: ReturnType<typeof riskRows> = [];
  for (const x of r.flags.slice(0, 30)) {
    const issue = String(x?.issue ?? ""), sev = String(x?.severity ?? "");
    if (!/^[a-z_]{1,40}$/.test(issue) || !["low", "medium", "high"].includes(sev) || seen.has(issue)) continue;
    seen.add(issue);
    out.push({ filing_id: f.id, workspace_id: f.workspace_id, form: f.payload.official?.slice(0, 120) ?? null, issue, severity: sev as "low" | "medium" | "high", overridden: over && sev === "high" });
  }
  return out;
}

/** Everything that must be true before anything is sent. Empty when the filing can go. route is where pick() is
    sending it: the filled form and signature are checked only when Placetta sends paper (email, fax or mail). */
export function check(f: Filing, d: Dest | undefined, ctx: { docPaths: Set<string> }, route?: Route): Problem[] {
  const out: Problem[] = [];
  const p = f.payload;
  for (const x of p.fields ?? []) {
    const v = (x.value ?? "").trim();
    if (SECRET_NUMBER.test(v)) {
      out.push({ kind: "secret", en: `${x.label.en} has an SSN or ITIN. Placetta never sends one; that line is filled on the agency's own site or by hand.`, zh: `${x.label.zh}含有 SSN 或 ITIN。快哉从不发送这类号码，请在机构网站上或手写填写。` });
    } else if (!v && !SECRET_LABEL.test(x.label.en)) {
      out.push({ kind: "missing", en: `${x.label.en} is empty`, zh: `${x.label.zh}未填写` });
    }
  }
  for (const c of p.checklist ?? []) {
    if (c.state === "missing") out.push({ kind: "missing", en: `Not ready: ${c.label.en}`, zh: `尚未完成：${c.label.zh}` });
  }
  for (const a of p.attachments ?? []) {
    if (!a.path?.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(a.path)) out.push({ kind: "file", en: `${a.name} isn't in Documents`, zh: `文件中找不到 ${a.name}` });
  }
  const signed = signedCopy(f);
  if (signed && (!signed.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(signed))) out.push({ kind: "file", en: "The signed copy isn't in Documents. Upload it again.", zh: "文件中找不到签名件，请重新上传。" });
  // A portal takes its own answers and an owner packet is sent by the owner; email, fax and mail carry our copy.
  const paperless = route ? route === "portal" || route === "owner" : !!d?.portal || !!d?.owner;
  if (d?.onBehalf === "authorization" && route !== "owner" && !(p.attachments ?? []).some((a) => AUTHORIZATION.test(a.name))) {
    const what = d.authorization ?? "authorization";
    out.push({ kind: "file", en: `The agency takes this from someone filing for you only with your signed ${what}. Sign it and add it to this application's documents.`, zh: `机构要求代办人提交时附上您签署的授权文件（${what}）。请签署后添加到本申请的文件中。` });
  }
  if (d && !paperless) {
    if (!p.pdf_path) out.push({ kind: "file", en: "The filled official form is missing. Approve it again from the application.", zh: "缺少已填写的官方表格。请在申请中重新批准。" });
    else if (!p.pdf_path.startsWith(`${f.workspace_id}/`) || !ctx.docPaths.has(p.pdf_path)) out.push({ kind: "file", en: "The filled official form isn't in Documents.", zh: "文件中找不到已填写的官方表格。" });
    if ((d.signature === "typed" || d.signature === "drawn") && !p.signature) {
      out.push({ kind: "signature", en: "The form needs the signer's signature. Approve it again and sign in the card.", zh: "表格需要签署人签名。请重新批准并在卡片中签名。" });
    }
    if (d.signature === "drawn" && p.signature?.kind === "typed") {
      out.push({ kind: "signature", en: "This agency needs a drawn signature, not a typed one.", zh: "该机构需要手绘签名，而不是打字签名。" });
    }
  }
  return out;
}

/** makesAccount: no saved login, but Odelia may make the business's own account on the portal first (accounts.ts
    "business", and the business signed Placetta as its agent with account making switched on: account_authority in
    20261105090000_agent_accounts.sql). feeAuthority: the filing's fee may be paid by Placetta (a live Autopilot grant
    behind it, or an owner's approval of this fee; _shared/issuing.ts feeAuthority), checked only when checks are on and
    a fee goes with the filing. */
/** captchaHost: the agency's portal showed Odelia a CAPTCHA or another bot challenge on recent runs (portal_challenges,
    20261105090800_filer_ai_cost.sql), so pick() prefers a way without one when it isn't much slower. */
/** captchaChoice: the workspace's saved answer for this portal (captcha_preferences): "me" or "team" keep the portal,
    "route" sends it another way, "ask" (or none) lets pick() decide and captchaPlan() ask. */
export type Facts = { hasLogin: boolean; mailConnected: boolean; makesAccount?: boolean; feeAuthority?: boolean; captchaHost?: boolean; captchaChoice?: CaptchaChoice | null };

export { CHANNEL_DAYS };
/** How much slower a way without a CAPTCHA may be and still be preferred, unasked, to a portal that shows one. */
export const CAPTCHA_DETOUR_DAYS = 3;

/** Before the filing starts, on a portal that shows CAPTCHAs: the channel, or the owner's question when the agency also
    takes a way without one that is slower (pick() already took one that isn't). Their saved answer decides without asking:
    "me" and "team" keep the portal, "route" takes the other way. */
export function captchaPlan(f: Filing, d: Dest | undefined, env: Env, facts: Facts, channel: Route): { channel: Route } | { ask: Bi; alt: "email" | "fax" | "mail"; days: number } {
  if (channel !== "portal" || !d || !(facts.captchaHost || d.captcha)) return { channel };
  const alt = pick(f, d, { ...env, channels: env.channels.filter((c) => c !== "portal") }, { ...facts, captchaHost: false });
  if (alt !== "email" && alt !== "fax" && alt !== "mail") return { channel };   // no way without one: the portal, team then owner
  if (facts.captchaChoice === "route") return { channel: alt };
  if (facts.captchaChoice === "me" || facts.captchaChoice === "team") return { channel };
  const days = CHANNEL_DAYS[alt] - CHANNEL_DAYS.portal;
  return { ask: captchaQuestion(alt, days), alt, days };
}

/** The worker goes to make this portal's account for the business: the business's agent authority covers making
    accounts, and the site takes a business's own account ("business"), or nobody has said yet ("unknown": the worker
    asks the team before it opens anything, and the filing goes another way the agency takes meanwhile). Never for a
    person's own identity ("individual"). */
export const canMakeAccount = (d: Dest | undefined, authority: boolean): boolean => {
  const k = accountOf(d);
  return !!d?.portal && authority && (k === "business" || k === "unknown");
};

/** The filing carries an agency fee. */
export const feeDue = (f: Filing): boolean => Number(f.fee_estimate ?? 0) > 0;

/** A fee has to go with the filing: the agency's page says the fee is sent with it or paid at the counter, or the
    filing has a fee and the page doesn't say the agency bills it afterwards. Placetta never sends money, so email, fax
    and mail are out. An agency that invoices after it has the filing ("invoice") gets nothing with it: the bill goes to
    the business (or its accounts-payable email), so its fee doesn't keep the form off email, fax or mail. */
export const feeBlocks = (f: Filing, d: Dest | undefined): boolean =>
  d?.payment === "with_filing" || d?.payment === "in_person" || (feeDue(f) && d?.payment !== "invoice");

/** The fee goes with the filing by a Lob check mailed with the form, under the same authority and cap as a card: checks
    on, the filing's fee authority, an agency that takes the fee with a mailed filing (payment "with_filing", a mailing
    address), a known fee, nothing but the form to send, and no handwritten signature. Anything else stays with the
    team, as before. */
export function checkPays(f: Filing, d: Dest | undefined, env: Env, facts: Facts): boolean {
  return !!env.checks && facts.feeAuthority === true && !!d?.mail && env.mail && env.channels.includes("mail") && d.payment === "with_filing" &&
    feeDue(f) && d.signature !== "wet" && !d.owner && extraFiles(f) === 0;
}

/** The fee in cents a check for this filing is made out for: the registry's fee exactly (an agency wants the exact
    amount on a check), never above the cap. Null when it can't be. */
export function checkCents(f: Filing, capCents: number): number | null {
  const c = Math.round(Number(f.fee_estimate ?? 0) * 100);
  return c > 0 && c <= capCents && c <= 99_999_999 ? c : null;
}

/** Lob's POST /v1/checks body: drawn on Placetta's bank account in Lob, to the agency's mailing address with the payee
    the agency names, first class (Lob mails checks first class only), the filled form attached so check and form go in
    one envelope, and the filing and purchase in its metadata. */
export function lobCheckBody(o: { filing: Filing; purchase: string; to: Record<string, string>; payee: string; from: unknown; bank: string; cents: number; file: string; business: string }) {
  const form = o.filing.payload.form?.en ?? o.filing.payload.official ?? "filing";
  return {
    description: `Placetta fee ${o.filing.payload.official ?? ""} ${o.filing.id}`.slice(0, 255),
    to: { ...o.to, name: o.payee.slice(0, 40) }, from: o.from, bank_account: o.bank, amount: Number((o.cents / 100).toFixed(2)),
    memo: `${form}`.slice(0, 40), message: `Fee for ${form}, for ${o.business}. The filled form is enclosed. Sent by Placetta on the applicant's behalf.`.slice(0, 400),
    attachment: o.file, mail_type: "usps_first_class", use_type: "operational", metadata: { filing: o.filing.id, purchase: o.purchase },
  };
}

/** "Show Odelia how" (teach mode, worker/filer/src/teach.ts): why it can't start on this filing, or null. The form's
    destination is an agency site, the portal worker is on, and the filing isn't sent, finished or already running.
    The person files it themselves in the live browser; nothing is typed or clicked for them. */
export type TeachRefusal = "no_portal" | "worker_off" | "finished" | "busy";
export function teachRefusal(f: Filing, d: Dest | undefined, env: Env): TeachRefusal | null {
  if (!d?.portal) return "no_portal";
  if (!env.portalWorker) return "worker_off";
  if (f.submit_clicked_at || ["submitted", "accepted", "rejected", "canceled"].includes(f.status)) return "finished";
  if (f.agent_state && !["handoff", "needs_you"].includes(f.agent_state)) return "busy";
  return null;
}
export const TEACH_REFUSED: Record<TeachRefusal, Bi> = {
  no_portal: { en: "This form isn't filed on an agency website, so there's nothing to show Odelia.", zh: "这份表格不在机构网站上提交，无需向 Odelia 演示。" },
  worker_off: { en: "Filing on agency websites isn't switched on yet. Send this one with the packet in Documents.", zh: "机构网站提交功能尚未开启。请用“文件”中的材料包自行提交这一份。" },
  finished: { en: "This filing has already gone to the agency.", zh: "这份申请已提交给机构。" },
  busy: { en: "Odelia is already working on this filing. Wait for it to finish or stop it first.", zh: "Odelia 正在办理这份申请，请等待完成或先停止。" },
};

/** An email carries the filled form and at most four attachments (integrations' mail_send takes five files). */
export const EMAIL_ATTACHMENTS = 4;
const extraFiles = (f: Filing) => (f.payload.attachments ?? []).length;

/** Where it goes, in order: the owner when only the business can submit it, then portal, email, fax, mail, else the
    team. A wet signature rules out sending Placetta's own copy: once the person has signed it in ink and its photo or
    scan is in Documents, Placetta faxes that copy, or emails it to an agency that takes the form by email (both take a
    copy of an ink signature); certified mail never carries it, since a mailed form must be the original. A fee rules
    out email, fax and mail. A fax or a letter carries only the form, so a filing with attachments never goes by fax or
    mail, and an email with more than four goes to the team. */
/** The business start date on the approved form, when the agency refuses a future one (Dest.startNotFuture) and the
    approved date is still ahead: the day Odelia files it herself, as YYYY-MM-DD. Otherwise null. Copies what personal
    agents do when they can (Claude Duet, Poke): wait and act, instead of asking. Only an unambiguous date counts. */
const START_LABEL = /\b(start(ing|ed)?|began|begin|commence(d|ment)?|opening)\b.*\bdate\b|\bdate\b.*\b(start(ed)?|began|commenced|business began)\b/i;
export function waitForStart(f: Pick<Filing, "payload">, d: Pick<Dest, "startNotFuture"> | undefined, today: string): string | null {
  if (!d?.startNotFuture) return null;
  for (const x of f.payload.fields ?? []) {
    if (!START_LABEL.test(x.label?.en ?? "")) continue;
    const day = isoDay(x.value);
    if (day && day > today) return day;
  }
  return null;
}
/** YYYY-MM-DD from "2026-11-15" or "11/15/2026"; anything else is not a date we act on. */
export function isoDay(v: string): string | null {
  const t = (v ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let y: number, mo: number, da: number;
  if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { y = +m[3]; mo = +m[1]; da = +m[2]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da) return null;
  return dt.toISOString().slice(0, 10);
}

export function pick(f: Filing, d: Dest | undefined, env: Env, facts: Facts): Route {
  if (!d) return "team";
  if (d.owner) return "owner";
  const on = (c: Channel) => env.channels.includes(c);
  // no saved login: the account is made first, by the worker, when Odelia may make it (worker/filer/src/account.ts)
  if (d.portal && (facts.hasLogin || d.noLogin || facts.makesAccount) && env.portalWorker && on("portal")) {
    // A portal that keeps showing CAPTCHAs: a way the agency accepts without one (email, fax or mail), when it isn't
    // more than CAPTCHA_DETOUR_DAYS slower. Nothing is solved or bypassed either way: the portal's CAPTCHA would still go
    // to the Placetta team, then the owner.
    // known two ways: seen on recent runs (facts.captchaHost) or stated by the agency's own guide (Dest.captcha)
    if ((facts.captchaHost || d.captcha) && facts.captchaChoice !== "me" && facts.captchaChoice !== "team") {
      const alt = pick(f, d, { ...env, channels: env.channels.filter((c) => c !== "portal") }, { ...facts, captchaHost: false });
      if ((alt === "email" || alt === "fax" || alt === "mail") && CHANNEL_DAYS[alt] - CHANNEL_DAYS.portal <= CAPTCHA_DETOUR_DAYS) return alt;
    }
    return "portal";
  }
  if (feeBlocks(f, d)) return checkPays(f, d, env, facts) ? "mail" : "team";
  if (d.signature === "wet") {
    if (!signedCopy(f)) return "team";
    if (canFaxSignedFor(f, d, env)) return "fax";
    return canEmailSignedFor(f, d, env, facts) ? "email" : "team";
  }
  if (d.email && facts.mailConnected && on("email") && extraFiles(f) <= EMAIL_ATTACHMENTS) return "email";
  if (extraFiles(f)) return "team";
  if (d.fax && env.fax && on("fax")) return "fax";
  if (d.mail && env.mail && on("mail")) return "mail";
  return "team";
}

/** Why pick() didn't choose a channel Placetta sends on: one plain sentence for the business, in the same order pick()
    decides. */
export function whyYours(f: Filing, d: Dest | undefined, env: Env, facts: Facts): Bi {
  if (!d) {
    const t = TEAM_ONLY[f.payload.official ?? ""];
    return t ? { en: `Odelia can't send this one for you: ${t.why}`, zh: `Odelia 无法代您提交这一份：${t.why}` }
      : { en: "Placetta doesn't have a checked way to send this form to the agency yet.", zh: "快哉尚未核实这份表格的提交方式。" };
  }
  if (feeBlocks(f, d) && env.checks && !facts.feeAuthority && d.payment === "with_filing" && d.mail) return { en: "The agency's fee goes with this filing, and nobody has authorized Placetta to pay it (Autopilot, or your approval of the fee).", zh: "这份申请需随附机构费用，但尚未授权快哉代付（自动驾驶，或您对该费用的批准）。" };
  // the agency's site would have taken it, but it needs an account nobody has saved: say whose account it is
  if (d.portal && !facts.hasLogin && !d.noLogin && env.portalWorker && env.channels.includes("portal")) {
    const kind = accountOf(d);
    if (kind === "individual") return ACCOUNT_SAY.individual;
    if (kind !== "none") return facts.makesAccount && kind === "unknown" ? ACCOUNT_SAY.unknown : ACCOUNT_SAY.authority;
  }
  if (feeBlocks(f, d)) return { en: "The agency's fee goes with this filing, and Placetta never sends money.", zh: "这份申请需随附机构费用，快哉从不代付款项。" };
  if (d.ids) return { en: `It needs your own identity documents: ${d.ids} So you sign it and mail it yourself, with the packet Odelia prepared.`, zh: "这份申请需要附上您本人的身份证件原件（或签发机构认证的副本），因此请您签名后自行寄出，Odelia 已准备好材料包。" };
  if (d.signature === "wet") return { en: "The agency needs a handwritten signature on this form.", zh: "该机构要求在表格上手写签名。" };
  if (d.email && facts.mailConnected && env.channels.includes("email") && extraFiles(f) > EMAIL_ATTACHMENTS) {
    return { en: `It has more than ${EMAIL_ATTACHMENTS} attachments, more than Placetta sends in one email.`, zh: `附件超过 ${EMAIL_ATTACHMENTS} 个，超出快哉单封邮件可发送的数量。` };
  }
  if (extraFiles(f) && (d.fax || d.mail) && !d.email) return { en: "A fax or letter from Placetta carries only the form, and this one has attachments.", zh: "快哉的传真或信件只能附带表格本身，而这份申请有附件。" };
  if (d.email && !facts.mailConnected && env.channels.includes("email")) return { en: "This agency takes it by email, and no mailbox is connected to send it from. Connect one in Settings, or send it yourself.", zh: "该机构通过邮件受理，但尚未连接可用于发送的邮箱。可在“设置”中连接，或自行发送。" };
  return { en: "Placetta doesn't send to this agency by itself yet.", zh: "快哉暂时无法自动向该机构提交。" };
}

/** Why a portal run handed a filing back without submitting anything: it couldn't finish on the agency's site (limit),
    the site sent it elsewhere (left_portal), there's no approved portal for the form (no_portal), it failed three
    times (portal_failed), the agency's review page didn't match what was approved (review_differs), the page had text
    aimed at an AI (page_injection), the agency's bot protection refused the worker's server (portal_blocked), the steps for the site haven't had their first supervised run
    (unverified_playbook), or a "Show Odelia how" run ended without a filing (no_live_view, teach_incomplete). The
    worker writes these as the hand-back's ref (worker/filer/src/run.ts). Each is tried another way the agency takes,
    else handed to the business with its packet. */
export const PORTAL_FAILED = new Set(["limit", "left_portal", "no_portal", "portal_failed", "review_differs", "page_injection", "unverified_playbook", "no_live_view", "teach_incomplete", "portal_blocked", WORKER_ASLEEP,
  // the owner chose another way when the site showed a CAPTCHA mid-run (worker run.ts captchaAsk, captcha.ts)
  "captcha_reroute",
  // Odelia couldn't make the business's account (worker/filer/src/account.ts): the site wants a person's own identity,
  // nobody has said yet whether an agent may make it, the agent authority doesn't cover it, or the agency's email never came
  "account_identity", "account_unknown", "account_authority", "account_no_mail"]);

/** A reroute's sentences, from why the agency's site wasn't used: it failed, or the worker didn't wake in time.
    lead is a whole sentence; sends(said) says the other way it goes. */
export function rerouteLead(f: Pick<Filing, "agent_log">): { lead: Bi; sends(said: Bi): Bi } {
  const last = [...f.agent_log].reverse().find((e) => e.kind === "handoff");
  // Odelia couldn't make the business's account: the worker's own sentence says why, and what the owner can do
  if (last?.ref?.startsWith("account_")) {
    const c = last.ref === "account_identity" ? { en: "This agency's site signs in with a person's own identity (ID.me or Login.gov)", zh: "该机构网站要用个人身份（ID.me 或 Login.gov）登录" }
      : { en: "This agency's site needs an account Odelia couldn't make for the business yet", zh: "该机构网站需要账户，Odelia 暂时无法为企业开设" };
    return { lead: { en: last.en, zh: last.zh }, sends: (said) => ({ en: `${c.en}, so Placetta sends it ${said.en} instead.`, zh: `${c.zh}，快哉改为${said.zh}提交。` }) };
  }
  const c = last?.ref === WORKER_ASLEEP
    ? { en: "Odelia's filing browser didn't start in time", zh: "Odelia 的提交浏览器未能及时启动" }
    : { en: "The agency's site didn't work", zh: "机构网站无法完成" };
  return { lead: { en: `${c.en}.`, zh: `${c.zh}。` }, sends: (said) => ({ en: `${c.en}, so Placetta sends it ${said.en} instead.`, zh: `${c.zh}，快哉改为${said.zh}提交。` }) };
}

/** Hand-backs after which something may already have reached the agency: the business checks before anything else. */
export const MAYBE_SENT = new Set(["maybe_submitted"]);

/** Placetta checks a form's first FILER_TWO_KEY self-filings before they leave. If that check hasn't happened within
    this many hours, the business gets the packet instead of waiting on Placetta. */
export const REVIEW_HOURS = 24;

/** What the sweep does with a filing sitting with Placetta (agent state "handoff", not finished; channel "team" except
    during Placetta's check, which keeps the channel it would send on): reroute (the agency's site failed: try another way), check (something may have reached the
    agency: the business checks first), review_late (Placetta's check took longer than REVIEW_HOURS), yours (any other
    hand-back: the business gets the packet), or null (leave it: Placetta's check is still within its window, or the
    Placetta team took it over by hand). */
export type HandBack = "reroute" | "check" | "review_late" | "yours";
export function handBackDue(f: Pick<Filing, "channel" | "agent_state" | "submit_clicked_at" | "status" | "agent_log">, nowMs: number): HandBack | null {
  if (f.agent_state !== "handoff") return null;
  if (["canceled", "submitted", "accepted", "rejected"].includes(f.status)) return null;
  const last = f.agent_log[f.agent_log.length - 1];
  if (!last || last.kind === "take_over") return null;
  // Placetta's check keeps the channel it would send on (email, fax, mail, or the agency's site)
  if (last.kind === "review_wait" || last.kind === "review_page") {
    if (f.submit_clicked_at) return null;
    const at = Date.parse(last.at ?? "");
    return Number.isFinite(at) && nowMs - at >= REVIEW_HOURS * 3600e3 ? "review_late" : null;
  }
  if (f.channel !== "team") return null;
  if (f.submit_clicked_at || MAYBE_SENT.has(last.ref ?? "")) return "check";
  if (last.kind === "handoff" && PORTAL_FAILED.has(last.ref ?? "")) return "reroute";
  return "yours";
}

/** A filing the agency's site failed and nobody has acted on since: with the team, nothing submitted, not finished, and
    the last thing in its log is the portal run's hand-back. Placetta then tries another way before the team does it by
    hand (reroute in index.ts); whatever it decides goes in the log, so a filing is looked at once. */
export function rerouteDue(f: Pick<Filing, "channel" | "agent_state" | "submit_clicked_at" | "status" | "agent_log">): boolean {
  if (f.channel !== "team" || f.agent_state !== "handoff" || f.submit_clicked_at) return false;
  if (["canceled", "submitted", "accepted", "rejected"].includes(f.status)) return false;
  const last = f.agent_log[f.agent_log.length - 1];
  return last?.kind === "handoff" && PORTAL_FAILED.has(last.ref ?? "");
}

/** Where a filing goes when the agency's site failed: the same rules as pick(), in the same order, with the site left
    out. Email, fax or certified mail when the agency takes it that way and nothing rules them out (a fee, a wet
    signature, attachments a fax or letter can't carry); the owner's packet when only the business may send it; else
    the team. The person's one approval covers it: the card said Placetta sends it by email, fax, certified mail or the
    agency's site. */
export function fallback(f: Filing, d: Dest | undefined, env: Env, facts: Facts): Route {
  if (!d) return "team";
  return pick(f, { ...d, portal: undefined }, env, facts);
}

/** A saved login opens this destination's portal (same host and, on a shared host, the same agency's path). */
export const hasLoginFor = (logins: (string | null | undefined)[], d: Dest | undefined): boolean =>
  !!d?.portal && logins.some((u) => loginMatches(u, d));

/** The agency's fax number or address for this owner. */
export function faxTo(d: Dest, p: Payload): string | null {
  if (!d.fax) return null;
  return isForeign(p) ? (d.fax.foreign ?? null) : d.fax.us;
}
export function mailTo(d: Dest, p: Payload) {
  if (!d.mail) return null;
  return isForeign(p) && d.mail.foreign ? d.mail.foreign : d.mail;
}

/** The hand-signed copy the person uploaded for a wet-signature form, if any: its Documents path, kept in the log
    (the payload is frozen once approved). */
export const signedCopy = (f: Filing): string | undefined => [...f.agent_log].reverse().find((e) => e.kind === "signed_copy")?.ref;

/** What gets faxed: the hand-signed copy when there is one, otherwise the filled form. */
export const faxFile = (f: Filing): string | undefined => signedCopy(f) ?? f.payload.pdf_path;

/** Placetta can fax a hand-signed copy for this form when the agency takes faxes and fax is switched on. */
export const canFaxSigned = (d: Dest | undefined, env: Env): boolean => !!d?.fax && env.fax && env.channels.includes("fax");

/** ...and for this filing: no fee has to go with it, and nothing but the form (a fax carries only the form). */
export const canFaxSignedFor = (f: Filing, d: Dest | undefined, env: Env): boolean =>
  canFaxSigned(d, env) && !feeBlocks(f, d) && extraFiles(f) === 0;

/** Placetta can email a hand-signed copy for this filing: the agency takes the form by email (so it takes a scan of an
    ink signature), a mailbox is connected and email is switched on, no fee goes with it, and it fits in one email. */
export const canEmailSignedFor = (f: Filing, d: Dest | undefined, env: Env, facts: Pick<Facts, "mailConnected">): boolean =>
  !!d?.email && facts.mailConnected && env.channels.includes("email") && !feeBlocks(f, d) && extraFiles(f) <= EMAIL_ATTACHMENTS;

/** What gets emailed, faxed or mailed: the hand-signed copy when there is one, otherwise the filled form. */
export const paperFile = (f: Filing): string | undefined => signedCopy(f) ?? f.payload.pdf_path;

/** How a form that needs an ink signature gets signed without the owner printing or posting anything, the honest
    default for each form:
      photo   the agency takes a copy of the ink signature (by fax, or by email): the owner signs the page (Placetta
              mails it to them with one tap, or they print it) and takes a photo in the app; Placetta sends that copy.
      return  the agency wants the original by mail: one tap and Placetta prints the form and mails it to the owner with
              a return envelope whose window shows the agency's address; the owner signs, adds the check when the fee
              goes with it, and drops it in the mail. Tracked from there.
      yours   neither fits (the fee is paid at the counter, attachments go with it, or no Lob): the packet, as before. */
export type WetPath = { path: "photo"; via: "fax" | "email" } | { path: "return" } | { path: "yours" };
export function wetPath(f: Filing, d: Dest | undefined, env: Env, facts: Pick<Facts, "mailConnected">): WetPath {
  // the signer's own identity documents go with it (an ITIN application): theirs to send, with a plain reason
  if (!d || d.signature !== "wet" || d.owner || d.ids) return { path: "yours" };
  const copy: Filing = { ...f, agent_log: [...f.agent_log, { en: "", zh: "", kind: "signed_copy", ref: "signed" }] };
  if (canFaxSignedFor(copy, d, env)) return { path: "photo", via: "fax" };
  if (canEmailSignedFor(copy, d, env, facts)) return { path: "photo", via: "email" };
  if (env.mail && mailTo(d, f.payload) && d.payment !== "in_person" && extraFiles(f) === 0) return { path: "return" };
  return { path: "yours" };
}

/** The one-tap signing kit Placetta mails to the owner (Lob): the photo kit is the form to sign and a cover page; the
    return kit adds a tear-off slip with the agency's address for the return envelope's window. Lines of plain ASCII
    for the cover page, and the log entry in English and Chinese. */
export function signKit(f: Filing, d: Dest, path: Exclude<WetPath, { path: "yours" }>): { cover: string[]; slip: string[] | null; en: string; zh: string } {
  const form = f.payload.form?.en || f.title.en;
  const formZh = f.payload.form?.zh || f.title.zh;
  const to = mailTo(d, f.payload);
  const fee = feeDue(f) ? Number(f.fee_estimate) : 0;
  const withCheck = path.path === "return" && (d.payment === "with_filing" || (fee > 0 && d.payment !== "invoice"));
  const feeLine = withCheck ? (fee ? `the agency's fee, about $${fee}, by check or money order made out as the form says` : "the agency's fee by check or money order, as the form says") : "";
  const steps = path.path === "photo"
    ? [
      `1. Sign ${form} by hand where it asks for your signature, and date it.`,
      "2. Open Placetta, tap \"Upload the signed copy\" on this filing and take a clear photo of the signed page.",
      `3. Placetta ${path.via === "fax" ? "faxes" : "emails"} it to the agency and saves the confirmation. You don't mail anything.`,
    ]
    : [
      `1. Sign ${form} by hand where it asks for your signature, and date it.`,
      ...(withCheck ? [`2. Put in ${feeLine}.`] : []),
      `${withCheck ? 3 : 2}. Tear off the last page along the perforation and put it in the return envelope so the agency's address shows in the window.`,
      `${withCheck ? 4 : 3}. Put the signed form in the same envelope, add a first-class stamp and drop it in the mail.`,
      "Then tap \"I've sent it\" on this filing in Placetta. Odelia tracks it from there.",
    ];
  const cover = [
    `Sign and ${path.path === "photo" ? "photograph" : "mail"}: ${form}`,
    `For: ${f.payload.fields?.find((x) => x.id === "l1")?.value || f.title.en}`,
    "",
    "Why it's on paper:",
    ...wrap("The agency needs this form signed in ink, so Placetta can't sign it for you. Everything else is filled in."),
    "",
    "What to do:",
    ...steps.flatMap((s) => wrap(s)),
    ...(to && path.path === "return" ? ["", "It goes to:", ...wrap([to.name, to.line1, to.line2, `${to.city}, ${to.state} ${to.zip}`].filter(Boolean).join(", "))] : []),
    "",
    ...wrap(`The agency's page: ${d.source} (checked ${d.checked})`),
  ];
  const slip = path.path === "return" && to ? [to.name, to.line1, ...(to.line2 ? [to.line2] : []), `${to.city} ${to.state} ${to.zip}`] : null;
  const en = path.path === "photo"
    ? `Placetta is mailing you ${form} to sign. Sign it by hand, then tap "Upload the signed copy" and take a photo: Placetta ${path.via === "fax" ? "faxes" : "emails"} it to the agency. It arrives by post in a few days.`
    : `Placetta is mailing you ${form} with a return envelope addressed to the agency. Sign it${withCheck ? ", add the check for the fee" : ""}, add a stamp, drop it in the mail and tap "I've sent it". It arrives by post in a few days.`;
  const zh = path.path === "photo"
    ? `快哉正在把${formZh}寄给您签字。请亲笔签名后，点击“上传签名件”并拍照，快哉将${path.via === "fax" ? "传真" : "通过邮件发送"}给机构。几天内寄到。`
    : `快哉正在把${formZh}连同写好机构地址的回邮信封寄给您。请签名${withCheck ? "并放入缴费支票" : ""}，贴上邮票后投入邮筒，再点击“我已发出”。几天内寄到。`;
  return { cover, slip, en, zh };
}

/** What the filing card says when a form needs the owner's ink: one tap mails them the page, and what happens after. */
export function wetAsk(f: Filing, d: Dest, path: Exclude<WetPath, { path: "yours" }>): Bi {
  const fee = feeDue(f) ? Number(f.fee_estimate) : 0;
  const check = path.path === "return" && (d.payment === "with_filing" || (fee > 0 && d.payment !== "invoice"));
  if (path.path === "photo") {
    const how = path.via === "fax" ? { en: "faxes", zh: "传真" } : { en: "emails", zh: "通过邮件发送" };
    return {
      en: `This agency needs a handwritten signature. Tap "Mail me the page" and Placetta prints the filled form and mails it to you, or print it from Documents. Sign it, then upload a photo of the signed page here: Placetta ${how.en} it to the agency and saves the confirmation.`,
      zh: `该机构要求手写签名。点击“把表格寄给我”，快哉会打印已填好的表格并寄给您；也可从“文件”自行打印。签名后在此上传签名页的照片，快哉会${how.zh}给机构并保存送达确认。`,
    };
  }
  return {
    en: `This agency wants the original, signed in ink, by mail. Tap "Mail me the page": Placetta prints the filled form and mails it to you with a return envelope addressed to the agency. Sign it${check ? ", add a check for the agency's fee" : ""}, add a stamp, drop it in the mail and tap "I've sent it".`,
    zh: `该机构要求邮寄亲笔签名的原件。点击“把表格寄给我”：快哉会打印已填好的表格，连同写好机构地址的回邮信封一起寄给您。请签名${check ? "，放入缴纳机构费用的支票" : ""}，贴上邮票投入邮筒，然后点击“我已发出”。`,
  };
}

/** A mailing address the owner typed for the signing kit: a name, a street line, a city, a two-letter state and a ZIP
    code, trimmed and kept short. Null when it isn't one. */
export function kitAddress(raw: unknown): { name: string; line1: string; line2?: string; city: string; state: string; zip: string } | null {
  const a = (raw ?? {}) as Record<string, unknown>;
  const s = (k: string, max: number) => String(a[k] ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
  const out = { name: s("name", 40), line1: s("line1", 64), line2: s("line2", 64), city: s("city", 40), state: s("state", 20).toUpperCase(), zip: s("zip", 20) };
  if (out.name.length < 2 || out.line1.length < 3 || out.city.length < 2 || !/^[A-Z]{2}$/.test(out.state) || !/^\d{5}(-\d{4})?$/.test(out.zip)) return null;
  const { line2, ...rest } = out;
  return line2 ? { ...rest, line2 } : rest;
}

/** The hand-back that asks the owner to send an owner-only form themselves, with the packet Odelia prepared. */
export const OWNER_REF = "owner_packet";

/** What the owner packet says: why only the business can submit it, where it goes, and what goes with it. Plain
    ASCII lines for the packet's cover page; the log entry carries the same in English and Chinese. */
export function ownerPacket(f: Filing, d: Dest): { en: string; zh: string; lines: string[]; link: string | null } {
  const o = d.owner!;
  const form = f.payload.form?.en || f.title.en;
  const formZh = f.payload.form?.zh || f.title.zh;
  const addr = o.mail ? [o.mail.name, o.mail.line1, o.mail.line2, `${o.mail.city}, ${o.mail.state} ${o.mail.zip}`].filter(Boolean).join(", ") : "";
  const where = o.url ? `on ${o.url}` : o.email ? `by email to ${o.email}` : `by mail to ${addr}`;
  const whereZh = o.url ? `在 ${o.url} 办理` : o.email ? `发送邮件至 ${o.email}` : `邮寄至 ${addr}`;
  const fee = feeDue(f) ? ` The agency's fee (about $${Number(f.fee_estimate)}) is yours to pay.` : "";
  const feeZh = feeDue(f) ? `机构费用（约 ${Number(f.fee_estimate)} 美元）由您支付。` : "";
  const link = o.url && /^https:\/\//.test(o.url) ? o.url : null;
  // the plain reason first (an exam, an ID, a notary, the agency's office, a payment), then the agency's own words
  const kind = OWNER_KIND[f.payload.official ?? ""], plain = kind ? OWNER_KIND_SAID[kind] : null;
  return {
    en: `${form} is one you do yourself: ${plain ? `${plain.en} ` : ""}${o.why} Odelia put a packet in Documents (owner-packet.pdf) with what to send and where. Send it ${where}.${fee} Then tap "I've sent it" and add the agency's confirmation number if it gave you one. Odelia tracks it from there.`,
    zh: `${formZh}需要由您本人办理。${plain?.zh ?? ""}快哉已把材料包放在“文件”中（owner-packet.pdf），写明要提交什么、交到哪里。请${whereZh}。${feeZh}发出后点击“我已发出”，如机构给了确认号请一并填写。之后由 Odelia 跟进进度。`,
    lines: [
      `Owner packet: ${form}`,
      `For: ${f.payload.fields?.find((x) => x.id === "l1")?.value || f.title.en}`,
      "",
      "Why you send it yourself:",
      ...(plain ? wrap(plain.en) : []),
      ...wrap(o.why),
      "",
      "Where it goes:",
      ...(o.url ? wrap(o.url) : []),
      ...(o.email ? [`Email: ${o.email}`] : []),
      ...(addr ? wrap(`Mail: ${addr}`) : []),
      "",
      `Signature: ${d.signature === "wet" ? "sign by hand" : d.signature === "none" ? "none" : "electronic signature accepted"}`,
      `Fee: ${feeDue(f) ? `about $${Number(f.fee_estimate)}, ` : ""}${PAYMENT_SAID[d.payment ?? ""] ?? "as the agency asks"}`,
      ...(d.attach?.length ? ["", "What goes with it:", ...d.attach.flatMap((a) => wrap(a))] : []),
      "",
      "Your filled form and documents are in Placetta's Documents.",
      ...wrap(`The agency's page: ${d.source} (checked ${d.checked})`),
    ],
    link,
  };
}

/** The hand-back that gives a filing to the business to send itself, with the packet Odelia prepared. */
export const YOURS_REF = "yours";

/** A hand-back the business finishes by sending it themselves: "I've sent it" (with the agency's confirmation number
    when there is one) marks it submitted, and Odelia tracks it from there. */
export const sentByYou = (e: Pick<LogEntry, "kind" | "ref"> | undefined): boolean =>
  !!e && ((e.kind === "needs_you" && (e.ref === OWNER_REF || e.ref === YOURS_REF)) || e.kind === "wet_signature");

/** Where the business sends a form itself, in the order the agency's page gives the ways: its site, email, fax, mail. */
export function waysToSend(d: Dest | undefined, p: Payload): { en: string[]; zh: string[]; link: string | null } {
  if (!d) return { en: [], zh: [], link: null };
  const site = d.portalUrl ?? (d.portal ? `https://${d.portal}${d.tenant ?? ""}` : null);
  const m = mailTo(d, p), fax = faxTo(d, p);
  const addr = m ? [m.name, m.line1, m.line2, `${m.city}, ${m.state} ${m.zip}`].filter(Boolean).join(", ") : "";
  const en: string[] = [], zh: string[] = [];
  if (site) { en.push(`On the agency's site: ${site}`); zh.push(`在机构网站：${site}`); }
  if (d.email) { en.push(`By email to ${d.email}`); zh.push(`发送邮件至 ${d.email}`); }
  if (fax) { en.push(`By fax to ${fax}`); zh.push(`传真至 ${fax}`); }
  if (addr) { en.push(`By mail to ${addr}`); zh.push(`邮寄至 ${addr}`); }
  // an agency that routes by state (the IRS's service centers), when the form didn't say which state: every center
  if (!m && !fax && d.byState) {
    for (const g of d.byState.groups) {
      const a = g.mail ? [g.mail.name, g.mail.line1, g.mail.line2, `${g.mail.city}, ${g.mail.state} ${g.mail.zip}`].filter(Boolean).join(", ") : "";
      const how = [g.fax ? `fax ${g.fax}` : "", a ? `mail ${a}` : ""].filter(Boolean);
      en.push(`For a business in ${g.states.join(", ")}: ${how.join(" or ")}`);
      zh.push(`企业位于 ${g.states.join("、")}：${[g.fax ? `传真 ${g.fax}` : "", a ? `邮寄 ${a}` : ""].filter(Boolean).join(" 或 ")}`);
    }
    const ab = d.byState.abroad?.mail;
    if (ab) { const a = [ab.name, ab.line1, `${ab.city}, ${ab.state} ${ab.zip}`].join(", "); en.push(`For a business outside the US: mail ${a}`); zh.push(`企业位于美国境外：邮寄 ${a}`); }
  }
  const link = site && /^https:\/\//.test(site) ? site : null;
  return { en, zh, link };
}

/** The packet for a filing Odelia hands to the business: why she isn't sending it, how the agency takes it, the
    signature and the fee, and what goes with it. check: something may already have reached the agency, so the first
    step is to look before sending it again. Plain ASCII lines for the packet's cover page; the log entry carries the
    same in English and Chinese. */
export function handoffPacket(f: Filing, d: Dest | undefined, why: Bi, opts: { check?: boolean; agencyWhy?: string; agencySource?: string } = {}):
  { en: string; zh: string; lines: string[]; link: string | null } {
  if (d?.owner) return ownerPacket(f, d);
  const form = f.payload.form?.en || f.title.en;
  const ways = waysToSend(d, f.payload);
  const wet = d?.signature === "wet";
  const fee = feeDue(f) ? Number(f.fee_estimate) : 0;
  const paySaid = PAYMENT_SAID[d?.payment ?? ""];
  const howEn = ways.en.length ? ` Send it ${ways.en[0].replace(/^On/, "on").replace(/^By/, "by")}${ways.en.length > 1 ? " (other ways the agency takes are in the packet)" : ""}.`
    : opts.agencySource ? ` Follow the agency's page: ${opts.agencySource}.` : " Placetta doesn't have the agency's address for this form yet; the agency's office tells you where it goes.";
  const howZh = ways.zh.length ? `请${ways.zh[0]}${ways.zh.length > 1 ? "（机构接受的其他方式见材料包）" : ""}。`
    : opts.agencySource ? `请按机构页面办理：${opts.agencySource}。` : "快哉暂时没有这份表格的机构地址，请向机构办公室确认提交方式。";
  const first = opts.check ? { en: " First check whether the agency already has it (its site, your email's Sent folder, or a call), so it isn't sent twice.", zh: "请先确认机构是否已收到（机构网站、邮箱的已发送、或致电），避免重复提交。" } : { en: "", zh: "" };
  const signEn = wet ? " Print it and sign it by hand." : "";
  const signZh = wet ? "请打印后手写签名。" : "";
  const feeEn = fee ? ` The agency's fee is about $${fee}${paySaid ? `, ${paySaid}` : ""}.` : d?.payment === "with_filing" || d?.payment === "in_person" ? ` The agency's fee: ${paySaid}.` : "";
  const feeZh = fee ? `机构费用约 ${fee} 美元。` : d?.payment === "with_filing" ? "需随申请附上支票或汇票。" : d?.payment === "in_person" ? "费用需当面缴纳。" : "";
  return {
    en: `${why.en} It's ready for you to send: the filled form and a packet (filing-packet.pdf) are in Documents.${first.en}${signEn}${howEn}${feeEn} Then tap "I've sent it" and add the agency's confirmation number if it gave you one. Odelia tracks it from there.`.slice(0, 1500),
    zh: `${why.zh}已为您准备好：填好的表格和材料包（filing-packet.pdf）在“文件”中。${first.zh}${signZh}${howZh}${feeZh}发出后点击“我已发出”，如机构给了确认号请一并填写。之后由 Odelia 跟进进度。`.slice(0, 1500),
    lines: [
      `Filing packet: ${form}`,
      `For: ${f.payload.fields?.find((x) => x.id === "l1")?.value || f.title.en}`,
      "",
      "Why you send this one:",
      ...wrap(why.en),
      ...(opts.check ? ["", "First:", ...wrap("Check whether the agency already has it (its site, your email's Sent folder, or a call) so it isn't sent twice.")] : []),
      "",
      "Where it goes:",
      ...(ways.en.length ? ways.en.flatMap((w) => wrap(w)) : opts.agencyWhy ? wrap(opts.agencyWhy) : ["Ask the agency's office how it takes this form."]),
      "",
      `Signature: ${wet ? "sign by hand" : d?.signature === "none" ? "none" : d ? "electronic signature accepted" : "as the agency asks"}`,
      `Fee: ${fee ? `about $${fee}, ` : ""}${paySaid ?? "as the agency asks"}`,
      ...(d?.attach?.length ? ["", "What goes with it:", ...d.attach.flatMap((a) => wrap(a))] : []),
      "",
      "Your filled form and documents are in Placetta's Documents.",
      "When it's sent, tap \"I've sent it\" in Placetta and add the agency's confirmation number.",
      ...(d ? wrap(`The agency's page: ${d.source} (checked ${d.checked})`) : opts.agencySource ? wrap(`The agency's page: ${opts.agencySource}`) : []),
    ],
    link: ways.link,
  };
}

const PAYMENT_SAID: Record<string, string> = {
  none: "no fee", portal: "paid on the agency's site", invoice: "the agency sends a bill",
  with_filing: "a check or money order goes with it", in_person: "paid in person or to the exam provider",
};

/** Lines of at most 90 characters, for the packet's cover page. */
function wrap(s: string, width = 90): string[] {
  const out: string[] = [];
  let line = "";
  // A word longer than a line (a long link) is cut into pieces.
  const words = s.split(/\s+/).flatMap((w) => w.length > width ? w.match(new RegExp(`.{1,${width}}`, "g"))! : [w]);
  for (const w of words) {
    if (line && (line + " " + w).length > width) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/** True once the team approved this filing's review (two-key period), recorded in its log. */
export const teamApproved = (f: Filing) => f.agent_log.some((e) => e.kind === "two_key_ok");

/** The email the agency receives: plain, bilingual only in the customer's own copy. */
export function emailFor(f: Filing): { subject: string; body: string } {
  const form = f.payload.form?.en || f.title.en;
  const name = f.payload.fields?.find((x) => x.id === "l1")?.value || "";
  return {
    subject: `${form}${name ? `: ${name}` : ""}`.slice(0, 280),
    body: [
      "Hello,",
      "",
      `Attached is ${form}${name ? ` for ${name}` : ""}, submitted on the applicant's behalf with their authorization.`,
      "Please reply to this email with any questions or the result.",
      "",
      "Thank you.",
    ].join("\n"),
  };
}

export const CHANNEL_SAID: Record<Exclude<Route, "team">, Bi> = {
  owner: { en: "by you, with the packet Placetta prepared", zh: "由您本人凭快哉准备的材料包办理" },
  email: { en: "by email", zh: "通过邮件" },
  fax: { en: "by fax", zh: "通过传真" },
  mail: { en: "by certified mail", zh: "通过挂号信" },
  portal: { en: "on the agency's site", zh: "在机构网站上" },
};

/** Why the database refused a step or a claim, from its exception text: someone else already acted on the filing
    (changed), it was already sent (already), the customer stopped it (stopped), or the workspace is at its daily cap
    of faxes and letters (cap). Null for any other error. */
export type Refusal = "changed" | "already" | "stopped" | "cap";
export function refusalOf(message: string | null | undefined): Refusal | null {
  const m = message ?? "";
  if (/\bfiling_changed\b/.test(m)) return "changed";
  if (/\balready_submitted\b/.test(m)) return "already";
  if (/\bfiling_stopped\b/.test(m)) return "stopped";
  if (/\bdaily_cap\b/.test(m)) return "cap";
  return null;
}

/** What an answer from integrations' mail_send means. A 2xx: sent. A 4xx: refused before sending (bad input, not
    connected, too large), so not sent. No answer (a timeout), a 5xx, or a 409 (this filing's email was already
    claimed): unknown, because a message may have left. */
export function mailOutcome(status: number | null): "sent" | "refused" | "unknown" {
  if (status === null || status >= 500 || status === 409) return "unknown";
  if (status >= 200 && status < 300) return "sent";
  return status >= 400 ? "refused" : "unknown";
}

/** How many times this filing's fax has failed, from its log. */
export const faxFailures = (f: Pick<Filing, "agent_log">): number => f.agent_log.filter((e) => e.kind === "fax_failed").length;

/** The hand-back that asks the person whether to send a duplicate again; resume with resubmit then sends it. */
export const DUPLICATE_REF = "duplicate";
export const askedToResubmit = (f: Pick<Filing, "agent_log">): boolean => f.agent_log.some((e) => e.kind === "resubmit");
