# Secure Development Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Everything in the repository, whoever or whatever writes it, AI coding agents included |
| Review | Every 12 months, and when CI or the toolchain changes |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Design

1. Nothing Odelia does files, pays, sends or deletes without an owner's approval; the agent has no tool that does it ([AI risk register](../../AI_RISK_REGISTER.md), R3).
2. Content Odelia reads (documents, email, web pages, messages) is data, never instructions; remote channels can't change facts or act (R1).
3. New tables have row-level security and policies; new database objects get no API grants unless a migration grants them; `security definer` functions fix `search_path` and revoke `public` and `anon`.
4. Server functions check the caller (session, signature or key) before they read or write; each `verify_jwt = false` in `supabase/config.toml` says what the function checks instead.
5. Secrets never go in the repo, a prompt or a log. The browser gets only the publishable key.

## Gates every change passes (CI, `.github/workflows/ci.yml`)

| Job | What it checks |
| --- | --- |
| `app` | TypeScript types; plain words in the interface; the agent, extreme, live-eval harness, planning, preflight, flow and channel tests; the production build |
| `functions` | Every server function type-checked with Deno; every `*_test.ts` and `*.test.ts` under `supabase/functions` |
| `database` | Every migration applied to a fresh Postgres, then the database tests (`supabase/tests`): row-level security, grants, the audit log, retention, billing, filings |
| `security` | No secrets in the commits (gitleaks v8.30.1, config `.github/gitleaks.toml`); no high or critical advisory in production npm dependencies (`npm audit --omit=dev --audit-level=high`, for the app and `worker/filer`); Dependabot watches every manifest (`scripts/check-dependabot.mjs`); the evidence collector's own tests |

The `security` job scans a pull request's own commits, and on a push to `main` what the push added. Run it by hand (Actions, CI, Run workflow) to scan the whole history: on 2026-10-18 that was 384 commits in under 10 minutes, with no leaks once the documented exceptions were applied. Each exception in `.github/gitleaks.toml` says why: test fixtures, generated bundles whose sources are scanned, and keys that are public by design.

Security behaviour has its own tests: `scripts/extreme-test.ts` runs the real agent loop against a model that misbehaves on purpose (approvals, made-up ids, planted instructions, SSNs, remote channels, limits, races, model routes, connected apps, memory), and `supabase/tests/hardening.sql` checks the October audit's fixes.

## Review

Every change comes through a pull request with the security checklist in `.github/pull_request_template.md`, approved by someone other than its author ([change-management.md](change-management.md)). For AI-written code, the reviewer reads the diff, not the agent's summary of it.

## Dependencies

1. Lockfiles are committed (`package-lock.json`, `worker/filer/package-lock.json`) and CI installs with `npm ci`.
2. Dependabot opens weekly update pull requests for npm (the app and the filer), the filer's Docker image and the GitHub Actions. Merge them within 14 days, or close them with a reason.
3. A new dependency needs a reason in the pull request: what it does, that it's maintained, and that nothing already in the repo does it.

## Known gaps

| Gap | Fix | Who |
| --- | --- | --- |
| Server functions import `npm:@supabase/supabase-js@2`, a moving major version, with no lockfile, so what deploys can differ from what CI tested | An import map with exact versions and a committed `deno.lock` | Code |
| GitHub Actions are pinned to major tags (`@v4`), which their owners can move | Pin to commit SHAs; Dependabot keeps them current | Code |
| CI tests migrations on Postgres 15; production runs Postgres 17 (17.11, checked 2026-10-18) | Change the `database` job's image to `postgres:17` | Code |
| Ten Dependabot pull requests opened 2026-10-16 are still open, and Dependabot alerts are switched off for the repo (GitHub API, 2026-10-18) | Merge or close them; turn on Dependabot alerts in the repo's security settings | Founder |
| GitHub's own secret scanning and push protection aren't available on this plan for a private repository; gitleaks in CI is what scans | Keep gitleaks; add GitHub Secret Protection ($19 per active committer a month) only if push-time blocking is wanted | Founder decision |

## AI coding agents

1. They commit as `Claude <noreply@anthropic.com>` and work on their own branches.
2. Their sessions get no production secrets, and the Supabase connector read-only ([access-control.md](access-control.md)).
3. What they produce is reviewed like anyone's code, and the same CI gates apply.

## How we prove it

1. CI run history (`github.ci_runs` in the evidence bundle) and the workflow file.
2. The secret-scan config with its exceptions (`repo.secret_scan`), the Dependabot check (`repo.dependabot`) and `npm audit` results (`repo.npm_audit`).
3. Dependabot pull requests opened, merged and how long they stayed open (`github.pull_requests`).
4. Pull requests with the checklist filled and an approval.
