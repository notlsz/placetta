import { B, type Bi } from "../bi";
import SIGN from "./filingSign.json";
import { LINES } from "./lines";

/* ------------------------------------------------------------------ *
 * Signatures under Autopilot: may Placetta place the owner's adopted
 * signature on this form, or does the owner sign it themselves?
 *
 * Two questions, each answered from a cited source and never guessed:
 *
 *   eSignOk   The agency accepts an electronic signature on this form.
 *             From the verified destination (supabase/functions/file/
 *             destinations.ts, copied into ./filingSign.json by
 *             scripts/filing-coverage.mjs): "typed" or "drawn" there means
 *             the agency's own page, cited as `source`, says it takes one.
 *             A form with no destination, or "wet" or "none", is false.
 *
 *   attest    What the signature attests to. "sworn": the form's own
 *             words (its line-by-line research in ./lines.ts, or the law
 *             cited in SWORN below) make the signer declare, certify or
 *             affirm under penalty of perjury. "plain": a cited source
 *             shows a signature with no such declaration (PLAIN below,
 *             empty until someone reads one). "unknown": neither, and
 *             Autopilot treats it as sworn.
 *
 * A declaration under penalty of perjury is the signer's own act about
 * facts they swear to. An authorization signed months earlier can't make
 * it for them, so Placetta never applies a stored signature to one: the
 * owner reviews that filing and signs it with one tap (their saved
 * signature, placed only after they tap). Only an e-signature-ok form
 * with a plain signature gets the adopted signature without a tap, and
 * a wet-signature form is always a printed packet the owner signs.
 * ------------------------------------------------------------------ */

/** f: the form's signature flag (supabase/functions/file/destinations.ts signFlag): originals in ink (wet), the owner's
 *  adopted signature, once (esign), Placetta's named agent signs (agent), or nothing to sign (none). */
type Row = { s: "none" | "typed" | "drawn" | "wet"; f?: "wet" | "esign" | "agent" | "none"; p?: string; site?: string; open?: boolean; owner?: boolean; src: string; chk: string };
const ROWS = SIGN as Record<string, Row>;
/** The signature flag for one form, or null when no verified destination says (it goes the way it did). */
export const signFlagOf = (formId: string | undefined): Row["f"] | null => (formId && Object.prototype.hasOwnProperty.call(ROWS, formId) ? ROWS[formId].f ?? null : null);

export type Attest = "sworn" | "plain" | "unknown";
export type SignRule = {
  /** The agency's own page says it takes an electronic signature on this form. Default false. */
  eSignOk: boolean;
  /** The form has a signature line at all ("none": nothing to sign; "unknown": no verified destination says). */
  signs: "none" | "esign" | "wet" | "unknown";
  attest: Attest;
  /** The page that says how the agency takes the signature, and the day Placetta checked it. */
  source?: string; checked?: string;
  /** Where the sworn or plain call comes from: the form's words, or the law. */
  attestSource?: string;
};

/** Forms whose signature the law makes a declaration under penalty of perjury, whatever the form prints. A California
 *  building permit application carries the declarations of Health and Safety Code 19825: "I hereby affirm under
 *  penalty of perjury that I am exempt from the Contractors' State License Law" (owner-builder), the workers'
 *  compensation declaration, and "I declare under penalty of perjury that I am the property owner" when an agent
 *  applies (read 2026-10-27). */
const HSC_19825 = "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=19825";
const SWORN: Record<string, string> = { "sj-building-ti": HSC_19825, "la-ladbs": HSC_19825 };
/** Forms a person read and found signed with no declaration, certification or attestation, with the page that shows
 *  it. Empty until someone does: nothing is "plain" by default. */
export const PLAIN: Record<string, string> = {};

const SWORN_WORDS = /perjury|under penalty|\b(i|we) (hereby )?(certify|declare|affirm|attest|swear)|certif(y|ies|ication)|declaration|affidavit|sworn|true and correct|true, correct and complete/i;

/** What the research on the form's own lines says about its signature, if it says anything. */
function attestOf(id: string, plain: Record<string, string>): { attest: Attest; from?: string } {
  if (plain[id]) return { attest: "plain", from: plain[id] };
  if (SWORN[id]) return { attest: "sworn", from: SWORN[id] };
  const l = LINES[id];
  if (l) {
    const words = [l.submit.evidence, l.notes, ...l.fields.map(f => f.label.en)].join(" ");
    if (SWORN_WORDS.test(words)) return { attest: "sworn", from: l.submit.source };
  }
  return { attest: "unknown" };
}

/** The signature rule for one official form. */
export function signRule(formId: string | undefined, plain: Record<string, string> = PLAIN): SignRule {
  const r = formId && Object.prototype.hasOwnProperty.call(ROWS, formId) ? ROWS[formId] : undefined;
  if (!r) return { eSignOk: false, signs: "unknown", attest: "unknown" };
  const a = attestOf(formId!, plain);
  const base = { source: r.src, checked: r.chk, ...(a.from ? { attestSource: a.from } : {}) };
  if (r.s === "none") return { eSignOk: false, signs: "none", attest: a.attest, ...base };
  if (r.s === "wet") return { eSignOk: false, signs: "wet", attest: a.attest, ...base };
  return { eSignOk: true, signs: "esign", attest: a.attest, ...base };
}

/** How the signature goes on under Autopilot: none needed, the adopted signature placed without a tap (e-signature
 *  accepted and nothing sworn), one tap by the owner on this filing (e-signature accepted but sworn, or not known),
 *  or a printed packet signed by hand (wet). "unknown": no verified destination, so Placetta doesn't send it and the
 *  business signs it however the agency asks when it sends it. */
export type SignPath = "none" | "adopted" | "tap" | "wet" | "unknown";
export function signPath(formId: string | undefined, plain: Record<string, string> = PLAIN): SignPath {
  const r = signRule(formId, plain);
  if (r.signs === "none") return "none";
  if (r.signs === "unknown") return "unknown";
  if (r.signs === "wet") return "wet";
  return r.attest === "plain" ? "adopted" : "tap";
}

export const SIGN_WHY: Record<Exclude<SignPath, "none" | "adopted" | "unknown">, Bi> = {
  tap: B("The agency takes an electronic signature, but you sign this one yourself: its signature is a declaration (under penalty of perjury, or one Placetta can't confirm isn't), and only the person declaring can make it. One tap places your saved signature after you've read it.",
    "该机构接受电子签名，但这一份需要您亲自签署：签名即声明（以伪证罪处罚为前提，或快哉无法确认不是），只有声明人本人才能作出。您阅读后点一下，即可加上您保存的签名。"),
  wet: B("The agency needs a handwritten signature. With one tap Placetta mails you the page to sign. Where the agency takes a copy, you upload a photo and Placetta faxes or emails it; where it wants the original, you post it back in the return envelope, already addressed to the agency.",
    "该机构要求手写签名。点一下，快哉就会把要签的表格寄给您。机构接受复印件的，您上传照片，由快哉传真或通过邮件提交；机构要求原件的，您用已写好机构地址的回邮信封寄回即可。"),
};

/** How the agency takes its fee on this form, from the same verified destination. */
export const paymentOf = (formId: string | undefined): string | undefined => (formId && Object.prototype.hasOwnProperty.call(ROWS, formId) ? ROWS[formId].p : undefined);
/** The agency site this form is filed on, and whether it files without the owner's own login. */
export const siteOf = (formId: string | undefined): { site?: string; open: boolean } => {
  const r = formId && Object.prototype.hasOwnProperty.call(ROWS, formId) ? ROWS[formId] : undefined;
  return { site: r?.site, open: !!r?.open };
};
/** Only the business itself may submit it (the agency says so): Odelia prepares the packet. */
export const ownerOnly = (formId: string | undefined): boolean => !!(formId && Object.prototype.hasOwnProperty.call(ROWS, formId) && ROWS[formId].owner);
