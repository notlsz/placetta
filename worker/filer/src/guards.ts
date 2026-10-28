// Hard guards, enforced in code whatever the model says. Pure functions over the page state, so they're tested
// without a browser.
import type { Payload } from "./types.ts";

export type Control = {
  selector: string; tag: string; type: string; label: string; name: string; id: string;
  autocomplete: string; value: string; options?: string[]; checked?: boolean;
};
export type PageState = {
  url: string; title: string; headings: string[]; controls: Control[];
  buttons: { selector: string; text: string }[]; links: { selector: string; text: string; href: string }[];
  text: string; frames: string[]; markers: string[];
  /** Text on the page a person wouldn't see (tiny, transparent, same colour as its background, off-screen). */
  hidden?: string[];
};

export type Stop = { reason: "captcha" | "identity" | "payment" | "secret_number" | "code" | "account"; en: string; zh: string };

/** A page that makes a new account on the agency's site: a password typed twice, or a registration heading with a
 *  password box. Such a page goes to the owner, except while the worker makes the business's own account under its agent
 *  authority (account.ts, run.ts makeAccount); Placetta never makes a person's own identity account (ID.me, Login.gov). */
const REGISTER = /\b(create (an |your )?account|register (an |for an )?account|new (user|account) registration|sign ?up)\b/i;
export function makesAccount(s: PageState): boolean {
  const pw = s.controls.filter((c) => c.type === "password").length;
  const confirm = s.controls.some((c) => /confirm|re-?enter|repeat|verify/i.test(describeControl(c)) && c.type === "password");
  const heads = [s.title, ...s.headings].join(" ");
  // a sign-in page that also offers "Sign up" is a sign-in page
  return pw >= 2 || confirm || (pw >= 1 && REGISTER.test(heads) && !/\b(sign ?in|log ?in)\b/i.test(heads));
}

const CAPTCHA_FRAME = /recaptcha|hcaptcha|challenges\.cloudflare\.com|turnstile|arkoselabs|funcaptcha/i;
const CAPTCHA_MARK = /g-recaptcha|h-captcha|cf-turnstile|captcha/i;
const ID_HOST = /(^|\.)(id\.me|login\.gov)$/i;
const CARD = /\b(card|cvv|cvc|csc|security code|expir|routing|account number|acct|iban|bank account)\b|^cc-/i;
const SECRET = /\b(ssn|social security|itin|taxpayer identification|passport)\b/i;
const CODE = /one-time|verification code|security code sent|sms code|text message code|enter the code/i;

const describeControl = (c: Control) => `${c.label} ${c.name} ${c.id}`.trim();

/** An invisible reCAPTCHA (the Texas Comptroller's sign-in carries one) asks nothing of anyone: it's a score the page
 *  checks in the background, with no box to tick and no picture to pick. Its anchor frame says size=invisible and its
 *  marks are the badge and the hidden response field. Nothing is solved or touched either way; if the page then shows a
 *  real challenge (a visible anchor, a challenge frame, a widget), that is a CAPTCHA and goes to the person. */
const INVISIBLE_ANCHOR = /recaptcha\/(enterprise|api2)\/anchor\?[^#]*\bsize=invisible\b/i;
const INVISIBLE_MARK = /^(grecaptcha-badge|grecaptcha-logo|grecaptcha-error|g-recaptcha-response(-\d+)?|recaptcha-enterprise-script)$/i;
export const challengeFrame = (f: string) => CAPTCHA_FRAME.test(f) && !INVISIBLE_ANCHOR.test(f);
export const challengeMark = (m: string) => m.split(/\s+/).some((t) => t && CAPTCHA_MARK.test(t) && !INVISIBLE_MARK.test(t));

/** The owner's one tap for an identity check (ID.me, Login.gov): what to do, and why it's theirs. Always the person's
 *  own: Placetta never signs in as anyone. The link opens straight on the agency's page, live, on a phone. */
export const IDENTITY_MSG = {
  en: "One step only you can do: the agency asks you to prove who you are with your own ID.me or Login.gov account. It's yours because it's your personal identity, and Placetta never signs in as you. Tap Open: the agency's page opens on your phone where Odelia stopped. Sign in there, then tap Done. Odelia keeps the rest of the filing as it is and carries on by herself.",
  zh: "只有您本人能完成的一步：机构要求您用自己的 ID.me 或 Login.gov 账户证明身份。这一步属于您，因为涉及您的个人身份，快哉从不以您的身份登录。点击“打开”：机构页面会在您的手机上从 Odelia 停下的地方打开。在那里登录后点击“完成”。Odelia 会保留申请的其余部分，并自行继续办理。",
};

/** A business's EIN: 2 digits, a dash, 7 digits. An SSN or ITIN (NNN-NN-NNNN) never has this shape. */
export const einShaped = (v: string) => /^\d{2}-\d{7}$/.test(v.trim());
// SF's live line reads "Business Tax Identification Number (Social Security Number, Tax Identification Number, Federal
// Employer Identification Number)"; its approved field reads "Business Tax ID (SSN, FEIN, or TIN)".
const BIZ_LINE = /\b(f?ein|tin)\b|employer identification|business tax ?id(entification)?\b|\btax identification number/i;
const BIZ_FIELD = /\b(f?ein|employer identification|(business|federal|employer) tax ?id|tax ?id)\b/i;
const PERSON_FIELD = /\b(ssn|social security|itin|passport|individual)\b/i;
/** Names a business's own number: an EIN, a FEIN or a business tax ID (it may list an SSN beside them, as SF's does). */
const BIZ_NAMED = /\b(f?ein|employer identification|business tax ?id(entification)?)\b/i;
/** A field the approved EIN may come from: a business tax ID field. A field that names a person's number (SSN, ITIN,
 *  passport) counts only when it also names the business's (SF's "Business Tax ID (SSN, FEIN, or TIN)"); the value's
 *  shape (NN-NNNNNNN, which an SSN or ITIN never has) is what keeps a person's number out. */
const einField = (label: string) => BIZ_FIELD.test(label) && (!PERSON_FIELD.test(label) || (BIZ_NAMED.test(label) && !/passport/i.test(label)));
const approvedEins = (p?: Payload | null) => (p?.fields ?? []).filter((x) => einShaped(x.value) && einField(x.label.en)).map((x) => x.value.trim());
/** The approved EIN, when the payload has one from a business tax ID field (never a person's SSN or ITIN field). */
export function approvedEin(p?: Payload | null): string | null {
  return approvedEins(p)[0] ?? null;
}
/** An ID line that also takes a business's FEIN, EIN or TIN ("Business Tax ID (SSN, FEIN, or TIN)"), on a filing whose
 *  approved values hold an EIN from a business tax ID field: the EIN may go in it. A line that asks only for an SSN,
 *  ITIN or passport is still the person's. */
export const einLine = (c: Control, p?: Payload | null) => SECRET.test(describeControl(c)) && BIZ_LINE.test(describeControl(c)) && !/passport/i.test(describeControl(c)) && !!approvedEin(p);
/** May this value be typed into this ID line? Only the approved EIN, and only in a line that takes one. */
export const einFillOk = (c: Control, value: string, p?: Payload | null) => einLine(c, p) && einShaped(value) && approvedEins(p).includes(value.trim());

/** Why this page must go to the person, or null. Checked before the model sees the page. With the filing's payload, an
 *  ID line that takes the business's EIN (einLine) doesn't stop it. */
export function mustStop(s: PageState, p?: Payload | null): Stop | null {
  let host = "";
  try { host = new URL(s.url).hostname; } catch { /* about:blank */ }
  if (s.frames.some(challengeFrame) || s.markers.some(challengeMark) || /i'?m not a robot/i.test(s.text)) {
    return { reason: "captcha", en: "The agency's site is asking for a CAPTCHA. Open the live view and complete it, then tap \"I've done it\".", zh: "机构网站要求完成验证码。请打开实时画面完成后点击“我已完成”。" };
  }
  if (makesAccount(s)) {
    return { reason: "account", en: "The agency's site wants a new account made, and Odelia can't make this one for the business. If you have an account, save its login in Settings; if not, open the live view and create it yourself, then tap \"I've done it\".", zh: "机构网站要求新建账户，而 Odelia 无法为企业开设这个账户。如您已有账户，请在设置中保存登录信息；如没有，请打开实时画面自行创建后点击“我已完成”。" };
  }
  if (ID_HOST.test(host) || s.frames.some((f) => /id\.me|login\.gov/i.test(f))) {
    return { reason: "identity", ...IDENTITY_MSG };
  }
  for (const c of s.controls) {
    if (/^cc-/i.test(c.autocomplete) || CARD.test(describeControl(c))) {
      return { reason: "payment", en: "The agency is asking for its fee. Open the live view and pay it yourself, then tap \"I've done it\". Placetta never types your own card or bank number.", zh: "机构要求支付费用。请打开实时画面自行支付后点击“我已完成”。快哉从不输入您本人的银行卡或账户号码。" };
    }
  }
  for (const c of s.controls) {
    if (SECRET.test(describeControl(c)) && !einLine(c, p)) {
      return { reason: "secret_number", en: "This page asks for an SSN, ITIN or passport number. Placetta never enters one. Open the live view and fill that line, then tap \"I've done it\".", zh: "此页面要求填写 SSN、ITIN 或护照号码，快哉从不填写这类号码。请打开实时画面填写后点击“我已完成”。" };
    }
    if (c.autocomplete === "one-time-code" || CODE.test(describeControl(c))) {
      return { reason: "code", en: "The agency sent a code to the owner's phone or email. Open the live view and enter it, then tap \"I've done it\".", zh: "机构向负责人的手机或邮箱发送了验证码。请打开实时画面输入后点击“我已完成”。" };
    }
  }
  return null;
}

/** A payment line (a card's or a bank account's): Placetta's own single-use card may go in a card line (card.ts). */
export const paymentControl = (c: Control) => /^cc-/i.test(c.autocomplete) || CARD.test(describeControl(c));

/** What else on a payment page is the person's, once Placetta's card pays its fee: the same checks with the payment
 *  lines set aside (an SSN line, a code sent to the owner, a CAPTCHA still go to a person). */
export const stopBesidesCard = (s: PageState, p?: Payload | null): Stop | null => mustStop({ ...s, controls: s.controls.filter((c) => !paymentControl(c)) }, p);

/** After the person filled the lines a stop was for (an SSN, a code), every such line on the page has something in it,
 *  so the same page doesn't send them back again. Only for those two: a CAPTCHA is checked in the page (run.ts), and a
 *  fee, an ID check or an account page is never waved through by what's in a box. */
export function stopLinesFilled(reason: Stop["reason"], s: PageState, p?: Payload | null): boolean {
  if (reason !== "secret_number" && reason !== "code") return false;
  const lines = s.controls.filter((c) => reason === "secret_number" ? SECRET.test(describeControl(c)) && !einLine(c, p) : c.autocomplete === "one-time-code" || CODE.test(describeControl(c)));
  return lines.length > 0 && lines.every((c) => !!c.value);
}

/** A signature line or an e-sign step: always the owner's. */
const SIGN = /\b(signature|e-?sign(ature)?|sign here|signed by|electronically sign)\b/i;

/** May the Placetta team clear this page? Only when a visible CAPTCHA is all it needs a person for. Anything else on it
 *  that is the owner's (an SSN or card line, a code sent to them, an ID check, an account to make, a signature) keeps
 *  the whole page with the owner, so staff never get a page that holds the owner's numbers to fill. (run.ts staffFirst;
 *  the guide's fee page is checked there too.) */
export function staffMay(s: PageState): boolean {
  if (mustStop(s)?.reason !== "captcha") return false;
  const rest: PageState = { ...s, frames: s.frames.filter((f) => !CAPTCHA_FRAME.test(f)), markers: s.markers.filter((m) => !CAPTCHA_MARK.test(m)), text: s.text.replace(/i'?m not a robot/gi, "") };
  if (mustStop(rest)) return false;
  return !s.controls.some((c) => SIGN.test(describeControl(c))) && !s.headings.some((h) => SIGN.test(h));
}

/** The lines the team's live view covers and won't let staff type into: SSNs and other ID numbers, cards and bank
 *  accounts, codes, and the saved login (user name, email and password). The source is shared with the page itself
 *  (page.ts tagHidden runs it there), so what is tested here is exactly what is covered. */
export const STAFF_HIDDEN_SOURCE = String.raw`\b(ssn|social security|itin|taxpayer|tax ?id|tin|ein|fein|passport|driver'?s? licen[cs]e|date of birth|dob|birth ?date|card|cvv|cvc|csc|expir\w*|routing|account|acct|iban|bank|password|passcode|pin|user ?(name|id)|login|log ?in|sign ?in|e[- ]?mail|one-time|verification code)\b|^cc-`;
const STAFF_HIDDEN = new RegExp(STAFF_HIDDEN_SOURCE, "i");
export const STAFF_HIDDEN_AUTOCOMPLETE = ["username", "email", "current-password", "new-password", "one-time-code", "bday"];
export type FieldFacts = { type: string; label: string; name: string; id: string; autocomplete: string; placeholder?: string };
export function staffHides(c: FieldFacts): boolean {
  if (c.type === "password") return true;
  const ac = c.autocomplete.toLowerCase();
  if (/^cc-/.test(ac) || STAFF_HIDDEN_AUTOCOMPLETE.includes(ac)) return true;
  return STAFF_HIDDEN.test(`${c.label} ${c.name} ${c.id} ${c.placeholder ?? ""}`.replace(/[_-]+/g, " "));
}

/** A control whose value the model must never see (page.ts masks it to "(filled)"). */
export const secretControl = (c: Pick<Control, "label" | "name" | "id" | "autocomplete">) =>
  SECRET.test(`${c.label} ${c.name} ${c.id}`) || CARD.test(`${c.label} ${c.name} ${c.id}`) || /^cc-/i.test(c.autocomplete) || c.autocomplete === "one-time-code";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The payload field a value came from, or null when it isn't one of the approved values. */
export function fieldFor(value: string, p: Payload): { label: string } | null {
  const v = value.trim();
  if (!v) return null;
  const f = (p.fields ?? []).find((x) => x.value.trim() === v);
  return f ? { label: f.label.en } : null;
}

/** A select option is allowed when it equals an approved value (ignoring case and spaces). */
export function optionFor(option: string, p: Payload): { label: string } | null {
  const f = (p.fields ?? []).find((x) => x.value.trim() && norm(x.value) === norm(option));
  return f ? { label: f.label.en } : null;
}

/** A script link that runs nothing itself: "javascript:;", "javascript:void(0)", "javascript:". Agency sites built on
 *  GenTax (CDTFA's onlineservices.cdtfa.ca.gov) draw every menu link this way. Any other javascript: link is refused. */
export const inertScriptLink = (href: string) => /^\s*javascript:\s*(void\s*\(?\s*0\s*\)?)?\s*;?\s*$/i.test(href);

/** Same host as the portal, or one of its subdomains. */
export function onPortal(url: string, portalHost: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const p = portalHost.toLowerCase();
    return h === p || h.endsWith("." + p);
  } catch {
    return false;
  }
}

/** A button that would send, file, pay or sign: the final-submit guard runs first. */
export function isFinal(text: string): boolean {
  const t = norm(text);
  if (/\b(sign ?in|sign ?up|log ?in|sign ?out|log ?out|choose file|file upload|upload file|profile)\b/.test(t)) return false;
  // booking an inspection sends a request too: "Schedule", "Book", "Request inspection"
  return /\b(submit|file|pay|sign|schedule|book|request (an )?inspection)\b/.test(t);
}

/** Approved values the review page doesn't show. Empty when it matches the payload. */
export function reviewMismatch(pageText: string, p: Payload): string[] {
  const text = norm(pageText);
  return (p.fields ?? [])
    .filter((f) => f.value.trim() && !SECRET.test(f.label.en))
    .filter((f) => !text.includes(norm(f.value)))
    .map((f) => f.label.en);
}

/** A regex that finds the confirmation number in the same place next time: the words around it, the number as a group. */
export function confirmPattern(pageText: string, confirmation: string): string | null {
  const line = pageText.split(/\n/).find((l) => l.includes(confirmation));
  if (!line) return null;
  const i = line.indexOf(confirmation);
  const before = line.slice(Math.max(0, i - 40), i).trim();
  if (!before) return null;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shape = confirmation.replace(/[A-Za-z]/g, "A").replace(/\d/g, "9");
  const group = shape.split("").map((c) => (c === "A" ? "[A-Za-z]" : c === "9" ? "\\d" : esc(c))).join("");
  return `${esc(before)}\\s*(${group})`;
}
