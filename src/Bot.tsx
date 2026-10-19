import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { BotAvatar, type BotAvatarProps, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";
import type { OrbState } from "thinking-orbs";
import { TASKS } from "./tasks";
import { CLOUD as CLOUD_PATH, CloudSvg } from "./CloudSvg";
import "./bot.css";

/* Placetta's agent as a small plush character: a soft pastel-blue cloud with blushed cheeks with a smile (bot-avatars).
   It hops while it works and breathes, floats and looks around while it waits. Each background job gets its own little bot.
   Large, it is the library's plush canvas, patched (scripts/patch-bot-avatars.mjs) for lit eyes, an inset smile, navy
   outfits and an eased hop, with a clean edge and a rim of light (Edge). Under about 40px it is a crisp vector of the same
   cloud (CloudSvg.tsx); on touch screens, large, a still of the plush render for the step it is on.

   What she is doing reads on her, with no badge beside her: each working step has its own outfit (tasks.ts), thinking
   closes her eyes, and while she works a soft glow in her own shape breathes behind her. Her eyes rest toward the work
   beside her (`gaze`). */

const INK = "#132A55";   // the landing page navy
/* The Ritz-Carlton pastel blue (the soft "memorable" blue from its 2015 identity; no official code is published, so it is
   matched to about #A4C8E1) with pink cheeks (#F0ADD3). The plush shader shifts colour a lot, so these settings were tuned by
   measuring the rendered body. Background-job bots share the family. */
const CLOUD = "#A4C8E1";
const BLUSH = "#F0ADD3";
const BLUES = [CLOUD];   // the shader turns lighter tints grey, so every job bot uses the same blue; shapes tell them apart
const G = globalThis as unknown as { __botBlush?: string; __botPlacetta?: boolean };
G.__botBlush = BLUSH;      // read by the blush patch
G.__botPlacetta = true;    // turns on the patched hop and blink
/* A short, dense pile keeps the surface soft without a long haze of stray hairs past the outline. bot-avatars holds
   every plush bot back (opacity 0) until all of them are ready, up to 4 s on slow devices; ours show straight away
   (SHOWN), and Odelia's cloud stands in as a vector until its pile has baked (Plush). */
const SOFT = { shading: "fabric" as const, saturation: 2.3, brightness: 1.6, ink: INK, furFuzz: 0, furLength: 0.5 };
const SHOWN: CSSProperties = { opacity: 1, transition: "none" };
const isDark = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
/** Follows the app's Light and Dark setting (hooks.ts announces changes with a "placetta-theme" event). */
function useDark() {
  const [dark, set] = useState(isDark);
  useEffect(() => {
    const on = () => set(isDark());
    window.addEventListener("placetta-theme", on);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", on);
    return () => { window.removeEventListener("placetta-theme", on); mq?.removeEventListener?.("change", on); };
  }, []);
  return dark;
}

/* Phones (iOS Safari above all) render the live plush canvas with blown-out brightness and flicker, so touch screens
   never draw the cloud on a canvas: large, it is a still of the plush cloud dressed for the step (rendered from AgentBot)
   with a gentle CSS float; small, the vector cloud. Nothing on a phone redraws a canvas per frame: every animation there
   moves only transform or opacity. */
const touch = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /iP(hone|ad|od)/.test(navigator.userAgent));
/** Below this size the cloud is drawn as a vector: the plush pile turns to mush in a few pixels. */
const SMALL = 40;
/** The glow behind her while she works, from this size up (smaller, it would read as a smudge). */
const GLOW = 40;

/** The plush stills, one per step (idle is the bare cloud), each the whole canvas square. */
const STILLS = import.meta.glob<string>("./assets/odelia/*.webp", { eager: true, query: "?url", import: "default" });
const stillOf = (task?: OrbState) => STILLS[`./assets/odelia/${task ?? "idle"}.webp`] ?? STILLS["./assets/odelia/idle.webp"];

/**
 * The plush canvas's edge. The fur leaves a grainy haze past the outline, which reads as a cut-out, so this filter
 * redraws the silhouette from the canvas's own outline (blurred a touch and pulled back to a clean, soft edge), fills
 * the pile's gaps along it with its own colour, adds a soft rim of light along the upper-left edge, and a fine blue
 * line round the outside so the lit side holds its shape on white (a faint pale one on dark). It works from the drawn
 * pixels, so it follows every hop, turn and outfit. Desktop only: phones skip it (no per-frame cost there).
 */
function Edge({ id, size, dark }: { id: string; size: number; dark: boolean }) {
  const blur = Math.max(0.45, size * 0.006), rim = size * 0.022, line = Math.max(0.6, size * 0.007);
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true" focusable="false">
      <filter id={id} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="soft" />
        <feComponentTransfer in="soft" result="shape"><feFuncA type="linear" slope="2.6" intercept="-0.9" /></feComponentTransfer>
        <feGaussianBlur in="SourceGraphic" stdDeviation={blur * 1.4} result="spread" />
        <feComponentTransfer in="spread" result="filler"><feFuncA type="linear" slope="4" intercept="0" /></feComponentTransfer>
        <feComposite in="SourceGraphic" in2="filler" operator="over" result="filled" />
        <feComposite in="filled" in2="shape" operator="in" result="body" />
        <feOffset in="shape" dx={rim} dy={rim * 1.15} result="nudged" />
        <feComposite in="shape" in2="nudged" operator="out" result="crescent" />
        <feGaussianBlur in="crescent" stdDeviation={size * 0.012} result="glow" />
        <feFlood floodColor="#F4FAFF" floodOpacity={dark ? 0.7 : 0.5} />
        <feComposite in2="glow" operator="in" result="light" />
        <feComposite in="light" in2="shape" operator="in" result="rimlight" />
        <feMorphology in="shape" operator="dilate" radius={line} result="grown" />
        <feComposite in="grown" in2="shape" operator="out" result="ring" />
        <feGaussianBlur in="ring" stdDeviation={line * 0.45} result="ringsoft" />
        <feFlood floodColor={dark ? "#C8E2FC" : "#42699E"} floodOpacity={dark ? 0.26 : 0.42} />
        <feComposite in2="ringsoft" operator="in" result="outline" />
        <feMerge><feMergeNode in="outline" /><feMergeNode in="body" /><feMergeNode in="rimlight" /></feMerge>
      </filter>
    </svg>
  );
}
/**
 * The canvas bot with its clean edge (on desktop). Until its plush pile has baked, the library can only draw a flat
 * grey stand-in, so a dressed cloud (one with data-pc) draws nothing until then and marks its canvas data-pc-baked when
 * the pile is there (scripts/patch-bot-avatars.mjs). Given a `stand` (the vector cloud), this shows it underneath until
 * that mark, then lets it fade out under the plush.
 */
function Plush({ stand, ...props }: BotAvatarProps & { size: number; "data-pc"?: string; "data-pc-look"?: string; stand?: ReactNode }) {
  const id = "pc-edge" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLCanvasElement>(null);
  const dark = useDark();
  const [stage, setStage] = useState<"wait" | "fade" | "done">(stand ? "wait" : "done");
  useEffect(() => {
    const c = ref.current;
    if (stage === "done" || !c) return;
    if (stage === "fade") { const t = window.setTimeout(() => setStage("done"), 360); return () => clearTimeout(t); }
    const check = () => { if (c.dataset.pcBaked) setStage("fade"); };
    const watch = new MutationObserver(check);
    watch.observe(c, { attributes: true, attributeFilter: ["data-pc-baked"] });
    check();
    return () => watch.disconnect();
  }, [stage]);
  const bot = <BotAvatar ref={ref} {...SOFT} {...props} style={touch ? SHOWN : { ...SHOWN, filter: `url(#${id})` }} />;
  return (
    <>
      {!touch && <Edge id={id} size={props.size} dark={dark} />}
      {stand ? (
        <span className="plush" style={{ width: props.size, height: props.size }}>
          {stage !== "done" && <span className={"plush-stand" + (stage === "fade" ? " gone" : "")} aria-hidden="true">{stand}</span>}
          {bot}
        </span>
      ) : bot}
    </>
  );
}

/** The plush still for the step (the whole canvas square), floating; quicker while busy, slow while thinking. */
function Still({ size, busy, task, label }: { size: number; busy?: boolean; task?: OrbState; label?: string }) {
  const calm = busy && task && TASKS[task].still;
  return (
    <span className={"cloud-still" + (busy ? calm ? " calm" : " busy" : "")} style={{ width: size, height: size }} role="img" aria-label={label}>
      <img src={stillOf(busy ? task : undefined)} alt="" draggable={false} />
    </span>
  );
}

/** The soft glow in her own shape that breathes behind her while she works. */
function Aura() {
  return <span className="bot-aura" aria-hidden="true"><svg viewBox="0 0 100 100"><path d={CLOUD_PATH} /></svg></span>;
}

/**
 * Odelia. `task` dresses her for the step; `gaze` is where the work sits beside her (x right, y down, in her face's
 * units, about 3 a clear glance), so her eyes rest on it while she works.
 */
export function AgentBot({ size, busy, label = "Odelia", interactive = true, task, gaze }: { size: number; busy?: boolean; label?: string; interactive?: boolean; task?: OrbState; gaze?: [number, number] }) {
  const k = busy && task ? TASKS[task] : undefined;
  const look = k?.look ?? (busy ? gaze : undefined);
  const calm = !!(busy && k?.still);
  const s = { "--s": `${size}px` } as CSSProperties;
  let bot: ReactNode;
  const vector = (lbl?: string) => <CloudSvg size={size} busy={busy} wear={k?.wear} open={k?.open} still={k?.still} shut={k?.shut} look={look} scan={task === "searching"} label={lbl} />;
  if (size < SMALL) bot = vector(label);
  else if (touch) bot = <Still size={size} busy={busy} task={task} label={label} />;
  else {
    // thinking is the one quiet task: it stays put and breathes slowly instead of hopping
    const pc = [k?.wear ?? "cloud", busy && k?.open ? "open" : "", k?.shut ? "shut" : ""].join(" ").replace(/ +/g, " ").trim();
    bot = <Plush stand={vector()} type="cloud" face="mouth" color={CLOUD} size={size} state={busy && !k?.still ? "working" : "default"} interactive={interactive}
      turn={calm ? 0.3 : 1} jumpEvery={9} jumpSquashEase="soft" jumpRiseEase="soft" speed={k?.still ? 0.6 : 1} data-pc={pc} data-pc-look={look ? look.join(",") : undefined} aria-label={label} />;
  }
  return (
    <span className={"odelia-bot" + (busy ? " busy" : "") + (calm ? " calm" : "")} style={s}>
      {busy && size >= GLOW && <Aura />}
      {size >= SMALL && <span className={"bot-ground" + (touch ? " float" : "")} aria-hidden="true" />}
      {bot}
    </span>
  );
}

const TASK_TYPES: BotAvatarType[] = ["drop", "pebble", "pill", "ghost", "blob", "circle"];
/** A background job's bot: same family, its own shape, picked from the job's id so it stays put. On touch screens the
 *  canvas is drawn once and held (paused), and a busy bot hops in CSS instead, so a phone never redraws it per frame. */
export function TaskBot({ id, size = 26, label, busy = true }: { id: string; size?: number; label: string; busy?: boolean }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bot = (
    <Plush type={TASK_TYPES[h % TASK_TYPES.length]} color={BLUES[h % BLUES.length]} size={size} state={busy && !touch ? "working" : "default"} seed={(h % 100) / 100}
      interactive={false} turn={0.4} jumpEvery={0} paused={touch} aria-label={label} />
  );
  return touch ? <span className={"taskbot" + (busy ? " hop" : "")}>{bot}</span> : bot;
}

/** A store's own bot: Odelia for that one store, in the same family, with a shape of its own picked from the store's
 *  id (so each store keeps its bot everywhere: Work, Home, Stores and the replay). It hops while it works. */
export function StoreBot({ id, size = 26, label, busy }: { id: string; size?: number; label: string; busy?: boolean }) {
  return <TaskBot id={"store:" + id} size={size} label={label} busy={busy} />;
}
/** The bot behind a replay's moment: the main Odelia, or a store's bot. */
export function BotOf({ bot, size, label }: { bot?: string; size: number; label: string }) {
  return !bot || bot === "odelia" ? <AgentBot size={size} interactive={false} label={label} /> : <StoreBot id={bot} size={size} label={label} busy={false} />;
}

/** The light-blue beam that rides the border of anything in progress. Only on while `on`. */
export function Working({ on, size = "sm", children }: { on: boolean; size?: "sm" | "md" | "line"; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return <BorderBeam size={size} theme="light" colorVariant="ice" strength={0.9} className="beam-wrap">{children}</BorderBeam>;
}

/* The sign-in gate's cloud. Touch screens get the still of the same cloud with a gentle CSS float. */
export function GateBot({ busy }: { busy?: boolean }) {
  return <AgentBot size={84} busy={busy} />;
}

/**
 * Odelia at work: the cloud dressed for the step it is on (headphones to listen, glasses to search, a beret to write,
 * eyes closed to think), with her eyes on the work beside her. There is no badge or orb beside her: the step reads on
 * the cloud at every size, on phones too.
 */
export function LiveBot({ task, busy = !!task, size, label, solo, interactive = false, gaze = [2.6, 0.6] }: { task?: OrbState; busy?: boolean; size: number; label?: string; solo?: boolean; interactive?: boolean; gaze?: [number, number] }) {
  return (
    <span className={"livebot" + (solo ? " beside" : "")} style={{ "--s": `${size}px` } as CSSProperties}>
      <span className="lb-bot" style={{ width: size, height: size }}><AgentBot size={size} busy={busy} task={task} label={label} interactive={interactive} gaze={gaze} /></span>
    </span>
  );
}
