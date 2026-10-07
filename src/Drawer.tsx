import { useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp, type Tab } from "./ctx";
import type { Application, CheckItem, Doc } from "./model";
import { formById, METHOD } from "./forms/registry";
import { saveFile } from "./files";
import { fmtDay } from "./time";
import { fmtStamp, money } from "./time";
import { FileCard, I, LevelTag, Modal, Pill, Sample, Sheet, StatusChip, feeTotal } from "./ui";
import { INK } from "./pages";
import { Working } from "./Bot";

/* ------------------------- application, opened ------------------------- */

export function AppDrawer({ id, tab, edit, onTab, onClose }: { id: string; tab: Tab; edit: boolean; onTab: (t: Tab) => void; onClose: () => void }) {
  const { b, t, ws, openApproval, busy } = useApp();
  const a = ws.apps.find(x => x.id === id);
  if (!a) return null;
  const appr = ws.approvals.find(x => x.app === id && x.kind !== "upload");
  const done = a.checklist.filter(c => c.state !== "missing").length;
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
        <p className="sh-ag">
          <span>{b(a.agency)}</span>
          <a href={a.source.url} target="_blank" rel="noopener noreferrer" title={t("source")}>{a.source.label}<I.ext /></a>
        </p>
        {a.next && <p className="sh-next">{a.critical && <em>{t("critical")}</em>}{b(a.next)}</p>}
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
      {appr && (
        <footer className="sh-f">
          <span><I.pause />{t("waitingYou")}</span>
          <Pill kind="ink" disabled={busy} onClick={() => openApproval(appr.id)}>{t("review")}</Pill>
        </footer>
      )}
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
    { k: "prep", s: "done", t: zh ? "快哉准备了申请" : "Placetta prepared the application", d: [off ? off.form : "", day(prepAt)].filter(Boolean).join(zh ? "，" : ", ") },
    { k: "you", s: past(["ready", "filing", "review", "approved"]) || (!missing && !empty) ? "done" : "now",
      t: zh ? "资料与文件" : "Answers and documents",
      d: past(["ready", "filing", "review", "approved"]) || (!missing && !empty) ? (zh ? "已齐全" : "Complete") : [missing ? (zh ? `还差 ${missing} 份文件` : `${missing} document${missing === 1 ? "" : "s"} still needed`) : "", empty ? (zh ? `${empty} 项信息待填` : `${empty} answer${empty === 1 ? "" : "s"} still needed`) : ""].filter(Boolean).join(zh ? "，" : ", ") },
    { k: "approve", s: past(["filing", "review", "approved"]) || !!f ? "done" : st === "ready" ? "now" : "next",
      t: zh ? "您批准提交" : "You approve the filing", d: f ? (zh ? `已于 ${day(f.approved_at)} 批准` : `Approved ${day(f.approved_at)}`) : undefined,
      act: appr ? { l: zh ? "查看并批准" : "Review and approve", go: () => openApproval(appr.id) } : undefined },
    { k: "team", s: past(["review", "approved"]) ? "done" : st === "filing" || (f && ["requested", "in_progress", "needs_info"].includes(f.status)) ? (pay ? "blocked" : "now") : "next",
      t: zh ? "申报团队核对并提交" : "The filing team checks and submits it",
      d: pay ? (zh ? "等待您向机构付款" : "Waiting for you to pay the agency fee") : f?.status === "needs_info" && f.note ? f.note : f?.requirements_checked ? (zh ? "已按机构现行要求核对" : "Checked against the agency's current requirements") : f ? (zh ? "团队已接手" : "With the team") : undefined,
      act: pay ? { l: zh ? "去付款" : "Pay the agency", go: () => openApproval(pay.id) } : undefined },
    { k: "agency", s: st === "approved" ? "done" : st === "review" ? "now" : "next",
      t: zh ? "机构审核" : "The agency reviews it",
      d: f?.submitted_at ? [zh ? `${day(f.submitted_at)} 提交` : `Submitted ${day(f.submitted_at)}`, f.confirmation_number ? (zh ? `确认号 ${f.confirmation_number}` : `confirmation ${f.confirmation_number}`) : "", tbc ? "" : zh ? `通常需要：${b(a.est)}` : `usually takes ${b(a.est)}`].filter(Boolean).join(zh ? "，" : ", ") : tbc ? undefined : (zh ? `通常需要：${b(a.est)}` : `Usually takes ${b(a.est)}`) },
    { k: "done", s: st === "approved" ? "done" : "next", t: zh ? "批准并发证" : "Approved and issued",
      d: st === "approved" ? [f?.decided_at ? day(f.decided_at) : "", a.renews ? b(a.renews) : ""].filter(Boolean).join(zh ? "。" : ". ") : a.renews ? (zh ? `续期：${b(a.renews)}` : `Renewal: ${b(a.renews)}`) : undefined },
  ];
  const cur = steps.findIndex(s => s.s !== "done");
  return (
    <div className="pg">
      <p className="pg-live"><i />{cloud ? (zh ? "实时更新：团队或机构有任何进展，这里会立即显示。" : "Live: every change from the team or the agency shows here as it happens.") : (zh ? "示例进度" : "Sample progress")}</p>
      <ol className="pg-steps">
        {steps.map((s, i) => (
          <li key={s.k} className={"st-" + s.s + (i === cur ? " cur" : "")}>
            <span className="dot" aria-hidden="true">{s.s === "done" ? <I.check /> : i + 1}</span>
            <div><b>{s.t}</b>{s.d && <small>{s.d}</small>}{s.act && i === cur && <button type="button" className="pill ink sm" onClick={s.act.go}>{s.act.l}</button>}</div>
          </li>
        ))}
      </ol>
      {f?.note && f.status !== "needs_info" && <p className="note">{zh ? "团队备注：" : "From the team: "}{f.note}</p>}
    </div>
  );
}

function Checklist({ a }: { a: Application }) {
  return <ul className="checklist">{a.checklist.map(c => <CheckRow key={c.id} a={a} c={c} />)}</ul>;
}

function CheckRow({ a, c }: { a: Application; c: CheckItem }) {
  const { b, t, ws, uploading, upload, busy, cloud } = useApp();
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
            {!cloud && <button type="button" className="pill quiet sm" disabled={busy} onClick={() => upload(a.id, c.id)}>{t("useSample")}</button>}
            <input ref={input} type="file" hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(a.id, c.id, f); }} />
          </div>
        )}
      </div>
    </li>
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
  return (
    <div className="formwrap">
      {off && (
        <div className="official">
          <div className="off-h"><I.form /><div><b>{off.form}</b><span>{b(off.title)}</span></div></div>
          <p>{lang === "zh" ? `${off.agency.zh}。${METHOD[off.method].zh}。${off.how.zh}` : `${off.agency.en}. ${METHOD[off.method].en}. ${off.how.en}`}</p>
          {off.foreign && <p className="off-note">{b(off.foreign)}</p>}
          <div className="off-act">
            {off.fill && <button type="button" className="pill ink sm" disabled={making} onClick={() => void official()}><I.download />{making ? "…" : lang === "zh" ? "下载已填写的官方表格" : "Download the filled official form"}</button>}
            <a className="pill quiet sm" href={off.pdf ?? off.url} target="_blank" rel="noopener noreferrer">{off.pdf ? (lang === "zh" ? "官方表格" : "Official form") : (lang === "zh" ? "机构办理入口" : "Agency filing page")}<I.ext /></a>
            {off.info !== (off.pdf ?? off.url) && <a className="pill quiet sm" href={off.info} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "机构说明" : "Agency page"}<I.ext /></a>}
          </div>
        </div>
      )}
      <div className="paper">
        <div className="paper-h"><span>{b(a.agency)}</span><b>{b(a.form ?? a.name)}</b>{!cloud && <Sample />}</div>
        <dl>
          {a.fields.map(f => (
            <div key={f.id} className={f.value ? "" : "empty"}>
              <dt>{b(f.label)}</dt>
              <dd>
                {edit ? <input value={vals[f.id] ?? ""} onChange={e => setVals(v => ({ ...v, [f.id]: e.target.value }))} aria-label={b(f.label)} />
                  : <span>{f.value || t("empty")}</span>}
                {f.from && !edit && <small>{b(f.from)}</small>}
                {f.quote && !edit && <q className="cite">{f.quote}</q>}
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
          <button type="button" className="pill quiet" onClick={() => downloadApp(a.id)}><I.download />{a.official ? (lang === "zh" ? "下载字段清单" : "Download the field sheet") : t("download") + " PDF"}</button>
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
        {a.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{f.amount ? money(f.amount, a.currency) : t("free")}</dd></div>)}
        <div className="tot"><dt>{t("total")}</dt><dd>{total ? money(total, a.currency) : t("free")}</dd></div>
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
  const total = feeTotal(a);
  return (
    <div className="receipt">
      <FileCard d={d} />
      <dl className="card kv">
        <div><dt>{t("au_time")}</dt><dd className="mono">{fmtStamp(d.at)}</dd></div>
        <div><dt>{t("ap_fee")}</dt><dd>{total ? money(total, a.currency) : t("free")}</dd></div>
      </dl>
    </div>
  );
}

/* ------------------------------- approval ------------------------------- */

export function ApproveModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, t, lang, ws, approve, openApp, busy, cloud } = useApp();
  const a = ws.approvals.find(x => x.id === id);
  if (!a) return null;
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = app && a.kind === "file" ? feeTotal(app) : 0;
  const atts = app ? app.checklist.map(c => (c.doc ? ws.docs.find(d => d.id === c.doc) : undefined)).filter((d): d is Doc => !!d) : [];
  const data = a.kind === "send" || a.kind === "change" ? a.data ?? [] : app?.fields ?? [];
  return (
    <Modal label={b(a.title)} onClose={onClose} wide>
      <header className="m-h">
        <span className="m-eyebrow"><I.lock />{t("ap_title")}</span>
        <h2>{b(a.title)}</h2>
        <p>{[a.agency && b(a.agency), app?.form && b(app.form)].filter(Boolean).join(lang === "zh" ? "。" : ". ")}</p>
        <button type="button" className="icbtn close" onClick={onClose} aria-label={t("close")}><I.x /></button>
      </header>
      <div className="m-body">
        <section>
          <h3>{t("ap_does")}</h3>
          <ol className="does">{a.does.map((d, i) => <li key={i}>{b(d)}</li>)}</ol>
        </section>
        <section>
          <h3>{a.kind === "send" ? t("ap_msg") : t("ap_data")}</h3>
          <dl className="kv data">{data.map(f => <div key={f.id}><dt>{b(f.label)}</dt><dd>{f.value || t("empty")}</dd></div>)}</dl>
        </section>
        {atts.length > 0 && (
          <section>
            <h3>{t("ap_att")}</h3>
            <div className="files">{atts.map(d => <FileCard key={d.id} d={d} compact />)}</div>
          </section>
        )}
        {app && a.kind === "file" && (
          <section>
            <h3>{t("ap_fee")}</h3>
            <dl className="kv feelist">
              {app.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{f.amount ? money(f.amount, app.currency) : t("free")}</dd></div>)}
              <div className="tot"><dt>{t("total")}</dt><dd>{fee ? money(fee, app.currency) : t("free")}</dd></div>
            </dl>
            {fee > 0 && <p className="note">{cloud ? t("paidDirect") : t("paidAfter")}</p>}
          </section>
        )}
      </div>
      <footer className="m-f">
        <p>{t("ap_note")} {cloud ? (a.kind === "file" ? t("ap_team") : "") : t("ap_sim")}</p>
        <div className="m-btns">
          {app && <button type="button" className="pill quiet" onClick={() => { onClose(); openApp(app.id, "form", true); }}><I.pencil />{t("ap_edit")}</button>}
          <Pill kind="ink" disabled={busy} onClick={() => { approve(a.id); onClose(); }}>{b(a.action)}</Pill>
        </div>
      </footer>
    </Modal>
  );
}
