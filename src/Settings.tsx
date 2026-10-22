import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { hrefOf, plainClick, readRoute, setRoute } from "./route";
import { useApp } from "./ctx";
import { B, type Bi } from "./model";
import { API_MODELS } from "./live";
import { fmtAgo, fmtDay } from "./time";
import { Footer, I, Modal, Select } from "./ui";
import { ACCENTS, applyAccent, readAccent, useTheme, type Theme } from "./hooks";
import { IMPORT_PROMPT, PREFS, PROFILE, fileLabel, importMemory } from "./memory";
import { RememberedList } from "./Remembered";
import type { MemoryFile, MemoryKind, Skill, SkillSource } from "./model";
import { allSkills, dropSkill, putSkill, toggleSkill } from "./skills";
import { LANGUAGES, readSpeak, saveSpeak, speakOf, uiLangOf } from "./langs";
import * as api from "./cloud/api";
import { DEFAULT_POLICY, SPEND_CATEGORIES, policyProblems, spentIn, suggestBudgets, type Budget, type Purchase, type SpendCategory, type SpendPolicy } from "./spend.ts";
import type { IntegrationKind } from "./cloud/api";
import type { HqLink } from "./hq";
import { TwoStepSetup } from "./cloud/TwoStep";
import { phoneConsent } from "./consent";
import { replayTour } from "./Walkthrough";
import { AuditTrail, ContextPage } from "./pages";
import { PartnerSharing } from "./Partner";
import { AutonomyGroup, BusinessRulesGroup, HouseRulesGroup } from "./OwnerRules";
import gmailLogo from "./assets/integrations/gmail.png";
import outlookLogo from "./assets/integrations/outlook.svg";
import gcalLogo from "./assets/integrations/calendar.png";
import gdriveLogo from "./assets/integrations/drive.png";
import dropboxLogo from "./assets/integrations/dropbox.svg";
import squareLogo from "./assets/integrations/square.svg";
import toastLogo from "./assets/integrations/toast.svg";
import qbLogo from "./assets/integrations/quickbooks.svg";
import slackLogo from "./assets/integrations/slack.png";
import larkLogo from "./assets/integrations/lark.svg";
import wecomLogo from "./assets/integrations/wecom.svg";
import dingtalkLogo from "./assets/integrations/dingtalk.svg";
import teamsLogo from "./assets/integrations/teams.svg";
import wechatLogo from "./assets/integrations/wechat.svg";
import { McpConnectors } from "./McpSettings";
import { AgentMemoryGroup } from "./AgentMemory";
import "./agent-memory.css";
/** The database side of agent memory, loaded only when Settings needs it in an account. */
const memoryDb = () => import("./cloud/memoryApi");
import { SetSheet } from "./SetUI";
import { ContractGroup, EntitiesGroup, FilingCapGroup, ModulesGroup } from "./Growth";
import { cleanCode } from "./hqPlan.ts";


/* Settings, the way Muse and Alven do it: a calm column of groups, one row per thing, the control on the right,
   one primary action per group. Only what a business needs to get and stay compliant. */

type Row = { label: Bi; sub?: ReactNode; right?: ReactNode; pick?: () => void };
export function Group({ id, title, note, rows, children, hidden }: { id: string; title: Bi; note?: Bi; rows?: Row[]; children?: ReactNode; hidden?: boolean }) {
  const { b } = useApp();
  if (hidden) return null;
  return (
    <section className="sg" id={"set-" + id}>
      <h2>{b(title)}</h2>
      {note && <p className="sg-note">{b(note)}</p>}
      {rows && rows.length > 0 && (
        <ul className="sg-list">
          {rows.map((r, i) => (
            <li key={i} className={"sg-row" + (r.pick ? " pick" : "")} onClick={r.pick}>
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
export const usePin = () => useContext(PinLock);

/** A settings button: quiet is a text button, line and ink are the app's pills, warm is a quiet one for what removes
 *  or ends something (Disconnect, Delete my account), never red. */
export const Btn = ({ children, onClick, kind = "quiet", disabled, guard }: { children: ReactNode; onClick: () => void; kind?: "quiet" | "ink" | "line" | "warm"; disabled?: boolean; guard?: boolean }) => {
  const pin = usePin();
  const locked = guard && pin.locked;
  return <button type="button" className={"sbtn " + (kind === "warm" ? "quiet warm" : kind) + (locked ? " pinned" : "")} onClick={() => (guard ? pin.guard(onClick) : onClick())} disabled={disabled}>{locked && <I.lock />}{children}</button>;
};

/** An app's logo on its own: no tile or disc behind it. */
const Tile = ({ logo, wide, chat }: { logo?: string; wide?: boolean; chat?: boolean }) => <span className={"sg-logo" + (wide ? " wide" : "") + (logo === squareLogo ? " mono" : "")} aria-hidden="true">{logo ? <img src={logo} alt="" /> : chat ? <I.message /> : <I.deadlines />}</span>;

type HookKind = api.HookKind;
const HOOK_HELP: Record<HookKind, { how: Bi; ph: string }> = {
  slack: { how: B("In Slack, add the Incoming Webhooks app to the channel and copy its webhook URL.", "在 Slack 中为频道添加 Incoming Webhooks 应用，复制其 Webhook URL。"), ph: "https://hooks.slack.com/services/..." },
  lark: { how: B("In the Lark group: Settings, Bots, Add bot, Custom bot. Copy its webhook address. If you turn on signature checks, paste the secret too.", "在飞书群中：设置 → 群机器人 → 添加机器人 → 自定义机器人，复制 webhook 地址。如开启签名校验，请一并填写密钥。"), ph: "https://open.feishu.cn/open-apis/bot/v2/hook/..." },
  wecom: { how: B("In the WeCom group chat: the top-right menu, Add group robot, New. Copy its webhook address.", "在企业微信群聊中：右上角菜单 → 添加群机器人 → 新创建，复制 webhook 地址。"), ph: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." },
  dingtalk: { how: B("In the DingTalk group: Group settings, Bots, Add robot, Custom. Copy its webhook address. If you choose signing as its security setting, paste the secret (SEC...) too.", "在钉钉群中：群设置 → 机器人 → 添加机器人 → 自定义，复制 Webhook 地址。如安全设置选择“加签”，请一并填写密钥（SEC 开头）。"), ph: "https://oapi.dingtalk.com/robot/send?access_token=..." },
  teams: { how: B("In the Teams channel: More options, Workflows, then the template that posts to a channel when a webhook request is received. Copy the URL it gives you.", "在 Teams 频道中：更多选项 → 工作流，选择“收到 webhook 请求时发布到频道”模板，复制生成的 URL。"), ph: "https://...logic.azure.com/workflows/..." },
};
/** Which provider's app keys a sign-in connection needs. */
const PROVIDER_OF: Partial<Record<IntegrationKind, keyof api.Availability>> = { gmail: "google", gcal: "google", gdrive: "google", outlook_mail: "microsoft", outlook_cal: "microsoft", dropbox: "dropbox", quickbooks: "quickbooks", square: "square", toast: "toast" };
const POS_WHY = B("Monthly sales for sales tax and permit fees, the team's schedules and hours for labor-law and food handler checks", "月度销售额用于销售税和许可费，团队排班和工时用于劳动法和食品从业人员证检查");

type Item = { kind: IntegrationKind | "feed"; name: string; zh?: string; why: Bi; logo?: string; wide?: boolean; hook?: boolean; bot?: boolean };
const CHAT_WHY = B("Deadlines, renewals and filing updates in your team's group", "截止日期、续期和申报进展推送到团队群");
const INTEGRATIONS: { group: Bi; items: Item[] }[] = [
  { group: B("Email", "邮件"), items: [
    { kind: "gmail", name: "Gmail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), logo: gmailLogo },
    { kind: "outlook_mail", name: "Outlook Mail", why: B("Find agency emails, send messages you approve", "查找机构来信，发送您批准的消息"), logo: outlookLogo },
  ] },
  { group: B("Calendar", "日历"), items: [
    { kind: "gcal", name: "Google Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), logo: gcalLogo },
    { kind: "outlook_cal", name: "Outlook Calendar", why: B("Deadlines, renewals and inspections on your calendar", "截止日期、续期和检查自动进日历"), logo: outlookLogo },
    { kind: "feed", name: "Calendar feed", zh: "日历订阅", why: B("Any calendar app, Google and Outlook included: subscribe with a private link", "任何日历应用（含 Google 和 Outlook）：用私密链接订阅"),  },
  ] },
  { group: B("Team chat", "团队群聊"), items: [
    { kind: "slack", name: "Slack", why: CHAT_WHY, logo: slackLogo, hook: true },
    { kind: "lark", name: "Lark (Feishu)", zh: "飞书", why: CHAT_WHY, hook: true, logo: larkLogo },
    { kind: "wecom", name: "WeCom", zh: "企业微信", why: CHAT_WHY, hook: true, logo: wecomLogo },
    { kind: "dingtalk", name: "DingTalk", zh: "钉钉", why: CHAT_WHY, hook: true, logo: dingtalkLogo },
    { kind: "teams", name: "Microsoft Teams", why: CHAT_WHY, hook: true, logo: teamsLogo },
  ] },
  { group: B("Give Odelia jobs from chat", "在聊天中给 Odelia 派活"), items: [
    { kind: "wechat_bot", name: "Odelia in WeChat", zh: "微信中的 Odelia", why: B("Teammates message your WeChat Official Account: she does the job as the teammate who asked and answers in the chat. Each teammate links their WeChat once with a code", "同事给您的微信公众号发消息：她以提问的同事身份完成工作，并在聊天中回复。每位同事用验证码关联一次自己的微信"), logo: wechatLogo, bot: true },
    { kind: "slack_bot", name: "Odelia in Slack", zh: "Slack 中的 Odelia", why: B("Mention @Odelia in a channel or message her: she does the job as the teammate who asked and answers in the thread. Only Placetta teammates (same email) can give her jobs", "在频道里 @Odelia 或私信她：她以提问的团队成员身份完成工作并在话题中回复。只有快哉团队成员（邮箱相同）可以给她派任务"), logo: slackLogo, bot: true },
    { kind: "lark_bot", name: "Odelia in Lark (Feishu)", zh: "飞书中的 Odelia", why: B("@Odelia in a group or message her: she does the job as the teammate who asked and replies there. Only Placetta teammates (same email) can give her jobs", "在群里 @Odelia 或私信她：她以提问的团队成员身份完成工作并直接回复。只有快哉团队成员（邮箱相同）可以给她派任务"), logo: larkLogo, bot: true },
  ] },
  { group: B("Documents", "文件"), items: [
    { kind: "gdrive", name: "Google Drive", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), logo: gdriveLogo },
    { kind: "dropbox", name: "Dropbox", why: B("Import leases, floor plans and certificates", "导入租约、平面图和证书"), logo: dropboxLogo },
  ] },
  { group: B("Sales, payroll and accounting", "销售、薪资与财务"), items: [
    { kind: "square", name: "Square", why: POS_WHY, logo: squareLogo },
    { kind: "toast", name: "Toast", why: POS_WHY, logo: toastLogo, wide: true },
    { kind: "quickbooks", name: "QuickBooks", why: B("Gross receipts for business tax and renewals", "营业总额用于营业税和续期"), logo: qbLogo },
  ] },
];

/** A copyable block: the label to copy, then the text. */
const CodeBlock = ({ text, copy, zh }: { text: string; copy: (t: string) => void; zh: boolean }) =>
  <pre className="sg-code"><button type="button" className="lnk" onClick={() => copy(text)}>{zh ? "复制" : "Copy"}</button>{text}</pre>;

/** Each teammate's own WeChat: a code to send to the workspace's WeChat Official Account, which links their WeChat to
 *  them so Odelia works as them there. Any member, for themselves; the settings PIN when it's on, like linking a phone. */
function WechatLink({ account }: { account: string | null }) {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const pin = usePin();
  const wsId = cloud?.wsId ?? "";
  const [st, setSt] = useState<api.WechatLink | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { if (!wsId) return; try { setSt(await api.wechatLinkStatus(wsId)); } catch { setSt(null); } }, [wsId]);
  useEffect(() => { void load(); }, [load]);
  // while a code waits to be sent, look every few seconds: it links the moment the account gets it
  useEffect(() => {
    if (!code || st?.linked) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [code, st?.linked, load]);
  useEffect(() => { if (code && st?.linked) { setCode(null); say(zh ? "微信已关联。现在可以在微信里给 Odelia 派活了。" : "Your WeChat is linked. Message Odelia there anytime."); } }, [code, st?.linked, say, zh]);
  const getCode = async () => {
    if (pin.locked) { pin.guard(() => void getCode()); return; }
    setBusy(true);
    try { const r = await api.wechatLinkCode(wsId); setCode({ code: r.code, expires_at: r.expires_at }); }
    catch (e) { const x = e as api.ApiError; say((zh && x.message_zh) || x.message); }
    setBusy(false);
  };
  const unlink = () => {
    if (!window.confirm(zh ? "取消关联您的微信？之后在微信里发的消息不会再交给 Odelia。" : "Unlink your WeChat? Messages from it stop reaching Odelia.")) return;
    pin.guard(() => void api.wechatUnlink(wsId).then(() => { setCode(null); return load(); }, e => say((e as api.ApiError).message)));
  };
  if (!st?.connected) return null;
  return (
    <li className="sg-hook sg-bot">
      {st.linked ? (
        <p>{zh ? `您的微信已关联${st.linked_at ? `（${fmtDay(st.linked_at, lang, true)} 起）` : ""}。给${account ? ` ${account} ` : "公众号"}发消息即可以您的身份给 Odelia 派活。` : `Your WeChat is linked${st.linked_at ? ` since ${fmtDay(st.linked_at, lang, true)}` : ""}. Message the account${account ? ` ${account}` : ""} to give Odelia jobs as you.`}{" "}
          <button type="button" className="linkish" onClick={unlink}>{zh ? "取消关联" : "Unlink"}</button></p>
      ) : code ? (
        <>
          <p>{zh ? "用您自己的微信，把这 6 位验证码发给公众号：" : "From your own WeChat, send this 6-digit code to the account:"}</p>
          <code className="text-code" aria-label={zh ? "要发送的验证码" : "Code to send"}>{code.code}</code>
          <p className="sg-note" aria-live="polite">{zh ? "收到后会自动关联，30 分钟内有效。" : "It links as soon as the account gets it. The code works for 30 minutes."}{" "}
            <button type="button" className="linkish" onClick={() => void getCode()}>{zh ? "换一个验证码" : "Get a new code"}</button></p>
        </>
      ) : (
        <p>{zh ? "每位同事关联一次自己的微信，Odelia 才能确认是谁在提问。" : "Each teammate links their own WeChat once, so Odelia knows who is asking."}{" "}
          <button type="button" className={"sbtn line" + (pin.locked ? " pinned" : "")} disabled={busy} onClick={() => void getCode()}>{pin.locked && <I.lock />}{busy ? "…" : zh ? "关联我的微信" : "Link my WeChat"}</button></p>
      )}
      {cloud?.owner && <>
        <p className="sg-fine">{zh ? "微信“消息与事件推送”的服务器地址：" : "The server address for WeChat's Message push:"}</p>
        <CodeBlock text={api.wechatServerUrl(wsId)} copy={(t) => { void navigator.clipboard?.writeText(t).then(() => say(zh ? "已复制" : "Copied"), () => undefined); }} zh={zh} />
      </>}
    </li>
  );
}

function Integrations() {
  const { b, lang, cloud, say } = useApp();
  const pin = usePin();
  const [feed, setFeed] = useState("");
  const [avail, setAvail] = useState<api.Availability | null>(null);
  const [form, setForm] = useState<{ kind: HookKind; url: string; secret: string; busy?: boolean } | null>(null);
  // done: WeChat is connected and the form stays to show what goes into WeChat's console (the Token and key aren't shown again)
  const [bot, setBot] = useState<{ kind: api.BotKind; setup: api.BotSetup | null; v: Record<string, string>; busy?: boolean; done?: boolean } | null>(null);
  const [toast, setToast] = useState<{ code: string | null; busy?: boolean } | null>(null);
  const openBot = async (kind: api.BotKind) => {
    if (bot?.kind === kind) { setBot(null); return; }
    setForm(null); setToast(null); setBot({ kind, setup: null, v: kind === "lark_bot" ? { domain: zh ? "feishu" : "lark" } : {} });
    const setup = cloud ? await cloud.botSetup(kind) : null;
    // WeChat: start from a fresh Token and EncodingAESKey (anything typed already stays)
    setBot(b => (b?.kind === kind ? { ...b, setup, v: kind === "wechat_bot" ? { token: setup?.token ?? "", aes_key: setup?.aes_key ?? "", ...b.v } : b.v } : b));
  };
  const submitBot = async () => {
    if (!bot || !cloud) return;
    setBot({ ...bot, busy: true });
    const ok = await cloud.connectBot(bot.kind, bot.v);
    setBot(ok ? (bot.kind === "wechat_bot" ? { ...bot, busy: false, done: true } : null) : { ...bot, busy: false });
  };
  // Toast: the code to type into Toast, then a check that finds the locations carrying it
  const openToast = async () => {
    if (toast) { setToast(null); return; }
    setForm(null); setBot(null); setToast({ code: null });
    try { const r = await api.toastCode(cloud!.wsId); setToast(t => (t ? { ...t, code: r.code } : t)); }
    catch (e) { const x = e as api.ApiError; say((zh && x.message_zh) || x.message); setToast(null); }
  };
  const checkToast = async () => {
    if (!toast || !cloud) return;
    setToast({ ...toast, busy: true });
    const ok = await cloud.connectToast();
    setToast(ok ? null : { ...toast, busy: false });
  };
  const copy = (t: string) => { void navigator.clipboard?.writeText(t).then(() => say(zh ? "已复制" : "Copied"), () => undefined); };
  useEffect(() => { if (cloud) void cloud.availability().then(setAvail); }, [cloud?.wsId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const conn = (k: string) => cloud?.integrations.find(i => i.kind === k);
  const nameOf = (k: string) => { const it = INTEGRATIONS.flatMap(g => g.items).find(x => x.kind === k); return it ? (lang === "zh" && it.zh ? it.zh : it.name) : k; };
  const zh = lang === "zh";
  const demo = () => say(zh ? "登录您的快哉账户后即可连接。" : "Sign in to your Placetta account to connect.");
  const openForm = (kind: HookKind) => setForm(f => (f?.kind === kind ? null : { kind, url: "", secret: "" }));
  const submit = async () => {
    if (!form || !cloud) return;
    setForm({ ...form, busy: true });
    const ok = await cloud.connectHook(form.kind, form.url.trim(), form.secret.trim());
    setForm(ok ? null : { ...form, busy: false });
  };
  return (
    <Group id="integrations" title={B("Integrations", "集成")} note={B("Only what gets you licensed and keeps you compliant. Placetta reads what a task needs and nothing else; disconnect any time.", "只连接拿证和保持合规所需的服务。快哉只读取任务所需的内容，可随时断开。")}>
      {INTEGRATIONS.map(g => (
        <div key={g.group.en} className="sg-sub">
          <h3>{b(g.group)}</h3>
          <ul className="sg-list">
            {g.items.map(it => {
              const c = it.kind === "feed" ? undefined : conn(it.kind);
              const provider = PROVIDER_OF[it.kind as IntegrationKind];
              // Slack signs in when its app keys are set; otherwise, like the other chats, it takes the channel's link
              const viaLink = it.hook && !(it.kind === "slack" && avail?.slack);
              const soon = !!cloud && !!avail && !!provider && !avail[provider];
              let right: ReactNode;
              if (it.kind === "feed") right = cloud ? <Btn guard onClick={async () => { try { const u = await cloud.feedUrl(); setFeed(u); await navigator.clipboard?.writeText(u).catch(() => undefined); say(zh ? "订阅链接已复制" : "Link copied"); } catch (e) { say((e as { message: string }).message); } }}>{zh ? "复制链接" : "Copy link"}</Btn> : <Btn onClick={demo}>{zh ? "复制链接" : "Copy link"}</Btn>;
              else if (cloud && !cloud.owner) right = c ? undefined : <em className="lock">{zh ? "由所有者连接" : "Owners connect"}</em>;
              else if (c) right = <Btn kind="warm" guard onClick={() => void cloud!.disconnect(it.kind as IntegrationKind)}>{zh ? "断开" : "Disconnect"}</Btn>;
              else if (soon) right = <em className="lock">{zh ? "即将开放" : "Opens soon"}</em>;
              else if (it.kind === "toast") right = <Btn guard kind="line" onClick={() => (cloud ? void openToast() : demo())}>{zh ? "连接" : "Connect"}</Btn>;
              else if (it.bot) right = <Btn guard kind="line" onClick={() => (cloud ? void openBot(it.kind as api.BotKind) : demo())}>{zh ? "设置" : "Set up"}</Btn>;
              else if (viaLink) right = <Btn guard kind="line" onClick={() => (cloud ? openForm(it.kind as HookKind) : demo())}>{zh ? "连接" : "Connect"}</Btn>;
              else right = <Btn guard kind="line" onClick={() => (cloud ? void cloud.connect(it.kind as IntegrationKind) : demo())}>{zh ? "连接" : "Connect"}</Btn>;
              // connected: the status on the right beside Disconnect, and the account it's connected as under the name
              const status = c ? (c.status === "error" ? <em className="bad">{zh ? "需要重新连接" : "Reconnect needed"}</em> : <em className="ok"><I.check />{zh ? "已连接" : "Connected"}</em>) : null;
              const why = soon && (it.kind === "gcal" || it.kind === "outlook_cal") ? B(`${it.why.en}. Until it opens, subscribe with the calendar feed below.`, `${it.why.zh}。开放前，可用下方的日历订阅。`) : it.why;
              return [
                <li key={it.kind} className="sg-row">
                  <Tile logo={it.logo} wide={it.wide} chat={it.hook || it.bot} />
                  <span className="sg-tx"><b>{zh && it.zh ? it.zh : it.name}</b><small>{b(why)}</small>{c?.account && <small className="sg-acct">{c.account}</small>}</span>
                  {(status || right) && <span className="sg-r">{status}{right}</span>}
                </li>,
                it.kind === "wechat_bot" && c && c.status === "connected" && cloud ? <WechatLink key="wechat-link" account={c.account} /> : null,
              ];
            })}
          </ul>
        </div>
      ))}
      {/* the longer setups open in a side sheet: Toast's code, a team chat's link, a bot's keys and WeChat's last step */}
      {toast && !conn("toast") && (
        <SetSheet title={zh ? "连接 Toast" : "Connect Toast"} sub={b(POS_WHY)} onClose={() => setToast(null)} className="sg-bot">
          <ol>
            <li>{zh ? "在 Toast Web 中：Integrations → Browse & purchase integrations，找到快哉（Placetta），添加到您的门店。" : "In Toast Web: Integrations, Browse & purchase integrations. Find Placetta and add it to your locations."}</li>
            <li>{zh ? "再到 Configure integrations，点快哉旁边的齿轮，为每家门店在 Location ID 中填写这个代码，然后 Apply：" : "Then Configure integrations, the gear next to Placetta, and type this code as the Location ID for each location, then Apply:"}</li>
          </ol>
          {toast.code ? <code className="text-code" aria-label={zh ? "您的 Toast 代码" : "Your Toast code"}>{toast.code}</code> : <p className="quiet">{zh ? "正在准备…" : "Getting it ready..."}</p>}
          <p className="sg-fine">{zh ? "只有能管理门店 Toast 集成的人才能填写这个代码，所以快哉只会读取您自己的门店。Toast 可能需要最多 15 分钟才会向快哉开放新门店。快哉只读取销售额、员工和排班，不会更改 Toast 中的任何内容。" : "Only someone who manages your Toast integrations can enter this code, so Placetta reads only your own locations. Toast can take up to 15 minutes to open a new location to Placetta. Placetta reads sales, staff and schedules, and changes nothing in Toast."}</p>
          <form className="sst-act" onSubmit={e => { e.preventDefault(); void checkToast(); }}>
            {toast.code && <button type="button" className="sbtn quiet" onClick={() => copy(toast.code!)}><I.copy />{zh ? "复制代码" : "Copy code"}</button>}
            <button type="submit" className="sbtn ink" disabled={toast.busy || !toast.code}>{toast.busy ? (zh ? "正在检查…" : "Checking...") : (zh ? "检查并连接" : "Check and connect")}</button>
          </form>
        </SetSheet>
      )}
      {form && !conn(form.kind) && (
        <SetSheet title={(zh ? "连接" : "Connect ") + nameOf(form.kind)} sub={b(CHAT_WHY)} onClose={() => setForm(null)}>
          <p>{b(HOOK_HELP[form.kind].how)}</p>
          <form className="sst-form" onSubmit={e => { e.preventDefault(); void submit(); }}>
            <input type="url" required autoFocus value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder={HOOK_HELP[form.kind].ph} aria-label={zh ? "Webhook 链接" : "Webhook link"} spellCheck={false} autoComplete="off" />
            {form.kind === "lark" && <input type="password" value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} placeholder={zh ? "签名密钥（可选）" : "Signing secret (optional)"} aria-label={zh ? "签名密钥" : "Signing secret"} autoComplete="off" />}
            <div className="sst-act">
              <button type="button" className="sbtn quiet" onClick={() => setForm(null)}>{zh ? "取消" : "Cancel"}</button>
              <button type="submit" className="sbtn ink" disabled={form.busy || !form.url.trim()}>{form.busy ? (zh ? "正在发送测试消息…" : "Sending a test message...") : (zh ? "连接并发送测试" : "Connect and test")}</button>
            </div>
          </form>
        </SetSheet>
      )}
      {bot?.kind === "wechat_bot" && bot.done && (
        <SetSheet title={zh ? "最后一步：在微信中提交" : "Last step: submit in WeChat"} onClose={() => setBot(null)} className="sg-bot">
          <p>{zh ? "已连接。最后一步，在微信开发者平台：我的业务 → 服务号 → 消息与事件推送，填写下面三项，加密方式选“安全模式”，数据格式选 XML，然后提交：" : "Connected. Last step, in the WeChat developer platform: My business, Service account, Message push (消息与事件推送). Fill in these three, choose safe mode (安全模式) and XML, and submit:"}</p>
          <p className="sst-label">{zh ? "服务器地址（URL）" : "Server address (URL)"}</p>
          <CodeBlock text={api.wechatServerUrl(cloud?.wsId ?? "")} copy={copy} zh={zh} />
          <p className="sst-label">Token</p>
          <CodeBlock text={bot.v.token ?? ""} copy={copy} zh={zh} />
          {bot.v.aes_key && <><p className="sst-label">EncodingAESKey</p><CodeBlock text={bot.v.aes_key} copy={copy} zh={zh} /></>}
          <form className="sst-act" onSubmit={e => { e.preventDefault(); setBot(null); }}><button type="submit" className="sbtn ink">{zh ? "已在微信中提交" : "Submitted in WeChat"}</button></form>
        </SetSheet>
      )}
      {bot && !bot.done && !conn(bot.kind) && (
        <SetSheet title={(zh ? "设置" : "Set up ") + nameOf(bot.kind)} onClose={() => setBot(null)} className="sg-bot">
          {bot.kind === "slack_bot" ? (
            <ol>
              <li>{zh ? "在 api.slack.com/apps 选择 Create New App → From a manifest，选好工作区，粘贴下面的清单：" : "At api.slack.com/apps choose Create New App, From a manifest, pick your workspace and paste this:"}</li>
              {bot.setup?.manifest ? <pre className="sg-code"><button type="button" className="lnk" onClick={() => copy(bot.setup!.manifest!)}>{zh ? "复制" : "Copy"}</button>{bot.setup.manifest}</pre> : <p className="quiet">{zh ? "正在准备…" : "Getting it ready..."}</p>}
              <li>{zh ? "点 Install to Workspace。然后复制 OAuth & Permissions 里的 Bot User OAuth Token（xoxb- 开头），以及 Basic Information 里的 Signing Secret：" : "Click Install to Workspace. Then copy the Bot User OAuth Token (starts with xoxb-) from OAuth & Permissions, and the Signing Secret from Basic Information:"}</li>
            </ol>
          ) : bot.kind === "wechat_bot" ? (
            <ol>
              <li>{zh ? "需要一个以公司主体完成微信认证的服务号。建议专门给团队用一个：开启服务器配置后，在微信后台设置的自动回复和菜单会失效。" : "You need a WeChat service account verified under your company (认证服务号). Use one just for your team: once its server address is on, the auto-replies and menu set in WeChat's console stop."}</li>
              <li>{zh ? "在微信开发者平台（developers.weixin.qq.com）：我的业务 → 服务号 → 开发密钥，复制 AppID 和 AppSecret。" : "In the WeChat developer platform (developers.weixin.qq.com): My business, Service account, Development keys. Copy the AppID and the AppSecret."}</li>
              <li>{bot.setup?.ips?.length
                ? (zh ? `在同一页的 API IP 白名单中添加：${bot.setup.ips.join("、")}` : `Under API IP whitelist on the same page, add: ${bot.setup.ips.join(", ")}`)
                : (zh ? "API IP 白名单保持关闭。如果微信给账号管理员发消息，询问是否允许快哉的服务器，请选择允许。" : "Keep the API IP whitelist off. If WeChat messages the account's admin asking to allow Placetta's server, allow it.")}</li>
              <li>{zh ? "把 AppID 和 AppSecret 填在下面，连同这个 Token 和 EncodingAESKey（也可换成账号已在用的），点“连接”：" : "Paste the AppID and AppSecret below, with this Token and EncodingAESKey (or the ones the account already uses), and connect:"}</li>
            </ol>
          ) : (
            <ol>
              <li>{zh ? "在飞书开放平台（open.feishu.cn）创建企业自建应用，添加“机器人”能力。" : "In the Lark developer console (open.larksuite.com, or open.feishu.cn in China), create a custom app and add the Bot feature."}</li>
              <li>{zh ? "权限：开通 im:message（读取与发送消息）、im:message.group_at_msg，以及 contact:user.email:readonly（读取成员邮箱，Odelia 据此确认提问的是哪位快哉团队成员），并把通讯录权限范围设为全部成员。事件订阅：添加 im.message.receive_v1，请求地址填：" : "Permissions: add im:message (read and send messages), im:message.group_at_msg, and contact:user.email:readonly (members' emails, so Odelia knows which Placetta teammate is asking), and set the contact range to all members. Events: add im.message.receive_v1 and set the request URL to:"}</li>
              {bot.setup?.events_url ? <pre className="sg-code"><button type="button" className="lnk" onClick={() => copy(bot.setup!.events_url)}>{zh ? "复制" : "Copy"}</button>{bot.setup.events_url}</pre> : <p className="quiet">{zh ? "正在准备…" : "Getting it ready..."}</p>}
              <li>{zh ? "发布应用版本。然后填入凭证页的 App ID、App Secret，以及事件页的 Verification Token（如开启加密，再填 Encrypt Key）：" : "Publish a version of the app. Then paste the App ID and App Secret (Credentials) and the Verification Token, plus the Encrypt Key if it's on (Events and callbacks):"}</li>
            </ol>
          )}
          <form className="sst-form" onSubmit={e => { e.preventDefault(); void submitBot(); }}>
            {(bot.kind === "slack_bot"
              ? [["bot_token", "Bot User OAuth Token (xoxb-...)", true, "password"], ["signing_secret", "Signing Secret", true, "password"]]
              : bot.kind === "wechat_bot"
              // the Token and EncodingAESKey stay visible: they're typed into WeChat's console too
              ? [["app_id", "AppID (wx...)", true, "text"], ["app_secret", "AppSecret", true, "password"], ["token", "Token", true, "text"], ["aes_key", zh ? "EncodingAESKey（安全模式）" : "EncodingAESKey (safe mode)", false, "text"]]
              : [["app_id", "App ID (cli_...)", true, "text"], ["app_secret", "App Secret", true, "password"], ["verification_token", "Verification Token", true, "password"], ["encrypt_key", zh ? "Encrypt Key（可选）" : "Encrypt Key (optional)", false, "password"]]
            ).map(([k, ph, req, type]) => <input key={k as string} type={type as string} required={!!req} value={bot.v[k as string] ?? ""} onChange={e => setBot({ ...bot, v: { ...bot.v, [k as string]: e.target.value.trim() } })} placeholder={ph as string} aria-label={ph as string} autoComplete="off" spellCheck={false} />)}
            {bot.kind === "lark_bot" && <Select value={bot.v.domain ?? "feishu"} onChange={e => setBot({ ...bot, v: { ...bot.v, domain: e.target.value } })} aria-label={zh ? "版本" : "Edition"}><option value="feishu">{zh ? "飞书（中国）" : "Feishu (China)"}</option><option value="lark">{zh ? "Lark（国际版）" : "Lark (international)"}</option></Select>}
            {bot.kind === "wechat_bot" ? <>
              <p className="sg-fine">{zh ? "连接后，再把服务器地址、Token 和 EncodingAESKey 填进微信的“消息与事件推送”（下一步会显示）。微信提交时会立即检查这个地址，所以要先在这里连接。" : "After connecting, the server address, Token and EncodingAESKey go into WeChat's Message push (the next step shows them). WeChat checks the address the moment it's submitted, so connect here first."}</p>
              <p className="sg-fine">{zh ? "只有关联了微信的快哉团队成员可以给她派任务，她以对方的身份工作。任何申报、付款或发送仍需在快哉中批准。" : "Only Placetta teammates who linked their WeChat can give her jobs, and she works as them. Anything to file, pay or send still waits for approval in Placetta."}</p>
            </> : <p className="sg-fine">{zh ? "她以连接者的身份工作，频道里的任何人都可以给她派活。任何申报、付款或发送仍需在快哉中批准。" : "She works as the person who connects her, and anyone in the channel can give her a job. Anything to file, pay or send still waits for approval in Placetta."}</p>}
            <div className="sst-act">
              <button type="button" className="sbtn quiet" onClick={() => setBot(null)}>{zh ? "取消" : "Cancel"}</button>
              <button type="submit" className="sbtn ink" disabled={bot.busy}>{bot.busy ? (zh ? "正在检查…" : "Checking...") : (zh ? "连接" : "Connect")}</button>
            </div>
          </form>
        </SetSheet>
      )}
      {feed && <p className="sg-note mono">{feed}</p>}
      {/* any app's own MCP server, and the one-click list (src/McpSettings.tsx) */}
      <McpConnectors pin={pin} />
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
        rows={ws.connections.filter(c => c.level !== "vault").map(c => ({ label: c.name, sub: b(c.detail), right: c.state === "connected" ? <em className="ok"><I.check />{lang === "zh" ? "已保存" : "Saved"}</em> : <Btn kind="line" onClick={() => undefined}>{lang === "zh" ? "添加" : "Add"}</Btn> }))} />
    );
  }
  return (
    <Group id="logins" title={B("Agency logins", "机构登录")} note={B("Saved logins for agency portals, encrypted in a vault. Placetta opens one only to file for you, and each opening shows in your audit trail. Never save Social Security or bank numbers here.", "加密保存在保险库中的机构门户登录信息。快哉只在为您提交时打开，每次打开都会记入审计记录。请勿在此保存社会安全号或银行账号。")}
      rows={cloud.logins.map(l => ({ label: { en: l.agency, zh: l.agency },
        sub: <>{l.username}{l.last_opened_at ? (lang === "zh" ? `，团队上次打开 ${fmtAgo(l.last_opened_at, lang)}` : `. Team last opened it ${fmtAgo(l.last_opened_at, lang)}`) : ""}</>,
        right: cloud.owner ? <Btn kind="warm" guard onClick={() => void cloud.removeLogin(l.id)}>{lang === "zh" ? "删除" : "Remove"}</Btn> : undefined }))}>
      {!cloud.owner ? <p className="sg-note">{lang === "zh" ? "只有所有者可以添加或删除登录信息。" : "Only owners can add or remove saved logins."}</p>
        : <div className="sg-act"><Btn guard kind="line" onClick={() => setAdding(true)}><I.plus />{lang === "zh" ? "添加登录" : "Add a login"}</Btn></div>}
      {cloud.owner && adding && (
        <SetSheet title={lang === "zh" ? "添加机构登录" : "Add an agency login"} sub={lang === "zh" ? "加密保存在保险库中。快哉只在为您提交时打开。" : "Kept encrypted in a vault. Placetta opens it only to file for you."} onClose={() => setAdding(false)}>
          <form className="sst-form" onSubmit={e => { e.preventDefault(); if (!f.agency.trim() || !f.username.trim() || !f.password) return; void cloud.saveLogin({ agency: f.agency.trim(), url: f.url.trim() || undefined, username: f.username.trim(), password: f.password, note: f.note.trim() || undefined }).then(() => { setAdding(false); setF({ agency: "", url: "", username: "", password: "", note: "" }); }); }}>
            <input placeholder={lang === "zh" ? "机构，例如 CDTFA" : "Agency, e.g. CDTFA"} value={f.agency} onChange={e => setF({ ...f, agency: e.target.value })} aria-label="Agency" autoFocus />
            <input placeholder="https://…" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} aria-label="Website" />
            <input placeholder={lang === "zh" ? "用户名" : "Username"} autoComplete="off" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} aria-label="Username" />
            <input type="password" placeholder={lang === "zh" ? "密码" : "Password"} autoComplete="new-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} aria-label="Password" />
            <div className="sst-act"><Btn onClick={() => setAdding(false)}>{lang === "zh" ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink">{lang === "zh" ? "加密保存" : "Save encrypted"}</button></div>
          </form>
        </SetSheet>
      )}
    </Group>
  );
}

const ROLE_NAME: Record<api.Role, Bi> = { owner: B("Owner", "所有者"), admin: B("Admin", "管理员"), member: B("Member", "成员"), viewer: B("Viewer", "只读成员") };

/** The people on this workspace. Owners and admins invite, change roles and remove (only an owner makes or changes an
 *  owner); everyone can see the team and leave. The database enforces each of these. */
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
  const owner = cloud.owner, manage = cloud.admin;
  const owners = team?.members.filter(m => m.role === "owner").length ?? 0;
  const roleName = (r: api.Role) => (ROLE_NAME[r] ?? ROLE_NAME.member)[zh ? "zh" : "en"];
  // the roles this person may give: an owner any, an admin all but owner
  const giveable = api.ROLES.filter(r => owner || r !== "owner");
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
      label: { en: m.email + (m.you ? " (you)" : ""), zh: m.email + (m.you ? "（您）" : "") },
      sub: <>{roleName(m.role)}{m.two_step ? (zh ? "，已开启两步登录" : ", two-step on") : ""}{m.scim ? (zh ? "，由身份提供商管理" : ", managed by your identity provider") : ""}</>,
      right: m.you
        ? (m.role !== "owner" || owners > 1 ? <Btn onClick={() => { if (window.confirm(zh ? "确定离开这个工作区？" : "Leave this workspace?")) void act(async () => { await api.removeMember(wsId, m.user_id); cloud.switchTo(""); }); }}>{zh ? "离开" : "Leave"}</Btn> : undefined)
        : manage && (owner || m.role !== "owner") ? <>
            <Select sz="sm" value={m.role} aria-label={zh ? "角色" : "Role"} onChange={e => { const v = e.target.value as api.Role; pin.guard(() => void act(() => api.setRole(wsId, m.user_id, v), zh ? "角色已更新" : "Role updated")); }}>
              {giveable.map(r => <option key={r} value={r}>{roleName(r)}</option>)}
            </Select>
            <Btn kind="warm" guard onClick={() => { if (window.confirm(zh ? `将 ${m.email} 移出工作区？` : `Remove ${m.email}?`)) void act(() => api.removeMember(wsId, m.user_id), zh ? "已移出" : "Removed"); }}>{zh ? "移出" : "Remove"}</Btn>
          </> : undefined,
    })),
    ...(team?.invites ?? []).map(i => ({
      label: { en: i.email, zh: i.email },
      sub: <>{roleName(i.role)}{zh ? "，已邀请，等待登录" : ", invited, waiting for them to sign in"}</>,
      right: manage && (owner || i.role !== "owner") ? <>
        <Btn guard onClick={() => void act(async () => { const r = await api.resendInvite(wsId, i.id); say(sentNote(r.sent, i.email)); })}>{zh ? "重发" : "Resend"}</Btn>
        <Btn guard onClick={() => void act(() => api.revokeInvite(i.id), zh ? "邀请已取消" : "Invite canceled")}>{zh ? "取消" : "Cancel"}</Btn>
      </> : undefined,
    })),
  ];
  return (
    <Group id="team" title={B("Team", "团队")} note={manage
      ? B("Owners approve filings, payments and messages, and manage billing. Admins invite people, change roles and set up single sign-on and SCIM. Members do the day-to-day work with Odelia. Viewers can read everything and change nothing. Every role change goes in the audit trail.", "所有者批准申报、付款和消息，并管理账单。管理员邀请成员、更改角色，并设置单点登录和 SCIM。成员与 Odelia 一起处理日常工作。只读成员可以查看全部内容，但不能修改。每次角色变更都会记入审计记录。")
      : B("Owners approve filings and payments; owners and admins manage the team. Ask one of them to change your role.", "所有者负责批准申报和付款；所有者和管理员管理团队。如需更改角色，请联系他们。")}
      rows={rows}>
      {manage && (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void invite(); }}>
          <input type="email" autoComplete="off" placeholder={zh ? "同事的邮箱" : "Teammate's email"} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} aria-label={zh ? "邮箱" : "Email"} />
          <Select value={f.role} onChange={e => setF({ ...f, role: e.target.value as api.Role })} aria-label={zh ? "角色" : "Role"}>
            {["member", "viewer", "admin", "owner"].filter(r => giveable.includes(r as api.Role)).map(r => <option key={r} value={r}>{roleName(r as api.Role)}</option>)}
          </Select>
          <button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : zh ? "邀请" : "Invite"}</button>
        </form>
      )}
    </Group>
  );
}

/** Headquarters: share this workspace's store status, read only, with the brand's headquarters. */
function HqShare() {
  const { lang, cloud, say, ws } = useApp();
  const zh = lang === "zh";
  const pin = usePin();
  const [links, setLinks] = useState<HqLink[] | null>(null);
  const [f, setF] = useState({ email: "", brand: "" });
  const [busy, setBusy] = useState(false);
  // an invite from a brand's headquarters (src/hqPlan.ts): from the link it sent (?hq=…), or pasted
  const [code, setCode] = useState(() => { try { return new URLSearchParams(location.search).get("hq") ?? sessionStorage.getItem("placetta-hq-invite") ?? ""; } catch { return ""; } });
  const wsId = cloud?.wsId ?? "";
  const load = useCallback(async () => { if (!wsId) return; try { setLinks(await api.hqLinks(wsId)); } catch { setLinks([]); } }, [wsId]);
  useEffect(() => { void load(); }, [load]);
  if (!cloud) return null;
  const share = async () => {
    if (pin.locked) { pin.guard(() => void share()); return; }
    const email = f.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) { say(zh ? "请输入有效的邮箱。" : "Enter a valid email."); return; }
    setBusy(true);
    try {
      await api.hqShare(wsId, email, f.brand);
      say(zh ? `已与 ${email} 共享。对方用这个邮箱登录快哉即可查看。` : `Shared with ${email}. They see your stores when they sign in to Placetta with that address.`);
      setF({ email: "", brand: "" }); await load();
    } catch (e) { say((e as api.ApiError).message); }
    setBusy(false);
  };
  const remove = (l: HqLink) => {
    if (!window.confirm(zh ? `停止与 ${l.hq_email} 共享门店状态？` : `Stop sharing store status with ${l.hq_email}?`)) return;
    pin.guard(() => void api.hqUnshare(l.id).then(() => { say(zh ? "已停止共享" : "Stopped sharing"); return load(); }, e => say((e as api.ApiError).message)));
  };
  const join = async () => {
    if (pin.locked) { pin.guard(() => void join()); return; }
    const c = cleanCode(code);
    if (!c) { say(zh ? "请粘贴总部发来的邀请链接或邀请码。" : "Paste the invite link or code headquarters sent you."); return; }
    setBusy(true);
    try {
      const r = await api.hqInviteRedeem(wsId, c);
      say(r.bill_to === "hq" ? (zh ? `已加入${r.brand ?? "品牌"}。您的门店由总部付费，总部可以看到门店状态。` : `Joined ${r.brand ?? "the brand"}. Headquarters pays for your stores and sees their status.`)
        : (zh ? `已加入${r.brand ?? "品牌"}。总部可以看到门店状态；您按门店为自己的门店付费。` : `Joined ${r.brand ?? "the brand"}. Headquarters sees your stores' status; you pay for your own stores, per location.`));
      setCode(""); try { sessionStorage.removeItem("placetta-hq-invite"); } catch { /* storage off */ } await load();
    } catch (e) { const er = e as api.ApiError; say((zh && er.message_zh) || er.message); }
    setBusy(false);
  };
  const n = (ws.stores ?? []).length;
  return (
    <Group id="hq" title={B("Headquarters", "总部")}
      note={B(`Headquarters sees each of your ${n} store${n === 1 ? "" : "s"}: stage, licenses current, due soon or overdue, and applications pending. Never your documents, logins, chats or staff. They also get a one-page summary every Monday.`,
        `总部可以看到您 ${n} 家门店各自的阶段、有效执照、即将到期或逾期事项，以及办理中的申请，但看不到您的文件、登录信息、对话或员工信息。总部每周一还会收到一页摘要。`)}
      rows={(links ?? []).map(l => ({
        label: { en: l.hq_email, zh: l.hq_email },
        sub: <>{l.brand ? (zh ? `品牌：${l.brand}，` : `${l.brand}, `) : ""}{zh ? `${fmtDay(l.created_at, lang, true)} 起共享` : `shared since ${fmtDay(l.created_at, lang, true)}`}</>,
        right: cloud.owner ? <Btn kind="warm" guard onClick={() => remove(l)}>{zh ? "移除" : "Remove"}</Btn> : undefined,
      }))}>
      {links && links.length === 0 && !cloud.owner && <p className="sg-note">{zh ? "尚未与总部共享。" : "Not shared with headquarters yet."}</p>}
      {cloud.owner ? (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void share(); }}>
          <input type="email" autoComplete="off" placeholder={zh ? "总部邮箱" : "Headquarters email"} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} aria-label={zh ? "总部邮箱" : "Headquarters email"} />
          <input autoComplete="off" placeholder={zh ? "品牌（选填）" : "Brand (optional)"} value={f.brand} maxLength={120} onChange={e => setF({ ...f, brand: e.target.value })} aria-label={zh ? "品牌" : "Brand"} />
          <button type="submit" className="sbtn ink" disabled={busy}>{busy ? "…" : zh ? "共享" : "Share"}</button>
        </form>
      ) : <p className="sg-note">{zh ? "只有所有者可以与总部共享或停止共享。" : "Only owners can share with headquarters or stop sharing."}</p>}
      {cloud.owner && (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void join(); }}>
          <input autoComplete="off" placeholder={zh ? "总部的邀请链接或邀请码" : "Invite link or code from headquarters"} value={code} onChange={e => setCode(e.target.value)} aria-label={zh ? "邀请码" : "Invite code"} />
          <button type="submit" className="sbtn ink" disabled={busy || !code.trim()}>{busy ? "…" : zh ? "加入品牌" : "Join the brand"}</button>
        </form>
      )}
    </Group>
  );
}

/* ------------------------------ text and call Odelia ------------------------------ */

/** A phone number as E.164, the way the server checks it: 10 digits (or 11 with a leading 1) are US, else +country code. */
function toE164(s: string): string | null {
  const t = s.trim();
  if (!t || t.length > 32 || /[^\d\s().+-]/.test(t) || t.indexOf("+") > 0) return null;
  let d = t.replace(/\D/g, "");
  if (t.startsWith("00")) d = d.slice(2);
  else if (!t.startsWith("+")) { if (d.length === 10) d = "1" + d; else if (!(d.length === 11 && d.startsWith("1"))) return null; }
  if (!/^[1-9]\d{7,14}$/.test(d) || (d.startsWith("1") && !/^1[2-9]\d{2}[2-9]\d{6}$/.test(d))) return null;
  return "+" + d;
}
const prettyPhone = (e: string) => { const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e); return m ? `+1 (${m[1]}) ${m[2]}-${m[3]}` : e; };
const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles"; } catch { return "America/Los_Angeles"; } };
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const hourLabel = (v: string, zh: boolean) => { const [h, m] = v.split(":").map(Number); const d = new Date(2026, 0, 1, h || 0, m || 0); return d.toLocaleTimeString(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit" }); };

/** A contact card for Odelia's number, so texts from her show up with her name. */
function saveContact(number: string, zh: boolean, callNumber?: string | null) {
  const tels = callNumber && callNumber !== number ? [`TEL;TYPE=CELL,TEXT:${number}`, `TEL;TYPE=VOICE:${callNumber}`] : [`TEL;TYPE=CELL,VOICE,TEXT:${number}`];
  const vcf = ["BEGIN:VCARD", "VERSION:3.0", "N:;Odelia;;;", zh ? "FN:Odelia（快哉）" : "FN:Odelia (Placetta)", zh ? "ORG:快哉" : "ORG:Placetta", zh ? "TITLE:AI 合规助理" : "TITLE:AI compliance agent",
    ...tels, zh ? "NOTE:发短信或打电话问 Odelia 关于执照、许可和截止日期的问题。" : "NOTE:Text or call Odelia about your licenses, permits and deadlines.", "URL:https://placetta.com", "END:VCARD"].join("\r\n");
  const url = URL.createObjectURL(new Blob([vcf + "\r\n"], { type: "text/vcard;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "Odelia.vcf"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Text and call Odelia: link a phone, then text or call her like a coworker. She texts (or calls) first when something needs you. */
function PhoneGroup() {
  const { lang, cloud, say, openLegal } = useApp();
  const zh = lang === "zh";
  const pin = usePin();
  const [line, setLine] = useState<api.OdeliaLine | null>(null);
  const [st, setSt] = useState<api.PhoneStatus | null>(null);
  const [num, setNum] = useState("");
  const [code, setCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [all, setAll] = useState(false);
  // Linking by texting Odelia: the code to text her, shown only in this session.
  const [textIn, setTextIn] = useState<{ code: string; expires: string } | null>(null);
  const load = useCallback(async () => { try { setSt(await api.phoneStatus()); } catch { setSt({ link: null, log: [] }); } }, []);
  useEffect(() => { if (!cloud) return; void api.odeliaLine().then(setLine); void load(); }, [cloud, load]);
  const link = st?.link ?? null;
  // While a code waits to be texted in, look every few seconds; it links the moment her line gets it.
  useEffect(() => {
    if (!textIn || link?.verified) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [textIn, link?.verified, load]);
  useEffect(() => { if (textIn && link?.verified) { setTextIn(null); say(zh ? "号码已关联。现在可以给 Odelia 发短信了。" : "Your phone is linked. Text Odelia anytime."); } }, [textIn, link?.verified, say, zh]);
  // Odelia answers texts and calls in the language you use here.
  useEffect(() => { if (link?.verified && link.lang !== lang) void api.phonePrefs({ lang }).then(setSt).catch(() => undefined); }, [link?.verified, link?.lang, lang]);
  if (!cloud || !line) return null;

  const errText = (code: string) => ({
    pin_required: zh ? "请先用设置 PIN 解锁。" : "Unlock settings with your PIN first.",
    phone_format: zh ? "请输入手机号，例如 (415) 555-0134；美国以外的号码请加国家代码，例如 +86。" : "Enter a mobile number, like (415) 555-0134, or with its country code, like +86.",
    phone_taken: zh ? "这个号码无法关联。请换一个号码，或发邮件至 support@placetta.com。" : "That number can't be linked. Use another one, or email support@placetta.com.",
    phone_rate_limited: zh ? "验证码发送次数太多，请稍后再试。" : "Too many codes for this number. Try again later.",
    phone_country: zh ? "目前只能关联美国、加拿大或中国大陆的手机号。" : "Odelia can text phones in the US, Canada and mainland China only.",
    phone_busy: zh ? "现在请求验证码的人太多了。请一小时后再试。" : "Too many people are asking for codes right now. Try again in an hour.",
    code_wrong: zh ? "验证码不对，请再试一次。" : "That code isn't right. Try again.",
    code_locked: zh ? "错误次数太多。请重新发送验证码。" : "Too many wrong tries. Send a new code.",
    code_expired: zh ? "验证码已过期。请重新发送。" : "That code expired. Send a new one.",
    not_configured: zh ? "短信功能还没有设置好。" : "Texting isn't set up yet.",
    opted_out: zh ? `这个号码曾回复 STOP 退订 Odelia 的短信。请先发送 START 到 ${link?.line ? prettyPhone(link.line) : line.display ?? ""}，再重新发送验证码。` : `This number texted STOP to Odelia. Text START to ${link?.line ? prettyPhone(link.line) : line.display ?? ""}, then send the code again.`,
    send_failed: zh ? "验证码没有发出。请检查号码后重试。" : "The code didn't go through. Check the number and try again.",
    text_first: zh ? "Odelia 需要您先给她发消息。请把下面的验证码发送给她。" : "Odelia needs you to text her first. Text her the code below.",
    line_busy: zh ? "今天新关联的号码太多了。请明天再发送验证码。" : "Odelia has linked as many new phones as she safely can today. Send the code again tomorrow.",
  } as Record<string, string>)[code];
  const act = async (fn: () => Promise<api.PhoneStatus>, done?: string) => {
    setBusy(true); setMsg("");
    try {
      const s = await fn(); setSt(s);
      if (s.error) setMsg(errText(s.error) ?? s.error); else if (done) say(done);
      return s;
    } catch (e) { const x = e as api.ApiError; setMsg(errText(x.code) ?? x.message); return null; }
    finally { setBusy(false); }
  };
  // On iMessage, linking starts with them texting Odelia (iMessage lines answer people who wrote first, and that keeps
  // her lines healthy); a code texted out is the other way, when plain texts are set up.
  const start = async (way: "in" | "out" = line?.imessage || !line?.sms ? "in" : "out") => {
    if (pin.locked) { pin.guard(() => void start(way)); return; }
    const e164 = toE164(num || link?.number || "");
    if (!e164) { setMsg(errText("phone_format")); return; }
    if (way === "in") {
      const s = await act(() => api.phoneTextIn(e164, deviceTz(), lang));
      if (s?.text_code) { setTextIn({ code: s.text_code, expires: s.text_code_expires_at ?? "" }); setAdding(false); setCode(""); setNum(""); }
      return;
    }
    setTextIn(null);
    const s = await act(() => api.phoneStart(e164, deviceTz(), lang));
    if (s) { setAdding(false); setCode(""); setNum(""); setTimeout(() => void load(), 3000); }   // look again to show whether it went out
  };
  const confirm = async () => {
    const c = code.replace(/\D/g, "");
    if (c.length !== 6) { setMsg(zh ? "请输入 6 位验证码。" : "Enter the 6-digit code."); return; }
    const s = await act(() => api.phoneConfirm(c), zh ? "号码已关联。现在可以给 Odelia 发短信了。" : "Your phone is linked. Text Odelia anytime.");
    if (s && !s.error) setCode("");
  };
  const remove = () => {
    if (!window.confirm(zh ? "取消关联这个号码？Odelia 将不再回复它的短信和来电。" : "Unlink this number? Odelia stops answering its texts and calls.")) return;
    void act(() => api.phoneRemove(), zh ? "已取消关联" : "Phone unlinked");
  };
  const prefs = (p: Parameters<typeof api.phonePrefs>[0]) => void act(() => api.phonePrefs(p));

  if (!line.configured) {
    return (
      <Group id="phone" title={B("Text and call Odelia", "发短信或致电 Odelia")}
        note={B("Text or call Odelia like a coworker, and she texts you first when something needs you. Texting isn't set up yet. Check back soon, or email support@placetta.com.", "像和同事一样给 Odelia 发短信或打电话，有事需要您时她也会先发短信给您。短信功能还没有设置好。请稍后再来看看，或发邮件至 support@placetta.com。")} />
    );
  }
  // Each person keeps their own iMessage line once one is assigned; everyone else sees the first.
  const number = link?.line ?? line.number ?? "";
  const display = number ? prettyPhone(number) : line.display ?? "";
  // When the iMessage lines forward calls to Odelia's phone line, every line takes calls, so it's one number.
  const forwards = !!line.imessage && !!line.call_number && line.call_number === line.number;
  const callNumber = line.voice ? (forwards ? number : line.call_number ?? number) : null;
  const callApart = !!callNumber && callNumber !== number;
  const verified = !!link?.verified;
  const textStep = !!textIn && !!link && !verified && !adding;
  const codeStep = !textStep && !!link && !verified && !adding && (link.code_pending || busy);
  const showForm = !textStep && !verified && (adding || !link || (!link.code_pending && !busy));
  const lastErr = link && !verified && link.last_error ? errText(link.last_error) : "";
  const textBody = textIn ? `LINK ${textIn.code}` : "";
  const log = st?.log ?? [];
  const who = (r: api.PhoneLogRow) => r.channel === "voice" ? (zh ? "通话" : "Call")
    : r.channel === "email" ? (r.direction === "in" ? (zh ? "您发的邮件" : "You emailed") : (zh ? "Odelia 回复的邮件" : "Odelia emailed"))
    : (r.direction === "in" ? (zh ? "您发的短信" : "You texted") : (zh ? "Odelia 发的短信" : "Odelia texted")) + (r.service === "iMessage" ? (zh ? "（iMessage）" : " (iMessage)") : "");

  const wa = line.whatsapp ? line.whatsapp.replace(/^\+/, "") : "";
  const rows: Row[] = [
    ...(number ? [{ label: B("Odelia's number", "Odelia 的号码"),
      sub: <>{display}{line.imessage ? (zh ? "，可发 iMessage（安卓手机为短信）" : ", on iMessage (texts from Android)") : (zh ? "，可发短信" : ", for texts")}
        {line.voice && (callApart ? <>{zh ? `；来电请拨 ${prettyPhone(callNumber!)}` : `. Calls: ${prettyPhone(callNumber!)}`}</> : (zh ? "，也可打电话" : ", and calls"))}</>,
      right: <>{number && <a className="sbtn quiet" href={`sms:${number}`}>{zh ? "发短信" : "Text"}</a>}<Btn onClick={() => saveContact(number, zh, callNumber)}><I.download />{zh ? "保存联系人" : "Save contact"}</Btn></> }] as Row[] : []),
    ...(line.email ? [{ label: B("Email Odelia", "给 Odelia 发邮件"),
      sub: <>{line.email}{zh ? "。用您登录快哉的邮箱写信或转发机构来信，附件会存入“文件”。" : ". Write or forward an agency's letter from the address you sign in with; attachments go into Documents."}</>,
      right: <a className="sbtn quiet" href={`mailto:${line.email}`}>{zh ? "写邮件" : "Write"}</a> }] as Row[] : []),
    ...(wa ? [{ label: B("Odelia on WhatsApp", "Odelia 的 WhatsApp"),
      sub: <>{prettyPhone(line.whatsapp!)}{zh ? "，用已关联的号码发消息即可" : ", from your linked number"}</>,
      right: <a className="sbtn quiet" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">{zh ? "打开 WhatsApp" : "Open WhatsApp"}</a> }] as Row[] : []),
    { label: B("Your phone", "您的手机"),
      sub: link ? <>{prettyPhone(link.number)}{verified ? (link.opted_out ? (zh ? `，已回复 STOP 退订短信。发送 START 到 ${display} 可重新开启。` : `, texts are off because it texted STOP. Text START to ${display} to turn them back on.`) : (zh ? "，已验证" : ", verified")) : (zh ? "，等待验证" : ", waiting for the code")}</> : (zh ? "未关联" : "Not linked"),
      right: verified ? <Btn kind="warm" guard onClick={remove}>{zh ? "取消关联" : "Remove"}</Btn> : link ? <Btn onClick={() => void act(() => api.phoneRemove())}>{zh ? "取消" : "Cancel"}</Btn> : undefined },
    ...(verified ? [
      { label: B("Texts about important updates", "重要更新短信通知"),
        sub: zh ? "有事等您批准，或 7 天内到期时发短信。每天最多 3 条。" : "When something needs your approval or is due within 7 days. At most 3 a day.",
        right: <Toggle on={link!.texts_on} set={v => prefs({ texts: v })} label={zh ? "重要更新短信" : "Texts about important updates"} /> },
      { label: B("Calls for urgent items", "紧急事项来电"),
        sub: line.voice ? (zh ? "可能被停业、检查未通过，或逾期事项影响开业时致电。每天最多 1 通。" : "A closure risk, a failed inspection, or something overdue that blocks opening. At most 1 a day.") : (zh ? "来电功能还没有设置好，紧急事项会改为短信通知。" : "Calls aren't set up yet, so urgent items come by text."),
        right: <Toggle on={link!.calls_on} set={v => prefs({ calls: v })} label={zh ? "紧急事项来电" : "Calls for urgent items"} /> },
      { label: B("Quiet hours", "免打扰时段"),
        sub: zh ? `这段时间不发短信也不打电话，按${link!.tz === deviceTz() ? "这台设备的" : ` ${link!.tz} `}时间。您主动联系时，Odelia 随时回复。` : `No texts or calls from Odelia then, in ${link!.tz === deviceTz() ? "this device's time zone" : link!.tz}. She always answers when you reach out.`,
        right: <>
          <Select sz="sm" value={link!.quiet_start} aria-label={zh ? "开始" : "From"} onChange={e => prefs({ quietStart: e.target.value, tz: deviceTz() })}>
            {[...new Set([...HOURS, link!.quiet_start])].map(h => <option key={h} value={h}>{hourLabel(h, zh)}</option>)}
          </Select>
          <span className="quiet">{zh ? "至" : "to"}</span>
          <Select sz="sm" value={link!.quiet_end} aria-label={zh ? "结束" : "Until"} onChange={e => prefs({ quietEnd: e.target.value, tz: deviceTz() })}>
            {[...new Set([...HOURS, link!.quiet_end])].map(h => <option key={h} value={h}>{hourLabel(h, zh)}</option>)}
          </Select>
        </> },
    ] as Row[] : []),
  ];

  return (
    <Group id="phone" title={B("Text and call Odelia", "发短信或致电 Odelia")}
      // The consent text is in src/consent.ts: when it changes, bump phone_consent_version() (..._phone_consent_log.sql).
      note={B("Text or call Odelia like a coworker. She answers from your workspace, starts work for you, and texts you first when something needs you. Odelia is an AI: her calls use an AI voice and are transcribed as they happen, and your texts and a record of each call are kept with your account. Filing, paying, sending and deleting still wait for your approval in the app.", "像和同事一样给 Odelia 发短信或打电话。她根据您的工作区回答问题、替您开始办理，有事需要您时会先发短信给您。Odelia 是 AI：通话使用 AI 语音并会实时转录，您的短信和每次通话的记录随您的账户保存。提交、付款、发送和删除仍需您在应用中批准。")}
      rows={rows}>
      {showForm && (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void start(link?.last_error === "text_first" ? "in" : undefined); }}>
          <input type="tel" inputMode="tel" autoComplete="tel" placeholder={link && !adding ? prettyPhone(link.number) : zh ? "您的手机号" : "Your mobile number"} value={num} onChange={e => setNum(e.target.value)} aria-label={zh ? "手机号" : "Mobile number"} />
          {link && <Btn onClick={() => { setAdding(false); setNum(""); setMsg(""); }}>{zh ? "取消" : "Cancel"}</Btn>}
          <button type="submit" className={"sbtn ink" + (pin.locked ? " pinned" : "")} disabled={busy || (!num.trim() && !link)}>{pin.locked && <I.lock />}{busy ? "…" : (line.imessage || !line.sms) ? (zh ? "获取验证码" : "Get a code") : zh ? "发送验证码" : "Send code"}</button>
          <p className="sg-note">{phoneConsent((line.imessage || !line.sms) ? "text_code" : "send_code", zh)}{" "}
            <button type="button" className="linkish" onClick={() => openLegal("terms")}>{zh ? "服务条款" : "Terms"}</button>{zh ? "，" : ", "}
            <button type="button" className="linkish" onClick={() => openLegal("privacy")}>{zh ? "隐私政策" : "Privacy Policy"}</button></p>
        </form>
      )}
      {textStep && (
        <div className="sg-form invite text-in">
          <p className="sg-note">{zh ? <>请用 {prettyPhone(link!.number)} 把这条消息发给 Odelia（{display || prettyPhone(line.whatsapp ?? "")}）：</> : <>From {prettyPhone(link!.number)}, text this to Odelia at {display || prettyPhone(line.whatsapp ?? "")}:</>}</p>
          <code className="text-code" aria-label={zh ? "要发送的验证码" : "Code to text"}>{textBody}</code>
          {number && <a className="sbtn ink" href={`sms:${number}?&body=${encodeURIComponent(textBody)}`}>{zh ? "现在发送" : "Text it now"}</a>}
          {wa && <a className={"sbtn " + (number ? "quiet" : "ink")} href={`https://wa.me/${wa}?text=${encodeURIComponent(textBody)}`} target="_blank" rel="noreferrer">{zh ? "用 WhatsApp 发送" : "Send on WhatsApp"}</a>}
          <Btn onClick={() => { void navigator.clipboard?.writeText(textBody); say(zh ? "已复制" : "Copied"); }}><I.copy />{zh ? "复制" : "Copy"}</Btn>
          <p className="sg-note" aria-live="polite">{zh ? "收到后会自动关联，30 分钟内有效。" : "It links as soon as she gets it. The code works for 30 minutes."}{" "}
            {line.sms && <button type="button" className="linkish" onClick={() => void start("out")}>{zh ? "改为接收短信验证码" : "Get a code by text instead"}</button>}{line.sms && (zh ? "，" : ", ")}
            <button type="button" className="linkish" onClick={() => { setTextIn(null); setAdding(true); setNum(""); setMsg(""); }}>{zh ? "换一个号码" : "Use another number"}</button></p>
        </div>
      )}
      {codeStep && (
        <form className="sg-form invite" onSubmit={e => { e.preventDefault(); void confirm(); }}>
          <input className="pin-in" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} aria-label={zh ? "验证码" : "Code"} autoFocus />
          <Btn onClick={() => void start()} disabled={busy}>{zh ? "重新发送" : "Send a new code"}</Btn>
          <button type="submit" className="sbtn ink" disabled={busy || code.length !== 6}>{busy ? "…" : zh ? "验证" : "Verify"}</button>
          <p className="sg-note">{zh ? `验证码已发送到 ${prettyPhone(link!.number)}，10 分钟内有效。` : `We texted a code to ${prettyPhone(link!.number)}. It works for 10 minutes.`}{" "}
            <button type="button" className="linkish" onClick={() => { setAdding(true); setNum(""); setMsg(""); }}>{zh ? "换一个号码" : "Use another number"}</button></p>
        </form>
      )}
      {!verified && !adding && link && !link.code_pending && !busy && !lastErr && <p className="sg-note">{zh ? "验证码已过期或未送达。请重新发送。" : "The code expired or didn't arrive. Send a new one."}</p>}
      {(msg || lastErr) && <p className="pin-msg" role="alert">{msg || lastErr}</p>}
      {verified && (
        <div className="sg-sub">
          <h3>{zh ? "最近的短信和通话" : "Recent texts and calls"}</h3>
          {log.length ? (
            <ul className="sg-list">
              {(all ? log : log.slice(0, 8)).map(r => (
                <li key={r.id} className="sg-row">
                  <span className="sg-ico">{r.channel === "voice" ? <I.phone /> : <I.message />}</span>
                  <span className="sg-tx"><b>{r.body || (zh ? "（无内容）" : "(no text)")}</b><small>{who(r)}{zh ? "，" : ", "}{fmtAgo(r.created_at, lang)}</small></span>
                </li>
              ))}
            </ul>
          ) : <p className="sg-note">{zh ? `还没有记录。发短信到 ${display} 开始吧。` : `Nothing yet. Text ${display} to start.`}</p>}
          {log.length > 8 && <div className="sg-act"><Btn onClick={() => setAll(v => !v)}>{all ? (zh ? "收起" : "Show less") : (zh ? "显示全部" : "Show all")}</Btn></div>}
        </div>
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
        { label: B("Two-step sign-in", "两步登录"),
          sub: on ? (zh ? "已开启：身份验证器应用" : "On: authenticator app") : (zh ? "未开启" : "Off"),
          right: on
            ? <Btn guard onClick={() => { if (window.confirm(zh ? "确定关闭两步登录？" : "Turn off two-step sign-in?")) void api.twoStepOff(factor!).then(() => { setFactor(null); say(zh ? "已关闭两步登录" : "Two-step sign-in is off"); cloud.reopen(); }).catch(e => say((e as api.ApiError).message)); }}>{zh ? "关闭" : "Turn off"}</Btn>
            : !setup ? <Btn guard kind="ink" onClick={() => setSetup(true)}>{zh ? "开启" : "Turn on"}</Btn> : undefined },
        { label: B("Password", "密码"), sub: zh ? "用邮箱和密码登录，或改用邮箱验证码。" : "Sign in with your email and password, or with an email code.",
          right: !pw.open ? <Btn guard onClick={() => setPw(x => ({ ...x, open: true }))}>{zh ? "修改密码" : "Change password"}</Btn> : undefined },
        { label: B("Sign out everywhere", "在所有设备上退出"), sub: zh ? "退出所有设备上的登录，包括这台。" : "Ends every session on every device, including this one.",
          right: <Btn onClick={() => { if (window.confirm(zh ? "在所有设备上退出？" : "Sign out on every device?")) cloud.signOut(true); }}>{zh ? "全部退出" : "Sign out all"}</Btn> },
      ]}>
      {pw.open && (
        <SetSheet title={zh ? "修改密码" : "Change password"} sub={zh ? "用邮箱和密码登录，或改用邮箱验证码。" : "Sign in with your email and password, or with an email code."} onClose={() => setPw({ open: false, a: "", b: "", show: false, busy: false })}>
          <form className="sst-form pwform" onSubmit={e => { e.preventDefault(); void savePw(); }}>
            <input id="pw-new" type={pw.show ? "text" : "password"} autoComplete="new-password" placeholder={zh ? "新密码（至少 8 个字符）" : "New password (8+ characters)"} value={pw.a} onChange={e => setPw(x => ({ ...x, a: e.target.value }))} aria-label={zh ? "新密码" : "New password"} autoFocus />
            <input id="pw-again" type={pw.show ? "text" : "password"} autoComplete="new-password" placeholder={zh ? "再次输入新密码" : "Type it again"} value={pw.b} onChange={e => setPw(x => ({ ...x, b: e.target.value }))} aria-label={zh ? "确认新密码" : "Confirm new password"} />
            <label className="check"><input type="checkbox" checked={pw.show} onChange={e => setPw(x => ({ ...x, show: e.target.checked }))} /><span>{zh ? "显示密码" : "Show passwords"}</span></label>
            <div className="sst-act"><Btn onClick={() => setPw({ open: false, a: "", b: "", show: false, busy: false })}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={pw.busy || !pw.a || !pw.b}>{pw.busy ? "…" : zh ? "保存新密码" : "Save new password"}</button></div>
          </form>
        </SetSheet>
      )}
      {setup && (
        <SetSheet title={zh ? "开启两步登录" : "Turn on two-step sign-in"} sub={zh ? "两步登录会在每次登录时要求输入手机上的验证码。" : "Two-step sign-in asks for a code from your phone each time you sign in."} onClose={() => setSetup(false)}>
          <TwoStepSetup lang={lang} onCancel={() => setSetup(false)} onDone={() => { setSetup(false); say(zh ? "两步登录已开启" : "Two-step sign-in is on"); cloud.reopen(); }} />
        </SetSheet>
      )}
    </Group>
  );
}

/** Deleting the account: type DELETE, then the server deletes it and this device signs out. */
function DeleteAccount({ onClose }: { onClose: () => void }) {
  const { b, cloud } = useApp();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  if (!cloud) return null;
  const go = async () => {
    if (typed.trim() !== "DELETE") { setMsg(b(B("Type DELETE to confirm.", "请输入 DELETE 以确认。"))); return; }
    setBusy(true); setMsg("");
    try { await api.deleteAccount(); cloud.signOut(); }
    catch (e) {
      const x = e as api.ApiError;
      setMsg(x.code === "subscription_active" ? b(B("A workspace you own alone still has a paid plan. Cancel it in Manage billing first, then delete your account.", "您单独拥有的工作区仍有付费方案。请先在“管理账单”中取消，再删除账户。"))
        : x.code === "mfa_required" ? b(B("Two-step sign-in is on. Sign out, sign back in with your code, then try again.", "您已开启两步登录。请退出后用验证码重新登录，再试一次。"))
        : x.message);
      setBusy(false);
    }
  };
  return (
    <Modal label={b(B("Delete your account", "删除账户"))} onClose={onClose}>
      <header className="m-h"><span className="m-eyebrow"><I.x />{b(B("Data controls", "数据管理"))}</span><h2>{b(B("Delete your account", "删除账户"))}</h2>
        <p>{b(B("This can't be undone. Workspaces where you are the only owner are deleted for everyone on them, with their files, filings and audit trail. On workspaces with another owner, you just leave. Records the law requires us to keep, such as billing records, stay.", "此操作无法撤销。您是唯一所有者的工作区将被删除，其中的文件、申报和审计记录也会一并删除，工作区内的其他成员也将无法再访问。在还有其他所有者的工作区中，您只会退出。法律要求我们保留的记录（例如账单记录）会继续保留。"))}</p></header>
      <form className="m-body" onSubmit={e => { e.preventDefault(); void go(); }}>
        <label className="sr" htmlFor="del-confirm">{b(B("Type DELETE to confirm", "输入 DELETE 以确认"))}</label>
        <input id="del-confirm" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={typed} onChange={e => setTyped(e.target.value)} placeholder={b(B("Type DELETE to confirm", "输入 DELETE 以确认"))} autoFocus />
        {msg && <p className="pin-msg" role="alert">{msg}</p>}
        <div className="sg-form-act"><Btn onClick={onClose}>{b(B("Cancel", "取消"))}</Btn><button type="submit" className="sbtn ink" disabled={busy || typed.trim() !== "DELETE"}>{busy ? "…" : b(B("Delete my account", "删除我的账户"))}</button></div>
      </form>
    </Modal>
  );
}

/* ---------------------------------- memory ---------------------------------- */

const ago = (iso: string, zh: boolean) => fmtAgo(iso, zh ? "zh" : "en");
function Toggle({ on, set, label, disabled }: { on: boolean; set: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <label className="switch" onClick={e => e.stopPropagation()}><input type="checkbox" checked={on} disabled={disabled} onChange={e => set(e.target.checked)} aria-label={label} /><i /></label>;
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
  // each memory file is a row: its name, its summary and when it changed, View and Delete on the right
  const table = (title: string, rows: MemoryFile[]) => (
    <div className="sg-sub mem">
      <h3>{title}</h3>
      {rows.length ? (
        <ul className="sg-list">{rows.map(f => (
          <li key={f.id} className="sg-row">
            <span className="sg-tx"><b>{fileLabel(f, zh ? "zh" : "en").name}</b><small>{fileLabel(f, zh ? "zh" : "en").summary}{f.lines.length ? "" : (zh ? "（暂无内容）" : " (nothing yet)")}{files.includes(f) ? (zh ? `，${ago(f.updated, zh)}更新` : `. Updated ${ago(f.updated, zh)}`) : ""}</small></span>
            <span className="sg-r">
              <button type="button" className="sbtn quiet" onClick={() => { setView(f); setDraft(f.lines.join("\n")); }}>{zh ? "查看" : "View"}</button>
              {files.includes(f) && <button type="button" className="sbtn quiet warm" aria-label={zh ? `删除 ${fileLabel(f, "zh").name}` : `Delete ${f.name}`} onClick={() => { if (window.confirm(zh ? `删除“${f.name}”中的全部记忆？` : `Delete everything in ${f.name}?`)) setMemory(b => ({ ...b, files: b.files.filter(x => x.id !== f.id) })); }}>{zh ? "删除" : "Delete"}</button>}
            </span>
          </li>
        ))}</ul>
      ) : <p className="sg-empty">{zh ? "还没有。和快哉聊得越多，这里会越充实。" : "Nothing yet. This fills in as you work with Placetta."}</p>}
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
      <RememberedList />
      {table(zh ? "您" : "You", you)}
      {table(zh ? "话题" : "Topics", group("topic"))}
      {table(zh ? "领域" : "Areas", group("area"))}
      {view && (
        <SetSheet title={fileLabel(view, zh ? "zh" : "en").name} sub={fileLabel(view, zh ? "zh" : "en").summary} onClose={() => setView(null)}>
          <div className="sst-form">
            <p className="sg-note">{zh ? "每行一条。可直接修改、增加或删除。" : "One fact per line. Edit, add or delete lines."}</p>
            <textarea className="memedit" value={draft} onChange={e => setDraft(e.target.value)} rows={14} aria-label={view.name} />
            <div className="sst-act">
              <Btn onClick={() => setView(null)}>{zh ? "取消" : "Cancel"}</Btn>
              <button type="button" className="sbtn ink" onClick={() => {
                const lines = draft.split("\n").map(l => l.replace(/^[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 60);
                setMemory(b => { const exists = b.files.some(x => x.id === view.id); const f = { ...view, lines, updated: new Date().toISOString() }; return { ...b, files: exists ? b.files.map(x => (x.id === view.id ? f : x)) : [...b.files, f] }; });
                setView(null); say(zh ? "记忆已更新。" : "Memory updated.");
              }}>{zh ? "保存" : "Save"}</button>
            </div>
          </div>
        </SetSheet>
      )}
      {imp === 1 && (
        <SetSheet title={zh ? "把记忆导入快哉" : "Import memory to Placetta"} onClose={() => setImp(0)}>
          <div className="memimp">
            <section><h3><span className="num">1</span>{zh ? "把这段提示词复制到您在其他 AI 助手的对话中" : "Copy this prompt into a chat with your other AI assistant"}</h3>
              <pre className="mempr">{IMPORT_PROMPT}</pre>
              <Btn onClick={() => { void navigator.clipboard?.writeText(IMPORT_PROMPT).then(() => say(zh ? "已复制" : "Copied"), () => say(zh ? "无法复制，请手动选中复制" : "Couldn't copy. Select the text and copy it.")); }}>{zh ? "复制提示词" : "Copy prompt"}</Btn>
            </section>
            <section><h3><span className="num">2</span>{zh ? "把结果粘贴到下面，加入快哉的记忆" : "Paste the results below to add them to Placetta's memory"}</h3>
              <textarea className="memedit" rows={8} value={paste} onChange={e => setPaste(e.target.value)} placeholder="[2026-01-05] - …" aria-label={zh ? "粘贴导出的记忆" : "Paste the exported memory"} />
              <div className="sst-act">
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
        </SetSheet>
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
    <SetSheet title={fresh ? (zh ? "创建技能" : "Create a skill") : sk.name[lang]} onClose={onClose}
      sub={fresh ? undefined : <>{SRC_LABEL[sk.source][lang]}{sk.uses > 0 && <>{zh ? `，已使用 ${sk.uses} 次` : `. Used ${sk.uses} time${sk.uses === 1 ? "" : "s"}`}{sk.firstSteps && sk.lastSteps ? (zh ? `。第一次用了 ${sk.firstSteps} 步，最近一次 ${sk.lastSteps} 步。` : `. The first took ${sk.firstSteps} step${sk.firstSteps === 1 ? "" : "s"}, the last took ${sk.lastSteps}.`) : "."}</>}</>}>
      <div className="skedit">
        <label><span>{zh ? "名称" : "Name"}</span><input value={name} onChange={e => setName(e.target.value)} readOnly={ro} placeholder={zh ? "例如：在厦门开奶茶店" : "e.g. Open a milk tea shop in Xiamen"} maxLength={80} /></label>
        <label><span>{zh ? "用途" : "What it's for"}</span><input value={desc} onChange={e => setDesc(e.target.value)} readOnly={ro} placeholder={zh ? "一句话说明它做什么、什么时候用" : "One sentence: what it does and when to use it"} maxLength={300} /></label>
        <label><span>{zh ? "说明" : "Instructions"}</span><textarea className="memedit" rows={12} value={body} onChange={e => setBody(e.target.value)} readOnly={ro} placeholder={zh ? "1. 第一步……\n2. ……" : "1. First...\n2. ..."} /></label>
        {!fresh && sk.fills && sk.fills.length > 0 && <p className="sg-note">{zh ? `记得 ${sk.fills.length} 行表格各自的来源，下次会自动填写。` : `Remembers where ${sk.fills.length} lines of the form come from, so the next one fills itself.`}</p>}
        {ro ? <p className="sg-note">{zh ? "快哉内置技能，可以关闭但不能修改。" : "Built into Placetta. You can turn it off but not edit it."}</p> : null}
        <div className="sst-act">
          <Btn onClick={onClose}>{ro ? (zh ? "关闭" : "Close") : zh ? "取消" : "Cancel"}</Btn>
          {!ro && <button type="button" className="sbtn ink" onClick={save}>{fresh ? (zh ? "创建" : "Create") : zh ? "保存" : "Save"}</button>}
        </div>
      </div>
    </SetSheet>
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
  // each skill is a row: its name (opens it), where it came from and what it's for, the switch on the right
  const table = (rows: Skill[]) => (
    <ul className="sg-list skl">{rows.map(s => (
      <li key={s.id} className={"sg-row" + (s.on ? "" : " off")}>
        <button type="button" className="sg-tx sk-n" onClick={() => setOpen(s)}><b>{s.name[lang]}</b><small>{s.description[lang]}</small>
          <small>{SRC_LABEL[s.source][lang]}{s.uses ? (zh ? `，用过 ${s.uses} 次` : `, used ${s.uses}x`) : ""}{zh ? `，${fmtDay(s.updated, lang, true)}更新` : `, updated ${fmtDay(s.updated, lang, true)}`}</small></button>
        <span className="sg-r">
          {s.source !== "placetta" && <button type="button" className="sbtn quiet warm" aria-label={zh ? `删除 ${s.name.zh}` : `Delete ${s.name.en}`} onClick={() => { if (window.confirm(zh ? `删除技能“${s.name.zh}”？` : `Delete the skill "${s.name.en}"?`)) { editWs(dropSkill(s.id)); say(zh ? "已删除。" : "Deleted."); } }}>{zh ? "删除" : "Delete"}</button>}
          <Toggle on={s.on} set={v => editWs(toggleSkill(s.id, v))} label={(zh ? "启用 " : "Turn on ") + s.name[lang]} />
        </span>
      </li>
    ))}</ul>
  );
  return (
    <Group id="skills" title={B("Skills", "技能")} note={B("Skills teach Placetta how you work. It learns new ones as it fills forms and researches new cities, so the next time is faster, and you can write your own.", "技能教快哉按您的方式做事。它在填写表格、调研新城市时自动学习新技能，下次更快完成；您也可以自己编写。")}
      rows={[{ label: B("Create skills automatically", "自动创建技能"), sub: zh ? "快哉弄清一件以后还会用到的事时（某张表怎么填、某个新城市需要哪些许可），自动存为技能。" : "When Placetta works out something it'll need again (how a form is filled, what a new city requires), it saves it as a skill.", right: <Toggle on={auto} set={v => editWs(w => ({ ...w, skillsAuto: v }))} label="Create skills automatically" /> },
        { label: B("Learn with other businesses", "与其他商家共同学习"), sub: zh ? "您的工作教会 Odelia 的通用经验（某个城市要求什么、某个机构为何退件、要等多久）会匿名分享给所有商家，就像您从他们那里受益一样。绝不包含您的名称、地址、人员、号码或文件。关闭后您仍能使用这些经验。" : "What your jobs teach Odelia in general (what a city requires, why an agency sends filings back, how long it takes) is shared, anonymized, with every business, the way you benefit from theirs. Never your name, addresses, people, numbers or files. With it off, you still get the lessons.", right: <Toggle on={ws.shareLearning !== false} set={v => editWs(w => ({ ...w, shareLearning: v }))} label="Learn with other businesses" /> }]}>
      <div className="sk-bar">
        <input className="sk-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={zh ? "搜索技能" : "Search skills"} aria-label={zh ? "搜索技能" : "Search skills"} />
        <Btn kind="ink" onClick={() => setOpen("new")}><I.plus />{zh ? "创建技能" : "Create skill"}</Btn>
      </div>
      <div className="sg-sub mem">
        <h3>{zh ? "您的技能" : "Your skills"}</h3>
        {mine.length ? table(mine) : <p className="sg-empty">{q ? (zh ? "没有匹配的技能。" : "No skills match.") : zh ? "还没有。快哉会在工作中自动创建，您也可以自己编写。" : "None yet. Placetta creates them as it works, or create your own."}</p>}
      </div>
      <div className="sg-sub mem">
        <h3>{zh ? "来自快哉" : "From Placetta"}</h3>
        {ours.length ? table(ours) : <p className="sg-empty">{zh ? "没有匹配的技能。" : "No skills match."}</p>}
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
      rows={[{ label: B("Language", "语言"), sub: <>{cur.native}{cur.native !== cur.en ? <span className="quiet">, {cur.en}</span> : null}</>, right: <Btn onClick={() => setOpen(true)}>{zh ? "更改" : "Change"}</Btn> }]}>
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
      rows={[{ label: B("Settings PIN", "设置 PIN"), sub,
        right: !st.on ? (!form ? <Btn kind="ink" onClick={() => setForm("new")}>{zh ? "开启" : "Turn on"}</Btn> : undefined) : <>
          {unlocked ? <Btn onClick={() => void api.pinLock().then(setSt)}>{zh ? "立即锁定" : "Lock now"}</Btn> : <Btn kind="ink" onClick={() => ask(zh ? "解锁设置" : "Unlock settings", api.pinUnlock)}>{zh ? "解锁" : "Unlock"}</Btn>}
          {!form && <Btn onClick={() => setForm("change")}>{zh ? "更换 PIN" : "Change PIN"}</Btn>}
          <Btn onClick={() => ask(zh ? "关闭设置 PIN" : "Turn off the settings PIN", api.pinClear, () => say(zh ? "设置 PIN 已关闭。" : "Settings PIN is off."))}>{zh ? "关闭" : "Turn off"}</Btn>
        </> }]}>
      {form && (
        <SetSheet title={form === "change" ? (zh ? "更换 PIN" : "Change PIN") : (zh ? "开启设置 PIN" : "Turn on the settings PIN")} sub={zh ? "6 位数字。连续输错 5 次会锁定 15 分钟。" : "6 digits. 5 wrong tries lock it for 15 minutes."} onClose={() => { setForm(null); setA(""); setB2(""); setCur(""); }}>
          <form className="sst-form pinform" onSubmit={e => { e.preventDefault(); void save(); }}>
            {form === "change" && <label className="sst-field"><span>{zh ? "当前 PIN" : "Current PIN"}</span><PinInput id="pin-cur" value={cur} onChange={setCur} label={zh ? "当前 PIN" : "Current PIN"} auto /></label>}
            <label className="sst-field"><span>{zh ? "新 PIN" : "New PIN"}</span><PinInput id="pin-new" value={a} onChange={setA} label={zh ? "新 PIN" : "New PIN"} auto={form === "new"} /></label>
            <label className="sst-field"><span>{zh ? "再次输入 PIN" : "Type it again"}</span><PinInput id="pin-again" value={b2} onChange={setB2} label={zh ? "再次输入 PIN" : "Type it again"} /></label>
            <div className="sst-act"><Btn onClick={() => { setForm(null); setA(""); setB2(""); setCur(""); }}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={busy || a.length !== 6 || b2.length !== 6 || (form === "change" && cur.length !== 6)}>{busy ? "…" : zh ? "保存 PIN" : "Save PIN"}</button></div>
          </form>
        </SetSheet>
      )}
    </Group>
  );
}

const copy = (text: string, say: (m: string) => void, zh: boolean) =>
  void navigator.clipboard?.writeText(text).then(() => say(zh ? "已复制" : "Copied"), () => say(zh ? "无法复制，请手动选择。" : "Couldn't copy. Select it instead."));
const METHOD_NAME: Record<string, Bi> = {
  saml: B("SAML single sign-on (Okta, Microsoft Entra ID, Google, OneLogin, JumpCloud)", "SAML 单点登录（Okta、Microsoft Entra ID、Google、OneLogin、JumpCloud）"),
  google: B("Google Workspace", "Google Workspace"), azure: B("Microsoft Entra ID", "Microsoft Entra ID"),
};
const methodName = (m: string, zh: boolean) => (METHOD_NAME[m] ?? B(`OpenID Connect (${m})`, `OpenID Connect（${m}）`))[zh ? "zh" : "en"];

/** Single sign-on for the workspace's company domain: claim it with a DNS record, then require everyone at that domain
 *  to sign in through the company's identity provider. Owners and admins; the database enforces the rule. */
function SingleSignOn() {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const pin = usePin();
  const [st, setSt] = useState<api.Security | null>(null);
  const [auth, setAuth] = useState<api.AuthStatus | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wsId = cloud?.wsId ?? "";
  const load = useCallback(async () => {
    if (!wsId || !cloud?.admin) return;
    try { const r = await api.ssoStatus(wsId); setSt(r.settings); setAuth(r.auth); }
    catch { try { setSt(await api.securitySettings(wsId)); } catch { setSt(null); } }
  }, [wsId, cloud?.admin]);
  useEffect(() => { void load(); }, [load]);
  if (!cloud) return null;
  if (!cloud.admin) return <Group id="sso" title={B("Single sign-on", "单点登录")} note={B("Owners and admins set up single sign-on for your company's email domain.", "所有者和管理员可为公司邮箱域名设置单点登录。")} />;
  const act = async (fn: () => Promise<unknown>, done?: string) => { setBusy(true); try { await fn(); if (done) say(done); await load(); } catch (e) { say((e as api.ApiError).message); } setBusy(false); };
  const verify = () => act(async () => {
    const r = await api.ssoVerify(wsId);
    if (r.verified) { say(zh ? "域名已验证" : "Domain verified"); return; }
    say(r.reason === "dns_unavailable" ? (zh ? "暂时无法查询 DNS，请稍后再试。" : "Couldn't reach DNS just now. Try again in a minute.")
      : r.found?.length ? (zh ? `还没找到这条记录。目前的 TXT 记录：${r.found.join("；")}` : `The record isn't there yet. TXT records found: ${r.found.join("; ")}`)
      : (zh ? "还没找到这条记录。DNS 更改可能需要几分钟到几小时生效。" : "The record isn't there yet. DNS changes can take a few minutes to a few hours."));
  });
  const verified = !!st?.verified_at;
  const method = st?.method ?? "saml";
  const ready = method === "saml" ? auth?.saml_registered : auth?.providers?.[method] ?? null;
  const readyNote = ready === true ? (zh ? "已在快哉设置好" : "Set up in Placetta")
    : ready === false ? (method === "saml" ? (zh ? "尚未设置：请把身份提供商的 SAML 元数据网址发给 support@placetta.com，快哉为您登记" : "Not set up yet: send your identity provider's SAML metadata URL to support@placetta.com and Placetta registers it")
      : (zh ? "此登录方式尚未开启：请联系 support@placetta.com" : "This sign-in isn't turned on yet: ask support@placetta.com"))
    : (zh ? "暂时无法确认是否已设置" : "Placetta couldn't check whether it's set up");
  const lockNote = st?.domain && st.my_domain === st.domain && st.session_ok === false && !st.enforced;
  const rows: Row[] = st ? [
    { label: B("Company email domain", "公司邮箱域名"), sub: st.domain ?? (zh ? "未设置" : "Not set"),
      right: domain === null ? <Btn guard onClick={() => setDomain(st.domain ?? "")}>{st.domain ? (zh ? "更改" : "Change") : (zh ? "设置" : "Set")}</Btn> : undefined },
    ...(st.domain ? [verified
      ? { label: B("Domain verified", "域名已验证"), sub: fmtDay(st.verified_at!, lang, true) }
      : { label: B("Verify you own it", "验证域名所有权"),
          sub: <>{zh ? "在域名的 DNS 服务商处添加一条 TXT 记录，然后点击检查。" : "Add this TXT record where your domain's DNS is managed, then check."}<br />
            <code className="sg-code">{st.txt_name}</code><br /><code className="sg-code">{st.txt_value}</code></>,
          right: <><Btn onClick={() => copy(st.txt_value ?? "", say, zh)}>{zh ? "复制值" : "Copy value"}</Btn><Btn kind="ink" disabled={busy} onClick={() => void verify()}>{zh ? "检查" : "Check"}</Btn></> }] : []),
    ...(verified ? [
      { label: B("Sign-in method", "登录方式"), sub: readyNote,
        right: <Select sz="sm" value={method} aria-label={zh ? "登录方式" : "Sign-in method"} disabled={busy}
          onChange={e => {
            let m = e.target.value;
            // Okta and other OpenID Connect providers: the identifier Placetta gave it in Supabase Auth (custom:...)
            if (m === "other") {
              const id = window.prompt(zh ? "快哉为您设置的提供商标识（以 custom: 开头，例如 custom:okta-acme）" : "The provider identifier Placetta set up for you (starts with custom:, for example custom:okta-acme)", "custom:");
              if (!id || !/^custom:[a-z0-9][a-z0-9:-]{0,42}$/.test(id.trim())) { if (id) say(zh ? "标识应以 custom: 开头，只含小写字母、数字、连字符和冒号。" : "The identifier starts with custom: and has only lowercase letters, numbers, hyphens and colons."); return; }
              m = id.trim();
            }
            pin.guard(() => void act(() => api.ssoSetEnforced(wsId, st.enforced, m), zh ? "已更新" : "Updated"));
          }}>
          {["saml", "google", "azure", ...(method.startsWith("custom:") ? [method] : [])].map(m => <option key={m} value={m}>{methodName(m, zh)}</option>)}
          <option value="other">{zh ? "其他 OpenID Connect 提供商（如 Okta）" : "Another OpenID Connect provider (such as Okta)"}</option>
        </Select> },
      { label: B(`Require single sign-on for everyone at ${st.domain}`, `要求 ${st.domain} 的所有人使用单点登录`),
        sub: lockNote ? (zh ? "请先用单点登录重新登录，确认可用后再开启，以免把自己锁在外面。" : "Sign in with single sign-on first, so you know it works before it's required. That keeps you from locking yourself out.")
          : st.enforced ? (zh ? "已开启：该域名的邮箱只能通过上面的方式登录，其他登录方式无法访问任何工作区。" : "On: anyone with this domain's email reaches Placetta only by signing in this way. Other sign-ins reach no workspace.")
          : (zh ? "关闭：也可以用密码、验证码或其他方式登录。" : "Off: passwords, codes and other sign-ins work too."),
        right: <label className="switch"><input type="checkbox" checked={st.enforced} disabled={busy || (!st.enforced && !!lockNote)}
          onChange={e => { const on = e.target.checked; if (on && !window.confirm(zh ? `开启后，${st.domain} 的所有人都必须通过单点登录访问快哉。确定开启？` : `Everyone at ${st.domain} will have to sign in with single sign-on to reach Placetta. Turn it on?`)) return; pin.guard(() => void act(() => api.ssoSetEnforced(wsId, on, method), on ? (zh ? "已要求单点登录" : "Single sign-on is required") : (zh ? "已不再要求单点登录" : "Single sign-on is no longer required"))); }} /><i /></label> },
    ] : []),
  ] : [];
  return (
    <Group id="sso" title={B("Single sign-on", "单点登录")} note={B("Claim your company's email domain, then require everyone at it to sign in through your identity provider: SAML (Okta, Microsoft Entra ID, Google and others), Google Workspace, or Microsoft Entra ID. Every change goes in the audit trail.", "认领公司邮箱域名，然后要求该域名的所有人通过身份提供商登录：SAML（Okta、Microsoft Entra ID、Google 等）、Google Workspace 或 Microsoft Entra ID。每次更改都会记入审计记录。")} rows={rows}>
      {domain !== null && (
        <form className="sg-form" onSubmit={e => { e.preventDefault(); const d = domain; pin.guard(() => void act(async () => { await api.ssoSetDomain(wsId, d); setDomain(null); }, zh ? "域名已保存，请添加 TXT 记录完成验证。" : "Saved. Add the TXT record to verify it.")); }}>
          <input autoComplete="off" spellCheck={false} placeholder="yourcompany.com" value={domain} onChange={e => setDomain(e.target.value)} aria-label={zh ? "公司邮箱域名" : "Company email domain"} autoFocus />
          <div className="sg-form-act"><Btn onClick={() => setDomain(null)}>{zh ? "取消" : "Cancel"}</Btn><button type="submit" className="sbtn ink" disabled={busy || !domain.trim()}>{zh ? "保存" : "Save"}</button></div>
          {st?.enforced && <p className="sg-note">{zh ? "更改域名会停止当前的单点登录要求，新域名需要重新验证。" : "Changing the domain ends the current single sign-on requirement; the new domain needs verifying again."}</p>}
        </form>
      )}
    </Group>
  );
}

/** SCIM provisioning: the company's identity provider adds and removes people, and its groups give roles. */
function Provisioning() {
  const { lang, cloud, say } = useApp();
  const zh = lang === "zh";
  const pin = usePin();
  const [st, setSt] = useState<api.Security | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wsId = cloud?.wsId ?? "";
  const load = useCallback(async () => { if (!wsId || !cloud?.admin) return; try { setSt(await api.securitySettings(wsId)); } catch { setSt(null); } }, [wsId, cloud?.admin]);
  useEffect(() => { void load(); }, [load]);
  if (!cloud) return null;
  if (!cloud.admin) return <Group id="scim" title={B("Provisioning (SCIM)", "自动开通（SCIM）")} note={B("Owners and admins connect your identity provider to add and remove people automatically.", "所有者和管理员可连接身份提供商，自动添加和移除成员。")} />;
  const act = async (fn: () => Promise<unknown>, done?: string) => { setBusy(true); try { await fn(); if (done) say(done); await load(); } catch (e) { say((e as api.ApiError).message); } setBusy(false); };
  const make = () => act(async () => { const r = await api.scimTokenCreate(wsId); setShown(r.token); });
  const t = st?.scim;
  const rows: Row[] = st ? [
    { label: B("SCIM base URL", "SCIM 基础网址"), sub: <code className="sg-code">{api.scimUrl()}</code>, right: <Btn onClick={() => copy(api.scimUrl(), say, zh)}>{zh ? "复制" : "Copy"}</Btn> },
    { label: B("SCIM token", "SCIM 令牌"),
      sub: t ? <>{`scim_${t.prefix}_…`}<br />{(zh ? "创建于 " : "Made ") + fmtDay(t.created_at, lang, true)}{t.last_used_at ? (zh ? `，最近使用 ${fmtAgo(t.last_used_at, lang)}` : `, last used ${fmtAgo(t.last_used_at, lang)}`) : (zh ? "，尚未使用" : ", not used yet")}</> : (zh ? "未创建" : "None"),
      right: <>
        <Btn guard kind={t ? "quiet" : "ink"} disabled={busy} onClick={() => { if (!t || window.confirm(zh ? "换一个新令牌？旧令牌会立即失效。" : "Make a new token? The old one stops working right away.")) void make(); }}>{t ? (zh ? "更换" : "Replace") : (zh ? "创建令牌" : "Create token")}</Btn>
        {t && <Btn kind="warm" guard disabled={busy} onClick={() => { if (window.confirm(zh ? "停用 SCIM 令牌？身份提供商将无法再同步。" : "Turn off the SCIM token? Your identity provider stops syncing.")) void act(() => api.scimTokenRevoke(wsId), zh ? "令牌已停用" : "Token turned off"); }}>{zh ? "停用" : "Turn off"}</Btn>}
      </> },
    { label: B("People provisioned", "已开通人数"), sub: String(st.scim_users) },
    ...st.groups.map(g => ({
      label: { en: g.name, zh: g.name }, sub: zh ? `群组，${g.members} 名成员` : `Group, ${g.members} ${g.members === 1 ? "member" : "members"}`,
      right: <Select sz="sm" value={g.role ?? ""} aria-label={zh ? "群组角色" : "Group role"} disabled={busy}
        onChange={e => { const v = (e.target.value || null) as api.ScimGroup["role"]; pin.guard(() => void act(() => api.scimGroupRole(wsId, g.id, v), zh ? "群组角色已更新" : "Group role updated")); }}>
        <option value="">{zh ? "不设角色" : "No role"}</option>
        {(["admin", "member", "viewer"] as const).map(r => <option key={r} value={r}>{ROLE_NAME[r][zh ? "zh" : "en"]}</option>)}
      </Select>,
    })),
  ] : [];
  return (
    <Group id="scim" title={B("Provisioning (SCIM)", "自动开通（SCIM）")} note={B("Connect Okta, Microsoft Entra ID or another identity provider with SCIM 2.0. People it assigns get access when they sign in; people it deactivates are taken off this workspace and signed out everywhere. Groups give their members the role you pick here, and anyone in no mapped group is a member. Owners are made in Placetta, never by SCIM. Every change goes in the audit trail.", "通过 SCIM 2.0 连接 Okta、Microsoft Entra ID 或其他身份提供商。被分配的人登录后即可访问；被停用的人会被移出工作区，并在所有设备上退出登录。群组成员获得您在此选择的角色，不在任何已设置群组中的人为成员。所有者只能在快哉中设置，SCIM 不会创建所有者。每次更改都会记入审计记录。")} rows={rows}>
      {shown && (
        <SetSheet title={zh ? "您的 SCIM 令牌" : "Your SCIM token"} sub={zh ? "现在复制到身份提供商中。关闭后不会再显示，快哉只保存它的哈希值。" : "Copy it into your identity provider now. It isn't shown again: Placetta keeps only its hash."} onClose={() => setShown(null)}>
          <div className="sst-form">
            <code className="sg-code wrap">{shown}</code>
            <div className="sst-act"><Btn onClick={() => copy(shown, say, zh)}>{zh ? "复制" : "Copy"}</Btn><button type="button" className="sbtn ink" onClick={() => setShown(null)}>{zh ? "完成" : "Done"}</button></div>
          </div>
        </SetSheet>
      )}
    </Group>
  );
}

/* Settings categories, Anthropic style: a few clear groups in the sidebar, one shown at a time. */
const SETTINGS_CATS: { id: string; label: Bi; items: string[] }[] = [
  { id: "general", label: B("General", "通用"), items: ["account", "appearance", "language"] },
  { id: "facts", label: B("Business facts", "企业资料"), items: ["facts", "house", "entities"] },
  { id: "team", label: B("Team", "团队"), items: ["team", "hq", "partner"] },
  { id: "odelia", label: B("Odelia", "Odelia"), items: ["agent", "autonomy", "brules", "phone", "approvals", "memory", "agentmemory", "skills"] },
  { id: "connections", label: B("Connections", "连接"), items: ["integrations", "logins"] },
  { id: "billing", label: B("Billing", "账单"), items: ["billing", "contract", "modules", "filingcap", "spending"] },
  { id: "security", label: B("Security", "安全"), items: ["security", "sso", "scim", "pin"] },
  { id: "privacy", label: B("Privacy and data", "隐私与数据"), items: ["data"] },
  { id: "activity", label: B("Activity", "活动记录"), items: ["activity"] },
  { id: "help", label: B("Help and legal", "帮助与法律"), items: ["help", "legal"] },
];
const CLOUD_ONLY = new Set(["team", "hq", "partner", "security", "sso", "scim", "pin", "phone", "contract", "filingcap"]);
const catOf = (k: string) => SETTINGS_CATS.find(c => c.id === k || c.items.includes(k))?.id;
const readCat = () => { try { return catOf(localStorage.getItem("placetta-settings-cat") ?? ""); } catch { return undefined; } };
let settingsTarget: string | null = null;
let settingsOpenedAt = false;
const takeSettingsTarget = () => { const t = settingsTarget; settingsTarget = null; if (t) settingsOpenedAt = true; return t; };
/** Opens Settings at one section (e.g. "hq", "security"), switching to its category. */
export function openSettings(go: (v: "settings") => void, section: string) {
  settingsTarget = section;
  go("settings");
  window.dispatchEvent(new CustomEvent("placetta:settings", { detail: section }));
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
  const [del, setDel] = useState(false);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [prompt, setPrompt] = useState<{ title: string; action: (pin: string) => Promise<api.PinStatus>; then?: () => void } | null>(null);
  useEffect(() => { if (cloud) void api.pinStatus().then(setPinSt, () => setPinSt(null)); }, [cloud]);
  useEffect(() => { const id = window.setInterval(() => setNow(new Date().toISOString()), 15000); return () => window.clearInterval(id); }, []);
  const pinLocked = !!pinSt?.on && !(pinSt.unlocked_until && pinSt.unlocked_until > now);
  const ask = (title: string, action: (pin: string) => Promise<api.PinStatus>, then?: () => void) => setPrompt({ title, action, then });
  const pinCtx: PinCtx = { locked: pinLocked, guard: fn => (pinLocked ? ask(lang === "zh" ? "输入 PIN 以继续" : "Enter your PIN to continue", api.pinUnlock, fn) : fn()) };
  const bl = cloud?.billing;
  // Odelia's allowance this period: shown before anyone hits it, like Devin's usage meter
  const [ai, setAi] = useState<api.AiStatus | null>(null);
  useEffect(() => { if (cloud?.wsId) void api.aiStatus(cloud.wsId).then(setAi); }, [cloud?.wsId]);
  const aiSub = !ai ? undefined : lang === "zh"
    ? `${ai.plan === "none" ? "开通方案后可用" : ai.plan === "entry" ? "开店计划 30 天额度" : ai.plan === "entry_ended" ? "开店计划额度已结束" : "本月额度"}：已用 ${ai.used_pct}%${ai.resets_at && ai.plan !== "entry_ended" ? `，${ai.plan === "entry" ? "截至" : "于"} ${fmtDay(ai.resets_at, lang, true)}${ai.plan === "entry" ? "" : " 重置"}` : ""}${ai.has_credit ? "，另有加量包额度" : ""}${ai.saver ? "。目前为节省模式：更省的模型，不做网页调研" : ""}`
    : `${ai.plan === "none" ? "Starts with a plan" : ai.plan === "entry" ? "Entry plan's 30-day allowance" : ai.plan === "entry_ended" ? "Entry plan's allowance has ended" : "This month's allowance"}: ${ai.used_pct}% used${ai.resets_at && ai.plan !== "entry_ended" ? `, ${ai.plan === "entry" ? "until" : "resets"} ${fmtDay(ai.resets_at, lang, true)}` : ""}${ai.has_credit ? ", plus pack credit" : ""}${ai.saver ? ". In saver mode: cheaper models, no web research" : ""}`;
  const planName = !cloud ? B("Growth plan (sample)", "成长版（示例）")
    : bl?.free && !bl.subscription_status ? B("Early access, everything included", "抢先体验，全部功能开放")
    : cloud.plan === "monthly" ? ({ starter: B("Starter plan", "入门版"), growth: B("Growth plan", "成长版"), scale: B("Scale plan", "规模版"), locations: B("Essentials, per location", "基础版（按门店）"), pro: B("Pro, per location", "专业版（按门店）") } as Record<string, Bi>)[bl?.subscription_plan ?? ""] ?? B(bl?.comped ? "Monthly plan (pilot)" : "Monthly plan", bl?.comped ? "月度方案（试点）" : "月度方案")
    : cloud.plan === "entry" ? B(`Entry plan, ${bl?.entry_markets ?? 1} market${(bl?.entry_markets ?? 1) > 1 ? "s" : ""}`, `开店计划，${bl?.entry_markets ?? 1} 个市场`) : B("No plan yet", "尚未开通");
  const renew = bl?.current_period_end ? (lang === "zh" ? `${fmtDay(bl.current_period_end, lang, true)} 续费` : `Renews ${fmtDay(bl.current_period_end, lang, true)}`) : "";
  // Like Anthropic's settings: a short sidebar of categories, and only the chosen one on the right.
  const CATS = SETTINGS_CATS.map(c => ({ ...c, items: c.items.filter(k => cloud || !CLOUD_ONLY.has(k)) })).filter(c => c.items.length);
  const [cat, setCatRaw] = useState<string>(() => catOf(takeSettingsTarget() ?? "") ?? catOf(readRoute().sub ?? "") ?? readCat() ?? "general");
  // On a phone (or wherever the column is too narrow for the list beside it) Settings is a list of categories that
  // opens one at a time, with a row back to the list, the way a phone's own settings work. Opened at a category
  // (a link, ⌘K, a button elsewhere in the app), it starts inside that category. Wide, both always show.
  const [inCat, setInCat] = useState(() => !!readRoute().sub || settingsOpenedAt);
  const pushed = useRef(false);
  const setCat = (c: string, step = false) => { setCatRaw(c); setInCat(true); setRoute("settings", c, !step); if (step) pushed.current = true; try { localStorage.setItem("placetta-settings-cat", c); } catch { /* storage off */ } };
  const toTop = () => { window.scrollTo({ top: 0 }); document.querySelector(".content")?.scrollTo({ top: 0 }); };
  const back = () => { setInCat(false); if (pushed.current) { pushed.current = false; history.back(); } else setRoute("settings", undefined, true); toTop(); };
  useEffect(() => { settingsOpenedAt = false; if (inCat) setRoute("settings", cat, true); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // the browser's Back from a category to the list, and Forward into it again
  useEffect(() => {
    const on = () => { const r = readRoute(); if (r.view === "settings") setInCat(!!r.sub); };
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  // the category showing, for the sidebar (its More group lights Activity and Business facts)
  useEffect(() => { window.dispatchEvent(new CustomEvent("placetta:settings-at", { detail: cat })); }, [cat]);
  useEffect(() => {
    const on = (e: Event) => { const k = (e as CustomEvent<string>).detail; const c = catOf(k); if (c) { setCat(c); setTimeout(() => document.getElementById("set-" + k)?.scrollIntoView({ block: "start" }), 60); } };
    window.addEventListener("placetta:settings", on);
    return () => window.removeEventListener("placetta:settings", on);
  }, []);
  const active = CATS.find(c => c.id === cat) ?? CATS[0];
  const show = (k: string) => active.items.includes(k);

  return (
    <PinLock.Provider value={pinCtx}>
    <div className={"page settings" + (inCat ? " at-cat" : "")}>
      <header className="ph"><div className="ph-tx"><h1>{t("nav_settings")}</h1></div></header>
      <div className="set-grid">
        <nav className="set-nav" aria-label={t("nav_settings")}>
          {CATS.map(c => <a key={c.id} className="set-tab" href={hrefOf("settings", c.id)} aria-current={c.id === active.id ? "page" : undefined} onClick={e => { if (!plainClick(e)) return; e.preventDefault(); setCat(c.id, true); toTop(); }}><span>{b(c.label)}</span><I.chevR /></a>)}
        </nav>
        <div className="set-col">
          {/* on a phone: the row back to the list, and the category's name */}
          <div className="set-head">
            <a className="set-back" href={hrefOf("settings")} onClick={e => { if (!plainClick(e)) return; e.preventDefault(); back(); }}><I.chevL />{t("nav_settings")}</a>
            <h1>{b(active.label)}</h1>
          </div>
          <Group id="account" hidden={!show("account")} title={B("Account", "账户")} rows={cloud ? [
            { label: B("Email", "邮箱"), sub: <>{cloud.email}{lang === "zh" ? `，${ROLE_NAME[cloud.role].zh}` : `, ${ROLE_NAME[cloud.role].en.toLowerCase()}`}</> },
            { label: B("Business", "企业"), sub: b(ws.business), right: <Btn onClick={cloud.newWorkspace}>{lang === "zh" ? "新建企业" : "New business"}</Btn> },
            { label: B("Sign out", "退出登录"), right: <Btn onClick={cloud.signOut}>{lang === "zh" ? "退出" : "Sign out"}</Btn> },
            ...(api.PREVIEW ? [{ label: B("Data in this browser", "此浏览器中的数据"), sub: b(B("Your accounts and workspaces here are kept in this browser. Start over clears them.", "这里的账户和工作区保存在此浏览器中，重新开始会清空。")),
              right: <Btn onClick={() => { void import("./cloud/preview").then(m => { m.resetPreview(); location.reload(); }); }}>{lang === "zh" ? "清空重来" : "Start over"}</Btn> }] : []),
          ] : [{ label: B("Sample workspace", "示例工作区"), sub: b(B("Everything here is sample data. Create an account to save your own business.", "这里都是示例数据。注册账户即可保存您自己的企业。")) }]} />

          {show("facts") && <ContextPage />}
          {show("house") && <HouseRulesGroup />}
          {show("entities") && <EntitiesGroup />}
          {show("activity") && <AuditTrail />}
          {show("team") && <Team />}
          {show("hq") && <HqShare />}
          {show("partner") && <PartnerSharing />}
          {show("security") && <Security />}
          {show("sso") && <SingleSignOn />}
          {show("scim") && <Provisioning />}
          {cloud && show("pin") && <PinGroup st={pinSt} setSt={st => { setPinSt(st); setNow(new Date().toISOString()); }} ask={ask} />}

          <Group id="billing" hidden={!show("billing")} title={B("Plan and billing", "方案与账单")} note={B("Payment methods and invoices are handled by Stripe; Placetta never sees card numbers. Government fees are paid by you directly to each agency.", "付款方式和发票由 Stripe 处理，快哉看不到卡号。政府规费由您直接支付给各机构。")}
            rows={[
              { label: planName, sub: renew || (bl?.free && !bl.subscription_status ? b(B("Paid plans start later. Nothing is charged now.", "付费方案稍后推出，现在不收取任何费用。")) : cloud?.plan === "entry" ? b(B("Credited toward your first year on an annual plan", "可抵扣年度方案首年费用")) : undefined),
                right: cloud && !cloud.owner ? <em className="lock">{lang === "zh" ? "由所有者管理" : "Managed by owners"}</em> : cloud ? <>{cloud.plan !== "monthly" && <Btn guard kind="ink" onClick={() => cloud.openPlans(cloud.plan === "none" ? "start" : "file")}>{lang === "zh" ? "选择方案" : "Choose a plan"}</Btn>}{bl?.stripe_customer_id && <Btn guard onClick={() => void cloud.portal()}>{lang === "zh" ? "管理账单" : "Manage billing"}</Btn>}</> : undefined },
              ...(ai && ai.plan !== "none" ? [{ label: B("Odelia allowance", "Odelia 额度"), sub: aiSub,
                right: <span className="aimeter" aria-label={`${ai.used_pct}%`}><i style={{ width: `${ai.used_pct}%` }} className={ai.used_pct >= 100 ? "full" : ai.used_pct >= (ai.saver_at_pct ?? 60) ? "near" : ""} /></span> },
                ...(cloud?.owner && (ai.plan === "monthly" || ai.plan === "entry" || ai.plan === "comped") ? [{ label: B("Odelia packs", "Odelia 加量包"), sub: b(B("More allowance on top of your plan. It carries over until it's used.", "在方案之外增加额度，长期有效直到用完。")),
                  right: <Btn guard onClick={() => void cloud.buyPack()}>{lang === "zh" ? "购买加量包" : "Add a pack"}</Btn> }] : [])] : []),
            ]} />

          {show("contract") && <ContractGroup />}
          {show("modules") && <ModulesGroup />}
          {show("filingcap") && <FilingCapGroup />}

          {show("integrations") && <Integrations />}
          {show("logins") && <Logins />}

          <Group id="agent" hidden={!show("agent")} title={B("Agent and voice", "助理与语音")} rows={[
            { label: mode === "server" ? B("Live", "实时") : mode === "claude" ? B("Live through your Claude account", "通过您的 Claude 账户实时运行") : mode === "api" ? B(`Live: Claude API (${apiName})`, `实时：Claude API（${apiName}）`) : B("Demo answers", "演示回答"),
              sub: mode === "server" ? b(B("Researches official agency pages and cites them. Answers are short; nothing is filed without you.", "查阅机构官方页面并注明出处。回答简短，未经您批准不会提交任何内容。")) : mode === "demo" ? b(B("Scripted replies for the sample workspace.", "示例工作区的脚本回复。")) : undefined },
            ...(mode !== "demo" ? [{ label: B("Think longer on hard questions", "复杂问题多思考一会儿"), sub: t("deepNote"), right: <label className="switch"><input type="checkbox" checked={deep} onChange={e => setDeep(e.target.checked)} /><i /></label> }] : []),
            { label: B("Read every reply aloud", "朗读每一条回复"), sub: b(B("Voice messages are always answered aloud.", "语音消息始终会语音回复。")), right: <label className="switch"><input type="checkbox" checked={voiceOn} onChange={e => setVoiceOn(e.target.checked)} /><i /></label> },
            ...(mode === "api" ? [{ label: B("Anthropic API key", "Anthropic API 密钥"), right: <Btn onClick={dropKey}>{t("key_drop")}</Btn> }] : []),
          ]}>
            {mode === "demo" && !cloud && (
              <form className="sg-form keyform" onSubmit={e => { e.preventDefault(); if (key.trim()) { applyKey(key.trim(), id, remember); setKey(""); } }}>
                <input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={`${t("key_label")}: sk-ant-...`} aria-label={t("key_label")} />
                <Select value={id} onChange={e => setId(e.target.value)} aria-label={t("key_model")}>{API_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>
                <label className="check"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /><span>{t("key_remember")}</span></label>
                <div className="sg-form-act"><button type="submit" className="sbtn ink" disabled={!key.trim()}>{t("key_use")}</button></div>
                <p className="sg-note">{t("key_note")}</p>
              </form>
            )}
          </Group>

          {/* Owner controls (src/OwnerRules.tsx): how much Odelia does on her own, with its rules, and business rules */}
          {show("autonomy") && <AutonomyGroup />}
          {show("brules") && <BusinessRulesGroup />}
          {show("phone") && <PhoneGroup />}
          <Group id="approvals" hidden={!show("approvals")} title={B("Approvals", "批准")} note={B("Placetta prepares on its own. It never files, buys, pays or sends without your approval, and that can't be turned off.", "快哉会自行准备材料，但未经您批准绝不提交、购买、付款或发送，此项无法关闭。")}
            rows={[B("Every filing with a government agency", "向政府机构提交的每一项申请"), B("Every payment", "每一笔付款"), B("Every message sent for you, unless an Always allow rule you set covers it", "代您发送的每一条消息（您设置的“始终允许”规则除外）")].map(l => ({ label: l, right: <em className="lock">{t("alwaysOn")}</em> }))} />
          {show("spending") && <SpendingGroup />}
          {show("memory") && <MemoryGroup />}
          {/* Agent memory (src/AgentMemory.tsx): what Odelia keeps about the business, opt-in, with every control */}
          {show("agentmemory") && <AgentMemoryGroup db={memoryDb} />}
          {show("skills") && <SkillsGroup />}

          <Group id="appearance" hidden={!show("appearance")} title={B("Appearance", "外观")} note={B("Dark mode for the agent and your workspace. Saved in this browser.", "为助理和工作区开启深色模式，保存在此浏览器中。")} rows={([
            ["light", B("Light", "浅色")], ["dark", B("Dark", "深色")], ["system", B("Match this device", "跟随设备")],
          ] as [Theme, Bi][]).map(([k, l]) => ({ label: l, pick: () => setTheme(k), right: <label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="theme" checked={theme === k} onChange={() => setTheme(k)} aria-label={b(l)} /><i /></label> }))}>
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

          {show("language") && <LanguageGroup />}

          <Group id="data" hidden={!show("data")} title={B("Data controls", "数据管理")} note={B("Your data is yours. Placetta doesn't sell it or use it to train AI models.", "您的数据属于您。快哉不会出售数据，也不会用它训练 AI 模型。")} rows={[
            { label: B("Download your workspace data", "下载工作区数据"), sub: b(B("Applications, facts, deadlines, filings and the audit trail, as JSON", "申请、资料、截止日期、申报和审计记录（JSON）")), right: <Btn guard onClick={() => (cloud ? cloud.exportData() : exportAudit())}>{lang === "zh" ? "下载" : "Download"}</Btn> },
            { label: B("Export the audit trail", "导出审计记录"), sub: cloud ? b(B("Every entry, as CSV. Owners and admins; the export is recorded in the trail too.", "全部记录（CSV）。所有者和管理员可导出，导出本身也会记入审计记录。")) : "CSV",
              right: !cloud || cloud.admin ? <Btn guard onClick={exportAudit}>{lang === "zh" ? "导出" : "Export"}</Btn> : <em className="lock">{lang === "zh" ? "由所有者和管理员导出" : "Owners and admins"}</em> },
            { label: B("Trust and security", "信任与安全"), sub: b(B("How we protect your data, and every company that processes it", "我们如何保护您的数据，以及处理数据的每一家公司")), right: <a className="sbtn quiet" href={api.PREVIEW ? "https://placetta.com/trust" : "/trust"} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "打开" : "Open"}</a> },
            ...(cloud ? [{ label: B("Delete your account", "删除账户"), sub: b(B("Deletes your account and the workspaces you own alone, except records the law requires us to keep.", "删除您的账户和您单独拥有的工作区，法律要求保留的记录除外。")), right: <Btn kind="warm" guard onClick={() => setDel(true)}>{b(B("Delete my account", "删除我的账户"))}</Btn> }] : []),
          ]}>
            {del && <DeleteAccount onClose={() => setDel(false)} />}
          </Group>

          <Group id="help" hidden={!show("help")} title={B("Help", "帮助")} rows={[
            { label: B("Take the tour", "查看导览"), sub: b(B("Three cards: how Odelia works, in one minute", "三张卡片，一分钟了解 Odelia")), right: <Btn onClick={() => replayTour()}>{lang === "zh" ? "开始" : "Start"}</Btn> },
            { label: B("Help Center", "帮助中心"), sub: b(B("Guides for every part of Placetta", "快哉各项功能的使用指南")), right: <a className="sbtn quiet" href={api.PREVIEW ? "https://placetta.com/help/" : "/help/"} target="_blank" rel="noopener noreferrer">{lang === "zh" ? "打开" : "Open"}</a> },
            { label: B("Email support", "邮件支持"), sub: "support@placetta.com", right: <a className="sbtn quiet" href="mailto:support@placetta.com">{lang === "zh" ? "写邮件" : "Email"}</a> },
            { label: B("Report a problem", "报告问题"), right: <a className="sbtn quiet" href="mailto:support@placetta.com?subject=Problem%20report">{lang === "zh" ? "报告" : "Report"}</a> },
            { label: B("How Placetta's AI works", "快哉的 AI 如何工作"), right: <Btn onClick={() => openLegal("ai")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
          ]} />

          <Group id="legal" hidden={!show("legal")} title={B("Legal", "法律")} note={B("Replies are generated by AI and can be wrong. Nothing is filed, paid or sent without your approval.", "回复由 AI 生成，可能有误。未经您批准，不会提交、付款或发送任何内容。")} rows={[
            { label: B("Terms of Service", "服务条款"), right: <Btn onClick={() => openLegal("terms")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
            { label: B("Privacy Policy", "隐私政策"), right: <Btn onClick={() => openLegal("privacy")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
            { label: B("Filing Authorization", "申报授权书"), sub: cloud ? b(B("You gave it when you created this workspace", "您在创建工作区时已授权")) : undefined, right: <Btn onClick={() => openLegal("authorization")}>{lang === "zh" ? "阅读" : "Read"}</Btn> },
          ]} />
          <Footer full />
        </div>
      </div>
      {prompt && <PinPrompt title={prompt.title} action={prompt.action} onClose={() => setPrompt(null)} onDone={st => { setPinSt(st); setNow(new Date().toISOString()); const then = prompt.then; setPrompt(null); if (then) setTimeout(then, 0); }} />}
    </div>
    </PinLock.Provider>
  );
}

/* ---------------------------------- spending ---------------------------------- */

const SPEND_STATUS: Record<Purchase["status"], Bi> = {
  asked: B("Waiting for approval", "等待批准"), approved: B("Approved, to pay", "已批准，待付款"), paid: B("Paid", "已付款"),
  declined: B("Declined", "已拒绝"), blocked: B("Outside the rules", "超出规则"), failed: B("Failed", "失败"), canceled: B("Canceled", "已取消"),
};
const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** What Odelia may ask to buy, from whom, how much, the budgets, and every purchase. Owners change it; nothing is ever
 *  paid without an owner's approval, and the payment is made on the payee's own page. */
function SpendingGroup() {
  const { lang, ws, editWs, say, cloud } = useApp();
  const zh = lang === "zh", tx = (b: Bi) => b[lang];
  const [server, setServer] = useState<api.SpendState | null>(null);
  const [loaded, setLoaded] = useState(!cloud);
  const [draft, setDraft] = useState<SpendPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (cloud) void api.spendGet(cloud.wsId).then(s => { setServer(s); setLoaded(true); }); }, [cloud]);
  const saved = cloud ? server?.policy ?? DEFAULT_POLICY : ws.spend?.policy ?? DEFAULT_POLICY;
  const policy = draft ?? saved;
  const purchases = cloud ? server?.purchases ?? [] : ws.spend?.purchases ?? [];
  const canEdit = !cloud || cloud.owner;
  const set = (p: Partial<SpendPolicy>) => setDraft({ ...policy, ...p });
  const problems = policyProblems(policy);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async () => {
    if (problems.length) { say(problems.map(tx).join(" ")); return; }
    setSaving(true);
    try {
      if (cloud) { await api.spend(cloud.wsId, "set_policy", { policy }); setServer(await api.spendGet(cloud.wsId)); }
      else editWs(w => ({ ...w, spend: { purchases: w.spend?.purchases ?? [], policy } }));
      setDraft(null); say(zh ? "已保存。" : "Saved.");
    } catch (e) { say((e as api.ApiError).message); }
    setSaving(false);
  };
  const act = async (p: Purchase, action: "decline" | "cancel") => {
    if (!cloud) { editWs(w => ({ ...w, spend: w.spend && { ...w.spend, purchases: w.spend.purchases.map(x => x.id === p.id ? { ...x, status: action === "decline" ? "declined" as const : "canceled" as const } : x) }, approvals: w.approvals.filter(a => a.purchase !== p.id) })); return; }
    try { await (action === "decline" ? api.spend(cloud.wsId, "decide", { id: p.id, approve: false }) : api.spend(cloud.wsId, "cancel", { id: p.id })); setServer(await api.spendGet(cloud.wsId)); }
    catch (e) { say((e as api.ApiError).message); }
  };
  const suggest = () => {
    const s = suggestBudgets((ws.stores ?? []).map(st => ({ id: st.id, name: st.name, apps: ws.apps.filter(a => st.apps?.includes(a.id)) })));
    if (!s.length) { say(zh ? "门店的申请还没有列出机构费用，暂时无法建议预算。" : "No store's applications list agency fees yet, so there's nothing to base a budget on."); return; }
    set({ budgets: [...policy.budgets.filter(b => !s.some(x => x.store && x.store === b.store && x.period === "opening")), ...s] });
  };
  const spent = (b: Budget) => spentIn(b, purchases);
  const num = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d.]/g, "")) || 0));
  if (!loaded) return <Group id="spending" title={B("Spending", "支出")} note={B("Loading…", "加载中…")} />;
  return (
    <Group id="spending" title={B("Spending", "支出")} note={B("What Odelia may ask to buy for the business, from whom, how much, and from which budget. Every purchase waits for an owner's approval (two owners above the two-person amount); you then pay it on the payee's own page and Odelia records it with its receipt. Placetta never holds or moves your money.", "Odelia 可为企业申请购买什么、向谁购买、金额上限以及使用哪项预算。每笔购买都需所有者批准（超过双人审批金额需两位所有者）；批准后您在对方页面付款，Odelia 记录付款及收据。快哉从不持有或转移您的资金。")}>
      <ul className="sg-list">
        <li className="sg-row"><span className="sg-tx"><b>{zh ? "允许 Odelia 申请购买" : "Let Odelia ask to buy things"}</b><small>{zh ? "关闭后，她不会提出任何购买。" : "Off: she never asks to buy anything."}</small></span>
          <span className="sg-r">{canEdit ? <Toggle on={policy.on} set={v => set({ on: v })} label={zh ? "允许申请购买" : "Allow purchase requests"} /> : <em>{policy.on ? (zh ? "开" : "On") : (zh ? "关" : "Off")}</em>}</span></li>
      </ul>
      <div className="sg-sub">
        <h3>{zh ? "可以购买的类别" : "What she may ask to buy"}</h3>
        <ul className="sg-list">{SPEND_CATEGORIES.map(c => (
          <li key={c.id} className="sg-row">
            <span className="sg-tx"><b>{tx(c.label)}</b><small>{tx(c.hint)}</small></span>
            <span className="sg-r"><Toggle on={policy.allowed.includes(c.id)} disabled={!canEdit} set={v => set({ allowed: v ? [...policy.allowed, c.id] : policy.allowed.filter(x => x !== c.id) })} label={tx(c.label)} /></span>
          </li>
        ))}</ul>
      </div>
      <div className="sg-sub">
        <h3>{zh ? "收款方" : "Who may be paid"}</h3>
        <ul className="sg-list" role="radiogroup" aria-label={zh ? "收款方" : "Who may be paid"}>
          {([["government", B("Government agencies only", "仅限政府机构")], ["listed", B("Agencies, plus the payees listed below", "政府机构及下列收款方")], ["any", B("Anyone, except the blocked list", "任何收款方（禁止名单除外）")]] as [SpendPolicy["payees"], Bi][]).map(([k, l]) => (
            <li key={k} className={"sg-row" + (canEdit ? " pick" : "")} onClick={() => { if (canEdit) set({ payees: k }); }}>
              <span className="sg-tx"><b>{tx(l)}</b></span>
              <span className="sg-r"><label className="radio" onClick={e => e.stopPropagation()}><input type="radio" name="spend-payees" disabled={!canEdit} checked={policy.payees === k} onChange={() => set({ payees: k })} aria-label={tx(l)} /><i /></label></span>
            </li>
          ))}
        </ul>
        <label className="spend-field">{zh ? "允许的收款方（名称或网址，每行一个）" : "Allowed payees (name or web address, one per line)"}<textarea rows={2} disabled={!canEdit} value={policy.listed.join("\n")} onChange={e => set({ listed: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} placeholder="usps.com" /></label>
        <label className="spend-field">{zh ? "禁止的收款方（每行一个）" : "Never pay (one per line)"}<textarea rows={2} disabled={!canEdit} value={policy.blocked.join("\n")} onChange={e => set({ blocked: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></label>
      </div>
      <div className="sg-sub">
        <h3>{zh ? "金额上限" : "Limits"}</h3>
        <ul className="sg-list">
          <li className="sg-row"><label className="sg-tx" htmlFor="spend-per"><b>{zh ? "单笔最高（美元）" : "Most for one purchase (USD)"}</b></label>
            <span className="sg-r"><input id="spend-per" className="sg-num" inputMode="decimal" disabled={!canEdit} value={policy.perPurchase} onChange={e => set({ perPurchase: num(e.target.value) })} /></span></li>
          <li className="sg-row"><label className="sg-tx" htmlFor="spend-second"><b>{zh ? "超过此金额需两位所有者批准（美元）" : "Two owners approve above (USD)"}</b></label>
            <span className="sg-r"><input id="spend-second" className="sg-num" inputMode="decimal" disabled={!canEdit} value={policy.secondOver ?? ""} placeholder={zh ? "不需要" : "Never"} onChange={e => set({ secondOver: e.target.value.trim() ? num(e.target.value) : undefined })} /></span></li>
        </ul>
      </div>
      <div className="sg-sub spend-bud">
        <h3>{zh ? "预算" : "Budgets"}</h3>
        <p className="sg-note">{zh ? "购买会计入它所属的每一项预算；任何一项超支都会被拒绝。" : "A purchase counts against every budget it falls under; going over any one of them refuses it."}</p>
        {policy.budgets.length > 0 && (
          <table className="memt spend-b">
            <thead><tr><th>{zh ? "适用范围" : "For"}</th><th>{zh ? "类别" : "Kind"}</th><th>{zh ? "周期" : "Period"}</th><th>{zh ? "金额" : "Amount"}</th><th>{zh ? "已用" : "Used"}</th><th><span className="sr">{zh ? "删除" : "Remove"}</span></th></tr></thead>
            <tbody>{policy.budgets.map((bg, n) => {
              const upd = (p: Partial<Budget>) => set({ budgets: policy.budgets.map((x, m) => (m === n ? { ...x, ...p } : x)) });
              return (
                <tr key={bg.id}>
                  <td data-label={zh ? "适用范围" : "For"}><Select sz="sm" disabled={!canEdit} value={bg.store ?? ""} onChange={e => upd({ store: e.target.value || undefined })} aria-label={zh ? "适用范围" : "For"}>
                    <option value="">{zh ? "整个企业" : "Whole business"}</option>{(ws.stores ?? []).map(s => <option key={s.id} value={s.id}>{tx(s.name)}</option>)}</Select></td>
                  <td data-label={zh ? "类别" : "Kind"}><Select sz="sm" disabled={!canEdit} value={bg.category ?? ""} onChange={e => upd({ category: (e.target.value || undefined) as SpendCategory | undefined })} aria-label={zh ? "类别" : "Kind"}>
                    <option value="">{zh ? "全部" : "Everything"}</option>{SPEND_CATEGORIES.map(c => <option key={c.id} value={c.id}>{tx(c.label)}</option>)}</Select></td>
                  <td data-label={zh ? "周期" : "Period"}><Select sz="sm" disabled={!canEdit} value={bg.period} onChange={e => upd({ period: e.target.value as Budget["period"] })} aria-label={zh ? "周期" : "Period"}>
                    <option value="month">{zh ? "每月" : "Each month"}</option><option value="opening">{zh ? "至开业" : "Until it opens"}</option><option value="total">{zh ? "总计" : "In total"}</option></Select></td>
                  <td data-label={zh ? "金额" : "Amount"}><input inputMode="decimal" disabled={!canEdit} value={bg.amount} onChange={e => upd({ amount: num(e.target.value) })} aria-label={zh ? "金额" : "Amount"} /></td>
                  <td className="when" data-label={zh ? "已用" : "Used"}>{usd(spent(bg))}{bg.by === "agent" && <small>{zh ? "，Odelia 建议" : ", suggested by Odelia"}</small>}</td>
                  <td className="acts">{canEdit && <button type="button" className="sbtn quiet" aria-label={zh ? "删除预算" : "Remove budget"} onClick={() => set({ budgets: policy.budgets.filter((_, m) => m !== n) })}><I.x /></button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {canEdit && <div className="sg-form-act">
          <button type="button" className="sbtn" onClick={() => set({ budgets: [...policy.budgets, { id: `b-${Date.now().toString(36)}`, period: "month", amount: 500, by: "you" }] })}>{zh ? "添加预算" : "Add a budget"}</button>
          <button type="button" className="sbtn" onClick={suggest}>{zh ? "让 Odelia 按开店计划建议" : "Let Odelia suggest from the opening plan"}</button>
        </div>}
      </div>
      {canEdit && (dirty || problems.length > 0) && (
        <div className="sg-form-act">
          {problems.length > 0 && <p className="sg-note warn">{problems.map(tx).join(" ")}</p>}
          <button type="button" className="sbtn" onClick={() => setDraft(null)} disabled={!dirty}>{zh ? "放弃更改" : "Discard"}</button>
          <button type="button" className="sbtn ink" onClick={() => void save()} disabled={saving || !dirty || problems.length > 0}>{saving ? "…" : zh ? "保存" : "Save"}</button>
        </div>
      )}
      {!canEdit && <p className="sg-note">{zh ? "只有所有者可以修改支出规则。" : "Only an owner can change the spending rules."}</p>}
      <div className="sg-sub spend-bud">
        <h3>{zh ? "购买记录" : "Purchases"}</h3>
        {!purchases.length ? <p className="sg-empty">{zh ? "还没有购买。Odelia 申请的每一笔都会列在这里，包括被规则拦下的。" : "None yet. Every purchase Odelia asks for shows here, including any the rules stopped."}</p> : (
          <table className="memt spend-p">
            <thead><tr><th>{zh ? "日期" : "Date"}</th><th>{zh ? "收款方" : "Payee"}</th><th>{zh ? "用途" : "For"}</th><th>{zh ? "金额" : "Amount"}</th><th>{zh ? "状态" : "Status"}</th><th><span className="sr">{zh ? "操作" : "Actions"}</span></th></tr></thead>
            <tbody>{purchases.map(p => (
              <tr key={p.id} className={p.status === "blocked" || p.status === "declined" || p.status === "canceled" ? "off" : ""}>
                <td className="when" data-label={zh ? "日期" : "Date"}>{fmtDay(p.at, lang, true)}</td>
                <td data-label={zh ? "收款方" : "Payee"}>{p.payeeUrl ? <a href={p.payeeUrl} target="_blank" rel="noopener noreferrer">{p.payee}</a> : p.payee}</td>
                <td data-label={zh ? "用途" : "For"}>{tx(p.why)}{p.status === "blocked" && p.reasons?.length ? <small>{p.reasons.map(tx).join(" ")}</small> : null}</td>
                <td data-label={zh ? "金额" : "Amount"}>{usd(p.amount)}</td>
                <td data-label={zh ? "状态" : "Status"}>{tx(SPEND_STATUS[p.status])}</td>
                <td className="acts">{canEdit && p.status === "asked" && <button type="button" className="sbtn quiet" onClick={() => void act(p, "decline")}>{zh ? "拒绝" : "Decline"}</button>}
                  {canEdit && p.status === "approved" && <button type="button" className="sbtn quiet" onClick={() => void act(p, "cancel")}>{zh ? "取消" : "Cancel"}</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </Group>
  );
}
