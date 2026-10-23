-- A workspace's retention period for Odelia's conversations (20261028110000_workspace_retention): only an owner sets
-- it, it is audited, and the daily purge clears that workspace's finished conversations and texts older than it, and
-- nothing else (running work, recent work, other workspaces, the costs). Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); ad uuid := gen_random_uuid(); bo uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; old1 uuid; new1 uuid; run1 uuid; old2 uuid;
  as_user text := 'set local role authenticated';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@keep.test', now(), now(), now(), '{}', '{}'),
    (inst, ad, 'authenticated', 'authenticated', 'admin@keep.test', now(), now(), now(), '{}', '{}'),
    (inst, bo, 'authenticated', 'authenticated', 'owner@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (ad, 'email'), (bo, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values
    (w1, 'Keep Tea', now(), o, o, '{}'), (w2, 'Other Noodle', now(), bo, bo, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, o, 'owner'), (w1, ad, 'admin'), (w2, bo, 'owner');

  insert into public.agent_runs (workspace_id, created_by, prompt, status, steps, reply, cost_usd, updated_at)
    values (w1, o, 'old secret question', 'done', '[{"en":"s"}]', '{"en":"old secret answer"}', 0.01, now() - interval '40 days') returning id into old1;
  insert into public.agent_runs (workspace_id, created_by, prompt, status, reply, updated_at)
    values (w1, o, 'recent question', 'done', '{"en":"recent answer"}', now() - interval '5 days') returning id into new1;
  insert into public.agent_runs (workspace_id, created_by, prompt, status, updated_at)
    values (w1, o, 'still running', 'running', now() - interval '40 days') returning id into run1;
  insert into public.agent_runs (workspace_id, created_by, prompt, status, reply, updated_at)
    values (w2, bo, 'other workspace question', 'done', '{"en":"other answer"}', now() - interval '40 days') returning id into old2;
  insert into public.odelia_messages (user_id, workspace_id, direction, channel, body, created_at) values
    (o, w1, 'in', 'sms', 'old text', now() - interval '40 days'), (o, w1, 'in', 'sms', 'new text', now()), (bo, w2, 'in', 'sms', 'other old text', now() - interval '40 days');

  execute as_user;
  perform set_config('request.jwt.claims', json_build_object('sub', ad, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('anyone on the workspace reads the setting', public.retention_get(w1)->>'run_days' is null);
  begin perform public.retention_set(w1, 30); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an admin can''t change it', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', bo, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.retention_set(w1, 30); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t change it', ok);
  begin perform public.retention_get(w1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace''s owner can''t read it', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.retention_set(w1, 7); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('only 30, 90, 180 or 365 days', ok);
  j := public.retention_set(w1, 30);
  res := res || jsonb_build_object('the owner sets 30 days', (j->>'run_days')::int = 30);
  begin perform public.retention_purge(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('people can''t run the purge', ok);

  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  j := public.purge_expired();
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('the purge reports what the period removed', (j->'retention'->>'conversations')::int = 1 and (j->'retention'->>'texts_and_calls')::int = 1,
    'an old finished conversation loses its words', (select prompt !~ 'secret' and reply is null and steps = '[]'::jsonb from public.agent_runs where id = old1),
    'and keeps its cost', (select cost_usd = 0.01 from public.agent_runs where id = old1),
    'a recent one is kept', (select prompt = 'recent question' and reply->>'en' = 'recent answer' from public.agent_runs where id = new1),
    'running work is kept', (select prompt = 'still running' from public.agent_runs where id = run1),
    'another workspace without a period is kept', (select prompt = 'other workspace question' and reply->>'en' = 'other answer' from public.agent_runs where id = old2),
    'old texts go, new ones and other workspaces'' stay', not exists (select 1 from public.odelia_messages where body = 'old text')
      and exists (select 1 from public.odelia_messages where body = 'new text') and exists (select 1 from public.odelia_messages where body = 'other old text'),
    'the change is in the audit trail', exists (select 1 from public.audit_log where workspace_id = w1 and action->>'en' = 'Changed how long conversations are kept' and object->>'en' = 'Placetta''s default to 30 days'));
  -- back to the default
  execute as_user;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('the owner can go back to the default', public.retention_set(w1, null)->>'run_days' is null);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
