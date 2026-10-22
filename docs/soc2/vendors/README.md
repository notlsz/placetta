# Vendor evidence: what to request, from whom, and what's on file

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Closes | SOC 2 CC9.2a, CC9.2d, CC6.4a; ISO/IEC 27001:2022 A.5.19 to A.5.22 |
| Status on 2026-10-22 | **Nothing is on file.** No report, bridge letter, DPA or written AI data-use confirmation has been obtained. Every "Received" cell below is empty on purpose |
| Templates | [request-templates.md](request-templates.md) |
| Policy | [vendor-management.md](../policies/vendor-management.md) (inventory and published attestations); [docs/iso27001/supplier-security.md](../../iso27001/supplier-security.md) (tiers and rules) |

Reports themselves never go in this repository: they are confidential to the vendor and usually under NDA. Keep them in the evidence folder as `vendors/<vendor>/<YYYY-MM-DD>-<report>.pdf`, and record here only that they exist, their period and their date.

## How to work the list (2 to 4 hours over 1 to 2 weeks)

1. Send the requests in tier order, using the templates. Most vendors answer from a trust portal after an NDA click-through; some only through support.
2. When a report arrives, fill in its row: type, period end, received date. Read section IV for exceptions (a qualified opinion or listed deviations) and section III for the **complementary user entity controls** (CUECs) it expects of us. Map each CUEC to a control in [CONTROLS.md](../CONTROLS.md) in the vendor review record ([RECORDS.md](../RECORDS.md#vendor-review)).
3. If the report's period ended more than 3 months before our audit's as-of date, ask for a **bridge letter** covering the gap.
4. File each DPA (accepted online or signed), with its date.
5. For AI vendors, file the written data-use confirmation (no training on our data; retention period; zero-retention mode if any). Only then may the vendor go on `AI_ZDR_PROVIDERS` ([ENTERPRISE.md](../../ENTERPRISE.md#6-zero-data-retention)).
6. Set "Next due" to 12 months after receipt, or the vendor's next report date.

## Tracker

Tier 1 is needed before a SOC 2 Type I as-of date; tier 2 before the Type II window; tier 3 is the customer's own contract and needs no report from us.

| Vendor | Tier | Request | Where | Report type and period | Received | Bridge letter | DPA on file | AI data-use terms in writing | CUECs mapped | Next due |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | 1 | SOC 2 Type 2, ISO 27001 certificate, DPA | Dashboard (Team and Enterprise) or a request to Supabase under NDA (template A) | | | | | n/a | | |
| Vercel | 1 | SOC 2 Type 2, ISO 27001:2022 certificate, DPA | security.vercel.com | | | | | n/a | | |
| Render | 1 | SOC 2 Type II, ISO 27001:2022, DPA | Render's document center (Organization tier) or a request (template A) | | | | | n/a | | |
| GitHub | 1 | SOC 2 Type 2 (GitHub publishes reports for enterprise owners), DPA | GitHub support or the enterprise compliance page (template A) | | | | | n/a | | |
| Anthropic | 1 | SOC 2 Type II, ISO 27001, ISO 42001; DPA; commercial terms on training and retention | trust.anthropic.com; template C for retention | | | | | | | |
| Google (Gemini) | 1 when `GEMINI_PAID` is on | Written scope statement covering the Gemini Developer API, or move to Vertex AI; DPA; data-use terms | Google Cloud compliance; template C | | | | | | | |
| Stripe | 2 | SOC 2 Type II, PCI DSS AOC, DPA | Stripe dashboard or support | | | | | n/a | | |
| Resend | 2 | SOC 2 Type II, DPA | Resend documents page after login | | | | | n/a | | |
| Telnyx | 2 | SOC 2 Type II (under NDA), ISO 27001:2022, DPA; retention of call audio and transcripts | Telnyx compliance page; template C | | | | | | | |
| Linq | 2 | SOC 2 Type II, DPA | Linq support (template A) | | | | | n/a | | |
| Meta (WhatsApp Cloud API) | 2 | SOC 2 Type II, ISO 27001 report, data processing terms | Meta business help | | | | | n/a | | |
| Lob | 2 | SOC 2 Type 2, DPA | lob.com/security | | | | | n/a | | |
| Microsoft (Azure Speech) | 2 | Azure SOC 2 Type 2 with the appendix confirming Speech is in scope; DPA (Microsoft Products and Services DPA) | Service Trust Portal | | | | | | | |
| Browserbase | 2 | SOC 2 Type II, DPA | Browserbase security page | | | | | n/a | | |
| Groq | 2 | SOC 2 Type II, DPA; zero data retention switched on and confirmed | Groq trust center; template C | | | | | | | |
| Cerebras | 2 | SOC 2 Type II (seen only in a third-party directory), DPA, retention terms | trust.cerebras.ai; template C | | | | | | | |
| OpenRouter | 2 | SOC 2 Type II (seen only in a third-party directory), DPA; account setting for no logging; `data_collection: deny` behaviour | trust.openrouter.ai; template C | | | | | | | |
| Postmark | 2 if used | No SOC audit of its own: questionnaire (template D) or switch Odelia's email to Resend | Postmark support | | | | | n/a | | |
| OpenAI | 2 if switched on | SOC 2 Type 2, DPA, API data-use terms | trust.openai.com | | | | | | | |
| DeepSeek | Off | Not requested: stays off | | | | | | | | |

## What "done" looks like for the audit

Every tier 1 row has a report received within the last 12 months (or a bridge letter), a DPA, and its CUECs mapped; every tier 2 row has a report or a written exception; every AI vendor in use has its data-use terms in writing. The evidence script doesn't check this; the vendor review record does.
