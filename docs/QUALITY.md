# Quality: how wrong output is kept from reaching an agency or a customer

Written 2026-10-22. No model is right every time, so the target of 100% is held by the system around it: every line
is checked in code before approval, a person approves every filing, and four loops look for errors on their own.
Nothing in them files anything or changes what a customer sees.

## Before anything is filed

| Layer | What it does | Code |
|---|---|---|
| Field validators | EIN format and the prefixes the IRS assigns, an ITIN where an EIN goes, a P.O. box as the premises, Chinese characters on a US form, real dates (February 29 only in a leap year) | `src/validate.ts`, wired into `preflight` in `src/smart.ts` |
| The check before approval | the right agency for the store's address (city vs county), the legal name letter for letter, the fee against the agency's published fee, every line the form asks, every attachment it lists, the same filing twice | `src/smart.ts` `preflight` |
| Citations | every plan row and form carries its agency page, a quote under 25 words and the day it was read; fees agencies don't publish are left open, never guessed | `src/forms/proof.ts`, `npm run test:accuracy` |
| Abstention | where the library has nothing (a food truck, a county with no form on file), the plan names the office to confirm with instead of a guess | `src/plan/preview.ts` ("We'll confirm with ...") |
| Two passes on what's filed | the filled PDF is read back line by line (missing, wrong, overflow, unprintable characters, secrets); a separate model on another vendor checks the job against its done list | `src/forms/readback.ts`, `src/serverRun.ts` checker |
| Human approval | an owner approves the exact data, fee and route; a card whose answers changed can't be filed; the first 10 filings of each form wait for a two-key team review | `src/forms/versions.ts`, `supabase/functions/file` (`FILER_TWO_KEY`) |
| Playbooks | the common filings run the same steps every time, with the checks in code, and ask once | `src/filingPlaybooks` |

## The loops that look for problems on their own

| Loop | What it does | Copied from |
|---|---|---|
| Nightly sweeper (`npm run qa -- --sweep`, `.github/workflows/quality.yml`) | re-reads every agency page a proof quotes and every form's own fee page: quote gone is drift (high), a different fee is a fee finding (medium), a proof older than 90 days is stale (low), a page that doesn't open or blocks robots is unreachable (low), never read as a changed rule | Vanta's continuous monitoring: automated tests run "on an hourly basis" against each control, failing tests carry remediation guidance, an owner and a deadline per category ([Vanta](https://www.vanta.com/resources/help-center-articles-for-tests)). Stripe's degradation alerts: an alert only for a sustained event, routed by urgency ([Stripe](https://stripe.com/au/blog/using-ml-to-detect-and-respond-to-performance-degradations-in-slices-of-stripe-payments)) |
| Online grader (`src/qa/grade.ts`, called by agent-run) | grades a sampled 20% of finished runs (FOUNDER TO CONFIRM) with plain checks, no model: a claim to have filed, a secret in a reply, a fee, time or form number with no lookup in the run, an application marked ready that fails the check, more than 30% of tool calls failing | Braintrust's online scoring: rules score a sample of production traces in the background, no added latency ([Braintrust](https://www.braintrust.dev/docs/evaluate/score-online.md)). LangSmith's automation rules: a filter, a sampling rate, then an annotation queue ([LangSmith](https://docs.langchain.com/langsmith/rules)). Harvey's sourcing standard: a substantive claim needs a source tied to it ([Harvey](https://www.harvey.ai/blog/biglaw-bench-sources)) |
| Mutation generator (`npm run qa -- --mutate`, `src/qa/mutate.ts`) | mutates every accuracy fixture the way customers write (a suite, ZIP+4, capitals, "Street", spaces, a P.O. box, a food truck, beer and wine, nonsense) and checks each plan's invariant; 459 mutations a night | OpenAI's automated red teaming: many varied cases generated from a goal, rewarded when they break a rule ([OpenAI](https://openai.com/index/advancing-red-teaming-with-people-and-ai/)). Anthropic's Petri: seed scenarios run in parallel and judged on fixed dimensions ([Anthropic](https://alignment.anthropic.com/2025/petri)); here the judge is plain invariants, so it costs nothing and never flakes |
| Triage queue (staff, Quality tab) | every finding once, with severity, a repro, a proposed fix and a due date (high a day, medium three, low seven); seen again it's counted, fixed and seen again it reopens | Vanta's per-category deadlines and owners; LangSmith's annotation queues |
| Self-verification of the team's own work | the checker grades a job against its done list before it counts as done, and a job resumes until it is | Devin: a review loop that "closes the loop" until the diff is clean, and a test plan "grounded in source, not assumptions" ([Cognition](https://cognition.com/blog/testing-development)) |

## What fixes itself, and what waits for a person

- **Safe class, proposed on its own:** a fee that changed on the form's own cited page, when it is the only fee-like
  amount there and within half to three times the old one. The nightly job writes it into the registry and opens a
  **draft** pull request citing the page and the day. Nothing merges or deploys until a person does.
- **Everything else waits for staff** in the Quality tab: drift, other fee changes, unreachable pages, grader
  findings, broken invariants. Approving records the decision; the change itself is made in code and reviewed.

## What the first live sweep found (2026-10-22)

183 proofs and 52 fee pages read. Two real findings, both left for staff: California EDD's employer registration
page no longer carries the sentence Placetta quotes for DE 1 (drift); and NYC's Food Protection exam page lists a $24
base price plus a $0.60 card fee, where the registry has $24.60 (a fee finding, not safe to fix on its own). 36 pages
blocked the sweeper or didn't answer from the test machine (unreachable, not drift).
