# Implementation backlog

One milestone is active at a time. Every status cites its evidence. "Fixture" means a local test page, "live" means
the agency's real site; never read one as the other.

Capability states for each destination: RESEARCHED, PREPARABLE, ROUTABLE, BROWSER-TESTED, LIVE-SUBMITTED,
AGENCY-ACKNOWLEDGED, ISSUED.

## M1. Validate gb-food (UK food business registration). ACTIVE: validation only

- **Deliverable:** a validation report on branch `cline/placetta-integration` (PR #28). gb-food stays disabled.
- **Acceptance:** the routing, kill switch, guards and two-key gates hold for gb-food; the full build and existing
  suites show no new failures; browser behaviour is checked on a fixture or marked BLOCKED.
- **Blockers:**
  - Chromium won't launch in the dev container (11 missing system libraries).
  - The service's declaration and signature page and its on-behalf rule were never seen.
- **Status (2026-10-25):** RESEARCHED and ROUTABLE (disabled). Not BROWSER-TESTED. Activation NOT READY.
- **Evidence:** PR #28 description; commits `998413e0` and `4d29f6ea`.

## Proposed, needs approval before starting

- **M2. One US workflow end to end** (agency and filing type to be chosen with the owner). Blocked on a machine where
  Chromium launches: the worker's Docker image or a CI runner.
- **M3. Approval-card route metadata for non-US forms.** `scripts/filing-coverage.mjs` writes
  `src/forms/filingRoutes.json` from USD forms only, so the card says "you send it" for any non-US route.
- **M4. Billing verification in Stripe test mode.** The earlier claims about the webhook are unverified.
- **M5. Coverage, one agency at a time:** UK, Mexico, the EU, the Middle East. Tibet needs its locality and
  administrative scope clarified first.
- **M6. Signup value display**, using the existing design system.
- **M7. Positioning brief.**
