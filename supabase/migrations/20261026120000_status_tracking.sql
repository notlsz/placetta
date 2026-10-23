-- Daily status tracking: every filing with an agency is checked each day (supabase/functions/monitor/status_checks.ts,
-- src/tracking), and each filing has a timeline like a parcel's: every event with its source, time and confidence, and
-- when it was last checked.
--   filing_tracking  one row per filing: when it was last and next checked, the last page or record hash (a check whose
--                    hash didn't change costs nothing), the status the agency shows, when anything last moved, and when
--                    it was last escalated. Kept off public.filings, whose guard stamps updated_at on every update (the
--                    monitor reads updated_at as "the filing changed") and lets customers write columns it doesn't list.
--   filing_checks    every check: where it looked, the hash, what it saw, whether it changed, whether the model was
--                    used and what it cost. status_check_costs() reports the cost per check and per store-month.
--   filing_events    the timeline: status changes (by a trigger on filings, so none is missed), what the agency's own
--                    lookup showed, escalations, appeal deadlines and inspections.
-- Members read their own workspace's rows; only the server writes them; staff set an agency lookup link on a filing.
-- Safe to run twice. Written 2026-10-22, not applied to the live database. Tests: supabase/tests/status_tracking.sql.

create table if not exists public.filing_tracking (
  filing_id uuid primary key references public.filings(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lookup_url text check (lookup_url is null or (lookup_url ~ '^https://[a-z0-9.-]+\.[a-z]{2,}(/|$)' and length(lookup_url) <= 500)),
  last_checked_at timestamptz,
  next_check_at timestamptz,
  unchanged_checks int not null default 0 check (unchanged_checks >= 0),
  check_errors int not null default 0 check (check_errors >= 0),
  last_hash text check (last_hash is null or last_hash ~ '^[0-9a-f]{64}$'),
  agency_status text check (agency_status is null or length(agency_status) <= 120),
  agency_norm text check (agency_norm is null or agency_norm in ('received', 'in_review', 'needs_info', 'approved', 'issued', 'denied', 'withdrawn', 'expired', 'unknown')),
  agency_status_at timestamptz,
  last_movement_at timestamptz,
  escalated_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists filing_tracking_due on public.filing_tracking(next_check_at);
comment on table public.filing_tracking is 'Per filing: the daily status check''s schedule, last hash and what the agency shows. Written by the monitor.';

create table if not exists public.filing_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  checked_at timestamptz not null default now(),
  source text not null check (source in ('open_data', 'agency_page', 'model')),
  url text check (url is null or (url ~ '^https://' and length(url) <= 600)),
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  status_seen text check (status_seen is null or length(status_seen) <= 120),
  changed boolean not null default false,
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model_used boolean not null default false,
  run_id uuid,
  cost_usd numeric(10, 6) not null default 0 check (cost_usd >= 0),
  error text check (error is null or length(error) <= 200)
);
create index if not exists filing_checks_filing on public.filing_checks(filing_id, checked_at desc);
create index if not exists filing_checks_at on public.filing_checks(checked_at);

create table if not exists public.filing_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  filing_id uuid not null references public.filings(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('status', 'agency', 'escalated', 'appeal', 'inspection', 'note')),
  status text check (status is null or length(status) <= 120),
  title jsonb not null check (jsonb_typeof(title) = 'object' and title ? 'en'),
  source text not null check (source in ('team', 'owner', 'placetta', 'open_data', 'agency_page', 'odelia')),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  url text check (url is null or (url ~ '^https://' and length(url) <= 600)),
  dedupe text check (dedupe is null or length(dedupe) <= 200)
);
create unique index if not exists filing_events_once on public.filing_events(filing_id, dedupe) where dedupe is not null;
create index if not exists filing_events_filing on public.filing_events(filing_id, at desc);

alter table public.filing_tracking enable row level security;
alter table public.filing_checks enable row level security;
alter table public.filing_events enable row level security;
revoke all on public.filing_tracking, public.filing_checks, public.filing_events from public, anon, authenticated;
grant select on public.filing_tracking, public.filing_checks, public.filing_events to authenticated;
drop policy if exists "members and team read tracking" on public.filing_tracking;
create policy "members and team read tracking" on public.filing_tracking for select to authenticated using (public.is_member(workspace_id) or public.is_staff());
drop policy if exists "members and team read checks" on public.filing_checks;
create policy "members and team read checks" on public.filing_checks for select to authenticated using (public.is_member(workspace_id) or public.is_staff());
drop policy if exists "members and team read events" on public.filing_events;
create policy "members and team read events" on public.filing_events for select to authenticated using (public.is_member(workspace_id) or public.is_staff());

-- Every status change lands on the timeline with who made it: the team, the owner (canceling, paying), or Placetta (the
-- sending, the portal worker, the monitor). It also counts as movement for the escalation clock.
create or replace function public.filings_timeline() returns trigger
language plpgsql security definer set search_path = '' as $$
declare src text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  src := case when public.is_staff() then 'team' when auth.uid() is not null then 'owner' else 'placetta' end;
  insert into public.filing_events (workspace_id, filing_id, kind, status, title, source, confidence, dedupe)
  values (new.workspace_id, new.id, 'status', new.status,
    case new.status
      when 'requested' then jsonb_build_object('en', 'Approved by you and sent to Placetta', 'zh', '您已批准，交给快哉')
      when 'in_progress' then jsonb_build_object('en', 'Placetta is preparing to submit it', 'zh', '快哉正在准备提交')
      when 'submitted' then jsonb_build_object('en', 'Submitted to the agency', 'zh', '已提交机构')
      when 'needs_info' then jsonb_build_object('en', 'The agency or the team needs something from you', 'zh', '机构或团队需要您补充')
      when 'accepted' then jsonb_build_object('en', 'Approved by the agency', 'zh', '机构已批准')
      when 'rejected' then jsonb_build_object('en', 'Returned or denied by the agency', 'zh', '机构退回或拒绝')
      when 'canceled' then jsonb_build_object('en', 'Canceled', 'zh', '已取消')
      else jsonb_build_object('en', new.status, 'zh', new.status) end,
    src, 1, 'status:' || new.status || ':' || to_char(now(), 'YYYYMMDDHH24MISSMS'))
  on conflict do nothing;
  if tg_op = 'UPDATE' then
    insert into public.filing_tracking (filing_id, workspace_id, last_movement_at, unchanged_checks, next_check_at)
    values (new.id, new.workspace_id, now(), 0, now())
    on conflict (filing_id) do update set last_movement_at = now(), unchanged_checks = 0, next_check_at = now(), updated_at = now();
  end if;
  return null;
end $$;
revoke all on function public.filings_timeline() from public, anon, authenticated;
drop trigger if exists filings_timeline on public.filings;
create trigger filings_timeline after insert or update of status on public.filings for each row execute function public.filings_timeline();

-- The timeline for one filing, newest first, with when it was last checked: one call for the app.
create or replace function public.filing_timeline(p_filing uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ws uuid;
begin
  select workspace_id into ws from public.filings where id = p_filing;
  if ws is null or not (public.is_member(ws) or public.is_staff()) then raise exception 'No such filing.'; end if;
  return jsonb_build_object(
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'status', e.status, 'title', e.title, 'source', e.source,
      'confidence', e.confidence, 'url', e.url) order by e.at desc) from (select * from public.filing_events where filing_id = p_filing order by at desc limit 50) e), '[]'::jsonb),
    'tracking', (select jsonb_build_object('last_checked_at', t.last_checked_at, 'next_check_at', t.next_check_at, 'agency_status', t.agency_status,
      'agency_norm', t.agency_norm, 'last_movement_at', t.last_movement_at, 'escalated_at', t.escalated_at) from public.filing_tracking t where t.filing_id = p_filing));
end $$;
revoke execute on function public.filing_timeline(uuid) from public, anon;
grant execute on function public.filing_timeline(uuid) to authenticated;

-- Staff set the agency's own status page for a filing (an https link), so the monitor watches that page by its hash.
create or replace function public.filing_lookup_set(p_filing uuid, p_url text) returns void
language plpgsql security definer set search_path = '' as $$
declare ws uuid;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  select workspace_id into ws from public.filings where id = p_filing;
  if ws is null then raise exception 'No such filing.'; end if;
  insert into public.filing_tracking (filing_id, workspace_id, lookup_url, next_check_at) values (p_filing, ws, p_url, now())
  on conflict (filing_id) do update set lookup_url = excluded.lookup_url, last_hash = null, next_check_at = now(), updated_at = now();
end $$;
revoke execute on function public.filing_lookup_set(uuid, text) from public, anon;
grant execute on function public.filing_lookup_set(uuid, text) to authenticated;

-- What status checks cost, over the last p_days: checks, how many used the model, the cost per check, and per
-- store-month (cost over the period, per store in the workspaces checked, scaled to 30 days). Staff only.
create or replace function public.status_check_costs(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := greatest(1, least(coalesce(p_days, 30), 365)); r jsonb;
begin
  if not public.is_staff() then raise exception 'Placetta team only.'; end if;
  -- a model check's cost is its run's (agent_runs.cost_usd, recorded when the run ends), plus anything on the check itself
  with c as (select fc.workspace_id, fc.model_used, fc.changed, fc.cost_usd + coalesce(ar.cost_usd, 0) as cost_usd
             from public.filing_checks fc left join public.agent_runs ar on ar.id = fc.run_id
             where fc.checked_at > now() - make_interval(days => d)),
  stores as (select coalesce(sum(greatest(1, coalesce(jsonb_array_length(case when jsonb_typeof(w.state->'stores') = 'array' then w.state->'stores' end), 0))), 0) n
             from public.workspaces w where w.id in (select distinct workspace_id from c))
  select jsonb_build_object('days', d, 'checks', count(*), 'model_checks', count(*) filter (where model_used), 'changed', count(*) filter (where changed),
    'cost_usd', coalesce(round(sum(cost_usd), 4), 0),
    'per_check_usd', case when count(*) > 0 then round(sum(cost_usd) / count(*), 6) else 0 end,
    'per_store_month_usd', case when (select n from stores) > 0 then round(sum(cost_usd) / (select n from stores) * 30 / d, 4) else 0 end)
  into r from c;
  return r;
end $$;
revoke execute on function public.status_check_costs(int) from public, anon;
grant execute on function public.status_check_costs(int) to authenticated;
