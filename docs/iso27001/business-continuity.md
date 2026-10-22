# Information security during disruption and ICT readiness (Annex A 5.29, 5.30 and 8.14)

| | |
| --- | --- |
| Document | ISMS-13 |
| Version | 0.1 |
| Status | **Draft for approval.** There are no backups in production and no recovery has ever been tested |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Every 12 months, after every restore drill that fails, and after any outage longer than 4 hours |
| Clauses and controls | Annex A 5.29, 5.30, 8.13, 8.14 |
| SOC 2 cross-reference | CC9.1a, CC7.5a, A1.2a, A1.2b, A1.2d, A1.3a |

The scenarios and what to do in each are in [business-continuity.md](../soc2/policies/business-continuity.md); the backup plan and recovery targets in [backup-disaster-recovery.md](../soc2/policies/backup-disaster-recovery.md); the founder's steps and the drills in [backup-restore.md](../soc2/runbooks/backup-restore.md). This document states how information security is kept during a disruption and how ICT readiness is proved.

## Keeping security during a disruption (5.29)

1. **No shortcuts with access.** During an outage nobody shares accounts, turns off two-step sign-in, widens row-level security or posts keys in a chat to "get it working". An emergency change still gets a record and a pull request afterwards ([change-management.md](../soc2/policies/change-management.md#emergency-changes)).
2. **Manual filing fallback keeps the approval rule.** When the filer or a channel is down, the team files by hand only what an owner already approved, and records it in the audit trail.
3. **A restored or temporary environment is production-grade or it is not used.** A Supabase copy made for recovery gets its scheduled jobs unscheduled before anything else (risk K2), its own secrets set, and is deleted after a drill.
4. **Decrypted backups are handled as Confidential** on an encrypted disk and deleted when the work is done.

## ICT readiness (5.30) and redundancy (8.14)

| Service | Recovery time objective | Recovery point objective | How | Proven by | Status |
| --- | --- | --- | --- | --- | --- |
| Database | 4 hours | Minutes with PITR; 24 hours from the off-site copy | Supabase PITR in place, or into a new project; off-site copy into a new project | Quarterly drill records | **Not ready**: no PITR, no copy running, no drill run |
| Uploaded files | 4 hours | 7 days | Weekly off-site file copy | Drill B step 5 | Not ready |
| Site and app | 15 minutes | Last deployment | Vercel instant rollback; any static host | Yearly check | Ready (not drill-tested) |
| Server functions | 30 minutes | `main` | Redeploy from git through CI | Yearly check | Ready once deploys run from CI |
| Portal filer | 1 hour | `main` | Render rebuild from `render.yaml` | Yearly check | Ready (not drill-tested) |
| Secrets | 1 hour | Current | Company password manager | Access review checks names against the secrets list | Not ready: password manager not evidenced |

Redundancy decision (8.14): one Supabase project in one region is accepted at this size (risk K9), with the off-site copy at a second provider as the answer to losing the project or account. Revisit when a customer contract needs an availability commitment.

## Exercises

| Exercise | Frequency | Record |
| --- | --- | --- |
| Restore drill A (off-site copy, `scripts/restore-test.sh`) | Quarterly, alternating with B | [restore-drill-template.md](../soc2/records/restore-drill-template.md) |
| Restore drill B (Supabase backup into a new project) | At least yearly | Same |
| Continuity check (emergency access, backup person, vendor accounts on company addresses) | Yearly | [RECORDS.md](../soc2/RECORDS.md#continuity) |
| Tabletop | Yearly | RECORDS.md "Tabletop" |

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder) | | | | |
