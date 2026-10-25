# Positioning brief (M7, 2026-10-25)

What Placetta can say about Odelia today, sorted by evidence. Everything here is from the repository on
`cline/placetta-integration`. Nothing is from customer results; there are none on record. Before anything here is
published, the claim needs the evidence named in its own row.

## Who it's for (hypothesis, not validated)

**Initial segment:** Chinese-speaking food and drink operators opening or expanding stores in US metros.

**Job to be done:** find every license and permit a new store needs, prepare each agency's form, and track it to
approval and renewal, in English or Chinese.

**Basis:** the registry, evals and copy are built around this segment (`docs/MARKET_COVERAGE.md`). No interviews,
signed customers or traction are on record. Named brands are prospects only.

## Available now

Built and covered by tests in this repository. "Available" means built and tested, not used by a customer.

| Capability | Evidence |
|---|---|
| A store's plan from Placetta's registry: each license with its agency, order, published fee and time, and the official form | `src/plan/preview.ts`; `test:markets` (41 markets) |
| A plan row claims a requirement only when an official page says so, re-read within 90 days; otherwise it names who to ask | `src/plan/ask.ts`; `test:agent` |
| The agency's own form, filled from what the owner already gave | `src/forms/maps`; `test:forms` |
| Each approval card says who submits it, the person's own step (the agency fee on its site) and the agency's published time | `src/approvalRoute.ts` (M3); `test:agent` |
| The plan card counts what Odelia can submit, what the owner sends, and what she can't confirm yet | `planSplit` (M6) |
| Nothing is filed, paid or sent without the owner's approval; the agency fee is always the owner's to pay | `src/autonomy.ts`, `worker/filer/src/guards.ts` |
| English and Chinese throughout | `src/i18n.ts`; `plain-words` check |
## Switched off, or proven only on test pages

| Capability | State | What would prove it |
|---|---|---|
| Odelia submitting on agency sites: 146 US forms have a route Placetta can send on, 122 of them a portal (`docs/FILING_COVERAGE.md`) | Built. Each form is off until listed in `FILER_AGENCIES`, and the first 10 filings of each wait for a team check | A supervised live filing per portal, with the agency's confirmation kept |
| 10 portal playbooks written from agencies' published guides | Unverified (`verified: null`). Staff watch each first run | The same supervised live run |
| California foreign LLC (`ca-llc-5`) end to end | Fixture only: 10/10 on a local copy in the worker image | A supervised live run on bizfile Online |
| UK food business registration (`gb-food`) | Routed, fixture-tested (4/4), disabled. The card says the owner submits it | Its declaration and on-behalf rules seen on the live pages |
| Billing webhook fixes | Synthetic events only | Stripe test mode (blocked: no test key) |

## Future (not built)

- Filing abroad by Odelia: Mexico, EU and Middle East forms are researched, but none has a route Odelia sends on.
- Tracking agency acknowledgement and license issuance from live filings.
- Any coverage for Tibet.

## Do not claim

- "Files for you" without saying the owner approves each filing and pays the fee.
- Counts of cities, countries or forms "covered" beyond `docs/COVERAGE.md`'s covered, partial and unverified.
- Hours or money saved. `src/value.ts` keeps hours as a labelled estimate.
- Approval rates, opening dates, or speed versus agencies.
- Anything about named competitors' products or prices, until it's sourced and dated.
- Testimonials, customers or partners.

## Advantage over manual filing today

- Every requirement is tied to the agency's own dated page, and the plan says what isn't confirmed.
- The agency's form comes back filled, in Chinese and English.
- Tracking and renewal dates come from the same records.

Time or money saved is a hypothesis until it's measured with real users.

## Three acquisition experiments (proposals; nothing run or spent)

1. **Plan-on-request for 20 operators in two metros, walked through in Chinese.**
   - Metric: how many ask to file their first form.
   - Needs: approval for outreach.
2. **Bilingual guide pages (`site/guides`).**
   - Metric: plans started per 100 visits, over 30 days.
3. **The plan as a free deliverable for three accountants or expediters serving the segment.**
   - Metric: plans created per practice per month.
   - No referral fee is assumed.

## Interview questions

1. Walk me through the last store you opened: which permits, in what order, and who filed each?
2. Which step took longest, and what did you do while waiting?
3. Who do you pay today, for what, and how much?
4. Have you missed a renewal or had an agency notice? What happened?
5. Would you let software submit a form you approved first? What would you need to see?
6. In which language do you want forms explained, and in which do you sign?

## Evidence needed before a public competitive claim

- A dated source for each competitor fact.
- One measured live timeline per claimed workflow (not fixture).
- A consenting customer for any outcome quoted.
