-- The network (20261016110000_network_learning.sql): lessons go live on a second business (since
-- 20261022150000_agent_security.sql an official source alone no longer makes one live),
-- retire on contradictions, count each business once, and agency decisions are queued. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  w1 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid(); w3 uuid := gen_random_uuid();
  l1 uuid; l2 uuid; l3 uuid; f uuid; v jsonb; res jsonb := '{}'::jsonb; ok boolean; i int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'n1@t.test', now(), now(), now(), '{}', '{}'),
    (inst, b, 'authenticated', 'authenticated', 'n2@t.test', now(), now(), now(), '{}', '{}'),
    (inst, c, 'authenticated', 'authenticated', 'n3@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (b, 'email'), (c, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w1, 'N1', now(), a, a), (w2, 'N2', now(), b, b), (w3, 'N3', now(), c, c);
  insert into public.workspace_members (workspace_id, user_id, role) values (w1, a, 'owner'), (w2, b, 'owner'), (w3, c, 'owner');

  -- one business: a candidate; the same lesson from a second: live; the first again changes nothing
  l1 := public.lesson_add(w1, 'agency', 'agency:santa-clara-county-environmental-health', 'Plan check goes back when the equipment list has no spec sheets.', '设备清单缺少规格书时图纸审查会被退回。', null, false);
  res := res || jsonb_build_object('one business makes a candidate', (select status = 'candidate' and businesses = 1 from public.odelia_lessons where id = l1));
  perform public.lesson_add(w1, 'agency', 'agency:santa-clara-county-environmental-health', 'Plan check goes back when the equipment list has no spec sheets!', 'x', null, false);
  res := res || jsonb_build_object('the same business counts once', (select status = 'candidate' and businesses = 1 from public.odelia_lessons where id = l1));
  perform public.lesson_add(w2, 'agency', 'agency:santa-clara-county-environmental-health', 'Plan check goes back when the equipment list has no spec sheets.', 'x', null, false);
  res := res || jsonb_build_object('a second business makes it live', (select status = 'live' and businesses = 2 and confirms = 2 from public.odelia_lessons where id = l1));

  -- an official source alone isn't enough: a second business has to confirm it (20261022150000_agent_security.sql)
  l2 := public.lesson_add(w1, 'place', 'place:san-jose-ca', 'File the Business Tax Certificate first; other city permits ask for its number.', 'x', 'https://www.sanjoseca.gov/btc', true);
  res := res || jsonb_build_object('one business with the agency''s own page is still a candidate', (select status = 'candidate' and official from public.odelia_lessons where id = l2));

  -- contradictions retire it; losses in real jobs do too
  perform public.lesson_vote(l2, w2, -1::smallint); perform public.lesson_vote(l2, w3, -1::smallint);
  res := res || jsonb_build_object('two businesses contradicting it retire it', (select status = 'retired' from public.odelia_lessons where id = l2));
  l3 := public.lesson_add(w1, 'form', 'form:sj-sign', 'Sign permits need a scaled elevation drawing of the sign.', 'x', 'https://www.sanjoseca.gov/sign', true);
  perform public.lesson_outcome(array[l3], true);
  res := res || jsonb_build_object('a win is counted', (select wins = 1 and status = 'candidate' from public.odelia_lessons where id = l3));
  for i in 1..5 loop perform public.lesson_outcome(array[l3], false); end loop;
  res := res || jsonb_build_object('a lesson that keeps failing retires', (select status = 'retired' and losses = 5 from public.odelia_lessons where id = l3));

  -- a business can't flood the network
  for i in 1..40 loop perform public.lesson_add(w3, 'pitfall', 'place:flushing-ny', 'Lesson number ' || i || ' about the health department in Queens.', 'x', null, false); end loop;
  res := res || jsonb_build_object('at most 30 votes a day from one business', (select count(*) <= 30 from public.odelia_lesson_votes where workspace_id = w3));

  -- an agency's decision is queued once
  alter table public.filings disable trigger filings_guard;
  insert into public.filings (workspace_id, app_id, title, payload, approved_by, status, requirements_checked, submitted_at) values
    (w1, 'a1', '{"en":"Sign permit","zh":"x"}', '{"official":"sj-sign"}', a, 'submitted', true, now() - interval '9 days') returning id into f;
  update public.filings set status = 'rejected', note = 'The drawing is not to scale.' where id = f;
  update public.filings set note = 'Again.' where id = f;
  alter table public.filings enable trigger filings_guard;
  res := res || jsonb_build_object('a returned filing is queued for the distiller once', (select count(*) = 1 from public.learning_queue where filing_id = f and status = 'rejected'));

  -- what a member sees
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  v := public.network_view(w2, array['agency:santa-clara-county-environmental-health', 'place:san-jose-ca']);
  res := res || jsonb_build_object('a member sees live lessons for their keys, not retired ones', jsonb_array_length(v->'lessons') = 1 and (v->'lessons'->0->>'id')::uuid = l1,
    'the view says how big the network is', (v->>'businesses')::int = 3);
  res := res || jsonb_build_object('signed-in people read only live lessons', not exists (select 1 from public.odelia_lessons where status <> 'live'));
  begin perform public.network_view(w1, array['place:san-jose-ca']); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('nobody reads another workspace''s view', ok);
  begin perform public.lesson_add(w2, 'place', 'place:san-jose-ca', 'A lesson typed straight in from the browser.', 'x', null, true); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('only the server adds lessons', ok);
  begin perform count(*) from public.odelia_lesson_votes; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('who voted is never readable', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);

  -- a business that leaves takes its votes with it
  delete from public.workspaces where id = w2;
  res := res || jsonb_build_object('a deleted business''s votes go and the counts follow', (select businesses = 1 and status = 'candidate' from public.odelia_lessons where id = l1));
  raise exception 'TEST_RESULTS %', res;
end $test$;
