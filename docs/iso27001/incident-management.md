# Information security incident management (Annex A 5.24 to 5.28 and 6.8)

| | |
| --- | --- |
| Document | ISMS-12 |
| Version | 0.1 |
| Status | **Draft for approval.** The plan has never been exercised; the incident log table isn't live |
| Owner | Founder (incident lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Every 12 months, after every SEV1 or SEV2, and after the yearly tabletop |
| Clauses and controls | Annex A 5.24, 5.25, 5.26, 5.27, 5.28, 6.8; clause 10.2 for the corrective actions that follow |
| SOC 2 cross-reference | CC7.3a, CC7.4a, CC7.4b, CC7.5b, CC2.3a |

The operating plan is [incident-response.md](../soc2/policies/incident-response.md): severity levels, timelines, contacts, the six steps, containment switches and the incident log. This document maps it to ISO/IEC 27001 and adds the two pieces the standard asks for that the plan lacks: evidence collection, and the link to corrective action.

## How the plan meets each control

| Control | Met by | Status 2026-10-22 |
| --- | --- | --- |
| 5.24 Planning and preparation | incident-response.md; this document; the containment switches (`FILER_*`, `payments_on`, `AI_DAILY_LIMIT_USD`) | Partial: approved by nobody; counsel and the backup contact are "to fill in"; no tabletop yet |
| 5.25 Assessment and decision on events | Severity levels SEV1 to SEV3, "when unsure, pick the higher" | Partial |
| 5.26 Response | The six steps; the incident log (`public.incidents`); severity and stage times added by `20261022130000_incident_timeline.sql` (not applied) | Partial |
| 5.27 Learning from incidents | Post-incident review within 5 or 10 business days; actions become pull requests; recurring causes go to the nonconformity log ([internal-audit-programme.md](internal-audit-programme.md)) | Partial |
| 5.28 Collection of evidence | The procedure below | Partial: written, never used; the one-year log copy isn't running |
| 6.8 Event reporting | security@placetta.com, `security.txt`, the trust page; staff report anything odd to the same address | Partial |

## Collecting evidence (5.28)

When an incident might lead to a legal claim, a regulator's question, a customer dispute or law enforcement, from the moment it is SEV1 or SEV2:

1. **Preserve before fixing, where it doesn't make the harm worse.** Containment comes first if data is leaking; otherwise copy first, then change.
2. **What to preserve**, each into the evidence folder under `incidents/<date>-<short-name>/`:
   1. the incident log entry and its timeline;
   2. platform logs for the window: export from Supabase's Logs Explorer at once (they expire after 1 day on Free, 7 on Pro), plus the hourly copies from the log bucket ([log-retention.md](../soc2/runbooks/log-retention.md));
   3. the workspace's audit trail rows for the window (`select * from audit_log where workspace_id = ... and created_at between ...`, exported as CSV);
   4. the evidence bundle run the same day (`scripts/soc2-evidence.mjs`), which records live settings, deployed functions and migrations;
   5. Vercel and Render deploy logs and the git commits deployed in the window;
   6. screenshots of console settings involved, with the browser's address bar visible.
3. **Integrity.** Run `sha256sum` over every file as it is saved, and keep the list (`SHA256SUMS`) in the same folder. Never edit an original; analyse copies.
4. **Chain of custody.** A short log in the folder: who collected each item, when (UTC), from where, and every later access or copy and why.
5. **Keep** incident evidence for at least the longest of: 3 years, the end of any related legal matter, or what counsel says.
6. **Hand over** only through counsel when law enforcement or a regulator asks.

## From incident to corrective action

After the review, every cause that could recur is entered in the nonconformity and corrective action log (ISMS-8) with its root cause and the change that removes it. The management review sees the list.

## Testing

A one-hour tabletop every year, recorded with the template in [RECORDS.md](../soc2/RECORDS.md#tabletop). Suggested first scenario: the service role key is posted publicly; second: a Supabase clone made for a restore drill starts sending texts (risk K2).

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder) | | | | |
