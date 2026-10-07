-- Agent self-filing: the guard, the queue, requeueing and skills. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; f2 uuid; f3 uuid; got uuid;
  res jsonb := '{}'::jsonb; ok boolean; row public.filings; n int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@f.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@f.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'F', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member');

  -- A customer insert can't preset any agent column.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload, channel, agent_state, agent_log, handoff_url, provider_ref, submit_clicked_at, attempts)
    values (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4"}', 'fax', 'done', '[{"en":"x"}]', 'https://evil.test', 'x', now(), 9)
    returning id into f;
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  select * into row from public.filings where id = f;
  res := res || jsonb_build_object('insert resets agent columns',
    row.channel is null and row.agent_state is null and row.agent_log = '[]'::jsonb and row.handoff_url is null
    and row.provider_ref is null and row.submit_clicked_at is null and row.attempts = 0);

  -- The agent (service role, no user) moves it along.
  perform public.filing_agent_step(f, '{"en":"Checked against the agency''s requirements","zh":"已按机构要求核对","kind":"check"}',
    '{"channel":"portal","agent_state":"needs_you","requirements_checked":true,"status":"in_progress","handoff_url":"https://live.example/s/1"}');
  select * into row from public.filings where id = f;
  res := res || jsonb_build_object('agent step logs and patches',
    jsonb_array_length(row.agent_log) = 1 and row.agent_state = 'needs_you' and row.status = 'in_progress' and row.agent_started_at is null,
    'agent step writes an agent audit row',
    exists (select 1 from public.audit_log where workspace_id = w and actor = 'agent' and action->>'en' like 'Checked%'),
    'agent start reads as Placetta',
    exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Placetta started the filing'));
  begin perform public.filing_agent_step(f, null, '{"payload":{}}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('agent step refuses unknown fields', ok);
  begin perform public.filing_agent_step(f, null, '{"handoff_url":"http://x.test"}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('handoff link must be https', ok);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin update public.filings set agent_state = 'done' where id = f; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('owner cannot mark done', ok);
  begin update public.filings set agent_state = 'queued', handoff_url = null where id = f; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('carry on cannot touch other agent columns', ok);
  begin update public.filings set agent_state = 'queued', status = 'canceled' where id = f; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('carry on keeps the status', ok);
  update public.filings set agent_state = 'queued' where id = f;
  res := res || jsonb_build_object('owner carries on', (select agent_state from public.filings where id = f) = 'queued');
  begin perform public.claim_agent_filing(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot claim', ok);
  begin perform public.filing_agent_step(f, '{"en":"x"}'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot write agent steps', ok);
  begin perform public.requeue_stuck_filings(); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('users cannot requeue', ok);
  begin insert into public.agent_skills (key, name) values ('portal:x:y', 'x'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('users cannot write shared skills', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- Claim, and the payload still can't change.
  select id into got from public.claim_agent_filing();
  select * into row from public.filings where id = f;
  res := res || jsonb_build_object('worker claims the queued portal filing', got = f and row.agent_state = 'running' and row.attempts = 1);
  res := res || jsonb_build_object('nothing else to claim', not exists (select 1 from public.claim_agent_filing()));
  begin update public.filings set payload = '{"official":"irs-ss4","x":1}' where id = f; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('approved payload stays frozen', ok);

  -- Submit time is written once.
  perform public.filing_agent_step(f, '{"en":"Pressed Submit","zh":"点击提交","kind":"submit"}', jsonb_build_object('submit_clicked_at', now()));
  begin update public.filings set submit_clicked_at = now() + interval '1 hour' where id = f; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('submit time never changes', ok);

  -- A stuck run that pressed submit goes to the team, not the queue.
  alter table public.filings disable trigger filings_guard;
  update public.filings set updated_at = now() - interval '20 minutes' where id = f;
  alter table public.filings enable trigger filings_guard;
  n := public.requeue_stuck_filings();
  select * into row from public.filings where id = f;
  res := res || jsonb_build_object('stuck run after submit goes to the team', row.agent_state = 'handoff' and row.channel = 'team'
    and exists (select 1 from public.team_tasks where filing_id = f and kind = 'check_agency'));

  -- A second filing, stuck before submit: requeued, then handed over after 3 tries.
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"official":"ca-llc1"}', a) returning id into f2;
  perform public.filing_agent_step(f2, null, '{"channel":"portal","agent_state":"queued","requirements_checked":true}');
  perform public.claim_agent_filing();
  alter table public.filings disable trigger filings_guard;
  update public.filings set updated_at = now() - interval '20 minutes' where id = f2;
  alter table public.filings enable trigger filings_guard;
  perform public.requeue_stuck_filings();
  res := res || jsonb_build_object('stuck run before submit is requeued', (select agent_state from public.filings where id = f2) = 'queued');
  alter table public.filings disable trigger filings_guard;
  update public.filings set agent_state = 'running', attempts = 3, updated_at = now() - interval '20 minutes' where id = f2;
  alter table public.filings enable trigger filings_guard;
  perform public.requeue_stuck_filings();
  res := res || jsonb_build_object('after 3 tries the team takes it', (select agent_state = 'handoff' and channel = 'team' from public.filings where id = f2)
    and exists (select 1 from public.team_tasks where filing_id = f2 and kind = 'handoff'));

  -- A fax waiting on delivery isn't treated as lost.
  insert into public.filings (workspace_id, app_id, title, payload, approved_by) values (w, 'fax', '{"en":"SS-4","zh":"SS-4"}', '{"official":"irs-ss4"}', a) returning id into f3;
  perform public.filing_agent_step(f3, null, jsonb_build_object('channel','fax','agent_state','running','submit_clicked_at', now()));
  alter table public.filings disable trigger filings_guard;
  update public.filings set updated_at = now() - interval '2 hours' where id = f3;
  alter table public.filings enable trigger filings_guard;
  perform public.requeue_stuck_filings();
  res := res || jsonb_build_object('fax waiting on delivery is left alone', (select agent_state from public.filings where id = f3) = 'running');

  -- Agent submission wording.
  perform public.filing_agent_step(f3, '{"en":"Fax delivered","zh":"传真已送达","kind":"submitted"}', '{"status":"submitted","agent_state":"done","requirements_checked":true,"confirmation_number":"FAX-1"}');
  res := res || jsonb_build_object('agent submission reads Submitted by Placetta',
    exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Submitted by Placetta by fax'),
    'finish time recorded', (select agent_finished_at is not null from public.filings where id = f3));

  -- Skills: shared ones are readable by members, keys are unique per scope.
  insert into public.agent_skills (workspace_id, key, name, body) values (null, 'portal:bizfile.sos.ca.gov:ca-llc1', 'LLC-1 on bizfile', '{"steps":[]}');
  begin insert into public.agent_skills (workspace_id, key, name) values (null, 'portal:bizfile.sos.ca.gov:ca-llc1', 'dup'); ok := false; exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('one shared skill per key', ok);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('members read shared skills', (select count(*) from public.agent_skills) = 1,
    'members cannot see team tasks', (select count(*) from public.team_tasks) = 0);
  begin update public.filings set agent_state = 'queued' where id = f; ok := (select agent_state from public.filings where id = f) <> 'queued'; exception when others then ok := true; end;
  res := res || jsonb_build_object('members cannot change filings', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
