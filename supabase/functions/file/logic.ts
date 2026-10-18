// The dispatcher's decisions, kept free of I/O so they can be tested: is this agency switched on, is the filing
// complete, which channel sends it, and is the owner foreign. index.ts does the sending.
import type { Dest } from "./destinations.ts";

export type Bi = { en: string; zh: string };
export type Channel = "email" | "fax" | "mail" | "portal" | "team";
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
};

export type Filing = {
  id: string; workspace_id: string; app_id: string; title: Bi; status: string; payload: Payload;
  channel: Channel | null; agent_state: string | null; agent_log: LogEntry[]; handoff_url: string | null;
  provider_ref: string | null; submit_clicked_at: string | null; attempts: number; requirements_checked: boolean;
  confirmation_number: string | null; portal_url: string | null;
  fee_estimate?: number | string | null;            // the agency fee; paid by the person, so never sent by email, fax or mail
  send_after?: string | null;                       // while agent_state is "held": when it goes, unless the person undoes it
};

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
  };
}

/** The kill switch: off unless this form id is listed in FILER_AGENCIES. */
export const killSwitchOn = (f: Filing, env: Env): boolean => !!f.payload.official && env.agencies.includes(f.payload.official.toLowerCase());

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

/** Everything that must be true before anything is sent. Empty when the filing can go. */
export function check(f: Filing, d: Dest | undefined, ctx: { docPaths: Set<string> }): Problem[] {
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
  const paperless = !!d?.portal;
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

export type Facts = { hasLogin: boolean; mailConnected: boolean };

/** The first channel that fits, in order: portal, email, fax, mail, else the team. A wet signature rules out
    every channel that would send our copy (email, fax and mail); the person signs it themselves. */
/** The filing carries an agency fee. */
export const feeDue = (f: Filing): boolean => Number(f.fee_estimate ?? 0) > 0;

export function pick(f: Filing, d: Dest | undefined, env: Env, facts: Facts): Channel {
  if (!d) return "team";
  const on = (c: Channel) => env.channels.includes(c);
  if (d.portal && (facts.hasLogin || d.noLogin) && env.portalWorker && on("portal")) return "portal";
  // An agency fee can't travel in an email, a fax or a letter from Placetta: the team takes the filing with the payment.
  if (feeDue(f)) return "team";
  if (d.signature === "wet") return signedCopy(f) && canFaxSigned(d, env) ? "fax" : "team";
  if (d.email && facts.mailConnected && on("email")) return "email";
  if (d.fax && env.fax && on("fax")) return "fax";
  if (d.mail && env.mail && on("mail")) return "mail";
  return "team";
}

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

export const CHANNEL_SAID: Record<Exclude<Channel, "team">, Bi> = {
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
