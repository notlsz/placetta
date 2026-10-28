# Legal changes: version 2026-10-27 (Autopilot)

> **Counsel review required before publishing.** Migration `20261103090000_autopilot.sql` makes
> `public.current_terms_version()` return `2026-10-27`, so everyone accepts again, as below.

- Filing Authorization: a new "Autopilot" section. An owner may sign one standing authorization (typed name, typed or
  drawn signature, the box; recorded with time, IP, browser and the version shown) for chosen stores, agencies and
  filing types, a per-filing and a monthly agency-fee cap, 12 months, revocable in one tap or by email. Each filing
  passes every automated check first and is reported as "Filed for you", undoable until it leaves Placetta. The adopted
  signature is placed only where the agency's page says it takes an electronic signature and the signature swears,
  certifies or attests to nothing; a declaration under penalty of perjury is always the signer's own act. Fees stay the
  owner's; no agency account is created; CAPTCHAs and identity checks stop it; two-owner business rules still apply.
- "What you authorize", "Signatures", "What we never do" and "Agency portal logins" name the Autopilot exception.
- Terms ("Your approval comes first", "What Placetta may do for you", the disclaimer's carve-out), Privacy (security
  list) and the AI page ("What it never does on its own") say a filing needs an owner's approval or their Autopilot
  authorization.

# Legal changes: version 2026-10-22

> **Counsel review required before publishing.** Nothing here is live. The new text is in `src/legal.ts`
> (`UPDATED = "2026-10-22"`) and is built into `legal/*.md` and `site/{terms,privacy,authorization,ai}.html`. Migration
> `20261029090000_terms_version_2026_10_22.sql` makes `public.current_terms_version()` return `2026-10-22`; once it is
> applied, every signed-in person must accept again before approving anything new, and the Terms' 30-day notice
> applies to existing customers. Don't apply it or deploy the pages until counsel has signed off and the notice email is
> ready. Set `UPDATED` (and the migration) to the real publication date if it isn't 2026-10-22.

Founder's request: update the Terms and Privacy Policy, and score them out of 10 against the competitors.

## Scorecard

Each criterion is scored 0 to 10 from the public documents fetched on 2026-10-22 (sources below). The Terms score is the
mean of criteria 1, 2, 3, 4, 6, 7, 8 (only where it applies: Harvey, Legora, LegalZoom, Placetta), 9 and 11; the
Privacy score is the mean of 1, 2, 3, 4, 5, 10 and 11. Competitors are scored on what they publish; their enterprise
order forms and signed DPAs may give more.

### Overall

| Company | Terms | Privacy |
| --- | --- | --- |
| Vanta | 5.8 | 6.4 |
| Harvey | 5.8 | 6.9 |
| Legora | 6.8 | 6.1 |
| Harbor Compliance | 2.0 | 2.4 |
| LegalZoom | 3.3 | 3.1 |
| Stripe Atlas | 4.5 | 3.4 |
| Avalara | 6.1 | 5.3 |
| Anthropic | 6.0 | 6.6 |
| OpenAI | 6.4 | 7.1 |
| Perplexity | 4.8 | 5.0 |
| Cognition (Devin) | 3.9 | 3.6 |
| **Placetta, before (2026-10-13)** | **6.4** | **6.6** |
| **Placetta, after (2026-10-22)** | **8.2** | **8.1** |

The Chinese-language criterion favours Placetta (only Stripe Atlas publishes Simplified Chinese). Without it: Placetta
before 6.0 and 6.0, after 8.0 and 7.8.

### Per criterion

| Criterion | Vanta | Harvey | Legora | Harbor | LegalZoom | Atlas | Avalara | Anthropic | OpenAI | Perplexity | Cognition | Placetta before | Placetta after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Clarity, plain language | 6 | 5 | 6 | 3 | 3 | 5 | 6 | 6 | 6 | 7 | 4 | 9 | 9 |
| 2 AI: training, outputs, human review | 8 | 9 | 9 | 1 | 2 | 1 | 8 | 9 | 9 | 8 | 5 | 6 | 9 |
| 3 Data rights: export, deletion, retention, DPA | 7 | 7 | 8 | 3 | 3 | 3 | 7 | 8 | 9 | 5 | 5 | 5 | 7 |
| 4 Security commitments | 9 | 9 | 8 | 4 | 4 | 2 | 6 | 8 | 8 | 5 | 4 | 5 | 7 |
| 5 Subprocessor transparency | 8 | 10 | 6 | 1 | 3 | 2 | 4 | 7 | 9 | 3 | 2 | 6 | 8 |
| 6 Liability and indemnity fairness | 7 | 9 | 8 | 2 | 2 | 3 | 8 | 8 | 8 | 6 | 4 | 5 | 5 |
| 7 Pricing, renewal, refunds | 6 | 4 | 7 | 2 | 4 | 5 | 8 | 5 | 6 | 5 | 6 | 4 | 9 |
| 8 Unauthorized practice of law | n/a | 6 | 8 | n/a | 9 | n/a | n/a | n/a | n/a | n/a | n/a | 7 | 9 |
| 9 Agent authority: actions, approvals, logins, signatures | 3 | 3 | 7 | 1 | 2 | 9 | 6 | 4 | 4 | 2 | 3 | 7 | 9 |
| 10 CCPA and GDPR completeness | 7 | 8 | 6 | 5 | 6 | 3 | 6 | 8 | 8 | 7 | 5 | 5 | 7 |
| 11 Chinese for our customers | 0 | 0 | 0 | 0 | 1 | 8 | 0 | 0 | 1 | 0 | 0 | 10 | 10 |

Why Placetta scored what it did before: pricing described only the old plans, so every new customer read the wrong
prices (4); the Privacy Policy said every AI model is "bound not to train" with no written confirmation on file for the
backup providers (AI 6); no subprocessor location except two, and Toast, Square, WeChat and MCP apps missing (6); no
retention for the audit trail once the hardening migration runs, an export the app can't do yet, no DPA (5); security
only in the Privacy Policy, no breach notice (5); no CCPA categories table, nothing for the EEA though the Europe module
sells there (5); appeals, inspection booking, status checks and AI assistant tokens not covered (UPL 7, authority 7).

### The strongest pattern to copy from each

| Company | Pattern | Used here as |
| --- | --- | --- |
| Vanta | AI features voluntary, admins can turn them off, a no-training promise in the contract; an FAQ beside the MSA | "AI models and your content" in the Terms; memory off by default stated |
| Harvey | Subprocessor table with purpose and location for each, a change-notice signup, a preview page | "Who processes it": purpose and where each is based, added before it receives data |
| Legora | Agentic tools warranted to stay within the user's instructions; human review named; "not a law firm, does not practice law" | "What Placetta may do for you, and when"; "Appeals and denials" |
| Harbor Compliance | 72-hour breach notice in the privacy policy | Breach notice within 72 hours of confirming (Terms "Security", Privacy "Security") |
| LegalZoom | Not a law firm, no attorney-client relationship, independent attorneys introduced | Kept, and extended to appeals and the attorney packet |
| Stripe Atlas | Explicit, itemised authority (incorporator, EIN, signature applied only to documents the signer saw); a Simplified Chinese edition | Filing Authorization now itemises inspection booking, logins and what is never done; ZH kept in step |
| Avalara | 60-day notice of renewal price changes, a no-training-without-consent clause, a "Customer Agent" clause | Renewal and cancellation section; 30-day price notice kept; who approves made explicit |
| Anthropic | Customer owns outputs; customer decides whether human review is needed; IP indemnity for outputs | Output clause added; IP indemnity left as an open item |
| OpenAI | Subprocessor email notices with a 30-day objection right; deletion within 30 days of termination | Partly (list updated before a new company receives data); notice and objection left open |
| Perplexity | A plain summary at the top; "not a substitute for advice from a qualified professional" | Plain style kept; appeals disclaimer |
| Cognition (Devin) | Zero data retention turned on with model providers when a customer opts out | Stated honestly as not in force, with the approved "we're asking" wording |

### Sources (read 2026-10-22)

Vanta: [MSA](https://vanta.com/legal/terms) (Nov 21, 2025), [MSA FAQ](https://www.vanta.com/legal/terms-faq),
[legal hub](https://www.vanta.com/legal), privacy policy via [ToS tracker copy](https://tostracker.app/document/vanta-privacy)
(vanta.com/legal/privacy and trust.vanta.com/subprocessors were blocked to the fetch tool).
Harvey: [Platform Agreement](https://www.harvey.ai/legal/platform-agreement) (Jan 9, 2026),
[Security Addendum](https://www.harvey.ai/legal/security-addendum), [subprocessors](https://www.harvey.ai/legal/subprocessors),
[privacy policy](https://www.harvey.ai/legal/privacy-policy), [AI policy](https://www.harvey.ai/en-US/legal/ai-policy).
Legora: [General Terms](https://legora.com/legal/cbp-general-terms-and-conditions-_aug26) (Aug 2026),
[privacy policy](https://legora.com/legal/privacy-policy-feb2025) (Feb 2025).
Harbor Compliance: [Terms of Use](https://www.harborcompliance.com/terms-of-use) (Jun 5, 2026),
[privacy policy](https://www.harborcompliance.com/privacy-policy) (Sep 18, 2026); its customer Terms of Service isn't public.
LegalZoom: [Terms of Use](https://www.legalzoom.com/legal/general-terms/terms-of-use) (Apr 21, 2026),
[privacy policy](https://legalzoom.com/legal/general-terms/privacy-policy) (Jul 9, 2026).
Stripe Atlas: [Atlas terms](https://stripe.com/legal/atlas) (Jul 22, 2025), [language versions](https://stripe.com/atlas/legal).
Avalara: [Service Terms 7.2](https://legal.avalara.com) (Oct 19, 2026).
Anthropic: [Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (Jun 17, 2025),
[DPA](https://www.anthropic.com/legal/data-processing-addendum), [privacy policy](https://www.anthropic.com/legal/privacy?mode=reply)
(Sep 10, 2026); the subprocessor list redirects to trust.anthropic.com, which was blocked to the fetch tool.
OpenAI: [Services Agreement](https://openai.com/policies/services-agreement/) (Jan 1, 2026),
[DPA](https://openai.com/policies/data-processing-addendum/), [privacy policy](https://openai.com/policies/privacy-policy) (Sep 10, 2026).
Perplexity: [Enterprise terms](https://hub-prod.perplexity.ai/hub/legal/enterprise-terms-of-service) (Feb 6, 2026),
[API terms](https://hub-prod.perplexity.ai/hub/legal/perplexity-api-terms-of-service),
[privacy policy](https://hub-prod.perplexity.ai/hub/legal/privacy-policy) (Oct 31, 2025).
Cognition: [Platform Terms](https://cognition.com/legal/platform-terms-of-service) (Jun 30, 2026),
[privacy policy](https://cognition.com/legal/privacy-policy) (Mar 9, 2026).

## Material changes, old and new

Terms of Service (English and Chinese in step):

| Section | Old (2026-10-13) | New (2026-10-22) |
| --- | --- | --- |
| Plans and billing | Entry plan, Essentials, Pro, openings, the guarantee, packs, as the only prices | The store plan ($149 a store a month, billed yearly, $1,788 a store a year), $299 a new license, $999 a complex license (liquor, building plan review, import only), $99 a renewal the plan doesn't include, every new license included at 10 or more stores, never-charged items, free plan preview, government fees at cost. Every charge shown before approval and charged only on it |
| Renewal and cancellation (new) | One paragraph: renews yearly, 30 days' notice of a price change, cancel in Settings | Renews yearly at the same price, terms shown next to the button, notice 15 to 45 days before each renewal, 30 days' notice of a price change, one-click online cancel, per-filing charges need no cancelling |
| Refunds (new) | "Non-refundable, except under the guarantee or where the law requires" | Store plan not refunded on cancel (except adverse change or law); a filing fee is earned once submitted; a refund when Placetta declines or can't submit a paid filing and you don't want a retry |
| Plans from before (new) | n/a | Existing customers keep their plan and price unchanged; moved only with an owner's written agreement; the old price list kept for them |
| Open-by-date guarantee | Offered to everyone; "What Placetta is not" described it | Only on plans from before; not offered with the store plan; removed from "What Placetta is not" |
| Government fees | "Placetta never charges agency fees" | At cost, paid to the agency, never marked up, no part kept |
| What Placetta may do for you, and when (new) | Approval rules spread across sections | Three tiers: without asking, only after an owner approves that item (file, send, book an inspection, change a connected app), never (pay, sign, swear, appeal, appear, create agency accounts, send SSN/ITIN/passport) |
| Monitoring | Dates and reminders | Adds the daily status check and that the agency's own notice controls |
| Odelia is an AI | Output can be wrong; you approve | Adds memory (off by default, owner-approved, "why Odelia remembered this") and the automatic checks, including the 1 in 5 sample |
| AI models and your content (new) | One line in "Your content" | No training; providers chosen whose terms don't allow training; zero data retention not in force, with the approved wording; prompt cache; output usable by you; technical task records hold no content |
| Sharing with a partner (new) | Not mentioned | Partner sees four fields only with consent; may receive a revenue share; price unchanged |
| Appeals and denials (new) | Not mentioned | Official process cited, deadline counted from the rule, unconfirmed rules never dated, drafts are not advice, never files or appears, attorney packet only with approval |
| Connected services | Eight services | All services the app offers, MCP apps; reads run on their own, changes wait for an owner |
| Connecting an AI assistant (new) | Not mentioned | Per-workspace, scoped, read-only tokens shown once, kept as a fingerprint, logged, revocable, die with the maker's role; the assistant's provider is the customer's responsibility |
| Security (new) | Not in the Terms | Points to the Privacy Policy and trust page; no certification held; breach notice within 72 hours of confirming |
| Ending your use | "Download your data and export the audit trail" | "Download your workspace data, including the audit trail entries shown in the app" (the audit export isn't live) |
| Fair use | Pro twice Essentials, packs | Same, scoped to plans from before |

Filing Authorization: adds booking inspections an owner approves (portal with the saved login, or phone or email);
never creating an agency account; never filing an appeal or appearing at a hearing; logins opened only for an approved
filing or booking, typed by the software, never seen by the model; CAPTCHA and identity checks go to the owner.

Privacy Policy:

| Section | Old | New |
| --- | --- | --- |
| What we collect | No status, inspection, appeal, token, trace or partner records | Each of those listed, with what it holds |
| How we use it | 11 purposes | Adds status checks, inspection booking, appeals, AI assistants, the 1 in 5 quality sample, cost measurement |
| Who processes it | Names and purpose; location for Supabase and Render only; Toast, Square, WeChat, MCP apps missing | Purpose and where each company is based for every line; Toast, Square, WeChat and MCP apps added; DeepSeek, WeCom, DingTalk, WeChat (China) and Lark (Singapore) marked; Cloudflare and Google DNS named as receiving domain names only; list updated before a new company receives data |
| AI models (new) | "The AI models that process it on your behalf are bound not to train on it" | Per-provider basis for no training; written confirmation from backup providers in progress; zero data retention not in force; prompt cache; automatic checks |
| Integrations, Google Limited Use | "bound not to train" | "We choose AI providers whose terms for our account don't allow training" (runbook `legal-text-corrections.md`, option b) |
| Connecting an AI assistant, Sharing with a partner (new) | n/a | As in the Terms |
| Retention | Audit trail deleted with the workspace; nothing on new records | Audit trail kept up to 7 years after the workspace is deleted; new records kept with the workspace; the daily cleanup described as rolling out |
| Security | No certification statement; no breach notice | "No SOC 2 or other certification today"; token fingerprints; model never sees passwords; 72-hour breach notice; trust page link |
| Your choices | Export the audit trail | Export wording fixed; revoke tokens, turn memory off, stop partner sharing |
| US state privacy rights | Rights list only | California disclosures: categories (with sensitive personal information), sources, purposes, recipients, no sale or sharing in 12 months, no ad cookies, retention pointer |
| EEA, UK and Switzerland (new) | n/a | Controller and processor roles, legal bases, rights, complaint, transfer destinations |

AI page: adds status checks, inspection booking, appeals, the automatic checks, the training basis, zero data retention
not in force, and memory.

Unchanged on purpose: texts and calls (its consent version `phone_consent_version()` stays 2026-10-13), headquarters
sharing, disclaimers, limitation of liability, indemnity, arbitration, changes and the 30-day notice and re-accept rule.

## Open items for counsel and the founder

1. Publication date and notice: set `UPDATED` and the migration to the real date; send the 30-day notice with a summary
   (the table above). Decide whether any change is adverse to existing customers (none is intended: their plans are kept).
2. Refund for a paid filing Placetta declines or can't submit: a new promise, founder to confirm. Also decide whether a
   resubmission after an agency rejects a filing is covered by the first $299: `license_charge_use` makes the next
   filing for the same license a $99 renewal. The landing FAQ's refund answer (not edited: landing copy is frozen) is
   narrower than the new Terms.
3. Training: no written no-training confirmation is on file for Groq, Cerebras, OpenRouter or the Gemini Developer API
   (`docs/soc2/policies/vendor-management.md`). "Terms for our account don't allow training" rests on their published
   terms; confirm before publishing, since the Google Limited Use statement relies on it.
4. Subprocessors: Cloudflare and Google public DNS are disclosed under "Beyond these companies" (domain names only):
   counsel to decide whether they belong on the list itself (`SECURITY-AUDIT.md` founder step 6). "Based in" is each
   company's home country, not every processing location: confirm against each DPA (Lark vs Feishu entity, OpenRouter's
   hosts). Consider Harvey's and OpenAI's advance notice and objection right; today it is "added before it receives data".
5. No DPA is offered, and there is no transfer mechanism (standard contractual clauses) or EU or UK representative,
   while the Europe and Mexico module sells there. The EEA section states roles, bases and rights only.
6. Audit trail kept up to 7 years after deletion: a founder decision from `data-classification-retention.md`; a purge
   must exist before the first rows reach 7 years. Backups: still none, so the backup retention line is unchanged.
7. 72-hour breach notice comes from the incident response policy, which is drafted and not yet approved.
8. "About 1 in 5" is marked FOUNDER TO CONFIRM in `docs/QUALITY.md`.
9. Liability and indemnity are unchanged: a $100 floor, a one-way customer indemnity, no IP indemnity and no data-breach
   super-cap, where Harvey, Vanta, Legora, Anthropic and OpenAI give both. This is the lowest Placetta criterion (5).
10. Appeals: confirm that drafting appeal letters and evidence lists, state by state, isn't the practice of law
    (DoNotPay's FTC order is the cautionary case), and the attorney packet process.
11. Partners: a revenue share is now disclosed; partners include accountants, whose professional rules may require
    their own disclosure of a commission.
12. Features described that aren't live in production yet (status tracking, inspection booking through the portal
    worker, MCP tokens, partners, the daily cleanup): confirm they are live before publishing, or add "when available".
13. Output clause ("yours to use for your business") is new.
14. California automatic renewal: the 15 to 45 day notice follows `src/contract.ts`; counsel to confirm against the
    chaptered text of AB 2863 (an existing founder step).

## Checks run (2026-10-22)

`node scripts/build-legal.mts` (headings, bold spans, dashes, version: pass), `tsc -b` (pass), `npm run build` (pass),
`npm run test:words` (pass), `npm run test:agent` (1,360 passed, including the version check), `npm run test:e2e`
(395 of 395, including the clickwrap: the new version is accepted and a stale one refused), the database tests
(`supabase/tests`, 46 files, 1,221 checks, on a throwaway Postgres with every migration), `npm run test:seo` (78 of 79:
the one failure is on main already: `site/index.html`, `zh.html` and `editorial.html` differ from
`scripts/seo/dates.json`, which isn't committed by rule). The live Supabase project was not touched and nothing was
deployed.
