# Information security policy and objectives (clauses 5.1, 5.2, 5.3 and 6.2)

| | |
| --- | --- |
| Document | ISMS-3 |
| Version | 0.1 |
| Status | **Draft for approval.** Not in force until approved in the block at the end |
| Owner | Founder (top management and security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Every 12 months at the management review, and after any SEV1 incident |
| Clauses and controls | 5.1, 5.2, 5.3, 6.2, 6.3, 7.4; Annex A 5.1, 5.2, 5.3, 5.4 |
| SOC 2 cross-reference | CC1.1a, CC1.3a, CC2.2a, CC3.1a, CC5.3a |

This is the top-level policy ISO/IEC 27001 clause 5.2 asks for. The detailed rules stay in the 15 topic policies in [docs/soc2/policies/](../soc2/policies/), starting with [information-security.md](../soc2/policies/information-security.md); this document adds what the standard requires on top of them and doesn't repeat them.

## Policy statement

Placetta handles other businesses' licenses, filings, documents and the logins to government portals. Our customers trust us with information that, misused, could cost them their permits, their money or their reputation. Placetta Inc. therefore commits to:

1. **Protect** the confidentiality, integrity and availability of customer information and the systems that process it, in proportion to the risk, using the risk method in [risk-assessment-methodology.md](risk-assessment-methodology.md).
2. **Meet the requirements** that apply to us: the law and regulations in [context-and-interested-parties.md](context-and-interested-parties.md), our contracts and Terms, and what we say publicly on the trust page.
3. **Keep a person in control** of every filing, payment and message the product sends, and record every action.
4. **Say only what is true** about our security, labelling what is in place, rolling out or in progress.
5. **Continually improve** the information security management system, through internal audit, management review, corrective action and the lessons of incidents.

## Information security objectives (clause 6.2)

Measurable, with an owner, the resources, a deadline and how each is evaluated. The deadlines are proposals for the founder to set at approval; none is a commitment until then.

| Objective | Measure | Target | Owner | Resources | Deadline (founder sets) | Evaluated |
| --- | --- | --- | --- | --- | --- | --- |
| Recover customer data after a loss | Restore drills passed, and minutes to restore | One passed drill each quarter; under 240 minutes | Founder | Supabase PITR (about $130 a month), off-site bucket | | Drill records |
| Every production change reviewed and tested | Share of changes to `main` through an approved pull request with passing checks | 100% after branch protection is applied | Founder | GitHub Pro ($4 a month), bot identity | | Evidence bundle `repo.git_main`, `github.pull_requests` |
| Vulnerabilities fixed on time | Share of high and critical advisories fixed within the policy's deadline | 100% | Founder | Dependabot, CI audit gate | | Monthly review |
| Admin access protected | Consoles with two-step sign-in on for every member | All consoles in the access review | Founder | Security keys, password manager | | Quarterly access review |
| Logs available for investigations | Hours of the last year with an exported log file | At least 99% | Founder | Log bucket | | Weekly log review |
| Suppliers assured | Always-on subprocessors with a current SOC 2 or ISO 27001 report on file | All six | Founder | Time to request | | Vendor evidence tracker |
| People aware | People with security training in the last 12 months and a signed policy acknowledgment | 100% | Founder | Training course | | Competence records |
| Truthful public claims | Trust and landing page claims that don't match production, found at the quarterly claim check | 0 | Founder | | | Management review |

## Roles, responsibilities and authorities (clause 5.3)

| Role | Held by | Responsibilities and authority |
| --- | --- | --- |
| Top management | Founder | Approves this policy, the scope, the risk acceptance criteria, residual risks and the Statement of Applicability; provides resources; chairs the management review |
| ISMS manager and security lead | Founder | Runs the ISMS day to day; reports on its performance to top management (in practice, the management review minutes shared with the outside advisor below) |
| Risk owners | Named per risk in [risk-register.md](risk-register.md) | Approve treatment plans and accept residual risk |
| Outside advisor (to be named) | An investor, board member or advisor independent of daily operations | Receives the quarterly security update and the management review minutes; challenges them (SOC 2 CC1.2) |
| Internal auditor (to be engaged) | Someone independent of the work audited: with one employee, an outside auditor | Audits the ISMS per [internal-audit-programme.md](internal-audit-programme.md) |
| Staff and contractors | Everyone in `public.staff_emails` or under contract | Follow the policies; complete training; report events to security@placetta.com |
| AI coding agents | Tools run by the founder under the bot identity | No standing access; every change through a reviewed pull request |

Segregation of duties (Annex A 5.3) is not possible with one person. The compensating controls are: CI as an independent test gate, the bot identity so the founder approves AI-written changes, the monthly independent review of merged changes or a second approver ([branch-protection.md](../soc2/runbooks/branch-protection.md)), and the outside advisor's review.

## Communication (clause 7.4)

| What | Who to | When | By | How |
| --- | --- | --- | --- | --- |
| This policy and the topic policies | Everyone who works here | At start and yearly | Founder | Repository link and signed acknowledgment |
| Security status (open High risks, gap count, incidents) | Outside advisor | Quarterly | Founder | Management review minutes |
| Incidents affecting customers | Affected customers; regulators as counsel advises | Per incident-response.md timelines | Founder | Email; trust page incident log |
| Security claims | The public | When a control's status changes | Founder | Trust page |
| Supplier security issues | The supplier | When found | Founder | Supplier's security contact |

## Planning changes to the ISMS (clause 6.3)

A change to the scope, a new product line, a new provider that receives customer data, or a change of who holds a role is planned in a pull request to the affected ISMS document, with the reason, the risks it changes (updated in the risk register), the resources it needs and who approves it. The management review checks that changes were made this way.

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder, security lead) | | | | |
