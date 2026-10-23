import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import App from "../App";
import { GateBot } from "../Bot";
import { LegalBody } from "../Legal";
import { LEGAL, UPDATED } from "../legal";
import { Logo } from "../Logo";
import { I, Menu, Select } from "../ui";
import { B, type Bi } from "../model";
import type { Lang } from "../i18n";
import * as api from "./api";
import { normalize, type CloudSession } from "./session";
import { consumeHandoff, readHandoff } from "./handoff";
import { TwoStepCode } from "./TwoStep";
import { HqHome } from "../Headquarters";
import { applyTheme, readTheme } from "../hooks";
import type { HqRow } from "../hq";
import { firstPlanClock } from "../plan/prefill";
import { CITIES, ownWords, parsePlace, readLine, SELLS, STATES } from "../plan/line";
import { firstWorkspace } from "../plan/start";
import { intakeQuestions, type Intake } from "../plan/intake";
import { phoneConsent } from "../consent";
import { captureStart, claimStart, clearStart, peekStart, pendingStart, type StartClaim, type StartPeek } from "./textStart";
// Partners and the store check (src/Partner.tsx, src/StoresCheck.tsx): the referral a new workspace came through, and
// the onboarding path for businesses that already run stores
import { captureRef, embedLine } from "../referral";
import { claimReferral, PartnerHome, ReferralConsent } from "../Partner";
import { existingWorkspace, StoresCheck } from "../StoresCheck";
import { KINDS as STORE_KINDS, toPlan, type StoreResult } from "../plan/existing";
import { partnerMe } from "./partnersApi";
import { captureMcpAuth, McpConsent, pendingMcpAuth } from "./McpConsent";

/* Signed-in Placetta: sign in with Google, Microsoft or an email code, then two-step sign-in if it's on.
   Invites to a teammate's workspace are accepted on sign-in. New businesses start with onboarding (and the filing
   authorization); the workspace, files and the audit trail live in the account. A business that texted Odelia to
   start opens the link from her reply: the plan she texted is claimed here after sign-in (ClaimStart). */

const readLang = (): Lang => { try { const v = localStorage.getItem("placetta-lang") ?? localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* blocked */ } return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en"; };
const lastWs = { get: () => { try { return localStorage.getItem("placetta-ws") ?? ""; } catch { return ""; } }, set: (v: string) => { try { localStorage.setItem("placetta-ws", v); } catch { /* blocked */ } } };

function Frame({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: React.ReactNode }) {
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  useEffect(() => {
    const on = (e: Event) => setDoc((e as CustomEvent<string>).detail);
    window.addEventListener("placetta:doc", on);
    return () => window.removeEventListener("placetta:doc", on);
  }, []);
  return (
    <div className="gate">
      <header className="gate-top">
        {api.PREVIEW ? <Logo lang={lang} height={18} /> : <a href="/" className="gate-home" aria-label="Placetta home"><Logo lang={lang} height={18} /></a>}
        <div className="lang" role="group" aria-label="Language">
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </header>
      <main className="gate-main">{children}</main>
      <footer className="gate-foot">
        {LEGAL.filter(x => x.id !== "ai").map(x => <button key={x.id} type="button" onClick={() => setDoc(x.id)}>{x.title[lang]}</button>)}
        <a href="mailto:support@placetta.com">support@placetta.com</a>
      </footer>
      {d && (
        <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setDoc(null); }}>
          <div className="modal wide" role="dialog" aria-modal="true" aria-label={d.title[lang]}>
            <header className="m-h"><h2>{d.title[lang]}</h2><button type="button" className="icbtn close" onClick={() => setDoc(null)} aria-label="Close">×</button></header>
            <div className="m-body legal"><LegalBody text={d.body[lang]} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
);
const MicrosoftMark = () => (
  <svg width="15" height="15" viewBox="0 0 23 23" aria-hidden="true"><path fill="#F35325" d="M1 1h10v10H1z"/><path fill="#81BC06" d="M12 1h10v10H12z"/><path fill="#05A6F0" d="M1 12h10v10H1z"/><path fill="#FFBA08" d="M12 12h10v10H12z"/></svg>
);

const HELP_URL = api.PREVIEW ? "https://placetta.com/help/#sign-in" : "/help/#sign-in";
const openDoc = (id: string) => window.dispatchEvent(new CustomEvent("placetta:doc", { detail: id }));

/** The clickwrap: an unchecked box that must be checked to go on, with links that open the documents right here.
 *  Checking it is the assent (Berman v. Freedom Financial; Meyer v. Uber); the app records it with the version. */
export function TermsCheck({ id, lang, checked, onChange, onDoc }: { id: string; lang: Lang; checked: boolean; onChange: (v: boolean) => void; onDoc: (doc: string) => void }) {
  const L = (x: Bi) => x[lang];
  const link = (doc: string, label: Bi) => <button type="button" className="lnk" onClick={e => { e.preventDefault(); e.stopPropagation(); onDoc(doc); }}>{L(label)}</button>;
  return (
    <div className={"terms-check" + (checked ? " on" : "")}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-labelledby={`${id}-text`} />
      <span id={`${id}-text`}><label htmlFor={id}>{L(B("I agree to the ", "我同意"))}</label>{link("terms", B("Terms of Service", "《服务条款》"))}{L(B(" and ", "和"))}{link("privacy", B("Privacy Policy", "隐私政策"))}<label htmlFor={id}>{L(B(", including individual arbitration of disputes (you can opt out within 30 days).", "，包括以个别仲裁方式解决争议（可在 30 天内选择退出）。"))}</label></span>
    </div>
  );
}

/* Region: where the account and its data live. One region today; the others show as not available yet. */
function RegionPick({ lang }: { lang: Lang }) {
  const L = (x: Bi) => x[lang];
  const regions:{ id: string; code: string; label: Bi; on: boolean }[] = [
    { id: "us", code: "US", label: B("United States", "美国"), on: true },
    { id: "eu", code: "EU", label: B("Europe", "欧洲"), on: false },
    { id: "ap", code: "APAC", label: B("Asia Pacific", "亚太"), on: false },
    { id: "au", code: "AU", label: B("Australia", "澳大利亚"), on: false },
  ];
  const cur = regions.find(r => r.id === api.REGION.id) ?? regions[0];
  return (
    <div className="region">
      <span className="rg-k" aria-hidden="true">{L(B("Data stored in", "数据存储于"))}</span>
      <Menu kind="listbox" label={L(B("Region", "区域"))} buttonClass="sel sm" buttonLabel={`${L(B("Data stored in", "数据存储于"))}: ${L(cur.label)}`} button={cur.code}
        items={regions.map(r => ({ key: r.id, label: r.code, icon: <I.globe />, picked: r.id === cur.id, disabled: !r.on, title: r.on ? L(r.label) : `${L(r.label)}: ${L(B("not available yet", "暂未开放"))}` }))} />
    </div>
  );
}

function SignIn({ lang, start }: { lang: Lang; start?: StartPeek | null }) {
  const L = (x: Bi) => x[lang];
  const [hand] = useState(readHandoff);
  const [email, setEmail] = useState(hand?.email ?? "");
  const [step, setStep] = useState<"email" | "password" | "code" | "confirm" | "phone" | "phonecode" | "reset">("email");
  const [cc, setCc] = useState("+1");
  const [phone, setPhone] = useState("");
  const e164 = () => cc + phone.replace(/\D/g, "").replace(/^0+/, "");
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => new URLSearchParams(location.search).get("error_description") ?? "");
  const [noAccount, setNoAccount] = useState(false);
  const [providers, setProviders] = useState<api.SignInOptions>({ google: false, azure: false, phone: false, saml: false });
  useEffect(() => {
    void api.authProviders().then(setProviders);
    if (new URLSearchParams(location.search).get("error")) history.replaceState(null, "", location.pathname + location.hash);
  }, []);
  const withProvider = async (p: api.Provider) => {
    setBusy(true); setErr("");
    try { await api.signInWith(p); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const okEmail = () => /\S+@\S+\.\S+/.test(email.trim());
  const sso = async () => {
    if (!okEmail()) { setErr(L(B("Enter your work email.", "请输入工作邮箱。"))); return; }
    setBusy(true); setErr("");
    try { await api.signInWithSso(email.trim()); }
    catch (e) {
      const x = e as api.ApiError;
      setErr(x.code === "sso_none" ? L(B("Single sign-on isn't set up for this email's company yet. Ask your admin, or sign in another way.", "该邮箱所在公司尚未设置单点登录。请联系管理员，或用其他方式登录。")) : x.message);
      setBusy(false);
    }
  };
  const next = async () => {
    if (!okEmail()) { setErr(L(B("Enter your work email.", "请输入工作邮箱。"))); return; }
    // a company that requires single sign-on: straight to it
    const rule = await api.ssoForEmail(email.trim());
    if (rule.required) {
      if (rule.method === "saml") { void sso(); return; }
      if (rule.method) { void withProvider(rule.method as api.Provider); return; }
    }
    setErr(""); setNoAccount(false); setPw(""); setStep("password");
  };
  const mailErr = (e: api.ApiError) => e.code === "rate_limited"
    ? L(B("Too many emails were sent just now. Sign in with a password, or try again in an hour.", "刚刚发送的邮件太多。请用密码登录，或一小时后再试。"))
    : /invalid/i.test(e.message) ? L(B("We can't email this address yet. Sign in with a password instead.", "暂时无法向该邮箱发送邮件，请改用密码登录。")) : e.message;
  const submitPw = async () => {
    if (mode === "create" && !agree) { setErr(L(B("Check the box to agree to the Terms of Service and Privacy Policy.", "请勾选同意《服务条款》和隐私政策。"))); return; }
    if (mode === "create" && pw.length < 8) { setErr(L(B("Use at least 8 characters.", "密码至少 8 位。"))); return; }
    if (mode === "create") api.termsAgreed.set(UPDATED);
    if (!pw) { setErr(L(B("Enter your password.", "请输入密码。"))); return; }
    setBusy(true); setErr(""); setNoAccount(false);
    try {
      if (mode === "signin") await api.signInPassword(email.trim(), pw);
      else { const r = await api.signUpPassword(email.trim(), pw); if (r.confirm) { setStep("confirm"); setBusy(false); return; } }
      // the session change takes it from here
    } catch (e) {
      const x = e as api.ApiError;
      if (x.code === "bad_login") { setErr(L(B("That password doesn't match, or there's no account for this email yet.", "密码不正确，或该邮箱尚未注册。"))); setNoAccount(true); }
      else if (x.code === "exists") { setErr(L(B("An account with this email already exists. Sign in instead.", "该邮箱已注册，请直接登录。"))); setMode("signin"); }
      else if (x.code === "weak") setErr(L(B("Pick a stronger password: at least 8 characters, not a common one.", "请设置更安全的密码：至少 8 位，避免常见密码。")));
      else setErr(x.message);
      setBusy(false);
    }
  };
  const sendCode = async () => {
    setBusy(true); setErr("");
    try { await api.sendSignIn(email.trim()); setStep("code"); } catch (e) { setErr(mailErr(e as api.ApiError)); }
    setBusy(false);
  };
  const sendReset = async () => {
    if (!okEmail()) { setErr(L(B("Enter your work email.", "请输入工作邮箱。"))); return; }
    setBusy(true); setErr(""); setNoAccount(false);
    try { await api.sendPasswordReset(email.trim()); setStep("reset"); } catch (e) { setErr(mailErr(e as api.ApiError)); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true); setErr("");
    try { await api.verifyCode(email.trim(), code.trim()); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const sendPhone = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) { setErr(L(B("Enter your phone number.", "请输入手机号。"))); return; }
    setBusy(true); setErr("");
    try { await api.sendPhoneCode(e164()); setCode(""); setStep("phonecode"); }
    catch (e) {
      const x = e as api.ApiError;
      setErr(x.code === "phone_off" ? L(B("Phone sign-in isn't available yet. Use your email for now.", "手机号登录暂未开通，请先使用邮箱登录。"))
        : x.code === "bad_phone" ? L(B("That number doesn't look right. Check the country code.", "号码格式不正确，请检查国家或地区代码。"))
        : x.code === "rate_limited" ? L(B("Too many codes. Wait a minute, then try again.", "验证码发送过于频繁，请稍候再试。")) : x.message);
    }
    setBusy(false);
  };
  const verifyPhone = async () => {
    setBusy(true); setErr("");
    try { await api.verifyPhoneCode(e164(), code.trim()); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const title = step === "phone" ? L(B("Enter your phone number.", "输入您的手机号。"))
    : step === "phonecode" ? L(B("Check your messages.", "请查收短信。"))
    : step === "code" ? L(B("Check your email.", "请查收邮件。"))
    : step === "confirm" ? L(B("Confirm your email.", "请确认邮箱。"))
    : step === "reset" ? L(B("Check your email.", "请查收邮件。"))
    : step === "password" ? (mode === "create" ? L(B("Create your password.", "设置密码。")) : L(B("Enter your password.", "输入密码。")))
    : start ? L(B("Your plan from Odelia is one step away.", "Odelia 发给您的计划只差一步。"))
    : hand ? L(B("Your license plan is one step away.", "您的执照计划只差一步。")) : L(B("Sign in to Placetta.", "登录快哉。"));
  const startPlace = start ? (lang === "zh" ? start.place_zh || start.place : start.place) : "";
  const sub = step === "phone" ? L(B("Log in or sign up with your phone number. No password needed.", "用手机号登录或注册，无需密码。"))
    : step === "phonecode" ? L(B(`We texted a 6-digit code to ${cc} ${phone}.`, `6 位验证码已发送至 ${cc} ${phone}。`))
    : step === "code" ? L(B(`We sent a sign-in link to ${email}. Open it on this device, or enter the code from the email.`, `登录链接已发送至 ${email}。请在此设备上打开，或输入邮件中的验证码。`))
    : step === "confirm" ? L(B(`We sent a confirmation link to ${email}. Open it, then sign in with your password.`, `确认链接已发送至 ${email}。打开链接后，用密码登录。`))
    : step === "reset" ? L(B(`If there's an account for ${email}, we sent it a link to set a new password. Open it on this device.`, `如果 ${email} 已注册，我们已向其发送设置新密码的链接。请在此设备上打开。`))
    : step === "password" ? null
    : start ? L(B(`Sign in or create an account to open it: ${start.permits ?? 0} permits for ${start.what} in ${startPlace}, in order.`, `登录或创建账户即可打开：${startPlace}${start.what}需要的 ${start.permits ?? 0} 项许可，已按顺序排好。`))
    : hand ? L(B("Confirm your email and Placetta starts mapping every license your store needs.", "确认邮箱后，快哉就开始梳理门店所需的全部执照。"))
    : L(B("New or invited? Sign in with your work email.", "新用户或受邀成员，请用工作邮箱登录。"));
  return (
    <div className="gate-card">
      <div className="gate-bot"><GateBot /></div>
      <h1>{title}</h1>
      {sub && <p className="gate-sub">{sub}</p>}
      {step === "password" && (
        <p className="gate-sub gate-id"><span>{email.trim()}</span><button type="button" className="lnk" onClick={() => { setStep("email"); setErr(""); }}>{L(B("Edit", "修改"))}</button></p>
      )}
      {step === "email" && (providers.google || providers.azure) && (
        <div className="gate-sso">
          {providers.google && <button type="button" className="sbtn line wide sso" disabled={busy} onClick={() => void withProvider("google")}><GoogleMark />{L(B("Continue with Google", "使用 Google 继续"))}</button>}
          {providers.azure && <button type="button" className="sbtn line wide sso" disabled={busy} onClick={() => void withProvider("azure")}><MicrosoftMark />{L(B("Continue with Microsoft", "使用 Microsoft 继续"))}</button>}
          <span className="gate-or">{L(B("or", "或"))}</span>
        </div>
      )}
      {step === "email" && (
        <form onSubmit={e => { e.preventDefault(); void next(); }}>
          <label className="sr" htmlFor="gate-email">{L(B("Email", "邮箱"))}</label>
          <input id="gate-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={L(B("you@company.com", "you@company.com"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy}>{L(B("Continue", "继续"))}</button>
        </form>
      )}
      {step === "email" && providers.saml && <button type="button" className="lnk gate-sso-link" disabled={busy} onClick={() => void sso()}>{L(B("Sign in with SSO", "使用单点登录"))}</button>}
      {step === "email" && providers.phone && <span className="gate-or">{L(B("or", "或"))}</span>}
      {step === "email" && providers.phone && <button type="button" className="sbtn line wide sso gate-phone" disabled={busy} onClick={() => { setErr(""); setStep("phone"); }}><PhoneMark />{L(B("Continue with phone", "使用手机号继续"))}</button>}
      {step === "phone" && (
        <form onSubmit={e => { e.preventDefault(); void sendPhone(); }}>
          <div className="phrow">
            <label className="sr" htmlFor="gate-cc">{L(B("Country code", "国家或地区代码"))}</label>
            <Select sz="lg" id="gate-cc" value={cc} onChange={e => setCc(e.target.value)}>
              {[["+1", "US +1"], ["+86", "CN +86"], ["+852", "HK +852"], ["+886", "TW +886"], ["+65", "SG +65"], ["+44", "UK +44"], ["+81", "JP +81"], ["+82", "KR +82"], ["+61", "AU +61"], ["+971", "AE +971"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <label className="sr" htmlFor="gate-phone">{L(B("Phone number", "手机号"))}</label>
            <input id="gate-phone" type="tel" inputMode="tel" autoComplete="tel-national" value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d\s()-]/g, "").slice(0, 20))} placeholder={cc === "+86" ? "138 0013 8000" : "(212) 555 0123"} autoFocus />
          </div>
          <button type="submit" className="sbtn ink wide" disabled={busy}>{busy ? "…" : L(B("Send code", "发送验证码"))}</button>
          <button type="button" className="sbtn quiet wide" onClick={() => { setStep("email"); setErr(""); }}>{L(B("Use email instead", "改用邮箱"))}</button>
        </form>
      )}
      {step === "phonecode" && (
        <form onSubmit={e => { e.preventDefault(); void verifyPhone(); }}>
          <label className="sr" htmlFor="gate-pcode">Code</label>
          <input id="gate-pcode" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={L(B("6-digit code", "6 位验证码"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy || code.length < 6}>{busy ? "…" : L(B("Sign in", "登录"))}</button>
          <button type="button" className="sbtn quiet wide" disabled={busy} onClick={() => void sendPhone()}>{L(B("Send a new code", "重新发送验证码"))}</button>
          <button type="button" className="sbtn quiet wide" onClick={() => { setStep("phone"); setCode(""); setErr(""); }}>{L(B("Change number", "更换号码"))}</button>
        </form>
      )}
      {step === "password" && (
        <form onSubmit={e => { e.preventDefault(); void submitPw(); }}>
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <label className="sr" htmlFor="gate-pw">{L(B("Password", "密码"))}</label>
          <div className="pwrap">
            <input id="gate-pw" type={show ? "text" : "password"} autoComplete={mode === "create" ? "new-password" : "current-password"} value={pw} onChange={e => setPw(e.target.value)} placeholder={mode === "create" ? L(B("At least 8 characters", "至少 8 位")) : L(B("Password", "密码"))} autoFocus />
            <button type="button" className="pshow" onClick={() => setShow(v => !v)} aria-label={show ? L(B("Hide password", "隐藏密码")) : L(B("Show password", "显示密码"))}>{show ? L(B("Hide", "隐藏")) : L(B("Show", "显示"))}</button>
          </div>
          {mode === "create" && <TermsCheck id="gate-agree" lang={lang} checked={agree} onChange={v => { setAgree(v); if (v) setErr(""); }} onDoc={openDoc} />}
          <button type="submit" className="sbtn ink wide" disabled={busy || (mode === "create" && !agree)}>{busy ? "…" : mode === "create" ? L(B("Agree and create account", "同意并创建账户")) : L(B("Sign in", "登录"))}</button>
          {mode === "signin" && <p className="gate-alt"><button type="button" className="lnk" disabled={busy} onClick={() => void sendReset()}>{L(B("Forgot password?", "忘记密码？"))}</button></p>}
          {noAccount && mode === "signin" && <button type="button" className="sbtn line wide" onClick={() => { setMode("create"); setErr(""); setNoAccount(false); }}>{L(B("Create an account with this email", "用此邮箱创建账户"))}</button>}
          <p className="gate-alt">
            {mode === "signin"
              ? <>{L(B("New to Placetta?", "第一次使用？"))} <button type="button" className="lnk" onClick={() => { setMode("create"); setErr(""); setNoAccount(false); }}>{L(B("Create an account", "创建账户"))}</button></>
              : <>{L(B("Already have an account?", "已有账户？"))} <button type="button" className="lnk" onClick={() => { setMode("signin"); setErr(""); }}>{L(B("Sign in", "登录"))}</button></>}
          </p>
          <p className="gate-alt"><button type="button" className="lnk" disabled={busy} onClick={() => void sendCode()}>{L(B("Email me a code instead", "改用邮箱验证码"))}</button></p>
        </form>
      )}
      {step === "code" && (
        <form onSubmit={e => { e.preventDefault(); void verify(); }}>
          <label className="sr" htmlFor="gate-code">Code</label>
          <input id="gate-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={L(B("6-digit code", "6 位验证码"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy || code.length < 6}>{busy ? "…" : L(B("Sign in", "登录"))}</button>
          <button type="button" className="sbtn quiet wide" onClick={() => { setStep("password"); setCode(""); }}>{L(B("Use a password instead", "改用密码登录"))}</button>
        </form>
      )}
      {step === "reset" && <button type="button" className="sbtn line wide" onClick={() => { setStep("password"); setPw(""); setErr(""); }}>{L(B("Back to sign in", "返回登录"))}</button>}
      {step === "confirm" && <button type="button" className="sbtn line wide" onClick={() => { setMode("signin"); setStep("password"); setPw(""); }}>{L(B("I've confirmed, sign in", "已确认，去登录"))}</button>}
      {err && <p className="gate-err" role="alert">{err}</p>}
      {(step === "email" || step === "password" || step === "phone") && (
        <div className="gate-legal">
          {!(step === "password" && mode === "create") && <p>{L(B("New accounts agree to Placetta's ", "创建账户需同意快哉的"))}<button type="button" className="lnk" onClick={() => openDoc("terms")}>{L(B("Terms of Service", "《服务条款》"))}</button>{L(B(" and ", "和"))}<button type="button" className="lnk" onClick={() => openDoc("privacy")}>{L(B("Privacy Policy", "隐私政策"))}</button>{L(B(".", "。"))}</p>}
          <RegionPick lang={lang} />
          <a href={HELP_URL} target={api.PREVIEW ? "_blank" : undefined} rel="noopener">{L(B("Need help signing in?", "登录遇到问题？"))}</a>
        </div>
      )}
      {api.PREVIEW && <p className="gate-preview">{step === "phonecode" ? L(B("No text is sent here. The code is 123456.", "这里不会发送短信，验证码是 123456。")) : step === "code"
        ? L(B("No email is sent here. The code is 123456.", "这里不会发送邮件，验证码是 123456。"))
        : L(B("Accounts here are kept in this browser. Any email and password work; an @placetta.com email signs you in as the Placetta filing team.", "这里的账户保存在此浏览器中。任意邮箱和密码都可以；使用 @placetta.com 邮箱会以快哉申报团队身份登录。"))}</p>}
    </div>
  );
}

/* Onboarding in four quick answers: the name, what it sells (tap a chip), where (one "City, state" field with suggestions)
   and when (tap a chip). Legal entity and street are optional and tucked away. Then an unchecked "I agree" box for the
   Terms and Privacy Policy (recorded with its version by accept_terms), and the Filing Authorization, granted by
   creating the workspace (create_workspace records authorized_at), stated right beside it. */
const WHEN: { en: string; zh: string; months: number | null }[] = [
  { en: "Within 3 months", zh: "3 个月内", months: 3 }, { en: "In 3 to 6 months", zh: "3 到 6 个月", months: 6 },
  { en: "In 6 to 12 months", zh: "6 到 12 个月", months: 12 }, { en: "Already open", zh: "已开业", months: 0 }, { en: "Not sure yet", zh: "还不确定", months: null },
];

/** The Filing Authorization a new workspace grants, stated beside the button that creates it. */
function FilingAuthNote({ lang, onDoc }: { lang: Lang; onDoc: (doc: string) => void }) {
  const L = (x: Bi) => x[lang];
  return <p>{L(B("Filing Authorization: by creating the workspace, you grant Placetta the ", "申报授权：创建工作区即表示您授予快哉"))}<button type="button" className="lnk" onClick={() => onDoc("authorization")}>{L(B("Filing Authorization", "《申报授权书》"))}</button>{L(B(". It authorizes Placetta to prepare applications for this business and to submit the ones you approve, as its authorized agent for that limited purpose. You confirm you have authority to act for the business.", "所述权限：授权快哉为本企业准备申请，并作为该有限目的的授权代理人提交您批准的申请。您确认有权代表本企业行事。"))}</p>;
}

/* A plan Odelia texted, after sign-in: one screen to make it this person's workspace. The Terms box and the Filing
   Authorization are the same as onboarding's. The phone it was texted to is linked only with the main button, which
   sits under the same consent words as Settings (src/consent.ts); the other button opens the plan without it. */
function ClaimStart({ lang, email, token, peek, onDone, onSkip }: { lang: Lang; email: string; token: string; peek: StartPeek; onDone: (id: string, notice?: string) => void; onSkip: (notice?: string) => void }) {
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gone, setGone] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  const phone = peek.channel !== "wechat" && !!peek.phone_last4;
  const n = peek.permits ?? 0;
  const place = zh ? peek.place_zh || peek.place : peek.place;
  const claim = async (link: boolean) => {
    if (!agree) { setErr(L(B("Check the box to agree to the Terms of Service and Privacy Policy.", "请勾选同意《服务条款》和隐私政策。"))); return; }
    setBusy(true); setErr("");
    try {
      const r = await claimStart(token, link);
      await api.acceptTerms(UPDATED, r.workspace_id).catch(() => null);
      clearStart();
      const said: Record<StartClaim["phone"], Bi | null> = {
        linked: B(`Your plan is here, and the phone ending in ${peek.phone_last4} is linked. Text Odelia anytime.`, `计划已就绪，尾号 ${peek.phone_last4} 的手机已关联，随时可以发短信给 Odelia。`),
        kept: B("Your plan is here. Your account already has another phone linked, so that one stays.", "计划已就绪。您的账户已关联了另一个手机号，保持不变。"),
        taken: B("Your plan is here. That phone is linked to another Placetta account, so it wasn't linked here.", "计划已就绪。该手机号已关联到另一个快哉账户，所以没有在这里关联。"),
        pin_required: B("Your plan is here. Unlock Settings with your PIN to link the phone.", "计划已就绪。请用设置密码解锁“设置”后再关联手机。"),
        declined: null, none: null,
      };
      const s = said[r.phone];
      onDone(r.workspace_id, s ? L(s) : undefined);
    } catch (e) {
      const c = (e as { code?: string }).code;
      if (c === "start_used" || c === "start_expired" || c === "start_invalid") {
        setGone(true);
        setErr(c === "start_expired" ? L(B("This link has expired. Text Odelia again for a new one, or start here.", "这个链接已过期。请再给 Odelia 发一次消息获取新链接，或在这里开始。"))
          : c === "start_used" ? L(B("This plan was already opened in another account.", "这个计划已在另一个账户中打开。"))
          : L(B("This link doesn't work. Text Odelia again for a new one, or start here.", "这个链接无效。请再给 Odelia 发一次消息获取新链接，或在这里开始。")));
        clearStart();
      } else setErr((e as api.ApiError).message || L(B("Something went wrong. Try again.", "出了点问题，请重试。")));
      setBusy(false);
    }
  };
  return (
    <div className="gate-card wide">
      <div className="gate-bot"><GateBot /></div>
      <h1>{L(B("Your plan is ready.", "您的计划已准备好。"))}</h1>
      <p className="gate-sub">{L(B(`${n} permit${n === 1 ? "" : "s"} for ${peek.what} in ${place}, in the order the agencies want them. It opens as your workspace, and Odelia keeps working on it with you.`, `${place}${peek.what}需要的 ${n} 项许可，已按各机构要求的顺序排好。打开后就是您的工作区，Odelia 会和您一起继续办理。`))}</p>
      {!gone && (
        <form className="onb" onSubmit={e => { e.preventDefault(); void claim(phone); }}>
          <div className="onb-legal">
            <TermsCheck id="claim-agree" lang={lang} checked={agree} onChange={v => { setAgree(v); if (v) setErr(""); }} onDoc={setDoc} />
            <FilingAuthNote lang={lang} onDoc={setDoc} />
            {phone && <p>{L(B(`Link the phone ending in ${peek.phone_last4}, the one Odelia texted, so you can text her about this plan. `, `关联尾号 ${peek.phone_last4} 的手机（即收到 Odelia 消息的手机），就可以发短信和她沟通这个计划。`))}{phoneConsent("link", zh)}</p>}
          </div>
          <div className="onb-act">
            {phone && <button type="button" className="sbtn quiet" disabled={busy || !agree} onClick={() => void claim(false)}>{L(B("Open without linking my phone", "打开，但不关联手机"))}</button>}
            <button type="submit" className="sbtn ink big" disabled={busy || !agree}>{busy ? "…" : phone ? L(B("Open my plan and link my phone", "打开计划并关联手机")) : L(B("Open my plan", "打开计划"))}</button>
          </div>
        </form>
      )}
      {gone && <div className="onb-act"><button type="button" className="sbtn ink big" onClick={() => onSkip()}>{L(B("Continue", "继续"))}</button></div>}
      {err && <p className="gate-err" role="alert">{err}</p>}
      <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
      {d && (
        <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setDoc(null); }}>
          <div className="modal wide" role="dialog" aria-modal="true" aria-label={d.title[lang]}>
            <header className="m-h"><h2>{d.title[lang]}</h2><button type="button" className="icbtn close" onClick={() => setDoc(null)} aria-label="Close">×</button></header>
            <div className="m-body legal"><LegalBody text={d.body[lang]} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* One line instead of a form: "Milk tea shop in Flushing, NY" or "奶茶店，法拉盛". What it sells and the city are read
   from the words (src/plan/line.ts, the same reading a first text to Odelia gets); anything missing is asked right
   there, one field at a time. */
function Onboard({ lang, email, onCreated, onCancel }: { lang: Lang; email: string; onCreated: (id: string) => void; onCancel?: () => void }) {
  const L = (x: Bi) => x[lang];
  // answers from the website's questionnaire, if they came that way
  const [hand] = useState(readHandoff);
  const [f, setF] = useState({ brand: hand?.brand ?? "", sell: hand?.sell ?? "", other: hand?.other ?? "", place: hand?.place ?? "", state: "", when: hand?.when ?? -1, entity: "", street: "", more: false });
  // the one line; what it says fills the answers above unless they were set by hand
  const [line, setLine] = useState(() => (hand ? "" : embedLine()));
  // a business that came through a partner answers once whether the partner sees its progress (off unless ticked)
  const [share, setShare] = useState(false);
  // "I already have stores": the free check instead of the one line (src/StoresCheck.tsx)
  const [mode, setMode] = useState<"plan" | "existing">("plan");
  const read = readLine(line);
  const sellNow = f.sell || read.sell || (line.trim() && !read.sell ? "other" : "");
  const placeNow = f.place || read.place;
  // their own words for what it is ("Hot pot restaurant", "奶茶店"), so Odelia knows exactly what she's licensing
  const own = ownWords(line);
  const otherNow = f.other || (sellNow === "other" ? own : "");
  const whenNow = f.when >= 0 ? f.when : read.open ? 3 : 4;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agree, setAgree] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  const parsed = parsePlace(placeNow);
  const needState = !!placeNow.trim() && !parsed && !placeNow.includes(",");
  const what = sellNow === "other" ? otherNow.trim() : f.sell ? SELLS.find(x => x.en === sellNow)?.[lang === "zh" ? "zh" : "en"] ?? "" : own && own.length <= 60 ? own : SELLS.find(x => x.en === sellNow)?.[lang === "zh" ? "zh" : "en"] ?? "";
  // The second screen: three optional answers that let Placetta fill a real application before the plan appears.
  const [step, setStep] = useState<"line" | "about" | "more">("line");
  const [more, setMore] = useState({ legal: "", notFormed: false, owner: "", address: "" });
  // the intake (src/plan/intake.ts): yes-or-no questions one at a time, only those that apply to what they're opening
  const [intake, setIntake] = useState<Intake>({});
  const [qi, setQi] = useState(0);
  const questions = intakeQuestions(what);
  /** What the first screen settled (the city and state), or why it can't go on yet. */
  const settle = () => {
    const city = parsed?.city ?? placeNow.replace(/,.*$/, "").trim();
    const state = parsed?.state ?? f.state;
    if (!what) { setErr(L(B("Say what you're opening, like \"milk tea shop\".", "请说明开什么店，例如“奶茶店”。"))); return null; }
    if (!city || !state) { setErr(L(B("Add the city and state, like Flushing, NY.", "请填写城市和州，例如 Flushing, NY。"))); return null; }
    if (!agree) { setErr(L(B("Check the box to agree to the Terms of Service and Privacy Policy.", "请勾选同意《服务条款》和隐私政策。"))); return null; }
    return { city, state };
  };
  // Start on the first screen goes to the three questions, with anything already typed in the details box carried over
  const toMore = () => {
    if (!settle()) return;
    setErr("");
    setMore(m => ({ ...m, legal: m.legal || f.entity.trim(), address: m.address || f.street.trim() }));
    setQi(0);
    setStep(questions.length ? "about" : "more");
  };
  /** One answer, then the next question that applies, then the three answers. */
  const answer = (v: boolean | undefined) => {
    const q = questions[qi];
    if (q) setIntake(x => { const n = { ...x }; if (v === undefined) delete n[q.key]; else n[q.key] = v; return n; });
    if (qi + 1 < questions.length) setQi(qi + 1); else setStep("more");
  };
  const create = async (skip = false) => {
    const at = settle();
    if (!at) return;
    const { city, state } = at;
    // the time to plan runs from this press to the plan on Home (src/pages.tsx reads it)
    firstPlanClock.start();
    // the three answers (a skip keeps only what the first screen's details box already had)
    const notFormed = !skip && more.notFormed;
    setBusy(true); setErr("");
    // the plan, the store and the facts, built the same way as for a business that texted Odelia (src/plan/start.ts)
    const { name: brand, state: ws } = firstWorkspace({
      what, city, state, lang, brand: f.brand.trim(), months: WHEN[whenNow]?.months ?? null, notFormed,
      legal: notFormed ? "" : (skip ? "" : more.legal.trim()) || f.entity.trim(), owner: skip ? "" : more.owner.trim(),
      address: (skip ? "" : more.address.trim()) || f.street.trim(),
      intake: Object.fromEntries(Object.entries(intake).filter(([k]) => questions.some(q => q.key === k))),
    });
    try {
      const id = await api.createWorkspace(brand, ws);
      // the box they checked, recorded with the version they were shown (if it fails, the app asks again)
      await api.acceptTerms(UPDATED, id).catch(() => null);
      await claimReferral(id, share);
      if (hand) consumeHandoff();
      onCreated(id);
    } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  // the store check's stores, open, with their gaps as the plan
  const createExisting = async (results: StoreResult[], today: string) => {
    const ok = results.filter(r => r.ok);
    if (!ok.length) return;
    if (!agree) { setErr(L(B("Check the box to agree to the Terms of Service and Privacy Policy.", "请勾选同意《服务条款》和隐私政策。"))); return; }
    const first = ok[0], city = first.place.split(",")[0].trim(), kind = STORE_KINDS.find(k => k.en === first.store.what);
    const brand = f.brand.trim() || (lang === "zh" ? `${city}${kind?.zh ?? first.store.what}` : `${first.store.what} in ${city}`);
    setBusy(true); setErr("");
    try {
      const id = await api.createWorkspace(brand, existingWorkspace(toPlan(ok, today), ok, brand));
      await api.acceptTerms(UPDATED, id).catch(() => null);
      await claimReferral(id, share);
      if (hand) consumeHandoff();
      onCreated(id);
    } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const legal = (
    <div className="onb-legal">
      <ReferralConsent lang={lang} checked={share} onChange={setShare} />
      <TermsCheck id="onb-agree" lang={lang} checked={agree} onChange={v => { setAgree(v); if (v) setErr(""); }} onDoc={setDoc} />
      <FilingAuthNote lang={lang} onDoc={setDoc} />
    </div>
  );
  const docModal = d && (
    <div className="scrim" onMouseDown={e => { if (e.target === e.currentTarget) setDoc(null); }}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-label={d.title[lang]}>
        <header className="m-h"><h2>{d.title[lang]}</h2><button type="button" className="icbtn close" onClick={() => setDoc(null)} aria-label="Close">×</button></header>
        <div className="m-body legal"><LegalBody text={d.body[lang]} /></div>
      </div>
    </div>
  );
  if (mode === "existing") {
    return (
      <div className="gate-card wide">
        <StoresCheck lang={lang} onApply={(r, t) => void createExisting(r, t)} applyLabel={B("Turn these into my plan", "把这些变成我的计划")} busy={busy} err={err} footer={legal} />
        <button type="button" className="lnk more" onClick={() => { setErr(""); setMode("plan"); }}>{L(B("Opening a new store instead? Describe it in one line", "要开新店？用一句话描述"))}</button>
        <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
        {docModal}
      </div>
    );
  }
  if (step === "about" && questions[qi]) {
    const q = questions[qi], had = intake[q.key];
    return (
      <div className="gate-card wide">
        <p className="gate-sub onb-count">{L(B(`Question ${qi + 1} of ${questions.length}`, `第 ${qi + 1} 题，共 ${questions.length} 题`))}</p>
        <h1 id="onb-q">{L(q.q)}</h1>
        <p className="gate-sub">{L(q.hint)}</p>
        <div className="chips onb-yn" role="radiogroup" aria-labelledby="onb-q">
          <button type="button" role="radio" aria-checked={had === true} className="chip" autoFocus onClick={() => answer(true)}>{L(B("Yes", "是"))}</button>
          <button type="button" role="radio" aria-checked={had === false} className="chip" onClick={() => answer(false)}>{L(B("No", "否"))}</button>
        </div>
        <div className="onb-act onb-act3">
          <button type="button" className="sbtn quiet" onClick={() => { setErr(""); if (qi > 0) setQi(qi - 1); else setStep("line"); }}>{L(B("Back", "返回"))}</button>
          <button type="button" className="sbtn line" onClick={() => answer(undefined)}>{L(B("Not sure", "不确定"))}</button>
        </div>
        <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
      </div>
    );
  }
  if (step === "more") {
    const ex = parsed ?? { city: placeNow.replace(/,.*$/, "").trim() || "Flushing", state: f.state || "NY" };
    return (
      <div className="gate-card wide">
        <h1>{L(B("Three answers fill your first application.", "回答三个问题，第一份申请就填好了。"))}</h1>
        <p className="gate-sub">{L(B("Each one is optional. Skip any you don't have yet; Odelia asks when she needs it.", "都是选填。还没有的可以跳过，Odelia 需要时会再问您。"))}</p>
        <form className="onb" onSubmit={e => { e.preventDefault(); void create(); }}>
          <div className="q">
            <span id="onb-legal-t">{L(B("Legal business name", "企业法定名称"))}</span>
            <div className="onb-pair">
              <input id="onb-legal" aria-labelledby="onb-legal-t" value={more.notFormed ? "" : more.legal} disabled={more.notFormed} onChange={e => setMore({ ...more, legal: e.target.value })} placeholder="Lucky Leaf Tea LLC" autoComplete="organization" autoFocus />
              <button type="button" role="checkbox" aria-checked={more.notFormed} className="chip" onClick={() => setMore({ ...more, notFormed: !more.notFormed })}>{L(B("Not formed yet", "还没注册公司"))}</button>
            </div>
            <small className="onb-hint">{L(B("Exactly as the state has it, with LLC or Inc.", "与州政府登记的完全一致，包括 LLC 或 Inc."))}</small>
          </div>
          <label className="q">
            <span>{L(B("Owner's full name", "所有人全名"))}</span>
            <input id="onb-owner" value={more.owner} onChange={e => setMore({ ...more, owner: e.target.value })} placeholder="Mei Chen" autoComplete="name" />
            <small className="onb-hint">{L(B("As on your ID, in English letters.", "与证件一致，请用英文或拼音。"))}</small>
          </label>
          <label className="q">
            <span>{L(B("Store address", "门店地址"))}</span>
            <input id="onb-address" value={more.address} onChange={e => setMore({ ...more, address: e.target.value })} placeholder={`38 Main St, ${ex.city}, ${ex.state}`} autoComplete="street-address" />
            <small className="onb-hint">{L(B("Street, city, state and ZIP code.", "街道、城市、州和邮编，请用英文。"))}</small>
          </label>
          <div className="onb-act onb-act3">
            <button type="button" className="sbtn quiet" disabled={busy} onClick={() => { setErr(""); if (questions.length) { setQi(questions.length - 1); setStep("about"); } else setStep("line"); }}>{L(B("Back", "返回"))}</button>
            <button type="button" className="sbtn line" disabled={busy} onClick={() => void create(true)}>{L(B("Skip", "跳过"))}</button>
            <button type="submit" className="sbtn ink big" disabled={busy}>{busy ? "…" : L(B("Fill my application", "填好申请"))}</button>
          </div>
        </form>
        {err && <p className="gate-err" role="alert">{err}</p>}
        <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
      </div>
    );
  }
  return (
    <div className="gate-card wide">
      <h1>{L(B("What are you opening, and where?", "您要开什么店？开在哪里？"))}</h1>
      <p className="gate-sub">{L(B("One line is enough. Your plan appears right away: every license and permit, in order, with fees and timelines. Odelia then fills the forms and files them with your approval.", "一句话就够。计划立刻出现：全部执照和许可，按顺序列出费用与时间。之后 Odelia 填好表格，经您批准后提交。"))}</p>
      <form className="onb" onSubmit={e => { e.preventDefault(); toMore(); }}>
        <label className="q">
          <span className="sr">{L(B("What and where", "开什么店、在哪里"))}</span>
          <input id="onb-line" className="onb-line" value={line} onChange={e => { setLine(e.target.value); setErr(""); }} placeholder={L(B("Milk tea shop in Flushing, NY", "奶茶店，纽约法拉盛"))} autoFocus autoComplete="off" />
        </label>
        {!line && (
          <div className="chips ex">
            {[B("Milk tea shop in Flushing, NY", "奶茶店，纽约法拉盛"), B("Hot pot restaurant in Irvine, CA", "火锅店，加州尔湾"), B("Bakery in Houston, TX", "烘焙店，德州休斯顿")].map(x => (
              <button key={x.en} type="button" className="chip" onClick={() => setLine(L(x))}>{L(x)}</button>
            ))}
          </div>
        )}
        {line.trim() && (
          <p className="onb-read" aria-live="polite">
            {what ? <span><I.check />{what}</span> : <span className="miss">{L(B("What kind of business?", "什么类型的店？"))}</span>}
            {parsed || (placeNow && f.state) ? <span><I.check />{placeNow}{!parsed && f.state ? `, ${f.state}` : ""}</span> : <span className="miss">{L(B("Which city and state?", "哪个城市和州？"))}</span>}
            {whenNow === 3 && <span><I.check />{L(B("Already open", "已开业"))}</span>}
          </p>
        )}
        {line.trim() && !read.place && !f.place && (
          <label className="q">
            <span>{L(B("City and state", "城市和州"))}</span>
            <input id="onb-place" list="onb-cities" value={f.place} onChange={e => setF({ ...f, place: e.target.value })} placeholder="Flushing, NY" autoComplete="address-level2" />
            <datalist id="onb-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
          </label>
        )}
        {needState && (
          <Select sz="lg" data-prompt id="onb-state" value={f.state} onChange={e => setF({ ...f, state: e.target.value })} aria-label={L(B("State", "州"))}>
            <option value="">{L(B("Which state?", "哪个州？"))}</option>
            {STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </Select>
        )}

        {f.more ? (
          <div className="q more-box">
            <label><span>{L(B("Business name", "企业名称"))}</span><input id="onb-brand" value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} placeholder="Moonleaf Tea" autoComplete="organization" /></label>
            <fieldset className="q">
              <legend>{L(B("When do you want to open?", "计划什么时候开业？"))}</legend>
              <div className="chips" role="radiogroup">
                {WHEN.map((x, k) => <button key={x.en} type="button" role="radio" aria-checked={whenNow === k} className="chip" onClick={() => setF({ ...f, when: k })}>{L(x)}</button>)}
              </div>
            </fieldset>
            <div className="two">
              <label><span>{L(B("Legal entity, if formed", "法律实体（如已成立）"))}</span><input id="onb-entity" value={f.entity} onChange={e => setF({ ...f, entity: e.target.value })} placeholder="Moonleaf Tea LLC" /></label>
              <label><span>{L(B("Street address", "街道地址"))}</span><input id="onb-street" value={f.street} onChange={e => setF({ ...f, street: e.target.value })} placeholder="38 Main St" autoComplete="address-line1" /></label>
            </div>
          </div>
        ) : (
          <button type="button" className="lnk more" onClick={() => setF({ ...f, more: true })}>{L(B("Add a name, opening date or address (optional, Odelia asks later)", "添加店名、开业时间或地址（选填，Odelia 之后会问）"))}</button>
        )}

        <button type="button" className="lnk more" onClick={() => { setErr(""); setMode("existing"); }}>{L(B("I already have stores: check what each one needs, free", "我已有门店：免费检查每家店需要的许可"))}</button>
        {legal}
        <div className="onb-act">
          {onCancel && <button type="button" className="sbtn quiet" onClick={onCancel}>{L(B("Cancel", "取消"))}</button>}
          <button type="submit" className="sbtn ink big" disabled={busy || !agree || !line.trim()}>{busy ? "…" : L(B("Start", "开始"))}</button>
        </div>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
      <p className="onb-who">{L(B(`Signed in as ${email}`, `已登录 ${email}`))}</p>
      {docModal}
    </div>
  );
}

/* After a password reset link: the recovery session is signed in, and the only thing it does first is set a new password. */
function SetPassword({ lang, onDone, onCancel }: { lang: Lang; onDone: () => void; onCancel: () => void }) {
  const L = (x: Bi) => x[lang];
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // With two-step on, the password changes only from a two-step session: ask for the code first.
  const [factor, setFactor] = useState<string | null>(null);
  useEffect(() => { void api.twoStepStatus().then(t => { if (t.next === "aal2" && t.current !== "aal2" && t.factorId) setFactor(t.factorId); }).catch(() => undefined); }, []);
  const save = async () => {
    if (a.length < 8) { setErr(L(B("Use at least 8 characters.", "密码至少 8 位。"))); return; }
    if (a !== b) { setErr(L(B("The passwords don't match.", "两次输入的密码不一致。"))); return; }
    setBusy(true); setErr("");
    try { await api.changePassword(a); onDone(); }
    catch (e) {
      const x = e as api.ApiError;
      setErr(x.code === "weak" ? L(B("Pick a stronger password: at least 8 characters, not a common one.", "请设置更安全的密码：至少 8 位，避免常见密码。"))
        : x.code === "same" ? L(B("Pick a password different from your current one.", "新密码不能与旧密码相同。"))
        : x.code === "reauth" ? L(B("This link has expired. Ask for a new one from the sign-in page.", "该链接已失效，请在登录页重新获取。"))
        : x.code === "rate_limited" ? L(B("Too many tries. Wait a minute, then try again.", "尝试次数过多，请稍候再试。")) : x.message);
      setBusy(false);
    }
  };
  if (factor) return <TwoStepCode lang={lang} factorId={factor} onDone={() => setFactor(null)} onSignOut={onCancel} />;
  return (
    <div className="gate-card">
      <div className="gate-bot"><GateBot /></div>
      <h1>{L(B("Set a new password.", "设置新密码。"))}</h1>
      <p className="gate-sub">{L(B("Use it the next time you sign in.", "下次登录时使用新密码。"))}</p>
      <form onSubmit={e => { e.preventDefault(); void save(); }}>
        <label className="sr" htmlFor="gate-newpw">{L(B("New password", "新密码"))}</label>
        <div className="pwrap">
          <input id="gate-newpw" type={show ? "text" : "password"} autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} placeholder={L(B("At least 8 characters", "至少 8 位"))} autoFocus />
          <button type="button" className="pshow" onClick={() => setShow(v => !v)} aria-label={show ? L(B("Hide password", "隐藏密码")) : L(B("Show password", "显示密码"))}>{show ? L(B("Hide", "隐藏")) : L(B("Show", "显示"))}</button>
        </div>
        <label className="sr" htmlFor="gate-newpw2">{L(B("Type it again", "再次输入"))}</label>
        <input id="gate-newpw2" type={show ? "text" : "password"} autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} placeholder={L(B("Type it again", "再次输入"))} />
        <button type="submit" className="sbtn ink wide" disabled={busy || !a || !b}>{busy ? "…" : L(B("Save and continue", "保存并继续"))}</button>
        <button type="button" className="sbtn quiet wide" disabled={busy} onClick={onCancel}>{L(B("Cancel and sign out", "取消并退出"))}</button>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
    </div>
  );
}

type Phase = { k: "loading" } | { k: "signin" } | { k: "recover" } | { k: "twostep"; factorId: string } | { k: "sso"; email: string; method: string } | { k: "onboard"; email: string; back?: string } | { k: "claim"; email: string; token: string; peek: StartPeek } | { k: "hq"; email: string; rows: HqRow[] } | { k: "partner"; email: string } | { k: "app"; s: CloudSession } | { k: "error"; msg: string }
  | { k: "mcp"; email: string; req: api.McpAuthRequest; rows: { id: string; name: string }[]; start: string };

export function CloudRoot() {
  const [lang, setLangState] = useState<Lang>(() => readHandoff()?.lang ?? readLang());
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("placetta-lang", l); localStorage.setItem("placetta-agent-lang", l); } catch { /* blocked */ } };
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
  // A plan Odelia texted (/app/?s=…): kept through sign-in, described on the sign-in screen, claimed right after it.
  const [start, setStart] = useState<{ token: string; peek: StartPeek | null } | null>(() => { if (api.PREVIEW) return null; const t = captureStart(); return t ? { token: t, peek: null } : null; });
  useEffect(() => {
    if (!start || start.peek) return;
    void peekStart(start.token).then(p => {
      setStart({ token: start.token, peek: p });
      // the language they texted in, unless they've picked one here before
      let chosen = false;
      try { chosen = !!localStorage.getItem("placetta-lang"); } catch { /* blocked */ }
      if (!chosen && (p.lang === "en" || p.lang === "zh")) setLangState(p.lang);
    }).catch(() => undefined);
  }, [start]);
  const [phase, setPhaseRaw] = useState<Phase>({ k: "loading" });
  const booted = useRef(false);
  // A password reset link signs in with a recovery session: hold everything else until the new password is set.
  const recovering = useRef(false);
  const setPhase = useCallback((p: Phase) => { if (!recovering.current) setPhaseRaw(p); }, []);
  const L = (x: Bi) => x[lang];

  const open = useCallback(async (wsId: string, notice?: string) => {
    setPhase({ k: "loading" });
    try {
      const two = await api.twoStepStatus();
      if (two.next === "aal2" && two.current !== "aal2" && two.factorId) { setPhase({ k: "twostep", factorId: two.factorId }); return; }
      // a company that requires single sign-on: a session that didn't use it reaches nothing (the database refuses it)
      const email = (await api.getSession())?.user.email ?? "";
      if (email) {
        const rule = await api.ssoForEmail(email);
        if (!api.meetsSso(rule, await api.sessionMethods())) { setPhase({ k: "sso", email, method: rule.method ?? "saml" }); return; }
      }
      const joined = await api.acceptInvites().catch(() => 0);
      void api.recordSignIn();
      // Agreed at sign-up (the checkbox), before there was a session: record it now, if it's still the current version.
      const agreed = api.termsAgreed.take();
      if (agreed === UPDATED) await api.acceptTerms(agreed).catch(() => null);
      const me = await api.whoami();
      // A plan Odelia texted waits to be claimed: that comes first. A link that's used up or expired is let go, and a
      // plan this person already claimed just opens.
      const tok = api.PREVIEW ? null : pendingStart();
      if (tok) {
        const peek = await peekStart(tok).catch(() => null);
        if (peek?.status === "ok") { setPhase({ k: "claim", email: me.email, token: tok, peek }); return; }
        if (peek) {
          clearStart();
          if (peek.workspace_id) wsId = peek.workspace_id;
          else notice = peek.status === "expired" ? L(B("The link to your texted plan has expired. Text Odelia again for a new one.", "短信计划的链接已过期。请再给 Odelia 发一次消息获取新链接。"))
            : peek.status === "used" ? L(B("That texted plan was already opened in another account.", "该短信计划已在另一个账户中打开。")) : notice;
        }
      }
      let rows = await api.myWorkspaces();
      // The Placetta team works from the filing queue; give them a workspace of their own to open it from.
      if (!rows.length && me.staff_email) { await api.createWorkspace("Placetta team", normalize("Placetta team", {})); rows = await api.myWorkspaces(); }
      // Headquarters: franchisees that shared their stores with this email (read only, never forces onboarding)
      const hq = await api.hqStores().catch(() => [] as HqRow[]);
      const row = rows.find(r => r.id === wsId) ?? rows[0];
      if (!row) {
        // a partner (or someone opening /app/partner to become one) with no workspace of their own gets the partner page
        const partner = hq.length ? null : await partnerMe().catch(() => null);
        setPhase(hq.length ? { k: "hq", email: me.email, rows: hq } : partner || /\/partner\/?$/.test(location.pathname) ? { k: "partner", email: me.email } : { k: "onboard", email: me.email });
        return;
      }
      // an AI assistant signing in to Placetta (src/cloud/McpConsent.tsx): the person decides, then goes back to it
      const mcpReq = pendingMcpAuth();
      if (mcpReq) { setPhase({ k: "mcp", email: me.email, req: mcpReq, rows: rows.filter(r => r.role === "owner" || r.role === "admin").map(r => ({ id: r.id, name: r.name })), start: row.id }); return; }
      if (joined) notice = lang === "zh" ? `已加入 ${joined} 个团队工作区。` : `You joined ${joined} team workspace${joined > 1 ? "s" : ""}.`;
      lastWs.set(row.id);
      const params = new URLSearchParams(location.search);
      if (params.get("connect_finish")) {
        try { const r = await api.integration<{ kind: string; account?: string }>(row.id, "finish", { id: params.get("connect_finish") }); notice = `${lang === "zh" ? "已连接" : "Connected"} ${r.account ?? r.kind}`; }
        catch (e) { notice = (e as api.ApiError).message; }
      }
      if (params.get("connect_error")) notice = lang === "zh" ? "连接未完成，请重试。" : "That connection didn't finish. Try again.";
      if (params.get("billing") === "success") notice = lang === "zh" ? "付款成功。几秒后方案会自动生效。" : "Payment received. Your plan switches on in a few seconds.";
      if (params.get("billing") === "cancel") notice = lang === "zh" ? "已取消付款。" : "Checkout canceled.";
      // a brand's invite link (src/hqPlan.ts inviteLink): kept for Settings, Team, Headquarters, where an owner joins
      if (params.get("hq")) { try { sessionStorage.setItem("placetta-hq-invite", params.get("hq")!); } catch { /* storage off */ } notice = lang === "zh" ? "品牌邀请：在“设置 > 团队 > 总部”中点“加入品牌”。" : "A brand invited you: choose Join the brand in Settings, Team, Headquarters."; }
      if ([...params.keys()].length) history.replaceState(null, "", location.pathname + location.hash);
      const [audit, billing, filings, docs, integrations, logins, terms] = await Promise.all([
        api.listAudit(row.id), api.getBilling(row.id), api.listFilings(row.id), api.listDocs(row.id), api.listIntegrations(row.id), api.listLogins(row.id),
        api.termsStatus().catch(() => null),
      ]);
      setPhase({ k: "app", s: {
        me, role: row.role, wsId: row.id, initial: normalize(row.name, row.state), audit, billing, filings, docs, integrations, logins,
        workspaces: rows.map(r => ({ id: r.id, name: r.name })), hq, terms, notice, approval: row.id === params.get("ws") ? params.get("approval") ?? undefined : undefined,
        // a filled form from a text or chat (src/forms/versions.ts): its short link's token
        form: row.id === params.get("ws") ? params.get("f") ?? undefined : undefined,
        switchTo: id => void open(id),
        newWorkspace: () => setPhase({ k: "onboard", email: me.email, back: row.id }),
        signOut: everywhere => { void api.signOut(!!everywhere).then(() => setPhase({ k: "signin" })); },
        reopen: () => void open(row.id),
      } });
      // the webhook can land a moment after Stripe sends people back: look again shortly
      if (params.get("billing") === "success") setTimeout(() => window.dispatchEvent(new Event("focus")), 4000);
    } catch (e) {
      setPhase({ k: "error", msg: (e as api.ApiError).message ?? String(e) });
    }
  }, [lang, setPhase]);

  useEffect(() => {
    // A link from one of Odelia's texts names the workspace (?ws=) it's about.
    // a partner's link (?ref=) or plan box (?line=): kept before anything else reads the address (src/referral.ts)
    captureRef();
    captureMcpAuth();
    const boot = () => { if (booted.current) return; booted.current = true; void open(new URLSearchParams(location.search).get("ws") || lastWs.get()); };
    void api.getSession().then(s => (s ? boot() : setPhase({ k: "signin" })));
    const sub = api.onAuth((s, event) => {
      if (event === "PASSWORD_RECOVERY" && s) { recovering.current = true; setPhaseRaw({ k: "recover" }); return; }
      if (s) boot(); else { recovering.current = false; booted.current = false; setPhase({ k: "signin" }); }
    });
    return () => sub.unsubscribe();
  }, [open, setPhase]);
  const recovered = () => { recovering.current = false; booted.current = true; void open(lastWs.get()); };

  // Sign in, sign up, reset, two-step and setup are always light; the workspace follows the person's appearance setting.
  const gate = phase.k !== "app" && phase.k !== "hq" && phase.k !== "partner";
  useLayoutEffect(() => {
    if (gate) document.documentElement.dataset.theme = "light"; else applyTheme(readTheme());
  }, [gate]);

  if (phase.k === "app") return <App key={phase.s.wsId} cloud={phase.s} />;
  if (phase.k === "hq") return <HqHome lang={lang} setLang={setLang} email={phase.email} rows={phase.rows}
    onNew={() => setPhase({ k: "onboard", email: phase.email, back: "" })} onSignOut={() => { void api.signOut().then(() => setPhase({ k: "signin" })); }} />;
  if (phase.k === "partner") return <PartnerHome lang={lang} setLang={setLang} email={phase.email}
    onNew={() => setPhase({ k: "onboard", email: phase.email, back: "" })} onSignOut={() => { void api.signOut().then(() => setPhase({ k: "signin" })); }} />;
  return (
    <Frame lang={lang} setLang={setLang}>
      {phase.k === "loading" && <div className="gate-card"><div className="gate-bot"><GateBot busy /></div><p className="gate-sub">{L(B("Opening your workspace…", "正在打开工作区…"))}</p></div>}
      {phase.k === "signin" && <SignIn lang={lang} start={start?.peek?.status === "ok" ? start.peek : null} />}
      {phase.k === "claim" && <ClaimStart lang={lang} email={phase.email} token={phase.token} peek={phase.peek} onDone={(id, n) => { setStart(null); void open(id, n); }} onSkip={() => { clearStart(); setStart(null); void open(lastWs.get()); }} />}
      {phase.k === "recover" && <SetPassword lang={lang} onDone={recovered} onCancel={() => { recovering.current = false; void api.signOut().then(() => setPhase({ k: "signin" })); }} />}
      {phase.k === "sso" && (
        <div className="gate-card">
          <h1>{L(B("Your company requires single sign-on.", "您的公司要求单点登录。"))}</h1>
          <p className="gate-sub">{L(B(`Everyone at ${phase.email.split("@")[1]} signs in to Placetta through their company account.`, `${phase.email.split("@")[1]} 的所有人都需通过公司账户登录快哉。`))}</p>
          <button type="button" className="sbtn ink wide" onClick={() => {
            const { email, method } = phase;
            void api.signOut().then(() => (method === "saml" ? api.signInWithSso(email) : api.signInWith(method as api.Provider))).catch(e => setPhase({ k: "error", msg: (e as api.ApiError).message }));
          }}>{L(B("Sign in with SSO", "使用单点登录"))}</button>
          <button type="button" className="lnk" onClick={() => { void api.signOut().then(() => setPhase({ k: "signin" })); }}>{L(B("Sign out", "退出登录"))}</button>
        </div>
      )}
      {phase.k === "twostep" && <TwoStepCode lang={lang} factorId={phase.factorId} onDone={() => void open(lastWs.get())} onSignOut={() => { void api.signOut().then(() => setPhase({ k: "signin" })); }} />}
      {phase.k === "mcp" && <McpConsent lang={lang} email={phase.email} req={phase.req} rows={phase.rows} start={phase.start} onDone={() => void open(phase.start)} />}
      {phase.k === "onboard" && <Onboard lang={lang} email={phase.email} onCreated={id => void open(id)} onCancel={phase.back !== undefined ? () => void open(phase.back!) : undefined} />}
      {phase.k === "error" && <div className="gate-card"><h1>{L(B("Something went wrong.", "出了点问题。"))}</h1><p className="gate-sub">{phase.msg}</p><button type="button" className="sbtn ink" onClick={() => void open(lastWs.get())}>{L(B("Try again", "重试"))}</button></div>}
    </Frame>
  );
}

function PhoneMark() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>;
}
