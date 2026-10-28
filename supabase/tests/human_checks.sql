-- Human checks (migration 20261102090200_human_checks): a visible CAPTCHA goes to the Placetta team first. The filer opens
-- a check only for its own running filing, with its run token and the worker's own live view; staff with two-step
-- sign-in open it (audited: who, when, which filing) and the live address leaves only that way; a solve by staff is
-- "Solved a human check for you" in the owner's audit trail; staff can pass it to the owner; nobody else reads or calls
-- any of it; the stuck-run sweep leaves a held browser alone and ends checks past their hold.
-- Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  s uuid := gen_random_uuid(); o uuid := gen_random_uuid(); o2 uuid := gen_random_uuid(); inst uuid := '00000000-0000-0000-0000-000000000000';
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); f uuid; f2 uuid; fo uuid; tf text; tf2 text; tfo text;
  hc uuid; hc2 uuid; hco uuid; esc timestamptz; ok boolean; res jsonb := '{}'::jsonb; n int; u text; st text; op timestamptz;
  live text := 'https://placetta-filer.onrender.com/live/' || repeat('A', 32);
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, s, 'authenticated', 'authenticated', 'staff@human.test', now(), now(), now(), '{}', '{}'),
    (inst, o, 'authenticated', 'authenticated', 'owner@human.test', now(), now(), now(), '{}', '{}'),
    (inst, o2, 'authenticated', 'authenticated', 'other@human.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (s, 'email'), (o, 'email'), (o2, 'email');
  insert into public.staff_emails (email) values ('staff@human.test') on conflict do nothing;
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Acme', now(), o, o), (w2, 'Other', now(), o2, o2);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w2, o2, 'owner');
  insert into public.filings (workspace_id, app_id, title, payload, portal_url) values (w, 'llc', '{"en":"LLC","zh":"LLC"}', '{"official":"ca-llc-1"}', 'https://bizfileonline.sos.ca.gov/forms') returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"official":"irs-ss4"}') returning id into f2;
  insert into public.filings (workspace_id, app_id, title, payload) values (w2, 'llc', '{"en":"Other LLC","zh":"x"}', '{"official":"ca-llc-1"}') returning id into fo;
  update public.filings set agent_state = 'running', channel = 'portal' where id in (f, fo);

  -- the team's hours: weekdays, 9 am New York to 6 pm Los Angeles
  res := res || jsonb_build_object(
    'a Tuesday noon in New York is in the team''s hours (15 minutes)', public.human_check_escalate_at('2026-11-03 17:00+00') = '2026-11-03 17:15+00'::timestamptz,
    '8 am in New York is not', public.human_check_escalate_at('2026-11-03 13:00+00') = '2026-11-03 13:00+00'::timestamptz,
    '5:30 pm in Los Angeles still is', public.human_check_team_hours('2026-11-04 01:30+00'),
    '6:30 pm in Los Angeles is not (at once to the owner)', public.human_check_escalate_at('2026-11-04 02:30+00') = '2026-11-04 02:30+00'::timestamptz,
    'a Saturday is not', not public.human_check_team_hours('2026-11-07 18:00+00'));

  -- who may call what
  res := res || jsonb_build_object(
    'signed-in users cannot open a check as the filer', not has_function_privilege('authenticated', 'public.filer_human_check_open(uuid, text, timestamptz)', 'execute'),
    'anon cannot take one', not has_function_privilege('anon', 'public.human_check_take(uuid)', 'execute'),
    'nobody but the server ends one directly', not has_function_privilege('authenticated', 'public.human_check_end(uuid, text)', 'execute')
      and not has_function_privilege('placetta_filer', 'public.human_check_end(uuid, text)', 'execute'),
    'the filer has its three functions', has_function_privilege('placetta_filer', 'public.filer_human_check_open(uuid, text, timestamptz)', 'execute')
      and has_function_privilege('placetta_filer', 'public.filer_human_check(uuid)', 'execute') and has_function_privilege('placetta_filer', 'public.filer_human_check_close(uuid, text)', 'execute'),
    'the filer has no table access to it', not has_table_privilege('placetta_filer', 'public.human_checks', 'select'),
    'nobody may select the live address', not has_column_privilege('authenticated', 'public.human_checks', 'live_url', 'select')
      and not has_column_privilege('anon', 'public.human_checks', 'live_url', 'select'),
    'row level security is on', (select relrowsecurity from pg_class where oid = 'public.human_checks'::regclass));

  -- the filer, with the run's token for f
  tf := public.filer_begin_run(f);
  tfo := public.filer_begin_run(fo);
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  execute 'set local role placetta_filer';
  begin perform public.filer_human_check_open(f, 'https://evil.example/steal', now() + interval '20 minutes'); ok := false; exception when others then ok := sqlerrm ~ 'live_url_invalid'; end;
  res := res || jsonb_build_object('only the worker''s own live view of the page', ok);
  begin perform public.filer_human_check_open(f, 'https://www.browserbase.com/devtools/inspector.html?wss=x', now()); ok := false; exception when others then ok := sqlerrm ~ 'live_url_invalid'; end;
  res := res || jsonb_build_object('never a hosted browser''s whole session', ok);
  begin perform public.filer_human_check_open(f2, live, now()); ok := false; exception when others then ok := sqlerrm ~ 'filing_not_running'; end;
  res := res || jsonb_build_object('not for a filing that isn''t running', ok);
  begin perform public.filer_human_check_open(fo, live, now()); ok := false; exception when others then ok := sqlerrm ~ 'run_token_invalid'; end;
  res := res || jsonb_build_object('not for another run''s filing', ok);
  select check_id, escalates_at into hc, esc from public.filer_human_check_open(f, live, now() + interval '20 minutes');
  res := res || jsonb_build_object('a check is opened for the run''s filing', hc is not null);
  select check_id into hc2 from public.filer_human_check_open(f, live, now() + interval '20 minutes');
  execute 'reset role';
  res := res || jsonb_build_object('it goes to the owner on the team''s clock', esc = public.human_check_escalate_at(now()));
  res := res || jsonb_build_object(
    'a second one ends the first', (select state from public.human_checks where id = hc) = 'ended' and (select closed_at from public.human_checks where id = hc) is not null,
    'in the team''s hours it is in the team queue, outside them it isn''t', exists (select 1 from public.team_tasks where kind = 'human_check' and dedupe = 'human_check:' || hc2 and done_at is null and title like 'Solve a human check on bizfileonline.sos.ca.gov for Acme%')
      = (select escalate_at > created_at from public.human_checks where id = hc2),
    'a check is held at most 30 minutes', (select hold_until <= now() + interval '30 minutes' from public.human_checks where id = hc2));
  -- the task exists for the rest of the test whatever the hour
  insert into public.team_tasks (kind, filing_id, workspace_id, title, detail, dedupe)
  values ('human_check', f, w, 'Solve a human check', jsonb_build_object('human_check_id', hc2), 'human_check:' || hc2) on conflict (dedupe) do nothing;

  -- staff open it: two-step sign-in, the audit row, then the address
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin u := public.human_check_take(hc2); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('the owner can''t take it from the team queue', ok);
  select count(*) into n from public.human_checks;
  res := res || jsonb_build_object('customers read no checks, not even their own', n = 0);
  begin perform live_url from public.human_checks; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('and never the live address', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin u := public.human_check_take(hc2); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('staff without two-step sign-in can''t open it', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  begin u := public.human_check_take(hc); ok := false; exception when others then ok := sqlerrm ~ 'human_check_closed'; end;
  res := res || jsonb_build_object('an ended check can''t be opened', ok);
  u := public.human_check_take(hc2);
  select count(*) into n from public.human_checks where id = hc2;
  begin perform live_url from public.human_checks; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('staff with two-step sign-in get the live view', u = live,
    'staff list checks, without the address', n = 1 and ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object(
    'opening it is in the owner''s audit trail: who, when, which filing', exists (select 1 from public.audit_log where workspace_id = w and actor = 'team' and actor_id = s
      and action ->> 'en' = 'Opened the live browser to solve a human check for you' and detail ->> 'filing_id' = f::text and detail ->> 'human_check_id' = hc2::text),
    'it records who opened it and when', (select opened_by = s and opened_at is not null from public.human_checks where id = hc2));

  -- the worker sees it opened, then the page clears: solved
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  execute 'set local role placetta_filer';
  select h.check_state, h.opened into st, op from public.filer_human_check(hc2) h;
  res := res || jsonb_build_object('the worker sees it opened', st = 'waiting' and op is not null);
  perform set_config('request.headers', json_build_object('x-filer-run', tfo)::text, true);
  select count(*) into n from public.filer_human_check(hc2);
  begin perform public.filer_human_check_close(hc2, 'solved'); ok := false; exception when others then ok := sqlerrm ~ 'run_token_invalid'; end;
  res := res || jsonb_build_object('another run can neither read nor close it', n = 0 and ok);
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  ok := public.filer_human_check_close(hc2, 'solved');
  res := res || jsonb_build_object('the run closes it as solved', ok, 'only once', not public.filer_human_check_close(hc2, 'solved'));
  execute 'reset role';
  res := res || jsonb_build_object(
    'the owner reads "Solved a human check for you", by the person who opened it', exists (select 1 from public.audit_log where workspace_id = w and actor = 'team' and actor_id = s
      and action ->> 'en' = 'Solved a human check for you' and action ->> 'zh' = '为您完成了一次真人验证' and object ->> 'en' = 'LLC' and detail ->> 'filing_id' = f::text),
    'its team task is done', (select done_at is not null and done_by = s from public.team_tasks where dedupe = 'human_check:' || hc2));

  -- staff pass one to the owner; nobody opened it, so no solve is credited to anyone
  perform set_config('request.headers', json_build_object('x-filer-run', tf)::text, true);
  execute 'set local role placetta_filer';
  select check_id into hc from public.filer_human_check_open(f, live, now() + interval '20 minutes');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  ok := public.human_check_pass(hc);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  execute 'set local role placetta_filer';
  select check_state into st from public.filer_human_check(hc);
  res := res || jsonb_build_object('staff pass it to the owner and the worker sees it', ok and st = 'to_owner',
    'the worker closes it for the owner', public.filer_human_check_close(hc, 'to_owner'),
    'a pass can''t become a solve', not public.filer_human_check_close(hc, 'solved'));
  execute 'reset role';
  select count(*) into n from public.audit_log where workspace_id = w and action ->> 'en' = 'Solved a human check for you';
  res := res || jsonb_build_object('one solve in the audit trail, not two', n = 1);

  -- the sweep: a held browser is left alone; a check past its hold ends
  select check_id into hco from public.filer_human_check_open(fo, live, now() + interval '20 minutes');
  alter table public.filings disable trigger filings_guard;
  update public.filings set provider_ref = 'held-until:' || (now() + interval '10 minutes')::text, updated_at = now() - interval '20 minutes' where id = fo;
  alter table public.filings enable trigger filings_guard;
  perform public.requeue_stuck_filings();
  res := res || jsonb_build_object('a running filing whose browser is held for the team isn''t requeued', (select agent_state from public.filings where id = fo) = 'running');
  update public.human_checks set hold_until = now() - interval '1 minute' where id = hco;
  alter table public.filings disable trigger filings_guard;
  update public.filings set provider_ref = 'held-until:' || (now() - interval '1 minute')::text, updated_at = now() - interval '20 minutes' where id = fo;
  alter table public.filings enable trigger filings_guard;
  perform public.requeue_stuck_filings();
  res := res || jsonb_build_object('a check past its hold ends with its task', (select state = 'ended' and closed_at is not null from public.human_checks where id = hco)
      and not exists (select 1 from public.team_tasks where dedupe = 'human_check:' || hco and done_at is null),
    'and once the hold is over the stuck run is requeued as before', (select agent_state from public.filings where id = fo) = 'queued');

  raise exception 'TEST_RESULTS %', res;
end $test$;
