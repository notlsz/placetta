# What Odelia costs to run

Odelia runs on a mix of models. Each model call has a role, each role has a route (the cheapest model that is good
enough for that work first, a better one behind it, Anthropic as the safety net), and every call is priced and logged
with its role and vendor. This page is the routing table, the allowance each plan includes, an estimate of what a
typical job costs, and the margin that leaves at $149 and $299 a location. The estimate is a budget, not a measurement:
the section on it says what it rests on.

Code: `supabase/functions/_shared/llm.ts` (routes and vendor rules), `ai_cost.ts` (prices), `ai_gate.ts` (the gate),
migration `20261016160000_ai_routing_margin.sql` (saver mode, alerts, throttles, margin views).

## The roles and their routes

Synced with Belluh: Gemini first (3.8 Flash for the work, 2.5 Flash when 3.8 is unavailable), Anthropic as the
top-of-the-line seat and safety net, and the same three open-model backups (gpt-oss-120b on Groq, Cerebras, OpenRouter),
each used only when its key is set and only after Gemini and Anthropic can't answer.

| Role | What it does | Default route | Where it is used |
| --- | --- | --- | --- |
| `plan` | the main agentic loop: planning, tools, the final answer | Gemini 3.8 Flash, 2.5 Flash, Claude Sonnet 5.5, then the backups | every run from the app or email (`agent-run`), the browser's loop (`agent`) |
| `review` | the independent checker that grades a job against its done list | Sonnet 5.5, Gemini 2.5 Pro, 2.5 Flash, backups | the checker in `src/serverRun.ts` (a different model from the doer, so no model grades its own work) |
| `extract` | reading uploads, pulling fields, classifying | Gemini 2.5 Flash-Lite, Flash, Claude Haiku 4.5, backups | `review_documents`, reading an upload into an application, the browser's file reads |
| `translate` | rendering text that is already decided into English or Chinese | Flash-Lite, Flash, Haiku, backups | reserved: replies are written bilingual by the main loop today |
| `draft` | routine documents and messages | Gemini 3.8 Flash, 2.5 Flash, Haiku, backups | the lesson distiller; the main loop in saver mode |
| `short` | one-liners for texts, calls and chat bots | Gemini 3.8 Flash, 2.5 Flash, Haiku, backups | runs that came by SMS, a call, Slack or Lark |
| `watch` | the monitor's weekly rule scan and routine checks | Flash-Lite, Flash, Haiku, backups | runs the monitor starts |
| `deep` | web research | Claude Opus 5.5, Gemini 2.5 Pro, 3.8 Flash | a run started with the deep switch |

Rules that bend the table:

- Only Anthropic runs the web tools (search and fetch). A `plan`, `deep` or `watch` call that carries them goes to the
  Anthropic member of its route first, so in practice the weekly scan runs on Haiku with research, and the Gemini
  models behind it serve when Anthropic is down. `short` keeps its order, so a text is answered by Flash-Lite without
  web research (its instructions already say to answer from the workspace).
- PDFs only go to vendors that read them (Anthropic, Gemini, OpenRouter). Free models never see customer files.
- Vendors: Anthropic and OpenAI always. Gemini only with `GEMINI_PAID=1` (Google's free tier may use prompts to
  improve its products; the paid tier doesn't). Without it a Gemini key goes unused and every cheap role falls to
  Haiku. DeepSeek only with `ALLOW_DEEPSEEK=1`. The gpt-oss backups (Groq, Cerebras, OpenRouter) are on when their key
  is set, and never get a file. The vendor that answered is written on every event (`ai_events.provider`),
  which is how the subprocessor list is proven.
- Gemini reads PDFs through its OpenAI-compatible endpoint as a `file` part. That path is untested against Google;
  a rejected request falls through to Anthropic, which is the same cost as before.
- A secret `AGENT_ROUTE_<ROLE>` replaces a role's route (`AGENT_ROUTE_FAST`, `AGENT_ROUTE` and `AGENT_ROUTE_DEEP`
  still mean extract, plan and deep).

## Saver mode

The gate returns `reduced` from 60% of a workspace's allowance, and for the rest of the day when the monitor
throttles a workspace (over `AI_WS_DAILY_LIMIT_USD`, default $10, or more than 5x the median workspace that day with
at least five workspaces spending). In saver mode the main loop runs on the `draft` route (Flash, then Haiku) instead
of `plan`, web research is off, answers are capped at 2,000 tokens, and the deep model is never used. The person is
told once per period at the end of a reply ("Running in saver mode until your allowance renews on November 1"), and
Settings shows it on the allowance line. At 100% the gate answers `over_budget` as before. Owners get an Update at
50% and 80% saying what is left and that saver mode starts at 60%.

## The allowance per plan

From `ai_rules()` in the database (`per_location_month` and friends):

| Plan | Price | AI allowance | Allowance as a share of price |
| --- | --- | --- | --- |
| Essentials | $149 a location a month (billed yearly) | $25 a location a month | 16.8% |
| Pro | $299 a location a month (billed yearly) | $50 a location a month | 16.7% |
| Entry | $299 a market, once | $15 a market for 30 days | 5.0% |
| Each store still opening | opening fee paid | $50 more a month while it opens | |
| Comped | $0 | $200 a month | |
| Odelia pack | $49 | $25 of credit, carried over | 51% |

So the hard floor on gross margin from AI alone is about 83% on the yearly plans. Everything below is about how far
under that ceiling a normal month lands.

## What a typical first-store job costs

The job: "map every license this store needs". Odelia reads the workspace, looks up the official forms, prepares
five to eight applications, fills them from Context, adds deadlines and asks for approval on the complete ones; the
checker grades the job; a distiller turns what was learned into lessons.

What the estimate rests on (nothing here is a measurement from production):

- Odelia's instructions plus her 29 tool definitions are about 46,600 characters, about 12,000 tokens (measured from
  the sample workspace with `rules()` and `makeTools()`). They are identical every round, so Anthropic's prompt cache
  serves them at a tenth of the input price after the first round.
- A round is one model call. A first-store job takes about 12 rounds of `plan` (the cap is 16, and 4 shifts of 16 for
  a job with a harness). Each round adds about 2,000 new tokens of tool results and reads about 20,000 cached ones;
  the model writes about 500 tokens. These are the numbers the cost tests use (`ai_cost.test.ts`: 9,000 in, 500 out
  before caching).
- Research: about 4 web searches at $0.01 each and 3 fetched pages at roughly 10,000 tokens each, billed as input.
- Four documents read with `extract`, each about 8,000 tokens in (a few PDF pages) and 300 out.
- Two `review` calls (the checker sends work back once), 3,000 in and 300 out each.
- One `draft` call for the distiller, 4,000 in and 500 out.

Prices as in `ai_cost.ts` (list prices, 2026-10-16): Sonnet 5.5 $2 in, $10 out; Haiku 4.5 $1, $5; Gemini 2.5
Flash-Lite $0.10, $0.40; Flash $0.30, $2.50; Pro $1.25, $10.

| Part | Calls | Tokens | With a paid Gemini key | Anthropic only | Before this change (all Sonnet) |
| --- | --- | --- | --- | --- | --- |
| `plan`, round 1 (cache write) | 1 | 13,000 in, 600 out | $0.04 | $0.04 | $0.04 |
| `plan`, rounds 2 to 12 | 11 | 20,000 cached, 2,000 new, 500 out each | $0.14 | $0.14 | $0.14 |
| research (searches and fetched pages) | | 4 searches, 30,000 in | $0.10 | $0.10 | $0.10 |
| `extract` | 4 | 8,000 in, 300 out each | $0.004 (Flash-Lite) | $0.04 (Haiku) | $0.08 (Sonnet) |
| `review` | 2 | 3,000 in, 300 out each | $0.014 (Pro) | $0.018 (Sonnet) | $0.018 |
| `draft` (distiller) | 1 | 4,000 in, 500 out | $0.003 (Flash) | $0.007 (Haiku) | $0.013 |
| **Job** | **19** | | **about $0.30** | **about $0.35** | **about $0.39** |

Two honest notes. First, the main loop is three quarters of the job. With a paid Gemini key it runs on Gemini 3.8 Flash (synced with
Belluh), so the job costs well under the Sonnet figures above; with only an Anthropic key it stays on Sonnet, and role
routing alone trims a job by a quarter, not by half. Second,
the spread between jobs is wider than the spread between routes: a job that fetches six long agency pages costs
twice this one, and a job answered straight from the workspace costs a tenth of it. The per-task ceiling
(`AI_TASK_LIMIT_USD`, $1.50) and the 16-round cap bound the worst case.

## A month, and the margin

A location in its first month: one first-store job ($0.30 to $0.35), about ten follow-up tasks at an average of
$0.20 (most are shorter than the first job), four weekly checks on Haiku with research at about $0.11 each, two
routine or chase runs at about $0.10, a handful of uploads read. Call it **$3 to $4 of AI per location per month**
for an active customer, and **under $1** for a quiet one. A customer who drives Odelia hard every day reaches the
allowance, where saver mode and then the gate hold the line at $25 (or $50 on Pro).

| | Essentials, $149 | Pro, $299 | Entry, $299 once |
| --- | --- | --- | --- |
| Typical month of AI | $3 to $4 | $4 to $6 (more locations, more opening stores) | $5 to $10 in its 30 days |
| Gross margin on AI, typical | 97% to 98% | 98% | 97% |
| AI at the allowance (the worst a month can be) | $25 | $50 | $15 |
| Gross margin on AI, worst case | 83% | 83% | 95% |

Saver mode changes the shape of the worst case more than its size: the last 40% of an allowance is spent on Flash
and Haiku, which stretches it to several times the work, so a customer who hits 60% rarely hits 100%.

What this leaves out: the opening fees ($3,500 and $6,500 a store, which carry their own $50 a month of allowance
while the store opens), packs ($49 for $25 of credit), and every cost that is not a model call (texts, calls, faxes,
mail, hosting). The margin view in the staff queue (`ai_margin_company`) reads the real numbers from `ai_events`
against plan revenue from `billing`, so this page is the forecast and that card is the result.

## Reading the real numbers

- `public.ai_margin_month`: per workspace per month, AI cost, calls, plan revenue, allowance, cost as a share of
  revenue, the five roles that cost the most. Service role only.
- `public.ai_margin(ws, month)`: one workspace as JSON. `public.ai_margin_company(month)`: total AI cost, MRR, gross
  margin on AI, the ten dearest workspaces, cost by role and by vendor. Staff and the server only. The staff queue
  shows the company card at the top.
- Plan revenue is read from `billing` as it stands now (Essentials $149 or Pro $299 a location a month, the older
  Starter and Growth plans, an entry plan in the month it was paid), so past months are an estimate with today's
  plan, not an invoice total.

## Secrets to set

Names only; values live in the Edge Function secrets. `GEMINI_API_KEY` with `GEMINI_PAID=1` to turn the cheap routes
on. `AI_WS_DAILY_LIMIT_USD` to move the per-workspace daily throttle off $10. `AGENT_ROUTE_<ROLE>` to change any
route. `ALLOW_DEEPSEEK` only after reading DeepSeek's data terms. The gpt-oss backups switch on with their key alone;
OpenRouter calls carry `data_collection: "deny"`, so only hosts that don't keep or train on prompts serve them.
