# Runbook: two-step sign-in on every console, and a company identity provider

| | |
| --- | --- |
| Who runs it | The founder, in each console's own settings |
| Time | 3 to 5 hours the first time; then part of the quarterly access review |
| Cost | Google Workspace Business Starter about $7 a user a month on a yearly plan (or keep the current provider if it enforces two-step); two hardware security keys, roughly $50 to $60 each; a business password manager plan |
| Closes | SOC 2 CC6.1f, CC6.1g, CC9.1a, A1.2c; ISO/IEC 27001:2022 A.5.16, A.5.17, A.8.2, A.8.5; FedRAMP IA-2, IA-2(1), IA-5 |
| Status on 2026-10-22 | **No evidence exists** that two-step sign-in is on for any admin console, and there is no company identity provider. Placetta's own app already requires two-step for staff (`is_staff()`); this runbook covers everything around it |

Every console listed here can reach customer data or change production. An attacker who gets one password gets that console; two-step sign-in, ideally with a security key or passkey that can't be phished, closes that path. Prices are typical list prices, not quotes; check each before buying.

## Step 1. The company identity (2 hours)

1. Use one company identity for every work account: an `@placetta.com` account in **Google Workspace** (or Microsoft 365 / Entra ID if the company already uses it). No work console stays on a personal email address. Accounts on a personal address are moved, or recorded as exceptions with an end date.
2. In the Google Admin console: Security, Authentication, 2-Step Verification: **allow and enforce** it for everyone, with a new-user enrolment period of at most 7 days. For the admin account, set the allowed methods to **security key only** (Advanced Protection is the stricter form). Check that the edition you buy offers enforcement for all users before paying; Google's pricing page did not state it when last checked.
3. Turn off "less secure apps" and app passwords for everyone except named service accounts.
4. Evidence: a screenshot of the enforcement setting, and the user list showing 2-Step Verification "Enforced" or "On" for every user.

## Step 2. The password manager and emergency access (1 hour)

1. A business plan of one password manager (1Password, Bitwarden or similar) owned by the company, signed in with the company identity, with its own two-step.
2. Every console password, every recovery code from step 3, the age backup key ([backup-restore.md](backup-restore.md)) and every secret value that's also in Supabase, Vercel or Render go in it.
3. **Emergency access** for a named backup person, with a waiting period (for example 48 hours) during which the founder can refuse. Test it once and record it in the continuity record ([RECORDS.md](../RECORDS.md#continuity)).

## Step 3. Two-step sign-in on every console (2 hours)

Buy two security keys: one on the keychain, one in a safe place. Register **both** on every console that supports them, and a passkey on the laptop where offered. Use an authenticator app only where keys aren't supported. Never SMS, unless it's the console's only option (then record the exception).

| Console | Where to turn it on | Enforce for the whole team, if the console offers it | Single sign-on to the company identity |
| --- | --- | --- | --- |
| GitHub (`notlsz`, and the bot `placetta-bot`) | Settings, Password and authentication | For an organization: Settings, Authentication security, "Require two-factor authentication" | SAML needs GitHub Enterprise Cloud; not needed now |
| Supabase | Account, Security (multi-factor) | Organization settings, if a "require MFA" option is shown on the plan | "Continue with SSO" exists on higher plans; check the plan page |
| Vercel | Account settings, Authentication | Team settings, Security, if offered on the plan | SAML is on higher plans; sign in with the company Google account meanwhile |
| Render | Account settings, Security | Workspace settings, if offered | Organization tier and above |
| Stripe | Settings, Personal details, Two-step authentication | Settings, Team and security, "Require two-step authentication" | Settings, Team and security, Single sign-on, where available |
| Anthropic console | Settings, Account | Organization settings, if offered | Check the plan |
| Google Cloud | Uses the Workspace identity (step 1) | Enforced by step 1 | Already the company identity |
| Telnyx, Linq, Resend, Lob, Browserbase, Groq, Cerebras, OpenRouter, Meta Business, Microsoft Azure | Each account's security settings | Where offered | Sign in with the company Google or Microsoft account where offered |
| Domain registrar and DNS for placetta.com | Account security | Also turn on the registrar's transfer lock and registry lock if offered | Check the registrar |
| Apple, Google Play, any app store accounts, if used | Account security | | |

For each console, save the recovery codes in the password manager, then record in the access review: the account, its email (company address?), the two-step method, and whether team-wide enforcement is on.

Check GitHub from the terminal (the founder's own account):

```sh
gh api user --jq '{login, two_factor_authentication}'
```

## Step 4. AI coding sessions and machine identities

1. AI coding sessions use the bot identity and token from [branch-protection.md](branch-protection.md), step 2, never the founder's own accounts.
2. The Supabase connector those sessions use is **read-only** (CONTROLS.md CC6.3c).
3. Each machine identity (the bot, the backup role, the log token, the filer's database key) has an owner, a purpose, the narrowest scope, and an expiry or rotation date, recorded in the access review.

## Step 5. Keep it true

The quarterly access review ([records/access-review-template.md](../records/access-review-template.md), pre-filled by `scripts/access-review.mjs`) re-checks every console's members and two-step status. A new console gets two-step on the day it's created. A departing person's company identity is suspended the same day, which, once consoles sign in through it, removes their access everywhere at once.

## Record

| Date | Step | Result | Evidence | By |
| --- | --- | --- | --- | --- |
| | Company identity with two-step enforced | | | |
| | Password manager with emergency access, tested | | | |
| | Two security keys registered on each console (list them) | | | |
| | Team-wide enforcement switched on where offered (list them) | | | |
| | Bot identity and machine identities recorded | | | |
