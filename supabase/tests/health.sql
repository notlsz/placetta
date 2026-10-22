-- Agent health: run timing and tool counts, saver mode on each AI call, the staff-only numbers and replay, the
-- incident log (public entries only on the trust page) and the weekly governance summary. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); wt uuid := gen_random_uuid(); wmix uuid := gen_random_uuid();
  r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; e1 bigint; e2 bigint; iid uuid;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, st, 'authenticated', 'authenticated', 'staff@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'owner@tea.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'owner@noodle.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (st, 'email'), (a, 'email'), (b, 'email');
  insert into public.staff_emails (email) values ('staff@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values
    (w, 'Lucky Leaf Tea', now(), a, a), (w2, 'Quiet Noodle', now(), b, b), (wt, 'Placetta team', now(), st, st), (wmix, 'Tea, with the team', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w2, b, 'owner'), (wt, st, 'owner'), (wmix, a, 'owner'), (wmix, st, 'member');
  insert into public.billing (workspace_id, comped) values (w, true), (w2, true), (wt, true), (wmix, true);

  -- a run: words after 4 seconds, done after 30
  insert into public.agent_runs (id, workspace_id, created_by, prompt, status, created_at, updated_at) values (r1, w, a, 'Map my permits', 'running', now() - interval '30 seconds', now() - interval '30 seconds');
  update public.agent_runs set steps = '[{"state":"searching","label":{"en":"Reading your workspace","zh":"读取您的工作区"}}]' where id = r1;
  res := res || jsonb_build_object('steps alone aren''t a reply', (select first_text_at is null from public.agent_runs where id = r1));
  update public.agent_runs set draft = 'Here is your plan' where id = r1;
  res := res || jsonb_build_object('the first words set the first reply time', (select first_text_at is not null and done_at is null from public.agent_runs where id = r1));
  update public.agent_runs set first_text_at = created_at + interval '4 seconds' where id = r1;
  -- its trace (20261023110000_run_trace), saved by agent-run when it ends; one too long is dropped, never cut
  perform public.agent_run_trace(r1, '[{"k":"model","n":"plan","at":0,"ms":900,"in":200,"read":800,"out":120,"usd":0.0012},{"k":"tool","n":"check_progress","at":900,"ms":40}]');
  res := res || jsonb_build_object('a trace is saved on its run', (select jsonb_array_length(trace) = 2 from public.agent_runs where id = r1));
  update public.agent_runs set status = 'done', reply = '{"text":[{"en":"Done","zh":"完成"}]}', draft = null where id = r1;
  res := res || jsonb_build_object('finishing sets the done time', (select done_at is not null from public.agent_runs where id = r1),
    'a later save keeps the first reply time', (select first_text_at = created_at + interval '4 seconds' from public.agent_runs where id = r1));
  update public.agent_runs set done_at = created_at + interval '30 seconds' where id = r1;
  -- a second run that failed, with no reply
  insert into public.agent_runs (id, workspace_id, created_by, prompt, status, created_at, updated_at) values (r2, w2, b, 'File my EIN', 'running', now() - interval '2 minutes', now() - interval '2 minutes');
  perform public.agent_run_trace(r2, (select jsonb_agg(jsonb_build_object('k', 'tool', 'n', 'x', 'at', g, 'ms', 1)) from generate_series(1, 151) g));
  res := res || jsonb_build_object('a trace over 150 spans isn''t saved', (select trace is null from public.agent_runs where id = r2));
  update public.agent_runs set status = 'failed', error = 'The agent hit a problem and stopped. Try again.', updated_at = now() where id = r2;   -- agent-run saves updated_at with every write
  res := res || jsonb_build_object('a failed run has no first reply, and ends at its last save', (select first_text_at is null and public.agent_run_end(r) = r.updated_at from public.agent_runs r where id = r2));

  -- its AI calls, priced; the second workspace is in saver mode (a throttle holds)
  insert into public.ai_events (workspace_id, user_id, kind, model, provider, role, cost_usd, at) values (w, a, 'call', 'claude-sonnet', 'anthropic', 'plan', 0.042, now() - interval '20 seconds') returning id into e1;
  insert into public.ai_throttles (workspace_id, reason, spent_usd, until) values (w2, 'outlier', 12, now() + interval '6 hours');
  insert into public.ai_events (workspace_id, user_id, kind, model, provider, role, cost_usd, at) values (w2, b, 'call', 'gemini-flash', 'gemini', 'plan', 0.003, now() - interval '100 seconds') returning id into e2;
  res := res || jsonb_build_object('a call in full mode is marked so', (select saver = false from public.ai_events where id = e1),
    'a call while throttled is marked saver', (select saver from public.ai_events where id = e2));

  -- agent-run reports tools; errors never exceed calls
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform public.agent_run_tools(r1, 8, 1);
  perform public.agent_run_tools(r2, 2, 5);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('tool counts are saved', (select tool_calls = 8 and tool_errors = 1 from public.agent_runs where id = r1),
    'errors are capped at calls', (select tool_errors = 2 from public.agent_runs where id = r2));
  insert into public.odelia_job_checks (workspace_id, run_id, job_id, passed, of) values (w, r1, 'job-1', 3, 3), (w2, r2, 'job-2', 1, 3);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.agent_health(7); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('customers can''t open Agent health', ok);
  begin perform public.agent_health_data(7); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor read its numbers directly', ok);
  begin perform public.agent_run_replay(r1); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor replay a run', ok);
  begin perform public.agent_run_tools(r1, 0, 0); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor change tool counts', ok);
  begin perform public.agent_run_trace(r1, '[]'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('nor write a trace', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  j := public.agent_health(7);
  res := res || jsonb_build_object('two runs this week', (j->'totals'->>'runs')::int = 2, 'one failed', (j->'totals'->>'failed')::int = 1,
    'tool error rate is errors over calls', (j->'totals'->>'tool_error_pct')::numeric = 30.0,
    'first try passed half the jobs', (j->'totals'->>'first_try_pct')::numeric = 50.0,
    'first reply in 4 seconds', (j->'totals'->>'reply_p50_s')::numeric = 4.0, 'done in 30', (j->'totals'->>'done_p50_s')::numeric = 30.0,
    'half the calls in saver mode', (j->'totals'->>'saver_pct')::numeric = 50.0, 'one throttle', (j->'totals'->>'throttles')::int = 1,
    'cost per run is the day''s AI cost over its runs', (j->'totals'->>'cost_per_run_usd')::numeric = 0.0225,
    'seven days listed', jsonb_array_length(j->'by_day') = 7,
    'cost by vendor and model', exists (select 1 from jsonb_array_elements(j->'by_vendor') v where v->>'provider' = 'anthropic' and v->>'model' = 'claude-sonnet' and (v->>'cost_usd')::numeric = 0.042),
    'the slowest run first', j->'slowest'->0->>'id' = r2::text and j->'slowest'->0->>'business' = 'Quiet Noodle',
    'the costliest run, from its workspace''s calls while it ran', j->'costliest'->0->>'id' = r1::text and (j->'costliest'->0->>'cost_usd')::numeric = 0.042);
  j := public.agent_run_replay(r1);
  res := res || jsonb_build_object('a replay has the steps', jsonb_array_length(j->'steps') = 1, 'its calls', jsonb_array_length(j->'calls') = 1,
    'its timing', (j->>'first_reply_at') is not null and (j->>'done_at') is not null, 'and its checks', jsonb_array_length(j->'checks') = 1,
    'and its trace', jsonb_array_length(j->'trace') = 2 and j->'trace'->0->>'n' = 'plan', 'and the run''s token and cache totals', j->'run_tokens' ? 'cache_read');

  -- the incident log
  iid := public.incident_add(now() - interval '2 days', 'Fax confirmations were late', 'Six customers saw "sending" for 3 hours', 'Retry the status check every 10 minutes', true);
  perform public.incident_add(now() - interval '1 day', 'Internal: a staging key was rotated', 'No customer impact', null, false);
  res := res || jsonb_build_object('the team sees every incident', jsonb_array_length(public.incidents_list()->'incidents') = 2);
  begin perform public.incident_add(now(), '', 'x'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an incident says what happened', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.incident_add(now(), 'x', 'y'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('customers can''t add incidents', ok);
  begin perform public.incidents_list(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nor read the full log', ok);
  execute 'set local role anon'; perform set_config('request.jwt.claims', '', true);
  j := public.incident_log_public();
  res := res || jsonb_build_object('the trust page gets the day the log began', (j->>'since')::date = current_date,
    'and only public entries', jsonb_array_length(j->'incidents') = 1 and j->'incidents'->0->>'title' = 'Fax confirmations were late',
    'with no names', j::text not like '%placetta.test%');
  begin perform 1 from public.incidents; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('signed out, the table itself is closed', ok);

  -- the weekly summary: claimed once a week, posted only where everyone is on the team
  execute 'set local role service_role'; perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  res := res || jsonb_build_object('a week is claimed once', public.governance_claim('2026-10-12', public.agent_health_data(7)) and not public.governance_claim('2026-10-12', '{}'));
  perform public.governance_post('2026-10-12', '{"en":"Agent health, week of Oct 12","zh":"Agent 健康周报（10 月 12 日这周）"}', '{"en":"2 runs","zh":"2 次运行"}', 1);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('the team''s own workspace gets the Update', exists (select 1 from public.updates where workspace_id = wt and dedupe = 'governance:2026-10-12'),
    'a customer''s workspace never does', not exists (select 1 from public.updates where workspace_id in (w, w2, wmix) and dedupe like 'governance:%'),
    'the report is kept', (select updates = 1 and emailed_to = 1 and summary ? 'totals' from public.governance_reports where week = '2026-10-12'));
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.governance_claim('2026-10-19', '{}'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers can''t send the summary', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
