# Context of the organization and interested parties (clauses 4.1 and 4.2)

| | |
| --- | --- |
| Document | ISMS-2 |
| Version | 0.1 |
| Status | **Draft for approval.** Not in force until approved in the block at the end |
| Owner | Founder (security lead) |
| Drafted | 2026-10-22, by Claude (an AI assistant) from the repository and the readiness assessment |
| Review | Every 12 months, at each management review, and when the market, product or law changes |
| Clauses and controls | 4.1 (including the climate change determination added by Amendment 1:2024), 4.2; Annex A 5.31 (legal, statutory, regulatory and contractual requirements, the register below), 5.5 and 5.6 (contacts) |
| SOC 2 cross-reference | CC2.3 (external communication), CC3.1 (objectives), CC3.4 (significant change), CC9.2 (vendors) |

## External issues

| Issue | Why it matters to information security | Where it is handled |
| --- | --- | --- |
| Customers are businesses entering US markets, many of them Chinese food and beverage brands | Personal information about people in China may leave China (PIPL); the product is bilingual; Chinese collaboration platforms (WeChat, WeCom, DingTalk, Lark) are integrated | Risk C12; PIPL notice and consent on the trust page roadmap |
| Placetta files with government agencies on customers' behalf, using their saved portal logins | Credentials of third-party systems are held and used; a mistaken or forged filing has legal effect | AI risks R3 and R6; owner approval on every filing; Vault; audit before password |
| The service depends on AI model vendors, some without independent attestation | Customer content reaches vendors whose retention and training terms differ | AI risk R4; `vendorOk`; supplier security |
| Enterprise buyers ask for SOC 2 and ISO 27001 before buying | Without them, sales stall; claiming them early would mislead | The trust page's labels; [compliance-scorecard.md](../compliance-scorecard.md) |
| Messaging law (TCPA, carrier 10DLC rules) | Texting without consent carries statutory damages | Risk C13 |
| Attackers target small SaaS companies through phishing and stolen tokens | One founder holds admin of everything | Risk C4; [mfa-and-identity.md](../soc2/runbooks/mfa-and-identity.md) |
| Cloud provider concentration (one Supabase project, one region) | A provider or account loss stops the service | Risks C1, K9; the off-site copy |
| **Climate change** (Amendment 1:2024 asks whether it is a relevant issue) | Determination proposed for approval: **relevant only indirectly.** Placetta owns no facilities; the providers' regions (AWS US East, Render Oregon) carry the physical climate risk (heat, storms, wildfire smoke affecting power and cooling). It is treated through supplier assurance (their SOC 2 availability controls) and the off-site copy in a second provider, not through controls of our own. Revisit if an office is leased or a single-region outage occurs | Supplier security; business continuity |

## Internal issues

| Issue | Why it matters | Where it is handled |
| --- | --- | --- |
| One person holds every role (founder, security lead, sole admin, sole code owner) | No segregation of duties; key-person risk | Risks C2, C6; compensating controls in [branch-protection.md](../soc2/runbooks/branch-protection.md) |
| AI coding agents write most of the code | Volume of change is high; review must be real | Risks C2, C3; bot identity; PR approval |
| Security controls are often built ahead of being switched on in production | The repo overstates production unless labelled | Risk C10; the trust page labels; CONTROLS.md statuses |
| Limited budget | Controls must be cheap and automated | Evidence script, CI gates, runbooks |

## Interested parties and their requirements

| Interested party | Their requirements relevant to information security | Addressed by the ISMS? | How |
| --- | --- | --- | --- |
| Customers (business owners and their teams) | Confidentiality of their business data and documents; nothing filed, paid or sent without approval; isolation from other customers; deletion on request; honest security claims | Yes | Approval gates, RLS, Vault, audit trail, deletion, trust page |
| Customers' employees and contacts whose data is in workspaces | Privacy rights (CCPA, PIPL where applicable) | Yes | Privacy Policy, data classification, retention |
| Prospective enterprise customers | A SOC 2 report, later ISO 27001; answered security questionnaires | Yes | This ISMS and the SOC 2 program |
| Government agencies Placetta files with | Accurate filings, authorized filers, portal terms of use | Yes | Filing authorization, owner approval, portal playbooks |
| Regulators: California Privacy Protection Agency and state attorneys general; the FTC (unfair or deceptive practices, including security claims); the FCC and carriers for texting; Chinese regulators for PIPL | Lawful processing, breach notification, truthful claims, consent | Yes | Privacy Policy, incident response, trust page, consent records |
| Investors and advisors | Responsible risk management; no undisclosed liabilities | Partly | Management review shared with an outside advisor (CC1.2) |
| Suppliers and subprocessors | Use of their services under their terms; their shared-responsibility expectations of us | Yes | Supplier security; the complementary controls each report assigns to us |
| Card networks, through Stripe | Card data stays with Stripe | Yes | Stripe Checkout; no card numbers touch Placetta |
| Security researchers | A way to report, safe harbour | Yes | `security.txt`, the trust page |
| Founder and future staff | Clear rules, training, safe working | Yes | Policies, training records |

## Legal, statutory, regulatory and contractual requirements register (Annex A 5.31)

Draft list for counsel to confirm. Nothing here is legal advice.

| Requirement | Applies because | Owner | Where met | Status |
| --- | --- | --- | --- | --- |
| California Consumer Privacy Act as amended (CCPA/CPRA) | Personal information of California residents | Founder with counsel | Privacy Policy; export and deletion in Settings | In place for export and deletion; audit-trail retention after deletion undecided (CONTROLS.md C1.2b) |
| State data breach notification laws (all 50 states) | Personal information of US residents | Founder with counsel | [incident-response.md](../soc2/policies/incident-response.md) | Plan written; counsel contact still "to fill in" |
| FTC Act section 5 (truthful security and privacy claims) | Public claims on the site | Founder | Trust page labels; this document's claim review | In place; reviewed 2026-10-22 |
| PIPL (China), cross-border transfer rules | Personal information of people in China | Founder with counsel | Privacy Policy China section | Separate notice and consent not built (roadmap) |
| TCPA and CTIA/carrier 10DLC rules | Texting customers | Founder | Consent records kept 5 years; STOP; quiet hours | In place; 10DLC registration in progress |
| Terms of use of agency portals | Filing on agency websites | Founder | Portal playbooks; filing authorization | Per portal |
| Customer contracts and Placetta Terms of Service | Commitments made to customers | Founder | `legal/terms.md` | In place; security exhibit or DPA for enterprise customers not yet drafted |
| Supplier terms (DPAs, AI vendor data-use terms) | Data shared with suppliers | Founder | [supplier-security.md](supplier-security.md) | DPAs not on file |
| Payment card rules (PCI DSS, via Stripe) | Card payments | Founder | Stripe Checkout only | In place (scope minimized) |
| Export controls and sanctions screening | Customers abroad | Founder with counsel | Not assessed | To assess |

## Contacts with authorities and special interest groups (Annex A 5.5, 5.6)

| Contact | For | Recorded where |
| --- | --- | --- |
| Counsel (breach notification, regulators) | Incidents | incident-response.md "Contacts" (to fill in) |
| State attorneys general breach portals; CPPA | Notification when required | Counsel decides |
| FBI IC3, CISA reporting | Serious attacks | incident-response.md |
| Cyber insurer's breach hotline | Once insured | incident-response.md |
| Supabase, Vercel, Render, GitHub, Stripe security contacts | Provider incidents | vendor-management.md |
| Special interest groups: CISA alerts, GitHub Security Advisories, Supabase and Vercel status and security bulletins, OWASP | Threat intelligence (Annex A 5.7) | The weekly log review and the monthly review |

## Approval

| Role | Name | Decision (approve, approve with changes, reject) | Date | Signature |
| --- | --- | --- | --- | --- |
| Top management (founder, security lead) | | | | |
