import { useEffect, useRef, useState } from "react";
import { useApp } from "./ctx";
import type { FilledNote } from "./core";
import type { Application, Approval } from "./model";
import { I, Select } from "./ui";
import { answersHash, formName, highlighted, latestVersion, needsForm, type Mark } from "./forms/versions";
import { formById } from "./forms/registry";
import { saveFile } from "./files";
import { daysFromNow, fmtDay } from "./time";
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


type Pic = { url: string; w: number; h: number };
type Drawn = { pages: Pic[]; closeUp: Pic | null; done: boolean };
/** The pages of a PDF (and the close-up of its marks), each shown as soon as it's drawn, let go when it's replaced. */
function useDrawn(make: () => Promise<{ pdf: Uint8Array; marks: Mark[] } | null>, key: string, width: number) {
  const [d, setD] = useState<Drawn | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!width) return;
    let live = true;
    const urls: string[] = [], pages: (Pic | undefined)[] = [];
    let closeUp: Pic | null = null;
    const show = (done = false) => { if (live) setD({ pages: pages.filter((p): p is Pic => !!p), closeUp, done }); };
    setD(null); setFailed(false);
    void (async () => {
      const src = await make();
      if (!src) throw new Error("no form");
      const { renderPdf } = await import("./forms/render");
      await renderPdf(src.pdf, { width, marks: src.marks, onPage: (p, n) => { urls.push(p.url); pages[n - 1] = p; show(); }, onCloseUp: p => { urls.push(p.url); closeUp = p; show(); } });
      show(true);
    })().catch(e => { console.error("The filled form's pages couldn't be drawn:", e); if (live) setFailed(true); });
    return () => { live = false; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [key, width]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { d, failed };
}
/** The width the pages are drawn at: the sheet's column. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const on = () => setW(Math.round(Math.min(720, el.clientWidth)));
    on();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(on) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return { ref, w };
}

/** The pages, as drawn: full width, or zoomed in to read (the box scrolls both ways then). */
function Pages({ d, failed, title }: { d: Drawn | null; failed: boolean; title: string }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [zoom, setZoom] = useState(false);
  if (failed) return <p className="ff-read">{zh ? "这里无法显示表格的页面。请下载查看。" : "The form's pages can't be shown here. Download it to see them."}</p>;
  if (!d || !d.pages.length) return <div className="ff-pages loading" aria-busy="true"><span>{zh ? "正在显示已填写的表格……" : "Showing the filled form…"}</span></div>;
  return (
    <>
      <div className={"ff-pages" + (zoom ? " zoom" : "")} data-hscroll="" role="group" aria-label={title} aria-busy={!d.done}>
        {d.pages.map((p, i) => <img key={i} src={p.url} alt={zh ? `${title}，第 ${i + 1} 页` : `${title}, page ${i + 1}`} style={{ aspectRatio: `${p.w} / ${p.h}` }} />)}
      </div>
      <button type="button" className="pill quiet sm ff-zoom" onClick={() => setZoom(z => !z)} aria-pressed={zoom}>{zoom ? (zh ? "恢复页面宽度" : "Fit the page") : (zh ? "放大查看" : "Zoom in to read")}</button>
    </>
  );
}

/** On the sheet: the agency's own form as filled, page by page, the version picked (the newest unless another is
 *  chosen), what reading it back found, what changed in it (marked on the pages, with a close-up), and its download. */
export function FilledStatus({ a, version }: { a: Application; version?: number }) {
  const { b, lang, filledPdf, say, t } = useApp();
  const zh = lang === "zh";
  const versions = a.versions ?? [];
  const cur = latestVersion(a);
  const [pick, setPick] = useState<number | undefined>(version && versions.some(x => x.n === version) ? version : undefined);
  const v = (pick ? versions.find(x => x.n === pick) : undefined) ?? cur;
  const filling = needsForm(a) || (!!cur && cur.hash !== answersHash(a));
  const { ref, w } = useWidth();
  const marks = v && v.n > 1 ? v.changed.map(c => c.id) : [];
  const key = `${a.id}:${v?.n ?? "now"}:${v?.hash ?? answersHash(a)}`;
  const { d, failed } = useDrawn(async () => {
    const bytes = await filledPdf(a.id, v?.n);
    if (!bytes) return null;
    return marks.length && a.official ? highlighted(bytes, a.official, v!.answers, marks) : { pdf: bytes, marks: [] };
  }, key, w);
  const title = `${formName(a)}${v ? (zh ? `，第 ${v.n} 版` : `, version ${v.n}`) : ""}`;
  const download = async () => {
    const bytes = await filledPdf(a.id, v?.n);
    if (!bytes) return;
    const r = await saveFile(v ? `${formName(a)}, filled, version ${v.n}.pdf` : `${formName(a)}, filled.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
    if (r === "unavailable") say(t("t_noDl"));
  };
  return (
    <div className="ff" ref={ref}>
      <div className="ff-h">
        <b>{zh ? "已填写的机构表格" : "The agency's form, filled"}</b>
        {versions.length > 1 ? (
          <label className="ff-pick">
            <span>{zh ? "版本" : "Version"}</span>
            <Select sz="sm" value={v?.n} onChange={e => setPick(Number(e.target.value))} aria-label={zh ? "选择版本" : "Pick a version"}>
              {[...versions].reverse().map(x => <option key={x.n} value={x.n}>{zh ? `第 ${x.n} 版${x === cur ? "（当前）" : ""}，${fmtDay(x.at, lang, true)}` : `Version ${x.n}${x === cur ? " (current)" : ""}, ${fmtDay(x.at, lang, true)}`}</option>)}
            </Select>
          </label>
        ) : v ? <span className="ff-one">{zh ? `第 ${v.n} 版（当前）` : `Version ${v.n} (current)`}</span> : null}
      </div>
      {v && (
        <>
          <p className="ff-v">{v.why && <span>{b(v.why)}</span>}<span>{fmtDay(v.at, lang, true)}</span></p>
          <p className={"ff-read" + (v.read.ok ? " ok" : " bad")}>
            {v.read.ok ? (zh ? `已读回核对：${v.read.checked} 行都与答案一致` : `Read back: all ${v.read.checked} lines match the answers`)
              : (zh ? "还不能提交：" : "Not ready to file: ") + v.read.problems.map(p => `${b(p.label)}: ${b(p.note)}`).join(zh ? "；" : "; ")}
          </p>
          {v.n > 1 && v.changed.length > 0 && (
            <div className="ff-changed">
              <b>{zh ? `第 ${v.n} 版改动了 ${v.changed.length} 行，在表格上已标出` : `${v.changed.length} line${v.changed.length === 1 ? "" : "s"} changed in version ${v.n}, marked on the form`}</b>
              <ul className="ff-changes">
                {v.changed.map(c => <li key={c.id}><span>{b(c.label)}</span><s>{c.was || (zh ? "空" : "empty")}</s><I.arrow /><em>{c.now || (zh ? "空" : "empty")}</em></li>)}
              </ul>
              {d?.closeUp && <figure className="ff-close"><div className="ff-close-scroll" data-hscroll=""><img src={d.closeUp.url} alt={zh ? "表格上改动的行，放大显示" : "The changed lines on the form, up close"} style={{ aspectRatio: `${d.closeUp.w} / ${d.closeUp.h}` }} /></div><figcaption>{zh ? "表格上的改动，放大显示" : "On the form, up close"}</figcaption></figure>}
            </div>
          )}
        </>
      )}
      {!v && <p className="ff-read">{filling ? (zh ? "正在用这些答案填写机构表格……" : "Filling the agency's form with these answers…") : (zh ? "用现在的答案填写" : "Filled with the answers as they are now")}</p>}
      {v && filling && <p className="ff-read">{zh ? "答案有改动，正在填写新版本……" : "The answers changed. Filling the next version…"}</p>}
      <Pages d={d} failed={failed} title={title} />
      <div className="off-act">
        <button type="button" className="pill ink sm" onClick={() => void download()}><I.download />{v && v !== cur ? (zh ? `下载第 ${v.n} 版` : `Download version ${v.n}`) : (zh ? "下载已填写的官方表格" : "Download the filled official form")}</button>
      </div>
    </div>
  );
}

/** A filing the agency only takes on its own site: the answers as a plain page, in the order the site asks for them,
 *  titled for what it is, never made to look like the agency's form. */
export function OnlineAnswers({ a }: { a: Application }) {
  const { lang, say, t } = useApp();
  const zh = lang === "zh";
  const { ref, w } = useWidth();
  const key = `${a.id}:${JSON.stringify(a.fields.map(f => f.value))}`;
  const make = async () => { const { answersPdf } = await import("./forms/summary"); return { pdf: await answersPdf(a, daysFromNow(0)), marks: [] as Mark[] }; };
  const { d, failed } = useDrawn(make, key, w);
  const agency = formById(a.official ?? "")?.agency.en ?? a.agency.en;
  const download = async () => { const r = await saveFile(`Answers for ${agency}'s online application.pdf`, new Blob([(await make()).pdf as BlobPart], { type: "application/pdf" })); if (r === "unavailable") say(t("t_noDl")); };
  return (
    <div className="ff" ref={ref}>
      <div className="ff-h"><b>{zh ? `${a.agency.zh}在线申请的答案` : `Answers for ${agency}'s online application`}</b></div>
      <p className="ff-read">{zh ? "这不是机构的官方表格。快哉按机构网站的顺序把这些答案填到网上（英文，按机构网站要求）。" : "Not the agency's form. Placetta enters these answers on the agency's own site, in this order."}</p>
      <Pages d={d} failed={failed} title={zh ? "在线申请的答案" : "Answers for the online application"} />
      <div className="off-act"><button type="button" className="pill ink sm" onClick={() => void download()}><I.download />{zh ? "下载答案" : "Download the answers"}</button></div>
    </div>
  );
}
