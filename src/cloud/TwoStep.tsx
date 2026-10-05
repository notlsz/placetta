import { useEffect, useState } from "react";
import { B, type Bi } from "../model";
import type { Lang } from "../i18n";
import * as api from "./api";

/* Two-step sign-in with an authenticator app (Google Authenticator, 1Password, Authy, Microsoft Authenticator).
   Setup shows a QR code and the key to type in; sign-in asks for the 6-digit code. */

const codeInput = (v: string) => v.replace(/\D/g, "").slice(0, 6);

export function TwoStepSetup({ lang, onDone, onCancel }: { lang: Lang; onDone: () => void; onCancel: () => void }) {
  const L = (x: Bi) => x[lang];
  const [f, setF] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { void api.twoStepEnroll().then(setF).catch(e => setErr((e as api.ApiError).message)); }, []);
  const verify = async () => {
    if (!f) return;
    setBusy(true); setErr("");
    try { await api.twoStepVerify(f.id, code); onDone(); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <div className="twostep">
      <ol className="ts-steps">
        <li>{L(B("Open your authenticator app (Google Authenticator, 1Password, Authy or Microsoft Authenticator) and scan this code.", "打开身份验证器应用（Google Authenticator、1Password、Authy 或 Microsoft Authenticator），扫描此二维码。"))}</li>
        <li>{L(B("Enter the 6-digit code it shows.", "输入应用显示的 6 位验证码。"))}</li>
      </ol>
      <div className="ts-qr">{f ? <img src={f.qr} alt={L(B("QR code for your authenticator app", "身份验证器二维码"))} width={168} height={168} /> : <span className="ts-wait" />}</div>
      {f && <p className="ts-key">{L(B("Can't scan? Type this key: ", "无法扫描？请输入密钥："))}<code>{f.secret.replace(/(.{4})/g, "$1 ").trim()}</code></p>}
      <form className="ts-form" onSubmit={e => { e.preventDefault(); void verify(); }}>
        <label className="sr" htmlFor="ts-code">{L(B("6-digit code", "6 位验证码"))}</label>
        <input id="ts-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(codeInput(e.target.value))} placeholder={L(B("6-digit code", "6 位验证码"))} />
        <button type="submit" className="sbtn ink" disabled={busy || !f || code.length < 6}>{busy ? "…" : L(B("Turn on", "开启"))}</button>
        <button type="button" className="sbtn quiet" onClick={onCancel}>{L(B("Cancel", "取消"))}</button>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
      {api.PREVIEW && <p className="gate-preview">{L(B("Preview: the code is 123456.", "预览：验证码是 123456。"))}</p>}
    </div>
  );
}

export function TwoStepCode({ lang, factorId, onDone, onSignOut }: { lang: Lang; factorId: string; onDone: () => void; onSignOut: () => void }) {
  const L = (x: Bi) => x[lang];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const verify = async () => {
    setBusy(true); setErr("");
    try { await api.twoStepVerify(factorId, code); onDone(); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); setCode(""); }
  };
  return (
    <div className="gate-card">
      <h1>{L(B("Two-step sign-in.", "两步登录。"))}</h1>
      <p className="gate-sub">{L(B("Enter the 6-digit code from your authenticator app.", "请输入身份验证器应用中的 6 位验证码。"))}</p>
      <form onSubmit={e => { e.preventDefault(); void verify(); }}>
        <label className="sr" htmlFor="ts-signin">{L(B("6-digit code", "6 位验证码"))}</label>
        <input id="ts-signin" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(codeInput(e.target.value))} placeholder={L(B("6-digit code", "6 位验证码"))} autoFocus />
        <button type="submit" className="sbtn ink wide" disabled={busy || code.length < 6}>{busy ? "…" : L(B("Continue", "继续"))}</button>
        <button type="button" className="sbtn quiet wide" onClick={onSignOut}>{L(B("Sign out", "退出登录"))}</button>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
      {api.PREVIEW && <p className="gate-preview">{L(B("Preview: the code is 123456.", "预览：验证码是 123456。"))}</p>}
      <p className="gate-note">{L(B("Lost your phone? Email support@placetta.com from this address and we'll verify it's you.", "手机丢失？请用此邮箱发信至 support@placetta.com，我们核实身份后为您处理。"))}</p>
    </div>
  );
}
