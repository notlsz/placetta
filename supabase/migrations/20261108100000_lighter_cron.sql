-- Lighter cron on a small instance (2026-10-30). The database's CPU ran at a fraction of normal for hours after a day of
-- full production probes: a 9,000-row catalog join that takes milliseconds took 2.5 seconds with every page in memory,
-- so the slowness was CPU, not disk or load. Small Supabase instances run on burstable CPU that refills only while idle,
-- and a job that opens a connection every minute keeps it from refilling. These sweeps tolerate a few minutes' delay:
-- held sends and holds every 3 minutes, the agent watchdog every 6, the filing requeue every 10.
do $$
declare j record;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then return; end if;
  for j in select jobid, jobname from cron.job where jobname in ('placetta-minute', 'placetta-agent-watchdog', 'placetta-requeue-filings') loop
    perform cron.alter_job(j.jobid, schedule := case j.jobname
      when 'placetta-minute' then '*/3 * * * *'
      when 'placetta-agent-watchdog' then '*/6 * * * *'
      else '*/10 * * * *' end);
  end loop;
end $$;
