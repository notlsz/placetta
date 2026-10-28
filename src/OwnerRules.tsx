import { useEffect, useState } from "react";
import { useApp } from "./ctx";

import { ACTIONS, AUTONOMY, DIAL, HOUSE_MAX, HOUSE_TEMPLATE, addRule, dropBusinessRule, dropRule, houseCheck, putBusinessRule, setAutonomy, setHouse, toggleBusinessRule, type ActionKind, type Autonomy } from "./autonomy";
import { grantState } from "./autopilot";
import { AutopilotSign, AutopilotStatus } from "./AutopilotSettings";
import { AgentStatus } from "./SignOnce";
import { nowIso } from "./time";
import { BR_ACTIONS, BR_EVENTS, BR_VIAS, actionsFor, ruleLabel, validRule, type BrAction, type BrEventKind, type BrVia } from "./businessRules";
import { fmtAgo } from "./time";
import { I, Select } from "./ui";
import { SetSheet } from "./SetUI";
import "./controls.css";

/* The owner's controls in Settings: how much Odelia does on her own with the Always allow and Never rules (Odelia),
   house rules (Business facts) and business rules (Odelia). Members see them; only an owner changes them, and the
   database keeps a member's save from changing them too. */

const useOwner = () => { const { cloud } = useApp(); return { owner: !cloud || cloud.owner, by: cloud?.email }; };
const Members = ({ zh }: { zh: boolean }) => <p className="sg-note">{zh ? "只有所有者可以更改。" : "Only an owner can change this."}</p>;

/* ------------------------------------------------------------------ how much she does on her own */

export function AutonomyGroup() {
  const { b, lang, ws, editWs, say } = useApp();
  const { owner, by } = useOwner();
  const zh = lang === "zh";
  const mode: Autonomy = ws.controls?.autonomy ?? "usual";
  const rules = ws.controls?.rules ?? [];
  const [action, setAction] = useState<ActionKind>("contact");
  const [target, setTarget] = useState("");
  const [adding, setAdding] = useState(false);
  const [signing, setSigning] = useState(false);
  // Autopilot needs its signed authorization first: picking it without one opens the sheet that signs it
  const pick = (m: Autonomy) => {
    if (!owner || m === mode) return;
    if (m === "autopilot" && grantState(ws.controls?.autopilot, nowIso()) !== "live") { setSigning(true); return; }
    editWs(setAutonomy(m, by)); say(zh ? `已改为“${AUTONOMY.find(x => x.id === m)!.label.zh}”。` : `Set to ${AUTONOMY.find(x => x.id === m)!.label.en}.`);
  };
  const cur = AUTONOMY.find(x => x.id === mode) ?? AUTONOMY[1];
  const addNever = () => {
    editWs(addRule({ kind: "deny", action, target: target.trim() || undefined }, by));
    setTarget(""); setAdding(false);
    say(zh ? "已添加。Odelia 不会再这样做。" : "Added. Odelia won't do that.");
  };
  return (
    <section className="sg" id="set-autonomy">
      <h2>{zh ? "Odelia 自主处理的范围" : "How much Odelia does on her own"}</h2>
      <p className="sg-note">{zh ? "选择她在问您之前能做多少。付款和机构网站上的费用始终由您处理；只有在您签署“自动驾驶”授权后，申报才会无需每次批准即可提交。" : "Choose how much she does before she asks. Paying stays yours whatever you pick, and filing waits for your approval unless you sign Autopilot."}</p>
      {/* the dial: Ask me each time, Hands-off, Autopilot */}
      <div className="ap-dial" role="radiogroup" aria-label={zh ? "Odelia 自主处理的范围" : "How much Odelia does on her own"}>
        {DIAL.map(id => { const m = AUTONOMY.find(x => x.id === id)!; return (
          <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? "on" : ""} disabled={!owner} onClick={() => pick(id)}>{b(m.label)}</button>
        ); })}
      </div>
      <p className="ap-dial-sub">{b(cur.sub)}</p>
      {(mode === "autopilot" || ws.controls?.autopilot) && <AutopilotStatus owner={owner} onSign={() => setSigning(true)} />}
      {signing && owner && <AutopilotSign onClose={() => setSigning(false)} />}
      {(mode === "autopilot" || ws.controls?.autopilot || ws.controls?.agent) && <AgentStatus owner={owner} />}
      <h3 className="ap-more">{zh ? "更谨慎的方式" : "More careful"}</h3>
      <ul className="sg-list" role="radiogroup" aria-label={zh ? "更谨慎的方式" : "More careful"}>
        {AUTONOMY.filter(m => !DIAL.includes(m.id)).map(m => (
          <li key={m.id} className={"sg-row mode-row" + (m.id === mode ? " on" : "")} onClick={() => pick(m.id)}>
            <span className="sg-tx"><b>{b(m.label)}</b><small>{b(m.sub)}</small></span>
            <span className="sg-r"><label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="autonomy" checked={m.id === mode} disabled={!owner} onChange={() => pick(m.id)} aria-label={b(m.label)} /><i /></label></span>
          </li>
        ))}
      </ul>
      {!owner && <Members zh={zh} />}
      <div className="sg-sub">
        <h3>{zh ? "您的规则" : "Your rules"}</h3>
        {rules.length ? (
          <ul className="rule-list">
            {rules.map(r => (
              <li key={r.id}>
                <span className="rl-tx">
                  <b>{b(r.label)}</b>
                  <small>{[r.used ? (zh ? `用过 ${r.used} 次${r.last ? `，最近 ${fmtAgo(r.last, lang)}` : ""}` : `Used ${r.used} time${r.used === 1 ? "" : "s"}${r.last ? `, last ${fmtAgo(r.last, lang)}` : ""}`) : (zh ? "还没用过" : "Not used yet"),
                    r.by ? (zh ? `由 ${r.by} 添加` : `added by ${r.by}`) : ""].filter(Boolean).join(zh ? "，" : ", ")}</small>
                </span>
                {owner && <span className="rl-r"><button type="button" className="sbtn quiet warm" aria-label={zh ? `删除：${r.label.zh}` : `Remove: ${r.label.en}`} onClick={() => { editWs(dropRule(r.id)); say(zh ? "已删除。" : "Removed."); }}>{zh ? "删除" : "Remove"}</button></span>}
              </li>
            ))}
          </ul>
        ) : <p className="rule-empty">{zh ? "还没有规则。在批准卡片上勾选“始终允许”即可添加一条，或在下面添加“绝不”规则。" : "No rules yet. Tick Always allow on an approval card to add one, or add a Never rule below."}</p>}
        {owner && <div className="sg-act"><button type="button" className="sbtn line" onClick={() => setAdding(true)}><I.plus />{zh ? "添加“绝不”规则" : "Add a Never rule"}</button></div>}
        {owner && adding && (
          <SetSheet title={zh ? "添加“绝不”规则" : "Add a Never rule"} sub={zh ? "她用到的工具会直接拒绝，并告诉您是您的规则阻止了它。" : "The tool refuses it outright and she tells you your rule stopped it."} onClose={() => setAdding(false)}>
            <form className="sst-form" onSubmit={e => { e.preventDefault(); addNever(); }}>
              <label className="sst-field"><span>{zh ? "绝不" : "Never"}</span>
                <Select value={action} onChange={e => setAction(e.target.value as ActionKind)} aria-label={zh ? "做什么" : "What"}>
                  {(Object.keys(ACTIONS) as ActionKind[]).map(k => <option key={k} value={k}>{b(ACTIONS[k].label)}</option>)}
                </Select>
              </label>
              <label className="sst-field"><span>{zh ? "对谁或什么（可选）" : "Who or what (optional)"}</span>
                <input value={target} onChange={e => setTarget(e.target.value)} placeholder={action === "apps" ? (zh ? "例如：Square" : "e.g. Square") : zh ? "例如：房东" : "e.g. landlord"} maxLength={120} />
              </label>
              <div className="sst-act">
                <button type="button" className="sbtn quiet" onClick={() => setAdding(false)}>{zh ? "取消" : "Cancel"}</button>
                <button type="submit" className="sbtn ink">{zh ? "添加" : "Add"}</button>
              </div>
            </form>
          </SetSheet>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ house rules */

export function HouseRulesGroup() {
  const { b, lang, ws, editWs, say } = useApp();
  const { owner, by } = useOwner();
  const zh = lang === "zh";
  const saved = ws.controls?.house;
  const [text, setText] = useState(saved?.text ?? "");
  useEffect(() => { setText(saved?.text ?? ""); }, [saved?.text]);
  const { dropped } = houseCheck(text);
  const dirty = text !== (saved?.text ?? "");
  const [open, setOpen] = useState(false);
  const save = () => { editWs(setHouse(text, by)); setOpen(false); say(zh ? "店规已保存。Odelia 下次工作时会读取。" : "House rules saved. Odelia reads them at the start of every job."); };
  const close = () => { setOpen(false); setText(saved?.text ?? ""); };
  const kept = (saved?.text ?? "").trim();
  const off = houseCheck(saved?.text ?? "").dropped.length;
  const updated = saved?.at ? (zh ? `${fmtAgo(saved.at, lang)}更新${saved.by ? `，由 ${saved.by}` : ""}` : `Updated ${fmtAgo(saved.at, lang)}${saved.by ? ` by ${saved.by}` : ""}`) : "";
  return (
    <section className="sg" id="set-house">
      <h2>{zh ? "店规" : "House rules"}</h2>
      <p className="sg-note">{zh ? "用您自己的话、任何语言写下：生意怎么运作、需要抄送谁、绝不能做什么、喜欢的语气。Odelia 每次开始工作前都会读一遍。" : "In your own words, in any language: how the business works, who to copy, what never to do and the tone you like. Odelia reads this at the start of every job."}</p>
      {/* the rules as one row: how much is written and when it changed, with Edit (or View) opening the side sheet */}
      <ul className="sg-list">
        <li className="sg-row">
          <span className="sg-tx"><b>{zh ? "店规" : "House rules"}</b>
            <small className="house-peek">{kept ? kept.split("\n").find(l => l.trim()) : (zh ? "还没有写。" : "Not written yet.")}</small>
            <small>{kept ? (zh ? `${kept.length} 字符` : `${kept.length.toLocaleString("en-US")} characters`) + (updated ? (zh ? `，${updated}` : `. ${updated}`) : "") : (zh ? "每次修改都记录在活动记录中。" : "Every change is in Activity.")}
              {off > 0 && <em className="house-off">{zh ? `，${off} 行不会执行` : `. ${off} line${off === 1 ? "" : "s"} won't be followed`}</em>}</small></span>
          <span className="sg-r"><button type="button" className={"sbtn " + (owner && !kept ? "line" : "quiet")} onClick={() => setOpen(true)}>{owner ? (kept ? (zh ? "编辑" : "Edit") : (zh ? "写店规" : "Write them")) : (zh ? "查看" : "View")}</button></span>
        </li>
      </ul>
      {open && (
        <SetSheet title={zh ? "店规" : "House rules"} sub={zh ? "用您自己的话、任何语言。Odelia 每次开始工作前都会读一遍。" : "In your own words, in any language. Odelia reads this at the start of every job."} onClose={close} className="house-sheet">
          <label className="sr" htmlFor="house-text">{zh ? "店规" : "House rules"}</label>
          <textarea id="house-text" className="house-text" value={text} readOnly={!owner} maxLength={HOUSE_MAX} onChange={e => setText(e.target.value.slice(0, HOUSE_MAX))} placeholder={b(HOUSE_TEMPLATE)} />
          <p className="house-order">
            <small className={text.length >= HOUSE_MAX ? "over" : ""}>{zh ? `${text.length} / ${HOUSE_MAX} 字符` : `${text.length.toLocaleString("en-US")} of ${HOUSE_MAX.toLocaleString("en-US")} characters`}</small>{zh ? "。" : ". "}
            {saved?.at ? (zh ? `${fmtAgo(saved.at, lang)}更新${saved.by ? `，由 ${saved.by}` : ""}。` : `Updated ${fmtAgo(saved.at, lang)}${saved.by ? ` by ${saved.by}` : ""}. `) : ""}{zh ? "每次修改都记录在活动记录中。" : "Every change is in Activity."}</p>
          {dropped.length > 0 && (
            <div className="house-warn" role="note">
              <b>{zh ? "这几行不会执行" : "These lines won't be followed"}</b>
              <p>{zh ? "快哉的规则优先：提交、付款和发送之前都会先问您，遵守法律，从不索要社会安全号或银行账号。" : "Placetta's own rules come first: it always asks before anything is filed, paid or sent, keeps to the law and never asks for Social Security or bank numbers."}</p>
              <ul>{dropped.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {!owner && <Members zh={zh} />}
          {owner && (
            <div className="sst-act">
              {!text.trim() && <button type="button" className="sbtn quiet" onClick={() => setText(b(HOUSE_TEMPLATE))}>{zh ? "从示例开始" : "Start from the example"}</button>}
              {dirty && saved?.text !== undefined && <button type="button" className="sbtn quiet" onClick={() => setText(saved.text)}>{zh ? "放弃修改" : "Discard"}</button>}
              <button type="button" className="sbtn ink" disabled={!dirty} onClick={save}>{zh ? "保存" : "Save"}</button>
            </div>
          )}
        </SetSheet>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ business rules */

export function BusinessRulesGroup() {
  const { b, lang, ws, editWs, say } = useApp();
  const { owner, by } = useOwner();
  const zh = lang === "zh";
  const list = ws.controls?.business ?? [];
  const [event, setEvent] = useState<BrEventKind>("filing_approval");
  const [n, setN] = useState("");
  const [action, setAction] = useState<BrAction>("notify");
  const [via, setVia] = useState<BrVia>("email");
  const [to, setTo] = useState("");
  const [item, setItem] = useState("");
  const [adding, setAdding] = useState(false);
  const ev = BR_EVENTS.find(e => e.id === event)!;
  const acts = actionsFor(event);
  useEffect(() => { if (!acts.includes(action)) setAction(acts[0]); }, [event]);   // eslint-disable-line react-hooks/exhaustive-deps
  const how = BR_VIAS.find(v => v.id === via)!;
  const draft = { when: { event, ...(ev.needs === "days" ? { days: Number(n) } : ev.needs === "amount" ? { amount: Number(n) } : {}) },
    then: { action, ...(action === "notify" ? { via, ...(how.to !== "group" ? { to: to.trim() } : {}) } : action === "checklist" ? { item: item.trim() } : {}) } };
  const ok = !!validRule({ ...draft, id: "x", at: "" });
  const add = () => {
    if (!ok) { say(zh ? "请把规则填完整：数字、收件人邮箱或清单项。" : "Finish the rule first: the number, the email address or the checklist item."); return; }
    editWs(putBusinessRule(draft, by));
    setN(""); setTo(""); setItem(""); setAdding(false);
    say(zh ? "业务规则已添加。" : "Business rule added.");
  };
  return (
    <section className="sg" id="set-brules">
      <h2>{zh ? "业务规则" : "Business rules"}</h2>
      <p className="sg-note">{zh ? "发生某件事时，快哉多做一步：通知某人、请第二位所有者批准，或添加清单项。业务规则绝不会自己提交、付款或发送申请。" : "When something happens, Placetta does one thing more: tells someone, asks a second owner to approve, or adds a checklist item. A business rule never files, pays or sends a filing on its own."}</p>
      {list.length ? (
        <ul className="rule-list">
          {list.map(r => (
            <li key={r.id}>
              <span className="rl-tx"><b>{b(ruleLabel(r))}</b><small>{r.by ? (zh ? `由 ${r.by} 添加` : `Added by ${r.by}`) : zh ? "已添加" : "Added"}{r.at ? (zh ? `，${fmtAgo(r.at, lang)}` : `, ${fmtAgo(r.at, lang)}`) : ""}</small></span>
              <span className="rl-r">
                <label className="switch" onClick={e => e.stopPropagation()}><input type="checkbox" checked={r.on !== false} disabled={!owner} onChange={e => editWs(toggleBusinessRule(r.id, e.target.checked))} aria-label={zh ? "开启" : "On"} /><i /></label>
                {owner && <button type="button" className="sbtn quiet warm" aria-label={zh ? "删除" : "Remove"} onClick={() => { editWs(dropBusinessRule(r.id)); say(zh ? "已删除。" : "Removed."); }}>{zh ? "删除" : "Remove"}</button>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="rule-empty">{zh ? "还没有业务规则。" : "No business rules yet."}</p>}
      {owner ? <div className="sg-act"><button type="button" className="sbtn line" onClick={() => setAdding(true)}><I.plus />{zh ? "添加业务规则" : "Add a business rule"}</button></div> : <Members zh={zh} />}
      {owner && adding && (
        <SetSheet title={zh ? "添加业务规则" : "Add a business rule"} sub={zh ? "业务规则绝不会自己提交、付款或发送申请。" : "A business rule never files, pays or sends a filing on its own."} onClose={() => setAdding(false)}>
        <form className="sst-form rule-form br" onSubmit={e => { e.preventDefault(); add(); }}>
          <label>{zh ? "当" : "When"}
            <Select value={event} onChange={e => setEvent(e.target.value as BrEventKind)}>{BR_EVENTS.map(x => <option key={x.id} value={x.id}>{b(x.label)}</option>)}</Select>
          </label>
          {ev.needs ? (
            <label>{ev.needs === "days" ? (zh ? "N（天）" : "N (days)") : (zh ? "N（美元）" : "N (dollars)")}
              <input inputMode="numeric" value={n} onChange={e => setN(e.target.value.replace(/[^\d.]/g, "").slice(0, 9))} placeholder={ev.needs === "days" ? "7" : "500"} />
            </label>
          ) : <span aria-hidden="true" />}
          <label>{zh ? "就" : "Then"}
            <Select value={action} onChange={e => setAction(e.target.value as BrAction)}>{BR_ACTIONS.filter(a => acts.includes(a.id)).map(a => <option key={a.id} value={a.id}>{b(a.label)}</option>)}</Select>
          </label>
          {action === "notify" ? (
            <label>{zh ? "通过" : "By"}
              <Select value={via} onChange={e => setVia(e.target.value as BrVia)}>{BR_VIAS.map(v => <option key={v.id} value={v.id}>{b(v.label)}</option>)}</Select>
            </label>
          ) : action === "checklist" ? (
            <label>{zh ? "清单项" : "Checklist item"}<input value={item} onChange={e => setItem(e.target.value)} maxLength={120} placeholder={zh ? "例如：经理签字确认" : "e.g. Manager signs off"} /></label>
          ) : <span aria-hidden="true" />}
          {action === "notify" && how.to !== "group" && (
            <label>{how.to === "member" ? (zh ? "团队成员（登录邮箱）" : "Teammate (the email they sign in with)") : (zh ? "邮箱" : "Email")}
              <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="kevin@contractor.com" maxLength={160} />
            </label>
          )}
          {action === "notify" && <p className="rf-note">{how.to === "group" ? (zh ? `发到您在“连接”中关联的${b(how.label)}群。` : `Posts in the ${b(how.label)} group you linked in Connections.`)
            : how.to === "member" ? (zh ? `发到这位成员已验证的${via === "text" ? "手机号" : "微信"}。` : `Goes to this teammate's verified ${via === "text" ? "phone number" : "WeChat"}.`)
            : (zh ? "邮件只说发生了什么，不含申请内容。" : "The email says what happened, never what's in a filing.")}</p>}
          <div className="sst-act"><button type="button" className="sbtn quiet" onClick={() => setAdding(false)}>{zh ? "取消" : "Cancel"}</button><button type="submit" className="sbtn ink" disabled={!ok}>{zh ? "添加规则" : "Add rule"}</button></div>
        </form>
        </SetSheet>
      )}
    </section>
  );
}

