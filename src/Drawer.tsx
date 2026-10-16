import { checkAddress, RULE_LABEL } from "./forms/addressCheck";
import { canFill } from "./forms/canFill";
import { useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { FilingLive } from "./FilingLive";
import { useApp, type Signed, type Tab } from "./ctx";
import type { Application, Approval, CheckItem, Doc } from "./model";
import { openSettings } from "./Settings";
import { formById, METHOD } from "./forms/registry";
import { saveFile } from "./files";
import * as api from "./cloud/api";
import { fmtDay } from "./time";
import { daysFromNow, fmtStamp } from "./time";
import { preflight } from "./smart";
import { FileCard, I, LevelTag, Modal, Pill, Sheet, StatusChip, feeText, feeTotal } from "./ui";
import { INK } from "./pages";
import { filingBlockers } from "./core";
import { Working } from "./Bot";

/* ------------------------- application, opened ------------------------- */

export function AppDrawer({ id, tab, edit, onTab, onClose }: { id: string; tab: Tab; edit: boolean; onTab: (t: Tab) => void; onClose: () => void }) {
  const { b, t, lang, ws, openApproval, busy, cloud, ask } = useApp();
  const a = ws.apps.find(x => x.id === id);
  if (!a) return null;
  const appr = ws.approvals.find(x => x.app === id && x.kind !== "upload");
  const done = a.checklist.filter(c => c.state !== "missing").length;
  const zh = lang === "zh";
  // A row from the instant plan (src/plan/preview.ts): readable in full; the paid moment is asking Odelia to fill and file it.
  const fillAndFile = () => {
    if (cloud && cloud.plan === "none") { cloud.openPlans("start"); return; }
    onClose();
    ask(zh ? `核实${a.name.zh}（${a.agency.zh}）的现行要求，用已有资料填好，并告诉我还需要我提供什么。` : `Verify the ${a.name.en} with ${a.agency.en}, fill it from what you know, and tell me what you still need from me.`);
  };
  const tabs: { k: Tab; l: string; n?: string }[] = [
    { k: "progress", l: t("tab_progress") },
    { k: "check", l: t("tab_check"), n: `${done}/${a.checklist.length}` },
    { k: "form", l: t("tab_form") },
    { k: "fees", l: t("tab_fees") },
    { k: "receipt", l: t("tab_receipt") },
  ];
  return (
    <Sheet label={b(a.name)} onClose={onClose}>
      <header className="sh-h">
        <div className="sh-top">
          <LevelTag l={a.level} /><StatusChip s={a.status} />
          <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
        </div>
        <h2>{b(a.name)}</h2>
        {a.plain && <p className="sh-plain">{b(a.plain)}</p>}
        <p className="sh-ag">
          <span>{b(a.agency)}</span>
          {a.source.url && <a href={a.source.url} target="_blank" rel="noopener noreferrer" title={t("source")}>{a.source.label}<I.ext /></a>}
        </p>
        {a.next && <p className="sh-next">{a.critical && <em>{t("critical")}</em>}{b(a.next)}</p>}
        {a.preview && <p className="sh-pv"><I.spark />{zh ? "来自快哉的登记库。开始计划后，Odelia 会向机构核实、填好表格并提交。" : "From Placetta's registry. When you start the plan, Odelia verifies it with the agency, fills it and files it."}</p>}
        <nav className="seg tabs" role="tablist">
          {tabs.map(x => <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => onTab(x.k)}>{x.l}{x.n && <span>{x.n}</span>}</button>)}
        </nav>
      </header>
      <div className="sh-body">
        {tab === "progress" && <Progress a={a} />}
        {tab === "check" && <Checklist a={a} />}
        {tab === "form" && <FormPreview key={a.id + String(edit)} a={a} startEdit={edit} />}
        {tab === "fees" && <Fees a={a} />}
        {tab === "receipt" && <Receipt a={a} />}
      </div>
      {appr ? (
        <footer className="sh-f">
          <span><I.pause />{t("waitingYou")}</span>
          <Pill kind="ink" disabled={busy} onClick={() => openApproval(appr.id)}>{t("review")}</Pill>
        </footer>
      ) : a.preview && !["filing", "review", "approved"].includes(a.status) ? (
        <footer className="sh-f sh-f-pv">
          <span>{zh ? "填写和提交由 Odelia 完成，每一步都经您批准。" : "Odelia fills and files it. Every step waits for your approval."}</span>
          <Pill kind="ink" disabled={busy} onClick={fillAndFile}>{zh ? "填写并提交" : "Fill and file"}</Pill>
        </footer>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------- progress ------------------------------- */

type StepState = "done" | "now" | "next" | "blocked";
/** Every step from prepared to issued, live: the application's status, its checklist and the filing team's record. */
function Progress({ a }: { a: Application }) {
  const { b, lang, ws, cloud, openApproval } = useApp();
  const zh = lang === "zh";
  const f = cloud?.filings.find(x => x.app_id === a.id && x.status !== "canceled");
  const missing = a.checklist.filter(c => c.state === "missing").length, empty = a.fields.filter(x => !x.value).length;
  const prepAt = [...ws.audit].reverse().find(x => x.object.en === a.name.en)?.at;
  const appr = ws.approvals.find(x => x.app === a.id && x.kind === "file");
  const pay = ws.approvals.find(x => x.app === a.id && x.kind === "pay");
  const st = a.status;
  const past = (s: string[]) => s.includes(st);
  const day = (iso?: string | null) => (iso ? fmtDay(iso, lang, true) : "");
  const off = a.official ? formById(a.official) : undefined;
  const tbc = /^(to be confirmed|待确认)$/i.test(b(a.est));
  const steps: { k: string; s: StepState; t: string; d?: string; act?: { l: string; go: () => void } }[] = [
    a.preview
      ? { k: "prep", s: "done", t: zh ? "快哉的登记库列出了这一项" : "Listed from Placetta's registry", d: [off ? off.form : "", zh ? "开始计划后 Odelia 向机构核实并填写" : "Odelia verifies it with the agency and fills it when the plan starts"].filter(Boolean).join(zh ? "，" : ", ") }
      : { k: "prep", s: "done", t: zh ? "快哉准备了申请" : "Placetta prepared the application", d: [off ? off.form : "", day(prepAt)].filter(Boolean).join(zh ? "，" : ", ") },
    { k: "you", s: past(["ready", "filing", "review", "approved"]) || (!missing && !empty) ? "done" : "now",
      t: zh ? "资料与文件" : "Answers and documents",
      d: past(["ready", "filing", "review", "approved"]) || (!missing && !empty) ? (zh ? "已齐全" : "Complete") : [missing ? (zh ? `还差 ${missing} 份文件` : `${missing} document${missing === 1 ? "" : "s"} still needed`) : "", empty ? (zh ? `${empty} 项信息待填` : `${empty} answer${empty === 1 ? "" : "s"} still needed`) : ""].filter(Boolean).join(zh ? "，" : ", ") },
    { k: "approve", s: past(["filing", "review", "approved"]) || !!f ? "done" : st === "ready" ? "now" : "next",
      t: zh ? "您批准提交" : "You approve the filing", d: f ? (zh ? `已于 ${day(f.approved_at)} 批准` : `Approved ${day(f.approved_at)}`) : undefined,
      act: appr ? { l: zh ? "查看并批准" : "Review and approve", go: () => openApproval(appr.id) } : undefined },
    { k: "team", s: past(["review", "approved"]) || f?.status === "submitted" ? "done" : st === "filing" || (f && ["requested", "in_progress", "needs_info"].includes(f.status)) ? (pay || f?.agent_state === "needs_you" ? "blocked" : "now") : "next",
      t: f?.agent_state && f.channel !== "team" ? (zh ? `快哉核对并${CHANNEL[f.channel ?? "portal"]?.zh ?? ""}提交` : `Placetta checks it and submits it ${CHANNEL[f.channel ?? "portal"]?.en ?? ""}`) : (zh ? "快哉核对并提交" : "Placetta checks and submits it"),
      d: pay ? (zh ? "等待您向机构付款" : "Waiting for you to pay the agency fee") : f?.agent_state === "needs_you" ? (zh ? "需要您完成一步" : "Needs you for one step") : f?.status === "needs_info" && f.note ? f.note : f?.agent_log?.length ? (zh ? f.agent_log.at(-1)!.zh : f.agent_log.at(-1)!.en) : f?.requirements_checked ? (zh ? "已按机构现行要求核对" : "Checked against the agency's current requirements") : f ? (zh ? "快哉已接手" : "With Placetta") : undefined,
      act: pay ? { l: zh ? "去付款" : "Pay the agency", go: () => openApproval(pay.id) } : undefined },
    { k: "agency", s: st === "approved" ? "done" : st === "review" ? "now" : "next",
      t: zh ? "机构审核" : "The agency reviews it",
      d: f?.submitted_at ? [zh ? `${day(f.submitted_at)} 提交` : `Submitted ${day(f.submitted_at)}`, f.confirmation_number ? (zh ? `确认号 ${f.confirmation_number}` : `confirmation ${f.confirmation_number}`) : "", tbc ? "" : zh ? `通常需要：${b(a.est).replace(/^通常(需要)?[：:]?/, "")}` : /^usually/i.test(b(a.est)) ? b(a.est).replace(/^U/, "u") : `usually takes ${b(a.est)}`].filter(Boolean).join(zh ? "，" : ", ") : tbc ? undefined : (zh ? `通常需要：${b(a.est).replace(/^通常(需要)?[：:]?/, "")}` : /^usually/i.test(b(a.est)) ? b(a.est) : `Usually takes ${b(a.est)}`) },
    { k: "done", s: st === "approved" ? "done" : "next", t: zh ? "批准并发证" : "Approved and issued",
      d: st === "approved" ? [f?.decided_at ? day(f.decided_at) : "", a.renews ? b(a.renews) : ""].filter(Boolean).join(zh ? "。" : ". ") : a.renews ? (zh ? `续期：${b(a.renews)}` : `Renewal: ${b(a.renews)}`) : undefined },
  ];
  const cur = steps.findIndex(s => s.s !== "done");
  return (
    <div className="pg">
      <p className="pg-live"><i />{cloud ? (zh ? "实时更新：团队或机构有任何进展，这里会立即显示。" : "Live: every change from the team or the agency shows here as it happens.") : (zh ? "进度：团队或机构有任何进展，这里会立即显示。" : "Progress: every change from the team or the agency shows here.")}</p>
      <ol className="pg-steps">
        {steps.map((s, i) => (
          <li key={s.k} className={"st-" + s.s + (i === cur ? " cur" : "")}>
            <span className="dot" aria-hidden="true">{s.s === "done" ? <I.check /> : i + 1}</span>
            <div><b>{s.t}</b>{s.d && <small>{s.d}</small>}{s.act && i === cur && <button type="button" className="pill ink sm" onClick={s.act.go}>{s.act.l}</button>}</div>
          </li>
        ))}
      </ol>
      {f?.agent_state === "needs_you" && <FinishStep f={f} />}
      <FilingLive app={a.id} embedded />
      {f?.note && f.status !== "needs_info" && <p className="note">{zh ? "团队备注：" : "From the team: "}{f.note}</p>}
    </div>
  );
}

function Checklist({ a }: { a: Application }) {
  const { lang } = useApp();
  if (!a.checklist.length) return <p className="quiet">{lang === "zh" ? "这一项不需要附加文件。" : "Nothing to attach for this one."}</p>;
  return <ul className="checklist">{a.checklist.map(c => <CheckRow key={c.id} a={a} c={c} />)}</ul>;
}

function CheckRow({ a, c }: { a: Application; c: CheckItem }) {
  const { b, t, ws, uploading, upload, busy } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const doc = c.doc ? ws.docs.find(d => d.id === c.doc) : undefined;
  const dep = c.dep ? ws.apps.find(x => x.id === c.dep) : undefined;
  const reading = !!uploading && uploading.app === a.id && (uploading.item === c.id || uploading.item === "*") && c.state === "missing" && !c.dep;
  return (
    <li className={"ck ck-" + c.state + (reading ? " reading" : "")}>
      <span className="ck-ico" aria-hidden="true">
        {reading ? <ThinkingOrb state="shaping" size={20} theme="light" color={INK} /> : c.state === "done" ? <I.check /> : c.state === "auto" ? <I.spark /> : null}
      </span>
      <div className="ck-body">
        <b>{b(c.label)}</b>
        {reading ? <Working on size="sm"><span className="reading-pill">{t("reading")}…</span></Working>
          : dep ? <small>{t("comesFrom", { x: b(dep.name) })}</small>
            : c.note ? <small>{b(c.note)}</small>
              : c.state === "auto" ? <small>{t("prepares")}</small> : null}
        {doc && <FileCard d={doc} compact />}
        {c.extracted && (
          <div className="extract">
            <span className="ex-h"><I.spark />{t("placettaRead")}</span>
            <dl>{c.extracted.map(([k, v, q], i) => <div key={i}><dt>{b(k)}</dt><dd>{v}{q && <q className="cite">{q}</q>}</dd></div>)}</dl>
          </div>
        )}
        {c.state === "missing" && !c.dep && !reading && (
          <div className="ck-act">
            <button type="button" className="pill ink sm" disabled={busy} onClick={() => input.current?.click()}><I.upload />{t("upload")}</button>
            <input ref={input} type="file" hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(a.id, c.id, f); }} />
          </div>
        )}
      </div>
    </li>
  );
}

/* What the agency accepts on an address line, with the three official sources that say so, and what to do when the
   address given isn't that kind (an address abroad where the agency needs a street address in the state). */
function AddrRule({ form, field, value }: { form: string; field: string; value: string }) {
  const { b, lang } = useApp();
  const c = checkAddress(form, field, value);
  if (!c) return null;
  const n = c.rule.confirmations.length;
  return (
    <div className={"arule" + (c.ok ? "" : " bad")}>
      {!c.ok && c.problem && <p className="awarn"><b>{b(c.problem)}</b> {b(c.rule.ifNone)}</p>}
      <details>
        <summary>{b(RULE_LABEL[c.rule.rule])}{c.rule.rule !== "unconfirmed" ? (lang === "zh" ? ` · ${n} 个官方来源确认` : ` · confirmed by ${n} official sources`) : ""}</summary>
        <p>{b(c.rule.what)}</p>
        <ul>{c.rule.confirmations.map((x, k) => <li key={k}><a href={x.url} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(x.url).hostname.replace(/^www\./, ""); } catch { return x.url; } })()}<I.ext /></a> <q>{x.quote}</q></li>)}</ul>
      </details>
    </div>
  );
}

function FormPreview({ a, startEdit }: { a: Application; startEdit: boolean }) {
  const { b, t, lang, say, editFields, downloadApp, cloud } = useApp();
  const [making, setMaking] = useState(false);
  const canEdit = !["approved", "review"].includes(a.status) && a.fields.length > 0;
  const [edit, setEdit] = useState(startEdit && canEdit);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(a.fields.map(f => [f.id, f.value])));
  if (!a.fields.length) return <p className="quiet">{t("noForm")}</p>;
  const save = () => {
    const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => a.fields.find(f => f.id === k)?.value !== v));
    if (Object.keys(changed).length) editFields(a.id, changed);
    setEdit(false);
  };
  const off = a.official ? formById(a.official) : undefined;
  const official = async () => {
    if (!off) return;
    setMaking(true);
    try {
      const { fillOfficial } = await import("./forms/fill");
      const blob = await fillOfficial(off.id, a.fields);
      if (blob) { const r = await saveFile(`${off.id}-${a.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.pdf`, blob); if (r === "unavailable") say(t("t_noDl")); }
    } catch { say(lang === "zh" ? "无法生成官方表格，请稍后再试。" : "Couldn't make the official form. Try again."); }
    setMaking(false);
  };
  // the agency's own blank PDF, for forms Placetta doesn't fill itself: through the server in the app, straight from the agency elsewhere
  const blank = async () => {
    if (!off?.pdf) return;
    if (!cloud) { window.open(off.pdf, "_blank", "noopener,noreferrer"); return; }
    setMaking(true);
    try { const r = await saveFile(`${off.id}.pdf`, await api.officialForm(off.pdf)); if (r === "unavailable") say(t("t_noDl")); }
    catch (e) { say((e as api.ApiError).message); window.open(off.pdf, "_blank", "noopener,noreferrer"); }
    setMaking(false);
  };
  return (
    <div className="formwrap">
      {off && (
        <div className="official">
          <div className="off-h"><I.form /><div><b>{off.form}</b><span>{b(off.title)}</span></div></div>
          <p>{lang === "zh" ? `${off.agency.zh}。${METHOD[off.method].zh}。${off.how.zh}` : `${off.agency.en}. ${METHOD[off.method].en}. ${off.how.en}`}</p>
          {off.foreign && <p className="off-note">{b(off.foreign)}</p>}
          <div className="off-act">
            {canFill(off) && a.fields.some(f => f.value) && <button type="button" className="pill ink sm" disabled={making} onClick={() => void official()}><I.download />{making ? "…" : lang === "zh" ? "下载已填写的官方表格" : "Download the filled official form"}</button>}
            {off.pdf && !(canFill(off) && a.fields.some(f => f.value)) && <button type="button" className="pill ink sm" disabled={making} onClick={() => void blank()}><I.download />{making ? "…" : lang === "zh" ? "下载官方表格" : "Download the official form"}</button>}
            <a className="pill quiet sm" href={off.pdf ?? off.url} target="_blank" rel="noopener noreferrer">{off.pdf ? (lang === "zh" ? "官方表格" : "Official form") : (lang === "zh" ? "机构办理入口" : "Agency filing page")}<I.ext /></a>
            {off.info !== (off.pdf ?? off.url) && <a className="pill quiet sm" href={off.info} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "机构说明" : "Agency page"}<I.ext /></a>}
          </div>
        </div>
      )}
      <div className={"paper" + (edit ? " editing" : "")}>
        <div className="paper-h"><span>{b(a.agency)}</span><b>{b(a.form ?? a.name)}</b></div>
        <dl>
          {a.fields.map(f => (
            <div key={f.id} className={f.value ? "" : "empty"}>
              <dt>{b(f.label)}</dt>
              <dd>
                {edit ? <input value={vals[f.id] ?? ""} placeholder={t("empty")} onChange={e => setVals(v => ({ ...v, [f.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") save(); }} aria-label={b(f.label)} />
                  : <span>{f.value || t("empty")}</span>}
                {f.from && !edit && <small>{b(f.from)}</small>}
                {f.quote && !edit && <q className="cite">{f.quote}</q>}
                {a.official && <AddrRule form={a.official} field={f.id} value={edit ? vals[f.id] ?? "" : f.value} />}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="form-act">
        {edit ? <>
          <button type="button" className="pill ink" onClick={save}>{t("save")}</button>
          <button type="button" className="pill quiet" onClick={() => { setVals(Object.fromEntries(a.fields.map(f => [f.id, f.value]))); setEdit(false); }}>{t("cancel")}</button>
        </> : <>
          {canEdit && <button type="button" className="pill quiet" onClick={() => setEdit(true)}><I.pencil />{t("edit")}</button>}
          <button type="button" className="pill quiet" onClick={() => downloadApp(a.id)}><I.download />{a.official ? (lang === "zh" ? "下载填写答案" : "Download your answers") : t("download") + " PDF"}</button>
        </>}
      </div>
      <p className="note">{a.official ? (lang === "zh" ? "这些是机构官方表格上的栏目，按表格顺序排列。快哉从不保存社会安全号、ITIN 或护照号，这些由签署人手写。" : "These are the lines on the agency's own form, in its order. Placetta never stores an SSN, ITIN or passport number; the signer writes those by hand.") : t("formFor")}</p>
    </div>
  );
}

function Fees({ a }: { a: Application }) {
  const { b, t } = useApp();
  const total = feeTotal(a);
  return (
    <div className="fees">
      <dl className="card feelist">
        {a.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{feeText(a, t, f)}</dd></div>)}
        <div className="tot"><dt>{t("total")}</dt><dd>{feeText(a, t)}</dd></div>
      </dl>
      {a.feeNote && <p className="note">{b(a.feeNote)}</p>}
      {total > 0 && <p className="note">{t("paidAfter")}</p>}
      <dl className="card kv">
        <div><dt>{t("th_takes")}</dt><dd>{b(a.est)}</dd></div>
        {a.renews && <div><dt>{t("k_renewal")}</dt><dd>{b(a.renews)}</dd></div>}
        <div><dt>{t("source")}</dt><dd><a href={a.source.url} target="_blank" rel="noopener noreferrer">{a.source.label}<I.ext /></a></dd></div>
      </dl>
    </div>
  );
}

function Receipt({ a }: { a: Application }) {
  const { t, ws } = useApp();
  const d = a.receipt ? ws.docs.find(x => x.id === a.receipt) : undefined;
  if (!d) return <p className="quiet">{t("noReceipt")}</p>;
  return (
    <div className="receipt">
      <FileCard d={d} />
      <dl className="card kv">
        <div><dt>{t("au_time")}</dt><dd className="mono">{fmtStamp(d.at)}</dd></div>
        <div><dt>{t("ap_fee")}</dt><dd>{feeText(a, t)}</dd></div>
      </dl>
    </div>
  );
}

/* ------------------------------- approval ------------------------------- */

export function ApproveModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, t, lang, ws, approve, openApp, busy, cloud, go } = useApp();
  const a = ws.approvals.find(x => x.id === id);
  const [sig, setSig] = useState<Signed | null>(null);
  if (!a) return null;
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = app && a.kind === "file" ? feeTotal(app) : 0;
  const atts = app ? app.checklist.map(c => (c.doc ? ws.docs.find(d => d.id === c.doc) : undefined)).filter((d): d is Doc => !!d) : [];
  const data = a.kind === "send" || a.kind === "change" ? a.data ?? [] : app?.fields ?? [];
  const off = app?.official ? formById(app.official) : undefined;
  const needSig = !!cloud && a.kind === "file" && !!off?.sign && !!off.esign;
  const left = app && a.kind === "file" ? filingBlockers(app) : { empty: [], missing: [] };
  const pf = preflight(ws, a, daysFromNow(0));
  const blocked = left.empty.length + left.missing.length + pf.errors.length > 0;
  const zh = lang === "zh";
  return (
    <Modal label={b(a.title)} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.lock />{t("ap_title")}</span>
        <h2>{b(a.title)}</h2>
        <p>{[a.agency && b(a.agency), app?.form && b(app.form)].filter(Boolean).join(lang === "zh" ? "。" : ". ")}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body">
        {(a.kind === "file" || a.kind === "send" || a.kind === "change") && pf.checked > 0 && (
          <section className={"ap-check" + (pf.errors.length ? " bad" : pf.warnings.length ? " warn" : " ok")} aria-live="polite">
            <h3><I.check />{pf.errors.length || pf.warnings.length
              ? (zh ? `已核对 ${pf.checked} 项：${pf.errors.length ? `${pf.errors.length} 项需要更正` : ""}${pf.errors.length && pf.warnings.length ? "，" : ""}${pf.warnings.length ? `${pf.warnings.length} 项请留意` : ""}` : `Checked ${pf.checked} lines: ${[pf.errors.length && `${pf.errors.length} to fix`, pf.warnings.length && `${pf.warnings.length} to look at`].filter(Boolean).join(", ")}`)
              : (zh ? `已核对 ${pf.checked} 项，格式、日期、地址和费用均无问题` : `Checked ${pf.checked} lines: formats, dates, address and fee all check out`)}</h3>
            {(pf.errors.length > 0 || pf.warnings.length > 0) && (
              <ul>
                {[...pf.errors, ...pf.warnings].map((c, i) => <li key={i} className={c.level}><b>{b(c.label)}</b> {b(c.note)}</li>)}
              </ul>
            )}
          </section>
        )}
        {left.empty.length + left.missing.length > 0 && (
          <section className="ap-left" role="alert">
            <h3>{lang === "zh" ? "提交前还需要" : "Needed before it can be filed"}</h3>
            <ul>
              {left.empty.map((l, i) => <li key={"f" + i}>{b(l)}</li>)}
              {left.missing.map((l, i) => <li key={"d" + i}>{b(l)}<small>{lang === "zh" ? "文件" : " (document)"}</small></li>)}
            </ul>
          </section>
        )}
        <section>
          <h3>{t("ap_does")}</h3>
          <ol className="does">{a.does.map((d, i) => <li key={i}>{b(d)}</li>)}</ol>
        </section>
        <section>
          <h3>{a.kind === "send" ? (zh ? "发送内容（可直接修改）" : "What will be sent (edit it here)") : t("ap_data")}</h3>
          {a.kind === "send"
            ? <SendFields a={a} />
            : <dl className="kv data">{data.map(f => <div key={f.id}><dt>{b(f.label)}</dt><dd>{f.value || t("empty")}</dd></div>)}</dl>}
          {a.kind === "send" && cloud && (() => {
            const mail = cloud.integrations.find(i => (i.kind === "gmail" || i.kind === "outlook_mail") && i.status === "connected");
            return mail
              ? <p className="note">{zh ? `批准后从 ${mail.account ?? (mail.kind === "gmail" ? "Gmail" : "Outlook")} 发出。对方回复时，Odelia 会第一时间告诉您。` : `Approving sends it from ${mail.account ?? (mail.kind === "gmail" ? "your Gmail" : "your Outlook")}. Odelia tells you as soon as they reply.`}</p>
              : <p className="note">{zh ? "连接 Gmail 或 Outlook 后，批准即可直接发送并跟踪回复。" : "Connect Gmail or Outlook and approving sends it for you and tracks the reply."} <button type="button" className="linkbtn" onClick={() => { onClose(); openSettings(go, "integrations"); }}>{zh ? "去连接" : "Connect now"}</button></p>;
          })()}
        </section>
        {atts.length > 0 && (
          <section>
            <h3>{t("ap_att")}</h3>
            <div className="files">{atts.map(d => <FileCard key={d.id} d={d} compact />)}</div>
          </section>
        )}
        {needSig && (
          <section>
            <h3>{lang === "zh" ? "签名" : "Signature"}</h3>
            <p className="note">{lang === "zh" ? "签名只用于这份表格，不会保存用于其他表格。" : "Your signature goes on this form only and is never kept for another."}</p>
            <SignaturePad onChange={setSig} />
          </section>
        )}
        {app && a.kind === "file" && (
          <section>
            <h3>{t("ap_fee")}</h3>
            <dl className="kv feelist">
              {app.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{feeText(app, t, f)}</dd></div>)}
              <div className="tot"><dt>{t("total")}</dt><dd>{feeText(app, t)}</dd></div>
            </dl>
            {fee > 0 && <p className="note">{cloud ? t("paidDirect") : t("paidAfter")}</p>}
          </section>
        )}
      </div>
      <footer className="m-f">
        <p>{cloud?.termsHold && <span className="ap-hold" role="note">{lang === "zh" ? "请先在页面顶部接受更新后的条款，然后再批准。" : "Accept the updated Terms at the top of the page to approve this."} </span>}{t("ap_note")} {cloud ? (a.kind === "file" ? t("ap_team") : "") : t("ap_sim")}</p>
        <div className="m-btns">
          {app && <button type="button" className="pill quiet" onClick={() => { onClose(); openApp(app.id, "form", true); }}><I.pencil />{t("ap_edit")}</button>}
          <Pill kind="ink" disabled={busy || blocked || (needSig && !sig) || !!cloud?.termsHold} onClick={() => { approve(a.id, sig ?? undefined); onClose(); }}>{b(a.action)}</Pill>
        </div>
      </footer>
    </Modal>
  );
}

/** An email or text waiting for approval: every line editable in place, the checks above re-run as you type. */
function SendFields({ a }: { a: Approval }) {
  const { b, lang, editWs } = useApp();
  const set = (id: string, value: string) => editWs(w => ({ ...w, approvals: w.approvals.map(x => (x.id === a.id ? { ...x, data: (x.data ?? []).map(f => (f.id === id ? { ...f, value } : f)) } : x)) }));
  return (
    <div className="sendf">
      {(a.data ?? []).map(f => {
        const long = f.id === "msg" || /message|内容|body/i.test(f.label.en) || f.value.length > 120;
        return (
          <label key={f.id} className="sendf-row">
            <span>{b(f.label)}</span>
            {long
              ? <textarea value={f.value} rows={Math.min(16, Math.max(6, f.value.split("\n").length + 1))} onChange={e => set(f.id, e.target.value)} placeholder={lang === "zh" ? "在此填写" : "Write it here"} />
              : <input value={f.value} inputMode={f.id === "to" ? "email" : undefined} autoComplete="off" spellCheck={f.id !== "to"} onChange={e => set(f.id, e.target.value)} placeholder={f.id === "to" ? "name@example.com" : ""} />}
          </label>
        );
      })}
    </div>
  );
}

const CHANNEL: Record<string, { en: string; zh: string }> = {
  email: { en: "by email", zh: "通过邮件" }, fax: { en: "by fax", zh: "通过传真" }, mail: { en: "by certified mail", zh: "通过挂号信" }, portal: { en: "on the agency's site", zh: "在机构网站上" },
};

/** A hand-back: what Placetta needs, the live view to do it in, and "I've done it, carry on". */
function FinishStep({ f }: { f: NonNullable<ReturnType<typeof useApp>["cloud"]>["filings"][number] }) {
  const { lang, cloud, busy } = useApp();
  const zh = lang === "zh";
  const ask = [...(f.agent_log ?? [])].reverse().find(e => ["need_person", "needs_you", "wet_signature"].includes(e.kind));
  const upload = ask?.kind === "wet_signature" && ask.ref === "upload";
  // The same form with the same answers as one already sent: going on means sending it again, so the button says so.
  const duplicate = ask?.kind === "needs_you" && ask.ref === "duplicate";
  return (
    <div className="finish-step" role="status">
      <b>{zh ? "完成这一步" : "Finish this step"}</b>
      <p>{ask ? (zh ? ask.zh : ask.en) : zh ? "快哉需要您完成一步。" : "Placetta needs you for one step."}</p>
      <div className="m-btns">
        {f.handoff_url && <a className="pill quiet sm" href={f.handoff_url} target="_blank" rel="noopener noreferrer">{zh ? "打开" : "Open"}<I.ext /></a>}
        {!cloud?.owner
          // Carrying on, uploading the signed copy and sending again are an owner's; the file function refuses members.
          ? <span className="note">{zh ? "需要工作区所有者完成这一步。" : "An owner of this workspace finishes this step."}</span>
          : upload
          ? <label className={`pill ink sm${busy ? " off" : ""}`}>
              {zh ? "上传签名件" : "Upload the signed copy"}
              <input type="file" accept="application/pdf,image/jpeg,image/png" hidden disabled={busy}
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void cloud?.uploadSigned(f.id, f.app_id, file); }} />
            </label>
          : duplicate
          ? <button type="button" className="pill ink sm" disabled={busy} onClick={() => void cloud?.resumeFiling(f.id, true)}>{zh ? "再次提交" : "Send it again"}</button>
          : <button type="button" className="pill ink sm" disabled={busy} onClick={() => void cloud?.resumeFiling(f.id)}>{zh ? "我已完成，继续" : "I've done it, carry on"}</button>}
      </div>
    </div>
  );
}

/** Sign inside the approval card: a canvas with pointer events and Clear, plus the signer's name and title. */
export function SignaturePad({ onChange }: { onChange: (s: Signed | null) => void }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const cv = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false), inked = useRef(false);
  const [name, setName] = useState(""), [title, setTitle] = useState("");
  const emit = (n = name, t = title) => {
    const c = cv.current;
    if (!c || !inked.current || !n.trim()) { onChange(null); return; }
    c.toBlob(async b => { if (b) onChange({ png: new Uint8Array(await b.arrayBuffer()), name: n.trim(), title: t.trim() || undefined, kind: "drawn" }); }, "image/png");
  };
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return [(e.clientX - r.left) * (e.currentTarget.width / r.width), (e.clientY - r.top) * (e.currentTarget.height / r.height)] as const; };
  return (
    <div className="sigpad">
      <canvas ref={cv} width={600} height={160} aria-label={zh ? "签名区" : "Signature pad"}
        onPointerDown={e => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = e.currentTarget.getContext("2d")!; const [x, y] = at(e); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#111"; ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={e => { if (!drawing.current) return; const ctx = e.currentTarget.getContext("2d")!; const [x, y] = at(e); ctx.lineTo(x, y); ctx.stroke(); inked.current = true; }}
        onPointerUp={() => { drawing.current = false; emit(); }} />
      <div className="sigpad-row">
        <input placeholder={zh ? "签署人姓名" : "Signer's name"} value={name} onChange={e => { setName(e.target.value); emit(e.target.value, title); }} />
        <input placeholder={zh ? "职务" : "Title"} value={title} onChange={e => { setTitle(e.target.value); emit(name, e.target.value); }} />
        <button type="button" className="pill quiet sm" onClick={() => { const c = cv.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); inked.current = false; onChange(null); }}>{zh ? "清除" : "Clear"}</button>
      </div>
    </div>
  );
}
