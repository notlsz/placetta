-- One per-minute job instead of four, and a cron history that doesn't grow forever (2026-10-30).
--
-- Why: the database ran out of headroom (owners' writes to filings hit statement timeouts; pg_cron logged "job startup
-- timeout" every minute). pg_cron opens a fresh database connection for every job it starts, so four jobs every minute
-- were four new connections a minute on a small instance, each logged as a row in cron.job_run_details that nothing
-- ever deleted. This keeps the same four sweeps, each still called only while it has something due, from one job and
-- one connection; and a daily job keeps 3 days of cron history.

create or replace function public.minute_sweep()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1);
  base text := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/';
  h jsonb := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', key);
begin
  -- the file function: a held send whose time has come, a filing to reroute, or a portal worker to wake
  if exists (select 1 from public.filings where agent_state = 'held' and send_after <= now())
     or public.filing_reroute_due() or public.filer_wake_due() then
    perform net.http_post(url := base || 'file', headers := h, body := '{}'::jsonb, timeout_milliseconds := 60000);
  end if;
  -- Odelia's agency calls past their hold or talk limit, or due a retry
  if public.voice_hold_due() then
    perform net.http_post(url := base || 'odelia-voice', headers := h, body := '{"action": "hold_sweep"}'::jsonb, timeout_milliseconds := 60000);
  end if;
  -- license charges and refunds due
  if public.license_outcome_due() then
    perform net.http_post(url := base || 'billing', headers := h, body := '{"action": "outcome_sweep"}'::jsonb, timeout_milliseconds := 60000);
  end if;
  -- agency messages and chases whose hold has passed
  if exists (select 1 from public.agency_outbox where status = 'held' and send_after <= now())
     or exists (select 1 from public.odelia_chases where hold_state = 'held' and send_after <= now()) then
    perform net.http_post(url := base || 'monitor', headers := h, body := '{"action": "outbox"}'::jsonb, timeout_milliseconds := 60000);
  end if;
end $$;
revoke execute on function public.minute_sweep() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available';
    return;
  end if;
  perform cron.unschedule(j.jobid) from cron.job j
   where j.jobname in ('placetta-send-hold', 'placetta-voice-hold', 'placetta-license-outcome', 'placetta-agency-outbox', 'placetta-minute', 'placetta-cron-history');
  perform cron.schedule('placetta-minute', '* * * * *', 'select public.minute_sweep()');
  perform cron.schedule('placetta-cron-history', '37 4 * * *', $job$ delete from cron.job_run_details where end_time < now() - interval '3 days' $job$);
end $$;
