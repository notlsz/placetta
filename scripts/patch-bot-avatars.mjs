// Patches bot-avatars after install for Placetta's agent cloud (src/Bot.tsx). Idempotent: run it as often as you like.
//
// What it adds, all drawn inside the library's own frame so it turns, hops and blinks with the head:
//   blush     soft pink cheeks on the "mouth" face (colour from globalThis.__botBlush)
//   face      lit eyes (a specular glint, a faint inner shadow under the cloth's rim, light bounced up from the
//             cloth) and a smile pressed slightly into the cloth
//   outfits   glasses, beret, beanie, cap, hair bow, headphones and bow tie in navy with a soft highlight and a
//             contact shadow, drawn in the face's coordinates, so they scale with the head and turn with it; hats
//             sit centred over the face, pulled down over the crown
//   thinking  eyes closed in a content curve (data-pc includes "shut")
//   gaze      the eyes rest toward the work beside the cloud (data-pc-look="x,y")
//   motion    a hop on a real arc that lands into a small squash and settles, no spin on the busy hop, and a blink
//             every 4 to 7 seconds
//
// Nothing changes for a bot that doesn't ask: the face and outfits only switch on for a canvas with a data-pc
// attribute (what the cloud wears, for example "glasses-round" or "beret"), the motion only when
// globalThis.__botPlacetta is set, and the blush only when globalThis.__botBlush is.
//
// How it stays idempotent: the untouched library is kept next to it as index.es.js.placetta-orig, and every run
// builds the patched file from that copy. A fresh install (no marker in the file) refreshes the copy; a file
// patched by the older blush-only version of this script is first un-patched by removing that block.
// The app bundles the ES build; the CommonJS build is not used, so only the ES build is patched.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FILE = "node_modules/bot-avatars/dist/index.es.js";
const ORIG = FILE + ".placetta-orig";
const MARK = "/* placetta-patched v3 */";
const OLD_MARK = "/* placetta-blush */";   // kept in the output so older copies of this script see it and skip
const OLD_BLUSH = `  ${OLD_MARK}
  if (o.face === "mouth" && globalThis.__botBlush) {
    const pink = globalThis.__botBlush;
    for (const S of [-1, 1]) f(S * (l + 5.8), i + 9.6, () => {
      const g = t.createRadialGradient(0, 0, 0, 0, 0, 7.2);
      g.addColorStop(0, pink); g.addColorStop(0.55, pink); g.addColorStop(1, "rgba(255,255,255,0)");
      t.globalAlpha *= 0.88; t.fillStyle = g; t.beginPath(); t.ellipse(0, 0, 7.2, 4.4, 0, 0, Math.PI * 2); t.fill();
    });
  }
`;

/* The new drawing, as plain functions at the library's top level (so they can use its eye path, ri). All sizes are
   in the face's units: the body is 100 tall and the eyes sit 25 apart. The light comes from the upper left. */
const HELPERS = String.raw`
${MARK}
const __pcNavy = "#132A55", __pcHi = "#3D5F98", __pcLo = "#0A1734";
// a capsule (a pill standing upright) as a sub-path, for the eyes
function __pcCap(t, cx, top, hw, bot) {
  const r = Math.min(hw, (bot - top) / 2);
  t.moveTo(cx - hw, top + r); t.arc(cx, top + r, r, Math.PI, 0); t.lineTo(cx + hw, bot - r); t.arc(cx, bot - r, r, 0, Math.PI); t.closePath();
}
// navy with a highlight toward the light: across a box from its upper left to its lower right
function __pcInk(t, x0, y0, x1, y1) {
  const g = t.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, __pcHi); g.addColorStop(0.45, __pcNavy); g.addColorStop(1, __pcLo);
  return g;
}
// An eye as a glossy bead set into the cloth. E, z, B, R are the library's eye stroke (a short curve drawn with a
// wide round pen); W is how open the eye is, so the lighting fades out as it blinks or laughs.
function __pcEye(t, ink, E, z, B, R, W, shut) {
  if (shut) {
    // thinking: the eye closed in a content curve, the same line the vector cloud draws
    t.strokeStyle = ink; t.lineWidth = 2.6; t.lineCap = "round"; t.beginPath(); t.moveTo(-6, 0.1); t.quadraticCurveTo(0, 6.9, 6, 0.1); t.stroke();
    return;
  }
  const k = Math.max(0, Math.min(1, (W - 0.35) / 0.45));
  const hw = E + R / 2, mid = (z + B) / 2, top = Math.min(z, mid) - R / 2, bot = Math.max(z, mid) + R / 2, hh = (bot - top) / 2, cy = (top + bot) / 2;
  if (k > 0) {
    // the cloth dips round the bead: a faint shade just below and right of it
    t.save(); t.globalAlpha *= k;
    const g = t.createRadialGradient(hw * 0.2, cy + hh * 0.22, hh * 0.7, hw * 0.2, cy + hh * 0.22, hh * 1.32);
    g.addColorStop(0, "rgba(22,52,98,0.2)"); g.addColorStop(1, "rgba(22,52,98,0)");
    t.fillStyle = g; t.beginPath(); t.ellipse(hw * 0.2, cy + hh * 0.22, hw * 1.9, hh * 1.32, 0, 0, Math.PI * 2); t.fill(); t.restore();
  }
  t.strokeStyle = ink; t.lineWidth = R; t.stroke(ri(E, z, B));
  if (k <= 0) return;
  t.save(); t.globalAlpha *= k; t.beginPath(); __pcCap(t, 0, top, hw, bot); t.clip();
  // light bounced up off the cloth into the lower half of the bead
  const b = t.createRadialGradient(hw * 0.25, bot - hh * 0.2, 0, hw * 0.25, bot - hh * 0.2, hh * 1.05);
  b.addColorStop(0, "rgba(112,152,212,0.62)"); b.addColorStop(0.6, "rgba(112,152,212,0.16)"); b.addColorStop(1, "rgba(112,152,212,0)");
  t.fillStyle = b; t.fillRect(-hw, top, hw * 2, hh * 2);
  // the cloth's rim shades the top of the bead
  t.fillStyle = "rgba(3,10,28,0.5)"; t.beginPath(); t.rect(-hw - 4, top - 4, hw * 2 + 8, hh * 2 + 8); __pcCap(t, hw * 0.16, top + hh * 0.16, hw, bot + hh * 0.16); t.fill("evenodd");
  // the glint, and a small second one where the cloth reflects
  t.fillStyle = "rgba(255,255,255,0.94)"; t.beginPath(); t.ellipse(-hw * 0.3, top + hh * 0.44, hw * 0.3, hh * 0.2, -0.4, 0, Math.PI * 2); t.fill();
  t.fillStyle = "rgba(255,255,255,0.32)"; t.beginPath(); t.arc(hw * 0.34, bot - hh * 0.34, hw * 0.13, 0, Math.PI * 2); t.fill();
  t.restore();
}
// The smile, pressed slightly into the cloth: the lower lip of the groove catches the light, the top inside is in shade.
function __pcMouth(t, ink, p) {
  t.save(); t.translate(0.2, 0.95); t.fillStyle = "rgba(255,255,255,0.42)"; t.fill(p); t.restore();
  t.fillStyle = ink; t.fill(p);
  if (typeof Path2D !== "function") return;
  t.save(); t.clip(p);
  const sh = new Path2D(); sh.rect(-40, -40, 80, 80); sh.addPath(p, { a: 1, b: 0, c: 0, d: 1, e: 0.35, f: 0.85 });
  t.fillStyle = "rgba(2,8,24,0.55)"; t.fill(sh, "evenodd");
  const lt = new Path2D(); lt.rect(-40, -40, 80, 80); lt.addPath(p, { a: 1, b: 0, c: 0, d: 1, e: -0.2, f: -0.9 });
  t.fillStyle = "rgba(120,160,215,0.38)"; t.fill(lt, "evenodd");
  t.restore();
}
// What the cloud wears. phase "shadow" runs inside the face's clip (the soft shadows each piece casts on the cloth);
// phase "front" runs unclipped, over the body (the pieces themselves). n is the pose, s the draw options.
function __pcWear(t, n, s, eyes, phase) {
  const w = " " + s.pc + " ", has = (k) => w.includes(" " + k + " ");
  const cy = Math.cos(n.yaw), sy = Math.sin(n.yaw), cp = Math.cos(n.pitch), sp = Math.sin(n.pitch);
  const facing = Math.max(0, Math.min(1, (cy * cp + 0.1) * 4));
  const shadow = phase === "shadow";
  // a point on the head, d units in front of the body's middle, turned with the head
  const at = (x, y, d, draw, flat) => {
    const X = x * cy + d * sy, Z = -x * sy + d * cy;
    t.save(); t.translate(X, y * cp - Z * sp); t.scale(flat ? Math.max(0.2, Math.abs(cy)) : 0.8 + 0.2 * Math.abs(cy), flat ? Math.max(0.2, cp) : 1); draw(); t.restore();
  };
  const soft = (x, y, rx, ry, a) => {
    const g = t.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(12,30,66," + a + ")"); g.addColorStop(1, "rgba(12,30,66,0)");
    t.save(); t.translate(x, y); t.scale(rx, ry); t.fillStyle = g; t.beginPath(); t.arc(0, 0, 1, 0, Math.PI * 2); t.fill(); t.restore();
  };
  const sheen = (x0, y0, x1, y1, a) => {
    const g = t.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(255,255,255," + a + ")"); g.addColorStop(1, "rgba(255,255,255,0)");
    return g;
  };

  // glasses: thin navy frames over the eyes, a faint glass with a glint
  const gl = has("glasses-round") ? "round" : has("glasses-square") ? "square" : null;
  if (gl && eyes && facing > 0.01) {
    const lens = (e) => {
      const rx = (gl === "round" ? 9.6 : 10.8) * e.sx, ry = (gl === "round" ? 9.6 : 8.9) * e.sy, p = new Path2D();
      if (gl === "round") p.ellipse(e.x, e.y + 0.4, rx, ry, 0, 0, Math.PI * 2);
      else { const r = Math.min(rx, ry, 4.6); p.moveTo(e.x - rx + r, e.y - ry); p.arcTo(e.x + rx, e.y - ry, e.x + rx, e.y + ry, r); p.arcTo(e.x + rx, e.y + ry, e.x - rx, e.y + ry, r); p.arcTo(e.x - rx, e.y + ry, e.x - rx, e.y - ry, r); p.arcTo(e.x - rx, e.y - ry, e.x + rx, e.y - ry, r); p.closePath(); }
      return { p, rx, ry };
    };
    const [L, R] = [lens(eyes[0]), lens(eyes[1])];
    const frame = new Path2D();
    frame.addPath(L.p); frame.addPath(R.p);
    const lx = eyes[0].x + L.rx, rx = eyes[1].x - R.rx, by = (eyes[0].y + eyes[1].y) / 2 - 1.2;
    frame.moveTo(lx, by); frame.quadraticCurveTo((lx + rx) / 2, by - 3.2, rx, by);
    frame.moveTo(eyes[0].x - L.rx, eyes[0].y - 1.6); frame.lineTo(eyes[0].x - L.rx - 3.6 * eyes[0].sx, eyes[0].y - 2.8);
    frame.moveTo(eyes[1].x + R.rx, eyes[1].y - 1.6); frame.lineTo(eyes[1].x + R.rx + 3.6 * eyes[1].sx, eyes[1].y - 2.8);
    t.save(); t.globalAlpha *= facing; t.lineCap = "round"; t.lineJoin = "round";
    if (shadow) {
      t.translate(0.9, 1.6);
      t.strokeStyle = "rgba(12,30,66,0.09)"; t.lineWidth = 4.6; t.stroke(frame);
      t.strokeStyle = "rgba(12,30,66,0.14)"; t.lineWidth = 2.6; t.stroke(frame);
    } else {
      for (const l of [L, R]) {
        t.save(); t.clip(l.p);
        t.fillStyle = "rgba(235,244,255,0.13)"; t.fill(l.p);
        t.fillStyle = sheen(-30, -14, -6, 2, 0.34); t.beginPath(); t.moveTo(-40, 4); t.lineTo(-30, -16); t.lineTo(40, -16); t.lineTo(30, 4); t.closePath(); t.fill();
        t.restore();
      }
      t.strokeStyle = __pcInk(t, -24, -14, 24, 10); t.lineWidth = 2.1; t.stroke(frame);
      t.strokeStyle = sheen(-26, -14, -4, 4, 0.55); t.lineWidth = 0.7; t.stroke(frame);
    }
    t.restore();
  }

  // Hats sit centred over the face and are pulled down over the crown, tilted to follow the head from its high left
  // lobe to its lower right one, so they are worn rather than perched on one bump (the same places as CloudSvg.tsx).
  // beret: a soft navy disc slouched to the right over the crown
  if (has("beret")) at(4, -35, 5, () => {
    t.rotate(0.157); t.scale(1.12, 1.12);
    if (shadow) { soft(1, 5.5, 25, 5.5, 0.26); return; }
    const p = new Path2D("M-25 3.5C-27 -6 -14 -14.5 2 -14.5C18 -14.5 29 -7 28 1C27.5 4.5 24 6.5 19 6C9 5 -12 6.5 -21 6.5C-24 6.5 -25 5.5 -25 3.5Z");
    const g = t.createRadialGradient(-9, -10, 1, -2, -4, 30);
    g.addColorStop(0, "#41639C"); g.addColorStop(0.42, __pcNavy); g.addColorStop(1, "#0B1938");
    t.fillStyle = g; t.fill(p);
    // the folded band where it meets the head
    t.strokeStyle = "rgba(4,12,32,0.55)"; t.lineWidth = 1.6; t.beginPath(); t.moveTo(-22, 4.6); t.quadraticCurveTo(0, 2.6, 21, 4.4); t.stroke();
    t.save(); t.clip(p); t.fillStyle = sheen(-16, -14, -2, -2, 0.28); t.fillRect(-30, -20, 60, 30); t.restore();
    // the little stalk on top, grown out of the crown
    t.fillStyle = __pcInk(t, -1, -19, 2, -14); t.fill(new Path2D("M-0.6 -14.2Q-0.4 -18.6 1.6 -18.4Q2.6 -16.8 2 -14.2Z"));
  });

  // beanie: a knitted dome over the crown with a ribbed cuff and a pom-pom
  if (has("beanie")) at(2, -33, 5, () => {
    t.rotate(0.07); t.scale(1.15, 1.15);
    if (shadow) { soft(0.5, 12, 25, 5.5, 0.28); return; }
    const dome = new Path2D("M-21 5C-22 -10 -11 -17 0 -17C11 -17 22 -10 21 5Z");
    const g = t.createRadialGradient(-9, -12, 1, -2, -4, 28);
    g.addColorStop(0, "#43669F"); g.addColorStop(0.45, __pcNavy); g.addColorStop(1, "#0B1938");
    t.fillStyle = g; t.fill(dome);
    t.save(); t.clip(dome); t.lineWidth = 0.7;
    for (let i = -4; i <= 4; i++) { t.strokeStyle = i % 2 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.16)"; t.beginPath(); t.moveTo(i * 5, 5); t.quadraticCurveTo(i * 4, -7, i * 1.5, -17); t.stroke(); }
    t.fillStyle = sheen(-15, -15, -3, -2, 0.26); t.fillRect(-30, -24, 60, 30); t.restore();
    // the cuff wraps the round head, so its edges bow toward the viewer in the middle
    const cuff = new Path2D("M-21 1.2Q0 4 21 1.2Q24.6 1.2 24.6 5.6Q24.6 10 21 10.2Q0 14 -21 10.2Q-24.6 10 -24.6 5.6Q-24.6 1.2 -21 1.2Z");
    t.fillStyle = __pcInk(t, -24, 0, 18, 14); t.fill(cuff);
    t.save(); t.clip(cuff); t.lineWidth = 0.8; t.strokeStyle = "rgba(0,0,0,0.22)";
    for (let x = -22; x <= 22; x += 3.4) { t.beginPath(); t.moveTo(x, 0); t.lineTo(x, 14); t.stroke(); }
    t.fillStyle = sheen(0, 1, 0, 6, 0.22); t.fillRect(-26, 0, 52, 7); t.restore();
    // the pom-pom sits down into the crown, so it reads as part of the hat
    const pg = t.createRadialGradient(-1.6, -19.6, 0.4, 0, -17.8, 5);
    pg.addColorStop(0, "#5476AE"); pg.addColorStop(0.55, __pcNavy); pg.addColorStop(1, "#0B1938");
    t.fillStyle = pg; t.fill(new Path2D("M-4.4 -16.4A4.6 4.6 0 1 1 4.4 -16.4Q0 -15.6 -4.4 -16.4Z"));
  });

  // cap: a soft six-panel cap, its bill turned out to the right
  if (has("cap")) at(-1, -33.5, 5, () => {
    t.rotate(0.087); t.scale(1.12, 1.12);
    if (shadow) { soft(2, 8, 25, 5.5, 0.28); return; }
    const bill = new Path2D("M10 2.4C20 0.2 34 1 40.5 5.6C35 9.6 17 9.4 7.5 6.8Z");
    t.fillStyle = __pcInk(t, 8, 0, 40, 10); t.fill(bill);
    t.save(); t.clip(bill); t.fillStyle = sheen(14, 0, 18, 6, 0.3); t.fillRect(6, -2, 36, 8); t.restore();
    const crown = new Path2D("M-22 4C-23 -10 -12 -18.5 0 -18.5C12 -18.5 23 -10 22 4Z");
    const g = t.createRadialGradient(-9, -12, 1, -2, -4, 28);
    g.addColorStop(0, "#43669F"); g.addColorStop(0.45, __pcNavy); g.addColorStop(1, "#0B1938");
    t.fillStyle = g; t.fill(crown);
    t.save(); t.clip(crown); t.lineWidth = 0.8; t.strokeStyle = "rgba(0,0,0,0.26)";
    t.stroke(new Path2D("M0 -18.5V3.2M-11 -15Q-13 -6 -12.4 2.6M11 -15Q13 -6 12.4 2.6"));
    t.fillStyle = sheen(-15, -15, -3, -2, 0.26); t.fillRect(-30, -24, 60, 30); t.restore();
    t.fillStyle = __pcInk(t, -22, 1, 18, 9); t.fill(new Path2D("M-22.4 1.6Q0 4.6 22.4 1.6L22.6 5.4Q0 8.4 -22.6 5.4Z"));
    t.fillStyle = __pcInk(t, -3, -21, 3, -18); t.fill(new Path2D("M-2.6 -18.2Q0 -21.2 2.6 -18.2Z"));
  });

  // bow: a hair bow tied on the right of the crown
  if (has("bow")) at(23, -28.5, 6, () => {
    t.rotate(-0.279); t.scale(1.05, 1.05);
    if (shadow) { soft(0, 5, 12, 5, 0.26); return; }
    t.fillStyle = __pcInk(t, -8, 0, 8, 12); t.fill(new Path2D("M-1.8 2.6L-6.4 11.4Q-4.6 12.4 -3 10.8L0 5.6L3 10.8Q4.6 12.4 6.4 11.4L1.8 2.6Z"));
    const p = new Path2D("M-2.6 -2.4C-6 -6 -10.5 -8.2 -12.6 -6C-14.4 -3.4 -14.4 3.4 -12.6 6C-10.5 8.2 -6 6 -2.6 2.4ZM2.6 -2.4C6 -6 10.5 -8.2 12.6 -6C14.4 -3.4 14.4 3.4 12.6 6C10.5 8.2 6 6 2.6 2.4Z");
    t.fillStyle = __pcInk(t, -12, -8, 12, 8); t.fill(p);
    t.save(); t.clip(p); t.strokeStyle = "rgba(2,8,24,0.32)"; t.lineWidth = 0.9; t.lineCap = "round";
    for (const sx of [-1, 1]) { t.beginPath(); t.moveTo(sx * 4.2, -1.2); t.lineTo(sx * 10, -3.6); t.moveTo(sx * 4.2, 1.2); t.lineTo(sx * 10, 3.8); t.stroke(); }
    t.fillStyle = sheen(-10, -8, -4, 0, 0.32); t.fillRect(-15, -9, 30, 9); t.restore();
    t.fillStyle = __pcInk(t, -3.4, -3.8, 3.4, 3.8); t.fill(new Path2D("M-1.4 -3.8H1.4Q3.4 -3.8 3.4 -1.8V1.8Q3.4 3.8 1.4 3.8H-1.4Q-3.4 3.8 -3.4 1.8V-1.8Q-3.4 -3.8 -1.4 -3.8Z"));
  });

  // headphones: a slim band over the head and a cup at each side
  if (has("headphones")) at(-1, -2, 0, () => {
    if (shadow) { soft(-36, 3, 4.5, 10.5, 0.3); soft(36, 3, 4.5, 10.5, 0.3); return; }
    const band = new Path2D("M-40.5 -3C-43.5 -33 -24 -49 -3 -48.5C18 -48 42 -36 38.5 -3");
    t.lineCap = "round"; t.strokeStyle = __pcInk(t, -30, -50, 30, 0); t.lineWidth = 3.4; t.stroke(band);
    t.save(); t.translate(-0.5, -0.9); t.strokeStyle = sheen(-34, -48, -8, -30, 0.5); t.lineWidth = 1; t.stroke(band); t.restore();
    for (const side of [-1, 1]) {
      const x = side < 0 ? -41.5 : 39.5;
      const cup = new Path2D(); cup.moveTo(x - 5, 0); cup.arcTo(x - 5, -9, x, -9, 5); cup.arcTo(x + 5, -9, x + 5, 0, 5); cup.arcTo(x + 5, 10, x, 10, 5); cup.arcTo(x - 5, 10, x - 5, 0, 5); cup.closePath();
      t.fillStyle = __pcInk(t, x - 6, -9, x + 6, 10); t.fill(cup);
      // the cushion against the head, a little softer and lighter
      t.fillStyle = "rgba(118,146,196,0.32)"; t.beginPath(); t.ellipse(x - side * 3.2, 0.5, 1.4, 7.4, 0, 0, Math.PI * 2); t.fill();
      t.fillStyle = sheen(x - 4, -8, x + 1, 2, 0.38); t.beginPath(); t.ellipse(x - 1.6, -3.2, 2, 4.6, 0, 0, Math.PI * 2); t.fill();
    }
  });

  // bow tie: under the smile, turning with the face
  if (has("bowtie") && facing > 0.01) at(0, 27.5, 11, () => {
    t.globalAlpha *= facing;
    if (shadow) { soft(0.8, 3.2, 12.5, 4.6, 0.26); return; }
    t.scale(0.86, 0.86);
    const p = new Path2D("M-2.6 -2.4C-6 -6 -10.5 -8.2 -12.6 -6C-14.4 -3.4 -14.4 3.4 -12.6 6C-10.5 8.2 -6 6 -2.6 2.4ZM2.6 -2.4C6 -6 10.5 -8.2 12.6 -6C14.4 -3.4 14.4 3.4 12.6 6C10.5 8.2 6 6 2.6 2.4Z");
    t.fillStyle = __pcInk(t, -12, -8, 12, 8); t.fill(p);
    t.save(); t.clip(p); t.strokeStyle = "rgba(2,8,24,0.32)"; t.lineWidth = 0.9; t.lineCap = "round";
    for (const sx of [-1, 1]) { t.beginPath(); t.moveTo(sx * 4.2, -1.2); t.lineTo(sx * 10, -3.6); t.moveTo(sx * 4.2, 1.2); t.lineTo(sx * 10, 3.8); t.stroke(); }
    t.fillStyle = sheen(-10, -8, -4, 0, 0.32); t.fillRect(-15, -9, 30, 9); t.restore();
    t.fillStyle = __pcInk(t, -3, -4, 3, 4); t.beginPath(); t.moveTo(-1.2, -3.6); t.arcTo(3.2, -3.6, 3.2, 3.6, 1.8); t.arcTo(3.2, 3.6, -3.2, 3.6, 1.8); t.arcTo(-3.2, 3.6, -3.2, -3.6, 1.8); t.arcTo(-3.2, -3.6, 3.2, -3.6, 1.8); t.closePath(); t.fill();
   }, true);
}
`;

/* Each patch: [what it is for, the library text it looks for (must appear once), what it becomes]. */
const PATCHES = [
  ["helpers", "function ii(t, n, o) {", HELPERS + "function ii(t, n, o) {"],
  // the canvas's data-pc attribute reaches the drawing as s.pc
  ["outfit option", '    wear: { hat: b, glasses: M, headphones: y, bowTie: m, color: A, fabric: vn === "fabric" }',
    '    pc: Qt["data-pc"],\n    pcLook: Qt["data-pc-look"] ? String(Qt["data-pc-look"]).split(",").map(Number) : null,\n    wear: { hat: b, glasses: M, headphones: y, bowTie: m, color: A, fabric: vn === "fabric" }'],
  ["lit eyes", "t.strokeStyle = r, t.lineWidth = R, t.stroke(ri(E, z, B));",
    "o.pc ? __pcEye(t, r, E, z, B, R, W, o.pc.includes(\"shut\")) : (t.strokeStyle = r, t.lineWidth = R, t.stroke(ri(E, z, B)));"],
  ["blush", '  if (o.face === "mouth") {\n    const S = h * 0.35,', OLD_BLUSH + '  if (o.face === "mouth") {\n    const S = h * 0.35,'],
  // busy, the cloud smiles with its mouth closed (a little wider); "open" keeps a small open mouth
  ["closed smile", "hw: C(6.5 * O, 9.5 * F, W),\n      t0: C(1.9, 0, 0),\n      a: C(2 / 3, 2 / 3, 0),\n      yt: C(3.53 * O, 1.6 * F, -4 * W / 3),\n      ab: C(2 / 3, 0, 0),\n      yb: C(3.53 * O, 17.3 * F, 4 * W / 3)",
    "hw: C(6.5 * O, !o.pc ? 9.5 * F : o.pc.includes(\"open\") ? 6.6 * F : 7.6 * O, W),\n      t0: C(1.9, !o.pc || o.pc.includes(\"open\") ? 0 : 2.05, 0),\n      a: C(2 / 3, 2 / 3, 0),\n      yt: C(3.53 * O, !o.pc ? 1.6 * F : o.pc.includes(\"open\") ? 1.4 * F : 3.5 * O, -4 * W / 3),\n      ab: C(2 / 3, !o.pc || o.pc.includes(\"open\") ? 0 : 2 / 3, 0),\n      yb: C(3.53 * O, !o.pc ? 17.3 * F : o.pc.includes(\"open\") ? 11.5 * F : 4.6 * O, 4 * W / 3)"],
  // the eyes rest toward the work beside the cloud (data-pc-look="x,y", in the face's units), on top of their own
  // glances and the pointer
  ["gaze", "h = n.lookX, d = n.lookY,", "h = n.lookX + (o.pcLook ? o.pcLook[0] : 0), d = n.lookY + (o.pcLook ? o.pcLook[1] : 0),"],
  ["inset smile","t.fillStyle = r, t.fill(ci($));", "o.pc ? __pcMouth(t, r, ci($)) : (t.fillStyle = r, t.fill(ci($)));"],
  // the outfit's contact shadows, inside the face's clip; the pieces themselves after it, unclipped
  ["outfit shadows", "    const ft = ii(t, o, s);\n", "    const ft = ii(t, o, s);\n    s.__pcEyes = ft, s.pc && __pcWear(t, o, s, ft, \"shadow\");\n"],
  ["outfits", "  Y && Z1(t, s.path, et, R, D, V, { y: s.faceY, scale: s.faceScale }), Qa(t, o, s.color, y, m, !0, s.whirl), t.restore();",
    "  s.pc && (t.save(), t.translate(s.faceX - 50, s.faceY - 50), t.scale(s.faceScale, s.faceScale), __pcWear(t, o, s, k > -0.2 ? s.__pcEyes : null, \"front\"), t.restore());\n" +
    "  Y && Z1(t, s.path, et, R, D, V, { y: s.faceY, scale: s.faceScale }), Qa(t, o, s.color, y, m, !0, s.whirl), t.restore();"],
  // Until the plush pile has baked the library can only draw a flat grey stand-in. A dressed cloud draws nothing
  // instead (the app shows its vector cloud underneath) and marks its canvas data-pc-baked once the pile is there.
  ["wait for the pile", "  let D = null;\n  if (Y && typeof Path2D",
    "  if (s.pc && s.shading === \"fabric\") {\n" +
    "    if (!Pt) return t.setTransform(1, 0, 0, 1, 0, 0), t.clearRect(0, 0, t.canvas.width, t.canvas.height), void t.restore();\n" +
    "    t.canvas.dataset && !t.canvas.dataset.pcBaked && (t.canvas.dataset.pcBaked = \"1\");\n" +
    "  }\n  let D = null;\n  if (Y && typeof Path2D"],
  // a blink every 4 to 7 seconds (sometimes a double blink) instead of every 2 to 5
  ["blink", "2.2 + this.rand() * 2.6", "(globalThis.__botPlacetta ? 4 + this.rand() * 3 : 2.2 + this.rand() * 2.6)"],
  // the busy hop: up on a real arc (slow at the top, quick near the ground), a small squash on landing that springs
  // back and settles, a crouch before the next one, and no spin, so the face and its outfit stay in view
  ["hop", "      this.hopPhase += n / D0, this.hopPhase >= 1 &&",
    `      if (globalThis.__botPlacetta) {
        const HOP = 0.92, AIR = 0.58;
        this.hopPhase += n / HOP;
        if (this.hopPhase >= 1) this.state === "working" ? (this.hopPhase -= 1, this.hopCount += 1) : (this.hopPhase = 0, this.hopGain = 0);
        const P = this.hopGain, q = this.hopPhase, big = this.hopCount % 3 === 2;
        let sq = 0;
        if (q < AIR) {
          const u = q / AIR, V = 4 * u * (1 - u);
          m -= (big ? 17 : 12) * V * P;
          sq = this.hopCount > 0 || this.state !== "working" ? 0.5 * Math.pow(Math.max(0, 1 - u / 0.14), 2) : 0;
          sq -= 0.35 * Math.abs(1 - 2 * u) * Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.1);
          x += (this.hopCount % 2 === 0 ? 1 : -1) * 3.5 * Bn * Math.sin(Math.PI * u) * P;
        } else {
          const u = (q - AIR) / (1 - AIR);
          sq = (1 - Math.exp(-u * 36)) * Math.exp(-u * 5.2) * Math.cos(u * Math.PI * 2.3);
          if (this.state === "working") sq += 0.5 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 2);
        }
        A += 0.11 * sq * P, g -= 0.13 * sq * P;
      } else {
      this.hopPhase += n / D0, this.hopPhase >= 1 &&`],
  ["hop end", "x += (this.hopCount % 2 === 0 ? 1 : -1) * 6 * Bn * V * P;\n    }", "x += (this.hopCount % 2 === 0 ? 1 : -1) * 6 * Bn * V * P;\n      }\n    }"],
];

if (existsSync(FILE)) {
  const cur = readFileSync(FILE, "utf8");
  let orig;
  if (!cur.includes("/* placetta-patched")) {   // any version of this patch: the untouched copy is kept beside it
    orig = cur.replace(OLD_BLUSH, "");   // a fresh install, or the older blush-only patch taken back out
    writeFileSync(ORIG, orig);
  } else if (existsSync(ORIG)) orig = readFileSync(ORIG, "utf8");
  if (orig === undefined) console.warn("patch-bot-avatars: patched, but the untouched copy is missing; reinstall bot-avatars to repatch");
  else {
    let out = orig, missed = [];
    for (const [name, from, to] of PATCHES) {
      const at = out.indexOf(from);
      if (at < 0 || out.indexOf(from, at + 1) >= 0) { missed.push(name); continue; }
      out = out.slice(0, at) + to + out.slice(at + from.length);
    }
    // a patch that depends on one that missed would break the library, so it is all or nothing
    if (missed.length) console.warn(`patch-bot-avatars: library text not found for ${missed.join(", ")}; left bot-avatars as it ships`);
    else if (out !== cur) { writeFileSync(FILE, out); console.log("patch-bot-avatars: face, outfits, motion and blush added to " + FILE); }
  }
}
