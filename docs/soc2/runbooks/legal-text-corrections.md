# Runbook: claims in the Privacy Policy and Terms that run ahead of production

| | |
| --- | --- |
| Who runs it | The founder, with counsel |
| Time | 1 hour, plus counsel's review |
| Closes | SOC 2 CC2.3a, CC1.1b; ISO/IEC 27001:2022 A.5.31, A.5.34; risk K5 |
| Status on 2026-10-22 | **Open.** The trust page, the landing page and the help pages were corrected on 2026-10-22. The legal documents were deliberately not edited, because changing them is a new legal version |

## Why these weren't edited with the site

The Privacy Policy, Terms, Filing Authorization and AI page are generated from `src/legal.ts` (`npm run legal`), and `UPDATED` in that file is also the version customers accept in the app. `scripts/build-legal.mts` refuses a build unless `public.current_terms_version()` in the newest migration matches it. A new version means a new migration, and the Terms say that until a customer accepts it they can read their workspace but can't approve anything new. That's a product decision with counsel, not a copy edit.

## The statements to fix

| Where | Today's text | Why it's ahead of production | Two ways to make it true |
| --- | --- | --- | --- |
| Privacy Policy, "Your choices and rights"; Terms, "Ending your use" (both in English and Chinese) | "Download your workspace data and export the audit trail in Settings, Privacy and data." | For accounts, the export calls `audit_export`, which exists only in `20261022000000_enterprise_access.sql`, not applied to the live database. The button would fail | (a) Apply the enterprise migration and deploy its functions ([ENTERPRISE.md](../../ENTERPRISE.md#deploy)); the sentence then becomes true with no legal change. (b) At the next legal version: "Download your workspace data, including the audit trail entries shown in the app, in Settings, Privacy and data." |
| Privacy Policy, "Integrations", the Google API Limited Use list (English and Chinese) | "We don't use it, or any other customer content, to train or improve AI models. The AI models that process it on your behalf are bound not to train on it." | The first sentence is Placetta's own commitment and true. The second covers every model: true for Anthropic under its commercial terms, but for the backup providers (Groq, Cerebras, OpenRouter) and Gemini's paid tier no written confirmation is on file ([vendors/README.md](../vendors/README.md)), and the AI register (R4) notes Gmail text can reach the backups as text. Because this list is Placetta's statement under Google's Limited Use requirements, close it first | (a) Collect the written confirmations (template C) for every provider in the routes; then the sentence holds. (b) At the next legal version: "We choose AI providers whose terms for our account don't allow training on what we send, and we list them on our Trust page." and keep the trust page's per-provider detail |

The site already says the scoped version: the landing page reads "We never sell your content or use it to train AI models" and the trust page marks the backup providers' written confirmation "In progress".

## If you choose a new legal version

1. Edit the sentences in `src/legal.ts` (English and Chinese together; `scripts/build-legal.mts` checks the headings and bold spans line up and that no en or em dash slipped in).
2. Set `UPDATED` to the new date, and add a migration whose `public.current_terms_version()` returns that date (copy the newest one that defines it).
3. `npm run legal`, then `npm run seo`, then `npm run test:seo`.
4. Counsel reviews the diff before it ships. Notify customers as the Terms' "Changes" section requires.

## Record

| Date | Choice (a or b, per statement) | Done | Counsel | By |
| --- | --- | --- | --- | --- |
| | | | | |
