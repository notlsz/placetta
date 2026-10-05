import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audit, demoAgent, setFact, setField, type AgentBackend, type AgentEvent, type Reply, type Request, type Step } from "./agent";
import { AgentPanel } from "./AgentPanel";
import { Composer } from "./Composer";
import { AgentBot } from "./Bot";
import { AppCtx, type Ctx, type Tab, type View } from "./ctx";
import { ApproveModal, AppDrawer } from "./Drawer";
import { INITIAL_FEED, type FeedItem, type Turn } from "./feed";
import { API_MODELS, PERMANENT, apiModel, claudeModel, liveAgent, type Model, type Turn as Msg } from "./live";
import { applicationPdf, auditCsv, docBlob, downloads, saveFile } from "./files";
import { unlockAudio, useNarrow, useSpeak } from "./hooks";
import { S, fmt, type Key, type Lang } from "./i18n";
import { Logo } from "./Logo";
import { B, SAMPLE, same, type Bi, type Doc, type LicenseHit, type Workspace } from "./model";
import { AuditTrail, Applications, ContextPage, Deadlines, Documents, FindLicenses, Overview, Settings } from "./pages";
import { daysUntil, inDays, nowIso } from "./time";
import { I } from "./ui";

const KEY = "placetta-api-key", KEY_MODEL = "placetta-api-model";
const readKey = () => { try { return { key: localStorage.getItem(KEY) ?? "", model: localStorage.getItem(KEY_MODEL) ?? API_MODELS[0].id }; } catch { return { key: "", model: API_MODELS[0].id }; } };

const readLang = (): Lang => {
  try { const v = localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
};

const NAV: { v: View; k: Key; Icon: () => React.ReactElement }[] = [
  { v: "overview", k: "nav_overview", Icon: I.overview },
  { v: "apps", k: "nav_apps", Icon: I.apps },
  { v: "docs", k: "nav_docs", Icon: I.docs },
  { v: "deadlines", k: "nav_deadlines", Icon: I.deadlines },
  { v: "audit", k: "nav_audit", Icon: I.audit },
  { v: "context", k: "nav_context", Icon: I.context },
];

export default function App() {
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
  const dock = wide && panelOpen;
  const [view, setView] = useState<View>("overview");
  const [drawer, setDrawer] = useState<{ id: string; tab: Tab; edit: boolean } | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastT = useRef(0);
  const say = useCallback((s: string) => { setToast(s); clearTimeout(toastT.current); toastT.current = window.setTimeout(() => setToast(null), Math.max(2800, s.length * 55)); }, []);
  const main = useRef<HTMLElement>(null);
  const go = useCallback((v: View) => { setView(v); setNavOpen(false); main.current?.scrollTo({ top: 0 }); }, []);

  /* workspace and agent */
  const [ws, setWs] = useState<Workspace>(SAMPLE);
  const wsRef = useRef(ws);
  useEffect(() => { wsRef.current = ws; }, [ws]);
  const [feed, setFeed] = useState<FeedItem[]>(INITIAL_FEED);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [step, setStep] = useState<Step | null>(null);
  const [uploading, setUploading] = useState<{ app: string; item: string } | null>(null);
  const [match, setMatch] = useState<{ what: string; where: string; hits: LicenseHit[] } | null>(null);
  const [matching, setMatching] = useState(false);
  const [asked, setAsked] = useState<string[]>([]);
  const nextId = useRef(100);
  const nid = () => nextId.current++;
  const tts = useSpeak();
  const kept = useRef(new Map<string, File>());   // files you uploaded this session, so they download as themselves
  useEffect(() => { void downloads(); }, []);

  /* the model behind the agent: Claude in a viewer, the API with a key, or the demo script */
  const [model, setModel] = useState<Model | null>(null);
  const [apiName, setApiName] = useState("");
  const [deep, setDeep] = useState(false);
  const history = useRef<Msg[]>([]);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    let on = true;
    void claudeModel().then(m => {
      if (!on) return;
      if (m) { setModel(m); return; }
      const saved = readKey();
      if (saved.key) { setModel(apiModel(saved.key, saved.model)); setApiName(API_MODELS.find(x => x.id === saved.model)?.label ?? saved.model); }
    });
    return () => { on = false; };
  }, []);
  const modelRef = useRef<Model | null>(null);
  useEffect(() => { modelRef.current = model; }, [model]);

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
    const agent: AgentBackend = m ? liveAgent(m, history.current, kept.current, deep) : demoAgent;
    try {
      await agent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ((err as Error)?.name === "AbortError" ? "cancelled" : "upstream_error");
      if (code === "cancelled") upd(m2 => ({ reply: { text: [B("Stopped.", "已停止。")] }, active: -1, steps: m2.steps }));
      else if (m && PERMANENT.includes(code)) {
        // This view can't use Claude after all: say so once and answer from the demo script.
        setModel(null); say(t("liveOff"));
        upd(() => ({ steps: [], active: 0 }));
        try { await demoAgent.run(req, { lang, current: wsRef.current }, onEvent, ctl.signal); } catch { /* stopped */ }
      } else upd(() => ({ reply: { text: [code === "rate_limited" ? B("Claude is busy for your account right now. Try again in a little while.", "您的 Claude 账户暂时繁忙，请稍后再试。") : B("I couldn't reach Claude just now. Try again in a moment.", "暂时无法连接 Claude，请稍后再试。")] }, active: -1 }));
    }
    abort.current = null;
    busyRef.current = false; setBusy(false); setStep(null); setUploading(null); setMatching(false);
    if (voice && said) tts.speak(said, lang === "zh" ? "zh-CN" : "en-US");
    else if (said && !panelRef.current) say(said.split(/(?<=[.!?])\s+|(?<=[。！？])/)[0]);
  }, [lang, tts, say, t, deep]);

  const ask = useCallback((text: string, voice = false) => {
    const q = text.trim(); if (!q) return;
    setPanelOpen(true);
    run({ text: q }, q, voice);
  }, [run]);

  const approve = useCallback((id: string) => {
    const a = wsRef.current.approvals.find(x => x.id === id); if (!a) return;
    run({ approve: id }, `${S.approvedIt[lang]}: ${a.title[lang]}`);
  }, [run, lang]);

  const upload = useCallback((app: string, item: string, files?: File[]) => {
    files?.forEach(f => kept.current.set(f.name, f));
    if (!app) {
      // Straight to Documents, no application yet.
      if (!files?.length) return;
      const docs: Doc[] = files.map((f, i) => ({ id: `d-u-${Date.now().toString(36)}-${i}`, name: f.name, kind: (f.name.split(".").pop()?.toLowerCase() ?? "pdf") as Doc["kind"], size: f.size, by: "you", at: nowIso(), tag: B("Uploaded", "已上传") }));
      setWs(w => docs.reduce((acc, d) => audit("you", B("Uploaded", "上传"), same(d.name))({ ...acc, docs: [d, ...acc.docs] }), w));
      say(lang === "zh" ? `已添加到文件：${files.map(f => f.name).join("、")}` : `Added to Documents: ${files.map(f => f.name).join(", ")}`);
      return;
    }
    const list = (files ?? []).map(f => ({ name: f.name, size: f.size }));
    const shown = files?.length ? `${S.upload[lang]}: ${list.map(f => f.name).join(", ")}` : S.useSample[lang];
    run({ upload: { app, item, files: list } }, shown);
  }, [run, lang, say]);

  const save = useCallback(async (name: string, blob: Blob) => {
    const r = await saveFile(name, blob);
    if (r === "saved") say(t("t_saved")); else if (r === "unavailable") say(t("t_noDl"));
  }, [say, t]);

  const ctx: Ctx = useMemo(() => ({
    lang, t, b, ws, busy, live: step, uploading,
    mode: model ? model.kind : "demo", apiName, deep, setDeep,
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
    approve,
    upload,
    download: id => {
      const d = wsRef.current.docs.find(x => x.id === id); if (!d) return;
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
  }), [lang, t, b, ws, busy, step, uploading, model, apiName, deep, go, ask, run, approve, upload, save, say]);

  /* page */
  const page = {
    overview: <Overview />, apps: <Applications />, docs: <Documents />, deadlines: <Deadlines />, audit: <AuditTrail />, context: <ContextPage />,
    find: <FindLicenses result={match} live={matching ? (step ? step.label[lang] + "…" : t("working") + "…") : null} />, settings: <Settings />,
  }[view];
  const soon = ws.deadlines.filter(d => { const n = daysUntil(d.date); return n >= 0 && n <= 30; }).length;
  const badge: Partial<Record<View, number>> = { overview: ws.approvals.length, deadlines: soon };

  const side = (
    <nav className={"side" + (navOpen ? " open" : "")} aria-label="Workspace">
      <div className="side-top">
        <button type="button" className="brand" onClick={() => go("overview")} aria-label={t("nav_overview")}><Logo lang={lang} height={17} /></button>
        {phone && <button type="button" className="icbtn" onClick={() => setNavOpen(false)} aria-label={t("close")}><I.x /></button>}
      </div>
      <div className="wsname"><b>{b(ws.business)}</b><span>{t("sampleWs")}</span></div>
      <button type="button" className={"askb" + (panelOpen ? " on" : "")} onClick={() => { setPanelOpen(o => !o); setNavOpen(false); }}>
        <span className="ask-bot" aria-hidden="true"><AgentBot size={32} busy={busy} interactive={false} /></span>
        <span>{t("showPanel")}</span>
        {ws.approvals.length > 0 && <em>{ws.approvals.length}</em>}
      </button>
      <ul className="nav">
        {NAV.map(n => (
          <li key={n.v}><button type="button" aria-current={view === n.v ? "page" : undefined} onClick={() => go(n.v)}><n.Icon /><span>{t(n.k)}</span>{badge[n.v] ? <em>{badge[n.v]}</em> : null}</button></li>
        ))}
      </ul>
      <ul className="nav">
        <li><button type="button" aria-current={view === "find" ? "page" : undefined} onClick={() => go("find")}><I.find /><span>{t("nav_find")}</span></button></li>
      </ul>
      <p className="nav-h">{t("locations")}</p>
      <ul className="nav locs">
        {ws.locations.map(l => (
          <li key={l.id}><button type="button" onClick={() => {
            if (l.id === "fremont") { setMatch(m => m && /fremont|弗里蒙特/i.test(m.where) ? m : null); go("find"); if (!match || !/fremont|弗里蒙特/i.test(match.where)) void run({ match: { what: lang === "zh" ? "奶茶店" : "Milk tea shop", where: lang === "zh" ? "加州弗里蒙特" : "Fremont, CA" } }, null); }
            else go("overview");
          }}><I.pin /><span>{b(l.name)}<small>{b(l.county)}</small></span>{l.state === "mapping" && <em className="map">{t("mapping")}</em>}</button></li>
        ))}
      </ul>
      <div className="side-bot">
        <button type="button" className={"setb" + (view === "settings" ? " on" : "")} onClick={() => go("settings")}><I.settings /><span>{t("nav_settings")}</span></button>
        <div className="lang" role="group" aria-label={t("langSwitch")}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </div>
    </nav>
  );

  return (
    <AppCtx.Provider value={ctx}>
      <div className={"shell" + (dock ? " docked" : "") + (phone ? " phone" : "")}>
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
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </AppCtx.Provider>
  );
}
