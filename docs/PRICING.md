# Pricing

The simple model, approved by the founder on 2026-10-22 and updated by him the same day: one subscription per store,
each new license priced on its own. **Outcome pricing, the founder's decision of 2026-10-28** (after Sierra and Decagon,
who charge per resolution), as he corrected it the same day: a new license is $149, a complex one $999, each charged on
the agency's decision, never when the owner approves the filing (section "Outcome pricing" below). Every workspace that wasn't already a customer is on it. Customers from before keep
their plans (grandfathered, at the end of this page).

**Every cost and margin figure on this page is an estimate (est.).** The prices are the founder's. The code is the
source of truth: `src/pricing.ts` (`SIMPLE`, `COMPLEX_LIST`, `SIMPLE_PRICE_ENV`), `supabase/functions/billing`
(`license_quote`, `license_pay`, `plan_checkout`), migration `20261023120000_simple_pricing.sql`. The research behind
each number is in `docs/PRICING-RESEARCH.md`; how the team quotes it is in `docs/SALES-PLAYBOOK.md`.

## The list

| Item | Price | When it's charged |
| --- | --- | --- |
| Store plan | $149 a store a month, billed yearly ($1,788 a store) | At checkout, for every store in the workspace, after the owner agrees to the renewal terms next to the button. Renews yearly at the same price; auto-renew off in Settings, Billing |
| Store plan, monthly | $179 a store a month, month to month, cancel anytime (founder, 2026-10-23) | The same plan and inclusions. Charged monthly for every store, after the owner agrees to the renewal terms next to the button. Renews monthly at the same price; cancel anytime in Settings, Billing. Yearly saves $360 a store a year. No yearly renewal notice (the subscription is named `store_monthly`) |
| What the store plan covers | Tracking every license and renewal date, renewal monitoring, rule-change alerts, the document vault, Odelia's chat, and every renewal Odelia files on her own | Included |
| A new license, permit or registration | $149 (`SIMPLE.licenseOnApprovalUsd`), filed and tracked to a decision | On the agency's decision: when it's approved, or rejected for a reason that isn't Placetta's fault. Nothing if it's rejected because of Placetta's fault. The owner's approval only saves the card (outcome pricing, 2026-10-28; before it, $299 when the owner approved) |
| A complex license | $999 (`SIMPLE.complexOnApprovalUsd`) | The same way. Only for the fixed list: liquor licenses, building plan review, import permits (`COMPLEX_LIST`) |
| A renewal the plan doesn't include | $99 | After a one-tap approval: on the saved card when there is one, else Stripe Checkout. "Doesn't include" means the renewal needs Placetta's team (a wet signature, mail only, or no route Odelia can use), or the store has no plan |
| 10 or more stores on the store plan | Every new license included too | Nothing extra: the plan price only |
| Never charged | Certificates staff earn themselves (food handler cards, food manager certificates) and inspections inside a permit | Tracked free (`NOT_CHARGED`) |
| Plan preview | Free | Never |
| Government, agency and notary fees | At cost, never marked up | Paid by the business to the agency, or passed through at cost |

What changed from the founder's first numbers, and why: the update made the $149 store plan the main subscription for
every store (it had been the 10+ chain plan only), so tracking moved from free into the plan and renewals Odelia files
on her own are included in it. The plan preview stays the free entry point. The $299, $999 and $99 prices and
government fees at cost are the founder's numbers, unchanged: each sits inside the range of the real alternatives
(`docs/PRICING-RESEARCH.md`).

## Outcome pricing (2026-10-28)

The founder's decision of 2026-10-28, copying Sierra and Decagon (pay per resolution), corrected by him the same day:

| What the agency does | What the owner pays |
| --- | --- |
| Approves it (with its confirmation, the license number, the license PDF or an approval upload) | $149, or $999 for a complex license |
| Rejects it because of Placetta's fault: a wrong value in the filing, the wrong form, or a missed document Placetta should have flagged | Nothing, and anything paid for that filing is refunded |
| Rejects it for a reason that isn't Placetta's fault: zoning, the business ineligible by law, wrong or incomplete information from the owner, or the owner withdrew it | $149, or $999, charged when the team marks the reason |

How the money moves (`supabase/functions/_shared/outcome.ts`, migration `20261105091200_outcome_pricing.sql`):

1. The owner approves the filing at the price its card shows ("$149 when the license is approved. If it's turned down
   because of a mistake on our side, you pay nothing."). Stripe saves the card: the customer's saved card, or Stripe
   Checkout in setup mode (a SetupIntent). Placetta never sees or types a card number. Nothing is charged; the charge is
   recorded as `authorized` and the filing goes in on it.
2. The agency decides. Accepted with proof, or rejected with a reason that isn't Placetta's fault: `due`. Rejected
   because of Placetta's fault: `waived`. Until the team marks a reason, nothing moves and the team has a task.
3. The billing function's `outcome_sweep` (pg_cron every minute while something is due) charges a due charge off session:
   an invoice made with the charge id in its idempotency key and kept on the charge before anything is added to it,
   then finalized and paid with the same key. A retry reads the saved invoice back, so a charge is never made twice,
   and an approval and a rejection of the same filing share the one charge, so they can never both charge.
4. Authentication required (SCA): the owner gets Stripe's hosted pay link in Updates. A refused card: the existing
   dunning (`billing_payment_apply` and the owner's notice) and Stripe's own retries; `invoice.paid` settles it.
5. The team picks the reason from the fixed list, with a note, in the Team view. The owner sees it on the filing and can
   dispute it with one tap (`filing_dispute_rejection`), which opens a team task. Changing the reason to Placetta's
   fault refunds the charge (`refund_due`, then the sweep refunds it, or voids an invoice not paid yet).
6. Agency fees are passed through as before and never refunded by Placetta.

Grandfathering is unchanged: legacy workspaces keep their plans. A simple-model charge paid up front at $299 before
2026-10-28 keeps its price; a rejection of it because of Placetta's fault is refunded the same way.

## Rules every charge follows

- Shown before approval, in English and Chinese, in the filing's own approval card (`src/FilingCharge.tsx`) or the plans
  sheet (`src/cloud/Plans.tsx`), with the agency's own fee named as passed through at cost.
- Never charged without the owner's approval of that exact price and kind. The billing function works the quote out
  again on approval (`simpleApproval`) and refuses it if it differs by a cent.
- Charged only from its own Stripe price, named by an env var below, and only when Stripe's amount, currency and
  interval match exactly (`simplePriceOk`). The code never creates these prices. When the env var is missing or the
  price differs, the card and the sheet say the team sends a quote, a team task is opened, and nothing is charged.
- The database enforces it too: on the simple model a filing goes in only when its own charge is paid, authorized with a
  saved card (outcome pricing), or recorded as included at $0, or the workspace has 10 or more stores on the plan (`can_file_app`, policy "members request filings
  they can file").
- No discounts and no promotion codes on the simple model.
- The open-by-date guarantee is not offered on the simple model (it refunded an opening fee, which no longer exists).
  No lapse guarantee is advertised. Customers who bought the guarantee keep it under their terms.

## Stripe prices the founder must create

All in USD, standard (per unit) pricing. Give each its lookup key (`placetta_store_plan_year`,
`placetta_store_plan_month`, `placetta_license_on_approval`, `placetta_license_complex`, `placetta_renewal`, and
`placetta_odelia_pack` for the $49 pack) and the code finds it; an env var below, when set, wins. Names are what the
invoice shows.

| Env var | Product name | Amount | Interval |
| --- | --- | --- | --- |
| `STRIPE_PRICE_STORE_PLAN` | Placetta store plan, a store | $1,788.00 | yearly (interval count 1) |
| `STRIPE_PRICE_STORE_MONTHLY` | Placetta store plan, monthly, a store | $179.00 | monthly (interval count 1) |
| `STRIPE_PRICE_LICENSE_ON_APPROVAL` | Placetta license, charged on the agency's decision | $149.00 | one time |
| `STRIPE_PRICE_LICENSE_COMPLEX` | Placetta complex license, filed (the existing price, unchanged) | $999.00 | one time |

The $149 price is new: lookup key `placetta_license_on_approval`. The $299 price from before (`placetta_license`,
`STRIPE_PRICE_LICENSE`) is never charged again; archive it in Stripe once no Checkout for it is open. The complex
license reuses its existing $999 price. `node scripts/stripe-outcome-prices.mjs` prints exactly what to create; with
`--create` and a test-mode key (`sk_test_`) it creates them in test mode and refuses a live key.
| `STRIPE_PRICE_RENEWAL` | Placetta renewal | $99.00 | one time |

Until each exists, its item falls back to a team quote. The webhook needs no new event: license payments come in on
`checkout.session.completed` (metadata `kind=license`) and the store plan on the subscription events (metadata
`plan=store`, or `plan=store_monthly` for the monthly plan). The code never creates these prices: the billing function
checks each one against src/pricing.ts (amount, USD, interval) and quotes through the team when it's missing or different.

## Grandfathering

- Migration `20261023120000_simple_pricing` sets `billing.price_model` once: `legacy` for every workspace that already
  had a Stripe customer, a subscription, an entry plan or a comp; `simple` for every other workspace. New workspaces
  default to `simple`. A row already marked is never changed by a rerun.
- `legacy` workspaces keep their plan, its price and every old action (entry plan, Essentials and Pro, openings, the
  guarantee, packs, modules, filings past the allowance, terms, the brand plan). Their app shows the old plans sheet.
- `simple` workspaces see only the new model; the billing function refuses the old checkouts for them.
- Moving a legacy customer to the new model is a manual decision (set `price_model` to `simple` with the customer's
  written agreement); nothing does it automatically.
- Before the migration runs, the app and the billing function treat every workspace as `legacy`, so nothing changes
  until the database knows who is grandfathered.

## Margin math (all estimates)

Inputs, as for the legacy plans below: team time $60 an hour loaded; Stripe 3.6% (card plus Billing); AI from
`docs/AI_COSTS.md` (a filing job about $0.30 to $1; a store's typical month $3 to $5, capped at $25 by the allowance).

| Item | Price (est.) | AI (est.) | Hosting (est.) | Team hours (est.) | Other (est.) | Stripe (est.) | Cost (est.) | Gross margin (est.) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Store plan, a store a year | $1,788 | $60 | $24 | 1.5 ($90) support and renewal review | $18, about 6 renewals Odelia files on her own at $3 each | $64.37 | $256 | 86% |
| Store plan monthly, a store for 12 months | $2,148 | $60 | $24 | 1.5 ($90) support and renewal review | $18, about 6 renewals Odelia files on her own at $3 each | $77.33 | $269 | 87% |
| New license, each (outcome pricing) | $149 | $1 | $0.50 | the founder's estimate assumes Odelia files it on her own; team time is in the note below | $3 printing and postage | $5.36 | about $11 | about $138 profit, 93% |
| Complex license, each | $999 | $5 | $1 | 5 ($300), plan check corrections, hearings, follow-ups | | $35.96 | $342 | 66% |
| Renewal outside the plan, each | $99 | $0.50 | $0.50 | 0.5 ($30) | $3 | $3.56 | $38 | 62% |
| Plan preview | $0 | under $0.10 (the registry, no model) | | | up to $5 a month of free Odelia allowance | | up to $5 a month | an acquisition cost |

Example accounts, a year (est.):

| | Revenue (est.) | Cost (est.) | Gross margin (est.) |
| --- | --- | --- | --- |
| One restaurant opening (9 licenses, 2 complex) plus its first year on the plan | $5,127 | $1,039 | 80% |
| The same restaurant, second year, one renewal that needs the team | $1,887 | $294 | 84% |
| A 12-store chain on the plan opening 3 stores (every new license included) | $21,456 | $6,339 | 70% |
| A 4-store operator on the plan opening 1 store | $10,491 | $1,807 | 83% |

Outcome pricing, per new license (all estimates): **cost about $11, so about $138 profit on $149.** The $11 is AI
($1), hosting ($0.50), printing and postage ($3), Stripe at 3.6% ($5.36) and a little more for the saved card's setup.
What moves it:

- Rejected because of Placetta's fault: no revenue, and the refund doesn't return Stripe's fee (about $5.36), so the
  filing costs about $11 plus its team time, all absorbed. That is the incentive to file it right.
- Rejected for a reason that isn't Placetta's fault: charged like an approval, so the team time spent on it is paid for
  by the $149, the same as an approved license. A dispute the team upholds turns it into the case above.
- Team time is the exposure: at $60 an hour, every 30 minutes on a $149 license takes $30 off the $138. Past about
  2.3 hours of team time a license loses money (est.). The margin watch reads `filings.team_minutes` against each tier's
  budget (`margin_rules`); keep the $149 license for filings Odelia sends on her own and quote the rest through the team
  when a form keeps needing hands.
- SCA and refused cards delay revenue, they don't lose it: Stripe retries and the owner's pay link settles it.

**Blended target: about 80% (est.).** A book of single stores and small operators sits above it; complex licenses and
chains that open many stores at once sit below. Watch two things: a complex license that keeps needing more than about
8 team hours (it drops below 50%), and a 10+ chain that opens more than a quarter of its stores in a year (below 70%).
The levers are the same as before: more agency routes Odelia files on her own, AI cost a store, and ACH on yearly
invoices.

## Legacy plans: customers before October 2026

The founder approved the owner prices below on 2026-10-22. This page has the whole list with its units, the Stripe
prices to create for it, and the margin each one is expected to leave.

**Every figure on this page is an estimate (est.).** That includes the prices: the code is the source of truth
(`src/pricing.ts`), and this page is a copy written for reading. Each cost figure is a budget, not a measurement. The
staff margin view (`ai_margin_company`, see `docs/AI_COSTS.md`) shows the real numbers once customers are on these
prices.

Code: `src/pricing.ts` (the list), `src/modules.ts` (units and quotes), `src/overage.ts` (filings past the plan),
`src/hqPlan.ts` (the brand plan), `src/contract.ts` (terms), `supabase/functions/billing` (quotes and charges),
migration `20261022163712_owner_prices.sql`.

### Rules every owner price follows

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

### Published prices (on the landing page, unchanged)

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

### Owner prices (approved 2026-10-22)

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

#### Not confirmed yet (still marked FOUNDER TO CONFIRM in `src/pricing.ts`)

| Item | Value (est.) |
| --- | --- |
| A new workspace's monthly cap on filings past the plan | $0 |
| Highest monthly cap an owner can set in the app | $5,000 |
| Hours a filing, a renewal and an entity report would have taken (value report only) | 3, 1, 1 |

### Stripe prices the founder must create

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

### Margin assumptions

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

### Blended gross margin

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
