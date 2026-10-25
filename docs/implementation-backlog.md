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

## M2. One US workflow, end to end. ACTIVE, BLOCKED on one owner decision

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
