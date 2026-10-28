-- Email suppressions (20261104090000): the server adds and refreshes addresses; staff read and lift them; customers and
-- anonymous callers see and change nothing. Run with scripts/test-db.sh (ends by raising TEST_RESULTS).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  cust uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, cust, 'authenticated', 'authenticated', 'mei@supp.test', now(), now(), now(), '{}', '{}'),
    (inst, st, 'authenticated', 'authenticated', 'staff@supp.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (cust, 'email'), (st, 'email');
  insert into public.staff_emails (email) values ('staff@supp.test') on conflict do nothing;

  -- the server (service role): add, then the same address again refreshes it
  execute 'set local role service_role';
  insert into public.email_suppressions (email, reason, detail) values ('gone@bounce.test', 'bounce', 'General 550 5.1.1');
  insert into public.email_suppressions (email, reason, detail) values ('gone@bounce.test', 'complaint', 'abuse')
    on conflict (email) do update set reason = excluded.reason, detail = excluded.detail, last_at = now();
  insert into public.email_suppressions (email, reason) values ('angry@complain.test', 'complaint');
  res := res || jsonb_build_object('the server adds and refreshes an address',
    (select reason from public.email_suppressions where email = 'gone@bounce.test') = 'complaint' and (select count(*) from public.email_suppressions) = 2);
  begin insert into public.email_suppressions (email, reason) values ('Upper@Case.test', 'bounce'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('addresses are kept lower case', ok);
  begin insert into public.email_suppressions (email, reason) values ('x@y.test', 'because'); ok := false; exception when check_violation then ok := true; end;
  res := res || jsonb_build_object('only known reasons', ok);
  execute 'reset role';

  -- a customer sees nothing and changes nothing
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  select count(*) into n from public.email_suppressions;
  res := res || jsonb_build_object('a customer reads no suppressions', n = 0);
  begin insert into public.email_suppressions (email, reason) values ('mei@supp.test', 'manual'); ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('a customer cannot add one', ok);
  delete from public.email_suppressions where email = 'gone@bounce.test';
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('a customer cannot lift one', exists (select 1 from public.email_suppressions where email = 'gone@bounce.test'));

  -- staff (signed in with two steps) read and lift
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  select count(*) into n from public.email_suppressions;
  res := res || jsonb_build_object('staff read the list', n = 2);
  delete from public.email_suppressions where email = 'angry@complain.test';
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  res := res || jsonb_build_object('staff lift a suppression', not exists (select 1 from public.email_suppressions where email = 'angry@complain.test'));

  -- anonymous: nothing at all
  execute 'set local role anon';
  begin perform 1 from public.email_suppressions; ok := false; exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('anon cannot read suppressions', ok);
  execute 'reset role';
  raise exception 'TEST_RESULTS %', res;
end $test$;
