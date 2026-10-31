-- One scheduled job for everything that runs within the hour (2026-10-31).
--
-- Why: on the free plan the database ran out of CPU and every pg_cron job failed with "job startup timeout". pg_cron
-- opens a new connection for each job it starts, and seven jobs every 3 to 15 minutes were about 56 connections an
-- hour. This keeps the same work, each piece still called only when something is due, from one job every 3 minutes
-- (20 connections an hour). The daily jobs stay as they are: one connection a day each.
--
-- Cadence, from the minute of the hour (the job runs at minutes 0, 3, 6 ... 57):
--   every run    held sends, filing reroutes, the portal worker, voice holds, license charges, agency outbox
--   every 6 min  the agent watchdog (stuck or waiting runs)
--   every 9 min  stuck filings requeued, Odelia's outbox and text reminders, mail replies
--   every 15 min agency decisions to learn from, the AI budget throttle

-- the integrations function checks a JWT at the gateway; its public anon key moves from the job's text into the vault
do $$
declare jwt text := (select substring(command from 'Bearer ([A-Za-z0-9._-]+)') from cron.job where jobname = 'placetta-mail-watch' limit 1);
begin
  if jwt is not null and not exists (select 1 from vault.secrets where name = 'gateway_anon_jwt') then
    perform vault.create_secret(jwt, 'gateway_anon_jwt', 'Public anon key the gateway checks on the integrations function (mail watch).');
  end if;
end $$;

create or replace function public.tick()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  m int := extract(minute from now())::int;
  key text := (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1);
  base text := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/';
  h jsonb := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', key);
  jwt text;
begin
  -- every run: what used to be the one-minute sweep
  perform public.minute_sweep();

  if m % 6 = 0 and (
       exists (select 1 from public.agent_runs where status = 'running' and heartbeat_at < now() - interval '3 minutes')
    or exists (select 1 from public.agent_runs where status = 'queued' and created_at < now() - interval '2 minutes')
    or exists (select 1 from public.agent_runs p where p.status = 'waiting' and p.updated_at < now() - interval '1 minute'
                 and not exists (select 1 from public.agent_runs c where c.parent_run = p.id and c.status in ('running', 'queued')))) then
    perform net.http_post(url := base || 'agent-run', headers := h, body := '{"action":"watchdog"}'::jsonb, timeout_milliseconds := 30000);
  end if;

  if m % 9 = 0 then
    perform public.requeue_stuck_filings();
    if exists (select 1 from public.odelia_outbox where sent_at is null and dropped_at is null)
       or exists (select 1 from public.text_starts where remind_at <= now() and reminded_at is null and claimed_at is null and expires_at > now()) then
      perform net.http_post(url := base || 'odelia-sms', headers := h, body := '{"action":"flush"}'::jsonb, timeout_milliseconds := 60000);
    end if;
    if exists (select 1 from public.mail_threads where closed_at is null) then
      jwt := (select decrypted_secret from vault.decrypted_secrets where name = 'gateway_anon_jwt' limit 1);
      perform net.http_post(url := base || 'integrations', headers := h || jsonb_build_object('Authorization', 'Bearer ' || coalesce(jwt, '')),
        body := '{"action":"mail_watch"}'::jsonb, timeout_milliseconds := 60000);
    end if;
  end if;

  if m % 15 = 0 then
    if exists (select 1 from public.learning_queue where done_at is null) then
      perform net.http_post(url := base || 'agent-run', headers := h, body := '{"action":"learn"}'::jsonb, timeout_milliseconds := 30000);
    end if;
    perform public.ai_throttle_sweep(null);
  end if;
end $$;
revoke execute on function public.tick() from public, anon, authenticated;

-- when each job last ran well, for the outside health check (.github/workflows/heartbeat.yml): staff and the service only
create or replace function public.cron_health()
returns table (jobname text, last_ok timestamptz, failed_30m bigint)
language sql security definer set search_path = '' stable as $$
  select j.jobname,
         (select max(d.end_time) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'succeeded'),
         (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed' and d.start_time > now() - interval '30 minutes')
  from cron.job j;
$$;
revoke execute on function public.cron_health() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then return; end if;
  perform cron.unschedule(j.jobid) from cron.job j
   where j.jobname in ('placetta-minute', 'placetta-agent-watchdog', 'placetta-requeue-filings', 'placetta-odelia-outbox',
                       'placetta-mail-watch', 'placetta-learn', 'placetta-ai-throttle', 'placetta-tick');
  perform cron.schedule('placetta-tick', '*/3 * * * *', 'select public.tick()');
end $$;
