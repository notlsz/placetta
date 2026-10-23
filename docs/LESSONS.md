# Lessons

Mistakes that reached production, why they got through, what now stops them, and the rules that follow. Read this
before you change the chat, Odelia's bot, or anything that draws on a canvas. Add an entry when something breaks in
production: what happened, why, the guards, the rules.

## 2026-10: a turn of the bot's head took the app to a white page

**What happened.** A person talked to Odelia, she went to work, and the whole app went white. The console showed
`IndexSizeError: Failed to execute 'ellipse' on 'Path2D': The major-axis radius provided (-3.5) is negative`.

**The cause.** The plush bot is a third-party canvas (bot-avatars) that we patch after install
(`scripts/patch-bot-avatars.mjs`) to dress it for each step. The glasses' lens radius was `9.6 * e.sx`, where `e.sx` is
the eye's foreshortening: the cosine of how far the eye has turned. Once the head turns past about 65 degrees (the full
turn in an idle hop, a poke, or a hard turn toward the work) the cosine goes negative, the radius goes negative, and
the browser throws. The body's squash scales (`pose.sx`, `pose.sy`) had no floor either.

**Why it got through.**

- A patched third-party visual: our code ran inside someone else's draw loop, with their numbers, and no one had
  checked what range those numbers take.
- No bounds on the animation math: scales and radii were whatever the formulas produced.
- No error boundary: one throw unmounted the whole React tree, so a broken ornament took the whole app down.
- No browser smoke test: every unit test ran without a real canvas, and a canvas is what throws. Nothing ever drew the
  bot while she worked.

**The guards that now prevent it.**

| Layer | Guard | Where |
|---|---|---|
| Source | The squash scales never go below 0.2, an eye's foreshortening never below 0.02, no radius below 0; the glasses only draw while both eyes face the viewer | `scripts/bot-avatars-math.mjs`, injected by `scripts/patch-bot-avatars.mjs` |
| Canvas | Every `ellipse` radius on `CanvasRenderingContext2D` and `Path2D` is clamped to 0 or more | `src/canvasSafe.ts`, called from `src/Bot.tsx` |
| React | The bot sits in a quiet boundary (it vanishes, the chat carries on); the app root has one that shows a reload message instead of a white page | `src/SafeBoundary.tsx`, `src/Bot.tsx`, `src/main.tsx` |
| Unit test | `npm run test:bot`: the math at and past every edge; the patched animator through minutes of working, done and idle with pokes and hard turns; every outfit through a full turn of the head, on a stand-in canvas that throws on a negative radius just as the browser does; the clamp wrapper turning -3.5 and NaN into 0 | `scripts/bot-crash-test.ts` |
| Browser | `npm run test:crash`: the built app in Chromium at 1440 and 390, Odelia sent five messages and watched for 20 seconds while every bot is poked through full turns; any uncaught error, canvas error or blank `#root` fails. It fails on the old code and passes on the new | `scripts/crash-smoke.mjs`, CI `app` job |

**Rules for the future.**

1. Every third-party visual (a canvas, a chart, an animation library, anything we patch) sits inside a quiet boundary
   (`<Guard quiet>` from `src/SafeBoundary.tsx`). An ornament that breaks disappears; it never takes the page with it.
2. Animation math is clamped where it is computed. Any number that becomes a scale, a radius, a width or an alpha goes
   through a bound (`__pcScale`, `__pcFore`, `__pcRadius`, or one like them) and is tested at its extremes, NaN and
   Infinity included. A cosine of a turn is negative half the time.
3. Any change to the chat, Odelia's bot, `src/Bot.tsx`, `src/tasks.ts` outfits or `scripts/patch-bot-avatars.mjs` must
   pass `npm run test:bot` and `npm run test:crash` before it ships.
4. A patch to a third-party library keeps its new math in a plain module the tests import, so what is tested is exactly
   what is drawn.
