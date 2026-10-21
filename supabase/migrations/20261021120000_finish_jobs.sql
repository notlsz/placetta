-- Finishing jobs on its own. Safe to run twice.
--
-- 1. Another way when the agency's site fails. A portal run that couldn't finish on the agency's site, before anything
--    was submitted, hands the filing back with a reason in its log (worker/filer: limit, left_portal, no_portal,
--    portal_failed). The file function's sweep then sends it another way the agency takes (email, fax or certified mail,
--    after the same undo window and checks), or prepares the owner's packet, before the team files it by hand
--    (supabase/functions/file reroute). filing_reroute_due() says whether any filing waits for that, so the per-minute
--    sweep (placetta-send-hold) also runs for it instead of only at the monitor's daily run.
-- 2. Nothing else changes in the schema: the proof a job waits on (confirmation number, receipt, the agency's decision)
--    is read from the filings table as it is (src/finish.ts).

create or replace function public.filing_reroute_due()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.filings f
    where f.channel = 'team' and f.agent_state = 'handoff' and f.submit_clicked_at is null
      and f.status not in ('canceled', 'submitted', 'accepted', 'rejected')
      and jsonb_typeof(f.agent_log) = 'array' and jsonb_array_length(f.agent_log) > 0
      and f.agent_log->-1->>'kind' = 'handoff'
      and f.agent_log->-1->>'ref' in ('limit', 'left_portal', 'no_portal', 'portal_failed')
  );
$$;
comment on function public.filing_reroute_due() is 'True when a filing''s portal run failed before submitting and nobody has acted on it since: the file function''s sweep tries another way.';
revoke execute on function public.filing_reroute_due() from public, anon, authenticated;
grant execute on function public.filing_reroute_due() to service_role;

-- The per-minute sweep runs while a held send is due, and now also while a failed portal run waits for another way.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron is not available; filings whose agency site failed are rerouted at the monitor''s daily sweep.';
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
       or public.filing_reroute_due();
  $job$);
end $$;
