import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { buildReport, LEVEL_WORDS, reportCsv, reportName, STATE_WORDS, type ReportLang, type ReportRow } from "./report";
import { LANES } from "./runway";
import { saveFile } from "./files";
import { daysFromNow } from "./time";
import { I, Select } from "./ui";
import "./report.css";

/* The license report (src/report.ts), opened from Permits: one location's licenses and permits as a document to keep,
   print or send to a landlord, a franchisor or a lender. English, Chinese, or both side by side. "Save as PDF" prints
   the paper alone (the app is hidden in print while the report is open); "Spreadsheet" is every field as CSV. */

const LANGS: { k: ReportLang; l: string }[] = [{ k: "en", l: "English" }, { k: "zh", l: "中文" }, { k: "both", l: "EN + 中文" }];
const LEVELS = ["federal", "state", "county", "city"] as const;
/** The status in two or three words, so it fits its column on one line. */
const SHORT: Record<string, Bi> = {
  approved: B("Approved", "已批准"), held: B("On file", "已持有"), review: B("With the agency", "机构审核中"), filing: B("Being filed", "正在提交"),
  ready: B("Ready to approve", "待您批准"), needs: B("Needs you", "需要您"), draft: B("In progress", "准备中"), waiting: B("Waiting", "等待中"), todo: B("Not started", "未开始"),
};
const lower = (b: Bi): Bi => B(b.en.charAt(0).toLowerCase() + b.en.slice(1), b.zh);

function day(iso: string | undefined, lang: ReportLang): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const en = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const zh = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return lang === "zh" ? zh : lang === "both" ? `${en} / ${zh}` : en;
}

/** The report's words: one language, or English with the Chinese beneath it. */
function W({ x, lang }: { x: Bi | undefined; lang: ReportLang }) {
  if (!x) return null;
  if (lang !== "both") return <>{x[lang] || x.en}</>;
  return <>{x.en}{x.zh && x.zh !== x.en && <span className="lr-zh" lang="zh-CN">{x.zh}</span>}</>;
}

export function ReportButton() {
  const { lang } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pill quiet" onClick={() => setOpen(true)}><I.form />{lang === "zh" ? "许可报告" : "License report"}</button>
      {open && <LicenseReport onClose={() => setOpen(false)} />}
    </>
  );
}

export function LicenseReport({ onClose, store: first }: { onClose: () => void; store?: string }) {
  const { ws, lang: appLang, say } = useApp();
  const stores = ws.stores ?? [];
  const [store, setStore] = useState<string>(first ?? "");
  const [lang, setLang] = useState<ReportLang>(appLang);
  const today = daysFromNow(0);
  const r = useMemo(() => buildReport(ws, today, { store: store || undefined }), [ws, today, store]);
  const box = useRef<HTMLDivElement>(null);
  const zh = appLang === "zh";
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add("lr-open");
    box.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { document.body.classList.remove("lr-open"); window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  const pdf = () => {
    const was = document.title;
    document.title = reportName(r, "pdf").replace(/\.pdf$/, "");
    try { window.print(); } finally { setTimeout(() => { document.title = was; }, 400); }
  };
  const csv = async () => {
    const res = await saveFile(reportName(r, "csv"), new Blob([reportCsv(r, lang)], { type: "text/csv;charset=utf-8" }));
    if (res === "unavailable") say(zh ? "这里无法下载文件。" : "Downloads aren't available here.");
  };
  const byLevel = LEVELS.map(l => ({ l, rows: r.rows.filter(x => x.level === l && x.status !== "held") })).filter(g => g.rows.length);
  const held = r.rows.filter(x => x.status === "held");
  const fee = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: r.fees.currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  return createPortal(
    <div className="lr-root" role="dialog" aria-modal="true" aria-label={zh ? "许可报告" : "License report"} ref={box} tabIndex={-1}>
      <div className="lr-bar">
        <div className="lr-bar-in">
          <b className="lr-bar-t">{zh ? "许可报告" : "License report"}</b>
          {stores.length > 1 && (
            <Select sz="sm" aria-label={zh ? "门店" : "Location"} value={store} onChange={e => setStore(e.target.value)}>
              <option value="">{zh ? "全部门店" : "All locations"}</option>
              {stores.map(s => <option key={s.id} value={s.id}>{zh ? s.name.zh : s.name.en}</option>)}
            </Select>
          )}
          <div className="seg lr-langs" role="group" aria-label={zh ? "报告语言" : "Report language"}>
            {LANGS.map(x => <button key={x.k} type="button" aria-pressed={lang === x.k} onClick={() => setLang(x.k)}>{x.l}</button>)}
          </div>
          <span className="lr-gap" />
          <button type="button" className="pill quiet sm" onClick={csv}><I.download />{zh ? "表格" : "Spreadsheet"}</button>
          <button type="button" className="pill ink sm lr-pdf" onClick={pdf}>{zh ? "存为 PDF" : "Save as PDF"}<i><I.download /></i></button>
          <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
        </div>
      </div>
      <article className={"lr-paper" + (lang === "both" ? " lr-both" : "")} lang={lang === "zh" ? "zh-CN" : "en"}>
        <header className="lr-head">
          <h1><W lang={lang} x={r.business} /></h1>
          <p className="lr-meta"><W lang={lang} x={B("License and permit report", "执照与许可报告")} /><span><W lang={lang} x={r.scope} /></span>{r.address && <span>{r.address}</span>}<span><W lang={lang} x={B("As of", "截至")} /> {day(r.asOf, lang)}</span></p>
        </header>

        <section className="lr-sum" aria-label={zh ? "概要" : "Summary"}>
          <p className="lr-big">
            <W lang={lang} x={B(`${r.counts.total} licenses and permits.`, `共 ${r.counts.total} 项执照与许可。`)} />{" "}
            <span className="lr-k ok"><W lang={lang} x={B(`${r.counts.approved} approved`, `已批准 ${r.counts.approved} 项`)} /></span>
            <span className="lr-k mv"><W lang={lang} x={B(`${r.counts.moving} filed`, `已提交 ${r.counts.moving} 项`)} /></span>
            <span className="lr-k td"><W lang={lang} x={B(`${r.counts.toDo} to do`, `待办 ${r.counts.toDo} 项`)} /></span>
          </p>
          <div className="lr-prog" aria-hidden="true">
            {r.counts.approved > 0 && <i className="ok" style={{ flexGrow: r.counts.approved }} />}{r.counts.moving > 0 && <i className="mv" style={{ flexGrow: r.counts.moving }} />}{r.counts.toDo > 0 && <i className="td" style={{ flexGrow: r.counts.toDo }} />}
          </div>
          <p className="lr-lede">
            <W lang={lang} x={r.fees.known || r.fees.open
              ? B(`${fee(r.fees.known)} in agency fees still to pay${r.fees.open ? `, plus ${r.fees.open} the agency sets` : ""}.`, `尚需缴纳机构费用 ${fee(r.fees.known)}${r.fees.open ? `，另有 ${r.fees.open} 项由机构核定` : ""}。`)
              : B("No agency fees left to pay.", "没有待缴的机构费用。")} />{" "}
            <W lang={lang} x={r.renewals.length ? B(`${r.renewals.length} renew${r.renewals.length === 1 ? "s" : ""} in the next 90 days.`, `未来 90 天有 ${r.renewals.length} 项续期。`) : B("Nothing renews in the next 90 days.", "未来 90 天没有续期。")} />
          </p>
        </section>

        {byLevel.map(g => (
          <section key={g.l} className="lr-lv">
            <h2><W lang={lang} x={LEVEL_WORDS[g.l]} /><span>{g.rows.length}</span></h2>
            <div className="lr-list">{g.rows.map(x => <Row key={x.id} x={x} lang={lang} />)}</div>
          </section>
        ))}

        {held.length > 0 && (
          <section className="lr-lv">
            <h2><W lang={lang} x={B("On file", "已持有")} /><span>{held.length}</span></h2>
            <div className="lr-held">
              {held.map(x => (
                <div key={x.id} className="lr-hrow">
                  <b><W lang={lang} x={x.name} /></b>
                  <span><W lang={lang} x={x.agency} /></span>
                  <span>{x.expires ? <><W lang={lang} x={B("Expires", "到期")} /> {day(x.expires, lang)}</> : <W lang={lang} x={B("No expiry on record", "无到期记录")} />}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="lr-lv lr-rw">
          <h2><W lang={lang} x={B("Renewals in the next 90 days", "未来 90 天的续期")} /><span>{r.renewals.length}</span></h2>
          {r.renewals.length === 0 ? <p className="lr-none"><W lang={lang} x={B("Nothing renews in the next 90 days.", "未来 90 天没有需要续期的项目。")} /></p> : LANES.map(ln => {
            const items = r.renewals.filter(x => x.lane === ln.lane);
            if (!items.length) return null;
            return (
              <div key={String(ln.lane)} className={"lr-lane ln-" + ln.lane}>
                <h3><W lang={lang} x={ln.label} /></h3>
                {items.map(x => (
                  <div key={x.id} className="lr-rwi">
                    <span className="lr-rwd">{day(x.date, lang)}</span>
                    <div>
                      <b><W lang={lang} x={x.name} /></b>
                      {(x.holder || x.agency) && <small>{x.holder && <W lang={lang} x={x.holder} />}{x.holder && x.agency ? ", " : ""}{x.agency && <W lang={lang} x={x.agency} />}</small>}
                      <p><W lang={lang} x={x.next} /></p>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        <footer className="lr-foot">
          <p><W lang={lang} x={B("Each row links the agency's own page; a quoted line shows the day Placetta read it. The spreadsheet has every field.", "每一行都附机构官方页面链接；引用原文的行注明快哉核对的日期。表格版包含全部字段。")} />{r.unconfirmed > 0 && <> <W lang={lang} x={B(`${r.unconfirmed} not confirmed on an official page yet.`, `${r.unconfirmed} 项尚未在官方页面核实。`)} /></>}</p>
          <p><W lang={lang} x={B(
            "Placetta isn't a law firm and this isn't legal advice: requirements come from each agency's published rules, as read on the dates shown. Agency fees are the amounts the agency publishes and are paid to the agency. Nothing is filed, paid or sent without your approval.",
            "快哉不是律师事务所，本报告不构成法律意见：各项要求来自机构公开发布的规定，以所示日期核对为准。机构费用以机构公布的金额为准，由您直接支付给机构。未经您批准，不会提交、付款或发送任何内容。")} /></p>
          <p className="lr-fmeta"><W lang={lang} x={r.business} /> <span>{day(r.asOf, lang)}</span></p>
        </footer>
      </article>
    </div>,
    document.body,
  );
}

function Row({ x, lang }: { x: ReportRow; lang: ReportLang }) {
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  const src = x.source?.url;
  return (
    <article className={"lr-row lrs-" + x.status}>
      <div className="lr-main">
        <h3><W lang={lang} x={x.name} />{x.critical && <em className="lr-tag"><W lang={lang} x={B("Sets the opening date", "决定开业日期")} /></em>}</h3>
        <p className="lr-sub">
          <span><W lang={lang} x={x.agency} />{x.form && <>, <W lang={lang} x={x.form} /></>}</span>
          {x.nextRenewal ? <span><W lang={lang} x={B("Renews", "续期")} /> {day(x.nextRenewal, lang)}</span> : x.renews && <span><W lang={lang} x={B("Renewal:", "续期：")} /> <W lang={lang} x={lower(x.renews)} /></span>}
          {x.approved?.confirmation && <span><W lang={lang} x={B("Confirmation", "确认号")} /> {x.approved.confirmation}</span>}
        </p>
        {x.missing.length > 0 && <p className="lr-need"><W lang={lang} x={B(`${x.missing.length} answer${x.missing.length === 1 ? "" : "s"} still needed from you`, `还需要您提供 ${x.missing.length} 项信息`)} /></p>}
        {x.proof === "quoted" && x.source?.quote && <q className="lr-q">{x.source.quote}</q>}
        <p className="lr-srcl">
          {src ? <a className="lr-a" href={src} target="_blank" rel="noopener noreferrer">{x.source?.label || host(src)}</a> : null}
          {x.proof === "quoted" && x.source?.checked && <span><W lang={lang} x={B("read", "核对于")} /> {day(x.source.checked, lang)}</span>}
          {x.proof === "open" && <span className="lr-open"><W lang={lang} x={B(`Not confirmed on an official page yet. Ask ${x.agency.en}.`, `尚未在官方页面核实，请向${x.agency.zh}确认。`)} /></span>}
        </p>
      </div>
      <span className="lr-fee"><W lang={lang} x={x.fee} /></span>
      <span className="lr-st" title={STATE_WORDS[x.status].en}><W lang={lang} x={SHORT[x.status] ?? STATE_WORDS[x.status]} /></span>
    </article>
  );
}
