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

/* Signed-in Placetta: sign in with an email link or code, create the business (with the filing authorization),
   then the workspace itself. Workspaces, files and the audit trail live in the account. */

const STATES: [string, string][] = [["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"]];
const NYC = /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|flushing|astoria|long island city)$/i;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "store";
const readLang = (): Lang => { try { const v = localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* blocked */ } return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en"; };
const lastWs = { get: () => { try { return localStorage.getItem("placetta-ws") ?? ""; } catch { return ""; } }, set: (v: string) => { try { localStorage.setItem("placetta-ws", v); } catch { /* blocked */ } } };

function Frame({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: React.ReactNode }) {
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  return (
    <div className="gate">
      <header className="gate-top">
        <Logo lang={lang} height={18} />
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

function SignIn({ lang }: { lang: Lang }) {
  const L = (x: Bi) => x[lang];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setErr(L(B("Enter your work email.", "请输入工作邮箱。"))); return; }
    setBusy(true); setErr("");
    try { await api.sendSignIn(email.trim()); setSent(true); } catch (e) { setErr((e as api.ApiError).message); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true); setErr("");
    try { await api.verifyCode(email.trim(), code.trim()); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <div className="gate-card">
      <div className="gate-bot"><AgentBot size={84} /></div>
      <h1>{sent ? L(B("Check your email.", "请查收邮件。")) : L(B("Sign in to Placetta.", "登录快哉。"))}</h1>
      <p className="gate-sub">{sent ? L(B(`We sent a sign-in link to ${email}. Open it on this device, or enter the code from the email.`, `登录链接已发送至 ${email}。请在此设备上打开，或输入邮件中的验证码。`)) : L(B("Licenses, permits and daily compliance for every store. New here? The same email creates your account.", "每家门店的执照、许可与日常合规。第一次来？用同一个邮箱即可创建账户。"))}</p>
      {!sent ? (
        <form onSubmit={e => { e.preventDefault(); void send(); }}>
          <label className="sr" htmlFor="gate-email">Email</label>
          <input id="gate-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={L(B("you@company.com", "you@company.com"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy}>{busy ? "…" : L(B("Continue with email", "用邮箱继续"))}</button>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); void verify(); }}>
          <label className="sr" htmlFor="gate-code">Code</label>
          <input id="gate-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder={L(B("6-digit code", "6 位验证码"))} autoFocus />
          <button type="submit" className="sbtn ink wide" disabled={busy || code.length < 6}>{busy ? "…" : L(B("Sign in", "登录"))}</button>
          <button type="button" className="sbtn quiet wide" onClick={() => { setSent(false); setCode(""); }}>{L(B("Use a different email", "换一个邮箱"))}</button>
        </form>
      )}
      {err && <p className="gate-err" role="alert">{err}</p>}
    </div>
  );
}

function Onboard({ lang, email, onCreated, onCancel }: { lang: Lang; email: string; onCreated: (id: string) => void; onCancel?: () => void }) {
  const L = (x: Bi) => x[lang];
  const [f, setF] = useState({ brand: "", entity: "", what: "", street: "", city: "", state: "NY", month: "", agree: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [doc, setDoc] = useState<string | null>(null);
  const d = LEGAL.find(x => x.id === doc);
  const create = async () => {
    if (!f.brand.trim() || !f.city.trim() || !f.what.trim()) { setErr(L(B("Add the business name, what it sells and the city.", "请填写企业名称、经营内容和城市。"))); return; }
    if (!f.agree) { setErr(L(B("Tick the authorization to continue.", "请勾选授权后继续。"))); return; }
    setBusy(true); setErr("");
    const city = f.city.trim(), st = STATES.find(s => s[0] === f.state)?.[1] ?? f.state, nyc = f.state === "NY" && NYC.test(city);
    const month = f.month ? new Date(f.month + "-15T12:00:00") : null;
    const monthEn = month ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "";
    const monthZh = month ? `${month.getFullYear()} 年 ${month.getMonth() + 1} 月` : "";
    const store: Store = {
      id: slug(city), name: same(f.street.trim() ? `${city}, ${f.street.trim()}` : city), address: [f.street.trim(), city, f.state].filter(Boolean).join(", "),
      stage: "opening", plannedOpen: f.month ? f.month + "-15" : undefined, rules: nyc ? ["nyc_grades", "nyc_fww"] : [], logs: [], certs: [], value: { closures: 0, fines: 0, caught: 0 }, apps: [],
    };
    const ws: Workspace = normalize(f.brand.trim(), {
      business: same(f.brand.trim()), goal: month ? B(`Open by ${monthEn}`, `${monthZh}开业`) : same(""),
      locations: [{ id: slug(city), name: same(city), county: same(st), state: "active" }],
      facts: [
        ...(f.entity.trim() ? [{ id: "f-entity", group: "business" as const, label: B("Legal entity", "法律实体"), value: same(f.entity.trim()), source: B("You told me", "您告诉我的") }] : []),
        { id: "f-sell", group: "operations", label: B("What you sell", "销售内容"), value: same(f.what.trim()), source: B("You told me", "您告诉我的") },
        { id: "f-addr", group: "location", label: B("Storefront", "门店"), value: same(store.address), source: B("You told me", "您告诉我的") },
        ...(month ? [{ id: "f-open", group: "location" as const, label: B("Target opening", "目标开业"), value: B(monthEn, monthZh), source: B("You told me", "您告诉我的") }] : []),
        { id: "f-appr", group: "rules", label: B("Needs your approval", "需要您批准"), value: B("Every filing, payment and message", "每一次提交、付款和消息"), source: B("Always on", "始终开启"), locked: true },
      ],
      stores: [store],
      meta: { city, region: st, what: f.what.trim(), entity: f.entity.trim() || undefined },
    });
    try { onCreated(await api.createWorkspace(f.brand.trim(), ws)); } catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <div className="gate-card wide">
      <h1>{L(B("Tell us about the business.", "介绍一下您的企业。"))}</h1>
      <p className="gate-sub">{L(B(`Signed in as ${email}. Placetta uses this to map every license your first store needs.`, `已登录 ${email}。快哉会据此梳理第一家门店所需的全部执照。`))}</p>
      <form className="onb" onSubmit={e => { e.preventDefault(); void create(); }}>
        <label>{L(B("Business or brand", "企业或品牌"))}<input value={f.brand} onChange={e => setF({ ...f, brand: e.target.value })} placeholder="Moonleaf Tea" autoFocus /></label>
        <label>{L(B("Legal entity, if formed", "法律实体（如已成立）"))}<input value={f.entity} onChange={e => setF({ ...f, entity: e.target.value })} placeholder="Moonleaf Tea LLC" /></label>
        <label className="full">{L(B("What the store sells", "门店经营内容"))}<input value={f.what} onChange={e => setF({ ...f, what: e.target.value })} placeholder={L(B("Milk tea and packaged snacks", "奶茶和预包装零食"))} /></label>
        <label className="full">{L(B("Street address, if you have one", "街道地址（如已确定）"))}<input value={f.street} onChange={e => setF({ ...f, street: e.target.value })} placeholder="38 Main St" /></label>
        <label>{L(B("City", "城市"))}<input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} placeholder="Flushing" /></label>
        <label>{L(B("State", "州"))}<select value={f.state} onChange={e => setF({ ...f, state: e.target.value })}>{STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select></label>
        <label>{L(B("Target opening", "目标开业"))}<input type="month" value={f.month} onChange={e => setF({ ...f, month: e.target.value })} /></label>
        <label className="agree full">
          <input type="checkbox" checked={f.agree} onChange={e => setF({ ...f, agree: e.target.checked })} />
          <span>{L(B("I authorize Placetta to prepare applications for this business and to submit the ones I approve, as its authorized agent for that limited purpose. I have authority to act for the business, and I agree to the ", "我授权快哉为本企业准备申请，并作为该有限目的的授权代理人提交我批准的申请。我有权代表本企业行事，并同意"))}
            <button type="button" className="lnk" onClick={() => setDoc("authorization")}>{L(B("Filing Authorization", "申报授权书"))}</button>{L(B(", ", "、"))}
            <button type="button" className="lnk" onClick={() => setDoc("terms")}>{L(B("Terms", "服务条款"))}</button>{L(B(" and ", "和"))}
            <button type="button" className="lnk" onClick={() => setDoc("privacy")}>{L(B("Privacy Policy", "隐私政策"))}</button>{L(B(".", "。"))}</span>
        </label>
        <div className="onb-act full">
          {onCancel && <button type="button" className="sbtn quiet" onClick={onCancel}>{L(B("Cancel", "取消"))}</button>}
          <button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : L(B("Create workspace", "创建工作区"))}</button>
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

type Phase = { k: "loading" } | { k: "signin" } | { k: "onboard"; email: string; back?: string } | { k: "app"; s: CloudSession } | { k: "error"; msg: string };

export function CloudRoot() {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = (l: Lang) => { setLangState(l); try { localStorage.setItem("placetta-agent-lang", l); } catch { /* blocked */ } };
  useEffect(() => { document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"; }, [lang]);
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const booted = useRef(false);
  const L = (x: Bi) => x[lang];

  const open = useCallback(async (wsId: string, notice?: string) => {
    setPhase({ k: "loading" });
    try {
      const me = await api.whoami();
      const rows = await api.myWorkspaces();
      const row = rows.find(r => r.id === wsId) ?? rows[0];
      if (!row) { setPhase({ k: "onboard", email: me.email }); return; }
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
        me, wsId: row.id, initial: normalize(row.name, row.state), audit, billing, filings, docs, integrations, logins,
        workspaces: rows.map(r => ({ id: r.id, name: r.name })), notice,
        switchTo: id => void open(id),
        newWorkspace: () => setPhase({ k: "onboard", email: me.email, back: row.id }),
        signOut: () => { void api.signOut().then(() => setPhase({ k: "signin" })); },
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
      {phase.k === "onboard" && <Onboard lang={lang} email={phase.email} onCreated={id => void open(id)} onCancel={phase.back ? () => void open(phase.back!) : undefined} />}
      {phase.k === "error" && <div className="gate-card"><h1>{L(B("Something went wrong.", "出了点问题。"))}</h1><p className="gate-sub">{phase.msg}</p><button type="button" className="sbtn ink" onClick={() => void open(lastWs.get())}>{L(B("Try again", "重试"))}</button></div>}
    </Frame>
  );
}
