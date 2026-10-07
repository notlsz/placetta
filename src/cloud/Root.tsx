import { useCallback, useEffect, useRef, useState } from "react";
import App from "../App";
import { AgentBot } from "../Bot";
import { LegalBody } from "../Legal";
import { LEGAL } from "../legal";
import { Logo } from "../Logo";
import { B, same, type Bi, type Store, type Workspace } from "../model";
import type { Lang } from "../i18n";
import * as api from "./api";
import { normalize, type CloudSession } from "./session";
import { consumeHandoff, readHandoff } from "./handoff";
import { TwoStepCode } from "./TwoStep";

/* Signed-in Placetta: sign in with Google, Microsoft or an email code, then two-step sign-in if it's on.
   Invites to a teammate's workspace are accepted on sign-in. New businesses start with onboarding (and the filing
   authorization); the workspace, files and the audit trail live in the account. */

const STATES: [string, string][] = [["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]];
const NYC = /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|flushing|astoria|long island city)$/i;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";
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

const HELP_URL = api.PREVIEW ? "https://placetta.vercel.app/help/#sign-in" : "/help/#sign-in";
const openDoc = (id: string) => window.dispatchEvent(new CustomEvent("placetta:doc", { detail: id }));

/* Region: where the account and its data live. One region today; the others show as not available yet. */
function RegionPick({ lang }: { lang: Lang }) {
  const L = (x: Bi) => x[lang];
  const [open, setOpen] = useState(false);
  const regions: { id: string; code: string; label: Bi; on: boolean }[] = [
    { id: "us", code: "US", label: B("United States", "美国"), on: true },
    { id: "eu", code: "EU", label: B("Europe", "欧洲"), on: false },
    { id: "ap", code: "APAC", label: B("Asia Pacific", "亚太"), on: false },
    { id: "au", code: "AU", label: B("Australia", "澳大利亚"), on: false },
  ];
  const cur = regions.find(r => r.id === api.REGION.id) ?? regions[0];
  const globe = <svg className="rg-globe" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18"/></svg>;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".region")) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="region">
      <button type="button" className="region-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`${L(B("Region", "区域"))}: ${L(cur.label)}`} onClick={() => setOpen(o => !o)}>
        <span className="rg-k">{L(B("Region", "区域"))}</span>
        <b>{cur.code}</b>
        <svg className="rg-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </button>
      {open && (
        <ul className="region-menu" role="listbox" aria-label={L(B("Region", "区域"))}>
          {regions.map(r => (
            <li key={r.id} role="option" aria-selected={r.id === cur.id} aria-disabled={!r.on}>
              <button type="button" disabled={!r.on} title={r.on ? L(r.label) : `${L(r.label)}: ${L(B("not available yet", "暂未开放"))}`} onClick={() => setOpen(false)}>
                {globe}<span>{r.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignIn({ lang }: { lang: Lang }) {
  const L = (x: Bi) => x[lang];
  const [hand] = useState(readHandoff);
  const [email, setEmail] = useState(hand?.email ?? "");
  const [step, setStep] = useState<"email" | "password" | "code" | "confirm">("email");
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(() => new URLSearchParams(location.search).get("error_description") ?? "");
  const [noAccount, setNoAccount] = useState(false);
  const [providers, setProviders] = useState<Record<api.Provider, boolean>>({ google: false, azure: false });
  useEffect(() => {
    void api.authProviders().then(setProviders);
    if (new URLSearchParams(location.search).get("error")) history.replaceState(null, "", location.pathname + location.hash);
  }, []);
  const withProvider = async (p: api.Provider) => {
    setBusy(true); setErr("");
    try { await api.signInWith(p); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const okEmail = () => /\S+@\S+\.\S+/.test(email.trim());
  const next = () => {
    if (!okEmail()) { setErr(L(B("Enter your work email.", "请输入工作邮箱。"))); return; }
    setErr(""); setNoAccount(false); setPw(""); setStep("password");
  };
  const mailErr = (e: api.ApiError) => e.code === "rate_limited"
    ? L(B("Too many emails were sent just now. Sign in with a password, or try again in an hour.", "刚刚发送的邮件太多。请用密码登录，或一小时后再试。"))
    : /invalid/i.test(e.message) ? L(B("We can't email this address yet. Sign in with a password instead.", "暂时无法向该邮箱发送邮件，请改用密码登录。")) : e.message;
  const submitPw = async () => {
    if (mode === "create" && pw.length < 8) { setErr(L(B("Use at least 8 characters.", "密码至少 8 位。"))); return; }
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
  const verify = async () => {
    setBusy(true); setErr("");
    try { await api.verifyCode(email.trim(), code.trim()); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  const title = step === "code" ? L(B("Check your email.", "请查收邮件。"))
    : step === "confirm" ? L(B("Confirm your email.", "请确认邮箱。"))
    : step === "password" ? (mode === "create" ? L(B("Create your password.", "设置密码。")) : L(B("Enter your password.", "输入密码。")))
    : hand ? L(B("Your license plan is one step away.", "您的执照计划只差一步。")) : L(B("Sign in to Placetta.", "登录快哉。"));
  const sub = step === "code" ? L(B(`We sent a sign-in link to ${email}. Open it on this device, or enter the code from the email.`, `登录链接已发送至 ${email}。请在此设备上打开，或输入邮件中的验证码。`))
    : step === "confirm" ? L(B(`We sent a confirmation link to ${email}. Open it, then sign in with your password.`, `确认链接已发送至 ${email}。打开链接后，用密码登录。`))
    : step === "password" ? null
    : hand ? L(B("Confirm your email and Placetta starts mapping every license your store needs.", "确认邮箱后，快哉就开始梳理门店所需的全部执照。"))
    : L(B("New or invited? Sign in with your work email.", "新用户或受邀成员，请用工作邮箱登录。"));
  return (
    <div className="gate-card">
      <div className="gate-bot"><AgentBot size={84} /></div>
      <RegionPick lang={lang} />
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
        <form onSubmit={e => { e.preventDefault(); next(); }}>
          <label className="sr" htmlFor="gate-email">{L(B("Email", "邮箱"))}</label>
          <input id="gate-email" type="email" autoComplete="username" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={L(B("you@company.com", "you@company.com"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy}>{L(B("Continue", "继续"))}</button>
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
          <button type="submit" className="sbtn ink wide" disabled={busy}>{busy ? "…" : mode === "create" ? L(B("Create account", "创建账户")) : L(B("Sign in", "登录"))}</button>
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
      {step === "confirm" && <button type="button" className="sbtn line wide" onClick={() => { setMode("signin"); setStep("password"); setPw(""); }}>{L(B("I've confirmed, sign in", "已确认，去登录"))}</button>}
      {err && <p className="gate-err" role="alert">{err}</p>}
      {(step === "email" || step === "password") && (
        <div className="gate-legal">
          <p>{L(B("By proceeding, you affirm your understanding and acceptance of our ", "继续即表示您已理解并接受我们的"))}<button type="button" className="lnk" onClick={() => openDoc("privacy")}>{L(B("Privacy Policy", "隐私政策"))}</button>{L(B(", which sets out the rules and expectations governing your use of our services.", "，其中规定了您使用我们服务时适用的规则与要求。"))}</p>
          <a href={HELP_URL} target={api.PREVIEW ? "_blank" : undefined} rel="noopener">{L(B("Need help signing in?", "登录遇到问题？"))}</a>
        </div>
      )}
      {api.PREVIEW && <p className="gate-preview">{step === "code"
        ? L(B("No email is sent here. The code is 123456.", "这里不会发送邮件，验证码是 123456。"))
        : L(B("Accounts here are kept in this browser. Any email and password work; an @placetta.com email signs you in as the Placetta filing team.", "这里的账户保存在此浏览器中。任意邮箱和密码都可以；使用 @placetta.com 邮箱会以快哉申报团队身份登录。"))}</p>}
    </div>
  );
}

/* Onboarding in four quick answers: the name, what it sells (tap a chip), where (one "City, state" field with suggestions)
   and when (tap a chip). Legal entity and street are optional and tucked away. Agreeing and creating is one click. */
const SELLS: { en: string; zh: string }[] = [
  { en: "Milk tea", zh: "奶茶" }, { en: "Coffee", zh: "咖啡" }, { en: "Bakery and desserts", zh: "烘焙甜品" },
  { en: "Restaurant", zh: "餐厅" }, { en: "Grocery", zh: "超市" }, { en: "Retail", zh: "零售" },
  { en: "Importer or online seller", zh: "进口商或电商卖家" }, { en: "Warehouse or 3PL", zh: "仓库或第三方物流" },
];
const WHEN: { en: string; zh: string; months: number | null }[] = [
  { en: "Within 3 months", zh: "3 个月内", months: 3 }, { en: "In 3 to 6 months", zh: "3 到 6 个月", months: 6 },
  { en: "In 6 to 12 months", zh: "6 到 12 个月", months: 12 }, { en: "Already open", zh: "已开业", months: 0 }, { en: "Not sure yet", zh: "还不确定", months: null },
];
const CITIES = ["New York, NY", "Flushing, NY", "Brooklyn, NY", "Manhattan, NY", "Queens, NY", "Jersey City, NJ", "Edison, NJ", "Boston, MA", "Philadelphia, PA",
  "Washington, DC", "Chicago, IL", "Houston, TX", "Dallas, TX", "Austin, TX", "Atlanta, GA", "Miami, FL", "Orlando, FL", "Seattle, WA", "Bellevue, WA", "Portland, OR",
  "San Francisco, CA", "San Jose, CA", "Oakland, CA", "Cupertino, CA", "Fremont, CA", "Los Angeles, CA", "Arcadia, CA", "Irvine, CA", "San Gabriel, CA", "San Diego, CA",
  "Las Vegas, NV", "Phoenix, AZ", "Denver, CO", "Minneapolis, MN", "Detroit, MI", "Columbus, OH", "Honolulu, HI"];

/** "Flushing, NY" or "Flushing, New York" -> city and two-letter state. */
function parsePlace(v: string): { city: string; state: string } | null {
  const m = /^\s*([^,]+?)\s*,\s*([A-Za-z .]+?)\s*$/.exec(v);
  if (!m) return null;
  const st = m[2].trim().toLowerCase().replace(/\./g, "");
  const hit = STATES.find(([c, n]) => c.toLowerCase() === st || n.toLowerCase() === st);
  return hit ? { city: m[1].trim(), state: hit[0] } : null;
}

function Onboard({ lang, email, onCreated, onCancel }: { lang: Lang; email: string; onCreated: (id: string) => void; onCancel?: () => void }) {
  const L = (x: Bi) => x[lang];
  // answers from the website's questionnaire, if they came that way
  const [hand] = useState(readHandoff);
  const [f, setF] = useState({ brand: hand?.brand ?? "", sell: hand?.sell ?? "", other: hand?.other ?? "", place: hand?.place ?? "", state: "", when: hand?.when ?? -1, entity: "", street: "", more: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  const parsed = parsePlace(f.place);
  const needState = !!f.place.trim() && !parsed && !f.place.includes(",");
  const what = f.sell === "other" ? f.other.trim() : SELLS.find(x => x.en === f.sell)?.[lang === "zh" ? "zh" : "en"] ?? "";
  const create = async () => {
    const city = parsed?.city ?? f.place.replace(/,.*$/, "").trim();
    const state = parsed?.state ?? f.state;
    if (!f.brand.trim()) { setErr(L(B("Add the business name.", "请填写企业名称。"))); return; }
    if (!what) { setErr(L(B("Pick what the store sells.", "请选择门店经营内容。"))); return; }
    if (!city || !state) { setErr(L(B("Add the city and state, like Flushing, NY.", "请填写城市和州，例如 Flushing, NY。"))); return; }
    setBusy(true); setErr("");
    const st = STATES.find(s => s[0] === state)?.[1] ?? state, nyc = state === "NY" && NYC.test(city);
    const w = WHEN[f.when];
    const month = w && w.months ? new Date(Date.now() + w.months * 30.4 * 864e5) : null;
    const monthIso = month ? month.toISOString().slice(0, 7) : "";
    const monthEn = month ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
    const monthZh = month ? `${month.getFullYear()} 年 ${month.getMonth() + 1} 月` : "";
    const open = w?.months === 0;
    const store: Store = {
      id: slug(city), name: same(f.street.trim() ? `${city}, ${f.street.trim()}` : city), address: [f.street.trim(), city, state].filter(Boolean).join(", "),
      stage: open ? "open" : "opening", plannedOpen: monthIso ? monthIso + "-15" : undefined, rules: nyc ? ["nyc_grades", "nyc_fww"] : [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [],
    };
    const ws: Workspace = normalize(f.brand.trim(), {
      business: same(f.brand.trim()), goal: month ? B(`Open by ${monthEn}`, `${monthZh}开业`) : same(""),
      locations: [{ id: slug(city), name: same(city), county: same(st), state: "active" }],
      facts: [
        ...(f.entity.trim() ? [{ id: "f-entity", group: "business" as const, label: B("Legal entity", "法律实体"), value: same(f.entity.trim()), source: B("You told me", "您告诉我的") }] : []),
        { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: same(what), source: B("You told me", "您告诉我的") },
        { id: "f-addr", group: "location", label: B("Storefront", "门店"), value: same(store.address), source: B("You told me", "您告诉我的") },
        ...(month ? [{ id: "f-open", group: "location" as const, label: B("Target opening", "目标开业"), value: B(monthEn, monthZh), source: B("You told me", "您告诉我的") }] : []),
        { id: "f-appr", group: "rules", label: B("Needs your approval", "需要您批准"), value: B("Every filing, payment and message", "每一次提交、付款和消息"), source: B("Always on", "始终开启"), locked: true },
      ],
      stores: [store],
      meta: { city, region: st, what, entity: f.entity.trim() || undefined },
    });
    try { const id = await api.createWorkspace(f.brand.trim(), ws); if (hand) consumeHandoff(); onCreated(id); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <div className="gate-card wide">
      <h1>{L(B("Tell us about the business.", "介绍一下您的企业。"))}</h1>
      <p className="gate-sub">{L(B(`Four quick answers and Placetta maps every license and registration your first location needs. Signed in as ${email}.`, `回答四个问题，快哉就会梳理第一个营业地点所需的全部执照与登记。已登录 ${email}。`))}</p>
      <form className="onb" onSubmit={e => { e.preventDefault(); void create(); }}>
        <label className="q">
          <span>{L(B("Business name", "企业名称"))}</span>
          <input id="onb-brand" value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} placeholder="Moonleaf Tea" autoComplete="organization" autoFocus />
        </label>

        <fieldset className="q">
          <legend>{L(B("What does the business do?", "企业做什么业务？"))}</legend>
          <div className="chips" role="radiogroup">
            {SELLS.map(x => <button key={x.en} type="button" role="radio" aria-checked={f.sell === x.en} className="chip" onClick={() => setF({ ...f, sell: x.en })}>{L(x)}</button>)}
            <button type="button" role="radio" aria-checked={f.sell === "other"} className="chip" onClick={() => setF({ ...f, sell: "other" })}>{L(B("Something else", "其他"))}</button>
          </div>
          {f.sell === "other" && <input id="onb-other" value={f.other} onChange={e => setF({ ...f, other: e.target.value })} placeholder={L(B("e.g. Hot pot and bubble tea", "例如：火锅和珍珠奶茶"))} aria-label={L(B("What the store sells", "门店经营内容"))} autoFocus />}
        </fieldset>

        <label className="q">
          <span>{L(B("Where is the first location?", "第一个营业地点在哪里？"))}</span>
          <input id="onb-place" list="onb-cities" value={f.place} onChange={e => setF({ ...f, place: e.target.value })} placeholder="Flushing, NY" autoComplete="address-level2" />
          <datalist id="onb-cities">{CITIES.map(c => <option key={c} value={c} />)}</datalist>
          {needState && (
            <select id="onb-state" value={f.state} onChange={e => setF({ ...f, state: e.target.value })} aria-label={L(B("State", "州"))}>
              <option value="">{L(B("Which state?", "哪个州？"))}</option>
              {STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          )}
        </label>

        <fieldset className="q">
          <legend>{L(B("When do you want to open?", "计划什么时候开业？"))}</legend>
          <div className="chips" role="radiogroup">
            {WHEN.map((x, i) => <button key={x.en} type="button" role="radio" aria-checked={f.when === i} className="chip" onClick={() => setF({ ...f, when: i })}>{L(x)}</button>)}
          </div>
        </fieldset>

        {f.more ? (
          <div className="q two">
            <label><span>{L(B("Legal entity, if formed", "法律实体（如已成立）"))}</span><input id="onb-entity" value={f.entity} onChange={e => setF({ ...f, entity: e.target.value })} placeholder="Moonleaf Tea LLC" /></label>
            <label><span>{L(B("Street address", "街道地址"))}</span><input id="onb-street" value={f.street} onChange={e => setF({ ...f, street: e.target.value })} placeholder="38 Main St" autoComplete="address-line1" /></label>
          </div>
        ) : (
          <button type="button" className="lnk more" onClick={() => setF({ ...f, more: true })}>{L(B("Add the legal entity or street address (optional)", "添加法律实体或街道地址（选填）"))}</button>
        )}

        <p className="onb-legal">{L(B("By creating the workspace, you authorize Placetta to prepare applications for this business and to submit the ones you approve, as its authorized agent for that limited purpose. You confirm you have authority to act for the business and agree to the ", "创建工作区即表示您授权快哉为本企业准备申请，并作为该有限目的的授权代理人提交您批准的申请。您确认有权代表本企业行事，并同意"))}
          <button type="button" className="lnk" onClick={() => setDoc("authorization")}>{L(B("Filing Authorization", "申报授权书"))}</button>{L(B(", ", "、"))}
          <button type="button" className="lnk" onClick={() => setDoc("terms")}>{L(B("Terms", "服务条款"))}</button>{L(B(" and ", "和"))}
          <button type="button" className="lnk" onClick={() => setDoc("privacy")}>{L(B("Privacy Policy", "隐私政策"))}</button>{L(B(".", "。"))}</p>
        <div className="onb-act">
          {onCancel && <button type="button" className="sbtn quiet" onClick={onCancel}>{L(B("Cancel", "取消"))}</button>}
          <button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : L(B("Agree and create workspace", "同意并创建工作区"))}</button>
        </div>
      </form>
      {err && <p className="gate-err" role="alert">{err}</p>}
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

type Phase = { k: "loading" } | { k: "signin" } | { k: "twostep"; factorId: string } | { k: "onboard"; email: string; back?: string } | { k: "app"; s: CloudSession } | { k: "error"; msg: string };

export function CloudRoot() {
  const [lang, setLangState] = useState<Lang>(() => readHandoff()?.lang ?? readLang());
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("placetta-lang", l); localStorage.setItem("placetta-agent-lang", l); } catch { /* blocked */ } };
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const booted = useRef(false);
  const L = (x: Bi) => x[lang];

  const open = useCallback(async (wsId: string, notice?: string) => {
    setPhase({ k: "loading" });
    try {
      const two = await api.twoStepStatus();
      if (two.next === "aal2" && two.current !== "aal2" && two.factorId) { setPhase({ k: "twostep", factorId: two.factorId }); return; }
      const joined = await api.acceptInvites().catch(() => 0);
      const me = await api.whoami();
      let rows = await api.myWorkspaces();
      // The Placetta team works from the filing queue; give them a workspace of their own to open it from.
      if (!rows.length && me.staff_email) { await api.createWorkspace("Placetta team", normalize("Placetta team", {})); rows = await api.myWorkspaces(); }
      const row = rows.find(r => r.id === wsId) ?? rows[0];
      if (!row) { setPhase({ k: "onboard", email: me.email }); return; }
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
      if ([...params.keys()].length) history.replaceState(null, "", location.pathname + location.hash);
      const [audit, billing, filings, docs, integrations, logins] = await Promise.all([
        api.listAudit(row.id), api.getBilling(row.id), api.listFilings(row.id), api.listDocs(row.id), api.listIntegrations(row.id), api.listLogins(row.id),
      ]);
      setPhase({ k: "app", s: {
        me, role: row.role, wsId: row.id, initial: normalize(row.name, row.state), audit, billing, filings, docs, integrations, logins,
        workspaces: rows.map(r => ({ id: r.id, name: r.name })), notice,
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
  }, [lang]);

  useEffect(() => {
    const boot = () => { if (booted.current) return; booted.current = true; void open(lastWs.get()); };
    void api.getSession().then(s => (s ? boot() : setPhase({ k: "signin" })));
    const sub = api.onAuth(s => { if (s) boot(); else { booted.current = false; setPhase({ k: "signin" }); } });
    return () => sub.unsubscribe();
  }, [open]);

  if (phase.k === "app") return <App key={phase.s.wsId} cloud={phase.s} />;
  return (
    <Frame lang={lang} setLang={setLang}>
      {phase.k === "loading" && <div className="gate-card"><div className="gate-bot"><AgentBot size={84} busy /></div><p className="gate-sub">{L(B("Opening your workspace…", "正在打开工作区…"))}</p></div>}
      {phase.k === "signin" && <SignIn lang={lang} />}
      {phase.k === "twostep" && <TwoStepCode lang={lang} factorId={phase.factorId} onDone={() => void open(lastWs.get())} onSignOut={() => { void api.signOut().then(() => setPhase({ k: "signin" })); }} />}
      {phase.k === "onboard" && <Onboard lang={lang} email={phase.email} onCreated={id => void open(id)} onCancel={phase.back ? () => void open(phase.back!) : undefined} />}
      {phase.k === "error" && <div className="gate-card"><h1>{L(B("Something went wrong.", "出了点问题。"))}</h1><p className="gate-sub">{phase.msg}</p><button type="button" className="sbtn ink" onClick={() => void open(lastWs.get())}>{L(B("Try again", "重试"))}</button></div>}
    </Frame>
  );
}
