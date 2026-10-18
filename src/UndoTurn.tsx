import { useState } from "react";
import { useApp } from "./ctx";
import { undoRun } from "./rewind";
import { I } from "./ui";
import "./controls.css";

/* "Undo what she did" on a finished turn in the chat (src/rewind.ts): one tap asks, the second puts back what that run
   changed. What people changed since stays, and what already left Placetta is listed. */

const UndoIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;

export function UndoTurn({ id }: { id: string }) {
  const { b, lang, ws, busy, editWs, cloud, say } = useApp();
  const [ask, setAsk] = useState(false);
  const pt = (ws.undo ?? []).find(x => x.id === id);
  if (!pt) return null;
  const zh = lang === "zh";
  if (pt.done) {
    const d = pt.done;
    return (
      <div className="undo undo-done" role="status">
        <b><UndoIcon />{zh ? `已撤销：恢复了 ${d.undone} 项` : `Undone: ${d.undone} change${d.undone === 1 ? "" : "s"} put back`}</b>
        {d.kept.length > 0 && <><h4>{zh ? "保留（之后有人改过）" : "Kept (changed since by someone)"}</h4><ul>{d.kept.map((x, i) => <li key={i}>{b(x)}</li>)}</ul></>}
        {d.out.length > 0 && <><h4>{zh ? "无法撤销（已离开快哉）" : "Can't be undone (already left Placetta)"}</h4><ul>{d.out.map((x, i) => <li key={i}>{b(x)}</li>)}</ul></>}
      </div>
    );
  }
  const n = pt.recs.length;
  const go = () => {
    const filed = new Set((cloud?.filings ?? []).filter(f => f.status !== "canceled").map(f => f.app_id));
    editWs(undoRun(id, { filed, serverDocs: !!cloud, by: cloud?.email }));
    setAsk(false);
    say(zh ? "已撤销她这一轮的操作。" : "Undone. What she changed in that turn is back the way it was.");
  };
  return (
    <div className="undo">
      {ask ? (
        <div className="undo-ask">
          <p>{zh ? `撤销她这一轮做的 ${n} 项更改？之后别人做的改动会保留，已经提交、发送或付款的无法撤销。` : `Put back the ${n} change${n === 1 ? "" : "s"} she made in this turn? Edits people made since stay, and anything already filed, sent or paid can't be undone.`}</p>
          <span className="ua-btns">
            <button type="button" className="pill quiet sm" onClick={() => setAsk(false)}>{zh ? "保留" : "Keep it"}</button>
            <button type="button" className="pill ink sm" disabled={busy} onClick={go}><span>{zh ? "撤销" : "Undo"}</span><i aria-hidden="true"><I.check /></i></button>
          </span>
        </div>
      ) : (
        <button type="button" className="undo-b" disabled={busy} onClick={() => setAsk(true)}><UndoIcon />{zh ? "撤销她这次的操作" : "Undo what she did"}</button>
      )}
    </div>
  );
}
