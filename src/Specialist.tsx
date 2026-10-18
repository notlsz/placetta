import { useEffect, useState } from "react";
import { useApp } from "./ctx";
import { B, type Application, type Bi, type Workspace } from "./model";
import { I } from "./ui";
import * as api from "./cloud/api";
import { requestReview, reviewsFor, type ReviewRow } from "./cloud/opsApi";
import "./ode.css";

/* A person checks the work, and it says so. Every filing card shows "Checked by Odelia" (each filing passed Odelia's
   check of every line against the agency's requirements before it could go up for approval), and, where a Placetta
   specialist reviewed it, who and when: the team's two-key approval before an agency's first self-filings, or a
   review the owner asked for. Owners can ask for one on any application; the team answers within one business day. */

const cache = new Map<string, ReviewRow[]>();
export const refreshReviews = () => window.dispatchEvent(new Event("placetta:reviews"));

/** The sample workspace's reviews: its first filed application was reviewed by a specialist (sample data). */
function sampleReviews(w: Workspace): ReviewRow[] {
  const filed = w.apps.filter(a => ["review", "approved", "filing"].includes(a.status) && a.receipt);
  const first = filed[0];
  if (!first) return [];
  // the same end time the sample filing's replay uses (src/FilingLive.tsx), so the review lands just before it was sent
  const sent = w.audit.find(x => x.object.en === first.name.en && /^Submitted/.test(x.action.en))?.at ?? w.docs.find(d => d.id === first.receipt)?.at ?? new Date().toISOString();
  return [{ app_id: first.id, kind: "two_key", status: "done", reviewer_name: "Mei", reviewed_at: new Date(new Date(sent).getTime() - 10 * 60e3).toISOString(), outcome: null, comment: null, requested_at: null, due_at: null }];
}

/** This workspace's reviews, loaded once and shared by every card on the page. */
export function useReviews(): ReviewRow[] {
  const { cloud, ws } = useApp();
  const id = cloud?.wsId ?? "";
  const [rows, setRows] = useState<ReviewRow[]>(() => (id ? cache.get(id) ?? [] : sampleReviews(ws)));
  useEffect(() => {
    if (!id) { setRows(sampleReviews(ws)); return; }
    let live = true;
    const load = () => { void reviewsFor(id).then(r => { cache.set(id, r); if (live) setRows(r); }).catch(() => undefined); };
    if (!cache.has(id)) load(); else setRows(cache.get(id)!);
    window.addEventListener("placetta:reviews", load);
    return () => { live = false; window.removeEventListener("placetta:reviews", load); };
  }, [id, ws]);
  return rows;
}

const when = (iso: string, zh: boolean) => new Date(iso).toLocaleString(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** The badges on a filing card. */
export function ReviewBadges({ appId }: { appId: string }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const rows = useReviews().filter(r => r.app_id === appId);
  const done = rows.filter(r => r.status === "done" && r.reviewed_at).sort((a, b) => b.reviewed_at!.localeCompare(a.reviewed_at!))[0];
  const open = rows.find(r => r.status === "requested");
  return (
    <div className="rv-badges">
      <span className="rv-b" title={zh ? "提交前，Odelia 已对照机构现行要求核对每一行" : "Before it could go up for approval, Odelia checked every line against the agency's current requirements"}><I.check />{zh ? "已由 Odelia 核对" : "Checked by Odelia"}</span>
      {done && (
        <span className="rv-b person"><I.user /><span>{zh ? "已由快哉专员审核" : "Reviewed by a Placetta specialist"}<small>{[done.reviewer_name, when(done.reviewed_at!, zh)].filter(Boolean).join(zh ? "，" : ", ")}</small></span></span>
      )}
      {!done && open?.due_at && <span className="rv-b wait"><I.user /><span>{zh ? "快哉专员审核中" : "With a Placetta specialist"}<small>{zh ? `${when(open.due_at, zh)} 前完成` : `by ${when(open.due_at, zh)}`}</small></span></span>}
    </div>
  );
}

/** On an application: ask a specialist to review it, and see where that stands. */
export function AskSpecialist({ app }: { app: Application }) {
  const { lang, cloud, say, b } = useApp();
  const zh = lang === "zh";
  const rows = useReviews().filter(r => r.app_id === app.id && r.kind === "requested");
  const open = rows.find(r => r.status === "requested");
  const done = rows.filter(r => r.status === "done").sort((x, y) => (y.reviewed_at ?? "").localeCompare(x.reviewed_at ?? ""))[0];
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!cloud) { say(zh ? "示例工作区：在您的账户中，快哉专员会在一个工作日内审核。" : "Sample workspace: in your account, a Placetta specialist reviews it within one business day."); setAsking(false); return; }
    setBusy(true);
    try {
      await requestReview(cloud.wsId, app.id, app.name, note.trim() || undefined);
      cache.delete(cloud.wsId); refreshReviews();
      say(zh ? "已交给快哉专员，一个工作日内审核。" : "Sent to a Placetta specialist. They review it within one business day.");
      setAsking(false); setNote("");
    } catch (e) { say((e as api.ApiError).message); }
    setBusy(false);
  };
  return (
    <div className="rv-ask">
      {done && (
        <p className={"rv-done" + (done.outcome === "changes_needed" ? " warm" : "")}>
          <I.user /><span><b>{done.outcome === "changes_needed" ? (zh ? "快哉专员：需要修改" : "A Placetta specialist: changes needed") : (zh ? "快哉专员：内容无误" : "A Placetta specialist: it looks right")}</b>
            <small>{[done.reviewer_name, done.reviewed_at ? when(done.reviewed_at, zh) : ""].filter(Boolean).join(zh ? "，" : ", ")}</small>
            {done.comment && <q>{done.comment}</q>}</span>
        </p>
      )}
      {open ? (
        <p className="rv-open"><I.user /><span>{zh ? "已请快哉专员审核" : "A Placetta specialist is reviewing it"}<small>{open.due_at ? (zh ? `目标：${when(open.due_at, zh)} 前` : `Target: by ${when(open.due_at, zh)}`) : ""}</small></span></p>
      ) : asking ? (
        <form className="rv-form" onSubmit={e => { e.preventDefault(); void send(); }}>
          <label htmlFor={"rv-note-" + app.id}>{zh ? `请专员审核“${b(app.name)}”。有什么想让他们特别看的？（选填）` : `Ask a specialist to review the ${b(app.name)}. Anything you'd like them to look at? (optional)`}</label>
          <textarea id={"rv-note-" + app.id} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder={zh ? "例如：座位数是否正确？" : "For example: is the seating count right?"} />
          <div className="rv-act"><button type="button" className="sbtn quiet" onClick={() => setAsking(false)}>{zh ? "取消" : "Cancel"}</button><button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : zh ? "发送给专员" : "Send to a specialist"}</button></div>
        </form>
      ) : (!cloud || cloud.owner) ? (
        <button type="button" className="sbtn line rv-btn" onClick={() => setAsking(true)}><I.user />{zh ? "请快哉专员审核" : "Ask a Placetta specialist to review"}</button>
      ) : null}
    </div>
  );
}

export const REVIEW_KINDS: Record<string, Bi> = { two_key: B("Two-key approval", "双人审核"), requested: B("Requested review", "应要求审核") };
