# Control matrix: the 2017 Trust Services Criteria

Maps the AICPA's 2017 Trust Services Criteria (common criteria CC1 to CC9, plus Availability A1 and Confidentiality C1) to Placetta's controls: the policy, what implements it (with file references), the evidence an auditor gets, and its status on 2026-10-18.

**Status** means:

1. **In place**: works in production today, and the evidence exists or the evidence script collects it.
2. **Partial**: built or written but not live yet (a migration not applied, a function not deployed, a branch not merged, a policy not approved), or live without its evidence.
3. **Gap**: not done.

**Fix** says what closes it and whose step it is: **Code** (a change in this repo) or **Founder** (an account, a purchase, a setting, a decision). "Merge" means merging the branch that adds this folder, after which the security job runs on every change.

The evidence script (`node scripts/soc2-evidence.mjs`) collects the sources named `repo.*`, `github.*` and `supabase.*` below; [README.md](README.md#evidence) says what each needs.

## CC1 Control environment

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC1.1a | CC1.1 Integrity and ethical values | Written security principles and acceptable use, acknowledged by each person at start and yearly | [information-security](policies/information-security.md), [acceptable-use](policies/acceptable-use.md) | `docs/soc2/policies` | Signed acknowledgments | Partial | Founder: approve the policies and sign the acknowledgment |
| CC1.1b | CC1.1 | Public claims say what is true: every trust-page control is labelled In place, Rolling out or In progress; no certification claimed before a report exists | [information-security](policies/information-security.md) | `site/trust.html`, `SETUP.md` ("Before the first paying customer") | The trust page and its history | In place | |
| CC1.2a | CC1.2 Oversight independent of management | A quarterly security update to the board or an outside advisor, minuted | [information-security](policies/information-security.md) | | Minutes | Gap | Founder: put it on the investor or advisor update, with this matrix's gap count |
| CC1.3a | CC1.3 Structures, reporting lines, responsibilities | Roles: founder as security lead, staff, AI coding agents as tools, customers as approvers | [information-security](policies/information-security.md#roles) | | The approved policy | Partial | Founder: approve |
| CC1.4a | CC1.4 Competent people | Background checks before access to customer data | [personnel-security](policies/personnel-security.md) | | Check results | Gap | Founder: from the first hire ($29.99 to $94.99 a report at Checkr) |
| CC1.4b | CC1.4 | Security training at start and yearly, everyone including the founder | [personnel-security](policies/personnel-security.md#security-training) | | Certificates | Gap | Founder: pick a course and complete it |
| CC1.5a | CC1.5 Accountability | Every action is attributed (audit trail actor and person); enforcement written; access reviewed quarterly | [information-security](policies/information-security.md#enforcement), [access-control](policies/access-control.md) | `audit_log.actor`, `actor_id` | `supabase.audit_log` | Partial | Founder: run the first access review |

## CC2 Communication and information

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC2.1a | CC2.1 Relevant, quality information | The audit trail, AI events, agent runs, CI history and the monthly evidence bundle feed the controls | [logging-monitoring](policies/logging-monitoring.md) | `audit_log`, `ai_events`, `agent_runs`, `scripts/soc2-evidence.mjs` | Evidence bundles | Partial | Founder: run the script monthly with tokens |
| CC2.2a | CC2.2 Internal communication | Policies in the repo; the Monday agent health summary emailed to every staff address; team tasks | [logging-monitoring](policies/logging-monitoring.md) | `supabase/functions/monitor/governance.ts`, `20261017210300_agent_health.sql` | Governance emails, `governance_reports` | Partial | Founder: apply the migration and deploy `monitor` |
| CC2.3a | CC2.3 External communication | Trust page with subprocessors, Privacy Policy, Terms, the public incident log | [vendor-management](policies/vendor-management.md) | `site/trust.html`, `legal/`, `site/incidents.js` | The pages | Partial | Code: add Toast, Square, WeChat and MCP connectors to the subprocessor list; fix the Privacy Policy's audit-trail retention (C1.2b) |
| CC2.3b | CC2.3 | A way to report vulnerabilities, with safe harbour | [vulnerability-management](policies/vulnerability-management.md#disclosure) | `site/.well-known/security.txt`, `site/trust.html#report` | `repo.security_txt` | In place | Renew `security.txt` before 2027-10-16 |

## CC3 Risk assessment

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC3.1a | CC3.1 Objectives | Security objectives stated: approvals before action, recovery targets, fix deadlines | [information-security](policies/information-security.md#principles), [backup-disaster-recovery](policies/backup-disaster-recovery.md#recovery-targets), [vulnerability-management](policies/vulnerability-management.md#how-fast-we-fix-them) | | The approved policies | Partial | Founder: approve |
| CC3.2a | CC3.2 Identify and analyze risk | Company risk register with likelihood, impact, controls, decision | [risk-assessment](policies/risk-assessment.md#company-risk-register-2026-10-18) | | The register | Partial | Founder: review and sign the accepted risks |
| CC3.2b | CC3.2 | AI model inventory and risk register: every model, what it sees, eight risks with the code that controls each | [risk-assessment](policies/risk-assessment.md#the-two-registers) | `docs/AI_RISK_REGISTER.md` | The register, dated 2026-10-17 | In place | Its own listed gaps stay open (OpenRouter account settings, Groq retention) |
| CC3.3a | CC3.3 Fraud | Owners approve every filing, payment and message; a second owner above a set amount; Placetta never moves money; forged or remote requests can't act | [risk-assessment](policies/risk-assessment.md), [acceptable-use](policies/acceptable-use.md#email-and-messages) | `supabase/functions/spend`, `src/spend.ts`, `src/serverRun.ts` (`channelRefuses`), filings RLS | `scripts/extreme-test.ts` sections 1, 6 | In place | |
| CC3.4a | CC3.4 Changes that affect risk | A new vendor, model or tool triggers the vendor table and AI register update, asked in every pull request | [risk-assessment](policies/risk-assessment.md), [vendor-management](policies/vendor-management.md#rules) | `.github/pull_request_template.md` | Pull requests | Partial | Founder: route changes through pull requests (CC8.1b) |

## CC4 Monitoring activities

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC4.1a | CC4.1 Ongoing and separate evaluations | CI on every change; a monthly evidence bundle with a "needs attention" list; the quarterly access review | [logging-monitoring](policies/logging-monitoring.md#review) | `.github/workflows/ci.yml`, `scripts/soc2-evidence.mjs` | Bundles, monthly records | Partial | Founder: start the monthly run |
| CC4.1b | CC4.1 | An outside penetration test | [vulnerability-management](policies/vulnerability-management.md) | | The report | Gap | Founder: $5,000 to $15,000, before the Type II window |
| CC4.2a | CC4.2 Communicate deficiencies | Gaps tracked here to closure; incident actions become pull requests | [information-security](policies/information-security.md) | `docs/soc2/CONTROLS.md` | This file's history, `repo.controls` | Partial | Founder: review this matrix monthly |

## CC5 Control activities

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC5.1a | CC5.1 Controls that mitigate risks | Each AI risk names its controls in code; each company risk names its decision | [risk-assessment](policies/risk-assessment.md) | Both registers | The registers | Partial | Founder: approve the company register |
| CC5.2a | CC5.2 Technology general controls | Configuration as code: `vercel.json` (headers), `supabase/config.toml` (JWT per function), `render.yaml`, `.github/branch-protection.json`, migrations | [secure-development](policies/secure-development.md) | Those files | Git history | Partial | Founder: apply branch protection (CC8.1b) |
| CC5.3a | CC5.3 Policies and procedures | Policies approved, given to staff, reviewed yearly; overdue reviews flagged | [information-security](policies/information-security.md) | `docs/soc2/policies` | `repo.policies` | Partial | Founder: approve and date each policy |

## CC6 Logical and physical access

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC6.1a | CC6.1 Logical access security | Row-level security on every workspace table (`is_member`, `is_owner`, `is_staff`) | [access-control](policies/access-control.md) | `20261005040308_placetta_app.sql`, `20261005085958_two_step_helpers.sql` and later | `supabase/tests/teams.sql` in CI; `supabase.database` (every public table) | In place | |
| CC6.1b | CC6.1 | Staff reach customer records and saved logins only with two-step sign-in, in the database and in every function | [access-control](policies/access-control.md#staff) | `is_staff()` (`20261005085958_two_step_helpers.sql`), `supabase/functions/logins/shared.ts` | Database tests; `supabase.staff` | In place | |
| CC6.1c | CC6.1 | Customers can turn on two-step sign-in (then required for everything) and a settings PIN | [access-control](policies/access-control.md#customers-in-the-app) | `mfa_ok()`, `pin_*` functions | Database tests; `supabase.auth_settings` | In place | |
| CC6.1d | CC6.1 | Customer credentials in Supabase Vault, readable only by the server | [encryption](policies/encryption.md#at-rest) | `vault_put`, `vault_get` (`20261005042601_integrations_logins_fees.sql`) | Grants in the migration; `supabase/tests/hardening.sql` | In place | |
| CC6.1e | CC6.1 | No API grants by default on new objects; server-only tables without grants; every `security definer` function with a fixed `search_path` | [access-control](policies/access-control.md#least-privilege-for-keys-and-services) | `20261016114500_security_hardening.sql` (M2), `20261007193000_tighten_grants.sql` | `supabase/tests/hardening.sql`; `supabase.database` (anon grants) | Partial | Founder: apply the hardening migration |
| CC6.1f | CC6.1 | Two-step sign-in with an app or key on every admin console | [access-control](policies/access-control.md#admin-consoles) | | Access review record | Gap | Founder: check each console and record it |
| CC6.1g | CC6.1 | Company email and identity with two-step enforced for everyone | [acceptable-use](policies/acceptable-use.md#accounts) | | Admin console screenshot | Gap | Founder: Google Workspace (Business Starter $7 a user a month on a yearly plan) with 2-Step Verification enforced, or confirm the current provider enforces it |
| CC6.2a | CC6.2 Register and remove users | Staff added by a recorded change; removed the same day they leave | [personnel-security](policies/personnel-security.md) | `public.staff_emails` | Onboarding and offboarding records | Partial | Founder: use the records from the first hire |
| CC6.2b | CC6.2 | Invites are claimed only by a verified email; a Microsoft-only account can't claim one | [access-control](policies/access-control.md#customers-in-the-app) | `accept_invites()` (`20261005090055_team_invite_functions.sql`), `supabase/functions/team` | `supabase/tests/teams.sql` ("microsoft-only account cannot claim invite") | In place | |
| CC6.3a | CC6.3 Role-based, least privilege | Owners vs members: only owners file, pay, send, connect apps, see sales and staff | [access-control](policies/access-control.md) | Filings RLS, `supabase/functions/spend`, `integrations` (`OWNER_ONLY`) | `scripts/extreme-test.ts` section 1; `supabase/tests/teams.sql` | In place | |
| CC6.3b | CC6.3 | Quarterly access review of staff, GitHub, consoles and secrets | [access-control](policies/access-control.md#the-quarterly-access-review) | `scripts/soc2-evidence.mjs` (`supabase.staff`, `github.collaborators`, `supabase.secrets`) | Access review records | Gap | Founder: the first review |
| CC6.3c | CC6.3 | AI coding sessions without production write access | [access-control](policies/access-control.md#ai-coding-agents-and-production) | | Connector settings | Gap | Founder: set the Supabase connector to read-only |
| CC6.4a | CC6.4 Physical access | Carved out: no office or servers of our own; Supabase (AWS), Vercel and Render run the data centers | [vendor-management](policies/vendor-management.md) | | The vendors' SOC 2 reports | Partial | Founder: obtain the reports (Supabase's needs the Team plan or a request to Supabase) |
| CC6.5a | CC6.5 Disposal | Account and document deletion; vault secrets dropped with their rows; daily purge | [data-classification-retention](policies/data-classification-retention.md) | `20261012200000_account_deletion.sql`; H1 and M6 in `20261016114500_security_hardening.sql`; `20261017140000_mcp_connectors.sql` | `supabase/tests/hardening.sql` | Partial | Founder: apply the hardening and MCP migrations |
| CC6.6a | CC6.6 Threats from outside | CSP, HSTS, no framing; webhook signatures; JWT checks per function; rate limits | [encryption](policies/encryption.md#in-transit), [secure-development](policies/secure-development.md) | `vercel.json`, `supabase/config.toml`, `_shared/bots.ts`, `linq.ts`, `whatsapp.ts`, `wechat.ts`, `20261016130000_rate_hits.sql` | Function tests in CI | In place | |
| CC6.6b | CC6.6 | Remote channels can't change facts or act; forged email can't start work (DKIM) | [AI risk register](../AI_RISK_REGISTER.md) R1 | `src/serverRun.ts` (`channelRefuses`, `guardPatch`), `_shared/dkim.ts`, `odelia-mail` | `scripts/extreme-test.ts` section 6; `supabase.functions` | Partial | Founder: deploy `agent-run` and `odelia-mail` (never deployed), or add `SUPABASE_ACCESS_TOKEN` so CI deploys |
| CC6.7a | CC6.7 Transmission | HTTPS everywhere; HSTS with preload | [encryption](policies/encryption.md#in-transit) | `vercel.json` | A yearly TLS scan | In place | |
| CC6.7b | CC6.7 | What each AI vendor may see: no files to the backups or DeepSeek; Gemini only on its paid tier | [vendor-management](policies/vendor-management.md) | `supabase/functions/_shared/llm.ts` (`vendorOk`) | `_shared/llm.test.ts`; `scripts/extreme-test.ts` section 12 | In place | |
| CC6.7c | CC6.7 | Direct database connections must use TLS | [encryption](policies/encryption.md#in-transit) | Supabase setting | `supabase.network` | Partial | Founder: confirm SSL enforcement is on (not yet checked) |
| CC6.8a | CC6.8 Malicious software | Dependency audit gate, secret scan and Dependabot coverage check in CI; uploads limited to PDFs, images and office files | [vulnerability-management](policies/vulnerability-management.md), [secure-development](policies/secure-development.md) | `.github/workflows/ci.yml` (`security`), `.github/gitleaks.toml`, `scripts/check-dependabot.mjs`; bucket types in `20261016114500_security_hardening.sql` | CI runs; `repo.ci_config` | Partial | Merge; Founder: apply the hardening migration |
| CC6.8b | CC6.8 | Work devices: disk encryption, screen lock, automatic updates | [acceptable-use](policies/acceptable-use.md#devices) | | Device screenshots | Gap | Founder: record the founder's devices |

## CC7 System operations

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC7.1a | CC7.1 Detect vulnerabilities and configuration changes | `npm audit` gate, weekly Dependabot updates, Dependabot alerts, monthly Supabase advisors | [vulnerability-management](policies/vulnerability-management.md) | `.github/dependabot.yml`, `ci.yml` | `repo.npm_audit`, `github.pull_requests`, `github.dependabot_alerts` | Partial | Founder: turn on Dependabot alerts (off); merge or close the 10 open Dependabot pull requests |
| CC7.1b | CC7.1 | Drift detection: live migrations, deployed functions and branch protection against the repo | [change-management](policies/change-management.md) | `scripts/soc2-evidence.mjs`, `docs/MIGRATION_DRIFT.md` | `supabase.migrations`, `supabase.functions`, `github.branch_protection` | Partial | Founder: run it monthly with tokens |
| CC7.2a | CC7.2 Monitor for anomalies | Daily monitor, agent watchdog, AI throttle sweep, line health, the weekly governance summary | [logging-monitoring](policies/logging-monitoring.md#what-watches) | pg_cron jobs in the migrations; `supabase/functions/monitor` | `supabase.database` (scheduled jobs) | Partial | Founder: apply `20261016160000_ai_routing_margin.sql` and `20261017210300_agent_health.sql` |
| CC7.2b | CC7.2 | External uptime monitoring with alerts | [logging-monitoring](policies/logging-monitoring.md#what-watches) | | Monitor history | Gap | Founder: a free uptime check on the site, the app and a function |
| CC7.2c | CC7.2 | Platform logs kept long enough to investigate | [logging-monitoring](policies/logging-monitoring.md#what-we-record) | Supabase plan | | Gap | Founder: Supabase Pro (7 days); Team for 28 |
| CC7.3a | CC7.3 Evaluate events | Severity levels and timelines | [incident-response](policies/incident-response.md#severity) | | Incident entries | Partial | Founder: approve |
| CC7.4a | CC7.4 Respond | The incident log, kept by staff with two-step, public entries on the trust page | [incident-response](policies/incident-response.md#the-incident-log) | `public.incidents`, `incident_add` (`20261017210300_agent_health.sql`), `site/incidents.js` | `supabase.incidents` | Partial | Founder: apply the migration; Code: add severity and timestamp columns |
| CC7.4b | CC7.4 | Containment switches for filing, payments, AI and accounts | [incident-response](policies/incident-response.md#steps) | `FILER_*` secrets (`supabase/functions/file/logic.ts`), `app_settings.payments_on`, `AI_DAILY_LIMIT_USD` | `supabase/functions/file/logic_test.ts` | In place | |
| CC7.5a | CC7.5 Recover | Restore from backup | [backup-disaster-recovery](policies/backup-disaster-recovery.md) | | `supabase.backups`; restore test records | Gap | Founder: Supabase Pro with PITR |
| CC7.5b | CC7.5 | Post-incident review with actions to closure | [incident-response](policies/incident-response.md#steps) | | Reviews and their pull requests | Partial | Founder: approve; use from the first incident |

## CC8 Change management

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC8.1a | CC8.1 Changes authorized, tested, approved | CI on every push and pull request: types, the agent and planning tests, the build, every function type-checked and tested, every migration on a fresh Postgres with the database tests | [change-management](policies/change-management.md), [secure-development](policies/secure-development.md#gates-every-change-passes-ci-githubworkflowsciyml) | `.github/workflows/ci.yml` | `github.ci_runs` | In place | |
| CC8.1b | CC8.1 | Every change through a pull request approved by someone other than its author, with code owners; `main` protected | [change-management](policies/change-management.md#the-rule) | `.github/branch-protection.json`, `.github/CODEOWNERS` | `github.branch_protection`, `repo.git_main`, `github.pull_requests` | Gap | Founder: GitHub Pro ($4 a month), an identity for AI agents, apply the file ([BRANCH_PROTECTION.md](BRANCH_PROTECTION.md)) |
| CC8.1c | CC8.1 | Server functions deploy only from CI on `main` | [change-management](policies/change-management.md) | `.github/workflows/deploy-functions.yml` | `github.deploy_runs`, `supabase.functions` | Gap | Founder: add the `SUPABASE_ACCESS_TOKEN` repository secret |
| CC8.1d | CC8.1 | Migrations ship from `main` through CI; the live history matches the files | [change-management](policies/change-management.md) | `docs/MIGRATION_DRIFT.md` | `supabase.migrations` | Gap | Founder: repair the history and apply the pending files; Code: a `supabase db push` job after CI |
| CC8.1e | CC8.1 | A security checklist on every pull request | [secure-development](policies/secure-development.md#review) | `.github/pull_request_template.md` | Pull requests | Partial | Merge; then CC8.1b |
| CC8.1f | CC8.1 | No secrets enter the repo: gitleaks v8.30.1 on every pull request and push, exceptions reviewed | [secure-development](policies/secure-development.md) | `.github/workflows/ci.yml` (`security`), `.github/gitleaks.toml` | CI runs; the full-history scan on 2026-10-18 (384 commits, none found) | Partial | Merge |
| CC8.1g | CC8.1 | CI tests on the production database version | [secure-development](policies/secure-development.md#known-gaps) | `ci.yml` `database` job (`postgres:15`) | | Gap | Code: `postgres:17` (production is 17.11), and check the migrations pass on it |
| CC8.1h | CC8.1 | What deploys is what CI tested: lockfiles, exact versions | [secure-development](policies/secure-development.md#dependencies) | `package-lock.json`, `worker/filer/package-lock.json`; functions import `npm:@supabase/supabase-js@2` | | Partial | Code: an import map and `deno.lock` for the functions; pin Actions to commit SHAs |

## CC9 Risk mitigation

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CC9.1a | CC9.1 Business disruption | Continuity plan: model failover, manual filing fallback, key-person measures | [business-continuity](policies/business-continuity.md) | `llm.ts` routes | `_shared/llm.test.ts`; `scripts/extreme-test.ts` section 12; continuity record | Partial | Founder: password-manager emergency access and a named backup person |
| CC9.1b | CC9.1 | Cyber insurance | [risk-assessment](policies/risk-assessment.md) | | The policy | Gap | Founder: get a quote; many customers' security questionnaires ask |
| CC9.2a | CC9.2 Vendors and partners | Each subprocessor's attestation recorded with its source; yearly review | [vendor-management](policies/vendor-management.md) | | The vendor table; vendor review records | Partial | Founder: request the reports (none on file) |
| CC9.2b | CC9.2 | Vendors without an attestation limited or replaced | [vendor-management](policies/vendor-management.md) | `llm.ts` `vendorOk` | | Partial | Code: Gemini through Vertex AI; Founder: Resend instead of Postmark for Odelia's email, or a written exception |
| CC9.2c | CC9.2 | The public subprocessor list matches the code | [vendor-management](policies/vendor-management.md#in-the-code-but-missing-from-the-trust-page) | `site/trust.html` | | Partial | Code: add Toast, Square, WeChat and MCP connectors |
| CC9.2d | CC9.2 | AI vendors confirm in writing they don't train on or keep what we send | [vendor-management](policies/vendor-management.md) | | Written confirmations | Gap | Founder: turn on Groq Zero Data Retention; get Groq, Cerebras and OpenRouter confirmations (trust page: "In progress") |

## A1 Availability

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1.1a | A1.1 Capacity | AI allowances, saver mode and daily throttles; per-workspace caps on filings, texts, calls and speech; rate limits | [logging-monitoring](policies/logging-monitoring.md) | `_shared/ai_gate.ts`, `FILER_DAILY_CAP`, `AGENT_DAILY_CALLS`, `rate_hits` | `scripts/extreme-test.ts` section 7 | Partial | Founder: apply `20261016160000_ai_routing_margin.sql` (saver mode, throttles) |
| A1.2a | A1.2 Backups and recovery infrastructure | Daily database backups and point-in-time recovery | [backup-disaster-recovery](policies/backup-disaster-recovery.md#the-plan) | | `supabase.backups` | Gap | Founder: Supabase Pro, Small compute and PITR, about $130 a month |
| A1.2b | A1.2 | Uploaded files and a database dump copied off Supabase weekly | [backup-disaster-recovery](policies/backup-disaster-recovery.md#the-plan) | | The copy's listing | Gap | Code: the weekly copy job; Founder: pick the provider |
| A1.2c | A1.2 | Every secret value also in the company password manager | [backup-disaster-recovery](policies/backup-disaster-recovery.md#the-plan) | | Names in `supabase.secrets` checked against the vault | Gap | Founder |
| A1.2d | A1.2 | Code and hosting can be rebuilt: GitHub, Vercel rollback, Render from `render.yaml` | [backup-disaster-recovery](policies/backup-disaster-recovery.md#recovery-targets) | `vercel.json`, `render.yaml` | | In place | |
| A1.3a | A1.3 Test recovery | Quarterly restore into a new project, timed | [backup-disaster-recovery](policies/backup-disaster-recovery.md#the-quarterly-restore-test) | | Restore test records | Gap | Founder: after A1.2a |

## C1 Confidentiality

| ID | Criterion | Control | Policy | Implemented by | Evidence | Status | Fix |
| --- | --- | --- | --- | --- | --- | --- | --- |
| C1.1a | C1.1 Identify and maintain confidential information | Data classes and how each is handled | [data-classification-retention](policies/data-classification-retention.md#classes) | | The approved policy | Partial | Founder: approve |
| C1.1b | C1.1 | Each workspace's data isolated; SSNs and ITINs never saved or filed | [data-classification-retention](policies/data-classification-retention.md) | Row-level security; `src/guard.ts`; `supabase/functions/file/logic.ts` | `scripts/extreme-test.ts` section 5; `supabase/tests` | In place | |
| C1.1c | C1.1 | Confidentiality agreements with everyone who works here | [personnel-security](policies/personnel-security.md#before-access) | | Signed agreements | Gap | Founder: from the first hire |
| C1.2a | C1.2 Dispose of confidential information | Retention schedule enforced by the daily purge | [data-classification-retention](policies/data-classification-retention.md#retention) | `purge_expired()`, `placetta-purge` job | `supabase/tests/hardening.sql`; `supabase.database` (scheduled jobs) | Partial | Founder: apply the hardening and MCP migrations |
| C1.2b | C1.2 | The audit trail's retention is decided and the Privacy Policy says it | [data-classification-retention](policies/data-classification-retention.md#retention) | | | Gap | Founder: decide the period; then the Privacy Policy and a deliberate purge (Code) |
