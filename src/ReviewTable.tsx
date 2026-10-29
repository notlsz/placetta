import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { B, type Bi } from "./bi";
import type { Lang } from "./i18n";
import {
  buildGrid, colTally, doneSay, filterGrid, gridCsv, gridTally, GROUPS, itemCounts, itemStatus, preparePrompt, RANK, RENEWALS, rowTally, sortRows, STATUS_WORDS, statusSay,
  storesOfWorkspace, toPrepare, type CellStatus, type ReviewCell, type ReviewGrid, type ReviewRow, type ReviewSort, type ReviewStore, type Tally,
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
   header and store column stay put. Above it, what needs attention first and how far along everything is (each status
   a filter); on each store and each column, its own count. Hovering or focusing a cell shows its agency, dates, next
   step, whether the agency confirmed it and the page it rests on. Arrow keys move between cells, Space picks. On a
   phone, one card per store, worst first. The same table serves Permits (a workspace with two or more stores) and
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

const ATTENTION: CellStatus[] = ["lapsed", "missing", "expiring"];
const DENSITY_KEY = "placetta-review-density";
type Density = "comfy" | "compact";
const readDensity = (): Density => { try { return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfy"; } catch { return "comfy"; } };
const saveDensity = (d: Density) => { try { localStorage.setItem(DENSITY_KEY, d); } catch { /* private window: it just isn't remembered */ } };

/** "Due Nov 24, in 27 days", "Expired Oct 1, 27 days ago": an item's next date with how far off it is. */
function countdown(next: { date: string; kind: "due" | "expires" }, lang: Lang): string {
  const n = daysUntil(next.date), day = fmtDay(next.date, lang, Math.abs(n) > 300), zh = lang === "zh";
  const off = zh ? (n === 0 ? "今天" : n === 1 ? "明天" : n < 0 ? `已过 ${-n} 天` : `还有 ${n} 天`)
    : n === 0 ? "today" : n === 1 ? "tomorrow" : n < 0 ? `${-n} day${n === -1 ? "" : "s"} ago` : `in ${n} days`;
  if (next.kind === "due") return zh ? `${day}截止，${off}` : `${n < 0 ? "Was due" : "Due"} ${day}, ${off}`;
  return zh ? `${day}${n < 0 ? "已到期" : "到期"}，${off}` : `${n < 0 ? "Expired" : "Expires"} ${day}, ${off}`;
}
const needSay = (n: number, lang: Lang) => (lang === "zh" ? `${n} 项需要处理` : `${n} need${n === 1 ? "s" : ""} attention`);

/** A thin bar of how far along something is: approved, with the team or agency, needing someone, not started. The
 *  words beside it say the same thing, so the bar is never the only signal. */
function Progress({ t }: { t: Tally }) {
  if (!t.total) return null;
  const w = (n: number) => `${(n / t.total) * 100}%`;
  return (
    <span className="rv-prog" aria-hidden="true">
      <i className="p-done" style={{ width: w(t.done) }} /><i className="p-moving" style={{ width: w(t.moving) }} /><i className="p-attn" style={{ width: w(t.attention) }} />
    </span>
  );
}

/** While the table loads: its shape, quietly. */
export function ReviewSkeleton({ lang }: { lang: Lang }) {
  return (
    <div className="rv rv-skel" aria-busy="true">
      <p className="sr-only" role="status">{lang === "zh" ? "正在载入审阅表" : "Loading the review table"}</p>
      <div className="rv-sum" aria-hidden="true"><i style={{ width: "38%" }} /><i style={{ width: "62%" }} /></div>
      <div className="rv-skel-t" aria-hidden="true">
        {Array.from({ length: 3 }, (_, r) => <div key={r}>{Array.from({ length: 6 }, (_, c) => <i key={c} />)}</div>)}
      </div>
    </div>
  );
}

type Peek = { key: string; row: ReviewRow; col: string; x: number; y: number; w: number; h: number };

export function ReviewTable({ lang, stores, hq, mineId, mineLabel, onOpen, bulk, mark, csvName, empty, loading }: {
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
  /** still fetching the stores: the table's shape instead of "no stores" */
  loading?: boolean;
}) {
  const zh = lang === "zh";
  const b = (x: Bi) => x[lang];
  const today = daysFromNow(0);
  const grid = useMemo(() => buildGrid(stores, today), [stores, today]);
  const [store, setStore] = useState("all");
  const [status, setStatus] = useState<CellStatus | "all" | "attention">("all");
  const [region, setRegion] = useState("all");
  const [stage, setStage] = useState<"all" | "open" | "opening">("all");
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<ReviewSort>("risk");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [density, setDensity] = useState<Density>(readDensity);
  const phone = useNarrow(641);
  const [showFilters, setShowFilters] = useState(false);
  const f = useMemo(() => filterGrid(grid, { store, status, region, stage, mine: mine ? mineId ?? null : null }), [grid, store, status, region, stage, mine, mineId]);
  const rows = useMemo(() => sortRows(f.rows, sort, lang), [f.rows, sort, lang]);
  const shown: ReviewGrid = useMemo(() => ({ columns: f.columns, rows }), [f.columns, rows]);
  // what's picked and still on screen
  const live = useMemo(() => [...picked].map(k => { const [row, col] = k.split("|"); return { row, col }; })
    .filter(p => rows.some(r => r.store.key === p.row && r.cells[p.col]?.status !== "none" && f.columns.some(c => c.key === p.col))), [picked, rows, f.columns]);
  useEffect(() => { setPicked(new Set()); }, [store, status, region, stage, mine]);
  const counts = useMemo(() => itemCounts(grid), [grid]);
  const total = useMemo(() => gridTally(grid), [grid]);
  const regions = useMemo(() => [...new Set(grid.rows.map(r => r.store.region).filter(Boolean))].sort(), [grid]);
  const stages = new Set(grid.rows.map(r => r.store.stage));
  const storeCount = grid.rows.filter(r => r.store.stage !== "business").length;
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
  const active = [store !== "all", region !== "all", stage !== "all", mine].filter(Boolean).length;
  const reset = () => { setStore("all"); setStatus("all"); setRegion("all"); setStage("all"); setMine(false); };
  const pickedStores = new Set(live.map(p => p.row)).size;

  /* ---- keyboard: one cell in the tab order, the arrows move between cells, Space picks, Enter opens, Esc clears ---- */
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const [cur, setCur] = useState<string | null>(null);
  const firstKey = (() => { for (const r of rows) for (const c of f.columns) if (r.cells[c.key].status !== "none") return keyOf({ row: r.store.key, col: c.key }); return null; })();
  const tabKey = cur && rows.some(r => f.columns.some(c => keyOf({ row: r.store.key, col: c.key }) === cur && r.cells[c.key].status !== "none")) ? cur : firstKey;
  const move = (ri: number, ci: number, dr: number, dc: number) => {
    let r = ri + dr, c = ci + dc;
    while (r >= 0 && r < rows.length && c >= 0 && c < f.columns.length) {
      if (rows[r].cells[f.columns[c].key].status !== "none") {
        const k = keyOf({ row: rows[r].store.key, col: f.columns[c].key });
        setCur(k); cells.current.get(k)?.focus();
        return;
      }
      r += dr; c += dc;
    }
  };

  /* ---- the detail card: on hover (after a beat) or keyboard focus, beside the cell ---- */
  const [peek, setPeek] = useState<Peek | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const peekRef = useRef<HTMLDivElement>(null);
  const [peekPos, setPeekPos] = useState<{ left: number; top: number } | null>(null);
  const showPeek = (el: HTMLElement, row: ReviewRow, col: string, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      setPeek({ key: keyOf({ row: row.store.key, col }), row, col, x: r.left, y: r.top, w: r.width, h: r.height });
    }, delay);
  };
  const hidePeek = (delay = 140) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setPeek(null), delay); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!peek) return;
    const off = () => setPeek(null);
    window.addEventListener("scroll", off, true); window.addEventListener("resize", off);
    return () => { window.removeEventListener("scroll", off, true); window.removeEventListener("resize", off); };
  }, [peek]);
  useLayoutEffect(() => {
    if (!peek) { setPeekPos(null); return; }
    const el = peekRef.current, W = el?.offsetWidth ?? 300, H = el?.offsetHeight ?? 200;
    const right = peek.x + peek.w + 8;
    const left = right + W <= window.innerWidth - 8 ? right : Math.max(8, peek.x - W - 8);
    const top = Math.max(8, Math.min(peek.y, window.innerHeight - H - 8));
    setPeekPos({ left, top });
  }, [peek]);

  if (loading) return <ReviewSkeleton lang={lang} />;
  if (!grid.rows.length) return (
    <div className="rv-empty">
      <I.apps />
      {empty ?? <p className="quiet">{zh ? "还没有门店。" : "No stores yet."}</p>}
    </div>
  );

  const storeLine = (r: ReviewRow) => {
    const opens = r.store.opens;
    return <>{r.store.stage === "business" ? (zh ? "全企业的登记" : "The business's own registrations")
      : r.store.stage === "opening" ? (opens ? (zh ? `筹备中，预计${fmtDay(opens, lang, true)}开业` : `Opening ${fmtDay(opens, lang, true)}`) : (zh ? "筹备中" : "Opening"))
      : (zh ? "已开业" : "Open")}{r.store.region ? (zh ? `，${r.store.region}` : `, ${r.store.region}`) : ""}</>;
  };
  const rowSummary = (r: ReviewRow) => {
    const t = rowTally(r, grid.columns);
    if (!t.total) return null;
    return (
      <span className="rv-tally">
        <span className="rv-tally-l"><Progress t={t} /><small>{doneSay(t, lang)}</small></span>
        {t.attention > 0 && <small className="rv-need"><AttnIcon />{needSay(t.attention, lang)}</small>}
      </span>
    );
  };
  const pickBox = (k: string, r: ReviewRow, c: { label: Bi }) => (
    <input type="checkbox" className="rv-pick" checked={picked.has(k)} onChange={() => flip([k])} aria-label={zh ? `选择：${b(r.store.name)}，${b(c.label)}` : `Pick ${b(r.store.name)}, ${b(c.label)}`} />
  );

  /* ---- the detail card's contents ---- */
  const peekCard = (() => {
    if (!peek || phone) return null;
    const row = rows.find(r => r.store.key === peek.row.store.key), col = f.columns.find(c => c.key === peek.col);
    const cell = row?.cells[peek.col];
    if (!row || !col || !cell || cell.status === "none") return null;
    const items = [...cell.items].map(i => ({ i, ...itemStatus(peek.col === RENEWALS.key && i.kind === "app" ? { ...i, kind: "permit" as const } : i, today) }))
      .sort((a, z) => RANK[a.status] - RANK[z.status]).slice(0, 4);
    return (
      <div ref={peekRef} className={"rv-peek" + (peekPos ? " in" : "")} role="tooltip" id="rv-peek" style={peekPos ?? { left: -9999, top: 0 }}
        onMouseEnter={() => window.clearTimeout(timer.current)} onMouseLeave={() => hidePeek()}>
        <p className="rv-peek-h"><small>{b(GROUPS.find(g => g.id === col.group)!.label)}{zh ? "，" : ", "}{hq && row.store.franchisee ? `${row.store.franchisee}: ` : ""}{b(row.store.name)}</small><b>{b(col.label)}</b></p>
        <ul>
          {items.map(({ i, status: st, days, next }) => {
            const Icon = st !== "none" ? STATUS_ICON[st] : null;
            return (
              <li key={i.id} className={"s-" + st}>
                {(items.length > 1 || b(i.name).toLowerCase() !== b(col.label).toLowerCase()) && <b className="rv-peek-n">{b(i.name)}</b>}
                <span className="rv-st">{Icon && <Icon />}<b>{statusSay(st, days, lang)}</b></span>
                {next && <span className="rv-peek-l"><I.deadlines /><span>{countdown(next, lang)}</span></span>}
                {i.agency && <span className="rv-peek-l"><I.scale /><span>{b(i.agency)}</span></span>}
                {i.step && st !== "approved" && <span className="rv-peek-l"><I.chevR /><span>{zh ? `下一步：${b(i.step)}` : `Next: ${b(i.step)}`}</span></span>}
                {i.confirmed && <span className="rv-peek-l ok"><I.shield /><span>{zh ? "机构已确认批准" : "Confirmed with the agency"}{i.receipt ? (zh ? "，回执已存档" : ", receipt on file") : ""}</span></span>}
                {i.source && <a className="rv-peek-src" href={i.source.url} target="_blank" rel="noopener noreferrer"><I.ext /><span>{zh ? `为何需要：${i.source.label}` : `Why it applies: ${i.source.label}`}</span></a>}
              </li>
            );
          })}
        </ul>
        {cell.items.length > items.length && <p className="rv-peek-more">{zh ? `另有 ${cell.items.length - items.length} 项` : `${cell.items.length - items.length} more`}</p>}
        <p className="rv-peek-f">{cell.app || row.store.stage !== "business"
          ? (zh ? "点击打开，查看文件、回执和来源" : "Click to open the filings, receipts and sources")
          : (zh ? "点击查看" : "Click to look")}</p>
      </div>
    );
  })();

  /* ---- the phone: one card per store, worst first inside it ---- */
  const cards = (
    <div className="rv-cards">
      {rows.map(r => {
        const ks = rowKeys(r);
        const list = f.columns.filter(c => c.key !== RENEWALS.key && r.cells[c.key].status !== "none")
          .map(c => ({ c, cell: r.cells[c.key] }))
          .sort((a, z) => RANK[a.cell.status] - RANK[z.cell.status] || (a.cell.next?.date ?? "9999").localeCompare(z.cell.next?.date ?? "9999"));
        const renew = f.columns.find(c => c.key === RENEWALS.key) && r.cells[RENEWALS.key].status !== "none" ? r.cells[RENEWALS.key] : null;
        return (
          <section key={r.store.key} className={"rv-card w-" + r.worst} aria-label={b(r.store.name)}>
            <header className="rv-card-h">
              <label className="rv-sname">
                <input type="checkbox" disabled={!ks.length} checked={ks.length > 0 && ks.every(k => picked.has(k))} onChange={() => flip(ks)} aria-label={zh ? `选择这家门店的全部：${b(r.store.name)}` : `Pick everything at ${b(r.store.name)}`} />
                <span>
                  {hq && r.store.franchisee && <small className="rv-fr">{r.store.franchisee}</small>}
                  <b>{b(r.store.name)}</b>
                  <small>{storeLine(r)}</small>
                </span>
              </label>
              {rowSummary(r)}
            </header>
            <ul className="rv-items">
              {list.map(({ c, cell }) => {
                const k = keyOf({ row: r.store.key, col: c.key }), Icon = STATUS_ICON[cell.status as Exclude<CellStatus, "none">];
                const dim = !f.match(r, c.key), when = dateLine(cell, lang), step = cell.items.length === 1 && cell.status !== "approved" ? cell.items[0].step : undefined;
                return (
                  <li key={c.key} className={"rv-item s-" + cell.status + (picked.has(k) ? " on" : "") + (dim ? " dim" : "")}>
                    <button type="button" className="rv-cell" onClick={() => onOpen(r, c.key, cell)}>
                      <span className="rv-item-t"><b>{b(c.label)}</b>{cell.comments > 0 && <span className="rv-cm"><I.message />{cell.comments}</span>}{mark?.(r, cell)}</span>
                      <span className="rv-st"><Icon /><b>{statusSay(cell.status, cell.days, lang)}</b>{when && <small className="rv-when">{when}</small>}</span>
                      {step && <small className="rv-what">{zh ? `下一步：${b(step)}` : `Next: ${b(step)}`}</small>}
                    </button>
                    {!dim && pickBox(k, r, c)}
                  </li>
                );
              })}
            </ul>
            <footer className="rv-card-f">
              {renew?.next ? <><I.deadlines /><span>{zh ? "下一项续期：" : "Next renewal: "}{countdown(renew.next, lang)}</span></> : <span>{zh ? "暂无续期日期" : "No renewal dates yet"}</span>}
            </footer>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className={"rv" + (density === "compact" ? " compact" : "")} onKeyDown={e => { if (e.key === "Escape" && live.length) { clear(); setPeek(null); } }}>
      {/* where everything stands: what needs someone first, then how far along it all is; each status is a filter */}
      <div className="rv-sum">
        <div className="rv-sum-h">
          {total.attention > 0
            ? <button type="button" className="rv-need big" aria-pressed={status === "attention"} onClick={() => setStatus(status === "attention" ? "all" : "attention")}
                title={zh ? "只看需要处理的" : "Show only what needs attention"}><AttnIcon /><b>{needSay(total.attention, lang)}</b>{status !== "attention" && <span className="rv-need-go">{zh ? "只看这些" : "Show only these"}</span>}</button>
            : <b className="rv-ok"><I.check />{zh ? "没有需要处理的事项" : "Nothing needs attention"}</b>}
          <span className="rv-sum-p"><Progress t={total} /><small>{doneSay(total, lang)}{zh ? `，共 ${storeCount} 家门店` : ` across ${storeCount} store${storeCount === 1 ? "" : "s"}`}</small></span>
        </div>
        <div className="rv-chips" role="group" aria-label={zh ? "按状态筛选" : "Filter by status"}>
          <button type="button" className="rv-chip" aria-pressed={status === "all"} onClick={() => setStatus("all")}><span>{zh ? "全部" : "All"}</span><em>{total.total}</em></button>
          {SHOWN.filter(s => counts[s] || status === s).map(s => {
            const Icon = STATUS_ICON[s as Exclude<CellStatus, "none">];
            return (
              <button key={s} type="button" className={"rv-chip s-" + s + (ATTENTION.includes(s) ? " attn" : "")} aria-pressed={status === s} onClick={() => setStatus(status === s ? "all" : s)}>
                <Icon /><span>{b(STATUS_WORDS[s as Exclude<CellStatus, "none">])}</span><em>{counts[s]}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rv-bar">
        {/* on a phone the filters fold behind one button, so the stores start near the top */}
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
          {!phone && (
            <div className="seg sm" role="group" aria-label={zh ? "密度" : "Density"}>
              {([["comfy", B("Comfortable", "宽松")], ["compact", B("Compact", "紧凑")]] as const).map(([k, l]) =>
                <button key={k} type="button" aria-pressed={density === k} onClick={() => { setDensity(k); saveDensity(k); }}>{b(l)}</button>)}
            </div>
          )}
          <button type="button" className="sbtn quiet" onClick={exportCsv} aria-label={zh ? "导出 CSV" : "Export CSV"}><I.download />{phone ? "CSV" : zh ? "导出 CSV" : "Export CSV"}</button>
        </div>
      </div>

      {live.length > 0 && (
        <div className="rv-bulk" role="region" aria-label={zh ? "已选的格子" : "Picked cells"}>
          <b>{zh ? `已选 ${live.length} 项，${pickedStores} 家门店` : `${live.length} picked at ${pickedStores} store${pickedStores === 1 ? "" : "s"}`}</b>
          <div className="rv-bulk-act">{bulk(live, shown, clear)}</div>
          <button type="button" className="lnk quiet" onClick={clear} aria-keyshortcuts="Escape">{zh ? "清除" : "Clear"}</button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rv-none">
          <p>{zh ? "没有符合条件的门店。" : "No stores match these filters."}</p>
          {narrowed && <button type="button" className="sbtn quiet" onClick={reset}>{zh ? "清除筛选" : "Clear the filters"}</button>}
        </div>
      ) : phone ? cards : (
        <div className="rv-scroll" data-hscroll tabIndex={-1}>
          <table className="rv-t" aria-label={zh ? "审阅表：门店为行，许可为列" : "Review table: stores as rows, permits as columns"} aria-describedby="rv-keys">
            <thead>
              <tr className="rv-groups">
                <th className="rv-corner" rowSpan={2} scope="col">
                  <label className="rv-pickall">
                    <input type="checkbox" checked={allKeys.length > 0 && allKeys.every(k => picked.has(k))} onChange={() => flip(allKeys)} aria-label={zh ? "全选" : "Pick every cell"} />
                    <span>{hq ? (zh ? "加盟商与门店" : "Franchisee and store") : (zh ? "门店" : "Store")}</span>
                  </label>
                </th>
                {groupRuns.map((g, i) => <th key={g.id + i} colSpan={g.span} scope="colgroup" className={"rv-g g-" + g.id}><span>{b(g.label)}</span></th>)}
              </tr>
              <tr className="rv-cols">
                {f.columns.map(c => {
                  const ks = colKeys(c.key), t = colTally(rows, c.key);
                  return (
                    <th key={c.key} scope="col" className={"rv-h g-" + c.group}>
                      <label>
                        <input type="checkbox" disabled={!ks.length} checked={ks.length > 0 && ks.every(k => picked.has(k))} onChange={() => flip(ks)} aria-label={zh ? `选择这一列：${b(c.label)}` : `Pick the column: ${b(c.label)}`} />
                        <span>{b(c.label)}</span>
                      </label>
                      <span className="rv-h-t">
                        {t.attention > 0 ? <small className="rv-need"><AttnIcon />{needSay(t.attention, lang)}</small>
                          : <small>{c.key === RENEWALS.key ? (zh ? `${t.total} 家门店有日期` : `${t.total} with a date`) : doneSay(t, lang)}</small>}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const ks = rowKeys(r);
                return (
                  <tr key={r.store.key} className={"rv-r w-" + r.worst}>
                    <th scope="row" className="rv-s">
                      <label className="rv-sname">
                        <input type="checkbox" disabled={!ks.length} checked={ks.length > 0 && ks.every(k => picked.has(k))} onChange={() => flip(ks)} aria-label={zh ? `选择这一行：${b(r.store.name)}` : `Pick the row: ${b(r.store.name)}`} />
                        <span>
                          {hq && r.store.franchisee && <small className="rv-fr">{r.store.franchisee}</small>}
                          <b>{b(r.store.name)}</b>
                          <small>{storeLine(r)}</small>
                        </span>
                      </label>
                      {rowSummary(r)}
                    </th>
                    {f.columns.map((c, ci) => {
                      const cell = r.cells[c.key], k = keyOf({ row: r.store.key, col: c.key });
                      if (cell.status === "none") return <td key={c.key} className="rv-c s-none"><span>{statusSay("none", undefined, lang)}</span></td>;
                      const Icon = STATUS_ICON[cell.status], on = picked.has(k), dim = !f.match(r, c.key);
                      const say = statusSay(cell.status, cell.days, lang), when = dateLine(cell, lang), what = whatLine(cell, c.label, lang);
                      return (
                        <td key={c.key} className={"rv-c s-" + cell.status + (on ? " on" : "") + (dim ? " dim" : "")}>
                          <button type="button" className="rv-cell" tabIndex={k === tabKey ? 0 : -1}
                            ref={el => { if (el) cells.current.set(k, el); else cells.current.delete(k); }}
                            aria-describedby={peek?.key === k ? "rv-peek" : undefined}
                            aria-label={`${b(r.store.name)}, ${b(c.label)}: ${say}${when ? `, ${when}` : ""}${on ? (zh ? "，已选" : ", picked") : ""}`}
                            onClick={() => onOpen(r, c.key, cell)}
                            onFocus={e => { setCur(k); if (e.currentTarget.matches(":focus-visible")) showPeek(e.currentTarget, r, c.key, 0); }}
                            onBlur={() => hidePeek(0)}
                            onMouseEnter={e => showPeek(e.currentTarget, r, c.key, peek ? 60 : 380)}
                            onMouseLeave={() => hidePeek()}
                            onKeyDown={e => {
                              const go: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
                              if (go[e.key]) { e.preventDefault(); move(ri, ci, ...go[e.key]); }
                              else if (e.key === "Home") { e.preventDefault(); move(ri, -1, 0, 1); }
                              else if (e.key === "End") { e.preventDefault(); move(ri, f.columns.length, 0, -1); }
                              else if (e.key === " ") { e.preventDefault(); if (!dim) flip([k]); }
                              else if (e.key === "Escape") { setPeek(null); }
                            }}
                            onKeyUp={e => { if (e.key === " ") e.preventDefault(); }}>
                            <span className="rv-st"><Icon /><b>{say}</b></span>
                            {when && <small className="rv-when">{when}</small>}
                            {what && <small className="rv-what" title={what}>{what}</small>}
                          </button>
                          <span className="rv-foot">
                            {!dim && pickBox(k, r, c)}
                            <span className="rv-marks">
                              {cell.comments > 0 && <span className="rv-cm" title={zh ? `${cell.comments} 条未解决的评论` : `${cell.comments} open comment${cell.comments === 1 ? "" : "s"}`}><I.message />{cell.comments}</span>}
                              {mark?.(r, cell)}
                            </span>
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
      <div className="rv-foot-row">
        <ul className="rv-legend" aria-label={zh ? "图例" : "Legend"}>
          {SHOWN.map(s => { const Icon = STATUS_ICON[s as Exclude<CellStatus, "none">]; return <li key={s} className={"s-" + s}><Icon /><span>{b(STATUS_WORDS[s as Exclude<CellStatus, "none">])}</span></li>; })}
        </ul>
        {!phone && <p className="rv-keys" id="rv-keys">{zh ? "方向键在格子间移动，空格选择，回车打开，Esc 清除所选" : "Arrow keys move between cells, Space picks, Enter opens, Esc clears the picks"}</p>}
      </div>
      {peekCard}
    </div>
  );
}

const AttnIcon = () => <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.4v.01" /></svg>;

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
