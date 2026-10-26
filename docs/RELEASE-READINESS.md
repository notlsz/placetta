# Release readiness: PR #28 (M8, 2026-10-25)

**Recommendation: NO-GO to merge now.**
- CI cannot run, so the branch protection's required checks can't pass.
- Billing hasn't been verified against Stripe.

Everything else on the branch is either tested locally or switched off. Nothing has been merged or deployed.

## The PR

- **What:** PR #28, `cline/placetta-integration` into `main`. It contains current `main` and GitHub reports it
  MERGEABLE.
- **Changes:**
  - **gb-food:** a destination, switched off.
  - **Portal worker:** the page-scoped opener, and the teach-mode scan fix.
  - **ca-llc-5:** fixture tests.
  - **Approval cards** for forms abroad (M3).
  - **Webhook fixes** (M4).
  - **Plan card line** (M6).
  - **Docs:** the backlog and this brief.
- **No database migrations.**

## Required CI: not run (BLOCKED)

- **Result:** every job on the PR (app, database, eval, functions, security, tenancy) failed in 1 to 2 seconds with
  no steps run.
- **Cause:** GitHub's annotation: "The job was not started because recent account payments have failed or your
  spending limit needs to be increased."
- **Not specific to this PR:** `main`'s own runs at `8695ccd3` fail the same way.
- **Vercel's preview build:** reported separately by the Vercel app, which isn't one of the jobs that couldn't start.
  At `5f378a02` it passed ("Deployment has completed"). It's a preview, not production. The preview page wasn't
  opened.

## Local evidence (this branch)

| Check | Result |
|---|---|
| Deno server tests | 525 passed, 0 failed |
| `deno check` on all 23 server functions | pass (at M1; the changed functions re-checked at M3 and M4) |
| `test:agent` | 1924 passed, 0 failed |
| Worker suite in its Docker image | 101 passed, 0 failed, 0 skipped, three runs in a row (at M2; the worker hasn't changed since) |
| Teach-mode red-team tests alone | 30/30 over 10 runs |
| `tsc -b`, `plain-words`, `test:home`, `filing-coverage --check`, `test:markets` | pass |
| Full `npm run build` and `test:leak` | pass (last at M6) |

**Not run here:**
- The database tests (no Postgres here; CI runs them).
- The tenancy and e2e suites.
- The eval job.
- A browser visual pass of the new card and plan lines.

## What blocks release

1. **CI can't run.** This is a GitHub billing issue the owner must fix, and the branch protection requires these
   jobs.
2. **Billing isn't verified against Stripe.** The webhook changes (the pack credit order, fulfilling delayed
   payments) ship live as soon as the functions deploy. They're tested on synthetic events only. A Stripe test-mode
   run is needed first.

## What only limits a switched-off feature

These don't block release:
- **gb-food:**
  - The declaration and on-behalf rules haven't been seen live.
  - It stays out of `FILER_AGENCIES`.
  - The card says the owner submits it.
- **ca-llc-5 and the other playbooks:** never run live, and they stay `verified: null`.
- **M5 coverage:** waiting on scope.
- **Tibet:** scope unclear.

## What ships if merged, and where

| Component | Target | Triggered how |
|---|---|---|
| App and site | Vercel (`vercel.json`, `npm run build`) | Vercel's Git integration on `main` (assumed from the Vercel checks on the PR; not inspected) |
| Server functions (`file`, `stripe-webhook`, `billing`, …) | Supabase project `esquxzcfsylffuijvzec` | `deploy-functions.yml` after CI passes on `main`, so blocked while CI can't run |
| Portal worker | Render `placetta-filer` (`render.yaml`, `autoDeploy`) | When `worker/filer/**` or `destinations.ts` changes. Render's branch setting wasn't inspected; confirm it's `main` |

**Stays switched off:**
- No change to `FILER_AGENCIES`, `FILER_CHANNELS`, `FILER_TWO_KEY` or `FILER_ALLOW_UNVERIFIED`.
- gb-food stays off.
- No playbook becomes verified.

**Configuration:**
- **None required to deploy.**
- **The new webhook events:** to receive `checkout.session.async_payment_succeeded` and `async_payment_failed`, the
  Stripe endpoint's event list must include them. An endpoint Placetta made earlier keeps its old list, so this needs
  a Stripe dashboard change (separate approval). Until then the webhook behaves as before for card payments.

## Rollback

- **App:** redeploy the previous Vercel deployment, or revert the merge commit.
- **Functions:** revert, then run `deploy-functions` (or `supabase functions deploy` from the previous commit).
- **Worker:** redeploy the previous Render build.
- **Data:** there are no migrations, so there's no data to roll back. Webhook events already applied stay applied.
  - That is the same as today, except that delayed-payment checkouts may have been fulfilled. That's correct
    behaviour, and it's recorded in `stripe_events` and the audit log.

## Approval requested (none done)

To go, the owner needs to:
1. Fix GitHub Actions billing.
2. Let CI run green on PR #28.
3. Provide Stripe test-mode access and approve one test-mode run of the webhook.
4. Then approve these exact actions: merge PR #28 into `main` (squash or merge commit), then let Vercel,
   `deploy-functions` and Render deploy from `main`. No flag changes.
