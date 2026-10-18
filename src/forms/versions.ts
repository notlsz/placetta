import { B, same, type Bi } from "../bi";
import { addApproval, addDoc, audit, readyToFile, setApp, type FilledNote, type P } from "../core";
import type { Application, Approval, Field, FormVersion, LineChange, ReadProblem, Workspace } from "../model";
import { nowIso, daysFromNow } from "../time";
import { addressProblems } from "./addressCheck";
import { appPdf, fillable, fillForm, linesOf, valuesOf, type Filled, type LoadPdf } from "./fill";
import { readBack, type ReadBack, type ReadIssue } from "./readback";
import { formById } from "./registry";
import { preflight } from "../smart";

/* ------------------------------------------------------------------ *
 * The agency's own form, always current. Each time an application's
 * answers change (any of Odelia's tools, the person's own edit, the
 * answers filled at sign-up, a document read into it, a business fact
 * that fed its lines), its official PDF is filled again: a new version,
 * kept in Documents ("Form SS-4, filled, version 3"), the earlier ones
 * kept too. Each version records the lines that changed since the one
 * before and what reading it back found (./readback.ts): a line that
 * doesn't match keeps the application from being ready, with the line
 * named. A filing's approval card is for one version: when the answers
 * change after it's put up, it's taken back and a fresh one goes up, and
 * a card whose answers changed can't be filed. The app, the server's
 * runs (supabase/functions/agent-run) and the tests all run this code.
 * ------------------------------------------------------------------ */

const FILED = ["filing", "review", "approved"];
/** Versions kept on the application (their PDFs stay in Documents either way). */
export const KEEP_VERSIONS = 10;
export const CURRENT: Bi = B("Filled form, current version", "已填写的表格，当前版本");
export const EARLIER: Bi = B("Filled form, earlier version", "已填写的表格，较早版本");

/** What goes on the form: the answers by line id, as the fill reads them (nothing written by hand, nothing masked). */
export const answersOf = (a: Pick<Application, "fields">) => valuesOf(a.fields);
/** A short fingerprint of a set of answers: two copies filled from the same answers share it. */
export function hashOf(answers: Record<string, string>): string {
  const s = JSON.stringify(Object.keys(answers).sort().map(k => [k, answers[k].trim()]));
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0; h2 = (h2 ^ (h2 >>> 15)) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
export const answersHash = (a: Pick<Application, "fields">) => hashOf(answersOf(a));
export const latestVersion = (a: Pick<Application, "versions">) => a.versions?.at(-1);
/** The official form Placetta fills for this application, if it fills one. */
export const formOf = (a: Pick<Application, "official">) => (a.official && fillable(a.official) ? a.official : undefined);
/** "Form SS-4", "DE 1": the form's own number, without its revision. */
export const formName = (a: Pick<Application, "official" | "form" | "name">) => ((a.official ? formById(a.official)?.form : undefined) ?? a.form?.en ?? a.name.en).split(" (")[0];
/** Its answers changed since its form was last filled (or it was never filled), and it isn't filed. */
export function needsForm(a: Application): boolean {
  if (!formOf(a) || FILED.includes(a.status)) return false;
  const ans = answersOf(a);
  return Object.keys(ans).length > 0 && latestVersion(a)?.hash !== hashOf(ans);
}

/** The lines that differ between two sets of answers, in the form's order. */
export function changedLines(prev: Record<string, string> | undefined, now: Record<string, string>, fields: Field[]): LineChange[] {
  const ids = [...new Set([...Object.keys(prev ?? {}), ...Object.keys(now)])];
  const at = (id: string) => { const k = fields.findIndex(f => f.id === id); return k < 0 ? 1e6 : k; };
  return ids.filter(id => (prev?.[id] ?? "").trim() !== (now[id] ?? "").trim()).sort((x, y) => at(x) - at(y))
    .map(id => ({ id, label: fields.find(f => f.id === id)?.label ?? same(id), was: prev?.[id] ?? "", now: now[id] ?? "" }));
}

/* ------------------------------ what the read-back found, in words ------------------------------ */

const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
export function noteOf(i: ReadIssue): Bi {
  const want = short(i.want), got = short(i.got ?? "");
  switch (i.kind) {
    case "missing": return B(`"${want}" didn't reach the form: it isn't one of the form's choices, or it couldn't be split into the form's boxes.`, `“${want}”没有填到表格上：它不是表格提供的选项，或无法拆分到对应的格子里。`);
    case "wrong": return B(got ? `The form shows "${got}", not "${want}".` : `"${want}" isn't on the form where it should be.`, got ? `表格上显示的是“${got}”，不是“${want}”。` : `“${want}”没有出现在表格上应在的位置。`);
    case "overflow": return B(`"${want}" doesn't fit the form's box${got && got !== want ? ` (it shows "${got}")` : ""}. Shorten it.`, `“${want}”超出了表格的格子${got && got !== want ? `（只显示“${got}”）` : ""}。请缩短。`);
    case "characters": return B("It has characters the agency's form can't print. Write it in English letters.", "含有机构表格无法打印的字符。请改用英文字母填写。");
    case "secret": return B("It holds an SSN or ITIN, which Placetta never prints. Make the line \"By hand\": the signer writes it on the signed copy.", "含有社会安全号或 ITIN，快哉从不打印。请把这一行改为“手写”，由签署人在签字时写上。");
  }
}
const labelOf = (a: Application, id: string): Bi => a.fields.find(f => f.id === id)?.label ?? same(id);
export const problemsOf = (a: Application, r: ReadBack): ReadProblem[] => r.issues.map(i => ({ id: i.id, label: labelOf(a, i.id), kind: i.kind, note: noteOf(i) }));
/** The one line a person reads when a filled form doesn't match: the line, and what's wrong with it. */
export const problemLine = (p: ReadProblem): Bi => B(`On the filled form, ${p.label.en}: ${p.note.en}`, `已填写的表格上，${p.label.zh}：${p.note.zh}`);

/* ------------------------------ one filled copy ------------------------------ */

/** A copy filled and read back, for one set of answers. */
export type FilledCopy = { filled: Filled; read: ReadBack; hash: string };
/** Fills the application's form and reads it back. One fill per set of answers: a run that already filled these exact
 *  answers (to check them before asking for approval) gets the same copy. null when Placetta doesn't fill this form. */
export async function fillAndRead(a: Application, load: LoadPdf = appPdf, cache?: Map<string, FilledCopy>): Promise<FilledCopy | null> {
  const form = formOf(a);
  if (!form) return null;
  const hash = answersHash(a), key = `${form}:${hash}`;
  const hit = cache?.get(key);
  if (hit) return hit;
  const filled = await fillForm(form, a.fields, load);
  if (!filled) return null;
  const made: FilledCopy = { filled, read: await readBack(form, filled), hash };
  cache?.set(key, made);
  return made;
}

/** Why a version was made, from where its changed lines came from. */
function whyOf(changed: LineChange[], a: Application, by?: Bi): Bi {
  if (by) return by;
  const from = changed.map(c => a.fields.find(f => f.id === c.id)?.from?.en ?? "");
  if (from.some(f => /^you edited/i.test(f))) return B("You edited it", "您修改的");
  if (from.some(f => /signup/i.test(f))) return B("Filled from your signup", "根据您的注册信息填写");
  if (from.some(f => /^from context, updated/i.test(f))) return B("A business fact changed", "企业资料有变化");
  if (from.some(f => /^from .+\.(pdf|png|jpe?g|webp|docx|txt|csv|xlsx?)$/i.test(f))) return B("Read from a document", "从文件中读取");
  return B("Odelia filled it", "Odelia 填写");
}

/** A card taken back: off the approvals, kept in closed with why (the chat shows it), and the card that replaced it. */
function withdraw(w: Workspace, card: Approval, why: Bi, next?: string): Workspace {
  const gone = { ...card, withdrawn: { at: nowIso(), why, ...(next ? { next } : {}) } };
  return audit("agent", B("Took back an approval card", "撤回了一张批准卡片"), card.title, why)({ ...w, approvals: w.approvals.filter(x => x.id !== card.id), closed: [...w.closed.filter(x => x.id !== card.id), gone] });
}
export const CHANGED_SINCE: Bi = B("The answers changed after this was put up. Review the new version, then approve it.", "这张卡片提交后答案有改动。请先查看新版本，再批准。");

/**
 * Keeps one new version on the workspace: the PDF in Documents (marked current, the earlier ones marked earlier), the
 * version on the application, and the filing's approval card brought in line with it. A patch, so the server can lay it
 * on a newer saved workspace; laid twice, it changes nothing the second time. fresh: the id a replacement card gets.
 */
export function keepVersion(appId: string, v: FormVersion, o: { name: string; fresh: string; today?: string }): P {
  return w => {
    const a = w.apps.find(x => x.id === appId);
    if (!a || (a.versions ?? []).some(x => x.n >= v.n)) return w;
    let n: Workspace = { ...w, docs: w.docs.map(d => (d.app === appId && d.tag.en === CURRENT.en ? { ...d, tag: EARLIER } : d)) };
    if (v.doc) n = addDoc({ id: v.doc, name: o.name, kind: "pdf", size: v.size ?? 0, by: "agent", at: v.at, app: appId, tag: CURRENT, ...(v.path ? { path: v.path } : {}) })(n);
    n = setApp(appId, { versions: [...(a.versions ?? []), v].slice(-KEEP_VERSIONS) })(n);
    const cards = n.approvals.filter(x => x.kind === "file" && x.app === appId);
    if (!v.read.ok) {
      // not ready, and the exact line says why; nothing asks to file it
      const p = problemLine(v.read.problems[0]);
      for (const c of cards) n = withdraw(n, c, p);
      n = setApp(appId, { status: a.status === "ready" ? "draft" : a.status, next: B(`Not ready. ${p.en}`, `尚未就绪。${p.zh}`) })(n);
    } else {
      for (const c of cards) {
        // the card is for these exact answers (or it was put up before versions were kept, with these answers on it)
        if (c.hash === v.hash || (!c.hash && v.n === 1)) { n = { ...n, approvals: n.approvals.map(x => (x.id === c.id ? { ...x, hash: v.hash, version: v.n } : x)) }; continue; }
        n = withdraw(n, c, CHANGED_SINCE, o.fresh);
        const now = n.apps.find(x => x.id === appId)!;
        const card: Approval = { ...c, id: o.fresh, hash: v.hash, version: v.n, at: undefined, withdrawn: undefined };
        const addr = now.official ? addressProblems(now.official, Object.fromEntries(now.fields.map(f => [f.id, f.value]))) : [];
        if (readyToFile(now) && !addr.length && !preflight(n, card, o.today ?? daysFromNow(0)).errors.length) {
          n = setApp(appId, { status: "ready", next: B("Ready to file. Waiting for your approval", "可以提交，等待您批准") })(addApproval(card)(n));
        } else n = setApp(appId, { status: now.checklist.some(x => x.state === "missing") ? "needs" : "draft" })(n);
      }
    }
    const lines = v.n > 1 ? v.changed.length : Object.keys(v.answers).length;
    return audit("agent", B("Filled the agency's form", "填写了机构表格"), a.name,
      B(`${o.name.replace(/\.pdf$/, "")}: ${lines} line${lines === 1 ? "" : "s"} ${v.n > 1 ? "changed" : "filled"}${v.read.ok ? "" : ", a line doesn't match"}`, `${o.name.replace(/\.pdf$/, "")}：${v.n > 1 ? "改动" : "填写"} ${lines} 行${v.read.ok ? "" : "，有一行不符"}`))(n);
  };
}

/** What a run (or the app) needs to make versions: the workspace, how to change it, where the PDFs come from, and where
 *  a filled copy is kept (Documents in an account; this browser otherwise). */
export type FormsCtx = {
  get(): Workspace;
  apply(p: P): void;
  load?: LoadPdf;
  keep?(file: File, a: Application): Promise<{ path?: string } | void>;
  /** Only these applications (default: every one whose answers changed since its form was last filled). */
  ids?: string[];
  cache?: Map<string, FilledCopy>;
  /** What changed them, when the caller knows (otherwise worked out from where the changed lines came from). */
  by?: Bi;
};
export type FormsOut = { notes: FilledNote[]; cards: string[]; withdrawn: string[] };

const freshId = (w: Workspace, base: string) => {
  const used = new Set([...w.approvals.map(a => a.id), ...w.closed.map(a => a.id), ...w.docs.map(d => d.id)]);
  let id = base, k = 2;
  while (used.has(id)) id = `${base}-${k++}`;
  return id;
};

/** Fills again every application whose answers changed, one version each, and says what it did (for the reply). */
export async function refreshForms(c: FormsCtx): Promise<FormsOut> {
  const out: FormsOut = { notes: [], cards: [], withdrawn: [] };
  for (const id of c.ids ?? c.get().apps.map(a => a.id)) {
    const a = c.get().apps.find(x => x.id === id);
    if (!a || !needsForm(a)) continue;
    let made: FilledCopy | null;
    try { made = await fillAndRead(a, c.load ?? appPdf, c.cache); }
    catch { continue; }   // the agency's PDF didn't load here: the app fills it the next time it's open
    if (!made) continue;
    // the answers moved on while it filled (the person kept typing): the next pass takes the newest
    const now = c.get().apps.find(x => x.id === id);
    if (!now || answersHash(now) !== made.hash) continue;
    const prev = latestVersion(now), n = (prev?.n ?? 0) + 1, answers = answersOf(now);
    const changed = changedLines(prev?.answers, answers, now.fields);
    const name = `${formName(now)}, filled, version ${n}.pdf`;
    const file = new File([made.filled.pdf as BlobPart], name, { type: "application/pdf" });
    let path: string | undefined;
    try { path = (await c.keep?.(file, now) ?? undefined)?.path; } catch { /* kept as answers: the copy is filled again from them when opened */ }
    const w0 = c.get();
    const v: FormVersion = { n, at: nowIso(), hash: made.hash, answers, changed, read: { ok: made.read.ok, checked: made.read.checked, problems: problemsOf(now, made.read) },
      doc: freshId(w0, `d-form-${id}-v${n}`), ...(path ? { path } : {}), size: file.size, why: whyOf(changed, now, c.by) };
    const before = new Set(w0.approvals.map(x => x.id)), fresh = freshId(w0, `ap-${id}-v${n}`);
    c.apply(keepVersion(id, v, { name, fresh }));
    const w1 = c.get();
    out.cards.push(...w1.approvals.filter(x => !before.has(x.id)).map(x => x.id));
    out.withdrawn.push(...[...before].filter(x => !w1.approvals.some(y => y.id === x) && w1.closed.some(y => y.id === x && y.withdrawn)));
    const p = v.read.problems[0];
    out.notes.push({ app: id, form: formName(now), title: now.name, version: n, changed: n > 1 ? changed.length : 0, filled: Object.keys(answers).length, doc: v.doc, ...(path ? { path } : {}),
      ok: v.read.ok, ...(p ? { problem: problemLine(p) } : {}) });
  }
  return out;
}

/** Can this card be filed now? Not when it was taken back, not when the answers changed since it was put up, and not
 *  when the filled form doesn't match its answers. When it can: the version it files. */
export function fileable(w: Workspace, ap: Approval): { ok: true; version?: FormVersion } | { ok: false; why: Bi } {
  if (ap.kind !== "file" || !ap.app) return { ok: true };
  if (ap.withdrawn) return { ok: false, why: CHANGED_SINCE };
  const a = w.apps.find(x => x.id === ap.app);
  if (!a) return { ok: true };
  const h = answersHash(a);
  if (ap.hash && ap.hash !== h) return { ok: false, why: CHANGED_SINCE };
  const v = latestVersion(a);
  if (v && v.hash === h && !v.read.ok) { const p = problemLine(v.read.problems[0]); return { ok: false, why: B(`Not ready. ${p.en}`, `尚未就绪。${p.zh}`) }; }
  return { ok: true, ...(v && v.hash === h ? { version: v } : {}) };
}

/** A version's answers as the fields a fill takes (a fill reads ids and values only). */
export const fieldsOf = (answers: Record<string, string>): Field[] => Object.entries(answers).map(([id, value]) => ({ id, label: same(id), value }));

/* ------------------------------ the preview's highlights ------------------------------ */

/** A copy of a filled form with the given lines marked (a soft yellow box around each), for the preview only. The
 *  copy that's filed or downloaded is never marked. */
export async function highlighted(pdf: Uint8Array, formId: string, answers: Record<string, string>, ids: string[]): Promise<Uint8Array> {
  if (!ids.length) return pdf;
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const form = doc.getForm(), pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const values = { ...answers };
  for (const p of addressProblems(formId, values)) delete values[p.field];
  const want = new Set(ids);
  const mark = (page: (typeof pages)[number], x: number, y: number, width: number, height: number) =>
    page.drawRectangle({ x: x - 2, y: y - 2, width: width + 4, height: height + 4, color: rgb(1, 0.86, 0.3), opacity: 0.38, borderColor: rgb(0.85, 0.5, 0.05), borderWidth: 1.2, borderOpacity: 0.9 });
  for (const wr of linesOf(formId, values)) {
    if (!wr.id || !want.has(wr.id)) continue;
    try {
      if (wr.kind === "draw") {
        const page = pages[wr.at.page]; if (!page) continue;
        const size = wr.at.size ?? 9, wide = wr.at.w ?? font.widthOfTextAtSize(wr.v, size);
        mark(page, wr.at.x, wr.at.y - 2, wide, size + 2);
        continue;
      }
      const field = form.getField(wr.name);
      for (const wd of field.acroField.getWidgets()) {
        const r = wd.getRectangle();
        const ref = doc.context.getObjectRef(wd.dict);
        const page = (ref ? doc.findPageForAnnotationRef(ref) : undefined) ?? pages[0];
        if (wr.kind === "check" && field.acroField.getWidgets().length > 1) {
          // one box of a group: mark the one that's ticked
          const on = wd.getOnValue?.()?.toString?.() ?? "";
          const ap = String(wd.getAppearanceState?.() ?? "");
          if (on && ap && on !== ap) continue;
        }
        mark(page, r.x, r.y, r.width, r.height);
      }
    } catch { /* a box this copy doesn't have */ }
  }
  return await doc.save();
}

/* ------------------------------ for the person's own typing ------------------------------ */

/** At most one fill per application every few seconds while the person types (the app's watcher waits this long). */
export const TYPING_MS = 3000;
