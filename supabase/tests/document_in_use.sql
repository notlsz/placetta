-- document_in_use answers only for the workspace's members. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); x uuid := gen_random_uuid(); w uuid := gen_random_uuid();
  res jsonb := '{}'::jsonb; got boolean;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'owner@doc.test', now(), now(), now(), '{}', '{}'),
    (inst, x, 'authenticated', 'authenticated', 'stranger@doc.test', now(), now(), now(), '{}', '{}');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'Doc Tea', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  insert into public.billing (workspace_id, comped) values (w, true);
  insert into public.filings (workspace_id, app_id, title, payload) values (w, 'fse', '{"en":"Permit","zh":"许可"}', jsonb_build_object('official', 'nyc-fse', 'files', jsonb_build_array(w::text || '/lease.pdf')));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  got := public.document_in_use(w, w::text || '/lease.pdf');
  res := res || jsonb_build_object('a member is told the lease is in use', got);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  got := public.document_in_use(w, w::text || '/lease.pdf');
  res := res || jsonb_build_object('someone outside the workspace learns nothing', got = false);
  execute 'reset role'; perform set_config('request.jwt.claims', '', true);
  raise exception 'TEST_RESULTS %', res;
end $test$;
