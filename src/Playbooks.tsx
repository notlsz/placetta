import { useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import { allSkills } from "./skills";
import { fmtDay } from "./time";
import { I } from "./ui";
import type { Skill } from "./model";

/* Playbooks: how Odelia runs each kind of job, in the open. Each one is a harness any agent can wear: the steps, what
   done means (a separate checker holds her to it), and the files she reuses instead of rebuilding. Run one in a tap, or
   teach her a new job by answering her questions; she writes the playbook from your answers. */

const TEACH = B(
  "Interview me about a job I want you to take over. Ask what you need to run it without me: how I do it now, who's involved, which files I use, where it goes wrong, and what done looks like. Then save it as a playbook.",
  "就一项我想交给你的工作来问我。问清你不需要我也能完成它所需的信息：我现在怎么做、涉及谁、用哪些文件、容易出错的地方，以及怎样算完成。然后把它存为手册。",
);

function Card({ s }: { s: Skill }) {
  const { b, lang, ws, ask, go } = useApp();
  const [open, setOpen] = useState(false);
  const zh = lang === "zh";
  const files = (s.files ?? []).map(id => ws.docs.find(d => d.id === id || d.name === id)).filter((d): d is NonNullable<typeof d> => !!d);
  const steps = s.body.split(/\n/).map(l => l.trim()).filter(l => /^\d+[.)]/.test(l)).length;
  const origin = s.interviewed ? B("From your answers", "根据您的回答") : s.source === "placetta" ? B("From Placetta", "快哉内置") : s.source === "you" ? B("Written by you", "您编写的") : B("Learned while working", "工作中学会的");
  return (
    <li className={"pb" + (s.on ? "" : " off")}>
      <div className="pb-h">
        <span className="pb-t"><b>{b(s.name)}</b><small>{s.source === "placetta" ? (s.uses ? (zh ? `用过 ${s.uses} 次` : `Used ${s.uses}x`) : (zh ? "内置" : "Built in")) : <>{b(origin)}{s.uses ? (zh ? `，用过 ${s.uses} 次` : `, used ${s.uses}x`) : ""}{zh ? `，${fmtDay(s.updated, lang, true)}更新` : `, updated ${fmtDay(s.updated, lang, true)}`}</>}</small></span>
        <button type="button" className="sbtn line" disabled={!s.on} onClick={() => ask(zh ? `按手册“${s.name.zh}”（${s.id}）来做。` : `Run the playbook "${s.name.en}" (${s.id}).`)}><I.play />{zh ? "运行" : "Run"}</button>
      </div>
      <p className="pb-d">{b(s.description)}</p>
      <p className="pb-m">
        {steps ? <span>{zh ? `${steps} 步` : `${steps} steps`}</span> : null}
        {s.done?.length ? <span><I.check />{zh ? `${s.done.length} 项完成标准，独立检查核对` : `${s.done.length} done checks, verified by a separate reviewer`}</span> : null}
        {files.length ? <span>{zh ? `工具箱 ${files.length} 个文件` : `${files.length} files in its toolbox`}</span> : null}
      </p>
      <button type="button" className="lnk pb-tog" onClick={() => setOpen(v => !v)} aria-expanded={open}>{open ? (zh ? "收起" : "Hide") : (zh ? "查看步骤" : "See the steps")}</button>
      {open && (
        <div className="pb-body">
          <pre>{s.body}</pre>
          {s.done?.length ? <><h3>{zh ? "完成标准" : "Done means"}</h3><ul>{s.done.map((d, i) => <li key={i}>{d}</li>)}</ul></> : null}
          {files.length ? <><h3>{zh ? "工具箱" : "Toolbox"}</h3><p className="pb-files">{files.map(f => <span key={f.id}>{f.name}</span>)}</p></> : null}
          <button type="button" className="lnk" onClick={() => go("settings")}>{zh ? "在设置中编辑" : "Edit in Settings"}</button>
        </div>
      )}
    </li>
  );
}

export function PlaybooksPage() {
  const { b, lang, ws, ask } = useApp();
  const [q, setQ] = useState("");
  const zh = lang === "zh";
  const all = allSkills(ws).filter(s => s.kind !== "form");
  const match = (s: Skill) => !q.trim() || `${s.name.en} ${s.name.zh} ${s.description.en} ${s.description.zh}`.toLowerCase().includes(q.trim().toLowerCase());
  const yours = all.filter(s => s.source !== "placetta").filter(match), ours = all.filter(s => s.source === "placetta").filter(match);
  const forms = allSkills(ws).filter(s => s.kind === "form").length;
  return (
    <div className="page playbooks">
      <header className="ph">
        <div className="ph-tx">
          <h1>{zh ? "手册" : "Playbooks"}</h1>
          <p>{zh ? "Odelia 做每类工作的方法：步骤、怎样算完成（由独立检查核对），以及她会重复使用的文件。运行一本，或回答她几个问题，教她一项新工作。" : "How Odelia runs each kind of job: the steps, what done means (a separate reviewer holds her to it), and the files she reuses. Run one, or teach her a new job by answering a few questions."}</p>
        </div>
      </header>
      <section className="pb-teach">
        <div><b>{zh ? "教 Odelia 一项工作" : "Teach Odelia a job"}</b><p>{zh ? "她会问您几个问题，直到不需要您也能完成，再把您的回答写成手册。" : "She asks you questions until she could run it without you, then turns your answers into a playbook."}</p></div>
        <button type="button" className="sbtn ink" onClick={() => ask(b(TEACH))}><I.spark />{zh ? "开始" : "Start"}</button>
      </section>
      <div className="pb-bar"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={zh ? "搜索手册" : "Search playbooks"} aria-label={zh ? "搜索手册" : "Search playbooks"} /></div>
      <section className="sec">
        <div className="sec-h"><h2>{zh ? "您的手册" : "Yours"}{yours.length ? <em>{yours.length}</em> : null}</h2></div>
        {yours.length ? <ul className="pb-list">{yours.map(s => <Card key={s.id} s={s} />)}</ul>
          : <p className="quiet">{q ? (zh ? "没有匹配的手册。" : "No playbooks match.") : zh ? "Odelia 弄清一类以后还会遇到的工作时会自动写成手册；也可以点上面的“开始”教她。" : "Odelia writes one whenever she works out a job that will come up again, or teach her one above."}</p>}
      </section>
      <section className="sec">
        <div className="sec-h"><h2>{zh ? "快哉内置" : "From Placetta"}{ours.length ? <em>{ours.length}</em> : null}</h2></div>
        {ours.length ? <ul className="pb-list">{ours.map(s => <Card key={s.id} s={s} />)}</ul> : <p className="quiet">{zh ? "没有匹配的手册。" : "No playbooks match."}</p>}
      </section>
      {forms > 0 && <p className="quiet pb-forms">{zh ? `另有 ${forms} 份表格技能：每份官方表格填过一次，下次自动填好不涉及具体门店的各行。` : `Plus ${forms} form skills: each official form she's filled once fills its non-store lines by itself next time.`}</p>}
    </div>
  );
}
