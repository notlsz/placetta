// What a plan says beyond its permits to open, grouped the way Placetta's founder set as the standard (2026-10-23):
//
//   You may also need these                                   filings that turn on a condition, each said in words
//   Because you manufacture, your products may also need labels
//                                                             labels and product rules (Placetta lists, never certifies)
//   Your store and staff also need these                      posters, I-9, accessibility
//   An agency or a rule decides these                         Prop 65, tariff classification, wage ordinances, the bank
//
// each line with a numbered source footnote: the agency, its official link, the page's own words and the day they were
// read, or, where no official page could be read, that it isn't confirmed yet. Built from src/forms/lifecycle.ts with the
// same fail-closed rule as the plan rows (src/plan/ask.ts): a line states a fee only with a current quote. Pure, no model.
import { B, type Bi } from "../bi";
import type { Level } from "../model";
import { FORMS, type OfficialForm, type Segment } from "../forms/registry";
import { LIFECYCLE, type Have, type LifeItem, type LifeKind, type LifeStage } from "../forms/lifecycle";
import { KIND_FACTS } from "../forms/kinds";
import { isFurniture } from "../forms/furniture";
import { STATES } from "./line";
import { proofCurrent } from "./ask";

export type AlsoGroup = "also" | "labels" | "workplace" | "decides";
export type AlsoSource = { agency: Bi; url: string; quote?: string; read?: string };
export type AlsoRow = {
  id: string; group: AlsoGroup; stage: LifeStage; kind: LifeKind; level: Level;
  title: Bi; line: Bi; why: Bi; agency: Bi;
  verified: boolean;          // every source behind the line has a current quote from its official page
  sources: AlsoSource[];      // the footnotes
  fee: number | null;         // only when published and quoted
  form?: string; registry?: string; decides?: Bi; verify?: Bi; specialist?: Bi; renews?: Bi;
};

/* ------------------------------------------------------------------ what the business does, from its words */

const COSMETICS = /\bcosmetics?\b|skin ?care|\bmake-?up\b|\bbeauty\b|\blotions?\b|\bshampoos?\b|\bserums?\b|\blipsticks?\b|nail polish|personal care|\bperfumes?\b|\bfragrances?\b|化妆品|护肤|彩妆|美妆|个护/i;
const TEXTILE = /\bapparel\b|\bclothing\b|\bgarments?\b|\bt-?shirts?\b|\bdress(es)?\b|\btextiles?\b|\bbedding\b|\btowels?\b|\bsocks\b|\bhoodies\b|服装|纺织|衣服/i;
const MAKES = /manufactur|\bmakers?\b|\bfactory\b|\bfactories\b|\bwe make\b|make our own|\bworkshop\b|\bproducer\b|\bproduction\b|生产|工厂|制造|自产/i;
const ONLINE = /\bonline\b|e-?commerce|\bamazon\b|\bshopify\b|\betsy\b|tiktok shop|walmart marketplace|\bwebsite\b|direct[- ]to[- ]consumer|\bdtc\b|电商|网店|线上|跨境/i;
const KIDS = /\btoys?\b|\bkids?'?s?\b|\bchild(ren)?'?s?\b|\bbab(y|ies)\b|\binfants?\b|\btoddlers?\b|\bnursery\b|儿童|婴儿|玩具|宝宝/i;
const PACKAGED = /packaged|bottled|\bcanned\b|\bsnacks?\b|\bbagged\b|\bjarred\b|\bsauces?\b|\bcandy\b|wholesale|包装|零食|批发/i;

export const sellsCosmetics = (what: string) => COSMETICS.test(what);
export const makesProducts = (what: string) => MAKES.test(what);
export const sellsOnline = (what: string) => ONLINE.test(what);
export const childrensProducts = (what: string) => KIDS.test(what);

/** What the business does for the lifecycle's triggers: the plan's needs, the words, and the intake's answers. */
export function haveOf(what: string, segment: Segment, needs: { food?: boolean; employees?: boolean; imports?: boolean; newEntity?: boolean; foreignEntity?: boolean; foreignOwned?: boolean; corp?: boolean; upholstered?: boolean; clothingStorage?: boolean; children?: boolean; buildout?: boolean },
  o: { manufactures?: boolean; online?: boolean; mobile?: boolean } = {}): Have {
  const furniture = isFurniture(what), cosmetics = !furniture && sellsCosmetics(what), food = !!needs.food && !cosmetics;
  const manufactures = o.manufactures ?? makesProducts(what), online = o.online ?? sellsOnline(what);
  const imports = !!needs.imports;
  return {
    food, cosmetics, furniture, manufactures, online, imports,
    packagedFood: food && (manufactures || imports || segment === "seller" || segment === "warehouse" || PACKAGED.test(what)),
    upholstered: !!needs.upholstered, clothingStorage: !!needs.clothingStorage, children: !!needs.children || (!food && !cosmetics && childrensProducts(what)),
    textile: !food && !furniture && TEXTILE.test(what), consumer: !food && !cosmetics && segment !== "restaurant",
    employees: !!needs.employees, premises: segment !== "seller" && !o.mobile, newEntity: !!needs.newEntity, foreignEntity: !!needs.foreignEntity,
    // a US company owned 25% or more from abroad (never also a company formed abroad: that one is foreignEntity)
    foreignOwned: !!needs.foreignOwned && !needs.foreignEntity, corp: !!needs.corp,
  };
}

/* ------------------------------------------------------------------ the lines */

const at = (where: string | string[] | undefined, places: string[]) => (Array.isArray(where) ? where : where ? [where] : []).some(w => places.includes(w));
const applies = (i: LifeItem, have: Have, segment: Segment) => (i.needs ?? []).every(k => have[k]) && (!i.any?.length || i.any.some(k => have[k])) && !(i.unless ?? []).some(k => have[k])
  && (!i.segments || i.segments.includes(segment));
const money = (n: number) => `$${n.toLocaleString("en-US")}`;
const stateName = (code: string) => STATES.find(s => s[0] === code)?.[1] ?? code;
const ZH_STATE: Record<string, string> = { CA: "加州", NY: "纽约州", TX: "德州", FL: "佛罗里达州", MN: "明尼苏达州", OR: "俄勒冈州", OH: "俄亥俄州" };

/** The registry filing an item is, at this place: the first of its refs filed here. */
const filedAt = (f: OfficialForm, places: string[]) => places.includes(f.where) && f.where !== "US" && !(f.except ?? []).some(x => places.includes(x)) && (!f.currency || f.currency === "USD");
function refAt(i: LifeItem, places: string[]): OfficialForm | undefined {
  for (const id of i.refs ?? []) {
    const f = FORMS.find(x => x.id === id);
    if (f && (f.where === "US" ? places.includes("US") : filedAt(f, places))) return f;
  }
  if (!i.refsLike) return undefined;
  // a state the list doesn't name: its own filing of the same kind (for the company, the state's formation filing)
  const like = FORMS.filter(f => filedAt(f, places) && i.refsLike!.test(f.id) && (i.id !== "life-formation" || (!!f.needs?.newEntity && f.order <= 12 && f.id !== "ny-dos-pub")));
  return like.sort((a, b) => a.order - b.order)[0];
}

export function alsoFor(o: { places: string[]; segment: Segment; have: Have; today: string }): AlsoRow[] {
  const { places, segment, have, today } = o;
  const abroad = !places.includes("US");
  const rows: AlsoRow[] = [];
  for (const i of LIFECYCLE) {
    if (!applies(i, have, segment)) continue;
    // abroad, only what an item names for that country (California's "CA" is also Canada's code)
    if (abroad && (i.refs?.length || i.level !== "federal" || !at(i.where, places) || i.where === "US")) continue;
    const f = abroad ? undefined : refAt(i, places);
    if (i.refs?.length && !f && !i.where) continue;
    if (!f && !at(i.where, places)) continue;
    if ((i.except ?? []).some(x => places.includes(x))) continue;
    // the proof: the registry filing's, the kinds fact's, or the item's own
    const fact = i.fact ? KIND_FACTS.find(k => k.id === i.fact) : undefined;
    if (i.fact && !fact) continue;
    const proof = f?.proof ? { url: f.proof.read, quote: f.proof.quote } : fact ? { url: fact.proof.read, quote: fact.proof.quote } : i.source;
    const seen = proof?.quote ? proofCurrent({ read: proof.url, quote: proof.quote }, today) : undefined;
    const verified = !!seen;
    const url = proof?.url ?? f?.info ?? i.url ?? "";
    if (!url) continue;
    const fee = !verified ? null : f ? f.fee : i.fee ?? null;
    const agency = f?.agency ?? fact?.agency ?? i.agency;
    // the brackets: the item's own, or the form and its fee ("California LLC-1, $70")
    let detail: Bi | undefined = i.detail;
    if (i.id === "life-formation" && f) {
      const form = f.form.replace(/^Form\s+/i, "").replace(/\s*\(.*\)$/, "");
      const st = f.where;
      detail = B(`${stateName(st)} ${form}${fee != null ? `, ${fee === 0 ? "free" : money(fee)}` : ""}`, `${ZH_STATE[st] ?? st} ${form}${fee != null ? `，${fee === 0 ? "免费" : money(fee)}` : ""}`);
    } else if (!detail && i.kind === "filing" && fee != null) detail = fee === 0 ? B("free", "免费") : B(money(fee), money(fee));
    const group: AlsoGroup = i.kind === "filing" ? "also" : i.kind === "advisory" ? "decides" : i.stage === "sell" || i.stage === "online" ? "labels" : "workplace";
    // a license whose agency publishes no fee says so, as the founder's example does; not insurance, dues the
    // producer organization sets, or a filing whose agency explains its fee in words
    const unknownFee = i.kind === "filing" && fee == null && verified && !i.feeless && !f?.feeNote && f?.method !== "insurer";
    rows.push({
      id: i.id, group, stage: i.stage, kind: i.kind, level: f?.level ?? i.level, title: i.title, why: i.why, agency, verified,
      line: line(i.title, detail, (f && i.whenAt?.[f.where]) || i.when, unknownFee),
      sources: [{ agency, url, ...(verified ? { quote: proof!.quote, read: seen } : {}) }],
      fee, ...(i.form ? { form: i.form } : f ? { form: f.form } : {}), ...(f ? { registry: f.id } : {}), ...(i.decides ? { decides: i.decides } : {}), ...(i.verify ? { verify: i.verify } : {}),
      ...(i.specialist ? { specialist: i.specialist } : {}), ...(verified && (i.renews ?? f?.renews) ? { renews: i.renews ?? f!.renews } : {}),
    });
  }
  // California's company line carries the $800 annual LLC tax with it, as one line with both sources
  const form = rows.find(r => r.id === "life-formation" && r.registry === "ca-llc-1"), tax = rows.find(r => r.id === "ca-ftb-annual-tax");
  if (form && tax && tax.verified) {
    form.line = B(form.line.en.replace(/\)(?=, )/, ", plus the $800 annual LLC tax)"), form.line.zh.replace(/）(?=，)/, "，另加每年 800 美元 LLC 年度税）"));
    form.sources.push(...tax.sources);
    rows.splice(rows.indexOf(tax), 1);
  }
  return rows;
}

function line(title: Bi, detail: Bi | undefined, when: Bi | undefined, unknownFee: boolean): Bi {
  const closes = /\)$/.test(title.en);
  const en = `${title.en}${detail ? (closes ? `, ${detail.en}` : ` (${detail.en})`) : ""}${when ? `, ${when.en}` : ""}.${unknownFee ? " Fee not confirmed." : ""}`;
  const zh = `${title.zh}${detail ? (/）$/.test(title.zh) ? `，${detail.zh}` : `（${detail.zh}）`) : ""}${when ? `，${when.zh}` : ""}。${unknownFee ? "费用尚未确认。" : ""}`;
  return B(en, zh);
}

/* ------------------------------------------------------------------ the headings and the text */

export const GROUPS: AlsoGroup[] = ["also", "labels", "workplace", "decides"];
/** A group's heading. Labels say why: the business makes, imports or sells the products. */
export function heading(g: AlsoGroup, have: Have): Bi {
  if (g === "also") return B("You may also need these", "您可能还需要办理这些");
  if (g === "workplace") return B("Your store and staff also need these", "门店和员工还需要做到这些");
  if (g === "decides") return B("An agency or a rule decides these", "以下事项由机构或规则决定");
  return have.manufactures ? B("Because you manufacture, your products may also need labels", "因为您自己生产，产品可能还需要这些标签")
    : have.imports ? B("Because you import, your products may also need labels", "因为您进口商品，产品可能还需要这些标签")
    : B("Because you sell products, they may also need labels", "因为您销售商品，产品可能还需要这些标签");
}

/** One footnote: the agency, its link, and the page's words with the day read, or that it isn't confirmed yet. */
export function footnote(s: AlsoSource, lang: "en" | "zh"): string {
  if (lang === "zh") return s.quote ? `${s.agency.zh}：${s.url}，原文“${s.quote}”（${s.read} 读取）` : `${s.agency.zh}：${s.url}。尚未在官方页面上确认，Odelia 会先向该机构核实。`;
  return s.quote ? `${s.agency.en}: ${s.url}, "${s.quote}" (read ${s.read})` : `${s.agency.en}: ${s.url}. Not confirmed on an official page yet; Odelia checks with them first.`;
}

/** The plan's extra lines as text, in the founder's format: a heading, one line per item with its footnote numbers,
    then the footnotes. No bullets: each line stands on its own. */
export function alsoText(rows: AlsoRow[], have: Have, lang: "en" | "zh"): string {
  const notes: string[] = [];
  const out: string[] = [];
  for (const g of GROUPS) {
    const mine = rows.filter(r => r.group === g);
    if (!mine.length) continue;
    out.push("", heading(g, have)[lang]);
    for (const r of mine) {
      const ns = r.sources.map(s => { const t = footnote(s, lang); let k = notes.indexOf(t); if (k < 0) { notes.push(t); k = notes.length - 1; } return `[${k + 1}]`; });
      out.push(`${r.line[lang]} ${ns.join("")}`);
    }
  }
  if (!out.length) return "";
  out.push("", lang === "zh" ? "来源" : "Sources", ...notes.map((t, k) => `[${k + 1}] ${t}`));
  return out.join("\n").trim();
}
