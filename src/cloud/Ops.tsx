import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../ctx";
import { B, type Bi } from "../model";
import { fmtAgo, money } from "../time";
import { I, Pill } from "../ui";
import * as api from "./api";
import { openSettings } from "../Settings";
import { CompanyMetrics } from "../Metrics";
import { AskReply } from "./AskReply";
import { HumanCheckActions } from "./HumanCheck";
import { OpsMore, OpsTabs, useOpsTab } from "./OpsMore";
import { REJECTION_REASONS, rejectionReasonOf } from "../pricing";

/* The Placetta team's filing queue. Each request is exactly what the customer approved: the form, the fields,
   the attachments and the agency site. The team checks it against the agency's current requirements, submits it,
   sends the agency's payment link when there's a fee, and uploads the receipt. Every step lands in the
   customer's audit trail (the database writes it). */

const GROUPS: { key: string; label: Bi; match: (f: api.QueueRow) => boolean }[] = [
  { key: "new", label: B("New", "新请求"), match: f => f.status === "requested" },
  { key: "working", label: B("Working", "办理中"), match: f => f.status === "in_progress" },
  { key: "waiting", label: B("Waiting on the customer", "等待客户"), match: f => f.status === "needs_info" },
  { key: "agency", label: B("With the agency", "机构审核中"), match: f => f.status === "submitted" },
  { key: "done", label: B("Done", "已完成"), match: f => ["accepted", "rejected", "canceled"].includes(f.status) },
];

/* Why a task landed with the team (the file function writes these). */
const KIND: Record<string, Bi> = {
  handoff: B("Submit it", "需团队提交"),
  review: B("Final check before sending", "发送前核对"),
  check_agency: B("Check it reached the agency", "核实机构是否收到"),
  destination_stale: B("Re-check where this form is sent", "重新核实提交地址"),
  line_health: B("An iMessage line needs care", "iMessage 线路需要处理"),
  ai_spend: B("Unusual AI spend, in saver mode today", "AI 用量异常，今日为节省模式"),
  ask_person: B("A customer asks for a person", "客户请求真人协助"),
  margin: B("AI cost is high against this customer's revenue", "AI 成本相对该客户收入偏高"),
  team_time: B("This filing took longer than its budget", "此项申报用时超出预算"),
  playbook_review: B("Check the steps Odelia learned on a new agency site (Quality tab)", "核对 Odelia 在新机构网站上学会的步骤（质量页）"),
  billing: B("Billing needs a look", "账单需要处理"),
  human_check: B("Solve a human check (a CAPTCHA) in the live browser", "在实时浏览器中完成真人验证（验证码）"),
};

/** What Odelia's models cost this month against what the plans pay, with the ten workspaces that cost the most. */
function AiMarginCard() {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [m, setM] = useState<api.AiMargin | null | undefined>(undefined);
  useEffect(() => { void api.aiMarginCompany().then(setM); }, []);
  if (!m) return null;
  const usd = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number | null) => (n == null ? "-" : `${n}%`);
  return (
    <section className="sec">
      <div className="sec-h"><h2>{zh ? "AI 成本" : "AI cost this month"}</h2></div>
      <div className="q-margin">
        <p className="q-margin-line">{zh
          ? `本月 AI 成本 ${usd(m.ai_cost_usd)}，方案收入 ${usd(m.mrr_usd)}（占 ${pct(m.cost_pct)}），AI 毛利率 ${pct(m.gross_margin_pct)}`
          : `AI cost this month: ${usd(m.ai_cost_usd)} of ${usd(m.mrr_usd)} revenue (${pct(m.cost_pct)}), gross margin on AI ${pct(m.gross_margin_pct)}`}</p>
        <p className="note">{zh
          ? `${m.workspaces_using_ai} 个工作区使用了 AI，共 ${m.calls} 次调用。${m.by_vendor.map(v => `${v.provider} ${usd(v.cost_usd)}`).join("，")}`
          : `${m.workspaces_using_ai} workspace${m.workspaces_using_ai === 1 ? "" : "s"} used AI, ${m.calls} call${m.calls === 1 ? "" : "s"}. ${m.by_vendor.map(v => `${v.provider} ${usd(v.cost_usd)}`).join(", ")}`}</p>
        {m.top.length > 0 && (
          <table className="q-margin-t">
            <thead><tr><th>{zh ? "工作区" : "Workspace"}</th><th>{zh ? "AI 成本" : "AI cost"}</th><th>{zh ? "收入" : "Revenue"}</th><th>{zh ? "占比" : "Share"}</th><th>{zh ? "主要用途" : "Mostly"}</th></tr></thead>
            <tbody>{m.top.map(r => (
              <tr key={r.workspace_id}>
                <td>{r.name ?? r.workspace_id.slice(0, 8)}</td>
                <td>{usd(r.ai_cost_usd)}</td>
                <td>{usd(r.revenue_usd)}</td>
                <td>{pct(r.cost_pct)}</td>
                <td>{r.top_roles.slice(0, 2).map(x => x.role).join(", ") || "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Copy({ text }: { text: string }) {
  const { say, lang } = useApp();
  return <button type="button" className="icbtn copy" title={lang === "zh" ? "复制" : "Copy"} aria-label={lang === "zh" ? "复制" : "Copy"} onClick={() => { void navigator.clipboard?.writeText(text); say(lang === "zh" ? "已复制" : "Copied"); }}><I.copy /></button>;
}

function Detail({ f, me, onChange }: { f: api.QueueRow; me: string; onChange: () => void }) {
  const { b, lang, say } = useApp();
  const [logins, setLogins] = useState<api.AgencyLogin[]>([]);
  const [shown, setShown] = useState<Record<string, string>>({});
  const [conf, setConf] = useState(f.confirmation_number ?? "");
  const [payUrl, setPayUrl] = useState(f.payment_url ?? "");
  const [fee, setFee] = useState(String(f.fee_paid ?? f.fee_estimate ?? ""));
  const [note, setNote] = useState(f.note ?? "");
  const [minutes, setMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [rnote, setRnote] = useState("");
  const [checked, setChecked] = useState(f.requirements_checked);
  useEffect(() => setChecked(f.requirements_checked), [f.requirements_checked]);
  useEffect(() => { void api.listLogins(f.workspace_id).then(setLogins).catch(() => setLogins([])); }, [f.workspace_id]);
  const act = async (patch: Parameters<typeof api.updateFiling>[1], done?: string) => {
    try { await api.updateFiling(f.id, patch); if (done) say(done); onChange(); return true; } catch (e) { say((e as api.ApiError).message); return false; }
  };
  const agent = async (action: "team_approve" | "take_over") => {
    try { await api.teamFiling(f.workspace_id, f.id, action); say(action === "team_approve" ? "Approved. Placetta is sending it." : "It's yours now."); onChange(); } catch (e) { say((e as api.ApiError).message); }
  };
  const reveal = async (id: string) => {
    try { const r = await api.revealLogin(f.workspace_id, id); setShown(s => ({ ...s, [id]: r.password })); setTimeout(() => setShown(s => { const n = { ...s }; delete n[id]; return n; }), 30_000); }
    catch (e) { say((e as api.ApiError).message); }
  };
  const p = f.payload;
  const closed = ["accepted", "rejected", "canceled"].includes(f.status);
  const upload = <label className="pill primary sm upl"><input type="file" hidden onChange={async e => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; try { await api.uploadReceipt(f, file); say(lang === "zh" ? "收据已上传" : "Receipt uploaded"); onChange(); } catch (er) { say((er as api.ApiError).message); } }} /><I.upload /><span>{lang === "zh" ? "上传收据或批文" : "Upload receipt or approval"}</span></label>;
  return (
    <div className="q-detail">
      <header>
        <span className="m-eyebrow">{f.business}</span>
        <h2>{b(f.title)}</h2>
        <p>{[f.agency ? b(f.agency) : "", f.approver_email ?? ""].filter(Boolean).join(lang === "zh" ? "，" : ", ")}</p>
      </header>

      <section>
        <h3>{lang === "zh" ? "在哪里提交" : "Where to file"}</h3>
        <p className="q-line">{f.portal_url ? <a href={f.portal_url} target="_blank" rel="noreferrer">{f.portal_url}<I.ext /></a> : "-"}{p.form ? <span>{b(p.form)}</span> : null}</p>
        {logins.length > 0 && (
          <ul className="q-logins">
            {logins.map(l => (
              <li key={l.id}><b>{l.agency}</b><span>{l.username}<Copy text={l.username} /></span>
                {shown[l.id] ? <span className="pw">{shown[l.id]}<Copy text={shown[l.id]} /></span> : <button type="button" className="more" onClick={() => void reveal(l.id)}>{lang === "zh" ? "显示密码（会记录）" : "Show password (logged)"}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {f.agent_state && (
        <section>
          <h3>{lang === "zh" ? "快哉的运行" : "Placetta's run"}</h3>
          <p className="q-line"><span>{f.channel ?? "-"}</span><span>{f.agent_state}</span>{f.attempts ? <span>{f.attempts} tries</span> : null}{f.submit_clicked_at ? <span>submit pressed {f.submit_clicked_at.slice(0, 16)}</span> : null}{f.handoff_url ? <a href={f.handoff_url} target="_blank" rel="noreferrer">Live view<I.ext /></a> : null}</p>
          <ol className="q-log">{(f.agent_log ?? []).map((e, i) => <li key={i}><small>{e.at?.slice(5, 16).replace("T", " ")}</small> {e.en}{e.ref ? <code> {e.ref}</code> : null}</li>)}</ol>
          {f.agent_state === "handoff" && (
            <div className="m-btns">
              {f.channel !== "team" && <button type="button" className="pill ink sm" onClick={() => void agent("team_approve")}>Approve review and send</button>}
              <button type="button" className="pill quiet sm" onClick={() => void agent("take_over")}>Take over</button>
            </div>
          )}
          {(f.agent_state === "running" || f.agent_state === "queued" || f.agent_state === "needs_you") && <button type="button" className="pill quiet sm" onClick={() => void agent("take_over")}>Take over</button>}
        </section>
      )}

      <section>
        <h3>{lang === "zh" ? "客户批准的内容" : "What the customer approved"}</h3>
        <dl className="kv data">{p.fields.map((x, i) => <div key={i}><dt>{b(x.label)}</dt><dd>{x.value || "-"}{x.value && <Copy text={x.value} />}</dd></div>)}</dl>
        {p.attachments.length > 0 && (
          <ul className="q-att">{p.attachments.map(a => <li key={a.path}><button type="button" className="more" onClick={async () => { try { const blob = await api.downloadDoc(a.path); const u = URL.createObjectURL(blob); const x = document.createElement("a"); x.href = u; x.download = a.name; x.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); } catch (e) { say((e as api.ApiError).message); } }}><I.download />{a.name}</button></li>)}</ul>
        )}
        <p className="note">{lang === "zh" ? `预估机构费用 ${money(f.fee_estimate)}，由客户直接支付给机构。` : `Estimated agency fee ${money(f.fee_estimate)}, paid by the customer directly to the agency.`}</p>
      </section>

      <section className="q-steps">
        <h3>{closed ? (lang === "zh" ? "结果" : "Outcome") : lang === "zh" ? "办理" : "Work it"}</h3>
        {f.status === "requested" && <Pill kind="ink" onClick={() => void act({ status: "in_progress", assigned_to: me }, lang === "zh" ? "已接手" : "Started")}>{lang === "zh" ? "接手办理" : "Start this filing"}</Pill>}
        {closed ? (
          <div className={"q-done" + (f.status === "accepted" ? " good" : "")}>
            <b>{f.status === "accepted" ? (lang === "zh" ? "机构已批准" : "Approved by the agency") : f.status === "rejected" ? (lang === "zh" ? "被机构退回" : "Returned by the agency") : (lang === "zh" ? "客户已取消" : "Canceled by the customer")}</b>
            {f.confirmation_number && <span>{(lang === "zh" ? "确认号 " : "Confirmation ") + f.confirmation_number}</span>}
            {f.note && f.status === "rejected" && <span>{f.note}</span>}
            {f.status === "rejected" && <RejectionFix f={f} act={act} />}
            <span>{f.receipt_path ? (lang === "zh" ? "收据已存入客户文件" : "Receipt is in the customer's documents") : (lang === "zh" ? "尚未上传收据" : "No receipt uploaded yet")}</span>
          </div>
        ) : <>
        <label className="chk"><input type="checkbox" checked={checked} onChange={e => { const v = e.target.checked; setChecked(v); void act({ requirements_checked: v }).then(ok => { if (!ok) setChecked(!v); }); }} />{lang === "zh" ? "已对照机构现行要求核对（提交前必选）" : "Checked against the agency's current requirements (needed before submitting)"}</label>

        <form className="q-form" onSubmit={e => { e.preventDefault(); if (!/^https:\/\//.test(payUrl)) { say(lang === "zh" ? "付款链接须以 https:// 开头" : "The payment link must start with https://"); return; } void act({ status: "needs_info", payment_url: payUrl, fee_paid: Number(fee) || null, note: null }, lang === "zh" ? "已发送付款链接" : "Payment link sent"); }}>
          <b>{lang === "zh" ? "请客户支付机构费用" : "Ask the customer to pay the agency"}</b>
          <input value={payUrl} onChange={e => setPayUrl(e.target.value)} placeholder="https://… (agency payment page)" aria-label="Payment link" />
          <input value={fee} onChange={e => setFee(e.target.value)} inputMode="decimal" placeholder="$" aria-label="Amount" className="sm" />
          <Pill sm>{lang === "zh" ? "发送" : "Send"}</Pill>
        </form>

        <form className="q-form" onSubmit={e => { e.preventDefault(); if (!note.trim()) return; void act({ status: "needs_info", note: note.trim(), payment_url: null }, lang === "zh" ? "已通知客户" : "Customer notified"); }}>
          <b>{lang === "zh" ? "需要客户补充" : "Needs something from the customer"}</b>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={lang === "zh" ? "例如：请上传房东同意书" : "e.g. Upload the landlord's consent letter"} aria-label="Note" />
          <Pill sm>{lang === "zh" ? "发送" : "Send"}</Pill>
        </form>

        <form className="q-form" onSubmit={e => { e.preventDefault(); if (!checked) { say(lang === "zh" ? "请先核对机构现行要求" : "Check it against the agency's current requirements first"); return; } void act({ status: "submitted", confirmation_number: conf.trim() || null }, lang === "zh" ? "已标记为提交" : "Marked submitted"); }}>
          <b>{lang === "zh" ? "已提交至机构" : "Submitted to the agency"}</b>
          <input value={conf} onChange={e => setConf(e.target.value)} placeholder={lang === "zh" ? "确认号" : "Confirmation number"} aria-label="Confirmation number" />
          <Pill sm kind="ink">{lang === "zh" ? "标记已提交" : "Mark submitted"}</Pill>
        </form>

        <form className="q-form" onSubmit={e => { e.preventDefault(); const n = Math.round(Number(minutes)); if (!(n >= 1 && n <= 1440)) { say(lang === "zh" ? "请输入 1 到 1440 分钟" : "Enter 1 to 1440 minutes"); return; }
          void api.addTeamMinutes(f.id, n).then(r => { setMinutes(""); say(lang === "zh" ? `共 ${r.minutes} 分钟，预算 ${r.budget} 分钟${r.over ? "，已超出" : ""}` : `${r.minutes} minutes in all, budget ${r.budget}${r.over ? ", over it" : ""}`); }, er => say((er as api.ApiError).message)); }}>
          <b>{lang === "zh" ? "团队用时" : "Team time on this filing"}</b>
          <input value={minutes} onChange={e => setMinutes(e.target.value)} inputMode="numeric" placeholder={lang === "zh" ? "分钟" : "Minutes"} aria-label={lang === "zh" ? "分钟" : "Minutes"} className="sm" />
          <Pill sm>{lang === "zh" ? "记录" : "Add"}</Pill>
        </form>

        <div className="q-row">
          {upload}
          <Pill sm onClick={() => void act({ status: "accepted" }, lang === "zh" ? "已标记为批准" : "Marked approved")}>{lang === "zh" ? "机构已批准" : "Agency approved"}</Pill>
        </div>
        <form className="q-form" onSubmit={e => { e.preventDefault(); const r = rejectionReasonOf(reason); if (!r) { say(lang === "zh" ? "请选择退回原因" : "Choose why it was returned"); return; } if (!rnote.trim()) { say(lang === "zh" ? "请写一句说明（客户可见）" : "Add a note (the customer sees it)"); return; }
          void act({ status: "rejected", note: rnote.trim(), rejection_reason: r.id, rejection_note: rnote.trim() }, r.ours ? (lang === "zh" ? "已标记为我们的失误：不收费，已付款项将退还" : "Marked our fault: no charge, anything paid is refunded") : (lang === "zh" ? "已标记：将收取执照费用" : "Marked: the license price is charged")); }}>
          <b>{lang === "zh" ? "被机构退回" : "Agency returned it"}</b>
          <select value={reason} onChange={e => setReason(e.target.value)} aria-label={lang === "zh" ? "退回原因" : "Why"}>
            <option value="">{lang === "zh" ? "选择原因" : "Choose why"}</option>
            <optgroup label={lang === "zh" ? "快哉的失误：不收费，退还已付款项" : "Placetta's fault: no charge, refund anything paid"}>{REJECTION_REASONS.filter(r => r.ours).map(r => <option key={r.id} value={r.id}>{lang === "zh" ? r.label.zh : r.label.en}</option>)}</optgroup>
            <optgroup label={lang === "zh" ? "非快哉的失误：收取执照费用" : "Not Placetta's fault: the license price is charged"}>{REJECTION_REASONS.filter(r => !r.ours).map(r => <option key={r.id} value={r.id}>{lang === "zh" ? r.label.zh : r.label.en}</option>)}</optgroup>
          </select>
          <input value={rnote} onChange={e => setRnote(e.target.value)} placeholder={lang === "zh" ? "说明（客户可见）" : "Note (the customer sees it)"} aria-label={lang === "zh" ? "说明" : "Note"} />
          <Pill sm kind="quiet">{lang === "zh" ? "标记退回" : "Mark returned"}</Pill>
        </form>
        </>}
        {f.status === "accepted" && !f.receipt_path && <div className="q-row">{upload}</div>}
      </section>
    </div>
  );
}

/** A rejected filing's reason, as marked (outcome pricing): shown, with any dispute from the owner, and changeable. Changing
 *  it to Placetta's fault refunds anything paid; to another reason charges the license price (migration 20261105091200). */
function RejectionFix({ f, act }: { f: api.QueueRow; act: (patch: Parameters<typeof api.updateFiling>[1], done?: string) => Promise<boolean> }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [r, setR] = useState<api.Rejection | null>(null);
  const [pick, setPick] = useState("");
  const [n, setN] = useState(0);
  useEffect(() => { void api.filingRejection(f.id).then(setR, () => setR(null)); }, [f.id, f.updated_at, n]);
  const cur = rejectionReasonOf(r?.reason);
  const open = !!r?.dispute && !r.dispute.resolved_at;
  return (
    <span className="q-reject">
      <span>{cur ? `${zh ? cur.label.zh : cur.label.en}${cur.ours ? (zh ? "（我们的失误，不收费）" : " (our fault, no charge)") : (zh ? "（已收取执照费用）" : " (license price charged)")}` : (zh ? "尚未标记原因：在标记前不会收费" : "No reason marked yet: nothing is charged until it is")}</span>
      {open && <span>{zh ? "客户提出异议：" : "The owner disputes it: "}{r?.dispute?.note ?? (zh ? "（未附说明）" : "(no note)")}</span>}
      <select value={pick} onChange={e => setPick(e.target.value)} aria-label={zh ? "更改原因" : "Change the reason"}>
        <option value="">{zh ? "更改原因" : "Change the reason"}</option>
        {REJECTION_REASONS.map(x => <option key={x.id} value={x.id}>{(x.ours ? (zh ? "我们的失误：" : "Our fault: ") : (zh ? "非我们的失误：" : "Not ours: ")) + (zh ? x.label.zh : x.label.en)}</option>)}
      </select>
      <button type="button" className="more" disabled={!pick || pick === r?.reason} onClick={() => { const x = rejectionReasonOf(pick); if (x) void act({ rejection_reason: x.id }, x.ours ? (zh ? "已改为我们的失误：将退款" : "Changed to our fault: refunded") : (zh ? "已更改原因" : "Reason changed")).then(() => setN(k => k + 1)); }}>{zh ? "保存" : "Save"}</button>
    </span>
  );
}

/** Billing health, for staff: is Stripe set up so a customer who pays gets their plan. Check now makes or repairs the
 *  webhook first (the monitor does the same each day); the list says what's missing and which old prices to archive. */
function BillingHealthCard() {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [h, setH] = useState<api.BillingHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { setH((await api.billingHealth()).health); } catch (e) { const x = e as api.ApiError; say((zh && x.message_zh) || x.message); }
    setBusy(false);
  };
  return (
    <section className="sec">
      <div className="sec-h"><h2>{zh ? "账单健康" : "Billing health"}{h ? <em>{h.ok ? (zh ? "正常" : "OK") : `${h.problems.length}`}</em> : null}</h2>
        <Pill sm kind="quiet" disabled={busy} onClick={() => void check()}>{busy ? "…" : zh ? "立即检查" : "Check now"}</Pill></div>
      {h && (
        <div className="q-margin">
          <p className="q-margin-line">{zh
            ? `密钥：${h.key.set ? (h.key.mode === "live" ? "正式" : "测试") : "未设置"}。Webhook：${h.webhook.exists ? (h.webhook.missing_events.length ? `缺少 ${h.webhook.missing_events.join("、")}` : "已就绪") : "不存在"}。签名密钥：${h.secret.stored || h.secret.env ? "已保存" : "缺失"}。`
            : `Key: ${h.key.set ? h.key.mode : "not set"}. Webhook: ${h.webhook.exists ? (h.webhook.missing_events.length ? `missing ${h.webhook.missing_events.join(", ")}` : "ready") : "missing"}. Signing secret: ${h.secret.stored || h.secret.env ? "stored" : "missing"}.`}</p>
          <table className="q-margin-t">
            <thead><tr><th>{zh ? "价格" : "Price"}</th><th>{zh ? "状态" : "Status"}</th></tr></thead>
            <tbody>{h.prices.map(p => <tr key={p.lookup}><td>{p.lookup}</td><td>{p.ok ? (zh ? "正确" : "OK") : p.found ? (zh ? "金额不符" : "Wrong amount") : (zh ? "未找到" : "Not found")}</td></tr>)}</tbody>
          </table>
          {h.problems.length > 0 && <ul className="note">{h.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          {h.legacy_active.length > 0 && <p className="note">{zh ? "请在 Stripe 中归档这些旧价格（代码已忽略它们）：" : "Archive these old prices in Stripe (the code ignores them): "}{h.legacy_active.join(", ")}</p>}
          <p className="note">{h.tax}</p>
        </div>
      )}
    </section>
  );
}

export function Queue() {
  const { b, lang, say } = useApp();
  const [rows, setRows] = useState<api.QueueRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [me, setMe] = useState("");
  const [tasks, setTasks] = useState<api.TeamTask[]>([]);
  const load = useCallback(async () => {
    try { setRows(await api.queue()); } catch (e) { say((e as api.ApiError).message); }
    setTasks(await api.teamTasks());
  }, [say]);
  const finish = async (id: string) => { try { await api.finishTeamTask(id); setTasks(t => t.filter(x => x.id !== id)); say(lang === "zh" ? "已完成" : "Done"); } catch (e) { say((e as api.ApiError).message); } };
  useEffect(() => { void load(); void api.getSession().then(s => setMe(s?.user.id ?? "")); const id = setInterval(() => void load(), 20_000); return () => clearInterval(id); }, [load]);
  const cur = useMemo(() => rows.find(r => r.id === sel) ?? null, [rows, sel]);
  // the review queue, Agent health, partners and the incident log live beside the queue (src/cloud/OpsMore.tsx)
  const opsTab = useOpsTab();
  if (opsTab !== "filings") return <OpsMore tab={opsTab} />;
  return (
    <div className="page queue">
      <header className="ph"><div className="ph-tx"><h1>{lang === "zh" ? "申报队列" : "Filing queue"}</h1><p>{lang === "zh" ? "客户批准的每一份申请。核对要求、提交、发送付款链接、上传收据。" : "Every application a customer approved. Check the requirements, submit, send the payment link, upload the receipt."}</p></div></header>
      <OpsTabs tab={opsTab} />
      <div className="q-grid">
        <div className="q-list">
          <AiMarginCard />
          <BillingHealthCard />
          <CompanyMetrics />
          {tasks.length > 0 && (
            <section className="sec">
              <div className="sec-h"><h2>{lang === "zh" ? "团队待办" : "Team tasks"}<em>{tasks.length}</em></h2></div>
              <div className="tray">{tasks.map(t => (
                <div key={t.id} className="row q-row-btn q-task">
                  <button type="button" className="arow-n" onClick={() => { if (t.filing_id) setSel(t.filing_id); }} disabled={!t.filing_id}>
                    <b title={t.title}>{t.title}</b><small>{[t.business, KIND[t.kind] ? b(KIND[t.kind]) : t.kind].filter(Boolean).join(lang === "zh" ? "，" : ", ")}</small>
                  </button>
                  <small className="ago">{fmtAgo(t.created_at, lang)}</small>
                  <Pill sm kind="quiet" onClick={() => void finish(t.id)}>{lang === "zh" ? "完成" : "Done"}</Pill>
                  {t.kind === "ask_person" && <AskReply t={t} onDone={id => setTasks(x => x.filter(y => y.id !== id))} />}
                  {t.kind === "human_check" && <HumanCheckActions t={t} onDone={id => setTasks(x => x.filter(y => y.id !== id))} />}
                </div>
              ))}</div>
            </section>
          )}
          {GROUPS.map(g => { const list = rows.filter(g.match); if (!list.length && g.key === "done") return null; return (
            <section key={g.key} className="sec">
              <div className="sec-h"><h2>{b(g.label)}{list.length ? <em>{list.length}</em> : null}</h2></div>
              {list.length ? <div className="tray">{list.map(r => (
                <button key={r.id} type="button" className={"row q-row-btn" + (r.id === sel ? " on" : "")} onClick={() => setSel(r.id)}>
                  <span className="arow-n"><b>{b(r.title)}</b><small>{[r.business, r.assignee_email].filter(Boolean).join(lang === "zh" ? "，" : ", ")}</small></span>
                  <small className="ago">{fmtAgo(r.updated_at, lang)}</small>
                </button>
              ))}</div> : <p className="quiet">{lang === "zh" ? "暂无" : "Nothing here"}</p>}
            </section>
          ); })}
        </div>
        {cur ? <Detail key={cur.id} f={cur} me={me} onChange={() => void load()} /> : <div className="q-detail empty"><p>{lang === "zh" ? "选择一份申请开始办理。" : "Pick a filing to work on."}</p></div>}
      </div>
    </div>
  );
}

/** Staff who haven't signed in with two-step yet: the queue holds customers' records and saved logins, so it waits for that. */
export function QueueLocked() {
  const { lang, go } = useApp();
  const zh = lang === "zh";
  return (
    <div className="page queue">
      <header className="ph"><div className="ph-tx"><h1>{zh ? "申报队列" : "Filing queue"}</h1>
        <p>{zh ? "队列包含客户记录和已保存的登录信息，需要两步登录才能打开。" : "The queue holds customers' records and saved logins, so it opens only after two-step sign-in."}</p></div></header>
      <div className="q-lock">
        <I.lock />
        <p>{zh ? "在设置中开启两步登录，然后用验证码登录即可打开队列。" : "Turn on two-step sign-in in Settings, then sign in with the code to open the queue."}</p>
        <Pill kind="ink" onClick={() => openSettings(go, "security")}>{zh ? "设置两步登录" : "Set up two-step sign-in"}</Pill>
      </div>
    </div>
  );
}
