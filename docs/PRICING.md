# Pricing

The founder approved the owner prices below on 2026-10-22. This page has the whole list with its units, the Stripe
prices to create for it, and the margin each one is expected to leave.

**Every figure on this page is an estimate (est.).** That includes the prices: the code is the source of truth
(`src/pricing.ts`), and this page is a copy written for reading. Each cost figure is a budget, not a measurement. The
staff margin view (`ai_margin_company`, see `docs/AI_COSTS.md`) shows the real numbers once customers are on these
prices.

Code: `src/pricing.ts` (the list), `src/modules.ts` (units and quotes), `src/overage.ts` (filings past the plan),
`src/hqPlan.ts` (the brand plan), `src/contract.ts` (terms), `supabase/functions/billing` (quotes and charges),
migration `20261022163712_owner_prices.sql`.

## Rules every owner price follows

- Shown only to a signed-in owner (Settings, Billing and Modules; a filing's approval card; the plans sheet). None of
  these prices goes on the landing page. `scripts/growth-test.ts` fails if one shows up in `site/index.html`.
- Shown before the charge, with its unit, in English and Chinese.
- Never charged without that owner's approval of the exact amount shown. The billing function works the quote out
  again when the owner approves and refuses it if the units or the amount differ by a cent.
- Charged only from its own Stripe price, named by an env var, and only when Stripe's amount, currency and interval
  match the approved price. When the env var is missing or the Stripe price differs, the team sends a quote and nothing
  is charged. The function never charges an amount it worked out itself.
- Agency, notary and other government fees are never included. The business pays them to the agency, or they are passed
  through at cost.

## Published prices (on the landing page, unchanged)

| Item | Price (est.) | Unit |
| --- | --- | --- |
| Essentials | $149 | a location a month, billed yearly ($1,788 a year) |
| Pro | $299 | a location a month, billed yearly ($3,588 a year) |
| Opening, retail | $3,500 | a store still opening, one time |
| Opening, restaurant or food | $6,500 | a store still opening, one time |
| Entry plan | $299 | a market, one time |
| Headquarters plans | from $25,000 | a year |
| Odelia pack | $49 | one time, adds $25 of Odelia allowance |
| Open-by-date guarantee | $2,500 | an opening store, one time |

## Owner prices (approved 2026-10-22)

| Item | Price (est.) | Unit | How the app counts it |
| --- | --- | --- | --- |
| Extra filing, automated | $49 (1 Odelia pack) | each, past the allowance | Odelia files it on her own: email, fax, or a portal she works, with a typed or drawn signature |
| Included automated filings | 2 | a paid location a month | `filing_month.used` counts automated filings only |
| Extra filing, assisted | $199 | each, never in the allowance | needs Placetta's team: a wet signature, mail only, or no verified route (`supabase/functions/file/destinations.ts`) |
| Entity compliance | $299 | a legal entity in each state it's registered in, a year | each entity and state pair under Settings, Entities |
| Sales tax returns | $49 | a state a month, billed yearly ($588 a year) | each US state a store's address is in |
| Alcohol | $79 | a licensed location a month, billed yearly ($948 a year) | each store an owner marks as holding a liquor license |
| Imports and customs | $499 | the importing company a month, billed yearly ($5,988 a year) | 1 a workspace. The customer's customs broker still files the entries |
| Europe and Mexico | $1,500 | each new country, one time, on the next invoice | each country code a store's address ends in that wasn't charged before (`billing.abroad_countries`). The stores there pay the usual location price. Notary and government fees at cost |
| Enterprise security | $500 | the company a month, billed yearly ($6,000 a year) | 1 a workspace: SSO, SCIM, audit export and roles |
| Brand plan, people | 3 included | a location | franchisee team members; headquarters' own dashboard viewers never count |
| Brand plan, each person past those | $240 | a person a year | |
| 2-year term | 5% off | the location price, billed yearly | |
| 3-year term | 10% off | the location price, billed yearly | |

Monthly module prices are billed yearly on the same contract as the plan, the way the per-location plans are. Adding
one mid-term charges the prorated part now, as Stripe's own preview of the change works it out to the second the owner
saw it (`invoices/create_preview` with `proration_behavior=always_invoice`, then the same `proration_date` when it's
applied). A quote is good for 30 minutes (est.). When the workspace's facts change (a new state, another licensed
store), Settings offers the new units with a new quote; nothing changes on its own.

The multi-year discount applies to the per-location plan price only, not to modules, packs or one-time fees. The
discounted price carries into each yearly renewal, as the renewal terms say ("renews every year at the same price").

### Not confirmed yet (still marked FOUNDER TO CONFIRM in `src/pricing.ts`)

| Item | Value (est.) |
| --- | --- |
| A new workspace's monthly cap on filings past the plan | $0 |
| Highest monthly cap an owner can set in the app | $5,000 |
| Hours a filing, a renewal and an entity report would have taken (value report only) | 3, 1, 1 |

## Stripe prices the founder must create

All in USD, standard (per unit) pricing, recurring prices with an interval count of 1. Set each price id as the env
var on the billing function. Names are what the invoice shows.

| Env var | Product name | Amount (est.) | Interval |
| --- | --- | --- | --- |
| `STRIPE_PRICE_MODULE_ENTITY` | Placetta module: Entity compliance | $299.00 | yearly |
| `STRIPE_PRICE_MODULE_SALES_TAX` | Placetta module: Sales tax returns | $588.00 | yearly |
| `STRIPE_PRICE_MODULE_ALCOHOL` | Placetta module: Alcohol | $948.00 | yearly |
| `STRIPE_PRICE_MODULE_IMPORTS` | Placetta module: Imports and customs | $5,988.00 | yearly |
| `STRIPE_PRICE_MODULE_ABROAD` | Placetta module: Europe and Mexico, new country | $1,500.00 | one time |
| `STRIPE_PRICE_MODULE_SECURITY` | Placetta module: Enterprise security | $6,000.00 | yearly |
| `STRIPE_PRICE_FILING_ASSISTED` | Placetta assisted filing | $199.00 | one time |
| `STRIPE_PRICE_HQ_PERSON` | Placetta brand plan: person past those included | $240.00 | yearly |
| `STRIPE_PRICE_LOCATION_2Y` | Placetta Essentials, 2-year term | $1,698.60 | yearly |
| `STRIPE_PRICE_LOCATION_3Y` | Placetta Essentials, 3-year term | $1,609.20 | yearly |
| `STRIPE_PRICE_LOCATION_PRO_2Y` | Placetta Pro, 2-year term | $3,408.60 | yearly |
| `STRIPE_PRICE_LOCATION_PRO_3Y` | Placetta Pro, 3-year term | $3,229.20 | yearly |

The automated filing uses the existing Odelia pack price (`STRIPE_PRICE_PACK`, or the `placetta_odelia_pack` lookup
key), so it needs no new price. Until each price above exists, its item falls back to a team quote.

## Margin assumptions

Gross margin here is price less the cost of delivering it: AI, hosting, Stripe fees and team time. Pass-through fees
are not revenue and not cost. The inputs, all estimates:

| Input | Value (est.) | Basis |
| --- | --- | --- |
| Team time | $60 an hour, loaded | salary, payroll taxes, benefits and tools |
| Stripe | 3.6% of the amount | 2.9% card plus 0.7% Billing. The $0.30 card fee is shared across one invoice a year and left out. ACH costs less |
| AI, a filing job | $0.50 to $1 | `docs/AI_COSTS.md`: a typical job is about $0.30 to $0.35, with room for longer forms |
| AI, a location's typical year | $60 Essentials, $96 Pro | `docs/AI_COSTS.md`: $3 to $4 a location a month typical, more on Pro |
| Hosting | $2 a location a month, more for the security module's log storage | Supabase, Vercel, the filer worker, fax and email sending |
| Pass-through | agency, state, notary, gestor, customs broker and bond fees | paid by the business or billed at cost, never marked up |

Per item, a year unless it says otherwise (every figure an estimate):

| Item | Price (est.) | AI (est.) | Hosting (est.) | Team hours (est.) | Other (est.) | Stripe (est.) | Cost (est.) | Gross margin (est.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Essentials, a location | $1,788 | $60 | $24 | 1.5 ($90) | $48 included filings | $64.37 | $286.37 | 84% |
| Pro, a location | $3,588 | $96 | $36 | 3 ($180) | $48 included filings | $129.17 | $489.17 | 86% |
| Essentials, 2-year term | $1,698.60 | $60 | $24 | 1.5 ($90) | $48 | $61.15 | $283.15 | 83% |
| Essentials, 3-year term | $1,609.20 | $60 | $24 | 1.5 ($90) | $48 | $57.93 | $279.93 | 83% |
| Pro, 2-year term | $3,408.60 | $96 | $36 | 3 ($180) | $48 | $122.71 | $482.71 | 86% |
| Pro, 3-year term | $3,229.20 | $96 | $36 | 3 ($180) | $48 | $116.25 | $476.25 | 85% |
| Automated filing, each | $49 | $0.50 | $0.50 | 0.05 ($3) review | | $1.76 | $5.76 | 88% |
| Assisted filing, each | $199 | $1 | $0.50 | 0.75 ($45) | $8 printing, postage, courier | $7.16 | $61.66 | 69% |
| Entity, an entity in a state | $299 | $1 | $2 | 0.75 ($45) | | $10.76 | $58.76 | 80% |
| Sales tax, a state | $588 | $6 (12 returns) | $12 | 1.2 ($72, 0.1 a return) | | $21.17 | $111.17 | 81% |
| Alcohol, a licensed location | $948 | $6 | $12 | 2.5 ($150) | | $34.13 | $202.13 | 79% |
| Imports and customs, the company | $5,988 | $60 | $60 | 15 ($900) | | $215.57 | $1,235.57 | 79% |
| Enterprise security, the company | $6,000 | | $120 | 5 ($300) security reviews | $600 SSO and SCIM vendor | $216 | $1,236 | 79% |
| Europe and Mexico, a new country, once | $1,500 | $10 | $5 | 10 ($600) research and a local partner | | $54 | $669 | 55% |
| Brand plan, a person past those included | $240 | $12 | $12 | 0.25 ($15) | | $8.64 | $47.64 | 80% |

"Included filings" is the 2 automated filings a location a month, at an average of 1 a month used, each about $4 of AI,
hosting and review (est.).

Two things the table assumes that are worth watching. An assisted filing is the most exposed price: past about 1.4 hours
of team time it drops below 50%, and past about 3 hours it loses money (est.), so a form that keeps needing more should move to automation or to a team quote. And a new
country is priced to cover the setup work, not to earn the plan's margin; the location price there carries the rest.

## Blended gross margin

Target: **about 82% (est.)** across the book.

Two example customers over a year (est.):

| | A: 10 food stores, 4 on Pro and 6 on Essentials, one year | B: 10 stores on Essentials, 3-year term, importing, enterprise security | A and B together |
| --- | --- | --- | --- |
| Plans | $14,352 + $10,728 | $16,092 | |
| Filings past the plan | 24 automated, 6 assisted | 36 automated, 12 assisted | |
| Modules | 4 entity-states, 3 sales tax states, 2 licensed locations | 6 entity-states, 5 sales tax states, imports, security, 1 new country | |
| Revenue (est.) | $32,306 | $38,466 | $70,772 |
| Cost (est.) | $5,156 | $7,796 | $12,951 |
| Gross margin (est.) | 84% | 80% | 82% |

A book weighted to plans sits above the target; one weighted to assisted filings, new countries and the
module-heavy enterprise accounts sits below it. The levers, in order of effect (est.): fewer team hours an assisted
filing (more portals automated), AI cost a location (saver mode and routing, `docs/AI_COSTS.md`), and ACH instead of
cards on large yearly invoices.
