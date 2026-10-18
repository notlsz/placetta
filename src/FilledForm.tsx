import { useApp } from "./ctx";
import type { FilledNote } from "./core";
import type { Application, Approval } from "./model";
import { I } from "./ui";
import { answersHash, latestVersion, needsForm } from "./forms/versions";
import "./filled.css";

/* The agency's own form, filled (src/forms/versions.ts): the card a reply ends with, the line a card that was taken back
   leaves in the chat, and the filled form's state on the application sheet. */

/** "Filled: DE 1, version 2, 3 lines changed": opens the filled form on the application's sheet. */
export function FilledCard({ n }: { n: FilledNote }) {
  const { b, lang, openForm } = useApp();
  const zh = lang === "zh";
  const lines = n.version > 1 ? n.changed : n.filled;
  const meta = zh ? `第 ${n.version} 版，${n.version > 1 ? `${lines} 行有改动` : `已填 ${lines} 行`}` : `Version ${n.version}, ${lines} line${lines === 1 ? "" : "s"} ${n.version > 1 ? "changed" : "filled"}`;
  return (
    <button type="button" className={"artifact filled-card" + (n.ok ? "" : " bad")} onClick={() => openForm(n.app, n.version)}>
      <span className="atile" aria-hidden="true"><I.form /></span>
      <span className="ameta">
        <b>{zh ? `已填写：${n.form}` : `Filled: ${n.form}`}</b>
        <span>{meta}</span>
        {!n.ok && n.problem && <span className="fc-bad">{b(n.problem)}</span>}
      </span>
      <I.chevR />
    </button>
  );
}

/** A filing's card taken back because the answers changed after it was put up, with the way to the fresh one. */
export function WithdrawnRow({ a }: { a: Approval }) {
  const { b, lang, ws, openApproval } = useApp();
  const next = ws.approvals.find(x => x.id === a.withdrawn?.next) ?? ws.approvals.find(x => x.kind === "file" && x.app === a.app);
  return (
    <p className="resolved withdrawn">
      <span className="wd-ico" aria-hidden="true"><I.pause /></span>
      <span>{b(a.title)}</span>
      <em>{a.withdrawn ? b(a.withdrawn.why) : ""}</em>
      {next && <button type="button" className="linkbtn" onClick={() => openApproval(next.id)}>{lang === "zh" ? "查看新版本" : "Review the new version"}</button>}
    </p>
  );
}

/** On the sheet: which version of the filled form is current, what reading it back found, and what changed in it. */
export function FilledStatus({ a, version }: { a: Application; version?: number }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const cur = latestVersion(a);
  const v = (version ? a.versions?.find(x => x.n === version) : undefined) ?? cur;
  if (!v) return needsForm(a) ? <p className="ff-read">{zh ? "正在用这些答案填写机构表格……" : "Filling the agency's form with these answers…"}</p> : null;
  const filling = needsForm(a) || cur?.hash !== answersHash(a);
  return (
    <div className="ff">
      <p className="ff-v"><b>{zh ? `第 ${v.n} 版` : `Version ${v.n}`}</b>{v === cur ? <span>{zh ? "当前版本" : "current"}</span> : null}{v.why && <span>{b(v.why)}</span>}</p>
      <p className={"ff-read" + (v.read.ok ? " ok" : " bad")}>
        {v.read.ok ? (zh ? `已读回核对：${v.read.checked} 行都与答案一致` : `Read back: all ${v.read.checked} lines match the answers`)
          : (zh ? "还不能提交：" : "Not ready to file: ") + v.read.problems.map(p => `${b(p.label)}: ${b(p.note)}`).join(zh ? "；" : "; ")}
      </p>
      {v.n > 1 && v.changed.length > 0 && (
        <ul className="ff-changes" aria-label={zh ? `第 ${v.n} 版的改动` : `What changed in version ${v.n}`}>
          {v.changed.map(c => <li key={c.id}><span>{b(c.label)}</span><s>{c.was || (zh ? "空" : "empty")}</s><em>{c.now || (zh ? "空" : "empty")}</em></li>)}
        </ul>
      )}
      {filling && <p className="ff-read">{zh ? "答案有改动，正在填写新版本……" : "The answers changed. Filling the next version…"}</p>}
    </div>
  );
}
