import { useEffect, useMemo, useState, type ReactNode } from "react";
import { B, type Bi } from "./bi";
import type { Lang } from "./i18n";
import {
  buildGrid, filterGrid, gridCsv, GROUPS, preparePrompt, sortRows, STATUS_WORDS, statusCounts, statusSay, storesOfWorkspace, toPrepare,
  type CellStatus, type ReviewCell, type ReviewGrid, type ReviewRow, type ReviewSort, type ReviewStore,
} from "./review";
import { useApp } from "./ctx";
import { useTeam } from "./Comments";
import { initials, shortName } from "./collab";
import { addDeadline, audit } from "./core";
import { saveFile } from "./files";
import { useNarrow } from "./hooks";
import { daysFromNow, daysUntil, fmtDay } from "./time";
import { I, Menu, Select } from "./ui";
import "./review.css";

/* The review table (Legora's Tabular Review): stores as rows, permits and requirements as columns grouped formation,
   tax, health, building, staff certificates and renewals. Each cell is that requirement's state at that store with a
   plain icon, its next date, and opens the store's application. Filter by store, status, region and opening or open,
   sort, pick cells and act on them together, export it all as CSV. The table scrolls sideways inside its own box, its
   header and store column stay put. The same table serves Permits (a workspace with two or more stores) and
   Headquarters (every franchisee that shared with it): what each can do with picked cells comes from its caller. */

const sv = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
/** One plain icon per status, no shape behind it. */
export const STATUS_ICON: Record<Exclude<CellStatus, "none">, () => ReactNode> = {
  approved: () => <svg {...sv}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  review: () => <svg {...sv}><path d="M12 7v5l3 2" /><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /></svg>,
  filed: () => <svg {...sv}><path d="M4 12l16-7-6 16-3-7z" /><path d="M11 14l9-9" /></svg>,
  todo: () => <svg {...sv}><rect x="5" y="5" width="14" height="14" rx="3" /></svg>,
  missing: () => <svg {...sv}><path d="M7 3.5h7l4.5 4.5v12.5H7z" /><path d="M14 3.5V8h4.5M12.75 11v4M12.75 17.6v.01" /></svg>,
  expiring: () => <svg {...sv}><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 2.5-3 3.6-4 4.5" /></svg>,
  lapsed: () => <svg {...sv}><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4v.01" /></svg>,
};
const SHOWN: CellStatus[] = ["lapsed", "missing", "expiring", "todo", "filed", "review", "approved"];

/** The cell's date in words: "Due Nov 3", "3 days overdue", "Expires Jan 9". */
function dateLine(c: ReviewCell, lang: Lang): string {
  if (!c.next) return "";
  const n = daysUntil(c.next.date), day = fmtDay(c.next.date, lang, Math.abs(n) > 300);
  const zh = lang === "zh";
  if (c.next.kind === "due") return n < 0 ? (zh ? `逾期 ${-n} 天` : `${-n} day${n === -1 ? "" : "s"} overdue`) : zh ? `${day}截止` : `Due ${day}`;
  if (c.status === "expiring" || c.status === "lapsed") return zh ? `${day}${n < 0 ? "已到期" : "到期"}` : `${n < 0 ? "Expired" : "Expires"} ${day}`;
  return zh ? `${day}续期` : `Renews ${day}`;
}
/** What else the cell says: how many things are in it, or the store's own name for it. */
function whatLine(c: ReviewCell, colLabel: Bi, lang: Lang): string {
  if (c.items.length > 1) {
    const certs = c.items.every(i => i.kind === "cert");
    return lang === "zh" ? `${c.items.length} ${certs ? "张证书" : "项"}` : `${c.items.length} ${certs ? "certificates" : "items"}`;
  }
  const n = c.items[0]?.name[lang] ?? "";
  return n && n.toLowerCase() !== colLabel[lang].toLowerCase() ? n : "";
}

export type Picked = { row: string; col: string };
const keyOf = (p: Picked) => `${p.row}|${p.col}`;

export function ReviewTable({ lang, stores, hq, mineId, mineLabel, onOpen, bulk, mark, csvName, empty }: {
  lang: Lang;
  stores: ReviewStore[];
  /** Headquarters: a franchisee on each row, and in the CSV */
  hq?: boolean;
  /** the signed-in person's id, for the Mine filter (Permits only) */
  mineId?: string | null;
  mineLabel?: string;
  onOpen(row: ReviewRow, col: string, cell: ReviewCell): void;
  /** what can be done with the picked cells */
  bulk(picked: Picked[], grid: ReviewGrid, clear: () => void): ReactNode;
  /** something small for a cell, like who it's assigned to */
  mark?(row: ReviewRow, cell: ReviewCell): ReactNode;
  csvName: string;
  empty?: ReactNode;
}) {
  const zh = lang === "zh";
  const b = (x: Bi) => x[lang];
  const today = daysFromNow(0);
  const grid = useMemo(() => buildGrid(stores, today), [stores, today]);
  const [store, setStore] = useState("all");
  const [status, setStatus] = useState<CellStatus | "all">("all");
  const [region, setRegion] = useState("all");
  const [stage, setStage] = useState<"all" | "open" | "opening">("all");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<ReviewSort>("risk");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const phone = useNarrow(641);
  const [showFilters, setShowFilters] = useState(false);
  const f = useMemo(() => filterGrid(grid, { store, status, region, stage, mine: mine ? mineId ?? null : null }), [grid, store, status, region, stage, mine, mineId]);
  const rows = useMemo(() => sortRows(f.rows, sort, lang), [f.rows, sort, lang]);
  const shown: ReviewGrid = useMemo(() => ({ columns: f.columns, rows }), [f.columns, rows]);
  // what's picked and still on screen
  const live = useMemo(() => [...picked].map(k => { const [row, col] = k.split("|"); return { row, col }; })
    .filter(p => rows.some(r => r.store.key === p.row && r.cells[p.col]?.status !== "none" && f.columns.some(c => c.key === p.col))), [picked, rows, f.columns]);
  useEffect(() => { setPicked(new Set()); }, [store, status, region, stage, mine]);
  const counts = useMemo(() => statusCounts(grid), [grid]);
  const regions = useMemo(() => [...new Set(grid.rows.map(r => r.store.region).filter(Boolean))].sort(), [grid]);
  const stages = new Set(grid.rows.map(r => r.store.stage));
  const flip = (ks: string[], on?: boolean) => setPicked(s => {
    const n = new Set(s), all = ks.every(k => n.has(k)), add = on ?? !all;
    for (const k of ks) { if (add) n.add(k); else n.delete(k); }
    return n;
  });
  const pickable = (r: ReviewRow, col: string) => r.cells[col].status !== "none" && f.match(r, col);
  const rowKeys = (r: ReviewRow) => f.columns.filter(c => pickable(r, c.key)).map(c => keyOf({ row: r.store.key, col: c.key }));
  const colKeys = (col: string) => rows.filter(r => pickable(r, col)).map(r => keyOf({ row: r.store.key, col }));
  const allKeys = rows.flatMap(rowKeys);
  const groupRuns = f.columns.reduce<{ id: string; label: Bi; span: number }[]>((out, c) => {
    const last = out[out.length - 1];
    if (last && last.id === c.group) last.span++;
    else out.push({ id: c.group, label: GROUPS.find(g => g.id === c.group)!.label, span: 1 });
    return out;
  }, []);
  const exportCsv = () => void saveFile(`${csvName}-${today}.csv`, new Blob([gridCsv(shown, lang, { hq })], { type: "text/csv" }));
  const clear = () => setPicked(new Set());
  const narrowed = store !== "all" || status !== "all" || region !== "all" || stage !== "all" || mine;
  const active = [store !== "all", status !== "all", region !== "all", stage !== "all", mine].filter(Boolean).length;

  if (!grid.rows.length) return <div className="rv-empty">{empty ?? <p className="quiet">{zh ? "还没有门店。" : "No stores yet."}</p>}</div>;
  return (
    <div className="rv">
      <div className="rv-bar">
        {/* on a phone the filters fold behind one button, so the table starts near the top */}
        {phone && (
          <button type="button" className={"sbtn quiet rv-ftog" + (active ? " on" : "")} aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
            {zh ? "筛选" : "Filters"}{active > 0 && <span>{active}</span>}
          </button>
        )}
        {(!phone || showFilters) && <div className="rv-filters">
          <Select sz="sm" value={store} onChange={e => setStore(e.target.value)} aria-label={zh ? "门店" : "Store"}>
            <option value="all">{zh ? `全部门店（${grid.rows.length}）` : `All stores (${grid.rows.length})`}</option>
            {grid.rows.map(r => <option key={r.store.key} value={r.store.key}>{hq && r.store.franchisee ? `${r.store.franchisee}: ${b(r.store.name)}` : b(r.store.name)}</option>)}
          </Select>
          <Select sz="sm" value={status} onChange={e => setStatus(e.target.value as CellStatus | "all")} aria-label={zh ? "状态" : "Status"}>
            <option value="all">{zh ? "任何状态" : "Any status"}</option>
            {SHOWN.filter(s => counts[s]).map(s => <option key={s} value={s}>{`${b(STATUS_WORDS[s as Exclude<CellStatus, "none">])} (${counts[s]})`}</option>)}
          </Select>
          {regions.length > 1 && (
            <Select sz="sm" value={region} onChange={e => setRegion(e.target.value)} aria-label={zh ? "地区" : "Region"}>
              <option value="all">{zh ? "所有地区" : "Every region"}</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          )}
          {stages.has("open") && stages.has("opening") && (
            <div className="seg sm" role="group" aria-label={zh ? "阶段" : "Stage"}>
              {([["all", B("All", "全部")], ["opening", B("Opening", "筹备中")], ["open", B("Open", "已开业")]] as const).map(([k, l]) =>
                <button key={k} type="button" aria-pressed={stage === k} onClick={() => setStage(k)}>{b(l)}</button>)}
            </div>
          )}
          {mineId && (
            <div className="seg sm" role="group" aria-label={zh ? "显示" : "Show"}>
              <button type="button" aria-pressed={!mine} onClick={() => setMine(false)}>{zh ? "全部" : "Everything"}</button>
              <button type="button" aria-pressed={mine} onClick={() => setMine(true)}>{mineLabel ?? (zh ? "分配给我" : "Mine")}</button>
            </div>
          )}
        </div>}
        <div className="rv-tools">
          <Select sz="sm" value={sort} onChange={e => setSort(e.target.value as ReviewSort)} aria-label={zh ? "排序" : "Sort"}>
            <option value="risk">{zh ? "最需要处理的在前" : "Most at risk first"}</option>
            <option value="next">{zh ? "按下一个日期" : "Next date first"}</option>
            <option value="name">{zh ? "按门店名称" : "Store name"}</option>
            <option value="opening">{zh ? "按开业日期" : "Opening date"}</option>
          </Select>
          <button type="button" className="sbtn quiet" onClick={exportCsv} aria-label={zh ? "导出 CSV" : "Export CSV"}><I.download />{phone ? "CSV" : zh ? "导出 CSV" : "Export CSV"}</button>
        </div>
      </div>

      {live.length > 0 && (
        <div className="rv-bulk" role="region" aria-label={zh ? "已选的格子" : "Picked cells"}>
          <b>{zh ? `已选 ${live.length} 格` : `${live.length} picked`}</b>
          <div className="rv-bulk-act">{bulk(live, shown, clear)}</div>
          <button type="button" className="lnk quiet" onClick={clear}>{zh ? "清除" : "Clear"}</button>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="quiet rv-none">{zh ? "没有符合条件的门店。" : "No stores match."}{narrowed && <> <button type="button" className="lnk" onClick={() => { setStore("all"); setStatus("all"); setRegion("all"); setStage("all"); setMine(false); }}>{zh ? "清除筛选" : "Clear the filters"}</button></>}</p>
      ) : (
        <div className="rv-scroll" data-hscroll tabIndex={0} aria-label={zh ? "审阅表，可横向滚动" : "Review table, scrolls sideways"}>
          <table className="rv-t">
            <thead>
              <tr className="rv-groups">
                <th className="rv-corner" rowSpan={2} scope="col">
                  <label className="rv-pickall">
                    <input type="checkbox" checked={allKeys.length > 0 && allKeys.every(k => picked.has(k))} onChange={() => flip(allKeys)} aria-label={zh ? "全选" : "Pick every cell"} />
                    <span>{hq ? (zh ? "加盟商与门店" : "Franchisee and store") : (zh ? "门店" : "Store")}</span>
                  </label>
                </th>
                {groupRuns.map((g, i) => <th key={g.id + i} colSpan={g.span} scope="colgroup" className={"rv-g g-" + g.id}>{b(g.label)}</th>)}
              </tr>
              <tr className="rv-cols">
                {f.columns.map(c => {
                  const ks = colKeys(c.key);
                  return (
                    <th key={c.key} scope="col" className={"rv-h g-" + c.group}>
                      <label>
                        <input type="checkbox" disabled={!ks.length} checked={ks.length > 0 && ks.every(k => picked.has(k))} onChange={() => flip(ks)} aria-label={zh ? `选择这一列：${b(c.label)}` : `Pick the column: ${b(c.label)}`} />
                        <span>{b(c.label)}</span>
                      </label>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const ks = rowKeys(r);
                const opens = r.store.opens;
                return (
                  <tr key={r.store.key} className={"rv-r w-" + r.worst}>
                    <th scope="row" className="rv-s">
                      <label className="rv-sname">
                        <input type="checkbox" disabled={!ks.length} checked={ks.length > 0 && ks.every(k => picked.has(k))} onChange={() => flip(ks)} aria-label={zh ? `选择这一行：${b(r.store.name)}` : `Pick the row: ${b(r.store.name)}`} />
                        <span>
                          {hq && r.store.franchisee && <small className="rv-fr">{r.store.franchisee}</small>}
                          <b>{b(r.store.name)}</b>
                          <small>{r.store.stage === "business" ? (zh ? "全企业的登记" : "The business's own registrations")
                            : r.store.stage === "opening" ? (opens ? (zh ? `筹备中，预计${fmtDay(opens, lang, true)}开业` : `Opening ${fmtDay(opens, lang, true)}`) : (zh ? "筹备中" : "Opening"))
                            : (zh ? "已开业" : "Open")}{r.store.region ? (zh ? `，${r.store.region}` : `, ${r.store.region}`) : ""}</small>
                        </span>
                      </label>
                    </th>
                    {f.columns.map(c => {
                      const cell = r.cells[c.key], k = keyOf({ row: r.store.key, col: c.key });
                      if (cell.status === "none") return <td key={c.key} className="rv-c s-none"><span>{statusSay("none", undefined, lang)}</span></td>;
                      const Icon = STATUS_ICON[cell.status], on = picked.has(k), dim = !f.match(r, c.key);
                      const say = statusSay(cell.status, cell.days, lang), when = dateLine(cell, lang), what = whatLine(cell, c.label, lang);
                      return (
                        <td key={c.key} className={"rv-c s-" + cell.status + (on ? " on" : "") + (dim ? " dim" : "")}>
                          <button type="button" className="rv-open" onClick={() => onOpen(r, c.key, cell)}
                            aria-label={`${b(r.store.name)}, ${b(c.label)}: ${say}${when ? `, ${when}` : ""}`}>
                            <span className="rv-st"><Icon /><b>{say}</b></span>
                            {when && <small className="rv-when">{when}</small>}
                            {what && <small className="rv-what" title={what}>{what}</small>}
                          </button>
                          <span className="rv-foot">
                            {cell.comments > 0 && <span className="rv-cm" title={zh ? `${cell.comments} 条未解决的评论` : `${cell.comments} open comment${cell.comments === 1 ? "" : "s"}`}><I.message />{cell.comments}</span>}
                            {mark?.(r, cell)}
                            {!dim && <input type="checkbox" className="rv-pick" checked={on} onChange={() => flip([k])} aria-label={zh ? `选择：${b(r.store.name)}，${b(c.label)}` : `Pick ${b(r.store.name)}, ${b(c.label)}`} />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ul className="rv-legend" aria-label={zh ? "图例" : "Legend"}>
        {SHOWN.map(s => { const Icon = STATUS_ICON[s as Exclude<CellStatus, "none">]; return <li key={s} className={"s-" + s}><Icon /><span>{b(STATUS_WORDS[s as Exclude<CellStatus, "none">])}</span></li>; })}
      </ul>
    </div>
  );
}

/* ---------------------------- in Permits: a workspace with two or more stores ---------------------------- */

/** The review table on Permits. Picked cells can go to Odelia (one job per store, through split_job), to a teammate,
 *  or get a reminder on Deadlines. */
export function PermitsReview() {
  const { lang, ws, openApp, go, ask, busy, editWs, say, cloud } = useApp();
  const team = useTeam();
  const zh = lang === "zh";
  const stores = useMemo(() => storesOfWorkspace(ws, {
    comments: id => team.openCount({ kind: "app", id }),
    assignee: id => team.assigneeOf({ kind: "app", id })?.id ?? null,
  }), [ws, team]);
  const [remind, setRemind] = useState<string | null>(null);
  const members = team.people.filter(p => p.role !== "hq");
  const appsIn = (picked: Picked[], grid: ReviewGrid) => {
    const out = new Map<string, Bi>();
    for (const p of picked) for (const it of grid.rows.find(r => r.store.key === p.row)?.cells[p.col]?.items ?? []) if (it.kind === "app") out.set(it.id, it.name);
    return [...out.entries()];
  };
  return (
    <ReviewTable lang={lang} stores={stores} mineId={team.me.id} csvName={zh ? "门店审阅表" : "placetta-review-table"}
      onOpen={(row, _col, cell) => { if (cell.app) openApp(cell.app); else if (row.store.stage !== "business") go("stores"); }}
      mark={(_row, cell) => cell.assignees.length ? <span className="asg-i" title={cell.assignees.map(id => shortName(team.people.find(p => p.id === id))).join(zh ? "、" : ", ")}>{cell.assignees.map(id => initials(team.people.find(p => p.id === id))).filter(Boolean).slice(0, 2).join(" ")}</span> : null}
      bulk={(picked, grid, clear) => {
        const groups = toPrepare(grid, picked), apps = appsIn(picked, grid);
        const n = groups.reduce((s, g) => s + g.apps.length, 0);
        return (
          <>
            <button type="button" className="sbtn ink" disabled={!n || busy} title={n ? undefined : (zh ? "所选的都已提交或批准" : "Everything picked is already filed or approved")}
              onClick={() => { ask(preparePrompt(groups, lang)); say(zh ? `已交给 Odelia：${n} 项申请，${groups.length} 个门店各一项工作。` : `Odelia has it: ${n} application${n === 1 ? "" : "s"}, one job per store.`); clear(); }}>
              <I.spark />{zh ? "让 Odelia 准备" : "Ask Odelia to prepare"}
            </button>
            <Menu kind="menu" label={zh ? "分配给" : "Assign to"} buttonClass="sbtn quiet" disabled={!apps.length}
              button={<><I.user /><span>{zh ? "分配给" : "Assign to"}</span><I.chev /></>}
              items={[...members.map(p => ({ key: p.id, label: p.you ? (zh ? `${shortName(p)}（您）` : `${shortName(p)} (you)`) : shortName(p), onPick: async () => {
                for (const [id, name] of apps) await team.assign({ kind: "app", id }, p.id, name);
                say(zh ? `已把 ${apps.length} 项分配给 ${shortName(p)}。` : `Assigned ${apps.length} to ${shortName(p)}.`); clear();
              } })), { key: "none", label: zh ? "不分配" : "Nobody", onPick: async () => { for (const [id, name] of apps) await team.assign({ kind: "app", id }, null, name); clear(); } }]} />
            {remind === null ? (
              <button type="button" className="sbtn quiet" onClick={() => setRemind(daysFromNow(7))}><I.deadlines />{zh ? "设置提醒" : "Set a reminder"}</button>
            ) : (
              <span className="rv-remind">
                <input type="date" value={remind} min={daysFromNow(0)} onChange={e => setRemind(e.target.value)} aria-label={zh ? "提醒日期" : "Reminder date"} />
                <button type="button" className="sbtn ink" disabled={!remind} onClick={() => {
                  const when = remind!;
                  editWs(w => picked.reduce((acc, p) => {
                    const row = grid.rows.find(r => r.store.key === p.row), col = grid.columns.find(c => c.key === p.col);
                    if (!row || !col) return acc;
                    const cell = row.cells[p.col], what = cell.items.length === 1 ? cell.items[0].name : col.label;
                    const title = B(`Reminder: ${what.en}, ${row.store.name.en}`, `提醒：${row.store.name.zh}，${what.zh}`);
                    const id = `dl-rem-${Date.now().toString(36)}-${acc.deadlines.length}`;
                    return audit("you", B("Set a reminder", "设置提醒"), title, B(when, when))(addDeadline({ id, date: when, kind: "milestone", title, app: cell.app, agency: cloud ? B(cloud.email, cloud.email) : B("You", "您"),
                      ask: B("Look at it", "去看看"), prompt: B(`Where does this stand, and what's next: ${what.en} at ${row.store.name.en}?`, `这一项进展如何，下一步是什么：${row.store.name.zh}的${what.zh}？`) })(acc));
                  }, w));
                  say(zh ? `已在 ${fmtDay(when, lang)} 设置 ${picked.length} 个提醒，见“截止日期”。` : `${picked.length} reminder${picked.length === 1 ? "" : "s"} set for ${fmtDay(when, lang)}. They're on Deadlines.`);
                  setRemind(null); clear();
                }}>{zh ? "设置" : "Set"}</button>
                <button type="button" className="lnk quiet" onClick={() => setRemind(null)}>{zh ? "取消" : "Cancel"}</button>
              </span>
            )}
          </>
        );
      }} />
  );
}

/** Whether Permits has a review table: two or more stores. */
export const hasReview = (stores: unknown[] | undefined) => (stores?.length ?? 0) >= 2;
