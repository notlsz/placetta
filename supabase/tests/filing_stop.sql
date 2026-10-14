-- Stop: a customer stops a filing before anything leaves; a stopped filing never gets a submit. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); w uuid := gen_random_uuid(); f uuid; g uuid;
  res jsonb := '{}'::jsonb; ok boolean; row public.filings;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@s.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'S', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'sign', '{"en":"Sign","zh":"招牌"}', '{"official":"sj-sign"}') returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'edd', '{"en":"EDD","zh":"EDD"}', '{"official":"ca-de1"}') returning id into g;
  begin perform public.stop_agent_filing(f, 'owner@s.test'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers reach stop only through the file function', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- running on the agency's site, a page filled
  perform public.filing_agent_step(f, '{"en":"On “Applicant”","zh":"在“申请人”页面","kind":"page","ref":"w/proof/f/page-1.jpg"}', '{"channel":"portal","agent_state":"running","status":"in_progress"}');
  perform public.filing_agent_step(f, '{"en":"Filled Business name","zh":"已填写 Business name","kind":"fill","value":"Moonleaf Tea LLC"}');
  select * into row from public.filings where id = f;
  res := res || jsonb_build_object('the log keeps what was entered', row.agent_log->1->>'value' = 'Moonleaf Tea LLC',
    'a page screenshot path stays out of the audit trail', not exists (select 1 from public.audit_log where workspace_id = w and detail->>'en' like 'w/proof/%'));

  row := public.stop_agent_filing(f, 'owner@s.test');
  res := res || jsonb_build_object('stop cancels it', row.status = 'canceled' and row.agent_state = 'failed' and row.handoff_url is null,
    'stop is in the log', row.agent_log->-1->>'kind' = 'stopped',
    'stop is in the audit trail', exists (select 1 from public.audit_log where workspace_id = w and actor = 'you' and action->>'en' like 'Stopped%'),
    'stopping twice is harmless', (public.stop_agent_filing(f, 'owner@s.test')).status = 'canceled');
  begin perform public.filing_agent_step(f, '{"en":"Pressed Submit","zh":"点击提交","kind":"submit"}', jsonb_build_object('submit_clicked_at', now())); ok := false;
  exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('a stopped filing can never be submitted', ok and (select submit_clicked_at is null from public.filings where id = f));
  begin perform public.filing_agent_step(f, null, '{"status":"submitted"}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor marked submitted', ok);

  -- once the submit is written, it's too late
  perform public.filing_agent_step(g, '{"en":"Pressed Submit","zh":"点击提交","kind":"submit"}', jsonb_build_object('channel', 'portal', 'agent_state', 'running', 'status', 'in_progress', 'submit_clicked_at', now()));
  begin perform public.stop_agent_filing(g, 'owner@s.test'); ok := false; exception when others then ok := sqlerrm like 'too_late%'; end;
  res := res || jsonb_build_object('after the submit, stop is refused', ok and (select status from public.filings where id = g) = 'in_progress');
  raise exception 'TEST_RESULTS %', res;
end $test$;
