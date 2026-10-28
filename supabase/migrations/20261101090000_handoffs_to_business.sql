-- A filing Odelia can't send herself goes to the business, not to a Placetta queue. Safe to run twice.
--
-- 1. requeue_stuck_filings: a portal run that failed three times is handed back with ref portal_failed (no team task), so
--    the file function's sweep tries another way the agency takes, then gives the business the packet. A run that
--    stopped after pressing submit is handed back with ref maybe_submitted: the business gets the packet and is told to
--    check with the agency first; Placetta keeps its check_agency task for that incident.
-- 2. filing_reroute_due: true while any filing waits for that sweep (a hand-back with channel team, other than one the
--    Placetta team took over), or while Placetta's check of a form's first self-filings has run past 24 hours (the
--    file function's REVIEW_HOURS), so the per-minute sweep (placetta-send-hold) runs for it.

create or replace function public.requeue_stuck_filings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int := 0; r record;
begin
  for r in
    update public.filings set agent_state = 'handoff', channel = 'team',
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff', 'ref', 'maybe_submitted',
        'en', 'Placetta stopped partway after pressing submit on the agency''s site.',
        'zh', '快哉在机构网站点击提交后中断。'))
    where agent_state = 'running' and channel = 'portal' and updated_at < now() - interval '15 minutes' and submit_clicked_at is not null
    returning id, workspace_id
  loop
    insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
    values ('check_agency', r.id, r.workspace_id, 'Run stopped after submit was pressed; the business was asked to check the agency before sending again.', 'check_agency:' || r.id)
    on conflict (dedupe) do nothing;
    m := m + 1;
  end loop;

  with moved as (
    update public.filings set
      agent_state = case when attempts >= 3 then 'handoff' else 'queued' end,
      channel = case when attempts >= 3 then 'team' else channel end,
      agent_log = agent_log || case when attempts >= 3
        then jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff', 'ref', 'portal_failed',
          'en', 'The agency''s site failed 3 times. Odelia tries another way the agency takes, or gives it to you to send.',
          'zh', '机构网站 3 次未能完成。Odelia 会改用机构接受的其他方式，否则交由您自行提交。'))
        else jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'retry', 'en', 'Trying again', 'zh', '重新尝试')) end
    where agent_state = 'running' and updated_at < now() - interval '15 minutes'
      and submit_clicked_at is null and channel = 'portal'
    returning id
  )
  select count(*) into n from moved;
  return n + m;
end $$;
revoke execute on function public.requeue_stuck_filings() from public, anon, authenticated;
grant execute on function public.requeue_stuck_filings() to service_role;

create or replace function public.filing_reroute_due()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.filings f
    where f.agent_state = 'handoff'
      and f.status not in ('canceled', 'submitted', 'accepted', 'rejected')
      and jsonb_typeof(f.agent_log) = 'array' and jsonb_array_length(f.agent_log) > 0
      and (
        (f.channel = 'team' and coalesce(f.agent_log->-1->>'kind', '') not in ('take_over', 'review_wait', 'review_page'))
        or (f.agent_log->-1->>'kind' in ('review_wait', 'review_page') and f.submit_clicked_at is null
            and (f.agent_log->-1->>'at') is not null and (f.agent_log->-1->>'at')::timestamptz <= now() - interval '24 hours')
      )
  );
$$;
comment on function public.filing_reroute_due() is 'True when a filing waits on Placetta for something the file function''s sweep settles: another way after the agency''s site failed, the business''s packet, or a check of a form''s first filings that ran past a day.';
revoke execute on function public.filing_reroute_due() from public, anon, authenticated;
grant execute on function public.filing_reroute_due() to service_role;
