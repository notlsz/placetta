import { useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import * as api from "./cloud/api";
import { approvalLine, headline, valueReport, valueReportHtml, type AgencyNotice, type ValueLine, type ValueReport } from "./value.ts";
import { formKeys, valueInputOf } from "./valueInput";
import { daysFromNow } from "./time";
import { weekDone, weekLines } from "./weekDone";
import { I, Modal, Pill, Select } from "./ui";

/* The value report in the app (src/value.ts): what Placetta delivered for each store and the whole brand, from records
   only. Shown on Stores, in each store, and at renewal time in Plans and Settings; exported as one page the owner can
   send their boss or print to PDF. */

/** Network medians for the workspace's forms, once per workspace: only forms 3 or more businesses filed come back. */
const medianCache = new Map<string, Promise<{ form: string; businesses: number; median_days: number | null }[]>>();
export function useValueReport(): ValueReport {
  const { ws, cloud } = useApp();
  const [medians, setMedians] = useState<{ form: string; businesses: number; median_days: number | null }[]>([]);
  const keys = formKeys(ws).join("|");
  useEffect(() => {
    if (!cloud?.wsId || !keys) { setMedians([]); return; }
    const k = cloud.wsId + "|" + keys;
    if (!medianCache.has(k)) medianCache.set(k, api.networkView(cloud.wsId, keys.split("|")).then(v => v.forms ?? [], () => []));
    let on = true;
    void medianCache.get(k)!.then(m => { if (on) setMedians(m); });
    return () => { on = false; };
  }, [cloud?.wsId, keys]);
  return useMemo(() => valueReport(valueInputOf(ws, cloud?.filings ?? null, medians), daysFromNow(0)), [ws, cloud?.filings, medians]);
}

function Lines({ v }: { v: ValueLine }) {
  const { b } = useApp();
  return (
    <div className="vr-line">
      <ul className="vr-head">{headline(v).map((l, i) => <li key={i}><I.check />{b(l)}</li>)}</ul>
      {v.approvals.length > 0 && <><h4>{b(B("Days to approval", "审批用时"))}</h4><ul className="vr-sub">{v.approvals.map(a => <li key={a.app}>{b(approvalLine(a))}</li>)}</ul></>}
      {v.notices.length > 0 && <><h4>{b(B("Agency notices", "机构通知"))}</h4><ul className="vr-sub">{v.notices.map(n => <li key={n.notice.id}>{b(n.notice.what)} ({b(n.notice.agency)}, {n.notice.date}): {b(n.why)}</li>)}</ul></>}
      <p className="vr-f">{b(v.hours.formula)}</p>
    </div>
  );
}

function save(r: ValueReport, lang: "en" | "zh", print: boolean) {
  const html = valueReportHtml(r, lang);
  if (print) {
    const w = window.open("", "_blank");
    if (!w) return false;
    w.document.open(); w.document.write(html); w.document.close();
    w.setTimeout(() => w.print(), 300);
    return true;
  }
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `placetta-value-report-${r.asOf}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** What Odelia did for you this week (src/weekDone.ts): the same lines as the monitor's Monday update. */
export function WeekDoneLines() {
  const { b, ws, cloud } = useApp();
  const d = useMemo(() => weekDone({ audit: ws.audit, filings: (cloud?.filings ?? []).map(f => ({ title: f.title, status: f.status, submitted_at: f.submitted_at, decided_at: f.decided_at })),
    waiting: ws.approvals.length, until: new Date().toISOString() }), [ws.audit, ws.approvals.length, cloud?.filings]);
  return (
    <div className="vr-line">
      {d.empty ? <p className="note">{b(B("Nothing on record this week yet.", "本周暂无记录。"))}</p> : <ul className="vr-head">{weekLines(d).map((l, i) => <li key={i}><I.check />{b(l)}</li>)}</ul>}
    </div>
  );
}

/** The whole report: the brand, then each store, with the two ways to share it. */
export function ValueReportSheet({ onClose }: { onClose: () => void }) {
  const { b, lang, say } = useApp();
  const r = useValueReport();
  return (
    <Modal label={b(B("Value report", "价值报告"))} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.audit />{b(B("Value report", "价值报告"))}</span>
        <h2>{b(B("What Placetta delivered", "快哉为您完成的工作"))}</h2>
        <p>{b(B(`As of ${r.asOf}. Every number comes from records on file. Hours saved is an estimate, with its formula shown.`, `截至 ${r.asOf}。每个数字都来自存档记录。节省的小时数为估算，并列出公式。`))}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={b(B("Close", "关闭"))}><I.x /></button>
      </header>
      <div className="m-body vr">
        {r.empty && <p className="note">{b(B("Nothing to report yet: no filing has reached an agency. The report fills in as Odelia files.", "暂无可报告内容：还没有申报送达机构。Odelia 提交后，报告会自动补充。"))}</p>}
        <section className="vr-sec"><h3>{b(B("What Odelia did for you this week", "本周 Odelia 为您完成的工作"))}</h3><WeekDoneLines /></section>
        <section className="vr-sec"><h3>{b(B("Whole brand", "品牌合计"))}</h3><Lines v={r.brand} /></section>
        {r.stores.length > 1 && r.stores.map(s => <section key={s.id} className="vr-sec"><h3>{b(s.name)}</h3><Lines v={s} /></section>)}
      </div>
      <footer className="m-f">
        <p>{b(B("Share it with whoever signs off on Placetta: the page opens in any browser, and prints to PDF.", "可分享给负责审批快哉的人：页面可在任何浏览器打开，也可打印为 PDF。"))}</p>
        <div className="m-btns">
          <Pill kind="quiet" onClick={() => { if (!save(r, lang, false)) say(lang === "zh" ? "无法保存。" : "Couldn't save it."); }}><I.download />{b(B("Download the page", "下载页面"))}</Pill>
          <Pill kind="ink" onClick={() => { if (!save(r, lang, true)) say(lang === "zh" ? "浏览器拦截了新窗口。请允许弹出窗口后重试。" : "The browser blocked the new window. Allow pop-ups and try again."); }}>{b(B("Print or save as PDF", "打印或存为 PDF"))}</Pill>
        </div>
      </footer>
    </Modal>
  );
}

/** One store's part, inside the store. */
export function StoreValue({ storeId }: { storeId: string }) {
  const r = useValueReport();
  const s = r.stores.find(x => x.id === storeId);
  return s ? <Lines v={s} /> : null;
}

/** At renewal time: the year in a few lines, from the same report. Nothing when there's nothing on record. */
export function RenewalValue({ onOpen }: { onOpen?: () => void }) {
  const { b } = useApp();
  const r = useValueReport();
  if (r.empty) return null;
  return (
    <div className="vr-renew">
      <b>{b(B("What your plan delivered", "您的方案完成了这些工作"))}</b>
      <ul>{headline(r.brand).map((l, i) => <li key={i}><I.check />{b(l)}</li>)}</ul>
      {onOpen && <button type="button" className="lnk" onClick={onOpen}>{b(B("See the full report", "查看完整报告"))}</button>}
    </div>
  );
}

/** An agency notice for a store, recorded with its document so a fine avoided can be counted, and only then. */
export function NoticeEditor({ storeId }: { storeId: string }) {
  const { b, lang, ws, updateStore } = useApp();
  const store = (ws.stores ?? []).find(s => s.id === storeId);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState<{ doc: string; agency: string; what: string; date: string; fine: string; cureBy: string }>({ doc: "", agency: "", what: "", date: daysFromNow(0), fine: "", cureBy: "" });
  if (!store) return null;
  const list = store.notices ?? [];
  const zh = lang === "zh";
  const bi = (s: string): Bi => ({ en: s, zh: s });
  const ok = !!(n.doc && n.agency.trim() && n.what.trim() && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && (!n.cureBy || /^\d{4}-\d{2}-\d{2}$/.test(n.cureBy)) && (!n.fine || Number(n.fine) >= 0));
  const add = () => {
    const notice: AgencyNotice = { id: "nt-" + Date.now().toString(36), date: n.date, agency: bi(n.agency.trim()), what: bi(n.what.trim()), doc: n.doc,
      ...(n.fine ? { fine: Math.round(Number(n.fine)) } : {}), ...(n.cureBy ? { cureBy: n.cureBy } : {}) };
    updateStore(storeId, s => ({ ...s, notices: [...(s.notices ?? []), notice] }), { action: B("Recorded an agency notice", "记录了机构通知"), object: store.name, detail: notice.what });
    setOpen(false); setN({ doc: "", agency: "", what: "", date: daysFromNow(0), fine: "", cureBy: "" });
  };
  const resolve = (id: string) => updateStore(storeId, s => ({ ...s, notices: (s.notices ?? []).map(x => x.id === id ? { ...x, resolved: daysFromNow(0) } : x) }),
    { action: B("Resolved an agency notice", "解决了机构通知"), object: store.name });
  return (
    <div className="vr-notices">
      {list.length > 0 && <ul className="vr-sub">{list.map(x => (
        <li key={x.id}>{b(x.what)} ({b(x.agency)}, {x.date}){x.fine ? (zh ? `，罚款 $${x.fine}` : `, fine $${x.fine}`) : ""}{x.cureBy ? (zh ? `，期限 ${x.cureBy}` : `, by ${x.cureBy}`) : ""}
          {x.resolved ? <em>{zh ? `，已于 ${x.resolved} 解决` : `, resolved ${x.resolved}`}</em> : <button type="button" className="lnk" onClick={() => resolve(x.id)}>{zh ? "标记为已解决" : "Mark resolved"}</button>}</li>))}</ul>}
      {!open ? <button type="button" className="lnk" onClick={() => setOpen(true)}><I.plus />{b(B("Record a notice from an agency", "记录机构发来的通知"))}</button> : (
        <form className="sg-form vr-form" onSubmit={e => { e.preventDefault(); if (ok) add(); }}>
          <p className="note">{b(B("Only a notice whose document is on file counts toward fines avoided. Upload it in Documents first.", "只有原件已存档的通知才计入避免的罚款。请先在“文件”中上传。"))}</p>
          <label><span>{b(B("The notice", "通知原件"))}</span>
            <Select value={n.doc} onChange={e => setN({ ...n, doc: e.target.value })} aria-label={b(B("The notice", "通知原件"))}>
              <option value="">{b(B("Choose its document", "选择对应文件"))}</option>
              {ws.docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select></label>
          <label><span>{b(B("Agency", "机构"))}</span><input value={n.agency} onChange={e => setN({ ...n, agency: e.target.value })} /></label>
          <label><span>{b(B("What it says", "通知内容"))}</span><input value={n.what} onChange={e => setN({ ...n, what: e.target.value })} /></label>
          <label><span>{b(B("Dated", "日期"))}</span><input type="date" value={n.date} onChange={e => setN({ ...n, date: e.target.value })} /></label>
          <label><span>{b(B("Fine it names, in dollars", "通知所列罚款（美元）"))}</span><input inputMode="numeric" value={n.fine} onChange={e => setN({ ...n, fine: e.target.value.replace(/[^\d]/g, "") })} /></label>
          <label><span>{b(B("Fix by", "整改期限"))}</span><input type="date" value={n.cureBy} onChange={e => setN({ ...n, cureBy: e.target.value })} /></label>
          <div className="sg-form-act"><button type="button" className="sbtn" onClick={() => setOpen(false)}>{b(B("Cancel", "取消"))}</button><button type="submit" className="sbtn ink" disabled={!ok}>{b(B("Save", "保存"))}</button></div>
        </form>
      )}
    </div>
  );
}
