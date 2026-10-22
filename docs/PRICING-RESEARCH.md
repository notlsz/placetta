# Pricing research

Why customers pay, and how 17 companies price and anchor. Gathered on 2026-10-22 for the move to the simple
per-license model (`docs/PRICING.md`). Every price is as published or reported on that date. Where a source is a
competitor or a vendor writing about itself, that is noted, because those sources lean.

Three official pages could not be read from this environment (the fetch was refused): devin.ai/pricing,
vanta.com/pricing and stripe.com/atlas. Their figures below come from Stripe's own docs, or from third parties, and are
marked as such.

## What matters for Placetta (the short version)

1. **The real alternative to a license filing costs $99 to $403 per filing, plus government fees, and nobody includes
   the government fee.** Harbor Compliance charges $100 to $175 per state for an annual report and from $299 per state
   for a foreign qualification. TaxJar charges $299 per state to register for sales tax. Avalara charges $403 per
   location. CorpNet charges $349 per address just to research licenses, and more to file. Placetta's $299 per license,
   filed, sits in the middle of that band, and below the ones that also do the filing.
2. **The expediter is the anchor that makes the price feel small.** PermitPlace puts a restaurant opening at $2,000 to
   $7,500 in expediter fees, before municipal fees, and a commercial tenant improvement at $2,000 to $10,000. A whole
   restaurant opening on Placetta, filed license by license, lands inside or below that range, and the expediter's
   number covers one city only.
3. **Renewals are priced around $100 everywhere.** Northwest Registered Agent renews at $125 a year a state, Harbor
   Compliance at $149, Stripe Atlas at $100, LegalZoom's license monitoring at $99 a year, Harbor's annual reports at
   $100 to $175. TaxJar's per-return fee is now $50 to $55 pay as you go (about $19 to $22 only on the prepaid
   unlimited bundle), not the $25 the brief assumed. $99 for a renewal, prepared and filed, is in line.
4. **Agents are sold as work done, not seats, and anchored against a person's time.** Devin sells "working time, not
   access licenses" (about 15 minutes per ACU) and points to 20x savings against engineer time. OpenAI bundles Dots
   into Pro so the agent "costs nothing extra". Perplexity puts Computer only in the $200 Max plan. The lesson: price
   the outcome (a license filed), and show the human alternative next to it.
5. **One plan is marked as the default, and a much bigger one sits beside it.** Grok labels SuperGrok "Most popular" at
   $30 next to Heavy at $300; Claude, ChatGPT and Perplexity put a $100 to $200 tier next to a $20 one. Annual billing
   is shown as a 15 to 17% saving (Grok, Perplexity, Claude Pro, Avalara). A free tier is the entry point almost
   everywhere in consumer AI; in compliance it's rare (Vanta, Avalara and LicenseLogix are quote-only), which makes free
   tracking and a free plan preview a real difference.

## Company by company

### Devin (Cognition), AI software engineer

- **Prices.** Core: pay as you go from $20, $2.25 per ACU, up to 10 concurrent sessions. Team: $500 a month with 250
  ACUs at $2.00 each, unlimited sessions. Enterprise: custom (VPC, SSO, dedicated team). One ACU is about 15 minutes of
  active work; idle time isn't billed. Seats are unlimited on every plan. ([Pensero, Apr 2026](https://pensero.ai/blog/devin-pricing); the official page, devin.ai/pricing, could not be fetched)
- **Anchoring.** A volume discount (Team's ACU is 11% cheaper than Core's) pulls teams up a tier. The value story is
  against engineer time: Nubank's case is cited as 20x cheaper than human engineering on the delegated work.
- **Why customers pay.** Work done in parallel (an 18-month migration finished in weeks), on well-defined, repetitive
  tasks: migrations, dependency updates, tests. Pensero sells a competing product, so its framing may lean.

### Alven, AI property manager

- **Prices.** Not published. Alven is a London B2B SaaS startup building "an AI employee" for property management
  across the resident journey, from move-in to move-out, with about $1.5M raised. ([Nordic9](https://nordic9.com/companies/alven-ai))
- **How the category prices.** AI property management is sold mostly per unit a month, with tiers by portfolio size,
  enterprise flat fees above about 1,000 units, and transaction fees on top. Value is framed as staff time avoided:
  15 to 25% lower operating costs and a 12 to 18 month payback. ([EliseAI, vendor](https://eliseai.com/blog/ai-property-management-software-costs))
- **Why customers pay.** To replace leasing and maintenance coordination work with an always-on agent. The "AI
  employee" label is itself the anchor: a salary, not a software line.

### OpenAI: ChatGPT agent and Dots

- **ChatGPT agent.** Included in Plus ($20 a month, 40 agent tasks a month) and Pro ($200, 400 tasks); Team gets 40 per
  user and can buy more. Only messages that move the agent forward count. ([Chalk Talk AI](https://chalktalkai.substack.com/p/chatgpt-agent-openais-new-virtual), [PricePerToken](https://pricepertoken.com/subscriptions/chatgpt))
- **Dots (always-on agents).** Not sold on their own: "Your first dot is included in your Pro or Business Premium plan
  at no extra cost." Pro comes at $100, $200 and a new $500 tier; Business Premium is $100 a user a month billed yearly
  ($125 monthly). Free, Go ($8) and Plus ($20) have no dot. ([eesel](https://www.eesel.ai/blog/openai-dots-pricing), [Bloomberg Tax](https://news.bloombergtax.com/private-equity/openai-unveils-always-on-ai-agent-dots-new-500-paid-tier))
- **Anchoring.** Bundling: the agent is "free" inside a plan people already want. Annual billing is a 20% saving on
  Business seats. The $500 tier makes $200 look moderate.
- **Why customers pay.** They want Pro for other reasons (Codex, deep research), and the agent comes with it; in the EU
  and UK, Business Premium is the only way in.

### Grok (SuperGrok)

- **Prices.** Free; SuperGrok Lite $10 a month; SuperGrok $30 ($300 a year); SuperGrok Plus $100; SuperGrok Heavy $300
  ($3,000 a year); Business $30 a seat. ([AI Toolbox](https://www.ai-toolbox.co/grok-models/grok-pricing-plans-api-2026), [CloudZero](https://www.cloudzero.com/blog/grok-pricing/))
- **Anchoring.** SuperGrok is labeled "Most popular". Heavy at 10x the price is mainly a usage upgrade, so it exists to
  make $30 look reasonable. Annual billing saves about 17%. A free tier with capped usage is the entry point.
- **Why customers pay.** Daily users who hit the free caps; heavy users who live in it all day.

### Perplexity (Pro, Max, Comet, Computer)

- **Prices.** Free (about 5 Pro searches a day); Pro $20 a month or $200 a year (about 17% off); Max $200 a month or
  $2,000 a year; Enterprise Max $325 a seat. Computer is only in Max, with 10,000 credits a month; auto-refill is off by
  default with a $200 cap the person sets. Comet Plus comes with Pro. ([PricePerToken](https://pricepertoken.com/subscriptions/perplexity), [SentiSight](https://www.sentisight.ai/how-much-perplexity-computer-cost/))
- **Anchoring.** Pro is the default paid tier; Max is for "power researchers who hit Pro ceilings". The agent
  (Computer) is the reason to step up 10x. Spending past the plan only happens under a cap the person chose.
- **Why customers pay.** One managed place that routes work across many models, with no setup.

### Claude (Pro and Max)

- **Prices.** Free; Pro $17 a month billed yearly ($200) or $20 monthly; Max from $100 a month (5x Pro's usage) or $200
  (20x). ([Claude pricing](https://claude.com/pricing))
- **Anchoring.** Max is "everything in Pro, plus" more usage, framed as a multiple of Pro (5x, 20x), "for people who
  work with Claude all day". Pro shows its yearly saving. No "most popular" badge.
- **Why customers pay.** Usage headroom for daily work, and priority at busy times.

### Vanta (compliance automation)

- **Prices.** No public rate card; every direct sale is a quote. On AWS Marketplace, for 1 to 20 employees, a year:
  Essentials $14,000, Plus $21,500, Professional $23,000. Observed contracts run $7,500 to $57,207 a year, median
  $20,000 (Vendr, 374 purchases). Add-on modules $6,000 to $22,250. ([SOC 2 Auditors](https://soc2auditors.org/insights/vanta-pricing/); vanta.com/pricing could not be fetched)
- **Anchoring.** Sold as total first-year cost: the platform plus a CPA audit (about $9,000), roughly $23,000 before
  scoping. Tiers step up by questionnaires included.
- **Why customers pay.** A SOC 2 report unblocks enterprise deals. The buyer pays to close revenue, not for software.

### Stripe Atlas

- **Prices.** $500 once: a Delaware C corporation or LLC, the EIN, and the first year of registered agent. Then $100
  a year for the registered agent. ([Stripe docs](https://docs.stripe.com/atlas/how-atlas-works))
- **Anchoring.** One flat price for everything a founder needs on day one, with the renewal small and stated up front.
  Partner credits make the $500 feel free.
- **Why customers pay.** Speed and certainty: a company that can take payments and open a bank account, without a
  lawyer.

### Northwest Registered Agent

- **Prices.** LLC formation $39 plus state fees, with the first year of registered agent included; then $125 a year a
  state. Annual report service $100 plus state fees. ([ZenBusiness, a competitor](https://www.zenbusiness.com/northwest-registered-agent-llc-service-review/))
- **Anchoring.** A very low entry price ($39), with the recurring $125 doing the earning. "Keeps the upsells to a
  minimum" is part of the pitch.
- **Why customers pay.** Privacy (their address, not yours, on public records), local people, no data sold.

### Harbor Compliance

- **Prices.** Registered agent $99 the first year, then $149 a year (two years $198, three $297); annual report filing
  $100 to $175 per state plus state fees; foreign qualification and amendments from $299 per state plus state fees;
  software suite (Entity, License, Tax Manager) $399 to $799 a year; business license research and management by
  quote. Government fees are always on top. ([Ecommerce Paradise](https://ecommerceparadise.com/harbor-compliance-pricing-2026/))
- **Anchoring.** A cheap first year on the registered agent, multi-year prepay, and up to 10% off for multi-state.
  License work is quote-only, which makes it hard to compare.
- **Why customers pay.** One vendor for every state's filings and deadlines, so nothing lapses.

### LicenseLogix (Wolters Kluwer CT Corporation)

- **Prices.** Not published; "request a free quote". Charged per transaction (research, filing, renewal), for 800+
  corporate customers. Resellers such as Harvard Business Services send buyers to LicenseLogix for the quote.
  ([Business Wire, 2021 acquisition](https://www.businesswire.com/news/home/20211029005475/en), [Delaware Inc.](https://delawareinc.com/ourservices/business-licenses))
- **Anchoring.** None public: a quote, sold through CT Corporation's enterprise relationship.
- **Why customers pay.** Licenses renew on their own schedules in thousands of jurisdictions; one firm tracks and files
  all of them.

### LegalZoom (and its peers)

- **Prices.** Business license package $99 a year: a requirements summary, notifications, a dashboard and support.
  Filing fees extra. Peers: Swyft Filings $99 (specialists help complete forms), Bizee $99 (research and forms, no
  completion), CorpNet $349 for one address plus $79 per extra address (research only; filing costs more),
  MyCompanyWorks $99 (a wizard; hands-on help is the $399 concierge). ([Startup Savant](https://startupsavant.com/best-business-license-services))
- **Anchoring.** $99 is the category's entry price, and it buys a list, not filings.
- **Why customers pay.** Not knowing which licenses apply, and fear of missing one.

### Avalara and TaxJar (sales tax)

- **Avalara.** AvaTax Core $79 a state a month or $799 a year ("15% saving"); registration $403 per location; returns
  priced from estimated annual volume (not published); quote-based checkout. Median contract $16,898 a year (Vendr).
  ([Zamp, a competitor](https://zamp.com/article/avalara-pricing))
- **TaxJar.** Starter from $39 a month, Professional from $99, rising with order volume; AutoFile $50 a return
  (Starter) or $55 (Professional) pay as you go, $45 to $50 in prepaid bundles of 25 to 100, about $19 to $22 on the
  unlimited bundle; 2 or 4 free filings a year included; registration $299 a state. ([TaxJar support](https://support.taxjar.com/article/409-how-much-does-autofile-cost), [Zamp](https://zamp.com/article/taxjar-pricing))
- **Anchoring.** Annual billing discounts, prepaid bundles, and included free filings. The surprise is the per-return
  and registration fees, which drive the real total.
- **Why customers pay.** Thousands of jurisdictions, filed on time, without a person counting nexus.

### Toast (restaurant point of sale)

- **Prices.** Starter Kit $0 a month; Point of Sale from $69 a month; Build Your Own quoted. $0 upfront hardware for 1 to
  2 terminals in exchange for a higher card rate (3.09% to 3.69% + $0.15, versus 2.49% + $0.15). Kits $1,113 to $1,454.
  Two to three year contracts. ([NerdWallet](https://www.nerdwallet.com/business/software/reviews/toast-pos))
- **Anchoring.** A $0 entry point, with the margin moved into per-transaction fees.
- **Why customers pay.** One system for the whole restaurant, built to survive a kitchen, with support at all hours.
  Most worth it for multi-location operators.

### Gusto (payroll)

- **Prices.** Simple $49 a month + $6 a person; Plus $80 + $12; Premium $180 + $22; Contractor Only $35 + $6 (base fee
  waived for six months). Free setup, no contract. ([Hire in South](https://www.hireinsouth.com/post/gusto-pricing), [SpotSaaS](https://www.spotsaas.com/blog/gusto-pricing))
- **Anchoring.** A base fee plus a per-person fee, three good-better-best tiers, and unlimited payroll runs at no extra
  fee.
- **Why customers pay.** Payroll taxes calculated and filed automatically, so the owner never files them by hand.

### Jolt (restaurant operations and food safety)

- **Prices.** From about $89.99 a month (listed starting price; not stated whether per location); products sold alone or
  in bundles, priced through sales. ([Software Advice](https://www.softwareadvice.com/logbook/jolt-profile/))
- **Anchoring.** Bundle discounts; a free trial.
- **Why customers pay.** Checklists, temperature logs and date labels that keep every store ready for a health
  inspection, with one view across locations. Reviewers warn about contract lock-in.

### Permit expediters

- **Prices.** Restaurant or food service $2,000 to $7,500 per opening, before municipal fees; commercial single site
  $1,500 to $5,000; commercial tenant improvement $2,000 to $10,000; multi-site rollouts $1,000 to $3,500 per location;
  municipal fees on top, $200 to $5,000+. Hourly billing for complex jobs; retainers for large portfolios.
  ([PermitPlace](https://permitplace.com/permit-expediter-cost-guide/)) In New York City, $50 to $250 an hour
  ([PermitFlow](https://www.permitflow.com/blog/nyc-permit-expediter), already cited on the landing page).
- **Anchoring.** Quoted per job, so the buyer compares against the cost of a late opening (rent with no sales).
- **Why customers pay.** Speed: someone who knows the building department, and a lower risk of a rejected submission.
  The work usually ends on opening day, and each city is a new firm.

## What this means for each of the founder's numbers

| Founder's number | The real alternatives | Verdict |
| --- | --- | --- |
| Any license, filed: $299 | Harbor $100 to $175 (annual reports) and from $299 (foreign qualification), TaxJar registration $299, Avalara registration $403, CorpNet $349 for research only, LegalZoom $99 for a list only | In line. Keep $299 |
| Complex license (liquor, building plan review, import permits): $999 | Expediters $2,000 to $7,500 per restaurant, $2,000 to $10,000 per tenant improvement | Well below the alternative. Keep $999 |
| Renewal: $99 | Northwest $125 a year a state, Harbor $149 and $100 to $175, Atlas $100, LegalZoom $99, TaxJar $50 to $55 a return | In line. Keep $99 |
| Tracking: free | LegalZoom charges $99 a year for monitoring; Harbor's software is $399 to $799 a year | A real difference. Keep free |
| 10+ stores: $149 a store a month, all-inclusive, billed yearly | Jolt about $90 a month for operations software; multi-site expediting $1,000 to $3,500 per location per opening; Harbor License Manager $399 to $799 a year, software only | In line, and the same $149 the old Essentials plan charged. Keep |
| Government fees at cost | Every company above passes them through, none includes them | Keep |
