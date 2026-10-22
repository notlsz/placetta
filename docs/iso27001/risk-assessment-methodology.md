# Risk assessment methodology (clauses 6.1.1, 6.1.2 and 8.2)

| | |
| --- | --- |
| Document | ISMS-4 |
| Version | 0.1 |
| Status | **Draft for approval.** Not in force until approved in the block at the end |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant), building on [docs/soc2/policies/risk-assessment.md](../soc2/policies/risk-assessment.md) |
| Review | Every 12 months, with the risk assessment itself |
| Clauses and controls | 6.1.1, 6.1.2, 6.1.3 (inputs), 8.2 |
| SOC 2 cross-reference | CC3.1, CC3.2a, CC3.2b, CC3.3a, CC3.4a, CC9.1 |

The SOC 2 risk policy already sets the 1 to 3 scales and the four decisions. This document makes the method repeatable enough for ISO/IEC 27001: it adds the acceptance criteria, risk owners, when the assessment runs, and how results are kept.

## When the assessment runs

1. Every 12 months, before the management review.
2. Within 30 days of: a new provider receiving customer data; a new AI model or tool in `src/live.ts`; a new product line or market; a SEV1 or SEV2 incident; a change to the ISMS scope.
3. When the internal audit or a management review asks for it.

## Steps

1. **Identify** what could go wrong for each asset in the inventory ([isms-scope.md](isms-scope.md), appendix) and each process: a threat, the weakness it would use, and who would be harmed. Sources: the AI register, the readiness assessment, incidents, the evidence bundle's "needs attention" list, supplier reports, code review findings.
2. **Name a risk owner**: the person with the authority to decide on the treatment and to accept what remains. With one founder, that is the founder for every risk until there are other managers.
3. **Rate before controls**: likelihood L and impact I, each 1 to 3, using the tables below. Inherent score = L × I (1 to 9).
4. **List the existing controls**, each with the code, setting or record that proves it.
5. **Rate the residual risk** after those controls: Low, Medium or High, using the same tables applied to the situation with controls.
6. **Compare with the acceptance criteria** below, and decide: reduce, accept, transfer or avoid.
7. **Record** in [risk-register.md](risk-register.md), dated; treatments go to [risk-treatment-plan.md](risk-treatment-plan.md); the selected Annex A controls go to the [Statement of Applicability](statement-of-applicability.md).
8. **Sign**: the risk owner signs accepted residual risks in the register's approval block.

## Scales

| Likelihood | Meaning |
| --- | --- |
| 1, rare | Not expected in the next 3 years; needs several controls to fail together |
| 2, possible | Could happen in the next 3 years; has happened to similar companies |
| 3, likely | Expected within a year, or already happening |

| Impact | Customers | Business |
| --- | --- | --- |
| 1, minor | Inconvenience; no data exposed outside the workspace | Under a day of disruption; no notification duty |
| 2, moderate | One workspace's confidential data exposed, or a filing delayed | Days of disruption; possible notification; a customer may leave |
| 3, severe | Several workspaces exposed, saved logins exposed, a wrong filing or payment made, or data lost | Notification duty, legal exposure, loss of trust that threatens the company |

| Residual level | Score (L × I with controls) |
| --- | --- |
| Low | 1 to 2 |
| Medium | 3 to 4 |
| High | 6 to 9 |

## Risk acceptance criteria

1. **Low**: may be accepted by the risk owner; recorded; reviewed yearly.
2. **Medium**: may be accepted only with a written reason, a compensating control and a review date no later than 6 months; or reduced on a dated plan.
3. **High**: may not be accepted. It must be reduced, transferred or avoided on a dated plan approved by top management; until the plan completes, it is reported at every management review.
4. A risk whose impact would break a legal requirement or a public commitment on the trust page is never accepted at any level; the requirement is met or the commitment is withdrawn.

## Opportunities (clause 6.1.1)

The same assessment records opportunities: changes that would improve security or reduce effort (for example, a compliance platform automating evidence; moving the filer to a provider whose SOC 2 report covers it). They are listed at the end of the risk register and decided at the management review.

## Keeping the results (clause 8.2)

The register is versioned in git; each yearly assessment is also recorded in [RECORDS.md](../soc2/RECORDS.md#risk-review) and its signed copy kept in the evidence folder.

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder, security lead) | | | | |
