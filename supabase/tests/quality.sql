-- The quality triage queue (migration 20261025100000_quality): findings in once, counted when seen again, staff only.
do $test$
declare
  s uuid := gen_random_uuid(); c uuid := gen_random_uuid(); inst uuid := '00000000-0000-0000-0000-000000000000';
  res jsonb := '{}'::jsonb; n int; q public.qa_findings; ok boolean;
  f jsonb := '[{"kind":"drift","severity":"high","source":"https://a.gov/p","subject":"ca-llc-1","repro":"words gone","fix":"re-read"},
               {"kind":"fee","severity":"medium","source":"https://a.gov/f","subject":"ca-llc-1","repro":"$70 vs $85","fix":"set 85","safe":{"file":"registry","form":"ca-llc-1","field":"fee","from":70,"to":85,"cite":"https://a.gov/f"}}]';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, s, 'authenticated', 'authenticated', 'staff@quality.test', now(), now(), now(), '{}', '{}'),
    (inst, c, 'authenticated', 'authenticated', 'customer@quality.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (s, 'email'), (c, 'email');
  insert into public.staff_emails (email) values ('staff@quality.test') on conflict do nothing;

  n := public.qa_report(f);
  res := res || jsonb_build_object('two findings in', n = 2 and (select count(*) from public.qa_findings) = 2);
  n := public.qa_report(f);
  res := res || jsonb_build_object('seen again: counted, not duplicated', n = 0 and (select seen from public.qa_findings where kind = 'drift') = 2);
  res := res || jsonb_build_object('a high finding is due in a day', (select due_at < now() + interval '25 hours' from public.qa_findings where kind = 'drift'));
  res := res || jsonb_build_object('the safe fix is kept with it', (select safe->>'to' = '85' from public.qa_findings where kind = 'fee'));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  res := res || jsonb_build_object('a customer sees no findings', (select count(*) from public.qa_findings) = 0);
  begin perform public.qa_queue(); ok := false; exception when others then ok := sqlerrm ~ 'team only'; end;
  res := res || jsonb_build_object('and cannot open the queue', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', s, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select * into q from public.qa_queue() limit 1;
  res := res || jsonb_build_object('staff see the high one first', q.kind = 'drift');
  q := public.qa_decide(q.id, 'fixed', 'Updated the proof');
  res := res || jsonb_build_object('staff mark it fixed, with who and when', q.status = 'fixed' and q.decided_by = s and q.note = 'Updated the proof');
  begin perform public.qa_decide(q.id, 'deployed'); ok := false; exception when others then ok := sqlerrm ~ 'status must be'; end;
  res := res || jsonb_build_object('no other status', ok);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  perform public.qa_report(f);
  res := res || jsonb_build_object('a fixed finding seen again reopens', (select status = 'open' from public.qa_findings where kind = 'drift'));

  raise exception 'TEST_RESULTS %', res;
end $test$;
