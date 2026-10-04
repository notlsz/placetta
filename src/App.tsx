import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { demoAgent, type AgentBackend, type Reply, type Request, type Step } from "./agent";
import { SAMPLE_CASE, SUGGESTIONS, WELCOME, type Approval, type Autonomy, type Bi, type Case, type Level } from "./model";
import { STRINGS, fmt, type Key, type Lang } from "./i18n";
import { Logo } from "./Logo";
import { useNarrow, useSimulatedVoice, useSpeak, useSpeechToText } from "./hooks";
import { ApprovalCard, I, LevelTag, ResolvedCard, StatusChip } from "./ui";

const agent: AgentBackend = demoAgent;

type View = "agent" | "filings" | "needs" | "activity" | "connections";
type AgentTurn = { id: number; role: "agent"; steps: Step[]; active: number; reply?: Reply; ms?: number };
type Msg = { id: number; role: "user"; text: string } | AgentTurn;

const ORB_INK = "#3E77BA";             // the orbs' dots, in the app's light blue
const BEAM = ["#7AAEE6", "#9CC8F4", "#6FA3DD", "#86D2EC", "#B7CCF6", "#A6DDF2", "#C4BDF4"];
const BAND = { core: "#FFFFFF", above: "#8FBDEE", mid: "#BFD9F7", below: "#9ED6EE" };
const LEVELS: Level[] = ["federal", "state", "county", "city"];
const DONE = ["approved", "filed"];

const readLang = (): Lang => {
  try { const v = localStorage.getItem("placetta-agent-lang"); if (v === "en" || v === "zh") return v; } catch { /* storage blocked */ }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
};
const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
const micAllowedHere = () => {
  const d = document as unknown as { permissionsPolicy?: { allowsFeature(f: string): boolean }; featurePolicy?: { allowsFeature(f: string): boolean } };
  const p = d.permissionsPolicy ?? d.featurePolicy;
  try { return p ? p.allowsFeature("microphone") : true; } catch { return true; }
};

export default function App() {
  /* ---------------- language ---------------- */
  const [lang, setLang] = useState<Lang>(readLang);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => (v ? fmt(STRINGS[lang][k], v) : STRINGS[lang][k]), [lang]);
  const b = useCallback((x: Bi) => x[lang], [lang]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("placetta-agent-lang", lang); } catch { /* storage blocked */ }
  }, [lang]);

  const narrow = useNarrow(1024);
  const wide = !useNarrow(1320);
  const [view, setView] = useState<View>("agent");

  /* ---------------- the case the agent is working on ---------------- */
  const [kase, setKase] = useState<Case>(SAMPLE_CASE);
  const [autonomy, setAutonomy] = useState<Autonomy>("submit");

  /* ---------------- conversation ---------------- */
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "agent", steps: [], active: -1, reply: { text: WELCOME.text, approvals: ["a-docs"] } }]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const tts = useSpeak();

  const run = useCallback(async (req: Request, shown: string, voice = false) => {
    if (running) return;
    const uid = nextId.current++, aid = nextId.current++, t0 = performance.now();
    setMsgs(m => [...m, { id: uid, role: "user", text: shown }, { id: aid, role: "agent", steps: [], active: 0 }]);
    if ("text" in req) setAsked(a => [...a, req.text]);
    setRunning(true); setView("agent");
    const upd = (f: (m: AgentTurn) => Partial<AgentTurn>) => setMsgs(ms => ms.map(m => (m.id === aid && m.role === "agent" ? { ...m, ...f(m) } : m)));
    let said = "";
    try {
      await agent.run(req, { lang, autonomy, current: kase }, e => {
        if (e.type === "step") { setStep(e.step); upd(m => ({ steps: [...m.steps, e.step], active: e.index })); }
        else if (e.type === "update") setKase(e.patch);
        else { upd(() => ({ reply: e.reply, active: -1, ms: performance.now() - t0 })); said = e.reply.text.map(b).join(" "); }
      }, new AbortController().signal);
    } catch { /* stopped */ }
    setRunning(false); setStep(null);
    if (voice && said) tts.speak(said, lang === "zh" ? "zh-CN" : "en-US");
  }, [running, lang, autonomy, kase, b, tts]);

  const ask = useCallback((text: string, voice = false) => { const q = text.trim(); if (q) { setDraft(""); run({ text: q }, q, voice); } }, [run]);
  const approve = useCallback((a: Approval, files?: string[]) => run({ approve: a.id, files }, t("approvedMsg", { x: b(a.title) })), [run, t, b]);

  /* ---------------- voice ---------------- */
  const mic = useMicrophone();
  const sim = useSimulatedVoice();
  const [voice, setVoice] = useState<"off" | "mic" | "sim">("off");
  const [heard, setHeard] = useState("");
  const [note, setNote] = useState<"" | "simNote" | "deniedNote" | "noSttNote">("");
  const stt = useSpeechToText(useCallback((s: string) => setHeard(s), []));
  const typer = useRef<number[]>([]);
  const clearTyper = () => { typer.current.forEach(clearTimeout); typer.current = []; };
  const listening = (voice === "mic" && mic.state === "live") || voice === "sim";

  const endVoice = useCallback((send: boolean, text?: string) => {
    clearTyper(); mic.stop(); stt.stop(); sim.stop(); setVoice("off");
    const said = (text ?? heard).trim(); setHeard("");
    if (send && said) ask(said, true);
  }, [mic, stt, sim, ask, heard]);

  // No microphone here: a speech-shaped level drives the glow while the next suggestion is "heard", then it sends like a real turn.
  const simulate = useCallback(() => {
    const line = b(SUGGESTIONS.find(s => !asked.includes(b(s))) ?? SUGGESTIONS[0]);
    setVoice("sim"); setNote("simNote"); sim.start(); setHeard("");
    const per = lang === "zh" ? 200 : 64;
    for (let i = 1; i <= line.length; i++) typer.current.push(window.setTimeout(() => setHeard(line.slice(0, i)), 500 + i * per));
    typer.current.push(window.setTimeout(() => endVoice(true, line), 500 + line.length * per + 900));
  }, [asked, b, lang, sim, endVoice]);

  const startVoice = useCallback(async () => {
    if (running) return;
    tts.stop(); setNote(""); setHeard(""); setView("agent");
    if (!mic.supported || !micAllowedHere()) { simulate(); return; }
    const s = await mic.start();
    if (s) { setVoice("mic"); if (!stt.start(lang === "zh" ? "zh-CN" : "en-US")) setNote("noSttNote"); return; }
    if (inFrame) simulate(); else setNote("deniedNote");
  }, [running, tts, mic, simulate, stt, lang]);

  useEffect(() => () => clearTyper(), []);

  /* ---------------- derived ---------------- */
  const orbState: OrbState = listening ? "listening" : running && step ? step.state : tts.speaking ? "composing" : "breathing";
  const status = listening ? t("listening") : running && step ? b(step.label) : tts.speaking ? t("speaking") : t("ready");
  const done = kase.filings.filter(f => DONE.includes(f.status)).length;
  const open = useMemo(() => SUGGESTIONS.filter(s => !asked.includes(s.en) && !asked.includes(s.zh)), [asked]);
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs, kase.approvals.length]);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }, [draft]);

  const nav: { v: View; icon: () => ReactElement; label: string; count?: number }[] = [
    { v: "agent", icon: I.agent, label: t("nav_agent") },
    { v: "filings", icon: I.filings, label: t("nav_filings"), count: kase.filings.length },
    { v: "needs", icon: I.needs, label: t("nav_needs"), count: kase.approvals.length },
    { v: "activity", icon: I.activity, label: t("nav_activity") },
    { v: "connections", icon: I.connections, label: t("nav_connections") },
  ];

  const langToggle = (
    <div className="lang" role="group" aria-label={t("langSwitch")}>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
      <span aria-hidden="true">/</span>
      <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
    </div>
  );

  const runningList = (
    <ul className="tasks">
      {kase.running.map(r => (
        <li key={r.id}>
          <ThinkingOrb state={r.state} size={20} theme="light" color={ORB_INK} aria-label={b(r.label)} />
          <div><span>{b(r.label)}</span>{r.detail && <small>{b(r.detail)}</small>}</div>
        </li>
      ))}
    </ul>
  );

  /* ---------------- views ---------------- */
  const agentView = (
    <section className="agentv">
      <div className="brief">
        <div className="brief-case">
          <span className="tag">{t("sample")}</span>
          <h1>{b(kase.name)}</h1>
          <p className="sub">{t("goal", { g: b(kase.goal) })}<span className="dot" aria-hidden="true" />{b(kase.place)}</p>
          <div className="prog">
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={kase.filings.length} aria-valuenow={done}><i style={{ width: `${(done / kase.filings.length) * 100}%` }} /></div>
            <span>{t("progress", { d: done, n: kase.filings.length })}</span>
          </div>
          <div className="pills">
            <button type="button" className="pill" onClick={() => setView("activity")}><span className="live" />{t("runningCount", { n: kase.running.length })}</button>
            <button type="button" className={"pill" + (kase.approvals.length ? " warn" : "")} onClick={() => setView("needs")}>{t("needsCount", { n: kase.approvals.length })}</button>
            <button type="button" className="pill plain" onClick={() => setView("connections")}>{t("autonomyNow", { x: t(("au_" + autonomy) as Key) })}</button>
          </div>
        </div>
        <div className="me">
          <ThinkingOrb state={orbState} size={64} theme="light" color={ORB_INK} aria-label={status} />
          <div><b>{t("agentName")}</b><span aria-live="polite">{status}</span></div>
        </div>
      </div>

      <div className="thread" ref={scroller}>
        {msgs.map(m => m.role === "user"
          ? <div key={m.id} className="msg user"><p>{m.text}</p></div>
          : <AgentMsg key={m.id} m={m} b={b} t={t} busy={running} pending={kase.approvals} closed={kase.closed} onApprove={approve} />)}
      </div>

      <div className="dock">
        {open.length > 0 && !running && !listening && (
          <div className="sugg">{open.map(s => <button key={s.en} type="button" className="chip" onClick={() => ask(b(s))}>{b(s)}</button>)}</div>
        )}
        <VoiceBeam className="beam" stream={voice === "mic" ? mic.stream : null} level={level} processing={running}
          theme="light" colors={BEAM} bandColors={BAND} idle={0.16} scale={narrow ? 1 : listening ? 1.45 : 1.2} reach={listening ? 2.2 : undefined}>
          <form className={"composer" + (listening ? " voicing" : "")} onSubmit={e => { e.preventDefault(); ask(draft); }}>
            {listening ? (
              <div className="heard" aria-live="polite">
                {heard ? <p>{heard}</p> : <p className="hint">{t("voiceHint")}</p>}
              </div>
            ) : (
              <>
                <label htmlFor="ask" className="sr">{t("placeholder")}</label>
                <textarea id="ask" ref={ta} rows={1} value={draft} placeholder={t("placeholder")} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); } }} />
              </>
            )}
            <div className="actions">
              {listening ? (
                <>
                  <span className="rec"><i />{t("listening")}</span>
                  <button type="button" className="btn ghost" onClick={() => endVoice(false)}>{t("cancel")}</button>
                  <button type="button" className="btn primary" onClick={() => endVoice(true)}>{t("done")}</button>
                </>
              ) : (
                <>
                  <button type="button" className="mic" onClick={startVoice} disabled={running}><I.mic /><span>{t("talk")}</span></button>
                  <button type="submit" className="send" disabled={!draft.trim() || running} aria-label={t("send")}><I.send /></button>
                </>
              )}
            </div>
          </form>
        </VoiceBeam>
        <p className="foot">{note ? t(note) : t("footnote")}</p>
      </div>
    </section>
  );

  const filingsView = (
    <section className="page">
      <header className="page-hd"><h1>{t("nav_filings")}</h1><p>{t("filingsSub")}</p></header>
      <div className="tablewrap">
        <table className="ftable">
          <thead><tr><th>{t("th_filing")}</th><th>{t("th_level")}</th><th>{t("th_status")}</th><th>{t("th_next")}</th></tr></thead>
          <tbody>
            {LEVELS.flatMap(l => kase.filings.filter(f => f.level === l)).map(f => (
              <tr key={f.id} className={f.critical ? "crit" : ""}>
                <td><b>{b(f.name)}</b><span>{b(f.agency)}</span></td>
                <td><LevelTag l={f.level} t={t} /></td>
                <td><StatusChip s={f.status} t={t} /></td>
                <td>{f.critical && <em>{t("critical")}</em>}{f.next ? b(f.next) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const needsView = (
    <section className="page">
      <header className="page-hd"><h1>{t("nav_needs")}</h1><p>{t("needsSub")}</p></header>
      {kase.approvals.length === 0 ? <p className="empty">{t("emptyNeeds")}</p> : (
        <div className="cards">{kase.approvals.map(a => <ApprovalCard key={a.id} a={a} b={b} t={t} busy={running} onApprove={f => approve(a, f)} />)}</div>
      )}
    </section>
  );

  const activityView = (
    <section className="page">
      <header className="page-hd"><h1>{t("nav_activity")}</h1><p>{t("activitySub")}</p></header>
      <h2 className="sec">{t("runningNow")}</h2>
      {runningList}
      <h2 className="sec">{t("nav_activity")}</h2>
      <ol className="log">
        {kase.activity.map(x => (
          <li key={x.id}>
            <time>{b(x.when)}</time>
            <span className={"who who-" + x.actor}>{x.who ? b(x.who) : t(("actor_" + x.actor) as Key)}</span>
            <p>{b(x.text)}</p>
          </li>
        ))}
      </ol>
    </section>
  );

  const connectionsView = (
    <section className="page">
      <header className="page-hd"><h1>{t("nav_connections")}</h1><p>{t("connSub")}</p></header>
      <h2 className="sec">{t("autonomyTitle")}</h2>
      <div className="auto" role="radiogroup" aria-label={t("autonomyTitle")}>
        {(["prepare", "ask", "submit"] as Autonomy[]).map(a => (
          <label key={a} className={"auto-opt" + (autonomy === a ? " on" : "")}>
            <input type="radio" name="autonomy" id={"au-" + a} checked={autonomy === a} onChange={() => setAutonomy(a)} />
            <b>{t(("au_" + a) as Key)}</b><span>{t(("aud_" + a) as Key)}</span>
          </label>
        ))}
      </div>
      <h2 className="sec">{t("nav_connections")}</h2>
      <ul className="conns">
        {kase.connections.map(c => (
          <li key={c.id}>
            <LevelTag l={c.level} t={t} />
            <div><b>{b(c.name)}</b><span>{b(c.detail)}</span></div>
            {c.state === "connected" ? <span className="cstate"><i />{t("connected")}</span> : <button type="button" className="btn ghost sm">{t("connect")}</button>}
          </li>
        ))}
      </ul>
      <p className="vault">{t("vaultNote")}</p>
    </section>
  );

  const content = { agent: agentView, filings: filingsView, needs: needsView, activity: activityView, connections: connectionsView }[view];

  return (
    <div className={"app" + (narrow ? " narrow" : "")}>
      {!narrow && (
        <aside className="side">
          <Logo lang={lang} height={23} className="logo" />
          <nav className="nav">
            {nav.map(n => (
              <button key={n.v} type="button" className={view === n.v ? "on" : ""} aria-current={view === n.v ? "page" : undefined} onClick={() => setView(n.v)}>
                <n.icon /><span>{n.label}</span>{n.count ? <em className={n.v === "needs" ? "hot" : ""}>{n.count}</em> : null}
              </button>
            ))}
          </nav>
          <h3>{t("locations")}</h3>
          <button type="button" className="loc on"><I.pin /><span>{b(kase.name)}</span></button>
          <div className="side-foot">{langToggle}</div>
        </aside>
      )}
      <div className="main">
        {narrow && (
          <header className="topbar">
            <div className="topbar-row"><Logo lang={lang} height={22} className="logo" />{langToggle}</div>
            <nav className="tabs">
              {nav.map(n => (
                <button key={n.v} type="button" aria-current={view === n.v ? "page" : undefined} onClick={() => setView(n.v)}>
                  {n.label}{n.v === "needs" && n.count ? <em>{n.count}</em> : null}
                </button>
              ))}
            </nav>
          </header>
        )}
        <div className="content">{content}</div>
      </div>
      {wide && view === "agent" && (
        <aside className="rail">
          <h2>{t("runningNow")}</h2>
          {runningList}
          <h2>{t("nav_needs")}<em>{kase.approvals.length}</em></h2>
          {kase.approvals.length === 0 ? <p className="empty sm">{t("emptyNeeds")}</p>
            : <div className="cards">{kase.approvals.map(a => <ApprovalCard key={a.id} a={a} b={b} t={t} busy={running} compact onApprove={f => approve(a, f)} />)}</div>}
        </aside>
      )}
    </div>
  );
}

function AgentMsg({ m, b, t, busy, pending, closed, onApprove }: {
  m: AgentTurn; b: (x: Bi) => string; t: (k: Key, v?: Record<string, string | number>) => string;
  busy: boolean; pending: Approval[]; closed: Approval[]; onApprove: (a: Approval, files?: string[]) => void;
}) {
  const [openSteps, setOpenSteps] = useState(false);
  const live = !m.reply;
  return (
    <div className="msg agent">
      {m.steps.length > 0 && (live || openSteps) && (
        <ol className="steps">
          {m.steps.map((s, i) => {
            const now = live && i === m.active;
            return (
              <li key={i} className={now ? "now" : "done"}>
                <span className="ico">{now ? <ThinkingOrb state={s.state} size={20} theme="light" color={ORB_INK} aria-label={b(s.label)} /> : <I.check />}</span>
                <span>{b(s.label)}</span>
              </li>
            );
          })}
        </ol>
      )}
      {m.reply && (
        <>
          {m.steps.length > 0 && (
            <button type="button" className="steps-toggle" onClick={() => setOpenSteps(o => !o)} aria-expanded={openSteps}>
              {t("stepsDone", { n: m.steps.length, s: Math.round((m.ms ?? 0) / 1000) })}<span>{openSteps ? t("hideSteps") : t("showSteps")}</span>
            </button>
          )}
          {m.reply.text.map((p, i) => <p key={i}>{b(p)}</p>)}
          {m.reply.chain && <ol className="chain">{m.reply.chain.map((c, i) => <li key={i}>{b(c)}</li>)}</ol>}
          {m.reply.approvals?.map(id => {
            const a = pending.find(x => x.id === id);
            if (a) return <ApprovalCard key={id} a={a} b={b} t={t} busy={busy} onApprove={f => onApprove(a, f)} />;
            const k = closed.find(x => x.id === id);
            return k ? <ResolvedCard key={id} title={k.title} b={b} t={t} /> : null;
          })}
        </>
      )}
    </div>
  );
}
