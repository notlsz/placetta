// Carry to approval: after a filing goes in, Odelia takes it the rest of the way with nobody touching it.
//
// What it copies, and from where:
//   keep going     Devin and Town don't stop at "submitted": each run ends by working out the next step until the task
//                  is done. Here every filing with an agency gets its next step each morning (the monitor's carry
//                  step, monitor/carry.ts), and on every signal in between (an agency's email, a portal check), until
//                  the license is in the owner's hands: "Your license is approved", with the PDF.
//   follow up      Instinct follows up before anyone asks. Past the agency's published time, Odelia emails the agency
//                  first; if nothing moves, she calls (saying she is an AI); each step is claimed once per filing and day,
//                  under a daily cap.
// What it never does: solve a CAPTCHA; send anything an agency didn't ask for or the owner didn't authorize (every send
// to an agency is as the business's agent under its signed packet, checked by the database when it's added and again
// when it leaves, and waits out the undo window); file an appeal without the owner's one tap; pretend an inspector can be
// met by software: someone has to be there in person.
//
// Pure: the mail's classification and its filing, what each kind of news does, whether an agency's question is
// answered from the workspace, the chase's next step, when a portal may be signed in to, the portal read's check, the
// license moment and its renewal, the appeal's route, and the inspection moves. Tested in carry_test.ts.
import { renewalCycle, nextRenewal } from "../../../src/renewal.ts";

export type Bi = { en: string; zh: string };
const B = (en: string, zh: string): Bi => ({ en, zh });

/* ------------------------------ an agency's mail: what it says ------------------------------ */

export type MailKind = "approved" | "deficiency" | "rfi" | "fee_due" | "inspection_scheduled" | "denied" | "other";
/** The order a mail is read in when it says more than one thing: a denial outranks everything, and a request outranks an
 *  approval ("approved once you provide..." is a request). */
export const KIND_ORDER: MailKind[] = ["denied", "deficiency", "rfi", "fee_due", "inspection_scheduled", "approved"];
const SIGNS: Record<Exclude<MailKind, "other">, RegExp[]> = {
  denied: [/\b(denied|denial|disapproved|not (been )?approved|cannot be approved|unable to approve|application (is |has been )?rejected|notice of (denial|refusal))\b/i, /不予批准|拒绝|驳回/],
  deficiency: [/\b(deficien(cy|t|cies)|incomplete|correction(s)? (are )?(required|needed)|missing (items?|documents?|information)|plan ?check comments|resubmit(tal)?|not complete)\b/i, /补正|不完整|缺少/],
  rfi: [/\b(request for (additional )?information|additional information (is )?(required|needed)|please (provide|submit|send|upload)|we (need|require) (the following|a copy|additional)|RFI)\b/i, /请提供|补充材料/],
  fee_due: [/\b(fees? (is |are )?(due|owed|outstanding)|amount due|balance due|invoice|payment (is )?(required|due)|pay the (fee|balance)|remit)\b/i, /应缴|缴费/],
  inspection_scheduled: [/\binspection (has been |is )?(scheduled|confirmed|booked|set)\b/i, /\byour inspection (is|will be) (on|set for)\b/i, /\binspector will (visit|arrive|be at)\b/i, /检查已预约/],
  approved: [/\b(approved|has been issued|is issued|(license|permit|certificate|registration) (has been |was )?(issued|granted)|congratulations|your (license|permit|certificate) is attached)\b/i, /已批准|已核发|已颁发/],
};

export type Classified = { kind: MailKind; confidence: number; signals: MailKind[] };
/** What an agency's mail says, in code: each kind's signs, read in the subject (stronger) and the text. A mail with no
 *  sign, or one that only half-reads, is "other": a run reads it (as data) instead of acting on a guess. */
export function classifyAgencyMail(subject: string, text: string): Classified {
  const s = String(subject ?? ""), t = String(text ?? "").slice(0, 20000);
  const hits = new Map<MailKind, number>();
  for (const k of KIND_ORDER) {
    const rs = SIGNS[k as Exclude<MailKind, "other">];
    const inSubject = rs.some((r) => r.test(s)), inText = rs.some((r) => r.test(t));
    if (inSubject || inText) hits.set(k, (inSubject ? 2 : 0) + (inText ? 1 : 0));
  }
  // "not approved" also reads as "approved": a denial's words win
  if (hits.has("denied")) hits.delete("approved");
  const signals = KIND_ORDER.filter((k) => hits.has(k));
  if (!signals.length) return { kind: "other", confidence: 0, signals };
  const kind = signals[0];
  const score = hits.get(kind)!;
  let confidence = score >= 3 ? 0.9 : score === 2 ? 0.8 : 0.65;
  // several kinds at once: the first in order, said with less certainty (an approval with a fee still due, say)
  if (signals.length > 1) confidence -= 0.1 * Math.min(2, signals.length - 1);
  return { kind, confidence: Math.round(confidence * 100) / 100, signals };
}

/** Letters and digits only, upper case: how a confirmation number is compared wherever it's printed. */
export const normKey = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** Whether a text carries this confirmation number. Short numbers (under 6) are too easily someone's phone digits. */
export function carriesNumber(text: string, confirmation: string | null | undefined): boolean {
  const k = normKey(confirmation);
  if (k.length < 6) return false;
  // compared token by token (a run of letters, digits and joiners), so "A-1234567" in the mail matches "A1234567"
  for (const tok of String(text ?? "").toUpperCase().match(/[A-Z0-9][A-Z0-9\-_/. ]{4,40}[A-Z0-9]/g) ?? []) {
    if (normKey(tok).includes(k)) return true;
  }
  return false;
}

/** A date the mail gives (ISO, US numeric or "November 12, 2026"), the first one on or after today. */
export function dateIn(text: string, today: string): string | null {
  const t = String(text ?? "");
  const out: string[] = [];
  for (const m of t.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g)) out.push(`${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  const MON = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (const m of t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? (\d{1,2}),? (20\d\d)\b/gi)) {
    const mo = MON.findIndex((x) => x.startsWith(m[1].toLowerCase().slice(0, 3))) + 1;
    if (mo > 0) out.push(`${m[3]}-${String(mo).padStart(2, "0")}-${m[2].padStart(2, "0")}`);
  }
  return out.filter((d) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(d) && d >= today).sort()[0] ?? null;
}
/** A time window the mail gives for an inspection ("between 8:00 AM and 12:00 PM", "morning"). */
export function windowIn(text: string): string | null {
  const t = String(text ?? "");
  const m = /\b(\d{1,2})(?::(\d\d))?\s*(am|pm)\s*(?:-|to|and)\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)\b/i.exec(t);
  if (m) {
    const h = (x: string, ap: string) => ((Number(x) % 12) + (/pm/i.test(ap) ? 12 : 0));
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(h(m[1], m[3]))}:${m[2] ?? "00"}-${p(h(m[4], m[6]))}:${m[5] ?? "00"}`;
  }
  if (/\bmorning\b/i.test(t)) return "morning";
  if (/\bafternoon\b/i.test(t)) return "afternoon";
  return null;
}
/** The fee the mail asks for, in dollars, when it prints one. */
export function feeIn(text: string): number | null {
  const m = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)/.exec(String(text ?? ""));
  return m ? Number(m[1].replace(/,/g, "")) : null;
}
/** What the agency asks for, one line each: the list items and the sentences that ask (at most 10). */
export function asksIn(text: string): string[] {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  const asking = /\b(provide|submit|send|upload|attach|missing|required|need(ed)?|include|copy of|proof of)\b/i;
  for (const l of lines) {
    if (/^(>|on .* wrote:|from:|sent:|to:|subject:)/i.test(l)) break;   // the quoted thread below the reply
    const item = /^(?:[-*]|\d{1,2}[.)]|[a-z][.)])\s+(.{3,300})$/i.exec(l)?.[1];
    if (item) { out.push(item.replace(/[.;]+$/, "")); continue; }
    for (const s of l.split(/(?<=[.?!])\s+/)) if (asking.test(s) && s.length <= 300 && !/\b(thank|regards|sincerely)\b/i.test(s)) out.push(s.replace(/[.;]+$/, ""));
  }
  return [...new Set(out)].slice(0, 10);
}

/* ------------------------------ an agency's mail: which filing ------------------------------ */

export type Candidate = { id: string; workspace_id: string; app_id: string; status: string; confirmation_number: string | null; domains: string[]; threads: string[] };
/** The workspace's own address: Odelia's, plus-tagged with the start of its id (odelia+w1a2b3c4d5e6@in.placetta.com).
 *  An agency the owner gave it to writes there, and its mail is matched to that workspace's filings only. */
export const workspaceAddress = (odelia: string, ws: string) => { const [l, d] = odelia.split("@"); return l && d ? `${l}+w${ws.replace(/-/g, "").slice(0, 12)}@${d}` : ""; };
/** The workspace tag a recipient carries, when it's Odelia's address plus a tag. */
export function wsTagOf(to: string[], odelia: string[]): string | null {
  for (const t of to) {
    const m = /^([^+@]+)\+w([0-9a-f]{12})@(.+)$/i.exec(String(t ?? "").trim().toLowerCase());
    if (m && odelia.includes(`${m[1]}@${m[3]}`)) return m[2];
  }
  return null;
}
export type MatchedBy = "confirmation" | "thread" | "domain";
export const OPEN = new Set(["submitted", "needs_info", "in_progress"]);
const domainOf = (addr: string) => String(addr ?? "").trim().toLowerCase().split("@")[1]?.replace(/>$/, "") ?? "";
/** An agency's own domain (or a subdomain of it) sent it. */
export const fromDomain = (from: string, domains: string[]) => { const d = domainOf(from); return !!d && domains.some((x) => d === x || d.endsWith("." + x)); };
/** A government sender: .gov or a state's .us domain, the only kind a confirmation number alone may come from. */
export const govSender = (from: string) => /(\.gov|\.mil|\.[a-z]{2}\.us)$/.test(domainOf(from));
/** The host a filing's agency writes from: its inbox's and its site's, without "www.". */
export function agencyDomains(o: { email?: string | null; portal?: string | null; urls?: (string | null | undefined)[] }): string[] {
  const out = new Set<string>();
  const add = (h: string) => { const x = h.toLowerCase().replace(/^www\./, "").replace(/\.$/, ""); if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x)) out.add(x); };
  if (o.email) add(domainOf(o.email));
  if (o.portal) add(o.portal);
  for (const u of o.urls ?? []) { try { if (u) add(new URL(u).hostname); } catch { /* not a link */ } }
  // a shared host (Accela, a form vendor) is no agency's: mail from it can't be tied to a filing by its domain alone
  return [...out].filter((d) => !/(accela\.com|govos\.com|formstack\.com|jotform\.com|gmail\.com|outlook\.com)$/.test(d));
}

/** The filing an agency's mail is about, and how that's known: the thread it answers (a message Placetta sent), the
 *  confirmation number it prints (from the agency's domain or a government sender), or the agency's own domain when only
 *  one filing is open with that agency. Two filings that both fit: none (the team sorts it out). */
export function matchFiling(m: { from: string; subject: string; text: string; inReplyTo?: string | null; references?: string[] }, cands: Candidate[]): { filing: Candidate; by: MatchedBy } | null {
  const ids = [m.inReplyTo, ...(m.references ?? [])].map((x) => String(x ?? "").replace(/^<|>$/g, "").trim()).filter(Boolean);
  // a provider's message id is the local part of the Message-ID it sends (Amazon SES: <id@region.amazonses.com>)
  const inThread = (t: string) => { const x = t.replace(/^<|>$/g, "").replace(/^mail:/, "").trim(); return x.length >= 8 && ids.some((i) => i === x || i.split("@")[0] === x); };
  const byThread = cands.filter((c) => c.threads.some(inThread));
  if (byThread.length === 1) return { filing: byThread[0], by: "thread" };
  const words = `${m.subject}\n${m.text}`;
  const byNumber = cands.filter((c) => carriesNumber(words, c.confirmation_number) && (fromDomain(m.from, c.domains) || govSender(m.from)));
  if (byNumber.length === 1) return { filing: byNumber[0], by: "confirmation" };
  if (byNumber.length > 1) return null;
  const byDomain = cands.filter((c) => OPEN.has(c.status) && fromDomain(m.from, c.domains));
  return byDomain.length === 1 ? { filing: byDomain[0], by: "domain" } : null;
}

/* ------------------------------ what each kind of news does ------------------------------ */

export type News = { kind: MailKind; confidence: number; by: MatchedBy | "portal" };
export type Act = {
  /** The filing's new status, when the news is sure enough to move it: a matched thread, number or portal read. */
  status?: "accepted" | "rejected" | "needs_info";
  /** What happens next on the filing. */
  next: "license" | "answer" | "appeal" | "fee" | "inspection" | "read" | "confirm";
  title: Bi;
};
/** Sure enough to move the filing by itself: tied by thread, number or a signed-in portal read, and read clearly. A
 *  mail tied only by its domain, or read with less certainty, goes to the team to confirm, with Odelia's reading. */
export const sure = (n: News) => n.by !== "domain" && n.confidence >= 0.8;
export function actFor(n: News, name: Bi, agency: Bi): Act {
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const ok = sure(n);
  switch (n.kind) {
    case "approved": return { ...(ok ? { status: "accepted" as const } : {}), next: ok ? "license" : "confirm", title: B(`${agency.en} approved the ${lower(name.en)}`, `${agency.zh}批准了${name.zh}`) };
    case "denied": return { ...(ok ? { status: "rejected" as const } : {}), next: ok ? "appeal" : "confirm", title: B(`${agency.en} denied the ${lower(name.en)}`, `${agency.zh}拒绝了${name.zh}`) };
    case "deficiency": return { ...(ok ? { status: "needs_info" as const } : {}), next: "answer", title: B(`${agency.en} says the ${lower(name.en)} needs corrections`, `${agency.zh}要求补正${name.zh}`) };
    case "rfi": return { ...(ok ? { status: "needs_info" as const } : {}), next: "answer", title: B(`${agency.en} asked for more on the ${lower(name.en)}`, `${agency.zh}要求补充${name.zh}的材料`) };
    case "fee_due": return { next: "fee", title: B(`${agency.en} billed a fee for the ${lower(name.en)}`, `${agency.zh}要求缴纳${name.zh}的费用`) };
    case "inspection_scheduled": return { next: "inspection", title: B(`${agency.en} scheduled an inspection for the ${lower(name.en)}`, `${agency.zh}已为${name.zh}安排检查`) };
    default: return { next: "read", title: B(`${agency.en} wrote about the ${lower(name.en)}`, `${agency.zh}来信涉及${name.zh}`) };
  }
}

/* ------------------------------ a deficiency or a request: answered from the workspace? ------------------------------ */

export type Profile = {
  business: string;
  facts: { label: Bi; value: Bi }[];
  fields: { label: Bi; value: string }[];
  docs: { id: string; name: string; tag?: Bi; path?: string; app?: string }[];
};
export type Answer = { ask: string; fact?: { label: string; value: string }; doc?: { name: string; path: string } };
/** What only a person gives, never Odelia from the workspace: a signature, a notary, an identity document or number, a
 *  bank account, or a sworn statement. */
const PERSON = /\b(sign(ed|ature)?|notar|ssn|social security|itin|passport|driver'?s? licen[cs]e|photo id|identification|date of birth|bank|routing|fingerprint|affidavit|sworn|under penalty)\b/i;
/** The documents an agency asks for, by the words it uses, and the words a stored file's name or tag carries. */
const DOC_KINDS: { ask: RegExp; doc: RegExp }[] = [
  { ask: /\blease|rental agreement|proof of occupancy\b/i, doc: /lease|rental|租约|租赁/i },
  { ask: /\b(insurance|certificate of insurance|coi|liability coverage)\b/i, doc: /insurance|coi|certificate of insurance|保险/i },
  { ask: /\b(floor ?plan|site plan|plans|drawings|layout)\b/i, doc: /floor|site plan|plans?\b|drawing|layout|平面图|图纸/i },
  { ask: /\bmenu\b/i, doc: /menu|菜单/i },
  { ask: /\b(seller'?s permit|resale)\b/i, doc: /seller|resale|销售许可/i },
  { ask: /\b(articles|certificate of (formation|organization|incorporation)|statement of information)\b/i, doc: /articles|formation|organization|incorporation|statement of info|公司章程|成立/i },
  { ask: /\b(ein|cp ?575|147c|irs letter)\b/i, doc: /ein|cp ?575|147c|irs/i },
  { ask: /\b(food (handler|manager)|servsafe|food safety certificate)\b/i, doc: /food (handler|manager)|servsafe|食品/i },
  { ask: /\b(equipment (list|schedule)|spec sheets?)\b/i, doc: /equipment|spec/i },
  { ask: /\b(hood|fire suppression|ansul)\b/i, doc: /hood|suppression|ansul|消防/i },
  { ask: /\b(zoning|certificate of occupancy|\bco\b)\b/i, doc: /zoning|occupancy|入住|分区/i },
  { ask: /\b(sign(age)? (plan|drawing)|sign permit)\b/i, doc: /sign(age)?|招牌/i },
  { ask: /\b(business license|business tax)\b/i, doc: /business (license|tax)|营业执照/i },
  { ask: /\b(health permit)\b/i, doc: /health permit|卫生许可/i },
];
const STOP = new Set(["the", "a", "an", "of", "for", "and", "or", "to", "your", "business", "number", "name", "please", "provide", "with", "in", "on", "is", "are"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

/** Each ask answered from the workspace where it holds the answer: a document whose name or tag is the kind asked for
 *  (this application's first), or a fact or a filled field whose label the ask names. What only a person can give, or
 *  what the workspace doesn't hold, is missing. */
export function answerAsks(asks: string[], p: Profile, appId?: string): { answers: Answer[]; missing: string[] } {
  const answers: Answer[] = [], missing: string[] = [];
  for (const ask of asks) {
    if (PERSON.test(ask)) { missing.push(ask); continue; }
    const kind = DOC_KINDS.find((k) => k.ask.test(ask));
    if (kind) {
      const docs = p.docs.filter((d) => d.path && (kind.doc.test(d.name) || kind.doc.test(d.tag?.en ?? "") || kind.doc.test(d.tag?.zh ?? "")));
      const doc = docs.find((d) => d.app === appId) ?? docs[0];
      if (doc) { answers.push({ ask, doc: { name: doc.name, path: doc.path! } }); continue; }
      missing.push(ask); continue;
    }
    const w = new Set(words(ask));
    const fits = (label: string) => { const l = words(label); return l.length > 0 && l.every((x) => w.has(x)); };
    const fact = p.facts.find((f) => fits(f.label.en) && f.value.en.trim());
    if (fact) { answers.push({ ask, fact: { label: fact.label.en, value: fact.value.en.trim() } }); continue; }
    const field = p.fields.find((f) => fits(f.label.en) && f.value.trim());
    if (field) { answers.push({ ask, fact: { label: field.label.en, value: field.value.trim() } }); continue; }
    missing.push(ask);
  }
  return { answers, missing };
}

export type AnswerRoute =
  | { route: "send_as_agent" }     // every ask answered, the agency wrote by email, and the agent packet covers it
  | { route: "draft_for_owner" }   // every ask answered, but no live agent packet covers it: a draft for one tap
  | { route: "resubmit" }          // the agency wants it back on its site: Odelia corrects it and puts it up again
  | { route: "ask_owner"; question: Bi };
/** How an agency's question is answered. Only the owner can give what's missing, so they get one plain question;
 *  otherwise it goes back the way it came, as their agent when the packet covers it. */
/** agencyAddress: the address to answer is the agency's own (its domain, or a government sender). A mail tied to a filing
 *  only by its thread or a printed number, from anywhere else, never gets the workspace's answers on its own: the owner
 *  sees the draft and taps (the address came from outside, so it can't be trusted with the business's facts). */
export function answerRoute(o: { missing: string[]; asks: number; authority: boolean; channel: "email" | "portal" | "other"; replyTo: string | null; agency: Bi; agencyAddress?: boolean }): AnswerRoute {
  if (o.missing.length || !o.asks) return { route: "ask_owner", question: oneQuestion(o.missing.length ? o.missing : ["what the agency's letter asks for"], o.agency) };
  if (o.channel === "portal") return { route: "resubmit" };
  if (o.channel === "email" && o.replyTo && o.authority && o.agencyAddress === true) return { route: "send_as_agent" };
  return { route: "draft_for_owner" };
}
/** One plain question for the owner about what only they can give: what the agency asks for, in its words, and how to
 *  answer (reply with the file, or the answer). One question, however many things are missing. */
export function oneQuestion(missing: string[], agency: Bi): Bi {
  const clip = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 140);
  const list = missing.slice(0, 3).map(clip);
  const more = missing.length > 3 ? missing.length - 3 : 0;
  const en = list.length === 1 ? `"${list[0]}"` : `${list.slice(0, -1).map((x) => `"${x}"`).join(", ")} and "${list[list.length - 1]}"`;
  const zh = list.map((x) => `“${x}”`).join("、");
  return B(`${agency.en} asks for ${en}${more ? ` and ${more} more` : ""}. Can you send ${list.length === 1 && !more ? "it" : "them"} to Odelia (a photo, a file or a one-line answer)? She answers the agency for you.`,
    `${agency.zh}要求提供${zh}${more ? `等另外 ${more} 项` : ""}。可以发给 Odelia 吗（照片、文件或一句话回答都行）？她会替您回复机构。`);
}
/** The reply to the agency, written from what the workspace holds: Odelia says she is an AI assistant writing for the
 *  business as its authorized agent, cites the application, and answers each ask with the fact or the attached file. */
export function answerMail(o: { business: string; agentName: string; appName: string; confirmation: string | null; subject: string; answers: Answer[] }): { subject: string; text: string; attachments: { name: string; path: string }[] } {
  const lines = o.answers.map((a, i) => `${i + 1}. ${a.ask.replace(/\s+/g, " ").trim()}: ${a.doc ? `attached (${a.doc.name})` : a.fact!.value}`);
  const subject = /^re:/i.test(o.subject.trim()) ? o.subject.trim() : `Re: ${o.subject.trim() || o.appName}`;
  return {
    subject: subject.slice(0, 200),
    text: [
      "Hello,",
      `This is Odelia, an AI assistant writing for ${o.business}, as its authorized agent through Placetta (agent of record: ${o.agentName}). This answers your message about the ${o.appName}${o.confirmation ? ` (confirmation ${o.confirmation})` : ""}.`,
      lines.join("\n"),
      "If anything else is needed, a reply to this message reaches us. Thank you.",
      `${o.business}, by Placetta as agent`,
    ].join("\n\n"),
    attachments: o.answers.filter((a) => a.doc).map((a) => a.doc!),
  };
}

/* ------------------------------ the stale chase ------------------------------ */

const dayMs = 864e5;
const days = (from: string, to: string) => Math.floor((Date.parse(to.slice(0, 10) + "T00:00:00Z") - Date.parse(from.slice(0, 10) + "T00:00:00Z")) / dayMs);
export const CHASE = { stalled: 7, callAfter: 5, again: 14 } as const;
export type ChaseLogRow = { step: "email" | "call"; day: string };
export type ChaseStep = { act: "email" | "call" | "none"; why: string; waited?: number; usual?: number };
/** The next follow-up on a filing past the agency's published time with nothing moving for a week: an email to the
 *  agency first (as the business's agent, to the agency's own inbox), then a call five days later if still nothing
 *  moved, each at most every 14 days. The caller holds the daily cap. */
export function chaseStep(o: { status: string; submitted_at: string | null | undefined; usualDays: number | null; lastMovement: string | null | undefined; today: string; log: ChaseLogRow[]; canEmail: boolean; canCall: boolean }): ChaseStep {
  if (o.status !== "submitted" || !o.submitted_at || !o.usualDays) return { act: "none", why: "not waiting on a published time" };
  const waited = days(o.submitted_at, o.today), moved = o.lastMovement && o.lastMovement > o.submitted_at ? o.lastMovement : o.submitted_at;
  const stalled = days(moved, o.today);
  if (waited <= o.usualDays) return { act: "none", why: "within the agency's published time", waited, usual: o.usualDays };
  if (stalled < CHASE.stalled) return { act: "none", why: "the agency moved it this week", waited, usual: o.usualDays };
  const last = (s: "email" | "call") => o.log.filter((r) => r.step === s).map((r) => r.day).sort().pop() ?? null;
  const email = last("email"), call = last("call");
  // something moved since the last chase: the chase starts over
  const fresh = (d: string | null) => d && d >= moved.slice(0, 10);
  if (o.canEmail && !(fresh(email) && days(email!, o.today) < CHASE.again)) return { act: "email", why: "past the published time, nothing moving", waited, usual: o.usualDays };
  if (o.canCall && (!o.canEmail || (fresh(email) && days(email!, o.today) >= CHASE.callAfter)) && !(fresh(call) && days(call!, o.today) < CHASE.again))
    return { act: "call", why: o.canEmail ? "no answer to the email" : "no agency inbox to write to", waited, usual: o.usualDays };
  return { act: "none", why: "waiting on the last follow-up", waited, usual: o.usualDays };
}
/** The status inquiry Odelia emails the agency as the business's agent. */
export function inquiryMail(o: { business: string; agentName: string; appName: string; agency: string; confirmation: string | null; submitted: string; waited: number; usual: number }): { subject: string; text: string } {
  return {
    subject: `Status of ${o.appName}${o.confirmation ? `, ${o.confirmation}` : ""} (${o.business})`.slice(0, 200),
    text: [
      `Hello ${o.agency},`,
      `This is Odelia, an AI assistant writing for ${o.business}, as its authorized agent through Placetta (agent of record: ${o.agentName}).`,
      `We submitted the ${o.appName} on ${o.submitted}${o.confirmation ? ` (confirmation ${o.confirmation})` : ""}. That was ${o.waited} days ago, and your published time is about ${o.usual} days. Could you tell us where it stands, and whether you need anything from us?`,
      "A reply to this message reaches us. Thank you.",
      `${o.business}, by Placetta as agent`,
    ].join("\n\n"),
  };
}

/* ------------------------------ signing in to a portal to read the status ------------------------------ */

export type Hours = { tz: string; open?: string; close?: string; days?: number[] };
/** Most agency portals go down for maintenance overnight and on weekends: a status check runs on weekdays 7:00 to 19:00
 *  in the agency's own time zone unless the destination says otherwise. */
export const PORTAL_HOURS = { open: "07:00", close: "19:00", days: [1, 2, 3, 4, 5] };
function local(now: Date, tz: string): { wd: number; min: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { wd, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
export function portalOpen(now: Date, h: Hours): boolean {
  const t = local(now, h.tz);
  return (h.days ?? PORTAL_HOURS.days).includes(t.wd) && t.min >= hm(h.open ?? PORTAL_HOURS.open) && t.min < hm(h.close ?? PORTAL_HOURS.close);
}
/** Whether to queue a sign-in status check for a portal filing now: it's with the agency, went in on the portal, a saved
 *  login for that portal exists (Placetta never makes one), the portal is in its hours, and the last check of this filing
 *  was at least everyHours ago. And one portal host is checked at most perHostPerHour times an hour across workspaces. */
export function portalCheckDue(o: { status: string; channel: string | null; hasLogin: boolean; now: Date; hours: Hours; lastQueued: string | null; everyHours: number; hostThisHour: number; perHostPerHour: number }): { due: boolean; why: string } {
  if (!OPEN.has(o.status)) return { due: false, why: "not with the agency" };
  if (o.channel !== "portal") return { due: false, why: "not filed on the agency's site" };
  if (!o.hasLogin) return { due: false, why: "no saved login" };
  if (!portalOpen(o.now, o.hours)) return { due: false, why: "outside the portal's hours" };
  if (o.lastQueued && o.now.getTime() - Date.parse(o.lastQueued) < o.everyHours * 3600e3) return { due: false, why: "checked recently" };
  if (o.hostThisHour >= o.perHostPerHour) return { due: false, why: "the portal's rate limit" };
  return { due: true, why: "due" };
}

export type ReadState = "received" | "in_review" | "needs_info" | "approved" | "issued" | "denied" | "unknown";
export const READ_STATES: ReadState[] = ["received", "in_review", "needs_info", "approved", "issued", "denied", "unknown"];
/** What the model reports from the agency's status page (the worker's read_status tool). */
export type StatusRead = { state: ReadState; status: string; confirmation_seen?: string | null; license_link?: string | null; license_number?: string | null; expires?: string | null; asks?: string[]; due?: string | null; fee_usd?: number | null; inspection?: string | null };
/** The read, checked in code before anything acts on it: the state must be one of the known ones; the confirmation
 *  number the model says it saw must be the filing's own (the receipt's) and on the page itself; a license link must be
 *  on the portal's own host. Not matched: nothing is decided (state unknown). */
export function checkRead(r: Partial<StatusRead> | null | undefined, o: { confirmation: string | null; pageText: string; host: string; alsoOn?: string[] }): { read: StatusRead; matched: boolean; confidence: number } {
  const state = READ_STATES.includes(r?.state as ReadState) ? (r!.state as ReadState) : "unknown";
  const k = normKey(o.confirmation);
  const matched = k.length >= 4 && normKey(r?.confirmation_seen) === k && normKey(o.pageText).includes(k);
  const hosts = [o.host, ...(o.alsoOn ?? [])].map((h) => h.toLowerCase());
  let link: string | null = null;
  try { const u = new URL(String(r?.license_link ?? "")); if (u.protocol === "https:" && hosts.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) link = u.toString(); } catch { /* no link */ }
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const read: StatusRead = {
    state: matched ? state : "unknown",
    status: String(r?.status ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    confirmation_seen: r?.confirmation_seen ? String(r.confirmation_seen).slice(0, 80) : null,
    license_link: matched ? link : null,
    license_number: r?.license_number ? String(r.license_number).replace(/[^\w\-/ ]/g, "").slice(0, 80) : null,
    expires: iso(r?.expires), due: iso(r?.due),
    asks: Array.isArray(r?.asks) ? r!.asks.map((x) => String(x).slice(0, 300)).slice(0, 10) : [],
    fee_usd: typeof r?.fee_usd === "number" && r.fee_usd >= 0 && r.fee_usd < 100000 ? r.fee_usd : null,
    inspection: iso(r?.inspection),
  };
  return { read, matched, confidence: matched ? (state === "unknown" ? 0.5 : 0.9) : 0.3 };
}
/** A portal read as news, in the same terms as an agency's mail. */
export function readNews(r: StatusRead): MailKind | null {
  switch (r.state) {
    case "approved": case "issued": return "approved";
    case "denied": return "denied";
    case "needs_info": return r.fee_usd && !(r.asks ?? []).length ? "fee_due" : "rfi";
    default: return r.inspection ? "inspection_scheduled" : null;
  }
}

/* ------------------------------ the finished license ------------------------------ */

/** The moment the license is issued: what the owner sees ("Your license is approved", the PDF one tap away) and the
 *  renewal, counted from the agency's own expiration date when it prints one, otherwise from the approval day and its
 *  published cycle. No date is made up: without either, the renewal waits for one. */
export function licenseMoment(o: { name: Bi; agency: Bi; number?: string | null; expires?: string | null; renews?: Bi | null; decided: string; today: string; pdf: boolean }): { renewal: { date: string; from: "agency" | "cycle" } | null; title: Bi; body: Bi } {
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) && !/^[A-Z][a-z]+ [A-Z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  let renewal: { date: string; from: "agency" | "cycle" } | null = null;
  if (o.expires && /^\d{4}-\d{2}-\d{2}$/.test(o.expires) && o.expires > o.today) renewal = { date: o.expires, from: "agency" };
  else {
    const c = renewalCycle(o.renews?.en);
    const d = c ? nextRenewal(o.decided.slice(0, 10), c) : null;
    if (d && d > o.today) renewal = { date: d, from: "cycle" };
  }
  const num = o.number ? ` (${o.number})` : "", numZh = o.number ? `（编号 ${o.number}）` : "";
  const when = renewal ? B(` It renews by ${renewal.date}; that's on Deadlines, and Odelia starts the renewal 60 days before.`, `续办截止 ${renewal.date}，已加入截止日期，Odelia 会提前 60 天开始续办。`) : B(" Odelia adds the renewal once the agency's date is known.", " 一旦知道机构的日期，Odelia 会加入续办。");
  return {
    renewal,
    title: B(`Your ${lower(o.name.en)} is approved`, `您的${o.name.zh}已获批准`),
    body: B(`${o.agency.en} issued it${num}.${o.pdf ? " The license is in Documents, one tap away." : " Odelia is getting the license itself from the agency."}${when.en}`,
      `${o.agency.zh}已核发${numZh}。${o.pdf ? "执照已存入“文件”，一点即可查看。" : "Odelia 正在向机构索取执照本身。"}${when.zh}`),
  };
}

/* ------------------------------ an appeal ------------------------------ */

export type AppealRoute = "draft_for_tap" | "counsel" | "past" | "read_letter";
/** Where a denial's appeal goes: drafted and put up for the owner's one tap (Placetta then sends it by the agency's own
 *  channel, as their agent where the packet covers it), counsel where the playbook advises it, the letter's own
 *  deadline when the rule isn't confirmed, or nothing to file when the last day has passed. The tap is always the
 *  owner's: an appeal is never sent on a standing authorization. */
export function appealRoute(o: { found: boolean; route: "self_serve" | "self_serve_review" | "attorney" | null; lastDay: string | null; today: string }): AppealRoute {
  if (!o.found) return "read_letter";
  if (o.lastDay && o.lastDay < o.today) return "past";
  if (o.route === "attorney") return "counsel";
  return o.lastDay ? "draft_for_tap" : "read_letter";
}

/* ------------------------------ inspections ------------------------------ */

/** email: the agency's inbox for a booking it takes by email (from the booking guide, src/inspections/booking.ts);
 *  reschedule: the owner can't make the booked time and picked others (inspection_booking reschedule). */
export type BookingLite = { id: string; store: string; inspection: string; name: Bi; agency: Bi; method: string; status: string; slot?: string; slots?: string[]; app?: string; permit?: string; confirmation?: string; deadline?: string; email?: string; reschedule?: { slots: string[]; why?: string; at: string }; audit?: { day: string } };
/** Someone has to be there: the honest line every inspection message carries. */
export const PRESENT = B("Someone from the business has to be there in person to let the inspector in and walk them through. Odelia can't stand in for that.",
  "检查当天必须有公司的人在现场接待检查员并陪同查看，Odelia 无法代替。");
/** The agency's inbox for an email booking, from what the booking guide says (its needs line names it). */
export const bookingEmail = (needs: string) => /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/.exec(needs)?.[0]?.toLowerCase() ?? null;
/** An agency's mail that confirms an inspection, onto the booking it's for: booked, with its time on Deadlines (the
 *  calendar feed and the reminders read it). The workspace back, and the booking, or null when there's no booking it fits. */
export function confirmFromMail<S extends { bookings?: unknown; deadlines?: unknown }>(state: S, o: { app?: string; agency: string; date: string; window?: string | null; confirmation?: string | null; now: string }): { state: S; booking: BookingLite } | null {
  const list = (Array.isArray(state.bookings) ? state.bookings : []) as BookingLite[];
  const open = list.filter((b) => ["requested", "with_team", "awaiting_approval", "booked", "proposed"].includes(b.status));
  const b = open.find((x) => o.app && x.app === o.app) ?? (open.filter((x) => x.agency?.en === o.agency).length === 1 ? open.find((x) => x.agency?.en === o.agency) : undefined);
  if (!b) return null;
  const window = o.window || b.slot?.split(", ")[1] || "any time";
  const dl = `insp-${b.id}-${o.date}`;
  const deadlines = ((Array.isArray(state.deadlines) ? state.deadlines : []) as { id?: string }[]).filter((d) => d?.id !== b.deadline && d?.id !== dl);
  const booking: BookingLite = { ...b, status: "booked", slot: `${o.date}, ${window}`, confirmation: o.confirmation || b.confirmation, deadline: dl, updated: o.now } as BookingLite;
  deadlines.push({ id: dl, date: o.date, kind: "milestone", title: B(`${b.name.en}, ${window}`, `${b.name.zh}，${window}`), agency: b.agency, app: b.app,
    ask: B("Run the photo self-audit", "进行照片自查"), prompt: B(`My ${b.name.en} is on ${o.date}. Check my photos against the inspector's checklist (inspection_booking mock).`, `我的${b.name.zh}在 ${o.date}。请按检查员清单核对我的照片（inspection_booking mock）。`) } as { id: string });
  return { state: { ...state, bookings: list.map((x) => (x.id === b.id ? booking : x)), deadlines }, booking };
}
/** What the owner gets once an inspection is booked: the time, who must be there, and the checklist to prepare, with the
 *  photo self-audit (they send photos, Odelia checks each against the inspector's own items). */
export function prepMessage(b: Pick<BookingLite, "name" | "agency" | "slot">, checklist: Bi[]): { title: Bi; body: Bi } {
  const items = checklist.slice(0, 8);
  const title = B(`${b.name.en} booked: ${b.slot ?? "time to be confirmed"}`, `${b.name.zh}已预约：${b.slot ?? "时间待确认"}`);
  if (!items.length) return { title, body: B(`${PRESENT.en} To prepare, ask Odelia for the inspector's checklist and send her a photo of each item; she checks them before the day.`,
    `${PRESENT.zh}准备时，可向 Odelia 索取检查员清单，并把每项拍照发给她，她会在检查前逐项核对。`) };
  return {
    title,
    body: B(`${PRESENT.en} To prepare, the inspector checks: ${items.map((x) => x.en.replace(/[.;]+$/, "")).join("; ")}${checklist.length > items.length ? `; and ${checklist.length - items.length} more` : ""}. Send Odelia a photo of each and she checks them against the checklist before the day.`,
      `${PRESENT.zh}检查员会核对：${items.map((x) => x.zh.replace(/[。；]+$/, "")).join("；")}${checklist.length > items.length ? `；另有 ${checklist.length - items.length} 项` : ""}。把每项拍照发给 Odelia，她会在检查前按清单逐项核对。`),
  };
}
/** The booking request (or the request for a new time) Odelia emails an agency that books by email, as the business's
 *  agent. */
export function bookingMail(o: { business: string; agentName: string; address: string; inspection: string; permit?: string; slots: string[]; contact?: string; reschedule?: { from: string; why?: string } }): { subject: string; text: string } {
  return {
    subject: `${o.reschedule ? "New time requested" : "Inspection request"}: ${o.inspection}, ${o.address}${o.permit ? ` (${o.permit})` : ""}`.slice(0, 200),
    text: [
      "Hello,",
      `This is Odelia, an AI assistant writing for ${o.business}, as its authorized agent through Placetta (agent of record: ${o.agentName}).`,
      o.reschedule
        ? `We have the ${o.inspection} at ${o.address}${o.permit ? `, permit ${o.permit}` : ""} booked for ${o.reschedule.from}${o.reschedule.why ? `, and ${o.reschedule.why.replace(/[.]+$/, "")}` : ", and can't be there then"}. Could we move it to one of these times, in order of preference: ${o.slots.join("; ")}?`
        : `We'd like to schedule the ${o.inspection} at ${o.address}${o.permit ? `, permit ${o.permit}` : ""}. In order of preference: ${o.slots.join("; ") || "your first opening"}.`,
      `Site contact on the day: ${o.contact || "the owner, at the number on file"}. Someone from the business will be there in person.`,
      "A reply to this message reaches us. Thank you.",
      `${o.business}, by Placetta as agent`,
    ].join("\n\n"),
  };
}
export type InspectionMove =
  | { kind: "book_email"; booking: BookingLite; to: string }
  | { kind: "reschedule_email"; booking: BookingLite; to: string }
  | { kind: "reschedule_team"; booking: BookingLite }
  | { kind: "photo_audit"; booking: BookingLite; photos: string[] };
/** The inspection moves for one workspace: an email booking or a new time the agency takes by email (sent as agent), a
 *  new time the team must ask for by phone, and photos sent since the booking that haven't been checked yet. */
export function inspectionMoves(state: { bookings?: unknown; docs?: unknown }, o: { emailFor: (b: BookingLite) => string | null; today: string }): InspectionMove[] {
  const out: InspectionMove[] = [];
  const docs = (Array.isArray(state.docs) ? state.docs : []) as { id: string; name: string; kind?: string; at?: string; app?: string; tag?: Bi }[];
  for (const b of (Array.isArray(state.bookings) ? state.bookings : []) as BookingLite[]) {
    if (!b || typeof b.id !== "string") continue;
    const to = o.emailFor(b);
    if (b.status === "with_team" && b.method === "email" && to) out.push({ kind: "book_email", booking: b, to });
    if (b.status === "booked" && b.reschedule?.slots?.length) out.push(to ? { kind: "reschedule_email", booking: b, to } : { kind: "reschedule_team", booking: b });
    if (b.status === "booked" && b.slot && b.slot.slice(0, 10) >= o.today && b.audit?.day !== o.today) {
      const since = String((b as { updated?: string }).updated ?? "");
      const photos = docs.filter((d) => (d.kind === "jpg" || d.kind === "png" || /\.(jpe?g|png|heic|webp)$/i.test(d.name)) && (d.at ?? "") > since
        && (d.app === b.app || /inspect|检查/i.test(`${d.tag?.en ?? ""} ${d.tag?.zh ?? ""} ${d.name}`))).map((d) => d.name);
      if (photos.length) out.push({ kind: "photo_audit", booking: b, photos: photos.slice(0, 20) });
    }
  }
  return out;
}
/** The run that checks the owner's photos against the inspector's checklist, item by item. */
export function photoAuditPrompt(b: BookingLite, photos: string[]): string {
  return `The owner sent ${photos.length} photo${photos.length === 1 ? "" : "s"} for the ${b.name.en} (booking ${b.id}, ${b.slot}): ${photos.join(", ")}. Run the photo self-audit: read them with review_documents, then walk the inspector's checklist with inspection_booking mock (booking_id ${b.id}), marking each item ok true or false with the photo's document_id where a photo shows it, and say plainly what a photo can't show. Turn each gap into a fix with set_plan (who fixes it, by when, before ${b.slot?.slice(0, 10)}). Tell the owner in a few lines what passed, what to fix, and that someone from the business has to be there in person on the day. Never book, move or cancel the inspection here.`;
}
