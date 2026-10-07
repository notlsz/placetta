import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useApp } from "./ctx";
import { B, type Bi } from "./model";
import { API_MODELS } from "./live";
import { fmtAgo, fmtDay } from "./time";
import { Footer, I, Modal } from "./ui";
import { ACCENTS, applyAccent, readAccent, useTheme, type Theme } from "./hooks";
import { IMPORT_PROMPT, PREFS, PROFILE, importMemory } from "./memory";
import type { MemoryFile, MemoryKind, Skill, SkillSource } from "./model";
import { allSkills, dropSkill, putSkill, toggleSkill } from "./skills";
import { LANGUAGES, readSpeak, saveSpeak, speakOf, uiLangOf } from "./langs";
import * as api from "./cloud/api";
import type { IntegrationKind } from "./cloud/api";
import { TwoStepSetup } from "./cloud/TwoStep";
import gmailLogo from "./assets/integrations/gmail.png";
import outlookLogo from "./assets/integrations/outlook.svg";
import gcalLogo from "./assets/integrations/calendar.png";
import gdriveLogo from "./assets/integrations/drive.png";
import dropboxLogo from "./assets/integrations/dropbox.svg";
import squareLogo from "./assets/integrations/square.svg";
import toastLogo from "./assets/integrations/toast.svg";
import qbLogo from "./assets/integrations/quickbooks.svg";
import slackLogo from "./assets/integrations/slack.png";


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

/* The settings PIN: when it's on and not unlocked, sensitive controls ask for it first. */
type PinCtx = { locked: boolean; guard: (fn: () => void) => void };
const PinLock = createContext<PinCtx>({ locked: false, guard: fn => fn() });
const usePin = () => useContext(PinLock);

const Btn = ({ children, onClick, kind = "quiet", disabled, guard }: { children: ReactNode; onClick: () => void; kind?: "quiet" | "ink" | "line"; disabled?: boolean; guard?: boolean }) => {
  const pin = usePin();
  const locked = guard && pin.locked;
  return <button type="button" className={"sbtn " + kind + (locked ? " pinned" : "")} onClick={() => (guard ? pin.guard(onClick) : onClick())} disabled={disabled}>{locked && <I.lock />}{children}</button>;
};

const Tile = ({ logo, wide }: { logo?: string; wide?: boolean }) => <span className={"tile logo" + (wide ? " wide" : "")} aria-hidden="true">{logo ? <img src={logo} alt="" /> : <I.deadlines />}</span>;

const INTEGRATIONS: { group: Bi; items: { kind: IntegrationKind | "feed" | "square" | "toast"; name: string; zh?: string; why: Bi; logo?: string; wide?: boolean }[] }[] = [
  { group: B("Email", "邮件"), items: [
    { kind: "gmail", name: "Gmail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), logo: gmailLogo },
    { kind: "outlook_mail", name: "Outlook Mail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), logo: outlookLogo },
  ] },
  { group: B("Calendar", "日历"), items: [
    { kind: "gcal", name: "Google Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), logo: gcalLogo },
    { kind: "outlook_cal", name: "Outlook Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), logo: outlookLogo },
    { kind: "feed", name: "Calendar feed", zh: "日历订阅", why: B("Any calendar app: subscribe with a private link", "任何日历应用：用私密链接订阅"),  },
  ] },
  { group: B("Documents", "文件"), items: [
    { kind: "gdrive", name: "Google Drive", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), logo: gdriveLogo },
    { kind: "dropbox", name: "Dropbox", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), logo: dropboxLogo },
  ] },
  { group: B("Sales, payroll and accounting", "销售、薪资与财务"), items: [
    { kind: "square", name: "Square", why: B("Sales for sales tax, schedules for labor-law checks", "销售额用于销售税，排班用于劳动法检查"), logo: squareLogo },
    { kind: "toast", name: "Toast", why: B("Sales for sales tax, schedules for labor-law checks", "销售额用于销售税，排班用于劳动法检查"), logo: toastLogo, wide: true },
    { kind: "quickbooks", name: "QuickBooks", why: B("Gross receipts for business tax and renewals", "营业总额用于营业税和续期"), logo: qbLogo },
  ] },
  { group: B("Team", "团队"), items: [
    { kind: "slack", name: "Slack", why: B("Filing updates in your team's channel", "申报进展推送到团队频道"), logo: slackLogo },
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
              if (it.kind === "feed") right = cloud ? <Btn guard onClick={async () => { try { const u = await cloud.feedUrl(); setFeed(u); await navigator.clipboard?.writeText(u).catch(() => undefined); say(lang === "zh" ? "订阅链接已复制" : "Link copied"); } catch (e) { say((e as { message: string }).message); } }}>{lang === "zh" ? "复制链接" : "Copy link"}</Btn> : <Btn onClick={demo}>{lang === "zh" ? "复制链接" : "Copy link"}</Btn>;
              else if (it.kind === "square" || it.kind === "toast") right = <Btn onClick={() => request(it.name)}>{lang === "zh" ? "申请接入" : "Request"}</Btn>;
              else if (cloud && !cloud.owner) right = c ? undefined : <em className="lock">{lang === "zh" ? "由所有者连接" : "Owners connect"}</em>;
              else if (c) right = <Btn guard onClick={() => void cloud!.disconnect(it.kind as IntegrationKind)}>{lang === "zh" ? "断开" : "Disconnect"}</Btn>;
              else right = <Btn guard kind="line" onClick={() => (cloud ? void cloud.connect(it.kind as IntegrationKind) : demo())}>{lang === "zh" ? "连接" : "Connect"}</Btn>;
              const status = c ? (c.status === "error" ? <em className="bad">{lang === "zh" ? "需要重新连接" : "Reconnect needed"}</em> : <em className="ok"><i />{c.account ?? (lang === "zh" ? "已连接" : "Connected")}</em>) : null;
              return (
                <li key={it.kind} className="sg-row">
                  <Tile logo={it.logo} wide={it.wide} />
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
      <Group id="logins" title={B("Agency logins", "机构登录")} note={B("Saved logins for agency portals, encrypted in a vault. Placetta opens one only to file for you, and each opening shows in your audit trail.", "加密保存在保险库中的机构门户登录信息。快哉只在为您提交时打开，每次打开都会记入审计记录。")}
        rows={ws.connections.filter(c => c.level !== "vault").map(c => ({ label: c.name, sub: b(c.detail), icon: <I.key />, right: c.state === "connected" ? <em className="ok"><i />{lang === "zh" ? "已保存" : "Saved"}</em> : <Btn kind="line" onClick={() => undefined}>{lang === "zh" ? "添加" : "Add"}</Btn> }))} />
    );
  }
  return (
    <Group id="logins" title={B("Agency logins", "机构登录")} note={B("Saved logins for agency portals, encrypted in a vault. Placetta opens one only to file for you, and each opening shows in your audit trail. Never save Social Security or bank numbers here.", "加密保存在保险库中的机构门户登录信息。快哉只在为您提交时打开，每次打开都会记入审计记录。请勿在此保存社会安全号或银行账号。")}
      rows={cloud.logins.map(l => ({ label: { en: l.agency, zh: l.agency }, icon: <I.key />,
        sub: <>{l.username}{l.last_opened_at ? (lang === "zh" ? `，团队上次打开 ${fmtAgo(l.last_opened_at, lang)}` : `. Team last opened it ${fmtAgo(l.last_opened_at, lang)}`) : ""}</>,
        right: cloud.owner ? <Btn guard onClick={() => void cloud.removeLogin(l.id)}>{lang === "zh" ? "删除" : "Remove"}</Btn> : undefined }))}>
      {!cloud.owner ? <p className="sg-note">{lang === "zh" ? "只有所有者可以添加或删除登录信息。" : "Only owners can add or remove saved logins."}</p> : adding ? (
        <form className="sg-form" onSubmit={e => { e.preventDefault(); if (!f.agency.trim() || !f.username.trim() || !f.password) return; void cloud.saveLogin({ agency: f.agency.trim(), url: f.url.trim() || undefined, username: f.username.trim(), password: f.password, note: f.note.trim() || undefined }).then(() => { setAdding(false); setF({ agency: "", url: "", username: "", password: "", note: "" }); }); }}>
          <input placeholder={lang === "zh" ? "机构，例如 CDTFA" : "Agency, e.g. CDTFA"} value={f.agency} onChange={e => setF({ ...f, agency: e.target.value })} aria-label="Agency" />
          <input placeholder="https://…" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} aria-label="Website" />
          <input placeholder={lang === "zh" ? "用户名" : "Username"} autoComplete="off" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} aria-label="Username" />
          <input type="password" placeholder={lang === "zh" ? "密码" : "Password"} autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} aria-label="Password" />
          <div className="sg-form-act"><Btn onClick={() => setAdding(false)}>{lang === "zh" ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink">{lang === "zh" ? "加密保存" : "Save encrypted"}</button></div>
        </form>
      ) : <div className="sg-act"><Btn guard kind="line" onClick={() => setAdding(true)}><I.plus />{lang === "zh" ? "添加登录" : "Add a login"}</Btn></div>}
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
  const pin = usePin();
  if (!cloud) return null;
  const owner = cloud.owner;
  const owners = team?.members.filter(m => m.role === "owner").length ?? 0;
  const roleName = (r: api.Role) => (r === "owner" ? (zh ? "所有者" : "Owner") : (zh ? "成员" : "Member"));
  const act = async (fn: () => Promise<unknown>, done?: string) => { try { await fn(); if (done) say(done); await load(); } catch (e) { say((e as api.ApiError).message); } };
  const sentNote = (sent: string, email: string) => sent === "not_sent"
    ? (zh ? `已邀请 ${email}，但邮件没发出去。请让对方用这个邮箱登录。` : `Invited ${email}, but the email didn't send. Ask them to sign in with that address.`)
    : (zh ? `已邀请 ${email}。对方用这个邮箱登录即可加入。` : `Invited ${email}. They join when they sign in with that address.`);
  const invite = async () => {
    if (pin.locked) { pin.guard(() => void invite()); return; }
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
            <select className="sg-select" value={m.role} aria-label={zh ? "角色" : "Role"} onChange={e => { const v = e.target.value as api.Role; pin.guard(() => void act(() => api.setRole(wsId, m.user_id, v), zh ? "角色已更新" : "Role updated")); }}>
              <option value="owner">{roleName("owner")}</option><option value="member">{roleName("member")}</option>
            </select>
            <Btn guard onClick={() => { if (window.confirm(zh ? `将 ${m.email} 移出工作区？` : `Remove ${m.email}?`)) void act(() => api.removeMember(wsId, m.user_id), zh ? "已移出" : "Removed"); }}>{zh ? "移出" : "Remove"}</Btn>
          </> : undefined,
    })),
    ...(team?.invites ?? []).map(i => ({
      label: { en: i.email, zh: i.email }, icon: <I.bell />,
      sub: <>{roleName(i.role)}{zh ? "，已邀请，等待登录" : ", invited, waiting for them to sign in"}</>,
      right: <>
        <Btn guard onClick={() => void act(async () => { const r = await api.resendInvite(wsId, i.id); say(sentNote(r.sent, i.email)); })}>{zh ? "重发" : "Resend"}</Btn>
        <Btn guard onClick={() => void act(() => api.revokeInvite(i.id), zh ? "邀请已取消" : "Invite canceled")}>{zh ? "取消" : "Cancel"}</Btn>
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
  const [pw, setPw] = useState<{ open: boolean; a: string; b: string; show: boolean; busy: boolean }>({ open: false, a: "", b: "", show: false, busy: false });
  const savePw = async () => {
    if (pw.a.length < 8) { say(zh ? "密码至少 8 个字符。" : "Use at least 8 characters."); return; }
    if (pw.a !== pw.b) { say(zh ? "两次输入的密码不一致。" : "The passwords don't match."); return; }
    setPw(x => ({ ...x, busy: true }));
    try { await api.changePassword(pw.a); setPw({ open: false, a: "", b: "", show: false, busy: false }); say(zh ? "密码已更新。下次可用新密码登录。" : "Password changed. Use it next time you sign in."); }
    catch (e) {
      const c = (e as api.ApiError).code;
      say(c === "weak" ? (zh ? "这个密码太弱了，换一个更长或更复杂的。" : "That password is too weak. Try a longer one.") : c === "same" ? (zh ? "新密码不能与旧密码相同。" : "Pick a password different from your current one.") : c === "reauth" ? (zh ? "为安全起见，请退出后重新登录，再修改密码。" : "For security, sign out and back in, then change it.") : (e as api.ApiError).message);
      setPw(x => ({ ...x, busy: false }));
    }
  };
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
            ? <Btn guard onClick={() => { if (window.confirm(zh ? "确定关闭两步登录？" : "Turn off two-step sign-in?")) void api.twoStepOff(factor!).then(() => { setFactor(null); say(zh ? "已关闭两步登录" : "Two-step sign-in is off"); cloud.reopen(); }).catch(e => say((e as api.ApiError).message)); }}>{zh ? "关闭" : "Turn off"}</Btn>
            : !setup ? <Btn guard kind="ink" onClick={() => setSetup(true)}>{zh ? "开启" : "Turn on"}</Btn> : undefined },
        { label: B("Password", "密码"), icon: <I.key />, sub: zh ? "用邮箱和密码登录，或改用邮箱验证码。" : "Sign in with your email and password, or with an email code.",
          right: !pw.open ? <Btn guard onClick={() => setPw(x => ({ ...x, open: true }))}>{zh ? "修改密码" : "Change password"}</Btn> : undefined },
        { label: B("Sign out everywhere", "在所有设备上退出"), sub: zh ? "退出所有设备上的登录，包括这台。" : "Ends every session on every device, including this one.", icon: <I.logout />,
          right: <Btn onClick={() => { if (window.confirm(zh ? "在所有设备上退出？" : "Sign out on every device?")) cloud.signOut(true); }}>{zh ? "全部退出" : "Sign out all"}</Btn> },
      ]}>
      {pw.open && (
        <form className="sg-form pwform" onSubmit={e => { e.preventDefault(); void savePw(); }}>
          <input id="pw-new" type={pw.show ? "text" : "password"} autoComplete="new-password" placeholder={zh ? "新密码（至少 8 个字符）" : "New password (8+ characters)"} value={pw.a} onChange={e => setPw(x => ({ ...x, a: e.target.value }))} aria-label={zh ? "新密码" : "New password"} autoFocus />
          <input id="pw-again" type={pw.show ? "text" : "password"} autoComplete="new-password" placeholder={zh ? "再次输入新密码" : "Type it again"} value={pw.b} onChange={e => setPw(x => ({ ...x, b: e.target.value }))} aria-label={zh ? "确认新密码" : "Confirm new password"} />
          <label className="check"><input type="checkbox" checked={pw.show} onChange={e => setPw(x => ({ ...x, show: e.target.checked }))} /><span>{zh ? "显示密码" : "Show passwords"}</span></label>
          <div className="sg-form-act"><Btn onClick={() => setPw({ open: false, a: "", b: "", show: false, busy: false })}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={pw.busy || !pw.a || !pw.b}>{pw.busy ? "…" : zh ? "保存新密码" : "Save new password"}</button></div>
        </form>
      )}
      {setup && <TwoStepSetup lang={lang} onCancel={() => setSetup(false)} onDone={() => { setSetup(false); say(zh ? "两步登录已开启" : "Two-step sign-in is on"); cloud.reopen(); }} />}
    </Group>
  );
}

/* ---------------------------------- memory ---------------------------------- */

const ago = (iso: string, zh: boolean) => fmtAgo(iso, zh ? "zh" : "en");
function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return <label className="switch" onClick={e => e.stopPropagation()}><input type="checkbox" checked={on} onChange={e => set(e.target.checked)} aria-label={label} /><i /></label>;
}

function MemoryGroup() {
  const { lang, memory, setMemory, say } = useApp();
  const zh = lang === "zh";
  const [view, setView] = useState<MemoryFile | null>(null);
  const [draft, setDraft] = useState("");
  const [imp, setImp] = useState<0 | 1>(0);
  const [paste, setPaste] = useState("");
  if (!memory) return null;
  const st = memory.settings;
  const set = (k: keyof typeof st) => (v: boolean) => setMemory(b => ({ ...b, settings: { ...b.settings, [k]: v } }));
  const files = memory.files;
  const you = [files.find(f => f.id === "profile") ?? PROFILE(), files.find(f => f.id === "preferences") ?? PREFS()];
  const group = (k: MemoryKind) => files.filter(f => f.kind === k).sort((a, b) => a.name.localeCompare(b.name));
  const table = (title: string, rows: MemoryFile[]) => (
    <div className="sg-sub mem">
      <h3>{title}</h3>
      {rows.length ? (
        <table className="memt">
          <thead><tr><th>{zh ? "名称" : "Name"}</th><th>{zh ? "摘要" : "Summary"}</th><th>{zh ? "最后更新" : "Last updated"}</th><th><span className="sr">{zh ? "操作" : "Actions"}</span></th></tr></thead>
          <tbody>{rows.map(f => (
            <tr key={f.id}>
              <td><b>{f.name}</b></td>
              <td>{f.summary}{f.lines.length ? "" : <em>{zh ? "（暂无内容）" : " (nothing yet)"}</em>}</td>
              <td className="when">{files.includes(f) ? ago(f.updated, zh) : "-"}</td>
              <td className="acts">
                <button type="button" className="sbtn quiet" onClick={() => { setView(f); setDraft(f.lines.join("\n")); }}>{zh ? "查看" : "View"}</button>
                {files.includes(f) && <button type="button" className="sbtn quiet" aria-label={zh ? `删除 ${f.name}` : `Delete ${f.name}`} onClick={() => { if (window.confirm(zh ? `删除“${f.name}”中的全部记忆？` : `Delete everything in ${f.name}?`)) setMemory(b => ({ ...b, files: b.files.filter(x => x.id !== f.id) })); }}><I.x /></button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="sg-note">{zh ? "还没有。和快哉聊得越多，这里会越充实。" : "Nothing yet. This fills in as you work with Placetta."}</p>}
    </div>
  );
  return (
    <Group id="memory" title={B("Memory", "记忆")} note={B("What Placetta remembers about you, so you don't have to repeat yourself. Only you can see your memory, and you can edit or delete any of it.", "快哉记住的关于您的信息，让您不必重复说明。只有您能看到自己的记忆，并可随时编辑或删除。")}
      rows={[
        { label: B("Search and reference past chats", "搜索并引用以往对话"), sub: zh ? "允许快哉在以往的对话中查找相关细节。" : "Let Placetta look up relevant details from your earlier chats.", right: <Toggle on={st.searchChats} set={set("searchChats")} label="Search past chats" /> },
        { label: B("Generate memory from chats", "从对话中生成记忆"), sub: zh ? "允许快哉从对话中记住关于您和您工作的持久信息。" : "Let Placetta remember lasting details about you and your work from your chats.", right: <Toggle on={st.generate} set={set("generate")} label="Generate memory" /> },
        { label: B("Include sensitive topics in memory", "记忆中包含敏感话题"), sub: zh ? "允许保存健康、宗教信仰、政治或财务等敏感细节。" : "Let Placetta save sensitive details like health, religious beliefs, politics or finances.", right: <Toggle on={st.sensitive} set={set("sensitive")} label="Include sensitive topics" /> },
        { label: B("Import memory from other AI assistants", "从其他 AI 助手导入记忆"), sub: zh ? "把其他 AI 助手对您的了解带到快哉。我们会给您一段提示词，用来取出那边的记忆。" : "Bring what another AI assistant knows about you. We'll give you a prompt that gets your memory out of it.", right: <Btn onClick={() => { setImp(1); setPaste(""); }}>{zh ? "开始导入" : "Start import"}</Btn> },
      ]}>
      {table(zh ? "您" : "You", you)}
      {table(zh ? "话题" : "Topics", group("topic"))}
      {table(zh ? "领域" : "Areas", group("area"))}
      {view && (
        <Modal label={view.name} onClose={() => setView(null)}>
          <header className="m-h"><span className="m-eyebrow"><I.spark />{zh ? "记忆" : "Memory"}</span><h2>{view.name}</h2><p>{view.summary}</p></header>
          <div className="m-body">
            <p className="sg-note">{zh ? "每行一条。可直接修改、增加或删除。" : "One fact per line. Edit, add or delete lines."}</p>
            <textarea className="memedit" value={draft} onChange={e => setDraft(e.target.value)} rows={12} aria-label={view.name} />
            <div className="sg-form-act">
              <Btn onClick={() => setView(null)}>{zh ? "取消" : "Cancel"}</Btn>
              <button type="button" className="sbtn ink" onClick={() => {
                const lines = draft.split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 60);
                setMemory(b => { const exists = b.files.some(x => x.id === view.id); const f = { ...view, lines, updated: new Date().toISOString() }; return { ...b, files: exists ? b.files.map(x => (x.id === view.id ? f : x)) : [...b.files, f] }; });
                setView(null); say(zh ? "记忆已更新。" : "Memory updated.");
              }}>{zh ? "保存" : "Save"}</button>
            </div>
          </div>
        </Modal>
      )}
      {imp === 1 && (
        <Modal label={zh ? "导入记忆" : "Import memory"} onClose={() => setImp(0)} wide>
          <header className="m-h"><span className="m-eyebrow"><I.spark />{zh ? "记忆" : "Memory"}</span><h2>{zh ? "把记忆导入快哉" : "Import memory to Placetta"}</h2></header>
          <div className="m-body memimp">
            <section><h3><span className="num">1</span>{zh ? "把这段提示词复制到您在其他 AI 助手的对话中" : "Copy this prompt into a chat with your other AI assistant"}</h3>
              <pre className="mempr">{IMPORT_PROMPT}</pre>
              <Btn onClick={() => { void navigator.clipboard?.writeText(IMPORT_PROMPT).then(() => say(zh ? "已复制" : "Copied"), () => say(zh ? "无法复制，请手动选中复制" : "Couldn't copy. Select the text and copy it.")); }}>{zh ? "复制提示词" : "Copy prompt"}</Btn>
            </section>
            <section><h3><span className="num">2</span>{zh ? "把结果粘贴到下面，加入快哉的记忆" : "Paste the results below to add them to Placetta's memory"}</h3>
              <textarea className="memedit" rows={8} value={paste} onChange={e => setPaste(e.target.value)} placeholder="[2026-01-05] - …" aria-label={zh ? "粘贴导出的记忆" : "Paste the exported memory"} />
              <div className="sg-form-act">
                <Btn onClick={() => setImp(0)}>{zh ? "取消" : "Cancel"}</Btn>
                <button type="button" className="sbtn ink" disabled={!paste.trim()} onClick={() => {
                  let added = 0, skipped = 0;
                  setMemory(b => { const r = importMemory(b, paste); added = r.added; skipped = r.skipped; return r.book; });
                  setTimeout(() => say(zh ? `已加入 ${added} 条记忆${skipped ? `，${skipped} 条敏感内容未保存` : ""}。` : `Added ${added} memor${added === 1 ? "y" : "ies"}${skipped ? `. ${skipped} sensitive item${skipped === 1 ? " was" : "s were"} left out` : ""}.`), 0);
                  setImp(0);
                }}>{zh ? "加入记忆" : "Add to memory"}</button>
              </div>
            </section>
          </div>
        </Modal>
      )}
    </Group>
  );
}

/* ------------------------------ skills ------------------------------ */

const SRC_LABEL: Record<SkillSource, Bi> = { placetta: B("Placetta", "快哉"), auto: B("Learned by Placetta", "快哉自学"), you: B("You", "您") };

function SkillEditor({ sk, onClose }: { sk: Skill | "new"; onClose: () => void }) {
  const { lang, editWs, say } = useApp();
  const zh = lang === "zh";
  const fresh = sk === "new", ro = !fresh && sk.source === "placetta";
  const [name, setName] = useState(fresh ? "" : sk.name[lang]);
  const [desc, setDesc] = useState(fresh ? "" : sk.description[lang]);
  const [body, setBody] = useState(fresh ? "" : sk.body);
  const save = () => {
    if (!name.trim() || !body.trim()) { say(zh ? "请填写名称和说明。" : "Add a name and the instructions."); return; }
    if (/\b\d{3}-?\d{2}-?\d{4}\b|\b\d{13,19}\b/.test(body)) { say(zh ? "技能里不能包含证件号或卡号。" : "A skill can't hold ID or card numbers."); return; }
    editWs(putSkill({ ...(fresh ? {} : { id: sk.id }), name: { en: name.trim(), zh: name.trim() }, description: { en: desc.trim(), zh: desc.trim() }, body: body.trim(), source: fresh ? "you" : sk.source, kind: fresh ? "custom" : sk.kind }));
    say(fresh ? (zh ? "技能已创建。" : "Skill created.") : (zh ? "技能已更新。" : "Skill updated."));
    onClose();
  };
  return (
    <Modal label={fresh ? (zh ? "创建技能" : "Create skill") : sk.name[lang]} onClose={onClose} wide>
      <header className="m-h"><span className="m-eyebrow"><I.spark />{zh ? "技能" : "Skill"}{!fresh && <>{zh ? "，" : ", "}{SRC_LABEL[sk.source][lang]}</>}</span>
        <h2>{fresh ? (zh ? "创建技能" : "Create a skill") : sk.name[lang]}</h2>
        {!fresh && sk.uses > 0 && <p>{zh ? `已使用 ${sk.uses} 次` : `Used ${sk.uses} time${sk.uses === 1 ? "" : "s"}`}{sk.firstSteps && sk.lastSteps ? (zh ? `。第一次用了 ${sk.firstSteps} 步，最近一次 ${sk.lastSteps} 步。` : `. The first took ${sk.firstSteps} step${sk.firstSteps === 1 ? "" : "s"}, the last took ${sk.lastSteps}.`) : "."}</p>}</header>
      <div className="m-body skedit">
        <label><span>{zh ? "名称" : "Name"}</span><input value={name} onChange={e => setName(e.target.value)} readOnly={ro} placeholder={zh ? "例如：在厦门开奶茶店" : "e.g. Open a milk tea shop in Xiamen"} maxLength={80} /></label>
        <label><span>{zh ? "用途" : "What it's for"}</span><input value={desc} onChange={e => setDesc(e.target.value)} readOnly={ro} placeholder={zh ? "一句话说明它做什么、什么时候用" : "One sentence: what it does and when to use it"} maxLength={300} /></label>
        <label><span>{zh ? "说明" : "Instructions"}</span><textarea className="memedit" rows={12} value={body} onChange={e => setBody(e.target.value)} readOnly={ro} placeholder={zh ? "1. 第一步……\n2. ……" : "1. First...\n2. ..."} /></label>
        {!fresh && sk.fills && sk.fills.length > 0 && <p className="sg-note">{zh ? `记得 ${sk.fills.length} 行表格各自的来源，下次会自动填写。` : `Remembers where ${sk.fills.length} lines of the form come from, so the next one fills itself.`}</p>}
        {ro ? <p className="sg-note">{zh ? "快哉内置技能，可以关闭但不能修改。" : "Built into Placetta. You can turn it off but not edit it."}</p> : null}
        <div className="sg-form-act">
          <Btn onClick={onClose}>{ro ? (zh ? "关闭" : "Close") : zh ? "取消" : "Cancel"}</Btn>
          {!ro && <button type="button" className="sbtn ink" onClick={save}>{fresh ? (zh ? "创建" : "Create") : zh ? "保存" : "Save"}</button>}
        </div>
      </div>
    </Modal>
  );
}

function SkillsGroup() {
  const { lang, ws, editWs, say } = useApp();
  const zh = lang === "zh";
  const [open, setOpen] = useState<Skill | "new" | null>(null);
  const [q, setQ] = useState("");
  const all = allSkills(ws);
  const match = (s: Skill) => !q.trim() || `${s.name.en} ${s.name.zh} ${s.description.en} ${s.description.zh}`.toLowerCase().includes(q.trim().toLowerCase());
  const mine = all.filter(s => s.source !== "placetta").filter(match), ours = all.filter(s => s.source === "placetta").filter(match);
  const auto = ws.skillsAuto !== false;
  const table = (rows: Skill[]) => (
    <table className="memt skt">
      <thead><tr><th>{zh ? "名称" : "Name"}</th><th>{zh ? "说明" : "Description"}</th><th>{zh ? "更新" : "Updated"}</th><th><span className="sr">{zh ? "开关与操作" : "On and actions"}</span></th></tr></thead>
      <tbody>{rows.map(s => (
        <tr key={s.id} className={s.on ? "" : "off"}>
          <td><button type="button" className="sk-n" onClick={() => setOpen(s)}><b>{s.name[lang]}</b><small>{SRC_LABEL[s.source][lang]}{s.uses ? (zh ? `，用过 ${s.uses} 次` : `, used ${s.uses}x`) : ""}</small></button></td>
          <td>{s.description[lang]}</td>
          <td className="when">{fmtDay(s.updated, lang, true)}</td>
          <td className="acts">
            <Toggle on={s.on} set={v => editWs(toggleSkill(s.id, v))} label={(zh ? "启用 " : "Turn on ") + s.name[lang]} />
            {s.source !== "placetta" && <button type="button" className="sbtn quiet" aria-label={zh ? `删除 ${s.name.zh}` : `Delete ${s.name.en}`} onClick={() => { if (window.confirm(zh ? `删除技能“${s.name.zh}”？` : `Delete the skill "${s.name.en}"?`)) { editWs(dropSkill(s.id)); say(zh ? "已删除。" : "Deleted."); } }}><I.x /></button>}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
  return (
    <Group id="skills" title={B("Skills", "技能")} note={B("Skills teach Placetta how you work. It learns new ones as it fills forms and researches new cities, so the next time is faster, and you can write your own.", "技能教快哉按您的方式做事。它在填写表格、调研新城市时自动学习新技能，下次更快完成；您也可以自己编写。")}
      rows={[{ label: B("Create skills automatically", "自动创建技能"), sub: zh ? "快哉弄清一件以后还会用到的事时（某张表怎么填、某个新城市需要哪些许可），自动存为技能。" : "When Placetta works out something it'll need again (how a form is filled, what a new city requires), it saves it as a skill.", right: <Toggle on={auto} set={v => editWs(w => ({ ...w, skillsAuto: v }))} label="Create skills automatically" /> }]}>
      <div className="sk-bar">
        <input className="sk-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={zh ? "搜索技能" : "Search skills"} aria-label={zh ? "搜索技能" : "Search skills"} />
        <Btn kind="ink" onClick={() => setOpen("new")}><I.plus />{zh ? "创建技能" : "Create skill"}</Btn>
      </div>
      <div className="sg-sub mem">
        <h3>{zh ? "您的技能" : "Your skills"}</h3>
        {mine.length ? table(mine) : (
          <div className="sk-empty">
            <I.spark />
            <b>{q ? (zh ? "没有匹配的技能" : "No skills match") : zh ? "添加您的第一个技能" : "Add your first skills"}</b>
            {!q && <p>{zh ? "技能教快哉按您的方式做事。快哉会在工作中自动创建，您也可以自己编写。" : "Skills teach Placetta how you work. Placetta creates them as it works, or create your own."}</p>}
          </div>
        )}
      </div>
      <div className="sg-sub mem">
        <h3>{zh ? "来自快哉" : "From Placetta"}</h3>
        {ours.length ? table(ours) : <p className="sg-note">{zh ? "没有匹配的技能。" : "No skills match."}</p>}
      </div>
      {open && <SkillEditor sk={open} onClose={() => setOpen(null)} />}
    </Group>
  );
}

/* ------------------------------ language ------------------------------ */

function LanguageGroup() {
  const { lang, setLang } = useApp();
  const zh = lang === "zh";
  const [picked, setPicked] = useState(() => readSpeak());
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const cur = picked && uiLangOf(picked.code) === lang ? picked : speakOf(lang === "zh" ? "zh-CN" : "en-US")!;
  const list = LANGUAGES.filter(l => !q.trim() || `${l.native} ${l.en} ${l.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (code: string) => { saveSpeak(code); setPicked(speakOf(code) ?? null); setLang(uiLangOf(code)); setOpen(false); setQ(""); };
  return (
    <Group id="language" title={B("Language", "语言")} note={B("Placetta writes and speaks to you in this language, and drafts agency letters in the agency's own language. Menus and pages show in English, or Chinese for the Chinese options.", "快哉用这里选择的语言与您交流，并用机构所在地的语言起草致机构的信函。菜单和页面显示英文，选择中文时显示中文。")}
      rows={[{ label: B("Language", "语言"), sub: <>{cur.native}{cur.native !== cur.en ? <span className="quiet">, {cur.en}</span> : null}</>, icon: <I.globe />, right: <Btn onClick={() => setOpen(true)}>{zh ? "更改" : "Change"}</Btn> }]}>
      {open && (
        <Modal label={zh ? "语言" : "Language"} onClose={() => { setOpen(false); setQ(""); }}>
          <header className="m-h"><span className="m-eyebrow"><I.globe />{zh ? "语言" : "Language"}</span><h2>{zh ? "选择语言" : "Choose a language"}</h2></header>
          <div className="m-body langpick">
            <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={zh ? "搜索语言" : "Search languages"} aria-label={zh ? "搜索语言" : "Search languages"} />
            <p className="sg-note" aria-live="polite">{zh ? `找到 ${list.length} 种语言` : `${list.length} language${list.length === 1 ? "" : "s"} found`}</p>
            <ul role="listbox" aria-label={zh ? "语言" : "Languages"}>
              {list.map(l => (
                <li key={l.code}><button type="button" role="option" aria-selected={l.code === cur.code} onClick={() => pick(l.code)}>
                  <span><b dir="auto">{l.native}</b>{l.native !== l.en && <small>{l.en}</small>}</span>{l.code === cur.code && <I.check />}
                </button></li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </Group>
  );
}

/* ------------------------------ settings PIN ------------------------------ */

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);
function PinInput({ id, value, onChange, label, auto }: { id: string; value: string; onChange: (v: string) => void; label: string; auto?: boolean }) {
  return <input id={id} className="pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="••••••" value={value} onChange={e => onChange(digits(e.target.value))} aria-label={label} autoFocus={auto} />;
}
const pinError = (e: unknown, zh: boolean) => {
  const x = e as api.ApiError;
  if (x.code === "pin_wrong") return zh ? `PIN 不对。还可以再试 ${x.message} 次。` : `That PIN is wrong. ${x.message} tr${x.message === "1" ? "y" : "ies"} left.`;
  if (x.code === "pin_locked") return zh ? "错误次数太多，PIN 已锁定 15 分钟。" : "Too many wrong tries. The PIN is locked for 15 minutes.";
  if (x.code === "pin_format") return zh ? "PIN 必须是 6 位数字。" : "The PIN must be 6 digits.";
  return x.message ?? String(e);
};

/** Asks for the PIN, then does what was asked. */
function PinPrompt({ title, action, onDone, onClose }: { title: string; action: (pin: string) => Promise<api.PinStatus>; onDone: (s: api.PinStatus) => void; onClose: () => void }) {
  const { lang } = useApp();
  const zh = lang === "zh";
  const [v, setV] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    if (v.length !== 6) { setMsg(zh ? "请输入 6 位 PIN。" : "Enter your 6-digit PIN."); return; }
    setBusy(true); setMsg("");
    try { onDone(await action(v)); } catch (e) { setMsg(pinError(e, zh)); setV(""); }
    setBusy(false);
  };
  return (
    <Modal label={title} onClose={onClose}>
      <header className="m-h"><span className="m-eyebrow"><I.lock />{zh ? "设置 PIN" : "Settings PIN"}</span><h2>{title}</h2>
        <p>{zh ? "输入您的 6 位 PIN。解锁后 15 分钟内可修改受保护的设置。" : "Enter your 6-digit PIN. Protected settings stay unlocked for 15 minutes."}</p></header>
      <form className="m-body pin-form" onSubmit={e => { e.preventDefault(); void go(); }}>
        <PinInput id="pin-ask" value={v} onChange={setV} label="PIN" auto />
        {msg && <p className="pin-msg" role="alert">{msg}</p>}
        <div className="sg-form-act"><Btn onClick={onClose}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={busy || v.length !== 6}>{busy ? "…" : zh ? "确定" : "Continue"}</button></div>
      </form>
    </Modal>
  );
}

function PinGroup({ st, setSt, ask }: { st: api.PinStatus | null; setSt: (s: api.PinStatus) => void; ask: (title: string, action: (pin: string) => Promise<api.PinStatus>, then?: () => void) => void }) {
  const { lang, say } = useApp();
  const zh = lang === "zh";
  const [form, setForm] = useState<null | "new" | "change">(null);
  const [a, setA] = useState(""), [b2, setB2] = useState(""), [cur, setCur] = useState("");
  const [busy, setBusy] = useState(false);
  if (!st) return null;
  const unlocked = !!st.unlocked_until && st.unlocked_until > new Date().toISOString();
  const until = st.unlocked_until ? new Date(st.unlocked_until).toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const save = async () => {
    if (a.length !== 6) { say(zh ? "PIN 必须是 6 位数字。" : "The PIN must be 6 digits."); return; }
    if (a !== b2) { say(zh ? "两次输入的 PIN 不一致。" : "The PINs don't match."); return; }
    if (/^(\d)\1{5}$/.test(a) || "0123456789".includes(a) || "9876543210".includes(a)) { say(zh ? "这个 PIN 太容易猜到，换一个。" : "That PIN is too easy to guess. Pick another."); return; }
    setBusy(true);
    try { setSt(await api.pinSet(a, form === "change" ? cur : undefined)); setForm(null); setA(""); setB2(""); setCur(""); say(form === "change" ? (zh ? "PIN 已更换。" : "PIN changed.") : (zh ? "设置 PIN 已开启。" : "Settings PIN is on.")); }
    catch (e) { say(pinError(e, zh)); }
    setBusy(false);
  };
  const sub = !st.on ? (zh ? "未开启。开启后，修改密码、两步登录、团队、机构登录、集成、账单和数据导出都需要先输入 6 位 PIN。" : "Off. Turn it on and changing your password, two-step sign-in, team, agency logins, integrations, billing and data exports first asks for a 6-digit PIN.")
    : st.locked_until ? (zh ? "错误次数太多，已锁定 15 分钟。" : "Locked for 15 minutes after too many wrong tries.")
      : unlocked ? (zh ? `已解锁，${until} 自动重新锁定。` : `Unlocked. Locks again at ${until}.`)
        : (zh ? "已开启。受保护的设置已锁定。" : "On. Protected settings are locked.");
  return (
    <Group id="pin" title={B("Settings PIN", "设置 PIN")} note={B("Like an account PIN in a game: even someone signed in as you can't change protected settings without it. Placetta keeps only a scrambled copy, and 5 wrong tries lock it for 15 minutes.", "类似游戏里的账户 PIN：即使有人登录了您的账户，没有 PIN 也改不了受保护的设置。快哉只保存加密后的 PIN，连续输错 5 次会锁定 15 分钟。")}
      rows={[{ label: B("Settings PIN", "设置 PIN"), icon: <I.lock />, sub,
        right: !st.on ? (!form ? <Btn kind="ink" onClick={() => setForm("new")}>{zh ? "开启" : "Turn on"}</Btn> : undefined) : <>
          {unlocked ? <Btn onClick={() => void api.pinLock().then(setSt)}>{zh ? "立即锁定" : "Lock now"}</Btn> : <Btn kind="ink" onClick={() => ask(zh ? "解锁设置" : "Unlock settings", api.pinUnlock)}>{zh ? "解锁" : "Unlock"}</Btn>}
          {!form && <Btn onClick={() => setForm("change")}>{zh ? "更换 PIN" : "Change PIN"}</Btn>}
          <Btn onClick={() => ask(zh ? "关闭设置 PIN" : "Turn off the settings PIN", api.pinClear, () => say(zh ? "设置 PIN 已关闭。" : "Settings PIN is off."))}>{zh ? "关闭" : "Turn off"}</Btn>
        </> }]}>
      {form && (
        <form className="sg-form pinform" onSubmit={e => { e.preventDefault(); void save(); }}>
          {form === "change" && <PinInput id="pin-cur" value={cur} onChange={setCur} label={zh ? "当前 PIN" : "Current PIN"} auto />}
          <PinInput id="pin-new" value={a} onChange={setA} label={zh ? "新 PIN" : "New PIN"} auto={form === "new"} />
          <PinInput id="pin-again" value={b2} onChange={setB2} label={zh ? "再次输入 PIN" : "Type it again"} />
          <div className="sg-form-act"><Btn onClick={() => { setForm(null); setA(""); setB2(""); setCur(""); }}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={busy || a.length !== 6 || b2.length !== 6 || (form === "change" && cur.length !== 6)}>{busy ? "…" : zh ? "保存 PIN" : "Save PIN"}</button></div>
        </form>
      )}
    </Group>
  );
}

export function Settings() {
  const { t, b, lang, cloud, mode, apiName, deep, setDeep, voiceOn, setVoiceOn, applyKey, dropKey, exportAudit, openLegal, ws } = useApp();
  const [key, setKey] = useState("");
  const [id, setId] = useState(API_MODELS[0].id);
  const [remember, setRemember] = useState(false);
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useState(readAccent);
  const [hex, setHex] = useState(readAccent);
  useEffect(() => { if (accent) applyAccent(accent); }, [theme, accent]);
  const [pinSt, setPinSt] = useState<api.PinStatus | null>(null);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [prompt, setPrompt] = useState<{ title: string; action: (pin: string) => Promise<api.PinStatus>; then?: () => void } | null>(null);
  useEffect(() => { if (cloud) void api.pinStatus().then(setPinSt, () => setPinSt(null)); }, [cloud]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date().toISOString()), 15000); return () => window.clearInterval(id); }, []);
  const pinLocked = !!pinSt?.on && !(pinSt.unlocked_until && pinSt.unlocked_until > now);
  const ask = (title: string, action: (pin: string) => Promise<api.PinStatus>, then?: () => void) => setPrompt({ title, action, then });
  const pinCtx: PinCtx = { locked: pinLocked, guard: fn => (pinLocked ? ask(lang === "zh" ? "输入 PIN 以继续" : "Enter your PIN to continue", api.pinUnlock, fn) : fn()) };
  const bl = cloud?.billing;
  const planName = !cloud ? B("Growth plan (sample)", "成长版（示例）")
    : bl?.free && !bl.subscription_status ? B("Early access, everything included", "抢先体验，全部功能开放")
    : cloud.plan === "monthly" ? ({ starter: B("Starter plan", "入门版"), growth: B("Growth plan", "成长版"), scale: B("Scale plan", "规模版") } as Record<string, Bi>)[bl?.subscription_plan ?? ""] ?? B(bl?.comped ? "Monthly plan (pilot)" : "Monthly plan", bl?.comped ? "月度方案（试点）" : "月度方案")
    : cloud.plan === "entry" ? B(`Entry plan, ${bl?.entry_markets ?? 1} market${(bl?.entry_markets ?? 1) > 1 ? "s" : ""}`, `开店计划，${bl?.entry_markets ?? 1} 个市场`) : B("No plan yet", "尚未开通");
  const renew = bl?.current_period_end ? (lang === "zh" ? `${fmtDay(bl.current_period_end, lang, true)} 续费` : `Renews ${fmtDay(bl.current_period_end, lang, true)}`) : "";
  const SECTIONS: [string, Bi][] = [["account", B("Account", "账户")], ...(cloud ? [["team", B("Team", "团队")], ["security", B("Security", "安全")], ["pin", B("Settings PIN", "设置 PIN")]] as [string, Bi][] : []), ["billing", B("Plan and billing", "方案与账单")], ["integrations", B("Integrations", "集成")], ["logins", B("Agency logins", "机构登录")], ["approvals", B("Approvals", "批准")], ["agent", B("Agent and voice", "助理与语音")], ...(cloud ? [["memory", B("Memory", "记忆")]] as [string, Bi][] : []), ["skills", B("Skills", "技能")], ["appearance", B("Appearance", "外观")], ["language", B("Language", "语言")], ["data", B("Data controls", "数据管理")], ["help", B("Help", "帮助")], ["legal", B("Legal", "法律")]];

  return (
    <PinLock.Provider value={pinCtx}>
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
          {cloud && <PinGroup st={pinSt} setSt={st => { setPinSt(st); setNow(new Date().toISOString()); }} ask={ask} />}

          <Group id="billing" title={B("Plan and billing", "方案与账单")} note={B("Payment methods and invoices are handled by Stripe; Placetta never sees card numbers. Government fees are paid by you directly to each agency.", "付款方式和发票由 Stripe 处理，快哉看不到卡号。政府规费由您直接支付给各机构。")}
            rows={[
              { label: planName, sub: renew || (bl?.free && !bl.subscription_status ? b(B("Paid plans start later. Nothing is charged now.", "付费方案稍后推出，现在不收取任何费用。")) : cloud?.plan === "entry" ? b(B("Credited toward your first year on an annual plan", "可抵扣年度方案首年费用")) : undefined), icon: <I.card />,
                right: cloud && !cloud.owner ? <em className="lock">{lang === "zh" ? "由所有者管理" : "Managed by owners"}</em> : cloud ? <>{cloud.plan !== "monthly" && <Btn guard kind="ink" onClick={() => cloud.openPlans(cloud.plan === "none" ? "start" : "file")}>{lang === "zh" ? "选择方案" : "Choose a plan"}</Btn>}{bl?.stripe_customer_id && <Btn guard onClick={() => void cloud.portal()}>{lang === "zh" ? "管理账单" : "Manage billing"}</Btn>}</> : undefined },
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

          <MemoryGroup />
          <SkillsGroup />

          <Group id="appearance" title={B("Appearance", "外观")} note={B("Dark mode for the agent and your workspace. Saved in this browser.", "为助理和工作区开启深色模式，保存在此浏览器中。")} rows={([
            ["light", B("Light", "浅色"), <I.sun />], ["dark", B("Dark", "深色"), <I.moon />], ["system", B("Match this device", "跟随设备"), <I.monitor />],
          ] as [Theme, Bi, ReactNode][]).map(([k, l, ic]) => ({ label: l, icon: ic, pick: () => setTheme(k), right: <label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="theme" checked={theme === k} onChange={() => setTheme(k)} aria-label={b(l)} /><i /></label> }))}>
            <div className="sg-sub accent">
              <h3>{lang === "zh" ? "主题色" : "Accent color"}</h3>
              <p className="sg-note">{lang === "zh" ? "按钮、链接、高亮和助理光效的颜色。选一个，或输入您自己的颜色。" : "The color of buttons, links, highlights and the agent's glow. Pick one or enter your own."}</p>
              <div className="swatches" role="radiogroup" aria-label={lang === "zh" ? "主题色" : "Accent color"}>
                {ACCENTS.map((c, i) => <button key={c} type="button" role="radio" aria-checked={(accent || ACCENTS[0]).toLowerCase() === c.toLowerCase()} className="sw" style={{ background: c }} aria-label={i === 0 ? (lang === "zh" ? "快哉蓝（默认）" : "Placetta blue (default)") : c} onClick={() => setAccent(applyAccent(i === 0 ? "" : c))} />)}
                <label className="sw-own"><input type="color" value={accent || ACCENTS[0]} onChange={e => setAccent(applyAccent(e.target.value))} aria-label={lang === "zh" ? "自选颜色" : "Choose a color"} /></label>
                <input className="sw-hex" value={hex} onChange={e => { const v = e.target.value.trim(); setHex(v); if (/^#?[0-9a-f]{6}$/i.test(v)) setAccent(applyAccent(v.startsWith("#") ? v : "#" + v)); }} placeholder="#4D73A3" aria-label="Hex" maxLength={7} spellCheck={false} />
                {accent && <Btn onClick={() => { setAccent(applyAccent("")); setHex(""); }}>{lang === "zh" ? "恢复默认" : "Reset"}</Btn>}
              </div>
            </div>
          </Group>

          <LanguageGroup />

          <Group id="data" title={B("Data controls", "数据管理")} note={B("Your data is yours. Placetta doesn't sell it or use it to train AI models.", "您的数据属于您。快哉不会出售数据，也不会用它训练 AI 模型。")} rows={[
            { label: B("Download your workspace data", "下载工作区数据"), sub: b(B("Applications, facts, deadlines, filings and the audit trail, as JSON", "申请、资料、截止日期、申报和审计记录（JSON）")), icon: <I.download />, right: <Btn guard onClick={() => (cloud ? cloud.exportData() : exportAudit())}>{lang === "zh" ? "下载" : "Download"}</Btn> },
            { label: B("Export the audit trail", "导出审计记录"), sub: "CSV", icon: <I.audit />, right: <Btn guard onClick={exportAudit}>{lang === "zh" ? "导出" : "Export"}</Btn> },
            { label: B("Delete your data", "删除数据"), sub: b(B("Email us and we delete it, except records the law requires us to keep.", "发邮件给我们即可删除，法律要求保留的记录除外。")), icon: <I.x />, right: <Btn guard onClick={() => { window.location.href = "mailto:support@placetta.com?subject=Delete%20my%20data"; }}>{lang === "zh" ? "申请删除" : "Ask to delete"}</Btn> },
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
      {prompt && <PinPrompt title={prompt.title} action={prompt.action} onClose={() => setPrompt(null)} onDone={st => { setPinSt(st); setNow(new Date().toISOString()); const then = prompt.then; setPrompt(null); if (then) setTimeout(then, 0); }} />}
    </div>
    </PinLock.Provider>
  );
}
