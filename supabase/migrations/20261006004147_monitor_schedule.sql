do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; the monitor is not scheduled.';
    return;
  end if;
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'placetta-monitor';
  perform cron.schedule('placetta-monitor', '15 12 * * *', $job$
    select net.http_post(
      url := 'https://esquxzcfsylffuijvzec.supabase.co/functions/v1/monitor',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-monitor-key', (select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$);
end $$;
