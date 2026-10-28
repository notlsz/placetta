-- Replicate this store (20261105091500_store_replications.sql): only an owner records the approval, members read
-- their own workspace's records and nobody else's, nobody writes the table directly. Run with scripts/test-db.sh (ends
-- by raising TEST_RESULTS, so nothing is kept).
do $test$
declare
  inst uuid := '00000000-0000-0000-0000-000000000000';
  o uuid := gen_random_uuid(); m uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  w uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; ok boolean; got uuid; n int;
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, o, 'authenticated', 'authenticated', 'owner@rep.test', now(), now(), now(), '{}', '{}'),
    (inst, m, 'authenticated', 'authenticated', 'member@rep.test', now(), now(), now(), '{}', '{}'),
    (inst, eve, 'authenticated', 'authenticated', 'eve@other.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (o, 'email'), (m, 'email'), (eve, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Rep', now(), o, o), (w2, 'Eve', now(), eve, eve);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, o, 'owner'), (w, m, 'member'), (w2, eve, 'owner');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  got := public.store_replication_record(w, 'sanjose', array[' Dallas, TX ', 'Toronto, Canada', 'Dallas, TX', '']);
  res := res || jsonb_build_object('an owner records the approval', got is not null,
    'places trimmed and deduplicated', (select places = array['Dallas, TX', 'Toronto, Canada'] or places = array['Toronto, Canada', 'Dallas, TX'] from public.store_replications where id = got),
    'who approved it is the owner', (select approved_by = o from public.store_replications where id = got));
  begin perform public.store_replication_record(w, 'sanjose', '{}'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('no places, no record', ok);
  begin insert into public.store_replications (workspace_id, source_store, places) values (w, 'x', array['y']); ok := false; exception when others then ok := sqlstate = '42501'; end;
  res := res || jsonb_build_object('nobody writes the table directly', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', m, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.store_replication_record(w, 'sanjose', array['Austin, TX']); ok := false; exception when others then ok := sqlstate = '42501'; end;
  select count(*) into n from public.store_replications;
  res := res || jsonb_build_object('a member can''t record one', ok, 'a member reads the workspace''s record', n = 1);

  perform set_config('request.jwt.claims', json_build_object('sub', eve, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  begin perform public.store_replication_record(w, 'sanjose', array['Austin, TX']); ok := false; exception when others then ok := sqlstate = '42501'; end;
  select count(*) into n from public.store_replications;
  res := res || jsonb_build_object('another business''s owner can''t record one', ok, 'nor read any', n = 0);
  execute 'reset role';
  res := res || jsonb_build_object('anon can''t call it', not has_function_privilege('anon', 'public.store_replication_record(uuid, text, text[])', 'execute'),
    'row level security is on', (select relrowsecurity from pg_class where oid = 'public.store_replications'::regclass));
  raise exception 'TEST_RESULTS %', res;
end $test$;
