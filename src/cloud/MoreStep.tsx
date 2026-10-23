import { useRef, useState } from "react";
import { B, type Bi } from "../model";
import type { Lang } from "../i18n";
import { I } from "../ui";
import { merge, readPasted, type Read } from "../intakeParse";

/* Onboarding's last screen: the details that fill the first application, without a form to type.
   Copied from what works:
     Stripe Atlas and Mercury: prefill from what you already have. Paste anything (an email signature, the website, the
       EIN letter's text) or drop a document (articles of organization, the IRS CP 575 letter, a lease, a business
       license): a PDF is read right here, and every file goes to Documents once the workspace exists, for Odelia to
       read with its quotes (review_documents).
     One question at a time (Typeform, Duolingo), with progress ("2 of 3"): a value found shows as a chip to confirm with
       one tap, not an empty box; "Find it for me" leaves it to Odelia, who looks it up from public records and connected
       apps; "Skip" moves on. Nothing here is required, and every answer saves as it's given (the onboarding draft). */

type More = { legal: string; notFormed: boolean; owner: string; address: string };
type Key = "legal" | "owner" | "address";
const Q: Record<Key, { q: Bi; hint: Bi; ph: string; auto: string; id: string }> = {
  legal: { q: B("What's the company's legal name?", "公司的法定名称是什么？"), hint: B("As the state has it, with LLC or Inc.", "与州政府登记的一致，包括 LLC 或 Inc。"), ph: "Lucky Leaf Tea LLC", auto: "organization", id: "onb-legal" },
  owner: { q: B("Who owns it?", "所有人是谁？"), hint: B("Full name as on their ID.", "与证件一致的全名。"), ph: "Mei Chen", auto: "name", id: "onb-owner" },
  address: { q: B("Where is the store?", "门店地址在哪里？"), hint: B("Street, city, state and ZIP code.", "街道、城市、州和邮编。"), ph: "", auto: "street-address", id: "onb-address" },
};

export function MoreStep({ lang, more, setMore, found, setFound, files, setFiles, busy, err, email, placeholder, onBack, onSkip, onDone }: {
  lang: Lang; more: More; setMore: (m: More) => void; found: Read; setFound: (r: Read) => void; files: File[]; setFiles: (f: File[]) => void;
  busy: boolean; err: string; email: string; placeholder: string; onBack: () => void; onSkip: () => void; onDone: () => void;
}) {
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const keys: Key[] = more.notFormed ? ["owner", "address"] : ["legal", "owner", "address"];
  const [i, setI] = useState(0);
  const [left, setLeft] = useState<Partial<Record<Key, "find" | "skip">>>({});
  const [editing, setEditing] = useState(false);
  const [paste, setPaste] = useState("");
  const [reading, setReading] = useState("");
  const pick = useRef<HTMLInputElement>(null);
  const k = keys[Math.min(i, keys.length - 1)];
  const value = more[k];
  // a value read from a paste or a document, not yet typed in: offered as a chip
  const offer = !value && found[k]?.value ? found[k]!.value : "";
  /** What was read, into the answers that are still empty (nothing typed is ever overwritten). */
  const take = (r: Read) => {
    const all = merge(found, r);
    setFound(all);
    setMore({ ...more, legal: more.legal || (more.notFormed ? "" : all.legal?.value ?? ""), owner: more.owner || all.owner?.value || "", address: more.address || all.address?.value || "" });
    const n = (["legal", "owner", "address", "ein", "website", "phone"] as const).filter(x => r[x]).length;
    setReading(n ? (zh ? `读到 ${n} 项，请逐一确认。` : `Found ${n}. Confirm each below.`) : (zh ? "没读到可用的信息。可以直接回答下面的问题。" : "Nothing to use in that. Answer below instead."));
  };
  const drop = async (fs: File[]) => {
    if (!fs.length) return;
    setFiles([...files, ...fs]);
    setReading(zh ? "正在读取…" : "Reading…");
    let r: Read = {};
    for (const f of fs) {
      if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) {
        try { const { pdfText } = await import("../forms/render"); r = merge(r, readPasted(await pdfText(new Uint8Array(await f.arrayBuffer())))); } catch { /* a scan with no words: Odelia reads it later */ }
      } else if (/^text\//.test(f.type)) r = merge(r, readPasted(await f.text()));
    }
    take(r);
    if (!Object.keys(r).length) setReading(zh ? `已保存 ${fs.length} 份文件。工作区建好后 Odelia 会读取它们。` : `Saved ${fs.length} file${fs.length === 1 ? "" : "s"}. Odelia reads ${fs.length === 1 ? "it" : "them"} once your workspace opens.`);
  };
  const next = (how?: "find" | "skip") => {
    setLeft(l => { const n = { ...l }; if (how) n[k] = how; else delete n[k]; return n; });
    setEditing(false);
    if (i + 1 < keys.length) setI(i + 1); else onDone();
  };
  const filled = keys.filter(x => more[x].trim() || left[x]).length;
  return (
    <div className="gate-card wide onb-more">
      <p className="gate-sub onb-count">{zh ? `第 ${Math.min(i, keys.length - 1) + 1} 题，共 ${keys.length} 题` : `${Math.min(i, keys.length - 1) + 1} of ${keys.length}`}</p>
      <div className="onb-bar" aria-hidden="true"><i style={{ width: `${(filled / keys.length) * 100}%` }} /></div>

      <div className="onb-import">
        <p>{zh ? "有现成的资料？粘贴或拖进来，Odelia 帮您填。" : "Have it somewhere? Paste or drop it and Odelia fills this in."}</p>
        <div className="onb-paste">
          <textarea id="onb-paste" rows={2} value={paste} onChange={e => setPaste(e.target.value)} placeholder={zh ? "粘贴邮件签名、网站或 EIN 函内容" : "Paste an email signature, website or EIN letter"} aria-label={zh ? "粘贴资料" : "Paste anything"} />
          <div className="onb-paste-act">
            <button type="button" className="sbtn line" disabled={!paste.trim()} onClick={() => { take(readPasted(paste)); setPaste(""); }}>{zh ? "读取" : "Read it"}</button>
            <button type="button" className="sbtn quiet" onClick={() => pick.current?.click()}><I.upload />{zh ? "上传文件" : "Add a file"}</button>
            <input ref={pick} type="file" hidden multiple accept="application/pdf,image/*,text/plain" onChange={e => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; void drop(fs); }} />
          </div>
        </div>
        <small className="onb-hint">{zh ? "公司章程、EIN 函（CP 575）、租约或营业执照都可以。" : "Articles of organization, the IRS EIN letter (CP 575), a lease or a business license."}</small>
        {(reading || files.length > 0) && <p className="onb-read" aria-live="polite">{reading && <span>{reading}</span>}{files.map(f => <span key={f.name}><I.check />{f.name}</span>)}</p>}
      </div>

      <form className="onb" onSubmit={e => { e.preventDefault(); next(); }}>
        <div className="q onb-one">
          <h1 id="onb-one-q">{L(Q[k].q)}</h1>
          {value && !editing ? (
            <div className="onb-confirm">
              <button type="button" role="checkbox" aria-checked="true" className="chip on" onClick={() => setEditing(true)} aria-label={zh ? `已填：${value}，点按修改` : `${value}, tap to change`}><I.check />{value}</button>
              {found[k]?.value === value && <small className="onb-hint">{zh ? `来自：“${found[k]!.quote}”` : `From: "${found[k]!.quote}"`}</small>}
            </div>
          ) : offer && !editing ? (
            <div className="onb-confirm">
              <button type="button" className="chip" onClick={() => setMore({ ...more, [k]: offer })}><I.plus />{offer}</button>
              <small className="onb-hint">{zh ? `来自：“${found[k]!.quote}”` : `From: "${found[k]!.quote}"`}</small>
            </div>
          ) : (
            <div className="onb-pair">
              <input id={Q[k].id} aria-labelledby="onb-one-q" value={value} onChange={e => setMore({ ...more, [k]: e.target.value })} placeholder={Q[k].ph || placeholder} autoComplete={Q[k].auto} autoFocus />
              {k === "legal" && <button type="button" role="checkbox" aria-checked={more.notFormed} className="chip" onClick={() => { setMore({ ...more, notFormed: !more.notFormed, legal: "" }); setI(0); }}>{zh ? "还没注册公司" : "Not formed yet"}</button>}
            </div>
          )}
          <small className="onb-hint">{L(Q[k].hint)}</small>
        </div>
        <div className="onb-act onb-act3">
          <button type="button" className="sbtn quiet" disabled={busy} onClick={() => (i > 0 ? (setI(i - 1), setEditing(false)) : onBack())}>{zh ? "返回" : "Back"}</button>
          <button type="button" className="sbtn line" disabled={busy} onClick={() => next("find")}>{zh ? "帮我找" : "Find it for me"}</button>
          <button type="button" className="sbtn line onb-skip" disabled={busy} onClick={() => next("skip")}>{zh ? "跳过" : "Skip"}</button>
          <button type="submit" className="sbtn ink big" disabled={busy}>{busy ? "…" : i + 1 < keys.length ? (zh ? "下一题" : "Next") : (zh ? "填好申请" : "Fill my application")}</button>
        </div>
        <button type="button" className="lnk more onb-skipall" disabled={busy} onClick={onSkip}>{zh ? "全部跳过，先看计划" : "Skip all, show my plan"}</button>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
      <p className="onb-who">{zh ? `已登录 ${email}` : `Signed in as ${email}`}</p>
    </div>
  );
}
