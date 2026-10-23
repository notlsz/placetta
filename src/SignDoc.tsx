import { useState } from "react";
import { useApp } from "./ctx";
import type { Doc } from "./model";
import { B } from "./model";
import { SetSheet } from "./SetUI";
import * as api from "./cloud/api";

/* Send a document from Documents for signature with the business's own Dropbox Sign account (Settings, Signatures):
   for the papers a filing needs from someone else's hand, like the landlord's authorization letter. Only an owner sees
   it, and the owner's Send is the approval; the server checks the signers again and puts every send in the audit log.
   The last request's id is remembered in this browser so "Check" can say who has signed. */

const MAX = 5;
const key = (d: Doc) => `placetta.sign.${d.id}`;
const remembered = (d: Doc): string | null => { try { return localStorage.getItem(key(d)); } catch { return null; } };
const remember = (d: Doc, id: string) => { try { localStorage.setItem(key(d), id); } catch { /* private window: Check just isn't offered */ } };

const STATUS: Record<string, { en: string; zh: string }> = {
  awaiting_signature: B("waiting to sign", "待签署"), signed: B("signed", "已签署"), declined: B("declined", "已拒签"),
  on_hold: B("on hold", "暂停"), error_unknown: B("an error at Dropbox Sign", "Dropbox Sign 出错"),
};

export function SignButton({ d }: { d: Doc }) {
  const { b, lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(d.name.replace(/\.[a-z0-9]{2,4}$/i, ""));
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState([{ name: "", email: "" }]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(() => remembered(d));
  if (!cloud || !cloud.owner || !d.path || !cloud.integrations.some(i => i.kind === "dropbox_sign" && i.status === "connected")) return null;
  const fail = (e: unknown) => { const x = e as api.ApiError; say((zh && x.message_zh) || x.message); };
  const line = (r: api.SignRequest) => r.signers.map(s => `${s.email}: ${b(STATUS[s.status] ?? B(s.status, s.status))}`).join(zh ? "；" : "; ");
  const send = async () => {
    setBusy(true);
    try {
      const r = await api.esignSend(cloud.wsId, { path: d.path!, title: title.trim(), message: message.trim() || undefined, signers: signers.map(s => ({ name: s.name.trim(), email: s.email.trim() })) });
      remember(d, r.request.id); setLast(r.request.id); setOpen(false);
      say(zh ? `已发出签署：${line(r.request)}${r.test_mode ? "（测试模式）" : ""}` : `Sent for signature: ${line(r.request)}${r.test_mode ? " (test mode)" : ""}`);
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const check = async () => {
    try { const r = await api.esignStatus(cloud.wsId, last!); say(r.request.complete ? (zh ? "所有人都已签署。签好的文件在 Dropbox Sign 中。" : "Everyone has signed. The signed copy is in Dropbox Sign.") : line(r.request)); }
    catch (e) { fail(e); }
  };
  const set = (i: number, k: "name" | "email", v: string) => setSigners(list => list.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  return (
    <>
      <button type="button" className="sbtn quiet" onClick={() => setOpen(true)}>{zh ? "发出签署" : "Send to sign"}</button>
      {last && <button type="button" className="sbtn quiet" onClick={() => void check()}>{zh ? "查看签署" : "Check signing"}</button>}
      {open && (
        <SetSheet title={zh ? "通过 Dropbox Sign 发出签署" : "Send for signature with Dropbox Sign"} sub={d.name} onClose={() => setOpen(false)}>
          <p>{zh ? "从您自己的 Dropbox Sign 账户发出。签署人会收到 Dropbox Sign 的邮件。点“发送”即表示您批准发送。" : "It goes from your own Dropbox Sign account, and each signer gets Dropbox Sign's email. Pressing Send is your approval."}</p>
          <form className="sst-form" onSubmit={e => { e.preventDefault(); void send(); }}>
            <input required value={title} onChange={e => setTitle(e.target.value)} maxLength={200} aria-label={zh ? "标题" : "Title"} placeholder={zh ? "标题" : "Title"} />
            {signers.map((s, i) => (
              <div key={i} className="sst-pair">
                <input required value={s.name} onChange={e => set(i, "name", e.target.value)} maxLength={120} placeholder={zh ? "签署人姓名" : "Signer's name"} aria-label={zh ? `第 ${i + 1} 位签署人姓名` : `Signer ${i + 1} name`} autoComplete="off" />
                <input required type="email" value={s.email} onChange={e => set(i, "email", e.target.value)} placeholder={zh ? "签署人邮箱" : "Signer's email"} aria-label={zh ? `第 ${i + 1} 位签署人邮箱` : `Signer ${i + 1} email`} autoComplete="off" />
              </div>
            ))}
            {signers.length < MAX && <button type="button" className="lnk" onClick={() => setSigners(l => [...l, { name: "", email: "" }])}>{zh ? "再加一位签署人" : "Add a signer"}</button>}
            <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={2000} rows={3} placeholder={zh ? "给签署人的话（可选）" : "A note to the signers (optional)"} aria-label={zh ? "给签署人的话" : "Note to signers"} />
            <div className="sst-act"><button type="submit" className="sbtn ink" disabled={busy}>{busy ? (zh ? "正在发送…" : "Sending...") : (zh ? "发送" : "Send")}</button></div>
          </form>
        </SetSheet>
      )}
    </>
  );
}
