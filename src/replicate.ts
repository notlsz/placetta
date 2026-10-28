/* Replicate this store: "duplicate one great store to thousands". An owner runs one store that works; Placetta plans the
   same business in each new place the owner names (a city, a state or a country, several at once) and, on one approval,
   opens every new location with its own applications, prefilled from the source store's approved facts.

   For each target, the plan is the registry's own (previewPlan: formsFor, placesOf, needs) for the source's business
   facts (what it sells, the company, where it was formed, foreign ownership), and every step lands in one of four groups:
     same        carries over unchanged: the company is formed, a federal filing is done (no refiling)
     covered     the existing company already covers it: its EIN or BOIR still in progress, a state registration in the
                 same state (the employer account, the Secretary of State registration)
     new         new for this location: a city's or county's permits, a new state's seller's permit and foreign
                 qualification, a new country's registrations
     not_needed  the source store's steps that don't apply there (California's permits for a store in Dallas)
   with the agency fees added up (the unpublished ones counted, never guessed), the opening estimate (the same critical
   path every screen uses, src/smart.ts openingPath), Placetta's price (src/pricing.ts, read only) and the owner's touches.

   Opening the locations creates records only: new stores, their own applications (each with its own timeline), facts
   reused by reference to the source's approved facts, documents by reference to the source's documents. Nothing is
   filed: every application goes through the normal pipeline, Autopilot's caps and the agent authority. Pure. */
import { B, type Bi } from "./bi";
import type { Application, CheckItem, Field, Level, Store, Workspace } from "./model";
import { FORMS, formById, formsEntity, placeInfo, placesOf } from "./forms/registry";
import { CITIES, COUNTRIES } from "./forms/world";
import { previewPlan, stateName, stateOf, ownedAbroadFact } from "./plan/preview";
import { prefill } from "./plan/prefill";
import { openingPath, type Hinge } from "./smart";
import { licenseTierOf, PLAN_STORE_YEAR_USD, SIMPLE, tierUsd } from "./pricing";
import { autopilotOn } from "./autopilot";
import { countyOf } from "./counties";

export type ReplicaKind = "same" | "covered" | "new" | "not_needed";
export type ReplicaRow = {
  kind: ReplicaKind;
  name: Bi; agency: Bi; level: Level;
  why: Bi;                         // why it's in this group, in a sentence
  ref?: string;                    // the source's application (same, covered, not_needed) or fact it points to
  fee: number | null;              // new rows: the agency's published fee; null when it doesn't publish one
  currency: string;
  abstain?: boolean;               // who to ask, not a stated requirement
  yours?: "certificate" | "insurance";
};
/** The source store's business, as the workspace states it. Only what an approved fact or the workspace says. */
export type SourceFacts = {
  store: Store;
  what: string;                    // what the business is, in its own words
  state?: string;                  // the source store's state, when it's in the US
  country: string;
  legal?: string;                  // the company's legal name, from its facts
  entity?: string;                 // the entity fact as written ("California limited liability company")
  formedIn?: string;               // where the company was formed: a state, or "abroad"; from the entity fact when it says
  formedAssumed: boolean;          // formedIn is the source store's state because nothing says otherwise
  corp: boolean;
  foreignOwned?: boolean;
  owner?: string;                  // a person's name, only when the owner fact is one
  products?: string;               // what it sells, from its fact
  ein: boolean;                    // the company has an EIN on record (a fact or an approved application)
};
export type TargetPlan = {
  storeId: string;                 // the new store's id, once opened
  place: string;                  // as planned: "Dallas, TX", "Toronto, Canada", "Texas"
  label: Bi;                       // as shown
  country: string;
  state?: string;
  /** full: the registry has the city's own steps; partial: state or country steps only, the rest is who to ask;
   *  none: the registry doesn't cover the place yet, and the plan says so. */
  coverage: "full" | "partial" | "none";
  rows: ReplicaRow[];
  counts: Record<ReplicaKind, number> & { licenses: number };   // licenses: what this location holds once open (same + covered + new)
  fees: { currency: string; published: number; unknown: number };
  opening: { date: string; days: number; range: { fast: string; slow: string } | null; daysRange: { fast: number; slow: number } | null; hinge: Hinge[] } | null;
  placetta: { licenses: number; complex: number; free: number; usd: number; planYearUsd: number; chain: boolean };
  touches: number;                 // the owner's touches for this location, counted as `touchWhy` says
  touchWhy: Bi;
  apps: Application[];             // the new location's own applications, prefilled, ready to be added
  reused: string[];                // the source's applications this location relies on (same and covered), by reference
};
/** The facts asked for each new location, in one batched form. Anything left blank stays blank. */
export type LocationFacts = { address?: string; sqft?: string; opening?: string };
export type ReplicaTarget = { place: string } & LocationFacts;

/* ------------------------------------------------------------------ the source */

const lc = (s: string) => s.toLowerCase();
const factOf = (w: Workspace, re: RegExp) => w.facts.find(f => re.test(f.label.en))?.value.en.trim() || undefined;
/** A person's name, not a description: "Ana Ruiz", never "You, sole member". */
const personName = (v: string | undefined) => (v && /^[\p{L}][\p{L}.'-]*(\s+[\p{L}][\p{L}.'-]*){1,3}$/u.test(v) && !/\b(you|me|sole|member|owner|tbd|unknown)\b|您|我/i.test(v) ? v : undefined);

export function sourceFacts(w: Workspace, storeId: string): SourceFacts | null {
  const store = (w.stores ?? []).find(s => s.id === storeId);
  if (!store) return null;
  const products = factOf(w, /^what (you|it|the business) sells?$|^products?$/i);
  const what = w.meta?.what?.trim() || w.firstPlan?.what?.trim() || products || w.business.en;
  const info = placeInfo(store.address);
  const state = stateOf(store.address) ?? info.city?.state ?? placesOf(store.address).find(usState);
  const legal = factOf(w, /^legal name$|^entity name$/i) ?? w.entities?.[0]?.name ?? (w.meta?.entity?.trim() || undefined);
  const entity = factOf(w, /^entity( type)?$/i);
  // where the company was formed: its own registration (not a foreign one), else the state the entity fact names
  const home = w.entities?.[0]?.registrations.find(r => !r.foreign)?.state;
  const named = entity ? (/\b(foreign|overseas|china|chinese|hong kong|境外|海外|中国)\b/i.test(entity) ? "abroad" : stateOf(entity)) : undefined;
  const formedIn = home ?? named ?? (legal ? state : undefined);
  const owner = personName(factOf(w, /^owners?$|^member$|^owner name$|^responsible party$/i));
  const ein = !!factOf(w, /^ein$|^employer identification/i) || w.apps.some(a => a.status === "approved" && role(a) === "ein");
  return {
    store, what, state, country: info.country ?? "US", legal, entity, formedIn, formedAssumed: !home && !named && !!formedIn,
    corp: /\b(inc|incorporated|corp|corporation)\.?\s*$/i.test(legal ?? "") || /\bcorporation\b/i.test(entity ?? ""),
    foreignOwned: ownedAbroadFact(w.facts), owner, products, ein,
  };
}

/* ------------------------------------------------------------------ the places */

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());
/** A US state named on its own: "TX", "Texas", "德州". */
const stateCodeOf = (t: string): string | undefined => {
  const x = t.trim();
  if (/^[A-Za-z]{2}$/.test(x)) return stateName(x) ? x.toUpperCase() : undefined;
  const st = stateOf(x);
  if (!st) return undefined;
  const n = stateName(st)!;
  return lc(x).replace(/\s+state$/, "") === lc(n.en) || x === n.zh || x === n.zh.replace(/州$/, "") ? st : undefined;
};
const usState = (p: string) => /^[A-Z]{2}$/.test(p) && p !== "US" && !!stateName(p);
const countryOf = (t: string) => COUNTRIES.find(c => c.names.test(t.trim()) && t.trim().length <= c.en.length + 8);

/** The cities in a state whose own steps the registry holds: the places Placetta can plan in full. */
export function coveredCities(state: string): string[] {
  const st = state.toUpperCase();
  const out = CITIES.filter(c => c.state === st && c.country === "US" && FORMS.some(f => f.where === c.code && f.level === "city")).map(c => `${c.en}, ${st}`);
  if (st === "TX" && FORMS.some(f => f.where === "HOU")) out.splice(1, 0, "Houston, TX");
  return [...new Set(out)];
}

/** One place as the owner typed it, made plannable: "Dallas" is "Dallas, TX", "Toronto" is "Toronto, Canada", "Texas"
 *  stays the state. null when the library can't tell where it is. */
export function resolvePlace(token: string, hintState?: string): string | null {
  const t = token.trim().replace(/[.。]+$/, "");
  if (!t) return null;
  const sc = stateCodeOf(t);
  if (sc) return stateName(sc)!.en;
  if (countryOf(t) && !CITIES.some(c => c.aliases.includes(lc(t)))) return countryOf(t)!.en;
  if (/,/.test(t)) {
    const info = placeInfo(t);
    if (info.country && info.country !== "US") return t;
    return stateOf(t) ? t : null;
  }
  const info = placeInfo(t);
  if (info.city) {
    if (info.city.country === "US") return `${info.city.en}, ${info.city.state ?? hintState ?? ""}`.replace(/,\s*$/, "");
    const ctry = COUNTRIES.find(c => c.code === info.city!.country);
    return `${info.city.en}, ${ctry?.en ?? info.city.country}`;
  }
  const st = placesOf(t).find(usState);
  if (st) return `${titleCase(t)}, ${st}`;
  return hintState ? `${titleCase(t)}, ${hintState}` : null;
}

/** The places in what the owner wrote: "Dallas, Houston, Austin, and Toronto", "达拉斯、休斯顿和多伦多",
 *  "Austin, TX; Toronto". A state or country right after a city goes with it ("Dallas, TX"). */
export function parseTargets(text: string, hintState?: string): { places: string[]; unknown: string[] } {
  const parts = text.replace(/\band\b|以及|和|及|与/gi, ",").split(/[,;，；、\n]+/).map(s => s.trim()).filter(Boolean);
  const joined: string[] = [];
  for (const p of parts) {
    const prev = joined[joined.length - 1];
    // "TX" or "Texas" after a city is its state; "Canada" after a city is its country
    if (prev && !/,/.test(prev) && (stateCodeOf(p) || countryOf(p)) && !stateCodeOf(prev) && !countryOf(prev) && (placeInfo(prev).city || !placeInfo(prev).country || placeInfo(prev).country === "US")) {
      joined[joined.length - 1] = `${prev}, ${p}`;
      continue;
    }
    joined.push(p);
  }
  const places: string[] = [], unknown: string[] = [];
  for (const j of joined) { const r = resolvePlace(j, hintState); if (r && !places.includes(r)) places.push(r); else if (!r) unknown.push(j); }
  return { places: places.slice(0, 12), unknown };
}

/** A request to copy a store, as the owner says it: "open 3 more like our San Jose store in Texas", "replicate Flushing
 *  to Dallas, Houston and Toronto", "像圣何塞店一样在德州再开3家". */
export const REPLICATE_ASK = /\b(replicate|duplicate|clone)\b.*\b(stores?|shops?|locations?)\b|\bopen\b.*\bmore\b.*\blike\b|\b(copy|same as)\b.*\b(stores?|shops?)\b.*\b(to|in)\b|\b(stores?|shops?)\b.*\blike (our|the|my)\b|复制.*(门店|店)|像.*(一样|那样).*(开|店)|再开\s*\d*\s*(家|个)/i;
const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** What such a request names: the store to copy (by its name or city, else the one open store, else the first), the
 *  places, and, for "3 more in Texas" with no cities, the state's cities the registry covers in full (`picked`). */
export function readReplicateAsk(w: Workspace, text: string): { source?: Store; places: string[]; unknown: string[]; picked: boolean } {
  const stores = w.stores ?? [], t = lc(text);
  const source = stores.find(s => { const city = s.name.en.split(",")[0].trim(); return !!city && (t.includes(lc(city)) || (!!s.name.zh && text.includes(s.name.zh.split(" ")[0]))); })
    ?? (stores.filter(s => s.stage === "open").length === 1 ? stores.find(s => s.stage === "open") : stores[0]);
  const m = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b\s+(more|new|stores?|shops?|locations?)|再开\s*(\d+|[一两二三四五六七八九十])\s*(家|个)?|(\d+|[一两二三四五六七八九十])\s*(家|个)/i.exec(text);
  const raw = m ? (m[1] ?? m[3] ?? m[5]) : undefined;
  const count = raw ? Number(raw) || COUNT_WORDS[lc(raw)] || 0 : 0;
  // the places come after "in" or "to" (the source store's own name comes before)
  const tail = text.split(/\b(?:in|to|into|across)\b/i).slice(1).join(", ").replace(/\b(the|state of)\b/gi, " ") || text.split(/在|到/).slice(1).join("，").replace(/(再开|开|一样|像).*$/, "");
  const parsed = parseTargets(tail);
  const states = parsed.places.filter(p => !!stateCodeOf(p));
  if (parsed.places.length === states.length && states.length === 1 && count) {
    const st = stateCodeOf(states[0])!;
    const cities = coveredCities(st).filter(c => !source || !lc(source.address).includes(lc(c.split(",")[0])));
    return { source, places: cities.slice(0, Math.min(12, count)), unknown: parsed.unknown, picked: true };
  }
  return { source, places: parsed.places.filter(p => !source || p !== source.address), unknown: parsed.unknown, picked: false };
}

/* ------------------------------------------------------------------ matching steps */

/** What a step is, across the registry's ids and a workspace's own names (the sample's "seller" is the registry's
 *  "ca-cdtfa"): the company itself, its EIN, its BOIR, or nothing in particular. */
function role(a: Pick<Application, "name" | "official">): "formation" | "ein" | "boir" | "soi" | null {
  const f = a.official ? formById(a.official) : undefined;
  if (f && formsEntity(f)) return "formation";
  const n = a.name.en;
  if (a.official === "irs-ss4" || /employer identification number|\(ein\)|^ein\b/i.test(n)) return "ein";
  if (/beneficial ownership/i.test(n)) return "boir";
  if (/articles of (organization|incorporation)|certificate of formation|company formation/i.test(n)) return "formation";
  if (/statement of information/i.test(n)) return "soi";
  return null;
}
const STOP = new Set(["application", "form", "registration", "permit", "license", "licence", "certificate", "state", "california", "texas", "for", "and", "the"]);
const stems = (s: string) => new Set(lc(s).replace(/[^a-z ]+/g, " ").split(/\s+/).filter(x => x.length >= 4 && !STOP.has(x)).map(x => x.slice(0, 5)));
/** Two applications are the same step: the same registry form, the same role, or (a state's) the same agency for the
 *  same kind of thing ("Employer payroll tax registration" and "Registration Form for Commercial Employers", EDD). */
function sameStep(a: Application, b: Application): boolean {
  if (a.official && b.official) return a.official === b.official;
  const ra = role(a), rb = role(b);
  if (ra || rb) return ra === rb;
  if (a.level !== b.level || lc(a.agency.en).trim() !== lc(b.agency.en).trim()) return false;
  const sa = stems(a.name.en);
  return [...stems(b.name.en)].some(x => sa.has(x)) || lc(a.name.en) === lc(b.name.en);
}
/** A step every location holds on its own, even in the same state: the store's own seller's or sales tax permit (on the
 *  company's account), anything about the food, the building, the sign or the premises, and staff certificates. */
const PER_LOCATION = /seller'?s permit|sales (and use )?tax permit|certificate of authority|food|health|handler|manager|plan (check|review)|building|occupancy|\bsign\b|fire|business (tax|license|licence)|alcohol|liquor|beer|wine|inspection|premises|zoning/i;

/** Where an application of the workspace is: its registry form's jurisdiction, else read from its agency's name. */
function stateOfApp(a: Application, fallback?: string): string | undefined {
  const f = a.official ? formById(a.official) : undefined;
  if (f) return /^[A-Z]{2}$/.test(f.where) && f.where !== "US" ? f.where : f.where === "US" ? undefined : f.where.split("-")[0];
  return stateOf(a.agency.en) ?? (a.level === "federal" ? undefined : fallback);
}

const CUR: Record<string, string> = { US: "USD", CA: "CAD", MX: "MXN", GB: "GBP", CN: "CNY", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR" };
const feeOf = (a: Application): number | null => (a.abstain || a.fees.some(f => f.tbd) ? null : Math.round(a.fees.reduce((t, f) => t + f.amount, 0) * 100) / 100);

/* ------------------------------------------------------------------ the plan for one place */

const W = {
  same: B("Done once for the company: it carries over, nothing is filed again.", "公司已办理一次，直接沿用，无需重新提交。"),
  formed: B("The company is already formed; it doesn't form again.", "公司已成立，无需再次成立。"),
  coveredFed: B("The company's own filing, already under way, covers this location too.", "公司本身的申请正在办理，同样覆盖这家门店。"),
  coveredState: B("The company's registration in this state already covers the new location.", "公司在该州的登记已覆盖新门店。"),
  perLocation: B("Each location holds its own, on the company's existing account where there is one.", "每家门店须单独持有，如已有公司账户则在该账户下办理。"),
  local: B("A permit of this city or county, for this location.", "该市或县对这家门店的许可。"),
  newState: B("New for this state: the company hasn't registered here.", "该州新增：公司尚未在此登记。"),
  newCountry: B("New for this country.", "该国家新增。"),
  newCompany: B("New: the company doesn't have it on record yet.", "新增：公司尚无此项记录。"),
  notThere: B("Applies where the source store is, not there.", "仅适用于原门店所在地，新地点不需要。"),
  notAbroad: B("A US filing the company keeps; the new country doesn't ask for it.", "公司保留的美国申报，新国家不要求。"),
};

const placeLabel = (place: string): Bi => {
  const info = placeInfo(place);
  if (info.city) {
    const st = info.city.state && info.city.country === "US" ? `, ${info.city.state}` : "";
    const ctry = info.city.country !== "US" ? COUNTRIES.find(c => c.code === info.city!.country) : undefined;
    return B(`${info.city.en}${st}${ctry ? `, ${ctry.en}` : ""}`, `${info.city.zh}${ctry ? `（${ctry.zh}）` : ""}`);
  }
  const st = stateCodeOf(place.split(",").pop() ?? "") ?? stateCodeOf(place);
  const ws = st ? stateName(st) : undefined;
  const ctry = countryOf(place);
  if (!/,/.test(place) && ws) return B(ws.en, ws.zh);
  if (!/,/.test(place) && ctry) return B(ctry.en, ctry.zh);
  return B(place, ws ? `${place.split(",")[0].trim()}（${ws.zh}）` : place);
};

const between = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);

/** The plan for one new location like the source store. `storeId` names the new store's applications. */
export function planTarget(w: Workspace, src: SourceFacts, place: string, o: { today: string; storeId?: string; facts?: LocationFacts; others?: number } ): TargetPlan {
  const today = o.today;
  const info = placeInfo(place);
  const country = info.country ?? "US";
  const tState = country === "US" ? stateOf(place) ?? info.city?.state : undefined;
  const storeId = o.storeId ?? `new-${slug(place)}`;
  // the company as it stands: it exists when its name is on record (else it's the one being formed for the source store)
  const entity = src.legal ?? (w.apps.some(a => role(a) === "formation") ? "the company formed for the first store" : "");
  const p = previewPlan(src.what, place, o.facts?.opening, { today, entity, formedIn: entity ? src.formedIn : undefined, corp: src.corp, foreignOwned: src.foreignOwned, storeId });
  const srcApps = w.apps.filter(a => (src.store.apps ?? []).includes(a.id) || a.level === "federal");
  const used = new Set<string>();
  const rows: ReplicaRow[] = [];
  const keep: Application[] = [];
  const remap = new Map<string, string>();   // a preview row's id → the application the new store points to
  const cur = CUR[country] ?? info.currency ?? "USD";
  for (const t of p.apps) {
    const match = srcApps.find(a => !used.has(a.id) && sameStep(t, a));
    const base = { name: t.name, agency: t.agency, level: t.level, currency: t.currency ?? cur, ...(t.abstain ? { abstain: true } : {}), ...(t.yours ? { yours: t.yours } : {}) };
    if (t.level === "federal" && country === "US" && (match || (role(t) === "ein" && src.ein))) {
      if (match) { used.add(match.id); remap.set(t.id, match.id); }
      const done = !match || match.status === "approved";
      rows.push({ ...base, kind: done ? "same" : "covered", why: done ? W.same : W.coveredFed, ref: match?.id ?? "fact:ein", fee: null });
      continue;
    }
    const sState = match ? stateOfApp(match, src.state) : undefined;
    if (match && t.level === "state" && tState && sState === tState && !PER_LOCATION.test(t.name.en) && t.yours !== "certificate") {
      used.add(match.id); remap.set(t.id, match.id);
      rows.push({ ...base, kind: "covered", why: W.coveredState, ref: match.id, fee: null });
      continue;
    }
    const why = t.level === "city" || t.level === "county" ? W.local
      : t.level === "federal" ? (country === "US" ? W.newCompany : W.newCountry)
      : tState && src.state && tState === src.state ? W.perLocation
      : country !== src.country ? W.newCountry : PER_LOCATION.test(t.name.en) ? W.perLocation : W.newState;
    rows.push({ ...base, kind: "new", why, fee: feeOf(t) });
    keep.push(t);
  }
  // what the source store has that this place doesn't ask for: the company itself carries over, the rest stays home
  for (const a of srcApps) {
    if (used.has(a.id)) continue;
    const r = role(a);
    const base = { name: a.name, agency: a.agency, level: a.level, ref: a.id, fee: null, currency: a.currency ?? "USD" };
    if (r === "formation") { rows.push({ ...base, kind: "same", why: W.formed }); continue; }
    if (a.level === "federal" && country === "US") { rows.push({ ...base, kind: "same", why: W.same }); continue; }
    rows.push({ ...base, kind: "not_needed", why: a.level === "federal" ? W.notAbroad : W.notThere });
  }
  if (src.legal && !w.apps.some(a => role(a) === "formation"))
    rows.unshift({ kind: "same", name: B(`The company: ${src.legal}`, `公司：${src.legal}`), agency: B(src.entity ?? "Already formed", src.entity ?? "已成立"), level: "state", why: W.formed, ref: "fact:legal", fee: null, currency: "USD" });

  // the new store's own applications: prefilled from the source's approved facts, steps it waits on pointed at the
  // company's own applications where they're shared, documents reused by reference
  const apps = keep.map(t => ownApp(t, storeId, remap, w, src));
  const ids = new Map(keep.map((t, k) => [t.id, apps[k].id]));
  for (const a of apps) a.checklist = a.checklist.map(c => (c.dep && ids.has(c.dep) ? { ...c, dep: ids.get(c.dep) } : c));
  const filled = fillFrom(apps, src, place, o.facts);

  // the opening estimate: the same critical path as every store's, on a copy of the workspace with this store in it
  const store: Store = { id: storeId, name: placeLabel(place), address: o.facts?.address || place, stage: "opening", plannedOpen: o.facts?.opening, rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: filled.map(a => a.id) };
  const path = openingPath(store, { ...w, apps: [...w.apps, ...filled], stores: [...(w.stores ?? []), store] }, today);
  const opening = path.landing ? {
    date: path.landing, days: between(today, path.landing), range: path.range, hinge: path.hinge,
    daysRange: path.range ? { fast: between(today, path.range.fast), slow: between(today, path.range.slow) } : null,
  } : null;

  const news = rows.filter(r => r.kind === "new");
  const count = (k: ReplicaKind) => rows.filter(r => r.kind === k).length;
  // Placetta's price for this location, as src/pricing.ts sets it: each new filing at its tier, plus the store plan
  const tiers = news.map(r => (r.yours ? "free" : licenseTierOf(r.name.en)));
  const n = (t: string) => tiers.filter(x => x === t).length;
  const chain = (w.stores ?? []).length + 1 + (o.others ?? 0) >= SIMPLE.chainMinStores;
  const filings = news.filter(r => !r.yours).length, own = news.filter(r => r.yours).length;
  const auto = autopilotOn(w, today + "T12:00:00Z");
  const touches = 2 + own + (auto ? 0 : filings);
  const published = news.reduce((t, r) => t + (r.fee ?? 0), 0);
  const coverage: TargetPlan["coverage"] = info.local ? "full" : p.apps.some(a => !a.abstain && a.level !== "federal" && !!a.official) ? "partial" : "none";
  return {
    storeId, place, label: placeLabel(place), country, ...(tState ? { state: tState } : {}), coverage, rows,
    counts: { same: count("same"), covered: count("covered"), new: news.length, not_needed: count("not_needed"), licenses: count("same") + count("covered") + news.length },
    fees: { currency: cur, published: Math.round(published * 100) / 100, unknown: news.filter(r => r.fee == null).length },
    opening,
    placetta: { licenses: n("license"), complex: n("complex"), free: n("free"), usd: chain ? 0 : n("license") * tierUsd("license") + n("complex") * tierUsd("complex"), planYearUsd: PLAN_STORE_YEAR_USD, chain },
    touches,
    touchWhy: B(`One form for the location's details, one approval to open it${own ? `, ${own} step${own === 1 ? "" : "s"} your team completes (certificates, insurance)` : ""}${auto ? ", and Autopilot files the rest within its caps" : `, and ${filings} filing approval${filings === 1 ? "" : "s"}`}.`,
      `填写一次门店信息，批准一次开店${own ? `，${own} 项由您的团队完成（证书、保险）` : ""}${auto ? "，其余由自动驾驶在限额内提交" : `，以及 ${filings} 次提交批准`}。`),
    apps: filled,
    reused: rows.filter(r => (r.kind === "same" || r.kind === "covered") && r.ref && !r.ref.startsWith("fact:")).map(r => r.ref!),
  };
}

const slug = (s: string) => lc(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "store";

/** A company document worth reusing: the company's own papers, never a location's (a lease, a floor plan, photos). */
const LOCATION_DOC = /lease|floor|site|equipment|finish|photo|drawing|plan|contractor|occupancy|address|deed|landlord|layout|sign|menu board|租约|平面|设备|照片|图纸/i;

/** The new store's own copy of one preview row: its own id and timeline; documents the source already has, by reference. */
function ownApp(t: Application, storeId: string, remap: Map<string, string>, w: Workspace, src: SourceFacts): Application {
  const id = `${storeId}-${t.id.replace(/^pv-(g-)?/, "")}`;
  const have = w.apps.filter(a => (src.store.apps ?? []).includes(a.id) || a.level === "federal").flatMap(a => a.checklist.filter(c => c.state === "done" && c.doc));
  const byId = new Map(w.apps.map(a => [a.id, a]));
  const checklist: CheckItem[] = t.checklist.map(c => {
    if (c.dep && remap.has(c.dep)) {
      const to = remap.get(c.dep)!;
      return byId.get(to)?.status === "approved" ? { ...c, dep: to, state: "done", note: B("Already done for the company", "公司已办理") } : { ...c, dep: to };
    }
    const doc = !LOCATION_DOC.test(c.label.en) ? have.find(h => lc(h.label.en) === lc(c.label.en)) : undefined;
    return doc ? { ...c, state: "done", doc: doc.doc, note: B(`Reused from ${src.store.name.en}`, `沿用自${src.store.name.zh}`) } : c;
  });
  return { ...t, id, checklist, preview: true };
}

/** From the source store's approved facts: the business name, the company, the owner (only a person's name) and what it
 *  sells; and the location's own facts as the owner typed them. Nothing else is written, and nothing is guessed: the
 *  same line-by-line rules as the signup's prefill (src/plan/prefill.ts), which never fills a number, an ID or a date
 *  nobody gave. */
function fillFrom(apps: Application[], src: SourceFacts, place: string, facts?: LocationFacts): Application[] {
  const out = prefill(apps, { what: src.what, where: place, legal: src.legal, owner: src.owner, address: facts?.address || undefined, today: undefined }).apps;
  const from = B(`From ${src.store.name.en}'s approved facts`, `来自${src.store.name.zh}已确认的资料`);
  const here = B("From this location's details", "来自本门店信息");
  const AREA = /square f|sq\.? ?ft|floor area|gross area|area of (the )?(premises|space|establishment)|面积/i;
  return out.map((a, k) => ({
    ...a,
    fields: a.fields.map((f, j): Field => {
      const was = apps[k].fields[j]?.value ?? "";
      if (f.value && f.value !== was) return { ...f, from: /address|street|city|zip|county|premises|location/i.test(f.label.en) ? here : from };
      if (!f.value && facts?.sqft && AREA.test(f.label.en)) return { ...f, value: facts.sqft, from: here };
      return f;
    }),
  }));
}

/* ------------------------------------------------------------------ several places */

export type Replication = { source: SourceFacts; targets: TargetPlan[]; unknown: string[] };

/** The plan for every place, side by side. */
export function replicate(w: Workspace, storeId: string, places: string[], o: { today: string; facts?: Record<string, LocationFacts> }): Replication | null {
  const src = sourceFacts(w, storeId);
  if (!src) return null;
  const list = [...new Set(places)].slice(0, 12);
  const taken = new Set((w.stores ?? []).map(s => s.id));
  const targets = list.map(place => {
    let id = `${slug(place.split(",")[0])}`, k = 2;
    while (taken.has(id)) id = `${slug(place.split(",")[0])}-${k++}`;
    taken.add(id);
    return planTarget(w, src, place, { today: o.today, storeId: id, facts: o.facts?.[place], others: list.length - 1 });
  });
  return { source: src, targets, unknown: [] };
}

const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
export const feesSay = (f: TargetPlan["fees"]): Bi => {
  const amt = f.currency === "USD" ? usd(f.published) : `${f.published.toLocaleString("en-US")} ${f.currency}`;
  return f.unknown ? B(`${amt} + ${f.unknown} not published`, `${amt} + ${f.unknown} 项未公布`) : B(amt, amt);
};
export const daysSay = (t: TargetPlan): Bi => {
  if (!t.opening) return B("Not estimated", "暂无估算");
  const r = t.opening.daysRange;
  return r && (r.fast !== t.opening.days || r.slow !== t.opening.days)
    ? B(`${t.opening.days} days (${r.fast} to ${r.slow})`, `${t.opening.days} 天（${r.fast} 至 ${r.slow} 天）`)
    : B(`${t.opening.days} days`, `${t.opening.days} 天`);
};
export const COVERAGE_SAY: Record<TargetPlan["coverage"], Bi> = {
  full: B("Covered by Placetta's registry", "快哉登记库已覆盖"),
  partial: B("State or country steps covered; local steps name who to ask", "已覆盖州或国家层面的步骤；地方步骤列出了咨询机构"),
  none: B("Not covered yet: Placetta's registry doesn't hold this place's steps, so each row names who to ask", "尚未覆盖：快哉登记库还没有这个地方的步骤，每一行列出应咨询的机构"),
};

/** The comparison as a table: one row a place. */
export function compareTable(r: Replication): { title: Bi; columns: Bi[]; rows: { en: string[][]; zh: string[][] } } {
  const columns = [B("Location", "地点"), B("Licenses", "许可总数"), B("New filings", "新申请"), B("Agency fees", "机构规费"), B("Days to open", "开业所需天数"), B("Your touches", "您需操作次数")];
  const row = (t: TargetPlan, l: "en" | "zh") => [t.label[l], String(t.counts.licenses), String(t.counts.new), feesSay(t.fees)[l], daysSay(t)[l], String(t.touches)];
  return { title: B(`Replicating ${r.source.store.name.en}`, `复制${r.source.store.name.zh}`), columns, rows: { en: r.targets.map(t => row(t, "en")), zh: r.targets.map(t => row(t, "zh")) } };
}

/** Placetta's price for all of it, said once. */
export function priceSay(r: Replication): Bi {
  const lic = r.targets.reduce((t, x) => t + x.placetta.usd, 0), plan = r.targets.length * PLAN_STORE_YEAR_USD;
  const chain = r.targets.some(t => t.placetta.chain);
  return chain
    ? B(`With ${SIMPLE.chainMinStores} or more stores on the plan, every new license is included. The store plan is ${usd(plan)} a year for the ${r.targets.length} new location${r.targets.length === 1 ? "" : "s"}. Agency fees are passed through at cost.`,
        `方案内门店达 ${SIMPLE.chainMinStores} 家及以上，所有新执照均已包含。${r.targets.length} 家新门店的门店方案每年 ${plan.toLocaleString("en-US")} 美元。机构规费按实际金额代付。`)
    : B(`Placetta: ${usd(lic)} for the new filings (${usd(SIMPLE.licenseOnApprovalUsd)} each, ${usd(SIMPLE.complexOnApprovalUsd)} for a complex one, charged when the agency approves it, and nothing if it's turned down because of a mistake on our side), and the store plan at ${usd(plan)} a year for the ${r.targets.length} new location${r.targets.length === 1 ? "" : "s"}. Agency fees are passed through at cost.`,
        `快哉：新申请共 ${lic.toLocaleString("en-US")} 美元（每项 ${SIMPLE.licenseOnApprovalUsd} 美元，复杂执照 ${SIMPLE.complexOnApprovalUsd} 美元，机构批准后才收费；如因我们的失误被驳回，不收费），${r.targets.length} 家新门店的门店方案每年 ${plan.toLocaleString("en-US")} 美元。机构规费按实际金额代付。`);
}

/* ------------------------------------------------------------------ opening them */

/** What the batched form still needs for a location the owner opened: its address, square footage and opening date. */
export function missingFacts(s: Store): (keyof LocationFacts)[] {
  if (!s.replica) return [];
  const out: (keyof LocationFacts)[] = [];
  if (!/\d/.test(s.address)) out.push("address");
  if (!s.replica.sqft) out.push("sqft");
  if (!s.plannedOpen) out.push("opening");
  return out;
}

/** Open every location after the owner's one approval: each a new store with its own applications (in the normal
 *  pipeline, status as the plan left them: nothing filed, nothing put up for approval), the company's shared steps
 *  pointed at by reference, and the facts asked for each location in place. Returns the workspace, untouched when the
 *  source store is gone. */
export function openLocations(w: Workspace, source: string, targets: ReplicaTarget[], today: string): Workspace {
  const facts = Object.fromEntries(targets.map(t => [t.place, { address: t.address, sqft: t.sqft, opening: t.opening }]));
  const r = replicate(w, source, targets.map(t => t.place), { today, facts });
  if (!r) return w;
  const ids = new Set(w.apps.map(a => a.id));
  let stores = [...(w.stores ?? [])], apps = [...w.apps], locations = [...w.locations];
  for (const t of r.targets) {
    const f = facts[t.place] ?? {};
    const storeId = t.storeId;
    const own = t.apps.filter(a => !ids.has(a.id));
    apps = [...apps, ...own];
    stores = [...stores, {
      id: storeId, name: t.label, address: f.address?.trim() || t.place, stage: "opening", ...(f.opening ? { plannedOpen: f.opening } : {}),
      rules: [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: own.map(a => a.id),
      replica: { source, at: today, reused: t.reused, ...(f.sqft ? { sqft: f.sqft } : {}) },
    }];
    const city = t.label.en.split(",")[0];
    if (!locations.some(l => lc(l.name.en) === lc(city))) locations = [...locations, { id: slug(city), name: B(city, t.label.zh.split("（")[0]), county: t.state ? countyOf(city, t.state) : B(t.label.en.split(",").pop()!.trim(), t.label.zh), state: "mapping" }];
  }
  return { ...w, stores, apps, locations };
}

/** The batched form's answers for stores already opened: each store's address, square footage and opening date, and
 *  every one of its applications filled again from them (lines already answered stay as they are). */
export function setLocationFacts(w: Workspace, byStore: Record<string, LocationFacts>): Workspace {
  let out = w;
  for (const [id, f] of Object.entries(byStore)) {
    const s = (out.stores ?? []).find(x => x.id === id);
    if (!s?.replica) continue;
    const src = sourceFacts(out, s.replica.source);
    const address = f.address?.trim() || s.address, sqft = f.sqft?.trim() || s.replica.sqft, opening = f.opening?.trim() || s.plannedOpen;
    const mine = out.apps.filter(a => (s.apps ?? []).includes(a.id));
    const filled = src ? fillFrom(mine, src, address, { address: /\d/.test(address) ? address : undefined, sqft }) : mine;
    const by = new Map(filled.map(a => [a.id, a]));
    out = {
      ...out,
      apps: out.apps.map(a => by.get(a.id) ?? a),
      stores: (out.stores ?? []).map(x => (x.id === id ? { ...x, address, ...(opening ? { plannedOpen: opening } : {}), replica: { ...x.replica!, ...(sqft ? { sqft } : {}) } } : x)),
    };
  }
  return out;
}

/** The words of the one approval card: what opening them does, in order. */
export function openDoes(r: Replication): Bi[] {
  const n = r.targets.length, apps = r.targets.reduce((t, x) => t + x.apps.length, 0);
  return [
    B(`Add ${n} new store${n === 1 ? "" : "s"}: ${r.targets.map(t => t.label.en).join(", ")}`, `新增 ${n} 家门店：${r.targets.map(t => t.label.zh).join("、")}`),
    B(`Create their ${apps} applications, prefilled from ${r.source.store.name.en}'s approved facts`, `创建 ${apps} 项申请，按${r.source.store.name.zh}已确认的资料预填`),
    B("Reuse the company's filings and documents by reference; nothing is filed again", "以引用方式沿用公司已有的申请和文件，不重复提交"),
    B("Ask you once for each location's address, square footage and opening date", "一次性请您填写每家门店的地址、面积和开业日期"),
    B("File nothing until each filing has its normal approval (or Autopilot within its caps)", "每项申请须经正常批准（或在自动驾驶限额内）后才提交"),
  ];
}

/** The plan in a compact form for Odelia (the model): each place's counts, fees, estimate and steps by group. */
export function replicationForModel(r: Replication, lang: "en" | "zh") {
  const line = (x: ReplicaRow) => [x.name[lang], x.agency[lang], x.kind === "new" ? (x.fee == null ? (lang === "zh" ? "费用未公布" : "fee not published") : `${x.fee} ${x.currency}`) : "", x.abstain ? (lang === "zh" ? "需向该机构确认" : "confirm with this agency") : ""].filter(Boolean).join(" | ");
  return {
    source_store: { id: r.source.store.id, name: r.source.store.name[lang], business: r.source.what, company: r.source.legal ?? null, formed_in: r.source.formedIn ?? null, formed_in_assumed: r.source.formedAssumed },
    places: r.targets.map(t => ({
      place: t.label[lang], coverage: COVERAGE_SAY[t.coverage][lang],
      licenses: t.counts.licenses, new_filings: t.counts.new, agency_fees: feesSay(t.fees)[lang], days_to_open: daysSay(t)[lang],
      opening_estimate: t.opening?.date ?? null, owner_touches: t.touches,
      same: t.rows.filter(x => x.kind === "same").map(line), covered_by_the_company: t.rows.filter(x => x.kind === "covered").map(line),
      new: t.rows.filter(x => x.kind === "new").map(line), not_needed_there: t.rows.filter(x => x.kind === "not_needed").map(line),
    })),
    could_not_place: r.unknown,
    placetta_price: priceSay(r)[lang],
  };
}
