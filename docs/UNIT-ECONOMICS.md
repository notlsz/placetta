# Unit economics: what it costs to run Odelia and deliver each filing

Written 2026-10-22. `npm run econ` measures the AI side from the requests Placetta really builds and rewrites the
tables between the markers below (and `docs/unit-economics.json`). Every other input lives in `src/economics.ts`:
vendor list prices with the page each was read from, and estimates marked **FOUNDER TO CONFIRM**. Nothing here comes
from production data, because there is none yet: every margin is an estimate (est.), and the staff margin view
(`ai_margin_company`, `docs/AI_COSTS.md`) is where the real numbers will show.

## The short answer

- **We don't lose money on AI.** A store's typical month of Odelia costs about $0.70 of AI (20 chat turns and four
  weekly checks), under 1% of the $149 plan. A customer who drives her as hard as the gate allows costs $25 and still
  leaves 79%. AI is never the cost that matters on a filing: a new license's whole model work is about a cent and a
  half.
- **Team time is the cost that matters.** 55% of new licenses go to Placetta's team, measured: the dispatcher sends
  email, fax and mail only when no fee has to go with the filing, and most agencies charge one. A new license still
  leaves about 86% at 31 team minutes on average; a complex one 67% at five hours; a $99 renewal 66% at half an hour.
- **Where we would lose money**, in order of exposure: a $99 renewal that takes more than 1.6 team hours; a complex
  license past about 16 hours; comped workspaces (up to $200 of AI a month with no revenue); free workspaces (up to $5
  a month each, with no limit on how many); and the fixed $172 a month of hosting before the second customer. Each has
  a guardrail below.
- **Two prices were wrong in the code and are fixed.** Gemini 3.8 Flash, the main loop's model, was recorded at half
  its list price, so every recorded cost, the allowance and the margin views read about half of what Google bills. And
  Gemini 3 always thinks, billed as output, which a vendor reporting it apart from `completion_tokens` would have left
  unpriced; it is now counted however it's reported.

## What was measured, and how

**AI per journey.** Each journey runs through `runRounds` (`src/serverRun.ts`, what agent-run runs) with a scripted
model, so the prompt is Odelia's real rules, tools, workspace and tool results. Tokens are counted as the offline eval
counts them (about 4 characters a token, 1 for Chinese). Each call is priced on four routes at the list prices in
`supabase/functions/_shared/ai_cost.ts`: the default route (Gemini 3.8 Flash) with its cache hitting the shared prefix,
the same at Google's 2027 price, Gemini with no cache hit (implicit caching isn't guaranteed), and Anthropic only
(Sonnet 5.5, cache writes 1.25x, reads 0.05x). The checker and document reads are priced on Sonnet 5.5. What can't be
measured offline: the model's own words beyond the scripted ones, and Gemini 3's thinking tokens. The last column
prices each thousand thinking tokens a call so the first live eval can be read against it.

**Routes.** How a license goes out is decided by the dispatcher's own `pick()` (`supabase/functions/file/logic.ts`)
over the verified destinations, with every channel on, for every chargeable license in the plans of the 63 gold and
held-out accuracy fixtures.

**Renewals.** From the same plans' own published cycles (`src/renewal.ts`), once a year where the agency's words
don't give a cycle Placetta reads.

**Team minutes, chat volume and how many pages a filing has** are estimates (`ASSUME` in `src/economics.ts`).

<!-- econ:start -->
### AI per journey, measured from the requests Placetta builds

| Journey | Model calls | Prompt tokens | From cache | Output tokens | Gemini 3.8 Flash, 2026 | Same, 2027 price | Gemini, no cache hit | Anthropic only (Sonnet 5.5) | Per 1,000 thinking tokens a call |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| One chat turn on an open store (the average of "what's due" and "which licenses") | 2 | 28,076 | 46.7% | 41.5 | $0.0124 | $0.0247 | $0.0212 | $0.0391 | $0.0075 |
| A new license: found, prepared, filled from the workspace, put up for approval | 5 | 53,463 | 78.8% | 429 | $0.0133 | $0.0265 | $0.0417 | $0.0368 | $0.0188 |
| A complex license: beer and wine in Flushing (SLA license, community board notice, TTB registration) | 5 | 54,561 | 74.1% | 626 | $0.0160 | $0.0320 | $0.0433 | $0.0457 | $0.0188 |
| A renewal the monitor starts: found, prepared, filled, put up for approval | 5 | 64,838 | 79% | 282 | $0.0151 | $0.0302 | $0.0497 | $0.0420 | $0.0188 |
| A four-city entry: four stores added, one plan_markets packet | 3 | 32,579 | 45% | 219 | $0.0154 | $0.0307 | $0.0253 | $0.0485 | $0.0113 |

The portal filer (worker/filer, Sonnet 5.5, no prompt cache): 1,732 tokens a step, $0.0041 a step, $0.12 for 30 steps (est.), $0.33 at its 80-step cap.

### How a license goes out, measured over the accuracy fixtures' plans

580 chargeable licenses in 63 store plans (gold and held-out sets), routed by the dispatcher's own pick() with every channel on:

| Route | Licenses | Share |
|---|---:|---:|
| portal | 248 | 42.8% |
| email | 1 | 0.2% |
| fax | 0 | 0% |
| mail | 0 | 0% |
| owner | 15 | 2.6% |
| team | 316 | 54.5% |

Renewals: 2.21 a store a year from the plans' own cycles; 38.5% of them go to the team or the owner (so they are the $99 kind), the rest Odelia can send on her own (included in the plan).

### Contribution margin per thing sold (est.)

| Item | Price | AI | Delivery | Team | Stripe | Cost | Margin | Basis |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Store plan, a store a month (typical) | $149.00 | $0.69 | $0.65 | $0.00 | $5.39 | $6.72 | 95.5% | 20 chat turns, 4 weekly checks, 0.11 included renewals |
| Store plan, a store a month (heavy chat) | $149.00 | $2.92 | $0.65 | $0.00 | $5.39 | $8.96 | 94% | 200 chat turns |
| Store plan, a store a month (abusive: at the allowance) | $149.00 | $25.00 | $0.65 | $0.00 | $5.39 | $31.04 | 79.2% | the gate holds AI at the plan's $25 allowance |
| New license | $299.00 | $0.01 | $0.06 | $31.34 | $8.97 | $40.38 | 86.5% | route mix measured over 580 licenses |
| New license, pessimistic AI and all by the team | $299.00 | $0.04 | $0.00 | $45.00 | $8.97 | $54.01 | 81.9% | worst route, the team files it |
| Complex license (liquor) | $999.00 | $0.02 | $0.00 | $300.00 | $29.27 | $329.29 | 67% | team-led: hearings, notices, corrections |
| Renewal the plan doesn't include ($99) | $99.00 | $0.02 | $0.00 | $30.00 | $3.17 | $33.19 | 66.5% | it needs the team by definition |
| Four-city entry (plan_markets), the planning run | $0.00 | $0.02 | $0.00 | $0.00 | $0.00 | $0.02 | free | the plan preview is free; licenses are bought one by one |

### Contribution margin per customer, a year (est.)

| Customer | Stores | Opens | Revenue | Cost | Margin | Licenses included free |
|---|---:|---:|---:|---:|---:|---:|
| One store, open | 1 | 0 | $1,872 | $109 | 94.2% | 0 |
| One store, opening (the typical San José restaurant) | 1 | 1 | $7,455 | $1,171 | 84.3% | 0 |
| 5-store chain, opens 1 a year | 5 | 1 | $14,944 | $1,607 | 89.2% | 0 |
| 20-store chain, opens 1 a year | 20 | 1 | $38,339 | $3,101 | 91.9% | 11 |
| 20-store chain, opens 5 a year (25% growth) | 20 | 5 | $41,915 | $6,793 | 83.8% | 55 |
| 10-store chain, opens 3 a year (25% growth, just over the line) | 10 | 3 | $21,404 | $3,858 | 82% | 33 |

Fixed platform cost before the first customer: $172 a month ($2,064 a year): Supabase Pro, Vercel Pro, the Render worker, Resend Pro, a Telnyx number and Browserbase Startup. It is left out of the per-customer margin above.
<!-- econ:end -->

## Cost sources, from the code

| Source | Where in the code | Unit cost | Read from |
|---|---|---|---|
| Model calls, main loop (`plan`) | `supabase/functions/_shared/llm.ts` routes, `ai_cost.ts` | Gemini 3.8 Flash $0.75 in, $3.75 out, cached $0.075 a million (doubles 2027-01-01); Sonnet 5.5 $2, $10, cached $0.10 | [Google](https://ai.google.dev/gemini-api/docs/pricing), [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) |
| Checker (`review`), document reads (`extract`), weekly checks (`watch`) | same | Sonnet 5.5; Gemini 2.5 Flash-Lite $0.10, $0.40; Haiku 4.5 $1, $5 | same |
| Web research | Anthropic's web search and fetch | $10 per 1,000 searches; fetched pages billed as input | [Anthropic](https://platform.claude.com/docs/en/about-claude/pricing) |
| The portal filer's model | `worker/filer/src/model.ts`, Sonnet 5.5, one uncached call a step | about $0.004 a step, 80 steps at most | measured above |
| The portal filer's browser | `worker/filer/src/main.ts`, Browserbase | $99 a month for 500 hours, then $0.10 an hour | [Browserbase](https://docs.browserbase.com/account/plans) |
| The filer's host | `render.yaml`, Render worker | $7 a month | [Render](https://render.com/pricing) |
| Database, functions, storage | Supabase | $25 a month (Pro) | [Supabase](https://supabase.com/pricing) |
| App hosting | Vercel | $20 a month (Pro, one seat) | [Vercel](https://vercel.com/docs/plans/pro-plan) |
| Email | `supabase/functions/_shared/mail.ts`, Resend | $20 a month for 50,000 | [Resend](https://resend.com/pricing) |
| Texts and fax | `supabase/functions/_shared/odelia.ts`, `file/index.ts`, Telnyx | SMS from $0.004 plus carrier fees up to $0.012; fax $0.007 a page; a number $1 a month | [Telnyx](https://telnyx.com/pricing) |
| Certified mail | `file/index.ts`, Lob | $0.89 a letter, $0.09 a page, $6.95 certified (Startup) | [Lob](https://help.lob.com/print-and-mail/ready-to-get-started/pricing-details) |
| Notary | none: the owner signs before a notary (owner packets) | $0 to Placetta; the fee is the owner's, passed through | `file/destinations.ts` |
| Payments | Stripe | card 2.9% + $0.30, Billing 0.7%, ACH 0.8% capped at $5 | [Stripe](https://stripe.com/pricing) |
| Team | the staff queue, two-key reviews, team filings | $60 an hour loaded (FOUNDER TO CONFIRM) | `docs/PRICING.md` |

## Where we lose money, and the fix for each

| Exposure | When it loses | Guardrail |
|---|---|---|
| A $99 renewal that needs the team | past 1.6 team hours (est.) | the team-minutes alert: a filing past 1.5x its budget opens a staff alert (`teamOverBudget`, migration `20261025090000_margin_guard.sql`) so a form that keeps running long is moved to a quote or automated |
| A complex license | past about 16 team hours (est.); below 50% margin past about 8 | the same alert, at 1.5x five hours |
| Comped workspaces | up to $200 of AI a month, no revenue | the margin watch alerts staff when a workspace with no revenue passes $5 of AI in a month |
| Free workspaces (plan preview) | $5 of AI a month each, no limit on workspaces | the same alert; the preview itself is the registry, no model |
| A store whose AI passes 10% of its revenue | never below 79% on the store plan, but it is the early sign of a runaway pattern | the margin watch, daily, one alert a workspace a month |
| Fixed platform cost | $172 a month until about the second store | none needed: covered by the first two stores' plans |
| Stripe on yearly plans | 3.6% by card, $64 a store a year | not a loss; ACH would cost about $17.50 a store a year (est.). Founder step: offer ACH on yearly invoices |
| Gemini 3.8 Flash doubling on 2027-01-01 | AI per run doubles | not a loss at these volumes (a chat turn goes from about $0.012 to $0.025); the price table applies it on the day |
| Unpriced thinking tokens | Gemini 3 thinks on every call and bills it as output | now counted however the vendor reports it (`billedOutput`); the first live eval measures how much |

## What was checked and left alone

- **Cheap-model routing for the main loop.** Measured again at today's prices: with its cache hitting, Gemini 3.8 Flash
  costs about a third of Sonnet 5.5 on these journeys in 2026 and two thirds to three quarters in 2027, and with no
  cache hit it costs as much as Sonnet or more (a new license: $0.042 against $0.037). The earlier finding stands: routing a loop's calls to a cheaper model breaks the
  per-model cache, and the saving goes. Saver mode (Flash then Haiku from 60% of the allowance) stays as it is.
- **Haiku 5.5** lists at $0.10 and $0.50 a million, a tenth of Haiku 4.5, the Anthropic fallback of the cheap roles.
  Its quality on Odelia's work isn't measured; `AGENT_MODEL_FAST` switches it on after the live eval has run on it.
- **A shared cache of agency rule lookups.** The registry is that cache: every form, fee, rule and proof is code, read
  once and shared by every workspace, and the plan preview uses no model. Web research runs inside Anthropic's own
  tools, whose results Placetta never sees separately, so there is nothing more to share. The sweeper keeps the
  registry fresh instead (`docs/QUALITY.md`).
- **The portal filer's model cost** is not recorded in `ai_events` (the worker has its own key). At about $0.004 a step
  and 80 steps at most, a filing costs at most $0.33; recording it needs a column the filer's role may write, which is
  left for when portal filing is switched on.
