import type { Workspace } from "./model";

/* What a connected app's record means for licenses. A generic connector (Claude's, ChatGPT's, Zapier's) hands the model a
   location or a company record and leaves it there; it doesn't know that a store's address is the address on its health
   permit, its sign permit and its sales tax registration, or that a legal name that differs from the entity on file
   stops a filing. This maps each record the business's own apps keep (Google Business Profile, Clover, Shopify, Square,
   Xero) onto Placetta's records, with the app's own words quoted:
     a location     matched to a store by its street address (number, street, ZIP); then its address, phone and hours
                    against the store record and against every address line on that store's applications. A location
                    that matches no store is a store to add.
     a company      its legal name against the legal entities on file.
   Each fact says what to do: nothing (it matches), fill the store record (it's empty there), or check (the app and the
   record disagree, and which application lines carry the other value). Nothing is changed here: Odelia proposes, a
   person confirms in the app (update_store, add_store, edit_workspace), and a record that disagrees is never overwritten
   on the app's say-so. Pure: the server's connected_locations and company_profile tools and the tests share it. */

export type PlaceRecord = { source: string; id?: string; name: string; address: { line1: string; line2?: string; city: string; state: string; zip: string; country?: string }; phone?: string; hours?: string[] };
export type CompanyRecord = { source: string; name: string; legal_name?: string; addresses?: { kind: string; line1: string; city: string; state: string; zip: string }[] };

export type Fact = {
  /** what the fact is about */
  kind: "store_address" | "store_phone" | "store_hours" | "new_store" | "legal_name";
  /** the store it was matched to, if one */
  store?: { id: string; name: string };
  /** the app's value, and its own words (the record as the app returned it, quoted) */
  value: string;
  quote: string;
  source: string;
  /** matches: the record already says it; fill: the record is empty there; check: they disagree */
  status: "matches" | "fill" | "check";
  /** what Placetta's record says, when it differs */
  record?: string;
  /** applications whose address lines say something else (each with the line's own words) */
  affects?: { application: string; name: string; line: string; says: string }[];
  /** the change to propose, for a person to confirm in the app */
  propose?: { tool: "add_store" | "edit_workspace" | "remember"; input: Record<string, unknown> };
};

/* ------------------------------ addresses ------------------------------ */

const ABBR: [RegExp, string][] = [
  [/\bstreet\b/g, "st"], [/\bavenue\b/g, "ave"], [/\broad\b/g, "rd"], [/\bboulevard\b/g, "blvd"], [/\bdrive\b/g, "dr"], [/\blane\b/g, "ln"],
  [/\bplace\b/g, "pl"], [/\bcourt\b/g, "ct"], [/\bparkway\b/g, "pkwy"], [/\bhighway\b/g, "hwy"], [/\bsuite\b|\bste\b|#/g, "ste"],
  [/\bnorth\b/g, "n"], [/\bsouth\b/g, "s"], [/\beast\b/g, "e"], [/\bwest\b/g, "w"], [/\bfirst\b/g, "1st"], [/\bsecond\b/g, "2nd"], [/\bthird\b/g, "3rd"],
];
/** An address as words to compare: lower case, the usual abbreviations, no punctuation. */
export function addrKey(s: string): string {
  let t = ` ${String(s ?? "").toLowerCase().replace(/[.,]/g, " ")} `;
  for (const [re, to] of ABBR) t = t.replace(re, to);
  return t.replace(/[^a-z0-9- ]+/g, " ").replace(/\s+/g, " ").trim();
}
/** The parts that decide whether two addresses are the same place: the street number, the street's first word, the ZIP. */
function addrCore(s: string): { num: string; street: string; zip: string } {
  const k = addrKey(s);
  const num = /(?:^| )(\d+(?:-\d+)?[a-z]?)(?= )/.exec(` ${k} `)?.[1] ?? "";
  const after = num ? k.slice(k.indexOf(num) + num.length).trim().split(" ") : [];
  const street = after.find(w => !/^(n|s|e|w)$/.test(w)) ?? "";
  const zip = /\b(\d{5})(?:-\d{4})?\b(?!.*\b\d{5}\b)/.exec(k)?.[1] ?? "";
  return { num, street, zip };
}
const oneLine = (a: PlaceRecord["address"]) => [a.line1, a.line2, `${a.city}, ${a.state} ${a.zip}`.trim()].filter(Boolean).join(", ");
/** Same place: the same street number and street, and the same ZIP when both have one. */
export function samePlace(a: string, b: string): boolean {
  const x = addrCore(a), y = addrCore(b);
  return !!x.num && x.num === y.num && !!x.street && x.street === y.street && (!x.zip || !y.zip || x.zip === y.zip);
}
const ADDRESS_LINE = /\b(address|street|location|premises)\b|地址/i;

/* ------------------------------ locations ------------------------------ */

/** Each location the business's apps keep, as facts about its stores and their applications. */
export function placeFacts(w: Pick<Workspace, "stores" | "apps">, places: PlaceRecord[]): Fact[] {
  const stores = w.stores ?? [];
  const out: Fact[] = [];
  for (const p of places.slice(0, 60)) {
    const full = oneLine(p.address);
    const quote = `${p.source}: ${p.name}, ${full}${p.phone ? `, ${p.phone}` : ""}`.slice(0, 300);
    const st = stores.find(s => s.address && samePlace(s.address, full));
    if (!st) {
      out.push({ kind: "new_store", value: full, quote, source: p.source, status: "fill", propose: { tool: "add_store", input: { name: p.name, address: full } } });
      continue;
    }
    const store = { id: st.id, name: st.name.en };
    // the address: the store record, then each address line on its applications
    const affects = (w.apps ?? []).filter(a => (st.apps ?? []).includes(a.id)).flatMap(a => (a.fields ?? [])
      .filter(f => (ADDRESS_LINE.test(f.label.en) || ADDRESS_LINE.test(f.id)) && /\d/.test(f.value) && samePlace(f.value, full) === false && !!addrCore(f.value).num)
      .map(f => ({ application: a.id, name: a.name.en, line: f.label.en, says: f.value.slice(0, 160) })));
    const recordSame = addrKey(st.address) === addrKey(full) || sameSuite(st.address, full);
    out.push({ kind: "store_address", store, value: full, quote, source: p.source, status: recordSame && !affects.length ? "matches" : "check",
      ...(recordSame ? {} : { record: st.address }), ...(affects.length ? { affects } : {}) });
    // the store record keeps no phone or hours: they go to the business facts forms read from (remember)
    if (p.phone) out.push({ kind: "store_phone", store, value: p.phone, quote, source: p.source, status: "fill", propose: { tool: "remember", input: { label: `${st.name.en} phone`, value: p.phone } } });
    if (p.hours?.length) {
      const hours = p.hours.join("; ").slice(0, 300);
      out.push({ kind: "store_hours", store, value: hours, quote: `${p.source}: ${hours}`.slice(0, 300), source: p.source, status: "fill", propose: { tool: "remember", input: { label: `${st.name.en} hours`, value: hours } } });
    }
  }
  return out;
}
/** The same street address with only the suite written differently ("Suite 3" and "#3"). */
function sameSuite(a: string, b: string): boolean {
  if (!samePlace(a, b)) return false;
  const ste = (s: string) => /\bste (\w+)/.exec(addrKey(s))?.[1] ?? "";
  return ste(a) === ste(b);
}

/* ------------------------------ the company ------------------------------ */

const nameKey = (s: string) => String(s ?? "").toLowerCase().replace(/[.,]/g, " ").replace(/\b(limited liability company|l l c)\b/g, "llc").replace(/\b(incorporated|corporation)\b/g, "inc").replace(/\s+/g, " ").trim();
/** The company's record against the legal entities on file: the legal name an application files under must match. */
export function companyFacts(w: Pick<Workspace, "entities">, c: CompanyRecord): Fact[] {
  const legal = c.legal_name || c.name;
  if (!legal) return [];
  const quote = `${c.source}: ${c.legal_name ? `legal name ${c.legal_name}` : `name ${c.name}`}`.slice(0, 300);
  const ents = w.entities ?? [];
  if (!ents.length) return [{ kind: "legal_name", value: legal, quote, source: c.source, status: "fill", propose: { tool: "edit_workspace", input: { entity_name: legal } } }];
  const hit = ents.find(e => nameKey(e.name) === nameKey(legal));
  if (hit) return [{ kind: "legal_name", value: legal, quote, source: c.source, status: "matches" }];
  return [{ kind: "legal_name", value: legal, quote, source: c.source, status: "check", record: ents.map(e => e.name).join("; ").slice(0, 200) }];
}

/** One line for Odelia per fact that needs a person: what the app says, what the record says, with the quote. */
export function factLines(facts: Fact[]): string[] {
  return facts.filter(f => f.status !== "matches").slice(0, 20).map(f => {
    const where = f.store ? ` (${f.store.name})` : "";
    if (f.kind === "new_store") return `${f.source} has a location Placetta doesn't: ${f.value}. Quote: "${f.quote}". Offer to add it as a store.`;
    if (f.status === "check" && f.kind === "store_address") return `${f.source} lists ${f.store?.name ?? "a store"} at ${f.value}${f.record ? `, the store record says ${f.record}` : ""}${f.affects?.length ? `; these application lines say something else: ${f.affects.map(a => `${a.name}, "${a.line}": ${a.says}`).join("; ")}` : ""}. Quote: "${f.quote}". Ask which is right before anything is filed; a license must carry the store's real address.`;
    if (f.status === "check" && f.kind === "legal_name") return `${f.source} names the company ${f.value}; the entity on file is ${f.record}. Quote: "${f.quote}". Ask which is the legal name on the formation documents before filing under either.`;
    return `${f.source}${where}: ${f.kind.replace("store_", "")} ${f.value} isn't in Placetta's record yet. Quote: "${f.quote}". Offer to add it.`;
  });
}
