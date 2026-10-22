import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./bi";
import { fmtDay } from "./time";
import { approve, capacity, edit, forgetAll, pin, reject, remove } from "./odeliaMemory/update";
import { approveProposal, briefOf, rejectProposal, setBrief } from "./odeliaMemory/brief";
import { settle } from "./odeliaMemory/pinned";
import { emptyAgentMemory, isLive, scopeKey, TOPIC_INFO, TOPICS, type AgentMemory, type Observation, type Scope, type SourceKind } from "./odeliaMemory/types";
import { onTempChat, setTempChat, tempChat } from "./odeliaMemory/tempChat";

/* Settings, Agent memory: what Odelia keeps about the business between conversations, and every control over it.
     the switch            off by default (opt-in, as the privacy policy discloses); owners and admins turn it on
     don't remember this chat   this tab's conversation reads no memories and saves none
     suggestions           what Odelia noticed, waiting for an owner or admin to approve or reject; anything from
                           outside the app is marked as such
     memories              by topic file, each with its source, date and scope; edit, pin, delete
     conflicts             memory that disagrees with the records; the record is used until it's settled
     briefs                the note per business and per store every run reads first, and Odelia's proposed lines
     forget all
   Viewers see it all and change nothing. In an account it lives in the database (src/cloud/memoryApi.ts); in the sample
   it lives in the workspace. */

const SOURCE: Record<SourceKind, Bi> = {
  chat: B("From a chat", "来自对话"), remote: B("From a message outside the app", "来自应用外的消息"), filing: B("From a filing", "来自申请"),
  document: B("From a document", "来自文件"), email: B("From an email", "来自邮件"), portal: B("From an agency page", "来自机构网页"),
  upload: B("From an upload", "来自上传的文件"), owner: B("Added by your team", "由您的团队添加"), record: B("From your records", "来自您的记录"),
};
/** The database side, loaded only in an account (src/cloud/memoryApi.ts). */
type MemoryApi = typeof import("./cloud/memoryApi");
const OUTSIDE: SourceKind[] = ["remote", "email", "portal", "upload", "document"];

export function AgentMemoryGroup({ db, preload }: { db: () => Promise<MemoryApi>; preload?: AgentMemory }) {
  const rpc = (f: (x: MemoryApi) => Promise<unknown>) => () => db().then(f);
  const { b, lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh";
  const live = !!cloud;
  const [remote, setRemote] = useState<AgentMemory | null>(preload ?? null);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState(tempChat());
  const [editing, setEditing] = useState<{ id: string; en: string; zh: string } | null>(null);
  const [briefDraft, setBriefDraft] = useState<Record<string, string>>({});
  useEffect(() => onTempChat(setTemp), []);
  const reload = useCallback(async () => { if (live) setRemote(await (await db()).loadAgentMemory(cloud!.wsId).catch(() => emptyAgentMemory())); }, [live, cloud, db]);
  useEffect(() => { void reload(); }, [reload]);

  const mem: AgentMemory = live ? (remote ?? emptyAgentMemory()) : (ws.agentMemory ?? emptyAgentMemory());
  const canEdit = !cloud || !cloud.viewer;              // members and up
  const canAdmin = !cloud || cloud.owner || cloud.admin; // owners and admins
  const now = () => new Date().toISOString();
  const me = cloud?.email ?? "you";
  /** One change: in an account the database does it (and checks the role); in the sample the workspace keeps it. */
  const act = async (local: (m: AgentMemory) => AgentMemory, server: () => Promise<unknown>, done?: Bi) => {
    if (busy) return;
    if (live) {
      setBusy(true);
      try { await server(); await reload(); if (done) say(b(done)); }
      catch (e) { say((e as { message?: string }).message ?? (zh ? "没能保存，请重试。" : "Couldn't save. Try again.")); }
      finally { setBusy(false); }
      return;
    }
    editWs(w => ({ ...w, agentMemory: local(w.agentMemory ?? emptyAgentMemory()) }));
    if (done) say(b(done));
  };

  const st = mem.settings, cap = capacity(mem);
  const names: Record<string, string> = Object.fromEntries((ws.stores ?? []).map(s => [scopeKey({ kind: "store", id: s.id }), b(s.name)]));
  const scopeWords = (s: Scope): string => s.kind === "workspace" ? (zh ? "整个企业" : "Whole business") : s.kind === "brand" ? (zh ? "品牌" : "Brand")
    : s.kind === "person" ? (zh ? "仅您本人" : "Only you") : s.kind === "store" ? `${zh ? "门店：" : "Store: "}${names[scopeKey(s)] ?? s.id}` : `${zh ? "市场：" : "Market: "}${s.id}`;
  const day = (iso: string) => fmtDay(iso.slice(0, 10), lang, true);
  const meta = (o: Observation) => (
    <small className="am-meta">
      <span className={OUTSIDE.includes(o.source.kind) ? "out" : undefined}>{b(SOURCE[o.source.kind])}{o.source.title ? `: ${o.source.title}` : ""}</span>
      <span>{zh ? `${day(o.validFrom)}起` : `Since ${day(o.validFrom)}`}</span>
      <span>{scopeWords(o.scope)}</span>
      {o.pinned && <span>{zh ? "已置顶" : "Pinned"}</span>}
      {o.critical && <span>{zh ? "关键" : "Critical"}</span>}
    </small>
  );
  const btn = (label: string, onClick: () => void, kind = "quiet", aria?: string) => <button type="button" className={`sbtn ${kind}`} disabled={busy} onClick={onClick} aria-label={aria}>{label}</button>;
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, disabled = false) => <label className="switch" onClick={e => e.stopPropagation()}><input type="checkbox" checked={on} disabled={disabled || busy} onChange={e => set(e.target.checked)} aria-label={label} /><i /></label>;
  const setSetting = (k: "enabled" | "suggest" | "allowLast4") => (v: boolean) => act(m => ({ ...m, settings: { ...m.settings, [k]: v } }), rpc(x => x.memorySettings(cloud!.wsId, { [k]: v })),
    k === "enabled" ? (v ? B("Agent memory is on.", "助理记忆已开启。") : B("Agent memory is off. Nothing new is kept or used.", "助理记忆已关闭，不再保存或使用任何记忆。")) : undefined);

  const suggestions = mem.items.filter(o => o.status === "suggested");
  const saved = mem.items.filter(isLive);
  const history = mem.items.filter(o => o.status === "superseded" || o.status === "expired");
  const conflicts = mem.conflicts.filter(c => !c.resolved);
  const replaced = (o: Observation) => o.supersedes ? mem.items.find(x => x.id === o.supersedes) : undefined;

  const row = (o: Observation, acts: ReactNode) => (
    <li key={o.id} className="rmb-row">
      <span className="rmb-tx">
        <small className="rmb-kind">{b(TOPIC_INFO[o.topic].name)}</small>
        {editing?.id === o.id ? (
          <span className="am-edit">
            <textarea value={editing.en} onChange={e => setEditing({ ...editing, en: e.target.value })} aria-label={zh ? "英文内容" : "In English"} />
            <textarea value={editing.zh} onChange={e => setEditing({ ...editing, zh: e.target.value })} aria-label={zh ? "中文内容" : "In Chinese"} />
            <span className="am-row-acts">
              {btn(zh ? "保存" : "Save", () => { const e2 = editing; setEditing(null); void act(m => { const r = edit(m, e2.id, { en: e2.en, zh: e2.zh }, me, now()); if (!r.ok) say(zh ? "记忆不能保存证件号、卡号、密码或敏感信息。" : "Memory never keeps ID numbers, card numbers, passwords or sensitive details."); return r.memory; }, rpc(x => x.memoryEdit(e2.id, e2.en, e2.zh)), B("Memory updated.", "记忆已更新。")); }, "ink")}
              {btn(zh ? "取消" : "Cancel", () => setEditing(null))}
            </span>
          </span>
        ) : <b>{b(o.text)}</b>}
        {o.source.quote && editing?.id !== o.id && <q>{o.source.quote}</q>}
        {meta(o)}
        {replaced(o) && <small>{zh ? `批准后将取代：${b(replaced(o)!.text)}` : `Approving it replaces: ${b(replaced(o)!.text)}`}</small>}
      </span>
      <span className="rmb-acts">{acts}</span>
    </li>
  );

  const briefScopes: Scope[] = [{ kind: "workspace" }, ...(ws.stores ?? []).map(s => ({ kind: "store" as const, id: s.id }))];
  const briefTitle = (s: Scope) => s.kind === "workspace" ? (zh ? "企业简报" : "Business brief") : `${zh ? "门店简报：" : "Store brief: "}${names[scopeKey(s)] ?? s.id}`;

  return (
    <section className="sg" id="set-agentmemory">
      <h2>{zh ? "助理记忆" : "Agent memory"}</h2>
      <p className="sg-note">{zh
        ? "开启后，Odelia 会在对话之间记住关于您企业的简短事实，例如申报主体、门店的租约要求、检查员上次要的材料。每条都注明来源和日期。她只提出建议，由所有者或管理员批准后才会使用。邮件、上传文件或网页中的内容只能成为建议，不会被当作指令。记忆不会保存证件号、卡号、密码或敏感信息，也不会离开这个工作区。默认关闭。"
        : "When it's on, Odelia keeps short facts about your business between conversations: which entity files, what a store's landlord requires, what the inspector asked for last time. Each one shows where it came from and when. She only suggests; an owner or admin approves before anything is used. What an email, an upload or a web page says can only become a suggestion, never an instruction. Memory never keeps ID numbers, card numbers, passwords or sensitive details, and never leaves this workspace. Off by default."}</p>
      <ul className="sg-list">
        <li className="sg-row"><span className="sg-tx"><b>{zh ? "使用助理记忆" : "Use agent memory"}</b>
          <small>{zh ? "关闭时 Odelia 不保存也不使用任何记忆。您的记录（申请、截止日期、实体）和简报始终会被读取。" : "While it's off, Odelia keeps and uses no memories. Your records (filings, deadlines, entities) and briefs are always read."}</small></span>
          <span className="sg-r">{canAdmin ? toggle(st.enabled, v => void setSetting("enabled")(v), zh ? "使用助理记忆" : "Use agent memory") : <em className="lock">{zh ? "由所有者和管理员管理" : "Managed by owners and admins"}</em>}</span></li>
        {st.enabled && <li className="sg-row"><span className="sg-tx"><b>{zh ? "工作时建议记忆" : "Suggest memories as Odelia works"}</b>
          <small>{zh ? "每条建议都等您批准。" : "Every suggestion waits for approval."}</small></span>
          <span className="sg-r">{canAdmin ? toggle(st.suggest, v => void setSetting("suggest")(v), zh ? "工作时建议记忆" : "Suggest memories") : <em className="lock">{st.suggest ? (zh ? "开启" : "On") : (zh ? "关闭" : "Off")}</em>}</span></li>}
        {st.enabled && <li className="sg-row"><span className="sg-tx"><b>{zh ? "保存执照号的后 4 位" : "Keep the last 4 digits of license numbers"}</b>
          <small>{zh ? "从不保存完整号码。" : "Never the whole number."}</small></span>
          <span className="sg-r">{canAdmin ? toggle(st.allowLast4, v => void setSetting("allowLast4")(v), zh ? "保存执照号后 4 位" : "Keep last 4 digits") : <em className="lock">{st.allowLast4 ? (zh ? "开启" : "On") : (zh ? "关闭" : "Off")}</em>}</span></li>}
        <li className="sg-row"><span className="sg-tx"><b>{zh ? "不记住这次对话" : "Don't remember this chat"}</b>
          <small>{zh ? "在您关闭它或关闭此标签页之前，Odelia 不读取记忆（您的记录和简报除外），也不从这次对话中保存任何内容。" : "Until you turn it off or close this tab, Odelia reads no memories (beyond your records and briefs) and saves nothing from this chat."}</small></span>
          <span className="sg-r">{toggle(temp, v => { setTempChat(v); setTemp(v); }, zh ? "不记住这次对话" : "Don't remember this chat")}</span></li>
        <li className="sg-row"><span className="sg-tx"><b>{zh ? "已用空间" : "Space used"}</b>
          <small className={`am-cap${cap.warn ? " warn" : ""}`}>{zh ? `已保存 ${cap.used} 条，上限 ${cap.cap} 条` : `${cap.used} of ${cap.cap} memories saved`}</small></span>
          <span className="sg-r">{canAdmin && (mem.items.length > 0 || mem.briefs.some(x => x.proposals.length)) ? btn(zh ? "全部忘记" : "Forget all", () => {
            if (!window.confirm(zh ? "删除 Odelia 的全部记忆和建议？简报保留。此操作无法撤销。" : "Delete all of Odelia's memories and suggestions? Briefs stay. This can't be undone.")) return;
            void act(m => forgetAll(m), rpc(x => x.memoryForgetAll(cloud!.wsId)), B("Forgot everything.", "已全部忘记。"));
          }, "warm") : null}</span></li>
      </ul>
      {cap.full ? <p className="am-banner warn" role="status">{zh ? "记忆已满。删除一些记忆之前，新的记忆只会作为建议保留，不会使用。不会自动删除任何记忆。" : "Memory is full. Until some are removed, new memories wait as suggestions and aren't used. Nothing is removed on its own."}</p>
        : cap.warn ? <p className="am-banner warn" role="status">{zh ? `记忆快满了（${cap.pct}%）。满了之后，新的记忆会等待，直到您删除一些。` : `Memory is almost full (${cap.pct}%). When it's full, new memories wait until you remove some.`}</p> : null}
      {cloud?.viewer && <p className="am-banner">{zh ? "您是只读成员：可以查看记忆，但不能更改。" : "You're a viewer: you can see memory but not change it."}</p>}

      {conflicts.length > 0 && (
        <div className="sg-sub">
          <h3>{zh ? "与您的记录不一致" : "Disagrees with your records"}</h3>
          <p className="sg-note">{zh ? "在您处理之前，Odelia 以记录为准。" : "Odelia uses the record until you settle it."}</p>
          <ul className="rmb-rows">{conflicts.map(c => {
            const o = mem.items.find(x => x.id === c.memory);
            return (
              <li key={c.id} className="rmb-row">
                <span className="rmb-tx">{o && <b>{b(o.text)}</b>}<small>{zh ? `记忆为“${c.memoryValue}”，记录为“${c.recordValue}”` : `Memory says "${c.memoryValue}", the record says "${c.recordValue}"`}</small></span>
                {canEdit && <span className="rmb-acts">
                  {btn(zh ? "改为记录的值" : "Use the record", () => void act(m => settle(m, c.id, "record", now(), me), rpc(x => x.conflictSettle(c.id, "record"))), "ink")}
                  {btn(zh ? "删除记忆" : "Delete memory", () => void act(m => settle(m, c.id, "delete", now()), rpc(x => x.conflictSettle(c.id, "delete"))))}
                  {btn(zh ? "忽略" : "Dismiss", () => void act(m => settle(m, c.id, "dismiss", now()), rpc(x => x.conflictSettle(c.id, "dismiss"))))}
                </span>}
              </li>
            );
          })}</ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="sg-sub">
          <h3>{zh ? `待批准的建议（${suggestions.length}）` : `Suggestions to review (${suggestions.length})`}</h3>
          <p className="sg-note">{canAdmin ? (zh ? "批准之前不会使用。标注“来自邮件”等的内容来自应用之外，请先核对。" : "Nothing here is used until it's approved. Ones marked as from an email, an upload or a message outside the app came from outside: check them first.")
            : (zh ? "由所有者或管理员批准。" : "An owner or admin approves these.")}</p>
          <ul className="rmb-rows">{suggestions.map(o => row(o, canAdmin ? <>
            {btn(zh ? "批准" : "Approve", () => void act(m => { const r = approve(m, o.id, me, now()); if (r.full) say(zh ? "记忆已满，请先删除一些。" : "Memory is full. Remove some first."); return r.memory; }, rpc(x => x.memoryReview(o.id, true))), "ink", zh ? `批准：${b(o.text)}` : `Approve: ${b(o.text)}`)}
            {btn(zh ? "拒绝" : "Reject", () => void act(m => reject(m, o.id, me, now()), rpc(x => x.memoryReview(o.id, false))), "quiet", zh ? `拒绝：${b(o.text)}` : `Reject: ${b(o.text)}`)}
          </> : null))}</ul>
        </div>
      )}

      <div className={`sg-sub${st.enabled ? "" : " am-off"}`}>
        <h3>{zh ? "已保存的记忆" : "Saved memories"}</h3>
        {!saved.length && <p className="sg-note">{st.enabled ? (zh ? "还没有。在对话中说“记住……”，或批准 Odelia 的建议。" : "Nothing yet. Say \"remember…\" in a chat, or approve one of Odelia's suggestions.") : (zh ? "记忆关闭时不会保存任何内容。" : "Nothing is kept while memory is off.")}</p>}
        {TOPICS.filter(t => saved.some(o => o.topic === t)).map(t => (
          <div key={t}>
            <p className="am-topic">{b(TOPIC_INFO[t].name)}<small>{b(TOPIC_INFO[t].about)}</small></p>
            <ul className="rmb-rows">{saved.filter(o => o.topic === t).map(o => row(o, canEdit ? <>
              {btn(zh ? "编辑" : "Edit", () => setEditing({ id: o.id, en: o.text.en, zh: o.text.zh }), "quiet", zh ? `编辑：${b(o.text)}` : `Edit: ${b(o.text)}`)}
              {btn(o.pinned ? (zh ? "取消置顶" : "Unpin") : (zh ? "置顶" : "Pin"), () => void act(m => pin(m, o.id, !o.pinned), rpc(x => x.memoryPin(o.id, !o.pinned))))}
              {btn(zh ? "删除" : "Delete", () => void act(m => remove(m, o.id), rpc(x => x.memoryDelete(o.id)), B("Deleted.", "已删除。")), "warm", zh ? `删除：${b(o.text)}` : `Delete: ${b(o.text)}`)}
            </> : null))}</ul>
          </div>
        ))}
        {history.length > 0 && (
          <details className="am-hist">
            <summary>{zh ? `较早的版本（${history.length}）` : `Earlier versions (${history.length})`}</summary>
            <ul className="rmb-rows">{history.map(o => (
              <li key={o.id} className="rmb-row"><span className="rmb-tx"><b>{b(o.text)}</b>
                <small className="am-meta"><span>{b(SOURCE[o.source.kind])}</span><span>{o.status === "expired" ? (zh ? "已过期" : "Expired") : zh ? `${day(o.validFrom)}至${day(o.validTo ?? o.validFrom)}` : `${day(o.validFrom)} to ${day(o.validTo ?? o.validFrom)}`}</span><span>{scopeWords(o.scope)}</span></small></span>
                {canEdit && <span className="rmb-acts">{btn(zh ? "删除" : "Delete", () => void act(m => remove(m, o.id), rpc(x => x.memoryDelete(o.id))), "quiet")}</span>}
              </li>
            ))}</ul>
          </details>
        )}
      </div>

      <div className="sg-sub">
        <h3>{zh ? "简报" : "Briefs"}</h3>
        <p className="sg-note">{zh ? "每次运行最先读取的简短说明：整个企业一份，每家门店一份。Odelia 会提出新的条目，由您决定是否加入。" : "A short note every run reads first: one for the business, one per store. Odelia proposes lines; you decide what goes in."}</p>
        {briefScopes.map(s => {
          const k = scopeKey(s), cur = briefOf(mem, s), draft = briefDraft[k] ?? cur?.body ?? "";
          return (
            <div key={k} className="am-brief">
              <h4>{briefTitle(s)}</h4>
              <textarea value={draft} readOnly={!canEdit} onChange={e => setBriefDraft(d => ({ ...d, [k]: e.target.value }))} aria-label={briefTitle(s)}
                placeholder={s.kind === "workspace" ? (zh ? "例如：品牌以 Acme Tea LLC（特拉华州）名义申报。所有者偏好微信和中文。" : "For example: Brand files under Acme Tea LLC (Delaware). Owner prefers WeChat and Chinese.") : (zh ? "例如：房东要求保险证明列明房东。" : "For example: Landlord requires a COI naming them.")} />
              {canEdit && draft !== (cur?.body ?? "") && <span className="am-row-acts">
                {btn(zh ? "保存简报" : "Save brief", () => { void act(m => { const r = setBrief(m, s, draft, now(), me); if (r.dropped) say(zh ? "已省略含证件号或密码的行。" : "Left out lines with ID numbers or passwords."); return r.memory; }, rpc(x => x.briefSet(cloud!.wsId, s, draft)), B("Brief saved.", "简报已保存。")); setBriefDraft(d => { const n = { ...d }; delete n[k]; return n; }); }, "ink")}
              </span>}
              {(cur?.proposals ?? []).length > 0 && <ul className="rmb-rows">{cur!.proposals.map(p => (
                <li key={p.id} className="rmb-row"><span className="rmb-tx"><b>{p.line}</b>
                  <small className="am-meta"><span className={OUTSIDE.includes(p.source.kind) ? "out" : undefined}>{b(SOURCE[p.source.kind])}</span><span>{day(p.at)}</span></small></span>
                  {canEdit && <span className="rmb-acts">
                    {btn(zh ? "加入简报" : "Add to brief", () => void act(m => approveProposal(m, s, p.id, now(), me), rpc(x => x.proposalReview(p.id, true))), "ink")}
                    {btn(zh ? "不用" : "Dismiss", () => void act(m => rejectProposal(m, s, p.id), rpc(x => x.proposalReview(p.id, false))))}
                  </span>}
                </li>
              ))}</ul>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
