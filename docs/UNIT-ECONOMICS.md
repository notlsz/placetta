# Unit economics: what it costs to run Odelia and deliver each filing

Written 2026-10-22. `npm run econ` measures the AI side from the requests Placetta really builds and rewrites the
tables between the markers below (and `docs/unit-economics.json`). Every other input lives in `src/economics.ts`:
vendor list prices with the page each was read from, and estimates marked **FOUNDER TO CONFIRM**. Nothing here comes
from production data, because there is none yet: every margin is an estimate (est.), and the staff margin view
(`ai_margin_company`, `docs/AI_COSTS.md`) is where the real numbers will show.

## The short answer

- **The founder's ceiling holds: at most $50 of AI and running cost a store a month**, saver mode from $35, so the
  $149 store plan leaves about $100. Running cost that isn't AI is $5.48 a store-month (mostly Stripe on the yearly
  invoice), so the gate now allows $44 of AI a store, saver from $29 (`ai_rules()` `store_plan_month` and
  `store_plan_soft`, `MAX_COST_PER_STORE_MONTH_USD` in `src/economics.ts`; before, the store plan shared legacy
  Essentials' $25 with saver from $15). Every customer type and every journey fits, with room: see "The $50 ceiling"
  in the tables. Nothing measured exceeds it, so no cost cut had to be built for it; the gate makes it a hard line
  rather than an estimate.
- **Every common filing now has a playbook** (`src/filingPlaybooks`): business license, health permit, seller's
  permit, sign and building permits, liquor, company formation, and the sales tax return. Odelia runs one tool,
  `follow_playbook`, instead of reasoning each filing out: it finds each store's own form, fills it from the profile,
  reuses uploaded documents, checks every line in code and asks for everything missing in one message. Measured on
  the seven kinds with a registry form: model rounds down 43%, tool calls down 60%, AI per filing down 26%, three
  stores in 2 tool calls instead of 13, and one run instead of two when the profile already has the answers. Runs per
  filing: 2 when something must be asked, 1 when not (see "Each filing type" in the tables).
- **We don't lose money on AI.** A store's typical month of Odelia costs about $0.70 of AI (20 chat turns and four
  weekly checks), under 1% of the $149 plan; with running cost, about $6.40. A heavy month (200 chat turns, five new
  licenses, a liquor license, two team renewals) costs $8.61 of AI on the dearest route, $14.09 with running cost. AI is
  never the cost that matters on a filing: a new license's whole model work is between a cent and eight cents, and its
  $299 fee pays for it; none of it comes out of the $50.
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

## Team minutes, apart from the $50

Team time isn't AI or running cost, so it's shown apart. On a store that pays for its licenses, the fees pay for it:
a typical opening (nine licenses, two complex) brings $265 a store-month of fees against $51 of team time. It doesn't
come out of the $50 on any customer type that pays per license.

**The chain plan is the exception.** With 10 or more stores every new license is included, so the team time on an
opening is paid by the plan: about $882 an opening (nine licenses at 31 minutes, two complex at five hours, est.). A
20-store chain opening five a year carries about $19 of team time a store-month; with its $6.37 of AI and running
cost that is $25, still inside $50. It passes $50 all in when a 10-store chain opens about nine stores a year (90%
growth), or a 20-store chain about eighteen. Three ways to fund it, for the founder to choose (none is built: each
changes a price or a promise): keep complex licenses at $999 on the chain plan (they are two thirds of the team time
an opening takes); include a set number of new licenses a store a year and price the rest at $299; or leave it, since
the margin watch and the team-time alert show it as it happens.

## Daily status checks (added 2026-10-22)

Every filing with an agency (submitted, in progress, needs info) and anything holding up an opening or with a deadline
in the next 30 days is checked daily (`supabase/functions/monitor/status_checks.ts`, `src/tracking`). The weekly
background check no longer looks up statuses, only new or changed rules.

| Check | How | Model | Cost a check |
|---|---|---|---:|
| City open data (SF DBI, LADBS, NYC DOB NOW) | fetch the feed by permit or job number, parse in code | never | $0 |
| Agency status page the team set on the filing | fetch, strip times and tokens, SHA-256; read only when the hash changed | on change | $0, or one model check |
| No lookup in code (liquor, health, most others) | Odelia's one-filing check, backing off 1, 1, 2, 4, 7 days while nothing moves; daily while hot | each check | $0.0128 default route, $0.0405 Anthropic only |

A model check is priced at the measured chat turn above (2 calls), since it is one short background run. Per store-month
(`checksPerStoreMonth` in `src/tracking`, est.): three filings in flight, one with a city feed, half hot: 72 checks,
42 by the model, **$0.54** on the default route ($0.0075 a check on average), $1.70 on Anthropic only. Worst case, nine
filings all hot with no feed, all on Anthropic: 270 checks, **$10.94**. Both fit inside the $50 ceiling with the rest of
the month's AI. Real numbers: `select public.status_check_costs(30)` (staff) reports checks, model checks, cost per
check and per store-month from `filing_checks`. A model check's own cost is on its run in `agent_runs.cost_usd`
(`filing_checks.run_id`).

## Talking and voice notes (added 2026-10-23)

Talking into the message box uses the browser's own speech recognition first (Chrome, Edge, Safari; English and
Mandarin): free. Where a browser has none, the clip is recorded as a voice note and transcribed on the server by Whisper
large v3 turbo on Groq at $0.04 an hour of audio, billed at least 10 seconds a clip (`src/speech.ts`, `supabase/functions/tts`).

| Use, all on the paid path | A store a month |
|---|---|
| A minute of audio | $0.00067 |
| Heavy: 10 voice notes of 30 seconds every day | $0.10 |
| Absurd: two hours of talking every day | $2.40 |

Heavy use is a fifth of one percent of the $50 ceiling, under the founder's $1 a store a month line for voice, so voice
notes stay. Clips share the read-aloud daily budget (a clip counts as 250 characters of `tts_chars`), which caps one
workspace at about 80 clips a day. `npm run test:speech` checks these numbers.

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
| One chat turn on an open store (the average of "what's due" and "which licenses") | 2 | 29,111.5 | 46.9% | 41.5 | $0.0128 | $0.0256 | $0.0220 | $0.0405 | $0.0075 |
| A new license: found, prepared, filled from the workspace, put up for approval | 5 | 56,051 | 78.9% | 429 | $0.0138 | $0.0276 | $0.0436 | $0.0383 | $0.0188 |
| A complex license: beer and wine in Flushing (SLA license, community board notice, TTB registration) | 5 | 57,150 | 74.3% | 626 | $0.0165 | $0.0331 | $0.0452 | $0.0472 | $0.0188 |
| A renewal the monitor starts: found, prepared, filled, put up for approval | 5 | 67,426 | 79% | 282 | $0.0157 | $0.0313 | $0.0516 | $0.0435 | $0.0188 |
| A four-city entry: four stores added, one plan_markets packet | 3 | 34,133 | 45.7% | 219 | $0.0159 | $0.0318 | $0.0264 | $0.0501 | $0.0113 |

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
| Store plan, a store a month (typical) | $149.00 | $0.70 | $0.08 | $0.57 | $5.39 | $6.74 | 95.5% | 20 chat turns, 4 weekly checks, 0.11 included renewals |
| Store plan, a store a month (heavy chat) | $149.00 | $3.00 | $0.08 | $0.57 | $5.39 | $9.04 | 93.9% | 200 chat turns |
| Store plan, a store a month (abusive: at the allowance) | $149.00 | $44.00 | $0.08 | $0.57 | $5.39 | $50.04 | 66.4% | the gate holds AI at the store plan's $44 allowance (the $50 ceiling less running cost) |
| New license | $299.00 | $0.01 | $0.06 | $31.34 | $8.97 | $40.38 | 86.5% | route mix measured over 580 licenses |
| New license, pessimistic AI and all by the team | $299.00 | $0.04 | $0.00 | $45.00 | $8.97 | $54.01 | 81.9% | worst route, the team files it |
| Complex license (liquor) | $999.00 | $0.02 | $0.00 | $300.00 | $29.27 | $329.29 | 67% | team-led: hearings, notices, corrections |
| Renewal the plan doesn't include ($99) | $99.00 | $0.02 | $0.00 | $30.00 | $3.17 | $33.19 | 66.5% | it needs the team by definition |
| Four-city entry (plan_markets), the planning run | $0.00 | $0.02 | $0.00 | $0.00 | $0.00 | $0.02 | free | the plan preview is free; licenses are bought one by one |

### Contribution margin per customer, a year (est.)

| Customer | Stores | Opens | Revenue | Cost | Margin | Licenses included free |
|---|---:|---:|---:|---:|---:|---:|
| One store, open | 1 | 0 | $1,872 | $109 | 94.2% | 0 |
| One store, opening (the typical San José restaurant) | 1 | 1 | $7,455 | $1,172 | 84.3% | 0 |
| 5-store chain, opens 1 a year | 5 | 1 | $14,944 | $1,608 | 89.2% | 0 |
| 20-store chain, opens 1 a year | 20 | 1 | $38,339 | $3,106 | 91.9% | 11 |
| 20-store chain, opens 5 a year (25% growth) | 20 | 5 | $41,915 | $6,798 | 83.8% | 55 |
| 10-store chain, opens 3 a year (25% growth, just over the line) | 10 | 3 | $21,404 | $3,861 | 82% | 33 |

### The $50 ceiling a store a month

AI and running cost a store may cost in a month: $50, saver mode from $35. Running cost that isn't AI is $5.48 a store-month (Stripe on the yearly invoice by card, alert texts, the renewals Odelia sends), so the gate allows $44 of AI a store (saver from $29).

Each journey on the dearest of the four routes (with 1,000 thinking tokens a call at 2027's price), and how many fit in the AI allowance:

| Journey | AI, dearest route | Fits in $44 |
|---|---:|---:|
| One chat turn on an open store (the average of "what's due" and "which licenses") | $0.0555 | 792 |
| A new license: found, prepared, filled from the workspace, put up for approval | $0.0811 | 542 |
| A complex license: beer and wine in Flushing (SLA license, community board notice, TTB registration) | $0.0847 | 519 |
| A renewal the monitor starts: found, prepared, filled, put up for approval | $0.0891 | 493 |
| A four-city entry: four stores added, one plan_markets packet | $0.0726 | 606 |

Each customer type, a store-month: AI and running cost against the ceiling, and team time apart, against the fees that pay it:

| Customer | AI and running a store-month | Under $50 | Team a store-month | License and renewal fees a store-month | Profit a store-month |
|---|---:|---|---:|---:|---:|
| One store, open | $6.40 | yes | $2.70 | $7.02 | $146.93 |
| One store, opening (the typical San José restaurant) | $14.10 | yes | $50.99 | $265.18 | $349.09 |
| 5-store chain, opens 1 a year | $8.50 | yes | $15.87 | $77.43 | $202.06 |
| 20-store chain, opens 1 a year | $6.39 | yes | $6.23 | $6.85 | $143.22 |
| 20-store chain, opens 5 a year (25% growth) | $6.38 | yes | $18.80 | $6.24 | $130.06 |
| 10-store chain, opens 3 a year (25% growth, just over the line) | $6.38 | yes | $21.59 | $6.10 | $127.13 |

A heavy month for one store, everything on the dearest route: 200 chat turns, 5 new licenses, 1 complex, 2 renewals the team sends and the weekly checks cost $8.91 of AI, $14.39 with running cost: under $50. The licenses' and renewals' own AI is $0.37; their fees ($2,692) pay it many times over, and pay their team time ($516.70) and Stripe ($80.46) too, so none of it has to come out of the $50. Their AI still counts against the store's allowance in the gate; at about $0.046 a filing it never decides whether one fits.

### Each filing type, first request to approval, before and after its playbook

Measured on one store whose profile lacks the form's own answers (the usual case: two runs, one question in between), through runRounds with a scripted model. "Before" is Odelia reasoning it out: find the form, prepare it, try the approval, ask; then fill the answers and put it up. "After" is follow_playbook twice. "Profile complete" is the playbook when nothing is missing. AI on Gemini 3.8 Flash at 2026's price. Team minutes are the estimate for the route the dispatcher picks for that store's form (FOUNDER TO CONFIRM).

| Filing | Form | Runs before / after | Model rounds before / after | Tool calls before / after | Prompt tokens before / after | AI before / after | Profile complete: runs, rounds, AI | Three stores: tool calls before / after | Route | Team minutes (est.) | Agency time | Renews |
|---|---|---|---|---|---|---|---|---|---|---:|---|---|
| Business license or tax certificate | sj-business-tax | 2 / 2 | 7 / 4 | 5 / 2 | 81,852 / 41,977 | $0.0253 / $0.0186 | 1, 2, $0.0093 | 13 / 2 | team | 45 | If you pay during registration, the account activates in 2 to 3 business days; otherwise the invoice is mailed within 5 to 10 business days. | Every year, due on the 15th of the month your business started in San José; a 25% penalty is added the day after it's due, and another 25% a month later. |
| Health permit (food facility) | nyc-fse | 2 / 2 | 7 / 4 | 5 / 2 | 79,557 / 42,239 | $0.0241 / $0.0184 | 1, 2, $0.0095 | 13 / 2 | portal | 15 | You may open 22 days after applying, even before the pre-permit inspection. | Every year. |
| Seller's permit or sales tax registration | ca-cdtfa | 2 / 2 | 7 / 4 | 5 / 2 | 85,973 / 43,851 | $0.0265 / $0.0195 | 1, 2, $0.0101 | 13 / 2 | portal | 15 | Often issued the same day. | Does not expire. |
| Sign permit | sj-sign | 2 / 2 | 7 / 4 | 5 / 2 | 81,165 / 41,484 | $0.0243 / $0.0178 | 1, 2, $0.0093 | 13 / 2 | portal | 15 | Average: 2 weeks. | not stated |
| Building permit for the build-out | sj-building-ti | 2 / 2 | 7 / 4 | 5 / 2 | 81,650 / 41,801 | $0.0247 / $0.0180 | 1, 2, $0.0094 | 13 / 2 | portal | 15 | San José's standard plan review for a commercial tenant improvement takes about 10 working days for the first round and 5 working days for each recheck. | not stated |
| Liquor license | ny-sla-rw | 2 / 2 | 7 / 4 | 5 / 2 | 79,722 / 41,423 | $0.0238 / $0.0178 | 1, 2, $0.0093 | 13 / 2 | portal | 300 | not published | Every 2 years. |
| Company formation or foreign registration | ca-llc-1 | 2 / 2 | 7 / 4 | 5 / 2 | 83,600 / 42,275 | $0.0265 / $0.0192 | 1, 2, $0.0093 | 13 / 2 | portal | 15 | Online filings are currently reviewed about 3 days after receipt (mail about 8 days), per the Oct 8, 2026 queue. | Statement of Information (LLC-12, $20) within 90 days, then every two years. |

Across the 7 kinds: model rounds down 42.9%, tool calls down 60%, AI cost down 26.2%. Runs stay at two when something must be asked (one question, one answer) and drop to one when the profile already has it. A rejection by the agency adds one run either way (read the reason, fix, approve again); the playbook's checks in code are there to make it rarer, and there is no production rejection rate yet to measure it against. Sales tax returns have no registry form yet, so their playbook hands them to the team (no row).

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
| A store past the $50 ceiling | never: the gate holds AI at $44 a store a month, and a task that crosses it finishes in saver mode, bounded by its $1.50 task cap, instead of stopping mid-filing | `store_plan_month` and `store_plan_soft` in `ai_rules()`, `ai_gate_in_task()` |
| A store whose AI passes 10% of its revenue (about $15) | not a loss, the early sign of a runaway pattern | the margin watch, daily, one alert a workspace a month |
| A chain growing fast on included licenses | team time past about $44 a store-month (see above) | the team-time alert per filing and the margin watch; the funding choice is the founder's |
| A multi-store workspace's allowance is pooled | one store can use more than $44 while others use less; the workspace average stays at or under it | none needed: the ceiling is a store-month average across the workspace |
| Fixed platform cost | $172 a month until about the second store | none needed: covered by the first two stores' plans |
| Stripe on yearly plans | 3.6% by card, $64 a store a year | not a loss; ACH would cost about $17.50 a store a year (est.). Founder step: offer ACH on yearly invoices |
| Gemini 3.8 Flash doubling on 2027-01-01 | AI per run doubles | not a loss at these volumes (a chat turn goes from about $0.012 to $0.025); the price table applies it on the day |
| Unpriced thinking tokens | Gemini 3 thinks on every call and bills it as output | now counted however the vendor reports it (`billedOutput`); the first live eval measures how much |

## Each change, before and after (kept only when better)

| Change | Before | After | Kept |
|---|---|---|---|
| Model prices re-read from the vendors | Gemini 3.8 Flash recorded at half its list price; Sonnet 5.5 cache reads at twice theirs | recorded at what the vendors bill, with 2027's price change applied on its day | yes: the allowance and margin views were wrong |
| Thinking billed as output | a vendor reporting thinking apart from `completion_tokens` went unpriced | counted however it's reported | yes |
| The $50 store ceiling | store plan AI capped at $25, saver from $15, no total-cost line | $44 of AI (saver from $29), $50 all in, tested against `src/economics.ts` | yes: the founder's rule |
| Never stopped mid-task | a run that crossed the allowance part way through a filing stopped there | finishes in saver mode, within its $1.50 task cap | yes |
| Margin watch and team-time alert | no alert on AI against revenue or on a filing's team time | a staff task for each, once | yes |
| Filing playbooks | 7 model rounds, 5 tool calls, $0.025 a filing (one store, one question) | 4 rounds, 2 calls, $0.018; three stores in 2 calls instead of 13 | yes |
| Field validators | an EIN with a prefix the IRS doesn't assign, an ITIN on the EIN line, a P.O. box as the premises passed the check | refused or questioned before approval | yes |
| Edge-case fixes | food trucks got a restaurant's permits; a county-only address lost the county; deadlines counted from UTC | each fixed, each with a test | yes |
| Quality loops | rules re-checked only by age (90 days), no grading of real runs, no mutation testing | nightly sweep, 20% online grading, 459 mutations, a triage queue | yes: the first sweep found two real changes |
| A separate chat limit | | | no: the allowance, saver mode and rate limits already hold it (below) |

## What was checked and left alone

- **Cheap-model routing for the main loop.** Measured again at today's prices: with its cache hitting, Gemini 3.8 Flash
  costs about a third of Sonnet 5.5 on these journeys in 2026 and two thirds to three quarters in 2027, and with no
  cache hit it costs as much as Sonnet or more (a new license: $0.042 against $0.037). The earlier finding stands: routing a loop's calls to a cheaper model breaks the
  per-model cache, and the saving goes. Saver mode (Flash then Haiku from the soft line) stays as it is.
- **A separate chat fair-use limit.** At a measured $0.012 a chat turn (about $0.05 on the dearest route), the $44
  allowance is about 800 turns a store a month on the dearest route; saver mode, the per-person limits (15 tasks an
  hour, 80 a day) and the daily throttle ($10 a workspace, or 5x the median) already are the fair-use policy. A fourth
  limit would only refuse customers who are still far inside the ceiling.
- **Haiku 5.5** lists at $0.10 and $0.50 a million, a tenth of Haiku 4.5, the Anthropic fallback of the cheap roles.
  Its quality on Odelia's work isn't measured; `AGENT_MODEL_FAST` switches it on after the live eval has run on it.
- **A shared cache of agency rule lookups.** The registry is that cache: every form, fee, rule and proof is code, read
  once and shared by every workspace, and the plan preview uses no model. Web research runs inside Anthropic's own
  tools, whose results Placetta never sees separately, so there is nothing more to share. The sweeper keeps the
  registry fresh instead (`docs/QUALITY.md`).
- **The portal filer's model cost** is not recorded in `ai_events` (the worker has its own key). At about $0.004 a step
  and 80 steps at most, a filing costs at most $0.33; recording it needs a column the filer's role may write, which is
  left for when portal filing is switched on.
