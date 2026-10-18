# Business Continuity Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Keeping customers served if a person, a provider or a region is lost |
| Review | Every 12 months, with a tabletop of one scenario below |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

## What has to keep working

| Function | Why it matters | Can wait |
| --- | --- | --- |
| Customers reaching their workspace and documents | Their filings and deadlines live there | 4 hours |
| Approved filings leaving on time, and agency replies reaching the customer | Deadlines and permits | 1 business day; the team can file by hand |
| Deadline reminders (the monitor) | Missed renewals cost customers money | 1 day |
| Odelia's answers | Convenience; the app works without her | 1 day |
| Billing | Revenue, not service | 1 week |

## Scenarios and what we do

| Scenario | Today | What we do |
| --- | --- | --- |
| **The founder is unavailable** (illness, travel, worse). Today one person holds every admin account, approves every change and is the only incident lead | The service runs on its own (no daily manual step keeps it up), but nobody else can fix, deploy or answer a security report | Company password manager with an emergency-access contact who can reach the vault after a waiting period; this folder, `SETUP.md` and `docs/` as the runbook; every vendor account owned by a company address, not a personal one; a named backup person who knows where the runbook is. Founder action |
| **Supabase region (us-east-1) down** | Everything that needs the database is down | Wait for Supabase; post a notice on the trust page and email affected owners if it runs past 4 hours. We accept this risk at our size; a second region is not planned |
| **Supabase account or project lost** | Total data loss, because there are no backups | The backup plan in [backup-disaster-recovery.md](backup-disaster-recovery.md), including the off-platform copy |
| **Vercel down** | Site and app down; the database and functions keep running, so filings and reminders continue | Wait, or deploy `npm run build` output to another static host (Netlify is already described in `SETUP.md`) |
| **An AI model vendor down** | Odelia's work falls through to the next model in its route (`llm.ts` `DEFAULT_ROUTES`, Anthropic as the safety net) | Automatic. If all are down, the app works without Odelia |
| **Telnyx, Linq, Meta or the email provider down** | That channel stops; the app and in-app updates continue | Customers are told in the app; the team files by hand if fax or mail is down |
| **Render down** | Portal filings queue and wait | The team files those by hand from the queue |
| **GitHub down** | No new changes; production keeps running | Wait; emergency changes from a local clone, recorded as emergency changes |

## Customer communication

During an outage that affects customers for more than 4 hours: an in-app update where the app is up, an email to affected owners from support@placetta.com, and a public incident entry on the trust page afterwards.

## How we prove it

1. The emergency-access setup in the password manager (a screenshot of the configuration, no secrets), and the named backup person, recorded in [RECORDS.md](../RECORDS.md#continuity).
2. The yearly tabletop record.
3. The model routes and their tests: `supabase/functions/_shared/llm.test.ts`, `scripts/extreme-test.ts` section 12 (model failover).
