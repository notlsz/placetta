import { B, type Bi } from "./bi";
import { audit, blockersSay, dropApproval, readyToFile, setApp } from "./core";
import { markSecond } from "./autonomy";
import { formById } from "./forms/registry";
import { canFill } from "./forms/canFill";
import { fillForm, type LoadPdf } from "./forms/fill";
import { readBack } from "./forms/readback";
import { answersHash, fieldsOf, fileable, problemLine, problemsOf } from "./forms/versions";
import { expediteStep } from "./expedite";
import { expediteOptions, extraFee } from "./forms/expedite";
import { preflight } from "./smart";
import { filingKindOf, IN_PLAN } from "./overage";
import { dbWhy } from "./autopilotFile";
import type { Approval, Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * Approving a filing by text (supabase/functions/odelia-sms, agent-run
 * "text_approve"): an owner replies "YES 4821" to the text that put the
 * card in front of them. It's the same filing the app makes when that
 * owner taps Approve (src/App.tsx fileOne), with the same checks first:
 * the card's answers unchanged, nothing blank or missing, the second
 * look's errors, and then the database's own (text_approve_file): an
 * owner of the workspace, the updated Terms accepted, a second owner
 * when a business rule wants one, the plan or the license paid, and the
 * fee within the owner's Autopilot caps (or the text cap without them).
 * What can't go by text says why and points to the app: a purchase, a
 * message, a change, a Placetta charge that needs its price shown, a
 * signature to draw. No signature is placed from a text: the form goes
 * unsigned, and the filing asks for the signature as it would from the
 * app when nothing was drawn. The filing is held for the undo window
 * like every other. Pure apart from what `io` does.
 * ------------------------------------------------------------------ */

type P = (w: Workspace) => Workspace;
export type TextFileRow = { app_id: string; approval: string; title: Bi; agency: Bi; portal_url: string | null; fee: number; payload: Record<string, unknown> };
/** What the database said: filed (the filing's id), waiting for a second owner, or refused with its reason. */
export type TextFileResult = { result: "filed"; id: string } | { result: "waiting" } | { result: "refused"; why: string };
export type TextApproveIO = {
  loadPdf: LoadPdf;
  /** Stores the filled form in Documents for this application; returns its storage path. */
  upload(appId: string, name: string, bytes: Uint8Array): Promise<string>;
  /** The database's text_approve_file. */
  file(row: TextFileRow): Promise<TextFileResult>;
  /** Starts Placetta on it (the dispatcher's text_start), which holds it for the undo window. */
  start(filingId: string): Promise<void>;
};
export type TextApproveOutcome = { patch: P; say: Bi; filed?: string; waiting?: boolean };

const keep: P = w => w;
const no = (say: Bi): TextApproveOutcome => ({ patch: keep, say });

/** The database's reason as one plain sentence: "text_cap: fees over $250 are approved in the app" becomes "Not filed.
 *  Fees over $250 are approved in the app." */
export function textWhy(message: string): Bi {
  const m = /\b(text_cap|owner_only|terms_version|already_filed|plan_required|second_owner):\s*([^\n]{1,300})/.exec(message);
  if (!m) return dbWhy(message);
  const s = m[2].trim(), en = s.charAt(0).toUpperCase() + s.slice(1).replace(/\.?$/, ".");
  return B(`Not filed. ${en}`, `未提交。快哉的核对未通过：${en}`);
}

/** Which cards a text may approve: a filing's own card, not one Autopilot is filing, nothing withdrawn. */
export function textApprovable(a: Approval | undefined): boolean {
  return !!a && a.kind === "file" && !!a.app && !a.autopilot && !a.withdrawn && !a.purchase;
}

/** The words a text says about a card it can't approve. */
export const NOT_BY_TEXT = B("That one can't be approved by text. Open it in Placetta to approve it.", "这一项不能通过短信批准。请在快哉中打开并批准。");

export async function textApprove(w: Workspace, apId: string, io: TextApproveIO, o: { by: string; now: string; lang?: "en" | "zh" }): Promise<TextApproveOutcome> {
  const ap = w.approvals.find(a => a.id === apId);
  if (!ap) return no(B("That approval isn't waiting anymore. Nothing was filed.", "这项批准已不在等待中。没有提交任何内容。"));
  if (!textApprovable(ap)) return no(NOT_BY_TEXT);
  const app = w.apps.find(a => a.id === ap.app);
  if (!app) return no(B("That application is gone. Nothing was filed.", "这份申请已不存在。没有提交任何内容。"));
  // the same checks as the app's Approve, on the workspace as it is now
  const can = fileable(w, ap);
  if (!can.ok) return no(can.why);
  if (!readyToFile(app)) return no(blockersSay(app));
  const pf = preflight(w, ap, o.now.slice(0, 10));
  if (pf.errors.length) return no(B(`Not yet: ${pf.errors.map(e => `${e.label.en} (${e.note.en})`).join("; ")}`, `还不能提交：${pf.errors.map(e => `${e.label.zh}（${e.note.zh}）`).join("；")}`));
  // a filing with a Placetta charge of its own is approved where its price is shown
  if (!IN_PLAN.includes(filingKindOf(app))) return no(B("This filing has a Placetta charge. Approve it in the app, where the price is shown. Nothing was charged.", "这份申报有快哉的收费。请在应用中查看价格后批准。未收取任何费用。"));
  const fee = app.fees.reduce((s, f) => s + f.amount, 0);
  try {
    const off = app.official ? formById(app.official) : undefined;
    let pdf_path: string | undefined;
    if (off && canFill(off)) {
      const filled = await fillForm(off.id, can.version ? fieldsOf(can.version.answers) : app.fields, io.loadPdf);
      const rb = filled ? await readBack(off.id, filled) : null;
      if (rb && !rb.ok) { const p = problemLine(problemsOf(app, rb)[0]); return no(B(`Not filed. ${p.en}`, `还不能提交。${p.zh}`)); }
      if (filled) pdf_path = await io.upload(app.id, `${off.form.split(" (")[0]}.pdf`, filled.pdf);
    }
    const docs = app.checklist.map(c => (c.doc ? w.docs.find(d => d.id === c.doc) : undefined));
    const x = app.expedite ? expediteOptions(app.official).find(e => e.id === app.expedite) : undefined;
    const payload = {
      form: app.form, source: app.source, does: [...ap.does, ...(expediteStep(app) ? [expediteStep(app)!] : [])], official: app.official, ...(pdf_path ? { pdf_path } : {}),
      answers_hash: answersHash(app), ...(can.version ? { version: can.version.n } : {}),
      ...(x ? { expedite: { id: x.id, label: x.label, turnaround: x.turnaround, fee_usd: extraFee(x, app.fields), how: x.how, source: x.source.url } } : {}),
      fields: app.fields.map(f => ({ id: f.id, label: f.label, value: f.value, from: f.from })),
      checklist: app.checklist.map((c, i) => ({ label: c.label, state: c.state, doc: docs[i]?.path })),
      attachments: docs.filter((d): d is NonNullable<typeof d> => !!d?.path).map(d => ({ name: d.name, path: d.path! })),
      approved_by_text: { at: o.now },
    };
    const r = await io.file({ app_id: app.id, approval: ap.id, title: ap.title, agency: app.agency, portal_url: app.source.url || null, fee, payload });
    if (r.result === "waiting") {
      return {
        patch: w2 => audit("you", B("Approved by text, one of two owners", "通过短信批准（两位所有者之一）"), ap.title)(ap.second ? markSecond(ap.id, o.by)(w2) : w2),
        say: B("Recorded your approval. Under your business rule another owner approves it too, in the app or by text, before it goes in.", "已记录您的批准。按您的业务规则，还需另一位所有者在应用中或通过短信批准后才会提交。"),
        waiting: true,
      };
    }
    if (r.result === "refused") return no(textWhy(r.why));
    await io.start(r.id).catch(() => undefined);   // the dispatcher's sweep starts it if this call didn't
    const name = app.name;
    return {
      patch: w2 => audit("you", B("Approved by text", "通过短信批准"), ap.title)(setApp(app.id, { status: "filing" })(dropApproval(ap.id)(w2))),
      say: B(`Approved. Filing the ${name.en.toLowerCase()} now. You can undo it in Placetta until it leaves.`, `已批准。正在提交${name.zh}。在发出之前，您可以在快哉中撤销。`),
      filed: r.id,
    };
  } catch (e) {
    return no(textWhy(String((e as Error)?.message ?? e)));
  }
}
