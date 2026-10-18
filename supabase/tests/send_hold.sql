-- The undo window and "Ask a person". Run with scripts/test-db.sh (ends by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); x uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); f uuid; g uuid; p uuid; k uuid; t1 uuid;
  res jsonb := '{}'::jsonb; ok boolean; row public.filings; n int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@h.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@h.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'stranger@h.test', now(), now(), now(), '{}', '{}'),
    (inst, st, 'authenticated', 'authenticated', 'staff@placetta.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (m, 'email'), (x, 'email'), (st, 'email');
  insert into public.staff_emails (email) values ('staff@placetta.test');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Hold Tea', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member');
  insert into public.billing (workspace_id, comped) values (w, true);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'sign', '{"en":"Sign permit","zh":"招牌许可"}', '{"official":"sj-sign"}') returning id into f;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'edd', '{"en":"EDD","zh":"EDD"}', '{"official":"ca-de1"}') returning id into g;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'portal', '{"en":"Portal","zh":"网站"}', '{"official":"tx-ap201"}') returning id into p;
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'race', '{"en":"Race","zh":"竞争"}', '{"official":"irs-ss4"}') returning id into k;
  begin perform public.filing_hold(f, 10); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers can''t hold a filing themselves', ok);
  begin perform public.undo_held_filing(f, 'owner@h.test'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers reach Undo only through the file function', ok);
  begin perform * from public.filing_release_held(null, true); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('customers can''t release a hold', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- only a running filing is held; a held one waits, and the hold sets when it goes
  begin perform public.filing_hold(f, 10); ok := false; exception when others then ok := sqlerrm like 'filing_changed%'; end;
  res := res || jsonb_build_object('a filing that isn''t running isn''t held', ok);
  perform public.filing_agent_step(f, '{"en":"Checked","zh":"已核对","kind":"check"}', '{"channel":"fax","agent_state":"running","status":"in_progress","requirements_checked":true}');
  row := public.filing_hold(f, 10);
  res := res || jsonb_build_object('held for ten minutes', row.agent_state = 'held' and row.send_after between now() + interval '9 minutes' and now() + interval '11 minutes',
    'the hold is in the log', row.agent_log->-1->>'kind' = 'held' and row.agent_log->-1->>'en' like 'Waiting 10 minutes%',
    'and in the audit trail', exists (select 1 from public.audit_log where workspace_id = w and action->>'en' like 'Waiting 10 minutes%'));
  res := res || jsonb_build_object('nothing is released before its time', (select count(*) from public.filing_release_held()) = 0
    and (select agent_state from public.filings where id = f) = 'held');
  res := res || jsonb_build_object('the portal worker never claims a held filing', not exists (select 1 from public.claim_agent_filing()));

  -- Undo while held: canceled, logged, an Update, and the sweep can't send it after
  row := public.undo_held_filing(f, 'owner@h.test');
  res := res || jsonb_build_object('Undo cancels it', row.status = 'canceled' and row.agent_state = 'failed' and row.send_after is null,
    'Undo is in the log', row.agent_log->-1->>'kind' = 'undone' and row.agent_log->-1->>'ref' = 'owner@h.test',
    'Undo is in the audit trail', exists (select 1 from public.audit_log where workspace_id = w and actor = 'you' and action->>'en' like 'Undid the send%'),
    'Undo is in Updates', exists (select 1 from public.updates where workspace_id = w and dedupe = 'undone:' || f::text and title->>'en' = 'Undone: Sign permit'),
    'Undo twice is harmless', (public.undo_held_filing(f, 'owner@h.test')).status = 'canceled');
  update public.filings set send_after = now() - interval '1 minute' where id = f;
  res := res || jsonb_build_object('an undone filing is never released', (select count(*) from public.filing_release_held()) = 0);
  begin perform public.filing_claim_submit(f, '{"en":"Faxing","zh":"传真","kind":"submit"}', 10); ok := false; exception when others then ok := sqlerrm like 'filing_stopped%'; end;
  res := res || jsonb_build_object('and never claimed for sending', ok);

  -- the time runs out: released once, then Undo is too late
  perform public.filing_agent_step(g, '{"en":"Checked","zh":"已核对","kind":"check"}', '{"channel":"email","agent_state":"running","status":"in_progress","requirements_checked":true}');
  perform public.filing_hold(g, 10);
  update public.filings set send_after = now() - interval '1 second' where id = g;
  select count(*) into n from public.filing_release_held();
  select * into row from public.filings where id = g;
  res := res || jsonb_build_object('a due hold is released to running', n = 1 and row.agent_state = 'running' and row.send_after is null and row.agent_log->-1->>'kind' = 'hold_over',
    'released only once', (select count(*) from public.filing_release_held()) = 0);
  begin perform public.undo_held_filing(g, 'owner@h.test'); ok := false; exception when others then ok := sqlerrm like 'too_late%'; end;
  res := res || jsonb_build_object('Undo after the release is too late', ok and (select status from public.filings where id = g) = 'in_progress');

  -- the portal: released to the queue, where the worker takes it
  perform public.filing_agent_step(p, '{"en":"Checked","zh":"已核对","kind":"check"}', '{"channel":"portal","agent_state":"running","status":"in_progress","requirements_checked":true}');
  perform public.filing_hold(p, 1);
  res := res || jsonb_build_object('the worker waits while it''s held', not exists (select 1 from public.claim_agent_filing()));
  select count(*) into n from public.filing_release_held(p, true);
  res := res || jsonb_build_object('Send now releases a portal filing to the queue', n = 1 and (select agent_state from public.filings where id = p) = 'queued'
    and exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Sent it without waiting'),
    'and the worker claims it', (select count(*) from public.claim_agent_filing()) = 1);

  -- the race: whichever takes the row first wins; the other changes nothing
  perform public.filing_agent_step(k, '{"en":"Checked","zh":"已核对","kind":"check"}', '{"channel":"fax","agent_state":"running","status":"in_progress","requirements_checked":true}');
  perform public.filing_hold(k, 10);
  update public.filings set send_after = now() - interval '1 second' where id = k;
  perform public.undo_held_filing(k, 'owner@h.test');
  select count(*) into n from public.filing_release_held();
  res := res || jsonb_build_object('Undo first: the release finds nothing', n = 0 and (select status from public.filings where id = k) = 'canceled');

  -- Ask a person: owners and members, three a day per workspace, nobody else; the reply goes to Updates
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  t1 := public.ask_person(w, '  Which form for the grease trap?  ', '{"job":"j1","page":"permits"}', 'zh');
  res := res || jsonb_build_object('a member can ask', t1 is not null);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.ask_person(w, 'Is the sign permit right?', '{}', 'en');
  perform public.ask_person(w, 'Third one', '{}', 'en');
  begin perform public.ask_person(w, 'A fourth', '{}', 'en'); ok := false; exception when others then ok := sqlerrm like 'rate_limited%'; end;
  res := res || jsonb_build_object('three a day per workspace', ok);
  begin perform public.ask_person(w, ' ', '{}', 'en'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('an empty question is refused', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.ask_person(w, 'Let me in', '{}', 'en'); ok := false; exception when others then ok := sqlerrm like 'forbidden%'; end;
  res := res || jsonb_build_object('a stranger can''t ask', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.answer_person(t1, 'Hi'); ok := false; exception when others then ok := sqlerrm like '%team only%'; end;
  res := res || jsonb_build_object('a customer can''t answer', ok);
  res := res || jsonb_build_object('customers can''t read the team''s tasks', (select count(*) from public.team_tasks) = 0);
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('the team sees the request', exists (select 1 from public.team_tasks_open() o where o.id = t1 and o.kind = 'ask_person' and o.detail->>'question' = 'Which form for the grease trap?' and o.detail->'context'->>'job' = 'j1'));
  perform public.answer_person(t1, 'Form EH-12, page 2. We filled it in for you.');
  begin perform public.answer_person(t1, 'Again'); ok := false; exception when others then ok := sqlerrm like 'Already answered%'; end;
  res := res || jsonb_build_object('answered once', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('the question is on the task, with who asked', exists (select 1 from public.team_tasks where id = t1 and asked_by = m and lang = 'zh' and title = 'Hold Tea asks: Which form for the grease trap?'),
    'the person was told a human replies', exists (select 1 from public.updates where workspace_id = w and dedupe = 'ask:' || t1::text and kind = 'team' and body->>'en' like 'A person on the Placetta team replies here%'),
    'the reply is in Updates', exists (select 1 from public.updates where workspace_id = w and dedupe = 'ask-reply:' || t1::text and body->>'en' = 'Form EH-12, page 2. We filled it in for you.'),
    'the reply closes the task', exists (select 1 from public.team_tasks where id = t1 and done_at is not null and replied_by = st));
  raise exception 'TEST_RESULTS %', res;
end $test$;
