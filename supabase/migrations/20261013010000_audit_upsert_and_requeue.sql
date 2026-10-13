-- Two fixes found by the end-to-end test (scripts/e2e). Safe to run twice.
--
-- 1. The agent's audit entries were never saved. agent-run and the app write them with an upsert on
--    (workspace_id, client_id), but the only unique index was partial (where client_id is not null), and Postgres
--    can't use a partial index for ON CONFLICT unless the statement repeats its predicate, which PostgREST can't
--    send: every upsert failed with 42P10. A plain unique index does the same job (rows without a client_id are
--    null there, and nulls never collide).
create unique index if not exists audit_log_workspace_client on public.audit_log(workspace_id, client_id);
drop index if exists public.audit_log_client;

-- 2. Every filing handed to the team (by the file function, with its own task) got a second, wrong task at the next
--    sweep, "Self-filing handed over after 3 tries", because the sweep added one for every filing in the team's hands.
--    Now it adds one only for the portal runs it hands over itself, after their third try.
create or replace function public.requeue_stuck_filings() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int := 0; r record;
begin
  for r in
    update public.filings set agent_state = 'handoff', channel = 'team',
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'handoff',
        'en', 'Placetta lost track of the run after pressing submit. The team is checking with the agency.',
        'zh', '快哉在点击提交后中断，团队正在向机构核实。'))
    where agent_state = 'running' and channel = 'portal' and updated_at < now() - interval '15 minutes' and submit_clicked_at is not null
    returning id, workspace_id
  loop
    insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
    values ('check_agency', r.id, r.workspace_id, 'Run stopped after submit was pressed. Check the agency for the submission before doing anything else.', 'check_agency:' || r.id)
    on conflict (dedupe) do nothing;
    m := m + 1;
  end loop;

  with moved as (
    update public.filings set
      agent_state = case when attempts >= 3 then 'handoff' else 'queued' end,
      channel = case when attempts >= 3 then 'team' else channel end,
      agent_log = agent_log || jsonb_build_array(jsonb_build_object('at', now(), 'kind', 'retry',
        'en', case when attempts >= 3 then 'Handed to the Placetta team after 3 tries' else 'Trying again' end,
        'zh', case when attempts >= 3 then '已尝试 3 次，交由快哉团队处理' else '重新尝试' end))
    where agent_state = 'running' and updated_at < now() - interval '15 minutes'
      and submit_clicked_at is null and channel = 'portal'
    returning id, workspace_id, agent_state
  ), handed as (
    insert into public.team_tasks(kind, filing_id, workspace_id, title, dedupe)
    select 'handoff', id, workspace_id, 'Self-filing handed over after 3 tries. The run log is on the filing.', 'handoff:' || id
      from moved where agent_state = 'handoff'
    on conflict (dedupe) do nothing
  )
  select count(*) into n from moved;
  return n + m;
end $$;
revoke execute on function public.requeue_stuck_filings() from public, anon, authenticated;
grant execute on function public.requeue_stuck_filings() to service_role;
