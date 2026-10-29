// Filling the instant plan from what a person typed at sign-up, with no model: the one line (what and where), and the
// three optional answers on the second screen (the legal business name, the owner's full name, the store address).
// Every line of every official form in the plan that those answers settle is filled, each with its source. Nothing is
// guessed: a line the answers don't settle stays empty for Odelia to ask about, and a Social Security number, ITIN or
// EIN is never written anywhere.
//
// Then the first win: one application that needs no fee and no document, whose lines are the most complete, goes up
// for approval exactly the way Odelia's request_filing_approval puts one up (src/live.ts), with the same card and the
// same check before approval. On a paper form the owner signs by hand (the IRS's Form SS-4 is faxed with a wet
// signature), a line only the owner can answer is marked "By hand": the owner writes it on the signed copy, the way
// Odelia answers line 7b of the SS-4. Placetta never prints anything in those boxes (src/forms/fill.ts).
//
// Pure functions: Root.tsx writes the result into the new workspace; the tests call them directly.
import { B, type Bi } from "../bi";
import { filingBlockers, isBlank } from "../core";
import { countyOf, stateCode } from "../counties";
import { addressProblems } from "../forms/addressCheck";
import { formById, type FormField, type OfficialForm } from "../forms/registry";
import { BY_HAND } from "../guard";
import type { Application, Approval, Field, Store, Workspace } from "../model";
import { preflight } from "../smart";
import { FURNITURE } from "../forms/furniture";
import { daysFromNow, money } from "../time";

/** What the person told us at sign-up. Everything but what and where is optional. */
export type Signup = {
  what: string;              // their own words: "Milk tea shop", "奶茶店"
  where: string;             // "Flushing, NY"
  legal?: string;            // the legal business name, as registered; empty when it isn't formed yet or wasn't given
  owner?: string;            // the owner's full name
  address?: string;          // the store's address, as typed
  brand?: string;            // the name on the sign, when they gave one
  open?: boolean;            // already open, so the reason for applying isn't a new business
  today?: string;            // YYYY-MM-DD, for tests
};
/** The store's address, read from what was typed (the city and state fall back to the one line's). */
export type Addr = { street?: string; city: string; state: string; zip?: string };
export type FirstWin = { app: string; filled: number; byHand: number; lines: number };
export type Prefilled = {
  apps: Application[];
  filled: number;                    // lines filled from the signup, every application together
  approvals: Approval[];             // the first win's approval card, when there is one
  win?: FirstWin;
  addr: Addr | null;                 // the store's address as read, for the store and Context
};

export const FROM_SIGNUP: Bi = B("From your signup", "来自您的注册信息");
export const FROM_SIGNER: Bi = B("You write it on the signed copy", "您在签字件上手写");
const HAND = "By hand";
const CJK = /[㐀-鿿豈-﫿]/;

/* --------------------------------------------------------------- the kind of business */

type Kind = { key: string; activity: string; sells: string; naics?: [string, string]; irs: string; food: boolean; prepares: boolean };
/** What it is, in the words an official form wants (in English, whatever language the line was typed in). */
const KINDS: [RegExp, Kind][] = [
  // furniture first: a "coffee table" or "bar stool" brand isn't a food business (src/forms/furniture.ts)
  [new RegExp(`^(?![\\s\\S]*(warehouse|3pl|fulfil|仓库|物流))[\\s\\S]*(?:${FURNITURE.source})`, "i"), { key: "furniture", activity: "Furniture store", sells: "Furniture", naics: ["449110", "Furniture Retailers"], irs: "Retail", food: false, prepares: false }],
  [/milk ?tea|bubble tea|boba|tea (shop|house|bar)|奶茶|茶饮|珍珠|茶/i, { key: "tea", activity: "Milk tea shop", sells: "Milk tea and other tea drinks", naics: ["722515", "Snack and Nonalcoholic Beverage Bars"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/coffee|caf[eé]|espresso|咖啡/i, { key: "coffee", activity: "Coffee shop", sells: "Coffee and espresso drinks", naics: ["722515", "Snack and Nonalcoholic Beverage Bars"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/bakery|bake|bread|pastr|cake|烘焙|面包|蛋糕/i, { key: "bakery", activity: "Bakery", sells: "Baked goods", naics: ["311811", "Retail Bakeries"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/dessert|ice cream|gelato|frozen yogurt|juice|甜品|冰淇淋|果汁/i, { key: "dessert", activity: "Dessert shop", sells: "Desserts and drinks", naics: ["722515", "Snack and Nonalcoholic Beverage Bars"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/hot ?pot|火锅/i, { key: "restaurant", activity: "Hot pot restaurant", sells: "Hot pot meals", naics: ["722511", "Full-Service Restaurants"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/restaurant|noodle|dumpling|bbq|kitchen|diner|bistro|grill|pizza|sushi|ramen|malatang|餐厅|面馆|饭店|饺子|烧烤|餐馆|麻辣烫|餐/i, { key: "restaurant", activity: "Restaurant", sells: "Prepared meals", naics: ["722511", "Full-Service Restaurants"], irs: "Accommodation & food service", food: true, prepares: true }],
  [/grocery|supermarket|market|超市|生鲜/i, { key: "grocery", activity: "Grocery store", sells: "Groceries", naics: ["445110", "Supermarkets and Other Grocery Retailers (except Convenience Retailers)"], irs: "Retail", food: true, prepares: false }],
  [/warehouse|3pl|fulfil|仓库|物流/i, { key: "warehouse", activity: "Warehouse", sells: "Warehousing and storage", naics: ["493110", "General Warehousing and Storage"], irs: "Transportation & warehousing", food: false, prepares: false }],
  [/import|e-?commerce|online|amazon|进口|电商|跨境/i, { key: "seller", activity: "Online seller", sells: "Consumer goods", irs: "Retail", food: false, prepares: false }],
];
/** The same table, for the fields that suggest a kind of business and its NAICS code as it's typed (src/suggestions.ts). */
export const BUSINESS_KINDS: readonly (readonly [RegExp, Kind])[] = KINDS;
const RETAIL: Kind = { key: "retail", activity: "Retail store", sells: "Retail goods", irs: "Retail", food: false, prepares: false };
export function kindOf(what: string): Kind {
  const k = KINDS.find(([re]) => re.test(what))?.[1] ?? RETAIL;
  // their own words when they wrote in English ("Hot pot and skewers restaurant"); the kind's words otherwise
  const own = what.trim().replace(/\s+/g, " ");
  return own && !CJK.test(own) && own.length <= 80 ? { ...k, activity: own.charAt(0).toUpperCase() + own.slice(1) } : k;
}

/* --------------------------------------------------------------- the address */

/** "136-20 Roosevelt Ave, Flushing, NY 11354", "136-20 Roosevelt Ave" or "136-20 Roosevelt Ave, Flushing" read against
 *  the one line's "Flushing, NY". An address written in Chinese characters isn't read: US forms take it in English. */
export function parseAddress(text: string | undefined, where: string): Addr | null {
  const [wCity = "", wState = ""] = where.split(",").map(s => s.trim());
  const base: Addr = { city: wCity, state: stateCode(wState) || wState.toUpperCase() };
  const t = (text ?? "").trim().replace(/\s+/g, " ").replace(/,\s*(usa|us|united states)$/i, "");
  if (!t || CJK.test(t)) return null;
  const parts = t.split(",").map(s => s.trim()).filter(Boolean);
  let zip: string | undefined, state: string | undefined, city: string | undefined;
  // the last part: "NY 11354", "New York 11354", "NY" or "11354"
  const last = parts[parts.length - 1];
  const m = /^(.*?)\s*(\d{5}(?:-\d{4})?)$/.exec(last);
  const head = m ? m[1] : last;
  if (parts.length > 1 && (stateCode(head) || (!head && m))) {
    if (m) zip = m[2];
    state = stateCode(head) || undefined;
    parts.pop();
    if (parts.length > 1) city = parts.pop();
  } else if (parts.length > 1 && !/\d/.test(last)) {
    city = parts.pop();          // "136-20 Roosevelt Ave, Flushing"
  } else if (parts.length === 1) {
    const z = /\s(\d{5}(?:-\d{4})?)$/.exec(parts[0]);   // "136-20 Roosevelt Ave 11354"
    if (z) { zip = z[1]; parts[0] = parts[0].slice(0, z.index).trim(); }
  }
  let street = parts.join(", ");
  // "136-20 Roosevelt Ave Flushing, NY 11354": the city ran into the street
  const c = city ?? base.city;
  if (!city && c && street.toLowerCase().endsWith(" " + c.toLowerCase())) street = street.slice(0, -c.length).trim();
  // a street address has a number in it; "Flushing, NY" alone is a place, not a street
  return { street: /\d/.test(street) ? street : undefined, city: city ?? base.city, state: state ?? base.state, zip };
}
const fullAddress = (a: Addr) => `${a.street}, ${a.city}, ${a.state}${a.zip ? " " + a.zip : ""}`;
const cityLine = (a: Addr) => `${a.city}, ${a.state} ${a.zip}`;

/* --------------------------------------------------------------- one line at a time */

type Ctx = { legal?: string; owner?: string; brand?: string; addr: Addr | null; state: string; county?: string; kind: Kind; llc: boolean; corp: boolean; open: boolean; today: string };
type Answer = { v: string; na?: boolean } | null;
const usDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

/** Lines no signup answer settles, whatever else they mention: numbers Placetta never keeps or doesn't have yet, and
 *  the contacts, counts, money and times nobody gave. Checked against the line's section and label together. */
const NEVER = /\b(ssn|social security|itin|f?ein|employer identification|tax id|taxpayer|d-u-n-s|duns|driver|passport|file number|entity number|account number|permit number|license number|certificate number|project number|routing|bank|phone|telephone|cell|fax|e-?mail|website|seats?|seating|birth|dob|hours|days|square f|sq\.? ?ft|floors?|employees|wages|payroll|sales|income|rent|cost|assets|amount|capacity|staff|customers)\b|#/i;
/** The lines an SS-4 asks for a Social Security number or ITIN on: only ever "By hand", never a number. */
export const SECRET_LINE = /\b(ssn|social security|itin)\b/i;
/** A line that asks for an EIN: never filled, not even "By hand" (there is none yet). A yes-or-no question about one
 *  ("Has the entity ... ever applied for and received an EIN?") asks for an answer, not the number. */
const EIN_WORDS = /\b(f?ein)\b|employer identification|federal tax id/i;
export const einLine = (label: string) => EIN_WORDS.test(label) && !/\?\s*$/.test(label.trim());

/** The SS-4, line by line: the first step of nearly every opening, so its lines are spelled out here. */
function ss4(id: string, c: Ctx, has: (id: string) => boolean): Answer {
  const a = c.addr;
  switch (id) {
    case "l1": return c.legal ? { v: c.legal } : null;
    case "l2": return c.brand ? { v: c.brand } : null;
    case "l4a": return a?.street ? { v: a.street } : null;
    case "l4b": return a?.street && a.zip ? { v: cityLine(a) } : null;
    // the street address is the mailing address on 4a, so 5a and 5b ("if different") don't apply
    case "l5a": case "l5b": return has("l4a") ? { v: "N/A", na: true } : null;
    case "l6": return c.county && c.state ? { v: `${c.county}, ${c.state}` } : null;
    case "l7a": return c.owner ? { v: c.owner } : null;
    case "l8a": return c.llc ? { v: "Yes" } : c.corp ? { v: "No" } : null;
    case "l8b": case "l8c": return c.corp ? { v: "N/A", na: true } : null;
    case "l9b": return c.llc ? { v: "N/A", na: true } : null;
    // the box checked is "Started new business"; the line beside it asks for the type (src/forms/fill.ts writes it there)
    case "l10": return c.open ? null : { v: c.kind.activity };
    case "l16": return { v: c.kind.irs };
    case "l17": return { v: c.kind.sells };
    case "sign": return c.owner ? { v: `${c.owner}, Owner` } : null;
    default: return null;   // 7b, 8b, 8c, 9a, 11, 12, 13, 15, 18 and the phone: only the owner knows
  }
}

/** The answer for one line of any other form, from its label (and its section, for what to stay away from). */
function line(f: FormField, c: Ctx): Answer {
  const l = f.label.en.toLowerCase().replace(/\s+/g, " ").trim();
  const ctx = `${f.id} ${f.line} ${f.label.en}`.toLowerCase();
  const a = c.addr, legal = c.legal, owner = c.owner;
  if (NEVER.test(ctx)) return null;
  // the date the application is made
  if (/^date$|^date of (application|request)$|^application date$/.test(l)) return { v: usDate(c.today) };
  if (/\b(date|month|year|when)\b/.test(l)) return null;
  // why: a store still opening is a new business (an open one may be a new location or a new owner, so it's left)
  if (/^reason for applying$/.test(l) && f.options) return c.open ? null : f.options.some(o => /^new business$/i.test(o)) ? { v: "New business" } : null;
  // the business's legal name, and the name on the sign
  if (/^legal name and (trade name|dba)$/.test(l)) return legal ? { v: c.brand ? `${legal} DBA ${c.brand}` : legal } : null;
  if (/^(legal name|legal name of (the )?(entity|business|organization|filing entity)|legal name of organization|entity name|llc name|limited liability company name|name of (the )?(entity|limited liability company)|importer\/business\/private party name|business entity\/owner|business entity or owner, as on the ownership documents|legal owner of establishment)\b/.test(l))
    return legal ? { v: legal } : null;
  if (/^(business owner or corporation name|owner 1 \(the person, or the company|business owner \(the person, or the company)/.test(l)) return legal && (c.llc || c.corp) ? { v: legal } : null;
  if (/business name|name of (the )?business|facility name|establishment name|name of establishment|business owner \(dba\)/.test(l)) {
    const name = c.brand || legal;
    if (!name) return null;
    if (/address/.test(l)) return a?.street ? { v: `${name}, ${fullAddress(a)}` } : null;
    return { v: name };
  }
  if (/\b(dba|trade name|assumed name|doing business as)\b/.test(l)) return c.brand ? { v: c.brand } : null;
  // the owner, by name
  if (/^(name of responsible party|applicant'?s full name|name of the person signing|owner name|owner or officers|owner or authorized name|printed name of the person signing|type or print name|organizer name and signature|organizer( \(electronic signature\))?|owner\/location manager: printed name|i _+ am the business owner)/.test(l))
    return owner ? { v: owner } : null;
  if (/name and title/.test(l)) return owner ? { v: `${owner}, Owner` } : null;
  if (/^(title|title of the person signing|officer: company position title)$/.test(l)) return owner ? { v: "Owner" } : null;
  if (/^officer: first name$/.test(l)) return owner && owner.includes(" ") ? { v: owner.split(" ")[0] } : null;
  if (/^officer: last name$/.test(l)) return owner && owner.includes(" ") ? { v: owner.split(" ").slice(1).join(" ") } : null;
  // what one store at one street address already answers
  if (/^multiple (permanent )?locations\?$/.test(l)) return { v: "No" };
  if (/^number of physical locations/.test(l)) return { v: "1" };
  if (/^home-based business\?$/.test(l)) return a?.street ? { v: "No" } : null;
  if (/^prepackaged foods only\?$/.test(l)) return c.kind.prepares ? { v: "No" } : null;
  if (/food service\?$|serv(e|es|ing) food\?$/.test(l)) return { v: c.kind.food ? "Yes" : "No" };
  // the store's address, never anyone else's (the owner's home, an agent's office, the billing address)
  if (/address|premises|location|street|house number|^city$|^state(\/province)?$|^zip( code)?$|county|country iso|city, state|city\/st\/zip/.test(l)
    && !/owner|home|residen|responsible|agent|officer|member|manager|governing|billing|previous|prior|contractor|supplier|bookkeeper|books|records|foreign|shareholder|related|organizer|registered office|statutory|landlord|process|job|lessee|applicant|each location|period|office_|office address|sign|facade|incorporat|organization|formation|jurisdiction|if (different|any|applicable)|if not the same|counties/.test(ctx)) {
    if (/country iso/.test(l)) return a ? { v: "US" } : null;
    if (/county/.test(l)) return c.county ? { v: /state/.test(l) && c.state ? `${c.county}, ${c.state}` : c.county } : null;
    if (/city, state,? (and )?zip|city\/st\/zip/.test(l)) return a?.street && a.zip ? { v: cityLine(a) } : null;
    if (/^zip( code)?$/.test(l)) return a?.street && a.zip ? { v: a.zip } : null;
    if (/^city$/.test(l)) return a?.street ? { v: a.city } : null;
    if (/^state(\/province)?$/.test(l)) return a?.street ? { v: a.state } : null;
    if (!a?.street || !/address|premises|location|street|house number/.test(l)) return null;
    if (/street address 1|^mailing address \(room|house number and street|^street address( of business)?$/.test(l)) return { v: a.street };
    return { v: fullAddress(a) };
  }
  // what it is
  if (/naics/.test(l)) {
    const n = c.kind.naics;
    if (!n) return null;
    return /what you sell/.test(l) ? { v: `${n[0]} ${n[1]}; ${c.kind.sells.toLowerCase()}` } : /6-digit|^naics code$/.test(l) ? { v: n[0] } : { v: `${n[0]} ${n[1]}` };
  }
  if (/^principal activity/.test(l) && f.options) {
    const want = c.kind.key === "warehouse" ? /wareh|transport/i : c.kind.irs === "Retail" ? /^retail/i : /food/i;
    const o = f.options.find(x => want.test(x));
    return o ? { v: o } : null;
  }
  if (/food types|types? of food/.test(l)) return c.kind.food ? { v: c.kind.sells } : null;
  if (/principal line of merchandise|products (to be )?sold|products\/services|what you sell/.test(l)) return { v: c.kind.sells };
  if (/business activities|brief business description|type of business|intended use|usage of the building|proposed use/.test(l)) return { v: c.kind.activity };
  if (/business type|type of food establishment|establishment type/.test(l) && f.options) {
    const o = f.options.find(x => (c.kind.food && /^food facility$/i.test(x)) || (c.kind.key === "bakery" && /^bakery$/i.test(x)) || (c.kind.key === "restaurant" && /^restaurant$/i.test(x)) || (c.kind.key === "grocery" && /^grocery$/i.test(x)));
    return o ? { v: o } : null;
  }
  // the kind of company, from the legal name's own ending (LLC, Inc.)
  if (/type of entity|entity type|ownership type|type of ownership|org(anization)? type|type of company|^legal entity$|taxpayer type/.test(l)) {
    if (!c.llc && !c.corp) return null;
    if (!f.options) return { v: c.llc ? "Limited liability company" : "Corporation" };
    const o = f.options.find(x => c.llc ? /\bllc\b|limited liability company/i.test(x) && !/professional|partnership/i.test(x) : /^corporation$|^for-profit corporation$/i.test(x));
    return o ? { v: o } : null;
  }
  return null;
}

/* --------------------------------------------------------------- the whole plan */

const words = (s: string | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const isUs = (f: OfficialForm) => /^[A-Z]{2,4}$/.test(f.where) && !/^(GB|FR|DE|ES|IT|NL|IE|BE|PT|AT|SE|DK|FI|PL|CZ|HU|GR|CN|HK|SG|JP|KR|AU|CA|MX|AE)$/.test(f.where);

/** Fills every line the signup settles, on every application in the plan, and picks the first win. */
export function prefill(apps: Application[], s: Signup): Prefilled {
  const today = s.today ?? daysFromNow(0);
  const legal = words(s.legal), owner = words(s.owner), brandIn = words(s.brand);
  const addr = parseAddress(s.address, s.where);
  const [wCity = "", wState = ""] = s.where.split(",").map(x => x.trim());
  const where = addr ?? { city: wCity, state: stateCode(wState) || wState.toUpperCase() };
  const county = countyOf(where.city, where.state).en;
  const ctx: Ctx = {
    legal: legal || undefined, owner: owner || undefined,
    brand: brandIn && brandIn.toLowerCase() !== legal.toLowerCase() ? brandIn : undefined,
    addr, state: where.state, county: /County|District/.test(county) ? county.replace(/,\s*[A-Z]{2}$/, "") : undefined,
    kind: kindOf(s.what), llc: /\b(l\.?l\.?c\.?|limited liability company)$/i.test(legal), corp: /\b(inc\.?|incorporated|corp\.?|corporation)$/i.test(legal),
    open: !!s.open, today,
  };
  let filled = 0;
  const out = apps.map(a => {
    const form = a.official ? formById(a.official) : undefined;
    if (!form || !a.fields.length) return a;
    const fields: Field[] = a.fields.map(x => ({ ...x }));
    const has = (id: string) => fields.some(y => y.id === id && !isBlank(y.value));
    for (const fl of fields) {
      if (!isBlank(fl.value)) continue;
      const def = form.fields.find(y => y.id === fl.id);
      if (!def) continue;
      const ans = form.id === "irs-ss4" ? ss4(fl.id, ctx, has) : line(def, ctx);
      if (!ans || isBlank(ans.v)) continue;
      // a line with printed choices takes one of them; a US agency's form takes English letters
      // (or "N/A" when the line doesn't apply: nothing is ticked on the agency's form)
      if (def.options && !ans.na && !def.options.some(o => o.toLowerCase() === ans.v.toLowerCase())) continue;
      if (isUs(form) && CJK.test(ans.v)) continue;
      // never an SSN, ITIN or EIN, whatever the line
      if (SECRET_LINE.test(def.label.en) || einLine(def.label.en)) continue;
      fl.value = ans.v; fl.from = FROM_SIGNUP;
      filled++;
    }
    return { ...a, fields };
  });
  const result: Prefilled = { apps: out, filled, approvals: [], addr };
  const won = firstWin(out, ctx, s, today);
  if (!won) return result;
  return { ...result, apps: out.map(a => (a.id === won.app.id ? won.app : a)), approvals: [won.approval], win: won.win };
}

/** The filings that come before everything else for a new business are the ones people expect first: a sales tax
 *  registration or the name on the sign. Preferred when one is as ready as the rest. */
const PREFERRED = /sales tax|sales and use tax|seller'?s permit|certificate of authority|assumed name|\bdba\b|business certificate/i;

/** The first win: an application that needs no fee and no document and waits on nothing, filled the most, put up for
 *  approval if the check before approval passes. A paper form the owner signs by hand gets "By hand" on the lines only
 *  the owner can answer (never on an EIN line: there isn't one yet); any other form must be complete from the signup. */
function firstWin(apps: Application[], c: Ctx, s: Signup, today: string): { app: Application; approval: Approval; win: FirstWin } | null {
  const scored = apps.map((a, order) => {
    const form = a.official ? formById(a.official) : undefined;
    if (!form || !a.fields.length || a.fees.some(f => f.tbd) || a.fees.reduce((t, f) => t + f.amount, 0) > 0) return null;
    if (a.checklist.some(x => x.state === "missing")) return null;   // a document to add, or a step it waits on
    const filled = a.fields.filter(f => !isBlank(f.value)).length;
    return { a, form, order, filled, score: filled / a.fields.length, preferred: PREFERRED.test(`${a.name.en} ${form.form}`) };
  }).filter((x): x is NonNullable<typeof x> => !!x)
    .sort((x, y) => Number(y.preferred) - Number(x.preferred) || y.score - x.score || x.order - y.order);
  for (const cand of scored) {
    // at least half the form from the signup: a form that's mostly "By hand" isn't filled
    if (cand.score < 0.5) continue;
    const signsByHand = (cand.form.method === "pdf_fax" || cand.form.method === "pdf_mail") && !cand.form.esign;
    let byHand = 0, stuck = false;
    const fields = cand.a.fields.map(f => {
      if (!isBlank(f.value)) return f;
      const label = cand.form.fields.find(y => y.id === f.id)?.label.en ?? f.label.en;
      if (!signsByHand || (einLine(label) && !SECRET_LINE.test(label))) { stuck = true; return f; }
      byHand++;
      return { ...f, value: HAND, from: FROM_SIGNER };
    });
    if (stuck) continue;
    const app: Application = { ...cand.a, fields, status: "ready", next: B("Ready to file. Waiting for your approval", "可以提交，等待您批准") };
    if (filingBlockers(app).empty.length || filingBlockers(app).missing.length) continue;
    if (addressProblems(cand.form.id, Object.fromEntries(fields.map(f => [f.id, f.value]))).length) continue;
    const approval = approvalFor(app, byHand);
    // the same second look Odelia's request gets, against a workspace holding just this plan
    const store: Store = { id: "store", name: { en: c.addr?.city ?? "", zh: c.addr?.city ?? "" }, address: c.addr?.street ? fullAddress(c.addr) : s.where, stage: "opening", rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: apps.map(a => a.id) };
    const w = { business: { en: c.brand ?? c.legal ?? "", zh: c.brand ?? c.legal ?? "" }, apps: apps.map(a => (a.id === app.id ? app : a)), approvals: [approval], stores: [store], deadlines: [],
      facts: c.legal ? [{ id: "f-name", group: "business", label: B("Legal name", "法定名称"), value: { en: c.legal, zh: c.legal }, source: FROM_SIGNUP }] : [], meta: { entity: c.legal } } as unknown as Workspace;
    if (preflight(w, approval, today).errors.length) continue;
    return { app, approval, win: { app: app.id, filled: fields.filter(f => !isBlank(f.value) && !BY_HAND.test(f.value)).length, byHand, lines: fields.length } };
  }
  return null;
}

/** "the seller's permit" mid-sentence; a Title Case name ("Application for Employer Identification Number (EIN)") keeps
 *  its capitals, as in src/live.ts. */
const mid = (n: string) => (/^[A-Z][a-z]/.test(n) && n.split(/\s+/).filter(w => /^[A-Z]/.test(w)).length <= 1 ? n.charAt(0).toLowerCase() + n.slice(1) : n);

/** A filled application by the name a person knows it by: "EIN application (Form SS-4)", "seller's permit". */
export function filledName(a: Pick<Application, "name" | "form">): Bi {
  const no = a.form?.en.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const num = no && /^(Form )?[A-Z]{1,5}[- ]?\d/.test(no) ? no : "";
  const acr = /\(([A-Z]{2,6})\)/.exec(a.name.en)?.[1];
  const en = acr ? `${acr} application` : mid(a.name.en);
  return B(num ? `${en} (${num})` : en, num ? `${a.name.zh}（${num}）` : a.name.zh);
}

/** The approval card, the shape Odelia's request_filing_approval puts up in an account, with what happens on approval. */
function approvalFor(a: Application, byHand: number): Approval {
  const fee = a.fees.reduce((t, f) => t + f.amount, 0);
  const site = a.source.label || a.agency.en;
  return {
    id: "ap-" + a.id, kind: "file", app: a.id, title: B(`File the ${mid(a.name.en)}`, `提交${a.name.zh}`), agency: a.agency, action: B("Approve & file", "批准并提交"),
    does: [
      B("Placetta checks it against the agency's current requirements", "快哉对照机构现行要求逐项核对"),
      B(`Placetta submits the application below to ${site} by email, fax, certified mail or the agency's site, with its attachments, and saves the confirmation`, `快哉通过邮件、传真、挂号信或机构网站向 ${site} 提交下方申请及附件，并保存回执`),
      B("If the agency asks for a CAPTCHA, an identity check, a payment or a handwritten signature, Placetta asks you to do that one step", "如机构要求验证码、身份验证、付款或手写签名，快哉会请您完成这一步"),
      ...(byHand ? [B(`When you sign, you write the ${byHand} line${byHand === 1 ? "" : "s"} marked "By hand", such as the Social Security number, on the signed copy`, `签字时，您在签字件上手写标有“By hand”的 ${byHand} 栏，例如社会安全号`)] : []),
      ...(fee ? [B(`The agency's fee (about ${money(fee, a.currency)}) is paid by you directly to the agency, through the payment link we send`, `机构费用（约 ${money(fee, a.currency)}）由您通过我们发送的付款链接直接支付给机构`)] : []),
      B("The receipt and every status change appear here", "收据和每次状态变化都会显示在这里"),
    ],
  };
}

/* --------------------------------------------------------------- time to plan */

/** Signup Start to plan on screen: started by the press that builds the workspace, read once Home shows the plan. */
const CLOCK = "placetta-first-plan-start";
let started: number | null = null;
export const firstPlanClock = {
  start() { started = Date.now(); try { sessionStorage.setItem(CLOCK, String(started)); } catch { /* storage blocked: the module keeps it */ } },
  /** The milliseconds since start, once; null when nothing was started in this browser in the last ten minutes. */
  take(): number | null {
    let t = started;
    try { const v = sessionStorage.getItem(CLOCK); if (v) t = Number(v); sessionStorage.removeItem(CLOCK); } catch { /* storage blocked */ }
    started = null;
    if (t == null || !Number.isFinite(t)) return null;
    const ms = Date.now() - t;
    return ms >= 0 && ms < 600_000 ? Math.max(1, Math.round(ms)) : null;
  },
};

/** "2 seconds", "1.4 seconds", "under a second" (and the Chinese), for the line under the plan. */
export function secondsSay(ms: number): Bi {
  if (ms < 1000) return B("under a second", "不到 1 秒");
  const s = ms < 10_000 ? Math.round(ms / 100) / 10 : Math.round(ms / 1000);
  return B(`${s} second${s === 1 ? "" : "s"}`, `${s} 秒`);
}
