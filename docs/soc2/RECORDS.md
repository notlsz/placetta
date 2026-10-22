# Records the policies call for

Each policy names a record that proves it ran. These are the templates. Completed records go in the evidence folder (outside the repo: they name people, accounts and sometimes customers), next to the evidence bundles from `scripts/soc2-evidence.mjs`, one file per record, named `YYYY-MM-DD-<record>.md`.

| Record | How often | Policy |
| --- | --- | --- |
| [Access review](#access-review) | Quarterly | [access-control.md](policies/access-control.md) |
| [Monthly review](#monthly-review) | Monthly | [logging-monitoring.md](policies/logging-monitoring.md), [vulnerability-management.md](policies/vulnerability-management.md) |
| [Restore test](#restore-test) | Quarterly, once backups exist. The full template is [records/restore-drill-template.md](records/restore-drill-template.md); the steps are [runbooks/backup-restore.md](runbooks/backup-restore.md) | [backup-disaster-recovery.md](policies/backup-disaster-recovery.md) |
| [Incident](#incident) | Each incident, until the incident log is live | [incident-response.md](policies/incident-response.md) |
| [Tabletop](#tabletop) | Yearly | [incident-response.md](policies/incident-response.md), [business-continuity.md](policies/business-continuity.md) |
| [Vendor review](#vendor-review) | Yearly, and per new vendor | [vendor-management.md](policies/vendor-management.md) |
| [Risk review](#risk-review) | Yearly | [risk-assessment.md](policies/risk-assessment.md) |
| [Console changes](#console-changes) | Each change | [change-management.md](policies/change-management.md), [encryption.md](policies/encryption.md) |
| [Exceptions](#exceptions) | Each exception; reviewed quarterly | [information-security.md](policies/information-security.md) |
| [Continuity](#continuity) | Yearly | [business-continuity.md](policies/business-continuity.md) |
| [Onboarding and offboarding](#onboarding-and-offboarding) | Each person | [personnel-security.md](policies/personnel-security.md) |

## Access review

```
Access review, <quarter>, done <date> by <name>
Evidence bundle: <folder name>

Staff (staff_emails), two-step, last sign-in, still needed?      <from summary.md>
GitHub collaborators and roles, still needed?                     <from summary.md>
Supabase organization members and roles, two-step on?             <dashboard, Organization, Team>
Vercel team members and roles, two-step on?                       <dashboard>
Render workspace members, two-step on?                            <dashboard>
Stripe team members and roles, two-step on?                       <dashboard>
Other consoles (Anthropic, Google Cloud, Telnyx, Linq, Meta, Resend, Lob, domain, email): members, two-step on?
Function secret names: any no longer used?                        <from summary.md>
Removed or changed:                                               <who, what, when>
Exceptions:                                                       <none, or what and until when>
```

## Monthly review

```
Monthly review, <month>, done <date> by <name>
Evidence bundle: <folder name>
Needs attention items, and what was done about each:
Audit entries by actor this month; anything unusual (a spike, staff openings of saved logins without a matching filing):
Supabase security advisors: findings and actions:
Dependabot pull requests older than 14 days, and why:
Incidents without a fix:
```

## Restore test

```
Restore test, <quarter>, done <date> by <name>
Backup restored: <daily backup of / point in time>, into project <ref of the throwaway project>
Started <time>; database ready <time>; checks done <time>. Total: <minutes> (target 4 hours)
Row counts, production vs restored: workspaces, documents, audit_log, filings
Row-level security on every public table in the restored copy: yes / no
Test vault secret decrypts in the restored copy: yes / no (if no: how vault keys are recovered)
File restored from the bucket copy and opened: <path>
Throwaway project deleted at: <time>
Problems and fixes:
```

## Incident

```
<SEVn>. <one-line title>
Detected <UTC time> by <source>. Contained <time>. Resolved <time>.
Impact: who and what data, how many workspaces
What happened:
Fix:
Customers notified: <when, how> / not required because
Emergency changes made, and the pull requests that followed:
Review done <date>; actions: <issue or PR links>
```

## Tabletop

```
Tabletop, <date>, scenario: <for example "the service role key is posted publicly">
Who took part:
Time to: acknowledge, contain, notify (as walked through)
What didn't work or wasn't written down:
Changes made to the policies:
```

## Vendor review

```
Vendor review, <date>, by <name>
For each vendor in vendor-management.md: status still as listed? report downloaded (date)? complementary controls the report expects of us, and how we meet them?
New vendors since the last review:
Vendors removed from the code and the trust page:
```

## Risk review

```
Risk review, <date>, by <name>
Company register: ratings changed, risks added or closed, decisions (reduce, accept, transfer, avoid) with owners and dates
AI register: reviewed against llm.ts routes and tools on <date>
Accepted risks, signed by the founder:
```

## Console changes

```
<date> <console> <setting or secret name> <old -> new, never the value> <why> <who> <pull request or incident, if any>
```

## Exceptions

```
<date> Rule: <policy and rule>. Why: . Risk: . Compensating control: . Ends: <date>. Approved by: <name>.
```

## Continuity

```
Continuity check, <date>
Password manager emergency access: set up for <name>, waiting period <days>; tested on <date>
Backup person who knows where the runbooks are: <name>
Every vendor account owned by a company address: yes / exceptions
```

## Onboarding and offboarding

```
<name>, <role>, <start or end date>
Background check: passed on <date> / not required because
Agreements and policy acknowledgments signed: <date>
Accounts created or removed, each with time: email, password manager, GitHub, staff_emails, consoles
Secrets rotated (offboarding):
Device checked (onboarding): disk encryption, screen lock, updates
Training completed: <date>
```
