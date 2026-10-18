import { B, same, type Bi } from "./bi";
import { audit } from "./core";
import type { Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * Undo, the way Claude Code keeps a checkpoint before it edits: every
 * run of Odelia's remembers how the workspace was before her first
 * change, and the person can put it back from the chat.
 *
 * What's kept is only what her run changed, path by path (an
 * application's line, a deadline, a fact): the value before her first
 * change and a fingerprint of the value she left. Undoing puts a path
 * back only while it still holds what she left there. Anything a person
 * changed since is kept and listed, and anything that already left
 * Placetta (filed, sent, paid, put on a calendar) is listed as not
 * undoable. The last UNDO_KEEP runs are kept in the workspace.
 * ------------------------------------------------------------------ */

/** One path her run changed. p: the path ("#id" picks an item of a list by its id); had: whether it existed before;
 *  b: the value before; h: the fingerprint of the value she left; i: where a removed list item was. */
export type UndoRec = { p: string[]; had: boolean; b?: unknown; h: string; i?: number };
/** held: what was approved and is still in the undo window before it's sent (src/hold.ts, or a filing the server holds).
 *  It hasn't left Placetta, so it isn't "can't be undone": the person cancels it from the countdown Undo lists it with. */
export type HeldOut = { title: Bi; approval?: string; filing?: string };
export type UndoResult = { undone: number; kept: Bi[]; out: Bi[]; held?: HeldOut[] };
/** Sends in the undo window right now: approvals this tab holds, and applications whose filing the server holds. */
export type HeldNow = { approvals?: Set<string>; filings?: Map<string, string> };
export type UndoPoint = {
  id: string; at: string;
  /** What was asked, for the list and the audit trail. */
  title?: Bi;
  recs: UndoRec[];
  /** What left Placetta during the run itself (a calendar event on the person's own calendar). */
  outside?: Bi[];
  /** Once undone: when, by whom, and what happened. */
  done?: UndoResult & { at: string; by?: string };
};
export const UNDO_KEEP = 20;

/** The parts of the workspace a run's changes are tracked in. The audit trail, past chats, answered approvals,
 *  connections and the owner's controls are records, not her work, and never roll back. */
const TRACK = ["business", "goal", "locations", "apps", "docs", "deadlines", "approvals", "facts", "stores", "jobs", "routines", "skills", "memories", "spend", "nudges"] as const;
const SEP = "\u0001";
const SECRETISH = /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b\d{9}\b/;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const idList = (v: unknown): v is { id: string }[] => Array.isArray(v) && v.every(x => isObj(x) && typeof x.id === "string") && new Set(v.map(x => (x as { id: string }).id)).size === v.length;

/** The same value, the same text: keys sorted, undefined left out (as JSON drops it when the workspace is saved). */
function stable(v: unknown): string {
  if (v === undefined) return "~";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(x => (x === undefined ? "null" : stable(x))).join(",") + "]";
  return "{" + Object.keys(v).filter(k => (v as Obj)[k] !== undefined).sort().map(k => JSON.stringify(k) + ":" + stable((v as Obj)[k])).join(",") + "}";
}
/** A short fingerprint of a value (FNV-1a over its stable text, with the length). */
export function fingerprint(v: unknown): string {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + "." + s.length.toString(36);
}

type Found = { p: string[]; had: boolean; b?: unknown; i?: number };
const isBi = (v: unknown) => isObj(v) && Object.keys(v).every(k => k === "en" || k === "zh");
/** One thing a person reads as a whole: a form line (its value, where it came from, the words it was read from), a
 *  deadline, a fact. Only plain values and text in both languages inside, so it's undone or kept as one. */
const whole = (v: unknown) => isObj(v) && Object.values(v).every(x => x == null || typeof x !== "object" || isBi(x));
/** Every path where b differs from a: down through objects by key and through lists of things with ids by id. */
function diff(a: unknown, b: unknown, path: string[], out: Found[]) {
  if (a === b) return;
  if (isObj(a) && isObj(b) && !(whole(a) && whole(b))) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === b[k]) continue;
      if (a[k] === undefined || b[k] === undefined) { if (stable(a[k]) !== stable(b[k])) out.push({ p: [...path, k], had: a[k] !== undefined, b: a[k] }); }
      else diff(a[k], b[k], [...path, k], out);
    }
    return;
  }
  if (idList(a) && idList(b) && (a.length || b.length)) {
    const bm = new Map(b.map(x => [x.id, x]));
    a.forEach((x, i) => { const y = bm.get(x.id); if (!y) out.push({ p: [...path, "#" + x.id], had: true, b: x, i }); else if (x !== y) diff(x, y, [...path, "#" + x.id], out); });
    const am = new Set(a.map(x => x.id));
    for (const y of b) if (!am.has(y.id)) out.push({ p: [...path, "#" + y.id], had: false });
    return;
  }
  if (stable(a) !== stable(b)) out.push({ p: path, had: a !== undefined, b: a });
}

/** The value at a path, or undefined. */
export function getAt(root: unknown, p: string[]): unknown {
  let cur: unknown = root;
  for (const seg of p) {
    if (cur == null) return undefined;
    if (seg.startsWith("#") && Array.isArray(cur)) cur = cur.find(x => isObj(x) && x.id === seg.slice(1));
    else if (isObj(cur)) cur = cur[seg];
    else return undefined;
  }
  return cur;
}
/** The workspace with one path set back (or removed when it didn't exist before). null when the path's parent is
 *  gone (someone removed the application she filled), so it can't be put back. */
function setAt(node: unknown, p: string[], k: number, val: unknown, present: boolean, at?: number): { v: unknown } | null {
  const seg = p[k], last = k === p.length - 1;
  if (seg.startsWith("#") && Array.isArray(node)) {
    const id = seg.slice(1), j = node.findIndex(x => isObj(x) && x.id === id);
    if (last) {
      if (!present) return { v: j < 0 ? node : node.filter((_, n) => n !== j) };
      if (j >= 0) return { v: node.map((x, n) => (n === j ? val : x)) };
      const where = Math.max(0, Math.min(at ?? node.length, node.length));
      return { v: [...node.slice(0, where), val, ...node.slice(where)] };
    }
    if (j < 0) return null;
    const r = setAt(node[j], p, k + 1, val, present, at);
    return r && { v: node.map((x, n) => (n === j ? r.v : x)) };
  }
  if (!isObj(node)) return null;
  if (last) { if (present) return { v: { ...node, [seg]: val } }; const { [seg]: _gone, ...rest } = node; void _gone; return { v: rest }; }
  if (node[seg] === undefined) return null;
  const r = setAt(node[seg], p, k + 1, val, present, at);
  return r && { v: { ...node, [seg]: r.v } };
}

/**
 * Records what a run changes. wrap() goes around each change the run makes (the same function the run applies); recs()
 * is the run's undo record so far. A run picked up again by a fresh instance passes its earlier record as seed.
 */
export function recorder(seed: UndoRec[] = []) {
  const recs = new Map<string, UndoRec>(seed.map(r => [r.p.join(SEP), r]));
  const note = (f: Found, n: unknown) => {
    // a path inside one already recorded (an application she added, then filled): that record carries it
    for (let k = f.p.length - 1; k > 0; k--) { const up = recs.get(f.p.slice(0, k).join(SEP)); if (up) { up.h = fingerprint(getAt(n, up.p)); return; } }
    const key = f.p.join(SEP), had = recs.get(key);
    if (had) { had.h = fingerprint(getAt(n, f.p)); return; }
    // a value that held what looks like a Social Security number is never copied into the undo record (or put back)
    if (f.had && SECRETISH.test(stable(f.b))) return;
    recs.set(key, { p: f.p, had: f.had, ...(f.had ? { b: f.b } : {}), h: fingerprint(getAt(n, f.p)), ...(f.i !== undefined ? { i: f.i } : {}) });
  };
  return {
    wrap<W extends Workspace>(p: (w: W) => W): (w: W) => W {
      return (w: W) => {
        const n = p(w);
        if (n === w) return n;
        const found: Found[] = [];
        for (const k of TRACK) if ((w as Obj)[k] !== (n as Obj)[k]) diff((w as Obj)[k], (n as Obj)[k], [k], found);
        for (const f of found) note(f, n);
        return n;
      };
    },
    recs: () => [...recs.values()],
    size: () => recs.size,
  };
}

/** What was asked, as the undo point's title: short, and with long numbers taken out (an SSN typed into the chat
 *  never lands in the workspace this way). */
export const undoTitle = (asked: string): Bi => same(asked.replace(/(?:\d[\s.-]?){6,}\d/g, "[number]").replace(/\s+/g, " ").trim().slice(0, 160));

/** Keep this run's undo point (the newest first, the last UNDO_KEEP). A run that changed nothing keeps none. Safe to
 *  apply twice. */
export const addUndo = (pt: UndoPoint) => (w: Workspace): Workspace =>
  !pt.recs.length || (w.undo ?? []).some(x => x.id === pt.id) ? w : { ...w, undo: [pt, ...(w.undo ?? [])].slice(0, UNDO_KEEP) };

/** What a path is, in words a person knows: the application and its line, the deadline, the fact. */
export function describePath(p: string[], w: Workspace, before?: unknown): Bi {
  const id = (s?: string) => (s?.startsWith("#") ? s.slice(1) : "");
  const named = (list: { id: string }[] | undefined, key: string, f: (x: never) => Bi) => { const x = (list ?? []).find(y => y.id === id(key)) ?? (isObj(before) && before.id === id(key) ? before : undefined); return x ? f(x as never) : undefined; };
  const top = p[0];
  if (top === "apps") {
    const a = named(w.apps, p[1], (x: { name: Bi }) => x.name) ?? same(id(p[1]));
    const app = w.apps.find(x => x.id === id(p[1]));
    const line = p[2] === "fields" ? app?.fields.find(f => f.id === id(p[3]))?.label : p[2] === "checklist" ? app?.checklist.find(c => c.id === id(p[3]))?.label : undefined;
    return line ? B(`${a.en}: ${line.en}`, `${a.zh}：${line.zh}`) : a;
  }
  const word: Record<string, [Bi, (x: never) => Bi]> = {
    deadlines: [B("A deadline", "一个截止日期"), (x: { title: Bi }) => x.title], facts: [B("A business fact", "一项企业资料"), (x: { label: Bi }) => x.label],
    stores: [B("A store", "一家门店"), (x: { name: Bi }) => x.name], approvals: [B("An approval", "一项批准"), (x: { title: Bi }) => x.title],
    jobs: [B("A job", "一项工作"), (x: { title: Bi }) => x.title], docs: [B("A document", "一份文件"), (x: { name: string }) => same(x.name)],
    routines: [B("A routine", "一项例行任务"), (x: { title: Bi }) => x.title], skills: [B("A playbook", "一本手册"), (x: { name: Bi }) => x.name],
    locations: [B("A location", "一个地点"), (x: { name: Bi }) => x.name], nudges: [B("A note", "一条提示"), (x: { text: Bi }) => x.text],
  };
  if (word[top]) return named((w as unknown as Record<string, { id: string }[]>)[top], p[1], word[top][1]) ?? word[top][0];
  return top === "business" ? B("The business's name", "企业名称") : top === "goal" ? B("The business's goal", "企业目标") : top === "memories" ? B("Your memory", "您的记忆") : top === "spend" ? B("Spending", "支出") : B("A setting", "一项设置");
}

const LEFT_STATUS = new Set(["filing", "review", "approved"]);
const pushOnce = (list: Bi[], x: Bi) => { if (!list.some(y => y.en === x.en)) list.push(x); };

/**
 * Put back what one run changed, where it's still as she left it. o.filed: applications with a filing in an account
 * (they left Placetta even when the workspace doesn't say so yet); o.serverDocs: documents in an account live on the
 * server too, so one she saved stays in Documents. o.held: sends still in the undo window, listed to cancel and left
 * exactly as approved (their card and their application), so what goes out, if it does, is what the person approved.
 */
export function restore(cur: Workspace, pt: UndoPoint, o: { filed?: Set<string>; serverDocs?: boolean; held?: HeldNow } = {}): { w: Workspace; res: UndoResult } {
  let w = cur, undone = 0;
  const kept: Bi[] = [], out: Bi[] = [], held: HeldOut[] = [];
  const heldCards = cur.approvals.filter(a => o.held?.approvals?.has(a.id));
  const heldApps = new Map<string, HeldOut>();
  for (const a of heldCards) if (a.app) heldApps.set(a.app, { title: a.title, approval: a.id });
  for (const [app, filing] of o.held?.filings ?? []) { const x = cur.apps.find(y => y.id === app); heldApps.set(app, { title: x ? B(`File the ${x.name.en}`, `提交${x.name.zh}`) : same(app), filing }); }
  const holdOnce = (h: HeldOut) => { if (!held.some(x => x.title.en === h.title.en)) held.push(h); };
  const left = new Set([...cur.apps.filter(a => LEFT_STATUS.has(a.status)).map(a => a.id), ...(o.filed ?? [])]);
  for (const rec of [...pt.recs].sort((a, b) => a.p.length - b.p.length)) {
    const top = rec.p[0], id = rec.p[1]?.slice(1);
    if (top === "apps" && id && heldApps.has(id)) { holdOnce(heldApps.get(id)!); continue; }
    if (top === "approvals" && id && o.held?.approvals?.has(id)) { const a = heldCards.find(x => x.id === id); if (a) holdOnce(a.app && heldApps.has(a.app) ? heldApps.get(a.app)! : { title: a.title, approval: a.id }); continue; }
    if (top === "apps" && id && left.has(id)) {
      const a = cur.apps.find(x => x.id === id);
      pushOnce(out, B(`${a?.name.en ?? id}: already with the filing team or the agency`, `${a?.name.zh ?? id}：已交给申报团队或机构`));
      continue;
    }
    if (top === "approvals" && rec.p.length === 2 && !rec.had && id) {
      const closed = cur.closed.find(a => a.id === id);
      if (closed) {
        // approved, and its filing is still in the server's undo window: not gone yet
        if (closed.app && heldApps.has(closed.app)) { holdOnce(heldApps.get(closed.app)!); continue; }
        if (closed.kind === "file") pushOnce(out, B(`Filed: ${closed.title.en}`, `已提交：${closed.title.zh}`));
        else if (closed.kind === "send") pushOnce(out, B(`Sent: ${closed.title.en}`, `已发送：${closed.title.zh}`));
        else if (closed.kind === "pay") pushOnce(out, B(`Paid: ${closed.title.en}`, `已付款：${closed.title.zh}`));
        else pushOnce(kept, B(`${closed.title.en}: you approved it`, `${closed.title.zh}：您已批准`));
        continue;
      }
      if (!cur.approvals.some(a => a.id === id)) continue;   // already dismissed: nothing to put back
    }
    if (top === "docs" && rec.p.length === 2 && !rec.had && o.serverDocs) {
      const d = cur.docs.find(x => x.id === id);
      if (d?.path) { pushOnce(out, B(`Kept in Documents: ${d.name}. Delete it there if you don't want it`, `仍在文件中：${d.name}。如不需要，请在那里删除`)); continue; }
    }
    if (fingerprint(getAt(w, rec.p)) !== rec.h) { pushOnce(kept, (() => { const d = describePath(rec.p, w, rec.b); return B(`${d.en}: changed since, kept as it is`, `${d.zh}：之后有改动，保持不变`); })()); continue; }
    const r = setAt(w, rec.p, 0, rec.b, rec.had, rec.i);
    if (!r) { pushOnce(kept, (() => { const d = describePath(rec.p, w, rec.b); return B(`${d.en}: changed since, kept as it is`, `${d.zh}：之后有改动，保持不变`); })()); continue; }
    w = r.v as Workspace;
    undone++;
  }
  for (const x of pt.outside ?? []) pushOnce(out, x);
  return { w, res: { undone, kept, out, ...(held.length ? { held } : {}) } };
}

/** The person taps Undo on a finished turn: her changes go back, the rest is listed, and the audit trail says so. */
export const undoRun = (id: string, o: { filed?: Set<string>; serverDocs?: boolean; held?: HeldNow; by?: string } = {}) => (cur: Workspace): Workspace => {
  const pt = (cur.undo ?? []).find(x => x.id === id);
  if (!pt || pt.done) return cur;
  const { w, res } = restore(cur, pt, o);
  const at = new Date().toISOString();
  const n = { ...w, undo: (w.undo ?? cur.undo ?? []).map(x => (x.id === id ? { ...x, done: { ...res, at, ...(o.by ? { by: o.by } : {}) } } : x)) };
  return audit("you", B("Undid what Odelia did", "撤销了 Odelia 的操作"), pt.title ?? B("A request", "一次请求"),
    B(`${res.undone} change${res.undone === 1 ? "" : "s"} put back${res.kept.length ? `, ${res.kept.length} kept` : ""}${res.out.length ? `, ${res.out.length} already out` : ""}${res.held?.length ? `, ${res.held.length} not sent yet` : ""}`,
      `恢复了 ${res.undone} 项${res.kept.length ? `，保留 ${res.kept.length} 项` : ""}${res.out.length ? `，${res.out.length} 项已无法撤销` : ""}${res.held?.length ? `，${res.held.length} 项尚未发出` : ""}`))(n);
};
