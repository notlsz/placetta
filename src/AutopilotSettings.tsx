import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import * as api from "./cloud/api";
import { AUTOPILOT_MONTHS, autopilotPlan, defaultScope, grantOf, grantState, monthUsed, NEED_LABEL, putGrant, revokeGrant, type AutopilotGrant, type AutopilotScope, type PlanRow } from "./autopilot";
import { formById } from "./forms/registry";
import { UPDATED } from "./legal";
import { nowIso } from "./time";
import { Guard } from "./SafeBoundary";
import { SetSheet } from "./SetUI";
import "./controls.css";

/* Autopilot in Settings (src/autopilot.ts): the screen that says exactly what Odelia will do alone and what still needs
   a person, and why; the sheet where an owner signs the standing authorization once (scope, caps, a typed or drawn
   signature, the box); and Turn off, one tap. In an account the database records the signature with the time, IP and
   browser and keeps the signature itself in the vault; in the sample it stays in this workspace. */

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const hostsOf = (logins: { url: string | null }[] | undefined) => (logins ?? []).map(l => { try { return new URL(l.url ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } }).filter(Boolean);

/** What Odelia does alone, and what still needs a person, with why, for every filing not yet filed. */
export function AutopilotPlanList({ rows }: { rows: PlanRow[] }) {
  const { b } = useApp();
  const alone = rows.filter(r => r.alone), person = rows.filter(r => !r.alone);
  return (
    <div className="ap-plan">
      <h3>{b(B(`Odelia files these on her own (${alone.length})`, `Odelia 自行提交（${alone.length}）`))}</h3>
      {alone.length ? (
        <ul className="ap-rows">
          {alone.map(r => (
            <li key={r.app}><b>{b(r.name)}</b><small>{b(r.agency)}</small>
              {r.needs.filter(n => n.after).map((n, i) => <small key={i} className="ap-after">{b(NEED_LABEL[n.kind])}: {b(n.why)}</small>)}
              {r.team.length > 0 && <small className="ap-team">{b(r.team[0])}</small>}
            </li>
          ))}
        </ul>
      ) : <p className="rule-empty">{b(B("None of the filings left in your plan can go without a person yet. Each one below says why.", "目前计划中剩下的申报都还需要人来处理，原因见下方。"))}</p>}
      <h3>{b(B(`These still need a person (${person.length})`, `仍需要人处理（${person.length}）`))}</h3>
      {person.length ? (
        <ul className="ap-rows">
          {person.map(r => (
            <li key={r.app}><b>{b(r.name)}</b><small>{b(r.agency)}</small>
              {r.needs.map((n, i) => <small key={i} className={"ap-need ap-k-" + n.kind}><em>{b(NEED_LABEL[n.kind])}</em> {b(n.why)}</small>)}
            </li>
          ))}
        </ul>
      ) : <p className="rule-empty">{b(B("Nothing: every filing left goes on its own.", "没有：剩下的每项申报都可自动提交。"))}</p>}
    </div>
  );
}

/** A small pad for a drawn signature, as a PNG. Its own canvas, inside a quiet boundary like every canvas. */
function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false), drew = useRef(false);
  const { b } = useApp();
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => { const c = ref.current!, r = c.getBoundingClientRect(); return { x: Math.max(0, (e.clientX - r.left) * (c.width / Math.max(1, r.width))), y: Math.max(0, (e.clientY - r.top) * (c.height / Math.max(1, r.height))) }; };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => { const ctx = ref.current?.getContext("2d"); if (!ctx) return; drawing.current = true; const p = at(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ref.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = ref.current?.getContext("2d"); if (!ctx) return; const p = at(e); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#1d2b44"; ctx.lineTo(p.x, p.y); ctx.stroke(); drew.current = true; };
  const end = () => { if (!drawing.current) return; drawing.current = false; onChange(drew.current ? ref.current!.toDataURL("image/png") : null); };
  const clear = () => { const c = ref.current, ctx = c?.getContext("2d"); if (c && ctx) ctx.clearRect(0, 0, c.width, c.height); drew.current = false; onChange(null); };
  return (
    <div className="ap-pad">
      <canvas ref={ref} width={480} height={140} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} aria-label={b(B("Draw your signature", "手写签名"))} />
      <button type="button" className="sbtn quiet" onClick={clear}>{b(B("Clear", "清除"))}</button>
    </div>
  );
}

/** The sheet where an owner signs Autopilot once. */
export function AutopilotSign({ onClose }: { onClose: () => void }) {
  const { b, lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh";
  const all = useMemo(() => defaultScope(ws), [ws]);
  const [scope, setScope] = useState<AutopilotScope>(all);
  const [capFiling, setCapFiling] = useState("500");
  const [capMonth, setCapMonth] = useState("2000");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [sig, setSig] = useState<"typed" | "drawn">("typed");
  const [png, setPng] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = nowIso();
  const expires = new Date(Date.parse(now) + AUTOPILOT_MONTHS * 30.44 * 864e5).toISOString();
  const draft: AutopilotGrant = { id: "draft", by: name.trim() || "you", at: now, expires, version: UPDATED, scope, capFiling: Number(capFiling) || 0, capMonth: Number(capMonth) || 0, sig };
  const rows = autopilotPlan(ws, { now, as: draft, logins: cloud ? hostsOf(cloud.logins) : undefined });
  const storeName = (id: string): Bi => id === "business" ? B("The business itself (state and federal filings)", "企业本身（州和联邦申报）") : (ws.stores ?? []).find(s => s.id === id)?.name ?? B(id, id);
  const agencyZh = (en: string) => ws.apps.find(a => a.agency.en === en)?.agency.zh ?? en;
  const formName = (id: string): Bi => ws.apps.find(a => a.official === id)?.name ?? formById(id)?.title ?? B(id, id);
  const toggle = (k: keyof AutopilotScope, v: string) => setScope(s => ({ ...s, [k]: s[k].includes(v) ? s[k].filter(x => x !== v) : [...s[k], v] }));
  const capsOk = Number(capFiling) >= 0 && Number(capMonth) >= Number(capFiling) && Number(capFiling) <= 10000 && Number(capMonth) <= 50000 && capFiling !== "" && capMonth !== "";
  const ready = agree && name.trim().length >= 2 && capsOk && scope.stores.length > 0 && scope.agencies.length > 0 && scope.forms.length > 0 && (sig === "typed" || !!png) && !busy;
  const sign = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const g: AutopilotGrant = cloud
        ? await api.autopilotGrant(cloud.wsId, { name: name.trim(), title: title.trim() || undefined, agree, version: UPDATED, scope, capFiling: Number(capFiling), capMonth: Number(capMonth), sig, drawn: png ?? undefined })
        : { ...draft, id: "ap-" + Date.now().toString(36), by: name.trim(), ...(title.trim() ? { title: title.trim() } : {}) };
      editWs(putGrant(g));
      say(zh ? `自动驾驶已开启，有效至 ${g.expires.slice(0, 10)}。可随时一键关闭。` : `Autopilot is on until ${g.expires.slice(0, 10)}. Turn it off any time, in one tap.`);
      onClose();
    } catch (e) {
      const er = e as api.ApiError;
      say((zh && er.message_zh) || er.message || (zh ? "未能签署，请重试。" : "It didn't go through. Try again."));
    } finally { setBusy(false); }
  };
  return (
    <SetSheet title={zh ? "开启自动驾驶" : "Turn on Autopilot"} sub={zh ? "签署一次，Odelia 就在您设定的范围内自行提交，无需每次都问您。" : "Sign once and Odelia files within the limits you set, without asking you each time."} onClose={onClose} className="ap-sheet">
      <form className="sst-form" onSubmit={e => { e.preventDefault(); void sign(); }}>
        <p className="sg-note">{zh ? "您授权快哉代表您的企业，准备并提交下方范围内的申报，每项都会先通过全部自动核对。法律要求由您本人签署的声明、需要手写签名的表格和机构网站上的付款，仍由您完成。" : "You authorize Placetta to prepare and submit, for your business, the filings in the scope below, each only after it passes every automated check. Declarations the law makes yours, forms that need a handwritten signature, and payments on an agency's site stay with you."}</p>

        <fieldset className="ap-scope"><legend>{zh ? "门店" : "Stores"}</legend>
          {all.stores.map(s => <label key={s} className="check"><input type="checkbox" checked={scope.stores.includes(s)} onChange={() => toggle("stores", s)} /><span>{b(storeName(s))}</span></label>)}
        </fieldset>
        <fieldset className="ap-scope"><legend>{zh ? "机构" : "Agencies"}</legend>
          {all.agencies.map(a => <label key={a} className="check"><input type="checkbox" checked={scope.agencies.includes(a)} onChange={() => toggle("agencies", a)} /><span>{zh ? agencyZh(a) : a}</span></label>)}
        </fieldset>
        <fieldset className="ap-scope"><legend>{zh ? "申报类型" : "Filing types"}</legend>
          {all.forms.map(f => <label key={f} className="check"><input type="checkbox" checked={scope.forms.includes(f)} onChange={() => toggle("forms", f)} /><span>{b(formName(f))}</span></label>)}
        </fieldset>
        {!all.forms.length && <p className="rule-empty">{zh ? "计划中还没有待提交的官方申报。Odelia 梳理出申报后，再回来开启。" : "Your plan has no official filings left to file yet. Come back once Odelia has mapped them."}</p>}

        <div className="ap-caps">
          <label className="sst-field"><span>{zh ? "每项机构费用上限（美元）" : "Agency fee cap per filing ($)"}</span><input inputMode="decimal" value={capFiling} onChange={e => setCapFiling(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))} /></label>
          <label className="sst-field"><span>{zh ? "每月上限（美元）" : "Monthly cap ($)"}</span><input inputMode="decimal" value={capMonth} onChange={e => setCapMonth(e.target.value.replace(/[^\d.]/g, "").slice(0, 8))} /></label>
        </div>
        {!capsOk && <p className="rf-note">{zh ? "每月上限须不低于单项上限（单项最多 $10,000，每月最多 $50,000）。" : "The monthly cap must be at least the per-filing cap (at most $10,000 a filing and $50,000 a month)."}</p>}
        <p className="sg-note">{zh ? `有效期 ${AUTOPILOT_MONTHS} 个月，至 ${expires.slice(0, 10)}。随时可在此一键关闭，尚未发出的申报会立即停止。` : `Lasts ${AUTOPILOT_MONTHS} months, until ${expires.slice(0, 10)}. Turn it off here any time, in one tap: anything not yet sent stops at once.`}</p>

        <AutopilotPlanList rows={rows} />

        <label className="sst-field"><span>{zh ? "您的全名（作为签名）" : "Your full name (your signature)"}</span><input value={name} onChange={e => setName(e.target.value.slice(0, 120))} autoComplete="name" /></label>
        <label className="sst-field"><span>{zh ? "职务（可选）" : "Title (optional)"}</span><input value={title} onChange={e => setTitle(e.target.value.slice(0, 120))} placeholder={zh ? "例如：管理成员" : "e.g. Managing Member"} /></label>
        <div className="ap-sig" role="radiogroup" aria-label={zh ? "签名方式" : "Signature"}>
          <label className="check"><input type="radio" name="ap-sig" checked={sig === "typed"} onChange={() => setSig("typed")} /><span>{zh ? "以打字姓名作为签名" : "Use my typed name as my signature"}</span></label>
          <label className="check"><input type="radio" name="ap-sig" checked={sig === "drawn"} onChange={() => setSig("drawn")} /><span>{zh ? "手写签名" : "Draw my signature"}</span></label>
        </div>
        {sig === "drawn" && <Guard quiet><DrawPad onChange={setPng} /></Guard>}
        <p className="sg-fine">{zh ? "您的签名加密保存在保险库中。快哉只会在机构接受电子签名、且签名不构成宣誓声明的表格上使用它；其余表格仍会请您本人签署。" : "Your signature is kept encrypted in the vault. Placetta places it only on a form whose agency takes an electronic signature and whose signature declares nothing under oath; every other form still asks you to sign it yourself."}</p>
        <label className="check ap-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          <span>{zh ? "我已阅读并同意《申报授权书》中的“自动驾驶”部分，并有权代表本企业签署。" : "I've read and agree to the Autopilot section of the Filing Authorization, and I have authority to sign for this business."} <a href="/authorization#autopilot" target="_blank" rel="noopener">{zh ? "阅读全文" : "Read it"}</a></span></label>
        <div className="sst-act">
          <button type="button" className="sbtn quiet" onClick={onClose}>{zh ? "取消" : "Cancel"}</button>
          <button type="submit" className="sbtn ink" disabled={!ready}>{busy ? (zh ? "正在签署…" : "Signing…") : (zh ? "签署并开启" : "Sign and turn on")}</button>
        </div>
      </form>
    </SetSheet>
  );
}

/** Autopilot as it stands: who signed, what it covers, the caps and this month's use, what Odelia does alone and what
 *  still needs a person, and Turn off in one tap. */
export function AutopilotStatus({ owner, onSign }: { owner: boolean; onSign: () => void }) {
  const { lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh";
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(nowIso());
  useEffect(() => { const t = window.setInterval(() => setNow(nowIso()), 60_000); return () => window.clearInterval(t); }, []);
  const g = grantOf(ws), state = grantState(g, now);
  const rows = autopilotPlan(ws, { now, logins: cloud ? hostsOf(cloud.logins) : undefined });
  const off = async () => {
    if (!owner || busy) return;
    setBusy(true);
    try {
      const r = cloud ? await api.autopilotRevoke(cloud.wsId) : { revoked: true, stopped: 0 };
      editWs(revokeGrant(nowIso()));
      say(zh ? `自动驾驶已关闭${r.stopped ? `，${r.stopped} 项尚未发出的申报已停止` : ""}。之后每项申报都会先问您。` : `Autopilot is off${r.stopped ? `; ${r.stopped} filing${r.stopped === 1 ? "" : "s"} not yet sent stopped` : ""}. Odelia asks you before each filing again.`);
    } catch (e) { say((e as api.ApiError).message); } finally { setBusy(false); }
  };
  if (state !== "live") {
    return (
      <div className="ap-box">
        <p>{state === "expired" ? (zh ? `您的自动驾驶授权已于 ${g!.expires.slice(0, 10)} 到期。` : `Your Autopilot authorization expired on ${g!.expires.slice(0, 10)}.`)
          : state === "revoked" ? (zh ? `自动驾驶已于 ${g!.revokedAt!.slice(0, 10)} 关闭。` : `Autopilot was turned off on ${g!.revokedAt!.slice(0, 10)}.`)
          : (zh ? "签署一次授权后，通过全部核对的申报会自动提交，无需每次批准。" : "Sign one authorization and every filing that passes every check goes without your approval each time.")}</p>
        {owner && <button type="button" className="sbtn line" onClick={onSign}>{state === "none" ? (zh ? "签署并开启" : "Sign and turn on") : (zh ? "重新签署" : "Sign again")}</button>}
      </div>
    );
  }
  const used = monthUsed(ws, now);
  return (
    <div className="ap-box on">
      <p><b>{zh ? `${g!.by} 于 ${g!.at.slice(0, 10)} 签署，有效至 ${g!.expires.slice(0, 10)}。` : `Signed by ${g!.by} on ${g!.at.slice(0, 10)}, until ${g!.expires.slice(0, 10)}.`}</b>
        {" "}{zh ? `${g!.scope.stores.length} 家门店、${g!.scope.agencies.length} 个机构、${g!.scope.forms.length} 类申报；每项最多 ${money(g!.capFiling)}，每月最多 ${money(g!.capMonth)}（本月已用 ${money(used)}）。` : `${g!.scope.stores.length} store${g!.scope.stores.length === 1 ? "" : "s"}, ${g!.scope.agencies.length} agenc${g!.scope.agencies.length === 1 ? "y" : "ies"}, ${g!.scope.forms.length} filing type${g!.scope.forms.length === 1 ? "" : "s"}; up to ${money(g!.capFiling)} a filing and ${money(g!.capMonth)} a month (${money(used)} used this month).`}
        {g!.ip ? (zh ? ` 签署时的 IP：${g!.ip}。` : ` Signed from ${g!.ip}.`) : ""}</p>
      <AutopilotPlanList rows={rows} />
      {owner && <div className="sg-act"><button type="button" className="sbtn line warm" disabled={busy} onClick={() => void off()}>{zh ? "关闭自动驾驶" : "Turn off Autopilot"}</button></div>}
    </div>
  );
}
