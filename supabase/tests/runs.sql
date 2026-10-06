-- Agent runs, as each kind of user. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); z uuid := gen_random_uuid(); w uuid := gen_random_uuid(); r uuid; res jsonb := '{}'::jsonb; ok boolean; j jsonb;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'run@t.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'other@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (z, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'R', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  insert into public.agent_runs (workspace_id, created_by, prompt, state) values (w, a, 'Map every license', '{"messages":[]}') returning id into r;
  insert into public.updates (workspace_id, kind, title, dedupe) values (w, 'agent', '{"en":"Placetta finished","zh":"x"}', 'agent:1');
  res := res || jsonb_build_object('agent updates allowed', true);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.poll_agent_run(r); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('stranger cannot poll', ok);
  begin perform public.stop_agent_run(r); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('stranger cannot stop', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.poll_agent_run(r);
  res := res || jsonb_build_object('member polls', j->>'status' = 'running' and not (j ? 'state'));
  begin perform (select state from public.agent_runs where id = r); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('conversation stays on the server', ok);
  res := res || jsonb_build_object('member lists runs', (select count(*) from public.agent_runs where workspace_id = w) = 1);
  begin insert into public.agent_runs (workspace_id, created_by, prompt) values (w, a, 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot start runs directly', ok);
  perform public.stop_agent_run(r);
  execute 'reset role';
  res := res || jsonb_build_object('poll marks seen', (select seen_at from public.agent_runs where id = r) is not null,
    'member stops', (select status from public.agent_runs where id = r) = 'stopped');
  raise exception 'TEST_RESULTS %', res;
end $test$;
