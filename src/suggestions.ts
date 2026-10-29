import type { Lang } from "./i18n";
import type { Workspace } from "./model";
import { FORMS, placesOf } from "./forms/registry";
import { CITIES as WORLD_CITIES, COUNTRIES, unaccent } from "./forms/world";
import { COUNTIES } from "./forms/usplace";
import { CITIES as LINE_CITIES, SELLS, STATES, ZH_CITIES } from "./plan/line";
import { stateName } from "./plan/preview";
import { BUSINESS_KINDS } from "./plan/prefill";

/* Suggestions for the app's text fields, the way Airbnb's search box suggests places: what's typed is matched against
   lists the app already holds (the registry's places and agencies, the business kinds and their NAICS codes, the
   states and countries, the workspace's own facts and earlier answers, and what this viewer typed before), never
   anything made up and never a call to anyone. The list itself is drawn by src/Suggest.tsx. */

export type SugIcon = "place" | "kind" | "fact" | "recent" | "agency" | "state" | "country" | "entity" | "person" | "option";
export type Sug = { id: string; label: string; value: string; sub?: string; icon: SugIcon; keys?: string[] };
/** What a field suggests for what's typed so far ("" when it's empty). */
export type Source = (q: string) => Sug[];

export const MAX = 6;

/** Folded for matching: no accents, no case, no punctuation, single spaces. */
export const fold = (s: string) => unaccent(s).toLowerCase().replace(/[.,，、()（）'’]/g, " ").replace(/\s+/g, " ").trim();

/** How well a row matches: 3 a key starts with it, 2 a word in a key starts with it, 1 every typed word starts a word
 *  in one key, 0 no match. */
export function score(q: string, keys: string[]): number {
  const f = fold(q);
  if (!f) return 1;
  const ks = keys.map(fold).filter(Boolean);
  if (ks.some(k => k.startsWith(f))) return 3;
  if (ks.some(k => k.includes(" " + f))) return 2;
  // Chinese has no spaces between words: anywhere in the key counts
  if (/[㐀-鿿]/.test(f) && ks.some(k => k.includes(f))) return 2;
  const ws = f.split(" ");
  if (ws.length > 1 && ks.some(k => ws.every(w => k.startsWith(w) || k.includes(" " + w)))) return 1;
  return 0;
}

/** Best matches first, the list's own order breaking ties. */
export function rank(q: string, rows: Sug[], max = MAX): Sug[] {
  const out: { s: Sug; n: number; i: number }[] = [];
  rows.forEach((s, i) => { const n = score(q, [s.label, s.value, ...(s.keys ?? [])]); if (n > 0) out.push({ s, n, i }); });
  return out.sort((a, b) => b.n - a.n || a.i - b.i).slice(0, max).map(x => x.s);
}

/** Where the typed text sits in a label, for drawing it bold: [start, end), or null. */
export function matchIn(label: string, q: string): [number, number] | null {
  const t = q.trim();
  if (!t) return null;
  const l = label.toLowerCase(), w = t.toLowerCase();
  let i = l.startsWith(w) ? 0 : l.indexOf(" " + w) >= 0 ? l.indexOf(" " + w) + 1 : /[㐀-鿿]/.test(w) ? l.indexOf(w) : -1;
  if (i < 0) {
    // accents: "cancun" in "Cancún" (each accented letter folds to one, so the places line up)
    const fl = unaccent(label).toLowerCase(), fw = unaccent(t).toLowerCase();
    if (fl.length === label.length) i = fl.startsWith(fw) ? 0 : fl.indexOf(" " + fw) >= 0 ? fl.indexOf(" " + fw) + 1 : -1;
  }
  return i < 0 ? null : [i, i + t.length];
}

const dedupe = (rows: Sug[]) => { const seen = new Set<string>(); return rows.filter(s => { const k = fold(s.value); if (seen.has(k)) return false; seen.add(k); return true; }); };

/* ------------------------------------------------------------------ recent entries (this viewer's browser only) */

const KEY = "pc-recent:";
const mem = new Map<string, string[]>();
/** What this viewer typed or picked in a field before, newest first. Storage that refuses reads or writes falls back to
 *  this tab's memory, so the field still works. */
export function recents(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + key) ?? "null");
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 5);
  } catch { /* blocked or broken: memory below */ }
  return mem.get(key) ?? [];
}
export function remember(key: string, value: string) {
  const v = value.trim().replace(/\s+/g, " ").slice(0, 120);
  if (!v) return;
  const list = [v, ...recents(key).filter(x => fold(x) !== fold(v))].slice(0, 5);
  mem.set(key, list);
  try { localStorage.setItem(KEY + key, JSON.stringify(list)); } catch { /* memory has it */ }
}
export const recentRows = (key: string, lang: Lang, q = ""): Sug[] =>
  recents(key).filter(v => !q.trim() || score(q, [v]) > 0).map(v => ({ id: "r:" + v, label: v, value: v, icon: "recent", sub: lang === "zh" ? "最近" : "Recent" }));

/* ------------------------------------------------------------------ places */

type PlaceKind = "city" | "world" | "county" | "state";
type PlaceRow = { kind: PlaceKind; value: string; short: string; en: string; zh: string; keys: string[] };
let PLACES: PlaceRow[] | null = null;
const zhState = (st?: string) => (st ? stateName(st)?.zh ?? st : "");
function places(): PlaceRow[] {
  if (PLACES) return PLACES;
  const rows: PlaceRow[] = [];
  // the registry's cities: US ones as "City, ST", the rest with their country
  for (const c of WORLD_CITIES) {
    if (c.country === "US") {
      const st = c.state ?? "";
      rows.push({ kind: "city", value: st ? `${c.en}, ${st}` : c.en, short: c.en, en: st ? `${c.en}, ${st}` : c.en, zh: zhState(st) + c.zh, keys: [c.en, c.zh, ...c.aliases] });
    } else {
      const n = COUNTRIES.find(x => x.code === c.country);
      rows.push({ kind: "world", value: n ? `${c.en}, ${n.en}` : c.en, short: c.en, en: n ? `${c.en}, ${n.en}` : c.en, zh: (n?.zh ?? "") + c.zh, keys: [c.en, c.zh, ...c.aliases] });
    }
  }
  // the cities the first screen suggests, with how the plan names them in Chinese
  for (const v of LINE_CITIES) {
    const city = v.split(",")[0].trim();
    const zh = ZH_CITIES.find(x => x[1] === v)?.[2];
    rows.push({ kind: "city", value: v, short: city, en: v, zh: zh ?? v, keys: [city, ...(zh ? [zh] : [])] });
  }
  for (const c of Object.values(COUNTIES)) rows.push({ kind: "county", value: `${c.en}, ${c.state}`, short: c.en, en: `${c.en}, ${c.state}`, zh: zhState(c.state) + c.zh, keys: [c.en, c.zh] });
  for (const [code, en] of STATES) rows.push({ kind: "state", value: en, short: en, en, zh: stateName(code)?.zh ?? en, keys: [en, code, stateName(code)?.zh ?? ""] });
  const seen = new Set<string>();
  PLACES = rows.filter(r => { const k = fold(r.value); if (seen.has(k)) return false; seen.add(k); return true; });
  return PLACES;
}

const counts = new Map<string, number>();
/** How many licenses, permits and registrations the registry maps for a place (its own, its county's and its state's;
 *  the federal ones every US business shares are left out). */
export function mappedAt(place: string): number {
  const k = fold(place);
  const hit = counts.get(k);
  if (hit !== undefined) return hit;
  const at = new Set(placesOf(place).filter(w => w !== "US"));
  const n = at.size ? FORMS.filter(f => at.has(f.where)).length : 0;
  counts.set(k, n);
  return n;
}
export const mappedLine = (n: number, lang: Lang) => (lang === "zh" ? `已收录 ${n} 项许可` : `${n} license${n === 1 ? "" : "s"} mapped`);

/** Cities, counties, states and countries the registry covers, each with how many licenses it maps. `short`: the city's
 *  name alone, for a list of cities typed one after another. `extra`: the workspace's own places, offered first.
 *  `only`: some kinds of place (a store's city box takes a US city, not a state). */
export function placeSource(lang: Lang, o: { short?: boolean; extra?: string[]; only?: PlaceKind[] } = {}): Source {
  return q => {
    if (!q.trim()) return [];
    const own: Sug[] = (o.extra ?? []).map(v => ({ id: "w:" + v, label: v, value: v, icon: "place" as const }));
    const rows = places().filter(r => !o.only || o.only.includes(r.kind)).map((r): Sug => ({ id: "p:" + r.value, label: lang === "zh" ? r.zh : r.en, value: o.short ? r.short : r.value, icon: "place", keys: [r.en, r.zh, ...r.keys] }));
    return dedupe(rank(q, [...own, ...rows], MAX + 2)).slice(0, MAX).map(s => { const n = mappedAt(s.id.startsWith("p:") ? s.id.slice(2) : s.value); return n ? { ...s, sub: mappedLine(n, lang) } : s; });
  };
}

/* ------------------------------------------------------------------ business kinds and NAICS */

const KIND_ZH: Record<string, string> = {
  "Furniture store": "家具店", "Milk tea shop": "奶茶店", "Coffee shop": "咖啡店", Bakery: "烘焙店", "Dessert shop": "甜品店", "Hot pot restaurant": "火锅店",
  Restaurant: "餐厅", "Grocery store": "超市", Warehouse: "仓库或第三方物流", "Online seller": "进口商或电商卖家",
};
type KindRow = { en: string; zh: string; naics?: [string, string]; re?: RegExp };
let KINDS_: KindRow[] | null = null;
function kinds(): KindRow[] {
  if (KINDS_) return KINDS_;
  const rows: KindRow[] = BUSINESS_KINDS.map(([re, k]) => ({ en: k.activity, zh: KIND_ZH[k.activity] ?? k.activity, naics: k.naics, re }));
  // the first screen's other kinds (mattresses, cleaning products, packaged food), when no row above already reads them
  for (const s of SELLS) if (!rows.some(r => r.re?.test(s.en))) rows.push({ en: s.en, zh: s.zh });
  rows.push({ en: "Retail store", zh: "零售店" });
  return (KINDS_ = rows);
}
/** Kinds of business, matched by their words ("milk tea" finds the milk tea shop, "boba" too), each with its NAICS
 *  code where the registry has one. `naics`: the field wants the code and its title. */
export function kindSource(lang: Lang, o: { naics?: boolean } = {}): Source {
  return q => {
    const rows = kinds().filter(k => !o.naics || k.naics);
    const as = (k: KindRow): Sug => {
      const code = k.naics ? `${k.naics[0]} ${k.naics[1]}` : undefined;
      return { id: "k:" + k.en, label: lang === "zh" ? k.zh : k.en, value: o.naics ? code! : lang === "zh" ? k.zh : k.en, sub: code, icon: "kind", keys: [k.en, k.zh, ...(k.naics ?? [])] };
    };
    if (!q.trim()) return o.naics ? dedupe(rows.map(as)).slice(0, MAX) : [];
    // by name first, then by what the words mean (the same patterns that read a signup's line)
    const named = rank(q, rows.map(as), MAX);
    const meant = q.trim().length >= 3 ? rows.filter(k => k.re?.test(q)).map(as) : [];
    return dedupe([...named, ...meant]).slice(0, MAX);
  };
}

/* ------------------------------------------------------------------ agencies */

let AGENCIES: { en: string; zh: string; n: number; acr: string }[] | null = null;
const acronym = (s: string) => s.split(/[\s,]+/).filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join("");
function agencies() {
  if (AGENCIES) return AGENCIES;
  const by = new Map<string, { en: string; zh: string; n: number; acr: string }>();
  for (const f of FORMS) {
    const k = fold(f.agency.en);
    const a = by.get(k);
    if (a) a.n++;
    else by.set(k, { en: f.agency.en, zh: f.agency.zh, n: 1, acr: acronym(f.agency.en) });
  }
  return (AGENCIES = [...by.values()].sort((a, b) => b.n - a.n));
}
/** Agencies: the workspace's own first, then every agency the registry maps, by name, Chinese name or initials
 *  ("CDTFA"). */
export function agencySource(lang: Lang, ws?: Workspace): Source {
  return q => {
    if (!q.trim()) return [];
    const own = (ws?.apps ?? []).map(a => a.agency);
    const rows: Sug[] = [
      ...own.map(a => ({ id: "wa:" + a.en, label: lang === "zh" ? a.zh : a.en, value: lang === "zh" ? a.zh : a.en, icon: "agency" as const, keys: [a.en, a.zh, acronym(a.en)] })),
      ...agencies().map(a => ({ id: "a:" + a.en, label: lang === "zh" ? a.zh : a.en, value: lang === "zh" ? a.zh : a.en, sub: mappedLine(a.n, lang), icon: "agency" as const, keys: [a.en, a.zh, a.acr] })),
    ];
    return dedupe(rank(q, rows, MAX + 4)).slice(0, MAX);
  };
}

/* ------------------------------------------------------------------ fixed lists (pickers) */

/** The US states and DC. `code`: the value is the two letters ("CA"); otherwise the name. */
export function stateSource(lang: Lang, o: { code?: boolean } = {}): Source {
  const rows = STATES.map(([code, en]): Sug => ({ id: "s:" + code, label: lang === "zh" ? stateName(code)?.zh ?? en : en, value: o.code ? code : en, sub: code, icon: "state", keys: [en, code, stateName(code)?.zh ?? ""] }));
  return q => (q.trim() ? rank(q, rows, 60) : rows);
}
export function countrySource(lang: Lang): Source {
  const rows = COUNTRIES.map((c): Sug => ({ id: "c:" + c.code, label: lang === "zh" ? c.zh : c.en, value: c.en, sub: c.code, icon: "country", keys: [c.en, c.zh, c.code] }));
  return q => (q.trim() ? rank(q, rows, 60) : rows);
}
/** The kinds of company the IRS's EIN application lists first. */
const ENTITIES: [string, string][] = [["Limited liability company", "有限责任公司"], ["Corporation", "股份有限公司"], ["Sole proprietorship", "个人独资企业"], ["Partnership", "合伙企业"]];
export function entitySource(lang: Lang): Source {
  const rows = ENTITIES.map(([en, zh]): Sug => ({ id: "e:" + en, label: lang === "zh" ? zh : en, value: en, sub: en === "Limited liability company" ? "LLC" : undefined, icon: "entity", keys: [en, zh, ...(en.startsWith("Limited") ? ["LLC"] : en === "Corporation" ? ["Inc", "Corp"] : [])] }));
  return q => (q.trim() ? rank(q, rows, 10) : rows);
}
/** Titles a person signs with on a filing. */
const TITLES: [string, string][] = [["Owner", "所有人"], ["Managing Member", "管理成员"], ["Member", "成员"], ["President", "总裁"], ["CEO", "首席执行官"], ["Manager", "经理"], ["Secretary", "秘书"]];
export function titleSource(lang: Lang): Source {
  const rows = TITLES.map(([en, zh]): Sug => ({ id: "t:" + en, label: lang === "zh" ? `${zh}（${en}）` : en, value: en, icon: "person", keys: [en, zh] }));
  return q => (q.trim() ? rank(q, rows, MAX) : []);
}

/* ------------------------------------------------------------------ the workspace's own facts and earlier answers */

type FieldKind = "legal" | "address" | "ein" | "sell" | "person";
const FIELD: [RegExp, FieldKind][] = [
  [/\b(f?ein|tax id|employer identification)\b|税号/i, "ein"],
  [/legal name|business name|company name|entity name|法定名称|企业名称|公司名称/i, "legal"],
  [/address|street|storefront|地址|门店/i, "address"],
  [/what you sell|\bsells\b|销售内容/i, "sell"],
  [/owner|signer|your (full )?name|full name|responsible party|姓名|所有人|签署人/i, "person"],
];
const FACT: Record<FieldKind, RegExp> = { legal: /^legal name$/i, address: /^(storefront|address|store address)$/i, ein: /^ein$/i, sell: /^what you sell$/i, person: /^owner$/i };
const EIN = /^\d{2}-\d{7}$/;
const PERSON = /^[A-Z][a-zA-Z.'-]+( [A-Z][a-zA-Z.'-]+)+$|^[㐀-鿿]{2,4}$/;
export const fieldKind = (label: string): FieldKind | undefined => FIELD.find(([re]) => re.test(label))?.[1];

/** One-tap fills from what the workspace already holds: its business facts, its stores' addresses, and the same line
 *  answered on its other applications. Masked and malformed values (an EIN that isn't NN-NNNNNNN, an owner that isn't
 *  a name) are left out; nothing is made up. */
export function factSource(ws: Workspace, label: string, lang: Lang, o: { kind?: FieldKind } = {}): Source {
  const kind = o.kind ?? fieldKind(label);
  const ok = (v: string) => !!v.trim() && !/[•*]/.test(v) && (kind !== "ein" || EIN.test(v.trim())) && (kind !== "person" || PERSON.test(v.trim()));
  const rows: Sug[] = [];
  const from = (s: string) => (lang === "zh" ? `来自${s}` : `From ${s}`);
  if (kind) for (const f of ws.facts) if (FACT[kind].test(f.label.en)) {
    const v = lang === "zh" ? f.value.zh : f.value.en;
    if (ok(v)) rows.push({ id: "f:" + f.id, label: v, value: v, sub: lang === "zh" ? "企业资料" : "Business facts", icon: kind === "person" ? "person" : "fact" });
  }
  if (kind === "address") for (const s of ws.stores ?? []) if (ok(s.address)) rows.push({ id: "st:" + s.id, label: s.address, value: s.address, sub: lang === "zh" ? s.name.zh : s.name.en, icon: "place" });
  if (kind === "legal" && ws.meta?.entity && ok(ws.meta.entity)) rows.push({ id: "m:entity", label: ws.meta.entity, value: ws.meta.entity, sub: lang === "zh" ? "工作区" : "Workspace", icon: "fact" });
  // earlier answers: the same line on the workspace's other applications
  const want = fold(label);
  for (const a of ws.apps) for (const f of a.fields) {
    if (!f.value || !ok(f.value)) continue;
    const same = fold(f.label.en) === want || fold(f.label.zh) === want || (!!kind && fieldKind(f.label.en) === kind);
    if (same) rows.push({ id: `af:${a.id}:${f.id}`, label: f.value, value: f.value, sub: from(lang === "zh" ? a.name.zh : a.name.en), icon: "fact" });
  }
  const all = dedupe(rows);
  return q => (q.trim() ? rank(q, all, MAX) : all.slice(0, MAX));
}

/** Several sources in one list, in order, with no value twice. */
export const merge = (...sources: Source[]): Source => q => dedupe(sources.flatMap(s => s(q))).slice(0, MAX);

/** The choices a form prints for a line (its boxes to tick), as a fixed list. */
export function optionSource(options: string[]): Source {
  const rows = options.map((o): Sug => ({ id: "o:" + o, label: o, value: o, icon: "option" }));
  return q => (q.trim() ? rank(q, rows, 60) : rows);
}

/** What a form's line suggests, from the form itself and its label: the boxes the form prints, as a fixed list; a
 *  NAICS code by the kind of business; a kind of company or a country from a fixed list; a state by name; and
 *  otherwise the workspace's own facts and earlier answers. */
export function fieldSource(ws: Workspace, label: string, lang: Lang, options?: string[]): { source: Source; fixed?: boolean } {
  if (options && options.length > 1) return { source: optionSource(options), fixed: true };
  if (/naics/i.test(label)) return { source: merge(factSource(ws, label, lang), kindSource(lang, { naics: true })) };
  if (/^(entity|ownership|organization|taxpayer) type|type of (entity|organization)|实体类型|所有权类型/i.test(label)) return { source: entitySource(lang), fixed: true };
  if (/^country\b|country of (formation|incorporation|citizenship)|国家/i.test(label)) return { source: countrySource(lang), fixed: true };
  if (/^state\b.*\b(incorporation|organization|formation)\b|^state of (incorporation|organization|formation)/i.test(label)) return { source: merge(factSource(ws, label, lang), stateSource(lang)) };
  return { source: factSource(ws, label, lang) };
}
