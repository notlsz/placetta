# Statement of Applicability (clause 6.1.3 d), ISO/IEC 27001:2022 Annex A

| | |
| --- | --- |
| Document | ISMS-7 |
| Version | 0.1 |
| Status | **Draft for approval.** Not in force until approved in the block at the end; the statuses are as found in the repository on 2026-10-22 and were not re-checked against production |
| Owner | Founder (risk owner) |
| Drafted | 2026-10-22, by Claude (an AI assistant), from the readiness assessment's Annex A review of 2026-10-21, updated for the fixes made on 2026-10-22 |
| Review | At every management review, and whenever the risk register or the risk treatment plan changes |
| Clauses | 6.1.3 (b, c, d), 8.3 |
| SOC 2 cross-reference | The last column maps each control to the IDs in [docs/soc2/CONTROLS.md](../soc2/CONTROLS.md) |

All 93 controls of Annex A are listed. **Applicable** means selected to treat a risk in [risk-register.md](risk-register.md) or a requirement in [context-and-interested-parties.md](context-and-interested-parties.md); the justification column names which. **Status** uses the SOC 2 matrix's meanings: In place (operating in production, with evidence), Partial (designed or built, but not live, not approved or without evidence), Gap (not done), Excluded (not applicable, with the reason). The treatment for each Partial or Gap control is in [risk-treatment-plan.md](risk-treatment-plan.md) under the risk IDs shown.

## Summary

| | Count |
| --- | --- |
| Controls in Annex A | 93 |
| Applicable | 85 |
| Excluded (7.1 to 7.6, 7.11, 7.12: no premises; physical controls carved out to the cloud providers) | 8 |
| Applicable and in place | 4 |
| Applicable and partial | 69 |
| Applicable and gap | 12 |

Compared with the assessment of 2026-10-21 (4 in place, 62 partial, 19 gaps), seven gaps moved to partial because a design now exists in the repository (5.3, 5.6, 5.7, 5.28, 5.30, 8.13, 8.14). None moved to in place: each needs a founder action or production evidence first. Certification bodies generally accept the physical exclusions for a fully remote company on certified cloud providers when the justification is written down, as it is here.

## Organizational controls (5.1 to 5.37)

| Control | Title | Applicable | Justification (risk IDs, or why excluded) | Status 2026-10-22 | Implementation and evidence | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- |
| 5.1 | Policies for information security | Yes | K12; clause 5.2 | Partial | 15 topic policies and ISMS-3, none approved | CC5.3a, CC1.1a |
| 5.2 | Information security roles and responsibilities | Yes | K12, C6 | Partial | ISMS-3 roles; information-security.md Roles | CC1.3a |
| 5.3 | Segregation of duties | Yes | C2, C3 | Partial | One person; compensating controls written in branch-protection.md, not approved or operating | CC8.1b, CC1.2a |
| 5.4 | Management responsibilities | Yes | K12 | Partial | Founder owns every policy; nothing approved or recorded | CC1.1a, CC5.3a |
| 5.5 | Contact with authorities | Yes | Legal register | Partial | Contacts table in ISMS-2; counsel still to name | CC2.3a, CC7.4a |
| 5.6 | Contact with special interest groups | Yes | C9 | Partial | Sources listed in ISMS-2; not yet in a recorded routine | CC7.1a |
| 5.7 | Threat intelligence | Yes | C9, R1 | Partial | Dependabot, GitHub advisories; weekly log review reads them; no recorded actions yet | CC7.1a |
| 5.8 | Information security in project management | Yes | C2 | Partial | Pull request template security checklist | CC3.4a, CC8.1e |
| 5.9 | Inventory of information and other associated assets | Yes | All | Partial | Asset inventory seed in ISMS-1 appendix; devices to record | CC2.1a |
| 5.10 | Acceptable use of information and other associated assets | Yes | K13 | Partial | acceptable-use.md, unapproved | CC1.1a |
| 5.11 | Return of assets | Yes | C6 | Partial | Offboarding record template | CC6.2a |
| 5.12 | Classification of information | Yes | All | Partial | data-classification-retention.md, unapproved | C1.1a |
| 5.13 | Labelling of information | Yes | C5 | Gap | No labelling procedure; lightweight label by class to add to the classification policy | C1.1a |
| 5.14 | Information transfer | Yes | R4 | Partial | encryption.md in transit; signed webhooks; vendorOk | CC6.7a, CC6.7b |
| 5.15 | Access control | Yes | C5, K3 | Partial | access-control.md; RLS on every table; filer role written, not applied | CC6.1a, CC6.3a |
| 5.16 | Identity management | Yes | C4 | Partial | Supabase Auth for customers; no company identity provider | CC6.1g, CC6.2a |
| 5.17 | Authentication information | Yes | C4, R6, K4 | Partial | Vault for customer credentials; no password manager evidenced | CC6.1d, A1.2c |
| 5.18 | Access rights | Yes | C4 | Partial | Access review script and template; review never run | CC6.3b |
| 5.19 | Information security in supplier relationships | Yes | C7, R4 | Partial | vendor-management.md rules; supplier-security (ISMS-11) | CC9.2a |
| 5.20 | Addressing information security within supplier agreements | Yes | C7, R4 | Gap | No DPA or security terms on file; request templates ready | CC9.2a, CC9.2d |
| 5.21 | Managing information security in the ICT supply chain | Yes | K7, C9 | Partial | Lockfiles; Actions pinned by commit SHA; exact supabase-js in functions; full-tree audit gate; no deno.lock or SBOM | CC8.1h, CC7.1a |
| 5.22 | Monitoring, review and change management of supplier services | Yes | C7 | Gap | Vendor evidence tracker built; no report obtained or reviewed | CC9.2a, CC6.4a |
| 5.23 | Information security for use of cloud services | Yes | C1, K9 | Partial | Vendor policy; shared-responsibility split in the SOC 2 description draft; exit via the off-site copy (not live) | CC9.2a, A1.2b |
| 5.24 | Information security incident management planning and preparation | Yes | All | Partial | incident-response.md; ISMS-12 | CC7.3a, CC7.4a |
| 5.25 | Assessment and decision on information security events | Yes | All | Partial | Severity levels | CC7.3a |
| 5.26 | Response to information security incidents | Yes | All | Partial | Containment switches live; incident log not live | CC7.4a, CC7.4b |
| 5.27 | Learning from information security incidents | Yes | All | Partial | Post-incident review step; never exercised | CC7.5b |
| 5.28 | Collection of evidence | Yes | C11 | Partial | Chain-of-custody steps in log-retention.md and ISMS-12; log export not running | CC7.2c |
| 5.29 | Information security during disruption | Yes | C6, K9 | Partial | business-continuity.md; ISMS-13 | CC9.1a |
| 5.30 | ICT readiness for business continuity | Yes | C1, K2, K9 | Partial | Backup, off-site copy and drill built and tested on a stand-in; PITR and the copy not switched on; no drill run | A1.2a, A1.2b, A1.3a, CC7.5a |
| 5.31 | Legal, statutory, regulatory and contractual requirements | Yes | C12, C13, K5 | Partial | Register in ISMS-2; counsel to confirm | CC2.3a |
| 5.32 | Intellectual property rights | Yes | Legal | Gap | No open-source licence review; add a licence check to CI or the yearly review | CC5.2a |
| 5.33 | Protection of records | Yes | C10 | Partial | Append-only audit log in the hardening migration, not applied; records kept in git and the evidence folder | CC7.2d |
| 5.34 | Privacy and protection of PII | Yes | C12, K5 | Partial | Privacy Policy; SSN and ITIN guard; PIPL consent not built | C1.1b, CC2.3a |
| 5.35 | Independent review of information security | Yes | K12 | Gap | Internal audit programme drafted (ISMS-8); no auditor engaged; no penetration test | CC4.1b, CC1.2a |
| 5.36 | Compliance with policies, rules and standards for information security | Yes | K12 | Partial | Evidence script and monthly review designed; never run in full | CC4.1a, CC4.2a |
| 5.37 | Documented operating procedures | Yes | C6 | Partial | SETUP.md, MIGRATION_DRIFT.md and the founder runbooks in docs/soc2/runbooks | CC5.2a |

## People controls (6.1 to 6.8)

| Control | Title | Applicable | Justification (risk IDs, or why excluded) | Status 2026-10-22 | Implementation and evidence | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- |
| 6.1 | Screening | Yes | C6 | Partial | personnel-security.md; applies from the first hire; the founder recorded as exempt with a reason | CC1.4a |
| 6.2 | Terms and conditions of employment | Yes | C6 | Gap | No security terms in employment or contractor agreements | CC1.4a, C1.1c |
| 6.3 | Information security awareness, education and training | Yes | C4 | Gap | No training completed; competence records template in ISMS-10 | CC1.4b |
| 6.4 | Disciplinary process | Yes | K12 | Partial | Enforcement in information-security.md | CC1.5a |
| 6.5 | Responsibilities after termination or change of employment | Yes | C6 | Partial | Offboarding record template | CC6.2a |
| 6.6 | Confidentiality or non-disclosure agreements | Yes | C5 | Gap | None on file | C1.1c |
| 6.7 | Remote working | Yes | K13 | Partial | acceptable-use.md devices | CC6.8b |
| 6.8 | Information security event reporting | Yes | All | Partial | security@placetta.com; security.txt; ISMS-12 | CC2.3b |

## Physical controls (7.1 to 7.14)

| Control | Title | Applicable | Justification (risk IDs, or why excluded) | Status 2026-10-22 | Implementation and evidence | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- |
| 7.1 | Physical security perimeters | No | No premises; processing at certified cloud providers (carve-out) | Excluded | Providers' SOC 2 and ISO 27001 | CC6.4a |
| 7.2 | Physical entry | No | As 7.1 | Excluded | As 7.1 | CC6.4a |
| 7.3 | Securing offices, rooms and facilities | No | As 7.1; revisit if an office is leased | Excluded | As 7.1 | CC6.4a |
| 7.4 | Physical security monitoring | No | As 7.1 | Excluded | As 7.1 | CC6.4a |
| 7.5 | Protecting against physical and environmental threats | No | Inherited from providers; climate change treated through suppliers (ISMS-2) | Excluded | As 7.1 | CC6.4a |
| 7.6 | Working in secure areas | No | No secure areas | Excluded | As 7.1 | CC6.4a |
| 7.7 | Clear desk and clear screen | Yes | K13 | Partial | Screen lock in acceptable-use.md; no evidence | CC6.8b |
| 7.8 | Equipment siting and protection | Yes | K13 | Partial | Home-office laptop; light procedure in acceptable-use.md | CC6.8b |
| 7.9 | Security of assets off-premises | Yes | K13 | Partial | acceptable-use.md devices | CC6.8b |
| 7.10 | Storage media | Yes | K11, K13 | Partial | Rule for the evidence folder and decrypted backups (delete after a drill) in the backup runbook; no USB rule | CC6.5a |
| 7.11 | Supporting utilities | No | Inherited from providers | Excluded | As 7.1 | CC6.4a |
| 7.12 | Cabling security | No | No owned facilities | Excluded | As 7.1 | CC6.4a |
| 7.13 | Equipment maintenance | Yes | K13 | Partial | Automatic updates in acceptable-use.md; no evidence | CC6.8b |
| 7.14 | Secure disposal or re-use of equipment | Yes | K13 | Gap | No procedure for wiping laptops | CC6.5a |

## Technological controls (8.1 to 8.34)

| Control | Title | Applicable | Justification (risk IDs, or why excluded) | Status 2026-10-22 | Implementation and evidence | SOC 2 |
| --- | --- | --- | --- | --- | --- | --- |
| 8.1 | User endpoint devices | Yes | K13 | Gap | No device evidence | CC6.8b |
| 8.2 | Privileged access rights | Yes | C3, K3, K6 | Partial | Staff two-step enforced in the database; console MFA unverified; filer role written, not applied; AI sessions still hold production write | CC6.1b, CC6.3c |
| 8.3 | Information access restriction | Yes | C5 | In place | RLS on every workspace table; owner-only actions; supabase/tests in CI | CC6.1a, CC6.3a |
| 8.4 | Access to source code | Yes | C2, C8 | Partial | Private repo, single owner; CODEOWNERS; branch protection not applied | CC8.1b |
| 8.5 | Secure authentication | Yes | C4 | Partial | Staff two-step enforced; customer two-step optional; SSO built, not live | CC6.1b, CC6.1c, CC6.1i |
| 8.6 | Capacity management | Yes | C14, R7 | Partial | AI and messaging caps; no infrastructure capacity monitoring | A1.1a |
| 8.7 | Protection against malware | Yes | C9, K13 | Partial | Upload type limits pending; no endpoint protection evidence | CC6.8a |
| 8.8 | Management of technical vulnerabilities | Yes | C9 | Partial | Audit gate on all dependencies; Dependabot; alerts off; no penetration test | CC7.1a, CC4.1b |
| 8.9 | Configuration management | Yes | C10, K10 | Partial | Configuration as code; live drift documented | CC5.2a, CC7.1b |
| 8.10 | Information deletion | Yes | C12 | Partial | Account deletion live; purge pending | CC6.5a, C1.2a |
| 8.11 | Data masking | Yes | R5, R6 | Partial | SSN and ITIN blocked; passwords shown to the model as (filled) | C1.1b |
| 8.12 | Data leakage prevention | Yes | R4 | Partial | vendorOk per-vendor rules; zero-retention allowlist built, off | CC6.7b, CC9.2d |
| 8.13 | Information backup | Yes | C1, K1 | Partial | Backup and restore scripts built and tested in CI on a stand-in; nothing backed up in production yet | A1.2a, A1.2b, CC7.5a |
| 8.14 | Redundancy of information processing facilities | Yes | K9 | Partial | Model failover; off-site copy at a second provider designed, not running; single region accepted (K9) | A1.2b |
| 8.15 | Logging | Yes | C11, K4 | Partial | App audit trail live; append-only pending; one-year log export built, not running | CC7.2c, CC7.2d |
| 8.16 | Monitoring activities | Yes | C11 | Partial | Monitor and watchdog jobs, partly pending; weekly log review written; no uptime alerting | CC7.2a, CC7.2b |
| 8.17 | Clock synchronization | Yes | C11 | In place | Provider-managed time; database-stamped entries | CC7.2a |
| 8.18 | Use of privileged utility programs | Yes | C3, K3, K6 | Partial | Service role and SQL access via MCP; filer moved off the service role in code; connector not read-only yet | CC6.3c |
| 8.19 | Installation of software on operational systems | Yes | C2 | Partial | Docker image from a pinned base, non-root; function deploys by hand | CC8.1c |
| 8.20 | Networks security | Yes | C5 | Partial | Managed networks; database SSL enforcement unverified | CC6.7c |
| 8.21 | Security of network services | Yes | C7 | Partial | Relies on vendor attestations not yet on file | CC9.2a |
| 8.22 | Segregation of networks | Yes | C5 | Partial | Logical tenant isolation via RLS; no private networking | CC6.1a |
| 8.23 | Web filtering | Yes | K13 | Gap | None; DNS filtering on the founder's devices is the low-effort fix (or justify exclusion) | CC6.8b |
| 8.24 | Use of cryptography | Yes | K11 | Partial | TLS, provider encryption at rest, Vault; age-encrypted off-site copies designed; no key rotation records | CC6.1d, CC6.7a |
| 8.25 | Secure development life cycle | Yes | C2 | Partial | secure-development.md; CI gates | CC8.1a |
| 8.26 | Application security requirements | Yes | R1, R3 | In place | Approval gates, preflight checks, SSN guard, vendor rules; scripts/extreme-test.ts | CC3.3a |
| 8.27 | Secure system architecture and engineering principles | Yes | All | Partial | Principles in information-security.md; no architecture document | CC5.2a |
| 8.28 | Secure coding | Yes | C8, K7 | Partial | Tests, gitleaks, audit gate; no static analysis | CC8.1f |
| 8.29 | Security testing in development and acceptance | Yes | R1 to R8 | In place | Adversarial agent tests, database policy tests (including the filer role), function tests in CI | CC8.1a |
| 8.30 | Outsourced development | Yes | C3 | Partial | AI coding agents as tools; independent review depends on branch protection | CC8.1b |
| 8.31 | Separation of development, test and production environments | Yes | C3, K2, K8 | Partial | CI on a fresh Postgres 17.11; no staging; AI sessions touch production | CC8.1g, CC6.3c |
| 8.32 | Change management | Yes | C2 | Gap | No enforced approval or controlled deployment yet; rules and runbook ready | CC8.1b, CC8.1c, CC8.1d |
| 8.33 | Test information | Yes | C5 | Partial | Fixtures and stand-ins used; restore drills use scratch copies deleted after; no written rule against production data in tests | C1.1a |
| 8.34 | Protection of information systems during audit testing | Yes | All | Partial | Evidence script uses read-only tokens and redacts secrets | CC4.1a |
## Approval

The risk owner approves the selection of controls, the exclusions and their justifications, and accepts the residual risk after the treatments in the risk treatment plan.

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Risk owner and top management (founder) | | | | |
