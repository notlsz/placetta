-- Store bots under a chief of staff: a run's store runs, their statuses, what members see, and stopping them together.
-- Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); z uuid := gen_random_uuid(); w uuid := gen_random_uuid(); p uuid; c1 uuid; c2 uuid; other uuid; res jsonb := '{}'::jsonb; ok boolean; j jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'cos@t.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'stranger@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (z, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Three stores', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');

  insert into public.agent_runs (workspace_id, created_by, prompt, state) values (w, a, 'Get all 3 stores ready for inspection', '{"messages":[]}') returning id into p;
  insert into public.agent_runs (workspace_id, created_by, prompt, parent_run, job_id, store_id) values (w, a, 'Flushing part', p, 'job-1', 'flushing') returning id into c1;
  insert into public.agent_runs (workspace_id, created_by, prompt, parent_run, job_id, store_id, status) values (w, a, 'San Jose part', p, 'job-2', 'sanjose', 'queued') returning id into c2;
  insert into public.agent_runs (workspace_id, created_by, prompt, status) values (w, a, 'Something else', 'running') returning id into other;
  res := res || jsonb_build_object('a store run waits its turn as queued', (select status from public.agent_runs where id = c2) = 'queued');
  update public.agent_runs set status = 'waiting' where id = p;
  res := res || jsonb_build_object('the run that split it can wait', (select status from public.agent_runs where id = p) = 'waiting');
  begin update public.agent_runs set status = 'paused' where id = p; ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('no other status', ok);
  begin update public.agent_runs set job_id = repeat('x', 81) where id = c1; ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a job id is short', ok);
  begin update public.agent_runs set parent_run = c1 where id = c1; ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a run is never its own store run', ok);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.poll_agent_run(p); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a stranger cannot see the stores', ok);
  begin perform public.stop_agent_run(p); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a stranger cannot stop them', ok);
  res := res || jsonb_build_object('a stranger lists none of them', (select count(*) from public.agent_runs where workspace_id = w) = 0);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.poll_agent_run(p);
  res := res || jsonb_build_object('polling shows each store run and where it stands',
    j->>'status' = 'waiting' and jsonb_array_length(j->'children') = 2 and j->'children'->0->>'store_id' = 'flushing' and j->'children'->1->>'status' = 'queued' and not (j ? 'state'));
  j := public.poll_agent_run(c1);
  res := res || jsonb_build_object('a store run names its parent, job and store', j->>'parent_run' = p::text and j->>'job_id' = 'job-1' and j->>'store_id' = 'flushing');
  res := res || jsonb_build_object('members read the store columns', (select count(*) from public.agent_runs where parent_run = p and job_id is not null and store_id is not null) = 2);
  perform public.stop_agent_run(p);
  execute 'reset role';
  res := res || jsonb_build_object('stopping the split run stops its stores too', (select array_agg(status order by created_at) from public.agent_runs where id in (p, c1, c2)) = array['stopped', 'stopped', 'stopped']);
  res := res || jsonb_build_object('and nothing else', (select status from public.agent_runs where id = other) = 'running');
  -- this month's numbers count the requests (the split one and the other), not the stores' runs
  res := res || jsonb_build_object('a store run is not a request of its own in the month''s numbers', (public.odelia_month_of(w, current_date)->>'runs_count')::int = 2);
  res := res || jsonb_build_object('nor in the totals across workspaces', (public.odelia_month_across(array[w], current_date)->'totals'->>'runs')::int = 2);
  delete from public.agent_runs where id = p;
  res := res || jsonb_build_object('store runs go with the run that split them', not exists (select 1 from public.agent_runs where id in (c1, c2)));
  raise exception 'TEST_RESULTS %', res;
end $test$;
