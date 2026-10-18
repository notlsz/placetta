# SOC 2 readiness

Placetta has no SOC 2 report today, and the trust page says so. A SOC 2 report needs an independent CPA firm to audit us; that's the founder's step. Everything before it is here: the policies, the control matrix that maps every 2017 Trust Services Criterion to the code and the evidence, a script that collects the evidence, and the CI checks an auditor will look for.

On 2026-10-18 the matrix has **78 controls: 17 in place, 37 partial, 24 gaps**. Most partials are things that are built but not live: migrations written and tested but not applied to the database, functions not redeployed, policies not yet approved. Most gaps are the founder's: backups, branch protection, account settings, an auditor.

## What's in this folder

| File | What it is |
| --- | --- |
| [CONTROLS.md](CONTROLS.md) | The control matrix: criterion, control, policy, the files that implement it, the evidence, status, and the fix for each gap (code or founder) |
| [policies/](policies/) | 15 policies, each with an owner, a review cadence and "How we prove it" |
| [RECORDS.md](RECORDS.md) | Templates for the records the policies call for: access reviews, restore tests, incidents, vendor reviews |
| [BRANCH_PROTECTION.md](BRANCH_PROTECTION.md) | The rules for `main` as code (`.github/branch-protection.json`) and how to apply them |
| `scripts/soc2-evidence.mjs` | Collects the evidence into a dated bundle ([Evidence](#evidence) below) |
| `.github/workflows/ci.yml`, `security` job | Secret scan (gitleaks v8.30.1), `npm audit` gate, Dependabot coverage check |
| `.github/CODEOWNERS`, `.github/pull_request_template.md` | Who reviews what, and the security checklist on every pull request |

Related, already in the repo: [docs/AI_RISK_REGISTER.md](../AI_RISK_REGISTER.md) (the AI model inventory and risks), [docs/MIGRATION_DRIFT.md](../MIGRATION_DRIFT.md) (the live migration history against the files), [docs/AI_COSTS.md](../AI_COSTS.md), [site/trust.html](../../site/trust.html), [SETUP.md](../../SETUP.md).

## The founder's checklist, in order

Ordered so the real risks close first (no backups, unreviewed changes to production), then the audit. Times are the founder's hands-on time. Prices were checked on 2026-10-18; each links its source.

| # | Step | Time | Cost | Closes |
| --- | --- | --- | --- | --- |
| 1 | Read and approve the 15 policies: edit what's wrong, then set "Approved" in each header to the date | 1 to 2 days | $0 | CC1, CC3, CC5.3, C1.1a |
| 2 | Merge this branch, so the `security` job runs on every change | 15 minutes | $0 | CC6.8a, CC8.1e, CC8.1f |
| 3 | **Backups.** Supabase Pro, the Small compute size and point-in-time recovery (7 days) | 1 hour | About $130 a month: Pro $25 (includes $10 of compute credit), Small $15, PITR $100 ([pricing](https://supabase.com/pricing.md); PITR needs Small or larger, [backups](https://supabase.com/docs/guides/platform/backups.md)). Pro also keeps 7 days of logs instead of 1 | A1.2a, CC7.2c, CC7.5a |
| 4 | Run the first restore test into a new project ([backup-disaster-recovery.md](policies/backup-disaster-recovery.md#the-quarterly-restore-test)) | Half a day | The throwaway project's compute for a few hours | A1.3a |
| 5 | **Branch protection.** GitHub Pro for the `notlsz` account, or an organization on GitHub Team | 30 minutes | Pro $4 a month; Team $4 per user a month ([Capital and Compute, July 2026](https://capitalandcompute.net/blog/github-pricing-plans-cost/); protected branches on private repositories need Pro or Team, [GitHub plans](https://docs.github.com/enterprise-cloud%40latest/github/getting-started-with-github/githubs-products)) | CC8.1b |
| 6 | Give AI coding agents their own GitHub identity, then apply `.github/branch-protection.json` (the interim version until then) | 1 to 2 hours | $0 for a machine user on Pro | CC8.1b |
| 7 | Add `SUPABASE_ACCESS_TOKEN` as a repository secret so function deploys run from CI; set the Supabase connector in coding sessions to read-only | 30 minutes | $0 | CC8.1c, CC6.3c |
| 8 | Repair the migration history and apply the pending migrations, the security hardening first ([MIGRATION_DRIFT.md](../MIGRATION_DRIFT.md#repair-run-from-the-repo-root-linked-to-the-project)); deploy `agent-run` and `odelia-mail` | Half a day | $0 | CC6.1e, CC6.5a, CC6.6b, CC7.2a, CC7.4a, C1.2a |
| 9 | Turn on Dependabot alerts; merge or close the 10 open Dependabot pull requests | 2 hours | $0 | CC7.1a |
| 10 | **Company identity.** Google Workspace for placetta.com with 2-Step Verification enforced for everyone (or confirm the current email provider enforces it) | 2 hours, more if mail moves | Business Starter $7 a user a month yearly, $8.40 monthly; Business Standard $14 or $16.80 ([Email Vendor Selection, June 2026](https://www.emailvendorselection.com/google-workspace-pricing/)). Enforcement is an Admin console setting; confirm the edition you pick offers it for all users, which Google's page didn't state when checked | CC6.1g |
| 11 | Two-step sign-in (an app or a key) on every admin console; a company password manager with emergency access for a named backup person; record both | 3 hours | The password manager's business plan (not priced here) | CC6.1f, CC9.1a, A1.2c |
| 12 | The first quarterly access review and the first monthly evidence run, with tokens ([Evidence](#evidence)) | 2 hours | $0 | CC6.3b, CC4.1a, CC7.1b |
| 13 | An external uptime check on the site, the app and a function | 30 minutes | Free tiers exist | CC7.2b |
| 14 | Request each always-on vendor's SOC 2 report: Supabase, Vercel, Stripe, Resend, Anthropic, Render | 2 to 4 hours over 1 to 2 weeks | $0, except that Supabase gives its report in the dashboard only on Team ($599 a month) and Enterprise ([pricing](https://supabase.com/pricing.md)), and Render on its Organization tier ([Render](https://render.com/blog/render-iso-27001-and-document-center)): ask each for a copy under NDA first | CC6.4a, CC9.2a |
| 15 | Security training for the founder, then each hire | 2 hours | Free tiers to about $3.50 a user a month list; included in Vanta and Drata ([UnderDefense, May 2026](https://underdefense.com/blog/security-awareness-training-pricing-vendor-comparison-roi/)) | CC1.4b |
| 16 | **Vanta or Drata, or neither.** At one person, with these policies and the evidence script, neither is required; SOC 2 doesn't need a platform. One saves evidence work as the team grows, and some auditors discount their fee for platform customers | A week to set up if chosen | Vanta: $14,000 a year floor on AWS Marketplace for 1 to 20 employees, contract median $20,000 ([soc2auditors.org, October 2026](https://soc2auditors.org/insights/vanta-pricing/)); Drata: about $10,000 to $15,000 a year for 1 to 50 employees ([Knowlee, April 2026](https://www.knowlee.ai/blog/tools/drata-pricing-2026)) | Speed, not a control |
| 17 | **Pick an auditor.** Get quotes from two or three CPA firms that audit startups; ask for Type I now and Type II after a 3-month observation window | 1 to 2 weeks to choose | Type I $7,500 to $15,000, about 1 to 3 months; Type II $12,000 to $20,000, 6 to 12 months including the observation window ([Drata](https://drata.com/learn/soc-2/cost)) | The report |
| 18 | A penetration test before the Type II window | 1 to 2 weeks elapsed | $5,000 to $15,000 ([Drata](https://drata.com/learn/soc-2/cost)) | CC4.1b |
| 19 | From the first hire: background check, confidentiality agreement, training | Per hire | Checkr $29.99, $59.99 or $94.99 a report ([Checkr](https://checkr.com/prices)) | CC1.4a, C1.1c |
| 20 | Decide how long the audit trail is kept after a workspace is deleted; update the Privacy Policy; get counsel to review | 1 hour, plus counsel | Counsel's time | C1.2b |

Steps 1 to 13 are about a week of the founder's time and about $140 a month (Supabase about $130, GitHub Pro $4, Google Workspace $7 a user). A first year with a Type I and a penetration test, without a compliance platform, is roughly $14,000 to $32,000; Drata's own estimate for a startup's first year all-in is $25,000 to $50,000 ([Drata](https://drata.com/learn/soc-2/cost)).

## Code that's done here, and what's left

Done in this folder's branch:

1. The 15 policies, the control matrix, the record templates and the branch protection file.
2. `scripts/soc2-evidence.mjs` and its tests (`scripts/soc2-evidence.test.mjs`), run in CI.
3. The `security` CI job: gitleaks v8.30.1 built from the Go module proxy (checked against sum.golang.org) with a reviewed allowlist (`.github/gitleaks.toml`); `npm audit --omit=dev --audit-level=high` for the app and the filer; `scripts/check-dependabot.mjs`.
4. Dependabot now also watches the filer's Docker image.
5. `CODEOWNERS` and the pull request template with its security checklist.

Code left for later pull requests (each is in the matrix with its ID):

| Change | ID |
| --- | --- |
| Severity and timestamp columns on `public.incidents` | CC7.4a |
| `postgres:17` in the CI database job, matching production (17.11), once the migrations are checked on it | CC8.1g |
| An import map and `deno.lock` for the server functions; Actions pinned to commit SHAs | CC8.1h |
| A `supabase db push` job after CI on `main` | CC8.1d |
| Gemini through Vertex AI instead of the Gemini Developer API | CC9.2b |
| Toast, Square, WeChat and MCP connectors on the trust page's subprocessor list; self-hosted fonts instead of Google Fonts | CC2.3a, CC9.2c |
| A weekly copy of the `documents` bucket and a database dump to a second provider | A1.2b |
| The audit-trail retention rule, once decided, in `purge_expired()` and the Privacy Policy; purges for consent records after 5 years and terms acceptances after 6 | C1.2b |

## Evidence

`scripts/soc2-evidence.mjs` collects what the repo and the founder's own tokens can show, and writes a dated bundle (`evidence.json`, `summary.md` with a "Needs attention" list, and `SHA256SUMS`) to a folder you choose, never inside the repo: the bundle names staff.

```sh
node scripts/soc2-evidence.mjs --dry-run                    # what it would collect; no tokens, no network
GITHUB_TOKEN=... SUPABASE_ACCESS_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/soc2-evidence.mjs --out ~/placetta-evidence   # collect and write
```

Options: `--since 90` (days), `--repo`, `--branch`, `--project-ref`, `--run-tests` (runs the test suites and records their results). Each token is optional: a source without its token is skipped and listed as skipped. Tokens are read from the environment, used only for read-only calls, and the bundle is checked for them before it's saved.

| Token | Make it at | Sources it opens |
| --- | --- | --- |
| `GITHUB_TOKEN` | GitHub, Settings, Developer settings, fine-grained token for this repository only, read-only: Actions, Administration, Contents, Metadata, Pull requests, Dependabot alerts, Secret scanning alerts | `github.repo`, `github.branch_protection` (against `.github/branch-protection.json`), `github.ci_runs`, `github.deploy_runs`, `github.pull_requests`, `github.dependabot_alerts`, `github.secret_scanning`, `github.collaborators` |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens | `supabase.migrations` (live history against the files), `supabase.functions` (deployed against the repo), `supabase.secrets` (names only), `supabase.backups`, `supabase.auth_settings`, `supabase.network`, `supabase.database` (read-only SQL: row-level security per table, scheduled jobs, audit-log triggers, anon grants) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, Project settings, API keys | `supabase.staff` (staff emails and names with two-step status; customers only as totals), `supabase.audit_log` (counts by actor, never content), `supabase.incidents` (counts, no titles) |

The `repo.*` sources need nothing: commits on `main` and how many came through a pull request, migration files, functions and their JWT settings, test suites, the CI jobs, Dependabot coverage, the secret-scan exceptions, policy review dates, the control counts, `security.txt` expiry, `CODEOWNERS`, and `npm audit`.

Run it monthly and before the audit. Keep each bundle, unedited, in the company's evidence folder with the records from [RECORDS.md](RECORDS.md). On 2026-10-18, run with GitHub access only, it flagged: branch protection off (plan), 347 of 349 commits on `main` not through a pull request, 10 of 10 recent function deploy runs passing without deploying, Dependabot alerts off, and 2 of 29 CI runs on `main` failing.
