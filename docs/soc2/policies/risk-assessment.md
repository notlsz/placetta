# Risk Assessment Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Risks to customers' information and to the service: technical, vendor, people and legal |
| Review | The assessment runs every 12 months, and when a major feature, vendor or incident changes the picture |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## Method

1. List what could go wrong, for whom, and how.
2. Rate likelihood and impact from 1 (low) to 3 (high), before controls.
3. Name the controls, with the code or record that proves each.
4. Judge the residual risk after controls: low, medium or high.
5. Decide for each: reduce (with a dated action), accept (the founder signs), transfer (insurance, a vendor) or avoid (stop doing it).
6. Record the assessment, dated, in this file's history and in [RECORDS.md](../RECORDS.md#risk-review).

## The two registers

1. **AI risks**: [docs/AI_RISK_REGISTER.md](../../AI_RISK_REGISTER.md), the inventory of every model, what it sees, and eight risks (prompt injection, made-up agencies, unapproved actions, leakage to vendors, leakage between workspaces, secrets through the model, runaway cost, false "done"), each with its controls and gaps. Review it whenever `llm.ts` routes, a model, or a tool in `src/live.ts` changes.
2. **Company risks**: the table below.

## Company risk register (2026-10-18)

| # | Risk | L | I | Controls today | Residual | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | The database is lost or corrupted and can't be restored | 2 | 3 | None: no backups ([backup-disaster-recovery.md](backup-disaster-recovery.md)) | High | Reduce: Supabase Pro with PITR, the off-platform copy, quarterly restore tests |
| C2 | A bad or malicious change reaches production unreviewed | 3 | 3 | CI runs on every push; extensive tests | High | Reduce: branch protection, required review, deploys from CI ([change-management.md](change-management.md)) |
| C3 | An AI coding session changes production directly (a migration, a deploy, SQL) | 3 | 3 | The founder supervises sessions; migrations are tested in CI | High | Reduce: read-only Supabase connector in coding sessions; migrations and deploys only from CI |
| C4 | The founder's accounts are taken over (phishing, a stolen laptop), giving admin of everything | 2 | 3 | Not recorded | Medium until checked | Reduce: two-step with an app or key on every console, recorded in the access review; company email with enforced two-step |
| C5 | One workspace reads another's data through a row-level security mistake | 1 | 3 | Row-level security on every table, database tests in CI, the October hardening audit | Low | Accept, keep testing; the evidence bundle checks row-level security on every live table |
| C6 | Key-person loss: only the founder can run, fix or deploy | 2 | 3 | Runbooks (`SETUP.md`, `docs/`) | High | Reduce: password-manager emergency access, a named backup person ([business-continuity.md](business-continuity.md)) |
| C7 | A vendor without an attestation mishandles data (Gemini Developer API, Postmark, DeepSeek) | 2 | 2 | `vendorOk` limits what each sees; DeepSeek off; Gemini only with `GEMINI_PAID` | Medium | Reduce: Gemini through Vertex AI; Resend for Odelia's email; DeepSeek stays off ([vendor-management.md](vendor-management.md)) |
| C8 | A secret is committed to the repo | 2 | 3 | gitleaks in CI with a reviewed allowlist; full history clean on 2026-10-18 | Low | Accept |
| C9 | A known-vulnerable dependency is exploited | 2 | 2 | `npm audit` gate in CI; weekly Dependabot | Medium | Reduce: merge Dependabot updates within 14 days; turn on Dependabot alerts |
| C10 | Security changes written but not live (the hardening migration, retention, filing send-once) give a false sense of safety | 3 | 2 | The trust page marks them "Rolling out"; the evidence bundle lists pending migrations | Medium | Reduce: repair the migration history and apply the pending files |
| C11 | Platform logs are gone before anyone looks (1 day of logs on the Free plan) | 3 | 2 | The app's own audit trail | Medium | Reduce: Supabase Pro (7 days); weekly evidence bundles ([logging-monitoring.md](logging-monitoring.md)) |
| C12 | Personal information about people in China leaves China without the notice and consent PIPL requires | 2 | 2 | The Privacy Policy's China section | Medium | Reduce: the in-app notice and consent on the trust page roadmap |
| C13 | Texting rules (TCPA, 10DLC) | 2 | 2 | Code-confirmed consent kept 5 years; STOP honoured; quiet hours | Low | Accept; finish 10DLC registration |
| C14 | Runaway AI or messaging cost from abuse | 2 | 2 | Allowances, daily caps, saver mode, rate limits (AI register R7) | Low | Accept |

## How we prove it

1. This register and the AI register, dated, with their git history.
2. The yearly risk review record, and the actions it opened, closed in pull requests.
