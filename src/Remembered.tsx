import { useState, type ReactNode } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import type { Recall } from "./model";
import { confirmRecall, forgetRecall, KIND_LABEL, restoreRecall } from "./recall";
import { I } from "./ui";
import { fmtDay } from "./time";
import { viaWords } from "./core";
import "./recall-metrics.css";

/* What Odelia kept from what you said (src/recall.ts), where you see it: chips under the reply that kept it, and the
   list in Settings, Memory. Forget is one tap and can be undone; a suggestion from outside the app waits for Save. */

/** The chips under a reply: Remembered, with Forget (then Undo); or Suggested, not saved, with Save and Dismiss. */
export function RememberedChips({ items }: { items: { id: string; text: Bi; suggested?: boolean }[] }) {
  const { b, lang, memory, me, editWs, say } = useApp();
  const [gone, setGone] = useState<Record<string, Recall>>({});
  const zh = lang === "zh";
  const live = memory?.items ?? [];
  const forget = (it: Recall) => { setGone(g => ({ ...g, [it.id]: it })); editWs(forgetRecall(it.id)); say(zh ? "已忘记" : "Forgotten"); };
  const undo = (it: Recall) => { editWs(restoreRecall(me, it)); setGone(g => { const n = { ...g }; delete n[it.id]; return n; }); };
  const shown = items.filter(c => gone[c.id] || live.some(x => x.id === c.id));
  if (!shown.length) return null;
  return (
    <div className="rmb" role="group" aria-label={zh ? "记住的内容" : "What Odelia remembered"}>
      {shown.map(c => {
        const off = gone[c.id], it = live.find(x => x.id === c.id);
        if (off) return (
          <p key={c.id} className="rmb-chip off">
            <span className="rmb-k">{zh ? "已忘记" : "Forgotten"}</span><span className="rmb-t">{b(c.text)}</span>
            <button type="button" className="rmb-b" onClick={() => undo(off)}>{zh ? "撤销" : "Undo"}</button>
          </p>
        );
        if (!it) return null;
        if (it.status === "suggested") return (
          <p key={c.id} className="rmb-chip sug">
            <span className="rmb-k">{zh ? "建议记住，尚未保存" : "Suggested, not saved"}</span><span className="rmb-t">{b(c.text)}</span>
            <button type="button" className="rmb-b" onClick={() => editWs(confirmRecall(me, it.id))}>{zh ? "保存" : "Save"}</button>
            <button type="button" className="rmb-b quiet" onClick={() => editWs(forgetRecall(it.id))}>{zh ? "不用" : "Dismiss"}</button>
          </p>
        );
        return (
          <p key={c.id} className="rmb-chip">
            <I.spark /><span className="rmb-k">{zh ? "已记住" : "Remembered"}</span><span className="rmb-t">{b(c.text)}</span>
            <button type="button" className="rmb-b" onClick={() => forget(it)} aria-label={zh ? `忘记：${b(c.text)}` : `Forget: ${b(c.text)}`}>{zh ? "忘记" : "Forget"}</button>
          </p>
        );
      })}
    </div>
  );
}

/** Settings, Memory: every detail Odelia keeps from what you said, with the sentence it came from and when, one tap from
 *  Forget (with Undo); and the suggestions from texts, calls and emails, which nothing uses until you save them. */
export function RememberedList() {
  const { b, lang, memory, me, editWs } = useApp();
  const [last, setLast] = useState<Recall | null>(null);
  const zh = lang === "zh";
  const items = memory?.items ?? [];
  const suggested = items.filter(x => x.status === "suggested"), saved = items.filter(x => x.status === "saved").slice().reverse();
  const when = (x: Recall) => fmtDay(x.at.slice(0, 10), lang, true);
  const row = (x: Recall, acts: ReactNode) => (
    <li key={x.id} className="rmb-row">
      <span className="rmb-tx">
        <small className="rmb-kind">{b(KIND_LABEL[x.kind])}</small>
        <b>{b(x.text)}</b>
        <q>{x.source}</q>
        <small>{zh ? `${when(x)}说的${x.via ? `，${viaWords(x.via).zh}` : ""}` : `You said it ${when(x)}${x.via ? `, ${viaWords(x.via).en}` : ""}`}{x.made?.stores?.length ? (zh ? `。已把计划开业日期调整为 ${fmtDay(x.made.stores[0].to, lang, true)}` : `. Moved the planned opening to ${fmtDay(x.made.stores[0].to, lang, true)}`) : x.made?.deadline ? (zh ? "。已加入截止日期" : ". Added to Deadlines") : ""}</small>
      </span>
      <span className="rmb-acts">{acts}</span>
    </li>
  );
  return (
    <div className="sg-sub rmb-list">
      <h3>{zh ? "Odelia 从对话中记住的细节" : "Details Odelia keeps from what you said"}</h3>
      <p className="sg-note">{zh ? "说一次就够了：联系方式、合作的人、计划的限制、固定日期和服务商。Odelia 会照着做，不会用来填写申请表。" : "Say it once: how to reach you, who you work with, limits on the plan, dates that come back, your vendors. Odelia acts on them, and never fills an application from them."}</p>
      {last && (
        <p className="rmb-undo" role="status">
          <span>{zh ? `已忘记“${b(last.text)}”` : `Forgot "${b(last.text)}"`}</span>
          <button type="button" className="sbtn quiet" onClick={() => { editWs(restoreRecall(me, last)); setLast(null); }}>{zh ? "撤销" : "Undo"}</button>
        </p>
      )}
      {suggested.length > 0 && (
        <>
          <h3>{zh ? "建议记住，尚未保存" : "Suggested, not saved"}</h3>
          <p className="sg-note">{zh ? "这些来自短信、电话、邮件或聊天。您保存之前，Odelia 不会使用。" : "These came by text, call, email or chat. Odelia doesn't use them until you save them."}</p>
          <ul className="rmb-rows">{suggested.map(x => row(x, <>
            <button type="button" className="sbtn ink" onClick={() => editWs(confirmRecall(me, x.id))}>{zh ? "保存" : "Save"}</button>
            <button type="button" className="sbtn quiet" onClick={() => editWs(forgetRecall(x.id))}>{zh ? "不用" : "Dismiss"}</button>
          </>))}</ul>
        </>
      )}
      {saved.length ? (
        <ul className="rmb-rows">{saved.map(x => row(x,
          <button type="button" className="sbtn quiet" onClick={() => { setLast(x); editWs(forgetRecall(x.id)); }} aria-label={zh ? `忘记：${b(x.text)}` : `Forget: ${b(x.text)}`}>{zh ? "忘记" : "Forget"}</button>))}</ul>
      ) : <p className="sg-note">{b(B("Nothing yet. Tell Odelia how to reach you or who your contractor is, once, and it shows here.", "还没有。告诉 Odelia 一次怎么联系您、承包商是谁，就会显示在这里。"))}</p>}
    </div>
  );
}
