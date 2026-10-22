# Risk treatment plan (clauses 6.1.3 and 8.3)

| | |
| --- | --- |
| Document | ISMS-6 |
| Version | 0.1 |
| Status | **Draft for approval.** Dates are for the founder to set at approval; none is a commitment until then |
| Owner | Founder (risk owner) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | At every management review; each line closes with evidence |
| Clauses and controls | 6.1.3 (b, c, e, f), 8.3; the Annex A controls named per line |
| SOC 2 cross-reference | The "Fix" column of [CONTROLS.md](../soc2/CONTROLS.md); the readiness assessment's ranked plan |

Order: the High risks first, then what the first audit needs. "Code: done" means the repository part is finished and tested on 2026-10-22; the line stays open until the founder's part is done and the evidence exists. Every runbook named here is a founder runbook: nothing in it was run against live systems.

| ID | Treats | Treatment | Annex A | Code | Founder's part (runbook) | Owner | Target date | Residual after | Evidence of completion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | C1, K1, K2, K9, K11 | Supabase PITR; daily encrypted off-site database copy and weekly file copy; quarterly restore drills that check grants and run the database tests; unschedule cron jobs in a restored copy | 8.13, 8.14, 5.30 | Done: `scripts/db-backup.sh`, `scripts/restore-test.sh`, `.github/workflows/db-backup.yml`, CI drill on a stand-in | [backup-restore.md](../soc2/runbooks/backup-restore.md) steps 1 to 4 | Founder | | Low | PITR screenshot; first two drill records |
| T2 | C2, C3, K6 | Branch protection with code-owner approval; a bot identity for AI sessions; deploys only from CI; a second approver or approved compensating control; a narrower deploy token | 8.32, 8.4, 5.3, 8.2 | Done: SHA-pinned actions, Postgres 17.11 in CI, full-tree audit gate, branch protection file, CODEOWNERS, PR checklist | [branch-protection.md](../soc2/runbooks/branch-protection.md) | Founder | | Medium (solo founder) to Low (second approver) | `gh api` output; a blocked direct push; 25 or more approved PRs over the window |
| T3 | C3, C10, K10 | Repair the migration history; save the `autopilot` migration or drop the table; create the `official-forms` bucket in a migration; apply the pending migrations, security hardening first; read-only Supabase connector for AI sessions | 8.9, 8.31 | Partly: the files and repair commands exist ([MIGRATION_DRIFT.md](../MIGRATION_DRIFT.md)) | MIGRATION_DRIFT.md "Repair"; branch-protection.md step 5 | Founder | | Low | `supabase migration list` clean in the evidence bundle |
| T4 | C4 | Company identity with enforced two-step; security keys on every console; password manager | 5.16, 5.17, 8.5 | Done: access review script and template | [mfa-and-identity.md](../soc2/runbooks/mfa-and-identity.md) | Founder | | Low | Access review with every console "on" |
| T5 | C6 | Emergency access in the password manager for a named backup person; the runbooks; an advisor who knows where they are | 5.29, 5.37 | Runbooks done | mfa-and-identity.md step 2; [business-continuity.md](business-continuity.md) | Founder | | Medium (still one person) | Continuity record with a tested emergency access |
| T6 | C7, R4 | Written no-training and retention terms from each AI vendor; Gemini through Vertex AI or `GEMINI_PAID` kept off; OpenRouter `data_collection: deny` and the account setting recorded; Groq zero retention on; Resend instead of Postmark or a written exception; DeepSeek off | 5.19 to 5.22, 8.12 | Partly (routing rules in `llm.ts`); the request templates and tracker are done | [vendors/README.md](../soc2/vendors/README.md) | Founder | | Low | Tracker rows "on file" |
| T7 | C9, K7 | Turn on Dependabot alerts; merge or close the open Dependabot PRs; a `deno.lock` for the functions | 8.8, 5.21 | Audit gate done; `deno.lock` not started | GitHub settings (founder) | Founder | | Low | Evidence bundle `github.dependabot_alerts` |
| T8 | C11 | Hourly export of auth, function and gateway logs to a bucket locked for a year; weekly log review | 8.15, 8.16, 5.28 | Done: `scripts/log-export.mjs`, `.github/workflows/log-export.yml` | [log-retention.md](../soc2/runbooks/log-retention.md) | Founder | | Low | Bucket listing; weekly review lines |
| T9 | C12 | PIPL notice and consent in the app for people in China | 5.31, 5.34 | Not started | Counsel to confirm the wording | Founder | | Low | The feature live; counsel's note |
| T10 | K3, K4 | The filer's own database role with no table access; audit before password; non-root container; Render tier with a SOC 2 report or a recorded exception | 8.2, 8.18, 5.15, 8.15 | Done: migration `20261022120000_filer_least_privilege.sql`, worker code, tests | [filer-least-privilege.md](../soc2/runbooks/filer-least-privilege.md) | Founder | | Low | `FILER_DB_KEY` set, service key removed from Render (console change record) |
| T11 | K5 | Correct the Privacy Policy and Terms at the next legal version, or apply the enterprise migration so the export claim becomes true; confirm AI vendor terms before keeping "bound not to train" | 5.31, 5.34 | Site pages done on 2026-10-22 | [legal-text-corrections.md](../soc2/runbooks/legal-text-corrections.md) | Founder with counsel | | Low | The new legal version, or the migration applied |
| T12 | K12 | Approve the 15 policies and the ISMS documents in this folder; sign the acknowledgment | 5.1, 5.4 | Drafts done | Read, correct, sign each approval block | Founder | | Low | Signed approval blocks |
| T13 | K13 | Disk encryption, screen lock, automatic updates, firewall on the founder's devices, recorded; a lightweight MDM from the first hire | 8.1, 7.7 to 7.10, 7.14 | Not applicable | [acceptable-use.md](../soc2/policies/acceptable-use.md#devices) | Founder | | Low | Device screenshots in the evidence folder |

## Approval

The risk owner approves this plan and, for each line, the residual risk expected after it.

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Risk owner and top management (founder) | | | | |
