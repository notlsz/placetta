import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { demoAgent, type AgentBackend, type Reply, type Request, type Step } from "./agent";
import { SAMPLE_CASE, SUGGESTIONS, type Approval, type Autonomy, type Bi, type Case, type Level } from "./model";
import { STRINGS, fmt, type Key, type Lang } from "./i18n";
import { Logo } from "./Logo";
import { useNarrow, useSimulatedVoice, useSpeak, useSpeechToText } from "./hooks";
import { ApprovalCard, I, ResolvedCard, StatusChip } from "./ui";

const agent: AgentBackend = demoAgent;

type View = "agent" | "filings" | "activity" | "settings";
type AgentTurn = { id: number; role: "agent"; steps: Step[]; active: number; reply?: Reply; ms?: number };
type Msg = { id: number; role: "user"; text: string } | AgentTurn;

const INK = "#3F7FC4";   // orb dots, light-blue family
const BEAM = ["#7DB3EA", "#A5CDF5", "#6FA7E3", "#8FD5EE", "#BCD2F7", "#B2E0F4", "#C9C2F5"];
const BAND = { core: "#FFFFFF", above: "#94C2F0", mid: "#C6DEF8", below: "#A3D9EF" };
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
const greetKey = (): Key => { const h = new Date().getHours(); return h < 12 ? "greet_m" : h < 18 ? "greet_a" : "greet_e"; };

export default function App() {
  /* language */
  const [lang, setLang] = useState<Lang>(readLang);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => (v ? fmt(STRINGS[lang][k], v) : STRINGS[lang][k]), [lang]);
  const b = useCallback((x: Bi) => x[lang], [lang]);
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("placetta-agent-lang", lang); } catch { /* storage blocked */ }
  }, [lang]);
  const narrow = useNarrow(760);
  const [view, setView] = useState<View>("agent");

  /* the case */
  const [kase, setKase] = useState<Case>(SAMPLE_CASE);
  const [autonomy, setAutonomy] = useState<Autonomy>("submit");

  /* conversation */
  const [msgs, setMsgs] = useState<Msg[]>([]);
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

  /* voice */
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
    const per = lang === "zh" ? 210 : 66;
    for (let i = 1; i <= line.length; i++) typer.current.push(window.setTimeout(() => setHeard(line.slice(0, i)), 700 + i * per));
    typer.current.push(window.setTimeout(() => endVoice(true, line), 700 + line.length * per + 1000));
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

  /* derived */
  const orbState: OrbState = listening ? "listening" : running && step ? step.state : tts.speaking ? "composing" : "breathing";
  const done = kase.filings.filter(f => DONE.includes(f.status)).length;
  const open = useMemo(() => SUGGESTIONS.filter(s => !asked.includes(s.en) && !asked.includes(s.zh)), [asked]);
  const level = useCallback(() => Math.max(sim.level(), tts.level()), [sim, tts]);
  const nNeeds = kase.approvals.length;

  const scroller = useRef<HTMLElement>(null);
  const needsRef = useRef<HTMLElement>(null);
  useEffect(() => { const el = scroller.current; if (el && msgs.length) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 132) + "px"; }, [draft]);
  const attach = useRef<HTMLInputElement>(null);
  const onFiles = (names: string[]) => {
    const docs = kase.approvals.find(a => a.id === "a-docs");
    if (docs) approve(docs, names); else ask(t("attach") + ": " + names.join(", "));
  };
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [view]);
  const goNeeds = () => { setView("agent"); requestAnimationFrame(() => needsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })); };

  const tabs: { v: View; label: string }[] = [
    { v: "agent", label: t("nav_agent") }, { v: "filings", label: t("nav_filings") },
    { v: "activity", label: t("nav_activity") }, { v: "settings", label: t("nav_settings") },
  ];

  /* ------------------------------ views ------------------------------ */
  const agentView = (
    <div className="col">
      <section className="hero">
        <ThinkingOrb state={orbState} size={64} theme="light" color={INK} dotSize={1.25} aria-label={t("agentName")} />
        <h1>{t(greetKey())}</h1>
        <p className="lede">{t(nNeeds ? "summary" : "summaryNone", { r: kase.running.length, n: nNeeds, place: t("shortPlace") })}</p>
        <div className="casechip">
          <span className="cc-name">{b(kase.name)}</span>
          <span className="cc-goal">{t("goal", { g: b(kase.goal) })}</span>
          <span className="cc-prog"><i style={{ width: `${(done / kase.filings.length) * 100}%` }} /></span>
          <span className="cc-num">{done}/{kase.filings.length}</span>
        </div>
      </section>

      <section className="block">
        <h2 className="label">{t("running")}</h2>
        <ul className="runs">
          {kase.running.map(r => (
            <li key={r.id}>
              <ThinkingOrb state={r.state} size={20} theme="light" color={INK} aria-label={b(r.label)} />
              <span>{b(r.label)}</span>
              {r.detail && <small>{b(r.detail)}</small>}
            </li>
          ))}
        </ul>
      </section>

      <section className="block" ref={needsRef}>
        <h2 className="label">{t("nav_needs")}{nNeeds > 0 && <em>{nNeeds}</em>}</h2>
        {nNeeds === 0 ? <p className="quiet">{t("emptyNeeds")}</p>
          : <div className="stack">{kase.approvals.map(a => <ApprovalCard key={a.id} a={a} b={b} t={t} busy={running} onApprove={f => approve(a, f)} />)}</div>}
      </section>

      {msgs.length > 0 && <div className="convo">
        {msgs.map(m => m.role === "user"
          ? <div key={m.id} className="you"><p>{m.text}</p></div>
          : <Turn key={m.id} m={m} b={b} t={t} busy={running} pending={kase.approvals} closed={kase.closed} onApprove={approve} />)}
      </div>}
    </div>
  );

  const filingsView = (
    <div className="col wide">
      <header className="pagehd"><h1>{t("nav_filings")}</h1><p>{t("filingsSub")}</p></header>
      <div className="table">
        <div className="tr th"><span>{t("th_filing")}</span><span>{t("th_level")}</span><span>{t("th_status")}</span><span>{t("th_next")}</span></div>
        {LEVELS.flatMap(l => kase.filings.filter(f => f.level === l)).map(f => (
          <div key={f.id} className={"tr" + (f.critical ? " crit" : "")}>
            <span className="f-name"><b>{b(f.name)}</b><small>{b(f.agency)}</small></span>
            <span className="f-lvl">{t(("lv_" + f.level) as Key)}</span>
            <span><StatusChip s={f.status} t={t} /></span>
            <span className="f-next">{f.critical && <em>{t("critical")}</em>}{f.next ? b(f.next) : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const activityView = (
    <div className="col">
      <header className="pagehd"><h1>{t("nav_activity")}</h1><p>{t("activitySub")}</p></header>
      <h2 className="label">{t("running")}</h2>
      <ul className="runs">
        {kase.running.map(r => (
          <li key={r.id}><ThinkingOrb state={r.state} size={20} theme="light" color={INK} aria-label={b(r.label)} /><span>{b(r.label)}</span>{r.detail && <small>{b(r.detail)}</small>}</li>
        ))}
      </ul>
      <h2 className="label">{t("nav_activity")}</h2>
      <ol className="log">
        {kase.activity.map(x => (
          <li key={x.id} className={"by-" + x.actor}>
            <i aria-hidden="true" />
            <div><p>{b(x.text)}</p><small>{x.who ? b(x.who) : t(("actor_" + x.actor) as Key)}<span>{b(x.when)}</span></small></div>
          </li>
        ))}
      </ol>
    </div>
  );

  const settingsView = (
    <div className="col">
      <header className="pagehd"><h1>{t("nav_settings")}</h1><p>{t("connSub")}</p></header>
      <h2 className="label">{t("autonomyTitle")}</h2>
      <div className="auto" role="radiogroup" aria-label={t("autonomyTitle")}>
        {(["prepare", "ask", "submit"] as Autonomy[]).map(a => (
          <label key={a} className={"auto-opt" + (autonomy === a ? " on" : "")}>
            <input type="radio" name="autonomy" id={"au-" + a} checked={autonomy === a} onChange={() => setAutonomy(a)} />
            <span className="radio" aria-hidden="true" />
            <span className="auto-tx"><b>{t(("au_" + a) as Key)}</b><span>{t(("aud_" + a) as Key)}</span></span>
          </label>
        ))}
      </div>
      <h2 className="label">{t("nav_connections")}</h2>
      <ul className="conns">
        {kase.connections.map(c => (
          <li key={c.id}>
            <div><b>{b(c.name)}</b><span>{t(("lv_" + c.level) as Key)}<i />{b(c.detail)}</span></div>
            {c.state === "connected" ? <span className="cstate">{t("connected")}</span> : <button type="button" className="ghost">{t("connect")}</button>}
          </li>
        ))}
      </ul>
      <p className="quiet small">{t("vaultNote")}</p>
    </div>
  );

  const content = { agent: agentView, filings: filingsView, activity: activityView, settings: settingsView }[view];

  return (
    <div className="app">
      <header className="bar">
        <button type="button" className="brand" onClick={() => setView("agent")} aria-label={t("nav_agent")}><Logo lang={lang} height={narrow ? 21 : 23} /></button>
        <nav className="seg" aria-label="Views">
          {tabs.map(x => <button key={x.v} type="button" aria-current={view === x.v ? "page" : undefined} onClick={() => setView(x.v)}>{x.label}</button>)}
        </nav>
        <div className="bar-r">
          {nNeeds > 0 && <button type="button" className="needs" onClick={goNeeds}><i />{t("needsCount", { n: nNeeds })}</button>}
          <div className="lang" role="group" aria-label={t("langSwitch")}>
            <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
            <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
          </div>
        </div>
      </header>

      <main className="scroll" ref={scroller}>{content}</main>

      {view === "agent" && (
        <div className="dock">
          {open.length > 0 && !running && (
            <div className="sugg">{open.map(s => <button key={s.en} type="button" onClick={() => ask(b(s))}>{b(s)}</button>)}</div>
          )}
          <VoiceBeam className="beam" level={level} processing={running} theme="light" colors={BEAM} bandColors={BAND} idle={0.12} scale={narrow ? 0.95 : 1.15}>
            <form className="composer" onSubmit={e => { e.preventDefault(); ask(draft); }}>
              <button type="button" className="ic" aria-label={t("attach")} onClick={() => attach.current?.click()} disabled={running}><I.plus /></button>
              <input ref={attach} type="file" multiple hidden onChange={e => { const n = Array.from(e.target.files ?? []).map(f => f.name); e.target.value = ""; if (n.length) onFiles(n); }} />
              <label htmlFor="ask" className="sr">{t("askPh")}</label>
              <textarea id="ask" ref={ta} rows={1} value={draft} placeholder={t("askPh")} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(draft); } }} />
              <button type="button" className="ic mic" aria-label={t("talk")} onClick={startVoice} disabled={running}><I.mic /></button>
              <button type="submit" className="send" disabled={!draft.trim() || running} aria-label={t("send")}><I.send /></button>
            </form>
          </VoiceBeam>
          <p className="foot">{note && !listening ? t(note) : t("footnote")}</p>
        </div>
      )}

      {listening && (
        <div className="voice" role="dialog" aria-modal="true" aria-label={t("listening")}>
          <button type="button" className="vclose" aria-label={t("close")} onClick={() => endVoice(false)}><I.x /></button>
          <div className="vmid">
            <div className="vorb"><ThinkingOrb state="listening" size={64} theme="light" color={INK} dotSize={1.2} aria-label={t("listening")} /></div>
            <p className="vlabel">{t("listening")}</p>
            <p className={"vtext" + (heard ? "" : " hint")} aria-live="polite">{heard || t("tapDone")}</p>
            {note && <p className="vnote">{t(note)}</p>}
          </div>
          <VoiceBeam className="vbeam" type="mobile" stream={voice === "mic" ? mic.stream : null} level={sim.level} theme="light"
            colors={BEAM} bandColors={BAND} scale={narrow ? 1 : 1.6} reach={narrow ? 3 : 2.6} idle={0.2}>
            <div className="vbar">
              <button type="button" className="vbtn" onClick={() => endVoice(false)}>{t("cancel")}</button>
              <button type="button" className="vbtn main" onClick={() => endVoice(true)}><I.check />{t("done")}</button>
            </div>
          </VoiceBeam>
        </div>
      )}
    </div>
  );
}

/** One agent turn: Legora-style working log, then the answer and anything it needs from you. */
function Turn({ m, b, t, busy, pending, closed, onApprove }: {
  m: AgentTurn; b: (x: Bi) => string; t: (k: Key, v?: Record<string, string | number>) => string;
  busy: boolean; pending: Approval[]; closed: Approval[]; onApprove: (a: Approval, files?: string[]) => void;
}) {
  const [show, setShow] = useState(false);
  const live = !m.reply;
  const cur = live ? m.steps[m.active] : undefined;
  return (
    <div className="turn">
      <div className="work">
        <div className="work-hd">
          {live && cur ? <ThinkingOrb state={cur.state} size={20} theme="light" color={INK} aria-label={b(cur.label)} /> : <span className="spark"><I.spark /></span>}
          <span>{live ? t("workingOn") : t("workedFor", { s: Math.max(1, Math.round((m.ms ?? 0) / 1000)) })}</span>
          {!live && m.steps.length > 0 && (
            <button type="button" onClick={() => setShow(s => !s)} aria-expanded={show}>{t("stepsN", { n: m.steps.length })}<span className={show ? "up" : ""}><I.chev /></span></button>
          )}
        </div>
        {(live || show) && (
          <ol className="steps">
            {m.steps.map((s, i) => {
              const now = live && i === m.active;
              return <li key={i} className={now ? "now" : ""}><i aria-hidden="true" /><span>{b(s.label)}</span></li>;
            })}
          </ol>
        )}
      </div>
      {m.reply && (
        <div className="answer">
          {m.reply.text.map((p, i) => <p key={i}>{b(p)}</p>)}
          {m.reply.chain && <ol className="chain">{m.reply.chain.map((c, i) => <li key={i}>{b(c)}</li>)}</ol>}
          {m.reply.approvals?.map(id => {
            const a = pending.find(x => x.id === id);
            if (a) return <ApprovalCard key={id} a={a} b={b} t={t} busy={busy} onApprove={f => onApprove(a, f)} />;
            const k = closed.find(x => x.id === id);
            return k ? <ResolvedCard key={id} title={k.title} b={b} t={t} /> : null;
          })}
        </div>
      )}
    </div>
  );
}
