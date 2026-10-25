# Implementation backlog

One milestone is active at a time. Every status cites its evidence. "Fixture" means a local test page, "live" means
the agency's real site; never read one as the other.

Capability states for each destination: RESEARCHED, PREPARABLE, ROUTABLE, BROWSER-TESTED, LIVE-SUBMITTED,
AGENCY-ACKNOWLEDGED, ISSUED.

## Authorization (owner, 2026-10-25)

Finish M1, then go straight into M2 without another routine approval pause. One milestone is active at a time.

Always forbidden without explicit approval:
- buying infrastructure, changing external services, or deploying;
- live agency submissions, accepting declarations, signing for the owner, or incurring charges;
- using real customer data in tests.

Fixture success is labelled as fixture success, never LIVE-SUBMITTED or AGENCY-ACKNOWLEDGED. M3 to M7 are proposed, not
authorized.

## M1. Validate gb-food (UK food business registration). DONE (validation)

- **Deliverable:** a validation report on branch `cline/placetta-integration` (PR #28). gb-food stays disabled.
- **Status (2026-10-25):**
  - RESEARCHED and ROUTABLE (disabled).
  - BROWSER-TESTED on a fixture only, in the worker's own image.
  - Never live-submitted. Activation NOT READY.
- **Evidence:**
  - Deno server tests: 521 passed, 0 failed. The filing-function tests: 51 passed, 0 failed.
  - `deno check`: 23 of 23 server functions pass. Worker `tsc` passes.
  - Full `npm run build` finished, with no errors in the log.
  - `test:leak`, `filing-coverage --check` and `test:markets` pass.
  - Worker `npm test` in `mcr.microsoft.com/playwright:v1.56.0-noble` (the base image of worker/filer/Dockerfile):
    89 passed, 0 failed. That includes the gb-food fixture tests, 4 of 4: the review stop in the two-key period, the
    hand-back on a card field, and a single submit after the team's approval.
- **The environment, not a failure:**
  - In the dev container Chromium can't start (11 system libraries missing). There the same suite fails 48 tests, and
    45 of those fail the same way on origin/main.
  - The image above runs everything. Run browser tests there, never in the dev container.
- **Activation blockers:**
  1. The service's declaration and signature step was never seen, so `signature` is a placeholder.
  2. Whether a filer may submit for the business is unstated (`onBehalf`).
  3. There's no playbook, so the model drives every page.
  4. The approval card's routes file covers US forms only (M3).
  5. Not deployed.
- **Commits:** `998413e0`, `4d29f6ea`, `7bf6ec00`.

## M2. One US workflow, end to end. DONE (fixture only)

**Update 2026-10-25:** option (a) was approved and implemented. Every result below is fixture-only, and ca-llc-5 stays
`verified: null`.

- **How the opener exception works** (`navOn` in `playbooks.ts`; the call site is `exec` in `run.ts`):
  - **Page identity:** it comes only from the browser's own page state (`pageState`: the address and visible
    h1-h3), never from the model.
  - **When it applies:** only for a button shared with a send button, and only on a page where all of these hold:
    - the address parses;
    - the first visible heading is exactly "Forms" (the `<title>` alone never counts);
    - exactly one button or link carries the words;
    - nothing on the page (headings, title or visible text) names File Document or a fee page.
  - **Checks in `run.ts`:** the page is read again just before the click and must give the same answer at the same
    address. No exception once a submit has been pressed.
  - **Anything else gets no exception:** the final-submit guard runs, and the run hands back.
- **Playbook rule:** `navProblems` allows a shared label only between two named, different pages. Same page,
  overlapping page names, a send with no page, a fee page, and an entry with no page are still refused.
- **Tests:**
  - Unit (`playbooks.test.ts`): positive and negative cases for identity, duplicates, conflicts, missing identity and
    the playbook rule.
  - Fixture (`cafllc.test.ts`): 10 of 10.
- **The teach-mode redteam failure was a real gap in the safety check, not slow test timing, and is fixed:**
  - Page events were read on the next 100 ms poll, so a page the person left quickly was never checked for text
    aimed at an AI.
  - Now each page is read as it arrives (`scanPage`), and a page that has changed by then counts as flagged.
  - New regression test: "a page that has changed before it is read counts as flagged".
- **Full worker suite** in the worker image: 101 passed, 0 failed, 0 skipped, three runs in a row. The redteam
  tests ran alone 10 times: 30 of 30 passed.
- **Still unverified on the live site:** the real Forms heading and address, how the real opener looks, what the real
  File Document page shows, and the work-order receipt.

## M3. Approval-card route data for non-US forms. DONE (authorized 2026-10-25)

- **Before:**
  - `scripts/filing-coverage.mjs` wrote `src/forms/filingRoutes.json` from USD forms only.
  - Any other form fell back to "team" ("Odelia prepares it and you send it").
  - The card couldn't show a step the person still takes on a route Odelia sends (the agency's fee on its site).
- **Now** (nothing that decides what gets sent has changed: FILER_AGENCIES, fees, approval gates and live filing are
  all untouched):
  - **The generator** also writes forms abroad, but only when their route isn't the default, and writes
    `src/forms/filingSteps.json`.
  - **`filingSteps.json`** lists the step that stays the person's: today only "pay", for routes Odelia files on a
    portal where the agency takes its fee on its own site.
  - **`notReady` on a destination** (`destinations.ts`; card metadata only) makes the card say "Odelia prepares it
    and you submit it on the agency's site" and "Automatic filing isn't switched on for this form yet". It's set
    for gb-food, whose blockers stay open.
  - **`approvalRoute.ts`** reads only the route kinds it knows, using the entry's own key (no inherited keys).
    Anything missing or unknown gets the conservative "Odelia prepares it and you send it".
  - **`RouteLine` (`pages.tsx`)** shows the steps with the existing `appr-time` style. No new CSS or components.
- **US cards:** the route kind is the same for every one of the 393 US forms. The routes file diff is one added line,
  `gb-food: notReady`.
  - What's new on US cards is the fee line: "You pay the agency's fee on its site" on 47 forms Odelia files on a
    portal where the agency takes its fee there. That corrects a missing disclosure; it isn't a behaviour change.
- **Evidence:**
  - `test:agent`: 1919 passed, 0 failed. The new checks cover a US route with the fee step, gb-food disabled, a
    form abroad the person sends, an unknown form, an empty id, inherited keys, and that every form abroad in the
    routes file is notReady.
  - Deno tests: 522 passed, 0 failed, including the new notReady rule.
  - `filing-coverage --check`, `deno check` on `file/index.ts`, `tsc -b` and `plain-words`: all pass.
  - Full `npm run build`: exit 0.
  - `test:leak`: no server-only text, model id or secret in the 10,146 built files.
  - `test:home`: all passed.
- **Worker:** not changed, so not re-run.

## M4. Billing verification in Stripe test mode. DONE LOCALLY; Stripe test mode BLOCKED (authorized 2026-10-25)

- **Stripe test mode: not run.**
  - No Stripe key of any kind is available here: no `STRIPE_*` environment variable, none in `.env.production`, and
    no Stripe CLI login.
  - So no test-mode checkout was created and no webhook was delivered by Stripe.
  - Nothing below proves the live Stripe integration works; it proves the code's own decisions on synthetic events
    and requests.
  - **Missing prerequisite:** a Stripe *test-mode* secret key (`sk_test_…`), set only in a disposable environment,
    plus a way to deliver test webhooks to a local function (`stripe listen`, or a test endpoint you approve).
    Creating an endpoint, product or price in Stripe needs separate approval, even in test mode.
- **Code read** (`supabase/functions/billing/`, `stripe-webhook/`, `_shared/stripe_catalog.ts`, the billing
  migrations and `src/pricing.ts`):
  - **Checkout:** server-side price ids, checked against the approved amount before use.
  - **Who may buy:** only an owner, with two-step sign-in and SSO enforced, and only on their own workspace.
  - **Workspace id:** taken from the signed-in workspace, not from the client, and written onto the checkout and
    the subscription.
  - **Return URL:** allowlisted.
  - **Subscription events:** applied only if no newer one was applied (`subscription_event_at`).
  - **Event ids:** each applied once (`stripe_events` primary key); on an error the id is forgotten so Stripe's retry
    applies it.
  - **Entitlement:** comes only from webhook-written billing rows (`plan_of`, `can_file_app`), never from the return
    page.
  - **License charges:** `license_charge_settle` moves only a pending charge to paid.
  - **Prices:** match the documented ones ($149 a store a month billed yearly; $179 month to month; $299, $999, $99;
    pack $49 for $25). No pricing was changed.
- **Defects found and fixed** (synthetic tests in `stripe-webhook/logic_test.ts`):
  1. **A pack's credit could be given twice.**
     - The webhook added the credit before a later database call; if that call failed, the event was forgotten and
       Stripe's retry added the credit again.
     - The credit is now added last.
  2. **Delayed payment methods were never fulfilled.**
     - A checkout paid by a delayed method (a bank debit) completes "unpaid" and is paid later by
       `checkout.session.async_payment_succeeded`, an event the webhook neither handled nor subscribed to.
     - It is now handled (`checkoutEffect`), and both async events are in `WEBHOOK_EVENTS`.
     - An endpoint made before this keeps its old event list; adding the two events in Stripe needs a dashboard
       change (not done).
  3. **A signature header with two timestamps.**
     - The parser took the last `t=`; a header with two is now refused.
     - It wasn't exploitable (the HMAC still had to match), but it fails closed now.
  4. **Copy on the return page:**
     - "Payment received" was shown on return even when the payment was still pending; it now says checkout is
       complete and the plan switches on once payment is confirmed.
     - Subscription checkouts return with `billing=canceled`, which showed nothing; it now says checkout was
       canceled.
- **Checks:**
  - Deno server tests: 525 passed, 0 failed, including 3 new webhook tests.
  - `deno check` on `stripe-webhook` and `billing`, `tsc -b` and `plain-words`: all pass.
  - Full `npm run build`: exit 0. `test:leak`: no leak in the 10,146 built files.
- **Not changed:** prices, Stripe configuration, products, endpoints, approval gates, or anything about filing.
- **Not covered locally:**
  - Failed renewals (past_due/unpaid) come from `customer.subscription.updated`. The status is applied, and only
    active or trialing counts as a plan.
  - The SQL ordering and idempotency are covered by `supabase/tests/store_billing.sql`, which needs Postgres (not
    available here; it runs in CI).

**M4 status (2026-10-25):** local verification DONE, commit `053d4d4f`. Stripe test mode BLOCKED: no test key is
available in any project configuration. The owner was asked once to supply one through the secure configuration
process; it is never to be pasted in chat.

## M5. Bounded coverage. BLOCKED on scope (owner question asked 2026-10-25)

- **Agreed list:** none exists yet.
- **Proposed smallest batch** (from the M1 research): three UK GOV.UK services.
  - `gb-incorporate`: Companies House incorporation.
  - `gb-vat`: HMRC VAT registration.
  - `gb-paye`: HMRC PAYE employer registration.
  - Each would be a destination, a routing test and a fixture test, kept disabled and marked `notReady`.
  - All three need Government Gateway or GOV.UK One Login, which the person signs in to themselves.
- **Not started until approved.**
- **Tibet stays blocked** until its locality and administrative scope are clarified.
- **Mexico** would be a separate batch.

## M6. Signup value display. DONE

- **What it shows:** the plan card on Home (`pages.tsx`, Plan tab) adds one line under the plan summary, from the same
  route data as every approval card (`approvalRoute.ts` `planSplit` / `planSplitLine`). For example: "Odelia can
  submit 2 for you once you approve; 4 she prepares for you to send; 1 she can't confirm yet, so she names who to ask."
- **How it counts:**
  - An open item counts as Odelia's only when its route is one she submits on.
  - Items not switched on (gb-food), forms abroad, unknown forms and specialists' forms count as the person's.
  - Abstained steps count as unconfirmed.
  - Approved and owner-only steps aren't counted.
- **No new claims:** none about savings, time, percentages or readiness. The existing design classes are reused
  (`plan-note`); no new CSS or components.
- **Evidence:**
  - `test:agent`: 1924 passed, 0 failed, including 5 new M6 checks (the counting, both languages, no claim words, an
    empty plan, and gb-food alone).
  - `tsc -b`, `plain-words` and `test:home` (all passed) pass.
  - Full `npm run build`: exit 0. `test:leak`: ok.
- **Not checked:** a visual pass in a browser at phone and desktop width. The line uses the existing plan-note style.

## (earlier) M2 status before the owner decision

- **Candidate:** California foreign LLC registration (`ca-llc-5`) on bizfile Online, from the Secretary of State.
- **Why this one:**
  - It's the only US route with all four of the following: a destination with a cited source and a fee paid on the
    portal (`destinations.ts`), a playbook written from three published Secretary of State guides (`playbooks.ts`), a
    static mock of its pages already replayed in `replay.test.ts`, and a filled agency PDF
    (`src/forms/maps/ca-llc-5.json`).
  - Its siblings `ca-llc-1` and `ca-llc-12` share the portal and playbook, so a fix there covers three forms.
- **What was done:** `worker/filer/test/cafllc.test.ts` runs the real worker with the real ca-llc-5 destination and
  playbook against a local fixture. Made-up data only, no live site.
- **Fixture results** (in the worker image, 2026-10-25): 5 passed, 2 skipped.
  - Passed: the destination check; the unverified playbook is refused by default with no browser opened and the team
    told; a run after submit was pressed never presses it again and goes to the team to check with the agency; a
    stopped filing is never sent; and today's run hands back at the Forms page with nothing sent.
- **BLOCKER (found by the fixture):**
  - The guide's Forms pop-up opens the form with a button named "File Online", the same words as the sending button
    on File Document.
  - The worker treats the opener as a send, so the final-submit guard runs on the Forms page and the run hands back
    before it reaches the form. It fails safe, but the workflow can't complete.
  - A one-line, page-scoped `nav` exception (`nav: [{ page: "Forms", button: "File Online" }]`) fixed it: all 7
    fixture tests passed, including sign in, fill, upload, never Print and Mail, the review stop, the fee handed to
    the person, a single File Online, and the work order kept.
  - But that exception breaks the existing `playbooks.test.ts` rule that no nav button may share its words with a send
    button. The exception was reverted and the 2 tests are skipped until the owner decides.
- **Options:**
  - (a) Allow a nav exception that is scoped to its page when the send button is scoped to a different page. The test
    rule changes to require different pages, not different words.
  - (b) Tell the two apart by something other than words (for example the pop-up's dialog role). Bigger change.
- **Full worker suite** in the image: 96 tests, 93 passed, 2 skipped, 1 failed.
  - The failure is `teach.test.ts` "redteam: … during recording", which is flaky in a file this milestone didn't
    touch: run alone 3 times, it passed once and failed twice.
- **Not done:** live verification (forbidden); the playbook stays `verified: null`; nothing deployed.

## Proposed, needs approval before starting
- **M3. Approval-card route metadata for non-US forms.** `scripts/filing-coverage.mjs` writes
  `src/forms/filingRoutes.json` from USD forms only, so the card says "you send it" for any non-US route.
- **M4. Billing verification in Stripe test mode.** The earlier claims about the webhook are unverified.
- **M5. Coverage, one agency at a time:** UK, Mexico, the EU, the Middle East. Tibet needs its locality and
  administrative scope clarified first.
- **M6. Signup value display**, using the existing design system.
- **M7. Positioning brief.**
