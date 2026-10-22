import { useCallback, useEffect, useState } from "react";
import { B, type Bi } from "./bi";
import type { Lang } from "./i18n";
import * as api from "./cloud/api";
import { hqQuote, inviteLink, type BillTo } from "./hqPlan.ts";
import { consentLine, disclosure } from "./contract.ts";
import { fmtDay } from "./time";
import { I } from "./ui";

/* The brand plan on Headquarters (src/hqPlan.ts): who pays, the price from locations and people, one invite per new
   location, and, when headquarters pays, its checkout. Works for a headquarters account with no workspace, so it reads
   nothing from the app's context. */

export function HqRollout({ lang, say }: { lang: Lang; say: (s: string) => void }) {
  const b = (x: Bi) => x[lang];
  const zh = lang === "zh";
  const [v, setV] = useState<api.HqPlanView | null | undefined>(undefined);
  const [f, setF] = useState<{ brand: string; billTo: BillTo; tier: "essentials" | "pro" }>({ brand: "", billTo: "franchisee", tier: "essentials" });
  const [label, setLabel] = useState("");
  const [made, setMade] = useState<{ label: string; link: string } | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(false);
  const load = useCallback(async () => { try { const x = await api.hqPlanView(); setV(x); if (x?.plan) setF({ brand: x.plan.brand ?? "", billTo: x.plan.bill_to, tier: x.plan.tier }); } catch { setV(null); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (v === undefined || v === null) return null;
  const fail = (e: unknown) => { const er = e as api.ApiError; say((zh && er.message_zh) || er.message || String(e)); };
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { fail(e); } setBusy(false); };
  const plan = v.plan;
  const q = hqQuote({ billTo: f.billTo, tier: f.tier, locations: v.counts.locations, people: v.counts.people });
  const paying = plan?.status === "active" || plan?.status === "trialing" || plan?.status === "past_due";
  const setup = (
    <form className="sg-form hq-plan-form" onSubmit={e => { e.preventDefault(); void run(async () => { setV(await api.hqPlanSet(f.brand, f.billTo, f.tier)); setEdit(false); say(zh ? "品牌方案已保存。" : "Brand plan saved."); }); }}>
      <input value={f.brand} maxLength={120} onChange={e => setF({ ...f, brand: e.target.value })} placeholder={zh ? "品牌名称" : "Brand name"} aria-label={zh ? "品牌名称" : "Brand name"} />
      <span />
      <label className="check"><input type="radio" name="billto" checked={f.billTo === "franchisee"} onChange={() => setF({ ...f, billTo: "franchisee" })} />{b(B("Each franchisee pays for its own stores", "各加盟商为自己的门店付费"))}</label>
      <label className="check"><input type="radio" name="billto" checked={f.billTo === "hq"} onChange={() => setF({ ...f, billTo: "hq" })} />{b(B("Headquarters pays for every location", "总部为所有门店付费"))}</label>
      <label className="check"><input type="radio" name="tier" checked={f.tier === "essentials"} onChange={() => setF({ ...f, tier: "essentials" })} />{b(B("Essentials", "基础版"))}</label>
      <label className="check"><input type="radio" name="tier" checked={f.tier === "pro"} onChange={() => setF({ ...f, tier: "pro" })} />{b(B("Pro", "专业版"))}</label>
      <div className="sg-form-act">{plan && <button type="button" className="sbtn" onClick={() => setEdit(false)}>{zh ? "取消" : "Cancel"}</button>}<button type="submit" className="sbtn ink" disabled={busy}>{zh ? "保存品牌方案" : "Save the brand plan"}</button></div>
    </form>
  );
  return (
    <section className="sec hq-rollout">
      <div className="sec-h"><h2>{b(B("Brand plan and rollout", "品牌方案与推广"))}</h2>
        {plan && !edit && !paying && <button type="button" className="more" onClick={() => setEdit(true)}>{zh ? "修改" : "Change"}</button>}</div>
      <p className="sec-sub">{b(B("Each new location joins with one invite. Headquarters sees every location's status the moment it joins, and never pays to see them.", "每家新门店凭一个邀请即可加入。门店加入后总部立即可见其状态，查看本身永不收费。"))}</p>
      {!plan || edit ? setup : (
        <>
          <ul className="sg-list">
            <li className="sg-row"><span className="sg-tx"><b>{plan.bill_to === "hq" ? b(B("Headquarters pays", "总部付费")) : b(B("Franchisees pay", "加盟商付费"))}{plan.brand ? (zh ? `，${plan.brand}` : `, ${plan.brand}`) : ""}</b>
              <small>{zh ? `${v.counts.locations} 家门店，${v.counts.workspaces} 位加盟商，加盟商团队共 ${v.counts.people} 人` : `${v.counts.locations} location${v.counts.locations === 1 ? "" : "s"} across ${v.counts.workspaces} franchisee${v.counts.workspaces === 1 ? "" : "s"}, ${v.counts.people} ${v.counts.people === 1 ? "person" : "people"} on their teams`}</small>
              {q.lines.map((l, i) => <small key={i}>{b(l)}</small>)}
              {plan.bill_to === "hq" && q.yearUsd > 0 && <small><b>{zh ? `合计每年 $${q.yearUsd.toLocaleString("en-US")}` : `$${q.yearUsd.toLocaleString("en-US")} a year in all`}</b></small>}
              {paying && plan.period_end && <em>{zh ? `已付费，${fmtDay(plan.period_end, lang, true)} 续费` : `Paid, renews ${fmtDay(plan.period_end, lang, true)}`}</em>}</span></li>
          </ul>
          {plan.bill_to === "hq" && !paying && q.locations > 0 && (
            <div className="sg-form">
              <p className="sg-note">{b(disclosure({ years: 1, tier: plan.tier, locations: q.locations }))}</p>
              <label className="check"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />{b(consentLine)}</label>
              <div className="sg-form-act"><button type="button" className="sbtn ink" disabled={busy || !agreed} onClick={() => void run(async () => { location.href = (await api.hqCheckout()).url; })}>{zh ? "为品牌付费" : "Pay for the brand"}</button></div>
            </div>
          )}
          {plan.bill_to === "hq" && paying && <div className="sg-act"><button type="button" className="sbtn quiet" disabled={busy} onClick={() => void run(async () => { await api.hqSync(); await load(); say(zh ? "门店数量已更新。" : "Location count updated."); })}>{zh ? "更新门店数量" : "Update the location count"}</button></div>}
          <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void run(async () => { const code = await api.hqInviteCreate(label); setMade({ label, link: inviteLink(location.origin, code) }); setLabel(""); await load(); }); }}>
            <input value={label} maxLength={120} onChange={e => setLabel(e.target.value)} placeholder={zh ? "新门店（如：奥斯汀 2 号店）" : "New location (Austin store 2)"} aria-label={zh ? "新门店名称" : "New location"} />
            <button type="submit" className="sbtn ink" disabled={busy}>{zh ? "生成邀请" : "Create an invite"}</button>
          </form>
          {made && (
            <div className="sg-form">
              <p className="sg-note">{b(B("Send this link to the location's owner. It works once, for 30 days, and is shown only now.", "把此链接发给该门店的所有者。仅可使用一次，30 天内有效，且只在此刻显示。"))}</p>
              <code className="hq-link">{made.link}</code>
              <div className="sg-form-act"><button type="button" className="sbtn" onClick={() => { void navigator.clipboard?.writeText(made.link).then(() => say(zh ? "已复制" : "Copied")); }}><I.copy />{zh ? "复制链接" : "Copy the link"}</button></div>
            </div>
          )}
          {v.invites.length > 0 && (
            <ul className="sg-list">{v.invites.slice(0, 20).map(i => (
              <li key={i.id} className="sg-row"><span className="sg-tx"><b>{i.label || (zh ? "邀请" : "Invite")}</b>
                <small>{i.used_at ? (zh ? `${i.workspace ?? "门店"}已于 ${fmtDay(i.used_at, lang, true)} 加入` : `${i.workspace ?? "A location"} joined ${fmtDay(i.used_at, lang, true)}`) : i.revoked ? (zh ? "已撤销" : "Revoked") : (zh ? `有效期至 ${fmtDay(i.expires_at, lang, true)}` : `Open until ${fmtDay(i.expires_at, lang, true)}`)}</small></span>
                {!i.used_at && !i.revoked && <span className="sg-r"><button type="button" className="sbtn quiet" disabled={busy} onClick={() => void run(async () => { await api.hqInviteRevoke(i.id); await load(); })}>{zh ? "撤销" : "Revoke"}</button></span>}</li>))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
