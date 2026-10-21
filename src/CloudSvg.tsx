import { useId, useState, type CSSProperties } from "react";
import { useSwap, type Wear } from "./tasks";

/* Odelia's cloud as a crisp vector, for small spots (under about 40px: the chat box, turn headers, the tab bar), and
   standing in for the plush canvas until its pile has baked. It is the same cloud the canvas draws (src/Bot.tsx): the
   library's cloud outline, its face placement and smile, the same outfits, lit the same way from the upper left. The
   body is a two-stop gradient with a rim of light along its upper-left edge and a soft blue edge all round, so the lit
   side still holds its shape on a white page; the eyes and smile are
   Odelia's original flat navy (the library's own, no highlight); the cheeks are soft. A soft contact shadow
   sits under it and shrinks as it hops.

   Every step reads on the cloud itself: its outfit (tasks.ts), and for thinking, closed eyes. The eyes rest toward the
   work (`look`), sweep side to side while searching (`scan`), and glance about while idle. Under 40px the cheeks are
   fuller, so they still show; under 30px the face is simplified: no glints, thicker frames, and the eyes sit smaller inside glasses so they never smudge.

   Motion is CSS only (bot.css): a crouch, a hop and a squash on landing while busy; a slow breath and float while
   idle; a blink every 4 to 7 seconds; a still pose under reduced motion. */

const NAVY = "#132A55";
const PINK = "#F0ADD3";
/** The cloud outline from bot-avatars (its "cloud" type), in its 100 by 100 body box. */
export const CLOUD = "M19 44A25 25 0 1 1 69 44A25 25 0 1 1 19 44ZM47 50A21 21 0 1 1 89 50A21 21 0 1 1 47 50ZM7 68A17 17 0 1 1 41 68A17 17 0 1 1 7 68ZM32 73A18 18 0 1 1 68 73A18 18 0 1 1 32 73ZM60 70A16 16 0 1 1 92 70A16 16 0 1 1 60 70Z";

/** The library's smile (bot-avatars' mouth face): half width, corner thickness, top and bottom curves. */
function smile(hw: number, t0: number, a: number, yt: number, ab: number, yb: number) {
  const u = t0 * Math.sin(0.684), c = t0 * Math.cos(0.684), x = (4 / 3) * c, p = (4 / 3) * u;
  const f = (n: number) => +n.toFixed(2);
  return `M${f(-hw + u)} ${f(-c)}C${f(-hw + a * hw)} ${f(yt - t0)} ${f(hw - a * hw)} ${f(yt - t0)} ${f(hw - u)} ${f(-c)}` +
    `C${f(hw - u + x)} ${f(-c - p)} ${f(hw + u + x)} ${f(c - p)} ${f(hw + u)} ${f(c)}` +
    `C${f(hw - ab * hw)} ${f(yb + t0)} ${f(-hw + ab * hw)} ${f(yb + t0)} ${f(-hw - u)} ${f(c)}` +
    `C${f(-hw - u - x)} ${f(c - p)} ${f(-hw + u - x)} ${f(-c - p)} ${f(-hw + u)} ${f(-c)}Z`;
}
// idle and busy (the big open smile): the library's own mouth, the same numbers the canvas face uses
const SMILE = { idle: smile(6.5, 1.9, 2 / 3, 3.53, 2 / 3, 3.53), busy: smile(9.5, 0, 2 / 3, 1.6, 0, 17.3) };

/* The outfits, in the face's units (eyes 25 apart, the face's middle at 0 0). Hats sit centred over the face and are
   pulled down over the crown, tilted a little to follow the head from its high left lobe to its lower right one, so
   they are worn rather than perched on one bump. The canvas draws the same shapes in the same places
   (scripts/patch-bot-avatars.mjs, __pcWear). */
const HAT = {
  beanie: "translate(2 -33) rotate(4) scale(1.15)",
  beret: "translate(4 -35) rotate(9) scale(1.12)",
  cap: "translate(-1 -33.5) rotate(5) scale(1.12)",
  bow: "translate(23 -28.5) rotate(-16) scale(1.05)",
};
const BERET = "M-25 3.5C-27 -6 -14 -14.5 2 -14.5C18 -14.5 29 -7 28 1C27.5 4.5 24 6.5 19 6C9 5 -12 6.5 -21 6.5C-24 6.5 -25 5.5 -25 3.5Z";
const BEANIE = "M-21 5C-22 -10 -11 -17 0 -17C11 -17 22 -10 21 5Z";
const CUFF = "M-21 1.2Q0 4 21 1.2Q24.6 1.2 24.6 5.6Q24.6 10 21 10.2Q0 14 -21 10.2Q-24.6 10 -24.6 5.6Q-24.6 1.2 -21 1.2Z";
const CAP = "M-22 4C-23 -10 -12 -18.5 0 -18.5C12 -18.5 23 -10 22 4Z";
const CAP_BAND = "M-22.4 1.6Q0 4.6 22.4 1.6L22.6 5.4Q0 8.4 -22.6 5.4Z";
const BILL = "M10 2.4C20 0.2 34 1 40.5 5.6C35 9.6 17 9.4 7.5 6.8Z";
const BAND = "M-40.5 -3C-43.5 -33 -24 -49 -3 -48.5C18 -48 42 -36 38.5 -3";
const BOW = "M-2.6 -2.4C-6 -6 -10.5 -8.2 -12.6 -6C-14.4 -3.4 -14.4 3.4 -12.6 6C-10.5 8.2 -6 6 -2.6 2.4ZM2.6 -2.4C6 -6 10.5 -8.2 12.6 -6C14.4 -3.4 14.4 3.4 12.6 6C10.5 8.2 6 6 2.6 2.4Z";
const TAILS = "M-1.8 2.6L-6.4 11.4Q-4.6 12.4 -3 10.8L0 5.6L3 10.8Q4.6 12.4 6.4 11.4L1.8 2.6Z";

export type CloudProps = {
  size: number; busy?: boolean; wear?: Wear; open?: boolean; still?: boolean; shut?: boolean;
  /** works at a prop: stays put with a small quick bob instead of hopping */
  focus?: boolean;
  /** the one-beat done pose: a happy bounce, eyes closed in a smile */
  done?: boolean;
  /** where the eyes rest while busy (x right, y down, face units) */
  look?: [number, number];
  /** sweep the eyes side to side (searching) */
  scan?: boolean;
  label?: string;
};

export function CloudSvg({ size, busy, wear, still, shut, focus, done, look, scan, label }: CloudProps) {
  const id = "cs" + useId().replace(/[^a-zA-Z0-9]/g, "");
  // each cloud blinks on its own beat, somewhere between 4 and 7 seconds
  const [blink] = useState(() => 4 + Math.random() * 3);
  const u = (n: number) => `url(#${id}${n})`;
  // lines stay at least about 0.9px wide however small the cloud (1.1px for the simplified small face)
  const tiny = size < 30, small = size < 40, px = 100 / size, line = (w: number) => Math.max(w, (tiny ? 1.1 : 0.9) * px);
  const mode = done ? "done" : busy && still ? "calm" : busy && focus ? "focus" : busy ? "hop" : "idle";
  const outfit = useSwap(wear);
  // the big open smile while hopping, as the canvas does; the small one while idle, thinking or at a prop
  const mouth = busy && !still && !focus && !done ? SMILE.busy : SMILE.idle;
  const glasses = wear === "glasses-round" || wear === "glasses-square";
  const [lx, ly] = busy && look ? look : [0, 0];
  const style = { "--blink": `${blink.toFixed(2)}s`, "--lx": `${lx}px`, "--ly": `${ly}px` } as CSSProperties;
  // the face sits a touch larger on a small cloud, so the eyes, cheeks and smile keep their shape
  const face = `translate(50 ${tiny ? 58.5 : 58}) scale(${tiny ? 1.02 : 0.95})`;
  return (
    <svg className={"cloud-svg " + mode + (tiny ? " tiny" : "")} width={size} height={size} viewBox="0 0 100 100" overflow="visible" role="img" aria-label={label} aria-hidden={label ? undefined : true} style={style}>
      <defs>
        <path id={id + 0} d={CLOUD} />
        <clipPath id={id + 1}><path d={CLOUD} /></clipPath>
        {/* the body: light from the upper left, the brand blue in the middle; the lit side stops short of white */}
        <linearGradient id={id + 2} x1="0.18" y1="0.08" x2="0.86" y2="0.96"><stop offset="0" stopColor="#C4DCEF" /><stop offset="1" stopColor="#82ABCF" /></linearGradient>
        {/* a little roundness: the far edges turn away from the light */}
        <radialGradient id={id + 3} cx="0.4" cy="0.36" r="0.72"><stop offset="0.6" stopColor="#1E4A80" stopOpacity="0" /><stop offset="1" stopColor="#1E4A80" stopOpacity="0.24" /></radialGradient>
        <radialGradient id={id + 4}><stop offset="0" stopColor={PINK} /><stop offset="0.55" stopColor={PINK} /><stop offset="1" stopColor={PINK} stopOpacity="0" /></radialGradient>
        {/* navy with a highlight toward the light, for the eyes and everything the cloud wears */}
        <linearGradient id={id + 5} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3D5F98" /><stop offset="0.45" stopColor={NAVY} /><stop offset="1" stopColor="#0A1734" /></linearGradient>
        <radialGradient id={id + 6}><stop offset="0" stopColor="#0C1E42" stopOpacity="0.28" /><stop offset="1" stopColor="#0C1E42" stopOpacity="0" /></radialGradient>
        <radialGradient id={id + 8}><stop offset="0" className="cs-ground-in" /><stop offset="1" className="cs-ground-out" /></radialGradient>
      </defs>
      {!tiny && <ellipse className="cs-ground" cx="50" cy="93.5" rx="30" ry="3.6" fill={u(8)} />}
      <g className="cs-hop">
        <g className="cs-squash">
          {/* the edge: the outline stroked under the body, so only its outer half shows */}
          <use href={"#" + id + 0} className="cs-edge" fill="none" strokeWidth={line(tiny ? 2.4 : 2)} strokeLinejoin="round" />
          <g clipPath={u(1)}>
            {/* the rim: the body drawn over a pale copy of itself, nudged down and right, leaves a soft line of light */}
            <use href={"#" + id + 0} fill="#EAF3FB" />
            <use href={"#" + id + 0} fill={u(2)} opacity="0.6" transform="translate(0.9 1.1)" />
            <use href={"#" + id + 0} fill={u(2)} transform="translate(2 2.3)" />
            <rect x="0" y="0" width="100" height="100" fill={u(3)} />
            <g transform={face}>
              {wear === "beret" && <ellipse cx="1" cy="5.5" rx="25" ry="5.5" fill={u(6)} transform={HAT.beret} />}
              {wear === "beanie" && <ellipse cx="0.5" cy="12" rx="25" ry="5.5" fill={u(6)} transform={HAT.beanie} />}
              {wear === "cap" && <ellipse cx="2" cy="8" rx="25" ry="5.5" fill={u(6)} transform={HAT.cap} />}
              {wear === "bow" && <ellipse cx="0" cy="5" rx="12" ry="5" fill={u(6)} transform={HAT.bow} />}
              {wear === "headphones" && <><ellipse cx="-37" cy="1" rx="4.5" ry="10.5" fill={u(6)} /><ellipse cx="35" cy="1" rx="4.5" ry="10.5" fill={u(6)} /></>}
              {wear === "bowtie" && <ellipse cx="0.8" cy="30.5" rx="12.5" ry="4.6" fill={u(6)} />}
            </g>
          </g>
          <g transform={face}>
            <g className={"cs-look" + (busy && scan ? " scan" : "")}>
              {[-18.3, 18.3].map(x => <ellipse key={x} cx={x} cy="6.1" rx={small ? 8.4 : 7.2} ry={small ? 5.2 : 4.4} fill={u(4)} opacity={small ? 1 : 0.88} />)}
              {[-12.5, 12.5].map(x => shut || done ? (
                // thinking: the eyes closed in a content curve; done: closed in a happy arc
                <path key={x} d={done ? `M${x - 6} -1Q${x} -8.2 ${x + 6} -1` : `M${x - 6} -3.4Q${x} 3.4 ${x + 6} -3.4`} fill="none" stroke={NAVY} strokeWidth={line(2.6)} strokeLinecap="round" />
              ) : (
                <g key={x} className="cs-eye" transform={`translate(${x} -3.5)${tiny && glasses ? " scale(0.74)" : ""}`}>
                  <rect x="-6.3" y="-7.4" width="12.6" height="14.8" rx="6.3" fill={NAVY} />
                </g>
              ))}
              <g transform={`translate(0 ${mouth === SMILE.busy ? 11.6 : 12.5})`}>
                <path d={mouth} fill={NAVY} />
              </g>
            </g>
            {/* changing step, the old outfit fades out while the new one pops in from the crown */}
            {outfit.out && outfit.prev && <g key={"o" + outfit.n} className="cs-wear out"><Outfit wear={outfit.prev} u={u} line={line} tiny={tiny} /></g>}
            <g key={"i" + outfit.n} className={"cs-wear" + (outfit.n ? " in" : "")}><Outfit wear={wear} u={u} line={line} tiny={tiny} /></g>
          </g>
        </g>
      </g>
    </svg>
  );
}

/** What the cloud wears, in the face's units (eyes 25 apart), the same shapes the canvas draws. */
function Outfit({ wear, u, line, tiny }: { wear?: Wear; u: (n: number) => string; line: (w: number) => number; tiny: boolean }) {
  if (!wear) return null;
  const ink = u(5);
  if (wear === "glasses-round" || wear === "glasses-square") {
    const round = wear === "glasses-round", w = line(tiny ? 2.6 : 2.1);
    const lens = (x: number) => round ? <circle cx={x} cy="-3.1" r="9.6" /> : <rect x={x - 10.8} y="-12.4" width="21.6" height="17.8" rx="4.6" />;
    const rx = round ? 9.6 : 10.8;
    return (
      <g fill="none" stroke={ink} strokeWidth={w} strokeLinecap="round">
        {lens(-12.5)}{lens(12.5)}
        <path d={`M${-12.5 + rx} -4.7Q0 -7.9 ${12.5 - rx} -4.7M${-12.5 - rx} -5.1L${-12.5 - rx - 3.6} -6.3M${12.5 + rx} -5.1L${12.5 + rx + 3.6} -6.3`} fill="none" />
      </g>
    );
  }
  if (wear === "beret") return (
    <g transform={HAT.beret}>
      <path d={BERET} fill={ink} />
      {!tiny && <path d="M-22 4.6Q0 2.6 21 4.4" fill="none" stroke="rgba(4,12,32,0.55)" strokeWidth={line(1.6)} />}
      <path d="M-0.6 -14.2Q-0.4 -18.6 1.6 -18.4Q2.6 -16.8 2 -14.2Z" fill={ink} />
    </g>
  );
  if (wear === "beanie") return (
    <g transform={HAT.beanie}>
      <path d={BEANIE} fill={ink} />
      <path d={CUFF} fill={ink} />
      {!tiny && <path d="M-17.5 3V10.6M-10.5 3.6V11.6M-3.5 4V12.2M3.5 4V12.2M10.5 3.6V11.6M17.5 3V10.6" stroke="rgba(0,0,0,0.25)" strokeWidth={line(0.8)} />}
      {/* the pom-pom sits down into the crown, so it reads as part of the hat */}
      <path d="M-4.4 -16.4A4.6 4.6 0 1 1 4.4 -16.4Q0 -15.6 -4.4 -16.4Z" fill={ink} />
    </g>
  );
  if (wear === "cap") return (
    <g transform={HAT.cap}>
      <path d={BILL} fill={ink} />
      <path d={CAP} fill={ink} />
      {!tiny && <path d="M0 -18.5V3.2M-11 -15Q-13 -6 -12.4 2.6M11 -15Q13 -6 12.4 2.6" fill="none" stroke="rgba(0,0,0,0.26)" strokeWidth={line(0.8)} />}
      <path d={CAP_BAND} fill={ink} />
      {!tiny && <path d="M12 6.6Q24 7.4 36 5.6" fill="none" stroke="rgba(120,150,200,0.4)" strokeWidth={line(0.8)} />}
      <path d="M-2.6 -18.2Q0 -21.2 2.6 -18.2Z" fill={ink} />
    </g>
  );
  if (wear === "bow") return (
    <g transform={HAT.bow}>
      <path d={TAILS} fill={ink} />
      <path d={BOW} fill={ink} />
      <rect x="-3.4" y="-3.8" width="6.8" height="7.6" rx="2" fill={ink} />
    </g>
  );
  if (wear === "headphones") return (
    <g transform="translate(-1 -2)">
      <path d={BAND} fill="none" stroke={ink} strokeWidth={line(3.4)} strokeLinecap="round" />
      <rect x="-46.5" y="-9" width="10" height="19" rx="5" fill={ink} />
      <rect x="34.5" y="-9" width="10" height="19" rx="5" fill={ink} />
    </g>
  );
  return (
    <g transform="translate(0 27.5) scale(0.86)">
      <path d={BOW} fill={ink} />
      <rect x="-3.2" y="-3.6" width="6.4" height="7.2" rx="1.8" fill={ink} />
    </g>
  );
}
