import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
          <p className="lr-kick"><W lang={lang} x={B("License and permit report", "执照与许可报告")} /></p>
          <h1><W lang={lang} x={r.business} /></h1>
          <p className="lr-scope"><W lang={lang} x={r.scope} />{r.address && <span className="lr-addr">{r.address}</span>}</p>
          <p className="lr-meta"><span><W lang={lang} x={B("As of", "截至")} /> {day(r.asOf, lang)}</span><span><W lang={lang} x={B("Prepared by Odelia at Placetta", "由快哉的 Odelia 编制")} /></span></p>
        </header>

        <section className="lr-sum" aria-label={zh ? "概要" : "Summary"}>
          <Tile n={r.counts.total} l={B("Licenses and permits", "执照与许可")} lang={lang} />
          <Tile n={r.counts.approved} l={B("Approved or on file", "已批准或已持有")} lang={lang} />
          <Tile n={r.counts.moving} l={B("Filed or ready to file", "已提交或待提交")} lang={lang} />
          <Tile n={r.counts.toDo} l={B("Still to do", "待办")} lang={lang} />
        </section>
        <p className="lr-lede">
          <W lang={lang} x={r.fees.known || r.fees.open
            ? B(`Agency fees still to pay: ${fee(r.fees.known)}${r.fees.open ? `, plus ${r.fees.open} fee${r.fees.open === 1 ? "" : "s"} the agency sets` : ""}${r.fees.mixed ? " (in more than one currency; see each row)" : ""}. You pay each agency directly.`,
              `尚需缴纳的机构费用：${fee(r.fees.known)}${r.fees.open ? `，另有 ${r.fees.open} 项由机构核定` : ""}${r.fees.mixed ? "（涉及多种货币，见各行）" : ""}。费用由您直接支付给各机构。`)
            : B("No agency fees left to pay.", "没有待缴的机构费用。")} />
          {" "}
          <W lang={lang} x={r.renewals.length ? B(`Renewing or lapsed in the next 90 days: ${r.renewals.length}.`, `未来 90 天内续期或已过期：${r.renewals.length} 项。`) : B("Nothing renews in the next 90 days.", "未来 90 天没有需要续期的项目。")} />
        </p>
        <p className="lr-how"><W lang={lang} x={B(
          "Each row names the agency, the form, the fee, how it's filed and how often it renews, with the official page it rests on: the agency's own words and the day Placetta read them. A row Placetta couldn't confirm on an official page says so and names who to ask.",
          "每一行列出机构、表格、费用、办理方式和续期周期，以及依据的官方页面：机构原文和快哉核对的日期。未能在官方页面核实的行会注明，并写明该问哪个机构。")} />
          {r.unconfirmed > 0 && <> <W lang={lang} x={B(`${r.unconfirmed} not confirmed yet.`, `${r.unconfirmed} 项尚未核实。`)} /></>}
        </p>

        {byLevel.map(g => (
          <section key={g.l} className="lr-lv">
            <h2><W lang={lang} x={LEVEL_WORDS[g.l]} /><span>{g.rows.length}</span></h2>
            {g.rows.map(x => <Row key={x.id} x={x} lang={lang} />)}
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

function Tile({ n, l, lang }: { n: number; l: Bi; lang: ReportLang }) {
  return <div className="lr-tile"><b>{n}</b><span><W lang={lang} x={l} /></span></div>;
}

function Field({ k, lang, children }: { k: Bi; lang: ReportLang; children: ReactNode }) {
  return <div className="lr-f"><dt><W lang={lang} x={k} /></dt><dd>{children}</dd></div>;
}

function Row({ x, lang }: { x: ReportRow; lang: ReportLang }) {
  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return (
    <article className={"lr-row lrs-" + x.status}>
      <div className="lr-rh">
        <div>
          <h3><W lang={lang} x={x.name} /></h3>
          {x.plain && <p className="lr-plain"><W lang={lang} x={x.plain} /></p>}
          {(x.critical || x.shared) && <p className="lr-tags">
            {x.critical && <em><W lang={lang} x={B("Sets the opening date", "决定开业日期")} /></em>}
            {x.shared && <em><W lang={lang} x={B("Company-wide", "全公司共用")} /></em>}
          </p>}
        </div>
        <span className="lr-st"><W lang={lang} x={STATE_WORDS[x.status]} /></span>
      </div>
      <dl className="lr-dl">
        <Field k={B("Agency", "机构")} lang={lang}><W lang={lang} x={x.agency} /></Field>
        {x.form && <Field k={B("Form", "表格")} lang={lang}><W lang={lang} x={x.form} /></Field>}
        <Field k={B("Agency fee", "机构费用")} lang={lang}><W lang={lang} x={x.fee} /></Field>
        {x.takes && <Field k={B("Usually takes", "通常需要")} lang={lang}><W lang={lang} x={x.takes} /></Field>}
        {x.how && <Field k={B("How it's filed", "办理方式")} lang={lang}><W lang={lang} x={x.how} />{x.fileAt && <a className="lr-a" href={x.fileAt} target="_blank" rel="noopener noreferrer">{host(x.fileAt)}</a>}</Field>}
        <Field k={B("Who files it", "由谁办理")} lang={lang}><W lang={lang} x={x.who} /></Field>
        <Field k={B("Renews", "续期")} lang={lang}>{x.renews ? <W lang={lang} x={x.renews} /> : <W lang={lang} x={B("Not stated by the agency", "机构未说明")} />}{x.nextRenewal && <span className="lr-next"><W lang={lang} x={B("Next", "下次")} /> {day(x.nextRenewal, lang)}</span>}</Field>
        {x.approved && (x.approved.on || x.approved.confirmation || x.approved.doc) && (
          <Field k={B("Proof on file", "存档凭证")} lang={lang}>
            {x.approved.on && <span><W lang={lang} x={B("Approved", "批准于")} /> {day(x.approved.on, lang)}</span>}
            {x.approved.confirmation && <span><W lang={lang} x={B("Confirmation", "确认号")} /> {x.approved.confirmation}</span>}
            {x.approved.doc && <span className="lr-doc">{x.approved.doc}</span>}
          </Field>
        )}
        {x.missing.length > 0 && <Field k={B("Still needed", "仍需提供")} lang={lang}>{x.missing.map((m, i) => <span key={i} className="lr-miss"><W lang={lang} x={m} /></span>)}</Field>}
        {x.foreign && <Field k={B("Owner in China", "业主在中国")} lang={lang}><W lang={lang} x={x.foreign} /></Field>}
      </dl>
      <div className={"lr-src" + (x.proof === "open" ? " open" : "")}>
        {x.proof === "quoted" && x.source ? (
          <>
            <a className="lr-a" href={x.source.url} target="_blank" rel="noopener noreferrer">{x.source.label || host(x.source.url)}</a>
            <q>{x.source.quote}</q>
            <small><W lang={lang} x={B("Read on", "核对于")} /> {day(x.source.checked, lang)}</small>
          </>
        ) : x.proof === "linked" && x.source ? (
          <>
            <a className="lr-a" href={x.source.url} target="_blank" rel="noopener noreferrer">{x.source.label || host(x.source.url)}</a>
            <small><W lang={lang} x={B("The agency's page. Placetta checks its current requirements before filing.", "机构页面。快哉在提交前会核对机构现行要求。")} /></small>
          </>
        ) : (
          <>
            <span><W lang={lang} x={B(`Not confirmed on an official page yet. Ask ${x.agency.en}.`, `尚未在官方页面核实，请向${x.agency.zh}确认。`)} /></span>
            {x.source?.url && <a className="lr-a" href={x.source.url} target="_blank" rel="noopener noreferrer">{x.source.label || host(x.source.url)}</a>}
          </>
        )}
      </div>
    </article>
  );
}
