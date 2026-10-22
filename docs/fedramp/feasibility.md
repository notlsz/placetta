# FedRAMP: is it worth pursuing, and what it would take

| | |
| --- | --- |
| Prepared | 2026-10-22, by Claude (an AI assistant), for the founder. Not a 3PAO opinion and not legal advice |
| Status | **Placetta holds no FedRAMP authorization, is not "FedRAMP Ready" and is not "In Process".** Nothing on the site may say otherwise ([docs/compliance-scorecard.md](../compliance-scorecard.md)) |
| Recommendation | **Don't pursue FedRAMP now.** Revisit only when a named federal agency wants to buy and will sponsor or fund it. Build nothing federal-only before then |
| Sources | GSA's published FedRAMP Marketplace data (`github.com/GSA/marketplace-fedramp-gov-data`, `data.json`, last changed 2026-05-19 per its own metadata, downloaded 2026-10-22), read programmatically. The marketplace website itself (marketplace.fedramp.gov) could not be fetched from this session. The readiness assessment of 2026-10-21, section 4. Anything not in the GSA data is marked **unverified** |

## 1. When FedRAMP is worth it

FedRAMP applies when a **federal agency** uses a cloud service to process **federal information**. Placetta's customers are private businesses; Placetta files *with* agencies as a user of their public portals, which is not a cloud service *to* them. So:

| Situation | Need FedRAMP? | What to do instead |
| --- | --- | --- |
| Selling to restaurants, retailers and brands (today) | No | SOC 2, then ISO/IEC 27001 |
| A state or city government wants to use Placetta itself | No (FedRAMP is federal), but they may ask for **GovRAMP** (formerly StateRAMP) or a security review | SOC 2 Type II first; GovRAMP accepts it as an input. Verify the program's current requirements |
| A federal agency wants to use Placetta for low-sensitivity public information | Yes, at Low or 20x Low | See section 2; most of Placetta's plausible federal uses (licensing and business filing data) would be Low or Moderate, not High |
| A federal agency wants it for sensitive but unclassified data | Yes, Moderate | Section 2 and a separate GovCloud deployment (section 3) |
| High | Only if an agency needs High for this specific data and funds it | Not realistic for this company in the next two years |

**Signals that would justify starting:** a named agency program office, a contract vehicle or pilot with dollars attached, an agency willing to be the authorizing official (or a 20x path that doesn't need one), and a business case that covers $0.5M to $1M+ a year of continuous monitoring (the assessment's order-of-magnitude estimate, not a quote).

## 2. 20x Low and Moderate versus Rev5 High

What the GSA data shows (snapshot 2026-05-19):

| Fact from the data | Count or example |
| --- | --- |
| Authorizations labelled **"20x Low"** | 16, all with authorization type "Program" (no agency sponsor), the earliest dated 2025-07-25 (Flock Safety, Vanta) |
| Authorizations labelled **"20x Moderate"** | 12, type "Program", the earliest dated 2026-01-09 (OpenAI ChatGPT Enterprise and API Platform) |
| Any **"20x High"** | None. Every High authorization in the data (116) is a Rev5 path (JAB or Agency) |
| Rev5 levels | Low 12, LI-SaaS 48, Moderate 446, High 116 |
| Statuses | Authorized 517, Ready 66, In Process 15, Agency In Process 52 |

Comparison for Placetta (control counts are approximate figures for NIST SP 800-53 Rev. 5 baselines, from the assessment; the 20x requirements are machine-validated "key security indicators" rather than a control-by-control SSP):

| | 20x Low | 20x Moderate | Rev5 High |
| --- | --- | --- | --- |
| Data it fits | Low-impact federal information | Most sensitive-but-unclassified business data | Life, safety, law enforcement, financial or health data where loss is severe |
| Sponsor | Not needed on the data's "Program" path | Not needed on the data's "Program" path | Agency sponsor in practice |
| Assessment | 3PAO validation of automated evidence | Same, broader | Full 3PAO assessment of about 410 controls and enhancements, SSP of hundreds of pages |
| Fit with Placetta's current stack | Still needs the boundary on authorized infrastructure | Same | Same, plus FIPS-validated crypto everywhere, US-person admins in practice, 24x7 incident capability |
| Realistic for Placetta | Only with a federal buyer, after SOC 2 Type II | Only with a federal buyer and a GovCloud edition | No |

**Unverified (from the assessment's secondary source, not in the GSA data):** that 20x renames levels to Classes A to D, that a Class A entry tier accepts a SOC 2 Type II report, that Class B and C pipelines opened on 2026-08-31, and that new Rev5 applications stop on 2027-06-11. The GSA data uses "20x Low" and "20x Moderate", not class letters. Check fedramp.gov before planning on any of these dates.

## 3. FedRAMP-authorized hosting alternatives

None of Placetta's hosting providers appears in the GSA data: **Supabase, Vercel, Render, Stripe, Resend, Telnyx: not listed** (searched by name; absence in a May 2026 snapshot is strong evidence but re-check the live marketplace before deciding). Anthropic's direct API is not listed as a product of its own. A federal edition would need a separate boundary on authorized infrastructure:

| Need | Authorized option in the GSA data | Level in the data | Note |
| --- | --- | --- | --- |
| Postgres database | AWS GovCloud (its service list mentions PostgreSQL, i.e. RDS and Aurora) | High | Or Azure Government (PostgreSQL in its description), High |
| Compute for functions and the filer | AWS GovCloud; Azure Government; Google Services (GCP) | High | Which services (for example Lambda, ECS) are inside each boundary is on each provider's services-in-scope page, not in the GSA data: unverified here | Self-host Supabase's open-source stack inside GovCloud only with the agency's agreement: the stack itself has no authorization |
| Static hosting and CDN | AWS GovCloud; Cloudflare for Government | High (AWS); Moderate (Cloudflare), with Cloudflare's High offering "Agency In Process" | Which AWS services serve static sites inside the boundary: unverified here |
| Claude models | Amazon Bedrock appears in the service lists of AWS GovCloud (High) and AWS US East/West (Moderate) | High / Moderate | Which Claude models are offered in GovCloud, and at which level, is **unverified**: check AWS's GovCloud Bedrock documentation |
| Gemini models | Vertex AI appears in Google Services (GCP), High; "Gemini for Government" is 20x Low | High / 20x Low | The Gemini Developer API Placetta uses today is not this |
| Identity | Okta Government High Cloud (High); Okta Regulated Cloud (Moderate); Microsoft 365 GCC High | High / Moderate | For staff and PIV/CAC federation |
| Source and CI | GitHub Enterprise Cloud | LI-SaaS | Code only; no federal data may go there |
| Email, SMS, voice, fax, mail | Not found for Resend, Telnyx, Linq, Lob, Meta | | Would be removed from a federal edition or replaced; unverified alternatives |
| Chinese platforms (WeChat, WeCom, DingTalk, Lark) and DeepSeek | Not applicable | | Must be outside any federal boundary |

## 4. FIPS 140-validated cryptography options

FedRAMP requires FIPS 140-2 or 140-3 validated modules wherever cryptography protects federal data. Today: Supabase Vault (libsodium family) and the bcrypt settings PIN are not FIPS-approved schemes; Deno's and Vercel's TLS stacks aren't documented as validated. Options for a federal edition (each to be confirmed against its current certificate on NIST's CMVP list at csrc.nist.gov before relying on it; certificate numbers are deliberately not quoted here):

| Need | Option | Why |
| --- | --- | --- |
| Key management and encryption of saved credentials | AWS KMS in GovCloud, with its FIPS endpoints; AWS CloudHSM; Azure Key Vault Managed HSM; Google Cloud HSM | Replace Vault: envelope-encrypt each credential with a KMS key |
| TLS and crypto in Node services (filer, functions rewritten for Lambda or ECS) | Node.js built against OpenSSL 3 with its FIPS provider enabled; or AWS-LC FIPS | Node's `--enable-fips` needs a FIPS-capable OpenSSL build |
| Go services, if rewritten | Go's FIPS 140-3 module (Go 1.24 and later), or BoringCrypto builds | Check the module's CMVP status |
| Operating system | Ubuntu Pro FIPS kernels and libraries; Red Hat Enterprise Linux in FIPS mode; Amazon Linux FIPS mode | For containers and hosts |
| Password and PIN hashing | PBKDF2 with HMAC-SHA-256 through a validated module (replacing bcrypt) | bcrypt is not an approved algorithm |
| API key hashing | Keep SHA-256, computed inside the validated module | The algorithm is approved; the module must be too |
| Endpoints at the edge | GovCloud FIPS endpoints; Cloudflare for Government | |

## 5. What to do now (no federal-only infrastructure)

1. Finish SOC 2 Type I, then Type II. It is what state, local and enterprise buyers ask for first, and 20x reportedly reuses parts of it.
2. Keep the architecture portable: Postgres features only (no Supabase-only dependency where avoidable), configuration as code, the off-site backup, the filer in a container.
3. Keep FedRAMP-adjacent hygiene that also helps SOC 2: SHA-pinned actions, the one-year log copy, least-privilege service roles, MFA everywhere.
4. Add to the AI vendor table which providers have FedRAMP-authorized channels (Bedrock, Vertex), so a federal edition's model routing is a configuration change.
5. When a federal buyer appears: confirm the impact level with them, read fedramp.gov's current 20x guidance, get two 3PAO quotes, and plan a separate GovCloud deployment. Don't market any FedRAMP status until the marketplace lists one.
