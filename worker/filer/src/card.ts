// Odelia pays an agency's fee with a single-use card (supabase/functions/_shared/issuing.ts), the way fill_login types a
// saved password: the model asks for a line by name (fill_card {selector, which}) and never sees a value. The card is
// fetched from Placetta's server at the last moment, on the agency's payment page, only for a filing with fee authority
// (the owner's Autopilot grant or their approval of this fee), and lives in the run's memory only.
//
// What keeps the card's number and security code out of everything but the agency's own field:
//   the model     the page it reads is redacted (redactDeep) and card lines read back as "(filled)" (page.ts)
//   logs, traces  every store write of the run is redacted (guardStore); a trace step names the line ("card": "number"),
//                 never its value; a typing error is replaced by a plain one
//   pictures      screenshots mask the card's lines; before the confirmation's screenshot and PDF the page's own copy of
//                 the number is blanked (scrubPage); before any hand-back the card's lines are cleared, so the owner's
//                 live view and the team's never show them
//   recordings    a browser session that is recorded (Steel records every session) never gets a card; Browserbase
//                 sessions are made with recording off while cards are on (browsers.ts)
// Pure parts here, tested in test/card.test.ts; run.ts does the browser work.
import type { Control } from "./guards.ts";
import type { Store } from "./store.ts";

export type CardPart = "number" | "exp" | "exp_month" | "exp_year" | "cvc" | "name" | "postal_code" | "address_line1" | "city" | "state";
export const CARD_PARTS: CardPart[] = ["number", "exp", "exp_month", "exp_year", "cvc", "name", "postal_code", "address_line1", "city", "state"];
export type CardDetails = {
  purchase_id: string; limit_cents: number; number: string; cvc: string; exp_month: number; exp_year: number; name: string;
  address: { line1: string; city: string; state: string; postal_code: string; country: string };
};
export type FeeDecision = { ok: true; limitCents: number } | { ok: false; why: string };
export type CardOutcome = "used" | "unused" | "unsure";

/** STRIPE_ISSUING_ON on the worker: it may type a single-use card (the server decides each one). */
export const cardsOn = (env: Record<string, string | undefined>) =>
  ["1", "on", "true"].includes((env.STRIPE_ISSUING_ON ?? "").trim().toLowerCase()) || env.STRIPE_ISSUING === "on";

const words = (c: Pick<Control, "label" | "name" | "id" | "autocomplete"> & { placeholder?: string }) =>
  `${c.label} ${c.name} ${c.id} ${c.placeholder ?? ""}`.replace(/[_-]+/g, " ").toLowerCase();

/** Is this the agency's line for that part of the card? The card's number and code go only into a line that says it
 *  takes them (by its autocomplete or its words), never into any other field, whatever the model asks. */
export function cardLineOk(part: CardPart, c: Pick<Control, "label" | "name" | "id" | "autocomplete" | "type"> & { placeholder?: string }): boolean {
  if (c.type === "password" || c.type === "hidden" || c.type === "file" || c.type === "checkbox" || c.type === "radio") return false;
  const ac = c.autocomplete.toLowerCase().replace(/^(section-\S+\s+)?(billing\s+)?/, "");
  const w = words(c);
  // the cardholder's name and billing address never go into the business's own lines (its legal name, its address)
  if (["name", "postal_code", "address_line1", "city", "state"].includes(part) && /\b(business|legal|company|dba|mailing|physical|premises|location|owner|applicant|contact)\b/.test(w)) return false;
  switch (part) {
    case "number": return ac === "cc-number" || /\b(card ?(number|no|num|#)|credit ?card|debit ?card|cc ?num(ber)?|pan)\b|cardnumber/.test(w);
    case "cvc": return ac === "cc-csc" || /\b(cvv2?|cvc2?|csc|cid|security code|card code|verification (number|value))\b/.test(w);
    case "exp": return ac === "cc-exp" || (/\b(expir\w*|exp( date)?|valid (thru|through)|mm ?\/ ?yy(yy)?)\b/.test(w) && !/\b(month|year)\b/.test(w));
    case "exp_month": return ac === "cc-exp-month" || /\b(month|mm)\b/.test(w);
    case "exp_year": return ac === "cc-exp-year" || /\b(year|yy|yyyy)\b/.test(w);
    case "name": return ac === "cc-name" || /\b(name on (the )?card|card ?holder|cardholder|holder name|billing name|payer name)\b/.test(w) || /^\s*(full )?name\s*$/.test(c.label.toLowerCase());
    case "postal_code": return ac === "postal-code" || /\b(zip|postal|post code|postcode)\b/.test(w);
    case "address_line1": return ac === "address-line1" || ac === "street-address" || /\b(address( line)?( 1)?|street)\b/.test(w);
    case "city": return ac === "address-level2" || /\b(city|town)\b/.test(w);
    case "state": return ac === "address-level1" || /\b(state|province|region)\b/.test(w);
  }
}

/** What goes in a line: the card's own value for its part. exp is MM/YY; a year line asking for two digits gets two. */
export function partValue(part: CardPart, card: CardDetails, c?: Pick<Control, "label" | "name" | "id" | "autocomplete"> & { placeholder?: string }): string {
  const mm = String(card.exp_month).padStart(2, "0");
  const yyyy = String(card.exp_year);
  const two = !!c && /\byy\b/.test(words(c)) && !/\byyyy\b/.test(words(c));
  switch (part) {
    case "number": return card.number;
    case "cvc": return card.cvc;
    case "exp": return `${mm}/${yyyy.slice(-2)}`;
    case "exp_month": return mm;
    case "exp_year": return two ? yyyy.slice(-2) : yyyy;
    case "name": return card.name;
    case "postal_code": return card.address.postal_code;
    case "address_line1": return card.address.line1;
    case "city": return card.address.city;
    case "state": return card.address.state;
  }
}

/** The ways a dropdown may write the same month or year (01, 1, January; 2029, 29). */
export function optionCandidates(part: CardPart, v: string): string[] {
  if (part === "exp_month") {
    const n = Number(v);
    const name = new Date(Date.UTC(2000, n - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return [v, String(n), name, name.slice(0, 3), `${v} - ${name}`, `${v} ${name}`];
  }
  if (part === "exp_year") return [v, v.length === 4 ? v.slice(-2) : `20${v}`];
  return [v];
}

/** The fee a payment page asks for, in cents: the largest dollar amount on a line that names a total, an amount due or a
 *  fee. Null when the page names none. */
export function pageAmount(text: string): number | null {
  let best: number | null = null;
  for (const line of text.split(/\n/)) {
    if (!/\b(total|amount( due| to pay| owed)?|balance due|fee|fees|payment)\b/i.test(line)) continue;
    for (const m of line.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/g)) {
      const cents = Number(m[1].replace(/,/g, "")) * 100 + Number(m[2] ?? 0);
      if (cents > 0 && (best === null || cents > best)) best = cents;
    }
  }
  return best;
}

// ---------------------------------------------------------------- redaction

/** The values that must never leave the agency's field: the card's number and its security code. */
export const secretsOf = (c: CardDetails) => [c.number, c.cvc].filter((s) => s && s.length >= 3);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The card's number (with or without spaces or dashes) and its code, masked in any text. */
export function redactText(s: string, secrets: string[]): string {
  let out = s;
  for (const x of secrets) {
    if (x.length >= 12) out = out.replace(new RegExp(x.split("").map(esc).join("[\\s-]?"), "g"), `•••• ${x.slice(-4)}`);
    else out = out.replace(new RegExp(`(?<![\\w])${esc(x)}(?![\\w])`, "g"), "•••");
  }
  return out;
}
/** The same, through any value: strings, arrays, plain objects (not bytes). */
export function redactDeep<T>(v: T, secrets: string[]): T {
  if (!secrets.length) return v;
  if (typeof v === "string") return redactText(v, secrets) as T;
  if (Array.isArray(v)) return v.map((x) => redactDeep(x, secrets)) as T;
  if (v && typeof v === "object" && !(v instanceof Uint8Array) && Object.getPrototypeOf(v) === Object.prototype) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactDeep(x, secrets)])) as T;
  }
  return v;
}
/** Does any text in this value still hold a secret? (tests, and a last check before a write) */
export const holdsSecret = (v: unknown, secrets: string[]): boolean => !!secrets.length && JSON.stringify(redactDeep(v, secrets)) !== JSON.stringify(v);

/** The store, with every write of a run redacted: the log, team tasks, notices, skills and taught playbooks. Files
 *  (screenshots, PDFs) pass through: their pages are masked and scrubbed before they're taken. */
const WRITES = new Set(["step", "teamTask", "notify", "saveSkill", "saveTaught", "taughtResult", "humanCheckOpen", "probeReport", "heartbeat"]);
export function guardStore(store: Store, secrets: () => string[]): Store {
  return new Proxy(store, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r);
      if (typeof v !== "function" || typeof k !== "string" || !WRITES.has(k)) return typeof v === "function" ? v.bind(t) : v;
      return (...args: unknown[]) => { const s = secrets(); return v.apply(t, s.length ? args.map((a) => redactDeep(a, s)) : args); };
    },
  });
}

/** Runs in the agency's page (page.evaluate): blanks the card from it before Placetta keeps a picture or a PDF, or a
 *  person is handed the page: any field holding the number or the code, and any text showing the number. */
export function scrubPage(secrets: string[]): void {
  const num = secrets.find((s) => s.length >= 12), code = secrets.find((s) => s.length < 12);
  const digits = (s: string) => String(s || "").replace(/[\s-]/g, "");
  for (const el of Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[]) {
    const v = digits(el.value);
    if ((num && v.includes(num)) || (code && v === code)) el.value = "";
  }
  if (!num) return;
  const re = new RegExp(num.split("").join("[\\s-]?"), "g");
  const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.textContent || "";
    if (t.replace(/[\s-]/g, "").includes(num)) n.textContent = t.replace(re, "•••• " + num.slice(-4));
  }
}
