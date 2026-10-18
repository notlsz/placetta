import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { B, type Bi } from "./bi";
import { useApp } from "./ctx";
import type { CloudSession } from "./cloud/session";
import * as api from "./cloud/api";
import * as capi from "./cloud/collab";
import {
  agentComments, assignLocal, handleOf, initials, itemKey, mentionsIn, ODELIA, ODELIA_AT, odeliaAsk, postLocal, resolveLocal, sampleTeam, SAMPLE_PEOPLE, segments, shortName, typing,
  type Assignment, type Comment, type ItemRef, type LocalTeam, type Notice, type Person,
} from "./collab";
import { audit } from "./core";
import type { Lang } from "./i18n";
import type { AgentComment } from "./live";
import type { UpdateItem, Workspace } from "./model";
import { daysFromNow, fmtAgo } from "./time";
import { I, Menu, Modal } from "./ui";
import "./review.css";

/* Team review in the app (src/collab.ts has the rules, the database holds them in an account): comment threads on
   applications, documents and jobs with @mentions, resolve and reopen, "Assigned to" on applications and jobs, and the
   Mine filter that Home and Permits share. useCollab is the one store; the components below read it. */

export type Collab = {
  me: Person;
  /** teammates, and the headquarters emails this workspace shares with (they can be @mentioned on a permit) */
  people: Person[];
  /** the workspace shares its stores with headquarters, so a comment on a permit can be shared too */
  hqShared: boolean;
  comments: Comment[];
  assignments: Assignment[];
  notices: Notice[];
  thread(item: ItemRef): Comment[];
  openCount(item: ItemRef): number;
  assigneeOf(item: ItemRef): Person | undefined;
  post(item: ItemRef, body: string, o: { share: boolean; title: Bi; as?: Person }): Promise<boolean>;
  resolve(id: string, on: boolean, title: Bi): Promise<void>;
  assign(item: ItemRef, to: string | null, title: Bi): Promise<void>;
  /** the Mine filter on Home and Permits */
  mine: boolean;
  setMine(v: boolean): void;
  isMine(item: ItemRef): boolean;
  /** the comments as Odelia reads them (read_comments) */
  forAgent(item?: ItemRef): Promise<AgentComment[]>;
  /** this person's notices as Updates, and marking them read */
  updates: UpdateItem[];
  readAll(): void;
};
export const CollabCtx = createContext<Collab | null>(null);
export const useTeam = () => { const c = useContext(CollabCtx); if (!c) throw new Error("no team context"); return c; };

const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };
const same = (s: string): Bi => ({ en: s, zh: s });
const sameItem = (a: ItemRef, b: ItemRef) => a.kind === b.kind && a.id === b.id;

/** Names for an account's people: the part of the email before the @, or the whole email where two would collide. */
function named(ps: Person[]): Person[] {
  const local = (p: Person) => p.email.split("@")[0];
  return ps.map(p => (p.role === "hq" || p.name ? p : { ...p, name: ps.filter(x => x.role !== "hq" && local(x) === local(p)).length > 1 ? p.email : local(p) }));
}

/** The team store: the sample's team in the browser, or the account's from the database (refreshed every 30 seconds
 *  while the app is open, and on focus). */
export function useCollab(o: { cloud?: CloudSession; ws: Workspace; lang: Lang; say: (s: string) => void; editWs: (f: (w: Workspace) => Workspace) => void; ask: (text: string) => void }): Collab {
  const { cloud } = o;
  const [team, setTeam] = useState<LocalTeam>(() => (cloud ? { comments: [], assignments: [], notices: [] } : sampleTeam()));
  const [people, setPeople] = useState<Person[]>(() => (cloud ? [{ id: cloud.me.id, name: "", email: cloud.me.email, role: cloud.role, you: true }] : SAMPLE_PEOPLE));
  const [mine, setMineState] = useState(() => readFlag("placetta-mine"));
  const setMine = useCallback((v: boolean) => { setMineState(v); writeFlag("placetta-mine", v); }, []);
  const live = useRef({ o, team, people });
  live.current = { o, team, people };
  const me = useMemo(() => named(people).find(p => p.you) ?? people[0], [people]);

  const load = useCallback(async () => {
    if (!cloud) return;
    try {
      const [comments, assignments, notices] = await Promise.all([capi.listComments(cloud.wsId), capi.listAssignments(cloud.wsId), capi.listNotices(cloud.wsId)]);
      setTeam({ comments, assignments, notices });
    } catch { /* offline: the next tick tries again */ }
  }, [cloud]);
  useEffect(() => {
    if (!cloud) return;
    void load();
    void Promise.all([api.teamList(cloud.wsId).catch(() => null), api.hqLinks(cloud.wsId).catch(() => [])]).then(([t, links]) => {
      const ps: Person[] = (t?.members ?? []).map(m => ({ id: m.user_id, name: "", email: m.email, role: m.role, you: m.you || m.user_id === cloud.me.id }));
      if (!ps.some(p => p.you)) ps.unshift({ id: cloud.me.id, name: "", email: cloud.me.email, role: cloud.role, you: true });
      setPeople([...ps, ...links.map((l): Person => ({ id: "hq:" + l.hq_email, name: "", email: l.hq_email, role: "hq" }))]);
    });
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const t = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    return () => { window.clearInterval(t); window.removeEventListener("focus", tick); };
  }, [cloud, load]);

  const fail = (e: unknown) => { const x = e as api.ApiError; live.current.o.say(x?.message ?? String(e)); };
  const zh = () => live.current.o.lang === "zh";

  const post = useCallback<Collab["post"]>(async (item, body, x) => {
    const text = body.trim();
    if (!text) return false;
    const { o: cur, people: ps } = live.current;
    const author = x.as ?? named(ps).find(p => p.you)!;
    const mentions = mentionsIn(text, named(ps).filter(p => p.id !== author.id && (author.role !== "hq" || p.role === "hq")), { odelia: item.kind === "app" && author.role !== "hq" });
    let odelia = false;
    if (cloud) {
      try {
        const r = await capi.postComment(cloud.wsId, item, text, mentions, x.share && item.kind === "app");
        setTeam(s => ({ ...s, comments: [...s.comments, r.comment] }));
        odelia = r.odelia;
        capi.notify();
      } catch (e) { fail(e); return false; }
    } else {
      // in turn, so several posted at once (headquarters asking about many permits) all land
      const all = named(ps), viewer = all.find(p => p.you)!.id, owners = all.filter(p => p.role === "owner").map(p => p.id);
      setTeam(prev => postLocal(prev, { me: author, viewer, owners, item, title: x.title, body: text, mentions, shared: x.share }).team);
      odelia = author.role !== "hq" && item.kind === "app" && mentions.some(m => m.kind === "odelia");
      cur.editWs(audit("you", author.role === "hq" ? B("Headquarters commented", "总部发表评论") : odelia ? B("Commented and asked Odelia", "发表评论并请 Odelia 处理") : B("Commented", "发表评论"), x.title, same(text.slice(0, 200)),
        author.role === "hq" ? B("Headquarters", "总部") : undefined));
    }
    if (odelia && item.kind === "app") {
      const app = cur.ws.apps.find(a => a.id === item.id);
      if (app) {
        const r = odeliaAsk(text, app, shortName(author, zh() ? "同事" : "A teammate"), cur.lang);
        if ("blocked" in r) cur.say(r.blocked[cur.lang]); else cur.ask(r.prompt);
      }
    }
    return true;
  }, [cloud]);   // eslint-disable-line react-hooks/exhaustive-deps

  const resolve = useCallback<Collab["resolve"]>(async (id, on, title) => {
    const { o: cur, team: t, people: ps } = live.current;
    if (cloud) {
      try { const c = await capi.resolveComment(id, on); setTeam(s => ({ ...s, comments: s.comments.map(x => (x.id === id ? c : x)) })); } catch (e) { fail(e); }
      return;
    }
    const c = t.comments.find(x => x.id === id);
    setTeam(prev => resolveLocal(prev, id, on, named(ps).find(p => p.you)!.id));
    cur.editWs(audit("you", on ? B("Resolved a comment", "将评论标为已解决") : B("Reopened a comment", "重新打开评论"), title, c ? same(c.body.slice(0, 200)) : undefined));
  }, [cloud]);   // eslint-disable-line react-hooks/exhaustive-deps

  const assign = useCallback<Collab["assign"]>(async (item, to, title) => {
    const { o: cur, people: ps } = live.current;
    if (cloud) {
      try { await capi.assign(cloud.wsId, item, to); setTeam(s => ({ ...s, assignments: [...s.assignments.filter(a => !sameItem(a.item, item)), ...(to ? [{ item, assignee: to, by: cloud.me.id, at: new Date().toISOString() }] : [])] })); capi.notify(); }
      catch (e) { fail(e); }
      return;
    }
    const all = named(ps), who = all.find(p => p.id === to), me = all.find(p => p.you)!;
    setTeam(prev => assignLocal(prev, item, to, me, title, me.id));
    cur.editWs(audit("you", to ? B("Assigned", "分配") : B("Unassigned", "取消分配"), title, who ? same(shortName(who)) : undefined));
  }, [cloud]);   // eslint-disable-line react-hooks/exhaustive-deps

  const today = daysFromNow(0);
  const updates = useMemo<UpdateItem[]>(() => team.notices.filter(n => !n.remindOn || n.remindOn <= today).map(n => ({
    id: "nt-" + n.id, kind: "mention" as const, title: n.title, body: n.body ?? undefined, app: n.item?.kind === "app" ? n.item.id : undefined, at: n.at, read: n.read,
  })), [team.notices, today]);
  const readAll = useCallback(() => {
    const unread = live.current.team.notices.filter(n => !n.read).map(n => n.id);
    if (!unread.length) return;
    setTeam(s => ({ ...s, notices: s.notices.map(n => ({ ...n, read: true })) }));
    if (cloud) void capi.readNotices(unread).catch(() => undefined);
  }, [cloud]);

  const allPeople = useMemo(() => named(people), [people]);
  return useMemo<Collab>(() => ({
    me, people: allPeople, hqShared: allPeople.some(p => p.role === "hq"),
    comments: team.comments, assignments: team.assignments, notices: team.notices,
    thread: item => team.comments.filter(c => sameItem(c.item, item)),
    openCount: item => team.comments.filter(c => sameItem(c.item, item) && !c.resolvedAt).length,
    assigneeOf: item => { const a = team.assignments.find(x => sameItem(x.item, item)); return a ? allPeople.find(p => p.id === a.assignee) ?? { id: a.assignee, name: "", email: "", role: "member" } : undefined; },
    post, resolve, assign, mine, setMine,
    isMine: item => team.assignments.some(a => sameItem(a.item, item) && a.assignee === me.id),
    forAgent: async item => agentComments(live.current.team.comments, live.current.people, item),
    updates, readAll,
  }), [me, allPeople, team, post, resolve, assign, mine, setMine, updates, readAll]);
}

/* ---------------------------- a thread ---------------------------- */

/** Where a thread's comments come from: the workspace's team (the default), or headquarters' shared thread. */
export type ThreadSource = {
  lang: Lang;
  me: Person;
  /** who can be @mentioned here */
  people: Person[];
  list: Comment[];
  /** a comment here can be shared with headquarters (a permit, in a workspace that shares with it) */
  canShare: boolean;
  /** Odelia can be @mentioned here (a permit, by the franchisee's own team) */
  canOdelia: boolean;
  post(body: string, share: boolean): Promise<boolean>;
  resolve(id: string, on: boolean): Promise<void>;
  author(c: Comment): string;
};

/** The workspace's thread on one item, from the team store. */
export function useItemThread(item: ItemRef, title: Bi): ThreadSource {
  const team = useTeam();
  const { lang } = useApp();
  return useMemo(() => ({
    lang, me: team.me, people: team.people.filter(p => !p.you && (p.role !== "hq" || item.kind === "app")), list: team.thread(item),
    canShare: item.kind === "app" && team.hqShared, canOdelia: item.kind === "app" && team.me.role !== "hq",
    post: (body, share) => team.post(item, body, { share, title }),
    resolve: (id, on) => team.resolve(id, on, title),
    author: c => {
      if (c.author.hq) return lang === "zh" ? `总部${c.author.email ? `（${c.author.email}）` : ""}` : `Headquarters${c.author.email ? ` (${c.author.email})` : ""}`;
      const p = team.people.find(x => x.id === c.author.id);
      return p?.you ? (lang === "zh" ? "您" : "You") : shortName(p, c.author.email.split("@")[0] || (lang === "zh" ? "前成员" : "Former member"));
    },
  }), [team, item.kind, item.id, title, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
}

/** A comment thread: open comments first in the order they came, the resolved ones folded below, and the box to add
 *  one, where @ suggests teammates (and headquarters and Odelia where they can be mentioned). */
export function CommentThread({ source, autoFocus }: { source: ThreadSource; autoFocus?: boolean }) {
  const { lang } = source;
  const zh = lang === "zh";
  const [showDone, setShowDone] = useState(false);
  const open = source.list.filter(c => !c.resolvedAt), done = source.list.filter(c => c.resolvedAt);
  return (
    <section className="cmt" aria-label={zh ? "评论" : "Comments"}>
      {open.length === 0 && done.length === 0 && <p className="cmt-empty">{zh ? "还没有评论。可以提问、交代事情，或输入 @ 提到同事。" : "No comments yet. Ask a question, leave a note, or type @ to bring someone in."}</p>}
      {open.length > 0 && <ol className="cmt-list">{open.map(c => <CommentRow key={c.id} c={c} source={source} />)}</ol>}
      {done.length > 0 && (
        <>
          <button type="button" className="lnk cmt-fold" aria-expanded={showDone} onClick={() => setShowDone(v => !v)}>
            <I.chevR />{zh ? `${done.length} 条已解决` : `${done.length} resolved`}
          </button>
          {showDone && <ol className="cmt-list done">{done.map(c => <CommentRow key={c.id} c={c} source={source} />)}</ol>}
        </>
      )}
      <NewComment source={source} autoFocus={autoFocus} />
    </section>
  );
}

function CommentRow({ c, source }: { c: Comment; source: ThreadSource }) {
  const { lang } = source;
  const zh = lang === "zh";
  const [busy, setBusy] = useState(false);
  const toggle = async () => { setBusy(true); try { await source.resolve(c.id, !c.resolvedAt); } finally { setBusy(false); } };
  return (
    <li className={"cmt-i" + (c.resolvedAt ? " done" : "") + (c.author.hq ? " hq" : "")}>
      <div className="cmt-h">
        <b>{source.author(c)}</b>
        {c.shared && !c.author.hq && source.me.role !== "hq" && <em className="cmt-tag">{zh ? "已与总部共享" : "Shared with headquarters"}</em>}
        <time dateTime={c.at}>{fmtAgo(c.at, lang)}</time>
      </div>
      <p className="cmt-b">{segments(c.body, source.people.concat(source.me)).map((s, i) => (s.mention ? <span key={i} className="cmt-at">{s.text}</span> : <span key={i}>{s.text}</span>))}</p>
      {c.askedOdelia && <p className="cmt-o"><I.spark />{zh ? "Odelia 已开始处理" : "Odelia started on it"}</p>}
      <div className="cmt-a">
        <button type="button" className="lnk" disabled={busy} onClick={() => void toggle()}>{c.resolvedAt ? (zh ? "重新打开" : "Reopen") : (zh ? "标为已解决" : "Resolve")}</button>
      </div>
    </li>
  );
}

type Suggestion = { key: string; label: string; sub: string; insert: string };
function NewComment({ source, autoFocus }: { source: ThreadSource; autoFocus?: boolean }) {
  const { lang } = source;
  const zh = lang === "zh";
  const [text, setText] = useState("");
  const [share, setShare] = useState(false);
  const [sending, setSending] = useState(false);
  const [at, setAt] = useState<{ start: number; query: string } | null>(null);
  const [pick, setPick] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) box.current?.focus(); }, [autoFocus]);
  const sugg = useMemo<Suggestion[]>(() => {
    if (!at) return [];
    const q = at.query.toLowerCase();
    const all: Suggestion[] = [
      ...(source.canOdelia ? [{ key: "odelia", label: ODELIA, sub: zh ? "让她处理这项" : "Start her on this", insert: ODELIA }] : []),
      ...source.people.map(p => ({ key: p.id, label: p.role === "hq" ? (zh ? "总部" : "Headquarters") : shortName(p), sub: p.role === "hq" ? p.email : p.email, insert: handleOf(p) })),
    ];
    return all.filter(s => !q || s.label.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q) || s.insert.toLowerCase().startsWith(q)).slice(0, 6);
  }, [at, source.people, source.canOdelia, zh]);
  // mentioning headquarters shares the comment with it
  const hqMentioned = source.canShare && source.people.some(p => p.role === "hq" && text.toLowerCase().includes("@" + p.email.toLowerCase()));
  const shared = source.canShare && (share || hqMentioned);
  const onChange = (v: string, caret: number) => { setText(v); setAt(typing(v, caret)); setPick(0); };
  const choose = (s: Suggestion) => {
    if (!at) return;
    const caret = box.current?.selectionStart ?? text.length;
    const next = text.slice(0, at.start) + "@" + s.insert + " " + text.slice(caret);
    setText(next); setAt(null);
    requestAnimationFrame(() => { const p = at.start + s.insert.length + 2; box.current?.focus(); box.current?.setSelectionRange(p, p); });
  };
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try { if (await source.post(text, shared)) { setText(""); setShare(false); } } finally { setSending(false); }
  };
  const keys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugg.length && at) {
      if (e.key === "ArrowDown") { e.preventDefault(); setPick(p => (p + 1) % sugg.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setPick(p => (p - 1 + sugg.length) % sugg.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(sugg[pick]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setAt(null); return; }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
  };
  const odelia = source.canOdelia && ODELIA_AT.test(text);
  return (
    <div className="cmt-new">
      <div className="cmt-box">
        <textarea ref={box} rows={2} value={text} maxLength={4000} aria-label={zh ? "添加评论" : "Add a comment"}
          placeholder={source.me.role !== "hq" ? (zh ? "添加评论，输入 @ 提到同事" : "Add a comment. Type @ to mention someone") : (zh ? "给加盟商留言" : "Add a comment for the franchisee")}
          onChange={e => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)} onKeyDown={keys}
          onClick={e => setAt(typing(text, (e.target as HTMLTextAreaElement).selectionStart ?? text.length))} />
        {sugg.length > 0 && (
          <div className="menu cmt-sug" role="listbox" aria-label={zh ? "提到" : "Mention"}>
            {sugg.map((s, i) => (
              <button key={s.key} type="button" role="option" aria-selected={i === pick} className={i === pick ? "on" : ""} onMouseDown={e => { e.preventDefault(); choose(s); }}>
                <span className="menu-l"><b>{s.label}</b><small>{s.sub}</small></span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="cmt-row">
        {source.canShare && (
          <label className="cmt-share">
            <input type="checkbox" checked={shared} disabled={hqMentioned} onChange={e => setShare(e.target.checked)} />
            <span>{zh ? "与总部共享" : "Share with headquarters"}</span>
          </label>
        )}
        {odelia && <span className="cmt-hint"><I.spark />{zh ? "发布后 Odelia 会开始处理" : "Odelia starts on it when you post"}</span>}
        <button type="button" className="sbtn ink" disabled={!text.trim() || sending} onClick={() => void send()}>{zh ? "发表评论" : "Comment"}</button>
      </div>
    </div>
  );
}

/* ---------------------------- comments on a document or a job ---------------------------- */

/** The comment count on a document or job, opening its thread. */
export function CommentsButton({ item, title, label }: { item: ItemRef; title: Bi; label?: boolean }) {
  const team = useTeam();
  const { lang, b } = useApp();
  const [open, setOpen] = useState(false);
  const n = team.openCount(item), zh = lang === "zh";
  const say = n ? (zh ? `${n} 条评论` : `${n} comment${n === 1 ? "" : "s"}`) : (zh ? "评论" : "Comment");
  return (
    <>
      <button type="button" className={"cmt-btn" + (n ? " has" : "") + (label ? " lbl" : "")} onClick={() => setOpen(true)} aria-label={`${say}: ${b(title)}`} title={say}>
        <I.message />{label ? <span>{say}</span> : n ? <span>{n}</span> : null}
      </button>
      {open && <CommentsModal item={item} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
export function CommentsModal({ item, title, onClose }: { item: ItemRef; title: Bi; onClose: () => void }) {
  const { b, lang, t } = useApp();
  const source = useItemThread(item, title);
  const what = item.kind === "doc" ? B("Document", "文件") : item.kind === "job" ? B("Job", "工作") : B("Permit", "许可");
  return (
    <Modal label={(lang === "zh" ? "评论：" : "Comments: ") + b(title)} onClose={onClose}>
      <header className="m-h">
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
        <p className="cmt-kind">{b(what)}</p>
        <h2 className="cmt-title">{b(title)}</h2>
      </header>
      <div className="m-body"><CommentThread source={source} autoFocus /></div>
    </Modal>
  );
}

/* ---------------------------- assigned to ---------------------------- */

/** "Assigned to": who on the team has an application or a job. Anyone on the team can change it; it's in the audit
 *  trail and the person assigned is told. */
export function AssignPicker({ item, title, compact }: { item: ItemRef; title: Bi; compact?: boolean }) {
  const team = useTeam();
  const { lang } = useApp();
  const zh = lang === "zh";
  const who = team.assigneeOf(item);
  const members = team.people.filter(p => p.role !== "hq");
  const name = (p: Person) => (p.you ? (zh ? `${shortName(p)}（您）` : `${shortName(p)} (you)`) : shortName(p));
  return (
    <Menu kind="listbox" className="asg" buttonClass={"asg-b" + (who ? " set" : "") + (compact ? " sm" : "")} label={zh ? "分配给" : "Assigned to"}
      buttonLabel={who ? (zh ? `分配给 ${shortName(who)}，点击更改` : `Assigned to ${shortName(who)}. Change`) : (zh ? "分配给某人" : "Assign to someone")}
      button={<><I.user /><span>{who ? (compact ? shortName(who) : zh ? `分配给 ${shortName(who)}` : `Assigned to ${shortName(who)}`) : (zh ? "分配" : "Assign")}</span><I.chev /></>}
      items={[
        ...members.map(p => ({ key: p.id, label: name(p), picked: who?.id === p.id, onPick: () => void team.assign(item, p.id, title) })),
        { key: "none", label: zh ? "不分配" : "Nobody", picked: !who, onPick: () => void team.assign(item, null, title) },
      ]} />
  );
}

/** Two letters for whoever has an item, for tight places like the review table. */
export function AssigneeMark({ item }: { item: ItemRef }) {
  const team = useTeam();
  const who = team.assigneeOf(item);
  if (!who) return null;
  return <span className="asg-i" title={shortName(who)}>{initials(who)}</span>;
}

/** The Mine filter: everything, or only what's assigned to you. Home and Permits share it. */
export function MineToggle({ count }: { count: number }) {
  const team = useTeam();
  const { lang } = useApp();
  const zh = lang === "zh";
  return (
    <div className="seg sm mine" role="group" aria-label={zh ? "显示" : "Show"}>
      <button type="button" aria-pressed={!team.mine} onClick={() => team.setMine(false)}>{zh ? "全部" : "Everything"}</button>
      <button type="button" aria-pressed={team.mine} onClick={() => team.setMine(true)}>{zh ? "分配给我" : "Mine"}<span>{count}</span></button>
    </div>
  );
}

/** How many applications and jobs are assigned to this person, among those given. */
export function mineCount(team: Collab, items: ItemRef[]) { return items.filter(team.isMine).length; }
export { itemKey };
