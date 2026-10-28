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
 *  password box. Placetta never creates an account for the owner; it uses only the login they saved. */
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

/** Why this page must go to the person, or null. Checked before the model sees the page. */
export function mustStop(s: PageState): Stop | null {
  let host = "";
  try { host = new URL(s.url).hostname; } catch { /* about:blank */ }
  if (s.frames.some(challengeFrame) || s.markers.some(challengeMark) || /i'?m not a robot/i.test(s.text)) {
    return { reason: "captcha", en: "The agency's site is asking for a CAPTCHA. Open the live view and complete it, then tap \"I've done it\".", zh: "机构网站要求完成验证码。请打开实时画面完成后点击“我已完成”。" };
  }
  if (makesAccount(s)) {
    return { reason: "account", en: "The agency's site wants a new account made. Placetta never creates one for you. If you have an account, save its login in Settings; if not, open the live view and create it yourself, then tap \"I've done it\".", zh: "机构网站要求新建账户。快哉从不代您创建账户。如您已有账户，请在设置中保存登录信息；如没有，请打开实时画面自行创建后点击“我已完成”。" };
  }
  if (ID_HOST.test(host) || s.frames.some((f) => /id\.me|login\.gov/i.test(f))) {
    return { reason: "identity", en: "The agency needs you to verify your identity. Open the live view and sign in, then tap \"I've done it\".", zh: "机构需要您验证身份。请打开实时画面登录后点击“我已完成”。" };
  }
  for (const c of s.controls) {
    if (/^cc-/i.test(c.autocomplete) || CARD.test(describeControl(c))) {
      return { reason: "payment", en: "The agency is asking for its fee. Open the live view and pay it yourself, then tap \"I've done it\". Placetta never types a card or bank number.", zh: "机构要求支付费用。请打开实时画面自行支付后点击“我已完成”。快哉从不输入银行卡或账户号码。" };
    }
  }
  for (const c of s.controls) {
    if (SECRET.test(describeControl(c))) {
      return { reason: "secret_number", en: "This page asks for an SSN, ITIN or passport number. Placetta never enters one. Open the live view and fill that line, then tap \"I've done it\".", zh: "此页面要求填写 SSN、ITIN 或护照号码，快哉从不填写这类号码。请打开实时画面填写后点击“我已完成”。" };
    }
    if (c.autocomplete === "one-time-code" || CODE.test(describeControl(c))) {
      return { reason: "code", en: "The agency sent a code to the owner's phone or email. Open the live view and enter it, then tap \"I've done it\".", zh: "机构向负责人的手机或邮箱发送了验证码。请打开实时画面输入后点击“我已完成”。" };
    }
  }
  return null;
}

/** After the person filled the lines a stop was for (an SSN, a code), every such line on the page has something in it,
 *  so the same page doesn't send them back again. Only for those two: a CAPTCHA is checked in the page (run.ts), and a
 *  fee, an ID check or an account page is never waved through by what's in a box. */
export function stopLinesFilled(reason: Stop["reason"], s: PageState): boolean {
  if (reason !== "secret_number" && reason !== "code") return false;
  const lines = s.controls.filter((c) => reason === "secret_number" ? SECRET.test(describeControl(c)) : c.autocomplete === "one-time-code" || CODE.test(describeControl(c)));
  return lines.length > 0 && lines.every((c) => !!c.value);
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
