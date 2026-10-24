import { useMemo, useState } from "react";
import { useApp } from "./ctx";
import { SetSheet } from "./SetUI";
import { daysFromNow } from "./time";
import { saveFile } from "./files";
import { answerQuestionnaire, openQuestionsPrompt, questionnaireCsv, splitQuestions, type QAnswer, type QState } from "./questions";
import "./trust.css";

/* Questionnaires (Stores and Permits): paste a landlord's, franchisor's, insurer's or lender's compliance questions and
   get each answered from the workspace, with where it came from. Anything not on record is left open, never guessed,
   and can go to Odelia with one tap (src/questions.ts). */

type Out = "en" | "zh" | "both";

export function QuestionnaireSheet({ onClose, store: first }: { onClose: () => void; store?: string }) {
  const { ws, lang, b, ask, busy, say } = useApp();
  const zh = lang === "zh";
  const stores = ws.stores ?? [];
  const [store, setStore] = useState(first ?? stores[0]?.id ?? "");
  const [text, setText] = useState("");
  const [out, setOut] = useState<Out>(lang);
  const [rows, setRows] = useState<QAnswer[] | null>(null);
  const qs = useMemo(() => splitQuestions(text), [text]);
  const word = (x?: { en: string; zh: string }) => !x ? "" : out === "both" ? (x.en === x.zh ? x.en : `${x.en}\n${x.zh}`) : x[out];
  const STATE: Record<QState, string> = { answered: zh ? "已根据工作区作答" : "Answered from your workspace", confirm: zh ? "发送前请核对" : "Check before you send",
    open: zh ? "工作区中没有" : "Not in your workspace", withheld: zh ? "此处不作答" : "Not answered here" };
  const n = rows ? { done: rows.filter(r => r.state === "answered" || r.state === "confirm").length, open: rows.filter(r => r.state === "open").length } : null;
  const plain = () => (rows ?? []).map(r => `${r.n}. ${r.q}\n${word(r.answer) || (zh ? "（待回答）" : "(To answer)")}`).join("\n\n");
  return (
    <SetSheet title={zh ? "回答合规问卷" : "Answer a questionnaire"} onClose={onClose} className="ts-body"
      sub={zh ? "房东、加盟总部、保险公司问的合规问题，粘贴进来，按工作区记录逐条作答并注明来源。没有记录的留空，不会编造。"
        : "Paste the compliance questions a landlord, franchisor or insurer sent. Each is answered from your records, with where it came from. Anything not on record is left open, never made up."}>
      <div className="q-in">
        {stores.length > 1 && (
          <label className="ts-field">{zh ? "回答哪家门店" : "For which store"}
            <select value={store} onChange={e => { setStore(e.target.value); setRows(null); }}>{stores.map(s => <option key={s.id} value={s.id}>{b(s.name)}</option>)}</select>
          </label>
        )}
        <label className="ts-field">{zh ? "问题（每行一个，或带编号）" : "Questions (one a line, or numbered)"}
          <textarea value={text} onChange={e => { setText(e.target.value); setRows(null); }}
            placeholder={zh ? "1. 贵店的卫生许可证是否有效？何时到期？\n2. 是否持有酒牌？\n3. 过去三年是否有违规记录？" : "1. Is your health permit current, and when does it expire?\n2. Do you hold a liquor license?\n3. Any violations in the past three years?"} />
        </label>
        <div className="ts-acts">
          <button type="button" className="pill ink sm" disabled={!qs.length} onClick={() => setRows(answerQuestionnaire(ws, qs, daysFromNow(0), store || undefined))}>
            {qs.length ? (zh ? `回答 ${qs.length} 个问题` : `Answer ${qs.length} question${qs.length === 1 ? "" : "s"}`) : (zh ? "回答" : "Answer")}
          </button>
          <div className="ck-filter" role="group" aria-label={zh ? "回答语言" : "Answer language"}>
            {(["en", "zh", "both"] as Out[]).map(k => <button key={k} type="button" aria-pressed={out === k} onClick={() => setOut(k)}>{k === "en" ? "English" : k === "zh" ? "中文" : "EN + 中文"}</button>)}
          </div>
        </div>
      </div>
      {rows && n && (
        <section className="ts-sec">
          <p className="ck-sum"><b>{zh ? `${rows.length} 个问题中 ${n.done} 个已作答` : `${n.done} of ${rows.length} answered`}</b>
            {n.open > 0 && <span>{zh ? `${n.open} 个工作区中没有` : `${n.open} not in your workspace`}</span>}</p>
          <div className="q-acts">
            <button type="button" className="pill quiet sm" onClick={async () => { try { await navigator.clipboard.writeText(plain()); say(zh ? "已复制" : "Copied"); } catch { /* fine */ } }}>{zh ? "复制全部回答" : "Copy all answers"}</button>
            <button type="button" className="pill quiet sm" onClick={() => void saveFile(`questionnaire-${daysFromNow(0)}.csv`, new Blob([questionnaireCsv(rows, out)], { type: "text/csv;charset=utf-8" }))}>{zh ? "下载表格" : "Spreadsheet"}</button>
            {n.open > 0 && <button type="button" className="pill quiet sm" disabled={busy} onClick={() => ask(openQuestionsPrompt(rows, lang))}>{zh ? "其余交给 Odelia" : "Send the rest to Odelia"}</button>}
          </div>
          <ol className="q-list">
            {rows.map(r => (
              <li key={r.n} className={"q-row " + r.state}>
                <span className="q-q">{r.n}. {r.q}</span>
                {r.answer && <span style={{ whiteSpace: "pre-line" }}>{word(r.answer)}</span>}
                <small>{STATE[r.state]}{r.from ? `: ${word(r.from).replace(/\n/g, " / ")}` : ""}</small>
              </li>
            ))}
          </ol>
        </section>
      )}
    </SetSheet>
  );
}
