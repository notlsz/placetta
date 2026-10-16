# Migration drift: supabase/migrations vs the live project

Checked 2026-10-16 against project `esquxzcfsylffuijvzec` with the Supabase MCP (read only: `list_migrations` and
`select`s on `supabase_migrations.schema_migrations`, the catalog and `storage.buckets`). Nothing was applied.

## What differs

The files and the live history agree through `20261009190000_tighten_functions`. After that, most migrations were
applied from the dashboard or the MCP, which records them under the time they ran, not the file's version. The live
schema matches the files' end state (checked by hashing each recorded statement against its file, and for the rest: every constraint the later files change, `agent_runs` and
`routine_runs` columns, `chat_events`, the phone tables, `mail_threads`, the `filings_complete` trigger, the
`audit_log` indexes). Only the version numbers in the history differ, plus the items below.

| Local file | Live history version(s) | Note |
|---|---|---|
| 20261012150000_page_stats | 20261012184808 | same SQL |
| 20261012190000_page_stats_help | 20261012185623 | same SQL |
| 20261012200000_account_deletion | 20261012214324 | same SQL |
| 20261012220000_billing_credits_team_tasks | 20261012214327 | same SQL |
| 20261012230000_headquarters | 20261012214402 | same SQL |
| 20261013000000_odelia_phone | 20261013012351 | recorded SQL differs from the file; end state checked and matches |
| 20261013010000_audit_upsert_and_requeue | 20261013012356 **and** 20261013014514 | recorded twice (the first ran the file fetched over pg_net) |
| 20261013020000_filings_complete | 20261013012358 | recorded SQL differs from the file; end state checked and matches |
| 20261013030000_billing_checkout_stores | 20261013013420 **and** 20261013013801 | recorded twice, identical SQL |
| 20261013040000_phone_consent_log | 20261013030436 | same SQL |
| 20261013050000_ai_budget | 20261013024739 | recorded SQL differs from the file; superseded by pricing_tiers, which matches |
| 20261013060000_ai_no_trial | 20261013031603 | **duplicate local version** (shares 20261013060000 with terms_acceptance); recorded SQL differs, superseded by pricing_tiers |
| 20261013060000_terms_acceptance | 20261013034549 | **duplicate local version** |
| 20261013070000_pricing_tiers | 20261013034541 | same SQL; ran before terms_acceptance live (they're independent) |
| 20261014010000_filing_stop | 20261014043631 | same SQL |
| 20261014030000_mail_tracking | 20261014074233 | recorded SQL differs from the file; the `updates_kind_check` change also ran on its own... |
| (no file) | 20261014075247 updates_kind_agent_and_mail | ...here; spend widened the same check later, and the live check matches spend |
| 20261014050000_spend | 20261014204516 | same SQL |
| 20261016030000_team_chats | 20261016030000 | version matches; history holds a description, not the SQL |
| 20261016050000_odelia_work | 20261016050000 | version matches; history holds a description, not the SQL |
| 20261016060000_odelia_imessage | 20261016054018 | same SQL |
| (no file) | 20261016055752 autopilot | **live only**: `public.autopilot` table, its policies and `autopilot_stamp()` |
| 20261016070000_phone_text_in | 20261016062306 | same SQL |
| 20261016080000_chat_bots | 20261016080000 | version matches; history holds a description, not the SQL |
| 20261016090000_odelia_whatsapp | 20261016063918 | same SQL |
| 20261016100000_odelia_email | 20261016070026 | same SQL |
| 20261016110000_network_learning | (not applied) | pending: `odelia_lessons`, `learning_queue` etc. don't exist live |
| 20261016114500_security_hardening | (not applied) | pending |

Schema that exists live with no migration file:

* `public.autopilot` and `public.autopilot_stamp()` (20261016055752). Left alone: dropping it needs your approval.
  `autopilot.set_by` references `auth.users` with no `on delete set null`, so it blocks the hard delete in account
  deletion (the team function falls back to a soft delete) for anyone who ever set autopilot.
* The `official-forms` storage bucket (PDF only, 15 MB), used by `supabase/functions/forms`. No migration creates it,
  so a fresh database (CI, `supabase db reset`) doesn't have it.

The duplicate local version 20261013060000 breaks `supabase db push` on a database that has neither file
(schema_migrations' primary key is the version). Files are not renamed here; the repair below marks the version applied,
so push skips both files on the live project. For fresh databases the CLI still applies both in name order.

## Repair (run from the repo root, linked to the project)

Review first with `supabase migration list`. These only edit `supabase_migrations.schema_migrations`; no schema changes.

```sh
# 1. Forget the history rows recorded under run-time versions (and the two double entries and the stray kind fix).
supabase migration repair --status reverted \
  20261012184808 20261012185623 20261012214324 20261012214327 20261012214402 \
  20261013012351 20261013012356 20261013012358 20261013013420 20261013013801 20261013014514 \
  20261013024739 20261013030436 20261013031603 20261013034541 20261013034549 \
  20261014043631 20261014074233 20261014075247 20261014204516 \
  20261016054018 20261016062306 20261016063918 20261016070026

# 2. Record the local files that are already live under their own versions.
supabase migration repair --status applied \
  20261012150000 20261012190000 20261012200000 20261012220000 20261012230000 \
  20261013000000 20261013010000 20261013020000 20261013030000 20261013040000 20261013050000 \
  20261013060000 20261013070000 \
  20261014010000 20261014030000 20261014050000 \
  20261016060000 20261016070000 20261016090000 20261016100000
```

`20261016055752 autopilot` stays recorded as applied. Before the next `supabase db push`, pick one:

* keep autopilot: save its SQL as `supabase/migrations/20261016055752_autopilot.sql` (from
  `select array_to_string(statements, E';\n') from supabase_migrations.schema_migrations where version = '20261016055752'`),
  and fix `set_by` to `on delete set null` in a new migration; or
* drop autopilot (needs your approval): add a migration that drops it, then
  `supabase migration repair --status reverted 20261016055752`.

Until one of those is done, `db push` stops with "Remote migration versions not found in local migrations directory".

After the repair, `supabase migration list` should show every local file applied on both sides except
`20261016110000_network_learning` and `20261016114500_security_hardening`, which `supabase db push` then applies.
