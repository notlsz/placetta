/* How a playbook fills a form before it asks anyone (src/live.ts follow_playbook): the lines the business profile
   already answers, and the person's answers matched to the right line however the label was written back. */

type Fact = { label: { en: string }; value: { en: string } };
type Kind = "email" | "phone" | "date" | "address" | "ein" | "text";

/** What kind of value a form line takes, from its label. */
export function kindOf(label: string): Kind {
  const l = label.toLowerCase();
  if (/e-?mail/.test(l)) return "email";
  if (/phone|telephone|\btel\b|mobile|fax/.test(l)) return "phone";
  if (/\bein\b|\bfein\b|employer identification|federal tax id|\btax id/.test(l)) return "ein";
  if (/\bdate\b|\bwhen\b|start(ed)?\b.*\bbusiness|opening/.test(l)) return "date";
  if (/address|street|location of|premises/.test(l)) return "address";
  return "text";
}
/** The kind of value a fact holds, from its label and value. */
function factKind(f: Fact): Kind {
  const k = kindOf(f.label.en);
  if (k !== "text") return k;
  if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.value.en.trim())) return "email";
  return "text";
}

/* Which fact answers a line: the same subject on both sides, and the same kind of value. */
const SUBJECTS: { line: RegExp; fact: RegExp }[] = [
  { line: /legal (business |entity |company )?name|name of (the )?(entity|company|business|llc|corporation)|registered name|exact name/i, fact: /legal (business |entity )?name|registered name/i },
  { line: /trade name|dba|doing business as|assumed name|fictitious name/i, fact: /trade name|dba|doing business as|brand/i },
  { line: /\bein\b|\bfein\b|employer identification|federal tax id/i, fact: /\bein\b|employer identification/i },
  { line: /owner|responsible (party|person)|principal|managing member|officer|member name|contact person|applicant name|print(ed)? name/i, fact: /^owner|responsible|principal|managing member|officer|contact person/i },
  { line: /owner.*e-?mail|e-?mail|contact e-?mail/i, fact: /e-?mail/i },
  { line: /phone|telephone/i, fact: /phone|telephone/i },
  { line: /entity type|type of (entity|organization|business entity)|legal structure|business structure|form of (business|organization)/i, fact: /^entity|legal structure|company type|business structure/i },
  { line: /state (of|where) (formation|organization|incorporation)|formed in|jurisdiction of (formation|organization)|home state/i, fact: /state of (formation|organization)|formed in|^entity/i },
  { line: /mailing address/i, fact: /mailing address/i },
  { line: /(number of|total) employees|employees (expected|at this)/i, fact: /employees|staff/i },
  { line: /(principal |nature of )?(business )?activit|what the business does|description of (the )?business|products or services|principal (product|line of merchandise)/i, fact: /business type|what you sell|business activity|description|cuisine/i },
  { line: /opening|start(ing)? date|date (business|operations) (began|begin|start)|first day/i, fact: /opening|start date|begin/i },
  { line: /seats|seating/i, fact: /seats/i },
  { line: /hours/i, fact: /hours/i },
];
const STATE = /state of (formation|organization|incorporation)|formed in|jurisdiction of|home state/i;

/** Values for lines the profile answers: [{label, value}] with the line's own label. The store's address fills the
 *  premises lines; a mailing line takes a mailing-address fact only. Nothing is guessed: no fact, no value. */
export function prefillFromProfile(lines: string[], facts: Fact[], storeAddress: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const line of lines) {
    const kind = kindOf(line), l = line.replace(/^line [\w.-]+:\s*/i, "");
    if (kind === "address" && !/mailing|agent|registered office|home|residen|books|records/i.test(l) && /(business|physical|street|premises|location|store|site|establishment|facility)/i.test(l) && storeAddress) { out.push({ label: line, value: storeAddress }); continue; }
    // the first subject the line is about that a fact of the right kind answers ("Owner E-Mail" is about the owner and
    // about email: the owner's name isn't an email, so the email fact answers it)
    const fits = (f: Fact) => f.value.en.trim() && (kindOf(l) === "text" ? factKind(f) === "text" || STATE.test(l) : factKind(f) === kindOf(l));
    const fact = SUBJECTS.filter(x => x.line.test(l)).map(x => facts.find(f => x.fact.test(f.label.en) && fits(f))).find(Boolean);
    if (!fact) continue;
    // "the state it was formed in" from "California limited liability company": the state, not the whole phrase
    const value = STATE.test(l) ? (/\b(California|Texas|New York|Delaware|Nevada|Florida|Washington|Illinois|Arizona|Georgia|Massachusetts|New Jersey|Wyoming|Oregon|Colorado|Ohio|Pennsylvania|Virginia|Michigan|North Carolina|Utah|Hawaii|Maryland|Minnesota)\b/.exec(fact.value.en)?.[1] ?? "") : fact.value.en.trim();
    if (value) out.push({ label: line, value });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, "").replace(/\s+/g, " ").trim();
/** A label's forms: as written; without its "Line N:" prefix; without a trailing note in parentheses; and the part
 *  before its first colon (the line's name without its description). */
function forms(label: string): Set<string> {
  const a = norm(label), b = a.replace(/^line [\w.()-]+:\s*/, ""), c = b.replace(/\s*\([^()]*\)\s*$/, ""), d = c.split(":")[0].trim();
  return new Set([a, b, c, d].filter(x => x.length > 1));
}
/** Whether an answer given by `answerLabel` belongs on the line `lineLabel` for the store `store`. When a multi-store
 *  call asked per store, the label ends in the stores' names in parentheses ("Tax ID (Houston, Bellaire Blvd)"):
 *  that answer is for those stores only. */
export function answerFits(answerLabel: string, lineLabel: string, store: string, allStores: string[] = []): boolean {
  const m = /\(([^()]*)\)\s*$/.exec(answerLabel);
  const forStores = m ? allStores.filter(n => n && m[1].includes(n)) : [];
  if (forStores.length && !forStores.includes(store)) return false;
  const want = forms(answerLabel), have = forms(lineLabel);
  if (forStores.length) for (const x of forms(answerLabel.slice(0, m!.index))) want.add(x);
  return [...want].some(w => have.has(w));
}
