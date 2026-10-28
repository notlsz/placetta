import { useState } from "react";
import { B, type Bi } from "../model";
import type { Lang } from "../i18n";
import { ageVerdict } from "../age";
import * as api from "./api";

/* Placetta is for people 18 or older (src/age.ts). At sign-up, and at the next sign-in of anyone who hasn't answered,
   the person gives their date of birth. It's checked here first: only an adult's date goes to the server, which checks
   it again and keeps only that they confirmed, and when. Under 18 no date is sent; the server deletes the account made
   at sign-in and nothing is kept. Under 13 nothing at all leaves the device. */

export function AgeGate({ lang, onDone, onRefused, onSignOut }: { lang: Lang; onDone: () => void; onRefused: () => void; onSignOut: () => void }) {
  const L = (x: Bi) => x[lang];
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    const v = ageVerdict(date);
    if (v === "invalid") { setErr(L(B("Enter your date of birth.", "请输入您的出生日期。"))); return; }
    setBusy(true); setErr("");
    try {
      if (v !== "adult") {
        // the date stays here; the server is told only to delete what sign-in made
        setDate("");
        await api.ageRefused().catch(() => undefined);
        onRefused();
        return;
      }
      const r = await api.confirmAge(date);
      setDate("");
      if (r.ok) onDone(); else onRefused();
    } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <div className="gate-card">
      <h1>{L(B("Your date of birth.", "您的出生日期。"))}</h1>
      <p className="gate-sub">{L(B("Placetta is for people 18 or older who act for a business. We check your date and keep only that you confirmed you are 18 or older, and when. We don't keep the date.", "快哉仅供年满 18 周岁、代表企业行事的人使用。我们核对您的出生日期，只保存您已确认年满 18 周岁这一事实及确认时间，不保存出生日期。"))}</p>
      <form onSubmit={e => { e.preventDefault(); void submit(); }}>
        <label className="sr" htmlFor="age-date">{L(B("Date of birth", "出生日期"))}</label>
        <input id="age-date" type="date" autoComplete="bday" value={date} max={new Date().toISOString().slice(0, 10)} min="1900-01-01" onChange={e => setDate(e.target.value)} autoFocus />
        <button type="submit" className="sbtn ink wide" disabled={busy || !date}>{busy ? "…" : L(B("Continue", "继续"))}</button>
        <button type="button" className="sbtn quiet wide" disabled={busy} onClick={onSignOut}>{L(B("Sign out", "退出登录"))}</button>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
    </div>
  );
}

/** After an under-18 answer: nothing was kept, and the session is signed out. */
export function AgeRefused({ lang, onBack }: { lang: Lang; onBack: () => void }) {
  const L = (x: Bi) => x[lang];
  return (
    <div className="gate-card">
      <h1>{L(B("Placetta is for adults.", "快哉仅供成年人使用。"))}</h1>
      <p className="gate-sub">{L(B("You need to be 18 or older to use Placetta, so we didn't open an account and kept nothing you entered. If you already belong to a business's workspace, ask its owner, or write to support@placetta.com to close your account.", "使用快哉须年满 18 周岁，因此我们没有开设账户，也没有保留您输入的任何内容。如您已加入某企业的工作区，请联系其所有者，或发邮件至 support@placetta.com 关闭您的账户。"))}</p>
      <button type="button" className="sbtn quiet wide" onClick={onBack}>{L(B("Back to sign in", "返回登录"))}</button>
    </div>
  );
}
