# Internal audit programme, and nonconformity and corrective action log (clauses 9.2 and 10.2)

| | |
| --- | --- |
| Document | ISMS-8 |
| Version | 0.1 |
| Status | **Draft for approval.** No internal audit has been carried out and no auditor has been engaged |
| Owner | Founder (top management) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Yearly, at the management review |
| Clauses and controls | 9.2.1, 9.2.2, 10.1, 10.2; Annex A 5.35, 5.36 |
| SOC 2 cross-reference | CC4.1a, CC4.1b, CC4.2a, CC1.2a |

## Independence

ISO/IEC 27001 requires auditors who are objective and impartial. With one person doing all the work, the founder can't audit their own work. The internal audit is therefore **outsourced** to a qualified person independent of Placetta's operations (for example an ISO 27001 Lead Auditor working as a contractor), engaged before the Stage 1 audit. The readiness assessment estimated $3,000 to $8,000 for it; that is an estimate, not a quote. The certification body that will perform Stage 1 and Stage 2 can't also do the internal audit.

## Programme (first cycle, then yearly)

Every clause 4 to 10 and every applicable Annex A control is audited at least once per three-year certification cycle; the first cycle covers everything, because the ISMS is new. Higher-risk areas are audited every year.

| Audit | Scope | Criteria | Frequency | Method | When (founder sets) |
| --- | --- | --- | --- | --- | --- |
| A1 ISMS core | Clauses 4 to 10: scope, context, policy, roles, risk method and register, SoA, treatment plan, objectives, competence, documented information, monitoring, management review, corrective action | ISO/IEC 27001:2022; this folder | Yearly | Document review, interview, sample of records | Before Stage 1 |
| A2 Change and access | A.5.3, 5.15 to 5.18, 8.2, 8.4, 8.5, 8.18, 8.25, 8.28, 8.31, 8.32 | Branch protection, PR approvals, access reviews, CONTROLS.md CC6 and CC8 | Yearly | Sample 25 merged changes; check branch protection live against `.github/branch-protection.json`; check two access reviews | Before Stage 1 |
| A3 Operations and resilience | A.5.24 to 5.30, 8.13 to 8.17, 8.8 | Backup and drill records, log export, incident log, vulnerability SLA | Yearly | Sample drill and weekly log review records; re-perform one restore check from the off-site copy | Before Stage 1 |
| A4 Suppliers and legal | A.5.19 to 5.23, 5.31, 5.34 | Vendor evidence tracker; the legal register | Yearly | Check each always-on supplier's report is current and its user-entity controls are met | Before Stage 1 |
| A5 People and endpoints | A.6.1 to 6.8, 7.7 to 7.14, 8.1, 8.23 | Training and acknowledgment records; device evidence | Yearly | Records review | Before Stage 1 |

## Each audit

1. **Plan**: the auditor sends the scope, criteria and sample requests at least two weeks before.
2. **Perform**: evidence from the evidence folder, the evidence bundle (`scripts/soc2-evidence.mjs`), git history and live consoles viewed with the founder.
3. **Report**: findings graded as major nonconformity, minor nonconformity, observation or opportunity for improvement, with evidence for each. Report goes to top management and is filed in the evidence folder.
4. **Follow up**: each nonconformity goes into the log below within 5 working days.

## Nonconformity and corrective action log (clause 10.2)

Every nonconformity, whatever found it (internal audit, certification audit, incident, management review, the monthly review, a customer), is recorded here with its root cause and the action that removes the cause, not just the symptom. The log starts empty; there are no audit findings yet. Known gaps from the readiness assessment are tracked in the risk treatment plan, not here, because they are not yet nonconformities against an approved ISMS.

| ID | Date found | Source | Requirement not met | What happened | Root cause | Correction (fix now) | Corrective action (stop it recurring) | Owner | Due | Closed (date, evidence) | Effective? (checked when) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder) | | | | |
