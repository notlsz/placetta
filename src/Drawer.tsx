import { useRef, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useApp, type Tab } from "./ctx";
import type { Application, CheckItem, Doc } from "./model";
import { fmtStamp, money } from "./time";
import { FileCard, I, LevelTag, Modal, Sample, Sheet, StatusChip, feeTotal } from "./ui";
import { INK } from "./pages";

/* ------------------------- application, opened ------------------------- */

export function AppDrawer({ id, tab, edit, onTab, onClose }: { id: string; tab: Tab; edit: boolean; onTab: (t: Tab) => void; onClose: () => void }) {
  const { b, t, ws, openApproval, busy } = useApp();
  const a = ws.apps.find(x => x.id === id);
  if (!a) return null;
  const appr = ws.approvals.find(x => x.app === id && x.kind !== "upload");
  const done = a.checklist.filter(c => c.state !== "missing").length;
  const tabs: { k: Tab; l: string; n?: string }[] = [
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
        <nav className="tabs" role="tablist">
          {tabs.map(x => <button key={x.k} type="button" role="tab" aria-selected={tab === x.k} onClick={() => onTab(x.k)}>{x.l}{x.n && <span>{x.n}</span>}</button>)}
        </nav>
      </header>
      <div className="sh-body">
        {tab === "check" && <Checklist a={a} />}
        {tab === "form" && <FormPreview key={a.id + String(edit)} a={a} startEdit={edit} />}
        {tab === "fees" && <Fees a={a} />}
        {tab === "receipt" && <Receipt a={a} />}
      </div>
      {appr && (
        <footer className="sh-f">
          <span><I.pause />{t("waitingYou")}</span>
          <button type="button" className="btn ink" disabled={busy} onClick={() => openApproval(appr.id)}>{t("review")}<I.arrow /></button>
        </footer>
      )}
    </Sheet>
  );
}

function Checklist({ a }: { a: Application }) {
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
        {reading ? <small>{t("reading")}…</small>
          : dep ? <small>{t("comesFrom", { x: b(dep.name) })}</small>
            : c.note ? <small>{b(c.note)}</small>
              : c.state === "auto" ? <small>{t("prepares")}</small> : null}
        {doc && <FileCard d={doc} compact />}
        {c.extracted && (
          <div className="extract">
            <span className="ex-h"><I.spark />{t("placettaRead")}</span>
            <dl>{c.extracted.map(([k, v], i) => <div key={i}><dt>{b(k)}</dt><dd>{v}</dd></div>)}</dl>
          </div>
        )}
        {c.state === "missing" && !c.dep && !reading && (
          <div className="ck-act">
            <button type="button" className="btn ink sm" disabled={busy} onClick={() => input.current?.click()}><I.upload />{t("upload")}</button>
            <button type="button" className="btn ghost sm" disabled={busy} onClick={() => upload(a.id, c.id)}>{t("useSample")}</button>
            <input ref={input} type="file" hidden onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) upload(a.id, c.id, f); }} />
          </div>
        )}
      </div>
    </li>
  );
}

function FormPreview({ a, startEdit }: { a: Application; startEdit: boolean }) {
  const { b, t, editFields, downloadApp } = useApp();
  const canEdit = !["approved", "review"].includes(a.status) && a.fields.length > 0;
  const [edit, setEdit] = useState(startEdit && canEdit);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(a.fields.map(f => [f.id, f.value])));
  if (!a.fields.length) return <p className="quiet">{t("noForm")}</p>;
  const save = () => {
    const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => a.fields.find(f => f.id === k)?.value !== v));
    if (Object.keys(changed).length) editFields(a.id, changed);
    setEdit(false);
  };
  return (
    <div className="formwrap">
      <div className="paper">
        <div className="paper-h"><span>{b(a.agency)}</span><b>{b(a.form ?? a.name)}</b><Sample /></div>
        <dl>
          {a.fields.map(f => (
            <div key={f.id} className={f.value ? "" : "empty"}>
              <dt>{b(f.label)}</dt>
              <dd>
                {edit ? <input value={vals[f.id] ?? ""} onChange={e => setVals(v => ({ ...v, [f.id]: e.target.value }))} aria-label={b(f.label)} />
                  : <span>{f.value || t("empty")}</span>}
                {f.from && !edit && <small>{b(f.from)}</small>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="form-act">
        {edit ? <>
          <button type="button" className="btn ink" onClick={save}>{t("save")}</button>
          <button type="button" className="btn ghost" onClick={() => { setVals(Object.fromEntries(a.fields.map(f => [f.id, f.value]))); setEdit(false); }}>{t("cancel")}</button>
        </> : <>
          {canEdit && <button type="button" className="btn soft" onClick={() => setEdit(true)}><I.pencil />{t("edit")}</button>}
          <button type="button" className="btn ghost" onClick={() => downloadApp(a.id)}><I.download />{t("download")} PDF</button>
        </>}
      </div>
      <p className="note">{t("formFor")}</p>
    </div>
  );
}

function Fees({ a }: { a: Application }) {
  const { b, t } = useApp();
  const total = feeTotal(a);
  return (
    <div className="fees">
      <dl className="card feelist">
        {a.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{f.amount ? money(f.amount) : t("free")}</dd></div>)}
        <div className="tot"><dt>{t("total")}</dt><dd>{total ? money(total) : t("free")}</dd></div>
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
        <div><dt>{t("ap_fee")}</dt><dd>{total ? money(total) : t("free")}</dd></div>
      </dl>
    </div>
  );
}

/* ------------------------------- approval ------------------------------- */

export function ApproveModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { b, t, lang, ws, approve, openApp, busy } = useApp();
  const a = ws.approvals.find(x => x.id === id);
  if (!a) return null;
  const app = a.app ? ws.apps.find(x => x.id === a.app) : undefined;
  const fee = app && a.kind === "file" ? feeTotal(app) : 0;
  const atts = app ? app.checklist.map(c => (c.doc ? ws.docs.find(d => d.id === c.doc) : undefined)).filter((d): d is Doc => !!d) : [];
  const data = a.kind === "send" ? a.data ?? [] : app?.fields ?? [];
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
              {app.fees.map((f, i) => <div key={i}><dt>{b(f.label)}</dt><dd>{f.amount ? money(f.amount) : t("free")}</dd></div>)}
              <div className="tot"><dt>{t("total")}</dt><dd>{fee ? money(fee) : t("free")}</dd></div>
            </dl>
            {fee > 0 && <p className="note">{t("paidAfter")}</p>}
          </section>
        )}
      </div>
      <footer className="m-f">
        <p>{t("ap_note")}</p>
        <div className="m-btns">
          {app && <button type="button" className="btn ghost" onClick={() => { onClose(); openApp(app.id, "form", true); }}><I.pencil />{t("ap_edit")}</button>}
          <button type="button" className="btn ink" disabled={busy} onClick={() => { approve(a.id); onClose(); }}>{b(a.action)}</button>
        </div>
      </footer>
    </Modal>
  );
}
