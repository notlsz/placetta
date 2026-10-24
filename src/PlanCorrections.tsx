import { useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import type { Application, Workspace } from "./model";
import {
  businessDaysBetween, designerPrompt, explainPrompt, newRound, notEnglish, progress, responseLetter, waitingOn, WHO,
  type CorrectionItem, type CorrectionRound, type CorrectionWho,
} from "./corrections";
import { audit } from "./core";
import { saveFile } from "./files";
import { daysFromNow, fmtDay } from "./time";
import { I, Select } from "./ui";
import "./corrections.css";

/* Plan review corrections (src/corrections.ts), in the permit's checklist tab: paste what the agency sent back, and
   each comment becomes a line with who fixes it, the response and whether it's done; a target two business days out;
   the response letter, ready to download; and Odelia explains each comment in Chinese and drafts the responses, or
   writes the email to the architect for the owner to approve. Shown once the application is with the agency, or
   when a round is already on file. */

const OPEN_STATUSES = ["review", "needs", "filing"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function Corrections({ a }: { a: Application }) {
  const { ws, lang, editWs } = useApp();
  const rounds = (ws.corrections ?? []).filter(r => r.app === a.id).sort((x, y) => y.round - x.round);
  const cur = rounds[0];
  const [adding, setAdding] = useState(false);
  if (!cur && !OPEN_STATUSES.includes(a.status)) return null;
  const zh = lang === "zh";
  const set = (f: (rs: CorrectionRound[]) => CorrectionRound[], log?: Parameters<typeof audit>) =>
    editWs(w => { const next: Workspace = { ...w, corrections: f(w.corrections ?? []) }; return log ? audit(...log)(next) : next; });
  if (!cur || adding) return <AddRound a={a} earlier={rounds} onCancel={cur ? () => setAdding(false) : undefined} onAdd={r => {
    set(rs => [...rs, r], ["you", B(`Added round ${r.round} of plan review comments`, `添加第 ${r.round} 轮审图意见`), a.name, B(`${r.items.length} comments, back by ${r.target}`, `${r.items.length} 条意见，目标 ${r.target} 前回复`)]);
    setAdding(false);
  }} zh={zh} />;
  return <Round a={a} r={cur} zh={zh} set={set} onNext={() => setAdding(true)} />;
}

function AddRound({ a, earlier, onAdd, onCancel, zh }: { a: Application; earlier: CorrectionRound[]; onAdd: (r: CorrectionRound) => void; onCancel?: () => void; zh: boolean }) {
  const [open, setOpen] = useState(!!onCancel);
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  if (!open) return (
    <section className="cr cr-ask">
      <div>
        <b>{zh ? "机构发回了修改意见？" : "Did the agency send corrections?"}</b>
        <p>{zh ? "把审图意见贴在这里：每条意见变成一项，写明由谁修改、怎么回复，快哉按审图员要的格式写好回复函，目标 2 个工作日内重新提交。" : "Paste the reviewer's comments. Each one becomes a line with who fixes it and the response, and Placetta writes the response letter the reviewer expects. The target is back to the agency in 2 business days."}</p>
      </div>
      <button type="button" className="pill quiet sm" onClick={() => setOpen(true)}>{zh ? "添加意见" : "Add comments"}</button>
    </section>
  );
  const go = () => {
    const r = newRound(a.id, text, daysFromNow(0), earlier, ref);
    if (!r) { setErr(zh ? "没有读到意见。请贴上机构发来的文字，每条一行或按编号。" : "No comments found. Paste the agency's text, one comment a line or numbered."); return; }
    onAdd(r);
  };
  return (
    <section className="cr cr-new">
      <h3>{earlier.length ? (zh ? `第 ${earlier[0].round + 1} 轮修改意见` : `Round ${earlier[0].round + 1} of corrections`) : (zh ? "机构的修改意见" : "The agency's corrections")}</h3>
      <label className="cr-l">{zh ? "审图意见（按原文贴上）" : "Comments, as the agency wrote them"}
        <textarea rows={6} value={text} onChange={e => { setText(e.target.value); setErr(""); }} placeholder={zh ? "1. 在 A-2 图上标明洗手池位置……\n2. 提供设备规格书……" : "1. Show the hand sink location on sheet A-2...\n2. Provide equipment spec sheets..."} />
      </label>
      <label className="cr-l">{zh ? "审图或许可编号（可选）" : "Plan check or permit number (optional)"}
        <input value={ref} onChange={e => setRef(e.target.value)} maxLength={60} />
      </label>
      {err && <p className="cr-err" role="alert">{err}</p>}
      <div className="cr-act">
        <button type="button" className="pill ink sm" onClick={go} disabled={!text.trim()}>{zh ? "逐条整理" : "Sort them out"}<i><I.arrow /></i></button>
        {onCancel && <button type="button" className="pill quiet sm" onClick={onCancel}>{zh ? "取消" : "Cancel"}</button>}
      </div>
    </section>
  );
}

function Round({ a, r, zh, set, onNext }: { a: Application; r: CorrectionRound; zh: boolean; set: (f: (rs: CorrectionRound[]) => CorrectionRound[], log?: Parameters<typeof audit>) => void; onNext: () => void }) {
  const { ws, ask, busy, say } = useApp();
  const lang = zh ? "zh" : "en";
  const p = progress(r), wait = waitingOn(r), cn = notEnglish(r);
  const today = daysFromNow(0), left = businessDaysBetween(today, r.target);
  const patch = (id: string, f: (i: CorrectionItem) => CorrectionItem) => set(rs => rs.map(x => x.id === r.id ? { ...x, items: x.items.map(i => i.id === id ? f(i) : i) } : x));
  const store = (ws.stores ?? []).find(s => s.apps?.includes(a.id));
  const letter = () => responseLetter(r, { business: ws.business.en, address: store?.address, application: a.name.en, agency: a.agency.en, today });
  const download = async () => {
    const res = await saveFile(`${slug(a.name.en)}-plan-review-response-round-${r.round}.txt`, new Blob([letter()], { type: "text/plain;charset=utf-8" }));
    if (res === "unavailable") say(zh ? "这里无法下载文件。" : "Downloads aren't available here.");
  };
  const clock = r.sent ? (zh ? `已于 ${fmtDay(r.sent, "zh", true)} 重新提交` : `Resubmitted ${fmtDay(r.sent, "en", true)}`)
    : left > 0 ? (zh ? `目标：${fmtDay(r.target, "zh")}前交回机构（还剩 ${left} 个工作日）` : `Back to the agency by ${fmtDay(r.target, "en")} (${left} business day${left === 1 ? "" : "s"} left)`)
    : left === 0 ? (zh ? "目标：今天交回机构" : "Back to the agency today")
    : (zh ? `已超过目标 ${-left} 个工作日` : `${-left} business day${left === -1 ? "" : "s"} past the target`);
  const who = (["designer", "owner", "odelia"] as CorrectionWho[]).filter(k => wait[k]).map(k => zh ? `${WHO[k].zh} ${wait[k]} 项` : `${WHO[k].en} ${wait[k]}`).join(zh ? "，" : ", ");
  const designer = designerPrompt(r, zh ? a.name.zh : a.name.en, zh ? a.agency.zh : a.agency.en, lang);
  return (
    <section className="cr">
      <header className="cr-h">
        <div>
          <h3>{zh ? `第 ${r.round} 轮修改意见` : `Corrections, round ${r.round}`}{r.reference && <small>{r.reference}</small>}</h3>
          <p className={"cr-clock" + (!r.sent && left < 0 ? " late" : "")}>{clock}</p>
        </div>
        <span className="cr-n"><b>{p.done}</b>/{p.of}<small>{zh ? "已完成" : "done"}</small></span>
      </header>
      <div className="cr-bar" aria-hidden="true"><i style={{ width: `${p.of ? Math.round((p.done / p.of) * 100) : 0}%` }} /></div>
      {who && !r.sent && <p className="cr-wait">{zh ? "待处理：" : "Waiting on: "}{who}</p>}
      <ol className="cr-list">
        {[...r.items].sort((x, y) => x.n - y.n).map(i => (
          <li key={i.id} className={i.done ? "done" : ""}>
            <div className="cr-top">
              <span className="cr-num">{i.n}</span>
              <p className="cr-text" lang="en">{i.text}</p>
              {i.sheet && <span className="cr-sheet">{zh ? "图纸" : "Sheet"} {i.sheet}</span>}
            </div>
            <div className="cr-row">
              <Select sz="sm" aria-label={zh ? "由谁修改" : "Who fixes it"} value={i.who} disabled={!!r.sent} onChange={e => patch(i.id, x => ({ ...x, who: e.target.value as CorrectionWho }))}>
                {(["designer", "owner", "odelia"] as CorrectionWho[]).map(k => <option key={k} value={k}>{zh ? WHO[k].zh : WHO[k].en}</option>)}
              </Select>
              <label className="cr-done"><input type="checkbox" checked={i.done} disabled={!!r.sent} onChange={e => patch(i.id, x => ({ ...x, done: e.target.checked }))} />{zh ? "已改好" : "Done"}</label>
            </div>
            <textarea className="cr-resp" rows={2} value={i.response} disabled={!!r.sent} aria-label={zh ? `第 ${i.n} 条的回复` : `Response to comment ${i.n}`}
              placeholder={zh ? "回复（交给机构的是英文）" : "Response to the reviewer"} onChange={e => patch(i.id, x => ({ ...x, response: e.target.value }))} />
          </li>
        ))}
      </ol>
      {cn.length > 0 && !r.sent && <p className="cr-note">{zh ? `第 ${cn.map(i => i.n).join("、")} 条的回复是中文。回复函交给机构用英文，可以让 Odelia 翻译。` : `Comment${cn.length === 1 ? "" : "s"} ${cn.map(i => i.n).join(", ")} ${cn.length === 1 ? "has a" : "have"} response${cn.length === 1 ? "" : "s"} in Chinese. The letter goes to the agency in English; Odelia can translate.`}</p>}
      <div className="cr-act">
        {!r.sent && <button type="button" className="pill primary sm" disabled={busy} onClick={() => ask(explainPrompt(r, zh ? a.name.zh : a.name.en, zh ? a.agency.zh : a.agency.en, lang))}>{zh ? "用中文解释并起草回复" : "Explain and draft the responses"}<i><I.spark /></i></button>}
        {!r.sent && designer && <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(designer)}>{zh ? "发给建筑师" : "Send drawing items to the architect"}</button>}
        <button type="button" className="pill quiet sm" onClick={download}><I.download />{zh ? "下载回复函" : "Response letter"}</button>
        {!r.sent ? (
          <button type="button" className="pill quiet sm" disabled={p.done < p.of} title={p.done < p.of ? (zh ? "每条都改好后才能标记" : "Mark every comment done first") : undefined}
            onClick={() => set(rs => rs.map(x => x.id === r.id ? { ...x, sent: today } : x), ["you", B(`Resubmitted round ${r.round} of plan review corrections`, `重新提交第 ${r.round} 轮审图修改`), a.name])}>
            {zh ? "已重新提交" : "Mark resubmitted"}
          </button>
        ) : <button type="button" className="pill quiet sm" onClick={onNext}>{zh ? "又收到一轮意见" : "Another round of comments"}</button>}
      </div>
    </section>
  );
}
