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
