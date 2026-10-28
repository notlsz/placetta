// "Odelia gets the login": making the business's own account on an agency's site, under its agent authority, the way
// Instinct and Town make accounts for their users with an inbox they hold, and the way 1Password and Browserbase keep
// credentials: the worker makes a strong password, saves it in the vault before the agency's form is sent, and types it
// with fill_login; the model never sees it, and it's never logged.
//
// The flow (run.ts makeAccount): the site's account kind (supabase/functions/file/accounts.ts) decides first: a person's
// ID.me or Login.gov identity is handed back with a plain explanation, an unknown site goes to the Placetta team; a
// business account is made with the business's inbox at Placetta (odelia+<token>@in.placetta.com) as its email and
// only the approved values from the business's profile. A terms box is ticked only when the agent authority covers it
// (filer_account_terms records the page and the time). A CAPTCHA goes to the Placetta team as always. The agency's
// verification link or code is read from the inbox (store.waitForMail); a code sent to a phone goes to the owner as one
// tap: forward the text to Odelia, or type it in the live view. Then the login is marked saved, and the filing carries on.
// Pure helpers here; run.ts drives the pages.
import { randomInt } from "node:crypto";
import { makesAccount, type Control, type PageState } from "./guards.ts";
import type { Bi, Payload } from "./types.ts";

/** A password for an account Odelia makes: 20 characters from upper and lower case letters, digits and a few symbols
 *  every agency site takes, at least two of each kind, from the system's secure random source. */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ", LOWER = "abcdefghijkmnopqrstuvwxyz", DIGIT = "23456789", SYMBOL = "!#%+-=?@_";
export function newPassword(length = 20): string {
  if (length < 16 || length > 64) throw new Error("password length");
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(UPPER), pick(LOWER), pick(LOWER), pick(DIGIT), pick(DIGIT), pick(SYMBOL), pick(SYMBOL)];
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

const describe = (c: Pick<Control, "label" | "name" | "id">) => `${c.label} ${c.name} ${c.id}`.replace(/[_-]+/g, " ");

/** A box that accepts the site's terms (terms of use, user agreement, conditions, "I agree"). */
const TERMS = /\b(terms|conditions|user agreement|terms of (use|service)|eula|i agree|i accept|agree to|accept the|acknowledg(e|ment) .*polic|privacy policy)\b/i;
export const termsControl = (c: Pick<Control, "type" | "label" | "name" | "id">) => (c.type === "checkbox" || c.type === "radio") && TERMS.test(describe(c));

/** A box for the account's email (and its "confirm email" twin): only ever the business's inbox, typed with fill_login. */
export const emailControl = (c: Pick<Control, "type" | "label" | "name" | "id" | "autocomplete">) =>
  c.type === "email" || c.autocomplete === "email" || c.autocomplete === "username" || /\b(e[- ]?mail|user ?name|user ?id|login ?id)\b/i.test(describe(c));

/** The account's pages: a registration form, its terms, its verification ("check your email", "enter the code"), or a
 *  security question. A send button is pressed while making the account only on one of these. */
const ACCOUNT_HEADS = /\b(create (an |your )?account|register|registration|sign ?up|new (user|account)|user (profile|information)|account (information|details|setup|set ?up)|verify|verification|confirm (your )?(email|account)|activate|terms|user agreement|security questions?|set (up )?(your )?password|choose (a )?password)\b/i;
export function accountPage(s: PageState): boolean {
  if (makesAccount(s)) return true;
  return ACCOUNT_HEADS.test([s.title, ...s.headings].join(" "));
}

/** The page says the account is made and waits on the agency's email ("check your email", "we sent a link"). */
export const asksForEmail = (s: PageState) => /\b(check your (e-?mail|inbox)|(we|we've|we have) (sent|e-?mailed)|verification (e-?mail|link)|activation (e-?mail|link)|confirm(ation)? (e-?mail|link)|link (has been|was) sent)\b/i.test(`${s.headings.join(" ")}\n${s.text}`);
/** The page says the code went to a phone (a text or a call), so it's the owner's. */
export const codeToPhone = (s: PageState) => /\b(text(ed)? (message|you)|sms|sent to (your|the) (phone|mobile|cell)|phone number ending|call(ed)? you|via text)\b/i.test(`${s.headings.join(" ")}\n${s.text}`);
/** The page's box for a code. */
export const codeControl = (c: Pick<Control, "label" | "name" | "id" | "autocomplete" | "type">) =>
  c.autocomplete === "one-time-code" || (c.type !== "password" && /\b(code|passcode|pin|otp|one-time)\b/i.test(describe(c)) && !/\b(zip|postal|area|country|naics|promo)\b/i.test(describe(c)));

/** The business profile's approved values: names, addresses, phone, contact, title, entity type and activity. Not a
 *  number that identifies a person (those stay the owner's), and not an email (the account's email is the inbox). */
const PROFILE = /\b(legal|business|company|entity|dba|trade|doing business|name|address|street|city|state|zip|postal|county|country|phone|telephone|mobile|contact|owner|officer|manager|member|principal|title|position|role|first|last|middle|structure|type|activity|naics|industry|website|mailing|location)\b/i;
const NOT_PROFILE = /\b(ssn|social security|itin|passport|driver|licen[cs]e number|date of birth|dob|birth|card|bank|routing|account number|password|e[- ]?mail)\b/i;
export function profileValue(value: string, p: Payload): { label: string } | null {
  const v = value.trim();
  if (!v) return null;
  const f = (p.fields ?? []).find((x) => x.value.trim() === v && PROFILE.test(`${x.id ?? ""} ${x.label.en}`.replace(/[_-]+/g, " ")) && !NOT_PROFILE.test(`${x.id ?? ""} ${x.label.en}`.replace(/[_-]+/g, " ")));
  return f ? { label: f.label.en } : null;
}

/** What the model reads while it makes the account. No password, no inbox content. */
export function accountNote(email: string, host: string): string {
  return [
    `You are making the business's own account on ${host} for this filing, as its agent. Its email is ${email}, the business's inbox at Placetta.`,
    "Use fill_login with which=username for every email, user name or confirm-email box, and fill_login with which=password for every password and confirm-password box. You never see either value.",
    "Fill everything else only with the approved values (the business's name, address, phone, contact and title). Never type an email, an SSN, a card or a date of birth.",
    "Tick a terms-of-use box with check; it is recorded and refused when the business's authority doesn't cover it.",
    "When the site says it sent an email or a code, call account with status verify. When the site shows the account is made, or you are signed in, call account with status created. For security questions, or anything personal to the owner, call need_person.",
  ].join("\n");
}

/** What the owner and the team read when the account can't be made by Odelia. */
export const ACCOUNT_MSG = {
  identity: { en: "This agency's site signs in with a person's own identity (ID.me or Login.gov), so only you can make that account: Placetta never makes or uses one in your name. Make it once, save the login in Settings, and Odelia files from then on.",
    zh: "该机构网站要用个人身份（ID.me 或 Login.gov）登录，只有您本人可以开设：快哉从不以您的名义开设或使用这类账户。请开设一次，并在“设置”中保存登录信息，之后由 Odelia 办理。" },
  authority: { en: "This agency's site needs an account, and making one for the business needs Placetta to be your agent (Settings, Placetta as your agent). Odelia tries another way the agency takes meanwhile.",
    zh: "该机构网站需要账户，而为企业开设账户需要您签署“快哉作为您的代理人”（设置中）。在此期间，Odelia 会改用机构接受的其他方式。" },
  unknown: { en: "This agency's site needs an account, and the Placetta team is checking whether Odelia may make it for the business. Odelia tries another way the agency takes meanwhile.",
    zh: "该机构网站需要账户，快哉团队正在确认 Odelia 能否为企业开设。在此期间，Odelia 会改用机构接受的其他方式。" },
  noMail: { en: "Odelia made the business's account, but the agency's verification email didn't come. The Placetta team looks at it, and Odelia tries another way the agency takes meanwhile.",
    zh: "Odelia 已为企业开设账户，但机构的验证邮件没有到达。快哉团队会查看，在此期间 Odelia 会改用机构接受的其他方式。" },
  terms: { en: "The agency's site asks you to accept its terms of use for the new account, and your agent authorization doesn't cover that. Open the live view, tick the box if you agree, then tap \"I've done it\".",
    zh: "机构网站要求您为新账户接受其使用条款，而您的代理授权不包括这一项。请打开实时画面，如同意请勾选，然后点击“我已完成”。" },
} satisfies Record<string, Bi>;

/** The agency sent a code to the owner's phone: one tap to forward it, or type it in the live view. */
export function phoneCodeMsg(odeliaNumber?: string): Bi {
  const n = (odeliaNumber ?? "").trim();
  return n
    ? { en: `The agency texted a code to your phone for the business's new account. Forward that text to Odelia at ${n} (one tap), or open the live view and type it, and Odelia carries on.`,
        zh: `机构为企业的新账户向您的手机发送了验证码。将该短信转发给 Odelia（${n}），只需一点；或打开实时画面输入，Odelia 即可继续。` }
    : { en: "The agency sent a code to your phone for the business's new account. Open the live view and type it, then Odelia carries on.",
        zh: "机构为企业的新账户向您的手机发送了验证码。请打开实时画面输入，Odelia 即可继续。" };
}
