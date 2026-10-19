import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { speakTag } from "./langs";
import { audit, demoAgent, dropApproval, setApp, setFact, setField, type AgentBackend, type AgentEvent, type Reply, type Request, type Step } from "./agent";
import { blockersSay, confirmChange, readyToFile } from "./core";
import { emptyBook } from "./memory";
import { chipsOf, keepRecall, recallFrom, SAMPLE_ME } from "./recall";
import { AgentPanel } from "./AgentPanel";
import { Composer } from "./Composer";
import { AgentBot } from "./Bot";
import { HOLD_MINUTES, startHold } from "./hold";
import { reconcile } from "./jobs";
import { TABS, hrefOf, plainClick, readRoute, setRoute } from "./route";
import { AppCtx, type CloudCtx, type Ctx, type OdeliaTab, type PermitsTab, type Signed, type Tab, type View } from "./ctx";
import { formById } from "./forms/registry";
import { canFill } from "./forms/canFill";
import { appPdf, fillForm, stampSignature } from "./forms/fill";
import { readBack } from "./forms/readback";
import { answersHash, fieldsOf, fileable, formName, latestVersion, needsForm, problemLine, problemsOf, refreshForms, TYPING_MS, type FilledCopy } from "./forms/versions";
import { ApproveModal, AppDrawer } from "./Drawer";
import { INITIAL_FEED, type FeedItem, type Turn } from "./feed";
import { API_MODELS, PERMANENT, apiModel, claudeModel, liveAgent, serverModel, type Model, type Services, type Turn as Msg } from "./live";
import { applicationPdf, auditCsv, docBlob, downloads, saveFile } from "./files";
import { applyAccent, saveTheme, unlockAudio, useNarrow, useSpeak } from "./hooks";
import { S, fmt, type Key, type Lang } from "./i18n";
import { Logo, Mark } from "./Logo";
import { SAMPLE_WS } from "./sample";
import { B, same, type Application, type Approval, type Bi, type Doc, type LicenseHit, type UpdateItem, type Workspace } from "./model";
import { FindLicenses, Overview, PageHead, Permits, Tabs, UpdatesPage } from "./pages";
import { Settings } from "./Settings";
import { Stores } from "./Stores";
import { WorkPage } from "./Work";
import { ReplayDrawer } from "./Watch";
import { inChat, keepRun } from "./replay";
import { PlaybooksPage } from "./Playbooks";
import { CommandBar, useCommandKey } from "./CommandBar";
import { Walkthrough } from "./Walkthrough";
import { Headquarters } from "./Headquarters";
import { LegalReader } from "./Legal";
import { UPDATED } from "./legal";
import { daysFromNow, daysUntil, inDays, nowIso } from "./time";
import { preflight } from "./smart";
import { I, Menu, Modal } from "./ui";
import * as api from "./cloud/api";
import { DEFAULT_POLICY, decide, type Purchase } from "./spend.ts";
import { runApproved, type McpTool } from "./mcp";
import { normalize, withServer, type CloudSession } from "./cloud/session";
import { Plans } from "./cloud/Plans";
import { Queue, QueueLocked } from "./cloud/Ops";
import { PartnerPage, usePartnerMe } from "./Partner";
/* Owner controls: Plan first, Ask me first, Always allow, business rules and Undo (src/autonomy.ts, src/rewind.ts) */
import { approvePlan, autoOk, markSecond, secondStep, workPrompt } from "./autonomy";
import { addUndo, recorder, undoTitle } from "./rewind";
import { applyHeldHere } from "./held";
import { withDemoPlan } from "./demoPlan";
import { ownerApprove } from "./cloud/owners";
/* Team review: comments, @mentions, Assigned to and the Mine filter (src/Comments.tsx, src/collab.ts) */
import { CollabCtx, useCollab } from "./Comments";

const KEY = "placetta-api-key", KEY_MODEL = "placetta-api-model";
const readKey = () => { try { return { key: localStorage.getItem(KEY) ?? "", model: localStorage.getItem(KEY_MODEL) ?? API_MODELS[0].id }; } catch { return { key: "", model: API_MODELS[0].id }; } };
const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };

const readLang = (): Lang => {
  try { const v = localStorage.getItem("placetta-lang") ?? localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
};

/* Four places, like the agents people already know how to use: Home (what needs me, what Odelia is doing, what's next),
   Permits (everything you file, with its documents and dates), Stores, and Odelia (the chat, her work, her playbooks and
   the updates inbox). Settings keeps the rest. Everything that used to be its own page still opens from one of these. */
const NAV: { v: View; k: Key; Icon: () => React.ReactElement }[] = [
  { v: "overview", k: "nav_overview", Icon: I.overview },
  { v: "permits", k: "nav_apps", Icon: I.apps },
  { v: "stores", k: "nav_stores", Icon: I.store },
  { v: "odelia", k: "nav_odelia", Icon: I.spark },
];
/* The pages that moved under tabs, for anyone who knew them as entries of their own: a folded "More" group below the
   four places (it opens when you're on one of them, and remembers open or closed per browser), and the same list in
   the phone menu. Each links to the page's new address and lights up there. */
const MORE: { id: string; v: View; sub?: string; k: Key; Icon: () => React.ReactElement }[] = [
  { id: "work", v: "odelia", sub: "work", k: "nav_work", Icon: I.queue },
  { id: "playbooks", v: "odelia", sub: "playbooks", k: "nav_playbooks", Icon: I.book },
  { id: "updates", v: "odelia", sub: "updates", k: "nav_updates", Icon: I.bell },
  { id: "documents", v: "permits", sub: "documents", k: "nav_docs", Icon: I.docs },
  { id: "deadlines", v: "permits", sub: "deadlines", k: "nav_deadlines", Icon: I.deadlines },
  { id: "find", v: "find", k: "nav_find", Icon: I.find },
  { id: "activity", v: "settings", sub: "activity", k: "nav_audit", Icon: I.audit },
  { id: "facts", v: "settings", sub: "facts", k: "nav_context", Icon: I.context },
];
const atMore = (m: (typeof MORE)[number], view: View, sub?: string) => view === m.v && (!m.sub || sub === m.sub);
const PERMITS_TABS = TABS.permits as readonly PermitsTab[], ODELIA_TABS = TABS.odelia as readonly OdeliaTab[];

/** Updates worked out from the workspace itself: due dates in the next two weeks, overdue ones and renewals in the next
 *  60 days, the same rules the server's daily monitor follows. Used for the sample, and before the monitor's first run. */
function localUpdates(w: Workspace): UpdateItem[] {
  const out: UpdateItem[] = [];
  for (const d of w.deadlines) {
    const n = daysUntil(d.date);
    const when = (en: string, zh: string) => { const e = n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`; return B(en ? `${en} ${e}` : e, (n <= 0 ? "今天" : n === 1 ? "明天" : `${n} 天后`) + zh); };
    const at = new Date(Date.now() - Math.max(0, 14 - Math.abs(n)) * 36e5).toISOString();
    if (d.kind === "renewal" && n >= 0 && n <= 60) out.push({ id: "lu-" + d.id, kind: "renewal", title: B(`${d.title.en}: ${when("expires", "到期").en}`, `${d.title.zh}：${when("expires", "到期").zh}`), body: B(`Expires ${d.date}.`, `${d.date} 到期。`), app: d.app, at, read: false, prompt: B(`Start the renewal: ${d.title.en}, expiring ${d.date}.`, `开始续办：${d.title.zh}，${d.date} 到期。`) });
    else if (d.kind !== "renewal" && n >= 0 && n <= 14) out.push({ id: "lu-" + d.id, kind: "deadline", title: B(`${d.title.en}: ${when(d.kind === "due" ? "due" : "", d.kind === "due" ? "截止" : "").en}`, `${d.title.zh}：${when(d.kind === "due" ? "due" : "", d.kind === "due" ? "截止" : "").zh}`), body: B(`Date: ${d.date}.`, `日期：${d.date}。`), app: d.app, at, read: false, prompt: d.prompt ?? B(`Get this done before ${d.date}: ${d.title.en}.`, `在 ${d.date} 前完成：${d.title.zh}。`) });
    else if (d.kind === "due" && n < 0 && n >= -30) out.push({ id: "lu-" + d.id, kind: "deadline", title: B(`Overdue: ${d.title.en}`, `已逾期：${d.title.zh}`), body: B(`It was due ${d.date}.`, `截止日期为 ${d.date}。`), app: d.app, at, read: false, prompt: B(`This is overdue: ${d.title.en}. What do we do now?`, `已逾期：${d.title.zh}。现在该怎么办？`) });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at));
}
/** Filing changes as they happen: the team or the agency moved a filing, so it shows in Updates right away (the daily
 *  monitor's digest says the same, by email). Mirrors the monitor's wording so the two never disagree. */
function liveFilingUpdates(fs: api.Filing[]): UpdateItem[] {
  const out: UpdateItem[] = [];
  const money = (n: number) => "$" + n.toLocaleString("en-US");
  for (const f of fs) {
    const t = B(f.title.en.replace(/^File the /, "the ").replace(/^the (.)/, (_, c: string) => c.toUpperCase()), f.title.zh.replace(/^提交/, "")), prompt = B(`Where does this stand: ${t.en}?`, `这一项进展如何：${t.zh}？`);
    const add = (k: string, at: string | null | undefined, kind: UpdateItem["kind"], title: Bi, body?: Bi) => { if (at) out.push({ id: `fl-${f.id}-${k}`, kind, title, body, app: f.app_id, at, read: false, prompt }); };
    // each step the filing has passed, at the time it happened
    if (f.status === "in_progress") add("started", f.updated_at, "filing", B(`The filing team started: ${t.en}`, `申报团队已开始办理：${t.zh}`));
    if (f.status === "needs_info") add("needs-" + f.updated_at.slice(0, 16), f.updated_at, f.payment_url ? "payment" : "filing", B(`Action needed: ${t.en}`, `需要您处理：${t.zh}`),
      f.payment_url ? B(`The agency fee${f.fee_paid ? ` (${money(f.fee_paid)})` : ""} is ready to pay.`, `机构费用${f.fee_paid ? `（${money(f.fee_paid)}）` : ""}可以支付了。`) : f.note ? same(f.note) : undefined);
    add("submitted", f.submitted_at, "filing", B(`Submitted to the agency: ${t.en}`, `已提交至机构：${t.zh}`), f.confirmation_number ? B(`Confirmation ${f.confirmation_number}.`, `确认号 ${f.confirmation_number}。`) : undefined);
    if (f.status === "accepted") add("accepted", f.decided_at ?? f.updated_at, "filing", B(`Approved by the agency: ${t.en}`, `机构已批准：${t.zh}`), B("The approval is in Documents when the agency sends it.", "机构发来批准文件后会放在“文件”中。"));
    if (f.status === "rejected") add("rejected", f.decided_at ?? f.updated_at, "filing", B(`Returned by the agency: ${t.en}`, `被机构退回：${t.zh}`), f.note ? same(f.note) : B("The team will tell you what to fix.", "团队会告诉您需要修改什么。"));
  }
  return out;
}
const askFor = (u: { kind: UpdateItem["kind"]; title: Bi }): Bi => ({
  renewal: B(`Start this renewal: ${u.title.en}`, `开始续办：${u.title.zh}`),
  deadline: B(`Get this done: ${u.title.en}`, `完成这项：${u.title.zh}`),
  payment: B(`Help me pay this agency fee: ${u.title.en}`, `帮我支付这笔机构费用：${u.title.zh}`),
  filing: B(`What's the status and the next step: ${u.title.en}`, `进展和下一步是什么：${u.title.zh}`),
  team: B(`Tell me more: ${u.title.en}`, `详细说说：${u.title.zh}`),
  mail: B(`Read this reply and tell me what to do next: ${u.title.en}`, `读一下这封回复，告诉我下一步怎么做：${u.title.zh}`),
  purchase: B(`What's this purchase and what happens next: ${u.title.en}`, `这笔购买是什么，接下来怎么办：${u.title.zh}`),
  mention: B(`What does this comment need from me: ${u.title.en}`, `这条评论需要我做什么：${u.title.zh}`),
})[u.kind];

const PLAN_LABEL: Record<string, Bi> = {
  starter: B("Starter plan", "入门版"), growth: B("Growth plan", "成长版"), scale: B("Scale plan", "规模版"), locations: B("Essentials, per location", "基础版（按门店）"), pro: B("Pro, per location", "专业版（按门店）"),
};

export default function App({ cloud }: { cloud?: CloudSession }) {
  /* language */
  const [lang, setLang] = useState<Lang>(readLang);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => (v ? fmt(S[k][lang], v) : S[k][lang]), [lang]);
  const b = useCallback((x: Bi) => x[lang], [lang]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("placetta-lang", lang); localStorage.setItem("placetta-agent-lang", lang); } catch { /* storage blocked */ }
  }, [lang]);

  /* layout */
  const wide = !useNarrow(1200);
  const phone = useNarrow(860);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef(false);
  useEffect(() => { panelRef.current = panelOpen; }, [panelOpen]);
  const [navOpen, setNavOpen] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  useCommandKey(setCmdk);
  // the side menu folds down to icons on wider screens; remembered per browser
  const [slimPref, setSlimPref] = useState(() => readFlag("placetta-side-slim"));
  useEffect(() => writeFlag("placetta-side-slim", slimPref), [slimPref]);
  const [view, setView] = useState<View>(() => readRoute().view);
  // the tab open on Permits or Odelia (and the category asked of Settings), from the address
  const [sub, setSub] = useState<string | undefined>(() => readRoute().sub);
  // Settings keeps its own category and tells us which one is showing, so the More group lights the right row
  useLayoutEffect(() => {
    const on = (e: Event) => setSub((e as CustomEvent<string>).detail);
    addEventListener("placetta:settings-at", on);
    return () => removeEventListener("placetta:settings-at", on);
  }, []);
  // the More group below the four places: remembered per browser, and open whenever you're on one of its pages
  const [moreOpen, setMoreOpen] = useState(() => readFlag("placetta-side-more"));
  useEffect(() => writeFlag("placetta-side-more", moreOpen), [moreOpen]);
  useEffect(() => { if (MORE.some(m => atMore(m, view, sub))) setMoreOpen(true); }, [view, sub]);
  // Odelia's chat as a page of its own: the panel isn't shown beside or over it, the page is the panel
  const chatPage = view === "odelia" && (sub ?? "chat") === "chat";
  const dock = wide && panelOpen && !chatPage;
  const [drawer, setDrawer] = useState<{ id: string; tab: Tab; edit: boolean; v?: number } | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [legal, setLegal] = useState<string | null>(null);
  const [replay, setReplay] = useState<string | null>(null);   // the job whose replay is open
  const [plans, setPlans] = useState<null | "start" | "file">(null);
  const [limitHit, setLimitHit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef(0);
  const say = useCallback((s: string) => { setToast(s); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), Math.max(2800, s.length * 55)); }, []);
  const main = useRef<HTMLElement>(null);
  const go = useCallback((v: View, s?: string) => {
    setView(v); setSub(s); setRoute(v, s); setNavOpen(false); main.current?.scrollTo({ top: 0 });
    // Settings keeps its own category state; tell it which one was asked for (by the ⌘K bar, a link, a page that moved there)
    if (v === "settings" && s) window.dispatchEvent(new CustomEvent("placetta:settings", { detail: s }));
  }, []);
  // Back and Forward move between pages and tabs; a Settings address also picks its category.
  useEffect(() => {
    const on = () => {
      const r = readRoute(); setView(r.view); setSub(r.sub); setNavOpen(false); main.current?.scrollTo({ top: 0 });
      if (r.view === "settings" && r.sub) window.dispatchEvent(new CustomEvent("placetta:settings", { detail: r.sub }));
    };
    addEventListener("popstate", on);
    return () => removeEventListener("popstate", on);
  }, []);
  // An old address (/work, /applications, /context and the rest) opens its new home, and the bar shows the new address.
  useEffect(() => { const r = readRoute(); if (r.legacy) { setRoute(r.view, r.sub, true); if (r.view === "settings" && r.sub) window.dispatchEvent(new CustomEvent("placetta:settings", { detail: r.sub })); } }, []);
  // An address for a page this account can't open (the team queue, headquarters) goes home. The sample shows its
  // brand's headquarters view (src/Headquarters.tsx), so the review table across franchisees can be seen.
  const canQueue = !!(cloud?.me.staff || cloud?.me.staff_email), canHq = !!cloud?.hq.length || !cloud;
  // a partner account (src/Partner.tsx) gets a nav entry; anyone signed in can open /app/partner to sign up
  const partnerMe = usePartnerMe(!!cloud);
  useEffect(() => {
    if ((view === "queue" && !canQueue) || (view === "hq" && !canHq)) { setView("overview"); setSub(undefined); setRoute("overview", undefined, true); }
    else if (view !== "settings") setRoute(view, sub, true);
  }, [view, sub, canQueue, canHq]);
  /** A sidebar link: a real address (open in a new tab, copy, bookmark), handled in place on a plain click. */
  const navLink = (v: View, s?: string) => ({ href: hrefOf(v, s), onClick: (e: React.MouseEvent) => { if (!plainClick(e)) return; e.preventDefault(); go(v, s); } });
  useEffect(() => { if (cloud?.notice) say(cloud.notice); }, [cloud, say]);

  /* the workspace: the sample, or the account's saved one with the server's facts laid on top */
  const [ws, setWs] = useState<Workspace>(() => (cloud ? { ...cloud.initial, audit: cloud.audit } : SAMPLE_WS));
  const [billing, setBilling] = useState(cloud?.billing ?? null);
  const [filings, setFilings] = useState(cloud?.filings ?? []);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [docs, setDocs] = useState(cloud?.docs ?? []);
  const [integrations, setIntegrations] = useState(cloud?.integrations ?? []);
  const [logins, setLogins] = useState(cloud?.logins ?? []);
  const [serverUpdates, setServerUpdates] = useState<api.UpdateRow[]>([]);
  const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
  const view_ = useMemo(() => (cloud ? withServer(ws, filings, docs, purchases) : ws), [cloud, ws, filings, docs, purchases]);
  /* Team review (src/Comments.tsx): the comments, assignments and notices of this workspace, one store for every page.
     An @mention of Odelia on a permit starts her through ask (set below, once it exists). */
  const askRef = useRef<(text: string) => void>(() => undefined);
  const collab = useCollab({ cloud, ws: view_, lang, say, editWs: setWs, ask: text => askRef.current(text) });
  const collabRef = useRef(collab);
  collabRef.current = collab;
  /* A link from one of Odelia's texts opens that exact approval (approving still happens here, in the app). */
  const linked = useRef(cloud?.approval ?? null);
  const readyLink = useRef(false);
  useEffect(() => {
    const id = linked.current; if (!id) return;
    linked.current = null;
    if (id === "ready") { readyLink.current = true; return; }   // several waiting: the one-tap card, in the panel (below)
    if (view_.approvals.some(a => a.id === id)) { go("overview"); setModal(id); }
    else say(lang === "zh" ? "这项批准已经处理过了。" : "That approval is already taken care of.");
  }, [view_.approvals, go, say, lang]);
  /* A link from one of Odelia's texts or chats to a filled form: for a member of this workspace, that form at that
     version (an expired link opens the current one and says so). */
  const formLink = useRef(cloud?.form ?? null);
  useEffect(() => {
    const token = formLink.current; if (!token || !cloud) return;
    formLink.current = null;
    void api.openFormLink(token).then(r => {
      if (r.expired) say(lang === "zh" ? "这个链接已过期。下面是最新版本。" : "That link expired. Here's the newest version.");
      go("permits"); setDrawer({ id: r.app_id, tab: "form", edit: false, v: r.expired ? undefined : r.version });
    }, (e: api.ApiError) => say((lang === "zh" && e.message_zh) || e.message));
  }, [cloud, go, say, lang]);
  const wsRef = useRef(view_);
  useEffect(() => { wsRef.current = view_; }, [view_]);
  const plan = cloud ? api.planOf(billing) : "monthly";

  const [feed, setFeed] = useState<FeedItem[]>(cloud ? [] : INITIAL_FEED);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [step, setStep] = useState<Step | null>(null);
  const [uploading, setUploading] = useState<{ app: string; item: string } | null>(null);
  const [match, setMatch] = useState<{ what: string; where: string; hits: LicenseHit[] } | null>(null);
  const [matching, setMatching] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  const nextId = useRef(100);
  const nid = () => nextId.current++;
  const [voiceOn, setVoiceOn] = useState(() => readFlag("placetta-voice-all"));
  useEffect(() => writeFlag("placetta-voice-all", voiceOn), [voiceOn]);
  const tts = useSpeak(cloud ? (text, l) => api.ttsAudio(cloud.wsId, text, l) : undefined);
  const kept = useRef(new Map<string, File>());    // files you uploaded this session, so they download as themselves
  const paths = useRef(new Map<string, string>()); // ...and where they're stored in the account
  useEffect(() => { void downloads(); }, []);

  /* account: save the workspace, log the audit trail, keep filings, files and billing fresh */
  const synced = useRef(new Set((cloud?.audit ?? []).map(a => a.id)));
  const serverRun = useRef<string | null>(null);
  // runs that split work across stores, while their stores' bots work on the server (watchFamily)
  const families = useRef(new Set<string>());
  const saveT = useRef(0);
  const lastSaved = useRef("");
  useEffect(() => {
    if (!cloud) return;
    clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      if (serverRun.current || families.current.size) return;   // the agent is saving on the server; take its result when it's done
      const body = JSON.stringify(api.strip(ws));
      if (body !== lastSaved.current) { lastSaved.current = body; api.saveState(cloud.wsId, ws).catch(() => { lastSaved.current = ""; say(lang === "zh" ? "保存失败，稍后会重试。" : "Couldn't save. It will retry."); }); }
      const fresh = ws.audit.filter(a => !synced.current.has(a.id) && (a.actor === "you" || a.actor === "agent"));
      if (fresh.length) { fresh.forEach(a => synced.current.add(a.id)); api.logAudit(cloud.wsId, cloud.me.id, fresh).catch(() => fresh.forEach(a => synced.current.delete(a.id))); }
    }, 900);
  }, [cloud, ws, say, lang]);

  const refresh = useCallback(async (all = false) => {
    if (!cloud) return;
    try {
      const [f, d, bl, au, up] = await Promise.all([api.listFilings(cloud.wsId), api.listDocs(cloud.wsId), api.getBilling(cloud.wsId), api.listAudit(cloud.wsId), api.listUpdates(cloud.wsId).catch(() => null)]);
      setFilings(f); setDocs(d); setBilling(bl); if (up) setServerUpdates(up);
      void api.spendGet(cloud.wsId).then(sp => { if (sp) setPurchases(sp.purchases); });
      setWs(w => { const server = new Set(au.map(a => a.id)); au.forEach(a => synced.current.add(a.id)); return { ...w, audit: [...w.audit.filter(a => !server.has(a.id) && !synced.current.has(a.id)), ...au] }; });
      if (all) { const [i, l] = await Promise.all([api.listIntegrations(cloud.wsId), api.listLogins(cloud.wsId)]); setIntegrations(i); setLogins(l); }
    } catch { /* offline: try again next tick */ }
  }, [cloud]);
  useEffect(() => {
    if (!cloud) return;
    const load = () => { if (document.visibilityState === "visible") void api.listUpdates(cloud.wsId).then(setServerUpdates, () => undefined); };
    load();
    // replies to sent email land within minutes, so the inbox refreshes while the app is open
    const t = window.setInterval(load, 120_000);
    return () => window.clearInterval(t);
  }, [cloud]);
  /* the Updates inbox: the monitor's updates in an account (worked out locally until its first run), the sample's otherwise */
  const updatesBase = useMemo<UpdateItem[]>(() => {
    const base = cloud && serverUpdates.length
      ? serverUpdates.map(u => ({ id: u.id, kind: u.kind, title: u.title, body: u.body ?? undefined, app: u.app_id ?? undefined, at: u.created_at, read: !!u.read_at, prompt: askFor(u) }))
      : localUpdates(view_).map(u => ({ ...u, read: readLocal.has(u.id) }));
    if (!cloud) return base;
    const seen = new Set(base.map(u => u.title.en));
    const live = liveFilingUpdates(filings).filter(u => !seen.has(u.title.en)).map(u => ({ ...u, read: readLocal.has(u.id) }));
    return [...live, ...base].sort((x, y) => y.at.localeCompare(x.at));
  }, [cloud, serverUpdates, view_, readLocal, filings]);
  // and this person's own: mentions, assignments and headquarters' questions (Team review)
  const updates = useMemo(() => [...collab.updates, ...updatesBase].sort((x, y) => y.at.localeCompare(x.at)), [collab.updates, updatesBase]);
  const readUpdates = useCallback(() => {
    if (!updates.some(u => !u.read)) return;
    setReadLocal(new Set(updates.map(u => u.id)));
    collabRef.current.readAll();
    if (cloud && serverUpdates.some(u => !u.read_at)) void api.readUpdates(cloud.wsId).then(() => setServerUpdates(us => us.map(u => ({ ...u, read_at: u.read_at ?? nowIso() }))), () => undefined);
  }, [updates, cloud, serverUpdates]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    if (!cloud) return;
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = window.setInterval(tick, 20_000);
    const focus = () => void refresh(true);
    window.addEventListener("focus", focus);
    return () => { clearInterval(id); window.removeEventListener("focus", focus); };
  }, [cloud, refresh]);

  /* while Placetta is filing, check every 5 seconds (faxes and letters also ask their provider) */
  const agentBusy = filings.filter(f => f.agent_state === "queued" || f.agent_state === "running");
  const busyKey = agentBusy.map(f => f.id).join(",");
  useEffect(() => {
    if (!cloud || !busyKey) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void Promise.all(busyKey.split(",").map(fid => api.filingStatus(cloud.wsId, fid).catch(() => null))).then(() => refreshRef.current());
    }, 5000);
    return () => clearInterval(id);
  }, [cloud, busyKey]);

  /* the model behind the agent: Placetta's server for an account; Claude in a viewer; the API with a key; or the demo script */
  const [model, setModel] = useState<Model | null>(null);
  const [apiName, setApiName] = useState("");
  const [deep, setDeep] = useState(false);
  const history = useRef<Msg[]>([]);
  /* Whose memory (src/recall.ts): the signed-in person, or the sample's one person, so the demo remembers too. */
  const me = cloud?.me.id ?? SAMPLE_ME;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (cloud && !api.PREVIEW) {
      const m = wsRef.current.meta, loc = m?.city ? { city: m.city, region: m.region } : undefined;
      setModel(serverModel((body, d, role, onText) => api.agentCall(cloud.wsId, body, { deep: d, location: loc, role, onText }) as never));
      return;
    }
    let on = true;
    void claudeModel().then(m => {
      if (!on) return;
      if (m) { setModel(m); return; }
      const saved = readKey();
      if (saved.key) { setModel(apiModel(saved.key, saved.model)); setApiName(API_MODELS.find(x => x.id === saved.model)?.label ?? saved.model); }
    });
    return () => { on = false; };
  }, [cloud]);
  const modelRef = useRef<Model | null>(null);
  /* The account's hands for the agent: the team's filings, connected apps and stored files (read fresh at each call). */
  const filingsRef = useRef(filings), integrationsRef = useRef(integrations);
  useEffect(() => { filingsRef.current = filings; integrationsRef.current = integrations; }, [filings, integrations]);
  const services = useMemo<Services | undefined>(() => (!cloud ? undefined : {
    filings: () => filingsRef.current,
    // the preview's "connected" apps are stand-ins with no mailbox or drive behind them
    connected: () => (api.PREVIEW ? [] : integrationsRef.current.filter(i => i.status === "connected").map(i => i.kind)),
    integration: (action, body) => api.integration(cloud.wsId, action, body),
    spend: async (action, body) => { const r = await api.spend<never>(cloud.wsId, action, body); void api.spendGet(cloud.wsId).then(sp => { if (sp) setPurchases(sp.purchases); }); return r; },
    saveFile: async (file, appId) => { const row = await api.uploadDoc(cloud.wsId, file, appId); paths.current.set(file.name, row.path); void refreshRef.current(); return { path: row.path }; },
    readFile: path => api.downloadDoc(path),
    // connected apps' own MCP servers (src/mcp.ts); none in the preview
    mcpTools: async () => (api.PREVIEW ? [] : (await api.integration<{ tools: McpTool[] }>(cloud.wsId, "mcp_tools")).tools),
    me: cloud.me.id,
    setting: (key, value) => {
      const v = value.trim().toLowerCase();
      if (key === "theme" && (v === "light" || v === "dark" || v === "system")) { saveTheme(v); return v; }
      if (key === "language" && (v === "en" || v === "zh" || v.startsWith("chin") || v.startsWith("eng"))) { const l = v.startsWith("zh") || v.startsWith("chin") ? "zh" : "en"; setLang(l); return l; }
      if (key === "accent_color") return applyAccent(v === "default" ? "" : v) || "default";
      if (key === "read_aloud") { const on = /^(on|true|yes)$/.test(v); setVoiceOn(on); return on ? "on" : "off"; }
      throw new Error("Not a setting the agent can change. Point the person to Settings.");
    },
  }), [cloud]);
  useEffect(() => { modelRef.current = model; }, [model]);

  const pushTurn = useCallback((shown: string | null, reply: Reply) => {
    setFeed(f => [...f, ...(shown ? [{ id: nid(), kind: "user" as const, text: shown }] : []), { id: nid(), kind: "turn" as const, at: nowIso(), steps: [], active: -1, reply }]);
    if (!panelRef.current) say(reply.text.map(x => x[lang]).join(" ").split(/(?<=[.!?])\s+|(?<=[。！？])/)[0]);
  }, [lang, say]);

  /* From a text about several approvals: everything waiting, in the panel, approvable with one tap. */
  useEffect(() => {
    if (!readyLink.current) return;
    readyLink.current = false;
    const ids = view_.approvals.map(a => a.id);
    if (!ids.length) { say(lang === "zh" ? "这些批准已经处理过了。" : "Those approvals are already taken care of."); return; }
    setPanelOpen(true);
    pushTurn(null, { text: [B(`${ids.length} item${ids.length === 1 ? " is" : "s are"} waiting for you. Everything that passed every check can go with one tap.`, `有 ${ids.length} 项等您处理。通过全部核对的可以一键批准。`)], approvals: ids });
  }, [view_.approvals, pushTurn, say, lang]);

  /* A run that split work across stores: while the stores' bots work on the server, Work and Home show each store as
     it moves (the workspace is taken again whenever a store's run changes), and the one summary arrives in the chat
     when the last of them is back. Changes wait meanwhile, as they do for any run on the server. */
  const watchFamily = useCallback((pid: string) => {
    if (!cloud || families.current.has(pid)) return;
    families.current.add(pid);
    void (async () => {
      let last = "";
      try {
        for (let i = 0; i < 1800; i++) {
          await new Promise(res => setTimeout(res, 4000));
          if (!families.current.has(pid)) return;   // the person stopped it: what they see stays as they left it
          if (document.visibilityState !== "visible") continue;
          const r = await api.pollRun(pid);
          const key = r.status + JSON.stringify((r.children ?? []).map(c => c.status + c.updated_at));
          if (key !== last) {
            last = key;
            const row = await api.loadWorkspace(cloud.wsId);
            const next = normalize(row.name, row.state);
            lastSaved.current = JSON.stringify(api.strip(next));
            setWs(w => ({ ...next, audit: w.audit }));
          }
          if (r.status === "done" || r.status === "failed" || r.status === "stopped") {
            if (r.status === "done" && r.reply) pushTurn(null, r.reply);
            void refreshRef.current(true);
            break;
          }
        }
      } catch { /* lost track of it: Work still shows every store */ }
      finally { families.current.delete(pid); }
    })();
  }, [cloud, pushTurn]);

  /* A task on the server: show its steps as they're saved, then take the workspace it left. */
  const follow = useCallback(async (id: string, onEvent: (e: AgentEvent) => void, signal: AbortSignal) => {
    if (!cloud) return;
    serverRun.current = id;
    try {
      let shown = 0, draft = "", r: api.RunRow;
      for (;;) {
        if (signal.aborted) { await api.stopRun(id).catch(() => undefined); throw { code: "cancelled" }; }
        r = await api.pollRun(id);
        r.steps.slice(shown).forEach((s, i) => onEvent({ type: "step", index: shown + i, step: s }));
        shown = r.steps.length;
        const moved = !!r.draft && r.draft !== draft;
        if (moved) { draft = r.draft!; onEvent({ type: "draft", text: draft }); }
        if (r.status !== "running") break;
        // while words are arriving the server saves them every 300 ms, so look as often; otherwise less
        await new Promise(res => setTimeout(res, moved ? 300 : 700));
      }
      const row = await api.loadWorkspace(cloud.wsId);
      const next = normalize(row.name, row.state);
      lastSaved.current = JSON.stringify(api.strip(next));
      setWs(w => ({ ...next, audit: w.audit }));
      void refresh(true);
      // split across stores: its answer so far now, the summary when the stores are back
      if (r.status === "waiting") { if (r.reply) onEvent({ type: "reply", reply: r.reply }); watchFamily(id); }
      else if (r.status === "done" && r.reply) onEvent({ type: "reply", reply: r.reply });
      else if (r.status === "stopped") throw { code: "cancelled" };
      else throw { code: "run_failed", message: r.error ?? "" };
    } finally { serverRun.current = null; }
  }, [cloud, refresh, watchFamily]);

  /* The agency's own form, always current (src/forms/versions.ts). Whenever an application's answers change in this
     browser (a run here, the person's own edit, the answers filled at sign-up, a document read into it, a business fact
     confirmed here), its official PDF is filled again: a new version, kept in Documents (the account's storage, or this
     browser for the sample), read back line by line. A run on the server makes its own versions. */
  const formCopies = useRef(new Map<string, FilledCopy>());
  const formsBusy = useRef(false);
  const lastFill = useRef(new Map<string, number>());
  const [formsTick, setFormsTick] = useState(0);
  const fillForms = useCallback(async (ids?: string[], by?: Bi) => {
    if (formsBusy.current) return null;
    formsBusy.current = true;
    // what this pass reads: the newest render, or what it just changed when the page hasn't drawn it yet
    let seen = wsRef.current, mine = wsRef.current;
    const get = () => { if (wsRef.current !== seen) { seen = wsRef.current; mine = seen; } return mine; };
    try {
      return await refreshForms({
        get, apply: p => { mine = p(get()); setWs(p); }, load: appPdf, ids, cache: formCopies.current, by,
        keep: async (file: File, a: Application) => {
          if (cloud && !api.PREVIEW) { const row = await api.uploadDoc(cloud.wsId, file, a.id); paths.current.set(file.name, row.path); return { path: row.path }; }
          kept.current.set(file.name, file);
        },
      });
    } catch { return null; }
    finally { formsBusy.current = false; setFormsTick(n => n + 1); }
  }, [cloud]);

  /* Memory that acts (src/recall.ts): after a run in this browser, what the person wrote is read for durable details
     (the extract role on the same model, through the same server call; the demo's own reader without a model), kept in
     their memory and acted on, and the reply shows a Remembered chip for each, one tap from Forget. */
  const recallAfter = useCallback(async (said: string, turn: number, prior?: string) => {
    const m = modelRef.current;
    const kept = await recallFrom(said, { book: wsRef.current.memories?.[me], prior, ask: m ? p => m.json(p, { signal: new AbortController().signal, role: "extract" }) : undefined });
    if (!kept.length) return;
    setWs(keepRecall(me, kept));
    setFeed(ms => ms.map(x => (x.id === turn && x.kind === "turn" && x.reply ? { ...x, reply: { ...x.reply, remembered: [...(x.reply.remembered ?? []), ...chipsOf(kept)] } } : x)));
  }, [me]);

  const run = useCallback(async (req: Request, shown: string | null, voice = false, resumeId?: string) => {
    if (busyRef.current) return;
    // The moment of value: the plan is already on screen (src/plan/preview.ts); anything that needs the model waits for a plan.
    if (cloud && plan === "none" && !("approve" in req || "approveAll" in req)) { setPlans("start"); return; }
    busyRef.current = true; setBusy(true);
    unlockAudio(); tts.stop();
    const aid = nid(), t0 = performance.now();
    setFeed(f => [...f, ...(shown ? [{ id: nid(), kind: "user" as const, text: shown }] : []), { id: aid, kind: "turn", at: nowIso(), steps: [], active: 0 }]);
    if ("text" in req) setAsked(a => [...a, req.text]);
    if ("upload" in req) setUploading({ app: req.upload.app, item: req.upload.item });
    if ("match" in req) { setMatching(true); setView("find"); setSub(undefined); }
    const upd = (f: (m: Turn) => Partial<Turn>) => setFeed(ms => ms.map(m => (m.id === aid && m.kind === "turn" ? { ...m, ...f(m) } : m)));
    let said = "";
    const ctl = new AbortController(); abort.current = ctl;
    // every moment of a run in the browser, for the replay of the jobs it worked (src/replay.ts); the chat shows the steps
    const moments: Step[] = [];
    let onServer = false, firstAt = "";
    const askedAt = nowIso();
    /* Undo (src/rewind.ts): a request worked in this browser records what it changes; a server run brings its own. */
    const rec = "text" in req ? recorder() : null, askedText = "text" in req ? req.text : "";
    const onEvent = (e: AgentEvent) => {
      if (e.type === "step") {
        moments.push(e.step.at ? e.step : { ...e.step, at: nowIso() });
        if (inChat(e.step)) { setStep(e.step); upd(m => ({ steps: [...m.steps, e.step], active: m.steps.length })); }
      }
      else if (e.type === "update") setWs(rec ? rec.wrap(e.patch) : e.patch);
      else if (e.type === "draft") { if (e.text && !firstAt) firstAt = nowIso(); upd(() => ({ draft: e.text })); }
      else {
        let r: Reply = e.reply;
        if (rec && !r.undo) { const uid = "undo-b" + Date.now().toString(36); setWs(w => addUndo({ id: uid, at: nowIso(), title: undoTitle(askedText), recs: rec.recs() })(w)); r = { ...r, undo: uid }; }
        upd(() => ({ reply: r, active: -1, ms: performance.now() - t0, draft: undefined }));
        said = r.text.map(x => x[lang]).join(" ");
        if (r.matches) setMatch(r.matches);
        // memory that acts: a run on the server reads it there (agent-run); one here reads it now (src/recall.ts)
        if ("text" in req && !onServer) void recallAfter(req.text, aid, history.current.filter(x => x.role === "assistant").at(-1)?.content);
        // timed for What Odelia did this month (src/monthly.ts); a server run is timed in agent_runs
        if ("text" in req && !onServer) { const done = nowIso(); setWs(w => ({ ...w, runs: [...(w.runs ?? []), { id: `run-${aid}-${Date.now().toString(36)}`, prompt: req.text.slice(0, 200), created_at: askedAt, first_text_at: firstAt || done, done_at: done, status: "done" }].slice(-60) })); }
        if ("text" in req && modelRef.current) history.current.push({ role: "user", content: req.text }, { role: "assistant", content: said });
        // past chats, kept per person so the agent can search them later (Settings, Memory)
        if ("text" in req && cloud && said) { const me = cloud.me.id, at = nowIso(); setWs(w => ({ ...w, chats: { ...(w.chats ?? {}), [me]: [...(w.chats?.[me] ?? []), { at, role: "you" as const, text: req.text.slice(0, 2000) }, { at, role: "agent" as const, text: said.slice(0, 2000) }].slice(-300) } })); }
      }
    };
    const m = modelRef.current;
    const agent: AgentBackend = m ? liveAgent(m, history.current, kept.current, deep, { account: !!cloud, paths: paths.current, services, fallback: demoAgent, me, comments: item => collabRef.current.forAgent(item) }) : withDemoPlan(demoAgent);
    // each application's answers before the run: the ones it changes get their form filled again when it ends
    const answersBefore = new Map(wsRef.current.apps.map(a => [a.id, answersHash(a)]));
    try {
      // In an account the agent works on the server, so it carries on if the app is closed.
      const id = resumeId ?? (cloud && !api.PREVIEW && "text" in req && m ? await api.startRun(cloud.wsId, { prompt: req.text, history: history.current.slice(-12), lang, deep }) : null);
      onServer = !!id;
      if (id) await follow(id, onEvent, ctl.signal);
      else {
        await agent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal);
        // the run happened here: the workspace keeps its moments, linked from each job it worked
        setWs(keepRun({ id: `local-${Date.now().toString(36)}`, at: askedAt, steps: moments }, askedAt));
        // and the forms it changed are filled again; the reply ends with each one (a card that opens the PDF)
        // (once the page has drawn what the run changed, and any fill already under way has finished)
        await new Promise(res => setTimeout(res, 60));
        for (let i = 0; i < 300 && formsBusy.current; i++) await new Promise(res => setTimeout(res, 100));
        const changed = wsRef.current.apps.filter(a => answersBefore.get(a.id) !== answersHash(a) && needsForm(a)).map(a => a.id);
        if (changed.length) {
          changed.forEach(id => lastFill.current.set(id, Date.now()));
          const r = await fillForms(changed);
          if (r?.notes.length) upd(t2 => (t2.reply ? { reply: { ...t2.reply, forms: r.notes, approvals: [...(t2.reply.approvals ?? []).filter(id => !r.withdrawn.includes(id)), ...r.cards.filter(id => !(t2.reply?.approvals ?? []).includes(id))] } } : {}));
        }
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ((err as Error)?.name === "AbortError" ? "cancelled" : "upstream_error");
      if (code === "cancelled") upd(m2 => ({ reply: { text: [B("Stopped.", "已停止。")] }, active: -1, steps: m2.steps }));
      else if (api.LIMITS.includes(code)) {
        // the allowance or a rate limit: say exactly why, and open the way to keep going
        const zh: Record<string, string> = {
          over_budget: "本期的 Odelia 额度已用完。购买加量包或升级方案即可继续；截止日期、提醒和已在办理的申报不受影响。",
          plan_required: "Odelia 需开通付费方案后使用。先选择方案：299 美元的开店计划可梳理一个市场的全部许可，并可全额抵扣。",
          entry_ended: "开店计划附带的 30 天 Odelia 服务已结束。升级为年度方案即可继续，开店计划费用可全额抵扣。",
          rate_limited: "一次请求太多了，请稍后再试。",
          paused: "Odelia 暂时暂停，请稍后再试。",
          task_limit: "这个任务太大，我先停在这里。请把下一部分单独交给我。",
        };
        const msg = (err as { message?: string }).message ?? "";
        upd(() => ({ reply: { text: [B(msg, zh[code] ?? msg)] }, active: -1 }));
        if (cloud && (code === "plan_required" || code === "entry_ended")) setPlans("start");
        else if (cloud && code === "over_budget") setLimitHit(true);
      }
      else if (code === "payment_required") { upd(() => ({ reply: { text: [B("Start with the entry plan and I'll map every license this business needs.", "先开通开店计划，我就为您梳理所需的全部许可。")] }, active: -1 })); setPlans("start"); }
      else if (!cloud && m && PERMANENT.includes(code)) {
        // This view can't use Claude after all: say so once and answer from the demo script.
        setModel(null); say(t("liveOff"));
        upd(() => ({ steps: [], active: 0 }));
        try { await demoAgent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal); } catch { /* stopped */ }
      } else if ((code === "busy" || code === "run_failed") && (err as { message?: string }).message) upd(() => ({ reply: { text: [same((err as { message: string }).message)] }, active: -1 }));
      else upd(() => ({ reply: { text: [code === "rate_limited" ? B("The agent is busy right now. Try again in a little while.", "助理暂时繁忙，请稍后再试。") : code === "not_configured" ? B("The agent isn't set up on the server yet. Placetta's team has been told.", "服务器端尚未配置助理，已通知快哉团队。") : B("I couldn't reach the agent just now. Try again in a moment.", "暂时无法连接助理，请稍后再试。")] }, active: -1 }));
    }
    abort.current = null;
    busyRef.current = false; setBusy(false); setStep(null); setUploading(null); setMatching(false);
    if ((voice || voiceOn) && said) tts.speak(said, speakTag(lang));
    else if (said && !panelRef.current) say(said.split(/(?<=[.!?])\s+|(?<=[。！？])/)[0]);
  }, [lang, tts, say, t, deep, cloud, plan, voiceOn, services, follow, recallAfter, me, fillForms]);

  /* Outside a run (the person typing in the sheet, the answers filled at sign-up, a document read in, a fact confirmed):
     the form is filled again once the answers settle, at most once every few seconds per application. While a run on
     the server holds the workspace, it fills them itself. */
  useEffect(() => {
    if (busy || formsBusy.current || (cloud && (serverRun.current || families.current.size))) return;
    const due = view_.apps.filter(needsForm);
    if (!due.length) return;
    const now = Date.now();
    const wait = Math.max(1200, ...due.map(a => TYPING_MS - (now - (lastFill.current.get(a.id) ?? 0))));
    const timer = window.setTimeout(() => { due.forEach(a => lastFill.current.set(a.id, Date.now())); void fillForms(due.map(a => a.id)); }, wait);
    return () => clearTimeout(timer);
  }, [view_.apps, busy, cloud, fillForms, formsTick]);

  /* Back in the app: follow a task still running on the server, or show one that finished while it was closed. */
  const resumed = useRef(false);
  useEffect(() => {
    if (!cloud || api.PREVIEW || resumed.current) return;
    resumed.current = true;
    void api.recentRuns(cloud.wsId).then(rs => {
      // a request split across stores, still waiting on them: Work shows each store as it moves
      for (const r of rs) if (r.status === "waiting") watchFamily(r.id);
      const live = rs.find(r => r.status === "running");
      if (live) { setPanelOpen(true); void run({ text: live.prompt }, live.prompt, false, live.id); return; }
      const missed = rs.find(r => r.status === "done" && r.reply && (!r.seen_at || Date.parse(r.updated_at) - Date.parse(r.seen_at) > 20_000));
      if (missed?.reply) { pushTurn(missed.prompt, missed.reply); setPanelOpen(true); void api.pollRun(missed.id).catch(() => undefined); }
    }, () => undefined);
  }, [cloud, run, pushTurn, watchFamily]);

  /* Asked while she's busy: it waits its turn, like a ticket in a queue, and starts when the current job ends. */
  const [queued, setQueued] = useState<{ id: string; text: string }[]>([]);
  const ask = useCallback((text: string, voice = false) => {
    const q = text.trim(); if (!q) return;
    if (cloud && plan === "none") { setPlans("start"); return; }
    setPanelOpen(true);
    if (busyRef.current) {
      // In an account she starts it now, beside the job she's on (up to three at once); otherwise it waits its turn.
      if (cloud && !api.PREVIEW && modelRef.current) { void alongsideRef.current(q); return; }
      setQueued(l => [...l, { id: String(nid()), text: q }]); say(lang === "zh" ? "已排队，当前任务完成后开始。" : "Queued. Odelia starts it when she finishes the current job."); return;
    }
    run({ text: q }, q, voice);
  }, [run, say, lang, cloud, plan]);   // eslint-disable-line react-hooks/exhaustive-deps
  askRef.current = ask;   // an @mention of Odelia in a comment (Team review)

  /* A job started while another runs: it works on the server on its own and shows in the chat and in Work as it goes. */
  const [, setSideJobs] = useState(0);
  const alongside = async (q: string) => {
    if (!cloud) return;
    let id: string | null = null;
    try { id = await api.startRun(cloud.wsId, { prompt: q, history: history.current.slice(-12), lang, deep }); }
    catch (e) {
      if ((e as api.ApiError).code === "busy") { setQueued(l => [...l, { id: String(nid()), text: q }]); say((e as api.ApiError).message); return; }
      say((e as api.ApiError).message ?? String(e)); return;
    }
    if (!id) return;
    const tid = nid();
    setFeed(f => [...f, { id: nid(), kind: "user" as const, text: q }, { id: tid, kind: "turn", at: nowIso(), steps: [], active: 0 }]);
    setSideJobs(n => n + 1);
    const upd = (f: (m: Turn) => Partial<Turn>) => setFeed(ms => ms.map(m => (m.id === tid && m.kind === "turn" ? { ...m, ...f(m) } : m)));
    const t0 = performance.now();
    try {
      let shown = 0, r: api.RunRow;
      for (;;) {
        r = await api.pollRun(id);
        if (r.steps.length > shown) { const add = r.steps.slice(shown).filter(inChat); shown = r.steps.length; if (add.length) upd(m => ({ steps: [...m.steps, ...add], active: m.steps.length + add.length - 1 })); }
        if (r.draft) upd(() => ({ draft: r.draft ?? undefined }));
        if (r.status !== "running") break;
        await new Promise(res => setTimeout(res, 1500));
      }
      const row = await api.loadWorkspace(cloud.wsId);
      const next = normalize(row.name, row.state);
      lastSaved.current = JSON.stringify(api.strip(next));
      setWs(w => ({ ...next, audit: w.audit }));
      void refresh(true);
      if (r.status === "waiting") watchFamily(id);
      upd(() => ({ reply: (r.status === "done" || r.status === "waiting") && r.reply ? r.reply : { text: [same(r.error ?? (lang === "zh" ? "已停止。" : "Stopped."))] }, active: -1, ms: performance.now() - t0, draft: undefined }));
    } catch { upd(() => ({ reply: { text: [B("I lost track of that job. It's still in Work.", "我暂时跟丢了这项工作，它仍在“工作”页中。")] }, active: -1 })); }
    finally { setSideJobs(n => n - 1); }
  };
  const alongsideRef = useRef(alongside);
  alongsideRef.current = alongside;

  /* The proof loop: jobs tick from what the workspace shows (an upload, an approval, a filing), never by say-so, and a
     job is done only when its done list is proven. */
  useEffect(() => { const r = reconcile(ws); if (r !== ws) setWs(r); }, [ws]);

  const unqueue = useCallback((id: string) => setQueued(l => l.filter(x => x.id !== id)), []);
  useEffect(() => {
    if (busy || !queued.length) return;
    const [next, ...rest] = queued;
    setQueued(rest);
    run({ text: next.text }, next.text);
  }, [busy, queued, run]);

  /* Owners approve, pay, connect accounts and manage billing; members do the day-to-day work. The database enforces it too. */
  const owner = !cloud || cloud.role === "owner";
  const ownerOk = useCallback(() => {
    if (owner) return true;
    say(lang === "zh" ? "只有所有者可以执行此操作。请联系团队中的所有者。" : "Only an owner can do that. Ask an owner on your team.");
    return false;
  }, [owner, say, lang]);

  /* approvals: in the demo they run the scripted flow; in an account they go to the team, the outbox or the agency */
  /* While a task runs on the server it owns the workspace; changes wait until it's done (or stopped). */
  const held = useCallback(() => {
    if (!serverRun.current && !families.current.size) return false;
    say(lang === "zh" ? "Odelia 正在处理工作区，完成后（或停止后）再修改。" : "Odelia is working on the workspace. Make changes when she's done, or stop her.");
    return true;
  }, [say, lang]);

  /* An approval that met the plan wall: kept (in this browser, so it survives the trip to Stripe) and sent to the team
     as soon as the annual plan is on, as the plans sheet promises. */
  const PENDING = "placetta-pending-filing";
  const hold = (id: string | null) => { try { if (id) localStorage.setItem(PENDING, id); else localStorage.removeItem(PENDING); } catch { /* storage blocked */ } pendingFiling.current = id; };
  const pendingFiling = useRef<string | null>((() => { try { return localStorage.getItem(PENDING); } catch { return null; } })());

  /* Updated Terms: until this person accepts them (the band at the top), nothing new is approved. Reading stays open. */
  const [terms, setTerms] = useState<api.TermsStatus | null>(cloud?.terms ?? null);
  const termsHold = !!cloud && !!terms && !terms.accepted;
  const termsRef = useRef(termsHold);
  useEffect(() => { termsRef.current = termsHold; }, [termsHold]);
  const acceptTerms = useCallback(async () => {
    try {
      const r = await api.acceptTerms(UPDATED, cloud?.wsId);
      setTerms(r ?? { accepted: true, version: UPDATED, current: UPDATED });
      say(lang === "zh" ? "已接受。感谢您。" : "Accepted. Thank you.");
    } catch (e) {
      const er = e as api.ApiError;
      say(er.code === "terms_version" ? (lang === "zh" ? "条款刚刚又有更新。请刷新页面，阅读最新版本。" : "The Terms were just updated again. Reload to read the latest version.") : er.message);
    }
  }, [cloud, say, lang]);

  /* One approved filing to the server: the agency's own form filled (and signed when it takes a drawn signature), the
     request frozen, and Placetta started on it. What to tell the person, or null when it couldn't go. */
  const fileOne = useCallback(async (a: Approval, sig?: Signed): Promise<Bi | null> => {
    if (!cloud) return null;
    const w = wsRef.current;
    const app = w.apps.find(x => x.id === a.app); if (!app) return null;
    const appDocs = app.checklist.map(c => (c.doc ? w.docs.find(d => d.id === c.doc) : undefined));
    // the card's own answers, and the version of the filled form they make (a card whose answers changed can't go)
    const g = fileable(w, a);
    if (!g.ok) { say(g.why[lang]); return null; }
    try {
      const off = app.official ? formById(app.official) : undefined;
      let pdf_path: string | undefined, signature: api.FilingPayload["signature"];
      if (off && canFill(off)) {
        const filled = await fillForm(off.id, g.version ? fieldsOf(g.version.answers) : app.fields, appPdf);
        // read back once more, the copy that's filed: a line that didn't come out right stops it here
        const rb = filled ? await readBack(off.id, filled) : null;
        if (rb && !rb.ok) { const p = problemLine(problemsOf(app, rb)[0]); say(lang === "zh" ? `还不能提交。${p.zh}` : `Not filed. ${p.en}`); return null; }
        if (filled) {
          let bytes: Uint8Array = filled.pdf;
          if (sig?.png && off.esign) {
            const signed = await stampSignature(bytes, sig.png, off.id);
            if (signed) { bytes = signed; signature = { name: sig.name, title: sig.title, signed_at: nowIso(), kind: sig.kind }; }
          }
          pdf_path = await api.uploadForm(cloud.wsId, app.id, `${off.form.split(" (")[0]}${signature ? " signed" : ""}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
        }
      }
      const filing = await api.requestFiling(cloud.wsId, {
        app_id: app.id, title: a.title, agency: app.agency, portal_url: app.source.url || undefined, fee_estimate: app.fees.reduce((s, f) => s + f.amount, 0),
        payload: {
          form: app.form, source: app.source, does: a.does, official: app.official, pdf_path, signature, answers_hash: answersHash(app), ...(g.version ? { version: g.version.n } : {}),
          fields: app.fields.map(f => ({ id: f.id, label: f.label, value: f.value, from: f.from })),
          checklist: app.checklist.map((c, i) => ({ label: c.label, state: c.state, doc: appDocs[i]?.path })),
          attachments: appDocs.filter((d): d is Doc => !!d?.path).map(d => ({ name: d.name, path: d.path! })),
        },
      });
      setWs(x => setApp(app.id, { status: "filing" })(dropApproval(a.id)(x)));
      const v = await api.fileNow(cloud.wsId, filing.id).catch(() => null);
      void refresh();
      const st = v?.filing.agent_state, last = v?.filing.agent_log?.at(-1);
      return st === "handoff" || !v
        ? B(`Sent to the Placetta team. They check the ${app.name.en.toLowerCase()} against the agency's current requirements and submit it. If the agency charges a fee, you'll get its payment link here.`, `已交给快哉团队。他们会对照机构现行要求核对${app.name.zh}后提交。如需缴纳机构费用，付款链接会发到这里。`)
        : st === "needs_you" && last ? B(`One step needs you first: ${last.en}`, `需要您先完成一步：${last.zh}`)
        : B(`Filing it now: I checked the ${app.name.en.toLowerCase()} against the agency's requirements and I'm submitting it. Watch each step below.`, `正在提交：我已对照机构要求核对${app.name.zh}，正在提交。每一步都显示在下方。`);
    } catch (e) {
      const er = e as api.ApiError;
      if (er.code === "plan_required") { hold(a.id); setPlans("file"); } else say(er.message);
      return null;
    }
  }, [cloud, refresh, say]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* A purchase Odelia asked to make: approving it checks the Spending rules again; then a person pays it on the payee's
     own page and taps "I've paid it". The server decides in an account; outside one, the same rules run here. */
  const approvePurchase = async (a: Approval) => {
    const zh = lang === "zh", money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    if (cloud) {
      if (!ownerOk()) return;
      const p = purchases.find(x => x.id === a.purchase);
      try {
        if (p?.status === "approved") {
          await api.spend(cloud.wsId, "paid", { id: p.id });
          say(zh ? "已记录为已付款。" : "Recorded as paid.");
        } else {
          const r = await api.spend<{ purchase: Purchase; waiting?: number; reasons?: Bi[] }>(cloud.wsId, "decide", { id: a.purchase, approve: true });
          const q = r.purchase;
          say(r.waiting ? (zh ? "已批准。金额超过双人审批线，还需另一位所有者批准。" : "Approved. It's over the two-person amount, so another owner approves it too.")
            : q.status === "blocked" ? (zh ? `未购买：${(r.reasons ?? q.reasons ?? []).map(x => x.zh).join("；")}` : `Not bought: ${(r.reasons ?? q.reasons ?? []).map(x => x.en).join("; ")}`)
            : (zh ? "已批准。请在对方页面付款，然后点“我已付款”，Odelia 会记录下来。" : "Approved. Pay it on their page, then tap \"I've paid it\" so Odelia records it."));
          if (q.method === "link" && q.payeeUrl && q.status === "approved") window.open(q.payeeUrl, "_blank", "noopener,noreferrer");
        }
        const sp = await api.spendGet(cloud.wsId); if (sp) setPurchases(sp.purchases);
      } catch (e) { say((e as api.ApiError).message); }
      return;
    }
    // outside an account: the rules run here; nothing is charged, the agency's page is where it's paid
    const sp = wsRef.current.spend, p = sp?.purchases.find(x => x.id === a.purchase);
    if (!sp || !p) return;
    if (p.status === "approved") {
      setWs(w => audit("you", B("Paid", "已支付"), a.title)(dropApproval(a.id)({ ...w, spend: { ...sp, purchases: sp.purchases.map(x => x.id === p.id ? { ...x, status: "paid" as const } : x) } })));
      say(zh ? "已记录为已付款。" : "Recorded as paid.");
      return;
    }
    const d = decide(p, sp.policy, sp.purchases.filter(x => x.id !== p.id));
    if (d.verdict === "blocked") { say(zh ? `未购买：${d.reasons.map(x => x.zh).join("；")}` : `Not bought: ${d.reasons.map(x => x.en).join("; ")}`); return; }
    const done: Purchase = { ...p, status: "approved", method: "link", approvals: [...(p.approvals ?? []), { who: "you", at: new Date().toISOString() }] };
    setWs(w => audit("you", B("Approved a purchase", "批准购买"), a.title)({ ...w, spend: { ...sp, purchases: sp.purchases.map(x => x.id === p.id ? done : x) },
      approvals: w.approvals.map(x => x.id === a.id ? { ...x, title: B(`Pay ${p.payee} ${money(p.amount)}`, `向 ${p.payee} 支付 ${money(p.amount)}`), action: B("I've paid it", "我已付款"), does: [p.why, B("Approved. Pay it on the agency's own page, then tap the button so Odelia records it.", "已批准。请在机构自己的页面付款，然后点按钮，Odelia 会记录下来。")] } : x) }));
    if (p.payeeUrl) window.open(p.payeeUrl, "_blank", "noopener,noreferrer");
    say(zh ? "已批准。请在机构页面付款，然后点“我已付款”。" : "Approved. Pay it on the agency's page, then tap \"I've paid it\".");
  };
  const [afterPlan, setAfterPlan] = useState<string | null>(null);   // a plan approved here: the request that starts its work
  const autoSent = useRef(new Set<string>());                        // messages approved under an Always allow rule
  /* The undo window (src/hold.ts): what the app sends itself (the sample's filings, a message from your own mailbox)
     waits HOLD_MINUTES with an Undo, then comes back through approve, which lets it pass. In an account the server
     holds filings itself (supabase/functions/file). True when a hold just started. */
  const approveRef = useRef<(id: string, sig?: Signed) => void | Promise<void>>(() => undefined);
  const holdFirst = (a: Approval, sig?: Signed) => {
    const go = () => (!cloud && busyRef.current ? window.setTimeout(go, 1500) : void approveRef.current(a.id, sig));
    const started = startHold({ ids: [a.id], app: a.app, title: a.title, go });
    if (started) say(lang === "zh" ? `${HOLD_MINUTES} 分钟后发送，在此之前可以撤销。` : `Sending in ${HOLD_MINUTES} minutes. You can undo it until then.`);
    return started;
  };
  const approve = useCallback(async (id: string, sig?: Signed) => {
    if (held()) return;
    if (cloud && termsRef.current) { say(lang === "zh" ? "请先在页面顶部接受更新后的条款，然后再批准。" : "Accept the updated Terms at the top of the page first, then approve."); return; }
    const w = wsRef.current, a = w.approvals.find(x => x.id === id); if (!a) return;
    const shown = `${S.approvedIt[lang]}: ${a.title[lang]}`;
    /* Always allow: a message approved under an owner's rule goes, when its undo window ends, only while the rule still
       covers it and no Never rule stops it. Otherwise it waits for a person's own approval. */
    if (autoSent.current.has(id) && a.auto && !autoOk(a, w)) {
      autoSent.current.delete(id);
      setWs(x => audit("agent", B("Didn't send: your rule changed", "未发送：您的规则已更改"), a.auto!.label, a.title)({ ...x, approvals: x.approvals.map(y => (y.id === id ? { ...y, auto: undefined } : y)) }));
      say(lang === "zh" ? "未发送：您的“始终允许”规则已不再适用。如仍要发送，请您亲自批准。" : "Not sent: your Always allow rule no longer covers it. Approve it yourself if you still want it sent.");
      return;
    }
    /* Owner controls (src/autonomy.ts): a plan written under Plan first, or changes held under Ask me first. In an
       account the server carries them out (agent-run lets only an owner start that run); otherwise this browser does. */
    if (a.kind === "change" && (a.change?.op === "plan" || a.change?.op === "held")) {
      if (!ownerOk()) return;
      const viaServer = !!cloud && !api.PREVIEW && !!modelRef.current;
      if (a.change.op === "plan") {
        const job = a.change.job;
        if (viaServer) { setPanelOpen(true); void run({ text: "/go " + job }, shown); return; }
        setWs(approvePlan(job, cloud?.me.email));
        const j = (w.jobs ?? []).find(x => x.id === job);
        if (j) setAfterPlan(workPrompt(j, lang));
        return;
      }
      if (viaServer) { setPanelOpen(true); void run({ text: "/apply " + a.id }, shown); return; }
      const r = await applyHeldHere(a.id, { get: () => wsRef.current, apply: setWs, lang, model: modelRef.current, svc: services, files: kept.current, account: !!cloud });
      if (r) { setPanelOpen(true); pushTurn(shown, { text: [r.text], undo: r.undo }); }
      return;
    }
    /* A business rule wants two owners on this one (src/businessRules.ts): the first owner's approval is recorded and it
       waits for another. In an account the database counts two owners again when the filing goes in. */
    if (a.second) {
      if (cloud && !ownerOk()) return;
      const me = cloud?.me.email ?? "you", step = secondStep(a, me);
      if (cloud && a.app && step !== "again") { try { await ownerApprove(cloud.wsId, a.app); } catch { /* the database still checks at filing */ } }
      if (step !== "ready") {
        if (step === "first") setWs(x => audit("you", B("Approved, one of two owners", "已批准（两位所有者之一）"), a.title)(markSecond(a.id, me)(x)));
        say(step === "first" ? (lang === "zh" ? "已批准。按您的业务规则，还需另一位所有者批准后才会进行。" : "Approved. Under your business rule, another owner approves it too before it goes ahead.")
          : (lang === "zh" ? "您已经批准过了。还需另一位所有者批准。" : "You've approved it already. Another owner approves it too."));
        return;
      }
    }
    // a filing's card is for one set of answers: changed since it was put up, or a filled form that doesn't match them,
    // and it can't be filed until a fresh card is approved (src/forms/versions.ts)
    if (a.kind === "file") { const g = fileable(w, a); if (!g.ok) { say(g.why[lang]); return; } }
    // every kind of filing: nothing goes out with an empty field or a missing document
    const filingApp = a.kind === "file" ? w.apps.find(x => x.id === a.app) : undefined;
    if (filingApp && !readyToFile(filingApp)) { say(blockersSay(filingApp)[lang]); return; }
    // and nothing goes out with a line the second look says is wrong (an EIN that isn't one, an expired date)
    const pf = a.kind === "file" || a.kind === "send" ? preflight(w, a, daysFromNow(0)) : null;
    if (pf?.errors.length) { say(lang === "zh" ? `还不能提交：${pf.errors.map(e => `${e.label.zh}（${e.note.zh}）`).join("；")}` : `Not yet: ${pf.errors.map(e => `${e.label.en} (${e.note.en})`).join("; ")}`); return; }
    if (a.kind === "change" && a.change?.op === "set_budgets" && cloud) {
      if (!ownerOk()) return;
      try {
        const cur = await api.spendGet(cloud.wsId);
        await api.spend(cloud.wsId, "set_policy", { policy: { ...(cur?.policy ?? DEFAULT_POLICY), budgets: a.change.budgets } });
        setWs(x => audit("you", B("Set budgets", "设置预算"), a.title)(dropApproval(id)(x)));
        say(lang === "zh" ? "预算已设置。可在“设置 > 支出”中修改。" : "Budgets set. Change them any time in Settings, Spending.");
      } catch (e) { say((e as api.ApiError).message); }
      return;
    }
    // a connected app's action (src/mcp.ts): an owner's approval runs it once, on the server
    if (a.kind === "change" && a.change?.op === "mcp_call") {
      if (!cloud || !ownerOk()) return;
      try {
        const r = await runApproved((action, body) => api.integration(cloud.wsId, action, body), a);
        setWs(x => audit("you", B("Approved and ran", "批准并执行"), a.title, r.detail)(dropApproval(id)(x)));
        say(r.say[lang]);
      } catch (e) {
        const er = e as api.ApiError;
        if (er.code === "too_late" || er.code === "changed") setWs(dropApproval(id));
        say((lang === "zh" && er.message_zh) || er.message);
      }
      return;
    }
    if (a.kind === "change" && a.change) {
      const c = a.change;
      // a business fact or the business's name, asked for from outside the app: only an owner saves it
      if ((c.op === "set_fact" || c.op === "rename_business") && cloud && !ownerOk()) return;
      setWs(confirmChange(a));
      say(lang === "zh" ? "已更改。" : "Done. It's changed.");
      return;
    }
    if (a.kind === "pay" && a.purchase) { await approvePurchase(a); return; }
    if (!cloud) { if ((a.kind === "file" || a.kind === "send") && holdFirst(a, sig)) return; run({ approve: id }, shown); return; }
    if (!ownerOk()) return;
    if (a.kind === "pay") { if (a.url) window.open(a.url, "_blank", "noopener,noreferrer"); return; }
    if (a.kind === "file") {
      if (plan !== "monthly") { hold(id); setPlans("file"); return; }
      const line = await fileOne(a, sig);
      if (line) { setPanelOpen(true); pushTurn(shown, { text: [line], filed: a.app ? [a.app] : undefined }); }
      return;
    }
    if (a.kind === "send") {
      if (holdFirst(a, sig)) return;
      const to = a.data?.find(f => f.id === "to")?.value ?? "", body = a.data?.find(f => f.id === "msg")?.value ?? "";
      const subject = a.data?.find(f => f.id === "subject")?.value || a.title.en;
      const mail = integrations.find(i => (i.kind === "gmail" || i.kind === "outlook_mail") && i.status === "connected");
      const email = to.match(/\S+@\S+\.\S+/)?.[0] ?? "";
      try {
        if (mail && email) {
          const emails = to.split(/[,;\s]+/).filter(x => /\S+@\S+\.\S+/.test(x));
          await api.integration(cloud.wsId, "mail_send", { kind: mail.kind, to: emails.length > 1 ? emails : email, subject, body, approved: true, ...(a.app ? { app_id: a.app } : {}) });
          setWs(x => audit("you", B("Approved and sent", "批准并发送"), a.title, same(email))(dropApproval(id)(x)));
          say(lang === "zh" ? `已从 ${mail.account ?? "您的邮箱"} 发出。对方回复时，Odelia 会第一时间告诉您。` : `Sent from ${mail.account ?? "your mailbox"}. Odelia tells you as soon as they reply.`);
        } else {
          await navigator.clipboard?.writeText(body).catch(() => undefined);
          const tel = to.replace(/[^\d+]/g, "");
          if (email) window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          else if (tel.length >= 10) window.location.href = `sms:${tel}?&body=${encodeURIComponent(body)}`;
          setWs(x => audit("you", B("Approved the message", "批准消息"), a.title, same(to))(dropApproval(id)(x)));
          say(lang === "zh" ? "消息已复制。连接邮箱后，批准即可直接发送。" : "Message copied. Connect your email in Settings and approving sends it.");
        }
      } catch (e) { say((e as api.ApiError).message); }
      return;
    }
    run({ approve: id }, shown);
  }, [run, lang, cloud, plan, refresh, pushTurn, say, integrations, ownerOk, held, services]);
  approveRef.current = approve;
  /* Everything ready, from one tap: the same checks as one at a time (complete, nothing the second look says is wrong),
     filed in turn, and one answer that shows each filing live. */
  const approveAll = useCallback(async (ids: string[]) => {
    if (held()) return;
    if (cloud && termsRef.current) { say(lang === "zh" ? "请先在页面顶部接受更新后的条款，然后再批准。" : "Accept the updated Terms at the top of the page first, then approve."); return; }
    const w = wsRef.current, today = daysFromNow(0);
    // one that needs two owners under a business rule is approved on its own, never in a batch
    const ok = ids.map(id => w.approvals.find(a => a.id === id)).filter((a): a is Approval => !!a && a.kind === "file" && !a.second).filter(a => {
      const app = w.apps.find(x => x.id === a.app);
      return !!app && readyToFile(app) && !preflight(w, a, today).errors.length;
    });
    if (!ok.length) return;
    if (ok.length === 1) return approve(ok[0].id);
    const shown = lang === "zh" ? `全部批准：${ok.map(a => a.title.zh).join("、")}` : `Approve all: ${ok.map(a => a.title.en).join(", ")}`;
    if (!cloud) {
      // the undo window covers the group: one countdown, one Undo, then every filing in it goes together
      const ids = ok.map(a => a.id), go = () => (busyRef.current ? window.setTimeout(go, 1500) : void run({ approveAll: ids }, shown));
      if (startHold({ ids, title: B(`${ok.length} filings`, `${ok.length} 份申请`), go })) { say(lang === "zh" ? `${HOLD_MINUTES} 分钟后提交，在此之前可以撤销。` : `Filing in ${HOLD_MINUTES} minutes. You can undo it until then.`); return; }
      run({ approveAll: ids }, shown); return;
    }
    if (!ownerOk()) return;
    if (plan !== "monthly") { hold(ok[0].id); setPlans("file"); return; }
    setPanelOpen(true);
    const filed: string[] = [];
    for (const a of ok) { if (await fileOne(a) && a.app) filed.push(a.app); }
    if (filed.length) pushTurn(shown, { text: [B(`Approved ${filed.length === 2 ? "both" : `all ${filed.length}`}. I'm filing each one now; every step and what the agency sends back shows below, live.`, `已批准 ${filed.length} 项。我正在逐一提交，每一步和机构的回执都会实时显示在下方。`)], filed });
  }, [held, cloud, say, lang, approve, run, ownerOk, plan, fileOne, pushTurn]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Owner controls (src/autonomy.ts, src/commands.ts) ---- */
  // After a plan is approved in this browser: its work starts once the workspace shows the approval.
  useEffect(() => { if (!afterPlan || busy) return; const q = afterPlan; setAfterPlan(null); ask(q); }, [afterPlan, busy, ask]);
  // "/forget": a fresh conversation. The workspace, memory and playbooks stay.
  useEffect(() => {
    const on = () => { history.current = []; setFeed([]); setAsked([]); say(lang === "zh" ? "已开始新的对话。工作区和记忆保持不变。" : "Fresh conversation. Your workspace and memory stay."); };
    addEventListener("placetta:forget", on);
    return () => removeEventListener("placetta:forget", on);
  }, [say, lang]);
  // Always allow: a message an owner's rule covers is approved without another tap while an owner has the app open, and
  // then waits out the undo window like any other send (src/hold.ts). Never a filing, a payment or anything with a fee,
  // and never one asked for from outside the app (it isn't marked).
  useEffect(() => {
    if (!owner || busy || termsHold) return;
    const a = view_.approvals.find(x => !autoSent.current.has(x.id) && autoOk(x, view_));
    if (!a) return;
    autoSent.current.add(a.id);
    setWs(audit("agent", B("Approved under your rule", "已按您的规则批准"), a.auto!.label, a.title));
    void approve(a.id);
  }, [view_, owner, busy, termsHold, approve]);

  useEffect(() => {
    const id = pendingFiling.current;
    if (!cloud || plan !== "monthly" || !id) return;
    hold(null);
    if (view_.approvals.some(a => a.id === id && a.kind === "file")) void approve(id);
  }, [cloud, plan, view_.approvals, approve]);   // eslint-disable-line react-hooks/exhaustive-deps

  const upload = useCallback(async (app: string, item: string, files?: File[]) => {
    if (held()) return;
    if (cloud && files?.length) {
      try {
        for (const f of files) { const row = await api.uploadDoc(cloud.wsId, f, app || undefined); paths.current.set(f.name, row.path); }
        void refresh();
      } catch (e) { say((e as api.ApiError).message); return; }
    }
    files?.forEach(f => kept.current.set(f.name, f));
    if (!app) {
      // Straight to Documents, no application yet.
      if (!files?.length) return;
      if (!cloud) {
        const list: Doc[] = files.map((f, i) => ({ id: `d-u-${Date.now().toString(36)}-${i}`, name: f.name, kind: (f.name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"], size: f.size, by: "you", at: nowIso(), tag: B("Uploaded", "已上传") }));
        setWs(w => list.reduce((acc, d) => audit("you", B("Uploaded", "上传"), same(d.name))({ ...acc, docs: [d, ...acc.docs] }), w));
      } else files.forEach(f => setWs(w => audit("you", B("Uploaded", "上传"), same(f.name))(w)));
      say(lang === "zh" ? `已添加到文件：${files.map(f => f.name).join("、")}` : `Added to Documents: ${files.map(f => f.name).join(", ")}`);
      return;
    }
    const list = (files ?? []).map(f => ({ name: f.name, size: f.size }));
    const shown = files?.length ? `${S.upload[lang]}: ${list.map(f => f.name).join(", ")}` : S.useSample[lang];
    run({ upload: { app, item, files: list } }, shown);
  }, [run, lang, say, cloud, refresh, held]);

  const save = useCallback(async (name: string, blob: Blob) => {
    const r = await saveFile(name, blob);
    if (r === "saved") say(t("t_saved")); else if (r === "unavailable") say(t("t_noDl"));
  }, [say, t]);

  /* the account's own abilities, for Settings, approvals and the plans sheet */
  const cloudCtx: CloudCtx | null = useMemo(() => {
    if (!cloud) return null;
    const goTo = (url: string) => {
      // In the preview there's no Stripe or provider to visit: the stand-in backend switches it on, so just reload.
      if (url.startsWith("preview:")) {
        void Promise.all([api.getBilling(cloud.wsId).then(setBilling), api.listIntegrations(cloud.wsId).then(setIntegrations)]).then(() => { setPlans(null); void refresh(); });
        say(url === "preview:billing" ? (lang === "zh" ? "方案已开通。" : "Your plan is on.") : (lang === "zh" ? "已连接。" : "Connected."));
        return;
      }
      window.location.href = url;
    };
    const fail = (e: unknown) => { const x = e as api.ApiError; say((lang === "zh" && x?.message_zh) || x?.message || String(e)); };
    /** Stop or Undo a filing before anything left: it comes back to you, exactly as it was before you approved it. */
    const takeBack = async (id: string, how: "stop" | "undo") => {
      const f = filings.find(x => x.id === id);
      try {
        await (how === "undo" ? api.undoFiling : api.stopFiling)(cloud.wsId, id);
        if (f) setWs(x => {
          const back = [...x.closed].reverse().find(a => a.kind === "file" && a.app === f.app_id);
          const w2 = setApp(f.app_id, { status: "ready", next: how === "undo" ? B("Undone before it was sent. Approve again when you're ready", "已在发送前撤销，准备好后可再次批准") : B("Stopped before it was sent. Approve again when you're ready", "已在发送前停止，准备好后可再次批准") })(x);
          return back ? { ...w2, approvals: [back, ...w2.approvals.filter(a => a.id !== back.id)], closed: w2.closed.filter(a => a.id !== back.id) } : w2;
        });
        await refresh();
        say(how === "undo" ? (lang === "zh" ? "已撤销，没有发出任何内容。" : "Undone. Nothing was sent.") : (lang === "zh" ? "已停止，没有任何内容发给机构。" : "Stopped. Nothing reached the agency."));
      } catch (e) { fail(e); }
    };
    return {
      email: cloud.me.email, staff: cloud.me.staff, staffEmail: cloud.me.staff_email, twoStep: cloud.me.two_step, role: cloud.role, owner,
      wsId: cloud.wsId, plan, billing, filings, integrations, logins, workspaces: cloud.workspaces, hq: cloud.hq, termsHold,
      openPlans: r => { if (!ownerOk()) return; setPlans(r ?? "start"); },
      checkout: async (p, o) => { if (!ownerOk()) return; try { goTo((await api.checkout(cloud.wsId, p, o)).url); } catch (e) { fail(e); } },
      portal: async () => { if (!ownerOk()) return; try { goTo((await api.billingPortal(cloud.wsId)).url); } catch (e) { fail(e); } },
      buyPack: async () => { if (!ownerOk()) return; try { goTo((await api.buyPack(cloud.wsId)).url); } catch (e) { if ((e as api.ApiError).code === "plan_required") setPlans("start"); else fail(e); } },
      connect: async kind => { if (!ownerOk()) return; try { goTo((await api.connectUrl(cloud.wsId, kind)).url); } catch (e) { if ((e as api.ApiError).code === "not_configured") say(lang === "zh" ? "这个连接即将开放。在此之前，可把机构来信转发到 support@placetta.com，团队会帮您添加。" : "This connection opens soon. Until then, forward agency emails to support@placetta.com and the team adds them for you."); else fail(e); } },
      connectHook: async (kind, url, secret) => { if (!ownerOk()) return false; try { await api.integration(cloud.wsId, "hook_connect", { kind, url, secret: secret || undefined, lang }); setIntegrations(await api.listIntegrations(cloud.wsId)); say(lang === "zh" ? "已连接，测试消息已发到群里。" : "Connected. A test message is in the group."); return true; } catch (e) { fail(e); return false; } },
      botSetup: async kind => { try { return await api.integration<api.BotSetup>(cloud.wsId, "bot_setup", { kind }); } catch (e) { fail(e); return null; } },
      connectBot: async (kind, creds) => {
        if (!ownerOk()) return false;
        try {
          await api.integration(cloud.wsId, "bot_connect", { kind, ...creds }); setIntegrations(await api.listIntegrations(cloud.wsId));
          say(kind === "wechat_bot"
            ? (lang === "zh" ? "已连接。现在到微信“消息推送”中填写服务器地址、Token 和 EncodingAESKey 并提交，然后每位同事在下方关联自己的微信。" : "Connected. Now save the server address, Token and EncodingAESKey under Message push in WeChat, then each teammate links their WeChat below.")
            : (lang === "zh" ? "已连接。在频道里 @Odelia 或私信她即可派活。" : "Connected. Mention @Odelia in a channel or message her directly to give her a job."));
          return true;
        } catch (e) { fail(e); return false; }
      },
      connectToast: async () => { if (!ownerOk()) return false; try { await api.integration(cloud.wsId, "toast_connect"); setIntegrations(await api.listIntegrations(cloud.wsId)); say(lang === "zh" ? "已连接 Toast。Odelia 现在可以读取销售额和排班。" : "Toast is connected. Odelia can read sales and schedules now."); return true; } catch (e) { fail(e); return false; } },
      availability: async () => { try { return await api.integration<api.Availability>(cloud.wsId, "available"); } catch { return { google: false, microsoft: false, dropbox: false, quickbooks: false, slack: false, square: false, toast: false }; } },
      disconnect: async kind => { if (!ownerOk()) return; try { await api.integration(cloud.wsId, "disconnect", { kind }); setIntegrations(await api.listIntegrations(cloud.wsId)); } catch (e) { fail(e); } },
      saveLogin: async l => { if (!ownerOk()) return; try { await api.saveLogin(cloud.wsId, l); setLogins(await api.listLogins(cloud.wsId)); say(lang === "zh" ? "登录信息已加密保存。" : "Saved and encrypted."); } catch (e) { fail(e); } },
      removeLogin: async id => { if (!ownerOk()) return; try { await api.removeLogin(cloud.wsId, id); setLogins(await api.listLogins(cloud.wsId)); } catch (e) { fail(e); } },
      feedUrl: async rotate => (await api.integration<{ url: string }>(cloud.wsId, "feed_url", { rotate: !!rotate })).url,
      markPaid: async id => { if (!ownerOk()) return; try { await api.markPaid(id); await refresh(); say(lang === "zh" ? "已告知团队，他们会继续提交。" : "Thanks. The team will finish the submission."); } catch (e) { fail(e); } },
      resumeFiling: async (id, resubmit) => { try { await api.resumeFiling(cloud.wsId, id, !!resubmit); await refresh(); say(lang === "zh" ? "好的，快哉继续办理。" : "Thanks. Placetta carries on."); } catch (e) { fail(e); } },
      uploadSigned: async (id, appId, file) => {
        try {
          const row = await api.uploadDoc(cloud.wsId, file, appId);
          await api.signedCopy(cloud.wsId, id, row.path); await refresh();
          say(lang === "zh" ? "已收到签名件，快哉正在传真给机构。" : "Got the signed copy. Placetta is faxing it to the agency.");
        } catch (e) { fail(e); }
      },
      cancelFiling: async id => { if (!ownerOk()) return; try { await api.cancelFiling(id); await refresh(); } catch (e) { fail(e); } },
      stopFiling: id => takeBack(id, "stop"),
      // the undo window (src/hold.ts, supabase/functions/file): Undo while it's held, or Send now
      undoFiling: id => takeBack(id, "undo"),
      sendFilingNow: async id => { if (!ownerOk()) return; try { await api.sendFilingNow(cloud.wsId, id); await refresh(); say(lang === "zh" ? "好的，现在发送。" : "Sending it now."); } catch (e) { fail(e); } },
      // Ask a person (src/AskPerson.tsx): owners and members; the reply comes to Updates
      askPerson: async (question, context) => { try { await api.askPerson(cloud.wsId, question, context, lang); await refresh(); return true; } catch (e) { fail(e); return false; } },
      fileUrl: async path => { try { return URL.createObjectURL(await api.downloadDoc(path)); } catch { return null; } },
      exportData: () => {
        const data = { exported: nowIso(), workspace: api.strip(wsRef.current), audit: wsRef.current.audit, filings, documents: docs.map(d => ({ name: d.name, size: d.size, created_at: d.created_at, source: d.source })) };
        void save(`placetta-data-${inDays(0)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      },
      switchTo: cloud.switchTo, newWorkspace: cloud.newWorkspace, signOut: cloud.signOut, reopen: cloud.reopen,
    };
  }, [cloud, plan, billing, filings, integrations, logins, docs, say, lang, refresh, save, owner, ownerOk, termsHold]);

  const ctx: Ctx = useMemo(() => ({
    lang, t, b, setLang, ws: view_, busy, live: step, uploading,
    mode: model ? model.kind : "demo", apiName, deep, setDeep, voiceOn, setVoiceOn,
    stop: () => abort.current?.abort(),
    applyKey: (key, id, remember) => {
      setModel(apiModel(key, id)); setApiName(API_MODELS.find(x => x.id === id)?.label ?? id);
      try { if (remember) { localStorage.setItem(KEY, key); localStorage.setItem(KEY_MODEL, id); } else { localStorage.removeItem(KEY); localStorage.removeItem(KEY_MODEL); } } catch { /* storage blocked */ }
    },
    dropKey: () => { setModel(null); setApiName(""); try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_MODEL); } catch { /* storage blocked */ } },
    go, sub,
    ask, queued, unqueue,
    run: (req, shown) => { if ("text" in req) setPanelOpen(true); void run(req, shown); },
    openApp: (id, tab, edit) => { const a = wsRef.current.apps.find(x => x.id === id); setDrawer({ id, tab: tab ?? (a && a.status === "ready" ? "form" : a?.preview ? "fees" : "check"), edit: !!edit }); },
    openForm: (id, v) => setDrawer({ id, tab: "form", edit: false, v }),
    filledPdf: async (id, n) => {
      const a = wsRef.current.apps.find(x => x.id === id);
      if (!a?.official || !canFill(formById(a.official))) return null;
      const v = n ? a.versions?.find(x => x.n === n) : latestVersion(a);
      if (v) {
        // the kept copy: from the account's Documents, or this browser; filled again from its answers otherwise
        if (cloud && v.path) { try { return new Uint8Array(await (await api.downloadDoc(v.path)).arrayBuffer()); } catch { /* filled again below */ } }
        const own = kept.current.get(`${formName(a)}, filled, version ${v.n}.pdf`);
        if (own) return new Uint8Array(await own.arrayBuffer());
        return (await fillForm(a.official, fieldsOf(v.answers), appPdf))?.pdf ?? null;
      }
      return (await fillForm(a.official, a.fields, appPdf))?.pdf ?? null;
    },
    openApproval: id => setModal(id),
    openReplay: id => setReplay(id),
    stopJob: id => {
      const w0 = wsRef.current, j = (w0.jobs ?? []).find(x => x.id === id);
      if (!j) return;
      const ids = new Set([id, ...(j.children ?? [])]);
      // on the server, its latest run (and for a split job, each store's) stops too; a split job's run stops its stores'
      if (cloud && !api.PREVIEW) {
        const runs = [...ids].flatMap(x => (w0.jobs ?? []).find(y => y.id === x)?.runs?.slice(-1) ?? []);
        for (const r of runs) { families.current.delete(r); void api.stopRun(r).catch(() => undefined); }
      }
      const now = nowIso();
      setWs(w => ({ ...w, jobs: (w.jobs ?? []).map(x => (ids.has(x.id) && x.status !== "done" && x.status !== "stopped" ? { ...x, status: "stopped" as const, waiting: undefined, updated: now } : x)) }));
    },
    approve: (id, sig) => void approve(id, sig),
    approveAll: ids => void approveAll(ids),
    upload: (app, item, files) => void upload(app, item, files),
    download: async id => {
      const d = wsRef.current.docs.find(x => x.id === id); if (!d) return;
      if (cloud && d.path) { try { void save(d.name, await api.downloadDoc(d.path)); } catch (e) { say((e as api.ApiError).message); } return; }
      const own = kept.current.get(d.name);
      if (own && (d.by === "you" || d.by === "agent")) { void save(d.name, own); return; }
      const f = docBlob(d, wsRef.current); void save(f.name, f.blob);
    },
    downloadApp: id => { const a = wsRef.current.apps.find(x => x.id === id); if (a) void save(a.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-answers.pdf", applicationPdf(a)); },
    exportAudit: () => void save(`placetta-audit-trail-${inDays(0)}.csv`, auditCsv(wsRef.current.audit)),
    editFields: (app, values) => {
      if (held()) return;
      const a = wsRef.current.apps.find(x => x.id === app); if (!a) return;
      setWs(w => {
        let n = w;
        for (const [k, v] of Object.entries(values)) n = setField(app, k, v, B("You edited", "您修改的"))(n);
        const labels = a.fields.filter(f => f.id in values).map(f => f.label);
        return audit("you", B("Edited application", "修改申请"), a.name, B(labels.map(l => l.en).join(", "), labels.map(l => l.zh).join("、")))(n);
      });
      say(t("edited"));
    },
    editFact: (id, value) => {
      if (held()) return;
      const f = wsRef.current.facts.find(x => x.id === id); if (!f) return;
      const text = B(`${f.label.en}: ${value}`, `${f.label.zh}：${value}`);
      setWs(w => audit("agent", B("Committed to memory", "存入记忆"), B("Business facts", "企业资料"), text)(audit("you", B("Edited fact", "修改资料"), f.label, same(value))(setFact({ ...f, value: same(value), source: B("You edited", "您修改的") })(w))));
      setFeed(fd => [...fd, { id: nid(), kind: "memory", text }]);
      say(`${t("committed")}: ${text[lang]}`);
    },
    memory: view_.memories?.[me] ?? emptyBook(), me,
    editWs: f => setWs(f),
    setMemory: f => setWs(w => ({ ...w, memories: { ...(w.memories ?? {}), [me]: f(w.memories?.[me] ?? emptyBook()) } })),
    updateStore: (id, f, log) => !held() && setWs(w => {
      const next = { ...w, stores: (w.stores ?? []).map(s => (s.id === id ? f(s) : s)) };
      return log ? audit("you", log.action, log.object, log.detail)(next) : next;
    }),
    say,
    openLegal: id => setLegal(id),
    cloud: cloudCtx,
    updates, readUpdates,
  }), [lang, t, b, view_, busy, step, uploading, model, apiName, deep, voiceOn, go, sub, ask, queued, unqueue, run, approve, approveAll, upload, save, say, cloud, cloudCtx, updates, readUpdates, held, me]);

  /* page */
  const unread = updates.filter(u => !u.read).length;
  const waitingJobs = (view_.jobs ?? []).filter(j => j.status === "waiting" && !j.children?.length).length + queued.length;
  const permitsTab: PermitsTab = PERMITS_TABS.includes(sub as PermitsTab) ? (sub as PermitsTab) : "todo";
  const odeliaTab: OdeliaTab = ODELIA_TABS.includes(sub as OdeliaTab) ? (sub as OdeliaTab) : "chat";
  const odelia = (
    <div className={"page odelia" + (odeliaTab === "chat" ? " chat" : "")}>
      {odeliaTab !== "chat" && <PageHead title={t("nav_odelia")} />}
      <Tabs view="odelia" current={odeliaTab} tabs={[
        { id: "chat", label: t("nav_chat") }, { id: "work", label: t("nav_work"), count: waitingJobs },
        { id: "playbooks", label: t("nav_playbooks") }, { id: "updates", label: t("nav_updates"), count: unread },
      ]} />
      {odeliaTab === "chat" && <AgentPanel feed={feed} tts={tts} mode="page" asked={asked} />}
      {odeliaTab === "work" && <WorkPage />}
      {odeliaTab === "playbooks" && <PlaybooksPage />}
      {odeliaTab === "updates" && <UpdatesPage />}
    </div>
  );
  const page = {
    overview: <Overview />, permits: <Permits tab={permitsTab} />, stores: <Stores />, odelia,
    find: <FindLicenses result={match} live={matching ? (step ? step.label[lang] + "…" : t("working") + "…") : null} />, settings: <Settings />,
    queue: cloud?.me.staff ? <Queue /> : cloud?.me.staff_email ? <QueueLocked /> : <Overview />,
    hq: cloud?.hq.length ? <Headquarters lang={lang} initial={cloud.hq} /> : !cloud ? <Headquarters lang={lang} initial={[]} sample={{ ws: view_, team: collab }} /> : <Overview />,
    partner: <PartnerPage lang={lang} sample={!cloud} />,
  }[view];
  const badge: Partial<Record<View, number>> = { overview: view_.approvals.length, odelia: waitingJobs };
  const wsSub = cloud ? (billing?.free && !billing.subscription_status ? b(B("Early access", "抢先体验")) : plan === "monthly" ? b(PLAN_LABEL[billing?.subscription_plan ?? ""] ?? B("Monthly plan", "月度方案")) : plan === "entry" ? b(B("Entry plan", "开店计划")) : b(B("No plan yet", "尚未开通"))) : t("sampleWs");
  const current = (v: View) => view === v || (v === "permits" && view === "find");
  /* The bell: unread updates, always in reach (the sidebar's top on a desktop, the top bar on a phone). */
  const bell = (
    <a {...navLink("odelia", "updates")} className="bellb" aria-label={unread ? (lang === "zh" ? `${unread} 条新动态` : `${unread} new update${unread === 1 ? "" : "s"}`) : t("nav_updates")} title={t("nav_updates")}>
      <I.bell />{unread > 0 && <em>{unread}</em>}
    </a>
  );

  const slim = slimPref && !phone;
  // the pages that moved under tabs, with the counts the old Work and Updates entries carried
  const moreBadge: Record<string, number> = { work: waitingJobs, updates: unread };
  const moreRows = MORE.map(m => (
    <li key={m.id}><a {...navLink(m.v, m.sub)} aria-current={atMore(m, view, sub) ? "page" : undefined} title={slim ? t(m.k) : undefined}>
      <m.Icon /><span>{t(m.k)}</span>{moreBadge[m.id] ? <em>{moreBadge[m.id]}</em> : null}
    </a></li>
  ));
  const side = (
    <nav className={"side" + (navOpen ? " open" : "")} aria-label="Workspace">
      <div className="side-top">
        <button type="button" className="brand" onClick={() => go("overview")} aria-label={t("nav_overview")}>{slim ? <Mark size={22} /> : <Logo lang={lang} height={17} />}</button>
        {phone
          ? <button type="button" className="icbtn" onClick={() => setNavOpen(false)} aria-label={t("close")}><I.x /></button>
          : <span className="side-tools">{!slim && bell}<button type="button" className="slimb" onClick={() => setSlimPref(v => !v)} aria-label={t(slim ? "expandMenu" : "collapseMenu")} title={t(slim ? "expandMenu" : "collapseMenu")} aria-expanded={!slim}><I.panel /></button></span>}
      </div>
      {cloud ? (
        <Menu className="wsname-wrap" buttonClass="wsname" label={b(B("Workspaces", "工作区"))} button={<><b>{b(view_.business)}</b><span>{wsSub}</span><I.chev /></>}
          items={[
            ...cloud.workspaces.map(x => ({ key: x.id, label: x.name, picked: x.id === cloud.wsId, onPick: () => { if (x.id !== cloud.wsId) cloud.switchTo(x.id); } })),
            { key: "new", label: b(B("New business", "新建企业")), icon: <I.plus />, onPick: () => cloud.newWorkspace() },
            { key: "site", label: b(B("Placetta website", "快哉官网")), icon: <I.globe />, href: "/" },
            { key: "out", label: b(B("Sign out", "退出登录")), icon: <I.logout />, onPick: () => cloud.signOut() },
          ]} />
      ) : (
        <div className="wsname-wrap">
          <button type="button" className="wsname" disabled><b>{b(view_.business)}</b><span>{wsSub}</span></button>
        </div>
      )}
      {!phone && (
        <ul className="nav">
          {NAV.map(n => (
            <li key={n.v}><a {...navLink(n.v)} aria-current={current(n.v) ? "page" : undefined} title={slim ? t(n.k) : undefined}>
              {n.v === "odelia" ? <span className="nav-bot" aria-hidden="true"><AgentBot size={22} busy={busy} task={busy ? step?.state : undefined} interactive={false} /></span> : <n.Icon />}
              <span>{t(n.k)}</span>{badge[n.v] ? <em>{badge[n.v]}</em> : null}
            </a></li>
          ))}
          <li><button type="button" className="moreb" onClick={() => setMoreOpen(v => !v)} aria-expanded={moreOpen} title={slim ? t("nav_more") : undefined}>
            <span className="more-chev" aria-hidden="true"><I.chevR /></span><span>{t("nav_more")}</span>
          </button></li>
          {moreOpen && moreRows}
        </ul>
      )}
      <ul className="nav">
        <li><button type="button" className="cmdk-open" onClick={() => setCmdk(true)} title={lang === "zh" ? "搜索，或直接交给 Odelia" : "Search, or hand Odelia a job"}><I.find /><span>{lang === "zh" ? "搜索" : "Search"}</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘K" : "Ctrl K"}</kbd></button></li>
        {canHq && <li><a {...navLink("hq")} aria-current={view === "hq" ? "page" : undefined} title={slim ? t("nav_hq") : undefined}><I.hq /><span>{t("nav_hq")}</span></a></li>}
        {!!partnerMe && <li><a {...navLink("partner")} aria-current={view === "partner" ? "page" : undefined} title={slim ? b(B("Partner", "合作伙伴")) : undefined}><I.user /><span>{b(B("Partner", "合作伙伴"))}</span></a></li>}
        {(cloud?.me.staff || cloud?.me.staff_email) && <li><a {...navLink("queue")} aria-current={view === "queue" ? "page" : undefined} title={slim ? t("nav_queue") : undefined}><I.queue /><span>{t("nav_queue")}</span></a></li>}
      </ul>
      {phone && <>
        <p className="nav-h">{t("nav_more")}</p>
        <ul className="nav">{moreRows}</ul>
      </>}
      {view_.locations.length > 0 && <p className="nav-h">{t("locations")}</p>}
      <ul className="nav locs">
        {view_.locations.map(l => (
          <li key={l.id}><button type="button" title={slim ? b(l.name) : undefined} onClick={() => {
            if (!cloud && l.id === "fremont") { setMatch(m => m && /fremont|弗里蒙特/i.test(m.where) ? m : null); go("find"); if (!match || !/fremont|弗里蒙特/i.test(match.where)) void run({ match: { what: lang === "zh" ? "奶茶店" : "Milk tea shop", where: lang === "zh" ? "加州弗里蒙特" : "Fremont, CA" } }, null); }
            else go("overview");
          }}><I.pin /><span>{b(l.name)}<small>{b(l.county)}</small></span>{l.state === "mapping" && <em className="map">{t("mapping")}</em>}</button></li>
        ))}
      </ul>
      <div className="side-bot">
        <a {...navLink("settings")} className={"setb" + (view === "settings" ? " on" : "")} aria-current={view === "settings" ? "page" : undefined} title={slim ? t("nav_settings") : undefined}><I.settings /><span>{t("nav_settings")}</span></a>
        <div className="lang" role="group" aria-label={t("langSwitch")}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </div>
    </nav>
  );

  return (
    <AppCtx.Provider value={ctx}><CollabCtx.Provider value={collab}>
      <div className={"shell" + (dock ? " docked" : "") + (phone ? " phone" : "") + (slim ? " slim" : "")}>
        {side}
        {phone && navOpen && <div className="navscrim" onClick={() => setNavOpen(false)} />}
        <div className="mainwrap">
          {phone && (
            <header className="mbar">
              <button type="button" className="icbtn" onClick={() => setNavOpen(true)} aria-label="Menu" title={t("nav_more")}><I.menu /></button>
              <button type="button" className="brand" onClick={() => go("overview")} aria-label={t("nav_overview")}><Logo lang={lang} height={16} /></button>
              <span className="mbar-r">
                {bell}
                <a {...navLink("settings")} className="icbtn" aria-label={t("nav_settings")} aria-current={view === "settings" ? "page" : undefined}><I.settings /></a>
              </span>
            </header>
          )}
          {termsHold && (
            <section className="terms-band" role="region" aria-label={b(B("Updated Terms", "条款更新"))}>
              <div>
                <b>{terms?.version ? b(B("We've updated our Terms. Review and accept to keep filing.", "我们更新了条款。请审阅并接受，以便继续申报。")) : b(B("Review and accept our Terms to start filing.", "请审阅并接受我们的条款，以便开始申报。"))}</b>
                <p>{b(B("Review the ", "请审阅"))}<button type="button" className="lnk" onClick={() => setLegal("terms")}>{b(B("Terms of Service", "《服务条款》"))}</button>{b(B(" and ", "和"))}<button type="button" className="lnk" onClick={() => setLegal("privacy")}>{b(B("Privacy Policy", "隐私政策"))}</button>{b(B(
                  ". Clicking Accept means you agree to them for your business, including individual arbitration of disputes (you can opt out within 30 days). Until then you can read everything, but not approve filings or messages.",
                  "。点击“接受”即表示您代表企业同意这些条款，包括以个别仲裁方式解决争议（可在 30 天内选择退出）。接受之前，您仍可查看所有内容，但不能批准申报或消息。"))}</p>
              </div>
              <div className="tb-act"><button type="button" className="sbtn ink" onClick={() => void acceptTerms()}>{b(B("Accept", "接受"))}</button></div>
            </section>
          )}
          <main className={"content" + (view === "overview" ? " wash" : "") + (chatPage ? " chatpage" : "")} ref={main}>{page}</main>
          {!panelOpen && !chatPage && <div className="dockbar"><Composer variant="dock" tts={tts} asked={asked} showLive={view !== "overview" && view !== "find"} starters={view === "overview"} /></div>}
          {toast && <div className="toast" role="status">{toast}</div>}
          {phone && (
            <nav className="tabbar" aria-label={t("nav_more")}>
              {NAV.map(n => (
                <a key={n.v} {...navLink(n.v)} aria-current={current(n.v) ? "page" : undefined}>
                  {n.v === "odelia" ? <span className="nav-bot" aria-hidden="true"><AgentBot size={24} busy={busy} task={busy ? step?.state : undefined} interactive={false} /></span> : <n.Icon />}
                  <span>{t(n.k)}</span>{badge[n.v] ? <em>{badge[n.v]}</em> : null}
                </a>
              ))}
            </nav>
          )}
        </div>
        {panelOpen && !chatPage && <AgentPanel feed={feed} tts={tts} mode={dock ? "dock" : "sheet"} onHide={() => setPanelOpen(false)} asked={asked} />}
        {drawer && <AppDrawer id={drawer.id} tab={drawer.tab} edit={drawer.edit} version={drawer.v} onTab={tab => setDrawer(d => (d ? { ...d, tab, edit: false } : d))} onClose={() => setDrawer(null)} />}
        {modal && <ApproveModal id={modal} onClose={() => setModal(null)} />}
        {replay && <ReplayDrawer job={replay} onClose={() => setReplay(null)} />}
        {legal && <LegalReader id={legal} onClose={() => setLegal(null)} />}
        {plans && cloudCtx && <Plans reason={plans} filing={plans === "file" ? pendingFiling.current ?? undefined : undefined} onClose={() => setPlans(null)} />}
        {limitHit && cloudCtx && (
          <Modal label={lang === "zh" ? "Odelia 额度" : "Odelia allowance"} onClose={() => setLimitHit(false)}>
            <header className="m-h"><h2>{lang === "zh" ? "本期的 Odelia 额度已用完" : "This period's Odelia allowance is used"}</h2>
              <p>{lang === "zh" ? "每个方案都包含一份 Odelia 额度。截止日期、提醒和已在办理的申报照常进行。要让 Odelia 继续处理新的工作，可以购买加量包（额度长期有效），或为更多门店升级方案。" : "Every plan includes an Odelia allowance. Deadlines, reminders and filings already in motion carry on. To keep Odelia taking new work, add a pack (it carries over until it's used) or move up a plan for more locations."}</p></header>
            <footer className="m-f"><div className="m-btns">
              {cloudCtx.owner ? <>
                <button type="button" className="pill quiet" onClick={() => { setLimitHit(false); setPlans("start"); }}>{lang === "zh" ? "查看方案" : "See plans"}</button>
                <button type="button" className="pill ink" onClick={() => { setLimitHit(false); void cloudCtx.buyPack(); }}>{lang === "zh" ? "购买加量包" : "Add a pack"}</button>
              </> : <p className="note">{lang === "zh" ? "请工作区所有者购买加量包或升级方案。" : "Ask a workspace owner to add a pack or move up a plan."}</p>}
            </div></footer>
          </Modal>
        )}
        <CommandBar open={cmdk} setOpen={setCmdk} />
        <Walkthrough />
      </div>
    </CollabCtx.Provider></AppCtx.Provider>
  );
}
