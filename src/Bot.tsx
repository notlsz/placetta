import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { BotAvatar, type BotAvatarProps, type BotAvatarType } from "bot-avatars";
import { BorderBeam } from "border-beam";
import type { OrbState } from "thinking-orbs";
import { TASKS, useDone, useSwap, type Prop } from "./tasks";
import { OdeliaProps } from "./OdeliaProps";
import { CLOUD as CLOUD_PATH, CloudSvg } from "./CloudSvg";
import "./bot.css";
import { Guard } from "./SafeBoundary";

/* The plush canvas squashes its face while it animates; at the extreme of a squash a scale can dip below zero, and the
   browser throws on an ellipse with a negative radius, which took the whole app to a white page. Clamp the radii to zero
   (the shape simply isn't drawn for that frame) for both the context and Path2D, once, before any bot draws. */
const clampEllipse = (proto: { ellipse: (...a: number[]) => void } | undefined) => {
  if (!proto || (proto as { __pcSafe?: boolean }).__pcSafe) return;
  const draw = proto.ellipse;
  proto.ellipse = function (this: unknown, x: number, y: number, rx: number, ry: number, ...rest: number[]) {
    return draw.call(this, x, y, Math.max(0, rx || 0), Math.max(0, ry || 0), ...rest);
  };
  (proto as { __pcSafe?: boolean }).__pcSafe = true;
};
if (typeof window !== "undefined") {
  clampEllipse(window.CanvasRenderingContext2D?.prototype as never);
  clampEllipse(window.Path2D?.prototype as never);
}

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
/** The prop in use, from this size up (smaller, it crowds the face; the outfit alone carries the step). */
const PROPS = 64;

/** The plush stills, one per step (idle is the bare cloud, done the happy pose), each the whole canvas square. */
const STILLS = import.meta.glob<string>("./assets/odelia/*.webp", { eager: true, query: "?url", import: "default" });
const stillOf = (name: string) => STILLS[`./assets/odelia/${name}.webp`] ?? STILLS["./assets/odelia/idle.webp"];

/** The animator the patched library hangs on its canvas (scripts/patch-bot-avatars.mjs: link, aim). */
type Anim = { __pcAim?: [number, number, number]; __pcTilt?: boolean; __pcGround?: HTMLElement | null; __pcFollow?: HTMLElement | null; __pcPx?: number };

/**
 * The plush canvas's edge. The fur leaves a grainy haze past the outline, which reads as a cut-out, so this filter
 * redraws the silhouette from the canvas's own outline (blurred a touch and pulled back to a clean, soft edge), fills
 * the pile's gaps along it with its own colour and adds a soft rim of light along the upper-left edge. Instead of a
 * line round the outside (which read as a sticker), a soft, low shadow below and a faint ambient one all round lift
 * the lit side off a white page; on dark a faint cool glow does the same. A soft band just inside the silhouette, a
 * touch deeper than the body, keeps the pale upper left from fading into a pale page. It works from the drawn pixels, so it
 * follows every hop, turn and outfit. Desktop only: phones skip it (no per-frame cost there).
 */
function Edge({ id, size, dark }: { id: string; size: number; dark: boolean }) {
  const blur = Math.max(0.45, size * 0.006), rim = size * 0.022;
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true" focusable="false">
      <filter id={id} x="-15%" y="-15%" width="130%" height="135%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="soft" />
        <feComponentTransfer in="soft" result="shape"><feFuncA type="linear" slope="2.6" intercept="-0.9" /></feComponentTransfer>
        <feGaussianBlur in="SourceGraphic" stdDeviation={blur * 1.4} result="spread" />
        <feComponentTransfer in="spread" result="filler"><feFuncA type="linear" slope="4" intercept="0" /></feComponentTransfer>
        <feComposite in="SourceGraphic" in2="filler" operator="over" result="filled" />
        <feComposite in="filled" in2="shape" operator="in" result="body" />
        <feOffset in="shape" dx={rim} dy={rim * 1.15} result="nudged" />
        <feComposite in="shape" in2="nudged" operator="out" result="crescent" />
        <feGaussianBlur in="crescent" stdDeviation={size * 0.012} result="glow" />
        <feFlood floodColor="#F4FAFF" floodOpacity={dark ? 0.6 : 0.3} />
        <feComposite in2="glow" operator="in" result="light" />
        <feComposite in="light" in2="shape" operator="in" result="rimlight" />
        <feGaussianBlur in="shape" stdDeviation={size * 0.03} result="dropblur" />
        <feOffset in="dropblur" dy={size * 0.028} result="dropmoved" />
        <feFlood floodColor={dark ? "#000" : "#1B3A66"} floodOpacity={dark ? 0.45 : 0.17} />
        <feComposite in2="dropmoved" operator="in" result="drop" />
        <feGaussianBlur in="shape" stdDeviation={size * 0.011} result="ambblur" />
        <feFlood floodColor={dark ? "#9CC4F2" : "#2E5488"} floodOpacity={dark ? 0.16 : 0.2} />
        <feComposite in2="ambblur" operator="in" result="ambient" />
        {/* a clean edge from the inside: the silhouette's own rim, a touch deeper, so the pale upper left never fades
            into a pale page (the home hero's wash) */}
        <feMorphology in="shape" operator="erode" radius={Math.max(0.5, size * 0.012)} result="inner" />
        <feComposite in="shape" in2="inner" operator="out" result="band" />
        <feGaussianBlur in="band" stdDeviation={Math.max(0.35, size * 0.006)} result="bandsoft" />
        <feFlood floodColor="#2E5488" floodOpacity={dark ? 0.3 : 0.34} />
        <feComposite in2="bandsoft" operator="in" result="bandtint" />
        <feComposite in="bandtint" in2="shape" operator="in" result="inneredge" />
        <feMerge><feMergeNode in="drop" /><feMergeNode in="ambient" /><feMergeNode in="body" /><feMergeNode in="inneredge" /><feMergeNode in="rimlight" /></feMerge>
      </filter>
    </svg>
  );
}
/**
 * The canvas bot with its clean edge (on desktop). Until its plush pile has baked, the library can only draw a flat
 * grey stand-in, so a dressed cloud (one with data-pc) draws nothing until then and marks its canvas data-pc-baked when
 * the pile is there (scripts/patch-bot-avatars.mjs). Given a `stand` (the vector cloud), this shows it underneath until
 * that mark, then lets it fade out under the plush. `onAnim` gets the canvas's animator once it exists.
 */
function Plush({ stand, onAnim, ...props }: BotAvatarProps & { size: number; "data-pc"?: string; "data-pc-look"?: string; stand?: ReactNode; onAnim?: (a: Anim) => void }) {
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
  const hand = useRef(onAnim);
  useEffect(() => { hand.current = onAnim; });
  useEffect(() => {
    let raf = 0;
    const look = () => { const a = (ref.current as unknown as { __pcAnim?: Anim } | null)?.__pcAnim; if (a) hand.current?.(a); else raf = requestAnimationFrame(look); };
    if (hand.current) look();
    return () => cancelAnimationFrame(raf);
  }, []);
  const bot = <Guard quiet><BotAvatar ref={ref} {...SOFT} {...props} style={touch ? SHOWN : { ...SHOWN, filter: `url(#${id})` }} /></Guard>;
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

/** The plush still for the step (the whole canvas square), floating, with the prop in use riding along; changing step,
 *  the old still fades out under the new one. */
function Still({ size, name, prop, label }: { size: number; name: string; prop?: Prop; label?: string }) {
  const src = useSwap(stillOf(name));
  return (
    <span className="cloud-still" style={{ width: size, height: size }} role="img" aria-label={label}>
      <span className="cs-floater">
        {src.out && src.prev && <img key={"o" + src.n} className="out" src={src.prev} alt="" draggable={false} />}
        <img key={"i" + src.n} className={src.n ? "in" : undefined} src={src.cur} alt="" draggable={false} />
        {size >= PROPS && <OdeliaProps prop={prop} />}
      </span>
    </span>
  );
}

/** The soft glow in her own shape that breathes behind her while she works. */
function Aura() {
  return <span className="bot-aura" aria-hidden="true"><svg viewBox="0 0 100 100"><path d={CLOUD_PATH} /></svg></span>;
}

/**
 * Odelia. `task` dresses her for the step and hands her its prop; `gaze` is where the work sits beside her (x right,
 * y down, in her face's units, about 3 a clear glance), so her eyes, and on the large canvas her head, turn to it
 * while she works. When a job finishes she gives one happy bounce with her eyes closed in a smile; while idle, now and
 * then, she tips her head to one side and holds it a beat (her signature tilt).
 */
export function AgentBot({ size, busy, label = "Odelia", interactive = true, task, gaze }: { size: number; busy?: boolean; label?: string; interactive?: boolean; task?: OrbState; gaze?: [number, number] }) {
  const k = busy && task ? TASKS[task] : undefined;
  const done = useDone(busy);
  const look = k?.look ?? (busy ? gaze : undefined);
  const calm = !!(busy && k?.still), focus = !!(busy && k?.focus);
  const prop = size >= PROPS ? k?.prop : undefined;
  const ground = useRef<HTMLSpanElement>(null), follow = useRef<HTMLSpanElement>(null), anim = useRef<Anim | null>(null);
  // the large canvas: aim the head at the work, tilt while idle, and hand it the shadow and the props to move
  const aim: [number, number, number] = look ? [look[0] * 0.075, -look[1] * 0.06, look[0] * 0.02] : [0, 0, 0];
  const tie = (a: Anim) => { anim.current = a; a.__pcAim = aim; a.__pcTilt = !busy; a.__pcGround = ground.current; a.__pcFollow = follow.current; a.__pcPx = size / 100; };
  useEffect(() => { if (anim.current) tie(anim.current); });   // eslint-disable-line react-hooks/exhaustive-deps
  const pc = [k?.wear ?? "cloud", busy && k?.open && !done ? "open" : "", k?.shut ? "shut" : "", done ? "done" : ""].join(" ").replace(/ +/g, " ").trim();
  const s = { "--s": `${size}px` } as CSSProperties;
  let bot: ReactNode;
  const vector = (lbl?: string) => <CloudSvg size={size} busy={busy} wear={k?.wear} open={k?.open} still={k?.still} focus={k?.focus} shut={k?.shut} done={done} look={look} scan={task === "searching"} label={lbl} />;
  if (size < SMALL) bot = vector(label);
  else if (touch) bot = <Still size={size} name={done ? "done" : busy && task ? task : "idle"} prop={prop} label={label} />;
  else {
    // thinking stays put and breathes slowly; a step with a prop stays put and works at it; the rest hop
    bot = <>
      <Plush stand={vector()} type="cloud" face="mouth" color={CLOUD} size={size} state={busy && !k?.still && !k?.focus ? "working" : "default"} interactive={interactive}
        turn={calm || focus ? 0.3 : 1} jumpEvery={9} jumpSquashEase="soft" jumpRiseEase="soft" speed={k?.still ? 0.6 : 1} data-pc={pc}
        data-pc-look={look ? look.join(",") : undefined} onAnim={tie} aria-label={label} />
      <span className="pr-follow" ref={follow} aria-hidden="true"><OdeliaProps prop={prop} /></span>
    </>;
  }
  return (
    <span className={"odelia-bot" + (busy ? " busy" : "") + (calm ? " calm" : "") + (focus ? " focus" : "") + (done ? " done" : "") + (touch && size >= SMALL ? " still" : "")} style={s}>
      {busy && size >= GLOW && <Aura />}
      {size >= SMALL && <span ref={ground} className={"bot-ground" + (touch ? " float" : "")} aria-hidden="true" />}
      <span className="bot-body">{bot}</span>
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
