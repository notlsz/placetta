import { useEffect, useState } from "react";
import { networkView } from "./cloud/api";
import { demoNetwork, lessonKeys, rank, type NetworkView } from "./learning";
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

const pct = (x: number) => Math.round(x * 100) + "%";
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const SMALL = new Set(["of", "and", "the", "for", "de", "on"]);
/** "place:san-jose-ca" reads "San Jose, CA"; "agency:california-department-of-tax-and-fee-administration" reads as a name. */
const placeOf = (key: string) => {
  const ws = key.replace(/^[a-z]+:/, "").split("-").filter(Boolean);
  const state = key.startsWith("place:") && ws.length > 1 && ws[ws.length - 1].length === 2 ? ws.pop()!.toUpperCase() : "";
  const name = ws.map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
  return state ? `${name}, ${state}` : name;
};

/** The network: what every business's jobs taught Odelia, for this business's places, agencies and forms, and the
 *  proof it's working (how often a job passes its independent check the first time, week by week). */
function Network() {
  const { b, lang, ws, cloud } = useApp();
  const zh = lang === "zh";
  const [view, setView] = useState<NetworkView | null>(cloud ? null : demoNetwork());
  const keys = lessonKeys(ws).join("|");
  useEffect(() => {
    if (!cloud) { setView(demoNetwork()); return; }
    let live = true;
    networkView(cloud.wsId, keys ? keys.split("|") : []).then(v => { if (live) setView(v); }).catch(() => { if (live) setView({ lessons: [], curve: [], businesses: 0, live: 0, forms: [] }); });
    return () => { live = false; };
  }, [cloud?.wsId, keys]);
  if (!view) return null;
  const curve = view.curve.filter(c => c.jobs > 0);
  const now = curve[curve.length - 1], then = curve[0];
  const lessons = rank(view.lessons).slice(0, 8);
  const max = Math.max(...curve.map(c => c.first_try), 0.01);
  return (
    <section className="sec nl">
      <div className="sec-h"><h2>{zh ? "全网学习" : "Learning across Placetta"}{!cloud ? <em className="nl-sample">{zh ? "示例数据" : "Sample data"}</em> : null}</h2></div>
      <div className="nl-top">
        <div className="nl-stat">
          {now ? <><b>{pct(now.first_try)}</b><span>{zh ? "的工作第一次就通过独立检查" : "of jobs pass the independent check the first time"}{then && then !== now ? (zh ? `，${curve.length} 周前为 ${pct(then.first_try)}` : `, up from ${pct(then.first_try)} ${curve.length} weeks ago`) : ""}</span></>
            : <><b>{zh ? "每项工作都在教她" : "Every job teaches her"}</b><span>{zh ? "Odelia 完成的每项工作、每个机构的批复，都会变成匿名经验，让下一家商家一次做对。" : "Every job Odelia finishes and every agency decision becomes an anonymized lesson, so the next business gets it right the first time."}</span></>}
        </div>
        {curve.length > 1 && (
          <svg className="nl-curve" viewBox={`0 0 ${curve.length * 14} 48`} role="img" aria-label={zh ? "每周首次通过率" : "First-try pass rate by week"}>
            {curve.map((c, i) => <rect key={c.week} x={i * 14 + 2} y={48 - (c.first_try / max) * 44} width="10" height={(c.first_try / max) * 44} rx="2"><title>{`${c.week}: ${pct(c.first_try)} of ${c.jobs}`}</title></rect>)}
          </svg>
        )}
        {view.businesses > 0 && <p className="nl-size">{zh ? `${view.businesses} 家商家，${view.live} 条已验证经验` : `${view.businesses} businesses, ${view.live} verified lessons`}</p>}
      </div>
      {lessons.length ? (
        <ul className="nl-list">
          {lessons.map(l => (
            <li key={l.id}>
              <p>{b(l.text)}</p>
              <small>
                <span>{placeOf(l.key)}</span>
                <span>{zh ? `${l.businesses} 家商家确认` : `Confirmed by ${l.businesses} ${l.businesses === 1 ? "business" : "businesses"}`}</span>
                {l.wins ? <span>{zh ? `${l.wins} 次工作中验证有效` : `Held up in ${l.wins} jobs`}</span> : null}
                {l.source_url ? <a href={l.source_url} target="_blank" rel="noreferrer">{host(l.source_url)}</a> : null}
              </small>
            </li>
          ))}
        </ul>
      ) : <p className="quiet">{zh ? "您所在城市和机构的经验，在第二家商家确认后会出现在这里。" : "Lessons for your cities and agencies show up here once a second business confirms them."}</p>}
      {view.forms.length ? (
        <div className="nl-forms">
          <h3>{zh ? "机构实际用时" : "How long agencies actually take"}</h3>
          {view.forms.map(f => <p key={f.form}><b>{f.form}</b><span>{f.median_days != null ? (zh ? `中位 ${f.median_days} 天` : `${f.median_days} days median`) : ""}{f.approved_rate != null ? (zh ? `，批准率 ${pct(f.approved_rate)}` : `, ${pct(f.approved_rate)} approved`) : ""}{zh ? `，${f.businesses} 家商家` : `, across ${f.businesses} businesses`}</span></p>)}
        </div>
      ) : null}
    </section>
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
      <Network />
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
