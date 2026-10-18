import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { BotAvatar, type BotAvatarProps, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { TASKS } from "./tasks";
import { CloudSvg } from "./CloudSvg";
import cloud2x from "./assets/agent-cloud.png";
import cloud3x from "./assets/agent-cloud@3x.png";
import "./bot.css";

/* Placetta's agent as a small plush character: a soft pastel-blue cloud with blushed cheeks with a smile (bot-avatars).
   It hops while it works and looks around while it waits. Each background job gets its own little bot.
   Large, it is the library's plush canvas, patched (scripts/patch-bot-avatars.mjs) for lit eyes, an inset smile, navy
   outfits and an eased hop, with a clean edge and a rim of light (Edge). Under about 40px it is a crisp vector of the same
   cloud (CloudSvg.tsx); on touch screens, large, a still of the plush render. */

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
/** The orbs' ink: Placetta's blue (INK in pages.tsx), lifted on the dark theme so it still reads. */
const ORB_INK = "#4D73A3", ORB_INK_DARK = "#8DB2E0";
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
   never draw the cloud on a canvas: large, it is a still of the plush cloud (rendered from AgentBot at 2x and 3x) with a
   gentle CSS float; small, the vector cloud. Nothing on a phone redraws a canvas per frame. */
const touch = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || /iP(hone|ad|od)/.test(navigator.userAgent));
/** Below this size the cloud is drawn as a vector: the plush pile turns to mush in a few pixels. */
const SMALL = 40;

/**
 * The plush canvas's edge. The fur leaves a grainy haze past the outline, which reads as a cut-out, so this filter
 * redraws the silhouette from the canvas's own outline (blurred a touch and pulled back to a clean, soft edge), fills
 * the pile's gaps along it with its own colour, and adds a soft rim of light along the upper-left edge. It works from
 * the drawn pixels, so it follows every hop, turn and outfit. Desktop only: phones skip it (no per-frame cost there).
 */
function Edge({ id, size }: { id: string; size: number }) {
  const blur = Math.max(0.45, size * 0.006), rim = size * 0.022;
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
        <feFlood floodColor="#F4FAFF" floodOpacity="0.75" />
        <feComposite in2="glow" operator="in" result="light" />
        <feComposite in="light" in2="shape" operator="in" result="rimlight" />
        <feMerge><feMergeNode in="body" /><feMergeNode in="rimlight" /></feMerge>
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
function Plush({ stand, ...props }: BotAvatarProps & { size: number; "data-pc"?: string; stand?: ReactNode }) {
  const id = "pc-edge" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<HTMLCanvasElement>(null);
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
      {!touch && <Edge id={id} size={props.size} />}
      {stand ? (
        <span className="plush" style={{ width: props.size, height: props.size }}>
          {stage !== "done" && <span className={"plush-stand" + (stage === "fade" ? " gone" : "")} aria-hidden="true">{stand}</span>}
          {bot}
        </span>
      ) : bot}
    </>
  );
}

/** The plush still: the image is cropped to the cloud (90 by 77 of the 100 by 100 body box), so it sits where the
 *  canvas would draw the cloud. */
const STILL = `${cloud2x} 216w, ${cloud3x} 324w`;
function Still({ size, busy, label }: { size: number; busy?: boolean; label?: string }) {
  return (
    <span className={"cloud-still" + (busy ? " busy" : "")} style={{ width: size, height: size }} role="img" aria-label={label}>
      <img src={cloud2x} srcSet={STILL} sizes={`${Math.round(size * 0.9)}px`} alt="" draggable={false} />
    </span>
  );
}

export function AgentBot({ size, busy, label = "Odelia", interactive = true, task }: { size: number; busy?: boolean; label?: string; interactive?: boolean; task?: OrbState }) {
  const k = task ? TASKS[task] : undefined;
  if (touch && size >= SMALL) return <Still size={size} busy={busy} label={label} />;
  if (size < SMALL) return <CloudSvg size={size} busy={busy} wear={k?.wear} open={k?.open} still={k?.still} label={label} />;
  // thinking is the one quiet task: it stays put and breathes slowly instead of hopping
  const pc = [k?.wear ?? "cloud", busy && k?.open ? "open" : ""].join(" ").trim();
  return (
    <Plush stand={<CloudSvg size={size} busy={busy} wear={k?.wear} open={k?.open} still={k?.still} />} type="cloud" face="mouth" color={CLOUD} size={size} state={busy && !k?.still ? "working" : "default"} interactive={interactive}
      turn={1} jumpEvery={9} jumpSquashEase="soft" jumpRiseEase="soft" speed={k?.still ? 0.6 : 1} data-pc={pc} aria-label={label} />
  );
}

const TASK_TYPES: BotAvatarType[] = ["drop", "pebble", "pill", "ghost", "blob", "circle"];
/** A background job's bot: same family, its own shape, picked from the job's id so it stays put. */
export function TaskBot({ id, size = 26, label, busy = true }: { id: string; size?: number; label: string; busy?: boolean }) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <Plush type={TASK_TYPES[h % TASK_TYPES.length]} color={BLUES[h % BLUES.length]} size={size} state={busy ? "working" : "default"} seed={(h % 100) / 100}
      interactive={false} turn={0.4} jumpEvery={0} aria-label={label} />
  );
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
  if (!touch) return <AgentBot size={84} busy={busy} />;
  return <img className={"gate-cloud" + (busy ? " busy" : "")} src={cloud2x} srcSet={STILL} sizes="84px" width={84} height={72} alt="Placetta" draggable={false} />;
}

/**
 * Odelia at work: the cloud dressed for the step it is on (headphones to listen, glasses to search, a beret to write),
 * with that step's orb beside it as its tool. Small clouds are vectors, and their tool is a single breathing dot; touch
 * screens get the dot at every size, so a phone never draws an extra canvas per frame.
 */
export function LiveBot({ task, busy = !!task, size, label, solo, interactive = false }: { task?: OrbState; busy?: boolean; size: number; label?: string; solo?: boolean; interactive?: boolean }) {
  const small = size < SMALL, dark = useDark();
  // the tool rests just off the cloud's lower right, also when `solo` puts the cloud in a line of text
  return (
    <span className={"livebot" + (solo ? " beside" : "")} style={{ "--s": `${size}px` } as CSSProperties}>
      <span className="lb-bot" style={{ width: size, height: size }}><AgentBot size={size} busy={busy} task={task} label={label} interactive={interactive} /></span>
      {task && (small || touch
        ? <span className="lb-dot" aria-hidden="true" />
        : <ThinkingOrb className="lb-tool" state={task} size={20} theme={dark ? "dark" : "light"} color={dark ? ORB_INK_DARK : ORB_INK} speed={TASKS[task].still ? 0.7 : 1} dots={0.5} dotSize={2.6} aria-hidden="true" />)}
    </span>
  );
}
