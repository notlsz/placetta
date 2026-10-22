# Quarterly access review (template)

Prefer the pre-filled version, which lists every staff account, GitHub collaborator and function secret the evidence bundle found, with flags:

```sh
GITHUB_TOKEN=... SUPABASE_ACCESS_TOKEN=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/soc2-evidence.mjs --out ~/placetta-evidence
node scripts/access-review.mjs --evidence ~/placetta-evidence/placetta-soc2-evidence-<date>/evidence.json \
  --quarter <YYYY-Qn> --out ~/placetta-evidence/<date>-access-review.md
```

Use this blank form only when the script can't run. Completed reviews go in the evidence folder, never in the repo: they name people. Policy: [access-control.md](../policies/access-control.md#the-quarterly-access-review). How to turn on two-step sign-in everywhere: [runbooks/mfa-and-identity.md](../runbooks/mfa-and-identity.md). Controls: SOC 2 CC6.2, CC6.3b; ISO/IEC 27001:2022 A.5.15, A.5.18, A.8.2.

```
Access review, <YYYY-Qn>, done <date> by <name>
Evidence bundle: <folder name, or "none: checked by hand">
```

## Placetta staff (`public.staff_emails`)

| Email | Name | Two-step | Last sign-in | Flags (no two-step; no sign-in for 90 days; never signed up) | Decision (keep, change, remove) | Done |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## GitHub (`notlsz/placetta`)

| Login | Role | Flags (admin who isn't the owner; bot above write) | Decision | Done |
| --- | --- | --- | --- | --- |
| | | | | |

Branch protection on `main` matches `.github/branch-protection.json`: yes / no / not yet applied

## Server function secrets (names only)

| Secret | Still used by the code | Last rotated | Decision |
| --- | --- | --- | --- |
| | | | |

## Consoles checked by hand

For each: every member still needs access; roles are the least that works; two-step sign-in is on for everyone (a security key or passkey for admins).

| Console | Where | Members and roles | Two-step on for all | Decision | Done |
| --- | --- | --- | --- | --- | --- |
| Supabase organization | supabase.com/dashboard, Organization, Team | | | | |
| Vercel team | vercel.com, Team settings, Members | | | | |
| Render workspace | dashboard.render.com, Workspace settings, Members | | | | |
| Stripe | dashboard.stripe.com, Settings, Team and security | | | | |
| Anthropic console | console.anthropic.com, Settings, Members | | | | |
| Google Cloud and Gemini | console.cloud.google.com, IAM | | | | |
| Google Workspace or company email | admin.google.com, Users (2-Step Verification enforcement) | | | | |
| Telnyx | portal.telnyx.com, Account, Users | | | | |
| Linq | Linq dashboard, Team | | | | |
| Meta (WhatsApp) | business.facebook.com, Business settings, People | | | | |
| Resend | resend.com, Team | | | | |
| Lob | dashboard.lob.com, Settings, Users | | | | |
| Microsoft Azure (Speech) | portal.azure.com, Access control (IAM) | | | | |
| Browserbase, Groq, Cerebras, OpenRouter | each console's team or members page | | | | |
| Domain registrar and DNS for placetta.com | the registrar's account users | | | | |
| Company password manager | admin console: members, emergency access | | | | |
| AI coding bot identity (`placetta-bot`) | github.com/settings/tokens as the bot: token scopes and expiry | | | | |

## Summary

```
Flagged for a decision:
Removed or changed (who, what, when):
Exceptions (what, why, until when, approved by):
Reviewed by: ____________________  Date: __________  Signature: ____________________
```
