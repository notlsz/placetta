-- Specialist reviews: owners ask, the team's queue has the one-business-day target, the review shows on the filing
-- with the specialist's first name, and two-key approvals count as reviews. Run with scripts/test-db.sh.
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  st uuid := gen_random_uuid(); st2 uuid := gen_random_uuid(); a uuid := gen_random_uuid(); m uuid := gen_random_uuid(); s uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); f uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; j jsonb; rid uuid; n int; tz text := 'America/New_York';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, st, 'authenticated', 'authenticated', 'mei@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, st2, 'authenticated', 'authenticated', 'ops@placetta.test', now(), now(), now(), '{}', '{}'),
    (inst, a, 'authenticated', 'authenticated', 'owner@tea.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@tea.test', now(), now(), now(), '{}', '{}'),
    (inst, s, 'authenticated', 'authenticated', 'stranger@x.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (st, 'email'), (st2, 'email'), (a, 'email'), (m, 'email'), (s, 'email');
  insert into public.staff_emails (email, first_name) values ('mei@placetta.test', 'Mei'), ('ops@placetta.test', null);
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Lucky Leaf Tea', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner'), (w, m, 'member');
  insert into public.billing (workspace_id, comped) values (w, true);
  -- a filing the team approved in the two-key period (the file function's team_approve)
  insert into public.filings (id, workspace_id, app_id, title, payload, approved_by, status, channel, agent_state, agent_log)
  values (f, w, 'ein', '{"en":"EIN","zh":"EIN"}', '{"fields":[],"checklist":[],"attachments":[],"does":[]}', a, 'submitted', 'fax', 'done',
    jsonb_build_array(jsonb_build_object('at', '2026-10-16T19:20:00Z', 'kind', 'check', 'en', 'Checked against the agency''s requirements', 'zh', '已按机构要求核对'),
                      jsonb_build_object('at', '2026-10-16T20:05:00Z', 'kind', 'two_key_ok', 'en', 'The Placetta team checked it. Sending now.', 'zh', '快哉团队已核对，现在发送。', 'ref', 'mei@placetta.test')));

  -- one business day, New York time
  res := res || jsonb_build_object(
    'Wednesday 10am is due Thursday 10am', public.one_business_day(timestamp '2026-10-14 10:00' at time zone tz) = timestamp '2026-10-15 10:00' at time zone tz,
    'Friday 3pm is due Monday 3pm', public.one_business_day(timestamp '2026-10-16 15:00' at time zone tz) = timestamp '2026-10-19 15:00' at time zone tz,
    'Saturday is due by Monday evening', public.one_business_day(timestamp '2026-10-17 11:00' at time zone tz) = timestamp '2026-10-19 18:00' at time zone tz,
    'Sunday is due by Monday evening', public.one_business_day(timestamp '2026-10-18 23:00' at time zone tz) = timestamp '2026-10-19 18:00' at time zone tz);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.request_specialist_review(w, 'a1', '{"en":"Food service permit","zh":"餐饮服务许可"}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a member can''t ask for a review', ok);
  j := public.specialist_reviews_for(w);
  res := res || jsonb_build_object('the two-key approval shows as a review by Mei', exists (select 1 from jsonb_array_elements(j) x where x->>'app_id' = 'ein' and x->>'kind' = 'two_key' and x->>'reviewer_name' = 'Mei' and (x->>'reviewed_at')::timestamptz = '2026-10-16T20:05:00Z'),
    'members never see the specialist''s email', j::text not like '%placetta.test%');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.request_specialist_review(w, 'a1', '{"en":"Food service permit","zh":"餐饮服务许可"}', 'Is the seating count right?');
  rid := (j->>'id')::uuid;
  res := res || jsonb_build_object('an owner asks for a review', j->>'status' = 'requested',
    'due one business day later', (j->>'due_at')::timestamptz = public.one_business_day((j->>'requested_at')::timestamptz),
    'asking twice keeps one request', (public.request_specialist_review(w, 'a1', '{"en":"Food service permit","zh":"餐饮服务许可"}')->>'id')::uuid = rid);
  begin perform 1 from public.specialist_reviews; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('the table is read only through its functions', ok);
  begin perform public.review_queue(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('owners can''t open the team''s queue', ok);
  for i in 2..5 loop perform public.request_specialist_review(w, 'a' || i, jsonb_build_object('en', 'App ' || i, 'zh', '申请 ' || i)); end loop;
  begin perform public.request_specialist_review(w, 'a6', '{"en":"App 6","zh":"申请 6"}'); ok := false; exception when others then ok := sqlerrm = 'rate_limited'; end;
  res := res || jsonb_build_object('a sixth request in a day waits', ok);
  j := public.specialist_reviews_for(w);
  res := res || jsonb_build_object('the owner sees the request waiting, with its due time', exists (select 1 from jsonb_array_elements(j) x where x->>'app_id' = 'a1' and x->>'status' = 'requested' and x->>'due_at' is not null));

  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.specialist_reviews_for(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('someone outside sees nothing', ok);

  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('asking opens a team task', (select count(*) from public.team_tasks where workspace_id = w and kind = 'review' and done_at is null) = 5,
    'the task names the application', exists (select 1 from public.team_tasks where dedupe = 'specialist:' || rid and title = 'Specialist review asked for: Food service permit'),
    'the audit trail has the request', exists (select 1 from public.audit_log where workspace_id = w and action->>'en' = 'Asked a Placetta specialist to review it'));
  execute 'set local role authenticated';

  -- the team: staff without two-step can't; with it, the queue and the review
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.review_queue(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('staff need two-step for the queue', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  j := public.review_queue();
  res := res || jsonb_build_object('the queue lists the requests, soonest due first', jsonb_array_length(j) = 5 and j->0->>'business' = 'Lucky Leaf Tea' and j->0->>'note' = 'Is the seating count right?');
  begin perform public.review_finish(rid, 'changes_needed', ''); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('changes needed says what', ok);
  j := public.review_finish(rid, 'looks_right', 'Seating count matches the floor plan.');
  res := res || jsonb_build_object('the review records Mei and when', j->>'reviewer_name' = 'Mei' and j->>'reviewed_at' is not null);
  begin perform public.review_finish(rid, 'looks_right'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a review is finished once', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', st2, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  j := public.review_finish((select (x->>'id')::uuid from jsonb_array_elements(public.review_queue()) x where x->>'app_id' = 'a2'), 'looks_right');
  res := res || jsonb_build_object('a specialist with no first name set shows no name', j->>'reviewer_name' is null and j->>'status' = 'done');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  j := public.specialist_reviews_for(w);
  res := res || jsonb_build_object('the owner sees the finished review on the application', exists (select 1 from jsonb_array_elements(j) x where x->>'app_id' = 'a1' and x->>'status' = 'done' and x->>'reviewer_name' = 'Mei' and x->>'outcome' = 'looks_right'));
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('finishing closes the team task', (select done_at is not null from public.team_tasks where dedupe = 'specialist:' || rid),
    'the owner gets an Update', exists (select 1 from public.updates where workspace_id = w and dedupe = 'specialist:' || rid and title->>'en' = 'Food service permit: reviewed by Mei, a Placetta specialist'),
    'the audit trail says the team reviewed it', exists (select 1 from public.audit_log where workspace_id = w and actor = 'team' and action->>'en' = 'A Placetta specialist reviewed it: it looks right'),
    'a new request can follow a finished one', true);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.request_specialist_review(w, 'a1', '{"en":"Food service permit","zh":"餐饮服务许可"}'); ok := false; exception when others then ok := sqlerrm = 'rate_limited'; end;
  res := res || jsonb_build_object('a finished review still counts toward the day''s five', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
