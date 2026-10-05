// Adds soft blushed cheeks to bot-avatars' "mouth" face (Placetta's agent cloud).
// The library has no blush option, so this patches its face drawing after install. Idempotent.
// Cheeks are drawn in the face's own coordinates, so they follow the head as it turns and hops.
// Colour comes from globalThis.__botBlush (set in src/Bot.tsx); no colour, no blush.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const MARK = "/* placetta-blush */";
const ANCHOR = '  if (o.face === "mouth") {\n    const S = h * 0.35,';
const BLUSH = `  ${MARK}
  if (o.face === "mouth" && globalThis.__botBlush) {
    const pink = globalThis.__botBlush;
    for (const S of [-1, 1]) f(S * (l + 5.8), i + 9.6, () => {
      const g = t.createRadialGradient(0, 0, 0, 0, 0, 7.2);
      g.addColorStop(0, pink); g.addColorStop(0.55, pink); g.addColorStop(1, "rgba(255,255,255,0)");
      t.globalAlpha *= 0.88; t.fillStyle = g; t.beginPath(); t.ellipse(0, 0, 7.2, 4.4, 0, 0, Math.PI * 2); t.fill();
    });
  }
`;

for (const file of ["node_modules/bot-avatars/dist/index.es.js", "node_modules/bot-avatars/dist/index.cjs"]) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  if (src.includes(MARK)) continue;
  if (!src.includes(ANCHOR)) { console.warn(`patch-bot-avatars: anchor not found in ${file}; blush skipped`); continue; }
  writeFileSync(file, src.replace(ANCHOR, BLUSH + ANCHOR));
  console.log(`patch-bot-avatars: blush added to ${file}`);
}
