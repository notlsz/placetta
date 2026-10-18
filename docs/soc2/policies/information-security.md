# Information Security Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Placetta Inc., everyone who works for it (employees, contractors), and the AI coding agents they run |
| Review | Every 12 months, and after any SEV1 incident |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## What we protect

Customers' business information: workspace facts, applications, documents, conversations with Odelia, texts and call records, saved agency logins, connected-account tokens, and the audit trail. Then the systems that hold it and the code that runs them.

## The systems in scope

| System | What runs there | Who administers it |
| --- | --- | --- |
| Supabase project `esquxzcfsylffuijvzec` (US East) | Database, file storage, sign-in, server functions, Vault | Founder |
| Vercel | placetta.com and the app (`vercel.json`) | Founder |
| Render | The portal filer (`render.yaml`, `worker/filer`) | Founder |
| GitHub `notlsz/placetta` | Source, CI (`.github/workflows`), Dependabot | Founder |
| Vendor consoles | Stripe, Anthropic, Google Cloud, Telnyx, Linq, Meta, Resend, Lob and the rest in [vendor-management.md](vendor-management.md) | Founder |

## Roles

1. **Founder (security lead).** Owns every policy here, approves exceptions, runs the reviews, and is the incident lead. Today this is one person; [business-continuity.md](business-continuity.md) covers what that means.
2. **Staff.** Anyone in `public.staff_emails`. They work the filing queue and support, and reach customer records only after two-step sign-in (`is_staff()` requires it in the database).
3. **AI coding agents.** Tools the founder runs; they write code and commit as `Claude <noreply@anthropic.com>`. They are not staff and hold no standing access. What they may touch is set per session, and everything they change goes through [change-management.md](change-management.md).
4. **Customers.** Owners and members of a workspace. Owners approve every filing, payment and message.

## Principles

1. Nothing is filed, paid or sent without an owner's approval, and every action is written to the audit trail.
2. Least privilege: the browser holds only the publishable key; row-level security decides what each person sees; the service role key lives only in server settings.
3. Secrets never go in the repo, a prompt, a log or a ticket.
4. Say what is true. The trust page marks every claim "In place", "Rolling out" or "In progress", and no badge or certification is claimed before the report exists ([SETUP.md](../../../SETUP.md), "Before the first paying customer").
5. Every control here names the code or record that proves it, in [CONTROLS.md](../CONTROLS.md).

## The policies

| Policy | Covers |
| --- | --- |
| [access-control.md](access-control.md) | Accounts, two-step sign-in, least privilege, quarterly access review |
| [change-management.md](change-management.md) | Pull requests, CI gates, review, deploys, migrations |
| [secure-development.md](secure-development.md) | Secrets, dependencies, tests, code review for security |
| [vulnerability-management.md](vulnerability-management.md) | Finding and fixing vulnerabilities, disclosure |
| [encryption.md](encryption.md) | In transit, at rest, Vault, key handling |
| [logging-monitoring.md](logging-monitoring.md) | Audit trail, platform logs, alerts, review |
| [incident-response.md](incident-response.md) | Severity, contacts, timelines, customer notice, the incident log |
| [backup-disaster-recovery.md](backup-disaster-recovery.md) | Backups, restore tests, recovery targets |
| [business-continuity.md](business-continuity.md) | Keeping the company running if a person or a provider is lost |
| [data-classification-retention.md](data-classification-retention.md) | Data classes, handling, retention and deletion |
| [vendor-management.md](vendor-management.md) | Subprocessors and their attestations |
| [risk-assessment.md](risk-assessment.md) | The company risk register, and the AI risk register |
| [acceptable-use.md](acceptable-use.md) | Devices, accounts and data for people who work here |
| [personnel-security.md](personnel-security.md) | Onboarding, offboarding, background checks, training |

## Exceptions

An exception names the rule, why, the risk, the compensating control and an end date, and the founder approves it in writing (a pull request to the policy, or a line in [RECORDS.md](../RECORDS.md#exceptions)). Open exceptions are reviewed every quarter.

## Enforcement

Breaking these policies can lead to losing access and to ending the work relationship. Report a suspected breach to security@placetta.com; reporting in good faith is never punished.

## How we prove it

1. These policies, approved and dated in their headers, and their git history.
2. Each person's signed acknowledgment of this policy and [acceptable-use.md](acceptable-use.md) at onboarding and every year ([personnel-security.md](personnel-security.md)).
3. The evidence bundle from `scripts/soc2-evidence.mjs`, which lists each policy, its owner and whether its review is overdue.
