/* The last guard under the plush bot's drawing. A canvas throws (IndexSizeError) on an ellipse with a negative radius,
   and one such frame once took the whole app to a white page. The animation math is bounded at its source
   (scripts/bot-avatars-math.mjs); this clamps whatever still reaches ellipse() to 0 (the shape simply isn't drawn for
   that frame), on CanvasRenderingContext2D and Path2D, once. Tested by npm run test:bot. */

type Ellipse = (x: number, y: number, rx: number, ry: number, ...rest: number[]) => void;
type Proto = { ellipse: Ellipse; __pcSafe?: boolean };

/** A radius the canvas accepts: never negative, never NaN. */
export const safeRadius = (r: number) => (Number.isFinite(r) && r > 0 ? r : 0);

/** Wraps a prototype's ellipse so negative or NaN radii become 0. Safe to call more than once. */
export function clampEllipse(proto: Proto | undefined) {
  if (!proto || typeof proto.ellipse !== "function" || proto.__pcSafe) return;
  const draw = proto.ellipse;
  proto.ellipse = function (this: unknown, x: number, y: number, rx: number, ry: number, ...rest: number[]) {
    return draw.call(this, x, y, safeRadius(rx), safeRadius(ry), ...rest);
  };
  proto.__pcSafe = true;
}

/** Clamps both kinds of ellipse in this window, before any bot draws. */
export function guardCanvas() {
  if (typeof window === "undefined") return;
  clampEllipse(window.CanvasRenderingContext2D?.prototype as unknown as Proto);
  clampEllipse(window.Path2D?.prototype as unknown as Proto);
}
