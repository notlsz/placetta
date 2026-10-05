import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audit, demoAgent, dropApproval, setApp, setFact, setField, type AgentBackend, type AgentEvent, type Reply, type Request, type Step } from "./agent";
import { AgentPanel } from "./AgentPanel";
import { Composer } from "./Composer";
import { AgentBot } from "./Bot";
import { AppCtx, type CloudCtx, type Ctx, type Tab, type View } from "./ctx";
import { ApproveModal, AppDrawer } from "./Drawer";
import { INITIAL_FEED, type FeedItem, type Turn } from "./feed";
import { API_MODELS, PERMANENT, apiModel, claudeModel, liveAgent, serverModel, type Model, type Turn as Msg } from "./live";
import { applicationPdf, auditCsv, docBlob, downloads, saveFile } from "./files";
import { unlockAudio, useNarrow, useSpeak } from "./hooks";
import { S, fmt, type Key, type Lang } from "./i18n";
import { Logo, Mark } from "./Logo";
import { B, SAMPLE, same, type Bi, type Doc, type LicenseHit, type Workspace } from "./model";
import { AuditTrail, Applications, ContextPage, Deadlines, Documents, FindLicenses, Overview } from "./pages";
import { Settings } from "./Settings";
import { Stores } from "./Stores";
import { LegalReader } from "./Legal";
import { daysUntil, inDays, nowIso } from "./time";
import { I } from "./ui";
import * as api from "./cloud/api";
import { withServer, type CloudSession } from "./cloud/session";
import { Plans } from "./cloud/Plans";
import { Queue, QueueLocked } from "./cloud/Ops";

const KEY = "placetta-api-key", KEY_MODEL = "placetta-api-model";
const readKey = () => { try { return { key: localStorage.getItem(KEY) ?? "", model: localStorage.getItem(KEY_MODEL) ?? API_MODELS[0].id }; } catch { return { key: "", model: API_MODELS[0].id }; } };
const readFlag = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const writeFlag = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* storage blocked */ } };

const readLang = (): Lang => {
  try { const v = localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
};

const NAV: { v: View; k: Key; Icon: () => React.ReactElement }[] = [
  { v: "overview", k: "nav_overview", Icon: I.overview },
  { v: "stores", k: "nav_stores", Icon: I.store },
  { v: "apps", k: "nav_apps", Icon: I.apps },
  { v: "docs", k: "nav_docs", Icon: I.docs },
  { v: "deadlines", k: "nav_deadlines", Icon: I.deadlines },
  { v: "audit", k: "nav_audit", Icon: I.audit },
  { v: "context", k: "nav_context", Icon: I.context },
];

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
    try { localStorage.setItem("placetta-agent-lang", lang); } catch { /* storage blocked */ }
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
  const saveT = useRef(0);
  const lastSaved = useRef("");
  useEffect(() => {
    if (!cloud) return;
    clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => {
      const body = JSON.stringify(api.strip(ws));
      if (body !== lastSaved.current) { lastSaved.current = body; api.saveState(cloud.wsId, ws).catch(() => { lastSaved.current = ""; say(lang === "zh" ? "保存失败，稍后会重试。" : "Couldn't save. It will retry."); }); }
      const fresh = ws.audit.filter(a => !synced.current.has(a.id) && (a.actor === "you" || a.actor === "agent"));
      if (fresh.length) { fresh.forEach(a => synced.current.add(a.id)); api.logAudit(cloud.wsId, cloud.me.id, fresh).catch(() => fresh.forEach(a => synced.current.delete(a.id))); }
    }, 900);
  }, [cloud, ws, say, lang]);

  const refresh = useCallback(async (all = false) => {
    if (!cloud) return;
    try {
      const [f, d, bl, au] = await Promise.all([api.listFilings(cloud.wsId), api.listDocs(cloud.wsId), api.getBilling(cloud.wsId), api.listAudit(cloud.wsId)]);
      setFilings(f); setDocs(d); setBilling(bl);
      setWs(w => { const server = new Set(au.map(a => a.id)); au.forEach(a => synced.current.add(a.id)); return { ...w, audit: [...w.audit.filter(a => !server.has(a.id) && !synced.current.has(a.id)), ...au] }; });
      if (all) { const [i, l] = await Promise.all([api.listIntegrations(cloud.wsId), api.listLogins(cloud.wsId)]); setIntegrations(i); setLogins(l); }
    } catch { /* offline: try again next tick */ }
  }, [cloud]);
  useEffect(() => {
    if (!cloud) return;
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    const id = window.setInterval(tick, 20_000);
    const focus = () => void refresh(true);
    window.addEventListener("focus", focus);
    return () => { clearInterval(id); window.removeEventListener("focus", focus); };
  }, [cloud, refresh]);

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
  useEffect(() => { modelRef.current = model; }, [model]);

  const pushTurn = useCallback((shown: string | null, reply: Reply) => {
    setFeed(f => [...f, ...(shown ? [{ id: nid(), kind: "user" as const, text: shown }] : []), { id: nid(), kind: "turn" as const, at: nowIso(), steps: [], active: -1, reply }]);
    if (!panelRef.current) say(reply.text.map(x => x[lang]).join(" ").split(/(?<=[.!?])\s+|(?<=[。！？])/)[0]);
  }, [lang, say]);

  const run = useCallback(async (req: Request, shown: string | null, voice = false) => {
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
      }
    };
    const m = modelRef.current;
    const agent: AgentBackend = m ? liveAgent(m, history.current, kept.current, deep, { account: !!cloud, paths: paths.current }) : demoAgent;
    try {
      await agent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ((err as Error)?.name === "AbortError" ? "cancelled" : "upstream_error");
      if (code === "cancelled") upd(m2 => ({ reply: { text: [B("Stopped.", "已停止。")] }, active: -1, steps: m2.steps }));
      else if (code === "payment_required") { upd(() => ({ reply: { text: [B("Start with the entry plan and I'll map every license this business needs.", "先开通开店计划，我就为您梳理所需的全部许可。")] }, active: -1 })); setPlans("start"); }
      else if (!cloud && m && PERMANENT.includes(code)) {
        // This view can't use Claude after all: say so once and answer from the demo script.
        setModel(null); say(t("liveOff"));
        upd(() => ({ steps: [], active: 0 }));
        try { await demoAgent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal); } catch { /* stopped */ }
      } else upd(() => ({ reply: { text: [code === "rate_limited" ? B("The agent is busy right now. Try again in a little while.", "助理暂时繁忙，请稍后再试。") : code === "not_configured" ? B("The agent isn't set up on the server yet. Placetta's team has been told.", "服务器端尚未配置助理，已通知快哉团队。") : B("I couldn't reach the agent just now. Try again in a moment.", "暂时无法连接助理，请稍后再试。")] }, active: -1 }));
    }
    abort.current = null;
    busyRef.current = false; setBusy(false); setStep(null); setUploading(null); setMatching(false);
    if ((voice || voiceOn) && said) tts.speak(said, lang === "zh" ? "zh-CN" : "en-US");
    else if (said && !panelRef.current) say(said.split(/(?<=[.!?])\s+|(?<=[。！？])/)[0]);
  }, [lang, tts, say, t, deep, cloud, voiceOn]);

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
  const approve = useCallback(async (id: string) => {
    const w = wsRef.current, a = w.approvals.find(x => x.id === id); if (!a) return;
    const shown = `${S.approvedIt[lang]}: ${a.title[lang]}`;
    if (!cloud) { run({ approve: id }, shown); return; }
    if (!ownerOk()) return;
    if (a.kind === "pay") { if (a.url) window.open(a.url, "_blank", "noopener,noreferrer"); return; }
    if (a.kind === "file") {
      if (plan !== "monthly") { setPlans("file"); return; }
      const app = w.apps.find(x => x.id === a.app); if (!app) return;
      const appDocs = app.checklist.map(c => (c.doc ? w.docs.find(d => d.id === c.doc) : undefined));
      try {
        await api.requestFiling(cloud.wsId, {
          app_id: app.id, title: a.title, agency: app.agency, portal_url: app.source.url || undefined, fee_estimate: app.fees.reduce((s, f) => s + f.amount, 0),
          payload: {
            form: app.form, source: app.source, does: a.does,
            fields: app.fields.map(f => ({ label: f.label, value: f.value, from: f.from })),
            checklist: app.checklist.map((c, i) => ({ label: c.label, state: c.state, doc: appDocs[i]?.path })),
            attachments: appDocs.filter((d): d is Doc => !!d?.path).map(d => ({ name: d.name, path: d.path! })),
          },
        });
        setWs(x => setApp(app.id, { status: "filing" })(dropApproval(id)(x)));
        void refresh();
        setPanelOpen(true);
        pushTurn(shown, { text: [B(`Sent to Placetta's filing team. They check the ${app.name.en.toLowerCase()} against the agency's current requirements and submit it. If the agency charges a fee, you'll get its payment link here.`, `已交给快哉申报团队。他们会对照机构现行要求核对${app.name.zh}后提交。如需缴纳机构费用，付款链接会发到这里。`)] });
      } catch (e) {
        const er = e as api.ApiError;
        if (er.code === "plan_required") setPlans("file"); else say(er.message);
      }
      return;
    }
    if (a.kind === "send") {
      const to = a.data?.find(f => f.id === "to")?.value ?? "", body = a.data?.find(f => f.id === "msg")?.value ?? "";
      const mail = integrations.find(i => (i.kind === "gmail" || i.kind === "outlook_mail") && i.status === "connected");
      const email = to.match(/\S+@\S+\.\S+/)?.[0] ?? "";
      try {
        if (mail && email) {
          await api.integration(cloud.wsId, "mail_send", { kind: mail.kind, to: email, subject: a.title.en, body, approved: true });
          setWs(x => audit("you", B("Approved and sent", "批准并发送"), a.title, same(email))(dropApproval(id)(x)));
          say(lang === "zh" ? `已从 ${mail.account ?? "您的邮箱"} 发出。` : `Sent from ${mail.account ?? "your mailbox"}.`);
        } else {
          await navigator.clipboard?.writeText(body).catch(() => undefined);
          const tel = to.replace(/[^\d+]/g, "");
          if (email) window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(a.title.en)}&body=${encodeURIComponent(body)}`;
          else if (tel.length >= 10) window.location.href = `sms:${tel}?&body=${encodeURIComponent(body)}`;
          setWs(x => audit("you", B("Approved the message", "批准消息"), a.title, same(to))(dropApproval(id)(x)));
          say(lang === "zh" ? "消息已复制。连接邮箱后，批准即可直接发送。" : "Message copied. Connect your email in Settings and approving sends it.");
        }
      } catch (e) { say((e as api.ApiError).message); }
      return;
    }
    run({ approve: id }, shown);
  }, [run, lang, cloud, plan, refresh, pushTurn, say, integrations, ownerOk]);

  const upload = useCallback(async (app: string, item: string, files?: File[]) => {
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
  }, [run, lang, say, cloud, refresh]);

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
        say(url === "preview:billing" ? (lang === "zh" ? "预览：方案已开通（实际应用会跳转到 Stripe 付款）。" : "Preview: plan on. The live app takes payment through Stripe here.") : (lang === "zh" ? "预览：已连接（实际应用会跳转到对方网站授权）。" : "Preview: connected. The live app sends you to the provider to approve."));
        return;
      }
      window.location.href = url;
    };
    const fail = (e: unknown) => say((e as api.ApiError).message ?? String(e));
    return {
      email: cloud.me.email, staff: cloud.me.staff, staffEmail: cloud.me.staff_email, twoStep: cloud.me.two_step, role: cloud.role, owner,
      wsId: cloud.wsId, plan, billing, filings, integrations, logins, workspaces: cloud.workspaces,
      openPlans: r => { if (!ownerOk()) return; setPlans(r ?? "start"); },
      checkout: async (p, o) => { if (!ownerOk()) return; try { goTo((await api.checkout(cloud.wsId, p, o)).url); } catch (e) { fail(e); } },
      portal: async () => { if (!ownerOk()) return; try { goTo((await api.billingPortal(cloud.wsId)).url); } catch (e) { fail(e); } },
      connect: async kind => { if (!ownerOk()) return; try { goTo((await api.connectUrl(cloud.wsId, kind)).url); } catch (e) { fail(e); } },
      disconnect: async kind => { if (!ownerOk()) return; try { await api.integration(cloud.wsId, "disconnect", { kind }); setIntegrations(await api.listIntegrations(cloud.wsId)); } catch (e) { fail(e); } },
      saveLogin: async l => { if (!ownerOk()) return; try { await api.saveLogin(cloud.wsId, l); setLogins(await api.listLogins(cloud.wsId)); say(lang === "zh" ? "登录信息已加密保存。" : "Saved and encrypted."); } catch (e) { fail(e); } },
      removeLogin: async id => { if (!ownerOk()) return; try { await api.removeLogin(cloud.wsId, id); setLogins(await api.listLogins(cloud.wsId)); } catch (e) { fail(e); } },
      feedUrl: async rotate => (await api.integration<{ url: string }>(cloud.wsId, "feed_url", { rotate: !!rotate })).url,
      markPaid: async id => { if (!ownerOk()) return; try { await api.markPaid(id); await refresh(); say(lang === "zh" ? "已告知团队，他们会继续提交。" : "Thanks. The team will finish the submission."); } catch (e) { fail(e); } },
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
    approve: id => void approve(id),
    upload: (app, item, files) => void upload(app, item, files),
    download: async id => {
      const d = wsRef.current.docs.find(x => x.id === id); if (!d) return;
      if (cloud && d.path) { try { void save(d.name, await api.downloadDoc(d.path)); } catch (e) { say((e as api.ApiError).message); } return; }
      const own = kept.current.get(d.name);
      if (own && d.by === "you") { void save(d.name, own); return; }
      const f = docBlob(d, wsRef.current); void save(f.name, f.blob);
    },
    downloadApp: id => { const a = wsRef.current.apps.find(x => x.id === id); if (a) void save(a.name.en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-application.pdf", applicationPdf(a)); },
    exportAudit: () => void save(`placetta-audit-trail-${inDays(0)}.csv`, auditCsv(wsRef.current.audit)),
    editFields: (app, values) => {
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
      const f = wsRef.current.facts.find(x => x.id === id); if (!f) return;
      const text = B(`${f.label.en}: ${value}`, `${f.label.zh}：${value}`);
      setWs(w => audit("agent", B("Committed to memory", "存入记忆"), B("Context", "资料"), text)(audit("you", B("Edited fact", "修改资料"), f.label, same(value))(setFact({ ...f, value: same(value), source: B("You edited", "您修改的") })(w))));
      setFeed(fd => [...fd, { id: nid(), kind: "memory", text }]);
      say(`${t("committed")}: ${text[lang]}`);
    },
    updateStore: (id, f, log) => setWs(w => {
      const next = { ...w, stores: (w.stores ?? []).map(s => (s.id === id ? f(s) : s)) };
      return log ? audit("you", log.action, log.object, log.detail)(next) : next;
    }),
    say,
    openLegal: id => setLegal(id),
    cloud: cloudCtx,
  }), [lang, t, b, view_, busy, step, uploading, model, apiName, deep, voiceOn, go, ask, run, approve, upload, save, say, cloud, cloudCtx]);

  /* page */
  const page = {
    overview: <Overview />, stores: <Stores />, apps: <Applications />, docs: <Documents />, deadlines: <Deadlines />, audit: <AuditTrail />, context: <ContextPage />,
    find: <FindLicenses result={match} live={matching ? (step ? step.label[lang] + "…" : t("working") + "…") : null} />, settings: <Settings />,
    queue: cloud?.me.staff ? <Queue /> : cloud?.me.staff_email ? <QueueLocked /> : <Overview />,
  }[view];
  const soon = view_.deadlines.filter(d => { const n = daysUntil(d.date); return n >= 0 && n <= 30; }).length;
  const badge: Partial<Record<View, number>> = { overview: view_.approvals.length, deadlines: soon };
  const wsSub = cloud ? (plan === "monthly" ? b(PLAN_LABEL[billing?.subscription_plan ?? ""] ?? B("Monthly plan", "月度方案")) : plan === "entry" ? b(B("Entry plan", "开店计划")) : b(B("No plan yet", "尚未开通"))) : t("sampleWs");

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
