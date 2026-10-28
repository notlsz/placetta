// Company formation and foreign qualification in all 50 states and DC: for each state, the LLC's formation, the
// corporation's formation, and the registration of a company formed elsewhere (another state or another country) to do
// business there, for an LLC and for a corporation. Each row is the Secretary of State's (or the equivalent office's)
// own filing: its form, fee, how it's filed and the portal, the standard processing time, the paid expedite tiers, the
// registered agent rule and the recurring report Odelia renews. Plus the one federal row: the S corporation election
// (IRS Form 2553), a library reference that is never added to a plan on its own.
//
// Same rules as every layer of the library (src/forms/verify.ts): each fact is backed by a sentence of under 25 words
// copied from the official page (a .gov or official Secretary of State site, or the official statute), with the URL
// read and the day; each was found on the fetched page by the matcher in scripts/eval/proof-read.py before it was
// written here. Nothing is stated that a page didn't state: a state whose page couldn't be read keeps its row
// UNVERIFIED with the reason (`blocked`), no fee and no time, and its plan row abstains and names the office.
//
// The data is in src/forms/entity-data.ts. Rows the library already had (California's LLC-1, Texas's Form 205, the
// generic Secretary of State rows in world.ts) are enriched in place, keeping their ids, maps and destinations; the
// rest are new entries, ids `<st>-<llc|corp>-<form|qualify>`.
import { B, type Bi } from "../bi";
import type { EntityAction, EntityFiling, EntityKind, Expedite, FactSource, Method, Needs, OfficialForm, Processing, Segment } from "./registry";

export const READ_ENT = "2026-10-27";
export type T = readonly [string, string];
/** [the page read, the sentence as written there] */
export type Q = readonly [string, string];
const ALL: Segment[] = ["restaurant", "retail", "seller", "warehouse"];
const b = (t: T): Bi => B(t[0], t[1]);
export const src = (q: Q, checked = READ_ENT): FactSource => ({ url: q[0], quote: q[1], checked });

/* ------------------------------------------------------------------ expedite tiers */
export type TierCode = "1h" | "2h" | "4h" | "same" | "24h" | "next" | "custom";
const TIERS: Record<Exclude<TierCode, "custom">, { label: T; turn: T; hours: number }> = {
  "1h": { label: ["1-hour", "1 小时加急"], turn: ["within 1 hour", "1 小时内办结"], hours: 1 },
  "2h": { label: ["2-hour", "2 小时加急"], turn: ["within 2 hours", "2 小时内办结"], hours: 2 },
  "4h": { label: ["4-hour", "4 小时加急"], turn: ["within 4 hours", "4 小时内办结"], hours: 4 },
  same: { label: ["Same day", "当日加急"], turn: ["the same business day", "当个工作日办结"], hours: 8 },
  "24h": { label: ["24-hour", "24 小时加急"], turn: ["within 24 hours", "24 小时内办结"], hours: 24 },
  next: { label: ["Next day", "次日加急"], turn: ["the next business day", "下一个工作日办结"], hours: 24 },
};
/** [tier, fee in USD on top of the filing fee, the sentence that states it, a note (where it can be asked for)] */
export type Tier = readonly [Exclude<TierCode, "custom">, number | null, Q, T?];
/** A tier the codes don't name: its own label, turnaround and hours. */
export type CustomTier = { label: T; turn: T; hours: number | null; fee: number | null; q: Q; note?: T };
const tier = (x: Tier | CustomTier): Expedite => {
  if (!Array.isArray(x)) {
    const c = x as CustomTier;
    return { label: b(c.label), feeUsd: c.fee, turnaround: b(c.turn), hours: c.hours, source: src(c.q), ...(c.note ? { note: b(c.note) } : {}) };
  }
  const [code, fee, q, note] = x as Tier, t = TIERS[code];
  return { label: b(t.label), feeUsd: fee, turnaround: b(t.turn), hours: t.hours, source: src(q), ...(note ? { note: b(note) } : {}) };
};

/* ------------------------------------------------------------------ a state's data */
/** [calendar days, as the page says it in English, in Chinese, the sentence] */
export type P = readonly [number | null, string, string, Q];
export type Report = { name: T; fee: number | null; due: T; q?: Q; feeQ?: Q };
export type Row = {
  /** the library's entry for it already (enriched in place) */
  id?: string;
  /** the document's name ("Articles of Organization") and its Chinese */
  doc?: T;
  /** the form as the agency prints it, with its number ("Form LLC-1, Articles of Organization") */
  form?: string;
  fee?: number | null; feeNote?: T;
  /** the sentence that states the fee (or, without a fee, the filing) */
  proof?: Q;
  method?: Method; url?: string;
  p?: P | null; x?: (Tier | CustomTier)[] | null;
  report?: Report | null;
  agent?: Q | null;
  blocked?: string; loginOnly?: boolean;
  /** the entry's own proof is no longer on its page (a re-read didn't find it): this pass's proof replaces it */
  replaceProof?: boolean;
};
export type Key = "llc-form" | "llc-qualify" | "corp-form" | "corp-qualify";
export type StateData = {
  st: string; name: T; agency: T;
  /** the code the library files the state's rows under, when it isn't the postal code (Louisiana: "LOU", since "LA" is
      the City of Los Angeles in src/forms/registry.ts placesOf) */
  where?: string;
  /** the office's own site (linked when a row has nothing better) and the filing portal */
  site: string; portal?: string;
  method?: Method; loginOnly?: boolean;
  p?: P; x?: (Tier | CustomTier)[];
  /** the sentence that says a company keeps a registered agent in the state; agentRequired false (New York: the
      Secretary of State is the agent for process) with its note */
  agent?: Q; agentRequired?: boolean; agentNote?: T;
  report?: { llc?: Report; corp?: Report };
  /** why rows without their own proof stay UNVERIFIED (VERIFY_BLOCKED style) */
  blocked?: string;
  /** why no processing time or expedite tier is stated for the state's verified rows */
  speedBlocked?: string;
  rows: Partial<Record<Key, Row>>;
};

const DOC: Record<Key, T> = {
  "llc-form": ["Articles of Organization", "组织章程"], "corp-form": ["Articles of Incorporation", "公司章程"],
  "llc-qualify": ["Application for Registration", "外州公司注册申请"], "corp-qualify": ["Application for Certificate of Authority", "营业授权证书申请"],
};
const KEYS: Key[] = ["llc-form", "corp-form", "llc-qualify", "corp-qualify"];
const kindOf = (k: Key): EntityKind => (k.startsWith("llc") ? "llc" : "corp");
const actOf = (k: Key): EntityAction => (k.endsWith("form") ? "form" : "qualify");

function title(k: Key, s: StateData, doc: T): Bi {
  const [en, zh] = s.name, [d, dz] = doc;
  switch (k) {
    case "llc-form": return B(`LLC formation in ${en} (${d})`, `在${zh}设立 LLC（${dz}）`);
    case "corp-form": return B(`Corporation formation in ${en} (${d})`, `在${zh}设立股份公司（${dz}）`);
    case "llc-qualify": return B(`Registration of an out-of-state LLC in ${en} (${d})`, `外州 LLC 在${zh}注册（${dz}）`);
    default: return B(`Registration of an out-of-state corporation in ${en} (${d})`, `外州股份公司在${zh}注册（${dz}）`);
  }
}
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; } };
function how(method: Method, portal: string | undefined, login: boolean, blocked: boolean): Bi {
  if (blocked) return B("Filed with the state's business filing office. Odelia reads its page and confirms the form, the fee and how it's filed before anything is prepared.", "向州商业登记机构提交。准备材料前，Odelia 会查阅其官方页面，核实表格、费用和提交方式。");
  const acct = login ? B(" (an account is needed)", "（需注册账户）") : B("", "");
  if (method === "pdf_mail") return B("Filed on the paper form by mail or in person.", "以纸质表格邮寄或现场提交。");
  const h = portal ? host(portal) : "the state's portal";
  return B(`Filed online at ${h}${acct.en}, or on the paper form by mail.`, `在 ${h} 在线提交${acct.zh}，或以纸质表格邮寄。`);
}
const PLAIN: Record<"form" | "qualify", T> = {
  form: ["Creates the company with the state; its name and number go on the EIN and every other filing.", "在州政府成立公司；公司名称和编号会用于 EIN 及其他所有申请。"],
  qualify: ["Registers a company formed in another state or country to do business in this one.", "为在其他州或国家成立的公司办理在本州经营的登记。"],
};
function needsOf(k: Key): { needs: Needs; unless?: (keyof Needs)[] } {
  const corp = kindOf(k) === "corp";
  const base: Needs = actOf(k) === "form" ? { newEntity: true } : { foreignEntity: true };
  return corp ? { needs: { ...base, corp: true } } : { needs: base, unless: ["corp"] };
}

function processing(p: P | undefined | null): Processing | undefined {
  return p ? { standard: B(p[1], p[2]), days: p[0], source: src(p[3]) } : undefined;
}
function report(r: Report | undefined | null): EntityFiling["report"] {
  return r ? { name: b(r.name), feeUsd: r.fee, due: b(r.due), ...(r.q ? { source: src(r.q) } : {}), ...(r.feeQ ? { feeSource: src(r.feeQ) } : {}) } : undefined;
}

/** What one row is, as built from its state's data: the new entry (when the library has none), or the facts to put on
    the library's own entry. */
export type Built = { key: Key; st: string; existing?: string; form: OfficialForm; replaceProof?: boolean };
export function buildState(s: StateData): Built[] {
  const out: Built[] = [];
  for (const k of KEYS) {
    const r: Row = s.rows[k] ?? {};
    const kind = kindOf(k), action = actOf(k);
    const blocked = r.proof ? undefined : r.blocked ?? s.blocked ?? "No official page read for this filing yet.";
    const p = r.p === null ? undefined : processing(r.p ?? s.p);
    const x = r.x === null ? [] : (r.x ?? s.x ?? []).map(tier);
    const rep = r.report === null ? undefined : report(r.report ?? s.report?.[kind]);
    const agentQ = r.agent === null ? undefined : r.agent ?? s.agent;
    const entity: EntityFiling = {
      kind, action,
      ...(agentQ || s.agentRequired === false ? { agent: { required: s.agentRequired ?? true, ...(agentQ ? { source: src(agentQ) } : {}), ...(s.agentNote ? { note: b(s.agentNote) } : {}) } } : {}),
      ...(rep ? { report: rep } : {}),
      ...(blocked ? { blocked } : {}),
      ...((r.loginOnly ?? s.loginOnly) ? { loginOnly: true } : {}),
      ...(s.speedBlocked && !p && !x.length ? { speedBlocked: s.speedBlocked } : {}),
    };
    const method: Method = r.method ?? s.method ?? "online";
    const doc = r.doc ?? DOC[k];
    const url = r.url ?? s.portal ?? s.site;
    const { needs, unless } = needsOf(k);
    const f: OfficialForm = {
      id: r.id ?? `${s.st.toLowerCase()}-${kind}-${action}`,
      form: r.form ?? doc[0], title: title(k, s, doc), agency: b(s.agency), level: "state", where: s.where ?? s.st, segments: ALL, needs, ...(unless ? { unless } : {}),
      method, how: how(method, s.portal, !!(r.loginOnly ?? s.loginOnly), !!blocked), url, info: r.proof?.[0] ?? s.site,
      fee: blocked ? null : r.fee ?? null, currency: "USD", ...(r.feeNote && !blocked ? { feeNote: b(r.feeNote) } : {}),
      ...(p ? { takes: p.standard, takesDays: p.days, takesSource: `${p.source.url} (${p.source.checked})` } : {}),
      ...(rep ? { renews: B(`${rep.name.en}: ${rep.due.en}`, `${rep.name.zh}：${rep.due.zh}`) } : {}),
      fields: [], checked: r.proof ? "page" : "known", order: 12, plain: b(PLAIN[action as "form" | "qualify"]),
      ...(r.proof ? { proof: { read: r.proof[0], quote: r.proof[1], checked: READ_ENT } } : {}),
      ...(p ? { processing: p } : {}), ...(x.length ? { expedite: x } : {}), entity,
    };
    out.push({ key: k, st: s.st, existing: r.id, form: f, ...(r.replaceProof ? { replaceProof: true } : {}) });
  }
  return out;
}

/** The S corporation election: federal, for a corporation (or an LLC taxed as one) whose shareholders all qualify. A
    library reference: never added to a plan on its own, since it's a tax choice for the owners and their accountant,
    and a company with a foreign (nonresident alien) shareholder can't make it. */
export function sElection(forms: OfficialForm[], q: { foreign: Q; due: Q }): string[] {
  const f = forms.find(x => x.id === "irs-2553");
  if (!f) return ["irs-2553"];
  // a reference only: never added to a plan, and only ever shown for a corporation
  f.needs = { ...(f.needs ?? {}), corp: true, reference: true };
  f.foreign = B("Not available when any shareholder is a nonresident alien, so a company owned from China can't elect S status.", "任何股东为非居民外国人时不可选择，因此由中国股东持有的公司不能选择 S 型公司。");
  f.entity = {
    kind: "corp", action: "election",
    eligibility: { note: B("Every shareholder must be allowed to hold S corporation stock: no nonresident alien shareholders.", "所有股东均须符合 S 型公司持股资格：不得有非居民外国人股东。"), source: src(q.foreign) },
    report: { name: B("Election timing", "选择时限"), feeUsd: 0, due: B("No more than 2 months and 15 days after the start of the tax year it takes effect", "须在生效纳税年度开始后 2 个月零 15 天内"), source: src(q.due) },
  };
  return [];
}

/** Puts each built row in the library: the facts on an entry it already has, or the new entry. Returns the ids of
    existing entries it couldn't find (the registry test fails on them). */
export function applyEntities(forms: OfficialForm[], built: Built[]): string[] {
  const missing: string[] = [];
  for (const x of built) {
    if (!x.existing) { if (!forms.some(f => f.id === x.form.id)) forms.push(x.form); continue; }
    const f = forms.find(g => g.id === x.existing);
    if (!f) { missing.push(x.existing); continue; }
    const n = x.form;
    f.needs = { ...(f.needs ?? {}), ...n.needs };
    if (n.unless) f.unless = [...new Set([...(f.unless ?? []), ...n.unless])];
    f.entity = n.entity;
    if (n.processing) { f.processing = n.processing; f.takes = n.takes; f.takesDays = n.takesDays; f.takesSource = n.takesSource; }
    if (n.expedite) f.expedite = n.expedite;
    if (n.renews) f.renews = n.renews;
    // a proof read in this pass states the fee. The entry keeps the proof it had (the requirement, which the accuracy
    // sets read), and this pass's sentence becomes its fee source; an entry with no proof takes this one
    if (n.proof) {
      // the fee read now replaces the entry's old note (which may say the fee wasn't confirmed). A different fee is a
      // conflict unless the new row's note explains it (e.g. Minnesota: $185 by mail, $205 online)
      if (n.fee != null) { if (f.fee != null && f.fee !== n.fee && !n.feeNote) missing.push(`${f.id}: had fee ${f.fee}; ${n.fee} was read on ${n.proof.read}`); f.fee = n.fee; if (!n.feeNote) delete f.feeNote; }
      if (n.feeNote) f.feeNote = n.feeNote;
      if (f.proof && !x.replaceProof) f.entity = { ...f.entity!, feeSource: { url: n.proof.read, quote: n.proof.quote, checked: n.proof.checked } };
      else { f.proof = n.proof; f.info = n.proof.read; f.checked = f.checked === "form" ? "form" : "page"; }
    }
    // an entry with a proof from an earlier pass is verified; this pass's blocked reason (no fee page read) stays as a note
    if (f.proof && f.entity?.blocked) { f.entity = { ...f.entity, blocked: undefined }; delete f.entity.blocked; }
  }
  return missing;
}
