import { useRef, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import type { Application } from "./model";
import { I } from "./ui";

/* Everything Odelia still needs, in one list, answered in any order (Stripe Atlas's and Vanta's one checklist instead
   of a form per agency). Every row offers the hand-off first: "Find it for me" asks Odelia to get it herself, from the
   documents already uploaded, connected apps and public records, and to come back only if a person truly has to give
   it (a signature, an ID, a fact only they know). A document can be a photo or a PDF: one tap opens the camera or the
   files. Only what a person has to hand over is listed: the empty lines on a form are Odelia's to fill from the business
   facts and documents, so they never show up here as questions. Nothing here blocks moving on. */

type Row = { key: string; app: Application; label: Bi; id: string };

export const findItAsk = (label: Bi, app: Bi, many = false): Bi => B(
  `Find ${many ? "these" : "this"} for the ${app.en}: ${label.en}. Get ${many ? "them" : "it"} yourself from my documents, connected apps and public records, fill ${many ? "them" : "it"} in, and ask me only for what only I can give.`,
  `为${app.zh}找到${many ? "这些" : "这一项"}：${label.zh}。请您自己从我的文件、已连接的应用和公开记录中查找并填好，只有必须由我本人提供的才问我。`);

export function StillNeeded() {
  const { b, lang, ws, ask, busy, upload } = useApp();
  const [open, setOpen] = useState(false);
  const zh = lang === "zh";
  // an application with a card already in Needs you (an upload to approve, texts to staff she'll send) has its plan:
  // listing its items again would only add to what the person sees
  const planned = new Set(ws.approvals.map(a => a.app).filter(Boolean));
  // a message card names what it's about in its title ("Text 4 staff about food handler cards")
  const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 3);
  for (const ap of ws.approvals) for (const a of ws.apps) if (words(a.name.en).filter(w => words(ap.title.en).includes(w)).length >= 2) planned.add(a.id);
  const rows: Row[] = ws.apps.filter(a => !["approved", "review", "filing"].includes(a.status) && !a.preview && !planned.has(a.id))
    .flatMap(a => a.checklist.filter(c => c.state === "missing" && !c.dep).map(c => ({ key: `${a.id}:${c.id}`, app: a, label: c.label, id: c.id })));
  if (!rows.length) return null;
  const shown = open ? rows : rows.slice(0, 4);
  const all = B(rows.slice(0, 8).map(r => `${r.label.en} (${r.app.name.en})`).join("; "), rows.slice(0, 8).map(r => `${r.label.zh}（${r.app.name.zh}）`).join("；"));
  return (
    <section className="sec still" aria-label={zh ? "还需要的信息" : "Still needed"}>
      <div className="sec-h">
        <h2>{zh ? `还需要 ${rows.length} 项` : `${rows.length} thing${rows.length === 1 ? "" : "s"} still needed`}</h2>
        <button type="button" className="pill ink sm" disabled={busy} onClick={() => ask(b(findItAsk(all, B("open applications", "进行中的申请"), true)))}><I.spark />{zh ? "全部交给 Odelia 找" : "Have Odelia find them all"}</button>
      </div>
      <p className="still-sub">{zh ? "任意顺序都行，传了就自动存好。手上没有的，点“帮我找”。" : "Any order. Each one saves as it comes in. Don't have it? Tap Find it for me."}</p>
      <ul className="still-list">{shown.map(r => <NeedRow key={r.key} r={r} busy={busy} onFind={() => ask(b(findItAsk(r.label, r.app.name)))} onUpload={f => upload(r.app.id, r.id, f)} />)}</ul>
      {rows.length > 4 && <button type="button" className="lnk more" onClick={() => setOpen(!open)}>{open ? (zh ? "收起" : "Show fewer") : (zh ? `再看 ${rows.length - 4} 项` : `Show ${rows.length - 4} more`)}</button>}
    </section>
  );
}

function NeedRow({ r, busy, onFind, onUpload }: { r: Row; busy: boolean; onFind: () => void; onUpload: (f: File[]) => void }) {
  const { b, lang } = useApp();
  const pick = useRef<HTMLInputElement>(null);
  const zh = lang === "zh";
  return (
    <li className="still-row">
      <div className="still-what"><b>{b(r.label)}</b><small>{b(r.app.name)}</small></div>
      <div className="still-act">
        <button type="button" className="pill sm" disabled={busy} onClick={() => pick.current?.click()}><I.upload />{zh ? "拍照或上传" : "Photo or file"}</button>
        <input ref={pick} type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onUpload(f); }} />
        <button type="button" className="pill quiet sm" disabled={busy} onClick={onFind}>{zh ? "帮我找" : "Find it for me"}</button>
      </div>
    </li>
  );
}
