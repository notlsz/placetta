# ISMS scope (ISO/IEC 27001:2022 clause 4.3)

| | |
| --- | --- |
| Document | ISMS-1 |
| Version | 0.1 |
| Status | **Draft for approval.** Not in force until approved in the block at the end |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) from the repository, for the founder to correct and approve |
| Review | Every 12 months, and when a product, location, provider or legal entity changes |
| Clauses and controls | 4.3, 4.4; Annex A 5.9 (asset inventory, in the appendix) |
| SOC 2 cross-reference | The system description (Section III of the readiness assessment); CC2.1a; CC6.4a (carve-out) |

## Scope statement

> The information security management system of Placetta Inc. covers the design, development, operation and support of the Placetta compliance-automation service (the web application at placetta.com and its server functions, the AI agent Odelia, the portal filing worker, and the messaging channels customers connect), including the customer information it processes, the people and AI coding agents who build and run it, and the cloud services it runs on, managed remotely from the United States.

The founder edits this statement before approval if any part of it is wrong. A certificate, when one is issued, quotes it.

## What is inside

| Area | Inside the ISMS | Where it is described |
| --- | --- | --- |
| Product | The web app and marketing site (`src/`, `site/`), server functions (`supabase/functions/`), database schema and policies (`supabase/migrations/`), the portal filer (`worker/filer/`), the AI model routing and data rules (`supabase/functions/_shared/llm.ts`) | [docs/soc2/policies/information-security.md](../soc2/policies/information-security.md#the-systems-in-scope) |
| Information | Every class in [data-classification-retention.md](../soc2/policies/data-classification-retention.md): workspace facts, applications and filings, uploaded documents, conversations, texts and call transcripts, saved agency logins and connected-account tokens, the audit trail, consent and terms records, billing identifiers |  |
| Processes | Change management, access control, incident response, backup and recovery, vendor management, logging and monitoring, vulnerability management, risk management, personnel security | [docs/soc2/policies/](../soc2/policies/) |
| People | The founder; staff listed in `public.staff_emails`; contractors once engaged; AI coding agents run as tools under the founder's direction | [competence-and-awareness.md](competence-and-awareness.md) |
| Locations | No office or data center. Work happens remotely in the United States on company and personal devices; processing happens at the cloud providers below, in US regions | |

## Interfaces and dependencies (outside the ISMS, controlled through supplier management)

| Provider | What it runs for us | How we control it |
| --- | --- | --- |
| Supabase (on AWS, US East) | Database, storage, authentication, server functions, Vault | Supplier security ([supplier-security.md](supplier-security.md)); its SOC 2 Type 2 and ISO 27001 reports, once obtained |
| Vercel | Web hosting | As above |
| Render (Oregon) | The portal filer | As above; report available only on its Organization tier |
| GitHub | Source code, CI, Dependabot | As above |
| Stripe, Resend, Anthropic, Google, Telnyx, Linq, Meta, Lob, Microsoft, Browserbase, Groq, Cerebras, OpenRouter, Postmark, OpenAI, DeepSeek | Payments, email, AI models, messaging, mail, speech, browsers | [vendor-management.md](../soc2/policies/vendor-management.md) table, with what each receives |
| Services a customer connects (Google, Microsoft, Dropbox, Intuit, Slack, Lark, WeCom, DingTalk, Toast, Square, Tencent WeChat, MCP apps) | Chosen and contracted by the customer | Narrowest scopes, tokens in Vault, owner approval for any write |
| Government agency portals | Where filings are submitted | Out of scope as systems; the information we send them is in scope up to submission |

Controls the providers operate (physical security, their infrastructure, their staff) are outside the ISMS. Annex A 7.1 to 7.6, 7.11 and 7.12 are excluded for that reason ([statement-of-applicability.md](statement-of-applicability.md)).

## Exclusions and why

| Excluded | Why | Effect on certification |
| --- | --- | --- |
| Physical premises | There are none | None, provided the SoA justifies the physical exclusions |
| Placetta's other companies or projects of the founder | Separate businesses with separate systems | Must stay separate: no shared accounts, keys or data |
| Customers' own systems and the agencies' portals | Not operated by Placetta | Covered by complementary user entity controls in the SOC 2 description |

## Appendix: asset inventory (seed for Annex A 5.9)

The founder completes the device rows and confirms owners. Classification follows [data-classification-retention.md](../soc2/policies/data-classification-retention.md).

| Asset | Type | Holds or does | Classification | Owner | Location |
| --- | --- | --- | --- | --- | --- |
| Supabase project `esquxzcfsylffuijvzec` | Cloud service | Every customer record, files, Vault secrets, auth | Confidential (contains Restricted: saved logins, tokens) | Founder | AWS US East via Supabase |
| `documents` storage bucket | Data store | Uploaded and generated documents | Confidential | Founder | Supabase Storage |
| Vercel project | Cloud service | Site and app build, request logs | Internal | Founder | Vercel |
| Render service `placetta-filer` | Cloud service | Portal filing runs; holds a database key | Confidential while running | Founder | Render, Oregon |
| GitHub `notlsz/placetta` | Code repository | Source, CI, workflows, secrets for CI | Internal (secrets: Restricted) | Founder | GitHub |
| Off-site backup bucket (when set up) | Data store | Encrypted database and file copies | Confidential (encrypted) | Founder | Provider chosen in the backup runbook |
| Log bucket (when set up) | Data store | Encrypted platform logs, 1 year | Confidential (encrypted) | Founder | As above |
| Company password manager | Service | Every console credential, recovery codes, the backup key | Restricted | Founder | Vendor to record |
| Company email and identity (`placetta.com`) | Service | Accounts, sign-in to consoles | Confidential | Founder | Provider to record |
| Domain `placetta.com` and DNS | Service | Site, email, DKIM, `security.txt` | Internal | Founder | Registrar to record |
| Founder's laptop(s) | Endpoint | Code clones, console sessions, evidence folder | Confidential | Founder | To record: model, disk encryption, OS updates |
| Founder's phone | Endpoint | Two-step codes, email | Confidential | Founder | To record |
| Security keys (two) | Authenticator | Second factor for consoles | Restricted | Founder | One carried, one stored safely |
| Evidence folder | Records | Evidence bundles, records, vendor reports | Confidential | Founder | To record (encrypted storage, outside the repo) |
| Vendor accounts listed in vendor-management.md | Cloud services | API keys and the data each receives | Per the table | Founder | Each vendor |

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder, security lead) | | | | |
