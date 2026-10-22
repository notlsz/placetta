# Compliance scorecard

Re-scored 2026-10-22 by Claude (an AI assistant) after fixing the gaps the internal readiness assessment of 2026-10-21 found that code and documents can fix. **Placetta holds no SOC 2 report, no ISO/IEC 27001 certificate and no FedRAMP authorization.** These are readiness estimates, not audit results, and nothing here may be shown to customers as evidence of compliance.

Scale (the assessment's): 0 to 100, how close Placetta is to a clean result if it engaged the assessor today. Production was not touched or re-checked; it is scored as the repository's own records describe it. Work that exists only in this branch counts as design, not as operation.

## Scores

| Framework | 2026-10-21 | 2026-10-22 | Why it moved | What still blocks 100 |
| --- | --- | --- | --- | --- |
| SOC 2 Type I | 45 | **49** | Public claims on the site corrected; CI on production's Postgres with SHA-pinned actions and a full-tree audit gate; designs for the off-site backup, restore drill, one-year logs, the filer's least-privilege role and incident timings; runbooks for every founder step | Backups switched on and a restore tested (CC7.5, A1.2, A1.3); branch protection with independent approval and deploys only from CI (CC8.1); all policies approved (CC5.3); console MFA and a company identity provider evidenced (CC6.1); pending migrations applied (CC6.1e, CC6.5, CC7.4); vendor reports on file (CC9.2); an engaged CPA firm |
| SOC 2 Type II | 22 | **24** | Tooling for the recurring controls (pre-filled access review, restore drill, weekly log review, incident timings) makes them cheaper to run | Everything for Type I, then a **3-month minimum observation window** (6 is better received) in which every recurring control actually operates: PR approvals on every change, quarterly access reviews, monthly reviews, quarterly restore drills, training, vendor review, incident handling |
| ISO/IEC 27001:2022 | 33 | **42** | Every mandatory document now exists as a draft (scope, context, interested parties, legal register, policy and objectives, risk method and acceptance criteria, risk register, treatment plan, Statement of Applicability for all 93 controls, internal audit programme, management review template, competence records, nonconformity log); 7 Annex A gaps moved to partial | Top management approval of every document; at least one **independent internal audit** and one **management review** actually held; records of the ISMS operating; the SOC 2 founder actions above (the same controls); an accredited certification body's Stage 1 and Stage 2 audits |
| FedRAMP Low (20x Low) | Not scored | **10** | First scored today. The GSA marketplace data shows a sponsor-free "Program" path at 20x Low | No hosting on FedRAMP-authorized infrastructure (Supabase, Vercel and Render are not in the GSA data); no FIPS-validated cryptography; no 3PAO, package or continuous monitoring; no federal customer |
| FedRAMP Moderate (20x Moderate) | Not scored | **7** | First scored today | As Low, at a larger control set; in practice a separate GovCloud edition |
| FedRAMP High | 5 | **5** | No change: nothing in production moved, and High needs a re-platform | Re-platform onto authorized infrastructure, FIPS 140-validated crypto throughout, an agency sponsor, a full 3PAO assessment of about 410 controls, US-person privileged access in practice; [docs/fedramp/feasibility.md](fedramp/feasibility.md) recommends not pursuing it now |

FedRAMP scores use the assessment's breakdown: process (sponsor, 3PAO, package) out of 25, infrastructure out of 25, controls out of 40, cryptography out of 10. Low: 2 + 0 + 8 + 0. Moderate: 1 + 0 + 6 + 0. High: 0 + 0 + 5 + 0.

## What 100 requires that code cannot produce

1. **An independent auditor.** A SOC 2 report is an opinion issued by a licensed CPA firm; ISO/IEC 27001 certification is issued by an accredited certification body after Stage 1 and Stage 2 audits; FedRAMP needs a 3PAO assessment and an authorization. No repository change can stand in for any of them.
2. **An observation period for SOC 2 Type II.** The auditor samples each recurring control across a window of at least 3 months. The window can only start once the controls run, and only time fills it.
3. **Founder-run process evidence.** Approvals of policies and risks, purchases (Supabase Pro with PITR, GitHub Pro, an identity provider, security keys), console settings (branch protection, MFA, secrets, read-only connectors), applied migrations and deployments, vendor reports and DPAs, training, access reviews, restore drills, management reviews and an internal audit. Each is a record of a person doing something on a date. Claude wrote the tooling, templates and runbooks for all of them ([docs/soc2/runbooks/](soc2/runbooks/)); none has been done, and none was faked.

## Where the details are

| | |
| --- | --- |
| SOC 2 control matrix, 85 controls (17 in place, 48 partial, 20 gaps) | [docs/soc2/CONTROLS.md](soc2/CONTROLS.md) |
| ISO/IEC 27001 documents and the Statement of Applicability (85 applicable: 4 in place, 69 partial, 12 gaps) | [docs/iso27001/](iso27001/README.md) |
| FedRAMP feasibility | [docs/fedramp/feasibility.md](fedramp/feasibility.md) |
| Founder runbooks | [docs/soc2/runbooks/](soc2/runbooks/) |
| Vendor evidence | [docs/soc2/vendors/](soc2/vendors/README.md) |
