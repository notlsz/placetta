import { useCallback, useEffect, useState } from "react";
import { B, type Bi } from "./bi";
import type { Lang } from "./i18n";
import { Logo } from "./Logo";
import { fmtDay } from "./time";
import { I } from "./ui";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import * as pa from "./cloud/partnersApi";
import { clearTouch, readTouch } from "./referral";
import "./ode.css";

/* Partners: franchisors, master franchisees, commercial real-estate brokers, landlords, investors and accountants who
   bring Chinese brands to the US. A partner signs up here, the Placetta team approves them, and they share a link or
   put Placetta's plan box on their own site. Businesses that come through them say, once, whether the partner may see
   their progress: business name, stage, permits approved out of the total, opening date. Nothing else.
   The page works inside the app (a nav entry) and on its own, for a partner with no workspace. */

export const KIND: Record<pa.PartnerKind, Bi> = {
  franchisor: B("Franchisor", "特许经营品牌方"), master_franchisee: B("Master franchisee", "区域总代理"),
  broker: B("Commercial real-estate broker", "商业地产经纪"), landlord: B("Landlord", "业主"),
  investor: B("Investor", "投资人"), accountant: B("Accountant", "会计师"), other: B("Other", "其他"),
};
const KINDS = Object.keys(KIND) as pa.PartnerKind[];
const BASE = api.LEGAL_BASE.replace(/\/+$/, "");
const usd = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const copy = (t: string) => { void navigator.clipboard?.writeText(t).catch(() => undefined); };

/* ------------------------------ the sample, for the demo workspace ------------------------------ */

const SAMPLE: { me: pa.PartnerMe; dash: pa.PartnerDashboard; refs: pa.ReferralLine[]; keys: pa.ApiKeyRow[] } = (() => {
  const me: pa.PartnerMe = { id: "sample", org_name: "Bay Bridge Realty", kind: "broker", contact_name: "Ann Lee", website: "https://baybridge.example", status: "approved",
    code: "BAYB2345", share_pct: 10, share_months: 12, created_at: "2026-08-02T16:00:00Z", approved_at: "2026-08-04T17:30:00Z" };
  return {
    me,
    dash: { partner: me, referred: 4, sharing: 3, earned_usd: 179.4, paid_usd: 59.8, owed_usd: 59.8,
      months: [{ month: "2026-10-01", paying: 3, share_usd: 59.8, closed: false }, { month: "2026-09-01", paying: 3, share_usd: 59.8, closed: true }, { month: "2026-08-01", paying: 2, share_usd: 59.8, closed: true }],
      payouts: [{ amount_usd: 59.8, paid_on: "2026-09-05", reference: "ACH 1029" }] },
    refs: [
      { id: "r1", attributed_at: "2026-08-11T10:00:00Z", business_name: "Lucky Leaf Tea", stage: "opening", permits_done: 5, permits_total: 9, opening_date: "2027-01-15", progress_at: "2026-10-16T22:10:00Z" },
      { id: "r2", attributed_at: "2026-08-20T10:00:00Z", business_name: "Golden Ox Hot Pot", stage: "opening", permits_done: 2, permits_total: 11, opening_date: "2027-03-01", progress_at: "2026-10-15T18:40:00Z" },
      { id: "r3", attributed_at: "2026-09-02T10:00:00Z", business_name: "Moon Cake House", stage: "open", permits_done: 8, permits_total: 8, opening_date: "2026-09-28", progress_at: "2026-10-12T15:00:00Z" },
    ],
    keys: [{ id: "k1", label: "Our CRM", prefix: "0a1b2c3d", created_at: "2026-09-10T16:00:00Z", last_used_at: "2026-10-16T09:00:00Z", revoked_at: null }],
  };
})();

/* ------------------------------ signing up ------------------------------ */

function Apply({ lang, me, onDone }: { lang: Lang; me: pa.PartnerMe | null; onDone: () => void }) {
  const L = (x: Bi) => x[lang];
  const [f, setF] = useState({ org: me?.org_name ?? "", kind: (me?.kind ?? "") as pa.PartnerKind | "", contact: me?.contact_name ?? "", website: me?.website ?? "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (!f.org.trim()) { setErr(L(B("Add your organization's name.", "请填写机构名称。"))); return; }
    if (!f.kind) { setErr(L(B("Pick what kind of partner you are.", "请选择合作伙伴类型。"))); return; }
    setBusy(true); setErr("");
    try { await pa.partnerApply({ org: f.org.trim(), kind: f.kind, contact: f.contact.trim(), website: f.website.trim(), note: f.note.trim() }); onDone(); }
    catch (e) { setErr((e as api.ApiError).message); setBusy(false); }
  };
  return (
    <section className="pt-card">
      <h2>{L(B("Become a Placetta partner", "成为快哉合作伙伴"))}</h2>
      <p className="pt-sub">{L(B("For franchisors, brokers, landlords, investors and accountants who bring brands from China to the US. Your clients get their permit plan in minutes; you see how each opening is going, when they agree to share it.",
        "适合把中国品牌带到美国的特许经营品牌方、经纪、业主、投资人和会计师。您的客户几分钟拿到许可计划；在他们同意共享后，您可以看到每家店的开业进展。"))}</p>
      {me?.status === "declined" && <p className="pt-warn">{L(B("Your last application wasn't approved. You can update it and send it again.", "您上次的申请未获批准。可以修改后重新提交。"))}</p>}
      <form className="pt-form" onSubmit={e => { e.preventDefault(); void send(); }}>
        <label><span>{L(B("Organization", "机构名称"))}</span><input value={f.org} onChange={e => setF({ ...f, org: e.target.value })} maxLength={120} autoComplete="organization" placeholder="Bay Bridge Realty" /></label>
        <fieldset><legend>{L(B("What you do", "您的业务"))}</legend>
          <div className="chips" role="radiogroup">{KINDS.map(k => <button key={k} type="button" role="radio" aria-checked={f.kind === k} className="chip" onClick={() => setF({ ...f, kind: k })}>{L(KIND[k])}</button>)}</div>
        </fieldset>
        <div className="pt-two">
          <label><span>{L(B("Your name", "您的姓名"))}</span><input value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} maxLength={120} autoComplete="name" /></label>
          <label><span>{L(B("Website (optional)", "网站（选填）"))}</span><input value={f.website} onChange={e => setF({ ...f, website: e.target.value })} maxLength={300} inputMode="url" placeholder="baybridge.com" /></label>
        </div>
        <label><span>{L(B("How you bring brands to the US (optional)", "您如何把品牌带到美国（选填）"))}</span><textarea rows={3} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} maxLength={1000} /></label>
        <div className="pt-act"><button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : L(B("Send for review", "提交审核"))}</button></div>
      </form>
      {err && <p className="pt-warn" role="alert">{err}</p>}
      <p className="note">{L(B("The Placetta team reviews every partner by hand. The revenue share and its terms are agreed with you in writing before any is paid.", "快哉团队会人工审核每一位合作伙伴。分成比例和条款会在付款前与您书面确认。"))}</p>
    </section>
  );
}

/* ------------------------------ the dashboard ------------------------------ */

function Keys({ lang, sample }: { lang: Lang; sample: boolean }) {
  const L = (x: Bi) => x[lang];
  const [keys, setKeys] = useState<pa.ApiKeyRow[] | null>(sample ? SAMPLE.keys : null);
  const [label, setLabel] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { if (sample) return; try { setKeys(await pa.partnerKeys()); } catch (e) { setErr((e as api.ApiError).message); } }, [sample]);
  useEffect(() => { void load(); }, [load]);
  const make = async () => {
    if (sample) { setErr(L(B("Sample: in a partner account this makes a real key, shown once.", "示例：在合作伙伴账户中会生成真实密钥，只显示一次。"))); return; }
    try { const k = await pa.partnerKeyCreate(label.trim() || "API key"); setFresh(k.key); setLabel(""); await load(); } catch (e) { setErr((e as api.ApiError).message); }
  };
  const revoke = async (k: pa.ApiKeyRow) => {
    if (sample || !window.confirm(L(B(`Revoke ${k.label}? Anything using it stops working.`, `撤销 ${k.label}？使用它的系统将立即失效。`)))) return;
    try { await pa.partnerKeyRevoke(k.id); await load(); } catch (e) { setErr((e as api.ApiError).message); }
  };
  const live = (keys ?? []).filter(k => !k.revoked_at);
  return (
    <section className="sec">
      <div className="sec-h"><h2>{L(B("Partner API", "合作伙伴 API"))}</h2></div>
      <p className="pt-sub">{L(B("Read-only: your sharing referrals' status as JSON, for your own CRM or portal. Placetta keeps only a fingerprint of each key, so a key is shown once.",
        "只读：以 JSON 获取同意共享的客户进展，用于您自己的 CRM 或门户。快哉只保存每个密钥的指纹，所以密钥只显示一次。"))}</p>
      {fresh && (
        <div className="pt-fresh" role="status">
          <b>{L(B("Your new key. Copy it now: it won't be shown again.", "新密钥。请立即复制，之后不会再显示。"))}</b>
          <code>{fresh}</code>
          <div className="pt-act"><button type="button" className="sbtn line" onClick={() => copy(fresh)}><I.copy />{L(B("Copy", "复制"))}</button><button type="button" className="sbtn quiet" onClick={() => setFresh(null)}>{L(B("Done", "完成"))}</button></div>
        </div>
      )}
      {live.length > 0 && (
        <ul className="pt-keys">{live.map(k => (
          <li key={k.id}><span><b>{k.label}</b><small>plk_{k.prefix}_…{lang === "zh" ? `，${fmtDay(k.created_at, lang, true)} 创建` : `, made ${fmtDay(k.created_at, lang, true)}`}{k.last_used_at ? (lang === "zh" ? `，最近使用 ${fmtDay(k.last_used_at, lang, true)}` : `, last used ${fmtDay(k.last_used_at, lang, true)}`) : ""}</small></span>
            <button type="button" className="sbtn quiet" onClick={() => void revoke(k)}>{L(B("Revoke", "撤销"))}</button></li>
        ))}</ul>
      )}
      <pre className="sg-code pt-snip">{`curl ${pa.PARTNER_API}/v1/referrals \\\n  -H "Authorization: Bearer plk_…"`}</pre>
      <p className="note">{L(B("Answers with each sharing referral's referral_id, business_name, stage, permits_done, permits_total, opening_date, referred_at and updated_at. Up to 60 requests a minute per key.",
        "返回每家共享商家的 referral_id、business_name、stage、permits_done、permits_total、opening_date、referred_at 和 updated_at。每个密钥每分钟最多 60 次请求。"))}</p>
      <form className="pt-inline" onSubmit={e => { e.preventDefault(); void make(); }}>
        <input value={label} onChange={e => setLabel(e.target.value)} maxLength={60} placeholder={L(B("What it's for, like Our CRM", "用途，例如 我们的 CRM"))} aria-label={L(B("Key name", "密钥名称"))} />
        <button type="submit" className="sbtn ink" disabled={live.length >= 5}><I.key />{L(B("Make a key", "生成密钥"))}</button>
      </form>
      {err && <p className="pt-warn" role="alert">{err}</p>}
    </section>
  );
}

function Dashboard({ lang, me, sample }: { lang: Lang; me: pa.PartnerMe; sample: boolean }) {
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const [dash, setDash] = useState<pa.PartnerDashboard | null>(sample ? SAMPLE.dash : null);
  const [refs, setRefs] = useState<pa.ReferralLine[] | null>(sample ? SAMPLE.refs : null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (sample) return;
    void pa.partnerDashboard().then(setDash).catch(e => setErr((e as api.ApiError).message));
    void pa.partnerReferrals().then(setRefs).catch(() => setRefs([]));
  }, [sample]);
  const code = me.code ?? "";
  const siteLink = `${BASE}/?ref=${code}`, appLink = `${BASE}/app/?ref=${code}`;
  const snippet = `<div data-placetta-plan></div>\n<script src="${BASE}/embed.js" data-ref="${code}" async></script>`;
  const doCopy = (t: string, k: string) => { copy(t); setCopied(k); setTimeout(() => setCopied(""), 1800); };
  const hidden = Math.max(0, (dash?.referred ?? 0) - (refs?.length ?? 0));
  return (<>
    <dl className="hq-tot pt-tot">
      <div><dt>{L(B("Businesses referred", "推荐的商家"))}</dt><dd>{dash?.referred ?? "-"}</dd></div>
      <div><dt>{L(B("Sharing progress", "共享进展"))}</dt><dd>{dash?.sharing ?? "-"}</dd></div>
      <div><dt>{L(B("Share earned", "已获分成"))}</dt><dd>{dash ? usd(dash.earned_usd) : "-"}</dd></div>
      <div className={dash && dash.owed_usd > 0 ? "warn" : ""}><dt>{L(B("To be paid", "待支付"))}</dt><dd>{dash ? usd(dash.owed_usd) : "-"}</dd><small>{L(B("Closed months, less payouts", "已结月份减去已付"))}</small></div>
    </dl>
    {err && <p className="pt-warn">{err}</p>}

    <section className="sec">
      <div className="sec-h"><h2>{L(B("Your link", "您的推荐链接"))}</h2>{me.status === "paused" && <span className="pt-tag warm">{L(B("Paused", "已暂停"))}</span>}</div>
      <div className="pt-links">
        <div><small>{L(B("Code", "推荐码"))}</small><b className="pt-code">{code}</b></div>
        <div><small>{L(B("Website", "官网"))}</small><code>{siteLink}</code><button type="button" className="sbtn line" onClick={() => doCopy(siteLink, "site")}><I.copy />{copied === "site" ? L(B("Copied", "已复制")) : L(B("Copy", "复制"))}</button></div>
        <div><small>{L(B("Straight to sign-up", "直接注册"))}</small><code>{appLink}</code><button type="button" className="sbtn line" onClick={() => doCopy(appLink, "app")}><I.copy />{copied === "app" ? L(B("Copied", "已复制")) : L(B("Copy", "复制"))}</button></div>
      </div>
      <p className="note">{me.status === "paused" ? L(B("Your code is paused: new sign-ups through it aren't recorded. Businesses already referred keep counting.", "推荐码已暂停：新注册不再记录。已推荐的商家继续计入。"))
        : L(B("A business is yours when it first arrives through your link and signs up within 90 days.", "商家首次通过您的链接到达，并在 90 天内注册，即记为您推荐。"))}</p>
    </section>

    <section className="sec">
      <div className="sec-h"><h2>{L(B("Referred businesses", "推荐的商家"))}{refs?.length ? <em className="pt-n">{refs.length}</em> : null}</h2></div>
      {refs && refs.length === 0 ? (
        <div className="empty"><p>{(dash?.referred ?? 0) > 0 ? L(B("The businesses you referred haven't shared their progress.", "您推荐的商家尚未共享进展。")) : L(B("No businesses yet. Share your link, or put the plan box on your site.", "还没有商家。分享您的链接，或在网站上放置计划框。"))}</p></div>
      ) : (
        <div className="table pt-t" role="table">
          <div className="tr th" role="row"><span>{L(B("Business", "商家"))}</span><span>{L(B("Stage", "阶段"))}</span><span>{L(B("Permits approved", "已批准许可"))}</span><span>{L(B("Opening", "开业"))}</span></div>
          <div className="tray">{(refs ?? []).map(r => {
            const done = r.permits_done ?? 0, total = r.permits_total ?? 0;
            return (
              <div key={r.id} className="tr row" role="row">
                <span className="c-name"><b>{r.business_name}</b><small>{zh ? `${fmtDay(r.attributed_at, lang, true)} 推荐` : `Referred ${fmtDay(r.attributed_at, lang, true)}`}</small></span>
                <span className="c-stage">{r.stage === "open" ? L(B("Open", "已开业")) : L(B("Opening", "筹备中"))}</span>
                <span className="pt-prog"><span className="pt-bar" aria-hidden="true"><i style={{ width: total ? `${Math.round((100 * done) / total)}%` : "0%" }} /></span><small>{zh ? `${done} / ${total} 项` : `${done} of ${total}`}</small></span>
                <span className="c-due">{r.opening_date ? <b>{fmtDay(r.opening_date, lang, true)}</b> : <small>{L(B("Not set", "未定"))}</small>}{r.progress_at && <small>{zh ? `${fmtDay(r.progress_at, lang)} 更新` : `Updated ${fmtDay(r.progress_at, lang)}`}</small>}</span>
              </div>
            );
          })}</div>
        </div>
      )}
      <p className="note">{hidden > 0 ? L(B(`${hidden} more referred business${hidden === 1 ? " chose" : "es chose"} not to share progress. They still count toward your share.`, `另有 ${hidden} 家推荐的商家选择不共享进展，仍计入您的分成。`)) + " " : ""}{L(B("Each business decides what you see: its name, stage, permits approved and opening date. Nothing else, and it can stop sharing any time.", "每家商家自己决定您能看到什么：名称、阶段、已批准许可和开业日期，仅此而已，并可随时停止共享。"))}</p>
    </section>

    <section className="sec">
      <div className="sec-h"><h2>{L(B("Revenue share", "收入分成"))}</h2></div>
      <p className="pt-sub">{me.share_pct == null ? L(B("Not set yet. The Placetta team agrees it with you before any is paid.", "尚未设定。快哉团队会在付款前与您确认。"))
        : L(B(`${me.share_pct}% of what each referred business pays for its plan, for its first ${me.share_months} months. Worked out from billing every day; paid by bank transfer after each month closes.`,
          `每家推荐商家前 ${me.share_months} 个月方案费用的 ${me.share_pct}%。每天根据账单计算；每月结束后通过银行转账支付。`))}</p>
      {dash && dash.months.length > 0 && (
        <table className="pt-months">
          <thead><tr><th>{L(B("Month", "月份"))}</th><th>{L(B("Paying businesses", "付费商家"))}</th><th>{L(B("Your share", "您的分成"))}</th></tr></thead>
          <tbody>{dash.months.map(m => (
            <tr key={m.month}><td>{zh ? `${m.month.slice(0, 4)} 年 ${Number(m.month.slice(5, 7))} 月` : new Date(m.month + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" })}{!m.closed && <small>{L(B(" so far", "（进行中）"))}</small>}</td><td>{m.paying}</td><td>{usd(m.share_usd)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {dash && dash.payouts.length > 0 && (
        <ul className="pt-pay">{dash.payouts.map((p, i) => <li key={i}><span>{zh ? `${fmtDay(p.paid_on, lang, true)} 已付` : `Paid ${fmtDay(p.paid_on, lang, true)}`}{p.reference ? (zh ? `，${p.reference}` : `, ${p.reference}`) : ""}</span><b>{usd(p.amount_usd)}</b></li>)}</ul>
      )}
    </section>

    <section className="sec">
      <div className="sec-h"><h2>{L(B("Put the plan box on your site", "在您的网站放置计划框"))}</h2></div>
      <p className="pt-sub">{L(B("Visitors pick a kind of business and a city and see every permit it needs, in order, with fees, from Placetta's registry. \"Start with Placetta\" carries your code.",
        "访客选择业态和城市，即可看到所需的全部许可（按顺序、含费用），数据来自快哉的登记库。“开始使用快哉”会带上您的推荐码。"))}</p>
      <pre className="sg-code pt-snip"><button type="button" className="lnk" onClick={() => doCopy(snippet, "snip")}>{copied === "snip" ? L(B("Copied", "已复制")) : L(B("Copy", "复制"))}</button>{snippet}</pre>
    </section>

    {me.status === "approved" && <Keys lang={lang} sample={sample} />}
  </>);
}

/** The partner page: sign up, wait for review, or the dashboard. */
export function PartnerPage({ lang, sample = false }: { lang: Lang; sample?: boolean }) {
  const L = (x: Bi) => x[lang];
  const [me, setMe] = useState<pa.PartnerMe | null | undefined>(sample ? SAMPLE.me : undefined);
  const [err, setErr] = useState("");
  const load = useCallback(async () => { if (sample) return; try { setMe(await pa.partnerMe()); } catch (e) { setErr((e as api.ApiError).message); setMe(null); } }, [sample]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div className="page partner">
      <header className="ph"><div className="ph-tx">
        <h1>{me && me.status !== "declined" ? me.org_name : L(B("Partners", "合作伙伴"))}{sample && <span className="pt-tag">{L(B("Sample", "示例"))}</span>}</h1>
        <p>{me?.status === "approved" || me?.status === "paused"
          ? L(B(`${L(KIND[me.kind])}. The businesses you bring to Placetta, how their openings are going when they share it, and your revenue share.`, `${L(KIND[me.kind])}。您带来的商家、他们同意共享的开业进展，以及您的收入分成。`))
          : L(B("Bring brands opening in the US to Placetta: they get every permit planned and filed, and you see how each opening is going.", "把在美国开店的品牌带到快哉：他们的每项许可都有计划、有人办理，您也能看到每家店的进展。"))}</p>
      </div></header>
      {err && <p className="pt-warn">{err}</p>}
      {me === undefined ? <p className="quiet">{L(B("Loading…", "加载中…"))}</p>
        : !me || me.status === "declined" ? <Apply lang={lang} me={me} onDone={() => void load()} />
          : me.status === "pending" ? (
            <section className="pt-card">
              <h2>{L(B("Thanks. Your application is with the Placetta team.", "谢谢。您的申请已提交给快哉团队。"))}</h2>
              <p className="pt-sub">{L(B("We review every partner by hand, usually within two business days. Once you're approved, this page shows your code, your link and the plan box for your site.", "我们人工审核每一位合作伙伴，通常在两个工作日内完成。批准后，这里会显示您的推荐码、链接和网站计划框。"))}</p>
              <dl className="pt-kv"><div><dt>{L(B("Organization", "机构"))}</dt><dd>{me.org_name}</dd></div><div><dt>{L(B("What you do", "业务"))}</dt><dd>{L(KIND[me.kind])}</dd></div><div><dt>{L(B("Sent", "提交时间"))}</dt><dd>{fmtDay(me.created_at, lang, true)}</dd></div></dl>
            </section>
          ) : <Dashboard lang={lang} me={me} sample={sample} />}
    </div>
  );
}

/** The partner page on its own: a partner signed in with no workspace of their own. */
export function PartnerHome({ lang, setLang, email, onNew, onSignOut }: { lang: Lang; setLang: (l: Lang) => void; email: string; onNew: () => void; onSignOut: () => void }) {
  const L = (x: Bi) => x[lang];
  return (
    <div className="hq-home">
      <header className="gate-top">
        <Logo lang={lang} height={18} />
        <div className="hq-home-r">
          <span className="hq-me">{email}</span>
          <div className="lang" role="group" aria-label="Language">
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
          </div>
          <button type="button" className="sbtn quiet" onClick={onSignOut}>{L(B("Sign out", "退出登录"))}</button>
        </div>
      </header>
      <PartnerPage lang={lang} />
      <footer className="hq-home-f">
        <p>{L(B("Opening stores of your own too?", "自己也要开店？"))}</p>
        <button type="button" className="sbtn line" onClick={onNew}>{L(B("Set up your own workspace", "创建自己的工作区"))}</button>
      </footer>
    </div>
  );
}

/** Whether the signed-in person has a partner account (for the nav entry). */
export function usePartnerMe(on: boolean): pa.PartnerMe | null {
  const [me, setMe] = useState<pa.PartnerMe | null>(null);
  useEffect(() => { if (on) void pa.partnerMe().then(setMe).catch(() => setMe(null)); }, [on]);
  return me;
}

/* ------------------------------ the referred business's side ------------------------------ */

/** Onboarding's one question for a business that came through a partner: may the partner see its progress?
    Off unless the person ticks it. Shows nothing when there's no partner link in this browser. */
export function ReferralConsent({ lang, checked, onChange, onPartner }: { lang: Lang; checked: boolean; onChange: (v: boolean) => void; onPartner?: (org: string | null) => void }) {
  const L = (x: Bi) => x[lang];
  const [org, setOrg] = useState<string | null>(null);
  useEffect(() => {
    const t = readTouch();
    if (!t) { onPartner?.(null); return; }
    void pa.partnerLookup(t.code).then(p => { setOrg(p?.org_name ?? null); onPartner?.(p?.org_name ?? null); }).catch(() => onPartner?.(null));
  }, [onPartner]);
  if (!org) return null;
  return (
    <div className={"terms-check pt-consent" + (checked ? " on" : "")}>
      <input id="onb-share" type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <label htmlFor="onb-share">{lang === "zh"
        ? `您是通过 ${org} 来到快哉的。允许 ${org} 查看您的开业进展：企业名称、阶段、已批准许可数和开业日期，仅此而已。可随时在“设置”中停止共享。`
        : `You came to Placetta through ${org}. Let ${org} see your opening progress: business name, stage, permits approved and opening date. Nothing else. You can stop sharing any time in Settings.`}</label>
      <span className="sr">{L(B("Optional", "选填"))}</span>
    </div>
  );
}

/** Settings, Team: who referred this business, and whether they see its progress. Owners turn it on or off. */
export function PartnerSharing() {
  const { lang, cloud, say } = useApp();
  const L = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const [r, setR] = useState<pa.ReferralInfo | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const ws = cloud?.wsId ?? "";
  useEffect(() => { if (ws) void pa.referralFor(ws).then(setR).catch(() => setR(null)); }, [ws]);
  if (!cloud || !r) return null;
  const set = async (v: boolean) => {
    if (!v && !window.confirm(L(B(`Stop sharing your progress with ${r.org_name}? They stop seeing it right away.`, `停止与 ${r.org_name} 共享进展？对方将立即无法查看。`)))) return;
    setBusy(true);
    try { setR(await pa.referralConsentSet(ws, v)); say(v ? L(B(`${r.org_name} can see your progress.`, `${r.org_name} 现在可以查看您的进展。`)) : L(B(`Stopped sharing with ${r.org_name}.`, `已停止与 ${r.org_name} 共享。`))); }
    catch (e) { say((e as api.ApiError).message); }
    setBusy(false);
  };
  return (
    <section className="sg" id="set-partner">
      <h2>{L(B("Partner", "合作伙伴"))}</h2>
      <p className="sg-note">{zh ? `${r.org_name} 把您推荐给了快哉（${fmtDay(r.attributed_at, lang, true)}）。共享时，他们只能看到企业名称、阶段、已批准许可数和开业日期，看不到文件、表格内容、登录信息或对话。`
        : `${r.org_name} referred you to Placetta on ${fmtDay(r.attributed_at, lang, true)}. While you share, they see your business name, stage, permits approved and opening date. Never your documents, form answers, logins or chats.`}</p>
      <ul className="sg-list">
        <li className="sg-row">
          <span className="sg-ico"><I.user /></span>
          <span className="sg-tx"><b>{zh ? `与 ${r.org_name} 共享进展` : `Share progress with ${r.org_name}`}</b><small>{r.consent ? (zh ? `${r.consent_at ? fmtDay(r.consent_at, lang, true) + " 起" : ""}共享中` : `Sharing${r.consent_at ? ` since ${fmtDay(r.consent_at, lang, true)}` : ""}`) : L(B("Not shared", "未共享"))}</small></span>
          <span className="sg-r">{cloud.owner
            ? <button type="button" className={"sbtn " + (r.consent ? "quiet" : "ink")} disabled={busy} onClick={() => void set(!r.consent)}>{r.consent ? L(B("Stop sharing", "停止共享")) : L(B("Share", "共享"))}</button>
            : <small>{L(B("Owners decide", "由所有者决定"))}</small>}</span>
        </li>
      </ul>
    </section>
  );
}

/** After a workspace is created: record the partner this browser came through (first touch, within 90 days) with the
    owner's answer about sharing. Nothing happens without a partner link; a refusal (an old link, their own business)
    is quiet. The touch is used up either way. */
export async function claimReferral(ws: string, consent: boolean) {
  const t = readTouch();
  if (!t) return;
  await pa.referralClaim(ws, t.code, new Date(t.at).toISOString(), consent).catch(() => null);
  clearTouch();
}
