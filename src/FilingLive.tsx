import type React from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./ctx";
import type { Application, Bi, Workspace } from "./model";
import { B } from "./model";
import type { Filing } from "./cloud/api";
import { I, Modal, feeTotal } from "./ui";
import { fmtStamp, money } from "./time";
import { FilingHold } from "./SendHold";

/*
 * Watch it file. Every filing, live while it runs and replayable after: each page of the agency's site with what was
 * entered on it (every value one you approved; anything else is refused and shown), the review page checked against
 * your approval, and what the agency sent back. Devin's replay is for engineers and Muse keeps a log of actions; this
 * is the proof a business owner can read, with Stop until the moment anything leaves and Take over when a person is
 * needed.
 */

type Kind = "check" | "open" | "page" | "fill" | "upload" | "click" | "refused" | "review" | "pay" | "submit" | "submitted" | "sent"
  | "needs" | "team" | "stopped" | "retry" | "info";
type Ev = { kind: Kind; at?: string; text: Bi; label?: Bi; value?: string; frame?: number; row?: number; ref?: string };
type Frame = { kind: "page" | "review" | "done"; title: Bi; rows: { label: Bi; value: string }[]; img?: string; note?: Bi };
type State = "queued" | "running" | "needs_you" | "done" | "team" | "stopped" | "failed" | "held";
export type Run = {
  app: Application; host: string; channel: string; state: State; events: Ev[]; frames: Frame[];
  confirmation?: string; sample: boolean; filing?: Filing; receipt?: string; pdf?: string;
};

/* ------------------------------ masking ------------------------------ */

const SECRET = /\b(ssn|social security|itin|e?in|fein|tax ?id|tin|account|routing|card|password|license (no|number))\b/i;
/** Numbers that identify a person or an account show only their last four, wherever this view shows them. */
export function masked(label: string, value: string): string {
  if (!SECRET.test(label) || value.includes("•")) return value;
  const d = value.replace(/\D/g, "");
  return d.length >= 4 ? "•••" + d.slice(-4) : "••••";
}

/* ------------------------------ building a run ------------------------------ */

const hostOf = (u?: string | null) => { try { return u ? new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
const isImg = (p?: string | null) => !!p && /\.(png|jpe?g|webp)$/i.test(p);
const CHAN: Record<string, Bi> = {
  portal: B("on the agency's site", "在机构网站上"), email: B("by email", "通过邮件"), fax: B("by fax", "通过传真"), mail: B("by certified mail", "通过挂号信"), team: B("with the Placetta team", "由快哉团队"),
};

/** An account's filing, from the log the file function and the portal worker write as they go. */
function fromFiling(f: Filing, app: Application): Run {
  const events: Ev[] = [], frames: Frame[] = [];
  let page = -1;
  const host = hostOf(f.portal_url) || hostOf(app.source.url);
  for (const e of f.agent_log ?? []) {
    if (e.kind === "quiet") continue;
    const text = { en: e.en, zh: e.zh }, at = e.at;
    switch (e.kind) {
      case "page": {
        frames.push({ kind: "page", title: { en: e.en.replace(/^On (the page )?/, "").replace(/^[“"]|[”"]$/g, ""), zh: e.zh.replace(/^在页面/, "").replace(/^[“"]|[”"]$/g, "") }, rows: [], img: isImg(e.ref) ? e.ref : undefined });
        page = frames.length - 1;
        events.push({ kind: "page", at, text, frame: page });
        break;
      }
      case "fill": case "upload": {
        const label = e.en.replace(/^(Filled|Attached) /, "");
        const fr = frames[page];
        const v = e.kind === "upload" ? label : e.value ?? "";
        if (fr) fr.rows.push({ label: { en: label, zh: e.zh.replace(/^已(填写|上传) ?/, "") || label }, value: masked(label, v) });
        events.push({ kind: e.kind, at, text, label: fr ? fr.rows[fr.rows.length - 1].label : { en: label, zh: label }, value: v ? masked(label, v) : undefined, frame: page >= 0 ? page : undefined, row: fr ? fr.rows.length - 1 : undefined });
        break;
      }
      case "click": events.push({ kind: "click", at, text, frame: page >= 0 ? page : undefined }); break;
      case "refused": events.push({ kind: "refused", at, text }); break;
      case "review_page": case "submit": {
        if (e.ref && isImg(e.ref)) { frames.push({ kind: "review", title: B("Review page", "核对页面"), rows: [], img: e.ref }); page = frames.length - 1; }
        events.push({ kind: e.kind === "submit" ? "submit" : "review", at, text, frame: e.ref && isImg(e.ref) ? page : undefined });
        break;
      }
      case "submitted": events.push({ kind: "submitted", at, text, ref: e.ref }); break;
      case "check": events.push({ kind: "check", at, text }); break;
      case "visit": case "queued": events.push({ kind: "open", at, text }); break;
      case "need_person": case "needs_you": case "wet_signature": events.push({ kind: "needs", at, text }); break;
      case "handoff": case "take_over": case "review_wait": case "you_sent": events.push({ kind: "team", at, text }); break;
      case "stopped": case "undone": events.push({ kind: "stopped", at, text }); break;
      case "retry": case "fax_failed": events.push({ kind: "retry", at, text }); break;
      case "fax_queued": case "mail_event": events.push({ kind: "sent", at, text }); break;
      default: events.push({ kind: "info", at, text });
    }
  }
  if (f.receipt_path && isImg(f.receipt_path)) {
    frames.push({ kind: "done", title: B("What the agency sent back", "机构的回执"), rows: [], img: f.receipt_path });
    const last = [...events].reverse().find(e => e.kind === "submitted");
    if (last) last.frame = frames.length - 1;
  }
  const st = f.agent_state;
  const state: State = f.status === "canceled" ? "stopped"
    : f.status === "submitted" || f.status === "accepted" || st === "done" ? "done"
    : st === "held" ? "held" : st === "needs_you" ? "needs_you" : st === "running" ? "running" : st === "queued" ? "queued"
    : st === "failed" ? "failed" : "team";
  return { app, host, channel: f.channel ?? "team", state, events, frames, confirmation: f.confirmation_number ?? undefined, sample: false, filing: f, receipt: f.receipt_path ?? undefined, pdf: f.payload?.pdf_path };
}

const PAGES = [B("About the business", "企业信息"), B("Application details", "申请详情"), B("Owners and contacts", "负责人与联系方式")];
const seed = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 1_000_000, 7);

/** The sample workspace's filings, drawn from the application itself: its answers, page by page, and its documents. */
function sampleRun(w: Workspace, app: Application): Run | null {
  if (!["review", "approved", "filing"].includes(app.status) || !app.receipt) return null;
  const host = hostOf(app.source.url) || "agency.gov";
  const done = w.audit.find(x => x.object.en === app.name.en && /^Submitted/.test(x.action.en));
  const end = done?.at ?? w.docs.find(d => d.id === app.receipt)?.at ?? new Date().toISOString();
  const t = (i: number) => new Date(new Date(end).getTime() - (40 - i) * 4_000).toISOString();
  const events: Ev[] = [], frames: Frame[] = [];
  let i = 0;
  events.push({ kind: "check", at: t(i++), text: B("Checked every answer against the agency's current requirements", "已对照机构现行要求核对每一项回答") });
  events.push({ kind: "open", at: t(i++), text: B(`Signed in to ${host} with your saved login`, `使用您保存的登录信息进入 ${host}`) });
  const filled = app.fields.filter(f => f.value);
  const per = Math.max(3, Math.ceil(filled.length / Math.min(3, Math.max(1, Math.ceil(filled.length / 5)))));
  for (let p = 0; p * per < filled.length; p++) {
    const part = filled.slice(p * per, p * per + per);
    frames.push({ kind: "page", title: PAGES[p % PAGES.length], rows: part.map(f => ({ label: f.label, value: masked(f.label.en, f.value) })) });
    const fr = frames.length - 1;
    events.push({ kind: "page", at: t(i++), text: { en: `On “${PAGES[p % PAGES.length].en}”`, zh: `在“${PAGES[p % PAGES.length].zh}”页面` }, frame: fr });
    part.forEach((f, r) => events.push({ kind: "fill", at: t(i++), text: { en: `Filled ${f.label.en}`, zh: `已填写 ${f.label.zh}` }, label: f.label, value: masked(f.label.en, f.value), frame: fr, row: r }));
    events.push({ kind: "click", at: t(i++), text: B("Pressed Next", "点击下一步"), frame: fr });
  }
  const docs = app.checklist.filter(c => c.state === "done" && c.doc).map(c => ({ c, d: w.docs.find(d => d.id === c.doc) })).filter(x => x.d);
  if (docs.length) {
    frames.push({ kind: "page", title: B("Documents", "文件"), rows: docs.map(x => ({ label: x.c.label, value: x.d!.name })) });
    const fr = frames.length - 1;
    events.push({ kind: "page", at: t(i++), text: B("On “Documents”", "在“文件”页面"), frame: fr });
    docs.forEach((x, r) => events.push({ kind: "upload", at: t(i++), text: { en: `Attached ${x.d!.name}`, zh: `已上传 ${x.d!.name}` }, label: x.c.label, value: x.d!.name, frame: fr, row: r }));
  }
  frames.push({ kind: "review", title: B("Review and submit", "核对并提交"), rows: filled.map(f => ({ label: f.label, value: masked(f.label.en, f.value) })) });
  const rv = frames.length - 1;
  events.push({ kind: "review", at: t(i++), text: B("Checked the review page against what you approved: every line matches", "已核对页面与您批准的内容：每一行都一致"), frame: rv });
  const fee = feeTotal(app);
  if (fee) events.push({ kind: "pay", at: t(i++), text: B(`Paid the ${money(fee, app.currency)} agency fee`, `支付机构费用 ${money(fee, app.currency)}`), frame: rv });
  events.push({ kind: "submit", at: t(i++), text: B("Pressed Submit", "点击提交"), frame: rv });
  const conf = `${host.split(".")[0].slice(0, 3).toUpperCase()}-${new Date(end).getFullYear()}-${String(seed(app.id)).padStart(6, "0")}`;
  frames.push({ kind: "done", title: B("Application submitted", "申请已提交"), rows: [{ label: B("Confirmation number", "确认号"), value: conf }, { label: B("Submitted", "提交时间"), value: fmtStamp(end).slice(0, 16) }], note: B("Sample", "示例") });
  events.push({ kind: "submitted", at: end, text: { en: `Submitted on ${host}. Confirmation ${conf}`, zh: `已在 ${host} 提交，确认号 ${conf}` }, frame: frames.length - 1 });
  return { app, host, channel: "portal", state: app.status === "filing" ? "running" : "done", events, frames, confirmation: conf, sample: true, receipt: app.receipt };
}

export function useRun(appId: string): Run | null {
  const { ws, cloud } = useApp();
  return useMemo(() => {
    const app = ws.apps.find(a => a.id === appId);
    if (!app) return null;
    if (cloud) {
      const f = cloud.filings.find(x => x.app_id === appId && (x.status !== "canceled" || (x.agent_log ?? []).some(e => e.kind === "stopped")));
      return f && (f.agent_log?.length || f.agent_state) ? fromFiling(f, app) : null;
    }
    return sampleRun(ws, app);
  }, [ws, cloud, appId]);
}

/* ------------------------------ the card ------------------------------ */

const played = new Set<string>();
const ICON: Partial<Record<Kind, () => React.ReactElement>> = { check: I.shield, review: I.shield, refused: I.shield, submitted: I.check, stopped: I.stopSq, needs: I.pause };

type Group = { ev: Ev; kids: Ev[] };
const groupOf = (evs: Ev[]): Group[] => {
  const out: Group[] = [];
  for (const e of evs) {
    if ((e.kind === "fill" || e.kind === "upload" || e.kind === "click") && out.length && out[out.length - 1].ev.kind === "page") out[out.length - 1].kids.push(e);
    else out.push({ ev: e, kids: [] });
  }
  return out;
};

export function FilingLive({ app: appId, embedded }: { app: string; embedded?: boolean }) {
  const { b, lang, cloud, busy, download } = useApp();
  const run = useRun(appId);
  const zh = lang === "zh";
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const [stopping, setStopping] = useState(false);
  // the sample plays its filing once, as it would arrive live; an account's arrives from the server as it happens
  const [fresh] = useState(() => !!run?.sample && !played.has(appId) && Date.now() - new Date(run.events.at(-1)?.at ?? 0).getTime() < 30_000);
  const [shown, setShown] = useState(fresh ? 1 : Infinity);
  const tick = useRef(0);
  const n = run?.events.length ?? 0;
  useEffect(() => {
    if (!fresh) return;
    played.add(appId);
    tick.current = window.setInterval(() => setShown(s => (s >= n ? Infinity : s + 1)), 450);
    return () => clearInterval(tick.current);
  }, [fresh, appId, n]);
  useEffect(() => { if (shown === Infinity) clearInterval(tick.current); }, [shown]);
  if (!run) return null;

  const evs = run.events.slice(0, shown);
  const playing = shown !== Infinity;
  const state: State = playing ? "running" : run.state;
  const groups = groupOf(evs);
  const long = groups.length > 7 && !all && !playing;
  const visible = long ? [...groups.slice(0, 2), ...groups.slice(-4)] : groups;
  const hidden = groups.length - visible.length;
  const at = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }) : "");
  const t0 = run.events[0]?.at, t1 = run.events.at(-1)?.at;
  const took = t0 && t1 && state === "done" ? Math.max(1, Math.round((new Date(t1).getTime() - new Date(t0).getTime()) / 1000)) : 0;
  const tookTx = took ? (took < 90 ? (zh ? `用时 ${took} 秒` : `Took ${took}s`) : (zh ? `用时 ${Math.round(took / 60)} 分钟` : `Took ${Math.round(took / 60)} min`)) : "";
  const f = run.filing;
  // Stopping is an owner's (the file function refuses it from members), so members don't see the button.
  const canStop = !!cloud?.owner && !!f && !f.submit_clicked_at && ["queued", "running", "needs_you"].includes(f.agent_state ?? "") && !["submitted", "accepted", "rejected", "canceled"].includes(f.status);
  const refused = run.events.filter(e => e.kind === "refused").length;
  const head: Record<State, Bi> = {
    queued: B("Starting", "即将开始"), running: B("Filing now", "正在提交"), needs_you: B("Needs you for one step", "需要您完成一步"),
    done: B("Submitted", "已提交"), team: B("With the Placetta team", "由快哉团队处理"), stopped: B("Stopped before anything was sent", "已在发送前停止"), failed: B("Didn't go through", "未能完成"),
    held: B("Approved, waiting before it's sent", "已批准，等待发送"),
  };
  const evIndex = (e: Ev) => run.events.indexOf(e);

  return (
    <section className={"fl st-" + state + (embedded ? " embedded" : "")} aria-label={zh ? `${b(run.app.name)}的提交过程` : `Filing the ${b(run.app.name).toLowerCase()}`}>
      <header className="fl-h">
        <span className="fl-dot" aria-hidden="true" />
        <span className="fl-t">
          <b aria-live="polite">{b(head[state])}<em>{b(CHAN[run.channel] ?? CHAN.team)}{run.host && run.channel === "portal" ? `, ${run.host}` : ""}</em></b>
          {!embedded && <small>{b(run.app.name)}, {b(run.app.agency)}</small>}
        </span>
        {run.sample && <span className="tag">{zh ? "示例" : "Sample"}</span>}
        {canStop && <button type="button" className="pill quiet sm fl-stop" disabled={stopping || busy} onClick={() => { setStopping(true); void cloud!.stopFiling(f!.id).finally(() => setStopping(false)); }}><I.stopSq />{zh ? "停止" : "Stop"}</button>}
      </header>

      {f && state === "held" && <FilingHold f={f} />}

      <ol className="fl-evs">
        {visible.map((g, gi) => {
          const e = g.ev, Ic = ICON[e.kind];
          const pg = e.kind === "page";
          const frame = e.frame !== undefined ? run.frames[e.frame] : undefined;
          const answers = g.kids.filter(k => k.kind === "fill").length, files = g.kids.filter(k => k.kind === "upload").length;
          return (
            <Fragment key={gi}>
            {long && gi === 2 && <li className="fl-more-li"><button type="button" className="fl-more" onClick={() => setAll(true)}>{zh ? `显示另外 ${hidden} 步` : `Show ${hidden} more steps`}</button></li>}
            <li className={"k-" + e.kind + (gi === visible.length - 1 && (state === "running" || state === "queued") ? " now" : "")}>
              <span className="fl-i" aria-hidden="true">{Ic ? <Ic /> : <i />}</span>
              <div className="fl-tx">
                {pg ? (
                  <details open={playing && gi === visible.length - 1}>
                    <summary><span>{b(e.text)}</span><small>{[answers ? (zh ? `${answers} 项回答` : `${answers} answer${answers === 1 ? "" : "s"}`) : "", files ? (zh ? `${files} 份文件` : `${files} file${files === 1 ? "" : "s"}`) : "", answers || files ? (zh ? "均为您批准的内容" : "all as you approved") : ""].filter(Boolean).join(zh ? "，" : ", ")}</small></summary>
                    <ul className="fl-rows">{g.kids.filter(k => k.kind !== "click").map((k, ki) => (
                      <li key={ki}><span>{k.label ? b(k.label) : b(k.text)}</span><b>{k.value ?? ""}</b><I.check /></li>
                    ))}</ul>
                  </details>
                ) : (
                  <span className="fl-line">{b(e.text)}</span>
                )}
                {e.kind === "refused" && <small className="fl-safe">{zh ? "Odelia 只会填写您批准的内容。" : "Odelia only ever enters what you approved."}</small>}
              </div>
              {frame && <button type="button" className="fl-thumb" onClick={() => setOpen(evIndex(e))} aria-label={zh ? "查看这一页" : "See this page"}><Shot frame={frame} host={run.host} small /></button>}
              <time>{at(e.at)}</time>
            </li>
            </Fragment>
          );
        })}
      </ol>

      {state === "needs_you" && f?.handoff_url && (
        <p className="fl-take"><span>{zh ? "机构网站需要真人完成一步（如验证码或身份核验）。在实时浏览器中完成后，Odelia 会继续。" : "The agency's site needs a person for one step, like a CAPTCHA or an ID check. Do it in the live browser and Odelia carries on."}</span>
          <a className="pill ink sm" href={f.handoff_url} target="_blank" rel="noopener noreferrer">{zh ? "接手浏览器" : "Take over the browser"}<I.ext /></a></p>
      )}

      <footer className="fl-f">
        {run.events.length > 1 && <button type="button" className="pill quiet sm" onClick={() => setOpen(0)}><I.play />{zh ? "回放" : "Replay"}</button>}
        {run.receipt && !run.sample && cloud && <button type="button" className="pill quiet sm" onClick={() => void cloud.fileUrl(run.receipt!).then(u => u && window.open(u, "_blank", "noopener"))}>{zh ? "机构回执" : "Agency receipt"}</button>}
        {run.receipt && run.sample && <button type="button" className="pill quiet sm" onClick={() => download(run.receipt!)}>{zh ? "机构回执" : "Agency receipt"}</button>}
        {run.pdf && cloud && <button type="button" className="pill quiet sm" onClick={() => void cloud.fileUrl(run.pdf!).then(u => u && window.open(u, "_blank", "noopener"))}>{zh ? "发送的表格" : "The form as sent"}</button>}
        <small>{[refused ? (zh ? `拒绝了 ${refused} 个未经批准的值` : `${refused} unapproved value${refused === 1 ? "" : "s"} refused`) : "", run.confirmation && state === "done" ? (zh ? `确认号 ${run.confirmation}` : `Confirmation ${run.confirmation}`) : "", tookTx].filter(Boolean).join(zh ? "，" : ", ")}</small>
      </footer>

      {open !== null && <Replay run={run} start={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ------------------------------ a page, as Placetta saw it ------------------------------ */

function Shot({ frame, host, hi, small }: { frame: Frame; host: string; hi?: number; small?: boolean }) {
  const { b, cloud } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (frame.img && cloud) void cloud.fileUrl(frame.img).then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [frame.img, cloud]);
  if (frame.img) return <span className={"shot img" + (small ? " sm" : "")}>{url ? <img src={url} alt={b(frame.title)} /> : <i />}</span>;
  return (
    <span className={"shot draw k-" + frame.kind + (small ? " sm" : "")} aria-hidden={small}>
      <span className="sh-bar"><i /><i /><i /><em>{host}</em></span>
      <span className="sh-body">
        {frame.kind === "done" && <span className="sh-ok"><I.check /></span>}
        <b>{b(frame.title)}</b>
        {frame.rows.slice(0, small ? 4 : 14).map((r, i) => (
          <span key={i} className={"sh-row" + (hi === i ? " hi" : "")}><small>{b(r.label)}</small><span>{r.value}</span></span>
        ))}
        {frame.kind === "review" && !small && <span className="sh-btn">Submit</span>}
      </span>
      {frame.note && !small && <em className="sh-note">{b(frame.note)}</em>}
    </span>
  );
}

/* ------------------------------ replay ------------------------------ */

function Replay({ run, start, onClose }: { run: Run; start: number; onClose: () => void }) {
  const { b, lang } = useApp();
  const zh = lang === "zh";
  const evs = run.events;
  const [i, setI] = useState(Math.min(start, evs.length - 1));
  const [playing, setPlaying] = useState(start === 0);
  const timer = useRef(0);
  const next = useCallback(() => setI(x => Math.min(evs.length - 1, x + 1)), [evs.length]);
  const prev = useCallback(() => setI(x => Math.max(0, x - 1)), []);
  useEffect(() => {
    if (!playing) return;
    if (i >= evs.length - 1) { setPlaying(false); return; }
    timer.current = window.setTimeout(next, evs[i].kind === "fill" || evs[i].kind === "upload" || evs[i].kind === "click" ? 700 : 1500);
    return () => clearTimeout(timer.current);
  }, [playing, i, evs, next]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") { setPlaying(false); next(); } else if (e.key === "ArrowLeft") { setPlaying(false); prev(); } else if (e.key === " ") { e.preventDefault(); setPlaying(p => !p); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [next, prev]);
  const e = evs[i];
  // the page this step happened on: its own, or the last one before it
  let fi = e.frame;
  for (let j = i; fi === undefined && j >= 0; j--) fi = evs[j].frame;
  const frame = fi !== undefined ? run.frames[fi] : undefined;
  const at = e.at ? new Date(e.at).toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" }) : "";
  return (
    <Modal label={zh ? "回放" : "Replay"} onClose={onClose} wide>
      <div className="rp">
        <header className="rp-h">
          <b>{b(run.app.name)}</b>
          <span>{b(run.app.agency)}{run.sample ? (zh ? "，示例" : ", sample") : ""}</span>
          <button type="button" className="icbtn" onClick={onClose} aria-label={zh ? "关闭" : "Close"}><I.x /></button>
        </header>
        <div className="rp-stage">{frame ? <Shot frame={frame} host={run.host} hi={e.frame === fi ? e.row : undefined} /> : <span className="shot blank"><b>{b(e.text)}</b></span>}</div>
        <div className="rp-cap" aria-live="polite">
          <span className="rp-n">{i + 1} / {evs.length}</span>
          <span className="rp-tx"><b>{e.label && (e.kind === "fill" || e.kind === "upload") ? b(e.label) : b(e.text)}</b>{e.value && <em>{e.value}</em>}{(e.kind === "fill" || e.kind === "upload") && <small><I.check />{zh ? "与您批准的一致" : "Matches what you approved"}</small>}</span>
          <time>{at}</time>
        </div>
        <input className="rp-scrub" type="range" min={0} max={evs.length - 1} value={i} onChange={x => { setPlaying(false); setI(Number(x.target.value)); }} aria-label={zh ? "步骤" : "Step"} />
        <div className="rp-ctl">
          <button type="button" className="icbtn" onClick={() => { setPlaying(false); prev(); }} disabled={i === 0} aria-label={zh ? "上一步" : "Previous step"}><I.chevL /></button>
          <button type="button" className="pill ink sm" onClick={() => { if (i >= evs.length - 1) setI(0); setPlaying(p => !p || i >= evs.length - 1); }}>{playing ? <><I.pause />{zh ? "暂停" : "Pause"}</> : <><I.play />{i >= evs.length - 1 ? (zh ? "从头播放" : "Play again") : (zh ? "播放" : "Play")}</>}</button>
          <button type="button" className="icbtn" onClick={() => { setPlaying(false); next(); }} disabled={i >= evs.length - 1} aria-label={zh ? "下一步" : "Next step"}><I.chevR /></button>
        </div>
      </div>
    </Modal>
  );
}
