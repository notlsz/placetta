import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./model";
import { API_MODELS } from "./live";
import { fmtAgo, fmtDay } from "./time";
import { Footer, I } from "./ui";
import { useTheme, type Theme } from "./hooks";
import * as api from "./cloud/api";
import type { IntegrationKind } from "./cloud/api";
import { TwoStepSetup } from "./cloud/TwoStep";

/* Settings, the way Muse and Alven do it: a calm column of groups, one row per thing, the control on the right,
   one primary action per group. Only what a business needs to get and stay compliant. */

type Row = { label: Bi; sub?: ReactNode; right?: ReactNode; icon?: ReactNode; pick?: () => void };
function Group({ id, title, note, rows, children }: { id: string; title: Bi; note?: Bi; rows?: Row[]; children?: ReactNode }) {
  const { b } = useApp();
  return (
    <section className="sg" id={"set-" + id}>
      <h2>{b(title)}</h2>
      {note && <p className="sg-note">{b(note)}</p>}
      {rows && rows.length > 0 && (
        <ul className="sg-list">
          {rows.map((r, i) => (
            <li key={i} className={"sg-row" + (r.pick ? " pick" : "")} onClick={r.pick}>
              {r.icon && <span className="sg-ico">{r.icon}</span>}
              <span className="sg-tx"><b>{b(r.label)}</b>{r.sub && <small>{r.sub}</small>}</span>
              {r.right && <span className="sg-r">{r.right}</span>}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  );
}

const Btn = ({ children, onClick, kind = "quiet", disabled }: { children: ReactNode; onClick: () => void; kind?: "quiet" | "ink" | "line"; disabled?: boolean }) =>
  <button type="button" className={"sbtn " + kind} onClick={onClick} disabled={disabled}>{children}</button>;

const Tile = ({ t, c }: { t: string; c: string }) => <span className="tile" style={{ background: c }} aria-hidden="true">{t}</span>;

const INTEGRATIONS: { group: Bi; items: { kind: IntegrationKind | "feed" | "square" | "toast"; name: string; zh?: string; why: Bi; tile: [string, string] }[] }[] = [
  { group: B("Email", "邮件"), items: [
    { kind: "gmail", name: "Gmail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), tile: ["G", "#EA4335"] },
    { kind: "outlook_mail", name: "Outlook Mail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), tile: ["O", "#0A64C8"] },
  ] },
  { group: B("Calendar", "日历"), items: [
    { kind: "gcal", name: "Google Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), tile: ["31", "#1A73E8"] },
    { kind: "outlook_cal", name: "Outlook Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), tile: ["O", "#0F6CBD"] },
    { kind: "feed", name: "Calendar feed", zh: "日历订阅", why: B("Any calendar app: subscribe with a private link", "任何日历应用：用私密链接订阅"), tile: ["iCal", "#5C6B7A"] },
  ] },
  { group: B("Documents", "文件"), items: [
    { kind: "gdrive", name: "Google Drive", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), tile: ["D", "#188038"] },
    { kind: "dropbox", name: "Dropbox", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), tile: ["Db", "#0061FE"] },
  ] },
  { group: B("Sales, payroll and accounting", "销售、薪资与财务"), items: [
    { kind: "square", name: "Square", why: B("Sales for sales tax, schedules for labor-law checks", "销售额用于销售税，排班用于劳动法检查"), tile: ["Sq", "#1A1A1A"] },
    { kind: "toast", name: "Toast", why: B("Sales for sales tax, schedules for labor-law checks", "销售额用于销售税，排班用于劳动法检查"), tile: ["T", "#FF4C00"] },
    { kind: "quickbooks", name: "QuickBooks", why: B("Gross receipts for business tax and renewals", "营业总额用于营业税和续期"), tile: ["QB", "#2CA01C"] },
  ] },
  { group: B("Team", "团队"), items: [
    { kind: "slack", name: "Slack", why: B("Filing updates in your team's channel", "申报进展推送到团队频道"), tile: ["S", "#4A154B"] },
  ] },
];

function Integrations() {
  const { b, lang, cloud, say } = useApp();
  const [feed, setFeed] = useState("");
  const conn = (k: string) => cloud?.integrations.find(i => i.kind === k);
  const demo = () => say(lang === "zh" ? "登录您的快哉账户后即可连接。" : "Sign in to your Placetta account to connect.");
  const request = (name: string) => { window.location.href = `mailto:support@placetta.com?subject=${encodeURIComponent(`Connect ${name}`)}&body=${encodeURIComponent(`Please connect ${name} for our workspace.`)}`; };
  return (
    <Group id="integrations" title={B("Integrations", "集成")} note={B("Only what gets you licensed and keeps you compliant. Placetta reads what a task needs and nothing else; disconnect any time.", "只连接拿证和保持合规所需的服务。快哉只读取任务所需的内容，可随时断开。")}>
      {INTEGRATIONS.map(g => (
        <div key={g.group.en} className="sg-sub">
          <h3>{b(g.group)}</h3>
          <ul className="sg-list">
            {g.items.map(it => {
              const c = it.kind === "feed" || it.kind === "square" || it.kind === "toast" ? undefined : conn(it.kind);
              let right: ReactNode;
              if (it.kind === "feed") right = cloud ? <Btn onClick={async () => { try { const u = await cloud.feedUrl(); setFeed(u); await navigator.clipboard?.writeText(u).catch(() => undefined); say(lang === "zh" ? "订阅链接已复制" : "Link copied"); } catch (e) { say((e as { message: string }).message); } }}>{lang === "zh" ? "复制链接" : "Copy link"}</Btn> : <Btn onClick={demo}>{lang === "zh" ? "复制链接" : "Copy link"}</Btn>;
              else if (it.kind === "square" || it.kind === "toast") right = <Btn onClick={() => request(it.name)}>{lang === "zh" ? "申请接入" : "Request"}</Btn>;
              else if (cloud && !cloud.owner) right = c ? undefined : <em className="lock">{lang === "zh" ? "由所有者连接" : "Owners connect"}</em>;
              else if (c) right = <Btn onClick={() => void cloud!.disconnect(it.kind as IntegrationKind)}>{lang === "zh" ? "断开" : "Disconnect"}</Btn>;
              else right = <Btn kind="line" onClick={() => (cloud ? void cloud.connect(it.kind as IntegrationKind) : demo())}>{lang === "zh" ? "连接" : "Connect"}</Btn>;
              const status = c ? (c.status === "error" ? <em className="bad">{lang === "zh" ? "需要重新连接" : "Reconnect needed"}</em> : <em className="ok"><i />{c.account ?? (lang === "zh" ? "已连接" : "Connected")}</em>) : null;
              return (
                <li key={it.kind} className="sg-row">
                  <Tile t={it.tile[0]} c={it.tile[1]} />
                  <span className="sg-tx"><b>{lang === "zh" && it.zh ? it.zh : it.name}</b><small>{b(it.why)}{it.kind === "toast" ? (lang === "zh" ? "。需 Toast 合作伙伴审批。" : ". Needs Toast partner approval.") : ""}</small>{status}</span>
                  <span className="sg-r">{right}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {feed && <p className="sg-note mono">{feed}</p>}
    </Group>
  );
}

function Logins() {
  const { b, lang, cloud, ws } = useApp();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ agency: "", url: "", username: "", password: "", note: "" });
  if (!cloud) {
    return (
      <Group id="logins" title={B("Agency logins", "机构登录")} note={B("Saved logins for agency portals, encrypted in a vault. Our filing team opens one only to file for you, and each opening shows in your audit trail.", "加密保存在保险库中的机构门户登录信息。申报团队只在为您提交时打开，每次打开都会记入审计记录。")}
        rows={ws.connections.filter(c => c.level !== "vault").map(c => ({ label: c.name, sub: b(c.detail), icon: <I.key />, right: c.state === "connected" ? <em className="ok"><i />{lang === "zh" ? "已保存" : "Saved"}</em> : <Btn kind="line" onClick={() => undefined}>{lang === "zh" ? "添加" : "Add"}</Btn> }))} />
    );
  }
  return (
    <Group id="logins" title={B("Agency logins", "机构登录")} note={B("Saved logins for agency portals, encrypted in a vault. Our filing team opens one only to file for you, and each opening shows in your audit trail. Never save Social Security or bank numbers here.", "加密保存在保险库中的机构门户登录信息。申报团队只在为您提交时打开，每次打开都会记入审计记录。请勿在此保存社会安全号或银行账号。")}
      rows={cloud.logins.map(l => ({ label: { en: l.agency, zh: l.agency }, icon: <I.key />,
        sub: <>{l.username}{l.last_opened_at ? (lang === "zh" ? `，团队上次打开 ${fmtAgo(l.last_opened_at, lang)}` : `. Team last opened it ${fmtAgo(l.last_opened_at, lang)}`) : ""}</>,
        right: cloud.owner ? <Btn onClick={() => void cloud.removeLogin(l.id)}>{lang === "zh" ? "删除" : "Remove"}</Btn> : undefined }))}>
      {!cloud.owner ? <p className="sg-note">{lang === "zh" ? "只有所有者可以添加或删除登录信息。" : "Only owners can add or remove saved logins."}</p> : adding ? (
        <form className="sg-form" onSubmit={e => { e.preventDefault(); if (!f.agency.trim() || !f.username.trim() || !f.password) return; void cloud.saveLogin({ agency: f.agency.trim(), url: f.url.trim() || undefined, username: f.username.trim(), password: f.password, note: f.note.trim() || undefined }).then(() => { setAdding(false); setF({ agency: "", url: "", username: "", password: "", note: "" }); }); }}>
          <input placeholder={lang === "zh" ? "机构，例如 CDTFA" : "Agency, e.g. CDTFA"} value={f.agency} onChange={e => setF({ ...f, agency: e.target.value })} aria-label="Agency" />
          <input placeholder="https://…" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} aria-label="Website" />
          <input placeholder={lang === "zh" ? "用户名" : "Username"} autoComplete="off" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} aria-label="Username" />
          <input type="password" placeholder={lang === "zh" ? "密码" : "Password"} autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} aria-label="Password" />
          <div className="sg-form-act"><Btn onClick={() => setAdding(false)}>{lang === "zh" ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink">{lang === "zh" ? "加密保存" : "Save encrypted"}</button></div>
        </form>
      ) : <div className="sg-act"><Btn kind="line" onClick={() => setAdding(true)}><I.plus />{lang === "zh" ? "添加登录" : "Add a login"}</Btn></div>}
    </Group>
  );
}

/** The people on this workspace. Owners invite, change roles and remove; everyone can see the team and leave. */
function Team() {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const [team, setTeam] = useState<api.Team | null>(null);
  const [f, setF] = useState<{ email: string; role: api.Role }>({ email: "", role: "member" });
  const [busy, setBusy] = useState(false);
  const wsId = cloud?.wsId ?? "";
  const load = useCallback(async () => { if (!wsId) return; try { setTeam(await api.teamList(wsId)); } catch { setTeam({ me: null, members: [], invites: [] }); } }, [wsId]);
  useEffect(() => { void load(); }, [load]);
  if (!cloud) return null;
  const owner = cloud.owner;
  const owners = team?.members.filter(m => m.role === "owner").length ?? 0;
  const roleName = (r: api.Role) => (r === "owner" ? (zh ? "所有者" : "Owner") : (zh ? "成员" : "Member"));
  const act = async (fn: () => Promise<unknown>, done?: string) => { try { await fn(); if (done) say(done); await load(); } catch (e) { say((e as api.ApiError).message); } };
  const sentNote = (sent: string, email: string) => sent === "not_sent"
    ? (zh ? `已邀请 ${email}，但邮件没发出去。请让对方用这个邮箱登录。` : `Invited ${email}, but the email didn't send. Ask them to sign in with that address.`)
    : (zh ? `已邀请 ${email}。对方用这个邮箱登录即可加入。` : `Invited ${email}. They join when they sign in with that address.`);
  const invite = async () => {
    const email = f.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { say(zh ? "请输入有效的邮箱。" : "Enter a valid email."); return; }
    setBusy(true);
    try { const r = await api.invite(wsId, email, f.role); say(sentNote(r.sent, email)); setF({ email: "", role: "member" }); await load(); }
    catch (e) { say((e as api.ApiError).message); }
    setBusy(false);
  };
  const rows: Row[] = [
    ...(team?.members ?? []).map(m => ({
      label: { en: m.email + (m.you ? " (you)" : ""), zh: m.email + (m.you ? "（您）" : "") }, icon: <I.user />,
      sub: <>{roleName(m.role)}{m.two_step ? (zh ? "，已开启两步登录" : ", two-step on") : ""}</>,
      right: m.you
        ? (m.role !== "owner" || owners > 1 ? <Btn onClick={() => { if (window.confirm(zh ? "确定离开这个工作区？" : "Leave this workspace?")) void act(async () => { await api.removeMember(wsId, m.user_id); cloud.switchTo(""); }); }}>{zh ? "离开" : "Leave"}</Btn> : undefined)
        : owner ? <>
            <select className="sg-select" value={m.role} aria-label={zh ? "角色" : "Role"} onChange={e => void act(() => api.setRole(wsId, m.user_id, e.target.value as api.Role), zh ? "角色已更新" : "Role updated")}>
              <option value="owner">{roleName("owner")}</option><option value="member">{roleName("member")}</option>
            </select>
            <Btn onClick={() => { if (window.confirm(zh ? `将 ${m.email} 移出工作区？` : `Remove ${m.email}?`)) void act(() => api.removeMember(wsId, m.user_id), zh ? "已移出" : "Removed"); }}>{zh ? "移出" : "Remove"}</Btn>
          </> : undefined,
    })),
    ...(team?.invites ?? []).map(i => ({
      label: { en: i.email, zh: i.email }, icon: <I.bell />,
      sub: <>{roleName(i.role)}{zh ? "，已邀请，等待登录" : ", invited, waiting for them to sign in"}</>,
      right: <>
        <Btn onClick={() => void act(async () => { const r = await api.resendInvite(wsId, i.id); say(sentNote(r.sent, i.email)); })}>{zh ? "重发" : "Resend"}</Btn>
        <Btn onClick={() => void act(() => api.revokeInvite(i.id), zh ? "邀请已取消" : "Invite canceled")}>{zh ? "取消" : "Cancel"}</Btn>
      </>,
    })),
  ];
  return (
    <Group id="team" title={B("Team", "团队")} note={owner
      ? B("Owners approve filings and payments, manage billing, connect accounts and invite people. Members do the day-to-day work: logs, documents and the agent.", "所有者可批准申报和付款、管理账单、连接账户和邀请成员。成员负责日常工作：记录、文件和助理。")
      : B("Owners approve filings and payments and manage the team. Ask an owner to change your role.", "所有者负责批准申报和付款，并管理团队。如需更改角色，请联系所有者。")}
      rows={rows}>
      {owner && (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void invite(); }}>
          <input type="email" autoComplete="off" placeholder={zh ? "同事的邮箱" : "Teammate's email"} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} aria-label={zh ? "邮箱" : "Email"} />
          <select className="sg-select" value={f.role} onChange={e => setF({ ...f, role: e.target.value as api.Role })} aria-label={zh ? "角色" : "Role"}>
            <option value="member">{roleName("member")}</option><option value="owner">{roleName("owner")}</option>
          </select>
          <button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : zh ? "邀请" : "Invite"}</button>
        </form>
      )}
    </Group>
  );
}

/** Two-step sign-in and sessions. */
function Security() {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const [setup, setSetup] = useState(false);
  const [factor, setFactor] = useState<string | null>(null);
  useEffect(() => { if (cloud) void api.twoStepStatus().then(s => setFactor(s.factorId)).catch(() => undefined); }, [cloud]);
  if (!cloud) return null;
  const on = !!factor;
  return (
    <Group id="security" title={B("Security", "安全")} note={cloud.staffEmail && !cloud.staff
      ? B("You're on the Placetta team. The filing queue opens only after you sign in with two-step, because it holds customers' records and saved logins.", "您是快哉团队成员。申报队列包含客户记录和已保存的登录信息，开启两步登录并用验证码登录后才能打开。")
      : B("Two-step sign-in asks for a code from your phone each time you sign in. Owners should turn it on.", "两步登录会在每次登录时要求输入手机上的验证码。建议所有者开启。")}
      rows={[
        { label: B("Two-step sign-in", "两步登录"), icon: <I.lock />,
          sub: on ? (zh ? "已开启：身份验证器应用" : "On: authenticator app") : (zh ? "未开启" : "Off"),
          right: on
            ? <Btn onClick={() => { if (window.confirm(zh ? "确定关闭两步登录？" : "Turn off two-step sign-in?")) void api.twoStepOff(factor!).then(() => { setFactor(null); say(zh ? "已关闭两步登录" : "Two-step sign-in is off"); cloud.reopen(); }).catch(e => say((e as api.ApiError).message)); }}>{zh ? "关闭" : "Turn off"}</Btn>
            : !setup ? <Btn kind="ink" onClick={() => setSetup(true)}>{zh ? "开启" : "Turn on"}</Btn> : undefined },
        { label: B("Sign out everywhere", "在所有设备上退出"), sub: zh ? "退出所有设备上的登录，包括这台。" : "Ends every session on every device, including this one.", icon: <I.logout />,
          right: <Btn onClick={() => { if (window.confirm(zh ? "在所有设备上退出？" : "Sign out on every device?")) cloud.signOut(true); }}>{zh ? "全部退出" : "Sign out all"}</Btn> },
      ]}>
      {setup && <TwoStepSetup lang={lang} onCancel={() => setSetup(false)} onDone={() => { setSetup(false); say(zh ? "两步登录已开启" : "Two-step sign-in is on"); cloud.reopen(); }} />}
    </Group>
  );
}

export function Settings() {
  const { t, b, lang, setLang, cloud, mode, apiName, deep, setDeep, voiceOn, setVoiceOn, applyKey, dropKey, exportAudit, openLegal, ws } = useApp();
  const [key, setKey] = useState("");
  const [id, setId] = useState(API_MODELS[0].id);
  const [remember, setRemember] = useState(false);
  const [theme, setTheme] = useTheme();
  const bl = cloud?.billing;
  const planName = !cloud ? B("Growth plan (sample)", "成长版（示例）")
    : bl?.free && !bl.subscription_status ? B("Early access, everything included", "抢先体验，全部功能开放")
    : cloud.plan === "monthly" ? ({ starter: B("Starter plan", "入门版"), growth: B("Growth plan", "成长版"), scale: B("Scale plan", "规模版") } as Record<string, Bi>)[bl?.subscription_plan ?? ""] ?? B(bl?.comped ? "Monthly plan (pilot)" : "Monthly plan", bl?.comped ? "月度方案（试点）" : "月度方案")
    : cloud.plan === "entry" ? B(`Entry plan, ${bl?.entry_markets ?? 1} market${(bl?.entry_markets ?? 1) > 1 ? "s" : ""}`, `开店计划，${bl?.entry_markets ?? 1} 个市场`) : B("No plan yet", "尚未开通");
  const renew = bl?.current_period_end ? (lang === "zh" ? `${fmtDay(bl.current_period_end, lang, true)} 续费` : `Renews ${fmtDay(bl.current_period_end, lang, true)}`) : "";
  const SECTIONS: [string, Bi][] = [["account", B("Account", "账户")], ...(cloud ? [["team", B("Team", "团队")], ["security", B("Security", "安全")]] as [string, Bi][] : []), ["billing", B("Plan and billing", "方案与账单")], ["integrations", B("Integrations", "集成")], ["logins", B("Agency logins", "机构登录")], ["approvals", B("Approvals", "批准")], ["agent", B("Agent and voice", "助理与语音")], ["appearance", B("Appearance", "外观")], ["language", B("Language", "语言")], ["data", B("Data controls", "数据管理")], ["help", B("Help", "帮助")], ["legal", B("Legal", "法律")]];

  return (
    <div className="page settings">
      <header className="ph"><div className="ph-tx"><h1>{t("nav_settings")}</h1></div></header>
      <div className="set-grid">
        <nav className="set-nav" aria-label={t("nav_settings")}>
          {SECTIONS.map(([k, l]) => <a key={k} href={"#set-" + k} onClick={e => { e.preventDefault(); document.getElementById("set-" + k)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{b(l)}</a>)}
        </nav>
        <div className="set-col">
          <Group id="account" title={B("Account", "账户")} rows={cloud ? [
            { label: B("Email", "邮箱"), sub: <>{cloud.email}{lang === "zh" ? `，${cloud.owner ? "所有者" : "成员"}` : `, ${cloud.owner ? "owner" : "member"}`}</>, icon: <I.user /> },
            { label: B("Business", "企业"), sub: b(ws.business), icon: <I.store />, right: <Btn onClick={cloud.newWorkspace}>{lang === "zh" ? "新建企业" : "New business"}</Btn> },
            { label: B("Sign out", "退出登录"), icon: <I.logout />, right: <Btn onClick={cloud.signOut}>{lang === "zh" ? "退出" : "Sign out"}</Btn> },
            ...(api.PREVIEW ? [{ label: B("Data in this browser", "此浏览器中的数据"), sub: b(B("Your accounts and workspaces here are kept in this browser. Start over clears them.", "这里的账户和工作区保存在此浏览器中，重新开始会清空。")), icon: <I.spark />,
              right: <Btn onClick={() => { void import("./cloud/preview").then(m => { m.resetPreview(); location.reload(); }); }}>{lang === "zh" ? "清空重来" : "Start over"}</Btn> }] : []),
          ] : [{ label: B("Sample workspace", "示例工作区"), sub: b(B("Everything here is sample data. Create an account to save your own business.", "这里都是示例数据。注册账户即可保存您自己的企业。")), icon: <I.user /> }]} />

          <Team />
          <Security />

          <Group id="billing" title={B("Plan and billing", "方案与账单")} note={B("Payment methods and invoices are handled by Stripe; Placetta never sees card numbers. Government fees are paid by you directly to each agency.", "付款方式和发票由 Stripe 处理，快哉看不到卡号。政府规费由您直接支付给各机构。")}
            rows={[
              { label: planName, sub: renew || (bl?.free && !bl.subscription_status ? b(B("Paid plans start later. Nothing is charged now.", "付费方案稍后推出，现在不收取任何费用。")) : cloud?.plan === "entry" ? b(B("Credited toward your first year on an annual plan", "可抵扣年度方案首年费用")) : undefined), icon: <I.card />,
                right: cloud && !cloud.owner ? <em className="lock">{lang === "zh" ? "由所有者管理" : "Managed by owners"}</em> : cloud ? <>{cloud.plan !== "monthly" && <Btn kind="ink" onClick={() => cloud.openPlans(cloud.plan === "none" ? "start" : "file")}>{lang === "zh" ? "选择方案" : "Choose a plan"}</Btn>}{bl?.stripe_customer_id && <Btn onClick={() => void cloud.portal()}>{lang === "zh" ? "管理账单" : "Manage billing"}</Btn>}</> : undefined },
            ]} />

          <Integrations />
          <Logins />

          <Group id="approvals" title={B("Approvals", "批准")} note={B("Placetta prepares on its own. It never files, pays or sends without your approval, and that can't be turned off.", "快哉会自行准备材料，但未经您批准绝不提交、付款或发送，此项无法关闭。")}
            rows={[B("Every filing with a government agency", "向政府机构提交的每一项申请"), B("Every payment", "每一笔付款"), B("Every message sent for you", "代您发送的每一条消息")].map(l => ({ label: l, icon: <I.lock />, right: <em className="lock">{t("alwaysOn")}</em> }))} />

          <Group id="agent" title={B("Agent and voice", "助理与语音")} rows={[
            { label: mode === "server" ? B("Live", "实时") : mode === "claude" ? B("Live through your Claude account", "通过您的 Claude 账户实时运行") : mode === "api" ? B(`Live: Claude API (${apiName})`, `实时：Claude API（${apiName}）`) : B("Demo answers", "演示回答"),
              sub: mode === "server" ? b(B("Researches official agency pages and cites them. Answers are short; nothing is filed without you.", "查阅机构官方页面并注明出处。回答简短，未经您批准不会提交任何内容。")) : mode === "demo" ? b(B("Scripted replies for the sample workspace.", "示例工作区的脚本回复。")) : undefined, icon: <I.spark /> },
            ...(mode !== "demo" ? [{ label: B("Think longer on hard questions", "复杂问题多思考一会儿"), sub: t("deepNote"), right: <label className="switch"><input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} /><i /></label> }] : []),
            { label: B("Read every reply aloud", "朗读每一条回复"), sub: b(B("Voice messages are always answered aloud.", "语音消息始终会语音回复。")), right: <label className="switch"><input type="checkbox" checked={voiceOn} onChange={e => setVoiceOn(e.target.checked)} /><i /></label> },
            ...(mode === "api" ? [{ label: B("Anthropic API key", "Anthropic API 密钥"), right: <Btn onClick={dropKey}>{t("key_drop")}</Btn> }] : []),
          ]}>
            {mode === "demo" && !cloud && (
              <form className="sg-form keyform" onSubmit={e => { e.preventDefault(); if (key.trim()) { applyKey(key.trim(), id, remember); setKey(""); } }}>
                <input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={`${t("key_label")}: sk-ant-...`} aria-label={t("key_label")} />
                <select value={id} onChange={e => setId(e.target.value)} aria-label={t("key_model")}>{API_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
                <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>{t("key_remember")}</span></label>
                <div className="sg-form-act"><button type="submit" className="sbtn ink" disabled={!key.trim()}>{t("key_use")}</button></div>
                <p className="sg-note">{t("key_note")}</p>
              </form>
            )}
          </Group>

          <Group id="appearance" title={B("Appearance", "外观")} note={B("Dark mode for the agent and your workspace. Saved in this browser.", "为助理和工作区开启深色模式，保存在此浏览器中。")} rows={([
            ["light", B("Light", "浅色"), <I.sun />], ["dark", B("Dark", "深色"), <I.moon />], ["system", B("Match this device", "跟随设备"), <I.monitor />],
          ] as [Theme, Bi, ReactNode][]).map(([k, l, ic]) => ({ label: l, icon: ic, pick: () => setTheme(k), right: <label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="theme" checked={theme === k} onChange={() => setTheme(k)} aria-label={b(l)} /><i /></label> }))} />

          <Group id="language" title={B("Language", "语言")} rows={[
            { label: B("English", "English"), pick: () => setLang("en"), right: <label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="lang" checked={lang === "en"} onChange={() => setLang("en")} /><i /></label> },
            { label: B("简体中文", "简体中文"), pick: () => setLang("zh"), right: <label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="lang" checked={lang === "zh"} onChange={() => setLang("zh")} /><i /></label> },
          ]} />

          <Group id="data" title={B("Data controls", "数据管理")} note={B("Your data is yours. Placetta doesn't sell it or use it to train AI models.", "您的数据属于您。快哉不会出售数据，也不会用它训练 AI 模型。")} rows={[
            { label: B("Download your workspace data", "下载工作区数据"), sub: b(B("Applications, facts, deadlines, filings and the audit trail, as JSON", "申请、资料、截止日期、申报和审计记录（JSON）")), icon: <I.download />, right: <Btn onClick={() => (cloud ? cloud.exportData() : exportAudit())}>{lang === "zh" ? "下载" : "Download"}</Btn> },
            { label: B("Export the audit trail", "导出审计记录"), sub: "CSV", icon: <I.audit />, right: <Btn onClick={exportAudit}>{lang === "zh" ? "导出" : "Export"}</Btn> },
            { label: B("Delete your data", "删除数据"), sub: b(B("Email us and we delete it, except records the law requires us to keep.", "发邮件给我们即可删除，法律要求保留的记录除外。")), icon: <I.x />, right: <a className="sbtn quiet" href="mailto:support@placetta.com?subject=Delete%20my%20data">{lang === "zh" ? "申请删除" : "Ask to delete"}</a> },
          ]} />

          <Group id="help" title={B("Help", "帮助")} rows={[
            { label: B("Help Center", "帮助中心"), sub: b(B("Guides for every part of Placetta", "快哉各项功能的使用指南")), icon: <I.help />, right: <a className="sbtn quiet" href={api.PREVIEW ? "https://placetta.vercel.app/help/" : "/help/"} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "打开" : "Open"}</a> },
            { label: B("Email support", "邮件支持"), sub: "support@placetta.com", icon: <I.help />, right: <a className="sbtn quiet" href="mailto:support@placetta.com">{lang === "zh" ? "写邮件" : "Email"}</a> },
            { label: B("Report a problem", "报告问题"), icon: <I.bell />, right: <a className="sbtn quiet" href="mailto:support@placetta.com?subject=Problem%20report">{lang === "zh" ? "报告" : "Report"}</a> },
            { label: B("How Placetta's AI works", "快哉的 AI 如何工作"), icon: <I.spark />, right: <Btn onClick={() => openLegal("ai")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
          ]} />

          <Group id="legal" title={B("Legal", "法律")} note={B("Replies are generated by AI and can be wrong. Nothing is filed, paid or sent without your approval.", "回复由 AI 生成，可能有误。未经您批准，不会提交、付款或发送任何内容。")} rows={[
            { label: B("Terms of Service", "服务条款"), icon: <I.scale />, right: <Btn onClick={() => openLegal("terms")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
            { label: B("Privacy Policy", "隐私政策"), icon: <I.lock />, right: <Btn onClick={() => openLegal("privacy")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
            { label: B("Filing Authorization", "申报授权书"), sub: cloud ? b(B("You gave it when you created this workspace", "您在创建工作区时已授权")) : undefined, icon: <I.form />, right: <Btn onClick={() => openLegal("authorization")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
          ]} />
          <Footer full />
        </div>
      </div>
    </div>
  );
}
