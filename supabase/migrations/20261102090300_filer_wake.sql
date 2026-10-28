-- Wake on demand for a portal worker that sleeps (Render's free plan: asleep after 15 minutes without a request, awake
-- about a minute after the next one). worker/filer/src/wake.ts, supabase/functions/file/wake.ts, logic.ts "sleep and wake".
--
-- 1. filer_status gets woken_at (the last wake ping) and wake_since (when the current wake attempt began). A beat after
--    wake_since means the wake worked; none within FILER_WAKE_SECONDS means it didn't, and the file function's sweep
--    sends the queued filings another way.
-- 2. filer_wake_claim: the right to send one ping, at most every 30 seconds across every instance of the file function,
--    and only to a worker that has beaten before and isn't beating now.
-- 3. filer_live also returns wake_since (the app's "asleep, wakes on demand", and the sweep's fallback).
-- 4. filer_wake_due: a queued portal filing waits on a worker that isn't beating; the per-minute sweep (placetta-send-hold)
--    runs for it, so the ping and the fallback don't wait for the monitor's daily run.
--
-- One row, still no customer data: two more times. Staff read it; only the service role calls these. Safe to run twice.

alter table public.filer_status add column if not exists woken_at timestamptz;
alter table public.filer_status add column if not exists wake_since timestamptz;

drop function if exists public.filer_live(interval);
create function public.filer_live(p_within interval default interval '3 minutes')
returns table (live boolean, seen_at timestamptz, info jsonb, wake_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.seen_at > now() - p_within, false), s.seen_at, s.info, s.wake_since
  from (select 1) one left join public.filer_status s on s.id = 1
$$;

/* One wake ping may go now: the worker beat before, isn't beating, and nobody pinged in the last p_every. A new attempt
   starts when the last one was answered (a beat since) or is older than 30 minutes. */
create or replace function public.filer_wake_claim(p_every interval default interval '30 seconds', p_within interval default interval '3 minutes')
returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_every < interval '10 seconds' then p_every := interval '10 seconds'; end if;
  update public.filer_status s set
    woken_at = now(),
    wake_since = case when s.wake_since is null or s.wake_since <= s.seen_at or s.wake_since < now() - interval '30 minutes' then now() else s.wake_since end
  where s.id = 1 and s.seen_at <= now() - p_within and (s.woken_at is null or s.woken_at <= now() - p_every);
  get diagnostics n = row_count;
  return n = 1;
end $$;

/* A queued portal filing the worker would take now (not waiting out a retry or a held browser), and the worker isn't
   beating. */
create or replace function public.filer_wake_due()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.filings f
    where f.channel = 'portal' and f.agent_state = 'queued' and f.submit_clicked_at is null
      and f.status not in ('canceled', 'submitted', 'accepted', 'rejected')
      and not case when coalesce(f.provider_ref, '') ~ '^(retry-after|held-until):\d{4}-\d\d-\d\dT'
                   then substr(f.provider_ref, strpos(f.provider_ref, ':') + 1)::timestamptz > now() else false end
  ) and not coalesce((select s.seen_at > now() - interval '3 minutes' from public.filer_status s where s.id = 1), false);
$$;
comment on function public.filer_wake_due() is 'True while a queued portal filing waits on a portal worker that isn''t beating: the file function''s sweep pings it awake, or sends the filing another way if it doesn''t wake.';

revoke execute on function public.filer_live(interval), public.filer_wake_claim(interval, interval), public.filer_wake_due() from public, anon, authenticated;
grant execute on function public.filer_live(interval), public.filer_wake_claim(interval, interval), public.filer_wake_due() to service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'placetta_filer') then
    execute 'revoke all on function public.filer_live(interval), public.filer_wake_claim(interval, interval), public.filer_wake_due() from placetta_filer';
  end if;
end $$;

-- The per-minute sweep runs while a held send is due, a filing waits for another way, and now while a queued portal
-- filing waits on a sleeping worker.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; a sleeping portal worker is woken when a filing is queued and at the monitor''s daily sweep.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-send-hold';
  perform cron.schedule('placetta-send-hold', '* * * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/file',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (select 1 from public.filings where agent_state = 'held' and send_after <= now())
       or public.filing_reroute_due()
       or public.filer_wake_due();
  $job$);
end $$;
