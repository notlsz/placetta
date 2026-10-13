import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speakTag } from "./langs";
import { audit, demoAgent, dropApproval, setApp, setFact, setField, type AgentBackend, type AgentEvent, type Reply, type Request, type Step } from "./agent";
import { applyChange, blockersSay, readyToFile } from "./core";
import { emptyBook } from "./memory";
import { AgentPanel } from "./AgentPanel";
import { Composer } from "./Composer";
import { AgentBot } from "./Bot";
import { AppCtx, type CloudCtx, type Ctx, type Signed, type Tab, type View } from "./ctx";
import { formById } from "./forms/registry";
import { ApproveModal, AppDrawer } from "./Drawer";
import { INITIAL_FEED, type FeedItem, type Turn } from "./feed";
import { API_MODELS, PERMANENT, apiModel, claudeModel, liveAgent, serverModel, type Model, type Services, type Turn as Msg } from "./live";
import { applicationPdf, auditCsv, docBlob, downloads, saveFile } from "./files";
import { applyAccent, saveTheme, unlockAudio, useNarrow, useSpeak } from "./hooks";
import { S, fmt, type Key, type Lang } from "./i18n";
import { Logo, Mark } from "./Logo";
import { B, SAMPLE, same, type Bi, type Doc, type LicenseHit, type UpdateItem, type Workspace } from "./model";
import { AuditTrail, Applications, ContextPage, Deadlines, Documents, FindLicenses, Overview, UpdatesPage } from "./pages";
import { Settings } from "./Settings";
import { Stores } from "./Stores";
import { Headquarters } from "./Headquarters";
import { LegalReader } from "./Legal";
import { daysUntil, inDays, nowIso } from "./time";
import { I } from "./ui";
import * as api from "./cloud/api";
import { normalize, withServer, type CloudSession } from "./cloud/session";
import { Plans } from "./cloud/Plans";
import { Queue, QueueLocked } from "./cloud/Ops";

const KEY = "placetta-api-key", KEY_MODEL = "placetta-api-model";
const readKey = () => { try { return { key: localStorage.getItem(KEY) ?? "", model: localStorage.getItem(KEY_MODEL) ?? API_MODELS[0].id }; } catch { return { key: "", model: API_MODELS[0].id }; } };
const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };

const readLang = (): Lang => {
  try { const v = localStorage.getItem("placetta-lang") ?? localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
};

const NAV: { v: View; k: Key; Icon: () => React.ReactElement }[] = [
  { v: "overview", k: "nav_overview", Icon: I.overview },
  { v: "updates", k: "nav_updates", Icon: I.bell },
  { v: "stores", k: "nav_stores", Icon: I.store },
  { v: "apps", k: "nav_apps", Icon: I.apps },
  { v: "docs", k: "nav_docs", Icon: I.docs },
  { v: "deadlines", k: "nav_deadlines", Icon: I.deadlines },
  { v: "audit", k: "nav_audit", Icon: I.audit },
  { v: "context", k: "nav_context", Icon: I.context },
];

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
})[u.kind];

const PLAN_LABEL: Record<string, Bi> = {
  starter: B("Starter plan", "入门版"), growth: B("Growth plan", "成长版"), scale: B("Scale plan", "规模版"),
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
  // the side menu folds down to icons on wider screens; remembered per browser
  const [slimPref, setSlimPref] = useState(() => readFlag("placetta-side-slim"));
  useEffect(() => writeFlag("placetta-side-slim", slimPref), [slimPref]);
  const dock = wide && panelOpen;
  const [view, setView] = useState<View>("overview");
  const [drawer, setDrawer] = useState<{ id: string; tab: Tab; edit: boolean } | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [legal, setLegal] = useState<string | null>(null);
  const [plans, setPlans] = useState<null | "start" | "file">(null);
  const [wsMenu, setWsMenu] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef(0);
  const say = useCallback((s: string) => { setToast(s); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), Math.max(2800, s.length * 55)); }, []);
  const main = useRef<HTMLElement>(null);
  const go = useCallback((v: View) => { setView(v); setNavOpen(false); setWsMenu(false); main.current?.scrollTo({ top: 0 }); }, []);
  useEffect(() => { if (cloud?.notice) say(cloud.notice); }, [cloud, say]);

  /* the workspace: the sample, or the account's saved one with the server's facts laid on top */
  const [ws, setWs] = useState<Workspace>(() => (cloud ? { ...cloud.initial, audit: cloud.audit } : SAMPLE));
  const [billing, setBilling] = useState(cloud?.billing ?? null);
  const [filings, setFilings] = useState(cloud?.filings ?? []);
  const [docs, setDocs] = useState(cloud?.docs ?? []);
  const [integrations, setIntegrations] = useState(cloud?.integrations ?? []);
  const [logins, setLogins] = useState(cloud?.logins ?? []);
  const [serverUpdates, setServerUpdates] = useState<api.UpdateRow[]>([]);
  const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
  const view_ = useMemo(() => (cloud ? withServer(ws, filings, docs) : ws), [cloud, ws, filings, docs]);
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
  const saveT = useRef(0);
  const lastSaved = useRef("");
  useEffect(() => {
    if (!cloud) return;
    clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      if (serverRun.current) return;   // the agent is saving on the server; take its result when it's done
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
      setWs(w => { const server = new Set(au.map(a => a.id)); au.forEach(a => synced.current.add(a.id)); return { ...w, audit: [...w.audit.filter(a => !server.has(a.id) && !synced.current.has(a.id)), ...au] }; });
      if (all) { const [i, l] = await Promise.all([api.listIntegrations(cloud.wsId), api.listLogins(cloud.wsId)]); setIntegrations(i); setLogins(l); }
    } catch { /* offline: try again next tick */ }
  }, [cloud]);
  useEffect(() => { if (cloud) void api.listUpdates(cloud.wsId).then(setServerUpdates, () => undefined); }, [cloud]);
  /* the Updates inbox: the monitor's updates in an account (worked out locally until its first run), the sample's otherwise */
  const updates = useMemo<UpdateItem[]>(() => {
    const base = cloud && serverUpdates.length
      ? serverUpdates.map(u => ({ id: u.id, kind: u.kind, title: u.title, body: u.body ?? undefined, app: u.app_id ?? undefined, at: u.created_at, read: !!u.read_at, prompt: askFor(u) }))
      : localUpdates(view_).map(u => ({ ...u, read: readLocal.has(u.id) }));
    if (!cloud) return base;
    const seen = new Set(base.map(u => u.title.en));
    const live = liveFilingUpdates(filings).filter(u => !seen.has(u.title.en)).map(u => ({ ...u, read: readLocal.has(u.id) }));
    return [...live, ...base].sort((x, y) => y.at.localeCompare(x.at));
  }, [cloud, serverUpdates, view_, readLocal, filings]);
  const readUpdates = useCallback(() => {
    if (!updates.some(u => !u.read)) return;
    setReadLocal(new Set(updates.map(u => u.id)));
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
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (cloud && !api.PREVIEW) {
      const m = wsRef.current.meta, loc = m?.city ? { city: m.city, region: m.region } : undefined;
      setModel(serverModel((body, d) => api.agentCall(cloud.wsId, body, { deep: d, location: loc }) as never));
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
    saveFile: async (file, appId) => { const row = await api.uploadDoc(cloud.wsId, file, appId); paths.current.set(file.name, row.path); void refreshRef.current(); return { path: row.path }; },
    readFile: path => api.downloadDoc(path),
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
        if (r.draft && r.draft !== draft) { draft = r.draft; onEvent({ type: "draft", text: draft }); }
        if (r.status !== "running") break;
        await new Promise(res => setTimeout(res, 900));
      }
      const row = await api.loadWorkspace(cloud.wsId);
      const next = normalize(row.name, row.state);
      lastSaved.current = JSON.stringify(api.strip(next));
      setWs(w => ({ ...next, audit: w.audit }));
      void refresh(true);
      if (r.status === "done" && r.reply) onEvent({ type: "reply", reply: r.reply });
      else if (r.status === "stopped") throw { code: "cancelled" };
      else throw { code: "run_failed", message: r.error ?? "" };
    } finally { serverRun.current = null; }
  }, [cloud, refresh]);

  const run = useCallback(async (req: Request, shown: string | null, voice = false, resumeId?: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    unlockAudio(); tts.stop();
    const aid = nid(), t0 = performance.now();
    setFeed(f => [...f, ...(shown ? [{ id: nid(), kind: "user" as const, text: shown }] : []), { id: aid, kind: "turn", at: nowIso(), steps: [], active: 0 }]);
    if ("text" in req) setAsked(a => [...a, req.text]);
    if ("upload" in req) setUploading({ app: req.upload.app, item: req.upload.item });
    if ("match" in req) { setMatching(true); setView("find"); }
    const upd = (f: (m: Turn) => Partial<Turn>) => setFeed(ms => ms.map(m => (m.id === aid && m.kind === "turn" ? { ...m, ...f(m) } : m)));
    let said = "";
    const ctl = new AbortController(); abort.current = ctl;
    const onEvent = (e: AgentEvent) => {
      if (e.type === "step") { setStep(e.step); upd(m => ({ steps: [...m.steps, e.step], active: e.index })); }
      else if (e.type === "update") setWs(e.patch);
      else if (e.type === "draft") upd(() => ({ draft: e.text }));
      else {
        const r: Reply = e.reply;
        upd(() => ({ reply: r, active: -1, ms: performance.now() - t0, draft: undefined }));
        said = r.text.map(x => x[lang]).join(" ");
        if (r.matches) setMatch(r.matches);
        if ("text" in req && modelRef.current) history.current.push({ role: "user", content: req.text }, { role: "assistant", content: said });
        // past chats, kept per person so the agent can search them later (Settings, Memory)
        if ("text" in req && cloud && said) { const me = cloud.me.id, at = nowIso(); setWs(w => ({ ...w, chats: { ...(w.chats ?? {}), [me]: [...(w.chats?.[me] ?? []), { at, role: "you" as const, text: req.text.slice(0, 2000) }, { at, role: "agent" as const, text: said.slice(0, 2000) }].slice(-300) } })); }
      }
    };
    const m = modelRef.current;
    const agent: AgentBackend = m ? liveAgent(m, history.current, kept.current, deep, { account: !!cloud, paths: paths.current, services, fallback: demoAgent }) : demoAgent;
    try {
      // In an account the agent works on the server, so it carries on if the app is closed.
      const id = resumeId ?? (cloud && !api.PREVIEW && "text" in req && m ? await api.startRun(cloud.wsId, { prompt: req.text, history: history.current.slice(-12), lang, deep }) : null);
      if (id) await follow(id, onEvent, ctl.signal);
      else await agent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ((err as Error)?.name === "AbortError" ? "cancelled" : "upstream_error");
      if (code === "cancelled") upd(m2 => ({ reply: { text: [B("Stopped.", "已停止。")] }, active: -1, steps: m2.steps }));
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
  }, [lang, tts, say, t, deep, cloud, voiceOn, services, follow]);

  /* Back in the app: follow a task still running on the server, or show one that finished while it was closed. */
  const resumed = useRef(false);
  useEffect(() => {
    if (!cloud || api.PREVIEW || resumed.current) return;
    resumed.current = true;
    void api.recentRuns(cloud.wsId).then(rs => {
      const live = rs.find(r => r.status === "running");
      if (live) { setPanelOpen(true); void run({ text: live.prompt }, live.prompt, false, live.id); return; }
      const missed = rs.find(r => r.status === "done" && r.reply && (!r.seen_at || Date.parse(r.updated_at) - Date.parse(r.seen_at) > 20_000));
      if (missed?.reply) { pushTurn(missed.prompt, missed.reply); setPanelOpen(true); void api.pollRun(missed.id).catch(() => undefined); }
    }, () => undefined);
  }, [cloud, run, pushTurn]);

  const ask = useCallback((text: string, voice = false) => {
    const q = text.trim(); if (!q) return;
    setPanelOpen(true);
    run({ text: q }, q, voice);
  }, [run]);

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
    if (!serverRun.current) return false;
    say(lang === "zh" ? "快哉正在处理工作区，完成后（或停止后）再修改。" : "Placetta is working on the workspace. Make changes when it's done, or stop it.");
    return true;
  }, [say, lang]);

  /* An approval that met the plan wall: kept (in this browser, so it survives the trip to Stripe) and sent to the team
     as soon as the annual plan is on, as the plans sheet promises. */
  const PENDING = "placetta-pending-filing";
  const hold = (id: string | null) => { try { if (id) localStorage.setItem(PENDING, id); else localStorage.removeItem(PENDING); } catch { /* storage blocked */ } pendingFiling.current = id; };
  const pendingFiling = useRef<string | null>((() => { try { return localStorage.getItem(PENDING); } catch { return null; } })());

  const approve = useCallback(async (id: string, sig?: Signed) => {
    if (held()) return;
    const w = wsRef.current, a = w.approvals.find(x => x.id === id); if (!a) return;
    const shown = `${S.approvedIt[lang]}: ${a.title[lang]}`;
    // every kind of filing: nothing goes out with an empty field or a missing document
    const filingApp = a.kind === "file" ? w.apps.find(x => x.id === a.app) : undefined;
    if (filingApp && !readyToFile(filingApp)) { say(blockersSay(filingApp)[lang]); return; }
    if (a.kind === "change" && a.change) {
      const c = a.change;
      setWs(x => audit("you", B("Confirmed a change", "确认更改"), a.title)(dropApproval(id)(applyChange(c)(x))));
      say(lang === "zh" ? "已更改。" : "Done. It's changed.");
      return;
    }
    if (!cloud) { run({ approve: id }, shown); return; }
    if (!ownerOk()) return;
    if (a.kind === "pay") { if (a.url) window.open(a.url, "_blank", "noopener,noreferrer"); return; }
    if (a.kind === "file") {
      if (plan !== "monthly") { hold(id); setPlans("file"); return; }
      const app = w.apps.find(x => x.id === a.app); if (!app) return;
      const appDocs = app.checklist.map(c => (c.doc ? w.docs.find(d => d.id === c.doc) : undefined));
      try {
        // The agency's own form, filled (and signed when the agency takes a drawn signature), saved before approval
        // so its path is part of what the customer approves.
        const off = app.official ? formById(app.official) : undefined;
        let pdf_path: string | undefined, signature: api.FilingPayload["signature"];
        if (off?.fill) {
          const { fillOfficial, stampSignature } = await import("./forms/fill");
          const blob = await fillOfficial(off.id, app.fields);
          if (blob) {
            let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
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
            form: app.form, source: app.source, does: a.does, official: app.official, pdf_path, signature,
            fields: app.fields.map(f => ({ id: f.id, label: f.label, value: f.value, from: f.from })),
            checklist: app.checklist.map((c, i) => ({ label: c.label, state: c.state, doc: appDocs[i]?.path })),
            attachments: appDocs.filter((d): d is Doc => !!d?.path).map(d => ({ name: d.name, path: d.path! })),
          },
        });
        setWs(x => setApp(app.id, { status: "filing" })(dropApproval(id)(x)));
        const v = await api.fileNow(cloud.wsId, filing.id).catch(() => null);
        void refresh();
        setPanelOpen(true);
        const st = v?.filing.agent_state, last = v?.filing.agent_log?.at(-1);
        pushTurn(shown, { text: [st === "handoff" || !v
          ? B(`Sent to the Placetta team. They check the ${app.name.en.toLowerCase()} against the agency's current requirements and submit it. If the agency charges a fee, you'll get its payment link here.`, `已交给快哉团队。他们会对照机构现行要求核对${app.name.zh}后提交。如需缴纳机构费用，付款链接会发到这里。`)
          : st === "needs_you" && last ? B(`One step needs you first: ${last.en}`, `需要您先完成一步：${last.zh}`)
          : B(`Filing it now: Placetta checked the ${app.name.en.toLowerCase()} against the agency's requirements and is submitting it. Progress shows live on the application.`, `正在提交：快哉已对照机构要求核对${app.name.zh}，正在提交。进度会实时显示在申请中。`)] });
      } catch (e) {
        const er = e as api.ApiError;
        if (er.code === "plan_required") { hold(id); setPlans("file"); } else say(er.message);
      }
      return;
    }
    if (a.kind === "send") {
      const to = a.data?.find(f => f.id === "to")?.value ?? "", body = a.data?.find(f => f.id === "msg")?.value ?? "";
      const subject = a.data?.find(f => f.id === "subject")?.value || a.title.en;
      const mail = integrations.find(i => (i.kind === "gmail" || i.kind === "outlook_mail") && i.status === "connected");
      const email = to.match(/\S+@\S+\.\S+/)?.[0] ?? "";
      try {
        if (mail && email) {
          const emails = to.split(/[,;\s]+/).filter(x => /\S+@\S+\.\S+/.test(x));
          await api.integration(cloud.wsId, "mail_send", { kind: mail.kind, to: emails.length > 1 ? emails : email, subject, body, approved: true });
          setWs(x => audit("you", B("Approved and sent", "批准并发送"), a.title, same(email))(dropApproval(id)(x)));
          say(lang === "zh" ? `已从 ${mail.account ?? "您的邮箱"} 发出。` : `Sent from ${mail.account ?? "your mailbox"}.`);
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
  }, [run, lang, cloud, plan, refresh, pushTurn, say, integrations, ownerOk, held]);
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
    const fail = (e: unknown) => say((e as api.ApiError).message ?? String(e));
    return {
      email: cloud.me.email, staff: cloud.me.staff, staffEmail: cloud.me.staff_email, twoStep: cloud.me.two_step, role: cloud.role, owner,
      wsId: cloud.wsId, plan, billing, filings, integrations, logins, workspaces: cloud.workspaces, hq: cloud.hq,
      openPlans: r => { if (!ownerOk()) return; setPlans(r ?? "start"); },
      checkout: async (p, o) => { if (!ownerOk()) return; try { goTo((await api.checkout(cloud.wsId, p, o)).url); } catch (e) { fail(e); } },
      portal: async () => { if (!ownerOk()) return; try { goTo((await api.billingPortal(cloud.wsId)).url); } catch (e) { fail(e); } },
      connect: async kind => { if (!ownerOk()) return; try { goTo((await api.connectUrl(cloud.wsId, kind)).url); } catch (e) { if ((e as api.ApiError).code === "not_configured") say(lang === "zh" ? "这个连接即将开放。在此之前，可把机构来信转发到 support@placetta.com，团队会帮您添加。" : "This connection opens soon. Until then, forward agency emails to support@placetta.com and the team adds them for you."); else fail(e); } },
      disconnect: async kind => { if (!ownerOk()) return; try { await api.integration(cloud.wsId, "disconnect", { kind }); setIntegrations(await api.listIntegrations(cloud.wsId)); } catch (e) { fail(e); } },
      saveLogin: async l => { if (!ownerOk()) return; try { await api.saveLogin(cloud.wsId, l); setLogins(await api.listLogins(cloud.wsId)); say(lang === "zh" ? "登录信息已加密保存。" : "Saved and encrypted."); } catch (e) { fail(e); } },
      removeLogin: async id => { if (!ownerOk()) return; try { await api.removeLogin(cloud.wsId, id); setLogins(await api.listLogins(cloud.wsId)); } catch (e) { fail(e); } },
      feedUrl: async rotate => (await api.integration<{ url: string }>(cloud.wsId, "feed_url", { rotate: !!rotate })).url,
      markPaid: async id => { if (!ownerOk()) return; try { await api.markPaid(id); await refresh(); say(lang === "zh" ? "已告知团队，他们会继续提交。" : "Thanks. The team will finish the submission."); } catch (e) { fail(e); } },
      resumeFiling: async id => { try { await api.resumeFiling(cloud.wsId, id); await refresh(); say(lang === "zh" ? "好的，快哉继续办理。" : "Thanks. Placetta carries on."); } catch (e) { fail(e); } },
      uploadSigned: async (id, appId, file) => {
        try {
          const row = await api.uploadDoc(cloud.wsId, file, appId);
          await api.signedCopy(cloud.wsId, id, row.path); await refresh();
          say(lang === "zh" ? "已收到签名件，快哉正在传真给机构。" : "Got the signed copy. Placetta is faxing it to the agency.");
        } catch (e) { fail(e); }
      },
      cancelFiling: async id => { if (!ownerOk()) return; try { await api.cancelFiling(id); await refresh(); } catch (e) { fail(e); } },
      exportData: () => {
        const data = { exported: nowIso(), workspace: api.strip(wsRef.current), audit: wsRef.current.audit, filings, documents: docs.map(d => ({ name: d.name, size: d.size, created_at: d.created_at, source: d.source })) };
        void save(`placetta-data-${inDays(0)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      },
      switchTo: cloud.switchTo, newWorkspace: cloud.newWorkspace, signOut: cloud.signOut, reopen: cloud.reopen,
    };
  }, [cloud, plan, billing, filings, integrations, logins, docs, say, lang, refresh, save, owner, ownerOk]);

  const ctx: Ctx = useMemo(() => ({
    lang, t, b, setLang, ws: view_, busy, live: step, uploading,
    mode: model ? model.kind : "demo", apiName, deep, setDeep, voiceOn, setVoiceOn,
    stop: () => abort.current?.abort(),
    applyKey: (key, id, remember) => {
      setModel(apiModel(key, id)); setApiName(API_MODELS.find(x => x.id === id)?.label ?? id);
      try { if (remember) { localStorage.setItem(KEY, key); localStorage.setItem(KEY_MODEL, id); } else { localStorage.removeItem(KEY); localStorage.removeItem(KEY_MODEL); } } catch { /* storage blocked */ }
    },
    dropKey: () => { setModel(null); setApiName(""); try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_MODEL); } catch { /* storage blocked */ } },
    go,
    ask,
    run: (req, shown) => { if ("text" in req) setPanelOpen(true); void run(req, shown); },
    openApp: (id, tab, edit) => { const a = wsRef.current.apps.find(x => x.id === id); setDrawer({ id, tab: tab ?? (a && a.status === "ready" ? "form" : "check"), edit: !!edit }); },
    openApproval: id => setModal(id),
    approve: (id, sig) => void approve(id, sig),
    upload: (app, item, files) => void upload(app, item, files),
    download: async id => {
      const d = wsRef.current.docs.find(x => x.id === id); if (!d) return;
      if (cloud && d.path) { try { void save(d.name, await api.downloadDoc(d.path)); } catch (e) { say((e as api.ApiError).message); } return; }
      const own = kept.current.get(d.name);
      if (own && (d.by === "you" || d.by === "agent")) { void save(d.name, own); return; }
      const f = docBlob(d, wsRef.current); void save(f.name, f.blob);
    },
    downloadApp: id => { const a = wsRef.current.apps.find(x => x.id === id); if (a) void save(a.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-application.pdf", applicationPdf(a)); },
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
      setWs(w => audit("agent", B("Committed to memory", "存入记忆"), B("Context", "资料"), text)(audit("you", B("Edited fact", "修改资料"), f.label, same(value))(setFact({ ...f, value: same(value), source: B("You edited", "您修改的") })(w))));
      setFeed(fd => [...fd, { id: nid(), kind: "memory", text }]);
      say(`${t("committed")}: ${text[lang]}`);
    },
    memory: cloud ? view_.memories?.[cloud.me.id] ?? emptyBook() : null,
    editWs: f => setWs(f),
    setMemory: f => { if (cloud) { const me = cloud.me.id; setWs(w => ({ ...w, memories: { ...(w.memories ?? {}), [me]: f(w.memories?.[me] ?? emptyBook()) } })); } },
    updateStore: (id, f, log) => !held() && setWs(w => {
      const next = { ...w, stores: (w.stores ?? []).map(s => (s.id === id ? f(s) : s)) };
      return log ? audit("you", log.action, log.object, log.detail)(next) : next;
    }),
    say,
    openLegal: id => setLegal(id),
    cloud: cloudCtx,
    updates, readUpdates,
  }), [lang, t, b, view_, busy, step, uploading, model, apiName, deep, voiceOn, go, ask, run, approve, upload, save, say, cloud, cloudCtx, updates, readUpdates, held]);

  /* page */
  const page = {
    overview: <Overview />, updates: <UpdatesPage />, stores: <Stores />, apps: <Applications />, docs: <Documents />, deadlines: <Deadlines />, audit: <AuditTrail />, context: <ContextPage />,
    find: <FindLicenses result={match} live={matching ? (step ? step.label[lang] + "…" : t("working") + "…") : null} />, settings: <Settings />,
    queue: cloud?.me.staff ? <Queue /> : cloud?.me.staff_email ? <QueueLocked /> : <Overview />,
    hq: cloud?.hq.length ? <Headquarters lang={lang} initial={cloud.hq} /> : <Overview />,
  }[view];
  const soon = view_.deadlines.filter(d => { const n = daysUntil(d.date); return n >= 0 && n <= 30; }).length;
  const badge: Partial<Record<View, number>> = { overview: view_.approvals.length, updates: updates.filter(u => !u.read).length, deadlines: soon };
  const wsSub = cloud ? (billing?.free && !billing.subscription_status ? b(B("Early access", "抢先体验")) : plan === "monthly" ? b(PLAN_LABEL[billing?.subscription_plan ?? ""] ?? B("Monthly plan", "月度方案")) : plan === "entry" ? b(B("Entry plan", "开店计划")) : b(B("No plan yet", "尚未开通"))) : t("sampleWs");

  const slim = slimPref && !phone;
  const side = (
    <nav className={"side" + (navOpen ? " open" : "")} aria-label="Workspace">
      <div className="side-top">
        <button type="button" className="brand" onClick={() => go("overview")} aria-label={t("nav_overview")}>{slim ? <Mark size={22} /> : <Logo lang={lang} height={17} />}</button>
        {phone
          ? <button type="button" className="icbtn" onClick={() => setNavOpen(false)} aria-label={t("close")}><I.x /></button>
          : <button type="button" className="slimb" onClick={() => setSlimPref(v => !v)} aria-label={t(slim ? "expandMenu" : "collapseMenu")} title={t(slim ? "expandMenu" : "collapseMenu")} aria-expanded={!slim}><I.panel /></button>}
      </div>
      <div className="wsname-wrap">
        <button type="button" className="wsname" onClick={() => cloud && setWsMenu(o => !o)} aria-haspopup={cloud ? "menu" : undefined} aria-expanded={cloud ? wsMenu : undefined} disabled={!cloud}>
          <b>{b(view_.business)}</b><span>{wsSub}</span>{cloud && <I.chev />}
        </button>
        {cloud && wsMenu && (
          <div className="wsmenu" role="menu">
            {cloud.workspaces.map(x => <button key={x.id} type="button" role="menuitem" aria-current={x.id === cloud.wsId} onClick={() => { setWsMenu(false); if (x.id !== cloud.wsId) cloud.switchTo(x.id); }}>{x.name}{x.id === cloud.wsId && <I.check />}</button>)}
            <button type="button" role="menuitem" onClick={() => { setWsMenu(false); cloud.newWorkspace(); }}><I.plus />{b(B("New business", "新建企业"))}</button>
            <a role="menuitem" href="/"><I.globe />{b(B("Placetta website", "快哉官网"))}</a>
            <button type="button" role="menuitem" onClick={() => { setWsMenu(false); cloud.signOut(); }}><I.logout />{b(B("Sign out", "退出登录"))}</button>
          </div>
        )}
      </div>
      <button type="button" className={"askb" + (panelOpen ? " on" : "")} onClick={() => { setPanelOpen(o => !o); setNavOpen(false); }} title={slim ? t("showPanel") : undefined}>
        <span className="ask-bot" aria-hidden="true"><AgentBot size={32} busy={busy} interactive={false} /></span>
        <span>{t("showPanel")}</span>
        {view_.approvals.length > 0 && <em>{view_.approvals.length}</em>}
      </button>
      <ul className="nav">
        {NAV.map(n => (
          <li key={n.v}><button type="button" aria-current={view === n.v ? "page" : undefined} onClick={() => go(n.v)} title={slim ? t(n.k) : undefined}><n.Icon /><span>{t(n.k)}</span>{badge[n.v] ? <em>{badge[n.v]}</em> : null}</button></li>
        ))}
      </ul>
      <ul className="nav">
        <li><button type="button" aria-current={view === "find" ? "page" : undefined} onClick={() => go("find")} title={slim ? t("nav_find") : undefined}><I.find /><span>{t("nav_find")}</span></button></li>
        {!!cloud?.hq.length && <li><button type="button" aria-current={view === "hq" ? "page" : undefined} onClick={() => go("hq")} title={slim ? t("nav_hq") : undefined}><I.hq /><span>{t("nav_hq")}</span></button></li>}
        {(cloud?.me.staff || cloud?.me.staff_email) && <li><button type="button" aria-current={view === "queue" ? "page" : undefined} onClick={() => go("queue")} title={slim ? t("nav_queue") : undefined}><I.queue /><span>{t("nav_queue")}</span></button></li>}
      </ul>
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
        <button type="button" className={"setb" + (view === "settings" ? " on" : "")} onClick={() => go("settings")} title={slim ? t("nav_settings") : undefined}><I.settings /><span>{t("nav_settings")}</span></button>
        <div className="lang" role="group" aria-label={t("langSwitch")}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </div>
    </nav>
  );

  return (
    <AppCtx.Provider value={ctx}>
      <div className={"shell" + (dock ? " docked" : "") + (phone ? " phone" : "") + (slim ? " slim" : "")}>
        {side}
        {phone && navOpen && <div className="navscrim" onClick={() => setNavOpen(false)} />}
        <div className="mainwrap">
          {phone && (
            <header className="mbar">
              <button type="button" className="icbtn" onClick={() => setNavOpen(true)} aria-label="Menu"><I.menu /></button>
              <button type="button" className="brand" onClick={() => go("overview")} aria-label={t("nav_overview")}><Logo lang={lang} height={16} /></button>
              <div className="lang" role="group" aria-label={t("langSwitch")}>
                <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
                <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
              </div>
            </header>
          )}
          <main className={"content" + (view === "overview" ? " wash" : "")} ref={main}>{page}</main>
          {!panelOpen && <div className="dockbar"><Composer variant="dock" tts={tts} asked={asked} showLive={view !== "overview" && view !== "find"} /></div>}
        </div>
        {panelOpen && <AgentPanel feed={feed} tts={tts} mode={dock ? "dock" : "sheet"} onHide={() => setPanelOpen(false)} asked={asked} />}
        {drawer && <AppDrawer id={drawer.id} tab={drawer.tab} edit={drawer.edit} onTab={tab => setDrawer(d => (d ? { ...d, tab, edit: false } : d))} onClose={() => setDrawer(null)} />}
        {modal && <ApproveModal id={modal} onClose={() => setModal(null)} />}
        {legal && <LegalReader id={legal} onClose={() => setLegal(null)} />}
        {plans && cloudCtx && <Plans reason={plans} onClose={() => setPlans(null)} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </AppCtx.Provider>
  );
}
