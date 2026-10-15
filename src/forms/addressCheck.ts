import { B, type Bi } from "../bi.ts";
import { ADDRESS_RULES } from "./address-rules/index.ts";
import type { AddressRule, FieldRule } from "./addressRules.ts";
import { formById } from "./registry.ts";
import { COUNTRIES } from "./world.ts";

/* Checks an address against what the agency accepts on that line of its form (src/forms/address-rules, each rule
   confirmed by three official sources). Placetta fills a form with the company's own address in the country it is
   applying in; when the line needs a kind of address the company doesn't have (a Texas street address for a registered
   agent, the store's own premises), the address is left off the form and the person is told what the agency accepts
   and how to get one. An address Placetta can't place (no country, no state) is never blocked. */

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR".split(" ");
const STATE_NAMES: Record<string, string> = { texas: "TX", california: "CA", arizona: "AZ", "new york": "NY", florida: "FL", illinois: "IL", washington: "WA", nevada: "NV", georgia: "GA", pennsylvania: "PA", "new jersey": "NJ", massachusetts: "MA", delaware: "DE", wyoming: "WY" };
const STATE_LABEL: Record<string, Bi> = { TX: B("Texas", "德州"), CA: B("California", "加州"), AZ: B("Arizona", "亚利桑那州"), NY: B("New York", "纽约州") };

/** The state a form's agency sits in: its own state code, or the state of its city or county. */
const CITY_STATE: Record<string, string> = { AUS: "TX", DAL: "TX", HOU: "TX", FTW: "TX", SAT: "TX", SF: "CA", LA: "CA", LAC: "CA", SJ: "CA", SCC: "CA", IRV: "CA", SDG: "CA", NYC: "NY", PHX: "AZ" };
export function formState(formId: string): string | undefined {
  const w = formById(formId)?.where;
  if (!w) return undefined;
  return STATES.includes(w) ? w : CITY_STATE[w];
}

/** Which country and US state an address is in, as far as its own words show. */
export function placeOfAddress(v: string): { country: "US" | "abroad" | "unknown"; state?: string; poBox: boolean } {
  const s = v.trim(), low = s.toLowerCase();
  const poBox = /\bp\.?\s*o\.?\s*box\b|\bpost office box\b|邮政信箱/i.test(s);
  const zip = s.match(/,\s*([A-Z]{2})\.?\s+\d{5}(-\d{4})?\b/) ?? s.match(/\b([A-Z]{2})\s+\d{5}(-\d{4})?\s*(,?\s*(usa|us|united states))?\s*$/i);
  let state = zip && STATES.includes(zip[1].toUpperCase()) ? zip[1].toUpperCase() : undefined;
  if (!state) for (const [n, c] of Object.entries(STATE_NAMES)) if (new RegExp(`\\b${n}\\b`).test(low) && /\d{5}/.test(s)) { state = c; break; }
  if (!state) { const end = s.match(/,\s*([A-Z]{2})\s*$/); if (end && STATES.includes(end[1])) state = end[1]; }
  if (state || /\b(usa|united states)\b/i.test(s)) return { country: "US", state, poBox };
  const abroad = COUNTRIES.some(c => c.code !== "US" && c.names.test(low)) || /[一-鿿]/.test(s) || /\b(china|prc|hong kong|taiwan|singapore|canada|japan|korea|united kingdom|germany|france)\b/i.test(s);
  return { country: abroad ? "abroad" : "unknown", poBox };
}

export type AddressCheck = { rule: FieldRule; ok: boolean; problem?: Bi; state?: string };

const IN = (st: string | undefined): Bi => (st ? STATE_LABEL[st] ?? B(st, st) : B("the state", "该州"));

/** What the agency accepts on this line, and whether this address meets it. null when the line has no rule. */
export function checkAddress(formId: string, fieldId: string, value: string): AddressCheck | null {
  const rule = ADDRESS_RULES[formId]?.fields[fieldId];
  if (!rule) return null;
  const v = (value ?? "").trim();
  if (!v || /^by hand$/i.test(v)) return { rule, ok: true };
  const at = placeOfAddress(v), st = formState(formId);
  const fail = (problem: Bi): AddressCheck => ({ rule, ok: false, problem, state: st });
  const r: AddressRule = rule.rule;
  if (r === "foreign_ok") return { rule, ok: true };
  if (at.country === "abroad") {
    if (r === "in_state_street") return fail(B(`This line needs a street address in ${IN(st).en}, not an address abroad.`, `此栏需填写${IN(st).zh}的街道地址，不能填境外地址。`));
    if (r === "local_premises") return fail(B("This line is the store's own street address, not the company's address abroad.", "此栏填写门店本身的街道地址，不能填公司的境外地址。"));
    if (r === "unconfirmed") return fail(B("Fewer than three official sources confirm this line accepts an address abroad, so Placetta uses a US address here or asks the agency first.", "确认此栏可填境外地址的官方来源不足三个，因此快哉在此填写美国地址，或先向机构确认。"));
    return fail(B("This line needs a US address, not an address abroad.", "此栏需填写美国地址，不能填境外地址。"));
  }
  if (at.poBox && (rule.poBox === "not_allowed" || r === "in_state_street" || r === "local_premises" || r === "us_street"))
    return fail(B("The agency doesn't accept a P.O. box here; it needs a street address.", "机构不接受此栏填写邮政信箱，需填写街道地址。"));
  if (r === "in_state_street" && st && at.state && at.state !== st)
    return fail(B(`This line needs a street address in ${IN(st).en}; this one is in ${at.state}.`, `此栏需填写${IN(st).zh}的街道地址；此地址位于 ${at.state}。`));
  return { rule, ok: true };
}

/** Every address line on a form that breaks its rule, for a set of values by field id. */
export function addressProblems(formId: string, values: Record<string, string>): { field: string; value: string; check: AddressCheck }[] {
  const out: { field: string; value: string; check: AddressCheck }[] = [];
  for (const [field, value] of Object.entries(values)) { const c = checkAddress(formId, field, value); if (c && !c.ok) out.push({ field, value, check: c }); }
  return out;
}

/** The rule in plain words, for a hint under the line. */
export const RULE_LABEL: Record<AddressRule, Bi> = {
  in_state_street: B("Street address in the state", "州内街道地址"),
  local_premises: B("The store's own address", "门店本身的地址"),
  us_street: B("US street address", "美国街道地址"),
  us_any: B("Any US address", "任何美国地址"),
  foreign_ok: B("An address abroad is accepted", "可填境外地址"),
  unconfirmed: B("US address (not confirmed by three sources)", "美国地址（未经三个来源确认）"),
};
