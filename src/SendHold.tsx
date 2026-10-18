import { useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import { audit } from "./core";
import type { Filing } from "./cloud/api";
import { holdOf, sendHeld, sendingIn, timeLeft, undoHold, useHolds, useTick, type Hold } from "./hold";
import { I } from "./ui";

/* The undo window on screen (src/hold.ts): "Sending in 9:58" with Undo, on the approval, on the filing's live card and
   in Updates. Nothing here blocks: when the time is up it goes, and Send now ends the wait early. */

/** The countdown and its two actions. Without onUndo (a member looking at an owner's filing) it only counts. */
export function HoldBar({ until, onUndo, onSendNow, compact }: { until: string | number; onUndo?: () => Promise<void> | void; onSendNow?: () => void; compact?: boolean }) {
  const { b, lang } = useApp();
  const now = useTick(true);
  const [going, setGoing] = useState(false);
  const left = timeLeft(until, now);
  return (
    <div className={"hold" + (compact ? " compact" : "")} role="status" aria-live="off">
      <span className="hold-t"><I.clock /><b>{left > 0 ? b(sendingIn(left)) : b(B("Sending now", "正在发送"))}</b>
        {!compact && <small>{b(B("Nothing has left Placetta yet.", "还没有任何内容发出。"))}</small>}</span>
      {left > 0 && onUndo && <button type="button" className="pill ink sm hold-undo" disabled={going} onClick={() => { setGoing(true); void Promise.resolve(onUndo()).finally(() => setGoing(false)); }}>{lang === "zh" ? "撤销" : "Undo"}</button>}
      {left > 0 && onSendNow && <button type="button" className="lnk quiet hold-now" disabled={going} onClick={onSendNow}>{lang === "zh" ? "立即发送" : "Send now"}</button>}
    </div>
  );
}

/** A send this tab is holding (the sample's filings, a message from your own mailbox), shown where its approval was. */
export function LocalHold({ hold, compact }: { hold: Hold; compact?: boolean }) {
  const { lang, say, editWs } = useApp();
  const undo = () => {
    if (!undoHold(hold.key)) return;
    editWs(audit("you", B("Undid the send before anything left", "在发出前撤销了发送"), hold.title));
    say(lang === "zh" ? "已撤销，没有发出任何内容。准备好后可以再次批准。" : "Undone. Nothing was sent. Approve it again when you're ready.");
  };
  return <HoldBar until={hold.until} onUndo={undo} onSendNow={() => sendHeld(hold.key)} compact={compact} />;
}

/** The hold on one approval, if it has one: what NeedRow shows instead of its Approve button. */
export function useApprovalHold(id: string): Hold | undefined {
  useHolds();
  return holdOf(id);
}

/** An account's filing while the server holds it. Owners can undo it or send it now; members see the countdown. */
export function FilingHold({ f, compact }: { f: Filing; compact?: boolean }) {
  const { b, cloud } = useApp();
  if (f.agent_state !== "held" || !f.send_after) return null;
  return (
    <>
      <HoldBar until={f.send_after} compact={compact} onUndo={cloud?.owner ? () => cloud.undoFiling(f.id) : undefined} onSendNow={cloud?.owner ? () => void cloud.sendFilingNow(f.id) : undefined} />
      {!cloud?.owner && <p className="note hold-note">{b(B("An owner of this workspace can undo it until then.", "在此之前，工作区所有者可以撤销。"))}</p>}
    </>
  );
}

/** Everything waiting to be sent, at the top of Updates. */
export function HeldSends() {
  const { b, cloud } = useApp();
  const local = useHolds();
  const held = (cloud?.filings ?? []).filter(f => f.agent_state === "held" && f.send_after);
  if (!local.length && !held.length) return null;
  return (
    <ul className="updates held-list">
      {local.map(h => (
        <li key={h.key} className="upd k-filing unread">
          <span className="upd-ic" aria-hidden="true"><I.clock /></span>
          <div className="upd-tx"><p className="upd-t">{b(h.title)}</p><LocalHold hold={h} compact /></div>
        </li>
      ))}
      {held.map(f => (
        <li key={f.id} className="upd k-filing unread">
          <span className="upd-ic" aria-hidden="true"><I.clock /></span>
          <div className="upd-tx"><p className="upd-t">{b(f.title)}</p><FilingHold f={f} compact /></div>
        </li>
      ))}
    </ul>
  );
}
