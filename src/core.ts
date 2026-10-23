import { DEFAULT_POLICY } from "./spend.ts";
import type { OrbState } from "thinking-orbs";
import type { Application, Approval, Audit, Bi, Change, CheckItem, Deadline, Doc, Fact, LicenseHit, Store, Task, Workspace } from "./model";
import type { Lang } from "./i18n";
import { nowIso } from "./time";
import { B, same } from "./bi";
import { countyOf } from "./counties";

/* The agent's contract and the patches it makes to a workspace. No sample data here: this runs in the browser and,
   for background work, on the server. */

/** One moment of a run. Plain steps (no kind) are the progress the chat shows; the rest are the replay's moments
 *  (src/replay.ts): a tool she used, an approval she put up, the reviewer's verdict, a fresh shift, a job split across
 *  stores, the answer. Every run keeps them all, in order, on agent_runs.steps (or the workspace's runLog when the run
 *  happened in the browser), so anyone can watch how a job was done. Nothing in them is a prompt or a secret. */
export type Step = {
  state: OrbState; label: Bi; tool?: string;
  at?: string;      // when
  bot?: string;     // who: "odelia" for the main run, or the store id of that store's bot
  job?: string;     // the job it was for
  kind?: "tool" | "approval" | "check" | "shift" | "split" | "reply";
  fn?: string;      // the tool's own name (kind tool)
  in?: Bi;          // what she gave it, in a line
  out?: Bi;         // what came back, in a line
  ok?: boolean;     // false when the tool refused or failed
  diff?: Diff;      // what changed in the workspace
  items?: { ok: boolean; text: Bi; why?: Bi }[];   // the reviewer's verdict, item by item (kind check)
};
/** What one moment changed in the workspace, as a replay shows it. Values are shortened and secrets masked. */
export type Diff = {
  fields?: { app: Bi; label: Bi; value: string }[];
  docs?: string[];
  approvals?: Bi[];
  deadlines?: { date: string; title: Bi }[];
  items?: { app: Bi; item: Bi }[];
  stores?: Bi[];
  facts?: { label: Bi; value: string }[];
  jobs?: Bi[];
  more?: number;    // changes beyond what's listed
};
export type Request =
  | { text: string }
  | { approve: string }
  | { approveAll: string[] }
  | { upload: { app: string; item: string; files: { name: string; size: number }[] } }
  | { match: { what: string; where: string } };
export type Reply = {
  text: Bi[];
  chain?: Bi[];
  approvals?: string[];
  filed?: string[];         // applications this run filed: each shows live, step by step, with its proof
  apps?: string[];          // application previews to open
  files?: string[];         // documents
  memory?: Bi[];            // facts committed to memory
  skills?: Bi[];            // skills learned on this run
  matches?: { what: string; where: string; hits: LicenseHit[] };
  next?: { label: Bi; req: Request };
  sources?: { title: string; url: string }[];   // official pages the agent read, cited
  remembered?: { id: string; text: Bi; suggested?: boolean }[];   // details the person mentioned that this run kept (src/recall.ts)
  recalled?: { id: string; text: Bi; why: Bi }[];   // agent memories that fit this request, each with why (src/odeliaMemory/retrieve.ts usedFor)
  table?: { title: Bi; columns: Bi[]; rows: string[][]; cite?: string[][] };   // a grid the agent built, e.g. reviewed documents; cite: the document's words behind each cell
  undo?: string;            // the run's undo point (src/rewind.ts): "Undo what she did" on this turn
  forms?: FilledNote[];     // the agency's forms this run filled again, each a new version (src/forms/versions.ts)
};
/** A filled form a reply hands back: "Filled: Form SS-4, version 2, 3 lines changed", opening the PDF. ok false when
 *  reading it back found a line that doesn't match (problem says which). link: the short link a text or chat gets. */
export type FilledNote = { app: string; form: string; title: Bi; version: number; changed: number; filled: number; doc?: string; path?: string; ok: boolean; problem?: Bi; link?: string };
export type Context = { lang: Lang; current: Workspace };
export type AgentEvent =
  | { type: "step"; index: number; step: Step }
  | { type: "update"; patch: (w: Workspace) => Workspace }
  | { type: "draft"; text: string }
  | { type: "reply"; reply: Reply };

export interface AgentBackend {
  run(req: Request, ctx: Context, onEvent: (e: AgentEvent) => void, signal: AbortSignal): Promise<void>;
}

/* ---------------------------- workspace patches ---------------------------- */

export type P = (w: Workspace) => Workspace;
let seq = 0;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export const setApp = (id: string, a: Partial<Application>): P => w => ({ ...w, apps: w.apps.map(x => (x.id === id ? { ...x, ...a } : x)) });
export const setCheck = (app: string, item: string, c: Partial<CheckItem>): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app ? { ...x, checklist: x.checklist.map(i => (i.id === item ? { ...i, ...c } : i)) } : x)) });
export const addCheck = (app: string, c: CheckItem): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app && !x.checklist.some(i => i.id === c.id) ? { ...x, checklist: [...x.checklist, c] } : x)) });
export const setField = (app: string, field: string, value: string, from?: Bi): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app ? { ...x, fields: x.fields.map(f => (f.id === field ? { ...f, value, from: from ?? f.from, quote: value === f.value ? f.quote : undefined } : f)) } : x)) });
export const addApp = (a: Application): P => w => ({ ...w, apps: w.apps.some(x => x.id === a.id) ? w.apps : [...w.apps, a] });
export const addDoc = (d: Doc): P => w => ({ ...w, docs: [d, ...w.docs.filter(x => x.id !== d.id)] });
export const audit = (actor: Audit["actor"], action: Bi, object: Bi, detail?: Bi, who?: Bi): P => w => ({ ...w, audit: [{ id: uid("x"), at: nowIso(), actor, action, object, detail, who }, ...w.audit] });
export const dropApproval = (id: string): P => w => ({ ...w, approvals: w.approvals.filter(a => a.id !== id), closed: [...w.closed, ...w.approvals.filter(a => a.id === id)] });
/** Stamped with when it was asked, so Home can say how long it has waited (src/monthly.ts). */
export const addApproval = (a: Approval): P => w => ({ ...w, approvals: w.approvals.some(x => x.id === a.id) ? w.approvals : [{ ...a, at: a.at ?? nowIso() }, ...w.approvals] });
export const addTask = (t: Task): P => w => ({ ...w, running: [t, ...w.running.filter(x => x.id !== t.id)] });
export const dropTask = (id: string): P => w => ({ ...w, running: w.running.filter(x => x.id !== id) });
export const addDeadline = (d: Deadline): P => w => ({ ...w, deadlines: [...w.deadlines.filter(x => x.id !== d.id), d] });
export const dropDeadline = (id: string): P => w => ({ ...w, deadlines: w.deadlines.filter(x => x.id !== id) });
export const dropNudge = (id: string): P => w => ({ ...w, nudges: w.nudges.filter(x => x.id !== id) });
export const setFact = (f: Fact): P => w => ({ ...w, facts: w.facts.some(x => x.id === f.id) ? w.facts.map(x => (x.id === f.id ? f : x)) : [...w.facts, f] });

/** Where a line came from when a business fact it held changed (src/forms/versions.ts reads it to say why a form was
 *  filled again). */
export const FROM_FACT = B("From Context, updated", "来自资料（已更新）");
/** A value distinctive enough that a line holding it came from that fact: a name, an address, an EIN, a phone number.
 *  "Yes", "No", "N/A" or a small number could be any line's own answer, so a fact like that feeds nothing. */
export const feeds = (v: string) => v.trim().length >= 4 && !/^(yes|no|n\/?a|none|true|false|unknown|是|否|无)$/i.test(v.trim()) && !/^\d{1,3}$/.test(v.trim());
/** A business fact that changed fills the open applications it fed: every line still holding the old value gets the new
 *  one (filed applications keep what was filed). Each of those applications' forms is then filled again. */
export const feedFact = (was: string | undefined, now: string): P => w => {
  const old = (was ?? "").trim();
  if (!feeds(old) || !now.trim() || old === now.trim()) return w;
  let hit = false;
  const apps = w.apps.map(a => {
    if (["filing", "review", "approved"].includes(a.status) || !a.fields.some(f => f.value.trim() === old)) return a;
    hit = true;
    return { ...a, fields: a.fields.map(f => (f.value.trim() === old ? { ...f, value: now, from: FROM_FACT, quote: undefined } : f)) };
  });
  return hit ? { ...w, apps } : w;
};

/** What stops an application from being filed: fields still empty and documents still missing. Every filing path
    (the agent's request, the approval sheet, the demo and the cloud) checks this, for every kind of business. */
/** A value that isn't one yet: empty, whitespace, or a stand-in ("TBD", "unknown", "[owner name]", "?", "待定").
    "N/A" and "None" are real answers and count. The database's filings check uses the same rule. */
export const BLANK = /^(?:|tbd|tbc|to be (?:confirmed|determined|added)|unknown|pending|placeholder|xxx+|\?+|-+|_+|\.{3}|…|\[[^\]]*\]|<[^>]*>|\{[^}]*\}|待定|未知|待确认|待补充)$/i;
export const isBlank = (v: string | undefined | null) => BLANK.test((v ?? "").trim());
export function filingBlockers(a: Pick<Application, "fields" | "checklist">): { empty: Bi[]; missing: Bi[] } {
  return { empty: a.fields.filter(f => isBlank(f.value)).map(f => f.label), missing: a.checklist.filter(c => c.state === "missing").map(c => c.label) };
}
export const readyToFile = (a: Pick<Application, "fields" | "checklist">) => { const b = filingBlockers(a); return !b.empty.length && !b.missing.length; };
/** One sentence naming what's left, for the person. */
export function blockersSay(a: Pick<Application, "fields" | "checklist">): Bi {
  const { empty, missing } = filingBlockers(a);
  const list = (xs: Bi[], k: "en" | "zh") => xs.slice(0, 6).map(x => x[k]).join(k === "zh" ? "、" : ", ") + (xs.length > 6 ? (k === "zh" ? ` 等 ${xs.length} 项` : ` and ${xs.length - 6} more`) : "");
  const en = [empty.length ? `still empty: ${list(empty, "en")}` : "", missing.length ? `documents still missing: ${list(missing, "en")}` : ""].filter(Boolean).join("; ");
  const zh = [empty.length ? `尚未填写：${list(empty, "zh")}` : "", missing.length ? `尚缺文件：${list(missing, "zh")}` : ""].filter(Boolean).join("；");
  return B(`Not ready to file yet. ${en.charAt(0).toUpperCase() + en.slice(1)}.`, `还不能提交。${zh}。`);
}

/** A saved state may be missing lists (older saves, a fresh workspace): fill them in. */
export function normalizeState(name: string, s: Partial<Workspace>): Workspace {
  return {
    business: s.business ?? same(name), goal: s.goal ?? same(""), locations: s.locations ?? [], apps: s.apps ?? [], docs: s.docs ?? [],
    deadlines: s.deadlines ?? [], nudges: s.nudges ?? [], approvals: s.approvals ?? [], closed: s.closed ?? [], audit: [],
    facts: s.facts ?? [], running: s.running ?? [], connections: s.connections ?? [], stores: s.stores, meta: s.meta, memories: s.memories, chats: s.chats, skills: s.skills, skillsAuto: s.skillsAuto, spend: s.spend, jobs: s.jobs, routines: s.routines,
    firstPlan: s.firstPlan, entities: s.entities, runs: s.runs, controls: s.controls, undo: s.undo, ...(s.runLog ? { runLog: s.runLog } : {}), ...(s.agentMemory ? { agentMemory: s.agentMemory } : {}), ...(s.bookings ? { bookings: s.bookings } : {}), ...(s.declined ? { declined: s.declined } : {}),
  };
}
/** What's saved: everything but the audit trail (that has its own table) and payment cards (made from the filings). */
export function stripState(w: Workspace): Partial<Workspace> {
  const { audit: _a, ...rest } = w;
  void _a;
  return { ...rest, approvals: w.approvals.filter(a => a.kind !== "pay") };
}

/** How a request reached Odelia from outside the app, as a person would say it: "by email", "通过邮件". */
export function viaWords(via: string): Bi {
  return via === "email" ? B("by email", "通过邮件") : via === "sms" ? B("by text message", "通过短信") : via === "voice" ? B("on a phone call", "通过电话")
    : via === "slack" ? B("in Slack", "通过 Slack") : via === "lark" ? B("in Lark", "通过飞书") : via === "wechat" ? B("in WeChat", "通过微信") : B("from outside the app", "从应用外");
}
/** What a confirmed change did, for the audit trail: a business fact or the name, from what to what, and who asked how.
 *  Nothing for the other changes (their title already says it). */
export function changeDetail(c: Change): Bi | undefined {
  if (c.op !== "set_fact" && c.op !== "rename_business") return undefined;
  const v = viaWords(c.via), who = c.from ? ` from ${c.from}` : "", whoZh = c.from ? `（${c.from}）` : "";
  if (c.op === "set_fact") return B(`${c.label.en}: "${c.was ?? ""}" → "${c.value}". Asked ${v.en}${who}`, `${c.label.zh}：“${c.was ?? ""}” → “${c.value}”。${v.zh}${whoZh}提出`);
  const en = [c.name && `Name: "${c.was.en}" → "${c.name}"`, c.goal && `Goal: "${c.wasGoal?.en ?? ""}" → "${c.goal}"`].filter(Boolean).join(". ");
  const zh = [c.name && `名称：“${c.was.zh}” → “${c.name}”`, c.goal && `目标：“${c.wasGoal?.zh ?? ""}” → “${c.goal}”`].filter(Boolean).join("。");
  return B(`${en}. Asked ${v.en}${who}`, `${zh}。${v.zh}${whoZh}提出`);
}

/** An owner confirming a change card in the app: the change made, the card closed, and an audit line saying what
 *  changed (for a business fact or the name: from what to what, and who asked how). */
export const confirmChange = (a: Approval): P => w => (a.change ? audit("you", B("Confirmed a change", "确认更改"), a.title, changeDetail(a.change))(dropApproval(a.id)(applyChange(a.change)(w))) : w);

/** Make a change you confirmed: move a store to a new place, remove a store or an application, set budgets, or save a
 *  business fact or a new name that was asked for from outside the app. */
export const applyChange = (c: Change): P => w => {
  if (c.op === "set_fact") {
    // matched by its label again now, in case the fact was added or renamed while the card waited
    const had = w.facts.find(f => f.label.en.toLowerCase() === c.label.en.toLowerCase() || f.label.zh === c.label.zh);
    if (had?.locked) return w;   // a locked rule ("needs your approval") never changes this way
    const v = viaWords(c.via);
    // and every open application whose line held the old value gets the new one (its form is filled again)
    return feedFact(had?.value.en, c.value)(setFact({ id: had?.id ?? uid("f-x"), group: had?.group ?? c.group, label: had?.label ?? c.label, value: same(c.value),
      source: B(`Asked ${v.en}, confirmed in the app`, `${v.zh}提出，已在应用中确认`) })(w));
  }
  if (c.op === "rename_business") return feedFact(c.name ? w.business.en : undefined, c.name ?? "")({ ...w, business: c.name ? same(c.name) : w.business, goal: c.goal ? same(c.goal) : w.goal });
  if (c.op === "move_store") {
    const nyc = c.state.toUpperCase() === "NY" && /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|flushing|astoria|long island city)$/i.test(c.city);
    const address = [c.address, c.city, c.state.toUpperCase()].filter(Boolean).join(", ");
    const name = c.name ?? (c.address ? `${c.city}, ${c.address.split(",")[0].replace(/^\d+\s+/, "")}` : c.city);
    const stores = (w.stores ?? []).map(x => (x.id === c.store ? { ...x, name: same(name), address, plannedOpen: c.planned_open ?? x.plannedOpen, rules: nyc ? ["nyc_grades", "nyc_fww"] as Store["rules"] : [] } : x));
    const added = w.locations.some(l => l.name.en.toLowerCase() === c.city.toLowerCase()) ? w.locations : [...w.locations, { id: c.city.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: same(c.city), county: countyOf(c.city, c.state), state: "active" as const }];
    // a city no store is in any more drops off the list
    const locations = added.filter(l => stores.some(x => x.address.toLowerCase().includes(l.name.en.toLowerCase())) || !(w.stores ?? []).some(x => x.address.toLowerCase().includes(l.name.en.toLowerCase())));
    // the old place's local permits no longer apply: they wait for the agent to map the new place
    const old = new Set(w.stores?.find(x => x.id === c.store)?.apps ?? []);
    const apps = w.apps.map(a => (old.has(a.id) && (a.level === "city" || a.level === "county") && a.status !== "approved" ? { ...a, status: "waiting" as const, next: B(`The store moved to ${c.city}. Placetta maps the new city's permits`, `门店已迁至${c.city}，快哉将重新梳理当地许可`) } : a));
    return { ...w, stores, locations, apps, meta: w.meta && w.stores?.[0]?.id === c.store ? { ...w.meta, city: c.city, region: c.state.toUpperCase() } : w.meta };
  }
  if (c.op === "remove_store") {
    // its applications that aren't filed go with it (and their approvals and deadlines); filed ones stay as the record
    const gone = w.stores?.find(x => x.id === c.store);
    const drop = new Set((gone?.apps ?? []).filter(id => !["filing", "review", "approved"].includes(w.apps.find(a => a.id === id)?.status ?? "")));
    const stores = (w.stores ?? []).filter(x => x.id !== c.store);
    const city = gone?.address.split(",").slice(-2, -1)[0]?.trim().toLowerCase();
    const locations = city && !stores.some(x => x.address.toLowerCase().includes(city)) ? w.locations.filter(l => l.name.en.toLowerCase() !== city) : w.locations;
    return { ...w, stores, locations, apps: w.apps.filter(a => !drop.has(a.id)), approvals: w.approvals.filter(a => !a.app || !drop.has(a.app)), deadlines: w.deadlines.filter(d => !d.app || !drop.has(d.app)) };
  }
  if (c.op === "set_budgets") {
    const spend = w.spend ?? { policy: DEFAULT_POLICY, purchases: [] };
    return { ...w, spend: { ...spend, policy: { ...spend.policy, budgets: c.budgets } } };
  }
  // a connected app's action runs on the server when approved (src/App.tsx), never in the workspace itself
  if (c.op === "mcp_call") return w;
  // held changes and plans are run by the app when an owner approves them (src/held.ts), not here
  if (c.op === "held" || c.op === "plan") return w;
  // removed with the owner's confirmation: it doesn't apply, so it's remembered and never suggested again
  const gone = w.apps.find(a => a.id === c.app);
  const store = (w.stores ?? []).find(x => (x.apps ?? []).includes(c.app))?.id;
  const declined = gone ? [...(w.declined ?? []).filter(d => !(d.official && d.official === gone.official && d.store === store)),
    { ...(gone.official ? { official: gone.official } : {}), name: gone.name, ...(store ? { store } : {}), ...(c.reason ? { reason: c.reason.slice(0, 200) } : {}), at: new Date().toISOString() }].slice(-100) : w.declined;
  return { ...w, apps: w.apps.filter(a => a.id !== c.app), approvals: w.approvals.filter(a => a.app !== c.app), ...(declined ? { declined } : {}) };
};
