# ISO/IEC 27001:2022 information security management system (drafts)

Placetta is **not ISO/IEC 27001 certified** and has not started a certification audit. Every document in this folder is a **draft for the founder's approval**, written on 2026-10-22 by Claude (an AI assistant) from the repository, the SOC 2 program in [docs/soc2/](../soc2/README.md) and the internal readiness assessment of 2026-10-21. None has been approved; each ends with an empty approval block. Certification needs an accredited certification body (Stage 1 and Stage 2 audits), at least one internal audit and one management review first, and evidence that the ISMS has operated; no document can produce those.

The ISMS reuses the SOC 2 program rather than duplicating it: the 15 topic policies, the control matrix, the records and the runbooks live in `docs/soc2/`; this folder adds what ISO/IEC 27001 requires on top and cross-references the SOC 2 control IDs.

## Documents

| ID | Document | Clauses and controls | SOC 2 cross-reference |
| --- | --- | --- | --- |
| ISMS-1 | [isms-scope.md](isms-scope.md), with the asset inventory | 4.3, 4.4; A.5.9 | CC2.1a, CC6.4a |
| ISMS-2 | [context-and-interested-parties.md](context-and-interested-parties.md), with the legal register and the climate change determination | 4.1, 4.2; A.5.5, 5.6, 5.31 | CC2.3, CC3.1, CC9.2 |
| ISMS-3 | [information-security-policy.md](information-security-policy.md), with objectives, roles and communication | 5.1 to 5.3, 6.2, 6.3, 7.4; A.5.1 to 5.4 | CC1.1a, CC1.3a, CC5.3a |
| ISMS-4 | [risk-assessment-methodology.md](risk-assessment-methodology.md), with acceptance criteria | 6.1.1, 6.1.2, 8.2 | CC3.1, CC3.2 |
| ISMS-5 | [risk-register.md](risk-register.md): 14 company risks, 8 AI risks, 13 from the code review of 2026-10-22, 4 opportunities | 6.1.2, 8.2 | CC3.2a, CC3.2b |
| ISMS-6 | [risk-treatment-plan.md](risk-treatment-plan.md) | 6.1.3, 8.3 | CONTROLS.md "Fix" column |
| ISMS-7 | [statement-of-applicability.md](statement-of-applicability.md): all 93 Annex A controls | 6.1.3 d | Every row maps to CONTROLS.md |
| ISMS-8 | [internal-audit-programme.md](internal-audit-programme.md), with the nonconformity and corrective action log | 9.2, 10.1, 10.2; A.5.35, 5.36 | CC4.1, CC4.2 |
| ISMS-9 | [management-review-template.md](management-review-template.md) | 9.3 | CC1.2a |
| ISMS-10 | [competence-and-awareness.md](competence-and-awareness.md), with the record and the acknowledgment text | 7.1 to 7.3; A.6.1 to 6.3, 6.6 | CC1.4a, CC1.4b |
| ISMS-11 | [supplier-security.md](supplier-security.md) | A.5.19 to 5.23 | CC9.2 |
| ISMS-12 | [incident-management.md](incident-management.md), with evidence collection | A.5.24 to 5.28, 6.8 | CC7.3, CC7.4, CC7.5b |
| ISMS-13 | [business-continuity.md](business-continuity.md) | A.5.29, 5.30, 8.14 | CC9.1a, A1.2, A1.3 |

Clause 7.5 (documented information) is met by keeping these documents in git, with their history, and the completed records outside the repo in the evidence folder ([RECORDS.md](../soc2/RECORDS.md)). Clause 9.1 (monitoring and measurement) is the objectives table in ISMS-3, measured at each management review.

## The founder's path to a Stage 1 audit

1. Read, correct and approve ISMS-1 to ISMS-13 and the 15 SOC 2 policies (risk K12).
2. Work the risk treatment plan, High risks first (T1 to T5), using the runbooks in [docs/soc2/runbooks/](../soc2/runbooks/).
3. Run the recurring records for at least one quarter: access review, monthly review, weekly log review, a restore drill.
4. Hold a management review with the outside advisor (ISMS-9).
5. Engage an independent internal auditor and complete the first audit cycle (ISMS-8); correct what it finds.
6. Choose an accredited certification body and book Stage 1. The readiness assessment estimated 6 to 12 months and $20,000 to $50,000 for the first year; those are estimates, not quotes.

Where each framework stands: [docs/compliance-scorecard.md](../compliance-scorecard.md).
