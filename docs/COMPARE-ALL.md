# Placetta against everyone: business model, landing page, core product

Written 2026-10-23. Three questions for every competitor: how they make money, how their homepage sells, and what the
customer actually gets day to day. For each: what to copy, and the biggest weakness Placetta can fill. The earlier
passes (docs/COMPETITIVE.md, docs/PRICING-RESEARCH.md) scored Odelia mostly on what the code and tests can do. This
page is harsher. It scores **what is live or usable today**, and it reads Placetta's own landing page the way a
skeptical Chinese franchise owner would.

## How this was done, and what it can't show

- **Sources.** Every competitor fact is from a page read on 2026-10-23, or from a page cited in docs/COMPETITIVE.md and
  read 2026-10-22 (marked "via COMPETITIVE"). Third-party pages written by a competitor of the company they describe
  are marked "(competitor)". Prices that aren't public are marked **not public**. No number below is estimated by me.
- **Pages this session could not fetch.** The fetch tool needed a permission answer that never came, so these
  homepages were not read: harvey.ai, devin.ai, alven.ai, linear.app (the /enterprise page was read instead),
  superhuman.com (the /email page was read instead), licenselogix.com, sfstandard.com (Dots launch), pbs.org (Muse
  launch), ians.com (Delve). tesla.com, spacex.com, claude.com, perplexity.ai, donotpay.com, jackandjill.ai and the
  Dots and Muse homepages were not reached either. Where a homepage wasn't read, its landing score is **n/f** (not
  fetched), not a guess.
- **Placetta's side.** The landing page is `site/index.html`, built and rendered in Chromium (desktop 1440 px and phone
  390 px), text read after scrolling so every lazy section loaded. The product is the sample build (`vite build`,
  served locally, signed out, which runs the "Moonleaf Tea" sample workspace), clicked through: Home, Permits, Stores,
  Odelia, and one question to Odelia.
- **Scores** are my judgment out of 10. Business model and landing page are scored for the company's own buyers.
  Core product is scored **for Placetta's job**: a Chinese food and beverage brand opening US stores. That is why a
  great product like Vanta scores low there.

## Placetta's baseline, as it stands today

**Business model** (docs/PRICING.md, src/pricing.ts). The store plan is $149 a store a month, billed yearly ($1,788 up
front). A new license is $299, a complex one (liquor, building plan review, import permit) $999, and a renewal the plan
doesn't cover $99. With 10 or more stores, new licenses are included. The plan preview is free and government fees
are at cost. Each franchisee usually pays for its own stores, and headquarters sees every store for free. There are no
discounts. The plan auto-renews yearly and can be turned off in Settings, and fees are non-refundable. AI cost is about
$0.70 a store-month against a $50 ceiling (docs/UNIT-ECONOMICS.md). But "55% of new licenses go to Placetta's team",
so this is a managed service with software margins on the plan and service margins on filings. "Nothing here comes
from production data, because there is none yet" (same doc).

**Landing page** (rendered). Hero: "Your store is built. *Your permits aren't.*" Subhead: "Placetta's AI agent, Odelia,
gets every federal, state and city license you need to open in a new market, so you start making money sooner." Primary
CTA: a "Where are you opening?" field with "Get my plan". Secondary: "Book a demo", which is a `mailto:` link. Product
shown: a sample plan, a filing card, a portal run with a receipt, a renewal calendar, a franchise view, a rent
calculator. Pricing is in full on the page. Length: 2,067 rendered words, 11,679 px on desktop (about 12 screens) and
15,178 px on a phone (about 18 screens).

Proof on the page, as rendered:
- "31,000+ businesses served worldwide since 2016" and "3+ new US businesses served each day, on average"
- Testimonials from "Richard, General Manager, Starbucks", "Jackie, Owner, Ferrari dealer", "Stefan, Stanford" and
  "Jean, Yale"
- "5 months saved in approval time for Ferrari"
- A brand marquee under "Built for brands like" (Paris Baguette, Molly Tea, CHAGEE, Tiger Sugar, Gong cha, Happy Lamb,
  Gold's Gym)
- "Partner attorneys in 170+ countries"

The same page also says: "Placetta has no customer averages to quote yet."

**Core product** (sample build, clicked). The Home screen leads with one next action ("Text 4 staff about food handler
cards", "Review and approve"). It shows a projected opening date with the cost to open ("$7,514 known, 7 agency fees not
published"), an activity feed, and a dated "Coming up" list. Permits are grouped State, County, City, each with the
agency, its .gov link, the fee or "Set by the agency", "Usually takes", the owner, and the next step. There are tabs
for To do, Filed, By store, Documents and Deadlines, plus a "License report". Stores shows a 0 to 100 readiness score
per store ("Open on time", "Stay open", "No fines"). The whole thing switches to Chinese. An onboarding modal covers
the dashboard on first load. Asked "Which licenses does a milk tea shop in Irvine need?", the sample (which runs no
model) answered: "I'm not sure about that there, and I won't guess", and named the City of Irvine.

What isn't live without the founder (SETUP.md, docs/COMPETITIVE.md):
- The portal worker (Render, `FILER_ENABLED`), so filings go to the team's queue.
- Texting and calls (Telnyx 10DLC, or Linq for iMessage).
- Voice (OpenAI keys).
- Migrations 20261028090000 to 20261031151800 and the function redeploys. GitHub Actions billing currently blocks
  server deploys.
- The MCP directory listings.
- A SOC 2 report.

## 1. Master tables

### 1a. Business model

T = price transparency, A = alignment with the customer's outcome, E = expansion levers, M = margin and defensibility.

| Company | Who pays, for what unit | List price | Contract and renewal | Services vs software; partners | T | A | E | M | Avg | Source |
|---|---|---|---|---|---:|---:|---:|---:|---:|---|
| **Placetta** | Brand or franchisee, per store, plus per license | $149/store/mo billed yearly; $299, $999, $99; preview free | Yearly, auto-renew, off in Settings; non-refundable | 55% of new licenses team-handled (est.); partner attorneys not signed | 9 | 6 | 7 | 6 | **7.0** | docs/PRICING.md, docs/UNIT-ECONOMICS.md |
| Vanta | Company, per edition by headcount, plus each framework and add-on | **Not public**; reported $7,500 to $12,000 (<50 staff), median about $20,000/yr; about $5,000 a framework | Order forms often need 60 to 90 days' notice to cancel; renewals "30 to 50% higher" | Software; audit not bundled ($8,000 to $40,000); auditor directory and partner program | 3 | 5 | 9 | 8 | **6.3** | [UnderDefense (competitor), 2026-08-17](https://underdefense.com/blog/vanta-pricing/), [vanta.com](https://www.vanta.com/) |
| Drata | Company, per edition | **Not public**; Vendr median about $38,000 (n=94), framework add-ons $3,000 to $10,000 | 8% escalator; 2-year 15 to 25% off, 3-year 25 to 35% off | Software; audit, pentest and implementation extra | 3 | 5 | 8 | 8 | **6.0** | [UnderDefense (competitor), 2026-10-13](https://underdefense.com/blog/drata-pricing/) |
| Delve | Company, bundles of frameworks | **Not public**; reported "as little as $6,000–$15,000" for SOC 2 + ISO + HIPAA | n/a | Software with "independent" auditors, alleged to be routed to offshore entities; asked to leave YC around 2026-04-03 (disputed by Delve) | 3 | 4 | 6 | 3 | **4.0** | [Captain Compliance](https://captaincompliance.com/news/the-delve-scandal-fake-soc-2-audits-open-source-code-theft-and-exit-from-y-combinator/), [CertPro/TechCrunch excerpt](https://certpro.com/delve-fake-compliance-allegations/) |
| Harbor Compliance | Company, per license service and per software seat | "from $500 plus state fees" a year; specialist "may invoice additional fees" | Auto-renew unless notice 90 days before; fees generally non-refundable | Managed service plus software; 40,000+ clients, 150,000 agencies in data | 4 | 5 | 7 | 6 | **5.5** | via COMPETITIVE; [harborcompliance.com](https://www.harborcompliance.com/index.php) |
| Avalara License Services | Company, quote | **Not public** for licenses; built "for businesses that manage 100+ licenses" | BBB complaint: renewed "$11,663.19 without explicit approval" | Managed filing plus platform; cross-sells sales tax | 2 | 4 | 8 | 7 | **5.3** | via COMPETITIVE; [Avalara](https://www.avalara.com/us/en/products/business-licenses.html) |
| CT Corporation / BizFilings / LicenseLogix | Company, per package (BizFilings) or quote (LicenseLogix) | BizFilings $149 one location, $66 each more, 5 to 7 business days; LicenseLogix **not public** | One-time (BizFilings); LicenseLogix contract | Research kit (BizFilings), managed (LicenseLogix), dedicated account manager | 7 | 5 | 7 | 7 | **6.5** | [BizFilings](https://www.wolterskluwer.com/en/solutions/bizfilings/business-licenses) |
| MyCorporation | Owner, per package | "$149*+ state fees" | One-time | Kit the owner files | 8 | 4 | 5 | 6 | **5.8** | [MyCorporation](https://www.mycorporation.com/business-formations/business-license.jsp) |
| Gamut | Team, subscription | **Not public** on homepage; "free $100 trial", no card | n/a | Software (MIT, self-hostable); license templates | 4 | 5 | 6 | 6 | **5.3** | [gamut.so](https://www.gamut.so/) |
| Permit expediters | Owner, per project or hour | $7,500 to $12,500 a restaurant; $2,500 to $7,000 a location in rollouts; SF $50 to $150/hr | Per project, ends at opening | All service | 6 | 7 | 3 | 4 | **5.0** | via COMPETITIVE (Permit Place, PermitFlow) |
| Instinct | Consumer | **Not public**; early access; raised $1B at $10B | n/a | Agent plus "Concierge" humans | 1 | 5 | 6 | 5 | **4.3** | [VKTR](https://www.vktr.com/ai-platforms/instinct-raises-1b-at-10b-valuation-to-scale-its-personal-ai-agent/) |
| Meta Muse | Consumer, tiers | $0 / $20 / $100 a month (reported, unverified on a live page) | Card required even for free | Software; training on data by default, opt-out | 7 | 5 | 8 | 6 | **6.5** | [The Neuron, 2026-09-09](https://theneuron.ai/explainer-articles/how-to-get-started-with-meta-muse/) |
| OpenAI Dots | Seat, bundled in Pro ($100/$200/$500), Business Premium $125/seat | One dot per user "at no extra charge" | Monthly | Software; 4,000+ app plugins | 8 | 5 | 9 | 6 | **7.0** | [Implicator, 2026-09-29](https://www.implicator.ai/openai-500-chatgpt-tier-dots-paid-plans/) |
| ChatGPT agent (now ChatGPT Work) | Seat, with task caps | Plus 40 tasks/mo, Pro 400 | Monthly | Software | 8 | 4 | 9 | 6 | **6.8** | [OpenAI Help](https://help.openai.com/en/articles/11752874-chatgpt-agent) |
| Perplexity Computer | Seat, Max only, credits | $200/mo, 10,000 credits; Enterprise Max $325/seat | Credits expire monthly; no per-task cost guide | Software | 6 | 3 | 7 | 6 | **5.5** | [SentiSight, 2026-03-27](https://www.sentisight.ai/how-much-perplexity-computer-cost/) |
| Grok Bot (xAI) | Bundled in SuperGrok and Cursor plans, usage metered | **Not public** ("metered separately", no amounts) | n/a | Software | 2 | 5 | 7 | 5 | **4.8** | [xAI, 2026-08-11](https://x.ai/news/introducing-grok-bot) |
| Claude apps | Seat | Pro $20, Max $100/$200, Team $25 or $125 a seat; Enterprise **not public** | Monthly or annual | Software; connector directory | 9 | 5 | 8 | 7 | **7.3** | [Grey, updated 2026-10-10](https://grey.co/blog/claude-ai-subscription-pricing-pro-max-and-team-plans-compared-for-2026) |
| Claude Code | Seat or API usage | Included in Pro/Max/Team; API by tokens | Monthly | Software | 8 | 6 | 9 | 7 | **7.5** | same |
| Claude for Legal | Seat (plugins, connectors) | **Not verified this session** | n/a | Software plus legal partners' connectors | 4 | 5 | 7 | 7 | **5.8** | via COMPETITIVE ([LegalOn, competitor](https://www.legalontech.com/post/claude-for-legal)) |
| Devin | Usage (ACU, about 15 min of work) | Core from $20 at $2.25/ACU; Team $500/mo (2025 figures; may be outdated) | Monthly | Software; "idle time isn't billed" | 8 | 8 | 8 | 6 | **7.5** | [eesel](https://eesel.ai/blog/cognition-ai-pricing) |
| Harvey | Firm, per seat | **Not public**; reported $1,200 to $2,000+ a seat a month, about 25-seat minimum | 12 months; reported 2 to 3 years with 10 to 25% escalation | Software plus services | 1 | 4 | 8 | 7 | **5.0** | [Vaquill, 2026-07-18](https://www.vaquill.ai/blog/harvey-legora-cocounsel-pricing-reality-2026) |
| Legora | Firm, per seat | **Not public**; reported $300 to $800 a seat a month, about 10-seat minimum | Annual, no cancel-anytime | Software | 1 | 4 | 8 | 6 | **4.8** | same |
| Alven | Property manager, per unit | "$10" a unit a month (its own page) | n/a | "AI employee"; $500K ARR in 2 months (2026-05) | 7 | 7 | 7 | 6 | **6.8** | via COMPETITIVE; [ARR Club](https://www.arr.club/alven/alven-arr-hit-500k-in-2-months) |
| Poke | Consumer, tiers | $0 / $19 / $199 a month (it used to be a negotiated price, "$3 to $292"); pays Apple per user for iMessage | Monthly or yearly | Software; "Poke Human" on Ultra | 8 | 5 | 6 | 5 | **6.0** | [Saner.AI (competitor)](https://blog.saner.ai/poke-reviews/), [TechWyse](https://www.techwyse.com/news/platform-updates/apple-messages-for-business-first-ai-agent-poke-approved) |
| Jack & Jill | Employer pays; free for candidates | UK/EU 10% of first-year salary only on a hire, full refund if the hire leaves within 3 months; US $199 to $249 per role per month | No retainer (UK/EU) | AI recruiters | 8 | 10 | 7 | 7 | **8.0** | [HeroHunt (competitor), 2026-10-08](https://www.herohunt.ai/blog/jack-and-jill-ai-pricing-2026-jill-s-10-fee-vs-alternatives/) |
| Town | Small business, flat fee a year | Base **not public**; $1,000 an extra pass-through entity, $500 an extra return | Annual | Named CPA does the work, AI supports | 5 | 6 | 6 | 6 | **5.8** | [town.com](https://new.town.com) |
| DoNotPay | Consumer subscription | $36 every two months (2023) | Recurring | "Robot lawyer"; FTC order: $193,000 and a ban on unproven claims (final 2025-02-11) | 7 | 2 | 3 | 2 | **3.5** | [FTC](https://www.ftc.gov/node/87474), [Contrary](https://research.contrary.com/company/donotpay) |
| Stripe | Business, per transaction | "Integrated per-transaction pricing with no hidden fees", one click away | None | Software | 10 | 9 | 10 | 8 | **9.3** | [stripe.com](https://stripe.com/) |
| Linear | Team, per seat; enterprise via sales | Pricing page linked (not re-read) | Monthly or annual | Software | 8 | 6 | 9 | 9 | **8.0** | [linear.app/enterprise](https://linear.app/enterprise) |
| Tesla | Buyer, per car, configurator | Order fee, "usually non-refundable" | Pay balance before delivery | Product | 9 | 6 | 7 | 7 | **7.3** | [Tesla support](https://www.tesla.com/en_GB/support/ordering-new-vehicle) |
| SpaceX | n/f | n/f | n/f | n/f | | | | | **n/f** | not fetched |
| Superhuman | Seat ("included with the Superhuman Business plan") | Not on the page read | n/a | Software | 5 | 6 | 8 | 8 | **6.8** | [superhuman.com/email](https://superhuman.com/email) |
| Ramp | Business; "Get started for free" | No price on the page | n/a | Software | 8 | 9 | 9 | 8 | **8.5** | [ramp.com](https://ramp.com/) |

**Where Placetta wins on business model.** It is the most transparent in its category. Only BizFilings and
MyCorporation also publish a price, and theirs is a kit the owner files. Placetta charges per store, the unit a chain
grows by. Agency fees are at cost, never marked up. The franchise lever (headquarters requires Odelia, each franchisee
pays) gives it expansion that a per-company vendor doesn't have.

**Where Placetta loses on business model.** Outcome alignment. $1,788 is paid up front a year for one store, and a
license is charged when the owner approves it, not when the agency issues it. Jack & Jill (pay on hire, 3-month
refund), Stripe (pay when you get paid) and Devin (idle not billed) all align better. Margin isn't proven: 55% of
licenses are team-handled, and there is no production data. And there is no partner network: Vanta has an auditor
directory and Harbor its specialists, while Placetta's partner attorneys aren't signed.

### 1b. Landing page

C = clarity in 5 seconds, P = proof, S = product shown, CTA = strength of the main call to action, Tr = trust.

| Company | Hero line (verbatim) | Primary CTA | Proof | Pricing on page | Length | C | P | S | CTA | Tr | Avg |
|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|
| **Placetta** | "Your store is built. Your permits aren't." | Field "Where are you opening?" with "Get my plan"; "Book a demo" is a mailto | 31,000+ since 2016; Starbucks, Ferrari dealer, Stanford, Yale quotes; brand marquee; but "no customer averages to quote yet" | Full | 2,067 words, about 12 desktop screens | 9 | 4 | 9 | 7 | 4 | **6.6** |
| Vanta | "Get your compliance together" | "Get a demo" | "Trusted by 16,000 businesses"; Ramp, Cursor, Snowflake, GitHub; named CISO quotes; Forrester Leader | No ("Plans" link) | About 12 sections | 8 | 10 | 6 | 7 | 9 | **8.0** |
| Drata | "Explore the World of Agentic Trust" | "Get Started" | 8,500+ customers; G2 4.8; stats; no named logos in the text | No | 10 to 12 sections | 4 | 7 | 4 | 7 | 7 | **5.8** |
| Delve | "Compliance in days, Security that lasts." | "Book a Demo" | "1,500+" logo wall with no names; "No items found" under customers; "Lorem ipsum" in the agents section | No | Long, CTA repeated about 6 times | 8 | 3 | 6 | 6 | 1 | **4.8** |
| Harbor Compliance | "Multistate compliance made simple." | "Get a Demo"; "Get Your FREE Harbor Compliance Score" | 40,000+ clients; 150,000 agencies; SOC 2 badge; BBB | No | 3,000 to 4,000 words | 7 | 7 | 6 | 7 | 7 | **6.8** |
| Avalara (licenses) | "One platform to centralize, manage, and scale your business license compliance" | "Get started"; "See our product" (interactive) | 1.3M+ businesses; 23,000+ jurisdictions; 8 logos; 2 quotes | No | 1,000 to 1,300 words | 6 | 7 | 4 | 6 | 7 | **6.0** |
| BizFilings | "Business License Research Service" | "Order Now" | None | $149, $66 | About 1,500 words | 7 | 2 | 2 | 8 | 5 | **4.8** |
| MyCorporation | "Business License Compliance Package" | "Prepare Business License Applications" | "Over 1 Million Businesses Served"; Google 4.9 from 150 | $149 | About 1,000 core words | 7 | 5 | 2 | 7 | 5 | **5.2** |
| LicenseLogix | n/f | | | | | | | | | | **n/f** |
| Gamut | "The agentic operating system for teams and businesses" | "Start free trial" ($100, no card) | About 30 named testimonials | No | 8 to 10 screens | 5 | 7 | 8 | 9 | 6 | **7.0** |
| Permit expediters (permitplace.com) | Homepage served a guide: "How to Prepare for LA Restaurant Inspections" | "Schedule Time to Talk" | None | No (services page publishes ranges) | 500 to 600 words | 4 | 2 | 2 | 5 | 4 | **3.4** |
| Instinct | "Instinct is a personal assistant that understands what you're working on…" | "Text Instinct" | None | No | 80 to 100 words | 6 | 1 | 2 | 8 | 3 | **4.0** |
| Grok Bot (launch page) | "Introducing Grok Bot" / "your team of always-on agents" | "Download for macOS" | Internal xAI staff only | No | Long | 8 | 3 | 7 | 7 | 4 | **5.8** |
| Legora | "Legal work, without limits." | "Book a demo" | 9 logos (unnamed in text); commissioned study of 30; ISO 42001, 27001, SOC 2 II | No | 11 sections | 6 | 6 | 3 | 6 | 9 | **6.0** |
| Town | "A smarter CPA means smarter tax advice" | No button found in the text | 2 testimonials; named CPAs with years | Add-ons only | 800 to 900 words | 8 | 5 | 2 | 3 | 7 | **5.0** |
| Stripe | "Financial infrastructure to grow your revenue." | "Get started", "Sign up with Google", "Contact sales" | $1.9T volume 2025; 99.999% uptime; Amazon, Shopify, Anthropic | One click | 8 to 10 screens | 9 | 10 | 6 | 10 | 10 | **9.0** |
| Linear (/enterprise) | "An AI product system for modern enterprises" | "Talk to sales" | 40,000 teams; Coinbase, Oscar, Brex quotes | One click | About 1,000 words | 8 | 8 | 8 | 7 | 8 | **7.8** |
| Ramp | "Time is money. Save both." | "Get started for free" (email field), "See a demo" | 85,000 companies; about 20 named quotes; Notion "$1M+ saved" | No | About 12 sections | 9 | 10 | 8 | 10 | 8 | **9.0** |
| Superhuman (/email) | "Write professional email replies in seconds" | "Get Started for Free" | "4+ hours saved per week"; logo strip | No | 600 to 700 words | 9 | 7 | 7 | 9 | 7 | **7.8** |

These homepages were n/f (not fetched); the business model and product use the cited secondary pages: Meta Muse,
OpenAI Dots, ChatGPT agent (help page only), Perplexity Computer, Claude, Claude Code, Claude for Legal, Devin, Harvey
(a resources page showed "Request a Demo" and "$550M raised at a $15.5B valuation"), Alven, Poke (its docs say "Poke is
your AI assistant that lives in Apple Messages, Telegram, WhatsApp, and RCS": message it to start), Jack & Jill
(homepage counters "404,759 professionals, 5,816 companies", self-reported, per HeroHunt), DoNotPay, Tesla (only the
ordering help page) and SpaceX.

**Where Placetta wins on landing page.** It has the clearest hero in the compliance set. It shows more real product
than any competitor here except Gamut. Its pricing is the most complete of any B2B page read, and its calculator is
Ramp-grade.

**Where Placetta loses on landing page.** Proof integrity. "31,000+ businesses served worldwide since 2016" and "3+ new
US businesses served each day" sit on the same page as "Placetta has no customer averages to quote yet". The unit
economics doc says there is no production data. "Partner attorneys in 170+ countries" contradicts docs/COMPETITIVE.md
("until partner attorneys are signed"). Quotes attributed to a Starbucks GM, a Ferrari dealer, Stanford and Yale, and a
marquee of brands such as CHAGEE and Gong cha, read as customers to anyone skimming. The `PROOF` switchboard in
site/index.html says each needs written evidence on file. If that evidence exists, the page should say where the
31,000 come from (a predecessor firm?). If it doesn't, this is Delve's failure mode and DoNotPay's FTC order on one page.

Other losses:
- "Book a demo" opens an email client.
- The page runs about 12 desktop screens against Superhuman's 600 words.
- The footer line "An official website of Placetta" echoes the US government banner, which a page that disclaims any
  agency affiliation shouldn't borrow.

### 1c. Core product, for Placetta's job

Cov = coverage of the licenses a store needs, Done = done for the owner, Spd = speed to filing, Trk = tracking,
renewals and appeals, UI, Trust = trust and safety, Ch = channels and voice, $ = price and value.

| Company | Cov | Done | Spd | Trk | UI | Trust | Ch | $ | Avg | What the customer gets day to day |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **Placetta, live today** | 7 | 6 | 6 | 6.5 | 8.5 | 6.5 | 5 | 7.5 | **6.6** | A bilingual plan and dashboard with dated sources, one next action, approvals, a license report. Filings go to the team's queue until the portal worker is deployed. Texts and calls need Telnyx or Linq. No SOC 2. |
| *Placetta, in code (earlier passes)* | 7 | 8.5 | 8.5 | 8.7 | 8.5 | 8.5 | 9 | 9 | *8.4* | docs/COMPETITIVE.md; not live until the founder's steps above |
| Harbor Compliance | 8 | 7 | 4 | 6 | 6 | 4 | 3 | 4 | **5.3** | A specialist files; License Manager shows status and 90-day events. Reviews: "dropped the ball", "only an AI bot" |
| Avalara | 8 | 6 | 6 | 6 | 6 | 5 | 3 | 3 | **5.4** | A license report "in just minutes"; managed filing; dashboard; quote-only |
| CT / BizFilings / LicenseLogix | 7 | 5 | 4 | 6 | 5 | 7 | 3 | 6 | **5.4** | BizFilings: a kit by email in 5 to 7 days. LicenseLogix: managed, with an account manager |
| MyCorporation | 5 | 3 | 4 | 1 | 4 | 5 | 3 | 6 | **3.9** | A package of applications to fill in and file yourself |
| Gamut | 2 | 3 | 6 | 5 | 6 | 4 | 8 | 6 | **5.0** | A generic agent with a renewal template; no license data |
| Permit expediters | 6 | 8 | 7 | 6 | 5 | 7 | 5 | 2 | **5.8** | A person who files, chases and answers corrections, for one city and one project |
| Vanta | 1 | 2 | 2 | 3 | 8 | 8 | 4 | 3 | **3.9** | SOC 2 automation, hourly tests, Trust Center; no licenses |
| Drata | 1 | 2 | 2 | 3 | 7 | 8 | 4 | 3 | **3.8** | The same category; agents for questionnaires and vendors |
| Delve | 1 | 2 | 2 | 3 | 6 | 2 | 5 | 5 | **3.3** | Pre-filled evidence; the evidence itself is in dispute |
| Instinct | 1 | 4 | 4 | 1 | 3 | 3 | 8 | 2 | **3.3** | Text or call an agent that makes calls; early access, no error rates |
| Meta Muse | 1 | 4 | 4 | 1 | 5 | 3 | 8 | 6 | **4.0** | A WhatsApp agent that fills forms; prompt injection "unresolved" |
| OpenAI Dots | 2 | 4 | 5 | 2 | 7 | 4 | 7 | 5 | **4.5** | An always-on agent in ChatGPT, Slack, Teams and voice; no texting at launch |
| ChatGPT agent / Work | 2 | 4 | 4 | 1 | 7 | 5 | 4 | 6 | **4.1** | A virtual browser with takeover; 40 or 400 tasks a month |
| Perplexity Computer | 2 | 5 | 5 | 1 | 6 | 4 | 3 | 3 | **3.6** | Parallel subagents; credits burn unpredictably |
| Grok Bot | 1 | 5 | 5 | 2 | 6 | 4 | 7 | 3 | **4.1** | Bots on a cloud machine, taught by watching; one machine shared per account |
| Claude apps | 3 | 2 | 5 | 1 | 8 | 8 | 6 | 7 | **5.0** | Good answers and connectors; no filings or calendar |
| Claude Code | 1 | 3 | 4 | 1 | 6 | 8 | 4 | 6 | **4.1** | A kit to build what Placetta is |
| Claude for Legal | 3 | 2 | 4 | 2 | 7 | 8 | 5 | 6 | **4.6** | Practice-area plugins; "no status tracking" (LegalOn, competitor) |
| Devin | 1 | 3 | 3 | 1 | 7 | 6 | 5 | 5 | **3.9** | Unattended engineering work |
| Harvey | 3 | 2 | 4 | 2 | 8 | 9 | 4 | 2 | **4.3** | Cited legal drafts for lawyers; enterprise security |
| Legora | 3 | 2 | 4 | 2 | 8 | 8 | 5 | 3 | **4.4** | The same, inside Word |
| Alven | 1 | 3 | 3 | 2 | 5 | 4 | 5 | 5 | **3.5** | A vertical AI employee, for property managers |
| Poke | 1 | 3 | 5 | 2 | 6 | 5 | 9 | 7 | **4.8** | iMessage, WhatsApp, RCS, Telegram; SOC 2 II; reminders "an hour late" (Saner, competitor) |
| Jack & Jill | 1 | 2 | 3 | 1 | 5 | 4 | 6 | 6 | **3.5** | A 20-minute voice intake instead of forms; stale matches (Paraform, competitor) |
| Town | 2 | 7 | 4 | 5 | 4 | 7 | 4 | 5 | **4.8** | A named CPA files; AI answers instantly, the CPA within 24 hours |
| DoNotPay | 2 | 3 | 4 | 1 | 4 | 1 | 3 | 5 | **2.9** | Templated letters; FTC: outputs untested |
| Stripe, Linear, Tesla, SpaceX, Superhuman, Ramp | — | — | — | — | — | — | — | — | — | Not in the job. Patterns: Stripe's test mode (a sample anyone can try), Linear's speed and changelog, Tesla's price-first configurator, Superhuman's onboarding, Ramp's "switch in days" |

**Where Placetta wins on core product.** No one else in the set maps, files and renews licenses with agency-cited
rows, in Chinese, per store, for $149. The UI beats every licensing incumbent's (sample: one next action, cost to open
with unpublished fees left open, per-store readiness). Abstaining instead of guessing is the anti-DoNotPay design.

**Where Placetta loses on core product.** What's live:
- Filing is still the team, as at Harbor, because the worker isn't deployed.
- Texts, calls and iMessage need setup. Poke and Instinct are live on them.
- No audit report. Vanta, Harvey and Legora show theirs.
- Speed is modeled, not measured.
- The expediter still wins complex plan review with a person on the phone.

## 2. Each competitor in two lines

| Company | Copy this | Fill this weakness |
|---|---|---|
| Vanta | Named, checkable proof: 16,000 customers, named CISOs, an analyst rank; an auditor directory | Quote-only price, 60 to 90 day cancel windows, 30 to 50% renewal jumps (UnderDefense, competitor): keep the price public and cancellation one click |
| Drata | Agents that "enforce policies before actions run" with audit-ready records (Odelia's policy gate already does this) | A hero no one understands in 5 seconds ("Explore the World of Agentic Trust") |
| Delve | Speed as the headline ("in days") and free white-glove onboarding with 1:1 Slack | Evidence that wasn't real, alleged offshore "independent" auditors, Lorem ipsum on the live page: every claim Placetta makes must be provable |
| Harbor | The free "Compliance Score" lead magnet and the 90-day licensing-events view | Paid work not done, "only an AI bot" on the phone, fees a specialist "may invoice" later |
| Avalara | "See our product" interactive tour; geocoded jurisdictions | No price, built for 100+ licenses, auto-renewals without approval (BBB) |
| CT / BizFilings / LicenseLogix | A dedicated account manager; a priced, tangible deliverable ($149) | A kit by email in 5 to 7 days that the owner still files; no status |
| MyCorporation | Price in the hero; fees and where to send them in one list | No renewals, no tracking, "Lousy response time" |
| Gamut | A free trial with no card and no sales call; dozens of named testimonials | A generic agent with no license data; it can't say what "file permits" means |
| Permit expediters | Corrections turned around in 24 to 48 hours by a person; a client portal | $7,500 to $12,500 a restaurant, one city, gone at opening |
| Instinct | One CTA, "Text Instinct", no app | No proof and no error rates; early access only |
| Meta Muse | Distribution where the user already is (WhatsApp) | Prompt injection "unresolved"; trains on data by default |
| OpenAI Dots | One agent included in the seat, "no extra charge", with approval rules the user sets | Withheld GPT-6.1 Astra for a "willingness to mislead users"; no texting at launch |
| ChatGPT agent | Takeover where "Screenshots aren't captured", which protects passwords | Task caps that count failed runs; resuming can fail |
| Perplexity Computer | Parallel subtasks into one deliverable | Credit burn with no per-task estimate ($200 of extra credits in two days on one page) |
| Grok Bot | Teach by watching once, then it repeats the routine (already copied: teach mode) | No published price; one shared machine and logins per account |
| Claude apps | A connector directory people trust | No system of record and no filings |
| Claude Code | Plan, act, check, with permissions | A kit, not a product |
| Claude for Legal | Plugins by practice area | "No centralized view of all matters, no status tracking" |
| Devin | Bill the work, not the seat; idle not billed | Loops that burn hours on unstated rules |
| Harvey | Enterprise trust and BigLaw logos | No price, a 25-seat minimum, years of escalation |
| Legora | Meets lawyers inside Word; security badges in a row | "Thin" last mile on rented models |
| Alven | Price per unit ($10 a unit), sold as an "AI employee" | No stated limits or verified results |
| Poke | Apple-approved iMessage agent, texting as the whole interface | Reliability: reminders "an hour late", about seven in ten nudges right (competitor's test) |
| Jack & Jill | Pay only on outcome, refund if it doesn't stick (10%, 3 months) | Stale and irrelevant matches; no human in the loop |
| Town | A named professional with credentials and a 24-hour answer, the AI as the fast first line | No base price on the page; the product is never shown |
| DoNotPay | Consumer-simple, flat subscription | Claimed lawyer-grade results it never tested: FTC, $193,000 and a claims ban |
| Stripe | Self-serve signup in one step, uptime and volume as proof, pricing one click away | — |
| Linear | Product speed shown, not claimed; a public changelog | Pricing off the hero |
| Tesla | The price and the order are the page; a configurator, not a sales call | A non-refundable order fee |
| SpaceX | n/f this session | n/f |
| Superhuman | A short page with one promise ("4+ hours saved per week") and a free start | No price on the page |
| Ramp | The savings line in the hero, an input for the company's own context, about 20 named quotes | No price shown |

## 3. Already copied, and not yet

Checked against docs/COMPETITIVE.md, docs/PRICING.md, site/index.html and src/.

| Pattern | From | Status | Where |
|---|---|---|---|
| Continuous checks instead of point-in-time | Vanta | Copied (code; live once the monitor is deployed) | supabase/functions/monitor |
| Trust Center overview with control statuses | Vanta, SafeBase | Copied, honest "no SOC 2 yet" | site/trust.html |
| A license research report; an Excel export | BizFilings, Avalara, CT | Copied | src/report.ts, src/LicenseReport.tsx |
| 90-day renewal view, tiered alerts | Harbor, Gamut | Copied | src/runway.ts, monitor RENEWAL_ALERTS |
| Plan-review corrections | Expediters | Copied | src/corrections.ts |
| Teach by watching | Grok Bot, Skyvern | Copied | worker/filer/src/recorder.ts |
| Parallel markets | Perplexity Computer | Copied | plan_markets |
| Connector directory, own MCP server | Claude | Copied; directory listing not submitted | docs/mcp/DIRECTORIES.md |
| Per-unit pricing | Alven | Copied (per store) | src/pricing.ts |
| Input-first hero; ROI calculator | Ramp | Copied | site/index.html hero, rent calculator |
| Comparison against the human alternative | Devin, expediters | Copied (attorney vs expediter vs Placetta) | site/index.html pricing |
| Text and chat-app channels | Poke, Instinct, Muse | Copied in code; **not live** (Linq, Telnyx setup) | odelia-sms, odelia-voice |
| Enterprise SSO, SCIM, audit export | Harvey | Copied | docs/ENTERPRISE.md |
| Free entry point | Harbor's free score, Gamut's trial | Copied (free plan preview) | site, app |
| Evidence behind every public claim | Vanta (named, checkable); Delve and DoNotPay as the warning | **Not yet**: the `PROOF` flags are all `true` and the repo shows no evidence; the page contradicts itself | site/index.html `PROOF` |
| Pay on outcome, with a refund | Jack & Jill, Stripe | **Not yet** (founder; noted in COMPETITIVE.md) | |
| Monthly billing or a one-store pilot | Claude, Poke, Superhuman | **Not yet**: yearly only, $1,788 up front | src/pricing.ts |
| Public interactive sample from the hero | Vanta, Avalara, Stripe test mode | **Not yet**: the sample build exists, but the page links only to /sample-plan (an anchor) and /app/ | |
| A real demo booking | Harbor, Vanta, Legora | **Not yet**: mailto | site/index.html `hero.demo` |
| A signed partner network shown as a directory | Vanta's auditor directory, Harbor | **Not yet**: the claim is live, the partners aren't signed | |
| An audit report (SOC 2 Type I) | Vanta, Harvey, Legora, Poke | **Not yet** (founder) | site/trust.html says so |
| A named human per account with a response time | Town, CT | **Partly**: a specialist on request within one business day, not named | src/Specialist.tsx |
| A short page | Superhuman, Instinct | **Not yet**: about 12 desktop screens | |
| A public changelog and status page | Linear, Stripe | **Not yet**: no changelog; trust.html links to providers' status pages | |

## 4. Top 10 steals not yet done

Ranked by customer impact over effort.

| # | Steal | From | Type | Customer impact | Effort |
|---:|---|---|---|---|---|
| 1 | **Prove or pull every proof claim.** Set `PROOF.stats31000`, `testimonials`, `chagee`, `stanford`, `wakimasu`, `customerNames` and `backersLogos` to false until the written evidence is on file. Change "Partner attorneys in 170+ countries" to what's signed. Drop "An official website of Placetta" | Vanta's checkable proof; Delve's and DoNotPay's failure | Code (landing), then founder (evidence) | Very high. One contradiction screenshot in a WeChat founders' group costs more than every steal below wins. FTC exposure | XS (flags exist) |
| 2 | **Make the live product match the page.** Fix GitHub Actions billing, apply the pending migrations, deploy the portal worker, start Linq (iMessage the same day) and Telnyx | Vanta's "continuously monitored" is real; Poke and Instinct are live on text | Founder setup | Very high. Done for the owner 6 to about 8, channels 5 to about 8 | Hours plus vendor fees |
| 3 | **Charge the $299 when the agency issues the license, not on approval**, or refund it if a filing is denied for Placetta's error | Jack & Jill (10% on hire, 3-month refund); Stripe | Founder (pricing), then code (billing on the issued event) | High. Answers Harbor's "paid and not done" directly | S once decided |
| 4 | **A monthly option for a first store**, or a 90-day one-store pilot, instead of $1,788 up front | Claude, Poke, Superhuman monthly; Vanta's renewal complaints as the warning | Founder (pricing), then code (one Stripe price env var) | High for single-store owners, the beachhead's first purchase | S |
| 5 | **Open the sample workspace from the hero**: "See Odelia work, no signup" | Vanta's interactive demo, Avalara's "See our product", Stripe's test mode | Code (landing) | Medium-high. The product is Placetta's best proof and it's hidden | S (the build exists) |
| 6 | **Sign the network before claiming it**: 3 to 5 partner attorneys and expediters in SF Bay, LA, NYC and Houston, shown as a named directory | Vanta's auditor directory; Harbor | Founder (partnerships), then code (landing) | High. Covers the corrections and in-person gap where expediters still win | Weeks |
| 7 | **A named bilingual specialist per account**, with photo, years and "answers within one business day" | Town's named CPAs; CT's account manager | Founder (staffing), then code (landing, app) | High for Chinese owners, who buy trust from a person | S to M |
| 8 | **A real demo booking** (a calendar link with a Chinese-language slot, plus WeChat) instead of mailto | Harbor, Vanta, Legora | Code (landing) | Medium | XS |
| 9 | **A SOC 2 Type I**, bought from the category this page studies (Vanta's startup edition is reported at $7,500 to $12,000, the audit is separate) | Harvey, Legora, Poke, Vanta | Founder | Medium. Required by chains and franchise headquarters | Months, $ |
| 10 | **Cut the page to about 5 screens**: hero, live sample, how filing works, pricing, FAQ. Move industries, the map, backers and the franchise view to their own pages | Superhuman (600 to 700 words), Stripe, Instinct | Code (landing) | Medium. A phone is about 18 screens today | M |

Left out on purpose:
- Multi-year discounts (Vanta and Drata's 15 to 35%). They lock customers in, the opposite of #4.
- A "Compliance Score" lead magnet. The free plan preview already is one.
- More connectors. Closed in code in earlier passes.
