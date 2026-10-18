# Vendor Management Policy

| | |
| --- | --- |
| Owner | Founder (security lead) |
| Applies to | Every company that stores, processes or can see customer information, and the services we run on |
| Review | Every 12 months, and before a new vendor receives customer information |
| Approved | Not yet: drafted 2026-10-18 for the founder's approval |
| Last reviewed | 2026-10-18 (statuses below checked that day) |
| Next review | 2027-10-18 |

## Rules

1. The subprocessor list on [site/trust.html](../../../site/trust.html#subprocessors) is the public list. It is taken from the code: a vendor whose API the code doesn't call isn't on it, and a vendor the code calls must be. The table below is the internal copy with each vendor's security status.
2. Before a vendor receives customer information: read its security attestation (SOC 2 Type II or ISO 27001), its data processing terms, and whether it may train on or keep what we send. Record all three here in the same pull request that wires it in. The PR template asks.
3. A vendor with no independent attestation may be used only when the data it gets is limited (no files, no credentials) and the gap is written in the table, or when the customer chooses to connect it.
4. AI vendors also follow `vendorOk` in `supabase/functions/_shared/llm.ts`, which decides what each may see. [docs/AI_RISK_REGISTER.md](../../AI_RISK_REGISTER.md) is the source for those rules.
5. Every 12 months: re-check each status, download the reports we're entitled to, and note the controls each report says the customer (us) must run. Store the reports in the evidence folder, not in the repo.
6. A vendor's breach notice is an incident: follow [incident-response.md](incident-response.md).

## Vendors and their status

"Report on file" is whether we hold a copy of the report. On 2026-10-18 we hold none: requesting them is a founder action in [the readiness checklist](../README.md). Statuses are as each source stated on 2026-10-18; a third-party directory is marked as such and needs confirming with the vendor.

### Running the service (always on)

| Vendor | What it does for us | What it receives | SOC 2 | ISO 27001 | Report on file | Source |
| --- | --- | --- | --- | --- | --- | --- |
| Supabase | Database, file storage, sign-in, server functions (US East) | Everything: workspaces, documents, texts, audit trail, vault secrets | Type 2, audited yearly (1 March to 28 February) | Certified | No. Supabase gives the report and certificate in the dashboard on Team and Enterprise plans only | [SOC 2 and Supabase](https://supabase.com/docs/guides/security/soc-2-compliance), [Security at Supabase](https://supabase.com/security) |
| Vercel | Hosts placetta.com and the app | Request logs (IP, browser), the built app; no database access | Type 2 (Security, Confidentiality, Availability) | 27001:2022 | No. Request at security.vercel.com | [Vercel compliance](https://vercel.com/docs/security/compliance) |
| Stripe | Plan payments | Billing contact, card details (we never see full numbers) | SOC 1 and SOC 2 Type II yearly, on request; SOC 3 public; PCI DSS Service Provider Level 1 | Not stated | No | [Security at Stripe](https://docs.stripe.com/security) |
| Resend | Sign-in emails, reminders, updates; can receive email to Odelia | Recipient addresses and message text | Type II, period 1 February 2025 to 1 February 2026 | Not stated | No. Documents page after login | [Resend SOC 2](https://resend.com/security/soc-2) |
| Anthropic | Claude models: the reviewer, research, the portal filer, the fallback for Odelia | Everything in a request, files included | Type I and Type II | 27001:2022, and ISO/IEC 42001:2023 | No. trust.anthropic.com | [Anthropic certifications](https://privacy.claude.com/it/articles/10015870-quali-certificazioni-ha-ottenuto-anthropic) (Italian edition of the support article) |
| Google Fonts | Typefaces on placetta.com and in the app | Visitor IP address and browser | Not listed | Not listed | Not available | Not in Google's [services in audit scope](https://cloud.google.com/security/compliance/services-in-scope/index-20260716) (archived 16 July 2026). Fix: self-host Inter and Noto Sans SC and drop this vendor |

### AI models (when used)

| Vendor | What it receives | SOC 2 | ISO 27001 | Report on file | Source and notes |
| --- | --- | --- | --- | --- | --- |
| Google Gemini (Gemini Developer API, `generativelanguage.googleapis.com`) | Everything in a call, files included, only with `GEMINI_PAID=1` | Not confirmed for this endpoint | Not confirmed | No | Google's audit scope lists "Generative AI on Vertex AI", not the Gemini Developer API by that name ([services in scope](https://cloud.google.com/security/compliance/services-in-scope/index-20260716)); a Google forum answer of 29 May 2025 says Google AI Studio is not ISO 27001 certified ([thread](https://discuss.ai.google.dev/t/is-google-ai-studio-iso-27001-soc2-certified/77210)). Fix: call Gemini through Vertex AI, or get Google's written scope statement, before `GEMINI_PAID` goes on |
| Groq | Text only, never files | Type II referenced in the GroqCloud DPA (effective 15 October 2025) | Not stated | No | Secondary source: [vorplabs summary](https://vorplabs.com/models/groqcloud-inference-provider-operations), citing Groq's DPA and data-retention pages. Zero Data Retention is a setting, not the default; without it Groq may keep logs up to 30 days. Confirm in Groq's Trust Center and turn ZDR on |
| Cerebras | Text only, never files | Type II per a third-party directory | Not stated | No | [trustlists.org](https://trustlists.org/company/cerebras-systems/) (unclaimed listing, "verified Jun 2026"); confirm at trust.cerebras.ai |
| OpenRouter | Text only, never files; routes to the host it picks | Type II per a third-party directory | Not stated | No | [trustlists.org](https://trustlists.org/company/openrouter/) (unclaimed, "verified Sep 2026"); confirm at trust.openrouter.ai. Calls ask for hosts that don't keep or train on prompts (`llm.ts`, commit `07494a28`) |
| OpenAI | Everything, if a route names it; off by default | Type 2 (the 2025 report covered the API Platform) | 27001:2022 covering the API; also 27017, 27018, 27701, 42001 | No | [OpenAI Trust Portal](https://trust.openai.com/) |
| DeepSeek | Text only, never files; off by default and needs `ALLOW_DEEPSEEK=1`; PRC-hosted | No first-party attestation found | No first-party attestation found | No | A [Nudge Security profile](https://security-profiles.nudgesecurity.com/app/deepseek-com) lists both as "compliant" with no report. Treat as unattested; keep it off |

### Messages, calls and filing (when used)

| Vendor | What it receives | SOC 2 | ISO 27001 | Report on file | Source and notes |
| --- | --- | --- | --- | --- | --- |
| Telnyx | Texts, call audio and transcripts, faxed filings | Type II (report under NDA) | 27001:2022, and 27701:2019 | No | [Telnyx compliance status](https://telnyx.com/ai/compliance.md), last verified there 21 April 2026. Also lists HIPAA (BAA) and PCI DSS for its own billing |
| Linq | Texts over iMessage, RCS and SMS | Type II, as Linq states it | Not stated | No | [Linq](https://linqapp.com/s/ghl) |
| Meta (WhatsApp Cloud API) | WhatsApp messages with Odelia | Type II | ISO 27001 report | No | [WhatsApp data privacy and security](https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security). Messages kept at most 30 days |
| Postmark | Email to and from Odelia, if used instead of Resend | None for Postmark itself; its data center has SOC 2 Type 2 | Not stated | No | Postmark says it "has not undergone a SOC audit" ([support article](https://postmarkapp.com/support/article/is-postmark-secure-and-redundant), [security page](https://postmarkapp.com/security)). Prefer Resend for Odelia's email, or record the exception |
| Lob | Filings printed and mailed | Type 2, yearly, all five criteria | Not stated | No | [Lob security](https://www.lob.com/security). BAA available |
| Microsoft (Azure Speech) | Odelia's reply text, to read aloud | Azure's Type 2 report covers "Azure"; the Speech service's own scope isn't confirmed here | Not confirmed here | No | [Microsoft SOC 2 offering](https://learn.microsoft.com/compliance/regulatory/offering-soc-2); per-service scope is in the Azure Compliance Offerings appendix on the Service Trust Portal |
| Render | Runs the portal filer (Oregon): the approved filing payload and portal page state | Type II, for workspaces on the Organization tier and above | 27001:2022 | No. `render.yaml` uses the starter plan | [Render ISO 27001 and Document Center](https://render.com/blog/render-iso-27001-and-document-center) (18 December 2024) |
| Browserbase | The browser the filer can use | Type II | Not stated | No | [Browserbase security](https://docs.browserbase.com/account/enterprise/security). HIPAA with BAA |

### Services a customer connects

The customer chooses these and holds its own contract with each. We keep the access tokens in Supabase Vault, ask for the narrowest scopes the feature needs, and drop the token when the customer disconnects.

| Vendor | Used for | SOC 2 | ISO 27001 | Source |
| --- | --- | --- | --- | --- |
| Google | Sign-in, Gmail, Calendar, Drive | Gmail, Calendar and Drive in scope for SOC 1, 2 and 3 | 27001, 27017, 27018 | [Services in scope](https://cloud.google.com/security/compliance/services-in-scope/index-20260716) (archived 16 July 2026) |
| Microsoft | Sign-in, Outlook Mail and Calendar, Teams | Microsoft 365 is in Microsoft's SOC 2 scope | Not confirmed here | [Microsoft SOC 2 offering](https://learn.microsoft.com/compliance/regulatory/offering-soc-2) |
| Dropbox | Importing documents | SOC 2 across the five criteria (type not stated on the page) | 27001, 27017, 27018, 27701 | [Dropbox certifications](https://dropbox.com/business/trust/compliance/certifications-compliance) |
| Intuit (QuickBooks) | Gross receipts for tax registrations | A SOC 2 report through Intuit's compliance portal; the latest named in July 2025 covered 1 May to 31 August 2024 | Not stated | [QuickBooks community answer](https://quickbooks.intuit.com/community/account-management-7/access-the-compliance-portal-76623) |
| Slack | Updates, and asking Odelia | Type II and SOC 3 | 27001, 27017, 27018, 27701, 42001 | [Slack compliance](https://slack.com/intl/en-in/trust/compliance) |
| Lark (Feishu) | Updates, and asking Odelia | Type II, and HITRUST | Not stated | [Lark security](https://lark.com/security) |
| WeCom | Updates to a group | Type 1 report | ISO/IEC 27018 stated; 27001 not stated | [Tencent WeCom](https://www.tencent.com/en-us/business/wecom.html) |
| DingTalk | Updates to a group | SOC 2 and SOC 3 | 27001, 27017, 27018 | [DingTalk Enterprise](https://www.alibabacloud.com/en/product/dingtalk-enterprise) |

### In the code but missing from the trust page

These are wired in and a customer can connect them, but `site/trust.html` doesn't list them yet. Add them there (the site belongs to another workstream; this is the list to add):

| Vendor | Code | Status |
| --- | --- | --- |
| Toast | `supabase/functions/integrations/pos.ts` (sales and staff, read only) | SOC 2 Type II (Core and POS) and a PCI DSS AOC in the Toast Trust Center ([Toast](https://support.toasttab.com/en/article/Access-Toast-Compliance-Reports-in-the-Toast-Trust-Center)) |
| Square | `supabase/functions/integrations/pos.ts` (read only) | Not verified from a first-party source on 2026-10-18 |
| Tencent (WeChat Official Accounts) | `supabase/functions/_shared/wechat.ts`, `chat-events` | Not verified; WeCom's statement above is a different product |
| MCP connectors (Notion, Airtable, Linear, HubSpot, Box, Asana, Zapier and any server an owner adds) | `supabase/functions/_shared/mcp_catalog.ts` | Chosen and connected by the owner; reads run, anything else waits for approval |

### Services we run the company on (not subprocessors)

| Vendor | Holds | SOC 2 | ISO 27001 | Source |
| --- | --- | --- | --- | --- |
| GitHub | The source code, CI, Dependabot | SOC 1 Type 2, SOC 2 Type 2 | 27001:2022; CSA STAR Level 2 | [GitHub compliance reports](https://docs.github.com/ru/enterprise-cloud@latest/admin/overview/accessing-compliance-reports-for-your-enterprise) (enterprise owners download them) |
| Cloudflare and Google public DNS | DKIM key lookups for email to Odelia: domain names only | Not reviewed | Not reviewed | `supabase/functions/_shared/dkim.ts` |
| Email and domain provider for placetta.com | Company email, DNS | To record | To record | Founder action |

## How we prove it

1. This table, dated, and its git history.
2. The vendor reports in the evidence folder, each with the date downloaded (none yet).
3. `ai_events.provider` shows which AI vendors actually answered (`select provider, count(*) from ai_events group by 1`), against the table above. The column arrives with `20261016160000_ai_routing_margin.sql`, which isn't applied to the live database yet; until then `ai_events.model` names the model.
4. The yearly review record in [RECORDS.md](../RECORDS.md#vendor-review).
