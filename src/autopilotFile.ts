import { B, type Bi } from "./bi";
import { audit, setApp } from "./core";
import { autopilotCheck, grantOf, storeOf, type AutopilotCheck } from "./autopilot";
import { agentOf } from "./agentPacket";
import { formById } from "./forms/registry";
import { canFill } from "./forms/canFill";
import { fillForm, stampSignature, type LoadPdf } from "./forms/fill";
import { readBack } from "./forms/readback";
import { answersHash, fieldsOf, fileable, problemLine, problemsOf } from "./forms/versions";
import type { Approval, Workspace } from "./model";

/* ------------------------------------------------------------------ *
 * Filing one Autopilot card, on the server, after the run that marked it
 * (supabase/functions/agent-run). The same filing the app makes when an
 * owner taps Approve (src/App.tsx fileOne): the agency's own form filled
 * and read back, the adopted signature placed only where src/forms/esign.ts
 * allows it, the request frozen, and Placetta started on it, which holds it
 * for the undo window like any other. Before anything, every check runs
 * again on the workspace as it is now (the owner may have turned Autopilot
 * off or changed an answer since the card was marked), and the database
 * checks the grant once more when the filing goes in (autopilot_file).
 * Pure apart from what `io` does, so the tests run it with stand-ins.
 * ------------------------------------------------------------------ */

type P = (w: Workspace) => Workspace;
export type AutofileRow = { grant: string; app_id: string; title: Bi; agency: Bi; portal_url: string | null; fee: number; payload: Record<string, unknown>; store: string; form: string };
export type AutofileIO = {
  loadPdf: LoadPdf;
  /** The signature the owner adopted in the authorization, from the vault: a PNG data URL (drawn) or the typed name.
   *  Only asked for when this form may carry it. */
  signature(grant: string): Promise<string | null>;
  /** Stores the filled form in Documents for this application; returns its storage path. */
  upload(appId: string, name: string, bytes: Uint8Array): Promise<string>;
  /** The database's autopilot_file: the filing's id, or it throws with the database's reason. */
  file(row: AutofileRow): Promise<string>;
  /** Starts Placetta on it (the dispatcher's autopilot_start). */
  start(filingId: string): Promise<void>;
};
export type AutofileResult = { patch: P; filed?: string; why?: Bi };

const fromDataUrl = (u: string) => { const b = atob(u.slice(u.indexOf(",") + 1)), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
/** The database's reason, as one plain sentence: "autopilot_cap: the fee ($120) is over ..." -> "The fee ($120) is over ...". */
export function dbWhy(message: string): Bi {
  const m = /\b(autopilot_\w+|second_owner|plan_required|filing_stopped):\s*([^\n]{1,300})/.exec(message);
  const s = m ? m[2].trim() : "Placetta's own check refused it.";
  const en = s.charAt(0).toUpperCase() + s.slice(1).replace(/\.?$/, ".");
  return B(en, `快哉的数据库核对未通过：${en}`);
}

/** Put the card back for the owner, with why. */
const keepForOwner = (apId: string, why: Bi): P => w => {
  const ap = w.approvals.find(a => a.id === apId);
  if (!ap) return w;
  return audit("agent", B("Didn't file it under Autopilot", "未在自动驾驶下提交"), ap.title, why)({ ...w, approvals: w.approvals.map(a => (a.id === apId ? { ...a, autopilot: undefined, autopilotWhy: [why] } : a)) });
};

export async function autofile(w: Workspace, apId: string, io: AutofileIO, now: string): Promise<AutofileResult> {
  const ap = w.approvals.find(a => a.id === apId);
  if (!ap?.autopilot || ap.autopilot.filing) return { patch: x => x };
  const g = grantOf(w), app = w.apps.find(a => a.id === ap.app);
  // every check again, on the workspace as it is now
  const chk: AutopilotCheck = autopilotCheck(w, ap, { now });
  if (!chk.ok || !g || !app || g.id !== ap.autopilot.grant) {
    const why = chk.needs.find(n => !n.after)?.why ?? B("Autopilot's authorization changed since it was checked.", "自动驾驶授权在核对后发生了变化。");
    return { patch: keepForOwner(apId, why), why };
  }
  const can = fileable(w, ap);
  if (!can.ok) return { patch: keepForOwner(apId, can.why), why: can.why };
  try {
    const off = app.official ? formById(app.official) : undefined;
    let pdf_path: string | undefined, signature: { name: string; title?: string; signed_at: string; kind: "typed" | "drawn"; adopted: string } | undefined;
    if (chk.sign === "adopted") signature = { name: g.by, ...(g.title ? { title: g.title } : {}), signed_at: now, kind: g.sig, adopted: g.id };
    if (off && canFill(off)) {
      const filled = await fillForm(off.id, can.version ? fieldsOf(can.version.answers) : app.fields, io.loadPdf);
      const rb = filled ? await readBack(off.id, filled) : null;
      if (rb && !rb.ok) { const why = problemLine(problemsOf(app, rb)[0]); return { patch: keepForOwner(apId, why), why }; }
      if (filled) {
        let bytes: Uint8Array = filled.pdf;
        // the adopted signature goes on the form only where the agency takes an electronic one and nothing is sworn
        if (signature && g.sig === "drawn") {
          const png = await io.signature(g.id);
          const stamped = png?.startsWith("data:image/png;base64,") ? await stampSignature(bytes, fromDataUrl(png), off.id) : null;
          if (stamped) bytes = stamped; else signature = { ...signature, kind: "typed" };
        }
        pdf_path = await io.upload(app.id, `${off.form.split(" (")[0]}${signature ? " signed" : ""}.pdf`, bytes);
      }
    }
    const docs = app.checklist.map(c => (c.doc ? w.docs.find(d => d.id === c.doc) : undefined));
    const payload = {
      form: app.form, source: app.source, does: ap.does, official: app.official, ...(pdf_path ? { pdf_path } : {}), ...(signature ? { signature } : {}),
      answers_hash: answersHash(app), ...(can.version ? { version: can.version.n } : {}),
      fields: app.fields.map(f => ({ id: f.id, label: f.label, value: f.value, from: f.from })),
      checklist: app.checklist.map((c, i) => ({ label: c.label, state: c.state, doc: docs[i]?.path })),
      attachments: docs.filter((d): d is NonNullable<typeof d> => !!d?.path).map(d => ({ name: d.name, path: d.path! })),
      autopilot: { grant: g.id, sign: chk.sign, passed: chk.passed },
      // sent by Placetta as the business's agent: the signed packet, its agent of record, and the owner's pages for this form
      ...(chk.passed.includes("agent authority") && agentOf(w) ? { agent: { auth: agentOf(w)!.id, by: agentOf(w)!.agent,
        signed: agentOf(w)!.items.filter(i => i.form === app.official && i.doc).map(i => i.doc!) } } : {}),
    };
    const id = await io.file({ grant: g.id, app_id: app.id, title: ap.title, agency: app.agency, portal_url: app.source.url || null, fee: chk.fee ?? 0, payload, store: storeOf(w, app.id), form: app.official! });
    await io.start(id).catch(() => undefined);   // the dispatcher's sweep starts it if this call didn't
    const patch: P = x => audit("agent", B("Filed for you under Autopilot", "在自动驾驶下为您提交"), ap.title, B(`Within ${g.by}'s authorization of ${g.at.slice(0, 10)}. You can undo it from the filing while it's held.`, `在 ${g.by} 于 ${g.at.slice(0, 10)} 签署的授权范围内。在发出前可于申报中撤销。`))(
      setApp(app.id, { status: "filing" })({ ...x, approvals: x.approvals.filter(a => a.id !== apId), closed: [...x.closed, { ...ap, autopilot: { ...ap.autopilot!, filing: id } }] }));
    return { patch, filed: id };
  } catch (e) {
    const why = dbWhy(String((e as Error)?.message ?? e));
    return { patch: keepForOwner(apId, why), why };
  }
}

/** Every marked card in the workspace, one after another: the patches to save, and what was filed. */
export async function autofileAll(w0: Workspace, io: AutofileIO, now: string): Promise<{ patches: P[]; filed: string[]; kept: { app: string; why: Bi }[] }> {
  let w = w0;
  const patches: P[] = [], filed: string[] = [], kept: { app: string; why: Bi }[] = [];
  for (const ap of w0.approvals.filter((a: Approval) => a.autopilot && !a.autopilot.filing)) {
    const r = await autofile(w, ap.id, io, now);
    w = r.patch(w); patches.push(r.patch);
    if (r.filed) filed.push(r.filed); else if (r.why) kept.push({ app: ap.app ?? "", why: r.why });
  }
  return { patches, filed, kept };
}
