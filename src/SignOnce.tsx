import { useEffect, useMemo, useState } from "react";
import { useApp } from "./ctx";
import * as api from "./cloud/api";
import { AGENT_MONTHS, agentOf, agentPacket, agentState, putAgent, revokeAgent, type AgentAuth, type AgentOfRecord, type PacketItem } from "./agentPacket";
import { grantOf } from "./autopilot";
import { UPDATED } from "./legal";
import { nowIso } from "./time";
import { SetSheet } from "./SetUI";
import { DrawPad } from "./AutopilotSettings";
import { Guard } from "./SafeBoundary";
import { CONSENTS, DISCLOSURE, DISCLOSURE_VERSION, type AdoptedSignature } from "./esignDisclosure";
import "./controls.css";
import { SuggestInput } from "./Suggest";
import { factSource, titleSource } from "./suggestions";

/* "Sign once, 2 minutes" (src/agentPacket.ts): everything Placetta needs the owner's own hand for, in one sitting, so
   that afterwards Placetta acts as the business's agent where each agency allows it and nothing comes back to sign.
   E-signatures use the signature the owner adopted (typed name) and go only on Placetta's own authorization and on
   agency forms whose agency says it takes one; every other page is signed in ink and photographed here. What can't be
   signed yet (a fact on it doesn't exist) is listed with why. */

const EMAIL = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

export function SignOnce({ onClose }: { onClose: () => void }) {
  const { b, lang, ws, editWs, say, cloud } = useApp();
  // the signer's name as the workspace has it (never a guess), and the titles people sign filings with
  const nameSrc = useMemo(() => factSource(ws, "Owner", lang, { kind: "person" }), [ws, lang]);
  const titleSrc = useMemo(() => titleSource(lang), [lang]);
  const zh = lang === "zh";
  const [agent, setAgent] = useState<AgentOfRecord | null>(null);
  useEffect(() => { if (cloud) void api.agentOfRecord().then(setAgent).catch(() => setAgent(null)); }, [cloud]);
  const p = useMemo(() => agentPacket(ws, { agent }), [ws, agent]);
  const g = grantOf(ws);
  const [name, setName] = useState(g?.by ?? "");
  const [title, setTitle] = useState(g?.title ?? "");
  const [ap, setAp] = useState("");
  const [photos, setPhotos] = useState<Record<string, { name: string; path?: string }>>({});
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sign once: the signature adopted here goes on every agency form that takes an electronic signature, each time the
  // owner approves one (or Autopilot covers it), so no filing asks them to sign again
  const [kind, setKind] = useState<"typed" | "drawn">("drawn");
  const [png, setPng] = useState<string | null>(null);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState(false);
  const esign = p.items.filter(i => i.sig === "esign" && !(p.blocked && i.namesAgent));
  const hand = p.items.filter(i => i.sig === "hand" && !(p.blocked && i.namesAgent));
  const apOk = !ap.trim() || EMAIL.test(ap.trim());
  const sigOk = (kind === "typed" || !!png) && CONSENTS.every(c => consent[c.id]);
  const ready = agree && sigOk && name.trim().length >= 2 && apOk && hand.every(i => photos[i.id]) && esign.length > 0 && !busy;

  const addPhoto = async (i: PacketItem, f: File | undefined) => {
    if (!f) return;
    try {
      const path = cloud ? (await api.uploadDoc(cloud.wsId, f, i.app)).path : undefined;
      setPhotos(x => ({ ...x, [i.id]: { name: f.name, ...(path ? { path } : {}) } }));
    } catch (e) { say((e as api.ApiError).message); }
  };
  const sign = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const items = [...esign, ...hand].map(i => ({ id: i.id, ...(i.form ? { form: i.form } : {}), ...(i.agency ? { agency: i.agency.en } : {}), sig: i.sig, names_agent: i.namesAgent,
        months: i.id === "sj-building-section-c" ? 12 : null, ...(photos[i.id]?.path ? { doc: photos[i.id].path } : {}) }));
      const now = nowIso();
      const a: AgentAuth = cloud
        ? await api.agentAuthorize(cloud.wsId, { name: name.trim(), title: title.trim() || undefined, agree, version: UPDATED, agencies: p.agencies, forms: p.forms, items, apEmail: ap.trim() || undefined })
        : { id: "ag-" + Date.now().toString(36), by: name.trim(), at: now, expires: new Date(Date.parse(now) + AGENT_MONTHS * 30.44 * 864e5).toISOString(), version: UPDATED, agencies: p.agencies, forms: p.forms,
            items: items.map(i => ({ id: i.id, ...(i.form ? { form: i.form } : {}), ...(i.agency ? { agency: i.agency } : {}), sig: i.sig, at: now, ...(i.months ? { expires: new Date(Date.parse(now) + 365 * 864e5).toISOString() } : {}), ...(photos[i.id] ? { doc: photos[i.id].name } : {}) })),
            agent: agent?.name ?? "Placetta", ...(ap.trim() ? { apEmail: ap.trim().toLowerCase() } : {}) };
      editWs(putAgent(a));
      // the signature itself, with its consent record (20261105090200_sign_once_paper.sql)
      const s: AdoptedSignature = cloud
        ? await api.signatureAdopt(cloud.wsId, { name: name.trim(), title: title.trim() || undefined, kind, drawn: png ?? undefined, version: DISCLOSURE_VERSION,
            records: !!consent.records, sign: !!consent.sign, apply: !!consent.apply, demonstrated: opened })
        : { id: "sg-" + Date.now().toString(36), by: name.trim(), ...(title.trim() ? { title: title.trim() } : {}), kind, at: now, version: DISCLOSURE_VERSION, demonstrated: opened };
      editWs(w => ({ ...w, controls: { ...(w.controls ?? {}), signature: s } }));
      say(zh ? "已签好。之后这些申报不会再请您签字，法律或机构要求您本人办理的除外（见下方）。" : "Signed. You won't be asked to sign these filings again, except what the law or the agency keeps yours (listed below).");
      onClose();
    } catch (e) { const er = e as api.ApiError; say((zh && er.message_zh) || er.message || (zh ? "未能签署，请重试。" : "It didn't go through. Try again.")); }
    finally { setBusy(false); }
  };

  return (
    <SetSheet title={zh ? "签一次，2 分钟" : "Sign once, 2 minutes"} sub={zh ? "快哉代您办理需要的每一个签名，一次签完。之后快哉以您代理人的身份办理，机构允许的地方不再请您签字。" : "Every signature Placetta needs from you, in one sitting. After this, Placetta acts as your agent wherever the agency allows it, and doesn't come back for a signature."} onClose={onClose} className="ap-sheet so-sheet">
      <form className="sst-form" onSubmit={e => { e.preventDefault(); void sign(); }}>
        {p.blocked && <p className="rf-note">{b(p.blocked)}</p>}
        <h3>{zh ? `电子签名（${esign.length}）` : `E-signed here (${esign.length})`}</h3>
        <ul className="ap-rows so-rows">
          {esign.map(i => (
            <li key={i.id}><b>{b(i.name)}</b>{i.lets && <small>{b(i.lets)}</small>}
              {i.url && <a href={i.url} target="_blank" rel="noopener">{zh ? "阅读" : "Read it"}</a>}</li>
          ))}
        </ul>
        {hand.length > 0 && <>
          <h3>{zh ? `亲笔签名（${hand.length}）` : `Signed in ink (${hand.length})`}</h3>
          <p className="sg-note">{zh ? "这些机构不接受电子签名。打开已填好的表格，打印并签名，然后拍照上传。快哉只负责发送，从不替您签名。" : "These agencies don't take an e-signature. Open the filled form, print and sign it, then add a photo. Placetta sends it; it never signs for you."}</p>
          <ul className="ap-rows so-rows">
            {hand.map(i => (
              <li key={i.id}><b>{b(i.name)}</b>
                <small>{i.why === "law" ? (zh ? "法律要求由您本人签署" : "The law makes this signature yours") : (zh ? "机构要求由您签署" : "The agency asks for your signature")}{" "}
                  <a href={i.cite[0]} target="_blank" rel="noopener">{zh ? "依据" : "Source"}</a></small>
                <label className="sbtn line so-up">{photos[i.id] ? (zh ? `已添加：${photos[i.id].name}` : `Added: ${photos[i.id].name}`) : (zh ? "添加签名页照片" : "Add a photo of the signed page")}
                  <input type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={e => void addPhoto(i, e.target.files?.[0])} /></label>
              </li>
            ))}
          </ul>
        </>}
        {p.later.length > 0 && <>
          <h3>{zh ? "之后才能签的" : "What can only be signed later"}</h3>
          <ul className="ap-rows so-rows">
            {p.later.map(l => <li key={l.form}><b>{b(l.what)}</b><small>{b(l.when)}</small></li>)}
          </ul>
        </>}
        <label className="sst-field"><span>{zh ? "机构账单发送至（应付账款邮箱，可选）" : "Send agency bills to (your accounts-payable email, optional)"}</span>
          <input type="email" value={ap} onChange={e => setAp(e.target.value.slice(0, 200))} placeholder="ap@yourbusiness.com" /></label>
        {!apOk && <p className="rf-note">{zh ? "请检查邮箱地址。" : "Check the email address."}</p>}
        <label className="sst-field"><span>{zh ? "您的全名（作为签名）" : "Your full name (your signature)"}</span><SuggestInput lang={lang} value={name} onValue={v => setName(v.slice(0, 120))} source={nameSrc} /></label>
        <label className="sst-field"><span>{zh ? "职务（可选）" : "Title (optional)"}</span><SuggestInput lang={lang} value={title} onValue={v => setTitle(v.slice(0, 120))} source={titleSrc} /></label>
        <h3>{zh ? "您的签名，只需一次" : "Your signature, once"}</h3>
        <p className="sg-note">{zh ? "快哉只在您批准申报（或自动驾驶授权涵盖）、且机构接受电子签名的表格上使用它。机构要求亲笔签名的，快哉会把表格寄给您。" : "Placetta places it only on forms you approve (or your Autopilot covers) whose agency takes an electronic signature. Where the agency wants ink, Placetta mails you the page."}</p>
        <label className="check"><input type="radio" name="so-sig" checked={kind === "drawn"} onChange={() => setKind("drawn")} /><span>{zh ? "手写签名" : "Draw my signature"}</span></label>
        <label className="check"><input type="radio" name="so-sig" checked={kind === "typed"} onChange={() => setKind("typed")} /><span>{zh ? "以打字姓名作为签名" : "Use my typed name as my signature"}</span></label>
        {kind === "drawn" && <Guard quiet><DrawPad onChange={setPng} /></Guard>}
        <details className="so-disclosure" onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) setOpened(true); }}>
          <summary>{b(DISCLOSURE.title)}</summary>
          {DISCLOSURE.parts.map(x => <p key={x.h.en}><b>{b(x.h)}</b> {b(x.p)}</p>)}
        </details>
        {CONSENTS.map(c => (
          <label key={c.id} className="check ap-agree"><input type="checkbox" checked={!!consent[c.id]} onChange={e => setConsent(x => ({ ...x, [c.id]: e.target.checked }))} /><span>{b(c.label)}</span></label>
        ))}
        <label className="check ap-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
          <span>{zh ? `我已阅读《申报授权书》中的“快哉作为您的代理人”部分，同意在上方各页使用我的电子签名，并有权代表本企业签署。有效期 ${AGENT_MONTHS} 个月，可随时一键撤销。` : `I've read the "Placetta as your agent" section of the Filing Authorization, agree to my e-signature on the pages above, and have authority to sign for this business. It lasts ${AGENT_MONTHS} months; revoke it any time, in one tap.`}
            {" "}<a href="/authorization#placetta-as-your-agent" target="_blank" rel="noopener">{zh ? "阅读全文" : "Read it"}</a></span></label>
        <div className="sst-act">
          <button type="button" className="sbtn quiet" onClick={onClose}>{zh ? "取消" : "Cancel"}</button>
          <button type="submit" className="sbtn ink" disabled={!ready}>{busy ? (zh ? "正在签署…" : "Signing…") : (zh ? "全部签署" : "Sign all")}</button>
        </div>
      </form>
    </SetSheet>
  );
}

/** Placetta as your agent, as it stands, and Revoke in one tap. */
export function AgentStatus({ owner }: { owner: boolean }) {
  const { lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh";
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const a = agentOf(ws), st = agentState(a, nowIso());
  const p = agentPacket(ws, { agent: { name: "-", title: "-", phone: "-", email: "-" } });
  if (!p.items.length && st === "none") return null;
  const revoke = async () => {
    if (!owner || busy) return;
    setBusy(true);
    try {
      if (cloud) await api.agentRevoke(cloud.wsId);
      editWs(revokeAgent(nowIso()));
      say(zh ? "已撤销。快哉不再以您的代理人身份办理，尚未发出的申报已停止。" : "Revoked. Placetta no longer acts as your agent, and anything not yet sent has stopped.");
    } catch (e) { say((e as api.ApiError).message); } finally { setBusy(false); }
  };
  return (
    <div className={"ap-box" + (st === "live" ? " on" : "")}>
      <p><b>{zh ? "快哉作为您的代理人" : "Placetta as your agent"}</b>{" "}
        {st === "live" ? (zh ? `${a!.by} 于 ${a!.at.slice(0, 10)} 签署，有效至 ${a!.expires.slice(0, 10)}；代理人：${a!.agent}。` : `Signed by ${a!.by} on ${a!.at.slice(0, 10)}, until ${a!.expires.slice(0, 10)}; agent of record ${a!.agent}.`)
          : st === "revoked" ? (zh ? "已撤销。" : "Revoked.") : st === "expired" ? (zh ? "已到期。" : "Expired.")
          : (zh ? `一次签好 ${p.items.length} 份，之后机构允许代理的申报都由快哉代办，不再请您签字。` : `Sign ${p.items.length} pages once, and Placetta files as your agent wherever the agency allows it, without coming back for a signature.`)}</p>
      {owner && <div className="sg-act">
        {st !== "live" && <button type="button" className="sbtn line" onClick={() => setSigning(true)}>{zh ? "签一次，2 分钟" : "Sign once, 2 minutes"}</button>}
        {st === "live" && <button type="button" className="sbtn line warm" disabled={busy} onClick={() => void revoke()}>{zh ? "撤销代理" : "Revoke"}</button>}
      </div>}
      {signing && owner && <SignOnce onClose={() => setSigning(false)} />}
    </div>
  );
}
