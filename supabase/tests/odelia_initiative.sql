-- Odelia goes first (migration 20261102090100_odelia_initiative): her asks of other people are hers to write and a
-- member's to read, never another workspace's; she asks a specialist only through the server, at most 3 a day, one open
-- per application, and owners see it with its answer-by time. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); eve uuid := gen_random_uuid(); w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int; r jsonb; r2 jsonb; x text;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'olivia@init.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@init.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by, state) values (w, 'Acme Tea', now(), o, o, '{}'), (w2, 'Eve Co', now(), eve, eve, '{}');
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w2, eve, 'owner');

  -- the server records an ask (service role writes)
  insert into public.odelia_chases (workspace_id, key, app_id, item_id, holder, n, to_name, to_email, via, token, day)
  values (w, 'hp:lease', 'hp', 'lease', 'landlord', 1, 'Lena', 'lena@westfieldprops.com', 'odelia_email', 'K7QX9ABC', current_date);
  begin
    insert into public.odelia_chases (workspace_id, key, app_id, item_id, holder, n, via, day) values (w, 'hp:lease', 'hp', 'lease', 'landlord', 1, 'draft', current_date);
    ok := false;
  exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('one row per ask: the same ask can''t be claimed twice', ok);
  begin
    insert into public.odelia_chases (workspace_id, key, app_id, item_id, holder, n, via, token, day) values (w, 'hp:plans', 'hp', 'plans', 'builder', 1, 'odelia_email', 'IO01ABCD', current_date);
    ok := false;
  exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('a reference with look-alike letters is refused', ok);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.odelia_chases where workspace_id = w;
  res := res || jsonb_build_object('a member reads their own workspace''s asks', n = 1);
  begin
    insert into public.odelia_chases (workspace_id, key, app_id, item_id, holder, n, via, day) values (w, 'hp:coi', 'hp', 'coi', 'insurer', 1, 'draft', current_date);
    ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t write an ask', ok);
  begin
    update public.odelia_chases set to_email = 'eve@evil.test' where workspace_id = w;
    get diagnostics n = row_count;
    ok := n = 0;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor change who it went to', ok);
  begin
    r := public.agent_request_specialist_review(w, 'hp', '{"en":"Health permit","zh":"卫生许可"}', 'Is a hearing needed?', 'judgment', 'job-1');
    ok := false;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('an owner can''t ask as Odelia (server only)', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.odelia_chases;
  res := res || jsonb_build_object('another workspace sees none of them', n = 0);
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  begin select count(*) into n from public.odelia_chases; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon reads nothing', ok);
  execute 'reset role';

  -- the server asks a specialist
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  r := public.agent_request_specialist_review(w, 'hp', '{"en":"Health permit","zh":"卫生许可"}', 'The agency''s call needs judgment: is a hearing needed?', 'judgment', 'job-1');
  res := res || jsonb_build_object('the server asks a specialist and gets the answer-by time', (r ->> 'due_at') is not null and (r ->> 'open')::boolean = false);
  r2 := public.agent_request_specialist_review(w, 'hp', '{"en":"Health permit","zh":"卫生许可"}', 'Again?', 'judgment', 'job-1');
  res := res || jsonb_build_object('one open per application: asking again returns it', r2 ->> 'id' = r ->> 'id' and (r2 ->> 'open')::boolean);
  perform public.agent_request_specialist_review(w, 'sp', '{"en":"Sign permit","zh":"招牌许可"}', 'Which form?', 'no_source', null);
  perform public.agent_request_specialist_review(w, 'workspace', '{"en":"Zoning","zh":"分区"}', 'Change of use?', 'judgment', null);
  begin
    perform public.agent_request_specialist_review(w, 'bl', '{"en":"Business license","zh":"营业执照"}', 'Fee?', 'no_source', null);
    ok := false;
  exception when others then ok := sqlerrm = 'rate_limited'; end;
  res := res || jsonb_build_object('at most 3 a day per workspace', ok);
  begin
    perform public.agent_request_specialist_review(w, 'bl', '{"en":"x","zh":"x"}', '  ', 'no_source', null);
    ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('an empty question is refused', ok);
  execute 'reset role';
  select count(*) into n from public.team_tasks where workspace_id = w and kind = 'review' and title like 'Odelia asked a specialist:%';
  res := res || jsonb_build_object('each lands in the team''s queue as Odelia''s', n = 3);
  select count(*) into n from public.specialist_reviews where workspace_id = w and asked_by_agent and requested_by is null and job_id = 'job-1' and reason = 'judgment';
  res := res || jsonb_build_object('marked as hers, with why and the job that waits', n = 1);

  -- the owner sees it, with its due time, like one they asked for
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from jsonb_array_elements(public.specialist_reviews_for(w)) e where e.value ->> 'status' = 'requested' and e.value ->> 'due_at' is not null;
  res := res || jsonb_build_object('the owner sees each with when it''s answered by', n = 3);
  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.specialist_reviews_for(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('another workspace can''t see them', ok);
  execute 'reset role';

  delete from public.workspaces where id = w;
  res := res || jsonb_build_object('a deleted workspace takes its asks with it', not exists (select 1 from public.odelia_chases where workspace_id = w));
  raise exception 'TEST_RESULTS %', res;
end $test$;
