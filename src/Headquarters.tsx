import { useCallback, useEffect, useMemo, useState } from "react";
import { B, type Bi } from "./bi";
import { hqBrand, hqLines, hqTotals, type HqLine, type HqRow, type HqStatus, type HqStore } from "./hq";
import type { Lang } from "./i18n";
import { Logo } from "./Logo";
import { daysFromNow, daysUntil, fmtAgo, fmtDay, fmtIn } from "./time";
import * as api from "./cloud/api";
import * as capi from "./cloud/collab";
import { HqMetrics } from "./Metrics";
import { HqRollout } from "./HqRollout";
/* Team review (src/review.ts, src/ReviewTable.tsx, src/Comments.tsx): the review table across franchisees, and the
   permit threads each franchisee shares with headquarters */
import { buildGrid, statusSay, storesOfHq, storesOfWorkspace, type HqReviewRow, type ReviewCell, type ReviewRow, type ReviewStore } from "./review";
import { ReviewTable, STATUS_ICON, type Picked } from "./ReviewTable";
import { CommentThread, type Collab, type ThreadSource } from "./Comments";
import { SAMPLE_HQ_ID, SAMPLE_PEOPLE, sampleHqNotices, sampleHqReview, type Comment, type ItemRef, type Notice } from "./collab";
import type { Workspace } from "./model";
import { I, Modal } from "./ui";

/* Headquarters: every store across every franchisee that shared with this email, in one view. Read only: it never
   sees a franchisee's documents, form lines, logins, chats or staff. Works inside a workspace (a nav entry), on its
   own for a headquarters account with no workspace of its own, and in the sample (Moonleaf's brand office, with the
   sample's stores and two other franchisees'). The review table is first; the store list below is the summary. */

const STATUS: Record<HqStatus, Bi> = { current: B("Current", "正常"), due: B("Due soon", "即将到期"), overdue: B("Overdue", "已逾期") };
type Filter = "all" | HqStatus | "opening";
type View = "review" | "list";

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

/** The store list's summary for the sample, worked out the way hq_summary does it on the server. */
function summaryOf(stores: ReviewStore[]): HqRow[] {
  const by = new Map<string, HqRow>();
  for (const s of stores) {
    if (s.stage === "business") continue;
    const dated = s.items.map(i => ({ i, d: i.kind === "app" ? (i.status === "approved" ? i.expires : i.due) : i.expires })).filter((x): x is { i: typeof x.i; d: string } => !!x.d);
    const n = (d: string) => daysUntil(d);
    const overdue = dated.filter(x => n(x.d) < 0).length, due30 = dated.filter(x => n(x.d) >= 0 && n(x.d) <= 30).length;
    const next = [...dated].sort((a, b) => (n(a.d) < 0 ? -1 : 0) - (n(b.d) < 0 ? -1 : 0) || a.d.localeCompare(b.d))[0];
    const st: HqStore = { id: s.id, name: s.name, stage: s.stage === "open" ? "open" : "opening", address: s.address, planned_open: s.opens ?? null, projected_open: s.opens ?? null, opened: null, grade: null,
      current: s.items.filter(i => (i.kind !== "app" || i.status === "approved") && !(i.expires && n(i.expires) <= 30)).length, due_30: due30, overdue,
      pending: s.items.filter(i => i.kind === "app" && i.status !== "approved").length, status: overdue ? "overdue" : due30 ? "due" : "current",
      next: next ? { kind: next.i.kind === "app" ? (next.i.status === "approved" ? "renewal" : "due") : "permit", title: next.i.name, date: next.d } : null };
    const row = by.get(s.workspaceId ?? "") ?? { workspace_id: s.workspaceId ?? "", name: s.franchisee ?? "", brand: "Moonleaf", stores: [] };
    row.stores.push(st);
    by.set(row.workspace_id, row);
  }
  return [...by.values()];
}

export function Headquarters({ lang, initial, sample }: { lang: Lang; initial: HqRow[]; sample?: { ws: Workspace; team: Collab } }) {
  const b = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const today = daysFromNow(0);
  const [rows, setRows] = useState<HqRow[]>(initial);
  const [review, setReview] = useState<HqReviewRow[]>([]);
  const [notices, setNotices] = useState<Notice[]>(() => (sample ? sampleHqNotices() : []));
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("review");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<{ row: ReviewRow; cell: ReviewCell; col: string } | null>(null);
  const [toast, setToast] = useState("");
  const say = useCallback((s: string) => { setToast(s); window.setTimeout(() => setToast(t => (t === s ? "" : t)), 4000); }, []);
  // live: load again on open and whenever the window comes back into focus
  const load = useCallback(async () => {
    if (sample) return;
    try {
      const [r, rv, ns] = await Promise.all([api.hqStores(), capi.hqReview(), capi.listNotices().catch(() => [] as Notice[])]);
      setRows(r); setReview(rv); setNotices(ns); setErr("");
    } catch (e) { setErr((e as api.ApiError).message ?? String(e)); }
  }, [sample]);
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener("focus", on);
    return () => window.removeEventListener("focus", on);
  }, [load]);

  /* the sample: Moonleaf's brand office, with the sample's own stores (as headquarters sees them: shared comments only,
     never who has what) beside two other franchisees' */
  const [sampleThreads, setSampleThreads] = useState<Comment[]>(() => [{ id: "hq-s1", item: { kind: "app", id: "g-sdplan" }, author: { id: null, email: "", hq: false }, body: "The architect sends the stamped plans next week.", mentions: [], shared: true, askedOdelia: false, at: new Date(Date.now() - 864e5 * 2).toISOString() }]);
  const sampleStores = useMemo<ReviewStore[] | null>(() => {
    if (!sample) return null;
    const shared = (id: string) => sample.team.comments.filter(c => c.item.kind === "app" && c.item.id === id && c.shared && !c.resolvedAt).length;
    const own = storesOfWorkspace(sample.ws, { comments: shared }).map(s => ({ ...s, key: `${SAMPLE_HQ_ID}:${s.id}`, franchisee: "Moonleaf Tea LLC", workspaceId: SAMPLE_HQ_ID }));
    const others = storesOfHq(sampleHqReview()).map(s => ({ ...s, items: s.items.map(i => (i.kind === "app" ? { ...i, comments: sampleThreads.filter(c => c.item.id === i.id && !c.resolvedAt).length } : i)) }));
    return [...own, ...others];
  }, [sample, sampleThreads]);
  const fromServer = useMemo(() => storesOfHq(review), [review]);
  const stores = sampleStores ?? fromServer;
  const summary = useMemo(() => (sampleStores ? summaryOf(sampleStores) : rows), [sampleStores, rows]);
  const lines = useMemo(() => hqLines(summary), [summary]);
  const tot = hqTotals(lines);
  const brand = sample ? "Moonleaf" : hqBrand(rows);
  const shown = lines.filter(l => filter === "all" || (filter === "opening" ? l.stage === "opening" : l.status === filter));
  const franchisees = new Set(stores.map(s => s.workspaceId)).size || summary.length;
  const hqMe = SAMPLE_PEOPLE.find(p => p.role === "hq")!;

  /* asking the franchisee about picked permits, and reminders for headquarters itself */
  const appsOf = (picked: Picked[]) => {
    const out: { ws: string; app: string; name: Bi; store: ReviewStore }[] = [];
    for (const p of picked) {
      const st = stores.find(s => s.key === p.row);
      if (!st?.workspaceId) continue;
      const grid = buildGrid([st], today), cell = grid.rows[0]?.cells[p.col];
      for (const it of cell?.items ?? []) if (it.kind === "app" && !out.some(x => x.ws === st.workspaceId && x.app === it.id)) out.push({ ws: st.workspaceId, app: it.id, name: it.name, store: st });
    }
    return out;
  };
  const askFranchisee = async (picked: Picked[], text: string) => {
    const apps = appsOf(picked);
    if (!apps.length || !text.trim()) return false;
    if (sample) {
      for (const a of apps) {
        if (a.ws === SAMPLE_HQ_ID) await sample.team.post({ kind: "app", id: a.app }, text, { share: true, title: a.name, as: hqMe });
        else setSampleThreads(l => [...l, { id: `hq-${Date.now().toString(36)}-${a.app}`, item: { kind: "app", id: a.app }, author: { id: hqMe.id, email: hqMe.email, hq: true }, body: text.trim(), mentions: [], shared: true, askedOdelia: false, at: new Date().toISOString() }]);
      }
    } else {
      try { await capi.hqAsk(apps.map(a => ({ workspace_id: a.ws, app_id: a.app })), text); capi.notify(); void load(); }
      catch (e) { say((e as api.ApiError).message ?? String(e)); return false; }
    }
    say(zh ? `已就 ${apps.length} 项许可询问加盟商，各加盟商的所有者会收到通知。` : `Asked about ${apps.length} permit${apps.length === 1 ? "" : "s"}. Each franchisee's owners are told.`);
    return true;
  };
  const remindMe = async (picked: Picked[], on: string) => {
    const apps = appsOf(picked);
    if (!apps.length) return false;
    if (sample) {
      setNotices(ns => [...apps.map((a, i): Notice => ({ id: `sr-${Date.now().toString(36)}-${i}`, kind: "reminder", title: B(`Reminder: ${a.name.en}`, `提醒：${a.name.zh}`), item: { kind: "app", id: a.app }, at: on + "T09:00:00", read: false, remindOn: on, workspaceId: a.ws })), ...ns]);
    } else {
      try {
        const byWs = new Map<string, string[]>();
        for (const a of apps) byWs.set(a.ws, [...(byWs.get(a.ws) ?? []), a.app]);
        for (const [ws, ids] of byWs) await capi.hqRemind(ws, ids, on);
        void load();
      } catch (e) { say((e as api.ApiError).message ?? String(e)); return false; }
    }
    say(zh ? `已设置 ${fmtDay(on, lang)} 的提醒，届时会发邮件给您。` : `Reminder set for ${fmtDay(on, lang)}. You'll get an email that day.`);
    return true;
  };
  const due = notices.filter(n => !n.remindOn || n.remindOn <= today);
  const later = notices.filter(n => n.remindOn && n.remindOn > today);
  const openNotice = (n: Notice) => {
    const st = stores.find(s => s.workspaceId === n.workspaceId && s.items.some(i => i.kind === "app" && i.id === n.item?.id));
    if (!st || !n.item) return;
    const grid = buildGrid([st], today), row = grid.rows[0];
    const col = grid.columns.find(c => row.cells[c.key].items.some(i => i.kind === "app" && i.id === n.item!.id));
    if (col) setOpen({ row, cell: { ...row.cells[col.key], app: n.item.id }, col: col.key });
    if (!n.read) { setNotices(ns => ns.map(x => (x.id === n.id ? { ...x, read: true } : x))); if (!sample) void capi.readNotices([n.id]); }
  };

  return (
    <div className="page hq">
      <header className="ph"><div className="ph-tx">
        <h1>{brand ? (zh ? `${brand} 总部` : `${brand} headquarters`) : b(B("Headquarters", "总部"))}</h1>
        <p>{b(B(`Live status of every store across ${franchisees} franchisee${franchisees === 1 ? "" : "s"}, in one view. Read only: each franchisee's documents, logins, chats and staff stay with them.`,
          `${franchisees} 家加盟商的每家门店实时状态，一个视图看全。仅供查看：各加盟商的文件、登录信息、对话和员工信息不会共享。`))}</p>
        {sample && <p className="hq-sample">{zh ? "示例：Moonleaf 品牌总部看到的样子，包括本示例的两家门店和另外两家加盟商。" : "Sample: what Moonleaf's brand office sees, with this sample's two stores and two other franchisees."}</p>}
      </div></header>

      <dl className="hq-tot">
        <div><dt>{b(B("Stores", "门店"))}</dt><dd>{tot.stores}</dd>{tot.opening > 0 && <small>{zh ? `${tot.opening} 家筹备中` : `${tot.opening} opening`}</small>}</div>
        <div className="ok"><dt>{b(B("Fully current", "全部有效"))}</dt><dd>{tot.current}</dd></div>
        <div className={tot.due ? "warn" : ""}><dt>{b(B("Due in 30 days", "30 天内到期"))}</dt><dd>{tot.due}</dd></div>
        <div className={tot.overdue ? "bad" : ""}><dt>{b(B("Overdue", "已逾期"))}</dt><dd>{tot.overdue}</dd></div>
      </dl>

      {err && <p className="note">{err}</p>}

      {(due.length > 0 || later.length > 0) && (
        <section className="sec hq-for" aria-label={zh ? "给您的" : "For you"}>
          <div className="sec-h"><h2>{zh ? "给您的" : "For you"}{due.some(n => !n.read) ? <em>{due.filter(n => !n.read).length}</em> : null}</h2></div>
          <ul className="tray hq-notes">
            {due.slice(0, 6).map(n => (
              <li key={n.id} className={"row" + (n.read ? "" : " unread")}>
                <button type="button" className="hq-note" onClick={() => openNotice(n)}>
                  <span className="hq-note-i" aria-hidden="true">{n.kind === "reminder" ? <I.deadlines /> : <I.message />}</span>
                  <span className="hq-note-t"><b>{b(n.title)}</b>{n.body && <small>{b(n.body)}</small>}</span>
                  <time>{n.remindOn ? fmtDay(n.remindOn, lang) : fmtAgo(n.at, lang)}</time>
                </button>
              </li>
            ))}
            {later.length > 0 && <li className="row hq-later"><I.deadlines /><span>{zh ? `${later.length} 个提醒待到期，最近的在 ${fmtDay(later.map(n => n.remindOn!).sort()[0], lang)}` : `${later.length} reminder${later.length === 1 ? "" : "s"} coming up, the next on ${fmtDay(later.map(n => n.remindOn!).sort()[0], lang)}`}</span></li>}
          </ul>
        </section>
      )}

      {!sample && <HqMetrics lang={lang} />}
      {!sample && <HqRollout lang={lang} say={say} />}

      {lines.length === 0 && stores.length === 0 ? (
        <div className="empty">
          <p>{b(B("No franchisee has shared stores with you yet. Ask each franchisee's owner to open Settings, Headquarters, in Placetta and add your email.",
            "还没有加盟商与您共享门店。请各加盟商的所有者在快哉的“设置 > 总部”中添加您的邮箱。"))}</p>
        </div>
      ) : (<>
        <nav className="seg hq-views" role="tablist" aria-label={zh ? "视图" : "View"}>
          <button type="button" role="tab" aria-selected={view === "review"} onClick={() => setView("review")}>{zh ? "审阅表" : "Review table"}</button>
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")}>{zh ? "门店列表" : "Store list"}</button>
        </nav>
        {view === "review" ? (
          <HqReview lang={lang} stores={stores} onOpen={(row, col, cell) => setOpen({ row, col, cell })} ask={askFranchisee} remind={remindMe} />
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
        </>)}
        <p className="note">{b(B("Counts each store's permits on file and the due dates and renewals of its applications. Placetta emails this summary to you every Monday.",
          "统计每家门店的现有许可，以及其申请的截止日期和续期。快哉每周一会把这份摘要发到您的邮箱。"))}</p>
      </>)}
      {open && <HqItem lang={lang} open={open} onClose={() => setOpen(null)} sample={sample ? { team: sample.team, threads: sampleThreads, setThreads: setSampleThreads, me: hqMe } : undefined} reload={load} />}
      {toast && <div className="toast hq-toast" role="status">{toast}</div>}
    </div>
  );
}

/** The review table across franchisees. Headquarters can ask a franchisee about picked permits (a comment on each,
 *  shared with headquarters, and the owners are told), set itself a reminder, and export the table. It can't start
 *  Odelia or assign anyone: those are the franchisee's own team's to do. */
function HqReview({ lang, stores, onOpen, ask, remind }: { lang: Lang; stores: ReviewStore[]; onOpen(row: ReviewRow, col: string, cell: ReviewCell): void;
  ask(picked: Picked[], text: string): Promise<boolean>; remind(picked: Picked[], on: string): Promise<boolean> }) {
  const zh = lang === "zh";
  const [asking, setAsking] = useState<string | null>(null);
  const [when, setWhen] = useState<string | null>(null);
  const hasApp = (picked: Picked[]) => picked.some(p => { const s = stores.find(x => x.key === p.row); return !!s && buildGrid([s], daysFromNow(0)).rows[0]?.cells[p.col]?.items.some(i => i.kind === "app"); });
  return (
    <ReviewTable lang={lang} stores={stores} hq csvName={zh ? "总部审阅表" : "placetta-headquarters-review"} onOpen={onOpen}
      empty={<p className="quiet">{zh ? "还没有加盟商与您共享门店。" : "No franchisee has shared stores with you yet."}</p>}
      bulk={(picked, _grid, clear) => {
        const ok = hasApp(picked);
        return asking !== null ? (
          <span className="rv-ask">
            <textarea rows={2} value={asking} maxLength={2000} onChange={e => setAsking(e.target.value)} aria-label={zh ? "给加盟商的话" : "Message to the franchisee"} />
            <button type="button" className="sbtn ink" disabled={!asking.trim()} onClick={async () => { if (await ask(picked, asking)) { setAsking(null); clear(); } }}>{zh ? "发送" : "Send"}</button>
            <button type="button" className="lnk quiet" onClick={() => setAsking(null)}>{zh ? "取消" : "Cancel"}</button>
          </span>
        ) : when !== null ? (
          <span className="rv-remind">
            <input type="date" value={when} min={daysFromNow(0)} onChange={e => setWhen(e.target.value)} aria-label={zh ? "提醒日期" : "Reminder date"} />
            <button type="button" className="sbtn ink" disabled={!when} onClick={async () => { if (await remind(picked, when)) { setWhen(null); clear(); } }}>{zh ? "设置" : "Set"}</button>
            <button type="button" className="lnk quiet" onClick={() => setWhen(null)}>{zh ? "取消" : "Cancel"}</button>
          </span>
        ) : (
          <>
            <button type="button" className="sbtn ink" disabled={!ok} title={ok ? undefined : (zh ? "请选择申请类的格子" : "Pick cells with applications")}
              onClick={() => setAsking(zh ? "请让 Odelia 准备这些，提交后告诉我们。" : "Please have Odelia prepare these, and tell us when they're filed.")}><I.message />{zh ? "询问加盟商" : "Ask the franchisee"}</button>
            <button type="button" className="sbtn quiet" disabled={!ok} onClick={() => setWhen(daysFromNow(7))}><I.deadlines />{zh ? "提醒我" : "Remind me"}</button>
          </>
        );
      }} />
  );
}

/** One cell opened by headquarters: the permit's state and dates, and the thread the franchisee shares with
 *  headquarters. Nothing else of the application: its form lines, documents and who works on it stay with them. */
function HqItem({ lang, open, onClose, sample, reload }: { lang: Lang; open: { row: ReviewRow; cell: ReviewCell; col: string }; onClose(): void; reload(): void;
  sample?: { team: Collab; threads: Comment[]; setThreads: (f: (l: Comment[]) => Comment[]) => void; me: import("./collab").Person } }) {
  const zh = lang === "zh", b = (x: Bi) => x[lang];
  const { row, cell } = open;
  const app = cell.app ? cell.items.find(i => i.kind === "app" && i.id === cell.app) : undefined;
  const ws = row.store.workspaceId ?? "";
  const item: ItemRef | null = app ? { kind: "app", id: app.id } : null;
  const [list, setList] = useState<Comment[]>([]);
  const loadThread = useCallback(async () => { if (!sample && item) setList(await capi.hqComments(ws, item.id).catch(() => [])); }, [sample, ws, item?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadThread(); }, [loadThread]);
  const own = sample && ws === SAMPLE_HQ_ID;
  const thread = !item ? [] : sample
    ? (own ? sample.team.comments.filter(c => c.item.kind === "app" && c.item.id === item.id && c.shared) : sample.threads.filter(c => c.item.id === item.id))
    : list;
  const me = sample?.me ?? { id: "me", name: "", email: "", role: "hq" as const, you: true };
  const source: ThreadSource = {
    lang, me, people: [], list: thread, canShare: false, canOdelia: false,
    author: c => (c.author.hq ? (zh ? `总部${c.author.email ? `（${c.author.email}）` : ""}` : `Headquarters${c.author.email ? ` (${c.author.email})` : ""}`) : (row.store.franchisee ?? (zh ? "加盟商" : "The franchisee"))),
    post: async body => {
      if (!item || !app) return false;
      if (sample) {
        if (own) return sample.team.post(item, body, { share: true, title: app.name, as: sample.me });
        sample.setThreads(l => [...l, { id: `hq-${Date.now().toString(36)}`, item, author: { id: sample.me.id, email: sample.me.email, hq: true }, body: body.trim(), mentions: [], shared: true, askedOdelia: false, at: new Date().toISOString() }]);
        return true;
      }
      try { await capi.postComment(ws, item, body, [], true); capi.notify(); await loadThread(); reload(); return true; } catch { return false; }
    },
    resolve: async (id, on) => {
      if (sample) {
        if (own) return sample.team.resolve(id, on, app?.name ?? B("", ""));
        sample.setThreads(l => l.map(c => (c.id === id ? { ...c, resolvedAt: on ? new Date().toISOString() : null } : c)));
        return;
      }
      await capi.resolveComment(id, on).catch(() => undefined); await loadThread(); reload();
    },
  };
  const Icon = cell.status !== "none" ? STATUS_ICON[cell.status] : null;
  return (
    <Modal label={b(app?.name ?? row.store.name)} onClose={onClose}>
      <header className="m-h">
        <button type="button" className="icbtn close" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
        <p className="cmt-kind">{[row.store.franchisee, b(row.store.name)].filter(Boolean).join(zh ? "，" : ", ")}</p>
        <h2 className="cmt-title">{app ? b(app.name) : b(B("On file", "现有许可与证书"))}</h2>
        <p className={"hq-item-st s-" + cell.status}>{Icon && <Icon />}<b>{statusSay(cell.status, cell.days, lang)}</b>
          {cell.next && <span>{cell.next.kind === "due" ? (zh ? `${fmtDay(cell.next.date, lang, true)}截止` : `Due ${fmtDay(cell.next.date, lang, true)}`) : (zh ? `${fmtDay(cell.next.date, lang, true)}到期` : `Expires ${fmtDay(cell.next.date, lang, true)}`)}</span>}</p>
      </header>
      <div className="m-body">
        {!app && (
          <ul className="hq-items">{cell.items.map(i => <li key={i.id}><b>{b(i.name)}</b>{i.expires && <small>{zh ? `${fmtDay(i.expires, lang, true)}到期` : `Expires ${fmtDay(i.expires, lang, true)}`}</small>}</li>)}</ul>
        )}
        {app && cell.items.length > 1 && <p className="note">{zh ? `这一格还有：${cell.items.filter(i => i !== app).map(i => b(i.name)).join("、")}` : `Also in this cell: ${cell.items.filter(i => i !== app).map(i => b(i.name)).join(", ")}`}</p>}
        <p className="note hq-ro">{zh ? "仅供查看：申请的表格内容、文件和负责人留在加盟商那里。这里的评论会与加盟商的所有者共享。" : "Read only: the application's form lines, documents and who works on it stay with the franchisee. Comments here are shared with the franchisee's owners."}</p>
        {app ? <CommentThread source={source} /> : <p className="quiet">{zh ? "可以在许可上评论；现有许可与证书只显示到期日。" : "Comments go on permits. Permits on file and certificates show their expiry only."}</p>}
      </div>
    </Modal>
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
