# Placetta Partner API

For approved Placetta partners (franchisors, master franchisees, commercial real-estate brokers, landlords, investors
and accountants who bring brands to the US). Two things:

1. **The referrals API**: read-only JSON with the status of the businesses you referred that agreed to share it.
2. **The plan box**: a small script for your own site or portal that shows a visitor the permits their opening needs
   and sends them to Placetta with your code.

Base address: `https://esquxzcfsylffuijvzec.supabase.co/functions/v1/partner-api`

The code is in `supabase/functions/partner-api/` (rules in `logic.ts`, tested in `logic_test.ts`) and the database
side in `supabase/migrations/20261017150100_partners.sql`.

## What a referred business shares

A business counts as yours when it first arrives through your link (`https://placetta.com/?ref=YOURCODE`, or the plan
box) and creates its workspace within 90 days. The first partner link it used is the one that counts.

When it signs up, it's asked once whether you may see its progress. It's off unless the owner ticks it, and the owner
can turn it off (or on) any time in Settings, Team. While it's on, you see four things and nothing else:

| Field | What it is |
|---|---|
| `business_name` | The business's name in Placetta |
| `stage` | `opening` while any store is still opening, `open` once every store is open |
| `permits_done`, `permits_total` | Applications approved by the agency, out of all applications in its plan |
| `opening_date` | The earliest projected (or planned) opening of a store still opening; for a business already open, its first opening |

You never see documents, form answers, logins, chats, staff, billing or anything else. Businesses that don't share
aren't in the API at all; your dashboard counts them without naming them. The rule is enforced by the database
(row-level security on a copy that is emptied the moment sharing is turned off), not only by this API.

## Keys

Make a key in Placetta, Partner, Partner API. A key looks like `plk_0a1b2c3d_` followed by 48 characters. It's shown
once: Placetta keeps only its SHA-256 fingerprint, so a lost key can't be shown again. Revoke it and make a new one.
Up to 5 live keys. A key stops working when it's revoked or when your partner account is paused.

Keep keys on your server. Never put one in a web page or an app people can download.

## GET /v1/referrals

```
curl https://esquxzcfsylffuijvzec.supabase.co/functions/v1/partner-api/v1/referrals \
  -H "Authorization: Bearer plk_0a1b2c3d_…"
```

```json
{
  "data": [
    {
      "referral_id": "6c2f…",
      "business_name": "Lucky Leaf Tea",
      "stage": "opening",
      "permits_done": 5,
      "permits_total": 9,
      "opening_date": "2027-01-15",
      "referred_at": "2026-08-11T10:00:00Z",
      "updated_at": "2026-10-16T22:10:00Z"
    }
  ],
  "count": 1
}
```

`referral_id` stays the same for a business; use it to match rows in your system. `updated_at` is when the business's
progress last changed.

## Errors and limits

| Status | `error.code` | When |
|---|---|---|
| 401 | `unauthorized` | No key, a malformed key, a revoked key, or a paused account |
| 404 | `not_found` | Any other path |
| 405 | `method_not_allowed` | Anything but GET (and OPTIONS) |
| 429 | `rate_limited` | More than 60 requests a minute for one key, or 120 a minute from one address. Wait the seconds in `Retry-After` |

Errors look like `{ "error": { "code": "unauthorized", "message": "…" } }`.

## The plan box

Put this where the box should appear on your site:

```html
<div data-placetta-plan></div>
<script src="https://placetta.com/embed.js" data-ref="YOURCODE" async></script>
```

Optional: `data-lang="zh"` or `data-lang="en"` on the script (otherwise the visitor's browser language decides; the
box has its own English and Chinese switch). The box sits in its own shadow root, so your styles don't change it and
its styles don't touch your page.

A visitor picks what they're opening and types a city and state. The box shows every permit Placetta's registry lists
for that business in that place, in filing order, with each agency and its published fee. Nothing about the visitor is
stored. **Start with Placetta** opens sign-up with your code and what they typed.

The box calls `GET /v1/plan?type=Milk%20tea&city=Flushing,%20NY&ref=YOURCODE&lang=en`, which needs no key, answers
any origin, and allows 20 requests a minute and 300 a day from one address. You can call it yourself:

```json
{
  "what": "Milk tea", "where": "Flushing, NY", "count": 8,
  "known_fees_usd": 655, "fees_set_by_agency": 1,
  "permits": [{ "name": { "en": "…", "zh": "…" }, "agency": { "en": "…", "zh": "…" }, "level": "city", "fee_usd": 280, "takes": { "en": "…", "zh": "…" }, "source": "https://…" }],
  "partner": { "org_name": "Bay Bridge Realty" },
  "start_url": "https://placetta.com/app/?ref=YOURCODE&line=Milk+tea+in+Flushing%2C+NY",
  "note": { "en": "From Placetta's registry of official forms. Odelia confirms each one with the agency before anything is filed.", "zh": "…" }
}
```

The plan comes from Placetta's registry of official forms, with no AI involved. It's a starting point: Odelia confirms
each item with the agency before anything is filed.

## Revenue share

Your dashboard shows your share per month, worked out every day from each referred business's plan (the same figure
Placetta's own margin report uses), for the months your agreement covers. Months close at the end of the month and are
paid by bank transfer; the dashboard lists each payout. The percentage and the number of months are agreed with you in
writing and set by the Placetta team.

## For the Placetta team

- Approve partners, set each share, pause a code and record payouts in Filing queue, Partners.
- Deploy: the migration `20261017150100_partners.sql`, then `supabase functions deploy partner-api` (its
  `verify_jwt = false` is in `supabase/config.toml`; it checks its own keys). `npm run build:agent` rebuilds its
  `plan.js` from `src/plan/preview.ts`.
- Tests: `deno test -A supabase/functions/partner-api/logic_test.ts` and `supabase/tests/partners.sql`
  (`scripts/test-db.sh`).
