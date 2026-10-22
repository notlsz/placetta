import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import { B } from "./bi";
import * as api from "./cloud/api";
import { Btn, Group } from "./Settings";
import { ARL_SOURCE, commitmentEnd, expansions, NOTICE_MAX, NOTICE_MIN, yearUsd } from "./contract.ts";
import { addLine, MODULES, moduleStates, modulePrice, type Module } from "./modules.ts";
import { allowanceOf, quoteFiling } from "./overage.ts";
import { PROPOSED } from "./pricing.ts";
import { entityDeadlines, obligations, REGISTERED_AGENT, type Entity, type EntityKind } from "./entity.ts";
import { stateCode } from "./counties";
import { daysFromNow, daysUntil, fmtDay } from "./time";
import { RenewalValue, ValueReportSheet } from "./ValueReport";
import { I, Select } from "./ui";

/* Settings for the growth mechanics: the contract (term, auto-renew, the one-click online cancel, the renewal notice,
   what the year delivered), the modules on the plan, the hard monthly cap on filings past the allowance, and the
   legal entities whose annual reports go on the calendar. Owners change them; everyone else reads them. */

/** The billing growth columns and this month's filings, loaded together and reloaded after a change. */
function useGrowth() {
  const { cloud } = useApp();
  const [g, setG] = useState<api.Growth | null>(null);
  const [m, setM] = useState<api.FilingMonth | null>(null);
  const load = useCallback(async () => {
    if (!cloud?.wsId) return;
    const [a, c] = await Promise.all([api.growth(cloud.wsId), api.filingMonth(cloud.wsId)]);
    setG(a); setM(c);
  }, [cloud?.wsId]);
  useEffect(() => { void load(); }, [load]);
  return { g, m, load };
}

const usd = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** The term, auto-renew and its online cancel, and the year in review once the renewal is near. */
export function ContractGroup() {
  const { b, lang, cloud, say } = useApp();
  const { g, load } = useGrowth();
  const [report, setReport] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!cloud) return null;
  const zh = lang === "zh";
  const end = g?.current_period_end ?? cloud.billing?.current_period_end ?? null;
  const subscribed = cloud.billing?.subscription_status === "active" || cloud.billing?.subscription_status === "trialing";
  const left = end ? daysUntil(end.slice(0, 10)) : null;
  const tier = cloud.billing?.subscription_plan === "pro" ? "pro" as const : "essentials" as const;
  const year = yearUsd({ years: 1, tier, locations: Math.max(1, g?.paid_locations ?? 1) });
  const toggle = async (on: boolean) => {
    setBusy(true);
    try { await api.setAutoRenew(cloud.wsId, on); await load(); say(on ? (zh ? "已重新开启自动续费。" : "Auto-renew is back on.") : (zh ? "已取消自动续费。方案在当前期限结束时终止，不会再收费。" : "Auto-renew is off. The plan ends with this term and nothing more is charged.")); }
    catch (e) { const er = e as api.ApiError; say((zh && er.message_zh) || er.message); }
    setBusy(false);
  };
  const rows = !subscribed || !g ? [{ label: B("Contract", "合同"), sub: b(B("Starts with a yearly plan. Terms of one, two or three years, billed once a year.", "开通年度方案后生效。可选一年、两年或三年期，每年计费一次。")) }] : [
    { label: B("Term", "期限"), sub: g.term_years === 1 ? b(B("One year, billed yearly", "一年期，按年计费"))
        : (zh ? `${g.term_years} 年期，每年计费一次${g.term_started ? `，承诺至 ${commitmentEnd(g.term_started, g.term_years)}` : ""}` : `${g.term_years} years, billed once a year${g.term_started ? `, committed through ${commitmentEnd(g.term_started, g.term_years)}` : ""}`) },
    g.auto_renew
      ? { label: B("Renews automatically", "自动续费"), sub: (zh ? `${end ? `${fmtDay(end, lang, true)} 续费，` : ""}约 ${usd(year)}，每年一次。每次续费前 ${NOTICE_MIN} 至 ${NOTICE_MAX} 天，我们会发邮件通知。` : `${end ? `Renews ${fmtDay(end, lang, true)} for about ${usd(year)}` : `About ${usd(year)}`}, once a year. We email you ${NOTICE_MIN} to ${NOTICE_MAX} days before each renewal.`),
        right: cloud.owner ? <Btn guard kind="warm" disabled={busy} onClick={() => void toggle(false)}>{zh ? "取消自动续费" : "Cancel auto-renew"}</Btn> : <em className="lock">{zh ? "由所有者管理" : "Managed by owners"}</em> }
      : { label: B("Auto-renew is off", "自动续费已关闭"), sub: zh ? `方案${end ? `于 ${fmtDay(end, lang, true)} ` : ""}到期后结束，不再收费。` : `The plan ends${end ? ` ${fmtDay(end, lang, true)}` : " with this term"} and nothing more is charged.`,
        right: cloud.owner ? <Btn guard disabled={busy} onClick={() => void toggle(true)}>{zh ? "重新开启" : "Turn back on"}</Btn> : undefined },
  ];
  return (
    <Group id="contract" title={B("Contract and renewal", "合同与续费")} note={B("Cancel online any time, in one click, without calling anyone. Renewal terms follow California's Automatic Renewal Law for every customer.", "可随时在线取消，点一下即可，无需致电。续费条款对所有客户均遵循加州自动续费法。")} rows={rows}>
      {subscribed && left != null && left >= 0 && left <= NOTICE_MAX && <RenewalValue onOpen={() => setReport(true)} />}
      <p className="sg-note">{zh ? "依据：" : "Source: "}<a href={ARL_SOURCE.url} target="_blank" rel="noreferrer">{ARL_SOURCE.cite}</a>{zh ? `，${ARL_SOURCE.read} 查阅` : `, read ${ARL_SOURCE.read}`}</p>
      {report && <ValueReportSheet onClose={() => setReport(false)} />}
    </Group>
  );
}

/** Modules on the plan, the Vanta frameworks pattern: added through billing, quoted until a price is confirmed. */
export function ModulesGroup() {
  const { b, lang, cloud, ws, say } = useApp();
  const { g, load } = useGrowth();
  const [asking, setAsking] = useState<Module | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState(0);
  useEffect(() => { if (cloud?.wsId) void api.hqLinks(cloud.wsId).then(l => setLinks(l.length), () => setLinks(0)); }, [cloud?.wsId]);
  const zh = lang === "zh";
  const states = moduleStates(g?.modules ?? [], g?.modules_requested ?? []);
  const subscribed = cloud?.billing?.subscription_status === "active" || cloud?.billing?.subscription_status === "trialing";
  const facts = ws.facts.map(f => `${f.label.en} ${f.value.en}`).join(" ");
  const grow = useMemo(() => expansions({
    storeStates: (ws.stores ?? []).map(s => { const m = /,\s*([A-Za-z .]+?)\s+\d{5}(?:-\d{4})?\s*$/.exec(s.address ?? "") ?? /,\s*([A-Z]{2})\s*$/.exec(s.address ?? ""); return m ? stateCode(m[1]) : ""; }).filter(Boolean),
    entityStates: (ws.entities ?? []).flatMap(e => e.registrations.map(r => r.state)),
    modules: [...(g?.modules ?? []), ...(g?.modules_requested ?? [])],
    sellsAlcohol: /\b(alcohol|liquor|beer|wine|spirits)\b|酒/i.test(facts + " " + ws.business.en),
    imports: /\bimport(s|er|ing)?\b|进口/i.test(facts),
    locations: (ws.stores ?? []).length, hq: links > 0,
  }), [ws, g, links]);
  const add = async (m: Module) => {
    if (!cloud) return;
    setBusy(true);
    try {
      const r = await api.addModule(cloud.wsId, m.id);
      await load();
      say(r.state === "on" ? (zh ? `已添加${m.name.zh}。` : `${m.name.en} is on your plan.`) : (zh ? `已申请${m.name.zh}报价，团队会尽快联系您。` : `Asked for a quote on ${m.name.en}. Our team gets back to you.`));
      setAsking(null);
    } catch (e) { const er = e as api.ApiError; say((zh && er.message_zh) || er.message); }
    setBusy(false);
  };
  return (
    <Group id="modules" title={B("Modules", "模块")} note={B("Add what your business grows into, on the same yearly contract. Nothing is charged until you accept the price.", "随业务发展添加模块，沿用同一份年度合同。您接受价格前不会收费。")}
      rows={MODULES.map(m => ({
        label: m.name, sub: <>{b(m.does)} <em>{states[m.id] === "on" ? b(B("On your plan", "已在方案中")) : states[m.id] === "requested" ? b(B("Quote requested", "已申请报价")) : b(m.ready)}</em></>,
        right: !cloud ? undefined : states[m.id] !== "off" ? undefined : !cloud.owner ? <em className="lock">{zh ? "由所有者管理" : "Managed by owners"}</em>
          : <Btn guard disabled={busy} onClick={() => setAsking(m)}>{zh ? "添加模块" : "Add module"}</Btn>,
      }))}>
      {asking && cloud && (
        <div className="sg-form">
          <p className="sg-note"><b>{b(asking.name)}</b> {b(addLine(asking, modulePrice(asking.id) != null && subscribed))}</p>
          <div className="sg-form-act"><button type="button" className="sbtn" onClick={() => setAsking(null)}>{zh ? "取消" : "Cancel"}</button><button type="button" className="sbtn ink" disabled={busy} onClick={() => void add(asking)}>{zh ? "确认添加" : "Add it"}</button></div>
        </div>
      )}
      {grow.length > 0 && (
        <div className="sg-sub">
          <h3>{b(B("Worth a look as you grow", "随业务发展值得关注"))}</h3>
          <ul className="sg-list">{grow.map(x => <li key={x.id} className="sg-row"><span className="sg-tx"><b>{b(x.title)}</b><small>{b(x.body)}</small></span></li>)}</ul>
        </div>
      )}
    </Group>
  );
}

/** The hard monthly cap on filings past the allowance, and where this month stands. */
export function FilingCapGroup() {
  const { b, lang, cloud, say } = useApp();
  const { m, load } = useGrowth();
  const [cap, setCap] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (m) setCap(String(Math.round(m.cap_cents / 100))); }, [m]);
  if (!cloud) return null;
  const zh = lang === "zh";
  const locations = m?.paid ? Math.max(1, m.locations) : 0;
  const allow = allowanceOf(locations);
  const next = m ? quoteFiling("sales_tax", { locations, used: m.used, chargedCents: m.charged_cents, capCents: m.cap_cents }) : null;
  const save = async () => {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 0 || n > PROPOSED.maxFilingCapUsd) { say(zh ? `请输入 0 至 ${PROPOSED.maxFilingCapUsd} 之间的整数美元。` : `Enter whole dollars from 0 to ${PROPOSED.maxFilingCapUsd}.`); return; }
    setBusy(true);
    try { await api.setFilingCap(cloud.wsId, n); await load(); say(zh ? `每月上限已设为 $${n}。` : `Monthly cap set to $${n}.`); }
    catch (e) { const er = e as api.ApiError; say((zh && er.message_zh) || er.message); }
    setBusy(false);
  };
  return (
    <Group id="filingcap" title={B("Filings past your plan", "方案之外的申报")}
      note={B(`Your stores' own licenses and renewals are always included. Other filings, such as a sales tax return or an annual report, are included up to ${PROPOSED.extraFilingsPerLocationMonth} a location each month. Past that, each one shows its price before you approve it, and nothing is charged above the monthly cap you set here.`,
        `门店自身的执照和续期始终包含在方案中。其他申报（如销售税申报、年报）每店每月包含 ${PROPOSED.extraFilingsPerLocationMonth} 次。超出后，每次申报都会在您批准前显示价格，且收费不会超过您在此设定的每月上限。`)}
      rows={m ? [
        { label: B("This month", "本月"), sub: zh ? `方案外申报 ${m.used} 次（包含 ${allow} 次），已收费 ${usd(m.charged_cents / 100)}` : `${m.used} filing${m.used === 1 ? "" : "s"} outside your plan (${allow} included), ${usd(m.charged_cents / 100)} charged` },
        ...(next ? [{ label: B("The next one", "下一次"), sub: b(next.line) }] : []),
      ] : [{ label: B("This month", "本月"), sub: b(B("Shows once filings past a plan are switched on for your account.", "为您的账户开启方案外申报后显示。")) }]}>
      {m && (cloud.owner ? (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void save(); }}>
          <label className="sg-note"><b>{zh ? "每月上限（美元）" : "Monthly cap, in dollars"}</b></label>
          <input id="filing-cap" className="sg-num" inputMode="numeric" value={cap} onChange={e => setCap(e.target.value.replace(/[^\d]/g, ""))} aria-label={zh ? "每月上限（美元）" : "Monthly cap, in dollars"} />
          <Btn guard kind="ink" disabled={busy} onClick={() => void save()}>{zh ? "保存" : "Save"}</Btn>
        </form>
      ) : <p className="sg-note">{zh ? `每月上限：${usd(m.cap_cents / 100)}，由所有者设定。` : `Monthly cap: ${usd(m.cap_cents / 100)}, set by an owner.`}</p>)}
    </Group>
  );
}

const KINDS: { id: EntityKind; label: { en: string; zh: string } }[] = [{ id: "llc", label: B("LLC", "有限责任公司") }, { id: "corp", label: B("Corporation", "股份公司") }];

/** The legal entities, the states each is registered in, and the reports each owes, from official pages only. */
export function EntitiesGroup() {
  const { b, lang, ws, editWs, ask, busy, cloud, say } = useApp();
  const zh = lang === "zh";
  const today = daysFromNow(0);
  const entities = ws.entities ?? [];
  const list = obligations(entities, today);
  const [draft, setDraft] = useState<{ name: string; kind: EntityKind; state: string; date: string } | null>(null);
  const canEdit = !cloud || !cloud.viewer;
  const save = () => {
    if (!draft) return;
    const st = stateCode(draft.state);
    if (!draft.name.trim() || !st || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) { say(zh ? "请填写名称、州和登记日期。" : "Enter the name, the state and the date it registered."); return; }
    const had = entities.find(e => e.name.toLowerCase() === draft.name.trim().toLowerCase() && e.kind === draft.kind);
    const next: Entity[] = had
      ? entities.map(e => e === had ? { ...e, registrations: [...e.registrations.filter(r => r.state !== st), { state: st, date: draft.date, foreign: e.registrations.length > 0 }] } : e)
      : [...entities, { id: "en" + Date.now().toString(36), name: draft.name.trim(), kind: draft.kind, registrations: [{ state: st, date: draft.date }] }];
    editWs(w => ({ ...w, entities: next }));
    setDraft(null);
  };
  const remove = (id: string) => editWs(w => ({ ...w, entities: (w.entities ?? []).filter(e => e.id !== id) }));
  const dated = entityDeadlines(list);
  const missing = dated.filter(d => !ws.deadlines.some(x => x.id === d.id));
  const toCalendar = () => {
    editWs(w => ({ ...w, deadlines: [...w.deadlines, ...dated.filter(d => !w.deadlines.some(x => x.id === d.id))] }));
    say(zh ? `已把 ${missing.length} 个到期日加入日历。` : `Put ${missing.length} due date${missing.length === 1 ? "" : "s"} on the calendar.`);
  };
  return (
    <Group id="entities" title={B("Entities", "法律实体")} note={B("Each legal entity owes an annual report or statement in every state it's registered in. Placetta gives a due date only from the state's own page, quoted, and Odelia prepares each one for your approval.", "每个法律实体在其登记的每个州都须提交年报或信息声明。快哉只依据州政府官方页面的原文给出到期日，Odelia 准备好每一份并等您批准。")}
      rows={list.map(o => ({
        label: { en: `${o.entity.name} in ${o.reg.state}`, zh: `${o.entity.name}（${o.reg.state}）` },
        sub: o.rule && o.due ? <>{b(o.rule.form)}{zh ? `，${o.initial ? "首次" : ""}到期 ${fmtDay(o.due, lang, true)}` : `, ${o.initial ? "first one " : ""}due ${fmtDay(o.due, lang, true)}`}{o.opens ? (zh ? `（${fmtDay(o.opens, lang, true)} 起可提交）` : ` (opens ${fmtDay(o.opens, lang, true)})`) : ""}
            <em>“{o.rule.quote}” <a href={o.rule.url} target="_blank" rel="noreferrer">{new URL(o.rule.url).hostname}</a>{zh ? `，${o.rule.read} 查阅` : `, read ${o.rule.read}`}</em></>
          : b(o.ask!),
        right: o.rule && o.due && canEdit ? <Btn disabled={busy} onClick={() => ask(b(entityDeadlines([o])[0].prompt))}>{zh ? "准备并等我批准" : "Prepare for approval"}</Btn>
          : !o.rule && canEdit ? <Btn disabled={busy} onClick={() => ask(zh ? `查阅 ${o.reg.state} 州务卿官方页面，找出${o.entity.kind === "llc" ? " LLC" : "公司"}年报或信息声明的到期规则，并引用原文和网址。不要提交任何内容。` : `Read the ${o.reg.state} Secretary of State's official page for when a${o.entity.kind === "llc" ? "n LLC" : " corporation"}'s annual report or statement of information is due, and quote it with its address. Don't file anything.`)}>{zh ? "让 Odelia 查阅" : "Ask Odelia to read it"}</Btn> : undefined,
      }))}>
      {entities.length > 0 && canEdit && <ul className="sg-list">{entities.map(e => <li key={e.id} className="sg-row"><span className="sg-tx"><b>{e.name}</b><small>{b(KINDS.find(k => k.id === e.kind)!.label)}{zh ? "，登记于 " : ", registered in "}{e.registrations.map(r => `${r.state} ${r.date}`).join(zh ? "、" : ", ")}</small></span><span className="sg-r"><Btn kind="warm" onClick={() => remove(e.id)}>{zh ? "移除" : "Remove"}</Btn></span></li>)}</ul>}
      {canEdit && (draft ? (
        <form className="sg-form" onSubmit={e => { e.preventDefault(); save(); }}>
          <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={zh ? "法定名称" : "Legal name"} aria-label={zh ? "法定名称" : "Legal name"} />
          <Select value={draft.kind} onChange={e => setDraft({ ...draft, kind: e.target.value as EntityKind })} aria-label={zh ? "类型" : "Kind"}>{KINDS.map(k => <option key={k.id} value={k.id}>{b(k.label)}</option>)}</Select>
          <input value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value })} placeholder={zh ? "州（如 CA）" : "State (CA, New York)"} aria-label={zh ? "州" : "State"} />
          <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} aria-label={zh ? "在该州登记的日期" : "Date it registered in that state"} />
          <p className="sg-note">{b(B("Add the same name again for each other state it's registered in.", "如在其他州也有登记，请用同一名称再添加一次。"))}</p>
          <div className="sg-form-act"><button type="button" className="sbtn" onClick={() => setDraft(null)}>{zh ? "取消" : "Cancel"}</button><button type="submit" className="sbtn ink">{zh ? "保存" : "Save"}</button></div>
        </form>
      ) : <div className="sg-act"><Btn onClick={() => setDraft({ name: ws.meta?.entity ?? "", kind: "llc", state: "", date: "" })}><I.plus />{zh ? "添加实体或州" : "Add an entity or a state"}</Btn>
        {missing.length > 0 && <Btn kind="ink" onClick={toCalendar}>{zh ? `把 ${missing.length} 个到期日加入日历` : `Put ${missing.length} due date${missing.length === 1 ? "" : "s"} on the calendar`}</Btn>}</div>)}
      <p className="sg-note">{b(REGISTERED_AGENT.line)}</p>
    </Group>
  );
}
