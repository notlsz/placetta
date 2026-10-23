// The animation math scripts/patch-bot-avatars.mjs adds to bot-avatars, as plain functions. The patch injects each one
// into the library by its source text (fn.toString()), so they must stand alone: no imports, no outside names. The unit
// test (scripts/bot-crash-test.ts) imports them from here, so what is tested is exactly what is drawn.
//
// Why they exist: a canvas throws (IndexSizeError) on an ellipse with a negative radius, and that took the app to a white
// page. Every number that becomes a radius or a scale passes through one of these first.

/** The squash and stretch scale of the body (pose.sx, pose.sy): never below 0.2 or above 3; anything not finite is 1. */
export function __pcScale(v) {
  return Number.isFinite(v) ? Math.max(0.2, Math.min(3, v)) : 1;
}

/** How much a feature on the head is foreshortened as it turns (an eye's sx or sy, a cosine): never below 0.02, the
    same floor the library uses when it draws the eye itself. Past that the eye is turned away and isn't drawn. */
export function __pcFore(v) {
  return Number.isFinite(v) ? Math.max(0.02, Math.min(1, v)) : 0.02;
}

/** A radius handed to the canvas: never negative, never NaN (0 draws nothing, which is right for that frame). */
export function __pcRadius(v) {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** The busy hop's squash at a point in the hop: q is the phase (0 to 1), air the share of it in the air, working whether
    the bot is working (it crouches for the next hop), first whether this is the first hop since it started working.
    Positive squashes (wider and shorter), negative stretches. Bounded to -1 … 1.5 whatever comes in. */
export function __pcHopSquash(q, air, working, first) {
  const p = Number.isFinite(q) ? Math.max(0, Math.min(1, q)) : 0, a = Number.isFinite(air) ? Math.max(0.05, Math.min(0.95, air)) : 0.58;
  let sq = 0;
  if (p < a) {
    const u = p / a;
    sq = !first || !working ? 0.5 * Math.pow(Math.max(0, 1 - u / 0.14), 2) : 0;
    sq -= 0.35 * Math.abs(1 - 2 * u) * Math.min(1, u / 0.1) * Math.min(1, (1 - u) / 0.1);
  } else {
    const u = (p - a) / (1 - a);
    sq = (1 - Math.exp(-u * 36)) * Math.exp(-u * 5.2) * Math.cos(u * Math.PI * 2.3);
    if (working) sq += 0.5 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 2);
  }
  return Math.max(-1, Math.min(1.5, sq));
}

/** Every helper above, in the order the patch injects them. */
export const BOT_MATH = [__pcScale, __pcFore, __pcRadius, __pcHopSquash];
