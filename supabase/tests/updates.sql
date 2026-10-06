-- Updates and the monitor key, as each kind of user. Run with scripts/test-db.sh.
do $test$
declare
  a uuid := gen_random_uuid(); z uuid := gen_random_uuid(); w uuid := gen_random_uuid(); res jsonb := '{}'::jsonb; ok boolean; n int;
  inst uuid := '00000000-0000-0000-0000-000000000000';
begin
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (inst, a, 'authenticated', 'authenticated', 'up@t.test', now(), now(), now(), '{}', '{}'),
    (inst, z, 'authenticated', 'authenticated', 'stranger@t.test', now(), now(), now(), '{}', '{}');
  insert into auth.identities (user_id, provider) values (a, 'email'), (z, 'email');
  insert into public.workspaces (id, name, authorized_at, authorized_by, created_by) values (w, 'U', now(), a, a);
  insert into public.workspace_members (workspace_id, user_id, role) values (w, a, 'owner');
  insert into public.updates (workspace_id, kind, title, dedupe) values (w, 'deadline', '{"en":"Fire inspection: due in 3 days","zh":"x"}', 'deadline:a:1');
  begin insert into public.updates (workspace_id, kind, title, dedupe) values (w, 'deadline', '{"en":"again","zh":"x"}', 'deadline:a:1'); ok := false;
  exception when unique_violation then ok := true; end;
  res := res || jsonb_build_object('one update per event', ok,
    'monitor key made', exists (select 1 from vault.decrypted_secrets where name = 'monitor_key' and length(decrypted_secret) = 64),
    'right key accepted', public.monitor_key_ok((select decrypted_secret from vault.decrypted_secrets where name = 'monitor_key')),
    'wrong key refused', not public.monitor_key_ok('x') and not public.monitor_key_ok(repeat('a', 64)));

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', z, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('stranger sees none', (select count(*) from public.updates) = 0,
    'users cannot check the key', not has_function_privilege('authenticated', 'public.monitor_key_ok(text)', 'execute'));
  begin perform public.read_updates(w); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('stranger cannot mark read', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  res := res || jsonb_build_object('member sees them', (select count(*) from public.updates where workspace_id = w) = 1);
  begin insert into public.updates (workspace_id, kind, title, dedupe) values (w, 'team', '{"en":"x","zh":"x"}', 'x'); ok := false;
  exception when insufficient_privilege then ok := true; end;
  res := res || jsonb_build_object('members cannot write updates', ok);
  n := public.read_updates(w);
  res := res || jsonb_build_object('member marks read', n = 1 and (select read_at from public.updates where workspace_id = w) is not null);
  execute 'reset role';
  raise exception 'TEST_RESULTS %', res;
end $test$;
