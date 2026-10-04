import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { VoiceBeam, useMicrophone } from "voice-glow";
import { demoAgent, SAMPLE_PLAN, SUGGESTIONS, WELCOME, type AgentBackend, type Bi, type Permit, type Reply, type Status, type Step } from "./agent";
import { STRINGS, fmt, type Key, type Lang } from "./i18n";
import { Logo } from "./Logo";
import { useDark, useNarrow, useSimulatedVoice, useSpeechToText } from "./hooks";

const agent: AgentBackend = demoAgent;

type AgentTurn = { id: number; role: "agent"; steps: Step[]; active: number; reply?: Reply; ms?: number };
type Msg = { id: number; role: "user"; text: string } | AgentTurn;

const DONE: Status[] = ["approved", "filed"];
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
  const [lang, setLang] = useState<Lang>(readLang);
  const t = useCallback((k: Key, v?: Record<string, string | number>) => (v ? fmt(STRINGS[lang][k], v) : STRINGS[lang][k]), [lang]);
  const b = useCallback((x: Bi) => x[lang], [lang]);
  const dark = useDark();
  const narrow = useNarrow();
  const [tab, setTab] = useState<"chat" | "plan">("chat");

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    try { localStorage.setItem("placetta-agent-lang", lang); } catch { /* storage blocked */ }
  }, [lang]);

  /* ---------------- conversation ---------------- */
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: "agent", steps: [], active: -1, reply: WELCOME }]);
  const [plan, setPlan] = useState<Permit[]>(SAMPLE_PLAN);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [asked, setAsked] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);

  const send = useCallback(async (text: string) => {
    const q = text.trim(); if (!q || running) return;
    const uid = nextId.current++, aid = nextId.current++, t0 = performance.now();
    setMsgs(m => [...m, { id: uid, role: "user", text: q }, { id: aid, role: "agent", steps: [], active: 0 }]);
    setAsked(a => [...a, q]); setDraft(""); setRunning(true); setTab("chat");
    const upd = (f: (m: AgentTurn) => Partial<AgentTurn>) =>
      setMsgs(ms => ms.map(m => (m.id === aid && m.role === "agent" ? { ...m, ...f(m) } : m)));
    try {
      await agent.run(q, lang, e => {
        if (e.type === "step") { setStep(e.step); upd(m => ({ steps: [...m.steps, e.step], active: e.index })); }
        else {
          upd(() => ({ reply: e.reply, active: -1, ms: performance.now() - t0 }));
          if (e.reply.patch) setPlan(p => e.reply.patch!(p));
        }
      }, new AbortController().signal);
    } catch { /* stopped */ }
    setRunning(false); setStep(null);
  }, [running, lang]);

  /* ---------------- voice ---------------- */
  const mic = useMicrophone();
  const sim = useSimulatedVoice();
  const [voice, setVoice] = useState<"off" | "mic" | "sim">("off");
  const [note, setNote] = useState<"" | "simNote" | "deniedNote">("");
  const speech = useSpeechToText(useCallback((s: string) => setDraft(s), []));
  const typer = useRef<number[]>([]);
  const clearTyper = () => { typer.current.forEach(clearTimeout); typer.current = []; };

  const stopVoice = useCallback(() => {
    clearTyper(); mic.stop(); speech.stop(); sim.stop(); setVoice("off");
  }, [mic, speech, sim]);

  // No microphone here: play a speech-shaped level and "transcribe" the next suggestion, so the whole flow can be seen.
  const simulate = useCallback(() => {
    const line = b(SUGGESTIONS.find(s => !asked.includes(b(s))) ?? SUGGESTIONS[0]);
    setVoice("sim"); setNote("simNote"); sim.start(); setDraft("");
    const per = lang === "zh" ? 190 : 62;
    for (let i = 1; i <= line.length; i++) typer.current.push(window.setTimeout(() => setDraft(line.slice(0, i)), 450 + i * per));
    typer.current.push(window.setTimeout(() => { sim.stop(); setVoice("off"); }, 450 + line.length * per + 700));
  }, [asked, b, lang, sim]);

  // A mic that the browser ended (device unplugged, permission revoked) simply stops counting as live.
  const listening = (voice === "mic" && mic.state === "live") || voice === "sim";

  const toggleVoice = useCallback(async () => {
    if (listening) { stopVoice(); return; }
    stopVoice(); setNote("");
    if (!mic.supported || !micAllowedHere()) { simulate(); return; }
    const s = await mic.start();
    if (s) { setVoice("mic"); setDraft(""); speech.start(lang === "zh" ? "zh-CN" : "en-US"); return; }
    if (inFrame) simulate(); else setNote("deniedNote");
  }, [listening, stopVoice, mic, simulate, speech, lang]);

  useEffect(() => () => clearTyper(), []);

  const onSend = () => { if (voice !== "off") stopVoice(); send(draft); };

  /* ---------------- derived ---------------- */
  const orbState: OrbState = listening ? "listening" : running && step ? step.state : "breathing";
  const status = listening ? t("listening") : running && step ? b(step.label) : t("ready");
  const done = plan.filter(p => DONE.includes(p.status)).length;
  const open = useMemo(() => SUGGESTIONS.filter(s => !asked.includes(s.en) && !asked.includes(s.zh)), [asked]);
  const orbInk = dark ? "#C9D8EE" : "#132A55";

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [msgs]);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }, [draft]);

  const chat = (
    <section className="chat" aria-label={t("chat")}>
      <div className="agentid">
        <ThinkingOrb state={orbState} size={64} theme={dark ? "dark" : "light"} color={orbInk} aria-label={status} />
        <div className="agentid-txt">
          <h1>{lang === "zh" ? "快哉智能助理" : "Placetta Agent"}</h1>
          <p className="status" aria-live="polite">{status}</p>
        </div>
      </div>

      <div className="thread" ref={scroller}>
        {msgs.map(m => m.role === "user"
          ? <div key={m.id} className="msg user"><p>{m.text}</p></div>
          : <AgentMsg key={m.id} m={m} b={b} t={t} dark={dark} ink={orbInk} onFollow={send} running={running} />)}
      </div>

      <div className="dock">
        {open.length > 0 && !running && (
          <div className="sugg">
            {open.map(s => <button key={s.en} type="button" className="chip" onClick={() => send(b(s))}>{b(s)}</button>)}
          </div>
        )}
        <VoiceBeam
          className="beam"
          stream={voice === "mic" ? mic.stream : null}
          level={sim.level}
          processing={running}
          theme={dark ? "dark" : "light"}
          colors={dark ? ["#9CC0EC", "#7399C6", "#B9A6F2", "#6FD3E0", "#F2B3D2"] : ["#7399C6", "#5B8CD6", "#9A86E8", "#4FB8D0", "#E59AC0"]}
          idle={0.18}
          scale={narrow ? 1 : 1.25}
        >
          <form className="composer" onSubmit={e => { e.preventDefault(); onSend(); }}>
            <label htmlFor="ask" className="sr">{t("placeholder")}</label>
            <textarea id="ask" ref={ta} rows={1} value={draft} placeholder={t("placeholder")}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onSend(); } }} />
            <div className="actions">
              <button type="button" className={"mic" + (listening ? " on" : "")} onClick={toggleVoice} aria-pressed={listening}>
                {listening ? <StopIcon /> : <MicIcon />}<span>{listening ? t("stop") : t("talk")}</span>
              </button>
              <button type="submit" className="send" disabled={!draft.trim() || running} aria-label={t("send")}><SendIcon /></button>
            </div>
          </form>
        </VoiceBeam>
        <p className="foot">{note ? t(note) : t("footnote")}</p>
      </div>
    </section>
  );

  const planEl = (
    <aside className="plan" aria-label={t("planTitle")}>
      <div className="plan-hd">
        <span className="tag">{t("sample")}</span>
        <h2>{t("caseName")}</h2>
        <p className="where">{t("caseWhere")}</p>
        <div className="prog">
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={plan.length} aria-valuenow={done}><i style={{ width: `${(done / plan.length) * 100}%` }} /></div>
          <span>{t("progress", { d: done, n: plan.length })}</span>
        </div>
      </div>
      <h3 className="plan-t">{t("planTitle")}</h3>
      <ul className="permits">
        {plan.map(p => (
          <li key={p.id} className={"permit" + (p.critical ? " crit" : "")}>
            <div className="permit-top">
              <b>{b(p.name)}</b>
              <span className={"st st-" + p.status}>{t(("s_" + p.status) as Key)}</span>
            </div>
            <span className="agency">{b(p.agency)}</span>
            {(p.note || p.critical) && (
              <span className="note">{p.critical && <em>{t("critical")}</em>}{p.note && <span>{b(p.note)}</span>}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <div className="app">
      <header className="top">
        <Logo lang={lang} height={24} className="logo" />
        <span className="prod">{t("product")}</span>
        <div className="lang" role="group" aria-label={t("langSwitch")}>
          <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <span aria-hidden="true">/</span>
          <button type="button" aria-pressed={lang === "zh"} onClick={() => setLang("zh")}>中文</button>
        </div>
      </header>
      {narrow && (
        <nav className="tabs">
          <button type="button" aria-pressed={tab === "chat"} onClick={() => setTab("chat")}>{t("chat")}</button>
          <button type="button" aria-pressed={tab === "plan"} onClick={() => setTab("plan")}>{t("plan")}<small>{t("progress", { d: done, n: plan.length })}</small></button>
        </nav>
      )}
      <main className="body">
        {(!narrow || tab === "chat") && chat}
        {(!narrow || tab === "plan") && planEl}
      </main>
    </div>
  );
}

function AgentMsg({ m, b, t, dark, ink, onFollow, running }: {
  m: AgentTurn; b: (x: Bi) => string; t: (k: Key, v?: Record<string, string | number>) => string;
  dark: boolean; ink: string; onFollow: (s: string) => void; running: boolean;
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
                <span className="ico">{now ? <ThinkingOrb state={s.state} size={20} theme={dark ? "dark" : "light"} color={ink} aria-label={b(s.label)} /> : <CheckIcon />}</span>
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
          {m.reply.chain && (
            <ol className="chain">
              {m.reply.chain.map((c, i) => <li key={i}>{b(c)}</li>)}
            </ol>
          )}
          {m.reply.followUp && !running && (
            <button type="button" className="follow" onClick={() => onFollow(b(m.reply!.followUp!))}>{b(m.reply.followUp)}<ArrowIcon /></button>
          )}
        </>
      )}
    </div>
  );
}

const sv = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const MicIcon = () => <svg {...sv}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
const StopIcon = () => <svg {...sv}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></svg>;
const SendIcon = () => <svg {...sv}><path d="M12 19V5M5 12l7-7 7 7" /></svg>;
const CheckIcon = () => <svg {...sv} width={14} height={14}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const ArrowIcon = () => <svg {...sv} width={14} height={14}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
