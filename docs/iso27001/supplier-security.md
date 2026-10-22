# Supplier security (Annex A 5.19 to 5.23)

| | |
| --- | --- |
| Document | ISMS-11 |
| Version | 0.1 |
| Status | **Draft for approval.** No supplier report or data processing agreement is on file yet |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) |
| Review | Every 12 months, and before a new supplier receives customer information |
| Clauses and controls | 8.1 (externally provided processes); Annex A 5.19, 5.20, 5.21, 5.22, 5.23 |
| SOC 2 cross-reference | CC9.2a, CC9.2b, CC9.2c, CC9.2d, CC6.4a |

The supplier inventory, what each receives and each attestation as published, stays in [vendor-management.md](../soc2/policies/vendor-management.md). The evidence (reports, DPAs, written confirmations) is tracked in [docs/soc2/vendors/](../soc2/vendors/README.md). This document sets the rules ISO/IEC 27001 asks for on top.

## Tiers

| Tier | Who | What we require before use | Reviewed |
| --- | --- | --- | --- |
| 1 Critical | Receives all or most customer data, or can change production: Supabase, Vercel, Render, GitHub, Anthropic, and Google Gemini when `GEMINI_PAID` is on | A current SOC 2 Type 2 report or ISO/IEC 27001 certificate covering the service used, read and filed; a DPA; written data-use terms (no training, retention); the user-entity controls in their report mapped to ours | Yearly, and at any breach notice |
| 2 Limited | Receives a narrow slice (text only, one channel, payments): Stripe, Resend, Telnyx, Linq, Meta, Lob, Microsoft Azure Speech, Browserbase, Groq, Cerebras, OpenRouter, Postmark, OpenAI, DeepSeek | An attestation or a written exception naming what the supplier gets and why it is acceptable; DPA where personal data is involved; `vendorOk` rules for AI vendors | Yearly |
| 3 Customer-chosen | Services a customer connects (Google, Microsoft, Dropbox, Intuit, Slack, Lark, WeCom, DingTalk, Toast, Square, Tencent WeChat, MCP apps) | The customer holds the contract; we use the narrowest scopes, keep tokens in Vault, and act only on approval | When the integration changes |

## Rules

1. **Before onboarding** a supplier that will receive customer information: classify its tier, collect the evidence for that tier, record it in the tracker, add it to the trust page's subprocessor list and to `vendorOk` if it is an AI vendor, all in the same pull request (the PR template asks).
2. **Agreements (5.20)**: for tiers 1 and 2, accept or sign the supplier's DPA, and keep a copy with its date. Note the clauses that matter: breach notice time, subprocessors, data location, deletion at end, audit rights or reports.
3. **ICT supply chain (5.21)**: software dependencies are controlled in CI (lockfiles, SHA-pinned Actions, the audit gate, Dependabot, gitleaks; [secure-development.md](../soc2/policies/secure-development.md)). AI model routing is code-reviewed (`llm.ts`).
4. **Monitoring (5.22)**: once a year, the vendor review record ([RECORDS.md](../soc2/RECORDS.md#vendor-review)): status still as listed, report downloaded, exceptions in the report and whether they matter to us, the complementary user-entity controls the report expects, and how we meet them. Status pages of tier 1 suppliers are subscribed to.
5. **Cloud services (5.23)**: for each tier 1 cloud provider, record the shared-responsibility split (what they secure, what we configure: RLS, keys, MFA, backups, logging) and the exit plan. Exit for Supabase and Render is the off-site copy and `render.yaml`; for Vercel, any static host; for GitHub, every clone.
6. **Exceptions** (a supplier without a report, an endpoint outside the audited scope, a plan tier without report access) are written in [RECORDS.md](../soc2/RECORDS.md#exceptions) with the compensating control and an end date, and reviewed at the management review.

## Known exceptions today (to decide at approval)

| Supplier | Gap | Proposed handling |
| --- | --- | --- |
| Google Gemini Developer API | Not shown in Google's audit scope | Keep `GEMINI_PAID` off, or move to Vertex AI |
| Render (starter plan) | SOC 2 report only on the Organization tier | Move tier, or record the exception with the filer's new least-privilege role as the compensating control |
| Supabase | Report in the dashboard only on Team and Enterprise | Ask Supabase for a copy under NDA before buying Team |
| Postmark | No SOC audit of its own | Use Resend for Odelia's email, or record the exception |
| Groq, Cerebras, OpenRouter | Attestations seen only in third-party directories; retention settings unconfirmed | Request reports and written terms (templates in docs/soc2/vendors) |
| DeepSeek | No attestation; PRC-hosted | Keep off |

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder) | | | | |
