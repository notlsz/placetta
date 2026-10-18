import { useCallback, useEffect, useMemo, useState } from "react";
import { B, type Bi } from "./bi";
import { hqBrand, hqLines, hqTotals, type HqLine, type HqRow, type HqStatus } from "./hq";
import type { Lang } from "./i18n";
import { Logo } from "./Logo";
import { daysUntil, fmtDay, fmtIn } from "./time";
import * as api from "./cloud/api";
import { HqMetrics } from "./Metrics";

/* Headquarters: every store across every franchisee that shared with this email, in one view. Read only. Works inside
   a workspace (a nav entry) and on its own, for a headquarters account with no workspace of its own. */

const STATUS: Record<HqStatus, Bi> = { current: B("Current", "正常"), due: B("Due soon", "即将到期"), overdue: B("Overdue", "已逾期") };
type Filter = "all" | HqStatus | "opening";

function counts(l: HqLine, lang: Lang) {
  const zh = lang === "zh";
  const parts = [
    l.current ? (zh ? `${l.current} 项有效` : `${l.current} current`) : "",
    l.due_30 ? (zh ? `${l.due_30} 项 30 天内到期` : `${l.due_30} due in 30 days`) : "",
    l.overdue ? (zh ? `${l.overdue} 项逾期` : `${l.overdue} overdue`) : "",
    l.pending ? (zh ? `${l.pending} 项申请办理中` : `${l.pending} pending`) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(zh ? "，" : ", ") : zh ? "暂无执照记录" : "No licenses on file yet";
}

export function Headquarters({ lang, initial }: { lang: Lang; initial: HqRow[] }) {
  const b = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const [rows, setRows] = useState<HqRow[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState("");
  // live: load again on open and whenever the window comes back into focus
  const load = useCallback(async () => { try { setRows(await api.hqStores()); setErr(""); } catch (e) { setErr((e as api.ApiError).message ?? String(e)); } }, []);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [load]);

  const lines = useMemo(() => hqLines(rows), [rows]);
  const tot = hqTotals(lines);
  const brand = hqBrand(rows);
  const shown = lines.filter(l => filter === "all" || (filter === "opening" ? l.stage === "opening" : l.status === filter));
  const franchisees = rows.length;

  return (
    <div className="page hq">
      <header className="ph"><div className="ph-tx">
        <h1>{brand ? (zh ? `${brand} 总部` : `${brand} headquarters`) : b(B("Headquarters", "总部"))}</h1>
        <p>{b(B(`Live status of every store across ${franchisees} franchisee${franchisees === 1 ? "" : "s"}, in one view. Read only: each franchisee's documents, logins and chats stay with them.`,
          `${franchisees} 家加盟商的每家门店实时状态，一个视图看全。仅供查看：各加盟商的文件、登录信息和对话不会共享。`))}</p>
      </div></header>

      <dl className="hq-tot">
        <div><dt>{b(B("Stores", "门店"))}</dt><dd>{tot.stores}</dd>{tot.opening > 0 && <small>{zh ? `${tot.opening} 家筹备中` : `${tot.opening} opening`}</small>}</div>
        <div className="ok"><dt>{b(B("Fully current", "全部有效"))}</dt><dd>{tot.current}</dd></div>
        <div className={tot.due ? "warn" : ""}><dt>{b(B("Due in 30 days", "30 天内到期"))}</dt><dd>{tot.due}</dd></div>
        <div className={tot.overdue ? "bad" : ""}><dt>{b(B("Overdue", "已逾期"))}</dt><dd>{tot.overdue}</dd></div>
      </dl>

      {err && <p className="note">{err}</p>}

      <HqMetrics lang={lang} />

      {lines.length === 0 ? (
        <div className="empty">
          <p>{b(B("No franchisee has shared stores with you yet. Ask each franchisee's owner to open Settings, Headquarters, in Placetta and add your email.",
            "还没有加盟商与您共享门店。请各加盟商的所有者在快哉的“设置 > 总部”中添加您的邮箱。"))}</p>
        </div>
      ) : (<>
        <div className="seg" role="group" aria-label={b(B("Filter", "筛选"))}>
          {([["all", B("All", "全部"), tot.stores], ["overdue", STATUS.overdue, tot.overdue], ["due", STATUS.due, tot.due], ["current", STATUS.current, tot.current], ["opening", B("Opening", "筹备中"), tot.opening]] as [Filter, Bi, number][])
            .map(([k, l, n]) => <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{b(l)}<span>{n}</span></button>)}
        </div>
        <div className="table hq-t" role="table">
          <div className="tr th" role="row"><span>{b(B("Franchisee", "加盟商"))}</span><span>{b(B("Store", "门店"))}</span><span>{b(B("Stage", "阶段"))}</span><span>{b(B("Status", "状态"))}</span><span>{b(B("Next due", "下一项到期"))}</span></div>
          <div className="tray">
            {shown.map(l => {
              const opens = l.projected_open ?? l.planned_open;
              const n = l.next ? daysUntil(l.next.date) : null;
              return (
                <div key={l.workspace_id + ":" + l.id} className="tr row" role="row">
                  <span className="c-fr">{l.franchisee}</span>
                  <span className="c-name"><b>{b(l.name)}</b>{l.address && <small>{l.address}</small>}</span>
                  <span className="c-stage">{l.stage === "open" ? b(B("Open", "已开业")) : b(B("Opening", "筹备中"))}
                    {l.stage === "opening" && opens ? <small>{zh ? `预计 ${fmtDay(opens, lang, true)}` : `Opens ${fmtDay(opens, lang, true)}`}</small>
                      : l.grade ? <small>{l.grade === "P" ? b(B("Grade pending", "评级待定")) : zh ? `${l.grade} 级` : `${l.grade} grade`}</small> : null}</span>
                  <span className={"c-hst s-" + l.status}><b>{b(STATUS[l.status])}</b><small>{counts(l, lang)}</small></span>
                  <span className="c-due">{l.next
                    ? <><b>{b(l.next.title) || b(B("Unnamed item", "未命名事项"))}</b><small className={n !== null && n < 0 ? "bad" : n !== null && n <= 30 ? "warn" : ""}>{fmtDay(l.next.date, lang, true)}{zh ? "，" : ", "}{n !== null && n < 0 ? (zh ? `已逾期 ${-n} 天` : `${-n} days overdue`) : fmtIn(n ?? 0, lang)}</small></>
                    : <small>{b(B("Nothing dated yet", "暂无日期"))}</small>}</span>
                </div>
              );
            })}
            {shown.length === 0 && <p className="quiet hq-none">{b(B("No stores match.", "没有符合条件的门店。"))}</p>}
          </div>
        </div>
        <p className="note">{b(B("Counts each store's permits on file and the due dates and renewals of its applications. Placetta emails this summary to you every Monday.",
          "统计每家门店的现有许可，以及其申请的截止日期和续期。快哉每周一会把这份摘要发到您的邮箱。"))}</p>
      </>)}
    </div>
  );
}

/** Headquarters on its own: for someone signed in with an HQ email and no workspace of their own. */
export function HqHome({ lang, setLang, email, rows, onNew, onSignOut }: { lang: Lang; setLang: (l: Lang) => void; email: string; rows: HqRow[]; onNew: () => void; onSignOut: () => void }) {
  const b = (x: Bi) => x[lang];
  return (
    <div className="hq-home">
      <header className="gate-top">
        <Logo lang={lang} height={18} />
        <div className="hq-home-r">
          <span className="hq-me">{email}</span>
          <div className="lang" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
          </div>
          <button type="button" className="sbtn quiet" onClick={onSignOut}>{b(B("Sign out", "退出登录"))}</button>
        </div>
      </header>
      <Headquarters lang={lang} initial={rows} />
      <footer className="hq-home-f">
        <p>{b(B("Running stores of your own too?", "自己也经营门店？"))}</p>
        <button type="button" className="sbtn line" onClick={onNew}>{b(B("Set up your own workspace", "创建自己的工作区"))}</button>
      </footer>
    </div>
  );
}
