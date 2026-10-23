// npm run test:bot: the plush bot's animation math, driven through its extremes, can never hand the canvas a negative
// radius or turn the body inside out. Once a turn of the head made a lens radius of -3.5, the canvas threw
// (IndexSizeError) and the app went to a white page (docs/LESSONS.md).
//
// The browser's own rule is reproduced here: the stand-in canvas and Path2D throw on a negative or NaN radius, exactly
// like Chrome and Safari. Then:
//   1. the bounded helpers (scripts/bot-avatars-math.mjs) hold at and past every edge
//   2. the patched animator (bot-avatars as scripts/patch-bot-avatars.mjs leaves it) runs minutes of working, done and
//      idle, with hops, flips, pokes, hard turns and uneven frame times, and its scales stay positive every frame
//   3. every outfit is drawn through a full turn of the head, and through every pose from (2), with nothing thrown
//   4. the last guard (src/canvasSafe.ts) turns a negative or NaN radius into 0
import { __pcScale, __pcFore, __pcRadius, __pcHopSquash } from "./bot-avatars-math.mjs";
import { clampEllipse, safeRadius } from "../src/canvasSafe";

let failed = 0, passed = 0;
const ok = (cond: unknown, what: string) => { if (cond) passed++; else { failed++; console.error("  FAIL " + what); } };
const throwsOn = (rx: number, ry: number) => {
  if (!(rx >= 0) || !(ry >= 0)) throw new RangeError(`IndexSizeError: Failed to execute 'ellipse': The radius provided (${rx < 0 || Number.isNaN(rx) ? rx : ry}) is negative.`);
};

// The browser's rules, in node
const noop = () => {};
class StrictPath2D {
  ellipse(_x: number, _y: number, rx: number, ry: number) { throwsOn(rx, ry); }
  arc(_x: number, _y: number, r: number) { throwsOn(r, r); }
  arcTo(_a: number, _b: number, _c: number, _d: number, r: number) { throwsOn(r, r); }
}
for (const m of ["addPath", "moveTo", "lineTo", "quadraticCurveTo", "bezierCurveTo", "closePath", "rect"])
  (StrictPath2D.prototype as unknown as Record<string, unknown>)[m] = noop;
(globalThis as Record<string, unknown>).Path2D = StrictPath2D;
const grad = { addColorStop: noop };
const ctxBase: Record<string, unknown> = {
  canvas: { width: 200, height: 200, dataset: {} },
  ellipse: (_x: number, _y: number, rx: number, ry: number) => throwsOn(rx, ry),
  arc: (_x: number, _y: number, r: number) => throwsOn(r, r),
  arcTo: (_a: number, _b: number, _c: number, _d: number, r: number) => throwsOn(r, r),
  createLinearGradient: () => grad, createRadialGradient: () => grad,
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
};
const ctx = new Proxy(ctxBase, { get: (o, k: string) => (k in o ? o[k] : noop), set: (o, k: string, v) => ((o[k] = v), true) });
(globalThis as Record<string, unknown>).__botPlacetta = true;
(globalThis as Record<string, unknown>).__botBlush = "#F0ADD3";

// the stand-in really is strict, or nothing below proves anything
let strict = false;
try { new StrictPath2D().ellipse(0, 0, -3.5, 2); } catch { strict = true; }
ok(strict, "the stand-in Path2D throws on a negative radius, as the browser does");

console.log("1. bounded helpers");
const extremes = [-1e9, -10, -3.5, -1, -0.5, -0.0001, 0, 0.0001, 0.5, 1, 2, 10, 1e9, NaN, Infinity, -Infinity];
for (const v of extremes) {
  const s = __pcScale(v), f = __pcFore(v), r = __pcRadius(v);
  ok(s >= 0.2 && s <= 3, `__pcScale(${v}) = ${s} is within 0.2 … 3`);
  ok(f >= 0.02 && f <= 1, `__pcFore(${v}) = ${f} is within 0.02 … 1`);
  ok(r >= 0 && Number.isFinite(r), `__pcRadius(${v}) = ${r} is finite and not negative`);
}
let lo = Infinity, hi = -Infinity;
for (const working of [true, false]) for (const first of [true, false]) for (const air of [0, 0.05, 0.58, 0.95, 1, NaN])
  for (let i = -20; i <= 1020; i++) {
    const q = i / 1000, sq = __pcHopSquash(q, air, working, first);
    lo = Math.min(lo, sq); hi = Math.max(hi, sq);
    // the hop adds 0.11 * sq to sx and takes 0.13 * sq from sy, at full strength
    ok(Number.isFinite(sq) && 1 + 0.11 * sq > 0 && 1 - 0.13 * sq > 0, `hop squash at q=${q} air=${air} working=${working} first=${first}: ${sq}`);
  }
for (const q of [NaN, Infinity, -Infinity]) ok(Number.isFinite(__pcHopSquash(q, 0.58, true, false)), `hop squash at q=${q} is finite`);
console.log(`   hop squash ranged ${lo.toFixed(3)} … ${hi.toFixed(3)}`);

console.log("2. the patched animator through working, done and idle");
const lib = await import("bot-avatars");
const OUTFITS = ["glasses-round", "glasses-square", "beret", "beanie", "cap", "bow", "headphones", "bowtie", "glasses-round shut", "glasses-square done", "beret done", "headphones shut"];
const draw = (pose: unknown, pc: string) => lib.drawBotAvatarFrame(ctx as unknown as CanvasRenderingContext2D, 64, pose as never,
  { path: new StrictPath2D() as unknown as Path2D, face: "mouth", faceX: 50, faceY: 52, faceScale: 1, color: "#A4C8E1", ink: "#132A55", shading: "crisp", pc, dpr: 1 } as never);
let minSx = Infinity, minSy = Infinity, frames = 0, drawErrors = 0, firstError = "";
const tryDraw = (pose: unknown, pc: string) => { try { draw(pose, pc); } catch (e) { drawErrors++; firstError ||= `${pc}: ${(e as Error).message}`; } };
type Sim = { pose: { sx: number; sy: number; yaw: number }; update(dt: number): void; setState(s: string): void; poke(): void; setJump(j: object): void; setTurn(n: number): void } & Record<string, unknown>;
for (const seed of [0.01, 0.3, 0.77]) for (const jump of [{}, { squash: 4, stretch: 4, height: 40, spin: 2, every: 0.5 }]) {
  const sim = new lib.BotAvatarSim(seed, "default") as unknown as Sim;
  sim.setJump(jump); sim.setTurn(1);
  // working (hops), then done (idle with the happy face), then idle, then working again, with pokes and hard turns
  const plan: [string, number, [number, number, number]][] = [["working", 30, [0, 0, 0]], ["default", 20, [1.4, 0.3, 0.2]], ["default", 20, [-2.8, -0.6, -0.4]], ["working", 30, [3.1, 0.5, 0.5]], ["sleeping", 10, [0, 0, 0]]];
  for (const [state, seconds, aim] of plan) {
    sim.setState(state); sim.__pcAim = aim; sim.__pcTilt = state === "default";
    for (let t = 0, k = 0; t < seconds; k++) {
      const dt = [1 / 240, 1 / 60, 1 / 30, 0.05, 0.2][k % 5];
      sim.update(dt); t += dt; frames++;
      if (k % 97 === 0) sim.poke();
      const { sx, sy } = sim.pose;
      minSx = Math.min(minSx, sx); minSy = Math.min(minSy, sy);
      if (!(sx >= 0.2 && sy >= 0.2)) ok(false, `pose scale at ${state} t=${t.toFixed(2)}: sx ${sx} sy ${sy}`);
      if (k % 7 === 0) tryDraw(sim.pose, OUTFITS[k % OUTFITS.length]);
    }
  }
}
ok(minSx >= 0.2 && minSy >= 0.2, `the body's scales stayed at or above 0.2 over ${frames} frames (min sx ${minSx.toFixed(3)}, sy ${minSy.toFixed(3)})`);
console.log(`   ${frames} frames, min sx ${minSx.toFixed(3)}, min sy ${minSy.toFixed(3)}`);

console.log("3. every outfit through a full turn of the head, and every animated pose");
for (const pc of OUTFITS) for (let yaw = -2 * Math.PI; yaw <= 2 * Math.PI; yaw += 0.03) for (const pitch of [-0.9, -0.3, 0, 0.4, 1.2])
  for (const [sx, sy] of [[1, 1], [0.2, 3], [3, 0.2], [-0.5, -0.5]]) tryDraw({ ...lib.restPose("default"), yaw, pitch, sx, sy }, pc);
ok(drawErrors === 0, `no frame threw (${drawErrors} did${firstError ? "; first: " + firstError : ""})`);

console.log("4. the last guard: negative and NaN radii become 0");
for (const v of [-3.5, -0.0001, -Infinity, NaN]) ok(safeRadius(v) === 0, `safeRadius(${v}) is 0`);
for (const v of [0, 1, 9.6]) ok(safeRadius(v) === v, `safeRadius(${v}) is unchanged`);
const seen: number[][] = [];
class Fake { ellipse(x: number, y: number, rx: number, ry: number, ...rest: number[]) { throwsOn(rx, ry); seen.push([x, y, rx, ry, ...rest]); } }
clampEllipse(Fake.prototype as never);
clampEllipse(Fake.prototype as never);   // twice: it must not wrap itself
let threw = false;
try { new Fake().ellipse(1, 2, -3.5, NaN, 0, 0, Math.PI * 2); } catch { threw = true; }
ok(!threw, "a wrapped ellipse with radius -3.5 and NaN does not throw");
ok(JSON.stringify(seen[0]) === JSON.stringify([1, 2, 0, 0, 0, 0, Math.PI * 2]), `it was drawn with radii 0 and the rest unchanged: ${JSON.stringify(seen[0])}`);
new Fake().ellipse(0, 0, 4, 5, 0, 0, 1);
ok(seen[1][2] === 4 && seen[1][3] === 5, "a positive radius passes through");
clampEllipse(undefined); clampEllipse({} as never);
ok(true, "a missing prototype or one without ellipse is left alone");

console.log(failed ? `\ntest:bot FAILED: ${failed} of ${passed + failed}` : `\ntest:bot: all ${passed} checks passed`);
process.exit(failed ? 1 : 0);
