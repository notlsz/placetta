import { useEffect, useMemo, useRef, useState } from "react";
import { useApp, type View } from "./ctx";
import { allSkills } from "./skills";
import { hasReplay } from "./replay";
import { I } from "./ui";

/* ⌘K (Ctrl+K): jump to anything in the workspace, or hand Odelia a job, from anywhere, without the mouse. Type to
   filter stores, applications, deadlines, documents, jobs, playbooks and pages; Enter on anything else asks Odelia. */

type Hit = { id: string; group: string; label: string; sub?: string; run: () => void };

/* Every place in the app, old names included so "applications" or "audit" still finds the page. */
const PAGES: { v: View; sub?: string; en: string; zh: string; also?: string }[] = [
  { v: "overview", en: "Home", zh: "首页", also: "overview 概览" },
  { v: "permits", en: "Permits", zh: "许可", also: "applications 申请 to do" }, { v: "permits", sub: "filed", en: "Permits: Filed", zh: "许可：已提交" },
  { v: "permits", sub: "documents", en: "Documents", zh: "文件" }, { v: "permits", sub: "deadlines", en: "Deadlines", zh: "截止日期" },
  { v: "find", en: "Find licenses", zh: "查找许可" }, { v: "stores", en: "Stores", zh: "门店" },
  { v: "odelia", en: "Odelia: Chat", zh: "Odelia：对话", also: "ask chat" }, { v: "odelia", sub: "work", en: "Work", zh: "工作" },
  { v: "odelia", sub: "playbooks", en: "Playbooks", zh: "手册" }, { v: "odelia", sub: "updates", en: "Updates", zh: "动态", also: "inbox" },
  { v: "settings", en: "Settings", zh: "设置" }, { v: "settings", sub: "activity", en: "Settings: Activity", zh: "设置：活动记录", also: "audit trail 审计记录 history" },
  { v: "settings", sub: "facts", en: "Settings: Business facts", zh: "设置：企业资料", also: "context 资料" },
];

export function CommandBar({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { b, lang, ws, go, ask, openApp, openReplay } = useApp();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const zh = lang === "zh";

  useEffect(() => { if (open) { setQ(""); setAt(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    // every word typed appears somewhere in the item ("renew sign" finds the sign permit's renewal)
    const words = s.split(/\s+/).filter(w => w.length > 1 && !["the", "a", "an", "my", "our", "for", "of", "to", "and", "please"].includes(w));
    const has = (...xs: (string | undefined)[]) => { if (!s) return true; const hay = xs.map(x => (x ?? "").toLowerCase()).join(" "); return hay.includes(s) || (words.length > 0 && words.filter(w => hay.includes(w)).length >= Math.max(1, Math.ceil(words.length * 0.6))); };
    const close = (f: () => void) => () => { setOpen(false); f(); };
    const g = (en: string, zhs: string) => (zh ? zhs : en);
    const out: Hit[] = [];
    const askHit: Hit | null = s ? { id: "ask", group: g("Ask Odelia", "问 Odelia"), label: q.trim(), sub: g("Hand her this as a job", "交给她去做"), run: close(() => ask(q.trim())) } : null;
    // A sentence is a job for Odelia; a word or two is more likely a search, so the matches come first.
    const sentence = q.trim().split(/\s+/).length >= 3 || /[\u3400-\u9fff]{4,}/.test(q);
    if (askHit && sentence) out.push(askHit);
    const take = <T,>(list: T[], n: number, f: (x: T) => Hit | null) => { let k = 0; for (const x of list) { if (k >= n) break; const h = f(x); if (h) { out.push(h); k++; } } };
    take(ws.apps, 6, a => has(a.name.en, a.name.zh, a.agency.en, a.agency.zh) ? { id: "a-" + a.id, group: g("Permits", "许可"), label: b(a.name), sub: b(a.agency), run: close(() => openApp(a.id)) } : null);
    take(ws.stores ?? [], 4, st => has(st.name.en, st.name.zh, st.address) ? { id: "s-" + st.id, group: g("Stores", "门店"), label: b(st.name), sub: st.address, run: close(() => go("stores")) } : null);
    take(ws.jobs ?? [], 4, j => has(j.title.en, j.title.zh) ? { id: "j-" + j.id, group: g("Work", "工作"), label: b(j.title), sub: j.status === "waiting" ? g("Needs you", "需要您") : j.status === "done" ? g("Done", "已完成") : j.status === "queued" ? g("Waiting its turn", "排队中") : g("In progress", "进行中"), run: close(() => go("odelia", "work")) } : null);
    take(allSkills(ws).filter(x => x.on && x.kind !== "form"), 4, p => has(p.name.en, p.name.zh, p.description.en) ? { id: "p-" + p.id, group: g("Playbooks", "手册"), label: b(p.name), sub: g("Run it", "运行"), run: close(() => ask(zh ? `按手册“${p.name.zh}”（${p.id}）来做。` : `Run the playbook "${p.name.en}" (${p.id}).`)) } : null);
    /* What the Odelia panel keeps behind the "…" on her latest answer, and what left the message box (src/AgentPanel.tsx,
       src/Composer.tsx): typed for, never in the empty list. The panel opens first when it isn't (her page, Chat). */
    if (s) {
      const toPanel = (what: string) => close(() => {
        const fire = () => dispatchEvent(new CustomEvent("placetta:odelia", { detail: what }));
        if (document.querySelector("aside.panel")) fire(); else { go("odelia"); setTimeout(fire, 120); }
      });
      const toBox = (what: string) => close(() => dispatchEvent(new CustomEvent("placetta:composer", { detail: what })));
      const watched = (ws.jobs ?? []).filter(j => hasReplay(ws, j)).sort((x, y) => y.updated.localeCompare(x.updated))[0];
      const acts: { id: string; en: string; zh: string; also: string; run: () => void; sub?: string }[] = [
        { id: "person", en: "Ask a person", zh: "找真人", also: "help human team support 帮助 人工 团队", sub: g("A person on the Placetta team replies in Updates", "快哉团队的工作人员会在动态中回复"), run: toPanel("ask-person") },
        ...((ws.undo ?? []).some(u => !u.done) ? [{ id: "undo", en: "Undo what she did", zh: "撤销她这次的操作", also: "undo revert put back 撤销 恢复", sub: g("Her latest run that changed something", "她最近一次做了更改的操作"), run: toPanel("undo") }] : []),
        ...(watched ? [{ id: "watch", en: "Watch how she did it", zh: "看她是怎么做的", also: "replay watch 回放", sub: b(watched.title), run: close(() => openReplay(watched.id)) }] : []),
        { id: "listen", en: "Listen to her answer", zh: "朗读她的回答", also: "listen read aloud speak voice 朗读 听", run: toPanel("listen") },
        { id: "steps", en: "Show her steps", zh: "查看她的步骤", also: "steps what she did 步骤", run: toPanel("steps") },
        { id: "sources", en: "Sources for her answer", zh: "她回答的来源", also: "sources citations links 来源 出处", run: toPanel("sources") },
        { id: "plan", en: "Plan first", zh: "先做计划", also: "plan approve first 计划", sub: g("She writes the plan for your next request and waits for your approval", "下一项请求她先写计划，等您批准"), run: toBox("plan-first") },
        { id: "upload", en: "Upload a file", zh: "上传文件", also: "upload attach file document lease 上传 附件 文件 租约", run: toBox("attach") },
      ];
      take(acts, 4, x => has(x.en, x.zh, x.also) ? { id: "o-" + x.id, group: "Odelia", label: zh ? x.zh : x.en, sub: x.sub, run: x.run } : null);
    }
    take([...ws.deadlines].sort((a, b) => a.date.localeCompare(b.date)), 4, d => has(d.title.en, d.title.zh) ? { id: "d-" + d.id, group: g("Deadlines", "截止日期"), label: b(d.title), sub: d.date, run: close(() => go("permits", "deadlines")) } : null);
    take(ws.docs, 4, d => has(d.name) && s ? { id: "f-" + d.id, group: g("Documents", "文件"), label: d.name, run: close(() => go("permits", "documents")) } : null);
    take(PAGES, s ? 4 : 14, p => has(p.en, p.zh, p.also) ? { id: "v-" + p.v + (p.sub ? "-" + p.sub : ""), group: g("Go to", "前往"), label: zh ? p.zh : p.en, run: close(() => go(p.v, p.sub)) } : null);
    if (askHit && !sentence) out.push(askHit);
    // A page named exactly what was typed ("deadlines", "work", an old name like "applications") is where they meant to
    // go: it comes first, so Enter opens it instead of running a playbook that only mentions the word.
    const named = (p: (typeof PAGES)[number]) => [p.en, p.zh, ...(p.also ?? "").split(" ")].some(n => { const x = n.toLowerCase(); return !!x && (x === s || x.split(/[:：]\s*/).pop() === s); });
    // The same for anything else named exactly what was typed ("先做计划", "Plan first"): a Chinese name of four
    // characters would otherwise read as a sentence and go to Odelia as a job.
    const lead = out.filter(h => h.id !== "ask" && (h.label.toLowerCase() === s || PAGES.some(p => named(p) && h.id === "v-" + p.v + (p.sub ? "-" + p.sub : ""))));
    // (the rest of its own group follows it, so each group keeps one heading)
    if (lead.length) { const same = out.filter(h => !lead.includes(h) && h.group === lead[0].group); return [...lead, ...same, ...out.filter(h => !lead.includes(h) && !same.includes(h))]; }
    return out;
  }, [q, ws, zh, b, ask, go, openApp, openReplay, setOpen]);

  if (!open) return null;
  const pick = (i: number) => hits[i]?.run();
  let last = "";
  return (
    <div className="cmdk-back" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label={zh ? "搜索或提问" : "Search or ask"}>
        <div className="cmdk-in">
          <I.find />
          <input ref={input} autoFocus value={q} onChange={e => { setQ(e.target.value); setAt(0); }} placeholder={zh ? "搜索门店、许可、文件……或直接交给 Odelia" : "Search stores, permits, documents… or hand Odelia a job"}
            role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-activedescendant={hits[at] ? "cmdk-" + hits[at].id : undefined}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setAt(i => Math.min(hits.length - 1, i + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt(i => Math.max(0, i - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(at); }
              else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
            }} />
          <kbd>esc</kbd>
        </div>
        <ul id="cmdk-list" className="cmdk-list" role="listbox">
          {hits.map((h, i) => {
            const head = h.group !== last ? h.group : null; last = h.group;
            return (
              <li key={h.id} role="presentation">
                {head && <span className="cmdk-g">{head}</span>}
                <button type="button" id={"cmdk-" + h.id} role="option" aria-selected={i === at} className={i === at ? "on" : ""} onMouseEnter={() => setAt(i)} onClick={() => pick(i)}>
                  {h.id === "ask" ? <I.spark /> : null}<b>{h.label}</b>{h.sub ? <small>{h.sub}</small> : null}{i === at ? <I.arrow /> : null}
                </button>
              </li>
            );
          })}
          {!hits.length && <li className="cmdk-none">{zh ? "没有结果" : "Nothing found"}</li>}
        </ul>
      </div>
    </div>
  );
}

/** ⌘K or Ctrl+K anywhere opens it (not while typing in a field, except the composer, where it still works). */
export function useCommandKey(setOpen: (f: (v: boolean) => boolean) => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(v => !v); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setOpen]);
}
