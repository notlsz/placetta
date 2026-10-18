# Personnel Security Policy: onboarding, offboarding and training

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Employees and contractors with access to customer information or to any system in [information-security.md](information-security.md) |
| Review | Every 12 months |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 |
| Next review | 2027-10-18 |

Today Placetta is the founder. This policy applies from the first hire or contractor, and to the founder where it says so (training, acknowledgments, device settings).

## Before access

1. A background check for anyone who will reach customer information, within the law of where they live. Checkr's published per-report prices are $29.99 (Basic), $59.99 (Essential) and $94.99 (Complete), plus court fees passed through ([Checkr](https://checkr.com/prices)). Contractors without customer-data access are exempt.
2. A signed confidentiality and invention assignment agreement.
3. Signed acknowledgment of [information-security.md](information-security.md) and [acceptable-use.md](acceptable-use.md).

## Onboarding (day one)

| Step | Where |
| --- | --- |
| Company email account, two-step enforced | The company email provider |
| Password manager seat | The company password manager |
| GitHub access at the lowest role that works; added to `.github/CODEOWNERS` only if they review that area | GitHub |
| Staff access, if they work the filing queue or support: their email added to `public.staff_emails`, and two-step sign-in set up before first use (the database requires it) | Supabase, by recorded SQL |
| Only the vendor consoles their work needs | Each console |
| Work device meets [acceptable-use.md](acceptable-use.md) (disk encryption, screen lock, updates) | Screenshot in the onboarding record |

Record each step and its date in the onboarding record ([RECORDS.md](../RECORDS.md#onboarding-and-offboarding)).

## Offboarding (same day for an involuntary exit, within 24 hours otherwise)

1. Remove their email from `public.staff_emails`; sign their Supabase account out everywhere and ban or delete it.
2. Remove them from GitHub, Vercel, Render, the Supabase organization, Stripe and every vendor console; take back the password manager seat.
3. Suspend the company email account; forward or archive it.
4. Rotate any shared secret they could have seen: the Supabase service role key if they had it, and vendor keys they used.
5. Transfer anything they owned (documents, accounts, open pull requests).
6. Record each step and its time, and check it again in the next access review.

## Security training

1. Within 30 days of starting, and every 12 months, for everyone including the founder.
2. It covers: phishing and fake requests for money or access; two-step sign-in and password managers; handling customer data and SSNs; reporting incidents; and for engineers, the [AI risk register](../../AI_RISK_REGISTER.md) (prompt injection, what each model may see) and [secure-development.md](secure-development.md).
3. Options and cost: compliance platforms such as Vanta and Drata include training; standalone tools list from about $0.60 to $3.50 per user a month, and some have free tiers for a handful of users ([UnderDefense comparison, May 2026](https://underdefense.com/blog/security-awareness-training-pricing-vendor-comparison-roi/), a vendor's own survey). At one to five people, the cost is small either way.
4. Keep each completion certificate, dated.

## How we prove it

1. Per person: background check result (pass or fail only), signed agreements and acknowledgments, training certificates, onboarding and offboarding records with dates.
2. The quarterly access review, which catches accounts that offboarding missed.
