/* Field validators: plain checks, no model, that run on every line before a filing can be approved (src/smart.ts
   preflight) and that each playbook names for its inputs (src/playbooks). Each returns null when the value is fine, or
   what is wrong in both languages. Each rule says where it comes from.

     ein            two digits, a dash, seven digits, with a prefix the IRS assigns
                    (https://www.irs.gov/businesses/small-businesses-self-employed/how-eins-are-assigned-and-valid-ein-prefixes, read 2026-10-22)
     itinOnEin      nine digits written without a dash that read as an ITIN (9, then 50-65, 70-88, 90-92 or 94-99): the
                    IRS's ITIN format (https://www.irs.gov/individuals/individual-taxpayer-identification-number). An
                    ITIN is never an EIN, and Placetta never keeps one (src/guard.ts)
     premises       a line that asks where the business is can't be a P.O. box: the agency inspects the premises
                    (src/forms/address-rules, each confirmed by three official sources)
     latin          a line on a US agency's form takes English letters: Chinese characters don't print on its PDF and the
                    name must match the state registration (src/forms/readback.ts "characters")
     date           a real calendar date (February 29 only in a leap year), src/smart.ts parseDate */
import { B, type Bi } from "./bi";
import { parseDate } from "./smart";

export type Problem = { level: "error" | "warn"; note: Bi };
export type Validator = (value: string) => Problem | null;

/** The EIN prefixes the IRS lists as valid, by campus and the Internet (read 2026-10-22). */
export const EIN_PREFIXES = new Set([
  "01", "02", "03", "04", "05", "06", "10", "11", "12", "13", "14", "15", "16", "20", "21", "22", "23", "24", "25", "26", "27",
  "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48",
  "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67", "68",
  "71", "72", "73", "74", "75", "76", "77", "80", "81", "82", "83", "84", "85", "86", "87", "88", "90", "91", "92", "93", "94", "95", "98", "99",
]);
const ITIN_MIDDLE = /^9\d{2}(5\d|6[0-5]|7\d|8[0-8]|9[0-2]|9[4-9])\d{4}$/;

export const ein: Validator = (v) => {
  const s = v.trim();
  if (!/^\d{2}-?\d{7}$/.test(s)) return { level: "error", note: B("An EIN is 9 digits, written 12-3456789.", "EIN 为 9 位数字，格式如 12-3456789。") };
  if (!EIN_PREFIXES.has(s.slice(0, 2))) return { level: "error", note: B(`No EIN starts with ${s.slice(0, 2)}: the IRS doesn't assign that prefix. Check the number on the IRS letter (CP 575).`, `EIN 不会以 ${s.slice(0, 2)} 开头，IRS 不分配该前缀。请核对 IRS 信函（CP 575）上的号码。`) };
  if (!s.includes("-") && ITIN_MIDDLE.test(s)) return { level: "warn", note: B("This reads like an ITIN, not an EIN. An EIN is written 12-3456789; check the IRS letter.", "这看起来像 ITIN 而不是 EIN。EIN 写作 12-3456789，请核对 IRS 信函。") };
  return null;
};

const PO_BOX = /\bp\.?\s*o\.?\s*box\b|\bpost office box\b|\bpob\s*\d|邮政信箱/i;
/** A line that asks for where the business physically is. */
export const PREMISES_LINE = /\b(premises|physical|business location|location of (the )?business|street address|site address|store address|facility address|establishment address)\b|经营地址|营业地址|门店地址/i;
export const premises: Validator = (v) => (PO_BOX.test(v)
  ? { level: "error", note: B("A P.O. box can't be the premises: the agency inspects the place itself. Use the store's street address.", "邮政信箱不能作为经营场所：机构要实地检查。请填写门店的街道地址。") } : null);

const CJK = /[㐀-鿿豈-﫿]/;
export const latin: Validator = (v) => (CJK.test(v)
  ? { level: "error", note: B("A US agency's form takes English letters only: write this line in English (a name exactly as it's registered with the state), with no Chinese characters, not even in parentheses.", "美国机构的表格只接受英文字母：请用英文填写这一行（名称须与州登记的英文名称一致），不要包含任何中文，括号里也不行。") } : null);

export const date: Validator = (v) => {
  if (!/\d/.test(v)) return null;
  return parseDate(v) ? null : { level: "warn", note: B("Not a real calendar date. Write it as 2026-11-02.", "不是有效的日期。请写成 2026-11-02 这样的格式。") };
};

export const VALIDATORS = { ein, premises, latin, date } as const;
export type ValidatorId = keyof typeof VALIDATORS;
export const validate = (id: ValidatorId, value: string): Problem | null => (value.trim() ? VALIDATORS[id](value) : null);
