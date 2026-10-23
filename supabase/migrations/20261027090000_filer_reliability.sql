-- The portal worker's reliability (2026-10-22), from the browser-agent comparison in docs/COMPETITIVE.md:
-- 1. A portal that is down isn't hit again at once. The worker writes provider_ref "retry-after:<time>" (2, 10, then 30
--    minutes, worker/filer/src/heal.ts) and the claim leaves the filing alone until then, as it does a held session.
-- 2. A recorded step found again by its words (a relabelled field) goes to the team as selector drift, so the
--    recording is checked before the portal drifts further.
-- Idempotent: create or replace, and the constraint dropped before it's added.

create or replace function public.claim_agent_filing() returns setof public.filings
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.filings f set agent_state = 'running',
    agent_started_at = coalesce(f.agent_started_at, now()), attempts = f.attempts + 1
  where f.id = (select id from public.filings
    where agent_state = 'queued' and channel = 'portal' and status not in ('canceled','accepted','rejected')
      and not (coalesce(provider_ref, '') like 'held-until:%' and substr(provider_ref, 12)::timestamptz > now())
      and not (coalesce(provider_ref, '') like 'retry-after:%' and substr(provider_ref, 13)::timestamptz > now())
    order by updated_at limit 1 for update skip locked)
  returning f.*;
end $$;
revoke execute on function public.claim_agent_filing() from public, anon, authenticated;
grant execute on function public.claim_agent_filing() to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'grant execute on function public.claim_agent_filing() to placetta_filer';
  end if;
end $$;

alter table public.team_tasks drop constraint if exists team_tasks_kind_check;
alter table public.team_tasks add constraint team_tasks_kind_check
  check (kind in ('handoff', 'check_agency', 'skill_broken', 'destination_stale', 'review', 'quote', 'line_health', 'ai_spend', 'ask_person', 'margin', 'team_time', 'selector_drift'));
