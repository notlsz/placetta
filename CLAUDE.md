# Placetta: notes for agents working in this repo

## Lessons

Read [docs/LESSONS.md](docs/LESSONS.md) before you change the chat, Odelia's bot, or anything that draws on a canvas.
It records what broke in production, why, and the rules that came from it. In short:

- Every third-party visual sits inside a quiet boundary (`<Guard quiet>`, `src/SafeBoundary.tsx`).
- Animation math is clamped where it is computed, and tested at its extremes (`scripts/bot-avatars-math.mjs`).
- Any change to the chat or the bot must pass `npm run test:bot` and `npm run test:crash`.

When something breaks in production, add an entry there.

## Also read

- [docs/SECURITY.md](docs/SECURITY.md): what must never ship to the browser.

## How every task runs (the founder's standing workflow, 2026-10-30)

For every task the founder assigns, run this loop, and keep running it until the work scores 9.5 or better:

1. Compare. Look at how the companies he named do it (Muse, Instinct, Grok Bot, Claude Duet, OpenAI Dots, Gemini
   Spark, Sierra, Legora, Harvey, Devin, EliseAI, Genspark, Decagon, Armadin, Factory, Poke, Lindy, Hermes Agent,
   Parloa, Chai Discovery, Hark, wonderful.ai; docs/COMPARE-ALL.md) and copy what already works. Invent only when
   nothing does.
2. Do it.
3. Check and reconfirm it: run the tests, look at screenshots at 375, 768 and 1280, run `scripts/fit-check.mjs --align`.
4. Score it out of 10 against them, honestly.
5. Confirm it works as intended, end to end.
6. Adjust what falls short, then repeat from 1.

The founder only assigns tasks. Work you know a task needs, do without asking. Odelia follows the same loop on
clients' filings (src/live.ts, "Every job runs one loop"); filing, paying and sending still wait for approval.
