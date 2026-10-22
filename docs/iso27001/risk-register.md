# Information security risk register (clauses 6.1.2 and 8.2)

| | |
| --- | --- |
| Document | ISMS-5 |
| Version | 0.1 |
| Status | **Draft for approval.** Ratings are proposals; nothing is accepted until the risk owner signs below |
| Owner | Founder (risk owner for every risk below until there are other managers) |
| Assessed | 2026-10-22, by Claude (an AI assistant), with the method in [risk-assessment-methodology.md](risk-assessment-methodology.md) |
| Sources | The company register ([risk-assessment.md](../soc2/policies/risk-assessment.md), C1 to C14, 2026-10-18), the AI register ([AI_RISK_REGISTER.md](../AI_RISK_REGISTER.md), R1 to R8, 2026-10-17), the readiness assessment of 2026-10-21, and the code review done while fixing its gaps on 2026-10-22 (K1 to K13) |
| SOC 2 cross-reference | CC3.2a, CC3.2b, CC5.1a, CC9.1a, CC9.2a |

L and I are likelihood and impact, 1 to 3, before controls. Residual is after the controls in place **in production today**, not what is built in the repo. Treatments for every Medium and High residual are in [risk-treatment-plan.md](risk-treatment-plan.md). Production status was not re-checked against the live project; it is taken from the repo's own records.

## Company risks (from the SOC 2 register, re-rated)

| ID | Risk | L | I | Controls in production | Residual | Decision | Annex A | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C1 | The database is lost or corrupted and can't be restored | 2 | 3 | None live. Off-site backup and drill scripts written and tested on a stand-in, not running | High | Reduce (T1) | 8.13, 8.14, 5.30 | CC7.5a, A1.2a, A1.2b, A1.3a |
| C2 | A bad or malicious change reaches production unreviewed | 3 | 3 | CI on every push (now on Postgres 17.11, actions pinned by SHA, full-tree audit gate) | High | Reduce (T2) | 8.32, 8.4, 5.3 | CC8.1b |
| C3 | An AI coding session changes production directly | 3 | 3 | The founder supervises sessions | High | Reduce (T2, T3) | 8.31, 8.2, 8.18 | CC6.3c, CC8.1c, CC8.1d |
| C4 | The founder's accounts are taken over | 2 | 3 | Not recorded | High until checked | Reduce (T4) | 5.16, 5.17, 8.5 | CC6.1f, CC6.1g |
| C5 | One workspace reads another's data through a row-level security mistake | 1 | 3 | RLS on every table; database tests in CI | Low | Accept | 8.3, 8.29 | CC6.1a |
| C6 | Key-person loss | 2 | 3 | Runbooks in the repo | High | Reduce (T5) | 5.29, 5.30, 5.37 | CC9.1a |
| C7 | A vendor without an attestation mishandles data | 2 | 2 | `vendorOk` limits what each sees; DeepSeek off; Gemini only with `GEMINI_PAID` | Medium | Reduce (T6) | 5.19 to 5.22 | CC9.2b |
| C8 | A secret is committed to the repo | 2 | 3 | gitleaks on every pull request and push | Low | Accept | 8.4, 8.28 | CC8.1f |
| C9 | A known-vulnerable dependency is exploited | 2 | 2 | Audit gate now covers build dependencies too; weekly Dependabot; 10 open Dependabot PRs; alerts off | Medium | Reduce (T7) | 8.8 | CC7.1a |
| C10 | Security controls written but not live give a false sense of safety | 3 | 2 | Trust page labels; evidence bundle lists pending migrations | Medium | Reduce (T3) | 8.9 | CC5.2a, CC7.1b |
| C11 | Platform logs are gone before anyone looks | 3 | 2 | The app's audit trail; 1 day of platform logs | Medium | Reduce (T8) | 8.15, 8.16, 5.28 | CC7.2c |
| C12 | Personal information about people in China leaves China without PIPL notice and consent | 2 | 2 | Privacy Policy China section | Medium | Reduce (T9) | 5.31, 5.34 | CC2.3a |
| C13 | Texting rules (TCPA, 10DLC) | 2 | 2 | Consent kept 5 years; STOP; quiet hours | Low | Accept; finish 10DLC | 5.31 | |
| C14 | Runaway AI or messaging cost from abuse | 2 | 2 | Allowances, caps, rate limits | Low | Accept | 8.6 | A1.1a |

## AI risks (from the AI register)

| ID | Risk | L | I | Residual (AI register) | Decision | Annex A | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Prompt injection from content Odelia reads | 3 | 3 | Low (the approval gate holds) | Accept; keep the tests | 8.26, 8.29 | CC6.6b, CC3.3a |
| R2 | Hallucinated agencies, forms or requirements | 2 | 3 | Medium (a person still has to read what they approve) | Accept with the review step; revisit yearly | 8.26 | CC3.3a |
| R3 | A wrong or unapproved filing, payment or message | 2 | 3 | Low | Accept | 8.26, 5.15 | CC3.3a, CC6.3a |
| R4 | Data leakage to model vendors | 2 | 3 | Medium until the backup vendors' terms are confirmed | Reduce (T6) | 5.19 to 5.21, 8.12 | CC6.7b, CC9.2d |
| R5 | Data leakage between workspaces through shared learning | 1 | 3 | Low | Accept | 8.11, 8.12 | C1.1b |
| R6 | Secrets and credentials exposed through the model | 1 | 3 | Low; the audit-order gap is fixed in code (K4) | Accept once K4 is live | 8.11, 5.17 | CC6.1d |
| R7 | Runaway cost or abuse of the model | 2 | 2 | Low | Accept | 8.6 | A1.1a |
| R8 | A job called done that isn't | 2 | 2 | Low | Accept | 8.26 | |

## Risks found in the code review of 2026-10-22

| ID | Risk | L | I | Controls in production | Residual | Decision | Annex A | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K1 | A logical restore without grants, or onto Supabase's default privileges, quietly reopens revoked tables and functions to signed-in users. Found while building the restore drill: the first test restore passed every row count but let any signed-in user call internal functions | 2 | 3 | None live; `scripts/db-backup.sh` and `restore-test.sh` now keep every grant and restore onto Postgres's own defaults, and the drill runs the database tests on the copy | Low once the drill runs | Reduce (T1) | 8.13, 8.9 | A1.3a |
| K2 | A Supabase "restore to a new project" starts its `pg_cron` and `pg_net` jobs at once (Supabase's documentation says they can't be paused), and Placetta's jobs call production's functions with production's keys: a drill could send real texts or file twice | 2 | 3 | None | Medium | Reduce (T1): unschedule jobs the moment the copy is up; later, jobs that check they run on the production project | 8.31, 5.30 | A1.3a |
| K3 | The portal filer holds the service role key, which bypasses all row-level security, on a host whose SOC 2 report isn't available on our plan | 2 | 3 | The filer runs one job at a time with per-run browser isolation | High | Reduce (T10) | 8.2, 8.18, 5.15 | CC6.3 |
| K4 | The filer read a saved password before writing its audit entry, and ignored a failed audit write | 1 | 3 | None live; fixed in code (`filer_open_login` audits first, in one transaction) | Medium until deployed | Reduce (T10) | 8.15, 5.17 | CC6.1d, CC7.2d |
| K5 | Public statements ahead of production. The trust page, landing and help pages were corrected on 2026-10-22; the Privacy Policy and Terms still say owners can "export the audit trail in Settings" (needs the enterprise migration) and that the AI models processing customer data "are bound not to train on it" (not confirmed in writing for the backup vendors) | 2 | 2 | Trust page labels | Medium | Reduce (T11) | 5.31, 5.34 | CC2.3a, CC1.1b |
| K6 | The deploy workflow's Supabase token is a personal access token that reaches every project in the founder's Supabase organization | 2 | 3 | Stored as a repository secret only | Medium | Reduce (T2): a token for one project if Supabase offers it, or a separate organization for production | 8.2, 8.18 | CC8.1c |
| K7 | Supply chain: the server functions' npm dependencies below supabase-js can move between deploys (no `deno.lock`); the functions' one direct import is now exact, and every Action is pinned to a commit | 2 | 2 | Exact versions for direct imports | Low | Reduce later (T7) | 5.21, 8.28 | CC8.1h |
| K8 | CI tested a different Postgres major than production | 1 | 2 | Fixed: CI runs 17.11; all database checks pass on it | Low | Closed | 8.31 | CC8.1g |
| K9 | One Supabase project in one region: a regional or account outage stops everything | 1 | 3 | Model failover only | Medium | Accept with the off-site copy (T1) and a written recovery plan; revisit when an enterprise contract needs an availability commitment | 8.14, 5.30 | A1.2 |
| K10 | Live-only schema (the `autopilot` table, the `official-forms` bucket) isn't in the migrations, so a rebuild from code is incomplete and `db push` stops | 3 | 2 | Documented in MIGRATION_DRIFT.md | Medium | Reduce (T3) | 8.9, 8.32 | CC5.2a |
| K11 | The off-site backup and log copies put customer data at a second provider; losing the age key makes them useless, a stolen key exposes them | 1 | 3 | None live | Low once set up | Accept with controls in the runbook: key offline in two places, put-only upload keys, object lock | 8.24, 5.17 | A1.2b |
| K12 | The ISMS and the SOC 2 program have no authority: no policy or ISMS document is approved | 3 | 2 | None | High (for certification and for any audit opinion) | Reduce (T12) | 5.1, 5.4 | CC5.3a |
| K13 | The founder's devices hold code, sessions and the evidence folder with no recorded protection | 2 | 3 | Not recorded | Medium | Reduce (T13) | 8.1, 7.7 to 7.10, 7.14 | CC6.8b |

## Opportunities

| ID | Opportunity | Benefit | Decision at the management review |
| --- | --- | --- | --- |
| O1 | A compliance platform (Vanta, Drata) | Automates evidence collection and vendor tracking as the team grows | |
| O2 | Supabase Team plan | The Supabase SOC 2 report in the dashboard, 28 days of logs, SSO to the dashboard | |
| O3 | A Supabase log drain instead of the hourly export | No gaps, streaming; $60 a month per drain | |
| O4 | Moving the filer to a host whose SOC 2 report covers our plan | Closes the Render report gap | |

## Approval and risk acceptance

Accepted residual risks (decision "Accept" above): C5, C8, C13, C14, R1, R2, R3, R5, R6 (after K4), R7, R8, K9, K11. Under the acceptance criteria, R2 and K9 are Medium and need a review date no later than 6 months after approval.

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Risk owner and top management (founder) | | | | |
