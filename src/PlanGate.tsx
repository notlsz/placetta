import { useState } from "react";
import { useApp } from "./ctx";
import { planApprovalId } from "./autonomy";
import type { Job } from "./jobs";
import { I } from "./ui";
import "./controls.css";

/* A plan written under Plan first (src/autonomy.ts), on its card in the chat: Approve plan starts the work the usual
   way; Change it sends what should change, and she writes the plan again. Only an owner approves. */
export function PlanGate({ job }: { job: Job }) {
  const { lang, ws, busy, approve, ask, cloud } = useApp();
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  const card = ws.approvals.find(a => a.id === planApprovalId(job.id));
  if (!card) return null;
  const zh = lang === "zh", owner = !cloud || cloud.owner;
  const change = () => {
    const w = what.trim();
    if (!w) return;
    ask(zh ? `/plan 修改“${job.title.zh}”的计划（job ${job.id}）：${w}` : `/plan Change the plan "${job.title.en}" (job ${job.id}): ${w}`);
    setWhat(""); setOpen(false);
  };
  return (
    <div className="plan-gate" role="group" aria-label={zh ? "计划等待批准" : "Plan waiting for approval"}>
      {owner ? (
        <div className="pg-btns">
          <button type="button" className="pill ink sm" disabled={busy} onClick={() => approve(card.id)}><span>{zh ? "批准计划" : "Approve plan"}</span><i aria-hidden="true"><I.check /></i></button>
          <button type="button" className="pill quiet sm" disabled={busy} aria-expanded={open} onClick={() => setOpen(v => !v)}><I.pencil />{zh ? "修改" : "Change it"}</button>
        </div>
      ) : <p className="pg-note">{zh ? "由工作区所有者批准这个计划。" : "An owner of this workspace approves this plan."}</p>}
      {open && (
        <form onSubmit={e => { e.preventDefault(); change(); }}>
          <label className="sr" htmlFor={"pg-" + job.id}>{zh ? "要改什么" : "What should change"}</label>
          <textarea id={"pg-" + job.id} autoFocus value={what} onChange={e => setWhat(e.target.value)} placeholder={zh ? "例如：先办卫生许可，再做招牌" : "For example: do the health permit before the sign"}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); change(); } }} />
          <div className="pg-btns">
            <button type="button" className="pill quiet sm" onClick={() => setOpen(false)}>{zh ? "取消" : "Cancel"}</button>
            <button type="submit" className="pill ink sm" disabled={!what.trim() || busy}><span>{zh ? "发给 Odelia" : "Send to Odelia"}</span><i aria-hidden="true"><I.arrow /></i></button>
          </div>
        </form>
      )}
    </div>
  );
}
