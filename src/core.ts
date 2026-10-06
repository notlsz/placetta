import type { OrbState } from "thinking-orbs";
import type { Application, Approval, Audit, Bi, CheckItem, Deadline, Doc, Fact, LicenseHit, Task, Workspace } from "./model";
import type { Lang } from "./i18n";
import { nowIso } from "./time";
import { same } from "./bi";

/* The agent's contract and the patches it makes to a workspace. No sample data here: this runs in the browser and,
   for background work, on the server. */

export type Step = { state: OrbState; label: Bi; tool?: string };
export type Request =
  | { text: string }
  | { approve: string }
  | { upload: { app: string; item: string; files: { name: string; size: number }[] } }
  | { match: { what: string; where: string } };
export type Reply = {
  text: Bi[];
  chain?: Bi[];
  approvals?: string[];
  apps?: string[];          // application previews to open
  files?: string[];         // documents
  memory?: Bi[];            // facts committed to memory
  matches?: { what: string; where: string; hits: LicenseHit[] };
  next?: { label: Bi; req: Request };
  sources?: { title: string; url: string }[];   // official pages the agent read, cited
  table?: { title: Bi; columns: Bi[]; rows: string[][]; cite?: string[][] };   // a grid the agent built, e.g. reviewed documents; cite: the document's words behind each cell
};
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
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export const setApp = (id: string, a: Partial<Application>): P => w => ({ ...w, apps: w.apps.map(x => (x.id === id ? { ...x, ...a } : x)) });
export const setCheck = (app: string, item: string, c: Partial<CheckItem>): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app ? { ...x, checklist: x.checklist.map(i => (i.id === item ? { ...i, ...c } : i)) } : x)) });
export const addCheck = (app: string, c: CheckItem): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app && !x.checklist.some(i => i.id === c.id) ? { ...x, checklist: [...x.checklist, c] } : x)) });
export const setField = (app: string, field: string, value: string, from?: Bi): P => w => ({ ...w, apps: w.apps.map(x => (x.id === app ? { ...x, fields: x.fields.map(f => (f.id === field ? { ...f, value, from: from ?? f.from, quote: value === f.value ? f.quote : undefined } : f)) } : x)) });
export const addApp = (a: Application): P => w => ({ ...w, apps: w.apps.some(x => x.id === a.id) ? w.apps : [...w.apps, a] });
export const addDoc = (d: Doc): P => w => ({ ...w, docs: [d, ...w.docs.filter(x => x.id !== d.id)] });
export const audit = (actor: Audit["actor"], action: Bi, object: Bi, detail?: Bi, who?: Bi): P => w => ({ ...w, audit: [{ id: uid("x"), at: nowIso(), actor, action, object, detail, who }, ...w.audit] });
export const dropApproval = (id: string): P => w => ({ ...w, approvals: w.approvals.filter(a => a.id !== id), closed: [...w.closed, ...w.approvals.filter(a => a.id === id)] });
export const addApproval = (a: Approval): P => w => ({ ...w, approvals: w.approvals.some(x => x.id === a.id) ? w.approvals : [a, ...w.approvals] });
export const addTask = (t: Task): P => w => ({ ...w, running: [t, ...w.running.filter(x => x.id !== t.id)] });
export const dropTask = (id: string): P => w => ({ ...w, running: w.running.filter(x => x.id !== id) });
export const addDeadline = (d: Deadline): P => w => ({ ...w, deadlines: [...w.deadlines.filter(x => x.id !== d.id), d] });
export const dropDeadline = (id: string): P => w => ({ ...w, deadlines: w.deadlines.filter(x => x.id !== id) });
export const dropNudge = (id: string): P => w => ({ ...w, nudges: w.nudges.filter(x => x.id !== id) });
export const setFact = (f: Fact): P => w => ({ ...w, facts: w.facts.some(x => x.id === f.id) ? w.facts.map(x => (x.id === f.id ? f : x)) : [...w.facts, f] });

/** A saved state may be missing lists (older saves, a fresh workspace): fill them in. */
export function normalizeState(name: string, s: Partial<Workspace>): Workspace {
  return {
    business: s.business ?? same(name), goal: s.goal ?? same(""), locations: s.locations ?? [], apps: s.apps ?? [], docs: s.docs ?? [],
    deadlines: s.deadlines ?? [], nudges: s.nudges ?? [], approvals: s.approvals ?? [], closed: s.closed ?? [], audit: [],
    facts: s.facts ?? [], running: s.running ?? [], connections: s.connections ?? [], stores: s.stores, meta: s.meta,
  };
}
/** What's saved: everything but the audit trail (that has its own table) and payment cards (made from the filings). */
export function stripState(w: Workspace): Partial<Workspace> {
  const { audit: _a, ...rest } = w;
  void _a;
  return { ...rest, approvals: w.approvals.filter(a => a.kind !== "pay") };
}
