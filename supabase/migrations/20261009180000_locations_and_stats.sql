-- Per-location billing and what Placetta learns from its own filings. Safe to run twice.

-- Stores already charged their one-time opening fee (the billing function adds the fee for any new one).
alter table public.billing add column if not exists charged_store_ids text[] not null default '{}';

-- Real agency times, per official form, across every workspace's filings: how long from submission to the agency's
-- decision, and how often it sent one back. Only forms with 3 or more decided filings are returned, and only these
-- aggregates, so no single customer's filing can be read from it.
create or replace function public.filing_stats() returns table (form text, n int, median_days int, p90_days int, rejected_pct int)
language sql stable security definer set search_path = '' as $$
  select f.payload->>'official' as form,
         count(*)::int as n,
         ceil(percentile_cont(0.5) within group (order by extract(epoch from f.decided_at - f.submitted_at) / 86400))::int as median_days,
         ceil(percentile_cont(0.9) within group (order by extract(epoch from f.decided_at - f.submitted_at) / 86400))::int as p90_days,
         round(100.0 * count(*) filter (where f.status = 'rejected') / count(*))::int as rejected_pct
  from public.filings f
  where f.payload ? 'official' and f.submitted_at is not null and f.decided_at is not null
    and f.status in ('accepted', 'rejected') and f.decided_at >= f.submitted_at
  group by 1
  having count(*) >= 3;
$$;
revoke execute on function public.filing_stats() from public, anon;
grant execute on function public.filing_stats() to authenticated;
