# Change Management Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Code, database migrations, server function deploys, hosting settings and secrets for Placetta |
| Review | Every 12 months, and when the deploy path changes |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Where we are today (2026-10-18)

Be plain about it, because an auditor will read the history:

1. **Changes go straight to `main`.** Of 349 first-parent commits on `main` from the repo's start on 2026-10-07 to 2026-10-18 05:00 UTC, 2 came through a pull request. The rest were pushed or merged from AI coding sessions' worktree branches without a pull request or a second person's review. 391 of 393 commits in the history are authored `Claude <noreply@anthropic.com>`. The 3 pull requests that were merged had no approval from anyone but their author.
2. **`main` isn't protected.** GitHub answers the branch protection and rulesets API for this private repository with "Upgrade to GitHub Pro or make this repository public to enable this feature." (checked 2026-10-18).
3. **CI runs on every push and pull request** (`.github/workflows/ci.yml`), but nothing stops a merge when it fails. CI history starts 2026-10-16: by 2026-10-18 05:00 UTC, 42 runs, 32 passed, 9 failed, 1 cancelled; on pushes to `main`, 26 of 29 passed.
4. **Function deploys skip CI.** `deploy-functions.yml` runs after CI passes on `main`, but the repository has no `SUPABASE_ACCESS_TOKEN` secret, so its deploy steps are skipped and the run still reports success. Functions are deployed by hand: the last deploy of any function was 2026-10-16 08:16 UTC while `main` kept changing, and `odelia-mail` has never been deployed.
5. **Migrations are applied by hand**, from the dashboard or an AI session's Supabase connector, and recorded under the time they ran ([docs/MIGRATION_DRIFT.md](../../MIGRATION_DRIFT.md)). On 2026-10-18 the live history ends at `20261016080000_chat_bots` plus two live-only entries (`rate_hits_probe`, `rate_hits_rls`); every file from `20261016110000_network_learning` on, the security hardening among them, is not applied.
6. **Vercel builds the site and app from the repo** (`vercel.json`). If its Git integration deploys every push to `main` (to confirm in the Vercel project settings), it does so whether or not CI passed.

## The rule

1. Every change to `main` arrives through a pull request.
2. The pull request uses the template (`.github/pull_request_template.md`) and its security checklist.
3. All four CI jobs pass before it merges: `app`, `functions`, `database`, `security`.
4. Someone other than the author approves it. AI agents open pull requests; a person approves them. Approval from the person who opened the pull request doesn't count, and GitHub won't allow it.
5. Code owners (`.github/CODEOWNERS`) review changes to migrations, server functions, CI, hosting headers, legal text and these policies.
6. Migrations and function deploys ship from `main` after CI, not from a laptop or a coding session.
7. Secrets and hosting settings changed in a console are recorded the same day: what, why, who, in the pull request they go with or in the change log ([RECORDS.md](../RECORDS.md#console-changes)).

## The fix, in order

| Step | Who | What it closes |
| --- | --- | --- |
| 1. Put the repo on a plan with branch protection for private repositories: GitHub Pro for the personal account ($4 a month) or an organization on GitHub Team ($4 per user a month) | Founder | Item 2 |
| 2. Give AI agents their own GitHub identity (a machine user or a GitHub App) so the founder can approve their pull requests | Founder | Item 1: the author and the approver differ |
| 3. Apply `.github/branch-protection.json` ([BRANCH_PROTECTION.md](../BRANCH_PROTECTION.md)) | Founder | Items 1, 2, 3 and 6 (Vercel then only ever sees commits that passed CI) |
| 4. Add `SUPABASE_ACCESS_TOKEN` as a repository secret so `deploy-functions.yml` deploys | Founder | Item 4 |
| 5. Repair the migration history ([MIGRATION_DRIFT.md](../../MIGRATION_DRIFT.md), "Repair"), apply the pending files, then add a `supabase db push` job after CI on `main` | Founder, then code | Item 5 |
| 6. Set the Supabase connector in coding sessions to read-only | Founder | Items 4 and 5 |

Until step 3 is done, the interim rule is: AI sessions work on branches and the founder merges, after reading the diff and seeing CI pass on the branch. The evidence bundle counts every commit on `main` that didn't come through a pull request, so the gap stays visible.

## Emergency changes

When customers are exposed or the service is down, the founder may change production directly (a hotfix push, a console setting, a manual deploy). Within one business day: open a pull request with the same change, link the incident in the incident log, and note it in the change log. CI must pass on that pull request.

## How we prove it

1. Branch protection settings, compared with `.github/branch-protection.json` by the evidence script (`github.branch_protection`).
2. Commits on `main` in the window, and how many came through a pull request (`repo.git_main`); merged pull requests and their approvals (`github.pull_requests`).
3. CI run history with every failure (`github.ci_runs`), and whether each function deploy run deployed (`github.deploy_runs`).
4. The live migration history and deployed functions against the repo (`supabase.migrations`, `supabase.functions`).
5. Emergency change records in the incident log.
