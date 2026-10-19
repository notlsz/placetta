import { useSwap, type Prop } from "./tasks";

/* What Odelia uses on a step, held at her lower right and in use, not just worn: a magnifier she sweeps while
   searching (her eyes follow it), a clipboard she writes on line by line, a laptop she types on, a pencil sketching a
   stroke, and sound arcs at her headphones while listening. Drawn in her 100 by 100 body box, the same box as the
   canvas and the vector cloud, in the landing page navy, white paper and the brand blue, with no dots and nothing round
   behind her. It sits on her and rides her hop (Bot.tsx), from 64px up; smaller, the outfit alone carries the step.
   Changing step, the old prop fades out and the new one comes in with a small pop (about 280ms). Motion is CSS only
   (bot.css), and reduced motion shows each prop finished and still. */

const INK = "#132A55", BLUE = "#4D73A3", PAPER = "#F7FAFE", EDGE = "rgba(19,42,85,0.22)";

/** A navy pencil with its tip at 0 0, pointing down and to the left. */
function Pencil() {
  return (
    <g className="pr-pencil-body">
      <path d="M1.4 -4.4L11.3 -14.3L14.3 -11.3L4.4 -1.4Z" fill={INK} />
      <path d="M2.6 -5.6L12.4 -15.4L13.1 -14.7L3.3 -4.9Z" fill="rgba(255,255,255,0.28)" />
      <path d="M11.3 -14.3L12.7 -15.7L15.7 -12.7L14.3 -11.3Z" fill="#9DB7D8" />
      <path d="M0 0L1.4 -4.4L4.4 -1.4Z" fill="#EBD3AE" />
      <path d="M0 0L0.6 -1.9L1.9 -0.6Z" fill={INK} />
    </g>
  );
}

function One({ prop }: { prop: Prop }) {
  if (prop === "magnifier") return (
    <g className="pr-mag">
      <path d="M85.6 79.6L93 87" stroke={INK} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M86.4 80.4L91.6 85.6" stroke="rgba(255,255,255,0.3)" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="79" cy="73" r="8.6" fill="rgba(226,239,253,0.5)" stroke={INK} strokeWidth="2.6" />
      <path d="M73.8 70.4Q75.8 66.8 79.8 66.6" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
  if (prop === "clipboard") return (
    <g transform="translate(4 3) rotate(-10 79 77)">
      <rect x="67" y="63" width="24" height="29" rx="3" fill={INK} />
      <rect x="69.3" y="67" width="19.4" height="22.6" rx="1.4" fill={PAPER} />
      <rect x="74" y="61.2" width="10" height="5" rx="1.8" fill="#3D5F98" />
      <path className="pr-line l1" d="M71.6 72H86" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <path className="pr-line l2" d="M71.6 77H85" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <path className="pr-line l3" d="M71.6 82H80.6" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <g className="pr-pencil write"><Pencil /></g>
    </g>
  );
  if (prop === "laptop") return (
    <g className="pr-laptop">
      <rect x="62" y="65.5" width="29" height="20.5" rx="2.4" fill={INK} />
      <rect x="64.2" y="67.6" width="24.6" height="16.2" rx="1.2" fill="#CFE2F6" />
      <path d="M64.2 67.6H88.8V73Q76 70.6 64.2 76Z" fill="rgba(255,255,255,0.35)" />
      <path className="pr-type t1" d="M67 72H83" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <path className="pr-type t2" d="M67 76H80" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <path className="pr-type t3" d="M67 80H75" stroke={BLUE} strokeWidth="1.3" strokeLinecap="round" pathLength="1" />
      <path d="M57.5 86H95.5L92.6 91H60.4Z" fill={INK} />
      <path d="M60 86.9H93" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
    </g>
  );
  if (prop === "pencil") return (
    <g>
      <g transform="rotate(8 79 80)">
        <rect x="65.5" y="70" width="27" height="20" rx="2" fill={PAPER} stroke={EDGE} strokeWidth="0.6" />
        <path className="pr-sketch" d="M69 86C71 78 77 75.6 79.6 80.4S87 87 89 75" fill="none" stroke={BLUE} strokeWidth="1.5" strokeLinecap="round" pathLength="1" />
        <g className="pr-pencil sketch"><Pencil /></g>
      </g>
    </g>
  );
  return (
    <g className="pr-waves">
      <path className="w1" d="M94.4 50Q98 56 94.4 62M5.6 50Q2 56 5.6 62" fill="none" stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" />
      <path className="w2" d="M98 46Q103.4 56 98 66M2 46Q-3.4 56 2 66" fill="none" stroke={BLUE} strokeWidth="1.9" strokeLinecap="round" />
    </g>
  );
}

export function OdeliaProps({ prop }: { prop?: Prop }) {
  const s = useSwap(prop);
  if (!s.cur && !s.prev) return null;
  return (
    <svg className="odelia-props" viewBox="0 0 100 100" overflow="visible" aria-hidden="true" focusable="false">
      {s.out && s.prev && <g key={"o" + s.n} className="pr out"><One prop={s.prev} /></g>}
      {s.cur && <g key={"i" + s.n} className="pr in"><One prop={s.cur} /></g>}
    </svg>
  );
}
