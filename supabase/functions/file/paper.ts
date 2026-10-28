// Paper without the owner: what Placetta asks of Lob (letters) and what Lob and Telnyx (faxes) tell it back. Kept free
// of I/O so it can be tested; index.ts sends the requests and applies the events to each filing's timeline.
//
// Lob: a certified letter with return receipt to the agency (sendMail), or a signing kit to the owner (signKit in
// logic.ts): first class, held for the undo window with send_date (Lob prints nothing before it, and a letter can be
// canceled until then), with a return envelope whose window shows the agency's address when the original goes back by
// mail. Webhooks: Lob signs each event with HMAC-SHA256 over "<Lob-Signature-Timestamp>.<raw body>" in hex
// (LOB_WEBHOOK_SECRET); Telnyx with Ed25519 (TELNYX_PUBLIC_KEY), as before.
import type { Address } from "./destinations.ts";

export type Bi = { en: string; zh: string };

const lobAddress = (a: Address & { name: string }) => ({
  name: a.name.slice(0, 40), address_line1: a.line1, ...(a.line2 ? { address_line2: a.line2 } : {}), address_city: a.city, address_state: a.state, address_zip: a.zip,
  address_country: a.country ?? "US",
});

/** The Lob letter for a signing kit: to the owner, from Placetta, first class, held until sendAt. A return kit adds
    Lob's #9 return envelope (or a custom one, LOB_RETURN_ENVELOPE, such as a Business Reply envelope) and perforates the
    last page, the slip whose address shows through the envelope's window. Standard return envelopes carry no postage. */
export function kitLetter(o: {
  filingId: string; official: string; to: Address & { name: string }; from: Record<string, string>; file: string; pages: number; sendAt: string;
  returnKit: boolean; returnEnvelope?: string;
}): Record<string, unknown> {
  return {
    description: `Placetta signing kit ${o.official} ${o.filingId}`.slice(0, 255),
    to: lobAddress(o.to), from: o.from, file: o.file, color: false, double_sided: false,
    mail_type: "usps_first_class", use_type: "operational", address_placement: "insert_blank_page", send_date: o.sendAt,
    metadata: { filing: o.filingId, purpose: "sign_kit" },
    ...(o.returnKit ? { return_envelope: o.returnEnvelope?.trim() || true, perforated_page: Math.max(1, o.pages) } : {}),
  };
}

/** The certified letter to the agency: certified with return receipt, held until sendAt when there is one. */
export function agencyLetter(o: { filingId: string; official: string; to: Address & { name: string }; from: Record<string, string>; file: string; sendAt?: string }): Record<string, unknown> {
  return {
    description: `Placetta ${o.official} ${o.filingId}`.slice(0, 255), to: lobAddress(o.to), from: o.from, file: o.file, color: false,
    extra_service: "certified_return_receipt", use_type: "operational", address_placement: "insert_blank_page", metadata: { filing: o.filingId, purpose: "filing" },
    ...(o.sendAt ? { send_date: o.sendAt } : {}),
  };
}

/** When a held kit is printed: the undo window from now, at least five minutes so a cancel always lands first. */
export const kitSendAt = (nowMs: number, holdMinutes: number): string => new Date(nowMs + Math.max(5, holdMinutes) * 60_000).toISOString();

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** A Lob webhook is Lob's: the signature is the hex HMAC-SHA256 of "<timestamp>.<raw body>" with the webhook's secret,
    and the timestamp is within five minutes (Lob sends milliseconds or seconds; both are read). */
export async function lobSigned(secret: string, ts: string, raw: string, sig: string, nowMs = Date.now()): Promise<boolean> {
  if (secret.length < 8 || !ts || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const n = Number(ts);
  const at = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(ts);
  if (!Number.isFinite(at) || Math.abs(nowMs - at) > 5 * 60_000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`));
  return sameText(hex(mac), sig.toLowerCase());
}

/** What a Lob letter event means on the timeline. done: the agency has it (a certified delivery), or the owner's signed
    envelope is on its way to the agency (the return envelope's first scan); returned: it came back undelivered;
    issue: USPS reported a problem; canceled: the letter was canceled before printing. Null for an event the timeline
    doesn't show (created, rendered). */
export type MailEvent = { letter: string; event: string; type: string; done?: "delivered" | "posted_back"; problem?: "returned" | "issue"; canceled?: boolean; en: string; zh: string };
const STEP: Record<string, Bi> = {
  mailed: { en: "handed to USPS", zh: "已交给美国邮政" },
  in_transit: { en: "in transit", zh: "运送中" },
  in_local_area: { en: "in the destination's local area", zh: "已到达目的地附近" },
  processed_for_delivery: { en: "out for delivery", zh: "正在派送" },
  "re-routed": { en: "re-routed by USPS", zh: "美国邮政已改道" },
  returned_to_sender: { en: "returned to sender", zh: "已退回寄件人" },
  delivered: { en: "delivered", zh: "已送达" },
  pickup_available: { en: "waiting for pickup at the post office", zh: "在邮局等待领取" },
  issue: { en: "USPS reported a problem", zh: "美国邮政报告了问题" },
};
export function lobEvent(ev: Record<string, unknown>, purpose: "filing" | "sign_kit"): MailEvent | null {
  const type = String((ev.event_type as { id?: string } | undefined)?.id ?? "");
  const body = (ev.body ?? {}) as Record<string, unknown>;
  const letter = String(body.id ?? ev.reference_id ?? "");
  const event = String(ev.id ?? "");
  const m = /^letter\.(?:(certified|return_envelope)\.)?([a-z_-]+)$/.exec(type);
  if (!m || !/^ltr_[A-Za-z0-9]+$/.test(letter) || !event) return null;
  const [, kind, what] = m;
  if (what === "deleted") return { letter, event, type, canceled: true, en: "The letter was canceled before it was printed.", zh: "信件在打印前已取消。" };
  const s = STEP[what];
  if (!s) return null;
  if (kind === "return_envelope") {
    // the owner's signed form, in the return envelope addressed to the agency
    if (purpose !== "sign_kit") return null;
    const first = what === "in_transit" || what === "in_local_area" || what === "processed_for_delivery";
    return { letter, event, type, ...(first ? { done: "posted_back" as const } : {}), ...(what === "returned_to_sender" ? { problem: "returned" as const } : {}),
      en: `Your signed form, in the return envelope to the agency: ${s.en}.`, zh: `您签好的表格（寄往机构的回邮信封）：${s.zh}。` };
  }
  const whose = purpose === "sign_kit" ? { en: "The page to sign, on its way to you", zh: "寄给您签字的表格" } : { en: "Certified mail to the agency", zh: "寄往机构的挂号信" };
  return {
    letter, event, type,
    ...(purpose === "filing" && kind === "certified" && what === "delivered" ? { done: "delivered" as const } : {}),
    ...(what === "returned_to_sender" ? { problem: "returned" as const } : what === "issue" ? { problem: "issue" as const } : {}),
    en: `${whose.en}: ${s.en}.`, zh: `${whose.zh}：${s.zh}。`,
  };
}

/** What a Telnyx fax event means on the timeline: the two that settle it (delivered, failed), or a step on the way. */
export function faxEvent(type: string): { settle?: "delivered" | "failed"; en: string; zh: string } | null {
  switch (type) {
    case "fax.delivered": return { settle: "delivered", en: "Fax delivered", zh: "传真已送达" };
    case "fax.failed": return { settle: "failed", en: "Fax failed", zh: "传真失败" };
    case "fax.queued": return { en: "Fax queued with the fax service", zh: "传真已进入发送队列" };
    case "fax.media.processed": return { en: "Fax: the form was prepared for sending", zh: "传真：表格已准备好发送" };
    case "fax.sending.started": return { en: "Fax: dialing the agency", zh: "传真：正在拨号至机构" };
    default: return null;
  }
}
